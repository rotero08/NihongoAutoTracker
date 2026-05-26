/**
 * ── Text Tracker Content Script ──────────────────────────────────────────────
 */
import { defineContentScript } from '#imports';
import { configStorage } from '@/lib/storage/config';
import { readingQueueStorage } from '@/lib/storage/queues';
import { ttuHistoryStorage, ttuLinkStorage } from '@/lib/storage/ttu';
import { addDebugLog } from '@/lib/storage/debug';
import { JP_DOMAINS_DEFAULT, JP_RE } from '@/lib/constants';
import { parseTitle } from '@/lib/utils/text-parsing';
import { showToast } from '@/lib/utils/toast';
import { getActiveReaderAdapter } from '@/lib/adapters/readers';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';
import { fmt } from '@/lib/utils/time';
import { setupTTUChronometerUI } from '@/lib/ui/ttu-chrono';
import {
  getActiveThemeName,
  updateActiveThemeStyles,
  getReaderConfig
} from '@/lib/ui/text-tracker-theme-manager';
import {
  runOverlaySetup,
  updatePauseIconState,
  applyOverlayPosition,
  enforceOverlayLayout,
  injectOverlayCustomOverrides,
  getOverlayDismissed,
  isWebsiteOverlaySkipped
} from '@/lib/ui/reader-overlay';
import '@/assets/overlay.css';

let currentConfig: any = {};
let isAnalyzingPage = false;
let cachedIsJapanese: boolean | null = null;

// Trackers to optimize mutation and chrono lookups
let progressObserver: MutationObserver | null = null;
let scrollTimeout: any = null;
let isChronoInitializing = false;

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
  const sample = (document.body?.innerText ?? '').slice(0, 8000);
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
}

const stateRefs: StateRefs = {
  globalSessionStartChar: -1,
  globalManualCharOffset: 0,
  globalLastTick: Date.now(),
  lastSectionIndex: -1,
  lastSectionTotal: 0,
  visitedSections: new Map<number, number>()
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
  title = title.replace(/\s*\|\s*(ッツ Ebook Reader|Yatsu Reader|Manabe Reader)\s*/i, '');
  title = title.replace(/\s*[–—-]\s*ttu.*$/i, '');
  return title.trim() || document.title;
}

function parseTitleWithConfig(docTitle: string) {
  return parseTitle(docTitle, currentConfig.titleRegexes);
}

function getReaderName() {
  const adapter = getActiveReaderAdapter();
  return adapter ? adapter.name : 'Reader';
}

function isReadingViewActive(): boolean {
  const path = window.location.pathname;
  if (path.includes('/settings') || path === '/' || path === '') {
    return false;
  }
  const hasContainer = !!(
    document.querySelector('.book-content-container') ||
    document.querySelector('.book-content') ||
    document.querySelector('[data-ref="container"]') ||
    document.querySelector('.reader-container') ||
    document.querySelector('#reader-container') ||
    document.querySelector('.reader-wrapper')
  );
  return hasContainer;
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

  const adapter = getActiveReaderAdapter();
  if (adapter) {
    const pt = adapter.findInsertPoint();
    if (pt) return pt;
  }

  return null;
}

function getTtuNativeProgressFromDom(): { current: number; total: number } | null {
  try {
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
        return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
      }
    }

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
            return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
          }
        }
      }
    }
  } catch (e) { }
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

  if (isAnalyzingPage) return;
  const existing = document.getElementById('nt-overlay');
  if (existing) return;

  isAnalyzingPage = true;
  try {
    const isJP = await isJapanesePage(cfg);
    if (isJP && cfg.overlayPosition !== 'hidden' && !document.getElementById('nt-overlay')) {
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

    (window as any).ntChronoInterval = setInterval(() => {
      if (!isReadingViewActive()) {
        if (ttuState.running) {
          ttuState.running = false;
          const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
          if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
        }
        return;
      }

      if (ttuState.running && !document.hidden) {
        const now = Date.now();
        ttuState.timeMs += (now - stateRefs.globalLastTick);

        const charData = extractAdvancedCharCount();
        if (charData !== null) {
          const { current } = charData;

          if (stateRefs.globalSessionStartChar === -1) {
            stateRefs.globalSessionStartChar = current;
            addDebugLog('INFO', 'TextTracker', 'Set session starting baseline', { baseline: current });
          }

          let diff = current - stateRefs.globalSessionStartChar;
          if (diff < 0) diff = 0;

          let calculatedChars = diff + stateRefs.globalManualCharOffset;

          const nativeTtuProgress = getTtuNativeProgressFromDom();

          ttuState.chars = calculatedChars;

          addDebugLog('INFO', 'TextTracker', 'Chronometer Tick Progress', {
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

if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(() => {
    // 1. TTU Chrono insert check
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    const target = findTTUInsertPoint();
    if (isReadingViewActive()) {
      if (target) {
        const readerCfg = getReaderConfig(currentConfig);
        if (readerCfg.enabled !== false) {
          if (!wrapper) {
            setupTTUChronometer();
          } else {
            const expectedParent = (target.pos === 'beforebegin' || target.pos === 'afterend') ? target.el.parentElement : target.el;
            if (wrapper.parentElement !== expectedParent) {
              target.el.insertAdjacentElement(target.pos, wrapper);
              addDebugLog('INFO', 'TextTracker', 'Moved chrono wrapper to correct insert point');
            }
          }
        }
      }
    } else {
      if (wrapper) {
        wrapper.remove();
        addDebugLog('INFO', 'TextTracker', 'Removed chrono wrapper as reading view is inactive');
      }
    }

    if (ttuState.running && isReadingViewActive()) {
      setupProgressObserver();
    }

    // 2. High-Performance Container Transition detector.
    const charData = extractAdvancedCharCount();
    if (charData !== null) {
      const { total, sectionIndex, isPaginated } = charData;
      const activeSection = sectionIndex !== null ? sectionIndex : -1;

      if (stateRefs.lastSectionIndex !== activeSection) {
        // Handle temporary non-text pages (e.g. image-only chapters/illustrations) without wiping state
        if (activeSection === -1) {
          if (!isReadingViewActive()) {
            stateRefs.lastSectionIndex = -1;
            stateRefs.globalManualCharOffset = 0;
            stateRefs.visitedSections.clear();
            addDebugLog('INFO', 'TextTracker', 'Reset dynamic tracking baseline to 0. Cleared visitedSections cache.');
            recalculateChars();
          } else {
            addDebugLog('INFO', 'TextTracker', 'Temporary non-text page encountered within active session. Preserving state.');
          }
        } else {
          addDebugLog('INFO', 'TextTracker', 'Section transition detected', {
            from: stateRefs.lastSectionIndex,
            to: activeSection
          });

          if (isPaginated) {
            stateRefs.globalSessionStartChar = 0;
            addDebugLog('INFO', 'TextTracker', 'Paginated transition. Initialized baseline to 0.');
          } else {
            stateRefs.globalSessionStartChar = -1;
          }

          if (stateRefs.lastSectionIndex === -1) {
            stateRefs.lastSectionIndex = activeSection;
            stateRefs.lastSectionTotal = total;
            stateRefs.visitedSections.set(activeSection, 0);
          }

          if (stateRefs.lastSectionIndex !== activeSection) {
            if (activeSection > stateRefs.lastSectionIndex) {
              if (stateRefs.visitedSections.has(activeSection)) {
                stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(activeSection) || 0;
              } else {
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
          }

          stateRefs.lastSectionIndex = activeSection;
          stateRefs.lastSectionTotal = total;
          recalculateChars();
        }
      }
    }

    // 3. Real-time background color theme change tracking.
    const activeTheme = getActiveThemeName(currentConfig);
    if (activeTheme === 'match-reader' || activeTheme.startsWith('custom-') || activeTheme.startsWith('custom_') || activeTheme === 'custom') {
      updateActiveThemeStyles(activeTheme, currentConfig);
    }

    // 4. Non-reader Overlay recovery check
    const adapter = getActiveReaderAdapter();
    if (!adapter) {
      if (window.self !== window.top && currentConfig.overlayPosition !== 'hidden' && !getOverlayDismissed()) {
        const overlay = document.getElementById('nt-overlay');
        if (!overlay) {
          addDebugLog('INFO', 'TextTracker', 'Overlay removed by host page DOM changes. Rebuilding overlay...');
          checkAndRunOverlay(currentConfig);
        }
      }
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
    showToast(title, msg, event.data.error || title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
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
    updateActiveThemeStyles(themeName, newCfg);

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
        const btnLog = wrapper.querySelector('#nt-ttu-btn-log') as HTMLButtonElement;
        if (isEnabled && newReaderCfg.autoSave !== false) {
          btnLog.disabled = true; btnLog.style.opacity = '0.3'; btnLog.style.cursor = 'not-allowed'; btnLog.title = 'Auto-sync is enabled (Sends automatically via Settings Queue)';
        } else if (isEnabled) {
          btnLog.disabled = false; btnLog.style.opacity = '1'; btnLog.style.cursor = 'pointer'; btnLog.title = 'Save & Queue';
        }
      }
    } else {
      if (window.self !== window.top) return;

      if (isWebsiteOverlaySkipped(newCfg) || getOverlayDismissed()) {
        const overlay = document.getElementById('nt-overlay');
        if (overlay) overlay.style.display = 'none';
        return;
      }

      const existingOverlay = document.getElementById('nt-overlay');
      if (existingOverlay) {
        if (newCfg.overlayPosition !== 'hidden') {
          existingOverlay.style.setProperty('display', 'flex', 'important');
          applyOverlayPosition(existingOverlay, newCfg.overlayPosition);
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
    const existing = queue.find((q: any) => q.originalTitle === rawTitle || q.contentTitleNative === rawTitle);

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
    checkAndRunOverlay(cfg);
  },
});