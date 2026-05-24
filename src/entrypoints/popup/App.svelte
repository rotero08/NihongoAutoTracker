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
  import { showToast } from "@/lib/utils/toast"; // Route via dynamic shared helper
  import {
    applyThemeToDocument,
    THEME_OPTIONS,
    FONT_OPTIONS,
  } from "@/lib/ui/themes";
  import "@/styles/popup-shared.css";

  /* ── Reactive state ──────────────────────────────────────────── */
  let videoQueue: any[] = $state([]);
  let readingQueue: any[] = $state([]);
  let hasApiKey = $state(false);
  let currentFilter = $state("all");
  let confirmModal: ConfirmModal;

  /* Appearance states */
  let selectedTheme = $state("dark-amber");
  let selectedFont = $state("sans");
  let showCompactMenu = $state(false);

  const total = $derived(videoQueue.length + readingQueue.length);

  /* ── Data loading ────────────────────────────────────────────── */
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

    const clickOutside = () => {
      showCompactMenu = false;
    };
    window.addEventListener("click", clickOutside);

    return () => {
      window.removeEventListener("click", clickOutside);
      browser.storage.onChanged.removeListener(storageListener);
    };
  });

  /* ── Quick Switch actions ── */
  function toggleCompactMenu(e: MouseEvent) {
    e.stopPropagation();
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
  function openSettings() {
    browser.tabs.create({ url: browser.runtime.getURL("/settings.html") });
    window.close();
  }

  function showStatus(msg: string, err = false) {
    showToast(err ? "Error" : "Success", msg, err);
  }

  async function handleConfirm(title: string, msg: string): Promise<boolean> {
    return confirmModal?.confirm(title, msg) ?? false;
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
    showStatus("Sending all...");
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
      class="icon-btn"
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
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="compact-popover"
        onclick={(e) => e.stopPropagation()}
        style="position: absolute; top: calc(100% + 6px); right: 0; background: var(--surf); border: 1px solid var(--bdr2); border-radius: 4px; padding: 10px; width: 160px; z-index: 10000; box-shadow: 0 4px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 10px;"
      >
        <span
          style="font-size: 9px; font-weight: bold; color: var(--text); text-transform: uppercase; display: block; border-bottom: 1px solid var(--bdr); padding-bottom: 4px;"
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
      <button class="bulk-btn amber" onclick={handleSendAll}>Send All</button>
      <button class="bulk-btn ghost" onclick={handleClearAll}>Clear</button>
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
    font-family: var(--mono);
    background: var(--bg);
    color: var(--text);
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
    color: var(--text);
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
    color: var(--green);
    border: 1px solid color-mix(in srgb, var(--green) 25%, transparent);
    background: color-mix(in srgb, var(--green) 7%, transparent);
  }
  .pill-off {
    color: var(--red);
    border: 1px solid color-mix(in srgb, var(--red) 25%, transparent);
    background: color-mix(in srgb, var(--red) 7%, transparent);
  }
  .icon-btn {
    width: 26px;
    height: 26px;
    background: none;
    border: 1px solid var(--bdr);
    border-radius: 4px;
    color: var(--muted);
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
    color: var(--text);
    border-color: var(--bdr2);
  }

  /* ── Separator ── */
  .sep {
    height: 1px;
    background: var(--bdr);
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
    color: var(--dim);
    letter-spacing: 0.1em;
  }
  .badge {
    background: color-mix(in srgb, var(--amber) 10%, transparent);
    color: var(--amber);
    border: 1px solid color-mix(in srgb, var(--amber) 22%, transparent);
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
    font-family: var(--mono);
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
    background: var(--amber);
    color: var(--bg);
    border-color: var(--amber);
  }
  .bulk-btn.ghost {
    background: none;
    color: var(--muted);
    border-color: var(--bdr2);
  }
  .queue-tabs {
    display: flex;
    gap: 8px;
    padding: 0 14px 8px;
    border-bottom: 1px solid var(--bdr);
  }
  .q-tab {
    background: transparent;
    border: 1px solid var(--bdr);
    color: var(--dim);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--mono);
    transition: all 0.15s;
    font-weight: bold;
  }
  .q-tab:hover {
    color: var(--text);
    border-color: var(--bdr2);
  }
  .q-tab.active {
    background: color-mix(in srgb, var(--amber) 10%, transparent);
    color: var(--amber);
    border-color: color-mix(in srgb, var(--amber) 30%, transparent);
  }

  /* ── Footer ── */
  .footer {
    padding: 9px 12px 12px;
  }
  .open-btn {
    width: 100%;
    background: none;
    color: var(--dim);
    border: 1px solid var(--bdr);
    border-radius: 4px;
    padding: 7px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .open-btn:hover {
    color: var(--muted);
    border-color: var(--bdr2);
  }
</style>
