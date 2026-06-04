<!-- Settings/App.svelte -->
<script lang="ts">
  /**
   * ── Settings App.svelte ─────────────────────────────────────────────────────
   * The primary layout skeleton wrapping the advanced dashboard tabs.
   */

  import { onMount } from "svelte";
  import { configStorage } from "@/lib/storage/config";
  import { videoQueueStorage, readingQueueStorage, stremioQueueStorage } from "@/lib/storage/queues";
  import Sidebar from "@/components/settings/layout/Sidebar.svelte";
  import QueueTab from "@/components/settings/tabs/QueueTab.svelte";
  import DashboardTab from "@/components/settings/tabs/DashboardTab.svelte";
  import ApiKeyTab from "@/components/settings/tabs/ApiKeyTab.svelte";
  import ThemeTab from "@/components/settings/tabs/ThemeTab.svelte";
  import VideoTab from "@/components/settings/tabs/VideoTab.svelte";
  import OverlayTab from "@/components/settings/tabs/OverlayTab.svelte";
  import StremioTab from "@/components/settings/tabs/StremioTab.svelte";
  import ReadersTab from "@/components/settings/tabs/ReadersTab.svelte";
  import DebugTab from "@/components/settings/tabs/DebugTab.svelte";
  import ConfirmModal from "@/components/common/ConfirmModal.svelte";
  import { notify } from "@/lib/utils/toast";
  import { showToast } from "@/lib/utils/toast";
  import { applyThemeToDocument, syncThemeCache } from "@/lib/ui/themes";
  import { storage } from "wxt/utils/storage";
  import { THEME_CACHE_KEY, FONT_CACHE_KEY, CUSTOM_COLORS_CACHE_KEY, ACTIVE_SETTINGS_TAB_KEY } from "@/lib/constants";

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
  let username = $state("");

  let confirmModal = $state<any>(null);
  let themeTab = $state<any>(null);
  let tabChangeInFlight = $state(false);

  function isCustomThemeId(id: string): boolean {
    return (
      id === "custom" || id.startsWith("custom_") || id.startsWith("custom-")
    );
  }

  const cachedTheme =
    typeof window !== "undefined"
      ? localStorage.getItem(THEME_CACHE_KEY)
      : null;
  const cachedFont =
    typeof window !== "undefined"
      ? localStorage.getItem(FONT_CACHE_KEY)
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
        const cachedColorsStr = localStorage.getItem(CUSTOM_COLORS_CACHE_KEY);
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
      return await confirmModal.confirm(title, msg, warnKey || null);
    }
    return window.confirm(msg);
  }

  async function handleTabChange(tab: string) {
    if (tab === activeTab || tabChangeInFlight) return;

    if (activeTab === "theme" && themeTab?.hasUnsavedThemeChanges?.()) {
      tabChangeInFlight = true;
      let canLeave = false;
      try {
        canLeave = await themeTab.confirmLeaveThemeTab?.();
      } finally {
        tabChangeInFlight = false;
      }
      if (!canLeave) return;
    }

    activeTab = tab;
    localStorage.setItem(ACTIVE_SETTINGS_TAB_KEY, tab);
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
        ACTIVE_SETTINGS_TAB_KEY,
      )) as string;
      if (savedTab) {
        activeTab = savedTab;
        await storage.setItem(ACTIVE_SETTINGS_TAB_KEY, null);
      } else {
        const localSaved = localStorage.getItem(ACTIVE_SETTINGS_TAB_KEY);
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
      username = cfg.username ?? "";
      queueCount = (video?.length || 0) + (reading?.length || 0) + (stremio?.length || 0);

      const applyTheme = (c: any) => {
        const theme = c?.theme ?? "dark-amber";
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
              useStaticInPageLogo: false,
            });
          } else {
            syncThemeCache(theme, font, null);
            applyThemeToDocument("dark-amber", font, undefined, {
              useStaticInPageLogo: false,
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
        const nextTheme = val?.theme ?? "dark-amber";
        const nextFont = val?.font ?? "sans";
        const useStaticInPageLogo = val?.useStaticInPageLogo === true;
        username = val?.username ?? "";

        if (isCustomThemeId(nextTheme)) {
          const themeId = nextTheme
            .replace("custom_", "custom_")
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

  // Safe DOM synchronization observer matching sidebar assets
  $effect(() => {
    if (typeof document === "undefined") return; // Fixed conditional SSR guard

    const syncSidebar = () => {
      // 1. Inject username below brand title with targeted querying
      const brandEl = document.querySelector('.sidebar .brand-name, .brand-text .brand-name, h2');
      if (brandEl && brandEl.parentElement) {
        if (!brandEl.parentElement.querySelector('.injected-username') && username) {
          const userDiv = document.createElement('div');
          userDiv.className = 'injected-username font-mono';
          userDiv.textContent = `@${username}`;
          userDiv.setAttribute('style', 'font-size: 10px; color: var(--color-text-muted); font-weight: normal; margin-top: 1px; margin-bottom: 4px; opacity: 0.85;');
          brandEl.insertAdjacentElement('afterend', userDiv);
        }
      }

      // 2. Override dashboard icon in the sidebar safely to match popup's dashboard icon
      const sidebarButtons = document.querySelectorAll('button, a, .sidebar-item');
      sidebarButtons.forEach(btn => {
        const txt = btn.textContent?.trim().toLowerCase();
        if (txt === 'dashboard') {
          const svg = btn.querySelector('svg');
          if (svg && !svg.classList.contains('dash-synced')) {
            svg.classList.add('dash-synced');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.innerHTML = `
              <line x1="18" y1="20" x2="18" y2="10" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="12" y1="20" x2="12" y2="4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="6" y1="20" x2="6" y2="14" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            `;
          }
        }
      });
    };

    syncSidebar();
    const observer = new MutationObserver(syncSidebar);
    const container = document.querySelector('.shell');
    if (container) {
      observer.observe(container, { childList: true, subtree: true });
    }
    return () => {
      observer.disconnect();
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

  <main class="main" class:dashboard-layout={activeTab === "dashboard"}>
    {#if activeTab === "dashboard"}
      <DashboardTab onStatus={showStatus} onConfirm={handleConfirm} />
    {:else if activeTab === "queue"}
      <QueueTab
        onStatus={showStatus}
        onQueueCountChange={handleQueueCountChange}
        onConfirm={handleConfirm}
        onTabChange={handleTabChange}
      />
    {:else if activeTab === "api"}
      <ApiKeyTab onStatus={showStatus} />
    {:else if activeTab === "theme"}
      <ThemeTab
        bind:this={themeTab}
        onStatus={showStatus}
        onConfirm={handleConfirm}
      />
    {:else if activeTab === "video"}
      <VideoTab onStatus={showStatus} />
    {:else if activeTab === "overlay"}
      <OverlayTab onStatus={showStatus} />
    {:else if activeTab === "stremio"}
      <StremioTab onStatus={showStatus} />
    {:else if activeTab === "readers"}
      <ReadersTab onStatus={showStatus} />
    {:else if activeTab === "debug"}
      <DebugTab onStatus={showStatus} onConfirm={handleConfirm} />
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
  :global(.main.dashboard-layout) {
    max-width: 1200px !important;
    width: 100% !important;
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
