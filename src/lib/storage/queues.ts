/**
 * ── Queue Storage ────────────────────────────────────────────────────────────
 *
 * Manages the video and reading queue items waiting to be sent to NihongoTracker.
 * Prevents asynchronous race conditions during multiple concurrent operations.
 */

import { storage } from 'wxt/utils/storage';
import type { QueuedReadingLog, QueuedVideoLog } from '../types';

/**
 * Video queue — stores videos tracked by the video tracker that haven't
 * been submitted to NihongoTracker yet.
 */
export const videoQueueStorage = storage.defineItem<QueuedVideoLog[]>('local:videoQueue', {
  fallback: [],
});

/**
 * Reading queue — stores reading sessions tracked by reader content scripts
 * (TTU, Yatsu, Manabe) that haven't been submitted yet.
 */
export const readingQueueStorage = storage.defineItem<QueuedReadingLog[]>('local:readingQueue', {
  fallback: [],
});

/**
 * Central transaction queue promise chain to enforce strict serialization of reads and writes.
 */
let queueWritePromiseChain: Promise<any> = Promise.resolve();

/**
 * Executes an atomic queue transaction sequentially, eliminating read-modify-write race conditions.
 */
export async function executeQueueTransaction<T>(transaction: () => Promise<T>): Promise<T> {
  const next = queueWritePromiseChain.then(transaction);
  queueWritePromiseChain = next.catch(() => { });
  return next;
}

/**
 * Atomically updates the video queue in local storage.
 *
 * @param modifier - Synchronous or asynchronous callback that modifies the queue state
 */
export async function updateVideoQueueAtomic(
  modifier: (currentQueue: QueuedVideoLog[]) => QueuedVideoLog[] | Promise<QueuedVideoLog[]>
): Promise<QueuedVideoLog[]> {
  return executeQueueTransaction(async () => {
    const current = await videoQueueStorage.getValue();
    const updated = await modifier(current);
    await videoQueueStorage.setValue(updated);
    return updated;
  });
}

/**
 * Atomically updates the reading queue in local storage.
 *
 * @param modifier - Synchronous or asynchronous callback that modifies the queue state
 */
export async function updateReadingQueueAtomic(
  modifier: (currentQueue: QueuedReadingLog[]) => QueuedReadingLog[] | Promise<QueuedReadingLog[]>
): Promise<QueuedReadingLog[]> {
  return executeQueueTransaction(async () => {
    const current = await readingQueueStorage.getValue();
    const updated = await modifier(current);
    await readingQueueStorage.setValue(updated);
    return updated;
  });
}
