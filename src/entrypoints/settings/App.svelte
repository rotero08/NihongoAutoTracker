<!-- Settings/App.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { configStorage } from "@/lib/storage/config";
  import { videoQueueStorage, readingQueueStorage, stremioQueueStorage } from "@/lib/storage/queues";
  import Sidebar from "@/components/settings/Sidebar.svelte";
  import QueueTab from "@/components/settings/tabs/QueueTab.svelte";
  import ApiKeyTab from "@/components/settings/tabs/ApiKeyTab.svelte";
  import ThemeTab from "@/components/settings/tabs/ThemeTab.svelte";
  import VideoTab from "@/components/settings/tabs/VideoTab.svelte";
  import OverlayTab from "@/components/settings/tabs/OverlayTab.svelte";
  import StremioTab from "@/components/settings/tabs/StremioTab.svelte";
  import ReadersTab from "@/components/settings/tabs/ReadersTab.svelte";
  import DebugTab from "@/components/settings/tabs/DebugTab.svelte";
  import ConfirmModal from "@/components/popup/ConfirmModal.svelte";
  import { notify } from "@/lib/utils/toast";
  import { showToast } from "@/lib/utils/toast";
  import { applyThemeToDocument, syncThemeCache } from "@/lib/ui/themes";
  import { storage } from "wxt/utils/storage";

  import "@/styles/settings-shared.css";

  const browser: any =
    typeof (globalThis as any).browser !== "undefined"
      ? (globalThis as any).browser
      : typeof (globalThis as any).chrome !== "undefined"
        ? (globalThis as any).chrome
        : undefined;

  let activeTab = $state("queue");
  let queueCount = $state(0);
  let debugMode = $state(false);

  let confirmModal = $state<any>(null);

  function isCustomThemeId(id: string): boolean {
    return (
      id === "custom" || id.startsWith("custom_") || id.startsWith("custom-")
    );
  }

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
    const isLogSuccess =
      !err && (msg.toLowerCase().includes("log sent") || msg.includes("✓"));

    if (isLogSuccess) {
      showToast("Success", msg, false);
    } else {
      notify(err ? "Error" : "Success", msg);
    }
  }

  async function handleConfirm(
    title: string,
    msg: string,
    warnKey?: string,
  ): Promise<boolean> {
    if (confirmModal) {
      return await confirmModal.confirm(title, msg, warnKey);
    }
    return window.confirm(msg);
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
    const [video, reading, stremio] = await Promise.all([
      videoQueueStorage.getValue(),
      readingQueueStorage.getValue(),
      stremioQueueStorage.getValue(),
    ]);
    queueCount = (video?.length || 0) + (reading?.length || 0) + (stremio?.length || 0);
  }

  onMount(() => {
    const loadSavedTab = async () => {
      const savedTab = (await storage.getItem(
        "local:activeSettingsTab",
      )) as string;
      if (savedTab) {
        activeTab = savedTab;
        await storage.setItem("local:activeSettingsTab", null);
      } else {
        const localSaved = localStorage.getItem("nt-active-settings-tab");
        if (localSaved) {
          activeTab = localSaved;
        }
      }
    };
    loadSavedTab();

    const loadConfigAndTheme = async () => {
      const [cfg, video, reading, stremio] = await Promise.all([
        configStorage.getValue() as Promise<any>,
        videoQueueStorage.getValue(),
        readingQueueStorage.getValue(),
        stremioQueueStorage.getValue(),
      ]);

      debugMode = cfg.debugMode ?? false;
      queueCount = (video?.length || 0) + (reading?.length || 0) + (stremio?.length || 0);

      const applyTheme = (c: any) => {
        const theme = c?.theme ?? "nihongo";
        const font = c?.font ?? "sans";
        const useStaticInPageLogo = c?.useStaticInPageLogo === true;

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
            syncThemeCache(theme, font, targetTheme.colors);
            applyThemeToDocument("dark-amber", font, targetTheme.colors, {
              useStaticInPageLogo,
            });
          } else {
            syncThemeCache(theme, font, null);
            applyThemeToDocument("dark-amber", font, undefined, {
              useStaticInPageLogo,
            });
          }
        } else {
          syncThemeCache(theme, font, null);
          applyThemeToDocument(theme, font, undefined, { useStaticInPageLogo });
        }
      };

      applyTheme(cfg);

      browser.storage.onChanged.addListener(storageListener);
    };

    loadConfigAndTheme();

    const storageListener = (changes: any, area: string) => {
      if (
        area === "local" &&
        (changes["videoQueue"] || changes["readingQueue"] || changes["stremioQueue"])
      ) {
        updateQueueCount();
      }
      if (area === "local" && changes["config"]) {
        const val = changes["config"].newValue as any;
        const nextTheme = val?.theme ?? "nihongo";
        const nextFont = val?.font ?? "sans";
        const useStaticInPageLogo = val?.useStaticInPageLogo === true;

        if (isCustomThemeId(nextTheme)) {
          const themeId = nextTheme
            .replace("custom_", "")
            .replace("custom-", "");
          const customThemes = val?.customThemes || [];
          const targetTheme = customThemes.find(
            (t: any) => t.id === themeId || t.id === nextTheme,
          );
          if (targetTheme) {
            syncThemeCache(nextTheme, nextFont, targetTheme.colors);
            applyThemeToDocument("dark-amber", nextFont, targetTheme.colors, {
              useStaticInPageLogo,
            });
          } else {
            syncThemeCache(nextTheme, nextFont, null);
            applyThemeToDocument("dark-amber", nextFont, undefined, {
              useStaticInPageLogo,
            });
          }
        } else {
          syncThemeCache(nextTheme, nextFont, null);
          applyThemeToDocument(nextTheme, nextFont, undefined, {
            useStaticInPageLogo,
          });
        }
      }
    };

    const messageListener = (msg: any) => {
      if (msg.action === "SHOW_TOAST") {
        showToast(
          msg.title,
          msg.message,
          msg.title.toLowerCase().includes("fail") ||
            msg.title.toLowerCase().includes("error"),
        );
      }
      if (msg.action === "SWITCH_SETTINGS_TAB") {
        handleTabChange(msg.tab);
      }
    };
    browser.runtime.onMessage.addListener(messageListener);

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
      <ThemeTab onStatus={showStatus} onConfirm={handleConfirm} />
    {:else if activeTab === "video"}
      <VideoTab onStatus={showStatus} />
    {:else if activeTab === "overlay"}
      <OverlayTab onStatus={showStatus} />
    {:else if activeTab === "stremio"}
      <StremioTab onStatus={showStatus} />
    {:else if activeTab === "readers"}
      <ReadersTab onStatus={showStatus} />
    {:else if activeTab === "debug"}
      <DebugTab onStatus={showStatus} />
    {/if}
  </main>
</div>

<ConfirmModal bind:this={confirmModal} />

<style>
  :global(html),
  :global(body) {
    background-color: var(--color-background) !important;
    color: var(--color-text) !important;
    min-height: 100vh;
    margin: 0;
    padding: 0;
  }
  :global(.shell) {
    background-color: var(--color-background) !important;
    min-height: 100vh;
  }
  :global(.main) {
    background-color: var(--color-background) !important;
    flex: 1;
  }

  :global(.qi-link-status, .api-status.ok, .pill-ok) {
    color: var(--color-api-green) !important;
    border-color: color-mix(
      in srgb,
      var(--color-api-green) 25%,
      transparent
    ) !important;
  }
</style>
