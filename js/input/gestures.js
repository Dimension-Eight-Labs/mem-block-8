/**
 * js/input/gestures.js - Pure touch gesture recogniser.
 *
 * Takes pointer samples ({id, type, x, y, t}) with x and y relative to the
 * playfield's top-left corner, plus the playfield size, and returns the
 * gestures they complete. It has no DOM access and keeps no clock: time
 * comes only from sample timestamps and update(t), so it runs under Node
 * for tests. js/input/dom.js feeds it real pointer events.
 *
 * Gestures (mapped to actions in bindings.js):
 *   tapLeft, tapRight, tapCenter, tapBottom  quick, nearly still touch
 *   holdLeft, holdRight                      auto-repeat while held in a side zone
 *   doubleTap                                two taps close in time and space
 *   swipeLeft, swipeRight, swipeUp, swipeDown  travelled swipeMinPx; fires once, mid-swipe
 *   softDropStart, softDropEnd               finger down / up in the bottom strip
 *
 * Each pointer is tracked by id, so several fingers work independently.
 * A pointer moves through these states:
 *   pending   -> may still become a tap, hold, or swipe
 *   repeating -> hold auto-repeat started; movement is ignored until release
 *   swiped    -> a swipe fired; nothing more until release
 *   ignored   -> reset() was called while it was down; nothing until release
 */

/**
 * @typedef {object} PointerSample
 * @property {number} id Pointer id.
 * @property {'down' | 'move' | 'up' | 'cancel'} type
 * @property {number} x CSS pixels from the playfield's left edge (may be outside it).
 * @property {number} y CSS pixels from the playfield's top edge.
 * @property {number} t Timestamp in milliseconds.
 */

/**
 * @typedef {object} Gesture
 * @property {string} name Gesture name (see header).
 * @property {number} t When it was recognised.
 * @property {number | null} pointerId
 * @property {string | null} zone 'left' | 'center' | 'right' | 'bottom'
 * @property {number} distance Distance travelled by the touch, CSS pixels.
 * @property {number} duration Time since the touch went down, ms.
 */

/**
 * Which zone a point falls in. The bottom strip takes priority; points
 * outside the playfield fall into the nearest zone.
 * @param {number} x
 * @param {number} y
 * @param {{width: number, height: number}} size Playfield size.
 * @param {{sideFraction: number, bottomFraction: number}} config
 * @returns {'left' | 'center' | 'right' | 'bottom'}
 */
export function zoneAt(x, y, size, config) {
  if (y >= size.height * (1 - config.bottomFraction)) return 'bottom';
  if (x < size.width * config.sideFraction) return 'left';
  if (x >= size.width * (1 - config.sideFraction)) return 'right';
  return 'center';
}

/**
 * Swipe direction from a movement vector (dominant axis wins).
 * @param {number} dx
 * @param {number} dy
 * @returns {'Left' | 'Right' | 'Up' | 'Down'}
 */
export function swipeDirection(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'Left' : 'Right';
  return dy < 0 ? 'Up' : 'Down';
}

const SIDE_ZONES = new Set(['left', 'right']);
const capitalise = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * @typedef {object} GestureRecognizer
 * @property {(sample: PointerSample, size: {width: number, height: number}) => Gesture[]} handle
 * @property {(t: number) => Gesture[]} update Run timers (hold repeat, held-back taps) up to time t.
 * @property {() => Gesture[]} reset Ignore all current touches until they lift; ends soft drop.
 */

/**
 * Create a recogniser.
 * @param {import('./bindings.js').TouchConfig} config
 * @returns {GestureRecognizer}
 */
export function createGestureRecognizer(config) {
  const pointers = new Map();
  let softDropCount = 0;
  /** Last centre tap, for doubleTapMode 'center'. */
  let lastTap = null;
  /** Tap held back for doubleTapMode 'anywhere'. */
  let pendingTap = null;
  const anywhere = config.doubleTapMode === 'anywhere';
  const moveOnDown = config.moveOn === 'down' && !anywhere;

  function gesture(name, t, p) {
    return {
      name,
      t,
      pointerId: p ? p.id : null,
      zone: p ? p.zone : null,
      distance: p ? Math.round(Math.hypot(p.x - p.x0, p.y - p.y0)) : 0,
      duration: p ? Math.round(t - p.t0) : 0,
    };
  }

  function endSoftDrop(p, t, out) {
    if (!p.softDrop) return;
    p.softDrop = false;
    softDropCount--;
    if (softDropCount === 0) out.push(gesture('softDropEnd', t, p));
  }

  /** Fire timers due by time t, in time order per pointer. */
  function advance(t, out) {
    if (pendingTap && t - pendingTap.gesture.t > config.doubleTapWindowMs) {
      out.push(pendingTap.gesture);
      pendingTap = null;
    }
    for (const p of pointers.values()) {
      while (p.repeatAt !== null && t >= p.repeatAt) {
        p.state = 'repeating';
        out.push(gesture(`hold${capitalise(p.zone)}`, p.repeatAt, p));
        p.repeatAt += config.repeatIntervalMs;
      }
    }
  }

  function onDown(s, size, out) {
    const zone = zoneAt(s.x, s.y, size, config);
    const p = {
      id: s.id, zone, x0: s.x, y0: s.y, x: s.x, y: s.y, t0: s.t,
      state: 'pending', softDrop: false, movedOnDown: false,
      repeatAt: SIDE_ZONES.has(zone) ? s.t + config.repeatDelayMs : null,
    };
    pointers.set(s.id, p);
    if (zone === 'bottom') {
      p.softDrop = true;
      softDropCount++;
      if (softDropCount === 1) out.push(gesture('softDropStart', s.t, p));
    }
    if (moveOnDown && SIDE_ZONES.has(zone)) {
      p.movedOnDown = true;
      out.push(gesture(`tap${capitalise(zone)}`, s.t, p));
    }
  }

  function onMove(s, out) {
    const p = pointers.get(s.id);
    if (!p || p.state !== 'pending') return;
    p.x = s.x;
    p.y = s.y;
    const dx = s.x - p.x0;
    const dy = s.y - p.y0;
    const distance = Math.hypot(dx, dy);
    if (distance >= config.tapMaxPx) {
      p.repeatAt = null; // moved too far to count as a hold
    }
    if (distance >= config.swipeMinPx) {
      p.state = 'swiped';
      endSoftDrop(p, s.t, out);
      out.push(gesture(`swipe${swipeDirection(dx, dy)}`, s.t, p));
    }
  }

  function onTap(p, t, out) {
    const tap = gesture(`tap${capitalise(p.zone)}`, t, p);
    const near = (prev) => Math.hypot(p.x0 - prev.x, p.y0 - prev.y) <= config.doubleTapMaxPx
      && p.t0 - prev.gesture.t <= config.doubleTapWindowMs;

    if (anywhere) {
      if (pendingTap && near(pendingTap)) {
        pendingTap = null;
        out.push(gesture('doubleTap', t, p));
        return;
      }
      if (pendingTap) out.push(pendingTap.gesture); // too far away: release it now
      pendingTap = { gesture: tap, x: p.x0, y: p.y0 };
      return;
    }

    if (p.zone === 'center') {
      if (lastTap && near(lastTap)) {
        lastTap = null;
        out.push(gesture('doubleTap', t, p));
        return;
      }
      lastTap = { gesture: tap, x: p.x0, y: p.y0 };
    }
    if (!p.movedOnDown) out.push(tap);
  }

  function onUp(s, out) {
    const p = pointers.get(s.id);
    if (!p) return;
    pointers.delete(s.id);
    endSoftDrop(p, s.t, out);
    const distance = Math.hypot(p.x - p.x0, p.y - p.y0);
    const isTap = p.state === 'pending' && s.t - p.t0 <= config.tapMaxMs
      && distance < config.tapMaxPx;
    if (isTap) onTap(p, s.t, out);
  }

  function onCancel(s, out) {
    const p = pointers.get(s.id);
    if (!p) return;
    pointers.delete(s.id);
    endSoftDrop(p, s.t, out);
  }

  function handle(sample, size) {
    const out = [];
    advance(sample.t, out);
    if (sample.type === 'down') onDown(sample, size, out);
    else if (sample.type === 'move') onMove(sample, out);
    else if (sample.type === 'up') onUp(sample, out);
    else if (sample.type === 'cancel') onCancel(sample, out);
    return out;
  }

  function update(t) {
    const out = [];
    advance(t, out);
    return out;
  }

  function reset() {
    const out = [];
    for (const p of pointers.values()) {
      if (p.softDrop) endSoftDrop(p, p.t0, out);
      p.state = 'ignored';
      p.repeatAt = null;
    }
    lastTap = null;
    pendingTap = null;
    return out;
  }

  return { handle, update, reset };
}
