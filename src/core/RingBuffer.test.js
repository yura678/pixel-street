import { describe, it, expect } from 'vitest';
import { RingBuffer, RollingAverage } from './RingBuffer.js';

describe('RingBuffer', () => {
  it('overwrites the oldest and returns the evicted item', () => {
    const rb = new RingBuffer(3);
    expect(rb.push('a')).toBeUndefined();
    rb.push('b');
    rb.push('c');
    expect(rb.isFull).toBe(true);
    expect(rb.push('d')).toBe('a');
    expect(rb.toArray()).toEqual(['b', 'c', 'd']);
    expect(rb.oldest()).toBe('b');
    expect(rb.newest()).toBe('d');
    expect(rb.at(-2)).toBe('c');
    expect(rb.at(5)).toBeUndefined();
  });

  it('shift and clear', () => {
    const rb = new RingBuffer(2);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(rb.shift()).toBe(2);
    expect(rb.length).toBe(1);
    rb.clear();
    expect(rb.length).toBe(0);
    expect(rb.shift()).toBeUndefined();
  });

  it('rejects bad capacity', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
  });
});

describe('RollingAverage', () => {
  it('tracks the mean of the last N samples', () => {
    const ra = new RollingAverage(4);
    expect(ra.mean).toBe(0);
    [1, 2, 3, 4].forEach((v) => ra.push(v));
    expect(ra.mean).toBe(2.5);
    ra.push(10); // window: 2,3,4,10
    expect(ra.mean).toBe(4.75);
  });

  it('stays accurate over many pushes', () => {
    const ra = new RollingAverage(30);
    for (let i = 0; i < 100000; i++) ra.push(16.6 + (i % 7) * 0.1);
    let expected = 0;
    for (let i = 100000 - 30; i < 100000; i++) expected += 16.6 + (i % 7) * 0.1;
    expect(ra.mean).toBeCloseTo(expected / 30, 9);
  });
});
