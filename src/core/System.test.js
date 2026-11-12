import { describe, it, expect, vi } from 'vitest';
import { System } from './System.js';

describe('System', () => {
  it('requires a name and defaults to enabled', () => {
    expect(() => new System('')).toThrow();
    const s = new System('taxi');
    expect(s.name).toBe('taxi');
    expect(s.enabled).toBe(true);
  });

  it('disposes tracked resources in reverse order, once', () => {
    const s = new System('x');
    const order = [];
    s.track(() => order.push('fn'));
    const geo = s.track({ dispose: () => order.push('geo') });
    expect(geo).toHaveProperty('dispose');
    s.dispose();
    s.dispose();
    expect(order).toEqual(['geo', 'fn']);
    expect(s.disposed).toBe(true);
    expect(() => s.track(() => {})).toThrow(/disposed/);
  });

  it('keeps disposing after a failing cleanup', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = new System('x');
    const ok = vi.fn();
    s.track(ok);
    s.track(() => {
      throw new Error('boom');
    });
    s.dispose();
    expect(ok).toHaveBeenCalled();
    err.mockRestore();
  });
});
