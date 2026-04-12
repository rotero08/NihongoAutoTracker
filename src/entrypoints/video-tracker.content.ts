import { defineContentScript } from '#imports';
import { configStorage } from '@/utils/storage';
import { submitLog } from '@/utils/api';
import '@/assets/notifications.css';

export default defineContentScript({
  matches: ['*://*.youtube.com/*', '*://*.crunchyroll.com/*', '*://hianime.to/*'],
  main() {
    let currentVideo: HTMLVideoElement | null = null;
    let hasLogged = false;

    const logCurrentVideo = async (manual = false) => {
      const video = document.querySelector('video');
      if (!video || hasLogged) return;

      const config = await configStorage.getValue();
      if (!manual && config.logMode !== 'auto') return;

      hasLogged = true;
      try {
        await submitLog({
          type: 'watching',
          mediaData: { 
            contentTitleNative: document.title,
            contentTitleEnglish: window.location.href 
          },
          time: Math.floor(video.duration / 60),
          date: new Date().toISOString(),
        });
      } catch (e) { hasLogged = false; }
    };

    // Injection logic... (simplified for reliability)
    setInterval(() => {
      if (document.getElementById('nt-btn')) return;
      const target = document.querySelector('.ytp-right-controls') || document.body;
      const btn = document.createElement('button');
      btn.id = 'nt-btn';
      btn.innerText = 'Log JP';
      btn.style.cssText = 'background: #89b4fa; color: #11111b; border: none; padding: 5px; margin: 5px; cursor: pointer; border-radius: 4px;';
      btn.onclick = () => logCurrentVideo(true);
      target.prepend(btn);
    }, 3000);
  }
});
