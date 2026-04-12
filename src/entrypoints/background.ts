import { defineBackground } from '#imports';
import { submitLog, notify } from '@/utils/api';

export default defineBackground(() => {
  // Create Context Menu
  browser.contextMenus.create({
    id: 'log-text',
    title: 'Log to NihongoTracker',
    contexts: ['selection'],
  });
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'log-text' && info.selectionText && tab) {
    // 1. Extract Japanese characters
    const japaneseOnly = info.selectionText.replace(/[^\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g, "");
    const count = japaneseOnly.length;

    if (count === 0) {
      notify('No Japanese Found', 'Selection didn\'t contain valid Japanese characters.');
      return;
    }

    // 2. Capture Page Info (Now available thanks to the 'tabs' permission)
    const pageTitle = tab.title || 'Unknown Title';
    const pageUrl = tab.url || 'Unknown URL';

    await submitLog({
      type: 'reading',
      mediaData: {
        contentId: pageTitle,          // ID is the document title
        contentTitleNative: pageTitle,
        contentTitleEnglish: pageUrl,
        type: 'web',
      },
      // Description format: 'document title' from 'url'
      description: `'${pageTitle}' from '${pageUrl}'`, 
      chars: count,
      time: 0,
      date: new Date().toISOString(),
      episodes: 0,
      pages: 0,
      private: false,
      tags: []
    });
  }
});
});
