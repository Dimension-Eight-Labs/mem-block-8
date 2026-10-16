/**
 * js/input/bindings.js - THE place to tune controls.
 *
 * Every gesture-to-action and key-to-action mapping, and every input
 * tuning value (zone sizes, thresholds, timings), lives in this file and
 * nowhere else. Edit here to try variations on a phone.
 *
 * Actions understood by the game session:
 *   moveLeft, moveRight, rotateCW, rotateCCW, hardDrop,
 *   softDropOn, softDropOff, pause, start
 * Mapping a gesture or key to null makes it do nothing during play (taps
 * still dismiss the start, pause, and game-over screens).
 *
 * Distances are CSS pixels; times are milliseconds.
 */

/**
 * @typedef {'moveLeft' | 'moveRight' | 'rotateCW' | 'rotateCCW' | 'hardDrop'
 *   | 'softDropOn' | 'softDropOff' | 'pause' | 'start'} Action
 */

/**
 * @typedef {object} TouchConfig
 * @property {number} sideFraction Width of each side (move) zone, as a fraction of playfield width.
 * @property {number} bottomFraction Height of the bottom soft-drop strip, as a fraction of playfield height.
 * @property {number} tapMaxMs A tap must be released within this time...
 * @property {number} tapMaxPx ...and move less than this distance.
 * @property {number} swipeMinPx Movement at which a touch becomes a swipe.
 * @property {number} repeatDelayMs Hold time in a side zone before auto-repeat starts.
 * @property {number} repeatIntervalMs Time between auto-repeat moves.
 * @property {number} doubleTapWindowMs Max time from the first tap's release to the second tap's touch-down.
 * @property {number} doubleTapMaxPx Max distance between the two taps of a double tap.
 * @property {'up' | 'down'} moveOn When a side tap moves the piece.
 * @property {'center' | 'anywhere'} doubleTapMode Where a double tap is recognised.
 */

/** @type {Readonly<TouchConfig>} */
export const TOUCH = Object.freeze({
  // Zones. Left third / centre third / right third, plus a full-width strip
  // along the bottom that takes priority over the thirds.
  sideFraction: 1 / 3,
  bottomFraction: 0.15,

  // Tap: quick and nearly still.
  tapMaxMs: 200,
  tapMaxPx: 10,

  // Swipe: rotates as soon as the finger has travelled this far, without
  // waiting for release. One rotation per swipe.
  swipeMinPx: 30,

  // Hold in a side zone (without moving past tapMaxPx) to auto-repeat.
  repeatDelayMs: 170,
  repeatIntervalMs: 50,

  // Double tap = hard drop.
  doubleTapWindowMs: 250,
  doubleTapMaxPx: 40,

  // 'up': a side tap moves on release (a touch that turns into a swipe
  //       never moves the piece).
  // 'down': moves on touch-down (feels instant, but a swipe that starts in
  //       a side zone also moves once before rotating).
  // In doubleTapMode 'anywhere', side taps always act on release.
  moveOn: 'up',

  // 'center': only taps in the centre zone form double taps. Side taps
  //           stay instant, but a hard drop needs a centre double tap.
  // 'anywhere': double tap anywhere. The cost: every single tap is held
  //           back for doubleTapWindowMs before it acts, to see whether a
  //           second tap follows, so moves feel slightly delayed.
  doubleTapMode: 'center',
});

/**
 * Gesture name to action. Gesture names come from js/input/gestures.js.
 * @type {Readonly<Record<string, Action | null>>}
 */
export const GESTURE_ACTIONS = Object.freeze({
  tapLeft: 'moveLeft',
  tapRight: 'moveRight',
  tapCenter: null,
  tapBottom: null,
  holdLeft: 'moveLeft', // auto-repeat while held
  holdRight: 'moveRight',
  doubleTap: 'hardDrop',
  swipeLeft: 'rotateCCW',
  swipeRight: 'rotateCW',
  swipeUp: 'rotateCW',
  swipeDown: 'rotateCW',
  softDropStart: 'softDropOn', // finger down in the bottom strip
  softDropEnd: 'softDropOff', // finger lifted (or turned into a swipe)
});

/**
 * @typedef {object} KeyBinding
 * @property {Action} action Action on key down.
 * @property {boolean} [repeat] Auto-repeat while held (KEY_REPEAT timing).
 * @property {Action} [release] Action on key up (for hold-type keys).
 */

/**
 * Keyboard bindings, keyed by KeyboardEvent.code (physical key, so it
 * works the same on any keyboard layout).
 * @type {Readonly<Record<string, KeyBinding>>}
 */
export const KEYS = Object.freeze({
  ArrowLeft: { action: 'moveLeft', repeat: true },
  ArrowRight: { action: 'moveRight', repeat: true },
  ArrowUp: { action: 'rotateCW' },
  KeyX: { action: 'rotateCW' },
  KeyZ: { action: 'rotateCCW' },
  ArrowDown: { action: 'softDropOn', release: 'softDropOff' },
  Space: { action: 'hardDrop' },
  KeyP: { action: 'pause' },
  Escape: { action: 'pause' },
  Enter: { action: 'start' },
  NumpadEnter: { action: 'start' },
});

/** Keyboard auto-repeat, matching the touch hold timing. */
export const KEY_REPEAT = Object.freeze({
  delayMs: 170,
  intervalMs: 50,
});

/** Screens and safety. */
export const SCREENS = Object.freeze({
  // After game over, ignore input this long so a tap or key press that was
  // already in flight does not instantly restart the game.
  overlayInputDelayMs: 500,

  // Memory bank transition:
  //   "MEMORY BANK 0x01 FULL"
  //   "SWAPPING TO MEMORY BANK 0x02..."   (after the connect delay; the modem plays)
  //   "MEMORY BANK 0x02 READY"            (the READY moment, with the chip tally)
  // With sound effects on, READY appears when the modem finishes (about
  // 5.6 s; transitionTiming in js/audio/modem.js) and the transition lasts
  // that plus bankReadyMs. With them off it lasts bankTransitionMs, READY
  // included.
  bankTransitionMs: 4000,
  // The READY moment: time to get ready, and room for the chip tally.
  bankReadyMs: 900,
  // A tap or key press skips the transition only after this long, so the
  // tap that cleared the last lines cannot skip it by accident. Skipping
  // jumps to READY with the tally already complete...
  bankTransitionSkipAfterMs: 750,
  // ...shown this long before play resumes.
  bankSkipReadyMs: 600,
  // When the "SWAPPING TO..." line appears.
  bankTransitionConnectAfterMs: 900,
  // Chip cash-in tally (js/ui/tally.js): one step (and blip) per chip, at
  // most chipTallyMaxSteps, each chipTallyStepMs apart. 8 steps plus the
  // done tone end well inside bankReadyMs.
  chipTallyStepMs: 60,
  chipTallyMaxSteps: 8,

  // The "+3 CHIPS" flash where the rows cleared, rising and fading.
  chipFlashMs: 1000,

  // How long "FULL WORD" (a 5-line clear) stays on screen, including its fade.
  fullWordMs: 1400,
});

/** Debug overlay (?debug=1): how many recent gestures to list. */
export const DEBUG_LOG_LENGTH = 8;
