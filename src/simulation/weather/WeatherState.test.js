import { describe, it, expect } from 'vitest';
import { WeatherState } from './WeatherState.js';
import { Store } from '../../core/Store.js';
import { EventBus, Events } from '../../core/EventBus.js';
import { PARAM_DEFS } from '../../config/params.schema.js';
import { PRESET_NAMES, nextPresetName } from '../../config/weatherPresets.js';

describe('WeatherState', () => {
  const setup = () => {
    const store = new Store(PARAM_DEFS);
    const bus = new EventBus();
    const weather = new WeatherState(store, bus);
    return { store, bus, weather };
  };

  it('initializes with current store parameters', () => {
    const { weather } = setup();
    expect(weather.rain).toBe(0);
    expect(weather.fog).toBe(0.008);
    expect(weather.sunColor).toBe('#ffc07c');
  });

  it('smoothly interpolates towards store target values', () => {
    const { store, weather } = setup();
    store.set('weather.rain', 1.0);
    store.set('weather.transitionTime', 2.0);

    // Initial state
    expect(weather.rain).toBe(0);

    // Advance 1 second
    weather.update(1.0);
    expect(weather.rain).toBeGreaterThan(0.5);
    expect(weather.rain).toBeLessThan(1.0);

    // Advance enough time to converge
    for (let i = 0; i < 20; i++) {
      weather.update(0.5);
    }
    expect(weather.rain).toBeCloseTo(1.0, 2);
  });

  it('asymmetrically dries road wetness slower than wetting', () => {
    const { store, weather } = setup();
    store.set('weather.transitionTime', 2.0);
    store.set('weather.dryTime', 20.0);

    // 1. Wetting up from 0 to 1
    store.set('weather.wetness', 1.0);
    weather.update(1.0);
    const wetRise = weather.wetness;

    // Fast-forward to fully wet
    weather.wetness = 1.0;

    // 2. Drying down from 1 to 0
    store.set('weather.wetness', 0.0);
    weather.update(1.0);
    const wetDrop = 1.0 - weather.wetness;

    // Rate of wetting must be significantly faster than rate of drying
    expect(wetRise).toBeGreaterThan(wetDrop * 3);
  });

  it('triggers lightning events when lightning is enabled', () => {
    const { store, bus, weather } = setup();
    store.set('weather.lightning', true);

    const flashes = [];
    bus.on(Events.LIGHTNING, (e) => flashes.push(e));

    // Advance 25 seconds
    for (let t = 0; t < 25; t += 0.5) {
      weather.update(0.5);
    }

    expect(flashes.length).toBeGreaterThan(0);
  });

  it('cycles the presets when the auto cycle is on', () => {
    const { store, weather } = setup();
    store.set('weather.cycleInterval', 20);
    const step = (seconds) => {
      for (let t = 0; t < seconds - 1e-9; t += 0.5) weather.update(0.5);
    };

    step(30);
    expect(store.get('weather.preset')).toBe('Golden Hour'); // off by default

    store.set('weather.autoCycle', true);
    step(19.5);
    expect(store.get('weather.preset')).toBe('Golden Hour');
    step(0.5);
    expect(store.get('weather.preset')).toBe(nextPresetName('Golden Hour'));

    // A preset chosen by hand starts the interval again
    step(10);
    store.set('weather.preset', 'Downpour');
    step(19.5);
    expect(store.get('weather.preset')).toBe('Downpour');
    step(0.5);
    expect(store.get('weather.preset')).toBe('Sunset Evening');

    // The cycle wraps round, and stops when switched off
    step(20);
    expect(store.get('weather.preset')).toBe(PRESET_NAMES[0]);
    store.set('weather.autoCycle', false);
    step(60);
    expect(store.get('weather.preset')).toBe(PRESET_NAMES[0]);
  });
});
