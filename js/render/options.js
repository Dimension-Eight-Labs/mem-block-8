/**
 * js/render/options.js - Renderer settings with their defaults.
 *
 * Visual tuning values live here (input tuning lives in
 * js/input/bindings.js). Some can be overridden from the URL for side by
 * side comparison on a phone; see js/url-options.js.
 */

/**
 * The bundled IBM Plex Mono, then the system monospace stack as a fallback;
 * matches --font-mono in css/main.css. See fonts.js for why canvas text
 * waits for the bundled face.
 */
export const MONO_FONT = '"IBM Plex Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, '
  + '"Liberation Mono", "DejaVu Sans Mono", monospace';

/**
 * @typedef {object} LogoPlacementStyle
 * @property {number} widthFraction Mark width as a fraction of playfield width.
 * @property {number} lighten How far the mark is blended from the background
 *   towards white (0..1). Small values keep it very faint.
 * @property {number} [bottomFraction] Gap below the mark, as a fraction of
 *   playfield height ('bottom' placement only).
 */

/**
 * @typedef {object} RenderOptions
 * @property {'bottom' | 'center'} logoPlacement Where the DIM8 mark sits.
 * @property {Readonly<Record<'bottom' | 'center', LogoPlacementStyle>>} logo
 * @property {number} previewScale Next-piece cell size as a fraction of a cell.
 * @property {number} previewAlpha Next-piece opacity (0..1).
 * @property {number} previewMarginCells Gap from the top-right corner, in cells.
 * @property {boolean} showLandingIndicator Draw where a hard drop would land.
 * @property {number} clearFlashAlpha Peak opacity of the white flash on rows
 *   being cleared (0..1), reached halfway through the line clear delay.
 * @property {string} fontFamily Font for the wordmark.
 */

/** @type {Readonly<RenderOptions>} */
export const RENDER_DEFAULTS = Object.freeze({
  logoPlacement: 'bottom',
  logo: Object.freeze({
    bottom: Object.freeze({ widthFraction: 0.36, lighten: 0.07, bottomFraction: 0.06 }),
    // Larger and right in the line of play, so it is even fainter.
    center: Object.freeze({ widthFraction: 0.6, lighten: 0.045 }),
  }),
  previewScale: 0.6,
  previewAlpha: 0.35,
  previewMarginCells: 0.5,
  // Intentionally off by design for now: the game is meant to be played
  // without a landing indicator. The code path exists so it can be tried.
  showLandingIndicator: false,
  clearFlashAlpha: 0.85,
  fontFamily: MONO_FONT,
});
