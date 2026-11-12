/**
 * URL parameters for tests, screenshots and sharing:
 *   ?preset=rain&seed=42&forge=0&debug
 *   ?debug=parts                         (parts showcase instead of the houses)
 *   ?quality=low                         (device quality tier instead of the detected one)
 *   ?bench=nobloom,msaa0                 (switch frame stages off to measure them, `BENCH_FLAGS`)
 *   ?taxi.cruiseSpeed=14&render.pixelSize=6   (any schema key)
 *
 * The preset is applied first, explicit keys afterwards – so `?preset=rain&weather.rain=0.2`
 * means "Rain, but lighter".
 */
import { resolvePresetName } from '../config/weatherPresets.js';
import { TIER_NAMES } from '../config/qualityTiers.js';

/**
 * @typedef {object} UrlConfig
 * @property {string|null} preset    resolved preset name
 * @property {Record<string, string>} values  schema keys → raw string values
 * @property {boolean|null} forge    explicit Forge visibility, null = default
 * @property {boolean} debug         expose `window.__street`
 * @property {boolean} parts         show the architectural parts showcase (`?debug=parts`)
 * @property {'low'|'medium'|'high'|null} quality  quality tier override, null = detect
 * @property {Set<string>} bench     frame stages switched off for measuring (`scripts/perf.js`)
 */

/**
 * `?bench=` flags: each switches one stage of the frame off, so `scripts/perf.js` can price it.
 *   msaa0   the scene pass without MSAA          nobloom    no bloom
 *   nograde no saturation, dither, vignette       nopost     scene → tone mapping, nothing else
 *   nofog   no sky fog                            flat       every mesh in one unlit material
 */
export const BENCH_FLAGS = Object.freeze([
  'msaa0',
  'nobloom',
  'nograde',
  'nopost',
  'nofog',
  'flat',
]);

const truthy = (v) => v === '' || v === '1' || v === 'true' || v === 'on';

/**
 * @param {string} search location.search
 * @param {(key: string) => boolean} isKnownKey
 * @returns {UrlConfig}
 */
export function parseUrlParams(search, isKnownKey) {
  const params = new URLSearchParams(search);
  /** @type {UrlConfig} */
  const cfg = {
    preset: null,
    values: {},
    forge: null,
    debug: false,
    parts: false,
    quality: null,
    bench: new Set(),
  };
  for (const [key, value] of params) {
    switch (key) {
      case 'bench':
        for (const f of value.split(',')) if (BENCH_FLAGS.includes(f)) cfg.bench.add(f);
        break;
      case 'preset':
        cfg.preset = resolvePresetName(value);
        break;
      case 'seed':
        cfg.values['street.seed'] = value;
        break;
      case 'forge':
        cfg.forge = truthy(value);
        break;
      case 'quality':
        cfg.quality = TIER_NAMES.includes(value) ? /** @type {any} */ (value) : null;
        break;
      case 'debug':
        cfg.parts = value === 'parts';
        cfg.debug = truthy(value) || cfg.parts;
        break;
      default:
        if (isKnownKey(key)) cfg.values[key] = value;
    }
  }
  return cfg;
}

/**
 * Parse and apply to the store. Invalid values are reported by the store and skipped.
 * @param {import('../core/Store.js').Store} store
 * @param {string} search
 * @returns {UrlConfig}
 */
export function applyUrlParams(store, search) {
  const cfg = parseUrlParams(search, (k) => store.has(k));
  if (cfg.preset) store.set('weather.preset', cfg.preset, 'url');
  store.load(cfg.values, 'url');
  return cfg;
}
