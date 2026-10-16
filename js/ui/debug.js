/**
 * js/ui/debug.js - Gesture log for ?debug=1.
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
 * Create the on-screen log.
 * @param {HTMLElement} parent
 * @param {number} maxLines
 * @returns {{log: (record: import('../input/dom.js').DebugRecord) => void}}
 */
export function createDebugPanel(parent, maxLines) {
  const pre = document.createElement('pre');
  pre.className = 'debug-log';
  pre.textContent = 'debug: waiting for input';
  parent.append(pre);
  const lines = [];
  let previousT = null;
  return {
    log(record) {
      lines.push(formatRecord(record, previousT));
      previousT = record.t;
      while (lines.length > maxLines) lines.shift();
      pre.textContent = lines.join('\n');
    },
  };
}
