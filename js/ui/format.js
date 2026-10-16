/**
 * js/ui/format.js - The one number formatter: hex, binary, or decimal.
 *
 * Every number the game shows (HUD, game over, bank transition, start
 * screen) goes through formatNumber, in the current display mode, so the
 * whole game speaks one number format.
 *
 * Each field is a fixed-width register, zero-padded, so nothing jumps as
 * the numbers change. A value too large for its register widens the field
 * instead of being truncated or wrapped (binary widens a whole nibble at a
 * time so the 4-digit grouping stays intact).
 */

/** Display modes, in tap-to-cycle order. Hex is the default. */
export const NUMBER_MODES = Object.freeze(['hex', 'bin', 'dec']);

/** The mode used when nothing valid is saved. */
export const DEFAULT_NUMBER_MODE = 'hex';

/**
 * @typedef {'hex' | 'bin' | 'dec'} NumberMode
 */

/**
 * @typedef {object} RegisterFormat
 * @property {string} label Register-style HUD label (3 characters or fewer).
 * @property {number} bits Register size.
 * @property {number} hex Hex digits (bits / 4).
 * @property {number} bin Binary digits (bits).
 * @property {number} dec Decimal digits (enough for 2^bits - 1).
 */

/**
 * THE width table: every field's register size and digit counts per mode.
 * @type {Readonly<Record<'score' | 'highScore' | 'bank' | 'lines' | 'chips' | 'words' | 'cashIn', Readonly<RegisterFormat>>>}
 */
export const REGISTERS = Object.freeze({
  score: Object.freeze({ label: 'SCR', bits: 24, hex: 6, bin: 24, dec: 8 }),
  highScore: Object.freeze({ label: 'HI', bits: 24, hex: 6, bin: 24, dec: 8 }),
  bank: Object.freeze({ label: 'BNK', bits: 8, hex: 2, bin: 8, dec: 3 }),
  lines: Object.freeze({ label: 'LNS', bits: 16, hex: 4, bin: 16, dec: 5 }),
  // Microchips held in the current memory bank.
  chips: Object.freeze({ label: 'CHP', bits: 8, hex: 2, bin: 8, dec: 3 }),
  // The well's capacity on the start screen (12 x 22 = 264 cells).
  words: Object.freeze({ label: 'WRD', bits: 16, hex: 4, bin: 16, dec: 5 }),
  // A chip cash-in, on the transition's tally line (not in the HUD). 16 bits
  // hold any cash-in up to bank 25 even with 10 chips; beyond, it widens.
  cashIn: Object.freeze({ label: 'PTS', bits: 16, hex: 4, bin: 16, dec: 5 }),
});

/** Prefix per mode. Decimal has none. */
const PREFIX = Object.freeze({ hex: '0x', bin: '0b', dec: '' });

/**
 * The mode after this one: hex -> bin -> dec -> hex.
 * @param {NumberMode} mode
 * @returns {NumberMode}
 */
export function nextMode(mode) {
  const i = NUMBER_MODES.indexOf(mode);
  return NUMBER_MODES[(i + 1) % NUMBER_MODES.length];
}

/**
 * Binary digits in 4-bit nibbles separated by spaces, grouped from the
 * right. The digit count must already be a multiple of 4.
 * @param {string} digits
 * @returns {string}
 */
function nibbles(digits) {
  return digits.match(/.{4}/g).join(' ');
}

/**
 * Format a value as a fixed-width register.
 * @param {number} value Non-negative integer.
 * @param {keyof typeof REGISTERS} field
 * @param {NumberMode} mode
 * @returns {string} e.g. "0x001A40", "0b0000 0010", "00019"
 * @throws {RangeError} On an unknown field or mode, or a value that is not a
 *   non-negative safe integer.
 */
export function formatNumber(value, field, mode) {
  const register = REGISTERS[field];
  if (!register) throw new RangeError(`Unknown register field: ${field}`);
  if (!NUMBER_MODES.includes(mode)) throw new RangeError(`Unknown number mode: ${mode}`);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Register values must be non-negative integers, got ${value}.`);
  }
  if (mode === 'hex') {
    return PREFIX.hex + value.toString(16).toUpperCase().padStart(register.hex, '0');
  }
  if (mode === 'bin') {
    const raw = value.toString(2);
    const width = Math.max(register.bin, Math.ceil(raw.length / 4) * 4);
    return PREFIX.bin + nibbles(raw.padStart(width, '0'));
  }
  return String(value).padStart(register.dec, '0');
}
