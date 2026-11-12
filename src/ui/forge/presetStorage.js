/**
 * Forge presets: named snapshots of the parameter store kept in this browser (`localStorage`),
 * and the JSON file they are exported to and imported from.
 *
 *   { "format": "pixel-street/preset", "version": 1, "name": "Wet night", "params": { … } }
 *
 * An import also takes a bare `{ "taxi.cruiseSpeed": 12, … }` object (e.g. a `store.snapshot()`
 * pasted from the console). Whatever comes in is untrusted: the Store validates every value and
 * skips unknown keys, so a file from a newer version still loads what this version knows.
 *
 * No DOM here – the storage is injected – so all of it runs in the tests.
 */

export const PRESET_FORMAT = 'pixel-street/preset';
export const PRESET_VERSION = 1;
export const STORAGE_KEY = 'pixel-street.presets.v1';
export const MAX_NAME_LENGTH = 40;

/**
 * @typedef {Pick<Storage, 'getItem' | 'setItem'>} PresetStorage
 * @typedef {Record<string, unknown>} PresetParams
 * @typedef {{ ok: true, name: string, params: PresetParams } | { ok: false, error: string }} ParsedPreset
 */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * A preset name as typed by a person: trimmed, inner whitespace collapsed, at most
 * {@link MAX_NAME_LENGTH} characters; '' when nothing is left.
 * @param {unknown} text
 */
export function cleanPresetName(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

/**
 * The preset file's JSON text.
 * @param {string} name
 * @param {PresetParams} params
 */
export function stringifyPreset(name, params) {
  return JSON.stringify(
    { format: PRESET_FORMAT, version: PRESET_VERSION, name: cleanPresetName(name), params },
    null,
    2,
  );
}

/**
 * Read a preset file (or a bare object of parameters). Does not validate the values – that is
 * the Store's job when the preset is applied.
 * @param {string} text
 * @returns {ParsedPreset}
 */
export function parsePreset(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not a JSON file' };
  }
  if (!isPlainObject(data)) return { ok: false, error: 'not a Pixel Street preset' };
  if (data.format === PRESET_FORMAT) {
    if (!isPlainObject(data.params)) return { ok: false, error: 'the preset has no parameters' };
    return { ok: true, name: cleanPresetName(data.name), params: data.params };
  }
  // A bare object of parameters: every key is a dotted parameter path
  const keys = Object.keys(data);
  if (keys.length && keys.every((k) => /^[a-z]+\.[A-Za-z]+$/.test(k))) {
    return { ok: true, name: '', params: data };
  }
  return { ok: false, error: 'not a Pixel Street preset' };
}

/**
 * Apply a preset to the store. The weather preset goes first, on its own: choosing it writes
 * that preset's weather values, which the preset's own values then override (the same order as
 * URL parameters). Invalid values and unknown keys are reported by the store and skipped.
 * @param {import('../../core/Store.js').Store} store
 * @param {PresetParams} params
 * @param {string} [source='import']
 * @returns {{ applied: string[], rejected: string[] }}
 */
export function applyPreset(store, params, source = 'import') {
  const { 'weather.preset': weather, ...rest } = params;
  const applied = [];
  const rejected = [];
  if (weather !== undefined) {
    const r = store.load({ 'weather.preset': weather }, source);
    applied.push(...r.applied);
    rejected.push(...r.rejected);
  }
  const r = store.load(rest, source);
  applied.push(...r.applied);
  rejected.push(...r.rejected);
  return { applied, rejected };
}

/**
 * The browser's `localStorage`, or null where it is missing or blocked (some private modes
 * throw on access).
 * @returns {PresetStorage | null}
 */
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Presets saved in this browser, by name. */
export class PresetLibrary {
  /** @type {PresetStorage | null} */
  #storage;
  #key;

  /**
   * @param {PresetStorage | null} storage
   * @param {string} [key=STORAGE_KEY]
   */
  constructor(storage, key = STORAGE_KEY) {
    this.#storage = storage;
    this.#key = key;
  }

  /** False when presets cannot be kept (no storage). */
  get available() {
    return this.#storage !== null;
  }

  /** Saved names, alphabetically. */
  names() {
    return Object.keys(this.#read()).sort((a, b) => a.localeCompare(b));
  }

  /**
   * @param {string} name
   * @returns {PresetParams | null}
   */
  get(name) {
    const all = this.#read();
    return Object.hasOwn(all, name) ? all[name] : null;
  }

  /**
   * Save (or overwrite) a preset.
   * @param {string} name
   * @param {PresetParams} params
   * @returns {string | null} the cleaned name it was saved under, null if it could not be saved
   */
  save(name, params) {
    const clean = cleanPresetName(name);
    if (!clean) return null;
    const all = this.#read();
    all[clean] = { ...params };
    return this.#write(all) ? clean : null;
  }

  /**
   * @param {string} name
   * @returns {boolean} true if it was there and is gone
   */
  remove(name) {
    const all = this.#read();
    if (!Object.hasOwn(all, name)) return false;
    delete all[name];
    return this.#write(all);
  }

  /** @returns {Record<string, PresetParams>} */
  #read() {
    let data = null;
    try {
      data = JSON.parse(this.#storage?.getItem(this.#key) ?? 'null');
    } catch {
      // A corrupt entry counts as no presets; the next save replaces it
    }
    if (!isPlainObject(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, v]) => isPlainObject(v)));
  }

  /** @param {Record<string, PresetParams>} all */
  #write(all) {
    if (!this.#storage) return false;
    try {
      this.#storage.setItem(this.#key, JSON.stringify(all));
      return true;
    } catch {
      return false; // quota exceeded or storage blocked
    }
  }
}
