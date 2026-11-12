/**
 * The civic set of the town hall (chunk 7): the bell cupola, the
 * attic with its carved inscription, balustrade and urns, the council balcony with two flags,
 * lanterns on pedestals beside the steps, and the bus stop at the curb in front – shelter, BUS
 * flag, bay stripe and the notice board by the wall. Its annex (chunk 8) adds the inscribed
 * frieze and the flagpole on the roof.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { BRASS_TRIM, CHARCOAL_IRON, STONE_CORNICE, STONE_QUOIN, WHITE } from './palette.js';
import { orientedQuad, tube } from './primitives.js';

/**
 * Square tower on the roof (plain stone: the clock was taken off its street face), an open
 * belfry with the bronze bell, and a verdigris copper spire with a gilt finial (the bell of the
 * old town hall). `x` is the tower's street face, `y0` its foot.
 *
 * @param {object} o `{ x, z, y0, w = 1.72, h = 1.45 }`
 */
export function buildClockCupola(atlas, b, o) {
  const T = atlas.tiles;
  const towerW = o.w ?? 1.72;
  const towerH = o.h ?? 1.45;
  const towerX = o.x + towerW * 0.5;
  const towerZ = o.z;
  const y0 = o.y0;
  // Tiled at the stone's scale (without `texScale` a box face takes one whole tile, so the caps
  // and piers showed a few huge blocks)
  const stone = (color) => ({ tile: T.wall_stone, color, texScale: 0.9 });

  b.box(towerX, y0, towerZ, towerW, towerH, towerW, {
    ...stone(STONE_QUOIN),
    texScale: 1.4,
    faces: { ny: false },
  });
  b.box(towerX, y0 + towerH, towerZ, towerW + 0.18, 0.12, towerW + 0.18, stone(STONE_CORNICE));

  // Open belfry: four corner piers, the bell hanging between them, the eave cap
  const belfryY = y0 + towerH + 0.12;
  const belfryH = 1.05;
  const belfryW = towerW - 0.22;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(
        towerX + sx * (belfryW * 0.5 - 0.08),
        belfryY,
        towerZ + sz * (belfryW * 0.5 - 0.08),
        0.16,
        belfryH,
        0.16,
        { ...stone(STONE_CORNICE), faces: { ny: false, py: false } },
      );
    }
  }
  b.cylinderY(towerX, belfryY + belfryH * 0.35, towerZ, 0.22, 0.14, 0.34, 10, {
    tile: T.metal,
    color: BRASS_TRIM,
    data: [1.0, 0],
  });
  b.box(towerX, belfryY + belfryH, towerZ, belfryW + 0.2, 0.1, belfryW + 0.2, stone(STONE_CORNICE));

  // Copper spire and the finial
  const e = belfryW * 0.5 + 0.08;
  const sy = belfryY + belfryH + 0.1;
  const top = sy + 1.45;
  const apex = [towerX, top, towerZ];
  b.prism(
    [towerX - e, sy, towerZ + e],
    [towerX + e, sy, towerZ + e],
    [towerX + e, sy, towerZ - e],
    [towerX - e, sy, towerZ - e],
    apex,
    apex,
    apex,
    apex,
    { tile: T.roof_metal, color: [0.28, 0.44, 0.38] },
  );
  b.cylinderY(towerX, top, towerZ, 0.025, 0.015, 0.55, 6, { tile: T.metal, color: BRASS_TRIM });
  b.box(towerX, top + 0.52, towerZ, 0.08, 0.08, 0.08, { tile: T.white, color: BRASS_TRIM });
}

/**
 * Attic storey over the cornice: a solid stone band with a carved inscription panel in the
 * middle, the coping, then a balustrade with pedestals and urns on the end pedestals.
 *
 * @param {object} o `{ x, cz, w, y0, h, stone: MeshBuilder options, coping, inscription: tile,
 *   balustrade = true }`
 */
export function buildAttic(atlas, b, o) {
  const T = atlas.tiles;
  const { x, cz, w, y0, h } = o;
  const stone = o.stone;
  const coping = { tile: T.wall_stone, color: o.coping ?? STONE_CORNICE, texScale: 0.9 };
  // 4 mm proud of the facade: the roof membrane's front edge lies in the facade plane
  b.box(x + 0.196, y0, cz, 0.4, h, w, { ...stone, faces: { ny: false } });
  b.box(x + 0.18, y0 + h, cz, 0.48, 0.08, w + 0.04, coping);
  if (o.inscription) {
    const pw = Math.min(4.0, w - 1.2);
    b.box(x - 0.02, y0 + (h - pw / 8) * 0.5, cz, 0.04, pw / 8, pw, {
      ...stone,
      faces: { nx: { tile: o.inscription, color: stone.color, rep: [1, 1] } },
    });
  }
  if (o.balustrade === false) return;
  const by = y0 + h + 0.08;
  const bh = 0.55;
  const pedestals = [cz - w * 0.5 + 0.2, cz, cz + w * 0.5 - 0.2];
  for (const pz of pedestals) {
    b.box(x + 0.18, by, pz, 0.34, bh + 0.08, 0.34, coping);
  }
  for (let i = 0; i + 1 < pedestals.length; i++) {
    const za = pedestals[i] + 0.25;
    const zb = pedestals[i + 1] - 0.25;
    b.box(x + 0.18, by, (za + zb) * 0.5, 0.3, 0.08, zb - za + 0.1, coping);
    for (let z = za + 0.05; z <= zb; z += 0.19) {
      b.cylinderY(x + 0.18, by + 0.08, z, 0.05, 0.065, bh - 0.16, 6, coping);
    }
    b.box(x + 0.18, by + bh - 0.08, (za + zb) * 0.5, 0.32, 0.08, zb - za + 0.1, coping);
  }
  // Urns on the end pedestals: foot, bowl, lid and a knob
  for (const pz of [pedestals[0], pedestals[2]]) {
    const uy = by + bh + 0.08;
    b.cylinderY(x + 0.18, uy, pz, 0.1, 0.07, 0.08, 8, coping);
    b.cylinderY(x + 0.18, uy + 0.08, pz, 0.08, 0.17, 0.2, 8, coping);
    b.cylinderY(x + 0.18, uy + 0.28, pz, 0.17, 0.12, 0.08, 8, coping);
    b.cylinderY(x + 0.18, uy + 0.36, pz, 0.05, 0.02, 0.1, 6, coping);
  }
}

/**
 * Stone balcony on two consoles in front of the council chamber's middle window, a balustrade
 * round it and two flags on poles slanting out from its front corners (the cloth sways).
 *
 * @param {object} o `{ x, z, y, w = 1.9, flag: tile, color }`
 */
export function buildCivicBalcony(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y } = o;
  const w = o.w ?? 1.9;
  const d = 0.8;
  const stone = { tile: T.wall_stone, color: o.color ?? STONE_CORNICE, texScale: 0.9 };
  b.box(x - d * 0.5, y, z, d, 0.16, w, stone);
  for (const s of [-1, 1]) {
    b.box(x - 0.2, y - 0.5, z + s * (w * 0.5 - 0.2), 0.4, 0.5, 0.18, stone);
    b.box(x - 0.45, y - 0.18, z + s * (w * 0.5 - 0.2), 0.14, 0.18, 0.18, stone);
  }
  // Balustrade: front run and the two returns
  const by = y + 0.16;
  const runs = [
    [x - d + 0.1, z - w * 0.5 + 0.1, x - d + 0.1, z + w * 0.5 - 0.1],
    [x - d + 0.1, z - w * 0.5 + 0.1, x - 0.05, z - w * 0.5 + 0.1],
    [x - d + 0.1, z + w * 0.5 - 0.1, x - 0.05, z + w * 0.5 - 0.1],
  ];
  for (const [xa, za, xb, zb] of runs) {
    const len = Math.hypot(xb - xa, zb - za);
    const n = Math.max(2, Math.round(len / 0.17));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b.cylinderY(xa + (xb - xa) * t, by, za + (zb - za) * t, 0.04, 0.05, 0.62, 6, stone);
    }
    const alongZ = Math.abs(zb - za) > Math.abs(xb - xa);
    // The front rail a few millimetres higher, the returns a little slimmer and stopping short
    // of its outer face: the rails overlap at the corners
    b.box(
      (xa + xb) * 0.5 + (alongZ ? 0 : 0.004),
      by + 0.62 + (alongZ ? 0.003 : 0),
      (za + zb) * 0.5,
      alongZ ? 0.16 : len + 0.152,
      0.08,
      alongZ ? len + 0.16 : 0.152,
      stone,
    );
  }
  // Flags slanting out and up from the front corners, the cloth hanging from the pole
  if (o.flag) {
    const pole = { tile: T.metal, color: BRASS_TRIM };
    for (const s of [-1, 1]) {
      const p0 = [x - d + 0.1, by + 0.7, z + s * (w * 0.5 - 0.1)];
      const dir = [-0.55, 0.68, s * 0.48];
      const L = 2.3;
      const p1 = p0.map((c, i) => c + dir[i] * L);
      tube(b, ...p0, ...p1, 0.022, 0.018, 5, pole);
      b.box(p1[0], p1[1], p1[2], 0.07, 0.07, 0.07, { tile: T.white, color: BRASS_TRIM });
      // Cloth: 1.2 along the pole from near its tip, 0.8 down
      const a = p0.map((c, i) => c + dir[i] * (L - 1.32));
      const u = dir.map((c) => c * 1.2);
      const v = [0, -0.8, 0];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const cloth = { tile: o.flag, color: WHITE, rep: [1, 1], data: [0, 0.5] };
      const pts = [
        a,
        a.map((c, i) => c + u[i]),
        a.map((c, i) => c + u[i] + v[i]),
        a.map((c, i) => c + v[i]),
      ];
      orientedQuad(b, pts[0], pts[1], pts[2], pts[3], n, cloth);
      orientedQuad(
        b,
        pts[0],
        pts[1],
        pts[2],
        pts[3],
        n.map((c) => -c),
        cloth,
      );
    }
  }
}

/**
 * Stone frieze across the facade with a carved inscription in the middle (the POST OFFICE of the
 * town hall annex): a smooth band standing a little proud of the brick, the lettered panel on it.
 *
 * @param {object} o `{ x, cz, w, y0, h, stone: MeshBuilder options, inscription: tile (8:1),
 *   panelW = 4 }`
 */
export function buildInscribedFrieze(atlas, b, o) {
  const { x, cz, w, y0, h, stone } = o;
  b.box(x - 0.03, y0, cz, 0.06, h, w, { ...stone, faces: { px: false } });
  if (!o.inscription) return;
  const pw = Math.min(o.panelW ?? 4.0, w - 1.0);
  const ph = pw / 8;
  b.box(x - 0.075, y0 + (h - ph) * 0.5, cz, 0.03, ph, pw, {
    ...stone,
    faces: { nx: { tile: o.inscription, color: stone.color, rep: [1, 1] }, px: false },
  });
}

/**
 * Flagpole standing on a flat roof behind the parapet: a base plate, the white pole with a gilt
 * ball and the flag hanging from near its top, facing the street on both sides (the cloth sways).
 *
 * @param {object} o `{ x, z, y0: roof deck, h = 3.2, flag: tile (3:2), dir = 1 – the side the
 *   cloth flies to (±Z) }`
 */
export function buildRoofFlag(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y0 } = o;
  const h = o.h ?? 3.2;
  const dir = o.dir ?? 1;
  const pole = { tile: T.metal, color: [0.9, 0.9, 0.88] };
  b.box(x, y0, z, 0.3, 0.06, 0.3, { tile: T.metal, color: CHARCOAL_IRON });
  b.cylinderY(x, y0 + 0.06, z, 0.045, 0.03, h, 6, pole);
  b.cylinderY(x, y0 + 0.06 + h, z, 0.06, 0.06, 0.1, 6, { tile: T.white, color: BRASS_TRIM });
  const top = y0 + h - 0.08;
  const cloth = { tile: o.flag, color: WHITE, rep: [1, 1], data: [0, 0.5] };
  const z1 = z + dir * 1.2;
  for (const s of [-1, 1]) {
    const fx = x + s * 0.01;
    orientedQuad(
      b,
      [fx, top - 0.8, z],
      [fx, top - 0.8, z1],
      [fx, top, z1],
      [fx, top, z],
      [s, 0, 0],
      cloth,
    );
  }
}

/** Cast-iron lantern on a stone pedestal beside the town hall steps (lit at dusk). */
export function buildPedestalLantern(atlas, b, pools, x, z) {
  const T = atlas.tiles;
  const stone = { tile: T.wall_stone, color: STONE_CORNICE, texScale: 0.9 };
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  b.box(x, 0, z, 0.46, 0.95, 0.46, stone);
  b.box(x, 0.95, z, 0.56, 0.1, 0.56, stone);
  b.cylinderY(x, 1.05, z, 0.07, 0.05, 0.75, 8, iron);
  b.box(x, 1.8, z, 0.3, 0.05, 0.3, iron);
  b.box(x, 1.85, z, 0.24, 0.36, 0.24, { tile: T.bulb, color: WHITE, data: [0, 0] });
  b.cylinderY(x, 2.21, z, 0.2, 0.03, 0.16, 8, iron);
  pools.quad([x - 1.1, 0.012, z - 1.1], [2.2, 0, 0], [0, 0, 2.2], {
    color: [0.62, 0.46, 0.24],
    data: [0.4, 0],
  });
}

/**
 * The bus stop in front of the town hall, all at the curb so the facade stays clear: a glass
 * shelter with its bench facing the road, the BUS flag, the yellow bay stripe, a litter bin –
 * and the town notice board standing by the wall. `curbX` is the curb line (lot-local X).
 *
 * @param {object} o `{ w, curbX, shelter: [z0, z1], flagZ, noticeZ, poster: tile, busSign: tile }`
 * @returns {Array<[number, number]>} Z spans kept clear of other sidewalk furniture
 */
export function buildBusStopKit(atlas, b, pools, o) {
  const T = atlas.tiles;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const { curbX, w } = o;
  const [z0, z1] = o.shelter;
  // The shelter stands back from the curb: its roof's front edge 0.4 m in from the curb face,
  // its back still within the furniture strip (1.5 m), clear of the walkway behind
  const x0 = curbX + 0.55;
  const x1 = curbX + 1.35;
  const roofY = 2.45;
  // Bay stripe along the curb
  b.quad([curbX + 0.02, 0.018, w * 0.45], [0.2, 0, 0], [0, 0, -w * 0.9], {
    tile: T.white,
    color: [0.84, 0.62, 0.18],
  });
  // Shelter: posts, roof with a light strip, the glass back toward the building, poster end
  for (const px of [x0 + 0.05, x1 - 0.05]) {
    for (const pz of [z0 + 0.05, z1 - 0.05]) {
      b.box(px, -0.02, pz, 0.07, roofY + 0.02, 0.07, { ...iron, faces: { ny: false } });
    }
  }
  b.box((x0 + x1) * 0.5, roofY, (z0 + z1) * 0.5, x1 - x0 + 0.3, 0.1, z1 - z0 + 0.25, {
    tile: T.roof_metal,
    color: [0.24, 0.27, 0.3],
    texScale: 1.4,
  });
  b.box((x0 + x1) * 0.5, roofY - 0.04, (z0 + z1) * 0.5, 0.2, 0.04, (z1 - z0) * 0.7, {
    tile: T.bulb,
    color: WHITE,
    data: [0, 0],
  });
  b.box(x1 - 0.05, 0.25, (z0 + z1) * 0.5, 0.03, roofY - 0.35, z1 - z0 - 0.12, {
    tile: T.glass_panel,
    color: WHITE,
    rep: [2, 1],
  });
  if (o.poster) {
    b.box((x0 + x1) * 0.5, 0.15, z1 - 0.06, x1 - x0 - 0.12, roofY - 0.25, 0.08, {
      ...iron,
      faces: {
        pz: { tile: o.poster, color: WHITE, rep: [1, 1], data: [2.0, 0] },
        nz: { tile: o.poster, color: WHITE, rep: [1, 1], data: [2.0, 0] },
      },
    });
  }
  // Bench facing the road
  const wood = { tile: T.wood_paint, color: [0.24, 0.3, 0.26], texScale: 0.5 };
  b.box(x1 - 0.32, 0.42, (z0 + z1) * 0.5, 0.36, 0.05, z1 - z0 - 0.5, wood);
  b.box(x1 - 0.16, 0.47, (z0 + z1) * 0.5, 0.05, 0.36, z1 - z0 - 0.5, wood);
  for (const bz of [z0 + 0.4, z1 - 0.4]) b.box(x1 - 0.3, 0, bz, 0.3, 0.42, 0.05, iron);

  // BUS flag at the curb
  const fx = curbX + 0.38;
  b.cylinderY(fx, -0.02, o.flagZ, 0.042, 0.036, 2.72, 8, iron);
  if (o.busSign) {
    b.box(fx, 2.38, o.flagZ, 0.08, 0.28, 0.68, {
      ...iron,
      faces: {
        nx: { tile: o.busSign, color: WHITE, rep: [1, 1], data: [2.0, 0] },
        px: { tile: o.busSign, color: WHITE, rep: [1, 1], data: [2.0, 0] },
      },
    });
  }

  // Notice board by the wall: two posts, a framed cork board with notices, a little roof
  if (o.noticeZ !== undefined) {
    const nz = o.noticeZ;
    const nx = -0.32;
    const frame = { tile: T.wood_paint, color: [0.22, 0.16, 0.12], texScale: 0.5 };
    for (const s of [-1, 1]) b.box(nx, 0, nz + s * 0.3, 0.06, 1.95, 0.06, iron);
    b.box(nx, 0.95, nz, 0.08, 0.86, 0.72, frame);
    b.quad([nx - 0.042, 1.01, nz - 0.3], [0, 0, 0.6], [0, 0.74, 0], {
      tile: T.white,
      color: [0.62, 0.48, 0.32],
    });
    const notes = [
      [-0.2, 1.42, 0.16, 0.22, [0.95, 0.93, 0.86]],
      [0.02, 1.48, 0.18, 0.16, [0.94, 0.86, 0.5]],
      [0.18, 1.2, 0.14, 0.2, [0.86, 0.9, 0.95]],
      [-0.16, 1.1, 0.2, 0.18, [0.95, 0.75, 0.7]],
    ];
    for (const [dz, ny, nw, nh, c] of notes) {
      b.quad([nx - 0.046, ny, nz + dz - nw * 0.5], [0, 0, nw], [0, nh, 0], {
        tile: T.white,
        color: c,
      });
    }
    b.box(nx - 0.04, 1.83, nz, 0.26, 0.05, 0.84, { tile: T.metal, color: [0.3, 0.44, 0.38] });
  }
  return [[z0 - 0.3, z1 + 0.3]];
}
