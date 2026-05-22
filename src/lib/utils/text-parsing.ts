/**
 * ── Text & Title Parsing Utilities ───────────────────────────────────────────
 *
 * Functions for extracting structured data (title, volume number) from
 * document titles and cleaning video titles. Previously duplicated across
 * text-tracker.content.ts, popup/main.ts, and settings/main.ts.
 */

import { DEFAULT_TITLE_REGEXES } from '../constants';

/**
 * Parse a book/reader document title to extract the clean title and volume number.
 *
 * Tries each regex in the provided rules array (or the defaults) from top to bottom.
 * The first successful match wins. Falls back to a generic "title + trailing number" pattern.
 *
 * @param docTitle - The raw document title from the browser tab
 * @param customRegexes - Optional user-defined regex rules from config
 * @returns Object with `query` (clean title) and `volume` (number or undefined)
 *
 * @example parseTitle("転スラ 3") → { query: "転スラ", volume: 3 }
 * @example parseTitle("YomiYasu - 転スラ v2") → { query: "転スラ", volume: 2 }
 */
export function parseTitle(
  docTitle: string,
  customRegexes?: Array<{ desc: string; re: string }>,
): { query: string; volume: number | undefined } {
  let title = docTitle;
  let volume: number | undefined = undefined;

  /* Pure numeric titles are treated as-is (e.g., chapter numbers) */
  if (/^\d+$/.test(docTitle)) return { query: docTitle, volume: undefined };

  /* Try user-defined or default regex rules in priority order */
  const regexes = customRegexes ?? DEFAULT_TITLE_REGEXES;
  for (const item of regexes) {
    try {
      const regex = new RegExp(item.re, 'i');
      const match = docTitle.match(regex);
      if (match && match[1]) {
        title = match[1].trim();
        if (match[2]) volume = parseInt(match[2], 10);
        return { query: title, volume };
      }
    } catch (_e) {
      /* Invalid regex — skip silently */
    }
  }

  /* Fallback: match any trailing number after text content */
  const fallback = docTitle.match(/^(.*?[a-zA-Z\u3040-\u30ff\u4e00-\u9fff]+.*?)(\d+)$/);
  if (fallback) {
    title = fallback[1].trim();
    volume = parseInt(fallback[2], 10);
  }
  return { query: title, volume };
}

/**
 * Parse a reader document title, first stripping known reader app suffixes.
 * This is a convenience wrapper around parseTitle for the popup/settings context.
 *
 * @param docTitle - Raw title from reader tab
 * @returns Object with `query` (clean title) and `volume` (number or undefined)
 */
export function parseTitleForUI(docTitle: string): { query: string; volume: number | undefined } {
  let base = docTitle
    .replace(/\s*\|\s*(ッツ Ebook Reader|Yatsu Reader|Manabe Reader)\s*/i, '')
    .trim();
  let title = base;
  let volume: number | undefined = undefined;

  if (/^\d+$/.test(base)) return { query: base, volume: undefined };

  /* Try standard volume patterns first */
  const volMatch = base.match(/^(.*?)[\s\-_]+(?:vol(?:ume)?\.?\s*|v|第)?(\d+)\s*(?:巻|話|章)?$/i);
  if (volMatch && volMatch[1].trim().length > 0 && !/^\d+$/.test(volMatch[1].trim())) {
    title = volMatch[1].trim();
    volume = parseInt(volMatch[2], 10);
  } else {
    const match2 = base.match(/^(.*?[a-zA-Z\u3040-\u30ff\u4e00-\u9fff]+.*?)(\d+)$/);
    if (match2) {
      title = match2[1].trim();
      volume = parseInt(match2[2], 10);
    }
  }
  return { query: title, volume };
}

/**
 * Clean up a video title by removing YouTube-specific prefixes/suffixes.
 *
 * Strips:
 * - Leading "(N) " notification counts
 * - Trailing " - YouTube" suffix
 *
 * @example stripVideoTitle("(3) 日本語動画 - YouTube") → "日本語動画"
 */
export function stripVideoTitle(title: string): string {
  return title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .trim();
}

/**
 * HTML-escape a string to prevent XSS in innerHTML assignments.
 * Only escapes the characters that matter for HTML content context.
 */
export function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}
