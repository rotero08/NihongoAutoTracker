import './style.css';
import { configStorage, videoQueueStorage, type QueuedVideoLog } from '@/utils/storage';
import { submitLog } from '@/utils/api';

// ── Tab navigation ────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLElement>('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const tab = item.dataset.tab!;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`tab-${tab}`)!.classList.add('active');
  });
});

// ── Tooltip triggers ──────────────────────────────────────────────────────────
document.querySelectorAll<HTMLElement>('.tip-trigger').forEach(el => {
  el.addEventListener('click', e => {
    e.stopPropagation();
    const key = el.dataset.tip!;
    const tip = document.getElementById(`tip-${key}`)!;
    const isOpen = tip.style.display !== 'none';
    // close all
    document.querySelectorAll<HTMLElement>('.tooltip').forEach(t => t.style.display = 'none');
    if (!isOpen) tip.style.display = 'block';
  });
});

// ── Status toast ──────────────────────────────────────────────────────────────
const statusEl = document.getElementById('status')!;
let statusTimer: ReturnType<typeof setTimeout>;
function showStatus(msg: string, err = false) {
  statusEl.textContent = msg;
  statusEl.className = 'status-toast' + (err ? ' err' : '');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.add('hidden'), 3000);
}

// ── Refs: API ─────────────────────────────────────────────────────────────────
const apiKeyEl    = document.getElementById('api-key')      as HTMLInputElement;
const toggleKeyEl = document.getElementById('toggle-key')!;
const apiStatusEl = document.getElementById('api-status')!;
const saveApiBtn  = document.getElementById('save-api-btn')!;

// ── Refs: Video ───────────────────────────────────────────────────────────────
const logModeEls    = document.querySelectorAll<HTMLInputElement>('input[name="log-mode"]');
const thresholdEl   = document.getElementById('threshold')       as HTMLInputElement;
const threshValEl   = document.getElementById('threshold-val')!;
const threshField   = document.getElementById('threshold-field')!;
const hideBtnsEl    = document.getElementById('hide-buttons')    as HTMLInputElement;
const saveVideoBtn  = document.getElementById('save-video-btn')!;

// ── Refs: Overlay ─────────────────────────────────────────────────────────────
const trackTimeEl   = document.getElementById('track-time')      as HTMLInputElement;
const overlayEls    = document.querySelectorAll<HTMLInputElement>('input[name="overlay-pos"]');
const saveOverlayBtn= document.getElementById('save-overlay-btn')!;

// ── Refs: Queue ───────────────────────────────────────────────────────────────
const queueListEl   = document.getElementById('queue-list')!;
const queueActions  = document.getElementById('queue-actions')!;
const navBadge      = document.getElementById('nav-badge')!;
const sendAllBtn    = document.getElementById('send-all-btn')!;
const clearAllBtn   = document.getElementById('clear-all-btn')!;

// ── Load config ───────────────────────────────────────────────────────────────
async function loadConfig() {
  const cfg = await configStorage.getValue();

  apiKeyEl.value = cfg.apiKey;
  setApiStatus(cfg.apiKey);

  logModeEls.forEach(r => { r.checked = r.value === cfg.logMode; });
  thresholdEl.value = String(cfg.threshold);
  threshValEl.textContent = `${cfg.threshold}%`;
  hideBtnsEl.checked = cfg.hideButtons;
  updateThreshField(cfg.logMode);

  trackTimeEl.checked = cfg.trackTime;
  overlayEls.forEach(r => { r.checked = r.value === cfg.overlayPosition; });
}

function setApiStatus(key: string) {
  apiStatusEl.textContent = key ? '● Key is configured' : '○ No key set — logs will not send';
  apiStatusEl.className   = 'api-status ' + (key ? 'ok' : 'err');
}

function updateThreshField(mode: string) {
  threshField.classList.toggle('dim', mode !== 'auto');
}

// ── API key ───────────────────────────────────────────────────────────────────
toggleKeyEl.addEventListener('click', () => {
  apiKeyEl.type = apiKeyEl.type === 'password' ? 'text' : 'password';
});

saveApiBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue();
  const key = apiKeyEl.value.trim();
  await configStorage.setValue({ ...cfg, apiKey: key });
  setApiStatus(key);
  showStatus(key ? '✓ API Key saved' : '⚠ API Key cleared');
});

// ── Video settings ────────────────────────────────────────────────────────────
logModeEls.forEach(r => {
  r.addEventListener('change', () => updateThreshField(r.value));
});

thresholdEl.addEventListener('input', () => {
  threshValEl.textContent = `${thresholdEl.value}%`;
});

saveVideoBtn.addEventListener('click', async () => {
  const cfg  = await configStorage.getValue();
  const mode = Array.from(logModeEls).find(r => r.checked)?.value as 'auto' | 'manual' ?? 'manual';
  await configStorage.setValue({
    ...cfg,
    logMode:     mode,
    threshold:   Number(thresholdEl.value),
    hideButtons: hideBtnsEl.checked,
  });
  showStatus('✓ Video settings saved');
});

// ── Overlay settings ──────────────────────────────────────────────────────────
saveOverlayBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue();
  const pos = Array.from(overlayEls).find(r => r.checked)?.value as any ?? 'top-right';
  await configStorage.setValue({ ...cfg, trackTime: trackTimeEl.checked, overlayPosition: pos });
  showStatus('✓ Overlay settings saved');
});

// ── Queue ─────────────────────────────────────────────────────────────────────
async function renderQueue() {
  const queue = await videoQueueStorage.getValue();

  navBadge.textContent = String(queue.length);
  navBadge.classList.toggle('hidden', queue.length === 0);
  queueActions.style.display = queue.length > 0 ? 'flex' : 'none';

  if (queue.length === 0) {
    queueListEl.innerHTML = '<div class="empty-state">Queue is empty — go watch some Japanese.</div>';
    return;
  }

  queueListEl.innerHTML = '';
  queue.forEach(item => queueListEl.appendChild(buildItem(item)));
}

function buildItem(item: QueuedVideoLog): HTMLElement {
  const el = document.createElement('div');
  el.className = 'qi';
  el.dataset.id = item.id;

  const date = new Date(item.date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  el.innerHTML = `
    <div class="qi-fields">
      <input class="qi-input qi-title"  type="text"   value="${esc(item.contentTitleNative)}"  placeholder="Title" />
      <input class="qi-input qi-mins"   type="number" value="${item.time}" min="0" title="Minutes watched" />
    </div>
    <div class="qi-meta">${esc(trunc(item.contentTitleEnglish, 80))} · ${date}</div>
    <div class="qi-btns">
      <button class="btn btn-amber btn-sm qi-send">Send</button>
      <button class="btn btn-ghost btn-sm qi-remove">Remove</button>
    </div>`;

  el.querySelector('.qi-send')!.addEventListener('click',   () => sendOne(item.id, el));
  el.querySelector('.qi-remove')!.addEventListener('click', () => removeOne(item.id));
  return el;
}

async function sendOne(id: string, el: HTMLElement) {
  const queue = await videoQueueStorage.getValue();
  const item  = queue.find(i => i.id === id);
  if (!item) return;

  const title = (el.querySelector<HTMLInputElement>('.qi-title'))?.value ?? item.contentTitleNative;
  const time  = Number((el.querySelector<HTMLInputElement>('.qi-mins'))?.value ?? item.time);
  const btn   = el.querySelector<HTMLButtonElement>('.qi-send')!;

  btn.textContent = '…'; btn.disabled = true;
  el.classList.add('sending');

  const ok = await submitLog({
    type: 'watching',
    mediaData: { contentTitleNative: title, contentTitleEnglish: item.contentTitleEnglish },
    time, description: item.description,
    date: item.date, episodes: 0, pages: 0, chars: 0,
    private: item.private, tags: item.tags,
  });

  if (ok) {
    await removeOne(id);
  } else {
    el.classList.remove('sending');
    btn.textContent = 'Send'; btn.disabled = false;
  }
}

async function removeOne(id: string) {
  const q = await videoQueueStorage.getValue();
  await videoQueueStorage.setValue(q.filter(i => i.id !== id));
  renderQueue();
}

sendAllBtn.addEventListener('click', async () => {
  const queue = await videoQueueStorage.getValue();
  if (!queue.length) return;

  (sendAllBtn as HTMLButtonElement).disabled    = true;
  (sendAllBtn as HTMLButtonElement).textContent = 'Sending…';

  const failed: QueuedVideoLog[] = [];

  for (const item of queue) {
    const domEl = queueListEl.querySelector<HTMLElement>(`[data-id="${item.id}"]`);
    const title = domEl?.querySelector<HTMLInputElement>('.qi-title')?.value ?? item.contentTitleNative;
    const time  = Number(domEl?.querySelector<HTMLInputElement>('.qi-mins')?.value ?? item.time);

    const ok = await submitLog({
      type: 'watching',
      mediaData: { contentTitleNative: title, contentTitleEnglish: item.contentTitleEnglish },
      time, description: item.description,
      date: item.date, episodes: 0, pages: 0, chars: 0,
      private: item.private, tags: item.tags,
    });

    if (!ok) failed.push(item);
  }

  await videoQueueStorage.setValue(failed);
  (sendAllBtn as HTMLButtonElement).disabled    = false;
  (sendAllBtn as HTMLButtonElement).textContent = 'Send All';

  const sent = queue.length - failed.length;
  showStatus(
    failed.length === 0
      ? `✓ ${sent} video${sent !== 1 ? 's' : ''} sent`
      : `⚠ ${sent} sent, ${failed.length} failed`,
    failed.length > 0,
  );

  renderQueue();
});

clearAllBtn.addEventListener('click', async () => {
  const q = await videoQueueStorage.getValue();
  if (!q.length) return;
  if (!confirm(`Remove all ${q.length} queued video(s)?`)) return;
  await videoQueueStorage.setValue([]);
  renderQueue();
  showStatus('Queue cleared');
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s: string) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function trunc(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s; }

// ── Init ──────────────────────────────────────────────────────────────────────
loadConfig();
renderQueue();
