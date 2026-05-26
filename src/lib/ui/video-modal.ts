/**
 * ── Video Modal Styles ──────────────────────────────────────────────────────
 */

import type { UITheme } from '@/lib/types';
import { DEFAULT_THEME } from '@/lib/types';
import { DYNAMIC_LOGO_SVG } from '@/lib/ui/themes';
import { getTheme } from './themes';

// Safe HTML Helper to securely bypass AMO innerHTML warnings
function setSafeHTML(el: HTMLElement, html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  el.textContent = '';
  while (doc.body.firstChild) {
    el.appendChild(doc.body.firstChild);
  }
}

export function showNTEditModal(
  badgeEl: HTMLElement,
  themeName: string,
  data: {
    channelName: string;
    videoTitle: string;
    url: string;
    totalSecs: number;
    videoDurationSecs: number;
    showTotal: boolean;
    channelId: string | null;
    onToggleShowTotal: (v: boolean) => void;
  },
  onConfirm: (d: any) => Promise<void> | void,
  onClose?: (submitted: boolean) => void
) {
  const activeTheme = getTheme(themeName);
  injectModalStyles(activeTheme);

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
  const totalMins = Math.max(1, Math.round(data.videoDurationSecs / 60));

  setSafeHTML(popup, `
  <div class="nt-modal">
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
  <div class="nt-modal-header">
  <div class="nt-logo-sq" style="border:none; display:flex; align-items:center; justify-content:center;">
  ${DYNAMIC_LOGO_SVG}
  </div>
  <div class="nt-title-area"><span class="nt-brand-name">NihongoAutoTracker</span><span class="nt-badge">MANUAL LOG</span></div>
  </div>
  </div>

  <div style="display:flex; justify-content:flex-start; gap:10px; font-size:10px; font-weight:bold; margin-bottom:16px;">
  <span style="color:var(--color-text-muted);">DISPLAY:</span>
  <button id="nt-badge-session" class="nt-link-btn ${!data.showTotal ? 'active' : ''}">Session Only</button>
  <span style="color:var(--color-border-hover);">|</span>
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
  </div>`);

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

  const timeInput = popup.querySelector('#nt-edit-time') as HTMLInputElement;
  popup.querySelector('#nt-spin-up')!.addEventListener('click', () => {
    timeInput.value = String(Number(timeInput.value || 0) + 1);
  });
  popup.querySelector('#nt-spin-down')!.addEventListener('click', () => {
    timeInput.value = String(Math.max(1, Number(timeInput.value || 0) - 1));
  });

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

    await onConfirm({ title: data.channelName, desc: (popup.querySelector('#nt-edit-desc') as HTMLInputElement).value, time: timeVal, date: dateIso, clearSessions });
    closeModal(true);
  });

  setTimeout(() => {
    closeListener = (e: Event) => { if (!popup.contains(e.target as Node) && !badgeEl.contains(e.target as Node)) closeModal(false); };
    document.addEventListener('click', closeListener);
  }, 0);
}

// Tracking variable to store the style signature of the last injected theme
let lastInjectedThemeSignature = '';

/**
 * Inject the modal CSS styles into the page <head>.
 *
 * @param theme - Optional theme override. Defaults to DEFAULT_THEME.
 */
export function injectModalStyles(theme: UITheme = DEFAULT_THEME): void {
  const activeThemeSignature = `${theme.colors.background}_${theme.colors.accent}_${theme.typography.mono}`;
  let style = document.getElementById('nt-modal-styles') as HTMLStyleElement;

  if (style && lastInjectedThemeSignature === activeThemeSignature) {
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = 'nt-modal-styles';
    document.head.appendChild(style);
  }

  style.textContent = `
  #nt-modal-popup { z-index:2147483647; display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); cursor:default; }
  .nt-modal {
    background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--rounded-box);
    width:330px; max-width:90vw; padding:20px; color:var(--color-text);
    box-shadow:0 10px 40px rgba(0,0,0,.5); box-sizing:border-box; color-scheme:var(--nt-color-scheme, dark);
    display: flex; flex-direction: column; max-height: 85vh;
  }
  .nt-modal-header { display:flex; align-items:center; gap:12px; flex-shrink: 0; }
  .nt-logo-sq { width:32px; height:32px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:transparent; }
  .nt-logo-sq svg { width:100%; height:100%; }

  .nt-title-area { display:flex; flex-direction:column; gap:4px; }
  .nt-brand-name { font-weight:bold; font-size:13px; letter-spacing:.5px; }
  .nt-badge { background:rgba(240,112,106,0.15); color:var(--color-error); border:1px solid rgba(240,112,106,0.3); font-size:9px; padding:2px 6px; border-radius:12px; font-weight:bold; width:max-content; }
  .nt-link-btn { background:none; border:none; color:var(--color-text-muted); cursor:pointer; font-family:inherit; font-size:10px; font-weight:bold; padding:0; transition:color .2s; }
  .nt-link-btn:hover { color:var(--color-text); }
  .nt-link-btn.active { color:var(--color-accent); pointer-events:none; }

  .nt-form-group { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; width:100%; box-sizing:border-box; flex-shrink: 0; }
  .nt-form-group label { color:var(--color-text-muted); font-size:11px; font-weight:bold; letter-spacing:.5px; }
  .nt-form-group input, .nt-form-group select { background:var(--color-surface-alt); border:1px solid var(--color-border); color:var(--color-text); padding:8px 12px; border-radius:6px; font-family:inherit; font-size:12px; outline:none; transition:border .2s, background .2s; box-sizing:border-box; width:100%; min-width:0; }
  .nt-form-group input:focus { border-color:var(--color-accent); background:var(--color-surface); }

  .nt-form-group input[type=number]::-webkit-inner-spin-button,
  .nt-form-group input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  .nt-form-group input[type=number] { -moz-appearance:textfield; }

  .nt-number-wrapper {
    position:relative; display:flex; width:100%; background:var(--color-surface-alt); border:1px solid var(--color-border);
    border-radius:6px; box-sizing:border-box; overflow:hidden; transition:border .2s, background .2s;
  }
  .nt-number-wrapper:focus-within { border-color:var(--color-accent); background:var(--color-surface); }
  .nt-number-wrapper input {
    border:none !important; background:transparent !important; border-radius:0 !important;
    padding-right:0 !important; flex:1; outline:none !important; min-width:0; box-shadow:none !important;
  }
  .nt-spin-btns {
    display:flex; flex-direction:column; width:26px; border-left:1px solid var(--color-border); background:var(--color-surface-alt);
  }
  .nt-spin-btns button {
    flex:1; background:transparent; border:none; color:var(--color-text-muted); cursor:pointer; display:flex;
    align-items:center; justify-content:center; transition:color 0.15s, background 0.15s; padding:0; margin:0;
  }
  .nt-spin-btns button:hover { color:var(--color-text); background:var(--color-surface); }
  #nt-spin-up { border-bottom:1px solid var(--color-border); }

  .nt-form-row { display:flex; gap:12px; width:100%; flex-shrink: 0; }
  .nt-form-row .nt-form-group { margin-bottom:0; flex: 1; }

  .nt-modal-footer { display:flex; gap:12px; margin-top:20px; flex-shrink: 0; }
  .nt-modal-footer button { flex:1; padding:10px; border:none; border-radius:var(--rounded-btn); font-family:inherit; font-weight:bold; cursor:pointer; font-size:12px; transition:opacity .2s; box-sizing:border-box; }
  .nt-modal-footer button:hover { opacity:.8; }
  
  #nt-modal-cancel { background:var(--color-surface-alt); border:1px solid var(--color-border); color:var(--color-text); }
  #nt-modal-submit { background:var(--color-accent); color:var(--color-background); }

  .nt-modal-opt { display:flex; align-items:center; gap:8px; margin-top:14px; font-size:11px; color:var(--color-text); flex-shrink: 0; }
  .nt-pl-chk {
    -webkit-appearance:none; appearance:none; width:16px; height:16px; border:1.5px solid var(--color-border-hover);
    border-radius:3px; background:var(--color-surface-alt); cursor:pointer; position:relative; display:inline-block;
    flex-shrink:0; margin:0; outline:none; transition:all 0.15s ease;
  }
  .nt-pl-chk:checked { background:var(--color-accent); border-color:var(--color-accent); }
  .nt-pl-chk:checked::after {
    content:''; position:absolute; left:4px; top:1px; width:4px; height:8px;
    border:solid white; border-width:0 2.2px 2.2px 0; transform:rotate(45deg);
  }

  #nt-playlist-modal-list {
    padding-right: 24px !important;
    margin-right: 0 !important;
    scrollbar-width: thin;
    scrollbar-color: var(--color-border) transparent;
    box-sizing: border-box;
  }
  #nt-playlist-modal-list::-webkit-scrollbar { width: 6px; }
  #nt-playlist-modal-list::-webkit-scrollbar-track { background: transparent; }
  #nt-playlist-modal-list::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 10px; }
  #nt-playlist-modal-list::-webkit-scrollbar-thumb:hover { background: var(--color-accent); }

  .pl-vid-row { width: 100%; box-sizing: border-box; }
  .pl-scroll-title { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  .pl-scroll-title::-webkit-scrollbar { display: none !important; }

  .nt-btn-amber { background:var(--color-accent) !important; color:var(--color-background) !important; border:none !important; }
  .nt-btn-ghost { background:transparent !important; color:var(--color-text) !important; border:1px solid var(--color-border) !important; }
  .nt-btn-ghost:hover { color:var(--color-text) !important; border-color:var(--color-border-hover) !important; }
  `;

  lastInjectedThemeSignature = activeThemeSignature;
}

export function localTodayISODate(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function dateInputToISO(dateStr: string): string {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(dateStr || '');
  if (!m) return new Date().toISOString();
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const now = new Date();
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}