import { describe, expect, it } from 'vitest';
import { Store } from '../core/Store.js';
import { Rng } from '../core/random.js';
import { PARAM_DEFS } from '../config/params.schema.js';
import { CHUNK_LENGTH } from '../config/constants.js';
import {
  BUILDING_LINE_X,
  CENTER_LINE_X,
  CURB_BLOCK,
  CURB_H,
  CURB_JOINT,
  DROPPED_CURB_H,
  GUTTER_W,
  NEAR_BUILDING_LINE_X,
  ROAD_FAR_X,
  ROAD_NEAR_X,
  SLABS_W,
} from '../config/streetProfile.js';
import { LotType, StreetLayout, TOTAL_LOOP_CHUNKS } from '../simulation/street/StreetLayout.js';
import {
  GRATE_L,
  GRATE_W,
  MANHOLE_R,
  Surface,
  buildProfileChunk,
  curbHeightProfile,
  curbSection,
  placeRoadFixtures,
  MANHOLE_EVERY,
  SEWER_X,
} from './StreetProfileView.js';

const f32 = Math.fround;
const store = new Store(PARAM_DEFS);

/** Vertices of a profile chunk: `{ x, y, z, nx, ny, nz, s }` in world Z. */
function verticesOf(chunkIndex) {
  const layout = StreetLayout.getChunk(chunkIndex, store);
  const geo = buildProfileChunk(layout);
  const p = geo.attributes.position.array;
  const n = geo.attributes.normal.array;
  const s = geo.attributes.aSurface.array;
  const out = [];
  for (let i = 0; i < s.length; i++) {
    out.push({
      x: p[i * 3],
      y: p[i * 3 + 1],
      z: p[i * 3 + 2] + layout.zStart,
      nx: n[i * 3],
      ny: n[i * 3 + 1],
      nz: n[i * 3 + 2],
      s: s[i],
    });
  }
  return { layout, geo, verts: out };
}

const alleyChunk = Array.from({ length: TOTAL_LOOP_CHUNKS }, (_, c) => c).find((c) =>
  StreetLayout.getChunk(c, store).right.some((l) => l.type === LotType.ALLEY),
);

describe('StreetProfileView: curbs, gutters and slabs', () => {
  it('sets the curb top level with the slabs (no step) on both sides', () => {
    const { verts } = verticesOf(0);
    const curb = verts.filter((v) => v.s === Surface.CURB);
    const slab = verts.filter((v) => v.s === Surface.SLAB);
    expect(Math.max(...curb.map((v) => v.y))).toBeCloseTo(CURB_H, 6);
    for (const v of slab) expect(v.y).toBeCloseTo(CURB_H, 6);
    // Far curb blocks reach back to where the slabs start, the near ones likewise
    const slabFar = Math.min(...slab.filter((v) => v.x > 0).map((v) => v.x));
    const curbFar = Math.max(...curb.filter((v) => v.x > 0).map((v) => v.x));
    expect(curbFar).toBeCloseTo(slabFar, 6);
    const slabNear = Math.max(...slab.filter((v) => v.x < 0).map((v) => v.x));
    const curbNear = Math.min(...curb.filter((v) => v.x < 0).map((v) => v.x));
    expect(curbNear).toBeCloseTo(slabNear, 6);
  });

  it('mirrors the far sidewalk on the near side: 5 m of slabs, then the dark apron', () => {
    const { verts } = verticesOf(4);
    const slabsOf = (side) =>
      verts.filter((v) => v.s === Surface.SLAB && Math.sign(v.x) === side).map((v) => v.x);
    const far = slabsOf(1);
    const near = slabsOf(-1);
    expect(Math.max(...far) - Math.min(...far)).toBeCloseTo(SLABS_W, 5);
    expect(Math.max(...near) - Math.min(...near)).toBeCloseTo(SLABS_W, 5);
    expect(Math.min(...near)).toBe(f32(NEAR_BUILDING_LINE_X));
    expect(Math.max(...far)).toBe(f32(BUILDING_LINE_X));
    // Behind both building lines only the foundation apron, a hair under the slabs
    const apron = verts.filter((v) => v.s === Surface.LOT);
    const nearApron = apron.filter((v) => v.x < 0).map((v) => v.x);
    expect(Math.max(...nearApron)).toBe(f32(NEAR_BUILDING_LINE_X));
    expect(Math.min(...nearApron)).toBeLessThan(-20);
    for (const v of apron) expect(v.y).toBeCloseTo(CURB_H - 0.004, 6);
  });

  it('joins neighbouring blocks in watertight V joints, across chunks too', () => {
    const joint = curbSection(CURB_H, true);
    for (const c of [0, 1]) {
      const { verts, layout } = verticesOf(c);
      for (const [edge, side] of [
        [ROAD_FAR_X, 1],
        [ROAD_NEAR_X, -1],
      ]) {
        const want = new Set(joint.map(([d, y]) => `${f32(edge + side * d)}|${f32(y)}`));
        for (let k = 0; k <= CHUNK_LENGTH / CURB_BLOCK; k++) {
          const z = layout.zStart + k * CURB_BLOCK;
          const at = verts.filter(
            (v) => v.s === Surface.CURB && v.z === z && Math.sign(v.x - CENTER_LINE_X) === side,
          );
          const got = new Set(at.map((v) => `${v.x}|${v.y}`));
          expect(got).toEqual(want);
        }
      }
    }
    // The bevel is the joint: CURB_JOINT deep at the face
    expect(joint[0][0]).toBe(CURB_JOINT);
  });

  it('turns every curb face outward: faces to the road, chamfers and tops up, none down', () => {
    const { verts } = verticesOf(0);
    const curb = verts.filter((v) => v.s === Surface.CURB);
    for (const v of curb) expect(v.ny).toBeGreaterThan(-1e-6);
    // The vertical face of a block (away from its bevelled ends) looks at the road
    const face = (side, edge) =>
      curb.filter(
        (v) =>
          Math.abs(v.x - edge) < 1e-6 &&
          Math.abs(v.nz) < 1e-6 &&
          Math.abs(v.ny) < 1e-6 &&
          Math.sign(v.x - CENTER_LINE_X) === side,
      );
    for (const v of face(1, ROAD_FAR_X)) expect(v.nx).toBeCloseTo(-1, 6);
    for (const v of face(-1, ROAD_NEAR_X)) expect(v.nx).toBeCloseTo(1, 6);
    expect(face(1, ROAD_FAR_X).length).toBeGreaterThan(20);
  });

  it('lays both gutters flush with the asphalt from its seams to under the curbs', () => {
    const { verts } = verticesOf(3);
    const g = verts.filter((v) => v.s === Surface.GUTTER);
    for (const v of g) {
      expect(v.y).toBe(0);
      expect(v.ny).toBe(1);
    }
    const far = g.filter((v) => v.x > 0).map((v) => v.x);
    const near = g.filter((v) => v.x < 0).map((v) => v.x);
    // The asphalt ribbon ends exactly on these seams (`RoadView`)
    expect(Math.min(...far)).toBe(f32(ROAD_FAR_X - GUTTER_W));
    expect(Math.max(...near)).toBe(f32(ROAD_NEAR_X + GUTTER_W));
    expect(Math.max(...far)).toBeGreaterThan(ROAD_FAR_X + CURB_JOINT);
    expect(Math.min(...near)).toBeLessThan(ROAD_NEAR_X - CURB_JOINT);
  });

  it('drops the curb across the alley mouth and ramps it back up at both ends', () => {
    expect(alleyChunk).toBeDefined();
    const { layout, verts } = verticesOf(alleyChunk);
    const alley = layout.right.find((l) => l.type === LotType.ALLEY);
    const h = curbHeightProfile(layout);
    const mid = (alley.zStart + alley.zEnd) / 2;
    expect(h(mid)).toBe(DROPPED_CURB_H);
    expect(h(alley.zStart)).toBe(CURB_H);
    expect(h(alley.zEnd)).toBe(CURB_H);
    expect(h(layout.zStart)).toBe(CURB_H);
    // Heights move continuously along the street (no step between blocks)
    for (let z = alley.zStart - 2; z < alley.zEnd + 2; z += 0.05) {
      expect(Math.abs(h(z + 0.05) - h(z))).toBeLessThanOrEqual((CURB_H - DROPPED_CURB_H) * 0.051);
    }
    // The geometry follows: low at the face in the middle of the mouth, the top back at the
    // slab level so the sidewalk stays one surface
    const front = verts.filter(
      (v) =>
        v.s === Surface.CURB && v.x < ROAD_FAR_X + 0.05 && v.x > 0 && Math.abs(v.z - mid) < 1.0,
    );
    expect(front.length).toBeGreaterThan(0);
    for (const v of front) expect(v.y).toBeLessThanOrEqual(DROPPED_CURB_H + 1e-6);
    // Elsewhere and on the near side the curb stays full height
    expect(curbHeightProfile(StreetLayout.getChunk(0, store))(10)).toBe(CURB_H);
  });

  it('keeps a profile chunk light', () => {
    for (const c of [0, alleyChunk]) {
      const { geo } = verticesOf(c);
      expect(geo.index.count / 3).toBeLessThan(2000);
    }
  });
});

describe('placeRoadFixtures', () => {
  it('puts the grates in the gutters on lot boundaries and the manholes on the sewer main', () => {
    const zs = [];
    for (const seed of [1, 7, 42]) {
      const st = new Store(PARAM_DEFS);
      st.set('street.seed', seed);
      for (let c = -2; c < TOTAL_LOOP_CHUNKS + 2; c++) {
        const layout = StreetLayout.getChunk(c, st);
        const lots = layout.right;
        const { grates, manhole } = placeRoadFixtures(lots, layout.zStart, Rng.fork(seed, c, 993));

        expect(grates).toHaveLength(2);
        const bounds = lots.map((l) => l.zStart);
        for (const g of grates) {
          const [lo, hi] =
            g.x > 0 ? [ROAD_FAR_X - GUTTER_W, ROAD_FAR_X] : [ROAD_NEAR_X, ROAD_NEAR_X + GUTTER_W];
          expect(g.x - GRATE_W / 2).toBeGreaterThan(lo);
          expect(g.x + GRATE_W / 2).toBeLessThan(hi);
          expect(bounds).toContain(g.z);
        }
        expect(grates[0].x).toBeGreaterThan(0);
        expect(grates[1].x).toBeLessThan(0);
        expect(GRATE_L).toBeCloseTo(GRATE_W * 2, 6); // two square tiles, nothing stretched

        if (!manhole) continue;
        // On the sewer main in the middle of the near lane, clear of the gutter and the centre
        // line, out of the taxi's lane
        expect(manhole.x).toBe(SEWER_X);
        expect(manhole.x - MANHOLE_R).toBeGreaterThanOrEqual(ROAD_NEAR_X + GUTTER_W + 0.5);
        expect(manhole.x + MANHOLE_R).toBeLessThanOrEqual(CENTER_LINE_X - 0.5);
        expect(manhole.z).toBeGreaterThan(layout.zStart);
        expect(manhole.z).toBeLessThan(layout.zEnd);
        if (seed === 1 && c >= 0 && c < TOTAL_LOOP_CHUNKS) zs.push(manhole.z);
      }
    }
    // A steady run along the loop: one every MANHOLE_EVERY chunks, 40 m ± the jitter apart
    expect(zs).toHaveLength(TOTAL_LOOP_CHUNKS / MANHOLE_EVERY);
    for (let i = 1; i < zs.length; i++) {
      const gap = zs[i] - zs[i - 1];
      expect(gap).toBeGreaterThan(MANHOLE_EVERY * 20 - 6.01);
      expect(gap).toBeLessThan(MANHOLE_EVERY * 20 + 6.01);
    }
  });
});
