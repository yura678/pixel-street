/**
 * Chunk 6 (Z 120–140 m) · «Laundromat, Townhouse & Tea Salon»
 *
 * № 134 – a Commercial-style building of the 1910s: three storeys of light sand brick, two wide
 * bays of Chicago windows (a big fixed pane between two narrow sashes), diamonds of darker
 * brick on the piers, no cornice – a parapet stepped up in the middle over a terracotta frieze,
 * with a white coping. A self-service laundry across nearly the whole ground floor: long glass
 * on a low bulkhead, cold fluorescent light behind it, the blue LAUNDRY fascia and WASH & FOLD
 * lettered on the glass; its door on the left, the dryers' duct climbing the facade above it,
 * the door to the flats («134») on the right. One studio flat on each upper floor, one AC.
 *
 * № 136 – an Italianate brownstone of the 1850s–60s: a rusticated English basement and three
 * storeys, all in brownstone. A high stoop of nine steps with cast-iron rails and heavy newels
 * climbs to the parlor floor – no further than the tree line – with two potted box balls on its
 * lower steps; under its landing the basement door behind an iron gate. Round-headed double
 * doors of dark walnut under a heavy hood on consoles, «136» in the fanlight. Floor-length
 * parlor windows with pediments, 2/2 sashes with eyebrow lintels above, a frieze with little
 * attic windows between paired brackets. Three flats (basement, parlor, a duplex on top), one
 * AC, the fire escape at the back; trash cans in the areaway behind its railing; the street
 * tree left of the stoop in a pit with a low guard and flowers.
 *
 * № 138 – Greek Revival of the 1830s–40s, its ground floor rebuilt for a tea salon (the stoop
 * gone, the way to the flats moved down to the sidewalk): red brick on granite trim, plain stone
 * lintels, tall 6/9 sashes on the old parlor floor, 6/6 above, and under the dentil cornice
 * the low frieze storey with three small windows behind cast-iron grilles crowned with
 * antefixes. The TEA shop – a dark green front with a door between two panes, gilt letters on
 * the fascia, a teapot hung out over the door – and the flats' door in a Greek portal of two
 * pilasters and an entablature carrying «138». Two flats, one AC, no fire escape.
 */

const SAND_BRICK = [0.8, 0.69, 0.52];
const DARK_BRICK = [0.46, 0.3, 0.22];
const TERRACOTTA = [0.8, 0.5, 0.36];
const LAUNDRY_BLUE = [0.17, 0.3, 0.42];
const STUDIO = Object.freeze({ 0: 'living', 1: 'living' });

const BROWNSTONE = [0.47, 0.32, 0.26];
const BROWNSTONE_DARK = [0.42, 0.29, 0.23];
const WALNUT = [0.24, 0.15, 0.1];
const DUPLEX = Object.freeze(['curtain', 'olive']);

const GREEK_RED = [0.56, 0.25, 0.19];
const GRANITE = [0.72, 0.72, 0.7];
const TEA_GREEN = [0.12, 0.24, 0.17];
const UPPER = Object.freeze(['curtain', 'plum']);

export const CHUNK_06 = Object.freeze({
  no134: {
    number: 134,
    style: 'commercial',
    roof: {
      type: 'parapet',
      h: 0.9,
      profile: 'stepped',
      coping: [0.92, 0.91, 0.87],
      frieze: TERRACOTTA,
    },
    depth: 9.0,
    height: 11.0,
    floors: [4.2, 3.4, 3.4],
    grid: { type: 'even', count: 2, edge: 0.5 },
    wall: {
      ground: { tile: 'wall_brick', color: SAND_BRICK, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: SAND_BRICK, texScale: 1.1 },
      trim: [0.86, 0.83, 0.75],
      belts: [4.08],
      // On the middle and right piers, level with the windows (the left one carries the duct)
      diamonds: {
        spots: [
          [3.5, 5.75],
          [6.6, 5.75],
          [3.5, 9.15],
          [6.6, 9.15],
        ],
        size: 0.22,
        color: DARK_BRICK,
      },
    },
    // No cornice: the parapet is the crown
    cornice: { type: 'none' },
    windows: {
      lintel: 'flat',
      lights: 'chicago',
      tile: 'win_chicago',
      width: { max: 2.4, bay: 0.8 },
      rows: [null, { y: 4.85, h: 1.8 }, { y: 8.25, h: 1.8 }],
    },
    flats: [
      { id: 'S2', floor: 1, rooms: STUDIO, dress: ['blind', 'linen'], lit: ['living'] },
      { id: 'S3', floor: 2, rooms: STUDIO, dress: ['curtain', 'teal'], lit: [] },
    ],
    // One AC for the two studios
    acUnder: [[1, 2]],
    services: { ducts: [{ at: 0.22, y0: 4.45 }] },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        at: 6.35,
        w: 0.9,
        h: 2.3,
        transom: 'rect',
        intercom: true,
        color: LAUNDRY_BLUE,
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'LAUNDRY',
        span: [0.3, 5.45],
        door: 'left',
        paint: LAUNDRY_BLUE,
        // Cold fluorescent light behind the glass, lettering on it
        light: [0.78, 0.9, 1.0],
        glassSign: 'WASH & FOLD',
        glow: [0.4, 0.5, 0.58],
      },
    ],
  },

  no136: {
    number: 136,
    style: 'italianate',
    roof: { type: 'flat' },
    depth: 10.0,
    height: 12.75,
    // English basement, then the parlor floor at the top of the stoop
    floors: [1.65, 4.1, 3.6, 3.4],
    grid: { type: 'even', count: 3, edge: 0.4 },
    wall: {
      ground: { tile: 'wall_stone', color: BROWNSTONE_DARK, texScale: 0.9 },
      upper: { tile: 'wall_stone', color: BROWNSTONE, texScale: 1.0 },
      trim: [0.54, 0.38, 0.3],
      rustication: 0.33,
    },
    // Frieze with attic windows between paired brackets
    cornice: { type: 'italianate', color: [0.33, 0.24, 0.2] },
    windows: {
      lintel: 'brow',
      lights: '2/2',
      width: { max: 1.05, bay: 0.5 },
      rows: [
        { y: 0.35, h: 0.95, w: 0.65 },
        { y: 2.05, h: 2.1 },
        { y: 6.35, h: 1.55, w: 1.0 },
        { y: 9.8, h: 1.45, w: 0.95 },
      ],
      floors: {
        0: { lintel: 'flat' },
        // Floor-length parlor windows under pediments (tall 1:2 sash tile)
        1: { lintel: 'pediment', tile: 'win_parlor' },
      },
    },
    flats: [
      {
        id: 'B',
        floor: 0,
        rooms: { 0: 'living', 1: 'bedroom' },
        dress: ['curtain', 'cream'],
        lit: ['living'],
      },
      {
        id: 'P',
        floor: 1,
        rooms: { 0: 'living', 1: 'living' },
        dress: ['curtain', 'wine'],
        lit: ['living'],
      },
      {
        id: 'D',
        floor: 2,
        rooms: { 0: 'living', 1: 'living', 2: 'dining' },
        dress: DUPLEX,
        lit: ['dining'],
      },
      {
        id: 'D',
        floor: 3,
        rooms: { 0: 'bedroom', 1: 'bedroom', 2: 'bedroom' },
        dress: DUPLEX,
        lit: [],
      },
    ],
    // One AC, on the top floor
    acUnder: [[2, 3]],
    // Brownstone fronts stay clean: the fire escape is at the back
    egress: { side: 'rear', escapes: [[0, 2]], landings: [5.8, 9.4, 12.8] },
    entrances: [
      {
        kind: 'house',
        axis: 2,
        y0: 1.65,
        w: 1.25,
        h: 2.35,
        leaves: 2,
        transom: 'fan',
        numberOn: 'fan',
        surround: 'hood',
        color: WALNUT,
        trim: [0.5, 0.35, 0.28],
        // Nine steps reaching 2.1 m – up to the tree line, clear of the walkway
        stoop: {
          w: 1.9,
          steps: 9,
          run: 0.2,
          landing: 0.5,
          rails: 'iron',
          color: BROWNSTONE_DARK,
          basement: { side: -1 },
          planters: true,
        },
      },
    ],
    areaways: [{ span: [0.25, 4.5], depth: 1.0, bins: [2.15, 2.8] }],
    // The street tree stands left of the stoop, clear of the hydrant
    sidewalk: { tree: 1.95 },
  },

  no138: {
    number: 138,
    style: 'greekRevival',
    roof: { type: 'flat' },
    depth: 9.0,
    height: 11.4,
    // Shop, the old parlor floor, a bedroom floor and the low frieze storey
    floors: [3.7, 3.5, 3.0, 1.2],
    grid: { type: 'even', count: 3, edge: 0.35 },
    wall: {
      ground: { tile: 'wall_brick', color: GREEK_RED, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: GREEK_RED, texScale: 1.1 },
      trim: GRANITE,
      belts: [3.58],
    },
    cornice: { type: 'simple' },
    windows: {
      lintel: 'flat',
      lights: '6/6',
      width: { max: 0.95, bay: 0.56 },
      rows: [null, { y: 4.15, h: 1.9 }, { y: 7.7, h: 1.45 }, { y: 10.42, h: 0.35, w: 0.9 }],
      floors: {
        1: { lights: '6/9', tile: 'win_six_nine' },
        // Frieze windows: dark glass behind cast-iron grilles with antefixes, no heads
        3: { glass: [0.09, 0.095, 0.11], guard: 'antefix', lintel: 'none', lights: null },
      },
    },
    flats: [
      {
        id: 'A',
        floor: 1,
        rooms: { 0: 'living', 1: 'living', 2: 'bedroom' },
        dress: ['sheer', 'cream'],
        lit: ['living'],
      },
      {
        id: 'D',
        floor: 2,
        rooms: { 0: 'bedroom', 1: 'living', 2: 'bedroom' },
        dress: UPPER,
        lit: ['living'],
      },
      {
        id: 'D',
        floor: 3,
        rooms: { 0: 'attic', 1: 'attic', 2: 'attic' },
        dress: UPPER,
        lit: [],
      },
    ],
    acUnder: [[2, 2]],
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 2,
        w: 0.95,
        h: 2.3,
        transom: 'rect',
        surround: 'pilasters',
        numberOn: 'entablature',
        color: [0.13, 0.2, 0.16],
        trim: GRANITE,
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'TEA',
        axes: [0, 1],
        door: 'center',
        paint: TEA_GREEN,
        blade: { tile: 'blade_teapot', r: 0.34 },
      },
    ],
  },
});
