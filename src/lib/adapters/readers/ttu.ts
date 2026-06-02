import type { ReaderAdapter, TrackerConfig } from '@/lib/types';
import { extractAdvancedCharCount } from '@/lib/utils/reader-char-extractor';

export const ttuAdapter: ReaderAdapter = {
  name: 'TTU Reader',
  hostname: 'reader.ttsu.app',

  isEnabled(config: TrackerConfig): boolean {
    return config.ttuEnabled !== false;
  },

  getThemeOverride(config: TrackerConfig): string | undefined {
    return config.ttuThemeOverride;
  },

  findInsertPoint(): { el: Element; pos: InsertPosition } | null {
    const footer = document.querySelector('.book-footer, .writing-container + div, #writing-container + div');
    if (footer) return { el: footer, pos: 'beforebegin' };
    return document.body ? { el: document.body, pos: 'beforeend' } : null;
  },

  extractCharCount(): number | null {
    const advancedCount = extractAdvancedCharCount();
    if (advancedCount !== null) return advancedCount.current;

    const statsElements = document.querySelectorAll('.book-stats span, .explorable-container .footer-stat');
    for (const element of statsElements) {
      const text = (element as HTMLElement).innerText || '';
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

  getTitle(rawTitle?: string): string {
    const raw = rawTitle || document.title;
    return raw.replace(/\s*\|\s*ッツ Ebook Reader\s*/i, '')
              .replace(/\s*[–—-]\s*ttu.*$/i, '')
              .trim() || raw;
  },

  isReadingViewActive(doc: Document): boolean {
    return !!doc.querySelector('.book-content-container, .book-content');
  },

  onTick(_ttuState: any, _stateRefs: any): void {
    // Left empty for future platform-specific updates
  }
};
