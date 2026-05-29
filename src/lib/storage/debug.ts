/**
 * ── Debug Log Storage (RAM-Only Sliding Window) ──────────────────────────────
 *
 * Manages debug logs entirely in RAM to prevent disk write performance issues.
 * Capped at a maximum of 200 entries. Logs are managed centrally in the
 * background service worker context and accessed via message passing.
 */

import type { DebugLogEntry } from '../types';

// Global in-memory log buffer (only holds data in the active background runtime)
let ramLogs: DebugLogEntry[] = [];

export function getRamLogs(): DebugLogEntry[] {
  return ramLogs;
}

export function pushRamLog(entry: DebugLogEntry): void {
  ramLogs.push(entry);
  if (ramLogs.length > 200) {
    ramLogs.splice(0, ramLogs.length - 200);
  }
}

export function clearRamLogs(): void {
  ramLogs = [];
}

/**
 * Add a debug log entry.
 * Redirects content script and panel logs to the background script's RAM buffer.
 *
 * @param level - Severity level: 'INFO', 'WARN', or 'ERROR'
 * @param source - Component that generated the log (e.g., 'VideoTracker')
 * @param message - Human-readable log message
 * @param data - Optional additional data
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
    data: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined,
    timestamp: new Date().toISOString(),
  };

  // If we are in the background page context, append directly to our RAM array
  if ((globalThis as any).__NT_APPEND_RAM_LOG__) {
    (globalThis as any).__NT_APPEND_RAM_LOG__(entry);
  } else {
    // Otherwise (content script, popup, settings tab), send a runtime message to background
    try {
      await browser.runtime.sendMessage({
        action: 'ADD_DEBUG_LOG',
        entry,
      });
    } catch {
      // Fail silently if context is invalidated or background is sleeping
    }
  }
}