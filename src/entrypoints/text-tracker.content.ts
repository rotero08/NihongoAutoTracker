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
let isAnalyzingPage = false;
let cachedIsJapanese: boolean | null = null;

// Trackers to optimize mutation and chrono lookups
let lastObservedContainerId = '';
let progressObserver: MutationObserver | null = null;
let scrollTimeout: any = null;
let isChronoInitializing = false;

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
  const host = window.location.hostname;
  if (host.includes('app.yatsu.moe')) return 'Yatsu Reader';
  if (host.includes('manga.manabe.es')) return 'Manabe Reader';
  if (host.includes('reader.ttsu.app')) return 'TTU Reader';
  return 'Reader';
}

/**
 * Validates if the user is currently looking at active reading content.
 */
function isReadingViewActive(): boolean {
  const path = window.location.pathname;
  if (path.includes('/settings') || path === '/' || path === '') {
    return false;
  }
  const hasContainer = !!(
    document.querySelector('.book-content-container') ||
    document.querySelector('.book-content') ||
    document.querySelector('[data-ref="container"]') ||
    document.querySelector('.reader-container')
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

  const charData = extractAdvancedCharCount();
  if (charData !== null) {
    const { current } = charData;

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
  if (document.getElementById('nt-ttu-chrono-wrapper')) return;

  isChronoInitializing = true;
  try {
    const pt = findTTUInsertPoint();
    if (!pt) return;

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
    if (target && !wrapper) {
      const readerCfg = getReaderConfig(currentConfig);
      if (readerCfg.enabled !== false) setupTTUChronometer();
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
        addDebugLog('INFO', 'TextTracker', 'Section transition detected', {
          from: stateRefs.lastSectionIndex,
          to: activeSection
        });

        if (isPaginated && activeSection !== -1) {
          stateRefs.globalSessionStartChar = 0;
          addDebugLog('INFO', 'TextTracker', 'Paginated transition. Initialized baseline to 0.');
        } else {
          stateRefs.globalSessionStartChar = -1;
        }

        if (activeSection === -1) {
          stateRefs.lastSectionIndex = -1;
          stateRefs.globalManualCharOffset = 0;
          stateRefs.visitedSections.clear();
          addDebugLog('INFO', 'TextTracker', 'Reset dynamic tracking baseline to 0. Cleared visitedSections cache.');
        } else {
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
        }

        recalculateChars();
      }
    }

    // 3. Non-TTU Overlay recovery check
    if (!TTU_HOSTS.some(h => window.location.hostname.includes(h))) {
      if (window.self === window.top && currentConfig.overlayPosition !== 'hidden' && !websiteOverlayDismissed) {
        const overlay = document.getElementById('nt-overlay');
        if (!overlay) {
          addDebugLog('INFO', 'TextTracker', 'Overlay removed by host page DOM changes. Rebuilding overlay...');
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

  (window as any).__nt_tracker_session_active_ms__ = {
    getTotal,
    setMs: (ms: number) => { accrue(); activeMs = ms; lastStamp = Date.now(); },
    pause: (p: boolean) => { if (p) { accrue(); isPaused = true; } else { lastStamp = Date.now(); isPaused = false; } },
    isPaused: () => isPaused
  };
}

function runOverlaySetup(cfg: any) {
  addDebugLog('INFO', 'TextTracker', `Building Overlay`, {
    url: window.location.href,
    pos: cfg.overlayPosition
  });

  buildOverlay(
    cfg,
    { dismissed: websiteOverlayDismissed },
    (isPaused) => { (window as any).__nt_tracker_session_active_ms__.pause(isPaused); },
    () => { (window as any).__nt_tracker_session_active_ms__.setMs(0); },
    (ms) => { (window as any).__nt_tracker_session_active_ms__.setMs(ms); },
    () => (window as any).__nt_tracker_session_active_ms__.getTotal(),
    () => { websiteOverlayDismissed = true; }
  );

  const overlay = document.getElementById('nt-overlay');
  if (!overlay) return;

  if (overlay.parentElement === document.body) {
    document.documentElement.appendChild(overlay);
  }
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
      if (window.self !== window.top) return;

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
    const host = window.location.hostname;
    const cfg = currentConfig;

    injectThemeStyles(cfg.theme ?? 'nihongo', cfg.font ?? 'mono');

    if (TTU_HOSTS.some(h => host.includes(h))) {
      const readerCfg = getReaderConfig(cfg);
      if (!readerCfg.enabled) return;
      startTimeTracker();
      return;
    }

    if (isWebsiteOverlaySkipped(cfg)) return;
    startTimeTracker();
    if (cfg.overlayPosition === 'hidden') return;

    if (window.self !== window.top) return;
    checkAndRunOverlay(cfg);
  },
});