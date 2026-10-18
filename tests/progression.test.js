/**
 * tests/progression.test.js - Bank table, gravity curve, scoring, and
 * progress events (Stage 3); microchip bonuses (playtest pass 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECES, getPieceById, groupPiecesBySize, validateWeights, createBag, createRng, createGame,
} from '../js/engine/index.js';
import {
  BANK_TABLE, GRAVITY_RAMP, PENTOMINO_TIERS, EXCLUDED_PIECES, withoutExcluded, getBank, gravityForBank,
  LINE_CLEAR_POINTS, lineClearPoints, isFullWord, dropPoints, createProgress,
  CHIPS_PER_CLEAR, CHIP_VALUE, chipsForClear, cashInPoints,
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

test('pentomino tiers and the excluded list cover every pentomino exactly once', () => {
  const tiers = [...PENTOMINO_TIERS.easy, ...PENTOMINO_TIERS.medium, ...PENTOMINO_TIERS.hard];
  assert.deepEqual([...tiers, ...EXCLUDED_PIECES].sort(), idsOfSize(5).sort());
  assert.equal(new Set([...tiers, ...EXCLUDED_PIECES]).size, tiers.length + EXCLUDED_PIECES.length);
});

// --- the curated pool ---------------------------------------------------------------

test('excluded pieces: X5, V5, W5, F5, F5m, Z5, Z5m, still defined in the engine', () => {
  assert.deepEqual([...EXCLUDED_PIECES].sort(), ['F5', 'F5m', 'V5', 'W5', 'X5', 'Z5', 'Z5m']);
  assert.ok(Object.isFrozen(EXCLUDED_PIECES));
  for (const id of EXCLUDED_PIECES) assert.ok(getPieceById(id), `${id} is still an engine piece`);
  assert.equal(PIECES.length, 27);
});

test('weight tables only reference allowed ids, in every bank', () => {
  for (let bank = 1; bank <= 40; bank++) {
    for (const id of Object.keys(getBank(bank).weights)) {
      assert.ok(!EXCLUDED_PIECES.includes(id), `bank ${bank} lists ${id}`);
    }
  }
});

test('an excluded id added to a table by mistake is removed', () => {
  assert.deepEqual(withoutExcluded({ O4: 2, X5: 3, V5: 1, I5: 1 }), { O4: 2, I5: 1 });
});

test('no bank ever deals an excluded piece: bags across banks and seeds', () => {
  for (let bank = 1; bank <= 8; bank++) {
    const { weights } = getBank(bank);
    const size = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const seed of [1, 2, 3, 99]) {
      const bag = createBag(createRng(seed), weights);
      for (let i = 0; i < size * 5; i++) {
        const id = PIECES[bag.next()].id;
        assert.ok(!EXCLUDED_PIECES.includes(id), `bank ${bank} seed ${seed} dealt ${id}`);
      }
    }
  }
  // And through a whole game with the engine dealing (spawn + preview).
  const game = createGame({ seed: 7, weights: getBank(5).weights });
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const state = game.getState();
    if (state.active) seen.add(state.active.id);
    for (const p of state.preview) seen.add(p.id);
    if (state.phase === 'gameOver') break;
    game.hardDrop();
    for (let t = 0; t < 40; t++) game.step();
    game.drainEvents();
  }
  for (const id of EXCLUDED_PIECES) assert.ok(!seen.has(id), `dealt ${id}`);
  assert.ok(seen.size > 5);
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
    ['I5', 'L5', 'L5m', 'P5', 'P5m', 'T5', 'U5', 'Y5', 'Y5m'],
  );
  for (const weights of [two, three]) {
    const tetromino = weights.T4;
    for (const id of inMix(weights).filter((i) => getPieceById(i).size === 5)) {
      assert.ok(weights[id] < tetromino, `${id} is low weight`);
    }
  }
});

const DEALT_PENTOMINOES = idsOfSize(5).filter((id) => !EXCLUDED_PIECES.includes(id));

test('bank 4 has every dealt pentomino, all at 2', () => {
  const weights = getBank(4).weights;
  assert.deepEqual(inMix(weights).filter((id) => getPieceById(id).size === 5).sort(), DEALT_PENTOMINOES.sort());
  for (const id of DEALT_PENTOMINOES) assert.equal(weights[id], 2, id);
  assert.equal(Object.values(weights).reduce((a, b) => a + b, 0), 38);
});

test('bank 5 and beyond: every allowed piece, medium and hard pentominoes at 3', () => {
  const five = getBank(5).weights;
  assert.equal(inMix(five).length, PIECES.length - EXCLUDED_PIECES.length);
  for (const id of PENTOMINO_TIERS.easy) assert.equal(five[id], 2, id);
  for (const id of [...PENTOMINO_TIERS.medium, ...PENTOMINO_TIERS.hard]) assert.equal(five[id], 3, id);
  assert.equal(Object.values(five).reduce((a, b) => a + b, 0), 44);
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
    { score: 0, bank: 1, totalLines: 0, bankLines: 0, linesToComplete: 10, chips: 0 });
});

test('drops and clears add to the score, with scoreChanged events', () => {
  const progress = createProgress();
  assert.deepEqual(progress.handle(locked(3, 10)),
    [{ type: 'scoreChanged', score: 23, points: 23, reason: 'drop' }]);
  assert.deepEqual(progress.handle(locked(0, 0)), [], 'no points, no event');
  assert.deepEqual(progress.handle(cleared(1)),
    [{ type: 'scoreChanged', score: 23 + 64, points: 64, reason: 'lines' }]);
  assert.deepEqual(progress.handle(cleared(4)), [
    { type: 'scoreChanged', score: 23 + 64 + 512, points: 512, reason: 'lines' },
    { type: 'chipsEarned', count: 3, total: 3, fullWord: false },
  ]);
  assert.deepEqual(progress.handle({ type: 'spawned' }), []);
  assert.deepEqual(progress.handle({ type: 'clearStarted', count: 4 }), [], 'scored on linesCleared only');
  assert.equal(progress.getState().totalLines, 5);
});

test('a 5-line clear emits fullWord', () => {
  const progress = createProgress();
  const events = progress.handle(cleared(5));
  assert.deepEqual(events.map((e) => e.type), ['scoreChanged', 'fullWord', 'chipsEarned']);
  assert.equal(events[1].bank, 1);
  assert.equal(events[2].fullWord, true);
  assert.deepEqual(progress.handle(cleared(1)).map((e) => e.type), ['scoreChanged']);
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
  // Chips: 3 + 3 + 1, cashed in at bank 1: 7 x 0x100 x 1.
  assert.deepEqual(progress.getState(),
    { score: 512 + 512 + 128 + 7 * 256, bank: 2, totalLines: 10, bankLines: 0, linesToComplete: 10, chips: 0 });
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

// --- microchips ------------------------------------------------------------------

test('chips table: single rows earn none; 2, 3, 4 rows earn 1, 2, 3; FULL WORD earns 5', () => {
  assert.deepEqual(CHIPS_PER_CLEAR, [0, 0, 1, 2, 3, 5]);
  assert.deepEqual([1, 2, 3, 4, 5].map(chipsForClear), [0, 1, 2, 3, 5]);
  assert.ok(chipsForClear(5) > 0, 'a FULL WORD always earns chips (its sound is part of the chips sound)');
  for (const bad of [0, 6, 1.5, -1]) assert.throws(() => chipsForClear(bad), RangeError);
});

test('cash-in: chips x CHIP_VALUE (0x100) x the bank just completed', () => {
  assert.equal(CHIP_VALUE, 0x100);
  assert.equal(cashInPoints(3, 1), 0x300);
  assert.equal(cashInPoints(3, 2), 0x600);
  assert.equal(cashInPoints(10, 7), 10 * 256 * 7);
  assert.equal(cashInPoints(0, 9), 0);
  assert.throws(() => cashInPoints(-1, 1), RangeError);
  assert.throws(() => cashInPoints(1, 0), RangeError);
});

test('chips accumulate during the bank; single-row clears earn none', () => {
  const progress = createProgress();
  assert.deepEqual(progress.handle(cleared(2)).at(-1), { type: 'chipsEarned', count: 1, total: 1, fullWord: false });
  assert.deepEqual(progress.handle(cleared(3)).at(-1), { type: 'chipsEarned', count: 2, total: 3, fullWord: false });
  assert.ok(!progress.handle(cleared(1)).some((e) => e.type === 'chipsEarned'));
  assert.equal(progress.getState().chips, 3);
});

test('the bank-completing clear counts, then all chips are cashed in at the bank multiplier and reset', () => {
  const progress = createProgress();
  progress.handle(cleared(4)); // 3 chips
  progress.handle(cleared(3)); // 2 chips (7 lines)
  const before = progress.getState().score;
  const events = progress.handle(cleared(3)); // 2 more chips, completes bank 1
  assert.deepEqual(events.map((e) => e.type), ['scoreChanged', 'chipsEarned', 'chipsCashed', 'scoreChanged', 'bankComplete']);
  assert.deepEqual(events[1], { type: 'chipsEarned', count: 2, total: 7, fullWord: false });
  assert.deepEqual(events[2], { type: 'chipsCashed', count: 7, points: 7 * 0x100 * 1, bank: 1 });
  assert.deepEqual(events[3], { type: 'scoreChanged', score: before + 256 + 7 * 256, points: 7 * 256, reason: 'chips' });
  // The score includes the cash-in the moment the bank completes.
  assert.equal(progress.getState().score, before + 256 + 7 * 256);
  assert.equal(progress.getState().chips, 0);

  // Bank 2: the multiplier is the bank just completed (2).
  progress.handle(cleared(5)); // 5 chips
  progress.handle(cleared(4)); // 3 chips
  const second = progress.handle(cleared(1)).find((e) => e.type === 'chipsCashed');
  assert.deepEqual(second, { type: 'chipsCashed', count: 8, points: 8 * 0x100 * 2, bank: 2 });
});

test('a bank completed with no chips cashes nothing in', () => {
  const progress = createProgress();
  for (let i = 0; i < 9; i++) progress.handle(cleared(1));
  const events = progress.handle(cleared(1));
  assert.deepEqual(events.map((e) => e.type), ['scoreChanged', 'bankComplete']);
});

test('game over before the bank completes loses uncashed chips', () => {
  const progress = createProgress();
  progress.handle(cleared(2));
  progress.handle(cleared(4));
  const score = progress.getState().score;
  assert.deepEqual(progress.handle({ type: 'gameOver', reason: 'blockOut' }), [{ type: 'chipsLost', count: 4 }]);
  assert.equal(progress.getState().score, score, 'no points for lost chips');
  assert.equal(progress.getState().chips, 0);
  // With nothing held, game over reports nothing.
  assert.deepEqual(createProgress().handle({ type: 'gameOver', reason: 'lockOut' }), []);
});

test('several banks in one clear: the first cash-in takes every chip', () => {
  const progress = createProgress({
    banks: (bank) => ({ bank, linesToComplete: 2, gravityMsPerRow: 500, weights: { O4: 1 } }),
  });
  const events = progress.handle(cleared(5));
  assert.deepEqual(events.filter((e) => e.type === 'chipsCashed'), [{ type: 'chipsCashed', count: 5, points: 5 * 256, bank: 1 }]);
});
