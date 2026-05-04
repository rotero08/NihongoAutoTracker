import { defineContentScript } from '#imports';
import { configStorage, readingQueueStorage, ttuHistoryStorage } from '@/utils/storage';
import '@/assets/overlay.css';

const SKIP_HOSTS_DEFAULT =['youtube.com','youtu.be','crunchyroll.com','animekai.to','music.youtube.com','nihongotracker.app', 'mail.google.com', 'mail.proton.me'];
const JP_DOMAINS_DEFAULT =[
  'nhk.or.jp','nhk.jp','news.yahoo.co.jp','yomiuri.co.jp','asahi.com','mainichi.jp',
'nikkei.com','tokyoreporter.com','watanoc.com','aozora.gr.jp','syosetu.com','kakuyomu.jp',
'pixiv.net','nicovideo.jp','comic-walker.com','manga-raw.club','jisho.org',
'wanikani.com','bunpro.jp','satorireader.com',
];
const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff]/g;
const TTU_HOST = 'reader.ttsu.app';

async function isJapanesePage(cfg: any): Promise<boolean> {
  const host = window.location.hostname;
  const allowSites: string[] = cfg.allowSites ??[...JP_DOMAINS_DEFAULT];
  const allowListOnly: boolean = cfg.allowListOnly ?? false;

  if (allowSites.some((d: string) => host.includes(d))) return true;
  if (allowListOnly) return false;

  const lang = document.documentElement.lang;
  if (lang.startsWith('ja')) return true;

  await new Promise(r => setTimeout(r, 1500));
  const sample = (document.body?.innerText ?? '').slice(0, 8000);
  return (sample.match(JP_RE) ??[]).length >= 40;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── TTU ───────────────────────────────────────────────────────────────────────
const ttuState = {
  id: crypto.randomUUID(),
  running: false,
  timeMs: 0,
  chars: 0,
};

function getTTUTitle() {
  let title = document.title;
  title = title.replace(/\s*\|\s*ッツ Ebook Reader\s*/i, '');
  title = title.replace(/\s*[–—-]\s*ttu.*$/i, '');
  return title.trim() || document.title;
}

function extractTTUCharCount(): number | null {
  for (const el of document.querySelectorAll('div, span')) {
    if (el.title && el.title.toLowerCase().includes('progress')) {
      const match = el.textContent?.match(/(?:T:\s*)?([\d,]+)\s*\/\s*[\d,]+/i) || el.textContent?.match(/([\d,]+)/);
      if (match) return parseInt(match[1].replace(/,/g, ''), 10);
    }
  }
  const footerEls = document.querySelectorAll('div');
  for (const el of footerEls) {
    if (el.textContent && el.children.length === 0) {
      const match = el.textContent.match(/^([\d,]+)\s*\/\s*[\d,]+$/);
      if (match) return parseInt(match[1].replace(/,/g, ''), 10);
    }
  }
  return null;
}

async function saveSessionAndQueue() {
  if (ttuState.timeMs === 0 && ttuState.chars === 0) return;

  const title = getTTUTitle();
  const dateStr = new Date().toISOString();
  const secs = Math.round(ttuState.timeMs / 1000);
  const sessionLog = { id: ttuState.id, date: dateStr, timeMs: ttuState.timeMs, chars: ttuState.chars };

  // 1. Save to local history
  const history = await ttuHistoryStorage.getValue() || {};
  if (!history[title]) history[title] = [];
  history[title].push(sessionLog);
  await ttuHistoryStorage.setValue(history);

  // 2. Add to Reading Queue
  const queue = await readingQueueStorage.getValue();
  let existing = queue.find(q => q.contentTitleNative === title);

  if (!existing) {
    existing = {
      id: crypto.randomUUID(), type: 'reading', contentTitleNative: title, contentTitleEnglish: '',
      description: '', chars: ttuState.chars, time: secs, // Stored as seconds!
      date: dateStr, private: false, tags: [],
      sessions:[{ id: ttuState.id, secs: secs, chars: ttuState.chars, date: dateStr }]
    };
    queue.push(existing);
  } else {
    existing.sessions = existing.sessions ||[];
    existing.sessions.push({ id: ttuState.id, secs: secs, chars: ttuState.chars, date: dateStr });
    existing.chars = existing.sessions.reduce((acc, s) => acc + s.chars, 0);
    const totalSecs = existing.sessions.reduce((acc, s) => acc + s.secs, 0);
    existing.time = totalSecs; // Stored as seconds!
  }
  await readingQueueStorage.setValue(queue);

  // 3. Reset State cleanly
  ttuState.id = crypto.randomUUID();
  ttuState.timeMs = 0;
  ttuState.chars = 0;
  ttuState.running = false;

  showToast(`Session queued!`);
}

// --- STYLES ---
function injectTTUStyles() {
  if (typeof document === 'undefined' || document.getElementById('nt-ttu-styles')) return;
  const s = document.createElement('style');
  s.id = 'nt-ttu-styles';
  s.textContent = `
  #nt-ttu-chrono-wrapper { position: relative; display: inline-flex; z-index: 9999; font-family: sans-serif; align-items: center; }
  #nt-ttu-chrono-btn { background: transparent; border: none; cursor: pointer; display: flex; padding: 6px; color: #f0b429; transition: all 0.15s ease; }
  #nt-ttu-chrono-btn:hover { color: #ffcc33 !important; filter: brightness(1.3); }
  #nt-ttu-chrono-btn:active { transform: scale(0.92); }
  #nt-ttu-chrono-btn svg { width: 22px; height: 22px; fill: currentColor; }

  #nt-ttu-dropdown { position: absolute; top: 100%; right: 0; margin-top: 8px; background: #252525; border: 1px solid #3a3a3a; border-radius: 6px; width: 240px; color: #ececec; box-shadow: 0 8px 24px rgba(0,0,0,0.8); display: none; flex-direction: column; overflow: hidden; writing-mode: horizontal-tb; text-align: left; direction: ltr; }
  #nt-ttu-dropdown.open { display: flex; }

  .nt-ttu-dd-section { padding: 12px; text-align: center; }
  .nt-ttu-dd-title { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }

  .nt-ttu-stats-row { display: flex; justify-content: space-evenly; align-items: center; margin-bottom: 12px; }
  .nt-ttu-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 45%; }
  .nt-ttu-stat-label { font-size: 10px; color: #999; }
  .nt-ttu-stat-val { font-family: monospace; font-size: 16px; color: #fff; cursor: pointer; padding: 2px 6px; border-radius: 4px; border: 1px solid transparent; transition: background 0.2s; text-align: center; }
  .nt-ttu-stat-val:hover { background: #333; border-color: #555; }
  .nt-ttu-stat-val.no-hover { cursor: default; }
  .nt-ttu-stat-val.no-hover:hover { background: transparent; border-color: transparent; }

  .nt-ttu-controls { display: flex; gap: 8px; justify-content: center; }
  .nt-ttu-btn-icon { background: transparent; color: #aaa; border: none; padding: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; border-radius: 50%; }
  .nt-ttu-btn-icon:hover { background: rgba(255,255,255,0.08); color: #fff; }
  .nt-ttu-btn-icon.primary { color: #f0b429; }
  .nt-ttu-btn-icon.primary:hover { background: rgba(240,180,41,0.15); color: #ffcc33; }
  .nt-ttu-btn-icon svg { width: 18px; height: 18px; fill: currentColor; }

  .nt-ttu-history { border-top: 1px solid #3a3a3a; font-size: 12px; }
  .nt-ttu-history summary { padding: 10px 12px; cursor: pointer; color: #aaa; outline: none; user-select: none; transition: background 0.2s; }
  .nt-ttu-history summary:hover { background: #2f2f2f; color: #fff; }
  .nt-ttu-history-list { max-height: 140px; overflow-y: auto; padding: 0 12px 12px 12px; display: flex; flex-direction: column; gap: 4px; }
  .nt-ttu-history-item { display: flex; justify-content: space-between; color: #bbb; background: #1c1c1c; padding: 6px 8px; border-radius: 4px; }
  `;
  document.head.appendChild(s);
}

// --- CORE LOGIC ---
function setupTTUChronometer() {
  if (typeof document === 'undefined') return;

  // Clean up existing interval if we're rebuilding the UI
  if ((window as any).ntChronoInterval) {
    clearInterval((window as any).ntChronoInterval);
  }

  // Remove old wrapper if it exists (happens when TTU re-renders toolbar)
  const oldWrapper = document.getElementById('nt-ttu-chrono-wrapper');
  if (oldWrapper) oldWrapper.remove();

  const pt = findTTUInsertPoint();
  if (!pt) return;

  injectTTUStyles();

  const wrapper = document.createElement('div');
  wrapper.id = 'nt-ttu-chrono-wrapper';
  wrapper.innerHTML = `
  <button id="nt-ttu-chrono-btn" title="NihongoTracker Session">
  <svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>
  </button>
  <div id="nt-ttu-dropdown">
  <div class="nt-ttu-dd-section">
  <div class="nt-ttu-dd-title">Current Session</div>
  <div class="nt-ttu-stats-row">
  <div class="nt-ttu-stat">
  <span class="nt-ttu-stat-label">Time</span>
  <span class="nt-ttu-stat-val" id="nt-ttu-val-time" title="Edit">0:00</span>
  </div>
  <div class="nt-ttu-stat">
  <span class="nt-ttu-stat-label">Chars</span>
  <span class="nt-ttu-stat-val" id="nt-ttu-val-chars" title="Edit">0</span>
  </div>
  </div>
  <div class="nt-ttu-controls">
  <button class="nt-ttu-btn-icon" id="nt-ttu-btn-toggle" title="Play/Pause"><svg viewBox="0 0 24 24"><path id="nt-ttu-play-path" d="M8 5v14l11-7z"/></svg></button>
  <button class="nt-ttu-btn-icon" id="nt-ttu-btn-reset" title="Reset Session"><svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
  <button class="nt-ttu-btn-icon primary" id="nt-ttu-btn-log" title="Save & Queue"><svg viewBox="0 0 24 24"><path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg></button>
  </div>
  </div>

  <div class="nt-ttu-dd-section" style="border-top: 1px solid #3a3a3a; background: rgba(0,0,0,0.2);">
  <div class="nt-ttu-dd-title">Total Book Progress</div>
  <div class="nt-ttu-stats-row" style="margin-bottom:0;">
  <div class="nt-ttu-stat">
  <span class="nt-ttu-stat-label">Total Time</span>
  <span class="nt-ttu-stat-val no-hover" id="nt-ttu-total-time" style="color:#f0b429;">0m</span>
  </div>
  <div class="nt-ttu-stat">
  <span class="nt-ttu-stat-label">Total Chars</span>
  <span class="nt-ttu-stat-val no-hover" id="nt-ttu-total-chars" style="color:#f0b429;">0</span>
  </div>
  </div>
  </div>

  <details class="nt-ttu-history" id="nt-ttu-history-wrap">
  <summary>Past Sessions History</summary>
  <div class="nt-ttu-history-list" id="nt-ttu-history-list"></div>
  </details>
  </div>
  `;

  const btn = wrapper.querySelector('#nt-ttu-chrono-btn')!;
  const dropdown = wrapper.querySelector('#nt-ttu-dropdown')!;
  const timeVal = wrapper.querySelector('#nt-ttu-val-time')!;
  const charsVal = wrapper.querySelector('#nt-ttu-val-chars')!;
  const toggleBtn = wrapper.querySelector('#nt-ttu-btn-toggle')!;

  let cachedHistoryMins = 0;
  let cachedHistoryChars = 0;

  // Intelligent reading bounds tracking
  let sessionStartChar = extractTTUCharCount() || 0;
  let manualCharOffset = 0;
  let lastTick = Date.now();

  const updateHistoryData = async () => {
    const history = await ttuHistoryStorage.getValue() || {};
    const sessions = history[getTTUTitle()] ||[];

    cachedHistoryMins = sessions.reduce((acc, s) => acc + Math.round(s.timeMs / 60000), 0);
    cachedHistoryChars = sessions.reduce((acc, s) => acc + s.chars, 0);

    const listEl = wrapper.querySelector('#nt-ttu-history-list')!;
    if (sessions.length === 0) {
      listEl.innerHTML = '<div style="color:#777;text-align:center;padding:12px;">No past sessions yet</div>';
    } else {
      let html = '';
      sessions.forEach(s => {
        const mins = Math.max(1, Math.round(s.timeMs / 60000));
        const d = new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        html += `<div class="nt-ttu-history-item"><span>${d}</span><span>${mins}m</span><span>${s.chars}c</span></div>`;
      });
      listEl.innerHTML = html;
    }
  };

  const updateUI = () => {
    if (timeVal.tagName !== 'INPUT') timeVal.textContent = fmt(ttuState.timeMs);
    if (charsVal.tagName !== 'INPUT') charsVal.textContent = ttuState.chars.toString();

    const totalMins = cachedHistoryMins + Math.floor(ttuState.timeMs / 60000);
    const totalChars = cachedHistoryChars + ttuState.chars;

    wrapper.querySelector('#nt-ttu-total-time')!.textContent = totalMins + 'm';
    wrapper.querySelector('#nt-ttu-total-chars')!.textContent = totalChars.toString();

    const playPath = toggleBtn.querySelector('#nt-ttu-play-path');
    if (playPath) {
      if (ttuState.running) {
        playPath.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z'); // Pause
        toggleBtn.title = 'Pause Timer';
      } else {
        playPath.setAttribute('d', 'M8 5v14l11-7z'); // Play
        toggleBtn.title = 'Start Timer';
      }
    }
  };

  const makeEditable = (el: Element, isTime: boolean) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevents click from bubbling to document and closing dropdown
      const input = document.createElement('input');
      input.type = 'text';
      input.value = isTime ? fmt(ttuState.timeMs) : ttuState.chars.toString();
      Object.assign(input.style, {
        width: '100%', textAlign: 'center', background: '#1a1a1a', color: '#fff',
        border: '1px solid #555', borderRadius: '4px', padding: '2px 4px',
        fontFamily: 'monospace', fontSize: '14px', boxSizing: 'border-box'
      });

      const commit = () => {
        if (isTime) {
          const parts = input.value.split(':').map(Number);
          let ms = 0;
          if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000;
          if (parts.length === 3) ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
          if (!isNaN(ms) && ms >= 0) ttuState.timeMs = ms;
        } else {
          const val = parseInt(input.value.replace(/\D/g, ''));
          if (!isNaN(val) && val >= 0) {
            const currentCount = extractTTUCharCount() || 0;
            let diff = currentCount - sessionStartChar;
            if (diff < 0) diff = 0;
            manualCharOffset = val - diff;
            ttuState.chars = val;
          }
        }
        input.replaceWith(el);
        updateUI();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', ev => { if (ev.key === 'Enter') input.blur(); });
      el.replaceWith(input);
      input.focus();
      input.select();
    });
  };

  makeEditable(timeVal, true);
  makeEditable(charsVal, false);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
    if (dropdown.classList.contains('open')) {
      await updateHistoryData();
    }
    updateUI();
  });

  document.addEventListener('click', (e) => {
    if (!e.composedPath().includes(wrapper)) {
      dropdown.classList.remove('open');
    }
  });

  toggleBtn.addEventListener('click', () => {
    ttuState.running = !ttuState.running;
    if (ttuState.running) {
      // Shifting the anchor forwards to prevent counting skipped jumps
      const currentCount = extractTTUCharCount() || 0;
      const oldDiff = ttuState.chars - manualCharOffset;
      sessionStartChar = currentCount - oldDiff;
      lastTick = Date.now();
    }
    updateUI();
  });

  wrapper.querySelector('#nt-ttu-btn-reset')!.addEventListener('click', () => {
    ttuState.timeMs = 0;
    ttuState.chars = 0;
    sessionStartChar = extractTTUCharCount() || 0;
    manualCharOffset = 0;
    updateUI();
  });

  wrapper.querySelector('#nt-ttu-btn-log')!.addEventListener('click', async () => {
    await saveSessionAndQueue();
    sessionStartChar = extractTTUCharCount() || 0;
    manualCharOffset = 0;
    await updateHistoryData();
    updateUI();
  });

  // The Tracking Engine
  (window as any).ntChronoInterval = setInterval(() => {
    if (ttuState.running && !document.hidden) {
      const now = Date.now();
      ttuState.timeMs += (now - lastTick);

      const currentCount = extractTTUCharCount();
      if (currentCount !== null) {
        let diff = currentCount - sessionStartChar;
        // If they scroll backwards heavily, difference drops. We cap floor it at 0
        if (diff < 0) diff = 0;
        ttuState.chars = diff + manualCharOffset;
      }
      lastTick = now;
      if (dropdown.classList.contains('open')) updateUI();
    } else if (ttuState.running && document.hidden) {
      // Don't accumulate time while tab is hidden, but keep anchor updated
      lastTick = Date.now();
    }
  }, 1000);

  pt.insertAdjacentElement('beforebegin', wrapper);
  updateHistoryData().then(() => updateUI());
}

function findTTUInsertPoint() {
  if (typeof document === 'undefined') return null;
  const completeBookBtn = document.querySelector('[title="Complete Book"]');
  if (completeBookBtn) return completeBookBtn;
  const rightSideToolbar = document.querySelector('.flex.translate-x-4');
  if (rightSideToolbar && rightSideToolbar.firstElementChild) return rightSideToolbar.firstElementChild;
  return null;
}

if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(() => {
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    const target = findTTUInsertPoint();
    if (target && !wrapper) setupTTUChronometer();
  });
    observer.observe(document.body, { childList: true, subtree: true });
    setupTTUChronometer();
}

// Ensure the toast matches the extension aesthetics and defies page layout quirks
function showToast(msg: string, err = false) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position:'fixed',bottom:'20px',right:'20px',zIndex:'2147483647',
    background: err ? '#1a0f0f' : '#0f1a0f', color: err ? '#f0706a' : '#3ddc84',
    border: `1px solid ${err ? 'rgba(240,112,106,.4)' : 'rgba(61,220,132,.4)'}`,
                borderRadius:'5px',padding:'9px 15px', fontFamily:"'Courier New',monospace",
                fontSize:'13px', boxShadow:'0 4px 20px rgba(0,0,0,.6)',
                writingMode: 'horizontal-tb', direction: 'ltr', textAlign: 'left', lineHeight: '1.4'
  });
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.5s';
    setTimeout(() => el.remove(), 500);
  }, 3000);
}

// Globally register the toast listener
if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((req: any, _s, sendResponse) => {
    if (req.action === 'GET_ACTIVE_TIME') {
      const nt = (window as any).__nt;
      if (nt && nt.getTotal) sendResponse({ minutes: Math.floor(nt.getTotal() / 60000) });
    }
    if (req.action === 'SHOW_TOAST') {
      showToast(`${req.title}: ${req.message}`, req.title.toLowerCase().includes('fail') || req.title.toLowerCase().includes('error'));
    }
  });
}
window.addEventListener('message', (event) => {
  if (event.data?.action === 'SHOW_TOAST') {
    showToast(`${event.data.title}: ${event.data.message}`, event.data.title.toLowerCase().includes('fail') || event.data.title.toLowerCase().includes('error'));
  }
});

function startTimeTracker() {
  let activeMs = 0, lastStamp = Date.now(), isVisible = !document.hidden, isPaused = false;
  const accrue = () => { if (isVisible && !isPaused) { activeMs += Date.now() - lastStamp; lastStamp = Date.now(); } };
  const getTotal = () => activeMs + (isVisible && !isPaused ? Date.now() - lastStamp : 0);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { accrue(); isVisible = false; } else { lastStamp = Date.now(); isVisible = true; }
  });
  (window as any).__nt = { getTotal, setMs: (ms: number) => { accrue(); activeMs = ms; lastStamp = Date.now(); }, pause: (p: boolean) => { if (p) { accrue(); isPaused = true; } else { lastStamp = Date.now(); isPaused = false; } }, isPaused: () => isPaused };
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

export default defineContentScript({
  matches:['<all_urls>'],
  cssInjectionMode: 'manifest',

  async main() {
    const host = window.location.hostname;
    const cfg  = await configStorage.getValue() as any;
    const skipSites: string[] = cfg.skipSites ??['youtube.com','youtu.be','crunchyroll.com','animekai.to','music.youtube.com','nihongotracker.app'];

    if (host.includes(TTU_HOST)) {
      if (!cfg.ttuEnabled) return;
      startTimeTracker();
      await new Promise(r => setTimeout(r, 2500));
      setupTTUChronometer();
      return;
    }

    if (SKIP_HOSTS_DEFAULT.some(h => host.includes(h))) return;
    if (skipSites.some((h: string) => host.includes(h))) return;

    startTimeTracker();
    if (cfg.overlayPosition === 'hidden') return;

    const isJP = await isJapanesePage(cfg);
    if (!isJP) return;

    buildOverlay(cfg);
  },
});
