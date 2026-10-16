/**
 * js/render/fonts.js - Load the bundled font before drawing canvas text.
 *
 * Why this exists: DOM text simply re-renders when a web font arrives
 * (font-display: swap), but canvas text is pixels. Anything drawn with the
 * fallback font stays in the fallback font. And a canvas using a font does
 * not reliably make the browser fetch it. So the faces used on the canvas
 * are loaded explicitly, the first canvas text draw waits for them (up to a
 * short timeout, so a slow or failed load never blocks the game), and the
 * caller redraws once they do arrive.
 *
 * Today the only canvas text is the DIM8 wordmark in the backdrop.
 */

/** Font shorthand for each face drawn on the canvas (weight, any size, family). */
export const CANVAS_FONTS = Object.freeze(['400 16px "IBM Plex Mono"']);

/** Longest the first draw waits for the font. From the offline cache it takes milliseconds. */
export const FONT_WAIT_MS = 1500;

/**
 * @typedef {object} FontLoad
 * @property {Promise<boolean>} ready Resolves when the fonts loaded (true) or
 *   on timeout or failure (false), whichever comes first. Never rejects.
 * @property {Promise<boolean>} loaded Resolves when the fonts have loaded
 *   (true) or failed (false). Never rejects.
 */

/**
 * Start loading fonts.
 * @param {{load: (font: string) => Promise<unknown>} | undefined} fontSet document.fonts
 *   (undefined in browsers without the Font Loading API: nothing to wait for).
 * @param {readonly string[]} [fonts]
 * @param {number} [timeoutMs]
 * @param {(fn: () => void, ms: number) => unknown} [setTimer]
 * @returns {FontLoad}
 */
export function loadFonts(fontSet, fonts = CANVAS_FONTS, timeoutMs = FONT_WAIT_MS, setTimer = setTimeout) {
  if (!fontSet || typeof fontSet.load !== 'function') {
    const done = Promise.resolve(false);
    return { ready: done, loaded: done };
  }
  const loaded = Promise.all(fonts.map((font) => fontSet.load(font)))
    // load() resolves with the matching faces; an empty list means none matched.
    .then((results) => results.every((faces) => !Array.isArray(faces) || faces.length > 0))
    .catch(() => false);
  const timeout = new Promise((resolve) => {
    setTimer(() => resolve(false), timeoutMs);
  });
  return { ready: Promise.race([loaded, timeout]), loaded };
}
