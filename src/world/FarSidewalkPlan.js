/**
 * The far sidewalk's furniture (`STREETSCAPE_PLAN.md`, Stage F), the twin of `NearSidewalkPlan`:
 * the street lamps and hydrants of the chunks of houses, the litter bins beside a share of the
 * lamps, the street trees (`StreetTreePlan`) and the bollards – by the rules of
 * `SidewalkFurniture`. Every lot but the bus stops and the alley gets its row of bollards along
 * the curb; a bollard that would stand before a door, a stoop, a shop door, a gate, the mailbox
 * or the hotel's canopy, or crowd a pit, a lamp, a bin or the hydrant, slides along the curb out
 * of the way (or is left out). Parked bicycles stay with their lots (`BuildingFactory`).
 *
 * Pure data, no three.js. Frame: world X, Y up from the sidewalk, Z along the loop (0–240 m).
 */
import { CHUNK_LENGTH } from '../config/constants.js';
import { LotType, TOTAL_LOOP_CHUNKS } from '../simulation/street/StreetLayout.js';
import {
  FOOTPRINT,
  FURNITURE_RULES,
  bollardRow,
  farFixtures,
  farKeepOuts,
  loopDist,
  nearAny,
} from './SidewalkFurniture.js';
import { planStreet } from './StreetAudit.js';
import { planStreetTrees } from './StreetTreePlan.js';

let _cache = null;

/**
 * The far sidewalk of the whole loop.
 * @param {{ seed?: number, density?: number }} [o] `street.seed`, `street.treeDensity`
 * @returns {{ lamps: number[], bins: number[], hydrants: number[], trees: object[],
 *   spots: object[], bollards: number[] }} loop Z; `spots` every free tree spot, planted or not
 */
export function planFarSidewalk(o = {}) {
  const seed = o.seed ?? 1;
  const density = Math.min(1, Math.max(0, o.density ?? 0.55));
  const key = `${seed}|${density}`;
  if (_cache?.key === key) return _cache.value;

  const F = FURNITURE_RULES;
  const { lamps, bins, hydrants } = farFixtures(seed);
  const { trees, spots } = planStreetTrees({ seed, density });
  const { spans } = farKeepOuts();
  const { lots } = planStreet(null);

  const room = (kind) => FOOTPRINT.bollard[1] + FOOTPRINT[kind][1] + F.clear;
  const pits = trees.map((t) => t.z);
  const pad = FOOTPRINT.bollard[1] + F.doorPad;
  const blocked = (z) =>
    spans.some((s) => loopDist(z, s.z0, s.z1) < pad) ||
    nearAny(pits, z, room('tree')) ||
    nearAny(lamps, z, room('lamp')) ||
    nearAny(bins, z, room('bin')) ||
    nearAny(hydrants, z, room('hydrant'));
  // A row on every lot, kept apart from the last lot's row too
  const bollards = [];
  const apart = (z) => blocked(z) || nearAny(bollards, z, F.bollardSpacing);
  for (const lot of lots) {
    if (lot.type === LotType.BUS_STOP || lot.type === LotType.ALLEY) continue;
    bollards.push(...bollardRow(lot.zStart, lot.zEnd, apart));
  }

  const value = { lamps, bins, hydrants, trees, spots, bollards };
  _cache = { key, value };
  return value;
}

/**
 * The far sidewalk of one chunk of the endless street (the loop repeats every
 * `TOTAL_LOOP_CHUNKS` chunks), in world Z.
 * @param {number} chunkIndex
 * @param {{ seed?: number, density?: number }} [o]
 */
export function farSidewalkOfChunk(chunkIndex, o) {
  const cycle = ((chunkIndex % TOTAL_LOOP_CHUNKS) + TOTAL_LOOP_CHUNKS) % TOTAL_LOOP_CHUNKS;
  const z0 = cycle * CHUNK_LENGTH;
  const shift = (chunkIndex - cycle) * CHUNK_LENGTH;
  const here = (z) => z >= z0 && z < z0 + CHUNK_LENGTH;
  const zs = (list) => list.filter(here).map((z) => z + shift);
  const plan = planFarSidewalk(o);
  return {
    lamps: zs(plan.lamps),
    bins: zs(plan.bins),
    hydrants: zs(plan.hydrants),
    bollards: zs(plan.bollards),
    trees: plan.trees
      .filter((t) => here(t.z))
      .map((t) => ({ ...t, z: t.z + shift, crown: { ...t.crown, z: t.crown.z + shift } })),
  };
}
