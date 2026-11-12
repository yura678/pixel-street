/**
 * Front gables standing above the eave line: the Dutch stepped gable (trapgevel), the neck
 * gable (halsgevel) with sandstone volutes and a pediment, and the projecting Queen Anne gable
 * hung with fish-scale shingles. Each brings its roof (ridge running back from the street), a
 * window in the gable, and – on the Dutch ones – the hoist beam of a canal house.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { CHARCOAL_IRON, STONE_CORNICE } from './palette.js';
import { arcZY, extrudeZY, orientedQuad, orientedTri, tube } from './primitives.js';
import { buildGableRoofX } from './Roofs.js';
import { buildSashWindow } from './Windows.js';

/** Timber hoist beam with an iron hook under the apex of a canal-house gable. */
function buildHoistBeam(atlas, b, x, z, y) {
  const T = atlas.tiles;
  b.box(x - 0.2, y, z, 0.62, 0.14, 0.14, { tile: T.wood, color: [0.3, 0.2, 0.14], texScale: 0.5 });
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  tube(b, x - 0.46, y, z, x - 0.46, y - 0.3, z, 0.012, 0.012, 4, iron);
  tube(b, x - 0.46, y - 0.3, z, x - 0.4, y - 0.38, z, 0.015, 0.015, 4, iron);
}

/** 3 × 5 pixel numerals of the wall anchors (rows top → bottom). */
const ANCHOR_DIGITS = Object.freeze({
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
});

/**
 * Wrought-iron wall anchors forming numerals (a building date on a Dutch gable): each lit row
 * of a digit is one bar standing on the brick. `z` is the centre of the group, `y` its foot.
 */
export function buildAnchorNumerals(atlas, b, x, z, y, text, px = 0.07) {
  const iron = { tile: atlas.tiles.metal, color: CHARCOAL_IRON };
  const dw = px * 3;
  const gap = px;
  const total = text.length * dw + (text.length - 1) * gap;
  [...text].forEach((ch, i) => {
    const rows = ANCHOR_DIGITS[ch];
    if (!rows) throw new Error(`No anchor numeral for "${ch}"`);
    const z0 = z - total * 0.5 + i * (dw + gap);
    rows.forEach((row, r) => {
      // Merge runs of lit pixels into one bar
      for (let c = 0; c < 3;) {
        if (row[c] !== '1') {
          c++;
          continue;
        }
        let e = c;
        while (e < 3 && row[e] === '1') e++;
        const ry = y + (4 - r) * px;
        b.box(x - 0.018, ry, z0 + (c + e) * 0.5 * px, 0.03, px, (e - c) * px, iron);
        c = e;
      }
    });
  });
}

/**
 * Dutch stepped gable: `steps` tiers narrowing to a finial, a stone coping on every tread, a
 * window in the gable, the hoist beam near the top and optionally the building date in iron
 * wall anchors either side of the window (`anchors: '1893'` – first half left, second right).
 * The roof behind (ridge running back) rises `roofH` (default 0.86 of the gable).
 *
 * @param {object} o `{ x, cz, w, y0, h, depth, steps = 5, wall, trim, roof, roofH, window: { y,
 *   w, h, lintel, lights }, hoist = true, anchors }`
 */
export function buildSteppedGable(atlas, b, rng, o) {
  const { x, cz, w, y0, h } = o;
  const steps = o.steps ?? 5;
  const coping = { tile: atlas.tiles.wall_stone, color: o.trim ?? STONE_CORNICE, texScale: 0.9 };
  buildGableRoofX(b, x + 0.34, x + o.depth, cz, w - 0.1, y0, o.roofH ?? h * 0.86, o.roof, o.wall);
  const th = h / (steps + 1);
  const widthAt = (k) => w * (1 - k / (steps + 1));
  for (let k = 0; k <= steps; k++) {
    const tw = k === steps ? Math.max(0.5, widthAt(k)) : widthAt(k);
    b.box(x + 0.17, y0 + k * th, cz, 0.34, th, tw, {
      ...o.wall,
      faces: { ny: k === 0 ? false : undefined },
    });
    const next = k === steps ? 0 : widthAt(k + 1);
    const tread = (tw - next) * 0.5;
    if (k < steps) {
      for (const s of [-1, 1]) {
        // Its soffit 3 mm over the step it caps
        b.box(
          x + 0.16,
          y0 + (k + 1) * th + 0.003,
          cz + s * (next * 0.5 + tread * 0.5),
          0.42,
          0.07,
          tread + 0.04,
          coping,
        );
      }
    } else {
      b.box(x + 0.16, y0 + (k + 1) * th, cz, 0.42, 0.08, tw + 0.06, coping);
    }
  }
  if (o.window) {
    buildSashWindow(atlas, b, x, cz, y0 + o.window.y, o.window.w, o.window.h, rng, o.window);
  }
  if (o.anchors && o.window) {
    const half = o.anchors.length >> 1;
    const ww = o.window.w;
    const ay = y0 + o.window.y + o.window.h * 0.5 - 0.17;
    const off = ww * 0.5 + 0.2 + half * 0.14;
    buildAnchorNumerals(atlas, b, x, cz - off, ay, o.anchors.slice(0, half));
    buildAnchorNumerals(atlas, b, x, cz + off, ay, o.anchors.slice(half));
  }
  if (o.hoist !== false) buildHoistBeam(atlas, b, x, cz, y0 + h - th * 0.6);
}

/** Width of the sandstone coping round a neck gable's shoulders. */
const NECK_COPING = 0.16;

/**
 * Rise of the roof behind a neck gable: its ridge runs back from the street, and its front
 * triangle must stay hidden behind the gable's outline – the slopes pass under the shoulders,
 * which reach the neck at `shoulderH`, so the roof can rise no higher than the line from the
 * eave corner to the top of a shoulder allows (and stays under the neck's top).
 */
export function neckGableRoofH(w, o) {
  const rw = w - 0.1;
  return Math.min(o.shoulderH + o.neckH - 0.2, (o.shoulderH * rw) / (rw - o.neckW) - 0.04);
}

/**
 * Neck gable: a narrow neck one bay wide rising from the eave, flanked at its foot by two
 * shoulders – brick quarter ellipses under a sandstone coping ending in scrolls (the claw pieces
 * filling the corners over the roof slopes) – crowned by a small pediment; window and hoist
 * beam in the neck. The roof behind (`neckGableRoofH`) hides behind the outline.
 *
 * @param {object} o `{ x, cz, w, y0, depth, neckW, neckH, shoulderH, pedH, wall, trim, roof,
 *   window, hoist = true }`
 */
export function buildNeckGable(atlas, b, rng, o) {
  const { x, cz, w, y0 } = o;
  const nw = o.neckW;
  const sh = o.shoulderH;
  const top = y0 + sh + o.neckH;
  const sand = { tile: atlas.tiles.wall_stone, color: o.trim ?? STONE_CORNICE, texScale: 0.9 };
  buildGableRoofX(b, x + 0.34, x + o.depth, cz, w - 0.1, y0, neckGableRoofH(w, o), o.roof, o.wall);
  // Neck, with sandstone strips up its edges
  b.box(x + 0.15, y0, cz, 0.3, top - y0, nw, { ...o.wall, faces: { ny: false } });
  for (const s of [-1, 1])
    b.box(x + 0.12, y0, cz + s * (nw * 0.5 - 0.06), 0.3, top - y0, 0.14, sand);
  // Shoulders: the brick of the front carried up in a quarter ellipse each side, edged by a
  // sandstone coping a little proud of it that curls into a scroll at the eave and another
  // against the neck (the claw pieces)
  const sw = (w - nw) * 0.5 - 0.05;
  const band = NECK_COPING;
  for (const s of [-1, 1]) {
    const zc = cz + s * nw * 0.5;
    const quarter = (rz, ry) =>
      arcZY(0, 0, 1, s < 0 ? Math.PI : 0, Math.PI * 0.5, 8).map(([cx, cy]) => [
        zc + cx * rz,
        y0 + cy * ry,
      ]);
    const outer = quarter(sw, sh);
    const inner = quarter(sw - band, sh - band);
    extrudeZY(b, x, x + 0.28, [[zc, y0], ...inner], o.wall);
    for (let i = 0; i + 1 < outer.length; i++) {
      extrudeZY(b, x - 0.03, x + 0.3, [outer[i], outer[i + 1], inner[i + 1], inner[i]], sand);
    }
    b.cylinderX(x - 0.03, y0 + 0.17, zc + s * (sw - 0.17), 0.17, 0.08, 10, sand);
    b.cylinderX(x - 0.03, y0 + sh - 0.12, zc + s * 0.14, 0.12, 0.08, 10, sand);
  }
  // Pediment on a cornice
  b.box(x + 0.1, top, cz, 0.4, 0.1, nw + 0.24, sand);
  const hw = nw * 0.5 + 0.12;
  extrudeZY(
    b,
    x - 0.02,
    x + 0.3,
    [
      [cz - hw, top + 0.1],
      [cz + hw, top + 0.1],
      [cz, top + 0.1 + (o.pedH ?? 0.6)],
    ],
    sand,
  );
  if (o.window)
    buildSashWindow(atlas, b, x, cz, y0 + o.window.y, o.window.w, o.window.h, rng, o.window);
  if (o.hoist !== false) buildHoistBeam(atlas, b, x, cz, top - 0.32);
}

/**
 * Queen Anne front gable: a triangle projecting `overhang` over the wall, hung with fish-scale
 * shingles, framed by bargeboards, with a small loggia (dark opening, balusters, corner posts)
 * or a window.
 *
 * @param {object} o `{ x, cz, w, y0, h, depth, overhang = 0.3, shingle, trim, roof, loggia,
 *   window, wall }` – `wall`: MeshBuilder options of the side and back walls of the roof space
 */
export function buildQueenAnneGable(atlas, b, rng, o) {
  const T = atlas.tiles;
  const { x, cz, w, y0, h } = o;
  const ov = o.overhang ?? 0.3;
  const xf = x - ov;
  const trim = { tile: T.wood_paint, color: o.trim ?? [0.86, 0.84, 0.76], texScale: 0.5 };
  const rw = w + 0.5;
  const rh = h + 0.25;
  buildGableRoofX(b, xf - 0.12, x + o.depth, cz, rw, y0 - 0.1, rh, o.roof, null);
  // The roof's eaves overhang the side walls: at the wall planes its slopes stand `ys` over the
  // wall tops. The shingled gable front fills the whole of the roof's section down to the wall
  // head (no slot of sky under the rakes); behind it the side walls carry on up to the slopes
  // and the back wall closes the roof space with a gable of its own.
  // (1.5 cm under the slopes: the gable's rake strips would otherwise lie in their planes)
  const ys = y0 - 0.1 + (rh * (rw - w)) / rw - 0.015;
  const apex = y0 - 0.1 + rh - 0.015;
  const section = [
    [cz - w * 0.5, y0],
    [cz + w * 0.5, y0],
    [cz + w * 0.5, ys],
    [cz, apex],
    [cz - w * 0.5, ys],
  ];
  extrudeZY(b, xf, x, section, o.shingle);
  if (o.wall) {
    const wts = o.wall.texScale ?? 1.2;
    const xb = x + o.depth;
    for (const s of [-1, 1]) {
      const zs = cz + s * w * 0.5;
      orientedQuad(b, [x, y0, zs], [xb, y0, zs], [xb, ys, zs], [x, ys, zs], [0, 0, s], {
        ...o.wall,
        rep: [o.depth / wts, (ys - y0) / wts],
      });
    }
    const uv = (z, y) => [(z - cz + w * 0.5) / wts, (y - y0) / wts];
    for (let i = 1; i + 1 < section.length; i++) {
      const [p, q, r] = [section[0], section[i], section[i + 1]];
      orientedTri(
        b,
        [xb, p[1], p[0]],
        [xb, q[1], q[0]],
        [xb, r[1], r[0]],
        uv(...p),
        uv(...q),
        uv(...r),
        [1, 0, 0],
        o.wall,
      );
    }
  }
  b.box(xf + ov * 0.5, y0 - 0.12, cz, ov, 0.12, w, trim);
  // Bargeboards along both rakes and a finial at the apex
  for (const s of [-1, 1]) {
    tube(
      b,
      xf - 0.06,
      y0 - 0.06,
      cz + s * (w * 0.5 + 0.2),
      xf - 0.06,
      y0 + h + 0.12,
      cz,
      0.07,
      0.07,
      4,
      trim,
    );
  }
  b.cylinderY(xf - 0.06, y0 + h + 0.08, cz, 0.06, 0.02, 0.5, 6, trim);
  if (o.loggia) {
    const lw = w * 0.42;
    const ly = y0 + 0.25;
    const lh = Math.min(1.6, h * 0.48);
    b.quad([xf - 0.005, ly, cz - lw * 0.5], [0, 0, lw], [0, lh, 0], {
      tile: T.white,
      color: [0.08, 0.07, 0.07],
    });
    b.box(xf - 0.04, ly, cz, 0.12, 0.06, lw + 0.1, trim);
    b.box(xf - 0.04, ly + 0.7, cz, 0.1, 0.05, lw + 0.06, trim);
    for (let bz = cz - lw * 0.5 + 0.12; bz < cz + lw * 0.5 - 0.06; bz += 0.16) {
      b.cylinderY(xf - 0.04, ly + 0.06, bz, 0.035, 0.035, 0.64, 6, trim);
    }
    for (const s of [-1, 1]) {
      b.box(xf - 0.04, ly + 0.003, cz + s * (lw * 0.5 + 0.03), 0.12, lh - 0.003, 0.1, trim);
    }
    b.box(xf - 0.04, ly + lh, cz, 0.14, 0.1, lw + 0.2, trim);
  } else if (o.window) {
    buildSashWindow(atlas, b, xf, cz, y0 + o.window.y, o.window.w, o.window.h, rng, o.window);
  }
}
