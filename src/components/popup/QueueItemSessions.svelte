<!--
  ── QueueItemSessions.svelte ─────────────────────────────────────────────────
  Collapsible session list within a queue item. Shows individual
  tracking sessions with editable time, chars, and date fields.
-->
<script lang="ts">
  import type { QueueSession } from '@/lib/types';
  import { toLocalDT } from '@/lib/utils/time';

  interface Props {
    sessions: QueueSession[];
    itemId: string;
    isReading: boolean;
    onRemoveSession: (sessionId: string) => void;
    onSessionChange: () => void;
  }

  let { sessions, itemId, isReading, onRemoveSession, onSessionChange }: Props = $props();

  /* Track collapsed state in localStorage, reactive to itemId changes */
  let isOpen = $state(true);
  $effect(() => { isOpen = localStorage.getItem(`nt-sess-closed-${itemId}`) !== '1'; });

  function toggleOpen() {
    isOpen = !isOpen;
    localStorage.setItem(`nt-sess-closed-${itemId}`, isOpen ? '0' : '1');
  }
</script>

{#if sessions.length > 1}
<div class="sessions-container">
  <button class="session-summary" onclick={toggleOpen}>
    {isOpen ? '▾' : '▸'} Sessions ({sessions.length})
  </button>

  {#if isOpen}
  <div class="session-list">
    {#each sessions as session, i}
    <div class="session-row" data-session-id={session.id}>
      <span class="session-dot"></span>
      <span class="session-label">S{i + 1}</span>

      {#if isReading}
        <input
          class="ghost-num chars"
          type="number"
          value={session.chars || 0}
          oninput={onSessionChange}
        />
        <span class="unit">chars</span>
      {/if}

      <input
        class="ghost-num mins"
        type="number"
        min="1"
        value={Math.max(1, Math.round(session.secs / 60))}
        oninput={onSessionChange}
      />
      <span class="unit">min</span>

      <input
        class="ghost-date"
        type="datetime-local"
        value={toLocalDT(session.date)}
      />

      <button
        class="remove-btn"
        title="Remove"
        onclick={() => onRemoveSession(session.id)}
      >×</button>
    </div>
    {/each}
  </div>
  {/if}
</div>
{/if}

<style>
  .sessions-container {
    margin-top: 6px; border-top: 1px solid var(--color-bdr, #1c2333);
    padding-top: 5px;
  }
  .session-summary {
    font-family: var(--font-mono, monospace); font-size: 11px; font-weight: bold;
    color: var(--color-muted, #5a6a85); cursor: pointer; user-select: none;
    padding-bottom: 6px; border: none; background: none;
    transition: color .15s; width: 100%; text-align: left;
  }
  .session-summary:hover { color: var(--color-text-primary, #dde4f0); }
  .session-list { display: flex; flex-direction: column; gap: 3px; }
  .session-row {
    display: flex; align-items: center; font-size: 10px;
    color: var(--color-dim, #3a4a60); gap: 0;
  }
  .session-dot {
    width: 3px; height: 3px; border-radius: 50%;
    background: var(--color-bdr2, #242d42); flex-shrink: 0; margin-right: 6px;
  }
  .session-label {
    font-family: var(--font-mono, monospace); font-size: 9px;
    color: rgba(240,180,41,0.6); font-weight: bold;
    flex-shrink: 0; margin-right: 5px;
  }
  .ghost-num {
    background: none; border: none; outline: none;
    font-family: var(--font-mono, monospace); font-size: 10px;
    color: var(--color-text-primary, #dde4f0); font-weight: bold;
    padding: 0; margin: 0; text-align: right;
    cursor: text; border-radius: 2px; flex-shrink: 0;
    appearance: textfield; -moz-appearance: textfield;
    transition: background .15s;
  }
  .ghost-num::-webkit-outer-spin-button,
  .ghost-num::-webkit-inner-spin-button { -webkit-appearance: none; }
  .ghost-num:hover { background: rgba(240,180,41,.09); }
  .ghost-num:focus { background: rgba(240,180,41,.14); outline: none; }
  .ghost-num.mins { width: 20px; }
  .ghost-num.chars { width: 40px; color: var(--color-amber, #f0b429); }
  .unit {
    font-size: 10px; color: var(--color-dim, #3a4a60);
    margin-left: 3px; margin-right: 5px; flex-shrink: 0;
  }
  .ghost-date {
    background: none; border: none; outline: none;
    font-family: var(--font-mono, monospace); font-size: 10px;
    color: var(--color-muted, #5a6a85);
    padding: 0; margin: 0; cursor: text; border-radius: 2px;
    width: 155px; flex-shrink: 0; transition: background .15s, color .15s;
    color-scheme: dark; text-align: right; margin-left: auto;
  }
  .ghost-date:hover { background: rgba(255,255,255,.04); color: var(--color-text-primary, #dde4f0); }
  .ghost-date:focus { background: rgba(255,255,255,.06); color: var(--color-text-primary, #dde4f0); outline: none; }
  .remove-btn {
    background: none; border: none; color: var(--color-red, #f0706a);
    cursor: pointer; padding: 0 4px; font-size: 12px;
  }
</style>
