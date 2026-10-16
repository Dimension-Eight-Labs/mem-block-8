/**
 * tests/reset-bag.test.js - setWeights(weights, { resetBag: true }): the new
 * mix starts at once, the preview stays consistent, and games stay
 * deterministic across a bank change (Stage 4).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBag, createRng, createGame, getPieceById } from '../js/engine/index.js';
import { getBank } from '../js/progression/index.js';

const I3 = getPieceById('I3').index;
const O4 = getPieceById('O4').index;
const NO_DELAYS = Object.freeze({ lineClearDelayMs: 0, spawnDelayMs: 0 });

test('default setWeights finishes the current bag first', () => {
  const bag = createBag(createRng(1), { I3: 3 });
  assert.equal(bag.next(), I3);
  assert.equal(bag.remaining(), 2);
  bag.setWeights({ O4: 1 });
  assert.deepEqual([bag.next(), bag.next(), bag.next()], [I3, I3, O4]);
});

test('resetBag discards the rest of the bag; the next piece is from the new table', () => {
  const bag = createBag(createRng(1), { I3: 3 });
  bag.next();
  bag.setWeights({ O4: 1 }, { resetBag: true });
  assert.equal(bag.remaining(), 0);
  assert.deepEqual([bag.next(), bag.next(), bag.next()], [O4, O4, O4]);
});

test('an invalid table with resetBag throws and leaves the bag untouched', () => {
  const bag = createBag(createRng(1), { I3: 3 });
  bag.next();
  assert.throws(() => bag.setWeights({ Nope: 1 }, { resetBag: true }), RangeError);
  assert.equal(bag.remaining(), 2);
  assert.equal(bag.next(), I3);
});

test('the previewed piece is still the next piece; the new mix starts after it', () => {
  for (const previewCount of [1, 3]) {
    const game = createGame({ weights: { I3: 5 }, previewCount, ...NO_DELAYS });
    game.hardDrop();
    const shown = game.getState().preview.map((p) => p.id);
    assert.deepEqual(shown, Array(previewCount).fill('I3'));
    game.setWeights({ O4: 1 }, { resetBag: true });
    assert.deepEqual(game.getState().preview.map((p) => p.id), shown, 'preview unchanged');

    const dealt = [];
    for (let i = 0; i < previewCount + 4; i++) {
      game.hardDrop();
      dealt.push(game.getState().active.id);
    }
    assert.deepEqual(dealt, [...Array(previewCount).fill('I3'), ...Array(4).fill('O4')], `preview ${previewCount}`);
  }
});

test('without resetBag the old mix keeps coming until its bag runs out', () => {
  const game = createGame({ weights: { I3: 8 }, ...NO_DELAYS });
  game.hardDrop();
  game.setWeights({ O4: 1 });
  game.hardDrop();
  assert.equal(game.getState().preview[0].id, 'I3', 'old bag still dealing');
});

/** A fixed script with a bank change (bank 1 -> 2 weights) at a fixed tick. */
function playAcrossBankChange(seed, resetBag) {
  const game = createGame({ seed, weights: getBank(1).weights, gravityMsPerRow: 60 });
  const spawned = [];
  for (let tick = 0; tick < 6000 && !game.getState().gameOver; tick++) {
    if (tick === 240) game.setWeights(getBank(2).weights, { resetBag });
    // Each piece: a seed-independent sideways offset (spreading the stack
    // so the game lasts), then a hard drop.
    if (tick % 40 === 0) {
      const shift = ((tick / 40) % 11) - 5;
      for (let i = 0; i < Math.abs(shift); i++) game[shift < 0 ? 'moveLeft' : 'moveRight']();
    }
    if (tick % 40 === 20) game.hardDrop();
    game.step();
    for (const e of game.drainEvents()) if (e.type === 'spawned') spawned.push(`${e.tick}:${e.id}`);
  }
  return spawned;
}

test('a bank change with resetBag replays identically for the same seed', () => {
  for (const seed of [5, 77]) {
    const a = playAcrossBankChange(seed, true);
    assert.deepEqual(a, playAcrossBankChange(seed, true));
    assert.ok(a.filter((entry) => Number(entry.split(':')[0]) > 240).length >= 15, 'enough pieces after the change');
  }
  assert.notDeepEqual(playAcrossBankChange(5, true), playAcrossBankChange(5, false),
    'resetBag changes what is dealt after the bank change');
});

test('after a reset, pentominoes from the new bank appear right away', () => {
  const game = createGame({ seed: 3, weights: getBank(1).weights, ...NO_DELAYS, previewCount: 1 });
  game.setWeights({ P5: 1 }, { resetBag: true });
  game.hardDrop(); // deals the previewed bank 1 piece
  assert.equal(game.getState().preview[0].id, 'P5');
});
