import type { VideoSiteAdapter } from '@/lib/types';
import { youtubeAdapter } from './youtube';

export const VIDEO_ADAPTERS: VideoSiteAdapter[] = [
    youtubeAdapter
];

export function getActiveVideoAdapter(): VideoSiteAdapter | null {
    const currentHostname = window.location.hostname;
    return VIDEO_ADAPTERS.find(adapter =>
        adapter.matchPatterns.some(pattern => {
            // Remove protocol, wildcards, and trailing path to extract domain
            const clean = pattern
                .replace(/\*/g, '')
                .replace('://', '')
                .split('/')[0]; // e.g., ".youtube.com" 
            return currentHostname.includes(clean) || clean.includes(currentHostname);
        })
    ) || null;
}
