import { defineContentScript } from 'wxt/sandbox';
import { configStorage } from '@/utils/storage';
import { submitLog } from '@/utils/api';

export default defineContentScript({
  matches: ['*://*.youtube.com/*', '*://*.crunchyroll.com/*', '*://hianime.to/*'],
  main() {
    let currentVideo: HTMLVideoElement | null = null;
    let hasLogged = false;

    async function injectButtons() {
      const config = await configStorage.getValue();
      if (config.hideButtons) return;
      if (document.getElementById('nihongo-tracker-container')) return;

      const container = document.createElement('div');
      container.id = 'nihongo-tracker-container';
      container.style.cssText = 'display: inline-flex; gap: 8px; margin-left: 10px; z-index: 9999;';

      const manualBtn = document.createElement('button');
      manualBtn.innerText = 'Log Video';
      manualBtn.style.cssText = 'background: #4caf50; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;';
      manualBtn.onclick = () => logCurrentVideo(true);

      const autoBtn = document.createElement('button');
      autoBtn.innerText = `Auto: ${config.logMode.toUpperCase()}`;
      autoBtn.style.cssText = 'background: #2196f3; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;';
      autoBtn.onclick = async () => {
        const newMode = config.logMode === 'auto' ? 'manual' : 'auto';
        await configStorage.setValue({ ...config, logMode: newMode });
        autoBtn.innerText = `Auto: ${newMode.toUpperCase()}`;
      };

      container.appendChild(manualBtn);
      container.appendChild(autoBtn);

      const titleSelectors = ['h1.ytd-watch-metadata', '.show-title', '.film-name'];
      let placed = false;
      for (const selector of titleSelectors) {
        const titleEl = document.querySelector(selector);
        if (titleEl && titleEl.parentNode) {
          titleEl.parentNode.insertBefore(container, titleEl.nextSibling);
          placed = true;
          break;
        }
      }
      if (!placed) document.body.appendChild(container);
    }

    async function logCurrentVideo(manual = false) {
      if (hasLogged || !currentVideo) return;
      const config = await configStorage.getValue();
      if (!manual && config.logMode !== 'auto') return;

      hasLogged = true;
      const title = document.title.replace(/^\([0-9]+\)\s/, '');

      try {
        await submitLog({
          type: 'watching',
          mediaData: { contentTitleNative: title },
          description: manual ? 'Logged manually via extension' : 'Auto-logged by extension',
          time: Math.floor(currentVideo.duration / 60),
          date: new Date().toISOString(),
        });
        alert('NihongoTracker: Video Logged!');
      } catch (e) {
        console.error('NihongoTracker logging failed', e);
        hasLogged = false;
      }
    }

    setInterval(async () => {
      const config = await configStorage.getValue();
      const video = document.querySelector('video');
      
      if (video && video !== currentVideo) {
        currentVideo = video;
        hasLogged = false;
        injectButtons();

        video.addEventListener('timeupdate', () => {
          if (!hasLogged && config.logMode === 'auto') {
            const percentage = (video.currentTime / video.duration) * 100;
            if (percentage >= config.threshold) {
              logCurrentVideo(false);
            }
          }
        });
      }
    }, 2000);
  },
});
