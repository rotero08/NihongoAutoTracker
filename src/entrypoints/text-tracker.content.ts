/**
 * ── Text Tracker Content Script ──────────────────────────────────────────────
 */
import { defineContentScript } from '#imports';
import { configStorage } from '@/lib/storage/config';
import { readingQueueStorage } from '@/lib/storage/queues';
import { ttuHistoryStorage, ttuLinkStorage } from '@/lib/storage/ttu';
import { addDebugLog } from '@/lib/storage/debug';
import { SKIP_HOSTS_DEFAULT, JP_DOMAINS_DEFAULT, JP_RE, TTU_HOSTS } from '@/lib/constants';
import { parseTitle } from '@/lib/utils/text-parsing';
import { showToast } from '@/lib/utils/toast';
import { injectThemeStyles, buildOverlay } from '@/lib/ui/reader-overlay';
import { setupTTUChronometerUI } from '@/lib/ui/ttu-chrono';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';
import '@/assets/overlay.css';

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
  const skipSites: string[] = cfg?.skipSites ?? ['youtube.com', 'youtu.be', 'crunchyroll.com', 'animekai.to', 'music.youtube.com', 'nihongotracker.app'];
  if (SKIP_HOSTS_DEFAULT.some(h => host.includes(h))) return true;
  if (skipSites.some((h: string) => host.includes(h))) return true;
  return false;
}

async function isJapanesePage(cfg: any): Promise<boolean> {
  const host = window.location.hostname;
  const allowSites: string[] = cfg.allowSites ?? [...JP_DOMAINS_DEFAULT];
  const allowListOnly: boolean = cfg.allowListOnly ?? false;

  if (allowSites.some((d: string) => host.includes(d))) return true;
  if (allowListOnly) return false;

  const lang = document.documentElement.lang;
  if (lang.startsWith('ja')) return true;

  await new Promise(r => setTimeout(r, 1500));
  const sample = (document.body?.innerText ?? '').slice(0, 8000);
  const jpCount = (sample.match(JP_RE) ?? []).length;
  const result = jpCount >= 40;

  addDebugLog('INFO', 'TextTracker', `Page Analysis`, {
    host,
    japaneseCharsFound: jpCount,
    isJapanese: result
  });

  return result;
}

const ttuState = {
  id: crypto.randomUUID(),
  running: false,
  timeMs: 0,
  chars: 0,
};

const stateRefs = {
  globalSessionStartChar: -1,
  globalManualCharOffset: 0,
  globalLastTick: Date.now(),
  lastSectionIndex: -1,
  lastSectionId: '',
  lastSectionTotal: 0,
  visitedSections: new Map<number, number>()
};

let isSyncing = false;

function getTTUTitle() {
  let title = document.title;
  try {
    if (window.self !== window.top && window.top) {
      title = window.top.document.title || title;
    }
  } catch (e) { }
  title = title.replace(/\s*\|\s*(ッツ Ebook Reader|Yatsu Reader|Manabe Reader)\s*/i, '');
  title = title.replace(/\s*[–—-]\s*ttu.*$/i, '');
  return title.trim() || document.title;
}

function parseTitleWithConfig(docTitle: string) {
  return parseTitle(docTitle, currentConfig.titleRegexes);
}

function getReaderName() {
  const host = window.location.hostname;
  if (host.includes('app.yatsu.moe')) return 'Yatsu Reader';
  if (host.includes('manga.manabe.es')) return 'Manabe Reader';
  if (host.includes('reader.ttsu.app')) return 'TTU Reader';
  return 'Reader';
}

async function liveSyncQueue() {
  if (isSyncing || (ttuState.timeMs === 0 && ttuState.chars === 0)) return;
  isSyncing = true;

  try {
    const rawTitle = getTTUTitle();
    const { query: parsedTitle, volume: parsedVolume } = parseTitleWithConfig(rawTitle);
    const dateStr = new Date().toISOString();
    const secs = Math.round(ttuState.timeMs / 1000);

    const queue = await readingQueueStorage.getValue();
    let existing = queue.find(q => q.originalTitle === rawTitle || q.contentTitleNative === rawTitle);

    const linkMap = await ttuLinkStorage.getValue() || {};
    const linkedMedia = linkMap[rawTitle];

    await addDebugLog('INFO', 'TextTracker', `liveSyncQueue executed`, { rawTitle, parsedTitle, timeMs: ttuState.timeMs, chars: ttuState.chars });

    if (!existing) {
      existing = {
        id: crypto.randomUUID(), type: 'reading',
        contentTitleNative: parsedTitle,
        contentTitleEnglish: '',
        originalTitle: rawTitle,
        description: parsedTitle,
        chars: ttuState.chars, time: secs,
        volume: parsedVolume || 1,
        date: dateStr, private: false, tags: [],
        sessions: [{ id: ttuState.id, secs: secs, chars: ttuState.chars, date: dateStr }],
        readerName: getReaderName()
      };
      queue.push(existing);
    } else {
      existing.originalTitle = existing.originalTitle || rawTitle;
      existing.readerName = getReaderName();

      if (!existing.mediaId || existing.mediaId === 'web-reading') {
        existing.contentTitleNative = existing.contentTitleNative || parsedTitle;
        if (parsedVolume !== undefined && !existing.volume) {
          existing.volume = parsedVolume;
        }
      }

      existing.sessions = existing.sessions || [];
      const sIdx = existing.sessions.findIndex((s: any) => s.id === ttuState.id);

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
      existing.mediaId = String(linkedMedia.mediaId);
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

  await addDebugLog('INFO', 'TextTracker', `Saving explicit TTU session`, { chars: ttuState.chars, timeMs: ttuState.timeMs });

  const title = getTTUTitle();
  const dateStr = new Date().toISOString();
  const sessionLog = { id: ttuState.id, date: dateStr, timeMs: ttuState.timeMs, chars: ttuState.chars };

  const history = await ttuHistoryStorage.getValue() || {};
  if (!history[title]) history[title] = [];
  history[title].push(sessionLog);
  await ttuHistoryStorage.setValue(history);

  await liveSyncQueue();

  ttuState.id = crypto.randomUUID();
  ttuState.timeMs = 0;
  ttuState.chars = 0;

  const currentCount = extractAdvancedCharCount();
  stateRefs.globalSessionStartChar = currentCount !== null ? currentCount.current : -1;
  stateRefs.globalManualCharOffset = 0;
  stateRefs.lastSectionIndex = -1;
  stateRefs.visitedSections.clear();
  ttuState.running = false;

  showToast('Success', 'Session queued!');
}

function findTTUInsertPoint(): { el: Element, pos: InsertPosition } | null {
  if (typeof document === 'undefined') return null;

  const footer = document.getElementById('ttu-page-footer');
  if (footer) {
    const flexGroups = Array.from(footer.children).filter(el =>
      el.classList.contains('flex') && !el.classList.contains('fixed') && !el.classList.contains('absolute') && el.id !== 'nt-ttu-chrono-wrapper');
    if (flexGroups.length > 0) return { el: flexGroups[flexGroups.length - 1], pos: 'beforeend' };
    return { el: footer, pos: 'afterbegin' };
  }

  const progressDiv = document.querySelector('div[title="Click to copy Progress"]');
  if (progressDiv && progressDiv.parentElement) {
    const container = progressDiv.parentElement;
    const leftGroup = Array.from(container.children).find(el => el.classList.contains('flex') && el.classList.contains('h-full') && el.id !== 'nt-ttu-chrono-wrapper');
    if (leftGroup) return { el: leftGroup, pos: 'beforeend' };
    return { el: container, pos: 'afterbegin' };
  }

  return null;
}

function setupTTUChronometer() {
  const pt = findTTUInsertPoint();
  if (!pt) return;

  setupTTUChronometerUI(pt, currentConfig, ttuState, stateRefs, {
    getTTUTitle,
    parseTitleWithConfig,
    extractTTUCharCount: () => {
      const res = extractAdvancedCharCount();
      return res !== null ? res.current : null;
    },
    getReaderName,
    getReaderConfig,
    liveSyncQueue,
    saveSessionAndQueue
  });

  if ((window as any).ntChronoInterval) {
    clearInterval((window as any).ntChronoInterval);
  }

  (window as any).ntChronoInterval = setInterval(() => {
    if (ttuState.running && !document.hidden) {
      const now = Date.now();
      ttuState.timeMs += (now - stateRefs.globalLastTick);

      const charData = extractAdvancedCharCount();
      if (charData !== null) {
        const { current, total, sectionIndex } = charData;

        if (sectionIndex !== null) {
          // Initialize tracking history on first valid section index
          if (stateRefs.lastSectionIndex === -1) {
            stateRefs.lastSectionIndex = sectionIndex;
            stateRefs.lastSectionTotal = total;
            stateRefs.visitedSections.set(sectionIndex, 0);
          }

          // Sequential section change detected
          if (stateRefs.lastSectionIndex !== sectionIndex) {
            if (sectionIndex > stateRefs.lastSectionIndex) {
              // --- FORWARD PROGRESSION ---
              if (stateRefs.visitedSections.has(sectionIndex)) {
                stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(sectionIndex) || 0;
              } else {
                stateRefs.globalManualCharOffset += stateRefs.lastSectionTotal;
                stateRefs.visitedSections.set(sectionIndex, stateRefs.globalManualCharOffset);
              }
            } else {
              // --- BACKWARD PROGRESSION (sectionIndex < lastSectionIndex) ---
              if (stateRefs.visitedSections.has(sectionIndex)) {
                stateRefs.globalManualCharOffset = stateRefs.visitedSections.get(sectionIndex) || 0;
              } else {
                // Backward scroll too fast (skipped chapters): mathematically adjust the offset
                stateRefs.globalManualCharOffset = Math.max(0, stateRefs.globalManualCharOffset - total);
                stateRefs.visitedSections.set(sectionIndex, stateRefs.globalManualCharOffset);
              }
            }
            stateRefs.globalSessionStartChar = 0; // Reset start boundaries for the new section
          }

          stateRefs.lastSectionIndex = sectionIndex;
          stateRefs.lastSectionTotal = total;
        }

        if (stateRefs.globalSessionStartChar === -1) {
          stateRefs.globalSessionStartChar = current;
        }

        let diff = current - stateRefs.globalSessionStartChar;
        if (diff < 0) diff = 0;
        ttuState.chars = diff + stateRefs.globalManualCharOffset;
      }
      stateRefs.globalLastTick = now;

      const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
      if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));

      if (getReaderConfig(currentConfig).autoSave !== false) liveSyncQueue();
    } else if (ttuState.running && document.hidden) {
      stateRefs.globalLastTick = Date.now();
    }
  }, 1000);
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

if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((req: any, _s, sendResponse) => {
    if (req.action === 'GET_ACTIVE_TIME') {
      const nt = (window as any).__nt;
      if (nt && nt.getTotal) sendResponse({ minutes: Math.floor(nt.getTotal() / 60000) });
    }
    if (req.action === 'SHOW_TOAST') {
      if (window.self !== window.top) return;
      const title = String(req.title || '');
      const msg = req.message || '';
      showToast(title, msg, title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
    }
  });
}

window.addEventListener('message', (event) => {
  if (event.data?.action === 'SHOW_TOAST') {
    if (window.self !== window.top) return;
    const title = String(event.data.title || '');
    const msg = event.data.message || '';
    showToast(title, msg, title.toLowerCase().includes('fail') || title.toLowerCase().includes('error'));
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

function runOverlaySetup(cfg: any) {
  addDebugLog('INFO', 'TextTracker', `Building Overlay`, {
    url: window.location.href,
    pos: cfg.overlayPosition
  });
  buildOverlay(
    cfg,
    { dismissed: websiteOverlayDismissed },
    (isPaused) => { (window as any).__nt.pause(isPaused); },
    () => { (window as any).__nt.setMs(0); },
    (ms) => { (window as any).__nt.setMs(ms); },
    () => (window as any).__nt.getTotal(),
    () => { websiteOverlayDismissed = true; }
  );
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['config']) {
    const newCfg: any = changes['config'].newValue || {};
    currentConfig = newCfg;

    injectThemeStyles(newCfg.theme ?? 'nihongo', newCfg.font ?? 'mono');

    if (TTU_HOSTS.some(h => window.location.hostname.includes(h))) {
      const oldReaderCfg = getReaderConfig(changes['config'].oldValue || {});
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
          btnLog.disabled = true; btnLog.style.opacity = '0.3'; btnLog.style.cursor = 'not-allowed'; btnLog.title = 'Auto-sync is enabled (Sends automatically via Settings Queue)';
        } else if (isEnabled) {
          btnLog.disabled = false; btnLog.style.opacity = '1'; btnLog.style.cursor = 'pointer'; btnLog.title = 'Save & Queue';
        }
      }
    } else {
      if (isWebsiteOverlaySkipped(newCfg) || websiteOverlayDismissed) {
        const overlay = document.getElementById('nt-overlay');
        if (overlay) overlay.style.display = 'none';
        return;
      }
      isJapanesePage(newCfg).then(isJP => {
        if (isJP && newCfg.overlayPosition !== 'hidden') runOverlaySetup(newCfg);
        else { const overlay = document.getElementById('nt-overlay'); if (overlay) overlay.style.display = 'none'; }
      });
    }
  }

  if (area === 'local' && changes['readingQueue']) {
    const queue = (changes['readingQueue'].newValue as any[]) || [];
    const rawTitle = getTTUTitle();
    const existing = queue.find((q: any) => q.originalTitle === rawTitle || q.contentTitleNative === rawTitle);

    if (!existing && ttuState.timeMs > 0) {
      ttuState.timeMs = 0; ttuState.chars = 0;

      const initCount = extractAdvancedCharCount();
      stateRefs.globalSessionStartChar = initCount !== null ? initCount.current : -1;

      stateRefs.globalManualCharOffset = 0;

      const timeVal = document.querySelector('#nt-ttu-val-time');
      const charsVal = document.querySelector('#nt-ttu-val-chars');
      if (timeVal && timeVal.tagName !== 'INPUT') timeVal.textContent = "0:00";
      if (charsVal && charsVal.tagName !== 'INPUT') charsVal.textContent = "0";
    } else if (existing) {
      ttuLinkStorage.getValue().then(links => {
        links = links || {};
        let updated = false;

        if (existing.mediaId && existing.mediaId !== 'web-reading') {
          if (!links[rawTitle] || links[rawTitle].mediaId !== existing.mediaId || links[rawTitle].volume !== existing.volume) {
            links[rawTitle] = {
              mediaId: existing.mediaId,
              volume: existing.volume || 1,
              mediaData: existing.mediaData
            };
            updated = true;
          }
        } else if (!existing.mediaId || existing.mediaId === 'web-reading') {
          if (links[rawTitle]) {
            delete links[rawTitle];
            updated = true;
          }
        }

        if (updated) {
          ttuLinkStorage.setValue(links).then(() => {
            const wrapper = document.getElementById('nt-ttu-chrono-wrapper');
            if (wrapper) wrapper.dispatchEvent(new CustomEvent('nt-linker-refresh'));
          });
        }
      });
    }
  }
});

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  cssInjectionMode: 'manifest',

  async main() {
    currentConfig = await configStorage.getValue() || {};
    const host = window.location.hostname;
    const cfg = currentConfig;

    injectThemeStyles(cfg.theme ?? 'nihongo', cfg.font ?? 'mono');

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
    runOverlaySetup(cfg);
  },
});