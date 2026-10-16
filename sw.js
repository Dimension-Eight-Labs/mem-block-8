/**
 * sw.js - Service worker for Mem Block 8.
 *
 * Lives at the project root so its scope covers the whole app.
 * Strategy: cache-first for the app shell. On install, every file in
 * APP_SHELL is pre-cached; on fetch, a cached copy is served if present,
 * otherwise the network is used. Music caching (first track at install,
 * others on demand) is added in Stages 5 and 7.
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

const CACHE_VERSION = 'v0.4.0';
const CACHE_NAME = `mem-block-8-${CACHE_VERSION}`;

/** Files needed to boot offline. Paths are relative to this file's location. */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './js/audio/index.js',
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
  './js/progression/index.js',
  './js/progression/progress.js',
  './js/progression/scoring.js',
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
  './js/ui/debug.js',
  './js/ui/format.js',
  './js/ui/hud.js',
  './js/ui/index.js',
  './js/ui/number-mode.js',
  './js/ui/screens.js',
  './js/url-options.js',
  './assets/icons/icon.svg',
  // Fonts: the Latin-1 subsets of IBM Plex Mono (Regular, SemiBold).
  './assets/fonts/IBMPlexMono-Regular-Latin1.woff2',
  './assets/fonts/IBMPlexMono-SemiBold-Latin1.woff2',
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
          .filter((name) => name.startsWith('mem-block-8-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only handle same-origin GETs; the app makes no external requests anyway.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then((cached) => cached || fetch(request)),
  );
});
