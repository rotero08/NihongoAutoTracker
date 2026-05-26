import { cleanUrl } from './url';
import { resolveVideoChannelMedia } from '../api/nihongotracker';

const ytApiCache: Record<string, any> = {};
const ytApiInFlight: Record<string, Promise<any>> = {};
const channelMediaCache: Record<string, any> = {};

// URL-keyed caches for DOM-extracted channel info to avoid re-scanning <script> tags
const _cachedChannelIdByUrl: Record<string, string | null> = {};
const _cachedChannelNameByUrl: Record<string, string> = {};

/** Clear URL-keyed extraction caches on navigation */
export function clearExtractionCaches() {
  for (const key in _cachedChannelIdByUrl) delete _cachedChannelIdByUrl[key];
  for (const key in _cachedChannelNameByUrl) delete _cachedChannelNameByUrl[key];
}

export async function fetchYouTubeVideoData(url: string) {
    const clean = cleanUrl(url);
    if (ytApiCache[clean]) return ytApiCache[clean];
    if (clean in ytApiInFlight) return await ytApiInFlight[clean];

    ytApiInFlight[clean] = (async () => {
        try {
            const res = await fetch(`https://nihongotracker.app/api/media/youtube/video?url=${encodeURIComponent(clean)}`, {
                headers: { 'accept': '*/*' }
            });
            if (res.ok) {
                const data = await res.json();
                ytApiCache[clean] = data;
                return data;
            }
        } catch (e) {
            console.error('Failed to fetch YouTube data from API:', e);
        } finally {
            delete ytApiInFlight[clean];
        }
        return null;
    })();

    return ytApiInFlight[clean];
}

/** Parses channel ID instantly from local DOM, calling remote API ONLY if local extraction fails */
export async function getYouTubeChannelId(): Promise<string | null> {
    const pageUrl = window.location.href;
    if (pageUrl in _cachedChannelIdByUrl) return _cachedChannelIdByUrl[pageUrl];

    // 1. Try local extraction via canonical script details
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent;
        if (text && text.includes('videoDetails')) {
            const match = text.match(/"videoDetails":\{.*?"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
            if (match) {
                _cachedChannelIdByUrl[pageUrl] = match[1];
                return match[1];
            }
        }
    }

    // 2. Try canonical link tags
    const channelLink = document.querySelector('link[itemprop="channelId"]');
    if (channelLink) {
        const cid = channelLink.getAttribute('content');
        if (cid) {
            _cachedChannelIdByUrl[pageUrl] = cid;
            return cid;
        }
    }

    // 3. Try layout anchor tags
    const ownerLink = document.querySelector('#owner ytd-video-owner-renderer a[href*="/channel/"]');
    if (ownerLink) {
        const m = ownerLink.getAttribute('href')?.match(/(UC[a-zA-Z0-9_-]{22})/);
        if (m) {
            _cachedChannelIdByUrl[pageUrl] = m[1];
            return m[1];
        }
    }

    // 4. Remote API resolution fallback
    if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
        const data = await fetchYouTubeVideoData(window.location.href);
        if (data?.channel?.contentId) {
            _cachedChannelIdByUrl[pageUrl] = data.channel.contentId;
            return data.channel.contentId;
        }
    }

    // Don't cache null — DOM may not be ready yet, allow retry
    return null;
}

/** Parses channel title instantly from local DOM, calling remote API ONLY if local extraction fails */
export async function getChannelNameFallback(): Promise<string> {
    const pageUrl = window.location.href;
    if (pageUrl in _cachedChannelNameByUrl) return _cachedChannelNameByUrl[pageUrl];

    const ownerName = document.querySelector('#owner ytd-video-owner-renderer yt-formatted-string.ytd-channel-name');
    if (ownerName?.textContent?.trim()) {
        _cachedChannelNameByUrl[pageUrl] = ownerName.textContent.trim();
        return _cachedChannelNameByUrl[pageUrl];
    }

    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent;
        if (text && text.includes('videoDetails')) {
            const match = text.match(/"videoDetails":\{.*?"author":"([^"]+)"/);
            if (match) {
                _cachedChannelNameByUrl[pageUrl] = match[1];
                return match[1];
            }
        }
    }

    if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
        const data = await fetchYouTubeVideoData(window.location.href);
        if (data?.channel?.title) {
            const name = data.channel.title.contentTitleNative || data.channel.title.contentTitleEnglish || '';
            if (name) _cachedChannelNameByUrl[pageUrl] = name;
            return name;
        }
    }

    // Don't cache empty — DOM may not be ready yet
    return '';
}

export async function getChannelMediaData(chanId: string | null, fallbackTitle = '') {
    const currentId = chanId || await getYouTubeChannelId();
    const key = currentId || `title:${fallbackTitle}`;

    if (channelMediaCache[key]) return channelMediaCache[key];

    let media: any = {};
    try {
        if (currentId && currentId.startsWith('UC')) {
            media = await resolveVideoChannelMedia({ channelId: currentId, channelTitle: fallbackTitle });
        } else {
            media = await resolveVideoChannelMedia({ channelTitle: fallbackTitle });
        }
    } catch (e) { }

    const normalized = {
        channelId: currentId || media.channelId || 'web-video',
        channelTitle: fallbackTitle || media.channelTitle || 'Unknown Channel',
        ...(media.channelImage ? { channelImage: media.channelImage } : {}),
        ...(media.channelDescription ? { channelDescription: media.channelDescription } : {}),
    };
    channelMediaCache[key] = normalized;
    return normalized;
}