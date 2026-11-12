/**
 * Procedural water ripples (TSL).
 *
 *  - `rainRippleLayer`: brightness of rain-drop rings on the wet asphalt (one ring per cell).
 *  - `rainRippleSlope`: surface slope of denser rain rings inside puddles (perturbs the normal,
 *    so the fake reflection trembles).
 *  - `eventRippleSlope`: expanding, decaying rings from a ring buffer of events
 *    `vec4(x, z, startTime, strength)` (wheels entering puddles, splashes).
 */
import {
  Fn,
  abs,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  pow,
  sin,
  smoothstep,
  step,
  vec2,
} from 'three/tsl';
import { hash21 } from './noise.js';

/** Rain rings on the asphalt: returns ring brightness in [0, 1]. */
export const rainRippleLayer = Fn(([worldXZ, timeSec, speed, decay, seedOffset]) => {
  const scaled = worldXZ.mul(1.35).add(seedOffset);
  const cell = floor(scaled);
  const local = fract(scaled).sub(0.5);

  const rnd = hash21(cell);
  const phase = fract(timeSec.mul(speed.mul(0.45)).add(rnd));
  const radius = phase.mul(0.46);
  const dist = length(local);

  const ring = float(1.0).sub(smoothstep(0.0, 0.055, abs(dist.sub(radius))));
  const fade = pow(float(1.0).sub(phase), decay);
  return ring.mul(fade);
});

/**
 * Rain rings inside puddles: returns the surface slope (vec2 along world X/Z).
 * `amount` (rain intensity, 0..1) is the share of cells that get a drop each cycle.
 */
export const rainRippleSlope = Fn(
  ([worldXZ, timeSec, speed, decay, amount, density, seedOffset]) => {
    const scaled = worldXZ.mul(density).add(seedOffset);
    const cell = floor(scaled);
    const local = fract(scaled).sub(0.5);

    const rnd = hash21(cell);
    const cycleTime = timeSec.mul(speed.mul(0.6)).add(rnd);
    const phase = fract(cycleTime);
    const drop = step(hash21(cell.add(floor(cycleTime).mul(0.618))), amount);

    const dist = length(local);
    const x = dist.sub(phase.mul(0.45));
    const band = float(1.0).sub(smoothstep(0.0, 0.07, abs(x)));
    const wave = sin(x.mul(70.0))
      .mul(band)
      .mul(pow(float(1.0).sub(phase), decay))
      .mul(drop);
    return local.div(max(dist, 0.001)).mul(wave);
  },
);

/**
 * Sum of event rings (unrolled over the ring buffer). Returns the surface slope.
 * @param {import('three/tsl').Node} worldXZ
 * @param {import('three/tsl').Node} events `uniformArray` of vec4(x, z, startTime, strength)
 * @param {number} count number of slots in `events`
 * @param {import('three/tsl').Node} timeSec
 * @param {import('three/tsl').Node} speed ring growth (m/s)
 * @param {import('three/tsl').Node} decay amplitude decay (1/s)
 */
export function eventRippleSlope(worldXZ, events, count, timeSec, speed, decay) {
  let slope = vec2(0.0, 0.0);
  for (let k = 0; k < count; k++) {
    const ev = events.element(k);
    const age = timeSec.sub(ev.z);
    const radius = age.mul(speed).add(0.04);
    const diff = worldXZ.sub(ev.xy);
    const dist = length(diff);
    const x = dist.sub(radius);
    const band = float(1.0).sub(smoothstep(0.0, 0.16, abs(x)));
    const life = exp(age.mul(decay).negate()).mul(step(0.0, age));
    const wave = sin(x.mul(26.0)).mul(band).mul(life).mul(ev.w);
    slope = slope.add(diff.div(max(dist, 0.001)).mul(wave));
  }
  return slope;
}
