/**
 * js/audio/modem.js - The bank-complete modem dial-in, as a pure schedule.
 *
 * When a memory bank fills, the machine "dials up" the next bank the way
 * an acoustic dial-up modem connected: dial tone, the number dialled in
 * DTMF, ringing, the answering modem's tone, then the handshake (FSK,
 * probe chords, training hiss).
 * Everything is synthesized (see js/audio/synth.js); this file only lays
 * the sound out in time, so the order, digits, and length can be tested in
 * Node and tuned in one place (MODEM below).
 *
 * The number dialled is 3-4-6-8, "DIM8" on a phone keypad. It is not a
 * real phone number (too short to be one anywhere).
 *
 * The bank transition is timed to this sequence (transitionTiming).
 */

import { tone, signal, scheduleEnd } from './schedule.js';
import { probeFreqs } from './signals.js';

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
 * Line-probe chord levels in dB, measured from the reference recording:
 * loudest at 3300-3600 Hz. Frequencies not listed play at PROBE_DEFAULT_DB.
 */
export const PROBE_GAIN_DB = Object.freeze({
  750: -14, 1050: -15, 1350: -13, 1500: -12, 1650: -16, 1950: -10, 2100: -8, 2250: -16,
  2550: -15, 2850: -15, 3000: -13, 3150: -12, 3300: 0, 3450: -3, 3600: -2, 3750: -13,
});
const PROBE_DEFAULT_DB = -20;

/**
 * Training hiss spectrum, [Hz, dB], measured from the reference recording:
 * peaks near 1450, 2050, and 3450 Hz. Only the shape matters (the noise is
 * scaled to its peak afterwards).
 */
export const HISS_DB = Object.freeze([
  [0, -90], [300, -80], [800, -68], [1150, -66], [1450, -57], [1750, -65], [2050, -58], [2400, -68],
  [2800, -69], [3150, -61], [3450, -51], [3750, -62], [4200, -72], [6000, -95], [12000, -110],
].map((p) => Object.freeze(p)));

/**
 * The answer tone and handshake, modelled on a V.34-era modem handshake:
 * measured from a reference recording kept locally in assets/audio-reference/
 * (gitignored, never shipped), by way of the owner-approved numpy prototype
 * there (modem_prototype.py). The recognisable sound is mostly tones, not
 * noise: the answer tone with its clicks, overlapping FSK, multi-tone probe
 * chords, and only then the hiss.
 *
 * Times in seconds, levels linear and relative, as in the prototype (the
 * fixed probe and noise signals are scaled to a peak of 1 first). `level`
 * scales them all into the game's mix, next to the dial tone and DTMF.
 *
 * RULE: NO PITCH GLIDES. Frequencies may switch abruptly (the FSK) but
 * never sweep: no glides, vibrato, or warble (no sweepTo on any segment;
 * a test checks it). Pass 1 broke this with a drifting carrier and the
 * screech sounded like a cartoon spaceship. The answer tone's 15 Hz wobble
 * is in amplitude only, as real answer tones have.
 */
export const HANDSHAKE = Object.freeze({
  // Into the game's mix: the answer tone lands about 2 dB above the dial
  // tone (RMS), where earlier versions had it; the phases keep the
  // prototype's levels relative to each other.
  level: 0.4,
  // Every handshake part goes through a phone-line band limit (synth.js).
  band: Object.freeze([250, 3900]),
  // Fades on each part (the prototype's), so nothing starts or stops with a click.
  edges: Object.freeze({ attack: 0.004, release: 0.006 }),
  // 1. The answering modem's 2100 Hz tone, with a weak 2nd harmonic, a 15 Hz
  // amplitude wobble, and two 180-degree phase reversals: the two clicks.
  // The caller's faint FSK joins for the last 0.35 s.
  answer: {
    duration: 0.95, freq: 2100, h2: 0.12, am: { rate: 15, depth: 0.2 }, reversals: [0.45, 0.9], level: 0.55,
    caller: { duration: 0.35, freqs: [980, 1180], level: 0.12, seed: 0x3468a },
  },
  // 2. Both modems sending FSK at 300 baud: the answerer at 1650/1850 Hz with
  // a strong 2nd harmonic (3300/3700 Hz), the caller at 980/1180 Hz under it.
  fskExchange: {
    duration: 0.65, baud: 300, h2: 0.3,
    answerer: { freqs: [1650, 1850], level: 0.5, seed: 0x3468b },
    caller: { freqs: [980, 1180], level: 0.1, seed: 0x3468c },
  },
  gap: 0.04,
  // 3. INFO bursts: 1200 + 2400 + 3600 Hz together (relative levels).
  info: { freqs: [1200, 2400, 3600], levels: [0.5, 0.25, 0.45], level: 0.55 },
  info1: 0.12,
  // 4. Line-probe chords: every multiple of 150 Hz up to 3750 except
  // 900, 1200, 1800, and 2400, with fixed random phases; 6 dB quieter for
  // the second half. One chord, rendered once, plays twice.
  probe: {
    duration: 0.3, step: 150, max: 3750, skip: [900, 1200, 1800, 2400], dropAt: 0.15, drop: 0.5,
    level: 0.6, seed: 0x3468d,
  },
  info2: 0.09,
  // 5. A 2400 Hz tone over shaped noise.
  toneNoise: { duration: 0.22, freq: 2400, toneLevel: 0.3, noiseLevel: 0.25, seed: 0x3468e },
  gap2: 0.07,
  // 6. The training hiss: noise with the measured spectrum, fading out over
  // its last 0.12 s. Then the speaker cuts out: connected.
  trainingHiss: { duration: 0.75, level: 0.7, attack: 0.01, fade: 0.12, seed: 0x3468f },
});

/**
 * Tuning table for the sequence. Times in seconds, gains linear (before
 * the effect volume in js/audio/sfx.js). Real phone-line timings are much
 * longer (ringing alone is 2 s on, 4 s off); these are compressed so the
 * whole call fits in about 5.5 s while each phase stays recognisable.
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
  // Answer tone and handshake: see HANDSHAKE above.
  handshake: HANDSHAKE,
});

/** The answer tone and handshake phases, in the order they play (gaps included). */
export const MODEM_HANDSHAKE_PHASES = Object.freeze([
  'answer', 'fskExchange', 'gap', 'info1', 'probe1', 'info2', 'probe2', 'toneNoise', 'gap2', 'trainingHiss',
]);

/** Every phase, in the order it plays. */
export const MODEM_PHASES = Object.freeze(['dialTone', 'dialing', 'ringback', ...MODEM_HANDSHAKE_PHASES]);

/**
 * The signal for one FSK stream.
 * @param {number} duration
 * @param {{freqs: number[], seed: number}} stream
 * @param {number} baud
 * @param {number} h2
 * @returns {import('./signals.js').FskSignal}
 */
function fsk(duration, { freqs, seed }, baud, h2) {
  return { type: 'fsk', duration, freqs: [freqs[0], freqs[1]], baud, h2, seed };
}

/**
 * @typedef {object} PhaseSpan
 * @property {string} phase
 * @property {number} start Seconds.
 * @property {number} duration Seconds (gaps have no segments, only a span).
 */

/**
 * Build the whole sequence.
 * @param {typeof MODEM} [m]
 * @returns {{segments: import('./schedule.js').Segment[], timeline: PhaseSpan[]}}
 */
export function buildModem(m = MODEM) {
  /** @type {import('./schedule.js').Segment[]} */
  const out = [];
  /** @type {PhaseSpan[]} */
  const timeline = [];
  let t = 0;
  // Times are kept to the microsecond so sums of the table's decimals do
  // not drift (0.1 + 0.2 and the like).
  const at = (x) => Math.round(x * 1e6) / 1e6;
  const span = (phase, start, duration) => timeline.push({ phase, start: at(start), duration });

  out.push(tone(t, m.dialTone.duration, m.dialTone.freqs, { phase: 'dialTone', gain: m.dialTone.gain, release: 0.01 }));
  span('dialTone', t, m.dialTone.duration);
  t = at(t + m.dialTone.duration + m.gapAfterDialTone);

  const dialStart = t;
  [...m.dialing.digits].forEach((digit, i) => {
    if (i > 0) t = at(t + m.dialing.gap);
    out.push(tone(t, m.dialing.tone, dtmfFreqs(digit), { phase: 'dialing', gain: m.dialing.gain, digit }));
    t = at(t + m.dialing.tone);
  });
  span('dialing', dialStart, at(t - dialStart));
  t = at(t + m.gapAfterDialing);

  out.push(tone(t, m.ringback.duration, m.ringback.freqs, { phase: 'ringback', gain: m.ringback.gain, attack: 0.01, release: 0.02 }));
  span('ringback', t, m.ringback.duration);
  t = at(t + m.ringback.duration + m.gapAfterRingback);

  const h = m.handshake;
  const k = h.level;
  const opts = (phase, gain, extra = {}) => ({ phase, gain: at(gain * k), band: [...h.band], ...h.edges, ...extra });

  // 1. Answer tone, with the caller's FSK over its end.
  const a = h.answer;
  out.push(signal(t, {
    type: 'answer', duration: a.duration, freq: a.freq, h2: a.h2, am: { ...a.am }, reversals: [...a.reversals],
  }, opts('answer', a.level)));
  out.push(signal(at(t + a.duration - a.caller.duration), fsk(a.caller.duration, a.caller, h.fskExchange.baud, h.fskExchange.h2),
    opts('answer', a.caller.level)));
  span('answer', t, a.duration);
  t = at(t + a.duration);

  // 2. FSK exchange: both streams at once.
  const x = h.fskExchange;
  for (const stream of [x.answerer, x.caller]) {
    out.push(signal(t, fsk(x.duration, stream, x.baud, x.h2), opts('fskExchange', stream.level)));
  }
  span('fskExchange', t, x.duration);
  t = at(t + x.duration);

  span('gap', t, h.gap);
  t = at(t + h.gap);

  // 3-4. INFO, probe, INFO, probe.
  const p = h.probe;
  const probe = {
    type: 'probe', duration: p.duration, freqs: probeFreqs(p.step, p.max, p.skip), gainsDb: { ...PROBE_GAIN_DB },
    defaultDb: PROBE_DEFAULT_DB, dropAt: p.dropAt, drop: p.drop, seed: p.seed,
  };
  for (const [info, probePhase, infoDuration] of [['info1', 'probe1', h.info1], ['info2', 'probe2', h.info2]]) {
    out.push(tone(t, infoDuration, [...h.info.freqs], opts(info, h.info.level, { levels: [...h.info.levels] })));
    span(info, t, infoDuration);
    t = at(t + infoDuration);
    out.push(signal(t, probe, opts(probePhase, p.level)));
    span(probePhase, t, p.duration);
    t = at(t + p.duration);
  }

  // 5. 2400 Hz over shaped noise.
  const tn = h.toneNoise;
  out.push(tone(t, tn.duration, [tn.freq], opts('toneNoise', tn.toneLevel)));
  out.push(signal(t, { type: 'shapedNoise', duration: tn.duration, spectrumDb: HISS_DB, seed: tn.seed },
    opts('toneNoise', tn.noiseLevel)));
  span('toneNoise', t, tn.duration);
  t = at(t + tn.duration);

  span('gap2', t, h.gap2);
  t = at(t + h.gap2);

  // 6. Training hiss; its release is the fade-out.
  const th = h.trainingHiss;
  out.push(signal(t, { type: 'shapedNoise', duration: th.duration, spectrumDb: HISS_DB, seed: th.seed },
    opts('trainingHiss', th.level, { attack: th.attack, release: th.fade })));
  span('trainingHiss', t, th.duration);

  return { segments: out, timeline };
}

/**
 * Build the whole sequence's segments.
 * @param {typeof MODEM} [m]
 * @returns {import('./schedule.js').Segment[]}
 */
export function buildModemSchedule(m = MODEM) {
  return buildModem(m).segments;
}

const BUILT = buildModem();

/** The sequence, built once. */
export const MODEM_SCHEDULE = Object.freeze(BUILT.segments.map((s) => Object.freeze(s)));

/** Every phase's span, gaps included, in order. */
export const MODEM_TIMELINE = Object.freeze(BUILT.timeline.map((s) => Object.freeze(s)));

/** Length of the sequence in seconds (about 5.5). */
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
 * training hiss fades out just before it), then the READY moment. With them
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
  // float dust (5.465000000000001) that would otherwise round up a whole ms.
  const readyAtMs = Math.ceil(Math.round((MODEM_LEAD_IN + MODEM_DURATION) * 1e6) / 1e3);
  return { readyAtMs, durationMs: readyAtMs + readyMs };
}
