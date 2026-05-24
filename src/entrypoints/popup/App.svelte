<!--
  ── Popup App.svelte ─────────────────────────────────────────────────────────
  Root component for the extension popup. Displays the header with branding
  and API status, tab filters, queue list, and footer actions.

  This replaces the 662-line imperative popup/main.ts with reactive Svelte.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { videoQueueStorage, readingQueueStorage } from "@/lib/storage/queues";
  import { configStorage } from "@/lib/storage/config";
  import QueueList from "@/components/popup/QueueList.svelte";
  import ConfirmModal from "@/components/popup/ConfirmModal.svelte";
  import CustomSelect from "@/components/settings/CustomSelect.svelte";
  import { notify } from "@/lib/api/youtube"; // Route notifications to the unified smart helper
  import {
    submitLog,
    resolveVideoChannelMedia,
  } from "@/lib/api/nihongotracker";
  import { stripVideoTitle } from "@/lib/utils/text-parsing";
  import {
    applyThemeToDocument,
    THEME_OPTIONS,
    FONT_OPTIONS,
  } from "@/lib/ui/themes";
  import "@/styles/popup-shared.css";

  /* ── Reactive state ── */
  let videoQueue: any[] = $state([]);
  let readingQueue: any[] = $state([]);
  let hasApiKey = $state(false);
  let currentFilter = $state("all");
  let isSendingAll = $state(false);
  let confirmModal = $state<any>(null);

  /* Appearance states */
  let selectedTheme = $state("dark-amber");
  let selectedFont = $state("sans");
  let showCompactMenu = $state(false);

  const total = $derived(videoQueue.length + readingQueue.length);

  /* ── Data loading ── */
  async function loadData() {
    videoQueue = await videoQueueStorage.getValue();
    readingQueue = await readingQueueStorage.getValue();
    const cfg = (await configStorage.getValue()) as any;
    hasApiKey = !!cfg?.apiKey;
    selectedTheme = cfg?.theme ?? "dark-amber";
    selectedFont = cfg?.font ?? "sans";
  }

  onMount(() => {
    loadData();

    async function init() {
      const cfg = (await configStorage.getValue()) as any;
      applyThemeToDocument(cfg?.theme ?? "dark-amber", cfg?.font ?? "sans");
    }
    init();

    const storageListener = (changes: any, area: string) => {
      if (
        area === "local" &&
        (changes["videoQueue"] || changes["readingQueue"])
      ) {
        const focusedTag = document.activeElement?.tagName;
        if (focusedTag === "INPUT" || focusedTag === "SELECT") return;
        loadData();
      }
      if (area === "local" && changes["config"]) {
        const val = changes["config"].newValue as any;
        const nextTheme = val?.theme ?? "dark-amber";
        const nextFont = val?.font ?? "sans";
        applyThemeToDocument(nextTheme, nextFont);
      }
    };
    browser.storage.onChanged.addListener(storageListener);

    const clickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Close popover only if clicking outside of the popover and the toggle button
      if (
        target.closest(".compact-popover") ||
        target.closest(".appearance-toggle")
      ) {
        return;
      }
      showCompactMenu = false;
    };
    window.addEventListener("click", clickOutside);

    return () => {
      window.removeEventListener("click", clickOutside);
      browser.storage.onChanged.removeListener(storageListener);
    };
  });

  /* ── Quick Switch actions ── */
  function toggleCompactMenu() {
    showCompactMenu = !showCompactMenu;
  }

  async function handleQuickTheme(val: string) {
    selectedTheme = val;
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, theme: val });
    applyThemeToDocument(val, selectedFont);
  }

  async function handleQuickFont(val: string) {
    selectedFont = val;
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, font: val });
    applyThemeToDocument(selectedTheme, val);
  }

  /* ── Settings Actions ─────────────────────────────────────────── */
  async function openSettings() {
    const settingsUrl = browser.runtime.getURL("/settings.html");
    const tabs = await browser.tabs.query({});
    const existingTab = tabs.find(
      (t) => t.url && t.url.startsWith(settingsUrl),
    );
    if (existingTab && existingTab.id !== undefined) {
      await browser.tabs.update(existingTab.id, { active: true });
      if (existingTab.windowId !== undefined) {
        await browser.windows.update(existingTab.windowId, { focused: true });
      }
    } else {
      await browser.tabs.create({ url: settingsUrl });
    }
    window.close();
  }

  function showStatus(msg: string, err = false) {
    notify(err ? "Error" : "Success", msg);
  }

  async function handleConfirm(
    title: string,
    msg: string,
    warnKey?: string,
  ): Promise<boolean> {
    if (confirmModal) {
      try {
        return await confirmModal.confirm(title, msg, warnKey);
      } catch (e) {
        console.error("ConfirmModal error, falling back to window.confirm:", e);
      }
    }
    return window.confirm(msg);
  }

  async function handleSendAll() {
    const cfg = (await configStorage.getValue()) as any;
    if (cfg.warnSendAll !== false) {
      const ok = await confirmModal.confirm(
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

    const nextReadingQueue = rItems.filter((item) =>
      failedReadingIds.has(item.id),
    );
    const nextVideoQueue = vItems.filter((item) => failedVideoIds.has(item.id));

    await readingQueueStorage.setValue(nextReadingQueue);
    await videoQueueStorage.setValue(nextVideoQueue);

    if (totalFailed > 0) {
      if (totalSent > 0) {
        showStatus(`Sent ${totalSent} logs, but ${totalFailed} failed`, true);
      } else {
        showStatus(`Failed to send logs`, true);
      }
    } else if (totalSent > 0) {
      showStatus(`Successfully sent all ${totalSent} logs`);
    }

    isSendingAll = false;
    await loadData();
  }

  async function handleClearAll() {
    const ok = await confirmModal.confirm(
      "Clear All",
      "Are you sure you want to clear all pending logs?",
    );
    if (!ok) return;
    if (currentFilter === "all" || currentFilter === "video")
      await videoQueueStorage.setValue([]);
    if (currentFilter === "all" || currentFilter === "reading")
      await readingQueueStorage.setValue([]);
    await loadData();
  }

  function setFilter(filter: string) {
    currentFilter = filter;
  }
</script>

<!-- ── Header ── -->
<header class="header">
  <div class="brand">
    <div class="brand-mark">
      <img src="/NihongoAutoTracker.svg" alt="NAT" />
    </div>
    <div class="brand-text">
      <div class="brand-name">NihongoAutoTracker</div>
      <div class="pill" class:pill-ok={hasApiKey} class:pill-off={!hasApiKey}>
        {hasApiKey ? "API Key ✓" : "No API Key"}
      </div>
    </div>
  </div>

  <div style="display: flex; gap: 6px; position: relative;">
    <button
      class="icon-btn appearance-toggle"
      title="Appearance Settings"
      onclick={toggleCompactMenu}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="display: block;"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 18a6 6 0 1 0 0-12v12z" fill="currentColor" />
      </svg>
    </button>
    <button class="icon-btn" title="Open Settings" onclick={openSettings}
      >⚙</button
    >

    {#if showCompactMenu}
      <div
        class="compact-popover"
        style="position: absolute; top: calc(100% + 6px); right: 0; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 4px; padding: 10px; width: 160px; z-index: 10000; box-shadow: 0 4px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 10px;"
      >
        <span
          style="font-size: 9px; font-weight: bold; color: var(--color-text); text-transform: uppercase; display: block; border-bottom: 1px solid var(--color-border); padding-bottom: 4px;"
          >Appearance</span
        >

        <CustomSelect
          options={THEME_OPTIONS}
          value={selectedTheme}
          onChange={handleQuickTheme}
          label="Theme"
          compact={true}
        />

        <CustomSelect
          options={FONT_OPTIONS}
          value={selectedFont}
          onChange={handleQuickFont}
          label="Font"
          compact={true}
        />
      </div>
    {/if}
  </div>
</header>

<div class="sep"></div>

<!-- ── Queue header ── -->
<div class="queue-header">
  <div class="queue-header-left">
    <span class="queue-label">QUEUE</span>
    <span class="badge">{total}</span>
  </div>
  {#if total > 0}
    <div class="queue-bulk">
      <button
        class="bulk-btn amber"
        onclick={handleSendAll}
        disabled={isSendingAll}>{isSendingAll ? "..." : "Send All"}</button
      >
      <button
        class="bulk-btn ghost"
        onclick={handleClearAll}
        disabled={isSendingAll}>Clear</button
      >
    </div>
  {/if}
</div>

<!-- ── Filter tabs ── -->
<div class="queue-tabs">
  {#each ["all", "video", "reading"] as filter}
    <button
      class="q-tab"
      class:active={currentFilter === filter}
      onclick={() => setFilter(filter)}
    >
      {filter.charAt(0).toUpperCase() + filter.slice(1)}
    </button>
  {/each}
</div>

<!-- ── Queue list ── -->
<QueueList
  {videoQueue}
  {readingQueue}
  {currentFilter}
  onStatusMessage={showStatus}
  onConfirm={handleConfirm}
  onRefresh={loadData}
/>

<div class="sep"></div>

<!-- ── Footer ── -->
<footer class="footer">
  <button class="open-btn" onclick={openSettings}>Open Settings</button>
</footer>

<!-- ── Overlays ── -->
<ConfirmModal bind:this={confirmModal} />

<style>
  /* ── Root ── */
  :global(body) {
    font-family: var(--font-mono);
    background: var(--color-background);
    color: var(--color-text);
    width: 380px;
    font-size: 13px;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-mark {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: transparent;
  }
  .brand-mark img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .brand-name {
    font-size: 11px;
    font-weight: bold;
    color: var(--color-text);
    letter-spacing: 0.04em;
    margin-bottom: 2px;
  }
  .pill {
    display: inline-block;
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 8px;
  }
  .pill-ok {
    color: var(--color-success);
    border: 1px solid color-mix(in srgb, var(--color-success) 25%, transparent);
    background: color-mix(in srgb, var(--color-success) 7%, transparent);
  }
  .pill-off {
    color: var(--color-error);
    border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
    background: color-mix(in srgb, var(--color-error) 7%, transparent);
  }
  .icon-btn {
    width: 26px;
    height: 26px;
    background: none;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-muted);
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .icon-btn:hover {
    color: var(--color-text);
    border-color: var(--color-border-hover);
  }

  /* ── Separator ── */
  .sep {
    height: 1px;
    background: var(--color-border);
  }

  /* ── Queue header & tabs (Contrast Mapped) ── */
  .queue-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 14px 6px;
  }
  .queue-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .queue-label {
    font-size: 10px;
    font-weight: bold;
    color: var(--color-text-dimmed);
    letter-spacing: 0.1em;
  }
  .badge {
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    color: var(--color-accent);
    border: 1px solid color-mix(in srgb, var(--color-accent) 22%, transparent);
    border-radius: 8px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: bold;
  }
  .queue-bulk {
    display: flex;
    gap: 6px;
  }
  .bulk-btn {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: bold;
    padding: 3px 8px;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: opacity 0.15s;
  }
  .bulk-btn:hover {
    opacity: 0.7;
  }
  .bulk-btn.amber {
    background: var(--color-accent);
    color: var(--color-background);
    border-color: var(--color-accent);
  }
  .bulk-btn.ghost {
    background: none;
    color: var(--color-text-muted);
    border-color: var(--color-border-hover);
  }
  .bulk-btn:disabled {
    opacity: 0.45 !important;
    cursor: not-allowed !important;
    pointer-events: none !important;
  }
  .queue-tabs {
    display: flex;
    gap: 8px;
    padding: 0 14px 8px;
    border-bottom: 1px solid var(--color-border);
  }
  .q-tab {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-dimmed);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--font-mono);
    transition: all 0.15s;
    font-weight: bold;
  }
  .q-tab:hover {
    color: var(--color-text);
    border-color: var(--color-border-hover);
  }
  .q-tab.active {
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    color: var(--color-accent);
    border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
  }

  /* ── Footer ── */
  .footer {
    padding: 9px 12px 12px;
  }
  .open-btn {
    width: 100%;
    background: none;
    color: var(--color-text-dimmed);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 7px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .open-btn:hover {
    color: var(--color-text-muted);
    border-color: var(--color-border-hover);
  }
</style>
