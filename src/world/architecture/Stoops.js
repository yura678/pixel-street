/**
 * Stoops and areaways: the stairs from the sidewalk up to a raised front door, their cast-iron
 * railings or solid stone cheek walls, and the railing round the sunken areaway in front of a
 * basement.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { buildPanelledDoor } from './Doors.js';
import { buildBoxHedge } from './Greenery.js';
import { CHARCOAL_IRON, STONE_CORNICE, STONE_STEP } from './palette.js';
import { orientedQuad, tube } from './primitives.js';
import { buildTrashCan } from './Services.js';

/**
 * Straight stoop, perpendicular to the facade: `steps` risers climb from the sidewalk to a
 * landing at `toY` in front of the door at `x`.
 *   - `rails: 'iron'`  – cast-iron balustrade with heavy newel posts at the foot (Italianate,
 *     Greek Revival, Federal); `low` stoops get a single slim handrail instead. `newel:
 *     'angular'` sets heavy grooved stone newels with stepped caps at the foot (Neo-Grec).
 *   - `rails: 'stone'` – solid stone cheek walls with sloping copings (Romanesque).
 *   - `rails: 'none'`.
 * `basement: { side, color }` leaves the space under the landing open on `side` (−1 / 1, toward
 * the areaway): the basement door under it behind an iron gate. `planters` stands two potted
 * box balls on the second step.
 *
 * @param {object} o `{ x, z, w, toY, steps, run = 0.28, landing = 0.6, color, rails, ironColor,
 *   newel, basement, planters }`
 * @returns {number} how far the stoop reaches out from the facade (m)
 */
export function buildStoop(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, w, toY, steps } = o;
  const run = o.run ?? 0.28;
  const landing = o.landing ?? 0.6;
  const rise = toY / steps;
  const stone = { tile: T.wall_stone, color: o.color ?? STONE_STEP, texScale: 0.9 };
  const reach = landing + (steps - 1) * run;
  const xFoot = x - reach;

  // Landing, then one block per tread (blocks never overlap, so no coplanar faces)
  if (o.basement) {
    // Open under the landing: the slab rests on a stone cheek on the far side, and beneath it,
    // reached from the areaway on the open side, the low basement door behind an iron gate
    const s = o.basement.side ?? -1;
    const slab = 0.22;
    const under = toY - slab;
    b.box(x - landing * 0.5, under, z, landing, slab, w, { ...stone, faces: { px: false } });
    b.box(x - landing * 0.5, 0, z - s * (w * 0.5 - 0.08), landing, under, 0.16, {
      ...stone,
      faces: { ny: false, px: false },
    });
    const dw = Math.min(0.78, w - 0.5);
    const dh = under - 0.1;
    b.quad([x - 0.006, 0, z - dw * 0.5 - 0.05], [0, 0, dw + 0.1], [0, dh + 0.05, 0], {
      tile: T.white,
      color: [0.06, 0.055, 0.05],
    });
    buildPanelledDoor(atlas, b, x, 0, z, dw, dh, o.basement.color ?? [0.2, 0.14, 0.11], {
      paint: true,
    });
    // The gate across the open side
    const gz = z + s * (w * 0.5 - 0.02);
    orientedQuad(
      b,
      [x - landing + 0.04, 0, gz],
      [x - 0.02, 0, gz],
      [x - 0.02, under - 0.02, gz],
      [x - landing + 0.04, under - 0.02, gz],
      [0, 0, s],
      {
        tile: T.balcony_iron,
        color: [1, 1, 1],
        rep: [Math.max(1, Math.round(landing / 0.3)), Math.max(1, Math.round(under / 0.3))],
      },
    );
  } else {
    b.box(x - landing * 0.5, 0, z, landing, toY, w, { ...stone, faces: { ny: false, px: false } });
  }
  // Two potted box balls on the second step
  if (o.planters && steps > 2) {
    const px = xFoot + run * 1.5;
    for (const s of [-1, 1]) {
      const pz = z + s * (w * 0.5 - 0.28);
      b.cylinderY(px, rise * 2, pz, 0.09, 0.12, 0.24, 8, {
        tile: T.terracotta,
        color: [0.78, 0.5, 0.38],
      });
      b.box(px, rise * 2 + 0.26, pz, 0.24, 0.22, 0.24, {
        tile: T.hedge,
        color: [0.32, 0.46, 0.22],
        data: [0, 0.15],
      });
      b.box(px, rise * 2 + 0.3, pz, 0.18, 0.26, 0.18, {
        tile: T.hedge,
        color: [0.36, 0.5, 0.24],
        data: [0, 0.15],
      });
    }
  }
  for (let k = 1; k < steps; k++) {
    const x1 = x - landing - (steps - 1 - k) * run;
    b.box(x1 - run * 0.5, 0, z, run, k * rise, w, { ...stone, faces: { ny: false } });
    // Nosing: a thin overhang on every tread
    b.box(x1 - run + 0.01, k * rise - 0.03, z, 0.05, 0.03, w + 0.02, stone);
  }

  const rails = o.rails ?? 'iron';
  if (rails === 'iron') {
    const iron = { tile: T.metal, color: o.ironColor ?? CHARCOAL_IRON };
    const low = steps <= 3;
    for (const s of [-1, 1]) {
      const rz = z + s * (w * 0.5 - 0.05);
      const footX = xFoot + 0.12;
      const railH = 0.9;
      // Sloping handrail and bottom rail, level rails along the landing
      tube(b, footX, rise + railH, rz, x - landing, toY + railH, rz, 0.028, 0.028, 6, iron);
      tube(b, x - landing, toY + railH, rz, x - 0.04, toY + railH, rz, 0.028, 0.028, 6, iron);
      if (!low) {
        tube(b, footX, rise + 0.12, rz, x - landing, toY + 0.12, rz, 0.018, 0.018, 4, iron);
        // Balusters every 15 cm, standing on the tread line
        for (let bx = footX + 0.15; bx < x - 0.08; bx += 0.15) {
          const t = Math.min(1, Math.max(0, (bx - footX) / (x - landing - footX)));
          const yb = bx >= x - landing ? toY : rise + (toY - rise) * t;
          b.box(bx, yb + 0.02, rz, 0.022, railH - 0.02, 0.022, iron);
        }
        if (o.newel === 'angular') {
          // Neo-Grec: a heavy angular stone newel – a plinth, the square shaft with grooves cut
          // down its street and outer faces, a stepped cap and a low pyramid
          const nh = rise + railH + 0.06;
          const groove = { tile: T.white, color: (o.color ?? STONE_STEP).map((c) => c * 0.45) };
          b.box(footX, 0, rz, 0.32, 0.18, 0.32, stone);
          // (the shaft a hair wider than the foot step's front it stands on)
          b.box(footX, 0.18, rz, 0.244, nh - 0.18, 0.244, stone);
          for (const g of [-0.055, 0.055]) {
            b.quad([footX - 0.121, 0.3, rz + g - 0.01], [0, 0, 0.02], [0, nh - 0.48, 0], groove);
            orientedQuad(
              b,
              [footX + g - 0.01, 0.3, rz + s * 0.121],
              [footX + g + 0.01, 0.3, rz + s * 0.121],
              [footX + g + 0.01, nh - 0.18, rz + s * 0.121],
              [footX + g - 0.01, nh - 0.18, rz + s * 0.121],
              [0, 0, s],
              groove,
            );
          }
          b.box(footX, nh, rz, 0.32, 0.07, 0.32, stone);
          b.box(footX, nh + 0.07, rz, 0.26, 0.05, 0.26, stone);
          const [a, c, py] = [0.12, 0.025, nh + 0.12];
          b.prism(
            [footX - a, py, rz + a],
            [footX + a, py, rz + a],
            [footX + a, py, rz - a],
            [footX - a, py, rz - a],
            [footX - c, py + 0.1, rz + c],
            [footX + c, py + 0.1, rz + c],
            [footX + c, py + 0.1, rz - c],
            [footX - c, py + 0.1, rz - c],
            stone,
          );
          continue;
        }
        // Newel post at the foot: square shaft, moulded cap and ball finial
        b.box(footX, 0, rz, 0.164, rise + railH + 0.08, 0.164, iron);
        b.box(footX, rise + railH + 0.08, rz, 0.22, 0.06, 0.22, iron);
        b.cylinderY(footX, rise + railH + 0.14, rz, 0.07, 0.04, 0.12, 8, iron);
      } else {
        for (const bx of [footX, x - landing, x - 0.06]) {
          const yb = bx > x - landing - 0.01 ? toY : rise;
          b.box(bx, yb, rz, 0.03, railH, 0.03, iron);
        }
      }
    }
  } else if (rails === 'stone') {
    const cheek = { tile: T.wall_stone, color: o.color ?? STONE_STEP, texScale: 0.9 };
    const cap = { tile: T.wall_stone, color: STONE_CORNICE, texScale: 0.9 };
    for (const s of [-1, 1]) {
      const cz = z + s * (w * 0.5 + 0.14);
      const z0 = cz - 0.14;
      const z1 = cz + 0.14;
      const yFoot = rise + 0.55;
      const yTop = toY + 0.6;
      // Sloping cheek wall, a pier at the foot and the coping on top
      b.prism(
        [xFoot, 0, z1],
        [x, 0, z1],
        [x, 0, z0],
        [xFoot, 0, z0],
        [xFoot, yFoot, z1],
        [x, yTop, z1],
        [x, yTop, z0],
        [xFoot, yFoot, z0],
        { ...cheek, faces: { ny: false } },
      );
      b.box(xFoot + 0.18, 0, cz, 0.4, yFoot + 0.25, 0.36, cheek);
      b.box(xFoot + 0.18, yFoot + 0.25, cz, 0.46, 0.08, 0.42, cap);
      b.prism(
        [xFoot + 0.38, yFoot + 0.12, z1 + 0.03],
        [x, yTop, z1 + 0.03],
        [x, yTop, z0 - 0.03],
        [xFoot + 0.38, yFoot + 0.12, z0 - 0.03],
        [xFoot + 0.38, yFoot + 0.2, z1 + 0.03],
        [x, yTop + 0.08, z1 + 0.03],
        [x, yTop + 0.08, z0 - 0.03],
        [xFoot + 0.38, yFoot + 0.2, z0 - 0.03],
        cap,
      );
    }
  }
  return reach;
}

/**
 * Areaway railing: a low stone curb along the sidewalk edge of the sunken area in front of a
 * basement, open iron pickets with spear finials, and the returns back to the facade.
 * `gateZ` leaves a small gate in the front run; `bins` (lot-local Z) stands lidded trash cans
 * in the areaway, behind the railing; `hedge: { h }` plants a box hedge along the railing.
 *
 * @param {object} o `{ x, z0, z1, depth = 1.1, h = 0.95, gateZ, bins, binX, hedge, rng }`
 */
export function buildAreaway(atlas, b, o) {
  const T = atlas.tiles;
  const depth = o.depth ?? 1.1;
  const h = o.h ?? 0.95;
  const xr = o.x - depth;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const curb = { tile: T.wall_stone, color: STONE_STEP, texScale: 0.9 };
  const run = (za, zb, xa, xb) => {
    // A straight run from (xa, za) to (xb, zb)
    const len = Math.hypot(xb - xa, zb - za);
    if (len < 0.2) return;
    const alongZ = Math.abs(zb - za) > Math.abs(xb - xa);
    const cx = (xa + xb) * 0.5;
    const cz = (za + zb) * 0.5;
    // Runs along Z a few millimetres taller: the runs overlap at the corners
    b.box(cx, 0, cz, alongZ ? 0.24 : len, alongZ ? 0.143 : 0.14, alongZ ? len : 0.24, curb);
    b.box(cx, h - 0.04, cz, alongZ ? 0.04 : len, 0.04, alongZ ? len : 0.04, iron);
    b.box(cx, 0.22, cz, alongZ ? 0.03 : len, 0.03, alongZ ? len : 0.03, iron);
    const n = Math.max(2, Math.round(len / 0.13));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = xa + (xb - xa) * t;
      const pz = za + (zb - za) * t;
      if (o.gateZ !== undefined && Math.abs(pz - o.gateZ) < 0.42 && alongZ) continue;
      b.box(px, 0.14, pz, 0.02, h - 0.14, 0.02, iron);
      b.box(px, h, pz, 0.035, 0.08, 0.035, iron);
    }
  };
  run(o.z0, o.z1, xr, xr);
  run(o.z0, o.z0, xr, o.x);
  run(o.z1, o.z1, xr, o.x);
  if (o.gateZ !== undefined) {
    for (const s of [-1, 1]) b.box(xr, 0, o.gateZ + s * 0.42, 0.08, h + 0.12, 0.08, iron);
  }
  // `binX`: how far out the cans stand (clear of a bay standing in the areaway)
  const bx = o.binX === undefined ? o.x - depth * 0.5 + 0.05 : o.x - o.binX;
  for (const bz of o.bins ?? []) buildTrashCan(atlas, b, bx, bz);
  if (o.hedge) {
    // A low clipped box hedge planted along the inside of the railing
    const hz0 = o.z0 + 0.2;
    const hz1 = o.z1 - 0.2;
    const hh = o.hedge.h ?? 0.7;
    buildBoxHedge(atlas, b, xr + 0.32, 0, (hz0 + hz1) * 0.5, hz1 - hz0, hh, 0.38, o.rng, true);
  }
}
