/**
 * ── TTU Reader Adapter ───────────────────────────────────────────────────────
 *
 * Implements the ReaderAdapter interface for the ッツ (TTU) Ebook Reader.
 * Handles character count extraction from TTU's progress display and
 * provides the correct DOM insertion point for the overlay.
 *
 * TTU exposes reading progress through its footer stats bar, which shows
 * characters read / total characters. This adapter parses that display.
 */

import type { TrackerConfig } from '../../types';
import type { ReaderAdapter } from './types';

export const ttuAdapter: ReaderAdapter = {
  name: 'TTU Reader',
  hostname: 'reader.ttsu.app',

  isEnabled(config: TrackerConfig): boolean {
    return config.ttuEnabled !== false;
  },

  findInsertPoint(): { el: Element; pos: InsertPosition } | null {
    /* TTU's footer stats bar — insert the overlay before it */
    const footer = document.querySelector('.book-footer, .writing-container + div, #writing-container + div');
    if (footer) return { el: footer, pos: 'beforebegin' };

    /* Fallback to body */
    return document.body ? { el: document.body, pos: 'beforeend' } : null;
  },

  extractCharCount(): number | null {
    /* TTU displays "X / Y" characters in the footer/stats area */
    const statsEls = document.querySelectorAll('.book-stats span, .explorable-container .footer-stat');

    for (const el of statsEls) {
      const text = (el as HTMLElement).innerText || '';
      /* Match patterns like "12345 / 67890" or "12,345 / 67,890" */
      const match = text.match(/([\d,]+)\s*\/\s*([\d,]+)/);
      if (match) {
        const current = parseInt(match[1].replace(/,/g, ''), 10);
        if (!isNaN(current) && current > 0) return current;
      }
    }

    /* Alternative: some TTU versions expose progress as a percentage */
    const progressBar = document.querySelector<HTMLElement>('.progress-bar, [role="progressbar"]');
    if (progressBar) {
      const width = parseFloat(progressBar.style.width || '0');
      const total = parseInt(progressBar.getAttribute('aria-valuemax') || '0', 10);
      if (total > 0 && width > 0) return Math.round((width / 100) * total);
    }

    return null;
  },

  getTitle(): string {
    /* TTU adds " | ッツ Ebook Reader" to the title */
    const raw = document.title;
    return raw.replace(/\s*\|\s*ッツ Ebook Reader\s*/i, '').trim() || raw;
  },
};
