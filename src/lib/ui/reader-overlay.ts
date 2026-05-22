/**
 * ── Reader Overlay Styles ───────────────────────────────────────────────────
 *
 * CSS for the reading chronometer overlay injected by the text-tracker
 * content script on Japanese reading sites (TTU, Yatsu, Manabe, etc.).
 *
 * The overlay is a small draggable widget showing:
 * - Current reading time (HH:MM:SS)
 * - Character count
 * - Book linking status
 *
 * Extracted from text-tracker.content.ts to allow future per-site theming.
 * The text-tracker still handles DOM creation and interaction — this module
 * only provides the style injection function.
 *
 * ── Future Extensibility ──
 * Pass a different UITheme to `getOverlayStyles()` to change colors per-site.
 * For example, TTU could use a lighter theme to match its bright reading UI.
 */

import type { UITheme } from './types';
import { DEFAULT_THEME } from './types';

/**
 * Generate the CSS string for the reader overlay widget.
 * Content scripts inject this into the page's shadow DOM or <head>.
 *
 * @param theme - Optional theme override. Defaults to DEFAULT_THEME.
 * @returns CSS string ready for injection
 */
export function getOverlayStyles(theme: UITheme = DEFAULT_THEME): string {
  const c = theme.colors;
  const t = theme.typography;

  return `
    /* ── Chronometer overlay container ── */
    .nt-chrono-overlay {
      position: fixed;
      z-index: 2147483646;
      background: ${c.surface};
      border: 1px solid ${c.border};
      border-radius: ${theme.borderRadius}px;
      padding: 10px 14px;
      font-family: ${t.mono};
      font-size: 12px;
      color: ${c.text};
      box-shadow: 0 4px 20px rgba(0,0,0,.5);
      cursor: move;
      user-select: none;
      min-width: 140px;
    }

    /* ── Time display ── */
    .nt-chrono-time {
      font-size: 18px;
      font-weight: 700;
      color: ${c.accent};
      letter-spacing: 1px;
      margin-bottom: 4px;
    }

    /* ── Character count ── */
    .nt-chrono-chars {
      font-size: 11px;
      color: ${c.muted};
    }

    /* ── Link status badge ── */
    .nt-chrono-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: ${c.success};
      margin-top: 6px;
    }
    .nt-chrono-link.unlinked {
      color: ${c.muted};
    }

    /* ── Controls row (pause/link/history buttons) ── */
    .nt-chrono-controls {
      display: flex;
      gap: 6px;
      margin-top: 8px;
      border-top: 1px solid ${c.border};
      padding-top: 8px;
    }
    .nt-chrono-controls button {
      background: transparent;
      border: 1px solid ${c.border};
      color: ${c.muted};
      border-radius: ${theme.borderRadiusSmall}px;
      padding: 3px 8px;
      font-family: ${t.mono};
      font-size: 10px;
      cursor: pointer;
      transition: color .15s, border-color .15s;
    }
    .nt-chrono-controls button:hover {
      color: ${c.text};
      border-color: ${c.borderHover};
    }
    .nt-chrono-controls button.active {
      color: ${c.accent};
      border-color: ${c.accent};
    }
  `;
}
