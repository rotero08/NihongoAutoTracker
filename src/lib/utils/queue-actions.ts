/**
 * ── Queue Actions Stateless Service ──────────────────────────────────────────
 * Consolidates complex operations for queue items (payload building, submissions).
 * Keeping this utility stateless prevents Svelte 5 compiler errors in .ts files.
 */

import { submitLog, resolveVideoChannelMedia } from '@/lib/api/nihongotracker';
import { stripVideoTitle } from '@/lib/utils/text-parsing';
import { addDebugLog } from '@/lib/storage/debug';
import {
  updateReadingQueueAtomic,
  updateVideoQueueAtomic,
  updateStremioQueueAtomic,
  stremioProcessedStorage
} from '@/lib/storage/queues';
import type { ReadingMediaData } from '@/lib/types';

/**
 * Returns the atomic updater function for the specific queue type.
 */
export function getUpdater(type: "video" | "reading" | "stremio") {
  if (type === "reading") return updateReadingQueueAtomic;
  if (type === "stremio") return updateStremioQueueAtomic;
  return updateVideoQueueAtomic;
}

/**
 * Persists a field update atomically to the database.
 */
export async function persistField(
  id: string,
  type: "video" | "reading" | "stremio",
  field: string,
  value: any,
  onRefresh: () => void
) {
  const updater = getUpdater(type);
  await updater((queue: any[]) => {
    const idx = queue.findIndex((x) => x.id === id);
    if (idx > -1) {
      const nextQueue = [...queue];
      nextQueue[idx] = { ...nextQueue[idx], [field]: value };
      return nextQueue;
    }
    return queue;
  });
  onRefresh();
}

/**
 * Unlinks an associated AniList match from a queued log.
 */
export async function handleUnlink(
  id: string,
  type: "video" | "reading" | "stremio",
  onRefresh: () => void,
  onStatusMessage: (msg: string, err?: boolean) => void
) {
  const updater = getUpdater(type);
  await updater((queue: any[]) => {
    const idx = queue.findIndex((x) => x.id === id);
    if (idx > -1) {
      const nextQueue = [...queue];
      nextQueue[idx] = {
        ...nextQueue[idx],
        mediaId: type === "reading" ? "web-reading" : undefined,
        mediaData: undefined,
      };
      return nextQueue;
    }
    return queue;
  });
  onRefresh();
  onStatusMessage("✓ Match unlinked");
}

/**
 * Ensures a queued video contains its resolved channel metadata.
 */
export async function ensureVideoMediaData(item: any): Promise<any> {
  const channelId = item.channelId || item.mediaData?.channelId;
  const channelTitle = item.mediaData?.channelTitle || item.channelTitle || item.contentTitleNative;
  if (item.mediaData?.channelImage && item.mediaData?.channelDescription) return item.mediaData;
  if (!channelId && !channelTitle) return item.mediaData;

  const media = await resolveVideoChannelMedia({ channelId, channelTitle });
  return {
    ...(item.mediaData || {}),
    channelId: media.channelId || channelId || "web-video",
    channelTitle: media.channelTitle || channelTitle || item.contentTitleNative,
    ...(media.channelImage ? { channelImage: media.channelImage } : {}),
    ...(media.channelDescription ? { channelDescription: media.channelDescription } : {}),
  };
}

/**
 * Marks imported Trakt history items as processed in database.
 */
export async function markStremioProcessed(item: any) {
  const processed = new Set(await stremioProcessedStorage.getValue());
  for (const historyId of [item.traktHistoryId, ...(item.traktHistoryIds ?? [])]) {
    if (historyId) processed.add(String(historyId));
  }
  await stremioProcessedStorage.setValue([...processed].slice(-5000));
}

/**
 * Formats queued item data into API submission payloads.
 */
export function buildPayloads(item: any, type: "video" | "reading" | "stremio", titleValue: string): any[] {
  const rawTitle = item.description || item.contentTitleNative || "Unknown Title";
  const desc = type === "stremio"
    ? item.mediaData?.contentTitleNative || item.contentTitleNative || titleValue
    : titleValue || (type === "reading" ? item.mediaData?.contentTitleNative || item.contentTitleNative : item.contentTitleNative);
  const apiTitle = type === "video" ? stripVideoTitle(desc) : desc;

  const base: any = {
    type: type === "stremio" ? item.logType || "anime" : type,
    description: apiTitle,
    episodes: type === "stremio" ? 1 : 0,
    pages: 0,
    unknownDate: false,
    private: false,
  };

  if (type === "reading") {
    base.mediaId = item.mediaId || "web-reading";
    base.volume = Math.max(1, Number(item.volume || 1));
    base.mediaData = item.mediaData || {
      contentId: "web-reading",
      contentTitleNative: item.contentTitleNative,
    };
  } else if (type === "stremio") {
    base.mediaId = item.mediaId || item.mediaData?.contentId || `trakt:${item.traktHistoryId}`;
    base.mediaData = item.mediaData || {
      contentId: base.mediaId,
      contentTitleNative: item.contentTitleNative,
      contentTitleEnglish: item.contentTitleEnglish,
      contentTitleRomaji: item.contentTitleRomaji,
      type: item.logType || "anime",
    };
  } else {
    base.mediaId = item.mediaData?.channelId || item.channelId || "web-video";
    base.mediaData = item.mediaData || {
      channelId: item.channelId || "web-video",
      channelTitle: item.contentTitleNative,
    };
  }

  const sessions = item.sessions ?? [];
  if (type === "stremio" && sessions.length > 1) {
    return sessions.map((session: any) => ({
      ...base,
      time: Math.max(1, Math.round((session.secs || 0) / 60)),
      date: new Date(session.date).toISOString(),
      chars: 0,
    }));
  }

  const defaultDateStr = sessions.length > 0 ? sessions[0].date : item.date || new Date().toISOString();
  return [{
    ...base,
    time: type === "reading" ? Math.max(1, Math.round((item.time || 0) / 60)) : item.time || 0,
    date: new Date(defaultDateStr).toISOString(),
    chars: type === "reading" ? item.chars || 0 : 0,
  }];
}
