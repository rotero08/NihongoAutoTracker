/**
 * ── Themes Registry & Dynamic Style Applicator ──────────────────────────────
 */

import type { UITheme } from '@/lib/types';

export const DYNAMIC_LOGO_SVG = `
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" style="display: block; width: 100%; height: 100%;" viewBox="0 0 1996 2000" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="BrandLogoGrad" gradientUnits="userSpaceOnUse" x1="886.829" y1="2067.63" x2="1050" y2="63.3125">
      <stop offset="0" stop-color="var(--color-logo-accent, var(--color-accent, rgb(200,128,19)))" />
      <stop offset="1" stop-color="var(--color-logo-accent-hover, var(--color-accent-hover, rgb(231,167,47)))" />
    </linearGradient>
  </defs>
  <path transform="translate(0,0)" fill="url(#BrandLogoGrad)" d="M 5.15169 4.91116 L 227.002 5.1235 L 303.231 4.89851 C 316.879 4.84169 330.966 4.60148 344.588 4.9931 C 349.275 5.12786 353.263 5.28615 356.291 8.67041 C 373.67 28.0987 390.237 49.7645 406.799 70.0154 L 518.649 207.361 L 864.445 633.27 C 1099.11 924.792 1331.77 1217.93 1562.38 1512.67 L 1822.26 1841.82 C 1862.82 1893.49 1907.26 1947.27 1945.73 2000 L 1386.04 2000 C 1370.28 1986.81 1338.29 1943.64 1324.29 1926.51 L 1183.25 1754.74 L 642.856 1098.9 L 479.588 899.661 L 433.947 843.861 C 420.372 827.106 408.23 811.388 393.231 795.828 C 394.003 811.198 393.317 829.088 393.277 844.767 L 393.166 932.786 L 393.166 932.786 L 393.036 1207.88 L 392.742 2000 L 5.7664 2000 C 3.98011 1976.53 5.21222 1942.73 5.1816 1918.26 L 5.24603 1751.57 L 5.11573 1234.05 L 5.07001 413.888 L 5.10066 140.547 C 5.11251 96.5711 3.97624 48.2916 5.15169 4.91116 z"/>
  <path transform="translate(1,0)" fill="var(--color-logo-text-override, var(--color-logo-text, #f4f4f3))" d="M 545.48 3.41642 C 618.477 4.27753 691.48 4.51709 764.481 4.13506 L 1150.38 4.14877 L 1996 3.90803 L 1996 396.493 C 1981.8 395.339 1956.31 396.056 1941.29 396.056 L 1839.74 396.112 L 1730.32 396.087 C 1710.26 396.087 1683.22 395.48 1663.63 396.889 C 1665.89 410.024 1664.9 465.901 1664.88 481.692 L 1664.76 660.017 L 1664.61 1333.11 L 1664.93 1482.65 C 1664.94 1488.35 1666.25 1509.62 1664.1 1512.99 C 1661.21 1512.36 1659.54 1510.64 1657.58 1508.56 C 1642.87 1492.9 1630.67 1473.93 1617.23 1457.12 C 1545.12 1366.97 1472.33 1276.85 1403.18 1184.44 C 1394.11 1172.31 1378.4 1158.98 1373.14 1144.8 C 1368.57 1132.48 1371.02 1021.47 1371.03 1001.99 L 1371.06 786.466 L 1371.05 540.762 C 1371.04 493.827 1370.01 443.005 1371.85 396.579 C 1324.33 395.232 1273.73 396.044 1225.87 396.05 L 975.872 396.147 C 937.262 396.147 896.37 396.925 857.95 395.899 C 846.987 387.483 840.284 376.716 831.698 365.964 C 820.535 352.246 809.511 338.415 798.627 324.474 L 689.982 187.802 C 658.188 148.24 626.619 108.499 595.277 68.5783 C 582.305 52.2313 555.273 19.8823 545.48 3.41642 z"/>
  <path transform="translate(-53,0)" fill="url(#BrandLogoGrad)" d="M 628.973 2000 C 627.156 1987.04 627.585 1963.01 627.53 1949.37 L 627.598 1861.6 L 627.485 1597.21 L 627.476 1381.39 L 627.424 1331.3 C 627.408 1325.08 626.798 1308.51 628.005 1303.25 L 629.704 1302.29 C 633.93 1303.88 651.087 1326.95 655.625 1332.53 L 717.503 1407.2 L 1209.02 2000 L 628.973 2000 z"/>
</svg>
`;

export const THEMES: Record<string, UITheme> = {
    'dark-amber': {
        name: 'Dark Amber (Default)',
        colors: {
            background: '#07070e',
            surface: '#0d0d1c',
            surfaceAlt: '#10101f',
            border: '#1a2235',
            borderHover: '#222d42',
            text: '#dde4f0',
            muted: '#7a8ca5',
            accent: '#f0b429',
            accentHover: '#ffd060',
            success: '#3ddc84',
            error: '#f0706a',
        },
        typography: {
            mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            sans: 'system-ui, -apple-system, sans-serif',
        },
        borderRadius: 6,
        borderRadiusSmall: 4,
    },
    'charcoal-amber': {
        name: 'Charcoal Amber',
        colors: {
            background: '#1a1a1a',
            surface: '#252525',
            surfaceAlt: '#303030',
            border: '#404040',
            borderHover: '#555555',
            text: '#ececec',
            muted: '#a0a0a0',
            accent: '#f0b429',
            accentHover: '#ffcc33',
            success: '#3ddc84',
            error: '#f0706a',
        },
        typography: {
            mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            sans: 'system-ui, -apple-system, sans-serif',
        },
        borderRadius: 6,
        borderRadiusSmall: 4,
    },
    'dark': {
        name: 'Deep Ocean Dark',
        colors: {
            background: '#0b0f19',
            surface: '#151f32',
            surfaceAlt: '#1e2d4a',
            border: '#2e3f5b',
            borderHover: '#3e5275',
            text: '#e2e8f0',
            muted: '#94a3b8',
            accent: '#3b82f6',
            accentHover: '#60a5fa',
            success: '#10b981',
            error: '#f43f5e',
        },
        typography: {
            mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            sans: 'system-ui, -apple-system, sans-serif',
        },
        borderRadius: 6,
        borderRadiusSmall: 4,
    },
    'light': {
        name: 'Nordic Light',
        colors: {
            background: '#eceff4',
            surface: '#f8f9fa',
            surfaceAlt: '#e5e9f0',
            border: '#d8dee9',
            borderHover: '#88c0d0',
            text: '#2e3440',
            muted: '#4c566a',
            accent: '#5e81ac',
            accentHover: '#81a1c1',
            success: '#166534',
            error: '#bf616a',
        },
        typography: {
            mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            sans: 'system-ui, -apple-system, sans-serif',
        },
        borderRadius: 6,
        borderRadiusSmall: 4,
    },
    'amethyst': {
        name: 'Amethyst Purple',
        colors: {
            background: '#0b0914',
            surface: '#120f22',
            surfaceAlt: '#18142c',
            border: '#252044',
            borderHover: '#332c5d',
            text: '#e9e3ff',
            muted: '#9b91d5',
            accent: '#a855f7',
            accentHover: '#c084fc',
            success: '#22c55e',
            error: '#ef4444',
        },
        typography: {
            mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            sans: 'system-ui, -apple-system, sans-serif',
        },
        borderRadius: 8,
        borderRadiusSmall: 4,
    }
};

export const FONTS = {
    sans: 'system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    serif: "Georgia, 'Times New Roman', serif",
};

export const THEME_OPTIONS = Object.entries(THEMES).map(([value, theme]) => ({
    value,
    label: theme.name || "Unnamed Theme"
}));

export const FONT_OPTIONS = [
    { value: "sans", label: "System Sans-Serif (Default)" },
    { value: "mono", label: "System Monospace" },
    { value: "serif", label: "Georgia Serif" },
];

export function getTheme(themeName?: string): UITheme {
    return THEMES[themeName || 'dark-amber'] || THEMES['dark-amber'];
}

export function parseColorToRgb(colorStr: string): { r: number, g: number, b: number } {
    const defaultVal = { r: 7, g: 7, b: 14 };
    if (!colorStr) return defaultVal;

    let val = colorStr.trim();

    if (typeof window !== 'undefined' && val.startsWith('var(')) {
        const match = val.match(/var\((--[^,)]+)/);
        if (match) {
            const varName = match[1].trim();
            const resolved = window.getComputedStyle(document.documentElement).getPropertyValue(varName).trim() ||
                window.getComputedStyle(document.body).getPropertyValue(varName).trim();
            if (resolved && resolved !== val) {
                return parseColorToRgb(resolved);
            }
        }
    }

    // Support modern space-separated or comma-separated rgb/rgba values: rgb(240 180 41) or rgba(240, 180, 41, 0.5)
    const rgbMatch = val.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (rgbMatch) {
        return {
            r: parseInt(rgbMatch[1], 10),
            g: parseInt(rgbMatch[2], 10),
            b: parseInt(rgbMatch[3], 10)
        };
    }

    // Support hsl/hsla color strings: hsl(42 87% 55%) or hsla(42, 87%, 55%, 0.5)
    const hslMatch = val.match(/hsla?\(\s*(\d+)(?:deg)?[\s,]+(\d+)%[\s,]+(\d+)%/);
    if (hslMatch) {
        const h = parseInt(hslMatch[1], 10);
        const s = parseInt(hslMatch[2], 10);
        const l = parseInt(hslMatch[3], 10);
        return hslToRgb(h, s, l);
    }

    // Support raw space-separated or comma-separated numbers: "240 180 41" or "240, 180, 41"
    const spaceMatch = val.match(/^\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*$/);
    if (spaceMatch) {
        return {
            r: parseInt(spaceMatch[1], 10),
            g: parseInt(spaceMatch[2], 10),
            b: parseInt(spaceMatch[3], 10)
        };
    }

    if (val.startsWith('#')) {
        let hex = val.slice(1);
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (hex.length === 6) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16)
            };
        }
    }

    return defaultVal;
}

export function rgbToHsl(r: number, g: number, b: number) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number) {
    h /= 360; s /= 100; l /= 100;
    let r = l, g = l, b = l;
    if (s !== 0) {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/**
 * Centrally aligns local storage variables to represent a single source of truth.
 */
export function syncThemeCache(theme: string, font: string, customColors?: Record<string, string> | null) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('nta-theme-cache', theme);
    localStorage.setItem('nta-font-cache', font);
    if (customColors) {
        localStorage.setItem('nta-custom-colors-cache', typeof customColors === 'string' ? customColors : JSON.stringify(customColors));
    } else {
        localStorage.removeItem('nta-custom-colors-cache');
    }
}

/**
 * Shifts hex codes smoothly to compute readable highlights.
 */
export function lightenHexColor(hex: string, percent: number): string {
    if (!hex || !hex.startsWith("#")) return hex;
    try {
        let h = hex.trim();
        if (h.length === 4) {
            h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
        }
        let num = parseInt(h.slice(1), 16),
            amt = Math.round(2.55 * percent),
            R = (num >> 16) + amt,
            G = ((num >> 8) & 0x00ff) + amt,
            B = (num & 0x0000ff) + amt;
        R = Math.max(0, Math.min(255, R));
        G = Math.max(0, Math.min(255, G));
        B = Math.max(0, Math.min(255, B));
        return (
            "#" +
            (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)
        );
    } catch {
        return hex;
    }
}

export function applyThemeToDocument(
    themeName: string,
    fontName?: string,
    customColors?: Record<string, string>,
    configOptions?: { useStaticInPageLogo?: boolean }
) {
    const theme = getTheme(themeName);
    const root = document.documentElement;

    root.setAttribute('data-theme', themeName);

    const selectedFont = FONTS[fontName as keyof typeof FONTS] || theme.typography.sans;

    const background = customColors?.background || theme.colors.background;
    const surface = customColors?.surface || theme.colors.surface;
    const surfaceAlt = customColors?.surfaceAlt || customColors?.surface || theme.colors.surfaceAlt;
    const border = customColors?.border || theme.colors.border;
    const borderHover = customColors?.borderHover || customColors?.border || theme.colors.borderHover;
    const text = customColors?.text || theme.colors.text;
    const muted = customColors?.textMuted || customColors?.muted || theme.colors.muted;
    const accent = customColors?.accent || theme.colors.accent;
    const accentHover = customColors?.accentHover || customColors?.accent || theme.colors.accentHover;
    const success = customColors?.success || theme.colors.success;
    const error = customColors?.error || theme.colors.error;

    const parsedBackground = parseColorToRgb(background);
    const hslBackground = rgbToHsl(parsedBackground.r, parsedBackground.g, parsedBackground.b);
    const isBackgroundDark = hslBackground.l < 50;

    const parsedAccent = parseColorToRgb(accent);
    const r = parsedAccent.r / 255;
    const g = parsedAccent.g / 255;
    const b = parsedAccent.b / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const isAccentDark = luminance < 0.55;

    const accentText = isAccentDark ? '#ffffff' : '#09090f';
    const logoText = isBackgroundDark ? '#f4f4f3' : text;
    const apiGreen = isBackgroundDark ? '#3ddc84' : '#166534';

    const useStaticLogo = configOptions?.useStaticInPageLogo === true;
    const logoAccent = useStaticLogo ? '#f0b429' : accent;
    const logoAccentHover = useStaticLogo ? '#ffd060' : accentHover;
    const logoTextVal = useStaticLogo ? '#f4f4f3' : logoText;

    const variables: Record<string, string> = {
        '--color-background': background,
        '--color-surface': surface,
        '--color-surface-alt': surfaceAlt,
        '--color-border': border,
        '--color-border-hover': borderHover,
        '--color-text': text,
        '--color-text-muted': muted,
        '--color-text-dimmed': muted,
        '--color-accent': accent,
        '--color-accent-hover': accentHover,
        '--color-success': success,
        '--color-error': error,
        '--font-mono': selectedFont,
        '--font-sans': selectedFont,
        '--rounded-box': `${theme.borderRadius}px`,
        '--rounded-btn': `${theme.borderRadiusSmall}px`,
        '--nt-color-scheme': isBackgroundDark ? 'dark' : 'light',

        '--color-accent-text': accentText,
        '--color-logo-text': logoText,
        '--color-api-green': apiGreen,
        '--color-success-system': '#3ddc84',

        '--color-logo-accent': logoAccent,
        '--color-logo-accent-hover': logoAccentHover,
        '--color-logo-text-override': logoTextVal,

        '--nt-background': background,
        '--nt-surface': surface,
        '--nt-surface-alt': surfaceAlt,
        '--nt-border': border,
        '--nt-border-hover': borderHover,
        '--nt-text': text,
        '--nt-text-muted': muted,
        '--nt-text-dimmed': muted,
        '--nt-accent': accent,
        '--nt-accent-hover': accentHover,
        '--nt-success': success,
    };

    Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

export function applyCustomThemeToDoc(customColors: any) {
    if (!customColors) return;
    const root = document.documentElement;
    const mapping: Record<string, string> = {
        "--color-background": customColors.background,
        "--color-surface": customColors.surface,
        "--color-surface-alt": customColors.surfaceAlt || customColors.surface,
        "--color-border": customColors.border,
        "--color-border-hover": customColors.borderHover || customColors.border,
        "--color-text": customColors.text,
        "--color-text-muted": customColors.textMuted,
        "--color-text-dimmed": customColors.textMuted,
        "--color-accent": customColors.accent,
        "--color-accent-hover": customColors.accentHover || customColors.accent,
        "--color-success": customColors.success || customColors.accent,

        "--nt-background": customColors.background,
        "--nt-surface": customColors.surface,
        "--nt-surface-alt": customColors.surfaceAlt || customColors.surface,
        "--nt-border": customColors.border,
        "--nt-border-hover": customColors.borderHover || customColors.border,
        "--nt-text": customColors.text,
        "--nt-text-muted": customColors.textMuted,
        "--nt-text-dimmed": customColors.textMuted,
        "--nt-accent": customColors.accent,
        "--nt-accent-hover": customColors.accentHover || customColors.accent,
        "--nt-success": customColors.success || customColors.accent,
    };
    for (const [prop, val] of Object.entries(mapping)) {
        if (val) root.style.setProperty(prop, val, 'important');
    }
}

export function clearCustomThemeFromDoc() {
    const root = document.documentElement;
    const props = [
        "--color-background",
        "--color-surface",
        "--color-surface-alt",
        "--color-border",
        "--color-border-hover",
        "--color-text",
        "--color-text-muted",
        "--color-text-dimmed",
        "--color-accent",
        "--color-accent-hover",
        "--color-success",
        "--nt-background",
        "--nt-surface",
        "--nt-surface-alt",
        "--nt-border",
        "--nt-border-hover",
        "--nt-text",
        "--nt-text-muted",
        "--nt-text-dimmed",
        "--nt-accent",
        "--nt-accent-hover",
        "--nt-success"
    ];
    for (const prop of props) {
        root.style.removeProperty(prop);
    }
}

export function clearThemeOverrides() {
    const root = document.documentElement;
    root.removeAttribute('data-theme');

    const variablesToClear = [
        '--color-background', '--color-surface', '--color-surface-alt', '--color-border', '--color-border-hover',
        '--color-text', '--color-text-muted', '--color-text-dimmed', '--color-accent', '--color-accent-hover',
        '--color-success', '--color-error', '--font-mono', '--font-sans', '--rounded-box', '--rounded-btn',
        '--nt-color-scheme', '--color-accent-text', '--color-logo-text', '--color-api-green',
        '--color-logo-accent', '--color-logo-accent-hover', '--color-logo-text-override',
        '--nt-background', '--nt-surface', '--nt-surface-alt', '--nt-border', '--nt-border-hover',
        '--nt-text', '--nt-text-muted', '--nt-text-dimmed', '--nt-accent', '--nt-accent-hover', '--nt-success'
    ];
    variablesToClear.forEach(variable => root.style.removeProperty(variable));
}