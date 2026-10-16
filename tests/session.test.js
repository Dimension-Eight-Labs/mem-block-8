/**
 * tests/session.test.js - Screen flow, input routing, pause menu, settings
 * screen, bank transition, scoring wiring, high score, and the events the
 * session adds to the sound hook, with fake collaborators.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, isConfirm, isSkip } from '../js/session.js';
import { readUrlOptions } from '../js/url-options.js';
import { screenLines } from '../js/ui/screens.js';
import { formatRecord } from '../js/ui/debug.js';
import { createGame, boardFromRows, TICK_MS } from '../js/engine/index.js';
import { createProgress } from '../js/progression/index.js';

const tap = (gesture = 'tapCenter', action = null) => ({ action, source: 'touch', gesture });
const key = (action) => ({ action, source: 'key', gesture: null });

/** The transition's timing: READY at 1600 ms, over at 2500 ms. */
const READY_AT = 1600;
const DURATION = 2500;
const TRANSITION = Object.freeze({
  timing: () => ({ readyAtMs: READY_AT, durationMs: DURATION }),
  skipAfterMs: 750,
  connectAfterMs: 900,
  skipReadyMs: 600,
  tallyStepMs: 60,
  tallyMaxSteps: 8,
});

/** Two rows each missing columns 5..6: an O4 hard drop clears both. */
const twoGaps = () => boardFromRows(['#####..#####', '#####..#####']);

/** A fake high score store; `throws` makes it behave like broken storage. */
function fakeHighScore(initial = 0) {
  let value = initial;
  return { get: () => value, set: (n) => { value = n; return true; }, peek: () => value };
}

function setup({
  board = null, weights = { O4: 1 }, delays = false, highScore = fakeHighScore(), linesToComplete = null, transition = TRANSITION,
} = {}) {
  const log = [];
  const screens = [];
  const updates = [];
  const flashes = [];
  const events = [];
  let clock = 0;
  let hudState = null;
  let pauseVisible = null;
  const makeProgress = linesToComplete === null ? undefined
    : () => createProgress({
      banks: (bank) => ({ bank, linesToComplete, gravityMsPerRow: 1000 - bank, weights: { O4: 1 } }),
    });
  const session = createSession({
    makeGame: (bank) => createGame({
      seed: 1,
      weights,
      gravityMsPerRow: bank.gravityMsPerRow,
      initialBoard: board,
      ...(delays ? {} : { lineClearDelayMs: 0, spawnDelayMs: 0 }),
    }),
    renderer: { draw: () => log.push('draw') },
    setBankTint: (bank) => log.push(`tint:${bank}`),
    screens: {
      show: (s, data) => { log.push(`show:${s}`); screens.push({ screen: s, data }); },
      hide: () => log.push('hide'),
      update: (patch) => updates.push(patch),
    },
    hud: {
      update: (p) => { hudState = p; },
      setPauseVisible: (v) => { pauseVisible = v; },
    },
    banner: { flash: (text) => log.push(`banner:${text}`), hide: () => log.push('banner:hide') },
    chipFlash: { flash: (f) => flashes.push(f), hide: () => log.push('chipFlash:hide') },
    highScore,
    startLoop: () => log.push('start'),
    stopLoop: () => log.push('stop'),
    resetInput: () => log.push('reset'),
    now: () => clock,
    overlayInputDelayMs: 500,
    transition,
    onEvent: (e) => events.push(e),
    makeProgress,
  });
  return {
    session,
    log,
    events,
    lastScreen: () => screens.at(-1),
    updates,
    flashes,
    hud: () => hudState,
    pauseVisible: () => pauseVisible,
    setClock: (t) => { clock = t; },
  };
}

test('isConfirm: taps and Enter only', () => {
  assert.equal(isConfirm(tap('tapLeft', 'moveLeft')), true);
  assert.equal(isConfirm(tap('doubleTap', 'hardDrop')), true);
  assert.equal(isConfirm(key('start')), true);
  assert.equal(isConfirm(tap('softDropStart', 'softDropOn')), false);
  assert.equal(isConfirm(tap('swipeUp', 'rotateCW')), false);
  assert.equal(isConfirm(key('hardDrop')), false);
});

test('isSkip: taps and key presses, not key releases or swipes', () => {
  assert.equal(isSkip(tap('tapRight', 'moveRight')), true);
  assert.equal(isSkip(key('hardDrop')), true);
  assert.equal(isSkip(key('start')), true);
  assert.equal(isSkip(key('softDropOff')), false);
  assert.equal(isSkip(tap('swipeLeft', 'rotateCCW')), false);
  assert.equal(isSkip(tap('softDropStart', 'softDropOn')), false);
});

test('start screen: a tap starts a game in bank 1', () => {
  const { session, log, hud, pauseVisible } = setup();
  assert.equal(session.getScreen(), 'start');
  session.handleInput(tap('softDropStart', 'softDropOn'));
  assert.equal(session.getScreen(), 'start');
  session.handleInput(tap());
  assert.equal(session.getScreen(), 'playing');
  assert.ok(log.includes('start') && log.includes('hide') && log.includes('tint:1'));
  assert.deepEqual(hud(), { score: 0, highScore: 0, bank: 1, lines: 0, chips: 0 });
  assert.equal(pauseVisible(), true);
});

test('playing: actions become engine commands', () => {
  const { session } = setup();
  session.handleInput(key('start'));
  const x = session.getGame().getState().active.x;
  session.handleInput(key('moveLeft'));
  assert.equal(session.getGame().getState().active.x, x - 1);
  session.handleInput(key('softDropOn'));
  assert.equal(session.getGame().getState().softDrop, true);
  session.handleInput(tap('tapCenter', null)); // unmapped: ignored
  session.handleInput(key('start')); // ignored while playing
  assert.equal(session.getScreen(), 'playing');
});

// --- pause menu ------------------------------------------------------------

test('pause by key, button, or visibility; soft drop is released', () => {
  for (const how of ['key', 'button', 'hidden']) {
    const { session, log, lastScreen, pauseVisible } = setup();
    session.handleInput(key('start'));
    session.handleInput(key('softDropOn'));
    if (how === 'key') session.handleInput(key('pause'));
    else if (how === 'button') session.handleCommand('pause');
    else session.pause();
    assert.equal(session.getScreen(), 'paused', how);
    assert.equal(session.getGame().getState().softDrop, false);
    assert.equal(lastScreen().screen, 'paused');
    assert.equal(lastScreen().data.confirmRestart, false);
    assert.ok(log.includes('stop'));
    assert.equal(pauseVisible(), false);
  }
});

test('while paused the engine does not step and game gestures are ignored', () => {
  const { session } = setup();
  session.handleInput(key('start'));
  session.step();
  session.pause();
  const before = session.getGame().getState();
  session.step();
  session.handleInput(tap('tapLeft', 'moveLeft'));
  session.handleInput(tap('doubleTap', 'hardDrop'));
  session.handleInput(tap('swipeUp', 'rotateCW'));
  session.handleInput(key('hardDrop'));
  assert.equal(session.getScreen(), 'paused', 'taps on the well do not resume');
  assert.deepEqual(session.getGame().getState(), before);
});

test('resume continues exactly where the game left off', () => {
  const { session, pauseVisible } = setup();
  session.handleInput(key('start'));
  for (let i = 0; i < 50; i++) session.step();
  const before = session.getGame().getState();
  session.pause();
  session.handleCommand('resume');
  assert.equal(session.getScreen(), 'playing');
  assert.equal(pauseVisible(), true);
  assert.deepEqual(session.getGame().getState(), before);
  session.step();
  assert.equal(session.getGame().getState().tick, before.tick + 1);
});

test('P, Escape (pause action), and Enter resume from the keyboard', () => {
  for (const action of ['pause', 'start']) {
    const { session } = setup();
    session.handleInput(key('start'));
    session.pause();
    session.handleInput(key(action));
    assert.equal(session.getScreen(), 'playing', action);
  }
});

test('RESTART needs a second tap on CONFIRM RESTART', () => {
  const { session, lastScreen } = setup();
  session.handleInput(key('start'));
  const firstGame = session.getGame();
  session.pause();
  session.handleCommand('restart');
  assert.equal(session.getScreen(), 'paused');
  assert.equal(session.getGame(), firstGame);
  assert.equal(lastScreen().data.confirmRestart, true);
  assert.equal(screenLines('paused', lastScreen().data)[2].text, 'CONFIRM RESTART');
  session.handleCommand('restart');
  assert.equal(session.getScreen(), 'playing');
  assert.notEqual(session.getGame(), firstGame);
});

test('the restart confirmation is forgotten when the menu closes', () => {
  const { session, lastScreen } = setup();
  session.handleInput(key('start'));
  const firstGame = session.getGame();
  session.pause();
  session.handleCommand('restart');
  session.handleCommand('resume');
  session.pause();
  assert.equal(lastScreen().data.confirmRestart, false);
  session.handleCommand('restart');
  assert.equal(session.getGame(), firstGame, 'one tap is not enough again');
});

test('menu commands do nothing outside the pause menu', () => {
  const { session } = setup();
  session.handleCommand('resume');
  session.handleCommand('restart');
  assert.equal(session.getScreen(), 'start');
  session.handleInput(key('start'));
  const game = session.getGame();
  session.handleCommand('restart');
  session.handleCommand('resume');
  assert.equal(session.getScreen(), 'playing');
  assert.equal(session.getGame(), game);
});

test('ticks only advance while playing', () => {
  const { session } = setup();
  session.step(); // no game yet: harmless
  session.handleInput(key('start'));
  session.step();
  assert.equal(session.getGame().getState().tick, 1);
  session.pause();
  session.step();
  assert.equal(session.getGame().getState().tick, 1);
});

// --- scoring wiring --------------------------------------------------------

test('line clears and hard drops update the score and HUD', () => {
  const { session, hud, events } = setup({ board: twoGaps() });
  session.handleInput(key('start'));
  session.handleInput(key('hardDrop'));
  session.frameEnd();
  // O4 spawns at y 2 and drops into the gaps at y 24: 22 rows x 2 points, plus 2 lines x 128.
  assert.equal(hud().score, 44 + 128);
  assert.equal(hud().lines, 2);
  assert.equal(session.getProgress().bankLines, 2);
  const kinds = events.map((e) => e.type);
  for (const type of ['locked', 'clearStarted', 'linesCleared', 'scoreChanged']) {
    assert.ok(kinds.includes(type), type);
  }
});

test('with the default delays, lines are scored when the flash ends', () => {
  const { session, hud } = setup({ board: twoGaps(), delays: true });
  session.handleInput(key('start'));
  session.handleInput(key('hardDrop'));
  session.frameEnd();
  assert.equal(hud().lines, 0, 'rows still flashing');
  assert.equal(session.getGame().getState().phase, 'clearing');
  for (let i = 0; i < Math.round(200 / TICK_MS); i++) session.step();
  session.frameEnd();
  assert.equal(hud().lines, 2);
});

test('a FULL WORD clear flashes the banner', () => {
  const board = boardFromRows(Array(5).fill('#####.######'));
  const { session, log, events, hud } = setup({ board, weights: { I5: 1 } });
  session.handleInput(key('start'));
  session.handleInput(key('rotateCW')); // vertical
  const x = session.getGame().getState().active.cells[0][0];
  for (let i = x; i < 5; i++) session.handleInput(key('moveRight'));
  for (let i = x; i > 5; i--) session.handleInput(key('moveLeft'));
  session.handleInput(key('hardDrop'));
  session.frameEnd();
  assert.ok(log.includes('banner:FULL WORD'));
  assert.deepEqual(events.find((e) => e.type === 'fullWord'), { type: 'fullWord', bank: 1 });
  assert.equal(hud().lines, 5);
});

// --- bank transition --------------------------------------------------------

/** Clear 2 lines per hard drop until a bank completes (linesToComplete = 2). */
function completeBank(ctx) {
  ctx.session.handleInput(key('start'));
  ctx.session.handleInput(key('hardDrop'));
  ctx.session.frameEnd();
}

test('a full bank enters the transition and freezes the engine', () => {
  const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
  completeBank(ctx);
  assert.equal(ctx.session.getScreen(), 'transition');
  assert.equal(ctx.lastScreen().screen, 'transition');
  assert.deepEqual(
    { from: ctx.lastScreen().data.fromBank, to: ctx.lastScreen().data.toBank },
    { from: 1, to: 2 },
  );
  const bankEvent = ctx.events.find((e) => e.type === 'bankComplete');
  assert.equal(bankEvent.fromBank, 1);
  assert.equal(bankEvent.toBank, 2);
  assert.equal(ctx.hud().bank, 2);

  const before = ctx.session.getGame().getState();
  ctx.session.step();
  ctx.session.handleInput(key('moveLeft')); // too early to skip; not a game command either
  assert.deepEqual(ctx.session.getGame().getState(), before);
});

test('the new bank gravity is applied to the engine', () => {
  const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
  completeBank(ctx);
  ctx.setClock(DURATION);
  ctx.session.frameEnd();
  // The fake table uses 1000 - bank ms per row: bank 2 = 998 ms = 119.76 ticks.
  const game = ctx.session.getGame();
  const y = game.getState().active.y;
  for (let i = 0; i < 119; i++) game.step();
  assert.equal(game.getState().active.y, y);
  game.step();
  assert.equal(game.getState().active.y, y + 1);
});

test('the transition ends by itself after its duration and shows the new tint', () => {
  const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
  completeBank(ctx);
  assert.ok(!ctx.log.includes('tint:2'));
  ctx.setClock(DURATION - 1);
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'transition');
  ctx.setClock(DURATION);
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'playing');
  assert.ok(ctx.log.includes('tint:2'));
  ctx.session.step();
  assert.equal(ctx.session.getGame().getState().tick, 1);
});

test('a tap or key press skips the transition only after 750 ms: READY shows briefly, then play', () => {
  for (const input of [tap('tapCenter', null), key('hardDrop')]) {
    const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
    completeBank(ctx);
    ctx.setClock(TRANSITION.skipAfterMs - 1);
    ctx.session.handleInput(input);
    assert.equal(ctx.lastScreen().data.ready, false);
    ctx.setClock(TRANSITION.skipAfterMs);
    ctx.session.handleInput(key('softDropOff')); // a key release is not a skip
    ctx.session.handleInput(tap('swipeUp', 'rotateCW')); // nor is a swipe
    assert.equal(ctx.lastScreen().data.ready, false);
    ctx.session.handleInput(input);
    // The swap is skipped: READY shows (with the tally complete) for skipReadyMs.
    assert.equal(ctx.session.getScreen(), 'transition');
    assert.equal(ctx.lastScreen().data.ready, true);
    assert.deepEqual(ctx.events.filter((e) => e.type === 'bankReady').map((e) => e.skipped), [true]);
    ctx.session.handleInput(input); // more taps wait for READY to finish
    ctx.setClock(TRANSITION.skipAfterMs + TRANSITION.skipReadyMs - 1);
    ctx.session.frameEnd();
    assert.equal(ctx.session.getScreen(), 'transition');
    ctx.setClock(TRANSITION.skipAfterMs + TRANSITION.skipReadyMs);
    ctx.session.frameEnd();
    assert.equal(ctx.session.getScreen(), 'playing');
    assert.ok(ctx.log.includes('tint:2'));
    // The skipping input is not also applied to the game.
    assert.equal(ctx.session.getGame().getState().tick, 0);
  }
});

test('pausing during a transition finishes it and opens the pause menu', () => {
  const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
  completeBank(ctx);
  ctx.session.pause();
  assert.equal(ctx.session.getScreen(), 'paused');
  assert.ok(ctx.log.includes('tint:2'));
  ctx.session.handleCommand('resume');
  assert.equal(ctx.session.getScreen(), 'playing');
});

// --- game over and high score ----------------------------------------------

/** Columns 5..6 are filled, so the first O4 locks out on a hard drop. */
const lockOutBoard = () => boardFromRows(Array(22).fill('.....##.....'));

test('game over shows score, bank, lines and ignores input briefly', () => {
  const ctx = setup({ board: lockOutBoard() });
  ctx.session.handleInput(key('start'));
  ctx.session.handleInput(key('hardDrop'));
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'gameOver');
  assert.equal(ctx.pauseVisible(), false);
  const { data } = ctx.lastScreen();
  assert.deepEqual(
    { score: data.score, bank: data.bank, lines: data.lines },
    { score: 0, bank: 1, lines: 0 },
  );
  ctx.setClock(499);
  ctx.session.handleInput(tap());
  assert.equal(ctx.session.getScreen(), 'gameOver');
  ctx.setClock(500);
  ctx.session.handleInput(tap());
  assert.equal(ctx.session.getScreen(), 'playing');
});

/** Score some points (a 2-line clear), then top out. */
function scoreThenTopOut(highScore) {
  const ctx = setup({ board: twoGaps(), highScore });
  ctx.session.handleInput(key('start'));
  ctx.session.handleInput(key('hardDrop')); // 172 points
  ctx.session.frameEnd();
  // Stack O4s in the middle until the game ends.
  for (let i = 0; i < 20 && ctx.session.getScreen() === 'playing'; i++) {
    ctx.session.handleInput(key('hardDrop'));
    ctx.session.frameEnd();
  }
  return ctx;
}

test('a better score is saved and announced as NEW HIGH SCORE', () => {
  const store = fakeHighScore(100);
  const ctx = scoreThenTopOut(store);
  assert.equal(ctx.session.getScreen(), 'gameOver');
  const { data } = ctx.lastScreen();
  assert.ok(data.score > 100);
  assert.equal(data.newHighScore, true);
  assert.equal(store.peek(), data.score);
  assert.ok(screenLines('gameOver', data).some((l) => l.text === 'NEW HIGH SCORE'));
});

test('a lower or equal score keeps the saved high score', () => {
  const store = fakeHighScore(1_000_000);
  const ctx = scoreThenTopOut(store);
  const { data } = ctx.lastScreen();
  assert.equal(data.newHighScore, false);
  assert.equal(data.highScore, 1_000_000);
  assert.equal(store.peek(), 1_000_000);
  assert.ok(!screenLines('gameOver', data).some((l) => l.text === 'NEW HIGH SCORE'));
});

test('the game plays normally when high score storage fails', () => {
  const broken = { get: () => 0, set: () => false };
  const ctx = scoreThenTopOut(broken);
  assert.equal(ctx.session.getScreen(), 'gameOver');
  assert.equal(ctx.lastScreen().data.newHighScore, true);
  ctx.setClock(1000);
  ctx.session.handleInput(tap());
  assert.equal(ctx.session.getScreen(), 'playing');
});

// --- screens and misc --------------------------------------------------------

test('screen text', () => {
  assert.equal(screenLines('start')[0].text, 'MEM BLOCK 8');
  assert.ok(screenLines('start').some((l) => l.text === 'MEMORY BANK READY'));
  assert.ok(screenLines('start').some((l) => l.text === '12 x 22 CELLS'));
  assert.ok(screenLines('start').some((l) => l.text === '0x0108 WORDS'));
  assert.ok(screenLines('start').some((l) => l.text === 'TAP TO START'));

  const paused = screenLines('paused');
  assert.equal(paused[0].text, 'PAUSED');
  assert.deepEqual(paused.filter((l) => l.kind === 'button').map((l) => [l.text, l.command]),
    [['RESUME', 'resume'], ['RESTART', 'restart'], ['SETTINGS', 'settings']]);
  assert.deepEqual(screenLines('start').filter((l) => l.kind === 'button').map((l) => [l.text, l.command]),
    [['SETTINGS', 'settings']]);

  const transition = screenLines('transition', { fromBank: 1, toBank: 2, connectAfterMs: 900, skipAfterMs: 750 });
  assert.deepEqual(transition.map((l) => l.text), ['MEMORY BANK 0x01 FULL', 'SWAPPING TO MEMORY BANK 0x02...', 'TAP TO SKIP']);
  assert.equal(transition[1].appearAfterMs, 900);
  assert.equal(transition[2].appearAfterMs, 750);
  const ready = screenLines('transition', { fromBank: 1, toBank: 2, ready: true, chips: 3, tally: 0x600 });
  assert.deepEqual(ready.map((l) => l.text),
    ['MEMORY BANK 0x01 FULL', 'SWAPPING TO MEMORY BANK 0x02...', 'MEMORY BANK 0x02 READY', 'CHIPS 0x03 = +0x0600']);
  assert.deepEqual(ready.map((l) => Boolean(l.cursor)), [false, false, true, false], 'the cursor moves to READY');
  // No chips: no tally line.
  assert.equal(screenLines('transition', { fromBank: 1, toBank: 2, ready: true, chips: 0 }).length, 3);

  const over = screenLines('gameOver', { score: 0x1c0, bank: 3, lines: 21, highScore: 0x2000 });
  assert.equal(over[0].text, 'NO CARRIER');
  assert.equal(over[1].text, 'MEMORY FULL');
  assert.equal(over[1].cursor, true);
  assert.ok(over.some((l) => l.text === 'SCORE 0x0001C0'));
  assert.ok(over.some((l) => l.text === 'MEMORY BANK 0x03'));
  assert.ok(!over.some((l) => l.text.startsWith('CHIPS LOST')), 'no chips lost: no line');
  const lost = screenLines('gameOver', { score: 0, bank: 1, lines: 0, highScore: 0, chipsLost: 2 });
  assert.deepEqual(lost.slice(0, 3).map((l) => l.text), ['NO CARRIER', 'MEMORY FULL', 'CHIPS LOST 0x02']);
  assert.ok(over.some((l) => l.text === 'LINES 0x0015'));
  assert.ok(over.some((l) => l.text === 'HIGH SCORE 0x002000'));
  assert.ok(over.some((l) => l.text === 'TAP TO REBOOT'));
  assert.throws(() => screenLines('nope'), RangeError);
});

test('every on-screen number follows the display mode', () => {
  const data = { fromBank: 2, toBank: 3, score: 1024, bank: 3, lines: 19, highScore: 6720 };
  const transitionBin = screenLines('transition', data, 'bin');
  assert.equal(transitionBin[0].text, 'MEMORY BANK 0b0000 0010 FULL');
  assert.equal(transitionBin[1].text, 'SWAPPING TO MEMORY BANK 0b0000 0011...');
  assert.equal(screenLines('transition', data, 'dec')[0].text, 'MEMORY BANK 002 FULL');
  const readyData = { ...data, ready: true, chips: 3, tally: 1536 };
  assert.equal(screenLines('transition', readyData, 'bin')[2].text, 'MEMORY BANK 0b0000 0011 READY');
  assert.equal(screenLines('transition', readyData, 'bin')[3].text, 'CHIPS 0b0000 0011 = +0b0000 0110 0000 0000');
  assert.equal(screenLines('transition', readyData, 'dec')[3].text, 'CHIPS 003 = +01536');
  assert.ok(screenLines('gameOver', { ...data, chipsLost: 2 }, 'dec').some((l) => l.text === 'CHIPS LOST 002'));
  const overDec = screenLines('gameOver', data, 'dec').map((l) => l.text);
  assert.ok(overDec.includes('SCORE 00001024'));
  assert.ok(overDec.includes('MEMORY BANK 003'));
  assert.ok(overDec.includes('LINES 00019'));
  assert.ok(overDec.includes('HIGH SCORE 00006720'));
  assert.ok(screenLines('start', {}, 'dec').some((l) => l.text === '00264 WORDS'));
  assert.ok(screenLines('start', {}, 'bin').some((l) => l.text === '0b0000 0001 0000 1000 WORDS'));
  // Same lines in the same order in every mode, so text can be refreshed in place.
  for (const [screen, d] of [['start', data], ['paused', data], ['transition', data], ['transition', readyData],
    ['gameOver', data], ['gameOver', { ...data, chipsLost: 4 }]]) {
    const kinds = (mode) => screenLines(screen, d, mode).map((l) => l.kind ?? 'line');
    assert.deepEqual(kinds('bin'), kinds('hex'), screen);
    assert.deepEqual(kinds('dec'), kinds('hex'), screen);
  }
});

test('FULL WORD is hidden the moment a bank transition starts', () => {
  const board = boardFromRows(Array(10).fill('#####.######'));
  const ctx = setup({ board, weights: { I5: 1 } });
  ctx.session.handleInput(key('start'));
  const dropIntoShaft = () => {
    ctx.session.handleInput(key('rotateCW'));
    const x = ctx.session.getGame().getState().active.cells[0][0];
    for (let i = x; i < 5; i++) ctx.session.handleInput(key('moveRight'));
    for (let i = x; i > 5; i--) ctx.session.handleInput(key('moveLeft'));
    ctx.session.handleInput(key('hardDrop'));
    ctx.session.frameEnd();
  };
  dropIntoShaft(); // 5 lines: FULL WORD, bank not yet full
  assert.ok(ctx.log.includes('banner:FULL WORD'));
  assert.ok(!ctx.log.includes('banner:hide'));
  dropIntoShaft(); // 5 more: FULL WORD again, and bank 1 is full
  assert.equal(ctx.session.getScreen(), 'transition');
  const lastFlash = ctx.log.lastIndexOf('banner:FULL WORD');
  const hide = ctx.log.lastIndexOf('banner:hide');
  const showTransition = ctx.log.lastIndexOf('show:transition');
  assert.ok(hide > lastFlash, 'hidden after the last flash');
  assert.ok(hide < showTransition, 'hidden before the transition text appears');
});

test('the HUD gets the high score: saved best, then the live score once beaten', () => {
  const ctx = setup({ board: twoGaps(), highScore: fakeHighScore(100) });
  assert.equal(ctx.hud().highScore, 100, 'shown on the start screen');
  ctx.session.handleInput(key('start'));
  assert.equal(ctx.hud().highScore, 100);
  ctx.session.handleInput(key('hardDrop')); // 172 points
  ctx.session.frameEnd();
  assert.equal(ctx.hud().score, 172);
  assert.equal(ctx.hud().highScore, 172);
});

test('bank changes reset the bag: the new mix starts after the previewed piece', () => {
  // A fake bank table whose bank 2 deals only I3.
  const session = createSession({
    // Default delays, as in the real game: the bank completes when the
    // flash ends, before the next piece spawns.
    makeGame: () => createGame({ seed: 1, weights: { O4: 5 }, initialBoard: twoGaps() }),
    renderer: { draw() {} },
    setBankTint() {},
    screens: { show() {}, hide() {} },
    hud: { update() {}, setPauseVisible() {} },
    banner: { flash() {}, hide() {} },
    chipFlash: { flash() {}, hide() {} },
    highScore: fakeHighScore(),
    startLoop() {},
    stopLoop() {},
    resetInput() {},
    now: () => 0,
    overlayInputDelayMs: 500,
    transition: TRANSITION,
    makeProgress: () => createProgress({
      banks: (bank) => ({ bank, linesToComplete: 2, gravityMsPerRow: 1000, weights: bank === 1 ? { O4: 5 } : { I3: 1 } }),
    }),
  });
  session.handleInput(key('start'));
  session.handleInput(key('hardDrop')); // clears 2 lines: bank 2 once the flash ends
  for (let i = 0; i < 24 && session.getScreen() === 'playing'; i++) session.step();
  assert.equal(session.getScreen(), 'transition');
  const game = session.getGame();
  assert.equal(game.getState().preview[0].id, 'O4', 'the preview still shows what it showed');
  for (let i = 0; i < 12; i++) game.step(); // finish the spawn delay directly
  assert.equal(game.getState().active.id, 'O4', 'the previewed piece is dealt next');
  assert.equal(game.getState().preview[0].id, 'I3', 'bank 2 mix starts right after it');
});

test('URL options accept only known values', () => {
  assert.deepEqual(readUrlOptions(''), { debug: false });
  assert.deepEqual(readUrlOptions('?debug=1&logo=center&moveOn=down&doubleTap=anywhere'),
    { debug: true, logoPlacement: 'center', moveOn: 'down', doubleTapMode: 'anywhere' });
  assert.deepEqual(readUrlOptions('?debug=yes&logo=top&moveOn=sideways'), { debug: false });
});

test('debug records format compactly', () => {
  const line = formatRecord({ label: 'swipeUp', action: 'rotateCW', zone: 'center', distance: 34, duration: 41, t: 1250 }, 1000);
  assert.equal(line, ' +250 swipeUp > rotateCW center 34px 41ms');
});

// --- settings screen (Stage 5) ---------------------------------------------------

test('SETTINGS opens from the start screen; BACK returns there', () => {
  const ctx = setup();
  ctx.session.handleCommand('settings');
  assert.equal(ctx.session.getScreen(), 'settings');
  assert.equal(ctx.lastScreen().screen, 'settings');
  ctx.session.handleInput(tap()); // taps on the well do not start a game from settings
  assert.equal(ctx.session.getScreen(), 'settings');
  ctx.session.handleCommand('back');
  assert.equal(ctx.session.getScreen(), 'start');
  assert.equal(ctx.lastScreen().screen, 'start');
  ctx.session.handleInput(tap());
  assert.equal(ctx.session.getScreen(), 'playing');
});

test('SETTINGS from the pause menu keeps the game paused; BACK returns to the menu', () => {
  const ctx = setup();
  ctx.session.handleInput(key('start'));
  ctx.session.handleCommand('pause');
  const before = ctx.session.getGame().getState();
  ctx.log.length = 0;
  ctx.session.handleCommand('settings');
  assert.equal(ctx.session.getScreen(), 'settings');
  ctx.session.step();
  ctx.session.handleInput(key('moveLeft'));
  ctx.session.handleInput(key('start')); // Enter is left to the focused button
  assert.equal(ctx.session.getScreen(), 'settings');
  assert.deepEqual(ctx.session.getGame().getState(), before);
  assert.ok(!ctx.log.includes('start'), 'loop not restarted');
  ctx.session.handleInput(key('pause')); // P or Escape goes back
  assert.equal(ctx.session.getScreen(), 'paused');
  assert.equal(ctx.lastScreen().screen, 'paused');
  ctx.session.handleCommand('settings');
  ctx.session.handleCommand('back');
  assert.equal(ctx.session.getScreen(), 'paused');
  ctx.session.handleCommand('resume');
  assert.equal(ctx.session.getScreen(), 'playing');
});

test('SETTINGS and BACK do nothing where they do not apply', () => {
  const ctx = setup();
  ctx.session.handleCommand('back');
  assert.equal(ctx.session.getScreen(), 'start');
  ctx.session.handleInput(key('start'));
  ctx.session.handleCommand('settings');
  assert.equal(ctx.session.getScreen(), 'playing');
  ctx.session.handleCommand('back');
  assert.equal(ctx.session.getScreen(), 'playing');
});

// --- events for the sound hook (Stage 5) -----------------------------------------

test('every screen change is reported through the hook, with the bank', () => {
  const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
  completeBank(ctx);
  ctx.session.pause(); // during the transition
  ctx.session.handleCommand('settings');
  ctx.session.handleCommand('back');
  ctx.session.handleCommand('resume');
  const screens = ctx.events.filter((e) => e.type === 'screen').map((e) => `${e.from}>${e.screen}@${e.bank}`);
  assert.deepEqual(screens, [
    'start>playing@1', 'playing>transition@2', 'transition>paused@2',
    'paused>settings@2', 'settings>paused@2', 'paused>playing@2',
  ]);
  // bankComplete reaches the hook before the transition screen (the modem starts first).
  const types = ctx.events.map((e) => e.type);
  assert.ok(types.indexOf('bankComplete') < types.findIndex((t, i) => t === 'screen' && ctx.events[i].screen === 'transition'));
  assert.equal(types[0], 'newGame');
});

test('game over and a new game are reported; restart reports newGame', () => {
  const ctx = setup({ board: lockOutBoard() });
  ctx.session.handleInput(key('start'));
  ctx.session.handleInput(key('hardDrop'));
  ctx.session.frameEnd();
  const types = ctx.events.map((e) => e.type);
  assert.ok(types.includes('gameOver'));
  assert.deepEqual(ctx.events.at(-1), { type: 'screen', screen: 'gameOver', from: 'playing', bank: 1 });
  ctx.events.length = 0;
  ctx.setClock(1000);
  ctx.session.handleInput(tap());
  assert.deepEqual(ctx.events.map((e) => e.type).slice(0, 2), ['newGame', 'screen']);
});

test('a successful rotation is reported; a blocked one and moves are not', () => {
  const ctx = setup({ weights: { I3: 1 } });
  ctx.session.handleInput(key('start'));
  ctx.events.length = 0;
  ctx.session.handleInput(key('rotateCW'));
  ctx.session.handleInput(key('rotateCCW'));
  ctx.session.handleInput(key('moveLeft'));
  assert.deepEqual(ctx.events, [{ type: 'rotated', direction: 1 }, { type: 'rotated', direction: -1 }]);
  // A rotation the engine refuses (blocked, no kick fits) makes no sound.
  Object.defineProperty(ctx.session.getGame(), 'rotateCW', { value: () => false });
  ctx.events.length = 0;
  ctx.session.handleInput(key('rotateCW'));
  assert.deepEqual(ctx.events, []);
});

test('the transition timing is read when each transition starts', () => {
  let durationMs = 4000;
  const transition = { ...TRANSITION, timing: () => ({ readyAtMs: durationMs - 900, durationMs }) };
  const ctx = setup({ board: twoGaps(), linesToComplete: 2, transition });
  completeBank(ctx);
  durationMs = 100; // a change mid-transition does not shorten this one
  ctx.setClock(3999);
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'transition');
  ctx.setClock(4000);
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'playing');
});

// --- microchips and the READY moment (playtest pass 1) ------------------------------

test('a multi-row clear flashes its chips where the rows cleared, and CHP counts them', () => {
  const ctx = setup({ board: twoGaps() });
  ctx.session.handleInput(key('start'));
  ctx.session.handleInput(key('hardDrop'));
  ctx.session.frameEnd();
  assert.deepEqual(ctx.flashes, [{ count: 1, rows: [24, 25], fullWord: false }]);
  assert.equal(ctx.hud().chips, 1);
  assert.deepEqual(ctx.events.find((e) => e.type === 'chipsEarned'), { type: 'chipsEarned', count: 1, total: 1, fullWord: false });
});

test('bank complete: chips are cashed into the score at once; the READY tally only animates it', () => {
  const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
  completeBank(ctx); // a 2-row clear: 1 chip, and bank 1 completes
  const points = 1 * 0x100 * 1;
  const { score } = ctx.session.getProgress();
  const scored = ctx.events.filter((e) => e.type === 'scoreChanged');
  assert.deepEqual(scored.map((e) => e.reason), ['drop', 'lines', 'chips']);
  assert.equal(scored.at(-1).points, points);
  assert.equal(score, scored.reduce((sum, e) => sum + e.points, 0), 'the cash-in is in the score already');
  assert.equal(ctx.session.getProgress().chips, 0, 'reset for the new bank');
  assert.deepEqual(ctx.events.find((e) => e.type === 'chipsCashed'), { type: 'chipsCashed', count: 1, points, bank: 1 });
  // During the swap the HUD holds the cash-in back and still shows the chip.
  assert.equal(ctx.hud().score, score - points);
  assert.equal(ctx.hud().chips, 1);
  assert.equal(ctx.lastScreen().data.chips, 1);
  assert.equal(ctx.lastScreen().data.ready, false);

  // READY: the tally counts up in steps, the HUD's SCR with it.
  ctx.setClock(READY_AT);
  ctx.session.frameEnd();
  assert.equal(ctx.lastScreen().data.ready, true);
  assert.equal(ctx.lastScreen().data.tally, 0);
  assert.equal(ctx.hud().chips, 0);
  const ready = ctx.events.find((e) => e.type === 'bankReady');
  assert.deepEqual(ready, { type: 'bankReady', bank: 2, count: 1, points, steps: 1, stepMs: 60, skipped: false });
  ctx.setClock(READY_AT + 60);
  ctx.session.frameEnd();
  assert.deepEqual(ctx.updates, [{ tally: points }]);
  assert.equal(ctx.hud().score, score);
  ctx.setClock(DURATION);
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'playing');
  assert.equal(ctx.hud().score, score);
});

test('the tally is rate-limited: at most tallyMaxSteps steps, values only rising', () => {
  // Five 2-row clears in a 10-line bank: 5 chips, but tallyMaxSteps 2.
  const transition = { ...TRANSITION, tallyMaxSteps: 2 };
  const board = boardFromRows(Array(10).fill('#####..#####'));
  const ctx = setup({ board, linesToComplete: 10, transition });
  ctx.session.handleInput(key('start'));
  for (let i = 0; i < 5 && ctx.session.getScreen() === 'playing'; i++) {
    ctx.session.handleInput(key('hardDrop'));
    ctx.session.frameEnd();
  }
  assert.equal(ctx.session.getScreen(), 'transition');
  assert.equal(ctx.lastScreen().data.chips, 5);
  for (let t = READY_AT; t < DURATION; t += 10) {
    ctx.setClock(t);
    ctx.session.frameEnd();
  }
  assert.deepEqual(ctx.updates.map((u) => u.tally), [640, 1280]);
  assert.equal(ctx.events.find((e) => e.type === 'bankReady').steps, 2);
});

test('skipping cashes in at once: the tally shows complete, nothing is lost', () => {
  const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
  completeBank(ctx);
  const { score } = ctx.session.getProgress();
  ctx.setClock(TRANSITION.skipAfterMs);
  ctx.session.handleInput(tap());
  assert.equal(ctx.lastScreen().data.ready, true);
  assert.equal(ctx.lastScreen().data.tally, 256);
  assert.equal(ctx.hud().score, score, 'the HUD shows the whole cash-in');
  assert.deepEqual(ctx.events.filter((e) => e.type === 'bankReady').map((e) => [e.count, e.points, e.skipped]), [[1, 256, true]]);
  ctx.setClock(TRANSITION.skipAfterMs + TRANSITION.skipReadyMs);
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'playing');
  assert.equal(ctx.session.getProgress().score, score);
  assert.deepEqual(ctx.updates, [], 'no count-up after a skip');
});

test('a bank completed without chips has no tally', () => {
  // Single-row clears only: two I3s laid flat... simpler: a short bank of 1 line.
  const board = boardFromRows(['#####..#####']);
  const ctx = setup({ board, linesToComplete: 1 });
  ctx.session.handleInput(key('start'));
  ctx.session.handleInput(key('hardDrop')); // O4 clears 1 row
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'transition');
  assert.equal(ctx.lastScreen().data.chips, 0);
  ctx.setClock(READY_AT);
  ctx.session.frameEnd();
  assert.equal(ctx.events.find((e) => e.type === 'bankReady').count, 0);
  assert.equal(screenLines('transition', ctx.lastScreen().data).length, 3, 'no tally line');
});

test('pausing during the READY moment still finishes the transition', () => {
  const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
  completeBank(ctx);
  ctx.setClock(READY_AT);
  ctx.session.frameEnd();
  ctx.session.pause();
  assert.equal(ctx.session.getScreen(), 'paused');
  assert.equal(ctx.hud().score, ctx.session.getProgress().score);
});

test('game over loses uncashed chips and says so', () => {
  const ctx = scoreThenTopOut(fakeHighScore());
  assert.equal(ctx.session.getScreen(), 'gameOver');
  assert.deepEqual(ctx.events.find((e) => e.type === 'chipsLost'), { type: 'chipsLost', count: 1 });
  assert.equal(ctx.lastScreen().data.chipsLost, 1);
  assert.ok(screenLines('gameOver', ctx.lastScreen().data).some((l) => l.text === 'CHIPS LOST 0x01'));
  assert.equal(ctx.hud().chips, 0);
  // A new game starts with no chips and no loss to report.
  ctx.setClock(10_000);
  ctx.session.handleInput(tap());
  assert.equal(ctx.hud().chips, 0);
});

// --- wording: always "MEMORY BANK" ----------------------------------------------------

/** "BANK" not preceded by "MEMORY " (the BNK register label is a different word). */
const LONE_BANK = /(?<!MEMORY )\bBANK\b/i;

test('no player-facing screen line says BANK without MEMORY, or CONNECTING TO BANK', () => {
  const data = {
    fromBank: 3, toBank: 4, score: 5000, bank: 4, lines: 33, highScore: 9000, newHighScore: false,
    chips: 3, tally: 0x600, chipsLost: 2, confirmRestart: false,
    rows: [{ id: 'music', label: 'MUSIC', value: 'ON' }],
  };
  for (const mode of ['hex', 'bin', 'dec']) {
    for (const screen of ['start', 'paused', 'settings', 'transition', 'gameOver']) {
      for (const extra of [{}, { ready: true }, { newHighScore: true }, { confirmRestart: true }]) {
        for (const line of screenLines(screen, { ...data, ...extra }, mode)) {
          assert.ok(!line.text.includes('CONNECTING TO BANK'), line.text);
          assert.ok(!LONE_BANK.test(line.text), `${screen} (${mode}): "${line.text}"`);
        }
      }
    }
  }
  assert.ok(!LONE_BANK.test('BNK 0x02'), 'the HUD label is allowed');
  assert.ok(LONE_BANK.test('BANK 0x02 FULL'), 'the check catches the old wording');
});

test('README how-to-play says "memory bank", never "bank" alone', async () => {
  const { readFileSync } = await import('node:fs');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const start = readme.indexOf('## How to play');
  const end = readme.indexOf('\n## ', start + 1);
  assert.ok(start >= 0 && end > start);
  const section = readme.slice(start, end)
    .replaceAll('`BNK`', '') // the HUD register label
    .replaceAll(/\(docs\/DESIGN\.md#[^)]*\)/g, '') // link anchors
    .replaceAll(/\s+/g, ' '); // "memory" and "bank" may be on two lines
  const lone = section.match(new RegExp(`.{0,40}${LONE_BANK.source}.{0,40}`, 'i'));
  assert.equal(lone, null, lone && lone[0]);
  assert.ok(!/connecting to bank/i.test(section));
});
