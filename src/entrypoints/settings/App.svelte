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
    localStorage.setItem("nt-active-settings-tab", tab);
  }

  function handleDebugToggle(enabled: boolean) {
    debugMode = enabled;
    if (!enabled && activeTab === "debug") handleTabChange("queue");
  }

  function handleQueueCountChange(count: number) {
    queueCount = count;
  }

  function applyCustomTheme(colors: any) {
    if (!colors) return;
    const root = document.documentElement;
    root.style.setProperty("--color-background", colors.background);
    root.style.setProperty("--color-surface", colors.surface);
    root.style.setProperty(
      "--color-surface-alt",
      colors.surfaceAlt || colors.surface,
    );
    root.style.setProperty("--color-border", colors.border);
    root.style.setProperty(
      "--color-border-hover",
      colors.borderHover || colors.border,
    );
    root.style.setProperty("--color-text", colors.text);
    root.style.setProperty("--color-text-muted", colors.textMuted);
    root.style.setProperty("--color-text-dimmed", colors.textMuted);
    root.style.setProperty("--color-accent", colors.accent);
    root.style.setProperty(
      "--color-accent-hover",
      colors.accentHover || colors.accent,
    );
  }

  function clearCustomTheme() {
    const root = document.documentElement;
    root.style.removeProperty("--color-background");
    root.style.removeProperty("--color-surface");
    root.style.removeProperty("--color-surface-alt");
    root.style.removeProperty("--color-border");
    root.style.removeProperty("--color-border-hover");
    root.style.removeProperty("--color-text");
    root.style.removeProperty("--color-text-muted");
    root.style.removeProperty("--color-text-dimmed");
    root.style.removeProperty("--color-accent");
    root.style.removeProperty("--color-accent-hover");
  }

  onMount(async () => {
    // Restore active tab from localStorage if available
    const savedTab = localStorage.getItem("nt-active-settings-tab");
    if (savedTab) {
      activeTab = savedTab;
    }

    const cfg = (await configStorage.getValue()) as any;
    debugMode = cfg.debugMode ?? false;

    const applyTheme = (c: any) => {
      const theme = c?.theme ?? "nihongo";
      const font = c?.font ?? "sans";
      if (theme === "custom") {
        applyThemeToDocument("dark-amber", font);
        applyCustomTheme(c?.customColors);
      } else {
        clearCustomTheme();
        applyThemeToDocument(theme, font);
      }
    };

    applyTheme(cfg);

    /* Live update variables if changed in storage */
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes["config"]) {
        applyTheme(changes["config"].newValue);
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
