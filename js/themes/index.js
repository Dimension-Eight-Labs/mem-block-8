/**
 * js/themes/index.js - Era theme definitions for Mem Block 8.
 *
 * Responsibility: describe each visual theme based on a computing era
 * (mainframe, minicomputer, home computer, workstation, modern): piece
 * colours, well and surround colours, and any era-specific styling.
 *
 * Belongs here: plain data objects describing themes, plus small helpers
 * that read them.
 *
 * Does NOT belong here: drawing code (js/render receives a theme as input)
 * or storing the chosen theme (js/storage).
 *
 * Stage 2 adds a placeholder default theme; Stage 3 adds per-bank
 * playfield tints; era themes arrive in Stage 6.
 */

export { DEFAULT_THEME } from './default.js';

/**
 * Playfield background for a memory bank, cycling through the theme's
 * bankTints (bank 1 = first tint). Falls back to the theme background
 * when a theme has no tints.
 * @param {import('./default.js').Theme} theme
 * @param {number} bank 1 and up.
 * @returns {string} #rrggbb
 */
export function tintForBank(theme, bank) {
  const tints = theme.bankTints;
  if (!tints || tints.length === 0) return theme.background;
  return tints[(bank - 1) % tints.length];
}
