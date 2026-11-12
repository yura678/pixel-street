/**
 * What the Forge panel shows for each schema entry, and the "dice" actions – the parts of Forge
 * that need no DOM, so the tests can check them.
 */
import { PARAM_DEFS } from '../../config/params.schema.js';
import { PRESET_NAMES } from '../../config/weatherPresets.js';

/**
 * @typedef {object} ControlSpec
 * @property {'slider' | 'checkbox' | 'dropdown' | 'color'} kind
 * @property {string} label
 * @property {'change' | 'release'} applyOn  'release' – written to the store when the drag ends
 * @property {boolean} disabled
 * @property {string} title  tooltip
 */

const KINDS = { number: 'slider', boolean: 'checkbox', select: 'dropdown', color: 'color' };

/**
 * @param {import('../../core/Store.js').ParamDef & { label: string, rebuild?: boolean, pending?: string }} def
 * @returns {ControlSpec}
 */
export function controlOf(def) {
  const kind = KINDS[def.type];
  if (!kind) throw new Error(`Forge: no control for "${def.key}" of type "${def.type}"`);
  const notes = [];
  if (def.rebuild) notes.push('applied when released');
  if (def.pending) notes.push(`not wired up yet – ${def.pending}`);
  return {
    kind,
    label: def.pending ? `${def.label} (${def.pending})` : def.label,
    applyOn: def.rebuild ? 'release' : 'change',
    disabled: Boolean(def.pending),
    title: notes.length ? `${def.key} – ${notes.join('; ')}` : def.key,
  };
}

/** Leaf colour pairs for "Randomize world": autumn, late summer, rusty, golden. */
export const LEAF_PALETTES = Object.freeze([
  ['#d9822b', '#b8c23a'],
  ['#c4532a', '#e0a63a'],
  ['#9c6b30', '#d6b04a'],
  ['#e3b23c', '#8fa83a'],
]);

/**
 * A random street seed within the schema's range.
 * @param {() => number} [random=Math.random]
 */
export function randomSeed(random = Math.random) {
  const { min, max } = PARAM_DEFS['street.seed'];
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * "Randomize world": another street, weather, wind, trees and leaves. The taxi, the camera and
 * the render settings stay as they are.
 * @param {() => number} [random=Math.random]
 * @returns {Record<string, unknown>} parameters for `applyPreset`
 */
export function randomWorld(random = Math.random) {
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const [colorA, colorB] = pick(LEAF_PALETTES);
  return {
    'weather.preset': pick(PRESET_NAMES),
    'street.seed': randomSeed(random),
    'street.treeDensity': Math.round((0.3 + random() * 0.55) * 100) / 100,
    'weather.windDir': Math.round(random() * 360),
    'leaves.colorA': colorA,
    'leaves.colorB': colorB,
  };
}

/**
 * A file-name-safe slug, letters of any script kept: 'Sunset Evening' → 'sunset-evening'.
 * @param {string} text
 * @param {string} [fallback='preset']
 */
export function fileSlug(text, fallback = 'preset') {
  const slug = String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}
