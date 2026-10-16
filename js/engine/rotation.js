/**
 * js/engine/rotation.js - Precomputed rotation states and wall kicks.
 *
 * Mem Block 8 uses its own simple rotation system: every piece rotates
 * about the centre of its base bounding box, and a single short kick list
 * is tried when a rotation is blocked.
 *
 * ROTATION CENTRE RULE
 * --------------------
 * For a base bounding box of width w and height h, the centre is
 * ((w - 1) / 2, (h - 1) / 2). A 90 degree clockwise turn (y grows downward)
 * maps a cell (x, y) to:
 *
 *   x' = (w + h - 2) / 2 - y
 *   y' = (h - w) / 2 + x
 *
 * When w and h have the same parity these are whole numbers and the turn is
 * exact. When they differ (for example a 3x2 or 4x1 box) the centre sits
 * between cells and both values end in .5. The rule is: ROUND BOTH DOWN
 * (Math.floor), i.e. towards the top-left. Rounding up and left keeps a
 * freshly rotated piece away from the floor, where kicks would be needed.
 *
 * Drift is impossible by construction: all four states are computed once,
 * directly from the base cells, in one shared piece-local frame. Rotating
 * only changes the state number (0..3), never the piece's position, so
 * CW x4 or CW then CCW returns to exactly the starting cells. State 2 is
 * an exact 180 degree turn, and state 3 is state 2 turned with the same
 * formula, so shapes with 90 or 180 degree symmetry (O4, X5, I4, S4, ...)
 * occupy identical cells in their matching states and do not wobble.
 */

import { PIECES } from './pieces.js';
import { collides } from './board.js';

/**
 * Wall kicks, tried in order when a rotation collides. The first offset
 * where the rotated piece fits is used; if none fit, the rotation fails.
 * Same list for both directions. Order rationale:
 *   1. (0, 0)   rotate in place.
 *   2. one column left, then right (left first so the choice is predictable).
 *   3. two columns left, then right (long pieces against a wall).
 *   4. one row up (rotating while resting on the floor or a stack).
 * There is deliberately no downward kick: it would let pieces tunnel into
 * gaps the player could not otherwise reach.
 * Offsets are [dx, dy]; dy = -1 means one row up.
 * @type {readonly (readonly [number, number])[]}
 */
export const KICK_OFFSETS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([-1, 0]),
  Object.freeze([1, 0]),
  Object.freeze([-2, 0]),
  Object.freeze([2, 0]),
  Object.freeze([0, -1]),
]);

/** Number of rotation states per piece. */
export const ROTATION_COUNT = 4;

/**
 * Rotate cells 90 degrees clockwise about the centre of a w x h box.
 * Works in doubled coordinates so the half-cell case stays integer until
 * the final floor.
 * @param {readonly (readonly number[])[]} cells
 * @param {number} w
 * @param {number} h
 * @returns {number[][]}
 */
function turnClockwise(cells, w, h) {
  return cells.map(([x, y]) => [
    Math.floor((w + h - 2 - 2 * y) / 2),
    Math.floor((h - w + 2 * x) / 2),
  ]);
}

/**
 * Exact 180 degree turn within a w x h box.
 * @param {readonly (readonly number[])[]} cells
 * @param {number} w
 * @param {number} h
 * @returns {number[][]}
 */
function turnHalf(cells, w, h) {
  return cells.map(([x, y]) => [w - 1 - x, h - 1 - y]);
}

/**
 * @param {number[][]} cells
 * @returns {readonly import('./pieces.js').Cell[]}
 */
function freezeCells(cells) {
  return Object.freeze(cells.map((cell) => Object.freeze(cell)));
}

/**
 * Compute the four rotation states of one piece.
 * @param {import('./pieces.js').PieceDef} piece
 * @returns {readonly (readonly import('./pieces.js').Cell[])[]}
 */
function buildStates(piece) {
  const { cells, width: w, height: h } = piece;
  const half = turnHalf(cells, w, h);
  return Object.freeze([
    freezeCells(cells.map(([x, y]) => [x, y])),
    freezeCells(turnClockwise(cells, w, h)),
    freezeCells(half),
    freezeCells(turnClockwise(half, w, h)),
  ]);
}

/** ROTATIONS[pieceIndex][rotation] = cells in the piece-local frame. */
const ROTATIONS = Object.freeze(PIECES.map(buildStates));

/**
 * Cells of a piece in a rotation state, relative to the piece position.
 * Values may be negative; add the piece's x and y for board coordinates.
 * @param {number} pieceIndex
 * @param {number} rotation 0..3, clockwise from the base orientation.
 * @returns {readonly import('./pieces.js').Cell[]}
 */
export function getRotationCells(pieceIndex, rotation) {
  return ROTATIONS[pieceIndex][rotation];
}

/**
 * Rotation state after turning in a direction.
 * @param {number} rotation Current state 0..3.
 * @param {1 | -1} direction 1 = clockwise, -1 = counterclockwise.
 * @returns {number}
 */
export function nextRotation(rotation, direction) {
  return (rotation + direction + ROTATION_COUNT) % ROTATION_COUNT;
}

/**
 * @typedef {object} Placement
 * @property {number} pieceIndex
 * @property {number} rotation
 * @property {number} x
 * @property {number} y
 */

/**
 * Try to rotate a piece on a board, applying wall kicks.
 * @param {Uint8Array} board
 * @param {Placement} placement Current placement (not modified).
 * @param {1 | -1} direction 1 = clockwise, -1 = counterclockwise.
 * @returns {Placement | null} The new placement, or null if every kick collides.
 */
export function tryRotate(board, placement, direction) {
  const rotation = nextRotation(placement.rotation, direction);
  const cells = getRotationCells(placement.pieceIndex, rotation);
  for (const [dx, dy] of KICK_OFFSETS) {
    const x = placement.x + dx;
    const y = placement.y + dy;
    if (!collides(board, cells, x, y)) {
      return { pieceIndex: placement.pieceIndex, rotation, x, y };
    }
  }
  return null;
}
