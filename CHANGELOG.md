<!-- CHANGELOG.md - What changed in each stage of Mem Block 8. Newest first. -->
# Changelog

Every stage, and every significant change between stages, adds an entry
here (see CONTRIBUTING.md).

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
