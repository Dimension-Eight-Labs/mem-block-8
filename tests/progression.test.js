/**
 * tests/progression.test.js - Bank table, gravity curve, scoring, and
 * progress events (Stage 3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, getPieceById, groupPiecesBySize, validateWeights } from '../js/engine/index.js';
import {
  BANK_TABLE, GRAVITY_RAMP, PENTOMINO_TIERS, getBank, gravityForBank,
  LINE_CLEAR_POINTS, lineClearPoints, isFullWord, dropPoints, createProgress,
} from '../js/progression/index.js';

const sizes = groupPiecesBySize();
const idsOfSize = (n) => sizes.get(n).map((p) => p.id);
const inMix = (weights) => Object.keys(weights).filter((id) => weights[id] > 0);

// --- bank table ----------------------------------------------------------------

test('every weight table references only real piece ids and is valid', () => {
  for (let bank = 1; bank <= BANK_TABLE.length + 3; bank++) {
    const { weights } = getBank(bank);
    for (const id of Object.keys(weights)) assert.ok(getPieceById(id), id);
    assert.doesNotThrow(() => validateWeights(weights));
  }
});

test('pentomino tiers cover every pentomino exactly once', () => {
  const tiers = [...PENTOMINO_TIERS.easy, ...PENTOMINO_TIERS.medium, ...PENTOMINO_TIERS.hard];
  assert.deepEqual([...tiers].sort(), idsOfSize(5).sort());
  assert.equal(new Set(tiers).size, tiers.length);
});

test('bank 1 deals only trominoes and tetrominoes', () => {
  const mix = inMix(getBank(1).weights);
  assert.deepEqual(mix.sort(), [...idsOfSize(3), ...idsOfSize(4)].sort());
});

test('banks 2 and 3 add the easy, then the medium pentominoes at low weight', () => {
  const two = getBank(2).weights;
  assert.deepEqual(inMix(two).filter((id) => id.endsWith('5') || id.endsWith('5m')).sort(),
    ['I5', 'L5', 'L5m', 'P5', 'P5m']);
  const three = getBank(3).weights;
  assert.deepEqual(
    inMix(three).filter((id) => getPieceById(id).size === 5).sort(),
    ['I5', 'L5', 'L5m', 'P5', 'P5m', 'T5', 'U5', 'V5', 'Y5', 'Y5m'],
  );
  for (const weights of [two, three]) {
    const tetromino = weights.T4;
    for (const id of inMix(weights).filter((i) => getPieceById(i).size === 5)) {
      assert.ok(weights[id] < tetromino, `${id} is low weight`);
    }
  }
});

test('bank 4 has every pentomino, the hard ones at low weight', () => {
  const weights = getBank(4).weights;
  assert.deepEqual(inMix(weights).filter((id) => getPieceById(id).size === 5).sort(), idsOfSize(5).sort());
  for (const id of PENTOMINO_TIERS.hard) {
    assert.ok(weights[id] < weights.I5, `${id} lower than the earlier pentominoes`);
  }
});

test('bank 5 and beyond: the full mix at final weights', () => {
  const five = getBank(5).weights;
  assert.equal(inMix(five).length, PIECES.length);
  assert.deepEqual(getBank(6).weights, five);
  assert.deepEqual(getBank(40).weights, five);
});

test('the ramp goes through the mix first: pentomino share never falls', () => {
  let previous = -1;
  for (let bank = 1; bank <= 6; bank++) {
    const weights = getBank(bank).weights;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const pent = Object.entries(weights)
      .filter(([id]) => getPieceById(id).size === 5)
      .reduce((a, [, w]) => a + w, 0);
    assert.ok(pent / total >= previous, `bank ${bank}`);
    previous = pent / total;
  }
});

test('the specified gravity values for banks 1-5', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(gravityForBank), [900, 900, 900, 750, 750]);
});

test('every bank needs 10 lines for now', () => {
  for (let bank = 1; bank <= 30; bank++) assert.equal(getBank(bank).linesToComplete, 10);
});

test('gravity curve: x0.8 per bank from bank 6, whole ms, floored at 60', () => {
  assert.deepEqual(GRAVITY_RAMP, { numerator: 4, denominator: 5, floorMs: 60 });
  const expected = [600, 480, 384, 307, 246, 197, 158, 126, 101, 81, 65, 60, 60];
  assert.deepEqual(expected.map((_, i) => gravityForBank(6 + i)), expected);
});

test('gravity is monotonic (never slower in a later bank), whole, and floored', () => {
  let previous = Infinity;
  for (let bank = 1; bank <= 300; bank++) {
    const ms = gravityForBank(bank);
    assert.ok(Number.isInteger(ms), `bank ${bank}`);
    assert.ok(ms <= previous, `bank ${bank}`);
    assert.ok(ms >= GRAVITY_RAMP.floorMs, `bank ${bank}`);
    previous = ms;
  }
  assert.equal(gravityForBank(1_000_000), GRAVITY_RAMP.floorMs);
});

test('bank lookups reject non-banks', () => {
  for (const bad of [0, -1, 1.5, NaN, '2']) {
    assert.throws(() => getBank(bad), RangeError);
    assert.throws(() => gravityForBank(bad), RangeError);
  }
  assert.equal(getBank(7).bank, 7);
  assert.ok(Object.isFrozen(getBank(2)));
});

// --- scoring -------------------------------------------------------------------

test('line clear points are powers of two, 0x40 to 0x400', () => {
  assert.deepEqual(LINE_CLEAR_POINTS.slice(1), [0x40, 0x80, 0x100, 0x200, 0x400]);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => lineClearPoints(n, 1)), [64, 128, 256, 512, 1024]);
});

test('line clear points are multiplied by the bank number', () => {
  for (const bank of [1, 2, 3, 7, 16]) {
    for (let lines = 1; lines <= 5; lines++) {
      const points = lineClearPoints(lines, bank);
      assert.equal(points, LINE_CLEAR_POINTS[lines] * bank);
      assert.ok(Number.isInteger(points));
    }
  }
  assert.equal(lineClearPoints(5, 3), 3072);
});

test('impossible line counts and banks are rejected', () => {
  for (const lines of [0, 6, 2.5, -1]) assert.throws(() => lineClearPoints(lines, 1), RangeError);
  for (const bank of [0, 1.5]) assert.throws(() => lineClearPoints(1, bank), RangeError);
});

test('only a 5-line clear is a FULL WORD', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(isFullWord), [false, false, false, false, true]);
});

test('drop bonus: 1 per soft-dropped row, 2 per hard-dropped row', () => {
  assert.equal(dropPoints({ softDropRows: 0, dropDistance: 0 }), 0);
  assert.equal(dropPoints({ softDropRows: 7, dropDistance: 0 }), 7);
  assert.equal(dropPoints({ softDropRows: 0, dropDistance: 13 }), 26);
  assert.equal(dropPoints({ softDropRows: 4, dropDistance: 10 }), 24);
});

// --- progress ------------------------------------------------------------------

const locked = (softDropRows, dropDistance) =>
  ({ type: 'locked', softDropRows, dropDistance, hardDrop: dropDistance > 0 });
const cleared = (count) => ({ type: 'linesCleared', count });

test('progress starts in bank 1 with nothing scored', () => {
  assert.deepEqual(createProgress().getState(),
    { score: 0, bank: 1, totalLines: 0, bankLines: 0, linesToComplete: 10 });
});

test('drops and clears add to the score, with scoreChanged events', () => {
  const progress = createProgress();
  assert.deepEqual(progress.handle(locked(3, 10)),
    [{ type: 'scoreChanged', score: 23, points: 23, reason: 'drop' }]);
  assert.deepEqual(progress.handle(locked(0, 0)), [], 'no points, no event');
  assert.deepEqual(progress.handle(cleared(4)),
    [{ type: 'scoreChanged', score: 23 + 512, points: 512, reason: 'lines' }]);
  assert.deepEqual(progress.handle({ type: 'spawned' }), []);
  assert.deepEqual(progress.handle({ type: 'clearStarted', count: 4 }), [], 'scored on linesCleared only');
  assert.equal(progress.getState().totalLines, 4);
});

test('a 5-line clear emits fullWord', () => {
  const progress = createProgress();
  const events = progress.handle(cleared(5));
  assert.deepEqual(events.map((e) => e.type), ['scoreChanged', 'fullWord']);
  assert.equal(events[1].bank, 1);
  assert.deepEqual(progress.handle(cleared(4)).map((e) => e.type), ['scoreChanged']);
});

test('filling a bank emits bankComplete with the next bank settings', () => {
  const progress = createProgress();
  progress.handle(cleared(4));
  progress.handle(cleared(4));
  const events = progress.handle(cleared(2));
  const bank = events.find((e) => e.type === 'bankComplete');
  assert.deepEqual(
    { from: bank.fromBank, to: bank.toBank, gravity: bank.gravityMsPerRow },
    { from: 1, to: 2, gravity: getBank(2).gravityMsPerRow },
  );
  assert.deepEqual(bank.weights, getBank(2).weights);
  assert.deepEqual(progress.getState(),
    { score: 512 + 512 + 128, bank: 2, totalLines: 10, bankLines: 0, linesToComplete: 10 });
  assert.equal(progress.getBankSettings().bank, 2);
});

test('lines past a full bank carry over into the next one', () => {
  const progress = createProgress();
  progress.handle(cleared(4));
  progress.handle(cleared(4));
  progress.handle(cleared(5)); // 13 lines: bank complete with 3 extra
  const state = progress.getState();
  assert.equal(state.bank, 2);
  assert.equal(state.bankLines, 3);
  assert.equal(state.totalLines, 13);
});

test('a clear is scored at the bank it happened in, later clears at the new one', () => {
  const progress = createProgress();
  progress.handle(cleared(5));
  const events = progress.handle(cleared(5)); // completes bank 1 exactly
  assert.equal(events[0].points, 1024, 'bank 1 multiplier');
  assert.equal(events.find((e) => e.type === 'fullWord').bank, 1);
  assert.equal(progress.handle(cleared(1))[0].points, 128, 'bank 2 multiplier');
});

test('a very short custom bank can complete more than once per clear', () => {
  const progress = createProgress({
    banks: (bank) => ({ bank, linesToComplete: 2, gravityMsPerRow: 500, weights: { O4: 1 } }),
  });
  const events = progress.handle(cleared(5));
  assert.deepEqual(events.filter((e) => e.type === 'bankComplete').map((e) => [e.fromBank, e.toBank]),
    [[1, 2], [2, 3]]);
  assert.equal(progress.getState().bankLines, 1);
});

test('progress with engine events end to end: scores are always integers', () => {
  const progress = createProgress();
  let score = 0;
  for (let i = 0; i < 200; i++) {
    for (const e of progress.handle(locked(i % 7, i % 11))) score = e.score ?? score;
    for (const e of progress.handle(cleared((i % 5) + 1))) score = e.score ?? score;
  }
  assert.ok(Number.isSafeInteger(score));
  assert.equal(progress.getState().score, score);
  assert.ok(progress.getState().bank > 50);
});
