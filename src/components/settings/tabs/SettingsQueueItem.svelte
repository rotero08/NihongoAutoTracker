<!-- SettingsQueueItem.svelte -->

<script lang="ts">
  /**
   * ── SettingsQueueItem.svelte ────────────────────────────────────────────────
   * A single queued immersion entry inside the advanced dashboard settings list.
   * Restores the exact original inline collapsible sessions markup and layout.
   */

  import {
    videoQueueStorage,
    readingQueueStorage,
    stremioQueueStorage,
    updateVideoQueueAtomic,
    updateReadingQueueAtomic,
    updateStremioQueueAtomic,
  } from "@/lib/storage/queues";
  import {
    resolveVideoChannelMedia,
    submitLog,
  } from "@/lib/api/nihongotracker";
  import { type AniListSearchResult } from "@/lib/api/anilist";
  import { stripVideoTitle, parseTitleForUI } from "@/lib/utils/text-parsing";
  import { toLocalDT } from "@/lib/utils/time";
  import SearchDropdown from "@/components/popup/SearchDropdown.svelte";
  import { storage } from "wxt/utils/storage";
  import { onMount, onDestroy } from "svelte";
  import { configStorage } from "@/lib/storage/config";
  import { addDebugLog } from "@/lib/storage/debug";
  import { SESS_CLOSED_PREFIX } from "@/lib/constants";
  import {
    persistField,
    persistFields,
    getUpdater,
    handleUnlink as unlinkQueueMedia,
    ensureVideoMediaData as resolveVideoMetaData,
    markStremioProcessed as flagStremioProcessed,
    getItemPayloads,
    removeSessionFromQueue,
    sendSessionFromQueue,
  } from "@/lib/utils/queue-actions";

  interface Props {
    item: any;
    type: "video" | "reading" | "stremio";
    onStatus: (msg: string, err?: boolean) => void;
    onConfirm: (
      title: string,
      msg: string,
      warnKey?: string,
    ) => Promise<boolean>;
    onRefresh: () => void;
  }

  let { item, type, onStatus, onConfirm, onRefresh }: Props = $props();

  const isRead = $derived(type === "reading");
  const isStremio = $derived(type === "stremio");
  let sending = $state(false);
  let isUnlinkHovered = $state(false);
  let searchDropdown = $state<SearchDropdown | undefined>(undefined);
  let titleInputEl = $state<HTMLInputElement | undefined>(undefined);

  /* ── State for Title & Inline Volume Input ────────────────────── */
  let titleValue = $state("");
  $effect(() => {
    const rawTitle =
      item.description || item.contentTitleNative || "Unknown Title";
    titleValue = isStremio
      ? item.contentTitleNative || item.contentTitleRomaji || item.contentTitleEnglish || rawTitle.replace(/^(Trakt|Stremio):\s*/, "")
      : type === "video" ? stripVideoTitle(rawTitle) : rawTitle.replace(/^(Trakt|Stremio):\s*/, "");
  });

  let volumeVal = $derived(Math.max(1, Number(item.volume || 1)));
  let isEditingVol = $state(false);
  let volInputValue = $state(1);
  let volEditStart = $state(1);

  /* ── Derived display values ──────────────────────────────────── */
  const displayMins = $derived(
    isRead ? Math.max(1, Math.round((item.time || 0) / 60)) : item.time || 0,
  );

  const sessions = $derived(item.sessions ?? []);
  const stremioSearchType = $derived(
    item.logType === "movie" ? "movie" : item.logType === "tv show" ? "tv_show" : "anime",
  );
  const defaultDateStr = $derived(
    sessions.length > 0
      ? sessions[0].date
      : item.date || new Date().toISOString(),
  );

  const displaySeason = $derived(
    Math.max(1, Number(item.season || (sessions[0]?.season) || 1))
  );
  const displayEpisode = $derived(
    Math.max(1, Number(item.episode || (sessions[0]?.episode) || 1))
  );

  let isLinked = $derived(
    isRead
      ? !!(item.mediaId && item.mediaId !== "web-reading")
      : isStremio
        ? !!(item.mediaId || item.mediaData?.contentId)
        : true,
  );

  const capLogType = $derived(
    item.logType
      ? item.logType
          .split(" ")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : "Trakt"
  );

  let channelName = $derived(
    isStremio
      ? `Stremio • ${capLogType}`
      : isRead
      ? `${item.readerName || "Reader"} \u2022 ${item.originalTitle || item.description || item.contentTitleNative || ""}`
      : item.channelTitle || item.contentTitleNative || "YouTube",
  );

  let urlDisplay = $derived(
    isRead ? "" : `\u2022 ${item.contentTitleEnglish || item.channelId || item.traktType || ""}`,
  );

  let isSessionsOpen = $state(true);

  onMount(async () => {
    const val = await storage.getItem(`${SESS_CLOSED_PREFIX}${item.id}`);
    isSessionsOpen = val !== "1";
  });

  onDestroy(() => {
    clearTimeout(debounceTimer);
    clearTimeout(blurTimeout);
  });

  async function toggleSessionsOpen() {
    isSessionsOpen = !isSessionsOpen;
    await storage.setItem(
      `${SESS_CLOSED_PREFIX}${item.id}`,
      isSessionsOpen ? "0" : "1",
    );
  }

  /* Custom actions helper to handle dynamic focus state */
  function autofocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  /* ── Editing Handlers ────────────────────────────────────────── */
  let debounceTimer: any;

  function handleTitleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    titleValue = val;

    if (isRead || isStremio) {
      clearTimeout(debounceTimer);
      if (val.trim().length < 2) {
        searchDropdown?.close();
        return;
      }
      debounceTimer = setTimeout(() => searchDropdown?.search(val.trim()), 500);
    }
  }

  let blurTimeout: any;
  function handleBlur() {
    blurTimeout = setTimeout(() => {
      searchDropdown?.close();
    }, 10);
  }

  function handleFocus() {
    clearTimeout(blurTimeout);
    if ((isRead || isStremio) && titleValue.trim().length >= 2) {
      searchDropdown?.search(titleValue.trim());
    }
  }

  function rememberEditableStart(e: FocusEvent) {
    const input = e.currentTarget as HTMLInputElement;
    input.dataset.editStart = input.value;
    input.dataset.committed = "false";
    input.dataset.isMatching = "false";
  }

  function handleEditableKeydown(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      input.dataset.committed = "true";
      input.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      input.dataset.committed = "false";
      revertInput(input);
      input.blur();
    }
  }

  function revertInput(input: HTMLInputElement) {
    const startVal = input.dataset.editStart ?? input.defaultValue;
    input.value = startVal;
    if (input.classList.contains("qi-desc")) {
      titleValue = startVal;
      searchDropdown?.close();
    }
  }

  function handleEditableBlur(e: FocusEvent, field: string, saveFn: (val: any) => void) {
    const input = e.currentTarget as HTMLInputElement;

    searchDropdown?.close();

    if (input.dataset.isMatching === "true") {
      saveFn(input.value);
      return;
    }

    if (isLinked && (field === "description" || field === "contentTitleNative")) {
      input.dataset.committed = "false";
      revertInput(input);
      return;
    }

    if (input.dataset.committed === "true") {
      if (field === "description" || field === "contentTitleNative") {
        const changed = input.value !== input.dataset.editStart;
        if (changed && isLinked && input.dataset.isMatching !== "true") {
          persistFields(item.id, type, { mediaId: isRead ? "web-reading" : undefined, mediaData: undefined }, onRefresh);
        }
      }
      saveFn(input.value);
    } else {
      revertInput(input);
    }
  }

  async function handleSearchSelect(result: AniListSearchResult) {
    const native =
      result.title?.contentTitleNative ||
      result.contentTitleNative ||
      "Unknown";
    titleValue = native;

    const { volume: parsedVolume } = parseTitleForUI(native);
    const finalVolume = Math.max(1, item.volume || parsedVolume || 1);

    await persistFields(item.id, type, {
      description: native,
      contentTitleNative: native,
      contentTitleEnglish:
        result.title?.contentTitleEnglish ||
        result.contentTitleEnglish ||
        item.contentTitleEnglish,
      contentTitleRomaji:
        result.title?.contentTitleRomaji ||
        result.contentTitleRomaji ||
        item.contentTitleRomaji,
      mediaId: String(result.contentId),
      mediaData: {
        contentId: result.contentId,
        contentTitleNative: native,
        contentTitleEnglish:
          result.title?.contentTitleEnglish ||
          result.contentTitleEnglish ||
          undefined,
        contentTitleRomaji:
          result.title?.contentTitleRomaji ||
          result.contentTitleRomaji ||
          undefined,
        contentImage: result.coverImage || result.contentImage || undefined,
        coverImage: result.coverImage || result.contentImage || undefined,
        chapters: result.chapters || undefined,
        volumes: result.volumes || undefined,
        type: isStremio ? item.logType || "anime" : undefined,
      },
      ...(isRead ? { volume: finalVolume } : {}),
    }, onRefresh);
    searchDropdown?.close();
  }

  async function handleUnlink(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    await unlinkQueueMedia(item.id, type, onRefresh, onStatus);
  }

  /* Volume editing */
  function startEditVolume() {
    volInputValue = volumeVal;
    volEditStart = volumeVal;
    isEditingVol = true;
  }

  async function commitVolume() {
    const nextVal = Math.max(1, Number(volInputValue) || 1);
    isEditingVol = false;
    await persistField(item.id, type, "volume", nextVal, onRefresh);
  }

  function handleVolumeKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitVolume();
    } else if (e.key === "Escape") {
      e.preventDefault();
      volInputValue = volEditStart;
      isEditingVol = false;
    }
  }

  /* Characters spin navigation */
  async function adjustChars(amt: number) {
    const current = Number(item.chars || 0);
    const sumChars = sessions.reduce(
      (a: number, b: any) => a + (b.chars || 0),
      0,
    );
    const nextVal = Math.max(sumChars, current + amt);
    await persistField(item.id, type, "chars", nextVal, onRefresh);
  }

  /* Minutes spin navigation */
  async function adjustMins(amt: number) {
    const current = displayMins;
    const sumSecs = sessions.reduce(
      (a: number, b: any) => a + (b.secs || 0),
      0,
    );
    const sumMins = Math.max(1, Math.round(sumSecs / 60));
    const nextVal = Math.max(sumMins, current + amt);
    await persistField(item.id, type, "time", isRead ? nextVal * 60 : nextVal, onRefresh);
  }

  /* Date editing */
  async function handleDateChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    try {
      const iso = new Date(val).toISOString();
      await persistField(item.id, type, "date", iso, onRefresh);
    } catch {}
  }

  /* Session editing */
  async function handleSessionChange(
    sessionIdx: number,
    field: string,
    val: any,
  ) {
    if (isRead) {
      await updateReadingQueueAtomic((currentQueue: any[]) => {
        const idx = currentQueue.findIndex((x) => x.id === item.id);
        if (idx === -1) return currentQueue;

        const entry = JSON.parse(JSON.stringify(currentQueue[idx]));
        if (!entry.sessions || !entry.sessions[sessionIdx]) return currentQueue;

        const session = entry.sessions[sessionIdx];
        if (field === "chars") {
          session.chars = Math.max(0, Number(val) || 0);
        } else if (field === "mins") {
          session.secs = Math.max(1, Number(val) || 1) * 60;
        } else if (field === "date") {
          try {
            session.date = new Date(val).toISOString();
          } catch {}
        }

        const sumSecs = entry.sessions.reduce(
          (a: number, b: any) => a + b.secs,
          0,
        );
        const sumMins = Math.max(1, Math.round(sumSecs / 60));
        const sumChars = entry.sessions.reduce(
          (a: number, b: any) => a + (b.chars || 0),
          0,
        );

        const previousSumSecs = item.sessions.reduce(
          (a: number, b: any) => a + b.secs,
          0,
        );
        const previousSumMins = Math.max(1, Math.round(previousSumSecs / 60));
        const previousSumChars = item.sessions.reduce(
          (a: number, b: any) => a + (b.chars || 0),
          0,
        );

        const isTimeOverridden = displayMins > previousSumMins;
        const areCharsOverridden = Number(item.chars || 0) > previousSumChars;

        entry.time = isTimeOverridden ? item.time * 60 : sumSecs;
        entry.chars = areCharsOverridden ? item.chars : sumChars;

        const newQueue = [...currentQueue];
        newQueue[idx] = entry;
        return newQueue;
      });
    } else if (isStremio) {
      await updateStremioQueueAtomic((currentQueue: any[]) => {
        const idx = currentQueue.findIndex((x) => x.id === item.id);
        if (idx === -1) return currentQueue;

        const entry = JSON.parse(JSON.stringify(currentQueue[idx]));
        if (!entry.sessions || !entry.sessions[sessionIdx]) return currentQueue;

        const session = entry.sessions[sessionIdx];
        if (field === "mins") {
          session.secs = Math.max(1, Number(val) || 1) * 60;
        } else if (field === "season") {
          session.season = Math.max(1, Number(val) || 1);
        } else if (field === "date") {
          try {
            session.date = new Date(val).toISOString();
          } catch {}
        }

        const sumSecs = entry.sessions.reduce(
          (a: number, b: any) => a + b.secs,
          0,
        );
        entry.time = Math.max(1, Math.round(sumSecs / 60));

        const newQueue = [...currentQueue];
        newQueue[idx] = entry;
        return newQueue;
      });
    } else {
      await updateVideoQueueAtomic((currentQueue: any[]) => {
        const idx = currentQueue.findIndex((x) => x.id === item.id);
        if (idx === -1) return currentQueue;

        const entry = JSON.parse(JSON.stringify(currentQueue[idx]));
        if (!entry.sessions || !entry.sessions[sessionIdx]) return currentQueue;

        const session = entry.sessions[sessionIdx];
        if (field === "mins") {
          session.secs = Math.max(1, Number(val) || 1) * 60;
        } else if (field === "date") {
          try {
            session.date = new Date(val).toISOString();
          } catch {}
        }

        const sumSecs = entry.sessions.reduce(
          (a: number, b: any) => a + b.secs,
          0,
        );
        const previousSumSecs = item.sessions.reduce(
          (a: number, b: any) => a + b.secs,
          0,
        );
        const previousSumMins = Math.max(1, Math.round(previousSumSecs / 60));

        const isTimeOverridden = displayMins > previousSumMins;
        entry.time = isTimeOverridden ? item.time : Math.round(sumSecs / 60);

        const newQueue = [...currentQueue];
        newQueue[idx] = entry;
        return newQueue;
      });
    }
    onRefresh();
  }

  async function handleRemoveSession(sessionId: string) {
    const ok = await onConfirm(
      "Delete Session",
      "Are you sure you want to delete this session?",
    );
    if (!ok) return;

    await removeSessionFromQueue(item.id, sessionId, type, onRefresh);
    onStatus("✓ Session removed");
  }

  async function handleSendSession(sessionIdx: number) {
    sending = true;
    await sendSessionFromQueue(item, sessionIdx, type, onRefresh, onStatus);
    sending = false;
  }

  function handleSessionLocalBlur(e: FocusEvent, sessionIdx: number, field: string) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.dataset.committed === "true") {
      handleSessionChange(sessionIdx, field, input.value);
    } else {
      input.value = input.dataset.editStart ?? input.defaultValue;
    }
  }

  /* ── Log Send / Delete Actions ──────────────────────────────── */
  async function handleSend() {
    sending = true;
    const qStorage = isRead ? readingQueueStorage : isStremio ? stremioQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const current = q.find((x: any) => x.id === item.id) as any;
    if (!current) {
      sending = false;
      return;
    }

    if (isRead && (!current.mediaId || current.mediaId === "web-reading")) {
      const cfg = (await configStorage.getValue()) as any;
      if (cfg.warnUnmatched !== false) {
        const ok = await onConfirm(
          "Unmatched Media Warning",
          "This reading log is not linked to any AniList entry and will be logged as unmatched. Are you sure you want to proceed?",
          "warnUnmatched",
        );
        if (!ok) {
          sending = false;
          return;
        }
      }
    }

    if (type === "video") {
      try {
        current.mediaData = await resolveVideoMetaData(current);
      } catch {}
    }

    try {
      const payloads = getItemPayloads(current, type);
      for (const payload of payloads) {
        const result = await submitLog(payload);
        if (!result?.success) {
          const errText = result?.status
            ? `⚠ Failed [${result.status}]: ${result.error}`
            : `⚠ Failed: ${result?.error}`;
          onStatus(errText, true);
          sending = false;
          await addDebugLog(
            "ERROR",
            "SettingsQueueItem",
            `Manual queue log submission failed: ${payload.description}`,
            result?.error,
          );
          return;
        }
      }

      const updater = getUpdater(type);
      await updater((currentQ) => currentQ.filter((x) => x.id !== item.id));
      onRefresh();
    } catch (e: any) {
      onStatus(`⚠ Error: ${e.message || e}`, true);
      sending = false;
      await addDebugLog(
        "ERROR",
        "SettingsQueueItem",
        `Exception during manual send for ${current.description}`,
        e,
      );
    }
  }

  async function handleRemove() {
    const ok = await onConfirm(
      "Delete Log",
      "Are you sure you want to delete this log?",
    );
    if (!ok) return;

    const updater = getUpdater(type);
    await updater((currentQ) => currentQ.filter((x) => x.id !== item.id));
    if (isStremio) {
      await flagStremioProcessed(item);
    }
    onStatus("✓ Log removed");
    onRefresh();
  }

  /* Dynamically synchronize input box sizing columns to matching values */
  let maxCharsLen = $derived(
    sessions.reduce((max: number, s: any) => Math.max(max, String(s.chars || 0).length), 1)
  );
  let maxMinsLen = $derived(
    sessions.reduce((max: number, s: any) => Math.max(max, String(Math.max(1, Math.round(s.secs / 60))).length), 1)
  );
</script>

<div class="qi" class:sending data-type={type}>
  <!-- Top row (title + spinners/volume) -->
  <div class="qi-row top-row">
    <div class="qi-search-wrap">
      {#if isRead || isStremio}
        <svg class="qi-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      {/if}
      <input
        bind:this={titleInputEl}
        class="qi-desc"
        class:searchable={isRead || isStremio}
        type="text"
        value={titleValue}
        placeholder={isRead || isStremio ? "Search AniList..." : "Video Title"}
        oninput={handleTitleInput}
        onblur={(e) => {
          handleBlur();
          handleEditableBlur(e, isStremio ? "contentTitleNative" : "description", (val) => persistFields(item.id, type, isStremio ? { description: val, contentTitleNative: val } : { description: val }, onRefresh));
        }}
        onfocus={(e) => {
          rememberEditableStart(e);
          handleFocus();
        }}
        onkeydown={handleEditableKeydown}
        aria-label="Item title"
      />
      {#if isLinked}
        {#if isRead || isStremio}
          <button
            type="button"
            class="qi-link-status"
            title="Unlink AniList match"
            onclick={handleUnlink}
            onmouseenter={() => (isUnlinkHovered = true)}
            onmouseleave={() => (isUnlinkHovered = false)}
            style={isUnlinkHovered ? "color: var(--color-error, #f0706a) !important;" : "color: var(--color-success, #3ddc84) !important;"}
          >
            {#if isUnlinkHovered}
              <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;" viewBox="0 0 24 24">
                <path d="M9 17H7A5 5 0 0 1 7 7h2"/>
                <path d="M15 7h2a5 5 0 1 1 0 10h-2"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
                <line x1="2" y1="22" x2="22" y2="22"/>
              </svg>
            {:else}
              <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;" viewBox="0 0 24 24">
                <path d="M9 17H7A5 5 0 0 1 7 7h2"/>
                <path d="M15 7h2a5 5 0 1 1 0 10h-2"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            {/if}
          </button>
        {:else}
          <span
            class="qi-link-status video-matched"
            title="Matched"
            style="cursor:default; color:var(--color-success, #3ddc84) !important; position:absolute; right:8px; top:50%; transform:translateY(-50%)"
          >
            <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;" viewBox="0 0 24 24">
              <path d="M9 17H7A5 5 0 0 1 7 7h2"/>
              <path d="M15 7h2a5 5 0 1 1 0 10h-2"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </span>
        {/if}
      {/if}

      {#if isRead || isStremio}
        <SearchDropdown
          bind:this={searchDropdown}
          searchType={isStremio ? stremioSearchType : "reading"}
          onSelect={handleSearchSelect}
          onMouseDown={() => {
            if (titleInputEl) {
              titleInputEl.dataset.committed = "true";
              titleInputEl.dataset.isMatching = "true";
            }
          }}
        />
      {/if}
    </div>

    <!-- Spinners and volume pill -->
    <div style="display:flex; gap:6px;">
      {#if isRead}
        <!-- Volume Pill button or edit input -->
        {#if isEditingVol}
          <input
            type="text"
            inputmode="numeric"
            class="qi-vol-input"
            bind:value={volInputValue}
            onkeydown={handleVolumeKey}
            onblur={commitVolume}
            aria-label="Volume number"
            use:autofocus
          />
        {:else}
          <button
            type="button"
            class="qi-vol-pill"
            title="Volume"
            onclick={startEditVolume}
          >
            Vol {volumeVal}
          </button>
        {/if}

        <!-- Chars Spinner Group -->
        <div class="qi-spin-group">
          <input
            class="qi-chars"
            type="number"
            value={item.chars || 0}
            min="0"
            style="--chars-len: {String(item.chars || 0).length};"
            onblur={(e) => handleEditableBlur(e, "chars", (val) => persistField(item.id, type, "chars", Math.max(0, Number(val) || 0), onRefresh))}
            onfocus={rememberEditableStart}
            onkeydown={handleEditableKeydown}
            aria-label="Character count"
          />
          <span
            style="font-size:10px; color:var(--color-text-muted); padding-right:2px;"
            >chars</span
          >
          <div class="qi-spin-nav">
            <button
              type="button"
              class="chars-up"
              onclick={() => adjustChars(100)}
              aria-label="Increment characters"
            >
              <svg viewBox="0 0 10 6" aria-hidden="true"
                ><polyline points="1,5 5,1 9,5" /></svg
              >
            </button>
            <button
              type="button"
              class="chars-dn"
              onclick={() => adjustChars(-100)}
              aria-label="Decrement characters"
            >
              <svg viewBox="0 0 10 6" aria-hidden="true"
                ><polyline points="1,1 5,5 9,1" /></svg
              >
            </button>
          </div>
        </div>
      {/if}

      <!-- Minutes Spinner Group -->
      <div class="qi-spin-group">
        <input
          class="qi-mins"
          type="number"
          value={displayMins}
          min="1"
          onblur={(e) => handleEditableBlur(e, "time", (val) => persistField(item.id, type, "time", isRead ? Math.max(1, Number(val) || 1) * 60 : Math.max(1, Number(val) || 1), onRefresh))}
          onfocus={rememberEditableStart}
          onkeydown={handleEditableKeydown}
          aria-label="Minutes duration"
        />
        <span
          style="font-size:10px; color:var(--color-text-muted); padding-right:2px;"
          >min</span
        >
        <div class="qi-spin-nav">
          <button
            type="button"
            class="mins-up"
            onclick={() => adjustMins(1)}
            aria-label="Increment minutes"
          >
            <svg viewBox="0 0 10 6" aria-hidden="true"
              ><polyline points="1,5 5,1 9,5" /></svg
            >
          </button>
          <button
            type="button"
            class="mins-dn"
            onclick={() => adjustMins(-1)}
            aria-label="Decrement minutes"
          >
            <svg viewBox="0 0 10 6" aria-hidden="true"
              ><polyline points="1,1 5,5 9,1" /></svg
            >
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Mid row (channel/reader metadata name & date input) -->
  <div class="qi-row mid-row">
    <span
      class="qi-meta"
      title={channelName + (urlDisplay ? " " + urlDisplay : "")}
    >
      {channelName}
      {urlDisplay}
    </span>
    <input
      type="datetime-local"
      class="qi-date-input"
          value={toLocalDT(defaultDateStr)}
          onchange={handleDateChange}
          onfocus={rememberEditableStart}
          onkeydown={handleEditableKeydown}
          aria-label="Log date"
        />
  </div>

  {#if isStremio}
    <div class="stremio-ep-meta">
      <span class="unit-lbl">Season {displaySeason}</span>
      {#if !((item.episodes > 1) || (sessions.length > 1))}
        <span class="unit-lbl-sep">·</span>
        <span class="unit-lbl">Ep {displayEpisode}</span>
      {/if}
      <span class="unit-lbl-sep">·</span>
      <div class="qi-stremio-stepper" style="display: flex; align-items: center; gap: 4px;">
        <input
          class="qi-stremio-num"
          type="number"
          min="1"
          value={Math.max(1, Number(item.episodes || 1))}
          onfocus={rememberEditableStart}
          onkeydown={handleEditableKeydown}
          onblur={(e) => handleEditableBlur(e, "episodes", (val) => persistField(item.id, type, "episodes", Math.max(1, Number(val) || 1), onRefresh))}
          aria-label="Episodes count"
        />
        <span class="unit-lbl">episodes watched</span>
        <div class="stepper-buttons">
          <button type="button" class="step-btn" onclick={() => persistField(item.id, type, "episodes", Math.max(1, Number(item.episodes || 1) + 1), onRefresh)} aria-label="Increment episodes"><svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,5 5,1 9,5" /></svg></button>
          <button type="button" class="step-btn" onclick={() => persistField(item.id, type, "episodes", Math.max(1, Number(item.episodes || 1) - 1), onRefresh)} aria-label="Decrement episodes"><svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,1 5,5 9,1" /></svg></button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Collapsible Episodes list -->
  {#if sessions.length > 1}
    <div class="qi-sessions">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <button
        type="button"
        class="session-summary"
        onclick={toggleSessionsOpen}
        style="list-style: none; background: none; border: none; text-align: left; width: 100%; padding: 0; cursor: pointer; display: block;"
      >
        {isSessionsOpen ? "▾" : "▸"} {isStremio ? "Episodes" : "Sessions"} ({sessions.length})
      </button>

      {#if isSessionsOpen}
        <div class="session-list">
          {#each sessions as session, i}
            <div class="qi-session">
              <span class="qi-session-num">{isStremio ? i + 1 : `s${i + 1}`}</span>

              {#if isStremio}
                <span class="stremio-static-meta">Season {session.season || 1} · Ep {session.episode || 1}</span>
                <span style="font-family: var(--font-mono, monospace) !important; font-size: 10px !important; color: var(--color-text-muted, #7a8ca5) !important; margin-left: 2px !important; margin-right: 4px !important;">·</span>
              {/if}

              {#if isRead}
                <input
                  class="qi-session-chars"
                  type="number"
                  value={session.chars || 0}
                  onfocus={rememberEditableStart}
                  onkeydown={handleEditableKeydown}
                  onblur={(e) => handleSessionLocalBlur(e, i, "chars")}
                  aria-label={`Session ${i + 1} characters`}
                  style="width: {Math.min(6, maxCharsLen)}ch;"
                />
                <span style="font-size:10px; color:var(--color-text-muted);"
                  >chars</span
                >
              {/if}

              <input
                class="qi-session-mins"
                type="number"
                value={Math.max(1, Math.round(session.secs / 60))}
                min="1"
                onfocus={rememberEditableStart}
                onkeydown={handleEditableKeydown}
                onblur={(e) => handleSessionLocalBlur(e, i, "mins")}
                aria-label={`Session ${i + 1} minutes`}
                style="width: {Math.min(4, maxMinsLen)}ch;"
              />
              <span style="font-size:10px; color:var(--color-text-muted);">min</span>

              <button
                type="button"
                class="qi-session-remove send-sess-btn"
                style="color: var(--color-accent) !important; padding: 0 4px !important; margin-left: 2px;"
                title="Log episode individually"
                onclick={() => handleSendSession(i)}
              >
                <svg style="width: 10px; height: 10px; fill: currentColor !important;" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>

              <input
                type="datetime-local"
                class="qi-session-date-input"
                style="flex: unset; width: 145px; margin-left: auto;"
                value={toLocalDT(session.date)}
                onfocus={rememberEditableStart}
                onkeydown={handleEditableKeydown}
                onchange={(e) =>
                  handleSessionChange(
                    i,
                    "date",
                    (e.target as HTMLInputElement).value,
                  )}
                aria-label={`Session ${i + 1} date`}
              />

              <button
                class="qi-session-remove"
                title="Remove episode"
                onclick={() => handleRemoveSession(session.id)}>×</button
              >
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Bottom row (Send / Remove buttons) -->
  <div class="qi-row bot-row">
    <button class="btn btn-amber btn-sm" onclick={handleSend} disabled={sending}
      >Send</button
    >
    <button
      class="btn btn-ghost btn-sm"
      onclick={handleRemove}
      disabled={sending}>Remove</button
    >
  </div>
</div>

<style>
  .qi-session-remove {
    background: none !important;
    border: none !important;
    color: var(--red, #f0706a) !important;
    cursor: pointer;
    padding: 0 4px !important;
    font-size: 12px !important;
    font-family: var(--font-mono);
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: none !important;
  }
  .qi-session-remove:hover {
    color: var(--color-error) !important;
    background: rgba(240, 112, 106, 0.08) !important;
  }
  .qi-link-status {
    background: none;
    border: none;
    outline: none;
    color: var(--color-success, #3ddc84) !important;
    font-size: 12px;
    cursor: pointer;
    margin-left: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    transition: color .15s;
    font-weight: bold;
  }
  .qi-link-status:hover {
    color: var(--color-error, #f0706a) !important;
  }
  .stremio-ep-meta {
    display: flex;
    align-items: center;
    justify-content: flex-start !important; /* Forces selectors entirely to the left */
    gap: 6px;
    margin-top: -5px !important;
    margin-bottom: -1px !important;
    padding-top: 0px !important;
    padding-bottom: 0px !important;
  }
  .stremio-ep-meta .unit-lbl {
    font-family: var(--font-mono, monospace) !important;
    font-size: 10px !important;
    color: var(--color-text-muted, #7a8ca5) !important;
  }
  .stremio-ep-meta .unit-lbl-sep {
    font-family: var(--font-mono, monospace) !important;
    font-size: 10px !important;
    color: var(--color-text-dimmed, #7a8ca5) !important;
    font-weight: bold;
  }
  .qi-stremio-num {
    text-align: center !important;
    font-size: 10px !important;
    font-family: var(--font-mono, monospace) !important;
    font-weight: bold !important;
    color: var(--color-accent, #f0b429) !important;
    background: none !important;
    border: none !important;
    outline: none !important;
    width: 14px !important;
    height: 12px !important;
    line-height: 1 !important;
    padding: 0 !important;
    margin: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    appearance: textfield !important;
    -moz-appearance: textfield !important;
  }
  .qi-stremio-num::-webkit-outer-spin-button,
  .qi-stremio-num::-webkit-inner-spin-button {
    -webkit-appearance: none !important;
    margin: 0 !important;
  }
  .qi-sessions {
    margin-top: 2px !important;
    padding-top: 4px !important;
    border-top: 1px solid var(--color-border, #1c2333) !important;
  }
  .qi-session-num {
    width: auto !important;
    min-width: unset !important;
    margin-right: 1px !important;
  }
  .stremio-static-meta {
    font-family: var(--font-mono, monospace) !important;
    font-size: 10px !important;
    color: var(--color-text-muted, #7a8ca5) !important;
    margin-left: 0px !important;
    margin-right: 4px !important;
  }
  .session-summary {
    font-size: 11.5px !important;
    padding-bottom: 5px !important;
    margin-bottom: 2px !important;
  }
  .stepper-buttons {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 12px;
    margin-left: 2px;
    gap: 0px;
  }
  .stepper-buttons .step-btn {
    background: none !important;
    border: none !important;
    padding: 0 !important;
    color: var(--color-text-dimmed, #7a8ca5) !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    height: 5px !important;
    width: 10px !important;
    transition: color 0.15s;
    line-height: 1 !important;
    outline: none !important;
    box-shadow: none !important;
  }
  .stepper-buttons .step-btn:hover {
    color: var(--color-accent, #f0b429) !important;
  }
  .stepper-buttons svg {
    width: 6px !important;
    height: 3px !important;
    stroke: currentColor !important;
    stroke-width: 2.5 !important;
    fill: none !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }
</style>
