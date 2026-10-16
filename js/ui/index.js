/**
 * js/ui/index.js - HUD, screens, and settings for Mem Block 8.
 *
 * Responsibility: DOM elements around and over the playfield: the start /
 * pause menu / bank transition / game-over screens, the FULL WORD banner,
 * the "+3 CHIPS" flash, the chip tally's count-up,
 * the register-dump HUD with the pause button, and the one number
 * formatter, and the settings (a table of rows, shown as a screen).
 *
 * Does NOT belong here: game rules, canvas drawing of the playfield, or
 * direct localStorage access (go through js/storage).
 */

export { createScreens, screenLines, tallyText } from './screens.js';
export { createChipFlash, chipFlashText, chipFlashTop } from './chip-flash.js';
export { tallySteps, tallyValue, tallyDoneAtMs } from './tally.js';
export { createHud, hudLabel, hudRowChars } from './hud.js';
export { createBanner } from './banner.js';
export { createNumberMode } from './number-mode.js';
export { createChoice } from './choice.js';
export { createSettings, SETTING_ROWS, ON_OFF } from './settings.js';
export { NUMBER_MODES, DEFAULT_NUMBER_MODE, REGISTERS, formatNumber, nextMode } from './format.js';
