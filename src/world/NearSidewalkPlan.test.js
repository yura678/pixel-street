/**
 * The near sidewalk (`STREETSCAPE_PLAN.md`, Stage E): the far sidewalk's mirror – the same
 * furniture lines, lamps alternating with the far ones, a hydrant every two chunks, London
 * planes by the far side's rules on a rhythm of their own. The built geometry: nothing of the
 * old foreground (hedge, benches) and nothing behind the near building line. The rules every
 * piece of furniture keeps on both sides (lines, distances, bollards, the walk) are in
 * `SidewalkFurniture.test.js`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARAM_DEFS } from '../config/params.schema.js';
import {
  CROWN_CLEAR,
  CURB_W,
  NEAR_BUILDING_LINE_X,
  ROAD_NEAR_X,
  SLABS_W,
  TREE_PIT,
} from '../config/streetProfile.js';
import { Store } from '../core/Store.js';
import { StreetLayout, TOTAL_LOOP_CHUNKS } from '../simulation/street/StreetLayout.js';
import { createFacadeAtlas } from '../textures/PixelCanvas.js';
import { BuildingFactory } from './BuildingFactory.js';
import {
  NEAR_RULES,
  NEAR_TREE_X,
  nearSidewalkOfChunk,
  planNearSidewalk,
} from './NearSidewalkPlan.js';
import { FOOTPRINT, FURNITURE_RULES, farFixtures } from './SidewalkFurniture.js';
import { LAMP_HEAD, TREE_RULES, TREE_X, planStreetTrees } from './StreetTreePlan.js';

const LOOP = TOTAL_LOOP_CHUNKS * 20;
const PLAN = planNearSidewalk({ seed: 1, density: 0.55 });
const ALL = planNearSidewalk({ seed: 1, density: 1 });
const wrapDist = (a, b) => {
  const d = Math.abs(a - b) % LOOP;
  return Math.min(d, LOOP - d);
};

describe('Near sidewalk plan', () => {
  it('mirrors the far sidewalk: the same slabs, curb and tree line', () => {
    expect(ROAD_NEAR_X - CURB_W - NEAR_BUILDING_LINE_X).toBeCloseTo(SLABS_W, 9);
    expect(SLABS_W).toBeCloseTo(5.0, 9);
    expect(ROAD_NEAR_X - NEAR_TREE_X).toBeCloseTo(TREE_X - 2.35, 9);
  });

  it('lamps alternate with the far ones: every far gap of 10 m or more gets its share', () => {
    const far = farFixtures().lamps;
    let expected = 0;
    for (let i = 0; i < far.length; i++) {
      const a = far[i];
      const b = i + 1 < far.length ? far[i + 1] : far[0] + LOOP;
      const gap = b - a;
      const inside = PLAN.lamps.filter((z) => {
        const zz = z < a ? z + LOOP : z;
        return zz > a && zz < b;
      });
      const want = gap < NEAR_RULES.lampMinGap ? 0 : Math.max(1, Math.round(gap / 20));
      expected += want;
      expect(inside.length, `far gap ${a.toFixed(1)}–${b.toFixed(1)}`).toBe(want);
    }
    expect(PLAN.lamps.length).toBe(expected);
    // Never opposite a far lamp: the pools of light on the road take turns
    for (const z of PLAN.lamps) {
      for (const f of far) expect(wrapDist(z, f), `lamp ${z.toFixed(1)}`).toBeGreaterThan(5);
    }
  });

  it('a hydrant every two chunks, clear of the lamps and bins', () => {
    for (let c = 0; c < TOTAL_LOOP_CHUNKS; c += 2) {
      const here = PLAN.hydrants.filter((z) => z >= c * 20 && z < c * 20 + 40);
      expect(here.length, `chunks ${c}–${c + 1}`).toBe(1);
    }
    for (const h of PLAN.hydrants) {
      for (const q of [...PLAN.lamps, ...PLAN.bins]) {
        expect(wrapDist(h, q)).toBeGreaterThanOrEqual(NEAR_RULES.hydrantClear);
      }
    }
    expect(PLAN.bins.length).toBeGreaterThan(0);
    expect(PLAN.bins.length).toBeLessThan(PLAN.lamps.length);
  });

  it('city trees by the far side’s rules: sizes, pits clear of hydrants and bins', () => {
    const pit = TREE_PIT * 0.5;
    for (const t of ALL.trees) {
      const c = t.crown;
      const id = `near z ${t.z.toFixed(1)}`;
      expect(t.x).toBe(NEAR_TREE_X);
      expect(t.clear, id).toBeGreaterThanOrEqual(2.6);
      expect(t.clear, id).toBeLessThanOrEqual(3.0);
      expect(c.y + c.ry, `${id} height`).toBeGreaterThanOrEqual(7);
      expect(c.y + c.ry, `${id} height`).toBeLessThanOrEqual(9);
      expect(c.rz * 2, `${id} crown`).toBeGreaterThanOrEqual(3.4);
      expect(c.rz * 2, `${id} crown`).toBeLessThanOrEqual(5);
      expect(c.x - c.rx, id).toBeGreaterThanOrEqual(NEAR_BUILDING_LINE_X + CROWN_CLEAR - 1e-9);
      for (const h of ALL.hydrants) {
        expect(wrapDist(t.z, h), `${id} hydrant`).toBeGreaterThanOrEqual(TREE_RULES.hydrant);
      }
      for (const b of ALL.bins) {
        expect(wrapDist(t.z, b), `${id} bin`).toBeGreaterThanOrEqual(
          pit + FOOTPRINT.bin[1] + FURNITURE_RULES.gap,
        );
      }
    }
  });

  it('crowns clear the lamps’ heads and each other', () => {
    for (const t of ALL.trees) {
      const c = t.crown;
      const id = `near z ${t.z.toFixed(1)}`;
      const k = (c.y - LAMP_HEAD.top) / c.ry;
      const reach = Math.abs(k) < 1 ? c.rz * Math.sqrt(1 - k * k) : 0;
      for (const lz of ALL.lamps) {
        expect(wrapDist(t.z, lz), `${id} lamp ${lz.toFixed(1)}`).toBeGreaterThan(
          reach + LAMP_HEAD.halfZ,
        );
      }
      for (const o of ALL.trees) {
        if (o === t) continue;
        expect(wrapDist(t.z, o.z), `${id} – ${o.z.toFixed(1)}`).toBeGreaterThanOrEqual(
          c.rz + o.crown.rz + TREE_RULES.crownGap - 1e-9,
        );
      }
    }
  });

  it('a steady rhythm of its own: spots on every chunk, between the far side’s trees', () => {
    const zs = ALL.trees.map((t) => t.z);
    for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
      expect(
        zs.some((z) => z >= c * 20 && z < c * 20 + 20),
        `chunk ${c}`,
      ).toBe(true);
    }
    for (let i = 0; i < zs.length; i++) {
      const gap = i ? zs[i] - zs[i - 1] : zs[0] + LOOP - zs[zs.length - 1];
      expect(gap, `before z ${zs[i].toFixed(1)}`).toBeLessThanOrEqual(18.5);
    }
    // Not a mirror of the far side: at least half the near trees have no far tree opposite
    const far = planStreetTrees({ seed: 1, density: 0.55 }).trees.map((t) => t.z);
    const off = PLAN.trees.filter((t) => far.every((f) => wrapDist(t.z, f) > 2));
    expect(off.length / PLAN.trees.length).toBeGreaterThanOrEqual(0.5);
  });

  it('street.treeDensity is the share of the near spots planted, spread along the street', () => {
    expect(ALL.trees.length).toBe(ALL.spots.length);
    expect(planNearSidewalk({ seed: 1, density: 0 }).trees).toEqual([]);
    const share = PLAN.trees.length / PLAN.spots.length;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.7);
    const zs = PLAN.trees.map((t) => t.z);
    for (let i = 0; i < zs.length; i++) {
      const gap = i ? zs[i] - zs[i - 1] : zs[0] + LOOP - zs[zs.length - 1];
      expect(gap, `before z ${zs[i].toFixed(1)}`).toBeLessThanOrEqual(26);
    }
  });

  it('splits into chunks without losing or doubling anything, also past the loop', () => {
    for (const shift of [0, TOTAL_LOOP_CHUNKS]) {
      const count = { lamps: 0, bins: 0, hydrants: 0, bollards: 0, trees: 0 };
      for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
        const side = nearSidewalkOfChunk(c + shift, { seed: 1, density: 0.55 });
        const z0 = (c + shift) * 20;
        for (const k of Object.keys(count)) {
          count[k] += side[k].length;
          for (const v of side[k]) {
            const z = typeof v === 'number' ? v : v.z;
            expect(z).toBeGreaterThanOrEqual(z0);
            expect(z).toBeLessThan(z0 + 20);
          }
        }
      }
      for (const k of Object.keys(count)) expect(count[k], k).toBe(PLAN[k].length);
    }
  });
});

describe('Near sidewalk geometry', () => {
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

  it('the old foreground is gone; the near side stands between its building line and the road', () => {
    const store = new Store(PARAM_DEFS);
    const factory = new BuildingFactory(atlas);
    for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
      const g = factory.buildChunk(StreetLayout.getChunk(c, store), store);
      // Nothing of the far side's chunk (houses, furniture, road details) on the near sidewalk
      const solid = g.solidGeometry.getAttribute('position').array;
      let minX = Infinity;
      for (let i = 0; i < solid.length; i += 3) minX = Math.min(minX, solid[i]);
      expect(minX, `chunk ${c} solid`).toBeGreaterThan(ROAD_NEAR_X);
      // The near sidewalk: furniture and trees behind the near curb, crowns over the gutter
      const near = g.nearGeometry.getAttribute('position').array;
      for (let i = 0; i < near.length; i += 3) {
        expect(near[i], `chunk ${c} near`).toBeGreaterThan(NEAR_BUILDING_LINE_X);
        expect(near[i], `chunk ${c} near`).toBeLessThan(ROAD_NEAR_X + 1.2);
      }
      expect(g.trees.filter((t) => t.side === -1).length).toBe(
        nearSidewalkOfChunk(c, { seed: 1, density: 0.55 }).trees.length,
      );
      g.solidGeometry.dispose();
      g.lightPoolGeometry.dispose();
      g.nearGeometry.dispose();
    }
  });
});
