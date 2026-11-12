/**
 * Japanese shopfront fitted into the ground storey of an old frame house (the ramen bar,
 * № 118): dark timber posts and a head beam, plain glass with wooden lattice (koshi) over its
 * lower part, a pent roof of grey kawara tiles (hisashi) on brackets, the signboard over it,
 * the red door under an indigo noren, red paper lanterns (chōchin) hung from the eave.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { CHARCOAL_IRON, WHITE } from './palette.js';
import { buildPanelledDoor } from './Doors.js';
import { orientedQuad } from './primitives.js';
import { windowSeed } from './Windows.js';

/** Dark-stained timber of the posts, beams and lattice. */
const TIMBER = Object.freeze([0.2, 0.13, 0.09]);
/** Head beam over the glass and the door, and how high the pent roof meets the wall. */
const BEAM_Y = 2.62;
const ROOF_Y = 3.06;

/**
 * Red paper lantern (chōchin) hanging from `y + 0.4`: ribbed washi between black lacquered caps,
 * a brushed glyph on the street side and a short tassel; it glows at dusk.
 */
export function buildChochin(atlas, b, x, y, z, s = 1) {
  const T = atlas.tiles;
  const lacquer = { tile: T.white, color: [0.1, 0.08, 0.08] };
  const paper = { tile: T.lantern_paper, color: WHITE, data: [3.0, 0] };
  const r = 0.15 * s;
  const h = 0.3 * s;
  b.cylinderY(x, y + h + 0.02 * s, z, r * 0.8, r * 0.66, 0.05 * s, 10, lacquer);
  // Barrel: narrower shoulders, full belly
  b.cylinderY(x, y + 0.02 * s, z, r * 0.84, r, h * 0.3, 10, paper, false);
  b.cylinderY(x, y + 0.02 * s + h * 0.3, z, r, r, h * 0.4, 10, paper, false);
  b.cylinderY(x, y + 0.02 * s + h * 0.7, z, r, r * 0.84, h * 0.3, 10, paper, false);
  b.cylinderY(x, y - 0.03 * s, z, r * 0.74, r * 0.8, 0.05 * s, 10, lacquer);
  b.quad([x - r - 0.004, y + 0.06 * s, z - 0.06 * s], [0, 0, 0.12 * s], [0, 0.22 * s, 0], {
    tile: T.lantern_glyph,
    color: WHITE,
    data: [3.0, 0],
  });
  b.cylinderY(x, y - 0.16 * s, z, 0.014 * s, 0.004, 0.13 * s, 6, {
    tile: T.metal,
    color: [0.85, 0.65, 0.2],
  });
}

/**
 * Noren: the dyed curtain hung on a rod before a door, split into `n` panels that show one
 * picture between them (the tile spans the whole curtain).
 */
function buildNoren(atlas, b, x, z, y1, w, h, n = 3) {
  const T = atlas.tiles;
  const gap = 0.03;
  const pw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const pz = z - w * 0.5 + i * (pw + gap);
    // Both sides of the cloth: the dyed face to the street, the plain back to the door
    b.quad([x, y1 - h, pz], [0, 0, pw], [0, h, 0], {
      tile: T.noren,
      color: WHITE,
      rep: [pw / w, 1],
      uvOffset: [(i * (pw + gap)) / w, 0],
    });
    b.quad([x + 0.004, y1 - h, pz + pw], [0, 0, -pw], [0, h, 0], {
      tile: T.white,
      color: [0.12, 0.16, 0.28],
    });
  }
  // The rod and its two hooks
  b.cylinderX(x, y1 + 0.02, z, 0.018, w + 0.16, 6, { tile: T.wood_paint, color: TIMBER });
  for (const s of [-1, 1]) {
    b.box(x * 0.5, y1 + 0.02, z + s * (w * 0.5 + 0.05), -x, 0.02, 0.02, {
      tile: T.metal,
      color: CHARCOAL_IRON,
    });
  }
}

/**
 * Hisashi: a pent roof of kawara tiles over the shopfront, from the wall at `ROOF_Y` down to its
 * eave `reach` out, a fascia board and a row of round tile ends along the eave, carried on
 * timber brackets.
 */
function buildHisashi(atlas, b, x, z0, z1, reach, brackets) {
  const T = atlas.tiles;
  const timber = { tile: T.wood_paint, color: TIMBER, texScale: 0.5 };
  const drop = reach * 0.34;
  const xe = x - reach;
  const ye = ROOF_Y - drop;
  const len = z1 - z0;
  const slope = Math.hypot(reach, drop);
  const tiles = { tile: T.kawara, color: [0.42, 0.44, 0.48] };
  const ts = 0.64;
  // The slab: its underside boarded, its thin edges plain (the fascia hides the eave edge)
  b.prism(
    [xe, ye - 0.06, z1],
    [x, ROOF_Y - 0.06, z1],
    [x, ROOF_Y - 0.06, z0],
    [xe, ye - 0.06, z0],
    [xe, ye, z1],
    [x, ROOF_Y, z1],
    [x, ROOF_Y, z0],
    [xe, ye, z0],
    {
      ...tiles,
      rep: [1, 0.1],
      faces: {
        px: false,
        py: false,
        ny: { tile: T.wood_paint, color: TIMBER, rep: [slope / 0.5, len / 0.5] },
      },
    },
  );
  // Its tiled top: U along the eave, so the rows of round tiles run down the slope
  orientedQuad(b, [xe, ye, z0], [xe, ye, z1], [x, ROOF_Y, z1], [x, ROOF_Y, z0], [-drop, reach, 0], {
    ...tiles,
    rep: [len / ts, slope / ts],
  });
  // Ridge flashing against the wall, the fascia and the round ends of the cover tiles (a quarter
  // of the tile apart, on the rolls of the picture)
  b.box(x - 0.06, ROOF_Y - 0.02, (z0 + z1) * 0.5, 0.12, 0.1, len + 0.02, { ...tiles, rep: [4, 1] });
  b.box(xe + 0.02, ye - 0.16, (z0 + z1) * 0.5, 0.05, 0.12, len, timber);
  for (let tz = z0 + ts * 0.1875; tz < z1 - 0.03; tz += ts / 4) {
    b.cylinderX(xe - 0.01, ye + 0.03, tz, 0.045, 0.04, 6, tiles);
  }
  // Brackets: cantilevers from the head beam out to the eave
  for (const bz of brackets) {
    b.box((x + xe) * 0.5 - 0.04, ye - 0.16, bz, reach - 0.06, 0.1, 0.08, timber);
  }
}

/**
 * The ramen bar's front across `z0..z1`: posts and the head beam, two runs of glass with the
 * koshi lattice over their lower part (plain glass – no interior is drawn), the red door near
 * the right end under its noren, the house number on the post beside it, the pent roof with
 * four lanterns hung from its eave and the signboard over it.
 *
 * @param {object} o `{ x, z0, z1, top (sign band top), door: { at (lot Z), w = 1, color },
 *   signTile, number, lanterns: lot Z of each }`
 * @returns {[number, number]} lot-local Z span of the door (keep clear on the sidewalk)
 */
export function buildRamenFront(atlas, b, pools, rng, o) {
  const T = atlas.tiles;
  const { x, z0, z1 } = o;
  const timber = { tile: T.wood_paint, color: TIMBER, texScale: 0.5 };
  const dw = o.door.w ?? 1.0;
  const dz = o.door.at;
  const dh = 2.24;
  const bulk = 0.5;
  const glassTop = BEAM_Y - 0.04;

  // Posts at the ends, either side of the door and between the two runs of glass
  const g0 = z0 + 0.1;
  const g1 = dz - dw * 0.5 - 0.12;
  const mid = (g0 + g1) * 0.5;
  for (const pz of [z0 + 0.06, mid, dz - dw * 0.5 - 0.06, dz + dw * 0.5 + 0.06, z1 - 0.06]) {
    b.box(x - 0.07, 0, pz, 0.14, BEAM_Y, 0.12, timber);
  }
  b.box(x - 0.08, BEAM_Y, (z0 + z1) * 0.5, 0.16, 0.16, z1 - z0, timber);
  // Sill board along the foot, timber panels over the wall beside the door
  b.box(
    x - 0.06,
    0,
    (dz + dw * 0.5 + 0.12 + z1 - 0.12) * 0.5,
    0.1,
    BEAM_Y,
    z1 - dz - dw * 0.5 - 0.24,
    {
      ...timber,
      color: TIMBER.map((c) => c * 1.25),
    },
  );

  // Glass in two runs: a timber bulkhead, panes in the library's proportion, the lattice
  for (const [r0, r1] of [
    [g0, mid - 0.06],
    [mid + 0.06, g1],
  ]) {
    const gh = glassTop - bulk - 0.04;
    const panes = Math.max(1, Math.round((r1 - r0) / (gh * 0.85)));
    const pw = (r1 - r0) / panes;
    b.box(x - 0.05, 0, (r0 + r1) * 0.5, 0.1, bulk, r1 - r0, timber);
    for (let i = 0; i < panes; i++) {
      const pz0 = r0 + i * pw;
      b.quad([x - 0.02, bulk + 0.04, pz0 + 0.02], [0, 0, pw - 0.04], [0, gh, 0], {
        tile: T.shop_glass,
        color: WHITE,
        rep: [1, 1],
        data: [windowSeed(rng, false), 0],
      });
      if (i > 0) b.box(x - 0.05, bulk, pz0, 0.08, glassTop - bulk, 0.05, timber);
    }
    // Koshi: close-set upright slats before the lower part of the glass, between two rails
    const ky = bulk + 1.0;
    const slat = { ...timber, faces: { px: false, py: false, ny: false } };
    for (let z = r0 + 0.05; z < r1 - 0.02; z += 0.085) {
      b.box(x - 0.07, bulk, z, 0.035, ky - bulk, 0.03, slat);
    }
    b.box(x - 0.08, ky, (r0 + r1) * 0.5, 0.05, 0.05, r1 - r0, timber);
    b.box(x - 0.08, bulk, (r0 + r1) * 0.5, 0.05, 0.05, r1 - r0, timber);
  }

  // The red door, its threshold, the noren over it, the number on the post to its right
  const step = { tile: T.wall_stone, color: [0.6, 0.58, 0.54], texScale: 0.6 };
  b.box(x - 0.18, 0, dz, 0.36, 0.06, dw + 0.16, step);
  b.quad([x - 0.012, 0, dz - dw * 0.5], [0, 0, dw], [0, dh + 0.04, 0], {
    tile: T.white,
    color: [0.06, 0.05, 0.05],
  });
  buildPanelledDoor(atlas, b, x, 0.06, dz, dw - 0.04, dh - 0.06, o.door.color, {
    glazed: true,
    glow: 1.8,
    paint: true,
  });
  b.box(x - 0.06, dh, dz, 0.12, BEAM_Y - dh, dw, timber);
  buildNoren(atlas, b, x - 0.16, dz, dh - 0.02, dw + 0.12, 0.58);
  const plaque = o.number && T[`plaque_${o.number}`];
  if (plaque) {
    b.box(x - 0.14, 1.5, (dz + dw * 0.5 + z1) * 0.5, 0.02, 0.26, 0.26, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: { nx: { tile: plaque, color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  }

  // Pent roof the whole width, lanterns hanging from its eave
  const reach = 0.86;
  buildHisashi(atlas, b, x, z0 - 0.04, z1 + 0.04, reach, [z0 + 0.3, mid, z1 - 0.3]);
  for (const lz of o.lanterns ?? []) {
    // Hung on a cord from the boarded underside, 0.2 in from the eave
    const lx = x - reach + 0.2;
    const ly = ROOF_Y - reach * 0.34 - 0.62;
    const soffit = ROOF_Y - 0.06 - (reach * 0.34 * (x - lx)) / reach;
    b.box(lx, ly + 0.36, lz, 0.012, soffit - ly - 0.36, 0.012, {
      tile: T.metal,
      color: CHARCOAL_IRON,
    });
    buildChochin(atlas, b, lx, ly, lz, 1.1);
  }

  // Signboard over the pent roof: a dark timber frame round the lit board (4:1)
  const sign = o.signTile && T[o.signTile];
  if (sign) {
    const sh = Math.min(0.66, o.top - ROOF_Y - 0.14);
    const sw = sh * 4;
    const sy = ROOF_Y + 0.08;
    const sz = (z0 + z1) * 0.5;
    b.box(x - 0.05, sy - 0.05, sz, 0.1, sh + 0.1, sw + 0.1, timber);
    b.box(x - 0.11, sy, sz, 0.02, sh, sw, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: { nx: { tile: sign, color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  }

  return [dz - dw * 0.5 - 0.4, dz + dw * 0.5 + 0.4];
}
