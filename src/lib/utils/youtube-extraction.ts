/**
 * ── YouTube Data Extraction & Unification Utilities ──────────────────────────
 */
import { resolveVideoChannelMedia } from '@/lib/api/nihongotracker';

const activeHandleFetches = new Map<string, Promise<string | null>>();
const fetchCache = new Map<string, any>();

/**
 * Fetch video metadata from a YouTube watch page.
 * Scrapes ytInitialPlayerResponse JSON embedded in page HTML to extract details.
 */
export async function fetchYouTubeVideoData(url: string): Promise<{
    video: { episodeDuration: number; title?: { contentTitleNative?: string; contentTitleEnglish?: string } };
    channel: {
        contentId?: string;
        title?: { contentTitleNative?: string; contentTitleEnglish?: string };
        contentImage?: string;
        description?: Array<{ description?: string }>;
    };
} | null> {
    if (fetchCache.has(url)) {
        return fetchCache.get(url);
    }

    try {
        const res = await fetch(url);
        if (!res.ok) return null;

        const html = await res.text();
        const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
        if (!match) return null;

        const data = JSON.parse(match[1]);

        const videoDetails = data.videoDetails || {};
        const durationSecs = parseInt(videoDetails.lengthSeconds, 10) || 0;
        const channelId = videoDetails.channelId || '';
        const channelTitle = videoDetails.author || '';
        const videoTitle = videoDetails.title || '';

        /* Extract channel thumbnail from microformat */
        const microformat = data.microformat?.playerMicroformatRenderer || {};
        const channelImage =
            data.endscreen?.endscreenRenderer?.elements?.[0]?.endscreenElementRenderer?.image
                ?.thumbnails?.[0]?.url || '';
        const channelDesc = microformat.description?.simpleText || '';

        const parsedResult = {
            video: {
                episodeDuration: Math.max(1, Math.round(durationSecs / 60)),
                title: {
                    contentTitleNative: videoTitle || undefined,
                    contentTitleEnglish: videoTitle || undefined,
                }
            },
            channel: {
                contentId: channelId || undefined,
                title: {
                    contentTitleNative: channelTitle || undefined,
                    contentTitleEnglish: channelTitle || undefined,
                },
                contentImage: channelImage || undefined,
                description: channelDesc ? [{ description: channelDesc }] : undefined,
            },
        };

        fetchCache.set(url, parsedResult);
        return parsedResult;
    } catch {
        return null;
    }
}

/**
 * Extract YouTube channel ID from current page DOM.
 */
export async function getYouTubeChannelId(): Promise<string | null> {
    const channelLink = document.querySelector<HTMLAnchorElement>(
        'ytd-video-owner-renderer a, #upload-info a, #owner a[href*="/channel/"], #owner a[href*="/@"]',
    );

    if (channelLink) {
        const href = channelLink.getAttribute('href') || '';
        const idMatch = href.match(/\/channel\/([^/?]+)/);
        if (idMatch) return idMatch[1];

        /* Handle @handle format — resolve and cache persistently */
        const handleMatch = href.match(/\/@([^/?]+)/);
        if (handleMatch) {
            const handle = handleMatch[1];

            const storageData = await browser.storage.local.get('handleCache');
            const handleCacheObj = (storageData.handleCache || {}) as Record<string, string>;
            if (handleCacheObj[handle]) {
                return handleCacheObj[handle];
            }

            if (activeHandleFetches.has(handle)) {
                return activeHandleFetches.get(handle) ?? null;
            }

            const fetchPromise = (async () => {
                try {
                    const res = await fetch(`https://www.youtube.com/${href}`, { redirect: 'follow' });
                    const text = await res.text();
                    const cidMatch = text.match(/"channelId":"([^"]+)"/);
                    if (cidMatch) {
                        const channelId = cidMatch[1];
                        const freshCache = ((await browser.storage.local.get('handleCache')).handleCache || {}) as Record<string, string>;
                        freshCache[handle] = channelId;
                        await browser.storage.local.set({ handleCache: freshCache });
                        return channelId;
                    }
                } catch {
                    /* Resolution failed */
                } finally {
                    activeHandleFetches.delete(handle);
                }
                return null;
            })();

            activeHandleFetches.set(handle, fetchPromise);
            return fetchPromise;
        }
    }

    try {
        const playerResponse = (window as any).ytInitialPlayerResponse;
        if (playerResponse?.videoDetails?.channelId) {
            return playerResponse.videoDetails.channelId;
        }
    } catch {
        /* Not available */
    }

    return null;
}

/**
 * Get YouTube channel name from page DOM.
 */
export async function getChannelNameFallback(): Promise<string> {
    const channelNameEl = document.querySelector<HTMLElement>(
        '#owner ytd-channel-name yt-formatted-string a, ytd-channel-name a, #upload-info #channel-name a',
    );
    if (channelNameEl?.textContent?.trim()) return channelNameEl.textContent.trim();

    const artistEl = document.querySelector<HTMLElement>(
        '.ytd-video-primary-info-renderer .ytd-metadata-row-renderer a',
    );
    if (artistEl?.textContent?.trim()) return artistEl.textContent.trim();

    try {
        const playerResponse = (window as any).ytInitialPlayerResponse;
        if (playerResponse?.videoDetails?.author) return playerResponse.videoDetails.author;
    } catch {
        /* Not available */
    }

    return '';
}

/**
 * Resets memory-bound caching containers.
 */
export function clearExtractionCaches() {
    activeHandleFetches.clear();
    fetchCache.clear();
}

/**
 * Resolves full channel media records.
 */
export async function getChannelMediaData(channelId: string | null, channelTitle: string) {
    try {
        const media = await resolveVideoChannelMedia({
            channelId: channelId ?? undefined,
            channelTitle: channelTitle ?? undefined
        });
        return {
            channelId: media.channelId || channelId || "web-video",
            channelTitle: media.channelTitle || channelTitle,
            channelImage: media.channelImage || "",
            channelDescription: media.channelDescription || ""
        };
    } catch {
        return {
            channelId: channelId || "web-video",
            channelTitle: channelTitle,
            channelImage: "",
            channelDescription: ""
        };
    }
}