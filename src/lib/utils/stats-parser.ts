export interface ParsedStats {
  todayHours: number;
  weekHours: number;
  monthHours: number;
  allTimeHours: number;
  todayHoursStr: string;
  weekHoursStr: string;
  monthHoursStr: string;
  allTimeHoursStr: string;
  currentStreak: number;
  longestStreak: number;
  userLevel: number;
  userXp: number;
  xpToNextLevel: number;
  xpToCurrentLevel: number;
  xpPercent: number;
  readingHours: number;
  listeningHours: number;
  totalChars: number;
  readingSpeed: number;
  heatmapCells: any[];
  recent7Days: {
    labels: string[];
    listeningPcts: number[];
    readingPcts: number[];
    listeningMins: number[];
    readingMins: number[];
  };
  monthlyOverview: any[];
}

export interface PopupStatsSummary {
  todayHoursStr: string;
  weekHoursStr: string;
  monthHoursStr: string;
  currentStreak: number;
  longestStreak: number;
}

export interface CompiledBaseLogs {
  logsByDayKey: Map<string, any[]>;
  logsByMonthKey: Map<number, any[]>;
  todayMins: number;
  weekMins: number;
  monthMins: number;
  totals: any;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Persistent module-level cache to eliminate repetitive Date-parsing allocations across renders
const dateTimestampCache = new Map<string, number>();

function getCachedTimestamp(dateStr: string): number {
  let t = dateTimestampCache.get(dateStr);
  if (t === undefined) {
    t = new Date(dateStr).getTime();
    dateTimestampCache.set(dateStr, t);
  }
  return t;
}

export function isReadingType(type?: string): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === 'reading' || t === 'manga' || t === 'vn' || t === 'book';
}

export function formatMinutesToHoursStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatHoursToHMM(totalHours: number): string {
  const h = Math.floor(totalHours);
  const m = Math.round((totalHours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * Highly optimized, lightweight statistics parser compiled exclusively for popup views.
 * Bypasses intensive historical calendars, bar-chart matrices, and monthly loops.
 */
export function parsePopupSummary(stats: any): PopupStatsSummary {
  const defaultRes: PopupStatsSummary = {
    todayHoursStr: "0:00",
    weekHoursStr: "0:00",
    monthHoursStr: "0:00",
    currentStreak: 0,
    longestStreak: 0
  };
  if (!stats) return defaultRes;

  const statsByType = stats.statsByType || [];
  const d = new Date();
  const currentYear = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(d.getDate()).padStart(2, '0');
  const todayKey = `${currentYear}-${m}-${r}`;
  const currentMonthKey = `${currentYear}-${m}`;

  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  
  // Safe calculation to avoid mutating 'd' in place
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const startOfWeekTime = monday.getTime();

  let todayMins = 0;
  let weekMins = 0;
  let monthMins = 0;

  for (let i = 0, typeLen = statsByType.length; i < typeLen; i++) {
    const dates = statsByType[i].dates || [];
    for (let j = 0, dateLen = dates.length; j < dateLen; j++) {
      const dObj = dates[j];
      const key = dObj.localDate?.dayKey;
      if (key) {
        if (key === todayKey) todayMins += dObj.time || 0;
        if (dObj.localDate?.monthKey === currentMonthKey) monthMins += dObj.time || 0;
      }
      if (dObj.date) {
        const t = getCachedTimestamp(dObj.date);
        if (t >= startOfWeekTime) weekMins += dObj.time || 0;
      }
    }
  }

  return {
    todayHoursStr: formatMinutesToHoursStr(todayMins),
    weekHoursStr: formatMinutesToHoursStr(weekMins),
    monthHoursStr: formatMinutesToHoursStr(monthMins),
    currentStreak: stats.streaks?.currentStreak ?? 0,
    longestStreak: stats.streaks?.longestStreak ?? 0
  };
}

/**
 * Single-Pass core data compiler compiling and structuring raw tracking data.
 */
export function compileBaseLogs(stats: any, targetOverviewYear: number): CompiledBaseLogs {
  const logsByDayKey = new Map<string, any[]>();
  const logsByMonthKey = new Map<number, any[]>();
  
  if (!stats) {
    return {
      logsByDayKey,
      logsByMonthKey,
      todayMins: 0,
      weekMins: 0,
      monthMins: 0,
      totals: {}
    };
  }

  const statsByType = stats.statsByType || [];
  const d = new Date();
  const currentYear = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(d.getDate()).padStart(2, '0');
  const todayKey = `${currentYear}-${m}-${r}`;
  const currentMonthKey = `${currentYear}-${m}`;

  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  
  // Safe calculation avoiding mutation of 'd'
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const startOfWeekTime = monday.getTime();

  let todayMins = 0;
  let weekMins = 0;
  let monthMins = 0;

  for (let i = 0, typeLen = statsByType.length; i < typeLen; i++) {
    const typeObj = statsByType[i];
    const type = typeObj.type;
    const dates = typeObj.dates || [];
    
    for (let j = 0, dateLen = dates.length; j < dateLen; j++) {
      const dObj = dates[j];
      const item = { ...dObj, type };

      const key = dObj.localDate?.dayKey;
      if (key) {
        let list = logsByDayKey.get(key);
        if (!list) {
          list = [];
          logsByDayKey.set(key, list);
        }
        list.push(item);

        if (key === todayKey) {
          todayMins += dObj.time || 0;
        }
      }

      if (dObj.date) {
        const t = getCachedTimestamp(dObj.date);
        if (t >= startOfWeekTime) {
          weekMins += dObj.time || 0;
        }
      }

      if (dObj.localDate?.monthKey === currentMonthKey) {
        monthMins += dObj.time || 0;
      }

      if (dObj.localDate?.year === targetOverviewYear) {
        const mIdx = (dObj.localDate.month || 1) - 1;
        let list = logsByMonthKey.get(mIdx);
        if (!list) {
          list = [];
          logsByMonthKey.set(mIdx, list);
        }
        list.push(item);
      }
    }
  }

  return {
    logsByDayKey,
    logsByMonthKey,
    todayMins,
    weekMins,
    monthMins,
    totals: stats.totals || {}
  };
}

/**
 * Independent generator compiling heatmap coordinate cells.
 */
export function generateHeatmapCells(year: number, logsByDayKey: Map<string, any[]>) {
  const jan1 = new Date(year, 0, 1);
  const startDay = jan1.getDay();
  const startDate = new Date(jan1);
  startDate.setDate(jan1.getDate() - startDay);

  const cells = [];
  const runnerDate = new Date(startDate);

  for (let i = 0; i < 371; i++) {
    if (i > 0) {
      runnerDate.setDate(runnerDate.getDate() + 1);
    }
    const yearKey = runnerDate.getFullYear();
    const month = runnerDate.getMonth() + 1;
    const day = runnerDate.getDate();
    const dayKey = `${yearKey}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const dayLogs = logsByDayKey.get(dayKey) || [];
    const logCount = dayLogs.length;
    
    let totalTime = 0;
    for (let j = 0, len = dayLogs.length; j < len; j++) {
      totalTime += dayLogs[j].time || 0;
    }

    let level = 0;
    if (totalTime > 0) {
      if (totalTime <= 15) level = 1;
      else if (totalTime <= 45) level = 2;
      else if (totalTime <= 90) level = 3;
      else level = 4;
    }

    const monthName = MONTH_NAMES[runnerDate.getMonth()];
    const formattedDate = `${monthName} ${String(day).padStart(2, '0')}, ${yearKey}`;
    const tooltipText = `${formattedDate}: ${logCount} log${logCount === 1 ? '' : 's'} (${totalTime} min${totalTime === 1 ? '' : 's'})`;

    cells.push({
      date: new Date(runnerDate),
      dayKey,
      level,
      logCount,
      totalTime,
      tooltip: tooltipText,
      inYear: yearKey === year
    });
  }
  return cells;
}

/**
 * Independent metrics tracking parser compiling the recent 7 days chart values.
 */
export function getRecent7DaysData(logsByDayKey: Map<string, any[]>) {
  const labels: string[] = [];
  const keys: string[] = [];
  const runner = new Date();
  const nowMs = Date.now();

  for (let i = 6; i >= 0; i--) {
    runner.setTime(nowMs - i * 24 * 60 * 60 * 1000);
    const y = runner.getFullYear();
    const m = String(runner.getMonth() + 1).padStart(2, '0');
    const r = String(runner.getDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${r}`);

    if (i === 0) {
      labels.push("Today");
    } else {
      labels.push(runner.toLocaleString('en-US', { weekday: 'short' }));
    }
  }

  const listeningMins: number[] = Array(7).fill(0);
  const readingMins: number[] = Array(7).fill(0);

  for (let i = 0; i < 7; i++) {
    const dayLogs = logsByDayKey.get(keys[i]) || [];
    let readSum = 0;
    let listenSum = 0;

    for (let j = 0, len = dayLogs.length; j < len; j++) {
      const x = dayLogs[j];
      if (isReadingType(x.type)) {
        readSum += x.time || 0;
      } else {
        listenSum += x.time || 0;
      }
    }

    readingMins[i] = readSum;
    listeningMins[i] = listenSum;
  }

  let maxDayTotal = 1;
  for (let i = 0; i < 7; i++) {
    const total = listeningMins[i] + readingMins[i];
    if (total > maxDayTotal) {
      maxDayTotal = total;
    }
  }

  const listeningPcts = listeningMins.map(val => (val / maxDayTotal) * 100);
  const readingPcts = readingMins.map(val => (val / maxDayTotal) * 100);

  return {
    labels,
    listeningPcts,
    readingPcts,
    listeningMins,
    readingMins
  };
}

/**
 * Independent compiler creating the chronological monthly summary grid lists.
 */
export function getMonthlyOverviewData(year: number, logsByMonth: Map<number, any[]>) {
  const monthsData = [];

  for (let m = 0; m < 12; m++) {
    const monthLogs = logsByMonth.get(m) || [];
    if (monthLogs.length === 0) continue;

    let totalTimeMin = 0;
    let readingTimeMin = 0;
    const uniqueDays = new Set<string>();

    for (let j = 0, len = monthLogs.length; j < len; j++) {
      const item = monthLogs[j];
      const time = item.time || 0;
      totalTimeMin += time;
      if (isReadingType(item.type)) {
        readingTimeMin += time;
      }
      if (item.localDate?.dayKey) {
        uniqueDays.add(item.localDate.dayKey);
      }
    }

    const listeningTimeMin = totalTimeMin - readingTimeMin;
    const activeDaysCount = uniqueDays.size;
    const totalDaysInMonth = new Date(year, m + 1, 0).getDate();

    monthsData.push({
      monthIndex: m,
      monthName: MONTH_NAMES[m],
      totalTimeStr: formatMinutesToHoursStr(totalTimeMin),
      listeningTimeStr: formatMinutesToHoursStr(listeningTimeMin),
      readingTimeStr: formatMinutesToHoursStr(readingTimeMin),
      totalTimeHours: totalTimeMin / 60,
      activeDays: activeDaysCount,
      totalDays: totalDaysInMonth,
      ratioListening: totalTimeMin > 0 ? (listeningTimeMin / totalTimeMin) * 100 : 0,
      ratioReading: totalTimeMin > 0 ? (readingTimeMin / totalTimeMin) * 100 : 0,
    });
  }

  monthsData.sort((a, b) => b.monthIndex - a.monthIndex);
  return monthsData;
}

/**
 * Advanced full analytics compiler for options dashboard representations.
 */
export function parseStats(stats: any, heatmapYear?: number, overviewYear?: number): ParsedStats {
  const defaultRes: ParsedStats = {
    todayHours: 0,
    weekHours: 0,
    monthHours: 0,
    allTimeHours: 0,
    todayHoursStr: "0:00",
    weekHoursStr: "0:00",
    monthHoursStr: "0:00",
    allTimeHoursStr: "0:00",
    currentStreak: 0,
    longestStreak: 0,
    userLevel: 14,
    userXp: 0,
    xpToNextLevel: 281449,
    xpToCurrentLevel: 276059,
    xpPercent: 68,
    readingHours: 0,
    listeningHours: 0,
    totalChars: 0,
    readingSpeed: 0,
    heatmapCells: [],
    recent7Days: { labels: [], listeningPcts: [], readingPcts: [], listeningMins: [], readingMins: [] },
    monthlyOverview: []
  };

  if (!stats) return defaultRes;

  const currentYear = new Date().getFullYear();
  const targetHeatmapYear = heatmapYear ?? currentYear;
  const targetOverviewYear = overviewYear ?? currentYear;

  const base = compileBaseLogs(stats, targetOverviewYear);
  const allTimeHours = base.totals.totalTimeHours || 0;
  const readingHours = base.totals.readingHours || 0;
  const listeningHours = base.totals.listeningHours || 0;
  const totalChars = base.totals.totalChars || 0;
  const readingSpeed = readingHours > 0 ? Math.round(totalChars / readingHours) : 0;

  return {
    todayHours: base.todayMins / 60,
    weekHours: base.weekMins / 60,
    monthHours: base.monthMins / 60,
    allTimeHours,
    todayHoursStr: formatMinutesToHoursStr(base.todayMins),
    weekHoursStr: formatMinutesToHoursStr(base.weekMins),
    monthHoursStr: formatMinutesToHoursStr(base.monthMins),
    allTimeHoursStr: formatHoursToHMM(allTimeHours),
    currentStreak: stats.streaks?.currentStreak ?? 0,
    longestStreak: stats.streaks?.longestStreak ?? 0,
    userLevel: 14,
    userXp: base.totals.totalXp || 278050,
    xpToNextLevel: 281449,
    xpToCurrentLevel: 276059,
    xpPercent: 68,
    readingHours,
    listeningHours,
    totalChars,
    readingSpeed,
    heatmapCells: generateHeatmapCells(targetHeatmapYear, base.logsByDayKey),
    recent7Days: getRecent7DaysData(base.logsByDayKey),
    monthlyOverview: getMonthlyOverviewData(targetOverviewYear, base.logsByMonthKey)
  };
}
