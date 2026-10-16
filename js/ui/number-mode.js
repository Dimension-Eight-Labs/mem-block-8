/**
 * js/ui/number-mode.js - The current number display mode, shared by the
 * HUD and the screens.
 *
 * Tapping the HUD calls cycle(); every listener (HUD, overlay screens)
 * then redraws its numbers. The mode is saved through js/storage and
 * restored on load; if storage is unavailable it simply starts at hex each
 * time.
 */

import { NUMBER_MODES, DEFAULT_NUMBER_MODE, nextMode } from './format.js';

/**
 * @typedef {object} NumberModeState
 * @property {() => import('./format.js').NumberMode} get
 * @property {() => import('./format.js').NumberMode} cycle Advance hex -> bin -> dec -> hex,
 *   save, notify listeners; returns the new mode.
 * @property {(listener: (mode: import('./format.js').NumberMode) => void) => void} onChange
 */

/**
 * @param {{get: () => string, set: (value: string) => boolean}} store Saved
 *   mode (see createChoiceStore in js/storage); get() must return a valid mode.
 * @returns {NumberModeState}
 */
export function createNumberMode(store) {
  let mode = NUMBER_MODES.includes(store.get()) ? store.get() : DEFAULT_NUMBER_MODE;
  /** @type {((mode: import('./format.js').NumberMode) => void)[]} */
  const listeners = [];
  return {
    get: () => mode,
    cycle() {
      mode = nextMode(mode);
      store.set(mode); // failure only means it is not remembered
      for (const listener of listeners) listener(mode);
      return mode;
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}
