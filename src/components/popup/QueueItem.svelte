<!--
  ── QueueItem.svelte (Popup) ─────────────────────────────────────────────────
  A single queue item card in the popup. Matches the original popup/main.ts
  buildItem() output exactly: editable ghost-num inputs for chars/mins/vol,
  ghost-date for datetime, and AniList search dropdown for reading items.
-->
<script lang="ts">
  import { videoQueueStorage, readingQueueStorage } from '@/lib/storage/queues';
  import { configStorage } from '@/lib/storage/config';
  import { resolveVideoChannelMedia, submitLog } from '@/lib/api/nihongotracker';
  import { searchAniList, type AniListSearchResult } from '@/lib/api/anilist';
  import { stripVideoTitle, escapeHtml } from '@/lib/utils/text-parsing';
  import { toLocalDT } from '@/lib/utils/time';
  import QueueItemSessions from './QueueItemSessions.svelte';
  import SearchDropdown from './SearchDropdown.svelte';
  import type { QueuedVideoLog, QueuedReadingLog } from '@/lib/types';

  interface Props {
    item: any;
    type: 'video' | 'reading';
    onStatusMessage: (msg: string, err?: boolean) => void;
    onConfirm: (title: string, msg: string) => Promise<boolean>;
    onRefresh: () => void;
  }

  let { item, type, onStatusMessage, onConfirm, onRefresh }: Props = $props();

  const isRead = $derived(type === 'reading');
  let sending = $state(false);
  let searchDropdown: SearchDropdown | undefined = $state(undefined);

  /* ── Computed display values ──────────────────────────────────── */
  const rawTitle = $derived(item.description || item.contentTitleNative || 'Unknown Title');
  const displayTitle = $derived(type === 'video' ? stripVideoTitle(rawTitle) : rawTitle);
  const displayMins = $derived(isRead ? Math.max(1, Math.round((item.time || 0) / 60)) : (item.time || 0));
  const isLinked = $derived(
    isRead
      ? !!(item.mediaId && item.mediaId !== 'web-reading')
      : !!((item.channelId && item.channelId !== 'web-video') || (item.mediaData?.channelId && item.mediaData.channelId !== 'web-video'))
  );

  let channelName = $derived(
    isRead
      ? `${item.readerName || 'Reader'} \u2022 ${item.originalTitle || item.description || item.contentTitleNative || ''}`
      : (item.channelTitle || item.contentTitleNative || 'YouTube')
  );
  let urlDisplay = $derived(
    isRead ? '' : `\u2022 ${item.contentTitleEnglish || item.channelId || ''}`
  );

  const sessions = $derived(item.sessions ?? []);
  const defaultDateStr = $derived(sessions.length > 0 ? sessions[0].date : (item.date || new Date().toISOString()));

  /* ── Title editing + search ──────────────────────────────────── */
  let titleValue = $state('');
  $effect(() => { titleValue = displayTitle; });
  let debounceTimer: any;

  function handleTitleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    titleValue = val;

    if (isRead) {
      if (item.mediaId && item.mediaId !== 'web-reading') {
        item.mediaId = 'web-reading';
        item.mediaData = undefined;
      }
      clearTimeout(debounceTimer);
      if (val.trim().length < 2) { searchDropdown?.close(); return; }
      debounceTimer = setTimeout(() => searchDropdown?.search(val.trim()), 500);
    }
  }

  function handleSearchSelect(result: AniListSearchResult) {
    const native = result.title?.contentTitleNative || result.contentTitleNative || 'Unknown';
    titleValue = native;
    item.mediaData = {
      contentId: result.contentId,
      contentTitleNative: native,
      contentTitleEnglish: result.title?.contentTitleEnglish || result.contentTitleEnglish,
      contentTitleRomaji: result.title?.contentTitleRomaji || result.contentTitleRomaji,
      contentImage: result.coverImage || result.contentImage,
      coverImage: result.coverImage || result.contentImage,
      chapters: result.chapters,
      volumes: result.volumes,
    };
    item.mediaId = result.contentId;
    item.description = native;

    readingQueueStorage.getValue().then(q => {
      const idx = q.findIndex((x: any) => x.id === item.id);
      if (idx > -1) { q[idx] = item; readingQueueStorage.setValue(q); }
    });
  }

  /* ── Actions ─────────────────────────────────────────────────── */
  async function handleSend() {
    sending = true;
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const current = q.find((x: any) => x.id === item.id);
    if (!current) { sending = false; return; }

    if (type === 'video') {
      try { await ensureVideoMediaData(current); } catch (_e) {}
    }

    const payloads = buildPayloads(current);
    let success = true, lastError = '', lastErrorCode = 0;

    for (const p of payloads) {
      const res = await submitLog(p);
      if (res?.success) { /* ok */ }
      else { success = false; lastError = res?.error || 'Unknown error'; lastErrorCode = res?.status || 0; }
    }

    if (success) {
      await qStorage.setValue(q.filter((x: any) => x.id !== item.id) as any);
      onStatusMessage('✓ Sent');
      onRefresh();
    } else {
      sending = false;
      const errText = lastErrorCode ? `⚠ Failed [${lastErrorCode}]: ${lastError}` : `⚠ Failed: ${lastError}`;
      onStatusMessage(errText, true);
    }
  }

  async function handleDelete() {
    const ok = await onConfirm('Delete Log', 'Are you sure you want to delete this pending log?');
    if (!ok) return;
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    await qStorage.setValue(q.filter((x: any) => x.id !== item.id) as any);
    onRefresh();
  }

  async function handleRemoveSession(sessionId: string) {
    const ok = await onConfirm('Delete Session', 'Are you sure you want to delete this session?');
    if (!ok) return;
    const qStorage = isRead ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const idx = q.findIndex((x: any) => x.id === item.id);
    if (idx === -1) return;
    const entry = q[idx] as any;
    entry.sessions = (entry.sessions ?? []).filter((s: any) => s.id !== sessionId);
    const totalSecs = entry.sessions.reduce((a: number, b: any) => a + b.secs, 0);
    if (isRead) {
      entry.time = totalSecs;
      entry.chars = entry.sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0);
    } else {
      entry.time = Math.round(totalSecs / 60);
    }
    await qStorage.setValue(q);
    onRefresh();
  }

  /* ── Helpers ─────────────────────────────────────────────────── */
  async function ensureVideoMediaData(item: any) {
    const channelId = item.channelId || item.mediaData?.channelId;
    const channelTitle = item.mediaData?.channelTitle || item.channelTitle || item.contentTitleNative;
    if (item.mediaData?.channelImage && item.mediaData?.channelDescription) return;
    if (!channelId && !channelTitle) return;
    const media = await resolveVideoChannelMedia({ channelId, channelTitle });
    item.mediaData = {
      ...(item.mediaData || {}),
      channelId: media.channelId || channelId || 'web-video',
      channelTitle: media.channelTitle || channelTitle || item.contentTitleNative,
      ...(media.channelImage ? { channelImage: media.channelImage } : {}),
      ...(media.channelDescription ? { channelDescription: media.channelDescription } : {}),
    };
  }

  function buildPayloads(item: any) {
    const desc = titleValue || (isRead ? item.mediaData?.contentTitleNative || item.contentTitleNative : item.contentTitleNative);
    const apiTitle = type === 'video' ? stripVideoTitle(desc) : desc;
    const base: any = { type, description: apiTitle, episodes: 0, pages: 0, unknownDate: false };
    if (isRead) {
      base.mediaId = item.mediaId || 'web-reading';
      base.volume = Math.max(1, Number(item.volume || 1));
      base.mediaData = item.mediaData || { contentId: "web-reading", contentTitleNative: item.contentTitleNative };
    } else {
      base.mediaId = item.mediaData?.channelId || item.channelId || 'web-video';
      base.mediaData = item.mediaData || { channelId: item.channelId || "web-video", channelTitle: item.contentTitleNative };
    }
    return [{ ...base, time: displayMins, date: new Date(defaultDateStr).toISOString(), chars: item.chars || 0 }];
  }
</script>

<!-- Queue item card - matches original popup exactly -->
<div class="qi" class:sending data-type={type}>
  <!-- Title row -->
  <div class="qi-title-row">
    <div class="qi-search-wrap">
      {#if isRead}
        <svg class="qi-search-icon" viewBox="0 0 24 24">
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
        onblur={() => searchDropdown?.close()}
        onfocus={() => { if (isRead) searchDropdown?.showIfHasResults(); }}
      />
      {#if isRead}
        <SearchDropdown bind:this={searchDropdown} onSelect={handleSearchSelect} />
      {/if}
    </div>
    {#if isLinked}
      <span class="qi-link-status" title="Matched">✓</span>
    {/if}
    <button class="qi-del" title="Remove" onclick={handleDelete}>×</button>
  </div>

  <!-- Meta row with EDITABLE inputs (matches original ghost-num pattern) -->
  <div class="qi-meta-row" style="flex-wrap:wrap; gap:0;">
    {#if isRead}
      <input class="ghost-num num-chars qi-chars-num" type="number" min="0" value={item.chars || 0} />
      <span class="unit-lbl">chars</span>
    {/if}
    <input class="ghost-num qi-time-num" type="number" min="1" value={displayMins} title="Total minutes" />
    <span class="unit-lbl">min</span>
    {#if isRead}
      <input class="ghost-num num-vol qi-vol" type="number" min="1" value={Math.max(1, Number(item.volume || 1))} title="Volume" />
      <span class="unit-lbl">vol</span>
    {/if}
    <span class="qi-meta-sep">·</span>
    <div class="qi-mid">
      <span class="qi-channel" title="{channelName} {urlDisplay}">{channelName} {urlDisplay}</span>
    </div>
    <div style="flex-basis: 100%; height: 0;"></div>
    <input class="ghost-date qi-date" type="datetime-local" value={toLocalDT(defaultDateStr)} style="text-align:left; margin-left:0;" />
    <button class="qi-send" onclick={handleSend} disabled={sending} style="margin-left:auto;">Send</button>
  </div>

  <!-- Sessions -->
  <QueueItemSessions
    sessions={sessions}
    itemId={item.id}
    isReading={isRead}
    onRemoveSession={handleRemoveSession}
    onSessionChange={() => {}}
  />
</div>
