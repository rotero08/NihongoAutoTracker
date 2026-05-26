/**
 * ── Queue Storage ────────────────────────────────────────────────────────────
 *
 * Manages the video and reading queue items waiting to be sent to NihongoTracker.
 * These queues are the bridge between content script tracking and manual/automatic
 * log submission from the popup or settings pages.
 *
 * Each queue is stored as an array in browser.storage.local and can be watched
 * for real-time updates across all extension contexts (popup, settings, background).
 */

import { storage } from 'wxt/utils/storage';
import type { QueuedReadingLog, QueuedVideoLog } from '../types';

/**
 * Video queue — stores videos tracked by the video tracker that haven't
 * been submitted to NihongoTracker yet.
 *
 * Items are added by the video-tracker content script when the user
 * watches enough of a Japanese video (passes the queue threshold).
 * Items are consumed when the user clicks "Send" in the popup/settings,
 * or when the EOD auto-send triggers.
 */
export const videoQueueStorage = storage.defineItem<QueuedVideoLog[]>('local:videoQueue', {
  fallback: [],
});

/**
 * Reading queue — stores reading sessions tracked by reader content scripts
 * (TTU, Yatsu, Manabe) that haven't been submitted yet.
 *
 * Items accumulate sessions over time (each reading session is appended).
 * The total time and character count are aggregated from all sessions.
 */
export const readingQueueStorage = storage.defineItem<QueuedReadingLog[]>('local:readingQueue', {
  fallback: [],
});
