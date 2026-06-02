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

  interface Props {
    item: any;
    type: "video" | "reading" | "stremio";
    onStatusMessage: (msg: string, err?: boolean) => void;
    onConfirm: (title: string, msg: string, warnKey?: string) => Promise<boolean>;
    onRefresh: () => void;
  }

  let { item, type, onStatusMessage, onConfirm, onRefresh }: Props = $props();

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

  let channelName = $derived(
    isStremio
      ? `Stremio • ${((item.sessions?.length || item.episodes || 1) > 1) ? `${item.sessions?.length || item.episodes} episodes` : item.season && item.episode ? `S${item.season}E${item.episode}` : item.logType || "Trakt"}`
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
      } else if (field === "episode") {
        session.episode = Math.max(1, Number(val) || 1);
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
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              <path d="M10 13a5 5 0 0 0 7.54.54l1.5-1.5" />
              <path d="M17.25 4.75a5 5 0 0 0-4.32-.82l-1.72 1.71" />
              <line x1="18.5" y1="2.5" x2="18.5" y2="0.5" stroke-width="2.2" />
              <line x1="20" y1="3.5" x2="21.5" y2="2" stroke-width="2.2" />
              <line x1="20.5" y1="5.5" x2="22.5" y2="5.5" stroke-width="2.2" />
            </svg>
          {:else}
            <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;" viewBox="0 0 24 24">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          {/if}
        </button>
      {:else}
        <span class="qi-link-status" title="Matched" style="cursor:default; color: var(--color-success, #3ddc84) !important;">
          <svg style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;" viewBox="0 0 24 24">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
        style={`--chars-len: ${String(item.chars || 0).length};`}
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
    {#if isStremio && sessions.length <= 1 && item.traktType === "episode"}
      <div style="flex-basis: 100%; height: 0;"></div>
      <div class="stremio-capsule">
        <span class="stremio-badge">Ep Info</span>
        <div class="stremio-fields">
          <div class="stremio-field">
            <span class="stremio-label">S</span>
            <input
              class="stremio-input"
              type="number"
              min="1"
              value={Math.max(1, Number(item.season || 1))}
              onfocus={rememberEditableStart}
              onkeydown={handleEditableKeydown}
              onblur={(e) => handleEditableBlur(e, "season", (val) => persistField(item.id, type, "season", Math.max(1, Number(val) || 1), onRefresh))}
              aria-label="Season"
            />
          </div>
          <div class="stremio-divider"></div>
          <div class="stremio-field">
            <span class="stremio-label">E</span>
            <input
              class="stremio-input"
              type="number"
              min="1"
              value={Math.max(1, Number(item.episode || 1))}
              onfocus={rememberEditableStart}
              onkeydown={handleEditableKeydown}
              onblur={(e) => handleEditableBlur(e, "episode", (val) => persistField(item.id, type, "episode", Math.max(1, Number(val) || 1), onRefresh))}
              aria-label="Episode"
            />
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
  .stremio-capsule {
    display: inline-flex;
    align-items: center;
    background: color-mix(in srgb, var(--color-accent, #f0b429) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent, #f0b429) 15%, transparent);
    border-radius: 4px;
    padding: 2px 6px;
    gap: 8px;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    margin-top: 4px;
  }
  .stremio-badge {
    color: var(--color-text-dimmed, #7a8ca5);
    font-weight: bold;
    font-size: 8px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .stremio-fields {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .stremio-field {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .stremio-label {
    color: var(--color-text-dimmed, #7a8ca5);
    font-weight: bold;
  }
  .stremio-input {
    width: 22px;
    text-align: center;
    color: var(--color-accent, #f0b429);
    font-weight: bold;
    background: none;
    border: none;
    padding: 0;
    outline: none;
  }
  .stremio-input:hover {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 2px;
  }
  .stremio-divider {
    width: 1px;
    height: 8px;
    background: var(--color-border, #1c2333);
  }
</style>
