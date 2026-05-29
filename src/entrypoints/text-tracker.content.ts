/**
 * ── Text Tracker Content Script ──────────────────────────────────────────────
 */
import { defineContentScript } from '#imports';
import '@/assets/text-tracker.css';
import { getActiveReaderAdapter } from '@/lib/adapters/readers';
import { JP_DOMAINS_DEFAULT } from '@/lib/constants';
import { configStorage } from '@/lib/storage/config';
import { addDebugLog } from '@/lib/storage/debug';
import { readingQueueStorage, updateReadingQueueAtomic } from '@/lib/storage/queues';
import { ttuLinkStorage, ttuHistoryStorage } from '@/lib/storage/ttu';
import { TimerEngine } from '@/lib/utils/timer'; // Class unified
import {
  getOverlayDismissed,
  applyOverlayPosition,
  injectOverlayCustomOverrides,
  enforceOverlayLayout,
  updatePauseIconState,
  isWebsiteOverlaySkipped,
  injectThemeStyles
} from '@/lib/ui/reader-overlay';
import { getActiveThemeName, getReaderConfig, applyActiveTheme, applyCustomThemeToDoc, clearCustomThemeFromDoc, clearThemeDetectionCache } from '@/lib/ui/text-tracker-theme-manager';
import { extractAdvancedCharCount, clearExtractorCache } from '@/lib/utils/reader-char-extractor';
import { parseTitle } from '@/lib/utils/text-parsing';
import { showToast } from '@/lib/utils/toast';
import { DOMMutationStabilizer } from '@/lib/utils/dom-mutation-stabilizer';
import { OverlayController } from '@/lib/utils/overlay-controller';
import { mount, unmount } from 'svelte';
import TtuChronoDropdown from '@/components/TtuChronoDropdown.svelte';
import type { QueuedReadingLog, ReadingMediaData } from '@/lib/types';

const isRelevantFrame = typeof window !== 'undefined' && typeof window.location !== 'undefined' && !!window.location.hostname && (
  window.self === window.top ||
  window.location.hostname.includes('manga.manabe.es') ||
  window.location.hostname.includes('reader.ttsu.app') ||
  window.location.hostname.includes('app.yatsu.moe') ||
  window.location.hostname.includes('yomiyasu')
);

let currentConfig: any = {};
let isAnalyzingPage = false;
let cachedIsJapanese: boolean | null = null;

let progressObserver: MutationObserver | null = null;
let scrollTimeout: any = null;
let isChronoInitializing = false;

let mountedChronoComponent: any = null;

let _readingViewCache: boolean | null = null;
let _readingViewCacheTime = 0;
const READING_VIEW_CACHE_TTL = 500; // ms
let _wasReadingViewActive = false;

let _insertPointCache: { el: Element; pos: InsertPosition } | null = null;

let _mutationRafScheduled = false;
let _mutationTimeout: any = null;
let _instantThemeSyncScheduled = false;
let _lastSectionCheckTime = 0;
let _lastThemeCheckTime = 0;
let _transitionGraceUntil = 0;

let _lastRecalculateTime = 0;
const RECALCULATE_THROTTLE_MS = 250;

let hasSyncedThisSession = false;
let _cachedAutoSave: boolean = true;

// Throttling storage write states to eliminate continuous cross-process serialization overhead
let _lastStorageWriteTime = 0;
const STORAGE_WRITE_THROTTLE_MS = 10000; // 10 seconds

let _lastThemeSyncTime = 0;
const THEME_SYNC_THROTTLE_MS = 250;

// Yatsu settings sidebar tracking states
let _wasTimerRunningBeforeYatsuSidebar = false;
let _isYatsuSidebarCurrentlyOpen = false;

const overlayController = new OverlayController((cfg) => isJapanesePage(cfg));

const setChronoButtonDisabled = (disabled: boolean, message?: string) => {
  const btn = document.getElementById('nt-ttu-chrono-btn') as HTMLButtonElement;
  const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
  if (btn) {
    let tooltip = wrapper?.querySelector('.nt-chrono-tooltip') as HTMLElement;
    if (disabled) {
      btn.classList.add('nt-btn-suspended');
      btn.style.setProperty('opacity', '0.6', 'important');
      btn.style.setProperty('pointer-events', 'auto', 'important');
      btn.style.setProperty('cursor', 'help', 'important');

      if (!tooltip && wrapper) {
        tooltip = document.createElement('div');
        tooltip.className = 'nt-chrono-tooltip';
        Object.assign(tooltip.style, {
          position: 'absolute',
          bottom: '38px',
          left: '0',
          transform: 'translateY(5px)',
          background: 'rgba(20, 20, 25, 0.95)',
          color: '#f5a623',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '11px',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
          border: '1px solid rgba(245, 166, 35, 0.3)',
          zIndex: '10000',
          opacity: '0',
          pointerEvents: 'none',
          transition: 'opacity 0.2s ease, transform 0.2s ease'
        });
        wrapper.appendChild(tooltip);
      }
      if (tooltip) {
        tooltip.textContent = message || 'Waiting for Jiten to finish processing layout...';
      }
    } else {
      btn.classList.remove('nt-btn-suspended');
      btn.style.removeProperty('opacity');
      btn.style.removeProperty('pointer-events');
      btn.style.removeProperty('cursor');
      btn.setAttribute('title', 'Click to open Tracker Menu or Double Click to toggle Tracker');
      if (tooltip) tooltip.remove();
    }
  }
};

const updateDropdownOverlayState = (active: boolean, message?: string) => {
  const dropdown = document.getElementById('nt-ttu-dropdown');
  if (!dropdown) return;

  const overlay = dropdown.querySelector('.nt-stabilize-overlay') as HTMLElement | null;
  if (active) {
    dropdown.style.setProperty('pointer-events', 'none', 'important');
    if (!overlay) {
      const newOverlay = document.createElement('div');
      newOverlay.className = 'nt-stabilize-overlay';
      Object.assign(newOverlay.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        background: 'rgba(15, 15, 20, 0.75)',
        backdropFilter: 'blur(2.5px)',
        webkitBackdropFilter: 'blur(2.5px)',
        color: '#aaa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        textalign: 'center',
        padding: '16px',
        borderRadius: '8px',
        zIndex: '9999'
      } as any);
      dropdown.appendChild(newOverlay);
      newOverlay.textContent = message || 'Waiting for Jiten to finish processing layout...';
    } else {
      overlay.textContent = message || 'Waiting for Jiten to finish processing layout...';
    }
  } else {
    dropdown.style.removeProperty('pointer-events');
    if (overlay) overlay.remove();
  }
};

const stabilizer = new DOMMutationStabilizer(
  { get running() { return ttuState.running; } },
  setChronoButtonDisabled,
  updateDropdownOverlayState,
  () => recalculateChars(),
  (active) => {
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) {
      wrapper.dispatchEvent(new CustomEvent('nt-jiten-status', { detail: { parsing: active } }));
    }
    const btn = document.getElementById('nt-ttu-chrono-btn') as HTMLElement;
    if (btn && wrapper) {
      let tooltip = wrapper.querySelector('.nt-chrono-tooltip') as HTMLElement;
      if (active) {
        btn.classList.add('nt-btn-suspended-running');
        btn.style.setProperty('cursor', 'help', 'important');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.className = 'nt-chrono-tooltip';
          Object.assign(tooltip.style, {
            position: 'absolute',
            bottom: '38px',
            left: '0',
            transform: 'translateY(5px)',
            background: 'rgba(20, 20, 25, 0.95)',
            color: '#f5a623',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '11px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
            border: '1px solid rgba(245, 166, 35, 0.3)',
            zIndex: '10000',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity 0.2s ease, transform 0.2s ease'
          });
          wrapper.appendChild(tooltip);
        }
        tooltip.textContent = 'Waiting for Jiten to finish processing layout... Double-click to pause.';
      } else {
        btn.classList.remove('nt-btn-suspended-running');
        btn.style.removeProperty('cursor');
        if (tooltip) tooltip.remove();
      }
    }
  }
);

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
  const jpCount = (sample.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
  const result = jpCount >= 40;

  if (import.meta.env.DEV) {
    console.log(`[NAT DEV - TextTracker] Analyzed Host Language Context`, {
      host,
      japaneseCharsFound: jpCount,
      isJapanese: result
    });
  }

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

const ttuState = new Proxy({
  id: crypto.randomUUID(),
  running: false,
  timeMs: 0,
  chars: 0,
}, {
  set(target, prop, value) {
    if (prop === 'running') {
      const wasRunning = target.running;
      const isRunning = !!value;
      target.running = isRunning;
      if (wasRunning && !isRunning) {
        stabilizer.handleTimerPaused();
        // Force synchronous storage write on pause to prevent any visual data latency
        if (getReaderConfig(currentConfig).autoSave !== false) {
          liveSyncQueue(true);
        }
      }
      const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
      if (wrapper) {
        wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
      }
      return true;
    }
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
      const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
      if (wrapper) {
        wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
      }
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

let lastLoggedPaginatedMode: boolean | null = null;

// Cleaned reader name lookup
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

  const adapter = getActiveReaderAdapter();
  if (!adapter) {
    if (path.includes('/settings') || path === '/' || path === '') {
      _readingViewCache = false;
      _readingViewCacheTime = now;
      return false;
    }
  } else {
    if (path.includes('/settings')) {
      _readingViewCache = false;
      _readingViewCacheTime = now;
      return false;
    }
  }

  const container = document.querySelector(
    '.book-content-container, .book-content, [data-ref="container"], .reader-container, #reader-container, .reader-wrapper, .writing-container, #writing-container'
  );
  const hasContainer = !!container;
  _readingViewCache = hasContainer;
  _readingViewCacheTime = now;
  return hasContainer;
}

function invalidateReadingViewCache() {
  _readingViewCache = null;
  _insertPointCache = null; // Ensure stale insert points are fully cleared on route transitions!
  clearExtractorCache();
}

function safelySetAdapterName(adapter: any, name: string | null) {
  if (!adapter) return;
  try {
    Object.defineProperty(adapter, 'name', {
      value: name,
      writable: true,
      configurable: true
    });
  } catch (e) {
    try {
      adapter.name = name;
    } catch (err) { }
  }
}

function getActiveThemeConfig(cfg: any) {
  const activeThemeCfg = { ...cfg, syncPopupWithReaderTheme: true };
  const adapter = getActiveReaderAdapter();
  if (adapter) {
    const name = adapter.name || '';
    if (name.includes('Yatsu')) {
      activeThemeCfg.ttuThemeOverride = cfg.yatsuThemeOverride;
      activeThemeCfg.ttuThemeOverrideId = cfg.yatsuThemeOverrideId;
      activeThemeCfg.ttuCustomColors = cfg.yatsuCustomColors;
    } else if (name.includes('YomiYasu')) {
      activeThemeCfg.ttuThemeOverride = cfg.yomiyasuThemeOverride;
      activeThemeCfg.ttuThemeOverrideId = cfg.yomiyasuThemeOverrideId;
      activeThemeCfg.ttuCustomColors = cfg.yomiyasuCustomColors;
    }
  }
  return activeThemeCfg;
}

async function liveSyncQueue(force = false) {
  if (isSyncing || (ttuState.timeMs === 0 && ttuState.chars === 0)) return;

  const now = Date.now();
  if (!force && (now - _lastStorageWriteTime < STORAGE_WRITE_THROTTLE_MS)) {
    return;
  }
  _lastStorageWriteTime = now;

  isSyncing = true;

  try {
    const rawTitle = getTTUTitle();
    const { query: parsedTitle, volume: parsedVolume } = parseTitleWithConfig(rawTitle);
    const dateStr = new Date().toISOString();
    const secs = Math.round(ttuState.timeMs / 1000);

    const linkMap = await ttuLinkStorage.getValue() || {};
    const linkedMedia = linkMap[rawTitle];
    const targetVolume = linkedMedia ? Math.max(1, Number(linkedMedia.volume || 1)) : Math.max(1, Number(parsedVolume || 1));

    await updateReadingQueueAtomic(async (queue) => {
      let existing = queue.find(q => {
        if (q.originalTitle === rawTitle) return true;
        const qParsed = parseTitleWithConfig(q.originalTitle || q.contentTitleNative || '');
        return qParsed.query === parsedTitle && (qParsed.volume || 1) === targetVolume;
      });

      // Swapped disk storage logging for a lightweight compiler-optimized development warning
      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - TextTracker] liveSyncQueue executed`, { rawTitle, parsedTitle, timeMs: ttuState.timeMs, chars: ttuState.chars });
      }

      if (!existing) {
        existing = {
          id: crypto.randomUUID(), type: 'reading',
          contentTitleNative: parsedTitle,
          contentTitleEnglish: '',
          originalTitle: rawTitle,
          description: parsedTitle,
          chars: ttuState.chars, time: secs,
          volume: targetVolume,
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
          if (targetVolume !== undefined && !existing.volume) {
            existing.volume = targetVolume;
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

      if (linkedMedia && linkedMedia.mediaId !== 'web-reading') {
        existing.mediaId = String(linkedMedia.mediaId);
        existing.mediaData = linkedMedia.mediaData;
        existing.volume = linkedMedia.volume;
        existing.contentTitleNative = linkedMedia.mediaData.contentTitleNative || existing.contentTitleNative;
        existing.contentTitleEnglish = linkedMedia.mediaData.contentTitleEnglish || existing.contentTitleEnglish;
        existing.description = linkedMedia.mediaData.contentTitleNative || existing.contentTitleNative;
      }

      return queue;
    });

    hasSyncedThisSession = true;
  } finally {
    isSyncing = false;
  }
}

async function saveSessionAndQueue() {
  if (ttuState.timeMs === 0 && ttuState.chars === 0) return;

  // Direct manual save -> persistent log inside active RAM storage
  await addDebugLog('INFO', 'TextTracker', `Saving explicit TTU session`, { chars: ttuState.chars, timeMs: ttuState.timeMs });

  const title = getTTUTitle();
  const dateStr = new Date().toISOString();
  const sessionLog = { id: ttuState.id, date: dateStr, timeMs: ttuState.timeMs, chars: ttuState.chars };

  const history = await ttuHistoryStorage.getValue() || {};
  if (!history[title]) history[title] = [];
  history[title].push(sessionLog);
  await ttuHistoryStorage.setValue(history);

  await liveSyncQueue(true); // Force sync immediately on explicit save actions

  ttuState.id = crypto.randomUUID();
  ttuState.timeMs = 0;
  ttuState.chars = 0;

  const currentCount = extractAdvancedCharCount(undefined, ttuState.running);
  stateRefs.globalSessionStartChar = currentCount !== null ? currentCount.current : -1;
  stateRefs.globalManualCharOffset = 0;
  stateRefs.lastSectionIndex = -1;
  stateRefs.lastSectionTotal = 0;
  stateRefs.visitedSections.clear();
  stateRefs.globalLastTick = Date.now();
  ttuState.running = false;
  hasSyncedThisSession = false;

  showToast('Success', 'Session queued!');
}

function findTTUInsertPoint(): { el: Element; pos: InsertPosition } | null {
  if (typeof document === 'undefined') return null;

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

function recalculateChars() {
  if (!ttuState.running || stabilizer.getGracePeriodActive()) return;

  const now = Date.now();
  if (now - _lastRecalculateTime < RECALCULATE_THROTTLE_MS) {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      recalculateChars();
    }, RECALCULATE_THROTTLE_MS);
    return;
  }
  _lastRecalculateTime = now;

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

function runInstantThemeSync() {
  _lastThemeCheckTime = Date.now();
  const activeThemeCfg = getActiveThemeConfig(currentConfig);
  const adapter = getActiveReaderAdapter();
  const originalName = adapter ? adapter.name : null;
  if (adapter && originalName && (originalName.includes('Yatsu') || originalName.includes('YomiYasu'))) {
    safelySetAdapterName(adapter, 'ッツ Ebook Reader');
  }
  const activeTheme = getActiveThemeName(activeThemeCfg);
  if (activeTheme === 'match-reader' || activeTheme.startsWith('custom-') || activeTheme.startsWith('custom_') || activeTheme === 'custom') {
    applyActiveTheme(activeThemeCfg).catch(() => { });
  }
  if (adapter && originalName) {
    safelySetAdapterName(adapter, originalName);
  }
}

function scheduleInstantThemeSync() {
  if (_instantThemeSyncScheduled) return;

  const now = Date.now();
  const timeSinceLastSync = now - _lastThemeSyncTime;

  if (timeSinceLastSync < THEME_SYNC_THROTTLE_MS) {
    _instantThemeSyncScheduled = true;
    setTimeout(() => {
      _instantThemeSyncScheduled = false;
      if ((window as any).__nt_applying_theme__) {
        return;
      }
      _lastThemeSyncTime = Date.now();
      runInstantThemeSync();
    }, THEME_SYNC_THROTTLE_MS - timeSinceLastSync);
    return;
  }

  _instantThemeSyncScheduled = true;
  requestAnimationFrame(() => {
    _instantThemeSyncScheduled = false;
    if ((window as any).__nt_applying_theme__) {
      return;
    }
    _lastThemeSyncTime = Date.now();
    runInstantThemeSync();
  });
}

function isYatsuSidebarOpen(): boolean {
  if (window.location.hostname !== 'app.yatsu.moe') return false;

  const body = document.body;
  if (!body) return false;

  const els = body.querySelectorAll(
    'aside, [role="dialog"], [class*="drawer"], [class*="modal"], [class*="backdrop"], [class*="overlay"]'
  );

  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const id = el.id;
    if (
      id === 'nt-ttu-chrono-wrapper' ||
      id === 'nt-overlay' ||
      id === 'nt-toast-container' ||
      el.classList.contains('nt-toast') ||
      el.closest('#nt-ttu-chrono-wrapper') ||
      el.closest('#nt-overlay')
    ) {
      continue;
    }

    if ((el as HTMLElement).offsetParent !== null || el.getAttribute('aria-hidden') !== 'true') {
      return true;
    }
  }

  return false;
}

async function setupTTUChronometer() {
  if (isChronoInitializing) return;

  const active = isReadingViewActive();
  if (!active) {
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) {
      wrapper.remove();
    }
    return;
  }
  if (document.getElementById('nt-ttu-chrono-wrapper')) {
    return;
  }

  isChronoInitializing = true;
  try {
    const pt = findTTUInsertPoint();
    if (!pt) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'nt-ttu-chrono-wrapper';

    const isFloating = !document.getElementById('ttu-page-footer') && !document.querySelector('div[title="Click to copy Progress"]');
    if (isFloating) {
      wrapper.classList.add('nt-floating');
    }

    pt.el.insertAdjacentElement(pt.pos, wrapper);

    mountedChronoComponent = mount(TtuChronoDropdown, {
      target: wrapper,
      props: {
        ttuState,
        stateRefs,
        getTTUTitle,
        parseTitleWithConfig,
        extractTTUCharCount: () => extractAdvancedCharCount(undefined, ttuState.running),
        getReaderName,
        getCurrentReaderConfig: () => {
          const rCfg = getReaderConfig(currentConfig) || {};
          return {
            ...rCfg,
            hideUnavailableActions: currentConfig.hideUnavailableActions ?? false
          };
        },
        liveSyncQueue: (force = false) => liveSyncQueue(force),
        saveSessionAndQueue,
      }
    });

    setupProgressObserver();
    stabilizer.runGracePeriodIfJiten();

    if ((window as any).ntChronoInterval) {
      clearInterval((window as any).ntChronoInterval);
    }

    (window as any).ntChronoInterval = setInterval(() => {
      if (document.hidden) {
        if (ttuState.running) {
          stateRefs.globalLastTick = Date.now();
        }
        return;
      }

      if (!isReadingViewActive()) {
        if (ttuState.running) {
          ttuState.running = false;
          const wr = document.getElementById('nt-ttu-chrono-wrapper');
          if (wr) wr.dispatchEvent(new CustomEvent('nt-linker-refresh'));
        }
        return;
      }

      // Check and handle Yatsu sidebar timer pausing
      if (window.location.hostname === 'app.yatsu.moe') {
        const sidebarOpen = isYatsuSidebarOpen();
        if (sidebarOpen && !_isYatsuSidebarCurrentlyOpen) {
          _isYatsuSidebarCurrentlyOpen = true;
          if (ttuState.running) {
            _wasTimerRunningBeforeYatsuSidebar = true;
            ttuState.running = false;
          } else {
            _wasTimerRunningBeforeYatsuSidebar = false;
          }
        } else if (!sidebarOpen && _isYatsuSidebarCurrentlyOpen) {
          _isYatsuSidebarCurrentlyOpen = false;
          if (_wasTimerRunningBeforeYatsuSidebar) {
            ttuState.running = true;
            stateRefs.globalLastTick = Date.now();
          }
        }
      }

      if (ttuState.running && !stabilizer.getGracePeriodActive()) {
        const now = Date.now();
        const elapsed = now - stateRefs.globalLastTick;

        ttuState.timeMs += elapsed;

        const dropdown = document.getElementById('nt-ttu-dropdown');
        const isDropdownOpen = !!(dropdown && dropdown.classList.contains('open'));

        if (stabilizer.getSilentGraceActive()) {
          // Suspend checks
        } else if (isDropdownOpen) {
          const charData = extractAdvancedCharCount(undefined, ttuState.running);
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
        }
        stateRefs.globalLastTick = now;

        const lastSec = Math.floor((ttuState.timeMs - elapsed) / 1000);
        const currSec = Math.floor(ttuState.timeMs / 1000);

        if (currSec !== lastSec) {
          const wr = document.getElementById('nt-ttu-chrono-wrapper');
          if (wr) {
            wr.dispatchEvent(new CustomEvent('nt-linker-refresh'));
          }
        }

        if (_cachedAutoSave !== false) liveSyncQueue();
      }
    }, 200);
  } finally {
    isChronoInitializing = false;
  }
}

function isTargetInIgnoredContainer(target: HTMLElement): boolean {
  let el: HTMLElement | null = target;
  const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
  const overlay = document.getElementById('nt-overlay');

  while (el) {
    if (el === wrapper || el === overlay) return true;
    const cl = el.className;
    if (cl && typeof cl === 'string') {
      const lowerCl = cl.toLowerCase();
      if (lowerCl.includes('nt-toast')) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

if (isRelevantFrame) {
  const handleScrollUpdate = () => {
    if (!ttuState.running) return;
    if (scrollTimeout) clearTimeout(scrollTimeout);

    scrollTimeout = setTimeout(() => {
      if (!isReadingViewActive() || stabilizer.getGracePeriodActive()) return;
      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - TextTracker] Scrolling hook active, triggering char recalculation.`);
      }
      recalculateChars();
    }, 150);
  };

  window.addEventListener('scroll', handleScrollUpdate, { passive: true, capture: true });
  window.addEventListener('resize', handleScrollUpdate, { passive: true });

  window.addEventListener('click', () => {
    if (ttuState.running && isReadingViewActive() && !stabilizer.getGracePeriodActive()) {
      setTimeout(recalculateChars, 40);
    }
  }, { passive: true });

  window.addEventListener('keyup', (e) => {
    if (ttuState.running && isReadingViewActive() && !stabilizer.getGracePeriodActive() && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown'].includes(e.key)) {
      setTimeout(recalculateChars, 40);
    }
  }, { passive: true });

  // SPA History and Push-state Navigation Interceptors
  window.addEventListener('popstate', () => {
    invalidateReadingViewCache();
    handleMutations();
  });
  window.addEventListener('hashchange', () => {
    invalidateReadingViewCache();
    handleMutations();
  });

  const origPushState = window.history.pushState;
  window.history.pushState = function (...args) {
    origPushState.apply(this, args);
    invalidateReadingViewCache();
    handleMutations();
  };
  const origReplaceState = window.history.replaceState;
  window.history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    invalidateReadingViewCache();
    handleMutations();
  };

  // Immediate storage flush on exit or hidden tabs to ensure complete session safety without background lag
  const forceSyncOnExit = () => {
    if (ttuState.running && getReaderConfig(currentConfig).autoSave !== false) {
      liveSyncQueue(true);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      forceSyncOnExit();
    }
  });
  window.addEventListener('pagehide', forceSyncOnExit);
  window.addEventListener('beforeunload', forceSyncOnExit);
}

function initSessionRefs(current: number, activeSection: number, total: number, isPaginated: boolean) {
  stateRefs.globalSessionStartChar = isPaginated ? 0 : current;
  stateRefs.globalManualCharOffset = 0;
  stateRefs.lastSectionIndex = activeSection;
  stateRefs.lastSectionTotal = total;
  stateRefs.visitedSections.clear();
  stateRefs.visitedSections.set(activeSection, 0);
}

function isChapterLoading(): boolean {
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

// Optimized element validation bypass
function isDictNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return true;
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'RT' || tag === 'RP' || tag === 'RUBY') return true;

    const className = el.className;
    let classStr = '';
    if (typeof className === 'string') {
      classStr = className;
    } else if (className && typeof className === 'object' && 'baseVal' in className) {
      classStr = (className as SVGAnimatedString).baseVal || '';
    }

    if (classStr) {
      const lowerClass = classStr.toLowerCase();
      if (
        lowerClass.includes('jiten') ||
        lowerClass.includes('yomichan') ||
        lowerClass.includes('yomitan')
      ) {
        return true;
      }
    }

    if (el.getAttribute('ajb') === 'true') return true;
  }
  return false;
}

function scheduleMutations() {
  if (_mutationRafScheduled) return;
  _mutationRafScheduled = true;
  if (_mutationTimeout) clearTimeout(_mutationTimeout);

  _mutationTimeout = setTimeout(() => {
    _mutationRafScheduled = false;
    handleMutations();
  }, 120);
}

let activeMutationObserver: MutationObserver | null = null;
let currentObservedElement: Element | null = null;
let rootObserver: MutationObserver | null = null;
let rootStyleObserver: MutationObserver | null = null;
let bodyObserver: MutationObserver | null = null;

function setupOptimizedMutationObserver() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;

  const isInlineTag = (tag: string) => /^(SPAN|RUBY|RT|RP|A|I|B|EM|STRONG|FONT|CODE)$/i.test(tag);

  const observerCallback = (mutations: MutationRecord[]) => {
    // Highly performant safeguard to skip mutations triggered during the active theme injection cycle
    if ((window as any).__nt_applying_theme__) return;

    for (const m of mutations) {
      const target = m.target as HTMLElement;
      if (!target) continue;

      if (isInlineTag(target.tagName)) continue;
      if (isTargetInIgnoredContainer(target)) continue;

      let isDictionaryMutation = true;

      for (let i = 0; i < m.addedNodes.length; i++) {
        if (!isDictNode(m.addedNodes[i])) {
          isDictionaryMutation = false;
          break;
        }
      }

      if (isDictionaryMutation) {
        for (let i = 0; i < m.removedNodes.length; i++) {
          if (!isDictNode(m.removedNodes[i])) {
            isDictionaryMutation = false;
            break;
          }
        }
      }

      if (!stabilizer.getGracePeriodActive() && !stabilizer.getSilentGraceActive()) {
        let hasJitenAdded = false;
        for (let i = 0; i < m.addedNodes.length; i++) {
          const node = m.addedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const cl = el.className;
            if (el.classList.contains('jiten-word') || el.getAttribute('ajb') === 'true' || (cl && typeof cl === 'string' && cl.toLowerCase().indexOf('jiten') !== -1)) {
              hasJitenAdded = true;
              break;
            }
          }
        }
        if (hasJitenAdded) {
          if (ttuState.running) {
            stabilizer.runSilentGracePeriodIfJiten(true);
          } else {
            stabilizer.runGracePeriodIfJiten(true);
          }
        }
      }

      // OPTIMIZATION: Only trigger theme synchronization if stylesheet-defining tags were mutated inside the page
      const hasStyleTagMutation = Array.from(m.addedNodes).some(n => n.nodeName === 'LINK' || n.nodeName === 'STYLE') ||
        Array.from(m.removedNodes).some(n => n.nodeName === 'LINK' || n.nodeName === 'STYLE');

      if (hasStyleTagMutation && isReadingViewActive()) {
        scheduleInstantThemeSync();
      }

      if (isDictionaryMutation) {
        continue;
      }

      scheduleMutations();
      break;
    }
  };

  const findReaderContainer = (): Element | null => {
    const selectors = [
      '.book-content-container',
      '.book-content',
      '[data-ref="container"]',
      '.reader-container',
      '#reader-container',
      '.reader-wrapper',
      '.writing-container',
      '#writing-container'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && !el.closest('#nt-ttu-chrono-wrapper, #nt-overlay, .nt-toast')) {
        return el;
      }
    }
    return null;
  };

  const startObserver = () => {
    const targetEl = findReaderContainer() || document.body || document.documentElement;

    if (activeMutationObserver && currentObservedElement === targetEl) {
      return;
    }

    if (activeMutationObserver) {
      activeMutationObserver.disconnect();
    }

    activeMutationObserver = new MutationObserver(observerCallback);
    currentObservedElement = targetEl;

    // Monitor subtree structure updates
    activeMutationObserver.observe(targetEl, {
      childList: true,
      subtree: true
    });

    // Swapped high-frequency disk logging for compile-time optimized warning inside startObserver
    if (import.meta.env.DEV) {
      console.log(`[NAT DEV - TextTracker] MutationObserver restricted target`, {
        tagName: targetEl.tagName,
        className: targetEl.className,
        isReaderContainer: targetEl !== document.body && targetEl !== document.documentElement
      });
    }

    // Execute absolute injection check immediately upon observer startup/resets
    handleMutations();
  };

  // Extremely performant lightweight observer for top-level theme changes on html/body/app wrappers.
  rootObserver = new MutationObserver((mutations) => {
    if ((window as any).__nt_applying_theme__) {
      return;
    }

    let actualThemeChange = false;
    for (const m of mutations) {
      if (m.attributeName === 'class' || m.attributeName === 'data-theme') {
        actualThemeChange = true;
        break;
      }
    }

    if (actualThemeChange) {
      clearThemeDetectionCache();
      scheduleInstantThemeSync();
      scheduleMutations();
    }
  });
  rootObserver.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['class', 'data-theme']
  });

  // Lightweight style changes observer on root nodes (such as inline CSS variables)
  rootStyleObserver = new MutationObserver((mutations) => {
    if ((window as any).__nt_applying_theme__) {
      return;
    }

    let actualStyleChange = false;
    for (const m of mutations) {
      if (m.attributeName === 'style') {
        actualStyleChange = true;
        break;
      }
    }

    if (actualStyleChange) {
      clearThemeDetectionCache();
      scheduleInstantThemeSync();
    }
  });
  rootStyleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  rootStyleObserver.observe(document.body, { attributes: true, attributeFilter: ['style'] });

  // Direct child mutation tracker on document.body.
  // This acts as a reliable fallback to capture structural shifts (loader overlays unmounting, app modals toggling) instantly.
  bodyObserver = new MutationObserver(() => {
    invalidateReadingViewCache();
    handleMutations();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: false });

  startObserver();

  const checkInterval = setInterval(() => {
    if (!isReadingViewActive()) return;
    const container = findReaderContainer();
    if (container && currentObservedElement !== container) {
      startObserver();
    }
  }, 1000);

  window.addEventListener('unload', () => {
    clearInterval(checkInterval);
    if (activeMutationObserver) activeMutationObserver.disconnect();
    if (rootObserver) rootObserver.disconnect();
    if (rootStyleObserver) rootStyleObserver.disconnect();
    if (bodyObserver) bodyObserver.disconnect();
  });
}

if (isRelevantFrame && typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  setupOptimizedMutationObserver();
}

function handleMutations() {
  const isLoaderActive = isChapterLoading();

  if (isReadingViewActive() && isLoaderActive) {
    if (lastLoggedPaginatedMode === false) {
      _transitionGraceUntil = Date.now() + 400;
    }
    stabilizer.runGracePeriodIfJiten();
    return;
  }

  const isActive = isReadingViewActive();
  if (isActive && !_wasReadingViewActive) {
    _wasReadingViewActive = true;
    clearThemeDetectionCache();
    scheduleInstantThemeSync();

    // Reset session and timer values completely when returning to the reading view
    ttuState.timeMs = 0;
    ttuState.chars = 0;
    ttuState.running = false;

    const currentCount = extractAdvancedCharCount(undefined, true);
    stateRefs.globalSessionStartChar = currentCount !== null ? currentCount.current : -1;
    stateRefs.globalManualCharOffset = 0;
    stateRefs.lastSectionIndex = -1;
    stateRefs.lastSectionTotal = 0;
    stateRefs.visitedSections.clear();
    stateRefs.globalLastTick = Date.now();
    hasSyncedThisSession = false;

    // Reset Yatsu sidebar tracking states
    _wasTimerRunningBeforeYatsuSidebar = false;
    _isYatsuSidebarCurrentlyOpen = false;

    // Notify chronological dropdown to refresh its visual state
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) {
      wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
      wrapper.dispatchEvent(new CustomEvent('nt-history-refresh'));
    }
  } else if (!isActive) {
    _wasReadingViewActive = false;
  }

  const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
  const adapter = getActiveReaderAdapter();
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
    if (wrapper) {
      if (mountedChronoComponent) {
        unmount(mountedChronoComponent);
        mountedChronoComponent = null;
      }
      wrapper.remove();
    }
    if (progressObserver) {
      progressObserver.disconnect();
      progressObserver = null;
    }
  }

  if (wrapper && adapter) {
    adapter.onUpdateStyles?.(wrapper);
  }

  if (ttuState.running && isReadingViewActive()) {
    setupProgressObserver();
  }

  const now = Date.now();
  // OPTIMIZATION: Throttle expensive layout traversals to 1.5s (reduces rendering lag significantly)
  if ((now - _lastSectionCheckTime) >= 1500) {
    _lastSectionCheckTime = now;
    const charData = extractAdvancedCharCount(undefined, ttuState.running);
    if (charData !== null) {
      const { total, sectionIndex, isPaginated } = charData;
      const activeSection = sectionIndex !== null ? sectionIndex : -1;

      if (lastLoggedPaginatedMode !== null && lastLoggedPaginatedMode !== isPaginated) {
        stateRefs.globalSessionStartChar = -1;
        stateRefs.globalManualCharOffset = 0;
        stateRefs.lastSectionIndex = -1;
        stateRefs.lastSectionTotal = 0;
        stateRefs.visitedSections.clear();
        ttuState.chars = 0;
        ttuState.timeMs = 0;
        stateRefs.globalLastTick = Date.now();
        lastLoggedPaginatedMode = isPaginated;
        if (!isPaginated) {
          _transitionGraceUntil = Date.now() + 400;
        }
        recalculateChars();
        return;
      }
      lastLoggedPaginatedMode = isPaginated;

      if (stateRefs.lastSectionIndex === -1 && activeSection !== -1) {
        const currentCount = extractAdvancedCharCount(undefined, ttuState.running);
        initSessionRefs(currentCount !== null ? currentCount.current : 0, activeSection, total, isPaginated);
      }

      if (stateRefs.lastSectionIndex !== activeSection) {
        stabilizer.resetJitenParseFlag();

        if (activeSection === -1) {
          if (!isReadingViewActive()) {
            stateRefs.lastSectionIndex = -1;
            stateRefs.globalManualCharOffset = 0;
            stateRefs.visitedSections.clear();
            recalculateChars();
          }
        } else {
          const rawTitle = getTTUTitle();
          const parsedVolume = parseTitleWithConfig(rawTitle).volume;
          ttuLinkStorage.getValue().then((links) => {
            const linkedMedia = (links || {})[rawTitle];
            const targetVolume = linkedMedia ? Math.max(1, Number(linkedMedia.volume || 1)) : Math.max(1, Number(parsedVolume || 1));

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

            if (isPaginated) {
              stateRefs.globalSessionStartChar = 0;
            }

            stateRefs.lastSectionIndex = activeSection;
            stateRefs.lastSectionTotal = total;

            if (ttuState.running) {
              stabilizer.runSilentGracePeriodIfJiten();
            } else {
              stabilizer.runGracePeriodIfJiten();
            }
            recalculateChars();
          });
        }
      } else if (stateRefs.lastSectionIndex === activeSection && activeSection !== -1) {
        stateRefs.lastSectionTotal = Math.max(stateRefs.lastSectionTotal, total);
      }
    }
  }

  if (!adapter) {
    if (window.self === window.top && currentConfig.overlayPosition !== 'hidden' && !getOverlayDismissed()) {
      const overlay = overlayController.getOverlayElement();
      if (!overlay) {
        overlayController.checkAndRunOverlay(currentConfig, { get value() { return isAnalyzingPage; }, set value(v) { isAnalyzingPage = v; } });
      }
    }
  }

  // Polling guard: Retry mounting Chrono dropdown if the reader route is active but wrapper isn't attached yet.
  // This acts as a fallback for transitions out of /settings where components mount asynchronously.
  if (isReadingViewActive() && !document.getElementById('nt-ttu-chrono-wrapper')) {
    setTimeout(() => {
      if (isReadingViewActive() && !document.getElementById('nt-ttu-chrono-wrapper')) {
        invalidateReadingViewCache();
        handleMutations();
      }
    }, 250);
  }
}

if (isRelevantFrame && typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
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

if (isRelevantFrame) {
  window.addEventListener('message', (event) => {
    if (event.data?.action === 'SHOW_TOAST') {
      if (window.self !== window.top) return;
      const title = String(event.data.title || '');
      const msg = event.data.message || '';
      showToast(
        title,
        msg,
        event.data.error || title.toLowerCase().includes('fail') || title.toLowerCase().includes('error')
      );
    }
  });
}

function startTimeTracker() {
  if ((window as any).__nt_timer_instance__) {
    try {
      (window as any).__nt_timer_instance__.destroy();
    } catch (e) { }
  }
  const timer = new TimerEngine();
  (window as any).__nt_timer_instance__ = timer;
  (window as any).__nt_tracker_session_active_ms__ = {
    getTotal: () => timer.getTotal(),
    setMs: (ms: number) => timer.setMs(ms),
    pause: (p: boolean) => timer.pause(p),
    isPaused: () => timer.getIsPaused()
  };
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  cssInjectionMode: 'manifest',

  async main() {
    if (!isRelevantFrame) return;

    currentConfig = await configStorage.getValue() || {};
    const cfg = currentConfig;

    const activeThemeCfg = getActiveThemeConfig(cfg);
    const adapter = getActiveReaderAdapter();
    const originalName = adapter ? adapter.name : null;
    if (adapter && originalName && (originalName.includes('Yatsu') || originalName.includes('YomiYasu'))) {
      safelySetAdapterName(adapter, 'ッツ Ebook Reader');
    }
    await applyActiveTheme(activeThemeCfg);
    if (adapter && originalName) {
      safelySetAdapterName(adapter, originalName);
    }

    configStorage.watch((newCfg) => {
      if (newCfg) {
        currentConfig = newCfg;
        _cachedAutoSave = getReaderConfig(newCfg).autoSave !== false;

        // Ensure cache is cleared when configuration changes, so new themes/options apply immediately
        clearThemeDetectionCache();

        const activeThemeCfg = getActiveThemeConfig(newCfg);
        const adapter = getActiveReaderAdapter();
        const originalName = adapter ? adapter.name : null;
        if (adapter && originalName && (originalName.includes('Yatsu') || originalName.includes('YomiYasu'))) {
          safelySetAdapterName(adapter, 'ッツ Ebook Reader');
        }
        applyActiveTheme(activeThemeCfg).catch(() => { });
        if (adapter && originalName) {
          safelySetAdapterName(adapter, originalName);
        }

        if (adapter) {
          const isEnabled = getReaderConfig(newCfg).enabled;
          if (!isEnabled) {
            const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
            if (wrapper) {
              if (mountedChronoComponent) {
                unmount(mountedChronoComponent);
                mountedChronoComponent = null;
              }
              wrapper.remove();
            }
            if ((window as any).ntChronoInterval) clearInterval((window as any).ntChronoInterval);
          } else {
            setupTTUChronometer();
          }

          const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
          if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
        } else {
          if (isWebsiteOverlaySkipped(newCfg) || newCfg.overlayPosition === 'hidden' || getOverlayDismissed()) {
            const overlay = overlayController.getOverlayElement();
            if (overlay) overlay.style.display = 'none';
            return;
          }

          let customColors: any = undefined;
          const themeName = getActiveThemeName(newCfg);
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

          const existingOverlay = overlayController.getOverlayElement();
          if (existingOverlay) {
            const overlayPos = newCfg.overlayPosition ?? 'top-right';
            if (overlayPos !== 'hidden') {
              existingOverlay.style.setProperty('display', 'flex', 'important');
              applyOverlayPosition(existingOverlay, overlayPos);
              injectOverlayCustomOverrides();

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
          } else {
            overlayController.checkAndRunOverlay(newCfg, { get value() { return isAnalyzingPage; }, set value(v) { isAnalyzingPage = v; } });
          }
        }
      }
    });

    if (adapter) {
      startTimeTracker();
      const readerCfg = getReaderConfig(cfg);
      if (!readerCfg.enabled) return;
      setupTTUChronometer();

      ttuHistoryStorage.watch(() => {
        const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
        if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-history-refresh'));
      });

      readingQueueStorage.watch(async (queue: QueuedReadingLog[] | null) => {
        const currentQueue = queue || [];
        const rawTitle = getTTUTitle();
        const parsedRaw = parseTitleWithConfig(rawTitle).query;

        const linkMap = await ttuLinkStorage.getValue() || {}; // Queried exactly once per cycle to save redundant storage executions
        const linkedMedia = linkMap[rawTitle];
        const targetVolume = linkedMedia ? Math.max(1, Number(linkedMedia.volume || 1)) : Math.max(1, Number(parseTitleWithConfig(rawTitle).volume || 1));

        const existing = currentQueue.find((q: any) => {
          if (q.originalTitle === rawTitle) return true;
          const qParsed = parseTitleWithConfig(q.originalTitle || q.contentTitleNative || '');
          return qParsed.query === parsedRaw && (qParsed.volume || 1) === targetVolume;
        });

        if (!existing && ttuState.timeMs > 0) {
          if (hasSyncedThisSession) {
            ttuState.timeMs = 0;
            ttuState.chars = 0;
            stateRefs.globalLastTick = Date.now();

            const initCount = extractAdvancedCharCount(undefined, ttuState.running);
            stateRefs.globalSessionStartChar = initCount !== null ? initCount.current : -1;
            stateRefs.globalManualCharOffset = 0;

            const timeVal = document.querySelector('#nt-ttu-val-time');
            const charsVal = document.querySelector('#nt-ttu-val-chars');
            if (timeVal && timeVal.tagName !== 'INPUT') timeVal.textContent = "0:00";
            if (charsVal && charsVal.tagName !== 'INPUT') charsVal.textContent = "0";

            hasSyncedThisSession = false;
          }
        } else if (existing) {
          let updated = false;
          const links = { ...linkMap };

          if (existing.mediaId && existing.mediaId !== 'web-reading') {
            if (!links[rawTitle] || links[rawTitle].mediaId !== existing.mediaId || links[rawTitle].volume !== existing.volume) {
              links[rawTitle] = {
                mediaId: existing.mediaId,
                volume: existing.volume || 1,
                mediaData: existing.mediaData as ReadingMediaData
              };
              updated = true;
            }
          } else if (!existing.mediaId || existing.mediaId === 'web-reading') {
            if (links[rawTitle]) {
              const parsedVol = parseTitleWithConfig(rawTitle).volume || 1;
              if (links[rawTitle].volume === parsedVol) {
                delete links[rawTitle];
                updated = true;
              }
            }
          }

          if (updated) {
            ttuLinkStorage.setValue(links).then(() => {
              const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
              if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
            });
          }
        }
      });

      return;
    }

    if (isWebsiteOverlaySkipped(cfg)) return;
    startTimeTracker();
    if (cfg.overlayPosition === 'hidden') return;

    if (window.self !== window.top) return;

    let customColors: any = undefined;
    const themeName = getActiveThemeName(cfg);
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
    overlayController.checkAndRunOverlay(cfg, { get value() { return isAnalyzingPage; }, set value(v) { isAnalyzingPage = v; } });
  },
});