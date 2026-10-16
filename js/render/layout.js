/**
 * js/render/layout.js - Canvas sizing in whole device pixels.
 *
 * Cells must be a whole number of device pixels, otherwise grid lines and
 * block edges land between pixels and blur. So the cell size is chosen
 * first (the largest integer that fits the box), and the canvas is sized
 * to exactly 12 x 22 cells; any leftover sliver of the box stays the well
 * background colour.
 */

/**
 * @typedef {object} Layout
 * @property {number} cell Cell size in device pixels (integer >= 1).
 * @property {number} width Canvas backing width in device pixels.
 * @property {number} height Canvas backing height in device pixels.
 * @property {number} cssWidth Canvas display width in CSS pixels.
 * @property {number} cssHeight Canvas display height in CSS pixels.
 * @property {number} dpr Device pixel ratio used.
 */

/**
 * Compute the canvas layout for a box.
 * @param {number} boxWidth Available width in CSS pixels.
 * @param {number} boxHeight Available height in CSS pixels.
 * @param {number} dpr window.devicePixelRatio (1 if unknown).
 * @param {number} cols
 * @param {number} rows
 * @returns {Layout}
 */
export function computeLayout(boxWidth, boxHeight, dpr, cols, rows) {
  const ratio = dpr > 0 ? dpr : 1;
  const cell = Math.max(1, Math.floor(Math.min(
    (boxWidth * ratio) / cols,
    (boxHeight * ratio) / rows,
  )));
  const width = cell * cols;
  const height = cell * rows;
  return { cell, width, height, cssWidth: width / ratio, cssHeight: height / ratio, dpr: ratio };
}
