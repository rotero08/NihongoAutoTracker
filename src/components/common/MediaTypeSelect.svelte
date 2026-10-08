<!--
  ── MediaTypeSelect.svelte ───────────────────────────────────────────────────
  Compact segmented control for what a watched item is logged as:
  anime, TV show or movie. Shared by the popup and the settings queue.
-->
<script lang="ts">
  import type { WatchLogType } from "@/lib/types";
  import { WATCH_LOG_TYPES, normalizeLogType } from "@/lib/utils/media-type";

  interface Props {
    value: unknown;
    onChange: (value: WatchLogType) => void;
    disabled?: boolean;
  }
  let { value, onChange, disabled = false }: Props = $props();

  const current = $derived(normalizeLogType(value));
</script>

<div class="media-type" role="radiogroup" aria-label="Media type">
  {#each WATCH_LOG_TYPES as option (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={current === option.value}
      class:active={current === option.value}
      title={`Log as ${option.label}`}
      {disabled}
      onclick={() => {
        if (current !== option.value) onChange(option.value);
      }}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .media-type {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--color-border, #1c2333);
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .media-type button {
    appearance: none !important;
    background: none !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    margin: 0 !important;
    padding: 1px 6px !important;
    min-width: 0 !important;
    height: auto !important;
    line-height: 1.5 !important;
    font-family: var(--font-mono, monospace) !important;
    font-size: 10px !important;
    font-weight: normal !important;
    color: var(--color-text-muted, #7a8ca5) !important;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .media-type button + button {
    border-left: 1px solid var(--color-border, #1c2333) !important;
  }
  .media-type button:hover:not(:disabled) {
    color: var(--color-text, #dde4f0) !important;
  }
  .media-type button.active {
    background: color-mix(in srgb, var(--color-accent, #f0b429) 16%, transparent) !important;
    color: var(--color-accent, #f0b429) !important;
    font-weight: bold !important;
    cursor: default;
  }
  .media-type button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .media-type button:focus-visible {
    outline: 1px solid var(--color-accent, #f0b429) !important;
    outline-offset: -1px;
  }
</style>
