/**
 * js/progression/index.js - Memory banks (levels), scoring, and progress.
 *
 * Pure logic like js/engine: no DOM, clocks, storage, or randomness. It
 * reads engine events and decides score, bank, and what the engine should
 * be told next; js/session.js does the telling.
 *
 * Import from here rather than from individual files.
 */

export { BANK_TABLE, GRAVITY_RAMP, PENTOMINO_TIERS, getBank, gravityForBank } from './banks.js';
export {
  LINE_CLEAR_POINTS,
  FULL_WORD_LINES,
  SOFT_DROP_POINTS_PER_ROW,
  HARD_DROP_POINTS_PER_ROW,
  lineClearPoints,
  isFullWord,
  dropPoints,
} from './scoring.js';
export { createProgress } from './progress.js';
