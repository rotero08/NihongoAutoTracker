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
  import {
    submitLog,
    resolveVideoChannelMedia,
  } from "@/lib/api/nihongotracker";
  import { stripVideoTitle } from "@/lib/utils/text-parsing";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
    onQueueCountChange: (count: number) => void;
    onConfirm: (
      title: string,
      msg: string,
      warnKey?: string,
    ) => Promise<boolean>;
  }
  let { onStatus, onQueueCountChange, onConfirm }: Props = $props();

  let videoQueue: any[] = $state([]);
  let readingQueue: any[] = $state([]);
  let currentFilter = $state("all");
  let autoSendEOD = $state(false);
  let isSendingAll = $state(false);

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
      const ok = await onConfirm(
        "Send All",
        "Are you sure you want to send all pending logs?",
        "warnSendAll",
      );
      if (!ok) return;
    }

    isSendingAll = true;

    function getItemPayloads(item: any, type: "reading" | "video") {
      const isRead = type === "reading";
      const sessions = item.sessions ?? [];
      const displayMins = isRead
        ? Math.max(1, Math.round((item.time || 0) / 60))
        : item.time || 0;
      const sumSecs = sessions.reduce(
        (a: number, b: any) => a + (b.secs || 0),
        0,
      );
      const sumMins = Math.max(1, Math.round(sumSecs / 60));
      const sumChars = isRead
        ? sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0)
        : 0;

      const hasOverride = isRead
        ? Number(item.chars || 0) > sumChars || displayMins > sumMins
        : displayMins > Math.round(sumSecs / 60);

      const defaultDateStr =
        sessions.length > 0
          ? sessions[0].date
          : item.date || new Date().toISOString();
      const desc =
        item.description || item.contentTitleNative || "Unknown Title";

      if (sessions.length > 1 && !hasOverride) {
        return sessions.map((sess: any) => {
          const sessMins = Math.max(1, Math.round((sess.secs || 0) / 60));
          const payload: any = {
            type,
            description: type === "video" ? stripVideoTitle(desc) : desc,
            time: sessMins,
            date: new Date(sess.date).toISOString(),
            chars: isRead ? sess.chars || 0 : 0,
            episodes: 0,
            pages: 0,
            unknownDate: false,
            mediaId: isRead
              ? item.mediaId || "web-reading"
              : item.mediaData?.channelId || item.channelId || "web-video",
            mediaData: item.mediaData || {},
          };
          if (isRead) {
            payload.volume = Math.max(1, Number(item.volume || 1));
          }
          return payload;
        });
      } else {
        const payload: any = {
          type,
          description: type === "video" ? stripVideoTitle(desc) : desc,
          time: displayMins,
          date: new Date(defaultDateStr).toISOString(),
          chars: isRead ? item.chars || 0 : 0,
          episodes: 0,
          pages: 0,
          unknownDate: false,
          mediaId: isRead
            ? item.mediaId || "web-reading"
            : item.mediaData?.channelId || item.channelId || "web-video",
          mediaData: item.mediaData || {},
        };
        if (isRead) {
          payload.volume = Math.max(1, Number(item.volume || 1));
        }
        return [payload];
      }
    }

    const rItems = [...readingQueue];
    const vItems = [...videoQueue];

    const failedReadingIds = new Set<string>();
    const failedVideoIds = new Set<string>();
    let totalSent = 0;
    let totalFailed = 0;

    // Process reading logs
    for (const item of rItems) {
      try {
        const payloads = getItemPayloads(item, "reading");
        let itemSucceeded = true;
        for (const p of payloads) {
          const res = await submitLog(p, true);
          if (res?.success) {
            totalSent++;
          } else {
            itemSucceeded = false;
            totalFailed++;
          }
        }
        if (!itemSucceeded) {
          failedReadingIds.add(item.id);
        }
      } catch {
        failedReadingIds.add(item.id);
        totalFailed++;
      }
    }

    // Process video logs
    for (const item of vItems) {
      try {
        // Ensure channel media data is resolved
        const channelId = item.channelId || item.mediaData?.channelId;
        const channelTitle =
          item.mediaData?.channelTitle ||
          item.channelTitle ||
          item.contentTitleNative;
        if (channelId || channelTitle) {
          try {
            const media = await resolveVideoChannelMedia({
              channelId,
              channelTitle,
            });
            item.mediaData = {
              ...(item.mediaData || {}),
              channelId: media.channelId || channelId || "web-video",
              channelTitle:
                media.channelTitle || channelTitle || item.contentTitleNative,
              ...(media.channelImage
                ? { channelImage: media.channelImage }
                : {}),
              ...(media.channelDescription
                ? { channelDescription: media.channelDescription }
                : {}),
            };
          } catch (_e) {}
        }

        const payloads = getItemPayloads(item, "video");
        let itemSucceeded = true;
        for (const p of payloads) {
          const res = await submitLog(p, true);
          if (res?.success) {
            totalSent++;
          } else {
            itemSucceeded = false;
            totalFailed++;
          }
        }
        if (!itemSucceeded) {
          failedVideoIds.add(item.id);
        }
      } catch {
        failedVideoIds.add(item.id);
        totalFailed++;
      }
    }

    // Update queue to only retain the ones that failed
    const nextReadingQueue = rItems.filter((item) =>
      failedReadingIds.has(item.id),
    );
    const nextVideoQueue = vItems.filter((item) => failedVideoIds.has(item.id));

    await readingQueueStorage.setValue(nextReadingQueue);
    await videoQueueStorage.setValue(nextVideoQueue);

    if (totalFailed > 0) {
      if (totalSent > 0) {
        onStatus(`⚠ Sent ${totalSent} logs, but ${totalFailed} failed`, true);
      } else {
        onStatus(`⚠ Failed to send logs`, true);
      }
    } else if (totalSent > 0) {
      onStatus(`✓ Successfully sent all ${totalSent} logs`);
    }

    isSendingAll = false;
    await load();
  }

  async function clearAll() {
    const ok = await onConfirm(
      "Clear All",
      "Are you sure you want to clear all pending logs?",
    );
    if (!ok) return;
    if (currentFilter === "all" || currentFilter === "video")
      await videoQueueStorage.setValue([]);
    if (currentFilter === "all" || currentFilter === "reading")
      await readingQueueStorage.setValue([]);
    onStatus("✓ Pending logs cleared successfully");
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
      <button
        id="send-all-btn"
        class="btn btn-amber btn-sm"
        onclick={sendAll}
        disabled={isSendingAll}>{isSendingAll ? "..." : "Send All"}</button
      >
      <button
        id="clear-all-btn"
        class="btn btn-ghost btn-sm"
        onclick={clearAll}
        disabled={isSendingAll}>Clear All</button
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
      <SettingsQueueItem
        {item}
        type="reading"
        {onStatus}
        {onConfirm}
        onRefresh={load}
      />
    {/each}

    {#each filteredVideo as item (item.id)}
      <SettingsQueueItem
        {item}
        type="video"
        {onStatus}
        {onConfirm}
        onRefresh={load}
      />
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
