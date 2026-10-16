/**
 * js/url-options.js - Optional settings read from the page URL.
 *
 * Lets control and logo variants be compared on a phone without editing
 * code, e.g. ?debug=1&moveOn=down&doubleTap=anywhere&logo=center.
 * Unknown or invalid values are ignored, so the defaults in bindings.js and
 * js/render/options.js always apply unless a valid override is given.
 */

const CHOICES = Object.freeze({
  logo: ['bottom', 'center'],
  moveOn: ['up', 'down'],
  doubleTap: ['center', 'anywhere'],
});

/**
 * @typedef {object} UrlOptions
 * @property {boolean} debug ?debug=1 shows the gesture log and zone lines.
 * @property {'bottom' | 'center'} [logoPlacement]
 * @property {'up' | 'down'} [moveOn]
 * @property {'center' | 'anywhere'} [doubleTapMode]
 */

/**
 * Parse a location.search string.
 * @param {string} search For example "?debug=1&logo=center".
 * @returns {UrlOptions}
 */
export function readUrlOptions(search) {
  const params = new URLSearchParams(search);
  const pick = (name) => {
    const value = params.get(name);
    return CHOICES[name].includes(value) ? value : undefined;
  };
  const options = { debug: params.get('debug') === '1' };
  const logo = pick('logo');
  const moveOn = pick('moveOn');
  const doubleTap = pick('doubleTap');
  if (logo) options.logoPlacement = logo;
  if (moveOn) options.moveOn = moveOn;
  if (doubleTap) options.doubleTapMode = doubleTap;
  return options;
}
