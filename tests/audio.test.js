/**
 * tests/audio.test.js - The pure side of sound (Stage 5): DTMF table, the
 * modem schedule, the effect table, the playlist, loop points, the memory
 * rule, and the bank transition timing; the longer handshake, the reward
 * sounds, and the chip tally (playtest pass 1). No Web Audio needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DTMF_ROW_HZ, DTMF_COL_HZ, dtmfFreqs, MODEM, MODEM_PHASES, MODEM_HANDSHAKE_PARTS, MODEM_SCHEDULE,
  MODEM_DURATION, MODEM_LEAD_IN, buildModemSchedule, transitionTiming,
} from '../js/audio/modem.js';
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

test('modem: phases play in order: dial tone, dialling, ringback, answer, handshake', () => {
  const order = [];
  for (const s of MODEM_SCHEDULE) if (order.at(-1) !== s.phase) order.push(s.phase);
  assert.deepEqual(order, MODEM_PHASES);
  assert.deepEqual(MODEM_PHASES, ['dialTone', 'dialing', 'ringback', 'answer', 'handshake']);
  // Each phase starts after the previous one has finished.
  const spans = MODEM_PHASES.map((phase) => {
    const segs = MODEM_SCHEDULE.filter((s) => s.phase === phase);
    return { start: Math.min(...segs.map((s) => s.start)), end: scheduleEnd(segs) };
  });
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i].start >= spans[i - 1].end - 1e-9, MODEM_PHASES[i]);
});

test('modem: the tones of each phase', () => {
  const freqsOf = (phase) => MODEM_SCHEDULE.filter((s) => s.phase === phase && s.kind === 'tone').map((s) => s.freqs);
  assert.deepEqual(freqsOf('dialTone'), [[350, 440]]);
  assert.deepEqual(freqsOf('ringback'), [[440, 480]]);
  assert.deepEqual(freqsOf('answer'), [[2100]]);
  const handshake = MODEM_SCHEDULE.filter((s) => s.phase === 'handshake');
  assert.ok(handshake.some((s) => s.kind === 'tone' && s.freqs.includes(1200) && s.freqs.includes(2400)), 'both carriers');
  assert.ok(handshake.filter((s) => s.kind === 'noise').length >= 2, 'noise bursts');
  assert.ok(handshake.every((s) => s.kind !== 'noise' || s.part === 'settle' || s.filter.type === 'bandpass'), 'filtered noise');
});

/** Start, end, and segments of each handshake part. */
function handshakeParts() {
  return MODEM_HANDSHAKE_PARTS.map((part) => {
    const segs = MODEM_SCHEDULE.filter((s) => s.part === part);
    return { part, segs, start: Math.min(...segs.map((s) => s.start)), end: scheduleEnd(segs) };
  });
}

test('handshake: about 2.7 s in four parts, in order, that develop rather than repeat', () => {
  assert.deepEqual(MODEM_HANDSHAKE_PARTS, ['carrierExchange', 'scrambled', 'training', 'settle']);
  const handshake = MODEM_SCHEDULE.filter((s) => s.phase === 'handshake');
  assert.ok(handshake.every((s) => MODEM_HANDSHAKE_PARTS.includes(s.part)), 'every handshake segment belongs to a part');
  const parts = handshakeParts();
  const length = parts.at(-1).end - parts[0].start;
  assert.ok(length >= 2.5 && length <= 3, `handshake ${length}`);
  for (let i = 1; i < parts.length; i++) {
    assert.ok(Math.abs(parts[i].start - parts[i - 1].end) < 1e-9, `${parts[i].part} follows ${parts[i - 1].part}`);
  }
  const lengths = Object.fromEntries(parts.map((p) => [p.part, p.end - p.start]));
  // Roughly the specified lengths: 0.5, 1.2, 0.7, 0.3 s.
  for (const [part, want] of Object.entries({ carrierExchange: 0.5, scrambled: 1.2, training: 0.7, settle: 0.3 })) {
    assert.ok(Math.abs(lengths[part] - want) <= 0.1, `${part} ${lengths[part]}`);
  }
  const [exchange, scrambled, training, settle] = parts;
  // Carrier exchange: steady 1200 + 2400 Hz, then an unscrambled tone pattern.
  assert.deepEqual(exchange.segs[0].freqs, [1200, 2400]);
  assert.ok(exchange.segs.slice(1).length >= 4 && exchange.segs.slice(1).every((s) => s.kind === 'tone'));
  // Scrambled: a warbling, drifting carrier under noise bursts whose centre keeps moving.
  const warble = scrambled.segs.filter((s) => s.kind === 'tone');
  assert.ok(warble.length >= 2 && warble.every((s) => s.am && s.sweepTo));
  const centres = scrambled.segs.filter((s) => s.kind === 'noise').map((s) => s.filter.freq);
  assert.ok(centres.length >= 4 && new Set(centres).size === centres.length, 'shifting tone, not one repeated burst');
  // Training: broader (lower Q) and smoother (slower edges) than the screech.
  const hiss = training.segs.find((s) => s.kind === 'noise');
  const bursts = scrambled.segs.filter((s) => s.kind === 'noise');
  assert.ok(hiss.filter.q < Math.min(...bursts.map((s) => s.filter.q)));
  assert.ok(hiss.attack > Math.max(...bursts.map((s) => s.attack)));
  // Settle: a near-silent hush.
  const peak = (segs) => Math.max(...segs.map((s) => s.gain));
  assert.ok(peak(settle.segs) < peak(scrambled.segs) / 5);
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

test('modem: 5 to 5.5 seconds long, ends cleanly, every segment playable', () => {
  assert.ok(MODEM_DURATION >= 5 && MODEM_DURATION <= 5.5, String(MODEM_DURATION));
  // The phases before the handshake keep their Stage 5 timing.
  const answer = MODEM_SCHEDULE.find((s) => s.phase === 'answer');
  assert.ok(Math.abs(answer.start + answer.duration - 2.575) < 1e-9);
  assert.equal(MODEM_DURATION, scheduleEnd(buildModemSchedule()));
  for (const s of MODEM_SCHEDULE) assert.deepEqual(segmentProblems(s), [], JSON.stringify(s));
  // Whatever is still sounding at the very end fades out (no cut-off click).
  const last = MODEM_SCHEDULE.filter((s) => Math.abs(s.start + s.duration - MODEM_DURATION) < 1e-9);
  assert.ok(last.length > 0 && last.every((s) => s.release >= MODEM.handshake.release));
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
  assert.equal(on.readyAtMs, Math.ceil((MODEM_LEAD_IN + MODEM_DURATION) * 1000));
  assert.ok(on.readyAtMs >= (MODEM_LEAD_IN + MODEM_DURATION) * 1000);
  assert.equal(on.durationMs, on.readyAtMs + SCREENS.bankReadyMs);
  assert.equal(on.durationMs, 6475);
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
