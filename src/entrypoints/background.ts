import { defineBackground } from '#imports';
import { resolveVideoChannelMedia, submitLog, notify } from '@/utils/api';
import { videoQueueStorage, readingQueueStorage, configStorage, addDebugLog } from '@/utils/storage';
import { storage } from '#imports';

export default defineBackground(() => {
  browser.contextMenus.create({ id: 'log-text', title: 'Log to NihongoTracker', contexts: ['selection'] });

  // NEW: Context menu to log YouTube videos directly
  browser.contextMenus.create({
    id: 'log-yt-video',
    title: 'Log this video to NihongoTracker',
    documentUrlPatterns: ['*://*.youtube.com/*'],
    contexts: ['link', 'page', 'video']
  });

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'NOTIFY') {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs[0]?.id) browser.tabs.sendMessage(tabs[0].id, { action: 'SHOW_TOAST', title: msg.title, message: msg.message }).catch(() => null);
      }).catch(() => null);
    }
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'log-yt-video') {
      const url = info.linkUrl || info.pageUrl || tab?.url;
      if (!url || !url.includes('youtube.com')) return;

      try {
        const res = await fetch(`https://nihongotracker.app/api/media/youtube/video?url=${encodeURIComponent(url)}`, { headers: { 'accept': '*/*' }});
        if (!res.ok) throw new Error('Could not fetch video info');

        const data = await res.json();
        if (!data?.video) throw new Error('No video data found');

        const v = data.video;
        const ch = data.channel;
        const timeMins = Math.max(1, v.episodeDuration || 1);

        const ok = await submitLog({
          type: 'video',
          mediaId: ch?.contentId || "web-video",
          description: v.title?.contentTitleNative || v.title?.contentTitleEnglish || "YouTube Video",
          time: timeMins,
          date: new Date().toISOString(),
                                   episodes: 0, pages: 0, private: false, unknownDate: false,
                                   mediaData: {
                                     channelId: ch?.contentId || "web-video",
                                     channelTitle: ch?.title?.contentTitleNative || ch?.title?.contentTitleEnglish || "Unknown Channel",
                                     channelImage: ch?.contentImage,
                                     channelDescription: ch?.description?.[0]?.description
                                   }
        });
      } catch (err: any) {
        notify('Failed', err.message);
      }
      return;
    }

    if (info.menuItemId !== 'log-text' || !info.selectionText || !tab?.id) return;

    const japaneseOnly = info.selectionText.replace(/[^\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g, '');
    const count = japaneseOnly.length;

    if (count === 0) { notify('No Japanese Found', 'Selection had no Japanese characters.'); return; }

    const pageTitle = tab.title ?? 'Unknown Title';
    const pageUrl = tab.url ?? 'Unknown URL';
    let timeMinutes = 0;
    const config = await configStorage.getValue();

    if (config.trackTime) {
      try {
        const resp = await browser.tabs.sendMessage(tab.id, { action: 'GET_ACTIVE_TIME' });
        timeMinutes = resp?.minutes ?? 0;
      } catch {}
    }

    await addDebugLog('INFO', 'Background', `Logging Text Selection via Context Menu`, { title: pageTitle, chars: count, timeMinutes });

    await submitLog({
      type: 'reading',
      mediaData: { contentId: pageTitle, contentTitleNative: pageTitle, contentTitleEnglish: pageUrl, type: 'web' },
      description: `'${pageTitle}' from '${pageUrl}'`,
      chars: count, time: timeMinutes, date: new Date().toISOString(), episodes: 0, pages: 0, private: false, tags:[],
    });
  });

  browser.alarms.create('flushDaily', { periodInMinutes: 15 });
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'flushDaily') {
      const cfg = await configStorage.getValue();
      if (!cfg.autoSendEndOfDay) return;

      const now = new Date();
      if (now.getHours() === 23 && now.getMinutes() >= 45) {
        const lastFlushDate = await storage.getItem('local:lastFlushDate');
        const todayStr = now.toLocaleDateString();
        if (lastFlushDate === todayStr) return;

        await addDebugLog('INFO', 'Background', `Starting EOD Queue Flush...`);
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

      if (!isToday) { remaining.push(item); continue; }

      const base: any = {
        type,
        mediaId: item.mediaId || (type === 'reading' ? 'web-reading' : (item.channelId || "web-video")),
                                description: item.description || item.contentTitleNative, episodes: 0, pages: 0, unknownDate: false, volume: item.volume || 1,
                                mediaData: item.mediaData || (type === 'reading' ? { contentId: 'web-reading', contentTitleNative: item.contentTitleNative } : { channelId: item.channelId || 'web-video', channelTitle: item.contentTitleNative })
      };

      if (type === 'video' && (item.channelId || item.mediaData?.channelId)) {
        const media = await resolveVideoChannelMedia({ channelId: item.mediaData?.channelId || item.channelId, channelTitle: item.mediaData?.channelTitle || item.contentTitleNative });
        base.mediaData = {
          channelId: item.mediaData?.channelId || item.channelId || 'web-video',
          channelTitle: media.channelTitle || item.mediaData?.channelTitle || item.contentTitleNative,
          ...(media.channelImage ? { channelImage: media.channelImage } : {}),
                                ...(media.channelDescription ? { channelDescription: media.channelDescription } : {}),
        };
      }

      let payloads =[];
      if (!item.sessions || item.sessions.length === 0) {
        payloads =[{ ...base, time: type === 'reading' ? Math.max(1, Math.round((item.time||0)/60)) : item.time||0, date: item.date, chars: item.chars || 0 }];
      } else {
        payloads = item.sessions.map((s:any) => ({ ...base, time: type === 'reading' ? Math.max(1, Math.round(s.secs / 60)) : Math.max(1, Math.round(s.secs / 60)), date: s.date, chars: s.chars || 0 }));
      }

      let success = true;
      for (const p of payloads) if (!(await submitLog(p))) success = false;
      if (!success) remaining.push(item);
    }

    await qStorage.setValue(remaining);
    refreshBadge();
  }

  const refreshBadge = async () => {
    const queue = await videoQueueStorage.getValue();
    const count = queue.length;
    browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    browser.action.setBadgeBackgroundColor({ color: '#f38ba8' });
  };

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'QUEUE_UPDATED') refreshBadge();
    if (msg.action === 'GET_QUEUE_COUNT') { videoQueueStorage.getValue().then(q => sendResponse({ count: q.length })); return true; }
  });

  refreshBadge();
});
