/**
 * Street rules from the building redesign plan, checked on the resolved plans of every house
 * that has a `BuildingSpec`. No rendering: the plans are the same data the Assembler builds.
 * Rules between neighbours apply as soon as two spec houses stand side by side.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BUILDINGS, getBuildingSpec } from '../../config/buildings/index.js';
import { Store } from '../../core/Store.js';
import { PARAM_DEFS } from '../../config/params.schema.js';
import { LotType, StreetLayout, TOTAL_LOOP_CHUNKS } from '../../simulation/street/StreetLayout.js';
import { createFacadeAtlas } from '../../textures/PixelCanvas.js';
import { BuildingFactory } from '../BuildingFactory.js';
import { planStreet } from '../StreetAudit.js';
import { LAMP_HEAD, TREE_RULES, TREE_X, planStreetTrees } from '../StreetTreePlan.js';
import { hydrantOf, streetLampsOf } from '../SidewalkFurniture.js';
import {
  BUILDING_LINE_X,
  CROWN_CLEAR,
  CURB_W,
  ROAD_FAR_X,
  TREE_PIT,
} from '../../config/streetProfile.js';
import { lotTop, openingsOf } from './SpecPlanner.js';

/** Triangle budget of one 20 m chunk (№ 114 with its garden measures ≈ 35k). */
const CHUNK_TRIANGLE_BUDGET = 60_000;
/** Street trees and lamps stand beyond this distance from the building line (sidewalk zone 1). */
const TREE_LINE = 2.18;

// Every right-hand lot of the loop in driving order (Z 0 → 240) and the spec houses on them,
// planned exactly as BuildingFactory plans them, with their neighbours on both sides
const { lots: LOTS, houses: HOUSES } = planStreet(null);
const at = (i) => LOTS[((i % LOTS.length) + LOTS.length) % LOTS.length];
const byId = new Map(HOUSES.map((h) => [h.id, h]));
/** The spec of a house that spans into `lot` from the lot before it (`extendsInto: 'next'`). */
const ownerOf = (lot) => {
  const before = getBuildingSpec(at(LOTS.indexOf(lot) - 1).spec);
  return before?.extendsInto === 'next' ? before : null;
};

describe('Building specs on the street', () => {
  it('every lot spec exists and every spec stands on exactly one lot', () => {
    for (const lot of LOTS) if (lot.spec) expect(BUILDINGS[lot.spec], lot.id).toBeDefined();
    for (const id of Object.keys(BUILDINGS)) {
      expect(LOTS.filter((l) => l.spec === id).length, id).toBe(1);
    }
  });

  it('house numbers are even, unique and rise along the loop from № 100 at Z 0', () => {
    const numbers = HOUSES.map((h) => h.spec.number);
    for (const n of numbers) {
      expect(n % 2, `№ ${n}`).toBe(0);
      expect(n).toBeGreaterThanOrEqual(100);
      expect(n).toBeLessThanOrEqual(166);
    }
    for (let i = 1; i < numbers.length; i++) expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
  });

  it('every shop sign appears once on the loop', () => {
    // A shop's second front (no door, no sign) shares the sign of the first
    const signs = HOUSES.flatMap((h) => (h.spec.shops ?? []).map((s) => s.sign)).filter(Boolean);
    expect(new Set(signs).size).toBe(signs.length);
  });
});

/** Flank openings as rectangles along the flank (`a0..a1` metres back × `y0..y1`). */
function flankOpenings(flank) {
  const out = [];
  for (const w of flank.windows) {
    out.push({
      what: `flank window ${w.at}/${w.floor}`,
      floor: w.floor,
      a0: w.at - w.w * 0.5 - 0.06,
      a1: w.at + w.w * 0.5 + 0.06,
      y0: w.y - 0.07,
      y1: w.y + w.h + 0.07,
    });
  }
  for (const d of flank.doors) {
    const w = d.w ?? 1.0;
    out.push({
      what: `flank door ${d.at}`,
      floor: 0,
      a0: d.at - w * 0.5 - 0.06,
      a1: d.at + w * 0.5 + 0.06,
      y0: 0,
      y1: (d.h ?? 2.2) + 0.07,
    });
  }
  return out;
}

describe.each(HOUSES.map((h) => [h.id, h]))('House %s', (id, { spec, plan }) => {
  it('every flat has a way in; above a shop it is a door of its own', () => {
    const flats = spec.flats;
    if (flats.length === 0) return;
    const dwellings = plan.dwellings;
    const street = spec.entrances.some((e) => ['block', 'house', 'stair'].includes(e.kind));
    const viaShop = flats.every((f) => f.via === 'shop');
    // The only exception: the owner's single flat above their own shop
    if (!street) {
      expect(viaShop, 'flats without a street door').toBe(true);
      expect(dwellings, 'more than one flat behind the shop').toBe(1);
      expect(spec.shops?.length ?? 0).toBeGreaterThan(0);
    }
    if ((spec.shops?.length ?? 0) > 0 && !viaShop) {
      expect(spec.entrances.filter((e) => e.kind !== 'shop').length).toBeGreaterThan(0);
    }
  });

  it('split ACs: at most one per flat, never on stair windows or behind a fire escape', () => {
    const acs = plan.windows.filter((w) => w.kind === 'room' && w.cell.acBelow);
    const flankAcs = plan.flanks.flatMap((f) => f.windows.filter((w) => w.cell.acBelow));
    expect(acs.length + flankAcs.length).toBeLessThanOrEqual(plan.dwellings);
    const perFlat = new Map();
    for (const w of [...acs, ...flankAcs]) {
      expect(w.cell.flat, 'AC on a window that belongs to no flat').toBeTruthy();
      perFlat.set(w.cell.flat, (perFlat.get(w.cell.flat) ?? 0) + 1);
    }
    for (const w of acs) {
      expect(plan.flatPlan.underEscape(w.ax, w.floor), `AC behind escape ${w.ax}/${w.floor}`).toBe(
        false,
      );
    }
    for (const f of plan.flanks) {
      for (const w of f.windows.filter((fw) => fw.cell.acBelow)) {
        for (const e of f.escapes) {
          const behind = Math.abs(w.at - e.at) < e.halfW + w.w * 0.5;
          expect(behind, `flank AC ${w.at}/${w.floor} behind the fire escape`).toBe(false);
        }
      }
    }
    for (const [flat, n] of perFlat) expect(n, flat).toBe(1);
    // Every AC and flower box the spec asks for must land on a free room window
    for (const [ax, f] of [...(spec.acUnder ?? []), ...(spec.flowerBoxes ?? [])]) {
      expect(plan.flatPlan.cell(ax, f).type, `position ${ax}/${f}`).toBe('room');
      expect(plan.flatPlan.underEscape(ax, f), `${ax}/${f} behind a fire escape`).toBe(false);
    }
  });

  it('fire escapes only on 4+ storeys with several flats, one landing per upper storey', () => {
    if (!spec.egress) return;
    expect(spec.floors.length).toBeGreaterThanOrEqual(4);
    expect(plan.dwellings).toBeGreaterThan(1);
    for (const e of plan.escapes) {
      expect(e.landings.length).toBe(spec.floors.length - 1);
      // The gooseneck reaches over the parapet onto the roof deck behind it – or over the eave
      // onto a roof slope, which its 0.85 m hump clears
      const pitched = spec.roof.type === 'steppedGable';
      expect(e.roofY).toBeGreaterThan(plan.height);
      expect(e.deckY).toBeGreaterThan(plan.height);
      expect(e.deckY).toBeLessThan(pitched ? e.roofY + 0.85 - 0.2 : e.roofY);
    }
  });

  it('openings stay on the facade, under the crown, clear of each other and the belts', () => {
    if (plan.bespoke) return;
    const eps = 1e-6;
    const ops = openingsOf(plan);
    for (const o of ops) {
      expect(o.z0, o.what).toBeGreaterThanOrEqual(plan.zA - eps);
      expect(o.z1, o.what).toBeLessThanOrEqual(plan.zB + eps);
      expect(o.y0, o.what).toBeGreaterThanOrEqual(-eps);
      expect(o.y1, o.what).toBeLessThanOrEqual(plan.height + eps);
      if (o.window)
        expect(o.y1, `${o.what} runs into the cornice`).toBeLessThanOrEqual(plan.crownBottom + eps);
      // A belt course may be broken where a portal rises through it
      for (const belt of plan.belts) {
        const hit =
          o.y0 < belt.y1 - eps &&
          o.y1 > belt.y0 + eps &&
          o.z0 < belt.z1 - eps &&
          o.z1 > belt.z0 + eps;
        expect(hit, `${o.what} crosses the belt at ${belt.y0}`).toBe(false);
      }
    }
    for (let i = 0; i < ops.length; i++) {
      for (let j = i + 1; j < ops.length; j++) {
        const a = ops[i];
        const b = ops[j];
        const hit =
          a.z0 < b.z1 - eps && b.z0 < a.z1 - eps && a.y0 < b.y1 - eps && b.y0 < a.y1 - eps;
        expect(hit, `${a.what} overlaps ${b.what}`).toBe(false);
      }
    }
  });

  it('stoops reach no further than the tree line, leaving the walkway clear', () => {
    for (const e of plan.entrances) {
      if (!e.stoop) continue;
      const reach = (e.stoop.landing ?? 0.6) + (e.stoop.steps - 1) * (e.stoop.run ?? 0.28);
      // A house set back behind its front yard keeps its stoop in the yard
      if (plan.facadeX > 0) expect(reach, `${e.kind} stoop`).toBeLessThan(plan.facadeX);
      else expect(reach, `${e.kind} stoop`).toBeLessThanOrEqual(TREE_LINE);
    }
  });

  it('flank openings stay on the flank and inside their storey, clear of each other', () => {
    const floorY = [0];
    for (const fh of spec.floors) floorY.push(floorY[floorY.length - 1] + fh);
    for (const f of plan.flanks) {
      const ops = flankOpenings(f);
      for (const o of ops) {
        expect(o.a0, o.what).toBeGreaterThanOrEqual(0);
        expect(o.a1, o.what).toBeLessThanOrEqual(plan.depth);
        expect(o.y0, `${o.what} below its floor`).toBeGreaterThanOrEqual(floorY[o.floor]);
        expect(o.y1, `${o.what} above its floor`).toBeLessThanOrEqual(floorY[o.floor + 1]);
      }
      for (let i = 0; i < ops.length; i++) {
        for (let j = i + 1; j < ops.length; j++) {
          const a = ops[i];
          const b = ops[j];
          const hit = a.a0 < b.a1 && b.a0 < a.a1 && a.y0 < b.y1 && b.y0 < a.y1;
          expect(hit, `${a.what} overlaps ${b.what}`).toBe(false);
        }
      }
      // A fire escape on the flank stays on it
      for (const e of f.escapes) {
        expect(e.at - e.halfW, 'escape past the street corner').toBeGreaterThan(0);
        expect(e.at + e.halfW, 'escape past the back corner').toBeLessThan(plan.depth);
      }
    }
  });
});

describe('Neighbours', () => {
  const pairs = [];
  for (const h of HOUSES) {
    const right = h.next.spec && byId.get(h.next.spec);
    if (right) pairs.push([h, right]);
  }

  it('two neighbours never share both style and roof type', () => {
    for (const [a, b] of pairs) {
      const same = a.spec.style === b.spec.style && a.spec.roof.type === b.spec.roof.type;
      expect(same, `${a.id} | ${b.id}`).toBe(false);
    }
  });

  it('a house taller than its neighbour shows it a blank party wall with a parapet', () => {
    for (const h of HOUSES) {
      if (h.plan.bespoke || h.plan.facadeX >= 1) continue;
      for (const [side, lot] of [
        [-1, h.prev],
        [1, h.next],
      ]) {
        const below = lotTop(lot);
        const wall = h.plan.partyWalls.find((p) => p.side === side);
        const flank = h.plan.flanks.find((f) => f.side === side);
        const name = `${h.id} ${side < 0 ? 'left' : 'right'}`;
        if (flank) {
          // Over an open lot the flank is a facade of its own instead
          expect(wall, `${name}: party wall behind a flank facade`).toBeUndefined();
        } else if (below !== null && h.plan.top - below >= 0.5) {
          expect(wall, `${name}: no party wall over a lower neighbour`).toBeDefined();
        } else {
          expect(wall, `${name}: party wall where the neighbour is as tall`).toBeUndefined();
        }
      }
    }
  });

  it('flank facades (windows on a side wall) only face the alley, a square or a front garden', () => {
    for (const h of HOUSES) {
      for (const f of h.plan.flanks) {
        const lot = f.side < 0 ? h.prev : h.next;
        const name = `${h.id} ${f.side < 0 ? 'left' : 'right'} flank`;
        // A neighbour set back behind its front garden leaves the flank open that deep only:
        // everything on the flank stays within it (a house spanning two lots owns the second)
        const owner = getBuildingSpec(lot.spec) ?? ownerOf(lot);
        const yard = owner?.setback ?? 0;
        if (yard > 0) {
          const balcony = h.spec.flanks[f.side < 0 ? 'left' : 'right'].ironBalcony;
          const reach = Math.max(
            f.wrap,
            ...f.windows.map((w) => w.at + w.w * 0.5),
            ...f.doors.map((d) => d.at + (d.w ?? 1.0) * 0.5),
            ...f.escapes.map((e) => e.at + e.halfW),
            ...[...f.lamps, ...f.meters, ...f.downpipes].map((p) => p.at),
            ...(balcony?.span ?? []),
          );
          expect(reach, `${name} runs past the garden`).toBeLessThanOrEqual(yard);
          continue;
        }
        expect([LotType.ALLEY, LotType.PARK], name).toContain(lot.type);
        expect(lotTop(lot), name).toBe(0);
      }
    }
  });
});

describe('Built street', () => {
  let prevOffscreen;
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
  });
  afterAll(() => {
    globalThis.OffscreenCanvas = prevOffscreen;
  });

  it(`every chunk stays within ${CHUNK_TRIANGLE_BUDGET / 1000}k triangles`, () => {
    const store = new Store(PARAM_DEFS);
    const atlas = createFacadeAtlas(3);
    const factory = new BuildingFactory(atlas);
    for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
      const g = factory.buildChunk(StreetLayout.getChunk(c, store), store);
      // The near sidewalk counts too: it is drawn with the chunk
      const tris = (g.solidGeometry.index.count + (g.nearGeometry?.index.count ?? 0)) / 3;
      expect(tris, `chunk ${c}`).toBeLessThanOrEqual(CHUNK_TRIANGLE_BUDGET);
      g.solidGeometry.dispose();
      g.lightPoolGeometry.dispose();
      g.nearGeometry?.dispose();
    }
    atlas.dispose();
  });

  it('the atlas has a number plaque for every house and a sign for every shop', () => {
    const atlas = createFacadeAtlas(3);
    for (const h of HOUSES) {
      expect(atlas.tiles[`plaque_${h.spec.number}`], `plaque_${h.spec.number}`).toBeDefined();
      if (h.plan.bespoke) continue;
      for (const s of h.spec.shops ?? []) {
        for (const text of [s.sign, s.neonPanel, s.glassSign].filter(Boolean)) {
          expect(atlas.signs.get(text), text).toBeDefined();
        }
      }
      // Tiles of the house's own lettering: vertical signs, a canopy's end, a carved frieze, a
      // neon picture in a shop window, a script neon or a blade sign, the number in a tablet or
      // in brass on the door, stained glass over it, the date; windows glazed with a tile of
      // their own
      const n = h.spec.number;
      const numberTiles = { panel: `tablet_${n}`, door: `numerals_${n}` };
      const tiles = [
        ...(h.spec.signs ?? []).map((s) => s.tile),
        ...h.spec.entrances.map((e) => e.canopy?.sign),
        ...h.spec.entrances.map((e) => numberTiles[e.numberOn]),
        ...h.spec.entrances.map((e) => e.stained),
        ...(h.spec.shops ?? []).flatMap((s) => [s.neonTile, s.script, s.blade?.tile]),
        ...Object.values(h.spec.windows?.cells ?? {}).map((c) => c.tile),
        ...(h.spec.bays ?? []).map((bay) => bay.win?.tile),
        h.spec.wall?.frieze?.inscription,
        h.spec.cornice?.date && `date_${h.spec.cornice.date}`,
      ].filter(Boolean);
      for (const t of tiles) expect(atlas.tiles[t], `${h.id}: ${t}`).toBeDefined();
    }
    atlas.dispose();
  });
});

describe('Street trees', () => {
  const PLAN = planStreetTrees({ seed: 1, density: 0.55 });
  const ALL = planStreetTrees({ seed: 1, density: 1 });
  const wrapDist = (a, b) => {
    const d = Math.abs(a - b) % 240;
    return Math.min(d, 240 - d);
  };
  const lampsZ = [];
  const hydrantsZ = [];
  for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
    const lots = StreetLayout.getChunk(c, null).right;
    for (const l of streetLampsOf(lots)) lampsZ.push(lots[l.lot].centerZ + l.z);
    const hy = hydrantOf(lots);
    if (hy) hydrantsZ.push(lots[hy.lot].centerZ + hy.z);
  }

  it('city trees: a clear trunk, a crown between the 2nd and 3rd floors, in a pit by the curb', () => {
    for (const t of ALL.trees) {
      const c = t.crown;
      const id = `${t.lot} z ${t.z.toFixed(1)}`;
      expect(t.clear, id).toBeGreaterThanOrEqual(2.6);
      expect(t.clear, id).toBeLessThanOrEqual(3.0);
      expect(c.y + c.ry, `${id} height`).toBeGreaterThanOrEqual(7);
      expect(c.y + c.ry, `${id} height`).toBeLessThanOrEqual(9);
      expect(c.rz * 2, `${id} crown`).toBeGreaterThanOrEqual(3.4);
      expect(c.rz * 2, `${id} crown`).toBeLessThanOrEqual(5);
      // Pruned back from the facades, the pit's centre 0.6–0.7 m behind the curb
      expect(c.x + c.rx, id).toBeLessThanOrEqual(BUILDING_LINE_X - CROWN_CLEAR + 1e-9);
      expect(TREE_X - (ROAD_FAR_X + CURB_W)).toBeGreaterThanOrEqual(0.6);
      expect(TREE_X - (ROAD_FAR_X + CURB_W)).toBeLessThanOrEqual(0.7);
    }
  });

  it('pits keep clear of doors and stoops, hydrants, the alley mouth and the bus stops', () => {
    const pit = TREE_PIT * 0.5;
    for (const t of ALL.trees) {
      const id = `${t.lot} z ${t.z.toFixed(1)}`;
      for (const h of HOUSES) {
        if (h.plan.facadeX >= 1) continue;
        for (const [a, b] of h.plan.doorZones) {
          const z0 = h.lot.centerZ + a;
          const z1 = h.lot.centerZ + b;
          const d = t.z < z0 ? z0 - t.z : t.z > z1 ? t.z - z1 : 0;
          expect(d, `${id} before the door of ${h.id}`).toBeGreaterThanOrEqual(pit - 1e-9);
        }
      }
      for (const hz of hydrantsZ) {
        expect(wrapDist(t.z, hz), `${id} hydrant`).toBeGreaterThanOrEqual(1.5);
      }
      const lot = LOTS.find((l) => t.z >= l.zStart && t.z < l.zEnd);
      expect(lot.type, id).not.toBe(LotType.ALLEY);
      expect(lot.type, id).not.toBe(LotType.BUS_STOP);
    }
  });

  it('crowns clear the street lamps’ heads and each other', () => {
    for (const t of ALL.trees) {
      const c = t.crown;
      const id = `${t.lot} z ${t.z.toFixed(1)}`;
      // The crown's section at the height of a lamp's head
      const k = (c.y - LAMP_HEAD.top) / c.ry;
      const reach = Math.abs(k) < 1 ? c.rz * Math.sqrt(1 - k * k) : 0;
      for (const lz of lampsZ) {
        expect(wrapDist(t.z, lz), `${id} lamp at ${lz.toFixed(1)}`).toBeGreaterThan(
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

  it('a steady rhythm: a free spot on every chunk, no stretch longer than 18.5 m without one', () => {
    const zs = ALL.trees.map((t) => t.z);
    for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
      expect(
        zs.some((z) => z >= c * 20 && z < c * 20 + 20),
        `chunk ${c}`,
      ).toBe(true);
    }
    for (let i = 0; i < zs.length; i++) {
      const gap = i ? zs[i] - zs[i - 1] : zs[0] + 240 - zs[zs.length - 1];
      expect(gap, `before z ${zs[i].toFixed(1)}`).toBeLessThanOrEqual(18.5);
    }
  });

  it('street.treeDensity is the share of the spots planted; a house’s own tree always stands', () => {
    const own = ALL.trees.filter((t) => t.own);
    expect(own.map((t) => t.lot)).toEqual(['6_right_1']);
    expect(ALL.trees.length).toBe(ALL.spots.length + own.length);
    expect(planStreetTrees({ seed: 1, density: 0 }).trees).toEqual(own);
    const share = (PLAN.trees.length - own.length) / PLAN.spots.length;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.8);
    // Spread along the street: at the default density no stretch over 26 m without a tree
    const zs = PLAN.trees.map((t) => t.z);
    for (let i = 0; i < zs.length; i++) {
      const gap = i ? zs[i] - zs[i - 1] : zs[0] + 240 - zs[zs.length - 1];
      expect(gap, `before z ${zs[i].toFixed(1)}`).toBeLessThanOrEqual(26);
    }
  });
});
