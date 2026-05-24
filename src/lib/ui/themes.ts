import type { UITheme } from '../types';

export const THEMES: Record<string, UITheme> = {
    'dark-amber': {
        name: 'Dark Amber (Default)',
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
    },
    'charcoal-amber': {
        name: 'Charcoal Amber',
        colors: {
            bg: '#1a1a1a',
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
    },
    'light': {
        name: 'Nordic Light',
        colors: {
            bg: '#f3f4f6',
            surface: '#ffffff',
            surfaceAlt: '#e5e7eb',
            border: '#94a3b8',
            borderHover: '#475569',
            text: '#0f172a',
            muted: '#334155',
            accent: '#b45309',
            accentHover: '#78350f',
            success: '#166534',
            error: '#dc2626',
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
    }
};

export const FONTS = {
    sans: 'system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    serif: "Georgia, 'Times New Roman', serif",
};

export const THEME_OPTIONS = Object.entries(THEMES).map(([value, theme]) => ({
    value,
    label: theme.name
}));

export const FONT_OPTIONS = [
    { value: "sans", label: "System Sans-Serif (Default)" },
    { value: "mono", label: "System Monospace" },
    { value: "serif", label: "Georgia Serif" },
];

export function getTheme(themeName?: string): UITheme {
    return THEMES[themeName || 'dark-amber'] || THEMES['dark-amber'];
}

export function applyThemeToDocument(themeName: string, fontName?: string, customColors?: Record<string, string>) {
    const theme = getTheme(themeName);
    const root = document.documentElement;

    root.setAttribute('data-theme', themeName);

    const selectedFont = FONTS[fontName as keyof typeof FONTS] || theme.typography.sans;
    const isLight = themeName === 'light';

    const bg = customColors?.background || theme.colors.bg;
    const surface = customColors?.surface || theme.colors.surface;
    const surfaceAlt = customColors?.surfaceAlt || customColors?.surface || theme.colors.surfaceAlt;
    const border = customColors?.border || theme.colors.border;
    const borderHover = customColors?.borderHover || customColors?.border || theme.colors.borderHover;
    const text = customColors?.text || theme.colors.text;
    const muted = customColors?.textMuted || theme.colors.muted;
    const accent = customColors?.accent || theme.colors.accent;
    const accentHover = customColors?.accentHover || customColors?.accent || theme.colors.accentHover;
    const success = customColors?.success || theme.colors.success;
    const error = customColors?.error || theme.colors.error;

    const variables: Record<string, string> = {
        // Clear, descriptive variables
        '--color-background': bg,
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
        '--nt-color-scheme': isLight ? 'light' : 'dark',

        // Backward-compatibility aliases (so you don't have to rewrite 100 files!)
        '--bg': 'var(--color-background)',
        '--surf': 'var(--color-surface)',
        '--surf2': 'var(--color-surface-alt)',
        '--bdr': 'var(--color-border)',
        '--bdr2': 'var(--color-border-hover)',
        '--text': 'var(--color-text)',
        '--muted': 'var(--color-text-muted)',
        '--dim': 'var(--color-text-dimmed)',
        '--amber': 'var(--color-accent)',
        '--ambrh': 'var(--color-accent-hover)',
        '--green': 'var(--color-success)',
        '--red': 'var(--color-error)',
        '--mono': 'var(--font-mono)',
        '--sans': 'var(--font-sans)',
    };

    Object.entries(variables).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

export function clearThemeOverrides() {
    const root = document.documentElement;
    root.removeAttribute('data-theme');

    // Clear everything, including aliases
    const variablesToClear = [
        '--color-background', '--color-surface', '--color-surface-alt', '--color-border', '--color-border-hover',
        '--color-text', '--color-text-muted', '--color-text-dimmed', '--color-accent', '--color-accent-hover',
        '--color-success', '--color-error', '--font-mono', '--font-sans', '--rounded-box', '--rounded-btn', '--nt-color-scheme',
        '--bg', '--surf', '--surf2', '--bdr', '--bdr2', '--text', '--muted', '--dim', '--amber', '--ambrh', '--green', '--red', '--mono', '--sans'
    ];
    variablesToClear.forEach(variable => root.style.removeProperty(variable));
}