/**
 * js/loop.js - requestAnimationFrame loop with a fixed-timestep accumulator.
 *
 * Frames arrive at the display's rate (60 Hz, 120 Hz, or irregularly), but
 * the engine must advance in exact TICK_MS steps so the game plays the same
 * on every screen. Each frame adds the real elapsed time to an accumulator
 * and runs as many whole ticks as it holds; the remainder carries over.
 */

/**
 * Longest frame gap that is simulated. After a stall (a background tab, a
 * debugger pause, a slow phone), simulating the whole gap would replay
 * seconds of gravity in one frame and the player would come back to a
 * piece that had already landed. Clamping makes the game just pick up
 * where it was.
 */
export const MAX_FRAME_MS = 250;

/**
 * How many ticks a frame should run.
 * @param {number} accumulator Leftover time from earlier frames, ms.
 * @param {number} elapsed Time since the previous frame, ms.
 * @param {number} tickMs
 * @param {number} [maxFrameMs]
 * @returns {{steps: number, accumulator: number}}
 */
export function consumeTime(accumulator, elapsed, tickMs, maxFrameMs = MAX_FRAME_MS) {
  const total = accumulator + Math.min(Math.max(elapsed, 0), maxFrameMs);
  // TICK_MS (1000/120) is not exact in floating point, so a total that is
  // mathematically a whole number of ticks can land a hair below it. The
  // tiny tolerance stops that from losing a tick.
  const steps = Math.floor(total / tickMs + 1e-9);
  return { steps, accumulator: Math.max(0, total - steps * tickMs) };
}

/**
 * @typedef {object} Loop
 * @property {() => void} start Start (or keep) running; the first frame only records the time.
 * @property {() => void} stop
 * @property {() => boolean} isRunning
 */

/**
 * Create a loop.
 * @param {object} setup
 * @param {number} setup.tickMs Fixed step length.
 * @param {(now: number) => void} setup.onFrameStart Before ticks (input timers).
 * @param {() => void} setup.step One fixed tick.
 * @param {(now: number) => void} setup.onFrameEnd After ticks (events, drawing).
 * @param {(cb: FrameRequestCallback) => number} [setup.requestFrame]
 * @param {(id: number) => void} [setup.cancelFrame]
 * @returns {Loop}
 */
export function createLoop({
  tickMs,
  onFrameStart,
  step,
  onFrameEnd,
  requestFrame = (cb) => requestAnimationFrame(cb),
  cancelFrame = (id) => cancelAnimationFrame(id),
}) {
  let frameId = null;
  let last = null;
  let accumulator = 0;

  function frame(now) {
    frameId = requestFrame(frame);
    const elapsed = last === null ? 0 : now - last;
    last = now;
    onFrameStart(now);
    const result = consumeTime(accumulator, elapsed, tickMs);
    accumulator = result.accumulator;
    for (let i = 0; i < result.steps && frameId !== null; i++) {
      step();
    }
    onFrameEnd(now);
  }

  function start() {
    if (frameId !== null) return;
    last = null;
    accumulator = 0;
    frameId = requestFrame(frame);
  }

  function stop() {
    if (frameId === null) return;
    cancelFrame(frameId);
    frameId = null;
  }

  return { start, stop, isRunning: () => frameId !== null };
}
