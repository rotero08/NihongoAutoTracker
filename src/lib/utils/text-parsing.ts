/**
 * ── Text & Title Parsing Utilities ───────────────────────────────────────────
 *
 * Functions for extracting structured data (title, volume number) from
 * document titles and cleaning video titles.
 */

import { DEFAULT_TITLE_REGEXES } from '../constants';

/**
 * Unified parsing function shared consistently across popup UI, settings tab,
 * and content script tracker (Task 8).
 *
 * @param rawTitle - The raw document title from the browser tab
 * @param regexRules - Optional user-defined regex rules from configuration
 * @returns Object with `query` (clean title) and `volume` (number or undefined)
 */
export function parseDocumentTitle(
  rawTitle: string,
  regexRules?: Array<{ desc: string; re: string }>
): { query: string; volume: number | undefined } {
  let cleaned = rawTitle
    .replace(/\s*\|\s*(ッツ Ebook Reader|Yatsu Reader|YomiYasu Reader)\s*/i, '')
    .replace(/^YomiYasu\s*-\s*/i, '')
    .trim();

  /* Pure numeric titles are treated as-is (e.g., chapter numbers) */
  if (/^\d+$/.test(cleaned)) {
    return { query: cleaned, volume: undefined };
  }

  let title = cleaned;
  let volume: number | undefined = undefined;

  // 1. Try regex rules (custom or default)
  const rules = regexRules ?? DEFAULT_TITLE_REGEXES;
  for (const item of rules) {
    try {
      const regex = new RegExp(item.re, 'i');
      const match = cleaned.match(regex);
      if (match && match[1]) {
        title = match[1].trim();
        if (match[2]) {
          volume = parseInt(match[2], 10);
        }
        return { query: title, volume };
      }
    } catch (_e) {
      /* Invalid regex — skip silently */
    }
  }

  // 2. Try explicit volume patterns (e.g., "Title vol.3", "Title 第4巻", "Title v2")
  const volMatch = cleaned.match(/^(.*?)[\s\-_]+(?:vol(?:ume)?\.?\s*|v|第)?(\d+)\s*(?:巻|話|章)?$/i);
  if (volMatch && volMatch[1].trim().length > 0 && !/^\d+$/.test(volMatch[1].trim())) {
    title = volMatch[1].trim();
    volume = parseInt(volMatch[2], 10);
    return { query: title, volume };
  }

  // 3. Fallback: match any trailing number after text content
  const trailingDigitsMatch = cleaned.match(/^(.*?[a-zA-Z\u3040-\u30ff\u4e00-\u9fff]+.*?)(\d+)$/);
  if (trailingDigitsMatch) {
    title = trailingDigitsMatch[1].trim();
    volume = parseInt(trailingDigitsMatch[2], 10);
  }

  return { query: title, volume };
}

/**
 * Convenience wrapper parsing title with custom regex configuration (Task 8).
 */
export function parseTitle(
  docTitle: string,
  customRegexes?: Array<{ desc: string; re: string }>,
): { query: string; volume: number | undefined } {
  return parseDocumentTitle(docTitle, customRegexes);
}

/**
 * Convenience wrapper matching standard parsing logic for user interfaces (Task 8).
 */
export function parseTitleForUI(docTitle: string): { query: string; volume: number | undefined } {
  return parseDocumentTitle(docTitle);
}

/**
 * Clean up a video title by removing YouTube-specific prefixes/suffixes.
 */
export function stripVideoTitle(title: string): string {
  return title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .trim();
}

/**
 * HTML-escape a string to prevent XSS in innerHTML assignments.
 */
export function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}
