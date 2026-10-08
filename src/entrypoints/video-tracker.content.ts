/**
 * ── Video Tracker Content Script ─────────────────────────────────────────────
 * Binds browser player event loops, watched threshold aggregators, and manual modals.
 */

import { defineContentScript } from '#imports';
import '@/assets/video-tracker.css';
import { getActiveVideoAdapter } from '@/lib/adapters/video';
import { submitLog } from '@/lib/api/nihongotracker';
import { PlayerTrackerEngine, type VideoClassification } from '@/lib/core/player-tracker-engine';
import { configStorage } from '@/lib/storage/config';
import { addDebugLog } from '@/lib/storage/debug';
import { updateVideoQueueAtomic, videoQueueStorage } from '@/lib/storage/queues';
import { getActiveReaderAdapter } from '@/lib/adapters/readers';
import { DEFAULT_THEME, type VideoSiteAdapter } from '@/lib/types';
import { cleanupPlaylistModal, clearPlaylistCache, showPlaylistSelectorModal } from '@/lib/ui/playlist-modal';
import { applyThemeToDocument, getTheme, resolveThemeColors } from '@/lib/ui/themes';
import { BADGE_ID, BADGE_TIME_CLASS, shouldHideBadge } from '@/lib/ui/video-badge';
import { injectModalStyles, showNTEditModal, cleanupActiveModal } from '@/lib/ui/video-modal';
import { BadgeRenderer } from '@/lib/utils/badge-renderer';
import { setSafeHTML } from '@/lib/utils/dom';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { cleanUrl } from '@/lib/utils/url';
import { showToast } from '@/lib/utils/toast';
import {
  clearExtractionCaches,
  fetchYouTubeVideoData,
  getChannelMediaData,
  pickChannelId,
} from '@/lib/utils/youtube-extraction';

let cachedConfig: any = {};
let channelPollInterval: any = null;

let lastRenderedCurrentSecs = -1;
let lastRenderedTotalSecs = -1;
let lastRenderedUrl = '';

let trackedVideo: HTMLVideoElement | null = null;
/** Session key of the tracked video; empty while nothing is tracked. */
let currentUrl = '';
let channelId: string | null = null;
let cachedChannelName = '';
let lastTickTime = 0;
const state = { hasTriggered: false, isManualLogging: false };

function isYouTubeShorts(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/shorts/');
}

/** Session key for the video playing in `vid`, or null when it must not be tracked. */
function resolveTrackingUrl(adapter: VideoSiteAdapter, vid: HTMLVideoElement): string | null {
  return adapter.getTrackingUrl ? adapter.getTrackingUrl(vid) : cleanUrl(window.location.href);
}

/** The page's primary player element, as opposed to a hover-preview player. */
function findMainVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('#movie_player video')
    ?? document.querySelector<HTMLVideoElement>('video');
}

function getVideoTitle(): string {
  return getActiveVideoAdapter()?.getVideoTitle?.() || stripVideoTitle(document.title);
}

function reportError(message: string, err: unknown) {
  void addDebugLog('ERROR', 'VideoTracker', message, err);
  if (import.meta.env.DEV) {
    console.error(`[NAT DEV - VideoTracker] ${message}`, err);
  }
}

/* ── Language / music classification ── */

const CLASSIFICATION_TTL_MS = 1000;
const UNKNOWN_CLASSIFICATION: VideoClassification = { isJapanese: false, isMusic: false, isLive: false };

let classification = UNKNOWN_CLASSIFICATION;
let classificationUrl = '';
let classificationAt = 0;

function invalidateClassification() {
  classification = UNKNOWN_CLASSIFICATION;
  classificationUrl = '';
  classificationAt = 0;
}

/**
 * Verdict for the tracked video. It is only ever cached for a moment: right
 * after an SPA navigation the page still describes the previous video, so a
 * verdict pinned to a URL would stick a wrong answer to the new one.
 *
 * @param fresh - Re-evaluate now; used right before a queue/send decision.
 */
function classifyVideo(fresh = false): VideoClassification {
  const adapter = getActiveVideoAdapter();
  if (!adapter || !currentUrl) return UNKNOWN_CLASSIFICATION;

  const now = performance.now();
  if (!fresh && classificationUrl === currentUrl && now - classificationAt < CLASSIFICATION_TTL_MS) {
    return classification;
  }

  classification = {
    isJapanese: adapter.isLikelyJapanese(),
    isMusic: adapter.isMusic(),
    isLive: adapter.isLive?.() ?? false,
  };
  classificationUrl = currentUrl;
  classificationAt = now;
  return classification;
}

let _adPlayingCached = false;
let _adPlayingLastCheck = 0;

function isAdPlaying(): boolean {
  const now = performance.now();
  if (now - _adPlayingLastCheck < 500) return _adPlayingCached;
  _adPlayingLastCheck = now;

  const adapter = getActiveVideoAdapter();
  _adPlayingCached = adapter ? adapter.isAdPlaying(document) : false;
  return _adPlayingCached;
}

const engine = new PlayerTrackerEngine(
  (currentSecs: number, totalSecs: number) => {
    if (!trackedVideo || !currentUrl || isYouTubeShorts()) return;
    const roundedCurrent = Math.floor(currentSecs);
    const roundedTotal = Math.floor(totalSecs);

    if (roundedCurrent === lastRenderedCurrentSecs && roundedTotal === lastRenderedTotalSecs && currentUrl === lastRenderedUrl) {
      return;
    }

    lastRenderedCurrentSecs = roundedCurrent;
    lastRenderedTotalSecs = roundedTotal;
    lastRenderedUrl = currentUrl;

    paintBadge(currentSecs, totalSecs);
  },
  () => resetSession(),
  classifyVideo
);

const badgeRenderer = new BadgeRenderer(
  (vid) => getActiveVideoAdapter()?.getTimestampContainer?.(vid) || null,
  isAdPlaying,
  () => classifyVideo()
);

function paintBadge(currentSecs: number, totalSecs: number, cfg: any = cachedConfig) {
  if (!trackedVideo) return;
  badgeRenderer.ensureCounter(
    currentSecs,
    totalSecs,
    currentUrl,
    channelId,
    cachedChannelName,
    cfg,
    trackedVideo,
    state,
    handleBadgeClick
  );
}

function resetRenderState() {
  lastRenderedCurrentSecs = -1;
  lastRenderedTotalSecs = -1;
  lastRenderedUrl = '';
}

/** Start a new session for the video that is already being tracked. */
const resetSession = () => {
  engine.reset();
  resetRenderState();
  const badgeLabel = document.querySelector(`#${BADGE_ID} .${BADGE_TIME_CLASS}`);
  if (badgeLabel) badgeLabel.textContent = "0:00";
};

async function handleBadgeClick() {
  if (isYouTubeShorts()) return;
  const existingPopup = document.getElementById('nt-modal-popup');
  if (existingPopup) {
    existingPopup.remove();
    state.isManualLogging = false;
    return;
  }

  if (state.isManualLogging) return;
  state.isManualLogging = true;

  const liveCfg = await configStorage.getValue() as any;
  const liveShowTotal = liveCfg.showTotalInBadge ?? true;
  const adapter = getActiveVideoAdapter();
  if (!adapter) {
    state.isManualLogging = false;
    return;
  }

  const channelName = cachedChannelName || await adapter.getChannelName();
  let finalTitle = adapter.getVideoTitle?.() || '';

  if (!finalTitle) {
    finalTitle = stripVideoTitle(document.title);
    if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
      const data = await fetchYouTubeVideoData(window.location.href);
      if (data?.video?.title) {
        finalTitle = data.video.title.contentTitleNative || data.video.title.contentTitleEnglish || finalTitle;
      }
    }
  }

  const badgeEl = document.getElementById(BADGE_ID);
  if (!badgeEl || !trackedVideo) {
    state.isManualLogging = false;
    return;
  }

  // The modal can stay open across a navigation; act on the video it was opened for.
  const loggedUrl = currentUrl;
  const loggedChannelId = channelId;

  showNTEditModal(badgeEl, cachedConfig.theme, {
    channelName,
    videoTitle: finalTitle,
    url: loggedUrl,
    totalSecs: engine.getTotal(),
    videoDurationSecs: trackedVideo.duration && !isNaN(trackedVideo.duration) && trackedVideo.duration > 0 && Number.isFinite(trackedVideo.duration)
      ? trackedVideo.duration
      : engine.getTotal(),
    showTotal: liveShowTotal,
    channelId: loggedChannelId,
    onToggleShowTotal: async (v: boolean) => {
      const c = await configStorage.getValue() as any;
      await configStorage.setValue({ ...c, showTotalInBadge: v });
    }
  }, async (final: any) => {
    const sameVideo = () => currentUrl === loggedUrl;
    try {
      if (sameVideo()) engine.setHasTriggered(true);
      const mediaData = await getChannelMediaData(loggedChannelId, final.title);
      const ok = await submitLog({
        type: "video",
        mediaId: pickChannelId(mediaData.channelId, loggedChannelId),
        description: final.desc,
        mediaData,
        episodes: 0,
        time: Math.floor(final.time),
        pages: 0,
        date: final.date || new Date().toISOString(),
        unknownDate: false
      });
      // submitLog always resolves to an object; only `success` says the log was accepted.
      if (ok?.success && final.clearSessions) {
        await updateVideoQueueAtomic((queue) => queue.filter(q => q.contentTitleEnglish !== loggedUrl));
        if (sameVideo()) resetSession();
      } else if (sameVideo()) {
        engine.setHasTriggered(false);
      }
    } catch (err) {
      if (sameVideo()) engine.setHasTriggered(false);
      reportError('Manual log submission failed', err);
    }
  }, (submitted: boolean) => {
    state.isManualLogging = false;
    if (!submitted && currentUrl === loggedUrl) engine.setHasTriggered(false);
  });
}

let activeVideoElement: HTMLVideoElement | null = null;
let boundVideoListeners: Record<string, EventListener> = {};

function unbindActiveVideoListeners() {
  if (activeVideoElement) {
    for (const [event, listener] of Object.entries(boundVideoListeners)) {
      activeVideoElement.removeEventListener(event, listener);
    }
    boundVideoListeners = {};
    activeVideoElement = null;
  }
  engine.clearVideoElement();
  if (channelPollInterval) {
    clearInterval(channelPollInterval);
    channelPollInterval = null;
  }
}

/** Stop tracking altogether; the next attach() starts a fresh session. */
function detachTracking() {
  unbindActiveVideoListeners();
  trackedVideo = null;
  currentUrl = '';
  invalidateClassification();
}

const attach = (vid: HTMLVideoElement) => {
  const adapter = getActiveVideoAdapter();
  if (!adapter) return;

  const trackingUrl = resolveTrackingUrl(adapter, vid);
  if (!trackingUrl) {
    // Shorts, hover previews and pages that are not a video are never tracked.
    // Only tear down when the element we track is the one that stopped qualifying.
    if (isYouTubeShorts() || vid === trackedVideo) {
      void engine.finalizeSession();
      detachTracking();
      document.getElementById(BADGE_ID)?.remove();
    }
    return;
  }

  if (currentUrl === trackingUrl && trackedVideo === vid) {
    return;
  }

  clearExtractionCaches();
  document.getElementById('nt-playlist-modal')?.remove();
  document.getElementById('nt-modal-popup')?.remove();

  // Close the previous session before the engine is re-initialised for this one.
  if (trackedVideo && !engine.getHasTriggered()) {
    void engine.finalizeSession();
  } else {
    engine.flushPlayClock();
  }

  unbindActiveVideoListeners();

  trackedVideo = vid;
  activeVideoElement = vid;
  currentUrl = trackingUrl;
  resetRenderState();
  channelId = null;
  cachedChannelName = '';
  invalidateClassification();
  document.getElementById(BADGE_ID)?.remove();

  engine.initSession(trackingUrl, 0, vid);

  const onPlaying = () => {
    if (isAdPlaying() || isYouTubeShorts()) return;
    engine.startPlayClock(vid);
  };
  const onPlay = () => {
    if (isAdPlaying() || isYouTubeShorts()) return;
    engine.startPlayClock(vid);
    if (vid.currentTime < 5) engine.setHasTriggered(false);
  };
  const onPause = () => { engine.flushPlayClock(); };
  const onWaiting = () => { engine.flushPlayClock(); };
  const onSeeking = () => { engine.handleSeeking(); };
  const onSeeked = () => {
    if (isYouTubeShorts()) return;
    if (vid.currentTime < 5) engine.setHasTriggered(false);
    engine.handleSeeked(vid);
  };
  const onTimeUpdate = () => {
    if (isYouTubeShorts()) return;

    // Checked before the clock is touched: an ad plays in this same element,
    // and none of its positions may be measured against the video's.
    if (isAdPlaying()) {
      engine.interruptPlayback();
      document.getElementById(BADGE_ID)?.remove();
      return;
    }

    engine.updateBadgeLive(vid);

    const now = performance.now();
    if (now - lastTickTime < 1000) return;
    lastTickTime = now;

    void engine.handleTimeUpdate(vid, cachedConfig, channelId, cachedChannelName, getVideoTitle());
  };
  const onEnded = async () => {
    if (isAdPlaying() || isYouTubeShorts()) return;
    engine.flushPlayClock();
    if (engine.getHasTriggered()) return;

    // Last sync of the session; a threshold close to 100% is only met here.
    if (!engine.passesQueueRules(cachedConfig, vid)) return;
    try {
      await engine.upsertQueueLive(getVideoTitle(), cachedChannelName, channelId);
    } catch (err) {
      reportError('Failed to queue finished video', err);
      return;
    }
    if (trackedVideo === vid && currentUrl === trackingUrl) resetSession();
  };
  const onEmptied = () => {
    // The element was handed a new source: an ad break, or the next video
    // loaded into it before any navigation event reached this script.
    engine.interruptPlayback();
    if (resolveTrackingUrl(adapter, vid) === trackingUrl) return;

    void engine.finalizeSession();
    detachTracking();
    document.getElementById(BADGE_ID)?.remove();
  };

  boundVideoListeners = {
    playing: onPlaying, play: onPlay, pause: onPause, waiting: onWaiting,
    seeking: onSeeking, seeked: onSeeked, timeupdate: onTimeUpdate, ended: onEnded, emptied: onEmptied
  };

  for (const [event, listener] of Object.entries(boundVideoListeners)) {
    vid.addEventListener(event, listener);
  }

  if (!vid.paused && !vid.ended && !isAdPlaying()) {
    engine.startPlayClock(vid);
  }

  const tryChannel = async () => {
    const foundId = await adapter.getChannelId();
    const foundName = await adapter.getChannelName();

    // The lookups are async; drop results that arrive after a navigation.
    if (trackedVideo !== vid || currentUrl !== trackingUrl) return;

    let updated = false;
    if (foundId && foundId !== channelId) {
      channelId = foundId;
      updated = true;
    }
    if (foundName && foundName !== cachedChannelName) {
      cachedChannelName = foundName;
      updated = true;
    }
    if (updated) {
      paintBadge(engine.getLiveWatched(), engine.getTotal());
    }
  };

  const pollChannel = () => tryChannel().catch((err) => reportError('Channel lookup failed', err));

  pollChannel();
  let pollCount = 0;
  const poll = setInterval(async () => {
    await pollChannel();
    // Compare against this timer, not the shared handle: by the time the lookup
    // resolves the handle may already belong to the next video's poll.
    if ((channelId && cachedChannelName) || pollCount++ > 20 || trackedVideo !== vid || currentUrl !== trackingUrl) {
      clearInterval(poll);
      if (channelPollInterval === poll) channelPollInterval = null;
    }
  }, 500);
  channelPollInterval = poll;

  // Time already queued for this video by earlier sessions, for the badge total.
  videoQueueStorage.getValue().then((queue) => {
    if (trackedVideo !== vid || currentUrl !== trackingUrl) return;

    const existing = queue.find(q => q.contentTitleEnglish === trackingUrl);
    engine.setCompletedSessionSecs((existing?.sessions || []).reduce((total, s) => total + s.secs, 0));
    paintBadge(engine.getLiveWatched(), engine.getTotal());
  }).catch((err) => reportError('Failed to read queued sessions', err));
};

function isPlaylistOrPodcastPage(): boolean {
  const pathname = window.location.pathname;
  const href = window.location.href;
  const isChannelRoute = pathname.startsWith('/@') || pathname.startsWith('/channel/') || pathname.startsWith('/c/') || pathname.startsWith('/user/');
  if (isChannelRoute && !href.includes('list=')) return false;
  return href.includes('list=') || pathname.startsWith('/playlist') || !!document.querySelector('ytd-playlist-header-renderer, ytd-playlist-panel-renderer');
}

/**
 * Resolves the target playlist header or panels.
 * Sequential search filters guarantee that only a single active container is ever returned,
 * preventing double-button rendering errors on YouTube SPA page transitions.
 */
function getActivePlaylistContainers(): HTMLElement[] {
  const adapter = getActiveVideoAdapter();
  if (!adapter || !isPlaylistOrPodcastPage() || isYouTubeShorts()) {
    return [];
  }
  return adapter.getPlaylistContainers(document);
}

function getActiveAccentColor(): string {
  const theme = cachedConfig.theme ?? 'dark-amber';
  const resolvedColors = resolveThemeColors(theme, cachedConfig.customThemes);
  return resolvedColors.accent || '#F5B831';
}

function runPlaylistInjection(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (!host.includes('youtube.com') && !host.includes('youtu.be')) return false;
  if (!cachedConfig || cachedConfig.enablePlaylistLogger === false || cachedConfig.hidePlaylistBadgeIcon === true || isYouTubeShorts()) return false;

  const targets = getActivePlaylistContainers();
  if (targets.length === 0) return false;

  const resolvedAccent = getActiveAccentColor();
  let injectedAny = false;
  const adapter = getActiveVideoAdapter();
  if (!adapter) return false;

  for (const targetContainer of targets) {
    const existingBtn = targetContainer.querySelector('.nt-playlist-logger') as HTMLElement;
    if (existingBtn) {
      // Ensure existing button style properties use the dynamic variable on theme changes
      existingBtn.style.setProperty('color', `var(--color-accent, ${resolvedAccent})`, 'important');
      const path = existingBtn.querySelector('path');
      if (path) {
        path.style.setProperty('fill', 'currentColor', 'important');
      }
      injectedAny = true;
      continue;
    }

    try {
      const btn = document.createElement('button');
      btn.className = 'nt-playlist-logger style-scope ytd-menu-renderer';
      setSafeHTML(btn, `
        <svg style="filter:none !important; box-shadow:none !important;" width="24" height="24" viewBox="0 0 24 24">
          <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM10 5.5v9l6-4.5-6-4.5z" style="fill: currentColor !important;" />
        </svg>
      `);

      Object.assign(btn.style, {
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        margin: '0 4px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        transition: 'background-color 0.2s',
        flexShrink: '0'
      });
      btn.style.setProperty('filter', 'none', 'important');
      btn.style.setProperty('box-shadow', 'none', 'important');
      btn.style.setProperty('color', `var(--color-accent, ${resolvedAccent})`, 'important');

      btn.onmouseenter = () => btn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
      btn.onmouseleave = () => btn.style.backgroundColor = 'transparent';
      btn.onclick = (e) => {
        // Blocks event propagation to avoid re-triggering YouTube mutations on click
        e.preventDefault();
        e.stopPropagation();

        const existingPlaylistModal = document.getElementById('nt-playlist-modal');
        if (existingPlaylistModal) {
          if (typeof cleanupPlaylistModal === 'function') cleanupPlaylistModal();
          else existingPlaylistModal.remove();
          return;
        }
        const isInline = targetContainer.closest('ytd-playlist-panel-renderer') !== null;
        showPlaylistSelectorModal(btn, isInline, cachedConfig.theme);
      };

      adapter.injectPlaylistButton(targetContainer, btn);
      injectedAny = true;
    } catch (err) {
      reportError('Failed to inject playlist button', err);
    }
  }
  return injectedAny;
}

function runVideoInjection() {
  if (isYouTubeShorts()) {
    document.getElementById(BADGE_ID)?.remove();
    return;
  }
  const vid = findMainVideo();
  if (vid) {
    try {
      attach(vid);
    } catch (err) {
      reportError('Failed to attach to video element', err);
    }
  }
}

function applyCachedTheme(c: any) {
  const theme = c.theme ?? 'dark-amber';
  const font = c.font ?? 'sans';
  const useStaticInPageLogo = c.useStaticInPageLogo === true;
  const customColors = resolveThemeColors(theme, c.customThemes);
  applyThemeToDocument(theme, font, customColors, { useStaticInPageLogo });

  const activeTheme = getTheme(theme) || JSON.parse(JSON.stringify(DEFAULT_THEME));
  if (customColors && activeTheme.colors) {
    activeTheme.colors = { ...activeTheme.colors, ...customColors };
  }

  injectModalStyles(activeTheme);
  injectThemeVariables(activeTheme);
}

function injectThemeVariables(theme: any) {
  if (!theme || !theme.colors) return;

  const colors = theme.colors;

  const isExtensionPage = typeof window !== 'undefined' &&
    (window.location.protocol.startsWith('chrome-extension') || window.location.protocol.startsWith('moz-extension'));
  const isReaderPage = typeof window !== 'undefined' && typeof getActiveReaderAdapter === 'function' && !!getActiveReaderAdapter();
  const shouldInjectRoot = isExtensionPage || isReaderPage;

  const containers = [
    document.getElementById('nt-modal-popup'),
    document.getElementById('nt-playlist-modal'),
    document.getElementById('nt-status-badge'),
    document.getElementById('nt-overlay')
  ].filter(Boolean) as HTMLElement[];

  document.querySelectorAll('.nt-playlist-logger').forEach((el) => {
    containers.push(el as HTMLElement);
  });

  const variables: Record<string, string> = {
    '--color-background': colors.background,
    '--color-surface': colors.surface,
    '--color-surface-alt': colors.surfaceAlt,
    '--color-border': colors.border,
    '--color-border-hover': colors.borderHover,
    '--color-text': colors.text,
    '--color-text-muted': colors.muted,
    '--color-text-dimmed': colors.muted,
    '--color-accent': colors.accent,
    '--nt-accent': colors.accent,
    '--color-accent-hover': colors.accentHover,
    '--color-success': colors.success,
    '--color-error': colors.error,
  };

  try {
    Object.entries(variables).forEach(([key, value]) => {
      if (shouldInjectRoot) {
        document.documentElement.style.setProperty(key, value, 'important');
      }
      containers.forEach((container) => {
        container.style.setProperty(key, value, 'important');
      });
    });
  } catch (err) {
    reportError('Failed to apply theme variables', err);
  }
}

export default defineContentScript({
  matches: [
    '*://*.youtube.com/*',
    '*://music.youtube.com/*',
    '*://*.crunchyroll.com/*',
    '*://*.animekai.to/*'
  ],
  cssInjectionMode: 'manifest',

  async main(ctx) {
    cachedConfig = await configStorage.getValue() || {};

    applyCachedTheme(cachedConfig);

    browser.runtime.onMessage.addListener((req: any) => {
      if (req.action === 'SHOW_TOAST') {
        const title = String(req.title || '');
        const msg = req.message || '';
        showToast(title, msg, title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
      }
    });

    const unwatches: (() => void)[] = [];

    const handlePlayEvent = (e: Event) => {
      if (isYouTubeShorts()) return;
      const target = e.target as HTMLVideoElement;
      if (target && target.tagName === 'VIDEO') attach(target);
    };
    window.addEventListener('play', handlePlayEvent, true);

    const handlePlayingEvent = (e: Event) => {
      if (isYouTubeShorts()) return;
      const target = e.target as HTMLVideoElement;
      if (target && target.tagName === 'VIDEO') attach(target);
    };
    window.addEventListener('playing', handlePlayingEvent, true);

    let healingLoopTimer: any = null;
    const startHealingLoop = (intervalTime = 1000) => {
      if (healingLoopTimer) clearInterval(healingLoopTimer);
      healingLoopTimer = setInterval(() => {
        if (!isYouTubeShorts()) {
          const vid = findMainVideo();
          if (vid) {
            // No-op while already attached to this element for this video;
            // otherwise (re)attaches, or detaches once the page stops qualifying.
            attach(vid);
            if (vid === trackedVideo && !vid.paused && !vid.ended && !isAdPlaying()) engine.updateBadgeLive(vid);
          }
        }

        if (!trackedVideo) return;
        if (isAdPlaying()) {
          engine.interruptPlayback();
        } else if (trackedVideo.paused || trackedVideo.ended || isYouTubeShorts()) {
          if (engine.getPlayClockStart() >= 0) engine.flushPlayClock();
        } else if (engine.getPlayClockStart() < 0 && !engine.getIsUserSeeking()) {
          engine.startPlayClock(trackedVideo);
        }
      }, intervalTime);
    };

    startHealingLoop(1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') startHealingLoop(5000);
      else startHealingLoop(1000);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let pageObserver: MutationObserver | null = null;
    let pageObserverTimeout: number | null = null;

    const startTargetedObserver = () => {
      if (isYouTubeShorts()) {
        document.getElementById(BADGE_ID)?.remove();
        return;
      }

      // Clean up past observers to resolve memory leak risks
      if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
      }
      if (pageObserverTimeout) {
        clearTimeout(pageObserverTimeout);
        pageObserverTimeout = null;
      }

      const activeUrlOnNavigation = window.location.href;

      // Re-apply theme properties to document context on SPA page changes
      applyCachedTheme(cachedConfig);

      runVideoInjection();
      runPlaylistInjection();

      const target = document.querySelector('ytd-page-manager') || document.body;
      let rafPending = false;

      pageObserver = new MutationObserver((mutations) => {
        if (window.location.href !== activeUrlOnNavigation) return;
        let isRelevant = false;
        const len = mutations.length;
        for (let i = 0; i < len; i++) {
          const added = mutations[i].addedNodes;
          const addedLen = added.length;
          for (let j = 0; j < addedLen; j++) {
            const node = added[j];
            if (node instanceof HTMLElement) {
              const nodeName = node.nodeName;
              if (nodeName.includes('-') || node.id === 'playlist-action-menu' || node.id === 'top-level-buttons-computed') {
                isRelevant = true;
                break;
              }
            }
          }
          if (isRelevant) break;
        }
        if (!isRelevant) return;
        if (rafPending) return;

        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          runVideoInjection();
          runPlaylistInjection();
        });
      });

      pageObserver.observe(target, { childList: true, subtree: true });

      pageObserverTimeout = window.setTimeout(() => {
        if (pageObserver) {
          pageObserver.disconnect();
          pageObserver = null;
        }
      }, 10000);
    };

    startTargetedObserver();

    const handleYtNavigateFinish = startTargetedObserver;
    window.addEventListener('yt-navigate-finish', handleYtNavigateFinish);

    const handleYtNavigateStart = () => {
      clearExtractionCaches();
      if (typeof cleanupPlaylistModal === 'function') {
        cleanupPlaylistModal();
      } else {
        const modal = document.getElementById('nt-playlist-modal');
        if (modal) modal.remove();
      }
      document.getElementById('nt-modal-popup')?.remove();
      // The element still holds the outgoing video here, so its final position is valid.
      void engine.finalizeSession();
      detachTracking();
    };
    window.addEventListener('yt-navigate-start', handleYtNavigateStart);

    ctx.onInvalidated(() => {
      // 1. Clear intervals
      if (healingLoopTimer) clearInterval(healingLoopTimer);
      if (channelPollInterval) {
        clearInterval(channelPollInterval);
        channelPollInterval = null;
      }
      if (pageObserverTimeout) {
        clearTimeout(pageObserverTimeout);
        pageObserverTimeout = null;
      }

      // 2. Disconnect observers
      if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
      }

      // 3. Remove event listeners
      window.removeEventListener('play', handlePlayEvent, true);
      window.removeEventListener('playing', handlePlayingEvent, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('yt-navigate-finish', handleYtNavigateFinish);
      window.removeEventListener('yt-navigate-start', handleYtNavigateStart);

      // 4. Clean up video elements and active video listeners
      unbindActiveVideoListeners();
      trackedVideo = null;

      // 5. Clean up modals, badges, and elements
      if (typeof cleanupPlaylistModal === 'function') {
        cleanupPlaylistModal();
      } else {
        const modal = document.getElementById('nt-playlist-modal');
        if (modal) modal.remove();
      }
      if (typeof cleanupActiveModal === 'function') {
        cleanupActiveModal();
      } else {
        document.getElementById('nt-modal-popup')?.remove();
      }
      document.getElementById(BADGE_ID)?.remove();
      document.querySelectorAll('.nt-playlist-logger').forEach(el => el.remove());

      // 6. Run storage unwatches
      unwatches.forEach(fn => fn());

      // 7. Clear module-level caches
      clearPlaylistCache();
    });

    unwatches.push(
      configStorage.watch((newCfg) => {
        if (newCfg) {
          cachedConfig = newCfg;
          applyCachedTheme(newCfg);

          const badge = document.getElementById(BADGE_ID);
          if (badge && trackedVideo) {
            const { isJapanese, isMusic } = classifyVideo();
            const shouldHide = shouldHideBadge(newCfg, isJapanese, isMusic) || isAdPlaying() || isYouTubeShorts();
            if (shouldHide) badge.remove();
            else paintBadge(engine.getLiveWatched(), engine.getTotal(), newCfg);
          }

          if (newCfg.enablePlaylistLogger === false || newCfg.hidePlaylistBadgeIcon === true) {
            document.querySelectorAll('.nt-playlist-logger').forEach(el => el.remove());
          } else runPlaylistInjection();
        }
      })
    );

    unwatches.push(
      videoQueueStorage.watch((queue) => {
        if (isYouTubeShorts() || !trackedVideo || !currentUrl) return;
        // Our entry was sent or deleted elsewhere: what follows is a new session.
        if (!queue || !queue.some((q) => q.contentTitleEnglish === currentUrl)) {
          if (engine.getLastSyncSecs() > 0) resetSession();
        }
      })
    );
  },
});
