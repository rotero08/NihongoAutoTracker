/**
 * ── YouTube Video Adapter ────────────────────────────────────────────────────
 * Implements VideoSiteAdapter for YouTube and YouTube Music.
 */
import type { TrackerConfig } from '../../types';
import type { VideoSiteAdapter } from './types';
import { getYouTubeChannelId, getChannelNameFallback } from '../../api/youtube';
import { isLikelyJapanese, isMusic } from '../../utils/japanese';

export const youtubeAdapter: VideoSiteAdapter = {
  name: 'YouTube',
  matchPatterns: [
    '*://*.youtube.com/*',
    '*://music.youtube.com/*',
    '*://*.crunchyroll.com/*',
    '*://*.animekai.to/*',
  ],

  isEnabled(_config: TrackerConfig): boolean {
    /* YouTube tracking is always enabled when the content script loads */
    return true;
  },

  getChannelId: getYouTubeChannelId,
  getChannelName: getChannelNameFallback,
  isLikelyJapanese,
  isMusic,
};
