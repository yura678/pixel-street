/**
 * Chunk 3 (Z 60–80 m) · «Ramen Bar, Corner Convenience & Residence»
 *
 * № 118 – the ramen bar in an Italianate frame house of the 1850s, older and lower than its
 * neighbours (frame houses were banned in the city after 1866): dark brown clapboard, cream
 * corner boards and window casings, a cornice on paired brackets, a flat roof. Upstairs the
 * owner's flat, reached through the shop: four 2/2 windows to the street, two on the flank over
 * № 114's terrace. The ground storey is a Japanese front: plain glass with koshi lattice over its
 * lower part, a pent roof of kawara tiles with red lanterns hung from its eave, the RAMEN board
 * over it, the red door under an indigo noren, the number beside it; bamboo at the corner.
 *
 * № 120 – Second Empire, 1860s–80s: painted brick in warm grey with cream trim, segmental
 * windows (heavy hoods on consoles on the 2nd floor, plain ones on the 3rd), a mansard in
 * fish-scale slate with a darker band, two segmental dormers and iron cresting. A 24/7 bodega
 * on the ground floor and a narrow door to the three flats beside it. The fire escape is at
 * the back: two bays are too narrow for one on the front. The left party wall stands nine
 * metres above the ramen bar and carries the street's one ghost sign.
 *
 * № 122 – Anglo-Italianate, 1840s–60s: a narrow single-family house in chocolate brownstone,
 * the ground storey banded with channelled rustication, entered almost at sidewalk level
 * (English basement) up a three-step stoop through a round-arched double door. Tall parlor
 * windows on the 2nd floor, 2/2 sashes, bracketed cornice, flat roof without a front parapet.
 * One family: the same curtains throughout, no fire escape, no AC on the front.
 */

const ROOMS_2 = Object.freeze({ 0: 'living', 1: 'bedroom' });
const PAINTED_GREY = [0.66, 0.63, 0.58];
const CREAM = [0.88, 0.84, 0.74];
const BROWNSTONE = [0.47, 0.32, 0.26];
const FAMILY = Object.freeze(['curtain', 'olive']);
const SIDING_BROWN = [0.28, 0.19, 0.14];
/** A frame house's sash: 2/2 in painted board casings. */
const FRAME_SASH = Object.freeze({ lintel: 'casing', trimTile: 'wood_paint', lights: '2/2' });

export const CHUNK_03 = Object.freeze({
  no118: {
    number: 118,
    style: 'italianateFrame',
    roof: { type: 'flat' },
    depth: 7.2,
    floors: [3.95, 2.9],
    height: 6.85,
    grid: { type: 'even', count: 4, edge: 0.45 },
    wall: {
      ground: { tile: 'wall_siding', color: SIDING_BROWN, texScale: 1.25 },
      upper: { tile: 'wall_siding', color: SIDING_BROWN, texScale: 1.25 },
      trim: CREAM,
      cornerBoards: { w: 0.16 },
    },
    cornice: { type: 'paired', color: CREAM },
    windows: {
      lintel: 'casing',
      lights: '2/2',
      trimTile: 'wood_paint',
      width: { max: 0.95, bay: 0.5 },
      rows: [null, { y: 4.2, h: 1.45 }],
    },
    flats: [
      {
        id: 'U1',
        floor: 1,
        rooms: { 0: 'bedroom', 1: 'living', 2: 'living', 3: 'kitchen' },
        dress: ['curtain', 'wine'],
        lit: ['living'],
        via: 'shop',
      },
    ],
    // The flank over № 114's terrace (open 6.4 m deep): the bedroom and the kitchen
    flanks: {
      left: {
        windows: [
          { at: 1.7, floors: [1], sill: 0.25, w: 0.85, h: 1.45, room: 'bedroom', ...FRAME_SASH },
          { at: 4.7, floors: [1], sill: 0.25, w: 0.85, h: 1.45, room: 'kitchen', ...FRAME_SASH },
        ],
        downpipes: [0.3],
      },
    },
    // The red door of the shop, the only way in
    entrances: [{ kind: 'shop' }],
    shops: [
      {
        kind: 'ramen',
        sign: 'RAMEN',
        signTile: 'ramen_sign',
        span: [0.2, 9.4],
        door: { at: 7.95, color: [0.62, 0.12, 0.1] },
        lanterns: [1.1, 3.9, 7.15, 8.8],
      },
    ],
    sidewalk: { bamboo: 0.35 },
  },

  no120: {
    number: 120,
    style: 'secondEmpire',
    roof: {
      type: 'mansard',
      h: 2.6,
      inset: 0.45,
      cap: 0.5,
      cresting: true,
      bands: [
        { from: 0, to: 0.36, tile: 'slate_fishscale', color: [0.56, 0.58, 0.63] },
        { from: 0.36, to: 0.56, tile: 'slate_fishscale', color: [0.38, 0.33, 0.42] },
        { from: 0.56, to: 1, tile: 'slate_fishscale', color: [0.56, 0.58, 0.63] },
      ],
      dormers: { axes: [0, 1], w: 1.05, h: 1.7, sill: 0.32, head: 'segmental', lights: '1/1' },
    },
    depth: 8.0,
    height: 9.9,
    floors: [3.6, 3.15, 3.15, 2.6],
    grid: { type: 'even', count: 2, edge: 0.5 },
    wall: {
      ground: { tile: 'brick_painted', color: PAINTED_GREY, texScale: 1.2 },
      upper: { tile: 'brick_painted', color: PAINTED_GREY, texScale: 1.2 },
      trim: CREAM,
      belts: [3.48],
    },
    cornice: { type: 'bracket', color: [0.84, 0.8, 0.7] },
    windows: {
      lintel: 'segmental',
      lights: '1/1',
      width: { max: 1.0, bay: 0.5 },
      rows: [null, { y: 4.15, h: 1.75 }, { y: 7.2, h: 1.45 }],
      // The 2nd floor gets the heavy hoods on consoles, the 3rd plain segmental heads
      floors: { 1: { consoles: true } },
    },
    flats: [
      { id: 'F1', floor: 1, rooms: ROOMS_2, dress: ['curtain', 'teal'], lit: ['living'] },
      { id: 'F2', floor: 2, rooms: ROOMS_2, dress: ['sheer', 'cream'], lit: [] },
      { id: 'F3', floor: 3, rooms: ROOMS_2, dress: ['curtain', 'rose'], lit: ['bedroom'] },
    ],
    // One AC for three flats: under the 3rd-floor bedroom
    acUnder: [[1, 2]],
    egress: { side: 'rear', escapes: [[0, 1]], landings: [3.9, 7.05, 9.9] },
    services: { downpipes: 'right' },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        at: 4.85,
        w: 0.9,
        h: 2.25,
        transom: 'rect',
        intercom: true,
        color: [0.2, 0.23, 0.26],
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: '24/7',
        span: [0.05, 3.95],
        door: 'left',
        recessed: true,
        awning: [0.16, 0.34, 0.22],
        shutterBox: true,
        neon: true,
        paint: [0.14, 0.22, 0.18],
      },
    ],
    partyWall: { ghost: 'left' },
  },

  no122: {
    number: 122,
    style: 'angloItalianate',
    roof: { type: 'flat', frontParapet: false },
    depth: 8.0,
    height: 12.75,
    floors: [3.35, 3.5, 3.0, 2.9],
    grid: { type: 'even', count: 2, edge: 0.45 },
    wall: {
      ground: { tile: 'wall_stone', color: [0.44, 0.3, 0.24], texScale: 0.9 },
      upper: { tile: 'wall_stone', color: BROWNSTONE, texScale: 1.0 },
      trim: [0.56, 0.4, 0.32],
      belts: [3.28],
      rustication: 0.36,
    },
    cornice: { type: 'bracket', color: [0.34, 0.24, 0.19] },
    windows: {
      lintel: 'cap',
      lights: '2/2',
      width: { max: 0.95, bay: 0.5 },
      rows: [
        { y: 0.95, h: 1.2 },
        { y: 3.95, h: 2.0 },
        { y: 7.3, h: 1.55 },
        { y: 10.25, h: 1.4 },
      ],
      // Round-headed openings in the rusticated ground storey
      floors: { 0: { lintel: 'arch' } },
    },
    flats: [
      { id: 'H', floor: 0, rooms: { 1: 'dining' }, dress: FAMILY, lit: ['dining'] },
      { id: 'H', floor: 1, rooms: { 0: 'living', 1: 'living' }, dress: FAMILY, lit: ['living'] },
      { id: 'H', floor: 2, rooms: { 0: 'bedroom', 1: 'bedroom' }, dress: FAMILY, lit: [] },
      { id: 'H', floor: 3, rooms: { 0: 'bedroom', 1: 'study' }, dress: FAMILY, lit: ['study'] },
    ],
    services: { downpipes: 'right' },
    entrances: [
      {
        kind: 'house',
        axis: 0,
        y0: 0.5,
        w: 1.0,
        h: 1.85,
        leaves: 2,
        surround: 'arch',
        transom: 'fan',
        color: [0.26, 0.15, 0.1],
        trim: [0.56, 0.4, 0.32],
        stoop: { w: 1.7, steps: 3, rails: 'iron', color: [0.42, 0.29, 0.23] },
      },
    ],
    // Narrow areaway with a railing in front of the ground-storey window
    areaways: [{ span: [2.55, 4.6], depth: 0.85 }],
    partyWall: { flues: 1 },
  },
});
