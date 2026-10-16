/**
 * js/engine/config.js - Game configuration defaults and validation.
 */

import { COLS, TOTAL_ROWS } from './constants.js';
import { DEFAULT_WEIGHTS, validateWeights } from './randomizer.js';

/**
 * @typedef {object} GameConfig
 * @property {number} seed PRNG seed. The engine has no clock, so the caller
 *   picks a varying seed for real games. Default 8.
 * @property {import('./randomizer.js').WeightTable} weights Bag weights.
 *   Default DEFAULT_WEIGHTS (the game itself passes per-bank tables).
 * @property {number} gravityMsPerRow Milliseconds per row of natural fall. Default 1000.
 * @property {number} softDropFactor Fall speed multiplier while soft dropping. Default 20.
 * @property {number} lockDelayMs Time a resting piece waits before locking. Default 500.
 * @property {number} maxLockResets Lock timer resets allowed per piece
 *   (refreshed when the piece reaches a new lowest row; see game.js). Default 15.
 * @property {number} lineClearDelayMs Time full rows stay on the board (so the
 *   renderer can flash them) before they are removed. 0 removes them at once. Default 200.
 * @property {number} spawnDelayMs Pause after a lock (and after any line clear
 *   delay) before the next piece spawns. 0 spawns at once. Default 100.
 * @property {number} previewCount Upcoming pieces exposed in the preview queue. Default 1.
 * @property {Uint8Array | null} initialBoard Optional starting board (copied),
 *   for tests and future challenge modes. Default null (empty).
 */

/** @type {Readonly<GameConfig>} */
export const DEFAULT_CONFIG = Object.freeze({
  seed: 8,
  weights: DEFAULT_WEIGHTS,
  gravityMsPerRow: 1000,
  softDropFactor: 20,
  lockDelayMs: 500,
  maxLockResets: 15,
  lineClearDelayMs: 200,
  spawnDelayMs: 100,
  previewCount: 1,
  initialBoard: null,
});

/**
 * @param {string} name
 * @param {unknown} value
 * @param {number} min
 * @param {boolean} [integer]
 */
function checkNumber(name, value, min, integer = false) {
  const ok = typeof value === 'number' && Number.isFinite(value) && value >= min &&
    (!integer || Number.isInteger(value));
  if (!ok) {
    throw new RangeError(`${name} must be ${integer ? 'an integer' : 'a number'} >= ${min}.`);
  }
}

/**
 * Merge a partial config over the defaults and validate it.
 * @param {Partial<GameConfig>} [overrides]
 * @returns {GameConfig}
 * @throws {RangeError|TypeError} On invalid values.
 */
export function resolveConfig(overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  checkNumber('seed', config.seed, -Infinity);
  checkNumber('gravityMsPerRow', config.gravityMsPerRow, Number.MIN_VALUE);
  checkNumber('softDropFactor', config.softDropFactor, 1);
  checkNumber('lockDelayMs', config.lockDelayMs, 0);
  checkNumber('maxLockResets', config.maxLockResets, 0, true);
  // Whole milliseconds keep every delay a whole number of internal time units.
  checkNumber('lineClearDelayMs', config.lineClearDelayMs, 0, true);
  checkNumber('spawnDelayMs', config.spawnDelayMs, 0, true);
  checkNumber('previewCount', config.previewCount, 0, true);
  validateWeights(config.weights);
  if (config.initialBoard !== null) {
    const board = config.initialBoard;
    if (!(board instanceof Uint8Array) || board.length !== COLS * TOTAL_ROWS) {
      throw new TypeError(`initialBoard must be a Uint8Array of ${COLS * TOTAL_ROWS} cells.`);
    }
  }
  return config;
}
