/**
 * tests/rng.test.js - Seeded PRNG determinism.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/engine/index.js';

const take = (rng, n) => Array.from({ length: n }, () => rng.nextUint32());

test('same seed gives the same sequence', () => {
  assert.deepEqual(take(createRng(1234), 200), take(createRng(1234), 200));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(take(createRng(1), 20), take(createRng(2), 20));
});

test('pinned output for seed 8 (changing this changes every seeded game)', () => {
  assert.deepEqual(take(createRng(8), 3), PINNED);
});

test('nextFloat is in [0, 1) and nextInt in [0, n)', () => {
  const rng = createRng(99);
  for (let i = 0; i < 5000; i++) {
    const f = rng.nextFloat();
    assert.ok(f >= 0 && f < 1);
    const n = rng.nextInt(7);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 7);
  }
});

const PINNED = [671282643, 2685180315, 1291344547];
