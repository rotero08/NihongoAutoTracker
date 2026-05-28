/**
 * ── YouTube Data Utilities ───────────────────────────────────────────────────
 *
 * Functions for extracting metadata from YouTube pages and sending
 * toast notifications across extension contexts (content script ↔ background).
 *
 * Used by: video-tracker content script, background script, popup, settings.
 */

import { showToast } from '../utils/toast';

// Export consolidated notify utility to preserve module contract compatibility
export { notify } from '../utils/toast';

const activeHandleFetches = new Map<string, Promise<string | null>>();

/**
 * Fetch video metadata from a YouTube watch page.
 *
 * Scrapes the `ytInitialPlayerResponse` JSON embedded in the YouTube page HTML
 * to extract video duration, channel ID, channel title, image, and description.
 *
 * @param url - Full YouTube watch URL (e.g., "https://www.youtube.com/watch?v=abc123")
 * @returns Structured video + channel data, or null on failure
 */
export async function fetchYouTubeVideoData(url: string): Promise<{
  video: { episodeDuration: number };
  channel: {
    contentId?: string;
    title?: { contentTitleNative?: string; contentTitleEnglish?: string };
    contentImage?: string;
    description?: Array<{ description?: string }>;
  };
} | null> {
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

    /* Extract channel thumbnail from microformat */
    const microformat = data.microformat?.playerMicroformatRenderer || {};
    const channelImage =
      data.endscreen?.endscreenRenderer?.elements?.[0]?.endscreenElementRenderer?.image
        ?.thumbnails?.[0]?.url || '';
    const channelDesc = microformat.description?.simpleText || '';

    return {
      video: { episodeDuration: Math.max(1, Math.round(durationSecs / 60)) },
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
    return null;
  }
}

/**
 * Extract the YouTube channel ID from the current page's DOM.
 * Looks for the canonical channel URL in various YouTube elements.
 *
 * @returns Channel ID string (e.g., "UCxxxxxx") or null if not found
 */
export async function getYouTubeChannelId(): Promise<string | null> {
  const isWatchPage = window.location.pathname.startsWith('/watch') || window.location.href.includes('watch?v=');

  /* Try the dynamic channel link in the active player owner info section first */
  const channelLink = document.querySelector<HTMLAnchorElement>(
    'ytd-video-owner-renderer a, #upload-info a, #owner a[href*="/channel/"], #owner a[href*="/@"]',
  );

  if (channelLink) {
    const href = channelLink.getAttribute('href') || '';
    const idMatch = href.match(/\/channel\/([^/?]+)/);
    if (idMatch) return idMatch[1];

    /* Handle @handle format — resolve and cache persistently to prevent redundant API fetches */
    const handleMatch = href.match(/\/@([^/?]+)/);
    if (handleMatch) {
      const handle = handleMatch[1];

      // Retrieve persistent handle cache from browser storage with safe assertion to prevent indexing errors
      const storageData = await browser.storage.local.get('handleCache');
      const handleCacheObj = (storageData.handleCache || {}) as Record<string, string>;
      if (handleCacheObj[handle]) {
        return handleCacheObj[handle];
      }

      // Check if there is an active HTTP fetch in progress for this handle
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

  /* Fallback 1: check dynamic ytInitialPlayerResponse state (updates on SPA routing) */
  try {
    const playerResponse = (window as any).ytInitialPlayerResponse;
    if (playerResponse?.videoDetails?.channelId) {
      return playerResponse.videoDetails.channelId;
    }
  } catch {
    /* Not available */
  }

  /* Fallback 2: check HTML meta tags only if we are not on a watch page (where they are stale) */
  if (!isWatchPage) {
    const metaId = document.querySelector('meta[itemprop="channelId"]')?.getAttribute('content');
    if (metaId && metaId !== "web-video") return metaId;
  }

  return null;
}

/**
 * Get the YouTube channel name from the current page's DOM.
 * Falls back through multiple selectors to find the channel/artist name.
 *
 * @returns Channel name string or empty string if not found
 */
export async function getChannelNameFallback(): Promise<string> {
  /* Primary: channel name link in video owner section */
  const channelNameEl = document.querySelector<HTMLAnchorElement>(
    '#owner ytd-channel-name yt-formatted-string a, ytd-channel-name a, #upload-info #channel-name a',
  );
  if (channelNameEl?.textContent?.trim()) return channelNameEl.textContent.trim();

  /* Secondary: artist info (music videos) */
  const artistEl = document.querySelector<HTMLElement>(
    '.ytd-video-primary-info-renderer .ytd-metadata-row-renderer a',
  );
  if (artistEl?.textContent?.trim()) return artistEl.textContent.trim();

  /* Tertiary: ytInitialPlayerResponse */
  try {
    const playerResponse = (window as any).ytInitialPlayerResponse;
    if (playerResponse?.videoDetails?.author) return playerResponse.videoDetails.author;
  } catch {
    /* Not available */
  }

  return '';
}