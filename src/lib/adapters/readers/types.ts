/**
 * ── Reader Adapter Interface ─────────────────────────────────────────────────
 *
 * Defines the contract that all reader site adapters must implement.
 * This abstraction layer makes it trivial to add support for new
 * reading applications — just create a new file implementing ReaderAdapter.
 *
 * The text-tracker content script uses these adapters to detect the
 * active reader, extract character counts, and find UI insertion points.
 */

import type { TrackerConfig } from '../../types';

/**
 * Interface for reader site adapters.
 *
 * Each supported reading application (TTU, Yatsu, Manabe, future sites)
 * implements this interface to provide site-specific extraction logic
 * while sharing the common tracking infrastructure.
 */
export interface ReaderAdapter {
  /** Human-readable name of the reader (e.g., "TTU Reader") */
  readonly name: string;

  /** The hostname this adapter handles (e.g., "reader.ttsu.app") */
  readonly hostname: string;

  /**
   * Check if this reader is enabled in the user's configuration.
   * Returns false if the user has disabled tracking for this reader.
   */
  isEnabled(config: TrackerConfig): boolean;

  /**
   * Find the DOM element where the overlay should be inserted.
   *
   * @returns Object with the target element and insert position,
   *          or null if no suitable insertion point was found.
   */
  findInsertPoint(): { el: Element; pos: InsertPosition } | null;

  /**
   * Extract the current character count from the reader's UI.
   *
   * The interpretation varies by reader:
   * - TTU: characters read (from progress bar)
   * - Yatsu: characters read (from stats)
   * - Manabe: pages read (character proxy)
   *
   * @returns Character count or null if not available
   */
  extractCharCount(): number | null;

  /**
   * Get the current book/content title from the reader.
   * Falls back to document.title if reader-specific extraction fails.
   */
  getTitle(): string;
}

/**
 * Registry of all available reader adapters.
 * Used by the text-tracker to select the correct adapter at runtime.
 */
export type ReaderAdapterRegistry = ReaderAdapter[];
