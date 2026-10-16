/**
 * js/audio/music.js - The playlist, and the pure rules of music playback.
 *
 * TRACKS is the playlist in play order: bank 1 plays the first track and
 * each completed bank moves on to the next, cycling. (Stage 6 will map
 * tracks to era themes.) Every track is CC0; see CREDITS.md. To add or
 * replace one, see scripts/convert-music.sh, which prints the frame counts
 * this table needs.
 *
 * Also here, as pure functions so they can be tested in Node: which track
 * a bank plays, when music should be playing at all, which decoded tracks
 * to keep in memory, and the loop points that make a track loop without a
 * gap. The Web Audio side is js/audio/player.js.
 */

/**
 * @typedef {object} Track
 * @property {string} id
 * @property {string} url Relative to the page.
 * @property {string} title
 * @property {string} author
 * @property {number} frames Exact length in samples per channel at sampleRate,
 *   after trimming (printed by scripts/convert-music.sh).
 * @property {number} sampleRate Of the MP3 file.
 */

/** Sample rate of every converted file (scripts/convert-music.sh). */
const RATE = 44100;

/** @type {readonly Readonly<Track>[]} */
export const TRACKS = Object.freeze([
  // First track: also pre-cached with the app shell (sw.js), so bank 1 has
  // music offline from the first visit. Kept short to keep the install small.
  { id: 'free-run', url: 'assets/music/free-run.mp3', title: 'Free Run [8 bit(ish)]', author: 'TAD', frames: 3595807, sampleRate: RATE },
  { id: 'the-hero', url: 'assets/music/the-hero.mp3', title: '8 Bit The Hero', author: 'Sygil', frames: 5239191, sampleRate: RATE },
  { id: 'battle-theme', url: 'assets/music/battle-theme.mp3', title: '8 bit Battle Theme (Famitracker)', author: 'celestialghost8', frames: 3292408, sampleRate: RATE },
  { id: 'pixel-sprinter', url: 'assets/music/pixel-sprinter.mp3', title: 'Pixel Sprinter', author: 'Zane Little Music', frames: 1931740, sampleRate: RATE },
  { id: 'boss-battle-2', url: 'assets/music/boss-battle-2.mp3', title: 'Boss Battle #2 ["8 bit"]', author: 'nene', frames: 2626673, sampleRate: RATE },
  { id: 'crow-mans-stage', url: 'assets/music/crow-mans-stage.mp3', title: '"Crow Man\'s Stage"', author: 'Spring Spring', frames: 10585899, sampleRate: RATE },
  // Cut to a 2:24 loop (scripts/convert-music.sh): the full 7:17 track was
  // about 150 MB once decoded, too much for a phone. Now about 51 MB.
  { id: 'iced-village', url: 'assets/music/iced-village.mp3', title: 'Iced Village (8 Bit Lofi Hip Hop)', author: 'TAD', frames: 6350400, sampleRate: RATE },
].map((t) => Object.freeze(t)));

/**
 * Index of the track a bank plays, or null with no tracks.
 * @param {number} bank 1-based.
 * @param {number} count Tracks in the playlist.
 * @returns {number | null}
 */
export function trackForBank(bank, count) {
  if (count <= 0) return null;
  return (((bank - 1) % count) + count) % count;
}

/**
 * Whether music should be heard right now, and which track. Music plays
 * during gameplay only: not on the start screen, pause menu, settings,
 * game over, or during a bank transition (the modem has the stage then).
 * While it is not playing, track still names the bank's track (so it can
 * be decoded ahead), unless music is off.
 * @param {{screen: string, musicOn: boolean, bank: number, count: number}} state
 * @returns {{play: boolean, track: number | null}}
 */
export function musicTarget({ screen, musicOn, bank, count }) {
  const track = musicOn ? trackForBank(bank, count) : null;
  return { play: screen === 'playing' && track !== null, track };
}

/**
 * Decoded tracks to keep in memory: the current one and the next (decoded
 * ahead so the next bank starts without a wait). Everything else is
 * released. Decoded audio is large: 32-bit float samples, so a 3-minute
 * stereo track at 44.1 kHz is about 64 MB.
 * @param {number | null} current
 * @param {number} count
 * @returns {number[]}
 */
export function tracksToKeep(current, count) {
  if (current === null || count <= 0) return [];
  const next = (current + 1) % count;
  return next === current ? [current] : [current, next];
}

/**
 * Samples a decoder that ignores the MP3 gapless header adds at the start:
 * the LAME encoder delay (576) plus the standard decoder delay (529).
 * Measured on the converted files: ffprobe reports a start time of
 * 0.025057 s = 1105 / 44100.
 */
export const MP3_PRIMING_FRAMES = 1105;

/**
 * Loop points for a decoded track.
 *
 * MP3 cannot store an exact length: the encoder adds priming samples at the
 * start and pads the end to a whole frame. Browsers that read the LAME
 * header the encoder writes (most do) trim both, and the decoded buffer is
 * exactly the original length: loop the whole buffer. If the buffer is
 * longer than the known length, the decoder kept the padding: skip the
 * priming samples and stop before the padding. Either way the loop is
 * sample-exact and needs no crossfade.
 *
 * @param {{decodedFrames: number, sampleRate: number, track: Pick<Track, 'frames' | 'sampleRate'>}} input
 *   sampleRate is the decoded buffer's (the AudioContext's, often 48 kHz on phones).
 * @returns {{loopStart: number, loopEnd: number, trimmed: boolean}} Seconds;
 *   trimmed is true when padding had to be skipped.
 */
export function loopPoints({ decodedFrames, sampleRate, track }) {
  const ratio = sampleRate / track.sampleRate;
  const expected = Math.round(track.frames * ratio);
  // Resampling to another rate can round a few samples either way.
  const tolerance = Math.ceil(ratio) + 2;
  if (decodedFrames <= expected + tolerance) {
    return { loopStart: 0, loopEnd: decodedFrames / sampleRate, trimmed: false };
  }
  const start = Math.round(MP3_PRIMING_FRAMES * ratio);
  const end = Math.min(start + expected, decodedFrames);
  return { loopStart: start / sampleRate, loopEnd: end / sampleRate, trimmed: true };
}
