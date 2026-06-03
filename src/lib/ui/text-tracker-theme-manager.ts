import { browser } from 'wxt/browser';
import { getActiveReaderAdapter } from '@/lib/adapters/readers';
import { applyCustomThemeToDoc, applyThemeToDocument, clearCustomThemeFromDoc, hslToRgb, parseColorToRgb, rgbToHsl, resolveThemeColors } from '@/lib/ui/themes';
import { injectThemeStyles } from '@/lib/ui/reader-overlay';
import { READER_COLORS_PREFIX } from '@/lib/constants';

let _cachedThemeColors: any = null;
let _lastThemeDetectionTime = 0;
const THEME_DETECTION_CACHE_TTL = 1500; // ms (Shortened to 1.5s to ensure self-healing updates upon layout switches)
/* Throttled accent search to shield CPU on translation mutations */
let _cachedAccentColor: string | null = null;
let _isAccentCached = false;
let _lastAccentCheckTime = 0;
const ACCENT_CACHE_TTL = 5000; // ms (Responsive refresh)
export { applyCustomThemeToDoc, clearCustomThemeFromDoc };

export function clearThemeDetectionCache() {
  _cachedThemeColors = null;
  _cachedAccentColor = null;
  _isAccentCached = false;
}

/**
 * Performant utility function to suppress custom layout mutation alerts while
 * dynamically updating stylesheet structures across root elements. Supports
 * both synchronous and asynchronous functions by holding the lock until settlement.
 */
function runWithThemeLock<T>(fn: () => T): T {
  if (typeof window === 'undefined') {
    return fn();
  }
  (window as any).__nt_applying_theme__ = true;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        // Keep lock active through the macro-task transition after async resolution
        setTimeout(() => {
          (window as any).__nt_applying_theme__ = false;
          // Safely notify the content script to perform layout & cache sweep post-lock release
          if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('nt-theme-lock-released'));
          }
        }, 100);
      }) as any;
    } else {
      setTimeout(() => {
        (window as any).__nt_applying_theme__ = false;
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('nt-theme-lock-released'));
        }
      }, 100);
      return result;
    }
  } catch (e) {
    (window as any).__nt_applying_theme__ = false;
    throw e;
  }
}

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
  return resolveThemeColors(activeThemeName, cfg.customThemes || cfg.userThemes);
}

export function adjustLightness(rgb: { r: number, g: number, b: number }, offset: number): string {
  const r = Math.max(0, Math.min(255, rgb.r + offset));
  const g = Math.max(0, Math.min(255, rgb.g + offset));
  const b = Math.max(0, Math.min(255, rgb.b + offset));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function isValidAccent(rgb: { r: number, g: number, b: number }, isDark: boolean): boolean {
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  if (hsl.s < 35) return false;
  if (hsl.l < 15 || hsl.l > 85) return false;

  return true;
}

function findDOMAccentColor(isDark: boolean): string | null {
  const now = Date.now();
  if (_isAccentCached && (now - _lastAccentCheckTime) < ACCENT_CACHE_TTL) {
    return _cachedAccentColor;
  }
  _lastAccentCheckTime = now;
  _isAccentCached = true;

  const rootStyle = window.getComputedStyle(document.documentElement);
  const bodyStyle = window.getComputedStyle(document.body);

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  let cssVars: string[] = [];

  if (host.includes('yatsu.moe')) {
    cssVars = ['--yatsu-accent', '--color-accent', '--accent-color', '--theme-accent'];
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
    const inlineValue = typeof document !== 'undefined' && document.documentElement
      ? document.documentElement.style.getPropertyValue(cssVar)
      : '';
    if (inlineValue && document.documentElement) {
      document.documentElement.style.removeProperty(cssVar);
    }
    const val = rootStyle.getPropertyValue(cssVar).trim() || bodyStyle.getPropertyValue(cssVar).trim();
    if (inlineValue && document.documentElement) {
      document.documentElement.style.setProperty(cssVar, inlineValue);
    }
    if (val) {
      const rgb = parseColorToRgb(val);
      if (isValidAccent(rgb, isDark)) {
        _cachedAccentColor = val;
        return val;
      }
    }
  }

  _cachedAccentColor = null;
  return null;
}

export function detectReaderThemeColors(): any {
  const now = Date.now();
  if (_cachedThemeColors && (now - _lastThemeDetectionTime) < THEME_DETECTION_CACHE_TTL) {
    return _cachedThemeColors;
  }

  try {
    const root = document.documentElement;
    const shadowedProps = [
      '--color-background',
      '--color-text',
      '--color-accent',
      '--nt-background',
      '--nt-text',
      '--nt-accent',
      'background-color',
      'color'
    ];
    const savedValues: Record<string, string> = {};
    for (const prop of shadowedProps) {
      const val = root.style.getPropertyValue(prop);
      if (val) {
        savedValues[prop] = val;
        root.style.removeProperty(prop);
      }
    }

    const rootStyle = window.getComputedStyle(document.documentElement);
    const bodyStyle = window.getComputedStyle(document.body);

    // Try to extract background color from known CSS variables first
    let bgVarColor = '';
    const bgVars = ['--yatsu-background', '--color-background', '--ttu-background', '--yatsu-bg', '--color-bg'];
    for (const bgVar of bgVars) {
      const val = rootStyle.getPropertyValue(bgVar).trim() || bodyStyle.getPropertyValue(bgVar).trim();
      if (val) {
        bgVarColor = val;
        break;
      }
    }

    let bgColor = bgVarColor || bodyStyle.backgroundColor;

    // Try to extract text color from known CSS variables first
    let textVarColor = '';
    const textVars = ['--color-text', '--yatsu-text', '--ttu-text', '--color-text-primary'];
    for (const textVar of textVars) {
      const val = rootStyle.getPropertyValue(textVar).trim() || bodyStyle.getPropertyValue(textVar).trim();
      if (val) {
        textVarColor = val;
        break;
      }
    }

    let textColor = textVarColor || bodyStyle.color;
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

    // Restore our inline variables immediately after querying raw computed styles
    for (const [prop, val] of Object.entries(savedValues)) {
      root.style.setProperty(prop, val);
    }

    const parsedBg = parseColorToRgb(bgColor || '#07070e');
    const parsedText = parseColorToRgb(textColor || '#dde4f0');

    const hslBg = rgbToHsl(parsedBg.r, parsedBg.g, parsedBg.b);
    const hslText = rgbToHsl(parsedText.r, parsedText.g, parsedText.b);
    const isDark = hslBg.l < 50;

    let background = `rgb(${parsedBg.r}, ${parsedBg.g}, ${parsedBg.b})`;
    let surface = isDark ? adjustLightness(parsedBg, 6) : adjustLightness(parsedBg, -6);
    let surfaceAlt = isDark ? adjustLightness(parsedBg, 12) : adjustLightness(parsedBg, -12);
    let border = isDark ? adjustLightness(parsedBg, 22) : adjustLightness(parsedBg, -22);
    let borderHover = isDark ? adjustLightness(parsedBg, 32) : adjustLightness(parsedBg, -32);
    let textMuted = `rgba(${parsedText.r}, ${parsedText.g}, ${parsedText.b}, 0.6)`;

    // Dynamically compute an elegant, theme-fitting accent color based on theme hue
    let fallbackHue = 42; // Default to warm gold/amber
    let fallbackSat = isDark ? 65 : 60; // Softer, more elegant saturation
    let fallbackLight = isDark ? 62 : 35; // Readable, high-contrast but non-neon lightness

    let accent = '';

    // Raised grayscale saturation threshold from 5% to 12% to classify Slate/Gray themes correctly
    if (hslBg.s >= 12) {
      const bgHue = hslBg.h;
      if (bgHue >= 30 && bgHue < 60) {
        fallbackHue = bgHue - 10;
        fallbackSat = isDark ? 70 : 65;
        fallbackLight = isDark ? 58 : 32;
      } else if (bgHue >= 60 && bgHue < 150) {
        fallbackHue = bgHue + 25;
        fallbackSat = isDark ? 60 : 55;
        fallbackLight = isDark ? 60 : 34;
      } else if (bgHue >= 150 && bgHue < 210) {
        fallbackHue = bgHue + 20;
        fallbackSat = isDark ? 65 : 60;
        fallbackLight = isDark ? 62 : 35;
      } else if (bgHue >= 210 && bgHue < 250) {
        fallbackHue = bgHue + 20;
        fallbackSat = isDark ? 65 : 60;
        fallbackLight = isDark ? 64 : 36;
      } else if (bgHue >= 250 && bgHue < 300) {
        fallbackHue = bgHue + 20;
        fallbackSat = isDark ? 65 : 60;
        fallbackLight = isDark ? 64 : 35;
      } else {
        fallbackHue = (bgHue + 15) % 360;
        fallbackSat = isDark ? 70 : 65;
        fallbackLight = isDark ? 60 : 34;
      }
      const derivedAccentRgb = hslToRgb(fallbackHue, fallbackSat, fallbackLight);
      accent = `rgb(${derivedAccentRgb.r}, ${derivedAccentRgb.g}, ${derivedAccentRgb.b})`;
    } else if (hslText.s >= 5) {
      fallbackHue = hslText.h;
      const derivedAccentRgb = hslToRgb(fallbackHue, fallbackSat, fallbackLight);
      accent = `rgb(${derivedAccentRgb.r}, ${derivedAccentRgb.g}, ${derivedAccentRgb.b})`;
    } else {
      // Use the exact dark-amber accent color hex code on low-saturation/grayscale reader backgrounds
      accent = isDark ? '#f0b429' : '#d97706';
    }

    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const isKnownReader = host.includes('ttsu.app') || host.includes('yatsu.moe') || host.includes('manabe.es');

    // Bypass DOM accent lookups on TTSU, Yatsu, and Yomiyasu completely.
    // This allows the engine to generate beautiful, contrast-optimized dynamic analogous accents
    // directly from the background, completely bypassing clashing native brand teal-blue variables.
    const extractedAccent = isKnownReader ? null : findDOMAccentColor(isDark);
    
    if (extractedAccent) {
      const rgbExtracted = parseColorToRgb(extractedAccent);
      const hslExtracted = rgbToHsl(rgbExtracted.r, rgbExtracted.g, rgbExtracted.b);

      // Raised saturation check to 12% to align with our revised grayscale threshold
      if (hslBg.s < 12 || Math.abs(hslExtracted.h - hslBg.h) < 35 || Math.abs(hslExtracted.h - hslBg.h) > 325) {
        accent = extractedAccent;
      }
    }

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
  runWithThemeLock(() => {
    const useStaticInPageLogo = cfg.useStaticInPageLogo === true;
    if (themeName === 'match-reader') {
      const detectedColors = detectReaderThemeColors();
      if (detectedColors) {
        const host = window.location.hostname;
        browser.storage.local.set({
          [`${READER_COLORS_PREFIX}${host}`]: detectedColors,
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
  });
}

export async function applyActiveTheme(cfg: any): Promise<void> {
  return runWithThemeLock(async () => {
    try {
      let themeName = cfg.theme ?? 'dark-amber';
      let customColors = undefined;

      const isExtensionPage = typeof window !== 'undefined' &&
        (window.location.protocol.startsWith('chrome-extension') || window.location.protocol.startsWith('moz-extension'));

      if (isExtensionPage) {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (activeTab && activeTab.url) {
          const urlObj = new URL(activeTab.url);
          const host = urlObj.hostname;

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
              const stored = await browser.storage.local.get([`${READER_COLORS_PREFIX}${host}`, `readerColors:${host}`]);
              customColors = stored[`${READER_COLORS_PREFIX}${host}`] || stored[`readerColors:${host}`];
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
        const stored = (await browser.storage.local.get([`${READER_COLORS_PREFIX}${host}`, `readerColors:${host}`]).catch(() => ({}))) as Record<string, any>;
        const cachedColors = stored[`${READER_COLORS_PREFIX}${host}`] || stored[`readerColors:${host}`];

        const detectedColors = detectReaderThemeColors();
        if (detectedColors) {
          const parsedBg = parseColorToRgb(detectedColors.background);
          const hslBg = rgbToHsl(parsedBg.r, parsedBg.g, parsedBg.b);
          const isDarkBg = hslBg.l < 50;
          const defaultAccent = isDarkBg ? '#f0b429' : '#d97706';

          if (detectedColors.accent === defaultAccent && cachedColors?.accent) {
            detectedColors.accent = cachedColors.accent;
            detectedColors.accentHover = cachedColors.accentHover || detectedColors.accentHover;
          }

          const colorsHaveChanged = !cachedColors ||
            cachedColors.background !== detectedColors.background ||
            cachedColors.text !== detectedColors.text ||
            cachedColors.accent !== detectedColors.accent;

          if (colorsHaveChanged) {
            await browser.storage.local.set({
              [`${READER_COLORS_PREFIX}${host}`]: detectedColors,
              [`readerColors:${host}`]: detectedColors
            });
          }

          applyCustomThemeToDoc(detectedColors);
          applyThemeToDocument("dark-amber", cfg.font ?? "sans", detectedColors, { useStaticInPageLogo });
          injectThemeStyles('custom', cfg.font ?? 'sans');
        } else {
          clearCustomThemeFromDoc();
          applyThemeToDocument(cfg.theme ?? 'dark-amber', cfg.font ?? 'sans', undefined, { useStaticInPageLogo });
          injectThemeStyles('dark-amber', cfg.font ?? 'sans');
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
  });
}

export function getReaderConfig(cfg: any) {
  const safeCfg = cfg || {};
  const adapter = getActiveReaderAdapter();
  const autoSave = safeCfg.readerAutoSave ?? safeCfg.ttuAutoSave ?? true;
  const directSend = safeCfg.readerDirectSend ?? safeCfg.ttuDirectSend ?? false;

  let enabled = safeCfg.ttuEnabled ?? true;
  if (adapter) {
    enabled = adapter.isEnabled(safeCfg);
  }
  return { enabled, autoSave, directSend };
}
