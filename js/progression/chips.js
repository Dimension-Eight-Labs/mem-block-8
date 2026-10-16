/**
 * js/progression/chips.js - Microchip bonuses: the table and the cash-in.
 *
 * Multi-row clears earn microchips. Chips pile up during the current
 * memory bank and are cashed in for points when the bank completes; a game
 * that ends first loses them. So chips reward building for big clears
 * while making the bank's last lines worth surviving for.
 *
 * The bookkeeping (accumulate, cash in, reset, lose) lives in progress.js;
 * this file holds the numbers. ALL VALUES ARE FIRST-PASS, to be tuned by
 * playtesting.
 */

/**
 * Chips per clear, indexed by rows cleared at once. One row is a normal
 * clear and earns nothing; a FULL WORD (5 rows) jumps to 5 so it stands
 * clearly above a 4-row clear.
 *
 *   rows   chips
 *     1      0
 *     2      1
 *     3      2
 *     4      3
 *     5      5   FULL WORD
 */
export const CHIPS_PER_CLEAR = Object.freeze([0, 0, 1, 2, 3, 5]);

/** Points per chip at cash-in, before the bank multiplier: 0x100. */
export const CHIP_VALUE = 0x100;

/**
 * Chips earned by one clear.
 * @param {number} lines Rows cleared together, 1..5.
 * @returns {number}
 * @throws {RangeError} For counts that cannot happen.
 */
export function chipsForClear(lines) {
  if (!Number.isInteger(lines) || lines < 1 || lines >= CHIPS_PER_CLEAR.length) {
    throw new RangeError(`Line clears are 1..${CHIPS_PER_CLEAR.length - 1} lines, got ${lines}.`);
  }
  return CHIPS_PER_CLEAR[lines];
}

/**
 * Points for cashing in chips when a bank completes.
 * @param {number} chips Chips held (0 and up).
 * @param {number} bank The bank just completed (1 and up), the multiplier.
 * @returns {number} chips x CHIP_VALUE x bank.
 * @throws {RangeError}
 */
export function cashInPoints(chips, bank) {
  if (!Number.isInteger(chips) || chips < 0) {
    throw new RangeError(`Chips must be an integer >= 0, got ${chips}.`);
  }
  if (!Number.isInteger(bank) || bank < 1) {
    throw new RangeError(`Bank must be an integer >= 1, got ${bank}.`);
  }
  return chips * CHIP_VALUE * bank;
}
