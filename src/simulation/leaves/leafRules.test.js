import { describe, expect, it } from 'vitest';
import {
  BUILDING_LINE_X,
  CURB_H,
  CURB_W,
  NEAR_BUILDING_LINE_X,
  ROAD_FAR_X,
  ROAD_NEAR_X,
} from '../../config/streetProfile.js';
import {
  CROWN_MARGIN,
  LEAF_BEDS,
  LEAF_WINDOW,
  LEAF_WINDOW_LENGTH,
  LEAF_X_RANGE,
  MAX_CROWNS,
  crownsInWindow,
  groundHeightAt,
  leafLife,
  leafWindowAt,
} from './leafRules.js';

const tree = (z, x = 3.2) => ({ crown: { x, y: 4.5, z, rx: 1.8, ry: 2.6, rz: 2.0 } });

describe('leafRules', () => {
  it('puts the road (gutters included) at 0 and the curbs and sidewalks at the curb height', () => {
    expect(groundHeightAt(0)).toBe(0);
    expect(groundHeightAt(ROAD_NEAR_X + 0.01)).toBe(0);
    expect(groundHeightAt(ROAD_FAR_X - 0.01)).toBe(0);
    expect(groundHeightAt(ROAD_NEAR_X - 0.01)).toBe(CURB_H);
    expect(groundHeightAt(ROAD_FAR_X + 0.01)).toBe(CURB_H);
    expect(groundHeightAt(5)).toBe(CURB_H);
    expect(groundHeightAt(-7)).toBe(CURB_H);
  });

  it('shares the leaves out over beds that lie wholly on one level, between the building lines', () => {
    const total = LEAF_BEDS.reduce((s, b) => s + b.share, 0);
    expect(total).toBeCloseTo(1, 9);
    for (const bed of LEAF_BEDS) {
      const [a, b] = bed.x;
      expect(a).toBeLessThan(b);
      expect(a).toBeGreaterThanOrEqual(LEAF_X_RANGE[0]);
      expect(b).toBeLessThanOrEqual(LEAF_X_RANGE[1]);
      // No bed straddles a curb: a leaf put anywhere in it lies on one ground
      expect(groundHeightAt(a)).toBe(groundHeightAt(b));
      // …and none lies on the curb tops themselves
      for (const x of [a, b, (a + b) / 2]) {
        expect(x > ROAD_NEAR_X - CURB_W && x < ROAD_NEAR_X).toBe(false);
        expect(x > ROAD_FAR_X && x < ROAD_FAR_X + CURB_W).toBe(false);
      }
    }
    expect(LEAF_X_RANGE[0]).toBeGreaterThan(NEAR_BUILDING_LINE_X);
    expect(LEAF_X_RANGE[1]).toBeLessThan(BUILDING_LINE_X);
  });

  it('lets a leaf lie longer the lower the fall rate, and for ever at 0', () => {
    expect(leafLife(0)).toBe(Infinity);
    expect(leafLife(-1)).toBe(Infinity);
    expect(leafLife(1)).toBe(25);
    let prev = Infinity;
    for (let r = 0.05; r <= 1; r += 0.05) {
      const life = leafLife(r);
      expect(life).toBeLessThan(prev);
      expect(life).toBeGreaterThanOrEqual(25);
      prev = life;
    }
  });

  it('keeps the window round the camera anchor', () => {
    const w = leafWindowAt(100);
    expect(w.start).toBe(100 - LEAF_WINDOW.behind);
    expect(w.end - w.start).toBe(LEAF_WINDOW_LENGTH);
  });

  it('gives the leaves only the crowns well inside the window, Y from the asphalt, in Z order', () => {
    const trees = [tree(40), tree(-1), tree(1 + CROWN_MARGIN), tree(20, -4.8), tree(79), tree(70)];
    const crowns = crownsInWindow(trees, 0, 80);
    expect(crowns.map((c) => c.z)).toEqual([1 + CROWN_MARGIN, 20, 40, 70]);
    expect(crowns[0].y).toBeCloseTo(4.5 + CURB_H, 9);
    expect(crowns[1].x).toBe(-4.8);
    expect(crowns[0]).toMatchObject({ rx: 1.8, ry: 2.6, rz: 2.0 });
  });

  it('keeps the crowns nearest the middle when more stand in the window than fit', () => {
    const trees = Array.from({ length: 60 }, (_, i) => tree(4 + i * 1.2));
    const crowns = crownsInWindow(trees, 0, 80);
    expect(crowns).toHaveLength(MAX_CROWNS);
    const mid = 40;
    const kept = Math.max(...crowns.map((c) => Math.abs(c.z - mid)));
    const dropped = trees
      .map((t) => t.crown.z)
      .filter((z) => !crowns.some((c) => c.z === z) && z > CROWN_MARGIN && z < 80 - CROWN_MARGIN);
    for (const z of dropped) expect(Math.abs(z - mid)).toBeGreaterThanOrEqual(kept);
    for (let i = 1; i < crowns.length; i++) expect(crowns[i].z).toBeGreaterThan(crowns[i - 1].z);
  });
});
