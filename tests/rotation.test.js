/**
 * tests/rotation.test.js - Rotation states and wall kicks (board level).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECES, KICK_OFFSETS, getRotationCells, tryRotate, getPieceById, createBoard, cellIndex,
} from '../js/engine/index.js';
import { nextRotation } from '../js/engine/rotation.js';

const sameSet = (a, b) => JSON.stringify(a.map(String).sort()) === JSON.stringify(b.map(String).sort());

test('4 clockwise turns, or CW then CCW, return to the starting cells', () => {
  for (const piece of PIECES) {
    for (let start = 0; start < 4; start++) {
      let r = start;
      for (let i = 0; i < 4; i++) r = nextRotation(r, 1);
      assert.equal(r, start);
      assert.equal(nextRotation(nextRotation(start, 1), -1), start);
    }
  }
});

test('repeated rotation on an open board never drifts', () => {
  const board = createBoard();
  for (const piece of PIECES) {
    let p = { pieceIndex: piece.index, rotation: 0, x: 4, y: 12 };
    for (let i = 0; i < 40; i++) p = tryRotate(board, p, i % 3 === 0 ? -1 : 1);
    // 40 turns: 14 CCW and 26 CW = net 12 CW = full circles.
    assert.deepEqual(p, { pieceIndex: piece.index, rotation: 0, x: 4, y: 12 }, piece.id);
  }
});

test('each state is a true 90 degree turn of the previous one (same shape)', () => {
  const norm = (cells) => {
    const mx = Math.min(...cells.map(([x]) => x));
    const my = Math.min(...cells.map(([, y]) => y));
    return cells.map(([x, y]) => `${x - mx},${y - my}`).sort().join(' ');
  };
  for (const piece of PIECES) {
    for (let r = 0; r < 4; r++) {
      const turned = getRotationCells(piece.index, r).map(([x, y]) => [-y, x]);
      assert.equal(norm(turned), norm(getRotationCells(piece.index, (r + 1) % 4)), `${piece.id} r${r}`);
    }
  }
});

test('fully symmetric pieces (O4, X5) do not move when rotated', () => {
  for (const id of ['O4', 'X5']) {
    const { index, cells } = getPieceById(id);
    for (let r = 1; r < 4; r++) {
      assert.ok(sameSet(getRotationCells(index, r), cells), `${id} r${r}`);
    }
  }
});

test('half-turn symmetric pieces do not wobble between matching states', () => {
  for (const id of ['I3', 'I4', 'I5', 'S4', 'S4m', 'Z5', 'Z5m']) {
    const { index } = getPieceById(id);
    assert.ok(sameSet(getRotationCells(index, 0), getRotationCells(index, 2)), `${id} 0/2`);
    assert.ok(sameSet(getRotationCells(index, 1), getRotationCells(index, 3)), `${id} 1/3`);
  }
});

test('kick list is exactly the documented order', () => {
  assert.deepEqual(KICK_OFFSETS.map((k) => [...k]), [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]);
});

// I4 vertical (rotation 1) occupies column x + 1, rows y - 2 .. y + 1.
const I4 = getPieceById('I4').index;
const block = (board, x, y) => { board[cellIndex(x, y)] = 1; };

test('blocked rotation tries left before right', () => {
  const board = createBoard();
  block(board, 7, 10); // blocks the in-place result (cols 4..7)
  const result = tryRotate(board, { pieceIndex: I4, rotation: 1, x: 4, y: 10 }, 1);
  assert.deepEqual(result, { pieceIndex: I4, rotation: 2, x: 3, y: 10 });
});

test('blocked rotation kicks right when left is also blocked', () => {
  const board = createBoard();
  block(board, 4, 10); // blocks in place (4..7) and one left (3..6)
  const result = tryRotate(board, { pieceIndex: I4, rotation: 1, x: 4, y: 10 }, 1);
  assert.deepEqual(result, { pieceIndex: I4, rotation: 2, x: 5, y: 10 });
});

test('two columns left is tried before two columns right', () => {
  const board = createBoard();
  block(board, 6, 10); // blocks 0, -1, +1, and +2; leaves -2 (cols 2..5)
  const result = tryRotate(board, { pieceIndex: I4, rotation: 1, x: 4, y: 10 }, 1);
  assert.deepEqual(result, { pieceIndex: I4, rotation: 2, x: 2, y: 10 });
});

test('two columns right is used when every closer kick is blocked', () => {
  const board = createBoard();
  block(board, 5, 10); // in all target ranges except +2 (cols 6..9)
  const result = tryRotate(board, { pieceIndex: I4, rotation: 1, x: 4, y: 10 }, 1);
  assert.deepEqual(result, { pieceIndex: I4, rotation: 2, x: 6, y: 10 });
});

test('the one-row-up kick is tried last', () => {
  const board = createBoard();
  block(board, 3, 10); // with (7, 10), blocks every horizontal kick
  block(board, 7, 10);
  const result = tryRotate(board, { pieceIndex: I4, rotation: 1, x: 4, y: 10 }, 1);
  assert.deepEqual(result, { pieceIndex: I4, rotation: 2, x: 4, y: 9 });
});

test('a rotation with no fitting kick returns null', () => {
  const board = createBoard();
  for (let x = 0; x < 12; x++) {
    for (let y = 5; y < 15; y++) {
      if (x !== 5) block(board, x, y);
    }
  }
  const start = { pieceIndex: I4, rotation: 1, x: 4, y: 10 };
  assert.equal(tryRotate(board, start, 1), null);
  assert.equal(tryRotate(board, start, -1), null);
  assert.deepEqual(start, { pieceIndex: I4, rotation: 1, x: 4, y: 10 });
});
