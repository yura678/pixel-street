import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../../core/Store.js';
import { PARAM_DEFS, PARAM_FOLDERS } from '../../config/params.schema.js';
import { PRESET_NAMES } from '../../config/weatherPresets.js';
import {
  MAX_NAME_LENGTH,
  PRESET_FORMAT,
  PresetLibrary,
  applyPreset,
  cleanPresetName,
  parsePreset,
  stringifyPreset,
} from './presetStorage.js';
import { LEAF_PALETTES, controlOf, fileSlug, randomSeed, randomWorld } from './forgeModel.js';

/** A Map-backed stand-in for localStorage. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

/** Deterministic random numbers in [0, 1). */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quietStore = () => new Store(PARAM_DEFS, { onError: () => {} });

describe('preset file', () => {
  it('cleans names typed by a person', () => {
    expect(cleanPresetName('  Wet   night \n')).toBe('Wet night');
    expect(cleanPresetName('   ')).toBe('');
    expect(cleanPresetName(null)).toBe('');
    expect(cleanPresetName('x'.repeat(80))).toHaveLength(MAX_NAME_LENGTH);
  });

  it('round-trips a store snapshot through JSON', () => {
    const store = quietStore();
    store.set('taxi.cruiseSpeed', 13.5);
    store.set('leaves.colorA', '#123456');
    const text = stringifyPreset(' Fast  taxi ', store.snapshot());
    expect(JSON.parse(text).format).toBe(PRESET_FORMAT);
    const parsed = parsePreset(text);
    expect(parsed).toEqual({ ok: true, name: 'Fast taxi', params: store.snapshot() });
  });

  it('takes a bare object of parameters', () => {
    const parsed = parsePreset(
      JSON.stringify({ 'taxi.cruiseSpeed': 12, 'weather.preset': 'Rain' }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.params['taxi.cruiseSpeed']).toBe(12);
  });

  it('rejects what is not a preset', () => {
    for (const text of ['{oops', '[1,2]', '42', 'null', '{"hello":1}', '{}']) {
      expect(parsePreset(text).ok, text).toBe(false);
    }
    expect(parsePreset(JSON.stringify({ format: PRESET_FORMAT, params: [1] })).ok).toBe(false);
  });

  it('applies the weather preset first, so the preset’s own values win', () => {
    const store = quietStore();
    // Stand-in for the App's preset binding: choosing a preset writes its values
    store.subscribe('weather.preset', () => store.setMany({ 'weather.rain': 0.9 }, 'preset'));
    const { applied, rejected } = applyPreset(store, {
      'weather.preset': 'Downpour',
      'weather.rain': 0.3,
      'taxi.cruiseSpeed': 99, // clamped by the store
      'nope.key': 1,
    });
    expect(store.get('weather.preset')).toBe('Downpour');
    expect(store.get('weather.rain')).toBe(0.3);
    expect(store.get('taxi.cruiseSpeed')).toBe(PARAM_DEFS['taxi.cruiseSpeed'].max);
    expect(applied).toEqual(expect.arrayContaining(['weather.preset', 'weather.rain']));
    expect(rejected).toEqual(['nope.key']);
  });
});

describe('PresetLibrary', () => {
  it('saves, lists alphabetically, overwrites and removes', () => {
    const lib = new PresetLibrary(memoryStorage());
    expect(lib.available).toBe(true);
    expect(lib.names()).toEqual([]);
    expect(lib.save(' Rainy  ', { 'weather.rain': 1 })).toBe('Rainy');
    expect(lib.save('Calm', { 'weather.rain': 0 })).toBe('Calm');
    expect(lib.names()).toEqual(['Calm', 'Rainy']);
    lib.save('Rainy', { 'weather.rain': 0.5 });
    expect(lib.get('Rainy')).toEqual({ 'weather.rain': 0.5 });
    expect(lib.remove('Calm')).toBe(true);
    expect(lib.remove('Calm')).toBe(false);
    expect(lib.names()).toEqual(['Rainy']);
    expect(lib.get('toString')).toBe(null);
  });

  it('refuses empty names', () => {
    const lib = new PresetLibrary(memoryStorage());
    expect(lib.save('   ', {})).toBe(null);
    expect(lib.names()).toEqual([]);
  });

  it('survives a corrupt entry and replaces it on the next save', () => {
    const storage = memoryStorage({ 'pixel-street.presets.v1': '{not json' });
    const lib = new PresetLibrary(storage);
    expect(lib.names()).toEqual([]);
    expect(lib.save('A', { 'taxi.bounce': 1 })).toBe('A');
    expect(JSON.parse(storage.map.get('pixel-street.presets.v1'))).toEqual({
      A: { 'taxi.bounce': 1 },
    });
  });

  it('works without storage and when the storage throws', () => {
    const none = new PresetLibrary(null);
    expect(none.available).toBe(false);
    expect(none.names()).toEqual([]);
    expect(none.save('A', {})).toBe(null);
    const full = new PresetLibrary({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(full.save('A', {})).toBe(null);
  });
});

describe('Forge controls', () => {
  it('has a control for every parameter', () => {
    const kinds = { number: 'slider', boolean: 'checkbox', select: 'dropdown', color: 'color' };
    for (const def of Object.values(PARAM_DEFS)) {
      const spec = controlOf(def);
      expect(spec.kind, def.key).toBe(kinds[def.type]);
      expect(spec.label).toContain(def.label);
      expect(spec.title).toContain(def.key);
      if (def.type === 'number') {
        expect(Number.isFinite(def.min) && Number.isFinite(def.max) && def.step > 0, def.key).toBe(
          true,
        );
      }
    }
    expect(() => controlOf({ key: 'x', type: 'vector', label: 'X' })).toThrow(/vector/);
  });

  it('applies rebuilding parameters on release and disables pending ones', () => {
    for (const def of Object.values(PARAM_DEFS)) {
      const spec = controlOf(def);
      expect(spec.applyOn, def.key).toBe(def.rebuild ? 'release' : 'change');
      expect(spec.disabled, def.key).toBe(Boolean(def.pending));
    }
    expect(controlOf(PARAM_DEFS['street.seed']).applyOn).toBe('release');
    expect(controlOf(PARAM_DEFS['weather.rain']).applyOn).toBe('change');
    const pending = controlOf({ ...PARAM_DEFS['render.autoQuality'], pending: 'Stage 99' });
    expect(pending).toMatchObject({ disabled: true, label: 'Auto quality (Stage 99)' });
  });

  it('has a handler for every action button', () => {
    const forge = readFileSync(fileURLToPath(new URL('./Forge.js', import.meta.url)), 'utf8');
    const actions = PARAM_FOLDERS.flatMap((f) => f.items.filter((i) => i.type === 'action'));
    expect(actions.length).toBeGreaterThan(0);
    for (const { id } of actions) expect(forge, id).toContain(`case '${id}':`);
  });

  /**
   * Every slider must do something: each parameter is read outside the config (its key appears
   * as a string literal in the code), except those marked `pending` – and those must not be
   * read yet, so the mark is removed once they are wired up.
   */
  it('shows no dead controls', () => {
    const src = fileURLToPath(new URL('../..', import.meta.url));
    const code = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, e.name);
        const rel = relative(src, path).split(sep).join('/');
        if (e.isDirectory()) {
          if (rel !== 'config' && rel !== 'ui/forge') walk(path);
        } else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) {
          code.push(readFileSync(path, 'utf8'));
        }
      }
    };
    walk(src);
    const all = code.join('\n');
    for (const def of Object.values(PARAM_DEFS)) {
      const read = all.includes(`'${def.key}'`);
      expect(
        read,
        `${def.key}${def.pending ? ' is marked pending but read' : ' is never read'}`,
      ).toBe(!def.pending);
    }
  });
});

describe('Forge dice', () => {
  it('random seeds cover the schema range', () => {
    const { min, max } = PARAM_DEFS['street.seed'];
    expect(randomSeed(() => 0)).toBe(min);
    expect(randomSeed(() => 0.999999)).toBe(max);
  });

  it('randomizes the world with values the store accepts', () => {
    const random = seeded(7);
    const presets = new Set();
    for (let i = 0; i < 40; i++) {
      const world = randomWorld(random);
      const store = new Store(PARAM_DEFS, {
        onError: (msg) => {
          throw new Error(msg);
        },
      });
      const { rejected } = applyPreset(store, world);
      expect(rejected).toEqual([]);
      for (const [k, v] of Object.entries(world)) expect(store.get(k), k).toBe(v);
      expect(LEAF_PALETTES.map((p) => p[0])).toContain(world['leaves.colorA']);
      presets.add(world['weather.preset']);
    }
    expect([...presets].sort()).toEqual([...PRESET_NAMES].sort());
    expect(randomWorld(seeded(3))).toEqual(randomWorld(seeded(3)));
  });

  it('makes file-name-safe slugs', () => {
    expect(fileSlug('Sunset Evening')).toBe('sunset-evening');
    expect(fileSlug('  «Мокра» ніч №2 ')).toBe('мокра-ніч-2');
    expect(fileSlug('***')).toBe('preset');
    expect(fileSlug('', 'x')).toBe('x');
  });
});
