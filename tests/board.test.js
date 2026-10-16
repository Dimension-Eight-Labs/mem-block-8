/**
 * tests/board.test.js - Collision and line clearing on raw boards.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, VISIBLE_ROWS, HIDDEN_ROWS, TOTAL_ROWS, createBoard, cellIndex, collides,
  findFullRows, clearRows, boardFromRows, boardToString,
} from '../js/engine/index.js';

const DOT = [[0, 0]];
const rowText = (board, y) => Array.from(board.slice(y * COLS, (y + 1) * COLS), (v) => (v ? '#' : '.')).join('');
const FULL = '############';

test('dimensions: 12 x (4 hidden + 22 visible)', () => {
  assert.equal(COLS, 12);
  assert.equal(VISIBLE_ROWS, 22);
  assert.equal(HIDDEN_ROWS, 4);
  assert.equal(TOTAL_ROWS, 26);
  assert.equal(createBoard().length, 12 * 26);
});

test('collision with walls, floor, and ceiling', () => {
  const board = createBoard();
  assert.equal(collides(board, DOT, 0, 0), false);
  assert.equal(collides(board, DOT, 11, 25), false);
  assert.equal(collides(board, DOT, -1, 10), true, 'left wall');
  assert.equal(collides(board, DOT, 12, 10), true, 'right wall');
  assert.equal(collides(board, DOT, 5, 26), true, 'floor');
  assert.equal(collides(board, DOT, 5, -1), true, 'ceiling');
});

test('collision with locked cells', () => {
  const board = createBoard();
  board[cellIndex(6, 20)] = 3;
  const bar = [[0, 0], [1, 0], [2, 0]];
  assert.equal(collides(board, bar, 4, 20), true);
  assert.equal(collides(board, bar, 3, 20), false);
  assert.equal(collides(board, bar, 4, 19), false);
});

test('single line clear shifts rows above down by one', () => {
  const board = boardFromRows(['#...........', FULL, '.#..........']);
  assert.deepEqual(findFullRows(board), [24]);
  clearRows(board, [24]);
  assert.equal(rowText(board, 25), '.#..........');
  assert.equal(rowText(board, 24), '#...........');
  assert.equal(rowText(board, 23), '............');
});

test('multiple contiguous rows clear together', () => {
  const board = boardFromRows(['..#.........', FULL, FULL, FULL]);
  assert.deepEqual(findFullRows(board), [23, 24, 25]);
  clearRows(board, [23, 24, 25]);
  assert.equal(rowText(board, 25), '..#.........');
  assert.equal(board.slice(0, 25 * COLS).every((v) => v === 0), true);
});

test('non-contiguous rows clear and the gaps close correctly', () => {
  const board = boardFromRows([
    '#...........', // 21 -> 23
    FULL, // 22
    '.#..........', // 23 -> 24
    FULL, // 24
    '..#.........', // 25 -> 25
  ]);
  assert.deepEqual(findFullRows(board), [22, 24]);
  clearRows(board, [22, 24]);
  assert.equal(rowText(board, 25), '..#.........');
  assert.equal(rowText(board, 24), '.#..........');
  assert.equal(rowText(board, 23), '#...........');
  assert.equal(board.slice(0, 23 * COLS).every((v) => v === 0), true);
});

test('full rows in the hidden area are detected too', () => {
  const board = createBoard();
  board.fill(1, 2 * COLS, 3 * COLS);
  assert.deepEqual(findFullRows(board), [2]);
});

test('boardToString marks the hidden/visible boundary', () => {
  const lines = boardToString({ board: createBoard() }).split('\n');
  assert.equal(lines.length, TOTAL_ROWS + 1);
  assert.equal(lines[HIDDEN_ROWS], '-'.repeat(COLS));
});
