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
    onStatusMessage: (msg: string, err?: boolean) => void;
    onConfirm: (title: string, msg: string) => Promise<boolean>;
    onRefresh: () => void;
  }

  let {
    videoQueue,
    readingQueue,
    stremioQueue,
    currentFilter,
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
  const totalAll = $derived(videoQueue.length + readingQueue.length + stremioQueue.length);
</script>

<div class="queue-list">
  {#if totalAll === 0}
    <div class="empty-msg">Queue is empty.</div>
  {:else if totalFiltered === 0}
    <div class="empty-msg">No {currentFilter} items.</div>
  {:else}
    {#each filteredReading as item (item.id)}
      <QueueItem
        {item}
        type="reading"
        {onStatusMessage}
        {onConfirm}
        {onRefresh}
      />
    {/each}
    {#each filteredVideo as item (item.id)}
      <QueueItem
        {item}
        type="video"
        {onStatusMessage}
        {onConfirm}
        {onRefresh}
      />
    {/each}
    {#each filteredStremio as item (item.id)}
      <QueueItem
        {item}
        type="stremio"
        {onStatusMessage}
        {onConfirm}
        {onRefresh}
      />
    {/each}
  {/if}
</div>

<style>
  .queue-list {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 8px 10px; /* Reduced side gaps significantly to let cards expand */
    flex: 1;
    max-height: 400px;
    overflow-y: auto;
    overflow-x: hidden !important;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    min-width: 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .queue-list :global(.qi) {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    align-self: stretch;
    box-sizing: border-box;
  }

  .queue-list::-webkit-scrollbar {
    width: 0 !important;
    height: 0 !important;
    display: none !important;
  }
  .queue-list::-webkit-scrollbar-thumb {
    background: var(--color-border-hover, #242d42);
    border-radius: 2px;
  }
  .empty-msg {
    text-align: center;
    color: var(--color-text-dimmed, #3a4a60);
    font-size: 11px;
    padding: 22px 0;
    margin: auto;
  }
</style>
