/**
 * tests/audio-facade.test.js - What js/audio/index.js plays for each hook
 * event, against a fake AudioContext (playtest pass 1): chip rewards, the
 * READY tally only after the modem, the hang-up and done tone on a skip,
 * and the transition timing it reports.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../js/audio/index.js';
import { EFFECTS } from '../js/audio/sfx.js';
import { MODEM_LEAD_IN, MODEM_DURATION } from '../js/audio/modem.js';

/** An audio param that ignores automation. */
const param = () => ({
  value: 1,
  setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
});

/**
 * A fake window with an AudioContext that records every oscillator start
 * (Hz and time), so tests can tell which sound played when.
 */
function fakeWindow() {
  const started = [];
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

    createGain() { return this.node(); }

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
  return { win: { AudioContext: FakeContext, navigator: {} }, started };
}

/** An on/off setting. */
const setting = (value) => ({ get: () => value, onChange() {} });

function setup({ sfx = 'on' } = {}) {
  const { win, started } = fakeWindow();
  const audio = createAudio({
    settings: { music: setting('off'), sfx: setting(sfx) },
    tracks: [],
    fetchBytes: () => Promise.reject(new Error('no music in tests')),
    win,
  });
  audio.unlock();
  const freqsSince = (i) => started.slice(i).map((s) => s.hz);
  return { audio, started, freqsSince };
}

const HANG_UP_HZ = 1800; // its click is noise; its thump a 90 Hz triangle
const DONE = EFFECTS.tallyDone.notes;

test('chips earned plays the arpeggio; FULL WORD alone is silent (it is part of the chips sound)', () => {
  const { audio, started, freqsSince } = setup();
  audio.onEvent({ type: 'fullWord', bank: 1 });
  assert.equal(started.length, 0);
  audio.onEvent({ type: 'chipsEarned', count: 5, total: 5, fullWord: true });
  assert.deepEqual(freqsSince(0), EFFECTS.chips.ladderHz);
});

test('READY on time: the tally (blips, then done) plays; with no chips, nothing', () => {
  const { audio, started, freqsSince } = setup();
  audio.onEvent({ type: 'bankReady', bank: 2, count: 0, points: 0, steps: 0, stepMs: 60, skipped: false });
  assert.equal(started.length, 0);
  audio.onEvent({ type: 'bankReady', bank: 2, count: 3, points: 768, steps: 3, stepMs: 60, skipped: false });
  const freqs = freqsSince(0);
  assert.equal(freqs.length, 3 + 3, 'three blips, then the two-note done tone (its last note has two tones)');
  assert.deepEqual(freqs.slice(3), [DONE[0], DONE[1], DONE[1] * 2]);
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
  assert.deepEqual(after.slice(1), [DONE[0], DONE[1], DONE[1] * 2]);
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
  assert.equal(on.readyAtMs, Math.ceil((MODEM_LEAD_IN + MODEM_DURATION) * 1000));
  assert.equal(on.durationMs, on.readyAtMs + 900);
});
