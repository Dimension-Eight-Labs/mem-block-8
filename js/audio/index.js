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
 *   sfx.js       effect table (pure)         music.js  playlist and loop rules (pure)
 *   context.js   AudioContext, unlock, mixer, audio session
 *   synth.js     plays schedules             player.js plays music buffers
 *
 * Everything here is optional: with no Web Audio, no tracks, or both
 * settings off, the game plays silently and nothing else changes.
 *
 * Does NOT belong here: game rules, or audio sample files for effects (all
 * effects are synthesized).
 */

import { createAudioOutput } from './context.js';
import { playSchedule } from './synth.js';
import { buildEffect, effectForEvent } from './sfx.js';
import { MODEM_LEAD_IN, transitionTiming } from './modem.js';
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
 * @param {object} setup
 * @param {{music: OnOffSetting, sfx: OnOffSetting}} setup.settings
 * @param {readonly import('./music.js').Track[]} [setup.tracks]
 * @param {(url: string) => Promise<ArrayBuffer>} [setup.fetchBytes]
 * @param {Window & typeof globalThis} [setup.win]
 * @returns {Audio}
 */
export function createAudio({ settings, tracks = TRACKS, fetchBytes = defaultFetch, win = globalThis }) {
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
    if (!sfxOn() || !output.isReady()) return null;
    const ctx = output.get();
    return playSchedule(ctx, output.sfxBus(), buildEffect(name, event), ctx.currentTime + delay);
  }

  function updateMusic() {
    player.apply(musicTarget({ screen, musicOn: musicOn(), bank, count: tracks.length }));
  }

  function unlock() {
    if (!musicOn() && !sfxOn()) return; // no need for an AudioContext at all
    if (output.unlock()) updateMusic();
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
