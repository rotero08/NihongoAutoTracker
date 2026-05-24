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

  onMount(() => {
    // Restore active tab from localStorage if available
    const savedTab = localStorage.getItem("nt-active-settings-tab");
    if (savedTab) {
      activeTab = savedTab;
    }

    // Load configuration values asynchronously
    const loadConfigAndTheme = async () => {
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

      /* Watch storage changes dynamically */
      browser.storage.onChanged.addListener(storageListener);
    };

    loadConfigAndTheme();

    /* Live update variables if changed in storage */
    const storageListener = (changes: any, area: string) => {
      if (area === "local" && changes["config"]) {
        const val = changes["config"].newValue as any;
        const nextTheme = val?.theme ?? "nihongo";
        const nextFont = val?.font ?? "sans";
        if (nextTheme === "custom") {
          applyThemeToDocument("dark-amber", nextFont);
          applyCustomTheme(val?.customColors);
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
