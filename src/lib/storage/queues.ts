/**
 * ── Queue Storage ────────────────────────────────────────────────────────────
 *
 * Manages the video and reading queue items waiting to be sent to NihongoTracker.
 * Prevents asynchronous race conditions during multiple concurrent operations.
 * Upgraded with exhaustive DEV warnings to trace transactional queue lock states.
 */

import { storage } from 'wxt/utils/storage';
import { addDebugLog } from '../storage/debug';
import type { QueuedReadingLog, QueuedStremioLog, QueuedVideoLog } from '../types';

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
 * Stremio queue — stores Trakt watched-history entries imported from Stremio
 * and waiting for manual review/submission.
 */
export const stremioQueueStorage = storage.defineItem<QueuedStremioLog[]>('local:stremioQueue', {
  fallback: [],
});

/**
 * Processed Trakt history ids — prevents duplicate imports from Trakt.
 */
export const stremioProcessedStorage = storage.defineItem<string[]>('local:stremioProcessedHistoryIds', {
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
  const transactionId = Math.random().toString(36).substring(2, 9);
  if (import.meta.env.DEV) {
    console.log(`[NAT DEV - Queue] [Tx: ${transactionId}] Queued transaction. Lock chain updated.`);
  }

  const next = queueWritePromiseChain.then(async () => {
    if (import.meta.env.DEV) {
      console.log(`[NAT DEV - Queue] [Tx: ${transactionId}] Lock acquired. Executing transaction...`);
    }
    const result = await transaction();
    if (import.meta.env.DEV) {
      console.log(`[NAT DEV - Queue] [Tx: ${transactionId}] Transaction executed successfully. Releasing lock.`);
    }
    return result;
  });

  queueWritePromiseChain = next.catch(async (err) => {
    if (import.meta.env.DEV) {
      console.error(`[NAT DEV - Queue] [Tx: ${transactionId}] Lock chain caught error in transaction:`, err);
    }
    // Log storage exceptions persistently on boundary failure
    await addDebugLog('ERROR', 'Queue', `Transaction ${transactionId} encountered storage exception`, err);
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
      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - Queue] Reading video queue for atomic update. Current size: ${current.length}`);
      }
      const updated = await modifier(current);
      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - Queue] Active write: Updating video queue. Next size: ${updated.length}`);
      }
      await videoQueueStorage.setValue(updated);
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
      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - Queue] Reading reading queue for atomic update. Current size: ${current.length}`);
      }
      const updated = await modifier(current);
      if (import.meta.env.DEV) {
        console.log(`[NAT DEV - Queue] Active write: Updating reading queue. Next size: ${updated.length}`);
      }
      await readingQueueStorage.setValue(updated);
      return updated;
    } catch (err) {
      await addDebugLog('ERROR', 'Queue', 'Failed to update reading queue atomically', err);
      throw err;
    }
  });
}

/**
 * Atomically updates the Stremio queue in local storage.
 */
export async function updateStremioQueueAtomic(
  modifier: (currentQueue: QueuedStremioLog[]) => QueuedStremioLog[] | Promise<QueuedStremioLog[]>
): Promise<QueuedStremioLog[]> {
  return executeQueueTransaction(async () => {
    try {
      const current = await stremioQueueStorage.getValue();
      const updated = await modifier(current);
      await stremioQueueStorage.setValue(updated);
      return updated;
    } catch (err) {
      await addDebugLog('ERROR', 'Queue', 'Failed to update Stremio queue atomically', err);
      throw err;
    }
  });
}
