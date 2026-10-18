/**
 * js/audio/schedule.js - Sound as data: segments on a timeline.
 *
 * Every synthesized sound (the modem sequence and each effect) is described
 * as a list of segments: plain objects with a start time, a duration, and
 * what to play (tones, filtered noise, or a sample-exact signal from
 * js/audio/signals.js). Nothing here touches Web Audio,
 * so schedules can be built and checked in Node; js/audio/synth.js turns
 * them into oscillators and filters.
 *
 * Times are seconds from the start of the sound; gains are linear (1 is
 * full scale before the sound effects gain).
 */

/**
 * @typedef {'sine' | 'square' | 'triangle' | 'sawtooth'} Wave
 */

/**
 * @typedef {object} ToneSegment
 * @property {'tone'} kind
 * @property {string} [phase] What it belongs to (modem phases; tests check them).
 * @property {number} start Seconds.
 * @property {number} duration Seconds.
 * @property {number[]} freqs Hz; several play together (DTMF pairs, dial tone).
 *   The gain is shared between them, so a pair is no louder than one tone.
 * @property {number[]} [sweepTo] Hz, one per freq: glide there by the end.
 * @property {Wave} wave
 * @property {number} gain
 * @property {number} attack Seconds of fade-in (avoids a click at the start).
 * @property {number} release Seconds of fade-out (avoids a click at the end).
 * @property {{rate: number, depth: number}} [am] Amplitude wobble (Hz, 0..1).
 * @property {string} [digit] The key a DTMF tone stands for (for reading and tests).
 * @property {number[]} [levels] Relative level per freq (instead of sharing
 *   the gain equally): each oscillator plays at gain x its level.
 * @property {[number, number]} [band] Hz: play through a phone-line band
 *   limit (see synth.js).
 */

/**
 * @typedef {object} NoiseSegment
 * @property {'noise'} kind
 * @property {string} [phase]
 * @property {number} start
 * @property {number} duration
 * @property {{type: 'bandpass' | 'highpass' | 'lowpass', freq: number, q: number}} filter
 * @property {number} gain
 * @property {number} attack
 * @property {number} release
 * @property {[number, number]} [band]
 */

/**
 * @typedef {object} SignalSegment Samples computed in code (js/audio/signals.js).
 * @property {'signal'} kind
 * @property {string} [phase]
 * @property {number} start
 * @property {number} duration Equal to the signal's own duration.
 * @property {import('./signals.js').Signal} signal
 * @property {number} gain
 * @property {number} attack
 * @property {number} release
 * @property {[number, number]} [band]
 */

/** @typedef {ToneSegment | NoiseSegment | SignalSegment} Segment */

/** Default fades: long enough to avoid clicks, short enough to stay crisp. */
const EDGE = 0.005;

/**
 * A tone segment.
 * @param {number} start
 * @param {number} duration
 * @param {number[]} freqs
 * @param {Partial<ToneSegment>} [options]
 * @returns {ToneSegment}
 */
export function tone(start, duration, freqs, options = {}) {
  return {
    kind: 'tone',
    start,
    duration,
    freqs,
    wave: 'sine',
    gain: 0.5,
    attack: EDGE,
    release: EDGE,
    ...options,
  };
}

/**
 * A filtered noise segment.
 * @param {number} start
 * @param {number} duration
 * @param {NoiseSegment['filter']} filter
 * @param {Partial<NoiseSegment>} [options]
 * @returns {NoiseSegment}
 */
export function noise(start, duration, filter, options = {}) {
  return {
    kind: 'noise',
    start,
    duration,
    filter,
    gain: 0.3,
    attack: EDGE,
    release: EDGE,
    ...options,
  };
}

/**
 * A segment that plays a computed signal for its whole length.
 * @param {number} start
 * @param {import('./signals.js').Signal} sig
 * @param {Partial<SignalSegment>} [options]
 * @returns {SignalSegment}
 */
export function signal(start, sig, options = {}) {
  return {
    kind: 'signal',
    start,
    duration: sig.duration,
    signal: sig,
    gain: 0.3,
    attack: EDGE,
    release: EDGE,
    ...options,
  };
}

/**
 * When the last segment ends, in seconds.
 * @param {readonly Segment[]} segments
 * @returns {number}
 */
export function scheduleEnd(segments) {
  return segments.reduce((end, s) => Math.max(end, s.start + s.duration), 0);
}

/**
 * Whether two segments overlap in time (touching ends do not count).
 * @param {Segment} a
 * @param {Segment} b
 * @returns {boolean}
 */
export function overlaps(a, b) {
  const eps = 1e-9;
  return a.start < b.start + b.duration - eps && b.start < a.start + a.duration - eps;
}

/**
 * Multiply every segment's gain (an effect's volume from the table).
 * @param {readonly Segment[]} segments
 * @param {number} factor
 * @returns {Segment[]}
 */
export function scaleGain(segments, factor) {
  return segments.map((s) => ({ ...s, gain: s.gain * factor }));
}

/**
 * Problems with a segment, as messages (empty when it is playable).
 * @param {Segment} s
 * @returns {string[]}
 */
export function segmentProblems(s) {
  const problems = [];
  if (!(s.start >= 0)) problems.push('start must be >= 0');
  if (!(s.duration > 0)) problems.push('duration must be > 0');
  if (!(s.gain > 0 && s.gain <= 1)) problems.push('gain must be in (0, 1]');
  if (!(s.attack >= 0 && s.release >= 0 && s.attack + s.release <= s.duration + 1e-9)) {
    problems.push('attack + release must fit in the duration');
  }
  if (s.kind === 'tone') {
    if (!s.freqs.length || !s.freqs.every((f) => f > 0 && f < 20000)) problems.push('bad freqs');
    if (s.sweepTo && (s.sweepTo.length !== s.freqs.length || !s.sweepTo.every((f) => f > 0))) {
      problems.push('sweepTo must match freqs');
    }
    if (s.levels && (s.levels.length !== s.freqs.length || !s.levels.every((l) => l > 0 && l <= 1))) {
      problems.push('levels must match freqs');
    }
  } else if (s.kind === 'noise') {
    if (!(s.filter.freq > 0 && s.filter.q > 0)) problems.push('bad filter');
  } else if (s.kind === 'signal') {
    if (!s.signal || Math.abs(s.signal.duration - s.duration) > 1e-9) problems.push('signal must last the segment');
  } else {
    problems.push(`unknown kind ${s.kind}`);
  }
  if (s.band && !(s.band[0] > 0 && s.band[1] > s.band[0])) problems.push('bad band');
  return problems;
}
