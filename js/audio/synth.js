/**
 * js/audio/synth.js - Play a schedule (js/audio/schedule.js) with Web Audio.
 *
 * The thin layer between sound-as-data and the speaker: one oscillator per
 * tone frequency, one filtered noise source per noise segment, each
 * through its own envelope gain, all through one gain per sound so the
 * whole sound can be cut short (the modem hang-up, a new game during the
 * busy signal). Every node is scheduled up front on the audio clock, so
 * timing does not depend on the main thread.
 */

/** Seconds of white noise generated once per context and looped. */
const NOISE_SECONDS = 1;

/** @type {WeakMap<BaseAudioContext, AudioBuffer>} */
const noiseBuffers = new WeakMap();

/**
 * @param {BaseAudioContext} ctx
 * @returns {AudioBuffer}
 */
function noiseBuffer(ctx) {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Math.random is fine here: the noise only has to sound like noise.
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/**
 * Attack, hold, release on a gain param.
 * @param {AudioParam} param
 * @param {import('./schedule.js').Segment} s
 * @param {number} t0 Absolute start time.
 * @param {number} peak
 */
function envelope(param, s, t0, peak) {
  const end = t0 + s.duration;
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + s.attack);
  param.setValueAtTime(peak, Math.max(t0 + s.attack, end - s.release));
  param.linearRampToValueAtTime(0, end);
}

/**
 * @typedef {object} Voice
 * @property {(fadeSeconds?: number) => void} stop Cut the sound now (quick fade, no click).
 * @property {number} endsAt Audio-clock time the sound finishes on its own.
 */

/**
 * Schedule a sound.
 * @param {AudioContext} ctx
 * @param {AudioNode} destination
 * @param {readonly import('./schedule.js').Segment[]} segments
 * @param {number} [when] Audio-clock start time (default: now).
 * @returns {Voice}
 */
export function playSchedule(ctx, destination, segments, when = ctx.currentTime) {
  const out = ctx.createGain();
  out.connect(destination);
  /** @type {AudioScheduledSourceNode[]} */
  const sources = [];
  let endsAt = when;

  for (const s of segments) {
    const t0 = when + s.start;
    const t1 = t0 + s.duration;
    endsAt = Math.max(endsAt, t1);
    const amp = ctx.createGain();
    amp.connect(out);

    if (s.kind === 'tone') {
      envelope(amp.gain, s, t0, s.gain / s.freqs.length);
      s.freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = s.wave;
        osc.frequency.setValueAtTime(freq, t0);
        if (s.sweepTo) osc.frequency.exponentialRampToValueAtTime(s.sweepTo[i], t1);
        osc.connect(amp);
        osc.start(t0);
        osc.stop(t1 + 0.01);
        sources.push(osc);
      });
      if (s.am) {
        // An LFO added onto the envelope's gain: a gentle tremolo.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = s.am.rate;
        const depth = ctx.createGain();
        depth.gain.value = (s.gain / s.freqs.length) * s.am.depth;
        lfo.connect(depth);
        depth.connect(amp.gain);
        lfo.start(t0);
        lfo.stop(t1);
        sources.push(lfo);
      }
    } else {
      envelope(amp.gain, s, t0, s.gain);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = s.filter.type;
      filter.frequency.value = s.filter.freq;
      filter.Q.value = s.filter.q;
      src.connect(filter);
      filter.connect(amp);
      // A random point in the noise, so repeated clicks are not identical.
      src.start(t0, Math.random() * NOISE_SECONDS);
      src.stop(t1 + 0.01);
      sources.push(src);
    }
  }

  // Free the graph once everything has played.
  let remaining = sources.length;
  for (const src of sources) {
    src.onended = () => {
      remaining -= 1;
      if (remaining === 0) out.disconnect();
    };
  }

  return {
    endsAt,
    stop(fadeSeconds = 0.008) {
      const now = ctx.currentTime;
      if (now >= endsAt) return;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      for (const src of sources) {
        try {
          src.stop(now + fadeSeconds + 0.005);
        } catch {
          // Already stopped.
        }
      }
      endsAt = now + fadeSeconds;
    },
  };
}
