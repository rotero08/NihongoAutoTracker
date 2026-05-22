/**
 * ── Debug Log Storage ────────────────────────────────────────────────────────
 *
 * Manages the debug log entries used for diagnosing tracking or API issues.
 * Logs are collected from all extension contexts (content scripts, background)
 * and displayed in the Settings → Debug tab when advanced mode is enabled.
 */

import { storage } from 'wxt/utils/storage';
import type { DebugLogEntry } from '../types';

/** Maximum number of debug log entries to retain. Prevents unbounded growth. */
const MAX_DEBUG_LOGS = 200;

/**
 * Debug log storage — an array of structured log entries.
 * Newer entries are appended to the end (chronological order).
 * The array is capped at MAX_DEBUG_LOGS entries.
 */
export const debugLogStorage = storage.defineItem<DebugLogEntry[]>('local:debugLogs', {
  fallback: [],
});

/**
 * Add a debug log entry to storage.
 *
 * This is a convenience function used throughout content scripts and
 * the background script. It handles the read-append-trim-write cycle.
 *
 * @param level - Severity level: 'INFO', 'WARN', or 'ERROR'
 * @param source - Component that generated the log (e.g., 'VideoTracker', 'Background')
 * @param message - Human-readable log message
 * @param data - Optional additional data (will be JSON-stringified)
 */
export async function addDebugLog(
  level: DebugLogEntry['level'],
  source: string,
  message: string,
  data?: any,
): Promise<void> {
  const entry: DebugLogEntry = {
    level,
    source,
    message,
    data: data ? JSON.stringify(data) : undefined,
    timestamp: new Date().toISOString(),
  };

  const logs = await debugLogStorage.getValue();
  logs.push(entry);

  /* Trim oldest entries if we exceed the cap */
  if (logs.length > MAX_DEBUG_LOGS) {
    logs.splice(0, logs.length - MAX_DEBUG_LOGS);
  }

  await debugLogStorage.setValue(logs);
}
