/**
 * Carriage-house parts (№ 158, a potter's studio in an old carriage house): the wide segmental
 * arch with its pair of boarded gates – one left ajar on the warmly lit workshop – and the
 * glazed fanlight over them, the hayloft door upstairs with its hoist beam and pulley, and the
 * potter's shelf of wares standing on the sidewalk.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import * as THREE from 'three/webgpu';
import { CHARCOAL_IRON, FABRICS, STONE_CORNICE, STONE_STEP, WHITE } from './palette.js';
import { archRing, arcZY, orientedQuad, orientedTri, tube, withFrame } from './primitives.js';
import { windowSeed } from './Windows.js';

const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();

/** Dark green of the gates and the hayloft door. */
const GATE_GREEN = Object.freeze([0.1, 0.22, 0.15]);
/** The warm light of the workshop inside. */
const KILN_WARM = Object.freeze([0.62, 0.42, 0.22]);

/**
 * One gate leaf in its own frame: hinged at `hingeZ` on the plane `x`, the free edge `len` away
 * towards `dir` (±1 along Z), swung `angle` radians inward (0 = shut). Boarded panels – the
 * diagonal boards mirrored on the two leaves, so they meet in a chevron – in a frame of stiles
 * and rails, three black strap hinges and a ring handle on the meeting stile.
 */
function buildGateLeaf(atlas, b, o) {
  const T = atlas.tiles;
  const { x, hingeZ, dir, len, h } = o;
  const paint = { tile: T.wood_paint, color: o.color, texScale: 0.5 };
  const boards = { tile: T.boards_diagonal, color: o.color };
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  _m.makeTranslation(x, 0, hingeZ).multiply(_r.makeRotationY(dir * (o.angle ?? 0)));
  withFrame(b, _m.clone(), () => {
    const zc = (dir * len) / 2;
    // The leaf itself, then the boards on its face
    b.box(0.035, 0.04, zc, 0.07, h, len - 0.02, paint);
    const st = 0.12;
    const z0 = dir * st;
    const z1 = dir * (len - st);
    const mid = 0.04 + h * 0.52;
    for (const [y0, y1] of [
      [0.04 + st, mid - 0.05],
      [mid + 0.05, 0.04 + h - st],
    ]) {
      orientedQuad(
        b,
        [-0.002, y0, z0],
        [-0.002, y0, z1],
        [-0.002, y1, z1],
        [-0.002, y1, z0],
        [-1, 0, 0],
        { ...boards, rep: [Math.abs(z1 - z0) / 0.6, (y1 - y0) / 0.6] },
      );
    }
    // Frame: stiles, the bottom, middle and top rails, standing proud of the boards
    for (const sz of [dir * st * 0.5, dir * (len - st * 0.5)]) {
      b.box(-0.02, 0.04, sz, 0.04, h, st, paint);
    }
    for (const [ry, rh] of [
      [0.04, st],
      [mid - 0.05, 0.1],
      [0.04 + h - st, st],
    ]) {
      // A hair prouder than the stiles they cross, front and back
      b.box(-0.0205, ry, zc, 0.043, rh, len - 0.02, paint);
    }
    // Strap hinges from the hinge side, the ring handle by the meeting edge
    for (const hy of [0.4, mid, h - 0.3]) {
      b.box(-0.045, hy, dir * 0.35, 0.01, 0.06, 0.62, iron);
    }
    b.cylinderX(-0.05, mid - 0.25, dir * (len - 0.22), 0.06, 0.012, 8, iron);
  });
}

/**
 * Carriage arch: a segmental brick arch `span` wide springing at `spring`, `rise` high, in a
 * ring of voussoirs with a keystone and impost blocks; under it a pair of boarded gates – the
 * left one swung half open on the lit workshop (its light on the floor and on the back wall,
 * spilling out onto the sidewalk) – and over them the glazed fanlight with radiating bars, lit
 * from inside. Guard stones protect the jambs, a granite sill runs across the opening; the house
 * number hangs on the shut leaf.
 *
 * The opening is cut into the ground storey (`recess` from `SpecPlanner`) so the open leaf has
 * room to swing.
 *
 * @param {object} o `{ x, cz, span, spring, rise, recess: { depth }, color, trim, number, open:
 *   radians the left leaf is swung in }`
 * @returns {[number, number]} lot-local Z span of the gateway (keep clear on the sidewalk)
 */
export function buildCarriageArch(atlas, b, pools, rng, o) {
  const T = atlas.tiles;
  const { x, cz, spring, rise } = o;
  const half = o.span * 0.5;
  const depth = o.recess.depth;
  const trim = { tile: T.wall_stone, color: o.trim ?? STONE_CORNICE, texScale: 0.6 };
  const color = o.color ?? GATE_GREEN;
  const frame = { tile: T.wood_paint, color: color.map((c) => c * 0.85), texScale: 0.5 };

  // Segmental head: the voussoirs on the face, impost blocks at the springing
  const rr = (half * half + rise * rise) / (2 * rise);
  const th = Math.asin(Math.min(1, half / rr));
  const yc = spring + rise - rr;
  const a0 = Math.PI * 0.5 - th;
  const a1 = Math.PI * 0.5 + th;
  archRing(b, x - 0.09, x + 0.02, cz, yc, rr + 0.02, rr + 0.34, a0, a1, 13, trim, true);
  for (const s of [-1, 1]) {
    b.box(x - 0.05, spring - 0.18, cz + s * (half + 0.16), 0.12, 0.18, 0.36, trim);
  }

  // Fanlight between the springing and the arch: glass on the face (lit from the workshop), a
  // transom bar along the springing, radiating bars and the frame round the curve
  const n = 12;
  const arc = arcZY(cz, yc, rr, a0, a1, n);
  const reveal = arcZY(cz, yc, rr + 0.03, a0, a1, n);
  const dark = { tile: T.white, color: [0.085, 0.09, 0.095] };
  const glass = { tile: T.glass_panel, color: WHITE, data: [1.8, 0] };
  for (let i = 0; i < n; i++) {
    orientedTri(
      b,
      [x - 0.012, spring, cz],
      [x - 0.012, reveal[i][1], reveal[i][0]],
      [x - 0.012, reveal[i + 1][1], reveal[i + 1][0]],
      [0, 0],
      [1, 0],
      [1, 1],
      [-1, 0, 0],
      dark,
    );
    orientedTri(
      b,
      [x - 0.025, spring, cz],
      [x - 0.025, arc[i][1], arc[i][0]],
      [x - 0.025, arc[i + 1][1], arc[i + 1][0]],
      [(cz - (cz - half)) / 0.6, 0],
      [(arc[i][0] - (cz - half)) / 0.6, (arc[i][1] - spring) / 0.6],
      [(arc[i + 1][0] - (cz - half)) / 0.6, (arc[i + 1][1] - spring) / 0.6],
      [-1, 0, 0],
      glass,
    );
  }
  b.box(x - 0.05, spring - 0.04, cz, 0.1, 0.08, half * 2, frame);
  archRing(b, x - 0.06, x - 0.01, cz, yc, rr - 0.05, rr, a0, a1, n, frame);
  for (let i = 1; i < 6; i++) {
    const a = a0 + ((a1 - a0) * i) / 6;
    tube(
      b,
      x - 0.04,
      spring + 0.03,
      cz,
      x - 0.04,
      yc + Math.sin(a) * (rr - 0.04),
      cz + Math.cos(a) * (rr - 0.04),
      0.014,
      0.014,
      4,
      frame,
    );
  }

  // The workshop behind: a concrete floor and its warm light – brightest low on the back wall
  const back = x + depth;
  b.box(x + depth * 0.5, 0, cz, depth, 0.03, half * 2 - 0.01, {
    tile: T.wall_stone,
    color: [0.42, 0.38, 0.34],
    texScale: 0.8,
  });
  for (const [y0, y1, col, glow] of [
    [0.03, 1.1, KILN_WARM, 2.6],
    [1.1, spring - 0.6, KILN_WARM.map((c) => c * 0.6), 2.6],
    [spring - 0.6, spring, [0.1, 0.07, 0.05], 0],
  ]) {
    b.quad([back - 0.004, y0, cz - half], [0, 0, half * 2], [0, y1 - y0, 0], {
      tile: T.white,
      color: col,
      data: [glow, 0],
    });
  }
  for (const s of [-1, 1]) {
    // The side walls of the opening, in shadow
    orientedQuad(
      b,
      [x, 0.03, cz + s * (half - 0.003)],
      [back, 0.03, cz + s * (half - 0.003)],
      [back, spring, cz + s * (half - 0.003)],
      [x, spring, cz + s * (half - 0.003)],
      [0, 0, -s],
      { tile: T.white, color: [0.2, 0.15, 0.11], data: [s < 0 ? 2.6 : 0, 0] },
    );
  }

  // The gates: the right leaf shut, the left one swung in
  const leafH = spring - 0.1;
  buildGateLeaf(atlas, b, { x: x + 0.12, hingeZ: cz + half, dir: -1, len: half, h: leafH, color });
  buildGateLeaf(atlas, b, {
    x: x + 0.12,
    hingeZ: cz - half,
    dir: 1,
    len: half,
    h: leafH,
    color,
    angle: o.open ?? 0.95,
  });
  // The number on the shut leaf
  const plaque = o.number && T[`plaque_${o.number}`];
  if (plaque) {
    b.box(x + 0.105, 1.62, cz + 0.42, 0.02, 0.26, 0.26, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: { nx: { tile: plaque, color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  }

  // Granite sill across the opening, guard stones at the foot of the jambs
  const granite = { tile: T.wall_stone, color: STONE_STEP, texScale: 0.8 };
  b.box(x - 0.1, 0, cz, 0.3, 0.05, half * 2 + 0.2, granite);
  for (const s of [-1, 1]) {
    b.cylinderY(x - 0.12, 0, cz + s * (half + 0.12), 0.15, 0.08, 0.55, 8, granite);
  }

  pools.quad([x + 0.1, 0.035, cz - half + 0.05], [depth - 0.2, 0, 0], [0, 0, half * 2 - 0.1], {
    color: [0.7, 0.46, 0.24],
    data: [-1.0, 0],
  });
  return [cz - half - 0.3, cz + half + 0.3];
}

/**
 * Hayloft door of a carriage house, now a door-window of the flat upstairs: a pair of leaves
 * with diagonal boards below and glazing above (dressed and lit like the flat's windows), a
 * plain stone lintel and sill, an iron bar across it, and over it the timber hoist beam with an
 * iron pulley block and its rope – one end hanging with its hook, the other tied off on a cleat
 * beside the door.
 *
 * @param {object} o `{ x, z, y, w, h, color, trim, glazing, fabric: tint, lit }`
 */
export function buildHayloftDoor(atlas, b, rng, o) {
  const T = atlas.tiles;
  const { x, z, y, w, h } = o;
  const color = o.color ?? GATE_GREEN;
  const paint = { tile: T.wood_paint, color, texScale: 0.5 };
  const trim = { tile: T.wall_stone, color: o.trim ?? STONE_CORNICE, texScale: 0.9 };
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  b.quad([x - 0.012, y - 0.04, z - w * 0.5 - 0.05], [0, 0, w + 0.1], [0, h + 0.08, 0], {
    tile: T.white,
    color: [0.08, 0.075, 0.07],
  });
  const glazing = o.glazing ?? 'plain';
  const tile = glazing === 'plain' ? T.win_plain_cream : T[`win_${glazing}_cream`];
  const tint = glazing === 'plain' ? WHITE : (o.fabric ?? FABRICS.linen);
  const seed = windowSeed(rng, o.lit);
  const lw = w * 0.5;
  // The glass above the middle rail keeps the 2:3 of the sash tile
  const mid = y + h - 0.16 - (lw - 0.16) * 1.5;
  for (const s of [-1, 1]) {
    const lz = z + s * lw * 0.5;
    b.box(x - 0.03, y, lz, 0.06, h, lw - 0.01, paint);
    // Boards below (mirrored into a chevron), glass above
    const z0 = lz - s * (lw * 0.5 - 0.08);
    const z1 = lz + s * (lw * 0.5 - 0.08);
    orientedQuad(
      b,
      [x - 0.062, y + 0.1, z0],
      [x - 0.062, y + 0.1, z1],
      [x - 0.062, mid - 0.04, z1],
      [x - 0.062, mid - 0.04, z0],
      [-1, 0, 0],
      {
        tile: T.boards_diagonal,
        color,
        rep: [Math.abs(z1 - z0) / 0.6, (mid - 0.04 - y - 0.1) / 0.6],
      },
    );
    b.quad(
      [x - 0.062, mid + 0.06, Math.min(z0, z1)],
      [0, 0, Math.abs(z1 - z0)],
      [0, y + h - 0.1 - mid - 0.06, 0],
      { tile, color: tint, data: [seed, 0] },
    );
    for (const sz of [lz - lw * 0.5 + 0.05, lz + lw * 0.5 - 0.05]) {
      b.box(x - 0.07, y, sz, 0.03, h, 0.08, paint);
    }
    for (const [ry, rh] of [
      [y, 0.1],
      [mid - 0.04, 0.1],
      [y + h - 0.1, 0.1],
    ]) {
      b.box(x - 0.0705, ry, lz, 0.033, rh, lw - 0.02, paint);
    }
  }
  // Lintel and sill; the iron bar across at hand height on two eyes in the jambs
  b.box(x - 0.05, y + h + 0.03, z, 0.1, 0.18, w + 0.24, trim);
  b.box(x - 0.08, y - 0.12, z, 0.16, 0.1, w + 0.2, trim);
  b.box(x - 0.16, y + 0.95, z, 0.03, 0.04, w + 0.12, iron);
  for (const s of [-1, 1])
    b.box(x - 0.09, y + 0.94, z + s * (w * 0.5 + 0.05), 0.14, 0.06, 0.03, iron);

  // Hoist beam over the door, the pulley block at its end and the rope
  const by = y + h + 0.32;
  const reach = 0.95;
  b.box(x - reach * 0.5 + 0.05, by, z, reach + 0.1, 0.18, 0.18, {
    tile: T.wood,
    color: [0.36, 0.26, 0.18],
    texScale: 0.5,
  });
  b.box(x - reach * 0.5, by + 0.18, z, reach - 0.1, 0.012, 0.06, iron);
  const px = x - reach + 0.12;
  tube(b, px, by, z, px, by - 0.12, z, 0.012, 0.012, 4, iron);
  b.box(px, by - 0.38, z, 0.1, 0.26, 0.06, { tile: T.wood, color: [0.3, 0.2, 0.13] });
  b.cylinderX(px, by - 0.25, z, 0.085, 0.07, 10, iron);
  const rope = { tile: T.white, color: [0.62, 0.52, 0.36] };
  const hookY = y + h * 0.35;
  tube(b, px - 0.08, by - 0.25, z, px - 0.08, hookY, z, 0.012, 0.012, 4, rope);
  tube(b, px - 0.08, hookY, z, px - 0.06, hookY - 0.12, z, 0.016, 0.016, 4, iron);
  const cleatZ = z + w * 0.5 + 0.28;
  const cleatY = y + 0.25;
  tube(b, px + 0.08, by - 0.25, z, x - 0.05, cleatY, cleatZ, 0.012, 0.012, 4, rope);
  b.box(x - 0.03, cleatY - 0.05, cleatZ, 0.06, 0.1, 0.18, iron);
}

/**
 * The potter's shelf on the sidewalk: two trestles and two boards against the wall, a tall
 * cobalt vase, a celadon jug with its handle and a rust-glazed pot on top, two small cups and a
 * bowl below – few-sided cylinders, glazed in colours of their own.
 *
 * @param {object} o `{ x: wall face, z, len = 1.3 }`
 */
export function buildPotteryShelf(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z } = o;
  const len = o.len ?? 1.3;
  const d = 0.34;
  const sx = x - d * 0.5 - 0.03;
  const wood = { tile: T.wood, color: [0.48, 0.36, 0.25], texScale: 0.5 };
  for (const s of [-1, 1]) {
    b.box(sx, 0, z + s * (len * 0.5 - 0.06), d, 0.895, 0.05, wood);
  }
  for (const by of [0.32, 0.86]) b.box(sx, by, z, d + 0.04, 0.04, len, wood);
  const glaze = (c) => ({ tile: T.white, color: c });
  const top = 0.9;
  const lower = 0.36;
  // Tall cobalt vase: foot, swelling body, narrow neck and a flared lip
  const vz = z - len * 0.3;
  const cobalt = glaze([0.14, 0.24, 0.58]);
  b.cylinderY(sx, top, vz, 0.06, 0.11, 0.16, 8, cobalt);
  b.cylinderY(sx, top + 0.16, vz, 0.11, 0.05, 0.16, 8, cobalt);
  b.cylinderY(sx, top + 0.32, vz, 0.045, 0.045, 0.1, 8, cobalt);
  b.cylinderY(sx, top + 0.42, vz, 0.045, 0.07, 0.04, 8, cobalt);
  // Celadon jug with a handle
  const jz = z + 0.02;
  const celadon = glaze([0.55, 0.7, 0.58]);
  b.cylinderY(sx, top, jz, 0.08, 0.1, 0.12, 8, celadon);
  b.cylinderY(sx, top + 0.12, jz, 0.1, 0.06, 0.1, 8, celadon);
  b.cylinderY(sx, top + 0.22, jz, 0.06, 0.07, 0.04, 8, celadon);
  tube(b, sx, top + 0.22, jz + 0.07, sx, top + 0.24, jz + 0.15, 0.015, 0.015, 4, celadon);
  tube(b, sx, top + 0.24, jz + 0.15, sx, top + 0.08, jz + 0.1, 0.015, 0.015, 4, celadon);
  // Squat rust-glazed pot
  const rust = glaze([0.62, 0.3, 0.16]);
  b.cylinderY(sx, top, z + len * 0.32, 0.1, 0.14, 0.12, 8, rust);
  b.cylinderY(sx, top + 0.12, z + len * 0.32, 0.14, 0.1, 0.06, 8, rust);
  // Below: two cups and a shallow bowl
  const cream = glaze([0.88, 0.84, 0.74]);
  b.cylinderY(sx, lower, z - 0.38, 0.045, 0.05, 0.09, 8, cream);
  b.cylinderY(sx, lower, z - 0.22, 0.045, 0.05, 0.09, 8, glaze([0.3, 0.42, 0.5]));
  b.cylinderY(sx, lower, z + 0.25, 0.08, 0.15, 0.07, 8, glaze([0.72, 0.62, 0.42]));
}
