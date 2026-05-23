<!--
  ── Popup App.svelte ─────────────────────────────────────────────────────────
  Root component for the extension popup. Displays the header with branding
  and API status, tab filters, queue list, and footer actions.

  This replaces the 662-line imperative popup/main.ts with reactive Svelte.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { videoQueueStorage, readingQueueStorage } from '@/lib/storage/queues';
  import { configStorage } from '@/lib/storage/config';
  import QueueList from '@/components/popup/QueueList.svelte';
  import ConfirmModal from '@/components/popup/ConfirmModal.svelte';
  import StatusToast from '@/components/popup/StatusToast.svelte';
  import '@/styles/popup-shared.css';

  /* ── Reactive state ──────────────────────────────────────────── */
  let videoQueue: any[] = $state([]);
  let readingQueue: any[] = $state([]);
  let hasApiKey = $state(false);
  let currentFilter = $state('all');
  let confirmModal: ConfirmModal;
  let statusToast: StatusToast;

  const total = $derived(videoQueue.length + readingQueue.length);

  /* ── Data loading ────────────────────────────────────────────── */
  async function loadData() {
    videoQueue = await videoQueueStorage.getValue();
    readingQueue = await readingQueueStorage.getValue();
    const cfg = await configStorage.getValue();
    hasApiKey = !!cfg?.apiKey;
  }

  onMount(() => {
    loadData();

    /* Live updates from storage changes */
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes['videoQueue'] || changes['readingQueue'])) {
        /* Don't re-render if user is actively editing a field */
        const focusedTag = document.activeElement?.tagName;
        if (focusedTag === 'INPUT' || focusedTag === 'SELECT') return;
        loadData();
      }
    });
  });

  /* ── Actions ─────────────────────────────────────────────────── */
  function openSettings() {
    browser.tabs.create({ url: browser.runtime.getURL('/settings.html') });
    window.close();
  }

  function showStatus(msg: string, err = false) {
    statusToast?.show(msg, err);
  }

  async function handleConfirm(title: string, msg: string): Promise<boolean> {
    return confirmModal?.confirm(title, msg) ?? false;
  }

  async function handleSendAll() {
    const cfg = await configStorage.getValue() as any;
    if (cfg.warnSendAll !== false) {
      const ok = await confirmModal.confirm('Send All', 'Are you sure you want to send all pending logs?', 'warnSendAll');
      if (!ok) return;
    }
    /* Individual items handle their own send logic */
    showStatus('Sending all...');
  }

  async function handleClearAll() {
    const ok = await confirmModal.confirm('Clear All', 'Are you sure you want to clear all pending logs?');
    if (!ok) return;
    if (currentFilter === 'all' || currentFilter === 'video') await videoQueueStorage.setValue([]);
    if (currentFilter === 'all' || currentFilter === 'reading') await readingQueueStorage.setValue([]);
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
        {hasApiKey ? 'API Key ✓' : 'No API Key'}
      </div>
    </div>
  </div>
  <button class="icon-btn" title="Open Settings" onclick={openSettings}>⚙</button>
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
  {#each ['all', 'video', 'reading'] as filter}
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
<StatusToast bind:this={statusToast} />

<style>
  /* ── Root ── */
  :global(body) {
    font-family: 'Courier New', monospace;
    background: #09090f;
    color: #dde4f0;
    width: 380px;
    font-size: 13px;
    overflow: hidden;
    margin: 0; padding: 0;
  }
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Header ── */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-mark {
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; background: transparent;
  }
  .brand-mark img { width: 100%; height: 100%; object-fit: contain; }
  .brand-name {
    font-size: 11px; font-weight: bold; color: #dde4f0;
    letter-spacing: .04em; margin-bottom: 2px;
  }
  .pill {
    display: inline-block; font-size: 10px; font-weight: bold;
    letter-spacing: .06em; text-transform: uppercase;
    padding: 2px 6px; border-radius: 8px;
  }
  .pill-ok { color: #3ddc84; border: 1px solid rgba(61,220,132,.25); background: rgba(61,220,132,.07); }
  .pill-off { color: #f0706a; border: 1px solid rgba(240,112,106,.25); background: rgba(240,112,106,.07); }
  .icon-btn {
    width: 26px; height: 26px; background: none; border: 1px solid #1c2333;
    border-radius: 4px; color: #5a6a85; font-size: 13px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: color .15s, border-color .15s;
  }
  .icon-btn:hover { color: #dde4f0; border-color: #242d42; }

  /* ── Separator ── */
  .sep { height: 1px; background: #1c2333; }

  /* ── Queue header & tabs ── */
  .queue-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 14px 6px;
  }
  .queue-header-left { display: flex; align-items: center; gap: 8px; }
  .queue-label { font-size: 10px; font-weight: bold; color: #3a4a60; letter-spacing: .1em; }
  .badge {
    background: rgba(240,180,41,.1); color: #f0b429;
    border: 1px solid rgba(240,180,41,.22); border-radius: 8px;
    padding: 1px 6px; font-size: 10px; font-weight: bold;
  }
  .queue-bulk { display: flex; gap: 6px; }
  .bulk-btn {
    font-family: 'Courier New', monospace; font-size: 10px; font-weight: bold;
    padding: 3px 8px; border-radius: 3px; cursor: pointer;
    border: 1px solid transparent; transition: opacity .15s;
  }
  .bulk-btn:hover { opacity: .7; }
  .bulk-btn.amber { background: #f0b429; color: #09090f; border-color: #f0b429; }
  .bulk-btn.ghost { background: none; color: #5a6a85; border-color: #242d42; }
  .queue-tabs {
    display: flex; gap: 8px; padding: 0 14px 8px;
    border-bottom: 1px solid #1c2333;
  }
  .q-tab {
    background: transparent; border: 1px solid #1c2333; color: #3a4a60;
    padding: 4px 12px; border-radius: 4px; cursor: pointer;
    font-size: 11px; font-family: 'Courier New', monospace;
    transition: all .15s; font-weight: bold;
  }
  .q-tab:hover { color: #dde4f0; border-color: #242d42; }
  .q-tab.active { background: rgba(240,180,41,.1); color: #f0b429; border-color: rgba(240,180,41,.3); }

  /* ── Footer ── */
  .footer { padding: 9px 12px 12px; }
  .open-btn {
    width: 100%; background: none; color: #3a4a60;
    border: 1px solid #1c2333; border-radius: 4px; padding: 7px;
    font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold;
    letter-spacing: .04em; cursor: pointer; transition: color .15s, border-color .15s;
  }
  .open-btn:hover { color: #5a6a85; border-color: #242d42; }
</style>
