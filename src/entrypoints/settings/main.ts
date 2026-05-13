import './style.css';
import { configStorage, videoQueueStorage, readingQueueStorage, debugLogStorage, type QueuedReadingLog, type QueuedVideoLog } from '@/utils/storage';
import { resolveVideoChannelMedia, submitLog } from '@/utils/api';

const BUILT_IN_ALLOW =[
  'nhk.or.jp','nhk.jp','news.yahoo.co.jp','yomiuri.co.jp','asahi.com','mainichi.jp',
'nikkei.com','tokyoreporter.com','watanoc.com','aozora.gr.jp','syosetu.com','kakuyomu.jp',
'pixiv.net','nicovideo.jp','comic-walker.com','manga-raw.club','jisho.org',
'wanikani.com','bunpro.jp','satorireader.com','reader.ttsu.app','app.yatsu.moe','manga.manabe.es',
];
const BUILT_IN_SKIP =[
  'youtube.com','youtu.be','crunchyroll.com','animekai.to','music.youtube.com','nihongotracker.app', 'mail.google.com', 'mail.proton.me'
];

const DEFAULT_TITLE_REGEXES =[
  { desc: "YomiYasu Prefix (e.g., 'YomiYasu - Title 1')", re: "^YomiYasu\\s*-\\s*(.*?)\\s+(?:v|vol|第)?(\\d+)" },
  { desc: "Publisher/Label Trailing (e.g., 'Title 18 (MFブックス)')", re: "^(.*?)\\s+(?:v|vol|第)?(\\d+)\\s*(?:巻)?\\s*\\([^)]+\\)$" },
  { desc: "Volume Format 第X巻 (e.g., 'Title 第2巻')", re: "^(.*?)\\s+第(\\d+)巻$" },
  { desc: "Volume Format vX (e.g., 'Title v1')", re: "^(.*?)\\s+v(\\d+)$" },
  { desc: "Standard Space Number (e.g., 'Title 1')", re: "^(.*?)\\s+(\\d+)$" }
];

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

let currentFilter = 'all';
document.querySelectorAll('.q-tab').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.q-tab').forEach(b => b.classList.remove('active'));
    const target = e.target as HTMLElement;
    target.classList.add('active');
    currentFilter = target.dataset.filter!;
    applyFilter();
  });
});

function showConfirmModal(title: string, msg: string, warnKey: string | null = null): Promise<boolean> {
  return new Promise(resolve => {
    let modal = document.getElementById('generic-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'generic-modal';
      modal.className = 'modal-overlay';
  modal.innerHTML = `
  <div class="modal-box">
  <h3 id="gm-title"></h3>
  <p id="gm-desc"></p>
  <label class="toggle" id="gm-warn-wrap" style="margin-top: 10px; display:none;">
  <input type="checkbox" id="gm-warn-chk" class="toggle-chk"/>
  <span class="toggle-track"><span class="toggle-thumb"></span></span>
  Don't warn me again
  </label>
  <div class="modal-actions">
  <button id="gm-cancel" class="btn btn-ghost">Cancel</button>
  <button id="gm-proceed" class="btn btn-amber">Proceed</button>
  </div>
  </div>`;
  document.body.appendChild(modal);
    }

    document.getElementById('gm-title')!.textContent = title;
    document.getElementById('gm-desc')!.textContent = msg;

    const warnWrap = document.getElementById('gm-warn-wrap')!;
    const warnChk = document.getElementById('gm-warn-chk') as HTMLInputElement;
    if (warnKey) { warnWrap.style.display = 'flex'; warnChk.checked = false; }
    else { warnWrap.style.display = 'none'; }

    modal.classList.add('open');

    const close = async (res: boolean) => {
      modal!.classList.remove('open');
      if (res && warnKey && warnChk.checked) {
        const cfg = await configStorage.getValue() as any;
        await configStorage.setValue({ ...cfg, [warnKey]: false });
      }
      resolve(res);
    };

    document.getElementById('gm-cancel')!.onclick = () => close(false);
    document.getElementById('gm-proceed')!.onclick = () => close(true);
  });
}

function applyFilter() {
  const items = document.querySelectorAll('.qi');
  items.forEach(el => {
    const type = (el as HTMLElement).dataset.type;
    const match = currentFilter === 'all' || currentFilter === type;
    (el as HTMLElement).style.display = match ? 'flex' : 'none';
  });
}

const statusEl = document.getElementById('status')!;
let statusTimer: ReturnType<typeof setTimeout>;
function showStatus(msg: string, err = false) {
  statusEl.textContent = msg;
  statusEl.className = 'status-toast' + (err ? ' err' : '');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.add('hidden'), 3000);
}

const apiKeyEl       = document.getElementById('api-key')        as HTMLInputElement;
const toggleKeyEl    = document.getElementById('toggle-key')!;
const apiStatusEl    = document.getElementById('api-status')!;
const saveApiBtn     = document.getElementById('save-api-btn') as HTMLButtonElement;
const autoSendEl     = document.getElementById('auto-send')      as HTMLInputElement;
const autoConfigEl   = document.getElementById('auto-config')!;
const threshTypeEls  = document.querySelectorAll<HTMLInputElement>('input[name="thresh-type"]');
const threshPctEl    = document.getElementById('threshold-pct')  as HTMLInputElement;
const threshMinEl    = document.getElementById('threshold-min')  as HTMLInputElement;
const threshUnitEl   = document.getElementById('thresh-unit')!;
const threshSliderWrap = document.getElementById('thresh-slider-wrap')!;
const threshMinsWrap = document.getElementById('thresh-minutes-wrap')!;
const queueThreshTypeEls = document.querySelectorAll<HTMLInputElement>('input[name="queue-thresh-type"]');
const queueThreshPctEl = document.getElementById('queue-threshold-pct') as HTMLInputElement;
const queueThreshMinEl = document.getElementById('queue-threshold-min') as HTMLInputElement;
const queueThreshUnitEl = document.getElementById('queue-thresh-unit')!;
const queueThreshSliderWrap = document.getElementById('queue-thresh-slider-wrap')!;
const queueThreshMinsWrap = document.getElementById('queue-thresh-minutes-wrap')!;
const hideBtnsEl     = document.getElementById('hide-buttons')   as HTMLInputElement;
const hideJpFieldEl  = document.getElementById('hide-jp-field')!;
const hideIfNotJpEl  = document.getElementById('hide-if-not-jp') as HTMLInputElement;
const hideMusicEl    = document.getElementById('hide-music')     as HTMLInputElement;
const hideMusicFieldEl = document.getElementById('hide-music-field')!;
const playlistLoggerEl = document.getElementById('enable-playlist-logger') as HTMLInputElement;
const playlistHideNonJpEl = document.getElementById('playlist-hide-non-jp') as HTMLInputElement;

const showTotalEl    = document.getElementById('show-total-badge') as HTMLSelectElement;
const saveVideoBtn   = document.getElementById('save-video-btn') as HTMLButtonElement;
const resetVideoBtn  = document.getElementById('reset-video-btn') as HTMLButtonElement;

const trackTimeEl    = document.getElementById('track-time')       as HTMLInputElement;
const overlayEls     = document.querySelectorAll<HTMLInputElement>('input[name="overlay-pos"]');
const saveOverlayBtn = document.getElementById('save-overlay-btn') as HTMLButtonElement;
const resetOverlayBtn= document.getElementById('reset-overlay-btn') as HTMLButtonElement;
const allowListOnlyEl= document.getElementById('allow-list-only') as HTMLInputElement;

const queueListEl    = document.getElementById('queue-list')!;
const queueActions   = document.getElementById('queue-actions')!;
const navBadge       = document.getElementById('nav-badge')!;
const autoSendEODEl  = document.getElementById('auto-send-end-of-day') as HTMLInputElement;
const sendAllBtn     = document.getElementById('send-all-btn') as HTMLButtonElement;
const clearAllBtn    = document.getElementById('clear-all-btn') as HTMLButtonElement;
const allowListEl    = document.getElementById('allow-list')!;
const skipListEl     = document.getElementById('skip-list')!;
const allowCountEl   = document.getElementById('allow-count')!;
const skipCountEl    = document.getElementById('skip-count')!;
const allowInputEl   = document.getElementById('allow-input') as HTMLInputElement;
const skipInputEl    = document.getElementById('skip-input')  as HTMLInputElement;
const allowAddBtn    = document.getElementById('allow-add') as HTMLButtonElement;
const skipAddBtn     = document.getElementById('skip-add') as HTMLButtonElement;

const readerAutoSaveEl   = document.getElementById('reader-auto-save') as HTMLInputElement;
const readerDirectSendEl = document.getElementById('reader-direct-send') as HTMLInputElement;

const ttuEnabledEl     = document.getElementById('ttu-enabled') as HTMLInputElement;
const yatsuEnabledEl   = document.getElementById('yatsu-enabled') as HTMLInputElement;
const manabeEnabledEl  = document.getElementById('manabe-enabled') as HTMLInputElement;
const resetReadersBtn  = document.getElementById('reset-readers-btn') as HTMLButtonElement;

const threshSpinUp   = threshMinsWrap.querySelector('.thresh-spin-up') as HTMLButtonElement;
const threshSpinDn   = threshMinsWrap.querySelector('.thresh-spin-dn') as HTMLButtonElement;
const queueThreshSpinUp = queueThreshMinsWrap.querySelector('.queue-thresh-spin-up') as HTMLButtonElement;
const queueThreshSpinDn = queueThreshMinsWrap.querySelector('.queue-thresh-spin-dn') as HTMLButtonElement;

const regexListEl = document.getElementById('regex-list')!;
const regexDescInput = document.getElementById('regex-desc-input') as HTMLInputElement;
const regexValInput = document.getElementById('regex-val-input') as HTMLInputElement;
const regexAddBtn = document.getElementById('regex-add') as HTMLButtonElement;

// Advanced Debug Settings Refs
const debugModeEl = document.getElementById('debug-mode') as HTMLInputElement;
const navDebugEl = document.getElementById('nav-debug')!;
const debugLogsList = document.getElementById('debug-logs-list')!;
const clearDebugBtn = document.getElementById('clear-debug-btn')!;
const refreshDebugBtn = document.getElementById('refresh-debug-btn')!;

function esc(s: string) { return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

const toLocalDT = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const SVG_UP = `<svg viewBox="0 0 10 6"><polyline points="1,5 5,1 9,5"/></svg>`;
const SVG_DN = `<svg viewBox="0 0 10 6"><polyline points="1,1 5,5 9,1"/></svg>`;

function parseTitle(docTitle: string) {
  let base = docTitle.replace(/\s*\|\s*(ッツ Ebook Reader|Yatsu Reader|Manabe Reader)\s*/i, '').trim();
  let title = base;
  let volume: number | undefined = undefined;

  if (/^\d+$/.test(base)) {
    return { query: base, volume: undefined };
  }

  const volMatch = base.match(/^(.*?)[\s\-_]+(?:vol(?:ume)?\.?\s*|v|第)?(\d+)\s*(?:巻|話|章)?$/i);
  if (volMatch && volMatch[1].trim().length > 0 && !/^\d+$/.test(volMatch[1].trim())) {
    title = volMatch[1].trim();
    volume = parseInt(volMatch[2], 10);
  } else {
    const match2 = base.match(/^(.*?[a-zA-Z\u3040-\u30ff\u4e00-\u9fff]+.*?)(\d+)$/);
    if (match2) {
      title = match2[1].trim();
      volume = parseInt(match2[2], 10);
    }
  }
  return { query: title, volume };
}

function showUnmatchedModal(): Promise<boolean> {
  return new Promise(resolve => {
    const modal = document.getElementById('unmatched-modal')!;
    const cancelBtn = document.getElementById('modal-cancel')!;
    const proceedBtn = document.getElementById('modal-proceed')!;
    const dontWarnChk = document.getElementById('dont-warn-chk') as HTMLInputElement;

    modal.classList.add('open');

    const close = async (res: boolean) => {
      modal.classList.remove('open');
      if (dontWarnChk.checked) {
        const cfg = await configStorage.getValue() as any;
        await configStorage.setValue({ ...cfg, warnUntracked: false });
      }
      cancelBtn.onclick = null;
      proceedBtn.onclick = null;
      resolve(res);
    };

    cancelBtn.onclick = () => close(false);
    proceedBtn.onclick = () => close(true);
  });
}

async function loadConfig() {
  const cfg = await configStorage.getValue() as any;
  apiKeyEl.value = cfg.apiKey ?? '';
  setApiStatus(cfg.apiKey ?? '');

  const autoSend = cfg.autoSend ?? (cfg.logMode === 'auto');
  autoSendEl.checked = autoSend;
  updateAutoConfigDim(autoSend);

  const threshType = cfg.thresholdType ?? 'time';
  threshTypeEls.forEach(r => { r.checked = r.value === threshType; });
  updateThreshUI(threshType, cfg);

  const queueThreshType = cfg.queueThresholdType ?? 'time';
  queueThreshTypeEls.forEach(r => { r.checked = r.value === queueThreshType; });
  updateQueueThreshUI(queueThreshType, cfg);

  hideBtnsEl.checked = cfg.hideButtons ?? false;
  hideIfNotJpEl.checked = cfg.hideIfNotJapanese ?? false;
  hideMusicEl.checked = cfg.hideMusic ?? false;
  playlistLoggerEl.checked = cfg.enablePlaylistLogger ?? true;
  playlistHideNonJpEl.checked = cfg.playlistHideNonJapanese ?? true;
  updateHideJpDim(hideBtnsEl.checked);

  if (showTotalEl) {
    const isTotal = cfg.showTotalInBadge ?? true;
    showTotalEl.value = isTotal ? 'total' : 'session';
  }

  trackTimeEl.checked = cfg.trackTime ?? false;
  allowListOnlyEl.checked = cfg.allowListOnly ?? false;
  overlayEls.forEach(r => { r.checked = r.value === (cfg.overlayPosition ?? 'top-right'); });
  renderSites(cfg.allowSites ??[...BUILT_IN_ALLOW], cfg.skipSites ??[...BUILT_IN_SKIP]);
  renderRegexes(cfg.titleRegexes ?? DEFAULT_TITLE_REGEXES);

  readerAutoSaveEl.checked = cfg.readerAutoSave ?? cfg.ttuAutoSave ?? true;
  readerDirectSendEl.checked = cfg.readerDirectSend ?? cfg.ttuDirectSend ?? false;

  ttuEnabledEl.checked = cfg.ttuEnabled ?? true;
  yatsuEnabledEl.checked = cfg.yatsuEnabled ?? true;
  manabeEnabledEl.checked = cfg.manabeEnabled ?? true;

  autoSendEODEl.checked = cfg.autoSendEndOfDay ?? false;

  debugModeEl.checked = !!cfg.debugMode;
  navDebugEl.style.display = cfg.debugMode ? 'flex' : 'none';
}

function setApiStatus(key: string) {
  apiStatusEl.textContent = key ? '● Key is configured' : '○ No key set';
  apiStatusEl.className = 'api-status ' + (key ? 'ok' : 'err');
}
function updateAutoConfigDim(on: boolean) { autoConfigEl.classList.toggle('dim-block', !on); }

function updateHideJpDim(hideBtns: boolean) {
  hideJpFieldEl.classList.toggle('dim-block', hideBtns);
  hideMusicFieldEl.classList.toggle('dim-block', hideBtns);
}

function updateThreshUI(type: string, cfg?: any) {
  const isPct = type === 'percent';
  threshSliderWrap.style.display = isPct ? 'block' : 'none';
  threshMinsWrap.style.display = !isPct ? 'block' : 'none';

  if (cfg) {
    const cfgType = cfg.thresholdType ?? type;
    const vPct = cfgType === 'percent' ? (cfg.thresholdValue ?? cfg.threshold ?? 95) : 95;
    const vMin = cfgType === 'time' ? (cfg.thresholdValue ?? cfg.threshold ?? 30) : 30;
    threshPctEl.value = String(vPct);
    threshMinEl.value = String(vMin);
  }

  if (isPct) {
    threshUnitEl.textContent = threshPctEl.value + '%';
  } else {
    threshUnitEl.textContent = threshMinEl.value + ' min';
  }
}

function updateQueueThreshUI(type: string, cfg?: any) {
  const isPct = type === 'percent';
  queueThreshSliderWrap.style.display = isPct ? 'block' : 'none';
  queueThreshMinsWrap.style.display = !isPct ? 'block' : 'none';

  if (cfg) {
    const vPct = cfg.queueThresholdType === 'percent' ? (cfg.queueThresholdValue ?? 5) : 5;
    const vMin = cfg.queueThresholdType === 'time' ? (cfg.queueThresholdValue ?? 1) : 1;
    queueThreshPctEl.value = String(vPct);
    queueThreshMinEl.value = String(vMin);
  }

  if (isPct) {
    queueThreshUnitEl.textContent = queueThreshPctEl.value + '%';} else {
      queueThreshUnitEl.textContent = queueThreshMinEl.value + ' min';
    }
}

function renderSites(allow: string[], skip: string[]) {
  allowListEl.innerHTML = ''; skipListEl.innerHTML = '';
  allow.forEach(d => allowListEl.appendChild(buildSiteItem(d, 'allow')));
  skip.forEach(d => skipListEl.appendChild(buildSiteItem(d, 'skip')));
  allowCountEl.textContent = String(allow.length);
  skipCountEl.textContent = String(skip.length);
}

function buildSiteItem(domain: string, list: 'allow'|'skip'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'site-item';

  const host = document.createElement('span');
  host.className = 'site-item-host';
  host.textContent = domain;
  host.contentEditable = 'true';
  host.spellcheck = false;

  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      host.blur();
    }
  });

  host.addEventListener('blur', async () => {
    const newVal = host.textContent?.trim().toLowerCase() || '';
  if (!newVal || newVal === domain) {
    host.textContent = domain;
    return;
  }
  const cfg = await configStorage.getValue() as any;
  const key = list === 'allow' ? 'allowSites' : 'skipSites';
  const currentList = cfg[key] ?? (list === 'allow' ? [...BUILT_IN_ALLOW] :[...BUILT_IN_SKIP]);
  const next = currentList.map((d: string) => d === domain ? newVal : d);
  await configStorage.setValue({ ...cfg, [key]: next });
  loadConfig();
  showStatus('✓ Site Updated');
  });

  const rm = document.createElement('button');
  rm.className = 'site-remove';
  rm.innerHTML = `<svg viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;

  rm.onclick = async () => {
    const cfg = await configStorage.getValue() as any;
    const key = list === 'allow' ? 'allowSites' : 'skipSites';
    const currentList = cfg[key] ?? (list === 'allow' ?[...BUILT_IN_ALLOW] :[...BUILT_IN_SKIP]);
    const next = currentList.filter((d: string) => d !== domain);
    await configStorage.setValue({ ...cfg,[key]: next });
    loadConfig();
  };

  el.append(host, rm);
  return el;
}

function renderRegexes(list: any[]) {
  regexListEl.innerHTML = '';
  list.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'site-item';
    row.style.display = 'flex';
    row.style.alignItems = 'stretch';
    row.style.padding = '4px 6px';
  row.innerHTML = `
  <div style="display: flex; flex-direction: column; justify-content: center; padding-right: 8px; border-right: 1px dashed var(--bdr); margin-right: 8px; gap: 4px;">
  <button class="regex-up" title="Move Up" style="background:none; border:none; color:var(--muted); cursor:pointer; padding: 2px;">▲</button>
  <button class="regex-dn" title="Move Down" style="background:none; border:none; color:var(--muted); cursor:pointer; padding: 2px;">▼</button>
  </div>
  <div style="display: flex; flex-direction: column; flex: 1; gap: 6px; padding: 4px 0;">
  <div style="display: flex; align-items: center; gap: 8px;">
  <span style="font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 700; width: 45px;">Desc</span>
  <input type="text" class="regex-desc-edit" value="${esc(item.desc)}" style="flex: 1; background: var(--bg); border: 1px solid var(--bdr); border-radius: 4px; padding: 4px 8px; color: var(--text); font-size: 12px; outline: none;" />
  </div>
  <div style="display: flex; align-items: center; gap: 8px;">
  <span style="font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 700; width: 45px;">Regex</span>
  <input type="text" class="regex-val-edit" value="${esc(item.re)}" style="flex: 1; background: var(--bg); border: 1px solid var(--bdr); border-radius: 4px; padding: 4px 8px; color: var(--amber); font-family: var(--mono); font-size: 12px; outline: none;" />
  </div>
  </div>
  <div style="display: flex; align-items: center; justify-content: center; padding-left: 8px; border-left: 1px dashed var(--bdr); margin-left: 4px;">
  <button class="site-remove regex-rm" style="padding: 8px; cursor: pointer;" title="Remove Rule">
  <svg viewBox="0 0 12 12" style="width: 14px; height: 14px; stroke: var(--red); stroke-width: 2; fill: none; stroke-linecap: round;"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
  </button>
  </div>
  `;

  const updateRegex = async () => {
    const newDesc = (row.querySelector('.regex-desc-edit') as HTMLInputElement).value;
    const newRe = (row.querySelector('.regex-val-edit') as HTMLInputElement).value;
    const cfg = await configStorage.getValue() as any;
    const current = cfg.titleRegexes ?? DEFAULT_TITLE_REGEXES;
    current[idx] = { desc: newDesc, re: newRe };
    await configStorage.setValue({ ...cfg, titleRegexes: current });
  };

  const moveRegex = async (dir: number) => {
    const cfg = await configStorage.getValue() as any;
    const current = cfg.titleRegexes ?? DEFAULT_TITLE_REGEXES;
    if (idx + dir < 0 || idx + dir >= current.length) return;
    const temp = current[idx];
    current[idx] = current[idx + dir];
    current[idx + dir] = temp;
    await configStorage.setValue({ ...cfg, titleRegexes: current });
    loadConfig();
  };

  row.querySelector('.regex-desc-edit')!.addEventListener('change', updateRegex);
  row.querySelector('.regex-val-edit')!.addEventListener('change', updateRegex);

  const upBtn = row.querySelector('.regex-up') as HTMLButtonElement;
  const dnBtn = row.querySelector('.regex-dn') as HTMLButtonElement;

  if (idx === 0) { upBtn.style.opacity = '0.2'; upBtn.style.cursor = 'default'; }
  else { upBtn.addEventListener('click', () => moveRegex(-1)); }

  if (idx === list.length - 1) { dnBtn.style.opacity = '0.2'; dnBtn.style.cursor = 'default'; }
  else { dnBtn.addEventListener('click', () => moveRegex(1)); }

  row.querySelector('.regex-rm')!.addEventListener('click', async () => {
    const cfg = await configStorage.getValue() as any;
    const current = cfg.titleRegexes ?? DEFAULT_TITLE_REGEXES;
    current.splice(idx, 1);
    await configStorage.setValue({ ...cfg, titleRegexes: current });
    loadConfig();
  });
  regexListEl.appendChild(row);
  });
}

regexAddBtn.addEventListener('click', async () => {
  const desc = regexDescInput.value.trim();
  const re = regexValInput.value.trim();
  if (!desc || !re) return;
  try { new RegExp(re); } catch (e) { showStatus('⚠ Invalid Regex', true); return; }

  const cfg = await configStorage.getValue() as any;
  const current = cfg.titleRegexes ?? DEFAULT_TITLE_REGEXES;
  await configStorage.setValue({ ...cfg, titleRegexes:[...current, { desc, re }] });
  regexDescInput.value = '';
  regexValInput.value = '';
  loadConfig();
  showStatus('✓ Regex Added');
});

async function ensureVideoMediaData(item: any) {
  const channelId = item.channelId || item.mediaData?.channelId;
  const channelTitle = item.mediaData?.channelTitle || item.channelTitle || item.contentTitleNative;
  if (item.mediaData?.channelImage && item.mediaData?.channelDescription) return;
  if (!channelId && !channelTitle) return;

  const media = await resolveVideoChannelMedia({ channelId, channelTitle });
  item.mediaData = {
    ...(item.mediaData || {}),
    channelId: media.channelId || channelId || item.channelId || 'web-video',
    channelTitle: media.channelTitle || channelTitle || item.channelTitle || item.contentTitleNative,
    ...(media.channelImage ? { channelImage: media.channelImage } : {}),
    ...(media.channelDescription ? { channelDescription: media.channelDescription } : {}),
  };

  if (!item.channelId && (media.channelId || channelId)) {
    item.channelId = media.channelId || channelId;
  }
}

function stripVideoTitle(title: string): string {
  return title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube\s*$/i, '').trim();
}

function buildItem(item: any, type: 'video' | 'reading'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'qi';
  el.dataset.id = item.id;
  el.dataset.type = type;

  const sessions: any[] = item.sessions ??[];
  let sessionsHtml = '';

  if (sessions.length > 1) {
    const isClosed = localStorage.getItem(`nt-sess-closed-${item.id}`) === '1';
    sessionsHtml = `<details class="qi-sessions" ${isClosed ? '' : 'open'} data-id="${item.id}">
    <summary class="session-summary">Sessions (${sessions.length})</summary>
    <div class="session-list">` + sessions.map((s, i) => `
    <div class="qi-session" data-session-id="${s.id}">
    <span class="qi-session-num">S${i + 1}</span>
    ${type === 'reading' ? `<input class="qi-session-chars" type="number" value="${s.chars || 0}"/><span style="font-size:10px;color:var(--muted)">chars</span>` : ''}
    <input class="qi-session-mins" type="number" value="${Math.max(1, Math.round(s.secs / 60))}"/>
    <span style="font-size:10px;color:var(--muted)">min</span>
    <input type="datetime-local" class="qi-session-date-input" value="${toLocalDT(s.date)}" />
    <button class="qi-session-remove" title="Remove" style="background:none;border:none;color:var(--red);cursor:pointer;padding:0 4px;font-size:14px;">×</button>
    </div>`).join('') + `</div></details>`;
  }

  const displayMins = type === 'reading' ? Math.max(1, Math.round((item.time || 0) / 60)) : (item.time || 0);
  const defaultDateStr = sessions.length > 0 ? sessions[0].date : (item.date || new Date().toISOString());
  const dateVal = toLocalDT(defaultDateStr);

  const rawTitle = item.description || item.contentTitleNative || 'Unknown Title';
  const title = esc(type === 'video' ? stripVideoTitle(rawTitle) : rawTitle);
  const isLinked = type === 'reading'
  ? !!(item.mediaId && item.mediaId !== 'web-reading')
  : !!(((item as any).channelId && (item as any).channelId !== 'web-video') || (item.mediaData?.channelId && item.mediaData.channelId !== 'web-video'));

  let channelName = '';
  let urlDisplay = '';
  if (type === 'reading') {
    channelName = esc(item.readerName || 'Reader') + ' \u2022 ' + esc(item.originalTitle || item.description || item.contentTitleNative || '');
    urlDisplay = '';
  } else {
    channelName = esc(item.channelTitle || item.contentTitleNative || 'YouTube');
    urlDisplay = '\u2022 ' + esc(item.contentTitleEnglish || item.channelId || '');
  }

  let charsGroup = '';
  if (type === 'reading') {
    charsGroup = `
    <div class="qi-spin-group">
    <input class="qi-chars" type="number" value="${item.chars || 0}" min="0"/>
    <span style="font-size:10px;color:var(--muted);padding-right:2px;">chars</span>
    <div class="qi-spin-nav">
    <button type="button" class="chars-up" tabindex="-1">${SVG_UP}</button>
    <button type="button" class="chars-dn" tabindex="-1">${SVG_DN}</button>
    </div>
    </div>`;
  }

  let volumeGroup = '';
  if (type === 'reading') {
    const volVal = Math.max(1, Number(item.volume || 1));
    volumeGroup = `<button type="button" class="qi-vol-pill" title="Volume">Vol ${volVal}</button>`;
  }

  el.innerHTML = `
  <div class="qi-row top-row">
  <div class="qi-search-wrap">
  ${type === 'reading' ? `<svg class="qi-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>` : ''}
  <input class="qi-desc ${type === 'reading' ? 'searchable' : ''}" type="text" value="${title}" placeholder="${type === 'reading' ? 'Search AniList...' : 'Video Title'}"/>
  ${isLinked ? (type === 'reading' ? `<button class="qi-link-status" title="Unlink AniList">✓</button>` : `<span class="qi-link-status video-matched" title="Matched" style="cursor:default;color:var(--green);position:absolute;right:8px;top:50%;transform:translateY(-50%)">✓</span>`) : ''}
  ${type === 'reading' ? `<div class="qi-search-dropdown"></div>` : ''}
  </div>
  <div style="display:flex;gap:6px;">
  ${volumeGroup}
  ${charsGroup}
  <div class="qi-spin-group">
  <input class="qi-mins" type="number" value="${displayMins}" min="0"/>
  <span style="font-size:10px;color:var(--muted);padding-right:2px;">min</span>
  <div class="qi-spin-nav">
  <button type="button" class="mins-up" tabindex="-1">${SVG_UP}</button>
  <button type="button" class="mins-dn" tabindex="-1">${SVG_DN}</button>
  </div>
  </div>
  </div>
  </div>
  <div class="qi-row mid-row">
  <span class="qi-meta">${channelName} ${urlDisplay}</span>
  <input type="datetime-local" class="qi-date-input" value="${dateVal}" />
  </div>
  ${sessionsHtml}
  <div class="qi-row bot-row">
  <button class="btn btn-amber btn-sm qi-send">Send</button>
  <button class="btn btn-ghost btn-sm qi-remove">Remove</button>
  </div>`;

  const detailsEl = el.querySelector('.qi-sessions') as HTMLDetailsElement;
  if (detailsEl) {
    detailsEl.addEventListener('toggle', () => {
      localStorage.setItem(`nt-sess-closed-${item.id}`, detailsEl.open ? '0' : '1');
    });
  }

  const descInput = el.querySelector('.qi-desc') as HTMLInputElement;
  const volPill = el.querySelector<HTMLButtonElement>('.qi-vol-pill');

  if (type === 'reading') {
    const dropdown = el.querySelector('.qi-search-dropdown') as HTMLElement;
    let debounceTimer: any;

    const bindUnlink = (btn: HTMLElement) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.mediaId = 'web-reading';
        item.mediaData = null;
        const q = await readingQueueStorage.getValue();
        const idx = q.findIndex((x: any) => x.id === item.id);
        if (idx > -1) { q[idx] = item; await readingQueueStorage.setValue(q); }
        btn.remove();
      });
      btn.addEventListener('mouseenter', () => { btn.textContent = '✗'; btn.style.color = 'var(--red)'; });
      btn.addEventListener('mouseleave', () => { btn.textContent = '✓'; btn.style.color = 'var(--green)'; });
    };

    const existingLink = el.querySelector('.qi-link-status') as HTMLElement;
    if (existingLink) bindUnlink(existingLink);

    const executeSearch = async (query: string) => {
      dropdown.innerHTML = '<div style="padding:10px;text-align:center;font-size:11px;color:var(--muted)">Searching AniList...</div>';
      dropdown.classList.add('open');

      try {
        const cfg = await configStorage.getValue() as any;
        const res = await fetch(`https://nihongotracker.app/api/media/anilist/search?search=${encodeURIComponent(query)}&type=MANGA&page=1&perPage=5&format=NOVEL`, {
          headers: { 'X-API-Key': cfg.apiKey ?? '' }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const results = Array.isArray(data) ? data : (data.data ??[]);

        if (results.length === 0) {
          dropdown.innerHTML = '<div style="padding:10px;text-align:center;font-size:11px;color:var(--muted)">No results found</div>';
          return;
        }

        dropdown.innerHTML = '';

        interface AniListSearchResultTitle {
          contentTitleNative?: string;
          contentTitleEnglish?: string;
          contentTitleRomaji?: string;
        }

        interface AniListSearchResult {
          contentId: string | number;
          title?: AniListSearchResultTitle;
          contentTitleNative?: string;
          contentTitleEnglish?: string;
          contentTitleRomaji?: string;
          coverImage?: string;
          contentImage?: string;
          chapters?: number;
          volumes?: number;
        }

        results.forEach((m: AniListSearchResult) => {
          const row = document.createElement('div');
          row.className = 'qi-search-item';
          const native = m.title?.contentTitleNative || m.contentTitleNative || 'Unknown';
          const eng = m.title?.contentTitleEnglish || m.contentTitleEnglish || '';
          const img = m.coverImage || m.contentImage || '';

        row.innerHTML = `
        ${img ? `<img class="qi-search-cover" src="${img}" />` : `<div class="qi-search-cover" style="background:var(--bdr2)"></div>`}
        <div class="qi-search-info">
        <div class="qi-search-title">${esc(native)}</div>
        <div class="qi-search-sub">${esc(eng)}</div>
        </div>
        `;

        row.addEventListener('mousedown', async (e: MouseEvent) => {
          e.preventDefault();
          descInput.value = native;

          const { volume } = parseTitle(native);
          item.mediaData = {
            contentId:           m.contentId,
            contentTitleNative:  native,
            contentTitleEnglish: eng,
            contentTitleRomaji:  m.title?.contentTitleRomaji || m.contentTitleRomaji,
            contentImage:        img,
            coverImage:          img,
            chapters:            m.chapters,
            volumes:             m.volumes,
          };
          item.mediaId = m.contentId;
          item.volume = volume || 1;
          item.description = native;
          if (volPill) volPill.textContent = `Vol ${Math.max(1, Number(item.volume || 1))}`;

          const q = await readingQueueStorage.getValue();
          const idx = q.findIndex((x:any) => x.id === item.id);
          if (idx > -1) {
            q[idx] = item;
            await readingQueueStorage.setValue(q);
          }

          dropdown.classList.remove('open');

          if (!el.querySelector('.qi-link-status')) {
            descInput.insertAdjacentHTML('afterend', `<button class="qi-link-status" title="Unlink AniList">✓</button>`);
            bindUnlink(el.querySelector('.qi-link-status') as HTMLElement);
          }
        });
        dropdown.appendChild(row);
        });
      } catch {
        dropdown.innerHTML = '<div style="padding:10px;text-align:center;font-size:11px;color:var(--red)">Search failed</div>';
      }
    };

    descInput.addEventListener('input', () => {
      if (item.mediaId && item.mediaId !== 'web-reading') {
        item.mediaId = 'web-reading';
        item.mediaData = null;
        el.querySelector('.qi-link-status')?.remove();
      }

      clearTimeout(debounceTimer);
      const query = descInput.value.trim();
      if (query.length < 2) {
        dropdown.classList.remove('open');
        return;
      }

      debounceTimer = setTimeout(() => executeSearch(query), 500);
    });

    descInput.addEventListener('blur', () => dropdown.classList.remove('open'));
    descInput.addEventListener('focus', () => {
      const query = descInput.value.trim();
      if (query.length >= 2) {
        if (dropdown.children.length === 0) {
          executeSearch(query);
        } else {
          dropdown.classList.add('open');
        }
      }
    });
  }

  const minsEl = el.querySelector<HTMLInputElement>('.qi-mins')!;
  const charsEl = el.querySelector<HTMLInputElement>('.qi-chars');
  const sessionMinsEls = Array.from(el.querySelectorAll<HTMLInputElement>('.qi-session-mins'));
  const sessionCharsEls = Array.from(el.querySelectorAll<HTMLInputElement>('.qi-session-chars'));

  // Ensure minimum limits are dynamically updated and preserved
  const updateGeneralMin = () => {
    const sumMins = sessionMinsEls.reduce((acc, input) => acc + Number(input.value), 0);
    minsEl.min = String(sumMins);
    if (Number(minsEl.value) < sumMins) minsEl.value = String(sumMins);

    if (charsEl) {
      const sumChars = sessionCharsEls.reduce((acc, input) => acc + Number(input.value), 0);
      charsEl.min = String(sumChars);
      if (Number(charsEl.value) < sumChars) charsEl.value = String(sumChars);
    }
  };

  updateGeneralMin();

  el.querySelector('.mins-up')!.addEventListener('click', () => { minsEl.value = String(Number(minsEl.value) + 1); });
  el.querySelector('.mins-dn')!.addEventListener('click', () => {
    const minVal = Number(minsEl.min || 0);
    minsEl.value = String(Math.max(minVal, Number(minsEl.value) - 1));
  });
  minsEl.addEventListener('blur', () => {
    const minVal = Number(minsEl.min || 0);
    if (Number(minsEl.value) < minVal) minsEl.value = String(minVal);
  });
    sessionMinsEls.forEach(input => input.addEventListener('input', updateGeneralMin));

    if (charsEl) {
      el.querySelector('.chars-up')!.addEventListener('click', () => { charsEl.value = String(Number(charsEl.value) + 100); });
      el.querySelector('.chars-dn')!.addEventListener('click', () => {
        const minVal = Number(charsEl.min || 0);
        charsEl.value = String(Math.max(minVal, Number(charsEl.value) - 100));
      });
      charsEl.addEventListener('blur', () => {
        const minVal = Number(charsEl.min || 0);
        if (Number(charsEl.value) < minVal) charsEl.value = String(minVal);
      });
        sessionCharsEls.forEach(input => input.addEventListener('input', updateGeneralMin));
    }

    if (volPill) {
      const getVol = () => {
        const raw = String(volPill.textContent || '').replace(/\D/g, '');
        return Math.max(1, Number(raw) || 1);
      };
      const persistVolume = async (next: number) => {
        item.volume = next;
        const q = await readingQueueStorage.getValue();
        const idx = q.findIndex((x: any) => x.id === item.id);
        if (idx !== -1) {
          q[idx].volume = next;
          await readingQueueStorage.setValue(q);
        }
      };

      volPill.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if ((volPill as any)._editing) return;
        (volPill as any)._editing = true;

        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.className = 'qi-vol-input';
        input.value = String(getVol());

        volPill.style.display = 'none';
        volPill.insertAdjacentElement('afterend', input);
        input.focus();
        input.select();

        const cleanup = () => {
          input.remove();
          volPill.style.display = '';
          (volPill as any)._editing = false;
        };

        const commit = async () => {
          const next = Math.max(1, Number(String(input.value || '').replace(/\D/g, '')) || 1);
          volPill.textContent = `Vol ${next}`;
          await persistVolume(next);
        };

        input.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter') {
            ke.preventDefault();
            void commit().finally(cleanup);
          }
          if (ke.key === 'Escape') {
            ke.preventDefault();
            cleanup();
          }
        });
        input.addEventListener('blur', () => { void commit().finally(cleanup); });
      });
    }

    el.querySelector('.qi-remove')!.addEventListener('click', async () => {
      const ok = await showConfirmModal('Delete Log', 'Are you sure you want to delete this pending log?');
      if (!ok) return;
      removeOne(item.id, type);
    });

    el.querySelectorAll('.qi-session-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const ok = await showConfirmModal('Delete Session', 'Are you sure you want to delete this session?');
        if (!ok) return;

        const sId = (e.target as HTMLElement).closest('.qi-session')!.getAttribute('data-session-id');
        if (type === 'reading') {
          const q = await readingQueueStorage.getValue();
          const idx = q.findIndex((x: any) => x.id === item.id);
          if (idx !== -1) {
            const sessions = q[idx].sessions ??[];
            q[idx].sessions = sessions.filter((s: any) => s.id !== sId);
            const totalSecs = q[idx].sessions.reduce((a: any, b: any) => a + b.secs, 0);
            q[idx].time = totalSecs;
            const readingItem = q[idx] as QueuedReadingLog;
            readingItem.chars = (readingItem.sessions ??[]).reduce((a: any, b: any) => a + (b.chars || 0), 0);
            await readingQueueStorage.setValue(q);
            renderQueue();
          }
        } else {
          const q = await videoQueueStorage.getValue();
          const idx = q.findIndex((x: any) => x.id === item.id);
          if (idx !== -1) {
            const sessions = q[idx].sessions ?? [];
            q[idx].sessions = sessions.filter((s: any) => s.id !== sId);
            const totalSecs = q[idx].sessions.reduce((a: any, b: any) => a + b.secs, 0);
            q[idx].time = Math.round(totalSecs / 60);
            await videoQueueStorage.setValue(q);
            renderQueue();
          }
        }
      });
    });

    el.querySelector('.qi-send')!.addEventListener('click', async () => {
      const btn = el.querySelector('.qi-send') as HTMLButtonElement;
      btn.disabled = true;
      const sent = await checkAndSend([{ id: item.id, el }], false);
      if (!sent) btn.disabled = false;
    });

      return el;
}

// ── Payload Compiler ──────────────────────────────────────────────────────────
function getPayloadsForItem(item: any, el: HTMLElement) {
  const type = el.dataset.type as 'video' | 'reading';
  const desc = (el.querySelector('.qi-desc') as HTMLInputElement).value;

  const generalMins = Number((el.querySelector('.qi-mins') as HTMLInputElement).value);
  const generalChars = type === 'reading' ? Number((el.querySelector('.qi-chars') as HTMLInputElement).value) : 0;
  const volInput = el.querySelector<HTMLInputElement>('.qi-vol-input');
  const volPill = el.querySelector<HTMLButtonElement>('.qi-vol-pill');
  const volRaw = volInput?.value ?? volPill?.textContent ?? '';
  const selectedVolume = type === 'reading'
  ? Math.max(1, Number(String(volRaw).replace(/\D/g, '')) || Number(item.volume || 1) || 1)
  : undefined;

  const sessionNodes = Array.from(el.querySelectorAll('.qi-session'));
  const sumMins = sessionNodes.reduce((acc, node) => acc + Number((node.querySelector('.qi-session-mins') as HTMLInputElement).value), 0);
  const sumChars = type === 'reading' ? sessionNodes.reduce((acc, node) => acc + Number((node.querySelector('.qi-session-chars') as HTMLInputElement).value), 0) : 0;

  let apiTitle = desc || (type === 'reading' ? (item.mediaData?.contentTitleNative || item.contentTitleNative) : item.contentTitleNative);
  if (type === 'video') apiTitle = stripVideoTitle(apiTitle);

  const base: any = {
    type,
    description: apiTitle,
    episodes: 0,
    pages: 0,
    unknownDate: false
  };

  if (type === 'reading') {
    base.mediaId = item.mediaId || 'web-reading';
    base.volume = selectedVolume || 1;
    base.mediaData = item.mediaData || {
      contentId: "web-reading",
      contentTitleNative: item.contentTitleNative
    };
  } else {
    base.mediaId = item.mediaData?.channelId || item.channelId || item.mediaId || 'web-video';
    base.mediaData = item.mediaData || { channelId: item.channelId || "web-video", channelTitle: item.contentTitleNative };
  }

  if (sessionNodes.length === 0 || generalMins > sumMins || (type === 'reading' && generalChars > sumChars)) {
    return[{
      ...base,
      time: generalMins,
      date: new Date((el.querySelector('.qi-date-input') as HTMLInputElement).value).toISOString(),
      chars: generalChars
    }];
  }

  return sessionNodes.map(node => ({
    ...base,
    time: Number((node.querySelector('.qi-session-mins') as HTMLInputElement).value),
                                   date: new Date((node.querySelector('.qi-session-date-input') as HTMLInputElement).value).toISOString(),
                                   chars: type === 'reading' ? Number((node.querySelector('.qi-session-chars') as HTMLInputElement).value) : 0
  }));
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

  rQ.forEach(item => {
    try { queueListEl.appendChild(buildItem(item, 'reading')); }
    catch (e) { console.error("Failed to render reading item", item, e); }
  });
  vQ.forEach(item => {
    try { queueListEl.appendChild(buildItem(item, 'video')); }
    catch (e) { console.error("Failed to render video item", item, e); }
  });

  applyFilter();
}

async function checkAndSend(items: {id: string, el: HTMLElement}[], forceBypass = false): Promise<boolean> {
  const cfg = await configStorage.getValue() as any;
  const warnEnabled = cfg.warnUntracked !== false;

  if (warnEnabled && !forceBypass) {
    let hasUntracked = false;
    for (const {id, el} of items) {
      const type = el.dataset.type;
      const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
      const q = await qStorage.getValue();
      const item = q.find((x: any) => x.id === id);
      const mediaId = item && 'mediaId' in item ? item.mediaId : undefined;
      const isVideo = type === 'video';
      const hasMatch = isVideo
      ? !!(((item as QueuedVideoLog)?.channelId && (item as QueuedVideoLog).channelId !== 'web-video') || ((item as QueuedVideoLog)?.mediaData?.channelId && (item as QueuedVideoLog)!.mediaData!.channelId !== 'web-video'))
      : !!(mediaId && mediaId !== 'web-reading' && mediaId !== 'web-video');

      if (item && !hasMatch) {
        hasUntracked = true; break;
      }
    }

    if (hasUntracked) {
      const proceed = await showUnmatchedModal();
      if (!proceed) return false;
    }
  }

  for (const {id, el} of items) {
    await sendOne(id, el);
  }
  return true;
}

async function sendOne(id: string, el: HTMLElement) {
  const type = el.dataset.type as 'video' | 'reading';
  const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
  const q = await qStorage.getValue();
  const item = q.find((x: any) => x.id === id);
  if (!item) return;

  const btn = el.querySelector('.qi-send') as HTMLButtonElement;
  btn.disabled = true; btn.textContent = '...'; el.classList.add('sending');

  if (type === 'reading') {
    try {
      const cfg = await configStorage.getValue() as any;
      const apiKey = cfg.apiKey ?? '';

      const { query, volume } = parseTitle(item.contentTitleNative);
      const readingItem = item as any;

      if (!readingItem.mediaId || !readingItem.mediaData?.contentId) {
        const res = await fetch(`https://nihongotracker.app/api/media/anilist/search?search=${encodeURIComponent(query)}&type=MANGA&page=1&perPage=5&format=NOVEL`, {
          headers: { 'X-API-Key': apiKey }
        });
        if (res.ok) {
          const data = await res.json();
          const results: any[] = Array.isArray(data) ? data : (data.data ??[]);
          if (results.length > 0) {
            const media = results[0];
            readingItem.mediaData = {
              contentId:           media.contentId,
              contentTitleNative:  media.title?.contentTitleNative  ?? media.contentTitleNative,
              contentTitleEnglish: media.title?.contentTitleEnglish ?? media.contentTitleEnglish,
              contentTitleRomaji:  media.title?.contentTitleRomaji  ?? media.contentTitleRomaji,
              contentImage:        media.contentImage,
              coverImage:          media.coverImage,
              chapters:            media.chapters,
              volumes:             media.volumes,
            };
            readingItem.mediaId = media.contentId;
            readingItem.volume = volume !== undefined ? volume : 1;
          } else {
            readingItem.volume = volume || 1;
          }
        } else {
          readingItem.volume = volume || 1;
        }
      }
    } catch (e) {
      console.error("Anilist fetch error", e);
    }
  }

  if (type === 'video') {
    try {
      await ensureVideoMediaData(item);
    } catch (e) {
      console.error('Video channel fetch error', e);
    }
  }

  const payloads = getPayloadsForItem(item, el);

  let success = true;
  let lastError = '';
  let lastErrorCode = 0;

  for (const p of payloads) {
    const res = await submitLog(p) as any;
    if (res === true || res?.success === true) {
      // success
    } else {
      success = false;
      lastError = res?.error || 'Unknown error';
      lastErrorCode = res?.status || 0;
    }
  }

  if (success) {
    showStatus('Log sent to Nihongo Tracker');
    removeOne(id, type);
  } else {
    el.classList.remove('sending');
    btn.disabled = false;
    btn.textContent = 'Send';
    const errText = lastErrorCode ? `⚠ Failed [${lastErrorCode}]: ${lastError}` : `⚠ Failed: ${lastError}`;
    showStatus(errText, true);
  }
}

async function removeOne(id: string, type: 'video' | 'reading') {
  const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
  const q = await qStorage.getValue();
  await qStorage.setValue(q.filter((x: any) => x.id !== id) as any);
  renderQueue();
}

sendAllBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  if (cfg.warnSendAll !== false) {
    const ok = await showConfirmModal('Send All', 'Are you sure you want to send all pending logs?', 'warnSendAll');
    if (!ok) return;
  }

  const items = Array.from(queueListEl.querySelectorAll('.qi')) as HTMLElement[];
  sendAllBtn.disabled = true;
  const toSend = items.filter(el => el.style.display !== 'none').map(el => ({id: el.dataset.id!, el}));
  await checkAndSend(toSend, false);
  sendAllBtn.disabled = false;
});

clearAllBtn.addEventListener('click', async () => {
  const ok = await showConfirmModal('Clear All', 'Are you sure you want to clear all pending logs?');
  if (!ok) return;

  if (currentFilter === 'all' || currentFilter === 'video') await videoQueueStorage.setValue([]);
  if (currentFilter === 'all' || currentFilter === 'reading') await readingQueueStorage.setValue([]);
  renderQueue();
});

// ── Settings Interactions ─────────────────────────────────────────────────────

// 1. API Key
toggleKeyEl.addEventListener('click', () => {
  apiKeyEl.type = apiKeyEl.type === 'password' ? 'text' : 'password';
});
apiKeyEl.addEventListener('change', () => saveApiBtn.click());
saveApiBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, apiKey: apiKeyEl.value.trim() });
  loadConfig(); showStatus('✓ API Key Saved');
});

// 2. Video Track
autoSendEl.addEventListener('change', () => updateAutoConfigDim(autoSendEl.checked));
hideBtnsEl.addEventListener('change', () => updateHideJpDim(hideBtnsEl.checked));

threshTypeEls.forEach(r => r.addEventListener('change', () => {
  if (r.checked) updateThreshUI(r.value);
}));

threshPctEl.addEventListener('input', () => { threshUnitEl.textContent = threshPctEl.value + '%'; });
threshMinEl.addEventListener('input', () => { threshUnitEl.textContent = threshMinEl.value + ' min'; });
if (threshSpinUp) {
  threshSpinUp.addEventListener('click', () => {
    threshMinEl.value = String(Number(threshMinEl.value) + 1);
    threshUnitEl.textContent = threshMinEl.value + ' min';
  });
}
if (threshSpinDn) {
  threshSpinDn.addEventListener('click', () => {
    threshMinEl.value = String(Math.max(1, Number(threshMinEl.value) - 1));
    threshUnitEl.textContent = threshMinEl.value + ' min';
  });
}

queueThreshTypeEls.forEach(r => r.addEventListener('change', () => {
  if (r.checked) updateQueueThreshUI(r.value);
}));

queueThreshPctEl.addEventListener('input', () => { queueThreshUnitEl.textContent = queueThreshPctEl.value + '%'; });
queueThreshMinEl.addEventListener('input', () => { queueThreshUnitEl.textContent = queueThreshMinEl.value + ' min'; });
if (queueThreshSpinUp) {
  queueThreshSpinUp.addEventListener('click', () => {
    queueThreshMinEl.value = String(Number(queueThreshMinEl.value) + 1);
    queueThreshUnitEl.textContent = queueThreshMinEl.value + ' min';
  });
}
if (queueThreshSpinDn) {
  queueThreshSpinDn.addEventListener('click', () => {
    queueThreshMinEl.value = String(Math.max(1, Number(queueThreshMinEl.value) - 1));
    queueThreshUnitEl.textContent = queueThreshMinEl.value + ' min';
  });
}

saveVideoBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  const tType = Array.from(threshTypeEls).find(r => r.checked)?.value || 'percent';
  const tVal = tType === 'percent' ? Number(threshPctEl.value) : Number(threshMinEl.value);
  const qtType = Array.from(queueThreshTypeEls).find(r => r.checked)?.value || 'time';
  const qtVal = qtType === 'percent' ? Number(queueThreshPctEl.value) : Number(queueThreshMinEl.value);
  await configStorage.setValue({
    ...cfg,
    autoSend: autoSendEl.checked,
    logMode: autoSendEl.checked ? 'auto' : 'manual',
    thresholdType: tType,
    thresholdValue: tVal,
    queueThresholdType: qtType,
    queueThresholdValue: qtVal,
    hideButtons: hideBtnsEl.checked,
    hideIfNotJapanese: hideIfNotJpEl.checked,
    hideMusic: hideMusicEl.checked,
    enablePlaylistLogger: playlistLoggerEl.checked,
    playlistHideNonJapanese: playlistHideNonJpEl.checked,
    showTotalInBadge: showTotalEl.value === 'total'
  });
  showStatus('✓ Video Settings Saved');
});

resetVideoBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({
    ...cfg,
    autoSend: false,
    logMode: 'manual',
    thresholdType: 'percent',
    thresholdValue: 95,
    queueThresholdType: 'time',
    queueThresholdValue: 1,
    hideButtons: false,
    hideIfNotJapanese: false,
    hideMusic: false,
    enablePlaylistLogger: true,
    playlistHideNonJapanese: true,
    showTotalInBadge: true
  });
  loadConfig();
  showStatus('✓ Defaults Restored');
});


// 3. Overlay
document.querySelectorAll('.sites-toggle-head').forEach(head => {
  head.addEventListener('click', () => {
    head.classList.toggle('open');
    const bodyId = (head as HTMLElement).dataset.group + '-body';
    document.getElementById(bodyId)?.classList.toggle('open');
  });
});

allowAddBtn.addEventListener('click', async () => {
  const val = allowInputEl.value.trim().toLowerCase();
  if (!val) return;
  const cfg = await configStorage.getValue() as any;
  const sites = cfg.allowSites ??[...BUILT_IN_ALLOW];
  if (!sites.includes(val)) {
    await configStorage.setValue({ ...cfg, allowSites:[...sites, val] });
    allowInputEl.value = ''; loadConfig(); showStatus('✓ Allowed Site Added');
  }
});

skipAddBtn.addEventListener('click', async () => {
  const val = skipInputEl.value.trim().toLowerCase();
  if (!val) return;
  const cfg = await configStorage.getValue() as any;
  const sites = cfg.skipSites ??[...BUILT_IN_SKIP];
  if (!sites.includes(val)) {
    await configStorage.setValue({ ...cfg, skipSites:[...sites, val] });
    skipInputEl.value = ''; loadConfig(); showStatus('✓ Skipped Site Added');
  }
});

saveOverlayBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  const pos = Array.from(overlayEls).find(r => r.checked)?.value || 'top-right';
await configStorage.setValue({
  ...cfg,
  trackTime: trackTimeEl.checked,
  allowListOnly: allowListOnlyEl.checked,
  overlayPosition: pos
});
showStatus('✓ Overlay Settings Saved');
});

resetOverlayBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({
    ...cfg,
    trackTime: true,
    allowListOnly: false,
    overlayPosition: 'top-right',
    allowSites:[...BUILT_IN_ALLOW],
    skipSites:[...BUILT_IN_SKIP]
  });
  loadConfig();
  showStatus('✓ Defaults Restored');
});


// 4. Queue Config
autoSendEODEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, autoSendEndOfDay: autoSendEODEl.checked });
  showStatus('✓ EOD setting saved');
});

// 5. Readers
readerAutoSaveEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, readerAutoSave: readerAutoSaveEl.checked });
  showStatus(readerAutoSaveEl.checked ? '✓ Reader Auto-sync enabled' : '✓ Reader Auto-sync disabled');
});
readerDirectSendEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, readerDirectSend: readerDirectSendEl.checked });
  showStatus(readerDirectSendEl.checked ? '✓ Reader Direct Send enabled' : '✓ Reader Direct Send disabled');
});

ttuEnabledEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, ttuEnabled: ttuEnabledEl.checked });
  showStatus(ttuEnabledEl.checked ? '✓ TTU Tracking enabled' : '✓ TTU Tracking disabled');
});
yatsuEnabledEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, yatsuEnabled: yatsuEnabledEl.checked });
  showStatus(yatsuEnabledEl.checked ? '✓ Yatsu Tracking enabled' : '✓ Yatsu Tracking disabled');
});
manabeEnabledEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, manabeEnabled: manabeEnabledEl.checked });
  showStatus(manabeEnabledEl.checked ? '✓ Manabe Tracking enabled' : '✓ Manabe Tracking disabled');
});

resetReadersBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({
    ...cfg,
    readerAutoSave: true,
    readerDirectSend: false,
    ttuEnabled: true,
    yatsuEnabled: true,
    manabeEnabled: true,
    titleRegexes: DEFAULT_TITLE_REGEXES
  });
  loadConfig();
  showStatus('✓ Defaults Restored');
});

// ── 6. Advanced / Debug Section ──────────────────────────────────────────────

/**
 * Renders the collected debug logs into the debug tab list.
 */
async function renderDebugLogs() {
  const logs = await debugLogStorage.getValue() || [];
  debugLogsList.innerHTML = logs.length === 0
  ? '<div class="empty-state">No debug logs available.</div>'
  : '';

  logs.forEach(log => {
    const dEl = document.createElement('div');
    dEl.className = `debug-log ${log.level.toLowerCase()}`;
    const timeStr = new Date(log.timestamp).toLocaleTimeString();

    // We escape the content to prevent XSS while keeping the layout clean
    dEl.innerHTML = `
    <div>
    <span class="debug-time">[${timeStr}]</span>
    <span class="debug-src">${esc(log.source)}</span>
    <strong>${esc(log.message)}</strong>
    </div>
    ${log.data ? `<div class="debug-data">${esc(log.data)}</div>` : ''}
    `;
    debugLogsList.appendChild(dEl);
  });
}

// Toggle "Advanced" mode: shows/hides the Debug tab in the sidebar
debugModeEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, debugMode: debugModeEl.checked });

  // Show or hide the navigation item in the sidebar
  navDebugEl.style.display = debugModeEl.checked ? 'flex' : 'none';

  // If we just enabled it, switch to it or refresh logs
if (debugModeEl.checked) {
  renderDebugLogs();
} else {
  // If we are currently on the debug tab and hide it, go back to queue
  if (document.getElementById('tab-debug')?.classList.contains('active')) {
    document.querySelector('[data-tab="queue"]')?.dispatchEvent(new MouseEvent('click'));
  }
}
});

// Clear button logic
clearDebugBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear all debug logs?')) return;
  await debugLogStorage.setValue([]);
  await renderDebugLogs();
  showStatus('✓ Logs Cleared');
});

// Refresh button logic
refreshDebugBtn.addEventListener('click', async () => {
  await renderDebugLogs();
  showStatus('✓ Refreshed');
});

// Make sure that clicking the "Debug" nav item refreshes the logs
navDebugEl.addEventListener('click', () => {
  renderDebugLogs();
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadConfig();
renderQueue();

// Listen for storage changes to update the UI live,
// but don't re-render if the user is currently typing in an input.
const activeInputSelector = '.qi-desc:focus, .qi-mins:focus, .qi-session-mins:focus, .qi-session-date-input:focus, .qi-date-input:focus, .qi-chars:focus, .qi-vol:focus, .qi-session-chars:focus';

readingQueueStorage.watch(() => {
  if (!document.querySelector(activeInputSelector)) {
    renderQueue();
  }
});

videoQueueStorage.watch(() => {
  if (!document.querySelector(activeInputSelector)) {
    renderQueue();
  }
});

// Watch for debug log updates if the tab is visible
debugLogStorage.watch(() => {
  if (debugModeEl.checked && document.getElementById('tab-debug')?.classList.contains('active')) {
    renderDebugLogs();
  }
});
