/**
 * ── Trakt Integration (Stremio history) ──────────────────────────────────────
 *
 * Device authentication, token upkeep, and the import of watched history into
 * the Stremio queue. What a history item *is* (anime, TV show, movie) and which
 * catalogue entry it maps to is decided in `trakt-matching.ts`.
 */

import { clearAnimeMappingCaches } from '@/lib/api/anime-mapping';
import { submitLog } from '@/lib/api/nihongotracker';
import { matchTraktEpisode, matchTraktMovie, type TraktHistoryItem } from '@/lib/api/trakt-matching';
import { STREMIO_SYNC_STATE_KEY, USER_AGENT } from '@/lib/constants';
import { configStorage } from '@/lib/storage/config';
import { addDebugLog } from '@/lib/storage/debug';
import {
  stremioProcessedStorage,
  stremioQueueStorage,
  updateStremioQueueAtomic,
} from '@/lib/storage/queues';
import type { QueuedStremioLog, TrackerConfig } from '@/lib/types';
import { withCrossContextLock } from '@/lib/utils/locks';
import { fetchWithTimeout } from '@/lib/utils/net';
import { getItemPayloads } from '@/lib/utils/queue-actions';
import { storage } from 'wxt/utils/storage';

const TRAKT_BASE = 'https://api.trakt.tv';
const TRAKT_TIMEOUT_MS = 20_000;
const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_PAGES = 10;
const PROCESSED_IDS_LIMIT = 5000;

const TOKEN_REFRESH_LOCK = 'nat:trakt-token-refresh';
const IMPORT_LOCK = 'nat:stremio-import';

/** Refresh this long before the access token actually expires. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/* ── Device authentication ────────────────────────────────────────────────── */

export async function startTraktDeviceAuth(): Promise<{
  verificationUrl: string;
  userCode: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
}> {
  const config = await configStorage.getValue();
  requireTraktApp(config);

  const data = await traktFetch(config, '/oauth/device/code', {
    method: 'POST',
    auth: false,
    body: { client_id: config.traktClientId },
  });

  return {
    verificationUrl: data.verification_url,
    userCode: data.user_code,
    deviceCode: data.device_code,
    interval: data.interval ?? 5,
    expiresIn: data.expires_in,
  };
}

export async function pollTraktDeviceAuth(deviceCode: string): Promise<'pending' | 'authorized'> {
  const config = await configStorage.getValue();
  requireTraktApp(config);

  try {
    const token = await traktFetch(config, '/oauth/device/token', {
      method: 'POST',
      auth: false,
      body: {
        code: deviceCode,
        client_id: config.traktClientId,
        client_secret: config.traktClientSecret,
      },
    });

    const latest = await configStorage.getValue();
    await patchConfig({
      ...tokenFields(token),
      stremioActivatedAt: latest.stremioActivatedAt || new Date().toISOString(),
    });
    return 'authorized';
  } catch (error: any) {
    if (error?.status === 400 && (!error.data || /authorization_pending|pending/i.test(String(error.data?.error)))) {
      return 'pending';
    }
    throw error;
  }
}

/* ── Token upkeep ─────────────────────────────────────────────────────────── */

function tokenFields(token: any): Partial<TrackerConfig> {
  return {
    traktAccessToken: token.access_token,
    traktRefreshToken: token.refresh_token,
    traktExpiresAt: Date.now() + token.expires_in * 1000,
    traktRefreshBackoffUntil: 0,
  };
}

/**
 * Merge a few fields into the stored config. The config is one shared object
 * that every settings tab rewrites; writing back a copy read before a network
 * round-trip would silently undo whatever was saved in the meantime.
 */
async function patchConfig(patch: Partial<TrackerConfig>): Promise<TrackerConfig> {
  const next = { ...(await configStorage.getValue()), ...patch };
  await configStorage.setValue(next);
  return next;
}

const needsRefresh = (config: TrackerConfig) =>
  !!config.traktRefreshToken && Date.now() >= Number(config.traktExpiresAt ?? 0) - TOKEN_EXPIRY_MARGIN_MS;

const isInvalidGrant = (error: any) =>
  error?.data?.error === 'invalid_grant' || /invalid_grant/i.test(String(error?.message ?? ''));

let refreshInFlight: Promise<TrackerConfig> | null = null;

/**
 * Config holding a usable access token.
 *
 * Trakt refresh tokens are single use: spending one invalidates it and returns
 * its successor. Two contexts refreshing at once (the background poll and
 * "Import Now" in settings) would therefore leave one of them holding a dead
 * token — and, if it then saved its view of the config, would overwrite the
 * live one. Refreshes are serialised across contexts, and each starts from the
 * stored config rather than from a copy read earlier.
 */
async function ensureFreshTraktToken(): Promise<TrackerConfig> {
  const config = await configStorage.getValue();
  if (!needsRefresh(config)) return config;

  refreshInFlight ??= withCrossContextLock(TOKEN_REFRESH_LOCK, refreshTraktToken).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function refreshTraktToken(): Promise<TrackerConfig> {
  // Whoever held the lock before us may already have refreshed.
  const config = await configStorage.getValue();
  if (!needsRefresh(config)) return config;

  const backoffUntil = Number(config.traktRefreshBackoffUntil ?? 0);
  if (Date.now() < backoffUntil) {
    throw new Error(`Trakt token refresh is paused until ${new Date(backoffUntil).toLocaleTimeString()} after an earlier failure.`);
  }

  const spentRefreshToken = config.traktRefreshToken;
  try {
    const token = await traktFetch(config, '/oauth/token', {
      method: 'POST',
      auth: false,
      body: {
        refresh_token: spentRefreshToken,
        client_id: config.traktClientId,
        client_secret: config.traktClientSecret,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
        grant_type: 'refresh_token',
      },
    });
    return await patchConfig(tokenFields(token));
  } catch (error: any) {
    // A context without Web Locks may have rotated the token under us; if the
    // stored one is newer and valid, the "failure" is just us being late.
    const latest = await configStorage.getValue();
    if (latest.traktRefreshToken && latest.traktRefreshToken !== spentRefreshToken && !needsRefresh(latest)) {
      return latest;
    }

    if (isInvalidGrant(error)) {
      // The refresh token is revoked or expired: retrying can never succeed.
      // Drop the credentials so the settings page shows "not authorized".
      await patchConfig({
        traktAccessToken: undefined,
        traktRefreshToken: undefined,
        traktExpiresAt: undefined,
        traktRefreshBackoffUntil: 0,
      });
      throw new Error('Trakt authorization has expired. Authorize Trakt again in Settings → Stremio.');
    }

    let backoffMs = error?.status === 429 ? 30 * 60 * 1000 : 15 * 60 * 1000;
    const waitMatch = String(error?.message || '').match(/wait\s+(\d+)\s+seconds/i);
    if (waitMatch) {
      backoffMs = (parseInt(waitMatch[1], 10) + 10) * 1000;
    }

    try {
      await patchConfig({ traktRefreshBackoffUntil: Date.now() + backoffMs });
    } catch (storageError) {
      // Without the stored backoff the next poll simply retries the refresh.
      await addDebugLog('WARN', 'Stremio', 'Could not store Trakt refresh backoff', storageError);
    }
    throw error;
  }
}

/* ── History import ───────────────────────────────────────────────────────── */

export interface StremioImportResult {
  imported: number;
  checked: number;
  filteredOut: number;
  /** Trakt reported no new activity, so its history was not downloaded. */
  skipped?: boolean;
}

interface StremioSyncState {
  /** Settings the last import ran with; a change invalidates the markers. */
  fingerprint: string;
  episodesWatchedAt: string;
  moviesWatchedAt: string;
}

/**
 * Import newly watched Trakt history into the Stremio queue.
 *
 * @param options.force - Download the history even when Trakt reports no new activity.
 */
export function importStremioFromTrakt(options: { force?: boolean } = {}): Promise<StremioImportResult> {
  // One import at a time, in any context: two overlapping runs would each see
  // the same items as new and queue (or auto-send) them twice.
  return withCrossContextLock(IMPORT_LOCK, async () => {
    try {
      return await runImport(options.force === true);
    } finally {
      clearAnimeMappingCaches();
    }
  });
}

async function runImport(force: boolean): Promise<StremioImportResult> {
  const result: StremioImportResult = { imported: 0, checked: 0, filteredOut: 0 };

  const stored = await configStorage.getValue();
  if (!stored.stremioEnabled || !stored.traktAccessToken) return result;

  const config = await ensureFreshTraktToken();

  const activatedAt = config.stremioActivatedAt ? new Date(config.stremioActivatedAt).getTime() : Date.now();
  const startAt = new Date(Number.isFinite(activatedAt) ? activatedAt : Date.now()).toISOString();
  const japaneseOnly = config.stremioJapaneseOnly !== false;

  // Ask what changed before downloading anything: the history since activation
  // only grows, and most polls find nothing new in it.
  const fingerprint = `${startAt}|${japaneseOnly}`;
  const previous = await storage.getItem<StremioSyncState>(STREMIO_SYNC_STATE_KEY);
  const activity = await fetchLastActivity(config);
  const sameSettings = !force && !!activity && previous?.fingerprint === fingerprint;
  const episodesChanged = !sameSettings || previous?.episodesWatchedAt !== activity!.episodesWatchedAt;
  const moviesChanged = !sameSettings || previous?.moviesWatchedAt !== activity!.moviesWatchedAt;

  if (!episodesChanged && !moviesChanged) {
    return { ...result, skipped: true };
  }

  const [episodes, movies] = await Promise.all([
    episodesChanged ? fetchTraktHistory(config, 'episodes', startAt) : [],
    moviesChanged ? fetchTraktHistory(config, 'movies', startAt) : [],
  ]);

  const history = [...episodes, ...movies].sort(
    (a, b) => new Date(a.watched_at).getTime() - new Date(b.watched_at).getTime(),
  );
  result.checked = history.length;

  const processed = new Set(await stremioProcessedStorage.getValue());
  const processedBefore = processed.size;
  const currentQueue = await stremioQueueStorage.getValue();
  const queued = new Set(
    currentQueue.flatMap((item) => [item.traktHistoryId, ...(item.traktHistoryIds ?? [])].filter(Boolean)),
  );
  const saveProcessed = () => stremioProcessedStorage.setValue([...processed].slice(-PROCESSED_IDS_LIMIT));

  const importedItems: QueuedStremioLog[] = [];
  let unresolved = 0;

  for (const item of history) {
    const historyId = String(item.id);
    if (processed.has(historyId) || queued.has(historyId)) continue;
    if (japaneseOnly && !isJapaneseTraktItem(item)) {
      result.filteredOut += 1;
      continue;
    }

    try {
      const queuedItem = await toQueuedStremioLog(item, history);
      if (queuedItem) importedItems.push(queuedItem);
    } catch (error) {
      // One item that cannot be resolved right now must not cost the rest of
      // the batch. It stays unprocessed and is picked up by the next import.
      unresolved += 1;
      await addDebugLog('WARN', 'Stremio', `Could not resolve Trakt history item ${historyId}; it will be retried`, error);
    }
  }
  result.imported = importedItems.length;

  if (config.stremioQueueMode === 'auto') {
    const unsent: QueuedStremioLog[] = [];
    for (const item of importedItems) {
      const res = await submitLog(getItemPayloads(item, 'stremio')[0], true);
      if (res.success) {
        // Recorded per item: if the worker stops mid-batch, what was already
        // sent must not be sent again by the next run.
        processed.add(item.traktHistoryId);
        await saveProcessed();
      } else {
        unsent.push(item);
      }
    }
    importedItems.length = 0;
    importedItems.push(...unsent);
  }

  if (importedItems.length > 0) {
    await updateStremioQueueAtomic((queue) => mergeStremioQueueItems(queue, importedItems));
    for (const item of importedItems) processed.add(item.traktHistoryId);
  }

  if (processed.size !== processedBefore) await saveProcessed();

  // Remember the activity markers only when everything seen was dealt with;
  // otherwise the next poll would skip the items that still need a retry.
  if (activity && unresolved === 0) {
    await storage.setItem<StremioSyncState>(STREMIO_SYNC_STATE_KEY, { fingerprint, ...activity });
  }

  return result;
}

/** When the user last watched an episode / a movie, per Trakt. Null when the probe itself fails. */
async function fetchLastActivity(
  config: TrackerConfig,
): Promise<Pick<StremioSyncState, 'episodesWatchedAt' | 'moviesWatchedAt'> | null> {
  try {
    const activities = await traktFetch(config, '/sync/last_activities');
    return {
      episodesWatchedAt: String(activities?.episodes?.watched_at ?? ''),
      moviesWatchedAt: String(activities?.movies?.watched_at ?? ''),
    };
  } catch (error) {
    // An auth failure will fail the history request too; let it surface there.
    await addDebugLog('WARN', 'Stremio', 'Trakt activity probe failed; downloading full history', error);
    return null;
  }
}

async function fetchTraktHistory(
  config: TrackerConfig,
  type: 'episodes' | 'movies',
  startAt: string,
): Promise<TraktHistoryItem[]> {
  const items: TraktHistoryItem[] = [];

  for (let page = 1; page <= HISTORY_MAX_PAGES; page += 1) {
    const query = `start_at=${encodeURIComponent(startAt)}&extended=full&page=${page}&limit=${HISTORY_PAGE_SIZE}`;
    const pageItems = await traktFetch(config, `/sync/history/${type}?${query}`);
    if (!Array.isArray(pageItems) || pageItems.length === 0) break;

    items.push(...pageItems);
    if (pageItems.length < HISTORY_PAGE_SIZE) break;
  }

  return items;
}

function mergeStremioQueueItems(queue: QueuedStremioLog[], items: QueuedStremioLog[]) {
  const next = [...queue];

  for (const item of items) {
    if (item.traktType !== 'episode') {
      next.push(item);
      continue;
    }

    const key = getStremioSeriesKey(item);
    const idx = next.findIndex((queuedItem) => queuedItem.traktType === 'episode' && getStremioSeriesKey(queuedItem) === key);
    if (idx === -1) {
      next.push({ ...item, traktHistoryIds: [item.traktHistoryId] });
      continue;
    }

    const existing = next[idx];
    const historyIds = new Set([existing.traktHistoryId, ...(existing.traktHistoryIds ?? [])].filter(Boolean));
    if (historyIds.has(item.traktHistoryId)) continue;

    const sessions = [
      ...(existing.sessions ?? []),
      ...(item.sessions ?? []),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    historyIds.add(item.traktHistoryId);

    next[idx] = {
      ...existing,
      date: sessions[0]?.date ?? existing.date,
      description: existing.contentTitleNative || existing.description,
      episodes: sessions.length,
      time: Math.max(1, Math.round(sessions.reduce((sum, session) => sum + (session.secs || 0), 0) / 60)),
      sessions,
      traktHistoryIds: [...historyIds],
    };
  }

  return next;
}

function getStremioSeriesKey(item: QueuedStremioLog) {
  const mediaKey = item.mediaId || item.mediaData?.contentId;
  if (mediaKey) return `media:${mediaKey}`;
  return `title:${slugify(item.contentTitleRomaji || item.contentTitleEnglish || item.contentTitleNative)}`;
}

async function toQueuedStremioLog(
  item: TraktHistoryItem,
  history: TraktHistoryItem[],
): Promise<QueuedStremioLog | null> {
  const historyId = String(item.id);
  const common = {
    id: `stremio:${historyId}`,
    type: 'stremio' as const,
    date: item.watched_at,
    private: false,
    tags: [],
    traktHistoryId: historyId,
  };

  if (item.type === 'episode') {
    const title = item.show?.title;
    if (!title || !item.episode) return null;

    const match = await matchTraktEpisode(item, history);
    const media = match.mediaData;
    const season = Number.isInteger(item.episode.season) ? (item.episode.season as number) : 1;
    const episode = match.episode ?? item.episode.number ?? 1;
    const minutes = item.episode.runtime || item.show?.runtime || media?.episodeDuration || 24;

    return {
      ...common,
      logType: match.logType,
      contentTitleNative: media?.contentTitleNative || title,
      contentTitleEnglish: media?.contentTitleEnglish || title,
      contentTitleRomaji: media?.contentTitleRomaji || title,
      description: media?.contentTitleNative || media?.contentTitleRomaji || media?.contentTitleEnglish || title,
      episodes: 1,
      time: minutes,
      sessions: [{
        id: `stremio:${historyId}:session`,
        secs: minutes * 60,
        date: item.watched_at,
        season,
        episode,
        traktHistoryId: historyId,
        episodeTitle: item.episode.title,
      }],
      mediaId: media?.contentId ? String(media.contentId) : undefined,
      mediaData: media,
      traktType: 'episode',
      season,
      episode,
    };
  }

  if (item.type === 'movie') {
    const title = item.movie?.title;
    if (!title) return null;

    const match = await matchTraktMovie(item);
    const media = match.mediaData;
    const minutes = item.movie?.runtime || media?.runtime || media?.episodeDuration || 0;

    return {
      ...common,
      logType: match.logType,
      contentTitleNative: media?.contentTitleNative || title,
      contentTitleEnglish: media?.contentTitleEnglish || title,
      contentTitleRomaji: media?.contentTitleRomaji || title,
      description: `Trakt: ${title}${item.movie?.year ? ` (${item.movie.year})` : ''}`,
      episodes: 0,
      time: minutes,
      sessions: [{ id: `stremio:${historyId}:session`, secs: Math.max(1, minutes) * 60, date: item.watched_at }],
      mediaId: media?.contentId ? String(media.contentId) : undefined,
      mediaData: media,
      traktType: 'movie',
    };
  }

  return null;
}

/* ── HTTP ─────────────────────────────────────────────────────────────────── */

async function traktFetch(config: TrackerConfig, path: string, options: any = {}) {
  const response = await fetchWithTimeout(`${TRAKT_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': config.traktClientId || '',
      'User-Agent': config.traktUserAgent || USER_AGENT,
      ...(options.auth === false ? {} : { Authorization: `Bearer ${config.traktAccessToken}` }),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }, TRAKT_TIMEOUT_MS);
  const text = await response.text();
  const data = text ? tryJson(text) : null;
  if (!response.ok) {
    const error: any = new Error(data?.error_description || data?.error || text || response.statusText);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function requireTraktApp(config: TrackerConfig) {
  if (!config.traktClientId || !config.traktClientSecret) {
    throw new Error('Missing Trakt client ID or client secret.');
  }
}

function isJapaneseTraktItem(item: TraktHistoryItem): boolean {
  const media = item.type === 'episode' ? item.show : item.movie;
  const lang = String(media?.language || '').toLowerCase();
  return lang === 'ja' || lang === 'jpn' || lang === 'japanese';
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function tryJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
