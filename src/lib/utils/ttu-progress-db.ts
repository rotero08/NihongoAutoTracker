/**
 * ── ttu IndexedDB progress reader ────────────────────────────────────────────
 * Reads ttu's OWN authoritative explored-character count straight from the
 * origin's IndexedDB, so the tracker can match ttu's counter EXACTLY (incl.
 * furigana ON, where the geometric extractor undercounts the active line).
 *
 * Schema (ttu-ttu/ebook-reader, db "books", v6 — forks keep the same shape):
 *   lastItem  : out-of-line key 0          -> { dataId }            (open book)
 *   bookmark  : keyPath "dataId"           -> { exploredCharCount, progress, ... }
 *   data      : keyPath "id"               -> { characters, title, lastBookOpen }
 *
 * exploredCharCount is whole-book cumulative (ttu's "8107" in "8107 / 128221").
 * characters is the whole-book total ("128221"). progress is a FRACTION
 * (exploredCharCount / characters) — never reconstruct chars from it.
 *
 * READ-ONLY. Never opens with a version (no upgrade), never writes ttu's DB.
 * IndexedDB is origin-scoped: a content script in the isolated world reads the
 * SAME db the page uses, as long as it runs in that origin's frame (Yomiyasu:
 * the ttu instance is in an iframe, so this must run inside that iframe).
 */

// [TTU-DB-DEBUG] Single gate for temporary logging. REMOVE / keep false to ship.
const TTU_DB_DEBUG = false;
function dlog(...args: any[]) {
    if (TTU_DB_DEBUG) console.log('[ttu-db]', ...args);
}

export interface TtuDbProgress {
    explored: number; // whole-book cumulative explored char count (authoritative)
    total: number;    // whole-book total chars (data.characters); 0 if unknown
    dataId: number;
    title: string;
    ts: number;       // Date.now() of the read that produced this value
}

// Candidate db names. ttu and unmodified forks use "books"; discovery via
// indexedDB.databases() adds any renamed db that exposes a "bookmark" store.
const KNOWN_DB_NAMES = ['books'];
const LAST_ITEM_KEY = 0; // ttu's LAST_ITEM_KEY constant

// If the refresh loop dies, stop trusting a frozen cache after this long so the
// caller falls back to the geometric extractor instead of showing a stale value.
const MAX_CACHE_AGE_MS = 8000;
const REFRESH_INTERVAL_MS = 1000;

let _db: IDBDatabase | null = null;
let _dbName: string | null = null;
let _cache: TtuDbProgress | null = null;
let _refreshTimer: any = null;
let _refreshInFlight = false;
let _started = false;
let _getTitle: (() => string) | null = null;
let _listeners: Array<() => void> = [];

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
    });
}

// Open WITHOUT a version → opens existing db at its current version, never fires
// upgradeneeded, never writes. We only ever open names we've confirmed exist, so
// this can't create a junk empty db.
function openExisting(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        let req: IDBOpenDBRequest;
        try {
            req = indexedDB.open(name);
        } catch (e) {
            reject(e);
            return;
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
        // Defensive: if this ever fired we'd be CREATING the db — abort instead of
        // writing anything.
        req.onupgradeneeded = () => {
            try { req.transaction?.abort(); } catch { /* noop */ }
            reject(new Error('would-create'));
        };
    });
}

async function listCandidateDbNames(): Promise<string[]> {
    const names = new Set<string>();
    try {
        // Firefox dev edition / modern Chromium support indexedDB.databases().
        const anyIdb = indexedDB as any;
        if (typeof anyIdb.databases === 'function') {
            const dbs: Array<{ name?: string }> = await anyIdb.databases();
            for (const d of dbs) if (d && d.name) names.add(d.name);
        }
    } catch (e) {
        dlog('databases() failed', e);
    }
    // Always try the known names too (covers UAs without databases()).
    for (const n of KNOWN_DB_NAMES) names.add(n);
    return Array.from(names);
}

function hasProgressShape(db: IDBDatabase): boolean {
    const s = db.objectStoreNames;
    return s.contains('bookmark') && (s.contains('lastItem') || s.contains('data'));
}

// Find and open the ttu db for THIS origin. Prefers a db that actually has the
// bookmark store; closes anything that doesn't match.
async function resolveDb(): Promise<IDBDatabase | null> {
    if (_db) return _db;
    const candidates = await listCandidateDbNames();
    // Try "books" first if present.
    candidates.sort((a, b) => (a === 'books' ? -1 : b === 'books' ? 1 : 0));
    for (const name of candidates) {
        let db: IDBDatabase | null = null;
        try {
            db = await openExisting(name);
        } catch {
            continue;
        }
        if (hasProgressShape(db)) {
            _db = db;
            _dbName = name;
            // If ttu deletes/recreates the db, drop our handle so we re-resolve.
            db.onclose = () => { if (_db === db) { _db = null; _dbName = null; } };
            db.onversionchange = () => {
                try { db!.close(); } catch { /* noop */ }
                if (_db === db) { _db = null; _dbName = null; }
            };
            dlog('resolved db', name, Array.from(db.objectStoreNames));
            return db;
        }
        try { db.close(); } catch { /* noop */ }
    }
    return null;
}

// Resolve which record is the currently-open book. lastItem(0) is ttu's own
// "last open" pointer; if absent, fall back to the data record with the newest
// lastBookOpen.
async function resolveOpenDataId(db: IDBDatabase): Promise<number | null> {
    if (db.objectStoreNames.contains('lastItem')) {
        try {
            const tx = db.transaction('lastItem', 'readonly');
            const rec: any = await idbReq(tx.objectStore('lastItem').get(LAST_ITEM_KEY as any));
            if (rec && typeof rec.dataId === 'number') return rec.dataId;
        } catch (e) {
            dlog('lastItem read failed', e);
        }
    }
    // Fallback: newest lastBookOpen across the data store.
    if (db.objectStoreNames.contains('data')) {
        try {
            const tx = db.transaction('data', 'readonly');
            const all: any[] = await idbReq(tx.objectStore('data').getAll());
            let best: any = null;
            for (const r of all) {
                if (!r || typeof r.id !== 'number') continue;
                if (!best || (r.lastBookOpen || 0) > (best.lastBookOpen || 0)) best = r;
            }
            if (best) return best.id;
        } catch (e) {
            dlog('data fallback failed', e);
        }
    }
    return null;
}

function normTitle(s: string): string {
    return (s || '').replace(/\s+/g, '').toLowerCase();
}

// One read pass: open book id -> bookmark.exploredCharCount + data.characters.
async function refreshOnce(): Promise<void> {
    if (_refreshInFlight) return;
    _refreshInFlight = true;
    try {
        const db = await resolveDb();
        if (!db) { _cache = null; return; }

        const dataId = await resolveOpenDataId(db);
        if (dataId === null) { _cache = null; return; }

        const tx = db.transaction(
            db.objectStoreNames.contains('data') ? ['bookmark', 'data'] : ['bookmark'],
            'readonly'
        );
        const bookmark: any = await idbReq(tx.objectStore('bookmark').get(dataId as any));

        // Require an explicit explored-char field. Do NOT reconstruct from
        // progress (fraction) × total — that reintroduces the very error we're
        // removing.
        const explored = bookmark ? bookmark.exploredCharCount : undefined;
        if (typeof explored !== 'number' || !isFinite(explored) || explored < 0) {
            _cache = null;
            dlog('no exploredCharCount on bookmark', dataId, bookmark);
            return;
        }

        let total = 0;
        let title = '';
        if (db.objectStoreNames.contains('data')) {
            const data: any = await idbReq(tx.objectStore('data').get(dataId as any));
            if (data) {
                if (typeof data.characters === 'number') total = data.characters;
                if (typeof data.title === 'string') title = data.title;
            }
        }

        // Soft active-book check: only used to REJECT a clearly-wrong record when we
        // have no lastItem pointer. With lastItem present we trust it (an iframe has
        // exactly one open book). Title normalisation differs across forks, so a
        // mismatch only vetoes when both titles are non-empty and share nothing.
        if (_getTitle && title) {
            const want = normTitle(_getTitle());
            const got = normTitle(title);
            if (want && got && want.length > 3 && got.length > 3 &&
                !want.includes(got) && !got.includes(want)) {
                // Mismatch — keep the value but mark via ts; caller still uses lastItem
                // truth. We do NOT drop it here to avoid false negatives on reflowed
                // titles; flip to `_cache = null` if a fork proves to need it.
                dlog('title soft-mismatch', want, got);
            }
        }

        _cache = { explored, total, dataId, title, ts: Date.now() };
        dlog('refresh', _cache);
    } catch (e) {
        dlog('refreshOnce error', e);
        // Keep last cache; MAX_CACHE_AGE_MS will retire it if refreshes stay broken.
    } finally {
        _refreshInFlight = false;
    }
}

function kick() { void refreshOnce(); }

/**
 * Start the reader: resolve the db, prime the cache, and keep it fresh on a
 * short interval plus reader events. Idempotent. `getTitle` is optional and only
 * feeds the soft active-book check.
 */
export function initTtuProgressDb(getTitle?: () => string): void {
    if (_started) return;
    if (typeof indexedDB === 'undefined') return;
    _started = true;
    _getTitle = getTitle || null;

    kick();
    _refreshTimer = setInterval(kick, REFRESH_INTERVAL_MS);

    // Immediate refresh on the events that move ttu's position. ttu fires
    // 'ttsu:page.change' on every page turn (we can't read its cross-world detail,
    // but the event firing is a reliable refresh trigger).
    const add = (target: any, ev: string, opts?: any) => {
        const fn = () => kick();
        target.addEventListener(ev, fn, opts);
        _listeners.push(() => target.removeEventListener(ev, fn, opts));
    };
    if (typeof document !== 'undefined') {
        add(document, 'ttsu:page.change');
        add(document, 'visibilitychange');
        add(document, 'keydown', { passive: true });
    }
    if (typeof window !== 'undefined') {
        add(window, 'wheel', { passive: true });
    }
}

/**
 * Synchronous getter for the tracker's poll. Returns the cached authoritative
 * progress, or null when unavailable / unresolved / stale (caller then uses the
 * geometric fallback with no behaviour change).
 */
export function readTtuDbProgress(): TtuDbProgress | null {
    if (!_cache) return null;
    if (Date.now() - _cache.ts > MAX_CACHE_AGE_MS) return null;
    return _cache;
}

export function disposeTtuProgressDb(): void {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    for (const off of _listeners) { try { off(); } catch { /* noop */ } }
    _listeners = [];
    if (_db) { try { _db.close(); } catch { /* noop */ } _db = null; _dbName = null; }
    _cache = null;
    _started = false;
    _getTitle = null;
}