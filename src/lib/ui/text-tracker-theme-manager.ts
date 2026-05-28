import { getActiveReaderAdapter } from '@/lib/adapters/readers';
import { injectThemeStyles } from '@/lib/ui/reader-overlay';
import { applyThemeToDocument, applyCustomThemeToDoc, clearCustomThemeFromDoc, parseColorToRgb, rgbToHsl, hslToRgb } from '@/lib/ui/themes';

// High-performance cache for computed DOM theme checks to avoid layout thrashing
let _cachedThemeColors: any = null;
let _lastThemeDetectionTime = 0;
const THEME_DETECTION_CACHE_TTL = 1500; // ms

// Re-export styling handlers to maintain library compatibility
export { applyCustomThemeToDoc, clearCustomThemeFromDoc };

export function getActiveThemeName(cfg: any): string {
  const adapter = getActiveReaderAdapter();
  if (adapter) {
    let override: string | undefined;
    if (adapter.hostname === 'reader.ttsu.app') {
      override = cfg.ttuThemeOverride;
    } else if (adapter.hostname === 'app.yatsu.moe') {
      override = cfg.yatsuThemeOverride;
    } else if (adapter.hostname === 'manga.manabe.es') {
      override = cfg.yomiyasuThemeOverride || cfg.manabeThemeOverride;
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

export function adjustLightness(rgb: { r: number, g: number, b: number }, offset: number): string {
  const r = Math.max(0, Math.min(255, rgb.r + offset));
  const g = Math.max(0, Math.min(255, rgb.g + offset));
  const b = Math.max(0, Math.min(255, rgb.b + offset));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function isValidAccent(rgb: { r: number, g: number, b: number }, isDark: boolean): boolean {
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Filter out pure grayscale, very low saturation colors, or extreme whites/blacks
  if (hsl.s < 10) return false;
  if (hsl.l < 12 || hsl.l > 92) return false;

  return true;
}

function findDOMAccentColor(isDark: boolean): string | null {
  const rootStyle = window.getComputedStyle(document.documentElement);
  const bodyStyle = window.getComputedStyle(document.body);

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  let cssVars: string[] = [];

  // Site-specific variable prioritization to match the correct theme accents
  if (host.includes('yatsu.moe')) {
    cssVars = ['--yatsu-accent', '--yatsu-primary', '--color-primary', '--color-accent', '--accent-color'];
  } else if (host.includes('ttsu.app') || host.includes('manabe.es') || host.includes('yomiyasu')) {
    cssVars = ['--color-accent', '--ttu-color-accent', '--ttu-accent', '--accent-color', '--accent', '--color-primary'];
  } else {
    cssVars = [
      '--color-accent', '--accent-color', '--accent', '--theme-color', '--main-color',
      '--theme-accent', '--primary', '--color-primary', '--md-sys-color-primary',
      '--yatsu-accent', '--ttu-color-accent', '--color-main'
    ];
  }

  for (const cssVar of cssVars) {
    const val = rootStyle.getPropertyValue(cssVar).trim() || bodyStyle.getPropertyValue(cssVar).trim();
    if (val) {
      const rgb = parseColorToRgb(val);
      if (isValidAccent(rgb, isDark)) {
        return val;
      }
    }
  }

  // Fallback to DOM elements only if we are not on the main reader pages
  const isReaderPage = host.includes('reader.ttsu.app') ||
    host.includes('app.yatsu.moe') ||
    host.includes('manga.manabe.es') ||
    host.includes('yomiyasu') ||
    !!getActiveReaderAdapter();

  if (isReaderPage) {
    return isDark ? '#f5a623' : '#92400e';
  }

  // Active, highlighted, or selected elements
  const specificSelectors = [
    '[class*="accent"]', '[class*="highlight"]', '[class*="active"]', '[class*="selected"]',
    '.active', '.selected', '.is-active', '.is-selected', '.tab-active', '[aria-selected="true"]',
    'button[class*="primary"]', 'a[class*="primary"]', '.btn-primary', '.bg-primary', '.text-primary'
  ];

  for (const selector of specificSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      const scanLimit = Math.min(elements.length, 15);
      for (let i = 0; i < scanLimit; i++) {
        const el = elements[i] as HTMLElement;
        if (el.closest('#nt-ttu-chrono-wrapper, #nt-overlay, .nt-toast')) {
          continue;
        }
        const style = window.getComputedStyle(el);

        // Check background-color
        const bg = style.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          const rgb = parseColorToRgb(bg);
          if (isValidAccent(rgb, isDark)) {
            return bg;
          }
        }

        // Check color
        const col = style.color;
        if (col && col !== 'rgba(0, 0, 0, 0)' && col !== 'transparent') {
          const rgb = parseColorToRgb(col);
          if (isValidAccent(rgb, isDark)) {
            return col;
          }
        }

        // Check border-color
        const borderCol = style.borderColor || style.borderTopColor;
        if (borderCol && borderCol !== 'rgba(0, 0, 0, 0)' && borderCol !== 'transparent') {
          const rgb = parseColorToRgb(borderCol);
          if (isValidAccent(rgb, isDark)) {
            return borderCol;
          }
        }
      }
    } catch (e) { }
  }

  // Fallback generic interactive tags
  const genericSelectors = ['a', 'button'];
  for (const selector of genericSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      const scanLimit = Math.min(elements.length, 10);
      for (let i = 0; i < scanLimit; i++) {
        const el = elements[i] as HTMLElement;
        if (el.closest('#nt-ttu-chrono-wrapper, #nt-overlay, .nt-toast')) {
          continue;
        }
        const style = window.getComputedStyle(el);
        const col = style.color;
        if (col && col !== 'rgba(0, 0, 0, 0)' && col !== 'transparent') {
          const rgb = parseColorToRgb(col);
          if (isValidAccent(rgb, isDark)) {
            return col;
          }
        }
        const bg = style.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          const rgb = parseColorToRgb(bg);
          if (isValidAccent(rgb, isDark)) {
            return bg;
          }
        }
      }
    } catch (e) { }
  }

  return null;
}

export function detectReaderThemeColors(): any {
  const now = Date.now();
  if (_cachedThemeColors && (now - _lastThemeDetectionTime) < THEME_DETECTION_CACHE_TTL) {
    return _cachedThemeColors;
  }

  try {
    const bodyStyle = window.getComputedStyle(document.body);
    let bgColor = bodyStyle.backgroundColor;

    let textColor = bodyStyle.color;
    const contentEl = document.querySelector(
      '.book-content p, .book-content-container p, #reader-container p, .reader-container p, .reader-wrapper p, ' +
      '.book-content, .book-content-container, #reader-container, .reader-container, .reader-wrapper'
    );
    if (contentEl && !contentEl.closest('#nt-ttu-chrono-wrapper, #nt-overlay, .nt-toast')) {
      textColor = window.getComputedStyle(contentEl).color;
    }

    if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'rgba(0,0,0,0)' || bgColor === 'transparent') {
      const selectors = [
        '.book-content-container',
        '.book-content',
        '[data-ref="container"]',
        '.reader-container',
        '#reader-container',
        '.reader-wrapper',
        'main',
        '#ttu-page-footer',
        '#root',
        '#app'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          if (el.closest('#nt-ttu-chrono-wrapper, #nt-overlay, .nt-toast')) {
            continue;
          }
          const bg = window.getComputedStyle(el).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgba(0,0,0,0)' && bg !== 'transparent') {
            bgColor = bg;
            break;
          }
        }
      }
    }

    const parsedBg = parseColorToRgb(bgColor || '#07070e');
    const parsedText = parseColorToRgb(textColor || '#dde4f0');

    const hslBg = rgbToHsl(parsedBg.r, parsedBg.g, parsedBg.b);
    const isDark = hslBg.l < 50;

    let background = `rgb(${parsedBg.r}, ${parsedBg.g}, ${parsedBg.b})`;
    let surface = isDark ? adjustLightness(parsedBg, 6) : adjustLightness(parsedBg, -6);
    let surfaceAlt = isDark ? adjustLightness(parsedBg, 12) : adjustLightness(parsedBg, -12);
    let border = isDark ? adjustLightness(parsedBg, 22) : adjustLightness(parsedBg, -22);
    let borderHover = isDark ? adjustLightness(parsedBg, 32) : adjustLightness(parsedBg, -32);
    let textMuted = `rgba(${parsedText.r}, ${parsedText.g}, ${parsedText.b}, 0.6)`;

    let accent = isDark ? '#f5a623' : '#92400e';
    const extractedAccent = findDOMAccentColor(isDark);
    if (extractedAccent) {
      accent = extractedAccent;
    }

    // Mathematically adjust the matched active color to ensure ideal legibility and contrast
    const rgbAccent = parseColorToRgb(accent);
    const hslAccent = rgbToHsl(rgbAccent.r, rgbAccent.g, rgbAccent.b);

    if (isDark) {
      hslAccent.l = Math.max(52, Math.min(68, hslAccent.l));
      hslAccent.s = Math.max(60, hslAccent.s);
    } else {
      hslAccent.l = Math.max(25, Math.min(38, hslAccent.l));
      hslAccent.s = Math.max(65, hslAccent.s);
    }

    const contrastAccentRgb = hslToRgb(hslAccent.h, hslAccent.s, hslAccent.l);
    accent = `rgb(${contrastAccentRgb.r}, ${contrastAccentRgb.g}, ${contrastAccentRgb.b})`;

    const parsedAccent = parseColorToRgb(accent);
    let accentHover = isDark ? adjustLightness(parsedAccent, 15) : adjustLightness(parsedAccent, -15);

    const greenHsl = {
      h: 135,
      s: isDark ? 65 : 75,
      l: isDark ? 55 : 35
    };
    const successGreen = hslToRgb(greenHsl.h, greenHsl.s, greenHsl.l);
    const success = `rgb(${successGreen.r}, ${successGreen.g}, ${successGreen.b})`;

    const detectedColors = {
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

    _cachedThemeColors = detectedColors;
    _lastThemeDetectionTime = now;
    return detectedColors;
  } catch (e) {
    return null;
  }
}

export function updateActiveThemeStyles(themeName: string, cfg: any) {
  const useStaticInPageLogo = cfg.useStaticInPageLogo === true;
  if (themeName === 'match-reader') {
    const detectedColors = detectReaderThemeColors();
    if (detectedColors) {
      const host = window.location.hostname;
      browser.storage.local.set({
        [`local:readerColors:${host}`]: detectedColors,
        [`readerColors:${host}`]: detectedColors
      }).catch(() => { });

      applyCustomThemeToDoc(detectedColors);
      applyThemeToDocument("dark-amber", cfg.font ?? "sans", detectedColors, { useStaticInPageLogo });
      injectThemeStyles('custom', cfg.font ?? 'sans');
    } else {
      clearCustomThemeFromDoc();
      applyThemeToDocument(cfg.theme ?? 'dark-amber', cfg.font ?? 'sans', undefined, { useStaticInPageLogo });
      injectThemeStyles(cfg.theme ?? 'dark-amber', cfg.font ?? 'sans');
    }
  } else if (themeName.startsWith('custom-') || themeName.startsWith('custom_') || themeName === 'custom') {
    const colors = getCustomColorsForSite(cfg);
    if (colors) {
      applyCustomThemeToDoc(colors);
      applyThemeToDocument("dark-amber", cfg.font ?? "sans", colors, { useStaticInPageLogo });
      injectThemeStyles('custom', cfg.font ?? 'sans');
    } else {
      clearCustomThemeFromDoc();
      applyThemeToDocument('dark-amber', cfg.font ?? 'sans', undefined, { useStaticInPageLogo });
      injectThemeStyles('dark-amber', cfg.font ?? 'sans');
    }
  } else {
    clearCustomThemeFromDoc();
    applyThemeToDocument(themeName, cfg.font ?? 'sans', undefined, { useStaticInPageLogo });
    injectThemeStyles(themeName, cfg.font ?? 'sans');
  }
}

export async function applyActiveTheme(cfg: any): Promise<void> {
  try {
    let themeName = cfg.theme ?? 'dark-amber';
    let customColors = undefined;

    // Detect if we are in an extension popup / options page
    const isExtensionPage = typeof window !== 'undefined' &&
      (window.location.protocol.startsWith('chrome-extension') || window.location.protocol.startsWith('moz-extension'));

    if (isExtensionPage) {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (activeTab && activeTab.url) {
        const urlObj = new URL(activeTab.url);
        const host = urlObj.hostname;

        // Find if there is an adapter for this host
        const { READER_ADAPTERS } = await import('@/lib/adapters/readers');
        const adapter = READER_ADAPTERS.find(a => host.includes(a.hostname));

        if (adapter && cfg.syncPopupWithReaderTheme !== false) {
          let override: string | undefined;
          if (adapter.hostname === 'reader.ttsu.app') {
            override = cfg.ttuThemeOverride;
          } else if (adapter.hostname === 'app.yatsu.moe') {
            override = cfg.yatsuThemeOverride;
          } else if (adapter.hostname === 'manga.manabe.es') {
            override = cfg.yomiyasuThemeOverride || cfg.manabeThemeOverride;
          }

          if (override && override !== 'global') {
            themeName = override;
          }

          if (themeName === 'match-reader') {
            const stored = await browser.storage.local.get(`local:readerColors:${host}`);
            customColors = stored[`local:readerColors:${host}`];
          }
        }
      }
    } else {
      themeName = getActiveThemeName(cfg);
      if (themeName.startsWith('custom-') || themeName.startsWith('custom_') || themeName === 'custom') {
        customColors = getCustomColorsForSite(cfg);
      } else if (themeName === 'match-reader') {
        customColors = detectReaderThemeColors();
      }
    }

    const useStaticInPageLogo = cfg.useStaticInPageLogo === true;
    if (themeName === 'match-reader' && !isExtensionPage) {
      const host = window.location.hostname;
      const stored = (await browser.storage.local.get(`local:readerColors:${host}`).catch(() => ({}))) as Record<string, any>;
      const cachedColors = stored[`local:readerColors:${host}`];

      const detectedColors = detectReaderThemeColors();
      if (detectedColors) {
        // Fallback to cached valid values to bypass transient amber resets on page loads
        const defaultAccent = detectedColors.background === '#07070e' ? '#f5a623' : '#92400e';
        if (detectedColors.accent === defaultAccent && cachedColors?.accent) {
          detectedColors.accent = cachedColors.accent;
          detectedColors.accentHover = cachedColors.accentHover || detectedColors.accentHover;
        }

        await browser.storage.local.set({
          [`local:readerColors:${host}`]: detectedColors,
          [`readerColors:${host}`]: detectedColors
        });
        applyCustomThemeToDoc(detectedColors);
        applyThemeToDocument("dark-amber", cfg.font ?? "sans", detectedColors, { useStaticInPageLogo });
        injectThemeStyles('custom', cfg.font ?? 'sans');
      } else {
        clearCustomThemeFromDoc();
        applyThemeToDocument(cfg.theme ?? 'dark-amber', cfg.font ?? 'sans', undefined, { useStaticInPageLogo });
        injectThemeStyles(cfg.theme ?? 'dark-amber', cfg.font ?? 'sans');
      }
    } else if (themeName === 'match-reader' && isExtensionPage && customColors) {
      applyThemeToDocument("dark-amber", cfg.font ?? "sans", customColors, { useStaticInPageLogo });
    } else if (themeName.startsWith('custom-') || themeName.startsWith('custom_') || themeName === 'custom') {
      const colors = isExtensionPage ? customColors : getCustomColorsForSite(cfg);
      if (colors) {
        applyCustomThemeToDoc(colors);
        applyThemeToDocument("dark-amber", cfg.font ?? "sans", colors, { useStaticInPageLogo });
        injectThemeStyles('custom', cfg.font ?? 'sans');
      } else {
        clearCustomThemeFromDoc();
        applyThemeToDocument('dark-amber', cfg.font ?? 'sans', undefined, { useStaticInPageLogo });
        injectThemeStyles('dark-amber', cfg.font ?? 'sans');
      }
    } else {
      clearCustomThemeFromDoc();
      applyThemeToDocument(themeName, cfg.font ?? 'sans', undefined, { useStaticInPageLogo });
      injectThemeStyles(themeName, cfg.font ?? 'sans');
    }
  } catch (e) { }
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