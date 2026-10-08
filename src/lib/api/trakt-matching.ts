/**
 * ── Trakt → NihongoTracker Matching ──────────────────────────────────────────
 *
 * Decides what a watched Trakt item is — anime, TV show or movie — and which
 * NihongoTracker catalogue entry it corresponds to.
 *
 * Identity comes from ids wherever one exists, because titles are ambiguous
 * (the live-action "Alice in Borderland" shares its title with an anime OVA,
 * and several dramas are simply called "First Love"):
 *
 *   anime      → an AniList entry, through the anime id mapping
 *   TV / movie → NihongoTracker's TMDB-keyed entries (`s<id>` / `m<id>`)
 *
 * Title search is the fallback, and only an exact title is accepted. The one
 * exception is anime that Trakt itself tags as anime: AniList names seasons
 * ("… 2nd Season") differently enough that the top hit is the best available.
 */

import { fetchAniListMedia, resolveSequelCascade } from '@/lib/api/anilist';
import { resolveAnimeEpisode, resolveAnimeMovie } from '@/lib/api/anime-mapping';
import { fetchMediaById, searchMedia, type MediaSearchResult } from '@/lib/api/nihongotracker';
import { addDebugLog } from '@/lib/storage/debug';
import type { AnimeMediaData, WatchLogType } from '@/lib/types';
import { normalizeLogType, toSearchType, type WatchSearchType } from '@/lib/utils/media-type';

/* ── Trakt payload shapes (the fields this module reads) ──────────────────── */

interface TraktIds {
  tvdb?: number | null;
  tmdb?: number | null;
  imdb?: string | null;
}

interface TraktMedia {
  title?: string;
  original_title?: string;
  year?: number;
  ids?: TraktIds;
  genres?: string[];
  language?: string;
  runtime?: number;
}

export interface TraktEpisode {
  season?: number;
  number?: number;
  number_abs?: number | null;
  title?: string;
  ids?: TraktIds;
  first_aired?: string | null;
  runtime?: number;
}

export interface TraktHistoryItem {
  id: number | string;
  watched_at: string;
  type: string;
  show?: TraktMedia;
  episode?: TraktEpisode;
  movie?: TraktMedia;
}

export interface TraktMatch {
  logType: WatchLogType;
  /** Absent when nothing in the catalogue could be identified with confidence. */
  mediaData?: AnimeMediaData;
  /** Episode number within the matched media. */
  episode?: number;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const positiveInt = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

const isTaggedAnime = (media: TraktMedia | undefined): boolean =>
  Array.isArray(media?.genres) && media.genres.some((genre) => String(genre).toLowerCase() === 'anime');

function toMediaData(media: MediaSearchResult, type: WatchLogType): AnimeMediaData {
  return {
    contentId: media.contentId,
    contentTitleNative: media.contentTitleNative,
    contentTitleEnglish: media.contentTitleEnglish,
    contentTitleRomaji: media.contentTitleRomaji,
    contentImage: media.contentImage,
    coverImage: media.coverImage,
    type: normalizeLogType(media.type, type),
    episodes: media.episodes ?? undefined,
    episodeDuration: media.episodeDuration ?? undefined,
    runtime: media.runtime ?? undefined,
    isAdult: media.isAdult,
  };
}

/** Case-, accent- and punctuation-insensitive form of a title, in any script. */
export function normalizeTitle(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function hasExactTitle(media: MediaSearchResult, wanted: string[]): boolean {
  const titles = [
    media.contentTitleNative,
    media.contentTitleEnglish,
    media.contentTitleRomaji,
    ...(Array.isArray(media.synonyms) ? media.synonyms : []),
  ].map(normalizeTitle).filter(Boolean);
  return titles.some((title) => wanted.includes(title));
}

/**
 * @param lenient - Accept the top hit of the first query when no title matches
 *   exactly. Only safe when the media type is already known for certain.
 */
async function searchByTitle(
  titles: Array<string | undefined>,
  type: WatchSearchType,
  lenient: boolean,
): Promise<MediaSearchResult | undefined> {
  const queries = titles.filter((title): title is string => !!title && title.trim().length > 0);
  const wanted = queries.map(normalizeTitle).filter(Boolean);
  if (wanted.length === 0) return undefined;

  for (const [index, query] of queries.entries()) {
    const results = await searchMedia({ search: query, type, perPage: 8 });
    const exact = results.find((result) => hasExactTitle(result, wanted));
    if (exact) return exact;
    if (lenient && index === 0 && results[0]) return results[0];
  }
  return undefined;
}

/**
 * Live-action catalogue entries are keyed by TMDB id, the same id Trakt reports.
 */
async function findCatalogueMedia(
  type: 'tv show' | 'movie',
  tmdbId: number | undefined,
  titles: Array<string | undefined>,
): Promise<AnimeMediaData | undefined> {
  if (tmdbId) {
    try {
      const byId = await fetchMediaById(type, `${type === 'movie' ? 'm' : 's'}${tmdbId}`);
      // A miss is final: whatever a title search finds would be a different production.
      return byId ? toMediaData(byId, type) : undefined;
    } catch (err) {
      await addDebugLog('WARN', 'Stremio', `Catalogue lookup failed for ${type} ${tmdbId}; falling back to its title`, err);
    }
  }

  const byTitle = await searchByTitle(titles, toSearchType(type), false);
  return byTitle ? toMediaData(byTitle, type) : undefined;
}

/**
 * Recap episodes are numbered by TV databases but are not episodes on AniList.
 * When counting episodes ourselves (no per-episode mapping), every recap watched
 * earlier in the same show shifts the number down by one.
 */
function adjustEpisodeForRecaps(history: TraktHistoryItem[], current: TraktHistoryItem, episode: number): number {
  const showTitle = current.show?.title;
  if (!showTitle) return episode;

  const watchedAt = new Date(current.watched_at).getTime();
  const recapsBefore = history.filter((item) => {
    if (item.type !== 'episode' || item.show?.title !== showTitle) return false;
    if (new Date(item.watched_at).getTime() >= watchedAt) return false;
    const title = (item.episode?.title || '').toLowerCase();
    return title.includes('recap') || title.includes('summary') || title.includes('review') || title.includes('総集編');
  }).length;

  return Math.max(1, episode - recapsBefore);
}

async function matchAnimeByTitle(title: string, season: number, episode: number): Promise<TraktMatch | undefined> {
  const queries = season > 1 ? [`${title} Season ${season}`, title] : [title];
  const base = await searchByTitle(queries, 'anime', true);
  const baseId = Number(base?.contentId);
  if (!base || !Number.isInteger(baseId)) return undefined;

  const { targetId, targetEpisode } = await resolveSequelCascade(baseId, episode);
  const mediaData = (await fetchAniListMedia(targetId))
    ?? (targetId === baseId ? toMediaData(base, 'anime') : undefined);
  return mediaData ? { logType: 'anime', mediaData, episode: targetEpisode } : undefined;
}

/* ── Public API ───────────────────────────────────────────────────────────── */

export async function matchTraktEpisode(
  item: TraktHistoryItem,
  history: TraktHistoryItem[] = [],
): Promise<TraktMatch> {
  const show = item.show ?? {};
  const episode = item.episode ?? {};
  const title = show.title ?? '';
  // Season 0 (specials) is a real season; only a missing value defaults to 1.
  const season = Number.isInteger(episode.season) ? (episode.season as number) : 1;
  const number = positiveInt(episode.number) ?? 1;
  const absolute = positiveInt(episode.number_abs);
  const taggedAnime = isTaggedAnime(show);

  const lookup = await resolveAnimeEpisode(
    { tvdb: positiveInt(show.ids?.tvdb), tmdb: positiveInt(show.ids?.tmdb), imdb: show.ids?.imdb || undefined },
    {
      season,
      number,
      absolute,
      tvdbEpisodeId: positiveInt(episode.ids?.tvdb),
      firstAired: episode.first_aired || undefined,
    },
    { expectAnime: taggedAnime },
  );

  if (lookup.status === 'matched') {
    let anilistId = lookup.anilistId;
    let matchedEpisode = lookup.episode ?? number;

    if (!lookup.exact) {
      // Only the entry that opens the season (or the whole series) is known:
      // count forward from it, rolling over into its sequels.
      const startEpisode = lookup.coversSeason ? number : absolute ?? number;
      const cascade = await resolveSequelCascade(anilistId, adjustEpisodeForRecaps(history, item, startEpisode));
      anilistId = cascade.targetId;
      matchedEpisode = cascade.targetEpisode;
    }

    const mediaData = await fetchAniListMedia(anilistId);
    if (mediaData) return { logType: 'anime', mediaData, episode: matchedEpisode };
  }

  // The id mapping listing the show is as good a sign of anime as Trakt's genre tag.
  if (taggedAnime || lookup.status === 'matched' || lookup.status === 'unmapped') {
    const byTitle = await matchAnimeByTitle(title, season, adjustEpisodeForRecaps(history, item, number));
    return byTitle ?? { logType: 'anime', episode: number };
  }

  const mediaData = await findCatalogueMedia('tv show', positiveInt(show.ids?.tmdb), [title, show.original_title]);
  return { logType: 'tv show', mediaData, episode: number };
}

export async function matchTraktMovie(item: TraktHistoryItem): Promise<TraktMatch> {
  const movie = item.movie ?? {};
  const tmdbId = positiveInt(movie.ids?.tmdb);

  const lookup = await resolveAnimeMovie(
    { imdb: movie.ids?.imdb || undefined, tmdb: tmdbId },
    { expectAnime: isTaggedAnime(movie) },
  );
  if (lookup.status === 'matched') {
    const mediaData = await fetchAniListMedia(lookup.anilistId);
    if (mediaData) return { logType: 'anime', mediaData };
  }

  // Animated or not, the film itself is in the movie catalogue under its TMDB id.
  const mediaData = await findCatalogueMedia('movie', tmdbId, [movie.title, movie.original_title]);
  return { logType: 'movie', mediaData };
}
