/**
 * tests/gestures.test.js - Touch gesture recogniser, driven by synthetic samples.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGestureRecognizer, zoneAt, swipeDirection } from '../js/input/gestures.js';
import { TOUCH, GESTURE_ACTIONS } from '../js/input/bindings.js';

// 300 x 550 playfield: left x < 100, right x >= 200, bottom strip y >= 467.5.
const SIZE = { width: 300, height: 550 };
const LEFT = [50, 200];
const RIGHT = [250, 200];
const CENTER = [150, 200];
const BOTTOM = [150, 520];

/** Wraps a recogniser with shorthand helpers that return gesture names. */
function rig(overrides = {}) {
  const r = createGestureRecognizer({ ...TOUCH, ...overrides });
  const send = (type, id, [x, y], t) => r.handle({ id, type, x, y, t }, SIZE).map((g) => g.name);
  return {
    down: (pos, t, id = 1) => send('down', id, pos, t),
    move: (pos, t, id = 1) => send('move', id, pos, t),
    up: (pos, t, id = 1) => send('up', id, pos, t),
    cancel: (pos, t, id = 1) => send('cancel', id, pos, t),
    update: (t) => r.update(t).map((g) => g.name),
    reset: () => r.reset().map((g) => g.name),
  };
}

const shift = ([x, y], dx, dy) => [x + dx, y + dy];

test('zones: thirds, bottom strip priority, and outside points', () => {
  assert.equal(zoneAt(...LEFT, SIZE, TOUCH), 'left');
  assert.equal(zoneAt(...CENTER, SIZE, TOUCH), 'center');
  assert.equal(zoneAt(...RIGHT, SIZE, TOUCH), 'right');
  assert.equal(zoneAt(10, 520, SIZE, TOUCH), 'bottom');
  assert.equal(zoneAt(-30, 100, SIZE, TOUCH), 'left');
  assert.equal(zoneAt(150, 600, SIZE, TOUCH), 'bottom');
});

test('tap left and right move on release by default', () => {
  const g = rig();
  assert.deepEqual(g.down(LEFT, 0), []);
  assert.deepEqual(g.up(LEFT, 100), ['tapLeft']);
  assert.deepEqual(g.down(RIGHT, 1000), []);
  assert.deepEqual(g.up(shift(RIGHT, 5, 5), 1150), ['tapRight']);
  assert.equal(GESTURE_ACTIONS.tapLeft, 'moveLeft');
  assert.equal(GESTURE_ACTIONS.tapRight, 'moveRight');
});

test('moveOn "down" moves on touch-down and not again on release', () => {
  const g = rig({ moveOn: 'down' });
  assert.deepEqual(g.down(LEFT, 0), ['tapLeft']);
  assert.deepEqual(g.up(LEFT, 80), []);
  assert.deepEqual(g.down(RIGHT, 500), ['tapRight']);
  assert.deepEqual(g.up(RIGHT, 560), []);
});

test('a slow release or too much movement is not a tap', () => {
  const g = rig();
  g.down(CENTER, 0);
  assert.deepEqual(g.up(CENTER, 201), []);
  g.down(CENTER, 1000);
  g.move(shift(CENTER, 12, 0), 1050);
  assert.deepEqual(g.up(shift(CENTER, 12, 0), 1100), []);
});

test('holding a side zone repeats after 170 ms, then every 50 ms', () => {
  const g = rig();
  g.down(LEFT, 0);
  assert.deepEqual(g.update(169), []);
  assert.deepEqual(g.update(170), ['holdLeft']);
  assert.deepEqual(g.update(219), []);
  assert.deepEqual(g.update(220), ['holdLeft']);
  assert.deepEqual(g.update(370), ['holdLeft', 'holdLeft', 'holdLeft']);
  assert.deepEqual(g.up(LEFT, 380), [], 'release after repeating is not also a tap');
  assert.deepEqual(g.update(1000), []);
  assert.equal(GESTURE_ACTIONS.holdLeft, 'moveLeft');
});

test('hold repeat with moveOn "down": one move at once, repeats after the delay', () => {
  const g = rig({ moveOn: 'down' });
  assert.deepEqual(g.down(RIGHT, 0), ['tapRight']);
  assert.deepEqual(g.update(170), ['holdRight']);
  assert.deepEqual(g.up(RIGHT, 180), []);
});

test('moving past the tap threshold cancels hold repeat', () => {
  const g = rig();
  g.down(LEFT, 0);
  g.move(shift(LEFT, 0, 15), 50);
  assert.deepEqual(g.update(500), []);
  assert.deepEqual(g.up(shift(LEFT, 0, 15), 520), []);
});

test('centre and bottom holds do not repeat', () => {
  const g = rig();
  g.down(CENTER, 0);
  assert.deepEqual(g.update(1000), []);
});

test('swipe direction maps to rotation, firing mid-swipe', () => {
  const cases = [
    [[-40, 0], 'swipeLeft', 'rotateCCW'],
    [[40, 0], 'swipeRight', 'rotateCW'],
    [[0, -40], 'swipeUp', 'rotateCW'],
    [[0, 40], 'swipeDown', 'rotateCW'],
  ];
  for (const [[dx, dy], name, action] of cases) {
    const g = rig();
    g.down(CENTER, 0);
    assert.deepEqual(g.move(shift(CENTER, dx / 2, dy / 2), 20), [], 'not yet 30 px');
    assert.deepEqual(g.move(shift(CENTER, dx, dy), 40), [name]);
    assert.deepEqual(g.up(shift(CENTER, dx, dy), 60), []);
    assert.equal(GESTURE_ACTIONS[name], action);
  }
  assert.equal(swipeDirection(-30, 29), 'Left', 'dominant axis wins');
  assert.equal(swipeDirection(10, -31), 'Up');
});

test('one rotation per swipe, and a swipe is never also a tap', () => {
  const g = rig();
  g.down(LEFT, 0);
  assert.deepEqual(g.move(shift(LEFT, 35, 0), 30), ['swipeRight']);
  assert.deepEqual(g.move(shift(LEFT, 90, 0), 50), []);
  assert.deepEqual(g.move(LEFT, 70), [], 'coming back does not re-arm');
  assert.deepEqual(g.up(LEFT, 90), [], 'quick and back at the start, still not a tap');
  assert.deepEqual(g.update(1000), [], 'no hold repeat either');
});

test('double tap in the centre is a hard drop (doubleTapMode "center")', () => {
  const g = rig();
  g.down(CENTER, 0);
  assert.deepEqual(g.up(CENTER, 60), ['tapCenter']);
  g.down(shift(CENTER, 20, 20), 200);
  assert.deepEqual(g.up(shift(CENTER, 20, 20), 250), ['doubleTap']);
  assert.equal(GESTURE_ACTIONS.doubleTap, 'hardDrop');
  assert.equal(GESTURE_ACTIONS.tapCenter, null);
});

test('centre double tap: too slow or too far gives two single taps', () => {
  const slow = rig();
  slow.down(CENTER, 0);
  slow.up(CENTER, 50);
  slow.down(CENTER, 301);
  assert.deepEqual(slow.up(CENTER, 340), ['tapCenter']);

  const far = rig();
  far.down(CENTER, 0);
  far.up(CENTER, 50);
  far.down(shift(CENTER, 45, 0), 150);
  assert.deepEqual(far.up(shift(CENTER, 45, 0), 190), ['tapCenter']);
});

test('centre mode: side taps stay instant and never form a double tap', () => {
  const g = rig();
  g.down(LEFT, 0);
  assert.deepEqual(g.up(LEFT, 40), ['tapLeft']);
  g.down(LEFT, 100);
  assert.deepEqual(g.up(LEFT, 140), ['tapLeft']);
});

test('a triple tap in the centre is one double tap plus one tap', () => {
  const g = rig();
  g.down(CENTER, 0);
  g.up(CENTER, 40);
  g.down(CENTER, 100);
  assert.deepEqual(g.up(CENTER, 140), ['doubleTap']);
  g.down(CENTER, 200);
  assert.deepEqual(g.up(CENTER, 240), ['tapCenter']);
});

test('doubleTapMode "anywhere": single taps wait out the window', () => {
  const g = rig({ doubleTapMode: 'anywhere' });
  g.down(LEFT, 0);
  assert.deepEqual(g.up(LEFT, 50), []);
  assert.deepEqual(g.update(300), [], 'still within 250 ms of release');
  assert.deepEqual(g.update(301), ['tapLeft']);
});

test('doubleTapMode "anywhere": double tap in a side zone is a hard drop only', () => {
  const g = rig({ doubleTapMode: 'anywhere' });
  g.down(RIGHT, 0);
  g.up(RIGHT, 50);
  g.down(RIGHT, 200);
  assert.deepEqual(g.up(RIGHT, 240), ['doubleTap']);
  assert.deepEqual(g.update(2000), []);
});

test('doubleTapMode "anywhere": a far second tap releases the first', () => {
  const g = rig({ doubleTapMode: 'anywhere' });
  g.down(LEFT, 0);
  g.up(LEFT, 50);
  g.down(RIGHT, 150);
  assert.deepEqual(g.up(RIGHT, 190), ['tapLeft']);
  assert.deepEqual(g.update(441), ['tapRight']);
});

test('doubleTapMode "anywhere" ignores moveOn "down"', () => {
  const g = rig({ doubleTapMode: 'anywhere', moveOn: 'down' });
  assert.deepEqual(g.down(LEFT, 0), []);
});

test('soft drop: on while held in the bottom strip, off on release', () => {
  const g = rig();
  assert.deepEqual(g.down(BOTTOM, 0), ['softDropStart']);
  assert.deepEqual(g.update(1000), []);
  assert.deepEqual(g.up(BOTTOM, 1500), ['softDropEnd']);
  assert.equal(GESTURE_ACTIONS.softDropStart, 'softDropOn');
  assert.equal(GESTURE_ACTIONS.softDropEnd, 'softDropOff');
});

test('soft drop with two fingers ends when the last one lifts', () => {
  const g = rig();
  assert.deepEqual(g.down(BOTTOM, 0, 1), ['softDropStart']);
  assert.deepEqual(g.down(shift(BOTTOM, 80, 0), 100, 2), []);
  assert.deepEqual(g.up(BOTTOM, 300, 1), []);
  assert.deepEqual(g.up(shift(BOTTOM, 80, 0), 400, 2), ['softDropEnd']);
});

test('a swipe that starts in the bottom strip ends soft drop and rotates', () => {
  const g = rig();
  g.down(BOTTOM, 0);
  assert.deepEqual(g.move(shift(BOTTOM, 0, -40), 30), ['softDropEnd', 'swipeUp']);
  assert.deepEqual(g.up(shift(BOTTOM, 0, -40), 60), []);
});

test('separate fingers are tracked independently', () => {
  const g = rig();
  g.down(BOTTOM, 0, 1); // soft drop held by finger 1
  g.down(LEFT, 100, 2);
  assert.deepEqual(g.up(LEFT, 150, 2), ['tapLeft']);
  g.down(CENTER, 200, 3);
  assert.deepEqual(g.move(shift(CENTER, -40, 0), 230, 3), ['swipeLeft']);
  assert.deepEqual(g.up(BOTTOM, 400, 1), ['softDropEnd']);
});

test('pointer cancel ends cleanly: no tap, no repeat, soft drop off', () => {
  const g = rig();
  g.down(LEFT, 0);
  assert.deepEqual(g.cancel(LEFT, 50), []);
  assert.deepEqual(g.update(1000), []);
  assert.deepEqual(g.up(LEFT, 1010), [], 'late up for a cancelled pointer is ignored');
  g.down(BOTTOM, 2000);
  assert.deepEqual(g.cancel(BOTTOM, 2100), ['softDropEnd']);
});

test('reset ignores touches already down until they lift', () => {
  const g = rig();
  g.down(LEFT, 0, 1);
  g.down(BOTTOM, 0, 2);
  assert.deepEqual(g.reset(), ['softDropEnd']);
  assert.deepEqual(g.update(1000), []);
  assert.deepEqual(g.move(shift(LEFT, 50, 0), 1010, 1), []);
  assert.deepEqual(g.up(LEFT, 1020, 1), []);
  assert.deepEqual(g.up(BOTTOM, 1020, 2), []);
  g.down(LEFT, 2000);
  assert.deepEqual(g.up(LEFT, 2050), ['tapLeft'], 'new touches work again');
});
