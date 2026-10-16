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
 *
 * Microchips (table in chips.js): multi-row clears earn chips, which pile
 * up during the bank, including from the clear that completes it. When
 * the bank completes they are cashed in at once (the score changes then;
 * the transition's tally only animates it) and the count resets. Game
 * over before that loses them.
 */

import { getBank } from './banks.js';
import { lineClearPoints, dropPoints, isFullWord } from './scoring.js';
import { chipsForClear, cashInPoints } from './chips.js';

/**
 * @typedef {{type: 'scoreChanged', score: number, points: number, reason: 'lines' | 'drop' | 'chips'}
 *   | {type: 'fullWord', bank: number}
 *   | {type: 'chipsEarned', count: number, total: number, fullWord: boolean}
 *   | {type: 'chipsCashed', count: number, points: number, bank: number}
 *   | {type: 'chipsLost', count: number}
 *   | {type: 'bankComplete', fromBank: number, toBank: number,
 *      weights: Readonly<Record<string, number>>, gravityMsPerRow: number}} ProgressEvent
 * fullWord's bank is the bank the clear happened in. chipsEarned: count
 * from this clear, total held now, and whether the clear was a FULL WORD
 * (sound combines the two rewards). chipsCashed comes just before the
 * bankComplete it belongs to; bank is the bank completed. chipsLost comes
 * with game over. bankComplete carries the new bank's settings for the
 * session to apply.
 */

/**
 * @typedef {object} ProgressState
 * @property {number} score
 * @property {number} bank Current bank, 1 and up.
 * @property {number} totalLines All lines cleared this game.
 * @property {number} bankLines Lines in the current bank so far.
 * @property {number} linesToComplete Lines that fill the current bank.
 * @property {number} chips Microchips held in the current bank (not yet cashed in).
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
  let chips = 0;
  let settings = banks(1);

  /**
   * @param {number} points
   * @param {'lines' | 'drop' | 'chips'} reason
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
    const fullWord = isFullWord(count);
    if (fullWord) out.push({ type: 'fullWord', bank: settings.bank });
    const earned = chipsForClear(count);
    if (earned > 0) {
      chips += earned;
      out.push({ type: 'chipsEarned', count: earned, total: chips, fullWord });
    }
    totalLines += count;
    bankLines += count;
    // A loop, so a table with very short banks can never skip one silently.
    while (bankLines >= settings.linesToComplete) {
      bankLines -= settings.linesToComplete;
      const fromBank = settings.bank;
      if (chips > 0) {
        const points = cashInPoints(chips, fromBank);
        out.push({ type: 'chipsCashed', count: chips, points, bank: fromBank });
        addPoints(points, 'chips', out);
        chips = 0;
      }
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
    } else if (event.type === 'gameOver' && chips > 0) {
      out.push({ type: 'chipsLost', count: chips });
      chips = 0;
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
      chips,
    });
  }

  return { handle, getState, getBankSettings: () => settings };
}
