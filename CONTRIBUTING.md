<!-- CONTRIBUTING.md - Coding conventions for Mem Block 8, for humans and AI agents alike. -->
# Contributing to Mem Block 8

These conventions apply to everyone, human or agent. When in doubt, match
the surrounding code and keep things simple and readable.

## Language and modules

- **ES modules only** (`import` / `export`). No CommonJS, no script-tag globals.
- **No globals.** Nothing is attached to `window` or `globalThis`.
- **`const` by default, `let` when a binding must change.** Never `var`.
- **No runtime dependencies** without discussion first. No CDNs, no
  external network requests at runtime.

## Formatting

- 2-space indentation, LF line endings, UTF-8 (see `.editorconfig`).
- Semicolons at the end of statements.
- Single quotes for strings; template literals when interpolating.

## Comments and documentation

- **Every file starts with a header comment** describing its purpose
  (JSON files, which cannot hold comments, are the exception).
- **JSDoc on every exported function, class, and type** (`@param`,
  `@returns`, `@typedef`). This is the project's type system.
- Comments explain **why**, not what. Add them where the logic is not
  obvious; do not narrate self-explanatory code.

## Structure

- Keep functions small and focused.
- **`js/engine` and `js/progression` stay pure and testable:** no DOM, no
  browser APIs, no timers, no direct randomness or clock reads. Pass time
  and an RNG in. Changes to either come with unit tests in `tests/`.
- **All `localStorage` access goes through `js/storage`**, which wraps
  every call in try/catch. Callers must cope with storage being unavailable.
- When adding a file that the app loads, add it to `APP_SHELL` in `sw.js`
  and bump `CACHE_VERSION` (see the comment block in `sw.js`).

## Changelog

Every stage, and every significant change between stages, adds an entry to
[`CHANGELOG.md`](CHANGELOG.md): what was built or changed, decisions made,
and open items.

## Touch rules

Do not remove the touch-safety rules listed in `docs/ARCHITECTURE.md`
("Touch rules"). Tune controls only in `js/input/bindings.js`; tune memory
banks and scoring only in `js/progression/`. Tappable controls (buttons,
settings) must be native controls or sit inside a `data-native-touch`
element, otherwise the touch guards cancel their clicks.

## Assets

- **Audio and music assets must be CC0.**
- **Fonts may be SIL Open Font License (OFL 1.1) or CC0.** Keep the font's
  license file next to it in `assets/fonts/`, and ship only the weights
  and subsets actually used (woff2 only).
- **Every third-party asset is recorded in `CREDITS.md`** with its license
  (asset, author, license, source URL, date added), in the same change
  that adds it.
- **Music:** keep a screenshot of each track's source page (showing its
  CC0 license) in `docs/licenses/music/`, and produce the shipped MP3 with
  `scripts/convert-music.sh`, never by hand (see README, "Adding or
  replacing music").
- Sound effects are synthesized with Web Audio, not shipped as samples.
- **Audio calls stay out of game logic.** The game reports events through
  the session's single hook (`deps.onEvent`); `js/audio` decides what they
  sound like. Keep schedules and playlist rules pure (no Web Audio) so they
  can be tested in Node.

## Clean-room rule

Mem Block 8 is an original game. Do not fetch, read, copy, or reference the
source code, themes, or assets of other falling-block games (including KDE
KBlocks, which inspired the idea). Do not name other falling-block games in
code, comments, or docs.

## Git

The project owner handles staging, committing, and pushing. Agents must not
run git commands that change repository state.

## Tests

```sh
npm test
```

Tests use `node:test` and `node:assert`; no test libraries are installed.
