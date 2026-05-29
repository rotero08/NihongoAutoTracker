/**
 * ── Queue Storage ────────────────────────────────────────────────────────────
 *
 * Manages the video and reading queue items waiting to be sent to NihongoTracker.
 * Prevents asynchronous race conditions during multiple concurrent operations.
 * Upgraded with exhaustive DEV warnings to trace transactional queue lock states.
 */

import { storage } from 'wxt/utils/storage';
import { addDebugLog } from '../storage/debug';
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
  if (import.meta.env.DEV) {
    console.log(`[NAT DEV - Queue] Queue transaction queued. Lock pending...`);
  }
  const next = queueWritePromiseChain.then(transaction);
  queueWritePromiseChain = next.catch((err) => {
    if (import.meta.env.DEV) {
      console.error(`[NAT DEV - Queue] Lock chain caught error in transaction:`, err);
    }
  });
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
    try {
      const current = await videoQueueStorage.getValue();
      const updated = await modifier(current);
      await videoQueueStorage.setValue(updated);

      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - Queue] Video queue atomically updated. Size shifted from ${current.length} to ${updated.length}`);
      }
      return updated;
    } catch (err) {
      await addDebugLog('ERROR', 'Queue', 'Failed to update video queue atomically', err);
      throw err;
    }
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
    try {
      const current = await readingQueueStorage.getValue();
      const updated = await modifier(current);
      await readingQueueStorage.setValue(updated);

      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - Queue] Reading queue atomically updated. Size shifted from ${current.length} to ${updated.length}`);
      }
      return updated;
    } catch (err) {
      await addDebugLog('ERROR', 'Queue', 'Failed to update reading queue atomically', err);
      throw err;
    }
  });
}