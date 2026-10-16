/**
 * tests/music-player.test.js - The music player against a fake AudioContext
 * (Stage 5): failed tracks are skipped quietly, at most two tracks stay
 * decoded, pause and resume keep the position, and an empty playlist is
 * silent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicPlayer } from '../js/audio/player.js';

/** Just enough of an AudioContext for the player. */
function fakeOutput() {
  const sources = [];
  const param = () => ({
    value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {},
  });
  const ctx = {
    currentTime: 0,
    createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
    createBufferSource() {
      const src = { started: null, stopped: false, connect() {}, start(when, offset) { src.started = { when, offset }; }, stop() { src.stopped = true; } };
      sources.push(src);
      return src;
    },
    decodeAudioData: (data, ok) => {
      const buffer = { length: data.frames, sampleRate: 44100, id: data.id };
      ok(buffer);
      return Promise.resolve(buffer);
    },
  };
  return {
    ctx,
    sources,
    output: { get: () => ctx, musicBus: () => ({}), isReady: () => true },
  };
}

const tracks = ['a', 'b', 'c', 'd'].map((id) => ({ id, url: `${id}.mp3`, title: id, author: 'x', frames: 441000, sampleRate: 44100 }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const bytes = (url) => Promise.resolve({ id: url, frames: 441000 });

test('a track that fails to load is skipped quietly; others still play', async () => {
  const { output, sources } = fakeOutput();
  const player = createMusicPlayer({
    output, tracks, fetchBytes: (url) => (url === 'a.mp3' ? Promise.reject(new Error('offline')) : bytes(url)),
  });
  player.apply({ play: true, track: 0 });
  await flush();
  assert.deepEqual(player.debugState().failed, [0]);
  assert.equal(player.debugState().playing, null);
  assert.equal(sources.length, 0);
  player.apply({ play: true, track: 0 }); // asked again: not refetched, still no throw
  player.apply({ play: true, track: 1 });
  await flush();
  assert.equal(player.debugState().playing, 1);
});

test('at most the current and next tracks stay decoded', async () => {
  const { output } = fakeOutput();
  const player = createMusicPlayer({ output, tracks, fetchBytes: bytes });
  for (const track of [0, 1, 2, 3, 0]) {
    player.apply({ play: true, track });
    await flush();
    await flush();
    const { decoded, playing } = player.debugState();
    assert.equal(playing, track);
    assert.ok(decoded.length <= 2, `track ${track}: ${decoded}`);
    assert.ok(decoded.includes(track));
  }
  player.releaseAll();
  assert.deepEqual(player.debugState().decoded, []);
});

test('pause keeps the position; resume continues from it; end forgets it', async () => {
  const { output, ctx, sources } = fakeOutput();
  const player = createMusicPlayer({ output, tracks, fetchBytes: bytes });
  player.apply({ play: true, track: 0 });
  await flush();
  ctx.currentTime = 3;
  player.apply({ play: false, track: 0 });
  assert.equal(sources[0].stopped, true);
  ctx.currentTime = 50; // time passes while paused
  player.apply({ play: true, track: 0 });
  assert.equal(sources[1].started.offset, 3);
  // Loops wrap the remembered position: 3 s in, plus 9 s more, of a 10 s loop.
  ctx.currentTime = 59;
  player.apply({ play: false, track: 0 });
  player.apply({ play: true, track: 0 });
  assert.ok(Math.abs(sources[2].started.offset - 2) < 1e-9, String(sources[2].started.offset));
  player.end(0.25);
  player.apply({ play: true, track: 0 });
  assert.equal(sources[3].started.offset, 0);
});

test('an empty playlist is silent and never throws', () => {
  const { output, sources } = fakeOutput();
  const player = createMusicPlayer({ output, tracks: [], fetchBytes: bytes });
  player.apply({ play: true, track: null });
  player.apply({ play: false, track: null });
  player.end(0.25);
  player.releaseAll();
  assert.equal(sources.length, 0);
});

test('without an AudioContext (not unlocked yet) nothing happens', () => {
  const player = createMusicPlayer({ output: { get: () => null, musicBus: () => null }, tracks, fetchBytes: bytes });
  player.apply({ play: true, track: 0 });
  assert.deepEqual(player.debugState(), { decoded: [], playing: null, failed: [] });
});
