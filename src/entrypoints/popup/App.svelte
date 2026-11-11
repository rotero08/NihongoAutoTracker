<!-- Popup App.svelte -->
<script lang="ts">
  /**
   * ── Popup App.svelte ──────────────────────────────────────────────────────────
   * Displays the active queued items and provides navigation and appearance options.
   */

  import { onMount } from "svelte";
  import {
    videoQueueStorage,
    readingQueueStorage,
    stremioQueueStorage,
    updateVideoQueueAtomic,
    updateReadingQueueAtomic,
    updateStremioQueueAtomic,
  } from "@/lib/storage/queues";
  import { configStorage } from "@/lib/storage/config";
  import QueueList from "@/components/popup/QueueList.svelte";
  import PopupStats from "@/components/popup/PopupStats.svelte";
  import ConfirmModal from "@/components/common/ConfirmModal.svelte";
  import CustomSelect from "@/components/common/CustomSelect.svelte";
  import { notify } from "@/lib/utils/toast";
  import { sendAllQueued } from "@/lib/utils/queue-actions";
  import {
    applyThemeToDocument,
    applyCustomThemeToDoc,
    clearCustomThemeFromDoc,
    syncThemeCache,
    THEME_OPTIONS,
    FONT_OPTIONS,
    DYNAMIC_LOGO_SVG,
    READER_MATCH_COLORS,
  } from "@/lib/ui/themes";
  import {
    THEME_CACHE_KEY,
    FONT_CACHE_KEY,
    CUSTOM_COLORS_CACHE_KEY,
  } from "@/lib/constants";
  import { storage } from "wxt/utils/storage";
  import "@/styles/popup-shared.css";

  const browser: any =
    typeof (globalThis as any).browser !== "undefined"
      ? (globalThis as any).browser
      : typeof (globalThis as any).chrome !== "undefined"
        ? (globalThis as any).chrome
        : undefined;

  /* ── Reactive state ── */
  let videoQueue: any[] = $state([]);
  let readingQueue: any[] = $state([]);
  let stremioQueue: any[] = $state([]);
  let hasApiKey = $state(false);
  /** False until the first read of storage, so nothing flashes as "not set up". */
  let loaded = $state(false);
  let username = $state("");
  let currentFilter = $state<QueueFilter>("all");
  let isSendingAll = $state(false);
  let confirmModal = $state<any>(null);

  /* Appearance states */
  let selectedTheme = $state("dark-amber");
  let selectedFont = $state("sans");
  let showCompactMenu = $state(false);
  let customThemes = $state<any[]>([]);
  let syncPopupWithReaderTheme = $state(true);
  let activeUrl = $state("");

  const isReaderTab = $derived(
    activeUrl.includes("reader.ttsu.app") ||
      activeUrl.includes("app.yatsu.moe") ||
      activeUrl.includes("manga.manabe.es"),
  );

  async function disableSyncDirectly(e: MouseEvent) {
    e.stopPropagation();
    syncPopupWithReaderTheme = false;
    const cfg = (await configStorage.getValue()) as any;
    cfg.syncPopupWithReaderTheme = false;
    await configStorage.setValue(cfg);
    showStatus("✓ Popup theme unlocked");
    applyInitialTheme(cfg, activeUrl, null);
  }

  const total = $derived(videoQueue.length + readingQueue.length + stremioQueue.length);

  type QueueFilter = "all" | "video" | "reading" | "stremio";

  /** A tab per queue that has something in it; "All" only earns its place next to two of them. */
  const tabs = $derived.by(() => {
    const perType: Array<{ id: QueueFilter; label: string; count: number }> = [
      { id: "reading", label: "Reading", count: readingQueue.length },
      { id: "video", label: "Video", count: videoQueue.length },
      { id: "stremio", label: "Stremio", count: stremioQueue.length },
    ];
    const nonEmpty = perType.filter((tab) => tab.count > 0);
    return nonEmpty.length > 1
      ? [{ id: "all" as QueueFilter, label: "All", count: total }, ...nonEmpty]
      : [];
  });

  // The filtered queue can empty out (sent, cleared) while its tab is selected.
  $effect(() => {
    if (currentFilter !== "all" && !tabs.some((tab) => tab.id === currentFilter)) {
      currentFilter = "all";
    }
  });

  const filterLabel = $derived(tabs.find((tab) => tab.id === currentFilter)?.label.toLowerCase() ?? "all");

  function isCustomThemeId(id: string): boolean {
    return id === "custom" || id.startsWith("custom_");
  }

  /* ── Synchronous Theme Cache Initialization ── */
  const cachedTheme =
    typeof window !== "undefined"
      ? localStorage.getItem(THEME_CACHE_KEY)
      : null;
  const cachedFont =
    typeof window !== "undefined" ? localStorage.getItem(FONT_CACHE_KEY) : null;
  if (cachedTheme || cachedFont) {
    const themeToApply = cachedTheme || "dark-amber";
    const fontToApply = cachedFont || "sans";
    selectedTheme = themeToApply;
    selectedFont = fontToApply;

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
          applyCustomThemeToDoc(cachedColors);
        }
      } catch {
        /* Corrupt colour cache: the default theme stays until the real config loads. */
      }
    }
  }

  const initialLoadPromise = loadData();

  const themeOptions = $derived([
    ...THEME_OPTIONS,
    ...customThemes.map((t) => ({ value: t.id, label: t.name })),
  ]);

  function applyInitialTheme(
    cfg: any,
    activeUrl: string = "",
    detectedColors: any = null,
  ) {
    let themeVal = cfg?.selectedThemeId ?? cfg?.theme ?? "dark-amber";
    const fontVal = cfg?.font ?? "sans";
    const useStaticInPageLogo = cfg?.useStaticInPageLogo === true;
    let matchedColors: any = null;

    if (cfg?.syncPopupWithReaderTheme !== false && activeUrl) {
      let activeReaderTheme = "global";
      let readerKey = "";

      if (activeUrl.includes("reader.ttsu.app")) {
        activeReaderTheme = cfg?.ttuThemeOverride ?? "global";
        readerKey = "ttu";
      } else if (activeUrl.includes("app.yatsu.moe")) {
        activeReaderTheme = cfg?.yatsuThemeOverride ?? "global";
        readerKey = "yatsu";
      } else if (activeUrl.includes("manga.manabe.es")) {
        activeReaderTheme = cfg?.yomiyasuThemeOverride ?? "global";
        readerKey = "yomiyasu";
      }

      if (activeReaderTheme !== "global") {
        if (activeReaderTheme === "match-reader") {
          themeVal = `match-reader-${readerKey}`;
          if (detectedColors) {
            matchedColors = detectedColors;
          } else {
            if (READER_MATCH_COLORS[readerKey]) {
              matchedColors = READER_MATCH_COLORS[readerKey];
            }
          }
        } else {
          themeVal = activeReaderTheme;
        }
      }
    }

    if (matchedColors) {
      applyThemeToDocument("dark-amber", fontVal, matchedColors, {
        useStaticInPageLogo,
      });
      applyCustomThemeToDoc(matchedColors);
    } else if (isCustomThemeId(themeVal)) {
      const activeThemeObj = (cfg?.customThemes ?? []).find(
        (t: any) => t.id === themeVal,
      );
      if (activeThemeObj) {
        applyThemeToDocument("dark-amber", fontVal, activeThemeObj.colors, {
          useStaticInPageLogo,
        });
        applyCustomThemeToDoc(activeThemeObj.colors);
      } else if (cfg?.customColors) {
        applyThemeToDocument("dark-amber", fontVal, cfg.customColors, {
          useStaticInPageLogo,
        });
        applyCustomThemeToDoc(cfg.customColors);
      } else {
        clearCustomThemeFromDoc();
        applyThemeToDocument("dark-amber", fontVal, undefined, {
          useStaticInPageLogo,
        });
      }
    } else {
      clearCustomThemeFromDoc();
      applyThemeToDocument(themeVal, fontVal, undefined, {
        useStaticInPageLogo,
      });
    }
  }

  /* ── Data loading ── */
  async function loadData() {
    const tabPromise = (
      browser?.tabs?.query
        ? browser.tabs.query({ active: true, currentWindow: true })
        : Promise.resolve([])
    ).catch(() => []);
    const vQueuePromise = videoQueueStorage.getValue().catch(() => []);
    const rQueuePromise = readingQueueStorage.getValue().catch(() => []);
    const sQueuePromise = stremioQueueStorage.getValue().catch(() => []);
    const cfgPromise = (configStorage.getValue() as Promise<any>).catch(
      () => null,
    );

    const [activeTabs, vQueue, rQueue, sQueue, cfg] = await Promise.all([
      tabPromise,
      vQueuePromise,
      rQueuePromise,
      sQueuePromise,
      cfgPromise,
    ]);

    activeUrl = activeTabs[0]?.url || "";
    let host = "";
    try {
      if (activeUrl) host = new URL(activeUrl).hostname;
    } catch {
      /* Not a parseable URL (internal page): no host, so no reader theme to match. */
    }

    let detectedColors = null;
    if (host) {
      try {
        detectedColors = await storage.getItem(`local:readerColors:${host}`);
        if (!detectedColors && browser?.storage?.local) {
          const localStore = await browser.storage.local.get([
            `readerColors:${host}`,
            `local:readerColors:${host}`,
          ]);
          detectedColors =
            localStore[`local:readerColors:${host}`] ||
            localStore[`readerColors:${host}`];
        }
      } catch {
        /* Reader colours are a cosmetic extra; without them the configured theme applies. */
      }
    }

    videoQueue = vQueue;
    readingQueue = rQueue;
    stremioQueue = sQueue;
    hasApiKey = !!cfg?.apiKey;
    username = cfg?.username ?? "";
    customThemes = cfg?.customThemes ?? [];

    selectedTheme = cfg?.selectedThemeId ?? cfg?.theme ?? "dark-amber";
    selectedFont = cfg?.font ?? "sans";
    syncPopupWithReaderTheme = cfg?.syncPopupWithReaderTheme !== false;
    loaded = true;

    if (cfg) {
      const themeVal = cfg.selectedThemeId ?? cfg.theme ?? "dark-amber";
      const fontVal = cfg.font ?? "sans";
      let matchedColorsObj = null;
      if (isCustomThemeId(themeVal)) {
        const activeThemeObj = (cfg.customThemes ?? []).find(
          (t: any) => t.id === themeVal,
        );
        if (activeThemeObj) {
          matchedColorsObj = activeThemeObj.colors;
        } else if (cfg.customColors) {
          matchedColorsObj = cfg.customColors;
        }
      }
      syncThemeCache(themeVal, fontVal, matchedColorsObj);
    }

    applyInitialTheme(cfg, activeUrl, detectedColors);
  }

  onMount(() => {
    initialLoadPromise.catch(() => {});

    const unwatches = [
      videoQueueStorage.watch((newVal) => {
        videoQueue = newVal || [];
      }),
      readingQueueStorage.watch((newVal) => {
        readingQueue = newVal || [];
      }),
      stremioQueueStorage.watch((newVal) => {
        stremioQueue = newVal || [];
      }),
      configStorage.watch((val) => {
        const v = val as any;
        if (!v) return;
        const nextTheme = v.theme ?? "dark-amber";
        const nextFont = v.font ?? "sans";
        const useStaticInPageLogo = v.useStaticInPageLogo === true;
        username = v.username ?? "";
        hasApiKey = !!v.apiKey;
        customThemes = v.customThemes ?? [];
        syncPopupWithReaderTheme = v.syncPopupWithReaderTheme !== false;

        if (isCustomThemeId(nextTheme)) {
          const themeId = nextTheme
            .replace("custom_", "")
            .replace("custom-", "");
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
      })
    ];

    const clickOutsideOrDelete = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (
        target.closest(".compact-popover") ||
        target.closest(".appearance-toggle")
      ) {
        return;
      }
      showCompactMenu = false;
    };
    window.addEventListener("click", clickOutsideOrDelete, true);

    let isEditingActive = false;

    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        if (e.type === "keydown") {
          const active = document.activeElement as HTMLElement;
          const isTargetEditable =
            active &&
            (active.tagName === "INPUT" ||
              active.tagName === "TEXTAREA" ||
              active.tagName === "SELECT" ||
              active.hasAttribute("contenteditable") ||
              active.closest(".qi") ||
              active.closest(".compact-popover"));

          if (isTargetEditable || (e.repeat && isEditingActive)) {
            e.preventDefault();
            isEditingActive = true;
          } else {
            isEditingActive = false;
          }
        } else if (e.type === "keyup") {
          if (isEditingActive) {
            e.preventDefault();
            isEditingActive = false;
          }
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKey, true);
    window.addEventListener("keyup", handleGlobalKey, true);
    document.addEventListener("keydown", handleGlobalKey, true);
    document.addEventListener("keyup", handleGlobalKey, true);

    return () => {
      window.removeEventListener("click", clickOutsideOrDelete, true);
      window.removeEventListener("keydown", handleGlobalKey, true);
      window.removeEventListener("keyup", handleGlobalKey, true);
      document.removeEventListener("keydown", handleGlobalKey, true);
      document.removeEventListener("keyup", handleGlobalKey, true);
      unwatches.forEach((unwatch) => unwatch());
    };
  });

  /* ── Quick Switch actions ── */
  function toggleCompactMenu() {
    showCompactMenu = !showCompactMenu;
  }

  async function handleQuickTheme(val: string) {
    const cfg = (await configStorage.getValue()) as any;

    if (val.startsWith("delete-")) {
      const themeIdToDelete = val.replace("delete-", "");
      const ok = await confirmModal.confirm(
        "Delete Theme",
        "Are you sure you want to delete this custom theme?",
      );
      if (!ok) return;

      const updatedThemes = (cfg.customThemes ?? []).filter(
        (t: any) => t.id !== themeIdToDelete,
      );
      cfg.customThemes = updatedThemes;
      customThemes = updatedThemes;

      if (
        cfg.selectedThemeId === themeIdToDelete ||
        cfg.theme === themeIdToDelete
      ) {
        cfg.theme = "dark-amber";
        cfg.selectedThemeId = undefined;
        cfg.customColors = undefined;
        selectedTheme = "dark-amber";
        syncThemeCache("dark-amber", selectedFont, null);
        clearCustomThemeFromDoc();
        applyThemeToDocument("dark-amber", selectedFont);
      }
      await configStorage.setValue(cfg);
      showStatus("✓ Deleted Theme");
      return;
    }

    selectedTheme = val;
    const useStaticInPageLogo = cfg?.useStaticInPageLogo === true;
    let matchedColorsObj = null;
    if (isCustomThemeId(val)) {
      cfg.theme = val;
      cfg.selectedThemeId = val;
      const activeThemeObj = (cfg.customThemes ?? []).find(
        (t: any) => t.id === val,
      );
      if (activeThemeObj) {
        cfg.customColors = { ...activeThemeObj.colors };
        matchedColorsObj = activeThemeObj.colors;
      }
      await configStorage.setValue(cfg);
      applyThemeToDocument("dark-amber", selectedFont, activeThemeObj?.colors, {
        useStaticInPageLogo,
      });
      if (activeThemeObj) {
        applyCustomThemeToDoc(activeThemeObj.colors);
      }
    } else {
      cfg.theme = val;
      cfg.selectedThemeId = undefined;
      cfg.customColors = undefined;
      await configStorage.setValue(cfg);
      clearCustomThemeFromDoc();
      applyThemeToDocument(val, selectedFont, undefined, {
        useStaticInPageLogo,
      });
    }
    syncThemeCache(val, selectedFont, matchedColorsObj);
  }

  async function handleQuickFont(val: string) {
    selectedFont = val;
    const cfg = (await configStorage.getValue()) as any;
    const useStaticInPageLogo = cfg?.useStaticInPageLogo === true;
    await configStorage.setValue({ ...cfg, font: val });
    let matchedColorsObj = null;
    if (isCustomThemeId(selectedTheme)) {
      const activeThemeObj = (cfg.customThemes ?? []).find(
        (t: any) => t.id === selectedTheme,
      );
      if (activeThemeObj) {
        matchedColorsObj = activeThemeObj.colors;
      }
      applyThemeToDocument("dark-amber", val, activeThemeObj?.colors, {
        useStaticInPageLogo,
      });
      if (activeThemeObj) {
        applyCustomThemeToDoc(activeThemeObj.colors);
      }
    } else {
      applyThemeToDocument(selectedTheme, val, undefined, {
        useStaticInPageLogo,
      });
    }
    syncThemeCache(selectedTheme, val, matchedColorsObj);
  }

  /* ── Settings Actions ── */
  /** @param tab - Settings section to land on; omitted, the last one used is kept. */
  async function openSettings(tab?: string) {
    if (tab) {
      browser?.runtime?.sendMessage?.({ action: "OPEN_SETTINGS", tab })?.catch?.(() => {});
      return;
    }
    if (browser?.runtime?.openOptionsPage) {
      try {
        await browser.runtime.openOptionsPage();
        return;
      } catch {
        /* Not available here: fall through to asking the background to open settings. */
      }
    }
    if (browser?.runtime?.sendMessage) {
      browser.runtime.sendMessage({ action: "OPEN_SETTINGS" }).catch(() => {});
    }
  }

  function showStatus(msg: string, err = false) {
    // notify() routes popup toasts to the active web tab's bottom-right corner (and
    // only falls back to showing inside the popup when the active tab is a restricted
    // page). Keep every popup status message on that single path. [FIX]
    notify(err ? "Error" : "Success", msg);
  }

  async function handleConfirm(
    title: string,
    msg: string,
    warnKey?: string,
  ): Promise<boolean> {
    if (confirmModal) {
      try {
        return await confirmModal.confirm(title, msg, warnKey);
      } catch {
        /* The modal could not be shown: fall back to the native prompt below. */
      }
    }
    return window.confirm(msg);
  }

  /** The queues the bulk actions apply to: everything, or only the selected tab. */
  function queuesInScope() {
    const inScope = (type: QueueFilter) => currentFilter === "all" || currentFilter === type;
    return {
      reading: inScope("reading") ? readingQueue : [],
      video: inScope("video") ? videoQueue : [],
      stremio: inScope("stremio") ? stremioQueue : [],
    };
  }

  async function handleSendAll() {
    const cfg = (await configStorage.getValue()) as any;
    const queues = queuesInScope();
    const scope = currentFilter === "all" ? "all pending logs" : `all pending ${filterLabel} logs`;

    if (cfg.warnSendAll !== false) {
      const ok = await confirmModal.confirm(
        "Send all",
        `Send ${scope} to NihongoTracker?`,
        "warnSendAll",
      );
      if (!ok) return;
    }

    const hasUnmatched = queues.reading.some(
      (item) => !item.mediaId || item.mediaId === "web-reading",
    );
    if (hasUnmatched && cfg.warnUnmatched !== false) {
      const ok = await confirmModal.confirm(
        "Unmatched Media Warning",
        "There are unmatched reading logs in the queue that are not linked to any AniList entry. They will be logged as unmatched. Do you want to proceed?",
        "warnUnmatched",
      );
      if (!ok) return;
    }

    isSendingAll = true;
    try {
      const { sent, failed } = await sendAllQueued(queues);

      if (failed > 0) {
        showStatus(sent > 0 ? `⚠ Sent ${sent} logs, but ${failed} failed` : "⚠ Failed to send logs", true);
      } else if (sent > 0) {
        showStatus(`✓ Sent ${sent} ${sent === 1 ? "log" : "logs"}`);
      }
    } finally {
      isSendingAll = false;
      await loadData();
    }
  }

  async function handleClearAll() {
    // Captured up front: the selected tab falls back to "All" as soon as its
    // queue empties, which must not widen what is being cleared.
    const filter = currentFilter;
    const label = filterLabel;
    const inScope = (type: QueueFilter) => filter === "all" || filter === type;

    const ok = await confirmModal.confirm(
      filter === "all" ? "Clear queue" : `Clear ${label} queue`,
      `Delete ${filter === "all" ? "all pending logs" : `all pending ${label} logs`} without sending them? This cannot be undone.`,
    );
    if (!ok) return;

    if (inScope("video")) await updateVideoQueueAtomic(() => []);
    if (inScope("reading")) await updateReadingQueueAtomic(() => []);
    if (inScope("stremio")) await updateStremioQueueAtomic(() => []);
    await loadData();
  }
</script>

<header class="header">
  <div class="brand">
    <div class="brand-mark">
      {@html DYNAMIC_LOGO_SVG}
    </div>
    <div class="brand-text">
      <div class="brand-name">NihongoAutoTracker</div>
      {#if !loaded}
        <div class="account">&nbsp;</div>
      {:else if hasApiKey}
        <div class="account" title="Logging to this NihongoTracker account">
          <span class="status-dot ok"></span>{username ? `@${username}` : "Connected"}
        </div>
      {:else}
        <button class="account" onclick={() => openSettings("api")}>
          <span class="status-dot off"></span>Add your API key
        </button>
      {/if}
    </div>
  </div>

  <div class="header-actions">
    <button
      class="icon-btn appearance-toggle"
      title="Theme and font"
      aria-label="Theme and font"
      aria-expanded={showCompactMenu}
      onclick={toggleCompactMenu}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 18a6 6 0 1 0 0-12v12z" fill="currentColor" />
      </svg>
    </button>
    <button class="icon-btn" title="Settings" aria-label="Settings" onclick={() => openSettings()}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>

    {#if showCompactMenu}
      <div class="compact-popover">
        <span class="popover-title">Appearance</span>

        {#if isReaderTab && syncPopupWithReaderTheme}
          <div class="sync-note">
            <span>Following this reader's theme.</span>
            <button type="button" onclick={disableSyncDirectly}>Use my own theme</button>
          </div>
        {/if}

        <div class="popover-fields" class:locked={isReaderTab && syncPopupWithReaderTheme}>
          <CustomSelect
            options={themeOptions}
            value={selectedTheme}
            onChange={handleQuickTheme}
            onDelete={(id) => handleQuickTheme("delete-" + id)}
            deletableValues={customThemes.map((t) => t.id)}
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
      </div>
    {/if}
  </div>
</header>

<div class="sep"></div>

<PopupStats />

<div class="sep"></div>

{#if total > 0}
  <div class="queue-toolbar">
    {#if tabs.length > 0}
      <div class="queue-tabs" role="tablist">
        {#each tabs as tab (tab.id)}
          <button
            class="q-tab"
            class:active={currentFilter === tab.id}
            role="tab"
            aria-selected={currentFilter === tab.id}
            onclick={() => (currentFilter = tab.id)}
          >
            {tab.label}<span class="q-count">{tab.count}</span>
          </button>
        {/each}
      </div>
    {:else}
      <span class="queue-heading">{total} waiting to be sent</span>
    {/if}

    <div class="queue-bulk">
      <button
        class="icon-btn"
        title={currentFilter === "all" ? "Clear queue" : `Clear ${filterLabel} queue`}
        aria-label="Clear queue"
        onclick={handleClearAll}
        disabled={isSendingAll}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
      <button class="bulk-btn" onclick={handleSendAll} disabled={isSendingAll}>
        {isSendingAll ? "Sending…" : "Send all"}
      </button>
    </div>
  </div>
{/if}

<div class="queue-container">
  <QueueList
    {videoQueue}
    {readingQueue}
    {stremioQueue}
    {currentFilter}
    {loaded}
    {hasApiKey}
    onOpenApiSettings={() => openSettings("api")}
    onStatusMessage={showStatus}
    onConfirm={handleConfirm}
    onRefresh={loadData}
  />
</div>

<ConfirmModal bind:this={confirmModal} />
