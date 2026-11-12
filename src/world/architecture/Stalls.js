/**
 * Sidewalk stalls: what a shop shows outside against its own glass – a bookshop's wooden cart
 * of books, a florist's stepped stand of buckets of cut flowers. Both stay within 0.9 m of the
 * wall, leaving the walkway clear.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { addLeafBlob } from './Greenery.js';
import { CHARCOAL_IRON, WHITE } from './palette.js';
import { tube } from './primitives.js';

/** A stall's back stands this far out from the wall, clear of the shopfront's frame. */
const STALL_BACK = 0.14;

/**
 * A bookseller's cart: a wooden trough on two legs at one end and two spoked wheels at the
 * other, a handle over the legs; inside, two rows of books standing spine-out, the back row on
 * a step so its spines show over the front one (`book_spines` tile, page tops in paper).
 *
 * @param {object} o `{ x: wall face, z: centre, len = 1.3, wood: colour }`
 */
export function buildBookCart(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z } = o;
  const L = o.len ?? 1.3;
  const D = 0.6;
  const xb = x - STALL_BACK;
  const xf = xb - D;
  const xc = xb - D * 0.5;
  const woodCol = o.wood ?? [0.46, 0.31, 0.2];
  const wood = { tile: T.wood, color: woodCol, texScale: 0.5 };
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const yFloor = 0.5;
  const zL = z - L * 0.5;
  const zR = z + L * 0.5;

  // Trough: floor, a low front board, a tall back board, end boards
  b.box(xc, yFloor, z, D, 0.06, L, wood);
  b.box(xf + 0.015, yFloor + 0.06, z, 0.03, 0.1, L, wood);
  b.box(xb - 0.015, yFloor + 0.06, z, 0.03, 0.38, L, wood);
  for (const ez of [zL + 0.015, zR - 0.015]) {
    b.box(xc, yFloor + 0.06, ez, D - 0.06, 0.3, 0.03, wood);
  }

  // Books: the front row on the floor, the back row on a step behind it
  const pages = { tile: T.white, color: [0.86, 0.82, 0.72] };
  const row = (x0, x1, y, h) => {
    const len = L - 0.06;
    b.box((x0 + x1) * 0.5, y, z, x1 - x0, h, len, {
      tile: T.white,
      color: [0.16, 0.11, 0.08],
      faces: {
        nx: { tile: T.book_spines, color: WHITE, rep: [Math.max(1, Math.round(len / h)), 1] },
        py: pages,
        ny: false,
      },
    });
  };
  row(xf + 0.03, xc, yFloor + 0.06, 0.2);
  b.box((xc + xb - 0.03) * 0.5, yFloor + 0.06, z, xb - 0.03 - xc, 0.1, L - 0.06, {
    ...wood,
    faces: { ny: false },
  });
  row(xc, xb - 0.03, yFloor + 0.16, 0.2);

  // Two legs under the right end, two wheels on an axle at the left end, the handle
  for (const lx of [xf + 0.05, xb - 0.05]) {
    b.box(lx, 0, zR - 0.07, 0.05, yFloor, 0.05, wood);
  }
  const wheelZ = zL + 0.2;
  const r = 0.21;
  for (const wx of [xf - 0.03, xb + 0.03]) {
    b.cylinderX(wx, r, wheelZ, r, 0.04, 12, { tile: T.wood, color: woodCol.map((c) => c * 0.7) });
    b.cylinderX(wx, r, wheelZ, 0.05, 0.07, 6, iron);
  }
  tube(b, xf - 0.03, r, wheelZ, xb + 0.03, r, wheelZ, 0.018, 0.018, 4, iron);
  b.box(xc, r - 0.02, wheelZ, D - 0.06, yFloor - r + 0.02, 0.05, wood);
  for (const hx of [xf + 0.06, xb - 0.06]) {
    tube(b, hx, yFloor + 0.3, zR, hx, yFloor + 0.42, zR + 0.22, 0.016, 0.016, 4, iron);
  }
  tube(
    b,
    xf + 0.06,
    yFloor + 0.42,
    zR + 0.22,
    xb - 0.06,
    yFloor + 0.42,
    zR + 0.22,
    0.02,
    0.02,
    6,
    wood,
  );
}

/** Cut flowers in the florist's buckets: one kind per bucket. */
const FLOWERS = Object.freeze([
  [0.84, 0.12, 0.16],
  [0.95, 0.56, 0.66],
  [0.98, 0.82, 0.3],
  [0.97, 0.95, 0.9],
  [0.76, 0.6, 0.9],
  [0.98, 0.55, 0.22],
  [0.45, 0.55, 0.92],
  [0.92, 0.36, 0.58],
]);
const STEMS = Object.freeze({
  top: [0.3, 0.5, 0.18],
  mid: [0.2, 0.36, 0.11],
  low: [0.1, 0.22, 0.06],
});

/**
 * A florist's stand of three steps along the glass, zinc buckets of cut flowers on every step –
 * each a cushion of leaves and stems with a crown of blooms of one kind (the technique of
 * `Greenery.buildFlowerBed`), the tallest at the back.
 *
 * @param {object} o `{ x: wall face, z0, z1, paint: colour of the stand }`
 */
export function buildFlowerStand(atlas, b, rng, o) {
  const T = atlas.tiles;
  const { x, z0, z1 } = o;
  const len = z1 - z0;
  if (len < 0.5) return;
  const cz = (z0 + z1) * 0.5;
  const xb = x - STALL_BACK;
  const run = 0.25;
  const stand = { tile: T.wood_paint, color: o.paint ?? [0.3, 0.36, 0.26], texScale: 0.5 };
  const zinc = { tile: T.metal, color: [0.6, 0.63, 0.64] };
  const n = Math.max(2, Math.floor(len / 0.3));
  for (let k = 0; k < 3; k++) {
    // Step k from the back: its top, its depth out from the wall
    const top = 0.74 - k * 0.22;
    const xa = xb - (k + 1) * run;
    b.box(xa + run * 0.5, 0, cz, run, top, len, {
      ...stand,
      faces: { ny: false, px: k === 0 ? undefined : false },
    });
    const bx = xa + run * 0.5;
    for (let i = 0; i < n; i++) {
      const bz = z0 + (len * (i + 0.5)) / n + (k % 2 ? 0.05 : -0.05) * (i % 2 ? 1 : -1);
      if (bz < z0 + 0.1 || bz > z1 - 0.1) continue;
      b.cylinderY(bx, top, bz, 0.085, 0.105, 0.2, 8, zinc);
      const seed = rng.next();
      const col = FLOWERS[Math.floor(seed * FLOWERS.length)];
      const stem = 0.2 + (2 - k) * 0.06 + rng.range(0, 0.05);
      const cy = top + stem;
      addLeafBlob(atlas, b, bx, cy, bz, 0.12, 0.11, 0.12, rng, STEMS, seed, 0.15, 0);
      const bloom = { top: col, mid: col.map((c) => c * 0.86), low: col.map((c) => c * 0.72) };
      for (let j = 0; j < 4; j++) {
        const a = seed * 6.28 + j * 1.57;
        const fr = rng.range(0.045, 0.06);
        addLeafBlob(
          atlas,
          b,
          bx + Math.cos(a) * 0.07,
          cy + 0.07 + (j % 2) * 0.03,
          bz + Math.sin(a) * 0.07,
          fr,
          fr * 0.85,
          fr,
          rng,
          bloom,
          seed,
          0.15,
          0,
        );
      }
    }
  }
}
