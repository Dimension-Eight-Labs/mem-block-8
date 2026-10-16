/**
 * js/engine/rng.js - Seeded pseudo-random number generator.
 *
 * Algorithm: mulberry32, a 32-bit generator by Tommy Ettinger, released
 * into the public domain (CC0). Written here from the published algorithm.
 *
 * Why mulberry32: it is a few lines long, fast, has a full 2^32 period and
 * good enough statistical quality for shuffling pieces, and it uses only
 * 32-bit integer operations (Math.imul, shifts, xor). Those are exactly
 * specified by JavaScript, so the same seed gives the same sequence in
 * every browser and in Node. Math.random cannot be seeded, so it is never
 * used in the engine.
 */

/**
 * @typedef {object} Rng
 * @property {() => number} nextUint32 Next integer in [0, 2^32).
 * @property {() => number} nextFloat Next number in [0, 1).
 * @property {(n: number) => number} nextInt Next integer in [0, n).
 */

/**
 * Create a seeded generator.
 * @param {number} seed Any number; it is reduced to an unsigned 32-bit integer.
 * @returns {Rng}
 */
export function createRng(seed) {
  let state = seed >>> 0;

  function nextUint32() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  // Dividing a 32-bit integer by 2^32 is exact in a double, so this is
  // just as portable as nextUint32.
  function nextFloat() {
    return nextUint32() / 4294967296;
  }

  function nextInt(n) {
    return Math.floor(nextFloat() * n);
  }

  return { nextUint32, nextFloat, nextInt };
}
