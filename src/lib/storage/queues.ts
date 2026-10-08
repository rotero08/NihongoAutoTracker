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

type QueueModifier<T> = (currentQueue: T[]) => T[] | Promise<T[]>;

interface QueueStorageItem<T> {
  getValue(): Promise<T[]>;
  setValue(value: T[]): Promise<void>;
}

/**
 * Build the read-modify-write updater for one queue.
 *
 * The modifier may mutate the array it is given or return a new one. Either
 * way the result is compared against what was read: an unchanged queue is not
 * written back, which spares the storage write and the change event it would
 * fan out to every open tab, the popup and the background worker.
 */
function createQueueUpdater<T>(item: QueueStorageItem<T>, label: string) {
  return (modifier: QueueModifier<T>): Promise<T[]> =>
    executeQueueTransaction(async () => {
      try {
        const current = await item.getValue();
        const before = JSON.stringify(current);
        const updated = await modifier(current);
        const after = JSON.stringify(updated);
        if (after === before) return updated;

        if (import.meta.env.DEV) {
          console.log(`[NAT DEV - Queue] Writing ${label} queue: ${current.length} -> ${updated.length} item(s)`);
        }
        // Persist the plain JSON form: callers may hand over reactive proxies,
        // which the storage API cannot clone.
        const plain: T[] = JSON.parse(after);
        await item.setValue(plain);
        return plain;
      } catch (err) {
        await addDebugLog('ERROR', 'Queue', `Failed to update ${label} queue atomically`, err);
        throw err;
      }
    });
}

/** Atomically updates the video queue in local storage. */
export const updateVideoQueueAtomic = createQueueUpdater(videoQueueStorage, 'video');

/** Atomically updates the reading queue in local storage. */
export const updateReadingQueueAtomic = createQueueUpdater(readingQueueStorage, 'reading');

/** Atomically updates the Stremio queue in local storage. */
export const updateStremioQueueAtomic = createQueueUpdater(stremioQueueStorage, 'Stremio');
