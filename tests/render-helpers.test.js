/**
 * tests/render-helpers.test.js - Pure helpers behind the renderer and the theme palette.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, rgbToHex, mix, lighten, darken, blockShades } from '../js/render/color.js';
import { computeLayout } from '../js/render/layout.js';
import { logoShapes, LOGO_REF_WIDTH, LOGO_REF_HEIGHT } from '../js/render/logo.js';
import { RENDER_DEFAULTS } from '../js/render/options.js';
import { DEFAULT_THEME } from '../js/themes/default.js';
import { PIECES } from '../js/engine/index.js';

test('hex parsing and formatting', () => {
  assert.deepEqual(hexToRgb('#10142a'), [16, 20, 42]);
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
  assert.equal(rgbToHex([16, 20, 42]), '#10142a');
  assert.equal(rgbToHex([300, -5, 127.6]), '#ff0080');
  assert.throws(() => hexToRgb('red'), TypeError);
});

test('mix, lighten, and darken', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(lighten('#10142a', 0), '#10142a');
  assert.equal(lighten('#10142a', 1), '#ffffff');
  assert.equal(darken('#ff8000', 1), '#000000');
  const faint = hexToRgb(lighten('#10142a', 0.07));
  assert.ok(faint.every((c, i) => c > hexToRgb('#10142a')[i] && c < 70), 'slightly lighter only');
});

test('block shades: light edge is lighter, dark edge darker', () => {
  const sum = (hex) => hexToRgb(hex).reduce((a, b) => a + b, 0);
  const s = blockShades('#3d7eff');
  assert.equal(s.base, '#3d7eff');
  assert.ok(sum(s.light) > sum(s.base) && sum(s.dark) < sum(s.base));
});

test('layout uses whole device-pixel cells that fit the box', () => {
  // iPhone-like box: 390 x 715 CSS px at 3x.
  const l = computeLayout(390, 715, 3, 12, 22);
  assert.equal(l.cell, 97);
  assert.equal(l.width, 97 * 12);
  assert.equal(l.height, 97 * 22);
  assert.ok(l.cssWidth <= 390 && l.cssHeight <= 715);
  // Width-limited box.
  const w = computeLayout(120, 1000, 1, 12, 22);
  assert.equal(w.cell, 10);
  assert.equal(computeLayout(0, 0, 2, 12, 22).cell, 1, 'never zero');
  assert.equal(computeLayout(100, 100, 0, 12, 22).dpr, 1, 'bad dpr falls back to 1');
});

test('logo shapes stay inside the reference box', () => {
  const { segments, dot, word } = logoShapes();
  assert.equal(segments.length, 7);
  for (const polygon of segments) {
    assert.equal(polygon.length, 6);
    for (const [x, y] of polygon) {
      assert.ok(x >= 0 && x <= LOGO_REF_WIDTH && y >= 0 && y <= LOGO_REF_HEIGHT);
    }
  }
  assert.ok(dot.cx + dot.r <= LOGO_REF_WIDTH);
  assert.equal(word.text, 'DIM8 LABS');
  assert.ok(word.baseline <= LOGO_REF_HEIGHT);
});

test('render defaults: logo bottom, preview 60% at 35%, landing indicator off', () => {
  assert.equal(RENDER_DEFAULTS.logoPlacement, 'bottom');
  assert.equal(RENDER_DEFAULTS.previewScale, 0.6);
  assert.equal(RENDER_DEFAULTS.previewAlpha, 0.35);
  assert.equal(RENDER_DEFAULTS.showLandingIndicator, false);
  assert.ok(RENDER_DEFAULTS.logo.center.lighten < RENDER_DEFAULTS.logo.bottom.lighten,
    'centre placement is fainter');
});

test('default theme has 27 valid, distinct piece colours', () => {
  const colors = PIECES.map((p) => DEFAULT_THEME.pieceColors[p.id]);
  colors.forEach((c, i) => assert.match(c ?? '', /^#[0-9a-f]{6}$/, PIECES[i].id));
  assert.equal(new Set(colors).size, 27);
  assert.equal(Object.keys(DEFAULT_THEME.pieceColors).length, 27);
  // Bright enough to stand out on the dark well: no channel-sum below 300.
  for (const c of colors) {
    assert.ok(hexToRgb(c).reduce((a, b) => a + b, 0) >= 300, c);
  }
});
