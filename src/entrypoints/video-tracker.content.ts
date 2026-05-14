import { defineContentScript } from '#imports';
import { configStorage, videoQueueStorage, addDebugLog } from '@/utils/storage';
import { resolveVideoChannelMedia, submitLog } from '@/utils/api';
import '@/assets/player.css';

// Import the SVG as raw text and force it to be 100% of its container
import rawLogoSvg from '../../public/NihongoAutoTracker.svg?raw';
const inlineLogo = rawLogoSvg.replace(/<svg\b/i, '<svg style="width:100%;height:100%;display:block;object-fit:contain;"');

const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff]/g;

function fmtSecs(s: number): string {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

function showToast(title: string, msg: string, err = false) {
  let container = document.getElementById('nt-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'nt-toast-container';
    Object.assign(container.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483647',
      display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none'
    });
    document.body.appendChild(container);

    const style = document.createElement('style');
    style.textContent = `
    @keyframes nt-toast-deplete { from { width: 100%; } to { width: 0%; } }
    @keyframes nt-toast-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .nt-toast {
      pointer-events: auto; position: relative; overflow: hidden;
      background: #0f1a0f; color: #3ddc84; border: 1px solid rgba(61,220,132,.4);
      border-radius: 5px; padding: 12px 15px 16px 15px;
      font-family: 'Courier New', monospace; font-size: 13px;
      box-shadow: 0 4px 20px rgba(0,0,0,.6); width: 300px; box-sizing: border-box;
      display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
      transition: opacity 0.3s, transform 0.3s; animation: nt-toast-slide-in 0.3s ease-out;
      direction: ltr; text-align: left; line-height: 1.4;
    }
    .nt-toast.nt-err { background: #1a0f0f; color: #f0706a; border-color: rgba(240,112,106,.4); }
    .nt-toast-bar { position: absolute; bottom: 0; left: 0; height: 4px; background: currentColor; opacity: 0.6; animation: nt-toast-deplete 3s linear forwards; }
    .nt-toast-close { background: none; border: none; color: inherit; cursor: pointer; font-size: 16px; line-height: 1; padding: 0; opacity: 0.6; transition: opacity 0.2s; font-family: sans-serif; }
    .nt-toast-close:hover { opacity: 1; }
    .nt-toast-content { display: flex; flex-direction: column; gap: 4px; flex: 1; word-break: break-word; }
    .nt-toast-title { font-weight: bold; font-family: system-ui, -apple-system, sans-serif; font-size: 14px; }
    .nt-toast-msg { opacity: 0.9; }
    `;
    document.head.appendChild(style);
  }

  const toast = document.createElement('div');
  toast.className = `nt-toast ${err ? 'nt-err' : ''}`;
  toast.innerHTML = `
  <div class="nt-toast-content">
  ${title ? `<span class="nt-toast-title">${title}</span>` : ''}
  ${msg ? `<span class="nt-toast-msg">${msg}</span>` : ''}
  </div>
  <button class="nt-toast-close">×</button>
  <div class="nt-toast-bar"></div>
  `;
  container.appendChild(toast);

  const timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);

  toast.querySelector('.nt-toast-close')!.addEventListener('click', () => {
    clearTimeout(timeout);
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  });
}

if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
  browser.runtime.onMessage.addListener((req: any) => {
    if (req?.action === 'SHOW_TOAST') {
      const g = globalThis as any;
      if (!g.__nt_toastSink) g.__nt_toastSink = 'video';
      if (g.__nt_toastSink !== 'video') return;
      const title = String(req.title || '');
      const msg = req.message || '';
      showToast(title, msg, title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
    }
  });
}

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const v = u.searchParams.get('v');
      if (v) {
        return `https://www.youtube.com/watch?v=${v}`;
      }
    }
    return u.origin + u.pathname;
  } catch { return url; }
}

function stripVideoTitle(title: string): string {
  return title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube\s*$/i, '').trim();
}

function isMusic(): boolean {
  const host = window.location.hostname;
  if (host === 'music.youtube.com') return true;

  if (host.includes('youtube.com')) {
    const isLive = !!document.querySelector('.ytp-live, .re-live-badge, [is-live]');
    const hasMusicMetadata = !!document.querySelector('ytd-structured-description-content-renderer');
    const playerResponse = (window as any).ytInitialPlayerResponse;
    const isMusicCategory = playerResponse?.videoDetails?.categoryId === "10";

    if (isLive) return hasMusicMetadata;
    if (isMusicCategory) return true;

    const g = document.querySelector('meta[itemprop="genre"]');
    if (g?.getAttribute('content') === 'Music') return true;
    if (document.querySelector('ytd-music-watch-metadata-renderer')) return true;

    const secondaryInfo = (document.querySelector('ytd-video-secondary-info-renderer') as HTMLElement | null)?.innerText || '';
    if (secondaryInfo.includes('Auto-generated by YouTube') || secondaryInfo.includes('Provided to YouTube')) return true;
  }
  return false;
}

function isLikelyJapanese(): boolean {
  const host = window.location.hostname;
  if (host.includes('animekai') || host.includes('crunchyroll')) return true;

  if (host.includes('youtube.com')) {
    try {
      const playerResponse = (window as any).ytInitialPlayerResponse;
      const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks) {
        for (const track of tracks) if (track.languageCode === 'ja') return true;
      }
    } catch (e) {}

    const docTitle = document.title.replace(/^\(\d+\)\s*/, '');
    if ((docTitle.match(JP_RE) ??[]).length >= 1) return true;

    const titleEl = document.querySelector<HTMLElement>('#title h1 yt-formatted-string, h1.ytd-watch-metadata');
    if (titleEl && (titleEl.innerText.match(JP_RE) ??[]).length >= 1) return true;

    const channelEl = document.querySelector<HTMLElement>('#owner ytd-channel-name yt-formatted-string, ytd-channel-name a');
    if (channelEl && (channelEl.innerText.match(JP_RE) ??[]).length >= 1) return true;

    const descEl = document.querySelector<HTMLElement>('#description-inline-expander yt-attributed-string, ytd-expandable-video-description-body-renderer');
    if (descEl) {
      const sample = descEl.innerText?.slice(0, 1000) ?? '';
      if ((sample.match(JP_RE) ??[]).length >= 3) return true;
    }
  }
  return false;
}

let _jpCacheUrl = '';
let _jpCacheResult = false;
function isLikelyJapaneseCached(): boolean {
  const url = cleanUrl(window.location.href);
  if (url !== _jpCacheUrl || !_jpCacheResult) {
    _jpCacheResult = isLikelyJapanese();
    _jpCacheUrl = url;
  }
  return _jpCacheResult;
}
function invalidateJpCache() { _jpCacheUrl = ''; _jpCacheResult = false; }

// --- FIXED ROBUST CHANNEL EXTRACTORS ---
const ytApiCache: Record<string, any> = {};
const ytApiInFlight: Record<string, Promise<any>> = {};

async function fetchYouTubeVideoData(url: string) {
  const clean = cleanUrl(url);
  if (ytApiCache[clean]) return ytApiCache[clean];
  if (ytApiInFlight[clean]) return ytApiInFlight[clean];

  ytApiInFlight[clean] = (async () => {
    try {
      const res = await fetch(`https://nihongotracker.app/api/media/youtube/video?url=${encodeURIComponent(clean)}`, {
        headers: { 'accept': '*/*' }
      });
      if (res.ok) {
        const data = await res.json();
        ytApiCache[clean] = data;
        return data;
      }
    } catch (e) {
      console.error('Failed to fetch YouTube data from API:', e);
    } finally {
      delete ytApiInFlight[clean];
    }
    return null;
  })();

  return ytApiInFlight[clean];
}

async function getYouTubeChannelId(): Promise<string | null> {
  if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
    const data = await fetchYouTubeVideoData(window.location.href);
    if (data?.channel?.contentId) return data.channel.contentId;
  }

  // Fallback: strictly scoped DOM selector
  const scripts = document.getElementsByTagName('script');
  for (let i = 0; i < scripts.length; i++) {
    const text = scripts[i].textContent;
    if (text && text.includes('videoDetails')) {
      const match = text.match(/"videoDetails":\{.*?"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
      if (match) return match[1];
      }
    }

    const ownerLink = document.querySelector('#owner ytd-video-owner-renderer a[href*="/channel/"]');
    if (ownerLink) {
      const m = ownerLink.getAttribute('href')?.match(/(UC[a-zA-Z0-9_-]{22})/);
      if (m) return m[1];
    }
    return null;
  }

async function getChannelNameFallback(): Promise<string> {
  if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
    const data = await fetchYouTubeVideoData(window.location.href);
    if (data?.channel?.title) {
      return data.channel.title.contentTitleNative || data.channel.title.contentTitleEnglish || '';
    }
  }

  // Fallback: Strict DOM selector
  const ownerName = document.querySelector('#owner ytd-video-owner-renderer yt-formatted-string.ytd-channel-name');
  if (ownerName?.textContent?.trim()) return ownerName.textContent.trim();

  const scripts = document.getElementsByTagName('script');
  for (let i = 0; i < scripts.length; i++) {
    const text = scripts[i].textContent;
    if (text && text.includes('videoDetails')) {
      const match = text.match(/"videoDetails":\{.*?"author":"([^"]+)"/);
        if (match) return match[1];
      }
    }
    return '';
  }
    // ----------------------------------------

const channelMediaCache: Record<string, any> = {};
async function getChannelMediaData(chanId: string | null, fallbackTitle = '') {
  // If we don't have an ID yet, try one last time to grab it
  const currentId = chanId || await getYouTubeChannelId();
  const key = currentId || `title:${fallbackTitle}`;

  if (channelMediaCache[key]) return channelMediaCache[key];

  let media: any = {};
  try {
    // Only attempt API resolution if we have a real UC... ID
    if (currentId && currentId.startsWith('UC')) {
      media = await resolveVideoChannelMedia({ channelId: currentId, channelTitle: fallbackTitle });
    } else {
      media = await resolveVideoChannelMedia({ channelTitle: fallbackTitle });
    }
  } catch (e) {}

  const normalized = {
    channelId: currentId || media.channelId || 'web-video',
    channelTitle: fallbackTitle || media.channelTitle || 'Unknown Channel',
    ...(media.channelImage ? { channelImage: media.channelImage } : {}),
    ...(media.channelDescription ? { channelDescription: media.channelDescription } : {}),
  };
  channelMediaCache[key] = normalized;
  return normalized;
}

function reachedQueueThreshold(cfg: any, liveSecs: number, vid: HTMLVideoElement): boolean {
  const tType = cfg.queueThresholdType ?? 'time';
  const tValue = cfg.queueThresholdValue ?? 1;
  if (tType === 'percent') {
    if (!vid.duration || vid.duration <= 0) return false;
    return (vid.currentTime / vid.duration) * 100 >= tValue;
  }
  return (liveSecs / 60) >= tValue;
}

async function upsertQueueLive(secs: number, videoTitle: string, channelName: string, url: string, channelId: string | null, sessionId: string) {
  const clean = cleanUrl(url);
  const finalTitle = stripVideoTitle(videoTitle);

  let validChannelName = channelName;
  if (validChannelName === finalTitle || !validChannelName) {
    validChannelName = await getChannelNameFallback();
  }

  const queue = await videoQueueStorage.getValue();
  const idx = queue.findIndex(q => q.contentTitleEnglish === clean);
  const mediaData = await getChannelMediaData(channelId, validChannelName);

  await addDebugLog('INFO', 'VideoTracker', `Upserting queue for session`, { secs, url: clean, finalTitle, channelName, channelId });

  if (idx !== -1) {
    const item = queue[idx] as any;
    item.sessions = item.sessions ||[];

    const sIdx = item.sessions.findIndex((s: any) => s.id === sessionId);
    if (sIdx >= 0) {
      item.sessions[sIdx].secs = secs;
      item.sessions[sIdx].date = new Date().toISOString();
    } else {
      item.sessions.push({ id: sessionId, secs, date: new Date().toISOString() });
    }

    const completedSecs = item.sessions.reduce((a: number, s: any) => a + s.secs, 0);
    item.time = Math.max(1, Math.round(completedSecs / 60));
    item.description = finalTitle;
    item.contentTitleNative = channelName;
    if (channelId && !item.channelId) item.channelId = channelId;
    item.mediaData = { ...(item.mediaData || {}), ...mediaData };
    item.mediaId = item.mediaData?.channelId || item.channelId || item.mediaId || "web-video";
    delete item._currentSecs;
  } else {
    queue.push({
      id: crypto.randomUUID(),
               contentTitleNative: channelName,
               contentTitleEnglish: clean,
               time: Math.max(1, Math.round(secs / 60)),
               date: new Date().toISOString(),
               private: false, tags:[],
                 description: finalTitle,
                 sessions:[{ id: sessionId, secs, date: new Date().toISOString() }],
               channelId,
               mediaId: mediaData?.channelId || channelId || "web-video",
               mediaData,
    } as any);
  }
  await videoQueueStorage.setValue([...queue]);
  try { browser.runtime.sendMessage({ action: 'QUEUE_UPDATED', count: queue.length }); } catch {}
}

async function finalizeSession(secs: number, url: string, sessionId: string) {
  if (secs < 1) return;
  const clean = cleanUrl(url);
  await addDebugLog('INFO', 'VideoTracker', `Finalizing session metrics`, { secs, url: clean, sessionId });

  const queue = await videoQueueStorage.getValue();
  const idx = queue.findIndex(q => q.contentTitleEnglish === clean);
  if (idx === -1) return;

  const item = queue[idx] as any;
  item.sessions = item.sessions ||[];

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

function injectModalStyles() {
  if (document.getElementById('nt-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'nt-modal-styles';
  style.textContent = `
  #nt-modal-popup { z-index:2147483647; display:flex; align-items:center; justify-content:center; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; cursor:default; }
  .nt-modal {
    background:#0d0d12; border:1px solid #222d42; border-radius:8px;
    width:330px; max-width:90vw; padding:20px; color:#dde4f0;
    box-shadow:0 10px 40px rgba(0,0,0,.8); box-sizing:border-box; color-scheme:dark;
    display: flex; flex-direction: column; max-height: 85vh;
  }
  .nt-modal-header { display:flex; align-items:center; gap:12px; flex-shrink: 0; }

  /* Sleek borderless SVG container for the NT logo */
  .nt-logo-sq { width:32px; height:32px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:transparent; }
  .nt-logo-sq svg { width:100%; height:100%; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); }

  .nt-title-area { display:flex; flex-direction:column; gap:4px; }
  .nt-brand-name { font-weight:bold; font-size:13px; letter-spacing:.5px; }
  .nt-badge { background:#3E1C1F; color:#E57373; border:1px solid #5A2A2E; font-size:9px; padding:2px 6px; border-radius:12px; font-weight:bold; width:max-content; }
  .nt-link-btn { background:none; border:none; color:#5a6a85; cursor:pointer; font-family:inherit; font-size:10px; font-weight:bold; padding:0; transition:color .2s; }
  .nt-link-btn:hover { color:#dde4f0; }
  .nt-link-btn.active { color:#F5B831; pointer-events:none; }

  /* --- FORM STYLING --- */
  .nt-form-group { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; width:100%; box-sizing:border-box; flex-shrink: 0; }
  .nt-form-group label { color:#8A8A9A; font-size:11px; font-weight:bold; letter-spacing:.5px; }
  .nt-form-group input, .nt-form-group select { background:#14141e; border:1px solid #222d42; color:#fff; padding:8px 12px; border-radius:6px; font-family:inherit; font-size:12px; outline:none; transition:border .2s, background .2s; box-sizing:border-box; width:100%; min-width:0; }
  .nt-form-group input:focus { border-color:#F5B831; background:#1a1a24; }

  /* --- CUSTOM NUMBER INPUT SPINNER --- */
  .nt-form-group input[type=number]::-webkit-inner-spin-button,
  .nt-form-group input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  .nt-form-group input[type=number] { -moz-appearance:textfield; }

  .nt-number-wrapper {
    position:relative; display:flex; width:100%; background:#14141e; border:1px solid #222d42;
    border-radius:6px; box-sizing:border-box; overflow:hidden; transition:border .2s, background .2s;
  }
  .nt-number-wrapper:focus-within { border-color:#F5B831; background:#1a1a24; }
  .nt-number-wrapper input {
    border:none !important; background:transparent !important; border-radius:0 !important;
    padding-right:0 !important; flex:1; outline:none !important; min-width:0; box-shadow:none !important;
  }
  .nt-spin-btns {
    display:flex; flex-direction:column; width:26px; border-left:1px solid #222d42; background:#14141e;
  }
  .nt-spin-btns button {
    flex:1; background:transparent; border:none; color:#5a6a85; cursor:pointer; display:flex;
    align-items:center; justify-content:center; transition:color 0.15s, background 0.15s; padding:0; margin:0;
  }
  .nt-spin-btns button:hover { color:#dde4f0; background:#1e1e28; }
  #nt-spin-up { border-bottom:1px solid #222d42; }

  .nt-form-row { display:flex; gap:12px; width:100%; flex-shrink: 0; }
  .nt-form-row .nt-form-group { margin-bottom:0; flex: 1; }

  .nt-modal-footer { display:flex; gap:12px; margin-top:20px; flex-shrink: 0; }
  .nt-modal-footer button { flex:1; padding:10px; border:none; border-radius:4px; font-family:inherit; font-weight:bold; cursor:pointer; font-size:12px; transition:opacity .2s; box-sizing:border-box; }
  .nt-modal-footer button:hover { opacity:.8; }
  #nt-modal-cancel { background:#1E1E28; color:#A0A0B0; }
  #nt-modal-submit { background:#F5B831; color:#111; }

  /* --- CUSTOM AMBER CHECKBOX --- */
  .nt-modal-opt { display:flex; align-items:center; gap:8px; margin-top:14px; font-size:11px; color:#a9b4c8; flex-shrink: 0; }
  .nt-pl-chk {
    -webkit-appearance:none; appearance:none; width:16px; height:16px; border:1.5px solid #5a6a85;
    border-radius:3px; background:#14141e; cursor:pointer; position:relative; display:inline-block;
    flex-shrink:0; margin:0; outline:none; transition:all 0.15s ease;
  }
  .nt-pl-chk:checked { background:#F5B831; border-color:#F5B831; }
  .nt-pl-chk:checked::after {
    content:''; position:absolute; left:4px; top:1px; width:4px; height:8px;
    border:solid white; border-width:0 2.2px 2.2px 0; transform:rotate(45deg);
  }

  /* --- CUSTOM SCROLLBAR (Fixed Overlap) --- */
  #nt-playlist-modal-list {
  padding-right: 24px !important;
  margin-right: 0 !important;
  scrollbar-width: thin;
  scrollbar-color: #222d42 transparent;
  box-sizing: border-box;
  }
  #nt-playlist-modal-list::-webkit-scrollbar {
  width: 6px;
  }
  #nt-playlist-modal-list::-webkit-scrollbar-track {
  background: transparent;
  }
  #nt-playlist-modal-list::-webkit-scrollbar-thumb {
  background: #222d42;
  border-radius: 10px;
  }
  #nt-playlist-modal-list::-webkit-scrollbar-thumb:hover {
  background: #F5B831;
  }

  .pl-vid-row {
    width: 100%;
    box-sizing: border-box;
  }

  .pl-scroll-title {
    scrollbar-width: none !important; /* Firefox */
    -ms-overflow-style: none !important; /* IE/Edge */
  }
  .pl-scroll-title::-webkit-scrollbar {
    display: none !important; /* Chrome/Safari/Webkit */
  }

  .nt-btn-amber { background:#F5B831 !important; color:#111 !important; border:none !important; }
  .nt-btn-ghost { background:transparent !important; color:#a9b4c8 !important; border:1px solid #222d42 !important; }
  .nt-btn-ghost:hover { color:#dde4f0 !important; border-color:#5a6a85 !important; }
  `;
  document.head.appendChild(style);
}

function localTodayISODate(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function dateInputToISO(dateStr: string): string {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(dateStr || '');
  if (!m) return new Date().toISOString();
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const now = new Date();
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), 0, 0).toISOString();
}

function showNTEditModal(badgeEl: HTMLElement, data: { channelName: string; videoTitle: string; url: string; totalSecs: number; videoDurationSecs: number; showTotal: boolean; channelId: string | null; onToggleShowTotal: (v: boolean) => void; }, onConfirm: (d: any) => Promise<void> | void, onClose?: (submitted: boolean) => void) {
  injectModalStyles();
  const existingPopup = document.getElementById('nt-modal-popup');
  if (existingPopup) {
    const closer = (existingPopup as any).__ntCloseModal as ((submitted: boolean) => void) | undefined;
    if (typeof closer === 'function') closer(false);
    else existingPopup.remove();
    return;
  }

  const popup = document.createElement('div');
  popup.id = 'nt-modal-popup';
  const today = localTodayISODate();

  // Calculate default minutes using the full video duration
  const totalMins = Math.max(1, Math.round(data.videoDurationSecs / 60));

  popup.innerHTML = `
  <div class="nt-modal">
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
  <div class="nt-modal-header">
  <div class="nt-logo-sq" style="border:none; display:flex; align-items:center; justify-content:center;">
  ${inlineLogo}
  </div>
  <div class="nt-title-area"><span class="nt-brand-name">NihongoAutoTracker</span><span class="nt-badge">MANUAL LOG</span></div>
  </div>
  </div>

  <div style="display:flex; justify-content:flex-start; gap:10px; font-size:10px; font-weight:bold; margin-bottom:16px;">
  <span style="color:#5a6a85;">DISPLAY:</span>
  <button id="nt-badge-session" class="nt-link-btn ${!data.showTotal ? 'active' : ''}">Session Only</button>
  <span style="color:#222d42;">|</span>
  <button id="nt-badge-total" class="nt-link-btn ${data.showTotal ? 'active' : ''}">Session / Total</button>
  </div>

  <div class="nt-form-group">
  <div style="display:flex; justify-content:space-between; align-items:flex-end;">
  <label>VIDEO TITLE</label><span style="font-size:9px; color:#8A8A9A; max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${data.channelName.replace(/"/g, '&quot;')}">${data.channelName.replace(/</g, '&lt;')}</span>
  </div>
  <input type="text" id="nt-edit-desc" value="${data.videoTitle.replace(/"/g, '&quot;')}"/>
  </div>

  <div class="nt-form-row">
  <div class="nt-form-group">
  <label>MINUTES</label>
  <div class="nt-number-wrapper">
  <input type="number" id="nt-edit-time" value="${totalMins}" min="1"/>
  <div class="nt-spin-btns">
  <button type="button" id="nt-spin-up">
  <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5L5 1L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  <button type="button" id="nt-spin-down">
  <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  </div>
  </div>
  </div>
  <div class="nt-form-group"><label>DATE</label><input type="date" id="nt-edit-date" value="${today}"/></div>
  </div>

  <div class="nt-modal-opt">
  <input type="checkbox" id="nt-clear-sessions" class="nt-pl-chk" />
  <label for="nt-clear-sessions">Clear sessions with this log</label>
  </div>

  <div class="nt-modal-footer">
  <button id="nt-modal-cancel">Cancel</button><button id="nt-modal-submit">Log Video</button>
  </div>
  </div>`;

  popup.addEventListener('click', e => e.stopPropagation());

  let closed = false;
  let closeListener: ((e: Event) => void) | null = null;
  const closeModal = (submitted: boolean) => {
    if (closed) return;
    closed = true;
    if (closeListener) document.removeEventListener('click', closeListener);
    popup.remove();
    if (onClose) onClose(submitted);
  };
    (popup as any).__ntCloseModal = closeModal;
    document.body.appendChild(popup);

    const rect = badgeEl.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.bottom = `${window.innerHeight - rect.top + 10}px`;
    popup.style.left = `${rect.left}px`;

    requestAnimationFrame(() => {
      const popRect = popup.getBoundingClientRect();
      if (popRect.left < 0) popup.style.left = '10px';
      if (popRect.right > window.innerWidth) popup.style.left = `${window.innerWidth - popRect.width - 10}px`;
    });

    const btnSession = popup.querySelector('#nt-badge-session')!;
    const btnTotal = popup.querySelector('#nt-badge-total')!;
    btnSession.addEventListener('click', () => { btnSession.classList.add('active'); btnTotal.classList.remove('active'); data.onToggleShowTotal(false); });
    btnTotal.addEventListener('click', () => { btnTotal.classList.add('active'); btnSession.classList.remove('active'); data.onToggleShowTotal(true); });
    popup.querySelector('#nt-modal-cancel')!.addEventListener('click', () => closeModal(false));

    // Connect Custom Spinners
    const timeInput = popup.querySelector('#nt-edit-time') as HTMLInputElement;
    popup.querySelector('#nt-spin-up')!.addEventListener('click', () => {
      timeInput.value = String(Number(timeInput.value || 0) + 1);
    });
    popup.querySelector('#nt-spin-down')!.addEventListener('click', () => {
      timeInput.value = String(Math.max(1, Number(timeInput.value || 0) - 1));
    });

    // Handle Submission with instant text feedback
    const submitBtn = popup.querySelector('#nt-modal-submit') as HTMLButtonElement;
    submitBtn.addEventListener('click', async () => {
      submitBtn.textContent = 'Logging...';
      submitBtn.style.opacity = '0.7';
      submitBtn.style.pointerEvents = 'none';
      popup.querySelector('#nt-modal-cancel')?.setAttribute('disabled', 'true');

      const timeRaw = Number(timeInput.value);
      const timeVal = Math.max(1, Number.isFinite(timeRaw) ? timeRaw : 1);
      const dateRaw = (popup.querySelector('#nt-edit-date') as HTMLInputElement).value;
      const dateIso = dateRaw ? dateInputToISO(dateRaw) : new Date().toISOString();
      const clearSessions = !!(popup.querySelector('#nt-clear-sessions') as HTMLInputElement | null)?.checked;

      // Awaiting onConfirm guarantees we hold the UI loading state until the API call yields
      await onConfirm({ title: data.channelName, desc: (popup.querySelector('#nt-edit-desc') as HTMLInputElement).value, time: timeVal, date: dateIso, clearSessions });
      closeModal(true);
    });

    setTimeout(() => {
      closeListener = (e: Event) => { if (!popup.contains(e.target as Node) && !badgeEl.contains(e.target as Node)) closeModal(false); };
      document.addEventListener('click', closeListener);
    }, 0);
}

let watchedSecs = 0, completedSessionSecs = 0, lastSyncSecs = 0, lastAutoCheckSecs = 0, _lastCounterPaint = 0;

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
    const el = document.querySelector('.plyr__controls__item.plyr__time--current') || document.querySelector('.jw-controlbar-left-group');
    if (el) return { el: el as HTMLElement, isFallback: false };
  }
  const fallback = document.querySelector('.video-player-container') || document.querySelector('#movie_player') || document.querySelector('.plyr__video-wrapper') || document.querySelector('.jw-media') || vid.parentElement;
  if (fallback) return { el: fallback as HTMLElement, isFallback: true };
  return null;
}

function ensureCounter(currentSecs: number, totalSecs: number, title: string, url: string, channelId: string | null, state: {hasTriggered: boolean; isManualLogging: boolean}, vid: HTMLVideoElement, cfg: any, cachedChannelName: string, onReset: () => void) {
  const shouldHide = cfg.hideButtons || (cfg.hideIfNotJapanese && !isLikelyJapaneseCached()) || (cfg.hideMusic && isMusic());
  let el = document.getElementById('nt-status-badge') as HTMLElement | null;
  if (shouldHide) { el?.remove(); return; }

  const multiSession = totalSecs > currentSecs + 2;
  const showTotal: boolean = cfg.showTotalInBadge ?? true;

  if (!el) {
    const containerData = getTimestampContainer(vid);
    if (!containerData) return;
    el = document.createElement('div');
    el.id = 'nt-status-badge';
    el.style.position = 'relative';
    el.style.cursor = 'pointer';

    // Add Flex layout to guarantee exact center alignment regardless of parent
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.height = '100%';
    el.style.padding = '0 6px';

    if (containerData.isFallback) el.classList.add('nt-absolute-pill');

    el.innerHTML = `<div class="nt-pill-visual-wrapper" style="display:flex; align-items:center; gap:6px;">
    <div class="nt-badge-logo" style="width:18px; height:18px; flex-shrink:0; pointer-events:none; display:flex; align-items:center; justify-content:center;">
    ${inlineLogo}
    </div>
    <span class="nt-time-label">0:00</span>
    </div>`;

    el.onclick = async (e) => {
      if ((e.target as HTMLElement).closest('#nt-modal-popup')) return;
      const existingPopup = document.getElementById('nt-modal-popup');
      if (existingPopup) {
        const closer = (existingPopup as any).__ntCloseModal as ((submitted: boolean) => void) | undefined;
        if (typeof closer === 'function') closer(false);
        else existingPopup.remove();
        return;
      }
      if (state.isManualLogging) return;
      state.isManualLogging = true;

      const liveCfg = await configStorage.getValue() as any;
      const liveShowTotal = liveCfg.showTotalInBadge ?? true;
      const channelName = cachedChannelName || await getChannelNameFallback();

      let finalTitle = stripVideoTitle(document.title);

      if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
        const data = await fetchYouTubeVideoData(window.location.href);
        if (data?.video?.title) {
          finalTitle = data.video.title.contentTitleNative || data.video.title.contentTitleEnglish || finalTitle;
        }
      }

      addDebugLog('INFO', 'VideoTracker', `Opening Manual Log Overlay`, {
        videoTitle: finalTitle,
        currentSecs,
        totalSecs
      });

      // Pass videoDurationSecs as vid.duration (fallback to totalSecs if broken or zero)
      showNTEditModal(el!, {
        channelName,
        videoTitle: finalTitle,
        url,
        totalSecs,
        videoDurationSecs: vid.duration && !isNaN(vid.duration) && vid.duration > 0 ? vid.duration : totalSecs,
                      showTotal: liveShowTotal,
                      channelId,
                      onToggleShowTotal: async (v) => { const c = await configStorage.getValue() as any; await configStorage.setValue({ ...c, showTotalInBadge: v }); }
      }, async final => {
        try {
          state.hasTriggered = true;
          const mediaData = await getChannelMediaData(channelId, final.title);
          const ok = await submitLog({ type: "video", mediaId: mediaData.channelId || channelId || "web-video", description: final.desc, mediaData, episodes: 0, time: Math.floor(final.time), pages: 0, date: final.date || new Date().toISOString(), unknownDate: false });
          if (ok) {
            if (final.clearSessions) { await removeFromQueue(url); onReset(); } else state.hasTriggered = false;
          } else state.hasTriggered = false;
        } catch (err) { state.hasTriggered = false; }
      }, (submitted) => { state.isManualLogging = false; if (!submitted) state.hasTriggered = false; });
    };
    containerData.el.appendChild(el);
  }

  const now = performance.now();
  if (now - _lastCounterPaint < 1000) return;
  _lastCounterPaint = now;

  const timeLabel = el.querySelector<HTMLElement>('.nt-time-label')!;
  const currentStr = fmtSecs(currentSecs);
  timeLabel.textContent = (multiSession && showTotal) ? `${currentStr} / ${fmtSecs(totalSecs)}` : currentStr;
  el.title = 'Log this video manually';
}

async function showPlaylistSelectorModal(btn: HTMLElement, isInline: boolean) {
  injectModalStyles();
  const existing = document.getElementById('nt-playlist-modal');
  if (existing) { existing.remove(); return; }

  // Target the primary container so we don't accidentally grab right-sidebar recommendations
  const parent = isInline
  ? document.querySelector('ytd-playlist-panel-renderer')
  : (document.querySelector('ytd-two-column-browse-results-renderer #primary') || document.body);

  // Added support for podcast/course grids (ytd-rich-grid-media)
  const rendererSelector = isInline
  ? 'ytd-playlist-panel-video-renderer'
  : 'ytd-playlist-video-renderer, ytd-rich-item-renderer, ytd-rich-grid-media, ytd-compact-video-renderer';

  const items = Array.from(parent?.querySelectorAll(rendererSelector) || []);

  let hideNonJp = (await configStorage.getValue() as any).playlistHideNonJapanese ?? true;

  const videos = items.map(el => {
    const titleEl = el.querySelector('#video-title');
    const titleText = titleEl?.textContent?.trim() || 'Unknown';
    // Added specific fallback for podcast grid links (a#video-title-link)
    const urlEl = el.querySelector('a#wc-endpoint') || el.querySelector('a#video-title-link') || el.querySelector('a');
    const lengthEl = el.querySelector('ytd-thumbnail-overlay-time-status-renderer') || el.querySelector('.badge-shape-wiz__text');

    let domTime = 1;
    const timeText = lengthEl?.textContent?.trim() || "";
    const parts = timeText.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0])) domTime = Math.max(1, Math.round((parts[0]*60 + parts[1])/60));
    else if (parts.length === 3 && !isNaN(parts[0])) domTime = Math.max(1, Math.round((parts[0]*3600 + parts[1]*60 + parts[2])/60));

    const url = urlEl?.getAttribute('href') || '';
    const idMatch = url.match(/[?&]v=([^&]+)/);

    return {
      title: titleText,
      url: url,
      id: idMatch ? idMatch[1] : null,
      time: domTime,
      isJp: (titleText.match(JP_RE) || []).length > 0,
                           channelId: null as string | null,
                           channelTitle: null as string | null,
                           channelImage: null as string | null,
                           channelDesc: null as string | null
    };
  }).filter(v => v.id);

  if (videos.length === 0) { showToast("Playlist Error", "No valid videos found in playlist", true); return; }

  const modal = document.createElement('div');
  modal.id = 'nt-playlist-modal';
  modal.className = 'nt-modal';
  modal.innerHTML = `
  <div class="nt-modal-header" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
  <div style="display:flex; gap:12px; align-items:center;">
  <div class="nt-logo-sq" style="border:none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); display:flex; align-items:center; justify-content:center;">
  ${inlineLogo}
  </div>
  <div class="nt-title-area"><span class="nt-brand-name">Log Playlist Videos</span></div>
  </div>
  <div id="pl-top-actions" style="display:flex; gap:10px;">
  <button id="pl-toggle-jp" style="background:none; border:none; color:#a9b4c8; font-size:10px; cursor:pointer; font-weight:bold; font-family:inherit;">${hideNonJp ? 'Show Non-JP' : 'Hide Non-JP'}</button>
  <button id="pl-toggle-all" style="background:none; border:none; color:#FFB800; font-size:10px; cursor:pointer; font-weight:bold; font-family:inherit;">Select All</button>
  </div>
  </div>

  <!-- GAP FIXED: Reduced margin-bottom from 16px to 8px -->
  <div id="nt-playlist-modal-list" style="max-height:300px; overflow-y:auto; overflow-x:hidden; margin-bottom:8px; display:flex; flex-direction:column; gap:4px; flex-shrink:1;">
  ${videos.map((v, i) => `
    <label class="pl-vid-row" id="pl-row-${i}" style="display:${hideNonJp && !v.isJp ? 'none' : 'flex'}; gap:4px; align-items:center; font-size:11px; cursor:pointer; padding:3px 0; width:100%; box-sizing:border-box;">
    <input type="checkbox" class="nt-pl-chk pl-vid-chk" data-idx="${i}" style="margin:0; flex-shrink:0; width:14px; height:14px;" />

    <!-- Tighter Enumeration with Dot -->
    <span style="font-family:ui-monospace,SFMono-Regular,monospace; color:#8A8A9A; width:14px; text-align:right; flex-shrink:0; font-size:10px; margin-right:2px;">${i + 1}.</span>

    <!-- Title Container (Fade added dynamically via JS below) -->
    <div class="pl-scroll-title" id="pl-title-${i}" style="flex:1; overflow-x:auto; white-space:nowrap; padding: 2px 0; font-size:11px; scrollbar-width:none; -ms-overflow-style:none;">
    ${v.title.replace(/</g, '&lt;')}
    </div>

    <span id="pl-time-${i}" style="color:#FFB800; font-family:ui-monospace,SFMono-Regular,monospace; flex-shrink:0; text-align:right; font-weight:bold; font-size:10px; min-width:32px;">...</span>
    </label>
    `).join('')}
    </div>

    <!-- GAP FIXED: Reduced padding and margin-bottom -->
    <div id="nt-playlist-confirm-layer" style="display:none; flex-direction:column; align-items:center; gap:12px; margin-bottom:8px; padding:10px 0; text-align:center; flex-shrink:0;">
    <div style="font-size:14px; color:#dde4f0; font-weight:bold;">Confirm Logging</div>
    <div style="font-size:12px; color:#a9b4c8;">Are you sure you want to log <span id="pl-confirm-count" style="color:#F5B831; font-weight:bold;">0</span> videos directly?</div>
    </div>

    <!-- GAP FIXED: Added margin-top: 4px to override global 20px -->
    <div class="nt-modal-footer" id="pl-footer-main" style="margin-top: 4px;">
    <button id="pl-cancel" class="nt-btn-ghost">Cancel</button><button id="pl-submit" class="nt-btn-amber">Log Selected</button>
    </div>

    <div class="nt-modal-footer" id="pl-footer-confirm" style="display:none; margin-top: 4px;">
    <button id="pl-confirm-no" class="nt-btn-ghost">Go Back</button><button id="pl-confirm-yes" class="nt-btn-amber">Yes, Log Them</button>
    </div>`;

    document.body.appendChild(modal);

    const titleEls = modal.querySelectorAll('.pl-scroll-title');
    titleEls.forEach((el) => {
      const updateMask = () => {
        const isOverflowing = el.scrollWidth > el.clientWidth;
        if (!isOverflowing) {
          (el as HTMLElement).style.webkitMaskImage = 'none';
          (el as HTMLElement).style.maskImage = 'none';
          return;
        }

        const maxScrollLeft = el.scrollWidth - el.clientWidth;
        const scrollLeft = el.scrollLeft;

        const atStart = scrollLeft <= 2;
        const atEnd = scrollLeft >= maxScrollLeft - 2;

        if (atStart) {
          (el as HTMLElement).style.webkitMaskImage = 'linear-gradient(to right, black 85%, transparent 100%)';
          (el as HTMLElement).style.maskImage = 'linear-gradient(to right, black 85%, transparent 100%)';
        } else if (atEnd) {
          (el as HTMLElement).style.webkitMaskImage = 'linear-gradient(to right, transparent 0%, black 15%)';
          (el as HTMLElement).style.maskImage = 'linear-gradient(to right, transparent 0%, black 15%)';
        } else {
          (el as HTMLElement).style.webkitMaskImage = 'linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)';
          (el as HTMLElement).style.maskImage = 'linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)';
        }
      };

      const observer = new ResizeObserver(() => updateMask());
      observer.observe(el);
      el.addEventListener('scroll', updateMask, { passive: true });
      updateMask();
    });

    const rect = btn.getBoundingClientRect();
    modal.style.position = 'fixed';
    modal.style.top = isInline ? `${rect.bottom + 10}px` : `${rect.bottom + 20}px`;
    modal.style.left = isInline ? `${rect.left - 240}px` : `${rect.left}px`;
    modal.style.zIndex = '2147483647';

    requestAnimationFrame(() => {
      const popRect = modal.getBoundingClientRect();
      if (popRect.right > window.innerWidth) modal.style.left = `${window.innerWidth - popRect.width - 20}px`;
      if (popRect.left < 0) modal.style.left = '20px';
    });

      const clickOutsideHandler = (e: MouseEvent) => {
        if (!modal.contains(e.target as Node) && !btn.contains(e.target as Node)) {
          modal.remove();
          document.removeEventListener('click', clickOutsideHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', clickOutsideHandler), 10);

      videos.forEach(async (v, i) => {
        try {
          // FIXED: Replaced truncated code ".id}" with full template string
          const data = await fetchYouTubeVideoData(`https://www.youtube.com/watch?v=${v.id}`);
          if (data?.video?.episodeDuration) v.time = Math.max(1, data.video.episodeDuration);
          if (data?.channel?.contentId) {
            v.channelId = data.channel.contentId;
            v.channelTitle = data.channel.title?.contentTitleNative || data.channel.title?.contentTitleEnglish;
            v.channelImage = data.channel.contentImage;
            v.channelDesc = data.channel.description?.[0]?.description;
          }
        } catch (e) {}
        const timeEl = modal.querySelector(`#pl-time-${i}`);
        if (timeEl) timeEl.textContent = `${v.time} min`;
      });

      modal.querySelector('#pl-toggle-jp')!.addEventListener('click', (e) => {
        hideNonJp = !hideNonJp;
        (e.target as HTMLElement).textContent = hideNonJp ? 'Show Non-JP' : 'Hide Non-JP';
      videos.forEach((v, i) => {
        const row = modal.querySelector(`#pl-row-${i}`) as HTMLElement;
        if (row) row.style.display = (hideNonJp && !v.isJp) ? 'none' : 'flex';
      });
      });

      let allSelected = false;
      modal.querySelector('#pl-toggle-all')!.addEventListener('click', (e) => {
        allSelected = !allSelected;
        const chks = modal.querySelectorAll('.pl-vid-chk') as NodeListOf<HTMLInputElement>;
        chks.forEach(c => {
          const row = c.closest('label');
          if (row && row.style.display !== 'none') c.checked = allSelected;
        });
          (e.target as HTMLElement).textContent = allSelected ? 'Unselect All' : 'Select All';
      });

      modal.querySelector('#pl-cancel')!.addEventListener('click', () => {
        document.removeEventListener('click', clickOutsideHandler);
        modal.remove();
      });

      modal.querySelector('#pl-submit')!.addEventListener('click', () => {
        const checked = Array.from(modal.querySelectorAll('.pl-vid-chk:checked'));
        if(checked.length === 0) return;

        modal.querySelector('#pl-top-actions')!.setAttribute('style', 'display:none !important');
        modal.querySelector('#nt-playlist-modal-list')!.setAttribute('style', 'display:none !important');
        modal.querySelector('#pl-footer-main')!.setAttribute('style', 'display:none !important');

        modal.querySelector('#pl-confirm-count')!.textContent = String(checked.length);
        modal.querySelector('#nt-playlist-confirm-layer')!.setAttribute('style', 'display:flex; flex-direction:column; align-items:center; gap:12px; margin-bottom:16px; padding:20px 0; text-align:center;');
        modal.querySelector('#pl-footer-confirm')!.setAttribute('style', 'display:flex; gap:12px; margin-top:20px;');
      });

      modal.querySelector('#pl-confirm-no')!.addEventListener('click', () => {
        modal.querySelector('#pl-top-actions')!.setAttribute('style', 'display:flex; gap:10px;');
        modal.querySelector('#nt-playlist-modal-list')!.setAttribute('style', 'max-height:300px; overflow-y:auto; overflow-x:hidden; margin-bottom:16px; display:flex; flex-direction:column; gap:8px;');
        modal.querySelector('#pl-footer-main')!.setAttribute('style', 'display:flex; gap:12px; margin-top:20px;');

        modal.querySelector('#nt-playlist-confirm-layer')!.setAttribute('style', 'display:none !important');
        modal.querySelector('#pl-footer-confirm')!.setAttribute('style', 'display:none !important');
      });

      modal.querySelector('#pl-confirm-yes')!.addEventListener('click', async () => {
        document.removeEventListener('click', clickOutsideHandler);
        const checked = Array.from(modal.querySelectorAll('.pl-vid-chk:checked')).map((c: any) => videos[c.dataset.idx]);

        const yesBtn = modal.querySelector('#pl-confirm-yes')!;
        yesBtn.textContent = 'Logging...';
        yesBtn.setAttribute('disabled', 'true');
        modal.querySelector('#pl-confirm-no')!.setAttribute('disabled', 'true');

        let successCount = 0;
        const fallbackChanName = await getChannelNameFallback();
        const fallbackChanId = await getYouTubeChannelId();

        for(const v of checked) {
          const finalChanId = v.channelId || fallbackChanId || "web-video";
          const finalChanTitle = v.channelTitle || fallbackChanName || "Unknown Channel";

          const specificMediaData = {
            channelId: finalChanId,
            channelTitle: finalChanTitle,
            ...(v.channelImage ? { channelImage: v.channelImage } : {}),
                                                               ...(v.channelDesc ? { channelDescription: v.channelDesc } : {})
          };

          const ok = await submitLog({
            type: 'video', mediaId: finalChanId,
            description: stripVideoTitle(v.title), mediaData: specificMediaData,
                                     time: v.time, date: new Date().toISOString(),
                                     private: false, episodes: 0, pages: 0, unknownDate: false
          });
          if(ok === true || (ok as any)?.success) successCount++;
        }
        showToast('Success', `Logged ${successCount}/${checked.length} videos`);
        modal.remove();
      });
}

export default defineContentScript({
  matches:['*://*.youtube.com/*','*://music.youtube.com/*','*://*.crunchyroll.com/*','*://*.animekai.to/*'],
  cssInjectionMode: 'manifest',
  async main() {
    let cachedConfig: any = await configStorage.getValue() || {};
    let currentSessionId = crypto.randomUUID();
    const state = { hasTriggered: false, isManualLogging: false };
    let trackedVideo: HTMLVideoElement | null = null;
    let currentUrl = '', channelId: string | null = null, cachedChannelName = '';
    let playClockStart = -1;

    function flushPlayClock() {
      if (playClockStart < 0) return;
      const elapsed = (performance.now() - playClockStart) / 1000;
      playClockStart = -1;
      if (elapsed > 0 && elapsed < 7200) watchedSecs += elapsed;
    }

    const getLiveWatched = () => watchedSecs + (playClockStart >= 0 ? (performance.now() - playClockStart) / 1000 : 0);
    const getTotal = () => completedSessionSecs + getLiveWatched();

    const resetSession = () => {
      flushPlayClock();
      watchedSecs = 0; completedSessionSecs = 0; lastSyncSecs = 0; lastAutoCheckSecs = 0;
      currentSessionId = crypto.randomUUID(); state.hasTriggered = false; state.isManualLogging = false;
      playClockStart = (trackedVideo && !trackedVideo.paused && !trackedVideo.ended && trackedVideo.readyState > 2) ? performance.now() : -1;
      const badgeLabel = document.querySelector('#nt-status-badge .nt-time-label');
      if (badgeLabel) badgeLabel.textContent = "0:00";
    };

      const attach = (vid: HTMLVideoElement) => {
        const cleanedHref = cleanUrl(window.location.href);

        if (currentUrl === cleanedHref && trackedVideo === vid) {
          return;
        }

        // --- ONLY IF IT IS TRULY A NEW VIDEO ---
        addDebugLog('INFO', 'VideoTracker', `New Video Context Detected`, { url: cleanedHref });

        flushPlayClock();
        if (trackedVideo && watchedSecs >= 60 && currentUrl && !state.hasTriggered) {
          finalizeSession(watchedSecs, currentUrl, currentSessionId);
        }

        trackedVideo = vid; currentUrl = cleanedHref; watchedSecs = 0; playClockStart = -1;
        lastSyncSecs = 0; lastAutoCheckSecs = 0; state.hasTriggered = false; state.isManualLogging = false;
        channelId = null; cachedChannelName = ''; completedSessionSecs = 0;
        currentSessionId = crypto.randomUUID(); invalidateJpCache(); _lastCounterPaint = 0;
        document.getElementById('nt-status-badge')?.remove();

        const tryChannel = async () => {
          const foundId = await getYouTubeChannelId();
          const foundName = await getChannelNameFallback();

          if (foundId && foundId !== channelId) {
            channelId = foundId;
            addDebugLog('INFO', 'VideoTracker', `Channel ID Discovered`, { channelId: foundId });
          }

          if (foundName && foundName !== cachedChannelName) {
            cachedChannelName = foundName;
            addDebugLog('INFO', 'VideoTracker', `Channel Name Discovered`, { channelName: foundName });
          }
        };

        // Immediately try, then poll for a few seconds as YouTube loads metadata
        tryChannel();
        let pollCount = 0;
        const poll = setInterval(async () => {
          await tryChannel();
          if ((channelId && cachedChannelName) || pollCount++ > 20) clearInterval(poll);
        }, 500);

        (async () => {
          const queue = await videoQueueStorage.getValue();
          const existing = queue.find(q => q.contentTitleEnglish === currentUrl) as any;
          if (existing) completedSessionSecs = (existing.sessions ||[]).reduce((a: number, s: any) => a + s.secs, 0);
        })();

          if (!vid.paused && !vid.ended && vid.readyState > 2) playClockStart = performance.now();
          vid.addEventListener('playing', () => playClockStart = performance.now());
        vid.addEventListener('play', () => { playClockStart = performance.now(); if (vid.currentTime < 5) state.hasTriggered = false; });
        const stopClock = () => { flushPlayClock(); };
        vid.addEventListener('pause', stopClock); vid.addEventListener('waiting', stopClock); vid.addEventListener('seeking', stopClock);
        vid.addEventListener('seeked', () => { if (vid.currentTime < 5) state.hasTriggered = false; if (!vid.paused && !vid.ended) playClockStart = performance.now(); });

        vid.addEventListener('timeupdate', async () => {
          const cfg = cachedConfig;
          if (!state.hasTriggered) ensureCounter(getLiveWatched(), getTotal(), document.title, currentUrl, channelId, state, vid, cfg, cachedChannelName, resetSession);
          if (state.hasTriggered || vid.duration <= 0 || state.isManualLogging) return;

          const autoOn = cfg.autoSend ?? (cfg.logMode === 'auto');
          const liveSecs = getLiveWatched();

          if (!autoOn && reachedQueueThreshold(cfg, liveSecs, vid) && (liveSecs - lastSyncSecs) >= 10) {
            lastSyncSecs = liveSecs;
            if (isLikelyJapaneseCached() && !isMusic()) {
              const chName = cachedChannelName || await getChannelNameFallback();
              await upsertQueueLive(liveSecs, document.title, chName, currentUrl, channelId, currentSessionId);
            }
          }

          if (autoOn && (liveSecs - lastAutoCheckSecs) >= 5) {
            lastAutoCheckSecs = liveSecs;
            if (isLikelyJapaneseCached() && !isMusic()) {
              const threshType = cfg.thresholdType ?? 'percent';
              const threshValue = cfg.thresholdValue ?? cfg.threshold ?? 95;
              const triggered = threshType === 'percent' ? (vid.currentTime / vid.duration) * 100 >= threshValue : (liveSecs / 60) >= threshValue;
              if (triggered) {
                state.hasTriggered = true;
                const sessionMins = Math.max(1, Math.round(liveSecs / 60));
                const chName = cachedChannelName || await getChannelNameFallback();
                const mediaData = await getChannelMediaData(channelId, chName);
                const finalTitle = stripVideoTitle(document.title);

                const ok = await submitLog({
                  type: 'video', mediaId: mediaData.channelId || channelId || "web-video",
                  description: finalTitle, mediaData, time: sessionMins, date: new Date().toISOString(),
                                           private: false, episodes: 0, pages: 0, unknownDate: false
                });

                if (ok) { removeFromQueue(currentUrl); resetSession(); } else state.hasTriggered = false;
              }
            }
          }
        });

        vid.addEventListener('ended', async () => {
          flushPlayClock();
          if (state.hasTriggered) return;
          const cfg = cachedConfig;
          const autoOn = cfg.autoSend ?? (cfg.logMode === 'auto');
          if (!autoOn && isLikelyJapaneseCached() && !isMusic() && reachedQueueThreshold(cfg, watchedSecs, vid)) {
            await finalizeSession(watchedSecs, currentUrl, currentSessionId);
            completedSessionSecs += watchedSecs; watchedSecs = 0; currentSessionId = crypto.randomUUID();
          }
        });

        vid.addEventListener('emptied', async () => {
          flushPlayClock();
          const urlNow = cleanUrl(window.location.href);
          if (urlNow !== currentUrl) {
            if (!state.hasTriggered && watchedSecs >= 1 && isLikelyJapaneseCached() && !isMusic()) await finalizeSession(watchedSecs, currentUrl, currentSessionId);
            watchedSecs = 0; lastSyncSecs = 0; lastAutoCheckSecs = 0; state.hasTriggered = false;
            document.getElementById('nt-status-badge')?.remove();
          }
        });
      };

      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes['config']) {
          configStorage.getValue().then(c => {
            if(c) {
              cachedConfig = c;
              const badge = document.getElementById('nt-status-badge');
              if (badge) {
                const shouldHide = c.hideButtons || (c.hideIfNotJapanese && !isLikelyJapaneseCached()) || (c.hideMusic && isMusic());
                if (shouldHide) badge.remove();
              }
            }
          });
        }
        if (area === 'local' && changes['videoQueue']) {
          const queue = Array.isArray(changes['videoQueue'].newValue) ? changes['videoQueue'].newValue :[];
          const clean = cleanUrl(window.location.href);
          if (!queue.some((q: any) => q.contentTitleEnglish === clean)) {
            completedSessionSecs = 0; watchedSecs = 0; lastSyncSecs = 0; lastAutoCheckSecs = 0; state.hasTriggered = false;
            if (!trackedVideo?.paused && !trackedVideo?.ended && (trackedVideo?.readyState ?? 0) > 2) playClockStart = performance.now();
            const badgeLabel = document.querySelector('#nt-status-badge .nt-time-label');
            if (badgeLabel) badgeLabel.textContent = "0:00";
          }
        }
      });

      // --- REPLACEMENT FOR PERFORMANT INJECTION ---
      const runInjectionCycle = () => {
        const vid = document.querySelector<HTMLVideoElement>('video');
        if (vid) attach(vid);

        if (cachedConfig.enablePlaylistLogger !== false) {
          // Strictly standard YouTube playlist containers
          const containers = [
            document.querySelector('ytd-playlist-header-renderer .metadata-buttons-wrapper'),
            document.querySelector('ytd-playlist-panel-renderer #playlist-action-menu #top-level-buttons-computed')
          ].filter(Boolean);

          containers.forEach(container => {
            if (container && !container.querySelector('.nt-playlist-logger')) {
              const btn = document.createElement('button');
              btn.className = 'nt-playlist-logger style-scope ytd-menu-renderer';
              btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="#F5B831"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM10 5.5v9l6-4.5-6-4.5z"/></svg>`;

              Object.assign(btn.style, {
                background: 'transparent', border: 'none', cursor: 'pointer', margin: '0 4px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '40px', height: '40px', borderRadius: '50%', transition: 'background-color 0.2s'
              });

              btn.onmouseenter = () => btn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
              btn.onmouseleave = () => btn.style.backgroundColor = 'transparent';
              btn.onclick = (e) => {
                e.stopPropagation();
                showPlaylistSelectorModal(btn, container.closest('ytd-playlist-panel-renderer') !== null);
              };

              // Insert at start for best visibility
              container.insertBefore(btn, container.firstChild);
            }
          });
        }
      };

      // Debounce the injection to keep YouTube snappy
      let timer: number | null = null;
      const trigger = () => {
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(runInjectionCycle, 500);
      };

      trigger();
      window.addEventListener('yt-navigate-finish', trigger);

      const observer = new MutationObserver((mutations) => {
        if (mutations.some(m => m.addedNodes.length > 0)) trigger();
      });

      // Observe only the main content area for maximum performance
      const root = document.querySelector('ytd-app') || document.body;
      observer.observe(root, { childList: true, subtree: true });
      // ---------------------------------------------
  },
});
