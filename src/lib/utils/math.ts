/**
 * ── Stateless Numeric Form Helpers ──────────────────────────────────────────
 * Simple arithmetic operations for form counters.
 */

/**
 * Increments or decrements a number within a specified lower boundary.
 * 
 * @param current - The current numeric value
 * @param direction - Direction of the step adjustment
 * @param step - The step size increment
 * @param minimum - The lower boundary clamp
 */
export function stepValue(current: number, direction: 'up' | 'down', step = 1, minimum = 1): number {
  return direction === 'up' ? current + step : Math.max(minimum, current - step);
}
