<!-- Popup App.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { videoQueueStorage, readingQueueStorage } from "@/lib/storage/queues";
  import { configStorage } from "@/lib/storage/config";
  import QueueList from "@/components/popup/QueueList.svelte";
  import ConfirmModal from "@/components/popup/ConfirmModal.svelte";
  import CustomSelect from "@/components/settings/CustomSelect.svelte";
  import { notify } from "@/lib/api/youtube"; // Route notifications to the unified smart helper
  import {
    submitLog,
    resolveVideoChannelMedia,
  } from "@/lib/api/nihongotracker";
  import { stripVideoTitle } from "@/lib/utils/text-parsing";
  import {
    applyThemeToDocument,
    THEME_OPTIONS,
    FONT_OPTIONS,
    DYNAMIC_LOGO_SVG,
  } from "@/lib/ui/themes";
  import "@/styles/popup-shared.css";

  /* ── Reactive state ── */
  let videoQueue: any[] = $state([]);
  let readingQueue: any[] = $state([]);
  let hasApiKey = $state(false);
  let currentFilter = $state("all");
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
    showStatus("✓ Synced theme unlocked");
    applyInitialTheme(cfg, activeUrl, null);
  }

  const total = $derived(videoQueue.length + readingQueue.length);

  function isCustomThemeId(id: string): boolean {
    return id === "custom" || id.startsWith("custom_");
  }

  // Dynamic dropdown list containing saved custom themes
  const themeOptions = $derived([
    ...THEME_OPTIONS,
    ...customThemes.map((t) => ({ value: t.id, label: t.name })),
  ]);

  /**
   * Helper function to apply the theme config settings without re-fetching storage.
   */
  function applyInitialTheme(
    cfg: any,
    activeUrl: string = "",
    detectedColors: any = null,
  ) {
    let themeVal = cfg?.selectedThemeId ?? cfg?.theme ?? "dark-amber";
    const fontVal = cfg?.font ?? "sans";
    let matchedColors: any = null;

    // Check if theme sync is on (enabled by default) and apply reader's design palette
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
            // Apply the actual, computed colors cached from the active reader tab
            matchedColors = detectedColors;
          } else {
            // Static fallbacks in case the tab has not loaded yet
            if (readerKey === "ttu") {
              matchedColors = {
                background: "#121820",
                surface: "#1a2330",
                surfaceAlt: "#141c27",
                border: "#243245",
                borderHover: "#30435c",
                text: "#e2e8f0",
                textMuted: "#718096",
                accent: "#ff6b6b",
                accentHover: "#ff8787",
                success: "#3ddc84",
              };
            } else if (readerKey === "yatsu") {
              matchedColors = {
                background: "#16161a",
                surface: "#242629",
                surfaceAlt: "#1c1e21",
                border: "#3a3f44",
                borderHover: "#4e545b",
                text: "#fffffe",
                textMuted: "#94a1b2",
                accent: "#7f5af0",
                accentHover: "#9b7eff",
                success: "#2cb67d",
              };
            } else if (readerKey === "yomiyasu") {
              matchedColors = {
                background: "#0f0f16",
                surface: "#151522",
                surfaceAlt: "#11111c",
                border: "#202033",
                borderHover: "#2d2d47",
                text: "#f5f6f8",
                textMuted: "#8e90a6",
                accent: "#3ddc84",
                accentHover: "#5eeba0",
                success: "#3ddc84",
              };
            }
          }
        } else {
          // If the reader is using a specific preset or custom theme, inherit it directly
          themeVal = activeReaderTheme;
        }
      }
    }

    if (matchedColors) {
      applyThemeToDocument("dark-amber", fontVal, matchedColors);
    } else if (isCustomThemeId(themeVal)) {
      const activeThemeObj = (cfg?.customThemes ?? []).find(
        (t: any) => t.id === themeVal,
      );
      if (activeThemeObj) {
        applyThemeToDocument("dark-amber", fontVal, activeThemeObj.colors);
      } else if (cfg?.customColors) {
        applyThemeToDocument("dark-amber", fontVal, cfg.customColors);
      } else {
        applyThemeToDocument("dark-amber", fontVal);
      }
    } else {
      applyThemeToDocument(themeVal, fontVal);
    }
  }

  /* ── Data loading ── */
  async function loadData() {
    // Execute critical tab query and primary storage queries concurrently to prevent waterfall delay
    const tabPromise = browser.tabs
      .query({ active: true, currentWindow: true })
      .catch(() => []);
    const vQueuePromise = videoQueueStorage.getValue().catch(() => []);
    const rQueuePromise = readingQueueStorage.getValue().catch(() => []);
    const cfgPromise = (configStorage.getValue() as Promise<any>).catch(
      () => null,
    );

    const [activeTabs, vQueue, rQueue, cfg] = await Promise.all([
      tabPromise,
      vQueuePromise,
      rQueuePromise,
      cfgPromise,
    ]);

    activeUrl = activeTabs[0]?.url || "";
    let host = "";
    try {
      if (activeUrl) host = new URL(activeUrl).hostname;
    } catch (e) {}

    // Fetch localized reader colors only after the hostname has been established
    let detectedColors = null;
    if (host) {
      try {
        const localStore = await browser.storage.local.get(
          `readerColors:${host}`,
        );
        detectedColors = localStore[`readerColors:${host}`];
      } catch (e) {}
    }

    videoQueue = vQueue;
    readingQueue = rQueue;
    hasApiKey = !!cfg?.apiKey;
    customThemes = cfg?.customThemes ?? [];

    selectedTheme = cfg?.selectedThemeId ?? cfg?.theme ?? "dark-amber";
    selectedFont = cfg?.font ?? "sans";
    syncPopupWithReaderTheme = cfg?.syncPopupWithReaderTheme !== false;

    applyInitialTheme(cfg, activeUrl, detectedColors);
  }

  function decorateDropdownOptions() {
    const options = document.querySelectorAll(
      ".select-option, .option, [class*='option']",
    );
    options.forEach((opt) => {
      const text = (opt.textContent || "").replace("✕", "").trim();
      if (!text) return;

      const isPreset = [
        "Dark Amber (Default)",
        "Charcoal Amber",
        "Deep Ocean Dark",
        "Nordic Light",
        "Amethyst Purple",
        "Theme",
        "Font",
      ].some((preset) => text.startsWith(preset));

      if (!isPreset && customThemes.some((t) => t.name && text === t.name)) {
        if (!opt.querySelector(".dropdown-delete-cross")) {
          const textSpan = document.createElement("span");
          textSpan.className = "dropdown-option-text";
          textSpan.textContent = text;
          textSpan.style.overflow = "hidden";
          textSpan.style.textOverflow = "ellipsis";
          textSpan.style.whiteSpace = "nowrap";
          textSpan.style.flex = "1";
          textSpan.style.textAlign = "left";

          opt.innerHTML = "";
          opt.appendChild(textSpan);

          (opt as HTMLElement).style.display = "flex";
          (opt as HTMLElement).style.justifyContent = "space-between";
          (opt as HTMLElement).style.alignItems = "center";
          (opt as HTMLElement).style.width = "100%";
          (opt as HTMLElement).style.position = "relative";
          (opt as HTMLElement).style.gap = "8px";

          const cross = document.createElement("span");
          cross.className = "dropdown-delete-cross";
          cross.textContent = "✕";
          cross.style.color = "var(--color-text-muted)";
          cross.style.fontSize = "10px";
          cross.style.fontWeight = "bold";
          cross.style.cursor = "pointer";
          cross.style.padding = "2px 4px";
          cross.style.marginLeft = "auto";
          cross.style.marginRight = "-2px";
          cross.style.transition = "color 0.15s";

          cross.onmouseenter = () =>
            (cross.style.color = "var(--color-error, #ff4444)");
          cross.onmouseleave = () =>
            (cross.style.color = "var(--color-text-muted)");

          opt.appendChild(cross);
        }
      }
    });
  }

  // Invoke loadData immediately on script evaluation to unblock the initial paint lifecycle
  loadData();

  onMount(() => {
    const storageListener = (changes: any, area: string) => {
      if (
        area === "local" &&
        (changes["videoQueue"] || changes["readingQueue"])
      ) {
        const focusedTag = document.activeElement?.tagName;
        if (focusedTag === "INPUT" || focusedTag === "SELECT") return;
        loadData();
      }
      if (area === "local" && changes["config"]) {
        const val = changes["config"].newValue as any;
        const nextTheme = val?.selectedThemeId ?? val?.theme ?? "dark-amber";
        const nextFont = val?.font ?? "sans";

        if (val?.customThemes) {
          customThemes = val.customThemes;
        }

        selectedTheme = nextTheme;
        selectedFont = nextFont;
        syncPopupWithReaderTheme = val?.syncPopupWithReaderTheme !== false;

        if (isCustomThemeId(nextTheme)) {
          const activeThemeObj = (val?.customThemes ?? []).find(
            (t: any) => t.id === nextTheme,
          );
          if (activeThemeObj) {
            applyThemeToDocument("dark-amber", nextFont, activeThemeObj.colors);
          } else if (val?.customColors) {
            applyThemeToDocument("dark-amber", nextFont, val.customColors);
          } else {
            applyThemeToDocument("dark-amber", nextFont);
          }
        } else {
          applyThemeToDocument(nextTheme, nextFont);
        }
      }
    };
    browser.storage.onChanged.addListener(storageListener);

    const clickOutsideOrDelete = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Intercept click on the '✕' symbol in dropdown options list to trigger Delete
      if (target.classList.contains("dropdown-delete-cross")) {
        e.preventDefault();
        e.stopPropagation();

        const optionEl = target.closest(
          ".select-option, .option, [class*='option']",
        );
        if (optionEl) {
          const text = (optionEl.textContent || "").replace("✕", "").trim();
          const matchedTheme = customThemes.find((t) => t.name === text);
          if (matchedTheme) {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            const dropdownMenu = target.closest(
              ".select-dropdown, .dropdown-menu, .compact-popover, [class*='dropdown'], [class*='popover']",
            );
            if (dropdownMenu instanceof HTMLElement) {
              dropdownMenu.style.display = "none";
            }
            showCompactMenu = false; // explicitly close popup popover
            handleQuickTheme("delete-" + matchedTheme.id);
          }
        }
        return;
      }

      // Close popover only if clicking outside of the popover and the toggle button
      if (
        target.closest(".compact-popover") ||
        target.closest(".appearance-toggle")
      ) {
        setTimeout(decorateDropdownOptions, 30);
        return;
      }
      showCompactMenu = false;
    };
    window.addEventListener("click", clickOutsideOrDelete, true);

    return () => {
      window.removeEventListener("click", clickOutsideOrDelete, true);
      browser.storage.onChanged.removeListener(storageListener);
    };
  });

  /* ── Quick Switch actions ── */
  function toggleCompactMenu() {
    showCompactMenu = !showCompactMenu;
    if (showCompactMenu) {
      setTimeout(decorateDropdownOptions, 30);
    }
  }

  async function handleQuickTheme(val: string) {
    const cfg = (await configStorage.getValue()) as any;

    // Handle inline custom theme deletion trigger from inside popup dropdown
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
        applyThemeToDocument("dark-amber", selectedFont);
      }
      await configStorage.setValue(cfg);
      showStatus("✓ Deleted Theme");
      return;
    }

    selectedTheme = val;
    if (isCustomThemeId(val)) {
      cfg.theme = val;
      cfg.selectedThemeId = val;
      const activeThemeObj = (cfg.customThemes ?? []).find(
        (t: any) => t.id === val,
      );
      if (activeThemeObj) {
        cfg.customColors = { ...activeThemeObj.colors };
      }
      await configStorage.setValue(cfg);
      // Base themes are set first, then our custom theme overrides them correctly
      applyThemeToDocument("dark-amber", selectedFont, activeThemeObj?.colors);
    } else {
      cfg.theme = val;
      cfg.selectedThemeId = undefined;
      cfg.customColors = undefined;
      await configStorage.setValue(cfg);
      applyThemeToDocument(val, selectedFont);
    }
  }

  async function handleQuickFont(val: string) {
    selectedFont = val;
    const cfg = (await configStorage.getValue()) as any;
    await configStorage.setValue({ ...cfg, font: val });
    if (isCustomThemeId(selectedTheme)) {
      const activeThemeObj = (cfg.customThemes ?? []).find(
        (t: any) => t.id === selectedTheme,
      );
      applyThemeToDocument("dark-amber", val, activeThemeObj?.colors);
    } else {
      applyThemeToDocument(selectedTheme, val);
    }
  }

  /* ── Settings Actions ─────────────────────────────────────────── */
  async function openSettings() {
    const settingsUrl = browser.runtime.getURL("/settings.html");
    const tabs = await browser.tabs.query({});
    const existingTab = tabs.find(
      (t) => t.url && t.url.startsWith(settingsUrl),
    );
    if (existingTab && existingTab.id !== undefined) {
      await browser.tabs.update(existingTab.id, { active: true });
      if (existingTab.windowId !== undefined) {
        await browser.windows.update(existingTab.windowId, { focused: true });
      }
    } else {
      await browser.tabs.create({ url: settingsUrl });
    }
    window.close();
  }

  function showStatus(msg: string, err = false) {
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
      } catch (e) {
        console.error("ConfirmModal error, falling back to window.confirm:", e);
      }
    }
    return window.confirm(msg);
  }

  async function handleSendAll() {
    const cfg = (await configStorage.getValue()) as any;
    if (cfg.warnSendAll !== false) {
      const ok = await confirmModal.confirm(
        "Send All",
        "Are you sure you want to send all pending logs?",
        "warnSendAll",
      );
      if (!ok) return;
    }
    isSendingAll = true;

    function getItemPayloads(item: any, type: "reading" | "video") {
      const isRead = type === "reading";
      const sessions = item.sessions ?? [];
      const displayMins = isRead
        ? Math.max(1, Math.round((item.time || 0) / 60))
        : item.time || 0;
      const sumSecs = sessions.reduce(
        (a: number, b: any) => a + (b.secs || 0),
        0,
      );
      const sumMins = Math.max(1, Math.round(sumSecs / 60));
      const sumChars = isRead
        ? sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0)
        : 0;

      const hasOverride = isRead
        ? Number(item.chars || 0) > sumChars || displayMins > sumMins
        : displayMins > Math.round(sumSecs / 60);

      const defaultDateStr =
        sessions.length > 0
          ? sessions[0].date
          : item.date || new Date().toISOString();
      const desc =
        item.description || item.contentTitleNative || "Unknown Title";

      if (sessions.length > 1 && !hasOverride) {
        return sessions.map((sess: any) => {
          const sessMins = Math.max(1, Math.round((sess.secs || 0) / 60));
          const payload: any = {
            type,
            description: type === "video" ? stripVideoTitle(desc) : desc,
            time: sessMins,
            date: new Date(sess.date).toISOString(),
            chars: isRead ? sess.chars || 0 : 0,
            episodes: 0,
            pages: 0,
            unknownDate: false,
            mediaId: isRead
              ? item.mediaId || "web-reading"
              : item.mediaData?.channelId || item.channelId || "web-video",
            mediaData: item.mediaData || {},
          };
          if (isRead) {
            payload.volume = Math.max(1, Number(item.volume || 1));
          }
          return payload;
        });
      } else {
        const payload: any = {
          type,
          description: type === "video" ? stripVideoTitle(desc) : desc,
          time: displayMins,
          date: new Date(defaultDateStr).toISOString(),
          chars: isRead ? item.chars || 0 : 0,
          episodes: 0,
          pages: 0,
          unknownDate: false,
          mediaId: isRead
            ? item.mediaId || "web-reading"
            : item.mediaData?.channelId || item.channelId || "web-video",
          mediaData: item.mediaData || {},
        };
        if (isRead) {
          payload.volume = Math.max(1, Number(item.volume || 1));
        }
        return [payload];
      }
    }

    const rItems = [...readingQueue];
    const vItems = [...videoQueue];

    const failedReadingIds = new Set<string>();
    const failedVideoIds = new Set<string>();
    let totalSent = 0;
    let totalFailed = 0;

    // Process reading logs
    for (const item of rItems) {
      try {
        const payloads = getItemPayloads(item, "reading");
        let itemSucceeded = true;
        for (const p of payloads) {
          const res = await submitLog(p, true);
          if (res?.success) {
            totalSent++;
          } else {
            itemSucceeded = false;
            totalFailed++;
          }
        }
        if (!itemSucceeded) {
          failedReadingIds.add(item.id);
        }
      } catch {
        failedReadingIds.add(item.id);
        totalFailed++;
      }
    }

    // Process video logs
    for (const item of vItems) {
      try {
        const channelId = item.channelId || item.mediaData?.channelId;
        const channelTitle =
          item.mediaData?.channelTitle ||
          item.channelTitle ||
          item.contentTitleNative;
        if (channelId || channelTitle) {
          try {
            const media = await resolveVideoChannelMedia({
              channelId,
              channelTitle,
            });
            item.mediaData = {
              ...(item.mediaData || {}),
              channelId: media.channelId || channelId || "web-video",
              channelTitle:
                media.channelTitle || channelTitle || item.contentTitleNative,
              ...(media.channelImage
                ? { channelImage: media.channelImage }
                : {}),
              ...(media.channelDescription
                ? { channelDescription: media.channelDescription }
                : {}),
            };
          } catch (_e) {}
        }

        const payloads = getItemPayloads(item, "video");
        let itemSucceeded = true;
        for (const p of payloads) {
          const res = await submitLog(p, true);
          if (res?.success) {
            totalSent++;
          } else {
            itemSucceeded = false;
            totalFailed++;
          }
        }
        if (!itemSucceeded) {
          failedVideoIds.add(item.id);
        }
      } catch {
        failedVideoIds.add(item.id);
        totalFailed++;
      }
    }

    const freshReadingQueue = await readingQueueStorage.getValue();
    const freshVideoQueue = await videoQueueStorage.getValue();

    const nextReadingQueue = [
      ...freshReadingQueue.filter(
        (item: any) => !rItems.some((sent: any) => sent.id === item.id),
      ),
      ...rItems.filter((item: any) => failedReadingIds.has(item.id)),
    ];
    const nextVideoQueue = [
      ...freshVideoQueue.filter(
        (item: any) => !vItems.some((sent: any) => sent.id === item.id),
      ),
      ...vItems.filter((item: any) => failedVideoIds.has(item.id)),
    ];

    await readingQueueStorage.setValue(nextReadingQueue);
    await videoQueueStorage.setValue(nextVideoQueue);

    if (totalFailed > 0) {
      if (totalSent > 0) {
        showStatus(`Sent ${totalSent} logs, but ${totalFailed} failed`, true);
      } else {
        showStatus(`Failed to send logs`, true);
      }
    } else if (totalSent > 0) {
      showStatus(`Successfully sent all ${totalSent} logs`);
    }

    isSendingAll = false;
    await loadData();
  }

  async function handleClearAll() {
    const ok = await confirmModal.confirm(
      "Clear All",
      "Are you sure you want to clear all pending logs?",
    );
    if (!ok) return;
    if (currentFilter === "all" || currentFilter === "video")
      await videoQueueStorage.setValue([]);
    if (currentFilter === "all" || currentFilter === "reading")
      await readingQueueStorage.setValue([]);
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
      {@html DYNAMIC_LOGO_SVG}
    </div>
    <div class="brand-text">
      <div class="brand-name">NihongoAutoTracker</div>
      <div class="pill" class:pill-ok={hasApiKey} class:pill-off={!hasApiKey}>
        {hasApiKey ? "API Key ✓" : "No API Key"}
      </div>
    </div>
  </div>

  <div style="display: flex; gap: 6px; position: relative;">
    <button
      class="icon-btn appearance-toggle"
      title="Appearance Settings"
      onclick={toggleCompactMenu}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="display: block;"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 18a6 6 0 1 0 0-12v12z" fill="currentColor" />
      </svg>
    </button>
    <button class="icon-btn" title="Open Settings" onclick={openSettings}>
      <!-- Standard highly obvious filled gear settings cog SVG icon scaled identically to the toggle button -->
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        style="width: 14px; height: 14px; display: block;"
        ><path
          d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.64-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
        /></svg
      >
    </button>

    {#if showCompactMenu}
      <div
        class="compact-popover"
        style="position: absolute; top: calc(100% + 6px); right: 0; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 4px; padding: 10px; width: 160px; z-index: 10000; box-shadow: 0 4px 15px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 10px;"
      >
        <span
          style="font-size: 9px; font-weight: bold; color: var(--color-text); text-transform: uppercase; display: block; border-bottom: 1px solid var(--color-border); padding-bottom: 4px;"
          >Appearance</span
        >

        {#if isReaderTab && syncPopupWithReaderTheme}
          <div
            style="background: color-mix(in srgb, var(--color-accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent); border-radius: 4px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; line-height: 1.25;"
          >
            <span
              style="font-size: 9.5px; font-weight: bold; color: var(--color-accent); display: flex; align-items: center; gap: 4px;"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="flex-shrink:0;"
                ><rect x="3" y="11" width="18" height="11" rx="2" ry="2"
                ></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg
              >
              Synced with Reader
            </span>
            <button
              type="button"
              style="background: none; border: none; color: var(--color-text); text-decoration: underline; font-family: inherit; font-size: 9px; cursor: pointer; text-align: left; padding: 0; font-weight: bold; transition: color 0.15s;"
              onmouseenter={(e) =>
                (e.currentTarget.style.color = "var(--color-accent)")}
              onmouseleave={(e) =>
                (e.currentTarget.style.color = "var(--color-text)")}
              onclick={disableSyncDirectly}
            >
              Unlock Layout
            </button>
          </div>
        {/if}

        <div
          style={isReaderTab && syncPopupWithReaderTheme
            ? "opacity: 0.45; pointer-events: none; cursor: not-allowed; display: flex; flex-direction: column; gap: 10px;"
            : "display: flex; flex-direction: column; gap: 10px;"}
        >
          <CustomSelect
            options={themeOptions}
            value={selectedTheme}
            onChange={handleQuickTheme}
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

<!-- ── Queue header ── -->
<div class="queue-header">
  <div class="queue-header-left">
    <span class="queue-label">QUEUE</span>
    <span class="badge">{total}</span>
  </div>
  {#if total > 0}
    <div class="queue-bulk">
      <button
        class="bulk-btn amber"
        onclick={handleSendAll}
        disabled={isSendingAll}>{isSendingAll ? "..." : "Send All"}</button
      >
      <button
        class="bulk-btn ghost"
        onclick={handleClearAll}
        disabled={isSendingAll}>Clear</button
      >
    </div>
  {/if}
</div>

<!-- ── Filter tabs ── -->
<div class="queue-tabs">
  {#each ["all", "video", "reading"] as filter}
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

<style>
  /* ── Root ── */
  :global(body) {
    font-family: var(--font-mono);
    background: var(--color-background);
    color: var(--color-text);
    width: 380px;
    min-height: 350px; /* Setup a stable static height to accommodate open dropdowns */
    font-size: 13px;
    overflow: hidden;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  /* Ensure Svelte application root container occupies the full vertical viewport space */
  :global(#app) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 350px;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-mark {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: transparent;
  }
  .brand-mark :global(svg) {
    width: 100%;
    height: 100%;
  }
  .brand-name {
    font-size: 11px;
    font-weight: bold;
    color: var(--color-text);
    letter-spacing: 0.04em;
    margin-bottom: 2px;
  }
  .pill {
    display: inline-block;
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 8px;
  }
  .pill-ok {
    color: var(--color-api-green) !important;
    border: 1px solid
      color-mix(in srgb, var(--color-api-green) 25%, transparent) !important;
    background: color-mix(
      in srgb,
      var(--color-api-green) 8%,
      transparent
    ) !important;
  }
  .pill-off {
    color: var(--color-error);
    border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
    background: color-mix(in srgb, var(--color-error) 7%, transparent);
  }

  /* Transparent, borderless header options buttons with hover transitions */
  .icon-btn {
    width: 24px;
    height: 24px;
    background: transparent !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    color: var(--color-text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
    padding: 0;
  }
  .icon-btn:hover {
    color: var(--color-accent) !important;
  }

  /* Force system theme-adaptive green on all matched list checkmarks and popup items globally */
  :global(.qi-link-status, .api-status.ok, .pill-ok) {
    color: var(--color-api-green) !important;
    border-color: color-mix(
      in srgb,
      var(--color-api-green) 25%,
      transparent
    ) !important;
  }

  /* ── Separator ── */
  .sep {
    height: 1px;
    background: var(--color-border);
  }

  /* ── Queue header & tabs (Contrast Mapped) ── */
  .queue-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 14px 6px;
  }
  .queue-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .queue-label {
    font-size: 10px;
    font-weight: bold;
    color: var(--color-text-dimmed);
    letter-spacing: 0.1em;
  }
  .badge {
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    color: var(--color-accent);
    border: 1px solid color-mix(in srgb, var(--color-accent) 22%, transparent);
    border-radius: 8px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: bold;
  }
  .queue-bulk {
    display: flex;
    gap: 6px;
  }
  .bulk-btn {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: bold;
    padding: 3px 8px;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: opacity 0.15s;
  }
  .bulk-btn:hover {
    opacity: 0.7;
  }
  .bulk-btn.amber {
    background: var(--color-accent);
    color: var(--color-accent-text);
    border-color: var(--color-accent);
  }
  .bulk-btn.ghost {
    background: none;
    color: var(--color-text-muted);
    border-color: var(--color-border-hover);
  }
  .bulk-btn:disabled {
    opacity: 0.45 !important;
    cursor: not-allowed !important;
    pointer-events: none !important;
  }
  .queue-tabs {
    display: flex;
    gap: 8px;
    padding: 0 14px 8px;
    border-bottom: 1px solid var(--color-border);
  }
  .q-tab {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-dimmed);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--font-mono);
    transition: all 0.15s;
    font-weight: bold;
  }
  .q-tab:hover {
    color: var(--color-text);
    border-color: var(--color-border-hover);
  }
  .q-tab.active {
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    color: var(--color-accent);
    border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
  }

  /* ── Footer ── */
  .footer {
    padding: 9px 12px 12px;
  }

  .open-btn {
    width: 100%;
    background: none;
    color: var(--color-text-dimmed);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 7px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .open-btn:hover {
    color: var(--color-text-muted);
    border-color: var(--color-border-hover);
  }

  /* Style select dropdown option layouts inside popover globally */
  :global(
      .compact-popover .select-option,
      .compact-popover .option,
      .compact-popover [class*="option"]
    ) {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    width: 100%;
  }

  /* Restrict standard selection dropdown menu heights to keep layout compact and scrollable */
  :global(
      .select-dropdown,
      .dropdown-menu,
      [class*="select-dropdown"],
      [class*="dropdown-menu"],
      [class*="select-options"],
      [class*="options-container"]
    ) {
    max-height: 160px !important;
    overflow-y: auto !important;
  }

  /* Modern sleek minimalist scrollbar styles across popup elements */
  :global(::-webkit-scrollbar) {
    width: 6px !important;
    height: 6px !important;
  }
  :global(::-webkit-scrollbar-track) {
    background: transparent !important;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: rgba(255, 255, 255, 0.12) !important;
    border-radius: 10px !important;
    transition: background 0.2s;
  }
  :global(::-webkit-scrollbar-thumb:hover) {
    background: rgba(255, 255, 255, 0.25) !important;
  }
  /* Firefox Scrollbar support */
  :global(*) {
    scrollbar-width: thin !important;
    scrollbar-color: rgba(255, 255, 255, 0.12) transparent !important;
  }
</style>
