/**
 * js/audio/modem.js - The bank-complete modem dial-in, as a pure schedule.
 *
 * When a memory bank fills, the machine "dials up" the next bank the way
 * an acoustic dial-up modem connected: dial tone, the number dialled in
 * DTMF, ringing, the answering modem's tone, then the handshake screech.
 * Everything is synthesized (see js/audio/synth.js); this file only lays
 * the sound out in time, so the order, digits, and length can be tested in
 * Node and tuned in one place (MODEM below).
 *
 * The number dialled is 3-4-6-8, "DIM8" on a phone keypad. It is not a
 * real phone number (too short to be one anywhere).
 *
 * The bank transition is timed to this sequence (transitionTiming).
 */

import { tone, noise, scheduleEnd } from './schedule.js';

/**
 * DTMF (touch-tone) frequencies: each key sounds one row tone and one
 * column tone together. These are the standard telephone values.
 */
export const DTMF_ROW_HZ = Object.freeze([697, 770, 852, 941]);
export const DTMF_COL_HZ = Object.freeze([1209, 1336, 1477, 1633]);
const DTMF_KEYPAD = Object.freeze(['123A', '456B', '789C', '*0#D']);

/**
 * The frequency pair for one key.
 * @param {string} key '0'-'9', '*', '#', 'A'-'D'.
 * @returns {[number, number]} [row Hz, column Hz]
 */
export function dtmfFreqs(key) {
  const row = DTMF_KEYPAD.findIndex((keys) => keys.includes(key));
  if (row < 0) throw new RangeError(`Not a DTMF key: ${key}`);
  return [DTMF_ROW_HZ[row], DTMF_COL_HZ[DTMF_KEYPAD[row].indexOf(key)]];
}

/**
 * Tuning table for the sequence. Times in seconds, gains linear (before
 * the effect volume in js/audio/sfx.js). Real phone-line timings are much
 * longer (ringing alone is 2 s on, 4 s off); these are compressed so the
 * whole call fits in about 5.3 s while each phase stays recognisable.
 */
export const MODEM = Object.freeze({
  // Off-hook dial tone: 350 + 440 Hz together (North American precise tone plan).
  dialTone: { duration: 0.45, freqs: [350, 440], gain: 0.35 },
  gapAfterDialTone: 0.12,
  // Tone dialling, like a modem's auto-dialler: short, even tones and gaps
  // (well above the 40 ms minimum a phone exchange needs to detect a digit).
  dialing: { digits: '3468', tone: 0.09, gap: 0.075, gain: 0.4 },
  gapAfterDialing: 0.2,
  // One short burst of ringback (440 + 480 Hz), the caller hearing it ring.
  ringback: { duration: 0.5, freqs: [440, 480], gain: 0.3 },
  gapAfterRingback: 0.12,
  // The answering modem's 2100 Hz answer tone, with the slow 15 Hz
  // amplitude wobble that newer modems add to it.
  answer: { duration: 0.6, freq: 2100, am: { rate: 15, depth: 0.2 }, gain: 0.28 },
  // Handshake: the two modems negotiating a connection. It develops over
  // about 2.7 s, as a real one does, rather than repeating one noise loop.
  // Four parts, in order (MODEM_HANDSHAKE_PARTS):
  handshake: {
    // 1. Carrier exchange: each side puts up its steady carrier (the caller
    // around 1200 Hz, the answerer 2400 Hz), then a short burst of
    // unscrambled tones flipping between two pairs, the modems trading
    // capabilities before they switch to scrambled data.
    carrierExchange: {
      carriers: { duration: 0.26, freqs: [1200, 2400], gain: 0.25 },
      pattern: { pairs: [[980, 1650], [1180, 1850]], steps: 8, step: 0.03, gain: 0.2 },
    },
    // 2. Scrambled data: the classic screech. A carrier that warbles and
    // drifts (each segment glides to a new pitch) under bursts of
    // band-passed noise whose centre keeps shifting, as the line probing
    // and equaliser training sweep across the band.
    scrambled: {
      warble: {
        glides: [[1800, 1650], [1650, 2050], [2050, 1700], [1700, 1900]],
        am: { rate: 32, depth: 0.45 },
        gain: 0.12,
      },
      bursts: { freqs: [1800, 1200, 2400, 1600, 2100, 1350, 2600, 1900], q: [1.2, 2, 1, 1.6], gap: 0.01, gain: 0.45 },
      duration: 1.2,
    },
    // 3. Training hiss: the data pump settling on its final speed. Broader,
    // smoother noise (wide band, slow edges) with a faint steady carrier.
    training: {
      noise: { freq: 1700, q: 0.45, gain: 0.32, attack: 0.06, release: 0.12 },
      carrier: { freq: 1800, gain: 0.05 },
      duration: 0.7,
    },
    // 4. Settle: everything drops to a near-silent hush, the "connected"
    // moment when the speaker cuts out.
    settle: { duration: 0.3, freq: 500, q: 0.7, gain: 0.03 },
    // Fade at the very end, so the call ends cleanly rather than cutting off.
    release: 0.1,
  },
});

/** The handshake's parts, in the order they play (segment property `part`). */
export const MODEM_HANDSHAKE_PARTS = Object.freeze(['carrierExchange', 'scrambled', 'training', 'settle']);

/** The phases, in the order they play. */
export const MODEM_PHASES = Object.freeze(['dialTone', 'dialing', 'ringback', 'answer', 'handshake']);

/**
 * Build the whole sequence.
 * @param {typeof MODEM} [m]
 * @returns {import('./schedule.js').Segment[]}
 */
export function buildModemSchedule(m = MODEM) {
  /** @type {import('./schedule.js').Segment[]} */
  const out = [];
  let t = 0;

  out.push(tone(t, m.dialTone.duration, m.dialTone.freqs, { phase: 'dialTone', gain: m.dialTone.gain, release: 0.01 }));
  t += m.dialTone.duration + m.gapAfterDialTone;

  [...m.dialing.digits].forEach((digit, i) => {
    if (i > 0) t += m.dialing.gap;
    out.push(tone(t, m.dialing.tone, dtmfFreqs(digit), { phase: 'dialing', gain: m.dialing.gain, digit }));
    t += m.dialing.tone;
  });
  t += m.gapAfterDialing;

  out.push(tone(t, m.ringback.duration, m.ringback.freqs, { phase: 'ringback', gain: m.ringback.gain, attack: 0.01, release: 0.02 }));
  t += m.ringback.duration + m.gapAfterRingback;

  out.push(tone(t, m.answer.duration, [m.answer.freq], {
    phase: 'answer', gain: m.answer.gain, am: m.answer.am, attack: 0.01, release: 0.01,
  }));
  t += m.answer.duration;

  const h = m.handshake;
  const part = (name) => ({ phase: 'handshake', part: name });

  const ce = h.carrierExchange;
  out.push(tone(t, ce.carriers.duration, ce.carriers.freqs, { ...part('carrierExchange'), gain: ce.carriers.gain }));
  t += ce.carriers.duration;
  for (let i = 0; i < ce.pattern.steps; i++) {
    // Abrupt flips are the point of the pattern, so the edges are kept very short.
    out.push(tone(t, ce.pattern.step, ce.pattern.pairs[i % 2], {
      ...part('carrierExchange'), gain: ce.pattern.gain, wave: 'triangle', attack: 0.002, release: 0.002,
    }));
    t += ce.pattern.step;
  }

  const sc = h.scrambled;
  const glideTime = sc.duration / sc.warble.glides.length;
  sc.warble.glides.forEach(([from, to], i) => {
    // Consecutive glides meet at the same pitch, so the carrier drifts
    // continuously; short edges keep the joins from clicking.
    out.push(tone(t + i * glideTime, glideTime, [from], {
      ...part('scrambled'), sweepTo: [to], gain: sc.warble.gain, am: sc.warble.am, attack: 0.01, release: 0.01,
    }));
  });
  const burstTime = sc.duration / sc.bursts.freqs.length;
  sc.bursts.freqs.forEach((freq, i) => {
    out.push(noise(t + i * burstTime, burstTime - sc.bursts.gap, {
      type: 'bandpass', freq, q: sc.bursts.q[i % sc.bursts.q.length],
    }, { ...part('scrambled'), gain: sc.bursts.gain, attack: 0.008, release: 0.01 }));
  });
  t += sc.duration;

  const tr = h.training;
  out.push(noise(t, tr.duration, { type: 'bandpass', freq: tr.noise.freq, q: tr.noise.q }, {
    ...part('training'), gain: tr.noise.gain, attack: tr.noise.attack, release: tr.noise.release,
  }));
  out.push(tone(t, tr.duration, [tr.carrier.freq], { ...part('training'), gain: tr.carrier.gain, attack: 0.03, release: tr.noise.release }));
  t += tr.duration;

  const st = h.settle;
  out.push(noise(t, st.duration, { type: 'lowpass', freq: st.freq, q: st.q }, {
    ...part('settle'), gain: st.gain, attack: 0.02, release: h.release,
  }));
  return out;
}

/** The sequence, built once. */
export const MODEM_SCHEDULE = Object.freeze(buildModemSchedule().map((s) => Object.freeze(s)));

/** Length of the sequence in seconds (about 5.3). */
export const MODEM_DURATION = scheduleEnd(MODEM_SCHEDULE);

/**
 * Music fades out first, then the modem starts: music never plays over it.
 * Seconds from the bank completing to the first dial tone.
 */
export const MODEM_LEAD_IN = 0.3;

/**
 * @typedef {object} TransitionTiming
 * @property {number} readyAtMs When "MEMORY BANK .. READY" appears (ms from
 *   the bank completing): when the modem has finished.
 * @property {number} durationMs Whole transition: readyAtMs plus the READY moment.
 */

/**
 * How the bank transition is timed. With sound effects on it follows the
 * modem: READY appears as the call ends (lead-in plus the sequence; the
 * settle hush is the breath before it), then the READY moment. With them
 * off the transition keeps a fixed length that still ends with the READY
 * moment, because the time to get ready matters with or without sound.
 * @param {boolean} modemOn Sound effects are on (and audio is available).
 * @param {{silentMs: number, readyMs: number}} screens SCREENS.bankTransitionMs
 *   and SCREENS.bankReadyMs.
 * @returns {TransitionTiming}
 */
export function transitionTiming(modemOn, { silentMs, readyMs }) {
  if (!modemOn) return { readyAtMs: silentMs - readyMs, durationMs: silentMs };
  const readyAtMs = Math.ceil((MODEM_LEAD_IN + MODEM_DURATION) * 1000);
  return { readyAtMs, durationMs: readyAtMs + readyMs };
}
