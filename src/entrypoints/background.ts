import { defineBackground } from '#imports';
import { submitLog, notify } from '@/utils/api';
import { videoQueueStorage, readingQueueStorage, configStorage } from '@/utils/storage';
import { storage } from '#imports';

export default defineBackground(() => {
  // ── Context menu ───────────────────────────────────────────────────────────
  browser.contextMenus.create({
    id: 'log-text',
    title: 'Log to NihongoTracker',
    contexts: ['selection'],
  });

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'NOTIFY') {
      browser.notifications.create({
        type: 'basic',
        iconUrl: '/icon/48.png',
        title: msg.title,
        message: msg.message,
      });
    }
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'log-text' || !info.selectionText || !tab?.id) return;

    const japaneseOnly = info.selectionText.replace(
      /[^\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g, ''
    );
    const count = japaneseOnly.length;

    if (count === 0) {
      notify('No Japanese Found', 'Selection had no Japanese characters.');
      return;
    }

    const pageTitle = tab.title ?? 'Unknown Title';
    const pageUrl = tab.url ?? 'Unknown URL';

    // Try to get active time from content script
    let timeMinutes = 0;
    const config = await configStorage.getValue();

    if (config.trackTime) {
      try {
        const resp = await browser.tabs.sendMessage(tab.id, { action: 'GET_ACTIVE_TIME' });
        timeMinutes = resp?.minutes ?? 0;
      } catch {
        // Content script not ready — proceed with 0
      }
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
                      tags:[],
    });
  });

  // ── Auto-Send End Of Day Scheduled Task ────────────────────────────────────
  browser.alarms.create('flushDaily', { periodInMinutes: 15 });
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'flushDaily') {
      const cfg = await configStorage.getValue();
      if (!cfg.autoSendEndOfDay) return;

      const now = new Date();
      // Execute automatically around 11:45 PM to 11:59 PM
      if (now.getHours() === 23 && now.getMinutes() >= 45) {
        const lastFlushDate = await storage.getItem('local:lastFlushDate');
        const todayStr = now.toLocaleDateString();
        if (lastFlushDate === todayStr) return; // Only process once per day

        await flushTodayQueue('reading', readingQueueStorage);
        await flushTodayQueue('video', videoQueueStorage);
        await storage.setItem('local:lastFlushDate', todayStr);
      }
    }
  });

  async function flushTodayQueue(type: 'reading' | 'video', qStorage: any) {
    const q = await qStorage.getValue();
    const todayStr = new Date().toLocaleDateString();
    const remaining =[];

    for (const item of q) {
      const itemDateStr = new Date(item.date).toLocaleDateString();
      const sessionsToday = item.sessions?.filter((s:any) => new Date(s.date).toLocaleDateString() === todayStr) ||[];

      const isToday = itemDateStr === todayStr || sessionsToday.length > 0;

      if (!isToday) {
        remaining.push(item);
        continue;
      }

      const base: any = {
        type,
        mediaId: item.mediaId || (type === 'reading' ? 'web-reading' : (item.channelId || "web-video")),
                                description: item.description || item.contentTitleNative,
                                episodes: 0,
                                pages: 0,
                                unknownDate: false,
                                volume: item.volume || 1,
                                mediaData: item.mediaData || (type === 'reading' ? { contentId: 'web-reading', contentTitleNative: item.contentTitleNative } : { channelId: item.channelId || 'web-video', channelTitle: item.contentTitleNative })
      };

      let payloads =[];
      if (!item.sessions || item.sessions.length === 0) {
        payloads =[{
          ...base,
          time: type === 'reading' ? Math.max(1, Math.round((item.time||0)/60)) : item.time||0,
                                date: item.date,
                                chars: item.chars || 0
        }];
      } else {
        payloads = item.sessions.map((s:any) => ({
          ...base,
          time: type === 'reading' ? Math.max(1, Math.round(s.secs / 60)) : Math.max(1, Math.round(s.secs / 60)),
                                                 date: s.date,
                                                 chars: s.chars || 0
        }));
      }

      let success = true;
      for (const p of payloads) {
        if (!(await submitLog(p))) success = false;
      }
      if (!success) remaining.push(item);
    }

    await qStorage.setValue(remaining);
    refreshBadge();
  }

  // ── Badge on queue updates ─────────────────────────────────────────────────
  const refreshBadge = async () => {
    const queue = await videoQueueStorage.getValue();
    const count = queue.length;
    browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    browser.action.setBadgeBackgroundColor({ color: '#f38ba8' });
  };

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'QUEUE_UPDATED') {
      refreshBadge();
    }
    if (msg.action === 'GET_QUEUE_COUNT') {
      videoQueueStorage.getValue().then(q => sendResponse({ count: q.length }));
      return true; // async
    }
  });

  // Initial badge on startup
  refreshBadge();
});
