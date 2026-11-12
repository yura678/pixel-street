/**
 * Chunk 0 (Z 0–20 m) · «Morning Bakery & Promenade» – the first frame: the taxi starts here.
 *
 * № 100 – Second Empire in its stone dress: dressed limestone the colour of cream, rusticated
 * quoins up the corners above the ground storey, 1/1 sashes under hoods on consoles. Across the
 * 2nd floor a French cast-iron balcony on a stone slab before three tall windows. A mansard in
 * bands – grey fish-scale slate and red diamond-cut slate – with three dormers, the middle one
 * pedimented and the outer ones segmental, iron cresting on the curb. The café on the ground
 * floor: a dark brown wooden front, two big panes either side of a door recessed in its lobby, a
 * narrow bench under the left pane and a service hatch open in the right one. The door to the
 * three flats on the left under a segmental pediment, «100» on its transom. One AC; the fire
 * escape is at the back. Across the loop's seam it stands over № 166 and owns that party wall.
 *
 * № 102 – Anglo-Italianate with a shop instead of an English basement: three storeys of stucco
 * the colour of ivory, the ground storey channelled. The news kiosk across two bays – a low navy
 * front under a narrow awning, two sloping racks of papers and magazines on the sidewalk – and
 * the door to the two flats in the right bay under a round arch, «102» in its fanlight. Three
 * round-arched windows on the 2nd floor (the mark of the style), square-headed 2/2 above, a
 * cornice on a close row of small brackets. One AC, no fire escape.
 *
 * № 104 – Romanesque Revival, one family: the basement and the parlor floor in rock-faced
 * red-brown stone, smooth brownstone above. Seven steps between solid stone cheek walls up to the
 * door under a heavy round arch with a moulded archivolt; beside it one wide arched parlor window
 * with a transom bar. Three square windows between stone belts, then an arcade of three
 * round-arched windows on squat colonnettes, a corbel table and a low parapet. A box hedge in
 * the areaway. No ACs, no fire escape.
 */

const LIMESTONE = [0.86, 0.8, 0.66];
const LIMESTONE_TRIM = [0.93, 0.89, 0.79];
const SLATE_GREY = [0.55, 0.57, 0.62];
const SLATE_RED = [0.64, 0.38, 0.33];
const CAFE_BROWN = [0.2, 0.12, 0.08];

const IVORY = [0.98, 0.96, 0.88];
const IVORY_GROUND = [0.94, 0.91, 0.82];
const STUCCO_TRIM = [0.76, 0.72, 0.62];
const NAVY = [0.08, 0.13, 0.25];

const ROCK_RED = [0.5, 0.3, 0.24];
const BROWNSTONE = [0.44, 0.3, 0.24];
const RED_SANDSTONE = [0.58, 0.38, 0.3];
const HOUSE = Object.freeze(['curtain', 'olive']);

export const CHUNK_00 = Object.freeze({
  no100: {
    number: 100,
    style: 'secondEmpire',
    roof: {
      type: 'mansard',
      h: 2.7,
      inset: 0.45,
      cap: 0.55,
      cresting: true,
      // Grey fish-scale courses with two bands of red diamond-cut slate
      bands: [
        { from: 0, to: 0.28, tile: 'slate_fishscale', color: SLATE_GREY },
        { from: 0.28, to: 0.46, tile: 'slate_diamond', color: SLATE_RED },
        { from: 0.46, to: 0.74, tile: 'slate_fishscale', color: SLATE_GREY },
        { from: 0.74, to: 0.86, tile: 'slate_diamond', color: SLATE_RED },
        { from: 0.86, to: 1, tile: 'slate_fishscale', color: SLATE_GREY },
      ],
      // Segmental dormers either side of a larger pedimented one
      dormers: {
        axes: [0, 1, 2],
        w: 1.0,
        h: 1.7,
        sill: 0.32,
        head: 'segmental',
        lights: '1/1',
        cells: { 1: { w: 1.12, h: 1.8, head: 'pediment' } },
      },
    },
    depth: 9.0,
    height: 10.6,
    floors: [4.0, 3.3, 3.3, 2.7],
    grid: { type: 'even', count: 3, edge: 0.4 },
    wall: {
      ground: { tile: 'wall_stone', color: LIMESTONE, texScale: 0.9 },
      upper: { tile: 'wall_stone', color: LIMESTONE, texScale: 0.9 },
      trim: LIMESTONE_TRIM,
      belts: [3.88],
      // Rusticated quoins from the belt over the café up to the cornice
      quoins: { y0: 4.06, top: 9.7, corner: 0.42 },
    },
    cornice: { type: 'bracket', color: [0.8, 0.75, 0.63] },
    windows: {
      lintel: 'hood',
      lights: '1/1',
      width: { max: 0.95, bay: 0.5 },
      // Tall windows down to the balcony on the 2nd floor (1:2 tile), 2:3 sashes on the 3rd
      rows: [null, { y: 4.52, h: 1.9 }, { y: 7.75, h: 1.5 }],
      floors: { 1: { tile: 'win_parlor' } },
    },
    // The French balcony across the three windows of the 2nd floor, its slab on the belt course
    ironBalcony: { span: [0.55, 5.95], y: 4.38, depth: 0.5, consoles: [0.75, 2.3, 4.2, 5.75] },
    flats: [
      {
        id: 'F2',
        floor: 1,
        rooms: { 0: 'living', 1: 'living', 2: 'bedroom' },
        dress: ['curtain', 'wine'],
        lit: ['living'],
      },
      {
        id: 'F3',
        floor: 2,
        rooms: { 0: 'kitchen', 1: 'living', 2: 'bedroom' },
        dress: ['sheer', 'cream'],
        lit: ['bedroom'],
      },
      {
        id: 'F4',
        floor: 3,
        rooms: { 0: 'bedroom', 1: 'living', 2: 'kitchen' },
        dress: ['curtain', 'teal'],
        lit: ['living'],
      },
    ],
    // One AC for three flats: under the 3rd-floor bedroom
    acUnder: [[2, 2]],
    // The parade front of the first frame: the fire escape is at the back
    egress: { side: 'rear', escapes: [[0, 2]], landings: [4.0, 7.3, 10.6] },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        at: 1.25,
        w: 0.95,
        h: 2.25,
        transom: 'rect',
        surround: 'portal',
        pediment: 'segmental',
        intercom: true,
        color: [0.14, 0.2, 0.17],
        trim: LIMESTONE_TRIM,
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'CAFE',
        span: [2.15, 6.35],
        // Two big panes either side of the door in its lobby, cut into the wall
        door: 'center',
        recessed: true,
        cut: true,
        paint: CAFE_BROWN,
        // A bench under the left pane, a service hatch open in the right one
        bench: true,
        hatch: true,
        glow: [0.78, 0.56, 0.3],
      },
    ],
  },

  no102: {
    number: 102,
    style: 'angloItalianate',
    roof: { type: 'flat' },
    depth: 9.0,
    height: 10.4,
    floors: [3.7, 3.6, 3.1],
    grid: { type: 'even', count: 3, edge: 0.4 },
    wall: {
      ground: { tile: 'wall_plaster', color: IVORY_GROUND, texScale: 1.0 },
      upper: { tile: 'wall_plaster', color: IVORY, texScale: 1.0 },
      trim: STUCCO_TRIM,
      belts: [3.58],
      rustication: 0.33,
    },
    // A close row of small brackets, not № 122's heavy ones
    cornice: { type: 'bracket', color: [0.78, 0.74, 0.64], brackets: 'small' },
    windows: {
      lintel: 'cap',
      lights: '2/2',
      width: { max: 0.95, bay: 0.5 },
      rows: [null, { y: 4.15, h: 1.75 }, { y: 7.75, h: 1.45 }],
      // Round-arched windows of the 2nd floor, the mark of the style
      floors: { 1: { lintel: 'arch' } },
    },
    flats: [
      {
        id: 'F2',
        floor: 1,
        rooms: { 0: 'living', 1: 'living', 2: 'bedroom' },
        dress: ['curtain', 'olive'],
        lit: ['living'],
      },
      {
        id: 'F3',
        floor: 2,
        rooms: { 0: 'kitchen', 1: 'living', 2: 'bedroom' },
        dress: ['sheer', 'linen'],
        lit: [],
      },
    ],
    // One AC: the top flat's bedroom
    acUnder: [[2, 2]],
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 2,
        w: 0.95,
        h: 2.2,
        surround: 'arch',
        numberOn: 'fan',
        intercom: true,
        color: [0.1, 0.16, 0.28],
        trim: STUCCO_TRIM,
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'NEWS',
        axes: [0, 1],
        // Clear of the flats' intercom
        inset: [0, 0.15],
        door: 'center',
        paint: NAVY,
        // A low front over a high bulkhead, the racks before it under a narrow awning
        bulkhead: 0.6,
        awning: [0.2, 0.32, 0.52],
        awningReach: 0.6,
        racks: true,
        glow: [0.72, 0.6, 0.42],
      },
    ],
  },

  no104: {
    number: 104,
    style: 'romanesque',
    roof: { type: 'flat' },
    depth: 11.0,
    height: 12.8,
    // Basement, the parlor floor at the top of the stoop, two floors above
    floors: [2.0, 3.8, 3.5, 3.5],
    grid: { type: 'even', count: 3, edge: 0.45 },
    wall: {
      ground: { tile: 'stone_rockfaced', color: ROCK_RED, texScale: 1.0 },
      upper: { tile: 'wall_stone', color: BROWNSTONE, texScale: 1.0 },
      // Rock-faced up through the parlor floor
      groundH: 5.8,
      trim: RED_SANDSTONE,
      // The cap of the rock-faced storeys, the sill course of the arcade
      belts: [5.7, 9.42],
      // Squat colonnettes the arcade's arches spring from (bay edges)
      pilasters: { at: [0.45, 2.483, 4.517, 6.55], y0: 9.6, y1: 11.05, w: 0.28, round: true },
    },
    cornice: { type: 'corbelTable', color: RED_SANDSTONE },
    windows: {
      lintel: 'flat',
      lights: '1/1',
      width: { max: 1.2, bay: 0.6 },
      rows: [
        { y: 0.5, h: 0.85, w: 0.9 },
        { y: 2.45, h: 1.9 },
        { y: 6.4, h: 1.8 },
        // The arcade (2:3 glass including the round top)
        { y: 9.75, h: 1.3, w: 1.3 },
      ],
      floors: {
        // Basement windows: dark glass behind grilles, under rough lintels
        0: { glass: [0.1, 0.1, 0.11], guard: true, lights: null, lintel: 'block' },
        1: { lintel: 'arch', rock: true, lights: 'transom' },
        3: { lintel: 'arch', rock: true },
      },
      // One wide arched parlor window over the two left bays
      cells: { '0/1': { at: 2.483, w: 1.9 } },
    },
    // One family: the same curtains everywhere
    flats: [
      { id: 'H', floor: 0, rooms: { 0: 'kitchen', 1: 'kitchen' }, dress: HOUSE, lit: ['kitchen'] },
      { id: 'H', floor: 1, rooms: { 0: 'parlor' }, dress: HOUSE, lit: ['parlor'] },
      {
        id: 'H',
        floor: 2,
        rooms: { 0: 'bedroom', 1: 'study', 2: 'bedroom' },
        dress: HOUSE,
        lit: ['study'],
      },
      {
        id: 'H',
        floor: 3,
        rooms: { 0: 'bedroom', 1: 'bedroom', 2: 'bedroom' },
        dress: HOUSE,
        lit: [],
      },
    ],
    entrances: [
      {
        kind: 'house',
        axis: 2,
        y0: 2.0,
        w: 1.0,
        h: 2.3,
        surround: 'arch',
        trimTile: 'stone_rockfaced',
        trim: RED_SANDSTONE,
        archivolt: true,
        numberOn: 'keystone',
        color: [0.22, 0.12, 0.08],
        // Seven steps reaching 2.1 m – up to the tree line – between solid stone cheek walls
        stoop: { w: 1.6, steps: 7, run: 0.25, landing: 0.6, rails: 'stone', color: ROCK_RED },
      },
    ],
    // The areaway before the basement, a box hedge along its railing
    areaways: [{ span: [0.3, 4.3], depth: 1.3, hedge: { h: 0.75 } }],
  },
});
