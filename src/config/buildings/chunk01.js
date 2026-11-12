/**
 * Chunk 1 (Z 20–40 m) · «Books, Florist & Grand Pre-Park Corner» – the last chunk before the
 * garden of № 114.
 *
 * № 106 – Dutch Revival with a neck gable (halsgevel): four storeys of dark brown Amsterdam
 * brick, light sandstone dressings, cross windows under flat stone arches with a decorative
 * keystone. Over the eave band the gable narrows to a neck one bay wide between two sandstone
 * shoulders, a window in it, the hoist beam with its hook over it and a small pediment on top –
 * a different form from the stepped gable of № 130. The bookshop: a navy wooden front, BOOKS in
 * gilt letters, one big pane under a transom of small lights, the wooden cart of books on the
 * sidewalk before it; the door to the three flats on the right, «106» on its transom. One AC;
 * the fire escape is at the back, the gable front stays clean.
 *
 * № 108 – Italianate in warm rose brick with cream trim: flat lintels under little cornices on
 * consoles, 2/2 sashes, a cream wooden cornice on brackets, a flat roof. The florist across two
 * bays – a front the colour of the old sign's lilac wine under an awning of the same tone, a
 * stepped stand of zinc buckets of cut flowers before both panes either side of the door – and
 * the door to the two flats on the left, «108». Flower boxes under every window of the 2nd
 * floor carry the shop up the front; one AC on the 3rd floor, no fire escape. The bicycle with
 * its basket of flowers still stands at the curb.
 *
 * № 110 – Greek Revival, one family, the corner of the garden: dark red brick over a granite
 * base with grilled basement windows. Six granite steps with iron rails up to a small Doric
 * portico on the left bay – two columns, an entablature with triglyphs and «110» in its frieze –
 * before the door with side lights and a transom. Tall 6/9 sashes on the parlor floor, 6/6
 * above, the frieze storey's small windows behind cast-iron grilles with antefixes, a dentil
 * cornice. № 114 stands 6.4 m back, so the right flank looks over its garden and is a second
 * front for those first 6.4 m: two bays of windows, a French window opening on a cast-iron
 * balcony on the parlor floor, the cornice and the belt course turning the corner, the
 * downpipe on the corner. No ACs, no fire escape.
 */

const AMSTERDAM_BRICK = [0.36, 0.2, 0.15];
const SANDSTONE = [0.85, 0.79, 0.64];
const BOOKS_NAVY = [0.1, 0.15, 0.28];

const ROSE_BRICK = [0.76, 0.48, 0.45];
const CREAM = [0.9, 0.85, 0.72];
const LILAC_WINE = [0.36, 0.15, 0.24];

const GREEK_BRICK = [0.48, 0.22, 0.17];
const GRANITE = [0.62, 0.62, 0.6];
const GRANITE_TRIM = [0.72, 0.72, 0.7];
const PORTICO_WHITE = [0.88, 0.86, 0.8];
const DARK_GLASS = Object.freeze([0.09, 0.095, 0.11]);
const HOUSE = Object.freeze(['sheer', 'cream']);

export const CHUNK_01 = Object.freeze({
  no106: {
    number: 106,
    style: 'dutchRevival',
    roof: {
      type: 'neckGable',
      // The neck one bay wide rising free of the shoulders, its window across their tops
      neckW: 2.0,
      shoulderH: 1.6,
      neckH: 1.6,
      pedH: 0.5,
      tile: 'slate_rect',
      color: [0.3, 0.3, 0.33],
      window: { y: 0.55, w: 0.85, h: 1.1, lintel: 'keystone', lights: 'cross' },
    },
    depth: 12.0,
    height: 12.7,
    floors: [3.75, 3.05, 3.0, 2.9],
    grid: { type: 'even', count: 3, edge: 0.45 },
    wall: {
      ground: { tile: 'wall_brick', color: AMSTERDAM_BRICK, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: AMSTERDAM_BRICK, texScale: 1.1 },
      trim: SANDSTONE,
      // Over the shop, and the sandstone band at the foot of the gable
      belts: [3.68, 12.52],
    },
    // The gable is the crown
    cornice: { type: 'none' },
    windows: {
      lintel: 'keystone',
      lights: 'cross',
      width: { max: 1.0, bay: 0.56 },
      rows: [null, { y: 4.2, h: 1.6 }, { y: 7.25, h: 1.55 }, { y: 10.2, h: 1.5 }],
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
        dress: ['sheer', 'cream'],
        lit: ['kitchen'],
      },
      {
        id: 'F4',
        floor: 3,
        rooms: { 0: 'living', 1: 'living', 2: 'bedroom' },
        dress: ['curtain', 'rose'],
        lit: ['bedroom'],
      },
    ],
    // One AC: F3's bedroom
    acUnder: [[2, 2]],
    // The gable front stays clean: the fire escape is at the back
    egress: { side: 'rear', escapes: [[0, 2]], landings: [3.75, 6.8, 9.8] },
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
        color: [0.3, 0.12, 0.1],
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'BOOKS',
        axes: [0, 1],
        // Clear of the flats' intercom
        inset: [0, 0.1],
        door: 'left',
        paint: BOOKS_NAVY,
        // A transom of small lights over one big pane, the cart of books before it
        transomPanes: true,
        cart: true,
        glow: [0.78, 0.6, 0.36],
      },
    ],
  },

  no108: {
    number: 108,
    style: 'italianate',
    roof: { type: 'flat' },
    depth: 10.0,
    height: 10.8,
    floors: [4.0, 3.5, 3.3],
    grid: { type: 'even', count: 3, edge: 0.45 },
    wall: {
      ground: { tile: 'wall_brick', color: ROSE_BRICK, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: ROSE_BRICK, texScale: 1.1 },
      trim: CREAM,
      belts: [3.88],
    },
    // A wooden cornice on brackets, painted cream
    cornice: { type: 'bracket', color: [0.88, 0.83, 0.7] },
    windows: {
      // Flat lintels under little cornices on consoles
      lintel: 'hood',
      lights: '2/2',
      width: { max: 1.0, bay: 0.5 },
      rows: [null, { y: 4.5, h: 1.6 }, { y: 7.9, h: 1.5 }],
      // The flower boxes of the 2nd floor in bloom: geraniums, petunias, white daisies
      cells: {
        '0/1': { blooms: [0.86, 0.16, 0.18] },
        '1/1': { blooms: [0.92, 0.5, 0.68] },
        '2/1': { blooms: [0.97, 0.95, 0.9] },
      },
    },
    flats: [
      {
        id: 'F2',
        floor: 1,
        rooms: { 0: 'living', 1: 'living', 2: 'bedroom' },
        dress: ['curtain', 'rose'],
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
    // The florist's flowers carried up the front: a box under every window of the 2nd floor
    flowerBoxes: [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 0,
        w: 0.95,
        h: 2.3,
        transom: 'rect',
        surround: 'hood',
        intercom: true,
        color: [0.16, 0.24, 0.2],
        trim: CREAM,
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'FLOWERS',
        axes: [1, 2],
        door: 'center',
        paint: LILAC_WINE,
        awning: [0.5, 0.24, 0.36],
        // Buckets of cut flowers on a stepped stand before both panes
        flowerStand: true,
        standPaint: [0.22, 0.32, 0.24],
        glow: [0.76, 0.52, 0.5],
      },
    ],
  },

  no110: {
    number: 110,
    style: 'greekRevival',
    roof: { type: 'flat' },
    depth: 10.0,
    height: 12.25,
    // The granite base (the basement kitchen), the parlor floor at the top of the stoop, a
    // bedroom floor, the top floor and the low frieze storey under the cornice
    floors: [1.05, 3.65, 3.25, 3.0, 1.3],
    grid: { type: 'even', count: 3, edge: 0.35 },
    wall: {
      ground: { tile: 'wall_stone', color: GRANITE, texScale: 0.9 },
      upper: { tile: 'wall_brick', color: GREEK_BRICK, texScale: 1.1 },
      trim: GRANITE_TRIM,
      // The water table on top of the granite base
      belts: [0.85],
    },
    cornice: { type: 'simple' },
    windows: {
      lintel: 'flat',
      lights: '6/6',
      width: { max: 1.05, bay: 0.55 },
      rows: [
        { y: 0.22, h: 0.5, w: 0.7 },
        { y: 1.45, h: 2.1 },
        { y: 5.1, h: 1.6 },
        { y: 8.3, h: 1.45, w: 0.97 },
        { y: 11.15, h: 0.35, w: 0.9 },
      ],
      floors: {
        // Basement windows: dark glass behind grilles, under the water table
        0: { glass: DARK_GLASS, guard: true, lights: null, lintel: 'none' },
        // Tall 6/9 sashes of the parlor floor (1:2 tile)
        1: { lights: '6/9', tile: 'win_six_nine' },
        // Frieze windows: dark glass behind cast-iron grilles with antefixes, no heads
        4: { glass: DARK_GLASS, guard: 'antefix', lintel: 'none', lights: null },
      },
    },
    // One family: the same curtains everywhere; the stoop covers the basement on the left bay
    flats: [
      { id: 'H', floor: 0, rooms: { 1: 'kitchen', 2: 'kitchen' }, dress: HOUSE, lit: ['kitchen'] },
      { id: 'H', floor: 1, rooms: { 1: 'parlor', 2: 'parlor' }, dress: HOUSE, lit: ['parlor'] },
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
      { id: 'H', floor: 4, rooms: { 0: 'attic', 1: 'attic', 2: 'attic' }, dress: HOUSE, lit: [] },
    ],
    entrances: [
      {
        kind: 'house',
        axis: 0,
        y0: 1.05,
        w: 0.95,
        h: 2.3,
        sidelights: true,
        transom: 'rect',
        surround: 'portico',
        numberOn: 'entablature',
        // A portico of painted wood, smooth white
        trimTile: 'wood_paint',
        trim: PORTICO_WHITE,
        color: [0.1, 0.16, 0.13],
        // A lantern under the porch ceiling
        lamp: true,
        // Six granite steps reaching 2.1 m – up to the tree line – wide enough for the columns
        stoop: { w: 2.3, steps: 6, run: 0.25, landing: 0.85, rails: 'iron', color: GRANITE },
      },
    ],
    // The flank over the garden of № 114 – open for the 6.4 m it stands back
    flanks: {
      right: {
        windows: [
          // A French window onto the balcony, a tall sash beside it
          {
            at: 1.95,
            floors: [1],
            w: 1.05,
            h: 2.1,
            sill: 0.2,
            room: 'parlor',
            lights: '6/9',
            tile: 'win_six_nine',
          },
          {
            at: 4.55,
            floors: [1],
            w: 1.05,
            h: 2.1,
            sill: 0.4,
            room: 'parlor',
            lights: '6/9',
            tile: 'win_six_nine',
          },
          { at: 1.95, floors: [2], w: 1.05, h: 1.6, sill: 0.4, room: 'bedroom', lights: '6/6' },
          { at: 4.55, floors: [2], w: 1.05, h: 1.6, sill: 0.4, room: 'bedroom', lights: '6/6' },
          { at: 1.95, floors: [3], w: 0.97, h: 1.45, sill: 0.35, room: 'bedroom', lights: '6/6' },
          { at: 4.55, floors: [3], w: 0.97, h: 1.45, sill: 0.35, room: 'bedroom', lights: '6/6' },
          ...[1.95, 4.55].map((at) => ({
            at,
            floors: [4],
            w: 0.9,
            h: 0.35,
            sill: 0.2,
            room: 'attic',
            glass: DARK_GLASS,
            guard: 'antefix',
            lintel: 'none',
            lights: null,
          })),
        ],
        // A cast-iron balcony before the French window, its slab just under the sill
        ironBalcony: { span: [1.3, 2.6], y: 1.22, depth: 0.45, consoles: [1.5, 2.4] },
        downpipes: [0.25],
        // The granite base, the water table and the cornice run along the whole open flank
        wrap: 6.4,
        belts: true,
        parapet: true,
      },
    },
  },
});
