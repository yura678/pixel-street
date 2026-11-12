/**
 * Street trees (`STREETSCAPE_PLAN.md`, Stage D) against real geometry: every tree grows inside
 * the crown it is given, and no crown, trunk or pit of any spot the planner may plant touches
 * anything else on the street – awnings, signs, the hotel's canopy, fire escapes, balconies,
 * bays, lamps, bollards, the bus stops – on either sidewalk. The trees' own rules (rhythm, doors,
 * lamps, hydrants) are in `buildings.rules.test.js` and `NearSidewalkPlan.test.js`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARAM_DEFS } from '../../config/params.schema.js';
import { CURB_H } from '../../config/streetProfile.js';
import { Store } from '../../core/Store.js';
import { StreetLayout } from '../../simulation/street/StreetLayout.js';
import { createFacadeAtlas } from '../../textures/PixelCanvas.js';
import { BuildingFactory } from '../BuildingFactory.js';
import { MeshBuilder } from '../MeshBuilder.js';
import { planNearSidewalk } from '../NearSidewalkPlan.js';
import { planStreetTrees } from '../StreetTreePlan.js';
import { buildStreetTree } from './StreetTrees.js';

let prevOffscreen;
let atlas;
beforeAll(() => {
  prevOffscreen = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return { imageSmoothingEnabled: true, fillStyle: '#000', fillRect() {} };
    }
  };
  atlas = createFacadeAtlas(3);
});
afterAll(() => {
  atlas.dispose();
  globalThis.OffscreenCanvas = prevOffscreen;
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const mad = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** Closest point of triangle `abc` to `p` (Ericson, Real-Time Collision Detection 5.1.5). */
function closestOnTri(p, a, b, c) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return mad(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return mad(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    return mad(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  }
  const den = 1 / (va + vb + vc);
  return mad(mad(a, ab, vb * den), ac, vc * den);
}

/** Does triangle `abc` reach inside the ellipsoid (`c` centre, `r` radii)? */
function triInEllipsoid(t, e) {
  const unit = (v) => [
    (v[0] - e.c[0]) / e.r[0],
    (v[1] - e.c[1]) / e.r[1],
    (v[2] - e.c[2]) / e.r[2],
  ];
  const q = closestOnTri([0, 0, 0], unit(t[0]), unit(t[1]), unit(t[2]));
  return dot(q, q) < 1;
}

/** Triangle–box overlap by separating axes (Akenine-Möller); the box is `c` ± `h`. */
function triInBox(t, c, h) {
  const a = sub(t[0], c);
  const b = sub(t[1], c);
  const d = sub(t[2], c);
  const edges = [sub(b, a), sub(d, b), sub(a, d)];
  const axes = [];
  for (const e of edges) axes.push([0, -e[2], e[1]], [e[2], 0, -e[0]], [-e[1], e[0], 0]);
  axes.push(cross(edges[0], edges[1]));
  for (const ax of axes) {
    const p = [dot(a, ax), dot(b, ax), dot(d, ax)];
    const r = h[0] * Math.abs(ax[0]) + h[1] * Math.abs(ax[1]) + h[2] * Math.abs(ax[2]);
    if (Math.min(...p) > r || Math.max(...p) < -r) return false;
  }
  for (let i = 0; i < 3; i++) {
    if (Math.min(a[i], b[i], d[i]) > h[i] || Math.max(a[i], b[i], d[i]) < -h[i]) return false;
  }
  return true;
}

/** Triangles of an indexed geometry, shifted by `dz`, as `[a, b, c]` with their bounds. */
function trianglesOf(geometry, dz) {
  if (!geometry) return [];
  const pos = geometry.getAttribute('position').array;
  const idx = geometry.getIndex().array;
  const out = [];
  for (let i = 0; i < idx.length; i += 3) {
    const t = [0, 1, 2].map((k) => {
      const j = idx[i + k] * 3;
      return [pos[j], pos[j + 1], pos[j + 2] + dz];
    });
    out.push({
      t,
      lo: [0, 1, 2].map((a) => Math.min(t[0][a], t[1][a], t[2][a])),
      hi: [0, 1, 2].map((a) => Math.max(t[0][a], t[1][a], t[2][a])),
    });
  }
  return out;
}

/** What a tree needs to itself (world frame, the asphalt at y = 0): crown, trunk, pit. */
function volumesOf(tree) {
  const c = tree.crown;
  const lean = (c.x - tree.x) * 0.3;
  const trunkLo = 0.47;
  const trunkHi = tree.clear + 0.35;
  return {
    crown: { c: [c.x, CURB_H + c.y, c.z], r: [c.rx, c.ry, c.rz] },
    trunk: {
      c: [tree.x + lean * 0.5, CURB_H + (trunkLo + trunkHi) * 0.5, tree.z],
      h: [0.35, (trunkHi - trunkLo) * 0.5, 0.35],
    },
    pit: { c: [tree.x, CURB_H + 0.25, tree.z], h: [0.6, 0.22, 0.6] },
  };
}

/** A tree moved `dz` along the street. */
const shifted = (t, dz) => ({ ...t, z: t.z + dz, crown: { ...t.crown, z: t.crown.z + dz } });

describe('StreetTrees', () => {
  it('grows every tree inside its crown, trunk and pit, within 1.5k triangles', () => {
    for (const species of ['plane']) {
      for (const [rz, ry, clear, seed] of [
        [1.7, 2.4, 2.7, 0.12],
        [2.4, 3.1, 3.0, 0.83],
        [2.05, 2.7, 2.85, 0.47],
        [1.45, 1.4, 2.5, 0.31],
      ]) {
        const tree = {
          species,
          x: 3.24,
          z: 0,
          clear,
          seed,
          crown: { x: 3.24, y: clear + ry * 0.8, z: 0, rx: 1.8, ry, rz },
        };
        const b = new MeshBuilder();
        buildStreetTree(atlas, b, tree);
        expect(b.indices.length / 3, `${species} triangles`).toBeLessThanOrEqual(1500);
        const lean = (tree.crown.x - tree.x) * 0.3;
        let worst = 0;
        for (let i = 0; i < b.positions.length; i += 3) {
          const [x, y, z] = b.positions.slice(i, i + 3);
          expect(Number.isFinite(x + y + z)).toBe(true);
          const c = tree.crown;
          const inCrown =
            ((x - c.x) / c.rx) ** 2 + ((y - c.y) / c.ry) ** 2 + ((z - c.z) / c.rz) ** 2;
          const ax = tree.x + lean * Math.min(1, Math.max(0, y / (clear - 0.18)));
          const inTrunk = Math.hypot(x - ax, z - tree.z) <= 0.5 && y <= clear + 0.35;
          if (!inTrunk) worst = Math.max(worst, inCrown);
        }
        expect(Math.sqrt(worst), `${species} reaches out of its crown`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('touches nothing else on the street: every spot the planner may plant', () => {
    const store = new Store(PARAM_DEFS);
    // All spots planted, so the sidewalk makes room for every one of them
    store.set('street.treeDensity', 1);
    const factory = new BuildingFactory(atlas);
    const tris = [];
    for (let c = -1; c <= 12; c++) {
      const built = factory.buildChunk(StreetLayout.getChunk(c, store), store, {
        treeGeometry: false,
      });
      tris.push(...trianglesOf(built.solidGeometry, c * 20));
      tris.push(...trianglesOf(built.nearGeometry, c * 20));
      built.solidGeometry.dispose();
      built.lightPoolGeometry.dispose();
      built.nearGeometry?.dispose();
    }
    const { trees: far, spots } = planStreetTrees({ seed: 1, density: 1 });
    expect(far.length).toBeGreaterThan(spots.length);
    const near = planNearSidewalk({ seed: 1, density: 1 }).trees;
    expect(near.length).toBeGreaterThan(20);
    // The loop's seam: chunk −1 holds the last near trees again, 240 m earlier
    const trees = [...far, ...near, ...near.filter((t) => t.z > 220).map((t) => shifted(t, -240))];

    const hits = [];
    for (const tree of trees) {
      const v = volumesOf(tree);
      const lo = [v.crown.c[0] - v.crown.r[0], 0, tree.z - Math.max(v.crown.r[2], 0.6)];
      const hi = [v.crown.c[0] + v.crown.r[0], CURB_H + tree.crown.y + tree.crown.ry, 0];
      hi[2] = tree.z + Math.max(v.crown.r[2], 0.6);
      lo[0] = Math.min(lo[0], tree.x - 0.6);
      hi[0] = Math.max(hi[0], tree.x + 0.6);
      for (const { t, lo: tl, hi: th } of tris) {
        if (th[0] < lo[0] || tl[0] > hi[0] || th[1] < lo[1] || tl[1] > hi[1]) continue;
        if (th[2] < lo[2] || tl[2] > hi[2]) continue;
        const what = triInEllipsoid(t, v.crown)
          ? 'crown'
          : triInBox(t, v.trunk.c, v.trunk.h)
            ? 'trunk'
            : triInBox(t, v.pit.c, v.pit.h)
              ? 'pit'
              : null;
        if (!what) continue;
        const m = [0, 1, 2].map((a) => ((t[0][a] + t[1][a] + t[2][a]) / 3).toFixed(2));
        hits.push(`${tree.lot} z ${tree.z.toFixed(1)} ${what} ← (${m.join(', ')})`);
        break;
      }
    }
    expect(hits).toEqual([]);
  });
});
