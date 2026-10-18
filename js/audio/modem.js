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
  // Handshake: the two modems negotiating a connection, about 2.7 s.
  //
  // RULE: NO PITCH MOVEMENT IN THE HANDSHAKE. No glides, sweeps, vibrato,
  // or tremolo (sweepTo, am) on any handshake segment. Real modems hold
  // fixed carrier frequencies; the harshness of the sound comes from noise
  // bursts and abrupt on/off and level changes, never from moving pitch.
  // Pass 1 broke this rule (a drifting, warbling carrier) and its screech
  // sounded like a cartoon spaceship on the phone. The parts below extend
  // the Stage 5 handshake, which sounded right but was only 0.96 s long:
  // its carriers, its FSK flips, and its burst pattern, repeated and
  // varied. A test checks the rule.
  //
  // Four parts, in order (MODEM_HANDSHAKE_PARTS):
  handshake: {
    // 1. Carrier exchange (Stage 5's opening, slightly longer): both
    // carriers steady (the caller around 1200 Hz, the answerer 2400 Hz),
    // then a burst of FSK, the tones flipping between two fixed pairs.
    carrierExchange: {
      carriers: { duration: 0.29, freqs: [1200, 2400], gain: 0.25 },
      pattern: { pairs: [[980, 1650], [1180, 1850]], steps: 6, step: 0.035, gain: 0.2 },
    },
    // 2. Scrambled data: the screech. Stage 5's burst (band-passed noise at
    // 1800, then 1200, then 2400 Hz over a steady 1800 Hz carrier) comes
    // first, then the same bands again, chopped up: short stuttering
    // bursts, level jumps, and hard switches between bands. Each burst is
    // [start, duration, band centre Hz, Q, gain], seconds from the part's
    // start. The carrier stays at one pitch and only steps in level.
    scrambled: {
      duration: 1.2,
      carrier: { freq: 1800, levels: [[0, 0.5, 0.12], [0.5, 0.3, 0.07], [0.8, 0.4, 0.12]] },
      bursts: [
        [0, 0.2, 1800, 1.2, 0.5], // Stage 5's burst, verbatim...
        [0.22, 0.14, 1200, 2, 0.45],
        [0.375, 0.125, 2400, 1, 0.45], // ...to here
        [0.51, 0.06, 1800, 1.2, 0.5], // stutter
        [0.585, 0.05, 1800, 1.2, 0.3],
        [0.645, 0.11, 2400, 1, 0.5],
        [0.765, 0.04, 1200, 2, 0.4],
        [0.81, 0.14, 1800, 1.2, 0.5],
        [0.955, 0.03, 2400, 1, 0.35],
        [0.99, 0.09, 1200, 2, 0.45],
        [1.085, 0.115, 1800, 1.2, 0.5],
      ],
    },
    // 3. Training hiss: broader, smoother noise (wide band, slow edges)
    // over both carriers held faintly, the modems settling on a speed.
    training: {
      noise: { freq: 1700, q: 0.45, gain: 0.32, attack: 0.06, release: 0.12 },
      carriers: { freqs: [1200, 2400], gain: 0.06 },
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
  for (const [start, duration, gain] of sc.carrier.levels) {
    // Level steps, not fades: abrupt changes are part of the sound.
    out.push(tone(t + start, duration, [sc.carrier.freq], {
      ...part('scrambled'), gain, attack: 0.003, release: 0.003,
    }));
  }
  for (const [start, duration, freq, q, gain] of sc.bursts) {
    out.push(noise(t + start, duration, { type: 'bandpass', freq, q }, {
      ...part('scrambled'), gain, attack: 0.004, release: 0.006,
    }));
  }
  t += sc.duration;

  const tr = h.training;
  out.push(noise(t, tr.duration, { type: 'bandpass', freq: tr.noise.freq, q: tr.noise.q }, {
    ...part('training'), gain: tr.noise.gain, attack: tr.noise.attack, release: tr.noise.release,
  }));
  out.push(tone(t, tr.duration, tr.carriers.freqs, { ...part('training'), gain: tr.carriers.gain, attack: 0.03, release: tr.noise.release }));
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
  // Rounded to a microsecond first: summing the table's seconds leaves
  // float dust (5.275000000000001) that would otherwise round up a whole ms.
  const readyAtMs = Math.ceil(Math.round((MODEM_LEAD_IN + MODEM_DURATION) * 1e6) / 1e3);
  return { readyAtMs, durationMs: readyAtMs + readyMs };
}
