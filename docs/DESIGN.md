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
- **Curated pool (playtest pass 2, then the piece gallery):** seven
  pentominoes are never dealt: `X5` (the plus), `V5` (the 3 x 3 corner),
  `W5` (the staircase), `F5` / `F5m`, and `Z5` / `Z5m`. iPhone playtesting
  found the first five awkward to place: they leave holes no other piece
  fills, so they punish more than they challenge. The upper banks were
  still unplayable with them gone (too many incomplete rows), and after
  comparing every shape in the piece gallery (`tools/piece-gallery.html`)
  the owner excluded `Z5` and `Z5m` as well. They stay
  defined in the engine (tests use them; a hard mode might deal them), but
  `EXCLUDED_PIECES` in `js/progression/banks.js` keeps them out of every
  bank: the tables are built so an excluded id is dropped even if added
  by mistake. Removing an id from that list re-enables it. 20 pieces are
  dealt.
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
(`MEMORY BANK 0x01`, `0x02`, ...).

**Wording rule:** player-facing text always says "MEMORY BANK", never
"BANK" on its own and never "CONNECTING TO BANK": playtesters outside the
joke read those as online banking. The HUD register label `BNK` is the one
exception. A test checks every screen line and the README's how-to-play.

All values are first-pass and live in one table,
[`js/progression/banks.js`](../js/progression/banks.js), to be tuned by
playtesting.

| Bank | Lines | Gravity (ms/row) | Piece mix (count per bag) | Bag |
| --- | --- | --- | --- | --- |
| 1 | 10 | 900 | Trominoes 1 each, tetrominoes 2 each | 16 |
| 2 | 10 | 900 | + `I5`, `L5`, `L5m`, `P5`, `P5m` at 1 each | 21 |
| 3 | 10 | 900 | + `T5`, `U5`, `Y5`, `Y5m` at 1 each | 25 |
| 4 | 10 | 750 | Those nine pentominoes rise to 2; `N5`, `N5m` arrive at 2 | 38 |
| 5 | 10 | 750 | Full mix: easy pentominoes (`I5`, `L5`, `L5m`, `P5`, `P5m`) at 2, the rest (`T5`, `U5`, `Y5`, `Y5m`, `N5`, `N5m`) at 3 | 44 |
| 6+ | 10 | x0.8 per bank, floor 60 | Same as bank 5 | 44 |

Pentominoes make up 0, 24, 36, 58, and 64% of the bag in banks 1 to 5.
Excluding `Z5` and `Z5m` simply took their weights out of banks 4 and 5
(which were 42 and 50 pieces, 62% and 68% pentominoes); the other weights
are unchanged until the coming difficulty pass. The jagged N pentominoes
arrive at full weight in bank 4 and carry more weight in bank 5, standing
in for the hard tier's removed pieces.

- **Gravity curve from bank 6:** each bank multiplies the previous bank's
  gravity by 4/5, rounded to a whole millisecond, down to a floor of
  60 ms/row: 600, 480, 384, 307, 246, 197, 158, 126, 101, 81, 65, then 60
  from bank 17 on. It is computed by a function (`gravityForBank`), not an
  endless table.
- **Carry-over:** lines beyond a bank's 10 count towards the next bank.
- **Bank transition:** when a bank fills (after the line clear flash), the
  game freezes and the screen prints, like a terminal log:

  | When | Line |
  | --- | --- |
  | At once | `MEMORY BANK 0x01 FULL` |
  | After 900 ms, while the modem plays | `SWAPPING TO MEMORY BANK 0x02..._` |
  | When the modem finishes: the READY moment, 900 ms | `MEMORY BANK 0x02 READY_` and, if chips were cashed in, the tally `CHIPS 0x03 = +0x0600` |

  With sound effects on, the modem dial-in plays (see [Audio](#audio)) and
  READY appears as it ends: 5765 ms in, 6665 ms in all. With sound effects
  off the transition lasts 4000 ms, READY (at 3100 ms) included, because
  the moment to get ready matters with or without sound. A tap or key
  press skips the swap, but only after the first 750 ms, so the tap that
  cleared the lines cannot skip it by accident. Skipping hangs up the
  modem with a short click, jumps to READY with the chip tally already
  complete (earned chips are never lost by skipping), plays only the
  "done" tone, and resumes play 600 ms later. Taps during READY wait for
  it to finish rather than land in the game. All timings are in `SCREENS`
  (`js/input/bindings.js`).
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
- **Microchip bonuses:** see below.
- Scores are always whole numbers.

## Microchips

Multi-row clears earn **microchips**, which are cashed in for points when
the memory bank completes. They reward building for big clears, and make
surviving to the end of the bank worth something. First-pass values, in
[`js/progression/chips.js`](../js/progression/chips.js):

| Rows at once | Chips |
| --- | --- |
| 1 | 0 (a normal clear) |
| 2 | 1 |
| 3 | 2 |
| 4 | 3 |
| 5 (FULL WORD) | 5 |

- **Accumulate** during the current bank, including the chips from the
  clear that completes it.
- **Cash-in** when the bank completes: chips x `CHIP_VALUE` (`0x100` = 256)
  x the number of the bank just completed, added to the score at once.
  The count then resets to zero for the new bank.
- **Lost** if the game ends before the bank completes: no points.
- The progression is authoritative: the score includes the cash-in the
  moment the bank completes, and the high score updates as usual. The
  READY moment's tally only animates that change (the HUD's `SCR` holds
  the cash-in back during the swap and counts up with the tally).
- **Display:**
  - When chips are earned, a small microchip icon (a DIP chip drawn in
    code: body, pin-1 notch, pins along both sides, in the green accent)
    flashes with `+0x01 CHIP` or `+0x03 CHIPS` at the height of the
    cleared rows, rising slightly and fading over 1 s. On a FULL WORD it
    sits below the centred FULL WORD banner so both stay readable.
  - The HUD's `CHP` register shows the chips held.
  - The READY moment shows the tally line `CHIPS 0x03 = +0x0600`, counting
    up in steps (one per chip, at most 8, 60 ms apart), with a blip per
    step and a "done" tone. No chips, no tally line.
  - Game over with chips held shows `CHIPS LOST 0x02` under "MEMORY FULL".

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
  START" (and "PRESS ENTER" when a mouse or trackpad is present), and a
  **SETTINGS** button. The title lives here rather than in a page header,
  so the header can hold the HUD.
- **Pause button:** a 44 x 44 px button at the top right, beside the HUD,
  above the playfield and away from the bottom soft-drop strip. Hidden when
  there is nothing to pause.
- **Pause menu:** opened by the pause button, P / Escape, or automatically
  when the page is hidden. Shows "PAUSED" with **RESUME** and **RESTART**.
  RESTART changes to **CONFIRM RESTART** and needs a second tap. Taps on the
  playfield do nothing while paused, so a stray touch cannot resume. P,
  Escape, or Enter also resume. Resuming continues exactly where the game
  stopped. A **SETTINGS** button opens the settings screen; the game stays
  paused while it is open.
- **Settings:** "SETTINGS_" and one button per setting, each showing its
  value; tapping a button cycles it, and the change applies at once:
  - **MUSIC: ON / OFF** (default on)
  - **SOUND FX: ON / OFF** (default on)
  - **NUMBER FORMAT: HEX / BIN / DEC** (default hex; the same setting the
    HUD tap cycles, so the two always agree)
  - **BACK** returns to where settings was opened from (start screen or
    pause menu); P or Escape also go back.

  Settings are remembered on this device (`mem-block-8:music`,
  `mem-block-8:soundFx`, `mem-block-8:numberMode`); without storage the
  game uses the defaults and still lets them be changed for the session.
  All buttons are at least 44 x 44 px. Stage 6 adds rows (theme, logo
  placement, control variants) to the same list.
- **Bank transition:** see [Memory banks](#memory-banks-levels).
- **Game over:** "NO CARRIER" (what a modem prints when the line drops),
  "MEMORY FULL", "CHIPS LOST 0x02" if chips were held, the score, memory
  bank reached ("MEMORY BANK 0x03"), and lines (one per line), then "NEW
  HIGH SCORE" (or the saved high score), then "TAP TO
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
| `CHP` | Microchips held this bank | 8-bit | 2 digits | 8 digits | 3 digits |

```
hex (default)                  binary                                decimal
SCR 0x000400  HI  0x001A40     SCR 0b0000 0000 0000 0100 0000 0000   SCR 00001024  HI  00006720
BNK 0x02      LNS 0x0013       HI  0b0000 0000 0001 1010 0100 0000   BNK 002       LNS 00019
CHP 0x03                       BNK 0b0000 0010                       CHP 003
                               LNS 0b0000 0000 0001 0011
                               CHP 0b0000 0011
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
- **Layout:** hex and decimal are two columns, three rows (SCR / HI, BNK /
  LNS, CHP); binary shows one register per row (five rows). The header is
  a fixed 64 px tall in every mode (five binary rows at 11 px on 12 px lines), so changing
  mode never resizes the playfield; that is 4 px more than the four-row
  header of Stage 4. The font is the largest that fits the width (up to
  16 px for hex and decimal, 11 px for binary).
- **Glow:** a value that goes up flares brighter for about 200 ms, like a
  VFD segment (CSS only). A value that drops (CHP cashed in, a new game)
  just changes.

## Audio

All sound effects are **synthesized** in code with the Web Audio API (no
sample files). Music is CC0 tracks (see [CREDITS.md](../CREDITS.md)).
Music and sound effects have **separate toggles** in settings, and music
sits noticeably lower in the mix than the effects. On iPhone the game
follows the ring/silent switch and mixes with other apps' audio (audio
session type "ambient"), and nothing sounds until the first tap.

### Sound effects

| Event | Sound |
| --- | --- |
| Piece locks (including hard drops) | A soft, short relay / key click: a tick of bright noise over a small low thump |
| Rotation | A very faint tick, about 12 dB below the lock click |
| Moves | Silent (they repeat many times a second) |
| Line clear (as the flash starts) | A short rising chirp; higher and slightly longer for more lines (1 to 5) |
| Chips earned (as the rows vanish, after the chirp) | A quick, bright rising square-wave arpeggio, an old computer's "success" beep: up a C major arpeggio from C5, one more note per chip (1 chip: 3 notes; 3 chips: 5 notes, higher and longer), each note doubled an octave up |
| FULL WORD | Part of the chips sound, not a second sound: the whole two-octave run to C7 with a long last note |
| Bank complete | The modem dial-in (below) |
| READY moment, chips cashed in | A blip per tally step, each a little higher, then a two-note "done" tone; only after the modem has finished |
| Skipping the transition | The modem stops at once with a short hang-up click, then only the "done" tone (if chips were cashed in) |
| Game over | A busy signal: 480 + 620 Hz, 0.5 s on, 0.5 s off, three times, under "NO CARRIER" |

Rewards sound like a computer, not money: square-wave beeps and
arpeggios, no bells or cash register. Volumes and timings are in one
table, `EFFECTS` in `js/audio/sfx.js` (the modem's phase timings in
`MODEM`, `js/audio/modem.js`).

- **Rewards are the loudest effects.** Playtesting on iPhone found the
  chip sound lost under the music: it fired, but was 1 dB quieter than the
  line chirp before it, in the same square-wave register as the music's
  leads (C5 to G5), where a phone speaker is weak. Now each reward note is
  doubled an octave up for presence, with a near-instant attack, and the
  rewards sit about 8 dB above the chirp and 12 dB above the lock click
  (loudest 50 ms, rendered: chips -9.4 dBFS, chirp -17.8, lock -21.5).
- **Music duck.** While a reward plays (chips, including the FULL WORD
  run, the tally, and the done tone), the music drops by 10 dB over 30 ms,
  holds until the reward ends, and comes back over 250 ms
  (`EFFECTS.duck`). Other effects never duck it.
- **Debug:** `?debug=1` lists every sound effect as it is asked to play,
  next to the gestures: whether it played, the AudioContext state, and
  whether the music ducked, or why it did not play.

### Modem dial-in (bank complete)

The music fades out (0.25 s), then after a 0.3 s lead-in the machine
"dials up" the next bank, about 5.5 s in all:

| Phase | Starts | Length | Imitates |
| --- | --- | --- | --- |
| Dial tone | 0.000 s | 0.45 s | Off-hook dial tone, 350 + 440 Hz |
| Dialling | 0.570 s | 0.585 s | DTMF digits 3-4-6-8 ("DIM8" on a keypad): 90 ms tones, 75 ms gaps, standard pairs (3 = 697 + 1477, 4 = 770 + 1209, 6 = 770 + 1477, 8 = 852 + 1336 Hz) |
| Ringback | 1.355 s | 0.5 s | One ring heard by the caller, 440 + 480 Hz |
| Answer tone | 1.975 s | 0.95 s | The answering modem: a steady 2100 Hz tone with a slight 15 Hz wobble in loudness. Twice (at 0.45 and 0.90 s into it) the wave flips over, which you hear as a click. In its last 0.35 s the calling modem starts warbling faintly underneath (980/1180 Hz) |
| FSK exchange | 2.925 s | 0.65 s | Both modems chirping data at each other: the answerer switching between 1650 and 1850 Hz 300 times a second (with a bright overtone an octave up), the caller between 980 and 1180 Hz underneath |
| Gap | 3.575 s | 0.04 s | Silence |
| INFO burst | 3.615 s | 0.12 s | Three steady tones together: 1200, 2400, and 3600 Hz |
| Line probe | 3.735 s | 0.3 s | A dense chord: every multiple of 150 Hz up to 3750 except 900, 1200, 1800, and 2400, brightest around 3300-3600 Hz; it drops 6 dB halfway. The modems measuring the line |
| INFO burst | 4.035 s | 0.09 s | The same three tones, shorter |
| Line probe | 4.125 s | 0.3 s | The same chord again |
| Tone and noise | 4.425 s | 0.22 s | A 2400 Hz tone over shaped noise |
| Gap | 4.645 s | 0.07 s | Silence |
| Training hiss | 4.715 s | 0.75 s | The familiar hiss: noise with the spectrum of the real thing (peaks near 1450, 2050, and 3450 Hz), fading out over its last 0.12 s. Then the speaker cuts out: connected, at 5.465 s |

From the answer tone on, the whole sound is band-limited to 250-3900 Hz,
like a phone line.

**Modelled on a real handshake.** Earlier versions built the handshake
mostly from noise and never quite sounded like a modem. The recognisable
sound is mostly tones: the answer tone with its clicks, overlapping FSK,
the multi-tone probe chords, and only then the hiss. Pass 3 (0.5.4)
models every phase, frequency, timing, and relative level on a V.34-era
modem handshake, taken from a reference recording that is kept locally in
`assets/audio-reference/` (gitignored, never shipped, not CC0), by way of
a synthesized prototype the owner approved by ear. Everything the game
plays is still synthesized in code.

**Frequencies switch but never sweep.** The FSK jumps between its two
frequencies, but nothing in the handshake glides, slides, or warbles in
pitch. Pass 1 gave the screech a drifting carrier and on the phone it
sounded like a cartoon spaceship; a test checks the rule. (The answer
tone's wobble is in loudness, not pitch, as on real answer tones.)

Times are from the first dial tone. The number is not a real phone
number. READY appears at lead-in + sequence = 5765 ms; the transition
lasts that plus the 900 ms READY moment, 6665 ms.

### Music

- **Gameplay only:** not on the start screen, pause menu, settings, game
  over, or during a bank transition. Pausing pauses the music; resuming
  continues from the same place.
- **Playlist:** bank 1 plays the first track, each completed bank moves to
  the next, cycling (table `TRACKS` in `js/audio/music.js`; Stage 6 maps
  tracks to era themes). The current order: Free Run, 8 Bit The Hero,
  8 bit Battle Theme, Pixel Sprinter, Boss Battle #2, Crow Man's Stage,
  Iced Village (cut to a 2:24 loop, 48 bars, so it fits in a phone's
  memory once decoded).
- **Bank transition:** music fades out before the modem starts and never
  plays over it; the next bank's track starts when play resumes.
- **Seamless loops:** each track loops without a gap (sample-exact loop
  points, no crossfade).
- **Offline:** the first track is cached at install; the others are cached
  the first time they play. A track that is missing or fails to load just
  leaves that bank without music.

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
