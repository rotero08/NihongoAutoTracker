<!--
  ── QueueTab.svelte ──────────────────────────────────────────────────────────
  Full queue management in settings. Uses SettingsQueueItem component for individual
  items to support 1:1 visual match with original layout, interactive volume, chars,
  minutes, dates, dropdown matching, and auto-sum persistence.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { videoQueueStorage, readingQueueStorage, stremioQueueStorage } from "@/lib/storage/queues";
  import { configStorage } from "@/lib/storage/config";
  import SettingsQueueItem from "./SettingsQueueItem.svelte";
  import {
    submitLog,
    resolveVideoChannelMedia,
  } from "@/lib/api/nihongotracker";
  import { stripVideoTitle } from "@/lib/utils/text-parsing";
  import { getItemPayloads } from "@/lib/utils/queue-actions";

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
  let currentFilter = $state("all");
  let autoSendEOD = $state(false);
  let showTotalInBadge = $state(true); // Control setting for combined dynamic toolbar badge count
  let isSendingAll = $state(false);
  let isGuideOpen = $state(true); // Default to uncollapsed (open) on first load

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
      autoSendEOD ? "✓ EOD auto-send enabled" : "✓ EOD auto-send disabled",
    );
  }

  async function toggleBadgeOption() {
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, showTotalInBadge });
    onStatus(
      showTotalInBadge ? "✓ Badge count enabled" : "✓ Badge count disabled",
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

    // Unmatched logs warning logic during Send All
    const hasUnmatched = readingQueue.some(
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

    const rItems = [...readingQueue];
    const vItems = [...videoQueue];
    const sItems = [...stremioQueue];

    const failedReadingIds = new Set<string>();
    const failedVideoIds = new Set<string>();
    const failedStremioIds = new Set<string>();
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

    for (const item of sItems) {
      try {
        const payloads = getItemPayloads(item, "stremio");
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
          failedStremioIds.add(item.id);
        }
      } catch {
        failedStremioIds.add(item.id);
        totalFailed++;
      }
    }

    const freshReadingQueue = await readingQueueStorage.getValue();
    const freshVideoQueue = await videoQueueStorage.getValue();

    const nextReadingQueue = [
      ...freshReadingQueue.filter(
        (item: any) => !rItems.some((sent: any) => sent.id === item.id),
      ),
      ...rItems.filter((item: any) => failedReadingIds.has(item.id)),
    ];
    const nextVideoQueue = [
      ...freshVideoQueue.filter(
        (item: any) => !vItems.some((sent: any) => sent.id === item.id),
      ),
      ...vItems.filter((item: any) => failedVideoIds.has(item.id)),
    ];

    await readingQueueStorage.setValue(nextReadingQueue);
    await videoQueueStorage.setValue(nextVideoQueue);
    await stremioQueueStorage.setValue([
      ...(await stremioQueueStorage.getValue()).filter(
        (item: any) => !sItems.some((sent: any) => sent.id === item.id),
      ),
      ...sItems.filter((item: any) => failedStremioIds.has(item.id)),
    ]);

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
    if (currentFilter === "all" || currentFilter === "stremio")
      await stremioQueueStorage.setValue([]);
    onStatus("✓ Pending logs cleared successfully");
    await load();
  }

  function handleGuideToggle(e: Event) {
    const isOpen = (e.target as HTMLDetailsElement).open;
    isGuideOpen = isOpen;
    localStorage.setItem("nt-queue-guide-open", String(isOpen));
  }

  onMount(() => {
    load();

    // Recover guide collapsed preference state
    const saved = localStorage.getItem("nt-queue-guide-open");
    if (saved !== null) {
      isGuideOpen = saved === "true";
    }

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
    stremioQueueStorage.watch(() => {
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

<!-- Auto-send EOD toggle box -->
<div
  class="field"
  style="margin-bottom: 8px; background: color-mix(in srgb, var(--color-accent) 5%, transparent); border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent); border-radius: 6px; padding: 12px 16px;"
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
      Automatically send today's queued logs at end of day (23:59)
    </label>
    <span class="tooltip">This will also submit unmatched media</span>
  </div>
</div>

<!-- Discrete Badge toggle option -->
<div class="field" style="margin-bottom: 20px; padding-left: 4px;">
  <label
    class="toggle"
    style="font-size: 11.5px; color: var(--color-text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; user-select: none;"
  >
    <input
      type="checkbox"
      id="show-total-in-badge"
      class="toggle-chk"
      bind:checked={showTotalInBadge}
      onchange={toggleBadgeOption}
    />
    <span
      class="toggle-track"
      style="transform: scale(0.85); margin-right: 4px;"
      ><span class="toggle-thumb"></span></span
    >
    Show total pending queue items as a badge on the extension icon
  </label>
</div>

<!-- Filter tabs -->
<div class="queue-tabs">
  {#each ["all", "video", "reading", "stremio"] as filter}
    <button
      class="q-tab"
      class:active={currentFilter === filter}
      onclick={() => (currentFilter = filter)}
    >
      {filter.charAt(0).toUpperCase() + filter.slice(1)}
    </button>
  {/each}
</div>

<!-- Compact, borderless, backgroundless collapsible Guide -->
<details
  class="info-guide"
  open={isGuideOpen}
  ontoggle={handleGuideToggle}
  style="background: none; border: none; margin-bottom: 12px; font-family: var(--font-sans);"
>
  <summary
    style="padding: 2px 0; font-size: 11px; font-weight: bold; cursor: pointer; color: var(--color-accent); list-style: none; display: flex; align-items: center; gap: 4px; user-select: none; width: max-content;"
  >
    <span>ⓘ Click to show/hide Guide & Queue Rules</span>
  </summary>
  <div
    style="padding-top: 8px; font-size: 11px; line-height: 1.45; display: flex; flex-direction: column; gap: 6px; color: var(--color-text-muted);"
  >
    <div>
      <strong style="color: var(--color-text);">Auto-Sum:</strong> Editing session
      values updates the totals automatically. Manually typing a higher total overrides
      the sum.
    </div>
    <div>
      <strong style="color: var(--color-text);">Music Videos:</strong> Excluded
      by default to preserve log quality. Enable them in
      <a
        href="#video"
        onclick={(e) => {
          e.preventDefault();
          if (onTabChange) onTabChange("video");
        }}
        style="color: var(--color-accent); text-decoration: underline;"
        >Video Settings</a
      >.
    </div>
  </div>
</details>

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

    {#each filteredStremio as item (item.id)}
      <SettingsQueueItem
        {item}
        type="stremio"
        {onStatus}
        {onConfirm}
        onRefresh={load}
      />
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
