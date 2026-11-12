/**
 * Chunk 2 (Z 40–60 m) · «Central City Park & Bus Stop #1»
 *
 * № 114 – a New Law apartment house of 1908 in the Renaissance Revival manner, 20 m wide on a
 * triple lot, set back behind its communal garden (an early garden apartment). It spans the park
 * lot and the bus-stop lot behind it. Four storeys, nine axes: four per wing and the stair core
 * in the middle, one flat per wing and floor; the bakery fills the right ground floor.
 *
 * Rusticated limestone ground storey, warm red brick above with quoins at the corners and either
 * side of the stair core. The entrance is an arched limestone portal between pilasters carrying
 * an entablature (it breaks the belt course over the ground storey), the number on its keystone,
 * lanterns on brackets, three steps up from the garden path; the stair windows above sit half a
 * storey up. The windows follow the style's hierarchy: pediments on the 2nd floor, keystones on
 * the 3rd (over a sill course, which stops at the stair core) and plain lintels on the 4th, all
 * 1/1. A heavy pressed-metal cornice with the date 1908 over the entrance; on the roof the stair
 * bulkhead and the street's one wooden water tank. The top landing has no window: the cornice
 * reaches down past it.
 */

// A wing's rooms run from the stair outward: kitchen, two living-room bays, bedroom.
const WING_L = Object.freeze({ 3: 'kitchen', 2: 'living', 1: 'living', 0: 'bedroom' });
const WING_R = Object.freeze({ 5: 'kitchen', 6: 'living', 7: 'living', 8: 'bedroom' });
const LIMESTONE = [0.8, 0.76, 0.67];
const TRIM = [0.84, 0.78, 0.66];

export const CHUNK_02 = Object.freeze({
  no114: {
    number: 114,
    style: 'newLaw',
    roof: {
      type: 'flat',
      // The stair carried up through the roof; the water tank on steel over the left wing
      bulkhead: { w: 3.4, d: 2.4, h: 2.3, back: 2.0 },
      tank: { at: 5.4, back: 4.4, legs: 2.3, r: 1.0, h: 2.2 },
    },
    setback: 6.4,
    depth: 6.8,
    extendsInto: 'next',
    height: 12.6,
    floors: [3.42, 2.6, 2.6, 2.6],
    grid: { type: 'stairCore', edge: 0.75, stairW: 2.8, perWing: 4 },
    wall: {
      ground: { tile: 'wall_stone', color: LIMESTONE, texScale: 1.6 },
      upper: { tile: 'wall_brick', color: [0.6, 0.37, 0.27], texScale: 1.25 },
      trim: TRIM,
      // Over the ground storey, broken by the portal; the sill course of the 3rd floor, stopping
      // 2 cm into the stair core's quoins (metres from the left corner)
      belts: [
        { y: 3.34, gaps: [[8.75, 11.25]] },
        { y: 6.3, gaps: [[8.62, 11.38]] },
      ],
      rustication: 0.38,
      quoins: { y0: 3.52, top: 11.45, corner: 0.4, stairCore: 0.24 },
    },
    cornice: { type: 'tenement', color: [0.62, 0.57, 0.5], bays: 15, date: 1908 },
    windows: {
      lintel: 'keystone',
      lights: '1/1',
      width: { max: 1.14, bay: 0.58 },
      rows: [
        { y: 1.18, h: 1.86 },
        { y: 3.95, h: 1.55 },
        { y: 6.55, h: 1.55 },
        { y: 9.15, h: 1.55 },
      ],
      floors: { 1: { lintel: 'pediment' }, 3: { lintel: 'flat' } },
      // Stair windows sit half a storey up, on the landings, all under keystones
      stair: { lift: 1.3, width: 0.8, h: 1.12, tint: [0.86, 0.92, 1.0], lintel: 'keystone' },
    },
    flats: [
      { id: 'L0', floor: 0, rooms: WING_L, dress: ['sheer', 'cream'], lit: ['living'] },
      { id: 'L1', floor: 1, rooms: WING_L, dress: ['curtain', 'plum'], lit: ['living', 'kitchen'] },
      { id: 'L2', floor: 2, rooms: WING_L, dress: ['curtain', 'olive'], lit: [] },
      { id: 'L3', floor: 3, rooms: WING_L, dress: ['curtain', 'rose'], lit: ['living', 'bedroom'] },
      { id: 'R1', floor: 1, rooms: WING_R, dress: ['sheer', 'cream'], lit: ['kitchen'] },
      { id: 'R2', floor: 2, rooms: WING_R, dress: ['curtain', 'teal'], lit: ['living', 'bedroom'] },
      { id: 'R3', floor: 3, rooms: WING_R, dress: ['curtain', 'wine'], lit: [] },
    ],
    stairWindows: [1, 2],
    // Split AC under the bedroom windows of L2, L3 and R3
    acUnder: [
      [0, 2],
      [0, 3],
      [8, 3],
    ],
    // One fire escape per wing over the living-room windows
    egress: {
      side: 'front',
      escapes: [
        [1, 2],
        [6, 7],
      ],
      landings: [3.86, 6.46, 9.06],
    },
    services: { downpipes: 'corners' },
    entrances: [
      {
        kind: 'stair',
        axis: 'stair',
        y0: 0.67,
        w: 1.3,
        h: 2.05,
        leaves: 2,
        glazed: true,
        surround: 'aedicule',
        numberOn: 'keystone',
        intercom: true,
        lanterns: true,
        color: [0.24, 0.14, 0.1],
        trim: LIMESTONE,
        // Three steps up from the garden path (raised 0.22 above the sidewalk)
        stoop: { base: 0.22, w: 2.1, steps: 3, landing: 0.62, run: 0.3, rails: 'iron' },
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'BAKERY',
        axes: [5, 8],
        inset: [0.08, -0.12],
        // On the terrace paving, 0.22 above the sidewalk
        deck: 0.22,
        door: 'center',
        sidelights: true,
        signLamps: true,
        paint: [0.18, 0.27, 0.22],
        awning: [1, 1, 1],
        awningTile: 'awning_festive',
      },
    ],
    site: { kind: 'gardenAndTerrace', gateW: 1.7, pathHalfW: 1.05 },
  },
});
