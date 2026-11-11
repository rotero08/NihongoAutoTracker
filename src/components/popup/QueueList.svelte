<!--
  ── QueueList.svelte ─────────────────────────────────────────────────────────
  The main queue list container for the popup.
  Renders filtered queue items and handles bulk actions.
-->
<script lang="ts">
  import QueueItem from "./QueueItem.svelte";

  interface Props {
    videoQueue: any[];
    readingQueue: any[];
    stremioQueue: any[];
    currentFilter: string;
    /** Storage has been read at least once; until then nothing is claimed about the queue. */
    loaded: boolean;
    hasApiKey: boolean;
    onOpenApiSettings: () => void;
    onStatusMessage: (msg: string, err?: boolean) => void;
    onConfirm: (title: string, msg: string) => Promise<boolean>;
    onRefresh: () => void;
  }

  let {
    videoQueue,
    readingQueue,
    stremioQueue,
    currentFilter,
    loaded,
    hasApiKey,
    onOpenApiSettings,
    onStatusMessage,
    onConfirm,
    onRefresh,
  }: Props = $props();

  /** Filtered items based on the active tab filter */
  const filteredReading = $derived(
    currentFilter === "all" || currentFilter === "reading" ? readingQueue : [],
  );
  const filteredVideo = $derived(
    currentFilter === "all" || currentFilter === "video" ? videoQueue : [],
  );
  const filteredStremio = $derived(
    currentFilter === "all" || currentFilter === "stremio" ? stremioQueue : [],
  );
  const totalFiltered = $derived(filteredReading.length + filteredVideo.length + filteredStremio.length);
</script>

{#if !loaded}
  <div class="queue-list"></div>
{:else if totalFiltered === 0}
  <div class="empty">
    {#if hasApiKey}
      <p class="empty-title">Nothing waiting to be sent</p>
      <p class="empty-hint">Japanese videos you watch and pages you read are collected here before they are logged.</p>
    {:else}
      <p class="empty-title">Connect your account</p>
      <p class="empty-hint">Add your NihongoTracker API key so your immersion can be logged.</p>
      <button class="empty-action" onclick={onOpenApiSettings}>Add API key</button>
    {/if}
  </div>
{:else}
  <div class="queue-list">
    {#each filteredReading as item (item.id)}
      <QueueItem {item} type="reading" {onStatusMessage} {onConfirm} {onRefresh} />
    {/each}
    {#each filteredVideo as item (item.id)}
      <QueueItem {item} type="video" {onStatusMessage} {onConfirm} {onRefresh} />
    {/each}
    {#each filteredStremio as item (item.id)}
      <QueueItem {item} type="stremio" {onStatusMessage} {onConfirm} {onRefresh} />
    {/each}
  </div>
{/if}

<style>
  .queue-list {
    width: 100%;
    flex: 1;
    min-height: 0;
    padding: 8px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .queue-list :global(.qi) {
    width: 100%;
    min-width: 0;
    flex-shrink: 0;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 40px 24px;
    text-align: center;
  }
  .empty-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }
  .empty-hint {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--color-text-muted);
  }
  .empty-action {
    margin-top: 8px;
    padding: 6px 14px;
    border: none;
    border-radius: var(--rounded-btn, 4px);
    background: var(--color-accent);
    color: var(--color-accent-text, #09090f);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s;
  }
  .empty-action:hover {
    background: var(--color-accent-hover, var(--color-accent));
  }
</style>
