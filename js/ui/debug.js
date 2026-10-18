/**
 * js/ui/debug.js - Gesture and sound log for ?debug=1.
 *
 * Gestures and sound effects share one timeline, so playtesting on a phone
 * shows whether a sound fired (and when, after which gesture) or was never
 * asked for: a sound that is logged as played but not heard was masked,
 * or played into a suspended AudioContext (its state is shown).
 *
 * Only imported when debug mode is on, so it costs nothing otherwise.
 */

/**
 * Format one record: time since the previous record, gesture or key,
 * action, zone, distance, and duration.
 * @param {import('../input/dom.js').DebugRecord} record
 * @param {number | null} previousT
 * @returns {string}
 */
export function formatRecord(record, previousT) {
  const gap = previousT === null ? '     ' : `+${Math.round(record.t - previousT)}`.padStart(5);
  const action = record.action ?? '-';
  const zone = record.zone ? ` ${record.zone}` : '';
  const motion = record.zone ? ` ${record.distance}px ${record.duration}ms` : '';
  return `${gap} ${record.label} > ${action}${zone}${motion}`;
}

/**
 * Format one sound effect: time since the previous record, the effect,
 * and whether it played (with the AudioContext state, and "duck" when the
 * music ducked for it) or why not.
 * @param {import('../audio/index.js').SoundRecord} record
 * @param {number | null} previousT
 * @returns {string}
 */
export function formatSound(record, previousT) {
  const gap = previousT === null ? '     ' : `+${Math.round(record.t - previousT)}`.padStart(5);
  const outcome = record.played
    ? `${record.state}${record.ducked ? ' duck' : ''}`
    : `NOT PLAYED: ${record.reason}`;
  return `${gap} SFX ${record.name} (${outcome})`;
}

/**
 * Create the on-screen log.
 * @param {HTMLElement} parent
 * @param {number} maxLines
 * @returns {{log: (record: import('../input/dom.js').DebugRecord) => void,
 *   logSound: (record: import('../audio/index.js').SoundRecord) => void}}
 */
export function createDebugPanel(parent, maxLines) {
  const pre = document.createElement('pre');
  pre.className = 'debug-log';
  pre.textContent = 'debug: waiting for input';
  parent.append(pre);
  const lines = [];
  let previousT = null;
  function add(line, t) {
    lines.push(line);
    previousT = t;
    while (lines.length > maxLines) lines.shift();
    pre.textContent = lines.join('\n');
  }
  return {
    log: (record) => add(formatRecord(record, previousT), record.t),
    logSound: (record) => add(formatSound(record, previousT), record.t),
  };
}
