/**
 * Balconies: the French cast-iron balcony of a Second Empire front – a stone slab across several
 * windows resting on short consoles on the belt course, its railing of slim bars between a
 * handrail and a shoe rail, a band of cast rosettes under the handrail.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { CHARCOAL_IRON, STONE_CORNICE } from './palette.js';

/**
 * @param {object} o `{ x: wall face, z0, z1, y: top of the slab, depth = 0.5, h = 0.92 (railing),
 *   consoles: [z…], stone: colour, iron: colour }`
 */
export function buildIronBalcony(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z0, z1, y } = o;
  const d = o.depth ?? 0.5;
  const railH = o.h ?? 0.92;
  const w = z1 - z0;
  const cz = (z0 + z1) * 0.5;
  const stone = { tile: T.wall_stone, color: o.stone ?? STONE_CORNICE, texScale: 0.9 };
  const iron = { tile: T.metal, color: o.iron ?? CHARCOAL_IRON };

  // Slab with a moulded edge, the consoles under it stepped out from the wall
  b.box(x - d * 0.5, y - 0.12, cz, d, 0.12, w, stone);
  b.box(x - (d - 0.08) * 0.5, y - 0.18, cz, d - 0.08, 0.06, w - 0.08, stone);
  for (const z of o.consoles ?? [z0 + 0.25, z1 - 0.25]) {
    b.box(x - 0.17, y - 0.3, z, 0.34, 0.12, 0.14, stone);
    b.box(x - 0.1, y - 0.36, z, 0.2, 0.06, 0.12, stone);
  }

  // Railing: the front run and the two returns back to the wall
  const xr = x - d + 0.05;
  const runs = [
    [xr, z0 + 0.05, xr, z1 - 0.05],
    [xr, z0 + 0.05, x - 0.02, z0 + 0.05],
    [xr, z1 - 0.05, x - 0.02, z1 - 0.05],
  ];
  for (const [xa, za, xb, zb] of runs) {
    const alongZ = Math.abs(zb - za) > Math.abs(xb - xa);
    const len = Math.hypot(xb - xa, zb - za);
    const mx = (xa + xb) * 0.5;
    const mz = (za + zb) * 0.5;
    const rail = (ry, t, hh) =>
      b.box(mx, ry, mz, alongZ ? t : len + t, hh, alongZ ? len + t : t, iron);
    rail(y + railH - 0.04, 0.06, 0.04);
    rail(y + 0.04, 0.035, 0.03);
    rail(y + railH - 0.24, 0.025, 0.025);
    const n = Math.max(2, Math.round(len / 0.1));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      b.box(xa + (xb - xa) * t, y + 0.07, za + (zb - za) * t, 0.018, railH - 0.11, 0.018, iron);
    }
    if (!alongZ) continue;
    // Cast rosettes in the band under the handrail, between every other pair of bars
    const m = Math.max(1, Math.round(len / 0.2));
    for (let i = 0; i < m; i++) {
      const rz = za + ((i + 0.5) * len) / m;
      b.cylinderX(xa, y + railH - 0.13, rz, 0.05, 0.016, 6, iron);
    }
  }
  // Corner posts with knobs
  for (const z of [z0 + 0.05, z1 - 0.05]) {
    b.box(xr, y, z, 0.05, railH + 0.02, 0.05, iron);
    b.cylinderY(xr, y + railH + 0.02, z, 0.035, 0.02, 0.06, 6, iron);
  }
}
