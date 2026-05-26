import { cleanUrl } from './url';
import { resolveVideoChannelMedia } from '../api/nihongotracker';

const ytApiCache: Record<string, any> = {};
const ytApiInFlight: Record<string, Promise<any>> = {};
const channelMediaCache: Record<string, any> = {};

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
    // 1. Try local extraction via canonical script details
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent;
        if (text && text.includes('videoDetails')) {
            const match = text.match(/"videoDetails":\{.*?"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
            if (match) return match[1];
        }
    }

    // 2. Try canonical link tags
    const channelLink = document.querySelector('link[itemprop="channelId"]');
    if (channelLink) {
        const cid = channelLink.getAttribute('content');
        if (cid) return cid;
    }

    // 3. Try layout anchor tags
    const ownerLink = document.querySelector('#owner ytd-video-owner-renderer a[href*="/channel/"]');
    if (ownerLink) {
        const m = ownerLink.getAttribute('href')?.match(/(UC[a-zA-Z0-9_-]{22})/);
        if (m) return m[1];
    }

    // 4. Remote API resolution fallback
    if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
        const data = await fetchYouTubeVideoData(window.location.href);
        if (data?.channel?.contentId) return data.channel.contentId;
    }

    return null;
}

/** Parses channel title instantly from local DOM, calling remote API ONLY if local extraction fails */
export async function getChannelNameFallback(): Promise<string> {
    const ownerName = document.querySelector('#owner ytd-video-owner-renderer yt-formatted-string.ytd-channel-name');
    if (ownerName?.textContent?.trim()) return ownerName.textContent.trim();

    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent;
        if (text && text.includes('videoDetails')) {
            const match = text.match(/"videoDetails":\{.*?"author":"([^"]+)"/);
            if (match) return match[1];
        }
    }

    if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
        const data = await fetchYouTubeVideoData(window.location.href);
        if (data?.channel?.title) {
            return data.channel.title.contentTitleNative || data.channel.title.contentTitleEnglish || '';
        }
    }

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