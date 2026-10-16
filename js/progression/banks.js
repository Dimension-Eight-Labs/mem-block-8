/**
 * js/progression/banks.js - The memory bank (level) table and gravity curve.
 *
 * Levels are called memory banks. Each bank sets how many lines fill it,
 * how fast pieces fall, and the piece mix (a weight table for the engine's
 * weighted bag). Difficulty ramps first through the mix (banks 1-5 bring in
 * pentominoes, easiest first), then through fall speed (bank 6 onwards).
 *
 * ALL VALUES ARE FIRST-PASS, to be tuned by playtesting. Edit BANK_TABLE
 * and GRAVITY_RAMP; the tests check the table's shape (real piece ids,
 * monotonic and floored gravity), not these exact numbers.
 *
 * Weight changes reach the engine through game.setWeights(), which takes
 * effect when the current bag runs out. So a new mix starts within one bag
 * of the bank changing, not instantly; small bags keep that lag short.
 */

import { groupPiecesBySize } from '../engine/index.js';

/**
 * @typedef {object} BankSettings
 * @property {number} bank Bank number, 1 and up.
 * @property {number} linesToComplete Lines that fill this bank.
 * @property {number} gravityMsPerRow Natural fall speed (whole milliseconds).
 * @property {Readonly<Record<string, number>>} weights Piece id to count per bag.
 */

const BY_SIZE = groupPiecesBySize();

/**
 * The same weight for every piece of one size.
 * @param {number} size 3, 4, or 5.
 * @param {number} weight
 * @returns {Record<string, number>}
 */
function allOfSize(size, weight) {
  return Object.fromEntries(BY_SIZE.get(size).map((piece) => [piece.id, weight]));
}

/**
 * The same weight for a list of piece ids.
 * @param {readonly string[]} ids
 * @param {number} weight
 * @returns {Record<string, number>}
 */
function each(ids, weight) {
  return Object.fromEntries(ids.map((id) => [id, weight]));
}

/** Pentominoes in the order they are introduced, easiest first. */
export const PENTOMINO_TIERS = Object.freeze({
  // Bank 2: straight and simple bent shapes.
  easy: Object.freeze(['I5', 'L5', 'L5m', 'P5', 'P5m']),
  // Bank 3: symmetric or near-symmetric shapes.
  medium: Object.freeze(['T5', 'U5', 'V5', 'Y5', 'Y5m']),
  // Bank 4: the awkward, jagged shapes.
  hard: Object.freeze(['F5', 'F5m', 'N5', 'N5m', 'W5', 'X5', 'Z5', 'Z5m']),
});

/** Every bank's small pieces: trominoes 1 each, tetrominoes 2 each (16 per bag). */
const SMALL = Object.freeze({ ...allOfSize(3, 1), ...allOfSize(4, 2) });

/**
 * Banks 1 to 5. Bank 6 and beyond reuse bank 5's mix with faster gravity
 * (see GRAVITY_RAMP). "Low weight" means 1 per bag against 2 per bag for
 * the tetrominoes. Bag sizes: 16, 21, 26, 44, 52 pieces.
 * @type {readonly Readonly<Omit<BankSettings, 'bank'>>[]}
 */
export const BANK_TABLE = Object.freeze([
  // Bank 1: trominoes and tetrominoes only.
  {
    linesToComplete: 10,
    gravityMsPerRow: 900,
    weights: { ...SMALL },
  },
  // Bank 2: the easiest pentominoes appear, at low weight.
  {
    linesToComplete: 10,
    gravityMsPerRow: 900,
    weights: { ...SMALL, ...each(PENTOMINO_TIERS.easy, 1) },
  },
  // Bank 3: adds T5, U5, V5, Y5, Y5m, also at low weight.
  {
    linesToComplete: 10,
    gravityMsPerRow: 900,
    weights: { ...SMALL, ...each(PENTOMINO_TIERS.easy, 1), ...each(PENTOMINO_TIERS.medium, 1) },
  },
  // Bank 4: all pentominoes; the earlier ones rise to 2, the hard ones
  // arrive at low weight. First speed-up.
  {
    linesToComplete: 10,
    gravityMsPerRow: 750,
    weights: {
      ...SMALL,
      ...each(PENTOMINO_TIERS.easy, 2),
      ...each(PENTOMINO_TIERS.medium, 2),
      ...each(PENTOMINO_TIERS.hard, 1),
    },
  },
  // Bank 5: the full mix, every pentomino at its final weight of 2.
  {
    linesToComplete: 10,
    gravityMsPerRow: 750,
    weights: { ...SMALL, ...allOfSize(5, 2) },
  },
].map((bank) => Object.freeze({ ...bank, weights: Object.freeze(bank.weights) })));

/**
 * Gravity after the table runs out. Each bank past the last table entry
 * multiplies the previous bank's gravity by numerator / denominator (0.8),
 * rounded to a whole millisecond, and never goes below floorMs.
 *
 * Integer steps (multiply by 4, divide by 5, round) rather than
 * Math.pow(0.8, n), so every browser computes exactly the same values.
 * Bank 5 = 750, then 600, 480, 384, 307, 246, 197, 158, 126, 101, 81, 65,
 * and 60 ms per row from bank 17 on.
 */
export const GRAVITY_RAMP = Object.freeze({
  numerator: 4,
  denominator: 5,
  floorMs: 60,
});

/** Lines per bank after the table runs out. */
const LINES_AFTER_TABLE = 10;

/**
 * @param {number} bank
 * @throws {RangeError}
 */
function checkBank(bank) {
  if (!Number.isInteger(bank) || bank < 1) {
    throw new RangeError(`Bank must be an integer >= 1, got ${bank}.`);
  }
}

/**
 * Fall speed for a bank: the table value, then the ramp.
 * @param {number} bank 1 and up.
 * @returns {number} Whole milliseconds per row.
 */
export function gravityForBank(bank) {
  checkBank(bank);
  if (bank <= BANK_TABLE.length) {
    return BANK_TABLE[bank - 1].gravityMsPerRow;
  }
  const { numerator, denominator, floorMs } = GRAVITY_RAMP;
  let ms = BANK_TABLE[BANK_TABLE.length - 1].gravityMsPerRow;
  for (let b = BANK_TABLE.length; b < bank && ms > floorMs; b++) {
    ms = Math.max(floorMs, Math.round((ms * numerator) / denominator));
  }
  return ms;
}

/**
 * Everything the game needs for one bank.
 * @param {number} bank 1 and up.
 * @returns {Readonly<BankSettings>}
 */
export function getBank(bank) {
  checkBank(bank);
  const row = BANK_TABLE[Math.min(bank, BANK_TABLE.length) - 1];
  return Object.freeze({
    bank,
    linesToComplete: bank <= BANK_TABLE.length ? row.linesToComplete : LINES_AFTER_TABLE,
    gravityMsPerRow: gravityForBank(bank),
    weights: row.weights,
  });
}
