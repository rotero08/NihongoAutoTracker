import { defineBackground } from '#imports';
import { submitLog, notify } from '@/utils/api';
import { videoQueueStorage, configStorage } from '@/utils/storage';

export default defineBackground(() => {
  // ── Context menu ───────────────────────────────────────────────────────────
  browser.contextMenus.create({
    id: 'log-text',
    title: 'Log to NihongoTracker',
    contexts: ['selection'],
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
      tags: [],
    });
  });

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
