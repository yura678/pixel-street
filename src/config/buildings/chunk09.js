/**
 * Chunk 9 (Z 180–200 m) · «Antique Horology, Residence & Evening Neon»
 *
 * № 150 – Romanesque Revival, 1889: rock-faced red-brown stone on the ground storey, dark red
 * brick with terracotta above, deep round arches and windows set well into the wall. The
 * clockmaker's shop under one wide stone arch across two bays – glass filling the arch, a
 * wooden impost with the CLOCKS board, the door deep in a little lobby – and over the sidewalk
 * the double-sided clock on a wrought-iron bracket, at the same ten past ten as the town hall
 * clock. A smaller arch in the third bay is the door to the three flats, «150» in a terracotta
 * tablet over it. Three windows under massive rough-cut lintels on the 2nd floor, the arcade of
 * the 3rd – three round-arched windows on squat colonnettes with foliate capitals, terracotta
 * squares in the spandrels – and paired arched lights on the 4th, a terracotta band under them.
 * A brick corbel table for a crown, a low gable over the middle with the date. One AC; the fire
 * escape is at the back: the arcade is the point of the front.
 *
 * № 152 – Federal, the type of № 126 as it was built, without a shop: two storeys and an attic
 * in salmon-pink Flemish bond (№ 126 is dark red), white marble lintels with keystones, 6/6
 * sashes with shutters on both floors (№ 126 has them upstairs only), flower boxes on the
 * parlor floor. Four steps with iron rails up to the dark green door with its fanlight, side
 * lights and «152» in brass numerals on the door; a dentil cornice, a slate roof with two
 * round-headed dormers (№ 126's are pedimented) and chimneys on both party walls. One family:
 * no ACs, no fire escape. Both neighbours tower over it.
 *
 * № 154 – a tenement on a 20-foot lot, one railroad flat a floor: five storeys of yellowish
 * «Roman» brick, brownstone lintels with ears, 1/1 sashes, a brown pressed-metal cornice with a
 * sunburst in the middle. The bar across the two right bays – dark wood, narrow glass over a
 * high bulkhead, transom lights, a neon cocktail glass in the window, BAR in vertical neon on a
 * bracket from the transom to the 2nd-floor sill, all lit at dusk – and the door to the flats in
 * the left bay. The fire escape over the two left bays (the living rooms), its drop ladder over
 * the flats' door, not over the bar. Two ACs for four flats. On the left party wall, high over
 * № 152, the trace of an older and steeper roof.
 */

const ROCK_RED = [0.5, 0.3, 0.24];
const ROMANESQUE_BRICK = [0.4, 0.17, 0.13];
const RED_SANDSTONE = [0.58, 0.37, 0.29];

const SALMON_BRICK = [0.72, 0.42, 0.33];
const MARBLE = [0.9, 0.89, 0.85];
const SHUTTER_BLACK = [0.07, 0.08, 0.08];
const HOUSE_DRESS = Object.freeze(['curtain', 'teal']);

const ROMAN_BRICK = [0.78, 0.66, 0.44];
const BROWNSTONE = [0.45, 0.3, 0.24];
const TIN_BROWN = [0.32, 0.21, 0.14];
const BAR_WOOD = [0.16, 0.09, 0.06];
/** A railroad flat: the living room over the two left bays, the bedroom on the right. */
const RAILROAD = Object.freeze({ 0: 'living', 1: 'living', 2: 'bedroom' });

export const CHUNK_09 = Object.freeze({
  no150: {
    number: 150,
    style: 'romanesque',
    roof: { type: 'flat' },
    depth: 11.0,
    height: 14.7,
    floors: [4.9, 3.4, 3.4, 3.0],
    grid: { type: 'even', count: 3, edge: 0.45 },
    wall: {
      ground: { tile: 'stone_rockfaced', color: ROCK_RED, texScale: 1.0 },
      upper: { tile: 'wall_brick', color: ROMANESQUE_BRICK, texScale: 1.1 },
      trim: RED_SANDSTONE,
      // The cap of the stone storey, the sill course of the arcade
      belts: [4.8, 8.55],
      pilasters: [
        // The arcade: four squat colonnettes the arches spring from (bay edges, metres from the
        // left corner)
        {
          at: [0.45, 2.483, 4.517, 6.55],
          y0: 8.73,
          y1: 10.2,
          w: 0.3,
          round: true,
          capital: 'corinthian',
        },
        // The colonnette between the two lights of every pair on the top floor
        { at: [1.467, 3.5, 5.533], y0: 12.25, y1: 12.9, w: 0.16, round: true },
      ],
      // Terracotta squares in the spandrels of the arcade, a band under the top floor's lights
      insets: [
        { at: 0.36, y: 10.75, w: 0.32, h: 0.32 },
        { at: 2.483, y: 10.75, w: 0.32, h: 0.32 },
        { at: 4.517, y: 10.75, w: 0.32, h: 0.32 },
        { at: 6.64, y: 10.75, w: 0.32, h: 0.32 },
        { at: 3.5, y: 11.92, w: 6.9, h: 0.22 },
      ],
    },
    // Brick arcature on sandstone corbels, a low gable over the middle with the date
    cornice: { type: 'corbelTable', color: RED_SANDSTONE, date: 1889 },
    windows: {
      lintel: 'block',
      lights: '1/1',
      width: { max: 1.15, bay: 0.6 },
      rows: [
        null,
        { y: 5.75, h: 1.725, w: 1.15 },
        // The arcade (2:3 glass including the round top)
        { y: 8.85, h: 1.35, w: 1.35 },
        // Paired lights, either side of a colonnette on the axis
        { y: 12.3, h: 0.6, w: 0.6, pair: 0.47 },
      ],
      floors: {
        2: { lintel: 'arch', rock: true },
        3: { lintel: 'arch', rock: true, lights: null },
      },
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
        rooms: { 0: 'living', 1: 'living', 2: 'bedroom' },
        dress: ['sheer', 'linen'],
        lit: ['bedroom'],
      },
      {
        id: 'F4',
        floor: 3,
        rooms: { 0: 'bedroom', 1: 'living', 2: 'bedroom' },
        dress: ['curtain', 'wine'],
        lit: ['living'],
      },
    ],
    // One AC: F2's bedroom over the flats' door
    acUnder: [[2, 1]],
    // The arcade is the point of the front: the fire escape is at the back
    egress: { side: 'rear', escapes: [[0, 2]], landings: [4.95, 8.35, 11.75] },
    partyWall: { flues: 1 },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 2,
        w: 1.0,
        h: 2.3,
        surround: 'arch',
        trimTile: 'stone_rockfaced',
        trim: RED_SANDSTONE,
        numberOn: 'panel',
        intercom: true,
        color: [0.24, 0.1, 0.08],
      },
    ],
    shops: [
      {
        kind: 'arch',
        sign: 'CLOCKS',
        // The outer edges of the jambs: the two left bays
        span: [0.45, 4.517],
        spring: 2.5,
        paint: [0.2, 0.12, 0.07],
      },
    ],
    // The clockmaker's double-sided clock on its bracket, beside the flats' door
    signs: [{ kind: 'clock', at: 4.67, y: 3.55 }],
  },

  no152: {
    number: 152,
    style: 'federal',
    roof: {
      type: 'gable',
      h: 2.8,
      tile: 'slate_rect',
      color: [0.34, 0.34, 0.38],
      // Round-headed dormers over the outer bays: the attic bedrooms
      dormers: { axes: [0, 2], w: 1.0, h: 1.5, head: 'round', lights: '6/6' },
    },
    depth: 8.0,
    height: 6.6,
    floors: [3.5, 3.1, 2.6],
    grid: { type: 'even', count: 3, edge: 0.35 },
    wall: {
      ground: { tile: 'brick_flemish', color: SALMON_BRICK, texScale: 1.0 },
      upper: { tile: 'brick_flemish', color: SALMON_BRICK, texScale: 1.0 },
      trim: MARBLE,
    },
    cornice: { type: 'simple' },
    windows: {
      lintel: 'keystone',
      lights: '6/6',
      width: { max: 0.82, bay: 0.5 },
      // The parlor floor raised over the stoop; lower windows upstairs; the attic lit by dormers
      rows: [{ y: 1.15, h: 1.75 }, { y: 4.15, h: 1.5 }, null],
      floors: { 0: { shutters: SHUTTER_BLACK }, 1: { shutters: SHUTTER_BLACK } },
    },
    // One family over three floors, the door in the left bay of the parlor floor
    flats: [
      {
        id: 'H',
        floor: 0,
        rooms: { 1: 'parlor', 2: 'parlor' },
        dress: HOUSE_DRESS,
        lit: ['parlor'],
      },
      {
        id: 'H',
        floor: 1,
        rooms: { 0: 'bedroom', 1: 'bedroom', 2: 'study' },
        dress: HOUSE_DRESS,
        lit: ['study'],
      },
      { id: 'H', floor: 2, rooms: { 0: 'bedroom', 2: 'bedroom' }, dress: HOUSE_DRESS, lit: [] },
    ],
    entrances: [
      {
        kind: 'house',
        axis: 0,
        y0: 0.68,
        w: 0.9,
        h: 2.05,
        transom: 'fan',
        sidelights: true,
        surround: 'arch',
        numberOn: 'door',
        color: [0.07, 0.2, 0.13],
        trim: MARBLE,
        stoop: { w: 1.6, steps: 4, rails: 'iron', color: [0.62, 0.6, 0.56] },
      },
    ],
  },

  no154: {
    number: 154,
    style: 'tenement',
    roof: { type: 'flat' },
    depth: 14.0,
    height: 17.0,
    floors: [4.0, 3.25, 3.25, 3.25, 3.25],
    grid: { type: 'even', count: 3, edge: 0.3 },
    wall: {
      ground: { tile: 'wall_brick', color: ROMAN_BRICK, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: ROMAN_BRICK, texScale: 1.1 },
      trim: BROWNSTONE,
      belts: [3.88],
    },
    // Pressed sheet metal painted brown, a sunburst in the middle panel
    cornice: { type: 'tenement', color: TIN_BROWN, bays: 3, sunburst: true },
    windows: {
      lintel: 'eared',
      lights: '1/1',
      width: { max: 0.9, bay: 0.52 },
      rows: [
        null,
        { y: 4.7, h: 1.55 },
        { y: 7.95, h: 1.5 },
        { y: 11.2, h: 1.5 },
        { y: 14.35, h: 1.25 },
      ],
    },
    flats: [
      { id: 'F2', floor: 1, rooms: RAILROAD, dress: ['blind', 'cream'], lit: ['living'] },
      { id: 'F3', floor: 2, rooms: RAILROAD, dress: ['curtain', 'wine'], lit: [] },
      {
        id: 'F4',
        floor: 3,
        rooms: RAILROAD,
        dress: ['sheer', 'rose'],
        lit: ['living', 'bedroom'],
      },
      { id: 'F5', floor: 4, rooms: RAILROAD, dress: ['curtain', 'teal'], lit: ['bedroom'] },
    ],
    // Two ACs for four flats: the bedrooms of the 3rd and the 5th floor
    acUnder: [
      [2, 2],
      [2, 4],
    ],
    // Over the living rooms of the two left bays; the drop ladder over the flats' door
    egress: {
      side: 'front',
      escapes: [[0, 1]],
      drop: 'left',
      landings: [4.05, 7.3, 10.55, 13.8],
    },
    partyWall: { flues: 2, scar: 'left' },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 0,
        y0: 0.17,
        w: 0.95,
        h: 2.25,
        transom: 'rect',
        intercom: true,
        color: [0.22, 0.14, 0.1],
        stoop: { w: 1.3, steps: 1, rails: 'none' },
      },
    ],
    // The bar: dark wood, narrow glass over a high bulkhead, a neon cocktail in the window
    shops: [
      {
        kind: 'storefront',
        axes: [1, 2],
        door: 'right',
        paint: BAR_WOOD,
        bulkhead: 1.0,
        neonTile: 'neon_cocktail',
        glow: [0.7, 0.34, 0.46],
      },
    ],
    // BAR in vertical neon by the bar's door, from the transom to the 2nd-floor sill
    signs: [{ kind: 'vertical', tile: 'vsign_bar', at: 5.84, y0: 2.8, h: 1.8, w: 0.6, dusk: true }],
  },
});
