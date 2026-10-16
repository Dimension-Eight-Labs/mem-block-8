/**
 * js/touch-guard.js - Stops iOS WebKit from zooming or scrolling on game touches.
 *
 * Every iOS browser (Safari, Brave, Chrome...) uses WebKit. The CSS
 * touch-action rules in css/main.css should be enough, but WebKit's
 * support for touch-action has historically been partial, and its
 * double-tap-to-zoom heuristics still fired on real iPhones in Stage 2.
 * Cancelling the touch events themselves is the one fix WebKit always
 * honours, so this module does that for the whole game container.
 *
 * Game input is unaffected: input uses Pointer Events, which WebKit
 * dispatches before the matching touch events, and cancelling a touch
 * event does not suppress them. What preventDefault on touch events does
 * suppress is the browser's own follow-up behaviour: double-tap zoom,
 * scrolling, text selection, the long-press callout, and the emulated
 * mouse and click events.
 *
 * Because clicks are suppressed too, real controls (the HUD, the pause
 * button, the menus, and the settings screen) must opt out: put them inside an
 * element with the data-native-touch attribute, or use a native button,
 * link, or form control, and touches on them are left alone.
 */

/**
 * Elements whose touches keep normal browser behaviour (clicks, focus,
 * text entry). Also given touch-action: manipulation in css/main.css.
 */
export const NATIVE_TOUCH_SELECTOR =
  '[data-native-touch], button, a[href], input, select, textarea, label';

/**
 * Whether a touch on this target should keep native behaviour.
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
export function allowsNativeTouch(target) {
  return Boolean(target && typeof target.closest === 'function'
    && target.closest(NATIVE_TOUCH_SELECTOR));
}

/**
 * Install all touch guards.
 * @param {Document} doc
 * @param {HTMLElement} container The whole game container (header, playfield, HUD, margins).
 */
export function installTouchGuards(doc, container) {
  const cancel = (e) => {
    if (!allowsNativeTouch(e.target)) e.preventDefault();
  };

  // passive: false is required, or WebKit ignores preventDefault on
  // touchstart/touchmove (it treats document-level listeners as passive).
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    container.addEventListener(type, cancel, { passive: false });
  }

  // Desktop and older WebKit: a double click or double tap that still
  // produces dblclick can zoom or select text.
  container.addEventListener('dblclick', cancel);

  // WebKit pinch zoom arrives as its own gesture* events, at document
  // level, regardless of touch-action. Nothing in the game uses pinch.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    doc.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
}
