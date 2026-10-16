/**
 * js/ui/screens.js - Start, pause menu, settings, bank transition, and
 * game-over overlays.
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
 *
 * Wording rule: player-facing text always says "MEMORY BANK", never "BANK"
 * on its own (players outside the joke read "BANK" as online banking). The
 * HUD's register label BNK is the one exception. A test checks every line.
 *
 * The settings screen is built from the settings table (js/ui/settings.js):
 * one button per row ("MUSIC: ON"), so rows added there appear here with
 * no other change. Tapping a row cycles its value; the text updates in
 * place.
 */

import { formatNumber, DEFAULT_NUMBER_MODE } from './format.js';
import { COLS, VISIBLE_ROWS } from '../engine/index.js';

/**
 * @typedef {'start' | 'paused' | 'settings' | 'transition' | 'gameOver'} ScreenName
 */

/**
 * @typedef {'resume' | 'restart' | 'settings' | 'back' | 'setting'} MenuCommand
 *   'setting' carries the row id: tap a settings row.
 */

/**
 * @typedef {object} Line
 * @property {string} text
 * @property {'title' | 'line' | 'detail' | 'button'} [kind] 'detail' is the dim style.
 * @property {MenuCommand} [command] For 'button' lines.
 * @property {string} [setting] For 'setting' buttons: the row id.
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
 * @property {boolean} [ready] Transition: the READY moment has begun.
 * @property {number} [chips] Transition: chips cashed in (0: no tally line).
 * @property {number} [tally] Transition: the cash-in points the tally shows now.
 * @property {number} [chipsLost] Game over: uncashed chips lost (0: no line).
 * @property {number} [score] Game over.
 * @property {number} [bank] Game over: bank reached.
 * @property {number} [lines] Game over.
 * @property {number} [highScore] Game over: the best score (including this one).
 * @property {boolean} [newHighScore] Game over.
 * @property {import('./settings.js').RowView[]} [rows] Settings (filled in by createScreens).
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
        { text: 'SETTINGS', kind: 'button', command: 'settings' },
      ];
    case 'paused':
      return [
        { text: 'PAUSED', cursor: true },
        { text: 'RESUME', kind: 'button', command: 'resume' },
        data.confirmRestart
          ? { text: 'CONFIRM RESTART', kind: 'button', command: 'restart' }
          : { text: 'RESTART', kind: 'button', command: 'restart' },
        { text: 'SETTINGS', kind: 'button', command: 'settings' },
        { text: 'P OR ENTER TO RESUME', kind: 'detail', desktopOnly: true },
      ];
    case 'settings':
      return [
        { text: 'SETTINGS', cursor: true },
        ...(data.rows ?? []).map((row) => ({
          text: `${row.label}: ${row.value}`, kind: 'button', command: 'setting', setting: row.id,
        })),
        { text: 'BACK', kind: 'button', command: 'back' },
        { text: 'ESC TO GO BACK', kind: 'detail', desktopOnly: true },
      ];
    case 'transition': {
      const full = { text: `MEMORY BANK ${num(data.fromBank ?? 1, 'bank')} FULL` };
      const swapping = `SWAPPING TO MEMORY BANK ${num(data.toBank ?? 2, 'bank')}...`;
      if (!data.ready) {
        return [
          full,
          { text: swapping, cursor: true, appearAfterMs: data.connectAfterMs ?? 0 },
          { text: 'TAP TO SKIP', kind: 'detail', appearAfterMs: data.skipAfterMs ?? 0 },
        ];
      }
      // The READY moment: the log so far, READY, and the chip tally if any.
      const chips = data.chips ?? 0;
      return [
        full,
        { text: swapping },
        { text: `MEMORY BANK ${num(data.toBank ?? 2, 'bank')} READY`, cursor: true },
        ...(chips > 0 ? [{ text: tallyText(chips, data.tally ?? 0, mode) }] : []),
      ];
    }
    case 'gameOver':
      return [
        // What a modem prints when the line drops; the busy signal plays under it.
        { text: 'NO CARRIER' },
        { text: 'MEMORY FULL', cursor: true },
        // Chips not cashed in before the end are gone.
        ...((data.chipsLost ?? 0) > 0 ? [{ text: `CHIPS LOST ${num(data.chipsLost, 'chips')}`, kind: 'detail' }] : []),
        // One value per line: binary values are too long to share a line on a phone.
        { text: `SCORE ${num(data.score ?? 0, 'score')}`, kind: 'detail' },
        { text: `MEMORY BANK ${num(data.bank ?? 1, 'bank')}`, kind: 'detail' },
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
 * The cash-in tally line: "CHIPS 0x03 = +0x0600".
 * @param {number} chips
 * @param {number} points The value shown so far (counts up).
 * @param {import('./format.js').NumberMode} mode
 * @returns {string}
 */
export function tallyText(chips, points, mode) {
  return `CHIPS ${formatNumber(chips, 'chips', mode)} = +${formatNumber(points, 'cashIn', mode)}`;
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
    if (line.setting) el.dataset.setting = line.setting;
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
 * @property {(patch: ScreenData) => void} update Change some of the visible
 *   screen's data and update its text in place (the line layout must stay
 *   the same; the chip tally counting up).
 */

/**
 * Control the overlay element.
 * @param {HTMLElement} overlay
 * @param {object} setup
 * @param {(command: MenuCommand, setting?: string) => void} setup.onCommand
 * @param {import('./number-mode.js').NumberModeState} setup.numberMode
 * @param {import('./settings.js').Settings} [setup.settings] Rows for the settings screen.
 * @returns {Screens}
 */
export function createScreens(overlay, { onCommand, numberMode, settings }) {
  /** @type {{screen: ScreenName, data: ScreenData | undefined} | null} */
  let current = null;

  overlay.addEventListener('click', (event) => {
    const button = event.target instanceof Element && event.target.closest('button[data-command]');
    if (button && overlay.contains(button)) onCommand(button.dataset.command, button.dataset.setting);
  });

  /** The lines to show now (settings rows read fresh each time). */
  function linesFor(screen, data) {
    const full = screen === 'settings' && settings ? { ...data, rows: settings.rows() } : data;
    return screenLines(screen, full, numberMode.get());
  }

  function refresh() {
    if (!current || overlay.hidden) return;
    const lines = linesFor(current.screen, current.data);
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
  if (settings) settings.onChange(refresh);

  return {
    show(screen, data) {
      current = { screen, data };
      const lines = linesFor(screen, data);
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
    update(patch) {
      if (!current) return;
      current = { screen: current.screen, data: { ...current.data, ...patch } };
      refresh();
    },
  };
}
