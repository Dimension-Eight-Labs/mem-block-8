/**
 * js/progression/scoring.js - Points for line clears and drops.
 *
 * Mem Block 8's own scoring. Line clear values are powers of two so the
 * score reads cleanly in hexadecimal:
 *
 *   lines   points (x bank number)
 *     1        64   0x40
 *     2       128   0x80
 *     3       256   0x100
 *     4       512   0x200
 *     5      1024   0x400   "FULL WORD"
 *
 * Drops: 1 point per row fallen under soft drop, 2 points per row of a
 * hard drop. Drop points are not multiplied by the bank.
 *
 * Everything is integer arithmetic; scores never become fractional.
 */

/** Points for clearing n lines at once, before the bank multiplier. Index = n. */
export const LINE_CLEAR_POINTS = Object.freeze([0, 64, 128, 256, 512, 1024]);

/** A clear of this many lines is a "FULL WORD". */
export const FULL_WORD_LINES = 5;

/** Points per row fallen while soft drop is held. */
export const SOFT_DROP_POINTS_PER_ROW = 1;

/** Points per row travelled by a hard drop. */
export const HARD_DROP_POINTS_PER_ROW = 2;

/**
 * Points for a line clear.
 * @param {number} lines Rows cleared together, 1..5.
 * @param {number} bank Current bank number (1 and up), the multiplier.
 * @returns {number}
 * @throws {RangeError} For counts that cannot happen (pieces are at most 5 cells tall).
 */
export function lineClearPoints(lines, bank) {
  if (!Number.isInteger(lines) || lines < 1 || lines >= LINE_CLEAR_POINTS.length) {
    throw new RangeError(`Line clears are 1..${LINE_CLEAR_POINTS.length - 1} lines, got ${lines}.`);
  }
  if (!Number.isInteger(bank) || bank < 1) {
    throw new RangeError(`Bank must be an integer >= 1, got ${bank}.`);
  }
  return LINE_CLEAR_POINTS[lines] * bank;
}

/**
 * Whether a clear is a FULL WORD.
 * @param {number} lines
 * @returns {boolean}
 */
export function isFullWord(lines) {
  return lines === FULL_WORD_LINES;
}

/**
 * Drop bonus for one locked piece.
 * @param {{softDropRows: number, dropDistance: number}} locked From the engine's locked event.
 * @returns {number}
 */
export function dropPoints({ softDropRows, dropDistance }) {
  return softDropRows * SOFT_DROP_POINTS_PER_ROW + dropDistance * HARD_DROP_POINTS_PER_ROW;
}
