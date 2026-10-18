<!-- docs/ROADMAP.md - Delivery stages and open items for Mem Block 8. -->
# Mem Block 8 - Roadmap

## Stages

- [x] **0 - Skeleton, docs, empty PWA shell.** Folder structure, boot
  screen, manifest, versioned cache-first service worker, docs, test setup.
- [x] **1 - Core engine.** Grid, piece definitions, rotation, collision,
  line clears, gravity, lock delay. Pure logic, no DOM, with unit tests.
- [x] **2 - Rendering and input.** Canvas renderer, touch and keyboard
  input. First playable build.
  - Push and enable GitHub Pages as soon as Stage 2 is playable, for real
    HTTPS testing on iPhone (relative paths already support this).
- [x] **3 - Memory banks (levels), difficulty ramp, scoring.** Bank table
  and gravity curve, power-of-two scoring with FULL WORD, line clear and
  spawn delays, bank transition, per-bank tints, pause button and menu,
  high score.
- [x] **4 - Register-dump HUD** with the hex / binary / decimal cycle,
  bundled IBM Plex Mono, new piece mix immediately on a bank change.
- [x] **5 - Audio and settings screen.** Synthesized modem dial-in (the
  bank transition matches its length), synthesized sound effects, CC0
  music with gapless loops and a per-bank playlist, and the settings
  screen (music, sound effects, number format) from the start screen and
  the pause menu.
- [x] **Playtest pass 1 (0.5.1).** "MEMORY BANK" wording everywhere (no
  "BANK" alone), a longer modem handshake in four parts with a READY moment
  at the end of every bank transition (sound on or off), microchip bonuses
  (earned by multi-row clears, cashed in at bank complete, lost at game
  over) with a chip flash, a CHP register, a cash-in tally, and reward
  sounds, and Iced Village cut to a 2:24 loop.
- [x] **Playtest pass 2 (0.5.2).** The modem handshake rebuilt from the
  Stage 5 sound at 2.7 s with no pitch movement; a curated piece pool (X5,
  V5, W5, F5, F5m never dealt; banks 4 and 5 rebalanced); louder reward
  sounds with an octave voice, a music duck under them, and sound effects
  in the `?debug=1` log.
- [x] **Playtest pass 3 (0.5.4).** The answer tone and handshake rebuilt
  from a V.34-era reference recording, by way of the owner's approved
  prototype: answer tone with phase-reversal clicks, FSK exchange, INFO
  bursts, line-probe chords, and the training hiss, band-limited like a
  phone line. The call is 5.465 s; READY at 5765 ms.
- [ ] **6 - Era themes and DIM8 branding.** Era themes (with their own bank
  tints) and logo options, added to the settings screen.
- [ ] **7 - PWA polish.** Offline caching (including music), icons, iPhone
  testing, GitHub Pages deploy.
  - Replace the immediate service worker takeover (`skipWaiting` /
    `clients.claim`) with an "update ready, restart" notice, so an update
    never swaps files mid-game.
- [ ] **Later** - AI-versus mode, hold slot.

<!--
  Icons: Stage 0 ships a single placeholder SVG (assets/icons/icon.svg).
  iOS does not use SVG for apple-touch-icon, and some installers want PNGs,
  so proper PNG icons (180x180 apple-touch-icon, 192x192 and 512x512 manifest
  icons, plus a maskable variant) are produced in Stage 7.
-->
> **Note on icons:** Stage 0 uses a placeholder SVG icon only. Proper PNG
> icons (180 px apple-touch-icon, 192 px and 512 px manifest icons, and a
> maskable icon) come in Stage 7.

## Open items

- **License.** Not yet decided; there is deliberately no `LICENSE` file.
  Until one is chosen, the code is all rights reserved by default.
- **Touch controls on a real iPhone.** Stage 2 built `moveOn` and
  `doubleTapMode` variants and the tuning table; pick the defaults after
  phone testing.
- **Logo placement.** `'bottom'` (default) vs `'center'`, after phone testing.
- **Bank tuning.** The bank table, gravity curve, and transition timings
  are first-pass; tune after playtesting.
- **Audio on a real iPhone.** Gesture unlock, silent switch ("ambient"
  audio session), gapless loops (does WebKit trim the MP3 padding, or does
  the fallback loop point kick in? and the Iced Village wrap), memory, the
  rebuilt handshake, and whether the reward sounds and the music duck now
  come through (use `?debug=1` to see each sound fire). Effect volumes and the
  music level are first-pass (`EFFECTS` in `js/audio/sfx.js`, `MIX` in
  `js/audio/context.js`).
- **Piece pool.** Whether the curated pool (22 pieces) and the bank 4
  and 5 weights feel right; whether a later bank or a hard mode should
  deal the excluded shapes.
- **Microchip tuning.** The chips table and `CHIP_VALUE`
  (`js/progression/chips.js`) and the tally and READY timings (`SCREENS`)
  are first-pass.
- **Transition length.** 6.5 s with sound on (the modem plus READY) and
  4 s with it off; tune after playtesting (skip is allowed after 0.75 s).
- **Binary HUD size.** Binary now caps at 11 px (was 13 px) to fit five
  rows in a 64 px header; check readability on a phone.
- **Music file size.** The seven tracks total 12.2 MB; only the first
  (1.3 MB) is cached at install.

### Closed

- **Self-hosted monospace font** - IBM Plex Mono, Latin-1 woff2 subsets
  of Regular and SemiBold, SIL OFL (Stage 4).
- **Weight change lag** - a bank change now resets the bag
  (`setWeights(..., { resetBag: true })`), so the new mix starts right
  after the previewed piece (Stage 4).
- **Hidden spawn rows** - 4 hidden rows above the visible 22 (Stage 1).
- **Rotation system** - box-centre rotation with top-left rounding and a
  single kick list (Stage 1). See [DESIGN.md](DESIGN.md#rotation-custom-system).
- **Randomiser** - seeded weighted bag; per-bank tables (Stage 3).
- **Keyboard bindings** - set in Stage 2 (see DESIGN.md).
