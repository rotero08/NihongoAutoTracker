/**
 * ── TTU Reader Storage ───────────────────────────────────────────────────────
 *
 * Storage items specific to the TTU (ッツ) ebook reader integration.
 * Manages the character count history and manual media link associations.
 *
 * These are used by the text-tracker content script and the popup's
 * reading queue display.
 */

import { storage } from 'wxt/utils/storage';
import type { TTUHistorySession, TTULinkedBook } from '../types';

/**
 * Tracks session history for each book in the TTU reader.
 * Keyed by book title → array of session logs.
 *
 * Each session records the time, chars, and date so the user can
 * review or delete individual sessions from the chronometer panel.
 */
export const ttuHistoryStorage = storage.defineItem<Record<string, TTUHistorySession[]>>(
  'local:ttuHistory',
  { fallback: {} },
);

/**
 * Manual book-to-media associations created by the user.
 * Keyed by book title → { mediaId, mediaData, volume }.
 *
 * When a user links a TTU book to an AniList entry, this ensures
 * the association is remembered even if the queue is cleared.
 */
export const ttuLinkStorage = storage.defineItem<Record<string, TTULinkedBook>>(
  'local:ttuLinks',
  { fallback: {} },
);
