import { describe, it, expect, vi } from 'vitest';
import { EventBus, Events } from './EventBus.js';

describe('EventBus', () => {
  it('delivers payloads and unsubscribes', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on(Events.TAXI_STATE, fn);
    bus.emit(Events.TAXI_STATE, { from: 'cruise', to: 'braking' });
    off();
    bus.emit(Events.TAXI_STATE, {});
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ from: 'cruise', to: 'braking' });
    expect(bus.listenerCount(Events.TAXI_STATE)).toBe(0);
  });

  it('once() fires a single time', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.once(Events.LIGHTNING, fn);
    bus.emit(Events.LIGHTNING, { intensity: 1 });
    bus.emit(Events.LIGHTNING, { intensity: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('strict mode rejects unknown event names', () => {
    const bus = new EventBus();
    expect(() => bus.on('taxi:stat', () => {})).toThrow(/unknown event/);
    expect(() => bus.emit('taxi:stat')).toThrow(/unknown event/);
    expect(() => new EventBus({ strict: false }).emit('custom')).not.toThrow();
  });

  it('is safe to (un)subscribe during emit', () => {
    const bus = new EventBus();
    const late = vi.fn();
    const second = vi.fn();
    let offSecond;
    bus.on(Events.FORGE_ACTION, () => {
      offSecond();
      bus.on(Events.FORGE_ACTION, late);
    });
    offSecond = bus.on(Events.FORGE_ACTION, second);
    bus.emit(Events.FORGE_ACTION, { id: 'x' });
    // Dispatch uses the list as it was when emit started.
    expect(second).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
    bus.emit(Events.FORGE_ACTION, { id: 'x' });
    expect(second).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('isolates throwing listeners', () => {
    const onError = vi.fn();
    const bus = new EventBus({ onError });
    const ok = vi.fn();
    bus.on(Events.QUALITY_CHANGED, () => {
      throw new Error('boom');
    });
    bus.on(Events.QUALITY_CHANGED, ok);
    bus.emit(Events.QUALITY_CHANGED, { tier: 'low' });
    expect(ok).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), Events.QUALITY_CHANGED);
  });
});
