import type { ReaderAdapter, TrackerConfig } from '@/lib/types';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';

export const yomiyasuAdapter: ReaderAdapter = {
  name: 'YomiYasu Reader',
  hostname: 'manga.manabe.es',

  isEnabled(config: TrackerConfig): boolean {
    return config.yomiyasuEnabled !== false;
  },

  getThemeOverride(config: TrackerConfig): string | undefined {
    return config.yomiyasuThemeOverride;
  },

  findInsertPoint() {
    const container = document.querySelector('.reader-container, main, #app');
    if (container) return { el: container, pos: 'beforeend' };
    return document.body ? { el: document.body, pos: 'beforeend' } : null;
  },

  extractCharCount(): number | null {
    const advancedCount = extractAdvancedCharCount('.reader-container, .book-content');
    if (advancedCount !== null) return advancedCount.current;

    const pageElements = document.querySelectorAll('.page-indicator, [data-page], .current-page');
    for (const element of pageElements) {
      const text = (element as HTMLElement).innerText || '';
      const match = text.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        const current = parseInt(match[1], 10);
        if (!isNaN(current) && current > 0) return current;
      }
    }
    return null;
  },

  getTitle(rawTitle?: string): string {
    const raw = rawTitle || document.title;
    return raw.replace(/\s*\|\s*YomiYasu Reader\s*/i, '')
              .replace(/^YomiYasu\s*-\s*/i, '')
              .trim() || raw;
  },

  isReadingViewActive(doc: Document): boolean {
    return !!doc.querySelector('.reader-container, .book-content, .writing-container, #writing-container');
  },

  onTick(_ttuState: any, _stateRefs: any): void {
    // Left empty for future platform-specific updates
  }
};
