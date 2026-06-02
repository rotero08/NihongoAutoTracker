<!-- QueueItem.svelte -->
<script lang="ts">
  /**
   * ── QueueItem.svelte ──────────────────────────────────────────────────────
   * A single queued immersion entry within the popup list view.
   */

  import { toLocalDT } from "@/lib/utils/time";
  import QueueItemSessions from "./QueueItemSessions.svelte";
  import SearchDropdown from "./SearchDropdown.svelte";
  import { stripVideoTitle } from "@/lib/utils/text-parsing";
  import { configStorage } from "@/lib/storage/config";
  import { addDebugLog } from "@/lib/storage/debug";
  import { submitLog } from "@/lib/api/nihongotracker";
  import {
    persistField,
    handleUnlink,
    ensureVideoMediaData,
    markStremioProcessed,
    buildPayloads,
    getUpdater
  } from "@/lib/utils/queue-actions";

  let {
    item,
    type,
    onStatusMessage,
    onConfirm,
    onRefresh
  }: {
    item: any;
    type: "video" | "reading" | "stremio";
    onStatusMessage: (msg: string, err?: boolean) => void;
    onConfirm: (title: string, msg: string, warnKey?: string) => Promise<boolean>;
    onRefresh: () => void;
  } = $props();

  let sending = $state(false);
  let isUnlinkHovered = $state(false);
  let titleValue = $state("");
  let titleInputEl = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    const rawTitle = item.description || item.contentTitleNative || "Unknown Title";
    titleValue = type === "stremio"
      ? item.contentTitleNative || item.contentTitleRomaji || item.contentTitleEnglish || rawTitle.replace(/^(Trakt|Stremio):\s*/, "")
      : type === "video" ? stripVideoTitle(rawTitle) : rawTitle.replace(/^(Trakt|Stremio):\s*/, "");
  });

  const isRead = $derived(type === "reading");
  const isStremio = $derived(type === "stremio");

  const displayMins = $derived(
    isRead ? Math.max(1, Math.round((item.time || 0) / 60)) : item.time || 0,
  );
  let isLinked = $derived(
    isRead
      ? !!(item.mediaId && item.mediaId !== "web-reading")
      : isStremio
        ? !!(item.mediaId || item.mediaData?.contentId)
        : true,
  );

  // Synchronized lifecycle tracking prevents unmatched states hanging on matched swaps
  $effect(() => {
    if (!isLinked) {
      isUnlinkHovered = false;
    }
  });

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

  const sessions = $derived(item.sessions ?? []);
  const stremioSearchType = $derived(
    item.logType === "movie" ? "movie" : item.logType === "tv show" ? "tv_show" : "anime",
  );
  const defaultDateStr = $derived(
    sessions.length > 0 ? sessions[0].date : item.date || new Date().toISOString(),
  );

  const displaySeason = $derived(
    Math.max(1, Number(item.season || (sessions[0]?.season) || 1))
  );
  const displayEpisode = $derived(
    Math.max(1, Number(item.episode || (sessions[0]?.episode) || 1))
  );

  const charsLength = $derived(String(item.chars || 0).length);
  const minsLength = $derived(String(displayMins || 0).length);
  const volLength = $derived(String(Math.max(1, Number(item.volume || 1))).length);

  let searchDropdown: SearchDropdown | undefined = $state(undefined);
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

  function handleBlur() {
    searchDropdown?.close();
  }

  function handleFocus() {
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
    if (input.classList.contains("qi-title")) {
      titleValue = startVal;
      searchDropdown?.close();
    }
  }

  function handleEditableBlur(e: FocusEvent, field: string, saveFn: (val: any) => void) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.dataset.committed === "true") {
      if (field === "description" || field === "contentTitleNative") {
        const changed = input.value !== input.dataset.editStart;
        if (changed && isLinked && input.dataset.isMatching !== "true") {
          handleUnlink(item.id, type, () => {}, () => {});
        }
      }
      saveFn(input.value);
    } else {
      revertInput(input);
    }
    handleBlur();
  }

  async function handleSearchSelect(result: any) {
    const native = result.title?.contentTitleNative || result.contentTitleNative || "Unknown";
    titleValue = native;

    const updater = getUpdater(type);
    await updater((queue: any[]) => {
      const idx = queue.findIndex((x) => x.id === item.id);
      if (idx > -1) {
        const nextQueue = [...queue];
        nextQueue[idx] = {
          ...nextQueue[idx],
          description: native,
          contentTitleNative: native,
          contentTitleEnglish: result.title?.contentTitleEnglish || result.contentTitleEnglish || nextQueue[idx].contentTitleEnglish,
          contentTitleRomaji: result.title?.contentTitleRomaji || result.contentTitleRomaji || nextQueue[idx].contentTitleRomaji,
          mediaId: String(result.contentId),
          mediaData: {
            contentId: result.contentId,
            contentTitleNative: native,
            contentTitleEnglish: result.title?.contentTitleEnglish || result.contentTitleEnglish || undefined,
            contentTitleRomaji: result.title?.contentTitleRomaji || result.contentTitleRomaji || undefined,
            contentImage: result.coverImage || result.contentImage || undefined,
            coverImage: result.coverImage || result.contentImage || undefined,
            chapters: result.chapters || undefined,
            volumes: result.volumes || undefined,
          },
        };
        return nextQueue;
      }
      return queue;
    });
    onRefresh();
    searchDropdown?.close();
  }

  async function handleSend() {
    sending = true;
    const config = await configStorage.getValue();

    if (type === "reading" && (!item.mediaId || item.mediaId === "web-reading")) {
      if (config.warnUnmatched !== false) {
        const proceed = await onConfirm(
          "Unmatched Media Warning",
          "This reading log is not linked to any AniList entry and will be logged as unmatched. Are you sure you want to proceed?",
          "warnUnmatched"
        );
        if (!proceed) {
          sending = false;
          return;
        }
      }
    }

    if (type === "video") {
      try {
        const updatedMediaData = await ensureVideoMediaData(item);
        await persistField(item.id, type, "mediaData", updatedMediaData, () => {});
      } catch (e) {}
    }

    const payloads = buildPayloads(item, type, titleValue);
    let success = true;
    let lastError = "";

    for (const payload of payloads) {
      const result = await submitLog(payload);
      if (!result?.success) {
        success = false;
        lastError = result?.error || "Unknown error";
        await addDebugLog("ERROR", "QueueItem", `Manual log failed: ${payload.description}`, lastError);
      }
    }

    if (success) {
      const updater = getUpdater(type);
      await updater((queue: any[]) => queue.filter((x) => x.id !== item.id));
      onRefresh();
    } else {
      sending = false;
      onStatusMessage(`⚠ Failed: ${lastError}`, true);
    }
  }

  async function handleSendSession(sessionIdx: number) {
    const session = sessions[sessionIdx];
    if (!session) return;

    sending = true;
    const desc = isStremio
      ? item.mediaData?.contentTitleNative || item.contentTitleNative || titleValue
      : titleValue || (isRead ? item.mediaData?.contentTitleNative || item.contentTitleNative : item.contentTitleNative);
    const apiTitle = type === "video" ? stripVideoTitle(desc) : desc;

    const payload: any = {
      type: isStremio ? item.logType || "anime" : type,
      description: apiTitle,
      time: Math.max(1, Math.round((session.secs || 0) / 60)),
      date: new Date(session.date).toISOString(),
      chars: isRead ? session.chars || 0 : 0,
      episodes: isStremio ? 1 : 0,
      pages: 0,
      unknownDate: false,
      private: false,
      mediaId: isRead
        ? item.mediaId || "web-reading"
        : isStremio
          ? item.mediaId || item.mediaData?.contentId || `trakt:${item.traktHistoryId}`
          : item.mediaData?.channelId || item.channelId || "web-video",
      mediaData: item.mediaData || {},
    };
    if (isRead) {
      payload.volume = Math.max(1, Number(item.volume || 1));
    }

    const result = await submitLog(payload, true);
    if (result?.success) {
      const updater = getUpdater(type);
      await updater((queue: any[]) => {
        const idx = queue.findIndex((x) => x.id === item.id);
        if (idx === -1) return queue;

        const entry = JSON.parse(JSON.stringify(queue[idx]));
        entry.sessions = (entry.sessions ?? []).filter((s: any) => s.id !== session.id);

        if (entry.sessions.length === 0) {
          return queue.filter((x) => x.id !== item.id);
        }

        const totalSecs = entry.sessions.reduce((a: number, b: any) => a + b.secs, 0);
        entry.time = isRead ? totalSecs : Math.round(totalSecs / 60);
        if (isRead) {
          entry.chars = entry.sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0);
        } else if (isStremio) {
          entry.episodes = entry.sessions.length || 1;
        }

        const nextQueue = [...queue];
        nextQueue[idx] = entry;
        return nextQueue;
      });
      sending = false;
      onRefresh();
      onStatusMessage("✓ Session logged successfully");
    } else {
      sending = false;
      onStatusMessage(`⚠ Failed: ${result?.error || "Unknown error"}`, true);
    }
  }

  async function handleDelete() {
    const proceed = await onConfirm("Delete Log", "Are you sure you want to delete this pending log?");
    if (!proceed) return;

    const updater = getUpdater(type);
    await updater((queue: any[]) => queue.filter((x) => x.id !== item.id));
    if (type === "stremio") {
      await markStremioProcessed(item);
    }
    onStatusMessage("✓ Log removed");
    onRefresh();
  }

  async function handleRemoveSession(sessionId: string) {
    const proceed = await onConfirm("Delete Session", "Are you sure you want to delete this session?");
    if (!proceed) return;

    const updater = getUpdater(type);
    await updater((queue: any[]) => {
      const idx = queue.findIndex((x) => x.id === item.id);
      if (idx === -1) return queue;

      const entry = JSON.parse(JSON.stringify(queue[idx]));
      entry.sessions = (entry.sessions ?? []).filter((s: any) => s.id !== sessionId);

      const totalSecs = entry.sessions.reduce((a: number, b: any) => a + b.secs, 0);
      entry.time = isRead ? totalSecs : Math.round(totalSecs / 60);
      if (isRead) {
        entry.chars = entry.sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0);
      } else if (isStremio) {
        entry.episodes = entry.sessions.length || 1;
      }

      const nextQueue = [...queue];
      nextQueue[idx] = entry;
      return nextQueue;
    });
    onRefresh();
    onStatusMessage("✓ Session removed");
  }

  async function handleSessionChange(sessionIdx: number, field: string, val: any) {
    const updater = getUpdater(type);
    await updater((queue: any[]) => {
      const idx = queue.findIndex((x) => x.id === item.id);
      if (idx === -1) return queue;

      const entry = JSON.parse(JSON.stringify(queue[idx]));
      if (!entry.sessions || !entry.sessions[sessionIdx]) return queue;

      const session = entry.sessions[sessionIdx];
      if (field === "chars") {
        session.chars = Math.max(0, Number(val) || 0);
      } else if (field === "mins") {
        session.secs = Math.max(1, Number(val) || 1) * 60;
      } else if (field === "date") {
        try {
          session.date = new Date(val).toISOString();
        } catch {}
      } else if (field === "season") {
        session.season = Math.max(1, Number(val) || 1);
      } else if (field === "episodes") {
        entry.episodes = Math.max(1, Number(val) || 1);
      }

      const totalSecs = entry.sessions.reduce((a: number, b: any) => a + b.secs, 0);
      entry.time = isRead ? totalSecs : Math.round(totalSecs / 60);
      if (isRead) {
        entry.chars = entry.sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0);
      }

      const nextQueue = [...queue];
      nextQueue[idx] = entry;
      return nextQueue;
    });
    onRefresh();
  }

  async function adjustStremioPart(field: "season" | "episodes", delta: number) {
    const current = Math.max(1, Number(item[field] || 1));
    await persistField(item.id, type, field, Math.max(1, current + delta), onRefresh);
  }
</script>

<div class="qi" class:sending data-type={type}>
  <div class="qi-title-row">
    <div class="qi-search-wrap">
      {#if isRead || isStremio}
        <svg class="qi-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      {/if}
      <input
        bind:this={titleInputEl}
        class="ghost-input qi-title"
        class:searchable={isRead || isStremio}
        type="text"
        value={titleValue}
        title={item.description || item.contentTitleNative}
        oninput={handleTitleInput}
        onblur={(e) => handleEditableBlur(e, isStremio ? "contentTitleNative" : "description", (val) => persistField(item.id, type, isStremio ? "contentTitleNative" : "description", val, onRefresh))}
        onfocus={(e) => {
          rememberEditableStart(e);
          handleFocus();
        }}
        onkeydown={handleEditableKeydown}
        aria-label="Item title"
      />
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
    {#if isLinked}
      {#if isRead || isStremio}
        <button
          type="button"
          class="qi-link-status"
          title="Unlink AniList match"
          onclick={() => handleUnlink(item.id, type, onRefresh, onStatusMessage)}
          onmouseenter={() => (isUnlinkHovered = true)}
          onmouseleave={() => (isUnlinkHovered = false)}
          style={isUnlinkHovered ? "color: var(--color-error, #f0706a) !important;" : "color: var(--color-success, #3ddc84) !important;"}
        >
          {#if isUnlinkHovered}
            <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;" viewBox="0 0 24 24">
              <path d="M9 17H7A5 5 0 0 1 7 7h2"/>
              <path d="M15 7h2a5 5 0 1 1 0 10h-2"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="2" y1="2" x2="22" y2="22"/>
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
        <span class="qi-link-status" title="Matched" style="cursor:default; color: var(--color-success, #3ddc84) !important;">
          <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;" viewBox="0 0 24 24">
            <path d="M9 17H7A5 5 0 0 1 7 7h2"/>
            <path d="M15 7h2a5 5 0 1 1 0 10h-2"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </span>
      {/if}
    {/if}
    <button class="qi-del" title="Remove" onclick={handleDelete}>×</button>
  </div>

  <div class="qi-meta-row" style="flex-wrap:wrap; gap:0;">
    {#if isRead}
      <input
        class="ghost-num qi-chars-num"
        type="number"
        min="0"
        value={item.chars || 0}
        style="width: {charsLength + 0.5}ch !important;"
        onblur={(e) => handleEditableBlur(e, "chars", (val) => persistField(item.id, type, "chars", Math.max(0, Number(val) || 0), onRefresh))}
        onfocus={rememberEditableStart}
        onkeydown={handleEditableKeydown}
        aria-label="Character count"
      />
      <span class="unit-lbl">chars</span>
    {/if}
    <input
      class="ghost-num qi-time-num"
      type="number"
      min="1"
      value={displayMins}
      title="Total minutes"
      style="width: {minsLength + 0.5}ch !important;"
      onblur={(e) => handleEditableBlur(e, "time", (val) => persistField(item.id, type, "time", isRead ? Math.max(1, Number(val) || 1) * 60 : Math.max(1, Number(val) || 1), onRefresh))}
      onfocus={rememberEditableStart}
      onkeydown={handleEditableKeydown}
      aria-label="Duration in minutes"
    />
    <span class="unit-lbl">min</span>
    {#if isRead}
      <input
        class="ghost-num num-vol qi-vol"
        type="number"
        min="1"
        value={Math.max(1, Number(item.volume || 1))}
        title="Volume"
        style="width: {volLength + 0.5}ch !important;"
        onblur={(e) => handleEditableBlur(e, "volume", (val) => persistField(item.id, type, "volume", Math.max(1, Number(val) || 1), onRefresh))}
        onfocus={rememberEditableStart}
        onkeydown={handleEditableKeydown}
        aria-label="Volume number"
      />
      <span class="unit-lbl">vol</span>
    {/if}
    <span class="qi-meta-sep">·</span>
    <div class="qi-mid">
      <span class="qi-channel" title="{channelName} {urlDisplay}">{channelName} {urlDisplay}</span>
    </div>
    {#if isStremio}
      <div style="flex-basis: 100%; height: 0;"></div>
      <div class="stremio-meta-row">
        <span>Season {displaySeason}</span>
        {#if !((item.episodes > 1) || (sessions.length > 1))}
          <span>·</span>
          <span>Ep {displayEpisode}</span>
        {/if}
        <span>·</span>
        <div class="qi-stremio-stepper" style="display: flex; align-items: center; gap: 4px;">
          <input
            class="qi-episodes-num"
            type="number"
            min="1"
            value={Math.max(1, Number(item.episodes || 1))}
            onfocus={rememberEditableStart}
            onkeydown={handleEditableKeydown}
            onblur={(e) => handleEditableBlur(e, "episodes", (val) => persistField(item.id, type, "episodes", Math.max(1, Number(val) || 1), onRefresh))}
            aria-label="Episodes count"
          />
          <span>episodes watched</span>
          <div class="stepper-nav">
            <button type="button" onclick={() => adjustStremioPart('episodes', 1)} aria-label="Increment episodes">
              <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,5 5,1 9,5" /></svg>
            </button>
            <button type="button" onclick={() => adjustStremioPart('episodes', -1)} aria-label="Decrement episodes">
              <svg viewBox="0 0 10 6" aria-hidden="true"><polyline points="1,1 5,5 9,1" /></svg>
            </button>
          </div>
        </div>
      </div>
    {/if}
    <div style="flex-basis: 100%; height: 6px;"></div>
    <input
      class="ghost-date qi-date"
      type="datetime-local"
      value={toLocalDT(defaultDateStr)}
      style="text-align:left; margin-left:0;"
      onchange={(e) => persistField(item.id, type, "date", new Date((e.target as HTMLInputElement).value).toISOString(), onRefresh)}
      onfocus={rememberEditableStart}
      onkeydown={handleEditableKeydown}
      aria-label="Log date"
    />
    <button class="qi-send" onclick={handleSend} disabled={sending} style="margin-left:auto;">Send</button>
  </div>

  <QueueItemSessions
    {sessions}
    itemId={item.id}
    isReading={isRead}
    isStremio={isStremio}
    onRemoveSession={handleRemoveSession}
    onSessionChange={handleSessionChange}
    onSendSession={handleSendSession}
  />
</div>

<style>
  .ghost-num {
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
    outline: none !important;
    background: none !important;
    min-width: unset !important;
    box-shadow: none !important;
  }
  .stremio-meta-row {
    display: flex;
    align-items: center;
    font-family: var(--font-mono, monospace) !important;
    font-size: 10px !important;
    color: var(--color-text-muted, #7a8ca5) !important;
    gap: 4px;
    margin-top: 6px;
  }
  .stremio-meta-row span {
    font-family: var(--font-mono, monospace) !important;
    font-size: 10px !important;
    color: var(--color-text-dimmed, #7a8ca5) !important;
  }
  .qi-episodes-num {
    width: 14px;
    font-family: var(--font-mono, monospace) !important;
    font-size: 10px !important;
    font-weight: bold !important;
    color: var(--color-accent, #f0b429) !important;
    background: none !important;
    border: none !important;
    outline: none !important;
    text-align: right !important;
    padding: 0 !important;
    margin: 0 !important;
    appearance: textfield !important;
    -moz-appearance: textfield !important;
  }
  .qi-episodes-num::-webkit-outer-spin-button,
  .qi-episodes-num::-webkit-inner-spin-button {
    -webkit-appearance: none !important;
    margin: 0 !important;
  }
  .stepper-nav {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 12px;
    margin-left: 2px;
    gap: 0px;
  }
  .stepper-nav button {
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
  .stepper-nav button:hover {
    color: var(--color-accent, #f0b429) !important;
  }
  .stepper-nav svg {
    width: 6px !important;
    height: 3px !important;
    stroke: currentColor !important;
    stroke-width: 2.5 !important;
    fill: none !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }
</style>
