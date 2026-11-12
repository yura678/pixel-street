/**
 * Ordered 4x4 Bayer matrix dithering in TSL.
 * Calculated purely via ALU arithmetic (no texture reads, zero bandwidth overhead).
 */
import { Fn, floor, mod, screenCoordinate } from 'three/tsl';

/**
 * Procedural 4x4 Bayer matrix lookup returning values in [0, 15/16].
 * Matrix:
 *  0/16   8/16   2/16  10/16
 * 12/16   4/16  14/16   6/16
 *  3/16  11/16   1/16   9/16
 * 15/16   7/16  13/16   5/16
 */
export const bayer4x4 = Fn(([coord = screenCoordinate]) => {
  const p = floor(coord.xy);
  const x0 = mod(p.x, 2.0);
  const y0 = mod(p.y, 2.0);
  const x1 = mod(floor(p.x.mul(0.5)), 2.0);
  const y1 = mod(floor(p.y.mul(0.5)), 2.0);

  const m0 = x0.mul(2.0).add(y0.mul(3.0)).sub(x0.mul(y0).mul(4.0));
  const m1 = x1.mul(2.0).add(y1.mul(3.0)).sub(x1.mul(y1).mul(4.0));

  return m0.mul(4.0).add(m1).div(16.0);
});

/**
 * Centered dithering offset node for quantized color channels:
 * offset = (bayer - 0.5) / paletteLevels * strength
 */
export const ditherOffset = Fn(([levels, strength, coord = screenCoordinate]) => {
  const b = bayer4x4(coord);
  return b.sub(0.5).div(levels).mul(strength);
});
