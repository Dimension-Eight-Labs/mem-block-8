<!-- README.md - Overview, local setup, and principles for Mem Block 8. -->
# Mem Block 8

An original falling-block puzzle game from **DIM8 Labs**, themed on computer
memory and vintage computing. Blocks of memory drop into a 12 x 22 well; fill
rows to clear them. Built as an installable Progressive Web App for iPhone
Safari (Add to Home Screen) and desktop browsers.

> Status: 0.5.3 after Stage 5 - playtest pass 2 (the Stage 5 modem
> screech restored, a curated piece pool, louder reward sounds with a
> music duck), then a workaround for the iOS 27 status bar blur. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Principles

- **Offline.** Everything the game needs is cached on the device. No runtime network requests.
- **No ads.**
- **No tracking or data collection.** Settings and high score stay in this browser's local storage.
- **No leaderboards.** You play against yourself (and, later, an optional on-device AI).
- **No build step.** Plain HTML, CSS, and JavaScript ES modules. No framework, no bundler, no runtime dependencies.

## Run locally

ES modules and service workers do not work from `file://` URLs, so serve the
project over HTTP with the included development server:

```sh
python3 scripts/serve.py          # port 8088
python3 scripts/serve.py 9000     # or another port
```

Then open <http://localhost:8088/>. The server uses only the Python standard
library and sends `Cache-Control: no-store` on every response, so browsers
(especially phones) always load the files you just edited. Plain
`python3 -m http.server` lets browsers keep old copies for a while. `localhost` counts as a secure context, so
the service worker registers. If you see stale files after editing, read the
comment block at the top of [`sw.js`](sw.js) on clearing caches.

### On a phone over the LAN

`scripts/serve.py` listens on all interfaces and prints this machine's LAN
address when it starts. On a phone **on the same network** (same Wi-Fi, not
mobile data or a guest network), open `http://<laptop-ip>:8088/`.

If the phone cannot connect, the laptop's firewall is probably blocking the
port. Allow TCP 8088, for example `sudo ufw allow 8088/tcp` (ufw) or
`sudo firewall-cmd --add-port=8088/tcp` (firewalld); on macOS, allow incoming
connections for Python when prompted.
Plain HTTP on a LAN address is not a secure context, so the service worker
does not register there: the game works, but not offline and not as an
installed app. That needs HTTPS (GitHub Pages, set up after Stage 2).

**Testing the installed app's status bar.** iOS reads the app's status
bar setting only when the app is added to the home screen. After deploying
a change to it (such as 0.5.3's iOS status bar workaround), delete the app
from the home screen and add it again from Safari, or the old setting
stays. A true test needs the installed app over HTTPS (GitHub Pages); the
LAN address cannot be installed as an app.

### Debug overlay and test variants

Add URL parameters to compare options on a phone without editing code:

| Parameter | Effect |
| --- | --- |
| `?debug=1` | Log of the last few gestures (timing, distance, zone, action) and sound effects (played or not, audio state, music duck), and faint zone lines on the playfield |
| `?moveOn=down` | Side taps move on touch-down instead of release |
| `?doubleTap=anywhere` | Double tap anywhere to hard drop (single taps then wait 250 ms) |
| `?logo=center` | DIM8 mark centred in the playfield instead of near the bottom |

Combine them, e.g. `http://<laptop-ip>:8088/?debug=1&moveOn=down`.

## How to play

Pieces of 3, 4, and 5 cells fall into the 12 x 22 well. Fill a row
completely to clear it. The game ends when the stack reaches the top
("MEMORY FULL").

### Memory banks and scoring

- Levels are **memory banks**, numbered in hex (`MEMORY BANK 0x01`,
  `0x02`, ...). Clear 10 lines to fill a memory bank. The game then swaps
  to the next memory bank ("SWAPPING TO MEMORY BANK 0x02...", with a
  dial-up modem if sound is on) and shows "MEMORY BANK 0x02 READY" for a
  moment before play resumes. Tap to skip the swap after a moment.
- Memory bank 1 deals only 3- and 4-cell pieces. Memory banks 2 to 5
  bring in the 5-cell pieces, easiest first. From memory bank 6 the mix
  stays the same and pieces fall faster each time. Each memory bank has
  its own playfield tint.
- Line clears score powers of two, times the memory bank number: 1 line
  `0x40`, 2 `0x80`, 3 `0x100`, 4 `0x200`, and 5 lines `0x400`, a **FULL
  WORD**.
- Soft drop earns 1 point per row, hard drop 2 points per row.
- Your high score is kept on this device only.

### Microchips

- Clearing several rows at once earns **microchips**: 2 rows earn 1 chip,
  3 rows 2, 4 rows 3, and a FULL WORD 5. Single rows earn none. A chip
  icon flashes "+3 CHIPS" where the rows cleared.
- Chips pile up in the `CHP` register while you fill the current memory
  bank. When it is full they are **cashed in**: each chip is worth `0x100`
  points times the number of the memory bank you just filled. The READY
  moment tallies them ("CHIPS 0x03 = +0x0600"); skipping the swap still
  pays them all.
- If the game ends before the memory bank is full, the chips are lost
  ("CHIPS LOST" on the game-over screen).

### The HUD

The registers at the top of the screen are your score (`SCR`), high score
(`HI`), memory bank (`BNK`), lines (`LNS`), and chips held (`CHP`). **Tap
the HUD** to switch every number in the game between hex (`0x001A40`),
binary (`0b0001 1010 0100 0000`), and decimal (`00006720`). Your choice is
remembered.

Details: [docs/DESIGN.md](docs/DESIGN.md#memory-banks-levels).

### Sound and settings

- Every sound effect is synthesized in the browser: a soft click when a
  piece locks, a faint tick on rotation, a rising chirp for line clears, a
  bright beep arpeggio when you earn chips (the longest for a FULL WORD),
  blips and a "done" tone as chips are tallied, a busy signal at game over
  ("NO CARRIER"), and a dial-up modem calling the next memory bank (DTMF
  "DIM8", ringing, answer tone, then a handshake that runs from carrier
  tones through the screech to a hush). The swap lasts as long as the
  call; tap to skip (the modem hangs up).
- Music plays during play only, a different CC0 track for each memory
  bank, and loops seamlessly. It pauses with the game.
- Nothing sounds until your first tap (iPhones require it). On iPhone the
  game follows the ring/silent switch and lets your own music or podcast
  keep playing.
- **SETTINGS** (on the start screen and the pause menu): MUSIC on/off,
  SOUND FX on/off, NUMBER FORMAT hex/bin/dec. Saved on this device.

| Touch | Keyboard | Action |
| --- | --- | --- |
| Tap left / right third | Left / Right | Move one cell (hold to repeat) |
| Swipe right, up, or down | Up or X | Rotate clockwise |
| Swipe left | Z | Rotate counterclockwise |
| Double tap the centre | Space | Hard drop |
| Hold the bottom strip | Down (hold) | Soft drop |
| Pause button (top right), or switch away | P or Escape | Pause menu (RESUME, RESTART, SETTINGS) |
| SETTINGS button | P or Escape to go back | Settings (music, sound effects, number format) |
| Tap the HUD (top left) | Click the HUD | Number format: hex -> binary -> decimal |
| Tap | Enter | Start, restart after game over, skip the memory bank swap |

All controls and their tuning values are in
[`js/input/bindings.js`](js/input/bindings.js).

## Run tests

Tests use Node's built-in test runner (Node 20 or newer; developed on Node 22).
There is nothing to install.

```sh
npm test
# or, without npm:
node --test "tests/**/*.test.js"
```

About `package.json`: it exists only so Node treats `.js` files as ES modules
(`"type": "module"`) and to hold the `test` script. It has no dependencies and
`node_modules/` should never appear. Recent Node versions can guess the module
type from syntax, but that guess fails for files with no `import`/`export`
(such as the Stage 0 placeholders) and differs across Node versions, so it is
declared explicitly.

## Adding or replacing music

Music must be **CC0**. The source files live in `assets/music/originals/`
(gitignored, local only); the converted MP3s in `assets/music/` are what
ship.

1. Download the track and save a screenshot of its source page showing the
   license in `docs/licenses/music/`.
2. Put the audio file in `assets/music/originals/` and add a line for it to
   `TRACKS` in [`scripts/convert-music.sh`](scripts/convert-music.sh)
   (source file, output name, channels; for a long track, also a loop end
   and crossfade in samples, explained at the top of the script).
3. Run `scripts/convert-music.sh` (needs ffmpeg: `sudo apt install
   ffmpeg`), or `scripts/convert-music.sh <output name>` for just that
   track. It trims silence, cuts loops, encodes 128 kbps 44.1 kHz MP3, and
   prints each track's exact length in samples ("frames").
4. Add or update the track in `TRACKS` in
   [`js/audio/music.js`](js/audio/music.js), with that frame count (it is
   what makes the loop seamless). The order there is the playlist order.
5. Add a row to [CREDITS.md](CREDITS.md). If the track becomes the first in
   the playlist, update its path in `APP_SHELL` in `sw.js`. Bump
   `CACHE_VERSION` in `sw.js`, and also `MUSIC_CACHE_VERSION` if you
   replaced a file under the same name. Run `npm test` (it checks that every
   playlist file exists and is credited).

## Project layout

```
index.html              App shell / boot screen
manifest.webmanifest    PWA manifest
sw.js                   Service worker (root, so its scope covers the app)
css/main.css            Styles and design tokens
js/main.js              Entry point (small bootstrap)
js/session.js           Session states, the current game, progression wiring; handles events
js/loop.js              Fixed-timestep requestAnimationFrame loop
js/url-options.js       ?debug=1 and other URL test switches
js/touch-guard.js       Stops iOS zoom/scroll on game touches
scripts/serve.py        No-cache dev server (development only)
scripts/convert-music.sh  Rebuilds assets/music/*.mp3 from the originals (ffmpeg)
js/engine/              Pure game logic, no DOM (Stage 1)
js/progression/         Memory banks, scoring, microchips, progress; pure (Stage 3)
js/render/              Canvas drawing (Stage 2)
js/input/               Touch and keyboard (Stage 2)
js/ui/                  Screens, register-dump HUD, number formatter, settings
js/audio/               Synthesized effects, modem dial-in, music player (Stage 5)
js/themes/              Era themes (Stage 6)
js/storage/             localStorage wrapper: high score, settings
assets/icons/           App icons
assets/fonts/           IBM Plex Mono (woff2 subsets) and its OFL license
assets/music/           CC0 music tracks (MP3); originals/ is local only
docs/licenses/music/    License screenshot for each track
tests/                  node --test unit tests
tools/                  Developer tools (not part of the game)
docs/                   Design and architecture docs
```

## Developer tools

Pages for working on the game. They are not linked from the game, not in
the service worker's `APP_SHELL`, and change nothing; open them from
`scripts/serve.py`.

- **Piece gallery**: http://localhost:8088/tools/piece-gallery.html.
  It shows all 27 pieces, grouped by size, in their game colours with
  their rotation states. Pieces in `EXCLUDED_PIECES` are marked. Pick a
  bank (1 to 8) to see each piece's weight and share of the bag, plus the
  3-, 4- and 5-cell shares. Click pieces to propose keeping or dropping
  them; the page prints the whole `export const EXCLUDED_PIECES = [...];` line with a Copy
  button, to paste into `js/progression/banks.js` by hand. It imports the
  game's own modules, so it always shows the real data. If you opened the
  game on localhost before, its service worker may serve cached modules;
  the page says so when that happens.

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md) - game design decisions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - module layout, data flow, game loop
- [docs/ROADMAP.md](docs/ROADMAP.md) - stages and open items
- [CONTRIBUTING.md](CONTRIBUTING.md) - coding conventions (for humans and agents)
- [CREDITS.md](CREDITS.md) - third-party assets (CC0 only)
- [CHANGELOG.md](CHANGELOG.md) - what changed in each stage

## Hosting

GitHub Pages, from the `Dimension-Eight-Labs/mem-block-8` repository. All
paths in the app are relative so it works under the `/mem-block-8/` sub-path.

## License

Not yet decided. See the open items in [docs/ROADMAP.md](docs/ROADMAP.md).
