/**
 * js/render/chip.js - A small microchip icon, drawn in code.
 *
 * A DIP-style IC seen from above: a dark rectangular body with a notch at
 * one short end (marking pin 1, as on real chips) and a row of pins along
 * each long side, in the green accent so it reads on any playfield tint.
 * Used by the "+3 CHIPS" flash (js/ui/chip-flash.js).
 *
 * Geometry is in a 24 x 16 reference box, scaled to the requested width.
 */

/** Reference box. */
export const CHIP_REF_WIDTH = 24;
export const CHIP_REF_HEIGHT = 16;

/** Pins per long side. */
const PINS = 4;

/**
 * @typedef {object} ChipShapes
 * @property {{x: number, y: number, w: number, h: number}} body
 * @property {{cx: number, cy: number, r: number}} notch On the left end.
 * @property {{x: number, y: number, w: number, h: number}[]} pins Top row, then bottom row.
 */

/**
 * The icon's shapes in reference units.
 * @returns {ChipShapes}
 */
export function chipShapes() {
  const body = { x: 2, y: 3.5, w: 20, h: 9 };
  const pinW = 2;
  const pitch = body.w / PINS;
  const pins = [];
  for (const y of [0.5, body.y + body.h]) {
    for (let i = 0; i < PINS; i++) {
      pins.push({ x: body.x + pitch * (i + 0.5) - pinW / 2, y, w: pinW, h: 3 });
    }
  }
  return { body, notch: { cx: body.x, cy: body.y + body.h / 2, r: 1.8 }, pins };
}

const SHAPES = chipShapes();

/**
 * Draw the icon.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x Left edge, device pixels.
 * @param {number} y Top edge, device pixels.
 * @param {number} width Device pixels (height is width x 16/24).
 * @param {{pin: string, body: string}} colors Pins and outline; body fill.
 */
export function drawChipIcon(ctx, x, y, width, colors) {
  const s = width / CHIP_REF_WIDTH;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = colors.pin;
  for (const p of SHAPES.pins) ctx.fillRect(p.x, p.y, p.w, p.h);
  const { body, notch } = SHAPES;
  ctx.fillStyle = colors.body;
  ctx.fillRect(body.x, body.y, body.w, body.h);
  ctx.strokeStyle = colors.pin;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(body.x, body.y, body.w, body.h);
  // The notch: a half circle cut into the left end.
  ctx.beginPath();
  ctx.arc(notch.cx, notch.cy, notch.r, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
