<script lang="ts">
  import { onMount } from "svelte";
  import { storage } from "wxt/utils/storage";
  import { configStorage } from "@/lib/storage/config";
  import { ACTIVE_SETTINGS_TAB_KEY } from "@/lib/constants";
  import { parsePopupSummary } from "@/lib/utils/stats-parser";
  import { fetchAndCacheUserStats } from "@/lib/api/nihongotracker";
  import { browser } from "wxt/browser";

  interface Props {
    hasQueueItems: boolean;
  }
  let { hasQueueItems }: Props = $props();

  let statsData = $state<any>(null);
  let parsed = $derived(parsePopupSummary(statsData));

  // Safe reactive synchronization using Svelte 5 .pre boundary constraints
  // svelte-ignore state_referenced_locally
  let lastHasQueueItems = $state(hasQueueItems);
  // svelte-ignore state_referenced_locally
  let expanded = $state(!hasQueueItems);

  $effect.pre(() => {
    if (hasQueueItems !== lastHasQueueItems) {
      lastHasQueueItems = hasQueueItems;
      expanded = !hasQueueItems;
    }
  });

  async function loadStats() {
    statsData = await storage.getItem('local:userStats');
    const cfg = await configStorage.getValue() as any;
    if (cfg?.username) {
      try {
        statsData = await fetchAndCacheUserStats(cfg.username);
      } catch (e) {}
    }
  }

  onMount(() => {
    loadStats();
    const unwatch = storage.watch<any>('local:userStats', (newVal) => {
      statsData = newVal;
    });
    return () => {
      unwatch();
    };
  });

  async function openDashboard() {
    await storage.setItem(ACTIVE_SETTINGS_TAB_KEY, "dashboard");
    if (browser?.runtime?.openOptionsPage) {
      try {
        await browser.runtime.openOptionsPage();
        return;
      } catch (e) {}
    }
    if (browser?.runtime?.sendMessage) {
      browser.runtime.sendMessage({ action: "OPEN_SETTINGS" }).catch(() => {});
    }
  }

  function toggleExpand() {
    if (hasQueueItems) {
      expanded = !expanded;
    }
  }
</script>

<div class="popup-stats-section">
  <!-- Row 1: Streak Accordion Header -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="stats-control-row" onclick={toggleExpand} style={hasQueueItems ? "cursor: pointer;" : "cursor: default;"}>
    <div class="streak-indicator">
      {#if hasQueueItems}
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2.5" 
          stroke-linecap="round" 
          stroke-linejoin="round" 
          class="popup-chevron" 
          style="transform: rotate({expanded ? '0deg' : '-90deg'});"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      {:else}
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2.2" 
          stroke-linecap="round" 
          stroke-linejoin="round" 
          class="popup-flame-icon"
        >
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        </svg>
      {/if}
      <span class="streak-txt font-mono">
        Streak: {parsed.currentStreak}d 
        <span class="longest-streak-txt">(Longest: {parsed.longestStreak}d)</span>
      </span>
    </div>
    
    <button class="btn-open-dashboard font-mono" onclick={(e) => { e.stopPropagation(); openDashboard(); }}>
      <span>Dashboard</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="dash-btn-icon">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    </button>
  </div>

  <!-- Row 2: Stats Grid -->
  {#if expanded || !hasQueueItems}
    <div class="stats-row-grid">
      <div class="pop-stat-card">
        <span class="pop-stat-num font-mono">
          {parsed.todayHoursStr} <span class="pop-stat-unit">hrs</span>
        </span>
        <span class="pop-stat-lbl">Today</span>
      </div>
      <div class="pop-stat-card">
        <span class="pop-stat-num font-mono">
          {parsed.weekHoursStr} <span class="pop-stat-unit">hrs</span>
        </span>
        <span class="pop-stat-lbl">Week</span>
      </div>
      <div class="pop-stat-card">
        <span class="pop-stat-num font-mono">
          {parsed.monthHoursStr} <span class="pop-stat-unit">hrs</span>
        </span>
        <span class="pop-stat-lbl">Month</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .popup-stats-section {
    display: flex;
    flex-direction: column;
    background-color: var(--color-background);
  }

  .stats-control-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    user-select: none;
    transition: background-color 0.15s;
  }

  .stats-control-row:hover {
    background-color: rgba(255, 255, 255, 0.02);
  }

  .streak-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-accent);
  }

  .popup-chevron {
    width: 9px;
    height: 9px;
    transition: transform 0.2s ease;
  }

  .popup-flame-icon {
    width: 10px;
    height: 10px;
    color: var(--color-accent);
  }

  .streak-txt {
    font-size: 11px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--color-accent);
  }

  .longest-streak-txt {
    color: var(--color-text-dimmed, #7a8ca5);
    font-size: 11px;
    font-weight: normal;
  }

  .btn-open-dashboard {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--color-border-hover, #242d42);
    color: var(--color-text-muted, #7a8ca5);
    border-radius: var(--rounded-btn, 4px);
    padding: 1px 5px;
    cursor: pointer;
    font-size: 8px;
    font-weight: bold;
    text-transform: uppercase;
    transition: all 0.15s;
    outline: none;
    box-shadow: none !important;
  }

  .btn-open-dashboard:hover {
    color: var(--color-text);
    border-color: var(--color-accent);
  }

  .dash-btn-icon {
    width: 8px;
    height: 8px;
  }

  .stats-row-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 0px 12px 6px 12px;
  }

  .pop-stat-card {
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: var(--rounded-btn, 4px);
    padding: 4px 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
  }

  .pop-stat-num {
    font-size: 12px;
    font-weight: bold;
    color: var(--color-accent);
    line-height: 1;
    display: flex;
    align-items: baseline;
    gap: 2px;
  }

  .pop-stat-unit {
    font-size: 8px;
    color: var(--color-text-dimmed, #7a8ca5);
    font-weight: normal;
    text-transform: lowercase;
  }

  .pop-stat-lbl {
    font-size: 8px;
    color: var(--color-text-dimmed, #7a8ca5);
    text-transform: uppercase;
    font-weight: bold;
    letter-spacing: 0.05em;
  }
</style>
