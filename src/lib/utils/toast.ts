/**
 * ── Toast Notification Utility (Deduplicated, Snappy Close & Hover Pause) ────
 *
 * Injects a non-intrusive toast notification into the current page's DOM.
 * Used by Content Scripts, Popups, and Settings pages alike.
 *
 * Cross-Sandbox DOM Bus: Because content scripts run in isolated JS worlds,
 * memory variables cannot be shared. This engine tags elements in the shared
 * DOM and dispatches CustomEvents to safely communicate and reset active timers.
 *
 * Safe to execute inside frames, enforces ltr horizontal writing modes on vertical
 * text pages, and pauses the countdown timer on active hovers.
 */

// Module-level cache to track active notification elements within this sandbox
const activeToasts: Record<string, {
  toast: HTMLDivElement;
  timestamp: number;
  resetTimer: () => void;
}> = {};

// Clean up any orphaned toast elements left in the DOM by previous invalidated contexts
if (typeof document !== 'undefined') {
  const sweepOrphans = () => {
    document.querySelectorAll('.nt-toast').forEach((el) => {
      const pingDetail = { handled: false };
      el.dispatchEvent(new CustomEvent('nt-toast-ping', { detail: pingDetail }));
      if (!pingDetail.handled) {
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

/**
 * Show a toast notification in the current page.
 *
 * @param title - Bold title text (e.g., "Success", "Failed")
 * @param msg - Body message text
 * @param err - If true, uses red error styling instead of green success styling
 */
export function showToast(title: string, msg: string, err = false): void {
  if (typeof document === 'undefined') return;

  // Guard: Discard toast rendering inside iframe layers
  if (window.self !== window.top) return;

  const key = `${title}::${msg}`;
  const escapedKey = encodeURIComponent(key);
  const now = Date.now();

  // Check the shared DOM for an active toast with the same identity
  const existing = document.querySelector(`.nt-toast[data-key="${escapedKey}"]`) as HTMLDivElement;

  if (existing) {
    const pingDetail = { handled: false };
    existing.dispatchEvent(new CustomEvent('nt-toast-ping', { detail: pingDetail }));

    // If the owning context is still alive, reset the timer and return
    if (pingDetail.handled) {
      existing.dispatchEvent(new CustomEvent('nt-toast-reset', { detail: { timestamp: Date.now() } }));
      return;
    }

    // Otherwise, clean up the orphaned element.
    existing.remove();
  }

  /* Find or create the toast container */
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

  /* Inject animation and toast styles */
  if (!document.getElementById('nt-toast-shared-styles')) {
    const style = document.createElement('style');
    style.id = 'nt-toast-shared-styles';
    style.textContent = `
    @keyframes nt-toast-deplete { from { width: 100%; } to { width: 0%; } }
    @keyframes nt-toast-slide-in { from { transform: translateY(15px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    
    #nt-toast-container {
      writing-mode: horizontal-tb !important;
      direction: ltr !important;
    }
    .nt-toast {
      pointer-events: auto !important;
      z-index: 2147483647 !important;
      position: relative; overflow: hidden;
      background: #0b1c0e !important;
      color: #3ddc84 !important; 
      border: 1px solid #16351d !important;
      border-radius: 6px !important; padding: 12px 16px 16px 16px !important;
      font-family: var(--mono, monospace) !important; font-size: 13px !important;
      box-shadow: 0 10px 30px rgba(0,0,0,.5) !important; width: 280px !important; box-sizing: border-box !important;
      display: flex !important; justify-content: space-between !important; align-items: flex-start !important; gap: 12px !important;
      transition: opacity 0.15s, transform 0.15s !important;
      animation: nt-toast-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      direction: ltr !important; text-align: left !important; line-height: 1.4 !important;
      writing-mode: horizontal-tb !important;
      flex-direction: row !important;
    }
    .nt-toast.nt-err { 
      background: #1d0a0a !important;
      color: #f0706a !important; 
      border-color: #3d1414 !important;
    }
    .nt-toast-bar { position: absolute; bottom: 0; left: 0; height: 3px; background: currentColor; opacity: 0.6; animation: nt-toast-deplete 3s linear forwards; }
    .nt-toast-close { background: none; border: none; color: inherit; cursor: pointer; font-size: 16px; line-height: 1; padding: 0; opacity: 0.6; transition: opacity 0.2s; font-family: sans-serif; }
    .nt-toast-close:hover { opacity: 1; }
    .nt-toast-content { display: flex; flex-direction: column; gap: 4px; flex: 1; word-break: break-word; }
    .nt-toast-title { font-weight: bold; font-family: var(--sans, system-ui, -apple-system, sans-serif) !important; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .nt-toast-msg { opacity: 0.9; font-family: var(--mono, monospace) !important; font-size: 11px; }

    #nt-toast-container .nt-toast.paused,
    #nt-toast-container .nt-toast.paused * {
      animation-play-state: paused !important;
      -webkit-animation-play-state: paused !important;
    }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /* Create the toast element programmatically */
  const toast = document.createElement('div');
  toast.className = `nt-toast ${err ? 'nt-err' : ''}`;
  toast.setAttribute('data-key', escapedKey);

  const content = document.createElement('div');
  content.className = 'nt-toast-content';

  if (title) {
    const titleSpan = document.createElement('span');
    titleSpan.className = 'nt-toast-title';
    titleSpan.textContent = title;
    content.appendChild(titleSpan);
  }

  if (msg) {
    const msgSpan = document.createElement('span');
    msgSpan.className = 'nt-toast-msg';
    msgSpan.textContent = msg;
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

  let isPaused = false;
  let timeLeft = 3000;
  let lastSpawnTime = now;
  let startTime = now;
  let timeoutId: any = null;

  const startTimer = () => {
    if (timeoutId) clearTimeout(timeoutId);
    startTime = Date.now();
    timeoutId = setTimeout(() => {
      closeToast();
    }, timeLeft);
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
    isPaused = false;
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

    if (elapsed < 300) {
      return;
    }

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
    isPaused = true;
    toast.classList.add('paused');
    pauseTimer();
  });

  toast.addEventListener('mouseleave', () => {
    isPaused = false;
    toast.classList.remove('paused');
    startTimer();
  });
}

/**
 * System-wide user notification helper (Task 4).
 * Safely resolves browser and chrome contexts from globalThis to satisfy compilation parameters.
 */
export function notify(title: string, message: string): void {
  const browserAPI = typeof (globalThis as any).browser !== 'undefined'
    ? (globalThis as any).browser
    : (typeof (globalThis as any).chrome !== 'undefined' ? (globalThis as any).chrome : null);

  if (browserAPI && browserAPI.notifications && typeof browserAPI.notifications.create === 'function') {
    browserAPI.notifications.create({
      type: 'basic',
      iconUrl: browserAPI.runtime?.getURL('/assets/icon-128.png') || browserAPI.runtime?.getURL('/icon/128.png') || '',
      title,
      message
    }).catch(() => {
      showToast(title, message, title.toLowerCase().includes('error') || title.toLowerCase().includes('fail'));
    });
  } else {
    showToast(title, message, title.toLowerCase().includes('error') || title.toLowerCase().includes('fail'));
  }
}