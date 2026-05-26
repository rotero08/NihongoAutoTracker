import type { TrackerConfig, ReaderAdapter } from '@/lib/types';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';

export const yatsuAdapter: ReaderAdapter = {
  name: 'Yatsu Reader',
  hostname: 'app.yatsu.moe',

  isEnabled(config: TrackerConfig): boolean {
    return config.yatsuEnabled !== false;
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