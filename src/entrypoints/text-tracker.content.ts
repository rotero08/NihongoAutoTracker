import { defineContentScript } from '#imports';
import { configStorage } from '@/utils/storage';
import { submitLog } from '@/utils/api';
import '@/assets/overlay.css';

const SKIP_HOSTS_DEFAULT = ['youtube.com','youtu.be','crunchyroll.com','animekai.to','music.youtube.com','nihongotracker.app', 'mail.google.com', 'mail.proton.me'];
const JP_DOMAINS_DEFAULT = [
  'nhk.or.jp','nhk.jp','news.yahoo.co.jp','yomiuri.co.jp','asahi.com','mainichi.jp',
  'nikkei.com','tokyoreporter.com','watanoc.com','aozora.gr.jp','syosetu.com','kakuyomu.jp',
  'pixiv.net','nicovideo.jp','comic-walker.com','manga-raw.club','jisho.org',
  'wanikani.com','bunpro.jp','satorireader.com',
];
const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff]/g;
const TTU_HOST = 'reader.ttsu.app';

async function isJapanesePage(cfg: any): Promise<boolean> {
  const host = window.location.hostname;
  const allowSites:  string[] = cfg.allowSites  ?? [...JP_DOMAINS_DEFAULT];
  const allowListOnly: boolean = cfg.allowListOnly ?? false;

  if (allowSites.some((d: string) => host.includes(d))) return true;
  if (allowListOnly) return false;

  const lang = document.documentElement.lang;
  if (lang.startsWith('ja')) return true;

  await new Promise(r => setTimeout(r, 1500));
  const sample = (document.body?.innerText ?? '').slice(0, 8000);
  return (sample.match(JP_RE) ?? []).length >= 40;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── TTU ───────────────────────────────────────────────────────────────────────
function parseTTUSession(): {chars: number; timeSecs: number; title: string} {
  const lines = (document.body?.innerText ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  let inSession = false, chars = 0, timeSecs = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/current\s+session/i.test(line)) { inSession = true; continue; }
    if (/^(today|all\s+time)$/i.test(line) && inSession) break;
    if (!inSession) continue;
    if (/characters?\s+read/i.test(line)) {
      const inline = line.replace(/characters?\s+read[:\s]*/i, '').replace(/,/g, '').trim();
      const n = parseInt(inline);
      chars = !isNaN(n) ? n : parseInt((lines[i + 1] ?? '').replace(/,/g, '')) || 0;
    }
    if (/reading\s+time/i.test(line)) {
      const timeRe = /(\d{1,2}):(\d{2}):(\d{2})/;
      const match  = line.match(timeRe) ?? lines[i + 1]?.match(timeRe);
      if (match) timeSecs = +match[1] * 3600 + +match[2] * 60 + +match[3];
    }
  }
  const title = document.title.replace(/\s*[–—-]\s*ttu.*$/i, '').trim() || document.title;
  return { chars, timeSecs, title };
}

function injectTTUStyles() {
  if (document.getElementById('nt-ttu-styles')) return;
  const s = document.createElement('style');
  s.id = 'nt-ttu-styles';
  s.textContent = `
    #nt-ttu-btn {
      display:inline-flex;align-items:center;gap:7px;padding:6px 13px;
      background:rgba(240,180,41,.12);border:1px solid rgba(240,180,41,.4);border-radius:4px;
      color:#f0b429;font-family:'Courier New',monospace;font-size:12px;font-weight:700;
      cursor:pointer;transition:background .15s,border-color .15s;letter-spacing:.03em;z-index:9999;
    }
    #nt-ttu-btn:hover{background:rgba(240,180,41,.22);border-color:rgba(240,180,41,.7);}
    #nt-ttu-modal-overlay{
      position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:'Courier New',monospace;
    }
    .nt-ttu-modal{
      background:#0b0c0f;border:1px solid #1e1e24;border-radius:6px;
      width:380px;max-width:92vw;padding:22px;color:#fff;
      box-shadow:0 10px 40px rgba(0,0,0,.9);box-sizing:border-box;color-scheme:dark;
    }
    .nt-ttu-hd{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #1e1e24;}
    .nt-ttu-logo{width:32px;height:32px;border:1px solid #f0b429;color:#f0b429;display:flex;align-items:center;justify-content:center;border-radius:4px;font-weight:bold;font-size:15px;box-sizing:border-box;}
    .nt-ttu-brand{font-weight:bold;font-size:13px;letter-spacing:.5px;}
    .nt-ttu-badge{background:#1e2a18;color:#3ddc84;border:1px solid #2a4028;font-size:10px;padding:2px 8px;border-radius:12px;font-weight:bold;width:max-content;margin-top:4px;}
    .nt-ttu-fg{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;}
    .nt-ttu-fg label{color:#8a8a9a;font-size:10px;font-weight:bold;letter-spacing:.5px;}
    .nt-ttu-fg input{background:#111115;border:1px solid #2a2a35;color:#fff;padding:9px 11px;border-radius:4px;font-family:inherit;font-size:12px;outline:none;transition:border .2s;box-sizing:border-box;width:100%;}
    .nt-ttu-fg input:focus{border-color:#f0b429;}
    .nt-ttu-row{display:flex;gap:10px;}
    .nt-ttu-row .nt-ttu-fg{flex:1;margin-bottom:0;}
    .nt-ttu-footer{display:flex;gap:10px;margin-top:14px;}
    .nt-ttu-footer button{flex:1;padding:11px;border:none;border-radius:4px;font-family:inherit;font-weight:bold;cursor:pointer;font-size:12px;transition:opacity .2s;}
    .nt-ttu-footer button:hover{opacity:.8;}
    #nt-ttu-cancel{background:#1e1e28;color:#a0a0b0;}
    #nt-ttu-submit{background:#f0b429;color:#111;}
  `;
  document.head.appendChild(s);
}

function showTTUToast(msg: string, err = false) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position:'fixed',bottom:'20px',right:'20px',zIndex:'2147483647',
    background: err ? '#1a0f0f' : '#0f1a0f',
    color: err ? '#f0706a' : '#3ddc84',
    border: `1px solid ${err ? 'rgba(240,112,106,.4)' : 'rgba(61,220,132,.4)'}`,
    borderRadius:'5px',padding:'9px 15px',
    fontFamily:"'Courier New',monospace",fontSize:'12px',
    boxShadow:'0 4px 20px rgba(0,0,0,.6)',
  });
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showTTUModal(stats: ReturnType<typeof parseTTUSession>) {
  injectTTUStyles();
  const overlay = document.createElement('div');
  overlay.id = 'nt-ttu-modal-overlay';
  const today = new Date().toISOString().split('T')[0];
  const defaultMins = Math.max(1, Math.round(stats.timeSecs / 60));

  overlay.innerHTML = `
  <div class="nt-ttu-modal">
    <div class="nt-ttu-hd">
      <div class="nt-ttu-logo">日</div>
      <div><div class="nt-ttu-brand">NihongoAutoTracker</div><div class="nt-ttu-badge">TEXT LOG</div></div>
    </div>
    <div class="nt-ttu-fg"><label>CONTENT TITLE</label>
      <input type="text" id="nt-ttu-title" value="${stats.title.replace(/"/g,'&quot;')}"/></div>
    <div class="nt-ttu-row">
      <div class="nt-ttu-fg"><label>CHARACTERS</label><input type="number" id="nt-ttu-chars" value="${stats.chars}" min="0"/></div>
      <div class="nt-ttu-fg"><label>TIME (MIN)</label><input type="number" id="nt-ttu-time" value="${defaultMins}" min="0"/></div>
      <div class="nt-ttu-fg"><label>DATE</label><input type="date" id="nt-ttu-date" value="${today}"/></div>
    </div>
    <div class="nt-ttu-footer">
      <button id="nt-ttu-cancel">Cancel</button>
      <button id="nt-ttu-submit">Log</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#nt-ttu-cancel')!.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#nt-ttu-submit')!.addEventListener('click', async () => {
    const title = (overlay.querySelector('#nt-ttu-title') as HTMLInputElement).value;
    const chars = parseInt((overlay.querySelector('#nt-ttu-chars') as HTMLInputElement).value) || 0;
    const time  = parseInt((overlay.querySelector('#nt-ttu-time')  as HTMLInputElement).value) || 0;
    const date  = new Date((overlay.querySelector('#nt-ttu-date')  as HTMLInputElement).value).toISOString();
    overlay.remove();
    const ok = await submitLog({
      type: 'reading',
      mediaData: { contentId: title, contentTitleNative: title, contentTitleEnglish: window.location.href, type: 'book' },
      description: `${title} via TTU Reader`,
      chars, time, date, episodes: 0, pages: 0, private: false, tags: [],
    });
    showTTUToast(ok ? `Logged: ${chars} chars / ${time} min` : 'Failed to log — check API key', !ok);
  });
}

function findTTUInsertPoint(): Element | null {
  const sel = ['[class*="header-actions"]','[class*="toolbar"]','[class*="reader-header"]','header [role="toolbar"]','header','nav'];
  for (const s of sel) { const el = document.querySelector(s); if (el) return el; }
  return null;
}

async function setupTTULogButton() {
  if (document.getElementById('nt-ttu-btn')) return;
  injectTTUStyles();
  const btn = document.createElement('button');
  btn.id = 'nt-ttu-btn';
  btn.title = 'Log reading session to NihongoTracker';
  btn.innerHTML = '<span style="font-family:serif;font-size:13px">日</span> Log';
  btn.addEventListener('click', () => showTTUModal(parseTTUSession()));
  const pt = findTTUInsertPoint();
  if (pt) { pt.appendChild(btn); }
  else { Object.assign(btn.style, {position:'fixed',top:'12px',right:'12px'}); document.body.appendChild(btn); }
}

// ── Time tracker ──────────────────────────────────────────────────────────────
function startTimeTracker() {
  let activeMs = 0, lastStamp = Date.now(), isVisible = !document.hidden, isPaused = false;
  const accrue = () => { if (isVisible && !isPaused) { activeMs += Date.now() - lastStamp; lastStamp = Date.now(); } };
  const getTotal = () => activeMs + (isVisible && !isPaused ? Date.now() - lastStamp : 0);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { accrue(); isVisible = false; } else { lastStamp = Date.now(); isVisible = true; }
  });
  browser.runtime.onMessage.addListener((req: any, _s, sendResponse) => {
    if (req.action === 'GET_ACTIVE_TIME') sendResponse({ minutes: Math.floor(getTotal() / 60000) });
  });
  (window as any).__nt = {
    getTotal,
    setMs: (ms: number) => { accrue(); activeMs = ms; lastStamp = Date.now(); },
    pause: (p: boolean) => { if (p) { accrue(); isPaused = true; } else { lastStamp = Date.now(); isPaused = false; } },
    isPaused: () => isPaused,
  };
}

// ── Overlay ───────────────────────────────────────────────────────────────────
function buildOverlay(cfg: any) {
  const overlay = document.createElement('div');
  overlay.id = 'nt-overlay';
  const handle = document.createElement('div');
  handle.className = 'nt-handle'; handle.title = 'Drag to move'; handle.innerHTML = '⠿';
  const timeEl = document.createElement('span');
  timeEl.className = 'nt-time'; timeEl.textContent = '0:00'; timeEl.title = 'Click to edit';
  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'nt-ctrl'; pauseBtn.textContent = '⏸'; pauseBtn.title = 'Pause / Resume';
  const resetBtn = document.createElement('button');
  resetBtn.className = 'nt-ctrl'; resetBtn.textContent = '↺'; resetBtn.title = 'Reset timer';
  overlay.append(handle, timeEl, pauseBtn, resetBtn);
  document.body.appendChild(overlay);

  const pos = cfg.overlayPosition ?? 'top-right';
  if (pos === 'top-left')     { overlay.style.top = '16px'; overlay.style.left = '16px'; }
  if (pos === 'top-right')    { overlay.style.top = '16px'; overlay.style.right = '16px'; }
  if (pos === 'bottom-left')  { overlay.style.bottom = '16px'; overlay.style.left = '16px'; }
  if (pos === 'bottom-right') { overlay.style.bottom = '16px'; overlay.style.right = '16px'; }

  let dragging = false, ox = 0, oy = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true;
    const r = overlay.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    overlay.style.right = ''; overlay.style.bottom = '';
    overlay.style.left = r.left + 'px'; overlay.style.top = r.top + 'px';
    handle.style.cursor = 'grabbing'; e.preventDefault();
  });
  document.addEventListener('mousemove', e => { if (dragging) { overlay.style.left=(e.clientX-ox)+'px'; overlay.style.top=(e.clientY-oy)+'px'; } });
  document.addEventListener('mouseup',  () => { if (dragging) { dragging=false; handle.style.cursor='grab'; } });

  pauseBtn.addEventListener('click', () => {
    const nt = (window as any).__nt;
    const nowPaused = !nt.isPaused();
    nt.pause(nowPaused);
    pauseBtn.textContent = nowPaused ? '▶' : '⏸';
    pauseBtn.classList.toggle('active', nowPaused);
  });
  resetBtn.addEventListener('click', () => { (window as any).__nt.setMs(0); });
  timeEl.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type='text'; input.className='nt-edit';
    input.value = fmt((window as any).__nt.getTotal()); input.placeholder='M:SS';
    const commit = () => {
      const parts = input.value.split(':').map(Number);
      let ms = 0;
      if (parts.length === 2) ms = (parts[0]*60+parts[1])*1000;
      if (parts.length === 3) ms = (parts[0]*3600+parts[1]*60+parts[2])*1000;
      if (!isNaN(ms) && ms >= 0) (window as any).__nt.setMs(ms);
      input.replaceWith(timeEl);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => { if (e.key==='Enter') input.blur(); });
    timeEl.replaceWith(input); input.focus(); input.select();
  });
  setInterval(() => { timeEl.textContent = fmt((window as any).__nt.getTotal()); }, 1000);
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'manifest',

  async main() {
    const host = window.location.hostname;
    const cfg  = await configStorage.getValue() as any;
    const skipSites: string[] = cfg.skipSites ?? ['youtube.com','youtu.be','crunchyroll.com','animekai.to','music.youtube.com','nihongotracker.app'];

    // TTU: check ttuEnabled toggle
    if (host.includes(TTU_HOST)) {
      if (!cfg.ttuEnabled) return;
      startTimeTracker();
      await new Promise(r => setTimeout(r, 2500));
      setupTTULogButton();
      setInterval(setupTTULogButton, 3000);
      return;
    }

    // Skip configured sites
    if (SKIP_HOSTS_DEFAULT.some(h => host.includes(h))) return;
    if (skipSites.some((h: string) => host.includes(h))) return;

    startTimeTracker();

    if (cfg.overlayPosition === 'hidden') return;

    const isJP = await isJapanesePage(cfg);
    if (!isJP) return;

    buildOverlay(cfg);
  },
});
