/**
 * js/render/index.js - Canvas drawing for Mem Block 8.
 *
 * Responsibility: turn a read-only snapshot of engine state into pixels on
 * the playfield canvas (well, blocks, falling piece, next-piece preview,
 * the DIM8 mark).
 *
 * Belongs here: canvas sizing (including devicePixelRatio), drawing, and
 * visual-only effects.
 *
 * Does NOT belong here: game rules, input handling, or mutating engine
 * state. HUD and screens live in js/ui; colours come from js/themes and are
 * passed in, never imported here.
 */

export { createRenderer } from './renderer.js';
export { RENDER_DEFAULTS, MONO_FONT } from './options.js';
export { computeLayout } from './layout.js';
export { loadFonts, CANVAS_FONTS, FONT_WAIT_MS } from './fonts.js';
