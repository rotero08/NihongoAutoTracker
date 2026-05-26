/**
 * ── Video Tracker Content Script ─────────────────────────────────────────────
 */
import { defineContentScript } from '#imports';
import { configStorage } from '@/lib/storage/config';
import { videoQueueStorage } from '@/lib/storage/queues';
import { addDebugLog } from '@/lib/storage/debug';
import { submitLog } from '@/lib/api/nihongotracker';
import { fmtSecs } from '@/lib/utils/time';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { cleanUrl } from '@/lib/utils/url';
import { isMusic, isLikelyJapanese } from '@/lib/utils/japanese';
import { shouldHideBadge } from '@/lib/ui/video-badge';
import { showNTEditModal, injectModalStyles } from '@/lib/ui/video-modal';
import { showPlaylistSelectorModal } from '@/lib/ui/playlist-modal';
import {
  fetchYouTubeVideoData,
  getYouTubeChannelId,
  getChannelNameFallback,
  getChannelMediaData,
  clearExtractionCaches
} from '@/lib/utils/youtube-extraction';
import { getTheme, applyThemeToDocument } from '@/lib/ui/themes';
import '@/assets/player.css';

import rawLogoSvg from '../../public/NihongoAutoTracker.svg?raw';
const inlineLogo = rawLogoSvg.replace(/<svg\b/i, '<svg style="width:100%;height:100%;display:block;object-fit:contain;"');

if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
  browser.runtime.onMessage.addListener((req: any) => {
    if (req?.action === 'SHOW_TOAST') {
      if (window.self !== window.top) return;
    }
  });
}

// Stores bound video contexts to avoid duplicate event listener registration
const boundVideos = new WeakSet<HTMLVideoElement>();

// Cached page-level classification to prevent high-frequency DOM reflows
let isMusicVideoCached = false;
let isJapaneseVideoCached = false;
let metadataResolved = false;
let lastAnalyzedUrl = '';
let lastAnalyzedTitle = '';

function resolvePageLanguageAndType() {
  const currentUrl = window.location.href;
  const currentTitle = document.title;

  // Re-resolve only if the URL or title shifts
  if (currentUrl === lastAnalyzedUrl && currentTitle === lastAnalyzedTitle && metadataResolved) {
    return;
  }

  // Prevent caching generic metadata transitions
  const isGenericTitle = currentTitle === 'YouTube' || currentTitle === '';

  isMusicVideoCached = isMusic();
  isJapaneseVideoCached = isLikelyJapanese();
  lastAnalyzedUrl = currentUrl;
  lastAnalyzedTitle = currentTitle;

  if (!isGenericTitle) {
    metadataResolved = true;
  } else {
    metadataResolved = false;
  }

  addDebugLog('INFO', 'VideoTracker', 'Resolved video classification metadata', {
    title: currentTitle,
    isMusic: isMusicVideoCached,
    isJapanese: isJapaneseVideoCached,
    resolved: metadataResolved
  });
}

/** Detect if an ad is currently playing on the video player (cached 500ms) */
let _adPlayingCached = false;
let _adPlayingLastCheck = 0;

function isAdPlaying(): boolean {
  const now = performance.now();
  if (now - _adPlayingLastCheck < 500) return _adPlayingCached;
  _adPlayingLastCheck = now;

  const host = window.location.hostname;
  if (host.includes('youtube.com')) {
    _adPlayingCached = !!document.querySelector('.ad-showing, .ad-interrupting, .html5-video-player.ad-showing, .html5-video-player.ad-interrupting');
    return _adPlayingCached;
  }
  _adPlayingCached = false;
  return false;
}

function reachedQueueThreshold(cfg: any, liveSecs: number, vid: HTMLVideoElement): boolean {
  const tType = cfg.queueThresholdType ?? 'time';
  const tValue = cfg.queueThresholdValue ?? 1;
  if (tType === 'percent') {
    if (!vid.duration || vid.duration <= 0) return false;
    return (vid.currentTime / vid.duration) * 100 >= tValue;
  }
  return (liveSecs / 60) >= tValue;
}

async function upsertQueueLive(secs: number, videoTitle: string, channelName: string, url: string, channelId: string | null, sessionId: string) {
  const clean = cleanUrl(url);
  const finalTitle = stripVideoTitle(videoTitle);

  let validChannelName = channelName;
  if (!validChannelName || validChannelName === finalTitle) {
    validChannelName = await getChannelNameFallback();
  }

  const queue = await videoQueueStorage.getValue();
  const idx = queue.findIndex(q => q.contentTitleEnglish === clean);
  const mediaData = await getChannelMediaData(channelId, validChannelName);

  await addDebugLog('INFO', 'VideoTracker', `Upserting queue for session`, { secs, url: clean, finalTitle, channelName, channelId });

  if (idx !== -1) {
    const item = queue[idx] as any;
    item.sessions = item.sessions || [];

    const sIdx = item.sessions.findIndex((s: any) => s.id === sessionId);
    if (sIdx >= 0) {
      item.sessions[sIdx].secs = secs;
      item.sessions[sIdx].date = new Date().toISOString();
    } else {
      item.sessions.push({ id: sessionId, secs, date: new Date().toISOString() });
    }

    const completedSecs = item.sessions.reduce((a: number, s: any) => a + s.secs, 0);
    item.time = Math.max(1, Math.round(completedSecs / 60));
    item.description = finalTitle;
    item.contentTitleNative = channelName;
    if (channelId && !item.channelId) item.channelId = channelId;
    item.mediaData = { ...(item.mediaData || {}), ...mediaData };
    item.mediaId = item.mediaData?.channelId || item.channelId || item.mediaId || "web-video";
    delete item._currentSecs;
  } else {
    queue.push({
      id: crypto.randomUUID(),
      contentTitleNative: channelName,
      contentTitleEnglish: clean,
      time: Math.max(1, Math.round(secs / 60)),
      date: new Date().toISOString(),
      private: false, tags: [],
      description: finalTitle,
      sessions: [{ id: sessionId, secs, date: new Date().toISOString() }],
      channelId,
      mediaId: mediaData?.channelId || channelId || "web-video",
      mediaData,
    } as any);
  }
  await videoQueueStorage.setValue([...queue]);
  try { browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: queue.length }); } catch { }
}

async function finalizeSession(secs: number, url: string, sessionId: string) {
  if (secs < 1) return;
  const clean = cleanUrl(url);
  await addDebugLog('INFO', 'VideoTracker', `Finalizing session metrics`, { secs, url: clean, sessionId });

  const queue = await videoQueueStorage.getValue();
  const idx = queue.findIndex(q => q.contentTitleEnglish === clean);
  if (idx === -1) return;

  const item = queue[idx] as any;
  item.sessions = item.sessions || [];

  const sIdx = item.sessions.findIndex((s: any) => s.id === sessionId);
  if (sIdx >= 0) {
    item.sessions[sIdx].secs = secs;
  } else {
    item.sessions.push({ id: sessionId, secs, date: new Date().toISOString() });
  }

  item.time = Math.max(1, Math.round(item.sessions.reduce((a: number, s: any) => a + s.secs, 0) / 60));
  delete item._currentSecs;

  await videoQueueStorage.setValue([...queue]);
  try { browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: queue.length }); } catch { }
}

async function removeFromQueue(url: string) {
  const clean = cleanUrl(url);
  const queue = await videoQueueStorage.getValue();
  const next = queue.filter(q => q.contentTitleEnglish !== clean);
  if (next.length !== queue.length) {
    await videoQueueStorage.setValue(next);
    try { browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: next.length }); } catch { }
  }
}

let watchedSecs = 0, completedSessionSecs = 0, lastSyncSecs = 0, lastAutoCheckSecs = 0, _lastCounterPaint = 0;
let cachedConfig: any = {};
let playClockStart = -1;

function flushPlayClock(discard = false) {
  if (playClockStart < 0) return;
  const elapsed = (performance.now() - playClockStart) / 1000;
  playClockStart = -1;
  if (!discard && elapsed > 0 && elapsed < 7200) {
    watchedSecs += elapsed;
  }
}

const getLiveWatched = () => watchedSecs + (playClockStart >= 0 ? (performance.now() - playClockStart) / 1000 : 0);
const getTotal = () => completedSessionSecs + getLiveWatched();

function getTimestampContainer(vid: HTMLVideoElement): { el: HTMLElement; isFallback: boolean } | null {
  const host = window.location.hostname;
  if (host.includes('youtube.com')) {
    const el = document.querySelector('.ytp-left-controls') as HTMLElement;
    if (el) return { el, isFallback: false };
  }
  if (host.includes('crunchyroll.com')) {
    const el = document.querySelector('.vmp-controls__left') || document.querySelector('.velocity-controls');
    if (el) return { el: el as HTMLElement, isFallback: false };
  }
  if (host.includes('animekai')) {
    const el = document.querySelector('.plyr__controls__item.plyr__time--current') || document.querySelector('.jw-controlbar-left-group');
    if (el) return { el: el as HTMLElement, isFallback: false };
  }
  const fallback = document.querySelector('.video-player-container') || document.querySelector('#movie_player') || document.querySelector('.plyr__video-wrapper') || document.querySelector('.jw-media') || vid.parentElement;
  if (fallback) return { el: fallback as HTMLElement, isFallback: true };
  return null;
}

function ensureCounter(currentSecs: number, totalSecs: number, title: string, url: string, channelId: string | null, state: { hasTriggered: boolean; isManualLogging: boolean }, vid: HTMLVideoElement, cfg: any, cachedChannelName: string, onReset: () => void) {
  let el = document.getElementById('nt-status-badge') as HTMLElement | null;

  // Fast path: if badge exists and we painted less than 500ms ago, update only dynamic texts
  const now = performance.now();
  if (el && now - _lastCounterPaint < 500) {
    const timeLabel = el.querySelector<HTMLElement>('.nt-time-label');
    if (timeLabel) {
      const multiSession = totalSecs > currentSecs + 2;
      const showTotal = cfg.showTotalInBadge ?? true;
      const currentStr = fmtSecs(currentSecs);
      timeLabel.textContent = (multiSession && showTotal) ? `${currentStr} / ${fmtSecs(totalSecs)}` : currentStr;
    }
    return;
  }

  resolvePageLanguageAndType();
  const shouldHide = shouldHideBadge(cfg, isJapaneseVideoCached, isMusicVideoCached) || isAdPlaying();
  if (shouldHide) { el?.remove(); return; }

  const multiSession = totalSecs > currentSecs + 2;
  const showTotal: boolean = cfg.showTotalInBadge ?? true;

  if (!el) {
    const containerData = getTimestampContainer(vid);
    if (!containerData) return;
    el = document.createElement('div');
    el.id = 'nt-status-badge';
    el.style.position = 'relative';
    el.style.cursor = 'pointer';

    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.height = '100%';
    el.style.padding = '0 6px';

    if (containerData.isFallback) el.classList.add('nt-absolute-pill');

    el.innerHTML = `<div class="nt-pill-visual-wrapper" style="display:flex; align-items:center; gap:6px; filter:none !important; box-shadow:none !important;">
    <div class="nt-badge-logo" style="width:18px; height:18px; flex-shrink:0; pointer-events:none; display:flex; align-items:center; justify-content:center; filter:none !important; box-shadow:none !important;">
    ${inlineLogo}
    </div>
    <span class="nt-time-label">0:00</span>
    </div>`;

    el.onclick = async (e) => {
      if ((e.target as HTMLElement).closest('#nt-modal-popup')) return;
      const existingPopup = document.getElementById('nt-modal-popup');
      if (existingPopup) {
        const closer = (existingPopup as any).__ntCloseModal as ((submitted: boolean) => void) | undefined;
        if (typeof closer === 'function') closer(false);
        else existingPopup.remove();
        return;
      }
      if (state.isManualLogging) return;
      state.isManualLogging = true;

      const liveCfg = await configStorage.getValue() as any;
      const liveShowTotal = liveCfg.showTotalInBadge ?? true;
      const channelName = cachedChannelName || await getChannelNameFallback();

      let finalTitle = stripVideoTitle(document.title);

      if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
        const data = await fetchYouTubeVideoData(window.location.href);
        if (data?.video?.title) {
          finalTitle = data.video.title.contentTitleNative || data.video.title.contentTitleEnglish || finalTitle;
        }
      }

      addDebugLog('INFO', 'VideoTracker', `Opening Manual Log Overlay`, {
        videoTitle: finalTitle,
        currentSecs,
        totalSecs
      });

      showNTEditModal(el!, cachedConfig.theme, {
        channelName,
        videoTitle: finalTitle,
        url,
        totalSecs,
        videoDurationSecs: vid.duration && !isNaN(vid.duration) && vid.duration > 0 ? vid.duration : totalSecs,
        showTotal: liveShowTotal,
        channelId,
        onToggleShowTotal: async (v) => { const c = await configStorage.getValue() as any; await configStorage.setValue({ ...c, showTotalInBadge: v }); }
      }, async final => {
        try {
          state.hasTriggered = true;
          const mediaData = await getChannelMediaData(channelId, final.title);
          const ok = await submitLog({ type: "video", mediaId: mediaData.channelId || channelId || "web-video", description: final.desc, mediaData, episodes: 0, time: Math.floor(final.time), pages: 0, date: final.date || new Date().toISOString(), unknownDate: false });
          if (ok) {
            if (final.clearSessions) { await removeFromQueue(url); onReset(); } else state.hasTriggered = false;
          } else state.hasTriggered = false;
        } catch (err) { state.hasTriggered = false; }
      }, (submitted) => { state.isManualLogging = false; if (!submitted) state.hasTriggered = false; });
    };
    containerData.el.appendChild(el);
  }

  _lastCounterPaint = now;

  const timeLabel = el.querySelector<HTMLElement>('.nt-time-label')!;
  const currentStr = fmtSecs(currentSecs);
  timeLabel.textContent = (multiSession && showTotal) ? `${currentStr} / ${fmtSecs(totalSecs)}` : currentStr;
  el.title = 'Log this video manually';
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*', '*://music.youtube.com/*', '*://*.crunchyroll.com/*', '*://*.animekai.to/*'],
  cssInjectionMode: 'manifest',
  async main() {
    cachedConfig = await configStorage.getValue() || {};

    const applyCachedTheme = (c: any) => {
      const theme = c.theme ?? 'nihongo';
      const font = c.font ?? 'sans';
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
      applyThemeToDocument(theme, font, customColors);
      const activeTheme = getTheme(theme);
      injectModalStyles(activeTheme);
    };

    applyCachedTheme(cachedConfig);

    let currentSessionId = crypto.randomUUID();
    const state = { hasTriggered: false, isManualLogging: false };
    let trackedVideo: HTMLVideoElement | null = null;
    let currentUrl = '', channelId: string | null = null, cachedChannelName = '';

    const resetSession = () => {
      flushPlayClock();
      watchedSecs = 0; completedSessionSecs = 0; lastSyncSecs = 0; lastAutoCheckSecs = 0;
      currentSessionId = crypto.randomUUID(); state.hasTriggered = false; state.isManualLogging = false;
      playClockStart = (trackedVideo && !trackedVideo.paused && !trackedVideo.ended && trackedVideo.readyState > 2 && !isAdPlaying()) ? performance.now() : -1;
      const badgeLabel = document.querySelector('#nt-status-badge .nt-time-label');
      if (badgeLabel) badgeLabel.textContent = "0:00";
    };

    const attach = (vid: HTMLVideoElement) => {
      const cleanedHref = cleanUrl(window.location.href);

      if (currentUrl === cleanedHref && trackedVideo === vid) {
        return;
      }

      addDebugLog('INFO', 'VideoTracker', `New Video Context Detected`, { url: cleanedHref });

      document.getElementById('nt-playlist-modal')?.remove();
      document.getElementById('nt-modal-popup')?.remove();

      flushPlayClock();
      if (trackedVideo && watchedSecs >= 60 && currentUrl && !state.hasTriggered) {
        finalizeSession(watchedSecs, currentUrl, currentSessionId);
      }

      trackedVideo = vid; currentUrl = cleanedHref; watchedSecs = 0; playClockStart = -1;
      lastSyncSecs = 0; lastAutoCheckSecs = 0; state.hasTriggered = false; state.isManualLogging = false;
      channelId = null; cachedChannelName = ''; completedSessionSecs = 0;
      currentSessionId = crypto.randomUUID(); metadataResolved = false; _lastCounterPaint = 0;
      document.getElementById('nt-status-badge')?.remove();

      const tryChannel = async () => {
        const foundId = await getYouTubeChannelId();
        const foundName = await getChannelNameFallback();

        if (foundId && foundId !== channelId) {
          channelId = foundId;
          addDebugLog('INFO', 'VideoTracker', `Channel ID Discovered`, { channelId: foundId });
        }

        if (foundName && foundName !== cachedChannelName) {
          cachedChannelName = foundName;
          addDebugLog('INFO', 'VideoTracker', `Channel Name Discovered`, { channelName: foundName });
        }
      };

      tryChannel();
      let pollCount = 0;
      const poll = setInterval(async () => {
        await tryChannel();
        if ((channelId && cachedChannelName) || pollCount++ > 20) clearInterval(poll);
      }, 500);

      (async () => {
        const queue = await videoQueueStorage.getValue();
        const existing = queue.find(q => q.contentTitleEnglish === currentUrl) as any;
        if (existing) completedSessionSecs = (existing.sessions || []).reduce((a: number, s: any) => a + s.secs, 0);
      })();

      // Prevent duplicate event handlers on recycled <video> nodes
      if (boundVideos.has(vid)) {
        if (!vid.paused && !vid.ended && vid.readyState > 2 && !isAdPlaying()) {
          playClockStart = performance.now();
        }
        return;
      }
      boundVideos.add(vid);

      if (!vid.paused && !vid.ended && vid.readyState > 2 && !isAdPlaying()) {
        playClockStart = performance.now();
      }

      vid.addEventListener('playing', () => {
        if (isAdPlaying()) return;
        playClockStart = performance.now();
      });

      vid.addEventListener('play', () => {
        if (isAdPlaying()) return;
        playClockStart = performance.now();
        if (vid.currentTime < 5) state.hasTriggered = false;
      });

      const stopClock = () => { flushPlayClock(); };
      vid.addEventListener('pause', stopClock);
      vid.addEventListener('waiting', stopClock);
      vid.addEventListener('seeking', stopClock);

      vid.addEventListener('seeked', () => {
        if (vid.currentTime < 5) state.hasTriggered = false;
        if (!vid.paused && !vid.ended && !isAdPlaying()) {
          playClockStart = performance.now();
        }
      });

      vid.addEventListener('timeupdate', async () => {
        if (isAdPlaying()) {
          flushPlayClock(true);
          document.getElementById('nt-status-badge')?.remove();
          return;
        }

        if (playClockStart < 0 && !vid.paused && !vid.ended && vid.readyState > 2) {
          playClockStart = performance.now();
        }

        const cfg = cachedConfig;
        if (!state.hasTriggered) {
          ensureCounter(getLiveWatched(), getTotal(), document.title, currentUrl, channelId, state, vid, cfg, cachedChannelName, resetSession);
        }
        if (state.hasTriggered || vid.duration <= 0 || state.isManualLogging) return;

        const autoOn = cfg.autoSend ?? (cfg.logMode === 'auto');
        const liveSecs = getLiveWatched();

        if (!autoOn && reachedQueueThreshold(cfg, liveSecs, vid) && (liveSecs - lastSyncSecs) >= 10) {
          lastSyncSecs = liveSecs;
          resolvePageLanguageAndType();
          if (isJapaneseVideoCached && !isMusicVideoCached) {
            const chName = cachedChannelName || await getChannelNameFallback();
            await upsertQueueLive(liveSecs, document.title, chName, currentUrl, channelId, currentSessionId);
          }
        }

        if (autoOn && (liveSecs - lastAutoCheckSecs) >= 5) {
          lastAutoCheckSecs = liveSecs;
          resolvePageLanguageAndType();
          if (isJapaneseVideoCached && !isMusicVideoCached) {
            const threshType = cfg.thresholdType ?? 'percent';
            const threshValue = cfg.thresholdValue ?? cfg.threshold ?? 95;
            const triggered = threshType === 'percent' ? (vid.currentTime / vid.duration) * 100 >= threshValue : (liveSecs / 60) >= threshValue;
            if (triggered) {
              state.hasTriggered = true;
              const sessionMins = Math.max(1, Math.round(liveSecs / 60));
              const chName = cachedChannelName || await getChannelNameFallback();
              const mediaData = await getChannelMediaData(channelId, chName);
              const finalTitle = stripVideoTitle(document.title);

              const ok = await submitLog({
                type: 'video', mediaId: mediaData.channelId || channelId || "web-video",
                description: finalTitle, mediaData, time: sessionMins, date: new Date().toISOString(),
                private: false, episodes: 0, pages: 0, unknownDate: false
              });

              if (ok) { removeFromQueue(currentUrl); resetSession(); } else state.hasTriggered = false;
            }
          }
        }
      });

      vid.addEventListener('ended', async () => {
        if (isAdPlaying()) return;
        flushPlayClock();
        if (state.hasTriggered) return;
        const cfg = cachedConfig;
        const autoOn = cfg.autoSend ?? (cfg.logMode === 'auto');
        resolvePageLanguageAndType();
        if (!autoOn && isJapaneseVideoCached && !isMusicVideoCached && reachedQueueThreshold(cfg, watchedSecs, vid)) {
          await finalizeSession(watchedSecs, currentUrl, currentSessionId);
          completedSessionSecs += watchedSecs; watchedSecs = 0; currentSessionId = crypto.randomUUID();
        }
      });

      vid.addEventListener('emptied', async () => {
        flushPlayClock();
        const urlNow = cleanUrl(window.location.href);
        if (urlNow !== currentUrl) {
          resolvePageLanguageAndType();
          if (!state.hasTriggered && watchedSecs >= 1 && isJapaneseVideoCached && !isMusicVideoCached) {
            await finalizeSession(watchedSecs, currentUrl, currentSessionId);
          }
          watchedSecs = 0; lastSyncSecs = 0; lastAutoCheckSecs = 0; state.hasTriggered = false;
          document.getElementById('nt-status-badge')?.remove();
        }
      });
    };

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['config']) {
        configStorage.getValue().then((c: any) => {
          if (c) {
            cachedConfig = c;
            applyCachedTheme(c);

            const badge = document.getElementById('nt-status-badge');
            if (badge) {
              resolvePageLanguageAndType();
              const shouldHide = shouldHideBadge(c, isJapaneseVideoCached, isMusicVideoCached) || isAdPlaying();
              if (shouldHide) {
                badge.remove();
              } else {
                _lastCounterPaint = 0;
                ensureCounter(getLiveWatched(), getTotal(), document.title, currentUrl, channelId, state, trackedVideo!, c, cachedChannelName, resetSession);
              }
            }

            // Handles live user config adjustments safely
            if (c.enablePlaylistLogger === false) {
              document.querySelectorAll('.nt-playlist-logger').forEach(el => el.remove());
            } else {
              runPlaylistInjection();
            }
          }
        });
      }
      if (area === 'local' && changes['videoQueue']) {
        const queue = Array.isArray(changes['videoQueue'].newValue) ? changes['videoQueue'].newValue : [];
        const clean = cleanUrl(window.location.href);
        if (!queue.some((q: any) => q.contentTitleEnglish === clean)) {
          completedSessionSecs = 0; watchedSecs = 0; lastSyncSecs = 0; lastAutoCheckSecs = 0; state.hasTriggered = false;
          playClockStart = (trackedVideo && !trackedVideo.paused && !trackedVideo.ended && trackedVideo.readyState > 2 && !isAdPlaying()) ? performance.now() : -1;
          const badgeLabel = document.querySelector('#nt-status-badge .nt-time-label');
          if (badgeLabel) badgeLabel.textContent = "0:00";
        }
      }
    });

    let pageObserver: MutationObserver | null = null;
    let pageObserverTimeout: number | null = null;

    /**
     * Resolves the target playlist header or action button containers strictly within the active visible contexts.
     */
    function getActivePlaylistContainers(): HTMLElement[] {
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

    /**
     * Checks and injects the playlist logger button into the active visible containers.
     */
    function runPlaylistInjection(): boolean {
      if (!cachedConfig || cachedConfig.enablePlaylistLogger === false) {
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
          btn.innerHTML = `<svg style="filter:none !important; box-shadow:none !important;" width="24" height="24" viewBox="0 0 24 24" fill="var(--nt-accent, #F5B831)"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM10 5.5v9l6-4.5-6-4.5z"/></svg>`;

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

    /**
     * Helper to run basic video element check
     */
    function runVideoInjection() {
      const vid = document.querySelector<HTMLVideoElement>('video');
      if (vid) {
        try {
          attach(vid);
        } catch (err) {
          // Silent catch
        }
      }
    }

    /**
     * Starts a short-lived MutationObserver on navigation to handle lazy-loaded elements.
     * The observer runs for up to 10 seconds and then disconnects completely to ensure 0% idle CPU overhead.
     */
    const startTargetedObserver = () => {
      if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
      }
      if (pageObserverTimeout) {
        clearTimeout(pageObserverTimeout);
        pageObserverTimeout = null;
      }

      const currentUrl = window.location.href;

      // Immediate injection attempts
      runVideoInjection();
      runPlaylistInjection();

      const target = document.querySelector('ytd-page-manager') || document.body;
      let rafPending = false;

      pageObserver = new MutationObserver((mutations) => {
        if (window.location.href !== currentUrl) {
          return;
        }

        let isRelevant = false;
        for (let i = 0; i < mutations.length; i++) {
          const added = mutations[i].addedNodes;
          for (let j = 0; j < added.length; j++) {
            const node = added[j];
            if (node instanceof HTMLElement) {
              const tag = node.tagName.toLowerCase();
              if (
                tag.includes('renderer') ||
                tag.includes('action') ||
                tag.includes('header') ||
                node.id === 'playlist-action-menu' ||
                node.id === 'top-level-buttons-computed' ||
                node.querySelector('ytd-menu-renderer, .metadata-buttons-wrapper')
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

    window.addEventListener('play', (e) => {
      const target = e.target as HTMLVideoElement;
      if (target && target.tagName === 'VIDEO') {
        attach(target);
      }
    }, true);

    // Initial load execution
    startTargetedObserver();

    window.addEventListener('yt-navigate-finish', startTargetedObserver);

    window.addEventListener('yt-navigate-start', () => {
      clearExtractionCaches();
      document.getElementById('nt-playlist-modal')?.remove();
      document.getElementById('nt-modal-popup')?.remove();
    });
  },
});