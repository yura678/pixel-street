/**
 * Chunk 4 (Z 80–100 m) · «Vinyl Records, Pizzeria & Industrial Workshop»
 *
 * № 124 – Neo-Grec, 1865–85: the style of machine-cut ornament. Light buff brick (a contrast
 * to the dark brownstone of № 122), massive incised brownstone lintels with ears, sills on
 * small angular consoles, 2/2 sashes, a sheet-metal cornice with four angular brackets and an
 * incised frieze dated 1879 in its middle panel. A record shop across the first two bays –
 * recessed door between two plain panes, dark-blue paint, the awning rolled up, a vinyl-disc
 * blade sign over the door – and the door to the two flats (one per floor) in the third bay.
 * Three storeys: no fire escape.
 *
 * № 126 – Federal, 1790–1835, the oldest type on the street: dark red Flemish bond, two
 * storeys under a side-gabled slate roof with two narrow pedimented dormers and chimneys on
 * both party walls, 6/6 sashes with dark green shutters under plain stone lintels. The ground
 * floor was cut out for a pizzeria later (red painted shopfront, glazed door); the original
 * Federal doorway with its fanlight and white pilasters survives in the third bay and leads to
 * the duplex upstairs. No AC – the pizza oven's steel flue climbs the back slope instead.
 *
 * № 128 – a one-storey taxpayer of 1924: dark brown brick, a parapet stepped up in the middle
 * round a terracotta date panel, a bike workshop behind a wide roll-down shutter left half
 * open over the warm light inside, a narrow display window and the door, the BIKES fascia, a
 * round blade sign with a bicycle, a bike on the rack and a floor pump by the step. Both neighbours are taller:
 * № 126's gable end with its chimney rises on the left.
 */

const ROOMS_FLAT = Object.freeze({ 0: 'living', 1: 'living', 2: 'bedroom' });
const BUFF_BRICK = [0.8, 0.74, 0.6];
const BROWNSTONE = [0.47, 0.32, 0.26];
const FEDERAL_RED = [0.52, 0.24, 0.18];
const SHUTTER_GREEN = [0.13, 0.25, 0.17];
const DUPLEX = Object.freeze(['curtain', 'olive']);

export const CHUNK_04 = Object.freeze({
  no124: {
    number: 124,
    style: 'neoGrec',
    roof: { type: 'flat' },
    depth: 8.5,
    height: 10.7,
    floors: [3.9, 3.5, 3.3],
    grid: { type: 'even', count: 3, edge: 0.45 },
    wall: {
      ground: { tile: 'wall_brick', color: BUFF_BRICK, texScale: 1.2 },
      upper: { tile: 'wall_brick', color: BUFF_BRICK, texScale: 1.2 },
      trim: BROWNSTONE,
      belts: [3.78],
    },
    // Painted tin; four brackets frame three incised panels, the date in the middle one
    cornice: { type: 'neoGrec', color: [0.36, 0.31, 0.27], bays: 3, date: 1879 },
    windows: {
      lintel: 'incised',
      lights: '2/2',
      width: { max: 0.95, bay: 0.5 },
      rows: [null, { y: 4.45, h: 1.75 }, { y: 7.85, h: 1.45 }],
      floors: { 1: { sillConsoles: true }, 2: { sillConsoles: true } },
    },
    flats: [
      { id: 'F2', floor: 1, rooms: ROOMS_FLAT, dress: ['curtain', 'wine'], lit: ['living'] },
      { id: 'F3', floor: 2, rooms: ROOMS_FLAT, dress: ['sheer', 'linen'], lit: ['bedroom'] },
    ],
    // One AC: the 3rd-floor bedroom
    acUnder: [[2, 2]],
    services: { downpipes: 'right' },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 2,
        w: 0.9,
        h: 2.3,
        transom: 'rect',
        intercom: true,
        color: [0.2, 0.15, 0.12],
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'RECORDS',
        axes: [0, 1],
        door: 'center',
        recessed: true,
        paint: [0.1, 0.14, 0.27],
        awning: [0.17, 0.22, 0.36],
        awningRolled: true,
        blade: { tile: 'blade_record', r: 0.42 },
      },
    ],
  },

  no126: {
    number: 126,
    style: 'federal',
    roof: {
      type: 'gable',
      h: 2.6,
      tile: 'slate_rect',
      color: [0.3, 0.31, 0.35],
      // Two narrow dormers, set between the window axes; the rooms behind are on axes 0 and 2
      dormers: { axes: [0, 2], at: [2.4, 4.6], w: 0.95, h: 1.35, head: 'pediment', lights: '6/6' },
      // The pizza oven's flue, metres from the left corner
      flue: { at: 1.6 },
    },
    depth: 8.0,
    height: 6.4,
    floors: [3.4, 3.0, 2.6],
    grid: { type: 'even', count: 3, edge: 0.35 },
    wall: {
      ground: { tile: 'brick_flemish', color: FEDERAL_RED, texScale: 1.0 },
      upper: { tile: 'brick_flemish', color: FEDERAL_RED, texScale: 1.0 },
      trim: [0.78, 0.74, 0.66],
    },
    cornice: { type: 'simple' },
    windows: {
      lintel: 'flat',
      lights: '6/6',
      width: { max: 0.82, bay: 0.5 },
      // Shopfront below, the attic lit by the dormers
      rows: [null, { y: 4.0, h: 1.65 }, null],
      floors: { 1: { shutters: SHUTTER_GREEN } },
    },
    flats: [
      {
        id: 'D',
        floor: 1,
        rooms: { 0: 'living', 1: 'living', 2: 'dining' },
        dress: DUPLEX,
        lit: ['living'],
      },
      { id: 'D', floor: 2, rooms: { 0: 'bedroom', 2: 'bedroom' }, dress: DUPLEX, lit: [] },
    ],
    entrances: [
      { kind: 'shop' },
      {
        kind: 'house',
        axis: 2,
        y0: 0.34,
        w: 0.9,
        h: 2.05,
        transom: 'fan',
        surround: 'pilasters',
        color: [0.12, 0.2, 0.15],
        trim: [0.92, 0.9, 0.84],
        stoop: { w: 1.5, steps: 2, rails: 'none' },
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'PIZZA',
        axes: [0, 1],
        door: 'left',
        paint: [0.56, 0.13, 0.11],
        neon: true,
      },
    ],
  },

  no128: {
    number: 128,
    style: 'taxpayer',
    roof: {
      type: 'parapet',
      h: 0.8,
      profile: 'stepped',
      date: 1924,
      coping: [0.78, 0.56, 0.44],
      kit: 'shop',
    },
    depth: 9.0,
    height: 4.2,
    floors: [4.2],
    grid: { type: 'even', count: 1, edge: 0.3 },
    wall: {
      ground: { tile: 'wall_brick', color: [0.4, 0.26, 0.19], texScale: 1.2 },
      upper: { tile: 'wall_brick', color: [0.4, 0.26, 0.19], texScale: 1.2 },
      trim: [0.78, 0.56, 0.44],
      // The shutter and the door run down to the sidewalk
      plinth: false,
    },
    cornice: { type: 'none' },
    windows: { lintel: 'flat', lights: '1/1', width: { max: 1.0, bay: 0.5 }, rows: [null] },
    flats: [],
    entrances: [{ kind: 'shop' }],
    shops: [
      {
        kind: 'workshop',
        sign: 'BIKES',
        span: [0.3, 6.2],
        roller: 2.6,
        open: 0.45,
        paint: [0.2, 0.28, 0.24],
        blade: { tile: 'blade_bike', r: 0.36 },
        pump: true,
      },
    ],
  },
});
