/**
 * tests/engine-delays.test.js - Line clear delay, spawn delay, soft-drop
 * row counting, and determinism with the delays on (Stage 3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, boardFromRows, TICK_MS, DEFAULT_CONFIG } from '../js/engine/index.js';

/** Two rows each missing columns 5..6, so an O4 hard drop clears both. */
const TWO_GAPS = () => boardFromRows(['#####..#####', '#####..#####']);
const ticksFor = (ms) => Math.round(ms / TICK_MS);

/** Step n ticks, collecting every event. */
function stepN(game, n) {
  const events = [];
  for (let i = 0; i < n; i++) {
    game.step();
    events.push(...game.drainEvents());
  }
  return events;
}

const types = (events) => events.map((e) => e.type);

test('defaults: 200 ms line clear delay, 100 ms spawn delay', () => {
  assert.equal(DEFAULT_CONFIG.lineClearDelayMs, 200);
  assert.equal(DEFAULT_CONFIG.spawnDelayMs, 100);
});

test('full rows stay on the board, flashing, for lineClearDelayMs', () => {
  const game = createGame({ weights: { O4: 1 }, initialBoard: TWO_GAPS() });
  game.drainEvents();
  game.hardDrop();
  assert.deepEqual(types(game.drainEvents()), ['locked', 'clearStarted']);

  let state = game.getState();
  assert.equal(state.phase, 'clearing');
  assert.deepEqual(state.clearingRows, [24, 25]);
  assert.equal(state.clearProgress, 0);
  assert.equal(state.active, null);
  assert.equal(state.board[25 * 12 + 5] !== 0, true, 'rows still on the board');

  const clearTicks = ticksFor(200); // 24
  let events = stepN(game, clearTicks / 2);
  assert.deepEqual(events, []);
  assert.equal(game.getState().clearProgress, 0.5);

  events = stepN(game, clearTicks / 2 - 1);
  assert.deepEqual(events, []);
  events = stepN(game, 1);
  assert.deepEqual(types(events), ['linesCleared']);
  assert.equal(events[0].count, 2);
  state = game.getState();
  assert.equal(state.phase, 'spawnDelay');
  assert.deepEqual(state.clearingRows, []);
  assert.equal(state.clearProgress, 0);
  assert.equal(state.linesCleared, 2);
  assert.ok(state.board.every((v) => v === 0), 'rows removed');
});

test('the spawn delay follows the line clear delay', () => {
  const game = createGame({ weights: { O4: 1 }, initialBoard: TWO_GAPS() });
  game.drainEvents();
  game.hardDrop();
  game.drainEvents();
  const lockTick = game.getState().tick;
  const events = stepN(game, ticksFor(200) + ticksFor(100));
  assert.deepEqual(types(events), ['linesCleared', 'spawned']);
  assert.equal(events[0].tick, lockTick + 24);
  assert.equal(events[1].tick, lockTick + 36);
  assert.equal(game.getState().phase, 'falling');
});

test('without a line clear, only the spawn delay applies', () => {
  const game = createGame({ weights: { O4: 1 } });
  game.drainEvents();
  game.hardDrop();
  assert.deepEqual(types(game.drainEvents()), ['locked']);
  assert.equal(game.getState().phase, 'spawnDelay');
  assert.deepEqual(stepN(game, ticksFor(100) - 1), []);
  assert.deepEqual(types(stepN(game, 1)), ['spawned']);
});

test('delays are configurable, and 0 skips them in the same tick', () => {
  const zero = createGame({ weights: { O4: 1 }, initialBoard: TWO_GAPS(), lineClearDelayMs: 0, spawnDelayMs: 0 });
  zero.drainEvents();
  zero.hardDrop();
  assert.deepEqual(types(zero.drainEvents()), ['locked', 'clearStarted', 'linesCleared', 'spawned']);
  assert.equal(zero.getState().phase, 'falling');

  const slow = createGame({ weights: { O4: 1 }, initialBoard: TWO_GAPS(), lineClearDelayMs: 500, spawnDelayMs: 0 });
  slow.drainEvents();
  slow.hardDrop();
  slow.drainEvents();
  assert.deepEqual(stepN(slow, ticksFor(500) - 1), []);
  assert.deepEqual(types(stepN(slow, 1)), ['linesCleared', 'spawned']);
});

test('invalid delays are rejected', () => {
  assert.throws(() => createGame({ lineClearDelayMs: -1 }), RangeError);
  assert.throws(() => createGame({ spawnDelayMs: 2.5 }), RangeError);
});

test('during the delays, inputs are ignored except soft drop', () => {
  const game = createGame({ weights: { O4: 1 }, initialBoard: TWO_GAPS() });
  game.hardDrop();
  game.drainEvents();
  for (const phase of ['clearing', 'spawnDelay']) {
    assert.equal(game.getState().phase, phase);
    const board = game.getState().board;
    assert.equal(game.moveLeft(), false);
    assert.equal(game.moveRight(), false);
    assert.equal(game.rotateCW(), false);
    assert.equal(game.rotateCCW(), false);
    assert.equal(game.hardDrop(), false);
    assert.deepEqual(game.getState().board, board);
    assert.deepEqual(game.drainEvents(), []);
    game.setSoftDrop(phase === 'clearing');
    assert.equal(game.getState().softDrop, phase === 'clearing');
    stepN(game, ticksFor(phase === 'clearing' ? 200 : 0));
  }
});

test('soft drop held through the delays carries over to the next piece', () => {
  const game = createGame({ weights: { O4: 1 }, gravityMsPerRow: 1000 });
  game.hardDrop();
  game.setSoftDrop(true);
  stepN(game, ticksFor(100));
  assert.equal(game.getState().phase, 'falling');
  stepN(game, 6); // 20x speed: one row per 6 ticks
  assert.equal(game.getState().active.y, 3);
});

test('locked events report the rows fallen under soft drop', () => {
  const game = createGame({ weights: { O4: 1 }, gravityMsPerRow: 1000 });
  game.drainEvents();
  stepN(game, 120); // one natural row (y 2 -> 3)
  game.setSoftDrop(true);
  stepN(game, 6 * 5); // five soft-dropped rows (y 3 -> 8)
  game.setSoftDrop(false);
  assert.equal(game.getState().active.y, 8);
  game.hardDrop();
  const locked = game.drainEvents().find((e) => e.type === 'locked');
  assert.equal(locked.softDropRows, 5);
  assert.equal(locked.hardDrop, true);
  assert.equal(locked.dropDistance, 24 - 8);

  // The count starts again for the next piece.
  stepN(game, ticksFor(100));
  game.drainEvents();
  game.hardDrop();
  assert.equal(game.drainEvents().find((e) => e.type === 'locked').softDropRows, 0);
});

test('a piece soft-dropped to the floor reports every row it fell', () => {
  const game = createGame({ weights: { O4: 1 }, gravityMsPerRow: 1000 });
  game.drainEvents();
  game.setSoftDrop(true);
  const events = [];
  while (!events.some((e) => e.type === 'locked')) {
    game.step();
    events.push(...game.drainEvents());
  }
  const locked = events.find((e) => e.type === 'locked');
  assert.equal(locked.softDropRows, 24 - 2); // from spawn row 2 to the floor (y 24)
  assert.equal(locked.hardDrop, false);
  assert.equal(locked.dropDistance, 0);
});

test('a 5-line clear (I5 into a shaft) reports 5 rows', () => {
  const board = boardFromRows(Array(5).fill('#####.######'));
  const game = createGame({ weights: { I5: 1 }, initialBoard: board, lineClearDelayMs: 0, spawnDelayMs: 0 });
  game.rotateCW();
  // Find the column the vertical I5 is in, and line it up with the shaft.
  const x = game.getState().active.cells[0][0];
  for (let i = x; i < 5; i++) game.moveRight();
  for (let i = x; i > 5; i--) game.moveLeft();
  game.drainEvents();
  game.hardDrop();
  const cleared = game.drainEvents().find((e) => e.type === 'linesCleared');
  assert.equal(cleared.count, 5);
});

/** Play a fixed script with the default delays; returns events and boards. */
function playScript(seed) {
  const game = createGame({ seed, gravityMsPerRow: 80 });
  const commands = ['moveLeft', 'hardDrop', 'rotateCW', 'moveRight', 'soft', 'hardDrop', 'rotateCCW'];
  const events = [];
  const states = [];
  for (let tick = 0; tick < 8000 && !game.getState().gameOver; tick++) {
    if (tick % 5 === 0) {
      const command = commands[(tick / 5) % commands.length];
      if (command === 'soft') game.setSoftDrop(tick % 3 === 0);
      else game[command]();
    }
    game.step();
    events.push(...game.drainEvents());
    if (tick % 40 === 0) {
      const s = game.getState();
      states.push([s.phase, s.clearingRows.join(), s.clearProgress, [...s.board].join('')].join('|'));
    }
  }
  return { events: JSON.stringify(events), states };
}

test('with delays on, the same seed and inputs replay identically', () => {
  for (const seed of [3, 88]) {
    const a = playScript(seed);
    const b = playScript(seed);
    assert.equal(a.events, b.events);
    assert.deepEqual(a.states, b.states);
    assert.ok(a.events.includes('"spawned"'));
  }
  assert.notEqual(playScript(3).events, playScript(4).events);
});
