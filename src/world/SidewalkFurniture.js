/**
 * Street furniture of both sidewalks in one place (`STREETSCAPE_PLAN.md`, Stage F): where each
 * piece stands across the street (its line behind the curb face, the same on either side), how
 * much room it takes, the rules between the pieces, and the shared ways of placing them – the
 * street lamps and hydrant of a chunk of houses, the bollard row, the litter bins beside the
 * lamps, the doors and stops to keep clear. `FarSidewalkPlan` and `NearSidewalkPlan` plan their
 * side with these; `BuildingFactory` builds both sides with one builder.
 *
 * Zones across a sidewalk, from the curb face to the building line (5.27 m):
 *   0 … `strip` (1.5 m)        the furnishing strip: bollards, lamps, bins, hydrants, parked
 *                              bicycles, the mailbox, the bus stops and the tree pits (to 1.49 m)
 *   … to `frontage` (0.92 m)   the walk: nothing stands in it below `head` (2.0 m) but the
 *     off the building line    houses' own stoops and areaways (no further than the tree line)
 *                              and the steps of the pocket square
 *   the last `frontage`         café tables, benches, stalls and racks against the facades
 *
 * Pure data, no three.js. Z along the loop (0–240 m) unless said otherwise.
 */
import { getBuildingSpec } from '../config/buildings/index.js';
import {
  CURB_BLOCK,
  FURNITURE,
  ROAD_FAR_X,
  ROAD_NEAR_X,
  TREE_PIT,
} from '../config/streetProfile.js';
import { Rng } from '../core/random.js';
import {
  LOOP_LENGTH,
  LotType,
  StreetLayout,
  TOTAL_LOOP_CHUNKS,
} from '../simulation/street/StreetLayout.js';
import { SHOP_DOOR } from './architecture/SpecPlanner.js';
import { planStreet } from './StreetAudit.js';

/** Each piece's line: how far its centre stands behind the curb face (either side). */
export { FURNITURE };

/**
 * Half the room each piece takes on the sidewalk (its base, its widest part below head height):
 * `[across, along]` the street. A tree takes its pit; a parked bicycle its rack and wheels.
 */
export const FOOTPRINT = Object.freeze({
  bollard: [0.092, 0.092],
  lamp: [0.13, 0.13],
  hydrant: [0.16, 0.16],
  bin: [0.21, 0.21],
  rack: [0.05, 0.4],
  bike: [0.24, 0.9],
  mailbox: [0.25, 0.25],
  tree: [TREE_PIT * 0.5, TREE_PIT * 0.5],
});

export const FURNITURE_RULES = Object.freeze({
  /** The furnishing strip behind the curb face; the frontage by the facades; head height. */
  strip: 1.5,
  frontage: 0.92,
  head: 2.0,
  /** Two pieces at the curb never come closer than this between their footprints… */
  gap: 0.1,
  /** …and a bollard keeps this much room from the pieces it makes way for. */
  clear: 0.3,
  /** A tree's trunk keeps this far from a lamp's post and from a hydrant. */
  treeLamp: 1.2,
  treeHydrant: 1.5,
  /** Furniture keeps this clear of a door, a stoop, a shop door or a gate (beyond itself). */
  doorPad: 0.2,
  /**
   * Bollards: one per ~`bollardStep` of a run, each slid at most `bollardSlide` of its pitch to
   * find room (so at most to the edge of its own share of the run).
   */
  bollardStep: 3.1,
  bollardSlide: 0.5,
  bollardSlideStep: 0.05,
  /** …and never closer than this to the next bollard. */
  bollardSpacing: 1.2,
  /** Share of the lamps with a litter bin beside them, and where it stands (along Z). */
  binShare: 0.5,
  binDz: 0.48,
});

/** World X of a piece `d` metres behind the curb face of the far (`side` +1) or near (−1) side. */
export const curbX = (side, d) => (side > 0 ? ROAD_FAR_X + d : ROAD_NEAR_X - d);

/** Positive remainder of `z` on the loop. */
export function wrap(z) {
  return ((z % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
}

/** Wrapped distance from `z` to the interval `[a, b]` on the loop. */
export function loopDist(z, a, b) {
  let best = Infinity;
  for (const k of [-LOOP_LENGTH, 0, LOOP_LENGTH]) {
    const zz = z + k;
    const d = zz < a ? a - zz : zz > b ? zz - b : 0;
    best = Math.min(best, d);
  }
  return best;
}

/**
 * Street lamps of one chunk's lots: on every other lot that asks for one, at its left party
 * wall; never in the alley mouth or at a bus stop.
 * @param {object[]} lots `StreetLayout.getChunk(…).right`
 * @returns {Array<{ lot: number, z: number }>} z lot-local
 */
export function streetLampsOf(lots) {
  const out = [];
  lots.forEach((lot, i) => {
    if (!lot.hasLamp || lot.type === LotType.ALLEY || lot.type === LotType.BUS_STOP) return;
    if (i % 2 !== 0) return;
    out.push({ lot: i, z: -lot.width * 0.46 });
  });
  return out;
}

/**
 * The fire hydrant of a chunk: at the left of its second lot, unless that is the alley or a bus
 * stop.
 * @param {object[]} lots
 * @returns {{ lot: number, z: number } | null} z lot-local
 */
export function hydrantOf(lots) {
  const lot = lots[1];
  if (!lot || lot.type === LotType.BUS_STOP || lot.type === LotType.ALLEY) return null;
  // Out to the party wall, clear of the house's own tree (№ 136)
  const own = getBuildingSpec(lot.spec)?.sidewalk?.tree !== undefined;
  return { lot: 1, z: -lot.width * (own ? 0.46 : 0.36) };
}

/**
 * Where the door of a shopfront stands (lot-local Z), as the shopfront builders place it; the
 * fronts whose door is not given (a workshop, an arched front) keep their whole width.
 */
function shopDoorSpan(s, zA) {
  if (s.kind === 'storefront') {
    const door = s.door ?? 'left';
    if (door === 'none') return null;
    const dw = s.doors === 2 ? SHOP_DOOR.double : SHOP_DOOR.single;
    const du = dw * 0.5 + (s.sidelights ? 0.3 : 0);
    const dz =
      door === 'center'
        ? (s.z0 + s.z1) * 0.5
        : door === 'right'
          ? s.z1 - 0.2 - du - SHOP_DOOR.side
          : s.z0 + 0.2 + du + SHOP_DOOR.side;
    return [dz - du, dz + du];
  }
  if (s.kind === 'ramen') {
    const dz = zA + s.door.at;
    const half = (s.door.w ?? 1.0) * 0.5;
    return [dz - half, dz + half];
  }
  if (s.recess) return [s.recess.z0, s.recess.z1];
  return [s.z0, s.z1];
}

/**
 * Where a lot's parked bicycle and its rack may stand, either side of the lot's middle
 * (lot-local Z; the factory picks the place clear of the lot's doors).
 */
export const BIKE_SPAN = Object.freeze([-1.65, 1.6]);

let _doors = null;

/**
 * What the far sidewalk keeps clear of, as loop Z spans `{ z0, z1, what }` (no padding):
 *  - `door`: the doors and stoops of the houses on the building line (the planner's door zones,
 *    already a little wider than them), the doors of the shopfronts, a front garden's gate;
 *  - `mailbox`, `canopy` (a hotel's canopy, its posts at the curb), `bicycle` (where a lot's
 *    bicycle may be parked): pieces at the curb;
 *  - `stop`, `alley`: the bus stops and the alley mouth (with the dropped curb's ramp blocks).
 * Also the trees the houses plant themselves (`own`).
 */
export function farKeepOuts() {
  if (_doors) return _doors;
  const { houses, lots } = planStreet(null);
  const spans = [];
  const own = [];
  for (const h of houses) {
    const { plan, spec, lot } = h;
    const at = (z) => lot.centerZ + z;
    if (plan.facadeX < 1) {
      for (const [a, b] of plan.doorZones) spans.push({ z0: at(a), z1: at(b), what: 'door' });
      for (const s of plan.shops) {
        const span = shopDoorSpan(s, plan.zA);
        if (span) spans.push({ z0: at(span[0]), z1: at(span[1]), what: `${s.kind} door` });
      }
      for (const e of plan.entrances) {
        if (!e.canopy) continue;
        const half = (e.canopy.w ?? 2.16) * 0.5;
        spans.push({ z0: at(e.z - half), z1: at(e.z + half), what: 'canopy' });
      }
    }
    if (spec.site?.gateW) {
      const half = spec.site.gateW * 0.5;
      spans.push({ z0: at(plan.zC - half), z1: at(plan.zC + half), what: 'garden gate' });
    }
    const sw = spec.sidewalk ?? {};
    if (sw.mailbox !== undefined) {
      const mz = lot.zStart + sw.mailbox;
      const half = FOOTPRINT.mailbox[1];
      spans.push({ z0: mz - half, z1: mz + half, what: 'mailbox' });
    }
    if (sw.tree !== undefined) own.push({ z: lot.zStart + sw.tree, lot, house: h });
  }
  // `planStreet` lists the lots of the loop: a house spanning two lots stands on the first
  for (const lot of lots) {
    if (lot.hasBicycle) {
      const [a, b] = BIKE_SPAN;
      spans.push({ z0: lot.centerZ + a, z1: lot.centerZ + b, what: 'bicycle' });
    }
    if (lot.type === LotType.ALLEY) {
      spans.push({ z0: lot.zStart - CURB_BLOCK, z1: lot.zEnd + CURB_BLOCK, what: 'alley' });
    }
    if (lot.type === LotType.BUS_STOP) spans.push({ z0: lot.zStart, z1: lot.zEnd, what: 'stop' });
  }
  _doors = { spans, own };
  return _doors;
}

/**
 * A row of bollards along `[z0, z1]`: one per ~`bollardStep`, evenly, each slid along the curb
 * (0, +5 cm, −5 cm, …, at most `bollardSlide` of the pitch) to the nearest place `blocked` lets
 * it stand and no closer than `bollardSpacing` to the one before; dropped where there is none.
 * @param {number} z0
 * @param {number} z1
 * @param {(z: number) => boolean} blocked
 * @param {number} [step] the rhythm (`bollardStep`)
 * @returns {number[]}
 */
export function bollardRow(z0, z1, blocked, step = FURNITURE_RULES.bollardStep) {
  const R = FURNITURE_RULES;
  const n = Math.max(1, Math.round((z1 - z0) / step));
  const pitch = (z1 - z0) / n;
  const slides = Math.floor((R.bollardSlide * pitch) / R.bollardSlideStep);
  const out = [];
  for (let k = 0; k < n; k++) {
    const nominal = z0 + (k + 0.5) * pitch;
    for (let i = 0; i <= slides * 2; i++) {
      const z = nominal + Math.ceil(i / 2) * R.bollardSlideStep * (i % 2 ? 1 : -1);
      if (z < z0 || z > z1 || blocked(z)) continue;
      if (out.length && loopDist(z, out.at(-1), out.at(-1)) < R.bollardSpacing) continue;
      out.push(z);
      break;
    }
  }
  return out;
}

/**
 * Litter bins beside a share of the lamps (`binShare`, from the street seed), `binDz` along the
 * curb after the post – or before it, where `blocked` says no; none where both are blocked.
 * @param {number[]} lamps loop Z
 * @param {number} seed
 * @param {number} salt each side its own dice
 * @param {(z: number) => boolean} [blocked]
 * @returns {number[]}
 */
export function binsBeside(lamps, seed, salt, blocked = () => false) {
  const R = FURNITURE_RULES;
  const out = [];
  lamps.forEach((lz, i) => {
    if (!Rng.fork(seed, i, salt).chance(R.binShare)) return;
    const z = [lz + R.binDz, lz - R.binDz].map(wrap).find((q) => !blocked(q));
    if (z !== undefined) out.push(z);
  });
  return out.sort((a, b) => a - b);
}

/** Is `z` within `gap` of any of the points `list`? */
export const nearAny = (list, z, gap) => list.some((q) => loopDist(z, q, q) < gap);

/** The doors and gates of `farKeepOuts` (not the stops and the alley mouth). */
export function farDoorSpans() {
  return farKeepOuts().spans.filter((s) => s.what !== 'stop' && s.what !== 'alley');
}

const _fixtures = new Map();

/**
 * The far sidewalk's fixed furniture, in loop Z order: the street lamps (`streetLampsOf`) and
 * hydrants (`hydrantOf`) of the chunks of houses, slid along the curb out of the way of a door,
 * and the litter bins beside a share of the lamps (from the street seed; never in front of a
 * door).
 * @param {number} [seed] `street.seed`
 * @returns {{ lamps: number[], hydrants: number[], bins: number[] }}
 */
export function farFixtures(seed = 1) {
  if (_fixtures.has(seed)) return _fixtures.get(seed);
  const lamps = [];
  const hydrants = [];
  const doors = farDoorSpans();
  const clearOf = (kind, doorPad = FURNITURE_RULES.doorPad) => {
    const pad = FOOTPRINT[kind][1] + doorPad;
    return (z) => doors.every((s) => loopDist(z, s.z0, s.z1) >= pad);
  };
  // A lamp or a hydrant before a door slides along the curb (−5 cm, +5 cm, …, at most
  // `reach`) out of its way; a hydrant keeps off the trees the houses plant themselves too.
  // A lamp only needs its own footprint clear of the (already padded) door zones: every lamp
  // of the street stays
  const slide = (z0, clear, reach) => {
    for (let i = 0; i <= Math.round(reach / 0.05) * 2; i++) {
      const z = wrap(z0 + Math.ceil(i / 2) * 0.05 * (i % 2 ? -1 : 1));
      if (clear(z)) return z;
    }
    return null;
  };
  const push = (list, z) => z !== null && list.push(z);
  const ownTrees = farKeepOuts().own.map((t) => t.z);
  const hydrantClear = (z) =>
    clearOf('hydrant')(z) && !nearAny(ownTrees, z, FURNITURE_RULES.treeHydrant);
  for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
    const lots = StreetLayout.getChunk(c, null).right;
    for (const l of streetLampsOf(lots)) {
      push(lamps, slide(lots[l.lot].centerZ + l.z, clearOf('lamp', 0), 2.0));
    }
    const hy = hydrantOf(lots);
    if (hy) push(hydrants, slide(lots[hy.lot].centerZ + hy.z, hydrantClear, 2.5));
  }
  lamps.sort((a, b) => a - b);
  hydrants.sort((a, b) => a - b);
  const binClear = clearOf('bin');
  const bins = binsBeside(lamps, seed, 7312, (z) => !binClear(z));
  const value = { lamps, hydrants, bins };
  _fixtures.set(seed, value);
  return value;
}
