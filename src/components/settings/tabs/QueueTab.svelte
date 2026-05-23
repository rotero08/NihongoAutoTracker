<!--
  ── QueueTab.svelte ──────────────────────────────────────────────────────────
  Full queue management in settings. Uses SettingsQueueItem component for individual
  items to support 1:1 visual match with original layout, interactive volume, chars,
  minutes, dates, dropdown matching, and auto-sum persistence.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { videoQueueStorage, readingQueueStorage } from "@/lib/storage/queues";
  import { configStorage } from "@/lib/storage/config";
  import SettingsQueueItem from "./SettingsQueueItem.svelte";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
    onQueueCountChange: (count: number) => void;
  }
  let { onStatus, onQueueCountChange }: Props = $props();

  let videoQueue: any[] = $state([]);
  let readingQueue: any[] = $state([]);
  let currentFilter = $state("all");
  let autoSendEOD = $state(false);

  const filteredReading = $derived(
    currentFilter === "all" || currentFilter === "reading" ? readingQueue : [],
  );
  const filteredVideo = $derived(
    currentFilter === "all" || currentFilter === "video" ? videoQueue : [],
  );
  const total = $derived(videoQueue.length + readingQueue.length);

  export async function load() {
    console.log("[load] Loading queues from storage...");
    videoQueue = await videoQueueStorage.getValue();
    readingQueue = await readingQueueStorage.getValue();
    console.log("[load] Loaded readingQueue:", readingQueue);
    console.log("[load] Loaded videoQueue:", videoQueue);
    const cfg = (await configStorage.getValue()) as any;
    autoSendEOD = cfg.autoSendEndOfDay ?? false;
    onQueueCountChange(total);
  }

  async function toggleEOD() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, autoSendEndOfDay: autoSendEOD });
    onStatus(
      autoSendEOD ? "✓ EOD auto-send enabled" : "✓ EOD auto-send disabled",
    );
  }

  async function sendAll() {
    const cfg = (await configStorage.getValue()) as any;
    if (cfg.warnSendAll !== false) {
      if (!confirm("Are you sure you want to send all pending logs?")) return;
    }

    // Rely on individual items to build and send payloads, or call each sendItem
    // We can delegate to sending all reading & video logs directly
    const rItems = [...readingQueue];
    const vItems = [...videoQueue];

    // Simple bulk send
    for (const item of rItems) {
      // Logic from legacy send
      const isRead = true;
      const desc = item.description || item.contentTitleNative;
      const mins = Math.max(1, Math.round((item.time || 0) / 60));
      const payload = {
        type: "reading",
        description: desc,
        time: mins,
        date: item.date || new Date().toISOString(),
        chars: item.chars || 0,
        episodes: 0,
        pages: 0,
        unknownDate: false,
        mediaId: item.mediaId || "web-reading",
        mediaData: item.mediaData || {},
        volume: Math.max(1, Number(item.volume || 1)),
      };
      // Submit
      const { submitLog } = await import("@/lib/api/nihongotracker");
      await submitLog(payload);
    }

    for (const item of vItems) {
      const desc = item.description || item.contentTitleNative;
      const mins = item.time || 0;
      const payload = {
        type: "video",
        description: desc,
        time: mins,
        date: item.date || new Date().toISOString(),
        chars: 0,
        episodes: 0,
        pages: 0,
        unknownDate: false,
        mediaId: item.channelId || item.mediaData?.channelId || "web-video",
        mediaData: item.mediaData || {},
      };
      const { submitLog } = await import("@/lib/api/nihongotracker");
      await submitLog(payload);
    }

    await videoQueueStorage.setValue([]);
    await readingQueueStorage.setValue([]);
    onStatus("✓ Sent all logs");
    await load();
  }

  async function clearAll() {
    if (!confirm("Are you sure you want to clear all pending logs?")) return;
    if (currentFilter === "all" || currentFilter === "video")
      await videoQueueStorage.setValue([]);
    if (currentFilter === "all" || currentFilter === "reading")
      await readingQueueStorage.setValue([]);
    await load();
  }

  onMount(() => {
    load();
    /* Watch for external storage changes */
    readingQueueStorage.watch(() => {
      const focusedTag = document.activeElement?.tagName;
      if (focusedTag === "INPUT" || focusedTag === "SELECT") return;
      load();
    });
    videoQueueStorage.watch(() => {
      const focusedTag = document.activeElement?.tagName;
      if (focusedTag === "INPUT" || focusedTag === "SELECT") return;
      load();
    });
  });
</script>

<div class="tab-head">
  <h2>Pending Logs</h2>
  {#if total > 0}
    <div class="tab-actions" id="queue-actions">
      <button id="send-all-btn" class="btn btn-amber btn-sm" onclick={sendAll}
        >Send All</button
      >
      <button id="clear-all-btn" class="btn btn-ghost btn-sm" onclick={clearAll}
        >Clear All</button
      >
    </div>
  {/if}
</div>

<!-- Auto-send EOD toggle box (Contrast Fixed) -->
<div
  class="field"
  style="margin-bottom: 16px; background: color-mix(in srgb, var(--amber) 5%, transparent); border: 1px solid color-mix(in srgb, var(--amber) 20%, transparent); border-radius: 6px; padding: 12px 16px;"
>
  <div class="tooltip-wrap" style="display:flex; width:100%;">
    <label class="toggle" style="flex:1;">
      <input
        type="checkbox"
        id="auto-send-end-of-day"
        class="toggle-chk"
        bind:checked={autoSendEOD}
        onchange={toggleEOD}
      />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      Automatically send today's queued logs at end of day
    </label>
    <span class="tooltip">This would also send unmatched media</span>
  </div>
</div>

<!-- Filter tabs -->
<div class="queue-tabs">
  {#each ["all", "video", "reading"] as filter}
    <button
      class="q-tab"
      class:active={currentFilter === filter}
      onclick={() => (currentFilter = filter)}
    >
      {filter.charAt(0).toUpperCase() + filter.slice(1)}
    </button>
  {/each}
</div>

<!-- Info box matching original -->
<div class="info-box">
  <strong>ⓘ Auto-Sum & Overrides:</strong> Editing individual sessions updates
  the total automatically. If you manually set the <em>Total</em> higher than the
  sum, the Total takes priority and sends as one combined log.
</div>

<!-- Queue items -->
<div id="queue-list">
  {#if total === 0}
    <div class="empty-state">Queue is empty</div>
  {:else}
    {#each filteredReading as item (item.id)}
      <SettingsQueueItem {item} type="reading" {onStatus} onRefresh={load} />
    {/each}

    {#each filteredVideo as item (item.id)}
      <SettingsQueueItem {item} type="video" {onStatus} onRefresh={load} />
    {/each}
  {/if}
</div>

<style>
  /* Local adjustments to preserve exact original settings queue spacing */
  #queue-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
</style>
