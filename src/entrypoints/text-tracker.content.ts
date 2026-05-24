/**
 * ── Text Tracker Content Script ──────────────────────────────────────────────
 */
import { defineContentScript } from '#imports';
import { configStorage } from '@/lib/storage/config';
import { readingQueueStorage } from '@/lib/storage/queues';
import { ttuHistoryStorage, ttuLinkStorage } from '@/lib/storage/ttu';
import { addDebugLog } from '@/lib/storage/debug';
import { SKIP_HOSTS_DEFAULT, JP_DOMAINS_DEFAULT, JP_RE, TTU_HOSTS } from '@/lib/constants';
import { parseTitle } from '@/lib/utils/text-parsing';
import { showToast } from '@/lib/utils/toast';
import { injectThemeStyles, buildOverlay } from '@/lib/ui/reader-overlay';
import { setupTTUChronometerUI } from '@/lib/ui/ttu-chrono';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';
import { fmt } from '@/lib/utils/time';
import '@/assets/overlay.css';

let currentConfig: any = {};
let websiteOverlayDismissed = false;
let isAnalyzingPage = false;
let cachedIsJapanese: boolean | null = null;

// Trackers to optimize mutation and chrono lookups
let lastObservedContainerId = '';
let progressObserver: MutationObserver | null = null;
let scrollTimeout: any = null;
let isChronoInitializing = false;

function getActiveThemeName(cfg: any): string {
  const host = window.location.hostname;
  if (host.includes('reader.ttsu.app') || host.includes('ttsu.app')) {
    const override = cfg.ttuThemeOverride ?? 'global';
    if (override !== 'global') return override;
  } else if (host.includes('app.yatsu.moe')) {
    const override = cfg.yatsuThemeOverride ?? 'global';
    if (override !== 'global') return override;
  } else if (host.includes('manga.manabe.es')) {
    const override = cfg.manabeThemeOverride ?? 'global';
    if (override !== 'global') return override;
  }
  return cfg.theme ?? 'nihongo';
}

function getCustomColorsForSite(cfg: any): any {
  const host = window.location.hostname;
  if (host.includes('reader.ttsu.app') || host.includes('ttsu.app')) {
    if (cfg.ttuThemeOverride === 'custom') return cfg.ttuCustomColors;
  } else if (host.includes('app.yatsu.moe')) {
    if (cfg.yatsuThemeOverride === 'custom') return cfg.yatsuCustomColors;
  } else if (host.includes('manga.manabe.es')) {
    if (cfg.manabeThemeOverride === 'custom') return cfg.manabeCustomColors;
  }
  return cfg.customColors;
}

/**
 * Parses any color format (hex or rgb/rgba) to numerical RGB components.
 */
function parseColorToRgb(colorStr: string): { r: number, g: number, b: number } {
  const defaultVal = { r: 7, g: 7, b: 14 }; // Default dark background
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

/**
 * Converts RGB components to Hue, Saturation, Lightness.
 */
function rgbToHsl(r: number, g: number, b: number) {
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

/**
 * Converts Hue, Saturation, Lightness components back to RGB.
 */
function hslToRgb(h: number, s: number, l: number) {
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
 * Shifts the lightness of an RGB color by a safe offset.
 */
function adjustLightness(rgb: { r: number, g: number, b: number }, offset: number): string {
  const r = Math.max(0, Math.min(255, rgb.r + offset));
  const g = Math.max(0, Math.min(255, rgb.g + offset));
  const b = Math.max(0, Math.min(255, rgb.b + offset));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * Dynamically extracts computed styles from the reader viewport to adaptive contrast matching.
 */
function detectReaderThemeColors(): any {
  try {
    const bodyStyle = window.getComputedStyle(document.body);
    let bgColor = bodyStyle.backgroundColor;

    // Find active reader content element for robust text color tracking (bypassing unstyled body color fallbacks)
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

    // Extract HSL from background to calculate safe hue/contrast shifts
    const hslBg = rgbToHsl(parsedBg.r, parsedBg.g, parsedBg.b);
    const isDark = hslBg.l < 50;

    // Shift Hue of the background color by 12 degrees to get a beautifully rich, contrasting panel color!
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

    return {
      background,
      surface,
      surfaceAlt,
      border,
      borderHover,
      text: textColor,
      textMuted,
      accent,
      accentHover
    };
  } catch (e) {
    return null;
  }
}

function updateActiveThemeStyles(themeName: string, cfg: any) {
  if (themeName === 'match-reader') {
    const detectedColors = detectReaderThemeColors();
    if (detectedColors) {
      applyCustomThemeToDoc(detectedColors);
      injectThemeStyles('custom', cfg.font ?? 'mono');
    } else {
      clearCustomThemeFromDoc();
      injectThemeStyles(cfg.theme ?? 'dark-amber', cfg.font ?? 'mono');
    }
  } else if (themeName === 'custom') {
    const colors = getCustomColorsForSite(cfg);
    applyCustomThemeToDoc(colors);
    injectThemeStyles('custom', cfg.font ?? 'mono');
  } else {
    clearCustomThemeFromDoc();
    injectThemeStyles(themeName, cfg.font ?? 'mono');
  }
}

function applyCustomThemeToDoc(customColors: any) {
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
  };
  for (const [prop, val] of Object.entries(mapping)) {
    if (val) root.style.setProperty(prop, val, 'important');
  }
}

function clearCustomThemeFromDoc() {
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
    "--color-accent-hover"
  ];
  for (const prop of props) {
    root.style.removeProperty(prop);
  }
}

function getReaderConfig(cfg: any) {
  const host = window.location.hostname;
  const autoSave = cfg.readerAutoSave ?? cfg.ttuAutoSave ?? true;
  const directSend = cfg.readerDirectSend ?? cfg.ttuDirectSend ?? false;

  if (host.includes('app.yatsu.moe')) {
    return { enabled: cfg.yatsuEnabled ?? true, autoSave, directSend };
  }
  if (host.includes('manga.manabe.es')) {
    return { enabled: cfg.manabeEnabled ?? true, autoSave, directSend };
  }
  return { enabled: cfg.ttuEnabled ?? true, autoSave, directSend };
}

function isWebsiteOverlaySkipped(cfg: any): boolean {
  const host = window.location.hostname;
  const skipSites: string[] = cfg?.skipSites ?? ['youtube.com', 'youtu.be', 'crunchyroll.com', 'animekai.to', 'music.youtube.com', 'nihongotracker.app'];
  if (SKIP_HOSTS_DEFAULT.some(h => host.includes(h))) return true;
  if (skipSites.some((h: string) => host.includes(h))) return true;
  return false;
}

async function isJapanesePage(cfg: any): Promise<boolean> {
  if (cachedIsJapanese !== null) return cachedIsJapanese;

  const host = window.location.hostname;
  const allowSites: string[] = cfg.allowSites ?? [...JP_DOMAINS_DEFAULT];
  const allowListOnly: boolean = cfg.allowListOnly ?? false;

  if (allowSites.some((d: string) => host.includes(d))) {
    cachedIsJapanese = true;
    return true;
  }
  if (allowListOnly) {
    cachedIsJapanese = false;
    return false;
  }

  const lang = document.documentElement.lang;
  if (lang.startsWith('ja')) {
    cachedIsJapanese = true;
    return true;
  }

  await new Promise(r => setTimeout(r, 1500));
  const sample = (document.body?.innerText ?? '').slice(0, 8000);
  const jpCount = (sample.match(JP_RE) ?? []).length;
  const result = jpCount >= 40;

  addDebugLog('INFO', 'TextTracker', `Page Analysis`, {
    host,
    japaneseCharsFound: jpCount,
    isJapanese: result
  });

  cachedIsJapanese = result;
  return result;
}

interface StateRefs {
  globalSessionStartChar: number;
  globalManualCharOffset: number;
  globalLastTick: number;
  lastSectionIndex: number;
  lastSectionTotal: number;
  visitedSections: Map<number, number>;
}

const stateRefs: StateRefs = {
  globalSessionStartChar: -1,
  globalManualCharOffset: 0,
  globalLastTick: Date.now(),
  lastSectionIndex: -1,
  lastSectionTotal: 0,
  visitedSections: new Map<number, number>()
};

/**
 * Reactive proxy container for the tracking state.
 * Intercepts resets to synchronize the tick baseline, eliminating fractional carryover.
 */
const ttuState = new Proxy({
  id: crypto.randomUUID(),
  running: false,
  timeMs: 0,
  chars: 0,
}, {
  set(target, prop, value) {
    if (prop === 'timeMs') {
      const numVal = Number(value) || 0;
      if (numVal < target.timeMs || numVal === 0) {
        stateRefs.globalLastTick = Date.now();
      }
      target.timeMs = numVal;
      return true;
    }
    if (prop === 'chars') {
      target.chars = Number(value) || 0;
      return true;
    }
    (target as any)[prop] = value;
    return true;
  }
});

let isSyncing = false;

function getTTUTitle() {
  let title = document.title;
  try {
    if (window.self !== window.top && window.top) {
      title = window.top.document.title || title;
    }
  } catch (e) { }
  title = title.replace(/\s*\|\s*(ッツ Ebook Reader|Yatsu Reader|Manabe Reader)\s*/i, '');
  title = title.replace(/\s*[–—-]\s*ttu.*$/i, '');
  return title.trim() || document.title;
}

function parseTitleWithConfig(docTitle: string) {
  return parseTitle(docTitle, currentConfig.titleRegexes);
}

function getReaderName() {
  const host = window.location.hostname;
  if (host.includes('app.yatsu.moe')) return 'Yatsu Reader';
  if (host.includes('manga.manabe.es')) return 'Manabe Reader';
  if (host.includes('reader.ttsu.app')) return 'TTU Reader';
  return 'Reader';
}

/**
 * Validates if the user is currently looking at active reading content.
 */
function isReadingViewActive(): boolean {
  const path = window.location.pathname;
  if (path.includes('/settings') || path === '/' || path === '') {
    return false;
  }
  const hasContainer = !!(
    document.querySelector('.book-content-container') ||
    document.querySelector('.book-content') ||
    document.querySelector('[data-ref="container"]') ||
    document.querySelector('.reader-container')
  );
  return hasContainer;
}

async function liveSyncQueue() {
  if (isSyncing || (ttuState.timeMs === 0 && ttuState.chars === 0)) return;
  isSyncing = true;

  try {
    const rawTitle = getTTUTitle();
    const { query: parsedTitle, volume: parsedVolume } = parseTitleWithConfig(rawTitle);
    const dateStr = new Date().toISOString();
    const secs = Math.round(ttuState.timeMs / 1000);

    const queue = await readingQueueStorage.getValue();
    let existing = queue.find(q => q.originalTitle === rawTitle || q.contentTitleNative === rawTitle);

    const linkMap = await ttuLinkStorage.getValue() || {};
    const linkedMedia = linkMap[rawTitle];

    await addDebugLog('INFO', 'TextTracker', `liveSyncQueue executed`, { rawTitle, parsedTitle, timeMs: ttuState.timeMs, chars: ttuState.chars });

    if (!existing) {
      existing = {
        id: crypto.randomUUID(), type: 'reading',
        contentTitleNative: parsedTitle,
        contentTitleEnglish: '',
        originalTitle: rawTitle,
        description: parsedTitle,
        chars: ttuState.chars, time: secs,
        volume: parsedVolume || 1,
        date: dateStr, private: false, tags: [],
        sessions: [{ id: ttuState.id, secs: secs, chars: ttuState.chars, date: dateStr }],
        readerName: getReaderName()
      };
      queue.push(existing);
    } else {
      existing.originalTitle = existing.originalTitle || rawTitle;
      existing.readerName = getReaderName();

      if (!existing.mediaId || existing.mediaId === 'web-reading') {
        existing.contentTitleNative = existing.contentTitleNative || parsedTitle;
        if (parsedVolume !== undefined && !existing.volume) {
          existing.volume = parsedVolume;
        }
      }

      existing.sessions = existing.sessions || [];
      const sIdx = existing.sessions.findIndex((s: any) => s.id === ttuState.id);

      if (sIdx >= 0) {
        existing.sessions[sIdx].secs = secs;
        existing.sessions[sIdx].chars = ttuState.chars;
        existing.sessions[sIdx].date = dateStr;
      } else {
        existing.sessions.push({ id: ttuState.id, secs: secs, chars: ttuState.chars, date: dateStr });
      }

      existing.chars = existing.sessions.reduce((acc: any, s: any) => acc + s.chars, 0);
      existing.time = existing.sessions.reduce((acc: any, s: any) => acc + s.secs, 0);
    }

    if (linkedMedia) {
      existing.mediaId = String(linkedMedia.mediaId);
      existing.mediaData = linkedMedia.mediaData;
      existing.volume = linkedMedia.volume;
      existing.contentTitleNative = linkedMedia.mediaData.contentTitleNative || existing.contentTitleNative;
      existing.contentTitleEnglish = linkedMedia.mediaData.contentTitleEnglish || existing.contentTitleEnglish;
      existing.description = linkedMedia.mediaData.contentTitleNative || existing.contentTitleNative;
    }

    await readingQueueStorage.setValue(queue);
  } finally {
    isSyncing = false;
  }
}

async function saveSessionAndQueue() {
  if (ttuState.timeMs === 0 && ttuState.chars === 0) return;

  await addDebugLog('INFO', 'TextTracker', `Saving explicit TTU session`, { chars: ttuState.chars, timeMs: ttuState.timeMs });

  const title = getTTUTitle();
  const dateStr = new Date().toISOString();
  const sessionLog = { id: ttuState.id, date: dateStr, timeMs: ttuState.timeMs, chars: ttuState.chars };

  const history = await ttuHistoryStorage.getValue() || {};
  if (!history[title]) history[title] = [];
  history[title].push(sessionLog);
  await ttuHistoryStorage.setValue(history);

  await liveSyncQueue();

  ttuState.id = crypto.randomUUID();
  ttuState.timeMs = 0;
  ttuState.chars = 0;

  const currentCount = extractAdvancedCharCount();
  stateRefs.globalSessionStartChar = currentCount !== null ? currentCount.current : -1;
  stateRefs.globalManualCharOffset = 0;
  stateRefs.lastSectionIndex = -1;
  stateRefs.lastSectionTotal = 0;
  stateRefs.visitedSections.clear();
  stateRefs.globalLastTick = Date.now();
  ttuState.running = false;

  showToast('Success', 'Session queued!');
}

function findTTUInsertPoint(): { el: Element, pos: InsertPosition } | null {
  if (typeof document === 'undefined') return null;

  const footer = document.getElementById('ttu-page-footer');
  if (footer) {
    const flexGroups = Array.from(footer.children).filter(el =>
      el.classList.contains('flex') && !el.classList.contains('fixed') && !el.classList.contains('absolute') && el.id !== 'nt-ttu-chrono-wrapper');
    if (flexGroups.length > 0) return { el: flexGroups[flexGroups.length - 1], pos: 'beforeend' };
    return { el: footer, pos: 'afterbegin' };
  }

  const progressDiv = document.querySelector('div[title="Click to copy Progress"]');
  if (progressDiv && progressDiv.parentElement) {
    const container = progressDiv.parentElement;
    const leftGroup = Array.from(container.children).find(el => el.classList.contains('flex') && el.classList.contains('h-full') && el.id !== 'nt-ttu-chrono-wrapper');
    if (leftGroup) return { el: leftGroup, pos: 'beforeend' };
    return { el: container, pos: 'afterbegin' };
  }

  return null;
}

function getTtuNativeProgressFromDom(): { current: number; total: number } | null {
  try {
    const copyDivs = Array.from(document.querySelectorAll('div[title="Click to copy Progress"]'));
    const visibleCopyDiv = copyDivs.find(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0';
    });

    if (visibleCopyDiv && visibleCopyDiv.textContent) {
      const text = visibleCopyDiv.textContent;
      const match = text.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
      }
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const parent = n.parentElement;
      if (!parent) continue;

      const val = (n.nodeValue || '').trim();
      if (val.includes('/') && !parent.closest('#nt-ttu-chrono-wrapper, #nt-overlay, script, style')) {
        const rect = parent.getBoundingClientRect();
        const style = getComputedStyle(parent);
        if (rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0') {
          const text = val.replace(/,/g, '');
          const match = text.match(/^(\d+)\s*\/\s*(\d+)/);
          if (match) {
            return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
          }
        }
      }
    }
  } catch (e) { }
  return null;
}

/**
 * Perform progression mapping and dispatch instant UI updates.
 */
function recalculateChars() {
  if (!ttuState.running) return;

  if (!isReadingViewActive()) {
    ttuState.running = false;
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
    return;
  }

  const charData = extractAdvancedCharCount();
  if (charData !== null) {
    const { current } = charData;

    if (stateRefs.globalSessionStartChar === -1) {
      stateRefs.globalSessionStartChar = current;
    }

    let diff = current - stateRefs.globalSessionStartChar;
    if (diff < 0) diff = 0;

    let calculatedChars = diff + stateRefs.globalManualCharOffset;
    ttuState.chars = calculatedChars;

    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
  }
}

/**
 * Targets and observes Svelte/TTU's progress changes directly.
 */
function setupProgressObserver() {
  if (progressObserver) return;

  const target = document.querySelector('div[title="Click to copy Progress"]');
  if (!target) return;

  progressObserver = new MutationObserver(() => {
    if (ttuState.running && isReadingViewActive()) {
      recalculateChars();
    }
  });

  progressObserver.observe(target, { childList: true, characterData: true, subtree: true });
}

async function checkAndRunOverlay(cfg: any) {
  if (window.self !== window.top) return;
  if (isWebsiteOverlaySkipped(cfg)) return; // Strictly block execution on skipped sites like YouTube

  if (isAnalyzingPage) return;
  const existing = document.getElementById('nt-overlay');
  if (existing) return;

  isAnalyzingPage = true;
  try {
    const isJP = await isJapanesePage(cfg);
    if (isJP && cfg.overlayPosition !== 'hidden' && !document.getElementById('nt-overlay')) {
      runOverlaySetup(cfg);
    }
  } catch (e) {
    addDebugLog('ERROR', 'TextTracker', 'Error during overlay builder execution', { error: e });
  } finally {
    isAnalyzingPage = false;
  }
}

async function setupTTUChronometer() {
  if (isChronoInitializing) return;
  if (document.getElementById('nt-ttu-chrono-wrapper')) return;

  isChronoInitializing = true;
  try {
    const pt = findTTUInsertPoint();
    if (!pt) return;

    setupTTUChronometerUI(pt, currentConfig, ttuState, stateRefs, {
      getTTUTitle,
      parseTitleWithConfig,
      extractTTUCharCount: () => {
        const res = extractAdvancedCharCount();
        return res !== null ? res.current : null;
      },
      getReaderName,
      getReaderConfig,
      liveSyncQueue,
      saveSessionAndQueue
    });

    setupProgressObserver();

    if ((window as any).ntChronoInterval) {
      clearInterval((window as any).ntChronoInterval);
    }

    (window as any).ntChronoInterval = setInterval(() => {
      if (!isReadingViewActive()) {
        if (ttuState.running) {
          ttuState.running = false;
          const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
          if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
        }
        return;
      }

      if (ttuState.running && !document.hidden) {
        const now = Date.now();
        ttuState.timeMs += (now - stateRefs.globalLastTick);

        const charData = extractAdvancedCharCount();
        if (charData !== null) {
          const { current } = charData;

          if (stateRefs.globalSessionStartChar === -1) {
            stateRefs.globalSessionStartChar = current;
            addDebugLog('INFO', 'TextTracker', 'Set session starting baseline', { baseline: current });
          }

          let diff = current - stateRefs.globalSessionStartChar;
          if (diff < 0) diff = 0;

          let calculatedChars = diff + stateRefs.globalManualCharOffset;

          const nativeTtuProgress = getTtuNativeProgressFromDom();

          ttuState.chars = calculatedChars;

          addDebugLog('INFO', 'TextTracker', 'Chronometer Tick Progress', {
            calculatedCurrentInActiveSection: current,
            startingSessionBaseline: stateRefs.globalSessionStartChar,
            diffReadThisSession: diff,
            manualOffsetCalculated: stateRefs.globalManualCharOffset,
            finalCalculatedChars: ttuState.chars,
            activeSection: stateRefs.lastSectionIndex,
            nativeTtuProgressCurrent: nativeTtuProgress ? nativeTtuProgress.current : 'not found',
            nativeTtuProgressTotal: nativeTtuProgress ? nativeTtuProgress.total : 'not found'
          });
        }
        stateRefs.globalLastTick = now;

        const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
        if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));

        if (getReaderConfig(currentConfig).autoSave !== false) liveSyncQueue();
      } else if (ttuState.running && document.hidden) {
        stateRefs.globalLastTick = Date.now();
      }
    }, 1000);
  } finally {
    isChronoInitializing = false;
  }
}

// ── Ultra-Performant Interaction Hooks ────────────────────────────────────────
if (typeof window !== 'undefined') {
  const handleScrollUpdate = () => {
    if (!ttuState.running || !isReadingViewActive()) return;
    if (scrollTimeout) clearTimeout(scrollTimeout);

    scrollTimeout = setTimeout(() => {
      recalculateChars();
    }, 150);
  };

  window.addEventListener('scroll', handleScrollUpdate, { passive: true, capture: true });
  window.addEventListener('resize', handleScrollUpdate, { passive: true });

  window.addEventListener('click', () => {
    if (ttuState.running && isReadingViewActive()) {
      setTimeout(recalculateChars, 40);
    }
  }, { passive: true });

  window.addEventListener('keyup', (e) => {
    if (ttuState.running && isReadingViewActive() && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown'].includes(e.key)) {
      setTimeout(recalculateChars, 40);
    }
  }, { passive: true });
}

if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(() => {
    // 1. TTU Chrono insert check
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    const target = findTTUInsertPoint();
    if (target && !wrapper) {
      const readerCfg = getReaderConfig(currentConfig);
      if (readerCfg.enabled !== false) setupTTUChronometer();
    }

    if (ttuState.running && isReadingViewActive()) {
      setupProgressObserver();
    }

    // 2. High-Performance Container Transition detector.
    const charData = extractAdvancedCharCount();
    if (charData !== null) {
      const { total, sectionIndex, isPaginated } = charData;
      const activeSection = sectionIndex !== null ? sectionIndex : -1;

      if (stateRefs.lastSectionIndex !== activeSection) {
        addDebugLog('INFO', 'TextTracker', 'Section transition detected', {
          from: stateRefs.lastSectionIndex,
          to: activeSection
        });

        if (isPaginated && activeSection !== -1) {
          stateRefs.globalSessionStartChar = 0;
          addDebugLog('INFO', 'TextTracker', 'Paginated transition. Initialized baseline to 0.');
        } else {
          stateRefs.globalSessionStartChar = -1;
        }

        if (activeSection === -1) {
          stateRefs.lastSectionIndex = -1;
          stateRefs.globalManualCharOffset = 0;
          stateRefs.visitedSections.clear();
          addDebugLog('INFO', 'TextTracker', 'Reset dynamic tracking baseline to 0. Cleared visitedSections cache.');
        } else {
          if (stateRefs.lastSectionIndex === -1) {
            stateRefs.lastSectionIndex = activeSection;
            stateRefs.lastSectionTotal = total;
            stateRefs.visitedSections.set(activeSection, 0);
          }

          if (stateRefs.lastSectionIndex !== activeSection) {
            if (activeSection > stateRefs.lastSectionIndex) {
              if (stateRefs.visitedSections.has(activeSection)) {
                stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(activeSection) || 0;
              } else {
                stateRefs.globalManualCharOffset += stateRefs.lastSectionTotal;
                stateRefs.visitedSections.set(activeSection, stateRefs.globalManualCharOffset);
              }
            } else {
              if (stateRefs.visitedSections.has(activeSection)) {
                stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(activeSection) || 0;
              } else {
                stateRefs.globalManualCharOffset = Math.max(0, stateRefs.globalManualCharOffset - total);
                stateRefs.visitedSections.set(activeSection, stateRefs.globalManualCharOffset);
              }
            }
          }

          stateRefs.lastSectionIndex = activeSection;
          stateRefs.lastSectionTotal = total;
        }

        recalculateChars();
      }
    }

    // 3. Real-time background color theme change tracking.
    const activeTheme = getActiveThemeName(currentConfig);
    if (activeTheme === 'match-reader') {
      updateActiveThemeStyles('match-reader', currentConfig);
    }

    // 4. Non-TTU Overlay recovery check
    if (!TTU_HOSTS.some(h => window.location.hostname.includes(h))) {
      if (window.self === window.top && currentConfig.overlayPosition !== 'hidden' && !websiteOverlayDismissed) {
        const overlay = document.getElementById('nt-overlay');
        if (!overlay) {
          addDebugLog('INFO', 'TextTracker', 'Overlay removed by host page DOM changes. Rebuilding overlay...');
          checkAndRunOverlay(currentConfig);
        }
      }
    }
  });
  // We added attributes observer to track class and style changes on body, making sure theme updates inside the reader get captured instantly.
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
}

if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((req: any, _s, sendResponse) => {
    if (req.action === 'GET_ACTIVE_TIME') {
      const nt = (window as any).__nt_tracker_session_active_ms__;
      if (nt && nt.getTotal) sendResponse({ minutes: Math.floor(nt.getTotal() / 60000) });
    }
    if (req.action === 'SHOW_TOAST') {
      if (window.self !== window.top) return;
      const title = String(req.title || '');
      const msg = req.message || '';
      showToast(title, msg, title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
    }
  });
}

window.addEventListener('message', (event) => {
  if (event.data?.action === 'SHOW_TOAST') {
    if (window.self !== window.top) return;
    const title = String(event.data.title || '');
    const msg = event.data.message || '';
    showToast(title, msg, event.data.error || title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
  }
});

function startTimeTracker() {
  let activeMs = 0, lastStamp = Date.now(), isVisible = !document.hidden, isPaused = false;
  const accrue = () => { if (isVisible && !isPaused) { activeMs += Date.now() - lastStamp; lastStamp = Date.now(); } };
  const getTotal = () => activeMs + (isVisible && !isPaused ? Date.now() - lastStamp : 0);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { accrue(); isVisible = false; } else { lastStamp = Date.now(); isVisible = true; }
  });

  (window as any).__nt_tracker_session_active_ms__ = {
    getTotal,
    setMs: (ms: number) => { accrue(); activeMs = ms; lastStamp = Date.now(); },
    pause: (p: boolean) => { if (p) { accrue(); isPaused = true; } else { lastStamp = Date.now(); isPaused = false; } },
    isPaused: () => isPaused
  };
}

function applyOverlayPosition(overlay: HTMLElement, pos: string) {
  overlay.style.setProperty('top', '', 'important');
  overlay.style.setProperty('bottom', '', 'important');
  overlay.style.setProperty('left', '', 'important');
  overlay.style.setProperty('right', '', 'important');

  if (pos === 'top-left') {
    overlay.style.setProperty('top', '16px', 'important');
    overlay.style.setProperty('left', '16px', 'important');
  } else if (pos === 'top-right') {
    overlay.style.setProperty('top', '16px', 'important');
    overlay.style.setProperty('right', '16px', 'important');
  } else if (pos === 'bottom-left') {
    overlay.style.setProperty('bottom', '16px', 'important');
    overlay.style.setProperty('left', '16px', 'important');
  } else if (pos === 'bottom-right') {
    overlay.style.setProperty('bottom', '16px', 'important');
    overlay.style.setProperty('right', '16px', 'important');
  }
}

/**
 * Injects CSS rules targeting control buttons with high specificity
 * to completely eliminate default and theme-enforced border boxes.
 */
function injectOverlayCustomOverrides() {
  if (document.getElementById('nt-overlay-custom-overrides')) return;
  const style = document.createElement('style');
  style.id = 'nt-overlay-custom-overrides';
  style.textContent = `
    #nt-overlay {
      /* ── TRANSPARENCY SETTINGS ──────────────────────────────────────────
         Adjust "opacity" below to change base transparency when not hovered.
         0.0 = completely invisible, 1.0 = completely solid.
      */
      opacity: 0.35 !important;
      transition: opacity 0.15s ease-in-out !important;
    }
    #nt-overlay:hover {
      opacity: 1 !important;
    }

    #nt-overlay .nt-ctrl,
    #nt-overlay .nt-close {
      border: none !important;
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      outline: none !important;
      padding: 0 1px !important;
      margin: 0 !important;
      border-radius: 0 !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: 100% !important;
      line-height: 1 !important;
      vertical-align: middle !important;
    }
    #nt-overlay button {
      border: none !important;
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      outline: none !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Sets size and vertical scaling classes directly on the pause button.
 * Resolves disproportionately small native width profiles on ⏸ double bar glyph.
 */
function updatePauseIconState(pauseBtn: HTMLButtonElement, isPaused: boolean) {
  pauseBtn.textContent = isPaused ? '▶' : '⏸';
  if (isPaused) {
    pauseBtn.style.setProperty('font-size', '10px', 'important');
    pauseBtn.style.setProperty('transform', 'none', 'important');
  } else {
    pauseBtn.style.setProperty('font-size', '13px', 'important');
    // Offset baseline displacement common to vertical line double-bar unicode glyphtypes
    pauseBtn.style.setProperty('transform', 'translateY(-1px)', 'important');
  }
}

/**
 * Enforces key horizontal layout metrics directly as inline rules.
 * This prevents theme style changes from breaking alignment or wrapping elements.
 */
function enforceOverlayLayout(overlay: HTMLElement) {
  overlay.style.setProperty('display', 'flex', 'important');
  overlay.style.setProperty('flex-direction', 'row', 'important');
  overlay.style.setProperty('align-items', 'center', 'important');
  overlay.style.setProperty('justify-content', 'space-between', 'important');
  overlay.style.setProperty('gap', '4px', 'important');
  overlay.style.setProperty('padding', '0 6px', 'important');
  overlay.style.setProperty('box-sizing', 'border-box', 'important');
  overlay.style.setProperty('white-space', 'nowrap', 'important');
  overlay.style.setProperty('height', '22px', 'important');
  overlay.style.setProperty('width', 'auto', 'important');
  overlay.style.setProperty('min-width', 'unset', 'important');
  overlay.style.setProperty('min-height', 'unset', 'important');
  overlay.style.setProperty('line-height', '1', 'important');

  const handle = overlay.querySelector('.nt-handle') as HTMLElement;
  if (handle) {
    handle.style.setProperty('display', 'inline-flex', 'important');
    handle.style.setProperty('align-items', 'center', 'important');
    handle.style.setProperty('justify-content', 'center', 'important');
    handle.style.setProperty('cursor', 'grab', 'important');
    handle.style.setProperty('user-select', 'none', 'important');
    handle.style.setProperty('margin-right', '1px', 'important');
    handle.style.setProperty('font-size', '10px', 'important');
    handle.style.setProperty('height', '100%', 'important');
    handle.style.setProperty('line-height', '1', 'important');
  }

  const timeEl = overlay.querySelector('.nt-time') as HTMLElement;
  if (timeEl) {
    timeEl.style.setProperty('display', 'inline-flex', 'important');
    timeEl.style.setProperty('align-items', 'center', 'important');
    timeEl.style.setProperty('justify-content', 'center', 'important');
    timeEl.style.setProperty('font-variant-numeric', 'tabular-nums', 'important');
    timeEl.style.setProperty('margin-right', '2px', 'important');
    timeEl.style.setProperty('font-size', '12px', 'important');
    timeEl.style.setProperty('height', '100%', 'important');
    timeEl.style.setProperty('line-height', '1', 'important');
  }

  // Force strict centered alignment inside all overlay buttons
  const buttons = overlay.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.style.setProperty('display', 'inline-flex', 'important');
    btn.style.setProperty('align-items', 'center', 'important');
    btn.style.setProperty('justify-content', 'center', 'important');
    btn.style.setProperty('height', '100%', 'important');
    btn.style.setProperty('line-height', '1', 'important');
    btn.style.setProperty('vertical-align', 'middle', 'important');
  });
}

function runOverlaySetup(cfg: any) {
  addDebugLog('INFO', 'TextTracker', `Building Overlay`, {
    url: window.location.href,
    pos: cfg.overlayPosition
  });

  if (websiteOverlayDismissed) {
    const existing = document.getElementById('nt-overlay');
    if (existing) existing.style.display = 'none';
    return;
  }

  let overlay = document.getElementById('nt-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'nt-overlay';
    const handle = document.createElement('div');
    handle.className = 'nt-handle'; handle.title = 'Drag to move'; handle.innerHTML = '⠿';
    const timeEl = document.createElement('span');
    timeEl.className = 'nt-time'; timeEl.textContent = '0:00'; timeEl.title = 'Click to edit';
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'nt-ctrl'; pauseBtn.title = 'Pause / Resume';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'nt-ctrl'; resetBtn.textContent = '↺'; resetBtn.title = 'Reset timer';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'nt-close'; closeBtn.textContent = '×'; closeBtn.title = 'Hide overlay (until reload)';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); websiteOverlayDismissed = true; overlay!.style.display = 'none'; });

    // Initial state setup for play/pause toggle sizes
    updatePauseIconState(pauseBtn, false);
    resetBtn.style.setProperty('font-size', '11px', 'important');
    closeBtn.style.setProperty('font-size', '12px', 'important');

    overlay.append(handle, timeEl, pauseBtn, resetBtn, closeBtn);
    document.body.appendChild(overlay);

    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', e => {
      dragging = true;
      const r = overlay!.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      overlay!.style.setProperty('right', '', 'important');
      overlay!.style.setProperty('bottom', '', 'important');
      overlay!.style.setProperty('left', r.left + 'px', 'important');
      overlay!.style.setProperty('top', r.top + 'px', 'important');
      handle.style.cursor = 'grabbing'; e.preventDefault();
    });
    document.addEventListener('mousemove', e => { if (dragging) { overlay!.style.setProperty('left', (e.clientX - ox) + 'px', 'important'); overlay!.style.setProperty('top', (e.clientY - oy) + 'px', 'important'); } });
    document.addEventListener('mouseup', () => { if (dragging) { dragging = false; handle.style.cursor = 'grab'; } });

    pauseBtn.addEventListener('click', () => {
      const nt = (window as any).__nt_tracker_session_active_ms__;
      if (nt) {
        const nowPaused = !nt.isPaused();
        nt.pause(nowPaused);
        updatePauseIconState(pauseBtn, nowPaused);
        pauseBtn.classList.toggle('active', nowPaused);
      }
    });
    resetBtn.addEventListener('click', () => {
      const nt = (window as any).__nt_tracker_session_active_ms__;
      if (nt) nt.setMs(0);
    });
    timeEl.addEventListener('click', () => {
      const nt = (window as any).__nt_tracker_session_active_ms__;
      if (!nt) return;
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'nt-edit';
      input.value = fmt(nt.getTotal()); input.placeholder = 'M:SS';
      const commit = () => {
        const parts = input.value.split(':').map(Number);
        let ms = -1;
        if (!parts.some(isNaN)) {
          if (parts.length === 1) ms = parts[0] * 60 * 1000;
          else if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000;
          else if (parts.length === 3) ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        }
        if (ms >= 0) nt.setMs(ms);
        input.replaceWith(timeEl);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
      timeEl.replaceWith(input); input.focus(); input.select();
    });

    setInterval(() => {
      const nt = (window as any).__nt_tracker_session_active_ms__;
      if (nt) {
        timeEl.textContent = fmt(nt.getTotal());
      }
    }, 1000);
  }

  const pos = cfg.overlayPosition ?? 'top-right';
  applyOverlayPosition(overlay, pos);
  injectOverlayCustomOverrides();
  enforceOverlayLayout(overlay);

  if (cfg.overlayPosition === 'hidden') {
    overlay.style.setProperty('display', 'none', 'important');
  } else {
    overlay.style.setProperty('display', 'flex', 'important');
  }

  if (overlay.parentElement === document.body) {
    document.documentElement.appendChild(overlay);
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['config']) {
    const newCfg: any = changes['config'].newValue || {};
    currentConfig = newCfg;

    const themeName = getActiveThemeName(newCfg);
    updateActiveThemeStyles(themeName, newCfg);

    if (TTU_HOSTS.some(h => window.location.hostname.includes(h))) {
      const oldReaderCfg = getReaderConfig(changes['config'].oldValue || {});
      const newReaderCfg = getReaderConfig(newCfg);
      const wasEnabled = oldReaderCfg.enabled;
      const isEnabled = newReaderCfg.enabled;

      if (!isEnabled && wasEnabled) {
        const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
        if (wrapper) wrapper.remove();
        if ((window as any).ntChronoInterval) clearInterval((window as any).ntChronoInterval);
      } else if (isEnabled && !wasEnabled) {
        setupTTUChronometer();
      }

      const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
      if (wrapper) {
        const btnLog = wrapper.querySelector('#nt-ttu-btn-log') as HTMLButtonElement;
        if (isEnabled && newReaderCfg.autoSave !== false) {
          btnLog.disabled = true; btnLog.style.opacity = '0.3'; btnLog.style.cursor = 'not-allowed'; btnLog.title = 'Auto-sync is enabled (Sends automatically via Settings Queue)';
        } else if (isEnabled) {
          btnLog.disabled = false; btnLog.style.opacity = '1'; btnLog.style.cursor = 'pointer'; btnLog.title = 'Save & Queue';
        }
      }
    } else {
      if (window.self !== window.top) return;

      if (isWebsiteOverlaySkipped(newCfg) || websiteOverlayDismissed) {
        const overlay = document.getElementById('nt-overlay');
        if (overlay) overlay.style.display = 'none';
        return;
      }

      const existingOverlay = document.getElementById('nt-overlay');
      if (existingOverlay) {
        if (newCfg.overlayPosition !== 'hidden') {
          existingOverlay.style.setProperty('display', 'flex', 'important');
          applyOverlayPosition(existingOverlay, newCfg.overlayPosition);
          injectOverlayCustomOverrides();
          enforceOverlayLayout(existingOverlay);

          // Force precise control element state-sizes on theme switch
          const pauseBtn = existingOverlay.querySelector('.nt-ctrl[title="Pause / Resume"]') as HTMLButtonElement;
          if (pauseBtn) {
            updatePauseIconState(pauseBtn, pauseBtn.textContent === '▶');
          }
          const resetBtn = existingOverlay.querySelector('.nt-ctrl[title="Reset timer"]') as HTMLElement;
          if (resetBtn) resetBtn.style.setProperty('font-size', '11px', 'important');
          const closeBtn = existingOverlay.querySelector('.nt-close') as HTMLElement;
          if (closeBtn) closeBtn.style.setProperty('font-size', '12px', 'important');
        } else {
          existingOverlay.style.setProperty('display', 'none', 'important');
        }
        return;
      }

      checkAndRunOverlay(newCfg);
    }
  }

  if (area === 'local' && changes['readingQueue']) {
    const queue = (changes['readingQueue'].newValue as any[]) || [];
    const rawTitle = getTTUTitle();
    const existing = queue.find((q: any) => q.originalTitle === rawTitle || q.contentTitleNative === rawTitle);

    if (!existing && ttuState.timeMs > 0) {
      ttuState.timeMs = 0;
      ttuState.chars = 0;
      stateRefs.globalLastTick = Date.now();

      const initCount = extractAdvancedCharCount();
      stateRefs.globalSessionStartChar = initCount !== null ? initCount.current : -1;

      stateRefs.globalManualCharOffset = 0;

      const timeVal = document.querySelector('#nt-ttu-val-time');
      const charsVal = document.querySelector('#nt-ttu-val-chars');
      if (timeVal && timeVal.tagName !== 'INPUT') timeVal.textContent = "0:00";
      if (charsVal && charsVal.tagName !== 'INPUT') charsVal.textContent = "0";
    } else if (existing) {
      ttuLinkStorage.getValue().then(links => {
        links = links || {};
        let updated = false;

        if (existing.mediaId && existing.mediaId !== 'web-reading') {
          if (!links[rawTitle] || links[rawTitle].mediaId !== existing.mediaId || links[rawTitle].volume !== existing.volume) {
            links[rawTitle] = {
              mediaId: existing.mediaId,
              volume: existing.volume || 1,
              mediaData: existing.mediaData
            };
            updated = true;
          }
        } else if (!existing.mediaId || existing.mediaId === 'web-reading') {
          if (links[rawTitle]) {
            delete links[rawTitle];
            updated = true;
          }
        }

        if (updated) {
          ttuLinkStorage.setValue(links).then(() => {
            const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
            if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
          });
        }
      });
    }
  }
});

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  cssInjectionMode: 'manifest',

  async main() {
    currentConfig = await configStorage.getValue() || {};
    const host = window.location.hostname;
    const cfg = currentConfig;

    const themeName = getActiveThemeName(cfg);
    updateActiveThemeStyles(themeName, cfg);

    if (TTU_HOSTS.some(h => host.includes(h))) {
      const readerCfg = getReaderConfig(cfg);
      if (!readerCfg.enabled) return;
      startTimeTracker();
      return;
    }

    if (isWebsiteOverlaySkipped(cfg)) return;
    startTimeTracker();
    if (cfg.overlayPosition === 'hidden') return;

    if (window.self !== window.top) return;
    checkAndRunOverlay(cfg);
  },
});