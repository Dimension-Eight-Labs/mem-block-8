/**
 * tests/keyboard.test.js - Keyboard bindings and custom auto-repeat.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboard } from '../js/input/keyboard.js';
import { KEYS, KEY_REPEAT } from '../js/input/bindings.js';

const kb = () => createKeyboard(KEYS, KEY_REPEAT);

test('bindings match the documented keys', () => {
  const action = (code) => KEYS[code].action;
  assert.equal(action('ArrowLeft'), 'moveLeft');
  assert.equal(action('ArrowRight'), 'moveRight');
  assert.equal(action('ArrowUp'), 'rotateCW');
  assert.equal(action('KeyX'), 'rotateCW');
  assert.equal(action('KeyZ'), 'rotateCCW');
  assert.equal(action('ArrowDown'), 'softDropOn');
  assert.equal(KEYS.ArrowDown.release, 'softDropOff');
  assert.equal(action('Space'), 'hardDrop');
  assert.equal(action('KeyP'), 'pause');
  assert.equal(action('Escape'), 'pause');
  assert.equal(action('Enter'), 'start');
});

test('arrow keys move at once, then repeat after 170 ms every 50 ms', () => {
  const k = kb();
  assert.deepEqual(k.keyDown('ArrowLeft', 0).actions, ['moveLeft']);
  assert.deepEqual(k.update(169), []);
  assert.deepEqual(k.update(170), ['moveLeft']);
  assert.deepEqual(k.update(320), ['moveLeft', 'moveLeft', 'moveLeft']);
  k.keyUp('ArrowLeft', 330);
  assert.deepEqual(k.update(1000), []);
});

test('operating system key repeat is ignored', () => {
  const k = kb();
  k.keyDown('ArrowRight', 0);
  assert.deepEqual(k.keyDown('ArrowRight', 30).actions, []);
  assert.deepEqual(k.keyDown('Space', 40).actions, ['hardDrop']);
  assert.deepEqual(k.keyDown('Space', 70).actions, [], 'holding Space does not drop again');
});

test('the most recent direction wins', () => {
  const k = kb();
  k.keyDown('ArrowLeft', 0);
  assert.deepEqual(k.keyDown('ArrowRight', 100).actions, ['moveRight']);
  assert.deepEqual(k.update(400), ['moveRight', 'moveRight', 'moveRight']); // 270, 320, 370
});

test('Down holds soft drop until released', () => {
  const k = kb();
  assert.deepEqual(k.keyDown('ArrowDown', 0).actions, ['softDropOn']);
  assert.deepEqual(k.update(1000), []);
  assert.deepEqual(k.keyUp('ArrowDown', 1200).actions, ['softDropOff']);
});

test('unbound keys are not handled', () => {
  const k = kb();
  assert.deepEqual(k.keyDown('KeyQ', 0), { handled: false, actions: [] });
  assert.equal(k.keyDown('Space', 0).handled, true);
});

test('reset releases held keys', () => {
  const k = kb();
  k.keyDown('ArrowDown', 0);
  k.keyDown('ArrowLeft', 0);
  assert.deepEqual(k.reset(), ['softDropOff']);
  assert.deepEqual(k.update(1000), []);
  assert.deepEqual(k.keyUp('ArrowDown', 1100).actions, [], 'no second softDropOff');
});
