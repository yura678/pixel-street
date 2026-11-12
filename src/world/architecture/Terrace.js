/**
 * Café terrace in the frontage strip before a shop window – the Parisian bistro of № 148: wicker
 * chairs side by side facing the street, a little round marble table in front of each pair, and
 * the glazed menu case on its post by the door. Everything stays inside the 0.9 m strip along
 * the facade, clear of the walkway.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { BRASS_TRIM, CHARCOAL_IRON, WHITE } from './palette.js';
import { tube } from './primitives.js';

/** Rattan frame and the two-colour woven seat of a bistro chair. */
const RATTAN = [0.62, 0.45, 0.27];

/**
 * One wicker bistro chair facing −X (the street), `x, z` the centre of its seat: four legs, the
 * woven seat in a rattan rim, a curved hoop back with a woven panel and two arm loops.
 */
function buildBistroChair(atlas, b, x, z, weave) {
  const T = atlas.tiles;
  const cane = { tile: T.wood_paint, color: RATTAN, texScale: 0.3 };
  const seatY = 0.44;
  for (const sx of [-0.15, 0.15]) {
    for (const sz of [-0.15, 0.15]) b.box(x + sx, 0, z + sz, 0.03, seatY, 0.03, cane);
  }
  b.box(x, seatY - 0.04, z, 0.38, 0.04, 0.38, cane);
  b.box(x, seatY, z, 0.34, 0.03, 0.34, { tile: T.white, color: weave });
  // Hoop back: an arc of cane from one back leg over to the other, a woven panel inside it
  const bx = x + 0.17;
  const hoop = [
    [bx, seatY, z - 0.18],
    [bx + 0.02, seatY + 0.3, z - 0.17],
    [bx + 0.03, seatY + 0.42, z - 0.08],
    [bx + 0.03, seatY + 0.42, z + 0.08],
    [bx + 0.02, seatY + 0.3, z + 0.17],
    [bx, seatY, z + 0.18],
  ];
  for (let i = 0; i + 1 < hoop.length; i++) {
    tube(b, ...hoop[i], ...hoop[i + 1], 0.016, 0.016, 4, cane);
  }
  b.box(bx + 0.01, seatY + 0.06, z, 0.02, 0.32, 0.3, { tile: T.white, color: weave });
  // Arm loops from the hoop down to the front of the seat
  for (const s of [-1, 1]) {
    tube(
      b,
      bx + 0.02,
      seatY + 0.26,
      z + s * 0.17,
      x - 0.16,
      seatY + 0.2,
      z + s * 0.18,
      0.013,
      0.013,
      4,
      cane,
    );
    tube(
      b,
      x - 0.16,
      seatY + 0.2,
      z + s * 0.18,
      x - 0.17,
      seatY,
      z + s * 0.17,
      0.013,
      0.013,
      4,
      cane,
    );
  }
}

/** Little round bistro table: grey-veined marble top on a cast-iron column and tripod foot. */
function buildBistroTable(atlas, b, x, z) {
  const T = atlas.tiles;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  b.cylinderY(x, 0, z, 0.13, 0.1, 0.05, 8, iron);
  b.cylinderY(x, 0.05, z, 0.025, 0.025, 0.66, 6, iron, false);
  b.cylinderY(x, 0.68, z, 0.07, 0.07, 0.03, 6, iron, false);
  b.cylinderY(x, 0.71, z, 0.19, 0.19, 0.03, 12, {
    tile: T.wall_stone,
    color: [0.9, 0.89, 0.86],
    texScale: 0.6,
  });
  // A coffee cup on its saucer
  b.cylinderY(x + 0.05, 0.74, z + 0.05, 0.05, 0.05, 0.008, 8, { tile: T.white, color: WHITE });
  b.cylinderY(x + 0.05, 0.748, z + 0.05, 0.028, 0.035, 0.05, 8, { tile: T.white, color: WHITE });
}

/**
 * The terrace: for every pair (`pairs`: Z of the pair's middle) two chairs side by side against
 * the glass and their table in front, toward the street.
 *
 * @param {object} o `{ x: wall face, pairs: number[], weave: seat colour }`
 */
export function buildCafeTerrace(atlas, b, o) {
  const weave = o.weave ?? [0.62, 0.16, 0.14];
  for (const pz of o.pairs) {
    // Clear of the bulkhead cap behind them; the table top just over the seats' front edge
    for (const s of [-1, 1]) buildBistroChair(atlas, b, o.x - 0.4, pz + s * 0.22, weave);
    buildBistroTable(atlas, b, o.x - 0.7, pz);
  }
}

/**
 * Glazed menu case on a slim post beside the door, facing the street: a brass-edged frame, the
 * cream card with its lines of copperplate behind the glass and a little lamp over it.
 *
 * @param {object} o `{ x, z, frame: colour }`
 */
export function buildMenuCase(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z } = o;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const frame = { tile: T.wood_paint, color: o.frame ?? [0.3, 0.1, 0.12], texScale: 0.4 };
  b.cylinderY(x, 0, z, 0.12, 0.1, 0.04, 8, iron);
  b.cylinderY(x, 0.04, z, 0.025, 0.025, 1.0, 6, iron, false);
  b.box(x, 1.04, z, 0.07, 0.6, 0.46, frame);
  b.box(x - 0.036, 1.04, z, 0.004, 0.6, 0.47, { tile: T.metal, color: BRASS_TRIM });
  b.quad([x - 0.04, 1.09, z - 0.19], [0, 0, 0.38], [0, 0.5, 0], {
    tile: T.white,
    color: [0.93, 0.89, 0.8],
  });
  const ink = { tile: T.white, color: [0.22, 0.17, 0.15] };
  b.quad([x - 0.042, 1.5, z - 0.1], [0, 0, 0.2], [0, 0.03, 0], ink);
  for (let i = 0; i < 6; i++) {
    const lw = i % 2 ? 0.22 : 0.28;
    b.quad([x - 0.042, 1.42 - i * 0.05, z - lw * 0.5], [0, 0, lw], [0, 0.014, 0], ink);
  }
  // Lamp on a little arm over the case
  b.box(x - 0.06, 1.68, z, 0.12, 0.02, 0.02, iron);
  b.box(x - 0.12, 1.64, z, 0.07, 0.05, 0.12, { tile: T.bulb, color: WHITE, data: [0, 0] });
}
