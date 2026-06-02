/**
 * ── Overlay Controller ───────────────────────────────────────────────────────
 *
 * Manages the injection, visibility, coordinates, and rendering state of the 
 * reading overlay displayed on non-integrated standard Japanese pages.
 */

import { getActiveThemeName } from '@/lib/ui/text-tracker-theme-manager';
import {
  applyOverlayPosition,
  enforceOverlayLayout,
  getOverlayDismissed,
  injectOverlayCustomOverrides,
  injectThemeStyles,
  isWebsiteOverlaySkipped,
  runOverlaySetup,
  updatePauseIconState
} from '@/lib/ui/reader-overlay';

export class OverlayController {
    private overlayElement: HTMLElement | null = null;

    constructor(private isJapanesePageCallback: (cfg: any) => Promise<boolean>) { }

    /**
     * Resolves the active overlay element in the DOM.
     */
    public getOverlayElement(): HTMLElement | null {
        if (this.overlayElement && this.overlayElement.isConnected) {
            return this.overlayElement;
        }
        this.overlayElement = document.getElementById('nt-overlay') || document.getElementById('nt-ttu-chrono-wrapper');
        return this.overlayElement;
    }

    /**
     * Runs the automated detection logic to conditionally display the reading overlay.
     */
    public async checkAndRunOverlay(cfg: any, isAnalyzingRef: { value: boolean }): Promise<void> {
        if (window.self !== window.top) return;
        if (isWebsiteOverlaySkipped(cfg)) return;
        if (window.location.hostname.includes('manga.manabe.es')) return;
        if (isAnalyzingRef.value) return;

        const existing = this.getOverlayElement();
        if (existing) return;

        isAnalyzingRef.value = true;
        try {
            const isJP = await this.isJapanesePageCallback(cfg);
            if (isJP && cfg.overlayPosition !== 'hidden' && !this.getOverlayElement()) {
                runOverlaySetup(cfg);
            }
        } finally {
            isAnalyzingRef.value = false;
        }
    }

    /**
     * Refreshes the color themes and spatial orientation layout of the overlay.
     */
    public updateOverlayStylesAndPosition(cfg: any): void {
        if (window.self !== window.top) return;

        if (isWebsiteOverlaySkipped(cfg) || getOverlayDismissed()) {
            const overlay = this.getOverlayElement();
            if (overlay) overlay.style.display = 'none';
            return;
        }

        const themeName = getActiveThemeName(cfg);
        let customColors: any = undefined;
        if (themeName.startsWith('custom_') || themeName.startsWith('custom-') || themeName === 'custom') {
            const id = themeName.replace('custom_', '').replace('custom-', '');
            const customTheme = (cfg.customThemes || []).find((t: any) => t.id === id || t.id === themeName);
            if (customTheme) {
                customColors = customTheme.colors;
            } else if (cfg.customColors) {
                customColors = cfg.customColors;
            }
        }

        injectThemeStyles(themeName, cfg.font ?? 'sans', customColors);

        const existingOverlay = this.getOverlayElement();
        if (existingOverlay && existingOverlay.id === 'nt-overlay') {
            const overlayPos = cfg.overlayPosition ?? 'top-right';
            if (overlayPos !== 'hidden') {
                existingOverlay.style.setProperty('display', 'flex', 'important');
                applyOverlayPosition(existingOverlay, overlayPos);
                injectOverlayCustomOverrides();
                enforceOverlayLayout(existingOverlay);

                const pauseBtn = existingOverlay.querySelector('.nt-ctrl[title="Pause / Resume"]') as HTMLButtonElement;
                if (pauseBtn) {
                    updatePauseIconState(pauseBtn, pauseBtn.textContent === '▶');
                }
                const resetBtn = existingOverlay.querySelector('.nt-ctrl[title="Reset timer"]') as HTMLElement;
                if (resetBtn) resetBtn.style.setProperty('font-size', '11px', 'important');
                const closeBtn = existingOverlay.querySelector('.nt-close') as HTMLElement;
                if (closeBtn) closeBtn.style.setProperty('font-size', '12px', 'important');
            } else {
                existingOverlay.style.setProperty('display', 'none', 'important');
            }
        }
    }
}
