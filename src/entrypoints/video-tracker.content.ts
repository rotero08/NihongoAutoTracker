/**
 * ── Video Tracker Content Script ─────────────────────────────────────────────
 */
import { defineContentScript } from '#imports';
import '@/assets/video-tracker.css';
import { getActiveVideoAdapter } from '@/lib/adapters/video';
import { submitLog } from '@/lib/api/nihongotracker';
import { configStorage } from '@/lib/storage/config';
import { addDebugLog } from '@/lib/storage/debug';
import { updateVideoQueueAtomic, videoQueueStorage } from '@/lib/storage/queues';
import { showPlaylistSelectorModal } from '@/lib/ui/playlist-modal';
import { applyThemeToDocument, getTheme } from '@/lib/ui/themes';
import { BADGE_ID, BADGE_TIME_CLASS, shouldHideBadge } from '@/lib/ui/video-badge';
import { injectModalStyles, showNTEditModal } from '@/lib/ui/video-modal';
import { BadgeRenderer } from '@/lib/utils/badge-renderer';
import { setSafeHTML } from '@/lib/utils/dom';
import { PlayerTrackerEngine } from '@/lib/utils/player-tracker-engine';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { cleanUrl } from '@/lib/utils/url';
import {
  clearExtractionCaches,
  fetchYouTubeVideoData,
  getChannelMediaData
} from '@/lib/utils/youtube-extraction';

let cachedConfig: any = {};

let isMusicVideoCached = false;
let isJapaneseVideoCached = false;
let metadataResolved = false;
let lastAnalyzedUrl = '';
let lastAnalyzedTitle = '';
let channelPollInterval: any = null;

// Layout guard reference variables to prevent redundant DOM updates and layout thrashing
let lastRenderedCurrentSecs = -1;
let lastRenderedTotalSecs = -1;
let lastRenderedUrl = '';

function isYouTubeShorts(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/shorts/');
}

function resolvePageLanguageAndType() {
  const currentUrl = window.location.href;
  const currentTitle = document.title;
  const adapter = getActiveVideoAdapter();
  if (!adapter) return;

  // We keep re-evaluating layout elements if we haven't matched Japanese yet to ensure we support slow-loading live streams
  if (currentUrl === lastAnalyzedUrl && currentTitle === lastAnalyzedTitle && metadataResolved && isJapaneseVideoCached) {
    return;
  }

  const isGenericTitle = currentTitle === 'YouTube' || currentTitle === '';

  isMusicVideoCached = adapter.isMusic();
  isJapaneseVideoCached = adapter.isLikelyJapanese();
  lastAnalyzedUrl = currentUrl;
  lastAnalyzedTitle = currentTitle;

  metadataResolved = !isGenericTitle;

  // Swapped noisy storage logs with compile-time dead-code eliminated console logs
  if (import.meta.env.DEV) {
    console.log(`[NAT DEV - VideoTracker] Resolved video classification metadata`, {
      title: currentTitle,
      isMusic: isMusicVideoCached,
      isJapanese: isJapaneseVideoCached,
      resolved: metadataResolved
    });
  }
}

let _adPlayingCached = false;
let _adPlayingLastCheck = 0;

function isAdPlaying(): boolean {
  const now = performance.now();
  if (now - _adPlayingLastCheck < 500) return _adPlayingCached;
  _adPlayingLastCheck = now;

  const host = window.location.hostname;
  if (host.includes('youtube.com')) {
    _adPlayingCached = !!document.querySelector(
      '.ad-showing, .ad-interrupting, .html5-video-player.ad-showing, .html5-video-player.ad-interrupting'
    );
    return _adPlayingCached;
  }
  _adPlayingCached = false;
  return false;
}

const engine = new PlayerTrackerEngine(
  (currentSecs, totalSecs) => {
    if (!trackedVideo || !currentUrl || isYouTubeShorts()) return;

    const roundedCurrent = Math.floor(currentSecs);
    const roundedTotal = Math.floor(totalSecs);

    // If values have not changed and the URL is the same, skip rendering to avoid layout thrashing
    if (roundedCurrent === lastRenderedCurrentSecs && roundedTotal === lastRenderedTotalSecs && currentUrl === lastRenderedUrl) {
      return;
    }

    lastRenderedCurrentSecs = roundedCurrent;
    lastRenderedTotalSecs = roundedTotal;
    lastRenderedUrl = currentUrl;

    badgeRenderer.ensureCounter(
      currentSecs,
      totalSecs,
      currentUrl,
      channelId,
      cachedChannelName,
      cachedConfig,
      trackedVideo,
      state,
      handleBadgeClick
    );
  },
  () => resetSession(),
  () => {
    resolvePageLanguageAndType();
    return { isJapanese: isJapaneseVideoCached, isMusic: isMusicVideoCached };
  }
);

const badgeRenderer = new BadgeRenderer(
  (vid) => {
    const adapter = getActiveVideoAdapter();
    return adapter ? adapter.getTimestampContainer?.(vid) || null : null;
  },
  isAdPlaying,
  () => {
    resolvePageLanguageAndType();
    return { isJapanese: isJapaneseVideoCached, isMusic: isMusicVideoCached };
  }
);

let trackedVideo: HTMLVideoElement | null = null;
let currentUrl = '';
let channelId: string | null = null;
let cachedChannelName = '';
let lastTickTime = 0;
const state = { hasTriggered: false, isManualLogging: false };

const resetSession = () => {
  engine.reset();
  currentUrl = cleanUrl(window.location.href);
  lastRenderedCurrentSecs = -1;
  lastRenderedTotalSecs = -1;
  lastRenderedUrl = '';
  const badgeLabel = document.querySelector(`#${BADGE_ID} .${BADGE_TIME_CLASS}`);
  if (badgeLabel) badgeLabel.textContent = "0:00";
};

async function handleBadgeClick() {
  if (isYouTubeShorts()) return;
  const existingPopup = document.getElementById('nt-modal-popup');
  if (existingPopup) {
    const closer = (existingPopup as any).__ntCloseModal as ((submitted: boolean) => void) | undefined;
    if (typeof closer === 'function') closer(false);
    else existingPopup.remove();
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
  let finalTitle = stripVideoTitle(document.title);

  if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
    const data = await fetchYouTubeVideoData(window.location.href);
    if (data?.video?.title) {
      finalTitle = data.video.title.contentTitleNative || data.video.title.contentTitleEnglish || finalTitle;
    }
  }

  const badgeEl = document.getElementById(BADGE_ID);
  if (!badgeEl || !trackedVideo) {
    state.isManualLogging = false;
    return;
  }

  showNTEditModal(badgeEl, cachedConfig.theme, {
    channelName,
    videoTitle: finalTitle,
    url: currentUrl,
    totalSecs: engine.getTotal(),
    videoDurationSecs: trackedVideo.duration && !isNaN(trackedVideo.duration) && trackedVideo.duration > 0 && Number.isFinite(trackedVideo.duration)
      ? trackedVideo.duration
      : engine.getTotal(),
    showTotal: liveShowTotal,
    channelId,
    onToggleShowTotal: async (v) => {
      const c = await configStorage.getValue() as any;
      await configStorage.setValue({ ...c, showTotalInBadge: v });
    }
  }, async final => {
    try {
      engine.setHasTriggered(true);
      const mediaData = await getChannelMediaData(channelId, final.title);
      const ok = await submitLog({
        type: "video",
        mediaId: (mediaData.channelId && mediaData.channelId !== "web-video") ? mediaData.channelId : (channelId && channelId !== "web-video") ? channelId : "web-video",
        description: final.desc,
        mediaData,
        episodes: 0,
        time: Math.floor(final.time),
        pages: 0,
        date: final.date || new Date().toISOString(),
        unknownDate: false
      });
      if (ok) {
        if (final.clearSessions) {
          await updateVideoQueueAtomic(async (queue) => queue.filter(q => q.contentTitleEnglish !== currentUrl));
          resetSession();
        } else {
          engine.setHasTriggered(false);
        }
      } else {
        engine.setHasTriggered(false);
      }
    } catch (err) {
      engine.setHasTriggered(false);
    }
  }, (submitted) => {
    state.isManualLogging = false;
    if (!submitted) engine.setHasTriggered(false);
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
  // Clear engine references and polling intervals to prevent memory leaks
  engine.clearVideoElement();
  if (channelPollInterval) {
    clearInterval(channelPollInterval);
    channelPollInterval = null;
  }
}

const attach = (vid: HTMLVideoElement) => {
  if (isYouTubeShorts()) {
    engine.flushPlayClock();
    document.getElementById(BADGE_ID)?.remove();
    unbindActiveVideoListeners();
    trackedVideo = null;
    return;
  }
  const cleanedHref = cleanUrl(window.location.href);
  const adapter = getActiveVideoAdapter();
  if (!adapter) return;

  if (currentUrl === cleanedHref && trackedVideo === vid) {
    return;
  }

  if (import.meta.env.DEV) {
    console.log(`[NAT DEV - VideoTracker] New Video Context Detected`, { url: cleanedHref });
  }

  clearExtractionCaches();
  document.getElementById('nt-playlist-modal')?.remove();
  document.getElementById('nt-modal-popup')?.remove();

  engine.flushPlayClock();
  if (trackedVideo && engine.getWatchedSecs() >= 60 && currentUrl && !engine.getHasTriggered()) {
    engine.finalizeSession(currentUrl);
  }

  unbindActiveVideoListeners();

  trackedVideo = vid;
  activeVideoElement = vid;
  currentUrl = cleanedHref;
  lastRenderedCurrentSecs = -1;
  lastRenderedTotalSecs = -1;
  lastRenderedUrl = '';
  channelId = null;
  cachedChannelName = '';
  metadataResolved = false;
  document.getElementById(BADGE_ID)?.remove();

  engine.initSession(currentUrl, 0, vid);

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

  const onSeeking = () => {
    engine.handleSeeking();
  };

  const onSeeked = () => {
    if (isYouTubeShorts()) return;
    if (vid.currentTime < 5) engine.setHasTriggered(false);
    engine.handleSeeked(vid);
  };

  const onTimeUpdate = async () => {
    if (isYouTubeShorts()) return;

    // Fast Path: Update the badge instantly on every single timeupdate event to eliminate input lag
    engine.updateBadgeLive(vid);

    const now = performance.now();
    if (now - lastTickTime < 1000) return;
    lastTickTime = now;

    if (isAdPlaying()) {
      engine.flushPlayClock(true);
      document.getElementById(BADGE_ID)?.remove();
      return;
    }

    // Slow Path: Handle database entries and threshold logging safely on a throttled interval
    await engine.handleTimeUpdate(vid, cachedConfig, channelId, cachedChannelName, document.title);
  };

  const onEnded = async () => {
    if (isAdPlaying() || isYouTubeShorts()) return;
    engine.flushPlayClock();
    if (engine.getHasTriggered()) return;

    resolvePageLanguageAndType();
    const skipMusic = isMusicVideoCached && !cachedConfig.logMusicVideos;

    if (isJapaneseVideoCached && !skipMusic && engine.reachedQueueThreshold(cachedConfig, vid)) {
      await engine.finalizeSession(currentUrl);
      resetSession();
    }
  };

  const onEmptied = async () => {
    engine.flushPlayClock();
    const urlNow = cleanUrl(window.location.href);
    if (urlNow !== currentUrl) {
      resolvePageLanguageAndType();
      if (!engine.getHasTriggered() && engine.getWatchedSecs() >= 1 && isJapaneseVideoCached && !isMusicVideoCached && !isYouTubeShorts()) {
        await engine.finalizeSession(currentUrl);
      }
      resetSession();
      document.getElementById(BADGE_ID)?.remove();
    }
  };

  boundVideoListeners = {
    playing: onPlaying,
    play: onPlay,
    pause: onPause,
    waiting: onWaiting,
    seeking: onSeeking,
    seeked: onSeeked,
    timeupdate: onTimeUpdate,
    ended: onEnded,
    emptied: onEmptied
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

    let updated = false;
    if (foundId && foundId !== channelId) {
      channelId = foundId;
      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - VideoTracker] Channel ID Discovered`, { channelId: foundId });
      }
      updated = true;
    }

    if (foundName && foundName !== cachedChannelName) {
      cachedChannelName = foundName;
      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - VideoTracker] Channel Name Discovered`, { channelName: foundName });
      }
      updated = true;
    }

    if (updated && trackedVideo) {
      badgeRenderer.ensureCounter(
        engine.getLiveWatched(),
        engine.getTotal(),
        currentUrl,
        channelId,
        cachedChannelName,
        cachedConfig,
        trackedVideo,
        state,
        handleBadgeClick
      );
    }
  };

  if (channelPollInterval) {
    clearInterval(channelPollInterval);
    channelPollInterval = null;
  }

  tryChannel();
  let pollCount = 0;
  channelPollInterval = setInterval(async () => {
    await tryChannel();
    if ((channelId && cachedChannelName) || pollCount++ > 20) {
      clearInterval(channelPollInterval);
      channelPollInterval = null;
    }
  }, 500);

  (async () => {
    const queue = await videoQueueStorage.getValue();
    const existing = queue.find(q => q.contentTitleEnglish === currentUrl) as any;
    const completedSessionSecs = existing
      ? (existing.sessions || []).reduce((a: number, s: any) => a + s.secs, 0)
      : 0;

    engine.initSession(currentUrl, completedSessionSecs, vid);

    badgeRenderer.ensureCounter(
      engine.getLiveWatched(),
      engine.getTotal(),
      currentUrl,
      channelId,
      cachedChannelName,
      cachedConfig,
      vid,
      state,
      handleBadgeClick
    );
  })();
};

function isPlaylistOrPodcastPage(): boolean {
  const pathname = window.location.pathname;
  const href = window.location.href;

  const isChannelRoute = pathname.startsWith('/@') ||
    pathname.startsWith('/channel/') ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/user/');

  if (isChannelRoute && !href.includes('list=')) {
    return false;
  }

  return href.includes('list=') ||
    pathname.startsWith('/playlist') ||
    !!document.querySelector('ytd-playlist-header-renderer, ytd-playlist-panel-renderer');
}

function getActivePlaylistContainers(): HTMLElement[] {
  if (!isPlaylistOrPodcastPage() || isYouTubeShorts()) {
    return [];
  }

  const classicSel = 'ytd-playlist-header-renderer .metadata-buttons-wrapper';
  const modernHeaderSel = 'yt-page-header-renderer yt-flexible-actions-view-model, yt-page-header-view-model yt-flexible-actions-view-model, yt-page-header-renderer ytd-menu-renderer, ytd-playlist-header-renderer ytd-menu-renderer';
  const panelSel = 'ytd-playlist-panel-renderer #playlist-action-menu #top-level-buttons-computed';

  const containers: HTMLElement[] = [];
  const selectors = `${classicSel}, ${modernHeaderSel}, ${panelSel}`;
  const matches = document.querySelectorAll(selectors);

  for (let i = 0; i < matches.length; i++) {
    const el = matches[i];
    if (el instanceof HTMLElement) {
      if (el.offsetWidth > 0 || el.offsetHeight > 0) {
        containers.push(el);
      }
    }
  }
  return containers;
}

function runPlaylistInjection(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (!host.includes('youtube.com') && !host.includes('youtu.be')) {
    return false;
  }
  if (!cachedConfig || cachedConfig.enablePlaylistLogger === false || isYouTubeShorts()) {
    return false;
  }

  const targets = getActivePlaylistContainers();
  if (targets.length === 0) {
    return false;
  }

  let injectedAny = false;

  for (const targetContainer of targets) {
    if (targetContainer.querySelector('.nt-playlist-logger')) {
      injectedAny = true;
      continue;
    }

    try {
      const btn = document.createElement('button');
      btn.className = 'nt-playlist-logger style-scope ytd-menu-renderer';
      setSafeHTML(btn, `
        <svg style="filter:none !important; box-shadow:none !important;" width="24" height="24" viewBox="0 0 24 24" fill="var(--nt-accent, #F5B831)">
          <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM10 5.5v9l6-4.5-6-4.5z"/>
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
        filter: 'none !important',
        boxShadow: 'none !important',
        flexShrink: '0'
      });

      btn.onmouseenter = () => btn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
      btn.onmouseleave = () => btn.style.backgroundColor = 'transparent';
      btn.onclick = (e) => {
        e.stopPropagation();

        const existingPlaylistModal = document.getElementById('nt-playlist-modal');
        if (existingPlaylistModal) {
          const closer = (existingPlaylistModal as any).__ntCloseModal as (() => void) | undefined;
          if (typeof closer === 'function') closer();
          else existingPlaylistModal.remove();
          return;
        }

        const isInline = targetContainer.closest('ytd-playlist-panel-renderer') !== null;
        showPlaylistSelectorModal(btn, isInline, cachedConfig.theme);
      };

      const overflowNode = targetContainer.querySelector(
        'yt-button-view-model:last-child, ytd-menu-renderer:last-child, button:last-child, [class*="button"]:last-child'
      );
      if (overflowNode && overflowNode.parentElement === targetContainer) {
        targetContainer.insertBefore(btn, overflowNode);
      } else {
        targetContainer.appendChild(btn);
      }
      injectedAny = true;
    } catch (err) {
      addDebugLog('ERROR', 'VideoTracker', 'Failed to execute playlist button injection', err);
    }
  }

  return injectedAny;
}

function runVideoInjection() {
  if (isYouTubeShorts()) {
    document.getElementById(BADGE_ID)?.remove();
    return;
  }
  const vid = document.querySelector<HTMLVideoElement>('video');
  if (vid) {
    try {
      attach(vid);
    } catch (err) { }
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

  async main() {
    cachedConfig = await configStorage.getValue() || {};

    const applyCachedTheme = (c: any) => {
      const theme = c.theme ?? 'nihongo';
      const font = c.font ?? 'sans';
      const useStaticInPageLogo = c.useStaticInPageLogo === true;
      let customColors: any = null;
      if (theme.startsWith('custom_') || theme.startsWith('custom-') || theme === 'custom') {
        const themeId = theme.replace('custom_', '').replace('custom-', '');
        const targetTheme = (c.customThemes || []).find((t: any) => t.id === themeId || t.id === theme);
        if (targetTheme) {
          customColors = targetTheme.colors;
        } else if (c.customColors) {
          customColors = c.customColors;
        }
      }
      applyThemeToDocument(theme, font, customColors, { useStaticInPageLogo });
      const activeTheme = getTheme(theme);
      injectModalStyles(activeTheme);
    };

    applyCachedTheme(cachedConfig);

    window.addEventListener('play', (e) => {
      if (isYouTubeShorts()) return;
      const target = e.target as HTMLVideoElement;
      if (target && target.tagName === 'VIDEO') {
        attach(target);
      }
    }, true);

    window.addEventListener('playing', (e) => {
      if (isYouTubeShorts()) return;
      const target = e.target as HTMLVideoElement;
      if (target && target.tagName === 'VIDEO') {
        attach(target);
      }
    }, true);

    // Active state-checking healing thread to recover play clocks suspended by backgrounding or transient buffer drops
    let healingLoopTimer: any = null;

    const startHealingLoop = (intervalTime = 1000) => {
      if (healingLoopTimer) {
        clearInterval(healingLoopTimer);
      }
      healingLoopTimer = setInterval(() => {
        const currentHref = cleanUrl(window.location.href);
        if (!isYouTubeShorts() && (currentHref.includes('watch') || !window.location.hostname.includes('youtube.com'))) {
          const vid = document.querySelector<HTMLVideoElement>('video');
          if (vid) {
            if (trackedVideo !== vid || currentUrl !== currentHref) {
              if (import.meta.env.DEV) {
                console.log(`[NAT DEV - VideoTracker] Standard polling loop: active video shift detected.`);
              }
              attach(vid);
            } else {
              // Keep the badge ticking smoothly on every polling loop interval
              if (!vid.paused && !vid.ended && !isAdPlaying()) {
                engine.updateBadgeLive(vid);
              }
            }
          }
        }

        if (trackedVideo && !trackedVideo.paused && !trackedVideo.ended && !isAdPlaying() && !isYouTubeShorts()) {
          if (engine.getPlayClockStart() < 0 && !engine.getIsUserSeeking()) {
            engine.startPlayClock(trackedVideo);
          }
        } else if (trackedVideo && (trackedVideo.paused || trackedVideo.ended || isAdPlaying() || isYouTubeShorts())) {
          if (engine.getPlayClockStart() >= 0) {
            engine.flushPlayClock();
          }
        }
      }, intervalTime);
    };

    // Initialize healing loop
    startHealingLoop(1000);

    // Manage healing loop throttling behavior on visibility shifts
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        startHealingLoop(5000);
      } else {
        startHealingLoop(1000);
      }
    });

    let pageObserver: MutationObserver | null = null;
    let pageObserverTimeout: number | null = null;

    const startTargetedObserver = () => {
      if (isYouTubeShorts()) {
        document.getElementById(BADGE_ID)?.remove();
        return;
      }
      if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
      }
      if (pageObserverTimeout) {
        clearTimeout(pageObserverTimeout);
        pageObserverTimeout = null;
      }

      const activeUrlOnNavigation = window.location.href;

      runVideoInjection();
      runPlaylistInjection();

      const target = document.querySelector('ytd-page-manager') || document.body;
      let rafPending = false;

      pageObserver = new MutationObserver((mutations) => {
        if (window.location.href !== activeUrlOnNavigation) {
          return;
        }

        let isRelevant = false;
        const len = mutations.length;
        for (let i = 0; i < len; i++) {
          const added = mutations[i].addedNodes;
          const addedLen = added.length;
          for (let j = 0; j < addedLen; j++) {
            const node = added[j];
            if (node instanceof HTMLElement) {
              const nodeName = node.nodeName;
              if (
                nodeName.includes('-') ||
                node.id === 'playlist-action-menu' ||
                node.id === 'top-level-buttons-computed'
              ) {
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

    window.addEventListener('yt-navigate-finish', startTargetedObserver);

    window.addEventListener('yt-navigate-start', () => {
      window.removeEventListener('yt-navigate-finish', startTargetedObserver);
      clearExtractionCaches();
      document.getElementById('nt-playlist-modal')?.remove();
      document.getElementById('nt-modal-popup')?.remove();
      engine.flushPlayClock();
      unbindActiveVideoListeners();
      trackedVideo = null;
      window.addEventListener('yt-navigate-finish', startTargetedObserver);
    });

    configStorage.watch((newCfg) => {
      if (newCfg) {
        cachedConfig = newCfg;
        applyCachedTheme(newCfg);

        const badge = document.getElementById(BADGE_ID);
        if (badge && trackedVideo) {
          resolvePageLanguageAndType();
          const shouldHide = shouldHideBadge(newCfg, isJapaneseVideoCached, isMusicVideoCached) || isAdPlaying() || isYouTubeShorts();
          if (shouldHide) {
            badge.remove();
          } else {
            badgeRenderer.ensureCounter(
              engine.getLiveWatched(),
              engine.getTotal(),
              currentUrl,
              channelId,
              cachedChannelName,
              newCfg,
              trackedVideo,
              state,
              handleBadgeClick
            );
          }
        }

        if (newCfg.enablePlaylistLogger === false) {
          document.querySelectorAll('.nt-playlist-logger').forEach(el => el.remove());
        } else {
          runPlaylistInjection();
        }
      }
    });

    videoQueueStorage.watch((queue) => {
      if (isYouTubeShorts()) return;
      const clean = cleanUrl(window.location.href);
      if (!queue || !queue.some((q: any) => q.contentTitleEnglish === clean)) {
        if (engine.getLastSyncSecs() > 0) {
          resetSession();
        }
      }
    });
  },
});
