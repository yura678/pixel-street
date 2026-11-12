/**
 * Street trees (`STREETSCAPE_PLAN.md`, Stage D): where they stand along the far sidewalk and how
 * much room their crowns get. Pure data, no three.js – the factory builds the trees from it
 * (`architecture/StreetTrees.js`), the rules test checks it, and the crowns are where the falling
 * leaves of Stage 6 come from.
 *
 * Rhythm instead of chance: a candidate spot every `TREE_RULES.step` metres of the loop, slid
 * along the curb (at most `nudge`) out of the way of doors and stoops, shop doors, the garden
 * gate, the mailbox, the lamps, the hydrants, the litter bins and parked bicycles; none at the
 * bus stops or by the alley mouth (what to keep clear of: `SidewalkFurniture`). A crown keeps clear of the street lamps and the hotel's canopy: near one it grows
 * narrower along the street, and where even the narrowest crown would touch, the spot slides on
 * or stays empty. `street.treeDensity` is the share of the free spots planted, spread evenly
 * along the loop (an error-diffusion walk whose phase comes from the street seed). A house may
 * plant a tree of its own (`sidewalk.tree`, № 136): always there. Every tree is a London plane.
 *
 * Every crown is an ellipsoid over its trunk. It never reaches closer to the building line than
 * `CROWN_CLEAR`, where the awnings, blade signs, bays and fire escapes stand out (were the
 * sidewalk narrower, the crown would lean over the road instead). Its size along the street and
 * its height come from the spot itself, not from the seed – the seed picks only which spots are
 * planted.
 *
 * Frame: world X, Y up from the sidewalk, Z along the loop (0–240 m).
 */
import { BUILDING_LINE_X, CROWN_CLEAR, TREE_PIT } from '../config/streetProfile.js';
import { Rng } from '../core/random.js';
import { LOOP_LENGTH } from '../simulation/street/StreetLayout.js';
import {
  FOOTPRINT,
  FURNITURE,
  FURNITURE_RULES,
  curbX,
  farFixtures,
  farKeepOuts,
  loopDist,
  wrap,
} from './SidewalkFurniture.js';
import { planStreet } from './StreetAudit.js';

/** Trunk line of the far sidewalk: the centre of every tree pit. */
export const TREE_X = curbX(1, FURNITURE.tree);

export const TREE_RULES = Object.freeze({
  /** Candidate spots along the loop (`LOOP_LENGTH` is a whole number of steps). */
  step: 8,
  /** How far a spot may slide along the curb to find room, and in what steps. */
  nudge: 3.0,
  nudgeStep: 0.1,
  /** Trunk to trunk at least; and two crowns never touch (`crownGap` between them). */
  minSpacing: 4.5,
  crownGap: 0.3,
  /**
   * Clear sidewalk between a pit and a shop door. The planner's door zones of the houses are
   * already wider than their doors and stoops (`SpecPlanner`): a pit may touch them.
   */
  doorPad: FURNITURE_RULES.doorPad,
  /** Trunk to hydrant, and trunk to a lamp's post, at least. */
  hydrant: FURNITURE_RULES.treeHydrant,
  lamp: FURNITURE_RULES.treeLamp,
  /** A crown's edge clears a street lamp's shade by this much. */
  lampGap: 0.15,
  /** … and the hotel's canopy, its posts at the curb included. */
  canopyGap: 0.25,
  /** … and a bus stop (its shelter, flag and the taxi pulling in). */
  stopGap: 0.2,
  /** Half sizes of a crown: across the street (fixed), along it and up (from the spot). */
  rx: 1.8,
  rz: [1.9, 2.4],
  ry: [2.4, 3.1],
  /** The narrowest crown along the street before a spot gives up. */
  minRz: 1.7,
  /** Clear trunk under the crown: people walk under it. */
  clear: [2.7, 3.0],
  /**
   * The crown's centre stands this share of its half height over the clear trunk: the leaves
   * begin at the top of the clear trunk, the ellipsoid's narrow tip reaches a little below it.
   */
  drop: 0.8,
});

/**
 * What the trees must keep clear of, in loop Z: `ground` intervals the trunk may not stand in
 * (already widened by the pit and its clearance) and `crown` intervals the crown must clear by
 * `gap`. Also the trees the houses plant themselves. The doors, stops and furniture come from
 * `SidewalkFurniture`; the areaways and parked bicycles are the trees' own concern.
 * @param {number} seed the street seed (it picks the lamps with a litter bin)
 */
function keepOuts(seed) {
  const { houses } = planStreet(null);
  const { spans, own } = farKeepOuts();
  const fixtures = farFixtures(seed);
  const ground = [];
  const crown = [];
  const pit = TREE_PIT * 0.5;
  const R = TREE_RULES;

  for (const { z0, z1, what } of spans) {
    if (what === 'door' || what === 'alley') {
      // The planner's door zones are wide enough already; the alley span has its ramp blocks
      ground.push([z0, z1, pit, what]);
    } else if (what === 'stop') {
      ground.push([z0, z1, pit, what]);
      crown.push([z0, z1, R.stopGap, what]);
    } else if (what === 'mailbox') {
      ground.push([z0, z1, pit + 0.15, what]);
    } else if (what === 'bicycle') {
      ground.push([z0, z1, pit + 0.1, what]);
    } else {
      // Shop doors, a garden gate, a hotel's canopy (which the crown clears as well)
      ground.push([z0, z1, pit + R.doorPad, what]);
      if (what === 'canopy') crown.push([z0, z1, R.canopyGap, what]);
    }
  }
  // An areaway whose railing (and coping) reaches out to the pits
  const pitInner = BUILDING_LINE_X - TREE_X - pit;
  for (const { plan, lot } of houses) {
    if (plan.facadeX >= 1) continue;
    for (const a of plan.areaways) {
      if (plan.facadeX + a.depth + 0.15 < pitInner) continue;
      ground.push([lot.centerZ + a.z0, lot.centerZ + a.z1, pit, 'areaway']);
    }
  }
  for (const z of fixtures.lamps) ground.push([z, z, R.lamp, 'lamp']);
  for (const z of fixtures.hydrants) ground.push([z, z, R.hydrant, 'hydrant']);
  const binPad = pit + FOOTPRINT.bin[1] + FURNITURE_RULES.gap;
  for (const z of fixtures.bins) ground.push([z, z, binPad, 'bin']);
  return { ground, crown, lamps: fixtures.lamps, own };
}

/** The lot of the loop under `z`. */
function lotAt(lots, z) {
  const zz = wrap(z);
  return lots.find((l) => zz >= l.zStart && zz < l.zEnd) ?? lots[lots.length - 1];
}

/** The size of a spot's tree from its own dice: crown along the street and up, clear trunk. */
export function spotSize(r) {
  const R = TREE_RULES;
  return {
    rz: r.range(R.rz[0], R.rz[1]),
    ry: r.range(R.ry[0], R.ry[1]),
    clear: r.range(R.clear[0], R.clear[1]),
    seed: r.next(),
    setts: r.chance(0.5),
  };
}

/**
 * Crown centre across the street: over the trunk, unless that would bring it closer to the
 * facades than `CROWN_CLEAR` – then it leans over the road.
 */
export const CROWN_X = Math.min(TREE_X, BUILDING_LINE_X - CROWN_CLEAR - TREE_RULES.rx);

/**
 * The widest a crown may grow along the street (half size) with a street lamp `d` metres away:
 * the lamp's head (its arm and shade, `LAMP_HEAD`) stands under the crown's lower curve, so
 * only the crown's section at the head's height has to clear it.
 */
export function rzBesideLamp(d, size) {
  const { ry, clear } = size;
  const t = (clear + ry * TREE_RULES.drop - LAMP_HEAD.top) / ry;
  if (t >= 1) return Infinity;
  const s = Math.sqrt(1 - t * t);
  return (d - LAMP_HEAD.halfZ - TREE_RULES.lampGap) / s;
}

/** A street lamp's head: the top of its arm, its shade's half width along the street. */
export const LAMP_HEAD = Object.freeze({ top: 3.92, halfZ: 0.18 });

/** A tree record at loop `z` with a crown of half length `rz`. */
function makeTree(z, rz, size, lot, extra) {
  const R = TREE_RULES;
  return {
    z,
    x: TREE_X,
    lot: lot.id,
    clear: size.clear,
    seed: size.seed,
    crown: { x: CROWN_X, y: size.clear + size.ry * R.drop, z, rx: R.rx, ry: size.ry, rz },
    ...extra,
  };
}

/**
 * The share `density` of the free `spots` (in loop order) planted, spread evenly along the
 * street: an error-diffusion walk that earns `density` of a tree per step of street, so a
 * stretch without free spots leaves the next one planted (but never a run of plantings to
 * catch up). `phase` (0–1) starts the walk.
 * @template {{ z: number }} T
 * @param {T[]} spots
 * @param {number} density
 * @param {number} phase
 * @returns {T[]}
 */
export function plantEvenly(spots, density, phase) {
  let acc = phase;
  let last = spots.length ? spots[spots.length - 1].z - LOOP_LENGTH : 0;
  const planted = [];
  for (const sp of spots) {
    acc += ((sp.z - last) / TREE_RULES.step) * density;
    last = sp.z;
    if (density >= 1 || acc >= 1) {
      acc = Math.min(acc - 1, 0.5);
      planted.push(sp);
    }
  }
  return planted;
}

let _cache = null;

/**
 * The trees of the loop.
 * @param {{ seed?: number, density?: number }} [o] `street.seed`, `street.treeDensity`
 * @returns {{ trees: object[], spots: object[] }} `trees` in loop order; `spots` every free
 *   candidate spot whether planted or not (what any density could plant)
 */
export function planStreetTrees(o = {}) {
  const seed = o.seed ?? 1;
  const density = Math.min(1, Math.max(0, o.density ?? 0.55));
  const key = `${seed}|${density}`;
  if (_cache?.key === key) return _cache.value;

  const R = TREE_RULES;
  const { lots } = planStreet(null);
  const { ground, crown, lamps, own } = keepOuts(seed);

  // The houses' own trees first: they are part of the houses
  const placed = own.map((t, i) => {
    const size = spotSize(Rng.fork(0, 900 + i, 4243));
    return makeTree(t.z, size.rz, size, t.lot, { own: true, fill: 'soil' });
  });

  /** The widest crown (half length along the street) at `z`, 0 where the pit may not go. */
  const roomFor = (z, size) => {
    for (const [a, b, pad] of ground) if (loopDist(z, a, b) < pad) return 0;
    let rz = Infinity;
    for (const t of placed) {
      const d = loopDist(z, t.z, t.z);
      if (d < R.minSpacing) return 0;
      rz = Math.min(rz, d - t.crown.rz - R.crownGap);
    }
    for (const [a, b, gap] of crown) rz = Math.min(rz, loopDist(z, a, b) - gap);
    for (const lz of lamps) rz = Math.min(rz, rzBesideLamp(loopDist(z, lz, lz), size));
    return rz;
  };

  const spots = [];
  const count = Math.round(LOOP_LENGTH / R.step);
  const steps = Math.round(R.nudge / R.nudgeStep);
  for (let k = 0; k < count; k++) {
    const nominal = (k + 0.5) * R.step;
    const size = spotSize(Rng.fork(0, k, 4243));
    for (let i = 0; i <= steps * 2; i++) {
      // 0, +0.1, −0.1, +0.2, … : the nearest free place to the nominal spot
      const d = Math.ceil(i / 2) * R.nudgeStep * (i % 2 ? 1 : -1);
      const z = wrap(nominal + d);
      const room = roomFor(z, size);
      if (room < R.minRz) continue;
      const lot = lotAt(lots, z);
      const tree = makeTree(z, Math.min(size.rz, room), size, lot, {
        spot: k,
        own: false,
        fill: size.setts ? 'setts' : 'soil',
      });
      spots.push(tree);
      placed.push(tree);
      break;
    }
  }

  const planted = plantEvenly(spots, density, (seed * 0.6180339887) % 1);
  const trees = [...placed.filter((t) => t.own), ...planted].sort((a, b) => a.z - b.z);
  const value = { trees, spots };
  _cache = { key, value };
  return value;
}
