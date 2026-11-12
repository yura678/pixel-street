/**
 * Observable parameter store validated against `params.schema.js`.
 *
 * Forge, presets, URL params and imported JSON all write through this one API; systems subscribe
 * to the keys they care about and update uniforms / regenerate geometry themselves.
 *
 *   store.get('taxi.cruiseSpeed');                       // 8
 *   store.set('weather.preset', 'Downpour');             // invalid value → reported, ignored
 *   const off = store.subscribe('water.*', (keys) => {}); // keys = changed keys under water.
 *   store.batch(() => { store.set(a, 1); store.set(b, 2); }); // one notification
 */
import { PARAM_DEFS } from '../config/params.schema.js';
import { clamp } from './math.js';
import { normalizeHex } from './color.js';

/**
 * @typedef {object} ParamDef
 * @property {string} key
 * @property {'number'|'boolean'|'select'|'color'} type
 * @property {any} default
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {readonly string[]} [options]
 * @property {boolean} [rebuild] changing it rebuilds geometry (Forge writes it on release)
 * @property {string} [pending] not wired up yet: the stage that will add it
 */

/** @typedef {{ ok: true, value: any } | { ok: false, error: string }} ValidationResult */

/**
 * @callback StoreListener
 * @param {string[]} keys changed keys that match the subscription pattern
 * @param {string} source who made the change ('forge', 'preset', 'url', 'import', 'api' ...)
 */

/**
 * Validate and coerce a value for one definition. Numbers are clamped to [min, max]; integer
 * steps (seeds, floor counts) are rounded. Fractional steps are NOT snapped, because presets
 * legitimately use finer values than the Forge slider step (e.g. fog 0.0055 with step 0.001).
 * Numeric / boolean strings are accepted so URL params (`?street.seed=42`) work.
 * @param {ParamDef} def
 * @param {unknown} value
 * @returns {ValidationResult}
 */
export function validateParam(def, value) {
  switch (def.type) {
    case 'number': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        return { ok: false, error: `expected a finite number, got ${JSON.stringify(value)}` };
      }
      let v = clamp(n, def.min ?? -Infinity, def.max ?? Infinity);
      if (Number.isInteger(def.step) && def.step >= 1) v = Math.round(v);
      return { ok: true, value: v };
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 'true' || value === '1') return { ok: true, value: true };
      if (value === 'false' || value === '0') return { ok: true, value: false };
      return { ok: false, error: `expected a boolean, got ${JSON.stringify(value)}` };
    }
    case 'select': {
      if (def.options?.includes(/** @type {string} */ (value))) return { ok: true, value };
      return {
        ok: false,
        error: `expected one of [${def.options?.join(', ')}], got ${JSON.stringify(value)}`,
      };
    }
    case 'color': {
      const hex = normalizeHex(value);
      return hex
        ? { ok: true, value: hex }
        : { ok: false, error: `expected #rrggbb, got ${JSON.stringify(value)}` };
    }
    default:
      return { ok: false, error: `unsupported param type "${def.type}"` };
  }
}

/** @param {string} pattern 'a.b' | 'a.*' | '*' */
function compilePattern(pattern) {
  if (pattern === '*') return () => true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1); // keep the dot: 'water.'
    return (key) => key.startsWith(prefix);
  }
  return (key) => key === pattern;
}

export class Store {
  /** @type {Readonly<Record<string, ParamDef>>} */
  #defs;
  /** @type {Map<string, any>} */
  #values = new Map();
  /** @type {{ match: (key: string) => boolean, fn: StoreListener }[]} */
  #subs = [];
  #onError;

  #batchDepth = 0;
  /** @type {Set<string>} pending changed keys (insertion-ordered) */
  #pending = new Set();
  #pendingSource = 'api';
  /** true when the outermost batch() was given an explicit source */
  #sourceLocked = false;

  /**
   * @param {Readonly<Record<string, ParamDef>>} [defs=PARAM_DEFS]
   * @param {object} [options]
   * @param {(message: string) => void} [options.onError] receives validation errors
   */
  constructor(defs = PARAM_DEFS, { onError = (msg) => console.warn(`[Store] ${msg}`) } = {}) {
    this.#defs = defs;
    this.#onError = onError;
    for (const [key, def] of Object.entries(defs)) this.#values.set(key, def.default);
  }

  /** @param {string} key */
  has(key) {
    return this.#values.has(key);
  }

  /** @param {string} key */
  def(key) {
    return this.#defs[key];
  }

  /** All registered keys, in schema order. */
  keys() {
    return [...this.#values.keys()];
  }

  /**
   * @param {string} key
   * @returns {any} current value; undefined (and an error report) for unknown keys
   */
  get(key) {
    if (!this.#values.has(key)) {
      this.#onError(`unknown key "${key}"`);
      return undefined;
    }
    return this.#values.get(key);
  }

  /**
   * Validate without writing.
   * @param {string} key
   * @param {unknown} value
   * @returns {ValidationResult}
   */
  validate(key, value) {
    const def = this.#defs[key];
    if (!def) return { ok: false, error: `unknown key "${key}"` };
    return validateParam(def, value);
  }

  /**
   * Set one value. Invalid values are reported and ignored.
   * @param {string} key
   * @param {unknown} value
   * @param {string} [source='api']
   * @returns {boolean} true if the stored value actually changed
   */
  set(key, value, source = 'api') {
    const res = this.validate(key, value);
    if (!res.ok) {
      this.#onError(`${key}: ${res.error}`);
      return false;
    }
    if (Object.is(this.#values.get(key), res.value)) return false;
    this.#values.set(key, res.value);
    this.#markChanged(key, source);
    return true;
  }

  /**
   * Set several values with a single notification per subscriber.
   * @param {Record<string, unknown>} values
   * @param {string} [source='api']
   * @returns {string[]} keys that changed
   */
  setMany(values, source = 'api') {
    const changed = [];
    this.batch(() => {
      for (const [k, v] of Object.entries(values)) if (this.set(k, v, source)) changed.push(k);
    }, source);
    return changed;
  }

  /**
   * Group writes made inside `fn` into one notification round. Nested batches are merged.
   * @param {() => void} fn
   * @param {string} [source] overrides the source reported to listeners
   */
  batch(fn, source) {
    if (this.#batchDepth++ === 0) this.#sourceLocked = false;
    if (source !== undefined && !this.#sourceLocked) {
      this.#pendingSource = source;
      this.#sourceLocked = true;
    }
    try {
      fn();
    } finally {
      if (--this.#batchDepth === 0) this.#flush();
    }
  }

  /**
   * @param {string | string[]} pattern exact key, 'group.*' or '*'
   * @param {StoreListener} fn
   * @param {object} [options]
   * @param {boolean} [options.immediate=false] call `fn` right away with all matching keys
   * @returns {() => void} unsubscribe
   */
  subscribe(pattern, fn, { immediate = false } = {}) {
    const matchers = (Array.isArray(pattern) ? pattern : [pattern]).map(compilePattern);
    const sub = { match: (key) => matchers.some((m) => m(key)), fn };
    this.#subs = [...this.#subs, sub];
    if (immediate) {
      const keys = this.keys().filter(sub.match);
      if (keys.length) fn(keys, 'init');
    }
    return () => {
      this.#subs = this.#subs.filter((s) => s !== sub);
    };
  }

  /** Plain-object copy of all values (for presets, export, debug). */
  snapshot() {
    return Object.fromEntries(this.#values);
  }

  /**
   * Apply untrusted data (imported JSON, localStorage). Unknown keys and invalid values are
   * reported and skipped; valid ones are applied in one batch.
   * @param {unknown} data
   * @param {string} [source='import']
   * @returns {{ applied: string[], rejected: string[] }}
   */
  load(data, source = 'import') {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      this.#onError('load: expected a plain object');
      return { applied: [], rejected: [] };
    }
    const valid = {};
    const rejected = [];
    for (const [k, v] of Object.entries(data)) {
      const res = this.validate(k, v);
      if (res.ok) valid[k] = res.value;
      else {
        rejected.push(k);
        this.#onError(`load: ${k}: ${res.error}`);
      }
    }
    return { applied: this.setMany(valid, source), rejected };
  }

  /**
   * Restore defaults (all keys, or only those matching a pattern such as 'water.*').
   * @param {string} [pattern='*']
   * @param {string} [source='reset']
   */
  reset(pattern = '*', source = 'reset') {
    const match = compilePattern(pattern);
    const values = {};
    for (const [key, def] of Object.entries(this.#defs)) if (match(key)) values[key] = def.default;
    return this.setMany(values, source);
  }

  #markChanged(key, source) {
    if (!this.#sourceLocked) this.#pendingSource = source;
    this.#pending.add(key);
    if (this.#batchDepth === 0) this.#flush();
  }

  #flush() {
    this.#sourceLocked = false;
    if (this.#pending.size === 0) {
      this.#pendingSource = 'api';
      return;
    }
    const keys = [...this.#pending];
    const source = this.#pendingSource;
    this.#pending.clear();
    this.#pendingSource = 'api';
    // Snapshot the list: listeners may (un)subscribe or set other keys while we dispatch.
    const subs = this.#subs;
    for (const sub of subs) {
      if (subs !== this.#subs && !this.#subs.includes(sub)) continue; // unsubscribed mid-dispatch
      const matched = keys.filter(sub.match);
      if (matched.length === 0) continue;
      try {
        sub.fn(matched, source);
      } catch (err) {
        console.error('[Store] listener failed', err);
      }
    }
  }
}
