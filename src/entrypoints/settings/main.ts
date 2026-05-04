import './style.css';
import { configStorage, videoQueueStorage, readingQueueStorage, type QueuedVideoLog } from '@/utils/storage';
import { submitLog } from '@/utils/api';

const BUILT_IN_ALLOW =[
  'nhk.or.jp','nhk.jp','news.yahoo.co.jp','yomiuri.co.jp','asahi.com','mainichi.jp',
'nikkei.com','tokyoreporter.com','watanoc.com','aozora.gr.jp','syosetu.com','kakuyomu.jp',
'pixiv.net','nicovideo.jp','comic-walker.com','manga-raw.club','jisho.org',
'wanikani.com','bunpro.jp','satorireader.com','reader.ttsu.app',
];
const BUILT_IN_SKIP =[
  'youtube.com','youtu.be','crunchyroll.com','animekai.to','music.youtube.com','nihongotracker.app', 'mail.google.com', 'mail.proton.me'
];

// ── Tab nav ───────────────────────────────────────────────────────────────────
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

// ── Toast ─────────────────────────────────────────────────────────────────────
const statusEl = document.getElementById('status')!;
let statusTimer: ReturnType<typeof setTimeout>;
function showStatus(msg: string, err = false) {
  statusEl.textContent = msg;
  statusEl.className = 'status-toast' + (err ? ' err' : '');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.add('hidden'), 3000);
}

// ── Refs ──────────────────────────────────────────────────────────────────────
const apiKeyEl       = document.getElementById('api-key')        as HTMLInputElement;
const toggleKeyEl    = document.getElementById('toggle-key')!;
const apiStatusEl    = document.getElementById('api-status')!;
const saveApiBtn     = document.getElementById('save-api-btn')!;
const autoSendEl     = document.getElementById('auto-send')      as HTMLInputElement;
const autoConfigEl   = document.getElementById('auto-config')!;
const threshTypeEls  = document.querySelectorAll<HTMLInputElement>('input[name="thresh-type"]');
const threshPctEl    = document.getElementById('threshold-pct')  as HTMLInputElement;
const threshMinEl    = document.getElementById('threshold-min')  as HTMLInputElement;
const threshUnitEl   = document.getElementById('thresh-unit')!;
const threshSliderWrap = document.getElementById('thresh-slider-wrap')!;
const threshMinsWrap = document.getElementById('thresh-minutes-wrap')!;
const hideBtnsEl     = document.getElementById('hide-buttons')   as HTMLInputElement;
const hideJpFieldEl  = document.getElementById('hide-jp-field')!;
const hideIfNotJpEl  = document.getElementById('hide-if-not-jp') as HTMLInputElement;
const showTotalEl    = document.getElementById('show-total-badge') as HTMLInputElement;
const saveVideoBtn   = document.getElementById('save-video-btn')!;
const trackTimeEl    = document.getElementById('track-time')       as HTMLInputElement;
const overlayEls     = document.querySelectorAll<HTMLInputElement>('input[name="overlay-pos"]');
const saveOverlayBtn = document.getElementById('save-overlay-btn')!;
const allowListOnlyEl= document.getElementById('allow-list-only') as HTMLInputElement;
const queueListEl    = document.getElementById('queue-list')!;
const queueActions   = document.getElementById('queue-actions')!;
const navBadge       = document.getElementById('nav-badge')!;
const sendAllBtn     = document.getElementById('send-all-btn')!;
const clearAllBtn    = document.getElementById('clear-all-btn')!;
const allowListEl    = document.getElementById('allow-list')!;
const skipListEl     = document.getElementById('skip-list')!;
const allowCountEl   = document.getElementById('allow-count')!;
const skipCountEl    = document.getElementById('skip-count')!;
const allowInputEl   = document.getElementById('allow-input') as HTMLInputElement;
const skipInputEl    = document.getElementById('skip-input')  as HTMLInputElement;
const allowAddBtn    = document.getElementById('allow-add')!;
const skipAddBtn     = document.getElementById('skip-add')!;
const ttuEnabledEl   = document.getElementById('ttu-enabled') as HTMLInputElement;
const ttuAutoSaveEl  = document.getElementById('ttu-auto-save') as HTMLInputElement;

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s: string) { return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function trunc(s: string, n: number) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); }
const toLocalDT = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const SVG_UP = `<svg viewBox="0 0 10 6"><polyline points="1,5 5,1 9,5"/></svg>`;
const SVG_DN = `<svg viewBox="0 0 10 6"><polyline points="1,1 5,5 9,1"/></svg>`;

// ── Config Logic ──────────────────────────────────────────────────────────────
async function loadConfig() {
  const cfg = await configStorage.getValue() as any;
  apiKeyEl.value = cfg.apiKey ?? '';
  setApiStatus(cfg.apiKey ?? '');

  const autoSend = cfg.autoSend ?? (cfg.logMode === 'auto') ?? false;
  autoSendEl.checked = autoSend;
  updateAutoConfigDim(autoSend);

  const threshType = cfg.thresholdType ?? 'percent';
  threshTypeEls.forEach(r => { r.checked = r.value === threshType; });
  updateThreshUI(threshType, cfg);

  hideBtnsEl.checked = cfg.hideButtons ?? false;
  hideIfNotJpEl.checked = cfg.hideIfNotJapanese ?? false;
  updateHideJpDim(hideBtnsEl.checked);

  if (showTotalEl) showTotalEl.checked = cfg.showTotalInBadge ?? true;

  trackTimeEl.checked = cfg.trackTime ?? false;
  allowListOnlyEl.checked = cfg.allowListOnly ?? false;
  overlayEls.forEach(r => { r.checked = r.value === (cfg.overlayPosition ?? 'top-right'); });
  renderSites(cfg.allowSites ?? [...BUILT_IN_ALLOW], cfg.skipSites ?? [...BUILT_IN_SKIP]);

  ttuEnabledEl.checked = cfg.ttuEnabled ?? false;
  ttuAutoSaveEl.checked = cfg.ttuAutoSave ?? true;
}

function setApiStatus(key: string) {
  apiStatusEl.textContent = key ? '● Key is configured' : '○ No key set';
  apiStatusEl.className = 'api-status ' + (key ? 'ok' : 'err');
}
function updateAutoConfigDim(on: boolean) { autoConfigEl.classList.toggle('dim-block', !on); }
function updateHideJpDim(hideBtns: boolean) { hideJpFieldEl.classList.toggle('dim-block', hideBtns); }
function updateThreshUI(type: string, cfg?: any) {
  const isPct = type === 'percent';
  threshSliderWrap.style.display = isPct ? 'block' : 'none';
  threshMinsWrap.style.display = !isPct ? 'block' : 'none';
  const v = isPct ? (cfg?.thresholdValue ?? cfg?.threshold ?? 95) : (cfg?.thresholdValue ?? 30);
  if (isPct) { threshPctEl.value = String(v); threshUnitEl.textContent = v + '%'; }
  else { threshMinEl.value = String(v); threshUnitEl.textContent = v + ' min'; }
}

// ── Site List Logic ───────────────────────────────────────────────────────────
function renderSites(allow: string[], skip: string[]) {
  allowListEl.innerHTML = ''; skipListEl.innerHTML = '';
  allow.forEach(d => allowListEl.appendChild(buildSiteItem(d, 'allow')));
  skip.forEach(d => skipListEl.appendChild(buildSiteItem(d, 'skip')));
  allowCountEl.textContent = String(allow.length);
  skipCountEl.textContent = String(skip.length);
}

function buildSiteItem(domain: string, list: 'allow'|'skip'): HTMLElement {
  const el = document.createElement('div'); el.className = 'site-item';
  const host = document.createElement('span'); host.className = 'site-item-host'; host.textContent = domain;
  const rm = document.createElement('button'); rm.className = 'site-remove';
  rm.innerHTML = `<svg viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;
  rm.onclick = async () => {
    const cfg = await configStorage.getValue() as any;
    const key = list === 'allow' ? 'allowSites' : 'skipSites';
    const next = (cfg[key] ?? []).filter((d: string) => d !== domain);
    await configStorage.setValue({ ...cfg, [key]: next });
    loadConfig();
  };
  el.append(host, rm); return el;
}

// ── Queue Item UI ─────────────────────────────────────────────────────────────
function buildItem(item: any, type: 'video' | 'reading'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'qi';
  el.dataset.id = item.id;
  el.dataset.type = type;

  const sessions: any[] = item.sessions ?? [];
  let sessionsHtml = '';

  if (sessions.length > 1) {
    sessionsHtml = `<div class="qi-sessions">` + sessions.map((s, i) => `
    <div class="qi-session" data-session-id="${s.id}">
    <span class="qi-session-num">S${i + 1}</span>
    <input class="qi-session-mins" type="number" value="${Math.max(1, Math.round(s.secs / 60))}"/>
    <span style="font-size:10px;color:var(--muted)">min</span>
    ${type === 'reading' ? `<input class="qi-session-chars" type="number" value="${s.chars || 0}"/>` : ''}
    <input type="datetime-local" class="qi-session-date-input" value="${toLocalDT(s.date)}" />
    <button class="qi-session-remove" title="Remove" style="background:none;border:none;color:var(--red);cursor:pointer;padding:0 4px;font-size:14px;">×</button>
    </div>`).join('') + `</div>`;
  }

  const charsHtml = type === 'reading' ? `
  <div class="qi-spinner" style="margin-left:8px;">
  <input class="qi-input qi-chars" type="number" value="${item.chars || 0}" min="0" placeholder="Chars"/>
  <div class="qi-spin-btns">
  <button type="button" class="qi-spin-up chars-up" tabindex="-1">${SVG_UP}</button>
  <button type="button" class="qi-spin-dn chars-dn" tabindex="-1">${SVG_DN}</button>
  </div>
  </div>` : '';

  const dateVal = (item.date ? item.date : new Date().toISOString()).split('T')[0];

  el.innerHTML = `
  <div class="qi-fields">
  <input class="qi-input qi-desc" type="text" value="${esc(item.description || '')}" placeholder="${type === 'reading' ? 'Session Note / Chapter' : 'Video Title'}"/>
  <div style="display:flex;gap:8px;">
  <div class="qi-spinner">
  <input class="qi-input qi-mins" type="number" value="${item.time || 0}" min="0"/>
  <div class="qi-spin-btns">
  <button type="button" class="qi-spin-up mins-up" tabindex="-1">${SVG_UP}</button>
  <button type="button" class="qi-spin-dn mins-dn" tabindex="-1">${SVG_DN}</button>
  </div>
  </div>
  ${charsHtml}
  </div>
  </div>
  <div class="qi-meta-row">
  <span class="qi-meta-url">
  <span style="display:inline-block;background:var(--surf);padding:1px 5px;border-radius:3px;margin-right:6px;border:1px solid var(--bdr2);font-size:9px;">${type === 'reading' ? 'READ' : 'WATCH'}</span>
  ${esc(item.contentTitleNative || 'Unknown Title')}
  </span>
  <input type="date" class="qi-date-input" value="${dateVal}" ${sessions.length > 1 ? 'disabled style="opacity:0.5"' : ''}/>
  </div>
  ${sessionsHtml}
  <div class="qi-btns">
  <button class="btn btn-amber btn-sm qi-send">Send</button>
  <button class="btn btn-ghost btn-sm qi-remove">Remove</button>
  </div>`;

  // Total spinners
  const minsEl = el.querySelector<HTMLInputElement>('.qi-fields .qi-mins')!;
  el.querySelector('.mins-up')!.addEventListener('click', () => { minsEl.value = String(Math.max(0, Number(minsEl.value) + 1)); });
  el.querySelector('.mins-dn')!.addEventListener('click', () => { minsEl.value = String(Math.max(0, Number(minsEl.value) - 1)); });

  if (type === 'reading') {
    const charsEl = el.querySelector<HTMLInputElement>('.qi-fields .qi-chars')!;
    el.querySelector('.chars-up')!.addEventListener('click', () => { charsEl.value = String(Math.max(0, Number(charsEl.value) + 100)); });
    el.querySelector('.chars-dn')!.addEventListener('click', () => { charsEl.value = String(Math.max(0, Number(charsEl.value) - 100)); });
  }

  el.querySelector('.qi-remove')!.addEventListener('click', () => removeOne(item.id, type));
  el.querySelector('.qi-send')!.addEventListener('click', () => sendOne(item.id, el));

  el.querySelectorAll('.qi-session-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const sId = (e.target as HTMLElement).closest('.qi-session')!.getAttribute('data-session-id');
      const targetStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
      const q = await targetStorage.getValue();
      const idx = q.findIndex((x: any) => x.id === item.id);
      if (idx !== -1) {
        q[idx].sessions = q[idx].sessions.filter((s: any) => s.id !== sId);
        q[idx].time = Math.round((q[idx].sessions.reduce((a: any, b: any) => a + b.secs, 0)) / 60);
        if (type === 'reading') {
          q[idx].chars = q[idx].sessions.reduce((a: any, b: any) => a + (b.chars || 0), 0);
        }
        await targetStorage.setValue(q);
        renderQueue();
      }
    });
  });

  return el;
}

// ── Payload Compiler ──────────────────────────────────────────────────────────
function getPayloadsForItem(item: any, el: HTMLElement) {
  const type = el.dataset.type as 'video' | 'reading';
  const desc = (el.querySelector('.qi-desc') as HTMLInputElement).value;
  const totalMins = Number((el.querySelector('.qi-mins') as HTMLInputElement).value);
  const sessionNodes = Array.from(el.querySelectorAll('.qi-session'));

  const base = {
    type, mediaId: type === 'reading' ? 'web-reading' : (item.channelId || "web-video"),
    mediaData: type === 'reading' ? { title: item.contentTitleNative } : { channelId: item.channelId || "web-video", channelTitle: item.contentTitleNative },
    description: desc, episodes: 0, pages: 0, unknownDate: false
  };

  if (sessionNodes.length > 0) {
    return sessionNodes.map(node => ({
      ...base,
      time: Number((node.querySelector('.qi-session-mins') as HTMLInputElement).value),
                                     date: new Date((node.querySelector('.qi-session-date-input') as HTMLInputElement).value).toISOString(),
                                     chars: type === 'reading' ? Number((node.querySelector('.qi-session-chars') as HTMLInputElement).value) : 0
    }));
  }

  return [{
    ...base,
    time: totalMins,
    date: new Date((el.querySelector('.qi-date-input') as HTMLInputElement).value + 'T12:00:00').toISOString(),
    chars: type === 'reading' ? Number((el.querySelector('.qi-chars') as HTMLInputElement).value) : 0
  }];
}

// ── Main Operations ───────────────────────────────────────────────────────────
async function renderQueue() {
  const vQ = await videoQueueStorage.getValue();
  const rQ = await readingQueueStorage.getValue();
  const total = vQ.length + rQ.length;

  navBadge.textContent = String(total);
  navBadge.classList.toggle('hidden', total === 0);
  queueActions.style.display = total > 0 ? 'flex' : 'none';
  queueListEl.innerHTML = total === 0 ? '<div class="empty-state">Queue is empty</div>' : '';

  // Safely render each item
  rQ.forEach(item => {
    try { queueListEl.appendChild(buildItem(item, 'reading')); }
    catch (e) { console.error("Failed to render reading item", item, e); }
  });
  vQ.forEach(item => {
    try { queueListEl.appendChild(buildItem(item, 'video')); }
    catch (e) { console.error("Failed to render video item", item, e); }
  });
}

async function sendOne(id: string, el: HTMLElement) {
  const type = el.dataset.type as 'video' | 'reading';
  const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
  const q = await qStorage.getValue();
  const item = q.find((x: any) => x.id === id);
  if (!item) return;

  const btn = el.querySelector('.qi-send') as HTMLButtonElement;
  btn.disabled = true; btn.textContent = '...'; el.classList.add('sending');

  const payloads = getPayloadsForItem(item, el);
  let success = true;
  for (const p of payloads) { if (!(await submitLog(p))) success = false; }

  if (success) { showStatus('✓ Sent'); removeOne(id, type); }
  else { showStatus('⚠ Failed', true); el.classList.remove('sending'); btn.disabled = false; btn.textContent = 'Send'; }
}

async function removeOne(id: string, type: 'video' | 'reading') {
  const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
  const q = await qStorage.getValue();
  await qStorage.setValue(q.filter((x: any) => x.id !== id));
  renderQueue();
}

sendAllBtn.addEventListener('click', async () => {
  const items = Array.from(queueListEl.querySelectorAll('.qi')) as HTMLElement[];
  sendAllBtn.disabled = true;
  for (const el of items) { await sendOne(el.dataset.id!, el); }
  sendAllBtn.disabled = false;
});

clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Clear all pending logs?')) return;
  await videoQueueStorage.setValue([]);
  await readingQueueStorage.setValue([]);
  renderQueue();
});

// Settings interactions
apiKeyEl.onchange = () => saveApiBtn.click();
saveApiBtn.onclick = async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, apiKey: apiKeyEl.value.trim() });
  loadConfig(); showStatus('✓ API Key Saved');
};

ttuAutoSaveEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, ttuAutoSave: ttuAutoSaveEl.checked });
  showStatus(ttuAutoSaveEl.checked ? '✓ TTU Auto-sync enabled' : '✓ TTU Auto-sync disabled');
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadConfig();
renderQueue();

readingQueueStorage.watch(() => {
  if (!document.querySelector('.qi-input:focus, .qi-session-mins:focus, .qi-session-date-input:focus, .qi-date-input:focus, .qi-chars:focus')) {
    renderQueue();
  }
});
videoQueueStorage.watch(() => {
  if (!document.querySelector('.qi-input:focus, .qi-session-mins:focus, .qi-session-date-input:focus, .qi-date-input:focus, .qi-chars:focus')) {
    renderQueue();
  }
});
