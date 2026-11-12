import { describe, it, expect } from 'vitest';
import { mulberry32, hash, Rng } from './random.js';

describe('random', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('mulberry32 is roughly uniform', () => {
    const r = mulberry32(7);
    const bins = new Array(10).fill(0);
    const N = 50000;
    for (let i = 0; i < N; i++) bins[Math.floor(r() * 10)]++;
    for (const b of bins) expect(Math.abs(b - N / 10)).toBeLessThan(N * 0.01);
  });

  it('hash is a stable, order-sensitive uint32', () => {
    expect(hash(3, 1)).toBe(hash(3, 1));
    expect(hash(1, 2)).not.toBe(hash(2, 1));
    expect(hash(-5, 1)).not.toBe(hash(5, 1));
    const h = hash(123456, 99);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  it('hash has few collisions across neighbouring chunks', () => {
    const seen = new Set();
    for (let chunk = -500; chunk < 500; chunk++) seen.add(hash(chunk, 1));
    expect(seen.size).toBe(1000);
  });

  it('Rng helpers respect their ranges', () => {
    const r = new Rng(5);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(2, 4);
      expect([2, 3, 4]).toContain(n);
      const f = r.range(-1, 1);
      expect(f).toBeGreaterThanOrEqual(-1);
      expect(f).toBeLessThan(1);
      expect([-1, 1]).toContain(r.sign());
    }
    expect(['a', 'b']).toContain(r.pick(['a', 'b']));
  });

  it('weightedIndex follows weights and skips zeros', () => {
    const r = new Rng(11);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[r.weightedIndex([1, 0, 3])]++;
    expect(counts[1]).toBe(0);
    expect(counts[2] / counts[0]).toBeGreaterThan(2.7);
    expect(counts[2] / counts[0]).toBeLessThan(3.3);
    expect(r.weightedIndex([0, 0])).toBe(-1);
  });

  it('fork gives independent, reproducible streams', () => {
    const a = Rng.fork(1, 10).next();
    expect(Rng.fork(1, 10).next()).toBe(a);
    expect(Rng.fork(1, 11).next()).not.toBe(a);
  });

  it('shuffle keeps elements', () => {
    const arr = new Rng(3).shuffle([1, 2, 3, 4, 5]);
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
