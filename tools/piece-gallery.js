/**
 * tools/piece-gallery.js - Developer tool: every piece side by side, for
 * deciding which pieces the game deals.
 *
 * Not part of the game: nothing in the game links here, and sw.js does not
 * list it. Open http://localhost:8088/tools/piece-gallery.html (served by
 * scripts/serve.py).
 *
 * All data comes from the game's own modules (pieces, rotation states,
 * bank tables, EXCLUDED_PIECES, palette, block shading), so the page always
 * shows what the game actually does. Nothing here is copied from them.
 *
 * Proposal mode only produces text: clicking a piece marks it keep or drop,
 * and the page prints the whole EXCLUDED_PIECES declaration, exactly as
 * banks.js writes it, to replace that line by hand. (Printing only an
 * assignment once led to a paste that reassigned the constant.) It never
 * writes anything.
 */

import { PIECES, getRotationCells } from '../js/engine/index.js';
import { getBank, EXCLUDED_PIECES } from '../js/progression/index.js';
import { DEFAULT_THEME } from '../js/themes/index.js';
import { blockShades } from '../js/render/color.js';

/** Banks offered by the selector. */
const BANK_COUNT = 8;

/** Block sizes in CSS pixels: the main drawing, and the rotation thumbnails. */
const CELL_PX = 22;
const THUMB_CELL_PX = 6;

/** Every drawing box fits the largest piece (5 cells long) in any rotation. */
const BOX_CELLS = 5;

const SIZE_NAMES = Object.freeze({ 3: 'Trominoes', 4: 'Tetrominoes', 5: 'Pentominoes' });

/** Proposed drops: starts as the game's current list. */
const proposed = new Set(EXCLUDED_PIECES);

/** @type {Map<string, {card: HTMLElement, weight: HTMLElement, share: HTMLElement, state: HTMLElement}>} */
const cards = new Map();

/**
 * Draw one block the way js/render/renderer.js does: a light top-left edge
 * and a dark bottom-right edge around the face colour.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {import('../js/render/color.js').BlockShades} shades
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
 * Cells moved so the smallest x and y are 0 (rotation states may sit at
 * negative offsets in the piece frame).
 * @param {readonly (readonly number[])[]} cells
 * @returns {number[][]}
 */
function normalise(cells) {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

/**
 * A canvas with the cells centred in a BOX_CELLS square, crisp at any
 * device pixel ratio.
 * @param {readonly (readonly number[])[]} cells
 * @param {number} cellPx CSS pixels per cell.
 * @param {import('../js/render/color.js').BlockShades} shades
 * @returns {HTMLCanvasElement}
 */
function pieceCanvas(cells, cellPx, shades) {
  const dpr = window.devicePixelRatio || 1;
  const cell = Math.round(cellPx * dpr);
  const box = BOX_CELLS * cell;
  const canvas = document.createElement('canvas');
  canvas.width = box;
  canvas.height = box;
  canvas.style.width = `${box / dpr}px`;
  canvas.style.height = `${box / dpr}px`;
  const shape = normalise(cells);
  const w = Math.max(...shape.map(([x]) => x)) + 1;
  const h = Math.max(...shape.map(([, y]) => y)) + 1;
  const left = Math.floor(((BOX_CELLS - w) * cell) / 2);
  const top = Math.floor(((BOX_CELLS - h) * cell) / 2);
  const ctx = canvas.getContext('2d');
  for (const [x, y] of shape) drawBlock(ctx, left + x * cell, top + y * cell, cell, shades);
  return canvas;
}

/**
 * The four rotation states with identical shapes collapsed, each with the
 * state numbers it stands for (for example "0 2" for I4).
 * @param {number} pieceIndex
 * @returns {{cells: number[][], states: number[]}[]}
 */
function distinctRotations(pieceIndex) {
  const groups = [];
  for (let state = 0; state < 4; state++) {
    const cells = normalise(getRotationCells(pieceIndex, state));
    const key = cells.map(([x, y]) => `${x},${y}`).sort().join(' ');
    const match = groups.find((g) => g.key === key);
    if (match) match.states.push(state);
    else groups.push({ key, cells, states: [state] });
  }
  return groups;
}

/**
 * Create an element with a class and optional text.
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * One piece's card: a button so it toggles by keyboard too.
 * @param {import('../js/engine/pieces.js').PieceDef} piece
 * @returns {HTMLElement}
 */
function buildCard(piece) {
  const shades = blockShades(DEFAULT_THEME.pieceColors[piece.id]);
  const card = el('button', 'card');
  card.type = 'button';
  card.dataset.id = piece.id;

  const head = el('div', 'card-head');
  head.append(el('span', 'piece-id', piece.id), el('span', 'piece-size', `${piece.size} cells`));
  card.append(head);
  if (EXCLUDED_PIECES.includes(piece.id)) card.append(el('span', 'tag tag-excluded', 'EXCLUDED'));

  card.append(pieceCanvas(piece.cells, CELL_PX, shades));

  const rotations = el('div', 'rotations');
  for (const { cells, states } of distinctRotations(piece.index)) {
    const figure = el('figure', 'rotation');
    figure.append(pieceCanvas(cells, THUMB_CELL_PX, shades), el('figcaption', '', states.join(' ')));
    rotations.append(figure);
  }
  card.append(rotations);

  const stats = el('div', 'stats');
  const weight = el('span', 'weight');
  const share = el('span', 'share');
  stats.append(weight, share);
  const state = el('div', 'proposal');
  card.append(stats, state);

  card.addEventListener('click', () => {
    if (proposed.has(piece.id)) proposed.delete(piece.id);
    else proposed.add(piece.id);
    updateProposal();
  });
  cards.set(piece.id, { card, weight, share, state });
  return card;
}

function buildGrid() {
  const gallery = document.getElementById('gallery');
  for (const size of [3, 4, 5]) {
    const pieces = PIECES.filter((p) => p.size === size);
    const section = el('section', 'group');
    section.append(el('h2', '', `${SIZE_NAMES[size]} (${size} cells, ${pieces.length})`));
    const grid = el('div', 'grid');
    for (const piece of pieces) grid.append(buildCard(piece));
    section.append(grid);
    gallery.append(section);
  }
}

/**
 * @param {number} part
 * @param {number} whole
 * @returns {string}
 */
const percent = (part, whole) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '-');

/**
 * Share of each size in a weight table.
 * @param {Readonly<Record<string, number>>} weights
 * @returns {string}
 */
function sizeShares(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return [3, 4, 5].map((size) => {
    const part = PIECES.filter((p) => p.size === size).reduce((sum, p) => sum + (weights[p.id] ?? 0), 0);
    return `${size}-cell ${percent(part, total)}`;
  }).join(' · ') + ` (bag of ${total})`;
}

function updateBank() {
  const bank = getBank(Number(document.getElementById('bank').value));
  const { weights } = bank;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [id, { weight, share }] of cards) {
    const w = weights[id] ?? 0;
    weight.textContent = `weight ${w}`;
    share.textContent = w ? percent(w, total) : 'not dealt';
  }
  document.getElementById('bank-summary').textContent =
    `Bank ${bank.bank}, ${bank.gravityMsPerRow} ms/row: ${sizeShares(weights)}`;
  updateProposal();
}

/**
 * The proposed list: drops already in the game's list keep their order,
 * new drops follow in piece order.
 * @returns {string[]}
 */
function proposedList() {
  const kept = EXCLUDED_PIECES.filter((id) => proposed.has(id));
  const added = PIECES.map((p) => p.id).filter((id) => proposed.has(id) && !EXCLUDED_PIECES.includes(id));
  return [...kept, ...added];
}

function updateProposal() {
  const list = proposedList();
  document.getElementById('line').value = `export const EXCLUDED_PIECES = [${list.map((id) => `'${id}'`).join(', ')}];`;
  for (const [id, { card, state }] of cards) {
    const drop = proposed.has(id);
    card.classList.toggle('drop', drop);
    card.setAttribute('aria-pressed', String(drop));
    state.textContent = drop ? 'PROPOSED: DROP' : 'proposed: keep';
  }

  const nowDealt = EXCLUDED_PIECES.filter((id) => !proposed.has(id));
  const newDrops = list.filter((id) => !EXCLUDED_PIECES.includes(id));
  const changes = [];
  if (newDrops.length) changes.push(`drops ${newDrops.join(', ')}`);
  if (nowDealt.length) changes.push(`deals ${nowDealt.join(', ')} again (give them weights in BANK_TABLE)`);
  document.getElementById('diff').textContent =
    changes.length ? `Against the game: ${changes.join('; ')}.` : 'Same as the game\'s current list.';

  // The selected bank with the proposed drops taken out (pieces dealt again
  // have no weight yet, so they cannot be counted).
  const { weights } = getBank(Number(document.getElementById('bank').value));
  const remaining = Object.fromEntries(Object.entries(weights).filter(([id]) => !proposed.has(id)));
  document.getElementById('proposal-summary').textContent = `With the proposal: ${sizeShares(remaining)}`;
}

/**
 * Copy the line. The Clipboard API needs a secure context (localhost is
 * one, a LAN address is not), so fall back to selecting the text.
 */
async function copyLine() {
  const input = /** @type {HTMLInputElement} */ (document.getElementById('line'));
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(input.value);
    status.textContent = 'Copied.';
  } catch {
    input.select();
    status.textContent = document.execCommand('copy') ? 'Copied.' : 'Selected: copy it by hand.';
  }
}

function init() {
  const select = document.getElementById('bank');
  for (let bank = 1; bank <= BANK_COUNT; bank++) select.append(new Option(`Bank ${bank}`, String(bank)));
  select.value = '5';
  select.addEventListener('change', updateBank);
  document.getElementById('copy').addEventListener('click', copyLine);
  document.getElementById('reset').addEventListener('click', () => {
    proposed.clear();
    for (const id of EXCLUDED_PIECES) proposed.add(id);
    updateProposal();
  });
  // A registered service worker (the game opened on this origin before)
  // serves the game's modules cache-first, so this page shows the cached
  // version of the data until the cache version changes.
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    document.getElementById('sw-note').hidden = false;
  }
  buildGrid();
  updateBank();
}

init();
