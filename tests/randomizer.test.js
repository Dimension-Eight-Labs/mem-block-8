/**
 * tests/randomizer.test.js - Weighted bag contents and weight changes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, createBag, PIECES, DEFAULT_WEIGHTS, validateWeights } from '../js/engine/index.js';

const deal = (bag, n) => Array.from({ length: n }, () => PIECES[bag.next()].id);
const tally = (ids) => ids.reduce((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});

test('each bag contains exactly the weighted counts', () => {
  const weights = { I3: 3, O4: 2, X5: 1 };
  const bag = createBag(createRng(5), weights);
  for (let round = 0; round < 10; round++) {
    assert.deepEqual(tally(deal(bag, 6)), weights);
  }
});

test('bags are shuffled (order varies between bags)', () => {
  const bag = createBag(createRng(5), { I3: 4, O4: 4, X5: 4 });
  const orders = new Set(Array.from({ length: 10 }, () => deal(bag, 12).join()));
  assert.ok(orders.size > 1);
});

test('same seed deals the same pieces', () => {
  const a = createBag(createRng(77), DEFAULT_WEIGHTS);
  const b = createBag(createRng(77), DEFAULT_WEIGHTS);
  assert.deepEqual(deal(a, 100), deal(b, 100));
});

test('key order of the weight table does not affect the deal', () => {
  const a = createBag(createRng(3), { I3: 2, T4: 3 });
  const b = createBag(createRng(3), { T4: 3, I3: 2 });
  assert.deepEqual(deal(a, 50), deal(b, 50));
});

test('new weights apply from the next bag, not mid-bag', () => {
  const bag = createBag(createRng(9), { I3: 2, O4: 2 });
  const first = deal(bag, 2);
  bag.setWeights({ T4: 3 });
  const rest = deal(bag, 2);
  assert.deepEqual(tally([...first, ...rest]), { I3: 2, O4: 2 });
  assert.deepEqual(deal(bag, 3), ['T4', 'T4', 'T4']);
});

test('default weights are mostly small pieces', () => {
  validateWeights(DEFAULT_WEIGHTS);
  let small = 0;
  let large = 0;
  for (const piece of PIECES) {
    const count = DEFAULT_WEIGHTS[piece.id] ?? 0;
    if (piece.size === 5) large += count; else small += count;
  }
  assert.ok(large > 0 && small > large * 2);
});

test('invalid weight tables are rejected', () => {
  assert.throws(() => validateWeights({}), RangeError);
  assert.throws(() => validateWeights({ I3: 0 }), RangeError);
  assert.throws(() => validateWeights({ I3: 1.5 }), RangeError);
  assert.throws(() => validateWeights({ I3: -1 }), RangeError);
  assert.throws(() => validateWeights({ Q9: 1 }), RangeError);
  assert.throws(() => validateWeights(null), TypeError);
});
