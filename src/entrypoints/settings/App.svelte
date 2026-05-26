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
  import { storage } from "wxt/utils/storage";

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

  function isCustomThemeId(id: string): boolean {
    return (
      id === "custom" || id.startsWith("custom_") || id.startsWith("custom-")
    );
  }

  /* ── Synchronous Theme Cache Initialization ── */
  // Retrieve cached theme settings synchronously from localStorage to instantly align
  // Svelte variables with HTML header values before first document paint.
  const cachedTheme =
    typeof window !== "undefined"
      ? localStorage.getItem("nta-theme-cache")
      : null;
  const cachedFont =
    typeof window !== "undefined"
      ? localStorage.getItem("nta-font-cache")
      : null;
  if (cachedTheme || cachedFont) {
    const themeToApply = cachedTheme || "dark-amber";
    const fontToApply = cachedFont || "sans";

    if (!isCustomThemeId(themeToApply)) {
      applyThemeToDocument(themeToApply, fontToApply, undefined, {
        useStaticInPageLogo: false,
      });
    } else {
      try {
        const cachedColorsStr = localStorage.getItem("nta-custom-colors-cache");
        if (cachedColorsStr) {
          const cachedColors = JSON.parse(cachedColorsStr);
          applyThemeToDocument("dark-amber", fontToApply, cachedColors, {
            useStaticInPageLogo: false,
          });
        }
      } catch (e) {}
    }
  }

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

  onMount(() => {
    // Restore active tab from extension storage or localStorage
    const loadSavedTab = async () => {
      const savedTab = (await storage.getItem(
        "local:activeSettingsTab",
      )) as string;
      if (savedTab) {
        activeTab = savedTab;
        // Clean up the key so future manual settings opens don't force a tab redirection
        await storage.setItem("local:activeSettingsTab", null);
      } else {
        const localSaved = localStorage.getItem("nt-active-settings-tab");
        if (localSaved) {
          activeTab = localSaved;
        }
      }
    };
    loadSavedTab();

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
        const useStaticInPageLogo = c?.useStaticInPageLogo === true;

        localStorage.setItem("nta-theme-cache", theme);
        localStorage.setItem("nta-font-cache", font);

        if (isCustomThemeId(theme)) {
          const themeId = theme.replace("custom_", "").replace("custom-", "");
          const customThemes = c?.customThemes || [];
          const targetTheme = customThemes.find(
            (t: any) =>
              t.id === themeId ||
              t.id === theme ||
              t.id === "custom_" + themeId ||
              t.id === "custom-" + themeId,
          );
          if (targetTheme) {
            localStorage.setItem(
              "nta-custom-colors-cache",
              JSON.stringify(targetTheme.colors),
            );
            applyThemeToDocument("dark-amber", font, targetTheme.colors, {
              useStaticInPageLogo,
            });
          } else {
            applyThemeToDocument("dark-amber", font, undefined, {
              useStaticInPageLogo,
            });
          }
        } else {
          localStorage.removeItem("nta-custom-colors-cache");
          applyThemeToDocument(theme, font, undefined, { useStaticInPageLogo });
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
        const useStaticInPageLogo = val?.useStaticInPageLogo === true;

        localStorage.setItem("nta-theme-cache", nextTheme);
        localStorage.setItem("nta-font-cache", nextFont);

        if (isCustomThemeId(nextTheme)) {
          const themeId = nextTheme
            .replace("custom_", "")
            .replace("custom-", "");
          const customThemes = val?.customThemes || [];
          const targetTheme = customThemes.find(
            (t: any) => t.id === themeId || t.id === nextTheme,
          );
          if (targetTheme) {
            localStorage.setItem(
              "nta-custom-colors-cache",
              JSON.stringify(targetTheme.colors),
            );
            applyThemeToDocument("dark-amber", nextFont, targetTheme.colors, {
              useStaticInPageLogo,
            });
          } else {
            applyThemeToDocument("dark-amber", nextFont, undefined, {
              useStaticInPageLogo,
            });
          }
        } else {
          localStorage.removeItem("nta-custom-colors-cache");
          applyThemeToDocument(nextTheme, nextFont, undefined, {
            useStaticInPageLogo,
          });
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
      // Instantly switch tabs when redirected from an already active open settings tab
      if (msg.action === "SWITCH_SETTINGS_TAB") {
        handleTabChange(msg.tab);
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
        onTabChange={handleTabChange}
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
  /* Force system theme-adaptive green on all matched list checkmarks and settings status elements globally */
  :global(.qi-link-status, .api-status.ok, .pill-ok) {
    color: var(--color-api-green) !important;
    border-color: color-mix(
      in srgb,
      var(--color-api-green) 25%,
      transparent
    ) !important;
  }
</style>
