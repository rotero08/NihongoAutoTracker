<script lang="ts">
  import { onMount } from "svelte";
  import { storage } from "wxt/utils/storage";
  import { configStorage } from "@/lib/storage/config";
  import { 
    compileBaseLogs, 
    generateHeatmapCells, 
    getRecent7DaysData, 
    getMonthlyOverviewData,
    formatMinutesToHoursStr,
    formatHoursToHMM 
  } from "@/lib/utils/stats-parser";
  import { fetchAndCacheUserStats } from "@/lib/api/nihongotracker";

  interface Props {
    onStatus: (msg: string, err?: boolean) => void;
    onConfirm: (title: string, msg: string) => Promise<boolean>;
  }
  let { onStatus, onConfirm }: Props = $props();

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function generatePlaceholderCells(year: number) {
    const jan1 = new Date(year, 0, 1);
    const startDay = jan1.getDay();
    const startDate = new Date(jan1);
    startDate.setDate(jan1.getDate() - startDay);

    const cells = [];
    for (let i = 0; i < 371; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const mName = MONTH_NAMES[currentDate.getMonth()];
      const day = currentDate.getDate();
      
      const yearKey = currentDate.getFullYear();
      const monthKey = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dayKey = String(day).padStart(2, '0');
      const dayKeyStr = `${yearKey}-${monthKey}-${dayKey}`;

      cells.push({
        date: currentDate,
        dayKey: dayKeyStr,
        level: 0,
        logCount: 0,
        totalTime: 0,
        tooltip: `${mName} ${String(day).padStart(2, '0')}, ${currentDate.getFullYear()}: 0 logs (0 mins)`,
        inYear: currentDate.getFullYear() === year
      });
    }
    return cells;
  }

  // ── Reactive States ──
  let statsData = $state<any>(null);
  let config = $state<any>({});
  let heatmapContainer = $state<HTMLElement | null>(null);
  let isScrollable = $state(false);

  let heatmapYear = $state(2026);
  let overviewYear = $state(2026);
  let monthsExpanded = $state(false);
  let isDragging = $state(false);

  // ── Highly Optimized Decoupled Reactivity Derivations ──
  // Base single-pass calculation runs ONLY when statsData updates
  let baseLogs = $derived(compileBaseLogs(statsData, overviewYear));

  // Granular derivations isolate components; updates to one don't trigger recalculations of the other
  let yearHeatmapCells = $derived(generateHeatmapCells(heatmapYear, baseLogs.logsByDayKey));
  let finalHeatmapCells = $derived(
    yearHeatmapCells.length > 0 ? yearHeatmapCells : generatePlaceholderCells(heatmapYear)
  );

  let recent7Days = $derived(getRecent7DaysData(baseLogs.logsByDayKey));
  let finalMonthlyOverview = $derived(getMonthlyOverviewData(overviewYear, baseLogs.logsByMonthKey));

  let parsed = $derived.by(() => {
    const totals = baseLogs.totals;
    const readingHours = totals.readingHours || 0;
    const listeningHours = totals.listeningHours || 0;
    const totalChars = totals.totalChars || 0;
    const readingSpeed = readingHours > 0 ? Math.round(totalChars / readingHours) : 0;
    const allTimeHours = totals.totalTimeHours || 0;

    return {
      todayHours: baseLogs.todayMins / 60,
      weekHours: baseLogs.weekMins / 60,
      monthHours: baseLogs.monthMins / 60,
      allTimeHours,
      todayHoursStr: formatMinutesToHoursStr(baseLogs.todayMins),
      weekHoursStr: formatMinutesToHoursStr(baseLogs.weekMins),
      monthHoursStr: formatMinutesToHoursStr(baseLogs.monthMins),
      allTimeHoursStr: formatHoursToHMM(allTimeHours),
      currentStreak: statsData?.streaks?.currentStreak ?? 0,
      longestStreak: statsData?.streaks?.longestStreak ?? 0,
      userLevel: 14,
      userXp: totals.totalXp || 278050,
      xpPercent: 68,
      readingHours,
      listeningHours,
      totalChars,
      readingSpeed
    };
  });

  // Goal metrics computations
  let dailyGoalMinutes = $derived(config?.dailyGoalMinutes ?? 60); 
  let todayTotalMinutes = $derived(parsed.todayHours * 60);
  let goalProgressPercent = $derived(
    dailyGoalMinutes > 0 ? Math.min(100, Math.round((todayTotalMinutes / dailyGoalMinutes) * 100)) : 0
  );
  let hasDailyGoal = $derived(config?.dailyGoalMinutes !== undefined && config?.dailyGoalMinutes !== null && config?.dailyGoalMinutes > 0);

  // Chronologically sorted month columns bypasses redundant .sort()
  let monthLabelOffsets = $derived.by(() => {
    const offsets: { name: string; col: number }[] = [];
    const cells = finalHeatmapCells;
    const seenMonths = new Set<number>();

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const cellDate = cell.date;
      const month = cellDate.getMonth();

      if (!seenMonths.has(month) && cell.inYear) {
        seenMonths.add(month);
        const colIndex = Math.floor(i / 7);
        offsets.push({
          name: MONTH_NAMES[month],
          col: colIndex
        });
      }
    }
    return offsets;
  });

  let displayedMonths = $derived(
    monthsExpanded ? finalMonthlyOverview : finalMonthlyOverview.slice(0, 4)
  );

  function checkScrollability() {
    if (heatmapContainer) {
      isScrollable = heatmapContainer.scrollWidth > heatmapContainer.offsetWidth;
    }
  }

  async function loadData() {
    statsData = await storage.getItem('local:userStats');
    config = await configStorage.getValue();
    
    const currentYear = new Date().getFullYear();
    heatmapYear = currentYear;
    overviewYear = currentYear;

    if (config?.username) {
      try {
        statsData = await fetchAndCacheUserStats(config.username);
      } catch (e) {}
    }
  }

  onMount(() => {
    loadData();
    const unwatch = storage.watch<any>('local:userStats', (newVal) => {
      statsData = newVal;
    });

    checkScrollability();
    const resizeObserver = new ResizeObserver(checkScrollability);
    if (heatmapContainer) {
      resizeObserver.observe(heatmapContainer);
    }

    return () => {
      unwatch();
      resizeObserver.disconnect();
    };
  });

  function switchHeatmapYear(direction: 'prev' | 'next') {
    heatmapYear = direction === 'next' ? heatmapYear + 1 : heatmapYear - 1;
  }

  function switchOverviewYear(direction: 'prev' | 'next') {
    overviewYear = direction === 'next' ? overviewYear + 1 : overviewYear - 1;
  }

  function toggleTimeline() {
    monthsExpanded = !monthsExpanded;
  }

  function scrollHeatmap(direction: 'left' | 'right') {
    if (!heatmapContainer) return;
    const amount = 180;
    heatmapContainer.scrollTo({
      left: heatmapContainer.scrollLeft + (direction === 'right' ? amount : -amount),
      behavior: 'smooth'
    });
  }

  // High-performance unified Drag-to-pan scrolling coordinate tracker using requestAnimationFrame
  function handleDragStart(e: MouseEvent | TouchEvent) {
    if (!heatmapContainer) return;
    isDragging = true;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const startX = clientX - heatmapContainer.offsetLeft;
    const scrollLeft = heatmapContainer.scrollLeft;
    
    let frameId: number;

    const handleDragMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDragging || !heatmapContainer) return;
      
      const currentClientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : (moveEvent as MouseEvent).clientX;
      const x = currentClientX - heatmapContainer.offsetLeft;
      const walk = (x - startX) * 1.5;

      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        if (heatmapContainer) {
          heatmapContainer.scrollLeft = scrollLeft - walk;
        }
      });
    };

    const handleDragEnd = () => {
      isDragging = false;
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };

    window.addEventListener('mousemove', handleDragMove, { passive: true });
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleDragMove, { passive: true });
    window.addEventListener('touchend', handleDragEnd);
  }
</script>

<div class="stats-tab">
  <!-- Header -->
  <div class="stats-header">
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <h2>Immersion Analytics</h2>
      {#if config?.username}
        <span class="font-mono" style="font-size: 10px; color: var(--color-text-muted);">@{config.username}</span>
      {/if}
    </div>
    <div class="header-controls">
      <a href="https://nihongotracker.app/user/{encodeURIComponent(config?.username || '')}/stats" target="_blank" rel="noopener noreferrer" class="btn-profile font-mono">
        <span>View Web Profile</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="profile-link-icon">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
        </svg>
      </a>
    </div>
  </div>

  <!-- Hero Row Split Grid Layout -->
  <div class="dashboard-hero-row">
    <!-- Left Column: Sidebar Progression Hub & Gauges -->
    <div class="hero-profile-sidebar">
      <div class="profile-card">
        <!-- Goal Progress Widget -->
        {#if hasDailyGoal}
          <div class="goal-widget-row">
            <div class="svg-ring-container">
              <svg viewBox="0 0 36 36">
                <path class="circle-chart-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="circle-chart-fill" stroke-dasharray="{goalProgressPercent}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="circle-percentage-text font-mono">{goalProgressPercent}%</div>
            </div>
            <div class="goal-text-meta">
              <span class="goal-title">Daily Progress</span>
              <span class="goal-hrs font-mono">{parsed.todayHoursStr} <span class="val-unit">hrs</span></span>
              <span class="goal-sub">Goal Target: {formatMinutesToHoursStr(dailyGoalMinutes)} hr</span>
            </div>
          </div>
        {:else}
          <!-- Dashed Placeholder Card -->
          <div class="no-goal-defined-widget">
            <div class="no-goal-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
            </div>
            <div class="goal-text-meta">
              <span class="goal-title">Daily Target</span>
              <span class="goal-hrs font-mono" style="font-size: 11px; color: var(--color-text-muted);">No daily goal defined</span>
              <span class="goal-sub font-mono" style="font-size: 8.5px;">Configure in Goals settings</span>
            </div>
          </div>
        {/if}

        <!-- Level Progress Gauge -->
        <div class="level-gauge-block">
          <div class="level-header-row">
            <span class="lvl-title">Immersion Level</span>
            <span class="lvl-number font-mono">{parsed.userLevel}</span>
          </div>
          <div class="lvl-bar-track">
            <div class="lvl-bar-fill" style="width: {parsed.xpPercent}%;"></div>
          </div>
          <div class="lvl-xp-meta font-mono">
            <span>{parsed.userXp.toLocaleString()} total XP</span>
            <span>{parsed.xpPercent}% to Level {parsed.userLevel + 1}</span>
          </div>
        </div>
      </div>

      <!-- Immersion Volumes 2x2 Grid Layout -->
      <div class="volumes-card">
        <div class="volumes-grid">
          <div class="vol-block">
            <span class="vol-lbl">Today</span>
            <span class="vol-val font-mono">{parsed.todayHoursStr} <span class="val-unit">hrs</span></span>
          </div>
          <div class="vol-block">
            <span class="vol-lbl">This Week</span>
            <span class="vol-val font-mono">{parsed.weekHoursStr} <span class="val-unit">hrs</span></span>
          </div>
          <div class="vol-block">
            <span class="vol-lbl">This Month</span>
            <span class="vol-val font-mono">{parsed.monthHoursStr} <span class="val-unit">hrs</span></span>
          </div>
          <div class="vol-block">
            <span class="vol-lbl">All Time</span>
            <span class="vol-val font-mono">{parsed.allTimeHoursStr} <span class="val-unit">hrs</span></span>
          </div>
        </div>
      </div>

      <!-- Reading Speed Speedometer Gauge -->
      <div class="speed-gauge-card">
        <div class="speed-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <span class="speed-title">Average Reading Pace</span>
        </div>
        <span class="speed-value font-mono">
          {parsed.readingSpeed.toLocaleString()} <span class="speed-unit">chars/hr</span>
        </span>
        <div class="speed-slider-wrap">
          <div class="speed-slider-track">
            <div class="speed-slider-pointer" style="left: {Math.min(95, Math.max(5, (parsed.readingSpeed / 20000) * 100))}%;"></div>
          </div>
          <div class="speed-slider-labels font-mono">
            <span>Moderate</span>
            <span>Active</span>
            <span>Fast</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column Stack: Heatmap & Recent Distribution -->
    <div class="hero-trends-stack">
      <!-- 1. Full-Year 53-Week Heatmap -->
      <div class="hero-heatmap-card">
        <div class="heatmap-header-row">
          <h3 class="section-title">Immersion Heatmap</h3>
          <div class="heatmap-header-right">
            <!-- Year Selector Toggles -->
            <div class="year-toggler">
              <button class="year-btn" onclick={() => switchHeatmapYear('prev')} aria-label="Previous Year" title="Previous Year">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span class="year-lbl-txt font-mono">{heatmapYear}</span>
              <button class="year-btn" onclick={() => switchHeatmapYear('next')} aria-label="Next Year" title="Next Year">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <!-- Flame Streaks -->
            <div class="streak-container">
              <div class="nt-streak-pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                </svg>
                <span class="font-mono">Streak: {parsed.currentStreak}d</span>
              </div>
              <div class="nt-streak-pill max font-mono">
                <span>Longest: {parsed.longestStreak}d</span>
              </div>
            </div>
          </div>
        </div>

        <div class="heatmap-grid-outer">
          <!-- Inline overlay slide arrows positioned outside the scroll wrap -->
          {#if isScrollable}
            <button class="slide-btn left" onclick={() => scrollHeatmap('left')} aria-label="Scroll Left" title="Scroll Left">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          {/if}

          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div 
            class="heatmap-scroll-wrapper" 
            bind:this={heatmapContainer}
            onmousedown={handleDragStart}
            ontouchstart={handleDragStart}
            role="region"
            aria-label="Immersion Heatmap Grid"
            style="cursor: {isDragging ? 'grabbing' : 'grab'};"
          >
            <!-- Fixed dimensions lock preserving alignment regardless of viewport bounds -->
            <div class="heatmap-content-inner">
              <!-- Months Timeline Labels aligned chronologically starting from January -->
              <div class="heatmap-months font-mono" style="position: relative; height: 14px; margin-bottom: 2px;">
                {#each monthLabelOffsets as m (m.name)}
                  <span style="position: absolute; left: {m.col * 12}px; width: 24px; text-align: left; white-space: nowrap;">{m.name}</span>
                {/each}
              </div>
              <!-- Grid matrix using CSS columns-major flow layout -->
              <div class="heatmap-grid">
                {#each finalHeatmapCells as cell (cell.dayKey)}
                  <div 
                    class="cell level-{cell.level}" 
                    class:outside-year={!cell.inYear}
                    title={cell.tooltip}
                  ></div>
                {/each}
              </div>
            </div>
          </div>

          {#if isScrollable}
            <button class="slide-btn right" onclick={() => scrollHeatmap('right')} aria-label="Scroll Right" title="Scroll Right">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          {/if}
        </div>

        <div class="heatmap-legend-row font-mono">
          <span>Less</span>
          <div class="cell level-0" style="width: 10px; height: 10px;"></div>
          <div class="cell level-1" style="width: 10px; height: 10px;"></div>
          <div class="cell level-2" style="width: 10px; height: 10px;"></div>
          <div class="cell level-3" style="width: 10px; height: 10px;"></div>
          <div class="cell level-4" style="width: 10px; height: 10px;"></div>
          <span>More</span>
        </div>
      </div>

      <!-- 2. Recent 7 Days Distribution Stacked Chart -->
      <div class="chart-section">
        <h3 class="section-title">Recent 7 Days Distribution</h3>
        <div class="chart-container">
          <div class="chart-bars">
            {#each recent7Days.labels as label, i}
              <div class="bar-col">
                <div class="stacked-bar">
                  <!-- Reading segmented layers -->
                  <div class="bar-segment reading" style="height: {recent7Days.readingPcts[i]}%;" title="Reading: {formatMinutesToHoursStr(recent7Days.readingMins[i])}"></div>
                  <!-- Listening segmented layers -->
                  <div class="bar-segment listening" style="height: {recent7Days.listeningPcts[i]}%;" title="Listening: {formatMinutesToHoursStr(recent7Days.listeningMins[i])}"></div>
                </div>
                <span class="bar-lbl font-mono">{label}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="legend-row font-mono">
          <div class="legend-item"><span class="swatch listening"></span> Listening</div>
          <div class="legend-item"><span class="swatch reading"></span> Reading</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Row: Pace Grids and Balance bar -->
  <div class="bottom-trends-panel">
    <!-- Left Split: Pacing metrics -->
    <div class="pacing-grid font-mono">
      <div class="pacing-card">
        <span class="pacing-lbl">Daily Pace</span>
        <div class="pacing-val">
          {formatHoursToHMM(parsed.todayHours || statsData?.totals?.dailyAverageHours || 0)} <span class="val-unit">hrs/day</span>
        </div>
      </div>
      <div class="pacing-card">
        <span class="pacing-lbl">Weekly Pace</span>
        <div class="pacing-val">
          {formatHoursToHMM((parsed.todayHours || statsData?.totals?.dailyAverageHours || 0) * 7)} <span class="val-unit">hrs/week</span>
        </div>
      </div>
      <div class="pacing-card">
        <span class="pacing-lbl">Monthly Pace</span>
        <div class="pacing-val">
          {formatHoursToHMM((parsed.todayHours || statsData?.totals?.dailyAverageHours || 0) * 30.45)} <span class="val-unit">hrs/month</span>
        </div>
      </div>
    </div>

    <!-- Right Split: Lifetime split bar -->
    <div class="balance-section">
      <h3 class="section-title">Lifetime Immersion Balance</h3>
      <div class="balance-track">
        <div class="track-fill listening" style="width: {parsed.allTimeHours > 0 ? (parsed.listeningHours / parsed.allTimeHours) * 100 : 50}%;"></div>
        <div class="track-fill reading" style="width: {parsed.allTimeHours > 0 ? (parsed.readingHours / parsed.allTimeHours) * 100 : 50}%;"></div>
      </div>
      <div class="balance-details font-mono">
        <span>Listening: {parsed.allTimeHours > 0 ? Math.round((parsed.listeningHours / parsed.allTimeHours) * 100) : 0}% ({Math.round(parsed.listeningHours)} hrs)</span>
        <span>Reading: {parsed.allTimeHours > 0 ? Math.round((parsed.readingHours / parsed.allTimeHours) * 100) : 0}% ({Math.round(parsed.readingHours)} hrs)</span>
      </div>
    </div>
  </div>

  <!-- Full-Width Monthly Timeline Overview -->
  <div class="monthly-overview-card">
    <div class="monthly-header-row">
      <h3 class="section-title">Monthly Immersion Overview</h3>
      <div class="year-toggler">
        <button class="year-btn" onclick={() => switchOverviewYear('prev')} aria-label="Previous Year" title="Previous Year">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="year-lbl-txt font-mono">{overviewYear}</span>
        <button class="year-btn" onclick={() => switchOverviewYear('next')} aria-label="Next Year" title="Next Year">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>

    <div class="monthly-timeline-wrapper">
      {#if finalMonthlyOverview.length === 0}
        <div style="font-size: 11px; color: var(--color-text-muted); text-align: center; padding: 20px 0;">
          No logs found for {overviewYear}
        </div>
      {:else}
        {#each displayedMonths as item (item.monthIndex)}
          <div class="month-timeline-row">
            <span class="month-lbl font-mono">{item.monthName}</span>
            <span class="month-total-time font-mono">
              Total: <strong>{item.totalTimeStr}</strong> ({item.listeningTimeStr} / {item.readingTimeStr}) hrs
            </span>
            <span class="month-consistency-pill font-mono">{item.activeDays} / {item.totalDays} active days</span>
            <div class="month-ratio-track-wrap">
              <div class="month-ratio-track">
                <div class="month-ratio-fill-listening" style="width: {item.ratioListening}%;"></div>
                <div class="month-ratio-fill-reading" style="width: {item.ratioReading}%;"></div>
              </div>
              <div class="month-ratio-meta font-mono">
                <span>Listening: {Math.round(item.ratioListening)}%</span>
                <span>Reading: {Math.round(item.ratioReading)}%</span>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if finalMonthlyOverview.length > 4}
      <button class="btn-expand-months font-mono" onclick={toggleTimeline}>
        <span>{monthsExpanded ? 'Show Less' : 'Show All Months'}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="expand-chevron" style="transform: rotate({monthsExpanded ? '180deg' : '0deg'});">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    {/if}
  </div>
</div>

<style>
  :global(:root) {
    --color-reading: color-mix(in srgb, var(--color-accent) 45%, var(--color-text));
  }

  .stats-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    background-color: var(--color-background);
  }

  .stats-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border, #1a2235);
    padding-bottom: 10px;
    margin-bottom: 4px;
  }

  .stats-header h2 {
    font-size: 16px;
    font-weight: bold;
    color: var(--color-text);
    letter-spacing: 0.04em;
    margin: 0;
  }

  .btn-profile {
    display: flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    font-weight: bold;
    font-size: 10px;
    padding: 6px 12px;
    border-radius: var(--rounded-btn, 4px);
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
    color: var(--color-text-muted, #7a8ca5) !important;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
  }

  .btn-profile:hover {
    color: var(--color-text) !important;
    border-color: var(--color-accent);
  }

  .profile-link-icon {
    width: 12px;
    height: 12px;
  }

  .dashboard-hero-row {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 20px;
    align-items: stretch;
  }

  .hero-profile-sidebar {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .profile-card {
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: var(--rounded-box, 6px);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    justify-content: center;
  }

  .goal-widget-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .svg-ring-container {
    width: 64px;
    height: 64px;
    position: relative;
    flex-shrink: 0;
  }

  .svg-ring-container svg {
    transform: rotate(-90deg);
    width: 100%;
    height: 100%;
  }

  .circle-chart-bg {
    fill: none;
    stroke: var(--color-border, #1a2235);
    stroke-width: 3.5;
  }

  .circle-chart-fill {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 3.5;
    stroke-linecap: round;
  }

  .circle-percentage-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 13px;
    font-weight: bold;
    color: var(--color-accent);
  }

  .goal-text-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .goal-title {
    font-size: 9px;
    font-weight: bold;
    color: var(--color-text-muted, #7a8ca5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .goal-hrs {
    font-size: 16px;
    font-weight: bold;
    color: var(--color-text);
  }

  .goal-sub {
    font-size: 9.5px;
    color: var(--color-text-muted, #7a8ca5);
  }

  .no-goal-defined-widget {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.01);
    border: 1px dashed var(--color-border, #1a2235);
    border-radius: var(--rounded-box, 6px);
  }

  .no-goal-icon-wrap {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background-color: var(--color-surface, #0d0d1c);
    border: 1px solid var(--color-border, #1a2235);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted, #7a8ca5);
    flex-shrink: 0;
  }

  .no-goal-icon-wrap svg {
    width: 16px;
    height: 16px;
  }

  .level-gauge-block {
    border-top: 1px dashed var(--color-border, #1a2235);
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .level-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .lvl-title {
    font-size: 9px;
    font-weight: bold;
    color: var(--color-text-muted, #7a8ca5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .lvl-number {
    font-size: 26px;
    font-weight: bold;
    color: var(--color-accent);
    line-height: 1;
  }

  .lvl-bar-track {
    width: 100%;
    height: 6px;
    background-color: var(--color-surface, #0d0d1c);
    border-radius: 3px;
    overflow: hidden;
  }

  .lvl-bar-fill {
    height: 100%;
    background-color: var(--color-accent);
    border-radius: 3px;
  }

  .lvl-xp-meta {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--color-text-muted, #7a8ca5);
  }

  .volumes-card {
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: var(--rounded-box, 6px);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .volumes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .vol-block {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .vol-lbl {
    font-size: 8.5px;
    font-weight: bold;
    color: var(--color-text-muted, #7a8ca5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .vol-val {
    font-size: 15px;
    font-weight: bold;
    color: var(--color-text);
  }

  .val-unit {
    font-size: 10px;
    color: var(--color-text-muted, #7a8ca5);
    font-weight: normal;
  }

  .speed-gauge-card {
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: var(--rounded-box, 6px);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .speed-header {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-text-muted, #7a8ca5);
  }

  .speed-header svg {
    width: 12px;
    height: 12px;
  }

  .speed-title {
    font-size: 9px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .speed-value {
    font-size: 20px;
    font-weight: bold;
    color: var(--color-text);
    line-height: 1;
  }

  .speed-unit {
    font-size: 10px;
    color: var(--color-text-muted, #7a8ca5);
    font-weight: normal;
  }

  .speed-slider-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .speed-slider-track {
    width: 100%;
    height: 5px;
    background: linear-gradient(to right, var(--color-surface-alt, #10101f) 20%, var(--color-accent) 60%, var(--color-reading) 100%);
    border-radius: 2px;
    position: relative;
    border: 1px solid var(--color-border, #1a2235);
  }

  .speed-slider-pointer {
    width: 4px;
    height: 9px;
    background-color: var(--color-text);
    border-radius: 1px;
    position: absolute;
    top: -2px;
  }

  .speed-slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: var(--color-text-muted, #7a8ca5);
  }

  .hero-trends-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .hero-heatmap-card {
    background-color: var(--color-surface, #0d0d1c);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: var(--rounded-box, 6px);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .heatmap-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .section-title {
    font-size: 11px;
    font-weight: bold;
    color: var(--color-text);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0;
  }

  .heatmap-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .year-toggler {
    display: flex;
    align-items: center;
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: 4px;
    padding: 1px 4px;
    gap: 8px;
  }

  .year-btn {
    background: none;
    border: none;
    color: var(--color-text-muted, #7a8ca5);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    outline: none;
    box-shadow: none !important;
  }

  .year-btn:hover {
    color: var(--color-text);
  }

  .year-btn svg {
    width: 8px;
    height: 8px;
    stroke: currentColor;
  }

  .year-lbl-txt {
    font-size: 9px;
    font-weight: bold;
    color: var(--color-text-muted, #7a8ca5);
  }

  .streak-container {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .nt-streak-pill {
    background-color: color-mix(in srgb, var(--color-accent) 8%, transparent) !important;
    border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent) !important;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 9.5px;
    font-weight: bold;
    color: var(--color-accent) !important;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .nt-streak-pill svg {
    width: 10px;
    height: 10px;
  }

  .nt-streak-pill.max {
    background-color: color-mix(in srgb, var(--color-text) 5%, transparent) !important;
    border-color: var(--color-border, #1a2235) !important;
    color: var(--color-text-muted, #7a8ca5) !important;
  }

  .heatmap-grid-outer {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0 4px;
  }

  .heatmap-scroll-wrapper {
    overflow-x: auto;
    width: 100%;
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
    user-select: none;
  }

  .heatmap-scroll-wrapper::-webkit-scrollbar {
    display: none !important;
  }

  .heatmap-content-inner {
    width: 634px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .heatmap-months {
    display: block;
    width: 100%;
    font-size: 8.5px;
    color: var(--color-text-muted, #7a8ca5);
    user-select: none;
  }

  .heatmap-grid {
    display: grid;
    grid-template-rows: repeat(7, 10px);
    grid-auto-columns: 10px;
    grid-auto-flow: column;
    gap: 2px;
    width: 100%;
  }

  .cell {
    width: 10px;
    height: 10px;
    border-radius: 1.5px;
    cursor: help;
    transition: outline 0.1s ease-in-out;
  }

  .cell.outside-year {
    opacity: 0.25;
  }

  .cell:hover {
    outline: 1.5px solid var(--color-text);
  }

  .cell.level-0 {
    background-color: var(--color-surface-alt, #10101f);
  }
  
  .cell.level-1 {
    background-color: color-mix(in srgb, var(--color-accent) 15%, var(--color-surface-alt, #10101f));
  }
  .cell.level-2 {
    background-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-surface-alt, #10101f));
  }
  .cell.level-3 {
    background-color: color-mix(in srgb, var(--color-accent) 70%, var(--color-surface-alt, #10101f));
  }
  .cell.level-4 {
    background-color: var(--color-accent);
  }

  .heatmap-legend-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    font-size: 8.5px;
    color: var(--color-text-muted, #7a8ca5);
    margin-top: 2px;
  }

  .slide-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
    color: var(--color-text-muted, #7a8ca5);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .slide-btn:hover {
    color: var(--color-text);
    border-color: var(--color-accent);
    background-color: var(--color-surface, #0d0d1c);
  }

  .slide-btn.left {
    margin-right: 8px;
  }

  .slide-btn.right {
    margin-left: 8px;
  }

  .slide-btn svg {
    width: 10px;
    height: 10px;
  }

  .chart-section {
    background-color: var(--color-surface, #0d0d1c);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: var(--rounded-box, 6px);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .chart-container {
    height: 110px;
    display: flex;
    align-items: flex-end;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--color-border, #1a2235);
  }

  .chart-bars {
    display: flex;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    align-items: flex-end;
  }

  .bar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  .stacked-bar {
    width: 14px;
    height: 80px;
    display: flex;
    flex-direction: column-reverse;
    border-radius: 2px;
    overflow: hidden;
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
  }

  .bar-segment {
    width: 100%;
  }

  .bar-segment.listening { background-color: var(--color-accent); }
  .bar-segment.reading { background-color: var(--color-reading); }

  .bar-lbl {
    font-size: 9px;
    color: var(--color-text-muted, #7a8ca5);
  }

  .legend-row {
    display: flex;
    gap: 12px;
    font-size: 9px;
    color: var(--color-text-muted, #7a8ca5);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 1.5px;
    display: inline-block;
  }

  .swatch.listening { background-color: var(--color-accent); }
  .swatch.reading { background-color: var(--color-reading); }

  .bottom-trends-panel {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 10px;
  }

  .pacing-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .pacing-card {
    background-color: var(--color-surface, #0d0d1c);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: var(--rounded-box, 6px);
    padding: 16px 12px;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
  }

  .pacing-lbl {
    font-size: 8px;
    font-weight: bold;
    color: var(--color-text-muted, #7a8ca5);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .pacing-val {
    font-size: 15px;
    font-weight: bold;
    color: var(--color-text);
  }

  .balance-section {
    background-color: var(--color-surface, #0d0d1c);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: var(--rounded-box, 6px);
    padding: 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 12px;
  }

  .balance-track {
    width: 100%;
    height: 10px;
    display: flex;
    border-radius: 3px;
    overflow: hidden;
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
  }

  .track-fill.listening { background-color: var(--color-accent); }
  .track-fill.reading { background-color: var(--color-reading); }

  .balance-details {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--color-text-muted, #7a8ca5);
  }

  .monthly-overview-card {
    background-color: var(--color-surface, #0d0d1c);
    border: 1px solid var(--color-border, #1a2235);
    border-radius: var(--rounded-box, 6px);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    margin-top: 20px;
  }

  .monthly-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .monthly-timeline-wrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .month-timeline-row {
    display: grid;
    grid-template-columns: 80px 250px 120px 1fr;
    align-items: center;
    gap: 16px;
    padding-bottom: 10px;
    border-bottom: 1px dashed var(--color-border, #1a2235);
  }

  .month-timeline-row:last-child {
    border-bottom: none;
    padding-bottom: 0px;
  }

  .month-lbl {
    font-size: 11px;
    font-weight: bold;
    color: var(--color-text);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .month-total-time {
    font-size: 11px;
    font-weight: bold;
    color: var(--color-text-muted, #7a8ca5);
  }

  .month-total-time strong {
    color: var(--color-accent);
  }

  .month-consistency-pill {
    font-size: 9px;
    font-weight: bold;
    color: var(--color-text-muted, #7a8ca5);
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
    padding: 2px 6px;
    border-radius: 4px;
    text-align: center;
  }

  .month-ratio-track-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .month-ratio-track {
    width: 100%;
    height: 6px;
    display: flex;
    border-radius: 2px;
    overflow: hidden;
    background-color: var(--color-surface-alt, #10101f);
    border: 1px solid var(--color-border, #1a2235);
  }

  .month-ratio-fill-listening { background-color: var(--color-accent); }
  .month-ratio-fill-reading { background-color: var(--color-reading); }

  .month-ratio-meta {
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: var(--color-text-muted, #7a8ca5);
  }

  .btn-expand-months {
    background: none;
    border: 1px dashed var(--color-border, #1a2235);
    color: var(--color-text-muted, #7a8ca5);
    border-radius: var(--rounded-box, 6px);
    padding: 8px;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    transition: all 0.15s;
    margin-top: 14px;
    outline: none;
    box-shadow: none !important;
  }

  .btn-expand-months:hover {
    color: var(--color-text);
    border-color: var(--color-border-hover, #222d42);
  }

  .expand-chevron {
    width: 10px;
    height: 10px;
    transition: transform 0.2s ease;
  }
</style>
