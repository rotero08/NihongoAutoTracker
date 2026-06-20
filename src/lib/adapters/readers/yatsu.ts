import type { ReaderAdapter, TrackerConfig } from '@/lib/types';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';

export const yatsuAdapter: ReaderAdapter = {
  name: 'Yatsu Reader',
  hostname: 'app.yatsu.moe',

  isEnabled(config: TrackerConfig): boolean {
    return config.yatsuEnabled !== false;
  },

  getThemeOverride(config: TrackerConfig): string | undefined {
    return config.yatsuThemeOverride;
  },

  onUpdateStyles(wrapper: HTMLElement): void {
    const readerArea = document.querySelector('#reader-container, .reader-wrapper, #ttu-page-footer');
    const isWhispersyncActive = !!(
      readerArea && (
        readerArea.querySelector('[class*="whispersync"], [id*="whispersync"]') ||
        Array.from(readerArea.querySelectorAll('button, div, span')).some(el =>
          el.textContent?.toLowerCase().includes('whispersync')
        )
      )
    );
    if (isWhispersyncActive) {
      wrapper.style.setProperty('gap', '12px', 'important');

      const alignChronoIcon = () => {
        const footer = document.getElementById('ttu-page-footer');
        if (!footer) return;

        const buttons = Array.from(footer.querySelectorAll('button'))
          .filter(btn => btn.id !== 'nt-ttu-chrono-btn' && btn.offsetWidth > 0);

        if (buttons.length === 0) {
          wrapper.style.setProperty('margin-left', '12px', 'important');
          return;
        }

        buttons.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

        let d = 1;

        if (buttons.length >= 2) {
          const r0 = buttons[0].getBoundingClientRect();
          const r1 = buttons[1].getBoundingClientRect();
          const measuredGap = r1.left - r0.right;
          if (measuredGap > 0) {
            d = measuredGap;
          }
        } else {
          const footerStyle = window.getComputedStyle(footer);
          const gapVal = parseFloat(footerStyle.gap || footerStyle.columnGap);
          if (!isNaN(gapVal) && gapVal > 0) {
            d = gapVal;
          }
        }

        const BL = buttons[buttons.length - 1];
        const rectBL = BL.getBoundingClientRect();

        const chronoBtn = wrapper.querySelector('#nt-ttu-chrono-btn') || wrapper;
        const rectC = chronoBtn.getBoundingClientRect();

        const currentMargin = parseFloat(window.getComputedStyle(wrapper).marginLeft) || 0;
        const newMargin = d - (rectC.left - rectBL.right) + currentMargin;

        if (newMargin >= -200 && newMargin < 100) {
          wrapper.style.setProperty('margin-left', `${newMargin}px`, 'important');
        } else {
          wrapper.style.setProperty('margin-left', `${d}px`, 'important');
        }
      };

      alignChronoIcon();
      requestAnimationFrame(alignChronoIcon);
      setTimeout(alignChronoIcon, 100);
      setTimeout(alignChronoIcon, 500);
    } else {
      wrapper.style.removeProperty('margin-left');
      wrapper.style.removeProperty('gap');
    }
  },

  findInsertPoint() {
    const container = document.querySelector('#reader-container, .reader-wrapper, main');
    if (container) return { el: container, pos: 'beforeend' };
    return document.body ? { el: document.body, pos: 'beforeend' } : null;
  },

  extractCharCount(): number | null {
    const advancedCount = extractAdvancedCharCount('#reader-container, .book-content, [data-ref="container"]');
    if (advancedCount !== null) return advancedCount.current;

    const statsElements = document.querySelectorAll('.stats span, .reader-stats span, [data-chars]');
    for (const element of statsElements) {
      const text = (element as HTMLElement).innerText || '';
      const match = text.match(/([\d,]+)\s*\/\s*([\d,]+)/);
      if (match) {
        const current = parseInt(match[1].replace(/,/g, ''), 10);
        if (!isNaN(current) && current > 0) return current;
      }
    }
    return null;
  },

  getTitle(rawTitle?: string): string {
    const raw = rawTitle || document.title;
    return raw.replace(/\s*\|\s*Yatsu Reader\s*/i, '').trim() || raw;
  },

  isReadingViewActive(doc: Document): boolean {
    return !!doc.querySelector('#reader-container, .reader-wrapper, [data-ref="container"], .book-content, .book-content-container, .writing-container, #writing-container');
  },

  onTick(_ttuState: any, _stateRefs: any): void {
    // Left empty for future platform-specific updates
  }
};
