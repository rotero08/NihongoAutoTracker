/**
 * ── YouTube Data Utilities ───────────────────────────────────────────────────
 *
 * Functions for extracting metadata from YouTube pages and sending
 * toast notifications across extension contexts (content script ↔ background).
 *
 * Used by: video-tracker content script, background script, popup, settings.
 */

import { showToast } from '../utils/toast';

/**
 * Send a toast notification that works across extension contexts.
 *
 * From a content script: injects the toast directly into the page DOM.
 * From the background script: uses browser.scripting.executeScript to
 * inject the toast into the active tab.
 * From popup/settings: sends a message to the background to relay.
 *
 * @param title - Notification title (bold text)
 * @param message - Notification body text
 */
export function notify(title: string, message: string): void {
  try {
    const isError = title.toLowerCase().includes('fail') || title.toLowerCase().includes('error');

    /* 1. Direct local render if running inside the settings page */
    if (typeof document !== 'undefined' && window.location.href.includes('settings.html')) {
      showToast(title, message, isError);
      return;
    }

    /* 2. Direct local render if running inside a restricted tab context / extension page */
    if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
      browser.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          const tab = tabs[0];
          const tabId = tab?.id;
          const url = tab?.url || "";

          const isRestricted =
            url.startsWith('chrome://') ||
            url.startsWith('about:') ||
            url.startsWith('https://chromewebstore.google.com/') ||
            url.startsWith('https://addons.mozilla.org/');

          if (isRestricted) {
            // Render locally within popup DOM when active tab is a system or local tab
            if (typeof document !== 'undefined') {
              showToast(title, message, isError);
            }
            return;
          }

          if (tabId && browser.scripting && browser.scripting.executeScript && !url.startsWith('chrome-extension://') && !url.startsWith('moz-extension://')) {
            browser.scripting
              .executeScript({
                target: { tabId },
                func: showToast,
                args: [title, message, isError],
              })
              .catch(() => null);
          } else if (tabId) {
            browser.tabs
              .sendMessage(tabId, { action: 'SHOW_TOAST', title, message })
              .catch(() => null);
          }
        })
        .catch(() => null);
      return;
    }

    /* 3. Otherwise, relay through the background script messaging system */
    if (browser.runtime?.sendMessage) {
      browser.runtime
        .sendMessage({ action: 'NOTIFY', title, message })
        .catch(() => null);
    }
  } catch (_e) {
    /* Notification is best-effort — never throw */
  }
}

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
    const ownerProfile = microformat.ownerProfileUrl || '';
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
// Add these cache containers at the top of the file (outside the function)
const handleCache = new Map<string, string>();
const activeHandleFetches = new Map<string, Promise<string | null>>();

/**
 * Extract the YouTube channel ID from the current page's DOM.
 * Looks for the canonical channel URL in various YouTube elements.
 *
 * @returns Channel ID string (e.g., "UCxxxxxx") or null if not found
 */
export async function getYouTubeChannelId(): Promise<string | null> {
  /* Try the channel link in the owner info section */
  const channelLink = document.querySelector<HTMLAnchorElement>(
    'ytd-video-owner-renderer a, #upload-info a, #owner a[href*="/channel/"], #owner a[href*="/@"]',
  );

  if (channelLink) {
    const href = channelLink.getAttribute('href') || '';
    const idMatch = href.match(/\/channel\/([^/?]+)/);
    if (idMatch) return idMatch[1];

    /* Handle @handle format — need to resolve to channel ID */
    const handleMatch = href.match(/\/@([^/?]+)/);
    if (handleMatch) {
      const handle = handleMatch[1];

      // Return from cache if already resolved
      if (handleCache.has(handle)) {
        return handleCache.get(handle) || null;
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
            handleCache.set(handle, channelId);
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

  /* Fallback: check ytInitialPlayerResponse */
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
 * Get the YouTube channel name from the current page's DOM.
 * Falls back through multiple selectors to find the channel/artist name.
 *
 * @returns Channel name string or empty string if not found
 */
export async function getChannelNameFallback(): Promise<string> {
  /* Primary: channel name link in video owner section */
  const channelNameEl = document.querySelector<HTMLElement>(
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