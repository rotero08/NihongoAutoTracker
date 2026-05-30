/**
 * ── Reader Overlay Styles & DOM Builder ──────────────────────────────────────
 *
 * Extracted overlay DOM rendering and custom styling rules from text-tracker
 * content script to modularize the codebase and improve readability.
 */
import { SKIP_HOSTS_DEFAULT, TTU_HOSTS } from '../constants';
import { addDebugLog } from '../storage/debug';
import { fmt } from '../utils/time';
import { getTheme } from './themes';

let overlayDismissed = false;

export function getOverlayDismissed(): boolean {
  return overlayDismissed;
}

export function setOverlayDismissed(val: boolean) {
  overlayDismissed = val;
}

export function isWebsiteOverlaySkipped(cfg: any): boolean {
  const host = window.location.hostname;

  // High-performance Reader parent page check to avoid layout overlaps (Double Overlay Fix)
  if (TTU_HOSTS.some((h: string) => host.includes(h))) {
    return true;
  }

  const skipSites: string[] = cfg?.skipSites ?? ['youtube.com', 'youtu.be', 'crunchyroll.com', 'animekai.to', 'music.youtube.com', 'nihongotracker.app'];
  if (SKIP_HOSTS_DEFAULT.some(h => host.includes(h))) return true;
  if (skipSites.some((h: string) => host.includes(h))) return true;
  return false;
}

export function injectThemeStyles(themeName: string, fontName: string, customColors?: Record<string, string>) {
  const theme = getTheme(themeName);
  let style = document.getElementById('nt-theme-styles') as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = 'nt-theme-styles';
    document.head.appendChild(style);
  }

  const fontValue = fontName === 'sans' ? "system-ui, -apple-system, sans-serif" : (fontName === 'serif' ? "Georgia, serif" : "'Courier New', monospace");

  // Resolve colors dynamically from the database config fallback
  const background = customColors?.background || customColors?.background || theme.colors.background;
  const surface = customColors?.surface || theme.colors.surface;
  const surfaceAlt = customColors?.surfaceAlt || theme.colors.surfaceAlt || theme.colors.surfaceAlt;
  const border = customColors?.border || theme.colors.border;
  const borderHover = customColors?.borderHover || theme.colors.borderHover;
  const text = customColors?.text || theme.colors.text;
  const muted = customColors?.textMuted || customColors?.muted || theme.colors.muted;
  const accent = customColors?.accent || theme.colors.accent;
  const accentHover = customColors?.accentHover || theme.colors.accentHover;
  const success = customColors?.success || theme.colors.success;
  const error = customColors?.error || theme.colors.error;

  style.textContent = `
    :root {
      --nt-background: ${background};
      --nt-surface: ${surface};
      --nt-surfaceAlt: ${surfaceAlt};
      --nt-border: ${border};
      --nt-borderHover: ${borderHover};
      --nt-text: ${text};
      --nt-muted: ${muted};
      --nt-accent: ${accent};
      --nt-accentHover: ${accentHover};
      --nt-success: ${success};
      --nt-error: ${error};
      --nt-font: ${fontValue};
      --nt-font-mono: ${theme.typography.mono};
      --nt-rounded-box: ${theme.borderRadius}px;
      --nt-rounded-btn: ${theme.borderRadiusSmall}px;
    }
    #nt-overlay {
      background: var(--nt-surface) !important;
      border: 1px solid var(--nt-border) !important;
      color: var(--nt-text) !important;
      border-radius: ${theme.borderRadius}px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,.5) !important;
      font-family: var(--nt-font) !important;
    }
    #nt-overlay .nt-handle { color: var(--nt-muted) !important; }
    #nt-overlay .nt-time { color: var(--nt-accent) !important; font-family: var(--nt-font) !important; }
    #nt-overlay .nt-ctrl {
      color: var(--nt-muted) !important;
      background: var(--nt-surfaceAlt) !important;
      border: 1px solid var(--nt-border) !important;
      border-radius: ${theme.borderRadiusSmall}px !important;
      font-family: var(--nt-font) !important;
    }
    #nt-overlay .nt-ctrl:hover { color: var(--nt-text) !important; border-color: var(--nt-borderHover) !important; }
    #nt-overlay .nt-close { color: var(--nt-muted) !important; }
    #nt-overlay .nt-close:hover { color: var(--nt-error) !important; }
    #nt-overlay .nt-edit {
      background: var(--nt-surfaceAlt) !important;
      color: var(--nt-text) !important;
      border: 1px solid var(--nt-border) !important;
      font-family: var(--nt-font) !important;
    }
  `;
}

export function injectTTUStyles() {
  if (typeof document === 'undefined' || document.getElementById('nt-ttu-styles')) return;
  const s = document.createElement('style');
  s.id = 'nt-ttu-styles';
  s.textContent = `
  #nt-ttu-chrono-wrapper,
  #nt-ttu-chrono-wrapper *,
  #nt-ttu-dropdown,
  #nt-ttu-dropdown * {
    font-family: var(--nt-font, sans-serif) !important;
  }
  #nt-ttu-chrono-wrapper { position: relative; display: flex; z-index: 40; align-items: center; justify-content: center; flex-shrink: 0; width: 2rem; height: 100%; }
  #nt-ttu-chrono-btn { background: transparent; border: none; cursor: pointer; display: flex; padding: 0; width: 100%; height: 100%; color: var(--nt-accent); transition: opacity 0.15s ease; align-items: center; justify-content: center; user-select: none; }
  #nt-ttu-chrono-btn:hover { opacity: 0.7; color: var(--nt-accentHover) !important; }
  #nt-ttu-chrono-btn:active { transform: scale(0.92); }
  #nt-ttu-chrono-btn svg { width: 1.7rem; height: 1.7rem; fill: currentColor; }
  #nt-ttu-dropdown { position: absolute; bottom: 100%; left: 0 !important; right: auto !important; margin-bottom: 8px; background: var(--nt-surface, #252525); border: 1px solid var(--nt-border, #3a3a3a); border-radius: var(--nt-rounded-box, 6px); width: 280px; color: var(--nt-text); box-shadow: 0 8px 24px rgba(0,0,0,0.8); display: none; flex-direction: column; overflow: hidden; writing-mode: horizontal-tb; text-align: left; direction: ltr; transform-origin: bottom left !important; cursor: default; }
  #nt-ttu-dropdown.open { display: flex; }
  .nt-ttu-dd-section { padding: 12px; text-align: center; }
  .nt-ttu-dd-title { font-size: 11px; color: var(--nt-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .nt-ttu-stats-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; }
  .nt-ttu-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
  .nt-ttu-stat-label { font-size: 10px; color: var(--nt-muted); }
  .nt-ttu-stat-val { font-family: var(--nt-font-mono, monospace); font-size: 14px; color: var(--nt-text); cursor: pointer; padding: 2px 6px; border-radius: 4px; border: 1px solid transparent; transition: background 0.2s; text-align: center; }
  .nt-ttu-stat-val:hover { background: var(--nt-surfaceAlt, #13131f); border-color: var(--nt-borderHover); }
  .nt-ttu-stat-val.no-hover { cursor: default; }
  .nt-ttu-stat-val.no-hover:hover { background: transparent; border-color: transparent; }
  .nt-ttu-controls { display: flex; gap: 8px; justify-content: center; }
  .nt-ttu-btn-icon { background: transparent; color: var(--nt-muted); border: none; padding: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; border-radius: 50%; }
  .nt-ttu-btn-icon:hover:not(:disabled) { background: var(--nt-surfaceAlt, #13131f); color: var(--nt-text); }
  .nt-ttu-btn-icon.primary { color: var(--nt-accent); }
  .nt-ttu-btn-icon.primary:hover:not(:disabled) { background: rgba(240,180,41,0.15); color: var(--nt-accentHover); }
  .nt-ttu-btn-icon svg { width: 18px; height: 18px; fill: currentColor; }
  .nt-ttu-linker { margin-top: 12px; border-top: 1px solid var(--nt-border); padding-top: 12px; }
  .nt-ttu-link-compact { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--nt-success) !important; padding: 4px 6px; border-radius: 4px; transition: background .15s; background: color-mix(in srgb, var(--nt-success) 5%, transparent) !important; border: 1px solid color-mix(in srgb, var(--nt-success) 20%, transparent) !important; }
  .nt-ttu-link-compact-inner { display: flex; align-items: center; gap: 6px; cursor: pointer; flex: 1; }
  .nt-ttu-link-compact-inner:hover { opacity: 0.8; }
  .nt-ttu-unlink-btn { background: none; border: none; color: var(--nt-error) !important; cursor: pointer; padding: 2px; display: flex; align-items: center; opacity: 0.6; transition: opacity .15s; }
  .nt-ttu-unlink-btn:hover { opacity: 1; }
  .nt-ttu-vol-pill { background: transparent; border: none; color: var(--nt-accent); font-family: var(--nt-font-mono, monospace); font-size: 11px; padding: 0 6px; cursor: pointer; opacity: .95; }
  .nt-ttu-vol-pill:hover { opacity: 1; }
  .nt-ttu-vol-pill:active { transform: scale(0.92); }
  .nt-ttu-link-compact-inner svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .nt-ttu-link-edit { display: flex; flex-direction: column; gap: 6px; position: relative; }
  .nt-ttu-link-edit-row { display: flex; align-items: center; gap: 6px; width: 100%; }
  .nt-ttu-link-vol-anchor { display: flex; align-items: center; flex: 0 0 auto; }
  .nt-ttu-link-wrap { display: flex; align-items: center; background: var(--nt-surfaceAlt, #13131f); border: 1px solid var(--nt-border); border-radius: 4px; padding: 0 6px; outline: none !important; flex: 1; min-width: 0; max-width: 100%; box-sizing: border-box; }
  .nt-ttu-link-wrap:focus-within { border-color: var(--nt-accent); box-shadow: 0 0 0 1px transparent; }
  .nt-ttu-link-wrap svg { width: 12px; height: 12px; stroke: var(--nt-muted); stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .nt-ttu-link-input { flex: 1; min-width: 0; background: transparent; border: none; color: var(--nt-text); font-family: var(--nt-font-mono, monospace); font-size: 11px; padding: 6px; outline: none !important; }
  .nt-ttu-link-input:focus { outline: none !important; box-shadow: none !important; }
  .nt-ttu-vol-input { width: 36px; background: transparent; border: none; border-bottom: 1px solid var(--nt-accent); color: var(--nt-accent); font-family: var(--nt-font-mono, monospace); font-size: 11px; text-align: right; outline: none !important; padding: 0 2px; }
  .nt-ttu-vol-input:focus { border-bottom-color: var(--nt-accentHover); }
  .nt-ttu-link-results { display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; display: none; }
  .nt-ttu-link-results.open { display: flex; }
  .nt-ttu-link-item { display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; border-radius: 4px; transition: background .15s; text-align: left; }
  .nt-ttu-link-item:hover { background: var(--nt-surfaceAlt, #13131f); }
  .nt-ttu-link-cover { width: 20px; height: 30px; object-fit: cover; border-radius: 2px; }
  .nt-ttu-link-info { display: flex; flex-direction: column; overflow: hidden; flex: 1; }
  .nt-ttu-link-t { font-size: 10px; color: var(--nt-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nt-ttu-history { border-top: 1px solid var(--nt-border); font-size: 12px; }
  .nt-ttu-history summary { padding: 10px 12px; cursor: pointer; color: var(--nt-muted); outline: none; user-select: none; transition: background 0.2s; }
  .nt-ttu-history summary:hover { background: var(--nt-surfaceAlt, #13131f); color: var(--nt-text); }
  .nt-ttu-history-list { max-height: 140px; overflow-y: auto; padding: 0 12px 12px 12px; display: flex; flex-direction: column; gap: 4px; }
  .nt-ttu-history-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--nt-text); background: var(--nt-surfaceAlt, #13131f); padding: 6px 8px; border-radius: 4px; }
  .nt-ttu-history-del { background: none; border: none; color: var(--nt-error) !important; cursor: pointer; font-size: 12px; line-height: 1; padding: 0 2px; opacity: .75; }
  .nt-ttu-history-del:hover { opacity: 1; }
  `;
  document.head.appendChild(s);
}

export function applyOverlayPosition(overlay: HTMLElement, pos: string) {
  overlay.style.setProperty('top', '', 'important');
  overlay.style.setProperty('bottom', '', 'important');
  overlay.style.setProperty('left', '', 'important');
  overlay.style.setProperty('right', '', 'important');

  if (pos === 'top-left') {
    overlay.style.setProperty('top', '16px', 'important');
    overlay.style.setProperty('left', '16px', 'important');
  } else if (pos === 'top-right') {
    overlay.style.setProperty('top', '16px', 'important');
    overlay.style.setProperty('right', '16px', 'important');
  } else if (pos === 'bottom-left') {
    overlay.style.setProperty('bottom', '16px', 'important');
    overlay.style.setProperty('left', '16px', 'important');
  } else if (pos === 'bottom-right') {
    overlay.style.setProperty('bottom', '16px', 'important');
    overlay.style.setProperty('right', '16px', 'important');
  }
}

export function injectOverlayCustomOverrides() {
  if (document.getElementById('nt-overlay-custom-overrides')) return;
  const style = document.createElement('style');
  style.id = 'nt-overlay-custom-overrides';
  style.textContent = `
    #nt-overlay {
      opacity: 0.35 !important;
      transition: opacity 0.15s ease-in-out !important;
    }
    #nt-overlay:hover {
      opacity: 1 !important;
    }
    #nt-overlay .nt-ctrl,
    #nt-overlay .nt-close {
      border: none !important;
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      outline: none !important;
      padding: 0 1px !important;
      margin: 0 !important;
      border-radius: 0 !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: 100% !important;
      line-height: 1 !important;
      vertical-align: middle !important;
    }
    #nt-overlay button {
      border: none !important;
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      outline: none !important;
    }
  `;
  document.head.appendChild(style);
}

export function updatePauseIconState(pauseBtn: HTMLButtonElement, isPaused: boolean) {
  pauseBtn.textContent = isPaused ? '▶' : '⏸';
  if (isPaused) {
    pauseBtn.style.setProperty('font-size', '10px', 'important');
    pauseBtn.style.setProperty('transform', 'none', 'important');
  } else {
    pauseBtn.style.setProperty('font-size', '13px', 'important');
    pauseBtn.style.setProperty('transform', 'translateY(-1px)', 'important');
  }
}

export function enforceOverlayLayout(overlay: HTMLElement) {
  overlay.style.setProperty('display', 'flex', 'important');
  overlay.style.setProperty('flex-direction', 'row', 'important');
  overlay.style.setProperty('align-items', 'center', 'important');
  overlay.style.setProperty('justify-content', 'space-between', 'important');
  overlay.style.setProperty('gap', '4px', 'important');
  overlay.style.setProperty('padding', '0 6px', 'important');
  overlay.style.setProperty('box-sizing', 'border-box', 'important');
  overlay.style.setProperty('white-space', 'nowrap', 'important');
  overlay.style.setProperty('height', '22px', 'important');
  overlay.style.setProperty('width', 'auto', 'important');
  overlay.style.setProperty('min-width', 'unset', 'important');
  overlay.style.setProperty('min-height', 'unset', 'important');
  overlay.style.setProperty('line-height', '1', 'important');

  const handle = overlay.querySelector('.nt-handle') as HTMLElement;
  if (handle) {
    handle.style.setProperty('display', 'inline-flex', 'important');
    handle.style.setProperty('align-items', 'center', 'important');
    handle.style.setProperty('justify-content', 'center', 'important');
    handle.style.setProperty('cursor', 'grab', 'important');
    handle.style.setProperty('user-select', 'none', 'important');
    handle.style.setProperty('margin-right', '1px', 'important');
    handle.style.setProperty('font-size', '10px', 'important');
    handle.style.setProperty('height', '100%', 'important');
    handle.style.setProperty('line-height', '1', 'important');
  }

  const timeEl = overlay.querySelector('.nt-time') as HTMLElement;
  if (timeEl) {
    timeEl.style.setProperty('display', 'inline-flex', 'important');
    timeEl.style.setProperty('align-items', 'center', 'important');
    timeEl.style.setProperty('justify-content', 'center', 'important');
    timeEl.style.setProperty('font-variant-numeric', 'tabular-nums', 'important');
    timeEl.style.setProperty('margin-right', '2px', 'important');
    timeEl.style.setProperty('font-size', '12px', 'important');
    timeEl.style.setProperty('height', '100%', 'important');
    timeEl.style.setProperty('line-height', '1', 'important');
  }

  const buttons = overlay.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.style.setProperty('display', 'inline-flex', 'important');
    btn.style.setProperty('align-items', 'center', 'important');
    btn.style.setProperty('justify-content', 'center', 'important');
    btn.style.setProperty('height', '100%', 'important');
    btn.style.setProperty('line-height', '1', 'important');
    btn.style.setProperty('vertical-align', 'middle', 'important');
  });
}

export function runOverlaySetup(cfg: any) {
  addDebugLog('INFO', 'TextTracker', `Building Overlay`, {
    url: window.location.href,
    pos: cfg.overlayPosition
  });

  if (overlayDismissed) {
    const existing = document.getElementById('nt-overlay');
    if (existing) existing.style.display = 'none';
    return;
  }

  let overlay = document.getElementById('nt-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'nt-overlay';
    const handle = document.createElement('div');
    handle.className = 'nt-handle'; handle.title = 'Drag to move'; handle.textContent = '⠿';
    const timeEl = document.createElement('span');
    timeEl.className = 'nt-time'; timeEl.textContent = '0:00'; timeEl.title = 'Click to edit';
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'nt-ctrl'; pauseBtn.title = 'Pause / Resume';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'nt-ctrl'; resetBtn.textContent = '↺'; resetBtn.title = 'Reset timer';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'nt-close'; closeBtn.textContent = '×'; closeBtn.title = 'Hide overlay (until reload)';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      overlayDismissed = true;
      overlay!.style.display = 'none';
    });

    updatePauseIconState(pauseBtn, false);
    resetBtn.style.setProperty('font-size', '11px', 'important');
    closeBtn.style.setProperty('font-size', '12px', 'important');

    overlay.append(handle, timeEl, pauseBtn, resetBtn, closeBtn);
    document.body.appendChild(overlay);

    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', e => {
      dragging = true;
      const r = overlay!.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      overlay!.style.setProperty('right', '', 'important');
      overlay!.style.setProperty('bottom', '', 'important');
      overlay!.style.setProperty('left', r.left + 'px', 'important');
      overlay!.style.setProperty('top', r.top + 'px', 'important');
      handle.style.cursor = 'grabbing'; e.preventDefault();
    });
    document.addEventListener('mousemove', e => { if (dragging) { overlay!.style.setProperty('left', (e.clientX - ox) + 'px', 'important'); overlay!.style.setProperty('top', (e.clientY - oy) + 'px', 'important'); } });
    document.addEventListener('mouseup', () => { if (dragging) { dragging = false; handle.style.cursor = 'grab'; } });

    pauseBtn.addEventListener('click', () => {
      const nt = (window as any).__nt_tracker_session_active_ms__;
      if (nt) {
        const nowPaused = !nt.isPaused();
        nt.pause(nowPaused);
        updatePauseIconState(pauseBtn, nowPaused);
        pauseBtn.classList.toggle('active', nowPaused);
      }
    });
    resetBtn.addEventListener('click', () => {
      const nt = (window as any).__nt_tracker_session_active_ms__;
      if (nt) nt.setMs(0);
    });
    timeEl.addEventListener('click', () => {
      const nt = (window as any).__nt_tracker_session_active_ms__;
      if (!nt) return;
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'nt-edit';
      input.value = fmt(nt.getTotal()); input.placeholder = 'M:SS';
      const commit = () => {
        const parts = input.value.split(':').map(Number);
        let ms = -1;
        if (!parts.some(isNaN)) {
          if (parts.length === 1) ms = parts[0] * 60 * 1000;
          else if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000;
          else if (parts.length === 3) ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        }
        if (ms >= 0) nt.setMs(ms);
        input.replaceWith(timeEl);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
      timeEl.replaceWith(input); input.focus(); input.select();
    });

    setInterval(() => {
      const nt = (window as any).__nt_tracker_session_active_ms__;
      if (nt) {
        timeEl.textContent = fmt(nt.getTotal());
        const isPaused = nt.isPaused();
        const curD = pauseBtn.textContent;
        if (isPaused && curD !== '▶') {
          updatePauseIconState(pauseBtn, true);
          pauseBtn.classList.add('active');
        } else if (!isPaused && curD !== '⏸') {
          updatePauseIconState(pauseBtn, false);
          pauseBtn.classList.remove('active');
        }
      }
    }, 1000);
  }

  const pos = cfg.overlayPosition ?? 'top-right';
  applyOverlayPosition(overlay, pos);
  injectOverlayCustomOverrides();
  enforceOverlayLayout(overlay);

  if (cfg.overlayPosition === 'hidden') overlay.style.setProperty('display', 'none', 'important');
  else overlay.style.setProperty('display', 'flex', 'important');
}
