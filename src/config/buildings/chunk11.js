/**
 * Chunk 11 (Z 220–240 m) · «Print Shop, Pharmacy & Seamless Looping Townhouse»
 *
 * № 162 – a one-storey taxpayer of the 1930s, later than № 128 and dressed for its decade: the
 * front faced in light terracotta blocks, the parapet stepped up twice over the middle in an Art
 * Deco crown with three flutes cut down it. A printer's shop behind one wide window in a slim
 * aluminium frame on a polished dark granite bulkhead, a pair of glass doors on the right for
 * the paper deliveries, PRINT in bronze letters on the terracotta frieze and an outsize type
 * sort – the letter A on its face – hung on a bracket over the doors. Nothing on the sidewalk:
 * a quiet lot after chunk 10. № 160's chimney and party wall rise over it on the left, № 164's
 * blank wall on the right.
 *
 * № 164 – Italianate of painted brick: three storeys painted a light sage, the brick still
 * showing through the paint, white trim, 2/2 sashes under segmental heads with heavy cast-iron
 * hoods on consoles painted dark green, a tin cornice on brackets in the same green. The
 * pharmacy across the first two bays – a dark green wooden front with its door recessed in a
 * lobby in the middle, a folding awning on its arms, a neon Rx in the window and a gilt mortar
 * and pestle hung out over the door – and the door to the two flats in the third bay. One AC,
 * no fire escape.
 *
 * № 166 – Neo-Grec, one family, the house where the loop closes: a high basement and three
 * storeys in dark brownstone. A canted bay over the two left bays from the areaway up to the 2nd
 * floor, a little terrace with a wrought-iron railing on top of it before the 3rd-floor windows.
 * On the right a high stoop of eight steps between heavy angular newels up to the parlor floor,
 * the door in a massive portal of grooved jambs and an incised hood, «166» in brass on the door.
 * 2/2 sashes under stepped lintels, a tin cornice on narrow stepped brackets, no date. Two trash
 * cans in the areaway behind its railing. No ACs, no fire escape. № 100 across the seam stands
 * taller and owns the party wall between them.
 */

const TERRACOTTA_LIGHT = [0.88, 0.72, 0.58];
const TERRACOTTA_TRIM = [0.93, 0.85, 0.73];
const ALUMINIUM = [0.78, 0.81, 0.84];
const GRANITE = [0.16, 0.16, 0.18];

const SAGE = [0.6, 0.68, 0.55];
const WHITE_TRIM = [0.9, 0.9, 0.86];
const IRON_GREEN = [0.1, 0.22, 0.15];

const BROWNSTONE_DARK = [0.33, 0.23, 0.18];
const BROWNSTONE = [0.37, 0.26, 0.21];
const BROWNSTONE_TRIM = [0.44, 0.32, 0.25];
const HOUSE = Object.freeze(['curtain', 'plum']);

export const CHUNK_11 = Object.freeze({
  no162: {
    number: 162,
    style: 'taxpayer',
    // Art Deco crown in terracotta; a one-storey shop has just a hatch and a fan on its roof
    roof: { type: 'parapet', h: 1.0, profile: 'deco', coping: TERRACOTTA_TRIM, kit: 'shop' },
    depth: 9.0,
    height: 4.4,
    floors: [4.4],
    grid: { type: 'even', count: 1, edge: 0.3 },
    wall: {
      ground: { tile: 'wall_stone', color: TERRACOTTA_LIGHT, texScale: 0.8 },
      upper: { tile: 'wall_stone', color: TERRACOTTA_LIGHT, texScale: 0.8 },
      trim: TERRACOTTA_TRIM,
      // The granite bulkhead runs down to the sidewalk
      plinth: false,
    },
    cornice: { type: 'none' },
    windows: { lintel: 'flat', lights: '1/1', width: { max: 1.0, bay: 0.5 }, rows: [null] },
    flats: [],
    entrances: [{ kind: 'shop' }],
    shops: [
      {
        kind: 'storefront',
        sign: 'PRINT',
        span: [0.3, 6.7],
        // A pair of glass doors on the right, wide enough for the paper
        door: 'right',
        doors: 2,
        glassDoor: true,
        frame: 'metal',
        paint: ALUMINIUM,
        bulkhead: 0.55,
        bulkheadColor: GRANITE,
        // Bronze letters on the terracotta over the glass, no fascia board
        fascia: false,
        // The type sort hangs over the doors under the parapet
        sort: { y: 4.2 },
        glow: [0.74, 0.62, 0.42],
      },
    ],
  },

  no164: {
    number: 164,
    style: 'italianate',
    roof: { type: 'flat' },
    depth: 11.0,
    height: 11.0,
    floors: [4.2, 3.5, 3.3],
    grid: { type: 'even', count: 3, edge: 0.4 },
    wall: {
      ground: { tile: 'brick_painted', color: SAGE, texScale: 1.2 },
      upper: { tile: 'brick_painted', color: SAGE, texScale: 1.2 },
      trim: WHITE_TRIM,
      belts: [4.06],
    },
    // Pressed tin on brackets, painted dark green like the window hoods
    cornice: { type: 'bracket', color: IRON_GREEN },
    windows: {
      lintel: 'segmental',
      lights: '2/2',
      width: { max: 0.95, bay: 0.5 },
      rows: [null, { y: 4.75, h: 1.42 }, { y: 8.15, h: 1.4 }],
      // White surrounds under cast-iron hoods on consoles, painted dark green
      floors: { 1: { consoles: true, hood: IRON_GREEN }, 2: { consoles: true, hood: IRON_GREEN } },
    },
    flats: [
      {
        id: 'F2',
        floor: 1,
        rooms: { 0: 'kitchen', 1: 'living', 2: 'bedroom' },
        dress: ['curtain', 'rose'],
        lit: ['living'],
      },
      {
        id: 'F3',
        floor: 2,
        rooms: { 0: 'living', 1: 'living', 2: 'bedroom' },
        dress: ['sheer', 'linen'],
        lit: ['bedroom'],
      },
    ],
    // One AC: the top flat's bedroom (the belt runs under the 2nd-floor sills)
    acUnder: [[2, 2]],
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 2,
        w: 0.95,
        h: 2.3,
        transom: 'rect',
        intercom: true,
        color: [0.12, 0.2, 0.15],
        trim: WHITE_TRIM,
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'PHARMACY',
        axes: [0, 1],
        // The door in a lobby cut into the wall between the two windows
        door: 'center',
        recessed: true,
        cut: true,
        paint: [0.1, 0.23, 0.16],
        awning: [0.22, 0.4, 0.28],
        awningArms: true,
        neonTile: 'neon_rx',
        // The gilt mortar over the door, between the 2nd-floor windows
        mortar: { y: 5.55 },
        glow: [0.7, 0.66, 0.46],
      },
    ],
  },

  no166: {
    number: 166,
    style: 'neoGrec',
    roof: { type: 'flat' },
    depth: 12.0,
    height: 12.0,
    // High basement, the parlor floor at the top of the stoop, two bedroom floors
    floors: [1.8, 3.7, 3.3, 3.2],
    grid: { type: 'even', count: 3, edge: 0.4 },
    wall: {
      ground: { tile: 'wall_stone', color: BROWNSTONE_DARK, texScale: 0.9 },
      upper: { tile: 'wall_stone', color: BROWNSTONE, texScale: 1.0 },
      trim: BROWNSTONE_TRIM,
      rustication: 0.3,
    },
    // Tin, painted to match the stone; narrow stepped brackets (not № 124's), no date
    cornice: { type: 'neoGrec', color: [0.3, 0.23, 0.19], bays: 3, brackets: 'stepped' },
    windows: {
      lintel: 'stepped',
      lights: '2/2',
      width: { max: 0.9, bay: 0.5 },
      // Only the right bay's 2nd floor and the top floor are on the wall: the bay and the stoop
      // take the rest
      rows: [null, null, { y: 6.05, h: 1.35 }, { y: 9.3, h: 1.27, w: 0.85 }],
    },
    // The canted bay over the two left bays, from the areaway to the 2nd floor: basement windows
    // behind grilles, tall parlor windows, a terrace on top before the 3rd floor
    bays: [
      {
        axes: [0, 1],
        at: 2.25,
        floors: [0, 1, 2],
        shape: 'canted',
        w: 3.5,
        depth: 0.9,
        y0: 0,
        y1: 8.55,
        rows: {
          0: {
            y: 0.45,
            h: 0.8,
            win: { glass: [0.1, 0.1, 0.11], guard: true, lights: null, lintel: 'flat' },
          },
          1: { y: 2.35, h: 1.8, win: { tile: 'win_parlor' } },
          2: { y: 6.05, h: 1.35 },
        },
        win: { w: 0.9 },
        balcony: { iron: true, h: 0.9 },
      },
    ],
    // One family: the same curtains everywhere
    flats: [
      { id: 'H', floor: 0, rooms: { 0: 'kitchen' }, dress: HOUSE, lit: ['kitchen'] },
      { id: 'H', floor: 1, rooms: { 0: 'parlor' }, dress: HOUSE, lit: ['parlor'] },
      { id: 'H', floor: 2, rooms: { 0: 'bedroom', 2: 'study' }, dress: HOUSE, lit: ['study'] },
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
        y0: 1.8,
        w: 1.05,
        h: 2.4,
        transom: 'rect',
        surround: 'neoGrec',
        numberOn: 'door',
        color: [0.15, 0.1, 0.08],
        trim: BROWNSTONE_TRIM,
        // Eight steps reaching 2.04 m – up to the tree line
        stoop: {
          w: 1.75,
          steps: 8,
          run: 0.22,
          landing: 0.5,
          rails: 'iron',
          newel: 'angular',
          color: BROWNSTONE_DARK,
        },
      },
    ],
    // The areaway round the foot of the bay, the cans standing out in front of it
    areaways: [{ span: [0.15, 4.12], depth: 1.55, bins: [1.0, 1.58], binX: 1.2 }],
  },
});
