/**
 * js/render/color.js - Small colour helpers for #rrggbb strings.
 *
 * Used to derive block highlight/shade edges and the faint logo colour
 * from a theme, so themes only need to list base colours.
 */

/**
 * Parse #rrggbb (or #rgb) into channels.
 * @param {string} hex
 * @returns {[number, number, number]} 0..255 each.
 * @throws {TypeError} If the string is not a hex colour.
 */
export function hexToRgb(hex) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    throw new TypeError(`Not a hex colour: ${hex}`);
  }
  const digits = match[1].length === 3
    ? [...match[1]].map((d) => d + d).join('')
    : match[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
}

/**
 * Format channels as #rrggbb, rounding and clamping each.
 * @param {readonly number[]} rgb
 * @returns {string}
 */
export function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c)))
    .toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Linear blend of two colours.
 * @param {string} from
 * @param {string} to
 * @param {number} t 0 = from, 1 = to.
 * @returns {string}
 */
export function mix(from, to, t) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex(a.map((c, i) => c + (b[i] - c) * t));
}

/**
 * Blend towards white.
 * @param {string} hex
 * @param {number} amount 0..1
 * @returns {string}
 */
export function lighten(hex, amount) {
  return mix(hex, '#ffffff', amount);
}

/**
 * Blend towards black.
 * @param {string} hex
 * @param {number} amount 0..1
 * @returns {string}
 */
export function darken(hex, amount) {
  return mix(hex, '#000000', amount);
}

/**
 * @typedef {object} BlockShades
 * @property {string} base Face colour.
 * @property {string} light Top and left edge.
 * @property {string} dark Bottom and right edge.
 */

/**
 * The three tones used to draw one block.
 * @param {string} hex Base colour.
 * @returns {BlockShades}
 */
export function blockShades(hex) {
  return { base: hex, light: lighten(hex, 0.45), dark: darken(hex, 0.35) };
}
