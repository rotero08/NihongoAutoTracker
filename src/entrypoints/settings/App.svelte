<script lang="ts">
  import { onMount } from "svelte";
  import { configStorage } from "@/lib/storage/config";
  import Sidebar from "@/components/settings/Sidebar.svelte";
  import QueueTab from "@/components/settings/tabs/QueueTab.svelte";
  import ApiKeyTab from "@/components/settings/tabs/ApiKeyTab.svelte";
  import ThemeTab from "@/components/settings/tabs/ThemeTab.svelte";
  import VideoTab from "@/components/settings/tabs/VideoTab.svelte";
  import OverlayTab from "@/components/settings/tabs/OverlayTab.svelte";
  import ReadersTab from "@/components/settings/tabs/ReadersTab.svelte";
  import DebugTab from "@/components/settings/tabs/DebugTab.svelte";
  import { showToast } from "@/lib/utils/toast"; // Route via dynamic shared helper
  import { applyThemeToDocument } from "@/lib/ui/themes";

  /* Import unchanged settings stylesheet globally */
  import "@/styles/settings-shared.css";

  /* ── Reactive state ── */
  let activeTab = $state("queue");
  let queueCount = $state(0);
  let debugMode = $state(false);

  function showStatus(msg: string, err = false) {
    showToast(err ? "Error" : "Success", msg, err);
  }

  function handleTabChange(tab: string) {
    activeTab = tab;
  }

  function handleDebugToggle(enabled: boolean) {
    debugMode = enabled;
    if (!enabled && activeTab === "debug") activeTab = "queue";
  }

  function handleQueueCountChange(count: number) {
    queueCount = count;
  }

  onMount(async () => {
    const cfg = (await configStorage.getValue()) as any;
    debugMode = cfg.debugMode ?? false;
    applyThemeToDocument(cfg.theme ?? "nihongo", cfg.font ?? "sans");

    /* Live update variables if changed in storage */
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes["config"]) {
        const nextTheme =
          (changes["config"].newValue as any)?.theme ?? "nihongo";
        const nextFont = (changes["config"].newValue as any)?.font ?? "sans";
        applyThemeToDocument(nextTheme, nextFont);
      }
    });
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
    {#if activeTab === "queue"}
      <QueueTab
        onStatus={showStatus}
        onQueueCountChange={handleQueueCountChange}
      />
    {:else if activeTab === "api"}
      <ApiKeyTab onStatus={showStatus} />
    {:else if activeTab === "theme"}
      <ThemeTab onStatus={showStatus} />
    {:else if activeTab === "video"}
      <VideoTab onStatus={showStatus} />
    {:else if activeTab === "overlay"}
      <OverlayTab onStatus={showStatus} />
    {:else if activeTab === "readers"}
      <ReadersTab onStatus={showStatus} />
    {:else if activeTab === "debug"}
      <DebugTab onStatus={showStatus} />
    {/if}
  </main>
</div>
