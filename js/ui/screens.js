/**
 * js/ui/screens.js - Start, pause menu, bank transition, and game-over overlays.
 *
 * Drawn in the DOM over the canvas, in the boot screen's green monospace
 * style. Text is set with textContent only. Every number goes through
 * formatNumber in the current display mode; when the mode changes (a tap
 * on the HUD) the visible screen's text is updated in place, so delayed
 * lines and the cursor keep their animations.
 *
 * The overlay ignores pointers (so game touches pass through to the well)
 * except for its menu buttons. Those are native <button>s, which
 * js/touch-guard.js and js/input/dom.js both leave alone, so they get real
 * clicks on iOS; a click reports its command through onCommand.
 */

import { formatNumber, DEFAULT_NUMBER_MODE } from './format.js';
import { COLS, VISIBLE_ROWS } from '../engine/index.js';

/**
 * @typedef {'start' | 'paused' | 'transition' | 'gameOver'} ScreenName
 */

/**
 * @typedef {'resume' | 'restart'} MenuCommand
 */

/**
 * @typedef {object} Line
 * @property {string} text
 * @property {'title' | 'line' | 'detail' | 'button'} [kind] 'detail' is the dim style.
 * @property {MenuCommand} [command] For 'button' lines.
 * @property {boolean} [cursor] Append a blinking cursor.
 * @property {boolean} [desktopOnly] Shown only with a mouse or trackpad.
 * @property {number} [appearAfterMs] Hidden until this long after the screen shows.
 */

/**
 * @typedef {object} ScreenData
 * @property {boolean} [confirmRestart] Pause menu: RESTART was tapped once.
 * @property {number} [fromBank] Transition.
 * @property {number} [toBank] Transition.
 * @property {number} [connectAfterMs] Transition: when the second line appears.
 * @property {number} [skipAfterMs] Transition: when skipping is allowed.
 * @property {number} [score] Game over.
 * @property {number} [bank] Game over: bank reached.
 * @property {number} [lines] Game over.
 * @property {number} [highScore] Game over: the best score (including this one).
 * @property {boolean} [newHighScore] Game over.
 */

/**
 * Lines for each screen. Each screen always has the same lines in the same
 * order for any data and mode, which is what lets refresh() update text in
 * place.
 * @param {ScreenName} screen
 * @param {ScreenData} [data]
 * @param {import('./format.js').NumberMode} [mode]
 * @returns {Line[]}
 */
export function screenLines(screen, data = {}, mode = DEFAULT_NUMBER_MODE) {
  const num = (value, field) => formatNumber(value, field, mode);
  switch (screen) {
    case 'start':
      return [
        { text: 'MEM BLOCK 8', kind: 'title' },
        { text: 'DIM8 LABS', kind: 'detail' },
        { text: 'MEMORY BANK READY', cursor: true },
        // The board size stays plain decimal: it is geometry, not a register.
        { text: `${COLS} x ${VISIBLE_ROWS} CELLS`, kind: 'detail' },
        { text: `${num(COLS * VISIBLE_ROWS, 'words')} WORDS`, kind: 'detail' },
        { text: 'TAP TO START' },
        { text: 'PRESS ENTER', desktopOnly: true },
      ];
    case 'paused':
      return [
        { text: 'PAUSED', cursor: true },
        { text: 'RESUME', kind: 'button', command: 'resume' },
        data.confirmRestart
          ? { text: 'CONFIRM RESTART', kind: 'button', command: 'restart' }
          : { text: 'RESTART', kind: 'button', command: 'restart' },
        { text: 'P OR ENTER TO RESUME', kind: 'detail', desktopOnly: true },
      ];
    case 'transition':
      return [
        { text: `BANK ${num(data.fromBank ?? 1, 'bank')} FULL` },
        {
          text: `CONNECTING TO BANK ${num(data.toBank ?? 2, 'bank')}...`,
          cursor: true,
          appearAfterMs: data.connectAfterMs ?? 0,
        },
        { text: 'TAP TO SKIP', kind: 'detail', appearAfterMs: data.skipAfterMs ?? 0 },
      ];
    case 'gameOver':
      return [
        { text: 'MEMORY FULL', cursor: true },
        // One value per line: binary values are too long to share a line on a phone.
        { text: `SCORE ${num(data.score ?? 0, 'score')}`, kind: 'detail' },
        { text: `BANK ${num(data.bank ?? 1, 'bank')}`, kind: 'detail' },
        { text: `LINES ${num(data.lines ?? 0, 'lines')}`, kind: 'detail' },
        data.newHighScore
          ? { text: 'NEW HIGH SCORE' }
          : { text: `HIGH SCORE ${num(data.highScore ?? 0, 'highScore')}`, kind: 'detail' },
        { text: 'TAP TO REBOOT' },
        { text: 'PRESS ENTER', desktopOnly: true },
      ];
    default:
      throw new RangeError(`Unknown screen: ${screen}`);
  }
}

/**
 * Lines never wrap (a number must not break across lines); instead the CSS
 * shrinks a line's font when it is too long for the playfield, using its
 * length in characters (plus the cursor). The dim detail lines of a screen
 * (score, bank, lines...) are sized together from the longest, so they
 * stay one size.
 * @param {HTMLElement} el
 * @param {Line} line
 * @param {Line[]} lines All lines of the screen.
 */
function setLength(el, line, lines) {
  const length = (l) => l.text.length + (l.cursor ? 1 : 0);
  const chars = line.kind === 'detail'
    ? Math.max(...lines.filter((l) => l.kind === 'detail').map(length))
    : length(line);
  el.style.setProperty('--chars', String(chars));
}

/**
 * Build the element for one line.
 * @param {Line} line
 * @param {Line[]} lines All lines of the screen.
 * @returns {HTMLElement}
 */
function lineElement(line, lines) {
  let el;
  if (line.kind === 'button') {
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'menu-button';
    el.dataset.command = line.command;
  } else {
    el = document.createElement('p');
    el.className = { title: 'screen-title', detail: 'boot-detail' }[line.kind] ?? 'boot-line';
  }
  if (line.desktopOnly) el.classList.add('desktop-only');
  if (line.appearAfterMs) {
    el.classList.add('appear');
    el.style.animationDelay = `${line.appearAfterMs}ms`;
  }
  el.textContent = line.text;
  setLength(el, line, lines);
  if (line.cursor) {
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.textContent = '_';
    el.append(cursor);
  }
  return el;
}

/**
 * @typedef {object} Screens
 * @property {(screen: ScreenName, data?: ScreenData) => void} show
 * @property {() => void} hide
 * @property {() => void} refresh Re-format the visible screen's numbers in place.
 */

/**
 * Control the overlay element.
 * @param {HTMLElement} overlay
 * @param {object} setup
 * @param {(command: MenuCommand) => void} setup.onCommand
 * @param {import('./number-mode.js').NumberModeState} setup.numberMode
 * @returns {Screens}
 */
export function createScreens(overlay, { onCommand, numberMode }) {
  /** @type {{screen: ScreenName, data: ScreenData | undefined} | null} */
  let current = null;

  overlay.addEventListener('click', (event) => {
    const button = event.target instanceof Element && event.target.closest('button[data-command]');
    if (button && overlay.contains(button)) onCommand(button.dataset.command);
  });

  function refresh() {
    if (!current || overlay.hidden) return;
    const lines = screenLines(current.screen, current.data, numberMode.get());
    lines.forEach((line, i) => {
      // The text is always the element's first child (a cursor may follow it).
      const el = overlay.children[i];
      const node = el?.firstChild;
      if (node && node.nodeType === Node.TEXT_NODE) {
        node.nodeValue = line.text;
        setLength(el, line, lines);
      }
    });
  }

  numberMode.onChange(refresh);

  return {
    show(screen, data) {
      current = { screen, data };
      const lines = screenLines(screen, data, numberMode.get());
      overlay.replaceChildren(...lines.map((line) => lineElement(line, lines)));
      overlay.dataset.screen = screen;
      overlay.hidden = false;
    },
    hide() {
      current = null;
      overlay.hidden = true;
      overlay.replaceChildren();
    },
    refresh,
  };
}
