/**
 * Chunk 5 (Z 100–120 m) · «Barber, Clean Open Alleyway & Arcade»
 *
 * № 130 – Dutch Revival, 1890s: an Amsterdam canal house come back to New York. Orange-red
 * brick with white stone bands at the sills and over the arches of every floor, cross windows
 * (a mullion, a transom and small panes above it) under low brick arches round a light
 * keystone, and the stepped gable: five steps a side with a stone drip on every tread, an
 * arched attic window between the iron wall anchors of «1893» and the hoist beam with its hook
 * under the top, some 16 m up. The roof behind it runs back from the street. A barber shop
 * across two bays – dark green frame, the door at the end and the lit pole spinning beside
 * it – and the door to the three flats (one a floor) in the third bay. Four storeys and three
 * flats need a fire escape: it climbs the flank to the alley, past the kitchen windows, where
 * it does not hide the gable front; the flank also has the bathroom and back-bedroom windows,
 * the one AC, the meter and a bracket lantern at the alley mouth.
 *
 * The alley (6 m, `world/architecture/Alley.js`) is clean and open: setts, a channel and a drain, a
 * courtyard wall with a gate 14 m back, two bins and festoon lights from flank to flank.
 *
 * № 132 – an Old Law tenement (1879–1901) on a 25-foot lot: five storeys of dark red brick,
 * flat arches with keystones in light stone, 1/1 sashes and a tall pressed-metal cornice
 * painted dark green. Two flats at the front of every floor (living room and bedroom each),
 * eight in all, every one with its own curtains; one fire escape over the two middle bays
 * serves both living rooms of a floor. The stair entrance in the middle, two steps up, «132»
 * on its transom; the arcade on both sides of it – its door on the left under the marquee
 * with chasing bulbs, violet neon in the right-hand window. Narrow light-shaft windows and the
 * arcade's back door under a dish lamp on the alley flank; a blank party wall over № 134.
 */

const ORANGE_BRICK = [0.66, 0.31, 0.2];
const WHITE_STONE = [0.9, 0.88, 0.82];
const DUTCH_ROOMS = Object.freeze({ 0: 'living', 1: 'living', 2: 'bedroom' });

const TENEMENT_RED = [0.42, 0.17, 0.14];
const LIGHT_STONE = [0.84, 0.8, 0.7];
const TIN_GREEN = [0.17, 0.29, 0.22];
const ARCADE_PAINT = [0.2, 0.12, 0.27];
const LEFT_FLAT = Object.freeze({ 0: 'bedroom', 1: 'living' });
const RIGHT_FLAT = Object.freeze({ 2: 'living', 3: 'bedroom' });

export const CHUNK_05 = Object.freeze({
  no130: {
    number: 130,
    style: 'dutchRevival',
    roof: {
      type: 'steppedGable',
      h: 3.4,
      steps: 5,
      tile: 'slate_rect',
      color: [0.3, 0.3, 0.33],
      // The attic window, arched in brick like the windows below, and the building date
      window: {
        y: 0.45,
        w: 0.9,
        h: 0.95,
        lintel: 'arch',
        lights: 'cross',
        voussoirs: ORANGE_BRICK,
      },
      anchors: '1893',
    },
    depth: 14.0,
    height: 13.1,
    floors: [3.8, 3.2, 3.1, 3.0],
    grid: { type: 'even', count: 3, edge: 0.45 },
    wall: {
      ground: { tile: 'wall_brick', color: ORANGE_BRICK, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: ORANGE_BRICK, texScale: 1.1 },
      trim: WHITE_STONE,
      // White stone bands: under the sills and over the arches of every floor
      belts: [3.9, 6.26, 7.26, 9.62, 10.36, 12.72],
    },
    // The gable is the crown
    cornice: { type: 'none' },
    windows: {
      lintel: 'segmental',
      lights: 'cross',
      voussoirs: ORANGE_BRICK,
      width: { max: 1.05, bay: 0.6 },
      rows: [null, { y: 4.24, h: 1.6 }, { y: 7.6, h: 1.6 }, { y: 10.7, h: 1.6 }],
    },
    flats: [
      {
        id: 'F2',
        floor: 1,
        rooms: DUTCH_ROOMS,
        dress: ['curtain', 'wine'],
        lit: ['living', 'kitchen'],
      },
      { id: 'F3', floor: 2, rooms: DUTCH_ROOMS, dress: ['sheer', 'linen'], lit: ['bedroom'] },
      { id: 'F4', floor: 3, rooms: DUTCH_ROOMS, dress: ['curtain', 'teal'], lit: ['living'] },
    ],
    // The fire escape on the alley flank (the landings at the upper floor levels)
    egress: { side: 'flank', landings: [3.85, 7.05, 10.15] },
    flanks: {
      right: {
        // Smaller, irregular windows: kitchen, bathroom, back bedroom; the barber's back room
        windows: [
          { at: 6.4, floors: [1, 2, 3], w: 0.85, h: 1.25, sill: 0.95, room: 'kitchen' },
          { at: 8.75, floors: [1, 2, 3], w: 0.5, h: 0.7, sill: 1.5, room: 'bath' },
          { at: 11.9, floors: [1, 2, 3], w: 0.9, h: 1.35, sill: 0.9, room: 'bedroom' },
          { at: 9.6, floors: [0], w: 0.7, h: 0.9, sill: 1.6, room: 'shop', guard: true },
        ],
        escape: { at: 6.4, halfW: 1.15 },
        // The one AC: F3's back bedroom
        acUnder: [[11.9, 2]],
        lamps: [{ kind: 'lantern', at: 1.3, y: 2.9 }],
        meters: [{ at: 3.3, y: 0.9 }],
        downpipes: [13.7],
      },
    },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 2,
        w: 0.95,
        h: 2.3,
        transom: 'rect',
        intercom: true,
        lamp: true,
        color: [0.13, 0.22, 0.17],
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'BARBER',
        axes: [0, 1],
        door: 'left',
        paint: [0.1, 0.23, 0.16],
        pole: true,
      },
    ],
  },

  no132: {
    number: 132,
    style: 'tenement',
    roof: { type: 'flat' },
    depth: 14.0,
    height: 17.0,
    floors: [4.0, 3.3, 3.2, 3.2, 3.3],
    grid: { type: 'even', count: 4, edge: 0.4 },
    wall: {
      ground: { tile: 'wall_brick', color: TENEMENT_RED, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: TENEMENT_RED, texScale: 1.1 },
      trim: LIGHT_STONE,
      belts: [3.88],
    },
    // Pressed sheet metal: frieze panels between big brackets, painted dark green
    cornice: { type: 'tenement', color: TIN_GREEN, bays: 4 },
    windows: {
      lintel: 'keystone',
      lights: '1/1',
      width: { max: 0.9, bay: 0.52 },
      rows: [
        null,
        { y: 4.7, h: 1.5 },
        { y: 8.0, h: 1.5 },
        { y: 11.2, h: 1.5 },
        { y: 14.3, h: 1.3 },
      ],
    },
    // Eight front flats, each in its own curtains – the patchwork of a tenement front
    flats: [
      { id: 'L2', floor: 1, rooms: LEFT_FLAT, dress: ['curtain', 'wine'], lit: ['living'] },
      { id: 'R2', floor: 1, rooms: RIGHT_FLAT, dress: ['blind', 'cream'], lit: [] },
      { id: 'L3', floor: 2, rooms: LEFT_FLAT, dress: ['sheer', 'linen'], lit: ['bedroom'] },
      { id: 'R3', floor: 2, rooms: RIGHT_FLAT, dress: ['curtain', 'olive'], lit: ['living'] },
      { id: 'L4', floor: 3, rooms: LEFT_FLAT, dress: ['curtain', 'plum'], lit: [] },
      {
        id: 'R4',
        floor: 3,
        rooms: RIGHT_FLAT,
        dress: ['sheer', 'rose'],
        lit: ['living', 'bedroom'],
      },
      { id: 'L5', floor: 4, rooms: LEFT_FLAT, dress: ['blind', 'teal'], lit: ['living'] },
      { id: 'R5', floor: 4, rooms: RIGHT_FLAT, dress: ['curtain', 'cream'], lit: [] },
    ],
    // Three ACs under bedroom windows on the outer bays (L2, R3, L5)
    acUnder: [
      [0, 1],
      [3, 2],
      [0, 4],
    ],
    // One escape over the two middle bays: each landing serves both living rooms of a floor
    egress: { side: 'front', escapes: [[1, 2]], landings: [4.05, 7.35, 10.55, 13.75] },
    // Low flues on the party wall over № 134
    partyWall: { flues: 2 },
    flanks: {
      left: {
        // Narrow windows of the light shaft, the arcade's back door under a dish lamp
        windows: [
          { at: 5.6, floors: [1, 2, 3, 4], w: 0.5, h: 1.05, sill: 1.0, room: 'kitchen' },
          { at: 10.6, floors: [1, 2, 3, 4], w: 0.5, h: 1.05, sill: 1.0, room: 'bath' },
        ],
        doors: [{ at: 8.4, w: 0.95, h: 2.15, color: [0.3, 0.33, 0.32] }],
        lamps: [{ kind: 'dish', at: 8.4, y: 2.62 }],
        downpipes: [13.6],
        // The flat roof's parapet returns along the flank
        parapet: true,
      },
    },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        at: 3.75,
        y0: 0.32,
        w: 1.0,
        h: 2.25,
        glazed: true,
        transom: 'rect',
        intercom: true,
        color: [0.24, 0.15, 0.12],
        stoop: { w: 1.5, steps: 2, rails: 'none' },
      },
    ],
    // The arcade either side of the stair entrance: its door on the left under the marquee,
    // violet neon in the right-hand window
    shops: [
      {
        kind: 'storefront',
        sign: 'ARCADE',
        span: [0.3, 2.75],
        door: 'left',
        paint: ARCADE_PAINT,
        marquee: true,
        neon: true,
        glow: [0.52, 0.3, 0.66],
      },
      {
        kind: 'storefront',
        span: [4.75, 7.2],
        door: 'none',
        paint: ARCADE_PAINT,
        neonPanel: 'PLAY',
        glow: [0.52, 0.3, 0.66],
      },
    ],
  },
});
