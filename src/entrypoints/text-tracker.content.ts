/**
 * ── Text Tracker Content Script ──────────────────────────────────────────────
 */
import { defineContentScript } from '#imports';
import { configStorage } from '@/lib/storage/config';
import { readingQueueStorage } from '@/lib/storage/queues';
import { ttuHistoryStorage, ttuLinkStorage } from '@/lib/storage/ttu';
import { addDebugLog } from '@/lib/storage/debug';
import { SKIP_HOSTS_DEFAULT, JP_DOMAINS_DEFAULT, JP_RE, TTU_HOSTS } from '@/lib/constants';
import { parseTitle } from '@/lib/utils/text-parsing';
import { showToast } from '@/lib/utils/toast';
import { injectThemeStyles, buildOverlay } from '@/lib/ui/reader-overlay';
import { setupTTUChronometerUI } from '@/lib/ui/ttu-chrono';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';
import '@/assets/overlay.css';

let currentConfig: any = {};
let websiteOverlayDismissed = false;
let isAnalyzingPage = false; // Strict analysis lock to prevent self-closing bugs

// Global cache to identify active section indexes based on text rendering
let sectionTextsCached: string[] = [];
let sectionAccCharCounts: number[] = [];
let hasStaticOffsets = false;

function normalizeText(str: string): string {
  return str.replace(/[\s\p{P}]/gu, '').slice(0, 80);
}

function getReaderConfig(cfg: any) {
  const host = window.location.hostname;
  const autoSave = cfg.readerAutoSave ?? cfg.ttuAutoSave ?? true;
  const directSend = cfg.readerDirectSend ?? cfg.ttuDirectSend ?? false;

  if (host.includes('app.yatsu.moe')) {
    return { enabled: cfg.yatsuEnabled ?? true, autoSave, directSend };
  }
  if (host.includes('manga.manabe.es')) {
    return { enabled: cfg.manabeEnabled ?? true, autoSave, directSend };
  }
  return { enabled: cfg.ttuEnabled ?? true, autoSave, directSend };
}

function isWebsiteOverlaySkipped(cfg: any): boolean {
  const host = window.location.hostname;
  const skipSites: string[] = cfg?.skipSites ?? ['youtube.com', 'youtu.be', 'crunchyroll.com', 'animekai.to', 'music.youtube.com', 'nihongotracker.app'];
  if (SKIP_HOSTS_DEFAULT.some(h => host.includes(h))) return true;
  if (skipSites.some((h: string) => host.includes(h))) return true;
  return false;
}

async function isJapanesePage(cfg: any): Promise<boolean> {
  const host = window.location.hostname;
  const allowSites: string[] = cfg.allowSites ?? [...JP_DOMAINS_DEFAULT];
  const allowListOnly: boolean = cfg.allowListOnly ?? false;

  if (allowSites.some((d: string) => host.includes(d))) return true;
  if (allowListOnly) return false;

  const lang = document.documentElement.lang;
  if (lang.startsWith('ja')) return true;

  await new Promise(r => setTimeout(r, 1500));
  const sample = (document.body?.innerText ?? '').slice(0, 8000);
  const jpCount = (sample.match(JP_RE) ?? []).length;
  const result = jpCount >= 40;

  addDebugLog('INFO', 'TextTracker', `Page Analysis`, {
    host,
    japaneseCharsFound: jpCount,
    isJapanese: result
  });

  return result;
}

const ttuState = {
  id: crypto.randomUUID(),
  running: false,
  timeMs: 0,
  chars: 0, // Explicitly declared to prevent ts compile-time warnings
};

interface StateRefs {
  globalSessionStartChar: number;
  globalManualCharOffset: number;
  globalLastTick: number;
  lastSectionIndex: number; // Strictly typed number (never null) to satisfy TS compiler
  lastSectionTotal: number;
  visitedSections: Map<number, number>;
}

const stateRefs: StateRefs = {
  globalSessionStartChar: -1,
  globalManualCharOffset: 0,
  globalLastTick: Date.now(),
  lastSectionIndex: -1,
  lastSectionTotal: 0,
  visitedSections: new Map<number, number>()
};

let isSyncing = false;

function getTTUTitle() {
  let title = document.title;
  try {
    if (window.self !== window.top && window.top) {
      title = window.top.document.title || title;
    }
  } catch (e) { }
  title = title.replace(/\s*\|\s*(ッツ Ebook Reader|Yatsu Reader|Manabe Reader)\s*/i, '');
  title = title.replace(/\s*[–—-]\s*ttu.*$/i, '');
  return title.trim() || document.title;
}

function parseTitleWithConfig(docTitle: string) {
  return parseTitle(docTitle, currentConfig.titleRegexes);
}

function getReaderName() {
  const host = window.location.hostname;
  if (host.includes('app.yatsu.moe')) return 'Yatsu Reader';
  if (host.includes('manga.manabe.es')) return 'Manabe Reader';
  if (host.includes('reader.ttsu.app')) return 'TTU Reader';
  return 'Reader';
}

async function liveSyncQueue() {
  if (isSyncing || (ttuState.timeMs === 0 && ttuState.chars === 0)) return;
  isSyncing = true;

  try {
    const rawTitle = getTTUTitle();
    const { query: parsedTitle, volume: parsedVolume } = parseTitleWithConfig(rawTitle);
    const dateStr = new Date().toISOString();
    const secs = Math.round(ttuState.timeMs / 1000);

    const queue = await readingQueueStorage.getValue();
    let existing = queue.find(q => q.originalTitle === rawTitle || q.contentTitleNative === rawTitle);

    const linkMap = await ttuLinkStorage.getValue() || {};
    const linkedMedia = linkMap[rawTitle];

    await addDebugLog('INFO', 'TextTracker', `liveSyncQueue executed`, { rawTitle, parsedTitle, timeMs: ttuState.timeMs, chars: ttuState.chars });

    if (!existing) {
      existing = {
        id: crypto.randomUUID(), type: 'reading',
        contentTitleNative: parsedTitle,
        contentTitleEnglish: '',
        originalTitle: rawTitle,
        description: parsedTitle,
        chars: ttuState.chars, time: secs,
        volume: parsedVolume || 1,
        date: dateStr, private: false, tags: [],
        sessions: [{ id: ttuState.id, secs: secs, chars: ttuState.chars, date: dateStr }],
        readerName: getReaderName()
      };
      queue.push(existing);
    } else {
      existing.originalTitle = existing.originalTitle || rawTitle;
      existing.readerName = getReaderName();

      if (!existing.mediaId || existing.mediaId === 'web-reading') {
        existing.contentTitleNative = existing.contentTitleNative || parsedTitle;
        if (parsedVolume !== undefined && !existing.volume) {
          existing.volume = parsedVolume;
        }
      }

      existing.sessions = existing.sessions || [];
      const sIdx = existing.sessions.findIndex((s: any) => s.id === ttuState.id);

      if (sIdx >= 0) {
        existing.sessions[sIdx].secs = secs;
        existing.sessions[sIdx].chars = ttuState.chars;
        existing.sessions[sIdx].date = dateStr;
      } else {
        existing.sessions.push({ id: ttuState.id, secs: secs, chars: ttuState.chars, date: dateStr });
      }

      existing.chars = existing.sessions.reduce((acc: any, s: any) => acc + s.chars, 0);
      existing.time = existing.sessions.reduce((acc: any, s: any) => acc + s.secs, 0);
    }

    if (linkedMedia) {
      existing.mediaId = String(linkedMedia.mediaId);
      existing.mediaData = linkedMedia.mediaData;
      existing.volume = linkedMedia.volume;
      existing.contentTitleNative = linkedMedia.mediaData.contentTitleNative || existing.contentTitleNative;
      existing.contentTitleEnglish = linkedMedia.mediaData.contentTitleEnglish || existing.contentTitleEnglish;
      existing.description = linkedMedia.mediaData.contentTitleNative || existing.contentTitleNative;
    }

    await readingQueueStorage.setValue(queue);
  } finally {
    isSyncing = false;
  }
}

async function saveSessionAndQueue() {
  if (ttuState.timeMs === 0 && ttuState.chars === 0) return;

  await addDebugLog('INFO', 'TextTracker', `Saving explicit TTU session`, { chars: ttuState.chars, timeMs: ttuState.timeMs });

  const title = getTTUTitle();
  const dateStr = new Date().toISOString();
  const sessionLog = { id: ttuState.id, date: dateStr, timeMs: ttuState.timeMs, chars: ttuState.chars };

  const history = await ttuHistoryStorage.getValue() || {};
  if (!history[title]) history[title] = [];
  history[title].push(sessionLog);
  await ttuHistoryStorage.setValue(history);

  await liveSyncQueue();

  ttuState.id = crypto.randomUUID();
  ttuState.timeMs = 0;
  ttuState.chars = 0;

  const currentCount = extractAdvancedCharCount();
  stateRefs.globalSessionStartChar = currentCount !== null ? currentCount.current : -1;
  stateRefs.globalManualCharOffset = 0;
  stateRefs.lastSectionIndex = -1;
  stateRefs.lastSectionTotal = 0;
  stateRefs.visitedSections.clear();
  ttuState.running = false;

  showToast('Success', 'Session queued!');
}

function findTTUInsertPoint(): { el: Element, pos: InsertPosition } | null {
  if (typeof document === 'undefined') return null;

  const footer = document.getElementById('ttu-page-footer');
  if (footer) {
    const flexGroups = Array.from(footer.children).filter(el =>
      el.classList.contains('flex') && !el.classList.contains('fixed') && !el.classList.contains('absolute') && el.id !== 'nt-ttu-chrono-wrapper');
    if (flexGroups.length > 0) return { el: flexGroups[flexGroups.length - 1], pos: 'beforeend' };
    return { el: footer, pos: 'afterbegin' };
  }

  const progressDiv = document.querySelector('div[title="Click to copy Progress"]');
  if (progressDiv && progressDiv.parentElement) {
    const container = progressDiv.parentElement;
    const leftGroup = Array.from(container.children).find(el => el.classList.contains('flex') && el.classList.contains('h-full') && el.id !== 'nt-ttu-chrono-wrapper');
    if (leftGroup) return { el: leftGroup, pos: 'beforeend' };
    return { el: container, pos: 'afterbegin' };
  }

  return null;
}

interface BooksDbBook {
  id: number;
  htmlContent?: string;
}

function getBookIdFromUrl(): number | null {
  try {
    // 1. Try matching pathname identifiers (e.g., /b/123, /book/123)
    const pathParts = window.location.pathname.split('/');
    const bIdx = pathParts.findIndex(part => part === 'b' || part === 'book');
    if (bIdx !== -1 && pathParts[bIdx + 1]) {
      const idStr = pathParts[bIdx + 1];
      const parsed = parseInt(idStr, 10);
      if (!isNaN(parsed)) return parsed;
    }

    // 2. Query parameter fallback (e.g., ?id=123)
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      const parsed = parseInt(id, 10);
      if (!isNaN(parsed)) return parsed;
    }
  } catch (e) { }
  return null;
}

function fetchBookFromDatabase(bookId: number): Promise<BooksDbBook | null> {
  return new Promise(async (resolve) => {
    try {
      console.log(`[TextTracker Diagnostic] Starting database discovery for bookId: ${bookId}...`);

      let dbNames: string[] = ['books-db', 'localforage'];
      if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        dbNames = dbs.map(d => d.name || '').filter(Boolean);
        console.log(`[TextTracker Diagnostic] Discovered databases on this origin:`, dbNames);
      }

      // Try opening each discovered database in sequence to find the book
      for (const name of dbNames) {
        console.log(`[TextTracker Diagnostic] Testing database: '${name}'...`);
        const book = await new Promise<BooksDbBook | null>((res) => {
          const req = indexedDB.open(name);
          req.onerror = () => {
            console.error(`    [Database Error] Failed to open database '${name}'`);
            res(null);
          };
          req.onsuccess = () => {
            const db = req.result;
            const stores = Array.from(db.objectStoreNames);
            console.log(`  [Database] Opened '${name}' (v${db.version}). Stores:`, stores);

            // Svelte Reader book stores could be 'books' or 'keyvaluepairs' or 'files'
            const targetStore = stores.find(s => s === 'books' || s === 'keyvaluepairs' || s === 'files');
            if (!targetStore) {
              console.log(`    [Database] Store 'books' or 'keyvaluepairs' not found in '${name}'`);
              db.close();
              res(null);
              return;
            }

            try {
              const transaction = db.transaction([targetStore], 'readonly');
              const store = transaction.objectStore(targetStore);

              // Query key by numeric and string
              const getNumeric = store.get(bookId);
              getNumeric.onsuccess = () => {
                if (getNumeric.result) {
                  console.log(`    [Success] Found book in '${name}' > '${targetStore}' using numeric ID ${bookId}`);
                  db.close();
                  res(getNumeric.result);
                } else {
                  console.log(`    [Database] Numeric key ${bookId} not found in '${targetStore}'. Trying string key...`);
                  const getReqString = store.get(String(bookId));
                  getReqString.onsuccess = () => {
                    if (getReqString.result) {
                      console.log(`    [Success] Found book in '${name}' > '${targetStore}' using string ID "${bookId}"`);
                      db.close();
                      res(getReqString.result);
                    } else {
                      console.log(`    [Database] String key "${bookId}" also not found in '${targetStore}'.`);
                      db.close();
                      res(null);
                    }
                  };
                  getReqString.onerror = () => { db.close(); res(null); };
                }
              };
              getNumeric.onerror = () => { db.close(); res(null); };
            } catch (err) {
              console.error(`    [Error] Failed transaction in database '${name}' store '${targetStore}':`, err);
              db.close();
              res(null);
            }
          };
        });

        if (book) {
          resolve(book);
          return;
        }
      }
    } catch (e) {
      console.error(`[TextTracker Diagnostic] Database discovery failed:`, e);
    }
    resolve(null);
  });
}

function calculateSectionAccCharCounts(htmlContent: string): number[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const sections = Array.from(doc.body.children);

  let exploredCharCount = 0;
  return sections.map((section) => {
    const paragraphs = Array.from(section.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')).filter(el => {
      if (el.closest('#nt-ttu-chrono-wrapper, nav, .menu, header')) return false;
      return true; // MATCH REMOVAL OF TEXT FILTER
    });

    const sectionCharCount = paragraphs.reduce((acc, el) => {
      let text = '';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.parentElement?.closest('rt, rp, svg, figcaption, noscript, .ttu-illustration-container, .ttu-img-container')) {
          text += n.nodeValue || '';
        }
      }
      const matches = text.match(/[\p{L}\p{N}]/gu);
      const count = matches ? matches.length : 0;
      return acc + count;
    }, 0);

    exploredCharCount += sectionCharCount;
    return exploredCharCount;
  });
}

function getTtuNativeProgressFromDom(): { current: number; total: number } | null {
  try {
    // 1. Check all elements matching the "Click to copy Progress" title and filter for the visible one
    // High-precision visibility verification containing strict visibility, display, and opacity parameters
    const copyDivs = Array.from(document.querySelectorAll('div[title="Click to copy Progress"]'));
    const visibleCopyDiv = copyDivs.find(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0';
    });

    if (visibleCopyDiv && visibleCopyDiv.textContent) {
      const text = visibleCopyDiv.textContent;
      const match = text.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        console.log(`[TextTracker Diagnostic] getTtuNativeProgressFromDom matched 'Click to copy Progress' element. Text: "${text}"`, visibleCopyDiv);
        return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
      }
    }

    // 2. Scan the document body for fractional text "X / Y" (excluding hidden segments)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const parent = n.parentElement;
      if (!parent) continue;

      const val = (n.nodeValue || '').trim();
      if (val.includes('/') && !parent.closest('#nt-ttu-chrono-wrapper, #nt-overlay, script, style')) {
        const rect = parent.getBoundingClientRect();
        const style = getComputedStyle(parent);
        if (rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0') {
          const text = val.replace(/,/g, '');
          const match = text.match(/^(\d+)\s*\/\s*(\d+)/);
          if (match) {
            console.log(`[TextTracker Diagnostic] getTtuNativeProgressFromDom matched visible text node. Text: "${val}" Parent:`, parent);
            return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
          }
        }
      }
    }
  } catch (e) { }
  return null;
}

async function checkAndRunOverlay(cfg: any) {
  if (window.self !== window.top) return; // Only execute overlay building in top-level context

  if (isAnalyzingPage) {
    console.log(`[TextTracker Diagnostic] Overlay check skipped: analysis already in progress.`);
    return;
  }
  const existing = document.getElementById('nt-overlay');
  if (existing) {
    console.log(`[TextTracker Diagnostic] Overlay check skipped: element already exists in DOM.`);
    return;
  }

  isAnalyzingPage = true;
  console.log(`[TextTracker Diagnostic] Starting Japanese page analysis...`);
  try {
    const isJP = await isJapanesePage(cfg);
    console.log(`[TextTracker Diagnostic] Analysis result: isJapanese = ${isJP}`);
    if (isJP && cfg.overlayPosition !== 'hidden' && !document.getElementById('nt-overlay')) {
      console.log(`[TextTracker Diagnostic] Appending overlay to DOM...`);
      runOverlaySetup(cfg);
    }
  } catch (e) {
    console.error(`[TextTracker Diagnostic] Error during overlay builder execution:`, e);
  } finally {
    isAnalyzingPage = false;
  }
}

async function setupTTUChronometer() {
  const pt = findTTUInsertPoint();
  if (!pt) return;

  // Scan and log all active databases on this origin to help debug store structure
  if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
    try {
      const dbs = await indexedDB.databases();
      console.log(`[TextTracker Diagnostic] Active IndexedDB databases on this origin:`, dbs);
    } catch (e) {
      console.error(`[TextTracker Diagnostic] Failed to list IndexedDB databases:`, e);
    }
  }

  const bookId = getBookIdFromUrl();

  if (bookId !== null) {
    const bookData = await fetchBookFromDatabase(bookId);
    if (bookData && bookData.htmlContent) {
      sectionAccCharCounts = calculateSectionAccCharCounts(bookData.htmlContent);
      hasStaticOffsets = sectionAccCharCounts.length > 0;

      // Cache normalized text prefixes for section index matching
      const parser = new DOMParser();
      const doc = parser.parseFromString(bookData.htmlContent, 'text/html');
      sectionTextsCached = Array.from(doc.body.children).map(section => {
        return normalizeText(section.textContent || '');
      });
      console.log(`[TextTracker Diagnostic] Static offsets successfully loaded from database. Sections count: ${sectionAccCharCounts.length}`);
    }
  }

  if (!hasStaticOffsets) {
    console.log(`[TextTracker Diagnostic] Database offsets empty or unreachable. Operating in Dynamic Offset Mode.`);
  }

  setupTTUChronometerUI(pt, currentConfig, ttuState, stateRefs, {
    getTTUTitle,
    parseTitleWithConfig,
    extractTTUCharCount: () => {
      const res = extractAdvancedCharCount();
      return res !== null ? res.current : null;
    },
    getReaderName,
    getReaderConfig,
    liveSyncQueue,
    saveSessionAndQueue
  });

  if ((window as any).ntChronoInterval) {
    clearInterval((window as any).ntChronoInterval);
  }

  (window as any).ntChronoInterval = setInterval(() => {
    if (ttuState.running && !document.hidden) {
      const now = Date.now();
      ttuState.timeMs += (now - stateRefs.globalLastTick);

      const charData = extractAdvancedCharCount();
      if (charData !== null) {
        const { current } = charData;

        if (stateRefs.globalSessionStartChar === -1) {
          stateRefs.globalSessionStartChar = current;
          console.log(`[TextTracker Diagnostic] Set session starting baseline to: ${current}`);
        }

        let diff = current - stateRefs.globalSessionStartChar;
        if (diff < 0) diff = 0;

        let calculatedChars = diff + stateRefs.globalManualCharOffset;

        // DOM Progress indicator is used SOLELY for diagnostic logging.
        // The progression engine remains completely decoupled and natively tracked.
        const nativeTtuProgress = getTtuNativeProgressFromDom();

        ttuState.chars = calculatedChars;

        console.log(`[TextTracker Diagnostic] Chronometer Tick Progress:`, {
          calculatedCurrentInActiveSection: current,
          startingSessionBaseline: stateRefs.globalSessionStartChar,
          diffReadThisSession: diff,
          manualOffsetCalculated: stateRefs.globalManualCharOffset,
          finalCalculatedChars: ttuState.chars,
          activeSection: stateRefs.lastSectionIndex,
          nativeTtuProgressCurrent: nativeTtuProgress ? nativeTtuProgress.current : 'not found',
          nativeTtuProgressTotal: nativeTtuProgress ? nativeTtuProgress.total : 'not found'
        });
      }
      stateRefs.globalLastTick = now;

      const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
      if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));

      if (getReaderConfig(currentConfig).autoSave !== false) liveSyncQueue();
    } else if (ttuState.running && document.hidden) {
      stateRefs.globalLastTick = Date.now();
    }
  }, 1000);
}

if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(() => {
    // 1. TTU Chrono insert check
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    const target = findTTUInsertPoint();
    if (target && !wrapper) {
      const readerCfg = getReaderConfig(currentConfig);
      if (readerCfg.enabled !== false) setupTTUChronometer();
    }

    // 2. Real-time section transition detector
    // Captures page shifts instantly, preventing dynamic offset skips during fast paging
    const charData = extractAdvancedCharCount();
    if (charData !== null) {
      const { total, sectionIndex, isPaginated } = charData;
      const activeSection = sectionIndex !== null ? sectionIndex : -1;

      if (stateRefs.lastSectionIndex !== activeSection) {
        console.log(`[TextTracker Diagnostic] Section transition detected: ${stateRefs.lastSectionIndex} -> ${activeSection}`);

        // In paginated mode, initialize globalSessionStartChar to 0 instantly
        // instead of waiting for the chronometer tick, completely preventing rapid page-turning gaps
        if (isPaginated && activeSection !== -1) {
          stateRefs.globalSessionStartChar = 0;
          console.log(`[TextTracker Diagnostic] Paginated transition. Initialized baseline to 0.`);
        } else {
          stateRefs.globalSessionStartChar = -1; // Continuous baseline is initialized on the next tick
        }

        if (activeSection === -1) {
          stateRefs.lastSectionIndex = -1;
          stateRefs.globalManualCharOffset = 0;
          stateRefs.visitedSections.clear(); // Clear cached sections to completely fix backwards scrolling drift
          console.log(`[TextTracker Diagnostic] Reset dynamic tracking baseline to 0. Cleared visitedSections cache.`);
        } else {
          if (hasStaticOffsets) {
            // Static DB offset mapper
            stateRefs.globalManualCharOffset = sectionAccCharCounts[activeSection - 1] || 0;
            stateRefs.lastSectionIndex = activeSection;
          } else {
            // Dynamic visitedSections offset mapper fallback
            if (stateRefs.lastSectionIndex === -1) {
              stateRefs.lastSectionIndex = activeSection;
              stateRefs.lastSectionTotal = total;
              stateRefs.visitedSections.set(activeSection, 0);
            }

            if (stateRefs.lastSectionIndex !== activeSection) {
              if (activeSection > stateRefs.lastSectionIndex) {
                // --- FORWARD PROGRESSION ---
                if (stateRefs.visitedSections.has(activeSection)) {
                  stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(activeSection) || 0;
                } else {
                  stateRefs.globalManualCharOffset += stateRefs.lastSectionTotal;
                  stateRefs.visitedSections.set(activeSection, stateRefs.globalManualCharOffset);
                }
              } else {
                // --- BACKWARD PROGRESSION ---
                if (stateRefs.visitedSections.has(activeSection)) {
                  stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(activeSection) || 0;
                } else {
                  stateRefs.globalManualCharOffset = Math.max(0, stateRefs.globalManualCharOffset - total);
                  stateRefs.visitedSections.set(activeSection, stateRefs.globalManualCharOffset);
                }
              }
            }

            stateRefs.lastSectionIndex = activeSection;
            stateRefs.lastSectionTotal = total;
          }
        }
      }
    }

    // 3. Non-TTU Overlay recovery check (Heals dynamically deleted overlays)
    if (!TTU_HOSTS.some(h => window.location.hostname.includes(h))) {
      if (window.self === window.top && currentConfig.overlayPosition !== 'hidden' && !websiteOverlayDismissed) {
        const overlay = document.getElementById('nt-overlay');
        if (!overlay) {
          console.log(`[TextTracker Diagnostic] Overlay removed by host page DOM changes. Rebuilding overlay...`);
          checkAndRunOverlay(currentConfig);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((req: any, _s, sendResponse) => {
    if (req.action === 'GET_ACTIVE_TIME') {
      const nt = (window as any).__nt;
      if (nt && nt.getTotal) sendResponse({ minutes: Math.floor(nt.getTotal() / 60000) });
    }
    if (req.action === 'SHOW_TOAST') {
      if (window.self !== window.top) return;
      const title = String(req.title || '');
      const msg = req.message || '';
      showToast(title, msg, title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
    }
  });
}

window.addEventListener('message', (event) => {
  if (event.data?.action === 'SHOW_TOAST') {
    if (window.self !== window.top) return;
    const title = String(event.data.title || '');
    const msg = event.data.message || '';
    showToast(title, msg, title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
  }
});

function startTimeTracker() {
  let activeMs = 0, lastStamp = Date.now(), isVisible = !document.hidden, isPaused = false;
  const accrue = () => { if (isVisible && !isPaused) { activeMs += Date.now() - lastStamp; lastStamp = Date.now(); } };
  const getTotal = () => activeMs + (isVisible && !isPaused ? Date.now() - lastStamp : 0);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { accrue(); isVisible = false; } else { lastStamp = Date.now(); isVisible = true; }
  });
  (window as any).__nt = { getTotal, setMs: (ms: number) => { accrue(); activeMs = ms; lastStamp = Date.now(); }, pause: (p: boolean) => { if (p) { accrue(); isPaused = true; } else { lastStamp = Date.now(); isPaused = false; } }, isPaused: () => isPaused };
}

function runOverlaySetup(cfg: any) {
  addDebugLog('INFO', 'TextTracker', `Building Overlay`, {
    url: window.location.href,
    pos: cfg.overlayPosition
  });
  buildOverlay(
    cfg,
    { dismissed: websiteOverlayDismissed },
    (isPaused) => { (window as any).__nt.pause(isPaused); },
    () => { (window as any).__nt.setMs(0); },
    (ms) => { (window as any).__nt.setMs(ms); },
    () => (window as any).__nt.getTotal(),
    () => { websiteOverlayDismissed = true; }
  );
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['config']) {
    const newCfg: any = changes['config'].newValue || {};
    currentConfig = newCfg;

    injectThemeStyles(newCfg.theme ?? 'nihongo', newCfg.font ?? 'mono');

    if (TTU_HOSTS.some(h => window.location.hostname.includes(h))) {
      const oldReaderCfg = getReaderConfig(changes['config'].oldValue || {});
      const newReaderCfg = getReaderConfig(newCfg);
      const wasEnabled = oldReaderCfg.enabled;
      const isEnabled = newReaderCfg.enabled;

      if (!isEnabled && wasEnabled) {
        const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
        if (wrapper) wrapper.remove();
        if ((window as any).ntChronoInterval) clearInterval((window as any).ntChronoInterval);
      } else if (isEnabled && !wasEnabled) {
        setupTTUChronometer();
      }

      const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
      if (wrapper) {
        const btnLog = wrapper.querySelector('#nt-ttu-btn-log') as HTMLButtonElement;
        if (isEnabled && newReaderCfg.autoSave !== false) {
          btnLog.disabled = true; btnLog.style.opacity = '0.3'; btnLog.style.cursor = 'not-allowed'; btnLog.title = 'Auto-sync is enabled (Sends automatically via Settings Queue)';
        } else if (isEnabled) {
          btnLog.disabled = false; btnLog.style.opacity = '1'; btnLog.style.cursor = 'pointer'; btnLog.title = 'Save & Queue';
        }
      }
    } else {
      if (window.self !== window.top) return; // Only process overlay changes in top-level context

      if (isWebsiteOverlaySkipped(newCfg) || websiteOverlayDismissed) {
        const overlay = document.getElementById('nt-overlay');
        if (overlay) overlay.style.display = 'none';
        return;
      }

      const existingOverlay = document.getElementById('nt-overlay');
      if (existingOverlay) {
        if (newCfg.overlayPosition !== 'hidden') {
          existingOverlay.style.display = 'block';
        } else {
          existingOverlay.style.display = 'none';
        }
        return;
      }

      checkAndRunOverlay(newCfg);
    }
  }

  if (area === 'local' && changes['readingQueue']) {
    const queue = (changes['readingQueue'].newValue as any[]) || [];
    const rawTitle = getTTUTitle();
    const existing = queue.find((q: any) => q.originalTitle === rawTitle || q.contentTitleNative === rawTitle);

    if (!existing && ttuState.timeMs > 0) {
      ttuState.timeMs = 0; ttuState.chars = 0;

      const initCount = extractAdvancedCharCount();
      stateRefs.globalSessionStartChar = initCount !== null ? initCount.current : -1;

      stateRefs.globalManualCharOffset = 0;

      const timeVal = document.querySelector('#nt-ttu-val-time');
      const charsVal = document.querySelector('#nt-ttu-val-chars');
      if (timeVal && timeVal.tagName !== 'INPUT') timeVal.textContent = "0:00";
      if (charsVal && charsVal.tagName !== 'INPUT') charsVal.textContent = "0";
    } else if (existing) {
      ttuLinkStorage.getValue().then(links => {
        links = links || {};
        let updated = false;

        if (existing.mediaId && existing.mediaId !== 'web-reading') {
          if (!links[rawTitle] || links[rawTitle].mediaId !== existing.mediaId || links[rawTitle].volume !== existing.volume) {
            links[rawTitle] = {
              mediaId: existing.mediaId,
              volume: existing.volume || 1,
              mediaData: existing.mediaData
            };
            updated = true;
          }
        } else if (!existing.mediaId || existing.mediaId === 'web-reading') {
          if (links[rawTitle]) {
            delete links[rawTitle];
            updated = true;
          }
        }

        if (updated) {
          ttuLinkStorage.setValue(links).then(() => {
            const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
            if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
          });
        }
      });
    }
  }
});

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  cssInjectionMode: 'manifest',

  async main() {
    currentConfig = await configStorage.getValue() || {};
    const host = window.location.hostname;
    const cfg = currentConfig;

    injectThemeStyles(cfg.theme ?? 'nihongo', cfg.font ?? 'mono');

    if (TTU_HOSTS.some(h => host.includes(h))) {
      const readerCfg = getReaderConfig(cfg);
      if (!readerCfg.enabled) return;
      startTimeTracker();
      await new Promise(r => setTimeout(r, 2500));
      setupTTUChronometer();
      return;
    }

    if (isWebsiteOverlaySkipped(cfg)) return;
    startTimeTracker();
    if (cfg.overlayPosition === 'hidden') return;

    if (window.self !== window.top) return; // Only process overlay triggers in top-level context
    checkAndRunOverlay(cfg);
  },
});