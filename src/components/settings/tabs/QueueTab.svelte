<!--
  ── QueueTab.svelte ──────────────────────────────────────────────────────────
  Full queue management in settings. Uses SettingsQueueItem component for individual
  items to support 1:1 visual match with original layout, interactive volume, chars,
  minutes, dates, dropdown matching, and auto-sum persistence.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { videoQueueStorage, readingQueueStorage, stremioQueueStorage } from "@/lib/storage/queues";
  import { configStorage } from "@/lib/storage/config";
  import SettingsQueueItem from "./SettingsQueueItem.svelte";
  import { getUpdater, sendAllQueued, type QueueType } from "@/lib/utils/queue-actions";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
    onQueueCountChange: (count: number) => void;
    onConfirm: (
      title: string,
      msg: string,
      warnKey?: string,
    ) => Promise<boolean>;
    onTabChange?: (tab: string) => void;
  }
  let { onStatus, onQueueCountChange, onConfirm, onTabChange }: Props =
    $props();

  let videoQueue: any[] = $state([]);
  let readingQueue: any[] = $state([]);
  let stremioQueue: any[] = $state([]);
  type QueueFilter = "all" | QueueType;
  let currentFilter = $state<QueueFilter>("all");
  let autoSendEOD = $state(false);
  let showTotalInBadge = $state(true); // Control setting for combined dynamic toolbar badge count
  let isSendingAll = $state(false);

  const filteredReading = $derived(
    currentFilter === "all" || currentFilter === "reading" ? readingQueue : [],
  );
  const filteredVideo = $derived(
    currentFilter === "all" || currentFilter === "video" ? videoQueue : [],
  );
  const filteredStremio = $derived(
    currentFilter === "all" || currentFilter === "stremio" ? stremioQueue : [],
  );
  const total = $derived(videoQueue.length + readingQueue.length + stremioQueue.length);

  /** A tab per queue that has something in it; "All" only earns its place next to two of them. */
  const tabs = $derived.by(() => {
    const perType: Array<{ id: QueueFilter; label: string; count: number }> = [
      { id: "reading", label: "Reading", count: readingQueue.length },
      { id: "video", label: "Video", count: videoQueue.length },
      { id: "stremio", label: "Stremio", count: stremioQueue.length },
    ];
    const nonEmpty = perType.filter((tab) => tab.count > 0);
    return nonEmpty.length > 1
      ? [{ id: "all" as QueueFilter, label: "All", count: total }, ...nonEmpty]
      : [];
  });

  // The filtered queue can empty out (sent, cleared) while its tab is selected.
  $effect(() => {
    if (currentFilter !== "all" && !tabs.some((tab) => tab.id === currentFilter)) {
      currentFilter = "all";
    }
  });

  const filterLabel = $derived(tabs.find((tab) => tab.id === currentFilter)?.label.toLowerCase() ?? "all");
  const scopeText = $derived(currentFilter === "all" ? "all pending logs" : `all pending ${filterLabel} logs`);

  export async function load() {
    const [video, reading, stremio, cfg] = await Promise.all([
      videoQueueStorage.getValue(),
      readingQueueStorage.getValue(),
      stremioQueueStorage.getValue(),
      configStorage.getValue() as Promise<any>,
    ]);

    videoQueue = video;
    readingQueue = reading;
    stremioQueue = stremio;
    autoSendEOD = cfg.autoSendEndOfDay ?? false;
    showTotalInBadge = cfg.showTotalInBadge !== false;
    onQueueCountChange(total);
  }

  async function toggleEOD() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, autoSendEndOfDay: autoSendEOD });
    onStatus(
      autoSendEOD ? "✓ End-of-day sending on" : "✓ End-of-day sending off",
    );
  }

  async function toggleBadgeOption() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, showTotalInBadge });
    onStatus(
      showTotalInBadge ? "✓ Icon count on" : "✓ Icon count off",
    );
  }

  async function sendAll() {
    const cfg = (await configStorage.getValue()) as any;
    // Captured up front: the selected tab falls back to "All" as soon as its
    // queue empties, which must not widen what is being sent.
    const inScope = (type: QueueType) => currentFilter === "all" || currentFilter === type;
    const queues = {
      reading: inScope("reading") ? readingQueue : [],
      video: inScope("video") ? videoQueue : [],
      stremio: inScope("stremio") ? stremioQueue : [],
    };

    if (cfg.warnSendAll !== false) {
      const ok = await onConfirm("Send all", `Send ${scopeText} to NihongoTracker?`, "warnSendAll");
      if (!ok) return;
    }

    const hasUnmatched = queues.reading.some(
      (item) => !item.mediaId || item.mediaId === "web-reading",
    );
    if (hasUnmatched && cfg.warnUnmatched !== false) {
      const ok = await onConfirm(
        "Unmatched Media Warning",
        "There are unmatched reading logs in the queue that are not linked to any AniList entry. They will be logged as unmatched. Do you want to proceed?",
        "warnUnmatched",
      );
      if (!ok) return;
    }

    isSendingAll = true;
    try {
      const { sent, failed } = await sendAllQueued(queues);

      if (failed > 0) {
        onStatus(sent > 0 ? `⚠ Sent ${sent} logs, but ${failed} failed` : "⚠ Failed to send logs", true);
      } else if (sent > 0) {
        onStatus(`✓ Sent ${sent} ${sent === 1 ? "log" : "logs"}`);
      }
    } finally {
      isSendingAll = false;
      await load();
    }
  }

  async function clearAll() {
    const filter = currentFilter;
    const ok = await onConfirm(
      filter === "all" ? "Clear queue" : `Clear ${filterLabel} queue`,
      `Delete ${scopeText} without sending them? This cannot be undone.`,
    );
    if (!ok) return;
    for (const type of ["video", "reading", "stremio"] as QueueType[]) {
      if (filter === "all" || filter === type) {
        await getUpdater(type)(() => []);
      }
    }
    onStatus("✓ Queue cleared");
    await load();
  }

  let unwatches: (() => void)[] = [];

  onMount(() => {
    load();

    // Reload on outside changes, but never under the user's cursor mid-edit.
    const reloadUnlessEditing = () => {
      const focusedTag = document.activeElement?.tagName;
      if (focusedTag === "INPUT" || focusedTag === "SELECT") return;
      load();
    };
    unwatches = [readingQueueStorage, videoQueueStorage, stremioQueueStorage].map((queue) =>
      queue.watch(reloadUnlessEditing),
    );
  });

  onDestroy(() => {
    unwatches.forEach((unwatch) => unwatch());
  });
</script>

<div class="tab-head">
  <h2>Queue</h2>
  {#if total > 0}
    <div class="tab-actions" id="queue-actions">
      <button
        id="clear-all-btn"
        class="btn btn-ghost btn-sm"
        onclick={clearAll}
        disabled={isSendingAll}>{currentFilter === "all" ? "Clear" : `Clear ${filterLabel}`}</button
      >
      <button
        id="send-all-btn"
        class="btn btn-amber btn-sm"
        onclick={sendAll}
        disabled={isSendingAll}>{isSendingAll ? "Sending…" : currentFilter === "all" ? "Send all" : `Send all ${filterLabel}`}</button
      >
    </div>
  {/if}
</div>
<p class="hint">
  Logs wait here until you send them, so you can fix a title, a duration or a match first.
  A total follows its sessions unless you type a higher one yourself.
</p>

<div class="field">
  <label class="toggle">
    <input
      type="checkbox"
      id="auto-send-end-of-day"
      class="toggle-chk"
      bind:checked={autoSendEOD}
      onchange={toggleEOD}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Send the queue automatically at the end of each day
      <span class="toggle-desc">
        Runs at 23:59. If the browser is closed then, earlier days are sent the next time it starts.
        Reading logs without a match are sent unmatched.
      </span>
    </span>
  </label>
</div>
<div class="field">
  <label class="toggle">
    <input
      type="checkbox"
      id="show-total-in-badge"
      class="toggle-chk"
      bind:checked={showTotalInBadge}
      onchange={toggleBadgeOption}
    />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-text">Show the number of queued logs on the toolbar icon</span>
  </label>
</div>

{#if tabs.length > 0}
  <div class="queue-tabs" role="tablist">
    {#each tabs as tab (tab.id)}
      <button
        class="q-tab"
        class:active={currentFilter === tab.id}
        role="tab"
        aria-selected={currentFilter === tab.id}
        onclick={() => (currentFilter = tab.id)}
      >
        {tab.label}<span class="q-count">{tab.count}</span>
      </button>
    {/each}
  </div>
{/if}

<div id="queue-list">
  {#if total === 0}
    <div class="empty-state">
      <strong>Nothing waiting to be sent</strong>
      <span>
        Japanese videos you watch and pages you read are collected here. What counts is set under
        <a
          href="#video"
          onclick={(e) => {
            e.preventDefault();
            onTabChange?.("video");
          }}>Video</a
        >.
      </span>
    </div>
  {:else}
    {#each filteredReading as item (item.id)}
      <SettingsQueueItem {item} type="reading" {onStatus} {onConfirm} onRefresh={load} />
    {/each}
    {#each filteredVideo as item (item.id)}
      <SettingsQueueItem {item} type="video" {onStatus} {onConfirm} onRefresh={load} />
    {/each}
    {#each filteredStremio as item (item.id)}
      <SettingsQueueItem {item} type="stremio" {onStatus} {onConfirm} onRefresh={load} />
    {/each}
  {/if}
</div>

<style>
  #queue-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
</style>
