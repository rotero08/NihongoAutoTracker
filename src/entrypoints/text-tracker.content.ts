import { defineContentScript } from '#imports';
import { configStorage } from '@/utils/storage';
import '@/assets/overlay.css';

const SKIP_HOSTS = ['youtube.com', 'youtu.be', 'crunchyroll.com', 'animekai.to', 'music.youtube.com', 'reader.ttsu.app'];
const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff]/g;

// ── Japanese page detection ───────────────────────────────────────────────────
async function isJapanesePage(): Promise<boolean> {
  // 1. HTML lang attribute
  const lang = document.documentElement.lang;
  if (lang.startsWith('ja')) return true;

  // 2. Known Japanese domains (common immersion sites)
  const host = window.location.hostname;
  const JP_DOMAINS = [
    'nhk.or.jp', 'nhk.jp', 'news.yahoo.co.jp', 'yomiuri.co.jp',
    'asahi.com', 'mainichi.jp', 'nikkei.com', 'tokyoreporter.com',
    'watanoc.com', 'aozora.gr.jp', 'syosetu.com', 'kakuyomu.jp',
    'pixiv.net', 'nicovideo.jp', 'comic-walker.com', 'manga-raw.club',
    'jisho.org', 'wanikani.com', 'bunpro.jp', 'satorireader.com',
  ];
  if (JP_DOMAINS.some(d => host.includes(d))) return true;

  // 3. Scan body text for JP density (wait briefly for SPA content)
  await new Promise(r => setTimeout(r, 1500));
  const sample = (document.body?.innerText ?? '').slice(0, 8000);
  const matches = sample.match(JP_RE) ?? [];
  return matches.length >= 40;
}

// ── Format ms → M:SS ─────────────────────────────────────────────────────────
function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'manifest',

  async main() {
    // Skip video sites — they have their own tracker
    const host = window.location.hostname;
    if (SKIP_HOSTS.some(h => host.includes(h))) return;

    // ── Time tracking (always running, used for context menu) ─────────────────
    let activeMs    = 0;
    let lastStamp   = Date.now();
    let isVisible   = !document.hidden;
    let isPaused    = false;

    const accrue = () => {
      if (isVisible && !isPaused) {
        activeMs += Date.now() - lastStamp;
        lastStamp = Date.now();
      }
    };

    const totalMs = () => activeMs + (isVisible && !isPaused ? Date.now() - lastStamp : 0);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { accrue(); isVisible = false; }
      else { lastStamp = Date.now(); isVisible = true; }
    });

    // Respond to context menu background request
    browser.runtime.onMessage.addListener((req, _s, sendResponse) => {
      if (req.action === 'GET_ACTIVE_TIME') {
        sendResponse({ minutes: Math.floor(totalMs() / 60000) });
      }
    });

    // ── Overlay: only on JP pages ─────────────────────────────────────────────
    const cfg = await configStorage.getValue();
    if (cfg.overlayPosition === 'hidden') return;

    const isJP = await isJapanesePage();
    if (!isJP) return;

    // ── Build overlay ─────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'nt-overlay';

    const handle = document.createElement('div');
    handle.className = 'nt-handle';
    handle.title = 'Drag to move';
    handle.innerHTML = '⠿';

    const timeEl = document.createElement('span');
    timeEl.className = 'nt-time';
    timeEl.textContent = '0:00';
    timeEl.title = 'Click to edit';

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'nt-ctrl';
    pauseBtn.textContent = '⏸';
    pauseBtn.title = 'Pause / Resume';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'nt-ctrl';
    resetBtn.textContent = '↺';
    resetBtn.title = 'Reset timer';

    overlay.append(handle, timeEl, pauseBtn, resetBtn);
    document.body.appendChild(overlay);

    // ── Position ──────────────────────────────────────────────────────────────
    const setDefaultPosition = () => {
      const pos = cfg.overlayPosition;
      overlay.style.removeProperty('left');
      overlay.style.removeProperty('right');
      overlay.style.removeProperty('top');
      overlay.style.removeProperty('bottom');

      if (pos === 'top-left')     { overlay.style.top = '16px';    overlay.style.left = '16px'; }
      if (pos === 'top-right')    { overlay.style.top = '16px';    overlay.style.right = '16px'; }
      if (pos === 'bottom-left')  { overlay.style.bottom = '16px'; overlay.style.left = '16px'; }
      if (pos === 'bottom-right') { overlay.style.bottom = '16px'; overlay.style.right = '16px'; }
    };
    setDefaultPosition();

    // ── Drag (session only — resets on page reload) ───────────────────────────
    let dragging = false, ox = 0, oy = 0;

    handle.addEventListener('mousedown', e => {
      dragging = true;
      const rect = overlay.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;

      // Switch to absolute pixel positioning during drag
      overlay.style.right  = '';
      overlay.style.bottom = '';
      overlay.style.left   = rect.left + 'px';
      overlay.style.top    = rect.top  + 'px';

      handle.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      overlay.style.left = (e.clientX - ox) + 'px';
      overlay.style.top  = (e.clientY - oy) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (dragging) { dragging = false; handle.style.cursor = 'grab'; }
    });

    // ── Controls ──────────────────────────────────────────────────────────────
    pauseBtn.addEventListener('click', () => {
      if (isPaused) {
        lastStamp = Date.now(); isPaused = false;
        pauseBtn.textContent = '⏸';
        pauseBtn.classList.remove('active');
      } else {
        accrue(); isPaused = true;
        pauseBtn.textContent = '▶';
        pauseBtn.classList.add('active');
      }
    });

    resetBtn.addEventListener('click', () => {
      accrue(); activeMs = 0; lastStamp = Date.now();
    });

    // Click time → inline edit
    timeEl.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'nt-edit';
      input.value = fmt(totalMs());
      input.placeholder = 'M:SS';

      const commit = () => {
        const parts = input.value.split(':').map(Number);
        let ms = 0;
        if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000;
        if (parts.length === 3) ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        if (!isNaN(ms) && ms >= 0) { activeMs = ms; lastStamp = Date.now(); }
        input.replaceWith(timeEl);
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
      timeEl.replaceWith(input);
      input.focus(); input.select();
    });

    // ── Tick ─────────────────────────────────────────────────────────────────
    setInterval(() => { timeEl.textContent = fmt(totalMs()); }, 1000);
  },
});
