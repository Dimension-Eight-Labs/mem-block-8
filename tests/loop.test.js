/**
 * tests/loop.test.js - Fixed-timestep accumulator and loop control.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeTime, createLoop, MAX_FRAME_MS } from '../js/loop.js';
import { TICK_MS } from '../js/engine/index.js';

test('consumeTime runs whole ticks and carries the remainder', () => {
  const r = consumeTime(0, 20, 8);
  assert.deepEqual(r, { steps: 2, accumulator: 4 });
  assert.deepEqual(consumeTime(r.accumulator, 5, 8), { steps: 1, accumulator: 1 });
});

test('long gaps are clamped so a stall does not fast-forward', () => {
  const r = consumeTime(0, 5000, TICK_MS);
  assert.equal(MAX_FRAME_MS, 250);
  assert.equal(r.steps, 30);
  assert.equal(consumeTime(0, -10, TICK_MS).steps, 0, 'clock going backwards is ignored');
});

/** A fake requestAnimationFrame that the test advances by hand. */
function fakeFrames() {
  let pending = null;
  let nextId = 1;
  return {
    requestFrame: (cb) => { pending = cb; return nextId++; },
    cancelFrame: () => { pending = null; },
    fire: (t) => { const cb = pending; pending = null; if (cb) cb(t); },
  };
}

test('about 120 ticks per second at 60 Hz and at 120 Hz', () => {
  for (const hz of [60, 120]) {
    const frames = fakeFrames();
    let steps = 0;
    const loop = createLoop({
      tickMs: TICK_MS, onFrameStart() {}, onFrameEnd() {}, step: () => steps++, ...frames,
    });
    loop.start();
    for (let i = 0; i <= hz; i++) frames.fire((i * 1000) / hz);
    assert.ok(Math.abs(steps - 120) <= 1, `${hz} Hz gave ${steps}`);
  }
});

test('stop cancels the next frame and start resets timing', () => {
  const frames = fakeFrames();
  let steps = 0;
  const loop = createLoop({ tickMs: 10, onFrameStart() {}, onFrameEnd() {}, step: () => steps++, ...frames });
  loop.start();
  frames.fire(0);
  frames.fire(100);
  assert.equal(steps, 10);
  loop.stop();
  assert.equal(loop.isRunning(), false);
  frames.fire(5000);
  loop.start();
  frames.fire(10000); // first frame after start only records the time
  frames.fire(10020);
  assert.equal(steps, 12);
});
