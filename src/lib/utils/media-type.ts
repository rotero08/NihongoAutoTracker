/**
 * ── Watched-media Types ──────────────────────────────────────────────────────
 *
 * NihongoTracker files watched media under three log types. Its search
 * endpoint spells one of them differently (`tv_show`), and stored queue items
 * may carry either spelling, so every conversion goes through here.
 */

import type { WatchLogType } from '@/lib/types';

/** Type parameter accepted by NihongoTracker's media search. */
export type WatchSearchType = 'anime' | 'movie' | 'tv_show';

export const WATCH_LOG_TYPES: ReadonlyArray<{ value: WatchLogType; label: string }> = [
  { value: 'anime', label: 'Anime' },
  { value: 'tv show', label: 'TV Show' },
  { value: 'movie', label: 'Movie' },
];

export function normalizeLogType(value: unknown, fallback: WatchLogType = 'anime'): WatchLogType {
  const normalized = String(value ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (normalized === 'anime') return 'anime';
  if (normalized === 'movie') return 'movie';
  if (normalized === 'tv show' || normalized === 'tv') return 'tv show';
  return fallback;
}

export function toSearchType(logType: unknown): WatchSearchType {
  const type = normalizeLogType(logType);
  return type === 'tv show' ? 'tv_show' : type;
}

export function getLogTypeLabel(logType: unknown): string {
  const type = normalizeLogType(logType);
  return WATCH_LOG_TYPES.find((option) => option.value === type)!.label;
}
