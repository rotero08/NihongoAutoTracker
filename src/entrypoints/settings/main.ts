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

function applyFilter() {
  const items = document.querySelectorAll('.qi');
  items.forEach(el => {
    const type = (el as HTMLElement).dataset.type;
    const match = currentFilter === 'all' || currentFilter === type;
    (el as HTMLElement).style.display = match ? 'flex' : 'none';
  });
}

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
const hideMusicEl    = document.getElementById('hide-music')     as HTMLInputElement;
const hideMusicFieldEl = document.getElementById('hide-music-field')!;

const showTotalEl    = document.getElementById('show-total-badge') as HTMLSelectElement;
const saveVideoBtn   = document.getElementById('save-video-btn')!;
const resetVideoBtn  = document.getElementById('reset-video-btn')!;

const trackTimeEl    = document.getElementById('track-time')       as HTMLInputElement;
const overlayEls     = document.querySelectorAll<HTMLInputElement>('input[name="overlay-pos"]');
const saveOverlayBtn = document.getElementById('save-overlay-btn')!;
const resetOverlayBtn= document.getElementById('reset-overlay-btn')!;
const allowListOnlyEl= document.getElementById('allow-list-only') as HTMLInputElement;

const queueListEl    = document.getElementById('queue-list')!;
const queueActions   = document.getElementById('queue-actions')!;
const navBadge       = document.getElementById('nav-badge')!;
const autoSendEODEl  = document.getElementById('auto-send-end-of-day') as HTMLInputElement;
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
const ttuDirectSendEl= document.getElementById('ttu-direct-send') as HTMLInputElement;
const resetReadersBtn= document.getElementById('reset-readers-btn')!;

const threshSpinUp   = document.querySelector('.thresh-spin-up') as HTMLButtonElement;
const threshSpinDn   = document.querySelector('.thresh-spin-dn') as HTMLButtonElement;

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  let base = docTitle.replace(/\s*\|\s*ッツ Ebook Reader\s*/i, '').trim();
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
  hideMusicEl.checked = cfg.hideMusic ?? false;
  updateHideJpDim(hideBtnsEl.checked);

  if (showTotalEl) {
    const isTotal = cfg.showTotalInBadge ?? true;
    showTotalEl.value = isTotal ? 'total' : 'session';
  }

  trackTimeEl.checked = cfg.trackTime ?? false;
  allowListOnlyEl.checked = cfg.allowListOnly ?? false;
  overlayEls.forEach(r => { r.checked = r.value === (cfg.overlayPosition ?? 'top-right'); });
  renderSites(cfg.allowSites ??[...BUILT_IN_ALLOW], cfg.skipSites ??[...BUILT_IN_SKIP]);

  ttuEnabledEl.checked = cfg.ttuEnabled ?? true;
  ttuAutoSaveEl.checked = cfg.ttuAutoSave ?? true;
  ttuDirectSendEl.checked = cfg.ttuDirectSend ?? false;

  autoSendEODEl.checked = cfg.autoSendEndOfDay ?? false;
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
    const vPct = (cfg.thresholdType === 'percent' || !cfg.thresholdType) ? (cfg.thresholdValue ?? cfg.threshold ?? 95) : 95;
    const vMin = cfg.thresholdType === 'time' ? (cfg.thresholdValue ?? 30) : 30;
    threshPctEl.value = String(vPct);
    threshMinEl.value = String(vMin);
  }

  if (isPct) {
    threshUnitEl.textContent = threshPctEl.value + '%';
  } else {
    threshUnitEl.textContent = threshMinEl.value + ' min';
  }
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

// ── Queue Item UI ─────────────────────────────────────────────────────────────
function buildItem(item: any, type: 'video' | 'reading'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'qi';
  el.dataset.id = item.id;
  el.dataset.type = type;

  const sessions: any[] = item.sessions ??[];
  let sessionsHtml = '';

  if (sessions.length > 1) {
    sessionsHtml = `<div class="qi-sessions">` + sessions.map((s, i) => `
    <div class="qi-session" data-session-id="${s.id}">
    <span class="qi-session-num">S${i + 1}</span>
    <input class="qi-session-mins" type="number" value="${Math.max(1, Math.round(s.secs / 60))}"/>
    <span style="font-size:10px;color:var(--muted)">min</span>
    ${type === 'reading' ? `<input class="qi-session-chars" type="number" value="${s.chars || 0}"/><span style="font-size:10px;color:var(--muted)">chars</span>` : ''}
    <input type="datetime-local" class="qi-session-date-input" value="${toLocalDT(s.date)}" />
    <button class="qi-session-remove" title="Remove" style="background:none;border:none;color:var(--red);cursor:pointer;padding:0 4px;font-size:14px;">×</button>
    </div>`).join('') + `</div>`;
  }

  const displayMins = type === 'reading' ? Math.max(1, Math.round((item.time || 0) / 60)) : (item.time || 0);
  const defaultDateStr = sessions.length > 0 ? sessions[0].date : (item.date || new Date().toISOString());
  const dateVal = toLocalDT(defaultDateStr);

  const title = esc(item.description || item.contentTitleNative || 'Unknown Title');
  const isLinked = type === 'reading' && item.mediaId && item.mediaId !== 'web-reading';

  let channelName = '';
  let urlDisplay = '';
  if (type === 'reading') {
    channelName = 'TTU Reader \u2022 ' + esc(item.originalTitle || item.description || item.contentTitleNative || '');
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
    <div class="qi-spin-nav">
    <button type="button" class="chars-up" tabindex="-1">${SVG_UP}</button>
    <button type="button" class="chars-dn" tabindex="-1">${SVG_DN}</button>
    </div>
    </div>`;
  }

  el.innerHTML = `
  <div class="qi-row top-row">
  <div class="qi-search-wrap" style="${type !== 'reading' ? 'display:block;flex:1' : ''}">
  ${type === 'reading' ? `<svg class="qi-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>` : ''}
  <input class="qi-desc ${type === 'reading' ? 'searchable' : ''}" type="text" value="${title}" placeholder="${type === 'reading' ? 'Search AniList...' : 'Video Title'}"/>
  ${isLinked ? `<button class="qi-link-status" title="Unlink AniList">✓</button>` : ''}
  ${type === 'reading' ? `<div class="qi-search-dropdown"></div>` : ''}
  </div>
  <div style="display:flex;gap:6px;">
  <div class="qi-spin-group">
  <input class="qi-mins" type="number" value="${displayMins}" min="0"/>
  <div class="qi-spin-nav">
  <button type="button" class="mins-up" tabindex="-1">${SVG_UP}</button>
  <button type="button" class="mins-dn" tabindex="-1">${SVG_DN}</button>
  </div>
  </div>
  ${charsGroup}
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

  const descInput = el.querySelector('.qi-desc') as HTMLInputElement;

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
        results.forEach(m => {
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

        row.addEventListener('mousedown', async (e) => {
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

    el.querySelector('.qi-remove')!.addEventListener('click', () => removeOne(item.id, type));

    el.querySelector('.qi-send')!.addEventListener('click', async () => {
      const btn = el.querySelector('.qi-send') as HTMLButtonElement;
      btn.disabled = true;
      const sent = await checkAndSend([{ id: item.id, el }], false);
      if (!sent) btn.disabled = false;
    });

      el.querySelectorAll('.qi-session-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const sId = (e.target as HTMLElement).closest('.qi-session')!.getAttribute('data-session-id');
          const targetStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
          const q = await targetStorage.getValue();
          const idx = q.findIndex((x: any) => x.id === item.id);
          if (idx !== -1) {
            q[idx].sessions = q[idx].sessions.filter((s: any) => s.id !== sId);
            const totalSecs = q[idx].sessions.reduce((a: any, b: any) => a + b.secs, 0);
            q[idx].time = type === 'reading' ? totalSecs : Math.round(totalSecs / 60);
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

  const generalMins = Number((el.querySelector('.qi-mins') as HTMLInputElement).value);
  const generalChars = type === 'reading' ? Number((el.querySelector('.qi-chars') as HTMLInputElement).value) : 0;

  const sessionNodes = Array.from(el.querySelectorAll('.qi-session'));
  const sumMins = sessionNodes.reduce((acc, node) => acc + Number((node.querySelector('.qi-session-mins') as HTMLInputElement).value), 0);
  const sumChars = type === 'reading' ? sessionNodes.reduce((acc, node) => acc + Number((node.querySelector('.qi-session-chars') as HTMLInputElement).value), 0) : 0;

  const apiTitle = desc || (type === 'reading' ? (item.mediaData?.contentTitleNative || item.contentTitleNative) : item.contentTitleNative);

  const base: any = {
    type,
    mediaId: item.mediaId || (type === 'reading' ? 'web-reading' : (item.channelId || "web-video")),
    description: apiTitle,
    episodes: 0,
    pages: 0,
    unknownDate: false
  };

  if (type === 'reading') {
    base.volume = item.volume || 1;
    base.mediaData = item.mediaData || {
      contentId: "web-reading",
      contentTitleNative: item.contentTitleNative
    };
  } else {
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
      if (item && (!item.mediaId || item.mediaId === 'web-reading' || item.mediaId === 'web-video')) {
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

      if (!item.mediaId || !item.mediaData?.contentId) {
        const res = await fetch(`https://nihongotracker.app/api/media/anilist/search?search=${encodeURIComponent(query)}&type=MANGA&page=1&perPage=5&format=NOVEL`, {
          headers: { 'X-API-Key': apiKey }
        });
        if (res.ok) {
          const data = await res.json();
          const results: any[] = Array.isArray(data) ? data : (data.data ??[]);
          if (results.length > 0) {
            const media = results[0];
            item.mediaData = {
              contentId:           media.contentId,
              contentTitleNative:  media.title?.contentTitleNative  ?? media.contentTitleNative,
              contentTitleEnglish: media.title?.contentTitleEnglish ?? media.contentTitleEnglish,
              contentTitleRomaji:  media.title?.contentTitleRomaji  ?? media.contentTitleRomaji,
              contentImage:        media.contentImage,
              coverImage:          media.coverImage,
              chapters:            media.chapters,
              volumes:             media.volumes,
            };
            item.mediaId = media.contentId;
            item.volume = volume !== undefined ? volume : 1;
          } else {
            item.volume = volume || 1;
          }
        } else {
          item.volume = volume || 1;
        }
      }
    } catch (e) {
      console.error("Anilist fetch error", e);
    }
  }

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
  const toSend = items.filter(el => el.style.display !== 'none').map(el => ({id: el.dataset.id!, el}));
  await checkAndSend(toSend, false);
  sendAllBtn.disabled = false;
});

clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Clear all pending logs in this section?')) return;
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

saveVideoBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  const tType = Array.from(threshTypeEls).find(r => r.checked)?.value || 'percent';
  const tVal = tType === 'percent' ? Number(threshPctEl.value) : Number(threshMinEl.value);
  await configStorage.setValue({
    ...cfg,
    autoSend: autoSendEl.checked,
    logMode: autoSendEl.checked ? 'auto' : 'manual',
    thresholdType: tType,
    thresholdValue: tVal,
    hideButtons: hideBtnsEl.checked,
    hideIfNotJapanese: hideIfNotJpEl.checked,
    hideMusic: hideMusicEl.checked,
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
    hideButtons: false,
    hideIfNotJapanese: false,
    hideMusic: false,
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
    await configStorage.setValue({ ...cfg, allowSites: [...sites, val] });
    allowInputEl.value = ''; loadConfig(); showStatus('✓ Allowed Site Added');
  }
});

skipAddBtn.addEventListener('click', async () => {
  const val = skipInputEl.value.trim().toLowerCase();
  if (!val) return;
  const cfg = await configStorage.getValue() as any;
  const sites = cfg.skipSites ??[...BUILT_IN_SKIP];
  if (!sites.includes(val)) {
    await configStorage.setValue({ ...cfg, skipSites: [...sites, val] });
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
    allowSites: [...BUILT_IN_ALLOW],
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
ttuEnabledEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, ttuEnabled: ttuEnabledEl.checked });
  showStatus(ttuEnabledEl.checked ? '✓ TTU Tracking enabled' : '✓ TTU Tracking disabled');
});

ttuAutoSaveEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, ttuAutoSave: ttuAutoSaveEl.checked });
  showStatus(ttuAutoSaveEl.checked ? '✓ TTU Auto-sync enabled' : '✓ TTU Auto-sync disabled');
});

ttuDirectSendEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, ttuDirectSend: ttuDirectSendEl.checked });
  showStatus(ttuDirectSendEl.checked ? '✓ TTU Direct Send enabled' : '✓ TTU Direct Send disabled');
});

resetReadersBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({
    ...cfg,
    ttuEnabled: true,
    ttuAutoSave: true,
    ttuDirectSend: false
  });
  loadConfig();
  showStatus('✓ Defaults Restored');
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadConfig();
renderQueue();

readingQueueStorage.watch(() => {
  if (!document.querySelector('.qi-desc:focus, .qi-mins:focus, .qi-session-mins:focus, .qi-session-date-input:focus, .qi-date-input:focus, .qi-chars:focus, .qi-session-chars:focus')) {
    renderQueue();
  }
});
videoQueueStorage.watch(() => {
  if (!document.querySelector('.qi-desc:focus, .qi-mins:focus, .qi-session-mins:focus, .qi-session-date-input:focus, .qi-date-input:focus, .qi-chars:focus, .qi-session-chars:focus')) {
    renderQueue();
  }
});
