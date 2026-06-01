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

  interface Props {
    sessions: QueueSession[];
    itemId: string;
    isReading: boolean;
    isStremio?: boolean;
    onRemoveSession: (sessionId: string) => void;
    onSessionChange: (sessionIdx: number, field: string, val: any) => void;
  }

  let { sessions, itemId, isReading, isStremio = false, onRemoveSession, onSessionChange }: Props =
    $props();

  /* Track collapsed state in localStorage, reactive to itemId changes */
  let isOpen = $state(true);

  onMount(async () => {
    const val = await storage.getItem(`local:sess-closed-${itemId}`);
    isOpen = val !== "1";
  });

  async function toggleOpen() {
    isOpen = !isOpen;
    await storage.setItem(`local:sess-closed-${itemId}`, isOpen ? "0" : "1");
  }

  function rememberEditableStart(e: FocusEvent) {
    const input = e.currentTarget as HTMLInputElement;
    input.dataset.editStart = input.value;
  }

  function handleEditableKeydown(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.value = input.dataset.editStart ?? input.defaultValue;
      input.blur();
    }
  }
</script>

{#if sessions.length > 1}
  <div class="sessions-container">
    <button class="session-summary" onclick={toggleOpen}>
      {isOpen ? "▾" : "▸"} Sessions ({sessions.length})
    </button>

    {#if isOpen}
      <div class="session-list">
        {#each sessions as session, i}
          <div class="session-row" data-session-id={session.id}>
            <span class="session-dot"></span>
            <span class="session-label">{isStremio && session.season && session.episode ? `S${session.season}E${session.episode}` : `S${i + 1}`}</span>

            {#if isReading}
              <input
                class="ghost-num chars"
                type="number"
                value={session.chars || 0}
                style={`--chars-len: ${String(session.chars || 0).length};`}
                onfocus={rememberEditableStart}
                onkeydown={handleEditableKeydown}
                onchange={(e) =>
                  onSessionChange(
                    i,
                    "chars",
                    (e.target as HTMLInputElement).value,
                  )}
              />
              <span class="unit">chars</span>
            {/if}

            {#if isStremio}
              <input
                class="ghost-num stremio-part"
                type="number"
                min="1"
                value={Math.max(1, Number(session.season || 1))}
                title="Season"
                onfocus={rememberEditableStart}
                onkeydown={handleEditableKeydown}
                onchange={(e) =>
                  onSessionChange(
                    i,
                    "season",
                    (e.target as HTMLInputElement).value,
                  )}
              />
              <span class="unit">s</span>
              <input
                class="ghost-num stremio-part"
                type="number"
                min="1"
                value={Math.max(1, Number(session.episode || 1))}
                title="Episode"
                onfocus={rememberEditableStart}
                onkeydown={handleEditableKeydown}
                onchange={(e) =>
                  onSessionChange(
                    i,
                    "episode",
                    (e.target as HTMLInputElement).value,
                  )}
              />
              <span class="unit">e</span>
            {/if}

            <input
              class="ghost-num mins"
              type="number"
              min="1"
              value={Math.max(1, Math.round(session.secs / 60))}
              onfocus={rememberEditableStart}
              onkeydown={handleEditableKeydown}
              onchange={(e) =>
                onSessionChange(
                  i,
                  "mins",
                  (e.target as HTMLInputElement).value,
                )}
            />
            <span class="unit">min</span>

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
    color: var(--color-text, #dde4f0);
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
    font-size: 9px;
    color: color-mix(in srgb, var(--color-accent) 60%, transparent);
    font-weight: bold;
    flex-shrink: 0;
    margin-right: 5px;
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
    width: clamp(3ch, calc(var(--chars-len, 3) * 1ch), 10ch);
    color: var(--color-accent, #f0b429);
  }
  .ghost-num.stremio-part {
    width: 18px;
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
</style>
