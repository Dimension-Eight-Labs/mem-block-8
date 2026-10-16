/**
 * js/audio/player.js - Music playback with Web Audio buffers.
 *
 * Why buffers and not an <audio> element: an AudioBufferSourceNode loops
 * at exact sample positions (loopStart / loopEnd from js/audio/music.js,
 * which skip MP3 padding when the browser keeps it), so a track loops with
 * no gap and no crossfade. Media elements leave an audible gap at the loop
 * point in most browsers. Buffers also share the effects' AudioContext,
 * unlock, and mixer.
 *
 * Memory: decoded audio is raw 32-bit float samples, about 64 MB for a
 * 3-minute stereo track (about 51 MB for the longest, Iced Village's
 * 2:24 stereo loop). So at most two
 * tracks are decoded at once, the current one and the next (decoded ahead
 * so the next bank starts promptly); any other is released as soon as the
 * current track changes, and all are released when music is turned off.
 * The compressed file is not kept either: decodeAudioData consumes it, and
 * the service worker cache has it for next time.
 *
 * Failure is always quiet: a track that cannot be fetched (offline and not
 * cached yet) or decoded is skipped for the rest of the session, and that
 * bank simply plays without music.
 */

import { loopPoints, tracksToKeep } from './music.js';

/** Fades, in seconds. Short enough to feel immediate, long enough not to click. */
export const MUSIC_FADES = Object.freeze({
  pause: 0.06,
  resume: 0.08,
  start: 0.05,
  // Before the modem sequence (inside its lead-in, see MODEM_LEAD_IN).
  bankEnd: 0.25,
});

/**
 * decodeAudioData, promise style. Older WebKit only supports callbacks;
 * newer browsers return a promise too. Either settles this once.
 * @param {BaseAudioContext} ctx
 * @param {ArrayBuffer} data
 * @returns {Promise<AudioBuffer>}
 */
function decode(ctx, data) {
  return new Promise((resolve, reject) => {
    const result = ctx.decodeAudioData(data, resolve, reject);
    if (result && typeof result.catch === 'function') result.catch(reject);
  });
}

/**
 * @typedef {object} MusicPlayer
 * @property {(target: {play: boolean, track: number | null}) => void} apply
 *   Make playback match the target (start, pause, resume, or switch).
 * @property {(fadeSeconds: number) => void} end Stop and forget the position
 *   (bank complete, new game): the next start begins at the top of a track.
 * @property {() => void} releaseAll Stop and free every decoded track (music off).
 * @property {() => {decoded: number[], playing: number | null, failed: number[]}} debugState
 */

/**
 * @param {object} setup
 * @param {import('./context.js').AudioOutput} setup.output
 * @param {readonly import('./music.js').Track[]} setup.tracks
 * @param {(url: string) => Promise<ArrayBuffer>} setup.fetchBytes
 * @returns {MusicPlayer}
 */
export function createMusicPlayer({ output, tracks, fetchBytes }) {
  /** @type {Map<number, {buffer: AudioBuffer, loopStart: number, loopEnd: number}>} */
  const decoded = new Map();
  /** @type {Set<number>} */
  const loading = new Set();
  /** @type {Set<number>} */
  const failed = new Set();
  /** @type {{index: number, source: AudioBufferSourceNode, gain: GainNode, startedAt: number, offset: number} | null} */
  let playing = null;
  /** Where a paused track stopped: resuming the same track continues from here. */
  let paused = null;
  let target = { play: false, track: null };
  /** The track that counts as current for memory, even while paused. */
  let current = null;

  function keep(index) {
    return tracksToKeep(current, tracks.length).includes(index);
  }

  function release() {
    for (const index of decoded.keys()) {
      if (!keep(index)) decoded.delete(index);
    }
  }

  function load(index) {
    if (decoded.has(index) || loading.has(index) || failed.has(index)) return;
    const ctx = output.get();
    if (!ctx) return;
    loading.add(index);
    fetchBytes(tracks[index].url)
      .then((bytes) => decode(ctx, bytes))
      .then((buffer) => {
        loading.delete(index);
        if (!keep(index)) return; // the game moved on while it loaded
        decoded.set(index, {
          buffer,
          ...loopPoints({ decodedFrames: buffer.length, sampleRate: buffer.sampleRate, track: tracks[index] }),
        });
        sync();
      })
      .catch(() => {
        loading.delete(index);
        failed.add(index);
      });
  }

  /** Position within the track's loop, in seconds of buffer time. */
  function position(p, loop) {
    const pos = p.offset + (output.get().currentTime - p.startedAt);
    if (pos < loop.loopEnd) return pos;
    return loop.loopStart + ((pos - loop.loopStart) % (loop.loopEnd - loop.loopStart));
  }

  function stopPlaying(fadeSeconds, rememberPosition) {
    if (!playing) return;
    const ctx = output.get();
    const now = ctx.currentTime;
    const loop = decoded.get(playing.index);
    if (rememberPosition && loop) paused = { index: playing.index, offset: position(playing, loop) };
    const { gain, source } = playing;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    source.stop(now + fadeSeconds + 0.01);
    source.onended = () => gain.disconnect();
    playing = null;
  }

  function start(index) {
    const ctx = output.get();
    const bus = output.musicBus();
    const loop = decoded.get(index);
    const offset = paused && paused.index === index ? paused.offset : loop.loopStart;
    const fade = paused && paused.index === index ? MUSIC_FADES.resume : MUSIC_FADES.start;
    paused = null;
    const source = ctx.createBufferSource();
    source.buffer = loop.buffer;
    source.loop = true;
    source.loopStart = loop.loopStart;
    source.loopEnd = loop.loopEnd;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    source.connect(gain);
    gain.connect(bus);
    source.start(now, offset);
    playing = { index, source, gain, startedAt: now, offset };
  }

  /** Make a track current: keep it (and the next) decoded, release the rest. */
  function select(index) {
    if (current === index) return;
    current = index;
    if (paused && paused.index !== index) paused = null;
    release();
  }

  /** Bring playback in line with the target. */
  function sync() {
    if (!output.get()) return;
    if (target.track === null) {
      stopPlaying(MUSIC_FADES.pause, true);
      return;
    }
    const index = target.track;
    if (!target.play) {
      // Paused, or not started yet: decode the track ahead so it starts
      // promptly (the first tap, the end of a bank transition).
      stopPlaying(MUSIC_FADES.pause, true);
      select(index);
      load(index);
      return;
    }
    if (playing && playing.index === index) return;
    stopPlaying(MUSIC_FADES.start, false);
    select(index);
    if (!decoded.has(index)) {
      load(index);
      return; // starts when decoded, if still wanted
    }
    start(index);
    load((index + 1) % tracks.length); // decode the next bank's track ahead
  }

  return {
    apply(next) {
      target = { ...next };
      if (tracks.length === 0) return;
      sync();
    },
    end(fadeSeconds) {
      stopPlaying(fadeSeconds, false);
      paused = null;
    },
    releaseAll() {
      stopPlaying(MUSIC_FADES.pause, false);
      paused = null;
      current = null;
      decoded.clear();
    },
    debugState: () => ({
      decoded: [...decoded.keys()],
      playing: playing ? playing.index : null,
      failed: [...failed],
    }),
  };
}
