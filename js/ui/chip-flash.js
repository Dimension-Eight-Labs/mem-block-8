/**
 * js/ui/chip-flash.js - "+3 CHIPS" flashed where the rows cleared.
 *
 * A DOM element over the canvas, like the FULL WORD banner: the microchip
 * icon (drawn in code, js/render/chip.js) and the count in the current
 * number mode. It rises slightly and fades (a CSS animation whose length
 * is set here, so no timers), then hides itself.
 *
 * Placement: at the height of the cleared rows, kept clear of the edges.
 * On a FULL WORD it sits below the centred FULL WORD banner instead, so
 * both stay readable.
 */

import { formatNumber } from './format.js';
import { HIDDEN_ROWS, VISIBLE_ROWS } from '../engine/index.js';
import { drawChipIcon, CHIP_REF_WIDTH, CHIP_REF_HEIGHT } from '../render/chip.js';

/** Vertical position on a FULL WORD (percent): below the banner at 38%. */
const BELOW_BANNER_PERCENT = 52;

/** Keep the flash this far (percent) from the top and bottom edges. */
const EDGE_PERCENT = 10;

/** Icon backing size: drawn once, scaled down by CSS (crisp at 3x). */
const ICON_WIDTH = 72;

/**
 * The flash text: "+0x01 CHIP", "+0x03 CHIPS".
 * @param {number} count
 * @param {import('./format.js').NumberMode} mode
 * @returns {string}
 */
export function chipFlashText(count, mode) {
  return `+${formatNumber(count, 'chips', mode)} ${count === 1 ? 'CHIP' : 'CHIPS'}`;
}

/**
 * Where the flash goes, as a percentage of the playfield height (centre).
 * @param {readonly number[]} rows Cleared rows (engine coordinates,
 *   hidden rows included).
 * @param {boolean} fullWord
 * @returns {number}
 */
export function chipFlashTop(rows, fullWord) {
  if (fullWord || rows.length === 0) return BELOW_BANNER_PERCENT;
  const mean = rows.reduce((sum, y) => sum + y, 0) / rows.length;
  const percent = ((mean - HIDDEN_ROWS + 0.5) / VISIBLE_ROWS) * 100;
  return Math.min(100 - EDGE_PERCENT, Math.max(EDGE_PERCENT, percent));
}

/**
 * @param {HTMLElement} element
 * @param {object} setup
 * @param {number} setup.durationMs
 * @param {import('./number-mode.js').NumberModeState} setup.numberMode
 * @param {{pin: string, body: string}} setup.colors
 * @returns {import('../session.js').ChipFlash}
 */
export function createChipFlash(element, { durationMs, numberMode, colors }) {
  const icon = document.createElement('canvas');
  icon.className = 'chip-icon';
  icon.width = ICON_WIDTH;
  icon.height = Math.round((ICON_WIDTH * CHIP_REF_HEIGHT) / CHIP_REF_WIDTH);
  drawChipIcon(icon.getContext('2d'), 0, 0, ICON_WIDTH, colors);
  const text = document.createElement('span');
  element.replaceChildren(icon, text);
  element.style.animationDuration = `${durationMs}ms`;

  function hide() {
    element.classList.remove('show');
    element.hidden = true;
  }
  element.addEventListener('animationend', hide);

  return {
    hide,
    flash({ count, rows, fullWord }) {
      text.textContent = chipFlashText(count, numberMode.get());
      element.style.top = `${chipFlashTop(rows, fullWord)}%`;
      element.hidden = false;
      element.classList.remove('show');
      // Reading layout restarts the animation when it is already running.
      void element.offsetWidth;
      element.classList.add('show');
    },
  };
}
