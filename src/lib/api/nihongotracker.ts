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

import { configStorage } from '../storage/config';
import { addDebugLog } from '../storage/debug';
import { notify } from './youtube';

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
  const config = await configStorage.getValue();
  const apiKey = config?.apiKey ?? '';

  if (!apiKey) {
    if (!silent) notify('Failed! Missing API key', '');
    return { success: false, error: 'Missing API key' };
  }

  /* Correct mediaId if a better ID was discovered in mediaData */
  const mediaData = payload.mediaData as any;
  if (payload.mediaId === 'web-video' && mediaData?.channelId && mediaData.channelId !== 'web-video') {
    payload.mediaId = mediaData.channelId;
    await addDebugLog('INFO', 'API', 'Correcting mediaId using discovered mediaData ID', {
      newMediaId: payload.mediaId,
    });
  }

  await addDebugLog('INFO', 'API', `Submitting Log (${payload.type})`, payload);

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
      await addDebugLog('INFO', 'API', 'Log sent successfully');
      if (!silent) notify('Success', 'Log sent to NihongoTracker!');
      return { success: true, status: response.status };
    } else {
      const errorText = await response.text();
      await addDebugLog('ERROR', 'API', `Log failed with code ${response.status}`, errorText);
      if (!silent) notify(`Failed! ${response.status}`, errorText.slice(0, 100));
      return { success: false, status: response.status, error: errorText };
    }
  } catch (err: any) {
    await addDebugLog('ERROR', 'API', 'Network error', err);
    if (!silent) notify('Failed!', err.message);
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

  await addDebugLog('INFO', 'API', 'Resolving Channel Media', {
    input_channelId: channelId,
    input_channelTitle: channelTitle,
  });

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
        await addDebugLog('INFO', 'API', 'Media successfully matched API request', {
          endpoint: url,
          normalized,
        });
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
      channelId,
      channelTitle: channelTitle || undefined,
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