/**
 * js/engine/debug.js - Text rendering of boards for tests and the console.
 *
 * Legend: "." empty, "#" locked cell, "@" active piece, "+" landing
 * position. A line of dashes separates the hidden rows from the visible
 * ones.
 */

import { COLS, HIDDEN_ROWS, TOTAL_ROWS } from './constants.js';
import { cellIndex, createBoard } from './board.js';

/**
 * Render a board, and optionally the active piece, as text.
 * @param {{board: Uint8Array, active?: {cells: readonly (readonly number[])[]} | null,
 *   landing?: {cells: readonly (readonly number[])[]} | null}} state
 *   A getState() snapshot, or any object with a board.
 * @param {{showLanding?: boolean}} [options]
 * @returns {string} TOTAL_ROWS lines of COLS characters, plus the separator.
 */
export function boardToString(state, { showLanding = false } = {}) {
  const chars = Array.from(state.board, (value) => (value === 0 ? '.' : '#'));
  const mark = (piece, ch) => {
    for (const [x, y] of piece?.cells ?? []) {
      chars[cellIndex(x, y)] = ch;
    }
  };
  if (showLanding) {
    mark(state.landing, '+');
  }
  mark(state.active, '@');
  const lines = [];
  for (let y = 0; y < TOTAL_ROWS; y++) {
    if (y === HIDDEN_ROWS) {
      lines.push('-'.repeat(COLS));
    }
    lines.push(chars.slice(y * COLS, (y + 1) * COLS).join(''));
  }
  return lines.join('\n');
}

/**
 * Build a board from text rows aligned to the BOTTOM of the well, which is
 * how test fixtures are easiest to read. Any character other than "." or
 * a space is a filled cell (stored as `value`).
 * @param {string[]} rows Each exactly COLS characters, last entry = floor row.
 * @param {number} [value] Cell value for filled cells. Default 1.
 * @returns {Uint8Array}
 */
export function boardFromRows(rows, value = 1) {
  const board = createBoard();
  const top = TOTAL_ROWS - rows.length;
  rows.forEach((row, i) => {
    if (row.length !== COLS) {
      throw new RangeError(`Row ${i} must be ${COLS} characters wide.`);
    }
    [...row].forEach((ch, x) => {
      if (ch !== '.' && ch !== ' ') {
        board[cellIndex(x, top + i)] = value;
      }
    });
  });
  return board;
}
