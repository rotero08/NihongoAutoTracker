/**
 * ── Configuration Storage ────────────────────────────────────────────────────
 *
 * Manages the global extension configuration persisted in browser.storage.local.
 * This is the single source of truth for all user preferences including
 * API keys, thresholds, toggle states, site lists, and reader settings.
 *
 * Uses WXT's storage API which provides reactive watchers and type safety.
 */

import { storage } from 'wxt/utils/storage';
import type { TrackerConfig } from '../types';

/**
 * The main extension config stored under the key "local:config".
 * All settings pages, content scripts, and the background script read from this.
 *
 * Default is an empty object — individual components check for specific
 * properties and fall back to sensible defaults (see TrackerConfig interface).
 */
export const configStorage = storage.defineItem<TrackerConfig>('local:config', {
  fallback: {},
});
