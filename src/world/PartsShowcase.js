/**
 * Parts showcase (`?debug=parts`): the architectural parts library laid out on stands along
 * the sidewalk instead of the houses, so every part can be reviewed in the real renderer
 * before it goes on a building. Each stand is a plain backdrop block with one family of parts
 * in front of it; `stands` lists their world Z spans for cameras and review shots.
 */
import * as THREE from 'three/webgpu';
import { Rng } from '../core/random.js';
import { createLightPoolMaterial, createStreetAtlasMaterial } from './AtlasMaterial.js';
import { MeshBuilder } from './MeshBuilder.js';
import { BUILDING_LINE_X, CURB_H } from '../config/streetProfile.js';
import { buildBay } from './architecture/Bays.js';
import { buildCornice } from './architecture/Cornices.js';
import { buildDoorway } from './architecture/Doors.js';
import { buildNeckGable, buildQueenAnneGable, buildSteppedGable } from './architecture/Gables.js';
import { FABRICS, STONE_CORNICE, WHITE } from './architecture/palette.js';
import { buildPartyWall } from './architecture/PartyWall.js';
import { buildGableRoof, buildMansard, buildParapet } from './architecture/Roofs.js';
import { buildAreaway, buildStoop } from './architecture/Stoops.js';
import { buildSashWindow } from './architecture/Windows.js';
import { HOUSE_NUMBERS } from '../textures/PixelCanvas.js';
import { SHOP_SIGNS } from '../config/palettes.js';

const START_Z = 6;
const GAP = 3;

const BRICK_RED = [0.62, 0.34, 0.25];
const BRICK_ORANGE = [0.74, 0.42, 0.28];
const BRICK_BROWN = [0.42, 0.27, 0.2];
const BROWNSTONE = [0.5, 0.34, 0.27];
const LIMESTONE = [0.86, 0.82, 0.72];
const GREEN_PAINT = [0.16, 0.3, 0.22];

/** Stand list: id, label, width (m), height of the tallest part (m) and its builder. */
const STANDS = [
  { id: 'windows', label: 'Windows: lights and heads', w: 12, h: 7.4, build: windowsStand },
  { id: 'doorways', label: 'Doorways and surrounds', w: 12, h: 4.8, build: doorwaysStand },
  { id: 'stoops', label: 'Stoops and areaway', w: 12, h: 5.2, build: stoopsStand },
  { id: 'bays', label: 'Bays and oriels', w: 12, h: 9.6, build: baysStand },
  { id: 'mansard', label: 'Mansard with dormers', w: 7, h: 12.8, build: mansardStand },
  { id: 'gableRoof', label: 'Federal gable roof', w: 7, h: 9.6, build: gableRoofStand },
  { id: 'steppedGable', label: 'Stepped gable', w: 6.5, h: 16.6, build: steppedGableStand },
  { id: 'neckGable', label: 'Neck gable', w: 6.5, h: 17, build: neckGableStand },
  { id: 'queenAnne', label: 'Queen Anne gable', w: 6, h: 13, build: queenAnneStand },
  { id: 'cornices', label: 'Cornices', w: 12, h: 7.2, build: cornicesStand },
  { id: 'partyWall', label: 'Party wall', w: 10, h: 13.4, build: partyWallStand },
  { id: 'parapets', label: 'Shop parapets', w: 12, h: 5.8, build: parapetsStand },
  { id: 'atlas', label: 'Signs, plaques, materials', w: 16, h: 5.6, build: atlasStand },
];

/** Backdrop block from the sidewalk line back `depth` metres. */
function block(b, z0, z1, h, opt, depth = 6) {
  b.box(depth * 0.5, 0, (z0 + z1) * 0.5, depth, h, z1 - z0, { ...opt, faces: { ny: false } });
}
const mat = (T, tile, color, texScale = 1.2) => ({ tile: T[tile], color, texScale });

function windowsStand(A, b, _pools, rng) {
  const T = A.tiles;
  block(b, -6, 6, 7.4, mat(T, 'wall_brick', BRICK_RED));
  const zs = [-5, -3, -1, 1, 3, 5];
  const lower = [
    { lights: '1/1' },
    { lights: '2/2', lintel: 'flat', glazing: 'curtain', fabric: FABRICS.plum, lit: true },
    { lights: '6/6', lintel: 'hood', shutters: GREEN_PAINT },
    { lights: '6/9', lintel: 'keystone', wh: 1.8 },
    { lights: 'cross', lintel: 'flat', glazing: 'sheer', fabric: FABRICS.cream },
    { lights: 'qa', lintel: 'pediment', glazing: 'blind', fabric: FABRICS.linen },
  ];
  const upper = [
    { lintel: 'segmental', lights: '2/2' },
    { lintel: 'arch', lights: '2/2', wh: 1.15 },
    { lintel: 'incised', lights: '2/2' },
    { lintel: 'brow', lights: '1/1' },
    { lintel: 'hood', guard: true, wh: 0.55, y: 4.9 },
    { lintel: 'arch', frame: 'dark', glazing: 'curtain', fabric: FABRICS.wine, wh: 1.15 },
  ];
  lower.forEach((o, i) => buildSashWindow(A, b, 0, zs[i], o.y ?? 1.0, 0.95, o.wh ?? 1.5, rng, o));
  upper.forEach((o, i) => buildSashWindow(A, b, 0, zs[i], o.y ?? 4.2, 0.95, o.wh ?? 1.5, rng, o));
}

function doorwaysStand(A, b, pools) {
  const T = A.tiles;
  block(b, -6, 6, 4.8, mat(T, 'wall_stone', LIMESTONE, 0.9));
  buildStoop(A, b, { x: 0, z: -4.5, w: 2.0, toY: 0.36, steps: 2, rails: 'none' });
  buildDoorway(A, b, pools, {
    x: 0,
    z: -4.5,
    y0: 0.36,
    w: 0.95,
    h: 2.1,
    color: GREEN_PAINT,
    transom: 'fan',
    sidelights: true,
    surround: 'pilasters',
    number: 126,
  });
  buildDoorway(A, b, pools, {
    x: 0,
    z: -1.5,
    w: 1.0,
    h: 2.2,
    color: [0.12, 0.12, 0.13],
    transom: 'rect',
    sidelights: true,
    surround: 'portal',
    number: 138,
  });
  buildDoorway(A, b, pools, {
    x: 0,
    z: 1.5,
    w: 1.3,
    h: 2.3,
    leaves: 2,
    color: [0.3, 0.18, 0.11],
    surround: 'arch',
    number: 122,
  });
  buildDoorway(A, b, pools, {
    x: 0,
    z: 4.5,
    w: 1.3,
    h: 2.4,
    leaves: 2,
    glazed: true,
    color: [0.24, 0.14, 0.1],
    transom: 'rect',
    surround: 'hood',
    number: 136,
    intercom: true,
    lamp: true,
  });
}

function stoopsStand(A, b, pools) {
  const T = A.tiles;
  block(b, -6, 6, 5.2, mat(T, 'wall_stone', BROWNSTONE, 0.9));
  buildStoop(A, b, { x: 0, z: -4.2, w: 1.6, toY: 0.5, steps: 3, rails: 'iron' });
  buildDoorway(A, b, pools, {
    x: 0,
    z: -4.2,
    y0: 0.5,
    w: 1.0,
    h: 2.2,
    transom: 'rect',
    surround: 'pilasters',
    color: GREEN_PAINT,
  });
  buildStoop(A, b, {
    x: 0,
    z: -0.2,
    w: 2.2,
    toY: 1.85,
    steps: 9,
    landing: 0.8,
    run: 0.26,
    rails: 'iron',
  });
  buildDoorway(A, b, pools, {
    x: 0,
    z: -0.2,
    y0: 1.85,
    w: 1.3,
    h: 2.4,
    leaves: 2,
    color: [0.24, 0.14, 0.1],
    surround: 'hood',
    trim: BROWNSTONE.map((c) => c * 1.1),
  });
  buildAreaway(A, b, { x: 0, z0: 1.3, z1: 2.9, depth: 1.2, gateZ: 2.4 });
  buildStoop(A, b, {
    x: 0,
    z: 4.4,
    w: 1.9,
    toY: 1.4,
    steps: 7,
    rails: 'stone',
    color: [0.56, 0.36, 0.3],
  });
  buildDoorway(A, b, pools, {
    x: 0,
    z: 4.4,
    y0: 1.4,
    w: 1.2,
    h: 2.3,
    leaves: 2,
    surround: 'arch',
    color: [0.28, 0.16, 0.1],
    trim: [0.6, 0.4, 0.33],
  });
}

function baysStand(A, b, _pools, rng) {
  const T = A.tiles;
  const brick = mat(T, 'wall_brick', BRICK_RED);
  block(b, -6, 6, 9.6, brick);
  const win = { w: 0.8, lintel: 'flat', lights: '1/1' };
  const rows = [
    { y: 3.8, h: 1.4 },
    { y: 6.6, h: 1.4 },
  ];
  buildBay(A, b, rng, {
    shape: 'box',
    x: 0,
    z: -4,
    w: 2.4,
    depth: 0.6,
    y0: 3.3,
    y1: 8.6,
    wall: brick,
    rows,
    win,
  });
  buildBay(A, b, rng, {
    shape: 'canted',
    x: 0,
    z: 0,
    w: 2.8,
    depth: 0.8,
    y0: 0,
    y1: 6.4,
    wall: mat(T, 'wall_stone', BROWNSTONE, 0.9),
    rows: [
      { y: 1.0, h: 1.6 },
      { y: 3.9, h: 1.5 },
    ],
    win: { w: 0.8, lintel: 'incised', lights: '2/2' },
  });
  buildBay(A, b, rng, {
    shape: 'round',
    x: 0,
    z: 4,
    w: 2.6,
    depth: 1.0,
    y0: 3.3,
    y1: 8.6,
    wall: mat(T, 'wall_brick', BRICK_ORANGE),
    rows,
    win: { w: 0.55, lintel: 'flat', lights: 'qa' },
  });
}

function mansardStand(A, b, _pools, rng) {
  const T = A.tiles;
  const wall = mat(T, 'brick_painted', [0.66, 0.64, 0.6]);
  block(b, -3.5, 3.5, 9.6, wall, 7);
  for (const y of [3.9, 6.6]) {
    for (const z of [-1.6, 1.6]) {
      buildSashWindow(A, b, 0, z, y, 0.95, 1.6, rng, { lintel: 'segmental', lights: '1/1' });
    }
  }
  const seg = {
    wallStyle: 'brick',
    color: wall.color,
    texScale: 1.2,
    cornice: 'bracket',
    corniceCol: [0.32, 0.3, 0.28],
  };
  buildCornice(A, b, 0, 9.6, 0, 7, seg, T.wall_brick);
  const fish = T.slate_fishscale;
  buildMansard(A, b, rng, {
    x: 0,
    depth: 7,
    cz: 0,
    w: 7,
    y0: 9.6,
    bands: [
      { from: 0, to: 0.38, tile: fish, color: [0.56, 0.58, 0.64] },
      { from: 0.38, to: 0.58, tile: fish, color: [0.42, 0.36, 0.44] },
      { from: 0.58, to: 1, tile: fish, color: [0.56, 0.58, 0.64] },
    ],
    dormers: [
      { z: -1.6, w: 1.15, h: 1.75, sill: 0.3, head: 'segmental', win: { lights: '1/1' } },
      { z: 1.6, w: 1.15, h: 1.75, sill: 0.3, head: 'pediment', win: { lights: '1/1' } },
    ],
    cresting: true,
  });
}

function gableRoofStand(A, b, pools, rng) {
  const T = A.tiles;
  block(b, -3.5, 3.5, 6.4, mat(T, 'brick_flemish', [0.66, 0.33, 0.25], 0.9), 7);
  for (const z of [-2.2, 0, 2.2]) {
    buildSashWindow(A, b, 0, z, 3.6, 0.9, 1.5, rng, {
      lights: '6/6',
      lintel: 'flat',
      shutters: GREEN_PAINT,
    });
  }
  buildDoorway(A, b, pools, {
    x: 0,
    z: 2.2,
    w: 0.95,
    h: 2.1,
    color: GREEN_PAINT,
    transom: 'fan',
    surround: 'pilasters',
  });
  for (const z of [-2.2, 0])
    buildSashWindow(A, b, 0, z, 1.0, 0.9, 1.5, rng, { lights: '6/6', lintel: 'flat' });
  b.box(-0.08, 6.2, 0, 0.2, 0.2, 7.04, {
    tile: T.wood_paint,
    color: [0.9, 0.88, 0.82],
    texScale: 0.5,
  });
  buildGableRoof(A, b, rng, {
    x: 0,
    depth: 7,
    cz: 0,
    w: 7,
    y0: 6.4,
    h: 2.6,
    wallColor: [0.66, 0.33, 0.25],
    dormers: [
      { z: -1.5, w: 1.0, h: 1.35, head: 'pediment', win: { lights: '6/6' } },
      { z: 1.5, w: 1.0, h: 1.35, head: 'pediment', win: { lights: '6/6' } },
    ],
    chimneys: [-3.25, 3.25],
  });
}

function dutchFront(A, b, rng, w, color) {
  const T = A.tiles;
  block(b, -w * 0.5, w * 0.5, 12.4, mat(T, 'wall_brick', color), 8);
  for (const y of [4.0, 6.8, 9.6]) {
    b.box(-0.04, y - 0.3, 0, 0.1, 0.14, w, { tile: T.wall_stone, color: LIMESTONE, texScale: 0.9 });
    for (const z of [-w * 0.3, 0, w * 0.3]) {
      buildSashWindow(A, b, 0, z, y, 1.0, 1.7, rng, {
        lights: 'cross',
        lintel: 'segmental',
        trim: LIMESTONE,
      });
    }
  }
}

function steppedGableStand(A, b, _pools, rng) {
  const T = A.tiles;
  dutchFront(A, b, rng, 6.5, BRICK_ORANGE);
  buildSteppedGable(A, b, rng, {
    x: 0,
    cz: 0,
    w: 6.5,
    y0: 12.4,
    h: 4.2,
    depth: 8,
    wall: mat(T, 'wall_brick', BRICK_ORANGE),
    trim: LIMESTONE,
    roof: { tile: T.roof_tiles, color: [0.5, 0.28, 0.22], texScale: 0.6 },
    window: { y: 0.6, w: 0.85, h: 1.0, lintel: 'arch', lights: '2/2', trim: LIMESTONE },
  });
}

function neckGableStand(A, b, _pools, rng) {
  const T = A.tiles;
  dutchFront(A, b, rng, 6.5, BRICK_BROWN);
  buildNeckGable(A, b, rng, {
    x: 0,
    cz: 0,
    w: 6.5,
    y0: 12.4,
    depth: 8,
    neckW: 2.1,
    neckH: 2.9,
    shoulderH: 1.3,
    pedH: 0.6,
    wall: mat(T, 'wall_brick', BRICK_BROWN),
    trim: [0.84, 0.78, 0.64],
    roof: { tile: T.roof_tiles, color: [0.4, 0.26, 0.22], texScale: 0.6 },
    window: { y: 1.5, w: 0.95, h: 1.3, lintel: 'flat', lights: 'cross', trim: [0.84, 0.78, 0.64] },
  });
}

function queenAnneStand(A, b, _pools, rng) {
  const T = A.tiles;
  block(b, -3, 3, 8.6, mat(T, 'wall_brick', BRICK_ORANGE), 8);
  for (const y of [1.2, 4.3]) {
    buildSashWindow(A, b, 0, 1.3, y, 1.4, 1.7, rng, { lights: 'qa', lintel: 'flat' });
  }
  buildQueenAnneGable(A, b, rng, {
    x: 0,
    cz: 0,
    w: 6,
    y0: 8.6,
    h: 4.2,
    depth: 8,
    shingle: { tile: T.slate_fishscale, color: [0.58, 0.66, 0.56], texScale: 0.45 },
    roof: { tile: T.slate_rect, color: [0.3, 0.31, 0.34], texScale: 0.5 },
    loggia: true,
  });
}

function cornicesStand(A, b) {
  const T = A.tiles;
  const parts = [
    {
      z: -4.5,
      h: 6.4,
      tile: 'wall_brick',
      color: [0.8, 0.72, 0.56],
      type: 'neoGrec',
      col: [0.46, 0.4, 0.34],
    },
    {
      z: -1.5,
      h: 6.0,
      tile: 'wall_stone',
      color: LIMESTONE,
      type: 'balustrade',
      col: STONE_CORNICE,
    },
    { z: 1.5, h: 6.8, tile: 'stone_rockfaced', color: [0.62, 0.36, 0.3], type: 'corbelTable' },
    {
      z: 4.5,
      h: 5.6,
      tile: 'wall_plaster',
      color: [0.78, 0.72, 0.62],
      type: 'castIron',
      col: [0.66, 0.62, 0.56],
    },
  ];
  for (const p of parts) {
    block(b, p.z - 1.5, p.z + 1.5, p.h, mat(T, p.tile, p.color, 1.1));
    const seg = {
      wallStyle: 'brick',
      color: p.color,
      texScale: 1.1,
      cornice: p.type,
      corniceCol: p.col,
    };
    buildCornice(A, b, 0, p.h, p.z, 3, seg, T[p.tile]);
  }
}

function partyWallStand(A, b) {
  const T = A.tiles;
  const brick = mat(T, 'wall_brick', BRICK_RED);
  block(b, -5, 1, 12, brick, 8);
  block(b, 1, 5, 5.2, mat(T, 'wall_plaster', [0.8, 0.74, 0.64]), 8);
  buildPartyWall(A, b, {
    x: 0,
    depth: 8,
    z: 1,
    side: 1,
    below: 5.2,
    top: 12,
    wall: brick,
    flues: 2,
  });
  buildPartyWall(A, b, { x: 0, depth: 8, z: -5, side: -1, below: 3.0, top: 12, wall: brick });
}

function parapetsStand(A, b) {
  const T = A.tiles;
  const walls = [
    mat(T, 'wall_brick', BRICK_BROWN),
    mat(T, 'wall_brick', [0.5, 0.3, 0.22]),
    { tile: T.terracotta, color: [0.9, 0.84, 0.74], texScale: 0.5 },
  ];
  ['flat', 'stepped', 'deco'].forEach((profile, i) => {
    const z = -4 + i * 4;
    block(b, z - 2, z + 2, 4.4, walls[i]);
    buildParapet(A, b, {
      x: 0,
      cz: z,
      w: 4,
      y0: 4.4,
      h: 0.65,
      profile,
      wall: walls[i],
      panel: true,
    });
  });
}

function atlasStand(A, b) {
  const T = A.tiles;
  block(b, -8, 8, 5.6, mat(T, 'wall_plaster', [0.82, 0.8, 0.76]));
  SHOP_SIGNS.forEach(([text], i) => {
    const z = -6.3 + (i % 7) * 2.1;
    const y = i < 7 ? 4.55 : 3.75;
    b.box(-0.02, y, z, 0.04, 0.58, 1.74, {
      tile: T.metal,
      color: [0.11, 0.12, 0.14],
      faces: { nx: { tile: A.signs.get(text), color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  });
  HOUSE_NUMBERS.forEach((n, i) => {
    b.box(-0.02, 2.9, -7.3 + i * 0.5, 0.03, 0.3, 0.3, {
      tile: T.metal,
      color: [0.11, 0.12, 0.14],
      faces: { nx: { tile: T[`plaque_${n}`], color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  });
  const swatches = [
    ['stone_rockfaced', [0.62, 0.38, 0.32]],
    ['brick_flemish', [0.66, 0.33, 0.25]],
    ['brick_painted', [0.7, 0.78, 0.68]],
    ['slate_fishscale', [0.56, 0.58, 0.64]],
    ['slate_rect', [0.5, 0.52, 0.56]],
    ['incised_panel', [0.86, 0.8, 0.7]],
  ];
  swatches.forEach(([tile, color], i) => {
    b.box(-0.03, 0.5, -6.25 + i * 2.5, 0.06, 1.8, 1.8, {
      tile: T.white,
      color: [0.3, 0.3, 0.3],
      faces: { nx: { tile: T[tile], color, rep: [2, 2] } },
    });
  });
}

/**
 * Builds the whole showcase into two geometries (solid + light pools) in world space.
 * @returns {{ solidGeometry: THREE.BufferGeometry, lightPoolGeometry: THREE.BufferGeometry,
 *   stands: Array<{ id: string, label: string, z0: number, z1: number, h: number }> }}
 */
export function buildShowcaseGeometry(atlas, seed = 5) {
  const solid = new MeshBuilder();
  const pools = new MeshBuilder();
  solid.defaultTile = atlas.tiles.white;
  const m = new THREE.Matrix4();
  const stands = [];
  let z = START_Z;
  for (const s of STANDS) {
    const zc = z + s.w * 0.5;
    m.makeTranslation(BUILDING_LINE_X, CURB_H, zc);
    solid.setTransform(m);
    pools.setTransform(m);
    s.build(atlas, solid, pools, Rng.fork(seed, stands.length + 1));
    stands.push({ id: s.id, label: s.label, z0: z, z1: z + s.w, h: s.h });
    z += s.w + GAP;
  }
  solid.setTransform(null);
  pools.setTransform(null);
  return { solidGeometry: solid.build(), lightPoolGeometry: pools.build(), stands };
}

export class PartsShowcase {
  /** @type {THREE.Group} */
  group = new THREE.Group();
  stands = [];
  #disposables = [];
  #scene;

  constructor(scene, atlas, uniforms) {
    const { solidGeometry, lightPoolGeometry, stands } = buildShowcaseGeometry(atlas);
    this.stands = stands;
    const solidMat = createStreetAtlasMaterial(atlas, uniforms);
    const poolMat = createLightPoolMaterial(uniforms);
    const solid = new THREE.Mesh(solidGeometry, solidMat);
    solid.castShadow = true;
    solid.receiveShadow = true;
    this.group.add(solid);
    if (lightPoolGeometry) {
      const pool = new THREE.Mesh(lightPoolGeometry, poolMat);
      pool.renderOrder = 2;
      this.group.add(pool);
    }
    this.group.name = 'PartsShowcase';
    scene.add(this.group);
    this.#disposables.push(solidGeometry, lightPoolGeometry, solidMat, poolMat);
    this.#scene = scene;
  }

  dispose() {
    this.#scene.remove(this.group);
    for (const d of this.#disposables) d?.dispose();
  }
}
