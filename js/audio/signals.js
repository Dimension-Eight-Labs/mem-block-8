/**
 * js/audio/signals.js - Sample-exact waveforms for the modem handshake.
 *
 * Most sounds in the game are oscillators and filtered noise (synth.js).
 * A few parts of the handshake need things oscillators cannot do exactly,
 * so they are computed sample by sample here and played from AudioBuffers:
 *
 *   answer       2100 Hz with 180-degree phase reversals at set times. An
 *                oscillator's phase cannot be flipped; computing the phase
 *                directly puts each flip on an exact sample and nowhere else.
 *   fsk          Frequency-shift keying: one tone switching between two
 *                frequencies at a baud rate, from seeded bits. The phase is
 *                accumulated sample by sample, so every switch is
 *                phase-continuous (no clicks) and the result is identical in
 *                every browser. (An oscillator with scheduled frequency
 *                changes is also continuous, but needs hundreds of automation
 *                events and cannot be checked in Node.)
 *   probe        The line-probe chord: about 20 partials with fixed random
 *                phases (oscillators always start at phase 0, which makes
 *                one loud spike), rendered once and reused for both chords.
 *   shapedNoise  Noise with a measured spectrum (the training hiss), shaped
 *                in the frequency domain; biquad filters cannot follow a
 *                spectrum with several peaks.
 *
 * Pure: no Web Audio, so tests render and measure the actual samples.
 * Randomness comes only from the engine's seeded generator, so each
 * signal is the same every time it plays. Renders are cached per
 * signal and sample rate; synth.js turns them into AudioBuffers once.
 */

import { createRng } from '../engine/rng.js';

/**
 * @typedef {object} AnswerSignal
 * @property {'answer'} type
 * @property {number} duration Seconds.
 * @property {number} freq Hz.
 * @property {number} h2 2nd harmonic level (relative to the fundamental).
 * @property {{rate: number, depth: number}} am Amplitude wobble (Hz, 0..1).
 * @property {readonly number[]} reversals Seconds: the fundamental's phase
 *   flips by 180 degrees at each.
 */

/**
 * @typedef {object} FskSignal
 * @property {'fsk'} type
 * @property {number} duration
 * @property {readonly [number, number]} freqs Hz for bit 0 and bit 1.
 * @property {number} baud Bits per second.
 * @property {number} h2 2nd harmonic level.
 * @property {number} seed Seeds the bits (fskBits).
 */

/**
 * @typedef {object} ProbeSignal
 * @property {'probe'} type
 * @property {number} duration
 * @property {readonly number[]} freqs Hz (probeFreqs).
 * @property {Readonly<Record<number, number>>} gainsDb Level per frequency, dB.
 * @property {number} defaultDb Level of frequencies not in gainsDb.
 * @property {number} dropAt Seconds: the chord drops by `drop` from here.
 * @property {number} drop Linear factor (0.5 is 6 dB).
 * @property {number} seed Seeds the partials' phases.
 */

/**
 * @typedef {object} ShapedNoiseSignal
 * @property {'shapedNoise'} type
 * @property {number} duration
 * @property {readonly (readonly [number, number])[]} spectrumDb [Hz, dB]
 *   points, rising in Hz; linear between them, flat beyond the ends.
 * @property {number} seed
 */

/** @typedef {AnswerSignal | FskSignal | ProbeSignal | ShapedNoiseSignal} Signal */

/**
 * The bits an FSK signal sends: a seeded random sequence, the same every time.
 * @param {number} seed
 * @param {number} count
 * @returns {number[]} 0s and 1s.
 */
export function fskBits(seed, count) {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.nextInt(2));
}

/**
 * Number of bits a signal of this length needs (the last may be partial).
 * @param {number} duration
 * @param {number} baud
 * @returns {number}
 */
export function fskBitCount(duration, baud) {
  return Math.ceil(duration * baud);
}

/**
 * The frequencies of a line-probe chord: every multiple of `step` from
 * `step` to `max`, except those in `skip`.
 * @param {number} step
 * @param {number} max
 * @param {readonly number[]} skip
 * @returns {number[]}
 */
export function probeFreqs(step, max, skip) {
  const out = [];
  for (let f = step; f <= max; f += step) if (!skip.includes(f)) out.push(f);
  return out;
}

const TAU = 2 * Math.PI;

/**
 * @param {AnswerSignal} s
 * @param {number} rate
 * @returns {Float32Array}
 */
function renderAnswer(s, rate) {
  const out = new Float32Array(Math.round(s.duration * rate));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    let phase = TAU * s.freq * t;
    for (const r of s.reversals) if (t >= r) phase += Math.PI;
    // The 2nd harmonic is computed from the same phase, so a reversal
    // (pi) leaves it unchanged (2 pi): only the fundamental flips.
    const wave = Math.sin(phase) + s.h2 * Math.sin(2 * phase);
    out[i] = wave * (1 + s.am.depth * Math.sin(TAU * s.am.rate * t));
  }
  return out;
}

/**
 * @param {FskSignal} s
 * @param {number} rate
 * @returns {Float32Array}
 */
function renderFsk(s, rate) {
  const out = new Float32Array(Math.round(s.duration * rate));
  const bits = fskBits(s.seed, fskBitCount(s.duration, s.baud));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const bit = bits[Math.min(bits.length - 1, Math.floor((i * s.baud) / rate))];
    // Accumulating the phase keeps every frequency switch continuous.
    phase += (TAU * s.freqs[bit]) / rate;
    if (phase > TAU) phase -= TAU;
    out[i] = Math.sin(phase) + s.h2 * Math.sin(2 * phase);
  }
  return out;
}

/**
 * Scale to a peak of 1 (the prototype's levels are relative to that).
 * @param {Float32Array} data
 * @returns {Float32Array}
 */
function normalise(data) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] /= peak;
  return data;
}

/**
 * @param {ProbeSignal} s
 * @param {number} rate
 * @returns {Float32Array}
 */
function renderProbe(s, rate) {
  const out = new Float32Array(Math.round(s.duration * rate));
  const rng = createRng(s.seed);
  for (const f of s.freqs) {
    const amp = 10 ** ((s.gainsDb[f] ?? s.defaultDb) / 20);
    const start = rng.nextFloat() * TAU;
    const step = (TAU * f) / rate;
    // A rotating phasor instead of Math.sin per sample (about 20 partials x
    // 15000 samples); in doubles it drifts far less than one 16-bit step.
    let sin = Math.sin(start);
    let cos = Math.cos(start);
    const ds = Math.sin(step);
    const dc = Math.cos(step);
    for (let i = 0; i < out.length; i++) {
      out[i] += amp * sin;
      const next = sin * dc + cos * ds;
      cos = cos * dc - sin * ds;
      sin = next;
    }
  }
  const drop = Math.round(s.dropAt * rate);
  for (let i = drop; i < out.length; i++) out[i] *= s.drop;
  return normalise(out);
}

/**
 * In-place iterative radix-2 FFT (inverse when `inverse`, unscaled).
 * @param {Float64Array} re
 * @param {Float64Array} im
 * @param {boolean} inverse
 */
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      // Plain temporaries, not destructuring: this loop runs a million times.
      let tmp = re[i];
      re[i] = re[j];
      re[j] = tmp;
      tmp = im[i];
      im[i] = im[j];
      im[j] = tmp;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 1 : -1) * TAU) / size;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

/**
 * Level in dB at a frequency, from the spectrum points.
 * @param {readonly (readonly [number, number])[]} points
 * @param {number} hz
 * @returns {number}
 */
export function spectrumDbAt(points, hz) {
  if (hz <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (hz <= points[i][0]) {
      const f0 = points[i - 1][0];
      const d0 = points[i - 1][1];
      return d0 + ((points[i][1] - d0) * (hz - f0)) / (points[i][0] - f0);
    }
  }
  return points[points.length - 1][1];
}

/**
 * Linear gain for each FFT bin 0..n/2, one sweep through the points
 * (the same values as spectrumDbAt, without searching for every bin).
 * @param {readonly (readonly [number, number])[]} points
 * @param {number} n FFT length.
 * @param {number} rate
 * @returns {Float64Array}
 */
function binGains(points, n, rate) {
  const gains = new Float64Array(n / 2 + 1);
  let i = 0;
  for (let k = 0; k < gains.length; k++) {
    const hz = (k * rate) / n;
    while (i < points.length && points[i][0] < hz) i++;
    let db;
    if (i === 0) db = points[0][1];
    else if (i === points.length) db = points[i - 1][1];
    else {
      const f0 = points[i - 1][0];
      const d0 = points[i - 1][1];
      db = d0 + ((points[i][1] - d0) * (hz - f0)) / (points[i][0] - f0);
    }
    gains[k] = 10 ** (db / 20);
  }
  return gains;
}

/**
 * White noise, shaped to the spectrum in the frequency domain, scaled to a
 * peak of 1. Rendered at a power-of-two length and cut to the duration.
 * @param {ShapedNoiseSignal} s
 * @param {number} rate
 * @returns {Float32Array}
 */
function renderShapedNoise(s, rate) {
  const length = Math.round(s.duration * rate);
  let n = 1;
  while (n < length) n <<= 1;
  const rng = createRng(s.seed);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = rng.nextFloat() * 2 - 1;
  fft(re, im, false);
  const gains = binGains(s.spectrumDb, n, rate);
  for (let k = 0; k <= n / 2; k++) {
    const gain = gains[k];
    re[k] *= gain;
    im[k] *= gain;
    if (k > 0 && k < n / 2) {
      re[n - k] *= gain;
      im[n - k] *= gain;
    }
  }
  fft(re, im, true);
  return normalise(Float32Array.from(re.subarray(0, length)));
}

const RENDERERS = { answer: renderAnswer, fsk: renderFsk, probe: renderProbe, shapedNoise: renderShapedNoise };

/** @type {Map<string, Float32Array>} */
const cache = new Map();

/**
 * A stable key for a signal at a sample rate (signals are plain data).
 * @param {Signal} signal
 * @param {number} rate
 * @returns {string}
 */
export function signalKey(signal, rate) {
  return `${rate}:${JSON.stringify(signal)}`;
}

/**
 * The samples of a signal, rendered once per sample rate and cached.
 * Callers must not modify the result.
 * @param {Signal} signal
 * @param {number} rate Samples per second.
 * @returns {Float32Array}
 */
export function renderSignal(signal, rate) {
  const key = signalKey(signal, rate);
  let data = cache.get(key);
  if (!data) {
    const render = RENDERERS[signal.type];
    if (!render) throw new RangeError(`Unknown signal type: ${signal.type}`);
    data = render(signal, rate);
    cache.set(key, data);
  }
  return data;
}
