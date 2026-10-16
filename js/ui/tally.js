/**
 * js/ui/tally.js - The chip cash-in tally's count-up, as pure functions.
 *
 * The score already includes the cash-in when the bank completes (the
 * progression is authoritative); the tally during the READY moment only
 * animates that change. The number on screen climbs in a few even steps,
 * one sound blip per step (js/audio/sfx.js, 'tally'), so the sound and the
 * number move together:
 *
 *   step k (1..steps) at k x stepMs shows round(points x k / steps)
 *   the done tone at (steps + 1) x stepMs
 *
 * Steps are one per chip, but never more than maxSteps, so a big haul
 * counts up just as quickly and its blips never run together into a buzz.
 * Timings come from SCREENS in js/input/bindings.js.
 */

/**
 * Counting steps for a cash-in.
 * @param {number} chips Chips cashed in (0 means no tally at all).
 * @param {number} maxSteps
 * @returns {number}
 */
export function tallySteps(chips, maxSteps) {
  return Math.max(0, Math.min(chips, maxSteps));
}

/**
 * The value shown a while into the tally.
 * @param {number} points The whole cash-in.
 * @param {number} steps From tallySteps.
 * @param {number} stepMs
 * @param {number} elapsedMs Since the READY moment began (negative: not yet).
 * @returns {number} 0 up to points, a whole number.
 */
export function tallyValue(points, steps, stepMs, elapsedMs) {
  if (steps <= 0) return points;
  const done = Math.min(steps, Math.max(0, Math.floor(elapsedMs / stepMs)));
  return Math.round((points * done) / steps);
}

/**
 * How long the count-up takes, done tone included (ms from the READY moment
 * to the done tone).
 * @param {number} steps
 * @param {number} stepMs
 * @returns {number}
 */
export function tallyDoneAtMs(steps, stepMs) {
  return (steps + 1) * stepMs;
}
