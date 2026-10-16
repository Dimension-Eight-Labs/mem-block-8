/**
 * js/ui/settings.js - The settings, as a table of rows.
 *
 * Each row is one setting with a fixed list of values; tapping its button
 * on the settings screen cycles to the next value. Values are saved through
 * js/storage under mem-block-8:<key> and restored on load. To add a
 * setting (Stage 6: theme, logo placement, control variants), add a row to
 * SETTING_ROWS; the screen, saving, and change notification follow from
 * the table, and whoever needs the value reads settings.choice(id).
 *
 * The NUMBER FORMAT row is the same state the HUD tap cycles, so the two
 * always agree.
 */

import { NUMBER_MODES, DEFAULT_NUMBER_MODE } from './format.js';
import { createChoice } from './choice.js';
import { createChoiceStore, NUMBER_MODE_KEY, MUSIC_KEY, SOUND_FX_KEY } from '../storage/index.js';

/** On / off values. */
export const ON_OFF = Object.freeze(['on', 'off']);

/**
 * @typedef {object} SettingRow
 * @property {string} id
 * @property {string} label As shown on the screen.
 * @property {string} key Storage key (after the mem-block-8: prefix).
 * @property {readonly string[]} choices In cycling order.
 * @property {string} fallback Default, and the value when storage is unavailable.
 */

/** @type {readonly Readonly<SettingRow>[]} */
export const SETTING_ROWS = Object.freeze([
  { id: 'music', label: 'MUSIC', key: MUSIC_KEY, choices: ON_OFF, fallback: 'on' },
  { id: 'sfx', label: 'SOUND FX', key: SOUND_FX_KEY, choices: ON_OFF, fallback: 'on' },
  { id: 'numberMode', label: 'NUMBER FORMAT', key: NUMBER_MODE_KEY, choices: NUMBER_MODES, fallback: DEFAULT_NUMBER_MODE },
].map((row) => Object.freeze(row)));

/**
 * @typedef {object} RowView
 * @property {string} id
 * @property {string} label
 * @property {string} value As shown ('ON', 'HEX').
 */

/**
 * @typedef {object} Settings
 * @property {(id: string) => import('./choice.js').Choice} choice One setting's state.
 * @property {(id: string) => string} cycle Next value of a setting; returns it.
 * @property {() => RowView[]} rows For the settings screen, in table order.
 * @property {(listener: (id: string, value: string) => void) => void} onChange Any setting.
 */

/**
 * @param {import('../storage/index.js').Storage} storage
 * @param {readonly SettingRow[]} [rows]
 * @returns {Settings}
 */
export function createSettings(storage, rows = SETTING_ROWS) {
  /** @type {Map<string, import('./choice.js').Choice>} */
  const choices = new Map();
  /** @type {((id: string, value: string) => void)[]} */
  const listeners = [];
  for (const row of rows) {
    const choice = createChoice(createChoiceStore(storage, row.key, row.choices, row.fallback), row.choices, row.fallback);
    choice.onChange((value) => listeners.forEach((listener) => listener(row.id, value)));
    choices.set(row.id, choice);
  }

  function choice(id) {
    const found = choices.get(id);
    if (!found) throw new RangeError(`Unknown setting: ${id}`);
    return found;
  }

  return {
    choice,
    cycle: (id) => choice(id).cycle(),
    rows: () => rows.map((row) => ({ id: row.id, label: row.label, value: choice(row.id).get().toUpperCase() })),
    onChange(listener) {
      listeners.push(listener);
    },
  };
}
