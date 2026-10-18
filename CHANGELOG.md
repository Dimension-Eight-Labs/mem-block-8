<!-- CHANGELOG.md - What changed in each stage of Mem Block 8. Newest first. -->
# Changelog

Every stage, and every significant change between stages, adds an entry
here (see CONTRIBUTING.md).

## Playtest pass 3 - modem handshake from a real modem reference

Version 0.5.4 (`CACHE_VERSION` `v0.5.4`; music unchanged, `music-v2`).

### Why

Earlier handshakes were built mostly from noise and never sounded quite
like a modem. The recognisable sound is mostly tones. The owner measured
a real V.34-era US Robotics handshake and built a numpy prototype from
it, approved by ear. Both are kept locally in `assets/audio-reference/`
(gitignored; the recording is not CC0 and is never shipped).

### Changed

- **Answer tone and handshake** now follow the prototype's phases,
  timings, frequencies, and relative levels, in Web Audio:
  - answer (0.95 s): 2100 Hz with a weak 2nd harmonic, a 15 Hz wobble at
    20%, and phase reversals at 0.45 and 0.90 s; the caller's faint
    980/1180 Hz FSK for its last 0.35 s;
  - FSK exchange (0.65 s): 1650/1850 Hz at 300 baud with a strong 2nd
    harmonic, over 980/1180 Hz, from seeded bits;
  - gap (40 ms), INFO bursts (1200 + 2400 + 3600 Hz), two line-probe
    chords (multiples of 150 Hz to 3750, without 900/1200/1800/2400,
    levels from `PROBE_GAIN_DB`, 6 dB drop halfway), 2400 Hz over shaped
    noise, gap (70 ms), and the 0.75 s training hiss (`HISS_DB`
    spectrum, 0.12 s fade);
  - all of it band-limited to 250-3900 Hz.
- Dial tone, DTMF 3-4-6-8, and ringback are unchanged. The call is now
  5.465 s (was 5.275); READY at 5765 ms, transition 6665 ms. The 750 ms
  skip rule and the hang-up click are unchanged.
- **The pitch rule** now reads: frequencies may switch abruptly (FSK) but
  never sweep.
- **Level:** the handshake sits in the mix with the answer tone about
  2 dB above the dial tone (RMS), where earlier versions had it. The
  phases keep the prototype's levels relative to each other.

### How it is built

- New pure module `js/audio/signals.js` computes the answer tone, FSK, the
  probe chord, and shaped noise sample by sample, from seeds (the engine's
  seeded generator). Why it computes them rather than using oscillators:
  - an oscillator's phase cannot be flipped, so the reversals would not
    be exact;
  - accumulating phase per sample makes every FSK switch
    phase-continuous;
  - oscillators start at phase 0, so the probe partials would line up
    into a spike;
  - biquads cannot follow the hiss's measured spectrum.

  The INFO bursts and the 2400 Hz tone stay oscillators (new per-tone
  `levels`).
- `synth.js` plays `signal` segments from AudioBuffers made once per
  context, and routes `band` segments through one shared 4th-order
  Butterworth high-pass + low-pass chain per sound, so the filter runs
  across the joins like a real line.
- `index.js` renders the signals once, in a task just after the first
  unlock (about 50 ms in Firefox), so neither the tap nor the first bank
  transition stalls.
- `modem.js` exports `HANDSHAKE`, `PROBE_GAIN_DB`, `HISS_DB`,
  `MODEM_HANDSHAKE_PHASES`, and `MODEM_TIMELINE` (spans, gaps included);
  `MODEM_HANDSHAKE_PARTS` is gone. `signals.js` is added to `APP_SHELL`.

### Verified against the prototype

The modem was rendered through the real synth (OfflineAudioContext,
headless Firefox, 44.1 kHz) and compared with `prototype-handshake.wav`:
- every phase boundary within 2 ms, and both phase reversals exact;
- the dominant frequencies of each phase match;
- each phase's loudness relative to the answer tone is within 1.1 dB
  (training hiss +1.1 dB, all others within 0.4 dB).

### Tests

The modem tests were rewritten (306 tests in all). They check:
- phase order (gaps included) and durations, and the unchanged dial-in;
- on the rendered samples:
  - the answer tone's reversal times, 15 Hz rate and 20% depth;
  - the FSK frequencies, decoded bit by bit against the seeded bits at
    300 baud;
  - no clicks;
  - the probe set, its skipped frequencies and its 6 dB drop;
  - the hiss spectrum's peaks;
- seeded determinism;
- the band limit on every handshake segment and none before it;
- no sweeps anywhere;
- READY at 5765 ms.

## 0.5.3 - iOS 27 status bar blur workaround

Version 0.5.3 (`CACHE_VERSION` `v0.5.3`).

- **Problem:** iOS 27 blurs anything drawn under a translucent status bar
  in installed home screen web apps (WebKit bug 325807). Page CSS cannot
  remove it.
- **Workaround** (not an Apple-documented fix; see ARCHITECTURE, "iOS
  status bar"):
  - Removed `apple-mobile-web-app-status-bar-style` (`black-translucent`)
    from `index.html`, so iOS draws a solid bar and the web view starts
    below it. `theme-color` and the manifest colours stay for Android and
    desktop.
  - Added `#topfix`, a 12 px strip in `var(--color-surround)` at the top
    edge for iOS to sample the bar colour from. It shows in standalone
    mode only, sits outside `#app` and below it (`.app` gets `z-index: 1`),
    and takes no touches.
- **Layout:** `.app`'s top padding (`env(safe-area-inset-top)` +
  `--space-2`) was the only use of the top inset. It is kept, so the header
  sits 8 px from the top now that the inset is 0, and still clears the notch
  if an older iOS reports an inset. Nothing sized from `100vh`,
  `screen.height`, or `innerHeight`: `html` and `body` were already
  `height: 100%`, with `body` fixed to `inset: 0`. No sizing change was
  needed.
- **Test:** `tests/status-bar.test.js` checks for no status-bar-style
  meta, `#topfix` as body's first child, and the standalone rule using a
  CSS variable.
- **iPhone:** delete the app from the home screen and add it again from
  Safari after deploying, because iOS reads the setting only at install.

## Piece pool: Z5 and Z5m excluded

No version bump.

- **`EXCLUDED_PIECES`** is now `X5`, `V5`, `W5`, `F5`, `F5m`, `Z5`, `Z5m`.
  The owner chose Z5 and Z5m with the piece gallery, because the upper
  banks were still unplayable. It is written on one line in exactly the
  form the gallery prints, and frozen in a separate statement.
- **Bank tables:** Z5 and Z5m are out of the hard tier, so the tables list
  only what is dealt. Banks 4 and 5+ shrink from 42 and 50 pieces to 38
  and 44; pentominoes are now 58% and 64% of the bag (were 62% and 68%).
  Nothing else was rebalanced; a separate difficulty pass is coming.
- **Piece gallery:** the Copy line is now the whole declaration
  (`export const EXCLUDED_PIECES = [...];`), with a note to paste it over
  the existing line. Before, it printed an assignment, and pasting that
  under the declaration reassigned the constant ("Assignment to constant
  variable").
- **Tests** (`tests/progression.test.js`): the expected excluded list
  includes Z5 and Z5m and checks the list is frozen; the bank 4 and 5 bag
  sizes are 38 and 44.

## Developer tool - piece gallery

No version bump: the game is unchanged.

- **`tools/piece-gallery.html`** and **`tools/piece-gallery.js`**: shows
  every piece side by side, to help decide which ones the game deals.
  Upper banks felt unplayable in playtesting because the odd pentominoes
  force too many incomplete rows.
- It imports the pieces, rotation states, bank tables, `EXCLUDED_PIECES`,
  the palette and the block shading from the game's modules, so no data
  is copied.
- It marks excluded pieces and shows weights and bag shares for banks 1 to
  8. Click pieces to build a proposed `EXCLUDED_PIECES` line to copy.
- It is not linked from the game, not in `APP_SHELL`, and not cached. See
  README, "Developer tools".

## Playtest pass 2 - modem screech restored, curated piece pool, audible rewards

Version 0.5.2 (`CACHE_VERSION` `v0.5.2`; music unchanged, `music-v2`).

### Playtest findings (iPhone)

1. Pass 1's handshake no longer sounded like a modem (the scrambled data
   sounded like a cartoon spaceship); Stage 5's was right, only short.
2. X5 and V5 were bad for play; W5 and F5 / F5m are similarly awkward.
3. The chip reward sound did not come through over the music.

### Changed

- **Modem handshake** rebuilt from the Stage 5 sound, still 2.7 s (whole
  call 5.275 s; READY at 5575 ms, transition 6475 ms, as before). Carrier
  exchange: Stage 5's carriers and FSK flips. Scrambled data: Stage 5's
  burst (1800, 1200, 2400 Hz noise bands over a steady 1800 Hz carrier),
  then the same bands chopped into stuttering bursts with level jumps and
  hard band switches. Training hiss and settle keep their roles, with fixed
  carriers. **Rule, commented in `modem.js` and tested: no pitch movement
  in the handshake** (no glides, sweeps, vibrato, or warble).
- `transitionTiming` rounds before its ceiling, so float dust in the
  schedule's sum cannot add a millisecond.
- **Curated piece pool:** `EXCLUDED_PIECES` (`X5`, `V5`, `W5`, `F5`, `F5m`)
  in `js/progression/banks.js`; every table passes through
  `withoutExcluded`, so they cannot be dealt even if listed by mistake.
  All 27 pieces stay in the engine. Tiers now: easy I5 L5 L5m P5 P5m,
  medium T5 U5 Y5 Y5m, hard N5 N5m Z5 Z5m. Bank 4: all nine earlier
  pentominoes and the four hard ones at 2 (bag 42). Bank 5+: easy at 2,
  medium and hard at 3 (bag 50). Pentomino share by bank: 0, 24, 36, 62,
  68% (was 0, 24, 38, 64, 69).
- **Reward sounds:** chips, tally blips, and the done tone are doubled an
  octave up and much louder (chips volume 0.4 -> 0.85, tally 0.3 -> 0.6,
  done 0.4 -> 0.8; chips notes 50 ms with a 1 ms attack). Rendered, the
  chips sound's loudest 50 ms went from -18.9 to -9.4 dBFS, against the
  chirp's -17.8 and the lock click's -21.5.
- **Music duck** under rewards: -10 dB, 30 ms down, back over 250 ms after
  the sound (`EFFECTS.duck`), on the music bus.
- **`?debug=1`** logs every sound effect next to the gestures: played (with
  the AudioContext state and "duck") or not (sfx off, no audio, hidden).
  Log length 8 -> 12 lines.
- Tests: 297 (was 285): no pitch movement in the handshake and its new
  parts; the excluded list, tables, and bags across banks and seeds, and a
  dealt game; duck settings and the façade ducking for rewards only; the
  chirp and chips in the same tick; chips after hide/show; the debug log
  lines; rewards louder than the click and chirp.

### Diagnosis: the chip sound

It fired every time (unit tests, and the browser: after the chirp,
after pause and resume, after hide and show). It was masked: 1 dB quieter
than the chirp just before it, with fundamentals at 523 to 784 Hz where
chiptune leads play and where a phone speaker is weakest, in 45 ms notes.

## Playtest pass 1 - wording, READY moment, microchips, reward sounds, music trim

Version 0.5.1 (`CACHE_VERSION` `v0.5.1`, `MUSIC_CACHE_VERSION` `v2`).

### Changed and built

- **Wording.** Player-facing text always says "MEMORY BANK", never "BANK"
  alone (it read as online banking). The transition is now "MEMORY BANK
  0x01 FULL" / "SWAPPING TO MEMORY BANK 0x02..." / "MEMORY BANK 0x02
  READY"; game over shows "MEMORY BANK 0x03". The HUD label BNK stays.
  README how-to-play rewritten to match. Tests check every screen line in
  every mode and the README section.
- **Longer modem handshake** (`js/audio/modem.js`): 0.96 s -> 2.7 s in four
  parts, carrier exchange (0.5 s), scrambled data (1.2 s, drifting
  warble under shifting noise bursts), training hiss (0.7 s), settle hush
  (0.3 s). Dial tone, DTMF 3-4-6-8, ringback, and answer tone unchanged.
  Whole call 5.275 s.
- **READY moment.** Every transition ends with "MEMORY BANK .. READY" for
  900 ms. Sound on: READY at 5575 ms (the modem's end), 6475 ms in all
  (was 4136 ms). Sound off: 4000 ms with READY at 3100 ms (was 2500 ms).
  Skip (still after 750 ms) hangs up, jumps to READY with the tally
  complete, plays only the done tone, and resumes 600 ms later.
  `transitionTiming(modemOn, { silentMs, readyMs })` replaces
  `transitionDurationMs`; timings in `SCREENS`.
- **Microchips** (`js/progression/chips.js`, `progress.js`): 2/3/4/5-row
  clears earn 1/2/3/5 chips, held through the bank (including the
  completing clear), cashed in at bank complete for chips x `0x100` x the
  bank completed, reset, and lost at game over. Events `chipsEarned`,
  `chipsCashed`, `chipsLost`; `scoreChanged` reason `'chips'`.
- **Chip display:** a microchip icon drawn in code (`js/render/chip.js`)
  with "+0x03 CHIPS" at the cleared rows, rising and fading over 1 s, below
  the FULL WORD banner on a 5-row clear (`js/ui/chip-flash.js`); a `CHP`
  register in the HUD; the READY tally "CHIPS 0x03 = +0x0600" counting up
  (`js/ui/tally.js`; the HUD's SCR counts up with it); "CHIPS LOST 0x02"
  on game over.
- **HUD:** hex and decimal in three rows (SCR HI / BNK LNS / CHP), binary
  in five; header 60 -> 64 px, fixed in every mode; binary text capped at
  11 px on 12 px lines (was 13 px). Glow only when a value goes up.
- **Reward sounds** (`EFFECTS` in `js/audio/sfx.js`): chips earned, a
  square-wave arpeggio up from C5, one note per chip; on a FULL WORD the
  full two-octave run to C7, replacing the separate FULL WORD sound. Cash-in
  tally: a blip per step (one per chip, at most 8, 60 ms apart), then a
  two-note done tone, only after the modem.
- **Iced Village** cut to a 2:24.000 loop (48 bars at 80 BPM) with a
  20 ms wrap crossfade by `scripts/convert-music.sh` (which can now
  rebuild single tracks): 6,990,410 -> 2,305,087 bytes; decoded about 51 MB
  at 44.1 kHz (55 MB at 48 kHz) instead of about 150 MB. Music total
  12,205,959 bytes. Originals unchanged.
- Tests: 285 (was 259): chips table, accumulation, bank-completing clear,
  cash-in math, reset, loss, events; handshake parts and lengths; timing on
  and off; skip with cash-in; tally count-up and rate limit; reward sounds;
  CHP formatting; wording; and the audio façade against a fake
  AudioContext (`tests/audio-facade.test.js`).

### Decisions

- Iced Village cut at 2:24.000 (bar 48, the end of the main section's
  8-bar phrase): the loop then falls back into the filtered intro, as the
  track itself drops into its filtered breakdown at 1:36.
- READY keeps the earlier lines on screen (a terminal log) and moves the
  cursor to the READY line.
- Taps during READY are ignored (it is under a second); pause still works.
- The tally points use a 16-bit `cashIn` register (`+0x0600`) so the number
  stays fixed-width like every other.
- The FULL WORD event is silent; its flourish lives in the chips sound.
- A cash-in is not announced by the `CHP` register glowing; it drops to 0
  at READY without a glow (glow now only on increases, for every register).
- Music cache bumped to v2 (the file name stayed the same).

### Open items

- iPhone: the reward sounds and longer handshake, the Iced Village wrap,
  binary HUD readability at 11 px, and binary transition lines at 320 px
  (7-8 px to stay on one line).
- Tune the chips table, `CHIP_VALUE`, and the 6.5 s transition.

## Stage 5 - Audio and the settings screen

Version 0.5.0 (`CACHE_VERSION` `v0.5.0`).

### Built

- **Music assets.** Seven tracks from OpenGameArt.org, each CC0 as read
  from its license screenshot in `docs/licenses/music/`, credited in
  CREDITS.md. Converted by the new `scripts/convert-music.sh` (ffmpeg):
  silence trimmed at -60 dBFS, MP3 128 kbps, 44.1 kHz, mono only for the
  two mono sources; 16,891,282 bytes in all. Originals untouched.
- **Audio engine** (`js/audio/`): pure modules (`schedule.js`, `modem.js`,
  `sfx.js`, `music.js`) and a thin Web Audio layer (`context.js`,
  `synth.js`, `player.js`), joined by `index.js`. All sound is driven by
  the session's single event hook.
- **Modem dial-in** on bank complete: dial tone, DTMF 3-4-6-8 ("DIM8"),
  ringback, 2100 Hz answer tone, 1200/2400 bps style handshake; 3.535 s,
  after the music fades. Skipping hangs up with a click.
- **Effects:** lock click, faint rotation tick, line clear chirp (rising
  with the line count), FULL WORD arpeggio, busy signal on game over. One
  tuning table (`EFFECTS`).
- **Game over** shows "NO CARRIER" above "MEMORY FULL".
- **Music:** gameplay only; one track per bank, cycling; pauses and resumes
  in place; fades out before the modem; gapless loops from decoded buffers
  with sample-exact loop points (MP3 padding handled); at most two tracks
  decoded at a time.
- **Bank transition length:** the modem's length plus a margin (4136 ms)
  with sound effects on; 2500 ms with them off. Skip rule unchanged.
- **iOS:** audio starts only from a user gesture; `navigator.audioSession`
  type `'ambient'` where available (silent switch respected, mixes with
  other audio); suspended while the page is hidden.
- **Settings screen** from SETTINGS buttons on the start screen and the
  pause menu: MUSIC, SOUND FX, NUMBER FORMAT (shared with the HUD tap),
  BACK. Built from a table of rows (`js/ui/settings.js`) over a generic
  choice state (`js/ui/choice.js`); saved as `mem-block-8:music`,
  `:soundFx`, `:numberMode`. The game stays paused while it is open.
- **Session hook events:** `screen` (every screen change), `newGame`,
  `rotated` (successful rotations only), alongside the engine and
  progression events. The engine is unchanged.
- **Caching:** new modules and the first track in `APP_SHELL`; other
  tracks cached on first use in a separate `mem-block-8-music-v1` cache
  that survives app updates. `scripts/serve.py` serves `.mp3` as
  `audio/mpeg`.
- Tests: DTMF table, modem schedule (order, digits, no overlapping tones,
  length), effect table coverage, playlist and cycling, loop points, the
  memory rule, the transition length rule, settings persistence (including
  storage that throws) and HUD sync, the settings flow in the session, the
  new hook events, and the music player against a fake AudioContext
  (259 tests total).

### Decisions

- Iced Village is offered as CC-BY 4.0 **or** CC0 on its page; used under
  CC0 (author credited anyway).
- Playlist order puts a short track first (it is cached at install) and the
  7-minute track last (largest decoded size).
- The audio context is unlocked by any touch, click, or key press (capture
  phase), not only the start tap, which also covers settings toggles and
  RESUME; with both settings off no context is created at all.
- The rotation tick comes from a session `rotated` event instead of a new
  engine event, so the engine is unchanged.
- The transition length uses the sound effects setting and whether audio
  is actually available (so a browser without Web Audio keeps 2.5 s).
- The decoded buffer's length decides the loop points: equal to the known
  length means the browser trimmed the padding; longer means it did not and
  the 1105 priming samples are skipped. Both verified to be sample-exact.
- Music cache separate from the app shell cache, so updates do not
  re-download 15 MB of music.
- Turning SOUND FX on plays a click as confirmation; turning MUSIC off
  frees the decoded tracks.

### Open items

- iPhone testing: audio unlock, silent switch, gapless loops on WebKit,
  memory with the 7-minute track, modem sound, mix levels.
- Effect and music volumes are first-pass.

## Stage 4 - Register-dump HUD, bundled font, Stage 3 fixes

Version 0.4.0 (`CACHE_VERSION` `v0.4.0`).

### Built

- **Register-dump HUD** (`js/ui/hud.js`) in the header beside the pause
  button: `SCR`, `HI`, `BNK`, `LNS` as fixed-width registers (24, 24, 8,
  and 16 bits). Hex and decimal use a 2 x 2 grid; binary shows one
  register per row. Tapping the HUD (a native `<button>`) cycles hex ->
  binary -> decimal for every number in the game; the mode is saved as
  `mem-block-8:numberMode`. A changed value glows for 200 ms (CSS).
- **One number formatter** (`js/ui/format.js`): a single width table
  (`REGISTERS`), `formatNumber(value, field, mode)`. Overflow widens a
  field (whole nibbles in binary), never truncates. Start, transition, and
  game-over screens use it in the current mode and update in place when it
  changes. Overlay lines never wrap; long lines shrink to fit.
- **Layout:** the page title moved onto the start screen ("MEM BLOCK 8 /
  DIM8 LABS") and the footer HUD is gone; the header is a fixed 60 px (four
  binary rows), so changing mode never resizes the playfield.
- **IBM Plex Mono** bundled (`assets/fonts/`): official Latin-1 woff2
  subsets of Regular (17,544 bytes) and SemiBold (17,872 bytes) from the
  `@ibm/plex-mono` 2.5.0 npm package (integrity checked), with the OFL
  license text. `@font-face` with `font-display: swap`, Regular preloaded,
  system monospace fallback, both files in `APP_SHELL`.
- **Canvas font loading** (`js/render/fonts.js`): the first canvas text
  draw waits (up to 1.5 s) for the font, and the backdrop is rebuilt
  (`renderer.rebuild()`) when it loads.
- **Storage:** `createChoiceStore` for one-of-a-list settings.
- **Stage 3 fix: new mix at once.** `setWeights(weights, { resetBag: true
  })` discards the rest of the bag; the session uses it on every bank
  change. The previewed piece is still dealt next; the new mix follows.
  Deterministic (same seeded PRNG).
- **Stage 3 fix: FULL WORD** is hidden the moment a bank transition starts.
- `scripts/serve.py` serves `.woff2` as `font/woff2`.
- Tests: formatter (every mode and width, zero, maximum, overflow,
  nibbles, prefixes, case), mode cycle and persistence (including storage
  that throws), HUD row sizing, font loading, `resetBag` (preview
  consistency, determinism across a bank change), FULL WORD hiding, HUD
  high score (219 tests total).

### Decisions

- HUD in the header instead of a title: the start screen carries the
  title, so the header can hold the HUD all the time without the layout
  changing between screens.
- Fixed header height for all modes, rather than letting binary make the
  header taller: switching modes never resizes the playfield. The
  playfield is the same size as in Stage 3 on tall phones (where width
  limits it) and slightly larger on short ones.
- Binary layout: one register per row with a smaller font (up to 13 px),
  rather than shrinking a 2 x 2 grid (which would need about 7 px at
  320 px wide).
- HI follows the live score once it is beaten.
- The start screen's capacity line is formatted as a 16-bit `words`
  register (`0x0108 WORDS`); the board size "12 x 22" stays decimal.
- Game-over values are one per line, and a screen's detail lines share
  one font size.
- Only Regular and SemiBold are bundled (SemiBold for the start screen
  title); no Bold.

### Open items

- Test the HUD tap target, glow, and binary readability on the iPhone.
- Binary game-over details are small on 320 px phones (7.2 px).

## Stage 3 - Memory banks, scoring, pause menu, high score

Version 0.3.0 (`CACHE_VERSION` `v0.3.0`).

### Built

- **Progression** (new `js/progression/`, pure and unit tested):
  - `banks.js`: one bank table (banks 1-5: lines, gravity, piece weights by
    id) plus a gravity curve function for bank 6 onwards (x4/5 per bank in
    whole milliseconds, floor 60 ms/row).
  - `scoring.js`: line clears 0x40, 0x80, 0x100, 0x200, 0x400 for 1-5 lines,
    times the bank number; a 5-line clear is a FULL WORD; soft drop 1 point
    per row, hard drop 2 points per row.
  - `progress.js`: score, bank, total lines, and lines in the bank, with
    carry-over; emits `scoreChanged`, `fullWord`, `bankComplete`.
- **Engine additions:** `lineClearDelayMs` (default 200) keeps full rows on
  the board, flashing, before removal; `spawnDelayMs` (default 100) before
  each spawn. Both count in ticks and accept 0. New snapshot fields
  `phase`, `clearingRows`, `clearProgress`; new `clearStarted` event;
  `locked` now carries `softDropRows`. Moves, rotations, and hard drops do
  nothing during the delays; soft drop still toggles.
- **Bank transition:** "BANK 0x01 FULL" then "CONNECTING TO BANK 0x02..."
  for 2.5 s, skippable by tap or key after 750 ms; the engine is frozen
  meanwhile. `bankComplete` reaches the single event hook
  (`deps.onEvent`) for Stage 5's modem sound.
- **Per-bank playfield tints:** six placeholder dark tints in
  `js/themes/default.js`, cycling; `tintForBank` helper. The DIM8 mark
  follows the tint.
- **Feedback:** clearing rows wash to white and back on the canvas; "FULL
  WORD" fades in and out over the playfield.
- **Pause button and menu:** a native 44 x 44 px `<button>` with a CSS
  pause icon, top right above the playfield. The pause menu ("PAUSED",
  RESUME, RESTART -> CONFIRM RESTART) opens from the button, P / Escape,
  or when the page is hidden.
- **Placeholder HUD:** `SCORE 0x000000  BANK 0x01  LINES 0`; formatting in
  `js/ui/format.js` for Stage 4 to replace.
- **High score:** `js/storage` implemented (every access in try/catch,
  keys prefixed `mem-block-8:`); saved as `mem-block-8:highScore`. The
  game over screen shows score, bank, lines, and NEW HIGH SCORE or the
  saved high score.
- Session states are now start, playing, paused, transition, gameOver;
  engine events are handled after every tick.
- `js/input/dom.js` ignores pointers that start on native controls, so menu
  buttons over the well get real clicks.
- Tests: engine delays and determinism, banks, gravity curve, scoring,
  progress, session (pause menu, transition, high score), storage
  (including storage that throws), tints, formatting (194 tests total).

### Decisions

- `linesCleared` (and so scoring and bank completion) fires when the rows
  are removed, at the end of the flash; `clearStarted` marks the start of
  the flash for sound.
- Pause button in the header rather than the footer HUD: far from the
  bottom soft-drop strip where thumbs rest.
- Taps on the playfield no longer resume from pause; only the menu
  buttons (or P / Escape / Enter) do, so a stray touch cannot resume.
- Pausing during a bank transition finishes the transition first, so
  resuming lands in normal play.
- The bank tint changes when the transition ends ("connected").
- Weights are small (bags of 16-52 pieces) to keep the lag before a new
  mix short, since weights apply from the next bag.

### Open items

- Tune the bank table, gravity curve, and transition timings by playtesting.
- Test the pause button and menu on the iPhone (WebKit could not be tested
  here).
- Possibly let a bank change reshuffle the rest of the current bag (an
  engine change; not done).

## 0.2.1 - iOS zoom fix and no-cache dev server

`CACHE_VERSION` `v0.2.1`.

### Problem

On an iPhone (Brave, WebKit) over the LAN, taps still zoomed the page. The
Stage 2 rules relied on CSS alone: only the playfield had
`touch-action: none`; the header, HUD, and margins had `manipulation`
(which still allows pinch zoom); child elements relied on a parent's
`touch-action`, which is not inherited and which WebKit has supported only
partly; and no touch events were cancelled. Also, `python3 -m http.server`
sends no `Cache-Control`, so a phone could keep running older files.

### Changed

- New `js/touch-guard.js`: non-passive `touchstart`/`touchmove`/`touchend`
  listeners that `preventDefault()` on the whole game container, plus
  `dblclick` and the WebKit `gesture*` pinch events (moved from `main.js`).
  Pointer Events still reach the gesture recogniser (verified in Firefox:
  touch events cancelled, all gestures recognised). Native controls and
  `[data-native-touch]` elements are exempt so the Stage 6 settings screen
  can receive clicks.
- CSS: `touch-action` (with a `manipulation` fallback), no selection, no
  callout, and no tap highlight declared on `.app` and every element in it.
- New `scripts/serve.py`: standard-library dev server on port 8088 (or a
  given port), all interfaces, `Cache-Control: no-store`, explicit MIME
  types for `.js` and `.webmanifest`, prints the LAN URL.
- Docs: full touch-protection table in ARCHITECTURE.md; README uses
  `scripts/serve.py` and covers same-network and firewall requirements.
- Tests for the touch guards (127 tests total).

### Open items

- Confirm on the iPhone that zoom is gone (WebKit cannot be tested here).

## Stage 2 - Rendering, input, and game loop (first playable build)

Version 0.2.0 (`CACHE_VERSION` `v0.2.0`).

### Built

- **Canvas renderer** (`js/render/`): whole-device-pixel cell sizes for
  sharp drawing at any `devicePixelRatio`, only the 22 visible rows drawn,
  faint grid, bevelled blocks coloured by piece type, see-through next-piece
  preview at the top right (60% size, 35% opacity).
- **DIM8 logo** drawn in code behind the blocks, as a slightly lighter
  shade of the background. `logoPlacement` option: `'bottom'` (default) or
  `'center'`.
- **Placeholder theme** `js/themes/default.js` with 27 distinct, bright
  piece colours (minimum CIELAB delta-E 25 between any two). The renderer
  receives the theme as input.
- **Input** (`js/input/`): one bindings table for every mapping and tuning
  value; pure gesture recogniser (taps, hold-repeat, mid-swipe rotation,
  double-tap hard drop, bottom-strip soft drop, multiple pointers, cancel);
  pure keyboard state with its own auto-repeat; thin DOM adapter using
  pointer capture.
- **Game loop** (`js/loop.js`): `requestAnimationFrame` with a
  fixed-timestep accumulator at `TICK_MS`, frame gaps clamped to 250 ms.
- **Session** (`js/session.js`): start, playing, paused, game-over screens;
  auto-pause when the page is hidden; single `handleEvents()` hook for
  engine events.
- **Screens and HUD**: start ("MEMORY BANK READY_ / TAP TO START"), pause,
  game over ("MEMORY FULL / TAP TO REBOOT"), placeholder "LINES n" HUD.
- **Debug overlay** with `?debug=1`; URL switches `?moveOn=`,
  `?doubleTap=`, `?logo=` for comparing variants on a phone.
- **Touch safety** for iOS WebKit: `touch-action` rules, no selection or
  callouts, pinch `gesture*` events blocked, `maximum-scale=1`.
- Every module added to the service worker's `APP_SHELL`.
- Tests: gesture recogniser, keyboard, loop accumulator, session flow,
  colour/layout/logo helpers, theme palette, URL options (124 tests total).

### Decisions

- Swipes rotate (left = counterclockwise; right, up, down = clockwise);
  hard drop is a centre double tap. Tap = under 200 ms and under 10 px;
  swipe = 30 px; repeat 170 ms then 50 ms; double tap 250 ms / 40 px.
- Defaults `moveOn: 'up'` and `doubleTapMode: 'center'`; both variants
  are built in for phone comparison.
- Input actions are applied to the engine as they arrive instead of
  through a queue (the engine accepts commands between ticks).
- Once hold-repeat starts, the touch is committed to repeating and further
  movement is ignored until release.
- Game-over screen ignores input for 500 ms so an in-flight tap cannot
  instantly restart.
- Each new game is seeded from `crypto.getRandomValues`; gravity is a
  fixed 800 ms per row and weights are `DEFAULT_WEIGHTS` until Stage 3.
- No landing indicator: the option exists but is off by design.

### Open items

- Real iPhone testing of controls, feel of the variants, and logo placement.
- Push and enable GitHub Pages for HTTPS testing and home-screen install.

## Stage 1 - Core engine

### Built

- Pure, deterministic engine in `js/engine/`: 12 x 26 board (4 hidden
  spawn rows), all 27 one-sided polyominoes of 3 to 5 cells, custom
  rotation with a single kick list, gravity, soft and hard drop, lock delay
  with a reset cap, line clears, block-out and lock-out game over, seeded
  mulberry32 PRNG, weighted bag randomiser, preview queue, event queue,
  text debug view.
- 72 unit tests including a determinism replay test.
- Docs: engine API, coordinate system, determinism rules.
- Removed the rotated "DIM8 LABS" text watermark; dev port changed to 8088.

### Decisions

- Rotation about the base bounding-box centre, rounding half cells towards
  the top-left; all four states precomputed from the base shape (no drift).
- Kicks: stay, 1 left, 1 right, 2 left, 2 right, 1 up.
- Spawn column `floor((12 - width) / 2)`; lowest cells in row 3.
- Lock timer and resets refresh only on reaching a new lowest row.
- Time kept in integer 1/120 ms units; 120 ticks per second.

## Stage 0 - Skeleton

### Built

- Folder structure, boot screen with the 12:22 playfield box, manifest,
  placeholder SVG icon, cache-first versioned service worker, docs
  (README, DESIGN, ARCHITECTURE, ROADMAP, CONTRIBUTING, CREDITS), and a
  Node test setup with no dependencies.

### Decisions

- Plain ES modules, no build step; relative paths for GitHub Pages.
- `package.json` only for `"type": "module"` and the test script.

### Open items

- License (still open). Proper PNG icons (Stage 7).
