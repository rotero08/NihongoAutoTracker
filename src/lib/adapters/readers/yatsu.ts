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
      wrapper.style.setProperty('margin-left', '12px', 'important');
      wrapper.style.setProperty('gap', '12px', 'important');
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

  getTitle(): string {
    return document.title.replace(/\s*\|\s*Yatsu Reader\s*/i, '').trim() || document.title;
  },
};