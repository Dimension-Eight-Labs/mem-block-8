<!-- docs/DESIGN.md - Game design decisions for Mem Block 8. Update this when a decision changes. -->
# Mem Block 8 - Design

Mem Block 8 is an original falling-block game. It is inspired at the idea
level by KDE KBlocks but is a clean-room implementation: no code, themes, or
assets from that project are used or consulted.

**Theme:** computer memory and vintage computing. Falling pieces are "blocks
of memory" dropping into a memory bank (the well).

**Audience and platform:** primarily iPhone Safari installed to the home
screen as a PWA; also desktop browsers. Offline, no ads, no data collection,
no leaderboards.

## Board

- **12 columns wide x 22 visible rows.** (Deliberately not the common 10 x 20.)
- **4 hidden spawn rows** above the visible area, 26 rows in total. Pieces
  appear in the hidden rows and fall into view.
- Coordinates: x 0..11 left to right; y 0..25 top to bottom; rows 0..3 are
  hidden, rows 4..25 visible. See [ARCHITECTURE.md](ARCHITECTURE.md#coordinate-system).
- Each locked cell **remembers which piece type placed it**, so the
  renderer can colour cells by piece type.

## Pieces

- **27 pieces: every one-sided polyomino of 3, 4, and 5 cells.**
  - 2 trominoes: `I3` (straight), `L3` (bent).
  - 7 one-sided tetrominoes: `I4`, `O4`, `T4`, `L4`, `L4m`, `S4`, `S4m`.
  - 18 one-sided pentominoes: the 12 free pentominoes `F I L N P T U V W X Y Z`
    plus mirror images of the chiral six (`F5m`, `L5m`, `N5m`, `P5m`, `Y5m`, `Z5m`).
- Names use mathematical polyomino letters plus the cell count; a trailing
  `m` marks a mirror image. Each piece has a stable index 0..26.
- **Mixed piece set, ramping by memory bank** (level; see
  [Memory banks](#memory-banks-levels)).
  - Early banks: trominoes and tetrominoes only.
  - Pentominoes are introduced progressively, harder shapes later.
- **Difficulty ramp order:** difficulty first increases through the piece
  mix; once the full mix is in play, it increases through fall speed.

### Randomizer

- **Weighted bag.** A weight table maps piece ids to whole-number counts.
  Each bag holds exactly those counts, shuffled (Fisher-Yates) with a seeded
  PRNG (mulberry32), and is dealt one piece at a time, then refilled.
- Each memory bank sets its own weight table. On a bank change the rest of
  the current bag is discarded and a fresh bag of the new table is built
  (`setWeights(table, { resetBag: true })`), so the new mix starts at
  once. The piece already shown in the preview is still the next piece;
  the new mix starts right after it. (Without `resetBag`, a new table
  waits until the current bag runs out.)
- **Preview queue** of upcoming pieces; length configurable, default 1.

### Rotation (custom system)

- Every piece rotates **about the centre of its base bounding box**. When
  that centre falls between cells (a box of width w and height h where
  w + h is odd, such as 3x2), the rotated cells are **rounded towards the
  top-left** (floor on both axes).
- All four rotation states are precomputed from the base shape, so rotating
  never drifts: four clockwise turns, or clockwise then counterclockwise,
  always return the exact starting cells. Fully symmetric pieces (`O4`,
  `X5`) do not move when rotated.
- **Kicks:** when a rotation is blocked, try these offsets in order and use
  the first that fits: stay, 1 left, 1 right, 2 left, 2 right, 1 up. If none
  fit, nothing happens. The same list is used for both directions. There is
  no downward kick.

### Spawning

- New pieces appear in their base orientation, **horizontally centred**:
  column = floor((12 - width) / 2), so odd-width pieces sit half a cell
  left of centre.
- The piece's lowest cells sit in the **last hidden row (row 3)**, so it
  falls into view on the first gravity step.

### Falling and locking

- **Gravity** is set in milliseconds per row, per memory bank (900 ms in
  bank 1). **Soft drop** multiplies fall speed (default 20x).
- **Hard drop** moves the piece straight down and locks it immediately.
- **Lock delay:** a piece resting on something locks after 500 ms. A
  successful move or rotation while resting restarts the timer, at most 15
  times per piece, so pieces cannot be stalled forever. Reaching a new
  lowest row restores both the timer and the 15 resets.
- **Line clears:** after each lock, all full rows (hidden rows included)
  **flash for 200 ms** (`lineClearDelayMs`), then are removed and
  everything above falls down.
- **Spawn delay:** the next piece appears **100 ms** (`spawnDelayMs`) after
  a lock, or after the line clear flash. During both delays moves,
  rotations, and hard drops do nothing; holding soft drop carries over to
  the next piece. Both delays can be set to 0.

### Game over

- **Block out:** a new piece overlaps existing blocks when it spawns.
- **Lock out:** a piece locks with every cell in the hidden rows.

### Timing

- The simulation runs at a **fixed 120 ticks per second** (one tick is
  1000/120 ms). The same game plays identically on 60 Hz and 120 Hz screens,
  and a given seed plus the same inputs at the same ticks always produces
  the same game.

## Memory banks (levels)

Levels are called **memory banks**. Clearing lines fills the current bank;
a full bank "dials in" to the next one. Bank numbers are shown in hex
(`BANK 0x01`, `0x02`, ...).

All values are first-pass and live in one table,
[`js/progression/banks.js`](../js/progression/banks.js), to be tuned by
playtesting.

| Bank | Lines | Gravity (ms/row) | Piece mix (count per bag) | Bag |
| --- | --- | --- | --- | --- |
| 1 | 10 | 900 | Trominoes 1 each, tetrominoes 2 each | 16 |
| 2 | 10 | 900 | + `I5`, `L5`, `L5m`, `P5`, `P5m` at 1 each | 21 |
| 3 | 10 | 900 | + `T5`, `U5`, `V5`, `Y5`, `Y5m` at 1 each | 26 |
| 4 | 10 | 750 | Those ten pentominoes rise to 2; `F5`, `F5m`, `N5`, `N5m`, `W5`, `X5`, `Z5`, `Z5m` arrive at 1 | 44 |
| 5 | 10 | 750 | Full mix: every pentomino at its final weight of 2 | 52 |
| 6+ | 10 | x0.8 per bank, floor 60 | Same as bank 5 | 52 |

- **Gravity curve from bank 6:** each bank multiplies the previous bank's
  gravity by 4/5, rounded to a whole millisecond, down to a floor of
  60 ms/row: 600, 480, 384, 307, 246, 197, 158, 126, 101, 81, 65, then 60
  from bank 17 on. It is computed by a function (`gravityForBank`), not an
  endless table.
- **Carry-over:** lines beyond a bank's 10 count towards the next bank.
- **Bank transition:** when a bank fills (after the line clear flash), the
  game freezes and shows "BANK 0x01 FULL", then "CONNECTING TO BANK
  0x02..." for 2.5 s. A tap or key press skips it, but only after the first
  750 ms, so the tap that cleared the lines cannot skip it by accident.
  Stage 5 plays the modem sequence here and matches the duration to it.
- **Playfield tint:** each bank has its own dark playfield tint (six
  placeholder tints, repeating from bank 7). The DIM8 mark stays a slightly
  lighter shade of whatever tint it sits on.

## Scoring

Mem Block 8's own scoring. Line clear values are powers of two so the score
reads cleanly in hex:

| Lines at once | Points (x bank number) | Hex |
| --- | --- | --- |
| 1 | 64 | `0x40` |
| 2 | 128 | `0x80` |
| 3 | 256 | `0x100` |
| 4 | 512 | `0x200` |
| 5 | 1024 | `0x400` |

- A clear is scored at the bank it happened in (before any bank change it
  causes).
- **FULL WORD:** a 5-line clear (the most possible: pieces are at most 5
  cells tall) shows "FULL WORD" over the playfield for a moment.
- **Drop bonus** (not multiplied by the bank): 1 point per row a piece falls
  while soft drop is held, 2 points per row of a hard drop.
- Scores are always whole numbers.

## High score

- The best score is saved on this device only, in `localStorage` under
  `mem-block-8:highScore`.
- If storage is unavailable (private browsing, blocked site data), the game
  plays normally and simply does not remember the high score.

## Controls

### Touch (as built in Stage 2; tune in `js/input/bindings.js`)

The playfield is split into a left third, centre third, right third, and a
full-width bottom strip (15% of the height) that takes priority.

| Gesture | Action |
| --- | --- |
| Tap left third | Move one cell left |
| Tap right third | Move one cell right |
| Hold left / right third | Auto-repeat after 170 ms, then every 50 ms |
| Swipe left (30 px or more) | Rotate counterclockwise |
| Swipe right, up, or down | Rotate clockwise |
| Double tap in the centre third | Hard drop |
| Press and hold the bottom strip | Soft drop while held |

- **Tap:** released within 200 ms and moved less than 10 px.
- **Swipes rotate immediately**, mid-swipe, once per swipe; a swipe never
  also counts as a tap or a hold.
- **Double tap:** second touch-down within 250 ms of the first release and
  within 40 px of it.
- Two variants are built in for comparison on a phone:
  - `moveOn`: `'up'` (default; side taps move on release) or `'down'`
    (move on touch-down; feels faster, but a swipe that starts in a side
    zone also moves once).
  - `doubleTapMode`: `'center'` (default; only centre taps form double taps,
    side taps stay instant) or `'anywhere'` (double tap anywhere, but every
    single tap waits 250 ms to see if a second follows).
  - Try them without editing code: `?moveOn=down`, `?doubleTap=anywhere`.
- All mappings and values live in **one table**, `js/input/bindings.js`.

### Keyboard (desktop)

| Key | Action |
| --- | --- |
| Left / Right | Move (repeat after 170 ms, every 50 ms) |
| Up, X | Rotate clockwise |
| Z | Rotate counterclockwise |
| Down | Soft drop while held |
| Space | Hard drop |
| P, Escape | Pause / resume |
| Enter | Start, resume, restart after game over, skip the bank transition |

### Screens

- **Start:** the title "MEM BLOCK 8" / "DIM8 LABS", "MEMORY BANK READY_",
  "12 x 22 CELLS", the capacity in words (`0x0108 WORDS` in hex), "TAP TO
  START" (and "PRESS ENTER" when a mouse or trackpad is present). The title
  lives here rather than in a page header, so the header can hold the HUD.
- **Pause button:** a 44 x 44 px button at the top right, beside the HUD,
  above the playfield and away from the bottom soft-drop strip. Hidden when
  there is nothing to pause.
- **Pause menu:** opened by the pause button, P / Escape, or automatically
  when the page is hidden. Shows "PAUSED" with **RESUME** and **RESTART**.
  RESTART changes to **CONFIRM RESTART** and needs a second tap. Taps on the
  playfield do nothing while paused, so a stray touch cannot resume. P,
  Escape, or Enter also resume. Resuming continues exactly where the game
  stopped. There is no settings entry yet; the settings screen arrives in
  Stage 5.
- **Bank transition:** see [Memory banks](#memory-banks-levels).
- **Game over:** "MEMORY FULL", the score, bank reached, and lines (one per
  line), then "NEW HIGH SCORE" (or the saved high score), then "TAP TO
  REBOOT". Input is ignored for 500 ms first so a tap already in progress
  does not restart the game instantly.
- **One number format everywhere:** every number on every screen (start,
  transition, game over) uses the same formatter and the current HUD mode.
  Screen lines never wrap, so a number is never split; a line too long for
  the playfield (binary on a narrow phone) is shown in a smaller font, and
  a screen's dim detail lines share one size. The board size ("12 x 22")
  stays decimal: it is geometry, not a register.

### Later

- **Hold slot** - planned, not in the first release.
- **AI-versus mode** - planned, not in the first release.

## HUD

Styled like a CPU **register dump** in the approved green monospace look
(IBM Plex Mono), in the header at the top of the screen beside the pause
button, out of the bottom thumb zone.

| Label | Register | Width | Hex | Binary | Decimal |
| --- | --- | --- | --- | --- | --- |
| `SCR` | Score | 24-bit | 6 digits | 24 digits (6 nibbles) | 8 digits |
| `HI` | High score | 24-bit | 6 digits | 24 digits | 8 digits |
| `BNK` | Current bank | 8-bit | 2 digits | 8 digits | 3 digits |
| `LNS` | Total lines cleared | 16-bit | 4 digits | 16 digits | 5 digits |

```
hex (default)                  binary                                decimal
SCR 0x000400  HI  0x001A40     SCR 0b0000 0000 0000 0100 0000 0000   SCR 00001024  HI  00006720
BNK 0x02      LNS 0x0013       HI  0b0000 0000 0001 1010 0100 0000   BNK 002       LNS 00019
                               BNK 0b0000 0010
                               LNS 0b0000 0000 0001 0011
```

- **Modes:** hex (lowercase `0x`, uppercase digits), binary (`0b`, digits
  in 4-bit nibbles separated by spaces), decimal (no prefix). All values are
  zero-padded to their register width, so nothing jumps as numbers change.
- **Tap the HUD** to cycle every field together: hex -> binary -> decimal
  -> hex. The mode is remembered on this device (`mem-block-8:numberMode`)
  and applies to every number in the game. The HUD is a real button, so a
  tap on it is never a game gesture, and a swipe that starts in the
  playfield never changes it.
- **HI** shows the saved high score, and follows the current score live
  once it is beaten.
- **Overflow:** a value too large for its register widens that field (a
  whole nibble at a time in binary); digits are never truncated or wrapped.
  The HUD then uses a slightly smaller font so it still fits.
- **Layout:** hex and decimal are a 2 x 2 grid; binary shows one register
  per row. The header is a fixed 60 px tall (four binary rows), so changing
  mode never resizes the playfield. The font is the largest that fits the
  width (up to 16 px for hex and decimal, 13 px for binary): at 320 px wide,
  15.4 px and 11.4 px.
- **Glow:** a value that changes flares brighter for about 200 ms, like a
  VFD segment (CSS only).

## Audio

- **Level complete:** a mock acoustic modem sequence synthesized in code
  with the Web Audio API: DTMF dialling, then an answer tone, then a
  1200/2400 bps style handshake.
- **Sound effects:** all synthesized; no audio sample files for effects.
- **Music:** CC0-licensed tracks only, played from MP3/AAC files. The first
  track is cached at install; others are cached on demand when first played.
- **Separate toggles** for music and sound effects.

## Visuals

- A **vivid, colourful playfield** framed by a **dark DIM8 Labs surround**.
- **Blocks use vivid colours, by piece type.** Palettes come from the
  active theme.
- **The playfield background shifts tint per memory bank** (placeholder
  tints since Stage 3; era themes bring their own in Stage 6).
- **Line clear flash:** rows being cleared wash to white and back over
  200 ms, drawn on the canvas.
- **Next-piece preview:** a semi-transparent, see-through rendering of the
  next piece in the top-right area of the playfield, so it never fully
  hides the well. Defaults: 60% of cell size, 35% opacity
  (`js/render/options.js`).
- **No landing indicator.** The renderer has a `showLandingIndicator`
  option wired to the engine's landing position, but it is **off by
  design**.
- **Multiple themes based on computing eras:** mainframe, minicomputer,
  home computer, workstation, modern.

### Branding

- The **DIM8 Labs logo** (a seven-segment VFD-style "8." with a "DIM8 LABS"
  wordmark) is **drawn in code inside the playfield**: small, very faint but
  perceivable, rendered as a slightly lighter shade of whatever colour it
  overlays.
- Proportions follow the DIM8 maker's mark used in DIM8 Solitaire: an
  upright digit with pointed hexagonal segments, a round decimal point at
  the lower right, and a letter-spaced wordmark as wide as the mark.
- Placement is one setting, `logoPlacement` in `js/render/options.js`:
  `'bottom'` (default; small, centred near the bottom) or `'center'`
  (larger, centred, even fainter). Compare with `?logo=center`.
- **No text-font watermark** anywhere on the page.

## Technology

- Plain HTML, CSS, and JavaScript with native ES modules.
- **Font: IBM Plex Mono** (SIL Open Font License), self-hosted in
  `assets/fonts/` as the official Latin-1 woff2 subsets of Regular (all
  text) and SemiBold (the title), about 17.5 KB each. The system monospace
  stack is the fallback. No external font requests.
- No build step, no bundler, no framework, no runtime dependencies.
- Types documented with JSDoc.
- WebAssembly may be added later as an optional, isolated module (most
  likely for AI opponent move search). Nothing about it is built now.

## Hosting

GitHub Pages, repository `Dimension-Eight-Labs/mem-block-8`.
