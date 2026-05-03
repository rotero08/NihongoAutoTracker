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

function fmtMins(secs: number): number {
  return Math.max(1, Math.round(secs / 60));
}

function toDateValue(iso: string): string {
  try { return new Date(iso).toISOString().split('T')[0]; } catch { return ''; }
}

function fmtDateShort(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (v) return `youtu.be/${v.slice(0, 8)}`;
    return (u.hostname + u.pathname).replace('www.', '').slice(0, 22);
  } catch { return url.slice(0, 20); }
}

// ── Send single item ──────────────────────────────────────────────────────────
async function sendItem(item: any, el: HTMLElement): Promise<boolean> {
  el.classList.add('sending');

  const titleEl = el.querySelector<HTMLInputElement>('.qi-title')!;
  const timeEl  = el.querySelector<HTMLInputElement>('.qi-time-num')!;
  const dateEl  = el.querySelector<HTMLInputElement>('.qi-date')!;

  const minutes = Math.max(1, parseInt(timeEl.value) || item.time);
  const desc    = titleEl.value.trim() || item.description || item.contentTitleNative || 'Unknown';
  const dateISO = dateEl.value ? new Date(dateEl.value).toISOString() : new Date().toISOString();

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
    date:        dateISO,
    unknownDate: false,
  });

  if (ok) {
    const queue = await videoQueueStorage.getValue();
    await videoQueueStorage.setValue(queue.filter((q: any) => q.id !== item.id));
    el.classList.add('sent');
    setTimeout(() => { el.remove(); refreshMeta(); }, 380);
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

async function refreshMeta() {
  const queue = await videoQueueStorage.getValue();
  queueCountEl.textContent = String(queue.length);
  queueBulkEl.style.display = queue.length ? 'flex' : 'none';
  if (queue.length === 0) {
    queueListEl.innerHTML = '<div class="empty-msg">Queue is empty.</div>';
  }
}

// ── Build one queue item element ──────────────────────────────────────────────
function buildItem(item: any): HTMLElement {
  // description = video title, contentTitleNative = channel name
  const title   = item.description || 'Unknown';
  const channel = item.contentTitleNative || 'Unknown';
  const link    = shortUrl(item.contentTitleEnglish || '');
  const dateVal = toDateValue(item.date);
  const sessions: any[] = item.sessions ?? [];

  const el = document.createElement('div');
  el.className = 'qi';
  el.dataset.id = item.id;

  // Sessions — each row: dot · editable mins · editable date
  const sessionsHtml = sessions.length > 0 ? `
  <div class="qi-sessions">
  ${sessions.map((s, i) => `
    <div class="qi-session" data-sidx="${i}">
    <span class="session-dot"></span>
    <input class="ghost-num session-num" type="number" min="1"
    value="${fmtMins(s.secs)}" title="Session minutes" data-sidx="${i}"/>
    <span style="font-size:9px;color:var(--dim);margin-right:2px;">min</span>
    <input class="ghost-date session-date" type="date"
    value="${toDateValue(s.date)}" title="${esc(fmtDateShort(s.date))}" data-sidx="${i}"/>
    </div>`).join('')}
    </div>` : '';

    el.innerHTML = `
    <div class="qi-title-row">
    <input class="ghost-input qi-title" type="text"
    value="${esc(title)}" title="${esc(title)}"/>
    <button class="qi-del" title="Remove">×</button>
    </div>
    <div class="qi-meta-row">
    <input class="ghost-num qi-time-num" type="number" min="1"
    value="${item.time}" title="Total minutes"/>
    <span style="font-size:9px;color:var(--dim);margin-right:3px;flex-shrink:0;">min</span>
    <span class="qi-meta-sep">·</span>
    <div class="qi-mid">
    <span class="qi-channel" title="${esc(channel)}">${esc(channel)}</span>
    <span class="qi-meta-sep">·</span>
    <span class="qi-link" title="${esc(item.contentTitleEnglish || '')}">${esc(link)}</span>
    </div>
    <input class="ghost-date qi-date" type="date"
    value="${dateVal}" title="${esc(fmtDateShort(item.date))}"/>
    <button class="qi-send">Send</button>
    </div>
    ${sessionsHtml}`;

    el.querySelector('.qi-send')!.addEventListener('click', () => sendItem(item, el));
    el.querySelector('.qi-del')!.addEventListener('click',  () => removeItem(item.id, el));

    return el;
}

// ── Render ────────────────────────────────────────────────────────────────────
async function render() {
  const cfg   = await configStorage.getValue();
  const queue = await videoQueueStorage.getValue();

  apiPillEl.textContent = cfg?.apiKey ? 'API Key ✓' : 'No API Key';
  apiPillEl.className   = `pill ${cfg?.apiKey ? 'pill-ok' : 'pill-off'}`;

  queueCountEl.textContent = String(queue.length);
  queueBulkEl.style.display = queue.length ? 'flex' : 'none';

  if (queue.length === 0) {
    queueListEl.innerHTML = '<div class="empty-msg">Queue is empty.</div>';
    return;
  }

  queueListEl.innerHTML = '';
  [...queue].reverse().forEach((item: any) => {
    queueListEl.appendChild(buildItem(item));
  });
}

// ── Send All ──────────────────────────────────────────────────────────────────
btnSendAll.addEventListener('click', async () => {
  const btn = btnSendAll as HTMLButtonElement;
  btn.textContent = '…'; btn.disabled = true;

  const items = [...queueListEl.querySelectorAll<HTMLElement>('.qi')];
  for (const el of items) {
    const queue = await videoQueueStorage.getValue();
    const item  = queue.find((q: any) => q.id === el.dataset.id);
    if (item) await sendItem(item, el);
  }

  btn.textContent = 'Send All'; btn.disabled = false;
  await refreshMeta();
});

// ── Clear All ─────────────────────────────────────────────────────────────────
btnClearAll.addEventListener('click', async () => {
  await videoQueueStorage.setValue([]);
  await render();
});

// ── Live updates ──────────────────────────────────────────────────────────────
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['videoQueue']) render();
});

render();
