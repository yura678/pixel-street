/**
 * Service alley between two flank facades («Clean Open Alleyway», chunk 5): granite setts
 * falling gently to a shallow channel down the middle with a drain grate, the courtyard wall
 * with a double timber gate closing the far end, two lidded bins against the wall and a string
 * of warm festoon lights zigzagging between the flanks at the third storey. The flanks
 * themselves – windows, the fire escape, the back door and its lamp – belong to the houses.
 *
 * Lot-local frame: the building line at x = 0, the alley from z = −w/2 to w/2, Y up.
 */
import { CHARCOAL_IRON, STONE_CORNICE, WHITE } from './palette.js';
import { orientedQuad, tube } from './primitives.js';

const SETT = 1.4;
const BIN_GREEN = [0.17, 0.33, 0.21];
/**
 * Hooks of the festoon, `[metres back, flank]` (−1 left, 1 right), strung in order: they zigzag
 * between the flank windows of № 130 and № 132 and keep clear of № 130's fire escape.
 */
const FESTOON = Object.freeze([
  [1.8, -1],
  [4.2, 1],
  [9.6, -1],
  [12.2, 1],
]);

/**
 * @param {object} atlas facade atlas
 * @param {import('../MeshBuilder.js').MeshBuilder} b
 * @param {import('../MeshBuilder.js').MeshBuilder} pools
 * @param {object} o `{ w, depth, wallH = 3.0, gateW = 2.2, lightsY = 7.3,
 *   strands = FESTOON: [[metres back, -1 | 1], …] – festoon hooks, joined in order }`
 */
export function buildServiceAlley(atlas, b, pools, o) {
  const T = atlas.tiles;
  const { w, depth } = o;
  const x0 = -0.45;
  const zl = -w * 0.5 + 0.01;
  const zr = w * 0.5 - 0.01;
  const ch = 0.22;

  // Paving: two cambered halves falling to the channel, the channel in darker setts
  for (const [za, zb] of [
    [zl, -ch],
    [zr, ch],
  ]) {
    orientedQuad(
      b,
      [x0, 0.032, za],
      [depth, 0.032, za],
      [depth, 0.018, zb],
      [x0, 0.018, zb],
      [0, 1, 0],
      {
        tile: T.cobble,
        color: [0.78, 0.75, 0.71],
        rep: [(depth - x0) / SETT, Math.abs(zb - za) / SETT],
      },
    );
  }
  orientedQuad(
    b,
    [x0, 0.012, -ch],
    [depth, 0.012, -ch],
    [depth, 0.012, ch],
    [x0, 0.012, ch],
    [0, 1, 0],
    { tile: T.cobble, color: [0.56, 0.55, 0.53], rep: [(depth - x0) / 0.7, (ch * 2) / 0.7] },
  );
  // Drain grate in the channel, a little past the middle
  const gx = depth * 0.55;
  orientedQuad(
    b,
    [gx - 0.3, 0.016, -0.24],
    [gx + 0.3, 0.016, -0.24],
    [gx + 0.3, 0.016, 0.24],
    [gx - 0.3, 0.016, 0.24],
    [0, 1, 0],
    { tile: T.grate, color: [0.3, 0.3, 0.32], rep: [1, 1] },
  );

  buildCourtyardWall(atlas, b, depth, w, o.wallH ?? 3.0, o.gateW ?? 2.2);

  // Two wheelie bins against the wall, left of the gate
  for (const bz of [-w * 0.5 + 0.62, -w * 0.5 + 1.4]) buildBin(atlas, b, depth - 0.62, bz);

  buildFestoon(atlas, b, pools, w, o.lightsY ?? 7.3, o.strands ?? FESTOON);
}

/** Brick courtyard wall across the far end with coping, brick gate piers and a timber gate. */
function buildCourtyardWall(atlas, b, depth, w, wallH, gateW) {
  const T = atlas.tiles;
  const brick = { tile: T.wall_brick, color: [0.46, 0.3, 0.24], texScale: 1.2 };
  const coping = { tile: T.wall_stone, color: STONE_CORNICE, texScale: 0.9 };
  const xc = depth - 0.15;
  const pier = 0.5;
  const g0 = -gateW * 0.5;
  const g1 = gateW * 0.5;
  for (const [za, zb] of [
    [-w * 0.5 + 0.003, g0 - pier],
    [g1 + pier, w * 0.5 - 0.003],
  ]) {
    b.box(xc, 0, (za + zb) * 0.5, 0.3, wallH, zb - za, { ...brick, faces: { ny: false } });
    b.box(xc, wallH, (za + zb) * 0.5, 0.38, 0.08, zb - za, coping);
  }
  for (const pz of [g0 - pier * 0.5, g1 + pier * 0.5]) {
    b.box(xc, 0, pz, 0.42, wallH + 0.3, pier, { ...brick, faces: { ny: false } });
    b.box(xc, wallH + 0.3, pz, 0.52, 0.1, pier + 0.1, coping);
    b.box(xc, wallH + 0.4, pz, 0.3, 0.12, pier - 0.12, coping);
  }
  // Two ledged gate leaves of painted boards, iron straps, a gap under them
  const paint = { tile: T.wood_paint, color: [0.16, 0.26, 0.2], texScale: 0.6 };
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const gh = 2.5;
  for (const s of [-1, 1]) {
    const lz = s * gateW * 0.25;
    const lw = gateW * 0.5 - 0.03;
    b.box(xc, 0.06, lz, 0.08, gh, lw, paint);
    for (let k = 1; k < 6; k++) {
      const bz = lz - lw * 0.5 + (lw * k) / 6;
      b.quad([xc - 0.044, 0.06, bz - 0.006], [0, 0, 0.012], [0, gh, 0], {
        tile: T.white,
        color: [0.09, 0.13, 0.1],
      });
    }
    for (const sy of [0.45, gh - 0.4]) b.box(xc - 0.05, sy, lz, 0.02, 0.07, lw - 0.1, iron);
  }
  b.box(xc - 0.06, 1.15, 0, 0.04, 0.12, 0.05, iron);
}

/** Lidded wheelie bin, the handle and wheels toward the wall (`x` is its centre). */
function buildBin(atlas, b, x, z) {
  const T = atlas.tiles;
  const body = { tile: T.metal, color: BIN_GREEN };
  const hx0 = 0.27;
  const hz0 = 0.3;
  const hx1 = 0.3;
  const hz1 = 0.34;
  const y1 = 0.92;
  b.prism(
    [x - hx0, 0.06, z + hz0],
    [x + hx0, 0.06, z + hz0],
    [x + hx0, 0.06, z - hz0],
    [x - hx0, 0.06, z - hz0],
    [x - hx1, y1, z + hz1],
    [x + hx1, y1, z + hz1],
    [x + hx1, y1, z - hz1],
    [x - hx1, y1, z - hz1],
    body,
  );
  b.box(x - 0.01, y1, z, hx1 * 2 + 0.06, 0.06, hz1 * 2 + 0.04, {
    tile: T.metal,
    color: BIN_GREEN.map((c) => c * 0.75),
  });
  b.box(x + hx1 + 0.04, y1 - 0.08, z, 0.05, 0.05, hz1 * 2 - 0.1, {
    tile: T.metal,
    color: CHARCOAL_IRON,
  });
  for (const s of [-1, 1]) {
    b.cylinderX(x + hx0 - 0.04, 0.08, z + s * (hz0 - 0.02), 0.08, 0.05, 8, {
      tile: T.white,
      color: [0.1, 0.1, 0.11],
    });
  }
}

/**
 * Festoon lights strung from flank to flank: a sagging wire between wall hooks with a warm bulb
 * every 0.45 m (lit at dusk), and a faint warm wash on the setts below at night.
 */
function buildFestoon(atlas, b, pools, w, y, strands) {
  const T = atlas.tiles;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const wire = { tile: T.white, color: [0.08, 0.08, 0.09] };
  const pt = ([at, side]) => [at, y, side * (w * 0.5 - 0.02)];
  for (const p of strands) {
    const [hx, hy, hz] = pt(p);
    b.box(hx, hy - 0.04, hz - Math.sign(hz) * 0.05, 0.04, 0.08, 0.1, iron);
  }
  for (let i = 0; i + 1 < strands.length; i++) {
    const a = pt(strands[i]);
    const c = pt(strands[i + 1]);
    const len = Math.hypot(c[0] - a[0], c[2] - a[2]);
    const sag = Math.min(0.55, len * 0.07);
    const at = (t) => [
      a[0] + (c[0] - a[0]) * t,
      a[1] - sag * 4 * t * (1 - t),
      a[2] + (c[2] - a[2]) * t,
    ];
    const segs = 8;
    for (let k = 0; k < segs; k++) {
      const p0 = at(k / segs);
      const p1 = at((k + 1) / segs);
      tube(b, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.008, 0.008, 4, wire);
    }
    const bulbs = Math.max(2, Math.round(len / 0.45));
    for (let k = 1; k < bulbs; k++) {
      const [bx, by, bz] = at(k / bulbs);
      b.box(bx, by - 0.02, bz, 0.012, 0.03, 0.012, wire);
      b.box(bx, by - 0.11, bz, 0.06, 0.09, 0.06, { tile: T.bulb, color: WHITE, data: [0, 0] });
    }
    // A soft warm patch on the setts under the middle of the strand (night only)
    const mx = (a[0] + c[0]) * 0.5;
    const mz = (a[2] + c[2]) * 0.5;
    pools.quad([mx - 1.3, 0.04, mz - 1.3], [2.6, 0, 0], [0, 0, 2.6], {
      color: [0.24, 0.17, 0.09],
      data: [0.2, 0],
    });
  }
}
