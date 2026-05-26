/**
 * ── Background Service Worker ────────────────────────────────────────────────
 *
 * The extension's persistent background script. Handles:
 * 1. Context menu creation for "Log to NihongoTracker" (text + video)
 * 2. Message relay between content scripts and popup/settings
 * 3. End-of-day (EOD) automatic queue flush via browser alarms
 * 4. Badge count updates reflecting pending queue items
 *
 * This script uses shared library modules for API, storage, and utilities,
 * eliminating the previous duplication of helper functions.
 */

import { defineBackground } from '#imports';
import { resolveVideoChannelMedia, submitLog } from '@/lib/api/nihongotracker';
import { notify } from '@/lib/api/youtube';
import { JP_ALL_RE } from '@/lib/constants';
import { configStorage } from '@/lib/storage/config';
import { addDebugLog } from '@/lib/storage/debug';
import { readingQueueStorage, videoQueueStorage } from '@/lib/storage/queues';
import { storage } from 'wxt/utils/storage';

export default defineBackground(() => {
  /* ── Context Menu Creation ──────────────────────────────────────────────── */

  /**
   * "Log to NihongoTracker" — appears on text selection in any page.
   * Sends the selected Japanese characters as a reading log.
   */
  browser.contextMenus.create({
    id: 'log-text',
    title: 'Log to NihongoTracker',
    contexts: ['selection'],
  });

  /**
   * "Log this video to NihongoTracker" — appears on YouTube pages.
   * Fetches video metadata and sends a video log immediately.
   */
  browser.contextMenus.create({
    id: 'log-yt-video',
    title: 'Log this video to NihongoTracker',
    documentUrlPatterns: ['*://*.youtube.com/*'],
    contexts: ['link', 'page', 'video'],
  });

  /* ── Message Handling ───────────────────────────────────────────────────── */

  /**
   * Relay toast notifications from popup/settings to the active content tab.
   * Also handles queue badge refresh and queue count requests.
   */
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      /* Relay toast to active tab */
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

      /* Refresh the badge count when queue changes */
      if (msg.action === 'QUEUE_UPDATED') refreshBadge();

      /* Return current queue count (used by popup) */
      if (msg.action === 'GET_QUEUE_COUNT') {
        videoQueueStorage.getValue().then((q) => {
          try {
            sendResponse({ count: q.length });
          } catch { }
        }).catch(() => null);
        return true; /* Keep message channel open for async response */
      }
    } catch (err) {
      // Discard context-invalidation exceptions silently
    }
  });

  /* ── Context Menu Click Handler ─────────────────────────────────────────── */

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    /* ── YouTube Video Logging ── */
    if (info.menuItemId === 'log-yt-video') {
      const url = info.linkUrl || info.pageUrl || tab?.url;
      if (!url || !url.includes('youtube.com')) return;

      try {
        /* Fetch video metadata from NT API */
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

    /* ── Text Selection Logging ── */
    if (info.menuItemId !== 'log-text' || !info.selectionText || !tab?.id) return;

    /* Strip non-Japanese characters and count the remainder */
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

    /* Retrieve active reading time from content script if enabled */
    if (config.trackTime) {
      try {
        const resp = await browser.tabs.sendMessage(tab.id, { action: 'GET_ACTIVE_TIME' });
        timeMinutes = resp?.minutes ?? 0;
      } catch {
        /* Content script may not be loaded on this page */
      }
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

  /**
   * Check every 15 minutes if it's near midnight (23:45+).
   * If EOD auto-send is enabled and we haven't flushed today,
   * send all today's queue items to NihongoTracker.
   */
  browser.alarms.create('flushDaily', { periodInMinutes: 15 });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'flushDaily') return;

    const cfg = await configStorage.getValue();
    if (!cfg.autoSendEndOfDay) return;

    const now = new Date();
    if (now.getHours() === 23 && now.getMinutes() >= 45) {
      /* Check if we've already flushed today */
      const lastFlushDate = await storage.getItem('local:lastFlushDate');
      const todayStr = now.toLocaleDateString();
      if (lastFlushDate === todayStr) return;

      await addDebugLog('INFO', 'Background', 'Starting EOD Queue Flush...');
      await flushTodayQueue('reading', readingQueueStorage);
      await flushTodayQueue('video', videoQueueStorage);
      await storage.setItem('local:lastFlushDate', todayStr);
    }
  });

  /**
   * Flush all queue items dated today.
   * Items that fail to send are kept in the queue for retry.
   *
   * @param type - 'reading' or 'video'
   * @param qStorage - The WXT storage item for this queue type
   */
  async function flushTodayQueue(type: 'reading' | 'video', qStorage: any) {
    const q = await qStorage.getValue();
    const todayStr = new Date().toLocaleDateString();
    const remaining: any[] = [];

    for (const item of q) {
      /* Determine if this item has sessions from today */
      const itemDateStr = new Date(item.date).toLocaleDateString();
      const sessionsToday =
        item.sessions?.filter(
          (s: any) => new Date(s.date).toLocaleDateString() === todayStr,
        ) || [];
      const isToday = itemDateStr === todayStr || sessionsToday.length > 0;

      /* Skip items not from today — keep them in the queue */
      if (!isToday) {
        remaining.push(item);
        continue;
      }

      /* Build the base payload */
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

      /* Enrich video channel metadata before sending */
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

      /* Build payloads from sessions or the item itself */
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

      /* Send each payload; keep item if any fail */
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

  /**
   * Update the extension badge to show the current video queue count.
   * Shows nothing when the queue is empty.
   */
  const refreshBadge = async () => {
    const queue = await videoQueueStorage.getValue();
    const count = queue.length;
    browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    browser.action.setBadgeBackgroundColor({ color: '#f38ba8' });
  };

  /* Initial badge update on startup */
  refreshBadge();
});
