/**
 * js/engine/board.js - The well's cell grid: collision, placement, line clears.
 *
 * The board is a flat Uint8Array (see constants.js for the coordinate
 * system). Functions here are stateless helpers that read or mutate a
 * board passed in, so they are easy to test with hand-built boards.
 */

import { COLS, TOTAL_ROWS } from './constants.js';

/**
 * Create an empty board.
 * @returns {Uint8Array} COLS * TOTAL_ROWS cells, all 0.
 */
export function createBoard() {
  return new Uint8Array(COLS * TOTAL_ROWS);
}

/**
 * Flat array index of a cell.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function cellIndex(x, y) {
  return y * COLS + x;
}

/**
 * Whether a coordinate lies inside the well (including hidden rows).
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isInside(x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < TOTAL_ROWS;
}

/**
 * Whether a cell is unavailable to a piece. Anything outside the well
 * counts as blocked, including above row 0: an upward kick near the top
 * must not lift a piece out of the board.
 * @param {Uint8Array} board
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isBlocked(board, x, y) {
  return !isInside(x, y) || board[cellIndex(x, y)] !== 0;
}

/**
 * Whether piece cells placed at an offset hit a wall, the floor, the
 * ceiling, or a locked cell.
 * @param {Uint8Array} board
 * @param {readonly (readonly number[])[]} cells Piece-local cells.
 * @param {number} ox Offset x (piece position).
 * @param {number} oy Offset y (piece position).
 * @returns {boolean}
 */
export function collides(board, cells, ox, oy) {
  return cells.some(([x, y]) => isBlocked(board, ox + x, oy + y));
}

/**
 * Write piece cells into the board.
 * @param {Uint8Array} board Mutated.
 * @param {readonly (readonly number[])[]} cells Piece-local cells.
 * @param {number} ox
 * @param {number} oy
 * @param {number} value Cell value to write (piece index + 1).
 */
export function placeCells(board, cells, ox, oy, value) {
  for (const [x, y] of cells) {
    board[cellIndex(ox + x, oy + y)] = value;
  }
}

/**
 * Whether every cell in a row is filled.
 * @param {Uint8Array} board
 * @param {number} y
 * @returns {boolean}
 */
export function isRowFull(board, y) {
  const start = y * COLS;
  for (let i = start; i < start + COLS; i++) {
    if (board[i] === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Find all full rows, hidden rows included.
 * @param {Uint8Array} board
 * @returns {number[]} Row indices in ascending order (top to bottom).
 */
export function findFullRows(board) {
  const rows = [];
  for (let y = 0; y < TOTAL_ROWS; y++) {
    if (isRowFull(board, y)) {
      rows.push(y);
    }
  }
  return rows;
}

/**
 * Remove rows and let everything above fall to fill the gaps. Works for
 * any set of rows, contiguous or not, in a single bottom-up pass: each kept
 * row is copied to the lowest free slot, then the top is cleared.
 * @param {Uint8Array} board Mutated.
 * @param {readonly number[]} rows Row indices to remove.
 */
export function clearRows(board, rows) {
  const removed = new Set(rows);
  let write = TOTAL_ROWS - 1;
  for (let read = TOTAL_ROWS - 1; read >= 0; read--) {
    if (removed.has(read)) {
      continue;
    }
    if (write !== read) {
      board.copyWithin(write * COLS, read * COLS, (read + 1) * COLS);
    }
    write--;
  }
  board.fill(0, 0, (write + 1) * COLS);
}
