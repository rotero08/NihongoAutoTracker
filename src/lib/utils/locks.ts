/**
 * ── Cross-context Locks ──────────────────────────────────────────────────────
 *
 * The background worker, the popup and the settings page are separate
 * JavaScript contexts: a module-level flag or promise chain only serialises
 * work inside one of them. The Web Locks API is shared by every context of the
 * extension's origin, which makes it the right tool for work that must not
 * overlap anywhere — refreshing a single-use OAuth token, importing history.
 */

const localChains = new Map<string, Promise<unknown>>();

export function withCrossContextLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = (globalThis as any).navigator?.locks;
  if (locks?.request) {
    return locks.request(name, task) as Promise<T>;
  }

  // No Web Locks (very old browsers): at least serialise within this context.
  const previous = localChains.get(name) ?? Promise.resolve();
  const run = previous.then(task, task);
  localChains.set(name, run.catch(() => undefined));
  return run;
}
