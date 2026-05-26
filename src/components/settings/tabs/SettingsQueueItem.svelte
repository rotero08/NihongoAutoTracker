<!--
  ── SettingsQueueItem.svelte ───────────────────────────────────────────────────
  A single queue item component for the settings page. Matches the original
  settings/main.ts buildItem() layout exactly: volume pill editor, characters &
  minutes spin-nav controls, local date input, collapsible sessions, and
  full persistence to browser storage.
-->
<script lang="ts">
  import { videoQueueStorage, readingQueueStorage } from "@/lib/storage/queues";
  import {
    resolveVideoChannelMedia,
    submitLog,
  } from "@/lib/api/nihongotracker";
  import { searchAniList, type AniListSearchResult } from "@/lib/api/anilist";
  import {
    stripVideoTitle,
    parseTitleForUI,
    escapeHtml,
  } from "@/lib/utils/text-parsing";
  import { toLocalDT } from "@/lib/utils/time";
  import SearchDropdown from "@/components/popup/SearchDropdown.svelte";
  import { storage } from "wxt/utils/storage";
  import { onMount } from "svelte";

  interface Props {
    item: any;
    type: "video" | "reading";
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
  let sending = $state(false);
  let searchDropdown: SearchDropdown | undefined = $state(undefined);
  let isUnlinkHovered = $state(false);

  /* ── State for Title & Inline Volume Input ────────────────────── */
  let titleValue = $state("");
  $effect(() => {
    const rawTitle =
      item.description || item.contentTitleNative || "Unknown Title";
    titleValue = type === "video" ? stripVideoTitle(rawTitle) : rawTitle;
  });

  let volumeVal = $derived(Math.max(1, Number(item.volume || 1)));
  let isEditingVol = $state(false);
  let volInputValue = $state(1);

  /* ── Derived display values ──────────────────────────────────── */
  const displayMins = $derived(
    isRead ? Math.max(1, Math.round((item.time || 0) / 60)) : item.time || 0,
  );

  const sessions = $derived(item.sessions ?? []);
  const defaultDateStr = $derived(
    sessions.length > 0
      ? sessions[0].date
      : item.date || new Date().toISOString(),
  );

  let isLinked = $derived(
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

  /* Collapsible sessions open/closed state tracking */
  let isSessionsOpen = $state(true);

  onMount(async () => {
    const val = await storage.getItem(`local:sess-closed-${item.id}`);
    isSessionsOpen = val !== "1";
  });

  async function toggleSessionsOpen() {
    isSessionsOpen = !isSessionsOpen;
    await storage.setItem(
      `local:sess-closed-${item.id}`,
      isSessionsOpen ? "0" : "1",
    );
  }

  /* ── Persistence helper ──────────────────────────────────────── */
  async function saveItem(updatedFields: Partial<any>) {
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const idx = q.findIndex((x: any) => x.id === item.id);
    if (idx > -1) {
      q[idx] = { ...q[idx], ...updatedFields };
      // Deep clone to strip Svelte Proxy objects/getters
      const plainObj = JSON.parse(JSON.stringify(q[idx]));
      // Explicitly delete mediaData if we unlinked (set to undefined)
      if (
        "mediaData" in updatedFields &&
        updatedFields.mediaData === undefined
      ) {
        delete plainObj.mediaData;
      }
      q[idx] = plainObj;

      await qStorage.setValue(q as any);
      onRefresh();
    }
  }

  /* ── Editing Handlers ────────────────────────────────────────── */
  let debounceTimer: any;

  function handleTitleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    titleValue = val;

    if (isRead) {
      if (item.mediaId && item.mediaId !== "web-reading") {
        saveItem({ mediaId: "web-reading", mediaData: undefined });
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

  async function handleTitleChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    await saveItem({ description: val });
  }

  async function handleSearchSelect(result: AniListSearchResult) {
    const native =
      result.title?.contentTitleNative ||
      result.contentTitleNative ||
      "Unknown";
    titleValue = native;

    const { volume: parsedVolume } = parseTitleForUI(native);
    const finalVolume = Math.max(1, item.volume || parsedVolume || 1);

    await saveItem({
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
    });
    searchDropdown?.close();
  }

  async function handleUnlink(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    await saveItem({ mediaId: "web-reading", mediaData: undefined });
    onStatus("✓ AniList match unlinked");
  }

  /* Volume editing */
  function startEditVolume() {
    volInputValue = volumeVal;
    isEditingVol = true;
  }

  async function commitVolume() {
    const nextVal = Math.max(1, Number(volInputValue) || 1);
    isEditingVol = false;
    await saveItem({ volume: nextVal });
  }

  function handleVolumeKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      commitVolume();
    } else if (e.key === "Escape") {
      isEditingVol = false;
    }
  }

  /* Characters spin navigation */
  async function handleCharsChange(e: Event) {
    const inputVal = Math.max(
      0,
      Number((e.target as HTMLInputElement).value) || 0,
    );
    const sumChars = sessions.reduce(
      (a: number, b: any) => a + (b.chars || 0),
      0,
    );
    const val = Math.max(sumChars, inputVal);
    await saveItem({ chars: val });
  }

  async function adjustChars(amt: number) {
    const current = Number(item.chars || 0);
    const sumChars = sessions.reduce(
      (a: number, b: any) => a + (b.chars || 0),
      0,
    );
    const nextVal = Math.max(sumChars, current + amt);
    await saveItem({ chars: nextVal });
  }

  /* Minutes spin navigation */
  async function handleMinsChange(e: Event) {
    const inputVal = Math.max(
      1,
      Number((e.target as HTMLInputElement).value) || 1,
    );
    const sumSecs = sessions.reduce(
      (a: number, b: any) => a + (b.secs || 0),
      0,
    );
    const sumMins = Math.max(1, Math.round(sumSecs / 60));
    const val = Math.max(sumMins, inputVal);
    await saveItem({ time: isRead ? val * 60 : val });
  }

  async function adjustMins(amt: number) {
    const current = displayMins;
    const sumSecs = sessions.reduce(
      (a: number, b: any) => a + (b.secs || 0),
      0,
    );
    const sumMins = Math.max(1, Math.round(sumSecs / 60));
    const nextVal = Math.max(sumMins, current + amt);
    await saveItem({ time: isRead ? nextVal * 60 : nextVal });
  }

  /* Date editing */
  async function handleDateChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    try {
      const iso = new Date(val).toISOString();
      await saveItem({ date: iso });
    } catch {}
  }

  /* Session editing */
  async function handleSessionChange(
    sessionIdx: number,
    field: string,
    val: any,
  ) {
    const entry = JSON.parse(JSON.stringify(item));
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

    await saveItem({
      sessions: entry.sessions,
      time: finalTime,
      chars: finalChars,
    });
  }

  async function handleRemoveSession(sessionId: string) {
    const ok = await onConfirm(
      "Delete Session",
      "Are you sure you want to delete this session?",
    );
    if (!ok) return;

    const entry = JSON.parse(JSON.stringify(item));
    entry.sessions = (entry.sessions ?? []).filter(
      (s: any) => s.id !== sessionId,
    );

    const totalSecs = entry.sessions.reduce(
      (a: number, b: any) => a + b.secs,
      0,
    );
    let finalTime = entry.time;
    let finalChars = entry.chars;
    if (isRead) {
      finalTime = totalSecs;
      finalChars = entry.sessions.reduce(
        (a: number, b: any) => a + (b.chars || 0),
        0,
      );
    } else {
      finalTime = Math.round(totalSecs / 60);
    }

    await saveItem({
      sessions: entry.sessions,
      time: finalTime,
      chars: finalChars,
    });
    onStatus("✓ Session removed");
  }

  function getItemPayloads(current: any, type: "reading" | "video") {
    const isRead = type === "reading";
    const s = current.sessions ?? [];
    const displayM = isRead
      ? Math.max(1, Math.round((current.time || 0) / 60))
      : current.time || 0;
    const sumSecs = s.reduce((a: number, b: any) => a + (b.secs || 0), 0);
    const sumMins = Math.max(1, Math.round(sumSecs / 60));
    const sumChars = isRead
      ? s.reduce((a: number, b: any) => a + (b.chars || 0), 0)
      : 0;

    const hasOverride = isRead
      ? Number(current.chars || 0) > sumChars || displayM > sumMins
      : displayM > Math.round(sumSecs / 60);

    const defaultDateStr =
      s.length > 0 ? s[0].date : current.date || new Date().toISOString();
    const desc =
      current.description || current.contentTitleNative || "Unknown Title";

    if (s.length > 1 && !hasOverride) {
      return s.map((sess: any) => {
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
            ? current.mediaId || "web-reading"
            : current.mediaData?.channelId || current.channelId || "web-video",
          mediaData: current.mediaData || {},
        };
        if (isRead) {
          payload.volume = Math.max(1, Number(current.volume || 1));
        }
        return payload;
      });
    } else {
      const payload: any = {
        type,
        description: type === "video" ? stripVideoTitle(desc) : desc,
        time: displayM,
        date: new Date(defaultDateStr).toISOString(),
        chars: isRead ? current.chars || 0 : 0,
        episodes: 0,
        pages: 0,
        unknownDate: false,
        mediaId: isRead
          ? current.mediaId || "web-reading"
          : current.mediaData?.channelId || current.channelId || "web-video",
        mediaData: current.mediaData || {},
      };
      if (isRead) {
        payload.volume = Math.max(1, Number(current.volume || 1));
      }
      return [payload];
    }
  }

  /* ── Log Send / Delete Actions ──────────────────────────────── */
  async function handleSend() {
    sending = true;
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const current = q.find((x: any) => x.id === item.id) as any;
    if (!current) {
      sending = false;
      return;
    }

    if (type === "video") {
      try {
        const cId = current.channelId || current.mediaData?.channelId;
        const cTitle =
          current.mediaData?.channelTitle ||
          current.channelTitle ||
          current.contentTitleNative;
        if (cId || cTitle) {
          const media = await resolveVideoChannelMedia({
            channelId: cId,
            channelTitle: cTitle,
          });
          current.mediaData = { ...current.mediaData, ...media };
        }
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
          return;
        }
      }
      onStatus("✓ Log sent");
      await qStorage.setValue(q.filter((x: any) => x.id !== item.id) as any);
      onRefresh();
    } catch (e: any) {
      onStatus(`⚠ Error: ${e.message || e}`, true);
      sending = false;
    }
  }

  async function handleRemove() {
    const ok = await onConfirm(
      "Delete Log",
      "Are you sure you want to delete this log?",
    );
    if (!ok) return;

    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    await qStorage.setValue(q.filter((x: any) => x.id !== item.id) as any);
    onStatus("✓ Log removed");
    onRefresh();
  }
</script>

<div class="qi" class:sending data-type={type}>
  <!-- Top row (title + spinners/volume) -->
  <div class="qi-row top-row">
    <div class="qi-search-wrap">
      {#if isRead}
        <svg class="qi-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      {/if}
      <input
        class="qi-desc"
        class:searchable={isRead}
        type="text"
        value={titleValue}
        placeholder={isRead ? "Search AniList..." : "Video Title"}
        oninput={handleTitleInput}
        onchange={handleTitleChange}
        onblur={handleBlur}
        onfocus={handleFocus}
        aria-label="Item title"
      />
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
          <span
            class="qi-link-status video-matched"
            title="Matched"
            style="cursor:default; color:var(--color-success); position:absolute; right:8px; top:50%; transform:translateY(-50%)"
            >✓</span
          >
        {/if}
      {/if}

      {#if isRead}
        <SearchDropdown
          bind:this={searchDropdown}
          onSelect={handleSearchSelect}
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
            onchange={handleCharsChange}
            aria-label="Character count"
          />
          <span style="font-size:10px; color:var(--color-text-muted); padding-right:2px;"
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
          onchange={handleMinsChange}
          aria-label="Minutes duration"
        />
        <span style="font-size:10px; color:var(--color-text-muted); padding-right:2px;"
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
      aria-label="Log date"
    />
  </div>

  <!-- Collapsible Sessions list -->
  {#if sessions.length > 1}
    <div class="qi-sessions">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <button
        type="button"
        class="session-summary"
        onclick={toggleSessionsOpen}
        style="list-style: none; background: none; border: none; text-align: left; width: 100%; padding: 0; cursor: pointer; display: block;"
      >
        {isSessionsOpen ? "▾" : "▸"} Sessions ({sessions.length})
      </button>

      {#if isSessionsOpen}
        <div class="session-list">
          {#each sessions as session, i}
            <div class="qi-session">
              <span class="qi-session-num">S{i + 1}</span>

              {#if isRead}
                <input
                  class="qi-session-chars"
                  type="number"
                  value={session.chars || 0}
                  onchange={(e) =>
                    handleSessionChange(
                      i,
                      "chars",
                      (e.target as HTMLInputElement).value,
                    )}
                  aria-label={`Session ${i + 1} characters`}
                />
                <span style="font-size:10px; color:var(--color-text-muted);">chars</span>
              {/if}

              <input
                class="qi-session-mins"
                type="number"
                value={Math.max(1, Math.round(session.secs / 60))}
                min="1"
                onchange={(e) =>
                  handleSessionChange(
                    i,
                    "mins",
                    (e.target as HTMLInputElement).value,
                  )}
                aria-label={`Session ${i + 1} minutes`}
              />
              <span style="font-size:10px; color:var(--color-text-muted);">min</span>

              <input
                type="datetime-local"
                class="qi-session-date-input"
                value={toLocalDT(session.date)}
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
                title="Remove session"
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
</style>
