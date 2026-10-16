/**
 * tests/smoke.test.js - Smoke test for the test setup itself.
 *
 * Proves that Node's built-in test runner can import the browser-side ES
 * modules under js/engine. Real engine tests arrive in Stage 1.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('js/engine/index.js imports as an ES module under Node', async () => {
  const engine = await import('../js/engine/index.js');
  assert.equal(typeof engine, 'object');
});
