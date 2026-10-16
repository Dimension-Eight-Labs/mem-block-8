/**
 * js/session.js - Screens, the current game, and its progression.
 *
 * Screens (session states):
 *
 *   start --tap--> playing <--> paused (menu: RESUME, RESTART)
 *                  playing --bank full--> transition --time or tap--> playing
 *                  playing --game over--> gameOver --tap--> playing
 *
 * While playing, actions become engine commands immediately (the engine
 * applies commands between ticks). The engine only steps while playing:
 * paused, transition, and game over all freeze it exactly where it is.
 *
 * handleEvents() is the single place engine events are handled. It feeds
 * them to the progression (score, banks), reacts to what that returns, and
 * passes every engine and progression event to deps.onEvent: the hook for
 * Stage 5 sound (for example the modem sequence on bankComplete).
 *
 * Events are handled after every tick, not once per frame, so a bank
 * transition or game over stops the engine on the exact tick it happened.
 */

import { createProgress } from './progression/index.js';

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

/**
 * @typedef {'start' | 'playing' | 'paused' | 'transition' | 'gameOver'} Screen
 */

/**
 * @typedef {object} TransitionTiming
 * @property {number} durationMs How long the transition shows.
 * @property {number} skipAfterMs Taps and keys skip it only after this long.
 * @property {number} connectAfterMs When the "CONNECTING..." line appears.
 */

/**
 * @typedef {object} Session
 * @property {(event: import('./input/dom.js').InputEvent) => void} handleInput
 * @property {(command: 'pause' | import('./ui/screens.js').MenuCommand) => void} handleCommand
 *   From the pause button and the pause menu buttons.
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
 * @param {import('./storage/index.js').HighScoreStore} deps.highScore Read once at
 *   start; the HUD's HI shows the better of it and the current score.
 * @param {() => void} deps.startLoop
 * @param {() => void} deps.stopLoop
 * @param {() => void} deps.resetInput
 * @param {() => number} deps.now Clock (ms) for screen timings.
 * @param {number} deps.overlayInputDelayMs Game-over input delay.
 * @param {TransitionTiming} deps.transition
 * @param {(event: object) => void} [deps.onEvent] Every engine and progression event (Stage 5 sound).
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
  /** @type {{startedAt: number, toBank: number} | null} */
  let transition = null;
  let bestScore = deps.highScore.get();

  function updateHud() {
    const p = progress ? progress.getState() : { score: 0, bank: 1, totalLines: 0 };
    deps.hud.update({
      score: p.score,
      highScore: Math.max(bestScore, p.score),
      bank: p.bank,
      lines: p.totalLines,
    });
  }

  function newGame() {
    progress = makeProgress();
    game = deps.makeGame(progress.getBankSettings());
    game.drainEvents(); // the initial 'spawned' needs no handling
    transition = null;
    restartArmed = false;
    screen = 'playing';
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
  }

  function pause() {
    if (screen === 'transition') {
      // Skip straight to the new bank, so resuming lands in normal play.
      finishTransition();
    } else if (screen !== 'playing') {
      return;
    }
    screen = 'paused';
    restartArmed = false;
    game.setSoftDrop(false);
    deps.stopLoop();
    deps.resetInput();
    deps.hud.setPauseVisible(false);
    showPauseMenu();
  }

  function resume() {
    screen = 'playing';
    restartArmed = false;
    deps.screens.hide();
    deps.hud.setPauseVisible(true);
    deps.resetInput();
    deps.startLoop();
  }

  /**
   * Enter the bank transition. The engine stops stepping (the loop keeps
   * running only so frameEnd can end the transition on time).
   * @param {{fromBank: number, toBank: number}} event
   */
  function startTransition({ fromBank, toBank }) {
    screen = 'transition';
    transition = { startedAt: deps.now(), toBank };
    deps.banner.hide(); // a FULL WORD that completed the bank must not overlap the text
    game.setSoftDrop(false);
    deps.resetInput();
    deps.screens.show('transition', {
      fromBank,
      toBank,
      connectAfterMs: deps.transition.connectAfterMs,
      skipAfterMs: deps.transition.skipAfterMs,
    });
  }

  function endTransition() {
    finishTransition();
    screen = 'playing';
    deps.screens.hide();
    deps.resetInput();
  }

  function endGame() {
    if (transition) finishTransition();
    screen = 'gameOver';
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
    });
  }

  /**
   * A progression event: apply it to the game and screens.
   * @param {import('./progression/progress.js').ProgressEvent} event
   */
  function handleProgressEvent(event) {
    onEvent(event);
    switch (event.type) {
      case 'fullWord':
        deps.banner.flash('FULL WORD');
        break;
      case 'bankComplete':
        // resetBag: the new mix starts with the piece after the one already
        // in the preview. Gravity applies at once, but nothing falls until
        // the transition ends.
        game.setWeights(event.weights, { resetBag: true });
        game.setGravityMsPerRow(event.gravityMsPerRow);
        if (screen === 'playing') startTransition(event);
        else if (transition) transition.toBank = event.toBank;
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
        handleProgressEvent(progressEvent);
      }
      if (event.type === 'gameOver') endGame();
    }
  }

  function handleCommand(command) {
    if (command === 'pause') {
      pause();
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
        if (event.action === 'pause') pause();
        else if (event.action && COMMANDS[event.action]) COMMANDS[event.action](game);
        return;
      case 'paused':
        // Taps on the well do nothing here, so a stray touch cannot resume;
        // the menu buttons arrive through handleCommand instead.
        if (event.source === 'key' && (event.action === 'pause' || event.action === 'start')) resume();
        return;
      case 'transition':
        if (event.action === 'pause') pause();
        else if (deps.now() - transition.startedAt >= deps.transition.skipAfterMs && isSkip(event)) endTransition();
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
    if (screen === 'transition' && deps.now() - transition.startedAt >= deps.transition.durationMs) {
      endTransition();
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
