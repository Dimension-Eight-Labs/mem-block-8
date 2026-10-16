/**
 * tests/format.test.js - The number formatter (hex / binary / decimal at
 * every register width), the mode cycle, mode persistence, HUD row sizing,
 * and canvas font loading (Stage 4).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NUMBER_MODES, DEFAULT_NUMBER_MODE, REGISTERS, formatNumber, nextMode,
} from '../js/ui/format.js';
import { createNumberMode } from '../js/ui/number-mode.js';
import { hudLabel, hudRowChars } from '../js/ui/hud.js';
import { createStorage, createChoiceStore, NUMBER_MODE_KEY, KEY_PREFIX } from '../js/storage/index.js';
import { loadFonts } from '../js/render/fonts.js';

const FIELDS = ['score', 'highScore', 'bank', 'lines', 'chips', 'words', 'cashIn'];
const digitsOf = (text, mode) => text.slice(mode === 'dec' ? 0 : 2).replaceAll(' ', '');

// --- the width table ---------------------------------------------------------

test('register table: score 24-bit, bank 8-bit, lines 16-bit, chips 8-bit, digits derived from bits', () => {
  assert.deepEqual(
    Object.fromEntries(FIELDS.map((f) => [f, REGISTERS[f].bits])),
    { score: 24, highScore: 24, bank: 8, lines: 16, chips: 8, words: 16, cashIn: 16 },
  );
  for (const f of FIELDS) {
    const r = REGISTERS[f];
    assert.equal(r.hex, r.bits / 4, f);
    assert.equal(r.bin, r.bits, f);
    assert.equal(r.dec, String(2 ** r.bits - 1).length, f);
    assert.ok(r.label.length <= 3, f);
  }
  assert.deepEqual([REGISTERS.score.dec, REGISTERS.bank.dec, REGISTERS.lines.dec], [8, 3, 5]);
});

// --- every mode at every width --------------------------------------------------

test('zero and the maximum fill every field exactly, in every mode', () => {
  for (const f of FIELDS) {
    const r = REGISTERS[f];
    const max = 2 ** r.bits - 1;
    for (const mode of NUMBER_MODES) {
      for (const value of [0, max]) {
        const text = formatNumber(value, f, mode);
        assert.equal(digitsOf(text, mode).length, r[mode], `${f} ${mode} ${value}`);
      }
    }
    assert.equal(formatNumber(0, f, 'hex'), `0x${'0'.repeat(r.hex)}`);
    assert.equal(formatNumber(max, f, 'hex'), `0x${'F'.repeat(r.hex)}`);
    assert.equal(formatNumber(max, f, 'dec'), String(max));
    assert.equal(digitsOf(formatNumber(max, f, 'bin'), 'bin'), '1'.repeat(r.bin));
  }
});

test('hex: lowercase 0x, uppercase digits, zero padded', () => {
  assert.equal(formatNumber(0x1a40, 'highScore', 'hex'), '0x001A40');
  assert.equal(formatNumber(0x400, 'score', 'hex'), '0x000400');
  assert.equal(formatNumber(2, 'bank', 'hex'), '0x02');
  assert.equal(formatNumber(0x13, 'lines', 'hex'), '0x0013');
  assert.equal(formatNumber(264, 'words', 'hex'), '0x0108');
});

test('binary: 0b prefix, 4-bit nibbles separated by spaces', () => {
  assert.equal(formatNumber(0x1a40, 'lines', 'bin'), '0b0001 1010 0100 0000');
  assert.equal(formatNumber(2, 'bank', 'bin'), '0b0000 0010');
  assert.equal(formatNumber(0, 'score', 'bin'), '0b0000 0000 0000 0000 0000 0000');
  assert.equal(formatNumber(0x400, 'score', 'bin'), '0b0000 0000 0000 0100 0000 0000');
  for (const f of FIELDS) {
    const groups = formatNumber(12345 % 2 ** REGISTERS[f].bits, f, 'bin').slice(2).split(' ');
    assert.ok(groups.every((g) => /^[01]{4}$/.test(g)), f);
    assert.equal(groups.length, REGISTERS[f].bits / 4, f);
  }
});

test('decimal: no prefix, zero padded', () => {
  assert.equal(formatNumber(1024, 'score', 'dec'), '00001024');
  assert.equal(formatNumber(2, 'bank', 'dec'), '002');
  assert.equal(formatNumber(19, 'lines', 'dec'), '00019');
});

test('a value too big for its register widens the field, never truncates', () => {
  // Score past 24 bits (16,777,215).
  assert.equal(formatNumber(0x1000000, 'score', 'hex'), '0x1000000');
  assert.equal(formatNumber(0x1000000, 'score', 'dec'), '16777216');
  assert.equal(formatNumber(123456789, 'score', 'dec'), '123456789');
  assert.equal(formatNumber(0x1000000, 'score', 'bin'), '0b0001 0000 0000 0000 0000 0000 0000');
  // Bank past 8 bits, lines past 16 bits.
  assert.equal(formatNumber(256, 'bank', 'hex'), '0x100');
  assert.equal(formatNumber(256, 'bank', 'bin'), '0b0001 0000 0000');
  assert.equal(formatNumber(1000, 'bank', 'dec'), '1000');
  assert.equal(formatNumber(65536, 'lines', 'hex'), '0x10000');
  assert.equal(formatNumber(65536, 'lines', 'dec'), '65536');
  // Every digit survives whatever the size.
  for (const value of [2 ** 30, Number.MAX_SAFE_INTEGER]) {
    assert.equal(parseInt(digitsOf(formatNumber(value, 'bank', 'hex'), 'hex'), 16), value);
    assert.equal(BigInt(`0b${digitsOf(formatNumber(value, 'bank', 'bin'), 'bin')}`), BigInt(value));
    assert.equal(Number(formatNumber(value, 'bank', 'dec')), value);
  }
});

test('bad input is rejected loudly', () => {
  assert.throws(() => formatNumber(-1, 'score', 'hex'), RangeError);
  assert.throws(() => formatNumber(1.5, 'score', 'hex'), RangeError);
  assert.throws(() => formatNumber(NaN, 'score', 'hex'), RangeError);
  assert.throws(() => formatNumber(1, 'nope', 'hex'), RangeError);
  assert.throws(() => formatNumber(1, 'score', 'oct'), RangeError);
});

// --- the cycle and persistence -----------------------------------------------

test('modes cycle hex -> binary -> decimal -> hex; hex is the default', () => {
  assert.deepEqual(NUMBER_MODES, ['hex', 'bin', 'dec']);
  assert.equal(DEFAULT_NUMBER_MODE, 'hex');
  assert.equal(nextMode('hex'), 'bin');
  assert.equal(nextMode('bin'), 'dec');
  assert.equal(nextMode('dec'), 'hex');
});

function memoryBackend() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); } };
}
const modeStore = (backend) =>
  createChoiceStore(createStorage(() => backend), NUMBER_MODE_KEY, NUMBER_MODES, DEFAULT_NUMBER_MODE);

test('the mode is saved as mem-block-8:numberMode and restored on load', () => {
  const backend = memoryBackend();
  const mode = createNumberMode(modeStore(backend));
  assert.equal(mode.get(), 'hex');
  const seen = [];
  mode.onChange((m) => seen.push(m));
  assert.equal(mode.cycle(), 'bin');
  assert.equal(mode.cycle(), 'dec');
  assert.deepEqual(seen, ['bin', 'dec']);
  assert.equal(KEY_PREFIX + NUMBER_MODE_KEY, 'mem-block-8:numberMode');
  assert.equal(backend.map.get('mem-block-8:numberMode'), 'dec');
  // A new session over the same storage starts in the saved mode.
  assert.equal(createNumberMode(modeStore(backend)).get(), 'dec');
});

test('a corrupt saved mode reads as hex', () => {
  for (const raw of ['', 'HEX', 'oct', '{"mode":"bin"}']) {
    const backend = memoryBackend();
    backend.map.set('mem-block-8:numberMode', raw);
    assert.equal(createNumberMode(modeStore(backend)).get(), 'hex', raw);
  }
  assert.equal(modeStore(memoryBackend()).set('oct'), false, 'unknown modes are not saved');
});

test('the mode still cycles when storage throws; it is just not remembered', () => {
  const throwing = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  const mode = createNumberMode(modeStore(throwing));
  assert.equal(mode.get(), 'hex');
  assert.equal(mode.cycle(), 'bin');
  assert.equal(mode.get(), 'bin');
  const noStorage = createNumberMode(createChoiceStore(createStorage(() => { throw new Error('denied'); }),
    NUMBER_MODE_KEY, NUMBER_MODES, DEFAULT_NUMBER_MODE));
  assert.equal(noStorage.cycle(), 'bin');
});

// --- HUD sizing ----------------------------------------------------------------

const hudTexts = (values, mode) => Object.fromEntries(
  ['score', 'highScore', 'bank', 'lines', 'chips'].map((f) => [f, formatNumber(values[f], f, mode)]),
);
const ZERO = { score: 0, highScore: 0, bank: 1, lines: 0, chips: 0 };

test('HUD labels line up: 3 characters plus a space', () => {
  assert.deepEqual(['score', 'highScore', 'bank', 'lines', 'chips'].map(hudLabel), ['SCR ', 'HI  ', 'BNK ', 'LNS ', 'CHP ']);
});

test('CHP: an 8-bit register in every mode', () => {
  assert.equal(formatNumber(3, 'chips', 'hex'), '0x03');
  assert.equal(formatNumber(3, 'chips', 'bin'), '0b0000 0011');
  assert.equal(formatNumber(3, 'chips', 'dec'), '003');
  assert.equal(formatNumber(255, 'chips', 'hex'), '0xFF');
  assert.equal(formatNumber(256, 'chips', 'hex'), '0x100', 'widens, never truncates');
});

test('HUD row length: two columns for hex and decimal, one register per row for binary', () => {
  // "SCR 0x000400  HI  0x001A40"
  assert.equal(hudRowChars(hudTexts(ZERO, 'hex'), 'hex'), 26);
  // "SCR 00001024  HI  00006720"
  assert.equal(hudRowChars(hudTexts(ZERO, 'dec'), 'dec'), 26);
  // "SCR 0b0000 0000 0000 0000 0000 0000"
  assert.equal(hudRowChars(hudTexts(ZERO, 'bin'), 'bin'), 35);
  // Fixed widths: the row length does not change as numbers grow within range.
  const busy = { score: 0xabcdef, highScore: 0xffffff, bank: 255, lines: 65535, chips: 255 };
  for (const mode of NUMBER_MODES) {
    assert.equal(hudRowChars(hudTexts(busy, mode), mode), hudRowChars(hudTexts(ZERO, mode), mode), mode);
  }
  // A widened register makes the row longer (the CSS then shrinks the font).
  const huge = { ...ZERO, score: 0x1000000 };
  assert.equal(hudRowChars(hudTexts(huge, 'hex'), 'hex'), 27);
  assert.equal(hudRowChars(hudTexts(huge, 'bin'), 'bin'), 40);
});

// --- canvas font loading ---------------------------------------------------------

/** A timer the test fires by hand. */
function manualTimer() {
  const pending = [];
  return { set: (fn) => pending.push(fn), fire: () => pending.splice(0).forEach((fn) => fn()) };
}

test('fonts: ready resolves true once loaded', async () => {
  const timer = manualTimer();
  const fonts = loadFonts({ load: async () => [{}] }, ['400 16px "X"'], 1500, timer.set);
  assert.equal(await fonts.ready, true);
  assert.equal(await fonts.loaded, true);
});

test('fonts: a slow load times out for the first draw, then reports when it lands', async () => {
  const timer = manualTimer();
  let finish;
  const fonts = loadFonts({ load: () => new Promise((r) => { finish = r; }) }, ['400 16px "X"'], 1500, timer.set);
  timer.fire();
  assert.equal(await fonts.ready, false, 'draw without waiting any longer');
  finish([{}]);
  assert.equal(await fonts.loaded, true, 'then redraw');
});

test('fonts: failure, no matching face, or no Font Loading API never block', async () => {
  const timer = manualTimer();
  const failed = loadFonts({ load: () => Promise.reject(new Error('404')) }, ['x'], 1500, timer.set);
  assert.equal(await failed.ready, false);
  const none = loadFonts({ load: async () => [] }, ['x'], 1500, timer.set);
  assert.equal(await none.loaded, false);
  const missing = loadFonts(undefined);
  assert.equal(await missing.ready, false);
});
