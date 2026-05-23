import { type UITheme } from './types';

export const NIHONGO_THEME: UITheme = {
    colors: {
        bg: '#07070e',
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
};

export const LIGHT_THEME: UITheme = {
    colors: {
        bg: '#f3f4f6',
        surface: '#ffffff',
        surfaceAlt: '#e5e7eb',
        border: '#94a3b8',
        borderHover: '#475569',
        text: '#0f172a', // Slate-900: High-contrast dark text
        muted: '#334155', // Slate-700
        accent: '#b45309', // Deeper golden-brown amber contrast for light background
        accentHover: '#78350f',
        success: '#166534', // Legible forest green
        error: '#dc2626', // Deeper legible red
    },
    typography: {
        mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        sans: 'system-ui, -apple-system, sans-serif',
    },
    borderRadius: 6,
    borderRadiusSmall: 4,
};

export const DARK_THEME: UITheme = {
    colors: {
        bg: '#0b0f19',
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
};

export const AMETHYST_THEME: UITheme = {
    colors: {
        bg: '#0b0914',
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
};

export const THEMES: Record<string, UITheme> = {
    nihongo: NIHONGO_THEME,
    dark: DARK_THEME,
    light: LIGHT_THEME,
    amethyst: AMETHYST_THEME,
};

// Default font is positioned strictly at the top of the collection
export const FONTS = {
    sans: 'system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    serif: "Georgia, 'Times New Roman', serif",
};

export function getTheme(themeName?: string): UITheme {
    return THEMES[themeName || 'nihongo'] || NIHONGO_THEME;
}

export function generateThemeCssVariables(theme: UITheme): string {
    const { colors, typography, borderRadius, borderRadiusSmall } = theme;
    return `
    --bg: ${colors.bg};
    --surf: ${colors.surface};
    --surf2: ${colors.surfaceAlt};
    --bdr: ${colors.border};
    --bdr2: ${colors.borderHover};
    --text: ${colors.text};
    --muted: ${colors.muted};
    --dim: ${colors.muted};
    --amber: ${colors.accent};
    --green: ${colors.success};
    --red: ${colors.error};
    --mono: ${typography.mono};

    --color-bg: ${colors.bg};
    --color-surf: ${colors.surface};
    --color-surf2: ${colors.surfaceAlt};
    --color-bdr: ${colors.border};
    --color-bdr2: ${colors.borderHover};
    --color-text-primary: ${colors.text};
    --color-muted: ${colors.muted};
    --color-dim: ${colors.muted};
    --color-amber: ${colors.accent};
    --color-amber-hover: ${colors.accentHover};
    --color-green: ${colors.success};
    --color-red: ${colors.error};
    --font-mono: ${typography.mono};
    --font-sans: ${typography.sans};
    --rounded-box: ${borderRadius}px;
    --rounded-btn: ${borderRadiusSmall}px;
  `;
}

export function clearThemeOverrides() {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    const variablesToClear = [
        '--bg', '--surf', '--surf2', '--bdr', '--bdr2', '--text', '--muted', '--dim', '--amber', '--green', '--red', '--mono',
        '--color-bg', '--color-surf', '--color-surf2', '--color-bdr', '--color-bdr2', '--color-text-primary', '--color-muted', '--color-dim', '--color-amber', '--color-amber-hover', '--color-green', '--color-red',
        '--font-mono', '--font-sans',
        '--p', '--pf', '--pc', '--s', '--sf', '--sc', '--a', '--af', '--ac', '--n', '--nf', '--nc', '--b1', '--b2', '--b3', '--bc', '--er', '--su', '--wa', '--in'
    ];
    variablesToClear.forEach(variable => root.style.removeProperty(variable));
}

export function applyThemeToDocument(themeName: string, fontName?: string) {
    const theme = getTheme(themeName);
    const root = document.documentElement;

    root.setAttribute('data-theme', themeName);

    function hexToDaisyHSL(hex: string): string {
        hex = hex.replace(/^#/, '');
        let r = parseInt(hex.substring(0, 2), 16) / 255;
        let g = parseInt(hex.substring(2, 4), 16) / 255;
        let b = parseInt(hex.substring(4, 6), 16) / 255;

        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;

        if (max !== min) {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    }

    const selectedFont = FONTS[fontName as keyof typeof FONTS] || theme.typography.sans;
    const isLight = themeName === 'light';

    const variables: Record<string, string> = {
        '--bg': theme.colors.bg,
        '--surf': theme.colors.surface,
        '--surf2': theme.colors.surfaceAlt,
        '--bdr': theme.colors.border,
        '--bdr2': theme.colors.borderHover,
        '--text': theme.colors.text,
        '--muted': theme.colors.muted,
        '--dim': theme.colors.muted,
        '--amber': theme.colors.accent,
        '--green': theme.colors.success,
        '--red': theme.colors.error,
        '--mono': selectedFont,
        '--sans': selectedFont,

        '--color-bg': theme.colors.bg,
        '--color-surf': theme.colors.surface,
        '--color-surf2': theme.colors.surfaceAlt,
        '--color-bdr': theme.colors.border,
        '--color-bdr2': theme.colors.borderHover,
        '--color-text-primary': theme.colors.text,
        '--color-muted': theme.colors.muted,
        '--color-dim': theme.colors.muted,
        '--color-amber': theme.colors.accent,
        '--color-amber-hover': theme.colors.accentHover,
        '--color-green': theme.colors.success,
        '--color-red': theme.colors.error,
        '--font-mono': selectedFont,
        '--font-sans': selectedFont,

        '--p': hexToDaisyHSL(theme.colors.accent),
        '--pf': hexToDaisyHSL(theme.colors.accentHover),
        '--s': hexToDaisyHSL(theme.colors.success),
        '--sf': hexToDaisyHSL(theme.colors.success),
        '--a': hexToDaisyHSL(theme.colors.error),
        '--af': hexToDaisyHSL(theme.colors.error),
        '--b1': hexToDaisyHSL(theme.colors.bg),
        '--b2': hexToDaisyHSL(theme.colors.surface),
        '--b3': hexToDaisyHSL(theme.colors.surfaceAlt),
        '--nc': hexToDaisyHSL(theme.colors.text),
        '--bc': hexToDaisyHSL(theme.colors.text),
        '--er': hexToDaisyHSL(theme.colors.error),
        '--su': hexToDaisyHSL(theme.colors.success),
        '--wa': hexToDaisyHSL(theme.colors.accent),
        '--nt-color-scheme': isLight ? 'light' : 'dark',
    };

    Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}