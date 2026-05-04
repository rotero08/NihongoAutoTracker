import { defineContentScript } from '#imports';
import { configStorage, videoQueueStorage } from '@/utils/storage';
import { submitLog } from '@/utils/api';
import '@/assets/player.css';

const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff]/g;

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
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    zIndex: '2147483647',
    background: '#0d0d12',
    color: '#dde4f0',
    border: '1px solid #222d42',
    borderRadius: '6px',
    padding: '10px 16px',
    fontSize: '12px',
    fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
    fontWeight: 'bold',
    boxShadow: '0 4px 20px rgba(0,0,0,.7)',
                pointerEvents: 'none',
                opacity: '1',
                transition: 'opacity .3s',
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
    return u.origin + u.pathname;
  } catch { return url; }
}

function isMusic(): boolean {
  const host = window.location.hostname;
  if (host === 'music.youtube.com') return true;
  if (host.includes('youtube.com')) {
    const g = document.querySelector('meta[itemprop="genre"]');
    if (g?.getAttribute('content') === 'Music') return true;
    if (document.querySelector('ytd-music-watch-metadata-renderer')) return true;
  }
  return false;
}

// ── Robust JP detection ───────────────────────────────────────────────────────
function isLikelyJapanese(): boolean {
  const host = window.location.hostname;
  if (host.includes('animekai') || host.includes('crunchyroll')) return true;

  if (host.includes('youtube.com')) {
    const pr = (window as any).ytInitialPlayerResponse;
    if (pr?.videoDetails?.languageCode === 'ja') return true;

    if (pr) {
      const tracks: any[] = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (tracks.some(t => t.vssId === 'a.ja' || (t.languageCode === 'ja' && t.vssId?.startsWith('a.')))) return true;
    }

    const descEl = document.querySelector<HTMLElement>(
      '#description-inline-expander yt-attributed-string, ytd-expandable-video-description-body-renderer'
    );
    if (descEl) {
      const sample = descEl.innerText?.slice(0, 2000) ?? '';
      if ((sample.match(JP_RE) ?? []).length >= 15) return true;
    }

    for (const s of document.querySelectorAll('script:not([src])')) {
      if (/"languageCode"\s*:\s*"ja"/.test(s.textContent ?? '')) return true;
    }

    return false;
  }
  return false;
}

let _jpCacheUrl = '';
let _jpCacheResult = false;
function isLikelyJapaneseCached(): boolean {
  const url = cleanUrl(window.location.href);
  if (url !== _jpCacheUrl) {
    _jpCacheResult = isLikelyJapanese();
    _jpCacheUrl = url;
  }
  return _jpCacheResult;
}
function invalidateJpCache() { _jpCacheUrl = ''; }

// ── Channel ID & Name ─────────────────────────────────────────────────────────
function getYouTubeChannelId(): string | null {
  for (const s of document.querySelectorAll('script:not([src])')) {
    const m = s.textContent?.match(/"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{22})"/);
    if (m) return m[1];
  }
  const link = document.querySelector<HTMLLinkElement>('link[itemprop="url"][href*="/channel/"]');
  if (link) { const m = link.href.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/); if (m) return m[1]; }
  const a = document.querySelector<HTMLAnchorElement>('ytd-channel-name a[href*="/channel/"]');
  if (a) { const m = a.href.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/); if (m) return m[1]; }
  return null;
}

function getChannelNameFallback(): string {
  const ytEl = document.querySelector<HTMLElement>('ytd-channel-name yt-formatted-string, ytd-channel-name a');
  if (ytEl?.innerText?.trim()) return ytEl.innerText.trim();
  const showEl = document.querySelector<HTMLElement>('.show-title-link, .series-title, .title[data-t="title"]');
  if (showEl?.innerText?.trim()) return showEl.innerText.trim();
  return '';
}

// ── Queue helpers ─────────────────────────────────────────────────────────────
async function upsertQueueLive(secs: number, videoTitle: string, channelName: string, url: string, channelId: string | null, sessionId: string) {
  if (secs < 60) return;
  const clean = cleanUrl(url);
  const queue = await videoQueueStorage.getValue();
  const idx = queue.findIndex(q => q.contentTitleEnglish === clean);

  if (idx !== -1) {
    const item = queue[idx] as any;
    item.sessions = item.sessions || [];

    const sIdx = item.sessions.findIndex((s: any) => s.id === sessionId);
    if (sIdx >= 0) {
      item.sessions[sIdx].secs = secs;
      item.sessions[sIdx].date = new Date().toISOString();
    } else {
      item.sessions.push({ id: sessionId, secs, date: new Date().toISOString() });
    }

    const completedSecs = item.sessions.reduce((a: number, s: any) => a + s.secs, 0);
    item.time = Math.max(1, Math.round(completedSecs / 60));
    item.description = videoTitle;
    item.contentTitleNative = channelName;
    if (channelId && !item.channelId) item.channelId = channelId;
    delete item._currentSecs;
  } else {
    queue.push({
      id: crypto.randomUUID(),
               contentTitleNative: channelName,
               contentTitleEnglish: clean,
               time: Math.max(1, Math.round(secs / 60)),
               date: new Date().toISOString(),
               private: false, tags: [],
                 description: videoTitle,
                 sessions: [{ id: sessionId, secs, date: new Date().toISOString() }],
               channelId,
    } as any);
  }
  await videoQueueStorage.setValue([...queue]);
  try { browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: queue.length }); } catch {}
}

async function finalizeSession(secs: number, url: string, sessionId: string) {
  if (secs < 60) return;
  const clean = cleanUrl(url);
  const queue = await videoQueueStorage.getValue();
  const idx = queue.findIndex(q => q.contentTitleEnglish === clean);
  if (idx === -1) return;

  const item = queue[idx] as any;
  item.sessions = item.sessions || [];

  const sIdx = item.sessions.findIndex((s: any) => s.id === sessionId);
  if (sIdx >= 0) {
    item.sessions[sIdx].secs = secs;
  } else {
    item.sessions.push({ id: sessionId, secs, date: new Date().toISOString() });
  }

  item.time = Math.max(1, Math.round(item.sessions.reduce((a: number, s: any) => a + s.secs, 0) / 60));
  delete item._currentSecs;

  await videoQueueStorage.setValue([...queue]);
  try { browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: queue.length }); } catch {}
}

async function removeFromQueue(url: string) {
  const clean = cleanUrl(url);
  const queue = await videoQueueStorage.getValue();
  const next = queue.filter(q => q.contentTitleEnglish !== clean);
  if (next.length !== queue.length) {
    await videoQueueStorage.setValue(next);
    try { browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: next.length }); } catch {}
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function injectModalStyles() {
  if (document.getElementById('nt-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'nt-modal-styles';
  style.textContent = `
  #nt-modal-overlay {
  position:fixed; inset:0; background:rgba(0,0,0,.8); z-index:2147483647;
  display:flex; align-items:center; justify-content:center;
  font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
  }
  .nt-modal {
    background:#0d0d12; border:1px solid #222d42; border-radius:8px;
    width:320px; max-width:90vw; padding:20px; color:#dde4f0;
    box-shadow:0 10px 40px rgba(0,0,0,.8); box-sizing:border-box; color-scheme:dark;
  }
  .nt-modal-header {
    display:flex; align-items:center; gap:12px;
  }
  .nt-logo-sq {
    width:30px; height:30px; border:1px solid #F5B831; color:#F5B831;
    display:flex; align-items:center; justify-content:center;
    border-radius:4px; font-weight:bold; font-size:15px; box-sizing:border-box; flex-shrink:0;
  }
  .nt-title-area { display:flex; flex-direction:column; gap:4px; }
  .nt-brand-name { font-weight:bold; font-size:13px; letter-spacing:.5px; }
  .nt-badge {
    background:#3E1C1F; color:#E57373; border:1px solid #5A2A2E;
    font-size:9px; padding:2px 6px; border-radius:12px; font-weight:bold; width:max-content;
  }

  .nt-link-btn {
    background:none; border:none; color:#5a6a85; cursor:pointer;
    font-family:inherit; font-size:10px; font-weight:bold; padding:0; transition:color .2s;
  }
  .nt-link-btn:hover { color:#dde4f0; }
  .nt-link-btn.active { color:#F5B831; pointer-events:none; }

  .nt-form-group { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; width:100%; box-sizing:border-box; }
  .nt-form-group label { color:#8A8A9A; font-size:11px; font-weight:bold; letter-spacing:.5px; }
  .nt-form-group input, .nt-form-group select {
    background:#14141e; border:1px solid #222d42; color:#fff; padding:8px 12px;
    border-radius:6px; font-family:inherit; font-size:12px; outline:none;
    transition:border .2s, background .2s; box-sizing:border-box; width:100%; min-width:0;
  }
  .nt-form-group input:focus, .nt-form-group select:focus { border-color:#F5B831; background:#1a1a24; }
  .nt-form-row { display:flex; gap:12px; width:100%; }
  .nt-form-row .nt-form-group { margin-bottom:0; }
  .nt-form-row .nt-form-group:first-child { flex:0 0 90px; }
  .nt-form-row .nt-form-group:last-child  { flex:1; min-width:0; }

  .nt-modal-footer { display:flex; gap:12px; margin-top:20px; }
  .nt-modal-footer button {
    flex:1; padding:10px; border:none; border-radius:4px; font-family:inherit;
    font-weight:bold; cursor:pointer; font-size:12px; transition:opacity .2s; box-sizing:border-box;
  }
  .nt-modal-footer button:hover { opacity:.8; }
  #nt-modal-cancel { background:#1E1E28; color:#A0A0B0; }
  #nt-modal-submit { background:#F5B831; color:#111; }
  .nt-absolute-pill { position:absolute; bottom:60px; left:20px; z-index:9999; }
  `;
  document.head.appendChild(style);
}

function showNTEditModal(data: {
  channelName: string; videoTitle: string; url: string;
  totalSecs: number; showTotal: boolean; channelId: string | null;
  onToggleShowTotal: (v: boolean) => void;
}, onConfirm: (d: any) => void) {
  injectModalStyles();
  const overlay = document.createElement('div');
  overlay.id = 'nt-modal-overlay';

  const today = new Date().toISOString().split('T')[0];
  const totalMins = Math.max(1, Math.round(data.totalSecs / 60));

  overlay.innerHTML = `
  <div class="nt-modal">
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
  <div class="nt-modal-header">
  <div class="nt-logo-sq">日</div>
  <div class="nt-title-area">
  <span class="nt-brand-name">NihongoAutoTracker</span>
  <span class="nt-badge">MANUAL LOG</span>
  </div>
  </div>
  </div>

  <div style="display:flex; justify-content:flex-start; gap:10px; font-size:10px; font-weight:bold; margin-bottom:16px;">
  <span style="color:#5a6a85;">DISPLAY:</span>
  <button id="nt-badge-session" class="nt-link-btn ${!data.showTotal ? 'active' : ''}">Session Only</button>
  <span style="color:#222d42;">/</span>
  <button id="nt-badge-total" class="nt-link-btn ${data.showTotal ? 'active' : ''}">Session / Total</button>
  </div>

  <div class="nt-form-group">
  <div style="display:flex; justify-content:space-between; align-items:flex-end;">
  <label>VIDEO TITLE</label>
  <span style="font-size:9px; color:#8A8A9A; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${data.channelName.replace(/"/g, '&quot;')}">${data.channelName.replace(/</g, '&lt;')}</span>
  </div>
  <input type="text" id="nt-edit-desc" value="${data.videoTitle.replace(/"/g, '&quot;')}"/>
  </div>

  <div class="nt-form-row">
  <div class="nt-form-group">
  <label>MINUTES</label>
  <input type="number" id="nt-edit-time" value="${totalMins}" min="1"/>
  </div>
  <div class="nt-form-group">
  <label>DATE</label>
  <input type="date" id="nt-edit-date" value="${today}"/>
  </div>
  </div>

  <div class="nt-modal-footer">
  <button id="nt-modal-cancel">Cancel</button>
  <button id="nt-modal-submit">Log Video</button>
  </div>
  </div>`;

  document.body.appendChild(overlay);

  const btnSession = overlay.querySelector('#nt-badge-session')!;
  const btnTotal = overlay.querySelector('#nt-badge-total')!;

  btnSession.addEventListener('click', () => {
    btnSession.classList.add('active'); btnTotal.classList.remove('active');
    data.onToggleShowTotal(false);
  });
  btnTotal.addEventListener('click', () => {
    btnTotal.classList.add('active'); btnSession.classList.remove('active');
    data.onToggleShowTotal(true);
  });

  overlay.querySelector('#nt-modal-cancel')!.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#nt-modal-submit')!.addEventListener('click', () => {
    onConfirm({
      title: data.channelName,
      desc:  (overlay.querySelector('#nt-edit-desc') as HTMLInputElement).value,
              time:  parseInt((overlay.querySelector('#nt-edit-time')  as HTMLInputElement).value),
              date:  new Date((overlay.querySelector('#nt-edit-date')  as HTMLInputElement).value).toISOString(),
    });
    overlay.remove();
  });
}

// ── Counter ───────────────────────────────────────────────────────────────────
let watchedSecs = 0;
let completedSessionSecs = 0;
let lastSyncSecs = 0;
let lastAutoCheckSecs = 0;
let _lastCounterPaint = 0;

function getTimestampContainer(vid: HTMLVideoElement): {el: HTMLElement; isFallback: boolean} | null {
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

function ensureCounter(
  currentSecs: number,
  totalSecs: number,
  title: string,
  url: string,
  channelId: string | null,
  state: {hasTriggered: boolean},
  vid: HTMLVideoElement,
  cfg: any,
  cachedChannelName: string,
) {
  const shouldHide = cfg.hideButtons || (cfg.hideIfNotJapanese && !isLikelyJapaneseCached());
  let el = document.getElementById('nt-status-badge') as HTMLElement | null;
  if (shouldHide) { el?.remove(); return; }

  const multiSession = totalSecs > currentSecs + 2;
  const showTotal: boolean = cfg.showTotalInBadge ?? true;

  if (!el) {
    const containerData = getTimestampContainer(vid);
    if (!containerData) return;

    el = document.createElement('div');
    el.id = 'nt-status-badge';
    if (containerData.isFallback) el.classList.add('nt-absolute-pill');

    el.innerHTML = `
    <div class="nt-pill-visual-wrapper">
    <span class="nt-brand-label">NT</span>
    <span class="nt-time-label">0:00</span>
    </div>`;

    el.onclick = async () => {
      const liveCfg = await configStorage.getValue() as any;
      const liveShowTotal = liveCfg.showTotalInBadge ?? true;

      showNTEditModal(
        {
          channelName: cachedChannelName, videoTitle: title, url, totalSecs, showTotal: liveShowTotal, channelId,
          onToggleShowTotal: async (v) => {
            const c = await configStorage.getValue() as any;
            await configStorage.setValue({ ...c, showTotalInBadge: v });
          },
        },
        async final => {
          try {
            const ok = await submitLog({
              type: "video",
              mediaId: channelId || "web-video",
              description: final.desc,
              mediaData: {
                channelId: channelId || "web-video",
                channelTitle: final.title,
              },
              episodes: 0,
              time: Math.floor(final.time),
                                       pages: 0,
                                       date: new Date().toISOString(),
                                       unknownDate: false
            });

            if (ok) {
              toast(`✓ Logged: ${final.time} min`);
              await removeFromQueue(url);

              watchedSecs = 0;
              completedSessionSecs = 0;
              lastSyncSecs = 0;
              lastAutoCheckSecs = 0;
              state.hasTriggered = false;

              const badgeLabel = document.querySelector('#nt-status-badge .nt-time-label');
              if (badgeLabel) badgeLabel.textContent = "0:00";
            } else {
              toast(`⚠ API Validation Error`);
              state.hasTriggered = false;
            }
          } catch (err) {
            toast(`⚠ Send failed`);
            state.hasTriggered = false;
          }
        }
      );
    };

    containerData.el.appendChild(el);
  }

  const now = performance.now();
  if (now - _lastCounterPaint < 1000) return;
  _lastCounterPaint = now;

  const timeLabel = el.querySelector<HTMLElement>('.nt-time-label')!;
  const currentStr = fmtSecs(currentSecs);

  if (multiSession && showTotal) {
    const totalStr = fmtSecs(totalSecs);
    timeLabel.textContent = `${currentStr} / ${totalStr}`;
  } else {
    timeLabel.textContent = currentStr;
  }

  el.title = '(manually log this video)';
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default defineContentScript({
  matches:['*://*.youtube.com/*','*://music.youtube.com/*','*://*.crunchyroll.com/*','*://*.animekai.to/*'],
  cssInjectionMode: 'manifest',

  async main() {
    let cachedConfig: any = {};
    configStorage.getValue().then(c => cachedConfig = c || {});

    watchedSecs = 0;
    lastSyncSecs = 0;
    lastAutoCheckSecs = 0;
    completedSessionSecs = 0;
    let currentSessionId = crypto.randomUUID();
    const state = { hasTriggered: false };
    let trackedVideo: HTMLVideoElement | null = null;
    let currentUrl = '';
    let channelId: string | null = null;
    let cachedChannelName = '';
let playClockStart = -1;

function flushPlayClock() {
  if (playClockStart < 0) return;
  const elapsed = (performance.now() - playClockStart) / 1000;
  playClockStart = -1;
  if (elapsed > 0 && elapsed < 7200) watchedSecs += elapsed;
}

const getLiveWatched = () =>
watchedSecs + (playClockStart >= 0 ? (performance.now() - playClockStart) / 1000 : 0);

const getTotal = () => completedSessionSecs + getLiveWatched();

const attach = (vid: HTMLVideoElement) => {
  const cleanedHref = cleanUrl(window.location.href);
  if (trackedVideo === vid && currentUrl === cleanedHref) return;

  flushPlayClock();
  if (trackedVideo && watchedSecs >= 60 && currentUrl && !state.hasTriggered) {
    finalizeSession(watchedSecs, currentUrl, currentSessionId);
  }

  trackedVideo     = vid;
  currentUrl       = cleanedHref;
  watchedSecs      = 0;
  playClockStart   = -1;
  lastSyncSecs     = 0;
  lastAutoCheckSecs = 0;
  state.hasTriggered = false;
  channelId        = null;
  cachedChannelName = '';
  completedSessionSecs = 0;
  currentSessionId = crypto.randomUUID();
  invalidateJpCache();
  _lastCounterPaint = 0;
  document.getElementById('nt-status-badge')?.remove();

  const tryChannel = () => {
    if (!channelId) { const id = getYouTubeChannelId(); if (id) channelId = id; }
    if (!cachedChannelName) { const n = getChannelNameFallback(); if (n) cachedChannelName = n; }
  };
  tryChannel(); setTimeout(tryChannel, 2000); setTimeout(tryChannel, 5000); setTimeout(tryChannel, 10000);

  (async () => {
    const queue = await videoQueueStorage.getValue();
    const existing = queue.find(q => q.contentTitleEnglish === currentUrl) as any;
    if (existing) {
      const sessions: any[] = existing.sessions ?? [];
      completedSessionSecs = sessions.reduce((a: number, s: any) => a + s.secs, 0);
    }
  })();

  vid.addEventListener('playing', () => {
    playClockStart = performance.now();
  });

  const stopClock = () => { flushPlayClock(); };
  vid.addEventListener('pause',   stopClock);
  vid.addEventListener('waiting', stopClock);
  vid.addEventListener('seeking', stopClock);

  vid.addEventListener('seeked', () => {
    if (!vid.paused && !vid.ended) playClockStart = performance.now();
  });

    vid.addEventListener('timeupdate', async () => {
      const cfg = cachedConfig;

      if (!state.hasTriggered) {
        ensureCounter(getLiveWatched(), getTotal(), document.title, currentUrl, channelId, state, vid, cfg, cachedChannelName);
      }

      if (state.hasTriggered || vid.duration <= 0) return;

      const autoOn = cfg.autoSend ?? (cfg.logMode === 'auto');
      const liveSecs = getLiveWatched();

      if (!autoOn && liveSecs >= 60 && (liveSecs - lastSyncSecs) >= 10) {
        lastSyncSecs = liveSecs;
        if (isLikelyJapaneseCached() && !isMusic()) {
          await upsertQueueLive(liveSecs, document.title, cachedChannelName || getChannelNameFallback(), currentUrl, channelId, currentSessionId);
        }
      }

      if (autoOn && (liveSecs - lastAutoCheckSecs) >= 5) {
        lastAutoCheckSecs = liveSecs;
        if (isLikelyJapaneseCached() && !isMusic()) {
          const threshType  = cfg.thresholdType  ?? 'percent';
          const threshValue = cfg.thresholdValue ?? cfg.threshold ?? 95;
          const triggered   = threshType === 'percent'
          ? (vid.currentTime / vid.duration) * 100 >= threshValue
          : (liveSecs / 60) >= threshValue;
          if (triggered) {
            state.hasTriggered = true;
            const fullMins = Math.round(vid.duration / 60);

            // FIX: Map strictly identical to Video payloads created in UI
            const ok = await submitLog({
              type: 'video',
              mediaId: channelId || 'web-video',
              description: document.title,
              mediaData: {
                channelId: channelId || "web-video",
                channelTitle: cachedChannelName || getChannelNameFallback()
              },
              time: fullMins,
              date: new Date().toISOString(),
                                       private: false,
                                         episodes: 0,
                                         pages: 0,
                                         unknownDate: false
            });

            if (ok) {
              toast(`✓ Auto-logged: ${fullMins} min`);
              removeFromQueue(currentUrl);
            } else {
              toast(`⚠ Auto-log failed`);
              state.hasTriggered = false;
            }
          }
        }
      }
    });

    vid.addEventListener('ended', async () => {
      flushPlayClock();
      if (state.hasTriggered) return;
      const cfg = cachedConfig;
      const autoOn = cfg.autoSend ?? (cfg.logMode === 'auto');
      if (!autoOn && isLikelyJapaneseCached() && !isMusic() && watchedSecs >= 60) {
        await finalizeSession(watchedSecs, currentUrl, currentSessionId);
        completedSessionSecs += watchedSecs;
        watchedSecs = 0;
        currentSessionId = crypto.randomUUID();
      }
    });

    vid.addEventListener('emptied', async () => {
      flushPlayClock();
      const urlNow = cleanUrl(window.location.href);
      if (urlNow !== currentUrl) {
        if (!state.hasTriggered && watchedSecs >= 60 && isLikelyJapaneseCached() && !isMusic()) {
          await finalizeSession(watchedSecs, currentUrl, currentSessionId);
        }
        watchedSecs = 0;
        lastSyncSecs = 0;
        lastAutoCheckSecs = 0;
        state.hasTriggered = false;
        document.getElementById('nt-status-badge')?.remove();
      }
    });
};

browser.storage.onChanged.addListener((changes, area) => {
  configStorage.getValue().then(c => { if(c) cachedConfig = c; });

  if (area === 'local' && changes['videoQueue']) {
    const queue = changes['videoQueue'].newValue || [];
    const clean = cleanUrl(window.location.href);
    const exists = queue.some((q: any) => q.contentTitleEnglish === clean);
    if (!exists) {
      completedSessionSecs = 0;
      watchedSecs = 0;
      lastSyncSecs = 0;
      lastAutoCheckSecs = 0;
      const badgeLabel = document.querySelector('#nt-status-badge .nt-time-label');
      if (badgeLabel) badgeLabel.textContent = "0:00";
    }
  }
});

setInterval(async () => {
  const vid = document.querySelector<HTMLVideoElement>('video');
  if (vid) {
    attach(vid);
    if (!state.hasTriggered) {
      const cfg = cachedConfig;
      ensureCounter(getLiveWatched(), getTotal(), document.title, currentUrl, channelId, state, vid, cfg, cachedChannelName);
    }
  }
}, 2000);
  },
});
