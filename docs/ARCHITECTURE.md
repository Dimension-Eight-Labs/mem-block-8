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
| `sw.js` | Service worker: cache-first app shell, versioned caches | No (worker) | 0, 7 |
| `js/main.js` | Small bootstrap: wires engine, session, loop, input, render, ui | Yes | 0, 2 |
| `js/session.js` | Session states (start / playing / paused / transition / gameOver), routes actions and menu commands, handles engine and progression events | No (via injected deps) | 2, 3 |
| `js/loop.js` | `requestAnimationFrame` loop with fixed-timestep accumulator | rAF only | 2 |
| `js/url-options.js` | Parses `?debug=1`, `?logo=`, `?moveOn=`, `?doubleTap=` | No | 2 |
| `js/touch-guard.js` | Cancels touch, double-click, and pinch events on the game container (see Touch rules) | Yes | 2 |
| `scripts/serve.py` | No-cache development server for LAN phone testing (not part of the app) | - | 2 |
| `js/engine/` | Game rules: grid, pieces, rotation, collision, line clears, gravity, lock delay, line clear and spawn delays | **Never** | 1, 3 |
| `js/progression/` | Memory banks (levels), scoring, progress state; pure like the engine | **Never** | 3 |
| `js/render/` | Draws engine state to a canvas | Yes | 2 |
| `js/input/` | Touch and keyboard events -> abstract actions | Yes | 2 |
| `js/ui/` | Screens (start, pause menu, bank transition, game over), FULL WORD banner, register-dump HUD and pause button, the one number formatter and display mode, debug log; later settings | Yes | 2, 3, 4, 5 |
| `js/audio/` | Web Audio synthesis, music player | Yes (Web Audio) | 5 |
| `js/themes/` | Theme data (placeholder `default.js` with per-bank tints, era themes later), `tintForBank` | No (data) | 2, 3, 6 |
| `js/storage/` | The only code that touches `localStorage`, always in try/catch; high score and choice (setting) stores | localStorage only | 3, 4 |
| `assets/fonts/` | IBM Plex Mono Latin-1 woff2 subsets (Regular, SemiBold) and their OFL license | - | 4 |
| `tests/` | `node --test` unit tests: engine and delays, progression, storage, gestures, keyboard, loop, session, render helpers, themes | No | 1+ |

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
| `banks.js` | `BANK_TABLE` (banks 1-5), `GRAVITY_RAMP`, `PENTOMINO_TIERS`, `getBank(n)`, `gravityForBank(n)` |
| `scoring.js` | `LINE_CLEAR_POINTS`, `lineClearPoints(lines, bank)`, `isFullWord`, `dropPoints(locked)` |
| `progress.js` | `createProgress()`: score, bank, total lines, lines in the bank; `handle(engineEvent)` returns progression events |
| `index.js` | Re-exports; import from here |

Progression events:

| Event | Fields | Cause |
| --- | --- | --- |
| `scoreChanged` | `score`, `points`, `reason` (`'lines'` or `'drop'`) | `locked` with a drop bonus, or `linesCleared` |
| `fullWord` | `bank` | A 5-line `linesCleared` |
| `bankComplete` | `fromBank`, `toBank`, `weights`, `gravityMsPerRow` | Lines in the bank reached `linesToComplete` (extra lines carry over) |

Progress never calls the engine. `bankComplete` carries the next bank's
settings, and the session applies them (`game.setWeights`,
`game.setGravityMsPerRow`) and starts the transition.

## Session states (`js/session.js`)

```
 start --tap/Enter--> playing <--pause button, P/Esc, page hidden / RESUME, P/Esc/Enter--> paused
                       playing --bankComplete--> transition --2.5 s, or tap/key after 750 ms--> playing
                       playing --gameOver--> gameOver --tap/Enter after 500 ms--> playing
                       paused --RESTART, then CONFIRM RESTART--> playing (new game)
                       transition --pause--> paused (the transition is finished first)
```

| State | Engine steps? | Input |
| --- | --- | --- |
| `start` | No game yet | Tap or Enter starts |
| `playing` | Yes | Actions become engine commands |
| `paused` | No; loop stopped | Menu buttons (`handleCommand`); P / Escape / Enter resume; taps on the well ignored |
| `transition` | No; loop keeps running so `frameEnd` can end it on time | Pause; after `skipAfterMs`, a tap or key press skips |
| `gameOver` | No; loop stopped | Tap or Enter restarts (after 500 ms) |

- Events are drained and handled **after every tick** (and once more per
  frame for events caused by commands), so a transition or game over
  freezes the engine on the exact tick it happened.
- `handleEvents()` is the one place events are handled. Every engine and
  progression event is also passed to `deps.onEvent`, the hook for Stage 5
  sound (modem sequence on `bankComplete`, effects on `locked`,
  `clearStarted`, `fullWord`, ...).
- Transition timings and the FULL WORD duration are in `SCREENS` in
  `js/input/bindings.js`.
- The high score is read and written through `js/storage`
  (`createHighScoreStore`), injected as `deps.highScore`. It is read once at
  start; the HUD's HI shows the better of it and the current score.
- When a transition starts, the FULL WORD banner is hidden at once
  (`deps.banner.hide()`), so it never overlaps the transition text.

## HUD and number formatting (`js/ui/`)

| File | Contents |
| --- | --- |
| `format.js` | `REGISTERS`, the one width table (label, bits, digits per mode for score, highScore, bank, lines, words); `formatNumber(value, field, mode)`; `NUMBER_MODES`, `nextMode` |
| `number-mode.js` | `createNumberMode(store)`: current mode, `cycle()` (saves it), `onChange(listener)` |
| `hud.js` | `createHud({ element, pauseButton, onPause, numberMode })`: `update({ score, highScore, bank, lines })`, `setPauseVisible` |
| `screens.js` | Overlay screens; every number through `formatNumber` in the current mode; `refresh()` re-formats the visible screen in place on a mode change |

- **One formatter.** Every on-screen number goes through `formatNumber`.
  Values are zero-padded to their register width; a value too large widens
  the field (whole nibbles in binary), never truncates.
- **The mode** lives in a small shared object created in `main.js`, saved
  through `createChoiceStore(storage, 'numberMode', NUMBER_MODES, 'hex')`.
  The HUD (a native `<button>`) calls `cycle()` on click; the HUD and the
  screens listen with `onChange`. The session knows nothing about modes.
- **Fitting:** the header (`.app-header`) is a fixed 60 px tall and an
  inline-size container. The HUD sets `--hud-chars` (its longest row, from
  `hudRowChars`), and CSS picks `min(cap, (100cqw - pause button) /
  (chars x 0.62))`, so it fits any width and shrinks if a register widens.
  Overlay lines do the same per line with `--chars` and never wrap.
- **Glow:** a changed value gets one of two identical CSS animations
  (`glow-a`/`glow-b`, alternated so a new glow restarts a running one
  without forcing a layout). A mode change does not glow.

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
`touch-action: manipulation` in CSS. The HUD, the pause button, and the
pause menu are native `<button>`s; the Stage 5 settings screen must also
use one of these. All of them except the menu sit in the header, outside
the playfield's touch surface, so a gesture that starts in the playfield
(whose pointer the well captures) can never press them.

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
                         game.step(); drainEvents() -> handleEvents()    | finish transition when due,
                           -> progress.handle() -> score, FULL WORD,     | HUD, renderer.draw()
                              bankComplete (setWeights, setGravity,
                              transition); gameOver; deps.onEvent
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
| Score, bank, lines | Progress object from `createProgress`, held by `js/session.js` | No |
| Current state, game and progress objects, transition timer, restart confirmation | `js/session.js` | No |
| Touch and key hold state | `js/input/gestures.js`, `keyboard.js` | No |
| Number display mode | `js/ui/number-mode.js`, saved through `js/storage` (`mem-block-8:numberMode`) | Yes, localStorage |
| Settings (theme, music / effects toggles) | `js/ui`, saved through `js/storage` (Stages 5, 6) | Yes, localStorage |
| High score | `js/storage` (`mem-block-8:highScore`) | Yes, localStorage |
| Canvas layout, cached backdrop, last snapshot | `js/render/renderer.js` | No |
| Offline files | Service worker caches | Yes, Cache Storage |

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
