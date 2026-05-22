/**
 * ── Toast Notification Utility ───────────────────────────────────────────────
 *
 * Injects a non-intrusive toast notification into the current page's DOM.
 * This is used by content scripts to show success/error messages.
 *
 * The toast system creates a fixed-position container at the bottom-right
 * of the viewport and slides notifications in/out with CSS animations.
 *
 * IMPORTANT: This is for content script contexts only (injected into host pages).
 * Popup/settings pages use their own Svelte-based StatusToast component.
 */

/**
 * Show a toast notification in the current page.
 *
 * @param title - Bold title text (e.g., "Success", "Failed")
 * @param msg - Body message text
 * @param err - If true, uses red error styling instead of green success styling
 */
export function showToast(title: string, msg: string, err = false): void {
  /* Find or create the toast container */
  let container = document.getElementById('nt-toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'nt-toast-container';
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '2147483647',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none',
      writingMode: 'horizontal-tb',
    });
    document.body.appendChild(container);

    /* Inject animation and toast styles (once per page) */
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
      writing-mode: horizontal-tb !important;
      flex-direction: row !important;
      direction: ltr !important;
      text-align: left !important;
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

  /* Create the toast element */
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

  /* Auto-dismiss after 3 seconds */
  const timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);

  /* Manual close button */
  toast.querySelector('.nt-toast-close')!.addEventListener('click', () => {
    clearTimeout(timeout);
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  });
}
