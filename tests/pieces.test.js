/**
 * tests/pieces.test.js - The 27-piece set: counts, indices, and uniqueness.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, PIECE_COUNT, getPieceById, groupPiecesBySize } from '../js/engine/index.js';

// Independent geometry helpers, so these tests do not rely on rotation.js.
const normalise = (cells) => {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
const key = (cells) => JSON.stringify(normalise(cells));
const turn = (cells) => cells.map(([x, y]) => [-y, x]);
const mirror = (cells) => cells.map(([x, y]) => [-x, y]);
const rotations = (cells) => {
  const out = [cells];
  for (let i = 0; i < 3; i++) out.push(turn(out[out.length - 1]));
  return out;
};
const oneSidedKey = (cells) => rotations(cells).map(key).sort()[0];
const freeKey = (cells) => [oneSidedKey(cells), oneSidedKey(mirror(cells))].sort()[0];

test('there are exactly 27 pieces', () => {
  assert.equal(PIECES.length, 27);
  assert.equal(PIECE_COUNT, 27);
});

test('sizes: 2 trominoes, 7 tetrominoes, 18 pentominoes', () => {
  const groups = groupPiecesBySize();
  assert.deepEqual([...groups.keys()].sort(), [3, 4, 5]);
  assert.equal(groups.get(3).length, 2);
  assert.equal(groups.get(4).length, 7);
  assert.equal(groups.get(5).length, 18);
  for (const piece of PIECES) {
    assert.equal(piece.cells.length, piece.size, piece.id);
  }
});

test('indices are 0..26, unique, and match list position', () => {
  PIECES.forEach((piece, i) => assert.equal(piece.index, i));
  assert.equal(new Set(PIECES.map((p) => p.id)).size, 27);
});

test('indices are stable (board cells and saves depend on them)', () => {
  const expected = [
    'I3', 'L3', 'I4', 'O4', 'T4', 'L4', 'L4m', 'S4', 'S4m',
    'F5', 'F5m', 'I5', 'L5', 'L5m', 'N5', 'N5m', 'P5', 'P5m',
    'T5', 'U5', 'V5', 'W5', 'X5', 'Y5', 'Y5m', 'Z5', 'Z5m',
  ];
  assert.deepEqual(PIECES.map((p) => p.id), expected);
});

test('base cells are normalised, distinct, and edge-connected', () => {
  for (const { id, cells, width, height } of PIECES) {
    assert.equal(Math.min(...cells.map(([x]) => x)), 0, id);
    assert.equal(Math.min(...cells.map(([, y]) => y)), 0, id);
    assert.equal(width, Math.max(...cells.map(([x]) => x)) + 1, id);
    assert.equal(height, Math.max(...cells.map(([, y]) => y)) + 1, id);
    assert.equal(new Set(cells.map(String)).size, cells.length, `${id} duplicate cell`);
    const seen = new Set(['0']);
    const queue = [0];
    while (queue.length) {
      const [x, y] = cells[queue.shift()];
      cells.forEach(([cx, cy], j) => {
        if (!seen.has(String(j)) && Math.abs(cx - x) + Math.abs(cy - y) === 1) {
          seen.add(String(j));
          queue.push(j);
        }
      });
    }
    assert.equal(seen.size, cells.length, `${id} is not connected`);
  }
});

test('all 27 shapes are distinct one-sided pieces (no duplicates under rotation)', () => {
  const keys = PIECES.map((p) => oneSidedKey(p.cells));
  assert.equal(new Set(keys).size, 27);
});

test('the set is closed under mirroring (no missing mirror images)', () => {
  const keys = new Set(PIECES.map((p) => oneSidedKey(p.cells)));
  for (const piece of PIECES) {
    assert.ok(keys.has(oneSidedKey(mirror(piece.cells))), `${piece.id} mirror missing`);
  }
  // 2 + 5 + 12 free polyominoes of sizes 3, 4, 5.
  assert.equal(new Set(PIECES.map((p) => freeKey(p.cells))).size, 19);
});

test('mirror suffix pairs really are mirror images', () => {
  for (const piece of PIECES.filter((p) => p.id.endsWith('m'))) {
    const base = getPieceById(piece.id.slice(0, -1));
    assert.equal(oneSidedKey(mirror(base.cells)), oneSidedKey(piece.cells), piece.id);
  }
});

test('getPieceById rejects unknown ids', () => {
  assert.equal(getPieceById('X5').id, 'X5');
  assert.throws(() => getPieceById('Q9'), RangeError);
});
