/**
 * ── NihongoTracker API Client ────────────────────────────────────────────────
 *
 * Core API interaction layer for submitting immersion logs to the NihongoTracker
 * backend. This module handles authentication, payload normalization, and error
 * reporting for all log submissions across the extension.
 *
 * Used by: popup (Send), settings (Send All), background (EOD flush),
 *          video-tracker (auto-send), text-tracker (direct-send).
 */

import { browser } from 'wxt/browser';
import { configStorage } from '../storage/config';
import { addDebugLog } from '../storage/debug';
import { notify } from '../utils/toast';

/** Base URL for the NihongoTracker API */
const API_BASE = 'https://nihongotracker.app/api';

/**
 * Centralized fetch helper for NihongoTracker API calls.
 *
 * Ensures consistent authorization and URL routing.
 */
export async function fetchNHTApi(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const config = await configStorage.getValue();
  const apiKey = config?.apiKey ?? '';

  const headers = {
    'Accept': 'application/json',
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    ...options.headers,
  } as Record<string, string>;

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Fetch YouTube video information from the NihongoTracker API.
 */
export async function fetchYoutubeVideoInfo(url: string): Promise<any> {
  const res = await fetchNHTApi(`/media/youtube/video?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error('Could not fetch video info');
  return res.json();
}

/**
 * Submit an immersion log to NihongoTracker.
 *
 * Handles:
 * - API key retrieval from config storage
 * - mediaId correction (swaps 'web-video' for discovered channelId)
 * - Debug logging of request/response
 * - Toast notifications on success/failure
 *
 * @param payload - The log data to submit (video or reading)
 * @param silent - Whether to suppress individual toast notifications (useful for batch sends)
 * @returns Object with `success` boolean and optional `status`/`error`
 */
export async function submitLog(
  payload: Record<string, unknown>,
  silent = false,
): Promise<{ success: boolean; status?: number; error?: string }> {
  // Delegate to background script if running in content script to bypass page CSP restrictions [1]
  const isContentScript = typeof window !== 'undefined' && typeof document !== 'undefined' && !window.location.protocol.startsWith('chrome-extension') && !window.location.protocol.startsWith('moz-extension');
  if (isContentScript) {
    try {
      return await browser.runtime.sendMessage({
        action: 'SUBMIT_LOG',
        payload,
        silent
      });
    } catch (err: any) {
      return { success: false, error: err.message || 'Background routing failed' };
    }
  }

  const config = await configStorage.getValue();
  const apiKey = config?.apiKey ?? '';

  if (!apiKey) {
    if (!silent) notify('Error', 'Missing API key');
    return { success: false, error: 'Missing API key' };
  }

  /* Correct mediaId if a better ID was discovered in mediaData */
  const mediaData = payload.mediaData as any;
  if (payload.mediaId === 'web-video' && mediaData?.channelId && mediaData.channelId !== 'web-video') {
    payload.mediaId = mediaData.channelId;
    if (import.meta.env.DEV) {
      console.log(`[NAT DEV - API] Correcting mediaId using discovered mediaData ID`, {
        newMediaId: payload.mediaId,
      });
    }
  }

  if (import.meta.env.DEV) {
    console.log(`[NAT DEV - API] Submitting Log (${payload.type})`, payload);
  }

  try {
    const response = await fetchNHTApi('/logs', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      let createdLog: any = null;
      try {
        createdLog = await response.clone().json();
      } catch { }

      if (createdLog?._id && !createdLog.mediaId && hasAssignableMediaData(payload.mediaData)) {
        await assignMediaToLog(createdLog._id, payload.mediaData as any, apiKey);
      }

      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - API] Log sent successfully`);
      }
      if (!silent) notify('Success', 'Log sent to NihongoTracker!');
      return { success: true, status: response.status };
    } else {
      const errorText = await response.text();
      // Keep persistent disk error log on failure so user has diagnostic feedback
      await addDebugLog('ERROR', 'API', `Log failed with code ${response.status}`, errorText);
      if (!silent) notify('Error', `Log failed (${response.status}): ${errorText.slice(0, 100)}`);
      return { success: false, status: response.status, error: errorText };
    }
  } catch (err: any) {
    await addDebugLog('ERROR', 'API', 'Network error', err);
    if (!silent) notify('Error', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Resolve video channel media metadata from the NT API.
 *
 * Tries multiple API endpoints in priority order to find metadata
 * (image, description) for a YouTube channel. Falls back to scraping
 * the channel's about page if the API doesn't have it.
 *
 * @param input - Channel ID and/or title to search for
 * @returns Resolved channel metadata (may be partial)
 */
export async function resolveVideoChannelMedia(input: {
  channelId?: string;
  channelTitle?: string;
  apiKey?: string;
}): Promise<{
  channelId?: string;
  channelTitle?: string;
  channelImage?: string;
  channelDescription?: string;
}> {
  const channelId = input.channelId?.trim();
  const channelTitle = input.channelTitle?.trim();
  if (!channelId && !channelTitle) return {};

  if (import.meta.env.DEV) {
    console.log(`[NAT DEV - API] Resolving Channel Media`, {
      input_channelId: channelId,
      input_channelTitle: channelTitle,
    });
  }

  /* Retrieve API key from input or storage */
  let apiKey = input.apiKey || '';
  if (!apiKey) {
    const config = await configStorage.getValue();
    apiKey = config?.apiKey ?? '';
  }

  const search = encodeURIComponent(channelId || channelTitle || '');
  const endpoints = [
    `/media/youtube/search?search=${search}`,
    `/media/youtube/search?channelId=${search}`,
    `/media/search?search=${search}&type=YOUTUBE`,
    `/media/search?query=${search}&type=YOUTUBE`,
  ];

  /* Try each endpoint until one returns valid data */
  for (const endpoint of endpoints) {
    try {
      const res = await fetchNHTApi(endpoint, apiKey ? { headers: { 'X-API-Key': apiKey } } : {});
      if (!res.ok) continue;
      const data = await res.json();
      const results: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : [];
      if (!results.length) continue;

      /* Prefer exact channelId match if searching by ID */
      const exact = channelId
        ? results.find((r: any) => (r.channelId || r.contentId || r.id) === channelId)
        : undefined;
      const first = exact || results[0];
      const normalized = normalizeMediaSearchResult(first);

      if (normalized.channelTitle || normalized.channelImage || normalized.channelDescription) {
        if (channelId && !normalized.channelId) normalized.channelId = channelId;
        if (import.meta.env.DEV) {
          console.log(`[NAT DEV - API] Media successfully matched API request`, {
            endpoint,
            normalized,
          });
        }
        return normalized;
      }
    } catch {
      /* Continue to next endpoint */
    }
  }

  /* Fallback: scrape YouTube channel page for metadata */
  if (channelId) {
    const extras = await fetchChannelExtrasFromYouTube(channelId);
    return {
      channelImage: extras.channelImage,
      channelDescription: extras.channelDescription,
    };
  }

  return { channelTitle: channelTitle || undefined };
}

/* ── Internal helpers ─────────────────────────────────────────────────────── */

/**
 * Normalize a raw API search result into a consistent VideoChannelMedia shape.
 * Handles the various field name conventions used by different NT API endpoints.
 */
function normalizeMediaSearchResult(raw: any): {
  channelId?: string;
  channelTitle?: string;
  channelImage?: string;
  channelDescription?: string;
} {
  const title =
    raw?.channelTitle ||
    raw?.contentTitleNative ||
    raw?.title?.contentTitleNative ||
    raw?.title?.native ||
    '';
  const image =
    raw?.channelImage || raw?.contentImage || raw?.coverImage || raw?.image || raw?.thumbnail || '';
  const description =
    raw?.channelDescription || raw?.description || raw?.contentDescription || '';
  const id = raw?.channelId || raw?.contentId || raw?.id || '';
  return {
    channelId: id || undefined,
    channelTitle: title || undefined,
    channelImage: image || undefined,
    channelDescription: description || undefined,
  };
}

function hasAssignableMediaData(mediaData: any): boolean {
  return Boolean(
    mediaData?.contentId &&
    (mediaData?.contentTitleNative ||
      mediaData?.contentTitleRomaji ||
      mediaData?.contentTitleEnglish),
  );
}

async function assignMediaToLog(logId: string, mediaData: any, apiKey: string) {
  try {
    const contentMedia = pruneUndefined({
      contentId: mediaData.contentId,
      contentImage: mediaData.contentImage,
      coverImage: mediaData.coverImage,
      description: mediaData.description,
      type: mediaData.type,
      title: {
        contentTitleNative: mediaData.contentTitleNative,
        contentTitleEnglish: mediaData.contentTitleEnglish,
        contentTitleRomaji: mediaData.contentTitleRomaji,
      },
      isAdult: mediaData.isAdult,
      episodes: mediaData.episodes,
      duration: mediaData.episodeDuration,
      chapters: mediaData.chapters,
      volumes: mediaData.volumes,
    });

    await fetchNHTApi('/logs/assign-media', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify([{ logsId: [logId], contentMedia }]),
    });
  } catch (err) {
    await addDebugLog('WARN', 'API', 'Log created but media assignment failed', err);
  }
}

function pruneUndefined(value: any): any {
  if (Array.isArray(value)) return value.map(pruneUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, pruneUndefined(entryValue)]),
  );
}

/**
 * Scrape a YouTube channel's /about page for metadata (image, description).
 * This is the last-resort fallback when the NT API doesn't have the channel.
 */
async function fetchChannelExtrasFromYouTube(channelId: string): Promise<{
  channelImage?: string;
  channelDescription?: string;
}> {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/about`);
    if (!res.ok) return {};
    const text = await res.text();
    let channelDescription = '';
    let channelImage = '';

    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      channelDescription =
        doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
        doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
        '';
      channelImage =
        doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    } else {
      const descMatch = text.match(
        /<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]*)"/i,
      );
      const imgMatch = text.match(
        /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i,
      );
      channelDescription = descMatch?.[1] || '';
      channelImage = imgMatch?.[1] || '';
    }

    return {
      channelImage: channelImage || undefined,
      channelDescription: channelDescription || undefined,
    };
  } catch {
    return {};
  }
}

export async function searchMedia(input: {
  search: string;
  type: 'anime' | 'movie' | 'tv_show' | 'manga' | 'reading' | 'vn' | 'game' | 'novel';
  perPage?: number;
}): Promise<any[]> {
  const typeLower = input.type.toLowerCase();
  const isAnilistType = ['anime', 'manga', 'novel'].includes(typeLower);

  let endpoint: string;
  if (isAnilistType) {
    const typeUpper = typeLower === 'novel' ? 'MANGA' : input.type.toUpperCase();
    const params = new URLSearchParams({
      search: input.search,
      type: typeUpper,
      page: '1',
      perPage: String(input.perPage ?? 5),
    });
    if (typeLower === 'novel') {
      params.append('format', 'NOVEL');
    }
    endpoint = `/media/anilist/search?${params}`;
  } else {
    const params = new URLSearchParams({
      search: input.search,
      type: input.type,
      page: '1',
      perPage: String(input.perPage ?? 5),
    });
    endpoint = `/media/search?${params}`;
  }

  const response = await fetchNHTApi(endpoint);
  if (!response.ok) return [];
  const data = await response.json();

  let rawResults: any[] = [];
  if (Array.isArray(data)) {
    rawResults = data;
  } else if (Array.isArray(data?.results)) {
    rawResults = data.results;
  } else if (Array.isArray(data?.data)) {
    rawResults = data.data;
  } else if (Array.isArray(data?.media)) {
    rawResults = data.media;
  }

  return rawResults.map((item: any) => {
    if (!item) return item;

    // Prioritize the portrait contentImage as primary cover art, falling back to coverImage landscape banner
    const portraitImage = item.contentImage || item.coverImage;
    const fallbackImage = item.coverImage || item.contentImage;

    return {
      ...item,
      contentImage: portraitImage || undefined,
      coverImage: portraitImage || fallbackImage || undefined,
    };
  });
}

/* ── Stats & Verification Helpers ── */
import { storage } from 'wxt/utils/storage';

export async function verifyApiKey(key: string): Promise<{ success: boolean; username?: string; error?: string; stats?: any }> {
  try {
    const response = await fetchNHTApi('/auth/verify', {
      method: 'GET',
      headers: {
        'X-API-Key': key,
      },
    });
    if (response.ok) {
      const data = await response.json();
      if (data.valid && data.user) {
        return {
          success: true,
          username: data.user.username,
          stats: data.user.stats,
        };
      }
    }
    return { success: false, error: 'Invalid API Key' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchUserStats(username: string): Promise<any> {
  const url = `/users/${encodeURIComponent(username)}/stats`;
  const response = await fetchNHTApi(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Cohesive, fetch-and-cache coordinator enforcing standard cache timeout boundaries (5-minute TTL).
 * Prevents redundant server queries across separate options tabs and the popup using a storage-backed lock.
 */
export async function fetchAndCacheUserStats(username: string, force = false): Promise<any> {
  const FETCH_COOLDOWN = 5 * 60 * 1000;
  const LOCK_TIMEOUT = 15000; // 15-second safety boundary
  const lockKey = 'local:userStatsFetchingLock';
  const lastFetchedKey = 'local:userStatsLastFetched';
  const statsKey = 'local:userStats';

  try {
    const lastFetched = await storage.getItem<number>(lastFetchedKey) || 0;
    const now = Date.now();

    if (!force && (now - lastFetched <= FETCH_COOLDOWN)) {
      return await storage.getItem(statsKey);
    }

    // Check if another context is already fetching (lock is active and not stale)
    const lockActiveSince = await storage.getItem<number>(lockKey);
    if (lockActiveSince && (now - lockActiveSince < LOCK_TIMEOUT)) {
      // Another context is actively fetching — return cached data to avoid a duplicate request
      return await storage.getItem(statsKey);
    }

    // Acquire lock
    await storage.setItem(lockKey, now);

    try {
      const stats = await fetchUserStats(username);
      await Promise.all([
        storage.setItem(statsKey, stats),
        storage.setItem(lastFetchedKey, Date.now())
      ]);
      return stats;
    } finally {
      // Release lock — use removeItem for reliable cleanup across all storage backends
      await storage.removeItem(lockKey);
    }
  } catch (err) {
    console.error('Failed to fetch and cache user stats:', err);
    // Ensure lock is released even on unexpected errors
    try { await storage.removeItem(lockKey); } catch { }
    return await storage.getItem(statsKey);
  }
}