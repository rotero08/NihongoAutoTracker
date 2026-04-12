import { defineBackground } from 'wxt/sandbox';
import { configStorage } from '@/utils/storage';
import { submitLog } from '@/utils/api';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') {
      browser.runtime.openOptionsPage();
    }
  });

  browser.runtime.onStartup.addListener(setupContextMenu);
  browser.runtime.onInstalled.addListener(setupContextMenu);

  function setupContextMenu() {
    browser.contextMenus.create({
      id: 'log-nihongo-text',
      title: 'Log this text to NihongoTracker',
      contexts: ['selection'],
    });
  }

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'log-nihongo-text' && info.selectionText && tab?.id) {
      const config = await configStorage.getValue();
      const chars = info.selectionText.length;
      
      let activeTimeMinutes = 0;
      if (config.trackTextTime) {
        try {
          const response = await browser.tabs.sendMessage(tab.id, { action: 'GET_ACTIVE_TIME' });
          activeTimeMinutes = response?.minutes || 0;
        } catch (e) {
          console.warn('Could not get time from content script');
        }
      }

      try {
        await submitLog({
          type: 'reading',
          mediaData: {
            contentTitleNative: tab.title || 'Unknown Webpage',
            contentTitleEnglish: tab.url || '',
          },
          description: 'Logged via Context Menu',
          chars: chars,
          time: activeTimeMinutes,
          date: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Failed to log text:', error);
      }
    }
  });
});
