<!-- README.md - Overview, local setup, and principles for Mem Block 8. -->
# Mem Block 8

An original falling-block puzzle game from **DIM8 Labs**, themed on computer
memory and vintage computing. Blocks of memory drop into a 12 x 22 well; fill
rows to clear them. Built as an installable Progressive Web App for iPhone
Safari (Add to Home Screen) and desktop browsers.

> Status: Stage 4 - register-dump HUD (hex / binary / decimal), bundled
> IBM Plex Mono font. See [docs/ROADMAP.md](docs/ROADMAP.md).

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

### Debug overlay and test variants

Add URL parameters to compare options on a phone without editing code:

| Parameter | Effect |
| --- | --- |
| `?debug=1` | Log of the last few gestures (timing, distance, zone, action) and faint zone lines on the playfield |
| `?moveOn=down` | Side taps move on touch-down instead of release |
| `?doubleTap=anywhere` | Double tap anywhere to hard drop (single taps then wait 250 ms) |
| `?logo=center` | DIM8 mark centred in the playfield instead of near the bottom |

Combine them, e.g. `http://<laptop-ip>:8088/?debug=1&moveOn=down`.

## How to play

Pieces of 3, 4, and 5 cells fall into the 12 x 22 well. Fill a row
completely to clear it. The game ends when the stack reaches the top
("MEMORY FULL").

### Memory banks and scoring

- Levels are **memory banks**, numbered in hex (`BANK 0x01`, `0x02`, ...).
  Clear 10 lines to fill a bank; the game pauses briefly while it
  "connects" to the next one (tap to skip after a moment).
- Bank 1 deals only 3- and 4-cell pieces. Banks 2 to 5 bring in the
  5-cell pieces, easiest first. From bank 6 the mix stays the same and
  pieces fall faster each bank. Each bank has its own playfield tint.
- Line clears score powers of two, times the bank number: 1 line `0x40`,
  2 `0x80`, 3 `0x100`, 4 `0x200`, and 5 lines `0x400`, a **FULL WORD**.
- Soft drop earns 1 point per row, hard drop 2 points per row.
- Your high score is kept on this device only.

### The HUD

The registers at the top of the screen are your score (`SCR`), high score
(`HI`), bank (`BNK`), and lines (`LNS`). **Tap the HUD** to switch every
number in the game between hex (`0x001A40`), binary (`0b0001 1010 0100
0000`), and decimal (`00006720`). Your choice is remembered.

Details: [docs/DESIGN.md](docs/DESIGN.md#memory-banks-levels).

| Touch | Keyboard | Action |
| --- | --- | --- |
| Tap left / right third | Left / Right | Move one cell (hold to repeat) |
| Swipe right, up, or down | Up or X | Rotate clockwise |
| Swipe left | Z | Rotate counterclockwise |
| Double tap the centre | Space | Hard drop |
| Hold the bottom strip | Down (hold) | Soft drop |
| Pause button (top right), or switch away | P or Escape | Pause menu (RESUME, RESTART) |
| Tap the HUD (top left) | Click the HUD | Number format: hex -> binary -> decimal |
| Tap | Enter | Start, restart after game over, skip the bank transition |

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
js/engine/              Pure game logic, no DOM (Stage 1)
js/progression/         Memory banks, scoring, progress; pure (Stage 3)
js/render/              Canvas drawing (Stage 2)
js/input/               Touch and keyboard (Stage 2)
js/ui/                  Screens, register-dump HUD, number formatter; later settings
js/audio/               Web Audio synthesis and music (Stage 5)
js/themes/              Era themes (Stage 6)
js/storage/             localStorage wrapper: high score, number mode
assets/icons/           App icons
assets/fonts/           IBM Plex Mono (woff2 subsets) and its OFL license
assets/music/           CC0 music tracks
tests/                  node --test unit tests
docs/                   Design and architecture docs
```

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
