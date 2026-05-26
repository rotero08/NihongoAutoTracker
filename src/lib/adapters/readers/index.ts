import type { ReaderAdapter } from '@/lib/types';
import { ttuAdapter } from './ttu';
import { yatsuAdapter } from './yatsu';
import { manabeAdapter } from './manabe';

/** Central list of supported reading platform adapters */
export const READER_ADAPTERS: ReaderAdapter[] = [
    ttuAdapter,
    yatsuAdapter,
    manabeAdapter
];

/**
 * Detects and returns the active reader adapter for the current hostname.
 */
export function getActiveReaderAdapter(): ReaderAdapter | null {
    const currentHostname = window.location.hostname;
    return READER_ADAPTERS.find(adapter => currentHostname.includes(adapter.hostname)) || null;
}