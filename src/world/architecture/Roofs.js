/**
 * Roofs: flat walk-up roof (parapets, scuttle, hatch, vents), Second Empire mansard with
 * dormers and cresting, Federal side-gabled roof with dormers and chimneys, front-gabled roof
 * (ridge back from the street), dormers, chimneys and the parapets of one-storey shops.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { clamp } from '../../core/math.js';
import { CHARCOAL_IRON, CHIMNEY_BRICK, STONE_CORNICE } from './palette.js';
import { archRing, arcZY, extrudeZY, orientedQuad, orientedTri, tube } from './primitives.js';
import { buildSashWindow } from './Windows.js';

/**
 * Standard flat roof of a walk-up: tar-and-gravel membrane, front and rear parapets with
 * coping, a roof scuttle over the stairwell, a skylight hatch and two plumbing vent
 * stacks. No chimneys: the houses are heated from a basement boiler. A one-storey shop
 * (`seg.roofKit === 'shop'`) has no stair to the roof: just the hatch and an extract fan.
 */
export function buildFlatRoof(atlas, b, facadeX, depth, h, cz, w, seg, stairZ, rng) {
  const T = atlas.tiles;
  const wallTile = seg.wallTile ?? T[`wall_${seg.wallStyle}`];
  const ts = seg.texScale ?? 1.4;
  const coping = { tile: T.wall_stone, color: STONE_CORNICE, texScale: 0.9 };

  // The membrane stops 1 cm inside the side walls and the back wall: its edges would otherwise
  // share a plane with the party-wall parapets, the cornice ends and the rear parapet. Only its
  // top is gravel: its edges are the walls carried up to the deck (from the street a strip of
  // gravel showed over the cornice)
  const deckEdge = { tile: wallTile, color: seg.color, texScale: ts };
  b.box(facadeX + (depth - 0.01) * 0.5, h, cz, depth - 0.01, 0.2, w - 0.02, {
    tile: T.roof_gravel,
    color: [0.52, 0.52, 0.54],
    texScale: 1.6,
    faces: { nx: deckEdge, px: deckEdge, nz: deckEdge, pz: deckEdge },
  });
  // Front parapet behind the cornice (unless `seg.frontParapet === false`), rear parapet with coping
  if (seg.frontParapet !== false) {
    b.box(facadeX + 0.34, h + 0.2, cz, 0.24, 0.34, w - 0.14, {
      tile: wallTile,
      color: seg.color,
      texScale: ts,
    });
  }
  // The rear parapet is the back wall carried up, past the membrane's edge
  b.box(facadeX + depth - 0.12, h, cz, 0.24, 0.62, w - 0.04, {
    tile: wallTile,
    color: seg.color,
    texScale: ts,
    faces: { ny: false },
  });
  b.box(facadeX + depth - 0.12, h + 0.62, cz, 0.32, 0.06, w, coping);

  if (seg.roofKit === 'shop') {
    const steel = { tile: T.metal, color: [0.42, 0.44, 0.46] };
    b.box(facadeX + depth * 0.62, h + 0.2, cz + w * 0.18, 0.85, 0.3, 0.85, steel);
    // Extract fan: a short curb, the drum and a mushroom cap
    const fx = facadeX + depth * 0.4;
    const fz = cz - w * 0.2;
    b.box(fx, h + 0.2, fz, 0.7, 0.14, 0.7, steel);
    b.cylinderY(fx, h + 0.34, fz, 0.26, 0.26, 0.34, 10, {
      tile: T.metal,
      color: [0.5, 0.52, 0.54],
    });
    b.cylinderY(fx, h + 0.74, fz, 0.38, 0.05, 0.14, 10, steel);
    b.cylinderY(fx, h + 0.68, fz, 0.06, 0.06, 0.06, 6, steel);
    return;
  }

  // Roof scuttle (stair access hatch) over the stairwell – a low curb with a steel lid,
  // so the street silhouette stays a clean cornice line. A big walk-up has a bulkhead instead:
  // the stair carried up through the roof in a brick hut with a door onto the deck
  const hz = clamp(stairZ, cz - w * 0.5 + 0.8, cz + w * 0.5 - 0.8);
  if (seg.bulkhead) {
    buildStairBulkhead(atlas, b, {
      ...seg.bulkhead,
      x: facadeX + (seg.bulkhead.back ?? 0.9),
      z: hz,
      y0: h + 0.2,
      wall: { tile: wallTile, color: seg.color, texScale: ts },
    });
  } else {
    b.box(facadeX + depth * 0.55, h + 0.2, hz, 1.0, 0.36, 0.95, {
      tile: wallTile,
      color: seg.color,
      texScale: ts,
    });
    b.box(facadeX + depth * 0.55, h + 0.56, hz, 1.08, 0.06, 1.03, {
      tile: T.metal,
      color: [0.4, 0.43, 0.45],
    });
  }

  // Roof hatch and vent stacks
  b.box(facadeX + depth * 0.3, h + 0.2, cz + w * 0.22, 0.85, 0.32, 0.85, {
    tile: T.metal,
    color: [0.42, 0.44, 0.46],
  });
  for (const [vx, vz] of [
    [facadeX + depth * 0.4, cz - w * 0.3],
    [facadeX + depth * 0.8, cz + w * 0.12 + rng.range(-0.3, 0.3)],
  ]) {
    b.cylinderY(vx, h + 0.2, vz, 0.07, 0.07, 0.95, 8, { tile: T.metal, color: [0.3, 0.31, 0.33] });
    b.cylinderY(vx, h + 1.15, vz, 0.11, 0.09, 0.08, 8, { tile: T.metal, color: [0.3, 0.31, 0.33] });
  }
}

/**
 * Pitched roof whose ridge runs back from the street (perpendicular to the facade): slopes
 * face ±Z, gable triangles at the front (`x0`) and back (`x1`). Behind stepped, neck and
 * Queen Anne gables; also the little roofs of dormers.
 */
export function buildGableRoofX(b, x0, x1, zc, w, y0, h, roofOpt, gableOpt = roofOpt) {
  const ts = roofOpt.texScale ?? 0.6;
  const slope = Math.hypot(w * 0.5, h);
  const rep = [Math.max((x1 - x0) / ts, 0.0001), Math.max(slope / ts, 0.0001)];
  // The slopes have no thickness: their undersides show from below the eaves
  const m = b.mark();
  for (const s of [-1, 1]) {
    const ze = zc + s * w * 0.5;
    orientedQuad(
      b,
      [x0, y0, ze],
      [x1, y0, ze],
      [x1, y0 + h, zc],
      [x0, y0 + h, zc],
      [0, w * 0.5, s * h],
      { ...roofOpt, rep },
    );
  }
  b.backFaces(m);
  if (gableOpt) {
    const gts = gableOpt.texScale ?? 1;
    for (const [gx, nx] of [
      [x0, -1],
      [x1, 1],
    ]) {
      orientedTri(
        b,
        [gx, y0, zc - w * 0.5],
        [gx, y0, zc + w * 0.5],
        [gx, y0 + h, zc],
        [0, 0],
        [w / gts, 0],
        [(w * 0.5) / gts, h / gts],
        [nx, 0, 0],
        gableOpt,
      );
    }
  }
}

/** Brick chimney stack with a corbelled cap and clay pots (Federal, Queen Anne). */
export function buildChimney(atlas, b, o) {
  const T = atlas.tiles;
  const brick = { tile: T.wall_brick, color: o.color ?? CHIMNEY_BRICK, texScale: 0.8 };
  const { x, z, y0, h } = o;
  const w = o.w ?? 0.5;
  const d = o.d ?? 0.8;
  b.box(x, y0, z, d, h, w, brick);
  b.box(x, y0 + h, z, d + 0.1, 0.1, w + 0.1, brick);
  b.box(x, y0 + h + 0.1, z, d + 0.02, 0.08, w + 0.02, brick);
  for (let i = 0; i < (o.pots ?? 2); i++) {
    const px = x - d * 0.25 + i * d * 0.5;
    b.cylinderY(px, y0 + h + 0.18, z, 0.09, 0.07, 0.3, 8, {
      tile: T.terracotta,
      color: [0.72, 0.42, 0.3],
    });
  }
}

/**
 * Dormer: a little vertical wall with a window standing out of a roof slope at `x`, its cheeks
 * running back into the roof. Heads: `pediment` (triangular, with its own small gable roof),
 * `segmental` (curved hood), `round` (half-round top).
 */
export function buildDormer(atlas, b, rng, o) {
  const T = atlas.tiles;
  const { x, z, w, y, h } = o;
  const depth = o.depth ?? 1.0;
  const trim = { tile: T.wall_stone, color: o.trim ?? STONE_CORNICE, texScale: 0.9 };
  const roof = o.roof ?? { tile: T.slate_rect, color: [0.42, 0.44, 0.48], texScale: 0.5 };
  b.box(x + depth * 0.5, y, z, depth, h, w, { ...trim, faces: { ny: false } });
  const ww = w - 0.34;
  const head = o.head ?? 'pediment';
  const lintel = head === 'round' ? 'arch' : head === 'segmental' ? 'segmental' : 'flat';
  const wh = head === 'round' ? h - 0.3 - ww * 0.5 : h - 0.36;
  buildSashWindow(atlas, b, x, z, y + 0.18, ww, Math.max(0.4, wh), rng, {
    lintel,
    trim: o.trim,
    ...o.win,
  });
  if (head === 'pediment') {
    const hw = w * 0.5 + 0.08;
    const ph = hw * 0.7;
    extrudeZY(
      b,
      x - 0.06,
      x + 0.06,
      [
        [z - hw, y + h],
        [z + hw, y + h],
        [z, y + h + ph],
      ],
      trim,
    );
    b.box(x + 0.018, y + h - 0.06, z, 0.164, 0.08, w + 0.18, trim);
    buildGableRoofX(b, x + 0.06, x + depth, z, w + 0.12, y + h, ph * 0.95, roof, null);
  } else {
    // Curved top: a half-round or segmental wall head and a low curved roof behind it
    const rise = head === 'round' ? w * 0.5 : w * 0.18;
    const r = ((w * 0.5) ** 2 + rise * rise) / (2 * rise);
    const th = Math.asin(Math.min(1, (w * 0.5) / r));
    const yc = y + h + rise - r;
    const arc = arcZY(z, yc, r, Math.PI * 0.5 - th, Math.PI * 0.5 + th, 8);
    extrudeZY(
      b,
      x - 0.02,
      x + depth,
      arc, // the chord between the arc's ends closes the polygon along the wall head
      roof,
      trim,
    );
    archRing(
      b,
      x - 0.08,
      x + 0.04,
      z,
      yc,
      r,
      r + 0.1,
      Math.PI * 0.5 - th,
      Math.PI * 0.5 + th,
      8,
      trim,
    );
  }
}

/**
 * Second Empire mansard: a steep lower slope (`h` high, leaning back `inset`) in slate bands,
 * a moulded curb, a shallow upper roof, dormers standing out of the lower slope and iron
 * cresting along the curb.
 *
 * @param {object} o `{ x, depth, cz, w, y0, h = 2.6, inset = 0.45, cap = 0.5, slate, bands:
 *   [{ from, to, tile, color }], curbColor, dormers: [{ z, w, h, sill, head, win }], cresting }`
 */
export function buildMansard(atlas, b, rng, o) {
  const T = atlas.tiles;
  const { x, depth, cz, w, y0 } = o;
  const h = o.h ?? 2.6;
  const inset = o.inset ?? 0.45;
  const z0 = cz - w * 0.5;
  const z1 = cz + w * 0.5;
  const slate = o.slate ?? { tile: T.slate_fishscale, color: [0.55, 0.58, 0.64] };
  const ts = 0.42;
  const slopeLen = Math.hypot(inset, h);
  const at = (f) => [x + inset * f, y0 + h * f];
  const bands = o.bands ?? [{ from: 0, to: 1, ...slate }];
  for (const band of bands) {
    const [xa, ya] = at(band.from);
    const [xb, yb] = at(band.to);
    const opt = {
      tile: band.tile ?? slate.tile,
      color: band.color ?? slate.color,
      rep: [w / ts, (slopeLen * (band.to - band.from)) / ts],
    };
    orientedQuad(b, [xa, ya, z0], [xa, ya, z1], [xb, yb, z1], [xb, yb, z0], [-h, inset, 0], opt);
  }
  // Back slope and the party-wall ends of the roof volume
  const xr = x + depth;
  orientedQuad(
    b,
    [xr, y0, z0],
    [xr, y0, z1],
    [xr - inset, y0 + h, z1],
    [xr - inset, y0 + h, z0],
    [h, inset, 0],
    { ...slate, rep: [w / ts, slopeLen / ts] },
  );
  const wall = { tile: T.wall_brick, color: o.wallColor ?? [0.55, 0.36, 0.28], texScale: 1.2 };
  for (const [ze, nz] of [
    [z0, -1],
    [z1, 1],
  ]) {
    orientedQuad(
      b,
      [x, y0, ze],
      [xr, y0, ze],
      [xr - inset, y0 + h, ze],
      [x + inset, y0 + h, ze],
      [0, 0, nz],
      { ...wall, rep: [depth / 1.2, h / 1.2] },
    );
  }
  // Curb moulding and the shallow upper roof
  const curb = { tile: T.wall_stone, color: o.curbColor ?? STONE_CORNICE, texScale: 0.9 };
  b.box(x + inset - 0.02, y0 + h - 0.08, cz, 0.16, 0.12, w + 0.04, curb);
  b.gableZ(
    x + inset,
    xr - inset,
    y0 + h,
    z0,
    z1,
    o.cap ?? 0.5,
    { tile: T.slate_rect, color: [0.4, 0.42, 0.46], texScale: 0.5 },
    wall,
  );

  for (const d of o.dormers ?? []) {
    const f = d.sill / h;
    buildDormer(atlas, b, rng, {
      ...d,
      x: x + inset * f - 0.08,
      y: y0 + d.sill,
      depth: inset + 0.4,
      trim: d.trim ?? o.curbColor,
    });
  }
  if (o.cresting) {
    const iron = { tile: T.metal, color: CHARCOAL_IRON };
    const yc = y0 + h + 0.04;
    b.box(x + inset, yc + 0.32, cz, 0.03, 0.03, w - 0.1, iron);
    for (let zz = z0 + 0.1; zz <= z1 - 0.1; zz += 0.18) {
      b.box(x + inset, yc, zz, 0.02, 0.3, 0.02, iron);
      b.box(x + inset, yc + 0.33, zz, 0.05, 0.06, 0.05, iron);
    }
    for (const zz of [z0 + 0.12, z1 - 0.12])
      b.cylinderY(x + inset, yc, zz, 0.05, 0.02, 0.62, 6, iron);
  }
}

/**
 * Federal side-gabled roof: ridge parallel to the street, the front slope with dormers rising
 * from the eave, a plain boxed cornice and chimneys standing on the party walls.
 *
 * @param {object} o `{ x, depth, cz, w, y0, h, roof, wallColor | wall (gable ends, MeshBuilder
 *   options), dormers: [{ z, w, h, head, win }], chimneys: [z…], flue: { z } – a steel flue
 *   (a shop's oven) up the back slope }`
 */
export function buildGableRoof(atlas, b, rng, o) {
  const T = atlas.tiles;
  const { x, depth, cz, w, y0, h } = o;
  const roof = o.roof ?? { tile: T.slate_rect, color: [0.36, 0.37, 0.4], texScale: 0.5 };
  const wall = o.wall ?? {
    tile: T.wall_brick,
    color: o.wallColor ?? [0.55, 0.3, 0.22],
    texScale: 1.2,
  };
  b.gableZ(x - 0.2, x + depth + 0.2, y0, cz - w * 0.5, cz + w * 0.5, h, roof, wall);
  const run = (depth + 0.4) * 0.5;
  // The eaves overhang the walls, so the slopes cross the facade and back wall planes above
  // the wall tops: the walls carry on up to them, or the sky shows through the roof space
  const knee = (h * 0.2) / run;
  const kts = wall.texScale ?? 1.2;
  for (const [kx, nx] of [
    [x, -1],
    [x + depth, 1],
  ]) {
    orientedQuad(
      b,
      [kx, y0, cz - w * 0.5],
      [kx, y0, cz + w * 0.5],
      [kx, y0 + knee, cz + w * 0.5],
      [kx, y0 + knee, cz - w * 0.5],
      [nx, 0, 0],
      { ...wall, rep: [w / kts, knee / kts] },
    );
  }
  for (const d of o.dormers ?? []) {
    const sill = 0.35;
    const dx = x - 0.2 + (run * sill) / h;
    buildDormer(atlas, b, rng, { ...d, x: dx + 0.15, y: y0 + sill, depth: run * 0.9, roof });
  }
  for (const zc of o.chimneys ?? []) {
    buildChimney(atlas, b, {
      x: x + depth * 0.5,
      z: zc,
      y0: y0 + h - 0.4,
      h: 1.2,
      w: 0.42,
      d: 0.9,
    });
  }
  if (o.flue) {
    // Insulated steel flue rising from the back slope past the ridge, with a rain cap
    const fx = x + depth * 0.78;
    const yRoof = y0 + (h * (x + depth + 0.2 - fx)) / run;
    const steel = { tile: T.metal, color: [0.56, 0.57, 0.58] };
    const yTop = y0 + h + 0.9;
    b.cylinderY(fx, yRoof - 0.3, o.flue.z, 0.13, 0.13, yTop - yRoof + 0.3, 8, steel);
    b.cylinderY(fx, yRoof - 0.02, o.flue.z, 0.2, 0.13, 0.14, 8, steel);
    for (const yb of [yRoof + 0.5, yTop - 0.35]) {
      b.cylinderY(fx, yb, o.flue.z, 0.145, 0.145, 0.05, 8, { tile: T.metal, color: CHARCOAL_IRON });
    }
    b.cylinderY(fx, yTop + 0.12, o.flue.z, 0.24, 0.02, 0.14, 8, steel);
    for (const s of [-1, 1])
      b.box(fx + s * 0.1, yTop, o.flue.z, 0.02, 0.13, 0.02, {
        tile: T.metal,
        color: CHARCOAL_IRON,
      });
  }
}

/**
 * Mushroom extract fan on a flat roof (a kitchen's): a curb, the drum and the domed cap over the
 * gap it breathes out of – all the street sees of the duct running up the back.
 */
export function buildExhaustFan(atlas, b, x, z, y) {
  const T = atlas.tiles;
  const steel = { tile: T.metal, color: [0.5, 0.52, 0.54] };
  b.box(x, y, z, 0.62, 0.16, 0.62, { tile: T.metal, color: [0.36, 0.37, 0.39] });
  b.cylinderY(x, y + 0.16, z, 0.22, 0.22, 0.42, 10, steel);
  b.cylinderY(x, y + 0.58, z, 0.12, 0.12, 0.08, 8, { tile: T.metal, color: CHARCOAL_IRON });
  b.cylinderY(x, y + 0.66, z, 0.42, 0.06, 0.2, 10, steel);
}

/**
 * Insulated steel flue of a kiln rising from a flat roof well above the parapet: a flashing
 * collar on the deck, dark bands where the sections join, a cone rain cap on three legs.
 */
export function buildKilnFlue(atlas, b, x, z, y0, top) {
  const T = atlas.tiles;
  const steel = { tile: T.metal, color: [0.6, 0.61, 0.62] };
  const band = { tile: T.metal, color: CHARCOAL_IRON };
  b.cylinderY(x, y0, z, 0.26, 0.16, 0.16, 8, { tile: T.metal, color: [0.38, 0.39, 0.4] });
  b.cylinderY(x, y0, z, 0.15, 0.15, top - y0, 8, steel);
  for (let yb = y0 + 0.7; yb < top - 0.3; yb += 0.9) {
    b.cylinderY(x, yb, z, 0.165, 0.165, 0.05, 8, band);
  }
  for (const [dx, dz] of [
    [0.1, 0],
    [-0.05, 0.09],
    [-0.05, -0.09],
  ]) {
    b.box(x + dx, top, z + dz, 0.02, 0.14, 0.02, band);
  }
  b.cylinderY(x, top + 0.12, z, 0.3, 0.02, 0.16, 8, steel);
}

/**
 * Tall Queen Anne chimney on a party wall: a brick shaft with a sunk panel on its street face,
 * two corbelled bands, a flared terracotta crown and three clay pots.
 *
 * @param {object} o `{ x, z, y0, top, w = 0.62, d = 1.0, color, crown: colour }`
 */
export function buildFancyChimney(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y0, top } = o;
  const w = o.w ?? 0.62;
  const d = o.d ?? 1.0;
  const brick = { tile: T.wall_brick, color: o.color ?? CHIMNEY_BRICK, texScale: 0.7 };
  const tc = { tile: T.terracotta, color: o.crown ?? [0.78, 0.44, 0.3], texScale: 0.4 };
  const shaftTop = top - 0.55;
  b.box(x, y0, z, d, shaftTop - y0, w, brick);
  // Corbelled bands, the lower one where the shaft clears the roof
  for (const yb of [y0 + (shaftTop - y0) * 0.45, shaftTop - 0.5]) {
    b.box(x, yb, z, d + 0.08, 0.08, w + 0.08, brick);
    b.box(x, yb + 0.08, z, d + 0.14, 0.08, w + 0.14, brick);
  }
  // A sunk panel in darker brick on the street face, between the bands
  const py0 = y0 + (shaftTop - y0) * 0.45 + 0.3;
  const py1 = shaftTop - 0.65;
  if (py1 - py0 > 0.3) {
    b.quad([x - d * 0.5 - 0.004, py0, z - w * 0.32], [0, 0, w * 0.64], [0, py1 - py0, 0], {
      ...brick,
      color: (o.color ?? CHIMNEY_BRICK).map((c) => c * 0.7),
      rep: [(w * 0.64) / 0.7, (py1 - py0) / 0.7],
    });
  }
  // Terracotta crown: a flared cap and the pots
  b.box(x, shaftTop, z, d + 0.18, 0.12, w + 0.18, tc);
  b.box(x, shaftTop + 0.12, z, d + 0.06, 0.1, w + 0.06, tc);
  for (const k of [-1, 0, 1]) {
    const px = x + k * d * 0.3;
    b.cylinderY(px, shaftTop + 0.22, z, 0.1, 0.08, 0.32, 8, tc);
    b.cylinderY(px, shaftTop + 0.54, z, 0.11, 0.11, 0.05, 8, tc);
  }
}

/** How far the two raised tiers of an Art Deco parapet stand above it (`SpecPlanner.topOf`). */
const DECO_RISE = Object.freeze([0.35, 0.7]);

/**
 * Front parapet of a one-storey taxpayer: `flat` with a stone coping, `stepped` (raised centre
 * with a date panel), `deco` (Art Deco ziggurat with flutes, terracotta) or `gable` (a low
 * triangle over the middle, `rise` high and `gableW` wide, coped along its rakes – a carriage
 * house).
 *
 * @param {object} o `{ x, cz, w, y0, h, profile, wall: MeshBuilder options, coping, panel,
 *   date: tile – the year on the stepped parapet's panel, frieze: colour – a terracotta band
 *   across the foot of the parapet, rise, gableW }`
 */
export function buildParapet(atlas, b, o) {
  const T = atlas.tiles;
  const { x, cz, w, y0, h } = o;
  const coping = { tile: T.wall_stone, color: o.coping ?? STONE_CORNICE, texScale: 0.9 };
  const wall = o.wall;
  if (o.frieze) {
    // Terracotta frieze: a moulded band with a row of small square blocks
    const tc = { tile: T.terracotta, color: o.frieze, texScale: 0.4 };
    b.box(x - 0.02, y0 + 0.06, cz, 0.04, 0.3, w - 0.02, tc);
    for (let z = cz - w * 0.5 + 0.25; z < cz + w * 0.5 - 0.2; z += 0.5) {
      b.box(x - 0.05, y0 + 0.13, z, 0.03, 0.16, 0.16, {
        ...tc,
        color: o.frieze.map((c) => c * 0.82),
      });
    }
  }
  const seg = (z0, z1, top) => {
    b.box(x + 0.15, y0, (z0 + z1) * 0.5, 0.3, top - y0, z1 - z0, { ...wall, faces: { ny: false } });
    b.box(x + 0.13, top, (z0 + z1) * 0.5, 0.38, 0.08, z1 - z0 + 0.04, coping);
  };
  const z0 = cz - w * 0.5;
  const z1 = cz + w * 0.5;
  if (o.profile === 'stepped') {
    const cw = w * 0.4;
    seg(z0, cz - cw * 0.5, y0 + h);
    seg(cz + cw * 0.5, z1, y0 + h);
    seg(cz - cw * 0.5, cz + cw * 0.5, y0 + h + 0.45);
    if (o.date) {
      // Terracotta tablet with the year (2:1), in a moulded frame
      const terracotta = { tile: T.terracotta, color: [0.86, 0.66, 0.52], texScale: 0.4 };
      b.box(x - 0.03, y0 + h - 0.36, cz, 0.06, 0.62, 1.18, terracotta);
      b.box(x - 0.07, y0 + h - 0.3, cz, 0.04, 0.5, 1.0, {
        ...terracotta,
        faces: { nx: { tile: o.date, color: [0.9, 0.7, 0.56], rep: [1, 1] } },
      });
    } else if (o.panel) {
      b.box(x - 0.02, y0 + h - 0.38, cz, 0.04, 0.5, cw * 0.7, {
        tile: T.terracotta,
        color: [0.86, 0.66, 0.52],
        texScale: 0.4,
      });
    }
  } else if (o.profile === 'deco') {
    // Art Deco crown: the parapet stepped up twice over the middle (side by side, never stacked,
    // so no two faces share a plane), three flutes cut down the top tier, and a coped pier at
    // each end; the terracotta face a shade lighter on the raised tiers
    const [r1, r2] = DECO_RISE;
    const w1 = w * 0.48;
    const w2 = w * 0.24;
    const lit = { ...wall, color: (wall.color ?? [1, 1, 1]).map((c) => Math.min(1, c * 1.06)) };
    const tier = (za, zb, top, opt) => {
      b.box(x + 0.15, y0, (za + zb) * 0.5, 0.3, top - y0, zb - za, {
        ...opt,
        faces: { ny: false },
      });
      b.box(x + 0.13, top, (za + zb) * 0.5, 0.38, 0.08, zb - za + 0.04, coping);
    };
    tier(z0, cz - w1 * 0.5, y0 + h, wall);
    tier(cz - w1 * 0.5, cz - w2 * 0.5, y0 + h + r1, lit);
    tier(cz - w2 * 0.5, cz + w2 * 0.5, y0 + h + r2, lit);
    tier(cz + w2 * 0.5, cz + w1 * 0.5, y0 + h + r1, lit);
    tier(cz + w1 * 0.5, z1, y0 + h, wall);
    // Flutes: dark channels with a lit fillet on their right edge, down the top tier to the
    // frieze course at the foot of the parapet
    const groove = { tile: T.white, color: (wall.color ?? [1, 1, 1]).map((c) => c * 0.5) };
    const fillet = { tile: T.white, color: (wall.color ?? [1, 1, 1]).map((c) => c * 1.1) };
    const fy0 = y0 + 0.2;
    const fy1 = y0 + h + r2 - 0.16;
    for (const k of [-1, 0, 1]) {
      const fz = cz + k * w2 * 0.28;
      b.quad([x - 0.003, fy0, fz - 0.045], [0, 0, 0.09], [0, fy1 - fy0, 0], groove);
      b.quad([x - 0.004, fy0, fz + 0.045], [0, 0, 0.02], [0, fy1 - fy0, 0], fillet);
    }
    // A moulded course across the foot of the parapet, and short chevrons on the lower steps
    b.box(x - 0.02, y0 + 0.06, cz, 0.04, 0.1, w - 0.02, coping);
    for (const s of [-1, 1]) {
      const zc = cz + s * (w1 + w2) * 0.25;
      for (let k = 0; k < 3; k++) {
        b.quad(
          [x - 0.003, y0 + h + r1 - 0.24 - k * 0.12, zc - 0.12],
          [0, 0, 0.24],
          [0, 0.05, 0],
          groove,
        );
      }
    }
  } else if (o.profile === 'gable') {
    seg(z0, z1, y0 + h);
    // The triangle stands on the coping; a coping strip runs up each rake to the apex
    const yb = y0 + h + 0.08;
    const rise = o.rise ?? 0.8;
    const hw = (o.gableW ?? w * 0.5) * 0.5;
    extrudeZY(
      b,
      x,
      x + 0.3,
      [
        [cz - hw, yb],
        [cz + hw, yb],
        [cz, yb + rise],
      ],
      wall,
    );
    for (const s of [-1, 1]) {
      extrudeZY(
        b,
        x - 0.05,
        x + 0.33,
        [
          [cz + s * (hw + 0.06), yb - 0.03],
          [cz, yb + rise - 0.03],
          [cz, yb + rise + 0.07],
          [cz + s * (hw + 0.06), yb + 0.07],
        ],
        coping,
      );
    }
  } else {
    seg(z0, z1, y0 + h);
  }
}

/**
 * Stair bulkhead of a big walk-up: the stair carried up through the roof in a brick hut, its
 * tar-paper shed roof falling to the back, a small window to the street, a steel door on its
 * side onto the deck. It stands behind the front parapet, its front at `x` (in the spec `back`
 * metres behind the facade).
 *
 * @param {object} o `{ x, z, y0: the deck, wall: MeshBuilder options, w = 2.4 (along the
 *   street), d = 2.3, h = 2.3 (front, over the deck), fall = 0.35 }`
 */
export function buildStairBulkhead(atlas, b, o) {
  const T = atlas.tiles;
  const w = o.w ?? 2.4;
  const d = o.d ?? 2.3;
  const hf = o.h ?? 2.3;
  const hb = hf - (o.fall ?? 0.35);
  const { x, z, y0 } = o;
  const z0 = z - w * 0.5;
  const z1 = z + w * 0.5;
  // Walls up to the back eave, then a wedge whose top falls from the front to the back (its
  // faces tiled at the wall's scale, nothing stretched)
  b.box(x + d * 0.5, y0, z, d, hb, w, { ...o.wall, faces: { ny: false, py: false } });
  const ts = o.wall.texScale ?? 1.2;
  const fh = hf - hb;
  b.prism(
    [x, y0 + hb, z1],
    [x + d, y0 + hb, z1],
    [x + d, y0 + hb, z0],
    [x, y0 + hb, z0],
    [x, y0 + hf, z1],
    [x + d, y0 + hb, z1],
    [x + d, y0 + hb, z0],
    [x, y0 + hf, z0],
    {
      ...o.wall,
      rep: [d / ts, fh / ts],
      faces: { px: false, py: false, ny: false, nx: { rep: [w / ts, fh / ts] } },
    },
  );
  // Tar-paper roof overhanging a little, a stone coping on the front wall
  const tar = { tile: T.roof_gravel, color: [0.3, 0.3, 0.32] };
  b.prism(
    [x - 0.06, y0 + hf, z1 + 0.06],
    [x + d + 0.1, y0 + hb, z1 + 0.06],
    [x + d + 0.1, y0 + hb, z0 - 0.06],
    [x - 0.06, y0 + hf, z0 - 0.06],
    [x - 0.06, y0 + hf + 0.06, z1 + 0.06],
    [x + d + 0.1, y0 + hb + 0.06, z1 + 0.06],
    [x + d + 0.1, y0 + hb + 0.06, z0 - 0.06],
    [x - 0.06, y0 + hf + 0.06, z0 - 0.06],
    { ...tar, rep: [2, 2] },
  );
  // A small window lighting the top landing, to the street: dark glass, a painted frame and a
  // cross bar, a stone sill
  const frame = { tile: T.wood_paint, color: [0.86, 0.84, 0.78], texScale: 0.5 };
  const wy = y0 + hb * 0.5;
  b.quad([x - 0.01, wy, z - 0.36], [0, 0, 0.72], [0, 0.6, 0], {
    tile: T.white,
    color: [0.12, 0.14, 0.17],
  });
  for (const [dy, hh] of [
    [-0.04, 0.05],
    [0.29, 0.03],
    [0.59, 0.05],
  ]) {
    b.box(x - 0.03, wy + dy, z, 0.05, hh, 0.8, frame);
  }
  for (const dz of [-0.38, 0, 0.38])
    b.box(x - 0.03, wy, z + dz, 0.05, 0.6, dz ? 0.05 : 0.03, frame);
  b.box(x - 0.06, wy - 0.1, z, 0.12, 0.06, 0.9, {
    tile: T.wall_stone,
    color: STONE_CORNICE,
    texScale: 0.9,
  });
  // Steel door on the left side, onto the deck: its frame, the leaf, a pull
  const steel = { tile: T.metal, color: [0.24, 0.3, 0.27] };
  const dx = x + d * 0.55;
  b.quad([dx + 0.5, y0, z0 - 0.004], [-1.0, 0, 0], [0, 2.05, 0], {
    tile: T.white,
    color: [0.08, 0.075, 0.07],
  });
  b.box(dx, y0, z0 - 0.025, 0.86, 1.98, 0.04, steel);
  b.box(dx - 0.32, y0 + 0.95, z0 - 0.06, 0.04, 0.14, 0.03, { tile: T.metal, color: CHARCOAL_IRON });
  b.box(dx, y0 + 2.02, z0 - 0.07, 1.1, 0.06, 0.12, steel);
}

/**
 * A wooden water tank on a steel stand, the landmark of a New York roof: steel dunnage beams on
 * the deck, four legs braced crosswise, a timber platform, the tub of cedar staves bound by steel
 * hoops, a conical roof with a finial and a ladder up the street side.
 *
 * @param {object} o `{ x, z (centre), y0 (deck), legs = 2.3 (stand height), r = 1.0, h = 2.2 }`
 */
export function buildWaterTank(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y0 } = o;
  const r = o.r ?? 1.0;
  const h = o.h ?? 2.2;
  const legs = o.legs ?? 2.3;
  const s = r * 0.72;
  const steel = { tile: T.metal, color: [0.27, 0.28, 0.29] };
  const cedar = { tile: T.wood_paint, color: [0.52, 0.44, 0.36], texScale: 0.8 };
  // Dunnage beams on the deck, the legs and their cross bracing
  for (const dz of [-s, s]) b.box(x, y0, z + dz, s * 2 + 0.8, 0.2, 0.16, steel);
  const top = y0 + 0.2 + legs;
  for (const dx of [-s, s]) {
    for (const dz of [-s, s]) b.box(x + dx, y0 + 0.2, z + dz, 0.1, legs, 0.1, steel);
  }
  const yb = y0 + 0.5;
  const yt = top - 0.25;
  for (const [ax, az, bx, bz] of [
    [-s, -s, s, -s],
    [-s, s, s, s],
    [-s, -s, -s, s],
    [s, -s, s, s],
  ]) {
    tube(b, x + ax, yb, z + az, x + bx, yt, z + bz, 0.025, 0.025, 4, steel);
    tube(b, x + ax, yt, z + az, x + bx, yb, z + bz, 0.025, 0.025, 4, steel);
  }
  for (const dz of [-s, s]) b.box(x, top - 0.18, z + dz, s * 2 + 0.2, 0.18, 0.12, steel);
  for (const dx of [-s, s]) b.box(x + dx, top - 0.177, z, 0.12, 0.18, s * 2 + 0.2, steel);
  // Timber platform under the tub
  b.box(x, top, z, r * 2 + 0.2, 0.12, r * 2 + 0.2, {
    tile: T.wood_paint,
    color: [0.36, 0.3, 0.25],
    texScale: 0.6,
  });
  // The tub: staves (the planks of the tile turned upright), steel hoops round it
  const y1 = top + 0.12;
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) * 0.5;
    const p0 = [x + Math.cos(a0) * r, y1, z + Math.sin(a0) * r];
    const p3 = [x + Math.cos(a1) * r, y1, z + Math.sin(a1) * r];
    const chord = Math.hypot(p3[0] - p0[0], p3[2] - p0[2]);
    orientedQuad(
      b,
      p0,
      [p0[0], y1 + h, p0[2]],
      [p3[0], y1 + h, p3[2]],
      p3,
      [Math.cos(am), 0, Math.sin(am)],
      { ...cedar, rep: [h / 0.8, chord / 0.8] },
    );
  }
  for (let k = 0; k < 5; k++) {
    const hy = y1 + 0.18 + k * ((h - 0.4) / 4);
    b.cylinderY(x, hy, z, r + 0.015, r + 0.015, 0.04, n, steel, false);
  }
  // Conical roof of boards, a finial on its point
  const roof = { tile: T.wood_paint, color: [0.4, 0.34, 0.28], texScale: 0.5 };
  b.cylinderY(x, y1 + h, z, r + 0.08, 0.06, 0.5, n, roof);
  b.cylinderY(x, y1 + h + 0.5, z, 0.05, 0.05, 0.14, 6, steel);
  b.cylinderY(x, y1 + h + 0.64, z, 0.08, 0.02, 0.1, 6, steel);
  // Ladder up the street side, from the deck past the platform to the eave
  const lx = x - r - 0.14;
  for (const dz of [-0.2, 0.2]) b.box(lx, y0 + 0.2, z + dz, 0.04, legs + h + 0.3, 0.04, steel);
  for (let y = y0 + 0.5; y < y1 + h; y += 0.3) b.box(lx, y, z, 0.03, 0.03, 0.4, steel);
  for (const dz of [-0.2, 0.2]) b.box(lx + 0.12, top + 0.4, z + dz, 0.24, 0.04, 0.04, steel);
}
