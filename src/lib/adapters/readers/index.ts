import type { ReaderAdapter } from '@/lib/types';
import { ttuAdapter } from './ttu';
import { yatsuAdapter } from './yatsu';
import { yomiyasuAdapter } from './yomiyasu';

/** Central list of supported reading platform adapters */
export const READER_ADAPTERS: ReaderAdapter[] = [
    ttuAdapter,
    yatsuAdapter,
    yomiyasuAdapter
];

/**
 * Detects and returns the active reader adapter for the current hostname.
 */
export function getActiveReaderAdapter(): ReaderAdapter | null {
    const currentHostname = window.location.hostname;
    const adapter = READER_ADAPTERS.find(adapter => currentHostname.includes(adapter.hostname)) || null;

    // For YomiYasu Reader, the adapter should only activate inside the nested iframe,
    // never in the top-level parent frame that merely embeds it.
    if (adapter && adapter.hostname === 'manga.manabe.es') {
        if (typeof window !== 'undefined' && window.self === window.top) {
            return null;
        }
    }
    return adapter;
}
