/**
 * ── Video Manual Log Modal Orchestrator ─────────────────────────────────────
 * Programmatically mounts the Svelte 5 VideoEditModal.svelte component.
 */

import { mount, unmount } from 'svelte';
import { getTheme } from '@/lib/ui/themes';

let activeModalInstance: any = null;

export async function showNTEditModal(
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
    cleanupActiveModal();
    if (onClose) onClose(false);
    return;
  }

  const popupContainer = document.createElement('div');
  popupContainer.id = 'nt-modal-popup';
  document.body.appendChild(popupContainer);

  // Dynamic import avoids pre-rendering errors during compiling phases
  const VideoEditModal = (await import('@/components/video/VideoEditModal.svelte')).default;

  activeModalInstance = mount(VideoEditModal, {
    target: popupContainer,
    props: {
      data,
      onConfirm,
      onClose: (submitted: boolean) => {
        cleanupActiveModal();
        if (onClose) onClose(submitted);
      }
    }
  });

  const rect = badgeEl.getBoundingClientRect();
  popupContainer.style.position = 'fixed';
  popupContainer.style.bottom = `${window.innerHeight - rect.top + 10}px`;
  popupContainer.style.left = `${rect.left}px`;

  requestAnimationFrame(() => {
    const popRect = popupContainer.getBoundingClientRect();
    if (popRect.left < 0) popupContainer.style.left = '10px';
    if (popRect.right > window.innerWidth) popupContainer.style.left = `${window.innerWidth - popRect.width - 10}px`;
  });

  const clickOutsideHandler = (e: MouseEvent) => {
    if (!popupContainer.isConnected) {
      document.removeEventListener('click', clickOutsideHandler, true);
      return;
    }
    const target = e.target as HTMLElement;
    if (!popupContainer.contains(target) && !badgeEl.contains(target)) {
      cleanupActiveModal();
      if (onClose) onClose(false);
      document.removeEventListener('click', clickOutsideHandler, true);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', clickOutsideHandler, true);
  }, 50);
}

export function cleanupActiveModal() {
  const existing = document.getElementById('nt-modal-popup');
  if (existing) {
    if (activeModalInstance) {
      try {
        unmount(activeModalInstance);
      } catch (e) {}
      activeModalInstance = null;
    }
    existing.remove();
  }
}

export function injectModalStyles(theme: any): void {
  let style = document.getElementById('nt-modal-styles') as HTMLStyleElement;
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
  .nt-form-group input[type=number]::-webkit-inner-spin-button, .nt-form-group input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  .nt-form-group input[type=number] { -moz-appearance:textfield; }
  .nt-number-wrapper { position:relative; display:flex; width:100%; background:var(--color-surface-alt); border:1px solid var(--color-border); border-radius:6px; box-sizing:border-box; overflow:hidden; transition:border .2s, background .2s; }
  .nt-number-wrapper:focus-within { border-color:var(--color-accent); background:var(--color-surface); }
  .nt-number-wrapper input { border:none !important; background:transparent !important; border-radius:0 !important; padding-right:0 !important; flex:1; outline:none !important; min-width:0; box-shadow:none !important; }
  .nt-spin-btns { display:flex; flex-direction:column; width:26px; border-left:1px solid var(--color-border); background:var(--color-surface-alt); }
  .nt-spin-btns button { flex:1; background:transparent; border:none; color:var(--color-text-muted); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:color 0.15s, background 0.15s; padding:0; margin:0; }
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
  .nt-pl-chk { -webkit-appearance:none; appearance:none; width:16px; height:16px; border:1.5px solid var(--color-border-hover); border-radius:3px; background:var(--color-surface-alt); cursor:pointer; position:relative; display:inline-block; flex-shrink:0; margin:0; outline:none; transition:all 0.15s ease; }
  .nt-pl-chk:checked { background:var(--color-accent); border-color:var(--color-accent); }
  .nt-pl-chk:checked::after { content:''; position:absolute; left:4px; top:1px; width:4px; height:8px; border:solid white; border-width:0 2.2px 2.2px 0; transform:rotate(45deg); }
  #nt-playlist-modal-list { padding-right: 24px !important; margin-right: 0 !important; scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; box-sizing: border-box; }
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
}
