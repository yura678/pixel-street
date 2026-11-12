/**
 * Scalar math helpers. Pure functions, no allocations, no three.js.
 * Units: metres, seconds, radians.
 */

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;

/**
 * @param {number} v
 * @param {number} min
 * @param {number} max
 */
export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

/** @param {number} v */
export const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Inverse of {@link lerp}: where `v` sits between `a` and `b` (unclamped).
 * Returns 0 when `a === b` instead of NaN.
 */
export const inverseLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));

/** Hermite smoothstep, identical to GLSL/TSL `smoothstep(edge0, edge1, x)`. */
export function smoothstep(edge0, edge1, x) {
  const t = saturate(inverseLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

/** Fractional part, always in [0, 1) (GLSL `fract`, also for negatives). */
export const fract = (x) => x - Math.floor(x);

/** Wrap `v` into [min, max). */
export function wrap(v, min, max) {
  const range = max - min;
  return range === 0 ? min : min + ((((v - min) % range) + range) % range);
}

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is the decay rate (1/s): after `1/lambda` seconds ~63% of the gap is closed,
 * regardless of how `dt` is split across frames.
 * @param {number} current
 * @param {number} target
 * @param {number} lambda
 * @param {number} dt
 */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Shortest signed angular difference `b - a`, in (-π, π]. */
export function deltaAngle(a, b) {
  const d = wrap(b - a, -Math.PI, Math.PI);
  return d === -Math.PI ? Math.PI : d;
}

/** {@link damp} for angles – always rotates along the shortest arc. */
export const dampAngle = (current, target, lambda, dt) =>
  current + deltaAngle(current, target) * (1 - Math.exp(-lambda * dt));

/** Move `current` towards `target` by at most `maxDelta` (never overshoots). */
export function approach(current, target, maxDelta) {
  const d = target - current;
  return Math.abs(d) <= maxDelta ? target : current + Math.sign(d) * maxDelta;
}

/** Snap `v` to the nearest multiple of `step` (step <= 0 → unchanged). */
export const snap = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

export const degToRad = (deg) => deg * DEG2RAD;
