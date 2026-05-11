import { defineContentScript } from '#imports';
import { configStorage, readingQueueStorage, ttuHistoryStorage, ttuLinkStorage } from '@/utils/storage';
import '@/assets/overlay.css';
import { submitLog } from '@/utils/api';

const SKIP_HOSTS_DEFAULT =['youtube.com','youtu.be','crunchyroll.com','animekai.to','music.youtube.com','nihongotracker.app', 'mail.google.com', 'mail.proton.me'];
const JP_DOMAINS_DEFAULT =[
  'nhk.or.jp','nhk.jp','news.yahoo.co.jp','yomiuri.co.jp','asahi.com','mainichi.jp',
'nikkei.com','tokyoreporter.com','watanoc.com','aozora.gr.jp','syosetu.com','kakuyomu.jp',
'pixiv.net','nicovideo.jp','comic-walker.com','manga-raw.club','jisho.org',
'wanikani.com','bunpro.jp','satorireader.com',
];
const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff]/g;
const TTU_HOSTS =['reader.ttsu.app', 'app.yatsu.moe', 'manga.manabe.es'];

const DEFAULT_TITLE_REGEXES =[
  { desc: "YomiYasu Prefix (e.g., 'YomiYasu - Title 1')", re: "^YomiYasu\\s*-\\s*(.*?)\\s+(?:v|vol|第)?(\\d+)" },
  { desc: "Publisher/Label Trailing (e.g., 'Title 18 (MFブックス)')", re: "^(.*?)\\s+(?:v|vol|第)?(\\d+)\\s*(?:巻)?\\s*\\([^)]+\\)$" },
  { desc: "Volume Format 第X巻 (e.g., 'Title 第2巻')", re: "^(.*?)\\s+第(\\d+)巻$" },
  { desc: "Volume Format vX (e.g., 'Title v1')", re: "^(.*?)\\s+v(\\d+)$" },
  { desc: "Standard Space Number (e.g., 'Title 1')", re: "^(.*?)\\s+(\\d+)$" }
];

let currentConfig: any = {};
let websiteOverlayDismissed = false;

function getReaderConfig(cfg: any) {
  const host = window.location.hostname;
  const autoSave = cfg.readerAutoSave ?? cfg.ttuAutoSave ?? true;
  const directSend = cfg.readerDirectSend ?? cfg.ttuDirectSend ?? false;

  if (host.includes('app.yatsu.moe')) {
    return { enabled: cfg.yatsuEnabled ?? true, autoSave, directSend };
  }
  if (host.includes('manga.manabe.es')) {
    return { enabled: cfg.manabeEnabled ?? true, autoSave, directSend };
  }
  return { enabled: cfg.ttuEnabled ?? true, autoSave, directSend };
}

function isWebsiteOverlaySkipped(cfg: any): boolean {
  const host = window.location.hostname;
  const skipSites: string[] = cfg?.skipSites ??['youtube.com', 'youtu.be', 'crunchyroll.com', 'animekai.to', 'music.youtube.com', 'nihongotracker.app'];
  if (SKIP_HOSTS_DEFAULT.some(h => host.includes(h))) return true;
  if (skipSites.some((h: string) => host.includes(h))) return true;
  return false;
}

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

let globalSessionStartChar = -1;
let globalManualCharOffset = 0;
let globalLastTick = Date.now();
let isSyncing = false;

function getTTUTitle() {
  let title = document.title;
  // If running inside an iframe (like Manabe), grab the top-level title safely
  try {
    if (window.self !== window.top && window.top) {
      title = window.top.document.title || title;
    }
  } catch (e) {} // Ignore cross-origin issues just in case
  title = title.replace(/\s*\|\s*(ッツ Ebook Reader|Yatsu Reader|Manabe Reader)\s*/i, '');
  title = title.replace(/\s*[–—-]\s*ttu.*$/i, '');
  return title.trim() || document.title;
}

function parseTitle(docTitle: string) {
  let title = docTitle;
  let volume: number | undefined = undefined;

  if (/^\d+$/.test(docTitle)) return { query: docTitle, volume: undefined };

  const regexes = currentConfig.titleRegexes ?? DEFAULT_TITLE_REGEXES;

  for (const item of regexes) {
    try {
      const regex = new RegExp(item.re, 'i');
      const match = docTitle.match(regex);
      if (match && match[1]) {
        title = match[1].trim();
        if (match[2]) volume = parseInt(match[2], 10);
        return { query: title, volume };
      }
    } catch(e) {}
  }

  // Fallback if none match:
  const fallback = docTitle.match(/^(.*?[a-zA-Z\u3040-\u30ff\u4e00-\u9fff]+.*?)(\d+)$/);
  if (fallback) {
    title = fallback[1].trim();
    volume = parseInt(fallback[2], 10);
  }
  return { query: title, volume };
}

function extractTTUCharCount(): number | null {
  try {
    const readerContainer = document.querySelector('.book-content') ||
    document.querySelector('[data-ref="container"]') ||
    document.querySelector('.reader-container') ||
    document.querySelector('article') ||
    document.body;

    // Use semantic tags to avoid the "div slicing" issue in paginated mode
    const pTags = Array.from(readerContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')).filter(el => {
      if (el.closest('#nt-ttu-chrono-wrapper, nav, .menu, header')) return false;
      return (el.textContent || '').trim().length > 0;
    });

    if (pTags.length === 0) return null;

    const writingMode = getComputedStyle(readerContainer).writingMode || getComputedStyle(document.body).writingMode;
    const isVerticalRL = writingMode === 'vertical-rl';
    const isVerticalLR = writingMode === 'vertical-lr';
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let exploredChars = 0;
    let debugTextList: string[] =[];

    const getCleanedData = (node: Element) => {
      let text = '';
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (n.parentElement?.closest('rt, rp')) continue; // Ignore Furigana
        text += n.nodeValue || '';
      }

      // STRICT PUNCTUATION DELETE: Keep only Letters (\p{L}) and Numbers (\p{N}).
      // This removes brackets, periods, tildes (～), etc.
      const matches = text.match(/[\p{L}\p{N}]/gu) ||[];
      return {
        count: matches.length,
        chars: matches.join('')
      };
    };

    const isWhispersyncActive = document.querySelector("[class^='ttu-whispersync-line-highlight-']") !== null;

    for (let i = 0; i < pTags.length; i++) {
      const el = pTags[i];
      const rect = el.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) continue;

      let isExplored = false;

      if (isVerticalRL) {
        // TRAILING EDGE (Vertical RL):
        // In TTU, read text moves to the RIGHT.
        // A block is "read" only when its LEFT edge has passed the RIGHT side of the screen.
        isExplored = rect.left >= (vw - 10);
      } else if (isVerticalLR) {
        // Text leaves through the left
        isExplored = rect.right <= 10;
      } else {
        // TRAILING EDGE (Horizontal):
        // Text moves up. A block is "read" when its BOTTOM edge has passed the TOP of the screen.
        isExplored = rect.bottom <= 10;
      }

      if (isExplored) {
        const data = getCleanedData(el);
        if (data.count > 0) {
          exploredChars += data.count;
          debugTextList.push(data.chars);
        }
      } else if (isWhispersyncActive) {
        // Partially explored <p>, accurately check inner whispersync chunks to allow live counting
        const wSpans = Array.from(el.querySelectorAll("[class^='ttu-whispersync-line-highlight-']")).filter(
          span => !span.parentElement?.closest("[class^='ttu-whispersync-line-highlight-']")
        );

        for (let j = 0; j < wSpans.length; j++) {
          const span = wSpans[j];
          const spanRect = span.getBoundingClientRect();

          if (spanRect.width === 0 || spanRect.height === 0) continue;

          let isSpanExplored = false;

          if (isVerticalRL) {
            isSpanExplored = spanRect.left >= (vw - 10);
          } else if (isVerticalLR) {
            isSpanExplored = spanRect.right <= 10;
          } else {
            isSpanExplored = spanRect.bottom <= 10;
          }

          if (isSpanExplored) {
            const data = getCleanedData(span);
            if (data.count > 0) {
              exploredChars += data.count;
              debugTextList.push(data.chars);
            }
          }
        }
      }
    }

    return exploredChars;
  } catch (err) {
    return null;
  }
}

async function liveSyncQueue() {
  if (isSyncing || (ttuState.timeMs === 0 && ttuState.chars === 0)) return;
  isSyncing = true;

  try {
    const title = getTTUTitle();
    const dateStr = new Date().toISOString();
    const secs = Math.round(ttuState.timeMs / 1000);

    const queue = await readingQueueStorage.getValue();
    let existing = queue.find(q => q.originalTitle === title || q.contentTitleNative === title);

    const linkMap = await ttuLinkStorage.getValue() || {};
    const linkedMedia = linkMap[title];

    if (!existing) {
      existing = {
        id: crypto.randomUUID(), type: 'reading', contentTitleNative: title, contentTitleEnglish: '',
        originalTitle: title, description: title, chars: ttuState.chars, time: secs,
        date: dateStr, private: false, tags:[],
        sessions:[{ id: ttuState.id, secs: secs, chars: ttuState.chars, date: dateStr }]
      };
      queue.push(existing);
    } else {
      existing.originalTitle = existing.originalTitle || title;
      existing.sessions = existing.sessions ||[];
      const sIdx = existing.sessions.findIndex((s:any) => s.id === ttuState.id);

      if (sIdx >= 0) {
        existing.sessions[sIdx].secs = secs;
        existing.sessions[sIdx].chars = ttuState.chars;
        existing.sessions[sIdx].date = dateStr;
      } else {
        existing.sessions.push({ id: ttuState.id, secs: secs, chars: ttuState.chars, date: dateStr });
      }

      existing.chars = existing.sessions.reduce((acc: any, s: any) => acc + s.chars, 0);
      existing.time = existing.sessions.reduce((acc: any, s: any) => acc + s.secs, 0);
    }

    if (linkedMedia) {
      existing.mediaId = linkedMedia.mediaId;
      existing.mediaData = linkedMedia.mediaData;
      existing.volume = linkedMedia.volume;
      existing.contentTitleNative = linkedMedia.mediaData.contentTitleNative || existing.contentTitleNative;
      existing.contentTitleEnglish = linkedMedia.mediaData.contentTitleEnglish || existing.contentTitleEnglish;
      existing.description = linkedMedia.mediaData.contentTitleNative || existing.contentTitleNative;
    }

    await readingQueueStorage.setValue(queue);
  } finally {
    isSyncing = false;
  }
}

async function saveSessionAndQueue() {
  if (ttuState.timeMs === 0 && ttuState.chars === 0) return;

  const title = getTTUTitle();
  const dateStr = new Date().toISOString();
  const secs = Math.round(ttuState.timeMs / 1000);
  const sessionLog = { id: ttuState.id, date: dateStr, timeMs: ttuState.timeMs, chars: ttuState.chars };

  const history = await ttuHistoryStorage.getValue() || {};
  if (!history[title]) history[title] = [];
  history[title].push(sessionLog);
  await ttuHistoryStorage.setValue(history);

  await liveSyncQueue();

  // Reset State
  ttuState.id = crypto.randomUUID();
  ttuState.timeMs = 0;
  ttuState.chars = 0;
  const currentCount = extractTTUCharCount();
  globalSessionStartChar = currentCount !== null ? currentCount : -1;
  globalManualCharOffset = 0;
  ttuState.running = false;

  showToast(`Session queued!`);
}

function injectTTUStyles() {
  if (typeof document === 'undefined' || document.getElementById('nt-ttu-styles')) return;
  const s = document.createElement('style');
  s.id = 'nt-ttu-styles';
  s.textContent = `
  #nt-ttu-chrono-wrapper { position: relative; display: flex; z-index: 40; font-family: sans-serif; align-items: center; justify-content: center; flex-shrink: 0; width: 2rem; height: 100%; }
  #nt-ttu-chrono-btn { background: transparent; border: none; cursor: pointer; display: flex; padding: 0; width: 100%; height: 100%; color: #f0b429; transition: opacity 0.15s ease; align-items: center; justify-content: center; user-select: none; }
  #nt-ttu-chrono-btn:hover { opacity: 0.7; color: #ffcc33 !important; }
  #nt-ttu-chrono-btn:active { transform: scale(0.92); }
  #nt-ttu-chrono-btn svg { width: 1.7rem; height: 1.7rem; fill: currentColor; }

  #nt-ttu-dropdown { position: absolute; bottom: 100%; left: 0 !important; right: auto !important; margin-bottom: 8px; background: #252525; border: 1px solid #3a3a3a; border-radius: 6px; width: 280px; color: #ececec; box-shadow: 0 8px 24px rgba(0,0,0,0.8); display: none; flex-direction: column; overflow: hidden; writing-mode: horizontal-tb; text-align: left; direction: ltr; transform-origin: bottom left !important; cursor: default; }
  #nt-ttu-dropdown.open { display: flex; }

  .nt-ttu-dd-section { padding: 12px; text-align: center; }
  .nt-ttu-dd-title { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }

  .nt-ttu-stats-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; }
  .nt-ttu-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
  .nt-ttu-stat-label { font-size: 10px; color: #999; }
  .nt-ttu-stat-val { font-family: monospace; font-size: 14px; color: #fff; cursor: pointer; padding: 2px 6px; border-radius: 4px; border: 1px solid transparent; transition: background 0.2s; text-align: center; }
  .nt-ttu-stat-val:hover { background: #333; border-color: #555; }
  .nt-ttu-stat-val.no-hover { cursor: default; }
  .nt-ttu-stat-val.no-hover:hover { background: transparent; border-color: transparent; }

  .nt-ttu-controls { display: flex; gap: 8px; justify-content: center; }
  .nt-ttu-btn-icon { background: transparent; color: #aaa; border: none; padding: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; border-radius: 50%; }
  .nt-ttu-btn-icon:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #fff; }
  .nt-ttu-btn-icon.primary { color: #f0b429; }
  .nt-ttu-btn-icon.primary:hover:not(:disabled) { background: rgba(240,180,41,0.15); color: #ffcc33; }
  .nt-ttu-btn-icon svg { width: 18px; height: 18px; fill: currentColor; }

  .nt-ttu-linker { margin-top: 12px; border-top: 1px solid #3a3a3a; padding-top: 12px; }
  .nt-ttu-link-compact { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px; color: #3ddc84; padding: 4px 6px; border-radius: 4px; transition: background .15s; background: rgba(61,220,132,0.05); }
  .nt-ttu-link-compact-inner { display: flex; align-items: center; gap: 6px; cursor: pointer; flex: 1; }
  .nt-ttu-link-compact-inner:hover { opacity: 0.8; }
  .nt-ttu-unlink-btn { background: none; border: none; color: #f0706a; cursor: pointer; padding: 2px; display: flex; align-items: center; opacity: 0.6; transition: opacity .15s; }
  .nt-ttu-unlink-btn:hover { opacity: 1; }
  .nt-ttu-vol-pill { background: transparent; border: none; color: #f0b429; font-family: monospace; font-size: 11px; padding: 0 6px; cursor: pointer; opacity: .95; }
  .nt-ttu-vol-pill:hover { opacity: 1; }
  .nt-ttu-vol-pill:active { transform: scale(0.98); }
  .nt-ttu-link-compact-inner svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }

  .nt-ttu-link-edit { display: flex; flex-direction: column; gap: 6px; position: relative; }
  .nt-ttu-link-edit-row { display: flex; align-items: center; gap: 6px; width: 100%; }
  .nt-ttu-link-vol-anchor { display: flex; align-items: center; flex: 0 0 auto; }
  .nt-ttu-link-wrap { display: flex; align-items: center; background: #1a1a1a; border: 1px solid #444; border-radius: 4px; padding: 0 6px; outline: none !important; flex: 1; min-width: 0; max-width: 100%; box-sizing: border-box; }
  .nt-ttu-link-wrap:focus-within { border-color: #f0b429; box-shadow: 0 0 0 1px transparent; }
  .nt-ttu-link-wrap svg { width: 12px; height: 12px; stroke: #999; stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .nt-ttu-link-input { flex: 1; min-width: 0; background: transparent; border: none; color: #fff; font-family: monospace; font-size: 11px; padding: 6px; outline: none !important; }
  .nt-ttu-link-input:focus { outline: none !important; box-shadow: none !important; }
  .nt-ttu-vol-input { width: 36px; background: transparent; border: none; border-bottom: 1px solid rgba(240,180,41,.45); color: #f0b429; font-family: monospace; font-size: 11px; text-align: right; outline: none !important; padding: 0 2px; }
  .nt-ttu-vol-input:focus { border-bottom-color: rgba(240,180,41,.9); }
  .nt-ttu-link-results { display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; display: none; }
  .nt-ttu-link-results.open { display: flex; }
  .nt-ttu-link-item { display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; border-radius: 4px; transition: background .15s; text-align: left; }
  .nt-ttu-link-item:hover { background: #333; }
  .nt-ttu-link-cover { width: 20px; height: 30px; object-fit: cover; border-radius: 2px; }
  .nt-ttu-link-info { display: flex; flex-direction: column; overflow: hidden; flex: 1; }
  .nt-ttu-link-t { font-size: 10px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .nt-ttu-history { border-top: 1px solid #3a3a3a; font-size: 12px; }
  .nt-ttu-history summary { padding: 10px 12px; cursor: pointer; color: #aaa; outline: none; user-select: none; transition: background 0.2s; }
  .nt-ttu-history summary:hover { background: #2f2f2f; color: #fff; }
  .nt-ttu-history-list { max-height: 140px; overflow-y: auto; padding: 0 12px 12px 12px; display: flex; flex-direction: column; gap: 4px; }
  .nt-ttu-history-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #bbb; background: #1c1c1c; padding: 6px 8px; border-radius: 4px; }
  .nt-ttu-history-del { background: none; border: none; color: #f0706a; cursor: pointer; font-size: 12px; line-height: 1; padding: 0 2px; opacity: .75; }
  .nt-ttu-history-del:hover { opacity: 1; }
  `;
  document.head.appendChild(s);
}

function setupTTUChronometer() {
  if (typeof document === 'undefined') return;

  if ((window as any).ntChronoInterval) {
    clearInterval((window as any).ntChronoInterval);
  }

  const oldWrapper = document.getElementById('nt-ttu-chrono-wrapper');
  if (oldWrapper) oldWrapper.remove();

  const pt = findTTUInsertPoint();
  if (!pt) return;

  injectTTUStyles();

  const wrapper = document.createElement('div');
  wrapper.id = 'nt-ttu-chrono-wrapper';
  wrapper.innerHTML = `
  <button id="nt-ttu-chrono-btn" title="Click to open Tracker Menu or Double Click to toggle Tracker">
  <svg viewBox="0 0 24 24"><path id="nt-ttu-main-icon-path" d="M8 5v14l11-7z"/></svg>
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
  <div class="nt-ttu-stat">
  <span class="nt-ttu-stat-label">Speed</span>
  <span class="nt-ttu-stat-val no-hover" id="nt-ttu-val-speed">0 c/m</span>
  </div>
  </div>
  <div class="nt-ttu-controls">
  <button class="nt-ttu-btn-icon" id="nt-ttu-btn-toggle" title="Play/Pause"><svg viewBox="0 0 24 24"><path id="nt-ttu-play-path" d="M8 5v14l11-7z"/></svg></button>
  <button class="nt-ttu-btn-icon" id="nt-ttu-btn-reset" title="Reset Session"><svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
  <button class="nt-ttu-btn-icon primary" id="nt-ttu-btn-log" title="Save & Queue"><svg viewBox="0 0 24 24"><path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg></button>
  <button class="nt-ttu-btn-icon primary" id="nt-ttu-btn-direct" title="Match media to send directly" disabled style="opacity: 0.3; cursor: not-allowed;"><svg style="width: 16px; height: 16px;" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
  </div>

  <div class="nt-ttu-linker" id="nt-ttu-linker-sec">
  <div class="nt-ttu-link-compact" id="nt-ttu-link-compact" style="display:none">
  <div class="nt-ttu-link-compact-inner" id="nt-ttu-link-label-wrap" title="Click to edit">
  <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>
  <span id="nt-ttu-link-label">Linked to AniList</span>
  </div>
  <button type="button" id="nt-ttu-vol-pill" class="nt-ttu-vol-pill" title="Volume">Vol 1</button>
  <button id="nt-ttu-unlink-btn" class="nt-ttu-unlink-btn" title="Unlink Media">
  <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
  </button>
  </div>
  <div class="nt-ttu-link-edit" id="nt-ttu-link-edit">
  <div class="nt-ttu-link-edit-row">
  <div class="nt-ttu-link-wrap">
  <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
  <input type="text" id="nt-ttu-link-input" class="nt-ttu-link-input" placeholder="Search AniList..." spellcheck="false"/>
  </div>
  <div class="nt-ttu-link-vol-anchor" id="nt-ttu-vol-anchor"></div>
  </div>
  <div class="nt-ttu-link-results" id="nt-ttu-link-results"></div>
  </div>
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
  <div class="nt-ttu-stat">
  <span class="nt-ttu-stat-label">Avg Speed</span>
  <span class="nt-ttu-stat-val no-hover" id="nt-ttu-total-speed" style="color:#f0b429;">0 c/m</span>
  </div>
  </div>
  </div>

  <details class="nt-ttu-history" id="nt-ttu-history-wrap">
  <summary>Past Sessions History</summary>
  <div class="nt-ttu-history-list" id="nt-ttu-history-list"></div>
  </details>
  </div>
  `;

  wrapper.addEventListener('click', e => e.stopPropagation());
  wrapper.addEventListener('dblclick', e => e.stopPropagation());
  const dropdown = wrapper.querySelector('#nt-ttu-dropdown')!;
  dropdown.addEventListener('click', e => e.stopPropagation());

  const btn = wrapper.querySelector('#nt-ttu-chrono-btn')!;
  const toggleBtn = wrapper.querySelector('#nt-ttu-btn-toggle')!;
  const timeVal = wrapper.querySelector('#nt-ttu-val-time')!;
  const charsVal = wrapper.querySelector('#nt-ttu-val-chars')!;
  const speedVal = wrapper.querySelector('#nt-ttu-val-speed')!;
  const totalSpeedVal = wrapper.querySelector('#nt-ttu-total-speed')!;
  const btnLog = wrapper.querySelector('#nt-ttu-btn-log') as HTMLButtonElement;
  const btnDirect = wrapper.querySelector('#nt-ttu-btn-direct') as HTMLButtonElement;

  const linkerCompact = wrapper.querySelector('#nt-ttu-link-compact') as HTMLElement;
  const linkerLabelWrap = wrapper.querySelector('#nt-ttu-link-label-wrap') as HTMLElement;
  const linkerEdit = wrapper.querySelector('#nt-ttu-link-edit') as HTMLElement;
  const linkLabel = wrapper.querySelector('#nt-ttu-link-label') as HTMLElement;
  const linkInput = wrapper.querySelector('#nt-ttu-link-input') as HTMLInputElement;
  const linkResults = wrapper.querySelector('#nt-ttu-link-results') as HTMLElement;
  const volPill = wrapper.querySelector('#nt-ttu-vol-pill') as HTMLButtonElement;
  const volAnchor = wrapper.querySelector('#nt-ttu-vol-anchor') as HTMLElement;

  // Prevent drag/scroll interaction bugs inside results
  linkResults.addEventListener('mousedown', e => e.preventDefault());
  linkResults.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

  // Isolate keyboard input so typing won't trigger reader shortcuts
  ['keydown', 'keyup', 'keypress'].forEach(evt => {
    linkInput.addEventListener(evt, e => e.stopPropagation());
  });

  const historyList = wrapper.querySelector('#nt-ttu-history-list') as HTMLElement;
  if (historyList) {
    historyList.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  }

  let cachedHistoryMins = 0;
  let cachedHistoryChars = 0;

  if (globalSessionStartChar === -1) {
    globalSessionStartChar = extractTTUCharCount() || 0;
  }

  const escapeHtml = (unsafe: string) => (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const refreshLinkerUI = async () => {
    const title = getTTUTitle();
    const links = await ttuLinkStorage.getValue() || {};
    const match = links[title];

    if (match && match.mediaId) {
      linkerEdit.style.display = 'none';
      linkerCompact.style.display = 'flex';
      linkLabel.textContent = match.mediaData.contentTitleNative || 'Linked';
      linkInput.value = match.mediaData.contentTitleNative || parseTitle(title).query; // keep populated
      const v = Math.max(1, Number(match.volume || 1));
      volPill.textContent = `Vol ${v}`;
      const unlinkBtn = linkerCompact.querySelector('#nt-ttu-unlink-btn');
      if (unlinkBtn && volPill.parentElement !== linkerCompact) {
        linkerCompact.insertBefore(volPill, unlinkBtn);
      }

      if (getReaderConfig(currentConfig).directSend) {
        btnDirect.disabled = false;
        btnDirect.style.opacity = '1';
        btnDirect.style.cursor = 'pointer';
        btnDirect.title = 'Send session to NT directly';
      } else {
        btnDirect.disabled = true;
        btnDirect.style.opacity = '0.3';
        btnDirect.style.cursor = 'not-allowed';
        btnDirect.title = 'Direct send disabled in settings';
      }
    } else {
      linkerEdit.style.display = 'flex';
      linkerCompact.style.display = 'none';
      linkInput.value = parseTitle(title).query;
      const { volume } = parseTitle(title);
      const v = Math.max(1, Number(volume || Number((volPill.textContent || '').replace(/\D/g, '')) || 1));
      volPill.textContent = `Vol ${v}`;
      if (volAnchor && volPill.parentElement !== volAnchor) {
        volAnchor.appendChild(volPill);
      }

      btnDirect.disabled = true;
      btnDirect.style.opacity = '0.3';
      btnDirect.style.cursor = 'not-allowed';
      btnDirect.title = 'Match media to send directly';
    }
  };

  const getVolFromPill = () => {
    const n = Number((volPill.textContent || '').replace(/\D/g, ''));
    return Math.max(1, Number.isFinite(n) && n > 0 ? n : 1);
  };

  volPill.addEventListener('click', async (e) => {
    e.stopPropagation();
    if ((volPill as any)._editing) return;
    (volPill as any)._editing = true;

    const current = getVolFromPill();
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.className = 'nt-ttu-vol-input';
    input.value = String(current);

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

      const title = getTTUTitle();
      const links = await ttuLinkStorage.getValue() || {};
      if (links[title]) {
        links[title].volume = next;
        await ttuLinkStorage.setValue(links);
      }

      const queue = await readingQueueStorage.getValue();
      const existing = queue.find((q: any) => q.originalTitle === title || q.contentTitleNative === title);
      if (existing) {
        existing.volume = next;
        await readingQueueStorage.setValue(queue);
      }
    };

    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        void commit().finally(cleanup);
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cleanup();
      }
    });
    input.addEventListener('blur', () => { void commit().finally(cleanup); });
  });

  linkerLabelWrap.addEventListener('click', () => {
    linkerCompact.style.display = 'none';
    linkerEdit.style.display = 'flex';
  if (volAnchor && volPill.parentElement !== volAnchor) {
    volAnchor.appendChild(volPill);
  }
  linkInput.focus();
  });

  wrapper.querySelector('#nt-ttu-unlink-btn')!.addEventListener('click', async (e) => {
    e.stopPropagation();
    const title = getTTUTitle();
    const links = await ttuLinkStorage.getValue() || {};
    delete links[title];
    await ttuLinkStorage.setValue(links);

    const queue = await readingQueueStorage.getValue();
    const existing = queue.find((q:any) => q.originalTitle === title || q.contentTitleNative === title);
    if (existing) {
      existing.mediaId = 'web-reading';
      existing.mediaData = null;
      await readingQueueStorage.setValue(queue);
    }

    refreshLinkerUI();
  });

  let linkDebounce: any;
  const performLinkSearch = () => {
    clearTimeout(linkDebounce);
    const query = linkInput.value.trim();
    if (query.length < 2) { linkResults.classList.remove('open'); return; }

    linkDebounce = setTimeout(async () => {
      linkResults.innerHTML = '<div style="padding:4px;text-align:center;font-size:10px;color:#aaa">Searching...</div>';
      linkResults.classList.add('open');

      try {
        const res = await fetch(`https://nihongotracker.app/api/media/anilist/search?search=${encodeURIComponent(query)}&type=MANGA&page=1&perPage=5&format=NOVEL`, {
          headers: { 'X-API-Key': currentConfig.apiKey ?? '' }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const results = Array.isArray(data) ? data : (data.data ??[]);

        if (results.length === 0) {
          linkResults.innerHTML = '<div style="padding:4px;text-align:center;font-size:10px;color:#aaa">No results found</div>';
          return;
        }

        linkResults.innerHTML = '';
    results.forEach((m: any) => {
      const row = document.createElement('div');
      row.className = 'nt-ttu-link-item';
      const native = m.title?.contentTitleNative || m.contentTitleNative || 'Unknown';
      const img = m.coverImage || m.contentImage || '';

    row.innerHTML = `
    ${img ? `<img class="nt-ttu-link-cover" src="${img}" />` : `<div class="nt-ttu-link-cover" style="background:#444"></div>`}
    <div class="nt-ttu-link-info"><div class="nt-ttu-link-t">${escapeHtml(native)}</div></div>
    `;

    row.addEventListener('click', async () => {
      const title = getTTUTitle();
      const { volume } = parseTitle(title);
      const selectedVolume = Math.max(1, getVolFromPill() || volume || 1);
      volPill.textContent = `Vol ${selectedVolume}`;

      const links = await ttuLinkStorage.getValue() || {};
      links[title] = {
        mediaId: m.contentId,
        volume: selectedVolume,
        mediaData: {
          contentId: m.contentId,
          contentTitleNative: native,
          contentTitleEnglish: m.title?.contentTitleEnglish || m.contentTitleEnglish || '',
          contentTitleRomaji: m.title?.contentTitleRomaji || m.contentTitleRomaji,
          contentImage: img,
          coverImage: img,
          chapters: m.chapters,
          volumes: m.volumes,
        }
      };
      await ttuLinkStorage.setValue(links);

      const queue = await readingQueueStorage.getValue();
      const existing = queue.find(q => q.originalTitle === title || q.contentTitleNative === title);
      if (existing) {
        existing.mediaId = m.contentId;
        existing.volume = selectedVolume;
        existing.mediaData = links[title].mediaData;
        existing.contentTitleNative = native;
        existing.contentTitleEnglish = m.title?.contentTitleEnglish || m.contentTitleEnglish || '';
        existing.description = native;
        await readingQueueStorage.setValue(queue);
      }

      linkResults.classList.remove('open');
      refreshLinkerUI();

      if (ttuState.timeMs > 0 || ttuState.chars > 0) liveSyncQueue();
    });
      linkResults.appendChild(row);
    });
      } catch {
        linkResults.innerHTML = '<div style="padding:4px;text-align:center;font-size:10px;color:#f0706a">Search failed</div>';
      }
    }, 400);
  };

  linkInput.addEventListener('input', performLinkSearch);
  linkInput.addEventListener('focus', () => {
    if (linkInput.value.trim().length >= 2 && linkResults.children.length > 0) {
      linkResults.classList.add('open');
    } else {
      performLinkSearch();
    }
  });
  linkInput.addEventListener('blur', () => { setTimeout(() => linkResults.classList.remove('open'), 200); });

  const updateHistoryData = async () => {
    const history = await ttuHistoryStorage.getValue() || {};
    const sessions = history[getTTUTitle()] ||[];

    cachedHistoryMins = sessions.reduce((acc: any, s: any) => acc + Math.round(s.timeMs / 60000), 0);
    cachedHistoryChars = sessions.reduce((acc: any, s: any) => acc + s.chars, 0);

    const listEl = wrapper.querySelector('#nt-ttu-history-list')!;
    if (sessions.length === 0) {
      listEl.innerHTML = '<div style="color:#777;text-align:center;padding:12px;">No past sessions yet</div>';
    } else {
      let html = '';
      sessions.forEach((s: any) => {
        const mins = Math.max(1, Math.round(s.timeMs / 60000));
        const d = new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        html += `<div class="nt-ttu-history-item" data-session-id="${s.id}"><span>${d}</span><span>${mins}m</span><span>${s.chars} chars</span><button class="nt-ttu-history-del" title="Delete session">×</button></div>`;
      });
      listEl.innerHTML = html;
      listEl.querySelectorAll('.nt-ttu-history-del').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const row = (e.currentTarget as HTMLElement).closest('.nt-ttu-history-item') as HTMLElement | null;
          const sessionId = row?.dataset.sessionId;
          if (!sessionId) return;
          const currentTitle = getTTUTitle();
          const historyNow = await ttuHistoryStorage.getValue() || {};
          const curr = historyNow[currentTitle] || [];
          historyNow[currentTitle] = curr.filter((s: any) => s.id !== sessionId);
          await ttuHistoryStorage.setValue(historyNow);

          // If this past session is still represented in the queue, delete that queued log too.
          const q = await readingQueueStorage.getValue();
          const filtered = q.filter((item: any) => !((item.sessions ||[]).some((s: any) => s.id === sessionId)));
          if (filtered.length !== q.length) {
            await readingQueueStorage.setValue(filtered);
          }

          await updateHistoryData();
          updateUI();
        });
      });
    }
  };

  const updateUI = () => {
    if (timeVal.tagName !== 'INPUT') timeVal.textContent = fmt(ttuState.timeMs);
    if (charsVal.tagName !== 'INPUT') charsVal.textContent = ttuState.chars.toString();

    const totalMins = cachedHistoryMins + Math.floor(ttuState.timeMs / 60000);
    const totalChars = cachedHistoryChars + ttuState.chars;

    // Multiply the CPM result by 60 to get CPH
    const sessSpeed = ttuState.timeMs > 0 ? Math.round((ttuState.chars / (ttuState.timeMs / 60000)) * 60) : 0;
    const totSpeed = totalMins > 0 ? Math.round((totalChars / totalMins) * 60) : 0;

    speedVal.textContent = sessSpeed + '/h';
    totalSpeedVal.textContent = totSpeed + '/h';

    wrapper.querySelector('#nt-ttu-total-time')!.textContent = totalMins + 'm';
    wrapper.querySelector('#nt-ttu-total-chars')!.textContent = totalChars.toString();

    const pauseSvg = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
    const playSvg  = 'M8 5v14l11-7z';

    const playPath = toggleBtn.querySelector('#nt-ttu-play-path');
    const mainIconPath = btn.querySelector('#nt-ttu-main-icon-path');

    if (playPath) {
      playPath.setAttribute('d', ttuState.running ? pauseSvg : playSvg);
      toggleBtn.setAttribute('title', ttuState.running ? 'Pause Timer' : 'Start Timer');
    }
    if (mainIconPath) {
      mainIconPath.setAttribute('d', ttuState.running ? pauseSvg : playSvg);
    }

    if (getReaderConfig(currentConfig).autoSave !== false) {
      btnLog.disabled = true;
      btnLog.style.opacity = '0.3';
      btnLog.style.cursor = 'not-allowed';
      btnLog.title = 'Auto-sync is enabled (Sends automatically via Settings Queue)';
    } else {
      btnLog.disabled = false;
      btnLog.style.opacity = '1';
      btnLog.style.cursor = 'pointer';
      btnLog.title = 'Save & Queue';
    }
  };

  const makeEditable = (el: Element, isTime: boolean) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
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
            let diff = currentCount - (globalSessionStartChar !== -1 ? globalSessionStartChar : 0);
            if (diff < 0) diff = 0;
            globalManualCharOffset = val - diff;
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
      await refreshLinkerUI();
    }
    updateUI();
  });

  btn.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    e.preventDefault();
    ttuState.running = !ttuState.running;
    if (ttuState.running) {
      const currentCount = extractTTUCharCount();
      if (currentCount !== null) {
        const oldDiff = ttuState.chars - globalManualCharOffset;
        globalSessionStartChar = currentCount - oldDiff;
      }
      globalLastTick = Date.now();
    }
    updateUI();
  });

  document.addEventListener('click', (e) => {
    if (!e.composedPath().includes(wrapper)) {
      dropdown.classList.remove('open');
    }
  });

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ttuState.running = !ttuState.running;
    if (ttuState.running) {
      const currentCount = extractTTUCharCount();
      if (currentCount !== null) {
        const oldDiff = ttuState.chars - globalManualCharOffset;
        globalSessionStartChar = currentCount - oldDiff;
      }
      globalLastTick = Date.now();
    }
    updateUI();
  });

  wrapper.querySelector('#nt-ttu-btn-reset')!.addEventListener('click', (e) => {
    e.stopPropagation();
    ttuState.timeMs = 0;
    ttuState.chars = 0;
    const currentCount = extractTTUCharCount();
    globalSessionStartChar = currentCount !== null ? currentCount : -1;
    globalManualCharOffset = 0;
    updateUI();
  });

  btnLog.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (getReaderConfig(currentConfig).autoSave !== false) return;
    await saveSessionAndQueue();
    await updateHistoryData();
    updateUI();
  });

  btnDirect.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (ttuState.timeMs === 0 && ttuState.chars === 0) return;

    const title = getTTUTitle();
    const links = await ttuLinkStorage.getValue() || {};
    const linkedMedia = links[title];
    if (!linkedMedia) return;

    const secs = Math.round(ttuState.timeMs / 1000);
    try {
      // Direct POST payload to NihongoTracker
      const ok = await submitLog({
        type: 'reading',
        mediaId: linkedMedia.mediaId,
        mediaData: linkedMedia.mediaData,
        description: linkedMedia.mediaData.contentTitleNative || title,
        chars: ttuState.chars,
        time: Math.round(secs / 60),
                                 date: new Date().toISOString(),
                                 episodes: 0,
                                 pages: 0,
                                 volume: linkedMedia.volume || 1,
                                 private: false,
                                   tags:[]
      });
      if (!ok) return;

      // Process history visually
      const dateStr = new Date().toISOString();
      const sessionLog = { id: ttuState.id, date: dateStr, timeMs: ttuState.timeMs, chars: ttuState.chars };
      const history = await ttuHistoryStorage.getValue() || {};
      if (!history[title]) history[title] =[];
      history[title].push(sessionLog);
      await ttuHistoryStorage.setValue(history);

      // Hard Reset
      ttuState.id = crypto.randomUUID();
      ttuState.timeMs = 0;
      ttuState.chars = 0;
      const currentCount = extractTTUCharCount();
      globalSessionStartChar = currentCount !== null ? currentCount : -1;
      globalManualCharOffset = 0;
      ttuState.running = false;

      await updateHistoryData();
      updateUI();
    } catch (err) {
      showToast('Failed to send log', true);
    }
  });

  (window as any).ntChronoInterval = setInterval(() => {
    if (ttuState.running && !document.hidden) {
      const now = Date.now();
      ttuState.timeMs += (now - globalLastTick);

      const currentCount = extractTTUCharCount();
      if (currentCount !== null) {
        let diff = currentCount - globalSessionStartChar;
        if (diff < 0) diff = 0;
        ttuState.chars = diff + globalManualCharOffset;
      }
      globalLastTick = now;
      updateUI();

      if (getReaderConfig(currentConfig).autoSave !== false) {
        liveSyncQueue();
      }
    } else if (ttuState.running && document.hidden) {
      globalLastTick = Date.now();
    }
  }, 1000);

  pt.el.insertAdjacentElement(pt.pos, wrapper);
  updateHistoryData().then(() => updateUI());
  refreshLinkerUI();
}

function findTTUInsertPoint(): { el: Element, pos: InsertPosition } | null {
  if (typeof document === 'undefined') return null;

  const footer = document.getElementById('ttu-page-footer');

  if (footer) {
    const flexGroups = Array.from(footer.children).filter(el =>
    el.classList.contains('flex') &&
    !el.classList.contains('fixed') &&
    !el.classList.contains('absolute') &&
    el.id !== 'nt-ttu-chrono-wrapper'
    );
    if (flexGroups.length > 0) {
      return { el: flexGroups[flexGroups.length - 1], pos: 'beforeend' };
    }
    return { el: footer, pos: 'afterbegin' };
  }

  // Fallback for TTU forks like Manabe / Yatsu
  const progressDiv = document.querySelector('div[title="Click to copy Progress"]');
  if (progressDiv && progressDiv.parentElement) {
    const container = progressDiv.parentElement;
    // The icons are grouped in a left-aligned flex container
    const leftGroup = Array.from(container.children).find(el =>
    el.classList.contains('flex') &&
    el.classList.contains('h-full') &&
    el.id !== 'nt-ttu-chrono-wrapper'
    );
    if (leftGroup) {
      return { el: leftGroup, pos: 'beforeend' };
    }
    // Fallback to container itself
    return { el: container, pos: 'afterbegin' };
  }

  return null;
}

if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(() => {
    const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
    const target = findTTUInsertPoint();
    if (target && !wrapper) {
      const readerCfg = getReaderConfig(currentConfig);
      if (readerCfg.enabled !== false) setupTTUChronometer();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

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

if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((req: any, _s, sendResponse) => {
    if (req.action === 'GET_ACTIVE_TIME') {
      const nt = (window as any).__nt;
      if (nt && nt.getTotal) sendResponse({ minutes: Math.floor(nt.getTotal() / 60000) });
    }
    if (req.action === 'SHOW_TOAST') {
      const g = globalThis as any;
      if (!g.__nt_toastSink) g.__nt_toastSink = 'ttu';
      if (g.__nt_toastSink !== 'ttu') return;
      const text = req.message ? `${req.title}: ${req.message}` : String(req.title || '');
      showToast(text, String(req.title || '').toLowerCase().includes('fail') || String(req.title || '').toLowerCase().includes('error'));
    }
  });
}
window.addEventListener('message', (event) => {
  if (event.data?.action === 'SHOW_TOAST') {
    const title = String(event.data.title || '');
    const msg = event.data.message;
    const text = msg ? `${title}: ${msg}` : title;
    showToast(text, title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
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

function buildOverlay(cfg: any) {
  if (websiteOverlayDismissed) {
    const existing = document.getElementById('nt-overlay');
    if (existing) existing.style.display = 'none';
    return;
  }

  let overlay = document.getElementById('nt-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'nt-overlay';
    const handle = document.createElement('div');
    handle.className = 'nt-handle'; handle.title = 'Drag to move'; handle.innerHTML = '⠿';
    const timeEl = document.createElement('span');
    timeEl.className = 'nt-time'; timeEl.textContent = '0:00'; timeEl.title = 'Click to edit';
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'nt-ctrl'; pauseBtn.textContent = '⏸'; pauseBtn.title = 'Pause / Resume';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'nt-ctrl'; resetBtn.textContent = '↺'; resetBtn.title = 'Reset timer';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'nt-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Hide overlay (until reload)';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      websiteOverlayDismissed = true;
      overlay!.style.display = 'none';
    });

    overlay.append(handle, timeEl, pauseBtn, resetBtn, closeBtn);
    document.body.appendChild(overlay);

    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', e => {
      dragging = true;
      const r = overlay!.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      overlay!.style.right = ''; overlay!.style.bottom = '';
      overlay!.style.left = r.left + 'px'; overlay!.style.top = r.top + 'px';
      handle.style.cursor = 'grabbing'; e.preventDefault();
    });
    document.addEventListener('mousemove', e => { if (dragging) { overlay!.style.left=(e.clientX-ox)+'px'; overlay!.style.top=(e.clientY-oy)+'px'; } });
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

  const pos = cfg.overlayPosition ?? 'top-right';
  overlay.style.top = ''; overlay.style.bottom = ''; overlay.style.left = ''; overlay.style.right = '';
  if (pos === 'top-left')     { overlay.style.top = '16px'; overlay.style.left = '16px'; }
  if (pos === 'top-right')    { overlay.style.top = '16px'; overlay.style.right = '16px'; }
  if (pos === 'bottom-left')  { overlay.style.bottom = '16px'; overlay.style.left = '16px'; }
  if (pos === 'bottom-right') { overlay.style.bottom = '16px'; overlay.style.right = '16px'; }

  if (cfg.overlayPosition === 'hidden') {
    overlay.style.display = 'none';
  } else {
    overlay.style.display = 'flex';
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['config']) {
    const newCfg: any = changes['config'].newValue || {};
    const oldCfg: any = changes['config'].oldValue || {};
    currentConfig = newCfg;

    if (TTU_HOSTS.some(h => window.location.hostname.includes(h))) {
      const oldReaderCfg = getReaderConfig(oldCfg);
      const newReaderCfg = getReaderConfig(newCfg);

      const wasEnabled = oldReaderCfg.enabled;
      const isEnabled = newReaderCfg.enabled;

      if (!isEnabled && wasEnabled) {
        const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
        if (wrapper) wrapper.remove();
        if ((window as any).ntChronoInterval) clearInterval((window as any).ntChronoInterval);
      } else if (isEnabled && !wasEnabled) {
        setupTTUChronometer();
      }

      const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
      if (wrapper) {
        const btnLog = wrapper.querySelector('#nt-ttu-btn-log') as HTMLButtonElement;

        if (isEnabled && newReaderCfg.autoSave !== false) {
          btnLog.disabled = true;
          btnLog.style.opacity = '0.3';
          btnLog.style.cursor = 'not-allowed';
          btnLog.title = 'Auto-sync is enabled (Sends automatically via Settings Queue)';
        } else if (isEnabled) {
          btnLog.disabled = false;
          btnLog.style.opacity = '1';
          btnLog.style.cursor = 'pointer';
          btnLog.title = 'Save & Queue';
        }
      }
    } else {
      if (isWebsiteOverlaySkipped(newCfg) || websiteOverlayDismissed) {
        const overlay = document.getElementById('nt-overlay');
        if (overlay) overlay.style.display = 'none';
        return;
      }
      isJapanesePage(newCfg).then(isJP => {
        if (isJP && newCfg.overlayPosition !== 'hidden') {
          buildOverlay(newCfg);
        } else {
          const overlay = document.getElementById('nt-overlay');
          if (overlay) overlay.style.display = 'none';
        }
      });
    }
  }

  if (area === 'local' && changes['readingQueue']) {
    const queue = (changes['readingQueue'].newValue as any[]) ||[];
    const title = getTTUTitle();
    const exists = queue.some((q: any) => q.originalTitle === title || q.contentTitleNative === title);

    if (!exists && ttuState.timeMs > 0) {
      ttuState.timeMs = 0;
      ttuState.chars = 0;
      const currentCount = extractTTUCharCount();
      globalSessionStartChar = currentCount !== null ? currentCount : -1;
      globalManualCharOffset = 0;

      const timeVal = document.querySelector('#nt-ttu-val-time');
      const charsVal = document.querySelector('#nt-ttu-val-chars');
      if (timeVal && timeVal.tagName !== 'INPUT') timeVal.textContent = "0:00";
      if (charsVal && charsVal.tagName !== 'INPUT') charsVal.textContent = "0";
    }
  }
});

export default defineContentScript({
  matches:['<all_urls>'],
  allFrames: true,
  cssInjectionMode: 'manifest',

  async main() {
    currentConfig = await configStorage.getValue() || {};

    const host = window.location.hostname;
    const cfg  = currentConfig;

    if (TTU_HOSTS.some(h => host.includes(h))) {
      const readerCfg = getReaderConfig(cfg);
      if (!readerCfg.enabled) return;
      startTimeTracker();
      await new Promise(r => setTimeout(r, 2500));
      setupTTUChronometer();
      return;
    }

    if (isWebsiteOverlaySkipped(cfg)) return;

    startTimeTracker();
    if (cfg.overlayPosition === 'hidden') return;

    const isJP = await isJapanesePage(cfg);
    if (!isJP) return;

    buildOverlay(cfg);
  },
});
