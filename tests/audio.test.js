/**
 * tests/audio.test.js - The pure side of sound (Stage 5): DTMF table, the
 * modem schedule, the effect table, the playlist, loop points, the memory
 * rule, and the bank transition timing; the reward sounds and the chip
 * tally (playtest pass 1); the handshake rebuilt from the V.34-era
 * prototype, measured on its rendered samples (playtest pass 3). No Web
 * Audio needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DTMF_ROW_HZ, DTMF_COL_HZ, dtmfFreqs, MODEM_PHASES, MODEM_HANDSHAKE_PHASES, MODEM_SCHEDULE, MODEM_TIMELINE,
  MODEM_DURATION, MODEM_LEAD_IN, PROBE_GAIN_DB, HISS_DB, buildModemSchedule, transitionTiming,
} from '../js/audio/modem.js';
import { renderSignal, fskBits, fskBitCount, probeFreqs } from '../js/audio/signals.js';
import { EFFECTS, EVENT_EFFECTS, buildEffect, effectForEvent } from '../js/audio/sfx.js';
import { overlaps, scheduleEnd, segmentProblems, tone } from '../js/audio/schedule.js';
import {
  TRACKS, trackForBank, musicTarget, tracksToKeep, loopPoints, MP3_PRIMING_FRAMES,
} from '../js/audio/music.js';
import { MUSIC_FADES } from '../js/audio/player.js';
import { SCREENS } from '../js/input/bindings.js';
import { DEFAULT_CONFIG } from '../js/engine/config.js';
import { tallySteps, tallyValue, tallyDoneAtMs } from '../js/ui/tally.js';
import { readFileSync, statSync } from 'node:fs';

// --- DTMF ------------------------------------------------------------------------

test('DTMF: the standard row and column frequencies', () => {
  assert.deepEqual(DTMF_ROW_HZ, [697, 770, 852, 941]);
  assert.deepEqual(DTMF_COL_HZ, [1209, 1336, 1477, 1633]);
  const expected = {
    1: [697, 1209], 2: [697, 1336], 3: [697, 1477], A: [697, 1633],
    4: [770, 1209], 5: [770, 1336], 6: [770, 1477], B: [770, 1633],
    7: [852, 1209], 8: [852, 1336], 9: [852, 1477], C: [852, 1633],
    '*': [941, 1209], 0: [941, 1336], '#': [941, 1477], D: [941, 1633],
  };
  for (const [k, pair] of Object.entries(expected)) assert.deepEqual(dtmfFreqs(k), pair, k);
  assert.throws(() => dtmfFreqs('E'), RangeError);
});

// --- the modem schedule ------------------------------------------------------------

const RATE = 48000;
const handshake = MODEM_SCHEDULE.filter((s) => MODEM_HANDSHAKE_PHASES.includes(s.phase));
const segsOf = (phase) => MODEM_SCHEDULE.filter((s) => s.phase === phase);
const spanOf = (phase) => MODEM_TIMELINE.find((s) => s.phase === phase);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/** Power of one frequency in a stretch of samples (Goertzel). */
function power(data, from, to, hz) {
  const w = (2 * Math.PI * hz) / RATE;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = from; i < to; i++) {
    const s0 = data[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - c * s1 * s2) / ((to - from) ** 2);
}

/** Largest change between neighbouring samples. */
function maxStep(data) {
  let max = 0;
  for (let i = 1; i < data.length; i++) max = Math.max(max, Math.abs(data[i] - data[i - 1]));
  return max;
}

test('modem: phases in order, gaps included: dial tone ... training hiss', () => {
  assert.deepEqual(MODEM_PHASES, ['dialTone', 'dialing', 'ringback', 'answer', 'fskExchange', 'gap', 'info1', 'probe1',
    'info2', 'probe2', 'toneNoise', 'gap2', 'trainingHiss']);
  assert.deepEqual(MODEM_TIMELINE.map((s) => s.phase), MODEM_PHASES);
  // Segments appear in phase order, each inside its phase's span; gaps are silent.
  const order = [];
  for (const s of MODEM_SCHEDULE) if (order.at(-1) !== s.phase) order.push(s.phase);
  assert.deepEqual(order, MODEM_PHASES.filter((p) => !p.startsWith('gap')));
  for (const s of MODEM_SCHEDULE) {
    const span = spanOf(s.phase);
    assert.ok(s.start >= span.start - 1e-9 && s.start + s.duration <= span.start + span.duration + 1e-9, s.phase);
  }
  // From the answer tone on, each phase starts exactly where the last ended.
  const from = MODEM_PHASES.indexOf('answer');
  for (let i = from + 1; i < MODEM_TIMELINE.length; i++) {
    const prev = MODEM_TIMELINE[i - 1];
    assert.ok(near(MODEM_TIMELINE[i].start, prev.start + prev.duration, 1e-6), MODEM_TIMELINE[i].phase);
  }
});

test('modem: the handshake follows the prototype: phase lengths, 3.49 s in all, after the unchanged dial-in', () => {
  const want = {
    answer: 0.95, fskExchange: 0.65, gap: 0.04, info1: 0.12, probe1: 0.3, info2: 0.09, probe2: 0.3,
    toneNoise: 0.22, gap2: 0.07, trainingHiss: 0.75,
  };
  assert.deepEqual(MODEM_HANDSHAKE_PHASES, Object.keys(want));
  for (const [phase, seconds] of Object.entries(want)) assert.ok(near(spanOf(phase).duration, seconds), phase);
  // The dial tone, DTMF, and ringback keep their timing; the answer tone starts at 1.975 s.
  assert.deepEqual(MODEM_TIMELINE.slice(0, 3).map((s) => [s.phase, s.start, s.duration]),
    [['dialTone', 0, 0.45], ['dialing', 0.57, 0.585], ['ringback', 1.355, 0.5]]);
  assert.equal(spanOf('answer').start, 1.975);
  assert.ok(near(MODEM_DURATION - spanOf('answer').start, 3.49, 1e-6));
  assert.ok(near(MODEM_DURATION, 5.465, 1e-6), String(MODEM_DURATION));
  assert.equal(MODEM_DURATION, scheduleEnd(buildModemSchedule()));
});

test('modem: the tones of each phase', () => {
  const freqsOf = (phase) => segsOf(phase).filter((s) => s.kind === 'tone').map((s) => s.freqs);
  assert.deepEqual(freqsOf('dialTone'), [[350, 440]]);
  assert.deepEqual(freqsOf('ringback'), [[440, 480]]);
  for (const info of ['info1', 'info2']) {
    assert.deepEqual(freqsOf(info), [[1200, 2400, 3600]]);
    assert.deepEqual(segsOf(info)[0].levels, [0.5, 0.25, 0.45]);
  }
  assert.deepEqual(freqsOf('toneNoise'), [[2400]]);
  assert.deepEqual(segsOf('toneNoise').filter((s) => s.kind === 'signal').map((s) => s.signal.type), ['shapedNoise']);
  assert.deepEqual(segsOf('trainingHiss').map((s) => s.signal.type), ['shapedNoise']);
  assert.deepEqual(segsOf('trainingHiss')[0].signal.spectrumDb, HISS_DB);
});

test('answer tone: 2100 Hz, weak 2nd harmonic, phase reversals at 0.45 and 0.90 s, 15 Hz wobble', () => {
  const [answer, caller] = segsOf('answer');
  assert.deepEqual({ ...answer.signal, am: { ...answer.signal.am } }, {
    type: 'answer', duration: 0.95, freq: 2100, h2: 0.12, am: { rate: 15, depth: 0.2 }, reversals: [0.45, 0.9],
  });
  const data = renderSignal(answer.signal, RATE);
  // The sign of the fundamental, one 2100 Hz period at a time: it flips
  // exactly at each reversal and nowhere else.
  const period = RATE / 2100;
  const flips = [];
  let last = 0;
  for (let p = 0; (p + 1) * period <= data.length; p++) {
    const from = Math.round(p * period);
    const to = Math.round((p + 1) * period);
    let dot = 0;
    for (let i = from; i < to; i++) dot += data[i] * Math.sin((2 * Math.PI * 2100 * i) / RATE);
    const sign = Math.sign(dot);
    if (last && sign !== last) flips.push(from / RATE);
    last = sign;
  }
  assert.equal(flips.length, 2, flips.join(' '));
  flips.forEach((t, i) => assert.ok(Math.abs(t - [0.45, 0.9][i]) < 1 / 2100 + 1e-6, `reversal at ${t}`));
  // The envelope (RMS per 2 ms) wobbles at 15 Hz, about 20% deep.
  const block = RATE / 500;
  const env = [];
  for (let i = 0; i + block <= data.length; i += block) {
    let sum = 0;
    for (let j = i; j < i + block; j++) sum += data[j] * data[j];
    env.push(Math.sqrt(sum / block));
  }
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const strength = (hz) => {
    let re = 0;
    let im = 0;
    env.forEach((v, n) => {
      re += (v - mean) * Math.cos((2 * Math.PI * hz * n) / 500);
      im += (v - mean) * Math.sin((2 * Math.PI * hz * n) / 500);
    });
    return Math.hypot(re, im);
  };
  const rates = Array.from({ length: 36 }, (_, i) => i + 5);
  assert.equal(rates.reduce((best, hz) => (strength(hz) > strength(best) ? hz : best)), 15);
  const depth = (Math.max(...env) - Math.min(...env)) / (Math.max(...env) + Math.min(...env));
  assert.ok(depth > 0.15 && depth < 0.25, `depth ${depth}`);
  // No clicks: the reversals fall on zero crossings, so no step is larger
  // than the wave's own steepest slope.
  assert.ok(maxStep(data) <= (2 * Math.PI * 2100 / RATE) * (1 + 2 * 0.12) * 1.2 + 1e-6);
  // The caller's faint FSK joins for the last 0.35 s.
  assert.equal(caller.signal.type, 'fsk');
  assert.deepEqual(caller.signal.freqs, [980, 1180]);
  assert.ok(near(caller.start, answer.start + 0.6) && near(caller.duration, 0.35));
  assert.ok(caller.gain < answer.gain / 4);
});

test('FSK exchange: 1650/1850 Hz with a strong 2nd harmonic over 980/1180 Hz, 300 baud, seeded bits, no clicks', () => {
  const streams = segsOf('fskExchange');
  assert.deepEqual(streams.map((s) => [s.signal.type, s.signal.freqs, s.signal.baud]),
    [['fsk', [1650, 1850], 300], ['fsk', [980, 1180], 300]]);
  assert.equal(streams[0].signal.h2, 0.3);
  assert.ok(streams[1].gain < streams[0].gain / 2, 'the caller is underneath');
  for (const s of [...streams, segsOf('answer')[1]]) {
    const { signal: sig } = s;
    const data = renderSignal(sig, RATE);
    const bits = fskBits(sig.seed, fskBitCount(sig.duration, sig.baud));
    assert.equal(bits.length, Math.ceil(sig.duration * 300));
    assert.ok(bits.includes(0) && bits.includes(1));
    // Each bit's 1/300 s carries the frequency its bit says.
    for (let b = 0; b < bits.length; b++) {
      const from = Math.round((b * RATE) / 300);
      const to = Math.min(data.length, Math.round(((b + 1) * RATE) / 300));
      if (to - from < 100) continue; // a partial last bit
      const [p0, p1] = sig.freqs.map((hz) => power(data, from, to, hz));
      assert.equal(p1 > p0 ? 1 : 0, bits[b], `bit ${b}`);
    }
    // Phase-continuous switching: no step beyond the steepest slope.
    assert.ok(maxStep(data) <= (2 * Math.PI * sig.freqs[1] / RATE) * (1 + 2 * sig.h2) + 1e-6);
  }
});

test('FSK bits come from a seed: the same every time, different for another seed', () => {
  assert.deepEqual(fskBits(42, 200), fskBits(42, 200));
  assert.notDeepEqual(fskBits(42, 200), fskBits(43, 200));
  // Rendered afresh (a new cache key), the samples are identical.
  const sig = segsOf('fskExchange')[0].signal;
  assert.deepEqual(renderSignal({ ...sig, fresh: 1 }, RATE), renderSignal(sig, RATE));
  const hiss = segsOf('trainingHiss')[0].signal;
  assert.deepEqual(renderSignal({ ...hiss, fresh: 1 }, RATE), renderSignal(hiss, RATE));
});

test('line probe: multiples of 150 Hz to 3750 without 900/1200/1800/2400, loudest near 3300 Hz, 6 dB down halfway', () => {
  const expected = [];
  for (let f = 150; f <= 3750; f += 150) if (![900, 1200, 1800, 2400].includes(f)) expected.push(f);
  assert.deepEqual(probeFreqs(150, 3750, [900, 1200, 1800, 2400]), expected);
  const [one] = segsOf('probe1');
  const [two] = segsOf('probe2');
  assert.deepEqual(one.signal, two.signal, 'one chord, played twice');
  assert.deepEqual(one.signal.freqs, expected);
  assert.deepEqual(one.signal.gainsDb, PROBE_GAIN_DB);
  const data = renderSignal(one.signal, RATE);
  const half = Math.round(0.15 * RATE);
  for (const hz of [900, 1200, 1800, 2400]) assert.ok(power(data, 0, half, hz) < power(data, 0, half, 3300) / 1e4, `${hz} skipped`);
  assert.ok(power(data, 0, half, 3300) > power(data, 0, half, 1500) * 10, 'loudest at 3300');
  const rms = (from, to) => Math.sqrt(data.slice(from, to).reduce((a, v) => a + v * v, 0) / (to - from));
  const dropDb = 20 * Math.log10(rms(half, data.length) / rms(0, half));
  assert.ok(Math.abs(dropDb + 6) < 0.2, `drop ${dropDb} dB`);
});

test('training hiss: the measured spectrum (peaks near 1450, 2050, 3450 Hz), fading over its last 0.12 s', () => {
  const [hiss] = segsOf('trainingHiss');
  assert.ok(near(hiss.release, 0.12));
  const data = renderSignal(hiss.signal, RATE);
  const band = (hz) => [-20, -10, 0, 10, 20].reduce((sum, d) => sum + power(data, 0, data.length, hz + d), 0);
  assert.ok(band(3450) > band(3000) * 3 && band(3450) > band(900) * 10, 'peak near 3450 Hz');
  assert.ok(band(1450) > band(1150) * 2, 'peak near 1450 Hz');
});

test('handshake: band-limited to a phone line (250-3900 Hz); the dial-in is not', () => {
  for (const s of handshake) assert.deepEqual(s.band, [250, 3900], s.phase);
  for (const s of MODEM_SCHEDULE.filter((x) => !handshake.includes(x))) assert.equal(s.band, undefined, s.phase);
});

test('modem: dials 3-4-6-8 ("DIM8") with DTMF pairs, realistic tone and gap lengths', () => {
  const digits = MODEM_SCHEDULE.filter((s) => s.phase === 'dialing');
  assert.deepEqual(digits.map((s) => s.digit), ['3', '4', '6', '8']);
  assert.deepEqual(digits.map((s) => s.freqs), [[697, 1477], [770, 1209], [770, 1477], [852, 1336]]);
  for (const s of digits) {
    // An exchange needs at least 40 ms of tone; auto-diallers use 50-100 ms.
    assert.ok(s.duration >= 0.05 && s.duration <= 0.1, `tone ${s.duration}`);
  }
  for (let i = 1; i < digits.length; i++) {
    const gap = digits[i].start - (digits[i - 1].start + digits[i - 1].duration);
    assert.ok(gap >= 0.04 && gap <= 0.1, `gap ${gap}`);
  }
});

test('modem: no two tones overlap within a phase', () => {
  for (const phase of MODEM_PHASES) {
    const tones = MODEM_SCHEDULE.filter((s) => s.phase === phase && s.kind === 'tone');
    for (let i = 0; i < tones.length; i++) {
      for (let j = i + 1; j < tones.length; j++) {
        assert.equal(overlaps(tones[i], tones[j]), false, `${phase} ${i}/${j}`);
      }
    }
  }
});

test('handshake: frequencies switch (FSK) but never sweep: no glides or vibrato anywhere', () => {
  for (const s of MODEM_SCHEDULE) assert.equal(s.sweepTo, undefined, `glide in ${s.phase}`);
  for (const s of handshake.filter((x) => x.kind === 'tone')) assert.equal(s.am, undefined, `warble in ${s.phase}`);
  // Every FSK stream uses exactly two fixed frequencies.
  for (const s of handshake.filter((x) => x.signal?.type === 'fsk')) assert.equal(new Set(s.signal.freqs).size, 2);
});

test('modem: every segment playable, and the call ends with a fade, not a cut', () => {
  for (const s of MODEM_SCHEDULE) assert.deepEqual(segmentProblems(s), [], JSON.stringify(s).slice(0, 200));
  const last = MODEM_SCHEDULE.filter((s) => near(s.start + s.duration, MODEM_DURATION));
  assert.ok(last.length > 0 && last.every((s) => s.release >= 0.1));
});

test('schedule helpers: overlap, end, and problems', () => {
  assert.equal(overlaps(tone(0, 1, [440]), tone(1, 1, [440])), false, 'touching is not overlapping');
  assert.equal(overlaps(tone(0, 1, [440]), tone(0.5, 1, [440])), true);
  assert.equal(scheduleEnd([]), 0);
  assert.ok(segmentProblems(tone(0, 0, [440])).length > 0);
  assert.ok(segmentProblems(tone(0, 1, [440], { gain: 2 })).length > 0);
  assert.ok(segmentProblems(tone(0, 0.01, [440], { attack: 0.01, release: 0.01 })).length > 0);
});

// --- effects ---------------------------------------------------------------------

test('effects: every hooked event has a table entry that builds a playable sound', () => {
  assert.deepEqual(Object.keys(EVENT_EFFECTS).sort(),
    ['bankComplete', 'chipsEarned', 'clearStarted', 'gameOver', 'locked', 'rotated']);
  for (const [type, name] of Object.entries(EVENT_EFFECTS)) {
    assert.ok(EFFECTS[name], `${type} -> ${name}`);
    assert.equal(effectForEvent({ type }), name);
    const segments = buildEffect(name, { type, count: 3 });
    assert.ok(segments.length > 0, name);
    for (const s of segments) assert.deepEqual(segmentProblems(s), [], `${name} ${JSON.stringify(s)}`);
  }
  // Played directly by js/audio/index.js rather than through EVENT_EFFECTS.
  for (const [name, event] of [['hangUp', {}], ['tally', { steps: 8, stepMs: 60 }], ['tallyDone', {}], ['chips', { count: 5, fullWord: true }]]) {
    assert.ok(EFFECTS[name], name);
    for (const s of buildEffect(name, event)) assert.deepEqual(segmentProblems(s), [], `${name} ${JSON.stringify(s)}`);
  }
  // Moves (and anything else) are silent; so is fullWord itself (its
  // flourish is in the chips sound).
  for (const type of ['spawned', 'linesCleared', 'scoreChanged', 'moved', 'fullWord', 'chipsCashed', 'chipsLost']) {
    assert.equal(effectForEvent({ type }), null, type);
  }
  assert.throws(() => buildEffect('nope'), RangeError);
});

test('effects: the rotation tick is quieter and shorter than the lock click', () => {
  const peak = (name) => Math.max(...buildEffect(name).map((s) => s.gain));
  assert.ok(peak('rotate') < peak('lock') / 2);
  assert.ok(scheduleEnd(buildEffect('rotate')) < scheduleEnd(buildEffect('lock')));
  assert.ok(scheduleEnd(buildEffect('lock')) <= 0.06, 'lock is a short click');
});

test('effects: line clear chirps rise, and more lines go higher and longer', () => {
  let prev = null;
  for (let count = 1; count <= 5; count++) {
    const [chirp] = buildEffect('lineClear', { count });
    assert.ok(chirp.sweepTo[0] > chirp.freqs[0], 'rising');
    if (prev) {
      assert.ok(chirp.freqs[0] > prev.freqs[0] && chirp.sweepTo[0] > prev.sweepTo[0], `higher at ${count}`);
      assert.ok(chirp.duration > prev.duration, `longer at ${count}`);
    }
    prev = chirp;
  }
  assert.ok(scheduleEnd(buildEffect('lineClear', { count: 5 })) < 0.3, 'still short');
});

/** A run of notes rises, one note after another. */
function assertRisingRun(notes) {
  for (let i = 1; i < notes.length; i++) {
    assert.ok(notes[i].freqs[0] > notes[i - 1].freqs[0], 'rising');
    assert.ok(notes[i].start >= notes[i - 1].start + notes[i - 1].duration - 1e-9, 'one after another');
  }
}

test('chips: a quick, bright rising square-wave arpeggio; more chips run longer and higher', () => {
  let prev = null;
  for (const count of [1, 2, 3]) {
    const notes = buildEffect('chips', { count });
    assert.ok(notes.every((s) => s.kind === 'tone' && s.wave === 'square'));
    assertRisingRun(notes);
    if (prev) {
      assert.ok(notes.length > prev.length, `more notes at ${count}`);
      assert.ok(notes.at(-1).freqs[0] > prev.at(-1).freqs[0], `higher at ${count}`);
      assert.ok(scheduleEnd(notes) > scheduleEnd(prev), `longer at ${count}`);
    }
    prev = notes;
  }
  assert.ok(scheduleEnd(buildEffect('chips', { count: 3 })) < 0.4, 'quick');
});

test('chips: on a FULL WORD the flourish and the chip reward are one sound', () => {
  const reward = buildEffect('chips', { count: 5, fullWord: true });
  assertRisingRun(reward);
  // The whole two-octave run, ending at the old FULL WORD top note (C7), held longer.
  assert.equal(reward.length, EFFECTS.chips.ladderHz.length);
  assert.equal(reward.at(-1).freqs[0], 2093);
  assert.equal(reward.at(-1).duration, EFFECTS.chips.fullWordLastNoteTime);
  assert.ok(reward.at(-1).duration > buildEffect('chips', { count: 3 }).at(-1).duration);
  assert.ok(scheduleEnd(reward) < 0.6);
  assert.equal(EFFECTS.fullWord, undefined, 'no separate FULL WORD sound to clash with it');
});

test('chips play when awarded, after the line clear chirp has finished', () => {
  // The chirp starts with clearStarted; chips are awarded with linesCleared,
  // lineClearDelayMs later. Every chirp must be over by then.
  for (let count = 2; count <= 5; count++) {
    assert.ok(scheduleEnd(buildEffect('lineClear', { count })) * 1000 < DEFAULT_CONFIG.lineClearDelayMs, `${count} lines`);
  }
});

test('tally: one blip per step, each a little higher, then the done tone, all inside the READY moment', () => {
  const stepMs = SCREENS.chipTallyStepMs;
  const steps = tallySteps(20, SCREENS.chipTallyMaxSteps);
  assert.equal(steps, SCREENS.chipTallyMaxSteps, 'rate-limited');
  const sound = buildEffect('tally', { steps, stepMs });
  const blips = sound.slice(0, steps);
  assert.equal(blips.length, steps);
  blips.forEach((b, i) => {
    assert.ok(Math.abs(b.start - ((i + 1) * stepMs) / 1000) < 1e-9, 'in step with the number');
    assert.ok(b.duration < stepMs / 1000, 'separate blips, never a buzz');
    if (i > 0) assert.ok(b.freqs[0] > blips[i - 1].freqs[0]);
  });
  const done = sound.slice(steps);
  assert.ok(Math.abs(done[0].start - tallyDoneAtMs(steps, stepMs) / 1000) < 1e-9);
  assert.deepEqual(done.map((s) => s.freqs), buildEffect('tallyDone').map((s) => s.freqs));
  assert.ok(scheduleEnd(sound) * 1000 <= SCREENS.bankReadyMs, `${scheduleEnd(sound)} s`);
  // Computer sounds, not a cash register: tones only, no noise.
  for (const name of ['chips', 'tally', 'tallyDone']) {
    assert.ok(buildEffect(name, { count: 3, steps: 3, stepMs }).every((s) => s.kind === 'tone'), name);
  }
});

test('tally count-up: steps per chip up to a limit, rising to the full cash-in', () => {
  assert.equal(tallySteps(0, 8), 0);
  assert.equal(tallySteps(3, 8), 3);
  assert.equal(tallySteps(12, 8), 8);
  const points = 3 * 256 * 2;
  assert.deepEqual([-1, 0, 59, 60, 120, 180, 1000].map((t) => tallyValue(points, 3, 60, t)), [0, 0, 0, 512, 1024, 1536, 1536]);
  assert.equal(tallyValue(points, 0, 60, 0), points, 'no steps: the whole value');
  for (let t = 0; t < 600; t += 7) assert.ok(Number.isInteger(tallyValue(1000, 7, 60, t)));
});

test('effects: game over is a busy signal, 480 + 620 Hz, 0.5 s on / 0.5 s off, 3 times', () => {
  const busy = buildEffect('busy');
  assert.equal(busy.length, 3);
  busy.forEach((s, i) => {
    assert.deepEqual(s.freqs, [480, 620]);
    assert.equal(s.duration, 0.5);
    assert.equal(s.start, i);
  });
});

// --- transition length ---------------------------------------------------------------

test('transition: the modem plus the READY moment with sound on; 4000 ms, READY included, with it off', () => {
  const screens = { silentMs: SCREENS.bankTransitionMs, readyMs: SCREENS.bankReadyMs };
  assert.equal(SCREENS.bankTransitionMs, 4000);
  assert.equal(SCREENS.bankReadyMs, 900);
  const off = transitionTiming(false, screens);
  assert.deepEqual(off, { readyAtMs: 4000 - 900, durationMs: 4000 });
  const on = transitionTiming(true, screens);
  // READY appears as the call ends (never over it), then the READY moment.
  assert.equal(on.readyAtMs, 5765);
  assert.ok(on.readyAtMs >= (MODEM_LEAD_IN + MODEM_DURATION) * 1000 - 1e-6);
  assert.equal(on.durationMs, on.readyAtMs + SCREENS.bankReadyMs);
  assert.equal(on.durationMs, 6665);
  // The skip rule is unchanged, and skipping is possible well before the end.
  assert.equal(SCREENS.bankTransitionSkipAfterMs, 750);
  assert.ok(SCREENS.bankSkipReadyMs > 0 && SCREENS.bankSkipReadyMs < SCREENS.bankReadyMs);
  // Music has faded out before the first dial tone.
  assert.ok(MUSIC_FADES.bankEnd <= MODEM_LEAD_IN);
});

// --- playlist ------------------------------------------------------------------------

test('playlist: bank 1 plays the first track, each bank the next, cycling', () => {
  assert.equal(trackForBank(1, 7), 0);
  assert.equal(trackForBank(2, 7), 1);
  assert.equal(trackForBank(7, 7), 6);
  assert.equal(trackForBank(8, 7), 0);
  assert.equal(trackForBank(16, 7), 1);
  assert.equal(trackForBank(5, 1), 0);
});

test('playlist: empty means no music, never an error', () => {
  assert.equal(trackForBank(1, 0), null);
  assert.deepEqual(musicTarget({ screen: 'playing', musicOn: true, bank: 3, count: 0 }), { play: false, track: null });
  assert.deepEqual(tracksToKeep(null, 0), []);
});

test('music plays during gameplay only, and only when switched on', () => {
  for (const screen of ['start', 'paused', 'settings', 'transition', 'gameOver']) {
    assert.equal(musicTarget({ screen, musicOn: true, bank: 1, count: 7 }).play, false, screen);
  }
  assert.deepEqual(musicTarget({ screen: 'playing', musicOn: true, bank: 2, count: 7 }), { play: true, track: 1 });
  assert.deepEqual(musicTarget({ screen: 'playing', musicOn: false, bank: 2, count: 7 }), { play: false, track: null });
  // Not playing yet, but the bank's track is named so it can be decoded ahead.
  assert.deepEqual(musicTarget({ screen: 'transition', musicOn: true, bank: 3, count: 7 }), { play: false, track: 2 });
});

test('memory: at most the current track and the next stay decoded', () => {
  assert.deepEqual(tracksToKeep(0, 7), [0, 1]);
  assert.deepEqual(tracksToKeep(6, 7), [6, 0]);
  assert.deepEqual(tracksToKeep(0, 1), [0]);
  for (let i = 0; i < 7; i++) assert.ok(tracksToKeep(i, 7).length <= 2);
});

test('loop points: whole buffer when the decoder trimmed MP3 padding', () => {
  const track = { frames: 441000, sampleRate: 44100 };
  assert.deepEqual(loopPoints({ decodedFrames: 441000, sampleRate: 44100, track }), { loopStart: 0, loopEnd: 10, trimmed: false });
  // Decoded at 48 kHz (phones), give or take a sample from resampling.
  const at48 = loopPoints({ decodedFrames: 480001, sampleRate: 48000, track });
  assert.equal(at48.loopStart, 0);
  assert.equal(at48.trimmed, false);
});

test('loop points: skip priming and padding when the decoder kept them', () => {
  const track = { frames: 441000, sampleRate: 44100 };
  // Priming at the start, padding to a whole 1152-sample frame at the end.
  const total = Math.ceil((441000 + MP3_PRIMING_FRAMES) / 1152) * 1152 + 1152;
  const p = loopPoints({ decodedFrames: total, sampleRate: 44100, track });
  assert.equal(p.trimmed, true);
  assert.equal(p.loopStart, MP3_PRIMING_FRAMES / 44100);
  assert.equal(Math.round((p.loopEnd - p.loopStart) * 44100), 441000, 'exactly the original length');
  // Same at 48 kHz, scaled.
  const q = loopPoints({ decodedFrames: Math.round(total * 48000 / 44100), sampleRate: 48000, track });
  assert.equal(q.trimmed, true);
  assert.equal(Math.round((q.loopEnd - q.loopStart) * 48000), 480000);
});

test('tracks: every playlist file exists, is in assets/music, and is credited', () => {
  const credits = readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(TRACKS.length > 0);
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, TRACKS.length);
  for (const t of TRACKS) {
    assert.match(t.url, /^assets\/music\/[a-z0-9-]+\.mp3$/);
    assert.ok(statSync(new URL(`../${t.url}`, import.meta.url)).size > 0, t.url);
    assert.ok(credits.includes(t.url), `CREDITS.md lists ${t.url}`);
    assert.ok(Number.isInteger(t.frames) && t.frames > 0 && t.sampleRate === 44100);
  }
  // Only the first track is pre-cached with the app shell.
  assert.ok(sw.includes(`'./${TRACKS[0].url}'`));
  for (const t of TRACKS.slice(1)) assert.ok(!sw.includes(`'./${t.url}'`), t.url);
});

test('rewards stand above the lock click and the line chirp (playtest pass 2)', () => {
  const loudest = (name, event) => Math.max(...buildEffect(name, event).map((s) => s.gain));
  for (const [name, event] of [['chips', { count: 1 }], ['tally', { steps: 3, stepMs: 60 }], ['tallyDone', {}]]) {
    assert.ok(loudest(name, event) > loudest('lock') * 1.3, `${name} over the lock click`);
    assert.ok(loudest(name, event) > loudest('lineClear', { count: 5 }) * 2, `${name} over the chirp`);
    // Each note is doubled an octave up, for presence over the music.
    assert.ok(buildEffect(name, event).every((s) => s.freqs.length === 2 && s.freqs[1] === s.freqs[0] * 2), name);
  }
});
