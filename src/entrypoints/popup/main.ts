import './style.css';
import { videoQueueStorage, configStorage } from '@/utils/storage';
import { submitLog } from '@/utils/api';

const queueListEl  = document.getElementById('queue-list')!;
const queueCountEl = document.getElementById('queue-count')!;
const queueBulkEl  = document.getElementById('queue-bulk')!;
const apiPillEl    = document.getElementById('api-pill')!;
const btnOpen      = document.getElementById('btn-open')!;
const btnSettings  = document.getElementById('btn-settings')!;
const btnSendAll   = document.getElementById('btn-send-all')!;
const btnClearAll  = document.getElementById('btn-clear-all')!;

function openSettings() {
  browser.tabs.create({ url: browser.runtime.getURL('/settings.html') });
  window.close();
}
btnOpen.addEventListener('click', openSettings);
btnSettings.addEventListener('click', openSettings);

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// ── Send single item ──────────────────────────────────────────────────────────
async function sendItem(item: any, el: HTMLElement): Promise<boolean> {
  el.classList.add('sending');

  const titleInput = el.querySelector<HTMLInputElement>('.qi-title-input')!;
  const timeInput  = el.querySelector<HTMLInputElement>('.qi-time-input')!;
  const minutes    = Math.max(1, parseInt(timeInput.value) || item.time);
  const desc       = titleInput.value.trim() || item.description || item.contentTitleNative;

  const ok = await submitLog({
    type:        'video',
    mediaId:     item.channelId || 'web-video',
    description: desc,
    mediaData: {
      channelId:    item.channelId || 'web-video',
      channelTitle: item.contentTitleNative || '',
    },
    episodes:    0,
    time:        minutes,
    pages:       0,
    date:        new Date().toISOString(),
                             unknownDate: false,
  });

  if (ok) {
    // Remove from storage
    const queue = await videoQueueStorage.getValue();
    await videoQueueStorage.setValue(queue.filter((q: any) => q.id !== item.id));
    el.classList.add('sent');
    setTimeout(() => el.remove(), 400);
  } else {
    el.classList.remove('sending');
  }
  return ok;
}

// ── Remove single item ────────────────────────────────────────────────────────
async function removeItem(id: string, el: HTMLElement) {
  const queue = await videoQueueStorage.getValue();
  await videoQueueStorage.setValue(queue.filter((q: any) => q.id !== id));
  el.remove();
  await refreshMeta();
}

// ── Refresh count + bulk visibility without full re-render ────────────────────
async function refreshMeta() {
  const queue = await videoQueueStorage.getValue();
  queueCountEl.textContent = String(queue.length);
  queueBulkEl.style.display = queue.length ? 'flex' : 'none';
  if (queue.length === 0) {
    queueListEl.innerHTML = '<div class="empty-msg">Queue is empty.</div>';
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
async function render() {
  const cfg   = await configStorage.getValue();
  const queue = await videoQueueStorage.getValue();

  // API pill
  if (cfg?.apiKey) {
    apiPillEl.textContent = 'API Key ✓';
    apiPillEl.className   = 'pill pill-ok';
  } else {
    apiPillEl.textContent = 'No API Key';
    apiPillEl.className   = 'pill pill-off';
  }

  queueCountEl.textContent = String(queue.length);
  queueBulkEl.style.display = queue.length ? 'flex' : 'none';

  if (queue.length === 0) {
    queueListEl.innerHTML = '<div class="empty-msg">Queue is empty.</div>';
    return;
  }

  queueListEl.innerHTML = '';

  // Newest first
  [...queue].reverse().forEach((item: any) => {
    const title   = item.description || item.contentTitleNative || 'Unknown';
    const channel = item.contentTitleNative || '';
    const date    = new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const meta    = [channel, date].filter(Boolean).join(' · ');

    const el = document.createElement('div');
    el.className = 'qi';
    el.dataset.id = item.id;
    el.innerHTML = `
    <div class="qi-row1">
    <input class="qi-title-input" type="text" value="${esc(title)}" title="${esc(title)}"/>
    <button class="qi-del" title="Remove">×</button>
    </div>
    <div class="qi-row2">
    <div class="qi-time-wrap">
    <input class="qi-time-input" type="number" min="1" value="${item.time}"/>
    <span class="qi-unit">min</span>
    </div>
    <div class="qi-meta" title="${esc(meta)}">${esc(meta)}</div>
    <button class="qi-send">Send</button>
    </div>`;

    el.querySelector('.qi-send')!.addEventListener('click', () => sendItem(item, el));
    el.querySelector('.qi-del')!.addEventListener('click',  () => removeItem(item.id, el));

    queueListEl.appendChild(el);
  });
}

// ── Send All ──────────────────────────────────────────────────────────────────
btnSendAll.addEventListener('click', async () => {
  btnSendAll.textContent = '…';
  (btnSendAll as HTMLButtonElement).disabled = true;

  const items = [...queueListEl.querySelectorAll<HTMLElement>('.qi')];
  for (const el of items) {
    const queue = await videoQueueStorage.getValue();
    const id    = el.dataset.id;
    const item  = queue.find((q: any) => q.id === id);
    if (item) await sendItem(item, el);
  }

  btnSendAll.textContent = 'Send All';
  (btnSendAll as HTMLButtonElement).disabled = false;
  await refreshMeta();
});

// ── Clear All ─────────────────────────────────────────────────────────────────
btnClearAll.addEventListener('click', async () => {
  await videoQueueStorage.setValue([]);
  await render();
});

// ── Live updates from storage changes ────────────────────────────────────────
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['videoQueue']) render();
});

render();
