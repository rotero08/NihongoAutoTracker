/**
 * ── Queue Actions ────────────────────────────────────────────────────────────
 *
 * Everything the popup, the settings page, the background flush and the Trakt
 * import do to a queued item: describe it, edit it, turn it into log payloads
 * and send it. Kept in one place so the four cannot drift apart.
 */

import { resolveVideoChannelMedia, submitLog, type MediaSearchResult } from '@/lib/api/nihongotracker';
import { addDebugLog } from '@/lib/storage/debug';
import {
  stremioProcessedStorage,
  updateReadingQueueAtomic,
  updateStremioQueueAtomic,
  updateVideoQueueAtomic
} from '@/lib/storage/queues';
import type { WatchLogType } from '@/lib/types';
import { getLogTypeLabel, normalizeLogType } from '@/lib/utils/media-type';
import { stripVideoTitle } from '@/lib/utils/text-parsing';

export type QueueType = "video" | "reading" | "stremio";

const UNMATCHED_READING_ID = "web-reading";
const sumOf = (sessions: any[], field: "secs" | "chars"): number =>
  sessions.reduce((total, session) => total + (session[field] || 0), 0);

/** ISO form of a date value, or null when it is not a date. */
export function toIsoDate(value: unknown): string | null {
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/* ── Describing an item ───────────────────────────────────────────────────── */

/** Title shown (and edited) for a queue item. */
export function getQueueItemTitle(item: any, type: QueueType): string {
  const rawTitle = item.description || item.contentTitleNative || "Unknown Title";
  const untagged = rawTitle.replace(/^(Trakt|Stremio):\s*/, "");
  if (type === "stremio") {
    return item.contentTitleNative || item.contentTitleRomaji || item.contentTitleEnglish || untagged;
  }
  return type === "video" ? stripVideoTitle(rawTitle) : untagged;
}

/** Whether the item is tied to a NihongoTracker catalogue entry. */
export function isQueueItemLinked(item: any, type: QueueType): boolean {
  if (type === "reading") return !!(item.mediaId && item.mediaId !== UNMATCHED_READING_ID);
  if (type === "stremio") return !!(item.mediaId || item.mediaData?.contentId);
  return true;
}

/** Where the item came from, as the secondary line of a queue card. */
export function getQueueItemSource(item: any, type: QueueType): { label: string; detail: string } {
  if (type === "reading") {
    return {
      label: `${item.readerName || "Reader"} • ${item.originalTitle || item.description || item.contentTitleNative || ""}`,
      detail: "",
    };
  }
  if (type === "stremio") {
    return {
      label: `Stremio • ${item.logType ? getLogTypeLabel(item.logType) : "Trakt"}`,
      detail: `• ${item.contentTitleEnglish || item.traktType || ""}`,
    };
  }
  return {
    label: item.channelTitle || item.contentTitleNative || "YouTube",
    detail: `• ${item.contentTitleEnglish || item.channelId || ""}`,
  };
}

/* ── Editing an item ──────────────────────────────────────────────────────── */

/**
 * Returns the atomic updater function for the specific queue type with unified casting.
 */
export function getUpdater(type: QueueType): (modifier: (currentQueue: any[]) => any[] | Promise<any[]>) => Promise<any[]> {
  if (type === "reading") return updateReadingQueueAtomic as any;
  if (type === "stremio") return updateStremioQueueAtomic as any;
  return updateVideoQueueAtomic as any;
}

/**
 * Apply `mutate` to a detached copy of one queue item, inside a transaction.
 * Returning null removes the item; returning nothing keeps the mutated copy.
 */
export async function updateQueueItem(
  type: QueueType,
  id: string,
  mutate: (item: any) => any | null | void,
): Promise<void> {
  await getUpdater(type)((queue) => {
    const idx = queue.findIndex((x) => x.id === id);
    if (idx === -1) return queue;

    const draft = JSON.parse(JSON.stringify(queue[idx]));
    const result = mutate(draft);

    const next = [...queue];
    if (result === null) next.splice(idx, 1);
    else next[idx] = result ?? draft;
    return next;
  });
}

export async function removeQueueItem(type: QueueType, id: string): Promise<void> {
  await getUpdater(type)((queue) => queue.filter((x) => x.id !== id));
}

/**
 * Persists multiple field updates atomically to the database.
 * A field set to `undefined` is removed.
 */
export async function persistFields(
  id: string,
  type: QueueType,
  fields: Record<string, any>,
  onRefresh: () => void
) {
  await updateQueueItem(type, id, (item) => {
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) delete item[key];
      else item[key] = value;
    }
  });
  onRefresh();
}

/**
 * Persists a field update atomically to the database.
 */
export function persistField(
  id: string,
  type: QueueType,
  field: string,
  value: any,
  onRefresh: () => void
) {
  return persistFields(id, type, { [field]: value }, onRefresh);
}

/**
 * Unlinks the matched catalogue entry from a queued log.
 */
export async function handleUnlink(
  id: string,
  type: QueueType,
  onRefresh: () => void,
  onStatusMessage: (msg: string, err?: boolean) => void
) {
  await persistFields(
    id,
    type,
    { mediaId: type === "reading" ? UNMATCHED_READING_ID : undefined, mediaData: undefined },
    onRefresh,
  );
  onStatusMessage("✓ Match unlinked");
}

/**
 * Queue fields that tie an item to the catalogue entry picked in the search dropdown.
 */
export function buildMatchFields(item: any, type: QueueType, result: MediaSearchResult): Record<string, any> {
  const title = result.contentTitleNative || result.contentTitleEnglish || result.contentTitleRomaji || "Unknown";

  const mediaData: Record<string, any> = {
    contentId: result.contentId,
    contentTitleNative: title,
    contentTitleEnglish: result.contentTitleEnglish || undefined,
    contentTitleRomaji: result.contentTitleRomaji || undefined,
    contentImage: result.contentImage || undefined,
    coverImage: result.coverImage || undefined,
    chapters: result.chapters || undefined,
    volumes: result.volumes || undefined,
  };

  const fields: Record<string, any> = {
    description: title,
    contentTitleNative: title,
    contentTitleEnglish: result.contentTitleEnglish || item.contentTitleEnglish,
    contentTitleRomaji: result.contentTitleRomaji || item.contentTitleRomaji,
    mediaId: String(result.contentId),
    mediaData,
  };

  if (type === "stremio") {
    // The picked entry decides the log type: choosing a movie makes this a movie log.
    const logType = normalizeLogType(result.type, normalizeLogType(item.logType));
    fields.logType = logType;
    Object.assign(mediaData, {
      type: logType,
      episodes: result.episodes || undefined,
      episodeDuration: result.episodeDuration || undefined,
      runtime: result.runtime || undefined,
      isAdult: result.isAdult,
    });
  }

  return fields;
}

/**
 * Change what kind of media a Stremio item is logged as. A match made under
 * another type points at the wrong catalogue, so it is dropped.
 */
export async function changeStremioLogType(item: any, logType: WatchLogType, onRefresh: () => void) {
  await updateQueueItem("stremio", item.id, (draft) => {
    const linkedType = normalizeLogType(draft.mediaData?.type, normalizeLogType(draft.logType));
    draft.logType = logType;
    if (linkedType !== logType) {
      delete draft.mediaId;
      delete draft.mediaData;
    }
  });
  onRefresh();
}

/**
 * Edit one session of an item and bring the item's totals along.
 *
 * Totals follow the sum of their sessions, unless the user typed a higher
 * total by hand — that override is left alone.
 */
export async function editQueueSession(
  itemId: string,
  type: QueueType,
  sessionIdx: number,
  field: "chars" | "mins" | "date",
  value: unknown,
  onRefresh: () => void,
) {
  const isRead = type === "reading";

  await updateQueueItem(type, itemId, (entry) => {
    const session = entry.sessions?.[sessionIdx];
    if (!session) return;

    const sumMinsBefore = Math.max(1, Math.round(sumOf(entry.sessions, "secs") / 60));
    const sumCharsBefore = sumOf(entry.sessions, "chars");

    if (field === "chars") {
      session.chars = Math.max(0, Number(value) || 0);
    } else if (field === "mins") {
      session.secs = Math.max(1, Number(value) || 1) * 60;
    } else {
      session.date = toIsoDate(value) ?? session.date;
    }

    const sumSecs = sumOf(entry.sessions, "secs");

    if (isRead) {
      // Reading items keep their total in seconds.
      const minutes = Math.max(1, Math.round((entry.time || 0) / 60));
      if (minutes <= sumMinsBefore) entry.time = sumSecs;
      if (Number(entry.chars || 0) <= sumCharsBefore) entry.chars = sumOf(entry.sessions, "chars");
    } else if (type === "stremio") {
      entry.time = Math.max(1, Math.round(sumSecs / 60));
    } else if ((entry.time || 0) <= sumMinsBefore) {
      entry.time = Math.round(sumSecs / 60);
    }
  });
  onRefresh();
}

/**
 * Remove sessions from a queue entry; the entry goes with its last session.
 */
export async function removeSessionsFromQueue(itemId: string, sessionIds: string[], type: QueueType) {
  const removed = new Set(sessionIds);

  await updateQueueItem(type, itemId, (entry) => {
    entry.sessions = (entry.sessions ?? []).filter((s: any) => !removed.has(s.id));
    if (entry.sessions.length === 0) return null;

    const totalSecs = sumOf(entry.sessions, "secs");
    entry.time = type === "reading" ? totalSecs : Math.round(totalSecs / 60);
    if (type === "reading") {
      entry.chars = sumOf(entry.sessions, "chars");
    } else if (type === "stremio") {
      entry.episodes = entry.sessions.length;
    }
  });
}

/**
 * Centralized transactional helper to delete single sessions from a queue entry.
 */
export async function removeSessionFromQueue(
  itemId: string,
  sessionId: string,
  type: QueueType,
  onRefresh: () => void
) {
  await removeSessionsFromQueue(itemId, [sessionId], type);
  onRefresh();
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
  const sizeBefore = processed.size;
  for (const historyId of [item.traktHistoryId, ...(item.traktHistoryIds ?? [])]) {
    if (historyId) processed.add(String(historyId));
  }
  if (processed.size === sizeBefore) return;
  await stremioProcessedStorage.setValue([...processed].slice(-5000));
}

/* ── Turning an item into log payloads ────────────────────────────────────── */

function resolveMediaId(item: any, type: QueueType): string {
  if (type === "reading") return item.mediaId || UNMATCHED_READING_ID;
  if (type === "stremio") return item.mediaId || item.mediaData?.contentId || `trakt:${item.traktHistoryId}`;
  return item.mediaData?.channelId || item.channelId || "web-video";
}

function resolveDescription(item: any, type: QueueType, titleValue?: string): string {
  if (titleValue) return titleValue;
  if (type === "stremio") {
    return item.mediaData?.contentTitleNative || item.contentTitleNative || item.description || "Unknown Title";
  }
  return item.description || item.contentTitleNative || "Unknown Title";
}

/** The one place a queue item becomes a NihongoTracker log payload. */
function buildPayload(
  item: any,
  type: QueueType,
  part: { description: string; time: number; date: unknown; chars: number; episodes: number },
): any {
  const isRead = type === "reading";
  const payload: any = {
    type: type === "stremio" ? normalizeLogType(item.logType) : type,
    description: type === "video" ? stripVideoTitle(part.description) : part.description,
    time: part.time,
    date: toIsoDate(part.date) ?? new Date().toISOString(),
    chars: isRead ? part.chars : 0,
    episodes: part.episodes,
    pages: 0,
    unknownDate: false,
    private: !!item.private,
    mediaId: resolveMediaId(item, type),
    mediaData: item.mediaData || {},
  };
  if (isRead) {
    payload.volume = Math.max(1, Number(item.volume || 1));
  }
  return payload;
}

/** NihongoTracker counts every watched log in episodes; a movie is one episode. */
const countsEpisodes = (_item: any, type: QueueType) => type === "stremio";

const sessionMinutes = (session: any) => Math.max(1, Math.round((session.secs || 0) / 60));

/**
 * Payloads for an item, plus the session each one was built from.
 * `sessionIds` is empty when the item goes out as a single log.
 */
function planItemPayloads(
  current: any,
  type: QueueType,
  titleValue?: string,
): { payloads: any[]; sessionIds: string[] } {
  const isRead = type === "reading";
  const sessions: any[] = current.sessions ?? [];
  const displayMins = isRead
    ? Math.max(1, Math.round((current.time || 0) / 60))
    : current.time || 0;
  const sumSecs = sumOf(sessions, "secs");
  const sumChars = isRead ? sumOf(sessions, "chars") : 0;
  const withEpisodes = countsEpisodes(current, type);
  const description = resolveDescription(current, type, titleValue);

  // A total edited by hand no longer matches its sessions, so it is sent as one log.
  const hasOverride = isRead
    ? Number(current.chars || 0) > sumChars || displayMins > Math.max(1, Math.round(sumSecs / 60))
    : displayMins > Math.round(sumSecs / 60)
      || (withEpisodes && Number(current.episodes || sessions.length) !== sessions.length);

  if (sessions.length > 1 && !hasOverride) {
    return {
      payloads: sessions.map((session) => buildPayload(current, type, {
        description,
        time: sessionMinutes(session),
        date: session.date,
        chars: session.chars || 0,
        episodes: withEpisodes ? 1 : 0,
      })),
      sessionIds: sessions.map((session) => session.id),
    };
  }

  return {
    payloads: [buildPayload(current, type, {
      description,
      time: displayMins,
      date: sessions[0]?.date ?? current.date,
      chars: current.chars || 0,
      episodes: withEpisodes ? Math.max(1, Number(current.episodes) || 1) : 0,
    })],
    sessionIds: [],
  };
}

/**
 * Compile unified, single-item session listings into formatted tracker payloads.
 */
export function getItemPayloads(current: any, type: QueueType, titleValue?: string): any[] {
  return planItemPayloads(current, type, titleValue).payloads;
}

/* ── Sending ──────────────────────────────────────────────────────────────── */

export interface QueueSubmitResult {
  /** Every log of the item was accepted. */
  ok: boolean;
  sent: number;
  failed: number;
  error?: string;
  status?: number;
}

/**
 * Send an item and settle the queue: the item is removed when everything went
 * through, and when only some of its sessions did, exactly those are removed —
 * so retrying can never log the same session twice.
 */
export async function submitQueueItem(
  item: any,
  type: QueueType,
  options: { title?: string; silent?: boolean } = {},
): Promise<QueueSubmitResult> {
  const { payloads, sessionIds } = planItemPayloads(item, type, options.title);
  const sentSessionIds: string[] = [];
  const outcome: QueueSubmitResult = { ok: true, sent: 0, failed: 0 };

  for (const [index, payload] of payloads.entries()) {
    const result = await submitLog(payload, options.silent);
    if (result?.success) {
      outcome.sent++;
      if (sessionIds[index]) sentSessionIds.push(sessionIds[index]);
    } else {
      outcome.ok = false;
      outcome.failed++;
      outcome.error = result?.error || "Unknown error";
      outcome.status = result?.status;
      await addDebugLog("ERROR", "Queue", `Log submission failed: ${payload.description}`, outcome.error);
    }
  }

  if (outcome.ok) {
    await removeQueueItem(type, item.id);
  } else if (sentSessionIds.length > 0) {
    await removeSessionsFromQueue(item.id, sentSessionIds, type);
  }
  return outcome;
}

/**
 * Send every item of the given queues. Each item is settled as soon as it is
 * sent, so closing the popup midway leaves nothing that would be sent again.
 */
export async function sendAllQueued(
  queues: { reading: any[]; video: any[]; stremio: any[] },
): Promise<{ sent: number; failed: number }> {
  const totals = { sent: 0, failed: 0 };
  const batches: Array<[QueueType, any[]]> = [
    ["reading", queues.reading],
    ["video", queues.video],
    ["stremio", queues.stremio],
  ];

  for (const [type, items] of batches) {
    for (const queued of items) {
      try {
        let item = queued;
        if (type === "video") {
          try {
            item = { ...queued, mediaData: await ensureVideoMediaData(queued) };
          } catch (err) {
            // Channel artwork is optional; the log is still valid without it.
            await addDebugLog("WARN", "Queue", "Could not resolve channel metadata before sending", err);
          }
        }
        const result = await submitQueueItem(item, type, { silent: true });
        totals.sent += result.sent;
        totals.failed += result.failed;
      } catch (err) {
        totals.failed++;
        await addDebugLog("ERROR", "Queue", `Failed to send queued ${type} item`, err);
      }
    }
  }
  return totals;
}

/**
 * Centralized transactional helper to submit a single session of a queue entry directly.
 */
export async function sendSessionFromQueue(
  item: any,
  sessionIdx: number,
  type: QueueType,
  onRefresh: () => void,
  onStatusMessage: (msg: string, err?: boolean) => void
) {
  const session = item.sessions?.[sessionIdx];
  if (!session) return;

  const payload = buildPayload(item, type, {
    description: resolveDescription(item, type),
    time: sessionMinutes(session),
    date: session.date,
    chars: session.chars || 0,
    episodes: countsEpisodes(item, type) ? 1 : 0,
  });

  const result = await submitLog(payload, true);
  if (result?.success) {
    await removeSessionFromQueue(item.id, session.id, type, onRefresh);
    onStatusMessage("✓ Session logged successfully");
  } else {
    onStatusMessage(`⚠ Failed: ${result?.error || "Unknown error"}`, true);
  }
}
