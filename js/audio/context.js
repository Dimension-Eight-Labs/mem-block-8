/**
 * js/audio/context.js - The AudioContext, its unlock, and the mixer.
 *
 * iOS (every iPhone browser is WebKit) keeps Web Audio silent until the
 * page resumes the AudioContext inside a user gesture handler. So the
 * context is created and resumed only from unlock(), which js/main.js
 * calls from touch, click, and key handlers (in practice the tap that
 * starts the game, a settings toggle, or RESUME). Nothing here runs at
 * page load, and the page never makes a sound before the player touches it.
 *
 * Audio session: where navigator.audioSession exists (recent iOS WebKit),
 * its type is set to 'ambient'. That makes the game behave like a game
 * rather than a media player: it follows the ring/silent switch (silent
 * means silent) and mixes with music or podcasts already playing instead
 * of stopping them. The default ('auto') would play through the silent
 * switch and interrupt other audio, which is wrong for a casual game.
 *
 * Mixer: music and effects have their own gain under a master gain, so
 * each can be turned off or balanced alone. Music sits well below the
 * effects, so clicks and the modem stay clear over it.
 *
 * When the page is hidden the context is suspended (no audio, no battery
 * use in the background) and resumed on return if it was running.
 */

/** Mixer levels (linear). Tune here. */
export const MIX = Object.freeze({
  master: 0.9,
  music: 0.32,
  sfx: 0.85,
});

/**
 * @typedef {object} AudioOutput
 * @property {() => (AudioContext | null)} unlock Create the context if needed
 *   and resume it. Call only from a user gesture. Returns null if Web Audio
 *   is unavailable.
 * @property {() => (AudioContext | null)} get The context if it exists.
 * @property {() => boolean} isReady Unlocked (a resume may still be settling;
 *   sounds scheduled now play as soon as it does) and the page is visible.
 * @property {() => GainNode | null} musicBus
 * @property {() => GainNode | null} sfxBus
 * @property {(hidden: boolean) => void} setHidden Page visibility changed.
 */

/**
 * @param {Window & typeof globalThis} [win]
 * @returns {AudioOutput}
 */
export function createAudioOutput(win = globalThis) {
  /** @type {AudioContext | null} */
  let ctx = null;
  let buses = null;
  let resumeOnShow = false;
  let hidden = false;
  let unavailable = false;

  function create() {
    const Ctor = win.AudioContext || win.webkitAudioContext;
    if (!Ctor) {
      unavailable = true;
      return;
    }
    try {
      // Must be set before audio starts to take effect for this page.
      if (win.navigator && win.navigator.audioSession) win.navigator.audioSession.type = 'ambient';
    } catch {
      // Older WebKit: no audio session control; the default applies.
    }
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      unavailable = true;
      return;
    }
    const master = ctx.createGain();
    master.gain.value = MIX.master;
    master.connect(ctx.destination);
    const music = ctx.createGain();
    music.gain.value = MIX.music;
    music.connect(master);
    const sfx = ctx.createGain();
    sfx.gain.value = MIX.sfx;
    sfx.connect(master);
    buses = { master, music, sfx };
  }

  /**
   * Older iOS only truly unlocks once something has played inside the
   * gesture, so play one silent sample.
   */
  function primeOutput() {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.start(0);
  }

  return {
    unlock() {
      if (unavailable) return null;
      if (!ctx) {
        create();
        if (!ctx) return null;
        primeOutput();
      }
      // 'suspended' before the first gesture, 'interrupted' after a phone
      // call or Siri on iOS. Never resume while hidden.
      if (ctx.state !== 'running' && !hidden) ctx.resume().catch(() => {});
      return ctx;
    },
    get: () => ctx,
    isReady: () => Boolean(ctx) && ctx.state !== 'closed' && !hidden,
    musicBus: () => (buses ? buses.music : null),
    sfxBus: () => (buses ? buses.sfx : null),
    setHidden(isHidden) {
      hidden = isHidden;
      if (!ctx) return;
      if (isHidden) {
        resumeOnShow = ctx.state === 'running';
        ctx.suspend().catch(() => {});
      } else if (resumeOnShow) {
        resumeOnShow = false;
        // May be refused outside a gesture on some iOS versions; the next
        // tap (RESUME) unlocks again in that case.
        ctx.resume().catch(() => {});
      }
    },
  };
}
