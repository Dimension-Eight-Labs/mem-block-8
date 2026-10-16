/**
 * js/engine/game.js - A single game: active piece, gravity, locking, events.
 *
 * createGame() returns an object whose methods are the only way to change
 * the game. Time advances only through step(), one fixed tick at a time;
 * the requestAnimationFrame accumulator that calls it lives outside the
 * engine (Stage 2). Commands (moveLeft, rotateCW, ...) take effect
 * immediately when called, between steps.
 *
 * Determinism: given the same config (including seed) and the same
 * commands issued before the same tick numbers, a game always plays out
 * identically. Nothing here reads a clock or Math.random.
 *
 * LOCK DELAY AND THE RESET CAP
 * ----------------------------
 * A piece that cannot fall further is "resting". While resting, its lock
 * timer runs; when it reaches lockDelayMs the piece locks. A successful
 * move or rotation that starts while resting restarts the timer, but only
 * maxLockResets times. Without that cap a player could slide or spin a
 * piece forever and the game would never progress.
 *
 * The timer and the reset count are refreshed only when the piece reaches
 * a row lower than any it has reached before. Simply leaving the ground
 * (sliding off a ledge, or the one-row-up kick) does not refresh them, so
 * repeated up-kicks cannot be used to stall either: every refresh needs
 * real downward progress, and there are only so many rows.
 *
 * PHASES AND DELAYS
 * -----------------
 * A game is always in one phase:
 *
 *   falling     a piece is active; gravity and lock delay run.
 *   clearing    a lock filled rows; they stay on the board for
 *               lineClearDelayMs so the renderer can flash them.
 *   spawnDelay  waiting spawnDelayMs before the next piece appears.
 *   gameOver
 *
 * falling -> (lock) -> clearing (only if rows are full) -> spawnDelay ->
 * falling. A delay of 0 skips its phase within the same tick. Delays count
 * in ticks like every other engine timer. With no active piece, moves,
 * rotations, and hard drops do nothing; soft drop can still be held or
 * released, so a held finger carries over to the next piece.
 */

import { HIDDEN_ROWS, COLS, TIME_UNITS_PER_MS, TIME_UNITS_PER_TICK } from './constants.js';
import { createBoard, collides, placeCells, findFullRows, clearRows } from './board.js';
import { PIECES } from './pieces.js';
import { getRotationCells, tryRotate } from './rotation.js';
import { createRng } from './rng.js';
import { createBag } from './randomizer.js';
import { resolveConfig } from './config.js';

/**
 * @typedef {object} PieceSnapshot
 * @property {string} id
 * @property {number} index
 * @property {number} rotation 0..3
 * @property {number} x Piece position (origin of its local frame).
 * @property {number} y
 * @property {readonly import('./pieces.js').Cell[]} cells Absolute board cells.
 */

/**
 * @typedef {object} GameState
 * @property {number} tick Ticks simulated so far.
 * @property {Uint8Array} board A copy of the board; changing it has no effect.
 * @property {PieceSnapshot | null} active The falling piece, or null after game over.
 * @property {PieceSnapshot | null} landing Where a hard drop would put the active piece.
 * @property {readonly {id: string, index: number}[]} preview Upcoming pieces, next first.
 * @property {Phase} phase
 * @property {readonly number[]} clearingRows Full rows waiting to be removed
 *   (ascending), during the 'clearing' phase; otherwise empty.
 * @property {number} clearProgress 0..1 through the line clear delay
 *   ('clearing' phase only; 0 otherwise). For drawing only.
 * @property {number} linesCleared Running total.
 * @property {boolean} resting Whether the active piece is on the ground (lock timer running).
 * @property {boolean} softDrop Whether soft drop is held.
 * @property {boolean} playing
 * @property {boolean} gameOver
 * @property {'blockOut' | 'lockOut' | null} gameOverReason
 */

/**
 * @typedef {'falling' | 'clearing' | 'spawnDelay' | 'gameOver'} Phase
 */

/**
 * @typedef {{type: 'spawned', tick: number, id: string, index: number, x: number, y: number}
 *   | {type: 'locked', tick: number, id: string, index: number, cells: number[][], hardDrop: boolean, dropDistance: number, softDropRows: number}
 *   | {type: 'clearStarted', tick: number, rows: number[], count: number}
 *   | {type: 'linesCleared', tick: number, rows: number[], count: number, total: number}
 *   | {type: 'gameOver', tick: number, reason: 'blockOut' | 'lockOut'}} GameEvent
 * Events carry the tick they happened on. dropDistance is the rows a hard
 * drop travelled (0 otherwise); softDropRows is the rows the piece fell
 * while soft drop was held. Both are for scoring. clearStarted marks the
 * start of the line clear delay (the flash); linesCleared follows when the
 * rows are actually removed, at the end of the delay.
 */

/**
 * @typedef {object} Game
 * @property {() => void} step Advance exactly one tick (TICK_MS).
 * @property {() => boolean} moveLeft
 * @property {() => boolean} moveRight
 * @property {() => boolean} rotateCW
 * @property {() => boolean} rotateCCW
 * @property {() => boolean} hardDrop
 * @property {(held: boolean) => void} setSoftDrop
 * @property {(weights: import('./randomizer.js').WeightTable, options?: import('./randomizer.js').SetWeightsOptions) => void} setWeights
 *   Takes effect when the current bag runs out; with { resetBag: true }, from
 *   the next piece dealt into the preview. Pieces already in the preview
 *   queue are never replaced: they are what the player was shown, so they
 *   are still dealt first and the new mix starts after them.
 * @property {(ms: number) => void} setGravityMsPerRow
 * @property {() => GameState} getState
 * @property {() => GameEvent[]} drainEvents Return and clear queued events.
 */

/**
 * Horizontal spawn column. Rule: x = floor((COLS - width) / 2). Even widths
 * centre exactly; odd widths sit half a cell left of centre.
 * @param {number} width
 * @returns {number}
 */
export function spawnColumn(width) {
  return Math.floor((COLS - width) / 2);
}

/**
 * Spawn row: the piece's lowest cells land in the last hidden row, so it
 * falls into view on the first gravity step.
 * @param {number} height
 * @returns {number}
 */
export function spawnRow(height) {
  return HIDDEN_ROWS - height;
}

/**
 * Create a new game. The first piece is spawned immediately.
 * @param {Partial<import('./config.js').GameConfig>} [options]
 * @returns {Game}
 */
export function createGame(options = {}) {
  const config = resolveConfig(options);
  const rng = createRng(config.seed);
  const bag = createBag(rng, config.weights);
  const board = config.initialBoard ? config.initialBoard.slice() : createBoard();
  const lockDelayUnits = config.lockDelayMs * TIME_UNITS_PER_MS;
  const lineClearUnits = config.lineClearDelayMs * TIME_UNITS_PER_MS;
  const spawnDelayUnits = config.spawnDelayMs * TIME_UNITS_PER_MS;

  /** @type {number[]} */
  const preview = [];
  /** @type {GameEvent[]} */
  let events = [];

  /** @type {{pieceIndex: number, rotation: number, x: number, y: number} | null} */
  let active = null;
  /** @type {Phase} */
  let phase = 'falling';
  let tick = 0;
  let gravityMsPerRow = config.gravityMsPerRow;
  let softDrop = false;
  let gravityUnits = 0;
  let lockUnits = 0;
  let lockResets = 0;
  let lowestY = 0;
  let softDropRows = 0;
  /** Time spent in the current clearing or spawnDelay phase. */
  let delayUnits = 0;
  /** @type {number[]} */
  let clearingRows = [];
  let linesCleared = 0;
  /** @type {'blockOut' | 'lockOut' | null} */
  let gameOverReason = null;

  // --- helpers -----------------------------------------------------------

  const cellsOf = (p) => getRotationCells(p.pieceIndex, p.rotation);
  const fits = (p, dx, dy) => !collides(board, cellsOf(p), p.x + dx, p.y + dy);
  const isResting = () => active !== null && !fits(active, 0, 1);

  function landingY() {
    let y = active.y;
    while (!collides(board, cellsOf(active), active.x, y + 1)) {
      y++;
    }
    return y;
  }

  function fillPreview() {
    while (preview.length < config.previewCount) {
      preview.push(bag.next());
    }
  }

  function endGame(reason) {
    active = null;
    phase = 'gameOver';
    gameOverReason = reason;
    events.push({ type: 'gameOver', tick, reason });
  }

  function spawnNext() {
    const pieceIndex = config.previewCount > 0 ? preview.shift() : bag.next();
    fillPreview();
    const piece = PIECES[pieceIndex];
    const candidate = {
      pieceIndex,
      rotation: 0,
      x: spawnColumn(piece.width),
      y: spawnRow(piece.height),
    };
    if (collides(board, cellsOf(candidate), candidate.x, candidate.y)) {
      endGame('blockOut');
      return;
    }
    active = candidate;
    phase = 'falling';
    gravityUnits = 0;
    lockUnits = 0;
    lockResets = 0;
    lowestY = candidate.y;
    softDropRows = 0;
    events.push({ type: 'spawned', tick, id: piece.id, index: pieceIndex, x: active.x, y: active.y });
  }

  function absoluteCells(p) {
    return cellsOf(p).map(([x, y]) => [p.x + x, p.y + y]);
  }

  /** Enter the spawn delay, or spawn now if it is 0. */
  function beginSpawnDelay() {
    if (spawnDelayUnits === 0) {
      spawnNext();
      return;
    }
    phase = 'spawnDelay';
    delayUnits = 0;
  }

  /** Remove the rows that were flashing, then move on to spawning. */
  function finishClear() {
    const rows = clearingRows;
    clearingRows = [];
    clearRows(board, rows);
    linesCleared += rows.length;
    events.push({ type: 'linesCleared', tick, rows, count: rows.length, total: linesCleared });
    beginSpawnDelay();
  }

  /** After a lock: flash full rows (if any), then the spawn delay. */
  function afterLock() {
    const rows = findFullRows(board);
    if (rows.length === 0) {
      beginSpawnDelay();
      return;
    }
    clearingRows = rows;
    events.push({ type: 'clearStarted', tick, rows: rows.slice(), count: rows.length });
    if (lineClearUnits === 0) {
      finishClear();
      return;
    }
    phase = 'clearing';
    delayUnits = 0;
  }

  function lockActive(hardDropDistance = -1) {
    const piece = PIECES[active.pieceIndex];
    const cells = absoluteCells(active);
    placeCells(board, cellsOf(active), active.x, active.y, piece.index + 1);
    events.push({
      type: 'locked',
      tick,
      id: piece.id,
      index: piece.index,
      cells,
      hardDrop: hardDropDistance >= 0,
      dropDistance: Math.max(hardDropDistance, 0),
      softDropRows,
    });
    active = null;
    if (cells.every(([, y]) => y < HIDDEN_ROWS)) {
      endGame('lockOut');
      return;
    }
    afterLock();
  }

  /** Record downward progress; a new lowest row refreshes lock delay. */
  function noteDescent() {
    if (active.y > lowestY) {
      lowestY = active.y;
      lockUnits = 0;
      lockResets = 0;
    }
  }

  /** Apply a player action's effect on the lock timer (see header). */
  function afterPlayerAction(wasResting) {
    if (wasResting && lockResets < config.maxLockResets) {
      lockUnits = 0;
      lockResets++;
    }
  }

  function applyGravity() {
    if (isResting()) {
      gravityUnits = 0;
      return;
    }
    const unitsPerRow = gravityMsPerRow * TIME_UNITS_PER_MS;
    gravityUnits += TIME_UNITS_PER_TICK * (softDrop ? config.softDropFactor : 1);
    // Fast gravity or soft drop can cover more than one row per tick.
    while (gravityUnits >= unitsPerRow) {
      if (isResting()) {
        gravityUnits = 0;
        return;
      }
      active.y++;
      gravityUnits -= unitsPerRow;
      if (softDrop) softDropRows++;
      noteDescent();
    }
  }

  // --- commands ----------------------------------------------------------

  function shift(dx) {
    if (!active || !fits(active, dx, 0)) {
      return false;
    }
    const wasResting = isResting();
    active.x += dx;
    afterPlayerAction(wasResting);
    return true;
  }

  function rotate(direction) {
    if (!active) {
      return false;
    }
    const wasResting = isResting();
    const next = tryRotate(board, active, direction);
    if (!next) {
      return false;
    }
    active = next;
    afterPlayerAction(wasResting);
    return true;
  }

  function hardDrop() {
    if (!active) {
      return false;
    }
    const target = landingY();
    const distance = target - active.y;
    active.y = target;
    lockActive(distance);
    return true;
  }

  function step() {
    if (phase === 'gameOver') {
      return;
    }
    tick++;
    if (phase === 'clearing') {
      delayUnits += TIME_UNITS_PER_TICK;
      if (delayUnits >= lineClearUnits) finishClear();
      return;
    }
    if (phase === 'spawnDelay') {
      delayUnits += TIME_UNITS_PER_TICK;
      if (delayUnits >= spawnDelayUnits) spawnNext();
      return;
    }
    applyGravity();
    if (isResting()) {
      lockUnits += TIME_UNITS_PER_TICK;
      if (lockUnits >= lockDelayUnits) {
        lockActive();
      }
    }
  }

  // --- read access ---------------------------------------------------------

  function snapshotPiece(p) {
    const piece = PIECES[p.pieceIndex];
    return Object.freeze({
      id: piece.id,
      index: piece.index,
      rotation: p.rotation,
      x: p.x,
      y: p.y,
      cells: Object.freeze(absoluteCells(p).map((cell) => Object.freeze(cell))),
    });
  }

  function getState() {
    return Object.freeze({
      tick,
      board: board.slice(),
      active: active ? snapshotPiece(active) : null,
      landing: active ? snapshotPiece({ ...active, y: landingY() }) : null,
      preview: Object.freeze(preview.map((index) =>
        Object.freeze({ id: PIECES[index].id, index }))),
      phase,
      clearingRows: Object.freeze(clearingRows.slice()),
      clearProgress: phase === 'clearing' ? Math.min(1, delayUnits / lineClearUnits) : 0,
      linesCleared,
      resting: isResting(),
      softDrop,
      playing: gameOverReason === null,
      gameOver: gameOverReason !== null,
      gameOverReason,
    });
  }

  function drainEvents() {
    const drained = events;
    events = [];
    return drained;
  }

  fillPreview();
  spawnNext();

  return {
    step,
    moveLeft: () => shift(-1),
    moveRight: () => shift(1),
    rotateCW: () => rotate(1),
    rotateCCW: () => rotate(-1),
    hardDrop,
    setSoftDrop: (held) => {
      softDrop = Boolean(held);
    },
    setWeights: (weights, options) => bag.setWeights(weights, options),
    setGravityMsPerRow: (ms) => {
      resolveConfig({ gravityMsPerRow: ms });
      gravityMsPerRow = ms;
    },
    getState,
    drainEvents,
  };
}
