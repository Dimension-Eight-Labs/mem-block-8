/**
 * js/storage/index.js - localStorage wrapper for Mem Block 8.
 *
 * Responsibility: the only module allowed to touch localStorage. Persists
 * settings and the high score on this device only (nothing ever leaves it).
 *
 * Every access is wrapped in try/catch: storage can be missing, can throw
 * on access (private browsing, blocked site data, sandboxed frames), and
 * can throw on write (quota full). On any failure reads return the
 * fallback and writes report false, so the game plays normally and simply
 * forgets between sessions.
 *
 * Does NOT belong here: game rules or UI.
 */

/** Prefix for every key, so the app never collides with others on the same origin. */
export const KEY_PREFIX = 'mem-block-8:';

/** Key (after the prefix) holding the high score. */
export const HIGH_SCORE_KEY = 'highScore';

/** Key (after the prefix) holding the number display mode ('hex', 'bin', 'dec'). */
export const NUMBER_MODE_KEY = 'numberMode';

/**
 * @typedef {object} Storage
 * @property {(key: string) => string | null} getItem Raw string, or null if absent or unavailable.
 * @property {(key: string, value: string) => boolean} setItem Whether the write succeeded.
 */

/**
 * Create a storage wrapper.
 * @param {() => (globalThis.Storage | null | undefined)} [getBackend] Returns the
 *   backing store. Default: localStorage. A function, because merely reading
 *   the localStorage property can throw in some browsers.
 * @returns {Storage}
 */
export function createStorage(getBackend = () => globalThis.localStorage) {
  return {
    getItem(key) {
      try {
        const backend = getBackend();
        return backend ? backend.getItem(KEY_PREFIX + key) : null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        const backend = getBackend();
        if (!backend) return false;
        backend.setItem(KEY_PREFIX + key, value);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * @typedef {object} HighScoreStore
 * @property {() => number} get Saved high score, or 0.
 * @property {(score: number) => boolean} set Save a score; whether it was saved.
 */

/**
 * The high score, kept as a decimal string under mem-block-8:highScore.
 * Anything stored there that is not a non-negative safe integer (hand
 * edits, an old format) reads as 0 rather than breaking the game.
 * @param {Storage} storage
 * @returns {HighScoreStore}
 */
export function createHighScoreStore(storage) {
  return {
    get() {
      const raw = storage.getItem(HIGH_SCORE_KEY);
      if (raw === null || !/^\d+$/.test(raw)) return 0;
      const value = Number(raw);
      return Number.isSafeInteger(value) ? value : 0;
    },
    set(score) {
      if (!Number.isSafeInteger(score) || score < 0) return false;
      return storage.setItem(HIGH_SCORE_KEY, String(score));
    },
  };
}

/**
 * @typedef {object} ChoiceStore
 * @property {() => string} get The saved choice, or the fallback if nothing
 *   valid is saved (or storage is unavailable).
 * @property {(value: string) => boolean} set Save a choice; whether it was saved.
 *   Values outside the allowed list are refused.
 */

/**
 * A setting that is one of a fixed list of strings, such as the number
 * display mode. Anything else found in storage reads as the fallback.
 * @param {Storage} storage
 * @param {string} key Key after the mem-block-8: prefix.
 * @param {readonly string[]} choices
 * @param {string} fallback
 * @returns {ChoiceStore}
 */
export function createChoiceStore(storage, key, choices, fallback) {
  return {
    get() {
      const raw = storage.getItem(key);
      return choices.includes(raw) ? raw : fallback;
    },
    set(value) {
      if (!choices.includes(value)) return false;
      return storage.setItem(key, value);
    },
  };
}
