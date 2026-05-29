<!-- START OF FILE TtuChronoDropdown.svelte -->

<script lang="ts">
    import { onMount } from "svelte";
    import { searchAniList } from "@/lib/api/anilist";
    import { submitLog } from "@/lib/api/nihongotracker";
    import { readingQueueStorage } from "@/lib/storage/queues";
    import { ttuHistoryStorage, ttuLinkStorage } from "@/lib/storage/ttu";
    import { fmt } from "@/lib/utils/time";
    import { showToast } from "@/lib/utils/toast";
    import { addDebugLog } from "@/lib/storage/debug";

    // Svelte 5 Runes Properties
    let {
        ttuState = $bindable(),
        stateRefs,
        getTTUTitle,
        parseTitleWithConfig,
        extractTTUCharCount,
        getReaderName,
        getCurrentReaderConfig,
        liveSyncQueue,
        saveSessionAndQueue,
    } = $props();

    // Reactive Svelte States (Synchronized with global plain proxies)
    let running = $state(false);
    let timeMs = $state(0);
    let chars = $state(0);

    // Search, Linked Media, and History States
    let isDropdownOpen = $state(false);
    let linkedMedia = $state<any>(null);
    let anilistSearchQuery = $state("");
    let anilistResults = $state<any[]>([]);
    let isSearchingAnilist = $state(false);
    let pastSessions = $state<any[]>([]);

    // Editing Overlays
    let isEditingTime = $state(false);
    let isEditingChars = $state(false);
    let isEditingVol = $state(false);

    let timeInputVal = $state("");
    let charsInputVal = $state("");
    let volInputVal = $state(1);

    // Status Overlays
    let showSilentGraceStatus = $state(false);
    let linkDebounce: any;
    let clickTimeout: any = null;

    // Derived metrics (Reactive Computations)
    let cachedHistoryMins = $derived(
        pastSessions.reduce((acc, s) => acc + Math.round(s.timeMs / 60000), 0),
    );
    let cachedHistoryChars = $derived(
        pastSessions.reduce((acc, s) => acc + s.chars, 0),
    );
    let totalMins = $derived(cachedHistoryMins + Math.floor(timeMs / 60000));
    let totalChars = $derived(cachedHistoryChars + chars);
    let sessSpeed = $derived(
        timeMs > 0 ? Math.round((chars / (timeMs / 60000)) * 60) : 0,
    );
    let totSpeed = $derived(
        totalMins > 0 ? Math.round((totalChars / totalMins) * 60) : 0,
    );

    // Dynamic Svelte State to Sync Config instantly without Reloads
    let readerConfig = $state<any>({
        autoSave: true,
        directSend: false,
        hideUnavailableActions: false,
    });

    let isAutoSaveEnabled = $derived(readerConfig.autoSave !== false);
    let isDirectSendSettingEnabled = $derived(readerConfig.directSend === true);
    let isHideUnavailableEnabled = $derived(
        readerConfig.hideUnavailableActions === true,
    );

    let isSaveAvailable = $derived(!isAutoSaveEnabled);
    let showSaveButton = $derived(!isHideUnavailableEnabled || isSaveAvailable);

    let isDirectSendAvailable = $derived(
        isDirectSendSettingEnabled && !!linkedMedia,
    );
    let showDirectSendButton = $derived(
        !isHideUnavailableEnabled || isDirectSendAvailable,
    );

    // Lifecycle & Storage watch binds
    onMount(() => {
        readerConfig = getCurrentReaderConfig();
        const handleLinkerRefresh = () => {
            running = ttuState.running;
            timeMs = ttuState.timeMs;
            chars = ttuState.chars;
            readerConfig = getCurrentReaderConfig(); // Sync reader config immediately on change events
            // refreshLinkerUI(); // Removed to avoid high storage retrieval overhead during ticks
        };
        const handleHistoryRefresh = () => {
            updateHistoryData();
        };
        const handleJitenStatus = (e: any) => {
            showSilentGraceStatus = !!e.detail?.parsing;
        };

        const stopPropagation = (e: Event) => e.stopPropagation();

        const wrapper = document.getElementById("nt-ttu-chrono-wrapper");
        if (wrapper) {
            // Prevent standard reader actions from capturing our user inputs
            wrapper.addEventListener("click", stopPropagation);
            wrapper.addEventListener("dblclick", stopPropagation);
            wrapper.addEventListener("mousedown", stopPropagation);
            wrapper.addEventListener("mouseup", stopPropagation);

            wrapper.addEventListener("nt-linker-refresh", handleLinkerRefresh);
            wrapper.addEventListener(
                "nt-history-refresh",
                handleHistoryRefresh,
            );
            wrapper.addEventListener("nt-jiten-status", handleJitenStatus);
        }

        updateHistoryData();
        handleLinkerRefresh();

        // Setup custom dismiss triggers on outer document click events
        const handleOuterClick = (e: MouseEvent) => {
            if (wrapper && !e.composedPath().includes(wrapper)) {
                isDropdownOpen = false;
            }
        };
        document.addEventListener("click", handleOuterClick);

        return () => {
            if (wrapper) {
                wrapper.removeEventListener("click", stopPropagation);
                wrapper.removeEventListener("dblclick", stopPropagation);
                wrapper.removeEventListener("mousedown", stopPropagation);
                wrapper.removeEventListener("mouseup", stopPropagation);

                wrapper.removeEventListener(
                    "nt-linker-refresh",
                    handleLinkerRefresh,
                );
                wrapper.removeEventListener(
                    "nt-history-refresh",
                    handleHistoryRefresh,
                );
                wrapper.removeEventListener(
                    "nt-jiten-status",
                    handleJitenStatus,
                );
            }
            document.removeEventListener("click", handleOuterClick);
        };
    });

    // Action helper to focus inputs dynamically
    function autofocus(node: HTMLInputElement) {
        node.focus();
        node.select();
    }

    // Visual database updates
    async function updateHistoryData() {
        const history = (await ttuHistoryStorage.getValue()) || {};
        pastSessions = history[getTTUTitle()] || [];
    }

    async function refreshLinkerUI(force = false) {
        const title = getTTUTitle();
        const links = (await ttuLinkStorage.getValue()) || {};
        const match = links[title];

        // Avoid overwriting search query parameter state if user is typing
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && activeEl.id === "nt-ttu-link-input";
        if (!force && isInputFocused) {
            return;
        }

        if (match && match.mediaId) {
            linkedMedia = match;
            volInputVal = Math.max(1, Number(match.volume || 1));
        } else {
            linkedMedia = null;
            const parsed = parseTitleWithConfig(title);
            anilistSearchQuery = parsed.query; // Pre-fills with parsed document title
            volInputVal = Math.max(1, Number(parsed.volume || 1));
        }
    }

    // Click & DblClick handlers
    function handleBtnClick(e: MouseEvent) {
        e.stopPropagation();
        const btn = e.currentTarget as HTMLElement;
        if (
            btn.classList.contains("nt-btn-suspended") ||
            btn.classList.contains("nt-btn-suspended-running")
        ) {
            return;
        }

        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
            return; // Handled by dblclick
        }

        clickTimeout = setTimeout(async () => {
            clickTimeout = null;
            isDropdownOpen = !isDropdownOpen;
            if (isDropdownOpen) {
                // Run deep sync on dropdown initialization
                const charData = extractTTUCharCount();
                if (charData && typeof charData === "object") {
                    const currentCount = charData.current;
                    if (stateRefs.globalSessionStartChar === -1) {
                        stateRefs.globalSessionStartChar = currentCount;
                    }
                    let diff = currentCount - stateRefs.globalSessionStartChar;
                    if (diff < 0) diff = 0;
                    ttuState.chars = diff + stateRefs.globalManualCharOffset;
                }
                await updateHistoryData();
                await refreshLinkerUI();
                running = ttuState.running;
                timeMs = ttuState.timeMs;
                chars = ttuState.chars;
            }
        }, 200);
    }

    // Play/Pause timer toggle bindings
    function handleBtnDblClick(e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
        }

        const btn = e.currentTarget as HTMLElement;
        if (btn.classList.contains("nt-btn-suspended")) return;

        toggleTimer();
    }

    function toggleTimer() {
        const wasRunning = ttuState.running;
        ttuState.running = !ttuState.running;
        running = ttuState.running;

        if (ttuState.running) {
            const currentCount = extractTTUCharCount()
                ? extractTTUCharCount().current
                : null;
            if (currentCount !== null) {
                stateRefs.globalSessionStartChar =
                    currentCount -
                    (ttuState.chars - stateRefs.globalManualCharOffset);
            }
            stateRefs.globalLastTick = Date.now();
        } else if (wasRunning) {
            stateRefs.globalLastTick = Date.now();
        }
        timeMs = ttuState.timeMs;
        chars = ttuState.chars;
    }

    function resetSession(e: MouseEvent) {
        e.stopPropagation();
        ttuState.timeMs = 0;
        ttuState.chars = 0;
        const currentCount = extractTTUCharCount()
            ? extractTTUCharCount().current
            : null;
        stateRefs.globalSessionStartChar =
            currentCount !== null ? currentCount : -1;
        stateRefs.globalManualCharOffset = 0;

        stateRefs.lastSectionIndex = -1;
        stateRefs.lastSectionTotal = 0;
        stateRefs.visitedSections.clear();

        // Sync back to local reactive state
        timeMs = 0;
        chars = 0;
    }

    async function handleSaveSession(e: MouseEvent) {
        e.stopPropagation();
        await saveSessionAndQueue();
        await updateHistoryData();
        timeMs = ttuState.timeMs;
        chars = ttuState.chars;
    }

    async function handleDirectSend(e: MouseEvent) {
        e.stopPropagation();
        if (!linkedMedia || !linkedMedia.mediaId) {
            showToast("Error", "Link AniList media first!");
            return;
        }
        try {
            // silent = true skips submitLog's own alert triggers, keeping it snappy
            const res = await submitLog(
                {
                    type: "reading",
                    mediaId: String(linkedMedia.mediaId),
                    description:
                        linkedMedia.mediaData?.contentTitleNative ||
                        getTTUTitle(),
                    mediaData: linkedMedia.mediaData,
                    time: Math.max(1, Math.round(ttuState.timeMs / 60000)),
                    chars: ttuState.chars,
                    volume: linkedMedia.volume || 1,
                    date: new Date().toISOString(),
                    episodes: 0,
                    pages: 0,
                    private: false,
                    unknownDate: false,
                },
                true,
            );

            if (res && res.success) {
                showToast("Success", "Logged directly to NihongoTracker!");
                ttuState.timeMs = 0;
                ttuState.chars = 0;
                timeMs = 0;
                chars = 0;
                await updateHistoryData();
            } else {
                showToast("Error", res?.error || "Direct send failed", true);
                await addDebugLog(
                    "ERROR",
                    "TtuChronoDropdown",
                    "Direct send failed",
                    res?.error,
                );
            }
        } catch (err) {
            showToast(
                "Error",
                "Failed to communicate with NihongoTracker",
                true,
            );
            await addDebugLog(
                "ERROR",
                "TtuChronoDropdown",
                "Direct send caught critical exception",
                err,
            );
        }
    }

    function openSettings(e: MouseEvent) {
        e.stopPropagation();
        browser.runtime
            .sendMessage({
                action: "OPEN_SETTINGS",
                tab: "readers",
                hash: "#readers",
            })
            .catch(() => {
                window.open(
                    browser.runtime.getURL(
                        "/settings.html?tab=readers#readers",
                    ),
                    "_blank",
                );
            });
    }

    // AniList linkage helpers with Svelte 5 two-way state sync bindings (Issue 5 Fix)
    function handleAnilistInput(query: string, instant = false) {
        clearTimeout(linkDebounce);
        query = query.trim();
        anilistSearchQuery = query;
        if (query.length < 2) {
            anilistResults = [];
            return;
        }

        isSearchingAnilist = true;

        const performSearch = async () => {
            try {
                const results = await searchAniList(query, 5);
                anilistResults = results || [];
            } catch {
                showToast("Error", "AniList search failed");
            } finally {
                isSearchingAnilist = false;
            }
        };

        if (instant) {
            performSearch();
        } else {
            linkDebounce = setTimeout(performSearch, 400);
        }
    }

    async function linkSelectedMedia(m: any) {
        const title = getTTUTitle();
        const { volume } = parseTitleWithConfig(title);
        const targetVolume = Math.max(1, volInputVal || volume || 1);

        const nativeTitle =
            m.title?.contentTitleNative || m.contentTitleNative || "Unknown";
        const cover = m.coverImage || m.contentImage || "";

        const links = (await ttuLinkStorage.getValue()) || {};
        links[title] = {
            mediaId: m.contentId,
            volume: targetVolume,
            mediaData: {
                contentId: m.contentId,
                contentTitleNative: nativeTitle,
                contentTitleEnglish:
                    m.title?.contentTitleEnglish || m.contentTitleEnglish || "",
                contentTitleRomaji:
                    m.title?.contentTitleRomaji || m.contentTitleRomaji,
                contentImage: cover,
                coverImage: cover,
                chapters: m.textChapters || m.chapters,
                volumes: m.volumes,
            },
        };
        await ttuLinkStorage.setValue(links);

        const queue = await readingQueueStorage.getValue();
        // Legacy matching: fall back to raw title matching when necessary (Issue 5 Fix)
        const existing = queue.find(
            (q) => q.originalTitle === title || q.contentTitleNative === title,
        );

        if (existing) {
            existing.mediaId = m.contentId;
            existing.volume = targetVolume;
            existing.mediaData = links[title].mediaData;
            existing.contentTitleNative = nativeTitle;
            existing.contentTitleEnglish =
                m.title?.contentTitleEnglish || m.contentTitleEnglish || "";
            existing.description = nativeTitle;
            await readingQueueStorage.setValue(queue);
        }

        anilistResults = [];
        anilistSearchQuery = "";
        await refreshLinkerUI(true);

        if (ttuState.timeMs > 0 || ttuState.chars > 0) {
            await liveSyncQueue();
        }
    }

    async function unlinkMedia(e: MouseEvent) {
        e.stopPropagation();
        const title = getTTUTitle();

        // 1. Delete from link storage
        const links = (await ttuLinkStorage.getValue()) || {};
        delete links[title];
        await ttuLinkStorage.setValue(links);

        // 2. Fetch and align with exactly the same parsed query matching used by the watcher
        const queue = await readingQueueStorage.getValue();
        // Legacy matching: fall back to raw title matching when necessary (Issue 5 Fix)
        const existing = queue.find(
            (q) => q.originalTitle === title || q.contentTitleNative === title,
        );

        if (existing) {
            existing.mediaId = "web-reading";
            existing.mediaData = undefined;
            await readingQueueStorage.setValue(queue);
        }

        // 3. Clear Svelte local state and refresh UI
        linkedMedia = null;
        const parsed = parseTitleWithConfig(title);
        anilistSearchQuery = parsed.query;
        await refreshLinkerUI(true);
    }

    // Handles focusing on search bar to trigger search automatically with current text
    function handleSearchFocus() {
        if (
            anilistSearchQuery.trim().length >= 2 &&
            anilistResults.length === 0 &&
            !isSearchingAnilist
        ) {
            handleAnilistInput(anilistSearchQuery);
        }
    }

    // Handles blurring the search bar input to reset search states gracefully
    function handleSearchBlur() {
        setTimeout(() => {
            anilistResults = [];
            refreshLinkerUI();
        }, 200);
    }

    // Manual session edits
    function startTimeEdit(e: MouseEvent) {
        e.stopPropagation();
        timeInputVal = fmt(ttuState.timeMs);
        isEditingTime = true;
    }

    function commitTimeEdit() {
        isEditingTime = false;
        const parts = timeInputVal.split(":").map(Number);
        let ms = -1;
        if (!parts.some(isNaN)) {
            if (parts.length === 1) ms = parts[0] * 60 * 1000;
            else if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000;
            else if (parts.length === 3)
                ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        }
        if (ms >= 0) {
            ttuState.timeMs = ms;
            timeMs = ms;
        }
    }

    // Manual session edits
    function startCharsEdit(e: MouseEvent) {
        e.stopPropagation();
        charsInputVal = ttuState.chars.toString();
        isEditingChars = true;
    }

    function commitCharsEdit() {
        isEditingChars = false;
        const val = parseInt(charsInputVal.replace(/\D/g, ""), 10);
        if (!isNaN(val) && val >= 0) {
            const currentCount = extractTTUCharCount()
                ? extractTTUCharCount().current
                : 0;
            let diff =
                currentCount -
                (stateRefs.globalSessionStartChar !== -1
                    ? stateRefs.globalSessionStartChar
                    : 0);
            if (diff < 0) diff = 0;
            stateRefs.globalManualCharOffset = val - diff;
            ttuState.chars = val;
            chars = val;
        }
    }

    // Manual session edits
    function startVolEdit(e: MouseEvent) {
        e.stopPropagation();
        volInputVal = linkedMedia ? linkedMedia.volume : volInputVal;
        isEditingVol = true;
    }

    async function commitVolEdit() {
        isEditingVol = false;
        const next = Math.max(
            1,
            Number(String(volInputVal || "").replace(/\D/g, "")) || 1,
        );
        volInputVal = next;

        const title = getTTUTitle();
        const links = (await ttuLinkStorage.getValue()) || {};

        if (links[title]) {
            links[title].volume = next;
            await ttuLinkStorage.setValue(links);
        }

        const queue = await readingQueueStorage.getValue();
        // Legacy matching: fall back to raw title matching when necessary (Issue 5 Fix)
        const existing = queue.find(
            (q) => q.originalTitle === title || q.contentTitleNative === title,
        );
        if (existing) {
            existing.volume = next;
            await readingQueueStorage.setValue(queue);
        }
        await refreshLinkerUI();
    }

    function editLink(e: MouseEvent) {
        e.stopPropagation();
        if (linkedMedia && linkedMedia.mediaData) {
            anilistSearchQuery = linkedMedia.mediaData.contentTitleNative || "";
            handleAnilistInput(anilistSearchQuery, true); // Search instantly!
        }
        linkedMedia = null;
    }

    async function deleteSession(e: MouseEvent, sessionId: string) {
        e.stopPropagation();
        const title = getTTUTitle();
        const historyNow = (await ttuHistoryStorage.getValue()) || {};
        const curr = historyNow[title] || [];
        historyNow[title] = curr.filter((s: any) => s.id !== sessionId);
        await ttuHistoryStorage.setValue(historyNow);

        const q = await readingQueueStorage.getValue();
        const filtered = q.filter(
            (item: any) =>
                !(item.sessions || []).some((s: any) => s.id === sessionId),
        );
        if (filtered.length !== q.length) {
            await readingQueueStorage.setValue(filtered);
        }
        await updateHistoryData();
    }

    // Handles programmatic transitions of the DOM stabilizer's custom tooltip
    function handleMouseEnter() {
        const wrapper = document.getElementById("nt-ttu-chrono-wrapper");
        const btn = document.getElementById("nt-ttu-chrono-btn");
        const tooltip = wrapper?.querySelector(
            ".nt-chrono-tooltip",
        ) as HTMLElement;
        if (
            tooltip &&
            !isDropdownOpen &&
            btn &&
            (btn.classList.contains("nt-btn-suspended") ||
                btn.classList.contains("nt-btn-suspended-running"))
        ) {
            tooltip.style.setProperty("opacity", "1", "important");
            tooltip.style.setProperty(
                "transform",
                "translateY(0px)",
                "important",
            );
        }
    }

    // Reset tooltips smoothly
    function handleMouseLeave() {
        const wrapper = document.getElementById("nt-ttu-chrono-wrapper");
        const tooltip = wrapper?.querySelector(
            ".nt-chrono-tooltip",
        ) as HTMLElement;
        if (tooltip) {
            tooltip.style.setProperty("opacity", "0", "important");
            tooltip.style.setProperty(
                "transform",
                "translateY(5px)",
                "important",
            );
        }
    }
</script>

<!-- Chronometer trigger element -->
<button
    id="nt-ttu-chrono-btn"
    onclick={handleBtnClick}
    ondblclick={handleBtnDblClick}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    title="Click to open Tracker Menu or Double Click to toggle Tracker"
>
    <svg viewBox="0 0 24 24" fill="currentColor">
        <path
            id="nt-ttu-main-icon-path"
            d={running ? "M6 19h4V5H6v14zm8-14v14h4V5h-4z" : "M8 5v14l11-7z"}
            style="fill: currentColor !important;"
        />
    </svg>
</button>

<!-- Navigation Dropdown Menu Container -->
<div id="nt-ttu-dropdown" class:open={isDropdownOpen}>
    <div class="nt-ttu-dd-section">
        <div class="nt-ttu-dd-title">Current Session</div>
        <div class="nt-ttu-stats-row">
            <div class="nt-ttu-stat">
                <span class="nt-ttu-stat-label">Time</span>
                {#if isEditingTime}
                    <input
                        type="text"
                        class="nt-ttu-inline-input"
                        bind:value={timeInputVal}
                        onblur={commitTimeEdit}
                        onkeydown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") commitTimeEdit();
                        }}
                        onkeyup={(e) => e.stopPropagation()}
                        onkeypress={(e) => e.stopPropagation()}
                        use:autofocus
                    />
                {:else}
                    <button
                        type="button"
                        class="nt-ttu-btn-text nt-ttu-stat-val"
                        id="nt-ttu-val-time"
                        onclick={startTimeEdit}
                        title="Edit">{fmt(timeMs)}</button
                    >
                {/if}
            </div>
            <div class="nt-ttu-stat">
                <span class="nt-ttu-stat-label">Chars</span>
                {#if isEditingChars}
                    <input
                        type="text"
                        class="nt-ttu-inline-input"
                        bind:value={charsInputVal}
                        onblur={commitCharsEdit}
                        onkeydown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") commitCharsEdit();
                        }}
                        onkeyup={(e) => e.stopPropagation()}
                        onkeypress={(e) => e.stopPropagation()}
                        use:autofocus
                    />
                {:else}
                    <button
                        type="button"
                        class="nt-ttu-btn-text nt-ttu-stat-val"
                        id="nt-ttu-val-chars"
                        onclick={startCharsEdit}
                        title="Edit">{chars}</button
                    >
                {/if}
            </div>
            <div class="nt-ttu-stat">
                <span class="nt-ttu-stat-label">Speed</span>
                <span class="nt-ttu-stat-val no-hover" id="nt-ttu-val-speed"
                    >{sessSpeed}/h</span
                >
            </div>
        </div>
        <div class="nt-ttu-controls">
            <button
                class="nt-ttu-btn-icon"
                id="nt-ttu-btn-toggle"
                onclick={toggleTimer}
                title={running ? "Pause Timer" : "Start Timer"}
            >
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                        d={running
                            ? "M6 19h4V5H6v14zm8-14v14h4V5h-4z"
                            : "M8 5v14l11-7z"}
                        style="fill: currentColor !important;"
                    />
                </svg>
            </button>
            <button
                class="nt-ttu-btn-icon"
                id="nt-ttu-btn-reset"
                onclick={resetSession}
                title="Reset Session"
            >
                <svg viewBox="0 0 24 24"
                    ><path
                        d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                    /></svg
                >
            </button>

            <!-- Manual Save & Queue configuration switch -->
            {#if showSaveButton}
                <button
                    class="nt-ttu-btn-icon primary"
                    id="nt-ttu-btn-log"
                    onclick={handleSaveSession}
                    disabled={!isSaveAvailable}
                    title={isSaveAvailable
                        ? "Save & Queue"
                        : "Auto-sync is enabled (Sends automatically via Settings Queue)"}
                    style={!isSaveAvailable
                        ? "opacity: 0.3; cursor: not-allowed;"
                        : ""}
                >
                    <svg viewBox="0 0 24 24"
                        ><path
                            d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"
                        /></svg
                    >
                </button>
            {/if}

            <!-- Direct Send configuration switch -->
            {#if showDirectSendButton}
                <button
                    class="nt-ttu-btn-icon primary"
                    id="nt-ttu-btn-direct"
                    onclick={handleDirectSend}
                    disabled={!isDirectSendAvailable}
                    title={isDirectSendAvailable
                        ? "Send session to NT directly"
                        : !isDirectSendSettingEnabled
                          ? "Direct send disabled in settings"
                          : "Link AniList media first to enable Direct Send"}
                    style={!isDirectSendAvailable
                        ? "opacity: 0.3; cursor: not-allowed;"
                        : ""}
                >
                    <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24"
                        ><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg
                    >
                </button>
            {/if}

            <button
                class="nt-ttu-btn-icon"
                id="nt-ttu-btn-settings"
                onclick={openSettings}
                title="Open Tracker Settings"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style="width: 15px; height: 15px;"
                    ><path
                        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.44-.17-.47-.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6s-1.62 3.6-3.6 3.6z"
                    /></svg
                >
            </button>
        </div>

        {#if showSilentGraceStatus}
            <div id="nt-ttu-sync-status" class="nt-ttu-sync-status">
                <svg class="nt-ttu-spinner" viewBox="0 0 24 24">
                    <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="rgba(255,255,255,0.12)"
                    ></circle>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"
                    ></path>
                </svg>
                <span
                    >Synced with Reader — Waiting for Jiten to process layout...</span
                >
            </div>
        {/if}

        <div class="nt-ttu-linker" id="nt-ttu-linker-sec">
            {#if linkedMedia}
                <div class="nt-ttu-link-compact" id="nt-ttu-link-compact">
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div
                        class="nt-ttu-link-compact-inner"
                        onclick={editLink}
                        title="Click to edit"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            ><circle cx="11" cy="11" r="8"></circle><line
                                x1="21"
                                y1="21"
                                x2="16.65"
                                y2="16.65"
                            ></line></svg
                        >
                        <span id="nt-ttu-link-label"
                            >{linkedMedia.mediaData.contentTitleNative ||
                                "Linked"}</span
                        >
                    </div>
                    {#if isEditingVol}
                        <input
                            type="text"
                            class="nt-ttu-vol-input"
                            bind:value={volInputVal}
                            onblur={commitVolEdit}
                            onkeydown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") commitVolEdit();
                            }}
                            onkeyup={(e) => e.stopPropagation()}
                            onkeypress={(e) => e.stopPropagation()}
                            use:autofocus
                        />
                    {:else}
                        <button
                            type="button"
                            id="nt-ttu-vol-pill"
                            class="nt-ttu-vol-pill"
                            onclick={startVolEdit}
                            title="Volume">Vol {linkedMedia.volume || 1}</button
                        >
                    {/if}
                    <button
                        id="nt-ttu-unlink-btn"
                        class="nt-ttu-unlink-btn"
                        onclick={unlinkMedia}
                        title="Unlink Media"
                    >
                        <svg
                            style="width:12px; height:12px;"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            ><line x1="18" y1="6" x2="6" y2="18"></line><line
                                x1="6"
                                y1="6"
                                x2="18"
                                y2="18"
                            ></line></svg
                        >
                    </button>
                </div>
            {:else}
                <div class="nt-ttu-link-edit" id="nt-ttu-link-edit">
                    <div class="nt-ttu-link-edit-row">
                        <div class="nt-ttu-link-wrap">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><circle cx="11" cy="11" r="8"></circle><line
                                    x1="21"
                                    y1="21"
                                    x2="16.65"
                                    y2="16.65"
                                ></line></svg
                            >
                            <input
                                type="text"
                                id="nt-ttu-link-input"
                                class="nt-ttu-link-input"
                                placeholder="Search AniList..."
                                bind:value={anilistSearchQuery}
                                oninput={() =>
                                    handleAnilistInput(anilistSearchQuery)}
                                onfocus={handleSearchFocus}
                                onblur={handleSearchBlur}
                                onkeydown={(e) => e.stopPropagation()}
                                onkeyup={(e) => e.stopPropagation()}
                                onkeypress={(e) => e.stopPropagation()}
                                spellcheck="false"
                                autocomplete="off"
                            />
                        </div>
                        <div class="nt-ttu-link-vol-anchor">
                            {#if isEditingVol}
                                <input
                                    type="text"
                                    class="nt-ttu-vol-input"
                                    bind:value={volInputVal}
                                    onblur={commitVolEdit}
                                    onkeydown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === "Enter") commitVolEdit();
                                    }}
                                    onkeyup={(e) => e.stopPropagation()}
                                    onkeypress={(e) => e.stopPropagation()}
                                    use:autofocus
                                />
                            {:else}
                                <button
                                    type="button"
                                    class="nt-ttu-vol-pill"
                                    onclick={startVolEdit}
                                    title="Volume">Vol {volInputVal}</button
                                >
                            {/if}
                        </div>
                    </div>
                    {#if isSearchingAnilist || anilistResults.length > 0}
                        <div
                            class="nt-ttu-link-results open"
                            id="nt-ttu-link-results"
                            role="presentation"
                            onmousedown={(e) => e.preventDefault()}
                        >
                            {#if isSearchingAnilist}
                                <div
                                    style="padding:4px;text-align:center;font-size:10px;color:#aaa"
                                >
                                    Searching...
                                </div>
                            {:else}
                                {#each anilistResults as m}
                                    <button
                                        type="button"
                                        class="nt-ttu-btn-text nt-ttu-link-item"
                                        onclick={() => linkSelectedMedia(m)}
                                    >
                                        {#if m.coverImage || m.contentImage}
                                            <img
                                                class="nt-ttu-link-cover"
                                                src={m.coverImage ||
                                                    m.contentImage}
                                                alt="Cover"
                                            />
                                        {:else}
                                            <div
                                                class="nt-ttu-link-cover"
                                                style="background:#444"
                                            ></div>
                                        {/if}
                                        <div class="nt-ttu-link-info">
                                            <div class="nt-ttu-link-t">
                                                {m.title?.contentTitleNative ||
                                                    m.contentTitleNative ||
                                                    "Unknown"}
                                            </div>
                                        </div>
                                    </button>
                                {/each}
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    <div
        class="nt-ttu-dd-section"
        style="border-top: 1px solid var(--nt-border); background: rgba(0,0,0,0.2);"
    >
        <div class="nt-ttu-dd-title">Total Book Progress</div>
        <div class="nt-ttu-stats-row" style="margin-bottom:0;">
            <div class="nt-ttu-stat">
                <span class="nt-ttu-stat-label">Total Time</span>
                <span
                    class="nt-ttu-stat-val no-hover"
                    id="nt-ttu-total-time"
                    style="color:var(--nt-accent);">{totalMins}m</span
                >
            </div>
            <div class="nt-ttu-stat">
                <span class="nt-ttu-stat-label">Total Chars</span>
                <span
                    class="nt-ttu-stat-val no-hover"
                    id="nt-ttu-total-chars"
                    style="color:var(--nt-accent);">{totalChars}</span
                >
            </div>
            <div class="nt-ttu-stat">
                <span class="nt-ttu-stat-label">Avg Speed</span>
                <span
                    class="nt-ttu-stat-val no-hover"
                    id="nt-ttu-total-speed"
                    style="color:var(--nt-accent);">{totSpeed}/h</span
                >
            </div>
        </div>
    </div>

    <details class="nt-ttu-history" id="nt-ttu-history-wrap">
        <summary>Past Sessions History</summary>
        <div class="nt-ttu-history-list" id="nt-ttu-history-list">
            {#if pastSessions.length === 0}
                <div style="color:#777;text-align:center;padding:12px;">
                    No past sessions yet
                </div>
            {:else}
                {#each [...pastSessions].reverse() as s}
                    <div class="nt-ttu-history-item" data-session-id={s.id}>
                        <span
                            >{new Date(s.date).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                            })}</span
                        >
                        <span>{Math.max(1, Math.round(s.timeMs / 60000))}m</span
                        >
                        <span>{s.chars} chars</span>
                        <button
                            class="nt-ttu-history-del"
                            onclick={(e) => deleteSession(e, s.id)}
                            title="Delete session">×</button
                        >
                    </div>
                {/each}
            {/if}
        </div>
    </details>
</div>

<style>
    @keyframes nt-spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
    @keyframes nt-fade-pulse {
        0% {
            opacity: 0.4;
        }
        50% {
            opacity: 1;
        }
        100% {
            opacity: 0.4;
        }
    }

    /* `:global` style blocks cleanly prevents Svelte local selector hashing overrides */
    :global(#nt-ttu-chrono-wrapper) {
        position: relative;
        display: flex;
        z-index: 40;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 2rem;
        height: 100%;
        will-change: transform;
        transform: translateZ(0);
    }

    :global(#nt-ttu-chrono-wrapper),
    :global(#nt-ttu-chrono-wrapper *),
    :global(#nt-ttu-dropdown),
    :global(#nt-ttu-dropdown *) {
        font-family: var(--font-mono, var(--nt-font, sans-serif)) !important;
    }

    /* Defeat default browser focus outline ring entirely */
    :global(#nt-ttu-chrono-wrapper *:focus),
    :global(#nt-ttu-chrono-wrapper *:focus-visible),
    :global(#nt-ttu-chrono-wrapper *:focus-within),
    :global(#nt-ttu-dropdown *:focus),
    :global(#nt-ttu-dropdown *:focus-visible),
    :global(#nt-ttu-dropdown *:focus-within) {
        outline: none !important;
        outline-width: 0 !important;
        box-shadow: none !important;
    }

    :global(.nt-ttu-link-wrap:focus-within) {
        border-color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
    }

    /* Semantic unstyled helper class to remove standard browser button templates */
    :global(.nt-ttu-btn-text) {
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
        outline: none !important;
        font: inherit;
        color: inherit;
        text-align: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        box-shadow: none !important;
    }

    :global(#nt-ttu-chrono-btn) {
        background: transparent;
        border: none;
        cursor: pointer;
        display: flex;
        padding: 0;
        width: 100%;
        height: 100%;
        color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
        transition: opacity 0.15s ease;
        align-items: center;
        justify-content: center;
        user-select: none;
    }
    :global(#nt-ttu-chrono-btn:focus),
    :global(#nt-ttu-chrono-btn:focus-visible),
    :global(#nt-ttu-chrono-btn:active) {
        color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
    }
    :global(#nt-ttu-chrono-btn:hover) {
        opacity: 0.7;
        color: var(
            --color-accent-hover,
            var(--nt-accentHover, #ffd060)
        ) !important;
    }
    :global(#nt-ttu-chrono-btn:active) {
        transform: scale(0.92);
    }
    :global(#nt-ttu-chrono-btn svg) {
        width: 1.7rem;
        height: 1.7rem;
        fill: currentColor;
    }

    :global(#nt-ttu-dropdown) {
        position: absolute;
        bottom: 100%;
        left: 0 !important;
        right: auto !important;
        margin-bottom: 8px;
        background: var(--color-surface, var(--nt-surface, #252525)) !important;
        border: 1px solid var(--color-border, var(--nt-border, #3a3a3a)) !important;
        border-radius: var(
            --rounded-box,
            var(--nt-rounded-box, 6px)
        ) !important;
        width: 280px;
        color: var(--color-text, var(--nt-text, #fff)) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
        display: none;
        flex-direction: column;
        overflow: hidden;
        writing-mode: horizontal-tb;
        text-align: left;
        direction: ltr;
        transform-origin: bottom left !important;
        cursor: default;
        z-index: 10001;
    }
    :global(#nt-ttu-dropdown.open) {
        display: flex;
    }

    :global(.nt-stabilize-overlay) {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(15, 15, 20, 0.75);
        backdrop-filter: blur(2.5px);
        -webkit-backdrop-filter: blur(2.5px);
        color: #aaa;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        text-align: center;
        padding: 16px;
        border-radius: 8px;
        z-index: 9999;
    }

    :global(.nt-ttu-dd-section) {
        padding: 12px;
        text-align: center;
    }
    :global(.nt-ttu-dd-title) {
        font-size: 11px;
        color: var(--color-text-muted, var(--nt-muted, #aaa)) !important;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
    }
    :global(.nt-ttu-stats-row) {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        gap: 8px;
    }
    :global(.nt-ttu-stat) {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        flex: 1;
    }
    :global(.nt-ttu-stat-label) {
        font-size: 10px;
        color: var(--color-text-muted, var(--nt-muted, #aaa)) !important;
    }

    :global(.nt-ttu-stat-val) {
        font-family: var(--font-mono, --nt-font-mono, monospace) !important;
        font-size: 14px;
        color: var(--color-text, var(--nt-text, #fff)) !important;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid transparent;
        transition: background 0.2s;
        text-align: center;
    }

    :global(.nt-ttu-stat-val:hover) {
        background: var(
            --color-surface-alt,
            var(--nt-surfaceAlt, #13131f)
        ) !important;
        border-color: var(
            --color-border-hover,
            var(--nt-border-hover, #555)
        ) !important;
    }

    :global(.nt-ttu-stat-val.no-hover) {
        cursor: default;
    }

    :global(.nt-ttu-stat-val.no-hover:hover) {
        background: transparent;
        border-color: transparent;
    }

    :global(.nt-ttu-controls) {
        display: flex;
        gap: 8px;
        justify-content: center;
    }

    :global(.nt-ttu-btn-icon) {
        background: transparent;
        color: var(--color-text-muted, var(--nt-muted, #aaa)) !important;
        border: none;
        padding: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        border-radius: 50%;
    }

    :global(.nt-ttu-btn-icon:hover:not(:disabled)) {
        background: var(
            --color-surface-alt,
            var(--nt-surfaceAlt, #13131f)
        ) !important;
        color: var(--color-text, var(--nt-text, #fff)) !important;
    }

    :global(.nt-ttu-btn-icon.primary) {
        color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
    }

    :global(.nt-ttu-btn-icon.primary:hover:not(:disabled)) {
        background: color-mix(
            in srgb,
            var(--color-accent, var(--nt-accent)) 15%,
            transparent
        ) !important;
        color: var(
            --color-accent-hover,
            var(--nt-accentHover, #ffd060)
        ) !important;
    }

    :global(.nt-ttu-btn-icon svg) {
        width: 18px;
        height: 18px;
        fill: currentColor;
    }

    :global(#nt-ttu-btn-settings svg) {
        width: 15px !important;
        height: 15px !important;
    }

    /* Outer focus ring reset */
    :global(#nt-ttu-btn-toggle) {
        color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
    }

    :global(#nt-ttu-btn-toggle:focus),
    :global(#nt-ttu-btn-toggle:focus-visible),
    :global(#nt-ttu-btn-toggle:active) {
        color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
    }

    :global(#nt-ttu-btn-toggle:hover) {
        color: var(
            --color-accent-hover,
            var(--nt-accentHover, #ffd060)
        ) !important;
    }

    :global(.nt-ttu-sync-status) {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: var(
            --color-text-muted,
            var(--nt-text-secondary, #aaa)
        ) !important;
        text-align: center;
        margin-top: 8px;
        opacity: 0.9;
        animation: nt-fade-pulse 1.8s ease-in-out infinite;
    }

    :global(.nt-ttu-spinner) {
        will-change: transform, opacity;
        transform: translateZ(0);
        width: 12px;
        height: 12px;
        margin-right: 6px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.5;
        stroke-linecap: round;
        animation: nt-spin 0.8s linear infinite;
    }

    :global(.nt-ttu-linker) {
        margin-top: 12px;
        border-top: 1px solid var(--color-border, var(--nt-border, #3a3a3a)) !important;
        padding-top: 12px;
    }

    :global(.nt-ttu-link-compact) {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-size: 11px;
        color: var(--color-success, var(--nt-success, #3ddc84)) !important;
        padding: 2px 4px; /* Increased vertical padding to prevent top/bottom text clipping */
        border-radius: 4px;
        transition: background 0.15s;
        background: color-mix(
            in srgb,
            var(--color-success, var(--nt-success, #3ddc84)) 8%,
            var(--color-surface, #252525)
        ) !important;
        border: 1px solid
            color-mix(
                in srgb,
                var(--color-success, var(--nt-success, #3ddc84)) 22%,
                transparent
            ) !important;
    }

    :global(.nt-ttu-link-compact-inner) {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        cursor: pointer !important;
        flex: 1 !important;
        min-width: 0 !important;
    }

    :global(.nt-ttu-link-compact-inner span) {
        white-space: normal !important;
        word-break: break-word !important;
        flex: 1 !important;
        min-width: 0 !important;
        text-align: center !important;
        display: -webkit-box !important;
        -webkit-line-clamp: 3 !important;
        line-clamp: 3 !important;
        -webkit-box-orient: vertical !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        line-height: 1.4 !important; /* Set proper line height to avoid Japanese characters being clipped */
    }

    :global(.nt-ttu-link-compact-inner:hover) {
        opacity: 0.8;
    }

    :global(.nt-ttu-unlink-btn) {
        background: none;
        border: none;
        color: var(--color-error, var(--nt-error, #f0706a)) !important;
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
        opacity: 0.6;
        transition: opacity 0.15s;
    }

    :global(.nt-ttu-unlink-btn:hover) {
        opacity: 1;
    }

    :global(.nt-ttu-vol-pill) {
        background: transparent;
        border: none;
        color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
        font-family: var(--font-mono, var(--nt-font-mono, monospace));
        font-size: 11px;
        padding: 0 6px;
        cursor: pointer;
        opacity: 0.95;
        white-space: nowrap;
    }

    :global(.nt-ttu-vol-pill:hover) {
        opacity: 1;
    }

    :global(.nt-ttu-vol-pill:active) {
        transform: scale(0.92);
    }

    :global(.nt-ttu-link-compact-inner svg) {
        width: 12px;
        height: 12px;
        stroke: currentColor;
        stroke-width: 2.5;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        margin-right: 6px;
    }

    :global(.nt-ttu-link-edit) {
        display: flex;
        flex-direction: column;
        gap: 6px;
        position: relative;
    }

    :global(.nt-ttu-link-edit-row) {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
    }

    :global(.nt-ttu-link-vol-anchor) {
        display: flex;
        align-items: center;
        flex: 0 0 auto;
    }

    :global(.nt-ttu-link-wrap) {
        display: flex;
        align-items: center;
        background: var(
            --color-surface-alt,
            var(--nt-surfaceAlt, #13131f)
        ) !important;
        border: 1px solid var(--color-border, var(--nt-border, #3a3a3a)) !important;
        border-radius: 4px;
        padding: 0 6px;
        outline: none !important;
        flex: 1;
        min-width: 0;
        max-width: 100%;
        box-sizing: border-box;
        height: 26px !important;
    }

    :global(.nt-ttu-link-wrap:focus-within) {
        border-color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
    }

    :global(.nt-ttu-link-wrap svg) {
        width: 12px;
        height: 12px;
        stroke: var(--color-text-muted, var(--nt-muted, #aaa)) !important;
    }

    :global(.nt-ttu-link-input) {
        flex: 1;
        min-width: 0;
        background: transparent !important;
        border: none;
        color: var(--color-text, var(--nt-text, #fff)) !important;
        font-family: var(--font-mono, var(--nt-font-mono, monospace));
        font-size: 11px;
        padding: 4px 6px !important;
        height: 100% !important;
        outline: none !important;
    }

    :global(.nt-ttu-link-input::placeholder) {
        color: var(--color-text-muted, var(--nt-muted, #aaa)) !important;
        opacity: 0.6;
    }

    :global(.nt-ttu-vol-input) {
        width: 36px;
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--color-accent, var(--nt-accent, #f0b429)) !important;
        color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
        font-family: var(--font-mono, var(--nt-font-mono, monospace));
        font-size: 11px;
        text-align: right;
        outline: none !important;
        padding: 0 2px;
    }

    :global(.nt-ttu-vol-input:focus) {
        border-bottom-color: var(
            --color-accent-hover,
            var(--nt-accentHover, #ffd060)
        ) !important;
    }

    :global(.nt-ttu-link-results) {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 140px;
        overflow-y: auto;
        margin-top: 4px;
        display: none;
        position: static !important;
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
    }

    :global(.nt-ttu-link-results.open) {
        display: flex;
    }

    :global(.nt-ttu-link-item) {
        width: 100%;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.15s;
        text-align: left;
        color: var(--color-text, var(--nt-text, #fff)) !important;
    }

    :global(.nt-ttu-link-item:hover) {
        background: var(
            --color-surface-alt,
            var(--nt-surfaceAlt, #13131f)
        ) !important;
    }

    :global(.nt-ttu-link-cover) {
        width: 20px;
        height: 30px;
        object-fit: cover;
        border-radius: 2px;
        flex-shrink: 0;
    }

    :global(.nt-ttu-link-info) {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        flex: 1;
    }

    :global(.nt-ttu-link-t) {
        font-size: 10px;
        color: var(--color-text, var(--nt-text, #fff)) !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    :global(.nt-ttu-link-item:hover .nt-ttu-link-t) {
        color: var(--color-accent, var(--nt-accent, #f0b429)) !important;
    }

    :global(.nt-ttu-history) {
        border-top: 1px solid var(--color-border, var(--nt-border, #3a3a3a)) !important;
        font-size: 12px;
    }

    :global(.nt-ttu-history summary) {
        padding: 10px 12px;
        cursor: pointer;
        color: var(--color-text-muted, var(--nt-muted, #aaa)) !important;
        outline: none;
        user-select: none;
        transition: background 0.2s;
    }

    :global(.nt-ttu-history summary:hover) {
        background: var(
            --color-surface-alt,
            var(--nt-surfaceAlt, #13131f)
        ) !important;
        color: var(--color-text, var(--nt-text, #fff)) !important;
    }

    :global(.nt-ttu-history-list) {
        max-height: 140px;
        overflow-y: auto;
        padding: 0 12px 12px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    :global(.nt-ttu-history-item) {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: var(--color-text, var(--nt-text, #fff)) !important;
        background: var(
            --color-surface-alt,
            var(--nt-surfaceAlt, #13131f)
        ) !important;
        padding: 6px 8px;
        border-radius: 4px;
    }

    :global(.nt-ttu-history-del) {
        background: none;
        border: none;
        color: var(--color-error, var(--nt-error, #f0706a)) !important;
        cursor: pointer;
        font-size: 12px;
        line-height: 1;
        padding: 0 2px;
        opacity: 0.75;
    }

    :global(.nt-ttu-history-del:hover) {
        opacity: 1;
    }

    :global(.nt-chrono-tooltip) {
        position: absolute;
        bottom: 38px;
        left: 0;
        background: rgba(20, 20, 25, 0.95);
        color: var(--color-accent, var(--nt-accent, #f5a623)) !important;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 11px;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
        border: 1px solid
            color-mix(
                in srgb,
                var(--color-accent, var(--nt-accent, #f5a623)) 30%,
                transparent
            ) !important;
        z-index: 10000;
        pointer-events: none;
        opacity: 0;
        transform: translateY(5px);
        transition:
            opacity 0.2s ease,
            transform 0.2s ease;
    }

    :global(.nt-ttu-inline-input) {
        width: 70px;
        background: var(--color-surface, #1a1a1a) !important;
        color: var(--color-text, #fff) !important;
        border: 1px solid var(--color-border, #555) !important;
        border-radius: 4px;
        padding: 2px 4px;
        font-family: monospace;
        font-size: 14px;
        box-sizing: border-box;
        text-align: center;
    }

    :global(#nt-ttu-chrono-btn svg path),
    :global(#nt-ttu-btn-toggle svg path) {
        fill: currentColor !important;
    }
</style>
