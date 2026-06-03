<!--
  ── QueueItemSessions.svelte ─────────────────────────────────────────────────
  Collapsible session list within a queue item. Shows individual
  tracking sessions with editable time, chars, and date fields.
-->
<script lang="ts">
  import type { QueueSession } from "@/lib/types";
  import { toLocalDT } from "@/lib/utils/time";
  import { storage } from "wxt/utils/storage";
  import { onMount } from "svelte";
  import { SESS_CLOSED_PREFIX } from "@/lib/constants";

  interface Props {
    sessions: QueueSession[];
    itemId: string;
    isReading: boolean;
    isStremio?: boolean;
    onRemoveSession: (sessionId: string) => void;
    onSessionChange: (sessionIdx: number, field: string, val: any) => void;
    onSendSession?: (sessionIdx: number) => void;
  }

  let { sessions, itemId, isReading, isStremio = false, onRemoveSession, onSessionChange, onSendSession }: Props =
    $props();

  /* Track collapsed state in localStorage, reactive to itemId changes */
  let isOpen = $state(true);

  onMount(async () => {
    const val = await storage.getItem(`${SESS_CLOSED_PREFIX}${itemId}`);
    isOpen = val !== "1";
  });

  async function toggleOpen() {
    isOpen = !isOpen;
    await storage.setItem(`${SESS_CLOSED_PREFIX}${itemId}`, isOpen ? "0" : "1");
  }

  function rememberEditableStart(e: FocusEvent) {
    const input = e.currentTarget as HTMLInputElement;
    input.dataset.editStart = input.value;
    input.dataset.committed = "true"; // Default to true so click-outside saves
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
      input.value = input.dataset.editStart ?? input.defaultValue;
      input.blur();
    }
  }

  function handleEditableBlur(e: FocusEvent, sessionIdx: number, field: string) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.dataset.committed === "true") {
      onSessionChange(sessionIdx, field, input.value);
    } else {
      input.value = input.dataset.editStart ?? input.defaultValue;
    }
  }

  /* Accommodate the box size of all session elements to match the largest row value */
  let maxCharsLen = $derived(
    sessions.reduce((max, s) => Math.max(max, String(s.chars || 0).length), 1)
  );
  let maxMinsLen = $derived(
    sessions.reduce((max, s) => Math.max(max, String(Math.max(1, Math.round(s.secs / 60))).length), 1)
  );
</script>

{#if sessions.length > 1}
  <div class="sessions-container">
    <button class="session-summary" onclick={toggleOpen}>
      {isOpen ? "▾" : "▸"} {isStremio ? "Episodes" : "Sessions"} ({sessions.length})
    </button>

    {#if isOpen}
      <div class="session-list">
        {#each sessions as session, i}
          <div class="session-row" class:stremio-session-row={isStremio} data-session-id={session.id}>
            <span class="session-dot"></span>
            <span class="session-label">
              {isStremio ? i + 1 : `s${i + 1}`}
            </span>

            {#if isStremio}
              <span class="stremio-static-meta">
                Season {session.season || 1} · Ep {session.episode || 1}
              </span>
              <span style="font-family: var(--font-mono, monospace); font-size: 10px; color: var(--color-text-muted, #5a6a85); margin-left: 2px; margin-right: 4px;">·</span>
            {/if}

            {#if isReading}
              <input
                class="ghost-num chars"
                type="number"
                value={session.chars || 0}
                style="width: {Math.min(6, maxCharsLen)}ch;"
                onfocus={rememberEditableStart}
                onkeydown={handleEditableKeydown}
                onblur={(e) => handleEditableBlur(e, i, "chars")}
              />
              <span class="unit">chars</span>
            {/if}

            <input
              class="ghost-num mins"
              type="number"
              min="1"
              value={Math.max(1, Math.round(session.secs / 60))}
              style="width: {Math.min(4, maxMinsLen)}ch;"
              onfocus={rememberEditableStart}
              onkeydown={handleEditableKeydown}
              onblur={(e) => handleEditableBlur(e, i, "mins")}
            />
            <span class="unit">min</span>

            <button
              type="button"
              class="send-sess-btn"
              title="Log episode individually"
              onclick={() => onSendSession?.(i)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>

            <input
              class="ghost-date"
              type="datetime-local"
              value={toLocalDT(session.date)}
              onfocus={rememberEditableStart}
              onkeydown={handleEditableKeydown}
              onchange={(e) =>
                onSessionChange(
                  i,
                  "date",
                  (e.target as HTMLInputElement).value,
                )}
            />

            <button
              class="remove-btn"
              title="Remove"
              onclick={() => onRemoveSession(session.id)}>×</button
            >
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .sessions-container {
    margin-top: 6px;
    border-top: 1px solid var(--color-border, #1c2333);
    padding-top: 5px;
  }
  .session-summary {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: bold;
    color: var(--color-text-muted, #5a6a85);
    cursor: pointer;
    user-select: none;
    padding-bottom: 6px;
    border: none;
    background: none;
    transition: color 0.15s;
    width: 100%;
    text-align: left;
  }
  .session-summary:hover {
    color: var(--color-text);
  }
  .session-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .session-row {
    display: flex;
    align-items: center;
    font-size: 10px;
    color: var(--color-text-dimmed, #3a4a60);
    gap: 0;
    flex-wrap: nowrap;
    row-gap: 4px;
    min-width: 0;
  }
  .session-row.stremio-session-row {
    flex-wrap: nowrap !important;
  }
  .session-row.stremio-session-row .ghost-date {
    width: 165px !important;
    max-width: 165px !important;
  }
  .session-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--color-border-hover, #242d42);
    flex-shrink: 0;
    margin-right: 6px;
  }
  .session-label {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--color-accent-dim, #b88e33) !important;
    font-weight: bold;
    flex-shrink: 0;
    margin-right: 5px;
  }
  .stremio-static-meta {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--color-text-muted, #5a6a85);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .ghost-num {
    background: none;
    border: none;
    outline: none;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--color-text, #dde4f0);
    font-weight: bold;
    padding: 0;
    margin: 0;
    text-align: right;
    cursor: text;
    border-radius: 2px;
    flex-shrink: 0;
    appearance: textfield;
    -moz-appearance: textfield;
    transition: background 0.15s;
  }
  .ghost-num::-webkit-outer-spin-button,
  .ghost-num::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }
  .ghost-num:hover {
    background: color-mix(in srgb, var(--color-accent) 9%, transparent);
  }
  .ghost-num:focus {
    background: color-mix(in srgb, var(--color-accent) 14%, transparent);
    outline: none;
  }
  .ghost-num.mins {
    width: 20px;
  }
  .ghost-num.chars {
    color: var(--color-accent, #f0b429);
  }
  .unit {
    font-size: 10px;
    color: var(--color-text-dimmed, #3a4a60);
    margin-left: 3px;
    margin-right: 5px;
    flex-shrink: 0;
  }
  .ghost-date {
    background: none;
    border: none;
    outline: none;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--color-text-muted, #5a6a85);
    padding: 0;
    margin: 0;
    cursor: text;
    border-radius: 2px;
    width: 155px;
    flex-shrink: 0;
    transition:
      background 0.15s,
      color 0.15s;
    color-scheme: dark;
    text-align: right;
    margin-left: auto;
  }
  .ghost-date:hover {
    background: rgba(255, 255, 255, 0.04);
    color: var(--color-text, #dde4f0);
  }
  .ghost-date:focus {
    background: rgba(255, 255, 255, 0.06);
    color: var(--color-text, #dde4f0);
    outline: none;
  }
  .remove-btn {
    background: none;
    border: none;
    color: var(--color-error, #f0706a);
    cursor: pointer;
    padding: 0 4px;
    font-size: 12px;
  }
  .send-sess-btn {
    background: none;
    border: none;
    color: var(--color-accent, #f0b429);
    cursor: pointer;
    padding: 0 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
    transition: opacity 0.15s, transform 0.1s;
    margin-left: 2px;
  }
  .send-sess-btn:hover {
    opacity: 1;
  }
  .send-sess-btn:active {
    transform: scale(0.9);
  }
  .send-sess-btn svg {
    width: 10px;
    height: 10px;
    fill: currentColor !important;
  }
</style>
