/**
 * js/engine/constants.js - Board dimensions and simulation timing.
 *
 * COORDINATE SYSTEM
 * -----------------
 * The well is 12 columns wide and 26 rows tall: 4 hidden spawn rows on
 * top of the 22 visible rows.
 *
 *   x: 0..11, left to right.
 *   y: 0..25, top to bottom (y grows downward, like screen coordinates).
 *
 *      x = 0 ............ 11
 *   y = 0   +------------+   \
 *       1   |            |    | hidden spawn rows (HIDDEN_ROWS = 4)
 *       2   |            |    | pieces appear here, never drawn
 *       3   |            |   /
 *       4   +------------+   \
 *       .   |            |    | visible rows (VISIBLE_ROWS = 22)
 *      25   +------------+   /  row 25 is the floor row
 *
 * The board is a flat Uint8Array of COLS * TOTAL_ROWS cells, indexed as
 * y * COLS + x. A cell holds 0 when empty, otherwise the piece index + 1
 * of the piece that placed it, so the renderer can colour by piece type.
 */

/** Number of columns in the well. */
export const COLS = 12;

/** Number of rows the player can see. */
export const VISIBLE_ROWS = 22;

/** Number of rows above the visible area where pieces spawn. */
export const HIDDEN_ROWS = 4;

/** Total rows stored in the board (hidden + visible). */
export const TOTAL_ROWS = HIDDEN_ROWS + VISIBLE_ROWS;

/** Simulation rate. Fixed so behaviour is identical on 60 Hz and 120 Hz screens. */
export const TICKS_PER_SECOND = 120;

/** Length of one simulation step, in milliseconds (about 8.33 ms). */
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/*
 * Internal time unit. TICK_MS is not a whole number, so adding it up as a
 * float would make timers drift and make exact tick counts awkward to
 * reason about. Instead the engine measures time in 1/120 ms units: one
 * tick is exactly 1000 units and any whole-millisecond config value is a
 * whole number of units. All timer arithmetic is then exact integers.
 */

/** Internal time units per millisecond. */
export const TIME_UNITS_PER_MS = TICKS_PER_SECOND;

/** Internal time units per simulation tick (exactly TICK_MS milliseconds). */
export const TIME_UNITS_PER_TICK = 1000;
