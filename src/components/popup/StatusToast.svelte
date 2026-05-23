<script lang="ts">
  /** Whether the toast is visible */
  let visible = $state(false);
  /** Toast message text */
  let message = $state("");
  /** Heading title */
  let title = $state("Success");
  /** Whether this is an error toast */
  let isError = $state(false);
  /** Active hover pause state */
  let isPaused = $state(false);
  /** Time remaining in milliseconds */
  let timeRemaining = 3000;
  /** Timer interval */
  let timerInterval: ReturnType<typeof setTimeout> | undefined;

  /**
   * Show a toast message. Called from parent via bind:this.
   * @param msg - The message to display
   * @param err - True for error styling
   */
  export function show(msg: string, err = false, t?: string) {
    message = msg;
    isError = err;
    title = t || (err ? "Error" : "Success");
    visible = true;
    isPaused = false;
    timeRemaining = 3000;

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!isPaused) {
        timeRemaining -= 50;
        if (timeRemaining <= 0) {
          visible = false;
          clearInterval(timerInterval);
        }
      }
    }, 50);
  }

  function handleMouseEnter() {
    isPaused = true;
  }

  function handleMouseLeave() {
    isPaused = false;
  }

  function close() {
    visible = false;
    clearInterval(timerInterval);
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="nt-toast-card"
    class:err={isError}
    class:paused={isPaused}
    onclick={close}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
  >
    <div class="nt-toast-content">
      <span class="nt-toast-title">{title}</span>
      <span class="nt-toast-msg">{message}</span>
    </div>
    <button
      class="nt-toast-close"
      onclick={(e) => {
        e.stopPropagation();
        close();
      }}>×</button
    >
    <div class="nt-toast-bar"></div>
  </div>
{/if}

<style>
  @keyframes nt-toast-deplete {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }
  @keyframes nt-toast-slide-in {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  .nt-toast-card {
    position: fixed;
    bottom: 24px;
    right: 24px;
    pointer-events: auto;
    overflow: hidden;
    background: var(--surf, #0f0f1a);
    color: var(--green, #3ddc84);
    border: 1px solid color-mix(in srgb, var(--green, #3ddc84) 40%, transparent);
    border-radius: 6px;
    padding: 12px 16px 16px 16px;
    font-family: var(--mono, monospace);
    font-size: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    width: 280px;
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    animation: nt-toast-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    z-index: 2147483647;
    cursor: pointer;
    direction: ltr;
    text-align: left;
    line-height: 1.4;
  }
  .nt-toast-card.err {
    color: var(--red, #f0706a);
    border-color: color-mix(in srgb, var(--red, #f0706a) 40%, transparent);
  }
  .nt-toast-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    word-break: break-word;
  }
  .nt-toast-title {
    font-weight: bold;
    font-family: var(--sans, sans-serif);
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .nt-toast-msg {
    opacity: 0.9;
    font-family: var(--mono, monospace);
    font-size: 11px;
  }
  .nt-toast-close {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0;
    opacity: 0.6;
    transition: opacity 0.2s;
    font-family: sans-serif;
  }
  .nt-toast-close:hover {
    opacity: 1;
  }
  .nt-toast-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    background: currentColor;
    opacity: 0.6;
    animation: nt-toast-deplete 3s linear forwards;
  }

  /* Halts visual depletion on active hover states */
  .nt-toast-card.paused,
  .nt-toast-card.paused .nt-toast-bar {
    animation-play-state: paused !important;
  }
</style>
