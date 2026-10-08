/**
 * ── Video Watch Thresholds ───────────────────────────────────────────────────
 *
 * Single source of truth for the two watch thresholds (auto-queue and
 * direct-send). The settings UI and the tracker engine both resolve them here,
 * so what the user sees is exactly what gets enforced.
 */

import type { TrackerConfig } from '@/lib/types';

export type ThresholdType = 'time' | 'percent';

export interface WatchThreshold {
  type: ThresholdType;
  /** Minutes for `time`, 1–100 for `percent`. */
  value: number;
}

export const THRESHOLD_LIMITS: Record<ThresholdType, { min: number; max: number }> = {
  time: { min: 1, max: Number.MAX_SAFE_INTEGER },
  percent: { min: 1, max: 100 },
};

export const QUEUE_THRESHOLD_DEFAULTS: Record<ThresholdType, number> = { time: 1, percent: 5 };
export const SEND_THRESHOLD_DEFAULTS: Record<ThresholdType, number> = { time: 30, percent: 95 };

/**
 * Coerce a stored or typed threshold into its valid range. A value of 0 (or a
 * cleared input) would make every video qualify the moment it starts playing.
 */
export function clampThresholdValue(type: ThresholdType, value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const { min, max } = THRESHOLD_LIMITS[type];
  return Math.min(max, Math.max(min, numeric));
}

function resolveThreshold(
  rawType: unknown,
  rawValue: unknown,
  defaults: Record<ThresholdType, number>,
): WatchThreshold {
  const type: ThresholdType = rawType === 'percent' ? 'percent' : 'time';
  return { type, value: clampThresholdValue(type, rawValue, defaults[type]) };
}

/** Threshold a video must reach before it is placed in the pending queue. */
export function getQueueThreshold(cfg: TrackerConfig): WatchThreshold {
  return resolveThreshold(cfg.queueThresholdType, cfg.queueThresholdValue, QUEUE_THRESHOLD_DEFAULTS);
}

/** Threshold a video must reach before it is sent directly (direct-send mode). */
export function getAutoSendThreshold(cfg: TrackerConfig): WatchThreshold {
  // Configs saved before the type selector existed only hold `threshold`, a percentage.
  if (cfg.thresholdType === undefined && cfg.thresholdValue === undefined && cfg.threshold !== undefined) {
    return resolveThreshold('percent', cfg.threshold, SEND_THRESHOLD_DEFAULTS);
  }
  return resolveThreshold(cfg.thresholdType, cfg.thresholdValue ?? cfg.threshold, SEND_THRESHOLD_DEFAULTS);
}

export function isAutoSendEnabled(cfg: TrackerConfig): boolean {
  return cfg.autoSend ?? (cfg.logMode === 'auto');
}

/**
 * @param watchedSecs - Seconds actually watched in the current session
 * @param durationSecs - `video.duration` (may be NaN before metadata, Infinity for live)
 * @param live.minutes - Minutes required when a percentage is meaningless (live streams)
 */
export function hasReachedThreshold(
  threshold: WatchThreshold,
  watchedSecs: number,
  durationSecs: number,
  live: { isLive: boolean; minutes: number },
): boolean {
  if (live.isLive || durationSecs === Infinity) {
    const requiredMinutes = threshold.type === 'percent' ? live.minutes : threshold.value;
    return watchedSecs / 60 >= requiredMinutes;
  }

  if (threshold.type === 'percent') {
    if (!Number.isFinite(durationSecs) || durationSecs <= 0) return false;
    // Watched time is counted in whole seconds, so a literal 100% of a
    // fractional duration could never be met; allow for that rounding.
    const requiredSecs = Math.min(
      (durationSecs * threshold.value) / 100,
      Math.max(1, Math.floor(durationSecs) - 1),
    );
    return watchedSecs >= requiredSecs;
  }

  return watchedSecs / 60 >= threshold.value;
}
