/**
 * The pocket square of chunk 7 («Civic Plaza»), after Paley Park: a room raised four steps
 * above the sidewalk, paved in small granite setts, closed at the back by a plain brick garden
 * wall with two lanterns and a bench, two London planes on a 3.7 m grid (the street's own
 * trees, `StreetTrees.js`), light white wire chairs set about loosely round two small marble tables, stone
 * planters with low shrubs along the side walls – which are the neighbours' flanks – and two
 * stone planters at the entrance.
 *
 * Lot-local frame: the building line at x = 0, the square from z = −w/2 to w/2, Y up.
 */
import * as THREE from 'three/webgpu';
import { CHARCOAL_IRON, STONE_CORNICE, STONE_STEP } from './palette.js';
import { buildFloweringShrub } from './Greenery.js';
import { tube, withFrame } from './primitives.js';
import { buildBracketLantern } from './Services.js';
import { buildStreetTree } from './StreetTrees.js';

const RISE = 0.15;
const STEPS = 4;
const FLOOR = RISE * STEPS;

/**
 * The square's two planes (lot-local, standing on the raised floor): smaller than the
 * street's, their crowns clear of the flanks either side and of the back wall.
 * @param {number} back the back wall's front face
 */
export function squareTrees(back) {
  return [
    [2.3, -0.75, 0.31],
    [6.0, 0.8, 0.67],
  ]
    .filter(([tx]) => tx <= back - 1.0)
    .map(([x, z, seed]) => ({
      x,
      z,
      base: FLOOR,
      clear: 2.5,
      seed,
      crown: { x, y: 2.5 + 1.4 * 0.8, z, rx: 1.45, ry: 1.4, rz: 1.45 },
    }));
}

/**
 * @param {object} atlas facade atlas
 * @param {import('../MeshBuilder.js').MeshBuilder} b
 * @param {import('../MeshBuilder.js').MeshBuilder} pools
 * @param {import('../../core/random.js').Rng} rng
 * @param {{ w: number, depth: number }} o depth: the back wall's back face
 */
export function buildPocketSquare(atlas, b, pools, rng, o) {
  const T = atlas.tiles;
  const { w, depth } = o;
  const stone = { tile: T.wall_stone, color: STONE_STEP, texScale: 0.9 };
  const coping = { tile: T.wall_stone, color: STONE_CORNICE, texScale: 0.9 };
  const back = depth - 0.3;
  const sw = w - 0.01;

  // Four steps across the whole front, then the raised floor in small granite setts
  const run = 0.26;
  for (let k = 1; k <= STEPS; k++) {
    const xa = -run * (STEPS - k + 1);
    b.box(xa + run * 0.5, 0, 0, run, RISE * k, sw, { ...stone, faces: { ny: false } });
    b.box(xa + 0.02, RISE * k - 0.025, 0, 0.05, 0.025, sw, stone);
  }
  b.box(back * 0.5, 0, 0, back, FLOOR, sw, {
    ...stone,
    faces: {
      ny: false,
      nz: false,
      pz: false,
      py: { tile: T.cobble, color: [0.7, 0.68, 0.64], rep: [back / 0.55, sw / 0.55] },
    },
  });

  buildBackWall(atlas, b, pools, back, depth, w);

  // Stone planters: one each side of the entrance, long low ones along the side walls
  const planter = (x, z, lx, lz, h) => {
    b.box(x, FLOOR, z, lx, h, lz, coping);
    b.quad(
      [x - lx * 0.5 + 0.06, FLOOR + h + 0.005, z + lz * 0.5 - 0.06],
      [lx - 0.12, 0, 0],
      [0, 0, -(lz - 0.12)],
      {
        tile: T.dirt,
        color: [0.34, 0.27, 0.2],
      },
    );
  };
  for (const s of [-1, 1]) {
    const ez = s * (w * 0.5 - 0.45);
    planter(0.45, ez, 0.6, 0.6, 0.55);
    buildFloweringShrub(atlas, b, 0.45, FLOOR + 0.5, ez, 0.26, 0.42, 0.26, rng);
    const lz = s * (w * 0.5 - 0.3);
    planter((1.4 + back - 1.3) * 0.5, lz, back - 1.3 - 1.4, 0.42, 0.38);
    for (const sx of [1.9, 3.6, 5.3]) {
      if (sx > back - 1.5) continue;
      buildFloweringShrub(atlas, b, sx, FLOOR + 0.34, lz, 0.32, 0.36, 0.2, rng);
    }
  }

  // Two planes 3.7 m apart, each in an iron tree grate
  for (const tree of squareTrees(back)) {
    b.quad([tree.x - 0.5, FLOOR + 0.004, tree.z + 0.5], [1.0, 0, 0], [0, 0, -1.0], {
      tile: T.grate,
      color: [0.24, 0.24, 0.26],
      rep: [1, 1],
    });
    buildStreetTree(atlas, b, tree);
  }

  // Wire chairs pulled about two small marble tables
  const tables = [
    [1.5, 1.25],
    [4.3, -1.35],
  ];
  for (const [tx, tz] of tables) buildBistroTable(atlas, b, tx, tz, FLOOR);
  const chairs = [
    [1.0, 1.0, 0.4],
    [1.9, 1.75, -2.2],
    [1.75, 0.45, 2.6],
    [3.8, -1.7, 1.2],
    [4.85, -1.0, -2.6],
    [3.3, 0.2, 0.9],
  ];
  for (const [cx, cz, yaw] of chairs) {
    buildWireChair(atlas, b, cx, cz, yaw + rng.range(-0.3, 0.3), FLOOR);
  }
}

/**
 * The back of the square: a plain brick garden wall with a stone coping between the
 * neighbours' flanks, two lanterns on it (lit at dusk) and a slatted bench in front.
 */
function buildBackWall(atlas, b, pools, back, depth, w) {
  const T = atlas.tiles;
  const coping = { tile: T.wall_stone, color: STONE_CORNICE, texScale: 0.9 };
  const wallTop = FLOOR + 3.0;
  b.box((back + depth) * 0.5, 0, 0, depth - back, wallTop, w - 0.01, {
    tile: T.wall_brick,
    color: [0.52, 0.34, 0.26],
    texScale: 1.2,
    faces: { ny: false, nz: false, pz: false },
  });
  b.box((back + depth) * 0.5, wallTop, 0, depth - back + 0.1, 0.1, w - 0.01, coping);
  for (const lz of [-1.5, 1.5]) {
    buildBracketLantern(atlas, b, pools, back, lz, FLOOR + 1.9, FLOOR);
  }

  // Bench against the wall: two iron ends, a slatted seat and back
  const wood = { tile: T.wood_paint, color: [0.24, 0.32, 0.24], texScale: 0.5 };
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const bx = back - 0.4;
  const len = 2.2;
  for (const s of [-1, 1]) b.box(bx, FLOOR, s * (len * 0.5 - 0.15), 0.42, 0.44, 0.05, iron);
  for (const dx of [-0.13, 0, 0.13]) {
    b.box(bx + dx, FLOOR + 0.44, 0, 0.1, 0.04, len, wood);
  }
  for (const dy of [0.56, 0.72]) b.box(bx + 0.2, FLOOR + dy, 0, 0.04, 0.1, len, wood);
}

/** Small café table: cast-iron foot and stem under a round white marble top. */
function buildBistroTable(atlas, b, x, z, y0) {
  const T = atlas.tiles;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  b.cylinderY(x, y0, z, 0.2, 0.16, 0.04, 10, iron);
  b.cylinderY(x, y0 + 0.04, z, 0.03, 0.03, 0.66, 6, iron);
  b.cylinderY(x, y0 + 0.7, z, 0.3, 0.3, 0.04, 14, { tile: T.white, color: [0.9, 0.89, 0.86] });
}

const _m = new THREE.Matrix4();

/** White wire chair turned `yaw` about its centre: four legs, a round seat, a hooped back. */
function buildWireChair(atlas, b, x, z, yaw, y0) {
  const T = atlas.tiles;
  const wire = { tile: T.metal, color: [0.92, 0.92, 0.9] };
  _m.makeRotationY(yaw).setPosition(x, y0, z);
  withFrame(b, _m.clone(), () => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        tube(b, sx * 0.17, 0, sz * 0.17, sx * 0.15, 0.44, sz * 0.15, 0.012, 0.012, 4, wire);
      }
    }
    b.cylinderY(0, 0.44, 0, 0.22, 0.22, 0.03, 10, wire);
    // Hooped back over the rear half of the seat
    const n = 6;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI;
      const p = [0.19, 0.48 + Math.sin(t) * 0.36, Math.cos(t) * 0.19];
      if (prev) tube(b, ...prev, ...p, 0.012, 0.012, 4, wire);
      prev = p;
    }
    for (const dz of [-0.07, 0.07]) tube(b, 0.19, 0.47, dz, 0.19, 0.82, dz, 0.008, 0.008, 4, wire);
  });
}
