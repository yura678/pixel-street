import { describe, it, expect, vi } from 'vitest';
import { Store, validateParam } from './Store.js';
import { PARAM_DEFS, createDefaults } from '../config/params.schema.js';
import { PRESETS } from '../config/weatherPresets.js';

const quiet = () => new Store(PARAM_DEFS, { onError: vi.fn() });

describe('validateParam', () => {
  const num = { key: 'n', type: 'number', default: 1, min: 0, max: 10, step: 0.5 };
  const int = { key: 'i', type: 'number', default: 1, min: 1, max: 6, step: 1 };

  it('clamps numbers, rounds only integer steps', () => {
    expect(validateParam(num, 42)).toEqual({ ok: true, value: 10 });
    expect(validateParam(num, 0.3)).toEqual({ ok: true, value: 0.3 });
    expect(validateParam(int, 2.6)).toEqual({ ok: true, value: 3 });
  });

  it('accepts numeric and boolean strings (URL params)', () => {
    expect(validateParam(num, '4')).toEqual({ ok: true, value: 4 });
    expect(validateParam({ type: 'boolean' }, 'false')).toEqual({ ok: true, value: false });
  });

  it('rejects garbage', () => {
    expect(validateParam(num, NaN).ok).toBe(false);
    expect(validateParam(num, '').ok).toBe(false);
    expect(validateParam(num, null).ok).toBe(false);
    expect(validateParam({ type: 'boolean' }, 'yes').ok).toBe(false);
    expect(validateParam({ type: 'select', options: ['a'] }, 'b').ok).toBe(false);
    expect(validateParam({ type: 'color' }, 'red').ok).toBe(false);
  });

  it('normalises colours', () => {
    expect(validateParam({ type: 'color' }, '#ABC')).toEqual({ ok: true, value: '#aabbcc' });
  });
});

describe('Store', () => {
  it('starts with schema defaults', () => {
    const s = quiet();
    expect(s.snapshot()).toEqual(createDefaults());
    expect(s.get('taxi.cruiseSpeed')).toBe(8);
  });

  it('every weather preset value is valid against the schema', () => {
    const s = quiet();
    for (const [name, preset] of Object.entries(PRESETS)) {
      for (const [k, v] of Object.entries(preset)) {
        const res = s.validate(k, v);
        expect(res, `${name} → ${k}`).toEqual({ ok: true, value: v });
      }
    }
  });

  it('ignores invalid values and reports them', () => {
    const onError = vi.fn();
    const s = new Store(PARAM_DEFS, { onError });
    expect(s.set('weather.preset', 'Tornado')).toBe(false);
    expect(s.get('weather.preset')).toBe('Golden Hour');
    expect(s.set('nope.key', 1)).toBe(false);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('notifies matching subscribers with source', () => {
    const s = quiet();
    const water = vi.fn();
    const exact = vi.fn();
    const all = vi.fn();
    s.subscribe('water.*', water);
    s.subscribe('taxi.cruiseSpeed', exact);
    s.subscribe('*', all);

    s.set('water.puddleCount', 4, 'forge');
    expect(water).toHaveBeenCalledWith(['water.puddleCount'], 'forge');
    expect(exact).not.toHaveBeenCalled();
    expect(all).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the value is unchanged', () => {
    const s = quiet();
    const fn = vi.fn();
    s.subscribe('*', fn);
    expect(s.set('taxi.cruiseSpeed', 8)).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('"water.*" does not match "waterfall.x"', () => {
    const s = new Store(
      {
        'water.a': { key: 'water.a', type: 'number', default: 0 },
        'waterfall.b': { key: 'waterfall.b', type: 'number', default: 0 },
      },
      { onError: vi.fn() },
    );
    const fn = vi.fn();
    s.subscribe('water.*', fn);
    s.set('waterfall.b', 1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('setMany / batch produce a single notification', () => {
    const s = quiet();
    const fn = vi.fn();
    s.subscribe('*', fn);
    const changed = s.setMany(PRESETS.Downpour, 'preset');
    expect(changed.length).toBeGreaterThan(5);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toEqual(changed);
    expect(fn.mock.calls[0][1]).toBe('preset');
  });

  it('un-sourced batch takes the source of the writes inside it', () => {
    const s = quiet();
    const fn = vi.fn();
    s.subscribe('*', fn);
    s.batch(() => s.set('taxi.cruiseSpeed', 10, 'forge'));
    expect(fn).toHaveBeenCalledWith(['taxi.cruiseSpeed'], 'forge');
  });

  it('listeners may write other keys (cascading notifications)', () => {
    const s = quiet();
    s.subscribe('weather.preset', () => s.setMany(PRESETS.Rain, 'preset'));
    const rain = vi.fn();
    s.subscribe('weather.rain', rain);
    s.set('weather.preset', 'Rain', 'forge');
    expect(s.get('weather.rain')).toBe(0.5);
    expect(rain).toHaveBeenCalledWith(['weather.rain'], 'preset');
  });

  it('unsubscribe stops notifications, also mid-dispatch', () => {
    const s = quiet();
    const second = vi.fn();
    let offSecond;
    s.subscribe('*', () => offSecond());
    offSecond = s.subscribe('*', second);
    s.set('taxi.cruiseSpeed', 12);
    expect(second).not.toHaveBeenCalled();
  });

  it('immediate subscription fires with all matching keys', () => {
    const s = quiet();
    const fn = vi.fn();
    s.subscribe('curve.*', fn, { immediate: true });
    expect(fn).toHaveBeenCalledWith(
      ['curve.down', 'curve.bend', 'curve.freq', 'curve.speed'],
      'init',
    );
  });

  it('load() applies valid keys and reports rejected ones', () => {
    const s = quiet();
    // note: 'bad' would be a valid 3-digit hex (#bbaadd), so use a non-hex string
    const res = s.load({ 'taxi.cruiseSpeed': 12, 'taxi.color': 'yellow', 'old.key': 1 });
    expect(res.applied).toEqual(['taxi.cruiseSpeed']);
    expect(res.rejected).toEqual(['taxi.color', 'old.key']);
    expect(s.load('nope')).toEqual({ applied: [], rejected: [] });
  });

  it('reset() restores defaults, optionally by group', () => {
    const s = quiet();
    s.set('water.puddleCount', 5);
    s.set('taxi.cruiseSpeed', 3);
    s.reset('water.*');
    expect(s.get('water.puddleCount')).toBe(PARAM_DEFS['water.puddleCount'].default);
    expect(s.get('taxi.cruiseSpeed')).toBe(3);
    s.reset();
    expect(s.snapshot()).toEqual(createDefaults());
  });

  it('a throwing listener does not break others', () => {
    const s = quiet();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = vi.fn();
    s.subscribe('*', () => {
      throw new Error('boom');
    });
    s.subscribe('*', ok);
    s.set('taxi.cruiseSpeed', 9);
    expect(ok).toHaveBeenCalled();
    err.mockRestore();
  });
});
