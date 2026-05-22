/**
 * ── Video Badge Configuration ───────────────────────────────────────────────
 *
 * Configuration and helpers for the NT status badge injected on YouTube
 * video players. The badge shows watched time and provides access to the
 * manual log modal.
 *
 * The actual badge DOM is still created in video-tracker.content.ts
 * because it requires tight integration with the video element's play/pause
 * state and YouTube's dynamic DOM. This module provides:
 *
 * - Badge HTML template generation (themeable)
 * - Badge visibility logic helpers
 * - CSS class names as constants (prevents magic strings)
 *
 * ── Future Extensibility ──
 * To add per-site badge styling (e.g., different position on Crunchyroll),
 * extend `getBadgeConfig()` to accept a site identifier.
 */

import type { UITheme } from './types';
import { DEFAULT_THEME } from './types';

/* ── CSS class constants (prevent magic strings in content script) ── */
export const BADGE_ID = 'nt-status-badge';
export const BADGE_TIME_CLASS = 'nt-time-label';
export const BADGE_LOGO_CLASS = 'nt-badge-logo';
export const BADGE_CONTAINER_CLASS = 'nt-badge-container';

/** Configuration for badge visibility based on user settings */
export interface BadgeVisibilityConfig {
  hideButtons?: boolean;
  hideIfNotJapanese?: boolean;
  hideMusic?: boolean;
}

/**
 * Determine whether the badge should be visible based on user settings
 * and the current page context.
 *
 * @param cfg - User's visibility preferences from config storage
 * @param isJapanese - Whether the current video is likely Japanese
 * @param isMusicVideo - Whether the current video is a music video
 * @returns true if the badge should be hidden
 */
export function shouldHideBadge(
  cfg: BadgeVisibilityConfig,
  isJapanese: boolean,
  isMusicVideo: boolean,
): boolean {
  return !!cfg.hideButtons
    || (!!cfg.hideIfNotJapanese && !isJapanese)
    || (!!cfg.hideMusic && isMusicVideo);
}

/**
 * Generate the inner HTML for the NT status badge.
 *
 * @param logoSvgHtml - Inline SVG string for the NT logo
 * @param initialTime - Initial time display text (e.g., "00:00")
 * @param theme - Optional theme override
 * @returns HTML string ready for `badge.innerHTML = ...`
 */
export function createBadgeInnerHTML(
  logoSvgHtml: string,
  initialTime: string = '00:00',
  _theme: UITheme = DEFAULT_THEME,
): string {
  return `
    <span class="${BADGE_LOGO_CLASS}">${logoSvgHtml}</span>
    <span class="${BADGE_TIME_CLASS}">${initialTime}</span>
  `;
}
