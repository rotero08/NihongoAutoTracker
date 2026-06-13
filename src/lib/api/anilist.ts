/**
 * ── AniList Search Wrapper ───────────────────────────────────────────────────
 *
 * Provides a unified interface for searching AniList media through the
 * NihongoTracker proxy API. Used by the popup and settings queue items
 * to link reading entries to AniList manga/novel records.
 */

import { searchMedia } from './nihongotracker';

/** Base URL for the NT API's AniList search proxy */
const ANILIST_SEARCH_URL = 'https://nihongotracker.app/api/media/anilist/search';

/** Shape of an individual AniList search result */
export interface AniListSearchResult {
  contentId: string | number;
  title?: {
    contentTitleNative?: string;
    contentTitleEnglish?: string;
    contentTitleRomaji?: string;
  };
  contentTitleNative?: string;
  contentTitleEnglish?: string;
  contentTitleRomaji?: string;
  coverImage?: string;
  contentImage?: string;
  chapters?: number;
  volumes?: number;
}

/**
 * Search AniList for manga/novel entries matching a query string.
 *
 * Uses the NihongoTracker proxy to avoid CORS issues and rate limits.
 * The proxy requires the user's NT API key for authentication.
 *
 * @param query - Search term (typically a Japanese book title)
 * @param perPage - Number of results to return (default 5)
 * @returns Array of search results, or empty array on failure
 */
export async function searchAniList(query: string, perPage = 5): Promise<AniListSearchResult[]> {
  try {
    return await searchMedia({ search: query, type: 'novel', perPage }) as AniListSearchResult[];
  } catch {
    return [];
  }
}