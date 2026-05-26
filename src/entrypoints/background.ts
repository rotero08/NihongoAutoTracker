/**
 * ── Background Service Worker ────────────────────────────────────────────────
 *
 * The extension's persistent background script. Handles:
 * 1. Context menu creation for "Log to NihongoTracker" (text + video)
 * 2. Message relay between content scripts and popup/settings
 * 3. End-of-day (EOD) automatic queue flush via browser alarms
 * 4. Badge count updates reflecting pending queue items
 */

import { defineBackground } from '#imports';
import { resolveVideoChannelMedia, submitLog } from '@/lib/api/nihongotracker';
import { notify } from '@/lib/api/youtube';
import { JP_ALL_RE } from '@/lib/constants';
import { configStorage } from '@/lib/storage/config';
import { addDebugLog } from '@/lib/storage/debug';
import { readingQueueStorage, videoQueueStorage } from '@/lib/storage/queues';
import { storage } from 'wxt/utils/storage';
import { THEMES, parseColorToRgb, rgbToHsl } from '@/lib/ui/themes';

export default defineBackground(() => {
  // Gracefully fall back to browserAction if action is undefined (supports Manifest V2 in Firefox)
  const actionAPI = browser.action || (browser as any).browserAction;

  /* ── Context Menu Creation ──────────────────────────────────────────────── */

  browser.contextMenus.create({
    id: 'log-text',
    title: 'Log to NihongoTracker',
    contexts: ['selection'],
  });

  browser.contextMenus.create({
    id: 'log-yt-video',
    title: 'Log this video to NihongoTracker',
    documentUrlPatterns: ['*://*.youtube.com/*'],
    contexts: ['link', 'page', 'video'],
  });

  /* ── Message Handling ───────────────────────────────────────────────────── */

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      if (msg.action === 'NOTIFY') {
        browser.tabs
          .query({ active: true, currentWindow: true })
          .then((tabs) => {
            if (tabs[0]?.id) {
              browser.tabs
                .sendMessage(tabs[0].id, {
                  action: 'SHOW_TOAST',
                  title: msg.title,
                  message: msg.message,
                })
                .catch(() => null);
            }
          })
          .catch(() => null);
      }

      if (msg.action === 'QUEUE_UPDATED') refreshBadge();

      if (msg.action === 'GET_QUEUE_COUNT') {
        videoQueueStorage.getValue().then((q) => {
          try {
            sendResponse({ count: q.length });
          } catch { }
        }).catch(() => null);
        return true;
      }

      if (msg.action === 'OPEN_SETTINGS') {
        const settingsUrl = browser.runtime.getURL("/settings.html");

        // Optimize tab query with direct URL matching to avoid full tab tree serialization overhead.
        // Falls back gracefully to full query if the wildcard match fails.
        browser.tabs.query({ url: settingsUrl + '*' })
          .catch(() => browser.tabs.query({}))
          .then((tabs) => {
            const existing = tabs.find(t => t.url && t.url.startsWith(settingsUrl));

            if (existing) {
              const tabId = existing.id;
              const winId = existing.windowId;

              if (tabId !== undefined) {
                browser.tabs.update(tabId, { active: true }).then(() => {
                  if (winId !== undefined) {
                    browser.windows.update(winId, { focused: true }).catch(() => null);
                  }
                  if (msg.tab) {
                    browser.tabs.sendMessage(tabId, { action: 'SWITCH_SETTINGS_TAB', tab: msg.tab }).catch(() => null);
                  }
                }).catch(() => null);
              }
            } else {
              if (msg.tab) {
                storage.setItem('local:activeSettingsTab', msg.tab).then(() => {
                  browser.tabs.create({ url: settingsUrl }).catch(() => null);
                }).catch(() => {
                  browser.tabs.create({ url: settingsUrl }).catch(() => null);
                });
              } else {
                browser.tabs.create({ url: settingsUrl }).catch(() => null);
              }
            }
          }).catch(() => null);
      }
    } catch (err) {
      // Discard context-invalidation exceptions silently
    }
  });

  /* ── Context Menu Click Handler ─────────────────────────────────────────── */

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'log-yt-video') {
      const url = info.linkUrl || info.pageUrl || tab?.url;
      if (!url || !url.includes('youtube.com')) return;

      try {
        const res = await fetch(
          `https://nihongotracker.app/api/media/youtube/video?url=${encodeURIComponent(url)}`,
          { headers: { accept: '*/*' } },
        );
        if (!res.ok) throw new Error('Could not fetch video info');

        const data = await res.json();
        if (!data?.video) throw new Error('No video data found');

        const v = data.video;
        const ch = data.channel;
        const timeMins = Math.max(1, v.episodeDuration || 1);

        await submitLog({
          type: 'video',
          mediaId: ch?.contentId || 'web-video',
          description:
            v.title?.contentTitleNative ||
            v.title?.contentTitleEnglish ||
            'YouTube Video',
          time: timeMins,
          date: new Date().toISOString(),
          episodes: 0,
          pages: 0,
          private: false,
          unknownDate: false,
          mediaData: {
            channelId: ch?.contentId || 'web-video',
            channelTitle:
              ch?.title?.contentTitleNative ||
              ch?.title?.contentTitleEnglish ||
              'Unknown Channel',
            channelImage: ch?.contentImage,
            channelDescription: ch?.description?.[0]?.description,
          },
        });
      } catch (err: any) {
        notify('Failed', err.message);
      }
      return;
    }

    if (info.menuItemId !== 'log-text' || !info.selectionText || !tab?.id) return;

    const japaneseOnly = info.selectionText.replace(JP_ALL_RE, '');
    const count = japaneseOnly.length;

    if (count === 0) {
      notify('No Japanese Found', 'Selection had no Japanese characters.');
      return;
    }

    const pageTitle = tab.title ?? 'Unknown Title';
    const pageUrl = tab.url ?? 'Unknown URL';
    let timeMinutes = 0;
    const config = await configStorage.getValue();

    if (config.trackTime) {
      try {
        const resp = await browser.tabs.sendMessage(tab.id, { action: 'GET_ACTIVE_TIME' });
        timeMinutes = resp?.minutes ?? 0;
      } catch { }
    }

    await addDebugLog('INFO', 'Background', 'Logging Text Selection via Context Menu', {
      title: pageTitle,
      chars: count,
      timeMinutes,
    });

    await submitLog({
      type: 'reading',
      mediaData: {
        contentId: pageTitle,
        contentTitleNative: pageTitle,
        contentTitleEnglish: pageUrl,
        type: 'web',
      },
      description: `'${pageTitle}' from '${pageUrl}'`,
      chars: count,
      time: timeMinutes,
      date: new Date().toISOString(),
      episodes: 0,
      pages: 0,
      private: false,
      tags: [],
    });
  });

  /* ── End-of-Day Queue Flush ─────────────────────────────────────────────── */

  if (browser.alarms) {
    browser.alarms.create('flushDaily', { periodInMinutes: 15 });

    browser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name !== 'flushDaily') return;

      const cfg = await configStorage.getValue();
      if (!cfg.autoSendEndOfDay) return;

      const now = new Date();
      if (now.getHours() === 23 && now.getMinutes() >= 45) {
        const lastFlushDate = await storage.getItem('local:lastFlushDate');
        const todayStr = now.toLocaleDateString();
        if (lastFlushDate === todayStr) return;

        await addDebugLog('INFO', 'Background', 'Starting EOD Queue Flush...');
        await flushTodayQueue('reading', readingQueueStorage);
        await flushTodayQueue('video', videoQueueStorage);
        await storage.setItem('local:lastFlushDate', todayStr);
      }
    });
  } else {
    console.warn("[NTA Background] browser.alarms is undefined. Skipping Daily Flush alarm registration. Check permissions.");
  }

  async function flushTodayQueue(type: 'reading' | 'video', qStorage: any) {
    const q = await qStorage.getValue();
    const todayStr = new Date().toLocaleDateString();
    const remaining: any[] = [];

    for (const item of q) {
      const itemDateStr = new Date(item.date).toLocaleDateString();
      const sessionsToday =
        item.sessions?.filter(
          (s: any) => new Date(s.date).toLocaleDateString() === todayStr,
        ) || [];
      const isToday = itemDateStr === todayStr || sessionsToday.length > 0;

      if (!isToday) {
        remaining.push(item);
        continue;
      }

      const base: any = {
        type,
        mediaId:
          item.mediaId ||
          (type === 'reading'
            ? 'web-reading'
            : item.channelId || 'web-video'),
        description: item.description || item.contentTitleNative,
        episodes: 0,
        pages: 0,
        unknownDate: false,
        volume: item.volume || 1,
        mediaData:
          item.mediaData ||
          (type === 'reading'
            ? {
              contentId: 'web-reading',
              contentTitleNative: item.contentTitleNative,
            }
            : {
              channelId: item.channelId || 'web-video',
              channelTitle: item.contentTitleNative,
            }),
      };

      if (
        type === 'video' &&
        (item.channelId || item.mediaData?.channelId)
      ) {
        const media = await resolveVideoChannelMedia({
          channelId: item.mediaData?.channelId || item.channelId,
          channelTitle:
            item.mediaData?.channelTitle || item.contentTitleNative,
        });
        base.mediaData = {
          channelId:
            item.mediaData?.channelId || item.channelId || 'web-video',
          channelTitle:
            media.channelTitle ||
            item.mediaData?.channelTitle ||
            item.contentTitleNative,
          ...(media.channelImage
            ? { channelImage: media.channelImage }
            : {}),
          ...(media.channelDescription
            ? { channelDescription: media.channelDescription }
            : {}),
        };
      }

      let payloads: any[];
      if (!item.sessions || item.sessions.length === 0) {
        payloads = [
          {
            ...base,
            time:
              type === 'reading'
                ? Math.max(1, Math.round((item.time || 0) / 60))
                : item.time || 0,
            date: item.date,
            chars: item.chars || 0,
          },
        ];
      } else {
        payloads = item.sessions.map((s: any) => ({
          ...base,
          time: Math.max(1, Math.round(s.secs / 60)),
          date: s.date,
          chars: s.chars || 0,
        }));
      }

      let success = true;
      for (const p of payloads) {
        const res = await submitLog(p);
        if (!res || !(res as any).success) success = false;
      }
      if (!success) remaining.push(item);
    }

    await qStorage.setValue(remaining);
    refreshBadge();
  }

  /* ── Badge Management ───────────────────────────────────────────────────── */

  const refreshBadge = () => {
    Promise.all([
      configStorage.getValue(),
      videoQueueStorage.getValue(),
      readingQueueStorage.getValue()
    ]).then(([cfg, videoQueue, readingQueue]) => {
      const showBadge = cfg?.showTotalInBadge !== false;
      if (showBadge) {
        const count = (videoQueue?.length || 0) + (readingQueue?.length || 0);
        actionAPI.setBadgeText({ text: count > 0 ? String(count) : '' });
        actionAPI.setBadgeBackgroundColor({ color: '#f38ba8' });
      } else {
        actionAPI.setBadgeText({ text: '' });
      }
    }).catch(() => null);
  };

  refreshBadge();

  /**
   * Generates and renders a high-contrast dynamic extension toolbar icon in real-time.
   */
  async function updateExtensionIcon(colors: any, isBackgroundDark: boolean) {
    const accentColor = colors?.accent || '#f0b429';
    const accentHoverColor = colors?.accentHover || '#ffd060';
    const logoTextColor = colors?.logoText || '#f4f4f3';

    console.log("[NTA Icon Diagnostic] Starting updateExtensionIcon with colors:", colors);

    // Safe, cross-environment builder selecting standard HTML Canvas or OffscreenCanvas depending on MV2/MV3 context
    const createCanvas = (size: number) => {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        return canvas;
      } else {
        return new OffscreenCanvas(size, size);
      }
    };

    // Draw and return the custom vector path scaled to standard DPI sizes
    const drawIconOfSize = (size: number) => {
      try {
        const canvas = createCanvas(size);
        const ctx = canvas.getContext('2d') as any;
        if (!ctx) {
          console.error(`[NTA Icon Diagnostic] Failed to get canvas context for size ${size}`);
          return null;
        }

        ctx.clearRect(0, 0, size, size);

        ctx.save();
        ctx.scale(size / 1996, size / 2000);

        const grad = ctx.createLinearGradient(0, 2000, 1996, 0);
        grad.addColorStop(0, accentColor);
        grad.addColorStop(1, accentHoverColor);

        // Vector Path 1 (Left Wing)
        const p1 = new Path2D("M 5.15169 4.91116 L 227.002 5.1235 L 303.231 4.89851 C 316.879 4.84169 330.966 4.60148 344.588 4.9931 C 349.275 5.12786 353.263 5.28615 356.291 8.67041 C 373.67 28.0987 390.237 49.7645 406.799 70.0154 L 518.649 207.361 L 864.445 633.27 C 1099.11 924.792 1331.77 1217.93 1562.38 1512.67 L 1822.26 1841.82 C 1862.82 1893.49 1907.26 1947.27 1945.73 2000 L 1386.04 2000 C 1370.28 1986.81 1338.29 1943.64 1324.29 1926.51 L 1183.25 1754.74 L 642.856 1098.9 L 479.588 899.661 L 433.947 843.861 C 420.372 827.106 408.23 811.388 393.231 795.828 C 394.003 811.198 393.317 829.088 393.277 844.767 L 393.166 932.786 L 393.036 1207.88 L 392.742 2000 L 5.7664 2000 C 3.98011 1976.53 5.21222 1942.73 5.1816 1918.26 L 5.24603 1751.57 L 5.11573 1234.05 L 5.07001 413.888 L 5.10066 140.547 C 5.11251 96.5711 3.97624 48.2916 5.15169 4.91116 z");
        ctx.fillStyle = grad;
        ctx.fill(p1);

        // Vector Path 2 (Middle Arch)
        const p2 = new Path2D("M 545.48 3.41642 C 618.477 4.27753 691.48 4.51709 764.481 4.13506 L 1150.38 4.14877 L 1996 3.90803 L 1996 396.493 C 1981.8 395.339 1956.31 396.056 1941.29 396.056 L 1839.74 396.112 L 1730.32 396.087 C 1710.26 396.087 1683.22 395.48 1663.63 396.889 C 1665.89 410.024 1664.9 465.901 1664.88 481.692 L 1664.76 660.017 L 1664.61 1333.11 L 1664.93 1482.65 C 1664.94 1488.35 1666.25 1509.62 1664.1 1512.99 C 1661.21 1512.36 1659.54 1510.64 1657.58 1508.56 C 1642.87 1492.9 1630.67 1473.93 1617.23 1457.12 C 1545.12 1366.97 1472.33 1276.85 1403.18 1184.44 C 1394.11 1172.31 1378.4 1158.98 1373.14 1144.8 C 1368.57 1132.48 1371.02 1021.47 1371.03 1001.99 L 1371.06 786.466 L 1371.05 540.762 C 1371.04 493.827 1370.01 443.005 1371.85 396.579 C 1324.33 395.232 1273.73 396.044 1225.87 396.05 L 975.872 396.147 C 937.262 396.147 896.37 396.925 857.95 395.899 C 846.987 387.483 840.284 376.716 831.698 365.964 C 820.535 352.246 809.511 338.415 798.627 324.474 L 689.982 187.802 C 658.188 148.24 626.619 108.499 595.277 68.5783 C 582.305 52.2313 555.273 19.8823 545.48 3.41642 z");
        ctx.fillStyle = logoTextColor;
        ctx.fill(p2);

        // Vector Path 3 (Right Tail)
        const p3 = new Path2D("M 628.973 2000 C 627.156 1987.04 627.585 1963.01 627.53 1949.37 L 627.598 1861.6 L 627.485 1597.21 L 627.476 1381.39 L 627.424 1331.3 C 627.408 1325.08 626.798 1308.51 628.005 1303.25 L 629.704 1302.29 C 633.93 1303.88 651.087 1326.95 655.625 1332.53 L 717.503 1407.2 L 1209.02 2000 L 628.973 2000 z");
        ctx.fillStyle = grad;
        ctx.fill(p3);

        ctx.restore();

        const rawData = ctx.getImageData(0, 0, size, size);

        if (typeof document === 'undefined') {
          // Service Worker context (Chrome MV3) - requires explicit new ImageData constructor re-wrapping to bypass serialization bugs
          const securePixelClampedArray = new Uint8ClampedArray(rawData.data);
          return new ImageData(securePixelClampedArray, size, size);
        } else {
          // DOM / Background Page context (Firefox MV2/MV3) - standard ImageData is fully native and compatible directly
          return rawData;
        }
      } catch (err) {
        console.error(`[NTA Icon Diagnostic] Exception while drawing size ${size}:`, err);
        return null;
      }
    };

    try {
      if (typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined') {
        const imgData16 = drawIconOfSize(16);
        const imgData32 = drawIconOfSize(32);

        if (imgData16 && imgData32) {
          console.log("[NTA Icon Diagnostic] Successfully generated context-free ImageData models.");
          await actionAPI.setIcon({
            imageData: {
              "16": imgData16,
              "32": imgData32
            }
          });
          console.log("[NTA Icon Diagnostic] actionAPI.setIcon complete.");
          return;
        }
      }

      console.warn("[NTA Icon Diagnostic] Canvas rendering unavailable. Defaulting to relative image path.");
      const isFirefox = typeof browser !== 'undefined' && browser.runtime.getURL('').startsWith('moz-extension://');
      const path = isBackgroundDark
        ? (isFirefox ? 'NihongoAutoTracker.svg' : 'icon/16.png')
        : 'icon/16.png';
      await actionAPI.setIcon({ path });
    } catch (e) {
      console.error("[NTA Icon Diagnostic] Root extension setIcon process failed:", e);
      const isFirefox = typeof browser !== 'undefined' && browser.runtime.getURL('').startsWith('moz-extension://');
      const path = isBackgroundDark
        ? (isFirefox ? 'NihongoAutoTracker.svg' : 'icon/16.png')
        : 'icon/16.png';
      actionAPI.setIcon({ path }).catch(() => { });
    }
  }

  async function updateIconForConfig(config: any) {
    const themeName = config?.selectedThemeId ?? config?.theme ?? 'dark-amber';
    let colors: any = null;
    let isBackgroundDark = true;

    if (themeName.startsWith('custom_') || themeName.startsWith('custom-') || themeName === 'custom') {
      const id = themeName.replace('custom_', '').replace('custom-', '');
      const customTheme = (config?.customThemes || []).find((t: any) => t.id === id || t.id === themeName);
      if (customTheme) {
        const background = customTheme.colors.background || customTheme.colors.bg || '#07070e';
        const parsedBackground = parseColorToRgb(background);
        const hslBackground = rgbToHsl(parsedBackground.r, parsedBackground.g, parsedBackground.b);
        isBackgroundDark = hslBackground.l < 50;

        colors = {
          accent: customTheme.colors.accent,
          accentHover: customTheme.colors.accentHover,
          logoText: isBackgroundDark ? '#f4f4f3' : (customTheme.colors.text || '#2e3440')
        };
      }
    } else {
      const preset = THEMES[themeName];
      if (preset) {
        const background = preset.colors.background || preset.colors.bg || '#07070e';
        const parsedBackground = parseColorToRgb(background);
        const hslBackground = rgbToHsl(parsedBackground.r, parsedBackground.g, parsedBackground.b);
        isBackgroundDark = hslBackground.l < 50;

        colors = {
          accent: preset.colors.accent,
          accentHover: preset.colors.accentHover,
          logoText: themeName === 'light' ? preset.colors.text : '#f4f4f3'
        };
      }
    }

    if (colors) {
      await updateExtensionIcon(colors, isBackgroundDark);
    }
  }

  // Load dynamic theme extension icon on initial startup (guaranteed to run even if configuration is uninitialized)
  configStorage.getValue().then((val) => {
    updateIconForConfig(val || {}).catch((e) => {
      console.error("[NTA Icon Startup Fail]", e);
    });
    refreshBadge();
  }).catch((e) => {
    console.error("[NTA Icon Startup Fetch Fail]", e);
  });

  // Intercept configuration theme changes in real-time
  configStorage.watch(async (newVal) => {
    if (newVal) {
      await updateIconForConfig(newVal);
      refreshBadge();
    }
  });

  // Dynamic real-time watchers updating badge counts instantly on queue updates
  videoQueueStorage.watch(() => refreshBadge());
  readingQueueStorage.watch(() => refreshBadge());
});