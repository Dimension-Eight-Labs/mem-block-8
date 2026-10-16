/**
 * js/ui/choice.js - A setting that is one of a fixed list of values.
 *
 * The shared shape behind every settings row (and the HUD's number mode):
 * the current value, set and cycle, change listeners, and saving through a
 * store from js/storage (createChoiceStore). If storage is unavailable the
 * value still changes for this session; it is just not remembered.
 */

/**
 * @typedef {object} Choice
 * @property {() => string} get
 * @property {(value: string) => boolean} set Change the value (notifying
 *   listeners); false if it is not one of the choices.
 * @property {() => string} cycle Advance to the next value (wrapping), save,
 *   notify listeners; returns the new value.
 * @property {(listener: (value: string) => void) => void} onChange
 */

/**
 * @param {{get: () => string, set: (value: string) => boolean}} store
 * @param {readonly string[]} choices
 * @param {string} fallback Used if the store holds nothing valid.
 * @returns {Choice}
 */
export function createChoice(store, choices, fallback) {
  const saved = store.get();
  let value = choices.includes(saved) ? saved : fallback;
  /** @type {((value: string) => void)[]} */
  const listeners = [];

  function set(next) {
    if (!choices.includes(next)) return false;
    value = next;
    store.set(value); // failure only means it is not remembered
    for (const listener of listeners) listener(value);
    return true;
  }

  return {
    get: () => value,
    set,
    cycle() {
      set(choices[(choices.indexOf(value) + 1) % choices.length]);
      return value;
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}
