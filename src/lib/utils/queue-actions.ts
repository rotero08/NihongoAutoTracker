import { resolveVideoChannelMedia, submitLog } from '@/lib/api/nihongotracker';
import {
  stremioProcessedStorage,
  updateReadingQueueAtomic,
  updateStremioQueueAtomic,
  updateVideoQueueAtomic
} from '@/lib/storage/queues';
import { stripVideoTitle } from '@/lib/utils/text-parsing';

/**
 * Returns the atomic updater function for the specific queue type with unified casting.
 */
export function getUpdater(type: "video" | "reading" | "stremio"): (modifier: (currentQueue: any[]) => any[] | Promise<any[]>) => Promise<any[]> {
  if (type === "reading") return updateReadingQueueAtomic as any;
  if (type === "stremio") return updateStremioQueueAtomic as any;
  return updateVideoQueueAtomic as any;
}

/**
 * Persists multiple field updates atomically to the database.
 */
export async function persistFields(
  id: string,
  type: "video" | "reading" | "stremio",
  fields: Record<string, any>,
  onRefresh: () => void
) {
  const updater = getUpdater(type);
  await updater((queue: any[]) => {
    const idx = queue.findIndex((x) => x.id === id);
    if (idx > -1) {
      const nextQueue = [...queue];
      const plainObj = JSON.parse(JSON.stringify({ ...nextQueue[idx], ...fields }));
      Object.keys(fields).forEach(k => {
        if (fields[k] === undefined) {
          delete plainObj[k];
        }
      });
      nextQueue[idx] = plainObj;
      return nextQueue;
    }
    return queue;
  });
  onRefresh();
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
  return getItemPayloads(item, type, titleValue);
}

/**
 * Compile unified, single-item session listings into formatted tracker payloads.
 */
export function getItemPayloads(current: any, type: "reading" | "video" | "stremio", titleValue?: string): any[] {
  const isRead = type === "reading";
  const isStremio = type === "stremio";
  const s = current.sessions ?? [];
  const displayM = isRead
    ? Math.max(1, Math.round((current.time || 0) / 60))
    : current.time || 0;
  const sumSecs = s.reduce((a: number, b: any) => a + (b.secs || 0), 0);
  const sumMins = Math.max(1, Math.round(sumSecs / 60));
  const sumChars = isRead
    ? s.reduce((a: number, b: any) => a + (b.chars || 0), 0)
    : 0;

  const hasOverride = isRead
    ? Number(current.chars || 0) > sumChars || displayM > sumMins
    : displayM > Math.round(sumSecs / 60);

  const defaultDateStr =
    s.length > 0 ? s[0].date : current.date || new Date().toISOString();
  const desc = titleValue || (
    isStremio
      ? current.mediaData?.contentTitleNative || current.contentTitleNative || current.description || "Unknown Title"
      : current.description || current.contentTitleNative || "Unknown Title"
  );

  if (s.length > 1 && !hasOverride) {
    return s.map((sess: any) => {
      const sessMins = Math.max(1, Math.round((sess.secs || 0) / 60));
      const payload: any = {
        type: isStremio ? current.logType || "anime" : type,
        description: type === "video" ? stripVideoTitle(desc) : desc,
        time: sessMins,
        date: new Date(sess.date).toISOString(),
        chars: isRead ? sess.chars || 0 : 0,
        episodes: isStremio ? 1 : 0, // Individual sessions always log 1 episode
        pages: 0,
        unknownDate: false,
        mediaId: isRead
          ? current.mediaId || "web-reading"
          : isStremio
            ? current.mediaId || current.mediaData?.contentId || `trakt:${current.traktHistoryId}`
            : current.mediaData?.channelId || current.channelId || "web-video",
        mediaData: current.mediaData || {},
      };
      if (isRead) {
        payload.volume = Math.max(1, Number(current.volume || 1));
      }
      return payload;
    });
  } else {
    const payload: any = {
      type: isStremio ? current.logType || "anime" : type,
      description: type === "video" ? stripVideoTitle(desc) : desc,
      time: displayM,
      date: new Date(defaultDateStr).toISOString(),
      chars: isRead ? current.chars || 0 : 0,
      episodes: isStremio ? current.episodes || 1 : 0, // For single-item, use the item's total episodes
      pages: 0,
      unknownDate: false,
      mediaId: isRead
        ? current.mediaId || "web-reading"
        : isStremio
          ? current.mediaId || current.mediaData?.contentId || `trakt:${current.traktHistoryId}`
          : current.mediaData?.channelId || current.channelId || "web-video",
      mediaData: current.mediaData || {},
    };
    if (isRead) {
      payload.volume = Math.max(1, Number(current.volume || 1));
    }
    return [payload];
  }
}

/**
 * Centralized transactional helper to delete single sessions from a queue entry.
 */
export async function removeSessionFromQueue(
  itemId: string,
  sessionId: string,
  type: "video" | "reading" | "stremio",
  onRefresh: () => void
) {
  const updater = getUpdater(type);
  await updater((queue: any[]) => {
    const idx = queue.findIndex((x) => x.id === itemId);
    if (idx === -1) return queue;

    const entry = JSON.parse(JSON.stringify(queue[idx]));
    entry.sessions = (entry.sessions ?? []).filter((s: any) => s.id !== sessionId);

    const totalSecs = entry.sessions.reduce((a: number, b: any) => a + b.secs, 0);
    entry.time = type === "reading" ? totalSecs : Math.round(totalSecs / 60);
    if (type === "reading") {
      entry.chars = entry.sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0);
    } else if (type === "stremio") {
      entry.episodes = entry.sessions.length || 1;
    }

    if (entry.sessions.length === 0) {
      return queue.filter((x) => x.id !== itemId);
    }

    const nextQueue = [...queue];
    nextQueue[idx] = entry;
    return nextQueue;
  });
  onRefresh();
}

/**
 * Centralized transactional helper to submit a single session of a queue entry directly.
 */
export async function sendSessionFromQueue(
  item: any,
  sessionIdx: number,
  type: "video" | "reading" | "stremio",
  onRefresh: () => void,
  onStatusMessage: (msg: string, err?: boolean) => void
) {
  const session = item.sessions?.[sessionIdx];
  if (!session) return;

  const isRead = type === "reading";
  const isStremio = type === "stremio";
  const rawTitle = item.description || item.contentTitleNative || "Unknown Title";
  const desc = isStremio
    ? item.mediaData?.contentTitleNative || item.contentTitleNative || rawTitle
    : rawTitle;
  const apiTitle = type === "video" ? stripVideoTitle(desc) : desc;

  const payload: any = {
    type: isStremio ? item.logType || "anime" : type,
    description: apiTitle,
    time: Math.max(1, Math.round((session.secs || 0) / 60)),
    date: new Date(session.date).toISOString(),
    chars: isRead ? session.chars || 0 : 0,
    episodes: isStremio ? 1 : 0,
    pages: 0,
    unknownDate: false,
    private: false,
    mediaId: isRead
      ? item.mediaId || "web-reading"
      : isStremio
        ? item.mediaId || item.mediaData?.contentId || `trakt:${item.traktHistoryId}`
        : item.mediaData?.channelId || item.channelId || "web-video",
    mediaData: item.mediaData || {},
  };
  if (isRead) {
    payload.volume = Math.max(1, Number(item.volume || 1));
  }

  const result = await submitLog(payload, true);
  if (result?.success) {
    await removeSessionFromQueue(item.id, session.id, type, onRefresh);
    onStatusMessage("✓ Session logged successfully");
  } else {
    onStatusMessage(`⚠ Failed: ${result?.error || "Unknown error"}`, true);
  }
}
