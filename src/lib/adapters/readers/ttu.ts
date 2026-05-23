import type { TrackerConfig } from '../../types';
import type { ReaderAdapter } from './types';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';

export const ttuAdapter: ReaderAdapter = {
  name: 'TTU Reader',
  hostname: 'reader.ttsu.app',

  isEnabled(config: TrackerConfig): boolean {
    return config.ttuEnabled !== false;
  },

  findInsertPoint(): { el: Element; pos: InsertPosition } | null {
    const footer = document.querySelector('.book-footer, .writing-container + div, #writing-container + div');
    if (footer) return { el: footer, pos: 'beforebegin' };
    return document.body ? { el: document.body, pos: 'beforeend' } : null;
  },

  extractCharCount(): number | null {
    const advancedCount = extractAdvancedCharCount();
    if (advancedCount !== null) return advancedCount;

    // Fallback: TTU displays "X / Y" characters in footer stats area
    const statsEls = document.querySelectorAll('.book-stats span, .explorable-container .footer-stat');
    for (const el of statsEls) {
      const text = (el as HTMLElement).innerText || '';
      const match = text.match(/([\d,]+)\s*\/\s*([\d,]+)/);
      if (match) {
        const current = parseInt(match[1].replace(/,/g, ''), 10);
        if (!isNaN(current) && current > 0) return current;
      }
    }

    const progressBar = document.querySelector<HTMLElement>('.progress-bar, [role="progressbar"]');
    if (progressBar) {
      const width = parseFloat(progressBar.style.width || '0');
      const total = parseInt(progressBar.getAttribute('aria-valuemax') || '0', 10);
      if (total > 0 && width > 0) return Math.round((width / 100) * total);
    }

    return null;
  },

  getTitle(): string {
    const raw = document.title;
    return raw.replace(/\s*\|\s*ッツ Ebook Reader\s*/i, '').trim() || raw;
  },
};