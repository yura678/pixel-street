/**
 * Street furniture of both sidewalks (`STREETSCAPE_PLAN.md`, Stage F), checked on what the
 * factory actually builds (`buildChunk(…).furniture`, `trees`) and on its geometry: every piece
 * on its line in the furnishing strip, the same on both sides; pieces never crowding each other;
 * trees off the lamps and hydrants; doors, gates, the mailbox and the hotel's canopy kept clear;
 * nothing at the bus stops or in the alley mouth; the walk clear to head height.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARAM_DEFS } from '../config/params.schema.js';
import {
  BUILDING_LINE_X,
  CURB_H,
  NEAR_BUILDING_LINE_X,
  ROAD_FAR_X,
  ROAD_NEAR_X,
} from '../config/streetProfile.js';
import { Store } from '../core/Store.js';
import { LotType, StreetLayout, TOTAL_LOOP_CHUNKS } from '../simulation/street/StreetLayout.js';
import { createFacadeAtlas } from '../textures/PixelCanvas.js';
import { BuildingFactory } from './BuildingFactory.js';
import {
  FOOTPRINT,
  FURNITURE,
  FURNITURE_RULES,
  bollardRow,
  curbX,
  farKeepOuts,
  loopDist,
} from './SidewalkFurniture.js';
import { planStreet } from './StreetAudit.js';

const LOOP = TOTAL_LOOP_CHUNKS * 20;
const R = FURNITURE_RULES;

let prevOffscreen;
let atlas;
/** The built loop at the default tree density and with every spot planted. */
const BUILT = {};
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
  const factory = new BuildingFactory(atlas);
  for (const density of [0.55, 1]) {
    const store = new Store(PARAM_DEFS);
    store.set('street.treeDensity', density);
    const out = { furniture: [], trees: [], chunks: [] };
    for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
      const g = factory.buildChunk(StreetLayout.getChunk(c, store), store);
      out.furniture.push(...g.furniture);
      out.trees.push(...g.trees);
      out.chunks.push(g);
    }
    BUILT[density] = out;
  }
});
afterAll(() => {
  for (const { chunks } of Object.values(BUILT)) {
    for (const g of chunks) {
      g.solidGeometry.dispose();
      g.lightPoolGeometry.dispose();
      g.nearGeometry?.dispose();
    }
  }
  atlas.dispose();
  globalThis.OffscreenCanvas = prevOffscreen;
});

/** Every piece at the curb as `{ kind, side, x, z }`: the furniture, the pits, the mailbox. */
function pieces(density) {
  const { furniture, trees } = BUILT[density];
  const mailboxes = farKeepOuts()
    .spans.filter((s) => s.what === 'mailbox')
    .map((s) => ({
      kind: 'mailbox',
      side: 1,
      x: curbX(1, FURNITURE.mailbox),
      z: (s.z0 + s.z1) / 2,
    }));
  return [
    ...furniture.filter((p) => p.kind !== 'rack'),
    ...trees.map((t) => ({ kind: 'tree', side: t.side ?? 1, x: t.x, z: t.z })),
    ...mailboxes,
  ];
}

const label = (p) => `${p.side > 0 ? 'far' : 'near'} ${p.kind} z ${p.z.toFixed(2)}`;

describe('Sidewalk furniture', () => {
  it('stands on its line in the furnishing strip, the same on both sides', () => {
    for (const density of [0.55, 1]) {
      const all = pieces(density);
      for (const p of all) {
        expect(p.x, label(p)).toBeCloseTo(curbX(p.side, FURNITURE[p.kind]), 9);
        expect(FURNITURE[p.kind] + FOOTPRINT[p.kind][0], label(p)).toBeLessThanOrEqual(R.strip);
      }
      // Both sides have every kind (the far side's lamps stand by party walls, by many doors:
      // few have room for a bin)
      for (const kind of ['bollard', 'lamp', 'bin', 'hydrant', 'tree']) {
        for (const side of [1, -1]) {
          const n = all.filter((p) => p.kind === kind && p.side === side).length;
          expect(n, `${side > 0 ? 'far' : 'near'} ${kind}s`).toBeGreaterThan(2);
        }
      }
    }
  });

  it('never crowds: footprints keep their gap, trees 1.2 m off lamps and 1.5 m off hydrants', () => {
    for (const density of [0.55, 1]) {
      const all = pieces(density);
      for (let i = 0; i < all.length; i++) {
        const a = all[i];
        for (let j = i + 1; j < all.length; j++) {
          const b = all[j];
          if (a.side !== b.side) continue;
          const [ax, az] = FOOTPRINT[a.kind];
          const [bx, bz] = FOOTPRINT[b.kind];
          const dz = loopDist(a.z % LOOP, b.z % LOOP, b.z % LOOP);
          const pair = `${label(a)} – ${label(b)}`;
          if (Math.abs(a.x - b.x) < ax + bx) {
            expect(dz, pair).toBeGreaterThanOrEqual(az + bz + R.gap - 1e-9);
          }
          const kinds = [a.kind, b.kind].sort().join('+');
          if (kinds === 'lamp+tree') expect(dz, pair).toBeGreaterThanOrEqual(R.treeLamp);
          if (kinds === 'hydrant+tree') expect(dz, pair).toBeGreaterThanOrEqual(R.treeHydrant);
        }
      }
    }
  });

  it('keeps doors, stoops, shop doors, gates, the mailbox and the canopy clear', () => {
    const spans = farKeepOuts().spans.filter((s) => !['stop', 'alley'].includes(s.what));
    for (const density of [0.55, 1]) {
      for (const p of pieces(density)) {
        // Trees: `buildings.rules.test.js`; a parked bicycle keeps to its lot's own rules
        if (p.side < 0 || !['bollard', 'bin', 'lamp', 'hydrant'].includes(p.kind)) continue;
        for (const s of spans) {
          const half = FOOTPRINT[p.kind][1];
          const d = loopDist(p.z % LOOP, s.z0, s.z1);
          expect(
            d,
            `${label(p)} before the ${s.what} ${s.z0.toFixed(2)}–${s.z1.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(half);
        }
      }
    }
  });

  it('leaves the bus stops and the alley mouth to themselves', () => {
    const { lots } = planStreet(null);
    const open = lots.filter((l) => l.type === LotType.BUS_STOP || l.type === LotType.ALLEY);
    expect(open.length).toBeGreaterThan(2);
    for (const density of [0.55, 1]) {
      for (const p of pieces(density)) {
        if (p.side < 0) continue;
        const z = p.z % LOOP;
        const half = FOOTPRINT[p.kind][1];
        for (const l of open) {
          expect(z + half <= l.zStart || z - half >= l.zEnd, `${label(p)} in ${l.type}`).toBe(true);
        }
      }
    }
  });

  it('a steady bollard row: one every ~3.1 m, slid aside, never bunched', () => {
    const blockedAt = [5, 5.5];
    const row = bollardRow(0, 20, (z) => z > blockedAt[0] && z < blockedAt[1]);
    expect(row.length).toBe(6);
    for (const z of row) expect(z > blockedAt[0] && z < blockedAt[1]).toBe(false);
    for (const side of [1, -1]) {
      const zs = BUILT[0.55].furniture
        .filter((p) => p.kind === 'bollard' && p.side === side)
        .map((p) => p.z)
        .sort((a, b) => a - b);
      expect(zs.length, `${side} bollards`).toBeGreaterThan(50);
      for (let i = 1; i < zs.length; i++) {
        expect(zs[i] - zs[i - 1], `${side} at ${zs[i].toFixed(2)}`).toBeGreaterThanOrEqual(
          R.bollardSpacing - 1e-9,
        );
      }
    }
  });

  it('leaves the walk clear to head height on both sidewalks', () => {
    // The walk: between the furnishing strip and the frontage by the facades. The houses' own
    // stoops and areaways may stand in it (their door zones, give or take the stoops' cheeks),
    // no further than the tree line (`buildings.rules.test.js`)
    const { houses, lots } = planStreet(null);
    const own = [];
    for (const { plan, lot } of houses) {
      for (const [a, b] of plan.doorZones) own.push([lot.centerZ + a, lot.centerZ + b]);
      for (const a of plan.areaways) own.push([lot.centerZ + a.z0, lot.centerZ + a.z1]);
    }
    // The steps up to the pocket square, the paving of the alley
    for (const l of lots) {
      if (l.type === LotType.PARK || l.type === LotType.ALLEY) own.push([l.zStart, l.zEnd]);
    }
    const walks = [
      { side: 1, x0: ROAD_FAR_X + R.strip, x1: BUILDING_LINE_X - R.frontage, part: 'solid' },
      { side: -1, x0: NEAR_BUILDING_LINE_X + R.frontage, x1: ROAD_NEAR_X - R.strip, part: 'near' },
    ];
    const y0 = CURB_H + 0.03;
    const y1 = CURB_H + R.head;
    const hits = [];
    BUILT[0.55].chunks.forEach((g, c) => {
      for (const w of walks) {
        const geo = w.part === 'solid' ? g.solidGeometry : g.nearGeometry;
        const pos = geo.getAttribute('position').array;
        const idx = geo.getIndex().array;
        for (let i = 0; i < idx.length; i += 3) {
          const v = [0, 1, 2].map((k) => idx[i + k] * 3);
          const lo = (a) => Math.min(...v.map((j) => pos[j + a]));
          const hi = (a) => Math.max(...v.map((j) => pos[j + a]));
          if (hi(0) <= w.x0 || lo(0) >= w.x1 || hi(1) <= y0 || lo(1) >= y1) continue;
          const z = c * 20 + (lo(2) + hi(2)) / 2;
          if (w.side > 0 && own.some(([a, b]) => z >= a - 0.15 && z <= b + 0.15)) continue;
          hits.push(
            `${w.part} chunk ${c} at x ${lo(0).toFixed(2)} y ${lo(1).toFixed(2)} z ${z.toFixed(2)}`,
          );
          break;
        }
      }
    });
    expect(hits).toEqual([]);
  });
});
