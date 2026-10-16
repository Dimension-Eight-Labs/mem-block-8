/**
 * js/render/renderer.js - Draws engine snapshots onto the playfield canvas.
 *
 * Layers, back to front: background, DIM8 mark, grid (these three are
 * cached in an offscreen canvas and rebuilt only on resize, theme, or
 * background tint change), locked cells, the line clear flash, the active
 * piece, the next-piece preview, and the optional debug zone lines.
 *
 * Only the 22 visible rows are drawn; a cell in hidden row y lands at
 * screen row y - HIDDEN_ROWS, which is above the canvas and so clipped.
 */

import { COLS, VISIBLE_ROWS, HIDDEN_ROWS, PIECES } from '../engine/index.js';
import { computeLayout } from './layout.js';
import { blockShades, lighten } from './color.js';
import { drawLogo, LOGO_REF_WIDTH, LOGO_REF_HEIGHT } from './logo.js';
import { RENDER_DEFAULTS } from './options.js';

/**
 * Draw one block with a light top-left edge and a dark bottom-right edge,
 * so neighbouring cells of the same colour still read as separate blocks.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x Device pixels.
 * @param {number} y
 * @param {number} size
 * @param {import('./color.js').BlockShades} shades
 */
function drawBlock(ctx, x, y, size, shades) {
  const edge = Math.max(1, Math.round(size * 0.12));
  ctx.fillStyle = shades.dark;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = shades.light;
  ctx.fillRect(x, y, size - edge, edge);
  ctx.fillRect(x, y, edge, size - edge);
  ctx.fillStyle = shades.base;
  ctx.fillRect(x + edge, y + edge, size - 2 * edge, size - 2 * edge);
}

/**
 * @typedef {object} DebugZones
 * @property {number} sideFraction
 * @property {number} bottomFraction
 */

/**
 * @typedef {object} Renderer
 * @property {(boxWidth: number, boxHeight: number, dpr: number) => void} resize
 * @property {(state: import('../engine/game.js').GameState | null) => void} draw
 *   Draw a snapshot; null draws the empty well.
 * @property {() => void} redraw Draw the last snapshot again.
 * @property {() => void} rebuild Rebuild the cached backdrop (background, mark,
 *   wordmark, grid) and redraw; call when a font used for canvas text loads.
 * @property {(theme: import('../themes/default.js').Theme) => void} setTheme
 * @property {(hex: string | null) => void} setBackground Override the playfield
 *   background (per-bank tint); null returns to the theme's background. The
 *   DIM8 mark follows, since it is drawn as a lighter shade of the background.
 * @property {(zones: DebugZones | null) => void} setDebugZones
 */

/**
 * Create a renderer for a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{theme: import('../themes/default.js').Theme, options?: Partial<import('./options.js').RenderOptions>}} setup
 *   The theme is passed in (not imported) so Stage 6 can swap themes.
 * @returns {Renderer}
 */
export function createRenderer(canvas, { theme, options = {} }) {
  const opts = { ...RENDER_DEFAULTS, ...options };
  const ctx = canvas.getContext('2d');
  const backdrop = document.createElement('canvas');
  const backdropCtx = backdrop.getContext('2d');

  /** @type {import('./layout.js').Layout | null} */
  let layout = null;
  let currentTheme = theme;
  /** @type {string | null} */
  let backgroundOverride = null;
  /** @type {import('./color.js').BlockShades[]} */
  let shades = [];
  /** @type {import('../engine/game.js').GameState | null} */
  let lastState = null;
  /** @type {DebugZones | null} */
  let debugZones = null;

  function buildBackdrop() {
    const { width, height, cell, dpr } = layout;
    backdrop.width = width;
    backdrop.height = height;
    const c = backdropCtx;
    const background = backgroundOverride ?? currentTheme.background;
    c.fillStyle = background;
    c.fillRect(0, 0, width, height);

    const style = opts.logo[opts.logoPlacement] ?? opts.logo.bottom;
    const logoWidth = Math.round(width * style.widthFraction);
    const logoHeight = logoWidth * (LOGO_REF_HEIGHT / LOGO_REF_WIDTH);
    const logoX = Math.round((width - logoWidth) / 2);
    const logoY = opts.logoPlacement === 'center'
      ? Math.round((height - logoHeight) / 2)
      : Math.round(height - logoHeight - height * style.bottomFraction);
    drawLogo(c, logoX, logoY, logoWidth, lighten(background, style.lighten), opts.fontFamily);

    // Grid lines one CSS pixel wide, on whole device pixels so they stay crisp.
    const line = Math.max(1, Math.round(dpr));
    c.fillStyle = currentTheme.grid;
    for (let x = 1; x < COLS; x++) c.fillRect(x * cell, 0, line, height);
    for (let y = 1; y < VISIBLE_ROWS; y++) c.fillRect(0, y * cell, width, line);
  }

  function drawCells(cells, pieceIndex) {
    const { cell } = layout;
    for (const [x, y] of cells) {
      drawBlock(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, shades[pieceIndex]);
    }
  }

  function drawBoard(board) {
    const { cell } = layout;
    for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + VISIBLE_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const value = board[y * COLS + x];
        if (value !== 0) {
          drawBlock(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, shades[value - 1]);
        }
      }
    }
  }

  /**
   * Flash rows waiting to be cleared: a white wash that rises to its
   * peak halfway through the line clear delay and fades back out, so the
   * rows go bright to white and back before they disappear.
   * @param {readonly number[]} rows
   * @param {number} progress 0..1
   */
  function drawClearFlash(rows, progress) {
    const { cell, width } = layout;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = opts.clearFlashAlpha * Math.sin(Math.PI * progress);
    for (const y of rows) {
      if (y >= HIDDEN_ROWS) ctx.fillRect(0, (y - HIDDEN_ROWS) * cell, width, cell);
    }
    ctx.globalAlpha = 1;
  }

  function drawLanding(landing) {
    const { cell } = layout;
    const line = Math.max(1, Math.round(layout.dpr));
    ctx.strokeStyle = shades[landing.index].base;
    ctx.lineWidth = line;
    ctx.globalAlpha = 0.5;
    for (const [x, y] of landing.cells) {
      ctx.strokeRect(x * cell + line / 2, (y - HIDDEN_ROWS) * cell + line / 2, cell - line, cell - line);
    }
    ctx.globalAlpha = 1;
  }

  function drawPreview(next) {
    const { cell, width } = layout;
    const piece = PIECES[next.index];
    const size = Math.max(1, Math.round(cell * opts.previewScale));
    const margin = Math.round(cell * opts.previewMarginCells);
    const left = width - margin - piece.width * size;
    ctx.globalAlpha = opts.previewAlpha;
    for (const [x, y] of piece.cells) {
      drawBlock(ctx, left + x * size, margin + y * size, size, shades[piece.index]);
    }
    ctx.globalAlpha = 1;
  }

  function drawDebugZones() {
    const { width, height, dpr } = layout;
    const line = Math.max(1, Math.round(dpr));
    const bottomY = Math.round(height * (1 - debugZones.bottomFraction));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(Math.round(width * debugZones.sideFraction), 0, line, bottomY);
    ctx.fillRect(Math.round(width * (1 - debugZones.sideFraction)), 0, line, bottomY);
    ctx.fillRect(0, bottomY, width, line);
  }

  function draw(state) {
    lastState = state;
    if (!layout) {
      return;
    }
    ctx.drawImage(backdrop, 0, 0);
    if (state) {
      drawBoard(state.board);
      if (state.clearingRows && state.clearingRows.length > 0) {
        drawClearFlash(state.clearingRows, state.clearProgress);
      }
      if (opts.showLandingIndicator && state.landing) {
        drawLanding(state.landing);
      }
      if (state.active) {
        drawCells(state.active.cells, state.active.index);
      }
      if (state.preview.length > 0) {
        drawPreview(state.preview[0]);
      }
    }
    if (debugZones) {
      drawDebugZones();
    }
  }

  function resize(boxWidth, boxHeight, dpr) {
    layout = computeLayout(boxWidth, boxHeight, dpr, COLS, VISIBLE_ROWS);
    canvas.width = layout.width;
    canvas.height = layout.height;
    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;
    buildBackdrop();
    draw(lastState);
  }

  function setBackground(hex) {
    if (hex === backgroundOverride) return;
    backgroundOverride = hex;
    if (layout) {
      buildBackdrop();
      draw(lastState);
    }
  }

  function setTheme(newTheme) {
    currentTheme = newTheme;
    shades = PIECES.map((piece) => blockShades(newTheme.pieceColors[piece.id]));
    if (layout) {
      buildBackdrop();
      draw(lastState);
    }
  }

  setTheme(theme);

  return {
    resize,
    draw,
    redraw: () => draw(lastState),
    rebuild: () => {
      if (layout) {
        buildBackdrop();
        draw(lastState);
      }
    },
    setTheme,
    setBackground,
    setDebugZones: (zones) => {
      debugZones = zones;
      draw(lastState);
    },
  };
}
