/**
 * js/session.js - Screens, the current game, and its progression.
 *
 * Screens (session states):
 *
 *   start --tap--> playing <--> paused (menu: RESUME, RESTART, SETTINGS)
 *                  playing --bank full--> transition --time--> playing
 *                  playing --game over--> gameOver --tap--> playing
 *   start, paused --SETTINGS--> settings --BACK--> where it was opened from
 *
 * While playing, actions become engine commands immediately (the engine
 * applies commands between ticks). The engine only steps while playing:
 * paused, transition, and game over all freeze it exactly where it is.
 *
 * handleEvents() is the single place engine events are handled. It feeds
 * them to the progression (score, banks), reacts to what that returns, and
 * passes every engine and progression event to deps.onEvent, the one hook
 * that sound (js/audio) listens to. The session adds a few events of its
 * own to the same hook, so audio never needs calls scattered through game
 * logic:
 *   {type: 'screen', screen, from, bank}  every screen change (music, hang-up)
 *   {type: 'newGame'}                     before a game starts (music restarts)
 *   {type: 'rotated', direction}          a rotation that succeeded (tick)
 *   {type: 'bankReady', ...}              the transition's READY moment (tally)
 *
 * The memory bank transition has two parts. First the swap ("MEMORY BANK
 * 0x01 FULL", "SWAPPING TO MEMORY BANK 0x02...", the modem), then the READY
 * moment ("MEMORY BANK 0x02 READY"), where chips cashed in at the bank's
 * completion are tallied. A tap or key press after skipAfterMs skips the
 * swap: it jumps to READY with the tally complete, shown briefly, and
 * play resumes. The score itself changed when the bank completed; the
 * tally (and the HUD's SCR during it) only animates that change.
 *
 * Events are handled after every tick, not once per frame, so a bank
 * transition or game over stops the engine on the exact tick it happened.
 */

import { createProgress } from './progression/index.js';
import { tallySteps, tallyValue } from './ui/tally.js';

/** Actions that map straight onto engine commands. */
const COMMANDS = Object.freeze({
  moveLeft: (game) => game.moveLeft(),
  moveRight: (game) => game.moveRight(),
  rotateCW: (game) => game.rotateCW(),
  rotateCCW: (game) => game.rotateCCW(),
  hardDrop: (game) => game.hardDrop(),
  softDropOn: (game) => game.setSoftDrop(true),
  softDropOff: (game) => game.setSoftDrop(false),
});

/**
 * Whether an input counts as "continue" on the start and game-over
 * screens. Only deliberate taps and Enter count, so a finger resting in
 * the soft-drop strip or a stray swipe does not start a game.
 * @param {import('./input/dom.js').InputEvent} event
 * @returns {boolean}
 */
export function isConfirm(event) {
  if (event.action === 'start') return true;
  return event.gesture !== null && (event.gesture.startsWith('tap') || event.gesture === 'doubleTap');
}

/**
 * Whether an input may skip the bank transition: a deliberate tap, or a
 * key press (not a key release, which arrives as softDropOff).
 * @param {import('./input/dom.js').InputEvent} event
 * @returns {boolean}
 */
export function isSkip(event) {
  if (event.source === 'key') return event.action !== null && event.action !== 'softDropOff';
  return isConfirm(event);
}

/** Rotation commands, for the 'rotated' event. */
const ROTATIONS = Object.freeze({ rotateCW: 1, rotateCCW: -1 });

/**
 * @typedef {'start' | 'playing' | 'paused' | 'settings' | 'transition' | 'gameOver'} Screen
 */

/**
 * @typedef {object} TransitionTiming
 * @property {() => {readyAtMs: number, durationMs: number}} timing When READY
 *   appears and how long the whole transition lasts (ms). Called when each
 *   transition starts (js/main.js: matched to the modem while sound
 *   effects are on).
 * @property {number} skipAfterMs Taps and keys skip it only after this long.
 * @property {number} connectAfterMs When the "SWAPPING TO..." line appears.
 * @property {number} skipReadyMs How long READY shows after a skip.
 * @property {number} tallyStepMs Chip tally step length.
 * @property {number} tallyMaxSteps Chip tally steps at most.
 */

/**
 * @typedef {object} ChipFlash
 * @property {(flash: {count: number, rows: readonly number[], fullWord: boolean}) => void} flash
 *   Show "+3 CHIPS" where the rows cleared.
 * @property {() => void} hide
 */

/**
 * @typedef {object} Session
 * @property {(event: import('./input/dom.js').InputEvent) => void} handleInput
 * @property {(command: 'pause' | import('./ui/screens.js').MenuCommand) => void} handleCommand
 *   From the pause button and the menu buttons ('setting' rows are handled
 *   by the settings, not here).
 * @property {() => void} step One engine tick (only while playing).
 * @property {() => void} frameEnd Drain events, finish the transition when due, draw.
 * @property {() => void} pause Pause if playing (or in a transition).
 * @property {() => Screen} getScreen
 * @property {() => (import('./engine/game.js').Game | null)} getGame
 * @property {() => (Readonly<import('./progression/progress.js').ProgressState> | null)} getProgress
 */

/**
 * Create the session.
 * @param {object} deps
 * @param {(bank: Readonly<import('./progression/banks.js').BankSettings>) => import('./engine/game.js').Game} deps.makeGame
 *   New game with a fresh seed, using bank 1's weights and gravity.
 * @param {{draw: (state: object | null) => void}} deps.renderer
 * @param {(bank: number) => void} deps.setBankTint Show a bank's playfield tint.
 * @param {import('./ui/screens.js').Screens} deps.screens
 * @param {import('./ui/hud.js').Hud} deps.hud
 * @param {{flash: (text: string) => void, hide: () => void}} deps.banner
 * @param {ChipFlash} deps.chipFlash
 * @param {import('./storage/index.js').HighScoreStore} deps.highScore Read once at
 *   start; the HUD's HI shows the better of it and the current score.
 * @param {() => void} deps.startLoop
 * @param {() => void} deps.stopLoop
 * @param {() => void} deps.resetInput
 * @param {() => number} deps.now Clock (ms) for screen timings.
 * @param {number} deps.overlayInputDelayMs Game-over input delay.
 * @param {TransitionTiming} deps.transition
 * @param {(event: object) => void} [deps.onEvent] Every engine, progression, and
 *   session event (sound).
 * @param {() => import('./progression/progress.js').Progress} [deps.makeProgress] For tests.
 * @returns {Session}
 */
export function createSession(deps) {
  const onEvent = deps.onEvent ?? (() => {});
  const makeProgress = deps.makeProgress ?? (() => createProgress());

  /** @type {Screen} */
  let screen = 'start';
  /** @type {import('./engine/game.js').Game | null} */
  let game = null;
  /** @type {import('./progression/progress.js').Progress | null} */
  let progress = null;
  let blockedUntil = 0;
  let restartArmed = false;
  /**
   * The running transition. readyStartedAt is null until the READY moment;
   * shownTally is the cash-in value the tally shows now.
   * @type {{startedAt: number, fromBank: number, toBank: number, readyAtMs: number,
   *   durationMs: number, cashed: {count: number, points: number} | null,
   *   readyStartedAt: number | null, endsAt: number, skipped: boolean,
   *   steps: number, shownTally: number} | null}
   */
  let transition = null;
  /** A cash-in reported just before its bankComplete. */
  /** @type {{count: number, points: number} | null} */
  let pendingCash = null;
  /** Chips lost at game over, for the game-over screen. */
  let lostChips = 0;
  /** Where settings was opened from: BACK returns there. */
  /** @type {'start' | 'paused'} */
  let settingsFrom = 'start';

  /**
   * Change screen and tell the hook (music follows the screen).
   * @param {Screen} next
   */
  function setScreen(next) {
    const from = screen;
    screen = next;
    onEvent({ type: 'screen', screen: next, from, bank: progress ? progress.getState().bank : 1 });
  }
  let bestScore = deps.highScore.get();

  function updateHud() {
    const p = progress ? progress.getState() : { score: 0, bank: 1, totalLines: 0, chips: 0 };
    let { score, chips } = p;
    const t = transition;
    if (t && t.cashed) {
      // The cash-in is already in the score: SCR shows it arriving with the
      // tally, and CHP keeps the chips until READY takes them.
      score -= t.cashed.points - t.shownTally;
      if (t.readyStartedAt === null) chips = t.cashed.count;
    }
    deps.hud.update({
      score,
      highScore: Math.max(bestScore, score),
      bank: p.bank,
      lines: p.totalLines,
      chips,
    });
  }

  function newGame() {
    onEvent({ type: 'newGame' });
    progress = makeProgress();
    game = deps.makeGame(progress.getBankSettings());
    game.drainEvents(); // the initial 'spawned' needs no handling
    transition = null;
    pendingCash = null;
    lostChips = 0;
    restartArmed = false;
    setScreen('playing');
    deps.setBankTint(progress.getState().bank);
    updateHud();
    deps.hud.setPauseVisible(true);
    deps.screens.hide();
    deps.resetInput();
    deps.renderer.draw(game.getState());
    deps.startLoop();
  }

  function showPauseMenu() {
    deps.screens.show('paused', { confirmRestart: restartArmed });
  }

  function finishTransition() {
    deps.setBankTint(transition.toBank);
    transition = null;
    updateHud(); // the whole cash-in, even when the loop stops (pause)
  }

  function pause() {
    if (screen === 'transition') {
      // Skip straight to the new bank, so resuming lands in normal play.
      finishTransition();
    } else if (screen !== 'playing') {
      return;
    }
    setScreen('paused');
    restartArmed = false;
    game.setSoftDrop(false);
    deps.stopLoop();
    deps.resetInput();
    deps.hud.setPauseVisible(false);
    showPauseMenu();
  }

  function resume() {
    setScreen('playing');
    restartArmed = false;
    deps.screens.hide();
    deps.hud.setPauseVisible(true);
    deps.resetInput();
    deps.startLoop();
  }

  /** What the transition screen shows now. */
  function transitionData() {
    const t = transition;
    return {
      fromBank: t.fromBank,
      toBank: t.toBank,
      connectAfterMs: deps.transition.connectAfterMs,
      skipAfterMs: deps.transition.skipAfterMs,
      ready: t.readyStartedAt !== null,
      chips: t.cashed ? t.cashed.count : 0,
      tally: t.shownTally,
    };
  }

  /**
   * Enter the bank transition. The engine stops stepping (the loop keeps
   * running only so frameEnd can move the transition on).
   * @param {{fromBank: number, toBank: number}} event
   */
  function startTransition({ fromBank, toBank }) {
    const { readyAtMs, durationMs } = deps.transition.timing();
    const startedAt = deps.now();
    const cashed = pendingCash;
    transition = {
      startedAt,
      fromBank,
      toBank,
      readyAtMs,
      durationMs,
      cashed,
      readyStartedAt: null,
      endsAt: startedAt + durationMs,
      skipped: false,
      steps: cashed ? tallySteps(cashed.count, deps.transition.tallyMaxSteps) : 0,
      shownTally: 0,
    };
    pendingCash = null;
    setScreen('transition');
    // A FULL WORD or chip flash from the clear that completed the bank must
    // not overlap the text (the tally shows those chips).
    deps.banner.hide();
    deps.chipFlash.hide();
    game.setSoftDrop(false);
    deps.resetInput();
    deps.screens.show('transition', transitionData());
  }

  /**
   * The READY moment: the modem has finished, or the player skipped it. A
   * skip shows the tally complete at once, briefly.
   * @param {boolean} skipped
   */
  function enterReady(skipped) {
    const t = transition;
    const now = deps.now();
    t.readyStartedAt = now;
    t.skipped = skipped;
    if (skipped) {
      t.endsAt = now + deps.transition.skipReadyMs;
      if (t.cashed) t.shownTally = t.cashed.points;
    }
    onEvent({
      type: 'bankReady',
      bank: t.toBank,
      count: t.cashed ? t.cashed.count : 0,
      points: t.cashed ? t.cashed.points : 0,
      steps: t.steps,
      stepMs: deps.transition.tallyStepMs,
      skipped,
    });
    deps.screens.show('transition', transitionData());
    updateHud();
  }

  /** Count the tally up (display only), updating the line when it changes. */
  function updateTally() {
    const t = transition;
    if (!t.cashed || t.skipped) return;
    const value = tallyValue(t.cashed.points, t.steps, deps.transition.tallyStepMs, deps.now() - t.readyStartedAt);
    if (value === t.shownTally) return;
    t.shownTally = value;
    deps.screens.update({ tally: value });
  }

  function endTransition() {
    finishTransition();
    setScreen('playing');
    deps.screens.hide();
    deps.resetInput();
  }

  function endGame() {
    if (transition) finishTransition();
    setScreen('gameOver');
    deps.stopLoop();
    deps.resetInput();
    deps.hud.setPauseVisible(false);
    blockedUntil = deps.now() + deps.overlayInputDelayMs;

    const { score, bank, totalLines } = progress.getState();
    const newHighScore = score > bestScore;
    if (newHighScore) {
      bestScore = score;
      deps.highScore.set(score); // may fail (no storage); the game carries on
    }
    updateHud();
    deps.screens.show('gameOver', {
      score,
      bank,
      lines: totalLines,
      highScore: bestScore,
      newHighScore,
      chipsLost: lostChips,
    });
  }

  /**
   * A progression event: apply it to the game and screens.
   * @param {import('./progression/progress.js').ProgressEvent} event
   * @param {import('./engine/game.js').GameEvent} source The engine event that caused it.
   */
  function handleProgressEvent(event, source) {
    onEvent(event);
    switch (event.type) {
      case 'fullWord':
        deps.banner.flash('FULL WORD');
        break;
      case 'chipsEarned':
        deps.chipFlash.flash({ count: event.count, rows: source.rows ?? [], fullWord: event.fullWord });
        break;
      case 'chipsCashed':
        // Shown by the transition that the bankComplete right after it starts.
        pendingCash = pendingCash
          ? { count: pendingCash.count + event.count, points: pendingCash.points + event.points }
          : { count: event.count, points: event.points };
        break;
      case 'chipsLost':
        lostChips = event.count;
        break;
      case 'bankComplete':
        // resetBag: the new mix starts with the piece after the one already
        // in the preview. Gravity applies at once, but nothing falls until
        // the transition ends.
        game.setWeights(event.weights, { resetBag: true });
        game.setGravityMsPerRow(event.gravityMsPerRow);
        if (screen === 'playing') {
          startTransition(event);
        } else if (transition) {
          // Several banks in one clear (only with very short test tables).
          transition.toBank = event.toBank;
          if (pendingCash && !transition.cashed) transition.cashed = pendingCash;
          pendingCash = null;
        }
        break;
      default:
        // 'scoreChanged': the HUD reads the totals in frameEnd.
        break;
    }
  }

  /**
   * The one place engine events are handled.
   * @param {import('./engine/game.js').GameEvent[]} events
   */
  function handleEvents(events) {
    for (const event of events) {
      onEvent(event);
      for (const progressEvent of progress.handle(event)) {
        handleProgressEvent(progressEvent, event);
      }
      if (event.type === 'gameOver') endGame();
    }
  }

  /** Open settings over the start screen or the pause menu (the game stays paused). */
  function openSettings() {
    settingsFrom = screen;
    restartArmed = false;
    setScreen('settings');
    deps.screens.show('settings');
  }

  function closeSettings() {
    setScreen(settingsFrom);
    if (settingsFrom === 'paused') showPauseMenu();
    else deps.screens.show('start');
  }

  function handleCommand(command) {
    if (command === 'pause') {
      pause();
    } else if (command === 'settings') {
      if (screen === 'start' || screen === 'paused') openSettings();
    } else if (command === 'back') {
      if (screen === 'settings') closeSettings();
    } else if (command === 'resume') {
      if (screen === 'paused') resume();
    } else if (command === 'restart') {
      if (screen !== 'paused') return;
      if (restartArmed) {
        newGame();
      } else {
        restartArmed = true;
        showPauseMenu();
      }
    }
  }

  function handleInput(event) {
    switch (screen) {
      case 'playing':
        if (event.action === 'pause') {
          pause();
        } else if (event.action && COMMANDS[event.action]) {
          const done = COMMANDS[event.action](game);
          if (done && ROTATIONS[event.action]) onEvent({ type: 'rotated', direction: ROTATIONS[event.action] });
        }
        return;
      case 'paused':
        // Taps on the well do nothing here, so a stray touch cannot resume;
        // the menu buttons arrive through handleCommand instead.
        if (event.source === 'key' && (event.action === 'pause' || event.action === 'start')) resume();
        return;
      case 'settings':
        // P or Escape goes back. Taps on the well do nothing; Enter is left
        // to the focused button.
        if (event.source === 'key' && event.action === 'pause') closeSettings();
        return;
      case 'transition':
        // Once READY shows, the transition is nearly over: further taps
        // wait for it rather than land in the game.
        if (event.action === 'pause') pause();
        else if (transition.readyStartedAt === null
          && deps.now() - transition.startedAt >= deps.transition.skipAfterMs && isSkip(event)) enterReady(true);
        return;
      default: // start, gameOver
        if (deps.now() < blockedUntil || !isConfirm(event)) return;
        newGame();
    }
  }

  function step() {
    if (screen !== 'playing') return;
    game.step();
    handleEvents(game.drainEvents());
  }

  function frameEnd() {
    if (!game) return;
    if (screen === 'playing') handleEvents(game.drainEvents()); // from commands since the last tick
    if (screen === 'transition') {
      const t = transition;
      if (t.readyStartedAt === null && deps.now() - t.startedAt >= t.readyAtMs) enterReady(false);
      if (deps.now() >= t.endsAt) endTransition();
      else if (t.readyStartedAt !== null) updateTally();
    }
    updateHud();
    deps.renderer.draw(game.getState());
  }

  updateHud(); // the start screen shows the saved high score

  return {
    handleInput,
    handleCommand,
    step,
    frameEnd,
    pause,
    getScreen: () => screen,
    getGame: () => game,
    getProgress: () => (progress ? progress.getState() : null),
  };
}
