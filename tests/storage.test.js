/**
 * tests/storage.test.js - The localStorage wrapper and high score store,
 * including storage that is missing or throws.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, createHighScoreStore, KEY_PREFIX, HIGH_SCORE_KEY } from '../js/storage/index.js';

/** A Map-backed stand-in for localStorage. */
function memoryBackend() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

const throwing = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

test('keys are namespaced as mem-block-8:...', () => {
  assert.equal(KEY_PREFIX + HIGH_SCORE_KEY, 'mem-block-8:highScore');
  const backend = memoryBackend();
  const store = createHighScoreStore(createStorage(() => backend));
  assert.equal(store.set(0x440), true);
  assert.deepEqual([...backend.map], [['mem-block-8:highScore', '1088']]);
});

test('high score round trip, defaulting to 0', () => {
  const backend = memoryBackend();
  const store = createHighScoreStore(createStorage(() => backend));
  assert.equal(store.get(), 0);
  store.set(5000);
  assert.equal(store.get(), 5000);
  // A fresh wrapper over the same backend (a new session) sees it too.
  assert.equal(createHighScoreStore(createStorage(() => backend)).get(), 5000);
});

test('corrupt stored values read as 0', () => {
  for (const raw of ['', 'abc', '-5', '1.5', '1e3', ' 12', '99999999999999999999']) {
    const backend = memoryBackend();
    backend.map.set('mem-block-8:highScore', raw);
    assert.equal(createHighScoreStore(createStorage(() => backend)).get(), 0, JSON.stringify(raw));
  }
});

test('invalid scores are not saved', () => {
  const backend = memoryBackend();
  const store = createHighScoreStore(createStorage(() => backend));
  for (const bad of [-1, 1.5, NaN, Infinity]) assert.equal(store.set(bad), false);
  assert.equal(backend.map.size, 0);
});

test('storage that throws on every call: reads give 0, writes report false', () => {
  const store = createHighScoreStore(createStorage(() => throwing));
  assert.equal(store.get(), 0);
  assert.equal(store.set(100), false);
});

test('storage whose very access throws, or that is missing', () => {
  const getters = [
    () => { throw new Error('SecurityError: localStorage is disabled'); },
    () => null,
    () => undefined,
  ];
  for (const getBackend of getters) {
    const storage = createStorage(getBackend);
    assert.equal(storage.getItem('x'), null);
    assert.equal(storage.setItem('x', '1'), false);
    assert.equal(createHighScoreStore(storage).get(), 0);
  }
});

test('the default backend is safe under Node (no localStorage global needed)', () => {
  const store = createHighScoreStore(createStorage());
  assert.equal(typeof store.get(), 'number');
  assert.equal(typeof store.set(1), 'boolean');
});
