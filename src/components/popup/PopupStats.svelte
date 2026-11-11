<script lang="ts">
  import { onMount } from "svelte";
  import { storage } from "wxt/utils/storage";
  import { ACTIVE_SETTINGS_TAB_KEY, LAST_LOG_SUBMITTED_AT_KEY } from "@/lib/constants";
  import { parsePopupSummary } from "@/lib/utils/stats-parser";
  import { fetchAndCacheUserStats, resolveUsername } from "@/lib/api/nihongotracker";
  import { browser } from "wxt/browser";

  let statsData = $state<any>(null);
  let parsed = $derived(parsePopupSummary(statsData));

  async function loadStats(force = false) {
    statsData = await storage.getItem('local:userStats');
    try {
      const username = await resolveUsername();
      if (username) statsData = await fetchAndCacheUserStats(username, force);
    } catch {
      /* Offline or API down: keep showing the cached stats loaded above. */
    }
  }

  onMount(() => {
    loadStats();
    const unwatch = storage.watch<any>('local:userStats', (newVal) => {
      statsData = newVal;
    });
    // The API client stamps this key after every successful log submission. Force a
    // fresh fetch (bypassing the 5-min cache) so the popup stats reflect the new log
    // immediately instead of showing stale numbers. [FIX]
    const unwatchInvalidation = storage.watch<number>(LAST_LOG_SUBMITTED_AT_KEY, () => {
      loadStats(true);
    });
    return () => {
      unwatch();
      unwatchInvalidation();
    };
  });

  async function openDashboard() {
    // Store the target tab in case the settings page needs to open fresh
    await storage.setItem(ACTIVE_SETTINGS_TAB_KEY, "dashboard");
    // Route through the background script which handles:
    // 1. Finding and focusing an existing settings tab
    // 2. Sending SWITCH_SETTINGS_TAB to switch to dashboard
    // 3. Opening a new settings tab if none exists
    if (browser?.runtime?.sendMessage) {
      browser.runtime.sendMessage({ action: "OPEN_SETTINGS", tab: "dashboard" }).catch(() => {});
    }
  }
</script>

<div class="stats">
  <span class="streak" title="Longest streak: {parsed.longestStreak} days">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
    <strong>{parsed.currentStreak}</strong>
    <span class="streak-unit">day streak</span>
  </span>

  <dl class="figures">
    <div><dt>Today</dt><dd>{parsed.todayHoursStr}</dd></div>
    <div><dt>Week</dt><dd>{parsed.weekHoursStr}</dd></div>
    <div><dt>Month</dt><dd>{parsed.monthHoursStr}</dd></div>
  </dl>

  <button class="dashboard-link" title="Open dashboard" aria-label="Open dashboard" onclick={openDashboard}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  </button>
</div>

<style>
  .stats {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    font-size: 11px;
    flex-shrink: 0;
  }

  .streak {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-accent);
    white-space: nowrap;
    cursor: default;
  }
  .streak svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }
  .streak strong {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .streak-unit {
    color: var(--color-text-muted);
  }

  .figures {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }
  .figures div {
    display: flex;
    align-items: baseline;
    gap: 4px;
    white-space: nowrap;
  }
  .figures dt {
    color: var(--color-text-muted);
  }
  .figures dd {
    color: var(--color-text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .dashboard-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    background: none;
    border: none;
    border-radius: var(--rounded-btn, 4px);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
  }
  .dashboard-link:hover {
    color: var(--color-accent);
    background: color-mix(in srgb, var(--color-text) 7%, transparent);
  }
  .dashboard-link svg {
    width: 13px;
    height: 13px;
  }
</style>
