import type { TrackerConfig, VideoSiteAdapter } from '@/lib/types';
import { getYouTubeChannelId, getChannelNameFallback } from '@/lib/utils/youtube-extraction';
import { isLikelyJapanese, isMusic } from '@/lib/utils/japanese';

export const youtubeAdapter: VideoSiteAdapter = {
  name: 'YouTube',
  matchPatterns: [
    '*://*.youtube.com/*',
    '*://music.youtube.com/*',
    '*://*.crunchyroll.com/*',
    '*://*.animekai.to/*',
  ],

  isEnabled(_config: TrackerConfig): boolean {
    return true;
  },

  getChannelId: getYouTubeChannelId,
  getChannelName: getChannelNameFallback,
  isLikelyJapanese,
  isMusic,
};