import type { VideoSiteAdapter } from '@/lib/types';
import { youtubeAdapter } from './youtube';

export const VIDEO_ADAPTERS: VideoSiteAdapter[] = [
    youtubeAdapter
];

export function getActiveVideoAdapter(): VideoSiteAdapter | null {
    const currentHostname = window.location.hostname;
    return VIDEO_ADAPTERS.find(adapter =>
        adapter.matchPatterns.some(pattern => {
            const cleanPattern = pattern.replace(/\*/g, '');
            return currentHostname.includes(cleanPattern) || window.location.href.includes(cleanPattern);
        })
    ) || null;
}