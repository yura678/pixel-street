/**
 * Chunk 7 (Z 140–160 m) · «Art Gallery, Civic Plaza & Bus Stop #2» – the civic heart of the
 * street: a light stone house, the pocket square and the town hall read as one place.
 *
 * № 140 – Renaissance Revival, 1880–1910: the lightest house of the chunk, framing the square.
 * A rusticated limestone ground storey, pale yellow Roman brick above; pedimented windows on the
 * 2nd floor (a festoon under the middle one), plain ones on the 3rd, round-arched on the 4th,
 * flat pilasters between the bays of the 2nd and 3rd floors; a modillion cornice under a low
 * balustrade, a flat roof. The gallery: two big single panes in black steel without a
 * bulkhead, GALLERY in metal letters on the stone, an exhibition banner on an iron arm; the
 * door to the three flats in an arch whose keystone carries «140». The flank to the square is
 * plain brick with small, slightly uneven kitchen, bedroom and bathroom windows, one AC and two
 * flower boxes; the stone facing and the cornice turn only a metre round the corner. The fire
 * escape is at the back.
 *
 * The pocket square (6 m, `world/architecture/Square.js`) – after Paley Park.
 *
 * № 142 – the town hall, Beaux-Arts: compact and symmetrical, three bays with the entrance
 * dead centre. A rusticated sandstone ground floor with an arched portal (oak doors, a
 * cartouche) between arched windows, three wide steps between lanterns on pedestals; the
 * council chamber above – three tall arched windows between paired Ionic pilasters, the middle
 * one opening onto a small stone balcony with two flags; an attic with TOWN HALL cut in the
 * stone, a balustrade and urns; the clock and bell cupola over the middle. The flank to the
 * square carries the cornice all along and three arched windows. The bus stop stands at the
 * curb in front, the notice board by the wall left of the portal; the taxi stops facing the
 * portal (the stop is the middle of the lot).
 */

const LIMESTONE = [0.86, 0.83, 0.74];
const LIMESTONE_TRIM = [0.9, 0.87, 0.79];
const ROMAN_BRICK = [0.86, 0.77, 0.56];
const GALLERY_STEEL = [0.07, 0.07, 0.08];
const FLAT_ROOMS = Object.freeze({ 0: 'living', 1: 'living', 2: 'bedroom' });

const SANDSTONE = [0.76, 0.71, 0.6];
const SANDSTONE_DARK = [0.68, 0.63, 0.52];
const SANDSTONE_TRIM = [0.84, 0.8, 0.7];
const OAK = [0.3, 0.2, 0.13];

export const CHUNK_07 = Object.freeze({
  no140: {
    number: 140,
    style: 'renaissanceRevival',
    roof: { type: 'flat' },
    depth: 11.0,
    height: 14.2,
    floors: [4.2, 3.4, 3.3, 3.3],
    grid: { type: 'even', count: 3, edge: 0.45 },
    wall: {
      ground: { tile: 'wall_stone', color: LIMESTONE, texScale: 0.9 },
      upper: { tile: 'wall_brick', color: ROMAN_BRICK, texScale: 1.0 },
      trim: LIMESTONE_TRIM,
      belts: [4.1],
      rustication: 0.4,
      // Flat pilasters between the bays of the 2nd and 3rd floors
      pilasters: { at: [2.65, 4.85], y0: 4.28, y1: 10.9, w: 0.3 },
    },
    cornice: { type: 'balustrade', color: LIMESTONE_TRIM },
    windows: {
      lintel: 'cap',
      lights: '1/1',
      width: { max: 1.0, bay: 0.5 },
      rows: [null, { y: 4.85, h: 1.6 }, { y: 8.15, h: 1.6 }, { y: 11.35, h: 1.5 }],
      floors: { 1: { lintel: 'pediment' }, 2: { lintel: 'flat' }, 3: { lintel: 'arch' } },
      // The festoon under the middle window of the 2nd floor
      cells: { '1/1': { festoon: true } },
    },
    flats: [
      { id: 'F2', floor: 1, rooms: FLAT_ROOMS, dress: ['curtain', 'teal'], lit: ['living'] },
      { id: 'F3', floor: 2, rooms: FLAT_ROOMS, dress: ['sheer', 'linen'], lit: ['bedroom'] },
      { id: 'F4', floor: 3, rooms: FLAT_ROOMS, dress: ['curtain', 'rose'], lit: ['living'] },
    ],
    egress: { side: 'rear', escapes: [[0, 2]], landings: [4.25, 7.65, 10.95] },
    flanks: {
      right: {
        // Small, slightly uneven windows of kitchens, bedrooms and bathrooms
        windows: [
          { at: 3.4, floors: [1, 2, 3], w: 0.75, h: 1.2, sill: 0.95, room: 'kitchen' },
          { at: 6.3, floors: [1, 2, 3], w: 0.85, h: 1.35, sill: 0.85, room: 'bedroom' },
          { at: 8.9, floors: [1, 2], w: 0.6, h: 0.9, sill: 1.3, room: 'bath' },
        ],
        acUnder: [[6.3, 2]],
        downpipes: [10.7],
        wrap: 1.0,
        parapet: true,
      },
    },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 2,
        w: 1.0,
        h: 2.3,
        surround: 'arch',
        numberOn: 'keystone',
        intercom: true,
        color: [0.15, 0.2, 0.18],
        trim: LIMESTONE_TRIM,
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'GALLERY',
        axes: [0, 1],
        door: 'center',
        paint: GALLERY_STEEL,
        // Plain plate glass in steel, letters on the stone
        bulkhead: false,
        transom: false,
        fascia: false,
        panes: 1,
        banner: { at: 0.3, y: 7.2, w: 0.75, h: 1.5, tile: 'banner_art' },
      },
    ],
  },

  no142: {
    number: 142,
    style: 'beauxArts',
    roof: {
      type: 'attic',
      h: 1.0,
      frontParapet: false,
      inscription: 'inscription_town_hall',
      cupola: { back: 1.3, w: 1.72, h: 2.8 },
    },
    depth: 9.0,
    height: 8.8,
    floors: [4.2, 4.6],
    grid: { type: 'even', count: 3, edge: 0.3 },
    wall: {
      ground: { tile: 'wall_stone', color: SANDSTONE_DARK, texScale: 0.9 },
      upper: { tile: 'wall_stone', color: SANDSTONE, texScale: 1.1 },
      trim: SANDSTONE_TRIM,
      belts: [4.2],
      rustication: 0.42,
      // Paired Ionic pilasters framing the council chamber's three windows
      pilasters: {
        at: [0.25, 2.267, 4.233, 6.25],
        y0: 4.38,
        y1: 8.3,
        w: 0.16,
        paired: true,
        capital: 'ionic',
      },
    },
    cornice: { type: 'simple' },
    windows: {
      lintel: 'arch',
      lights: '2/2',
      width: { max: 0.95, bay: 0.5 },
      rows: [
        { y: 1.1, h: 1.6 },
        { y: 5.0, h: 2.2 },
      ],
    },
    // Offices on the ground floor, the council chamber above: one tenancy, the town
    flats: [
      {
        id: 'HALL',
        floor: 0,
        rooms: { 0: 'office', 2: 'office' },
        dress: ['blind', 'linen'],
        lit: [],
      },
      {
        id: 'HALL',
        floor: 1,
        rooms: { 0: 'council', 1: 'council', 2: 'council' },
        dress: ['curtain', 'wine'],
        lit: ['council'],
      },
    ],
    balcony: { axis: 1, y: 4.55, w: 1.9, flag: 'flag_town' },
    flanks: {
      left: {
        windows: [
          { at: 4.5, floors: [0], w: 0.95, h: 1.6, sill: 1.1, room: 'office', lintel: 'arch' },
          { at: 2.6, floors: [1], w: 0.95, h: 2.2, sill: 0.8, room: 'council', lintel: 'arch' },
          { at: 6.4, floors: [1], w: 0.95, h: 2.2, sill: 0.8, room: 'council', lintel: 'arch' },
        ],
        // The cornice runs the whole flank: the square is a front of its own
        wrap: 9.0,
        parapet: true,
      },
    },
    entrances: [
      {
        kind: 'house',
        axis: 1,
        y0: 0.45,
        w: 1.5,
        h: 2.5,
        leaves: 2,
        surround: 'arch',
        cartouche: true,
        color: OAK,
        trim: SANDSTONE_TRIM,
        number: false,
        stoop: {
          w: 2.3,
          steps: 3,
          run: 0.3,
          landing: 0.6,
          rails: 'none',
          color: [0.62, 0.6, 0.55],
          lanterns: true,
        },
      },
    ],
  },
});
