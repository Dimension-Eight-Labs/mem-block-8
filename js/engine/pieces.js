/**
 * js/engine/pieces.js - The 27 piece definitions.
 *
 * The set is every one-sided polyomino of 3, 4, and 5 cells:
 *   - 2 trominoes,
 *   - 7 one-sided tetrominoes,
 *   - 18 one-sided pentominoes (the 12 free pentominoes plus the mirror
 *     images of the six chiral ones: F, L, N, P, Y, Z).
 *
 * Ids use mathematical polyomino letters plus the cell count. A trailing
 * "m" marks the mirror image of a chiral shape (for example P5 and P5m).
 * Tetrominoes follow the same rule (L4/L4m, S4/S4m) instead of using
 * separate letters for mirrored forms, so naming is uniform across sizes.
 *
 * Cells are [x, y] pairs with y growing downward, normalised so the
 * smallest x and y are 0. Base orientations put a flat side down where
 * the shape has one, which reads well when a piece spawns.
 *
 * INDEX IS STABLE: a piece's index is stored in board cells (index + 1),
 * and will be stored in saved settings and themes. Never reorder this list;
 * append new pieces at the end if the set ever grows.
 */

/**
 * @typedef {readonly [number, number]} Cell
 * An [x, y] pair.
 */

/**
 * @typedef {object} PieceDef
 * @property {string} id Stable string id, e.g. "T4" or "P5m".
 * @property {number} index Stable index 0..26; board cells store index + 1.
 * @property {number} size Number of cells: 3, 4, or 5.
 * @property {number} width Width of the base orientation's bounding box.
 * @property {number} height Height of the base orientation's bounding box.
 * @property {readonly Cell[]} cells Cells of the base orientation.
 */

/** @type {Array<[string, number[][]]>} */
const DEFINITIONS = [
  // Trominoes
  ['I3', [[0, 0], [1, 0], [2, 0]]],
  ['L3', [[0, 0], [0, 1], [1, 1]]],

  // Tetrominoes
  ['I4', [[0, 0], [1, 0], [2, 0], [3, 0]]],
  ['O4', [[0, 0], [1, 0], [0, 1], [1, 1]]],
  ['T4', [[1, 0], [0, 1], [1, 1], [2, 1]]],
  ['L4', [[2, 0], [0, 1], [1, 1], [2, 1]]],
  ['L4m', [[0, 0], [0, 1], [1, 1], [2, 1]]],
  ['S4', [[1, 0], [2, 0], [0, 1], [1, 1]]],
  ['S4m', [[0, 0], [1, 0], [1, 1], [2, 1]]],

  // Pentominoes
  ['F5', [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]],
  ['F5m', [[0, 0], [1, 0], [1, 1], [2, 1], [1, 2]]],
  ['I5', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]],
  ['L5', [[3, 0], [0, 1], [1, 1], [2, 1], [3, 1]]],
  ['L5m', [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1]]],
  ['N5', [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]]],
  ['N5m', [[2, 0], [3, 0], [0, 1], [1, 1], [2, 1]]],
  ['P5', [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]],
  ['P5m', [[0, 0], [1, 0], [0, 1], [1, 1], [1, 2]]],
  ['T5', [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]]],
  ['U5', [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]]],
  ['V5', [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]],
  ['W5', [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]]],
  ['X5', [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]],
  ['Y5', [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1]]],
  ['Y5m', [[2, 0], [0, 1], [1, 1], [2, 1], [3, 1]]],
  ['Z5', [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]]],
  ['Z5m', [[1, 0], [2, 0], [1, 1], [0, 2], [1, 2]]],
];

/**
 * Build one frozen piece definition.
 * @param {[string, number[][]]} definition
 * @param {number} index
 * @returns {PieceDef}
 */
function buildPiece([id, cells], index) {
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return Object.freeze({
    id,
    index,
    size: cells.length,
    width: Math.max(...xs) + 1,
    height: Math.max(...ys) + 1,
    cells: Object.freeze(cells.map((cell) => Object.freeze([cell[0], cell[1]]))),
  });
}

/** All pieces, ordered by stable index. @type {readonly PieceDef[]} */
export const PIECES = Object.freeze(DEFINITIONS.map(buildPiece));

/** Number of pieces in the set. */
export const PIECE_COUNT = PIECES.length;

const BY_ID = new Map(PIECES.map((piece) => [piece.id, piece]));

/**
 * Look up a piece by its string id.
 * @param {string} id
 * @returns {PieceDef}
 * @throws {RangeError} If the id is unknown.
 */
export function getPieceById(id) {
  const piece = BY_ID.get(id);
  if (!piece) {
    throw new RangeError(`Unknown piece id: ${id}`);
  }
  return piece;
}

/**
 * Group pieces by cell count. The level system uses this to build weight
 * tables that introduce larger pieces gradually.
 * @returns {Map<number, PieceDef[]>} Size (3, 4, 5) to pieces in index order.
 */
export function groupPiecesBySize() {
  const groups = new Map();
  for (const piece of PIECES) {
    if (!groups.has(piece.size)) {
      groups.set(piece.size, []);
    }
    groups.get(piece.size).push(piece);
  }
  return groups;
}
