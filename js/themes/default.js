/**
 * js/themes/default.js - PLACEHOLDER default theme until Stage 6.
 *
 * Stage 6 replaces this with the era themes (mainframe, minicomputer, home
 * computer, workstation, modern). Until then this is the only palette.
 *
 * Piece colours: 27 bright colours picked for distinctness on the dark
 * well (every pair differs by at least 25 CIELAB delta-E, and every colour
 * has lightness L* >= 50). Loosely grouped by size: trominoes are soft
 * pastels, tetrominoes saturated primaries, pentominoes run around the
 * hue wheel.
 */

/**
 * @typedef {object} Theme
 * @property {string} name
 * @property {string} background Playfield background (#rrggbb).
 * @property {readonly string[]} bankTints Playfield background per memory
 *   bank (#rrggbb): bank 1 uses the first, and the list repeats for banks
 *   beyond its length. See tintForBank in themes/index.js.
 * @property {string} grid Grid line colour (any CSS colour).
 * @property {Readonly<Record<string, string>>} pieceColors Piece id to #rrggbb.
 */

/** @type {Readonly<Theme>} */
export const DEFAULT_THEME = Object.freeze({
  name: 'default',
  background: '#10142a',
  // PLACEHOLDER bank tints. Each is a different hue but all are very dark
  // (relative luminance under 0.02), so the vivid blocks, the faint logo,
  // and the green text keep their contrast; tests/themes.test.js checks it.
  bankTints: Object.freeze([
    '#10142a', // 1 navy (the Stage 2 background)
    '#0c2226', // 2 deep teal
    '#1e1232', // 3 violet
    '#0e2414', // 4 forest
    '#2a1022', // 5 wine
    '#251a0c', // 6 umber
  ]),
  grid: 'rgba(79, 124, 255, 0.12)',
  pieceColors: Object.freeze({
    // Trominoes
    I3: '#ff99cc',
    L3: '#ffbb99',
    // Tetrominoes
    I4: '#00e5ff',
    O4: '#ffe01a',
    T4: '#bd42fa',
    L4: '#ff8c1a',
    L4m: '#3d7eff',
    S4: '#1ded3f',
    S4m: '#fa3848',
    // Pentominoes
    F5: '#ff837a',
    F5m: '#ff4400',
    I5: '#ffdc7a',
    L5: '#bbff00',
    L5m: '#c9ee63',
    N5: '#b6f6ac',
    N5m: '#8cff7a',
    P5: '#00ffaa',
    P5m: '#acf6e7',
    T5: '#29ffe2',
    U5: '#19afe6',
    V5: '#a3e0ff',
    W5: '#a3bcff',
    X5: '#c788f2',
    Y5: '#ee63ee',
    Y5m: '#ff00ee',
    Z5: '#ff00aa',
    Z5m: '#ff528b',
  }),
});
