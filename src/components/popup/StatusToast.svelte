<!--
  ── StatusToast.svelte ───────────────────────────────────────────────────────
  A fixed-position toast notification for popup/settings pages.
  Shows success (green) or error (red) messages that auto-dismiss after 3s.
-->
<script lang="ts">
  /** Whether the toast is visible */
  let visible = $state(false);
  /** Toast message text */
  let message = $state('');
  /** Whether this is an error toast */
  let isError = $state(false);
  /** Timer for auto-dismiss */
  let timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Show a toast message. Called from parent via bind:this.
   * @param msg - The message to display
   * @param err - True for error styling
   */
  export function show(msg: string, err = false) {
    message = msg;
    isError = err;
    visible = true;
    clearTimeout(timer);
    timer = setTimeout(() => { visible = false; }, 3000);
  }
</script>

<div
  class="toast-notification"
  class:visible
  class:err={isError}
>
  {message}
</div>

<style>
  .toast-notification {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--color-surf, #0f0f1a);
    border: 1px solid var(--color-bdr2, #242d42);
    border-radius: 5px;
    padding: 10px 16px;
    font-family: var(--font-mono, 'Courier New', monospace);
    font-size: 12px;
    color: var(--color-green, #3ddc84);
    box-shadow: 0 4px 20px rgba(0,0,0,.5);
    transition: opacity .3s;
    z-index: 99999;
    opacity: 0;
    pointer-events: none;
  }
  .toast-notification.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .toast-notification.err {
    color: var(--color-red, #f0706a);
  }
</style>
