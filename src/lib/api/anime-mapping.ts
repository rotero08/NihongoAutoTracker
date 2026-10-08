/**
 * ── Anime ID Mapping ─────────────────────────────────────────────────────────
 *
 * Trakt identifies what was watched by TVDB / TMDB / IMDb ids and by the
 * season and episode numbering of those databases. NihongoTracker files anime
 * under AniList entries, which split the same show differently (one entry per
 * season, cour or special). This module bridges the two:
 *
 *   1. arm.haglund.dev lists every anime entry tied to an external id, with
 *      the season each entry starts at. No entries means "not anime".
 *   2. api.ani.zip maps the episodes of one AniList entry to TVDB episodes,
 *      which settles which entry a watched episode belongs to.
 *
 * Both are free community services. Neither is ever allowed to fail an import:
 * an unreachable service is reported once, skipped for a few minutes, and the
 * lookup resolves to `unknown` so the caller can degrade to a title search.
 */

import { addDebugLog } from '@/lib/storage/debug';
import { fetchWithTimeout } from '@/lib/utils/net';

const ARM_BASE = 'https://arm.haglund.dev/api/v2';
const ANIZIP_BASE = 'https://api.ani.zip';
const ARM_FIELDS = 'anilist,media,thetvdb-season,themoviedb-season';

const ARM_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ARM_CACHE_LIMIT = 200;
const OUTAGE_BACKOFF_MS = 5 * 60 * 1000;
const MAX_EPISODE_TABLES_PER_LOOKUP = 8;

const HOUR_MS = 60 * 60 * 1000;
/** Two databases rarely agree on the exact air time; a day and a half absorbs time zones. */
const SAME_AIRING_MS = 36 * HOUR_MS;
/** Beyond a week apart, matching numbers are a coincidence of two numbering schemes. */
const DIFFERENT_AIRING_MS = 7 * 24 * HOUR_MS;

export type AnimeLookup =
  /** `exact`: the episode itself was located. Otherwise only the entry that starts the season (or series) is known. */
  | { status: 'matched'; anilistId: number; episode?: number; exact: boolean; coversSeason?: boolean }
  /** Listed as anime, but no AniList entry could be determined. */
  | { status: 'unmapped' }
  | { status: 'not-anime' }
  /** The mapping services could not be reached. */
  | { status: 'unknown' };

export interface ShowIds {
  tvdb?: number;
  tmdb?: number;
  imdb?: string;
}

export interface EpisodeRef {
  season: number;
  number: number;
  /** Absolute episode number across seasons, when the source provides one. */
  absolute?: number;
  tvdbEpisodeId?: number;
  /** ISO timestamp of the original broadcast. */
  firstAired?: string;
}

/* ── Service access ───────────────────────────────────────────────────────── */

function createService(name: string) {
  let unavailableUntil = 0;

  return {
    /** @returns parsed JSON, `null` when the service has no such id, `undefined` when it cannot be used right now */
    async get(url: string): Promise<unknown | null | undefined> {
      if (Date.now() < unavailableUntil) return undefined;
      try {
        const res = await fetchWithTimeout(url);
        // "Not found" and "id rejected" are answers. Only throttling and server
        // or network failures mean the service itself is in trouble.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        unavailableUntil = Date.now() + OUTAGE_BACKOFF_MS;
        await addDebugLog('WARN', 'AnimeMapping', `${name} is unavailable; falling back to title matching for anime`, err);
        return undefined;
      }
    },
  };
}

const arm = createService('arm.haglund.dev');
const aniZip = createService('api.ani.zip');

/* ── arm: external id → anime entries ─────────────────────────────────────── */

interface ArmEntry {
  anilist: number | null;
  /** TV, MOVIE, OVA, ONA, SPECIAL… */
  media: string;
  tvdbSeason: number | null;
  tmdbSeason: number | null;
}

type ArmSource = 'thetvdb' | 'themoviedb' | 'imdb';

const armCache = new Map<string, { at: number; request: Promise<ArmEntry[] | undefined> }>();

const toNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function lookupArm(source: ArmSource, id: string | number): Promise<ArmEntry[] | undefined> {
  const key = `${source}:${id}`;
  const cached = armCache.get(key);
  if (cached && Date.now() - cached.at < ARM_CACHE_TTL_MS) return cached.request;

  const url = `${ARM_BASE}/${source}?id=${encodeURIComponent(String(id))}&include=${ARM_FIELDS}`;
  const request = arm.get(url).then((data) => {
    if (data === undefined) {
      armCache.delete(key);
      return undefined;
    }
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry: any): ArmEntry => ({
        anilist: toNumberOrNull(entry.anilist),
        media: typeof entry.media === 'string' ? entry.media : '',
        tvdbSeason: toNumberOrNull(entry['thetvdb-season']),
        tmdbSeason: toNumberOrNull(entry['themoviedb-season']),
      }));
  });

  if (armCache.size >= ARM_CACHE_LIMIT) {
    const oldest = armCache.keys().next().value;
    if (oldest !== undefined) armCache.delete(oldest);
  }
  armCache.set(key, { at: Date.now(), request });
  return request;
}

/* ── ani.zip: AniList entry → TVDB episodes ───────────────────────────────── */

interface EpisodeRow {
  /** Episode number within the AniList entry; null for specials and extras. */
  number: number | null;
  tvdbEpisodeId: number | null;
  season: number | null;
  episode: number | null;
  absolute: number | null;
  airedAt: number | null;
}

const episodeTables = new Map<number, Promise<EpisodeRow[] | undefined>>();

function loadEpisodeTable(anilistId: number): Promise<EpisodeRow[] | undefined> {
  let request = episodeTables.get(anilistId);
  if (request) return request;

  request = aniZip.get(`${ANIZIP_BASE}/mappings?anilist_id=${anilistId}`).then((data: any) => {
    if (data === undefined) {
      episodeTables.delete(anilistId);
      return undefined;
    }
    const episodes = data && typeof data.episodes === 'object' && data.episodes ? data.episodes : {};
    return Object.entries(episodes).map(([key, ep]: [string, any]): EpisodeRow => {
      const aired = Date.parse(ep?.airDateUtc || ep?.airDate || '');
      return {
        number: /^\d+$/.test(key) ? Number(key) : null,
        tvdbEpisodeId: toNumberOrNull(ep?.tvdbId),
        season: toNumberOrNull(ep?.seasonNumber),
        episode: toNumberOrNull(ep?.episodeNumber),
        absolute: toNumberOrNull(ep?.absoluteEpisodeNumber),
        airedAt: Number.isNaN(aired) ? null : aired,
      };
    });
  });

  episodeTables.set(anilistId, request);
  return request;
}

/** Episode tables of long-running shows are large; drop them once an import is done. */
export function clearAnimeMappingCaches(): void {
  episodeTables.clear();
}

function findEpisodeRow(rows: EpisodeRow[], ref: EpisodeRef): EpisodeRow | undefined {
  // The TVDB episode id is the one key that does not depend on how either side numbers seasons.
  if (ref.tvdbEpisodeId) {
    const byId = rows.find((row) => row.tvdbEpisodeId === ref.tvdbEpisodeId);
    if (byId) return byId;
  }

  const aired = ref.firstAired ? Date.parse(ref.firstAired) : NaN;
  const plausible = (row: EpisodeRow) =>
    Number.isNaN(aired) || row.airedAt === null || Math.abs(row.airedAt - aired) <= DIFFERENT_AIRING_MS;

  const byNumber = rows.find((row) => row.season === ref.season && row.episode === ref.number);
  if (byNumber && plausible(byNumber)) return byNumber;

  if (ref.absolute && ref.season > 0) {
    const byAbsolute = rows.find((row) => row.absolute === ref.absolute && row.season !== 0);
    if (byAbsolute && plausible(byAbsolute)) return byAbsolute;
  }

  if (!Number.isNaN(aired)) {
    const sameAiring = rows.filter((row) => row.airedAt !== null && Math.abs(row.airedAt - aired) <= SAME_AIRING_MS);
    if (sameAiring.length === 1) return sameAiring[0];
    // Several episodes released together: only the matching number can tell them apart.
    if (sameAiring.length > 1) return sameAiring.find((row) => row.episode === ref.number);
  }

  return undefined;
}

/* ── Public lookups ───────────────────────────────────────────────────────── */

interface ShowEntries {
  entries: ArmEntry[];
  seasonOf: (entry: ArmEntry) => number | null;
}

/**
 * @param expectAnime - Something else (e.g. Trakt's genre list) already says this is
 *   anime, which justifies asking by the less reliable ids when the first lookup is empty.
 */
async function findShowEntries(show: ShowIds, expectAnime: boolean): Promise<ShowEntries | undefined> {
  const tvdbSeason = (entry: ArmEntry) => entry.tvdbSeason;

  if (show.tvdb) {
    const entries = await lookupArm('thetvdb', show.tvdb);
    if (entries === undefined) return undefined;
    if (entries.length) return { entries, seasonOf: tvdbSeason };
  }

  if (show.tmdb && (expectAnime || !show.tvdb)) {
    const entries = await lookupArm('themoviedb', show.tmdb);
    if (entries === undefined) return undefined;
    // TMDB numbers series and movies separately, so a movie can share this id.
    const series = entries.filter((entry) => entry.media !== 'MOVIE');
    if (series.length) return { entries: series, seasonOf: (entry) => entry.tmdbSeason };
  }

  if (show.imdb && (expectAnime || (!show.tvdb && !show.tmdb))) {
    const entries = await lookupArm('imdb', show.imdb);
    if (entries === undefined) return undefined;
    if (entries.length) return { entries, seasonOf: tvdbSeason };
  }

  return { entries: [], seasonOf: tvdbSeason };
}

/** Locate the AniList entry (and episode) for an episode watched on a TV show. */
export async function resolveAnimeEpisode(
  show: ShowIds,
  ref: EpisodeRef,
  options: { expectAnime?: boolean } = {},
): Promise<AnimeLookup> {
  const found = await findShowEntries(show, options.expectAnime === true);
  if (!found) return { status: 'unknown' };
  if (found.entries.length === 0) return { status: 'not-anime' };

  const { seasonOf } = found;
  const mapped = found.entries.filter(
    (entry): entry is ArmEntry & { anilist: number } => entry.anilist !== null,
  );
  const isSeries = (entry: ArmEntry) => entry.media !== 'MOVIE';

  // Most likely first: entries that start the watched season, then entries that
  // span every season (long runners), then the show's other seasons.
  const sameSeason = mapped.filter((entry) => seasonOf(entry) === ref.season);
  const wholeSeries = mapped.filter((entry) => seasonOf(entry) === null && isSeries(entry));
  const otherSeasons = ref.season === 0
    ? []
    : mapped.filter((entry) => {
      const season = seasonOf(entry);
      return season !== null && season !== 0 && season !== ref.season && isSeries(entry);
    });
  const ranked = [...new Set([...sameSeason, ...wholeSeries, ...otherSeasons])];

  let special: number | undefined;
  for (const candidate of ranked.slice(0, MAX_EPISODE_TABLES_PER_LOOKUP)) {
    const rows = await loadEpisodeTable(candidate.anilist);
    if (rows === undefined) break; // service down: settle for a season-level answer

    const row = findEpisodeRow(rows, ref);
    if (!row) continue;
    if (row.number !== null) {
      return { status: 'matched', anilistId: candidate.anilist, episode: row.number, exact: true };
    }
    // Listed as an extra of this entry; keep looking for one that counts it as an episode.
    special ??= candidate.anilist;
  }
  if (special !== undefined) return { status: 'matched', anilistId: special, exact: true };

  const fallback = sameSeason.find(isSeries)
    ?? wholeSeries[0]
    ?? (ref.season > 0 ? mapped.find((entry) => entry.media === 'TV') : undefined);
  if (!fallback) return { status: 'unmapped' };

  return {
    status: 'matched',
    anilistId: fallback.anilist,
    exact: false,
    coversSeason: seasonOf(fallback) === ref.season,
  };
}

/** Locate the AniList entry for a watched movie. */
export async function resolveAnimeMovie(
  ids: { imdb?: string; tmdb?: number },
  options: { expectAnime?: boolean } = {},
): Promise<AnimeLookup> {
  let entries: ArmEntry[] = [];

  if (ids.imdb) {
    const byImdb = await lookupArm('imdb', ids.imdb);
    if (byImdb === undefined) return { status: 'unknown' };
    entries = byImdb;
  }

  if (!entries.length && ids.tmdb && (options.expectAnime || !ids.imdb)) {
    const byTmdb = await lookupArm('themoviedb', ids.tmdb);
    if (byTmdb === undefined) return { status: 'unknown' };
    // TMDB numbers series and movies separately; only a movie entry can be this film.
    entries = byTmdb.filter((entry) => entry.media === 'MOVIE');
  }

  if (!entries.length) return { status: 'not-anime' };

  const pick = entries.find((entry) => entry.anilist !== null && entry.media === 'MOVIE')
    ?? entries.find((entry) => entry.anilist !== null);
  return pick?.anilist != null
    ? { status: 'matched', anilistId: pick.anilist, exact: true }
    : { status: 'unmapped' };
}
