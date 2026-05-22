/**
 * ── Time Formatting Utilities ────────────────────────────────────────────────
 *
 * Shared time display helpers used by both content scripts and the popup/settings
 * UI. Previously duplicated across text-tracker, video-tracker, and popup.
 */

/**
 * Format milliseconds as "M:SS" (minutes and seconds).
 * Used by the reading overlay and TTU chronometer.
 *
 * @example fmt(125000) → "2:05"
 */
export function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Format seconds as "H:MM:SS" or "M:SS" depending on duration.
 * Used by the video tracker badge display.
 *
 * @example fmtSecs(3661) → "1:01:01"
 * @example fmtSecs(125) → "2:05"
 */
export function fmtSecs(s: number): string {
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

/**
 * Convert an ISO date string to a local datetime-local input value.
 * Returns empty string for falsy inputs.
 *
 * @example toLocalDT("2025-01-15T12:00:00Z") → "2025-01-15T07:00" (CST)
 */
export function toLocalDT(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Get today's date as an ISO date string (YYYY-MM-DD) in local timezone.
 * Used for date inputs defaulting to today.
 */
export function localTodayISODate(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/**
 * Convert a date input string (YYYY-MM-DD) to a full ISO timestamp,
 * preserving the current time-of-day in the local timezone.
 *
 * Falls back to `new Date().toISOString()` for invalid inputs.
 */
export function dateInputToISO(dateStr: string): string {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(dateStr || '');
  if (!m) return new Date().toISOString();
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const now = new Date();
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), 0, 0).toISOString();
}
