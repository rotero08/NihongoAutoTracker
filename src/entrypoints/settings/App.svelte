<!--
  ── Settings App.svelte ──────────────────────────────────────────────────────
  Root component for the extension settings page.
  Manages tab routing via sidebar navigation.
  Replaces 1454 lines of imperative settings/main.ts.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { configStorage } from '@/lib/storage/config';
  import Sidebar from '@/components/settings/Sidebar.svelte';
  import QueueTab from '@/components/settings/tabs/QueueTab.svelte';
  import ApiKeyTab from '@/components/settings/tabs/ApiKeyTab.svelte';
  import VideoTab from '@/components/settings/tabs/VideoTab.svelte';
  import OverlayTab from '@/components/settings/tabs/OverlayTab.svelte';
  import ReadersTab from '@/components/settings/tabs/ReadersTab.svelte';
  import DebugTab from '@/components/settings/tabs/DebugTab.svelte';

  /* Import the original settings stylesheet globally */
  import '@/styles/settings-shared.css';

  /* ── Reactive state ── */
  let activeTab = $state('queue');
  let queueCount = $state(0);
  let debugMode = $state(false);
  let statusMsg = $state('');
  let statusErr = $state(false);
  let statusVisible = $state(false);
  let statusTimer: any;

  function showStatus(msg: string, err = false) {
    statusMsg = msg; statusErr = err; statusVisible = true;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusVisible = false; }, 3000);
  }

  function handleTabChange(tab: string) {
    activeTab = tab;
  }

  function handleDebugToggle(enabled: boolean) {
    debugMode = enabled;
    if (!enabled && activeTab === 'debug') activeTab = 'queue';
  }

  function handleQueueCountChange(count: number) {
    queueCount = count;
  }

  onMount(async () => {
    const cfg = await configStorage.getValue() as any;
    debugMode = cfg.debugMode ?? false;
  });
</script>

<div class="shell">
  <Sidebar
    {activeTab}
    {queueCount}
    {debugMode}
    onTabChange={handleTabChange}
    onDebugToggle={handleDebugToggle}
  />

  <main class="main">
    {#if activeTab === 'queue'}
      <QueueTab onStatus={showStatus} onQueueCountChange={handleQueueCountChange} />
    {:else if activeTab === 'api'}
      <ApiKeyTab onStatus={showStatus} />
    {:else if activeTab === 'video'}
      <VideoTab onStatus={showStatus} />
    {:else if activeTab === 'overlay'}
      <OverlayTab onStatus={showStatus} />
    {:else if activeTab === 'readers'}
      <ReadersTab onStatus={showStatus} />
    {:else if activeTab === 'debug'}
      <DebugTab onStatus={showStatus} />
    {/if}
  </main>
</div>

<!-- Status toast -->
<div
  class="status-toast"
  class:visible={statusVisible}
  class:err={statusErr}
>
  {statusMsg}
</div>

<style>
  /* Override visibility behavior for the toast (original uses .hidden class) */
  .status-toast.visible { opacity: 1 !important; pointer-events: auto !important; }
</style>
