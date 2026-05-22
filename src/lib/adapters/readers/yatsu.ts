/**
 * ── Yatsu Reader Adapter ─────────────────────────────────────────────────────
 * Implements ReaderAdapter for app.yatsu.moe.
 */
import type { TrackerConfig } from '../../types';
import type { ReaderAdapter } from './types';

export const yatsuAdapter: ReaderAdapter = {
  name: 'Yatsu Reader',
  hostname: 'app.yatsu.moe',

  isEnabled(config: TrackerConfig): boolean {
    return config.yatsuEnabled !== false;
  },

  findInsertPoint() {
    const c = document.querySelector('#reader-container, .reader-wrapper, main');
    if (c) return { el: c, pos: 'beforeend' as InsertPosition };
    return document.body ? { el: document.body, pos: 'beforeend' as InsertPosition } : null;
  },

  extractCharCount(): number | null {
    const statsEls = document.querySelectorAll('.stats span, .reader-stats span, [data-chars]');
    for (const el of statsEls) {
      const text = (el as HTMLElement).innerText || '';
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
