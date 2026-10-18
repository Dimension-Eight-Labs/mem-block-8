/**
 * tests/audio-facade.test.js - What js/audio/index.js plays for each hook
 * event, against a fake AudioContext (playtest pass 1): chip rewards, the
 * READY tally only after the modem, the hang-up and done tone on a skip,
 * and the transition timing it reports; the music duck under rewards, and
 * the sound log for ?debug=1 (playtest pass 2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../js/audio/index.js';
import { EFFECTS, buildEffect } from '../js/audio/sfx.js';
import { MIX } from '../js/audio/context.js';
import { formatSound } from '../js/ui/debug.js';
import { MODEM_LEAD_IN, MODEM_DURATION } from '../js/audio/modem.js';

/** An audio param that records its automation calls (it does not compute them). */
const param = () => {
  const p = { value: 1, calls: [] };
  for (const name of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'cancelScheduledValues']) {
    p[name] = (...args) => { p.calls.push([name, ...args]); };
  }
  return p;
};

/**
 * A fake window with an AudioContext that records every oscillator start
 * (Hz and time), so tests can tell which sound played when.
 */
function fakeWindow() {
  const started = [];
  const gains = [];
  class FakeContext {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = {};
    }

    node() {
      return { connect() {}, disconnect() {}, gain: param(), frequency: param(), Q: param(), start() {}, stop() {} };
    }

    createGain() {
      const g = this.node();
      gains.push(g);
      return g;
    }

    createBiquadFilter() { return this.node(); }

    createBuffer(channels, length) { return { length, getChannelData: () => new Float32Array(length) }; }

    createBufferSource() { return this.node(); }

    createOscillator() {
      const osc = this.node();
      osc.frequency = { ...param(), setValueAtTime: (hz) => { osc.hz = hz; } };
      osc.start = (when) => started.push({ hz: osc.hz, when });
      return osc;
    }

    resume() { return Promise.resolve(); }

    suspend() { return Promise.resolve(); }
  }
  return { win: { AudioContext: FakeContext, navigator: {}, performance: { now: () => 1000 } }, started, gains };
}

/** An on/off setting. */
const setting = (value) => ({ get: () => value, onChange() {} });

function setup({ sfx = 'on' } = {}) {
  const { win, started, gains } = fakeWindow();
  const sounds = [];
  const audio = createAudio({
    settings: { music: setting('off'), sfx: setting(sfx) },
    tracks: [],
    fetchBytes: () => Promise.reject(new Error('no music in tests')),
    win,
    onSound: (record) => sounds.push(record),
  });
  audio.unlock();
  const freqsSince = (i) => started.slice(i).map((s) => s.hz);
  // The music bus: the gain node set to the music mix level (js/audio/context.js).
  const musicGain = () => gains.find((g) => g.gain.value === MIX.music).gain;
  return { audio, started, freqsSince, sounds, musicGain };
}

/** Every frequency a sound starts, in order. */
const freqsOf = (name, event) => buildEffect(name, event).flatMap((s) => s.freqs);

const HANG_UP_HZ = 1800; // its click is noise; its thump a 90 Hz triangle
const DONE = freqsOf('tallyDone');

test('chips earned plays the arpeggio; FULL WORD alone is silent (it is part of the chips sound)', () => {
  const { audio, started, freqsSince } = setup();
  audio.onEvent({ type: 'fullWord', bank: 1 });
  assert.equal(started.length, 0);
  audio.onEvent({ type: 'chipsEarned', count: 5, total: 5, fullWord: true });
  assert.deepEqual(freqsSince(0), EFFECTS.chips.ladderHz.flatMap((hz) => [hz, hz * 2]), 'each note doubled an octave up');
});

test('READY on time: the tally (blips, then done) plays; with no chips, nothing', () => {
  const { audio, started, freqsSince } = setup();
  audio.onEvent({ type: 'bankReady', bank: 2, count: 0, points: 0, steps: 0, stepMs: 60, skipped: false });
  assert.equal(started.length, 0);
  audio.onEvent({ type: 'bankReady', bank: 2, count: 3, points: 768, steps: 3, stepMs: 60, skipped: false });
  assert.deepEqual(freqsSince(0), freqsOf('tally', { steps: 3, stepMs: 60 }));
  assert.deepEqual(freqsSince(0).slice(-DONE.length), DONE, 'three blips, then the done tone');
});

test('a skip mid-call hangs up the modem, then plays only the done tone', () => {
  const { audio, started, freqsSince } = setup();
  audio.onEvent({ type: 'bankComplete', fromBank: 1, toBank: 2 });
  const modemTones = started.length;
  assert.ok(modemTones > 10, 'the modem is scheduled');
  audio.onEvent({ type: 'screen', screen: 'transition', from: 'playing', bank: 2 });
  audio.onEvent({ type: 'bankReady', bank: 2, count: 3, points: 768, steps: 3, stepMs: 60, skipped: true });
  const after = freqsSince(modemTones);
  // Hang-up thump (90 Hz) first, then the done tone, and no blips.
  assert.equal(after[0], EFFECTS.hangUp.thumpHz);
  assert.deepEqual(after.slice(1), DONE);
  const done = started.slice(modemTones + 1);
  assert.ok(done[0].when > 0, 'the done tone waits a moment after the click');
  // Leaving the transition afterwards does not hang up a second time.
  audio.onEvent({ type: 'screen', screen: 'playing', from: 'transition', bank: 2 });
  assert.equal(started.length, modemTones + after.length);
  assert.ok(!after.includes(HANG_UP_HZ));
});

test('transition timing follows the sound effects setting', () => {
  const screens = { silentMs: 4000, readyMs: 900 };
  assert.deepEqual(setup({ sfx: 'off' }).audio.transitionTiming(screens), { readyAtMs: 3100, durationMs: 4000 });
  const on = setup().audio.transitionTiming(screens);
  assert.equal(on.readyAtMs, 5575);
  assert.ok(Math.abs(on.readyAtMs - (MODEM_LEAD_IN + MODEM_DURATION) * 1000) < 1);
  assert.equal(on.durationMs, on.readyAtMs + 900);
});

// --- the music duck and the sound log (playtest pass 2) ---------------------------------

const LOW = MIX.music * 10 ** (EFFECTS.duck.db / 20);

test('duck settings live in the effects table: about -10 dB, 30 ms down, 250 ms back, rewards only', () => {
  assert.deepEqual({ db: EFFECTS.duck.db, attack: EFFECTS.duck.attack, release: EFFECTS.duck.release }, { db: -10, attack: 0.03, release: 0.25 });
  assert.deepEqual([...EFFECTS.duck.effects].sort(), ['chips', 'tally', 'tallyDone']);
});

test('a reward ducks the music and brings it back after the sound', () => {
  for (const [event, name] of [
    [{ type: 'chipsEarned', count: 2, total: 2, fullWord: false }, 'chips'],
    [{ type: 'chipsEarned', count: 5, total: 5, fullWord: true }, 'chips'],
    [{ type: 'bankReady', bank: 2, count: 3, points: 768, steps: 3, stepMs: 60, skipped: false }, 'tally'],
  ]) {
    const { audio, musicGain } = setup();
    audio.onEvent(event);
    const calls = musicGain().calls;
    const ramps = calls.filter((c) => c[0] === 'linearRampToValueAtTime');
    assert.equal(ramps.length, 2, name);
    const [down, up] = ramps;
    assert.ok(Math.abs(down[1] - LOW) < 1e-9 && Math.abs(down[2] - EFFECTS.duck.attack) < 1e-9, `${name}: down by 10 dB in 30 ms`);
    const end = buildEffect(name, event).reduce((m, s) => Math.max(m, s.start + s.duration), 0);
    assert.equal(up[1], MIX.music, `${name}: back to the mix level`);
    assert.ok(Math.abs(up[2] - (end + EFFECTS.duck.release)) < 1e-9, `${name}: released after the sound ends`);
  }
});

test('other sounds never duck the music', () => {
  const { audio, musicGain } = setup();
  for (const event of [{ type: 'locked' }, { type: 'rotated', direction: 1 }, { type: 'clearStarted', count: 2 },
    { type: 'bankComplete', fromBank: 1, toBank: 2 }, { type: 'gameOver' }, { type: 'fullWord', bank: 1 }]) {
    audio.onEvent(event);
  }
  assert.deepEqual(musicGain().calls, []);
  assert.equal(musicGain().value, MIX.music);
});

test('the chirp and the chips both play when they land in the same tick', () => {
  const { audio, freqsSince, sounds } = setup();
  audio.onEvent({ type: 'clearStarted', count: 2 });
  audio.onEvent({ type: 'linesCleared', count: 2 });
  audio.onEvent({ type: 'chipsEarned', count: 1, total: 1, fullWord: false });
  assert.deepEqual(sounds.map((r) => [r.name, r.played]), [['lineClear', true], ['chips', true]]);
  assert.deepEqual(freqsSince(0), [...freqsOf('lineClear', { count: 2 }), ...freqsOf('chips', { count: 1 })]);
});

test('chips after the page was hidden and shown again still play; while hidden they are logged as not played', () => {
  const { audio, sounds } = setup();
  const chips = { type: 'chipsEarned', count: 1, total: 1, fullWord: false };
  audio.setHidden(true);
  audio.onEvent(chips);
  audio.setHidden(false);
  audio.onEvent(chips);
  assert.deepEqual(sounds.map((r) => [r.played, r.reason ?? '']), [[false, 'hidden'], [true, '']]);
  assert.equal(sounds[1].ducked, true);
});

test('debug log lines: played (context state, duck) or why not', () => {
  assert.equal(formatSound({ name: 'chips', t: 1250, played: true, state: 'running', ducked: true }, 1000), ' +250 SFX chips (running duck)');
  assert.equal(formatSound({ name: 'lock', t: 10, played: true, state: 'suspended' }, null), '      SFX lock (suspended)');
  assert.equal(formatSound({ name: 'chips', t: 30, played: false, state: 'none', reason: 'sfx off' }, 10), '  +20 SFX chips (NOT PLAYED: sfx off)');
});
