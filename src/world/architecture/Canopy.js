/**
 * Entrance canopy of a hotel: the flat marquee that runs from the door out over the sidewalk to
 * the curb on two brass posts, tied back to the wall – the one thing that tells a hotel from a
 * house of flats at a glance.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { BRASS_TRIM, CHARCOAL_IRON, WHITE } from './palette.js';
import { tube } from './primitives.js';

/**
 * A boxed marquee: fascias on three sides (the hotel's name on the street end, `sign`, 6:1),
 * a cream soffit with a ring of bulbs that light at dusk, a thin roof slab, brass trim lines,
 * two posts at the curb end and two tie rods back to the facade; a pool of light on the walk.
 *
 * @param {object} o `{ x: wall face, z, y: underside, reach = 2.7 (out from the wall), w = 2.16,
 *   fascia = 0.36, sign: tile, color: enamel colour }`
 * @returns {[number, number]} Z span kept clear of street furniture
 */
export function buildEntranceCanopy(atlas, b, pools, o) {
  const T = atlas.tiles;
  const { x, z, y } = o;
  const reach = o.reach ?? 2.7;
  const w = o.w ?? 2.16;
  const fh = o.fascia ?? 0.36;
  const enamel = { tile: T.metal, color: o.color ?? [0.12, 0.23, 0.17] };
  const brass = { tile: T.metal, color: BRASS_TRIM };
  const x1 = x - reach;
  const cx = x - reach * 0.5;

  // Body: the fascias, the hotel's name on the street end, the soffit underneath
  b.box(cx, y, z, reach, fh, w, {
    ...enamel,
    faces: {
      nx: o.sign ? { tile: o.sign, color: WHITE, rep: [1, 1], data: [2.5, 0] } : undefined,
      ny: { tile: T.white, color: [0.86, 0.82, 0.72] },
      px: false,
    },
  });
  b.box(cx - 0.01, y + fh, z, reach + 0.02, 0.05, w + 0.06, enamel);
  // Brass rules along the top and bottom edges of the fascias
  for (const ry of [y - 0.005, y + fh - 0.03]) {
    b.box(x1 - 0.005, ry, z, 0.02, 0.035, w + 0.01, brass);
    for (const s of [-1, 1]) b.box(cx, ry, z + s * (w * 0.5 + 0.005), reach, 0.035, 0.012, brass);
  }

  // Bulbs round the soffit, a hand's width in from the fascias
  const bulb = { tile: T.bulb, color: WHITE, data: [0, 0] };
  const nx = Math.max(2, Math.round((reach - 0.4) / 0.3));
  for (let i = 0; i <= nx; i++) {
    const bx = x - 0.25 - ((reach - 0.5) * i) / nx;
    for (const s of [-1, 1]) b.box(bx, y - 0.05, z + s * (w * 0.5 - 0.14), 0.06, 0.05, 0.06, bulb);
  }
  const nz = Math.max(2, Math.round((w - 0.4) / 0.3));
  for (let i = 1; i < nz; i++) {
    const bz = z - w * 0.5 + 0.14 + ((w - 0.28) * i) / nz;
    b.box(x1 + 0.14, y - 0.05, bz, 0.06, 0.05, 0.06, bulb);
  }

  // Posts at the curb end on round bases, finials over the roof; tie rods back to the wall
  for (const s of [-1, 1]) {
    const pz = z + s * (w * 0.5 - 0.08);
    const px = x1 + 0.1;
    b.cylinderY(px, 0, pz, 0.08, 0.06, 0.12, 8, { tile: T.metal, color: CHARCOAL_IRON });
    b.cylinderY(px, 0.12, pz, 0.035, 0.035, y - 0.12, 8, brass, false);
    b.cylinderY(px, y + fh + 0.05, pz, 0.05, 0.02, 0.12, 6, brass);
    tube(b, x - 0.02, y + fh + 1.1, pz, x1 + 0.3, y + fh + 0.05, pz, 0.014, 0.014, 4, {
      tile: T.metal,
      color: CHARCOAL_IRON,
    });
    b.box(x - 0.015, y + fh + 1.02, pz, 0.03, 0.16, 0.1, { tile: T.metal, color: CHARCOAL_IRON });
  }

  return [z - w * 0.5 - 0.3, z + w * 0.5 + 0.3];
}
