/**
 * main.js - Entry point for Mem Block 8.
 *
 * A small bootstrap: installs the touch guards (js/touch-guard.js), registers the
 * service worker, and wires engine, session, loop, input, render, ui,
 * audio, and storage together. Behaviour lives in those modules, not here;
 * game flow and progression wiring live in js/session.js.
 */

import { createGame, TICK_MS } from './engine/index.js';
import { createRenderer, loadFonts } from './render/index.js';
import { createInput, TOUCH, GESTURE_ACTIONS, KEYS, KEY_REPEAT, SCREENS, DEBUG_LOG_LENGTH } from './input/index.js';
import { createScreens, createHud, createBanner, createChipFlash, createSettings } from './ui/index.js';
import { DEFAULT_THEME, tintForBank } from './themes/index.js';
import { createStorage, createHighScoreStore } from './storage/index.js';
import { createAudio } from './audio/index.js';
import { createLoop } from './loop.js';
import { createSession } from './session.js';
import { readUrlOptions } from './url-options.js';
import { installTouchGuards } from './touch-guard.js';

/**
 * Register the service worker so the app shell works offline.
 * Uses a relative path so the scope is the app's folder both locally
 * and under /mem-block-8/ on GitHub Pages.
 *
 * Browsers only expose service workers on HTTPS or localhost. Testing from
 * a phone over plain HTTP on the LAN (http://<laptop-ip>:8088/) therefore
 * runs without one: everything works, just not offline.
 * @returns {Promise<void>}
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (err) {
    // Offline support is a nice-to-have; the game must still run without it.
    console.warn('Service worker registration failed:', err);
  }
}

/**
 * A fresh random seed. crypto is used because the engine itself has no
 * randomness source other than its seed.
 * @returns {number}
 */
function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

async function boot() {
  installTouchGuards(document, document.getElementById('app'));
  registerServiceWorker();

  const url = readUrlOptions(location.search);
  const touch = { ...TOUCH };
  if (url.moveOn) touch.moveOn = url.moveOn;
  if (url.doubleTapMode) touch.doubleTapMode = url.doubleTapMode;

  const surface = document.getElementById('game-area');
  const box = document.getElementById('playfield-box');
  const canvas = document.getElementById('playfield');

  const renderOptions = url.logoPlacement ? { logoPlacement: url.logoPlacement } : {};
  const renderer = createRenderer(canvas, { theme: DEFAULT_THEME, options: renderOptions });

  // Canvas text (the DIM8 wordmark) is drawn once into a cached backdrop and
  // would stay in the fallback font if drawn before IBM Plex Mono arrives.
  // So the first draw waits for the font (briefly; see render/fonts.js), and
  // the backdrop is rebuilt if the font only finishes loading later.
  const fonts = loadFonts(document.fonts);
  await fonts.ready;
  fonts.loaded.then((ok) => {
    if (ok) renderer.rebuild();
  });

  const fit = () => renderer.resize(box.clientWidth, box.clientHeight, window.devicePixelRatio || 1);
  new ResizeObserver(fit).observe(box);
  window.addEventListener('resize', fit); // also fires when zoom changes devicePixelRatio
  fit();
  renderer.draw(null);

  const storage = createStorage();
  const settings = createSettings(storage);
  // One state for the HUD tap and the NUMBER FORMAT setting.
  const numberMode = settings.choice('numberMode');
  const screens = createScreens(document.getElementById('overlay'), {
    onCommand: (command, setting) => {
      if (command === 'setting') settings.cycle(setting);
      else session.handleCommand(command);
    },
    numberMode,
    settings,
  });
  screens.show('start'); // replaces the static markup, in the saved number mode

  const audio = createAudio({ settings: { music: settings.choice('music'), sfx: settings.choice('sfx') } });
  // iOS only lets audio start inside a user gesture, so every tap, click,
  // and key press offers to unlock it (cheap once unlocked). Capture phase,
  // so it runs before the handler that acts on the gesture (starting the
  // game, a settings toggle) and the sound for that action can play.
  for (const type of ['touchend', 'pointerup', 'click', 'keydown']) {
    window.addEventListener(type, () => audio.unlock(), { capture: true, passive: true });
  }

  let loop = null;
  let input = null;
  // The UI callbacks below refer to session; they only run after it exists.
  const session = createSession({
    makeGame: (bank) => createGame({
      seed: newSeed(),
      weights: bank.weights,
      gravityMsPerRow: bank.gravityMsPerRow,
    }),
    renderer,
    setBankTint: (bank) => {
      const tint = tintForBank(DEFAULT_THEME, bank);
      renderer.setBackground(tint);
      box.style.setProperty('--color-well-bg', tint); // the sliver around the canvas
    },
    screens,
    hud: createHud({
      element: document.getElementById('hud'),
      pauseButton: document.getElementById('pause-button'),
      onPause: () => session.handleCommand('pause'),
      numberMode,
    }),
    banner: createBanner(document.getElementById('banner'), SCREENS.fullWordMs),
    chipFlash: createChipFlash(document.getElementById('chip-flash'), {
      durationMs: SCREENS.chipFlashMs,
      numberMode,
      colors: { pin: '#39ff9f', body: '#0a0b10' }, // --color-accent, --color-surround
    }),
    highScore: createHighScoreStore(storage),
    startLoop: () => loop.start(),
    stopLoop: () => loop.stop(),
    resetInput: () => input.reset(),
    now: () => performance.now(),
    overlayInputDelayMs: SCREENS.overlayInputDelayMs,
    onEvent: (event) => audio.onEvent(event),
    transition: {
      // Matched to the modem sequence while sound effects are on.
      timing: () => audio.transitionTiming({ silentMs: SCREENS.bankTransitionMs, readyMs: SCREENS.bankReadyMs }),
      skipAfterMs: SCREENS.bankTransitionSkipAfterMs,
      connectAfterMs: SCREENS.bankTransitionConnectAfterMs,
      skipReadyMs: SCREENS.bankSkipReadyMs,
      tallyStepMs: SCREENS.chipTallyStepMs,
      tallyMaxSteps: SCREENS.chipTallyMaxSteps,
    },
  });

  loop = createLoop({
    tickMs: TICK_MS,
    onFrameStart: (now) => input.update(now),
    step: () => session.step(),
    onFrameEnd: () => session.frameEnd(),
  });

  let onDebug = null;
  if (url.debug) {
    const { createDebugPanel } = await import('./ui/debug.js');
    const panel = createDebugPanel(document.body, DEBUG_LOG_LENGTH);
    onDebug = panel.log;
    renderer.setDebugZones({ sideFraction: touch.sideFraction, bottomFraction: touch.bottomFraction });
  }

  input = createInput({
    surface,
    playfield: canvas,
    touch,
    keys: KEYS,
    keyRepeat: KEY_REPEAT,
    gestureActions: GESTURE_ACTIONS,
    onInput: (event) => session.handleInput(event),
    onDebug,
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) session.pause();
    audio.setHidden(document.hidden);
  });
}

boot();
