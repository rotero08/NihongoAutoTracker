/**
 * ── Japanese Language Detection Utilities ─────────────────────────────────────
 *
 * Helpers for detecting whether page content or metadata is Japanese.
 */

import { JP_RE } from '../constants';

/**
 * Check if a page contains enough Japanese text to warrant showing the overlay.
 * Unlike isLikelyJapanese() which is YouTube-specific, this works on any page.
 *
 * Detection strategy:
 * 1. Check allow-list → instant yes
 * 2. If allowListOnly → instant no (skip auto-detection)
 * 3. Check `<html lang="ja">` → yes
 * 4. Wait 1.5s for page load, then sample body text for ≥40 JP characters
 *
 * @param config - Current tracker configuration
 * @param allowSitesDefault - Default allow list to use if config has none
 */
export async function isJapanesePage(
  config: { allowSites?: string[]; allowListOnly?: boolean },
  allowSitesDefault: readonly string[],
): Promise<boolean> {
  const host = window.location.hostname;
  const allowSites: string[] = config.allowSites ?? [...allowSitesDefault];
  const allowListOnly: boolean = config.allowListOnly ?? false;

  /* Allow-listed domains always show the overlay */
  if (allowSites.some((d: string) => host.includes(d))) return true;

  /* If strict mode, only allow-listed sites pass */
  if (allowListOnly) return false;

  /* Check the HTML lang attribute */
  const lang = document.documentElement.lang;
  if (lang.startsWith('ja')) return true;

  /* Wait for page content to load, then sample body text */
  await new Promise((r) => setTimeout(r, 1500));
  const sample = (document.body?.textContent ?? '').slice(0, 8000);
  const jpCount = (sample.match(JP_RE) ?? []).length;
  return jpCount >= 40;
}
