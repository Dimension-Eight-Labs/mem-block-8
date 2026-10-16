/**
 * tests/touch-guard.test.js - Touch guards register correctly and spare real controls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installTouchGuards, allowsNativeTouch, NATIVE_TOUCH_SELECTOR } from '../js/touch-guard.js';

/** Minimal event target that records listeners. */
function fakeTarget() {
  const listeners = [];
  return {
    listeners,
    addEventListener: (type, handler, options) => listeners.push({ type, handler, options }),
    fire(type, target) {
      let prevented = false;
      const event = { type, target, preventDefault: () => { prevented = true; } };
      for (const l of listeners.filter((x) => x.type === type)) l.handler(event);
      return prevented;
    },
  };
}

/** A fake element; `native` decides whether closest() finds an opt-out ancestor. */
const element = (native) => ({ closest: (sel) => (sel === NATIVE_TOUCH_SELECTOR && native ? {} : null) });

test('touch listeners are non-passive so preventDefault works in WebKit', () => {
  const doc = fakeTarget();
  const container = fakeTarget();
  installTouchGuards(doc, container);
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    const l = container.listeners.find((x) => x.type === type);
    assert.ok(l, type);
    assert.equal(l.options.passive, false, type);
  }
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    const l = doc.listeners.find((x) => x.type === type);
    assert.ok(l, type);
    assert.equal(l.options.passive, false, type);
  }
  assert.ok(container.listeners.some((x) => x.type === 'dblclick'));
});

test('game-area touches and double clicks are cancelled', () => {
  const doc = fakeTarget();
  const container = fakeTarget();
  installTouchGuards(doc, container);
  const canvas = element(false);
  for (const type of ['touchstart', 'touchmove', 'touchend', 'dblclick']) {
    assert.equal(container.fire(type, canvas), true, type);
  }
  assert.equal(doc.fire('gesturestart', canvas), true);
});

test('real controls keep native touches (pause menu, Stage 5 settings)', () => {
  const doc = fakeTarget();
  const container = fakeTarget();
  installTouchGuards(doc, container);
  const button = element(true);
  assert.equal(container.fire('touchend', button), false);
  assert.equal(container.fire('dblclick', button), false);
  assert.equal(allowsNativeTouch(button), true);
  assert.equal(allowsNativeTouch(element(false)), false);
  assert.equal(allowsNativeTouch(null), false);
  assert.equal(allowsNativeTouch({}), false, 'targets without closest() (e.g. text nodes) are guarded');
  assert.match(NATIVE_TOUCH_SELECTOR, /\[data-native-touch\]/);
  assert.match(NATIVE_TOUCH_SELECTOR, /button/);
});
