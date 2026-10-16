/**
 * js/ui/banner.js - Brief text flashed over the playfield ("FULL WORD").
 *
 * A DOM element over the canvas in the green monospace style. The fade is
 * a CSS animation (css/main.css, .banner.show) whose length is set here, so
 * no timers are needed; the element hides itself when the animation ends.
 */

/**
 * @typedef {object} Banner
 * @property {(text: string) => void} flash Show text briefly (restarts if already showing).
 * @property {() => void} hide Hide at once (for example when a bank transition starts).
 */

/**
 * @param {HTMLElement} element
 * @param {number} durationMs
 * @returns {Banner}
 */
export function createBanner(element, durationMs) {
  element.style.animationDuration = `${durationMs}ms`;
  function hide() {
    element.classList.remove('show');
    element.hidden = true;
  }
  element.addEventListener('animationend', hide);
  return {
    hide,
    flash(text) {
      element.textContent = text;
      element.hidden = false;
      element.classList.remove('show');
      // Reading layout restarts the animation when it is already running.
      void element.offsetWidth;
      element.classList.add('show');
    },
  };
}
