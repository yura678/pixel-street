/**
 * Facade grid and wall masses: window axes, the stone-faced ground storey and the upper
 * block above it, the plinth course, belt courses, rusticated quoins and brick diamonds.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { STONE_PLINTH } from './palette.js';
import { orientedQuad } from './primitives.js';

/**
 * Window axes of a symmetric block with a central stair core: `perWing` evenly spaced axes
 * in each wing (inset by `edge` from the outer corners), the stair axis in the middle.
 *
 * @param {number} zA left corner (lot-local Z)
 * @param {number} zB right corner
 * @param {number} edge solid pier left at each outer corner
 * @param {number} stairW width of the stair core
 * @param {number} perWing axes per wing
 * @returns {{ axes: number[], stair: number, bayW: number, zC: number }}
 *   `axes` left to right, `stair` = index of the stair axis, `bayW` = width of one bay
 */
export function stairCoreAxes(zA, zB, edge, stairW, perWing) {
  const W = zB - zA;
  const zC = (zA + zB) * 0.5;
  const wingW = (W - stairW) * 0.5;
  const bayW = (wingW - edge) / perWing;
  const axes = [];
  for (let i = 0; i < perWing; i++) axes.push(zA + edge + (i + 0.5) * bayW);
  axes.push(zC);
  for (let i = 0; i < perWing; i++) axes.push(zC + stairW * 0.5 + (i + 0.5) * bayW);
  return { axes, stair: perWing, bayW, zC };
}

/**
 * The building block: ground storey faced in `ground` material up to `groundH`, the upper
 * block in `upper` material up to `h`, and a low plinth course along the foot of the facade.
 *
 * @param {object} atlas facade atlas
 * @param {import('../MeshBuilder.js').MeshBuilder} b
 * @param {{ x: number, depth: number, cz: number, w: number, h: number, groundH: number,
 *   ground: object, upper: object, plinthColor?: number[], plinth?: boolean,
 *   recesses?: Array<{ z0: number, z1: number, h: number, depth: number }> }} m
 *   `ground` / `upper` are MeshBuilder option sets (`tile`, `color`, `texScale`); `recesses` are
 *   openings cut into the ground storey (a recessed shop door, a carriage arch): the mass is
 *   built round them, its faces looking into them, and the plinth stops at their sides
 */
export function buildFacadeMass(atlas, b, m) {
  const T = atlas.tiles;
  const { x, depth, cz, w, h, groundH } = m;
  const cuts = m.recesses ?? [];
  // The blocks are closed solids (their soffits are never seen, but a closed mass is what the
  // coplanar-overlap check in `overlaps.js` needs to tell buried faces from exposed ones)
  if (cuts.length) buildRecessedGround(b, m, cuts);
  else b.box(x + depth * 0.5, 0, cz, depth, groundH, w - 0.006, m.ground);
  // A one-storey building is all ground storey
  if (h - groundH > 0.001) {
    b.box(x + depth * 0.5, groundH, cz, depth, h - groundH, w - 0.006, m.upper);
  }
  // Stone plinth, unless the openings run down to the sidewalk (`plinth: false`)
  if (m.plinth === false) return;
  const plinth = {
    tile: T.quoin_stone,
    color: m.plinthColor ?? STONE_PLINTH,
    texScale: 1.1,
    faces: { ny: false },
  };
  if (!cuts.length) {
    // 4 mm under half a metre: shop bulkheads and stoop landings stop at 0.5 m
    b.box(x + 0.02, 0, cz, 0.16, PLINTH_H, w - 0.002, plinth);
    return;
  }
  // Each run stops a few millimetres short of the openings' sides and of the wall's flanks
  for (const [z0, z1] of spansBetween(cz - w * 0.5 + 0.001, cz + w * 0.5 - 0.001, cuts)) {
    b.box(x + 0.02, 0, (z0 + z1) * 0.5, 0.16, PLINTH_H, z1 - z0 - 0.007, plinth);
  }
}

/** Height of the stone plinth course along the foot of the facade. */
const PLINTH_H = 0.496;

/** The parts of `z0..z1` left between the recesses (sorted along Z). */
function spansBetween(z0, z1, cuts) {
  const out = [];
  let z = z0;
  for (const c of [...cuts].sort((a, b) => a.z0 - b.z0)) {
    if (c.z0 > z + 1e-4) out.push([z, c.z0]);
    z = Math.max(z, c.z1);
  }
  if (z1 > z + 1e-4) out.push([z, z1]);
  return out;
}

/**
 * Ground storey with openings cut into it: a block behind the deepest recess, solid piers between
 * the recesses, and over and behind each one the wall that closes it – its soffit and back wall
 * facing into the opening.
 */
function buildRecessedGround(b, m, cuts) {
  const { x, depth, cz, w, groundH } = m;
  const D = Math.max(...cuts.map((c) => c.depth));
  const zA = cz - w * 0.5 + 0.003;
  const zB = cz + w * 0.5 - 0.003;
  b.box(x + D + (depth - D) * 0.5, 0, cz, depth - D, groundH, zB - zA, {
    ...m.ground,
    faces: { ny: false },
  });
  for (const [z0, z1] of spansBetween(zA, zB, cuts)) {
    b.box(x + D * 0.5, 0, (z0 + z1) * 0.5, D, groundH, z1 - z0, {
      ...m.ground,
      faces: { ny: false },
    });
  }
  for (const c of cuts) {
    const zc = (c.z0 + c.z1) * 0.5;
    const cw = c.z1 - c.z0;
    b.box(x + D * 0.5, c.h, zc, D, groundH - c.h, cw, m.ground);
    if (D - c.depth > 1e-4) {
      b.box(x + c.depth + (D - c.depth) * 0.5, 0, zc, D - c.depth, c.h, cw, {
        ...m.ground,
        faces: { ny: false },
      });
    }
  }
}

/**
 * Diamonds of darker brick laid into the piers of a Commercial-style front: one at every
 * `[z, y]`, `size` from its centre to a corner, a smaller one of the wall colour inside it.
 */
export function buildPierDiamonds(atlas, b, x, spots, size, color, inner) {
  const T = atlas.tiles;
  for (const [z, y] of spots) {
    for (const [s, col, dx] of [
      [size, color, 0.004],
      [size * 0.45, inner, 0.008],
    ]) {
      orientedQuad(
        b,
        [x - dx, y - s, z],
        [x - dx, y, z + s],
        [x - dx, y + s, z],
        [x - dx, y, z - s],
        [-1, 0, 0],
        { tile: T.wall_stone, color: col, rep: [1, 1] },
      );
    }
  }
}

/**
 * Flat pilasters from `y0` to `y1` at every `z` (single, or `paired` either side of it): a
 * plinth block, the shaft standing a little proud of the wall and a capital – `ionic` with a
 * pair of volutes under the abacus, else a plain moulded cap. `round` makes them engaged
 * half-columns (the cast-iron front of № 148), `corinthian` crowns those with a bell of
 * acanthus leaves, corner volutes and the abacus.
 *
 * @param {object} o `{ x, zs, y0, y1, w = 0.3, paired, capital, color, round }`
 */
export function buildPilasters(atlas, b, o) {
  const stone = { tile: atlas.tiles.wall_stone, color: o.color, texScale: 0.9 };
  const w = o.w ?? 0.3;
  const { x, y0, y1 } = o;
  const zs = o.paired ? o.zs.flatMap((z) => [z - w * 0.5 - 0.04, z + w * 0.5 + 0.04]) : o.zs;
  if (o.round) {
    for (const z of zs) buildHalfColumn(b, stone, x, z, y0, y1, w * 0.5, o.capital);
    return;
  }
  for (const z of zs) {
    b.box(x - 0.05, y0, z, 0.1, 0.22, w + 0.08, stone);
    b.box(x - 0.035, y0 + 0.22, z, 0.07, y1 - y0 - 0.42, w, stone);
    b.box(x - 0.05, y1 - 0.2, z, 0.1, 0.12, w + 0.06, stone);
    b.box(x - 0.06, y1 - 0.08, z, 0.12, 0.08, w + 0.12, stone);
    if (o.capital === 'ionic') {
      for (const s of [-1, 1]) {
        b.cylinderX(x - 0.07, y1 - 0.15, z + s * (w * 0.5 - 0.02), 0.055, 0.03, 8, stone);
      }
    }
  }
}

/**
 * Engaged half-column of radius `r` from `y0` to `y1`, its axis in the wall plane `x`: a square
 * plinth and a torus, the shaft tapering a little (entasis) and the capital – `corinthian`: a
 * flaring bell with two tiers of leaves, volutes at its corners and a square abacus.
 */
function buildHalfColumn(b, opt, x, z, y0, y1, r, capital) {
  const shaftTop = y1 - (capital === 'corinthian' ? 0.3 : 0.14);
  b.box(x - 0.01, y0, z, 0.02 + r * 2.3, 0.14, r * 2.5, { ...opt, faces: { px: false } });
  b.cylinderY(x, y0 + 0.14, z, r * 1.12, r * 1.04, 0.07, 8, opt);
  b.cylinderY(x, y0 + 0.21, z, r, r * 0.9, shaftTop - y0 - 0.21, 8, opt, false);
  if (capital !== 'corinthian') {
    b.box(x - 0.01, shaftTop, z, 0.02 + r * 2.2, 0.14, r * 2.4, { ...opt, faces: { px: false } });
    return;
  }
  // Bell, leaves standing out of it in two tiers, volutes under the abacus corners
  b.cylinderY(x, shaftTop, z, r * 0.9, r * 1.28, 0.22, 8, opt, false);
  for (const [dy, lh, k] of [
    [0.0, 0.11, 1.0],
    [0.09, 0.1, 1.18],
  ]) {
    for (const s of [-0.62, 0, 0.62]) {
      b.box(x - r * k * 0.86, shaftTop + dy, z + s * r * k, 0.05, lh, r * 0.5, opt);
    }
  }
  for (const s of [-1, 1]) {
    b.cylinderX(x - r * 1.05, shaftTop + 0.19, z + s * r * 1.12, 0.04, 0.05, 6, opt);
  }
  b.box(x - 0.01, shaftTop + 0.223, z, 0.02 + r * 2.9, 0.08, r * 2.9, {
    ...opt,
    faces: { px: false },
  });
}

/**
 * Terracotta let into the brick (Romanesque): panels and bands flush with the wall, each `[z, y,
 * w, h]` (centre, foot, size); a panel big enough gets a raised field in a darker shade.
 */
export function buildTerracottaInsets(atlas, b, x, rects, color) {
  const tc = { tile: atlas.tiles.terracotta, color, texScale: 0.4, faces: { px: false } };
  for (const [z, y, w, h] of rects) {
    b.box(x - 0.015, y, z, 0.03, h, w, tc);
    if (w > 0.25 && h > 0.25) {
      b.box(x - 0.035, y + 0.06, z, 0.01, h - 0.12, w - 0.12, {
        ...tc,
        color: color.map((c) => c * 0.8),
      });
    }
  }
}

/** Projecting stone belt course (string course) across the facade, bottom at `y`. */
export function buildBeltCourse(atlas, b, x, y, cz, w, color) {
  // A little inside the wall mass's flanks (`w - 0.006`): at the lot's edges its ends would
  // share planes with a neighbour's belt, quoins and the flanks themselves
  b.box(x - 0.07, y, cz, 0.14, 0.18, w - 0.01, {
    tile: atlas.tiles.wall_stone,
    color,
    texScale: 0.9,
  });
}

/**
 * Rusticated quoin strips from `y0` up `h`: one per `[z, width]` pair (wide at the outer
 * corners, narrower where they frame a stair core or a bay).
 */
export function buildQuoins(atlas, b, x, y0, h, strips, color) {
  for (const [z, width] of strips) {
    b.box(x - 0.04, y0, z, 0.1, h, width, {
      tile: atlas.tiles.quoin_stone,
      color,
      texScale: 0.9,
      faces: { ny: false, py: false },
    });
  }
}
