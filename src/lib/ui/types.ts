/**
 * ── UI Theme Types ──────────────────────────────────────────────────────────
 *
 * Defines the `UITheme` interface and `DEFAULT_THEME` constant used by all
 * DOM-injected UI elements across content scripts (video badge, modals,
 * reader overlay, playlist logger).
 *
 * This module enables future per-site style overrides by providing a
 * single, typed theme contract that all UI builders consume.
 *
 * ── How Per-Site Theming Will Work (Future) ──
 * 1. A theme registry maps hostnames → UITheme overrides
 * 2. Content scripts call `getThemeForSite(hostname)` at init
 * 3. UI builders receive the merged theme instead of DEFAULT_THEME
 * 4. No changes needed to any UI builder — they already consume UITheme
 */

/** Color palette for injected UI elements */
export interface UIThemeColors {
  /** Primary background (darkest layer) */
  background: string;
  /** Surface background (cards, modals) */
  surface: string;
  /** Secondary surface (inputs, nested panels) */
  surfaceAlt: string;
  /** Primary border color */
  border: string;
  /** Secondary/hover border color */
  borderHover: string;
  /** Primary text color */
  text: string;
  /** Muted/secondary text color */
  muted: string;
  /** Accent color (amber/gold) */
  accent: string;
  /** Accent hover color */
  accentHover: string;
  /** Success color (green) */
  success: string;
  /** Error/danger color (red) */
  error: string;
}

/** Typography configuration */
export interface UIThemeTypography {
  /** Monospace font family for code-like elements */
  mono: string;
  /** Sans-serif font family for labels */
  sans: string;
}

/** Complete theme configuration for injected UI elements */
export interface UITheme {
  colors: UIThemeColors;
  typography: UIThemeTypography;
  /** Border radius for cards/modals (px) */
  borderRadius: number;
  /** Border radius for buttons/inputs (px) */
  borderRadiusSmall: number;
}

/**
 * Default theme matching the current NihongoAutoTracker design.
 * All existing UI elements use these exact values.
 */
export const DEFAULT_THEME: UITheme = {
  colors: {
    background: '#07070e',
    surface: '#0d0d12',
    surfaceAlt: '#14141e',
    border: '#222d42',
    borderHover: '#5a6a85',
    text: '#dde4f0',
    muted: '#5a6a85',
    accent: '#F5B831',
    accentHover: '#ffd060',
    success: '#3ddc84',
    error: '#f0706a',
  },
  typography: {
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    sans: "system-ui, -apple-system, sans-serif",
  },
  borderRadius: 8,
  borderRadiusSmall: 4,
};
