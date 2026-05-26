import { resolveVideoChannelMedia } from '../api/nihongotracker';
import { cleanUrl } from './url';

const ytApiCache: Record<string, any> = {};
const ytApiInFlight: Record<string, Promise<any>> = {};
const channelMediaCache: Record<string, any> = {};

// URL-keyed caches for DOM-extracted channel info
const _cachedChannelIdByUrl: Record<string, string | null> = {};
const _cachedChannelNameByUrl: Record<string, string> = {};

let _extractedCid: string | null = null;
let _extractedAuthor: string | null = null;

// Tracking variables for scanning state
let _lastUrl = '';
let _lastScriptCount = 0;
let _cidScannedAndFound = false;
let _authorScannedAndFound = false;

function extractFromScripts() {
    const pageUrl = window.location.href;
    const scripts = document.scripts;
    const scriptCount = scripts.length;

    // Reset tracking state if the URL has changed
    if (_lastUrl !== pageUrl) {
        _lastUrl = pageUrl;
        _extractedCid = null;
        _extractedAuthor = null;
        _lastScriptCount = 0;
        _cidScannedAndFound = false;
        _authorScannedAndFound = false;
    }

    const needsCid = !_cidScannedAndFound;
    const needsAuthor = !_authorScannedAndFound;

    // Only scan if we still need data AND new scripts have been appended
    if ((needsCid || needsAuthor) && scriptCount !== _lastScriptCount) {
        _lastScriptCount = scriptCount;

        for (let i = 0; i < scriptCount; i++) {
            if (_cidScannedAndFound && _authorScannedAndFound) {
                break; // Exit early if both pieces of data are resolved
            }

            const text = scripts[i].textContent;
            if (text && text.includes('videoDetails')) {
                if (needsCid && !_cidScannedAndFound) {
                    const cidMatch = text.match(/"videoDetails":\{.*?"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
                    if (cidMatch) {
                        _extractedCid = cidMatch[1];
                        _cidScannedAndFound = true;
                    }
                }
                if (needsAuthor && !_authorScannedAndFound) {
                    const authorMatch = text.match(/"videoDetails":\{.*?"author":"([^"]+)"/);
                    if (authorMatch) {
                        _extractedAuthor = authorMatch[1];
                        _authorScannedAndFound = true;
                    }
                }
            }
        }
    }
}

/** Clear URL-keyed extraction caches and state */
export function clearExtractionCaches() {
    for (const key in _cachedChannelIdByUrl) delete _cachedChannelIdByUrl[key];
    for (const key in _cachedChannelNameByUrl) delete _cachedChannelNameByUrl[key];
    _extractedCid = null;
    _extractedAuthor = null;
    _lastScriptCount = 0;
    _cidScannedAndFound = false;
    _authorScannedAndFound = false;
    _lastUrl = '';
}

/** Utility to automatically garbage-collect old cache entries on navigation */
function guardUrlTransition() {
    const pageUrl = window.location.href;
    if (_lastUrl !== pageUrl) {
        clearExtractionCaches();
        _lastUrl = pageUrl;
    }
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

/** Parses channel ID from local DOM, calling remote API ONLY if local extraction fails */
export async function getYouTubeChannelId(): Promise<string | null> {
    guardUrlTransition();
    const pageUrl = window.location.href;
    if (pageUrl in _cachedChannelIdByUrl) return _cachedChannelIdByUrl[pageUrl];

    // 1. Try local extraction via canonical script details
    extractFromScripts();
    if (_extractedCid) {
        _cachedChannelIdByUrl[pageUrl] = _extractedCid;
        return _extractedCid;
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

    return null;
}

/** Parses channel title from local DOM, calling remote API ONLY if local extraction fails */
export async function getChannelNameFallback(): Promise<string> {
    guardUrlTransition();
    const pageUrl = window.location.href;
    if (pageUrl in _cachedChannelNameByUrl) return _cachedChannelNameByUrl[pageUrl];

    const ownerName = document.querySelector('#owner ytd-video-owner-renderer yt-formatted-string.ytd-channel-name');
    if (ownerName?.textContent?.trim()) {
        _cachedChannelNameByUrl[pageUrl] = ownerName.textContent.trim();
        return _cachedChannelNameByUrl[pageUrl];
    }

    extractFromScripts();
    if (_extractedAuthor) {
        _cachedChannelNameByUrl[pageUrl] = _extractedAuthor;
        return _extractedAuthor;
    }

    if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
        const data = await fetchYouTubeVideoData(window.location.href);
        if (data?.channel?.title) {
            const name = data.channel.title.contentTitleNative || data.channel.title.contentTitleEnglish || '';
            if (name) _cachedChannelNameByUrl[pageUrl] = name;
            return name;
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