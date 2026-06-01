/**
 * ── Shared Constants ─────────────────────────────────────────────────────────
 *
 * Central repository for all magic strings, default lists, and regex patterns
 * used across the extension. Importing from here eliminates duplication and
 * ensures consistent behavior between content scripts, popup, and settings.
 */

/* ── Storage Keys (Task 5) ── */
export const THEME_CACHE_KEY = 'nta-theme-cache' as const;
export const FONT_CACHE_KEY = 'nta-font-cache' as const;
export const CUSTOM_COLORS_CACHE_KEY = 'nta-custom-colors-cache' as const;
export const ACTIVE_SETTINGS_TAB_KEY = 'local:activeSettingsTab' as const;

/* ── Host lists ───────────────────────────────────────────────────────────── */

/**
 * Hosts that should always skip the reading overlay.
 * These are video/streaming sites or internal tools where
 * showing a reading timer makes no sense.
 */
export const SKIP_HOSTS_DEFAULT = [
  'youtube.com',
  'youtu.be',
  'crunchyroll.com',
  'animekai.to',
  'music.youtube.com',
  'nihongotracker.app',
  'mail.google.com',
  'mail.proton.me',
] as const;

/**
 * Domains commonly hosting Japanese content.
 * Used as the default "Allow" list for the reading overlay —
 * the overlay is shown immediately without auto-detection.
 */
export const JP_DOMAINS_DEFAULT = [
  'nhk.or.jp', 'nhk.jp', 'news.yahoo.co.jp', 'yomiuri.co.jp', 'asahi.com',
  'mainichi.jp', 'nikkei.com', 'tokyoreporter.com', 'watanoc.com',
  'aozora.gr.jp', 'syosetu.com', 'kakuyomu.jp', 'pixiv.net', 'nicovideo.jp',
  'comic-walker.com', 'manga-raw.club', 'jisho.org', 'wanikani.com',
  'bunpro.jp', 'satorireader.com',
] as const;

/**
 * Hosts for supported ebook reader applications.
 * Each host maps to a reader adapter in lib/adapters/readers/.
 */
export const TTU_HOSTS = [
  'reader.ttsu.app',
  'app.yatsu.moe',
  'manga.manabe.es',
] as const;

/**
 * Full built-in allow list (JP domains + reader hosts).
 * Used as the default value for `config.allowSites`.
 */
export const BUILT_IN_ALLOW = [
  ...JP_DOMAINS_DEFAULT,
  'reader.ttsu.app',
  'app.yatsu.moe',
  'manga.manabe.es',
] as const;

/**
 * Full built-in skip list.
 * Used as the default value for `config.skipSites`.
 */
export const BUILT_IN_SKIP = [...SKIP_HOSTS_DEFAULT] as const;

/* ── Regex patterns ───────────────────────────────────────────────────────── */

/**
 * Matches any Japanese character: Hiragana, Katakana, CJK Unified Ideographs.
 * Global flag — use with `.match()` to get all matches.
 */
export const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff]/g;

/**
 * Stricter version matching Hiragana, Katakana, all CJK ranges, and
 * half-width Katakana. Used by the background script for text selection filtering.
 */
export const JP_ALL_RE = /[^\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g;

/* ── Title parsing regexes ────────────────────────────────────────────────── */

/**
 * Default regex rules for extracting book title and volume number
 * from document titles. These are evaluated top-to-bottom; the first
 * match wins.
 *
 * Each rule's `re` string has capture groups:
 *   - Group 1: title
 *   - Group 2: volume number (optional)
 */
export const DEFAULT_TITLE_REGEXES = [
  { desc: "YomiYasu Prefix (e.g., 'YomiYasu - Title 1')", re: "^YomiYasu\\s*-\\s*(.*?)\\s+(?:v|vol|第)?(\\d+)" },
  { desc: "Publisher/Label Trailing (e.g., 'Title 18 (MFブックス)')", re: "^(.*?)\\s+(?:v|vol|第)?(\\d+)\\s*(?:巻)?\\s*\\([^)]+\\)$" },
  { desc: "Volume Format 第X巻 (e.g., 'Title 第2巻')", re: "^(.*?)\\s+第(\\d+)巻$" },
  { desc: "Volume Format vX (e.g., 'Title v1')", re: "^(.*?)\\s+v(\\d+)$" },
  { desc: "Standard Space Number (e.g., 'Title 1')", re: "^(.*?)\\s+(\\d+)$" },
] as const;

/* ── Dynamic Extension Version & User Agent ── */
export function getExtensionVersion(): string {
  try {
    const api = typeof globalThis !== 'undefined' && ((globalThis as any).browser || (globalThis as any).chrome);
    return api?.runtime?.getManifest()?.version || '4.0.3';
  } catch {
    return '4.0.3';
  }
}

export const USER_AGENT = `NihongoAutoTracker/${getExtensionVersion()}`;
