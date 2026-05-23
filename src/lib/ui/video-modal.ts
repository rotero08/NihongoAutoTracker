/**
 * ── Video Modal Styles ──────────────────────────────────────────────────────
 *
 * CSS for the manual log modal and playlist logger modal injected by the
 * video-tracker content script. Extracted to allow future per-site theming.
 *
 * This module provides:
 * - `injectModalStyles()` — injects the modal CSS once into the page
 * - `localTodayISODate()` — returns today's date in YYYY-MM-DD format
 * - `dateInputToISO()` — converts a date input value to ISO string
 *
 * These were extracted from video-tracker.content.ts (lines 266–397)
 * without changing any CSS values or logic.
 */

import type { UITheme } from './types';
import { DEFAULT_THEME } from './types';
import { generateThemeCssVariables } from './themes';

/**
 * Inject the modal CSS styles into the page <head>.
 *
 * @param theme - Optional theme override. Defaults to DEFAULT_THEME.
 */
export function injectModalStyles(theme: UITheme = DEFAULT_THEME): void {
  let style = document.getElementById('nt-modal-styles') as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = 'nt-modal-styles';
    document.head.appendChild(style);
  }

  const c = theme.colors;
  const t = theme.typography;

  style.textContent = `
  :root {
    ${generateThemeCssVariables(theme)}
  }
  #nt-modal-popup { z-index:2147483647; display:flex; align-items:center; justify-content:center; font-family:${t.mono}; cursor:default; }
  .nt-modal {
    background:var(--surf); border:1px solid var(--bdr); border-radius:${theme.borderRadius}px;
    width:330px; max-width:90vw; padding:20px; color:var(--text);
    box-shadow:0 10px 40px rgba(0,0,0,.5); box-sizing:border-box; color-scheme:var(--nt-color-scheme, dark);
    display: flex; flex-direction: column; max-height: 85vh;
  }
  .nt-modal-header { display:flex; align-items:center; gap:12px; flex-shrink: 0; }

  /* Removed drop-shadow filter from NAT Logo */
  .nt-logo-sq { width:32px; height:32px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:transparent; }
  .nt-logo-sq svg { width:100%; height:100%; }

  .nt-title-area { display:flex; flex-direction:column; gap:4px; }
  .nt-brand-name { font-weight:bold; font-size:13px; letter-spacing:.5px; }
  .nt-badge { background:rgba(240,112,106,0.15); color:var(--red); border:1px solid rgba(240,112,106,0.3); font-size:9px; padding:2px 6px; border-radius:12px; font-weight:bold; width:max-content; }
  .nt-link-btn { background:none; border:none; color:var(--muted); cursor:pointer; font-family:inherit; font-size:10px; font-weight:bold; padding:0; transition:color .2s; }
  .nt-link-btn:hover { color:var(--text); }
  .nt-link-btn.active { color:var(--amber); pointer-events:none; }

  /* --- FORM STYLING (Contrast Fixed) --- */
  .nt-form-group { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; width:100%; box-sizing:border-box; flex-shrink: 0; }
  .nt-form-group label { color:var(--muted); font-size:11px; font-weight:bold; letter-spacing:.5px; }
  .nt-form-group input, .nt-form-group select { background:var(--surf2); border:1px solid var(--bdr); color:var(--text); padding:8px 12px; border-radius:6px; font-family:inherit; font-size:12px; outline:none; transition:border .2s, background .2s; box-sizing:border-box; width:100%; min-width:0; }
  .nt-form-group input:focus { border-color:var(--amber); background:var(--surf); }

  /* --- CUSTOM NUMBER INPUT SPINNER --- */
  .nt-form-group input[type=number]::-webkit-inner-spin-button,
  .nt-form-group input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  .nt-form-group input[type=number] { -moz-appearance:textfield; }

  .nt-number-wrapper {
    position:relative; display:flex; width:100%; background:var(--surf2); border:1px solid var(--bdr);
    border-radius:6px; box-sizing:border-box; overflow:hidden; transition:border .2s, background .2s;
  }
  .nt-number-wrapper:focus-within { border-color:var(--amber); background:var(--surf); }
  .nt-number-wrapper input {
    border:none !important; background:transparent !important; border-radius:0 !important;
    padding-right:0 !important; flex:1; outline:none !important; min-width:0; box-shadow:none !important;
  }
  .nt-spin-btns {
    display:flex; flex-direction:column; width:26px; border-left:1px solid var(--bdr); background:var(--surf2);
  }
  .nt-spin-btns button {
    flex:1; background:transparent; border:none; color:var(--muted); cursor:pointer; display:flex;
    align-items:center; justify-content:center; transition:color 0.15s, background 0.15s; padding:0; margin:0;
  }
  .nt-spin-btns button:hover { color:var(--text); background:var(--surf); }
  #nt-spin-up { border-bottom:1px solid var(--bdr); }

  .nt-form-row { display:flex; gap:12px; width:100%; flex-shrink: 0; }
  .nt-form-row .nt-form-group { margin-bottom:0; flex: 1; }

  .nt-modal-footer { display:flex; gap:12px; margin-top:20px; flex-shrink: 0; }
  .nt-modal-footer button { flex:1; padding:10px; border:none; border-radius:${theme.borderRadiusSmall}px; font-family:inherit; font-weight:bold; cursor:pointer; font-size:12px; transition:opacity .2s; box-sizing:border-box; }
  .nt-modal-footer button:hover { opacity:.8; }
  
  /* Cancellation & Submits (Contrast Fixed) */
  #nt-modal-cancel { background:var(--surf2); border:1px solid var(--bdr); color:var(--text); }
  #nt-modal-submit { background:var(--amber); color:var(--bg); }

  /* --- CUSTOM AMBER CHECKBOX --- */
  .nt-modal-opt { display:flex; align-items:center; gap:8px; margin-top:14px; font-size:11px; color:var(--text); flex-shrink: 0; }
  .nt-pl-chk {
    -webkit-appearance:none; appearance:none; width:16px; height:16px; border:1.5px solid var(--bdr2);
    border-radius:3px; background:var(--surf2); cursor:pointer; position:relative; display:inline-block;
    flex-shrink:0; margin:0; outline:none; transition:all 0.15s ease;
  }
  .nt-pl-chk:checked { background:var(--amber); border-color:var(--amber); }
  .nt-pl-chk:checked::after {
    content:''; position:absolute; left:4px; top:1px; width:4px; height:8px;
    border:solid white; border-width:0 2.2px 2.2px 0; transform:rotate(45deg);
  }

  /* --- CUSTOM SCROLLBAR (Fixed Overlap) --- */
  #nt-playlist-modal-list {
  padding-right: 24px !important;
  margin-right: 0 !important;
  scrollbar-width: thin;
  scrollbar-color: var(--bdr) transparent;
  box-sizing: border-box;
  }
  #nt-playlist-modal-list::-webkit-scrollbar {
  width: 6px;
  }
  #nt-playlist-modal-list::-webkit-scrollbar-track {
  background: transparent;
  }
  #nt-playlist-modal-list::-webkit-scrollbar-thumb {
  background: var(--bdr);
  border-radius: 10px;
  }
  #nt-playlist-modal-list::-webkit-scrollbar-thumb:hover {
  background: var(--amber);
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

  .nt-btn-amber { background:var(--amber) !important; color:var(--bg) !important; border:none !important; }
  .nt-btn-ghost { background:transparent !important; color:var(--text) !important; border:1px solid var(--bdr) !important; }
  .nt-btn-ghost:hover { color:var(--text) !important; border-color:var(--bdr2) !important; }
  `;
}

/**
 * Get today's date in YYYY-MM-DD format, adjusted for the local timezone.
 * Used as the default value in date inputs on modals.
 */
export function localTodayISODate(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/**
 * Convert a date input value (YYYY-MM-DD) to a full ISO datetime string.
 * Preserves the current time-of-day in the output.
 *
 * @param dateStr - Date string from an HTML date input
 * @returns ISO 8601 datetime string
 */
export function dateInputToISO(dateStr: string): string {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(dateStr || '');
  if (!m) return new Date().toISOString();
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const now = new Date();
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}
