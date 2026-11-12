/**
 * Street trees of the far sidewalk (`STREETSCAPE_PLAN.md`, Stage D) and of the pocket square:
 * London planes grown inside the crown each tree is given (`StreetTreePlan.planStreetTrees`,
 * `Square.squareTrees`), so nothing of the tree leaves that ellipsoid.
 *
 * The wood is smooth: the trunk and the limbs are round tubes along curves with smooth normals,
 * the mottled bark (`bark_plane`: cream, olive and grey plates) wrapped round them at its own
 * scale, never stretched along a limb. The trunk splits into three scaffold limbs that grow out
 * of it – each starts inside the trunk at the trunk's own girth, rising, and only then bends
 * out – with a leader up the middle and a few smaller branches toward the leaf masses. The
 * crown is a broad round mass of faceted leaf blobs with leaf cards on their upper halves only
 * (none hang under the crown). The leaves sway in the wind (`aData.y`), the wood does not.
 *
 * `buildTreePit` lays the pit round the trunk: a granite rim level with the slabs, soil or
 * small setts inside.
 *
 * Frame: the caller's (the factory's chunk frame: world X, Y up from the sidewalk); a tree is
 * `{ x, z, base = 0, clear, seed, crown: { x, y, z, rx, ry, rz }, fill }`, its crown's centre
 * `y` above `base`.
 */
import { Rng } from '../../core/random.js';
import { TREE_PIT } from '../../config/streetProfile.js';
import { addLeafBlob } from './Greenery.js';
import {
  LEAF_DARK_OLIVE,
  LEAF_MID_OLIVE,
  LEAF_SAGE_GREEN,
  LEAF_SUN_TIP,
  STONE_PLINTH,
  WHITE,
} from './palette.js';

/** Foliage colours: sunlit tops, the middle, shaded undersides; the leaf cards. */
const PLANE_GREENS = Object.freeze({
  top: [0.4, 0.55, 0.19],
  mid: [0.24, 0.39, 0.12],
  low: [0.1, 0.21, 0.06],
  leaf: [LEAF_SUN_TIP, LEAF_SAGE_GREEN, LEAF_MID_OLIVE, LEAF_DARK_OLIVE],
});

/** The bark tile covers this much of the trunk each way (metres). */
const BARK_TILE = 0.8;

/**
 * `aData.x` of the crown's wood (limbs, leader, branches) of a tree drawn with the canopy
 * material (`AtlasMaterial`, `canopy: true`): it fades with the leaves, so a dithered crown
 * never leaves bare limbs behind. The trunk below the crown stays whole.
 */
export const CANOPY_WOOD = 7.5;

/**
 * Leaf masses of the crown in crown units (the crown's centre at 0, its radii at 1):
 * `[u, v, w, r]` – a ring round the middle, a smaller ring on top, one under the middle. With
 * their jitter (+14 %) and the leaf cards on them they stay inside the unit ball.
 */
const MASSES = (() => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    out.push([Math.cos(a) * 0.45, -0.15, Math.sin(a) * 0.45, 0.36]);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    out.push([Math.cos(a) * 0.28, 0.38, Math.sin(a) * 0.28, 0.35]);
  }
  out.push([0, -0.42, 0, 0.33]);
  return out;
})();

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Point `t` of the cubic Bézier `p0 p1 p2 p3`. */
function bezier(p0, p1, p2, p3, t) {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  return [0, 1, 2].map((k) => a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k]);
}

/**
 * A round tube of bark along the polyline `pts` with the radius `radii[i]` at each point:
 * rings carried along the curve without twisting, smooth normals, the bark tile wrapped round
 * it (a whole number of times, so its seam closes) and repeating along it at `BARK_TILE`.
 * `cap` closes the far end with a short cone.
 */
function barkTube(b, pts, radii, sides, bark, cap = false) {
  const n = pts.length;
  const tangents = pts.map((p, i) =>
    norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)])),
  );
  // First normal: anything square to the first tangent; then carried along (projected)
  const t0 = tangents[0];
  let nrm = norm(Math.abs(t0[1]) < 0.9 ? cross(t0, [0, 1, 0]) : cross(t0, [1, 0, 0]));
  const meanR = radii.reduce((s, r) => s + r, 0) / n;
  const ru = Math.max(1, Math.round((Math.PI * 2 * meanR) / BARK_TILE));
  const rings = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    const t = tangents[i];
    if (i > 0) {
      const d = nrm[0] * t[0] + nrm[1] * t[1] + nrm[2] * t[2];
      nrm = norm([nrm[0] - t[0] * d, nrm[1] - t[1] * d, nrm[2] - t[2] * d]);
      v += Math.hypot(...sub(pts[i], pts[i - 1])) / BARK_TILE;
    }
    const bin = cross(t, nrm);
    const ring = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const dir = [0, 1, 2].map((c) => nrm[c] * Math.cos(a) + bin[c] * Math.sin(a));
      ring.push({
        p: [0, 1, 2].map((c) => pts[i][c] + dir[c] * radii[i]),
        n: dir,
        uv: [(k / sides) * ru, v],
      });
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = rings[i][k];
      const c = rings[i][k + 1];
      const d = rings[i + 1][k + 1];
      const e = rings[i + 1][k];
      b.triN(a.p, c.p, d.p, a.n, c.n, d.n, a.uv, c.uv, d.uv, bark);
      b.triN(a.p, d.p, e.p, a.n, d.n, e.n, a.uv, d.uv, e.uv, bark);
    }
  }
  if (cap) {
    const last = rings[n - 1];
    const t = tangents[n - 1];
    const tip = [0, 1, 2].map((c) => pts[n - 1][c] + t[c] * radii[n - 1] * 1.2);
    for (let k = 0; k < sides; k++) {
      const a = last[k];
      const c = last[k + 1];
      b.triN(a.p, c.p, tip, a.n, c.n, t, a.uv, c.uv, [a.uv[0], a.uv[1] + 0.2], bark);
    }
  }
}

/** Crown units → the caller's frame. */
function crownPoint(tree, u, v, w) {
  const c = tree.crown;
  const base = tree.base ?? 0;
  return [c.x + u * c.rx, base + c.y + v * c.ry, c.z + w * c.rz];
}

/** A limb as a Bézier from `p0` rising (`rise`) then bending out to `end`, sampled in `segs`. */
function limbPath(p0, rise, end, segs) {
  const p1 = [p0[0], p0[1] + rise, p0[2]];
  const p2 = [(p0[0] + end[0] * 2) / 3, end[1] - (end[1] - p0[1]) * 0.25, (p0[2] + end[2] * 2) / 3];
  const pts = [];
  for (let i = 0; i <= segs; i++) pts.push(bezier(p0, p1, p2, end, i / segs));
  return pts;
}

/**
 * A London plane inside its crown.
 * @param {object} atlas facade atlas
 * @param {import('../MeshBuilder.js').MeshBuilder} b
 * @param {{ x: number, z: number, base?: number, clear: number, seed: number,
 *   crown: { x: number, y: number, z: number, rx: number, ry: number, rz: number } }} tree
 * @param {{ canopy?: boolean }} [opts] `canopy`: the tree stands between the camera and the
 *   street – its limbs carry `CANOPY_WOOD` and fade with the leaves
 */
export function buildStreetTree(atlas, b, tree, opts = {}) {
  const T = atlas.tiles;
  const rng = new Rng(Math.floor(tree.seed * 0x7fffffff));
  const bark = { tile: T.bark_plane, color: WHITE };
  const limbBark = opts.canopy ? { ...bark, data: [CANOPY_WOOD, 0] } : bark;
  const base = tree.base ?? 0;
  const { x, z } = tree;
  const c = tree.crown;
  // The size of the wood follows the crown (the square's planes are smaller)
  const k = Math.min(1, c.rz / 2.0);
  const rTrunk = 0.15 * k + 0.02;

  // Trunk: a flared foot, a gentle taper, the split a little under the clear trunk's top
  const split = base + tree.clear - 0.35;
  const top = [x, split + 0.25, z];
  barkTube(
    b,
    [
      [x, base - 0.02, z],
      [x, base + 0.18, z],
      [x, base + 0.6, z],
      [x, (base + split) * 0.5, z],
      [x, split, z],
      top,
    ],
    [rTrunk * 1.55, rTrunk * 1.2, rTrunk * 1.04, rTrunk * 0.97, rTrunk * 0.9, rTrunk * 0.78],
    8,
    bark,
    true,
  );

  // Three scaffold limbs growing out of the trunk: each starts inside it at its girth, rises,
  // then bends out under the ring of leaf masses
  const turn = rng.range(0, Math.PI * 2);
  const ends = [];
  for (let i = 0; i < 3; i++) {
    const a = turn + (i / 3) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const end = crownPoint(tree, Math.cos(a) * 0.44, -0.12, Math.sin(a) * 0.44);
    const pts = limbPath([x, split - 0.25, z], 0.7 * k + 0.2, end, 5);
    barkTube(
      b,
      pts,
      pts.map((_, j) => rTrunk * 0.8 * (1 - j / 5) + 0.04 * (j / 5)),
      7,
      limbBark,
      true,
    );
    ends.push({ a, mid: pts[3] });
  }
  // A leader up the middle
  const lead = limbPath([x, split - 0.1, z], 0.5, crownPoint(tree, 0, 0.32, 0), 4);
  barkTube(
    b,
    lead,
    lead.map((_, j) => rTrunk * 0.7 * (1 - j / 4) + 0.035 * (j / 4)),
    6,
    limbBark,
    true,
  );
  // Smaller branches off two of the limbs, toward the leaf masses on top
  for (const { a, mid } of ends.slice(0, 2)) {
    const end = crownPoint(tree, Math.cos(a + 0.9) * 0.3, 0.3, Math.sin(a + 0.9) * 0.3);
    const pts = limbPath(mid, 0.25, end, 2);
    barkTube(b, pts, [0.05 * k + 0.01, 0.04, 0.025], 5, limbBark, true);
  }

  // The leaf masses, turned round the trunk so no two planes are alike; leaf cards on their
  // upper halves only
  const ct = Math.cos(turn);
  const st = Math.sin(turn);
  MASSES.forEach(([u0, v, w0, r], i) => {
    const u = u0 * ct - w0 * st;
    const w = u0 * st + w0 * ct;
    const [px, py, pz] = crownPoint(tree, u, v, w);
    addLeafBlob(
      atlas,
      b,
      px,
      py,
      pz,
      r * c.rx,
      r * c.ry * 0.86,
      r * c.rz,
      rng,
      PLANE_GREENS,
      tree.seed + i * 0.071,
      0.5,
      1,
      v < -0.3 ? 0 : 8,
      1.0,
    );
  });
}

/**
 * The pit round a street tree: a granite rim level with the slabs and soil or small setts
 * inside (`fill`).
 * @param {object} atlas
 * @param {import('../MeshBuilder.js').MeshBuilder} b
 * @param {{ x: number, z: number, base?: number, fill?: 'soil'|'setts' }} tree
 */
export function buildTreePit(atlas, b, tree) {
  const T = atlas.tiles;
  const { x, z } = tree;
  const y = tree.base ?? 0;
  const half = TREE_PIT * 0.5;
  const rimW = 0.08;
  const rim = { tile: T.wall_stone, color: STONE_PLINTH, texScale: 0.6, faces: { ny: false } };
  for (const s of [-1, 1]) {
    b.box(x + s * (half - rimW * 0.5), y - 0.02, z, rimW, 0.045, TREE_PIT, rim);
    b.box(x, y - 0.02, z + s * (half - rimW * 0.5), TREE_PIT - rimW * 2, 0.045, rimW, rim);
  }
  const inner = TREE_PIT - rimW * 2;
  const setts = tree.fill === 'setts';
  b.quad([x - inner * 0.5, y + 0.012, z + inner * 0.5], [inner, 0, 0], [0, 0, -inner], {
    tile: setts ? T.cobble : T.dirt,
    color: setts ? [0.56, 0.53, 0.49] : [0.36, 0.28, 0.21],
    rep: setts ? [2, 2] : [1, 1],
  });
}
