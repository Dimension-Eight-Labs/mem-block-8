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
- [ ] **5 - Audio and settings screen.** Synthesized modem sequence (on the
  bank transition, matched to its length), sound effects, music player,
  and the settings screen with the music and sound effect toggles
  (reached from the pause menu).
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
