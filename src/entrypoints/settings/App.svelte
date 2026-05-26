<!-- Settings/App.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { configStorage } from "@/lib/storage/config";
  import { videoQueueStorage, readingQueueStorage } from "@/lib/storage/queues";
  import Sidebar from "@/components/settings/Sidebar.svelte";
  import QueueTab from "@/components/settings/tabs/QueueTab.svelte";
  import ApiKeyTab from "@/components/settings/tabs/ApiKeyTab.svelte";
  import ThemeTab from "@/components/settings/tabs/ThemeTab.svelte";
  import VideoTab from "@/components/settings/tabs/VideoTab.svelte";
  import OverlayTab from "@/components/settings/tabs/OverlayTab.svelte";
  import ReadersTab from "@/components/settings/tabs/ReadersTab.svelte";
  import DebugTab from "@/components/settings/tabs/DebugTab.svelte";
  import { notify } from "@/lib/api/youtube"; // Route notifications to the unified smart helper
  import { applyThemeToDocument } from "@/lib/ui/themes";

  /* Import unchanged settings stylesheet globally */
  import "@/styles/settings-shared.css";

  /* ── Reactive state ── */
  let activeTab = $state("queue");
  let queueCount = $state(0);
  let debugMode = $state(false);

  /* Inline custom modal state for settings */
  let modalOpen = $state(false);
  let modalTitle = $state("");
  let modalMsg = $state("");
  let currentWarnKey = $state<string | undefined>(undefined);
  let dontWarnValue = $state(false);
  let modalResolve = $state<((value: boolean) => void) | null>(null);

  function showStatus(msg: string, err = false) {
    notify(err ? "Error" : "Success", msg);
  }

  async function handleConfirm(
    title: string,
    msg: string,
    warnKey?: string,
  ): Promise<boolean> {
    // If a warnKey is provided, check if the warning is configured to be skipped
    if (warnKey) {
      const cfg = (await configStorage.getValue()) as any;
      if (cfg && cfg[warnKey] === false) {
        return true;
      }
    }

    modalTitle = title;
    modalMsg = msg;
    currentWarnKey = warnKey;
    dontWarnValue = false;
    modalOpen = true;

    return new Promise<boolean>((resolve) => {
      modalResolve = async (val: boolean) => {
        if (val && currentWarnKey && dontWarnValue) {
          const cfg = (await configStorage.getValue()) as any;
          await configStorage.setValue({ ...cfg, [currentWarnKey]: false });
        }
        modalOpen = false;
        resolve(val);
      };
    });
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

  async function updateQueueCount() {
    // Parallelize queue array fetches to eliminate serial storage IPC latency
    const [video, reading] = await Promise.all([
      videoQueueStorage.getValue(),
      readingQueueStorage.getValue(),
    ]);
    queueCount = (video?.length || 0) + (reading?.length || 0);
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
    root.style.setProperty("--color-success", colors.success || "#3ddc84");
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
    root.style.removeProperty("--color-success");
  }

  onMount(() => {
    // Restore active tab from localStorage if available
    const savedTab = localStorage.getItem("nt-active-settings-tab");
    if (savedTab) {
      activeTab = savedTab;
    }

    // Load configuration values concurrently in parallel
    const loadConfigAndTheme = async () => {
      const [cfg, video, reading] = await Promise.all([
        configStorage.getValue() as Promise<any>,
        videoQueueStorage.getValue(),
        readingQueueStorage.getValue(),
      ]);

      debugMode = cfg.debugMode ?? false;
      queueCount = (video?.length || 0) + (reading?.length || 0);

      const applyTheme = (c: any) => {
        const theme = c?.theme ?? "nihongo";
        const font = c?.font ?? "sans";
        if (theme.startsWith("custom_") || theme.startsWith("custom-")) {
          const themeId = theme.replace("custom_", "").replace("custom-", "");
          const customThemes = c?.customThemes || [];
          // Robust custom theme matching supporting both raw, underscore, and dash-prefixed IDs
          const targetTheme = customThemes.find(
            (t: any) =>
              t.id === themeId ||
              t.id === theme ||
              t.id === "custom_" + themeId ||
              t.id === "custom-" + themeId,
          );
          if (targetTheme) {
            applyThemeToDocument("dark-amber", font, targetTheme.colors);
            applyCustomTheme(targetTheme.colors);
          } else {
            clearCustomTheme();
            applyThemeToDocument("dark-amber", font);
          }
        } else {
          clearCustomTheme();
          applyThemeToDocument(theme, font);
        }
      };

      applyTheme(cfg);

      /* Watch storage changes dynamically */
      browser.storage.onChanged.addListener(storageListener);
    };

    loadConfigAndTheme();

    /* Live update variables if changed in storage */
    const storageListener = (changes: any, area: string) => {
      if (
        area === "local" &&
        (changes["videoQueue"] || changes["readingQueue"])
      ) {
        updateQueueCount();
      }
      if (area === "local" && changes["config"]) {
        const val = changes["config"].newValue as any;
        const nextTheme = val?.theme ?? "nihongo";
        const nextFont = val?.font ?? "sans";
        if (nextTheme.startsWith("custom_")) {
          const themeId = nextTheme.replace("custom_", "");
          const customThemes = val?.customThemes || [];
          // Robust custom theme matching supporting both raw and prefixed IDs
          const targetTheme = customThemes.find(
            (t: any) => t.id === themeId || t.id === nextTheme,
          );
          if (targetTheme) {
            applyThemeToDocument("dark-amber", nextFont, targetTheme.colors);
            applyCustomTheme(targetTheme.colors);
          } else {
            clearCustomTheme();
            applyThemeToDocument("dark-amber", nextFont);
          }
        } else {
          clearCustomTheme();
          applyThemeToDocument(nextTheme, nextFont);
        }
      }
    };

    /* Listen for SHOW_TOAST messages from other execution contexts */
    const messageListener = (msg: any) => {
      if (msg.action === "SHOW_TOAST") {
        showStatus(
          msg.message,
          msg.title.toLowerCase().includes("fail") ||
            msg.title.toLowerCase().includes("error"),
        );
      }
    };
    browser.runtime.onMessage.addListener(messageListener);

    // Return clean-up handler synchronously
    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
      browser.storage.onChanged.removeListener(storageListener);
    };
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
        onConfirm={handleConfirm}
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

<!-- Custom overlay modal matching original settings theme styles -->
{#if modalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay open" onclick={() => modalResolve?.(false)}>
    <div class="modal-box" onclick={(e) => e.stopPropagation()}>
      <h3>{modalTitle}</h3>
      <p>{modalMsg}</p>

      {#if currentWarnKey}
        <div
          style="margin-top: 16px; display: flex; align-items: center; gap: 8px;"
        >
          <input
            type="checkbox"
            id="dont-warn-checkbox"
            bind:checked={dontWarnValue}
            style="width: 14px; height: 14px; cursor: pointer; accent-color: var(--color-accent);"
          />
          <label
            for="dont-warn-checkbox"
            style="font-size: 12px; color: var(--color-text-muted); cursor: pointer; user-select: none;"
          >
            Don't warn me again
          </label>
        </div>
      {/if}

      <div class="modal-actions">
        <button
          class="btn btn-ghost btn-sm"
          onclick={() => modalResolve?.(false)}>Cancel</button
        >
        <button
          class="btn btn-amber btn-sm"
          onclick={() => modalResolve?.(true)}>Proceed</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  /* Force system success green on all matched list checkmarks and settings API status elements globally */
  :global(.qi-link-status, .api-status.ok, .pill-ok) {
    color: #3ddc84 !important;
    border-color: rgba(61, 220, 132, 0.25) !important;
  }
</style>
