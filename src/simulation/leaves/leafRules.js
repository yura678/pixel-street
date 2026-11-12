/**
 * Rules of the falling leaves (`fx/Leaves.js`, simulated on the GPU): where they live, where
 * they lie, which crowns they fall from, how long they lie. Pure data and functions, no three.js:
 * the compute shader is built from these numbers, and the tests check them.
 *
 * World X across the street (`streetProfile.js`), Y up from the asphalt, Z along the street.
 */
import {
  BUILDING_LINE_X,
  CURB_H,
  CURB_W,
  NEAR_BUILDING_LINE_X,
  ROAD_FAR_X,
  ROAD_NEAR_X,
} from '../../config/streetProfile.js';

/** The window of street the leaves live in, around the camera's anchor (metres along Z). */
export const LEAF_WINDOW = Object.freeze({ behind: 35, ahead: 45 });
/** Window length: a leaf leaving it on one end comes back at the other. */
export const LEAF_WINDOW_LENGTH = LEAF_WINDOW.behind + LEAF_WINDOW.ahead;
/** Leaves fade in over this many metres at both ends of the window (no popping). */
export const LEAF_EDGE_FADE = 4;
/** Crowns the leaves may grow in at once (uniform array size). */
export const MAX_CROWNS = 32;
/** A crown this close to a window end drops no leaves (they would wrap away at once). */
export const CROWN_MARGIN = 3;

/** States of a leaf (stored as a float in the GPU buffer). */
export const LeafState = Object.freeze({
  /** Flat on the road or a sidewalk. */
  RESTING: 0,
  /** In the air: falling, fluttering, blown about. */
  AIRBORNE: 1,
  /** Withering where it lies: shrinks away, then grows again in a crown. */
  FADING: 2,
  /** Grown in a crown, out of sight in the foliage, about to let go. */
  ATTACHED: 3,
});

/** Leaves stay inside the street: this far from either building line. */
export const LEAF_WALL_GAP = 0.05;
/** Lowest and highest X a leaf may have. */
export const LEAF_X_RANGE = Object.freeze([
  NEAR_BUILDING_LINE_X + LEAF_WALL_GAP,
  BUILDING_LINE_X - LEAF_WALL_GAP,
]);

/**
 * Where leaves lie at the start (share of all leaves, X range): most in the gutters and on the
 * sidewalks, fewer on the asphalt, where the traffic blows them away.
 */
export const LEAF_BEDS = Object.freeze([
  { share: 0.15, x: [ROAD_NEAR_X + 0.03, ROAD_NEAR_X + 0.35] }, // near gutter
  { share: 0.15, x: [ROAD_FAR_X - 0.35, ROAD_FAR_X - 0.03] }, // far gutter
  { share: 0.17, x: [NEAR_BUILDING_LINE_X + 0.2, ROAD_NEAR_X - CURB_W - 0.05] }, // near slabs
  { share: 0.23, x: [ROAD_FAR_X + CURB_W + 0.05, BUILDING_LINE_X - 0.2] }, // far slabs
  { share: 0.3, x: [ROAD_NEAR_X + 0.35, ROAD_FAR_X - 0.35] }, // asphalt
]);

/**
 * Height of the ground under X: the road (gutters included) at 0, the curbs and sidewalks at
 * `CURB_H`.
 * @param {number} x
 */
export function groundHeightAt(x) {
  return x > ROAD_NEAR_X && x < ROAD_FAR_X ? 0 : CURB_H;
}

/**
 * Seconds a leaf lies before it withers, on average, at `leaves.fallRate` (0–1): 0 never
 * (the leaves only lie and blow about), 1 every 25 s. Each leaf lies 0.6–1.4 × this.
 * @param {number} fallRate
 * @returns {number} seconds, `Infinity` for a fall rate of 0
 */
export function leafLife(fallRate) {
  if (!(fallRate > 0)) return Infinity;
  const r = Math.min(1, fallRate);
  return 25 + (1 - r) * (1 - r) * 215;
}

/**
 * The window [start, end) of street the leaves live in around the camera's anchor `z`.
 * @param {number} z
 */
export function leafWindowAt(z) {
  return { start: z - LEAF_WINDOW.behind, end: z + LEAF_WINDOW.ahead };
}

/**
 * The crowns leaves may grow in: those well inside the window, nearest the window's middle
 * first when there are more than fit.
 * @param {Array<{ crown: { x: number, y: number, z: number, rx: number, ry: number, rz: number } }>} trees
 *   street trees as planned (`BuildingFactory#buildChunk` → `trees`): crown Y up from the sidewalk
 * @param {number} start window start (Z)
 * @param {number} end window end (Z)
 * @param {number} [max=MAX_CROWNS]
 * @returns {Array<{ x: number, y: number, z: number, rx: number, ry: number, rz: number }>} crowns
 *   with Y up from the asphalt, in Z order
 */
export function crownsInWindow(trees, start, end, max = MAX_CROWNS) {
  const mid = (start + end) * 0.5;
  const inside = [];
  for (const t of trees) {
    const c = t.crown;
    if (c.z < start + CROWN_MARGIN || c.z > end - CROWN_MARGIN) continue;
    inside.push({ x: c.x, y: c.y + CURB_H, z: c.z, rx: c.rx, ry: c.ry, rz: c.rz });
  }
  if (inside.length > max) {
    inside.sort((a, b) => Math.abs(a.z - mid) - Math.abs(b.z - mid));
    inside.length = max;
  }
  return inside.sort((a, b) => a.z - b.z);
}
