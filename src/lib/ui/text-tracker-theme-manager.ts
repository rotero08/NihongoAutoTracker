import { getActiveReaderAdapter } from '@/lib/adapters/readers';
import { injectThemeStyles } from '@/lib/ui/reader-overlay';

export function getActiveThemeName(cfg: any): string {
  const adapter = getActiveReaderAdapter();
  if (adapter) {
    let override: string | undefined;
    if (adapter.hostname === 'reader.ttsu.app') {
      override = cfg.ttuThemeOverride;
    } else if (adapter.hostname === 'app.yatsu.moe') {
      override = cfg.yatsuThemeOverride;
    } else if (adapter.hostname === 'manga.manabe.es') {
      override = cfg.manabeThemeOverride;
    }
    if (override && override !== 'global') return override;
  }
  return cfg.theme ?? 'nihongo';
}

export function getCustomColorsForSite(cfg: any): any {
  const activeThemeName = getActiveThemeName(cfg);
  if (!activeThemeName) return null;
  if (activeThemeName.startsWith('custom-') || activeThemeName.startsWith('custom_') || activeThemeName === 'custom') {
    const id = activeThemeName.replace('custom-', '').replace('custom_', '');
    const themes = cfg.customThemes || cfg.userThemes || [];
    const theme = themes.find((t: any) => t.id === id || t.id === activeThemeName);
    return theme ? theme.colors : (cfg.customColors || null);
  }
  return null;
}

export function parseColorToRgb(colorStr: string): { r: number, g: number, b: number } {
  const defaultVal = { r: 7, g: 7, b: 14 };
  if (!colorStr) return defaultVal;

  const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    };
  }

  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
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

export function adjustLightness(rgb: { r: number, g: number, b: number }, offset: number): string {
  const r = Math.max(0, Math.min(255, rgb.r + offset));
  const g = Math.max(0, Math.min(255, rgb.g + offset));
  const b = Math.max(0, Math.min(255, rgb.b + offset));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function detectReaderThemeColors(): any {
  try {
    const bodyStyle = window.getComputedStyle(document.body);
    let bgColor = bodyStyle.backgroundColor;

    let textColor = bodyStyle.color;
    const contentEl = document.querySelector('.book-content, .book-content-container, .reader-container, .text-container, p, span, h1, div[class*="content"]');
    if (contentEl) {
      textColor = window.getComputedStyle(contentEl).color;
    }

    if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
      const container = document.querySelector(
        '.book-content-container, .book-content, [data-ref="container"], .reader-container, #ttu-page-footer, #root, #app'
      );
      if (container) {
        const containerStyle = window.getComputedStyle(container);
        bgColor = containerStyle.backgroundColor;
      }
    }

    const parsedBg = parseColorToRgb(bgColor || '#07070e');
    const parsedText = parseColorToRgb(textColor || '#dde4f0');

    const hslBg = rgbToHsl(parsedBg.r, parsedBg.g, parsedBg.b);
    const isDark = hslBg.l < 50;

    const shiftedBgHsl = {
      h: (hslBg.h + 12) % 360,
      s: Math.max(10, Math.min(90, isDark ? hslBg.s + 5 : hslBg.s - 5)),
      l: isDark ? Math.min(95, hslBg.l + 4) : Math.max(5, hslBg.l - 4)
    };
    const shiftedBg = hslToRgb(shiftedBgHsl.h, shiftedBgHsl.s, shiftedBgHsl.l);

    let background = `rgb(${shiftedBg.r}, ${shiftedBg.g}, ${shiftedBg.b})`;
    let surface = isDark ? adjustLightness(shiftedBg, 6) : adjustLightness(shiftedBg, -6);
    let surfaceAlt = isDark ? adjustLightness(shiftedBg, 12) : adjustLightness(shiftedBg, -12);
    let border = isDark ? adjustLightness(shiftedBg, 22) : adjustLightness(shiftedBg, -22);
    let borderHover = isDark ? adjustLightness(shiftedBg, 32) : adjustLightness(shiftedBg, -32);
    let textMuted = `rgba(${parsedText.r}, ${parsedText.g}, ${parsedText.b}, 0.6)`;

    let accent = isDark ? 'var(--color-accent, #f0b429)' : 'var(--color-accent, #b45309)';
    let accentHover = isDark ? 'var(--color-accent-hover, #ffd060)' : 'var(--color-accent-hover, #78350f)';

    const greenHsl = {
      h: 135,
      s: isDark ? 65 : 75,
      l: isDark ? 55 : 35
    };
    const successGreen = hslToRgb(greenHsl.h, greenHsl.s, greenHsl.l);
    const success = `rgb(${successGreen.r}, ${successGreen.g}, ${successGreen.b})`;

    return {
      background,
      surface,
      surfaceAlt,
      border,
      borderHover,
      text: textColor,
      textMuted,
      accent,
      accentHover,
      success
    };
  } catch (e) {
    return null;
  }
}

export function updateActiveThemeStyles(themeName: string, cfg: any) {
  if (themeName === 'match-reader') {
    const detectedColors = detectReaderThemeColors();
    if (detectedColors) {
      applyCustomThemeToDoc(detectedColors);
      injectThemeStyles('custom', cfg.font ?? 'sans');
    } else {
      clearCustomThemeFromDoc();
      injectThemeStyles(cfg.theme ?? 'dark-amber', cfg.font ?? 'sans');
    }
  } else if (themeName.startsWith('custom-') || themeName.startsWith('custom_') || themeName === 'custom') {
    const colors = getCustomColorsForSite(cfg);
    if (colors) {
      applyCustomThemeToDoc(colors);
      injectThemeStyles('custom', cfg.font ?? 'sans');
    } else {
      clearCustomThemeFromDoc();
      injectThemeStyles('dark-amber', cfg.font ?? 'sans');
    }
  } else {
    clearCustomThemeFromDoc();
    injectThemeStyles(themeName, cfg.font ?? 'sans');
  }
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
    "--color-success"
  ];
  for (const prop of props) {
    root.style.removeProperty(prop);
  }
}

export function getReaderConfig(cfg: any) {
  const adapter = getActiveReaderAdapter();
  const autoSave = cfg.readerAutoSave ?? cfg.ttuAutoSave ?? true;
  const directSend = cfg.readerDirectSend ?? cfg.ttuDirectSend ?? false;

  let enabled = cfg.ttuEnabled ?? true;
  if (adapter) {
    enabled = adapter.isEnabled(cfg);
  }
  return { enabled, autoSave, directSend };
}
