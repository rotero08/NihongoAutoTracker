import { defineContentScript } from '#imports';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let activeTimeMs = 0;
    let lastActiveStamp = Date.now();
    let isTracking = !document.hidden;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (isTracking) activeTimeMs += Date.now() - lastActiveStamp;
        isTracking = false;
      } else {
        lastActiveStamp = Date.now();
        isTracking = true;
      }
    });

    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'GET_ACTIVE_TIME') {
        const currentTracking = isTracking ? (Date.now() - lastActiveStamp) : 0;
        const totalMinutes = Math.floor((activeTimeMs + currentTracking) / 60000);
        sendResponse({ minutes: totalMinutes });
      }
    });
  },
});
