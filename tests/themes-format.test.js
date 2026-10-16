/**
 * tests/themes-format.test.js - Per-bank playfield tints (Stage 3).
 * Number formatting moved to tests/format.test.js in Stage 4.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THEME, tintForBank } from '../js/themes/index.js';
import { hexToRgb, lighten } from '../js/render/color.js';

/** WCAG relative luminance of #rrggbb. */
function luminance(color) {
  const [r, g, b] = hexToRgb(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio. */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const ACCENT = '#39ff9f'; // --color-accent in css/main.css

test('bank 1 keeps the Stage 2 background; tints cycle after the list ends', () => {
  const tints = DEFAULT_THEME.bankTints;
  assert.ok(tints.length >= 6);
  assert.equal(tintForBank(DEFAULT_THEME, 1), DEFAULT_THEME.background);
  for (let bank = 1; bank <= tints.length * 3; bank++) {
    assert.equal(tintForBank(DEFAULT_THEME, bank), tints[(bank - 1) % tints.length]);
  }
  assert.equal(tintForBank({ background: '#123456' }, 4), '#123456', 'no tints: plain background');
});

test('tints are distinct', () => {
  const tints = DEFAULT_THEME.bankTints;
  assert.equal(new Set(tints).size, tints.length);
  for (let i = 0; i < tints.length; i++) {
    for (let j = i + 1; j < tints.length; j++) {
      const a = hexToRgb(tints[i]);
      const b = hexToRgb(tints[j]);
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      assert.ok(distance >= 15, `${tints[i]} vs ${tints[j]}`);
    }
  }
});

test('tints stay dark: blocks and green text keep strong contrast', () => {
  for (const tint of DEFAULT_THEME.bankTints) {
    assert.ok(luminance(tint) < 0.02, `${tint} is dark`);
    assert.ok(contrast(tint, ACCENT) >= 10, `${tint} vs green text`);
    for (const [id, color] of Object.entries(DEFAULT_THEME.pieceColors)) {
      assert.ok(contrast(tint, color) >= 4, `${tint} vs ${id} ${color}`);
    }
  }
});

test('the logo stays a slightly lighter shade of every tint', () => {
  for (const tint of DEFAULT_THEME.bankTints) {
    const base = hexToRgb(tint);
    const logo = hexToRgb(lighten(tint, 0.07));
    assert.ok(logo.every((c, i) => c > base[i] && c - base[i] < 24), tint);
  }
});
