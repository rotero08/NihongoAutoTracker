<!--
  ── DebugTab.svelte ──────────────────────────────────────────────────────────
  Debug log viewer. Only visible when Advanced mode is enabled.
  Matches the original settings/index.html #tab-debug section exactly.
-->
<script lang="ts">
  import { debugLogStorage } from '@/lib/storage/debug';
  import type { DebugLogEntry } from '@/lib/types';

  interface Props { onStatus: (msg: string, err?: boolean) => void; }
  let { onStatus }: Props = $props();

  let logs: DebugLogEntry[] = $state([]);

  export async function load() {
    logs = await debugLogStorage.getValue();
  }

  async function clearLogs() {
    if (!confirm('Are you sure you want to clear all debug logs?')) return;
    await debugLogStorage.setValue([]);
    await load();
    onStatus('✓ Logs Cleared');
  }

  async function refresh() {
    await load();
    onStatus('✓ Refreshed');
  }

  load();
</script>

<div class="tab-head">
  <h2>System Debug Logs</h2>
  <div class="tab-actions">
    <button id="clear-debug-btn" class="btn btn-ghost btn-sm" onclick={clearLogs}>Clear Logs</button>
    <button id="refresh-debug-btn" class="btn btn-amber btn-sm" onclick={refresh}>Refresh</button>
  </div>
</div>
<p class="hint" style="margin-top:0">Logs are continually collected locally to help diagnose tracking or API issues.</p>

<div class="debug-container" id="debug-logs-list">
  {#if logs.length === 0}
    <div class="empty-state">No debug logs available.</div>
  {:else}
    {#each logs as log}
      <div class="debug-log {log.level.toLowerCase()}">
        <div>
          <span class="debug-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
          <span class="debug-src">{log.source}</span>
          <strong>{log.message}</strong>
        </div>
        {#if log.data}
          <div class="debug-data">{log.data}</div>
        {/if}
      </div>
    {/each}
  {/if}
</div>
