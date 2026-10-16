/**
 * js/engine/randomizer.js - Weighted bag of upcoming pieces.
 *
 * A weight table maps piece ids to whole-number counts. A bag holds
 * exactly that many of each piece, shuffled with the seeded generator,
 * and is dealt one piece at a time. When it runs out it is refilled from
 * the current weight table, so a new table (for example on level up)
 * takes effect at the next bag without disturbing the current one.
 *
 * setWeights(table, { resetBag: true }) instead discards the pieces left in
 * the current bag, so the next piece dealt already comes from a fresh bag
 * of the new table. The fresh bag is shuffled with the same seeded
 * generator, so this stays deterministic.
 */

import { PIECES, getPieceById } from './pieces.js';

/**
 * @typedef {Readonly<Record<string, number>>} WeightTable
 * Piece id to count per bag. Missing ids count as 0.
 */

/**
 * Engine default weights, used when a caller passes none (tests, tools).
 * The game itself uses the per-bank tables in js/progression/banks.js. Mostly
 * trominoes and tetrominoes, with a few of the gentler pentominoes.
 * @type {WeightTable}
 */
export const DEFAULT_WEIGHTS = Object.freeze({
  I3: 2,
  L3: 2,
  I4: 2,
  O4: 2,
  T4: 2,
  L4: 2,
  L4m: 2,
  S4: 2,
  S4m: 2,
  P5: 1,
  P5m: 1,
  T5: 1,
  U5: 1,
});

/**
 * Check a weight table. Throws rather than silently skipping bad entries,
 * because a typo in a level table should fail loudly in tests.
 * @param {WeightTable} weights
 * @throws {RangeError|TypeError}
 */
export function validateWeights(weights) {
  if (weights === null || typeof weights !== 'object') {
    throw new TypeError('Weights must be an object of piece id to count.');
  }
  let total = 0;
  for (const [id, count] of Object.entries(weights)) {
    getPieceById(id);
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`Weight for ${id} must be a non-negative integer.`);
    }
    total += count;
  }
  if (total === 0) {
    throw new RangeError('Weights must include at least one piece.');
  }
}

/**
 * Build an unshuffled bag of piece indices. Filled in piece index order,
 * not object key order, so two tables with the same counts always give
 * the same game for the same seed.
 * @param {WeightTable} weights
 * @returns {number[]}
 */
function fillBag(weights) {
  const bag = [];
  for (const piece of PIECES) {
    const count = weights[piece.id] ?? 0;
    for (let i = 0; i < count; i++) {
      bag.push(piece.index);
    }
  }
  return bag;
}

/**
 * Fisher-Yates shuffle in place.
 * @param {number[]} items
 * @param {import('./rng.js').Rng} rng
 */
function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/**
 * @typedef {object} SetWeightsOptions
 * @property {boolean} [resetBag] Discard the rest of the current bag, so the
 *   next piece dealt comes from a freshly built bag of the new table.
 *   Default false: the current bag is finished first.
 */

/**
 * @typedef {object} Bag
 * @property {() => number} next Deal the next piece index.
 * @property {(weights: WeightTable, options?: SetWeightsOptions) => void} setWeights
 *   Use a new table from the next refill, or at once with resetBag.
 * @property {() => number} remaining Pieces left before the next refill.
 */

/**
 * Create a weighted bag.
 * @param {import('./rng.js').Rng} rng
 * @param {WeightTable} weights
 * @returns {Bag}
 */
export function createBag(rng, weights) {
  validateWeights(weights);
  let table = weights;
  /** @type {number[]} */
  let bag = [];

  function next() {
    if (bag.length === 0) {
      bag = fillBag(table);
      shuffle(bag, rng);
    }
    return bag.pop();
  }

  function setWeights(newWeights, { resetBag = false } = {}) {
    validateWeights(newWeights);
    table = newWeights;
    if (resetBag) bag = [];
  }

  return { next, setWeights, remaining: () => bag.length };
}
