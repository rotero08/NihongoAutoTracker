/**
 * ── Background Service Worker ────────────────────────────────────────────────
 * Central dispatcher context handling browser events and message handshakes.
 */

import { defineBackground } from '#imports';
import { submitLog, fetchYoutubeVideoInfo } from '@/lib/api/nihongotracker';
import { importStremioFromTrakt } from '@/lib/api/trakt';
import { ACTIVE_SETTINGS_TAB_KEY, JP_ALL_RE, LAST_FLUSH_DATE_KEY, STREMIO_LAST_POLL_AT_KEY } from '@/lib/constants';
import { configStorage } from '@/lib/storage/config';
import { addDebugLog, clearRamLogs, getRamLogs, pushRamLog } from '@/lib/storage/debug';
import { readingQueueStorage, stremioQueueStorage, videoQueueStorage } from '@/lib/storage/queues';
import { THEMES, parseColorToRgb, rgbToHsl } from '@/lib/ui/themes';
import { notify } from '@/lib/utils/toast';
import { storage } from 'wxt/utils/storage';

export default defineBackground(() => {
  const actionAPI = browser.action || (browser as any).browserAction;
  let stremioPollInFlight = false;

  (globalThis as any).__NT_APPEND_RAM_LOG__ = (entry: any) => {
    pushRamLog(entry);
  };

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

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      if (msg.action === 'SUBMIT_LOG') {
        submitLog(msg.payload, msg.silent)
          .then(res => sendResponse(res))
          .catch(err => sendResponse({ success: false, error: err.message || 'Routing failed' }));
        return true;
      }

      if (msg.action === 'ADD_DEBUG_LOG') {
        pushRamLog(msg.entry);
        sendResponse({ success: true });
        return;
      }

      if (msg.action === 'GET_DEBUG_LOGS') {
        sendResponse({ logs: getRamLogs() });
        return;
      }

      if (msg.action === 'CLEAR_DEBUG_LOGS') {
        clearRamLogs();
        sendResponse({ success: true });
        return;
      }

      if (msg.action === 'GET_ACTIVE_TAB_TITLE') {
        browser.tabs.query({ active: true, currentWindow: true })
          .then((tabs) => {
            sendResponse({ title: tabs[0]?.title || '' });
          })
          .catch(() => sendResponse({ title: '' }));
        return true; // Keep message channel open asynchronously
      }

      if (msg.action === 'NOTIFY') {
        browser.tabs.query({ active: true, currentWindow: true })
          .then((tabs) => {
            if (tabs[0]?.id) {
              browser.tabs.sendMessage(tabs[0].id, {
                action: 'SHOW_TOAST',
                title: msg.title,
                message: msg.message,
              }).catch(() => null);
            }
          })
          .catch(() => null);

        browser.runtime.sendMessage({
          action: 'SHOW_TOAST',
          title: msg.title,
          message: msg.message,
        }).catch(() => null);
      }

      if (msg.action === 'QUEUE_UPDATED') {
        refreshBadge();
      }

      if (msg.action === 'GET_QUEUE_COUNT') {
        Promise.all([
          videoQueueStorage.getValue(),
          readingQueueStorage.getValue(),
          stremioQueueStorage.getValue(),
        ]).then(([video, reading, stremio]) => {
          try {
            sendResponse({ count: (video?.length || 0) + (reading?.length || 0) + (stremio?.length || 0) });
          } catch { }
        }).catch(() => null);
        return true;
      }

      if (msg.action === 'OPEN_SETTINGS') {
        const settingsUrl = browser.runtime.getURL("/settings.html");
        browser.tabs.query({ url: settingsUrl + '*' })
          .then((tabs) => {
            const existing = tabs.find(t => t.url && t.url.startsWith(settingsUrl));
            if (existing) {
              const tabId = existing.id;
              const winId = existing.windowId;
              if (tabId !== undefined) {
                browser.tabs.update(tabId, { active: true })
                  .then(() => {
                    if (winId !== undefined) {
                      return browser.windows.update(winId, { focused: true });
                    }
                  })
                  .then(() => {
                    if (msg.tab) {
                      return browser.tabs.sendMessage(tabId, { action: 'SWITCH_SETTINGS_TAB', tab: msg.tab });
                    }
                  })
                  .catch(() => null);
              }
            } else {
              if (msg.tab) {
                storage.setItem(ACTIVE_SETTINGS_TAB_KEY, msg.tab).catch(() => null);
                browser.tabs.create({ url: settingsUrl }).catch(() => null);
              } else {
                browser.tabs.create({ url: settingsUrl }).catch(() => null);
              }
            }
          }).catch(() => null);
      }
    } catch (err) { }
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'log-yt-video') {
      const url = info.linkUrl || info.pageUrl || tab?.url;
      if (!url || !url.includes('youtube.com')) return;

      try {
        const data = await fetchYoutubeVideoInfo(url);
        if (!data?.video) throw new Error('No video data found');

        const v = data.video;
        const ch = data.channel;

        await submitLog({
          type: 'video',
          mediaId: ch?.contentId || 'web-video',
          description: v.title?.contentTitleNative || v.title?.contentTitleEnglish || 'YouTube Video',
          time: Math.max(1, v.episodeDuration || 1),
          date: new Date().toISOString(),
          episodes: 0,
          pages: 0,
          private: false,
          unknownDate: false,
          mediaData: {
            channelId: ch?.contentId || 'web-video',
            channelTitle: ch?.title?.contentTitleNative || ch?.title?.contentTitleEnglish || 'Unknown Channel',
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

    const count = info.selectionText.replace(JP_ALL_RE, '').length;
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

  function getNext2359Time(): number {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  function scheduleFlushDailyAlarm() {
    if (!browser.alarms) return;
    const targetTime = getNext2359Time();
    browser.alarms.clear('flushDaily').then(() => {
      browser.alarms.create('flushDaily', { when: targetTime });
    }).catch(() => null);
  }

  if (browser.alarms) {
    scheduleFlushDailyAlarm();
    browser.alarms.create('stremioTraktPoll', { periodInMinutes: 1 });
    setTimeout(() => pollStremioTrakt(true), 1000);

    browser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'stremioTraktPoll') {
        await pollStremioTrakt(false);
        return;
      }
      if (alarm.name !== 'flushDaily') return;

      scheduleFlushDailyAlarm();

      const cfg = await configStorage.getValue();
      if (!cfg.autoSendEndOfDay) return;

      const flushDate = new Date();
      if (flushDate.getHours() < 4) {
        flushDate.setDate(flushDate.getDate() - 1);
      }
      const targetDateStr = flushDate.toLocaleDateString();

      const lastFlushDate = await storage.getItem(LAST_FLUSH_DATE_KEY);
      if (lastFlushDate === targetDateStr) return;

      await flushTodayQueue('reading', readingQueueStorage, targetDateStr);
      await flushTodayQueue('video', videoQueueStorage, targetDateStr);
      await flushTodayQueue('stremio', stremioQueueStorage, targetDateStr);
      await storage.setItem(LAST_FLUSH_DATE_KEY, targetDateStr);
    });
  }

  async function flushTodayQueue(type: any, qStorage: any, targetDateStr: string) {
    const q = await qStorage.getValue();
    const remaining: any[] = [];

    for (const item of q) {
      const itemDateStr = new Date(item.date).toLocaleDateString();
      const sessionsToday = item.sessions?.filter((s: any) => new Date(s.date).toLocaleDateString() === targetDateStr) || [];
      if (itemDateStr !== targetDateStr && sessionsToday.length === 0) {
        remaining.push(item);
        continue;
      }

      const base: any = {
        type: type === 'stremio' ? item.logType : type,
        mediaId: item.mediaId || (type === 'reading' ? 'web-reading' : type === 'stremio' ? item.mediaData?.contentId || `trakt:${item.traktHistoryId}` : item.channelId || 'web-video'),
        description: type === 'stremio' ? item.mediaData?.contentTitleNative || item.contentTitleNative || item.description : item.description || item.contentTitleNative,
        episodes: type === 'stremio' ? 1 : 0,
        pages: 0,
        unknownDate: false,
        volume: item.volume || 1,
        mediaData: item.mediaData || (type === 'reading' ? { contentId: 'web-reading', contentTitleNative: item.contentTitleNative } : type === 'stremio' ? item.mediaData || {} : { channelId: item.channelId || 'web-video', channelTitle: item.contentTitleNative }),
      };

      let payloads: any[] = (!item.sessions || item.sessions.length === 0)
        ? [{ ...base, time: type === 'reading' ? Math.max(1, Math.round((item.time || 0) / 60)) : item.time || 0, date: item.date, chars: item.chars || 0 }]
        : item.sessions.map((s: any) => ({ ...base, time: Math.max(1, Math.round(s.secs / 60)), date: s.date, chars: s.chars || 0 }));

      let success = true;
      for (const p of payloads) {
        const res = await submitLog(p);
        if (!res || !res.success) success = false;
      }
      if (!success) remaining.push(item);
    }
    await qStorage.setValue(remaining);
    refreshBadge();
  }

  async function pollStremioTrakt(force: boolean) {
    if (stremioPollInFlight) return;
    stremioPollInFlight = true;
    try {
      const cfg = await configStorage.getValue();
      if (!cfg.stremioEnabled || !cfg.traktAccessToken) return;

      const pollMinutes = Math.max(1, Number(cfg.stremioPollMinutes ?? 5));
      const lastPoll = Number((await storage.getItem(STREMIO_LAST_POLL_AT_KEY)) || 0);
      if (!force && Date.now() - lastPoll < pollMinutes * 60 * 1000) return;

      await storage.setItem(STREMIO_LAST_POLL_AT_KEY, Date.now());
      const historyResult = await importStremioFromTrakt();
      if (historyResult.imported > 0) refreshBadge();
    } catch (err) {
      await addDebugLog('ERROR', 'Stremio', 'Failed to poll Trakt history', err);
    } finally {
      stremioPollInFlight = false;
    }
  }

  const refreshBadge = () => {
    Promise.all([
      configStorage.getValue(),
      videoQueueStorage.getValue(),
      readingQueueStorage.getValue(),
      stremioQueueStorage.getValue()
    ]).then(([cfg, videoQueue, readingQueue, stremioQueue]) => {
      if (cfg?.showTotalInBadge !== false) {
        const count = (videoQueue?.length || 0) + (readingQueue?.length || 0) + (stremioQueue?.length || 0);
        actionAPI.setBadgeText({ text: count > 0 ? String(count) : '' });
        actionAPI.setBadgeBackgroundColor({ color: '#f38ba8' });
      } else {
        actionAPI.setBadgeText({ text: '' });
      }
    }).catch(() => null);
  };

  refreshBadge();

  async function updateExtensionIcon(colors: any, isBackgroundDark: boolean) {
    const accentColor = colors?.accent || '#f0b429';
    const accentHoverColor = colors?.accentHover || '#ffd060';
    const logoTextColor = colors?.logoText || '#f4f4f3';

    const createCanvas = (size: number) => {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        return canvas;
      }
      return new OffscreenCanvas(size, size);
    };

    const drawIconOfSize = (size: number) => {
      try {
        const canvas = createCanvas(size);
        const ctx = canvas.getContext('2d') as any;
        if (!ctx) return null;

        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.scale(size / 1996, size / 2000);

        const grad = ctx.createLinearGradient(0, 2000, 1996, 0);
        grad.addColorStop(0, accentColor);
        grad.addColorStop(1, accentHoverColor);

        const p1 = new Path2D("M 5.15169 4.91116 L 227.002 5.1235 L 303.231 4.89851 C 316.879 4.84169 330.966 4.60148 344.588 4.9931 C 349.275 5.12786 353.263 5.28615 356.291 8.67041 C 373.67 28.0987 390.237 49.7645 406.799 70.0154 L 518.649 207.361 L 864.445 633.27 C 1099.11 924.792 1331.77 1217.93 1562.38 1512.67 L 1822.26 1841.82 C 1862.82 1893.49 1907.26 1947.27 1945.73 2000 L 1386.04 2000 C 1370.28 1986.81 1338.29 1943.64 1324.29 1926.51 L 1183.25 1754.74 L 642.856 1098.9 L 479.588 899.661 L 433.947 843.861 C 420.372 827.106 408.23 811.388 393.231 795.828 C 394.003 811.198 393.317 829.088 393.277 844.767 L 393.166 932.786 L 393.166 932.786 L 393.036 1207.88 L 392.742 2000 L 5.7664 2000 C 3.98011 1976.53 5.21222 1942.73 5.1816 1918.26 L 5.24603 1751.57 L 5.11573 1234.05 L 5.07001 413.888 L 5.10066 140.547 C 5.11251 96.5711 3.97624 48.2916 5.15169 4.91116 z");
        ctx.fillStyle = grad; ctx.fill(p1);

        const p2 = new Path2D("M 545.48 3.41642 C 618.477 4.27753 691.48 4.51709 764.481 4.13506 L 1150.38 4.14877 L 1996 3.90803 L 1996 396.493 C 1981.8 395.339 1956.31 396.056 1941.29 396.056 L 1839.74 396.112 L 1730.32 396.087 C 1710.26 396.087 1683.22 395.48 1663.63 396.889 C 1665.89 410.024 1664.9 465.901 1664.88 481.692 L 1664.76 660.017 L 1664.61 1333.11 L 1664.93 1482.65 C 1664.94 1488.35 1666.25 1509.62 1664.1 1512.99 C 1661.21 1512.36 1659.54 1510.64 1657.58 1508.56 C 1642.87 1492.9 1630.67 1473.93 1617.23 1457.12 C 1545.12 1366.97 1472.33 1276.85 1403.18 1184.44 C 1394.11 1172.31 1378.4 1158.98 1373.14 1144.8 C 1368.57 1132.48 1371.02 1021.47 1371.03 1001.99 L 1371.06 786.466 L 1371.05 540.762 C 1371.04 493.827 1370.01 443.005 1371.85 396.579 C 1324.33 395.232 1273.73 396.044 1225.87 396.05 L 975.872 396.147 C 937.262 396.147 896.37 396.925 857.95 395.899 C 846.987 387.483 840.284 376.716 831.698 365.964 C 820.535 352.246 809.511 338.415 798.627 324.474 L 689.982 187.802 C 658.188 148.24 626.619 108.499 595.277 68.5783 C 582.305 52.2313 555.273 19.8823 545.48 3.41642 z");
        ctx.fillStyle = logoTextColor; ctx.fill(p2);

        const p3 = new Path2D("M 628.973 2000 C 627.156 1987.04 627.585 1963.01 627.53 1949.37 L 627.598 1861.6 L 627.485 1597.21 L 627.476 1381.39 L 627.424 1331.3 C 627.408 1325.08 626.798 1308.51 628.005 1303.25 L 629.704 1302.29 C 633.93 1303.88 651.087 1326.95 655.625 1332.53 L 717.503 1407.2 L 1209.02 2000 L 628.973 2000 z");
        ctx.fillStyle = grad; ctx.fill(p3);

        ctx.restore();
        return ctx.getImageData(0, 0, size, size);
      } catch (err) {
        return null;
      }
    };

    try {
      const imgData16 = drawIconOfSize(16);
      const imgData32 = drawIconOfSize(32);
      if (imgData16 && imgData32) {
        await actionAPI.setIcon({ imageData: { "16": imgData16, "32": imgData32 } });
        return;
      }
    } catch (e) {
      const isFirefox = typeof browser !== 'undefined' && browser.runtime.getURL('').startsWith('moz-extension://');
      actionAPI.setIcon({ path: isFirefox ? 'NihongoAutoTracker.svg' : 'icon/16.png' }).catch(() => { });
    }
  }

  async function updateIconForConfig(config: any) {
    if (config?.useStaticToolbarIcon === true) {
      const isFirefox = typeof browser !== 'undefined' && browser.runtime.getURL('').startsWith('moz-extension://');
      actionAPI.setIcon({ path: isFirefox ? 'NihongoAutoTracker.svg' : 'icon/16.png' }).catch(() => { });
      return;
    }

    const themeName = config?.selectedThemeId ?? config?.theme ?? 'dark-amber';
    let colors: any = null;
    let isBackgroundDark = true;

    if (themeName.startsWith('custom_') || themeName.startsWith('custom-') || themeName === 'custom') {
      const id = themeName.replace('custom_', '').replace('custom-', '');
      const customTheme = (config?.customThemes || []).find((t: any) => t.id === id || t.id === themeName);
      if (customTheme) {
        const background = customTheme.colors.background || '#07070e';
        isBackgroundDark = rgbToHsl(parseColorToRgb(background).r, parseColorToRgb(background).g, parseColorToRgb(background).b).l < 50;
        colors = { accent: customTheme.colors.accent, accentHover: customTheme.colors.accentHover, logoText: isBackgroundDark ? '#f4f4f3' : (customTheme.colors.text || '#2e3440') };
      }
    } else {
      const preset = THEMES[themeName];
      if (preset) {
        const background = preset.colors.background || '#07070e';
        isBackgroundDark = rgbToHsl(parseColorToRgb(background).r, parseColorToRgb(background).g, parseColorToRgb(background).b).l < 50;
        colors = { accent: preset.colors.accent, accentHover: preset.colors.accentHover, logoText: themeName === 'light' ? preset.colors.text : '#f4f4f3' };
      }
    }

    if (colors) await updateExtensionIcon(colors, isBackgroundDark);
  }

  configStorage.getValue().then((val) => {
    updateIconForConfig(val || {}).catch(() => { });
    refreshBadge();
  }).catch(() => { });

  configStorage.watch(async (newVal) => {
    if (newVal) {
      await updateIconForConfig(newVal);
      refreshBadge();
    }
  });

  videoQueueStorage.watch(() => refreshBadge());
  readingQueueStorage.watch(() => refreshBadge());
  stremioQueueStorage.watch(() => refreshBadge());
});