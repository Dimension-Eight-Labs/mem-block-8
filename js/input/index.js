/**
 * js/input/index.js - Touch and keyboard input for Mem Block 8.
 *
 * Responsibility: translate raw events into game actions. All mappings
 * and tuning values are in bindings.js; gesture and keyboard logic are
 * pure modules (gestures.js, keyboard.js) fed by a thin DOM adapter
 * (dom.js).
 *
 * Does NOT belong here: deciding whether a move is legal (the engine's
 * job), what an action means on the current screen (js/session.js), or
 * any drawing.
 */

export { createInput } from './dom.js';
export { TOUCH, GESTURE_ACTIONS, KEYS, KEY_REPEAT, SCREENS, DEBUG_LOG_LENGTH } from './bindings.js';
export { createGestureRecognizer, zoneAt, swipeDirection } from './gestures.js';
export { createKeyboard } from './keyboard.js';
