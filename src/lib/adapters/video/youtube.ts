import type { TrackerConfig, VideoSiteAdapter } from '@/lib/types';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { cleanUrl } from '@/lib/utils/url';
import {
  getSpokenLanguage,
  isForeignSubtitledContent,
  isJapaneseContent,
  isMusicContent,
  type VideoFacts,
} from '@/lib/utils/youtube-classification';
import { getChannelNameFallback, getVerifiedWatchRoot, getYouTubeChannelId } from '@/lib/utils/youtube-extraction';
import {
  getPlayerSnapshot,
  getYouTubeVideoId,
  type YouTubePlayerSnapshot,
} from '@/lib/utils/youtube-player-response';

const MUSIC_HOST = 'music.youtube.com';
const MUSIC_CATEGORY = 'Music';

function factsFromSnapshot(snapshot: YouTubePlayerSnapshot): VideoFacts {
  return {
    title: snapshot.title,
    author: snapshot.author,
    description: snapshot.description,
    keywords: snapshot.keywords,
    category: snapshot.category,
    isLiveNow: snapshot.isLiveNow,
    spokenLanguage: getSpokenLanguage(snapshot),
    songs: snapshot.songs,
    uploadedCaptionLanguages: snapshot.captionTracks
      .filter((track) => track.kind !== 'asr')
      .map((track) => track.languageCode),
  };
}

/**
 * Fallback for when the player snapshot is unavailable. Returns null while the
 * page still renders the previous video, so callers report "unknown" instead of
 * judging the new video by the old one's metadata.
 */
function factsFromDom(videoId: string | null): VideoFacts | null {
  const root = getVerifiedWatchRoot(videoId);
  if (!root && videoId && document.querySelector('ytd-watch-flexy')) return null;

  const text = (selector: string) => root?.querySelector(selector)?.textContent?.trim() ?? '';

  // Server-rendered microdata describes the first video loaded in this tab only.
  const microdataId = document.querySelector('meta[itemprop="identifier"]')?.getAttribute('content');
  const microdataGenre = videoId && microdataId === videoId
    ? document.querySelector('meta[itemprop="genre"]')?.getAttribute('content') ?? ''
    : '';
  const category = root?.querySelector('ytd-music-watch-metadata-renderer') ? MUSIC_CATEGORY : microdataGenre;

  return {
    title: text('#title h1 yt-formatted-string, h1.ytd-watch-metadata') || stripVideoTitle(document.title),
    author: text('#owner ytd-channel-name yt-formatted-string, #owner ytd-channel-name a'),
    description: text(
      '#description-inline-expander yt-attributed-string, ytd-expandable-video-description-body-renderer',
    ).slice(0, 1500),
    keywords: '',
    category,
    isLiveNow: !!document.querySelector('#movie_player .ytp-live'),
    spokenLanguage: 'unknown',
    songs: Array.from(
      root?.querySelectorAll('ytd-horizontal-card-list-renderer .ytVideoAttributeViewModelTitle') ?? [],
      (el) => el.textContent?.trim() ?? '',
    ).filter(Boolean),
    uploadedCaptionLanguages: [],
  };
}

function getVideoFacts(): VideoFacts | null {
  const videoId = getYouTubeVideoId();
  const snapshot = getPlayerSnapshot(videoId);
  return snapshot ? factsFromSnapshot(snapshot) : factsFromDom(videoId);
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export const youtubeAdapter: VideoSiteAdapter = {
  name: 'YouTube',
  matchPatterns: [
    '*://*.youtube.com/*',
    '*://music.youtube.com/*',
  ],

  isEnabled(_config: TrackerConfig): boolean {
    return true;
  },

  getChannelId: getYouTubeChannelId,
  getChannelName: getChannelNameFallback,

  isMusic(): boolean {
    const host = window.location.hostname;
    if (host === MUSIC_HOST) return true;
    if (!host.includes('youtube.com')) return false;

    const facts = getVideoFacts();
    return !!facts && isMusicContent(facts);
  },

  isLikelyJapanese(): boolean {
    if (!window.location.hostname.includes('youtube.com')) return false;

    const facts = getVideoFacts();
    return !!facts && isJapaneseContent(facts);
  },

  isForeignSubtitled(): boolean {
    if (!window.location.hostname.includes('youtube.com')) return false;

    const facts = getVideoFacts();
    return !!facts && isForeignSubtitledContent(facts);
  },

  isLive(): boolean {
    return getVideoFacts()?.isLiveNow ?? false;
  },

  getVideoTitle(): string {
    return getPlayerSnapshot()?.title ?? '';
  },

  getTrackingUrl(vid: HTMLVideoElement): string | null {
    // YouTube Music keeps playing while its URL moves between pages; it is keyed as before.
    if (window.location.hostname === MUSIC_HOST) return cleanUrl(window.location.href);

    // Hover previews play in their own player; only the main one is "the video".
    const mainPlayer = document.getElementById('movie_player');
    if (mainPlayer && !mainPlayer.contains(vid)) return null;

    if (window.location.pathname.startsWith('/shorts/')) return null;

    const videoId = getYouTubeVideoId();
    if (videoId) return watchUrl(videoId);

    // Miniplayer: the main player keeps playing after leaving the watch page.
    if (mainPlayer?.closest('ytd-miniplayer')) {
      const playing = getPlayerSnapshot(null);
      if (playing) return watchUrl(playing.videoId);
    }
    return null;
  },

  getTimestampContainer(vid: HTMLVideoElement): HTMLElement | null {
    const host = window.location.hostname;
    if (host.includes('youtube.com')) {
      const el = document.querySelector('.ytp-left-controls') as HTMLElement;
      if (el) return el;
    }
    const fallback = document.querySelector('.video-player-container') || document.querySelector('#movie_player') || document.querySelector('.plyr__video-wrapper') || document.querySelector('.jw-media') || vid.parentElement;
    if (fallback) return fallback as HTMLElement;
    return null;
  },

  isAdPlaying(doc: Document): boolean {
    const host = window.location.hostname;
    if (host.includes('youtube.com')) {
      return !!doc.querySelector(
        '.ad-showing, .ad-interrupting, .html5-video-player.ad-showing, .html5-video-player.ad-interrupting'
      );
    }
    return false;
  },

  getPlaylistContainers(doc: Document): HTMLElement[] {
    const classicSel = 'ytd-playlist-header-renderer .metadata-buttons-wrapper';
    const modernHeaderSel = 'yt-page-header-renderer yt-flexible-actions-view-model, yt-page-header-view-model yt-flexible-actions-view-model, yt-page-header-renderer ytd-menu-renderer, ytd-playlist-header-renderer ytd-menu-renderer';
    const panelSel = 'ytd-playlist-panel-renderer #playlist-action-menu #top-level-buttons-computed';

    const containers: HTMLElement[] = [];
    const selectors = `${classicSel}, ${modernHeaderSel}, ${panelSel}`;
    const matches = doc.querySelectorAll(selectors);

    for (let i = 0; i < matches.length; i++) {
      const el = matches[i];
      if (el instanceof HTMLElement) {
        if (el.offsetWidth > 0 || el.offsetHeight > 0) {
          containers.push(el);
        }
      }
    }
    return containers;
  },

  injectPlaylistButton(container: HTMLElement, btn: HTMLButtonElement): void {
    const overflowNode = container.querySelector('yt-button-view-model:last-child, ytd-menu-renderer:last-child, button:last-child, [class*="button"]:last-child');
    if (overflowNode && overflowNode.parentElement === container) {
      container.insertBefore(btn, overflowNode);
    } else {
      container.appendChild(btn);
    }
  }
};
