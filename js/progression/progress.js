/**
 * js/progression/progress.js - Score, bank, and line counts for one game.
 *
 * Consumes engine events and returns progression events. It never touches
 * the engine itself: a bankComplete event carries the next bank's weights
 * and gravity, and the session applies them with game.setWeights() and
 * game.setGravityMsPerRow(). That keeps this module pure and lets the
 * session decide when (it also starts the bank transition then).
 *
 * Lines beyond a bank's linesToComplete carry over into the next bank,
 * so no cleared line is ever lost.
 */

import { getBank } from './banks.js';
import { lineClearPoints, dropPoints, isFullWord } from './scoring.js';

/**
 * @typedef {{type: 'scoreChanged', score: number, points: number, reason: 'lines' | 'drop'}
 *   | {type: 'fullWord', bank: number}
 *   | {type: 'bankComplete', fromBank: number, toBank: number,
 *      weights: Readonly<Record<string, number>>, gravityMsPerRow: number}} ProgressEvent
 * fullWord's bank is the bank the clear happened in. bankComplete carries
 * the new bank's settings for the session to apply.
 */

/**
 * @typedef {object} ProgressState
 * @property {number} score
 * @property {number} bank Current bank, 1 and up.
 * @property {number} totalLines All lines cleared this game.
 * @property {number} bankLines Lines in the current bank so far.
 * @property {number} linesToComplete Lines that fill the current bank.
 */

/**
 * @typedef {object} Progress
 * @property {(event: import('../engine/game.js').GameEvent) => ProgressEvent[]} handle
 *   Feed one engine event; returns what it caused (often nothing).
 * @property {() => Readonly<ProgressState>} getState
 * @property {() => Readonly<import('./banks.js').BankSettings>} getBankSettings Current bank.
 */

/**
 * Start progression for a new game.
 * @param {object} [options]
 * @param {(bank: number) => Readonly<import('./banks.js').BankSettings>} [options.banks]
 *   Bank lookup; tests can pass a short table.
 * @returns {Progress}
 */
export function createProgress({ banks = getBank } = {}) {
  let score = 0;
  let totalLines = 0;
  let bankLines = 0;
  let settings = banks(1);

  /**
   * @param {number} points
   * @param {'lines' | 'drop'} reason
   * @param {ProgressEvent[]} out
   */
  function addPoints(points, reason, out) {
    if (points === 0) return;
    score += points;
    out.push({ type: 'scoreChanged', score, points, reason });
  }

  /**
   * @param {number} count
   * @param {ProgressEvent[]} out
   */
  function onLinesCleared(count, out) {
    addPoints(lineClearPoints(count, settings.bank), 'lines', out);
    if (isFullWord(count)) out.push({ type: 'fullWord', bank: settings.bank });
    totalLines += count;
    bankLines += count;
    // A loop, so a table with very short banks can never skip one silently.
    while (bankLines >= settings.linesToComplete) {
      bankLines -= settings.linesToComplete;
      const fromBank = settings.bank;
      settings = banks(fromBank + 1);
      out.push({
        type: 'bankComplete',
        fromBank,
        toBank: settings.bank,
        weights: settings.weights,
        gravityMsPerRow: settings.gravityMsPerRow,
      });
    }
  }

  function handle(event) {
    /** @type {ProgressEvent[]} */
    const out = [];
    if (event.type === 'locked') {
      addPoints(dropPoints(event), 'drop', out);
    } else if (event.type === 'linesCleared') {
      onLinesCleared(event.count, out);
    }
    return out;
  }

  function getState() {
    return Object.freeze({
      score,
      bank: settings.bank,
      totalLines,
      bankLines,
      linesToComplete: settings.linesToComplete,
    });
  }

  return { handle, getState, getBankSettings: () => settings };
}
