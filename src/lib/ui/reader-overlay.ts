/**
 * ── Reader Overlay Styles ───────────────────────────────────────────────────
 *
 * CSS for the reading chronometer overlay injected by the text-tracker
 * content script on Japanese reading sites (TTU, Yatsu, Manabe, etc.).
 *
 * The overlay is a small draggable widget showing:
 * - Current reading time (HH:MM:SS)
 * - Character count
 * - Book linking status
 *
 * Extracted from text-tracker.content.ts to allow future per-site theming.
 * The text-tracker still handles DOM creation and interaction — this module
 * only provides the style injection function.
 *
 */

/**
 * ── Dynamic Theme & Reader Overlay Injector ──────────────────────────────────
 */
import { getTheme } from './themes';
import { fmt } from '../utils/time';

export function injectThemeStyles(themeName: string, fontName: string) {
  const theme = getTheme(themeName);
  let style = document.getElementById('nt-theme-styles') as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = 'nt-theme-styles';
    document.head.appendChild(style);
  }

  const fontValue = fontName === 'sans' ? "system-ui, -apple-system, sans-serif" : (fontName === 'serif' ? "Georgia, serif" : "'Courier New', monospace");

  style.textContent = `
    :root {
      --nt-bg: ${theme.colors.bg};
      --nt-surface: ${theme.colors.surface};
      --nt-surfaceAlt: ${theme.colors.surfaceAlt};
      --nt-border: ${theme.colors.border};
      --nt-borderHover: ${theme.colors.borderHover};
      --nt-text: ${theme.colors.text};
      --nt-muted: ${theme.colors.muted};
      --nt-accent: ${theme.colors.accent};
      --nt-accentHover: ${theme.colors.accentHover};
      --nt-success: ${theme.colors.success};
      --nt-error: ${theme.colors.error};
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
  #nt-ttu-chrono-wrapper { position: relative; display: flex; z-index: 40; font-family: var(--nt-font, sans-serif); align-items: center; justify-content: center; flex-shrink: 0; width: 2rem; height: 100%; }
  #nt-ttu-chrono-btn { background: transparent; border: none; cursor: pointer; display: flex; padding: 0; width: 100%; height: 100%; color: var(--nt-accent); transition: opacity 0.15s ease; align-items: center; justify-content: center; user-select: none; }
  #nt-ttu-chrono-btn:hover { opacity: 0.7; color: var(--nt-accentHover) !important; }
  #nt-ttu-chrono-btn:active { transform: scale(0.92); }
  #nt-ttu-chrono-btn svg { width: 1.7rem; height: 1.7rem; fill: currentColor; }
  #nt-ttu-dropdown { position: absolute; bottom: 100%; left: 0 !important; right: auto !important; margin-bottom: 8px; background: var(--nt-surface, #252525); border: 1px solid var(--nt-border, #3a3a3a); border-radius: var(--nt-rounded-box, 6px); width: 280px; color: var(--nt-text); box-shadow: 0 8px 24px rgba(0,0,0,0.8); display: none; flex-direction: column; overflow: hidden; writing-mode: horizontal-tb; text-align: left; direction: ltr; transform-origin: bottom left !important; cursor: default; font-family: var(--nt-font, sans-serif); }
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
  .nt-ttu-link-compact { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--nt-success); padding: 4px 6px; border-radius: 4px; transition: background .15s; background: rgba(61,220,132,0.05); }
  .nt-ttu-link-compact-inner { display: flex; align-items: center; gap: 6px; cursor: pointer; flex: 1; }
  .nt-ttu-link-compact-inner:hover { opacity: 0.8; }
  .nt-ttu-unlink-btn { background: none; border: none; color: var(--nt-error); cursor: pointer; padding: 2px; display: flex; align-items: center; opacity: 0.6; transition: opacity .15s; }
  .nt-ttu-unlink-btn:hover { opacity: 1; }
  .nt-ttu-vol-pill { background: transparent; border: none; color: var(--nt-accent); font-family: var(--nt-font-mono, monospace); font-size: 11px; padding: 0 6px; cursor: pointer; opacity: .95; }
  .nt-ttu-vol-pill:hover { opacity: 1; }
  .nt-ttu-vol-pill:active { transform: scale(0.98); }
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
  .nt-ttu-history-del { background: none; border: none; color: var(--nt-error); cursor: pointer; font-size: 12px; line-height: 1; padding: 0 2px; opacity: .75; }
  .nt-ttu-history-del:hover { opacity: 1; }
  `;
  document.head.appendChild(s);
}

export function buildOverlay(
  cfg: any,
  dismissedState: { dismissed: boolean },
  onPauseToggle: (isPaused: boolean) => void,
  onReset: () => void,
  onManualTimeEdit: (ms: number) => void,
  getTimeFunc: () => number,
  onDismiss: () => void
) {
  if (dismissedState.dismissed) {
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
    closeBtn.className = 'nt-close'; closeBtn.textContent = '×'; closeBtn.title = 'Hide overlay (until reload)';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissedState.dismissed = true;
      overlay!.style.display = 'none';
      onDismiss();
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
    document.addEventListener('mousemove', e => { if (dragging) { overlay!.style.left = (e.clientX - ox) + 'px'; overlay!.style.top = (e.clientY - oy) + 'px'; } });
    document.addEventListener('mouseup', () => { if (dragging) { dragging = false; handle.style.cursor = 'grab'; } });

    pauseBtn.addEventListener('click', () => {
      const nt = (window as any).__nt;
      const nowPaused = !nt.isPaused();
      onPauseToggle(nowPaused);
      pauseBtn.textContent = nowPaused ? '▶' : '⏸';
      pauseBtn.classList.toggle('active', nowPaused);
    });
    resetBtn.addEventListener('click', onReset);
    timeEl.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'nt-edit';
      input.value = fmt(getTimeFunc()); input.placeholder = 'M:SS';
      const commit = () => {
        const parts = input.value.split(':').map(Number);
        let ms = -1;
        if (!parts.some(isNaN)) {
          if (parts.length === 1) ms = parts[0] * 60 * 1000;
          else if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000;
          else if (parts.length === 3) ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        }
        if (ms >= 0) onManualTimeEdit(ms);
        input.replaceWith(timeEl);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
      timeEl.replaceWith(input); input.focus(); input.select();
    });
    setInterval(() => { timeEl.textContent = fmt(getTimeFunc()); }, 1000);
  }

  const pos = cfg.overlayPosition ?? 'top-right';
  overlay.style.top = ''; overlay.style.bottom = ''; overlay.style.left = ''; overlay.style.right = '';
  if (pos === 'top-left') { overlay.style.top = '16px'; overlay.style.left = '16px'; }
  if (pos === 'top-right') { overlay.style.top = '16px'; overlay.style.right = '16px'; }
  if (pos === 'bottom-left') { overlay.style.bottom = '16px'; overlay.style.left = '16px'; }
  if (pos === 'bottom-right') { overlay.style.bottom = '16px'; overlay.style.right = '16px'; }

  if (cfg.overlayPosition === 'hidden') overlay.style.display = 'none';
  else overlay.style.display = 'flex';
}