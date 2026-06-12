import { searchMedia, submitLog } from '@/lib/api/nihongotracker';
import { USER_AGENT } from '@/lib/constants';
import { configStorage } from '@/lib/storage/config';
import {
  stremioProcessedStorage,
  stremioQueueStorage,
  updateStremioQueueAtomic,
} from '@/lib/storage/queues';
import type { AnimeMediaData, QueuedStremioLog, TrackerConfig } from '@/lib/types';

const TRAKT_BASE = 'https://api.trakt.tv';

/* ── PlexAniBridge Mappings Types & Caching ──────────────────────────────── */

interface PlexAniBridgeMapping {
  anidb_id?: number;
  mal_id?: number | number[];
  tvdb_id?: number;
  tmdb_show_id?: number;
  tmdb_movie_id?: number | number[];
  tvdb_mappings?: Record<string, string>;
  tmdb_mappings?: Record<string, string>;
  imdb_id?: string | string[];
}

interface AniListMediaNode {
  id: number;
  episodes: number | null;
  status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
  format: 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC';
  relations: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        type: string;
        status: string;
        format: string;
        episodes: number | null;
      }
    }>;
  };
}

// In-memory cache to prevent duplicate database and GraphQL requests during bulk sync operations
const mappingsCache: Record<string, Record<string, PlexAniBridgeMapping>> = {};
const aniListMediaCache: Record<number, AnimeMediaData> = {};

/**
 * Parses PlexAniBridge episode range patterns (e.g. "e1-e12|2", "e13-", "e1")
 * and returns whether an episode matches along with its translated target value.
 */
function matchEpisodeInMapping(
  mappingStr: string,
  episodeNum: number
): { matched: boolean; targetEpisode: number } {
  if (!mappingStr) {
    return { matched: true, targetEpisode: episodeNum };
  }

  const parts = mappingStr.split(',');
  for (const part of parts) {
    const match = part.trim().match(/^e(\d+)(?:-(e(\d+))?)?(?:\|(-?\d+))?$/);
    if (!match) continue;

    const start = match[1] ? parseInt(match[1], 10) : 1;
    const end = match[3] ? parseInt(match[3], 10) : Infinity;
    const ratioStr = match[4];
    const ratio = ratioStr ? parseInt(ratioStr, 10) : 1;

    if (episodeNum >= start && episodeNum <= end) {
      let targetEpisode = episodeNum - start;
      if (ratio > 0) {
        targetEpisode = Math.floor(targetEpisode / ratio);
      } else if (ratio < 0) {
        targetEpisode = targetEpisode * Math.abs(ratio);
      }
      targetEpisode += 1;

      return { matched: true, targetEpisode };
    }
  }

  return { matched: false, targetEpisode: episodeNum };
}

/**
 * Connects Trakt television IDs to accurate AniList database mappings.
 */
async function resolveTraktToAniList(
  item: any
): Promise<{ anilistId?: number; mappedEpisode?: number; isMapped: boolean }> {
  try {
    const isEpisode = item.type === 'episode';

    if (isEpisode && item.show && item.episode) {
      const tvdbId = item.show.ids?.tvdb ? Number(item.show.ids.tvdb) : null;
      const tmdbId = item.show.ids?.tmdb ? Number(item.show.ids.tmdb) : null;
      const season = item.episode.season;
      const episode = item.episode.number;

      const cacheKey = tvdbId ? `tvdb:${tvdbId}` : tmdbId ? `tmdb:${tmdbId}` : null;
      let mappings: Record<string, PlexAniBridgeMapping> = {};

      if (cacheKey && mappingsCache[cacheKey]) {
        mappings = mappingsCache[cacheKey];
      } else {
        if (tvdbId) {
          try {
            const res = await fetch(`https://plexanibridge-api.elias.eu.org/api/v2/search?tvdb_id=${tvdbId}`);
            if (res.ok) {
              mappings = await res.json();
            }
          } catch (e) { }
        }

        if ((!mappings || Object.keys(mappings).length === 0) && tmdbId) {
          try {
            const res = await fetch(`https://plexanibridge-api.elias.eu.org/api/v2/search?tmdb_show_id=${tmdbId}`);
            if (res.ok) {
              mappings = await res.json();
            }
          } catch (e) { }
        }

        if (cacheKey && mappings && Object.keys(mappings).length > 0) {
          mappingsCache[cacheKey] = mappings;
        }
      }

      if (mappings && Object.keys(mappings).length > 0) {
        const seasonKey = `s${season}`;

        for (const [aniIdStr, entry] of Object.entries(mappings)) {
          const aniId = parseInt(aniIdStr, 10);
          if (isNaN(aniId)) continue;

          const isTvdbSource = entry.tvdb_id === tvdbId;
          const mappingsObj = isTvdbSource ? entry.tvdb_mappings : entry.tmdb_mappings;

          if (mappingsObj && seasonKey in mappingsObj) {
            const rule = mappingsObj[seasonKey];
            const { matched, targetEpisode } = matchEpisodeInMapping(rule, episode);
            if (matched) {
              return { anilistId: aniId, mappedEpisode: targetEpisode, isMapped: true };
            }
          }
        }

        const firstId = Object.keys(mappings)[0];
        if (firstId) {
          return { anilistId: parseInt(firstId, 10), isMapped: false };
        }
      }
    } else if (item.type === 'movie' && item.movie) {
      const tmdbMovieId = item.movie.ids?.tmdb ? Number(item.movie.ids.tmdb) : null;
      if (tmdbMovieId) {
        try {
          const res = await fetch(`https://plexanibridge-api.elias.eu.org/api/v2/search?tmdb_movie_id=${tmdbMovieId}`);
          if (res.ok) {
            const mappings: Record<string, PlexAniBridgeMapping> = await res.json();
            const firstId = Object.keys(mappings)[0];
            if (firstId) {
              return { anilistId: parseInt(firstId, 10), isMapped: true };
            }
          }
        } catch (e) { }
      }
    }
  } catch (e) {
    console.error('[NAT TRAKT] Mappings resolution failed:', e);
  }

  return { isMapped: false };
}

/**
 * Traverses AniList relations recursively to map continuous episodes to sequels.
 */
async function resolveSequelCascadeRefined(
  currentMediaId: number,
  remainingEpisodes: number
): Promise<{ targetId: number; targetEpisode: number }> {
  const query = `
    query ($id: Int) {
      Media (id: $id, type: ANIME) {
        id
        episodes
        status
        format
        relations {
          edges {
            relationType
            node {
              id
              type
              status
              format
              episodes
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: currentMediaId } }),
    });

    if (!res.ok) return { targetId: currentMediaId, targetEpisode: remainingEpisodes };

    const { data } = await res.json();
    const media: AniListMediaNode = data?.Media;
    if (!media) return { targetId: currentMediaId, targetEpisode: remainingEpisodes };

    const isAiring = media.status === 'RELEASING';
    const hasActiveSequels = media.relations.edges.some(
      (edge) => edge.relationType === 'SEQUEL' &&
        edge.node.type === 'ANIME' &&
        (edge.node.status === 'FINISHED' || edge.node.status === 'RELEASING')
    );

    // Stop cascading at the active releasing boundary
    if (isAiring && !hasActiveSequels) {
      return { targetId: currentMediaId, targetEpisode: remainingEpisodes };
    }

    const currentMax = media.episodes || 0;

    if (currentMax === 0 || remainingEpisodes <= currentMax) {
      return { targetId: currentMediaId, targetEpisode: remainingEpisodes };
    }

    const sequelNodes = media.relations.edges
      .filter((edge) => edge.relationType === 'SEQUEL' && edge.node.type === 'ANIME')
      .map((edge) => edge.node);

    if (sequelNodes.length > 0) {
      // Prioritize TV/ONA formats
      const prioritizedSequel = sequelNodes.sort((a, b) => {
        const getPriority = (format: string) => {
          if (format === 'TV' || format === 'ONA') return 1;
          if (format === 'TV_SHORT') return 2;
          if (format === 'OVA') return 3;
          if (format === 'MOVIE') return 4;
          return 5;
        };
        return getPriority(a.format) - getPriority(b.format);
      })[0];

      if (prioritizedSequel) {
        const nextRemaining = remainingEpisodes - currentMax;
        return await resolveSequelCascadeRefined(prioritizedSequel.id, nextRemaining);
      }
    }
  } catch (error) {
    console.error('[NAT CASCADE] Refined cascade error:', error);
  }

  return { targetId: currentMediaId, targetEpisode: remainingEpisodes };
}

/**
 * Deducts watch stream recaps from continuous indexes to keep values aligned.
 */
function adjustEpisodesForRecaps(
  traktHistory: any[],
  currentHistoryItem: any,
  originalEpisodeNum: number
): number {
  let adjustedNum = originalEpisodeNum;
  const currentWatchedTime = new Date(currentHistoryItem.watched_at).getTime();
  const showTitle = currentHistoryItem.show?.title;

  if (!showTitle) return originalEpisodeNum;

  const previousWatched = traktHistory.filter((item) => {
    if (item.type !== 'episode' || item.show?.title !== showTitle) return false;
    return new Date(item.watched_at).getTime() < currentWatchedTime;
  });

  for (const item of previousWatched) {
    const epTitle = (item.episode?.title || '').toLowerCase();
    const isRecap =
      epTitle.includes('recap') ||
      epTitle.includes('summary') ||
      epTitle.includes('review') ||
      epTitle.includes('総集編');

    if (isRecap) {
      adjustedNum -= 1;
    }
  }

  return Math.max(1, adjustedNum);
}

/**
 * Pulls media parameters directly from AniList's schema.
 */
async function fetchAniListMedia(id: number): Promise<AnimeMediaData | undefined> {
  if (aniListMediaCache[id]) {
    return aniListMediaCache[id];
  }

  try {
    const query = `
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          id
          title {
            native
            romaji
            english
          }
          coverImage {
            large
          }
          description
          episodes
          duration
        }
      }
    `;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables: { id } }),
    });
    if (!res.ok) return undefined;
    const { data } = await res.json();
    const media = data?.Media;
    if (!media) return undefined;

    const parsed: AnimeMediaData = {
      contentId: String(media.id),
      contentTitleNative: media.title?.native || undefined,
      contentTitleEnglish: media.title?.english || undefined,
      contentTitleRomaji: media.title?.romaji || undefined,
      contentImage: media.coverImage?.large || undefined,
      coverImage: media.coverImage?.large || undefined,
      description: media.description || undefined,
      type: 'anime',
      episodes: media.episodes || undefined,
      episodeDuration: media.duration || undefined,
    };

    aniListMediaCache[id] = parsed;
    return parsed;
  } catch (e) {
    return undefined;
  }
}

/* ── Standard Trakt Authentication & History Logic ───────────────────────── */

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
  const queued = new Set(
    currentQueue.flatMap((item) => [item.traktHistoryId, ...(item.traktHistoryIds ?? [])].filter(Boolean)),
  );
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

    const queuedItem = await toQueuedStremioLog(item, history);
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
        await updateStremioQueueAtomic((queue) => mergeStremioQueueItems(queue, importedItems.filter((item) => failed.includes(item.traktHistoryId))));
      }
    } else {
      await updateStremioQueueAtomic((queue) => mergeStremioQueueItems(queue, importedItems));
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

async function toQueuedStremioLog(item: any, historyContext?: any[]): Promise<QueuedStremioLog | null> {
  if (item.type === 'episode') {
    const title = item.show?.title;
    if (!title || !item.episode) return null;

    const season = item.episode.season || 1;
    const originalEpisodeNum = item.episode.number || 1;

    // Adjust episode counter for any watched recap segments
    let targetEpisode = historyContext
      ? adjustEpisodesForRecaps(historyContext, item, originalEpisodeNum)
      : originalEpisodeNum;

    const mapping = await resolveTraktToAniList(item);
    let mediaData: AnimeMediaData | undefined;

    if (mapping.anilistId) {
      if (mapping.isMapped && mapping.mappedEpisode !== undefined) {
        mediaData = await fetchAniListMedia(mapping.anilistId);
        targetEpisode = mapping.mappedEpisode;
      } else {
        const cascade = await resolveSequelCascadeRefined(mapping.anilistId, targetEpisode);
        mediaData = await fetchAniListMedia(cascade.targetId);
        targetEpisode = cascade.targetEpisode;
      }
    }

    // Season-aware fuzzy fallback if no direct mapping exists
    if (!mediaData) {
      const searchTitle = season > 1 ? `${title} Season ${season}` : title;
      let baseMedia = await findNihongoMedia(searchTitle, 'anime');
      if (!baseMedia) {
        baseMedia = await findNihongoMedia(title, 'anime');
      }

      if (baseMedia && baseMedia.contentId) {
        const cascade = await resolveSequelCascadeRefined(Number(baseMedia.contentId), targetEpisode);
        mediaData = await fetchAniListMedia(cascade.targetId);
        targetEpisode = cascade.targetEpisode;
      }
    }

    const minutes = item.episode?.runtime || item.show?.runtime || mediaData?.episodeDuration || 24;
    const mediaTitle = mediaData?.contentTitleNative || mediaData?.contentTitleRomaji || mediaData?.contentTitleEnglish || title;

    return {
      id: `stremio:${item.id}`,
      type: 'stremio',
      logType: 'anime',
      contentTitleNative: mediaData?.contentTitleNative || title,
      contentTitleEnglish: mediaData?.contentTitleEnglish || title,
      contentTitleRomaji: mediaData?.contentTitleRomaji || title,
      description: mediaTitle,
      episodes: 1,
      time: minutes,
      date: item.watched_at,
      private: false,
      tags: [],
      sessions: [{
        id: `stremio:${item.id}:session`,
        secs: minutes * 60,
        date: item.watched_at,
        season: season,
        episode: targetEpisode,
        traktHistoryId: String(item.id),
        episodeTitle: item.episode.title,
      }],
      mediaId: mediaData?.contentId ? String(mediaData.contentId) : undefined,
      mediaData,
      traktHistoryId: String(item.id),
      traktType: 'episode',
      season: season,
      episode: targetEpisode,
    };
  }

  if (item.type === 'movie') {
    const title = item.movie?.title;
    if (!title) return null;

    const mapping = await resolveTraktToAniList(item);
    let mediaData: AnimeMediaData | undefined;

    if (mapping.anilistId) {
      mediaData = await fetchAniListMedia(mapping.anilistId);
    }

    if (!mediaData) {
      mediaData = await findNihongoMedia(title, 'movie');
    }

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
  const media = pickBestMediaMatch(results, title);
  if (!media) return undefined;

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

function pickBestMediaMatch(results: any[], title: string) {
  if (!Array.isArray(results) || results.length === 0) return undefined;
  const wanted = normalizeTitle(title);
  const exact = results.find((media) => {
    const titles = [
      media.title?.contentTitleNative,
      media.title?.contentTitleEnglish,
      media.title?.contentTitleRomaji,
      media.contentTitleNative,
      media.contentTitleEnglish,
      media.contentTitleRomaji,
      media.title,
    ];
    return titles.some((candidate) => normalizeTitle(candidate) === wanted);
  });
  return exact ?? results[0];
}

function normalizeTitle(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
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
      'User-Agent': config.traktUserAgent || USER_AGENT,
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