/**
 * js/ui/index.js - HUD, screens, and settings for Mem Block 8.
 *
 * Responsibility: DOM elements around and over the playfield: the start /
 * pause menu / bank transition / game-over screens, the FULL WORD banner,
 * the register-dump HUD with the pause button, and the one number
 * formatter. The settings screen arrives in Stage 5.
 *
 * Does NOT belong here: game rules, canvas drawing of the playfield, or
 * direct localStorage access (go through js/storage).
 */

export { createScreens, screenLines } from './screens.js';
export { createHud, hudLabel, hudRowChars } from './hud.js';
export { createBanner } from './banner.js';
export { createNumberMode } from './number-mode.js';
export { NUMBER_MODES, DEFAULT_NUMBER_MODE, REGISTERS, formatNumber, nextMode } from './format.js';
