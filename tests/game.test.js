/**
 * tests/game.test.js - Game-level behaviour: spawning, movement, gravity,
 * soft and hard drop, lock delay, kicks at the walls and floor, line
 * clears, game over, events, preview, and determinism.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, PIECES, getPieceById, boardFromRows, boardToString, COLS, HIDDEN_ROWS, TICK_MS,
} from '../js/engine/index.js';

/**
 * Most tests predate the line clear and spawn delays and check what happens
 * straight after a lock, so they turn the delays off. The delays have their
 * own tests below.
 */
const NO_DELAYS = Object.freeze({ lineClearDelayMs: 0, spawnDelayMs: 0 });

/** A game that only ever deals one piece type. */
const only = (id, extra = {}) => createGame({ weights: { [id]: 1 }, ...NO_DELAYS, ...extra });

/** Step until pred(state) is true; returns the number of steps taken. */
function stepUntil(game, pred, max = 10000) {
  for (let i = 1; i <= max; i++) {
    game.step();
    if (pred(game.getState())) return i;
  }
  throw new Error('condition never reached');
}

const lockedIn = (events) => events.some((e) => e.type === 'locked');
const cols = (cells) => [...new Set(cells.map(([x]) => x))].sort((a, b) => a - b);
const rows = (cells) => [...new Set(cells.map(([, y]) => y))].sort((a, b) => a - b);
const LOCK_TICKS = Math.round(500 / TICK_MS); // 60

// --- spawning --------------------------------------------------------------

test('every piece spawns centred (odd widths round left) with its bottom in row 3', () => {
  for (const piece of PIECES) {
    const { active } = only(piece.id).getState();
    assert.equal(active.rotation, 0, piece.id);
    assert.equal(active.x, Math.floor((COLS - piece.width) / 2), piece.id);
    assert.equal(Math.min(...cols(active.cells)), active.x, piece.id);
    assert.equal(Math.max(...rows(active.cells)), HIDDEN_ROWS - 1, piece.id);
  }
  assert.equal(only('I3').getState().active.x, 4); // width 3: 4.5 -> 4
  assert.equal(only('I4').getState().active.x, 4); // width 4: exact
  assert.equal(only('I5').getState().active.x, 3); // width 5: 3.5 -> 3
});

test('a new piece enters the visible area on the first gravity row', () => {
  const game = only('O4', { gravityMsPerRow: 1000 });
  const ticks = stepUntil(game, (s) => s.active.y === 3);
  assert.equal(ticks, 120);
  assert.equal(Math.max(...rows(game.getState().active.cells)), HIDDEN_ROWS);
});

test('createGame emits a spawned event and fills the preview', () => {
  const game = createGame({ previewCount: 3 });
  const events = game.drainEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'spawned');
  assert.equal(game.getState().preview.length, 3);
  assert.deepEqual(game.drainEvents(), []);
});

test('the next spawned piece is the head of the preview queue', () => {
  const game = createGame({ previewCount: 2, seed: 41, ...NO_DELAYS });
  // Few enough drops that the centre stack cannot reach the spawn area.
  for (let i = 0; i < 6; i++) {
    const expected = game.getState().preview[0].id;
    game.hardDrop();
    assert.equal(game.getState().active.id, expected);
  }
});

test('previewCount 0 is allowed', () => {
  const game = createGame({ previewCount: 0, ...NO_DELAYS });
  game.hardDrop();
  assert.deepEqual(game.getState().preview, []);
  assert.ok(game.getState().active);
});

// --- movement and collision --------------------------------------------------

test('moves stop at the walls', () => {
  const game = only('O4');
  let moves = 0;
  while (game.moveLeft()) moves++;
  assert.equal(moves, 5);
  assert.equal(game.getState().active.x, 0);
  moves = 0;
  while (game.moveRight()) moves++;
  assert.equal(moves, 10);
  assert.equal(Math.max(...cols(game.getState().active.cells)), 11);
});

test('moves are blocked by locked cells', () => {
  const board = boardFromRows(Array(22).fill('...#........'));
  const game = only('O4', { initialBoard: board });
  game.step(); // irrelevant: still in hidden rows, where column 3 is open
  for (let i = 0; i < 5; i++) game.moveLeft();
  assert.equal(game.getState().active.x, 0);
  // Fall into the visible area, then column 3 blocks moving right past x = 1.
  stepUntil(game, (s) => s.active.y >= 10);
  assert.equal(game.moveRight(), true);
  assert.equal(game.moveRight(), false);
  assert.equal(game.getState().active.x, 1);
});

// --- gravity and drops -----------------------------------------------------

test('soft drop multiplies the fall speed by the configured factor', () => {
  for (const factor of [20, 10]) {
    const normal = only('O4', { gravityMsPerRow: 1000, softDropFactor: factor });
    const fast = only('O4', { gravityMsPerRow: 1000, softDropFactor: factor });
    fast.setSoftDrop(true);
    for (let i = 0; i < 120; i++) {
      normal.step();
      fast.step();
    }
    assert.equal(normal.getState().active.y - 2, 1);
    assert.equal(fast.getState().active.y - 2, factor);
  }
});

test('releasing soft drop restores normal speed', () => {
  const game = only('O4', { gravityMsPerRow: 1000 });
  game.setSoftDrop(true);
  for (let i = 0; i < 6; i++) game.step();
  assert.equal(game.getState().active.y, 3);
  game.setSoftDrop(false);
  assert.equal(game.getState().softDrop, false);
  for (let i = 0; i < 119; i++) game.step();
  assert.equal(game.getState().active.y, 3);
  game.step();
  assert.equal(game.getState().active.y, 4);
});

test('hard drop lands at the reported landing position and locks at once', () => {
  const board = boardFromRows(['......##....', '....#.##....']);
  const game = only('T4', { initialBoard: board });
  game.moveRight();
  const before = game.getState();
  const landing = before.landing.cells.map((c) => [...c]);
  game.drainEvents();
  assert.equal(game.hardDrop(), true);
  const events = game.drainEvents();
  const locked = events.find((e) => e.type === 'locked');
  assert.deepEqual(locked.cells, landing);
  assert.equal(locked.tick, before.tick, 'no time passes');
  assert.equal(locked.hardDrop, true);
  assert.equal(locked.dropDistance, before.landing.y - before.active.y);
  assert.equal(events.at(-1).type, 'spawned');
  for (const [x, y] of landing) {
    assert.equal(game.getState().board[y * COLS + x], getPieceById('T4').index + 1);
  }
});

// --- lock delay ------------------------------------------------------------

/** Drop an O4 to the floor with fast gravity; returns the game, now resting. */
function landedO4(extra = {}) {
  const game = only('O4', { gravityMsPerRow: 10, ...extra });
  stepUntil(game, (s) => s.resting);
  game.drainEvents();
  return game;
}

test('a resting piece locks after lockDelayMs (500 ms = 60 ticks)', () => {
  assert.equal(LOCK_TICKS, 60);
  const game = landedO4();
  // The landing tick already counted one tick of lock time.
  const more = stepUntil(game, () => lockedIn(game.drainEvents()));
  assert.equal(more + 1, LOCK_TICKS);
});

test('lock delay is configurable', () => {
  const game = landedO4({ lockDelayMs: 1000 });
  const more = stepUntil(game, () => lockedIn(game.drainEvents()));
  assert.equal(more + 1, 120);
});

test('a move or rotation while resting resets the lock timer', () => {
  for (const action of ['moveLeft', 'rotateCW']) {
    const game = landedO4();
    for (let i = 0; i < 40; i++) game.step();
    assert.equal(game[action](), true);
    const more = stepUntil(game, () => lockedIn(game.drainEvents()));
    assert.equal(more, LOCK_TICKS, action);
  }
});

test('a failed move does not reset the lock timer', () => {
  const game = landedO4();
  while (game.moveLeft()) { /* reach the wall; each success resets */ }
  for (let i = 0; i < 40; i++) game.step();
  assert.equal(game.moveLeft(), false);
  const more = stepUntil(game, () => lockedIn(game.drainEvents()));
  assert.equal(more, LOCK_TICKS - 40);
});

test('lock resets are capped per piece', () => {
  const game = landedO4({ maxLockResets: 3 });
  for (let i = 0; i < 3; i++) {
    for (let t = 0; t < 30; t++) game.step();
    assert.equal(i % 2 === 0 ? game.moveLeft() : game.moveRight(), true);
  }
  // Cap reached: further moves succeed but no longer buy time.
  let elapsed = 0;
  let locked = false;
  while (!locked) {
    game.step();
    elapsed++;
    locked = lockedIn(game.drainEvents());
    if (!locked && elapsed % 10 === 0) game.rotateCW();
  }
  assert.equal(elapsed, LOCK_TICKS);
});

test('the default reset cap is 15', () => {
  const game = landedO4();
  for (let i = 0; i < 20; i++) {
    game.step();
    game.rotateCW();
  }
  // 20 ticks elapsed; the last 5 rotations did not reset (resets after tick 15).
  const more = stepUntil(game, () => lockedIn(game.drainEvents()));
  assert.equal(more, LOCK_TICKS - 5);
});

test('reaching a new lowest row refreshes the lock timer and resets', () => {
  // A ledge at columns 0..5 on row 24; the floor is row 25 elsewhere.
  const board = boardFromRows(['######......', '............']);
  const game = only('O4', { gravityMsPerRow: 10, maxLockResets: 1, initialBoard: board });
  stepUntil(game, (s) => s.resting); // resting on the ledge at y = 22
  game.drainEvents();
  for (let i = 0; i < 50; i++) game.step();
  assert.equal(game.moveRight(), true); // uses the only reset; x 6 is past the ledge
  assert.equal(game.getState().resting, false);
  stepUntil(game, (s) => s.resting); // falls one row to the floor
  game.drainEvents();
  assert.equal(game.getState().active.y, 24);
  for (let i = 0; i < 30; i++) game.step();
  assert.equal(game.moveRight(), true, 'reset available again after descending');
  const more = stepUntil(game, () => lockedIn(game.drainEvents()));
  assert.equal(more, LOCK_TICKS);
});

// --- wall kicks in play ----------------------------------------------------

test('rotating against the left wall kicks right', () => {
  const game = only('I4');
  stepUntil(game, (s) => s.active.y >= 12);
  game.rotateCW();
  while (game.moveLeft()) { /* to the wall */ }
  assert.deepEqual(cols(game.getState().active.cells), [0]);
  assert.equal(game.rotateCW(), true);
  assert.deepEqual(cols(game.getState().active.cells), [0, 1, 2, 3]);
});

test('rotating against the right wall kicks two columns left', () => {
  const game = only('I4');
  stepUntil(game, (s) => s.active.y >= 12);
  game.rotateCW();
  while (game.moveRight()) { /* to the wall */ }
  assert.deepEqual(cols(game.getState().active.cells), [11]);
  assert.equal(game.rotateCCW(), true);
  assert.deepEqual(cols(game.getState().active.cells), [8, 9, 10, 11]);
});

test('rotating on the floor kicks one row up', () => {
  const game = only('I4', { gravityMsPerRow: 10 });
  stepUntil(game, (s) => s.resting);
  assert.deepEqual(rows(game.getState().active.cells), [25]);
  assert.equal(game.rotateCW(), true);
  const { active } = game.getState();
  assert.equal(active.rotation, 1);
  assert.deepEqual(rows(active.cells), [22, 23, 24, 25]);
});

test('a fully blocked rotation changes nothing; the shaft then clears 4 lines', () => {
  // Everything visible is filled except a one-wide shaft in column 5.
  const board = boardFromRows(Array(22).fill('#####.######'));
  const game = only('I4', { gravityMsPerRow: 10, initialBoard: board });
  assert.equal(game.rotateCW(), true); // vertical, above the shaft
  stepUntil(game, (s) => s.resting);
  const before = game.getState();
  assert.equal(game.rotateCW(), false);
  assert.equal(game.rotateCCW(), false);
  assert.deepEqual(game.getState().active, before.active);
  game.drainEvents();
  stepUntil(game, () => game.drainEvents().some((e) => e.type === 'linesCleared' && e.count === 4
    && e.rows.join() === '22,23,24,25' && e.total === 4));
  assert.equal(game.getState().linesCleared, 4);
});

// --- line clears in play ---------------------------------------------------

test('locking a piece clears full rows and reports them', () => {
  // Rows 24 and 25 are each missing columns 5..6; a marker cell sits above.
  const board = boardFromRows([
    '#...........',
    '#####..#####',
    '#####..#####',
  ]);
  const game = only('O4', { initialBoard: board });
  game.drainEvents();
  game.hardDrop();
  const cleared = game.drainEvents().find((e) => e.type === 'linesCleared');
  assert.deepEqual(cleared.rows, [24, 25]);
  assert.equal(cleared.count, 2);
  const text = boardToString({ board: game.getState().board }).split('\n');
  assert.equal(text.at(-1), '#...........');
  assert.equal(text.at(-2), '............');
});

// --- game over -------------------------------------------------------------

test('block out: a spawn that overlaps blocks ends the game', () => {
  const board = boardFromRows(Array(22).fill('............'));
  board[3 * COLS + 5] = 1; // inside the O4 spawn area
  const game = only('O4', { initialBoard: board });
  const state = game.getState();
  assert.equal(state.gameOver, true);
  assert.equal(state.playing, false);
  assert.equal(state.gameOverReason, 'blockOut');
  assert.equal(state.active, null);
  assert.deepEqual(game.drainEvents().map((e) => e.type), ['gameOver']);
});

test('block out after a lock', () => {
  // Columns 5..6 are filled from row 5 down, leaving one visible row.
  const board = boardFromRows(Array(21).fill('.....##.....'));
  const game = createGame({ weights: { O4: 1 }, initialBoard: board, ...NO_DELAYS });
  // O4 lands on top of the stack at rows 3..4: one row visible, so no lock out.
  game.hardDrop();
  const state = game.getState();
  assert.equal(state.gameOverReason, 'blockOut');
  assert.deepEqual(game.drainEvents().map((e) => e.type), ['spawned', 'locked', 'gameOver']);
});

test('lock out: a piece locking entirely in the hidden rows ends the game', () => {
  const board = boardFromRows(Array(22).fill('.....##.....'));
  const game = only('O4', { initialBoard: board });
  game.hardDrop();
  const state = game.getState();
  assert.equal(state.gameOverReason, 'lockOut');
  assert.equal(state.active, null);
  const types = game.drainEvents().map((e) => e.type);
  assert.deepEqual(types, ['spawned', 'locked', 'gameOver']);
});

test('after game over, commands and steps do nothing', () => {
  const board = boardFromRows(Array(22).fill('.....##.....'));
  const game = only('O4', { initialBoard: board });
  game.hardDrop();
  game.drainEvents();
  const before = game.getState();
  game.step();
  assert.equal(game.moveLeft(), false);
  assert.equal(game.rotateCW(), false);
  assert.equal(game.hardDrop(), false);
  assert.deepEqual(game.getState(), before);
  assert.deepEqual(game.drainEvents(), []);
});

// --- snapshots ---------------------------------------------------------------

test('getState returns a copy that cannot change the game', () => {
  const game = createGame();
  const state = game.getState();
  state.board.fill(9);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.active.cells));
  assert.equal(game.getState().board.every((v) => v === 0), true);
});

test('setGravityMsPerRow changes fall speed and validates input', () => {
  const game = only('O4', { gravityMsPerRow: 1000 });
  game.setGravityMsPerRow(100);
  for (let i = 0; i < 12; i++) game.step();
  assert.equal(game.getState().active.y, 3);
  assert.throws(() => game.setGravityMsPerRow(0), RangeError);
});

test('invalid config is rejected', () => {
  assert.throws(() => createGame({ lockDelayMs: -1 }), RangeError);
  assert.throws(() => createGame({ previewCount: 1.5 }), RangeError);
  assert.throws(() => createGame({ softDropFactor: 0.5 }), RangeError);
  assert.throws(() => createGame({ initialBoard: new Uint8Array(5) }), TypeError);
});

// --- determinism -------------------------------------------------------------

/** Play a fixed script; returns every board snapshot and all events. */
function playScript(seed) {
  const game = createGame({ seed, previewCount: 2, gravityMsPerRow: 100 });
  const commands = ['moveLeft', 'moveRight', 'rotateCW', 'rotateCCW', 'hardDrop', 'soft'];
  const boards = [];
  const events = [];
  for (let tick = 0; tick < 6000 && !game.getState().gameOver; tick++) {
    // A fixed, seed-independent input pattern: some command every 7 ticks.
    if (tick % 7 === 0) {
      const command = commands[(tick / 7) % commands.length];
      if (command === 'soft') game.setSoftDrop(tick % 2 === 0);
      else game[command]();
    }
    game.step();
    events.push(...game.drainEvents());
    if (tick % 50 === 0) boards.push(boardToString(game.getState()));
  }
  boards.push(boardToString(game.getState()));
  return { boards, events: JSON.stringify(events), state: game.getState() };
}

test('the same seed and inputs replay to identical games', () => {
  for (const seed of [1, 8, 123456]) {
    const a = playScript(seed);
    const b = playScript(seed);
    assert.deepEqual(a.boards, b.boards);
    assert.equal(a.events, b.events);
    assert.deepEqual(a.state, b.state);
    assert.ok(a.events.includes('"locked"'), 'script actually plays');
  }
});

test('different seeds give different games', () => {
  assert.notEqual(playScript(1).events, playScript(2).events);
});
