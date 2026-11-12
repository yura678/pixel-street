/**
 * Projecting bays: a box bay, a canted (three-sided) bay and a round bay (five facets), full
 * height from the ground or an oriel on a corbel. Every facet is a wall panel with its own
 * sash windows, built in the facet's frame so the windows sit square in it.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import * as THREE from 'three/webgpu';
import { STONE_CORNICE } from './palette.js';
import { extrudeXZ, tube, withFrame } from './primitives.js';
import { buildSashWindow } from './Windows.js';

const _basis = new THREE.Matrix4();
const _xl = new THREE.Vector3();
const _yl = new THREE.Vector3(0, 1, 0);
const _zl = new THREE.Vector3();

/** Plan outline of a bay as `[x, z]` points from the wall at `zA` round to the wall at `zB`. */
export function bayPlan(shape, x, z, w, depth) {
  const zA = z - w * 0.5;
  const zB = z + w * 0.5;
  if (shape === 'box') {
    return [
      [x, zA],
      [x - depth, zA],
      [x - depth, zB],
      [x, zB],
    ];
  }
  if (shape === 'canted') {
    return [
      [x, zA],
      [x - depth, zA + depth],
      [x - depth, zB - depth],
      [x, zB],
    ];
  }
  if (shape === 'round') {
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const t = (Math.PI * i) / 5;
      pts.push([x - Math.sin(t) * depth, z - Math.cos(t) * w * 0.5]);
    }
    return pts;
  }
  throw new Error(`Unknown bay shape "${shape}"`);
}

/**
 * @param {object} o `{ x, z, w, depth, y0, y1, shape: 'box'|'canted'|'round', wall: MeshBuilder
 *   options, trim, rows: [{ y, h, win }], win: buildSashWindow options + { w }, balcony: { color }
 *   }` – a row's own `win` dresses its windows (the room on that floor); `balcony` turns the
 *   cap into a balcony with turned balusters and a handrail round its edge.
 *   `y0 > 0` makes an oriel carried on a stepped corbel.
 */
export function buildBay(atlas, b, rng, o) {
  const { x, z, w, depth, y0, y1 } = o;
  const plan = bayPlan(o.shape, x, z, w, depth);
  const trim = { tile: atlas.tiles.wall_stone, color: o.trim ?? STONE_CORNICE, texScale: 0.9 };

  for (let i = 0; i < plan.length - 1; i++) {
    const [ax, az] = plan[i];
    const [bx, bz] = plan[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    // Facet frame: local −X = outward normal, local +Z along the facet
    _xl.set(dz, 0, -dx);
    _zl.set(dx, 0, dz);
    _basis.makeBasis(_xl, _yl, _zl).setPosition((ax + bx) * 0.5, 0, (az + bz) * 0.5);
    withFrame(b, _basis, () => {
      b.box(0.07, y0, 0, 0.14, y1 - y0, len, { ...o.wall, faces: { px: false } });
      const ww = Math.min(o.win.w ?? 1.0, len - 0.36);
      if (ww < 0.45) return;
      for (const row of o.rows) {
        buildSashWindow(
          atlas,
          b,
          0,
          0,
          row.y,
          ww,
          row.h,
          rng,
          row.win ? { ...o.win, ...row.win } : o.win,
        );
      }
    });
    // Corner post hiding the joint between two facets
    // (its ends 3 mm inside the facets' bottoms and tops)
    if (i > 0) b.box(ax, y0 + 0.003, az, 0.16, y1 - y0 - 0.006, 0.16, trim);
  }

  // Cap: a moulded slab following the plan; the oriel's corbel steps in underneath
  const grow = (pts, d) => pts.map(([px, pz]) => [px - (px < x - 1e-6 ? d : 0), pz]);
  extrudeXZ(b, y1, y1 + 0.12, grow(plan, 0.08), trim);
  extrudeXZ(b, y1 + 0.12, y1 + 0.2, grow(plan, 0.16), trim);
  if (o.balcony) buildBayBalcony(b, grow(plan, 0.1), y1 + 0.2, x, o.balcony, atlas);
  if (y0 > 0.01) {
    extrudeXZ(b, y0 - 0.12, y0, grow(plan, 0.06), trim);
    const shrink = (f) => plan.map(([px, pz]) => [x - (x - px) * f, z + (pz - z) * f]);
    extrudeXZ(b, y0 - 0.36, y0 - 0.12, shrink(0.7), trim);
    extrudeXZ(b, y0 - 0.6, y0 - 0.36, shrink(0.4), trim);
  } else {
    // A little under 0.4 m: a basement sill often sits at that height on it
    extrudeXZ(b, 0, 0.395, grow(plan, 0.04), trim);
  }
}

/**
 * Balcony round the cap of a bay (Queen Anne): turned wooden balusters along the plan's edge
 * (`pts` from wall to wall, a little inside the cap's edge), square newels at its corners and
 * at its ends, a bottom rail and a handrail on top, all in painted wood. The ends stop `back`
 * short of the wall (in front of a gable projecting over it). `iron` makes it a wrought-iron
 * railing instead: slim square pickets, a flat handrail and little corner posts with knobs.
 */
function buildBayBalcony(b, pts, y, xWall, o, atlas) {
  const paint = o.iron
    ? { tile: atlas.tiles.metal, color: o.color ?? [0.12, 0.13, 0.14] }
    : { tile: atlas.tiles.wood_paint, color: o.color ?? [0.9, 0.88, 0.8], texScale: 0.4 };
  const railH = o.h ?? 0.82;
  // Cut the end facets where they cross the plane `back` in front of the wall
  const xb = xWall - (o.back ?? 0.08);
  const clip = (a, c) => {
    if (a[0] <= xb) return a;
    const t = (a[0] - xb) / (a[0] - c[0]);
    return [xb, a[1] + (c[1] - a[1]) * t];
  };
  const last = pts.length - 1;
  const inset = [clip(pts[0], pts[1]), ...pts.slice(1, -1), clip(pts[last], pts[last - 1])];
  for (let i = 0; i < inset.length; i++) {
    const [px, pz] = inset[i];
    if (o.iron) {
      b.box(px, y, pz, 0.04, railH, 0.04, paint);
      b.cylinderY(px, y + railH, pz, 0.035, 0.02, 0.06, 6, paint);
    } else b.box(px, y, pz, 0.09, railH + 0.06, 0.09, paint);
    if (i + 1 >= inset.length) break;
    const [qx, qz] = inset[i + 1];
    const len = Math.hypot(qx - px, qz - pz);
    if (o.iron) {
      const n = Math.max(1, Math.round(len / 0.11));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        b.box(px + (qx - px) * t, y + 0.04, pz + (qz - pz) * t, 0.018, railH - 0.08, 0.018, paint);
      }
      tube(b, px, y + 0.06, pz, qx, y + 0.06, qz, 0.014, 0.014, 4, paint);
      tube(b, px, y + railH - 0.03, pz, qx, y + railH - 0.03, qz, 0.024, 0.024, 4, paint);
      continue;
    }
    const n = Math.max(1, Math.round(len / 0.15));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      b.cylinderY(
        px + (qx - px) * t,
        y + 0.06,
        pz + (qz - pz) * t,
        0.026,
        0.02,
        railH - 0.12,
        6,
        paint,
      );
    }
    tube(b, px, y + 0.04, pz, qx, y + 0.04, qz, 0.035, 0.035, 4, paint);
    tube(b, px, y + railH - 0.03, pz, qx, y + railH - 0.03, qz, 0.045, 0.045, 4, paint);
  }
}
