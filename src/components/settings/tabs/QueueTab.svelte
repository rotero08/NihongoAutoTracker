<!--
  ── QueueTab.svelte ──────────────────────────────────────────────────────────
  Full queue management in settings. Includes filtering tabs, bulk actions,
  queue items with full editing, and EOD auto-send toggle.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { videoQueueStorage, readingQueueStorage } from '@/lib/storage/queues';
  import { configStorage } from '@/lib/storage/config';
  import { submitLog, resolveVideoChannelMedia } from '@/lib/api/nihongotracker';
  import { searchAniList } from '@/lib/api/anilist';
  import { stripVideoTitle, parseTitleForUI, escapeHtml } from '@/lib/utils/text-parsing';
  import { toLocalDT } from '@/lib/utils/time';
  import type { QueuedVideoLog, QueuedReadingLog, QueueSession } from '@/lib/types';

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
    onQueueCountChange: (count: number) => void;
  }
  let { onStatus, onQueueCountChange }: Props = $props();

  let videoQueue: any[] = $state([]);
  let readingQueue: any[] = $state([]);
  let currentFilter = $state('all');
  let autoSendEOD = $state(false);

  const filteredReading = $derived(currentFilter === 'all' || currentFilter === 'reading' ? readingQueue : []);
  const filteredVideo = $derived(currentFilter === 'all' || currentFilter === 'video' ? videoQueue : []);
  const total = $derived(videoQueue.length + readingQueue.length);

  export async function load() {
    videoQueue = await videoQueueStorage.getValue();
    readingQueue = await readingQueueStorage.getValue();
    const cfg = await configStorage.getValue() as any;
    autoSendEOD = cfg.autoSendEndOfDay ?? false;
    onQueueCountChange(total);
  }

  async function toggleEOD() {
    const cfg = await configStorage.getValue() as any;
    await configStorage.setValue({ ...cfg, autoSendEndOfDay: autoSendEOD });
    onStatus(autoSendEOD ? '✓ EOD auto-send enabled' : '✓ EOD auto-send disabled');
  }

  async function removeItem(id: string, type: 'video' | 'reading') {
    const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    await qStorage.setValue(q.filter((x: any) => x.id !== id) as any);
    await load();
  }

  async function sendItem(id: string, type: 'video' | 'reading') {
    const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const item = q.find((x: any) => x.id === id);
    if (!item) return;

    /* Enrich video media data if needed */
    if (type === 'video') {
      try {
        const cId = (item as any).channelId || (item as any).mediaData?.channelId;
        const cTitle = (item as any).mediaData?.channelTitle || (item as any).channelTitle || item.contentTitleNative;
        if (cId || cTitle) {
          const media = await resolveVideoChannelMedia({ channelId: cId, channelTitle: cTitle });
          (item as any).mediaData = { ...(item as any).mediaData, ...media };
        }
      } catch {}
    }

    /* Enrich reading media data if needed */
    if (type === 'reading') {
      try {
        const rItem = item as any;
        if (!rItem.mediaId || !rItem.mediaData?.contentId) {
          const results = await searchAniList(item.contentTitleNative, 5);
          if (results.length > 0) {
            const media = results[0];
            rItem.mediaData = {
              contentId: media.contentId,
              contentTitleNative: media.title?.contentTitleNative ?? media.contentTitleNative,
              contentTitleEnglish: media.title?.contentTitleEnglish ?? media.contentTitleEnglish,
              contentTitleRomaji: media.title?.contentTitleRomaji ?? media.contentTitleRomaji,
              contentImage: media.contentImage,
              coverImage: media.coverImage,
            };
            rItem.mediaId = media.contentId;
          }
        }
      } catch {}
    }

    const isRead = type === 'reading';
    const desc = isRead ? (item as any).mediaData?.contentTitleNative || item.contentTitleNative : stripVideoTitle(item.contentTitleNative);
    const mins = isRead ? Math.max(1, Math.round(((item as any).time || 0) / 60)) : ((item as any).time || 0);

    const payload: any = {
      type,
      description: desc,
      time: mins,
      date: item.date || new Date().toISOString(),
      chars: isRead ? ((item as any).chars || 0) : 0,
      episodes: 0,
      pages: 0,
      unknownDate: false,
      mediaId: isRead ? ((item as any).mediaId || 'web-reading') : ((item as any).mediaData?.channelId || (item as any).channelId || 'web-video'),
      mediaData: (item as any).mediaData || {},
    };
    if (isRead) payload.volume = Math.max(1, Number((item as any).volume || 1));

    const result = await submitLog(payload);
    if (result?.success) {
      onStatus('✓ Log sent');
      await removeItem(id, type);
    } else {
      const errText = result?.status ? `⚠ Failed [${result.status}]: ${result.error}` : `⚠ Failed: ${result?.error}`;
      onStatus(errText, true);
    }
  }

  async function sendAll() {
    const cfg = await configStorage.getValue() as any;
    if (cfg.warnSendAll !== false) {
      if (!confirm('Are you sure you want to send all pending logs?')) return;
    }
    const allItems: { id: string; type: 'video' | 'reading' }[] = [
      ...filteredReading.map((r: any) => ({ id: r.id, type: 'reading' as const })),
      ...filteredVideo.map((v: any) => ({ id: v.id, type: 'video' as const })),
    ];
    for (const { id, type } of allItems) await sendItem(id, type);
  }

  async function clearAll() {
    if (!confirm('Are you sure you want to clear all pending logs?')) return;
    if (currentFilter === 'all' || currentFilter === 'video') await videoQueueStorage.setValue([]);
    if (currentFilter === 'all' || currentFilter === 'reading') await readingQueueStorage.setValue([]);
    await load();
  }

  async function removeSession(itemId: string, sessionId: string, type: 'video' | 'reading') {
    if (!confirm('Delete this session?')) return;
    const qStorage = type === 'reading' ? readingQueueStorage : videoQueueStorage;
    const q = await qStorage.getValue();
    const idx = q.findIndex((x: any) => x.id === itemId);
    if (idx === -1) return;
    const entry = q[idx] as any;
    entry.sessions = (entry.sessions ?? []).filter((s: any) => s.id !== sessionId);
    const totalSecs = entry.sessions.reduce((a: number, b: any) => a + b.secs, 0);
    if (type === 'reading') {
      entry.time = totalSecs;
      entry.chars = entry.sessions.reduce((a: number, b: any) => a + (b.chars || 0), 0);
    } else {
      entry.time = Math.round(totalSecs / 60);
    }
    await qStorage.setValue(q);
    await load();
  }

  onMount(() => {
    load();
    /* Watch for external storage changes */
    readingQueueStorage.watch(() => load());
    videoQueueStorage.watch(() => load());
  });
</script>

<div class="tab-head">
  <h2>Pending Logs</h2>
  {#if total > 0}
  <div class="tab-actions" id="queue-actions">
    <button id="send-all-btn" class="btn btn-amber btn-sm" onclick={sendAll}>Send All</button>
    <button id="clear-all-btn" class="btn btn-ghost btn-sm" onclick={clearAll}>Clear All</button>
  </div>
  {/if}
</div>

<!-- Auto-send EOD toggle in amber box -->
<div class="field" style="margin-bottom: 16px; background: rgba(240,180,41,.05); border: 1px solid rgba(240,180,41,.2); border-radius: 6px; padding: 12px 16px;">
  <div class="tooltip-wrap" style="display:flex; width:100%;">
    <label class="toggle" style="flex:1;">
      <input type="checkbox" id="auto-send-end-of-day" class="toggle-chk" bind:checked={autoSendEOD} onchange={toggleEOD} />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      Automatically send today's queued logs at end of day
    </label>
    <span class="tooltip">This would also send unmatched media</span>
  </div>
</div>

<!-- Filter tabs -->
<div class="queue-tabs">
  {#each ['all', 'video', 'reading'] as filter}
    <button class="q-tab" class:active={currentFilter === filter} onclick={() => currentFilter = filter}>
      {filter.charAt(0).toUpperCase() + filter.slice(1)}
    </button>
  {/each}
</div>

<!-- Info box matching original -->
<div class="info-box">
  <strong>ⓘ Auto-Sum & Overrides:</strong> Editing individual sessions updates the total automatically. If you manually set the <em>Total</em> higher than the sum, the Total takes priority and sends as one combined log.
</div>

<!-- Queue items -->
<div id="queue-list">
  {#if total === 0}
    <div class="empty-state">Queue is empty</div>
  {:else}
    {#each filteredReading as item (item.id)}
      <div class="qi" data-type="reading">
        <div class="qi-row top-row">
          <div class="qi-search-wrap">
            <svg class="qi-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input class="qi-desc searchable" type="text" value={item.description || item.contentTitleNative} />
            {#if item.mediaId && item.mediaId !== 'web-reading'}
              <span class="qi-link-status" title="Matched">✓</span>
            {/if}
          </div>
        </div>
        <div class="qi-row mid-row" style="flex-wrap:wrap; gap:0;">
          <input class="qi-session-chars" type="number" min="0" value={item.chars || 0} style="width:55px;" />
          <span style="font-size:10px; color:var(--muted); margin:0 3px 0 2px;">chars</span>
          <input class="qi-session-mins" type="number" min="1" value={Math.max(1, Math.round((item.time || 0) / 60))} style="width:35px;" />
          <span style="font-size:10px; color:var(--muted); margin:0 3px 0 2px;">min</span>
          <span style="font-size:11px; color:var(--amber); font-weight:700; margin-left:6px;">Vol {Math.max(1, Number(item.volume || 1))}</span>
          <span style="margin: 0 5px; color:var(--muted);">·</span>
          <span style="font-size:10px; color:var(--muted);">{item.readerName || 'Reader'}</span>
        </div>
        <div class="qi-row mid-row" style="gap:0;">
          <input class="qi-date-input" type="datetime-local" value={toLocalDT(item.date)} style="text-align:left;" />
        </div>
        {#if item.sessions?.length > 1}
          <details class="qi-sessions">
            <summary class="session-summary">Sessions ({item.sessions.length})</summary>
            <div class="session-list">
              {#each item.sessions as session, i}
                <div class="qi-session">
                  <span class="qi-session-num">S{i+1}</span>
                  <input class="qi-session-chars" type="number" value={session.chars || 0} />
                  <span>chars</span>
                  <input class="qi-session-mins" type="number" value={Math.max(1, Math.round(session.secs / 60))} min="1" />
                  <span>min</span>
                  <input class="qi-session-date-input" type="datetime-local" value={toLocalDT(session.date)} />
                  <button class="qi-session-remove" onclick={() => removeSession(item.id, session.id, 'reading')}>×</button>
                </div>
              {/each}
            </div>
          </details>
        {/if}
        <div class="qi-row bot-row" style="margin-top:8px;">
          <button class="btn btn-amber btn-sm" onclick={() => sendItem(item.id, 'reading')}>Send</button>
          <button class="btn btn-ghost btn-sm" onclick={() => { if(confirm('Delete this log?')) removeItem(item.id, 'reading'); }}>Remove</button>
        </div>
      </div>
    {/each}

    {#each filteredVideo as item (item.id)}
      <div class="qi" data-type="video">
        <div class="qi-row top-row">
          <div class="qi-search-wrap">
            <input class="qi-desc" type="text" value={stripVideoTitle(item.description || item.contentTitleNative)} />
            {#if (item.channelId && item.channelId !== 'web-video') || (item.mediaData?.channelId && item.mediaData.channelId !== 'web-video')}
              <span class="qi-link-status" title="Matched" style="cursor:default;">✓</span>
            {/if}
          </div>
        </div>
        <div class="qi-row mid-row" style="flex-wrap:wrap; gap:0;">
          <input class="qi-session-mins" type="number" min="1" value={item.time || 0} style="width:35px;" />
          <span style="font-size:10px; color:var(--muted); margin:0 3px 0 2px;">min</span>
          <span style="margin: 0 5px; color:var(--muted);">·</span>
          <span style="font-size:10px; color:var(--muted);">{item.channelTitle || item.contentTitleNative || 'YouTube'}</span>
        </div>
        <div class="qi-row mid-row" style="gap:0;">
          <input class="qi-date-input" type="datetime-local" value={toLocalDT(item.date)} style="text-align:left;" />
        </div>
        {#if item.sessions?.length > 1}
          <details class="qi-sessions">
            <summary class="session-summary">Sessions ({item.sessions.length})</summary>
            <div class="session-list">
              {#each item.sessions as session, i}
                <div class="qi-session">
                  <span class="qi-session-num">S{i+1}</span>
                  <input class="qi-session-mins" type="number" value={Math.max(1, Math.round(session.secs / 60))} min="1" />
                  <span>min</span>
                  <input class="qi-session-date-input" type="datetime-local" value={toLocalDT(session.date)} />
                  <button class="qi-session-remove" onclick={() => removeSession(item.id, session.id, 'video')}>×</button>
                </div>
              {/each}
            </div>
          </details>
        {/if}
        <div class="qi-row bot-row" style="margin-top:8px;">
          <button class="btn btn-amber btn-sm" onclick={() => sendItem(item.id, 'video')}>Send</button>
          <button class="btn btn-ghost btn-sm" onclick={() => { if(confirm('Delete this log?')) removeItem(item.id, 'video'); }}>Remove</button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .qi-session-remove { background: none; border: none; color: var(--red); cursor: pointer; font-size: 14px; padding: 2px; }
</style>

