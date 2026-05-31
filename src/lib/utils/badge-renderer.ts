/**
 * ── Badge Renderer ───────────────────────────────────────────────────────────
 *
 * Manages player status badges. Contains structural styling rules, hover 
 * and absolute coordinate alignment logic, and classifications constraints.
 */

import { DYNAMIC_LOGO_SVG } from '@/lib/ui/themes';
import { BADGE_ID, BADGE_LOGO_CLASS, BADGE_TIME_CLASS, createBadgeInnerHTML, shouldHideBadge } from '@/lib/ui/video-badge';
import { setSafeHTML } from '@/lib/utils/dom';
import { fmtSecs } from '@/lib/utils/time';

export class BadgeRenderer {
    private lastCounterPaint = 0;

    constructor(
        private getTimestampContainer: (vid: HTMLVideoElement) => HTMLElement | null,
        private isAdPlaying: () => boolean,
        private getJapaneseClassification: () => { isJapanese: boolean; isMusic: boolean }
    ) { }

    public ensureCounter(
        currentSecs: number,
        totalSecs: number,
        url: string,
        channelId: string | null,
        channelName: string,
        cfg: any,
        vid: HTMLVideoElement,
        state: { hasTriggered: boolean; isManualLogging: boolean },
        onBadgeClick: () => void
    ): void {
        let el = document.getElementById(BADGE_ID) as HTMLElement | null;

        const now = performance.now();
        if (el && now - this.lastCounterPaint < 500) {
            const timeLabel = el.querySelector<HTMLElement>(`.${BADGE_TIME_CLASS}`);
            if (timeLabel) {
                const multiSession = totalSecs > currentSecs + 2;
                const showTotal = cfg.showTotalInBadge ?? true;
                const currentStr = fmtSecs(currentSecs);
                timeLabel.textContent = (multiSession && showTotal)
                    ? `${currentStr} / ${fmtSecs(totalSecs)}`
                    : currentStr;
            }
            return;
        }

        const { isJapanese, isMusic } = this.getJapaneseClassification();
        const shouldHide = shouldHideBadge(cfg, isJapanese, isMusic) || this.isAdPlaying();
        if (shouldHide) {
            el?.remove();
            return;
        }

        const multiSession = totalSecs > currentSecs + 2;
        const showTotal = cfg.showTotalInBadge ?? true;

        if (!el) {
            const container = this.getTimestampContainer(vid);
            if (!container) return;

            el = document.createElement('div');
            el.id = BADGE_ID;
            el.style.position = 'relative';
            el.style.cursor = 'pointer';
            el.style.display = 'inline-flex';
            el.style.alignItems = 'center';
            el.style.height = '100%';
            el.style.padding = '0 6px';

            const isFallback = container.classList.contains('video-player-container') ||
                container.id === 'movie_player' ||
                container.classList.contains('plyr__video-wrapper') ||
                container.classList.contains('jw-media') ||
                container === vid.parentElement;
            if (isFallback) el.classList.add('nt-absolute-pill');

            // Embedded inline style specifications to dynamically strip dropshadows/filters on icon & badge layers
            setSafeHTML(el, `
        <div class="nt-pill-visual-wrapper" style="display:flex; align-items:center; gap:6px; box-shadow:none !important; filter:none !important; text-shadow:none !important;">
          <div class="${BADGE_LOGO_CLASS}" style="width:18px; height:18px; flex-shrink:0; display:flex; align-items:center; justify-content:center; box-shadow:none !important; filter:none !important;">
            ${DYNAMIC_LOGO_SVG}
          </div>
          <span class="${BADGE_TIME_CLASS}" style="box-shadow:none !important; text-shadow:none !important;">0:00</span>
        </div>
      `);

            el.onclick = (e) => {
                e.stopPropagation();
                onBadgeClick();
            };

            container.appendChild(el);
        }

        this.lastCounterPaint = now;

        const timeLabel = el.querySelector<HTMLElement>(`.${BADGE_TIME_CLASS}`)!;
        const currentStr = fmtSecs(currentSecs);
        timeLabel.textContent = (multiSession && showTotal)
            ? `${currentStr} / ${fmtSecs(totalSecs)}`
            : currentStr;
        el.title = 'Log this video manually';
    }
}