/**
 * js/input/dom.js - Thin DOM adapter: real events in, actions out.
 *
 * Converts pointer events (touch, pen, mouse) into samples for the pure
 * gesture recogniser and key events for the pure keyboard state, then maps
 * the results to actions through bindings.js. All decisions about what a
 * touch means live in gestures.js; this file only translates.
 */

import { createGestureRecognizer } from './gestures.js';
import { createKeyboard } from './keyboard.js';
import { allowsNativeTouch } from '../touch-guard.js';

/**
 * @typedef {object} InputEvent
 * @property {import('./bindings.js').Action | null} action Mapped action (null if unmapped).
 * @property {string} source 'touch' or 'key'.
 * @property {string | null} gesture Gesture name for touch input, else null.
 */

/**
 * @typedef {object} DebugRecord
 * @property {string} label Gesture name or key code.
 * @property {string | null} action
 * @property {string | null} zone
 * @property {number} distance
 * @property {number} duration
 * @property {number} t
 */

/**
 * @typedef {object} Input
 * @property {(now: number) => void} update Run repeat timers; call once per frame while playing.
 * @property {() => void} reset Drop current touches and held keys (screen changes, blur).
 * @property {() => void} destroy Remove all listeners.
 */

/**
 * Attach input handling.
 * @param {object} setup
 * @param {HTMLElement} setup.surface Element that receives pointer events.
 * @param {HTMLElement} setup.playfield Element whose box defines the zones.
 * @param {import('./bindings.js').TouchConfig} setup.touch
 * @param {Readonly<Record<string, import('./bindings.js').KeyBinding>>} setup.keys
 * @param {{delayMs: number, intervalMs: number}} setup.keyRepeat
 * @param {Readonly<Record<string, import('./bindings.js').Action | null>>} setup.gestureActions
 * @param {(event: InputEvent) => void} setup.onInput
 * @param {((record: DebugRecord) => void) | null} [setup.onDebug]
 * @returns {Input}
 */
export function createInput({ surface, playfield, touch, keys, keyRepeat, gestureActions, onInput, onDebug = null }) {
  const recognizer = createGestureRecognizer(touch);
  const keyboard = createKeyboard(keys, keyRepeat);

  function emitGestures(gestures) {
    for (const g of gestures) {
      const action = gestureActions[g.name] ?? null;
      if (onDebug) {
        onDebug({ label: g.name, action, zone: g.zone, distance: g.distance, duration: g.duration, t: g.t });
      }
      onInput({ action, source: 'touch', gesture: g.name });
    }
  }

  function emitActions(actions, label, t) {
    for (const action of actions) {
      if (onDebug) onDebug({ label, action, zone: null, distance: 0, duration: 0, t });
      onInput({ action, source: 'key', gesture: null });
    }
  }

  function sample(event, type) {
    const rect = playfield.getBoundingClientRect();
    const s = {
      id: event.pointerId,
      type,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      t: event.timeStamp,
    };
    emitGestures(recognizer.handle(s, { width: rect.width, height: rect.height }));
  }

  const listeners = [
    [surface, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Menu buttons over the well (pause menu) are not game input. Capturing
      // their pointer would also retarget the release to the surface, and the
      // browser would then never send the button its click.
      if (allowsNativeTouch(e.target)) return;
      // Capture so moves and the release arrive here even if the finger
      // slides off the element.
      surface.setPointerCapture(e.pointerId);
      sample(e, 'down');
    }],
    [surface, 'pointermove', (e) => {
      if (surface.hasPointerCapture(e.pointerId)) sample(e, 'move');
    }],
    [surface, 'pointerup', (e) => sample(e, 'up')],
    [surface, 'pointercancel', (e) => sample(e, 'cancel')],
    [surface, 'contextmenu', (e) => e.preventDefault()],
    [window, 'keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
      const result = keyboard.keyDown(e.code, e.timeStamp);
      if (result.handled) e.preventDefault();
      emitActions(result.actions, e.code, e.timeStamp);
    }],
    [window, 'keyup', (e) => {
      const result = keyboard.keyUp(e.code, e.timeStamp);
      if (result.handled) e.preventDefault();
      emitActions(result.actions, e.code, e.timeStamp);
    }],
    // A key released while the window is unfocused never sends keyup, so
    // forget held keys and touches when focus leaves.
    [window, 'blur', () => reset()],
  ];

  for (const [target, type, handler] of listeners) {
    target.addEventListener(type, handler);
  }

  function update(now) {
    emitGestures(recognizer.update(now));
    emitActions(keyboard.update(now), 'repeat', now);
  }

  function reset() {
    emitGestures(recognizer.reset());
    emitActions(keyboard.reset(), 'reset', 0);
  }

  function destroy() {
    for (const [target, type, handler] of listeners) {
      target.removeEventListener(type, handler);
    }
  }

  return { update, reset, destroy };
}
