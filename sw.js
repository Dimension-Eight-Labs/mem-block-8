/**
 * sw.js - Service worker for Mem Block 8.
 *
 * Lives at the project root so its scope covers the whole app.
 * Strategy: cache-first for the app shell. On install, every file in
 * APP_SHELL is pre-cached; on fetch, a cached copy is served if present,
 * otherwise the network is used.
 *
 * Music: the first track (bank 1) is in APP_SHELL, so it is there offline
 * from the first visit. The other tracks are large (up to 4 MB), so they
 * are fetched the first time a bank needs them and then kept in a separate
 * music cache (MUSIC_CACHE), served cache-first from then on. That cache
 * is not tied to CACHE_VERSION, so an app update does not throw away and
 * re-download every track. If a track cannot be fetched (offline, not yet
 * cached) the game just plays that bank without music.
 *
 * Replacing a track's audio under the SAME file name: bump
 * MUSIC_CACHE_VERSION too, or installed players keep the old recording.
 *
 * ---------------------------------------------------------------------
 * WHEN AND HOW TO BUMP CACHE_VERSION
 * ---------------------------------------------------------------------
 * Bump CACHE_VERSION every time you deploy a change to any cached file
 * (HTML, CSS, JS, manifest, icons). Cache-first means installed users
 * keep the old files until the version string changes. Changing it:
 *   1. makes the browser see sw.js as a new worker (byte-different file),
 *   2. the new worker pre-caches the shell under the new cache name,
 *   3. on activate, every cache whose name is not the current one is deleted.
 * Also add any new module or asset (fonts included) to APP_SHELL, or it will
 * not work offline. The
 * ?debug=1 panel (js/ui/debug.js) is loaded on demand but is listed too,
 * so debug mode also works offline.
 *
 * Service workers only register on HTTPS or localhost. Testing from a phone
 * over plain HTTP on the LAN runs without this worker (no offline, and no
 * stale-cache confusion from it). Use scripts/serve.py for that: it also
 * stops the browser's ordinary HTTP cache from serving old files.
 *
 * ---------------------------------------------------------------------
 * STALE CACHES DURING LOCAL DEVELOPMENT
 * ---------------------------------------------------------------------
 * Because this is cache-first, editing a file and reloading may still show
 * the old version. That is the worker doing its job, not a bug. Options:
 *   - Chrome/Edge: DevTools > Application > Service Workers, tick
 *     "Update on reload" (and/or "Bypass for network"), or use
 *     Application > Storage > "Clear site data".
 *   - Firefox: about:debugging#/runtime/this-firefox > Unregister, or
 *     DevTools > Storage > Cache Storage > delete.
 *   - Safari: Develop > Empty Caches, or Settings > Safari > Advanced >
 *     Website Data on iPhone.
 *   - Or bump CACHE_VERSION locally.
 */

const CACHE_VERSION = 'v0.5.4';
const CACHE_NAME = `mem-block-8-${CACHE_VERSION}`;

/**
 * Runtime cache for music tracks (see above). v2: iced-village.mp3 was cut
 * to a loop under the same name (0.5.1); activating drops the v1 cache.
 */
const MUSIC_CACHE_VERSION = 'v2';
const MUSIC_CACHE = `mem-block-8-music-${MUSIC_CACHE_VERSION}`;
const MUSIC_PATH = '/assets/music/';

/** Files needed to boot offline. Paths are relative to this file's location. */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './js/audio/context.js',
  './js/audio/index.js',
  './js/audio/modem.js',
  './js/audio/music.js',
  './js/audio/player.js',
  './js/audio/schedule.js',
  './js/audio/signals.js',
  './js/audio/sfx.js',
  './js/audio/synth.js',
  './js/engine/board.js',
  './js/engine/config.js',
  './js/engine/constants.js',
  './js/engine/debug.js',
  './js/engine/game.js',
  './js/engine/index.js',
  './js/engine/pieces.js',
  './js/engine/randomizer.js',
  './js/engine/rng.js',
  './js/engine/rotation.js',
  './js/input/bindings.js',
  './js/input/dom.js',
  './js/input/gestures.js',
  './js/input/index.js',
  './js/input/keyboard.js',
  './js/loop.js',
  './js/main.js',
  './js/progression/banks.js',
  './js/progression/chips.js',
  './js/progression/index.js',
  './js/progression/progress.js',
  './js/progression/scoring.js',
  './js/render/chip.js',
  './js/render/color.js',
  './js/render/fonts.js',
  './js/render/index.js',
  './js/render/layout.js',
  './js/render/logo.js',
  './js/render/options.js',
  './js/render/renderer.js',
  './js/session.js',
  './js/storage/index.js',
  './js/themes/default.js',
  './js/themes/index.js',
  './js/touch-guard.js',
  './js/ui/banner.js',
  './js/ui/chip-flash.js',
  './js/ui/choice.js',
  './js/ui/debug.js',
  './js/ui/format.js',
  './js/ui/hud.js',
  './js/ui/index.js',
  './js/ui/number-mode.js',
  './js/ui/screens.js',
  './js/ui/settings.js',
  './js/ui/tally.js',
  './js/url-options.js',
  './assets/icons/icon.svg',
  // Fonts: the Latin-1 subsets of IBM Plex Mono (Regular, SemiBold).
  './assets/fonts/IBMPlexMono-Regular-Latin1.woff2',
  './assets/fonts/IBMPlexMono-SemiBold-Latin1.woff2',
  // Music: only the first track (TRACKS[0] in js/audio/music.js); the rest
  // are cached on first use.
  './assets/music/free-run.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      // Activate immediately so a version bump takes effect on next load.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('mem-block-8-') && name !== CACHE_NAME && name !== MUSIC_CACHE)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

/**
 * A music track: from any cache (the first is in the shell), else fetched
 * and stored in the music cache. Only complete responses are stored, never
 * partial (206) ones from range requests.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function musicResponse(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200) {
    const copy = response.clone();
    caches.open(MUSIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only handle same-origin GETs; the app makes no external requests anyway.
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.includes(MUSIC_PATH) && url.pathname.endsWith('.mp3')) {
    event.respondWith(musicResponse(request));
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then((cached) => cached || fetch(request)),
  );
});
