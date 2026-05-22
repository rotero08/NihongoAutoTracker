<!--
  ── ConfirmModal.svelte ──────────────────────────────────────────────────────
  A reusable confirmation dialog with optional "Don't warn me again" checkbox.
  Used for destructive actions: delete, clear all, send all.
-->
<script lang="ts">
  import { configStorage } from '@/lib/storage/config';

  /** Whether the modal is open */
  let open = $state(false);
  /** Dialog title */
  let title = $state('');
  /** Dialog description */
  let desc = $state('');
  /** Config key for "don't warn" persistence (null to hide checkbox) */
  let warnKey: string | null = $state(null);
  /** "Don't warn" checkbox state */
  let dontWarn = $state(false);
  /** Promise resolver */
  let resolver: ((val: boolean) => void) | null = null;

  /**
   * Show the confirm modal and return a promise that resolves
   * to true (proceed) or false (cancel).
   */
  export function confirm(t: string, msg: string, key: string | null = null): Promise<boolean> {
    title = t;
    desc = msg;
    warnKey = key;
    dontWarn = false;
    open = true;
    return new Promise((resolve) => { resolver = resolve; });
  }

  async function close(result: boolean) {
    open = false;
    if (result && warnKey && dontWarn) {
      const cfg = await configStorage.getValue() as any;
      await configStorage.setValue({ ...cfg, [warnKey]: false });
    }
    resolver?.(result);
    resolver = null;
  }
</script>

{#if open}
<div class="modal-overlay" onclick={() => close(false)}>
  <div class="modal-box" onclick={(e) => e.stopPropagation()}>
    <h3>{title}</h3>
    <p>{desc}</p>

    {#if warnKey}
    <label class="warn-toggle">
      <input type="checkbox" bind:checked={dontWarn} />
      Don't warn me again
    </label>
    {/if}

    <div class="modal-actions">
      <button class="btn-ghost" onclick={() => close(false)}>Cancel</button>
      <button class="btn-amber" onclick={() => close(true)}>Proceed</button>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,.7); display: flex; align-items: center;
    justify-content: center; z-index: 9999;
  }
  .modal-box {
    background: var(--color-surf, #0f0f1a);
    border: 1px solid var(--color-bdr2, #242d42);
    border-radius: 8px; padding: 24px; max-width: 320px; width: 100%;
    box-shadow: 0 10px 40px rgba(0,0,0,.8);
  }
  .modal-box h3 {
    color: var(--color-amber, #f0b429);
    font-size: 14px; margin-bottom: 12px; font-weight: bold;
    font-family: var(--font-mono, monospace);
  }
  .modal-box p {
    color: var(--color-text-primary, #dde4f0);
    font-size: 13px; margin-bottom: 16px; line-height: 1.6;
  }
  .warn-toggle {
    display: flex; align-items: center; gap: 8px;
    cursor: pointer; color: var(--color-text-primary, #dde4f0);
    font-size: 13px; margin-top: 10px;
  }
  .warn-toggle input { accent-color: var(--color-amber, #f0b429); }
  .modal-actions {
    display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;
  }
  .btn-ghost {
    font-family: var(--font-mono, monospace); font-size: 12px; font-weight: bold;
    padding: 6px 12px; border-radius: 3px; cursor: pointer;
    background: none; color: var(--color-muted, #5a6a85);
    border: 1px solid var(--color-bdr2, #242d42); transition: opacity .15s;
  }
  .btn-ghost:hover { opacity: .7; }
  .btn-amber {
    font-family: var(--font-mono, monospace); font-size: 12px; font-weight: bold;
    padding: 6px 12px; border-radius: 3px; cursor: pointer;
    background: var(--color-amber, #f0b429); color: #09090f;
    border: 1px solid var(--color-amber, #f0b429); transition: opacity .15s;
  }
  .btn-amber:hover { opacity: .7; }
</style>
