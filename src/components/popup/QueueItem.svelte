<!--
  ── QueueItem.svelte (Popup) ─────────────────────────────────────────────────
  A single queue item card in the popup. Matches the original popup/main.ts
  buildItem() output exactly: editable ghost-num inputs for chars/mins/vol,
  ghost-date for datetime, and AniList search dropdown for reading items.
-->
<script lang="ts">
  import { videoQueueStorage, readingQueueStorage } from "@/lib/storage/queues";
  import {
    resolveVideoChannelMedia,
    submitLog,
  } from "@/lib/api/nihongotracker";
  import { type AniListSearchResult } from "@/lib/api/anilist";
  import { stripVideoTitle, parseTitleForUI } from "@/lib/utils/text-parsing";
  import { toLocalDT } from "@/lib/utils/time";
  import QueueItemSessions from "./QueueItemSessions.svelte";
  import SearchDropdown from "./SearchDropdown.svelte";

  interface Props {
    item: any;
    type: "video" | "reading";
    onStatusMessage: (msg: string, err?: boolean) => void;
    onConfirm: (title: string, msg: string) => Promise<boolean>;
    onRefresh: () => void;
  }

  let { item, type, onStatusMessage, onConfirm, onRefresh }: Props = $props();

  const isRead = $derived(type === "reading");
  let sending = $state(false);
  let searchDropdown: SearchDropdown | undefined = $state(undefined);
  let isUnlinkHovered = $state(false);

  /* ── Computed display values ──────────────────────────────────── */
  const rawTitle = $derived(
    item.description || item.contentTitleNative || "Unknown Title",
  );
  const displayTitle = $derived(
    type === "video" ? stripVideoTitle(rawTitle) : rawTitle,
  );
  const displayMins = $derived(
    isRead ? Math.max(1, Math.round((item.time || 0) / 60)) : item.time || 0,
  );
  const isLinked = $derived(
    isRead
      ? !!(item.mediaId && item.mediaId !== "web-reading")
      : true /* All YouTube videos tracked show as matched */,
  );

  let channelName = $derived(
    isRead
      ? `${item.readerName || "Reader"} \u2022 ${item.originalTitle || item.description || item.contentTitleNative || ""}`
      : item.channelTitle || item.contentTitleNative || "YouTube",
  );
  let urlDisplay = $derived(
    isRead ? "" : `\u2022 ${item.contentTitleEnglish || item.channelId || ""}`,
  );

  const sessions = $derived(item.sessions ?? []);
  const defaultDateStr = $derived(
    sessions.length > 0
      ? sessions[0].date
      : item.date || new Date().toISOString(),
  );

  /* ── Title editing + search ──────────────────────────────────── */
  let titleValue = $state("");
  $effect(() => {
    titleValue = displayTitle;
  });
  let debounceTimer: any;

  function handleTitleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    titleValue = val;

    if (isRead) {
      if (item.mediaId && item.mediaId !== "web-reading") {
        item.mediaId = "web-reading";
        item.mediaData = undefined;
      }
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
    }, 200);
  }

  function handleFocus() {
    clearTimeout(blurTimeout);
    if (isRead && titleValue.trim().length >= 2) {
      searchDropdown?.search(titleValue.trim());
    }
  }

  async function handleUnlink(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const idx = q.findIndex((x: any) => x.id === item.id);
    if (idx > -1) {
      q[idx] = { ...q[idx], mediaId: "web-reading", mediaData: undefined };
      await qStorage.setValue(q as any);
      onRefresh();
    }
  }

  async function persistField(field: string, value: any) {
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const idx = q.findIndex((x: any) => x.id === item.id);
    if (idx > -1) {
      q[idx] = { ...q[idx], [field]: value };
      await qStorage.setValue(q as any);
      onRefresh();
    }
  }

  async function handleTitleChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    await persistField("description", val);
  }

  async function handleSearchSelect(result: AniListSearchResult) {
    const native =
      result.title?.contentTitleNative ||
      result.contentTitleNative ||
      "Unknown";
    titleValue = native;

    const { volume: parsedVolume } = parseTitleForUI(native);
    const finalVolume = Math.max(1, item.volume || parsedVolume || 1);

    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = (await qStorage.getValue()) as any[];
    const idx = q.findIndex((x: any) => x.id === item.id);
    if (idx > -1) {
      q[idx] = {
        ...q[idx],
        description: native,
        mediaId: String(result.contentId),
        mediaData: {
          contentId: result.contentId,
          contentTitleNative: native,
          contentTitleEnglish:
            result.title?.contentTitleEnglish || result.contentTitleEnglish,
          contentTitleRomaji:
            result.title?.contentTitleRomaji || result.contentTitleRomaji,
          contentImage: result.coverImage || result.contentImage,
          coverImage: result.coverImage || result.contentImage,
          chapters: result.chapters,
          volumes: result.volumes,
        },
        volume: finalVolume,
      };
      await qStorage.setValue(q as any);
      onRefresh();
    }
  }

  /* ── Input Handlers ──────────────────────────────────────────── */
  async function handleCharsChange(e: Event) {
    const val = Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
    await persistField("chars", val);
  }

  async function handleTimeChange(e: Event) {
    const val = Math.max(1, Number((e.target as HTMLInputElement).value) || 1);
    await persistField("time", isRead ? val * 60 : val);
  }

  async function handleVolumeChange(e: Event) {
    const val = Math.max(1, Number((e.target as HTMLInputElement).value) || 1);
    await persistField("volume", val);
  }

  async function handleDateChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    try {
      const iso = new Date(val).toISOString();
      await persistField("date", iso);
    } catch {}
  }

  async function handleSessionChange(
    sessionIdx: number,
    field: string,
    val: any,
  ) {
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const idx = q.findIndex((x: any) => x.id === item.id);
    if (idx === -1) return;

    const entry = q[idx] as any;
    if (!entry.sessions || !entry.sessions[sessionIdx]) return;

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

    /* Auto-sum calculations */
    const sumSecs = entry.sessions.reduce((a: number, b: any) => a + b.secs, 0);
    const sumMins = Math.max(1, Math.round(sumSecs / 60));

    const sumChars = isRead
      ? entry.sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0)
      : 0;

    // Preserve manual overrides: only update the totals if they match the previous sum
    const previousSumSecs = item.sessions.reduce(
      (a: number, b: any) => a + b.secs,
      0,
    );
    const previousSumMins = Math.max(1, Math.round(previousSumSecs / 60));
    const previousSumChars = isRead
      ? item.sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0)
      : 0;

    let finalTime = item.time;
    let finalChars = item.chars;

    if (isRead) {
      const isTimeOverridden = displayMins > previousSumMins;
      const areCharsOverridden = Number(item.chars || 0) > previousSumChars;

      finalTime = isTimeOverridden ? item.time * 60 : sumSecs;
      finalChars = areCharsOverridden ? item.chars : sumChars;
    } else {
      const isTimeOverridden = displayMins > previousSumMins;
      finalTime = isTimeOverridden ? item.time : Math.round(sumSecs / 60);
    }

    entry.time = finalTime;
    entry.chars = finalChars;

    await qStorage.setValue(q as any);
    onRefresh();
  }

  /* ── Actions ─────────────────────────────────────────────────── */
  async function handleSend() {
    sending = true;
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const current = q.find((x: any) => x.id === item.id);
    if (!current) {
      sending = false;
      return;
    }

    if (type === "video") {
      try {
        await ensureVideoMediaData(current);
      } catch (_e) {}
    }

    const payloads = buildPayloads(current);
    let success = true,
      lastError = "",
      lastErrorCode = 0;

    for (const p of payloads) {
      const res = await submitLog(p);
      if (res?.success) {
        /* ok */
      } else {
        success = false;
        lastError = res?.error || "Unknown error";
        lastErrorCode = res?.status || 0;
      }
    }

    if (success) {
      await qStorage.setValue(q.filter((x: any) => x.id !== item.id) as any);
      onStatusMessage("✓ Sent");
      onRefresh();
    } else {
      sending = false;
      const errText = lastErrorCode
        ? `⚠ Failed [${lastErrorCode}]: ${lastError}`
        : `⚠ Failed: ${lastError}`;
      onStatusMessage(errText, true);
    }
  }

  async function handleDelete() {
    const ok = await onConfirm(
      "Delete Log",
      "Are you sure you want to delete this pending log?",
    );
    if (!ok) return;
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    await qStorage.setValue(q.filter((x: any) => x.id !== item.id) as any);
    onStatusMessage("✓ Log removed");
    onRefresh();
  }

  async function handleRemoveSession(sessionId: string) {
    const ok = await onConfirm(
      "Delete Session",
      "Are you sure you want to delete this session?",
    );
    if (!ok) return;
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const idx = q.findIndex((x: any) => x.id === item.id);
    if (idx === -1) return;
    const entry = q[idx] as any;
    entry.sessions = (entry.sessions ?? []).filter(
      (s: any) => s.id !== sessionId,
    );
    const totalSecs = entry.sessions.reduce(
      (a: number, b: any) => a + b.secs,
      0,
    );
    if (isRead) {
      entry.time = totalSecs;
      entry.chars = entry.sessions.reduce(
        (a: number, b: any) => a + (b.chars || 0),
        0,
      );
    } else {
      entry.time = Math.round(totalSecs / 60);
    }
    await qStorage.setValue(q as any);
    onStatusMessage("✓ Session removed");
    onRefresh();
  }

  /* ── Helpers ─────────────────────────────────────────────────── */
  async function ensureVideoMediaData(item: any) {
    const channelId = item.channelId || item.mediaData?.channelId;
    const channelTitle =
      item.mediaData?.channelTitle ||
      item.channelTitle ||
      item.contentTitleNative;
    if (item.mediaData?.channelImage && item.mediaData?.channelDescription)
      return;
    if (!channelId && !channelTitle) return;
    const media = await resolveVideoChannelMedia({ channelId, channelTitle });
    item.mediaData = {
      ...(item.mediaData || {}),
      channelId: media.channelId || channelId || "web-video",
      channelTitle:
        media.channelTitle || channelTitle || item.contentTitleNative,
      ...(media.channelImage ? { channelImage: media.channelImage } : {}),
      ...(media.channelDescription
        ? { channelDescription: media.channelDescription }
        : {}),
    };
  }

  function buildPayloads(item: any) {
    const desc =
      titleValue ||
      (isRead
        ? item.mediaData?.contentTitleNative || item.contentTitleNative
        : item.contentTitleNative);
    const apiTitle = type === "video" ? stripVideoTitle(desc) : desc;
    const base: any = {
      type,
      description: apiTitle,
      episodes: 0,
      pages: 0,
      unknownDate: false,
    };
    if (isRead) {
      base.mediaId = item.mediaId || "web-reading";
      base.volume = Math.max(1, Number(item.volume || 1));
      base.mediaData = item.mediaData || {
        contentId: "web-reading",
        contentTitleNative: item.contentTitleNative,
      };
    } else {
      base.mediaId = item.mediaData?.channelId || item.channelId || "web-video";
      base.mediaData = item.mediaData || {
        channelId: item.channelId || "web-video",
        channelTitle: item.contentTitleNative,
      };
    }
    return [
      {
        ...base,
        time: displayMins,
        date: new Date(defaultDateStr).toISOString(),
        chars: item.chars || 0,
      },
    ];
  }
</script>

<!-- Queue item card - matches original popup exactly -->
<div class="qi" class:sending data-type={type}>
  <!-- Title row -->
  <div class="qi-title-row">
    <div class="qi-search-wrap">
      {#if isRead}
        <svg class="qi-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      {/if}
      <input
        class="ghost-input qi-title"
        class:searchable={isRead}
        type="text"
        value={titleValue}
        title={displayTitle}
        oninput={handleTitleInput}
        onchange={handleTitleChange}
        onblur={handleBlur}
        onfocus={handleFocus}
        aria-label="Item title"
      />
      {#if isRead}
        <SearchDropdown
          bind:this={searchDropdown}
          onSelect={handleSearchSelect}
        />
      {/if}
    </div>
    {#if isLinked}
      {#if isRead}
        <button
          type="button"
          class="qi-link-status"
          title="Unlink AniList"
          onclick={handleUnlink}
          onmouseenter={() => (isUnlinkHovered = true)}
          onmouseleave={() => (isUnlinkHovered = false)}
          style={isUnlinkHovered
            ? "color: var(--color-error)"
            : "color: var(--color-success)"}
        >
          {isUnlinkHovered ? "✗" : "✓"}
        </button>
      {:else}
        <span class="qi-link-status" title="Matched" style="cursor:default"
          >✓</span
        >
      {/if}
    {/if}
    <button class="qi-del" title="Remove" onclick={handleDelete}>×</button>
  </div>

  <!-- Meta row with EDITABLE inputs (matches original ghost-num pattern) -->
  <div class="qi-meta-row" style="flex-wrap:wrap; gap:0;">
    {#if isRead}
      <input
        class="ghost-num num-chars qi-chars-num"
        type="number"
        min="0"
        value={item.chars || 0}
        onchange={handleCharsChange}
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
      onchange={handleTimeChange}
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
        onchange={handleVolumeChange}
        aria-label="Volume number"
      />
      <span class="unit-lbl">vol</span>
    {/if}
    <span class="qi-meta-sep">·</span>
    <div class="qi-mid">
      <span class="qi-channel" title="{channelName} {urlDisplay}"
        >{channelName} {urlDisplay}</span
      >
    </div>
    <div style="flex-basis: 100%; height: 0;"></div>
    <input
      class="ghost-date qi-date"
      type="datetime-local"
      value={toLocalDT(defaultDateStr)}
      style="text-align:left; margin-left:0;"
      onchange={handleDateChange}
      aria-label="Log date"
    />
    <button
      class="qi-send"
      onclick={handleSend}
      disabled={sending}
      style="margin-left:auto;">Send</button
    >
  </div>

  <!-- Sessions -->
  <QueueItemSessions
    {sessions}
    itemId={item.id}
    isReading={isRead}
    onRemoveSession={handleRemoveSession}
    onSessionChange={handleSessionChange}
  />
</div>
