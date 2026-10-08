/**
 * ── Network Helpers ──────────────────────────────────────────────────────────
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/**
 * `fetch` that gives up. A request that never settles would otherwise hold a
 * background poll (and the lock around it) open indefinitely.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s: ${new URL(input).host}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
