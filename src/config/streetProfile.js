/**
 * Street cross-section (`STREETSCAPE_PLAN.md`, principle 1): the road, the curbs and the
 * sidewalks across X — one description for the simulation and the scene. Data only.
 *
 * World X in metres, heights above the asphalt (`y = 0`). The buildings stand on the far
 * side (+X), the camera looks at them from the near side (−X):
 *
 *   x ∈ [−5.22, −4.95]   near curb, the near sidewalk beyond it
 *   x ∈ [−4.95, −4.65]   near gutter (concrete)
 *   x ∈ [−4.65, +2.05]   asphalt, two 3.65 m lanes: centre line at −1.30 (the sewer main under
 *                        the middle of the near lane, its manholes at −2.98), taxi lane at
 *                        +0.55, bus stop at +1.35
 *   x ∈ [+2.05, +2.35]   far gutter (concrete)
 *   x ∈ [+2.35, +2.62]   far curb: granite blocks, chamfered on the road edge
 *   x ∈ [+2.62, +7.62]   far sidewalk slabs (5.0 m), level with the curb top; street trees in
 *                        pits at x ∈ [+2.64, +3.84] (trunks at +3.24), crowns no closer than
 *                        1.3 m to the building line; 3.8 m of clear walk beside a pit
 *   x ≥ +7.62            building line: the lots, a foundation apron under them
 *
 * The near side is the same profile mirrored (`side = −1`): curb at [−5.22, −4.95], slabs
 * 5.0 m wide to the near building line at −10.22, the dark foundation apron behind it (no
 * houses are built on this side: it is where the camera stands).
 */

/** Asphalt meets the near (camera side, −X) curb. */
export const ROAD_NEAR_X = -4.95;
/** Asphalt meets the far (building side, +X) curb. */
export const ROAD_FAR_X = 2.35;
/** Dashed centre line. */
export const CENTER_LINE_X = (ROAD_NEAR_X + ROAD_FAR_X) * 0.5;

/** Centre of the lane the taxi cruises in: the curbside lane by the buildings. */
export const LANE_X = 0.55;
/**
 * Centre of the taxi when it pulls in to the far curb at a bus stop: the outer tyre faces
 * (wheel track ±0.82, tyres 0.24 wide) stop in the gutter, 6 cm short of the curb.
 */
export const STOP_X = 1.35;

/** Height of both curbs and sidewalks above the asphalt. */
export const CURB_H = 0.15;
/** Curb top from the asphalt edge to the sidewalk slabs. */
export const CURB_W = 0.27;
/** Length of one granite curb block along the street. */
export const CURB_BLOCK = 1.0;
/** Chamfer on the top edge of the curb facing the road. */
export const CURB_CHAMFER = 0.025;
/** Bevel on the ends of every block: two neighbours make a V joint twice as wide. */
export const CURB_JOINT = 0.01;
/** Height of a dropped curb (alley mouth) above the gutter; its top ramps up to the slabs. */
export const DROPPED_CURB_H = 0.025;
/** Concrete gutter along each curb, flush with the asphalt. */
export const GUTTER_W = 0.3;

/** Where the far sidewalk meets the lots (the facades stand on it). */
export const BUILDING_LINE_X = 7.62;
/** Sidewalk slabs between the back of a curb and its building line (both sides). */
export const SLABS_W = BUILDING_LINE_X - ROAD_FAR_X - CURB_W;
/** The near sidewalk's building line: the mirror of `BUILDING_LINE_X` (−10.22). */
export const NEAR_BUILDING_LINE_X = ROAD_NEAR_X - CURB_W - SLABS_W;

/** Street trees stand in square pits this wide, cut into the slabs by the curb. */
export const TREE_PIT = 1.2;
/** The centre of a tree pit (the trunk) lies this far behind the curb's back edge. */
export const TREE_OFFSET = 0.62;
/**
 * Crowns keep this far off the building line: the blade signs, awnings, bays and fire escapes
 * stand out from the facades into this strip.
 */
export const CROWN_CLEAR = 1.3;

/**
 * Street furniture lines: how far each piece's centre stands behind the curb face, the same on
 * both sidewalks (the rules between the pieces: `world/SidewalkFurniture.js`).
 */
export const FURNITURE = Object.freeze({
  bollard: 0.34,
  lamp: 0.4,
  hydrant: 0.42,
  bin: 0.42,
  rack: 0.48,
  bike: 0.62,
  mailbox: 0.55,
  tree: CURB_W + TREE_OFFSET,
});
