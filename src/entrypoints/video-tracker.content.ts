import { defineContentScript } from '#imports';
import { configStorage, videoQueueStorage } from '@/utils/storage';
import { submitLog } from '@/utils/api';
import '@/assets/player.css';

// ── Site / content type detection ────────────────────────────────────────────

const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff]/;

function isMusic(): boolean {
  const host = window.location.hostname;
  if (host === 'music.youtube.com') return true;

  if (host.includes('youtube.com')) {
    // 1. Highly reliable check for standard YouTube music category
    const genreMeta = document.querySelector('meta[itemprop="genre"]');
    if (genreMeta && genreMeta.getAttribute('content') === 'Music') return true;

    // 2. Check for music metadata renderer (Official music videos)
    if (document.querySelector('ytd-music-watch-metadata-renderer')) return true;

    // 3. Fallback: Check chips
    const chips = document.querySelectorAll<HTMLElement>('yt-chip-cloud-chip-renderer');
    for (const c of chips) {
      if (c.textContent?.trim().toLowerCase() === 'music') return true;
    }
  }
  return false;
}

function isLikelyJapanese(): boolean {
  const host = window.location.hostname;
  if (host.includes('animekai')) return true;
  if (host.includes('crunchyroll')) return true;
  if (host.includes('youtube')) {
    if (JP_RE.test(document.title)) return true;
    if (document.documentElement.lang.startsWith('ja')) return true;
    const t = document.querySelector<HTMLElement>('#title h1 yt-formatted-string, h1.ytd-video-primary-info-renderer yt-formatted-string');
    if (t && JP_RE.test(t.textContent ?? '')) return true;
  }
  return false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSecs(s: number): string {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

function toast(msg: string) {
  const el = document.createElement('div');
  el.className = 'nt-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Strip timestamps and playlist params to uniquely identify a video
function getBaseUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return u.origin + u.pathname + '?v=' + v;
    }
    return u.origin + u.pathname;
  } catch {
    return url.split('&t=')[0].split('?t=')[0];
  }
}

async function syncWithQueue(secs: number, title: string, url: string) {
  if (secs < 60) return;

  const minutes = Math.max(1, Math.round(secs / 60));
  const queue = await videoQueueStorage.getValue();
  const baseMatch = getBaseUrl(url);

  const existingIndex = queue.findIndex((q) => getBaseUrl(q.contentTitleEnglish) === baseMatch);

  if (existingIndex !== -1) {
    queue[existingIndex].time = minutes;
    (queue[existingIndex] as any)._secs = secs;
  } else {
    queue.push({
      id: crypto.randomUUID(),
               contentTitleNative: title,
               contentTitleEnglish: url,
               time: minutes, date: new Date().toISOString(),
               private: false, tags:[], description: '',
                 _secs: secs
    } as any);
  }

  // Force WXT reactivity by passing a new array reference
  await videoQueueStorage.setValue([...queue]);

  // Try/catch prevents the script from crashing if the popup is closed
  try { browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: queue.length }); } catch (e) {}
}

async function removeFromQueue(url: string) {
  const queue = await videoQueueStorage.getValue();
  const baseMatch = getBaseUrl(url);
  const newQueue = queue.filter((q) => getBaseUrl(q.contentTitleEnglish) !== baseMatch);

  if (newQueue.length !== queue.length) {
    await videoQueueStorage.setValue(newQueue);
    try { browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: newQueue.length }); } catch (e) {}
  }
}

// ── Modals & Styling ──────────────────────────────────────────────────────────

function injectModalStyles() {
  if (document.getElementById('nt-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'nt-modal-styles';
  style.textContent = `
  #nt-modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .nt-modal {
    background: #0b0c0f; border: 1px solid #1e1e24; border-radius: 6px;
    width: 380px; max-width: 90vw; padding: 24px; color: #fff;
    box-shadow: 0 10px 40px rgba(0,0,0,0.9); box-sizing: border-box;
    color-scheme: dark;
  }
  .nt-modal-header {
    display: flex; align-items: center; gap: 14px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #1e1e24;
  }
  .nt-logo-sq {
    width: 34px; height: 34px; border: 1px solid #F5B831; color: #F5B831;
    display: flex; align-items: center; justify-content: center; border-radius: 4px; font-weight: bold; font-size: 16px;
    box-sizing: border-box;
  }
  .nt-title-area { display: flex; flex-direction: column; gap: 5px; }
  .nt-brand-name { font-weight: bold; font-size: 14px; letter-spacing: 0.5px; }
  .nt-badge {
    background: #3E1C1F; color: #E57373; border: 1px solid #5A2A2E;
    font-size: 10px; padding: 2px 8px; border-radius: 12px; font-weight: bold; width: max-content;
  }
  .nt-form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; width: 100%; box-sizing: border-box; }
  .nt-form-group label { color: #8A8A9A; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; }
  .nt-form-group input {
    background: #111115; border: 1px solid #2A2A35; color: #fff; padding: 10px 12px;
    border-radius: 4px; font-family: inherit; font-size: 13px; outline: none; transition: border 0.2s;
    box-sizing: border-box; width: 100%; min-width: 0;
  }
  .nt-form-group input:focus { border-color: #F5B831; }

  .nt-form-row { display: flex; gap: 12px; width: 100%; }
  .nt-form-row .nt-form-group { margin-bottom: 0; }
  .nt-form-row .nt-form-group:first-child { flex: 0 0 100px; }
  .nt-form-row .nt-form-group:last-child { flex: 1; min-width: 0; }

  .nt-note { color: #6A6A7A; font-size: 11px; margin-top: 16px; margin-bottom: 24px; text-align: center; }
  .nt-modal-footer { display: flex; gap: 12px; }
  .nt-modal-footer button {
    flex: 1; padding: 12px; border: none; border-radius: 4px; font-family: inherit;
    font-weight: bold; cursor: pointer; font-size: 13px; transition: opacity 0.2s;
    box-sizing: border-box;
  }
  .nt-modal-footer button:hover { opacity: 0.8; }
  #nt-modal-cancel { background: #1E1E28; color: #A0A0B0; }
  #nt-modal-submit { background: #F5B831; color: #111; }

  .nt-absolute-pill { position: absolute; bottom: 60px; left: 20px; z-index: 9999; }
  `;
  document.head.appendChild(style);
}

function showNTEditModal(data: { title: string, url: string, secs: number }, onConfirm: (finalData: any) => void) {
  injectModalStyles();

  const overlay = document.createElement('div');
  overlay.id = 'nt-modal-overlay';

  const defaultMins = Math.max(1, Math.round(data.secs / 60));
  const today = new Date().toISOString().split('T')[0];

  overlay.innerHTML = `
  <div class="nt-modal">
  <div class="nt-modal-header">
  <div class="nt-logo-sq">日</div>
  <div class="nt-title-area">
  <span class="nt-brand-name">NihongoAutoTracker</span>
  <span class="nt-badge">MANUAL LOG</span>
  </div>
  </div>

  <div class="nt-modal-body">
  <div class="nt-form-group">
  <label>CONTENT TITLE</label>
  <input type="text" id="nt-edit-title" value="${data.title.replace(/"/g, '&quot;')}">
  </div>
  <div class="nt-form-row">
  <div class="nt-form-group">
  <label>TIME (MIN)</label>
  <input type="number" id="nt-edit-time" value="${defaultMins}">
  </div>
  <div class="nt-form-group">
  <label>DATE</label>
  <input type="date" id="nt-edit-date" value="${today}">
  </div>
  </div>
  <p class="nt-note">Queue logic will be bypassed for this video.</p>
  </div>

  <div class="nt-modal-footer">
  <button id="nt-modal-cancel">CANCEL</button>
  <button id="nt-modal-submit">LOG IMMERSION</button>
  </div>
  </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('nt-modal-cancel')?.addEventListener('click', () => overlay.remove());
  document.getElementById('nt-modal-submit')?.addEventListener('click', () => {
    const finalData = {
      title: (document.getElementById('nt-edit-title') as HTMLInputElement).value,
                                                               time: parseInt((document.getElementById('nt-edit-time') as HTMLInputElement).value),
                                                               date: new Date((document.getElementById('nt-edit-date') as HTMLInputElement).value).toISOString(),
    };
    onConfirm(finalData);
    overlay.remove();
  });
}

// ── Player counter injection ──────────────────────────────────────────────────

function getTimestampContainer(vid: HTMLVideoElement): { el: HTMLElement, isFallback: boolean } | null {
  const host = window.location.hostname;
  if (host.includes('youtube.com')) {
    const el = document.querySelector('.ytp-left-controls') as HTMLElement;
    if (el) return { el, isFallback: false };
  }
  if (host.includes('crunchyroll.com')) {
    const el = document.querySelector('.vmp-controls__left') || document.querySelector('.velocity-controls');
    if (el) return { el: el as HTMLElement, isFallback: false };
  }
  if (host.includes('animekai')) {
    const el = document.querySelector('.plyr__controls__item.plyr__time--current') ||
    document.querySelector('.jw-controlbar-left-group');
    if (el) return { el: el as HTMLElement, isFallback: false };
  }

  const fallback = document.querySelector('.video-player-container') || document.querySelector('#movie_player') ||
  document.querySelector('.plyr__video-wrapper') || document.querySelector('.jw-media') || vid.parentElement;
  if (fallback) return { el: fallback as HTMLElement, isFallback: true };
  return null;
}

function ensureCounter(getWatchedSecs: () => number, title: string, url: string, state: { hasTriggered: boolean }, vid: HTMLVideoElement) {
  let el = document.getElementById('nt-status-badge') as HTMLElement | null;

  if (!el) {
    const containerData = getTimestampContainer(vid);
    if (!containerData) return;

    el = document.createElement('div');
    el.id = 'nt-status-badge';
    el.title = "Log this video";
    if (containerData.isFallback) el.classList.add('nt-absolute-pill');

    el.innerHTML = `
    <div class="nt-pill-visual-wrapper">
    <span class="nt-brand-label">NT</span>
    <span class="nt-time-label">0:00</span>
    </div>
    `;

    el.onclick = () => {
      showNTEditModal({ title, url, secs: getWatchedSecs() }, async (final) => {
        state.hasTriggered = true;
        const ok = await submitLog({
          type: 'watching',
          mediaData: { contentTitleNative: final.title, contentTitleEnglish: url },
          time: final.time, date: final.date,
          episodes: 0, pages: 0, chars: 0, private: false, tags:[],
          description: 'Pill Override',
        });
        if (ok) {
          toast(`✓ Logged: ${final.time} min`);
          removeFromQueue(window.location.href); // Clear from queue upon success
        } else {
          state.hasTriggered = false; // Allow retry if failed
        }
      });
    };

    containerData.el.appendChild(el);
  } else {
    const timeLabel = el.querySelector('.nt-time-label');
    if (timeLabel) timeLabel.textContent = fmtSecs(getWatchedSecs());
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default defineContentScript({
  matches:['*://*.youtube.com/*', '*://music.youtube.com/*', '*://*.crunchyroll.com/*', '*://*.animekai.to/*'],
  cssInjectionMode: 'manifest',

  async main() {
    let watchedSecs = 0, prevTime = -1;
    let lastSyncSecs = 0, lastAutoCheckSecs = 0;
    const state = { hasTriggered: false };
    let trackedVideo: HTMLVideoElement | null = null;
    let currentUrl = ''; // <-- ADD THIS

  const attach = (vid: HTMLVideoElement) => {
    if (trackedVideo === vid && currentUrl === window.location.href) return;

    trackedVideo = vid;
    currentUrl = window.location.href; // <-- ADD THIS

    watchedSecs = 0; prevTime = -1;
    lastSyncSecs = 0; lastAutoCheckSecs = 0;
    state.hasTriggered = false;

    document.getElementById('nt-status-badge')?.remove();

      // 1. Initial Load: Check if we are resuming a queued video
      (async () => {
        const queue = await videoQueueStorage.getValue();
        const baseMatch = getBaseUrl(window.location.href);
        const existing = queue.find((q: any) => getBaseUrl(q.contentTitleEnglish) === baseMatch);
        if (existing) {
          watchedSecs = (existing as any)._secs || (existing.time * 60);
          lastSyncSecs = watchedSecs;
          ensureCounter(() => watchedSecs, document.title, window.location.href, state, vid);
        }
      })();

      vid.addEventListener('timeupdate', async () => {
        if (prevTime >= 0) {
          const d = vid.currentTime - prevTime;
          if (d > 0 && d < 2.5) watchedSecs += d;
        }
        prevTime = vid.currentTime;

        ensureCounter(() => watchedSecs, document.title, window.location.href, state, vid);

        if (state.hasTriggered || vid.duration <= 0) return;

        // 2. MANUAL Mode Logic: Silently sync with queue every 10 seconds of watch time
        if (watchedSecs >= 60 && (watchedSecs - lastSyncSecs) >= 10) {
          lastSyncSecs = watchedSecs;
          const cfg = await configStorage.getValue();
          if (cfg.logMode === 'manual' && isLikelyJapanese() && !isMusic()) {
            syncWithQueue(watchedSecs, document.title, window.location.href);
          }
        }

        // 3. AUTO Mode Logic: Check thresholds every 5 seconds
        if ((watchedSecs - lastAutoCheckSecs) >= 5) {
          lastAutoCheckSecs = watchedSecs;
          const cfg = await configStorage.getValue();

          if (cfg.logMode === 'auto' && isLikelyJapanese() && !isMusic()) {
            const pct = (vid.currentTime / vid.duration) * 100;
            if (pct >= cfg.threshold) {
              state.hasTriggered = true;
              const fullMins = Math.round(vid.duration / 60);
              const ok = await submitLog({
                type: 'watching',
                mediaData: { contentTitleNative: document.title, contentTitleEnglish: window.location.href },
                time: fullMins, date: new Date().toISOString(),
                                         episodes: 0, pages: 0, chars: 0, private: false, tags: [],
                                         description: '',
              });

              if (ok) {
                toast(`✓ Auto-logged: ${fullMins} min`);
                // Once logged, we clear it from the manual queue
                removeFromQueue(window.location.href);
              } else {
                state.hasTriggered = false; // Allow retry if API failed
              }
            }
          }
        }
      });

      // ── Final Sync on Video End ──
      vid.addEventListener('ended', async () => {
        if (state.hasTriggered) return;
        const cfg = await configStorage.getValue();

        // Final manual sync to ensure the last few seconds are caught
        if (cfg.logMode === 'manual' && isLikelyJapanese() && !isMusic() && watchedSecs >= 60) {
          syncWithQueue(watchedSecs, document.title, window.location.href);
        }
      });

      vid.addEventListener('emptied', () => {
        watchedSecs = 0; prevTime = -1;
        lastSyncSecs = 0; lastAutoCheckSecs = 0;
        state.hasTriggered = false;
        document.getElementById('nt-status-badge')?.remove();
      });
    };

    // ── Polling (SPA navigation & dynamic element insertion) ─────────────────
    setInterval(() => {
      const vid = document.querySelector<HTMLVideoElement>('video');
      if (vid) {
        attach(vid);
        // Ensure counter is visible even if the site's UI re-rendered and wiped it
        ensureCounter(() => watchedSecs, document.title, window.location.href, state, vid);
      }
    }, 2000);
  },
});
