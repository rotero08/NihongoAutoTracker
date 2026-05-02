import './style.css';
import { videoQueueStorage, configStorage } from '@/utils/storage';

const queueListEl  = document.getElementById('queue-list')!;
const queueCountEl = document.getElementById('queue-count')!;
const apiPillEl    = document.getElementById('api-pill')!;
const btnOpen      = document.getElementById('btn-open')!;
const btnSettings  = document.getElementById('btn-settings')!;

function openSettings() {
  // Open as a regular tab — no Firefox "Preferences" panel involvement.
  browser.tabs.create({ url: browser.runtime.getURL('/settings.html') });
  window.close();
}

btnOpen.addEventListener('click', openSettings);
btnSettings.addEventListener('click', openSettings);

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

async function render() {
  const cfg   = await configStorage.getValue();
  const queue = await videoQueueStorage.getValue();

  // API pill
  if (cfg.apiKey) {
    apiPillEl.textContent = 'API Key ✓';
    apiPillEl.className   = 'pill pill-ok';
  } else {
    apiPillEl.textContent = 'No API Key';
    apiPillEl.className   = 'pill pill-off';
  }

  // Queue count
  queueCountEl.textContent = String(queue.length);

  // Queue preview
  if (queue.length === 0) {
    queueListEl.innerHTML = '<div class="empty-msg">Queue is empty.</div>';
    return;
  }

  queueListEl.innerHTML = '';
  queue
    .slice(-5)
    .reverse()
    .forEach(item => {
      const title = item.contentTitleNative || item.contentTitleEnglish || 'Unknown';
      const date  = new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const div   = document.createElement('div');
      div.className = 'qi';
      div.innerHTML = `
        <div class="qi-title">${esc(title)}</div>
        <div class="qi-meta"><span class="qi-time">${item.time}&thinsp;min</span> &middot; ${date}</div>`;
      queueListEl.appendChild(div);
    });
}

render();
