/**
 * js/audio/sfx.js - Which game event makes which sound, and the sounds.
 *
 * EVENT_EFFECTS maps session hook events (engine, progression, and session
 * events; see js/session.js) to effect names; EFFECTS is THE table to tune
 * every effect's volume and timing. Each effect is built as a pure
 * schedule (js/audio/schedule.js), played by js/audio/synth.js.
 *
 * Moves stay silent on purpose: they happen many times a second while a
 * side is held, and a sound on each would be tiring.
 *
 * Rewards sound like a computer, not money: square-wave arpeggios and
 * beeps, never bells or a cash register. They are the loudest effects
 * (above the lock click and the line clear chirp), each note doubled an
 * octave up so it cuts through chiptune music (whose leads sit in the same
 * square-wave register) and through a phone speaker, which is weak below
 * about 1 kHz. While one plays, the music ducks (duck, below; done in
 * js/audio/index.js).
 */

import { tone, noise, scaleGain } from './schedule.js';
import { MODEM_SCHEDULE } from './modem.js';

/**
 * Event type -> effect name. Every hooked event must have an EFFECTS entry
 * (a test checks).
 */
export const EVENT_EFFECTS = Object.freeze({
  locked: 'lock',
  rotated: 'rotate',
  clearStarted: 'lineClear',
  // A FULL WORD always earns chips, so its flourish is part of the chips
  // sound (chipsEarned with fullWord: true) rather than a second sound on
  // top of it; the fullWord event itself is silent.
  chipsEarned: 'chips',
  bankComplete: 'modem',
  gameOver: 'busy',
});

/**
 * The tuning table. volume scales the whole effect (0..1); times are
 * seconds; frequencies Hz.
 */
export const EFFECTS = Object.freeze({
  // A soft relay or key click: a very short burst of bright noise over a
  // small low thump. Hard drops use the same click.
  lock: { volume: 0.55, clickTime: 0.012, clickHz: 3200, thumpTime: 0.035, thumpHz: 140 },
  // A barely-there tick, much quieter than the lock click.
  rotate: { volume: 0.1, time: 0.008, hz: 5200 },
  // A rising chirp: higher and slightly longer for more lines (1 to 5).
  lineClear: {
    volume: 0.4,
    wave: 'square',
    fromHz: 520, toHz: 1040, // one line
    perLineHz: 0.18, // each extra line raises both ends by this fraction
    time: 0.09, perLineTime: 0.025,
  },
  // Chips earned: a quick, bright rising arpeggio, an old computer's
  // "success" beep. It climbs a C major arpeggio from C5; each chip adds a
  // note, so more chips run longer and end higher (1 chip: 3 notes to G5;
  // 3 chips: 5 notes to E6). A FULL WORD (5 chips) is the whole two-octave
  // run to C7 with a long last note: the FULL WORD flourish and the chip
  // reward as one sound. It plays when the chips are awarded, as the
  // cleared rows vanish, after the line clear chirp has finished.
  // voices: each note sounds at these multiples (1 and 2: plus an octave
  // up, for presence); attack: a near-instant edge, so each note pings.
  chips: {
    volume: 0.85,
    wave: 'square',
    ladderHz: [523, 659, 784, 1047, 1319, 1568, 2093],
    voices: [1, 2],
    baseNotes: 2, // notes = baseNotes + chips, up to the whole ladder
    noteTime: 0.05,
    lastNoteTime: 0.12,
    fullWordLastNoteTime: 0.22,
    attack: 0.001,
  },
  // Cash-in tally (the READY moment): a short blip per counting step,
  // each a little higher, then the done tone. The steps are rate-limited
  // by the session (SCREENS.chipTallyMaxSteps), so many chips never
  // become a buzz.
  tally: { volume: 0.6, wave: 'square', hz: 1320, riseHz: 0.05, time: 0.022, voices: [1, 2] },
  // Done: a two-note "OK" beep, each note with its octave on top.
  tallyDone: { volume: 0.8, wave: 'square', notes: [784, 1047], voices: [1, 2], noteTime: 0.07, lastNoteTime: 0.22, attack: 0.001 },
  // Music duck while a reward plays: the music bus drops by db over
  // attack seconds, holds until the reward ends, and comes back over
  // release seconds. effects: which sounds duck it (only the rewards; the
  // click, chirp, and modem never do, and music is already off for the
  // modem). Not a sound itself: buildEffect has no case for it.
  duck: { db: -10, attack: 0.03, release: 0.25, effects: Object.freeze(['chips', 'tally', 'tallyDone']) },
  // Bank complete: the modem dial-in (phases and timings in js/audio/modem.js).
  modem: { volume: 0.7 },
  // Game over: a busy signal, 480 + 620 Hz, on 0.5 s / off 0.5 s, three times.
  busy: { volume: 0.5, freqs: [480, 620], on: 0.5, off: 0.5, cycles: 3 },
  // Skipping the transition hangs up: a short click, like the handset going down.
  hangUp: { volume: 0.6, clickTime: 0.02, clickHz: 1800, thumpTime: 0.05, thumpHz: 90 },
});

/**
 * A click: noise burst plus a low thump (lock and hang-up).
 * @param {{volume: number, clickTime: number, clickHz: number, thumpTime: number, thumpHz: number}} e
 */
function click(e) {
  return scaleGain([
    noise(0, e.clickTime, { type: 'bandpass', freq: e.clickHz, q: 1.4 }, { gain: 0.8, attack: 0.001, release: e.clickTime * 0.7 }),
    tone(0, e.thumpTime, [e.thumpHz], { wave: 'triangle', gain: 0.6, attack: 0.002, release: e.thumpTime * 0.8 }),
  ], e.volume);
}

/**
 * Every voice of a note: the note at each multiple in voices (no voices:
 * just the note).
 * @param {number} hz
 * @param {readonly number[]} [voices]
 * @returns {number[]}
 */
function voiced(hz, voices = [1]) {
  return voices.map((v) => hz * v);
}

/**
 * The gain of a note: voices share it (js/audio/synth.js splits a tone's
 * gain between its frequencies), so a doubled note gets twice the gain to
 * keep each voice as loud as a single one would be.
 * @param {readonly number[]} [voices]
 * @returns {number}
 */
function noteGain(voices = [1]) {
  return Math.min(1, 0.45 * voices.length);
}

/**
 * A run of square-wave notes, one after another; the last one longer.
 * @param {number} start Seconds.
 * @param {number[][]} notes Hz per note (several sound together).
 * @param {{wave: import('./schedule.js').Wave, noteTime: number, voices?: readonly number[], attack?: number}} e
 * @param {number} lastNoteTime
 * @returns {import('./schedule.js').Segment[]}
 */
function arpeggio(start, notes, e, lastNoteTime) {
  return notes.map((freqs, i) => {
    const last = i === notes.length - 1;
    return tone(start + i * e.noteTime, last ? lastNoteTime : e.noteTime, freqs, {
      wave: e.wave, gain: noteGain(e.voices), attack: e.attack ?? 0.003, release: last ? 0.08 : 0.01,
    });
  });
}

/**
 * Build one effect's schedule.
 * @param {keyof typeof EFFECTS} name
 * @param {object} [event] The hook event: lineClear and chips read count,
 *   chips also fullWord; tally reads steps and stepMs (see js/session.js,
 *   the bankReady event).
 * @param {typeof EFFECTS} [table]
 * @returns {import('./schedule.js').Segment[]}
 */
export function buildEffect(name, event = {}, table = EFFECTS) {
  switch (name) {
    case 'lock':
      return click(table.lock);
    case 'hangUp':
      return click(table.hangUp);
    case 'rotate': {
      const e = table.rotate;
      return scaleGain([noise(0, e.time, { type: 'highpass', freq: e.hz, q: 0.7 }, { gain: 1, attack: 0.001, release: e.time * 0.7 })], e.volume);
    }
    case 'lineClear': {
      const e = table.lineClear;
      const extra = Math.min(Math.max((event.count ?? 1) - 1, 0), 4);
      const lift = 1 + e.perLineHz * extra;
      const time = e.time + e.perLineTime * extra;
      return scaleGain([tone(0, time, [e.fromHz * lift], {
        sweepTo: [e.toHz * lift], wave: e.wave, gain: 0.5, attack: 0.004, release: 0.03,
      })], e.volume);
    }
    case 'chips': {
      const e = table.chips;
      const all = e.ladderHz.length;
      const count = Math.max(event.count ?? 1, 1);
      const notes = event.fullWord ? all : Math.min(e.baseNotes + count, all);
      return scaleGain(arpeggio(0, e.ladderHz.slice(0, notes).map((hz) => voiced(hz, e.voices)), e,
        event.fullWord ? e.fullWordLastNoteTime : e.lastNoteTime), e.volume);
    }
    case 'tally': {
      // Blip k (1..steps) at k step lengths, as the number on screen ticks
      // up; the done tone one step after the last.
      const e = table.tally;
      const steps = Math.max(event.steps ?? 1, 1);
      const step = (event.stepMs ?? 60) / 1000;
      const blips = Array.from({ length: steps }, (_, i) => tone((i + 1) * step, e.time, voiced(e.hz * (1 + e.riseHz * i), e.voices), {
        wave: e.wave, gain: noteGain(e.voices), attack: 0.002, release: 0.008,
      }));
      return [...scaleGain(blips, e.volume), ...shift(buildEffect('tallyDone', event, table), (steps + 1) * step)];
    }
    case 'tallyDone': {
      const e = table.tallyDone;
      return scaleGain(arpeggio(0, e.notes.map((hz) => voiced(hz, e.voices)), e, e.lastNoteTime), e.volume);
    }
    case 'modem':
      return scaleGain(MODEM_SCHEDULE, table.modem.volume);
    case 'busy': {
      const e = table.busy;
      return scaleGain(Array.from({ length: e.cycles }, (_, i) => tone(i * (e.on + e.off), e.on, e.freqs, {
        gain: 0.5, attack: 0.01, release: 0.01,
      })), e.volume);
    }
    default:
      throw new RangeError(`Unknown effect: ${name}`);
  }
}

/**
 * Move a schedule later.
 * @param {import('./schedule.js').Segment[]} segments
 * @param {number} seconds
 * @returns {import('./schedule.js').Segment[]}
 */
function shift(segments, seconds) {
  return segments.map((s) => ({ ...s, start: s.start + seconds }));
}

/**
 * The effect for a hook event, or null if the event is silent.
 * @param {{type: string}} event
 * @returns {keyof typeof EFFECTS | null}
 */
export function effectForEvent(event) {
  return EVENT_EFFECTS[event.type] ?? null;
}
