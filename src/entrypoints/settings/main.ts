import './style.css';
import { configStorage, videoQueueStorage, type QueuedVideoLog } from '@/utils/storage';
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

const autoSendEl       = document.getElementById('auto-send')      as HTMLInputElement;
const autoConfigEl     = document.getElementById('auto-config')!;
const threshTypeEls    = document.querySelectorAll<HTMLInputElement>('input[name="thresh-type"]');
const threshPctEl      = document.getElementById('threshold-pct')  as HTMLInputElement;
const threshMinEl      = document.getElementById('threshold-min')  as HTMLInputElement;
const threshUnitEl     = document.getElementById('thresh-unit')!;
const threshSliderWrap = document.getElementById('thresh-slider-wrap')!;
const threshMinsWrap   = document.getElementById('thresh-minutes-wrap')!;
const hideBtnsEl       = document.getElementById('hide-buttons')   as HTMLInputElement;
const hideJpFieldEl    = document.getElementById('hide-jp-field')!;
const hideIfNotJpEl    = document.getElementById('hide-if-not-jp') as HTMLInputElement;
const showTotalEl      = document.getElementById('show-total-badge') as HTMLInputElement;
const saveVideoBtn     = document.getElementById('save-video-btn')!;

const trackTimeEl    = document.getElementById('track-time')       as HTMLInputElement;
const overlayEls     = document.querySelectorAll<HTMLInputElement>('input[name="overlay-pos"]');
const saveOverlayBtn = document.getElementById('save-overlay-btn')!;
const allowListOnlyEl= document.getElementById('allow-list-only') as HTMLInputElement;

const queueListEl  = document.getElementById('queue-list')!;
const queueActions = document.getElementById('queue-actions')!;
const navBadge     = document.getElementById('nav-badge')!;
const sendAllBtn   = document.getElementById('send-all-btn')!;
const clearAllBtn  = document.getElementById('clear-all-btn')!;

const allowListEl  = document.getElementById('allow-list')!;
const skipListEl   = document.getElementById('skip-list')!;
const allowCountEl = document.getElementById('allow-count')!;
const skipCountEl  = document.getElementById('skip-count')!;
const allowInputEl = document.getElementById('allow-input') as HTMLInputElement;
const skipInputEl  = document.getElementById('skip-input')  as HTMLInputElement;
const allowAddBtn  = document.getElementById('allow-add')!;
const skipAddBtn   = document.getElementById('skip-add')!;

const ttuEnabledEl = document.getElementById('ttu-enabled') as HTMLInputElement;

// ── Collapsible site groups ───────────────────────────────────────────────────
document.querySelectorAll<HTMLElement>('.sites-toggle-head').forEach(head => {
  const group = head.dataset.group!;
  const body  = document.getElementById(`${group}-body`)!;
  head.addEventListener('click', () => {
    const open = head.classList.toggle('open');
    body.classList.toggle('open', open);
  });
});

// ── Load config ───────────────────────────────────────────────────────────────
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

  hideBtnsEl.checked    = cfg.hideButtons       ?? false;
  hideIfNotJpEl.checked = cfg.hideIfNotJapanese ?? false;
  updateHideJpDim(hideBtnsEl.checked);

  if (showTotalEl) showTotalEl.checked = cfg.showTotalInBadge ?? true;

  trackTimeEl.checked      = cfg.trackTime     ?? false;
  allowListOnlyEl.checked  = cfg.allowListOnly ?? false;
  overlayEls.forEach(r => { r.checked = r.value === (cfg.overlayPosition ?? 'top-right'); });

  const allowSites: string[] = cfg.allowSites ?? [...BUILT_IN_ALLOW];
  const skipSites:  string[] = cfg.skipSites  ?? [...BUILT_IN_SKIP];
  renderSites(allowSites, skipSites);

  ttuEnabledEl.checked = cfg.ttuEnabled ?? false;
}

function setApiStatus(key: string) {
  apiStatusEl.textContent = key ? '● Key is configured' : '○ No key set — logs will not send';
  apiStatusEl.className   = 'api-status ' + (key ? 'ok' : 'err');
}
function updateAutoConfigDim(on: boolean) { autoConfigEl.classList.toggle('dim-block', !on); }
function updateHideJpDim(hideBtns: boolean) { hideJpFieldEl.classList.toggle('dim-block', hideBtns); }
function updateThreshUI(type: string, cfg?: any) {
  const isPct = type === 'percent';
  threshSliderWrap.style.display = isPct  ? 'block' : 'none';
  threshMinsWrap.style.display   = !isPct ? 'block' : 'none';
  if (isPct) {
    const v = cfg?.thresholdValue ?? cfg?.threshold ?? 95;
    threshPctEl.value = String(v); threshUnitEl.textContent = v + '%';
  } else {
    const v = cfg?.thresholdValue ?? 30;
    threshMinEl.value = String(v); threshUnitEl.textContent = v + ' min';
  }
}

// ── API ───────────────────────────────────────────────────────────────────────
toggleKeyEl.addEventListener('click', () => { apiKeyEl.type = apiKeyEl.type === 'password' ? 'text' : 'password'; });
saveApiBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  const key = apiKeyEl.value.trim();
  await configStorage.setValue({ ...cfg, apiKey: key });
  setApiStatus(key);
  showStatus(key ? '✓ API Key saved' : '⚠ API Key cleared');
});

// ── Video ─────────────────────────────────────────────────────────────────────
autoSendEl.addEventListener('change', () => updateAutoConfigDim(autoSendEl.checked));
threshTypeEls.forEach(r => { r.addEventListener('change', () => updateThreshUI(r.value)); });
threshPctEl.addEventListener('input', () => { threshUnitEl.textContent = threshPctEl.value + '%'; });
threshMinEl.addEventListener('input', () => { threshUnitEl.textContent = threshMinEl.value + ' min'; });
document.querySelector('.thresh-spin-up')!.addEventListener('click', () => {
  threshMinEl.value = String(Math.max(1, Number(threshMinEl.value) + 1));
  threshUnitEl.textContent = threshMinEl.value + ' min';
});
document.querySelector('.thresh-spin-dn')!.addEventListener('click', () => {
  threshMinEl.value = String(Math.max(1, Number(threshMinEl.value) - 1));
  threshUnitEl.textContent = threshMinEl.value + ' min';
});
hideBtnsEl.addEventListener('change', () => updateHideJpDim(hideBtnsEl.checked));

saveVideoBtn.addEventListener('click', async () => {
  const cfg  = await configStorage.getValue() as any;
  const type = Array.from(threshTypeEls).find(r => r.checked)?.value ?? 'percent';
  const value = type === 'percent' ? Number(threshPctEl.value) : Number(threshMinEl.value);
  await configStorage.setValue({
    ...cfg,
    logMode: autoSendEl.checked ? 'auto' : 'manual',
    autoSend: autoSendEl.checked,
    thresholdType: type, thresholdValue: value, threshold: value,
    hideButtons: hideBtnsEl.checked,
    hideIfNotJapanese: hideIfNotJpEl.checked,
    showTotalInBadge: showTotalEl?.checked ?? true,
  });
  showStatus('✓ Video settings saved');
});

// ── Overlay ───────────────────────────────────────────────────────────────────
saveOverlayBtn.addEventListener('click', async () => {
  const cfg = await configStorage.getValue() as any;
  const pos = Array.from(overlayEls).find(r => r.checked)?.value ?? 'top-right';
  await configStorage.setValue({ ...cfg, trackTime: trackTimeEl.checked, overlayPosition: pos, allowListOnly: allowListOnlyEl.checked });
  showStatus('✓ Overlay settings saved');
});

// ── Readers ───────────────────────────────────────────────────────────────────
ttuEnabledEl.addEventListener('change', async () => {
  const cfg = await configStorage.getValue() as any;
  await configStorage.setValue({ ...cfg, ttuEnabled: ttuEnabledEl.checked });
  showStatus(ttuEnabledEl.checked ? '✓ TTU Reader tracking enabled' : '✓ TTU Reader tracking disabled');
});

// ── Sites ─────────────────────────────────────────────────────────────────────
function renderSites(allowSites: string[], skipSites: string[]) {
  allowListEl.innerHTML = '';
  skipListEl.innerHTML  = '';
  for (const d of allowSites) allowListEl.appendChild(buildSiteItem(d, 'allow'));
  for (const d of skipSites)  skipListEl.appendChild(buildSiteItem(d, 'skip'));
  allowCountEl.textContent = String(allowSites.length);
  skipCountEl.textContent  = String(skipSites.length);
}

function buildSiteItem(domain: string, list: 'allow'|'skip'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'site-item';
  const hostSpan = document.createElement('span');
  hostSpan.className = 'site-item-host';
  hostSpan.textContent = domain;
  hostSpan.title = 'Click to edit';
  hostSpan.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'site-edit-input'; input.value = domain; input.type = 'text';
  const commit = async () => {
    const newVal = input.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!newVal || newVal === domain) { input.replaceWith(hostSpan); return; }
    const cfg = await configStorage.getValue() as any;
    const key = list === 'allow' ? 'allowSites' : 'skipSites';
    const def = list === 'allow' ? BUILT_IN_ALLOW : BUILT_IN_SKIP;
    const current: string[] = cfg[key] ?? [...def];
    const idx = current.indexOf(domain);
    if (idx !== -1) current[idx] = newVal;
    await configStorage.setValue({ ...cfg, [key]: current });
    const fresh = await configStorage.getValue() as any;
    renderSites(fresh.allowSites ?? [...BUILT_IN_ALLOW], fresh.skipSites ?? [...BUILT_IN_SKIP]);
    showStatus(`✓ Updated to ${newVal}`);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = domain; input.blur(); } });
  hostSpan.replaceWith(input); input.focus(); input.select();
  });
  const removeBtn = document.createElement('button');
  removeBtn.className = 'site-remove'; removeBtn.title = 'Remove';
  removeBtn.innerHTML = `<svg viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;
  removeBtn.addEventListener('click', () => removeSite(list, domain));
  el.append(hostSpan, removeBtn);
  return el;
}

async function removeSite(list: 'allow'|'skip', domain: string) {
  const cfg = await configStorage.getValue() as any;
  const key = list === 'allow' ? 'allowSites' : 'skipSites';
  const def = list === 'allow' ? BUILT_IN_ALLOW : BUILT_IN_SKIP;
  const next = (cfg[key] ?? [...def]).filter((d: string) => d !== domain);
  await configStorage.setValue({ ...cfg, [key]: next });
  renderSites(
    list === 'allow' ? next : (cfg.allowSites ?? [...BUILT_IN_ALLOW]),
              list === 'skip'  ? next : (cfg.skipSites  ?? [...BUILT_IN_SKIP]),
  );
  showStatus(`✓ Removed ${domain}`);
}

async function addSite(list: 'allow'|'skip') {
  const input = list === 'allow' ? allowInputEl : skipInputEl;
  const raw = input.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!raw) return;
  const cfg = await configStorage.getValue() as any;
  const key = list === 'allow' ? 'allowSites' : 'skipSites';
  const def = list === 'allow' ? BUILT_IN_ALLOW : BUILT_IN_SKIP;
  const current: string[] = cfg[key] ?? [...def];
  if (current.includes(raw)) { showStatus('⚠ Already in list', true); return; }
  current.push(raw);
  await configStorage.setValue({ ...cfg, [key]: current });
  input.value = '';
  renderSites(
    list === 'allow' ? current : (cfg.allowSites ?? [...BUILT_IN_ALLOW]),
              list === 'skip'  ? current : (cfg.skipSites  ?? [...BUILT_IN_SKIP]),
  );
  showStatus(`✓ Added ${raw}`);
}

allowAddBtn.addEventListener('click', () => addSite('allow'));
allowInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addSite('allow'); });
skipAddBtn.addEventListener('click',  () => addSite('skip'));
skipInputEl.addEventListener('keydown',  e => { if (e.key === 'Enter') addSite('skip'); });

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

const SVG_UP = `<svg viewBox="0 0 10 6"><polyline points="1,5 5,1 9,5"/></svg>`;
const SVG_DN = `<svg viewBox="0 0 10 6"><polyline points="1,1 5,5 9,1"/></svg>`;

const toLocalDT = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function buildItem(item: QueuedVideoLog): HTMLElement {
  const el = document.createElement('div');
  el.className = 'qi';
  el.dataset.id = item.id;

  const sessions: Array<{secs: number; date: string}> = (item as any).sessions ?? [];
  const totalMins = item.time;

  // Session rows
  let sessionsHtml = '';
  if (sessions.length > 1) {
    const rows = sessions.map((s, i) => {
      const sMins = Math.max(1, Math.round(s.secs / 60));
      return `<div class="qi-session" data-session-id="${s.id}">
      <span class="qi-session-num">S${i + 1}</span>
      <input class="qi-session-mins" type="number" value="${sMins}" min="1"/>
      <span style="font-size:10px;color:var(--muted);flex:1">min</span>
      <input type="datetime-local" class="qi-session-date-input" value="${toLocalDT(s.date)}" />
      <button class="qi-session-remove" title="Remove Session" style="background:none;border:none;color:var(--red);cursor:pointer;padding:0 4px;font-size:11px;">×</button>
      </div>`;
    }).join('');
    sessionsHtml = `<div class="qi-sessions">${rows}</div>`;
  }

  const dateVal = (item.date ? item.date : new Date().toISOString()).split('T')[0];
  const tooltip = sessions.length > 1 ? `<span class="qi-tooltip" title="If total time differs from the session sum, all time is merged into a single log to account for untracked watching.">(?)</span>` : '';

  el.innerHTML = `
  <div class="qi-fields">
  <input class="qi-input qi-desc" type="text" value="${esc(item.description || '')}" placeholder="Video Title"/>
  <div class="qi-spinner">
  <input class="qi-input qi-mins" type="number" value="${totalMins}" min="0"/>
  <div class="qi-spin-btns">
  <button type="button" class="qi-spin-up" tabindex="-1">${SVG_UP}</button>
  <button type="button" class="qi-spin-dn" tabindex="-1">${SVG_DN}</button>
  </div>
  </div>
  </div>
  <div class="qi-meta-row">
  <span class="qi-meta-url" style="display:flex;align-items:center;">${esc(item.contentTitleNative)} • ${esc(trunc(item.contentTitleEnglish, 40))} ${tooltip}</span>
  <input type="date" class="qi-date-input" value="${dateVal}" title="General Date" ${sessions.length > 1 ? 'disabled style="opacity:0.5"' : ''}/>
  </div>
  ${sessionsHtml}
  <div class="qi-btns">
  <button class="btn btn-amber btn-sm qi-send">Send</button>
  <button class="btn btn-ghost btn-sm qi-remove">Remove</button>
  </div>`;

  // Total spinner
  const minsEl = el.querySelector<HTMLInputElement>('.qi-fields .qi-mins')!;
  el.querySelector('.qi-fields .qi-spin-up')!.addEventListener('click', () => { minsEl.value = String(Math.max(0, Number(minsEl.value) + 1)); });
  el.querySelector('.qi-fields .qi-spin-dn')!.addEventListener('click', () => { minsEl.value = String(Math.max(0, Number(minsEl.value) - 1)); });

  // Inside buildItem, add listener for session removes:
  el.querySelectorAll('.qi-session-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const row = (e.target as HTMLElement).closest('.qi-session') as HTMLElement;
      const sId = row.dataset.sessionId;

      const queue = await videoQueueStorage.getValue();
      const qIdx = queue.findIndex(q => q.id === item.id);
      if (qIdx === -1) return;

      // Filter sessions
      queue[qIdx].sessions = queue[qIdx].sessions?.filter(s => s.id !== sId);

      // Recalculate total time from remaining sessions
      const totalSecs = queue[qIdx].sessions?.reduce((acc, s) => acc + s.secs, 0) || 0;
      queue[qIdx].time = Math.max(1, Math.round(totalSecs / 60));

      await videoQueueStorage.setValue(queue);
      renderQueue();
    });
  });

  // Date enforcement & syncing
  const dateInputs = Array.from(el.querySelectorAll<HTMLInputElement>('.qi-session-date-input'));
  const genDateInput = el.querySelector<HTMLInputElement>('.qi-date-input');

  dateInputs.forEach((input, i) => {
    input.addEventListener('change', () => {
      // Sync general date to first session
      if (i === 0 && genDateInput) genDateInput.value = input.value.split('T')[0];

      // Ensure the next session cannot be earlier than this session
      if (i + 1 < dateInputs.length) {
        dateInputs[i + 1].min = input.value;
        if (dateInputs[i + 1].value < input.value) {
          dateInputs[i + 1].value = input.value;
        }
      }
    });
  });

  el.querySelector('.qi-send')!.addEventListener('click',   () => sendOne(item.id, el));
  el.querySelector('.qi-remove')!.addEventListener('click', () => removeOne(item.id));
  return el;
}

// ── Payload Compiler ──
function getPayloadsForItem(item: QueuedVideoLog, el: HTMLElement) {
  const desc = el.querySelector<HTMLInputElement>('.qi-desc')?.value ?? item.description;
  const totalMins = Number(el.querySelector<HTMLInputElement>('.qi-mins')?.value ?? item.time);
  const sessionNodes = Array.from(el.querySelectorAll('.qi-session'));

  let sumSessionMins = 0;
  const parsedSessions = sessionNodes.map(node => {
    const m = Number(node.querySelector<HTMLInputElement>('.qi-session-mins')!.value);
    const d = new Date(node.querySelector<HTMLInputElement>('.qi-session-date-input')!.value).toISOString();
    sumSessionMins += m;
    return { time: m, date: d };
  });

  const basePayload = {
    type: "video",
    mediaId: item.channelId || "web-video",
    mediaData: {
      channelId: item.channelId || "web-video",
      channelTitle: item.contentTitleNative,
    },
    description: el.querySelector<HTMLInputElement>('.qi-desc')?.value ?? item.description,
    episodes: 0, pages: 0, unknownDate: false
  };

  // If session sum exactly matches the modified total, send each session individually!
  if (parsedSessions.length > 0 && sumSessionMins === totalMins) {
    return parsedSessions.map(s => ({ ...basePayload, time: s.time, date: s.date }));
  } else {
    // If they differ, untracked time exists. Send a single merged log.
    const genDateInput = el.querySelector<HTMLInputElement>('.qi-date-input');
    const mergedDate = parsedSessions.length > 0
    ? parsedSessions[0].date
    : (genDateInput?.value ? new Date(genDateInput.value + 'T12:00:00').toISOString() : item.date);

    return [{ ...basePayload, time: totalMins, date: mergedDate }];
  }
}

async function sendOne(id: string, el: HTMLElement) {
  const queue = await videoQueueStorage.getValue();
  const item  = queue.find(i => i.id === id);
  if (!item) return;

  const btn = el.querySelector<HTMLButtonElement>('.qi-send')!;
  btn.textContent = '…'; btn.disabled = true;
  el.classList.add('sending');

  const payloads = getPayloadsForItem(item, el);
  let allOk = true;

  for (const p of payloads) {
    const ok = await submitLog(p);
    if (!ok) allOk = false;
  }

  if (allOk) {
    showStatus('✓ Log sent successfully');
    await removeOne(id);
  } else {
    el.classList.remove('sending');
    btn.textContent = 'Send'; btn.disabled = false;
    showStatus('⚠ Send failed', true);
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
  (sendAllBtn as HTMLButtonElement).disabled = true;
  (sendAllBtn as HTMLButtonElement).textContent = 'Sending…';
  const failed: QueuedVideoLog[] = [];

  for (const item of queue) {
    const domEl = queueListEl.querySelector<HTMLElement>(`[data-id="${item.id}"]`);
    if (!domEl) continue;

    const payloads = getPayloadsForItem(item, domEl);
    let itemOk = true;

    for (const p of payloads) {
      const ok = await submitLog(p);
      if (!ok) itemOk = false;
    }

    if (!itemOk) failed.push(item);
  }

  await videoQueueStorage.setValue(failed);
  (sendAllBtn as HTMLButtonElement).disabled = false;
  (sendAllBtn as HTMLButtonElement).textContent = 'Send All';
  const sent = queue.length - failed.length;
  showStatus(
    failed.length === 0 ? `✓ ${sent} video${sent !== 1 ? 's' : ''} sent` : `⚠ ${sent} sent, ${failed.length} failed`,
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

loadConfig();
renderQueue();
