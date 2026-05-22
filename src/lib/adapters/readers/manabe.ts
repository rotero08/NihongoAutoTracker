/**
 * ── Manabe Reader Adapter ────────────────────────────────────────────────────
 * Implements ReaderAdapter for manga.manabe.es.
 */
import type { TrackerConfig } from '../../types';
import type { ReaderAdapter } from './types';

export const manabeAdapter: ReaderAdapter = {
  name: 'Manabe Reader',
  hostname: 'manga.manabe.es',

  isEnabled(config: TrackerConfig): boolean {
    return config.manabeEnabled !== false;
  },

  findInsertPoint() {
    const c = document.querySelector('.reader-container, main, #app');
    if (c) return { el: c, pos: 'beforeend' as InsertPosition };
    return document.body ? { el: document.body, pos: 'beforeend' as InsertPosition } : null;
  },

  extractCharCount(): number | null {
    /* Manabe uses page-based tracking as a character proxy */
    const pageEls = document.querySelectorAll('.page-indicator, [data-page], .current-page');
    for (const el of pageEls) {
      const text = (el as HTMLElement).innerText || '';
      const match = text.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        const current = parseInt(match[1], 10);
        if (!isNaN(current) && current > 0) return current;
      }
    }
    return null;
  },

  getTitle(): string {
    return document.title.replace(/\s*\|\s*Manabe Reader\s*/i, '').trim() || document.title;
  },
};
