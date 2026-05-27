/**
 * ── Text Tracker Content Script ──────────────────────────────────────────────
 */
import { defineContentScript } from '#imports';
import '@/assets/text-tracker.css';
import { getActiveReaderAdapter } from '@/lib/adapters/readers';
import { JP_DOMAINS_DEFAULT, JP_RE } from '@/lib/constants';
import { configStorage } from '@/lib/storage/config';
import { addDebugLog } from '@/lib/storage/debug';
import { readingQueueStorage } from '@/lib/storage/queues';
import { ttuHistoryStorage, ttuLinkStorage } from '@/lib/storage/ttu';
import {
  applyOverlayPosition,
  enforceOverlayLayout,
  getOverlayDismissed,
  injectOverlayCustomOverrides,
  injectThemeStyles,
  isWebsiteOverlaySkipped,
  runOverlaySetup,
  updatePauseIconState
} from '@/lib/ui/reader-overlay';
import {
  getActiveThemeName,
  getReaderConfig,
  updateActiveThemeStyles
} from '@/lib/ui/text-tracker-theme-manager';
import { setupTTUChronometerUI } from '@/lib/ui/ttu-chrono';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';
import { parseTitle } from '@/lib/utils/text-parsing';
import { showToast } from '@/lib/utils/toast';

/** Helper to securely insert HTML elements bypassing innerHTML strict validator rules */
function setSafeHTML(el: HTMLElement, html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  el.textContent = '';
  while (doc.body.firstChild) {
    el.appendChild(doc.body.firstChild);
  }
}

let currentConfig: any = {};
let isAnalyzingPage = false;
let cachedIsJapanese: boolean | null = null;

// Trackers to optimize mutation and chrono lookups
let progressObserver: MutationObserver | null = null;
let scrollTimeout: any = null;
let isChronoInitializing = false;

// ── Performance caches ──────────────────────────────────────────────────────
let _readingViewCache: boolean | null = null;
let _readingViewCacheTime = 0;
const READING_VIEW_CACHE_TTL = 500; // ms

let _insertPointCache: { el: Element; pos: InsertPosition } | null = null;
let _overlayCache: HTMLElement | null = null;

let _mutationMicrotaskScheduled = false;
let _lastSectionCheckTime = 0;
let _lastThemeCheckTime = 0;
let _transitionGraceUntil = 0;

async function isJapanesePage(cfg: any): Promise<boolean> {
  if (cachedIsJapanese !== null) return cachedIsJapanese;

  const host = window.location.hostname;
  const allowSites: string[] = cfg.allowSites ?? [...JP_DOMAINS_DEFAULT];
  const allowListOnly: boolean = cfg.allowListOnly ?? false;

  if (allowSites.some((d: string) => host.includes(d))) {
    cachedIsJapanese = true;
    return true;
  }
  if (allowListOnly) {
    cachedIsJapanese = false;
    return false;
  }

  const lang = document.documentElement.lang;
  if (lang.startsWith('ja')) {
    cachedIsJapanese = true;
    return true;
  }

  await new Promise(r => setTimeout(r, 1500));
  const sample = (document.body?.textContent ?? '').slice(0, 8000);
  const jpCount = (sample.match(JP_RE) ?? []).length;
  const result = jpCount >= 40;

  addDebugLog('INFO', 'TextTracker', `Page Analysis`, {
    host,
    japaneseCharsFound: jpCount,
    isJapanese: result
  });

  cachedIsJapanese = result;
  return result;
}

interface StateRefs {
  globalSessionStartChar: number;
  globalManualCharOffset: number;
  globalLastTick: number;
  lastSectionIndex: number;
  lastSectionTotal: number;
  visitedSections: Map<number, number>;
  sessionInitialSectionIndex: number;
  sessionInitialStartChar: number;
}

const stateRefs: StateRefs = {
  globalSessionStartChar: -1,
  globalManualCharOffset: 0,
  globalLastTick: Date.now(),
  lastSectionIndex: -1,
  lastSectionTotal: 0,
  visitedSections: new Map<number, number>(),
  sessionInitialSectionIndex: -1,
  sessionInitialStartChar: -1
};

/**
 * Reactive proxy container for the tracking state.
 * Intercepts resets to synchronize the tick baseline, eliminating fractional carryover.
 */
const ttuState = new Proxy({
  id: crypto.randomUUID(),
  running: false,
  timeMs: 0,
  chars: 0,
}, {
  set(target, prop, value) {
    if (prop === 'timeMs') {
      const numVal = Number(value) || 0;
      if (numVal < target.timeMs || numVal === 0) {
        stateRefs.globalLastTick = Date.now();
      }
      target.timeMs = numVal;
      return true;
    }
    if (prop === 'chars') {
      target.chars = Number(value) || 0;
      return true;
    }
    (target as any)[prop] = value;
    return true;
  }
});

let isSyncing = false;

function getTTUTitle() {
  let title = document.title;
  try {
    if (window.self !== window.top && window.top) {
      title = window.top.document.title || title;
    }
  } catch (e) { }
  title = title.replace(/\s*\|\s*(ッツ Ebook Reader|Yatsu Reader|YomiYasu Reader)\s*/i, '');
  title = title.replace(/\s*[–—-]\s*ttu.*$/i, '');
  title = title.replace(/^YomiYasu\s*-\s*/i, '');
  return title.trim() || document.title;
}

function parseTitleWithConfig(docTitle: string) {
  return parseTitle(docTitle, currentConfig.titleRegexes);
}

// Global cached layout mode tracker to sanitize continuous <-> paginated switches
let lastLoggedPaginatedMode: boolean | null = null;

function getReaderName() {
  const adapter = getActiveReaderAdapter();
  return adapter ? adapter.name : 'Reader';
}

function isReadingViewActive(): boolean {
  const now = Date.now();
  if (_readingViewCache !== null && (now - _readingViewCacheTime) < READING_VIEW_CACHE_TTL) {
    return _readingViewCache;
  }
  const path = window.location.pathname;
  if (path.includes('/settings') || path === '/' || path === '') {
    _readingViewCache = false;
    _readingViewCacheTime = now;
    return false;
  }
  const hasContainer = !!document.querySelector(
    '.book-content-container, .book-content, [data-ref="container"], .reader-container, #reader-container, .reader-wrapper'
  );
  _readingViewCache = hasContainer;
  _readingViewCacheTime = now;
  return hasContainer;
}

/** Invalidate the reading view cache when we know the DOM has meaningfully changed */
function invalidateReadingViewCache() {
  _readingViewCache = null;
}

/** Retrieve the cached overlay element when possible to limit DOM query overhead */
function getOverlayElement(): HTMLElement | null {
  if (_overlayCache && _overlayCache.isConnected) {
    return _overlayCache;
  }
  _overlayCache = document.getElementById('nt-overlay');
  return _overlayCache;
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
  stateRefs.globalLastTick = Date.now();
  ttuState.running = false;

  showToast('Success', 'Session queued!');
}

function findTTUInsertPoint(): { el: Element; pos: InsertPosition } | null {
  if (typeof document === 'undefined') return null;

  // Return cached result if the target element is still in the DOM
  if (_insertPointCache && _insertPointCache.el.isConnected) {
    return _insertPointCache;
  }

  const footer = document.getElementById('ttu-page-footer');
  if (footer) {
    const flexGroups = Array.from(footer.children).filter(el =>
      el.classList.contains('flex') && !el.classList.contains('fixed') && !el.classList.contains('absolute') && el.id !== 'nt-ttu-chrono-wrapper');
    if (flexGroups.length > 0) { _insertPointCache = { el: flexGroups[flexGroups.length - 1], pos: 'beforeend' }; return _insertPointCache; }
    _insertPointCache = { el: footer, pos: 'afterbegin' };
    return _insertPointCache;
  }

  const progressDiv = document.querySelector('div[title="Click to copy Progress"]');
  if (progressDiv && progressDiv.parentElement) {
    const container = progressDiv.parentElement;
    const leftGroup = Array.from(container.children).find(el => el.classList.contains('flex') && el.classList.contains('h-full') && el.id !== 'nt-ttu-chrono-wrapper');
    if (leftGroup) { _insertPointCache = { el: leftGroup, pos: 'beforeend' }; return _insertPointCache; }
    _insertPointCache = { el: container, pos: 'afterbegin' };
    return _insertPointCache;
  }

  const adapter = getActiveReaderAdapter();
  if (adapter) {
    const pt = adapter.findInsertPoint();
    if (pt) { _insertPointCache = pt; return _insertPointCache; }
  }

  _insertPointCache = null;
  return null;
}

/**
 * Perform progression mapping and dispatch instant UI updates.
 */
function recalculateChars() {
  if (!ttuState.running) return;

  if (!isReadingViewActive()) {
    ttuState.running = false;
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
    return;
  }

  const adapter = getActiveReaderAdapter();
  const current = adapter ? adapter.extractCharCount() : null;
  if (current !== null) {
    if (stateRefs.globalSessionStartChar === -1) {
      stateRefs.globalSessionStartChar = current;
    }

    // Scroll Alignment Grace Window: Set baseline to moving positions during layout
    // recalculation to prevent premature character additions
    if (Date.now() < _transitionGraceUntil) {
      stateRefs.globalSessionStartChar = current;
      return;
    }

    let diff = current - stateRefs.globalSessionStartChar;
    if (diff < 0) diff = 0;

    let calculatedChars = diff + stateRefs.globalManualCharOffset;
    ttuState.chars = calculatedChars;

    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
  }
}

/**
 * Targets and observes Svelte/TTU's progress changes directly.
 */
function setupProgressObserver() {
  if (progressObserver) return;

  const target = document.querySelector('div[title="Click to copy Progress"]');
  if (!target) return;

  progressObserver = new MutationObserver(() => {
    if (ttuState.running && isReadingViewActive()) {
      recalculateChars();
    }
  });

  progressObserver.observe(target, { childList: true, characterData: true, subtree: true });
}

async function checkAndRunOverlay(cfg: any) {
  if (window.self !== window.top) return;
  if (isWebsiteOverlaySkipped(cfg)) return;

  // Explicitly skip on YomiYasu Reader's top-level domain to avoid generic overlay injection
  if (window.location.hostname.includes('manga.manabe.es')) return;

  if (isAnalyzingPage) return;
  const existing = getOverlayElement();
  if (existing) return;

  isAnalyzingPage = true;
  try {
    const isJP = await isJapanesePage(cfg);
    if (isJP && cfg.overlayPosition !== 'hidden' && !getOverlayElement()) {
      runOverlaySetup(cfg);
    }
  } catch (e) {
    addDebugLog('ERROR', 'TextTracker', 'Error during overlay builder execution', { error: e });
  } finally {
    isAnalyzingPage = false;
  }
}

async function setupTTUChronometer() {
  if (isChronoInitializing) return;
  if (!isReadingViewActive()) {
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) wrapper.remove();
    return;
  }
  if (document.getElementById('nt-ttu-chrono-wrapper')) return;

  isChronoInitializing = true;
  try {
    const pt = findTTUInsertPoint();
    if (!pt) return;

    setupTTUChronometerUI(pt, ttuState, stateRefs, {
      getTTUTitle,
      parseTitleWithConfig,
      extractTTUCharCount: () => {
        const adapter = getActiveReaderAdapter();
        return adapter ? adapter.extractCharCount() : null;
      },
      getReaderName,
      getCurrentReaderConfig: () => getReaderConfig(currentConfig),
      liveSyncQueue,
      saveSessionAndQueue
    });

    setupProgressObserver();

    if ((window as any).ntChronoInterval) {
      clearInterval((window as any).ntChronoInterval);
    }

    // High temporal resolution interval (200ms) for an instantaneous, snappy timing experience
    (window as any).ntChronoInterval = setInterval(() => {
      // Suspend calculations if tab is in the background to lower idle thread activity
      if (document.hidden) {
        if (ttuState.running) {
          stateRefs.globalLastTick = Date.now();
        }
        return;
      }

      if (!isReadingViewActive()) {
        if (ttuState.running) {
          ttuState.running = false;
          const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
          if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
        }
        return;
      }

      if (ttuState.running) {
        const now = Date.now();
        const elapsed = now - stateRefs.globalLastTick;

        ttuState.timeMs += elapsed;

        const charData = extractAdvancedCharCount();
        if (charData !== null) {
          const { current } = charData;

          if (stateRefs.globalSessionStartChar === -1) {
            stateRefs.globalSessionStartChar = current;
          }

          if (now >= _transitionGraceUntil) {
            let diff = current - stateRefs.globalSessionStartChar;
            if (diff < 0) diff = 0;

            ttuState.chars = diff + stateRefs.globalManualCharOffset;
          } else {
            stateRefs.globalSessionStartChar = current;
          }
        }
        stateRefs.globalLastTick = now;

        // Perform layout re-paints only when a whole second transition takes place
        const lastSec = Math.floor((ttuState.timeMs - elapsed) / 1000);
        const currSec = Math.floor(ttuState.timeMs / 1000);

        if (currSec !== lastSec) {
          const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
          if (wrapper) {
            wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
          }
        }

        if (getReaderConfig(currentConfig).autoSave !== false) liveSyncQueue();
      }
    }, 200);
  } finally {
    isChronoInitializing = false;
  }
}

// ── Ultra-Performant Interaction Hooks ────────────────────────────────────────
if (typeof window !== 'undefined') {
  const handleScrollUpdate = () => {
    if (!ttuState.running || !isReadingViewActive()) return;
    if (scrollTimeout) clearTimeout(scrollTimeout);

    scrollTimeout = setTimeout(() => {
      recalculateChars();
    }, 150);
  };

  window.addEventListener('scroll', handleScrollUpdate, { passive: true, capture: true });
  window.addEventListener('resize', handleScrollUpdate, { passive: true });

  window.addEventListener('click', () => {
    if (ttuState.running && isReadingViewActive()) {
      setTimeout(recalculateChars, 40);
    }
  }, { passive: true });

  window.addEventListener('keyup', (e) => {
    if (ttuState.running && isReadingViewActive() && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown'].includes(e.key)) {
      setTimeout(recalculateChars, 40);
    }
  }, { passive: true });
}

function initSessionRefs(current: number, activeSection: number, total: number, isPaginated: boolean) {
  stateRefs.globalSessionStartChar = isPaginated ? 0 : current;
  stateRefs.sessionInitialStartChar = isPaginated ? 0 : current;
  stateRefs.sessionInitialSectionIndex = activeSection;
  stateRefs.globalManualCharOffset = 0;
  stateRefs.lastSectionIndex = activeSection;
  stateRefs.lastSectionTotal = total;
  stateRefs.visitedSections.clear();
  stateRefs.visitedSections.set(activeSection, 0);
}

function isChapterLoading(): boolean {
  // Center screen loader check specifically targeted to prevent matching standard sidebar/gear icons
  const loader = document.querySelector('.fixed.inset-0.flex.items-center.justify-center');
  if (loader && loader.querySelector('svg')) {
    return true;
  }
  const contentContainer = document.querySelector('.book-content-container');
  if (contentContainer && contentContainer.children.length === 0) {
    return true;
  }
  return false;
}

if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const handleMutations = () => {
    _mutationMicrotaskScheduled = false;
    invalidateReadingViewCache();

    const isLoaderActive = isChapterLoading();

    // Prevent corrupting session references when Svelte is displaying a transition loading spinner
    if (isReadingViewActive() && isLoaderActive) {
      if (lastLoggedPaginatedMode === false) {
        _transitionGraceUntil = Date.now() + 400; // Trigger alignment grace window only on continuous loads
      }
      return;
    }

    // 1. TTU Chrono insert check
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (isReadingViewActive()) {
      const target = findTTUInsertPoint();
      if (target) {
        const readerCfg = getReaderConfig(currentConfig);
        if (readerCfg.enabled !== false) {
          if (!wrapper) {
            setupTTUChronometer();
          } else {
            const expectedParent = (target.pos === 'beforebegin' || target.pos === 'afterend') ? target.el.parentElement : target.el;
            if (wrapper.parentElement !== expectedParent) {
              target.el.insertAdjacentElement(target.pos, wrapper);
            }
          }
        }
      }
    } else {
      if (wrapper) wrapper.remove();
    }

    // Yatsu whispersync layout adjustment: Adjust gap when whispersync is detected on app.yatsu.moe
    if (wrapper) {
      const isYatsu = window.location.hostname.includes('app.yatsu.moe');
      const isWhispersyncActive = isYatsu && !!(
        document.querySelector('.yatsu-whispersync, [class*="whispersync"], [id*="whispersync"]') ||
        Array.from(document.querySelectorAll('button, div, span')).some(el =>
          el.textContent?.toLowerCase().includes('whispersync')
        )
      );
      if (isWhispersyncActive) {
        wrapper.style.setProperty('margin-left', '12px', 'important');
        wrapper.style.setProperty('gap', '12px', 'important');
      } else if (isYatsu) {
        wrapper.style.removeProperty('margin-left');
        wrapper.style.removeProperty('gap');
      }
    }

    if (ttuState.running && isReadingViewActive()) {
      setupProgressObserver();
    }

    // 2. Section transition detector (throttled to max once per 50ms for instantaneous updates)
    const now = Date.now();
    if ((now - _lastSectionCheckTime) >= 50) {
      _lastSectionCheckTime = now;
      const charData = extractAdvancedCharCount();
      if (charData !== null) {
        const { total, sectionIndex, isPaginated } = charData;
        const activeSection = sectionIndex !== null ? sectionIndex : -1;

        // View-Mode Switch Safeguard: Cleanly purge old metrics if we transitioned reading types
        if (lastLoggedPaginatedMode !== null && lastLoggedPaginatedMode !== isPaginated) {
          stateRefs.globalSessionStartChar = -1;
          stateRefs.globalManualCharOffset = 0;
          stateRefs.lastSectionIndex = -1;
          stateRefs.lastSectionTotal = 0;
          stateRefs.visitedSections.clear();
          stateRefs.sessionInitialSectionIndex = -1;
          stateRefs.sessionInitialStartChar = -1;
          ttuState.chars = 0;
          ttuState.timeMs = 0;
          stateRefs.globalLastTick = Date.now();
          lastLoggedPaginatedMode = isPaginated;
          if (!isPaginated) {
            _transitionGraceUntil = Date.now() + 400; // Trigger grace window on continuous view switches
          }
          recalculateChars();
          return;
        }
        lastLoggedPaginatedMode = isPaginated;

        if (stateRefs.lastSectionIndex === -1 && activeSection !== -1) {
          const currentCount = extractAdvancedCharCount();
          initSessionRefs(currentCount !== null ? currentCount.current : 0, activeSection, total, isPaginated);
        }

        if (stateRefs.lastSectionIndex !== activeSection) {
          // Handle temporary non-text pages (e.g. image-only chapters/illustrations) without wiping state
          if (activeSection === -1) {
            if (!isReadingViewActive()) {
              stateRefs.lastSectionIndex = -1;
              stateRefs.globalManualCharOffset = 0;
              stateRefs.visitedSections.clear();
              recalculateChars();
            }
          } else {
            if (activeSection > stateRefs.lastSectionIndex) {
              if (stateRefs.visitedSections.has(activeSection)) {
                stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(activeSection) || 0;
              } else {
                // Accumulate using the verified non-zero previous chapter total
                stateRefs.globalManualCharOffset += stateRefs.lastSectionTotal;
                stateRefs.visitedSections.set(activeSection, stateRefs.globalManualCharOffset);
              }
            } else {
              if (stateRefs.visitedSections.has(activeSection)) {
                stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(activeSection) || 0;
              } else {
                stateRefs.globalManualCharOffset = Math.max(0, stateRefs.globalManualCharOffset - total);
                stateRefs.visitedSections.set(activeSection, stateRefs.globalManualCharOffset);
              }
            }

            // Sync baseline progress boundary so going backward stays clamped at 0 session progress
            if (isPaginated) {
              if (activeSection < stateRefs.sessionInitialSectionIndex) {
                stateRefs.globalSessionStartChar = total;
              } else if (activeSection === stateRefs.sessionInitialSectionIndex) {
                stateRefs.globalSessionStartChar = stateRefs.sessionInitialStartChar;
              } else {
                stateRefs.globalSessionStartChar = 0;
              }
            }

            stateRefs.lastSectionIndex = activeSection;
            stateRefs.lastSectionTotal = total;
            recalculateChars();
          }
        } else if (stateRefs.lastSectionIndex === activeSection && activeSection !== -1) {
          stateRefs.lastSectionTotal = Math.max(stateRefs.lastSectionTotal, total);
        }
      }
    }

    // 3. Theme change tracking (throttled to max once per 2s)
    if ((now - _lastThemeCheckTime) >= 2000) {
      _lastThemeCheckTime = now;
      const activeTheme = getActiveThemeName(currentConfig);
      if (activeTheme === 'match-reader' || activeTheme.startsWith('custom-') || activeTheme.startsWith('custom_') || activeTheme === 'custom') {
        updateActiveThemeStyles(activeTheme, currentConfig);
      }
    }

    // 4. Non-reader Overlay recovery check
    const adapter = getActiveReaderAdapter();
    if (!adapter) {
      if (window.self !== window.top && currentConfig.overlayPosition !== 'hidden' && !getOverlayDismissed()) {
        const overlay = getOverlayElement();
        if (!overlay) {
          checkAndRunOverlay(currentConfig);
        }
      }
    }
  };

  const observer = new MutationObserver(() => {
    // Coalesce mutations synchronously inside the microtask queue to recalculate
    // and redraw UI elements before the browser paints the screen (Eliminates visual flickers)
    if (!_mutationMicrotaskScheduled) {
      _mutationMicrotaskScheduled = true;
      queueMicrotask(handleMutations);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
}

if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((req: any, _s, sendResponse) => {
    if (req.action === 'GET_ACTIVE_TIME') {
      const nt = (window as any).__nt_tracker_session_active_ms__;
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
    showToast(title, msg, event.data.error || title.toLowerCase().includes('fail') || event.data.error || title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
  }
});

function startTimeTracker() {
  let activeMs = 0, lastStamp = Date.now(), isVisible = !document.hidden, isPaused = false;
  const accrue = () => { if (isVisible && !isPaused) { activeMs += Date.now() - lastStamp; lastStamp = Date.now(); } };
  const getTotal = () => activeMs + (isVisible && !isPaused ? Date.now() - lastStamp : 0);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { accrue(); isVisible = false; } else { lastStamp = Date.now(); isVisible = true; }
  });

  (window as any).__nt_tracker_session_active_ms__ = {
    getTotal,
    setMs: (ms: number) => { accrue(); activeMs = ms; lastStamp = Date.now(); },
    pause: (p: boolean) => { if (p) { accrue(); isPaused = true; } else { lastStamp = Date.now(); isPaused = false; } },
    isPaused: () => isPaused
  };
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['config']) {
    const newCfg: any = changes['config'].newValue || {};
    currentConfig = newCfg;

    const themeName = getActiveThemeName(newCfg);
    try {
      updateActiveThemeStyles(themeName, newCfg);
    } catch (e) {
      // Prevent crash on standard webpages
    }

    const adapter = getActiveReaderAdapter();
    if (adapter) {
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
        wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
      }
    } else {
      if (window.self !== window.top) return;

      if (isWebsiteOverlaySkipped(newCfg) || getOverlayDismissed()) {
        const overlay = getOverlayElement();
        if (overlay) overlay.style.display = 'none';
        return;
      }

      let customColors: any = undefined;
      if (themeName.startsWith('custom_') || themeName.startsWith('custom-') || themeName === 'custom') {
        const id = themeName.replace('custom_', '').replace('custom-', '');
        const customTheme = (newCfg.customThemes || []).find((t: any) => t.id === id || t.id === themeName);
        if (customTheme) {
          customColors = customTheme.colors;
        } else if (newCfg.customColors) {
          customColors = newCfg.customColors;
        }
      }

      injectThemeStyles(themeName, newCfg.font ?? 'sans', customColors);

      const existingOverlay = getOverlayElement();
      if (existingOverlay) {
        const overlayPos = newCfg.overlayPosition ?? 'top-right';
        if (overlayPos !== 'hidden') {
          existingOverlay.style.setProperty('display', 'flex', 'important');
          applyOverlayPosition(existingOverlay, overlayPos);
          injectOverlayCustomOverrides();
          enforceOverlayLayout(existingOverlay);

          const pauseBtn = existingOverlay.querySelector('.nt-ctrl[title="Pause / Resume"]') as HTMLButtonElement;
          if (pauseBtn) {
            updatePauseIconState(pauseBtn, pauseBtn.textContent === '▶');
          }
          const resetBtn = existingOverlay.querySelector('.nt-ctrl[title="Reset timer"]') as HTMLElement;
          if (resetBtn) resetBtn.style.setProperty('font-size', '11px', 'important');
          const closeBtn = existingOverlay.querySelector('.nt-close') as HTMLElement;
          if (closeBtn) closeBtn.style.setProperty('font-size', '12px', 'important');
        } else {
          existingOverlay.style.setProperty('display', 'none', 'important');
        }
        return;
      }

      checkAndRunOverlay(newCfg);
    }
  }

  if (area === 'local' && changes['ttuHistory']) {
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) {
      wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
      wrapper.dispatchEvent(new CustomEvent('nt-history-refresh'));
    }
  }

  if (area === 'local' && changes['readingQueue']) {
    const queue = (changes['readingQueue'].newValue as any[]) || [];
    const rawTitle = getTTUTitle();
    const parsedRaw = parseTitleWithConfig(rawTitle).query;

    // Robust Core Title matching to avoid resetting the session on slight chapter/page title drifts
    const existing = queue.find((q: any) => {
      const qParsed = parseTitleWithConfig(q.originalTitle || q.contentTitleNative || '').query;
      return qParsed === parsedRaw;
    });

    if (!existing && ttuState.timeMs > 0) {
      ttuState.timeMs = 0;
      ttuState.chars = 0;
      stateRefs.globalLastTick = Date.now();

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
    const cfg = currentConfig;

    const themeName = getActiveThemeName(cfg);
    updateActiveThemeStyles(themeName, cfg);

    const adapter = getActiveReaderAdapter();
    if (adapter) {
      const readerCfg = getReaderConfig(cfg);
      if (!readerCfg.enabled) return;
      startTimeTracker();
      setupTTUChronometer();
      return;
    }

    if (isWebsiteOverlaySkipped(cfg)) return;
    startTimeTracker();
    if (cfg.overlayPosition === 'hidden') return;

    if (window.self !== window.top) return;

    let customColors: any = undefined;
    if (themeName.startsWith('custom_') || themeName.startsWith('custom-') || themeName === 'custom') {
      const id = themeName.replace('custom_', '').replace('custom-', '');
      const customTheme = (cfg.customThemes || []).find((t: any) => t.id === id || t.id === themeName);
      if (customTheme) {
        customColors = customTheme.colors;
      } else if (cfg.customColors) {
        customColors = cfg.customColors;
      }
    }

    injectThemeStyles(themeName, cfg.font ?? 'sans', customColors);
    checkAndRunOverlay(cfg);
  },
});