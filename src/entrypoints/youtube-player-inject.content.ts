import { defineContentScript } from '#imports';
import {
  PLAYER_SNAPSHOT_ATTR,
  PLAYER_SNAPSHOT_DESCRIPTION_LIMIT,
  PLAYER_SNAPSHOT_KEYWORDS_LIMIT,
  PLAYER_SNAPSHOT_REQUEST_EVENT,
  PLAYER_SNAPSHOT_SONGS_LIMIT,
  type YouTubePlayerSnapshot,
} from '@/lib/utils/youtube-player-response';

export default defineContentScript({
  matches: [
    '*://*.youtube.com/*',
    '*://music.youtube.com/*',
  ],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    let lastPublished = '';

    /**
     * Songs YouTube credits the video with (the "Music" card of the description).
     * They live in the watch page's data rather than the player's, so that data
     * is only used when it is for the same video — after an SPA navigation it
     * briefly still describes the previous one.
     */
    function findCreditedSongs(videoId: string): string[] {
      const sources = [
        (document.querySelector('ytd-watch-flexy') as any)?.data,
        (window as any).ytInitialData,
      ];
      const pageData = sources.find((data) => data?.currentVideoEndpoint?.watchEndpoint?.videoId === videoId);
      const panels = Array.isArray(pageData?.engagementPanels) ? pageData.engagementPanels : [];

      const songs: string[] = [];
      for (const panel of panels) {
        const items = panel?.engagementPanelSectionListRenderer?.content?.structuredDescriptionContentRenderer?.items;
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          const cards = item?.horizontalCardListRenderer?.cards;
          if (!Array.isArray(cards)) continue;
          for (const card of cards) {
            // Chapters share this list renderer; only song credits use this card type.
            const title = card?.videoAttributeViewModel?.title;
            if (typeof title === 'string' && title) songs.push(title);
          }
        }
      }
      return songs.slice(0, PLAYER_SNAPSHOT_SONGS_LIMIT);
    }

    function buildSnapshot(response: any): YouTubePlayerSnapshot | null {
      const details = response?.videoDetails;
      if (!details?.videoId) return null;

      const microformat = response.microformat?.playerMicroformatRenderer ?? {};
      const tracklist = response.captions?.playerCaptionsTracklistRenderer ?? {};
      const captionTracks = Array.isArray(tracklist.captionTracks) ? tracklist.captionTracks : [];
      const audioTracks = Array.isArray(tracklist.audioTracks) ? tracklist.audioTracks : [];

      // Only multi-audio uploads carry an id here, shaped like "ja.4".
      const defaultAudioId = audioTracks[tracklist.defaultAudioTrackIndex ?? 0]?.audioTrackId;

      const videoId = String(details.videoId);
      const keywords = Array.isArray(details.keywords) ? details.keywords.join(' ') : '';

      return {
        videoId,
        title: String(details.title ?? ''),
        author: String(details.author ?? ''),
        channelId: String(details.channelId ?? ''),
        description: String(details.shortDescription ?? '').slice(0, PLAYER_SNAPSHOT_DESCRIPTION_LIMIT),
        keywords: keywords.slice(0, PLAYER_SNAPSHOT_KEYWORDS_LIMIT),
        songs: findCreditedSongs(videoId),
        category: String(microformat.category ?? ''),
        isLiveNow: details.isLive === true || microformat.liveBroadcastDetails?.isLiveNow === true,
        captionTracks: captionTracks.map((track: any) => ({
          languageCode: String(track?.languageCode ?? ''),
          kind: String(track?.kind ?? ''),
        })),
        defaultAudioLanguage: typeof defaultAudioId === 'string' ? defaultAudioId.split('.')[0] : '',
      };
    }

    function publishSnapshot() {
      try {
        const moviePlayer = document.getElementById('movie_player') as any;
        const response = moviePlayer?.getPlayerResponse?.() || (window as any).ytInitialPlayerResponse;
        const snapshot = buildSnapshot(response);
        if (!snapshot) return;

        const serialized = JSON.stringify(snapshot);
        const root = document.documentElement;
        // Skip the DOM write (and the attribute mutation it triggers) when nothing changed.
        if (serialized === lastPublished && root.getAttribute(PLAYER_SNAPSHOT_ATTR) === serialized) return;

        lastPublished = serialized;
        root.setAttribute(PLAYER_SNAPSHOT_ATTR, serialized);
      } catch (e) {
        console.error('[NAT] Failed to publish player snapshot:', e);
      }
    }

    // Republishing after navigation is only a warm-up: readers request a fresh
    // snapshot themselves whenever the published one is for another video.
    window.addEventListener('yt-navigate-finish', () => {
      setTimeout(publishSnapshot, 300);
      setTimeout(publishSnapshot, 1500);
    });
    window.addEventListener('yt-page-data-updated', publishSnapshot);

    // Support synchronous requests from isolated content scripts
    window.addEventListener(PLAYER_SNAPSHOT_REQUEST_EVENT, publishSnapshot);

    // Initial bootstrap call
    setTimeout(publishSnapshot, 800);
  }
});
