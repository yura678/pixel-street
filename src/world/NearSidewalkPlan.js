/**
 * The near sidewalk (`STREETSCAPE_PLAN.md`, Stage E): the far sidewalk's mirror on the camera's
 * side (−X) – the same curb, 5.0 m of slabs to `NEAR_BUILDING_LINE_X`, the same furniture at the
 * same distances from the curb, the same London planes by the same rules. No houses stand on this
 * side, so there are no doors, bus stops, bicycles or alley mouths to keep clear of; the rhythm
 * is its own (spots between the far ones, its own dice), so the street is no copy of itself.
 *
 *  - Street lamps alternate with the far ones: every gap between two far lamps on the loop gets
 *    `round(gap / lampSpan)` near lamps (none in a gap under `lampMinGap`), dividing it evenly,
 *    so the pools of light on the road alternate from side to side.
 *  - A litter bin beside some lamps (`SidewalkFurniture.binsBeside`, from the street seed).
 *  - A fire hydrant every two chunks, clear of the lamps.
 *  - Trees: a candidate spot every `TREE_RULES.step` metres, half a step off the far side's
 *    spots, kept clear of the lamps' heads, the bins and the hydrants; `street.treeDensity` is
 *    the share planted (the same even walk as the far side, half a cycle out of phase).
 *  - Bollards every ~3.1 m along the curb (`SidewalkFurniture.bollardRow`), making way for the
 *    pits, lamps, bins and hydrants.
 *
 * Lines, footprints and the rules between the pieces are the far side's: `SidewalkFurniture`.
 * Pure data, no three.js. Frame: world X, Y up from the sidewalk, Z along the loop (0–240 m).
 */
import { CHUNK_LENGTH } from '../config/constants.js';
import { CROWN_CLEAR, NEAR_BUILDING_LINE_X, TREE_PIT } from '../config/streetProfile.js';
import { Rng } from '../core/random.js';
import { LOOP_LENGTH, TOTAL_LOOP_CHUNKS } from '../simulation/street/StreetLayout.js';
import {
  FOOTPRINT,
  FURNITURE,
  FURNITURE_RULES,
  binsBeside,
  bollardRow,
  curbX,
  farFixtures,
  loopDist,
  nearAny,
  wrap,
} from './SidewalkFurniture.js';
import { TREE_RULES, plantEvenly, rzBesideLamp, spotSize } from './StreetTreePlan.js';

/** Trunk line of the near sidewalk: the centre of every tree pit (−4.64). */
export const NEAR_TREE_X = curbX(-1, FURNITURE.tree);
/** Crown centre across the street: over the trunk, `CROWN_CLEAR` off the near building line. */
export const NEAR_CROWN_X = Math.max(
  NEAR_TREE_X,
  NEAR_BUILDING_LINE_X + CROWN_CLEAR + TREE_RULES.rx,
);

export const NEAR_RULES = Object.freeze({
  /** A gap between two far lamps gets one near lamp per this many metres… */
  lampSpan: 20,
  /** …and none when it is shorter than this. */
  lampMinGap: 10,
  /** A hydrant every two chunks, at this loop Z of its pair, slid clear of lamps and bins. */
  hydrantStep: 2 * CHUNK_LENGTH,
  hydrantAt: 14,
  hydrantClear: 2.0,
});

/** Near lamps alternating with the far ones (loop Z, in order). */
function nearLamps() {
  const far = farFixtures().lamps;
  const out = [];
  for (let i = 0; i < far.length; i++) {
    const a = far[i];
    const gap = i + 1 < far.length ? far[i + 1] - a : far[0] + LOOP_LENGTH - a;
    if (gap < NEAR_RULES.lampMinGap) continue;
    const n = Math.max(1, Math.round(gap / NEAR_RULES.lampSpan));
    for (let j = 1; j <= n; j++) out.push(wrap(a + (gap * j) / (n + 1)));
  }
  return out.sort((x, y) => x - y);
}

/** A near tree record at loop `z` with a crown of half length `rz`. */
function makeNearTree(z, rz, size, extra) {
  return {
    z,
    x: NEAR_TREE_X,
    lot: 'near',
    side: -1,
    clear: size.clear,
    seed: size.seed,
    crown: {
      x: NEAR_CROWN_X,
      y: size.clear + size.ry * TREE_RULES.drop,
      z,
      rx: TREE_RULES.rx,
      ry: size.ry,
      rz,
    },
    ...extra,
  };
}

let _cache = null;

/**
 * The near sidewalk of the whole loop.
 * @param {{ seed?: number, density?: number }} [o] `street.seed`, `street.treeDensity`
 * @returns {{ lamps: number[], bins: number[], hydrants: number[], trees: object[],
 *   spots: object[], bollards: number[] }} loop Z; `spots` every free tree spot, planted or not
 */
export function planNearSidewalk(o = {}) {
  const seed = o.seed ?? 1;
  const density = Math.min(1, Math.max(0, o.density ?? 0.55));
  const key = `${seed}|${density}`;
  if (_cache?.key === key) return _cache.value;

  const N = NEAR_RULES;
  const R = TREE_RULES;
  const F = FURNITURE_RULES;
  const pit = TREE_PIT * 0.5;

  const lamps = nearLamps();
  const bins = binsBeside(lamps, seed, 7311);

  // Hydrants: slid along the curb (+0.25, −0.25, +0.5, …) clear of the lamps and bins
  const hydrants = [];
  for (let z0 = N.hydrantAt; z0 < LOOP_LENGTH; z0 += N.hydrantStep) {
    for (let i = 0; i < 40; i++) {
      const z = wrap(z0 + Math.ceil(i / 2) * 0.25 * (i % 2 ? 1 : -1));
      if ([...lamps, ...bins].every((q) => loopDist(z, q, q) >= N.hydrantClear)) {
        hydrants.push(z);
        break;
      }
    }
  }

  // Trees: the far side's rules, without the houses
  const ground = [
    ...lamps.map((z) => [z, R.lamp]),
    ...bins.map((z) => [z, pit + FOOTPRINT.bin[1] + F.gap]),
    ...hydrants.map((z) => [z, R.hydrant]),
  ];
  const placed = [];
  const roomFor = (z, size) => {
    for (const [q, pad] of ground) if (loopDist(z, q, q) < pad) return 0;
    let rz = Infinity;
    for (const t of placed) {
      const d = loopDist(z, t.z, t.z);
      if (d < R.minSpacing) return 0;
      rz = Math.min(rz, d - t.crown.rz - R.crownGap);
    }
    for (const lz of lamps) rz = Math.min(rz, rzBesideLamp(loopDist(z, lz, lz), size));
    return rz;
  };
  const spots = [];
  const count = Math.round(LOOP_LENGTH / R.step);
  const steps = Math.round(R.nudge / R.nudgeStep);
  for (let k = 0; k < count; k++) {
    const size = spotSize(Rng.fork(0, k, 4244));
    for (let i = 0; i <= steps * 2; i++) {
      const z = wrap(k * R.step + Math.ceil(i / 2) * R.nudgeStep * (i % 2 ? 1 : -1));
      const room = roomFor(z, size);
      if (room < R.minRz) continue;
      const tree = makeNearTree(z, Math.min(size.rz, room), size, {
        spot: k,
        own: false,
        fill: size.setts ? 'setts' : 'soil',
      });
      spots.push(tree);
      placed.push(tree);
      break;
    }
  }
  spots.sort((a, b) => a.z - b.z);
  const trees = plantEvenly(spots, density, (((seed * 0.6180339887) % 1) + 0.5) % 1);

  // Bollards in a steady row, making way for everything else at the curb
  const room = (kind) => FOOTPRINT.bollard[1] + FOOTPRINT[kind][1] + F.clear;
  const pits = trees.map((t) => t.z);
  const bollards = bollardRow(
    0,
    LOOP_LENGTH,
    (z) =>
      nearAny(pits, z, room('tree')) ||
      nearAny(lamps, z, room('lamp')) ||
      nearAny(bins, z, room('bin')) ||
      nearAny(hydrants, z, room('hydrant')),
  ).map(wrap);

  const value = { lamps, bins, hydrants, trees, spots, bollards };
  _cache = { key, value };
  return value;
}

/**
 * The near sidewalk of one chunk of the endless street (the loop repeats every
 * `TOTAL_LOOP_CHUNKS` chunks), in world Z.
 * @param {number} chunkIndex
 * @param {{ seed?: number, density?: number }} [o]
 */
export function nearSidewalkOfChunk(chunkIndex, o) {
  const cycle = ((chunkIndex % TOTAL_LOOP_CHUNKS) + TOTAL_LOOP_CHUNKS) % TOTAL_LOOP_CHUNKS;
  const z0 = cycle * CHUNK_LENGTH;
  const shift = (chunkIndex - cycle) * CHUNK_LENGTH;
  const here = (z) => z >= z0 && z < z0 + CHUNK_LENGTH;
  const zs = (list) => list.filter(here).map((z) => z + shift);
  const plan = planNearSidewalk(o);
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
