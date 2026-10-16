/**
 * js/ui/hud.js - The register-dump HUD and the pause button.
 *
 * Four registers in the header, beside the pause button:
 *
 *   hex / decimal (2 x 2)          binary (one per row)
 *   SCR 0x000400  HI  0x001A40     SCR 0b0000 0000 0000 0100 0000 0000
 *   BNK 0x02      LNS 0x0013       HI  0b0000 0000 0001 1010 0100 0000
 *                                  BNK 0b0000 0010
 *                                  LNS 0b0000 0000 0001 0011
 *
 * The whole HUD is one native <button>: tapping it cycles the number mode
 * (hex -> binary -> decimal). Being a button, js/touch-guard.js leaves its
 * touches alone and it gets real clicks on iOS. It sits outside the
 * playfield's touch surface, and the well captures its own pointers, so a
 * gesture that starts in the playfield can never press it.
 *
 * Font size follows the longest row (--hud-chars, set here; the CSS turns
 * it into a size that fits the header), so a register that widens past its
 * normal size shrinks the text instead of overflowing.
 *
 * A changed value glows briefly (CSS animation, about 200 ms). Two
 * identical animations are alternated so a new glow can restart a running
 * one without forcing a layout.
 */

import { REGISTERS, formatNumber } from './format.js';

/** HUD fields in display order. */
const FIELDS = Object.freeze(['score', 'highScore', 'bank', 'lines']);

/** Characters between the two columns in the 2 x 2 layout (CSS column-gap: 2ch). */
const COLUMN_GAP_CHARS = 2;

/**
 * @typedef {object} HudValues
 * @property {number} score
 * @property {number} highScore
 * @property {number} bank
 * @property {number} lines
 */

/**
 * The label as shown: padded to 3 characters plus a space, so values line up.
 * @param {keyof typeof REGISTERS} field
 * @returns {string}
 */
export function hudLabel(field) {
  return `${REGISTERS[field].label.padEnd(3)} `;
}

/**
 * Length in characters of the longest HUD row, for sizing the font.
 * @param {Record<string, string>} texts Formatted values by field.
 * @param {import('./format.js').NumberMode} mode
 * @returns {number}
 */
export function hudRowChars(texts, mode) {
  const cell = (field) => hudLabel(field).length + texts[field].length;
  if (mode === 'bin') return Math.max(...FIELDS.map(cell));
  const left = Math.max(cell('score'), cell('bank'));
  const right = Math.max(cell('highScore'), cell('lines'));
  return left + COLUMN_GAP_CHARS + right;
}

/**
 * @typedef {object} Hud
 * @property {(values: HudValues) => void} update
 * @property {(visible: boolean) => void} setPauseVisible
 */

/**
 * @param {object} setup
 * @param {HTMLButtonElement} setup.element The HUD button.
 * @param {HTMLButtonElement} setup.pauseButton
 * @param {() => void} setup.onPause
 * @param {import('./number-mode.js').NumberModeState} setup.numberMode
 * @returns {Hud}
 */
export function createHud({ element, pauseButton, onPause, numberMode }) {
  /** @type {Record<string, HTMLElement>} */
  const valueEls = {};
  /** @type {Record<string, boolean>} */
  const glowToggle = {};
  element.replaceChildren(...FIELDS.map((field) => {
    const reg = document.createElement('span');
    reg.className = 'reg';
    const label = document.createElement('span');
    label.className = 'reg-label';
    label.textContent = hudLabel(field);
    const value = document.createElement('span');
    value.className = 'reg-value';
    valueEls[field] = value;
    reg.append(label, value);
    return reg;
  }));

  /** @type {HudValues | null} */
  let values = null;
  let shownMode = null;

  function glow(field) {
    const el = valueEls[field];
    glowToggle[field] = !glowToggle[field];
    el.classList.remove('glow-a', 'glow-b');
    el.classList.add(glowToggle[field] ? 'glow-a' : 'glow-b');
  }

  /**
   * @param {HudValues | null} previous Values last drawn (null = no glow).
   */
  function render(previous) {
    if (!values) return;
    const mode = numberMode.get();
    const texts = {};
    for (const field of FIELDS) {
      texts[field] = formatNumber(values[field], field, mode);
      if (valueEls[field].textContent !== texts[field]) valueEls[field].textContent = texts[field];
      if (previous && previous[field] !== values[field]) glow(field);
    }
    if (mode !== shownMode) {
      shownMode = mode;
      element.dataset.mode = mode;
    }
    element.style.setProperty('--hud-chars', String(hudRowChars(texts, mode)));
    element.setAttribute('aria-label', `${FIELDS.map((f) => `${REGISTERS[f].label} ${texts[f]}`).join(', ')}. Tap to change number format.`);
  }

  element.addEventListener('click', () => numberMode.cycle());
  numberMode.onChange(() => render(null)); // a mode change is not a value change: no glow
  pauseButton.addEventListener('click', () => onPause());

  return {
    update(next) {
      const previous = values;
      if (previous && FIELDS.every((f) => previous[f] === next[f])) return; // nothing to touch
      values = { ...next };
      render(previous);
    },
    setPauseVisible(visible) {
      // visibility, not display, so the header layout never jumps.
      pauseButton.style.visibility = visible ? 'visible' : 'hidden';
      pauseButton.disabled = !visible;
    },
  };
}
