/**
 * tests/settings.test.js - The settings table (Stage 5): defaults, saving
 * and restoring, storage that throws, the NUMBER FORMAT row staying in
 * sync with the HUD's number mode, the settings screen lines, and adding
 * rows without other changes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, SETTING_ROWS, ON_OFF } from '../js/ui/settings.js';
import { createChoice } from '../js/ui/choice.js';
import { screenLines } from '../js/ui/screens.js';
import { createStorage, createChoiceStore } from '../js/storage/index.js';

function memoryBackend() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); } };
}
const throwingBackend = () => ({
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
});
const values = (settings) => Object.fromEntries(settings.rows().map((r) => [r.id, r.value]));

test('rows: music, sound effects, number format; defaults on, on, hex', () => {
  assert.deepEqual(SETTING_ROWS.map((r) => r.id), ['music', 'sfx', 'numberMode']);
  assert.deepEqual(SETTING_ROWS.map((r) => r.label), ['MUSIC', 'SOUND FX', 'NUMBER FORMAT']);
  assert.deepEqual(ON_OFF, ['on', 'off']);
  const settings = createSettings(createStorage(() => memoryBackend()));
  assert.deepEqual(values(settings), { music: 'ON', sfx: 'ON', numberMode: 'HEX' });
});

test('changes are saved under namespaced keys and restored on load', () => {
  const backend = memoryBackend();
  const settings = createSettings(createStorage(() => backend));
  assert.equal(settings.cycle('music'), 'off');
  assert.equal(settings.cycle('sfx'), 'off');
  assert.equal(settings.cycle('numberMode'), 'bin');
  assert.deepEqual(Object.fromEntries(backend.map), {
    'mem-block-8:music': 'off', 'mem-block-8:soundFx': 'off', 'mem-block-8:numberMode': 'bin',
  });
  const again = createSettings(createStorage(() => backend));
  assert.deepEqual(values(again), { music: 'OFF', sfx: 'OFF', numberMode: 'BIN' });
  assert.equal(again.cycle('music'), 'on', 'on / off cycles back');
});

test('corrupt saved values read as the defaults', () => {
  const backend = memoryBackend();
  backend.map.set('mem-block-8:music', 'loud');
  backend.map.set('mem-block-8:soundFx', 'OFF');
  backend.map.set('mem-block-8:numberMode', 'oct');
  assert.deepEqual(values(createSettings(createStorage(() => backend))), { music: 'ON', sfx: 'ON', numberMode: 'HEX' });
});

test('storage that throws: defaults, toggles still work for the session', () => {
  for (const getBackend of [throwingBackend, () => { throw new Error('denied'); }, () => null]) {
    const settings = createSettings(createStorage(getBackend));
    assert.deepEqual(values(settings), { music: 'ON', sfx: 'ON', numberMode: 'HEX' });
    assert.equal(settings.cycle('music'), 'off');
    assert.equal(settings.choice('music').get(), 'off');
    assert.equal(settings.cycle('numberMode'), 'bin');
  }
});

test('the HUD number mode and the NUMBER FORMAT row are one state', () => {
  const backend = memoryBackend();
  const settings = createSettings(createStorage(() => backend));
  const numberMode = settings.choice('numberMode'); // what js/main.js hands the HUD and screens
  const heard = [];
  settings.onChange((id, value) => heard.push(`${id}=${value}`));
  const hudHeard = [];
  numberMode.onChange((mode) => hudHeard.push(mode));

  numberMode.cycle(); // a tap on the HUD
  assert.equal(values(settings).numberMode, 'BIN');
  settings.cycle('numberMode'); // the settings row
  assert.equal(numberMode.get(), 'dec');
  assert.deepEqual(hudHeard, ['bin', 'dec'], 'the HUD hears settings changes');
  assert.deepEqual(heard, ['numberMode=bin', 'numberMode=dec'], 'the settings screen hears HUD taps');
  assert.equal(backend.map.get('mem-block-8:numberMode'), 'dec');
  settings.cycle('numberMode');
  assert.equal(numberMode.get(), 'hex', 'wraps');
});

test('choice: set refuses unknown values; cycle wraps', () => {
  const store = createChoiceStore(createStorage(() => memoryBackend()), 'x', ['a', 'b', 'c'], 'a');
  const choice = createChoice(store, ['a', 'b', 'c'], 'a');
  assert.equal(choice.set('z'), false);
  assert.equal(choice.get(), 'a');
  assert.equal(choice.set('c'), true);
  assert.equal(choice.cycle(), 'a');
  assert.throws(() => createSettings(createStorage(() => memoryBackend())).choice('nope'), RangeError);
});

test('settings screen: a button per row, then BACK', () => {
  const settings = createSettings(createStorage(() => memoryBackend()));
  settings.cycle('sfx');
  const lines = screenLines('settings', { rows: settings.rows() });
  assert.equal(lines[0].text, 'SETTINGS');
  const buttons = lines.filter((l) => l.kind === 'button');
  assert.deepEqual(buttons.map((b) => [b.text, b.command, b.setting]), [
    ['MUSIC: ON', 'setting', 'music'],
    ['SOUND FX: OFF', 'setting', 'sfx'],
    ['NUMBER FORMAT: HEX', 'setting', 'numberMode'],
    ['BACK', 'back', undefined],
  ]);
  // Same lines in the same order whatever the values, so text updates in place.
  settings.cycle('music');
  const kinds = (rows) => screenLines('settings', { rows }).map((l) => `${l.kind}:${l.command}`);
  assert.deepEqual(kinds(settings.rows()), kinds(createSettings(createStorage(() => memoryBackend())).rows()));
});

test('a new row (Stage 6) appears, saves, and restores with no other change', () => {
  const backend = memoryBackend();
  const rows = [...SETTING_ROWS, { id: 'theme', label: 'THEME', key: 'theme', choices: ['dim8', 'amber'], fallback: 'dim8' }];
  const settings = createSettings(createStorage(() => backend), rows);
  assert.equal(settings.rows().at(-1).value, 'DIM8');
  settings.cycle('theme');
  assert.equal(backend.map.get('mem-block-8:theme'), 'amber');
  const buttons = screenLines('settings', { rows: createSettings(createStorage(() => backend), rows).rows() })
    .filter((l) => l.command === 'setting');
  assert.equal(buttons.at(-1).text, 'THEME: AMBER');
});
