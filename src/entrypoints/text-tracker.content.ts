/**
 * ── Text Tracker Content Script ──────────────────────────────────────────────
 * Monitors page focus, scrolls, and manages the in-page reading overlay timer.
 */

import { browser } from 'wxt/browser';
import { defineContentScript } from '#imports';
import '@/assets/text-tracker.css';
import TtuChronoDropdown from '@/components/reader/TtuChronoDropdown.svelte';
import { getActiveReaderAdapter } from '@/lib/adapters/readers';
import { JP_DOMAINS_DEFAULT } from '@/lib/constants';
import { isJapanesePage as detectJapanesePage } from '@/lib/utils/japanese';
import { configStorage } from '@/lib/storage/config';
import { readingQueueStorage, updateReadingQueueAtomic } from '@/lib/storage/queues';
import { ttuHistoryStorage, ttuLinkStorage } from '@/lib/storage/ttu';
import type { QueuedReadingLog, ReadingMediaData } from '@/lib/types';
import {
  applyOverlayPosition,
  getOverlayDismissed,
  injectOverlayCustomOverrides,
  injectThemeStyles,
  isWebsiteOverlaySkipped,
  updatePauseIconState
} from '@/lib/ui/reader-overlay';
import { applyActiveTheme, clearThemeDetectionCache, getActiveThemeName, getReaderConfig } from '@/lib/ui/text-tracker-theme-manager';
import { DOMMutationStabilizer } from '@/lib/core/dom-mutation-stabilizer';
import { OverlayController } from '@/lib/core/overlay-controller';
import { clearExtractorCache, extractAdvancedCharCount, initResizeListener, cleanupResizeListener } from '@/lib/utils/reader-char-extractor';
import { parseTitle } from '@/lib/utils/text-parsing';
import { TimerEngine } from '@/lib/utils/timer';
import { showToast } from '@/lib/utils/toast';
import { mount, unmount } from 'svelte';

const isRelevantFrame = typeof window !== 'undefined' && typeof window.location !== 'undefined' && (
  window.self === window.top ||
  !!getActiveReaderAdapter()
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
const READING_VIEW_CACHE_TTL = 500;
let _wasReadingViewActive = false;
let _insertPointCache: { el: Element; pos: InsertPosition } | null = null;
let _mutationRafScheduled = false;
let _mutationTimeout: any = null;
let _instantThemeSyncScheduled = false;
let _lastSectionCheckTime = 0;
let _transitionGraceUntil = 0;
let _lastRecalculateTime = 0;
const RECALCULATE_THROTTLE_MS = 250;
let hasSyncedThisSession = false;
let _cachedAutoSave = true;
let _lastStorageWriteTime = 0;
const STORAGE_WRITE_THROTTLE_MS = 10000;
let _lastThemeSyncTime = 0;
const THEME_SYNC_THROTTLE_MS = 250;
let _wasTimerRunningBeforeYatsuSidebar = false;
let _isYatsuSidebarCurrentlyOpen = false;

// Stabilization tick checks to avoid Svelte re-rendering flashes falsely toggling states
let _sidebarClosedTicks = 0;
const SIDEBAR_CLOSE_REQUIRED_TICKS = 3; // Must remain closed for 3 consecutive intervals (600ms)

let _readingViewInactiveTicks = 0;
const READING_VIEW_INACTIVE_REQUIRED_TICKS = 5; // Must be inactive for 5 consecutive checks (1000ms) before metric wipe
let _debouncedReadingViewActive = true;

// Highly-performant module-level cached variables to bypass frequent deep DOM queries
let _cachedYatsuSidebarOpen = false;
let _lastYatsuSidebarCheckTime = 0;
const YATSU_SIDEBAR_CHECK_TTL = 200; // Snappy settings drawer updates

function invalidateYatsuSidebarCache() {
  _lastYatsuSidebarCheckTime = 0;
}

// Shared Iframe cache variable resolving Cross-Origin DOM blocks securely
let cachedActiveTabTitle = "";

const overlayController = new OverlayController((cfg) => isJapanesePage(cfg));

function getLayoutOffset(): number {
  const container = document.querySelector('.book-content-container') ||
    document.querySelector('.book-content') ||
    document.querySelector('[data-ref="container"]') ||
    document.querySelector('.reader-container') ||
    document.body;
  const rect = container.getBoundingClientRect();

  let internalScroll = 0;
  if (container) {
    internalScroll += (container.scrollLeft || 0) + (container.scrollTop || 0);
    if (container.parentElement) {
      internalScroll += (container.parentElement.scrollLeft || 0) + (container.parentElement.scrollTop || 0);
    }
  }

  return Math.round(Math.abs(rect.left) + Math.abs(rect.top)) + internalScroll;
}

function dispatchLinkerRefresh() {
  const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
  if (wrapper) {
    wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
    // Fire on next task loop to ensure Svelte has fully batched and committed reactive changes
    setTimeout(() => {
      const wr = document.getElementById('nt-ttu-chrono-wrapper');
      if (wr) {
        wr.dispatchEvent(new CustomEvent('nt-linker-refresh'));
      }
    }, 0);
  }
}

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
          position: 'absolute', bottom: '38px', left: '0', transform: 'translateY(5px)',
          background: 'rgba(20, 20, 25, 0.95)', color: '#f5a623', padding: '6px 12px',
          borderRadius: '4px', fontSize: '11px', whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.6)', border: '1px solid rgba(245, 166, 35, 0.3)',
          zIndex: '10000', opacity: '0', pointerEvents: 'none',
          transition: 'opacity 0.2s ease, transform 0.2s ease'
        });
        wrapper.appendChild(tooltip);
      }
      if (tooltip) tooltip.textContent = message || 'Waiting for Jiten to finish processing layout...';
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
        position: 'absolute', top: '0', left: '0', right: '0', bottom: '0',
        background: 'rgba(15, 15, 20, 0.75)', backdropFilter: 'blur(2.5px)',
        webkitBackdropFilter: 'blur(2.5px)', color: '#aaa', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '11px',
        textAlign: 'center', padding: '16px', borderRadius: '8px', zIndex: '9999'
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
            position: 'absolute', bottom: '38px', left: '0', transform: 'translateY(5px)',
            background: 'rgba(20, 20, 25, 0.95)', color: '#f5a623', padding: '6px 12px',
            borderRadius: '4px', fontSize: '11px', whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)', border: '1px solid rgba(245, 166, 35, 0.3)',
            zIndex: '10000', opacity: '0', pointerEvents: 'none',
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
  const result = await detectJapanesePage(cfg, JP_DOMAINS_DEFAULT);
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
  visitedSectionTotals: Map<number, number>;
  offsetToCharMap: Map<number, number>;
  globalSessionStartSection?: number;
  globalSessionStartCharInternal?: number;
}

let _globalSessionStartChar = -1;
const stateRefs: StateRefs = {
  globalSessionStartSection: -1,
  globalSessionStartCharInternal: -1,
  get globalSessionStartChar() {
    return _globalSessionStartChar;
  },
  set globalSessionStartChar(val) {
    _globalSessionStartChar = val;
    if (val !== -1) {
      if (this.globalSessionStartCharInternal === -1 || val !== 0) {
        this.globalSessionStartCharInternal = val;
        if (this.lastSectionIndex !== -1) {
          this.globalSessionStartSection = this.lastSectionIndex;
        } else {
          const charData = extractAdvancedCharCount(undefined, false);
          if (charData && charData.sectionIndex !== null) {
            this.globalSessionStartSection = charData.sectionIndex;
          }
        }
      }
    } else {
      this.globalSessionStartCharInternal = -1;
      this.globalSessionStartSection = -1;
    }
  },
  globalManualCharOffset: 0,
  globalLastTick: Date.now(),
  lastSectionIndex: -1,
  lastSectionTotal: 0,
  visitedSections: new Map<number, number>(),
  visitedSectionTotals: new Map<number, number>(),
  offsetToCharMap: new Map<number, number>()
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
        if (getReaderConfig(currentConfig).autoSave !== false) {
          liveSyncQueue(true);
        }
      }
      dispatchLinkerRefresh();
      return true;
    }
    if (prop === 'timeMs') {
      const numVal = Number(value) || 0;
      const oldVal = target.timeMs;
      target.timeMs = numVal; // Commit target immediately to prevent nested reset calls from recurring

      if (numVal === 0 && oldVal > 0) {
        startNewSession();
      } else if (numVal < oldVal || numVal === 0) {
        stateRefs.globalLastTick = Date.now();
      }
      dispatchLinkerRefresh();
      return true;
    }
    if (prop === 'chars') {
      target.chars = Number(value) || 0;
      dispatchLinkerRefresh();
      return true;
    }
    (target as any)[prop] = value;
    return true;
  }
});

let isSyncing = false;

function startNewSession(isPaginated?: boolean) {
  ttuState.id = crypto.randomUUID();
  ttuState.timeMs = 0;
  ttuState.chars = 0;
  ttuState.running = false; // Always start a new session paused!

  stateRefs.globalSessionStartChar = -1; // Lazy initialize on first active recalculation pass
  stateRefs.globalManualCharOffset = 0;
  stateRefs.lastSectionIndex = -1;
  stateRefs.lastSectionTotal = 0;
  stateRefs.visitedSections.clear();
  stateRefs.visitedSectionTotals.clear();
  stateRefs.offsetToCharMap.clear();
  stateRefs.globalLastTick = Date.now();

  hasSyncedThisSession = false;

  const currentCount = extractAdvancedCharCount(undefined, false);
  if (currentCount !== null && !currentCount.isLayoutDeferred && currentCount.total > 0) {
    const isPag = isPaginated ?? currentCount.isPaginated;
    stateRefs.lastSectionIndex = currentCount.sectionIndex !== null ? currentCount.sectionIndex : -1;
    stateRefs.lastSectionTotal = currentCount.total;
    stateRefs.globalSessionStartChar = currentCount.current; // Correctly initialize the baseline to our active offset position
    if (isPag && currentCount.sectionIndex !== null) {
      stateRefs.visitedSectionTotals.set(currentCount.sectionIndex, currentCount.total);
    }
  }
  dispatchLinkerRefresh();
}

// Query the background frame title cache asynchronously to resolve Cross-Origin DOM blocks securely
function updateCachedActiveTabTitle() {
  if (window.self !== window.top) {
    browser.runtime.sendMessage({ action: "GET_ACTIVE_TAB_TITLE" })
      .then((response) => {
        if (response?.title) {
          cachedActiveTabTitle = response.title;
        }
      })
      .catch((err) => {
        console.error(`[NT Tracker] [Title Sync] Failed to request parent title:`, err);
      });
  }
}

// Determine adapt-centric reader labels
function getTTUTitle() {
  let title = document.title;
  try {
    if (window.self !== window.top) {
      if (cachedActiveTabTitle) {
        title = cachedActiveTabTitle;
      } else if (window.top) {
        title = window.top.document.title || title;
      }
    }
  } catch (e) {
    if (cachedActiveTabTitle) title = cachedActiveTabTitle;
  }

  const adapter = getActiveReaderAdapter();
  if (adapter) {
    return adapter.getTitle(title);
  }
  return title.trim() || document.title;
}

function parseTitleWithConfig(docTitle: string) {
  return parseTitle(docTitle, currentConfig.titleRegexes);
}

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

  let hasContainer = false;
  if (adapter) {
    hasContainer = adapter.isReadingViewActive(document);
  } else {
    const container = document.querySelector(
      '.book-content-container, .book-content, [data-ref="container"], .reader-container, #reader-container, .reader-wrapper, .writing-container, #writing-container'
    );
    hasContainer = !!container;
  }

  _readingViewCache = hasContainer;
  _readingViewCacheTime = now;
  return hasContainer;
}

function invalidateReadingViewCache() {
  _readingViewCache = null;
  _insertPointCache = null;
  clearExtractorCache();
  clearThemeDetectionCache(); // Ensure theme detection re-evaluates fresh on navigation/layout transitions
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
  if (!force && (now - _lastStorageWriteTime < STORAGE_WRITE_THROTTLE_MS)) return;
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

      if (!existing) {
        existing = {
          id: crypto.randomUUID(), type: 'reading',
          contentTitleNative: parsedTitle, contentTitleEnglish: '',
          originalTitle: rawTitle, description: parsedTitle,
          chars: ttuState.chars, time: secs, volume: targetVolume,
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
  const title = getTTUTitle();
  const dateStr = new Date().toISOString();
  const sessionLog = { id: ttuState.id, date: dateStr, timeMs: ttuState.timeMs, chars: ttuState.chars };

  const history = await ttuHistoryStorage.getValue() || {};
  if (!history[title]) history[title] = [];
  history[title].push(sessionLog);
  await ttuHistoryStorage.setValue(history);

  await liveSyncQueue(true);

  ttuState.id = crypto.randomUUID();
  ttuState.timeMs = 0;
  ttuState.chars = 0;

  const currentCount = extractAdvancedCharCount(undefined, ttuState.running);
  const isPag = currentCount !== null ? currentCount.isPaginated : false;
  stateRefs.globalSessionStartChar = isPag ? 0 : (currentCount !== null ? currentCount.current : -1);
  stateRefs.globalManualCharOffset = 0;
  stateRefs.lastSectionIndex = -1;
  stateRefs.lastSectionTotal = 0;
  stateRefs.visitedSections.clear();
  stateRefs.visitedSectionTotals.clear();
  stateRefs.offsetToCharMap.clear();
  stateRefs.globalLastTick = Date.now();
  ttuState.running = false;
  hasSyncedThisSession = false;

  showToast('Success', 'Session queued!');
}

function findTTUInsertPoint(): { el: Element; pos: InsertPosition } | null {
  if (typeof document === 'undefined') return null;
  if (_insertPointCache && _insertPointCache.el.isConnected) return _insertPointCache;

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

/**<<<<<<<
 * Atomic processing of layout transitions to prevent data corruption during rapid navigation.
 */
function checkAndProcessSectionTransition(charData: any): boolean {
  const { total, sectionIndex, isPaginated, isLayoutDeferred } = charData;
  const activeSection = sectionIndex !== null ? sectionIndex : -1;

  if (isPaginated && total === 0) {
    return false;
  }

  if (lastLoggedPaginatedMode !== null && lastLoggedPaginatedMode !== isPaginated) {
    // Mode changed! Start a new session, reset state, and completely pause
    console.log(`[NT DEBUG transition] MODE CHANGE: ${lastLoggedPaginatedMode} → ${isPaginated}`);
    startNewSession(isPaginated);
    ttuState.running = false;
    _wasTimerRunningBeforeYatsuSidebar = false;
    lastLoggedPaginatedMode = isPaginated;
    if (!isPaginated) _transitionGraceUntil = Date.now() + 400;
    return true;
  }

  // Skip transition checks during active loading or layout-deferred states
  if (isLayoutDeferred) {
    console.log(`[NT DEBUG transition] DEFERRED — skipping | activeSection=${activeSection} lastSection=${stateRefs.lastSectionIndex}`);
    return false;
  }

  lastLoggedPaginatedMode = isPaginated;

  // Commit baseline totals for accurate dynamic summing in Paginated Mode
  if (isPaginated && activeSection !== -1) {
    stateRefs.visitedSectionTotals.set(activeSection, total);
    if (stateRefs.lastSectionIndex !== -1) {
      stateRefs.visitedSectionTotals.set(stateRefs.lastSectionIndex, stateRefs.lastSectionTotal);
    }
  }

  if (stateRefs.lastSectionIndex === -1 && activeSection !== -1) {
    initSessionRefs(charData.current, activeSection, total, isPaginated);
  }

  if (stateRefs.lastSectionIndex !== activeSection) {
    stabilizer.resetJitenParseFlag();
    if (activeSection === -1) {
      if (!_debouncedReadingViewActive) {
        stateRefs.lastSectionIndex = -1;
        stateRefs.globalManualCharOffset = 0;
        stateRefs.visitedSections.clear();
        stateRefs.visitedSectionTotals.clear();
        stateRefs.offsetToCharMap.clear();
      }
    } else {
      stateRefs.offsetToCharMap.clear(); // Clear mapping context on any chapter transitions
      console.log(`[NT DEBUG transition] SECTION CHANGE: ${stateRefs.lastSectionIndex} → ${activeSection} | total=${total} isPag=${isPaginated}`);
      if (isPaginated) {
        // Robust dynamic offset summing to prevent timing issues during fast turns and backtracks
        let computedOffset = 0;
        for (const [secIdx, secTotal] of stateRefs.visitedSectionTotals.entries()) {
          if (secIdx < activeSection) {
            computedOffset += secTotal;
          }
        }
        stateRefs.globalManualCharOffset = computedOffset;
      } else {
        // RETAIN THE ORIGINAL CONTINUOUS MODE OFFSET MECHANISM UNCHANGED
        if (activeSection > stateRefs.lastSectionIndex) {
          if (stateRefs.visitedSections.has(activeSection)) {
            stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(activeSection) || 0;
          } else {
            // Commit current section total before jumping to ensure mathematical precision
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
      if (isPaginated) stateRefs.globalSessionStartChar = 0;

      stateRefs.lastSectionIndex = activeSection;
      stateRefs.lastSectionTotal = total;

      _transitionGraceUntil = Date.now() + 400;

      if (ttuState.running) stabilizer.runSilentGracePeriodIfJiten();
      else stabilizer.runGracePeriodIfJiten();
    }
    console.log(`[NT DEBUG transition] POST-CHANGE: lastSection=${stateRefs.lastSectionIndex} manualOffset=${stateRefs.globalManualCharOffset} startChar=${stateRefs.globalSessionStartChar} visitedTotals=${JSON.stringify([...stateRefs.visitedSectionTotals.entries()])}`);
    return true;
  } else if (stateRefs.lastSectionIndex === activeSection && activeSection !== -1) {
    if (total > stateRefs.lastSectionTotal) {
      stateRefs.lastSectionTotal = total;
      if (isPaginated) {
        stateRefs.visitedSectionTotals.set(activeSection, total);
      }
    }
  }
  return false;
}

function recalculateChars(force = false) {
  // Guard clause to block execution on inactive frames (such as Yomiyasu's parent document)
  if (!document.getElementById('nt-ttu-chrono-wrapper')) {
    return;
  }
  if (!ttuState.running || stabilizer.getGracePeriodActive()) return;
  const now = Date.now();
  if (!force && (now - _lastRecalculateTime < RECALCULATE_THROTTLE_MS)) {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => { recalculateChars(); }, RECALCULATE_THROTTLE_MS);
    return;
  }
  if (!force) {
    _lastRecalculateTime = now;
  }

  if (!isReadingViewActive()) {
    ttuState.running = false;
    dispatchLinkerRefresh();
    return;
  }

  const charData = extractAdvancedCharCount(undefined, ttuState.running);
  if (charData !== null) {
    const scrollOffset = getLayoutOffset();
    const total = charData.total;

    // Freeze progress updates during unmounted/loading states in Paginated Mode,
    // unless we are at the beginning of the page/book (scrollOffset <= 50),
    // in which case we want to force current = 0 and let the progress update.
    if (charData.isPaginated && total === 0 && scrollOffset > 50) {
      return;
    }

    // Synchronize section boundary and manual offset before applying the local paragraph count
    checkAndProcessSectionTransition(charData);

    let current = charData.current;

    const container = document.querySelector('.book-content-container') ||
      document.querySelector('.book-content') ||
      document.querySelector('[data-ref="container"]') ||
      document.querySelector('.reader-container') ||
      document.body;
    const pageWidth = container ? container.getBoundingClientRect().width : window.innerWidth;

    if (total === 0 || charData.isLayoutDeferred) {
      if (scrollOffset <= 50) {
        current = 0;
        console.log(`[NT DEBUG recalc] DEFERRED beginning of book: scrollOffset=${scrollOffset} → current=0`);
      } else {
        // Find the best matching character count from previous pages
        let bestOffset = -1;
        let bestCurrent = 0;
        for (const [offset, charProgress] of stateRefs.offsetToCharMap.entries()) {
          if (offset <= scrollOffset && offset > bestOffset) {
            bestOffset = offset;
            bestCurrent = charProgress;
          }
        }
        if (bestOffset !== -1) {
          current = bestCurrent;
          console.log(`[NT DEBUG recalc] DEFERRED fallback: scrollOffset=${scrollOffset} bestOffset=${bestOffset} → current=${current}`);
        } else {
          // No prior offset mapping exists — DOM is temporarily unmounted or we
          // navigated backward before all mapped entries. Hold the current char
          // count by skipping this update entirely.
          console.log(`[NT DEBUG recalc] DEFERRED no-match: scrollOffset=${scrollOffset} mapSize=${stateRefs.offsetToCharMap.size} → HOLDING chars=${ttuState.chars}`);
          return;
        }
      }
    } else {
      // Valid text page — save scroll offset mapping with monotonic guard.
      // In paginated mode scrollOffset is constant, so the map has one key.
      // During DOM transitions the extractor briefly returns current=0 before
      // fully unmounting (pTags > 0 but elements repositioned). Without this
      // guard that transient 0 overwrites the real value, poisoning the
      // deferred fallback on the next (image/empty) page.
      const prevMapValue = stateRefs.offsetToCharMap.get(scrollOffset);
      if (prevMapValue === undefined || current >= prevMapValue) {
        stateRefs.offsetToCharMap.set(scrollOffset, current);
      }
      if (charData.isPaginated) {
        const nextMapValue = stateRefs.offsetToCharMap.get(scrollOffset + pageWidth);
        const nextCurrent = current + (charData.visible || 0);
        if (nextMapValue === undefined || nextCurrent >= nextMapValue) {
          stateRefs.offsetToCharMap.set(scrollOffset + pageWidth, nextCurrent);
        }
      }
    }

    const activeSection = charData.sectionIndex !== null ? charData.sectionIndex : -1;
    if (stateRefs.globalSessionStartChar === -1) {
      stateRefs.globalSessionStartChar = scrollOffset > 50 ? 0 : current;
    } else if (activeSection !== -1 && stateRefs.globalSessionStartSection !== -1) {
      if (activeSection === stateRefs.globalSessionStartSection) {
        if (stateRefs.globalSessionStartChar !== stateRefs.globalSessionStartCharInternal) {
          stateRefs.globalSessionStartChar = stateRefs.globalSessionStartCharInternal!;
        }
      } else {
        if (stateRefs.globalSessionStartChar !== 0) {
          stateRefs.globalSessionStartChar = 0;
        }
      }
    }
    if (Date.now() < _transitionGraceUntil) {
      if (!charData.isPaginated) return;
    }

    let diff = current - stateRefs.globalSessionStartChar;
    if (diff < 0) diff = 0;
    const newChars = diff + stateRefs.globalManualCharOffset;
    console.log(`[NT DEBUG recalc] current=${current} startChar=${stateRefs.globalSessionStartChar} diff=${diff} manualOffset=${stateRefs.globalManualCharOffset} → chars=${newChars} (was ${ttuState.chars})`);
    ttuState.chars = newChars;

    dispatchLinkerRefresh();
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
  progressObserver.observe(target, { childList: true, subtree: true });
}

function runInstantThemeSync() {
  const activeThemeCfg = getActiveThemeConfig(currentConfig);
  const adapter = getActiveReaderAdapter();
  const originalName = adapter ? adapter.name : null;
  if (adapter && originalName && (originalName.includes('Yatsu') || originalName.includes('YomiYasu'))) {
    safelySetAdapterName(adapter, 'ッツ Ebook Reader');
  }
  applyActiveTheme(activeThemeCfg).catch(() => { });
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
      if ((window as any).__nt_applying_theme__) return;
      _lastThemeSyncTime = Date.now();
      runInstantThemeSync();
    }, THEME_SYNC_THROTTLE_MS - timeSinceLastSync);
    return;
  }

  _instantThemeSyncScheduled = true;
  requestAnimationFrame(() => {
    _instantThemeSyncScheduled = false;
    if ((window as any).__nt_applying_theme__) return;
    _lastThemeSyncTime = Date.now();
    runInstantThemeSync();
  });
}

// Deep, geometric evaluation of sidebars, dialogs, and settings drawers 
function isYatsuSidebarOpen(): boolean {
  if (window.location.hostname !== 'app.yatsu.moe') return false;
  const now = Date.now();
  if (now - _lastYatsuSidebarCheckTime < YATSU_SIDEBAR_CHECK_TTL) {
    return _cachedYatsuSidebarOpen;
  }
  _lastYatsuSidebarCheckTime = now;

  const body = document.body;
  if (!body) {
    _cachedYatsuSidebarOpen = false;
    return false;
  }

  // Query strictly semantic sidebar, dialog, accessibility tags, and classes/ids
  const els = document.querySelectorAll(
    'aside, dialog, [role="dialog"], [role="menu"], ' +
    '[class*="sidebar"], [class*="drawer"], [class*="appearance"], [class*="settings"], [class*="panel"], div[class*="menu"], ' +
    '[id*="sidebar"], [id*="drawer"], [id*="appearance"], [id*="settings"], [id*="panel"]'
  );
  if (els.length === 0) {
    _cachedYatsuSidebarOpen = false;
    return false;
  }

  for (let i = 0; i < els.length; i++) {
    const el = els[i] as HTMLElement;
    const id = el.id || '';
    const className = el.className || '';

    const idStr = typeof id === 'string' ? id.toLowerCase() : '';
    const classStr = typeof className === 'string' ? className.toLowerCase() : '';

    // 1. Skip our own extension elements to prevent self-triggering
    if (idStr.includes('nt-') || classStr.includes('nt-') || el.closest('#nt-ttu-chrono-wrapper') || el.closest('#nt-overlay')) {
      continue;
    }

    // 2. Skip hover popups, lookup dictionaries, and translation tools
    if (
      classStr.includes('jiten') || classStr.includes('yomichan') || classStr.includes('yomichan') || classStr.includes('yomitan') || classStr.includes('anki') || classStr.includes('jpdb') || classStr.includes('lookup') || classStr.includes('popup') ||
      idStr.includes('jiten') || idStr.includes('yomichan') || idStr.includes('yomitan') || idStr.includes('anki') || idStr.includes('jpdb') || idStr.includes('lookup') || idStr.includes('popup')
    ) {
      continue;
    }

    // 3. Verify element geometry
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    // 4. Verify element visibility in computed style
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }

    // 5. Read computed z-index to isolate overlays and drawers (usually z-index >= 10)
    // Absolute / fixed elements are exempt from low z-index filtering since they might rely on DOM ordering
    const zIndexStr = style.zIndex;
    const zIndex = parseInt(zIndexStr, 10);
    const isPositioned = style.position === 'absolute' || style.position === 'fixed';

    if (!isPositioned && (isNaN(zIndex) || zIndex < 10)) {
      continue;
    }

    // 6. Geometric Classification:

    // A. Backdrop / Full Screen Overlay: covers almost the entire viewport
    const isBackdrop = rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;

    // B. Sidebar / Drawer / Vertical Panel: spans vertically with height > 70% of screen, and reasonable width
    const isSidePanel = rect.height >= window.innerHeight * 0.7 && rect.width >= 150 && rect.width <= 600;

    // C. Modal Dialog / Centered settings: floating dialog positioned away from top/bottom bounds
    const isModalDialog = rect.height >= 120 && rect.width >= 200 && rect.top > 80 && rect.bottom < window.innerHeight - 80;

    if (isBackdrop || isSidePanel || isModalDialog) {
      _cachedYatsuSidebarOpen = true;
      return true;
    }
  }

  _cachedYatsuSidebarOpen = false;
  return false;
}

async function setupTTUChronometer() {
  if (isChronoInitializing) return;
  const active = isReadingViewActive();
  if (!active) {
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) wrapper.remove();
    return;
  }
  if (document.getElementById('nt-ttu-chrono-wrapper')) return;

  // Invalidate stale insert point caches before attempting a fresh chronometer initialization
  _insertPointCache = null;
  clearExtractorCache();

  isChronoInitializing = true;
  try {
    const pt = findTTUInsertPoint();
    if (!pt) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'nt-ttu-chrono-wrapper';

    const isFloating = !document.getElementById('ttu-page-footer') && !document.querySelector('div[title="Click to copy Progress"]');
    if (isFloating) wrapper.classList.add('nt-floating');

    pt.el.insertAdjacentElement(pt.pos, wrapper);

    const adapter = getActiveReaderAdapter(); // Resolved active adapter in this scope

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
          return { ...rCfg, hideUnavailableActions: currentConfig.hideUnavailableActions ?? false };
        },
        liveSyncQueue: (force = false) => liveSyncQueue(force),
        saveSessionAndQueue,
      }
    });

    setupProgressObserver();
    stabilizer.runGracePeriodIfJiten();

    // Apply the active theme directly to the newly created wrapper
    const activeThemeCfg = getActiveThemeConfig(currentConfig);
    const originalName = adapter ? adapter.name : null;
    if (adapter && originalName && (originalName.includes('Yatsu') || originalName.includes('YomiYasu'))) {
      safelySetAdapterName(adapter, 'ッツ Ebook Reader');
    }
    applyActiveTheme(activeThemeCfg).then(() => {
      if (adapter && originalName) {
        safelySetAdapterName(adapter, originalName);
      }
    }).catch(() => { });

    if ((window as any).ntChronoInterval) clearInterval((window as any).ntChronoInterval);

    (window as any).ntChronoInterval = setInterval(() => {
      if (document.hidden) {
        if (ttuState.running) stateRefs.globalLastTick = Date.now();
        return;
      }

      const isActiveNow = isReadingViewActive();
      if (isActiveNow) {
        _readingViewInactiveTicks = 0;
        _debouncedReadingViewActive = true;
      } else {
        _sidebarClosedTicks = 0;
        _readingViewInactiveTicks++;
        if (_readingViewInactiveTicks >= READING_VIEW_INACTIVE_REQUIRED_TICKS) {
          _debouncedReadingViewActive = false;
        }
      }

      if (!_debouncedReadingViewActive) {
        if (ttuState.running) {
          ttuState.running = false;
          dispatchLinkerRefresh();
        }
        return;
      }

      if (window.location.hostname === 'app.yatsu.moe') {
        const sidebarOpen = isYatsuSidebarOpen();
        if (sidebarOpen) {
          // Force layout cache clear so any toggle instantly updates computed styles
          clearExtractorCache();
          _sidebarClosedTicks = 0; // Reset closed tick counter
        }

        if (sidebarOpen && !_isYatsuSidebarCurrentlyOpen) {
          _isYatsuSidebarCurrentlyOpen = true;
          if (ttuState.running) {
            _wasTimerRunningBeforeYatsuSidebar = true;
            ttuState.running = false;
          } else {
            _wasTimerRunningBeforeYatsuSidebar = false;
          }
        } else if (!sidebarOpen && _isYatsuSidebarCurrentlyOpen) {
          _sidebarClosedTicks++;
          if (_sidebarClosedTicks >= SIDEBAR_CLOSE_REQUIRED_TICKS) {
            _isYatsuSidebarCurrentlyOpen = false;
            _sidebarClosedTicks = 0;
            if (_wasTimerRunningBeforeYatsuSidebar) {
              ttuState.running = true;
              stateRefs.globalLastTick = Date.now();
            }
          }
        }
      }

      // Synchronously check for mode transitions on every tick (handles sidebar setting changes in real-time)
      const activeCharData = extractAdvancedCharCount(undefined, ttuState.running);
      if (activeCharData !== null) {
        checkAndProcessSectionTransition(activeCharData);
      }

      if (ttuState.running && !stabilizer.getGracePeriodActive()) {
        const now = Date.now();
        const elapsed = now - stateRefs.globalLastTick;
        ttuState.timeMs += elapsed;

        const dropdown = document.getElementById('nt-ttu-dropdown');
        const isDropdownOpen = !!(dropdown && dropdown.classList.contains('open'));

        if (!stabilizer.getSilentGraceActive() && isDropdownOpen) {
          const charData = extractAdvancedCharCount(undefined, ttuState.running);
          if (charData !== null) {
            let { current, total, isLayoutDeferred, isPaginated } = charData;

            const scrollOffset = getLayoutOffset();

            // Freeze progress updates during unmounted/loading states in Paginated Mode,
            // unless we are at the beginning of the page/book (scrollOffset <= 50),
            // in which case we want to force current = 0 and let the progress update.
            if (isPaginated && total === 0 && scrollOffset > 50) {
              // Skip updating chars, let it hold
            } else {
              const container = document.querySelector('.book-content-container') ||
                document.querySelector('.book-content') ||
                document.querySelector('[data-ref="container"]') ||
                document.querySelector('.reader-container') ||
                document.body;
              const pageWidth = container ? container.getBoundingClientRect().width : window.innerWidth;

              if (total === 0 || isLayoutDeferred) {
                if (scrollOffset <= 50) {
                  current = 0;
                  console.log(`[NT DEBUG tick] DEFERRED beginning of book: scrollOffset=${scrollOffset} → current=0`);
                } else {
                  let bestOffset = -1;
                  let bestCurrent = 0;
                  for (const [offset, charProgress] of stateRefs.offsetToCharMap.entries()) {
                    if (offset <= scrollOffset && offset > bestOffset) {
                      bestOffset = offset;
                      bestCurrent = charProgress;
                    }
                  }
                  if (bestOffset !== -1) {
                    current = bestCurrent;
                    console.log(`[NT DEBUG tick] DEFERRED fallback: scrollOffset=${scrollOffset} bestOffset=${bestOffset} → current=${current}`);
                  } else {
                    // No prior offset mapping — hold current chars by reconstructing
                    // the previous current value so the diff produces no change
                    current = stateRefs.globalSessionStartChar + (ttuState.chars - stateRefs.globalManualCharOffset);
                    console.log(`[NT DEBUG tick] DEFERRED no-match: reconstructed current=${current} (startChar=${stateRefs.globalSessionStartChar} chars=${ttuState.chars} manualOffset=${stateRefs.globalManualCharOffset})`);
                  }
                }
              } else {
                // Monotonic guard — see recalculateChars for full explanation
                const prevMapValue = stateRefs.offsetToCharMap.get(scrollOffset);
                if (prevMapValue === undefined || current >= prevMapValue) {
                  stateRefs.offsetToCharMap.set(scrollOffset, current);
                }
                if (isPaginated) {
                  const nextMapValue = stateRefs.offsetToCharMap.get(scrollOffset + pageWidth);
                  const nextCurrent = current + (charData.visible || 0);
                  if (nextMapValue === undefined || nextCurrent >= nextMapValue) {
                    stateRefs.offsetToCharMap.set(scrollOffset + pageWidth, nextCurrent);
                  }
                }
              }

              const activeSection = charData.sectionIndex !== null ? charData.sectionIndex : -1;
              if (stateRefs.globalSessionStartChar === -1) {
                stateRefs.globalSessionStartChar = scrollOffset > 50 ? 0 : current;
              } else if (activeSection !== -1 && stateRefs.globalSessionStartSection !== -1) {
                if (activeSection === stateRefs.globalSessionStartSection) {
                  if (stateRefs.globalSessionStartChar !== stateRefs.globalSessionStartCharInternal) {
                    stateRefs.globalSessionStartChar = stateRefs.globalSessionStartCharInternal!;
                  }
                } else {
                  if (stateRefs.globalSessionStartChar !== 0) {
                    stateRefs.globalSessionStartChar = 0;
                  }
                }
              }
              if (now >= _transitionGraceUntil) {
                let diff = current - stateRefs.globalSessionStartChar;
                if (diff < 0) diff = 0;
                ttuState.chars = diff + stateRefs.globalManualCharOffset;
              } else {
                if (isPaginated) {
                  ttuState.chars = (current - stateRefs.globalSessionStartChar) + stateRefs.globalManualCharOffset;
                }
              }
            }
          }
        }
        stateRefs.globalLastTick = now;

        const lastSec = Math.floor((ttuState.timeMs - elapsed) / 1000);
        const currSec = Math.floor(ttuState.timeMs / 1000);
        if (currSec !== lastSec) {
          dispatchLinkerRefresh();
        }
        if (_cachedAutoSave !== false) liveSyncQueue();
      }
    }, 200);
  } finally {
    isChronoInitializing = false;
  }
}

function isTargetInIgnoredContainer(target: Node): boolean {
  const element = target.nodeType === Node.ELEMENT_NODE ? (target as HTMLElement) : target.parentElement;
  if (!element) return false;
  return !!element.closest('#nt-ttu-chrono-wrapper, #nt-overlay, [class*="nt-toast"]');
}

if (isRelevantFrame) {
  let scrollRafId: number | null = null;
  const handleScrollUpdate = () => {
    if (!ttuState.running) return;
    if (scrollRafId !== null) return;
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null;
      if (!isReadingViewActive() || stabilizer.getGracePeriodActive()) return;
      recalculateChars(true);
    });
  };

  window.addEventListener('scroll', handleScrollUpdate, { passive: true, capture: true });
  window.addEventListener('resize', handleScrollUpdate, { passive: true });
  window.addEventListener('click', () => {
    invalidateYatsuSidebarCache();
    if (ttuState.running && isReadingViewActive() && !stabilizer.getGracePeriodActive()) {
      setTimeout(() => { recalculateChars(true); }, 16);
    }
  }, { passive: true });
  window.addEventListener('keyup', (e) => {
    invalidateYatsuSidebarCache();
    if (ttuState.running && isReadingViewActive() && !stabilizer.getGracePeriodActive() && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown'].includes(e.key)) {
      setTimeout(() => { recalculateChars(true); }, 16);
    }
  }, { passive: true });

  window.addEventListener('popstate', () => { invalidateReadingViewCache(); invalidateYatsuSidebarCache(); handleMutations(); });
  window.addEventListener('hashchange', () => { invalidateReadingViewCache(); invalidateYatsuSidebarCache(); handleMutations(); });

  const origPushState = window.history.pushState;
  window.history.pushState = function (...args) {
    origPushState.apply(this, args);
    invalidateReadingViewCache();
    invalidateYatsuSidebarCache();
    handleMutations();
  };
  const origReplaceState = window.history.replaceState;
  window.history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    invalidateReadingViewCache();
    invalidateYatsuSidebarCache();
    handleMutations();
  };

  const forceSyncOnExit = () => {
    if (ttuState.running && getReaderConfig(currentConfig).autoSave !== false) {
      liveSyncQueue(true);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') forceSyncOnExit();
  });
  window.addEventListener('pagehide', forceSyncOnExit);
  window.addEventListener('beforeunload', forceSyncOnExit);

  document.addEventListener('nt-theme-lock-released', () => {
    invalidateReadingViewCache();
    invalidateYatsuSidebarCache();
    handleMutations();
  });
}

function initSessionRefs(current: number, activeSection: number, total: number, isPaginated: boolean) {
  stateRefs.globalSessionStartChar = current; // Correctly initialize the baseline to our active offset position
  stateRefs.globalManualCharOffset = 0;
  stateRefs.lastSectionIndex = activeSection;
  stateRefs.lastSectionTotal = total;
  stateRefs.visitedSections.clear();
  stateRefs.visitedSections.set(activeSection, 0);
  stateRefs.visitedSectionTotals.clear();
  stateRefs.offsetToCharMap.clear();
  if (isPaginated) {
    stateRefs.visitedSectionTotals.set(activeSection, total);
  }
}

function isChapterLoading(): boolean {
  const loader = document.querySelector('.fixed.inset-0.flex.items-center.justify-center');
  if (loader && loader.querySelector('svg')) return true;
  const contentContainer = document.querySelector('.book-content-container');
  return !!(contentContainer && contentContainer.children.length === 0);
}

function isDictNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return true;
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'RT' || tag === 'RP' || tag === 'RUBY') return true;
    const className = el.className;
    let classStr = '';
    if (typeof className === 'string') classStr = className;
    else if (className && typeof className === 'object' && 'baseVal' in className) classStr = (className as SVGAnimatedString).baseVal || '';
    if (classStr) {
      const lowerClass = classStr.toLowerCase();
      if (lowerClass.includes('jiten') || lowerClass.includes('yomichan') || lowerClass.includes('yomichan') || lowerClass.includes('yomitan')) return true;
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
    if ((window as any).__nt_applying_theme__) return;
    for (const m of mutations) {
      const target = m.target as HTMLElement;
      if (!target) continue;
      if (isInlineTag(target.tagName)) continue;
      if (isTargetInIgnoredContainer(target)) continue;

      let hasStyleOrClassChange = false;
      if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style' || m.attributeName === 'data-view-mode')) {
        hasStyleOrClassChange = true;
      }

      if (hasStyleOrClassChange) {
        clearExtractorCache();
        invalidateYatsuSidebarCache();
        scheduleMutations();
        break;
      }

      let isDictionaryMutation = true;
      const addedLen = m.addedNodes.length;
      for (let i = 0; i < addedLen; i++) {
        if (!isDictNode(m.addedNodes[i])) { isDictionaryMutation = false; break; }
      }
      if (isDictionaryMutation) {
        const removedLen = m.removedNodes.length;
        for (let i = 0; i < removedLen; i++) {
          if (!isDictNode(m.removedNodes[i])) { isDictionaryMutation = false; break; }
        }
      }

      if (!stabilizer.getGracePeriodActive() && !stabilizer.getSilentGraceActive()) {
        let hasJitenAdded = false;
        for (let i = 0; i < addedLen; i++) {
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
          if (ttuState.running) stabilizer.runSilentGracePeriodIfJiten(true);
          else stabilizer.runGracePeriodIfJiten(true);
        }
      }

      let hasStyleTagMutation = false;
      for (let i = 0; i < addedLen; i++) {
        const nodeName = m.addedNodes[i].nodeName;
        if (nodeName === 'LINK' || nodeName === 'STYLE') {
          hasStyleTagMutation = true;
          break;
        }
      }
      if (!hasStyleTagMutation) {
        const removedLen = m.removedNodes.length;
        for (let i = 0; i < removedLen; i++) {
          const nodeName = m.removedNodes[i].nodeName;
          if (nodeName === 'LINK' || nodeName === 'STYLE') {
            hasStyleTagMutation = true;
            break;
          }
        }
      }

      if (hasStyleTagMutation && isReadingViewActive()) scheduleInstantThemeSync();
      if (isDictionaryMutation) continue;

      // Invalidate the Yatsu sidebar evaluation cache upon any core reader mutations
      invalidateYatsuSidebarCache();

      scheduleMutations();
      break;
    }
  };

  const findReaderContainer = (): Element | null => {
    const selectors = ['.book-content-container', '.book-content', '[data-ref="container"]', '.reader-container', '#reader-container', '.reader-wrapper', '.writing-container', '#writing-container'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && !el.closest('#nt-ttu-chrono-wrapper, #nt-overlay, .nt-toast')) return el;
    }
    return null;
  };

  const startObserver = () => {
    const targetEl = findReaderContainer() || document.body || document.documentElement;
    if (activeMutationObserver && currentObservedElement === targetEl) return;
    if (activeMutationObserver) activeMutationObserver.disconnect();

    activeMutationObserver = new MutationObserver(observerCallback);
    currentObservedElement = targetEl;

    // Observe child modifications across the subtree
    activeMutationObserver.observe(targetEl, {
      childList: true,
      subtree: true
    });

    // Observe attribute changes ONLY on the high-level container to prevent infinite performance loops
    activeMutationObserver.observe(targetEl, {
      attributes: true,
      subtree: false,
      attributeFilter: ['class', 'style', 'data-view-mode']
    });

    // Track class transitions on root document wrappers directly without subtree costs
    activeMutationObserver.observe(document.documentElement, {
      attributes: true,
      subtree: false,
      attributeFilter: ['class', 'style', 'data-view-mode']
    });
    activeMutationObserver.observe(document.body, {
      attributes: true,
      subtree: false,
      attributeFilter: ['class', 'style', 'data-view-mode']
    });

    handleMutations();
  };

  rootObserver = new MutationObserver((mutations) => {
    if ((window as any).__nt_applying_theme__) return;
    let actualThemeChange = false;
    for (const m of mutations) {
      if (m.attributeName === 'class' || m.attributeName === 'data-theme') { actualThemeChange = true; break; }
    }
    if (actualThemeChange) {
      clearThemeDetectionCache();
      scheduleInstantThemeSync();
      scheduleMutations();
    }
  });
  rootObserver.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class', 'data-theme'] });

  rootStyleObserver = new MutationObserver((mutations) => {
    if ((window as any).__nt_applying_theme__) return;
    let actualStyleChange = false;
    for (const m of mutations) {
      if (m.attributeName === 'style') { actualStyleChange = true; break; }
    }
    if (actualStyleChange) {
      clearThemeDetectionCache();
      scheduleInstantThemeSync();
    }
  });
  rootStyleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  rootStyleObserver.observe(document.body, { attributes: true, attributeFilter: ['style'] });

  bodyObserver = new MutationObserver(() => {
    invalidateReadingViewCache();
    invalidateYatsuSidebarCache();
    handleMutations();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: false });

  startObserver();

  const checkInterval = setInterval(() => {
    if (!isReadingViewActive()) return;
    const container = findReaderContainer();
    if (container && currentObservedElement !== container) startObserver();
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
    if (lastLoggedPaginatedMode === false) _transitionGraceUntil = Date.now() + 400;
    stabilizer.runGracePeriodIfJiten();
    // Schedule a retry to handle injection once the loader finishes
    if (!document.getElementById('nt-ttu-chrono-wrapper')) {
      setTimeout(() => {
        invalidateReadingViewCache();
        handleMutations();
      }, 250);
    }
    return;
  }

  const isActive = isReadingViewActive();
  if (isActive && !_wasReadingViewActive) {
    _wasReadingViewActive = true;
    clearThemeDetectionCache();
    scheduleInstantThemeSync();

    startNewSession();

    _wasTimerRunningBeforeYatsuSidebar = false;
    _isYatsuSidebarCurrentlyOpen = false;

    // Cache local active tab title asynchronously
    updateCachedActiveTabTitle();

    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) {
      dispatchLinkerRefresh();
      wrapper.dispatchEvent(new CustomEvent('nt-history-refresh'));
    }
  } else if (!isActive && !_debouncedReadingViewActive) {
    _wasReadingViewActive = false;
  }

  const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
  const adapter = getActiveReaderAdapter();
  if (isReadingViewActive()) {
    const target = findTTUInsertPoint();
    if (target) {
      const readerCfg = getReaderConfig(currentConfig);
      if (readerCfg.enabled !== false) {
        if (!wrapper) setupTTUChronometer();
        else {
          const expectedParent = (target.pos === 'beforebegin' || target.pos === 'afterend') ? target.el.parentElement : target.el;
          if (wrapper.parentElement !== expectedParent) target.el.insertAdjacentElement(target.pos, wrapper);
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

  if (wrapper && adapter) adapter.onUpdateStyles?.(wrapper);
  if (ttuState.running && isReadingViewActive()) setupProgressObserver();

  // Synchronous and immediate section boundary verification wrapped in active frame guard
  if (document.getElementById('nt-ttu-chrono-wrapper')) {
    const charData = extractAdvancedCharCount(undefined, ttuState.running);
    if (charData !== null) {
      const didTransition = checkAndProcessSectionTransition(charData);
      if (didTransition) {
        recalculateChars(true); // Force immediate synchronously drawn update bypassing throttle
      }
    }
  }

  if (!adapter) {
    if (window.self !== window.top && currentConfig.overlayPosition !== 'hidden' && !getOverlayDismissed()) {
      const overlay = overlayController.getOverlayElement();
      if (!overlay) overlayController.checkAndRunOverlay(currentConfig, { get value() { return isAnalyzingPage; }, set value(v) { isAnalyzingPage = v; } });
    }
  }

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
      showToast(title, msg, event.data.error || title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
    }
  });
}

function startTimeTracker() {
  if ((window as any).__nt_timer_instance__) {
    try { (window as any).__nt_timer_instance__.destroy(); } catch (e) { }
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
    if (adapter && originalName) safelySetAdapterName(adapter, originalName);

    configStorage.watch((newCfg) => {
      if (newCfg) {
        // Force reset the cached reading view status and elements to prevent 
        // the chronometer from failing to re-inject after settings/theme changes.
        invalidateReadingViewCache();

        currentConfig = newCfg;
        _cachedAutoSave = getReaderConfig(newCfg).autoSave !== false;
        clearThemeDetectionCache();

        const activeThemeCfg = getActiveThemeConfig(newCfg);
        const adapter = getActiveReaderAdapter();
        const originalName = adapter ? adapter.name : null;
        if (adapter && originalName && (originalName.includes('Yatsu') || originalName.includes('YomiYasu'))) {
          safelySetAdapterName(adapter, 'ッツ Ebook Reader');
        }

        applyActiveTheme(activeThemeCfg);

        if (adapter && originalName) safelySetAdapterName(adapter, originalName);

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
          } else setupTTUChronometer();
          dispatchLinkerRefresh();
        } else {
          if (isWebsiteOverlaySkipped(newCfg) || newCfg.overlayPosition === 'hidden' || getOverlayDismissed()) {
            const overlay = overlayController.getOverlayElement();
            if (overlay) overlay.style.display = 'none';
            return;
          }
          let customColors = undefined;
          const themeName = getActiveThemeName(newCfg);
          if (themeName.startsWith('custom_') || themeName.startsWith('custom-') || themeName === 'custom') {
            const id = themeName.replace('custom_', '').replace('custom-', '');
            const customTheme = (newCfg.customThemes || []).find((t: any) => t.id === id || t.id === themeName);
            if (customTheme) customColors = customTheme.colors;
            else if (newCfg.customColors) customColors = newCfg.customColors;
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
              if (pauseBtn) updatePauseIconState(pauseBtn, pauseBtn.textContent === '▶');
              const resetBtn = existingOverlay.querySelector('.nt-ctrl[title="Reset timer"]') as HTMLElement;
              if (resetBtn) resetBtn.style.setProperty('font-size', '11px', 'important');
              const closeBtn = existingOverlay.querySelector('.nt-close') as HTMLElement;
              if (closeBtn) closeBtn.style.setProperty('font-size', '12px', 'important');
            } else existingOverlay.style.setProperty('display', 'none', 'important');
          } else overlayController.checkAndRunOverlay(newCfg, { get value() { return isAnalyzingPage; }, set value(v) { isAnalyzingPage = v; } });
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

        const linkMap = await ttuLinkStorage.getValue() || {};
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
            const isPag = initCount !== null ? initCount.isPaginated : false;
            stateRefs.globalSessionStartChar = isPag ? 0 : (initCount !== null ? initCount.current : -1);
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
              links[rawTitle] = { mediaId: existing.mediaId, volume: existing.volume || 1, mediaData: existing.mediaData as ReadingMediaData };
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
              dispatchLinkerRefresh();
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

    let customColors = undefined;
    const themeName = getActiveThemeName(cfg);
    if (themeName.startsWith('custom_') || themeName.startsWith('custom-') || themeName === 'custom') {
      const id = themeName.replace('custom_', '').replace('custom-', '');
      const customTheme = (cfg.customThemes || []).find((t: any) => t.id === id || t.id === themeName);
      if (customTheme) customColors = customTheme.colors;
      else if (cfg.customColors) customColors = cfg.customColors;
    }

    injectThemeStyles(themeName, cfg.font ?? 'sans', customColors);
    overlayController.checkAndRunOverlay(cfg, { get value() { return isAnalyzingPage; }, set value(v) { isAnalyzingPage = v; } });
  },
});