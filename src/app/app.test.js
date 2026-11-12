import { describe, it, expect, vi } from 'vitest';
import { GameLoop } from './GameLoop.js';
import { System } from '../core/System.js';
import { Store } from '../core/Store.js';
import { EventBus, Events } from '../core/EventBus.js';
import { PARAM_DEFS } from '../config/params.schema.js';
import { PRESETS } from '../config/weatherPresets.js';
import { parseUrlParams, applyUrlParams } from './urlParams.js';
import { bindWeatherPresets } from './presetBinding.js';
import {
  PresetLibrary,
  applyPreset,
  parsePreset,
  stringifyPreset,
} from '../ui/forge/presetStorage.js';

class Probe extends System {
  calls = [];
  update(dt, frame) {
    this.calls.push([dt, frame.time]);
  }
}

describe('GameLoop', () => {
  it('first tick has dt=0, then clamps large deltas', () => {
    const render = vi.fn();
    const loop = new GameLoop({ render, maxDt: 0.05 });
    const p = loop.add(new Probe('p'));
    loop.tick(1000);
    loop.tick(1016);
    loop.tick(3016); // 2 s hitch
    expect(p.calls[0][0]).toBe(0);
    expect(p.calls[1][0]).toBeCloseTo(0.016);
    expect(p.calls[2][0]).toBe(0.05);
    expect(loop.frame.time).toBeCloseTo(0.066);
    expect(loop.frame.rawDt).toBeCloseTo(2);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('resetClock avoids a jump after a pause', () => {
    const loop = new GameLoop({ render: () => {} });
    const p = loop.add(new Probe('p'));
    loop.tick(0);
    loop.resetClock();
    loop.tick(60000);
    expect(p.calls[1][0]).toBe(0);
  });

  it('runs systems in order, skips disabled, disables throwing ones', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const order = [];
    const loop = new GameLoop({ render: () => order.push('render') });
    const a = loop.add(new System('a'));
    a.update = () => order.push('a');
    const bad = loop.add(new System('bad'));
    bad.update = () => {
      throw new Error('boom');
    };
    const off = loop.add(new System('off'));
    off.enabled = false;
    off.update = () => order.push('off');
    loop.tick(0);
    loop.tick(16);
    expect(order).toEqual(['a', 'render', 'a', 'render']);
    expect(bad.enabled).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('add is idempotent, remove works', () => {
    const loop = new GameLoop({ render: () => {} });
    const s = new System('s');
    loop.add(s);
    loop.add(s);
    expect(loop.systems).toHaveLength(1);
    loop.remove(s);
    expect(loop.systems).toHaveLength(0);
  });
});

describe('urlParams', () => {
  const known = (k) => k in PARAM_DEFS;

  it('parses shortcuts, flags and schema keys', () => {
    const cfg = parseUrlParams(
      '?preset=sun&seed=42&forge=0&debug&taxi.cruiseSpeed=12&x.y=1',
      known,
    );
    expect(cfg.preset).toBe('Sunny'); // 'sun' → first match
    expect(parseUrlParams('?preset=sunset', known).preset).toBe('Sunset Evening');
    expect(parseUrlParams('?preset=tornado', known).preset).toBeNull();
    expect(cfg.values).toEqual({ 'street.seed': '42', 'taxi.cruiseSpeed': '12' });
    expect(cfg.forge).toBe(false);
    expect(cfg.debug).toBe(true);
    expect(cfg.parts).toBe(false);
    expect(cfg.quality).toBe(null);
  });

  it('takes a quality tier override', () => {
    expect(parseUrlParams('?quality=low', known).quality).toBe('low');
    expect(parseUrlParams('?quality=ultra', known).quality).toBe(null);
  });

  it('takes the known bench flags and skips the rest', () => {
    const { bench } = parseUrlParams('?bench=nobloom,msaa0,turbo', known);
    expect([...bench].sort()).toEqual(['msaa0', 'nobloom']);
    expect(parseUrlParams('', known).bench.size).toBe(0);
  });

  it('opens the parts showcase with ?debug=parts', () => {
    const cfg = parseUrlParams('?debug=parts', known);
    expect(cfg.parts).toBe(true);
    expect(cfg.debug).toBe(true);
    expect(parseUrlParams('?debug=0', known)).toMatchObject({ debug: false, parts: false });
  });

  it('applies the preset first, explicit keys override it', () => {
    const store = new Store(PARAM_DEFS, { onError: () => {} });
    bindWeatherPresets(store, new EventBus());
    applyUrlParams(store, '?preset=rain&weather.rain=0.2&seed=7');
    expect(store.get('weather.preset')).toBe('Rain');
    expect(store.get('weather.wetness')).toBe(PRESETS.Rain['weather.wetness']);
    expect(store.get('weather.rain')).toBe(0.2);
    expect(store.get('street.seed')).toBe(7);
  });
});

describe('bindWeatherPresets', () => {
  it('writes preset targets and emits WEATHER_PRESET', () => {
    const store = new Store(PARAM_DEFS, { onError: () => {} });
    const bus = new EventBus();
    const ev = vi.fn();
    bus.on(Events.WEATHER_PRESET, ev);
    const off = bindWeatherPresets(store, bus);
    store.set('weather.preset', 'Downpour', 'forge');
    expect(store.get('weather.lightning')).toBe(true);
    expect(ev).toHaveBeenCalledWith({ from: 'Golden Hour', to: 'Downpour' });
    off();
    store.set('weather.preset', 'Sunny');
    expect(store.get('weather.lightning')).toBe(true);
  });
});

describe('Forge presets with the weather binding', () => {
  it('export → import gives back the same store, tweaked weather included', () => {
    const a = new Store(PARAM_DEFS, { onError: () => {} });
    bindWeatherPresets(a, new EventBus());
    a.set('weather.preset', 'Downpour');
    a.set('weather.rain', 0.35); // lighter than the preset
    a.set('lighting.horizon', '#334455');
    a.set('street.seed', 4242);
    a.set('taxi.color', '#ff00aa');

    const parsed = parsePreset(stringifyPreset('Light downpour', a.snapshot()));
    expect(parsed.ok).toBe(true);

    const b = new Store(PARAM_DEFS, { onError: () => {} });
    bindWeatherPresets(b, new EventBus());
    b.set('weather.preset', 'Sunny');
    const { rejected } = applyPreset(b, parsed.ok ? parsed.params : {});
    expect(rejected).toEqual([]);
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it('a library preset survives a reload', () => {
    const storage = new Map();
    const fake = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
    const store = new Store(PARAM_DEFS, { onError: () => {} });
    bindWeatherPresets(store, new EventBus());
    store.set('weather.preset', 'Rain');
    store.set('camera.distance', 30);
    new PresetLibrary(fake).save('Mine', store.snapshot());
    store.reset();
    expect(store.get('weather.preset')).toBe('Golden Hour');

    applyPreset(store, new PresetLibrary(fake).get('Mine'));
    expect(store.get('weather.preset')).toBe('Rain');
    expect(store.get('weather.wetness')).toBe(PRESETS.Rain['weather.wetness']);
    expect(store.get('camera.distance')).toBe(30);
  });
});
