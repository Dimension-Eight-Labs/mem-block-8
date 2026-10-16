/**
 * js/engine/index.js - Public API of the Mem Block 8 game engine.
 *
 * The engine is pure logic: no DOM, window, document, timers, clocks, or
 * Math.random. It runs unchanged in browsers and under Node for tests.
 * Time advances only through Game.step() (one TICK_MS tick per call);
 * randomness comes only from the seeded generator in rng.js.
 *
 * Other modules should import from here rather than from individual
 * engine files, so internals can be reorganised freely.
 */

export {
  COLS,
  VISIBLE_ROWS,
  HIDDEN_ROWS,
  TOTAL_ROWS,
  TICKS_PER_SECOND,
  TICK_MS,
} from './constants.js';
export { PIECES, PIECE_COUNT, getPieceById, groupPiecesBySize } from './pieces.js';
export { KICK_OFFSETS, getRotationCells, tryRotate } from './rotation.js';
export { createBoard, cellIndex, collides, findFullRows, clearRows } from './board.js';
export { createRng } from './rng.js';
export { createBag, DEFAULT_WEIGHTS, validateWeights } from './randomizer.js';
export { DEFAULT_CONFIG } from './config.js';
export { createGame, spawnColumn, spawnRow } from './game.js';
export { boardToString, boardFromRows } from './debug.js';
