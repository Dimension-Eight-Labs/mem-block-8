/**
 * js/render/logo.js - The DIM8 Labs mark, drawn in code.
 *
 * A seven-segment VFD-style "8." with a letter-spaced "DIM8 LABS" wordmark
 * underneath. Proportions follow the DIM8 maker's mark used in DIM8
 * Solitaire (an upright digit with pointed, hexagonal segments, a round
 * decimal point at the lower right, and a wordmark as wide as the whole
 * mark). That app embeds the mark as an image; here it is rebuilt from
 * strokes so it scales crisply and can take any colour.
 *
 * Geometry is defined in a 411 x 495 reference box (the original mark's
 * pixel size) and scaled to the requested width.
 */

/** Reference box the coordinates below are measured in. */
export const LOGO_REF_WIDTH = 411;
export const LOGO_REF_HEIGHT = 495;

const THICKNESS = 30; // segment thickness
const LEFT_X = 87; // centre line of the left vertical segments
const RIGHT_X = 320; // centre line of the right vertical segments
const TOP_Y = 30; // centre lines of the three horizontal segments
const MID_Y = 207;
const BOTTOM_Y = 382;
const GAP = 11; // space between a segment's point and its neighbour

/**
 * A segment as a hexagon with pointed ends, from (x1, y1) to (x2, y2)
 * along one axis.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number[][]} Polygon points.
 */
function segment(x1, y1, x2, y2) {
  const h = THICKNESS / 2;
  if (y1 === y2) {
    return [[x1, y1], [x1 + h, y1 - h], [x2 - h, y1 - h], [x2, y1], [x2 - h, y1 + h], [x1 + h, y1 + h]];
  }
  return [[x1, y1], [x1 + h, y1 + h], [x1 + h, y2 - h], [x1, y2], [x1 - h, y2 - h], [x1 - h, y1 + h]];
}

/**
 * @typedef {object} LogoShapes
 * @property {number[][][]} segments Seven polygons (reference units).
 * @property {{cx: number, cy: number, r: number}} dot Decimal point.
 * @property {{text: string, left: number, right: number, baseline: number, capHeight: number}} word
 */

/**
 * The mark's shapes in reference units.
 * @returns {LogoShapes}
 */
export function logoShapes() {
  const hx1 = LEFT_X + GAP;
  const hx2 = RIGHT_X - GAP;
  return {
    segments: [
      segment(hx1, TOP_Y, hx2, TOP_Y), // a: top
      segment(RIGHT_X, TOP_Y + GAP, RIGHT_X, MID_Y - GAP), // b: upper right
      segment(RIGHT_X, MID_Y + GAP, RIGHT_X, BOTTOM_Y - GAP), // c: lower right
      segment(hx1, BOTTOM_Y, hx2, BOTTOM_Y), // d: bottom
      segment(LEFT_X, MID_Y + GAP, LEFT_X, BOTTOM_Y - GAP), // e: lower left
      segment(LEFT_X, TOP_Y + GAP, LEFT_X, MID_Y - GAP), // f: upper left
      segment(hx1, MID_Y, hx2, MID_Y), // g: middle
    ],
    dot: { cx: 374, cy: BOTTOM_Y, r: 17 },
    word: { text: 'DIM8 LABS', left: 5, right: 406, baseline: 486, capHeight: 26 },
  };
}

const SHAPES = logoShapes();

/**
 * Draw the mark.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x Left edge, device pixels.
 * @param {number} y Top edge, device pixels.
 * @param {number} width Mark width, device pixels (height is width * 495/411).
 * @param {string} color Fill colour.
 * @param {string} fontFamily CSS font family list for the wordmark.
 */
export function drawLogo(ctx, x, y, width, color, fontFamily) {
  const s = width / LOGO_REF_WIDTH;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;

  for (const polygon of SHAPES.segments) {
    ctx.beginPath();
    polygon.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.fill();
  }
  const { cx, cy, r } = SHAPES.dot;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Letters are placed one by one at even spacing: canvas letterSpacing is
  // not available in every Safari version this app targets.
  const { text, left, right, baseline, capHeight } = SHAPES.word;
  ctx.font = `${Math.round(capHeight / 0.72)}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const step = (right - left) / text.length;
  [...text].forEach((ch, i) => ctx.fillText(ch, left + step * (i + 0.5), baseline));
  ctx.restore();
}
