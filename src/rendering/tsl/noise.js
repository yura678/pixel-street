/**
 * Cheap deterministic ALU noise shared by the road, puddles and particles.
 */
import { Fn, dot, float, floor, fract, mix, sin, vec2 } from 'three/tsl';

/** Hash of a vec2 → float in [0, 1). */
export const hash21 = Fn(([p]) => {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
});

/** Smooth value noise in [0, 1]. */
export const valueNoise2D = Fn(([p]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));

  const a = hash21(i);
  const b = hash21(i.add(vec2(1.0, 0.0)));
  const c = hash21(i.add(vec2(0.0, 1.0)));
  const d = hash21(i.add(vec2(1.0, 1.0)));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/** Two octaves of value noise in [0, 1]. */
export const fbm2D = Fn(([p]) => {
  const n1 = valueNoise2D(p);
  const n2 = valueNoise2D(p.mul(2.13).add(vec2(17.3, 9.2)));
  return n1.mul(0.65).add(n2.mul(0.35));
});
