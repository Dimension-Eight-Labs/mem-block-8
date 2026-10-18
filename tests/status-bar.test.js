/**
 * tests/status-bar.test.js - The iOS status bar workaround (WebKit bug
 * 325807) stays in place: no translucent status bar request in index.html,
 * and the solid #topfix strip iOS samples the bar colour from. Removing
 * either brings back the iOS 27 blur in the installed app; see
 * docs/ARCHITECTURE.md, "iOS status bar".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');

/** Markup with HTML comments removed, so the explanatory comments do not count. */
const markup = html.replace(/<!--[\s\S]*?-->/g, '');

test('index.html asks for no status bar style (no translucent bar)', () => {
  assert.doesNotMatch(markup, /status-bar-style/i);
  assert.match(markup, /<meta name="theme-color"/, 'theme-color stays for Android and desktop');
  assert.match(markup, /viewport-fit=cover/, 'viewport-fit=cover stays');
});

test('#topfix is the first child of body, outside the game container', () => {
  const body = markup.slice(markup.indexOf('<body>') + '<body>'.length).trimStart();
  assert.match(body, /^<div id="topfix" aria-hidden="true"><\/div>/);
});

test('main.css shows #topfix only when standalone, coloured by a CSS variable', () => {
  const hidden = css.match(/(^|\n)#topfix\s*\{([^}]*)\}/);
  assert.ok(hidden, 'a base #topfix rule');
  assert.match(hidden[2], /display:\s*none/);

  const media = css.match(/@media \(display-mode: standalone\)\s*\{\s*#topfix\s*\{([^}]*)\}/);
  assert.ok(media, 'a standalone #topfix rule');
  const rule = media[1];
  assert.match(rule, /display:\s*block/);
  assert.match(rule, /pointer-events:\s*none/);
  const background = rule.match(/background:\s*([^;]+);/);
  assert.ok(background, 'a background');
  assert.match(background[1].trim(), /^var\(--[\w-]+\)$/, 'a CSS variable, not a hard-coded colour');
});
