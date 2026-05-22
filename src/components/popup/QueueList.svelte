<!--
  ── QueueList.svelte ─────────────────────────────────────────────────────────
  The main queue list container for the popup.
  Renders filtered queue items and handles bulk actions.
-->
<script lang="ts">
  import { videoQueueStorage, readingQueueStorage } from '@/lib/storage/queues';
  import QueueItem from './QueueItem.svelte';

  interface Props {
    videoQueue: any[];
    readingQueue: any[];
    currentFilter: string;
    onStatusMessage: (msg: string, err?: boolean) => void;
    onConfirm: (title: string, msg: string) => Promise<boolean>;
    onRefresh: () => void;
  }

  let { videoQueue, readingQueue, currentFilter, onStatusMessage, onConfirm, onRefresh }: Props = $props();

  /** Filtered items based on the active tab filter */
  const filteredReading = $derived(
    currentFilter === 'all' || currentFilter === 'reading' ? readingQueue : []
  );
  const filteredVideo = $derived(
    currentFilter === 'all' || currentFilter === 'video' ? videoQueue : []
  );
  const totalFiltered = $derived(filteredReading.length + filteredVideo.length);
  const totalAll = $derived(videoQueue.length + readingQueue.length);
</script>

<div class="queue-list">
  {#if totalAll === 0}
    <div class="empty-msg">Queue is empty.</div>
  {:else if totalFiltered === 0}
    <div class="empty-msg">No {currentFilter} items.</div>
  {:else}
    {#each filteredReading as item (item.id)}
      <QueueItem {item} type="reading" {onStatusMessage} {onConfirm} {onRefresh} />
    {/each}
    {#each filteredVideo as item (item.id)}
      <QueueItem {item} type="video" {onStatusMessage} {onConfirm} {onRefresh} />
    {/each}
  {/if}
</div>

<style>
  .queue-list {
    padding: 7px 10px 10px; max-height: 400px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 6px;
  }
  .queue-list::-webkit-scrollbar { width: 3px; }
  .queue-list::-webkit-scrollbar-thumb { background: var(--color-bdr2, #242d42); border-radius: 2px; }
  .empty-msg {
    text-align: center; color: var(--color-dim, #3a4a60);
    font-size: 11px; padding: 22px 0;
  }
</style>
