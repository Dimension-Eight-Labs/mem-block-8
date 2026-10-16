/**
 * js/ui/number-mode.js - The current number display mode, shared by the
 * HUD, the screens, and the settings screen.
 *
 * Tapping the HUD calls cycle(); the NUMBER FORMAT setting changes the
 * same object (js/ui/settings.js), so the two can never disagree. Every
 * listener (HUD, overlay screens) then redraws its numbers. The mode is
 * saved through js/storage and restored on load; if storage is
 * unavailable it simply starts at hex each time.
 */

import { NUMBER_MODES, DEFAULT_NUMBER_MODE } from './format.js';
import { createChoice } from './choice.js';

/**
 * @typedef {import('./choice.js').Choice} NumberModeState
 *   get() and cycle() return a NumberMode: hex -> bin -> dec -> hex.
 */

/**
 * @param {{get: () => string, set: (value: string) => boolean}} store Saved
 *   mode (see createChoiceStore in js/storage).
 * @returns {NumberModeState}
 */
export function createNumberMode(store) {
  return createChoice(store, NUMBER_MODES, DEFAULT_NUMBER_MODE);
}
