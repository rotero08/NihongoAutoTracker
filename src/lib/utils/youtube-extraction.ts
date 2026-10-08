/**
 * ── YouTube Data Extraction & Unification Utilities ──────────────────────────
 */
import { resolveVideoChannelMedia } from '@/lib/api/nihongotracker';
import type { VideoMediaData } from '@/lib/types';
import { getPlayerSnapshot, getYouTubeVideoId } from '@/lib/utils/youtube-player-response';

/** Placeholder media id used until a real channel id is known. */
export const WEB_VIDEO_ID = 'web-video';

/** First candidate that is a real channel id, or the `web-video` placeholder. */
export function pickChannelId(...candidates: Array<string | null | undefined>): string {
    return candidates.find((id) => !!id && id !== WEB_VIDEO_ID) || WEB_VIDEO_ID;
}

type YouTubeVideoData = {
    video: { videoId?: string; episodeDuration: number; title?: { contentTitleNative?: string; contentTitleEnglish?: string } };
    channel: {
        contentId?: string;
        title?: { contentTitleNative?: string; contentTitleEnglish?: string };
        contentImage?: string;
        description?: Array<{ description?: string }>;
    };
};

const activeHandleFetches = new Map<string, Promise<string | null>>();

/**
 * Per-URL results, including failures and requests still in flight. The watch
 * page is over a megabyte of HTML, so it must never be downloaded twice for the
 * same video — not by concurrent callers, and not by the channel poll retrying.
 */
const videoDataRequests = new Map<string, Promise<YouTubeVideoData | null>>();

/** Channel metadata never changes mid-session; resolving it costs several API calls. */
const CHANNEL_MEDIA_CACHE_LIMIT = 50;
const channelMediaRequests = new Map<string, Promise<Required<VideoMediaData>>>();

/**
 * Fetch video metadata from a YouTube watch page.
 * Scrapes ytInitialPlayerResponse JSON embedded in page HTML to extract details.
 */
export function fetchYouTubeVideoData(url: string): Promise<YouTubeVideoData | null> {
    let request = videoDataRequests.get(url);
    if (!request) {
        request = downloadYouTubeVideoData(url);
        videoDataRequests.set(url, request);
    }
    return request;
}

async function downloadYouTubeVideoData(url: string): Promise<YouTubeVideoData | null> {
    try {
        const requestedVideoId = getYouTubeVideoId(url);
        const res = await fetch(url);
        if (!res.ok) return null;

        const html = await res.text();
        const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
        if (!match) return null;

        const data = JSON.parse(match[1]);

        const videoDetails = data.videoDetails || {};
        const responseVideoId = videoDetails.videoId || '';
        if (requestedVideoId && responseVideoId && requestedVideoId !== responseVideoId) {
            return null;
        }
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

        return {
            video: {
                videoId: responseVideoId || requestedVideoId || undefined,
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
    } catch {
        /* Network failure or an unparseable page: callers fall back to other sources. */
        return null;
    }
}

/**
 * The rendered watch page, or null while it still shows another video.
 *
 * After an SPA navigation YouTube updates the URL first and the page content
 * later. Reading the DOM in between attributes the previous video's title,
 * channel and description to the new one, so every DOM fallback goes through
 * this check (and stays scoped to the returned element: the hidden pages
 * YouTube keeps in the document contain other videos' metadata too).
 */
export function getVerifiedWatchRoot(videoId: string | null): Element | null {
    if (!videoId) return null;
    const root = document.querySelector('ytd-watch-flexy');
    if (!root) return null;
    const renderedId = root.getAttribute('video-id');
    if (renderedId && renderedId !== videoId) return null;
    return root;
}

/**
 * Resolve the channel id of the video in the URL.
 */
export async function getYouTubeChannelId(): Promise<string | null> {
    const videoId = getYouTubeVideoId();

    /* 1. Live player data, validated against the video in the URL */
    const snapshot = getPlayerSnapshot(videoId);
    if (snapshot?.channelId) return snapshot.channelId;

    /* 2. Owner link of the rendered watch page */
    const channelLink = getVerifiedWatchRoot(videoId)?.querySelector<HTMLAnchorElement>(
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
                    const res = await fetch(`https://www.youtube.com/@${handle}`, { redirect: 'follow' });
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

    /* 3. Last resort on a video page: download and parse the watch page */
    if (videoId) {
        const data = await fetchYouTubeVideoData(window.location.href);
        if (data?.channel?.contentId) return data.channel.contentId;
        return null;
    }

    /* 4. Server-rendered meta tags are only trustworthy outside video pages (they go stale on SPA navigation) */
    const metaId = document.querySelector('meta[itemprop="channelId"]')?.getAttribute('content');
    if (metaId && metaId !== WEB_VIDEO_ID) return metaId;

    return null;
}

/**
 * Resolve the channel name of the video in the URL.
 */
export async function getChannelNameFallback(): Promise<string> {
    const videoId = getYouTubeVideoId();

    const snapshot = getPlayerSnapshot(videoId);
    if (snapshot?.author) return snapshot.author;

    const root = getVerifiedWatchRoot(videoId);
    if (root) {
        const channelNameEl = root.querySelector<HTMLElement>(
            '#owner ytd-channel-name yt-formatted-string a, #owner ytd-channel-name a, #upload-info #channel-name a',
        );
        if (channelNameEl?.textContent?.trim()) return channelNameEl.textContent.trim();

        const artistEl = root.querySelector<HTMLElement>(
            '.ytd-video-primary-info-renderer .ytd-metadata-row-renderer a',
        );
        if (artistEl?.textContent?.trim()) return artistEl.textContent.trim();
    }

    if (videoId) {
        const data = await fetchYouTubeVideoData(window.location.href);
        if (data?.channel?.title?.contentTitleNative) return data.channel.title.contentTitleNative;
    }

    return '';
}

/**
 * Resets the per-video caches. Called on every navigation.
 */
export function clearExtractionCaches() {
    activeHandleFetches.clear();
    videoDataRequests.clear();
}

/**
 * Resolves full channel media records.
 */
export function getChannelMediaData(channelId: string | null, channelTitle: string): Promise<Required<VideoMediaData>> {
    const realChannelId = channelId && channelId !== WEB_VIDEO_ID ? channelId : undefined;
    const cacheKey = `${realChannelId ?? ''}|${channelTitle ?? ''}`;

    const cached = channelMediaRequests.get(cacheKey);
    if (cached) return cached;

    const request = (async () => {
        try {
            const media = await resolveVideoChannelMedia({
                channelId: realChannelId,
                channelTitle: channelTitle ?? undefined,
            });
            return {
                channelId: pickChannelId(media.channelId, channelId),
                channelTitle: media.channelTitle || channelTitle,
                channelImage: media.channelImage || '',
                channelDescription: media.channelDescription || '',
            };
        } catch {
            /* Lookup failed: keep what the page told us, and let the next video retry. */
            channelMediaRequests.delete(cacheKey);
            return {
                channelId: pickChannelId(channelId),
                channelTitle,
                channelImage: '',
                channelDescription: '',
            };
        }
    })();

    if (channelMediaRequests.size >= CHANNEL_MEDIA_CACHE_LIMIT) {
        const oldest = channelMediaRequests.keys().next().value;
        if (oldest !== undefined) channelMediaRequests.delete(oldest);
    }
    channelMediaRequests.set(cacheKey, request);
    return request;
}
