<!-- docs/ARCHITECTURE.md - How Mem Block 8's code is organised and how data flows through it. -->
# Mem Block 8 - Architecture

## Principles

- Native ES modules, loaded directly by the browser. No build step.
- No globals: modules import what they need and export what others need.
- The game must run with no network after first load (service worker cache).

## Module layout

| Path | Responsibility | Touches DOM? | Stage |
| --- | --- | --- | --- |
| `index.html` | App shell markup | - | 0 |
| `css/main.css` | Layout and design tokens (CSS custom properties) | - | 0 |
| `sw.js` | Service worker: cache-first app shell, versioned caches, runtime music cache | No (worker) | 0, 5, 7 |
| `js/main.js` | Small bootstrap: wires engine, session, loop, input, render, ui, audio, settings; audio unlock on gestures | Yes | 0, 2, 5 |
| `js/session.js` | Session states (start / playing / paused / settings / transition / gameOver), routes actions and menu commands, handles engine and progression events, reports everything through the one sound hook | No (via injected deps) | 2, 3, 5 |
| `js/loop.js` | `requestAnimationFrame` loop with fixed-timestep accumulator | rAF only | 2 |
| `js/url-options.js` | Parses `?debug=1`, `?logo=`, `?moveOn=`, `?doubleTap=` | No | 2 |
| `js/touch-guard.js` | Cancels touch, double-click, and pinch events on the game container (see Touch rules) | Yes | 2 |
| `scripts/serve.py` | No-cache development server for LAN phone testing (not part of the app) | - | 2 |
| `scripts/convert-music.sh` | Rebuilds `assets/music/*.mp3` from the local originals with ffmpeg (not part of the app) | - | 5 |
| `js/engine/` | Game rules: grid, pieces, rotation, collision, line clears, gravity, lock delay, line clear and spawn delays | **Never** | 1, 3 |
| `js/progression/` | Memory banks (levels), scoring, microchip bonuses, progress state; pure like the engine | **Never** | 3, pass 1 |
| `js/render/` | Draws engine state to a canvas | Yes | 2 |
| `js/input/` | Touch and keyboard events -> abstract actions | Yes | 2 |
| `js/ui/` | Screens (start, pause menu, settings, memory bank transition, game over), FULL WORD banner, "+3 CHIPS" flash, chip tally count-up, register-dump HUD and pause button, the one number formatter, the settings table and choice states, debug log | Yes | 2, 3, 4, 5, pass 1 |
| `js/audio/` | Sound: pure schedules (modem, effects), playlist and loop rules; thin Web Audio layer (context, synth, music player) | Web Audio only | 5 |
| `js/themes/` | Theme data (placeholder `default.js` with per-bank tints, era themes later), `tintForBank` | No (data) | 2, 3, 6 |
| `js/storage/` | The only code that touches `localStorage`, always in try/catch; high score and choice (setting) stores | localStorage only | 3, 4 |
| `assets/fonts/` | IBM Plex Mono Latin-1 woff2 subsets (Regular, SemiBold) and their OFL license | - | 4 |
| `assets/music/` | Converted CC0 music tracks (MP3); `originals/` holds the sources locally and is gitignored | - | 5 |
| `docs/licenses/music/` | Screenshot of each track's source page showing its license (the provenance record) | - | 5 |
| `tests/` | `node --test` unit tests: engine and delays, progression, storage, gestures, keyboard, loop, session, render helpers, themes, format, settings, audio schedules and playlist, music player and audio façade (fake context) | No | 1+ |

## The engine is pure

`js/engine` must never reference `window`, `document`, canvas, Web Audio,
`localStorage`, timers, clocks (`Date.now`, `performance.now`),
`Math.random`, or `requestAnimationFrame`.

- **Time** advances only through `game.step()`, exactly one tick
  (`TICK_MS` = 1000/120 ms) per call.
- **Randomness** comes only from the engine's seeded PRNG (`rng.js`,
  mulberry32), seeded from `config.seed`. The caller chooses the seed
  (Stage 2 will derive one from the clock or `crypto` *outside* the engine).

This keeps the engine unit-testable under Node and reusable by an AI
opponent (possibly in a worker or WebAssembly) without changes.

### Engine modules

| File | Contents |
| --- | --- |
| `constants.js` | `COLS`, `VISIBLE_ROWS`, `HIDDEN_ROWS`, `TOTAL_ROWS`, `TICKS_PER_SECOND`, `TICK_MS`, internal time units |
| `pieces.js` | The 27 piece definitions (`PIECES`), `getPieceById`, `groupPiecesBySize` |
| `rotation.js` | Precomputed rotation states, `KICK_OFFSETS`, `tryRotate` |
| `board.js` | Board creation, collision, placement, full-row detection, row clearing |
| `rng.js` | `createRng(seed)` (mulberry32) |
| `randomizer.js` | `createBag(rng, weights)`, `DEFAULT_WEIGHTS` (engine default; the game uses bank tables), `validateWeights` |
| `config.js` | `DEFAULT_CONFIG`, `resolveConfig` (defaults + validation) |
| `game.js` | `createGame(config)`: phases, active piece, gravity, lock delay, line clear and spawn delays, events |
| `debug.js` | `boardToString` (text view), `boardFromRows` (test fixtures) |
| `index.js` | Re-exports the public API; import from here |

### Coordinate system

```
     x = 0 ............ 11
  y = 0   +------------+   \
      1   |            |    | hidden spawn rows (HIDDEN_ROWS = 4)
      2   |            |    |
      3   |            |   /  pieces spawn with their lowest cells here
      4   +------------+   \
      .   |            |    | visible rows (VISIBLE_ROWS = 22)
     25   +------------+   /  floor row
```

- x grows to the right, y grows **downward**. Rows 0..3 are hidden, rows
  4..25 are visible; the renderer draws row `y` at screen row `y - 4`.
- The board is a flat `Uint8Array` of `COLS * TOTAL_ROWS` (12 x 26)
  cells, indexed `y * COLS + x`. `0` is empty; any other value is the
  **piece index + 1** of the piece that placed the cell.
- Anything outside 0..11 / 0..25 counts as blocked (walls, floor, and a
  ceiling above row 0).
- A piece has a position `(x, y)` and a rotation `0..3`. Its cells are the
  precomputed rotation-state cells (which may be negative) plus `(x, y)`.
  Snapshots always include the absolute `cells`, so consumers never need
  rotation tables.

### Engine API

```js
import { createGame, TICK_MS } from './engine/index.js';

const game = createGame({ seed: 1234 });   // all config fields optional
game.moveLeft();          // -> boolean (false if blocked)
game.rotateCW();          // -> boolean (false if no kick fits)
game.setSoftDrop(true);
game.step();              // advance one TICK_MS
const state = game.getState();
for (const event of game.drainEvents()) { /* ... */ }
```

**Config** (`createGame(config)`), with defaults:

| Field | Default | Meaning |
| --- | --- | --- |
| `seed` | `8` | PRNG seed |
| `weights` | `DEFAULT_WEIGHTS` | Bag weight table, piece id -> count |
| `gravityMsPerRow` | `1000` | Natural fall speed |
| `softDropFactor` | `20` | Fall speed multiplier while soft dropping |
| `lockDelayMs` | `500` | Resting time before a piece locks |
| `maxLockResets` | `15` | Lock timer restarts per piece (refreshed on a new lowest row) |
| `lineClearDelayMs` | `200` | Full rows stay (flashing) this long before removal; `0` = at once |
| `spawnDelayMs` | `100` | Wait after a lock (and after any line clear delay) before the next spawn; `0` = at once |
| `previewCount` | `1` | Length of the preview queue (0 allowed) |
| `initialBoard` | `null` | Optional starting board (copied); for tests and future challenge modes |

**Commands** take effect immediately and return whether they succeeded:
`moveLeft()`, `moveRight()`, `rotateCW()`, `rotateCCW()`, `hardDrop()`.
With no active piece (during the delays, or after game over) they do
nothing and return `false`. `setSoftDrop(held)` toggles soft drop and works
in every phase. `setWeights(table)` applies from the next bag;
`setWeights(table, { resetBag: true })` discards the rest of the current
bag so the next piece dealt comes from a fresh bag of the new table.
Pieces already in the preview queue are never replaced (the player has
seen them): they are still dealt first, and the new mix starts after them.
The fresh bag is shuffled by the same seeded PRNG, so this stays
deterministic. `setGravityMsPerRow(ms)` applies immediately. The session
calls `setWeights(..., { resetBag: true })` and `setGravityMsPerRow` when
a memory bank changes. Because the bank completes at the end of the line
clear flash, before the spawn delay ends, the preview shown during the
transition is exactly the piece that follows it.

**`getState()`** returns a frozen snapshot: `tick`, `board` (a copy),
`active` and `landing` (each `{ id, index, rotation, x, y, cells }` or
`null`), `preview` (`[{ id, index }]`, next first), `phase`
(`'falling' | 'clearing' | 'spawnDelay' | 'gameOver'`), `clearingRows`
(rows flashing before removal, else `[]`), `clearProgress` (0..1 through
the line clear delay, for drawing), `linesCleared`,
`resting`, `softDrop`, `playing`, `gameOver`, `gameOverReason`
(`'blockOut' | 'lockOut' | null`).

**`drainEvents()`** returns and clears queued events, each with a `tick`:

| Event | Extra fields |
| --- | --- |
| `spawned` | `id`, `index`, `x`, `y` |
| `locked` | `id`, `index`, `cells`, `hardDrop`, `dropDistance` (hard drop rows), `softDropRows` (rows fallen under soft drop) |
| `clearStarted` | `rows`, `count`: full rows found; the flash starts |
| `linesCleared` | `rows` (indices before clearing, ascending), `count`, `total`: at the end of the flash |
| `gameOver` | `reason` |

### Phases and tick order

The game is always in one phase:

```
falling --lock--> clearing (only if rows are full) --> spawnDelay --> falling
   any phase --> gameOver
```

Each `step()` (except after game over) increments `tick`, then:

- **falling:** apply gravity (unless resting); if the piece is now resting,
  add one tick to the lock timer and lock when it reaches `lockDelayMs`.
  Locking writes the cells (`locked`), checks lock out, then looks for full
  rows. Full rows: `clearStarted`, enter **clearing**. None: enter
  **spawnDelay**.
- **clearing:** count one tick; after `lineClearDelayMs` remove the rows
  (`linesCleared`) and enter **spawnDelay**.
- **spawnDelay:** count one tick; after `spawnDelayMs` spawn the next piece
  (`spawned`, or `gameOver` on block out) and return to **falling**.

A delay of 0 skips its phase within the same tick, which gives the Stage 1
behaviour (lock, clear, and spawn all at once). A hard drop locks
immediately when called; its delays then count from the following ticks.
Timers are kept in integer units of 1/120 ms so one tick is exactly 1000
units and there is no floating-point drift; delays must be whole
milliseconds.

### Determinism rules

- Same config (including `seed`) + same commands issued before the same
  tick numbers = identical game, in every browser and in Node.
- No clocks, no `Math.random`, no dependence on object key order (bags are
  filled in piece-index order) or on frame rate.
- The PRNG uses only 32-bit integer operations, which JavaScript specifies
  exactly.
- If code outside the engine needs randomness that must not disturb the
  game (for example visual effects), it uses its own generator, never the
  engine's.

## Progression (`js/progression/`)

Pure logic with the same rules as the engine (no DOM, clocks, storage, or
randomness), fully unit tested.

| File | Contents |
| --- | --- |
| `banks.js` | `BANK_TABLE` (banks 1-5), `GRAVITY_RAMP`, `PENTOMINO_TIERS`, `EXCLUDED_PIECES` (never dealt; `withoutExcluded` filters every table), `getBank(n)`, `gravityForBank(n)` |
| `scoring.js` | `LINE_CLEAR_POINTS`, `lineClearPoints(lines, bank)`, `isFullWord`, `dropPoints(locked)` |
| `chips.js` | `CHIPS_PER_CLEAR` (the chips table), `CHIP_VALUE` (`0x100`), `chipsForClear(lines)`, `cashInPoints(chips, bank)` |
| `progress.js` | `createProgress()`: score, bank, total lines, lines in the bank, chips held; `handle(engineEvent)` returns progression events |
| `index.js` | Re-exports; import from here |

Progression events:

| Event | Fields | Cause |
| --- | --- | --- |
| `scoreChanged` | `score`, `points`, `reason` (`'lines'`, `'drop'`, or `'chips'`) | `locked` with a drop bonus, `linesCleared`, or a cash-in |
| `fullWord` | `bank` | A 5-line `linesCleared` |
| `chipsEarned` | `count` (this clear), `total` (held now), `fullWord` | A `linesCleared` of 2 or more rows |
| `chipsCashed` | `count`, `points`, `bank` (the bank completed) | The bank completed with chips held; comes just before its `bankComplete` |
| `chipsLost` | `count` | The engine's `gameOver` with chips held |
| `bankComplete` | `fromBank`, `toBank`, `weights`, `gravityMsPerRow` | Lines in the bank reached `linesToComplete` (extra lines carry over) |

Order for one `linesCleared`: `scoreChanged`, `fullWord`, `chipsEarned`,
then for each bank it completes `chipsCashed`, `scoreChanged` (`'chips'`),
`bankComplete`. **Chip logic lives only in `js/progression/`:** the chips
are counted, cashed in (the score changes at that moment), reset, and lost
there. The session and UI only display them; the transition's tally is
an animation of a score change that has already happened.

Progress never calls the engine. `bankComplete` carries the next bank's
settings, and the session applies them (`game.setWeights`,
`game.setGravityMsPerRow`) and starts the transition.

## Session states (`js/session.js`)

```
 start --tap/Enter--> playing <--pause button, P/Esc, page hidden / RESUME, P/Esc/Enter--> paused
 start, paused --SETTINGS--> settings --BACK, P/Esc--> back where it was opened from
                       playing --bankComplete--> transition (swap, then READY) --timing().durationMs--> playing
                       transition: tap/key after 750 ms --> READY at once (tally complete) --600 ms--> playing
                       playing --gameOver--> gameOver --tap/Enter after 500 ms--> playing
                       paused --RESTART, then CONFIRM RESTART--> playing (new game)
                       transition --pause--> paused (the transition is finished first)
```

| State | Engine steps? | Input |
| --- | --- | --- |
| `start` | No game yet | Tap or Enter starts |
| `playing` | Yes | Actions become engine commands |
| `paused` | No; loop stopped | Menu buttons (`handleCommand`); P / Escape / Enter resume; taps on the well ignored |
| `settings` | No; loop stopped (the game stays paused when opened from the pause menu) | Setting buttons, BACK; P / Escape go back; taps on the well ignored |
| `transition` | No; loop keeps running so `frameEnd` can move it on | Pause; during the swap, after `skipAfterMs`, a tap or key press skips to READY; during READY, taps wait |
| `gameOver` | No; loop stopped | Tap or Enter restarts (after 500 ms) |

- Events are drained and handled **after every tick** (and once more per
  frame for events caused by commands), so a transition or game over
  freezes the engine on the exact tick it happened.
- `handleEvents()` is the one place events are handled. Every engine and
  progression event is also passed to `deps.onEvent`, **the single sound
  hook** (`audio.onEvent` in `main.js`). The session adds its own events to
  the same hook: `{type: 'screen', screen, from, bank}` on every screen
  change, `{type: 'newGame'}`, `{type: 'rotated', direction}` when a
  rotation succeeds, and `{type: 'bankReady', bank, count, points, steps,
  stepMs, skipped}` when the READY moment begins (the chip tally's sound
  and the hang-up on a skip). No audio calls appear anywhere in game logic.
- **The transition** has two parts: the swap ("MEMORY BANK 0x01 FULL",
  "SWAPPING TO MEMORY BANK 0x02...", the modem) and the READY moment
  ("MEMORY BANK 0x02 READY", the chip tally). `deps.transition.timing()`
  is called when each transition starts and returns `{ readyAtMs,
  durationMs }`; `main.js` takes it from `audio.transitionTiming`, which
  matches the modem while sound effects are on (`transitionTiming` in
  `js/audio/modem.js`). `frameEnd` enters READY at `readyAtMs` and ends
  the transition at `durationMs`. A skip enters READY at once, with the
  tally complete, and ends `skipReadyMs` later. All of these timings, the
  tally's step length and step limit, and the FULL WORD and chip flash
  durations are in `SCREENS` in `js/input/bindings.js`.
- **Chips on screen:** `chipsEarned` -> `deps.chipFlash.flash({ count,
  rows, fullWord })` (rows from the `linesCleared` that caused it);
  `chipsCashed` is held for the transition its `bankComplete` starts;
  `chipsLost` goes to the game-over screen. While a cash-in is being
  shown, the HUD's `SCR` is the score minus the part the tally has not
  reached yet (`tallyValue` in `js/ui/tally.js`), and `CHP` keeps the
  cashed chips until READY; the real score is never held back.
- The high score is read and written through `js/storage`
  (`createHighScoreStore`), injected as `deps.highScore`. It is read once at
  start; the HUD's HI shows the better of it and the current score.
- When a transition starts, the FULL WORD banner and the chip flash are
  hidden at once, so they never overlap the transition text.

## HUD and number formatting (`js/ui/`)

| File | Contents |
| --- | --- |
| `format.js` | `REGISTERS`, the one width table (label, bits, digits per mode for score, highScore, bank, lines, chips, words, cashIn); `formatNumber(value, field, mode)`; `NUMBER_MODES`, `nextMode` |
| `choice.js` | `createChoice(store, choices, fallback)`: one setting's value, `set`, `cycle()` (saves it), `onChange(listener)` |
| `number-mode.js` | `createNumberMode(store)`: a choice over hex / bin / dec |
| `settings.js` | `SETTING_ROWS` (the settings table) and `createSettings(storage)`: `choice(id)`, `cycle(id)`, `rows()`, `onChange` |
| `hud.js` | `createHud({ element, pauseButton, onPause, numberMode })`: `update({ score, highScore, bank, lines, chips })`, `setPauseVisible` |
| `screens.js` | Overlay screens; every number through `formatNumber` in the current mode; `refresh()` re-formats the visible screen in place on a mode change; `update(patch)` changes some of its data in place (the tally counting up). Also the wording rule: "MEMORY BANK", never "BANK" alone |
| `chip-flash.js` | `createChipFlash(element, { durationMs, numberMode, colors })`: `flash({ count, rows, fullWord })`, `hide`; `chipFlashText`, `chipFlashTop` |
| `tally.js` | Pure: `tallySteps(chips, maxSteps)`, `tallyValue(points, steps, stepMs, elapsedMs)`, `tallyDoneAtMs` (shared by the display and the tally sound) |

- **One formatter.** Every on-screen number goes through `formatNumber`.
  Values are zero-padded to their register width; a value too large widens
  the field (whole nibbles in binary), never truncates.
- **The mode** is the settings' `numberMode` choice
  (`settings.choice('numberMode')`, saved as `mem-block-8:numberMode`).
  The HUD (a native `<button>`) calls `cycle()` on click, the NUMBER FORMAT
  row cycles the same object, and the HUD and the screens listen with
  `onChange`, so the two can never disagree. The session knows nothing
  about modes.
- **Header sizing:** the header (`.app-header`) has one fixed height,
  64 px, in every mode, so switching modes never resizes the playfield. It
  is sized for the tallest mode, binary's five rows: 11 px text on fixed
  12 px lines, 60 px (a ratio such as 1.15 rounds up per line in browsers). Hex and decimal (three rows, up to 16 px x 1.2) fit
  inside it. Binary's cap went from 13 px to 11 px so the fifth row (CHP)
  costs only 4 px of header, not 15. It is also an inline-size container. The HUD sets `--hud-chars` (its longest row, from
  `hudRowChars`), and CSS picks `min(cap, (100cqw - pause button) /
  (chars x 0.62))`, so it fits any width and shrinks if a register widens.
  Overlay lines do the same per line with `--chars` and never wrap.
- **Glow:** a value that goes up gets one of two identical CSS animations
  (`glow-a`/`glow-b`, alternated so a new glow restarts a running one
  without forcing a layout). A drop (CHP cashed in, a new game) and a mode
  change do not glow.

## Settings (`js/ui/settings.js`)

- **A table of rows.** Each `SETTING_ROWS` entry has an `id`, a `label`,
  a storage `key`, its `choices` (in cycling order), and a `fallback`
  (default). `createSettings(storage)` makes one `createChoice` per row,
  backed by `createChoiceStore` (so every read and write goes through
  `js/storage`, in try/catch). Invalid or unreadable stored values read as
  the default; with no storage, changes still work for the session.
- **The screen is generated from the table:** `screenLines('settings')`
  turns each row into a native button `LABEL: VALUE` (command `setting`,
  `data-setting` = row id), then BACK. Tapping a row calls
  `settings.cycle(id)` (wired in `main.js`); the screen listens to
  `settings.onChange` and updates its text in place.
- **Adding a row** (Stage 6: theme, logo placement, control variants) is one
  table entry plus whoever reads `settings.choice(id)`. Nothing in the
  session or the screen code changes.
- Keys: `mem-block-8:music` (`on`/`off`), `mem-block-8:soundFx`
  (`on`/`off`), `mem-block-8:numberMode` (`hex`/`bin`/`dec`).
- The session only knows the commands `settings` (from start or paused)
  and `back`, and remembers where settings was opened from.

## Audio (`js/audio/`)

| File | Pure? | Contents |
| --- | --- | --- |
| `schedule.js` | Yes | Sound as data: tone, noise, and signal segments with start, duration, frequencies, filter, or signal, gain, envelope, optional per-tone levels and phone-line band; helpers and checks |
| `signals.js` | Yes | Waveforms computed sample by sample, from seeds: the answer tone (exact phase reversals), FSK (phase-continuous switching, `fskBits`), the line-probe chord (`probeFreqs`), and spectrum-shaped noise; cached per sample rate |
| `modem.js` | Yes | DTMF table, `MODEM` timing table and `HANDSHAKE` (the prototype's phases and levels, `PROBE_GAIN_DB`, `HISS_DB`), `MODEM_PHASES`, `MODEM_TIMELINE` (phase spans, gaps included), `MODEM_SCHEDULE`, `MODEM_DURATION`, `transitionTiming(modemOn, { silentMs, readyMs })` |
| `sfx.js` | Yes | `EVENT_EFFECTS` (event -> effect), `EFFECTS` (THE tuning table: volumes, times, frequencies), `buildEffect` |
| `music.js` | Yes | `TRACKS` (playlist), `trackForBank`, `musicTarget`, `tracksToKeep`, `loopPoints` |
| `context.js` | Web Audio | AudioContext creation and unlock, audio session type, mixer (`MIX`), visibility suspend/resume |
| `synth.js` | Web Audio | `playSchedule(ctx, destination, segments, when)`: oscillators, filtered noise, signal buffers, envelopes, and one shared 250-3900 Hz band chain per sound; returns a voice that can be stopped. `prepareSignals` turns signals into AudioBuffers ahead of time (`index.js` does it just after the first unlock) |
| `player.js` | Web Audio | The music player: fetch, decode, loop, pause/resume, fades, memory |
| `index.js` | Glue | `createAudio({ settings, onSound })`: `onEvent` (the session hook), `unlock`, `setHidden`, `transitionTiming`; the music duck under rewards; `onSound` reports every effect asked to play (the `?debug=1` log) |

- **Gesture unlock.** iOS keeps Web Audio silent until a context is
  resumed inside a user gesture. Nothing audio-related runs at load:
  `main.js` adds capture-phase `touchend`, `pointerup`, `click`, and
  `keydown` listeners that call `audio.unlock()`, which creates the
  context on the first gesture (usually the start tap or a settings
  toggle), resumes it whenever it is not running (after an iOS
  interruption, or RESUME after the page was hidden), and plays one silent
  sample (needed by older iOS). Capture phase means it runs before the
  handler acting on the same gesture, so that action's sound can play.
  With music and effects both off, no context is ever created.
- **Audio session.** Where `navigator.audioSession` exists (recent iOS
  WebKit), its type is set to `'ambient'` before the context starts: the
  game then obeys the ring/silent switch and mixes with other apps' audio
  instead of interrupting it, as a casual game should. (The default would
  play through the silent switch and stop the player's podcast.)
- **Mixer.** `master` -> `destination`, with `music` (0.32) and `sfx`
  (0.85) gains under it, so music sits well below the effects.
- **Visibility.** Hidden: the context is suspended (the session also
  pauses the game, which pauses the music). Visible again: resumed if it
  was running; if iOS refuses outside a gesture, the RESUME tap unlocks it.
- **Effects** are scheduled entirely on the audio clock when their event
  arrives; each sound has one output gain so it can be cut short (the
  hang-up on a skipped transition, the busy signal when a new game starts).
- **Rewards.** `chipsEarned` plays the chips arpeggio; on a FULL WORD it is
  the long version, and the `fullWord` event itself is silent, so the two
  rewards never clash. `bankReady` plays the tally (one blip per step, in
  step with `tallyValue`, then the done tone) when READY arrives on time,
  which is after the modem by construction; on a skip it hangs up the
  modem and plays only the done tone.
- **Music duck.** Each reward listed in `EFFECTS.duck.effects` automates
  the music bus gain: down by `db` over `attack`, held to the reward's end
  (or a later duck's), back to `MIX.music` over `release`. It works on the
  bus, so it applies to whichever track is playing and never fights the
  player's per-track fades.
- **Music follows the screen**, via `musicTarget`: it plays only while
  `playing`. Pause stops the source and remembers the position; resume
  restarts the same buffer from there. `bankComplete` fades it out over
  0.25 s and forgets the position; the modem starts after a 0.3 s
  lead-in, so the two never overlap; the next bank's track starts when the
  screen returns to `playing`.
- **Gapless loops.** Tracks play from decoded `AudioBuffer`s with
  `loop = true` and `loopStart`/`loopEnd`. MP3 adds priming samples and
  end padding; `scripts/convert-music.sh` writes the LAME header that lets
  decoders trim them, and `TRACKS` records each file's exact frame count.
  `loopPoints` loops the whole buffer when the decoder trimmed (the decoded
  length matches the known length), or skips the 1105 priming samples and
  stops before the padding when it did not. No crossfade is needed.
- **Memory.** Decoded audio is 32-bit float: about 64 MB for a 3-minute
  stereo track (Iced Village, once 7 minutes and 150 MB, is now a 2:24
  loop, about 51 MB at 44.1 kHz). The player keeps at most two
  decoded tracks, the current one and the next (`tracksToKeep`), decoding
  ahead while the game is paused, on the start screen, or in a transition.
  Others are released when the current track changes; all are released
  when MUSIC is turned off. Compressed bytes are not kept.
- **Caching and failure.** The first track is in `APP_SHELL`; others are
  cached by the service worker on first fetch in `mem-block-8-music-v2`,
  which survives app version bumps (bump `MUSIC_CACHE_VERSION` if a file is
  replaced under the same name). A track that fails to fetch or decode is
  skipped for the session; that bank plays without music. An empty
  `TRACKS` means no music at all, with no other change.

## Fonts

- IBM Plex Mono (`assets/fonts/`) via `@font-face` with `font-display:
  swap`; the Regular weight is preloaded in `index.html`. The system
  monospace stack is the fallback in `--font-mono` and `MONO_FONT`.
- **Canvas text** (the DIM8 wordmark, drawn once into the cached
  backdrop) would stay in the fallback font if drawn before the font
  arrives, and a canvas does not reliably trigger the font download. So
  `main.js` calls `loadFonts(document.fonts)` (`js/render/fonts.js`), which
  loads the canvas faces explicitly, awaits `ready` (font loaded, or a
  1.5 s timeout) before the first canvas draw, and calls
  `renderer.rebuild()` when `loaded` resolves (a no-op redraw if it was
  already in time, a fix if it was late).

## Rendering (`js/render/`)

| File | Contents |
| --- | --- |
| `renderer.js` | `createRenderer(canvas, { theme, options })`: `resize`, `draw(state)`, `redraw`, `rebuild` (after a font loads), `setTheme`, `setBackground` (bank tint), `setDebugZones` |
| `fonts.js` | `loadFonts(fontSet)`: `{ ready, loaded }` promises for the canvas fonts (see Fonts) |
| `layout.js` | `computeLayout`: whole-device-pixel cell size for a box and `devicePixelRatio` |
| `color.js` | `mix`, `lighten`, `darken`, `blockShades` for `#rrggbb` colours |
| `logo.js` | The DIM8 "8." mark from seven-segment polygons plus wordmark |
| `chip.js` | `drawChipIcon(ctx, x, y, width, colors)`: the microchip icon (DIP body, pin-1 notch, pins), for the chip flash |
| `options.js` | `RENDER_DEFAULTS`: logo placement, preview scale/opacity, landing indicator (off), clear flash strength |

- The canvas backing store is exactly 12 x 22 cells of a **whole number of
  device pixels**, so grid lines and edges stay crisp; the CSS size is that
  divided by `devicePixelRatio`. A `ResizeObserver` on the playfield box and
  a window `resize` listener (zoom changes the ratio) call `resize()`.
- Background, logo, and grid are cached in an offscreen canvas and only
  rebuilt on resize, theme, or bank tint change; each frame blits that,
  then draws locked cells, the line clear flash (a white wash over
  `clearingRows` whose strength follows `sin(pi * clearProgress)`), the
  active piece, and the preview.
- Only rows 4..25 are drawn; cells in hidden rows fall above the canvas.
- The theme (palette) is **passed in**, never imported by the renderer.

## Input (`js/input/`)

| File | Contents |
| --- | --- |
| `bindings.js` | **All** mappings and tuning: zones, thresholds, timings, gesture->action, key->action |
| `gestures.js` | Pure recogniser: pointer samples in, gestures out; `update(t)` runs hold/held-tap timers |
| `keyboard.js` | Pure key state with its own auto-repeat (OS repeat ignored) |
| `dom.js` | Thin adapter: pointer events (with `setPointerCapture`) and key events -> recognisers -> actions |

The pure modules never read a clock; time comes from event timestamps and
the frame time passed to `update(now)`, which share the
`performance.now()` timebase.

## Touch rules (do not break these)

Taps, double taps, swipes, and long presses are all game gestures, and every
iOS browser (Safari, Brave, Chrome...) uses WebKit. WebKit's double-tap zoom
fired on a real iPhone even with Stage 2's CSS rules, so protection is
layered. Each layer covers a gap in the others:

| Protection | Where | Why |
| --- | --- | --- |
| `touchstart`, `touchmove`, `touchend` listeners with `{ passive: false }` that call `preventDefault()` | `js/touch-guard.js`, on the whole game container `#app` | The one fix WebKit always honours: cancelling the touch stops double-tap zoom, scrolling, selection, callouts, and emulated mouse/click events. `passive: false` is required or WebKit ignores `preventDefault`. Pointer Events (used by game input) are dispatched before touch events and are not suppressed. |
| `dblclick` `preventDefault()` | `js/touch-guard.js`, `#app` | Desktop and older WebKit double-click zoom/selection. |
| `gesturestart`, `gesturechange`, `gestureend` `preventDefault()` | `js/touch-guard.js`, `document` | WebKit pinch zoom arrives as these non-standard events regardless of `touch-action`. |
| `touch-action: none` (after a `manipulation` fallback) on `.app` **and every descendant** | `css/main.css` | Standard way to stop browser panning/zooming. Declared on each element, not just a parent: `touch-action` is not inherited, and WebKit's support has historically been partial. |
| `touch-action: manipulation` on `html`, `body` | `css/main.css` | Removes double-tap zoom anywhere outside the game container. |
| `user-select: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`, `-webkit-tap-highlight-color: transparent` on `.app *` and `html`/`body` | `css/main.css` | No text selection, long-press callout, or grey tap flash on game elements. |
| `maximum-scale=1` in the viewport meta | `index.html` | Asks the browser not to zoom. WebKit may ignore it (accessibility setting), so the layers above are the real protection. |
| `contextmenu` `preventDefault()` | `js/input/dom.js`, game area | Long press / right click must not open a menu. |
| `pointer-events: none` on `.overlay`, `.banner`, and the debug log | `css/main.css` | Overlays never intercept touches meant for the game area. Only the pause menu's buttons set `pointer-events: auto`. |
| Pointers that start on a native control are not captured | `js/input/dom.js` | Menu buttons inside the well must not become game gestures, and capturing their pointer would retarget the release to the well so the button never got its click. |

The guards cover the whole container (header, playfield, HUD, margins),
because a thumb can easily land outside the playfield.

**Real controls must opt out.** Cancelling touch events also cancels the
clicks they would produce. Native buttons, links, and form controls, and
anything inside an element with the `data-native-touch` attribute, are left
alone by `js/touch-guard.js` (and by `js/input/dom.js`) and get
`touch-action: manipulation` in CSS. The HUD, the pause button, the
pause menu, and the settings screen are native `<button>`s. The HUD and
the pause button sit in the header, outside
the playfield's touch surface, so a gesture that starts in the playfield
(whose pointer the well captures) can never press them. The settings
screen's rows and BACK, and the SETTINGS buttons on the start screen and
pause menu, are native `<button>`s in the overlay, at least
44 x 44 px.

## iOS status bar

A **workaround** for WebKit bug 325807, not an Apple-documented fix.
iOS 27 puts a system blur over anything drawn under a translucent status
bar in installed home screen web apps, and page CSS cannot remove it.

- `index.html` no longer has `apple-mobile-web-app-status-bar-style`
  (it was `black-translucent`). iOS then draws a solid status bar and
  starts the web view below it.
- `#topfix`, the first child of `body` and outside `#app`, is a 12 px
  solid strip at the top edge for iOS to sample the bar's colour from. It
  shows only in `display-mode: standalone`, uses `var(--color-surround)`
  (the colour at the top of the app, so it follows the surround if themes
  change it), has `pointer-events: none`, and sits below `.app`
  (`z-index` 0 against 1). The touch guards never see it.
- `env(safe-area-inset-top)` now reads 0 in the installed app, as in a
  browser tab. `.app`'s top padding is the inset plus `--space-2`, so
  the header keeps an 8 px gap with no inset and still clears the notch
  on any older installed app that reports one. `viewport-fit=cover` and
  the bottom inset (home indicator) are unchanged.
- The layout sizes from `height: 100%` on `html` and `body` (with `body`
  fixed to `inset: 0`), never `100vh`, `screen.height`, or
  `window.innerHeight`, so it fits the shorter web view.
- `theme-color` and the manifest colours stay: iOS 27 ignores them, but
  Android and desktop use them.
- `tests/status-bar.test.js` keeps the workaround in place.

Remove the workaround only once Apple fixes the bug: put the meta back,
then delete `#topfix`, its CSS, and the test.

## Data flow

```
 pointer / key events
        |
        v
  js/input/dom.js -> gestures.js / keyboard.js -> bindings.js mapping
        |
        |  { action, source, gesture }      (pushed immediately)
        v
  js/session.js  --- playing: engine command now (game.moveLeft() ...)
        |        --- other states: see Session states
        |   ^
        |   |  pause button / menu buttons (native <button> clicks) -> handleCommand()
        |
  js/loop.js each frame:  input.update(now) -> N x session.step() -> session.frameEnd()
                                                |                        |
                         game.step(); drainEvents() -> handleEvents()    | transition: READY, tally,
                           -> progress.handle() -> score, FULL WORD,     | end when due; HUD,
                              chips (flash, cash-in, lost),              | renderer.draw()
                              bankComplete (setWeights, setGravity,
                              transition); gameOver; deps.onEvent -> js/audio
```

- Input never changes state directly; it emits abstract actions.
- Commands are applied as they arrive (between ticks), which the engine
  supports; no input queue is needed.
- The engine is the single source of truth for game state; the
  progression is the source of truth for score and bank. Engine events
  (`spawned`, `locked`, `clearStarted`, `linesCleared`, `gameOver`) and
  progression events are handled in exactly one place: `handleEvents()` in
  `js/session.js`.
- Render, UI, and audio only read state and events.

## Game loop

`js/loop.js`: `requestAnimationFrame` drives the loop and the simulation
advances in **fixed `TICK_MS` steps** using an accumulator:

1. `input.update(now)` fires hold-repeat timers.
2. Add the elapsed frame time (clamped to 250 ms, so returning from a
   background tab or a stall does not fast-forward the game) and run as many
   whole ticks as the accumulator holds.
3. `session.frameEnd()` drains events and draws.

The loop runs while playing and during a bank transition (the engine does
not step then, but `frameEnd` ends the transition on time); start, pause,
and game-over screens are static. The session pauses when the page is hidden (`visibilitychange`), and
input resets on window blur so held keys cannot get stuck.

## Where state lives

| State | Owner | Persisted? |
| --- | --- | --- |
| Game state (grid, active piece, phase, timers) | Inside the game object from `createGame`, held by `js/session.js`; read via `getState()` | No |
| Score, bank, lines, chips held | Progress object from `createProgress`, held by `js/session.js` | No |
| Current state, game and progress objects, transition timer and tally display, restart confirmation | `js/session.js` | No |
| Touch and key hold state | `js/input/gestures.js`, `keyboard.js` | No |
| Settings (music, sound effects, number format; theme and more in Stage 6) | `js/ui/settings.js`, saved through `js/storage` (`mem-block-8:music`, `:soundFx`, `:numberMode`) | Yes, localStorage |
| AudioContext, playing voices, decoded music, music position | `js/audio/` | No |
| High score | `js/storage` (`mem-block-8:highScore`) | Yes, localStorage |
| Canvas layout, cached backdrop, last snapshot | `js/render/renderer.js` | No |
| Offline files | Service worker caches (app shell incl. the first track; runtime music cache) | Yes, Cache Storage |

## Optional WebAssembly (later)

If AI-versus mode needs faster move search, a WebAssembly module may be
added as an isolated, optional component, likely under `js/ai/` (or
`wasm/`), running in a Web Worker:

- It receives a serialised board and piece queue and returns a chosen move.
- A pure JavaScript fallback must exist, so the game never depends on it.
- It does not replace `js/engine`; the engine stays the single rules
  authority, and the AI only proposes moves that the engine validates.
- Its `.wasm` file is added to the service worker cache like any other asset.

Nothing for this is built yet.
