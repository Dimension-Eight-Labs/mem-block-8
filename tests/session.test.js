/**
 * tests/session.test.js - Screen flow, input routing, pause menu, bank
 * transition, scoring wiring, and high score, with fake collaborators.
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

const TRANSITION = Object.freeze({ durationMs: 2500, skipAfterMs: 750, connectAfterMs: 900 });

/** Two rows each missing columns 5..6: an O4 hard drop clears both. */
const twoGaps = () => boardFromRows(['#####..#####', '#####..#####']);

/** A fake high score store; `throws` makes it behave like broken storage. */
function fakeHighScore(initial = 0) {
  let value = initial;
  return { get: () => value, set: (n) => { value = n; return true; }, peek: () => value };
}

function setup({ board = null, weights = { O4: 1 }, delays = false, highScore = fakeHighScore(), linesToComplete = null } = {}) {
  const log = [];
  const screens = [];
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
    },
    hud: {
      update: (p) => { hudState = p; },
      setPauseVisible: (v) => { pauseVisible = v; },
    },
    banner: { flash: (text) => log.push(`banner:${text}`), hide: () => log.push('banner:hide') },
    highScore,
    startLoop: () => log.push('start'),
    stopLoop: () => log.push('stop'),
    resetInput: () => log.push('reset'),
    now: () => clock,
    overlayInputDelayMs: 500,
    transition: TRANSITION,
    onEvent: (e) => events.push(e),
    makeProgress,
  });
  return {
    session,
    log,
    events,
    lastScreen: () => screens.at(-1),
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
  assert.deepEqual(hud(), { score: 0, highScore: 0, bank: 1, lines: 0 });
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
  ctx.setClock(TRANSITION.durationMs);
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
  ctx.setClock(TRANSITION.durationMs - 1);
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'transition');
  ctx.setClock(TRANSITION.durationMs);
  ctx.session.frameEnd();
  assert.equal(ctx.session.getScreen(), 'playing');
  assert.ok(ctx.log.includes('tint:2'));
  ctx.session.step();
  assert.equal(ctx.session.getGame().getState().tick, 1);
});

test('a tap or key press skips the transition only after 750 ms', () => {
  for (const input of [tap('tapCenter', null), key('hardDrop')]) {
    const ctx = setup({ board: twoGaps(), linesToComplete: 2 });
    completeBank(ctx);
    ctx.setClock(TRANSITION.skipAfterMs - 1);
    ctx.session.handleInput(input);
    assert.equal(ctx.session.getScreen(), 'transition');
    ctx.setClock(TRANSITION.skipAfterMs);
    ctx.session.handleInput(key('softDropOff')); // a key release is not a skip
    ctx.session.handleInput(tap('swipeUp', 'rotateCW')); // nor is a swipe
    assert.equal(ctx.session.getScreen(), 'transition');
    ctx.session.handleInput(input);
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
    [['RESUME', 'resume'], ['RESTART', 'restart']]);

  const transition = screenLines('transition', { fromBank: 1, toBank: 2, connectAfterMs: 900, skipAfterMs: 750 });
  assert.equal(transition[0].text, 'BANK 0x01 FULL');
  assert.equal(transition[1].text, 'CONNECTING TO BANK 0x02...');
  assert.equal(transition[1].appearAfterMs, 900);
  assert.equal(transition[2].appearAfterMs, 750);

  const over = screenLines('gameOver', { score: 0x1c0, bank: 3, lines: 21, highScore: 0x2000 });
  assert.equal(over[0].text, 'MEMORY FULL');
  assert.ok(over.some((l) => l.text === 'SCORE 0x0001C0'));
  assert.ok(over.some((l) => l.text === 'BANK 0x03'));
  assert.ok(over.some((l) => l.text === 'LINES 0x0015'));
  assert.ok(over.some((l) => l.text === 'HIGH SCORE 0x002000'));
  assert.ok(over.some((l) => l.text === 'TAP TO REBOOT'));
  assert.throws(() => screenLines('nope'), RangeError);
});

test('every on-screen number follows the display mode', () => {
  const data = { fromBank: 2, toBank: 3, score: 1024, bank: 3, lines: 19, highScore: 6720 };
  const transitionBin = screenLines('transition', data, 'bin');
  assert.equal(transitionBin[0].text, 'BANK 0b0000 0010 FULL');
  assert.equal(transitionBin[1].text, 'CONNECTING TO BANK 0b0000 0011...');
  assert.equal(screenLines('transition', data, 'dec')[0].text, 'BANK 002 FULL');
  const overDec = screenLines('gameOver', data, 'dec').map((l) => l.text);
  assert.ok(overDec.includes('SCORE 00001024'));
  assert.ok(overDec.includes('BANK 003'));
  assert.ok(overDec.includes('LINES 00019'));
  assert.ok(overDec.includes('HIGH SCORE 00006720'));
  assert.ok(screenLines('start', {}, 'dec').some((l) => l.text === '00264 WORDS'));
  assert.ok(screenLines('start', {}, 'bin').some((l) => l.text === '0b0000 0001 0000 1000 WORDS'));
  // Same lines in the same order in every mode, so text can be refreshed in place.
  for (const screen of ['start', 'paused', 'transition', 'gameOver']) {
    const kinds = (mode) => screenLines(screen, data, mode).map((l) => l.kind ?? 'line');
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
