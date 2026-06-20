/**
 * ── ttu live-progress reader (ISOLATED world, with MAIN-world fallback) ───────
 * Reads ttu's OWN live exploredCharCount — the exact number its UI shows — so the
 * tracker matches ttu at all times, including fast scrolling and WITH the native
 * progress bar hidden (ttu dispatches the event from its reactive code, not from
 * the bar UI).
 *
 * ttu fires, immediately on every change (NOT debounced):
 *   document.dispatchEvent(new CustomEvent('ttsu:page.change',
 *     { detail: { exploredCharCount } }))           // live position
 *   document.dispatchEvent(new CustomEvent('ttsu:page.change',
 *     { detail: { bookCharCount } }))                // whole-book total
 *
 * PRIMARY: listen for that event in the content script and read detail directly.
 * Firefox exposes own data properties of a page-created plain object to content
 * scripts (Xrays for JS objects), so detail.exploredCharCount is readable here.
 *
 * FALLBACK: if a browser hands back an opaque detail (undefined), the injected
 * MAIN-world bridge mirrors the value onto a <html> data-* attribute, which we
 * read instead. The debounced IndexedDB value (ttu-progress-db) remains the last
 * resort, used only before the first event of a session.
 */
import { injectScript } from '#imports';

const EXPLORED_ATTR = 'data-nt-ttu-explored';
const TOTAL_ATTR = 'data-nt-ttu-total';

let _liveExplored: number | null = null;
let _liveTotal: number | null = null;
let _started = false;
let _injected = false;
let _pageChangeHandler: ((e: Event) => void) | null = null;

function num(v: any, positive: boolean): number | null {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return positive ? (v > 0 ? v : null) : (v >= 0 ? v : null);
}

function onPageChange(e: Event) {
    try {
        const d: any = (e as CustomEvent).detail;
        if (d) {
            const ex = num(d.exploredCharCount, false);
            if (ex != null) _liveExplored = ex;
            const tot = num(d.bookCharCount, true);
            if (tot != null) _liveTotal = tot;
        }
    } catch {
        // Detail not readable in this browser — the attribute fallback covers it.
    }
}

/** Start the live reader: direct event listener + injected bridge fallback.
 *  `onUpdate` (optional) fires after each live value update so the caller can
 *  recompute immediately instead of waiting for an unrelated recalc trigger. */
export function initTtuLive(onUpdate?: () => void): void {
    if (_started) return;
    _started = true;
    try {
        _pageChangeHandler = (e: Event) => {
            onPageChange(e);
            if (onUpdate) {
                try { onUpdate(); } catch { /* noop */ }
            }
        };
        document.addEventListener('ttsu:page.change', _pageChangeHandler, true);
    } catch {
        /* noop */
    }
    void injectTtuLiveBridge();
}

export function disposeTtuLive(): void {
    if (_pageChangeHandler) {
        try { document.removeEventListener('ttsu:page.change', _pageChangeHandler, true); } catch { /* noop */ }
        _pageChangeHandler = null;
    }
    _started = false;
    _injected = false;
    _liveExplored = null;
    _liveTotal = null;
}

/** Inject the MAIN-world bridge once (fallback path only). */
export async function injectTtuLiveBridge(): Promise<void> {
    if (_injected) return;
    _injected = true;
    try {
        await injectScript('/ttu-live-bridge.js', { keepInDom: true });
    } catch {
        _injected = false; // allow a retry; direct listener is the primary path anyway
    }
}

function readAttr(name: string, positive: boolean): number | null {
    const v = document.documentElement.getAttribute(name);
    if (v == null) return null;
    return num(Number(v), positive);
}

/** Live whole-book explored char count (direct read preferred, attr fallback). */
export function readTtuLiveExplored(): number | null {
    if (_liveExplored != null) return _liveExplored;
    return readAttr(EXPLORED_ATTR, false);
}

/** Live whole-book total char count. */
export function readTtuLiveTotal(): number | null {
    if (_liveTotal != null) return _liveTotal;
    return readAttr(TOTAL_ATTR, true);
}