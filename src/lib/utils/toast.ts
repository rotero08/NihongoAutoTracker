/**
 * ── Toast Notifications Manager ──────────────────────────────────────────────
 * Renders in-page toast indicators. Safe fallback structures protect against
 * restricted tab security constraints and ungranted cross-origin page hosts.
 */

import { browser } from 'wxt/browser';

const activeToasts: Record<string, {
  toast: HTMLDivElement;
  timestamp: number;
  resetTimer: () => void;
}> = {};

if (typeof document !== 'undefined') {
  const sweepOrphans = () => {
    document.querySelectorAll('.nt-toast').forEach((el) => {
      const pingDetail = { handled: false };
      el.dispatchEvent(new CustomEvent('nt-toast-ping', { detail: pingDetail }));
      if (!pingDetail.handled) {
        const keyAttr = el.getAttribute('data-key');
        if (keyAttr) {
          const key = decodeURIComponent(keyAttr);
          delete activeToasts[key];
        }
        el.remove();
      }
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sweepOrphans);
  } else {
    sweepOrphans();
  }
}

function normalizeToast(title: string, msg: string, err = false): { normTitle: string; normMessage: string; isError: boolean } {
  let normTitle = (title || '').trim();
  let normMessage = (msg || '').trim();
  let isError = err;

  const lowerTitle = normTitle.toLowerCase();
  const lowerMessage = normMessage.toLowerCase();

  if (
    lowerTitle.includes('fail') ||
    lowerTitle.includes('error') ||
    lowerTitle.includes('no japanese found') ||
    lowerMessage.includes('fail') ||
    lowerMessage.includes('error') ||
    isError
  ) {
    isError = true;
  }

  if (!normMessage) {
    if (lowerTitle.startsWith('failed!') || lowerTitle.startsWith('failed') || lowerTitle.startsWith('error')) {
      normMessage = normTitle.replace(/^(failed!|failed|error:?)\s*/i, '').trim();
      if (!normMessage) normMessage = 'An unexpected error occurred';
    } else if (lowerTitle.startsWith('success!') || lowerTitle.startsWith('success')) {
      normMessage = normTitle.replace(/^(success!?)\s*/i, '').trim();
      if (!normMessage) normMessage = 'Action completed successfully';
    } else {
      normMessage = normTitle;
    }
  }

  normMessage = normMessage.replace(/^[✓✗⚠▸▾\s*•·~xX\-:!⚠]*\s*/i, '');
  normMessage = normMessage.replace(/[!.]$/, '');

  const cleanLowerMessage = normMessage.toLowerCase();

  if (cleanLowerMessage.includes('missing api key')) {
    normMessage = 'Missing API key';
    isError = true;
  } else if (cleanLowerMessage.includes('logged directly to nihongotracker')) {
    normMessage = 'Logged directly to NihongoTracker';
  } else if (cleanLowerMessage.includes('log sent to nihongotracker')) {
    normMessage = 'Logged to NihongoTracker';
  } else if (cleanLowerMessage === 'session queued') {
    normMessage = 'Session queued locally';
  } else if (/successfully sent all (\d+) logs/i.test(normMessage)) {
    const match = normMessage.match(/successfully sent all (\d+) logs/i);
    if (match) {
      normMessage = `Logged all ${match[1]} queue entries to NihongoTracker`;
    }
  } else if (/sent (\d+) logs, but (\d+) failed/i.test(normMessage)) {
    const match = normMessage.match(/sent (\d+) logs, but (\d+) failed/i);
    if (match) {
      normMessage = `Logged ${match[1]} queue entries, but ${match[2]} failed`;
      isError = true;
    }
  } else if (/logged (\d+)\/(\d+) videos/i.test(normMessage)) {
    const match = normMessage.match(/logged (\d+)\/(\d+) videos/i);
    if (match) {
      normMessage = `Logged ${match[1]}/${match[2]} playlist videos`;
    }
  } else if (/failed to log videos \(0\/(\d+) logged\)/i.test(normMessage)) {
    const match = normMessage.match(/failed to log videos \(0\/(\d+) logged\)/i);
    if (match) {
      normMessage = `Failed to log playlist videos (0/${match[1]} logged)`;
      isError = true;
    }
  } else if (cleanLowerMessage === 'session removed') {
    normMessage = 'Session removed from queue';
  } else if (cleanLowerMessage === 'log removed') {
    normMessage = 'Queue entry removed';
  } else if (cleanLowerMessage === 'deleted theme') {
    normMessage = 'Theme deleted';
  } else if (cleanLowerMessage === 'synced theme unlocked') {
    normMessage = 'Synced theme unlocked';
  } else if (cleanLowerMessage.includes('selection had no japanese characters') || cleanLowerMessage.includes('selection has no japanese characters') || cleanLowerMessage.includes('had no japanese characters')) {
    normMessage = 'Selection has no Japanese characters';
    isError = true;
  } else if (cleanLowerMessage.includes('no valid videos found in playlist')) {
    normMessage = 'No valid videos found in playlist';
    isError = true;
  } else if (cleanLowerMessage.includes('anilist match unlinked')) {
    normMessage = 'AniList match unlinked';
  }

  if (isError) {
    normTitle = 'Error';
    normMessage = `⚠ ${normMessage}`;
  } else {
    normTitle = 'Success';
    normMessage = `✓ ${normMessage}`;
  }

  return { normTitle, normMessage, isError };
}

export function showToast(title: string, msg: string, err = false): void {
  if (typeof document === 'undefined') return;
  if (window.self !== window.top) return;

  const normalized = normalizeToast(title, msg, err);
  const normTitle = normalized.normTitle;
  const normMessage = normalized.normMessage;
  err = normalized.isError;

  const key = `${normTitle}::${normMessage}`;
  const escapedKey = encodeURIComponent(key);
  const now = Date.now();

  const existing = document.querySelector(`.nt-toast[data-key="${escapedKey}"]`) as HTMLDivElement;

  if (existing) {
    const pingDetail = { handled: false };
    existing.dispatchEvent(new CustomEvent('nt-toast-ping', { detail: pingDetail }));
    if (pingDetail.handled) {
      existing.dispatchEvent(new CustomEvent('nt-toast-reset', { detail: { timestamp: Date.now() } }));
      return;
    }
    existing.remove();
  }

  let container = document.getElementById('nt-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'nt-toast-container';
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '2147483647',
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: '10px',
      pointerEvents: 'none',
      writingMode: 'horizontal-tb',
      direction: 'ltr',
    });
    (document.body || document.documentElement).appendChild(container);
  }

  if (!document.getElementById('nt-toast-shared-styles')) {
    const style = document.createElement('style');
    style.id = 'nt-toast-shared-styles';
    style.textContent = `
    @keyframes nt-toast-deplete { from { width: 100%; } to { width: 0%; } }
    @keyframes nt-toast-slide-in { from { transform: translateY(15px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    #nt-toast-container { writing-mode: horizontal-tb !important; direction: ltr !important; }
    .nt-toast {
      pointer-events: auto !important; z-index: 2147483647 !important; position: relative; overflow: hidden;
      background: #0b1c0e !important; color: #3ddc84 !important; border: 1px solid #16351d !important;
      border-radius: 6px !important; padding: 12px 16px 16px 16px !important; font-family: var(--mono, monospace) !important;
      font-size: 13px !important; box-shadow: 0 10px 30px rgba(0,0,0,.5) !important; width: 280px !important;
      box-sizing: border-box !important; display: flex !important; justify-content: space-between !important;
      align-items: flex-start !important; gap: 12px !important; transition: opacity 0.15s, transform 0.15s !important;
      animation: nt-toast-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards !important; direction: ltr !important;
      text-align: left !important; line-height: 1.4 !important; writing-mode: horizontal-tb !important; flex-direction: row !important;
    }
    .nt-toast.nt-err { background: #1d0a0a !important; color: #f0706a !important; border-color: #3d1414 !important; }
    .nt-toast-bar { position: absolute; bottom: 0; left: 0; height: 3px; background: currentColor; opacity: 0.6; animation: nt-toast-deplete 3s linear forwards; }
    .nt-toast-close { background: none; border: none; color: inherit; cursor: pointer; font-size: 16px; line-height: 1; padding: 0; opacity: 0.6; transition: opacity 0.2s; font-family: sans-serif; }
    .nt-toast-close:hover { opacity: 1; }
    .nt-toast-content { display: flex; flex-direction: column; gap: 4px; flex: 1; word-break: break-word; }
    .nt-toast-title { font-weight: bold; font-family: var(--sans, system-ui, -apple-system, sans-serif) !important; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .nt-toast-msg { opacity: 0.9; font-family: var(--mono, monospace) !important; font-size: 11px; }
    #nt-toast-container .nt-toast.paused, #nt-toast-container .nt-toast.paused * { animation-play-state: paused !important; -webkit-animation-play-state: paused !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  const toast = document.createElement('div');
  toast.className = `nt-toast ${err ? 'nt-err' : ''}`;
  toast.setAttribute('data-key', escapedKey);

  const content = document.createElement('div');
  content.className = 'nt-toast-content';

  if (normTitle) {
    const titleSpan = document.createElement('span');
    titleSpan.className = 'nt-toast-title';
    titleSpan.textContent = normTitle;
    content.appendChild(titleSpan);
  }

  if (normMessage) {
    const msgSpan = document.createElement('span');
    msgSpan.className = 'nt-toast-msg';
    msgSpan.textContent = normMessage;
    content.appendChild(msgSpan);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'nt-toast-close';
  closeBtn.textContent = '×';

  const bar = document.createElement('div');
  bar.className = 'nt-toast-bar';

  toast.appendChild(content);
  toast.appendChild(closeBtn);
  toast.appendChild(bar);
  container.appendChild(toast);

  let timeLeft = 3000;
  let lastSpawnTime = now;
  let startTime = now;
  let timeoutId: any = null;

  const startTimer = () => {
    if (timeoutId) clearTimeout(timeoutId);
    startTime = Date.now();
    timeoutId = setTimeout(() => { closeToast(); }, timeLeft);
  };

  const pauseTimer = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeLeft -= Date.now() - startTime;
    if (timeLeft < 0) timeLeft = 0;
  };

  const closeToast = () => {
    if (timeoutId) clearTimeout(timeoutId);
    delete activeToasts[key];
    toast.style.animation = 'none';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px)';
    setTimeout(() => toast.remove(), 150);
  };

  const resetTimer = () => {
    timeLeft = 3000;
    toast.classList.remove('paused');
    const barElement = toast.querySelector('.nt-toast-bar') as HTMLElement;
    if (barElement) {
      barElement.style.animation = 'none';
      void barElement.offsetHeight;
      barElement.style.animation = '';
    }
    startTimer();
  };

  toast.addEventListener('nt-toast-ping', (e: any) => {
    if (e.detail) e.detail.handled = true;
  });

  toast.addEventListener('nt-toast-reset', (e: any) => {
    const eventTimestamp = e.detail?.timestamp || Date.now();
    const elapsed = eventTimestamp - lastSpawnTime;
    if (elapsed < 300) return;
    lastSpawnTime = eventTimestamp;
    resetTimer();
  });

  activeToasts[key] = { toast, timestamp: now, resetTimer };
  startTimer();

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeToast();
  });

  toast.addEventListener('mouseenter', () => {
    toast.classList.add('paused');
    pauseTimer();
  });

  toast.addEventListener('mouseleave', () => {
    toast.classList.remove('paused');
    startTimer();
  });
}

export function notify(title: string, message: string): void {
  try {
    const normalized = normalizeToast(title, message);
    const normTitle = normalized.normTitle;
    const normMessage = normalized.normMessage;
    const isError = normalized.isError;

    const hasDocument = typeof document !== 'undefined';
    const isExtensionPage = typeof window !== 'undefined' &&
      (window.location.protocol.startsWith('chrome-extension') || window.location.protocol.startsWith('moz-extension'));

    if (isExtensionPage && typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
      browser.tabs.query({ active: true, currentWindow: true })
        .then((tabs) => {
          const tab = tabs[0];
          const url = tab?.url || "";
          const isRestricted =
            !url ||
            url.startsWith('chrome://') ||
            url.startsWith('about:') ||
            url.startsWith('chrome-extension://') ||
            url.startsWith('moz-extension://') ||
            url.startsWith('https://chromewebstore.google.com/') ||
            url.startsWith('https://addons.mozilla.org/');

          if (isRestricted) {
            if (hasDocument) {
              showToast(normTitle, normMessage, isError);
            }
          } else {
            relayToastToActiveTab(normTitle, normMessage, isError);
          }
        })
        .catch(() => {
          if (hasDocument) {
            showToast(normTitle, normMessage, isError);
          }
        });
    } else {
      if (hasDocument) {
        showToast(normTitle, normMessage, isError);
      }
      if (typeof browser !== 'undefined') {
        relayToastToActiveTab(normTitle, normMessage, isError);
      }
    }
  } catch (_err) {
    // Fail silently
  }
}

function relayToastToActiveTab(title: string, message: string, isError: boolean) {
  if (typeof browser === 'undefined' || !browser.tabs || !browser.tabs.query) {
    if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
      browser.runtime.sendMessage({ action: 'NOTIFY', title, message }).catch(() => null);
    }
    return;
  }

  browser.tabs.query({ active: true, currentWindow: true })
    .then((tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;
      const url = tab.url || "";

      const isRestricted =
        url.startsWith('chrome://') ||
        url.startsWith('about:') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('moz-extension://') ||
        url.startsWith('https://chromewebstore.google.com/') ||
        url.startsWith('https://addons.mozilla.org/');

      if (isRestricted) return;

      // Safe permissive programmatic fallback dispatch sequence
      if (browser.scripting && browser.scripting.executeScript && !url.startsWith('chrome-extension://') && !url.startsWith('moz-extension://')) {
        browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: showToast,
          args: [title, message, isError]
        }).catch(() => {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, { action: 'SHOW_TOAST', title, message }).catch(() => null);
          }
        });
      } else {
        browser.tabs.sendMessage(tab.id, { action: 'SHOW_TOAST', title, message }).catch(() => null);
      }
    })
    .catch(() => null);
}
