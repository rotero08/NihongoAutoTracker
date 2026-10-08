/**
 * ── AniList Access ───────────────────────────────────────────────────────────
 *
 * Two ways in:
 *  - title search goes through NihongoTracker's proxy (no CORS or key needed),
 *  - lookups by id go straight to AniList's public GraphQL endpoint, which is
 *    rate limited — every entry is therefore fetched once and reused.
 */

import { addDebugLog } from '../storage/debug';
import type { AnimeMediaData } from '../types';
import { fetchWithTimeout, sleep } from '../utils/net';
import { searchMedia, type MediaSearchResult } from './nihongotracker';

/** Shape of an individual search result */
export type AniListSearchResult = MediaSearchResult;

/**
 * Search AniList for manga/novel entries matching a query string.
 *
 * Uses the NihongoTracker proxy to avoid CORS issues and rate limits.
 *
 * @param query - Search term (typically a Japanese book title)
 * @param perPage - Number of results to return (default 5)
 * @returns Array of search results, or empty array on failure
 */
export async function searchAniList(query: string, perPage = 5): Promise<AniListSearchResult[]> {
  try {
    return await searchMedia({ search: query, type: 'novel', perPage });
  } catch (err) {
    await addDebugLog('WARN', 'AniList', 'Search failed', err);
    return [];
  }
}

/* ── Lookups by id ────────────────────────────────────────────────────────── */

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const MAX_RATE_LIMIT_WAIT_SECS = 60;
const MAX_CASCADE_HOPS = 12;

interface AniListRelatedNode {
  id: number;
  type: string;
  status: string;
  format: string;
  episodes: number | null;
}

interface AniListEntry {
  media: AnimeMediaData;
  episodes: number | null;
  status: string;
  sequels: AniListRelatedNode[];
}

const MEDIA_QUERY = `
  query ($id: Int) {
    Media (id: $id, type: ANIME) {
      id
      title { native romaji english }
      coverImage { large }
      description
      episodes
      duration
      status
      relations {
        edges {
          relationType
          node { id type status format episodes }
        }
      }
    }
  }
`;

/** Entries already fetched (or being fetched); failures are not kept. */
const entryRequests = new Map<number, Promise<AniListEntry | null>>();

async function requestEntry(id: number): Promise<AniListEntry | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchWithTimeout(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: MEDIA_QUERY, variables: { id } }),
    });

    if (res.status === 429 && attempt === 0) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 30;
      await sleep(Math.min(MAX_RATE_LIMIT_WAIT_SECS, retryAfter) * 1000);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`AniList responded ${res.status}`);

    const media = (await res.json())?.data?.Media;
    if (!media) return null;

    const sequels: AniListRelatedNode[] = (media.relations?.edges ?? [])
      .filter((edge: any) => edge?.relationType === 'SEQUEL' && edge.node?.type === 'ANIME')
      .map((edge: any) => edge.node);

    return {
      media: {
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
      },
      episodes: media.episodes ?? null,
      status: media.status,
      sequels,
    };
  }
  throw new Error('AniList rate limit exceeded');
}

function getEntry(id: number): Promise<AniListEntry | null> {
  let request = entryRequests.get(id);
  if (!request) {
    request = requestEntry(id).catch(async (err) => {
      entryRequests.delete(id);
      await addDebugLog('WARN', 'AniList', `Lookup of entry ${id} failed`, err);
      return null;
    });
    entryRequests.set(id, request);
  }
  return request;
}

/** Media details for an AniList anime id, or undefined when unavailable. */
export async function fetchAniListMedia(id: number): Promise<AnimeMediaData | undefined> {
  return (await getEntry(id))?.media;
}

const SEQUEL_FORMAT_PRIORITY: Record<string, number> = { TV: 1, ONA: 1, TV_SHORT: 2, OVA: 3, MOVIE: 4 };

/**
 * Walk the sequel chain: episode 15 of an entry that only has 12 episodes is
 * episode 3 of its sequel. Used when no per-episode mapping is available.
 */
export async function resolveSequelCascade(
  startId: number,
  episode: number,
): Promise<{ targetId: number; targetEpisode: number }> {
  let targetId = startId;
  let targetEpisode = episode;

  for (let hop = 0; hop < MAX_CASCADE_HOPS; hop++) {
    const entry = await getEntry(targetId);
    if (!entry) break;

    // A show that is still airing with no released sequel has nowhere to roll over to.
    const hasReleasedSequel = entry.sequels.some((s) => s.status === 'FINISHED' || s.status === 'RELEASING');
    if (entry.status === 'RELEASING' && !hasReleasedSequel) break;

    const total = entry.episodes || 0;
    if (total === 0 || targetEpisode <= total) break;

    const next = [...entry.sequels].sort(
      (a, b) => (SEQUEL_FORMAT_PRIORITY[a.format] ?? 5) - (SEQUEL_FORMAT_PRIORITY[b.format] ?? 5),
    )[0];
    if (!next) break;

    targetEpisode -= total;
    targetId = next.id;
  }

  return { targetId, targetEpisode };
}
