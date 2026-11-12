import { describe, it, expect } from 'vitest';
import {
  clamp,
  lerp,
  inverseLerp,
  smoothstep,
  fract,
  wrap,
  damp,
  deltaAngle,
  dampAngle,
  approach,
  snap,
} from './math.js';
import { normalizeHex, hexToRgb, rgbToHex, lerpHex } from './color.js';

describe('math', () => {
  it('basic helpers', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(inverseLerp(2, 4, 3)).toBe(0.5);
    expect(inverseLerp(1, 1, 3)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(fract(-0.25)).toBe(0.75);
    expect(wrap(370, 0, 360)).toBe(10);
    expect(wrap(-10, 0, 360)).toBe(350);
    expect(snap(0.37, 0.25)).toBe(0.25);
  });

  it('damp is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 10, 3, 1 / 60);
    let b = 0;
    for (let i = 0; i < 10; i++) b = damp(b, 10, 3, 1 / 10);
    expect(a).toBeCloseTo(b, 10);
    expect(a).toBeCloseTo(10 * (1 - Math.exp(-3)), 10);
  });

  it('angles take the shortest arc', () => {
    const d = (deg) => (deg * Math.PI) / 180;
    expect(deltaAngle(d(350), d(10))).toBeCloseTo(d(20));
    expect(deltaAngle(d(10), d(350))).toBeCloseTo(d(-20));
    expect(deltaAngle(0, Math.PI)).toBeCloseTo(Math.PI);
    expect(dampAngle(d(350), d(10), 1000, 1)).toBeCloseTo(d(370));
  });

  it('approach never overshoots', () => {
    expect(approach(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(approach(0.9, 1, 0.3)).toBe(1);
    expect(approach(1, -1, 0.5)).toBe(0.5);
  });
});

describe('color', () => {
  it('normalises and converts', () => {
    expect(normalizeHex('#FFF')).toBe('#ffffff');
    expect(normalizeHex(' ff8a3d ')).toBe('#ff8a3d');
    expect(normalizeHex('#ggg')).toBeNull();
    expect(hexToRgb('#ff0080')).toEqual({ r: 1, g: 0, b: 128 / 255 });
    expect(rgbToHex(1, 0, 128 / 255)).toBe('#ff0080');
    expect(rgbToHex(2, -1, 0)).toBe('#ff0000');
  });

  it('lerpHex blends endpoints exactly', () => {
    expect(lerpHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(lerpHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
