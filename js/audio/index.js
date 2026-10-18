/**
 * js/audio/index.js - Sound for Mem Block 8: the one object the game talks to.
 *
 * The game never calls audio code directly. Every engine, progression,
 * and session event already passes through the session's single hook
 * (deps.onEvent in js/session.js); js/main.js points that hook at
 * audio.onEvent, and this file decides what each event sounds like:
 *
 *   locked -> click        rotated -> faint tick     clearStarted -> chirp
 *   chipsEarned -> success arpeggio (with the FULL WORD flourish on a 5-row clear)
 *   bankComplete -> modem  bankReady -> chip tally   gameOver -> busy signal
 *   screen changes -> music (gameplay only) and cutting long sounds short
 *
 * Modules:
 *   schedule.js  sound as data (pure)        modem.js  the dial-in (pure)
 *   signals.js   computed waveforms (pure)   music.js  playlist and loop rules (pure)
 *   sfx.js       effect table (pure)
 *   context.js   AudioContext, unlock, mixer, audio session
 *   synth.js     plays schedules             player.js plays music buffers
 *
 * Everything here is optional: with no Web Audio, no tracks, or both
 * settings off, the game plays silently and nothing else changes.
 *
 * Does NOT belong here: game rules, or audio sample files for effects (all
 * effects are synthesized).
 */

import { createAudioOutput, MIX } from './context.js';
import { playSchedule, prepareSignals } from './synth.js';
import { buildEffect, effectForEvent, EFFECTS } from './sfx.js';
import { MODEM_LEAD_IN, MODEM_SCHEDULE, transitionTiming } from './modem.js';
import { TRACKS, musicTarget } from './music.js';
import { createMusicPlayer, MUSIC_FADES } from './player.js';

export { TRACKS, trackForBank, musicTarget, tracksToKeep, loopPoints } from './music.js';
export { MODEM_SCHEDULE, MODEM_DURATION, transitionTiming, dtmfFreqs } from './modem.js';
export { EFFECTS, EVENT_EFFECTS, buildEffect, effectForEvent } from './sfx.js';

/**
 * @typedef {object} OnOffSetting
 * @property {() => string} get 'on' or 'off'.
 * @property {(listener: (value: string) => void) => void} onChange
 */

/**
 * @typedef {object} Audio
 * @property {(event: {type: string}) => void} onEvent The session hook.
 * @property {() => void} unlock Call from user gesture handlers (iOS).
 * @property {(hidden: boolean) => void} setHidden Page visibility changed.
 * @property {(screens: {silentMs: number, readyMs: number}) => import('./modem.js').TransitionTiming} transitionTiming
 *   Bank transition timing: matched to the modem when it will play.
 * @property {() => object} debugState
 */

/**
 * @typedef {object} SoundRecord One effect asked to play (for ?debug=1).
 * @property {string} name
 * @property {number} t performance.now() when asked.
 * @property {boolean} played False when it could not play (reason says why).
 * @property {string} state The AudioContext state ('none' before unlock):
 *   a sound "played" into a suspended context is silent until it resumes.
 * @property {string} [reason] 'sfx off', 'no audio', or 'hidden'.
 * @property {boolean} [ducked] The music ducked for it.
 */

/**
 * @param {object} setup
 * @param {{music: OnOffSetting, sfx: OnOffSetting}} setup.settings
 * @param {readonly import('./music.js').Track[]} [setup.tracks]
 * @param {(url: string) => Promise<ArrayBuffer>} [setup.fetchBytes]
 * @param {Window & typeof globalThis} [setup.win]
 * @param {(record: SoundRecord) => void} [setup.onSound] Told about every
 *   effect asked to play, played or not (the ?debug=1 log).
 * @returns {Audio}
 */
export function createAudio({
  settings, tracks = TRACKS, fetchBytes = defaultFetch, win = globalThis, onSound = () => {},
}) {
  const output = createAudioOutput(win);
  const player = createMusicPlayer({ output, tracks, fetchBytes });
  const musicOn = () => settings.music.get() === 'on';
  const sfxOn = () => settings.sfx.get() === 'on';

  let screen = 'start';
  let bank = 1;
  /** @type {import('./synth.js').Voice | null} */
  let modem = null;
  /** @type {import('./synth.js').Voice | null} */
  let busy = null;
  /** Audio-clock time the current music duck lasts until. */
  let duckUntil = 0;
  let prepared = false;

  function sounding(voice) {
    const ctx = output.get();
    return Boolean(voice && ctx && ctx.currentTime < voice.endsAt);
  }

  /**
   * @param {string} name
   * @param {object} [event]
   * @param {number} [delay] Seconds from now.
   * @returns {import('./synth.js').Voice | null}
   */
  function play(name, event, delay = 0) {
    const ctx = output.get();
    const record = { name, t: win.performance ? win.performance.now() : 0, state: ctx ? ctx.state : 'none' };
    if (!sfxOn() || !output.isReady()) {
      let reason = 'hidden';
      if (!sfxOn()) reason = 'sfx off';
      else if (!ctx) reason = 'no audio';
      onSound({ ...record, played: false, reason });
      return null;
    }
    const voice = playSchedule(ctx, output.sfxBus(), buildEffect(name, event), ctx.currentTime + delay);
    const ducked = EFFECTS.duck.effects.includes(name);
    if (ducked) duck(voice.endsAt);
    onSound({ ...record, played: true, ducked });
    return voice;
  }

  /**
   * Duck the music under a reward sound: down by EFFECTS.duck.db over its
   * attack, held until `until` (or a later duck already running), back
   * over its release. Automation on the music bus, so it applies to
   * whatever track plays, and overlapping rewards extend one duck.
   * @param {number} until Audio-clock time the reward ends.
   */
  function duck(until) {
    const bus = output.musicBus();
    if (!bus) return;
    const d = EFFECTS.duck;
    const now = output.get().currentTime;
    const low = MIX.music * 10 ** (d.db / 20);
    const end = Math.max(until, duckUntil);
    const g = bus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now); // from wherever it is (possibly mid-release)
    g.linearRampToValueAtTime(low, now + d.attack);
    g.setValueAtTime(low, Math.max(end, now + d.attack));
    g.linearRampToValueAtTime(MIX.music, Math.max(end, now + d.attack) + d.release);
    duckUntil = end;
  }

  function updateMusic() {
    player.apply(musicTarget({ screen, musicOn: musicOn(), bank, count: tracks.length }));
  }

  /**
   * Render the modem's computed signals once (js/audio/signals.js), in a
   * later task: tens of milliseconds of work that should neither delay the
   * tap that unlocked audio nor stall the first bank transition. If the
   * modem plays first, the synth renders them on the spot instead.
   */
  function prepareSoon() {
    const ctx = output.get();
    if (prepared || !ctx || typeof win.setTimeout !== 'function') return;
    prepared = true;
    win.setTimeout(() => prepareSignals(ctx, MODEM_SCHEDULE), 0);
  }

  function unlock() {
    if (!musicOn() && !sfxOn()) return; // no need for an AudioContext at all
    if (output.unlock()) updateMusic();
    prepareSoon();
  }

  /** Hang up a modem call still in progress (the player skipped it or paused). */
  function hangUp() {
    if (!sounding(modem)) return;
    modem.stop();
    modem = null; // still fading for a few ms: never hang up twice
    play('hangUp');
  }

  /**
   * The READY moment. The tally plays only after the modem: on time it has
   * finished; on a skip the call is cut first and only the done tone plays.
   * @param {{count: number, skipped: boolean}} event
   */
  function onReady(event) {
    if (event.skipped) {
      hangUp();
      if (event.count > 0) play('tallyDone', event, HANG_UP_GAP);
    } else if (event.count > 0) {
      play('tally', event);
    }
  }

  function onScreen(event) {
    if (event.from === 'transition') hangUp(); // paused mid-call
    if (event.screen === 'playing' && sounding(busy)) busy.stop(0.03);
    screen = event.screen;
    bank = event.bank ?? bank;
    updateMusic();
  }

  settings.music.onChange((value) => {
    if (value === 'off') player.releaseAll();
    else unlock(); // a settings toggle is a user gesture
  });
  settings.sfx.onChange((value) => {
    if (value === 'on') {
      unlock();
      play('lock'); // audible confirmation
    }
  });

  return {
    onEvent(event) {
      switch (event.type) {
        case 'screen':
          onScreen(event);
          return;
        case 'newGame':
          player.end(0);
          return;
        case 'bankComplete':
          player.end(MUSIC_FADES.bankEnd);
          if (!sounding(modem)) modem = play('modem', event, MODEM_LEAD_IN);
          return;
        case 'bankReady':
          onReady(event);
          return;
        case 'gameOver':
          busy = play('busy', event);
          return;
        default: {
          const name = effectForEvent(event);
          if (name) play(name, event);
        }
      }
    },
    unlock,
    setHidden: (hidden) => output.setHidden(hidden),
    transitionTiming: (screens) => transitionTiming(sfxOn() && output.isReady(), screens),
    debugState: () => ({ state: output.get()?.state ?? 'none', screen, bank, ...player.debugState() }),
  };
}

/** Seconds between the hang-up click and the done tone after a skip. */
const HANG_UP_GAP = 0.12;

/**
 * Fetch a file's bytes. Goes through the service worker, which serves
 * cached music and caches newly fetched tracks (sw.js).
 * @param {string} url
 * @returns {Promise<ArrayBuffer>}
 */
async function defaultFetch(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}
