import { configStorage } from '@/lib/storage/config';
import {
  stremioProcessedStorage,
  stremioQueueStorage,
  updateStremioQueueAtomic,
} from '@/lib/storage/queues';
import { addDebugLog } from '@/lib/storage/debug';
import { searchMedia, submitLog } from '@/lib/api/nihongotracker';
import type { AnimeMediaData, QueuedStremioLog, TrackerConfig } from '@/lib/types';

const TRAKT_BASE = 'https://api.trakt.tv';

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

    await configStorage.setValue({
      ...config,
      traktAccessToken: token.access_token,
      traktRefreshToken: token.refresh_token,
      traktExpiresAt: Date.now() + token.expires_in * 1000,
      stremioActivatedAt: config.stremioActivatedAt || new Date().toISOString(),
    });
    return 'authorized';
  } catch (error: any) {
    if (error?.status === 400 && (!error.data || /authorization_pending|pending/i.test(String(error.data?.error)))) {
      return 'pending';
    }
    throw error;
  }
}

export async function importStremioFromTrakt(): Promise<{
  imported: number;
  checked: number;
  filteredOut: number;
}> {
  const config = await ensureFreshTraktToken(await configStorage.getValue());
  if (!config.stremioEnabled || !config.traktAccessToken) {
    return { imported: 0, checked: 0, filteredOut: 0 };
  }

  const activatedAt = config.stremioActivatedAt ? new Date(config.stremioActivatedAt).getTime() : Date.now();
  const startAt = new Date(Number.isFinite(activatedAt) ? activatedAt : Date.now()).toISOString();
  const [episodes, movies] = await Promise.all([
    fetchTraktHistory(config, 'episodes', startAt),
    fetchTraktHistory(config, 'movies', startAt),
  ]);

  const history = [...episodes, ...movies].sort(
    (a, b) => new Date(a.watched_at).getTime() - new Date(b.watched_at).getTime(),
  );
  const processed = new Set(await stremioProcessedStorage.getValue());
  const currentQueue = await stremioQueueStorage.getValue();
  const queued = new Set(currentQueue.map((item) => item.traktHistoryId));
  const japaneseOnly = config.stremioJapaneseOnly !== false;
  let filteredOut = 0;
  const importedItems: QueuedStremioLog[] = [];

  for (const item of history) {
    const historyId = String(item.id);
    if (processed.has(historyId) || queued.has(historyId)) continue;
    if (japaneseOnly && !isJapaneseTraktItem(item)) {
      filteredOut += 1;
      continue;
    }

    const queuedItem = await toQueuedStremioLog(item);
    if (queuedItem) importedItems.push(queuedItem);
  }

  if (importedItems.length > 0) {
    for (const item of importedItems) {
      processed.add(item.traktHistoryId);
    }

    if (config.stremioQueueMode === 'auto') {
      const failed: string[] = [];
      for (const item of importedItems) {
        const res = await submitLog(stremioQueueItemToPayload(item), true);
        if (!res.success) failed.push(item.traktHistoryId);
      }
      if (failed.length > 0) {
        await updateStremioQueueAtomic((queue) => [...queue, ...importedItems.filter((item) => failed.includes(item.traktHistoryId))]);
      }
    } else {
      await updateStremioQueueAtomic((queue) => [...queue, ...importedItems]);
    }
  }

  await stremioProcessedStorage.setValue([...processed].slice(-5000));
  return { imported: importedItems.length, checked: history.length, filteredOut };
}

async function fetchTraktHistory(config: TrackerConfig, type: 'episodes' | 'movies', startAt: string) {
  return fetchTraktHistoryPath(config, `/sync/history/${type}`, `start_at=${encodeURIComponent(startAt)}&extended=full`);
}

async function fetchTraktHistoryPath(config: TrackerConfig, path: string, extraQuery = 'extended=full') {
  const limit = 100;
  const items: any[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const query = `${extraQuery}&page=${page}&limit=${limit}`;
    const pageItems = await traktFetch(config, `${path}?${query}`);
    if (!Array.isArray(pageItems) || pageItems.length === 0) break;

    items.push(...pageItems);
    if (pageItems.length < limit) break;
  }

  return items;
}

export function stremioQueueItemToPayload(item: QueuedStremioLog) {
  return {
    type: item.logType,
    mediaId: item.mediaId || item.mediaData?.contentId || `trakt:${item.traktHistoryId}`,
    description: item.description || item.contentTitleRomaji || item.contentTitleEnglish || item.contentTitleNative,
    mediaData: item.mediaData,
    episodes: item.episodes,
    pages: 0,
    time: item.time,
    date: item.date,
    private: item.private,
    unknownDate: false,
    tags: [],
  };
}

async function toQueuedStremioLog(item: any): Promise<QueuedStremioLog | null> {
  if (item.type === 'episode') {
    const title = item.show?.title;
    if (!title || !item.episode) return null;
    const mediaData = await findNihongoMedia(title, 'anime');
    const minutes = item.episode?.runtime || item.show?.runtime || mediaData?.episodeDuration || 24;
    const description = `Trakt: ${title} S${item.episode.season}E${item.episode.number}${item.episode.title ? ` - ${item.episode.title}` : ''}`;

    return {
      id: `stremio:${item.id}`,
      type: 'stremio',
      logType: 'anime',
      contentTitleNative: mediaData?.contentTitleNative || title,
      contentTitleEnglish: mediaData?.contentTitleEnglish || title,
      contentTitleRomaji: mediaData?.contentTitleRomaji || title,
      description,
      episodes: 1,
      time: minutes,
      date: item.watched_at,
      private: false,
      tags: [],
      sessions: [{ id: `stremio:${item.id}:session`, secs: minutes * 60, date: item.watched_at }],
      mediaId: mediaData?.contentId ? String(mediaData.contentId) : undefined,
      mediaData,
      traktHistoryId: String(item.id),
      traktType: 'episode',
      season: item.episode.season,
      episode: item.episode.number,
    };
  }

  if (item.type === 'movie') {
    const title = item.movie?.title;
    if (!title) return null;
    const mediaData = await findNihongoMedia(title, 'movie');
    const minutes = item.movie?.runtime || mediaData?.runtime || 0;

    return {
      id: `stremio:${item.id}`,
      type: 'stremio',
      logType: 'movie',
      contentTitleNative: mediaData?.contentTitleNative || title,
      contentTitleEnglish: mediaData?.contentTitleEnglish || title,
      contentTitleRomaji: mediaData?.contentTitleRomaji || title,
      description: `Trakt: ${title}${item.movie.year ? ` (${item.movie.year})` : ''}`,
      episodes: 0,
      time: minutes,
      date: item.watched_at,
      private: false,
      tags: [],
      sessions: [{ id: `stremio:${item.id}:session`, secs: Math.max(1, minutes) * 60, date: item.watched_at }],
      mediaId: mediaData?.contentId ? String(mediaData.contentId) : undefined,
      mediaData,
      traktHistoryId: String(item.id),
      traktType: 'movie',
    };
  }

  return null;
}

async function findNihongoMedia(title: string, type: 'anime' | 'movie'): Promise<AnimeMediaData | undefined> {
  const results = await searchMedia({ search: title, type, perPage: 5 });
  const media = results[0];
  if (!media) {
    return {
      contentId: `trakt:${slugify(title)}`,
      contentTitleNative: title,
      contentTitleEnglish: title,
      contentTitleRomaji: title,
      type,
    };
  }

  return {
    contentId: media.contentId ?? media.id ?? media._id,
    contentTitleNative: media.title?.contentTitleNative ?? media.contentTitleNative,
    contentTitleEnglish: media.title?.contentTitleEnglish ?? media.contentTitleEnglish ?? media.title,
    contentTitleRomaji: media.title?.contentTitleRomaji ?? media.contentTitleRomaji ?? media.title,
    contentImage: media.contentImage ?? media.coverImage ?? media.poster,
    coverImage: media.coverImage,
    description: media.description,
    type: media.type ?? type,
    episodes: media.episodes,
    episodeDuration: media.episodeDuration,
    runtime: media.runtime,
    isAdult: media.isAdult,
  };
}

async function ensureFreshTraktToken(config: TrackerConfig): Promise<TrackerConfig> {
  if (!config.traktRefreshToken || Date.now() < Number(config.traktExpiresAt ?? 0) - 60_000) {
    return config;
  }

  const token = await traktFetch(config, '/oauth/token', {
    method: 'POST',
    auth: false,
    body: {
      refresh_token: config.traktRefreshToken,
      client_id: config.traktClientId,
      client_secret: config.traktClientSecret,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      grant_type: 'refresh_token',
    },
  });

  const updated = {
    ...config,
    traktAccessToken: token.access_token,
    traktRefreshToken: token.refresh_token,
    traktExpiresAt: Date.now() + token.expires_in * 1000,
  };
  await configStorage.setValue(updated);
  return updated;
}

async function traktFetch(config: TrackerConfig, path: string, options: any = {}) {
  const response = await fetch(`${TRAKT_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': config.traktClientId || '',
      'User-Agent': config.traktUserAgent || 'NihongoAutoTracker/4.0.3',
      ...(options.auth === false ? {} : { Authorization: `Bearer ${config.traktAccessToken}` }),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
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

function isJapaneseTraktItem(item: any): boolean {
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
