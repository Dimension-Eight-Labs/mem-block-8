/**
 * js/input/keyboard.js - Pure keyboard state with custom auto-repeat.
 *
 * The operating system's key repeat varies by machine and settings, so
 * OS repeats are ignored and repeat is generated here with the same timing
 * as touch holds. No DOM access: js/input/dom.js passes in key codes and
 * timestamps, which keeps this testable under Node.
 */

/**
 * @typedef {object} KeyResult
 * @property {boolean} handled Whether the key is bound (the caller should preventDefault).
 * @property {import('./bindings.js').Action[]} actions Actions to perform now.
 */

/**
 * @typedef {object} KeyboardState
 * @property {(code: string, t: number) => KeyResult} keyDown
 * @property {(code: string, t: number) => KeyResult} keyUp
 * @property {(t: number) => import('./bindings.js').Action[]} update Repeat actions due by time t.
 * @property {() => import('./bindings.js').Action[]} reset Forget held keys (e.g. on window blur).
 */

/**
 * Create keyboard state.
 * @param {Readonly<Record<string, import('./bindings.js').KeyBinding>>} keys
 * @param {{delayMs: number, intervalMs: number}} repeat
 * @returns {KeyboardState}
 */
export function createKeyboard(keys, repeat) {
  /** Held keys: code -> next repeat time (or null for no repeat). */
  const held = new Map();

  function keyDown(code, t) {
    const binding = keys[code];
    if (!binding) return { handled: false, actions: [] };
    if (held.has(code)) return { handled: true, actions: [] }; // OS repeat
    if (binding.repeat) {
      // Most recent direction wins: pressing Right while holding Left stops
      // Left repeating, so the piece does not jitter between the two.
      for (const [other, next] of held) {
        if (next !== null) held.set(other, null);
      }
    }
    held.set(code, binding.repeat ? t + repeat.delayMs : null);
    return { handled: true, actions: [binding.action] };
  }

  function keyUp(code) {
    const binding = keys[code];
    if (!binding) return { handled: false, actions: [] };
    const wasHeld = held.delete(code);
    return { handled: true, actions: wasHeld && binding.release ? [binding.release] : [] };
  }

  function update(t) {
    const actions = [];
    for (const [code, next] of held) {
      let due = next;
      while (due !== null && t >= due) {
        actions.push(keys[code].action);
        due += repeat.intervalMs;
      }
      held.set(code, due);
    }
    return actions;
  }

  function reset() {
    const actions = [];
    for (const code of held.keys()) {
      if (keys[code].release) actions.push(keys[code].release);
    }
    held.clear();
    return actions;
  }

  return { keyDown, keyUp, update, reset };
}
