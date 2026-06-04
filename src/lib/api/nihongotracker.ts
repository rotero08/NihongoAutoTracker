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
    const response = await fetch(`${API_BASE}/logs`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      let createdLog: any = null;
      try {
        createdLog = await response.clone().json();
      } catch {}

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
    `${API_BASE}/media/youtube/search?search=${search}`,
    `${API_BASE}/media/youtube/search?channelId=${search}`,
    `${API_BASE}/media/search?search=${search}&type=YOUTUBE`,
    `${API_BASE}/media/search?query=${search}&type=YOUTUBE`,
  ];

  /* Try each endpoint until one returns valid data */
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
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
            endpoint: url,
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

    await fetch(`${API_BASE}/logs/assign-media`, {
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
  type: 'anime' | 'movie' | 'tv_show' | 'manga' | 'reading' | 'vn' | 'game';
  perPage?: number;
}): Promise<any[]> {
  const params = new URLSearchParams({
    search: input.search,
    type: input.type,
    page: '1',
    perPage: String(input.perPage ?? 5),
  });
  const response = await fetch(`${API_BASE}/media/search?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return [];
  const data = await response.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.media)) return data.media;
  return [];
}

/* ── Stats & Verification Helpers ── */
import { storage } from 'wxt/utils/storage';

export async function verifyApiKey(key: string): Promise<{ success: boolean; username?: string; error?: string; stats?: any }> {
  try {
    const response = await fetch(`${API_BASE}/auth/verify`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
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
  const url = `${API_BASE}/users/${encodeURIComponent(username)}/stats`;
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Cohesive, fetch-and-cache coordinator enforcing standard cache timeout boundaries (5-minute TTL).
 * Prevents redundant server queries across separate options tabs and the popup.
 */
export async function fetchAndCacheUserStats(username: string, force = false): Promise<any> {
  try {
    const FETCH_COOLDOWN = 5 * 60 * 1000;
    const lastFetched = await storage.getItem<number>('local:userStatsLastFetched') || 0;
    
    if (force || (Date.now() - lastFetched > FETCH_COOLDOWN)) {
      const stats = await fetchUserStats(username);
      await Promise.all([
        storage.setItem('local:userStats', stats),
        storage.setItem('local:userStatsLastFetched', Date.now())
      ]);
      return stats;
    }
    return await storage.getItem('local:userStats');
  } catch (err) {
    console.error('Failed to fetch and cache user stats:', err);
    return await storage.getItem('local:userStats');
  }
}
