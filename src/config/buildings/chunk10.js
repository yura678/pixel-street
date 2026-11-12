/**
 * Chunk 10 (Z 200–220 m) · «Burger Bar, Ceramics Studio & Townhouse»
 *
 * № 156 – Italianate, four storeys of red brick with brownstone trim, 2/2 sashes under
 * segmental heads (heavy hoods on consoles over the 2nd floor), a wooden cornice on paired
 * brackets painted dark green. Its ground floor is the street's one modern layer: a burger bar
 * remodelled in the 1950s – cream porcelain-enamel panels with red bands, chrome edging, one long
 * window lit from inside whose glass turns a rounded corner into the recessed entrance lobby,
 * "Burgers" in script neon over the window and a burger on a round blade sign. The old wooden
 * door to the three flats stays on the right with «156» on its transom. One AC; the fire escape
 * is at the back (№ 154 next door has one on its front), the kitchen's extract duct runs up the
 * back too – the street only sees its mushroom on the roof.
 *
 * № 158 – a former carriage house, now a potter's studio: two storeys of plain dark-brown
 * brick, a wide segmental arch with a pair of dark green boarded gates – the left one standing
 * half open on the warmly lit workshop – and a glazed fanlight over them, CERAMICS in glazed
 * tiles over the arch, a small window with iron shutters either side. Upstairs the old hayloft
 * door (glazed now) under its hoist beam and pulley, a window either side: the potter lives above
 * the studio as the coachman once did, reached through it. A low coped triangle over the middle
 * of the parapet, the kiln's steel flue above the roof, the potter's wares on a shelf on the
 * sidewalk. No AC. Both neighbours tower over it.
 *
 * № 160 – Queen Anne, one family: warm orange-red brick with square terracotta panels between
 * the storeys, a round oriel on a stone corbel over the 2nd and 3rd floors on the left (three
 * narrow windows a floor, a balcony on its cap before the loggia of the gable), the wide
 * living-room window on the ground floor – coloured border lights in the upper sash, one plate
 * below, a flower box – the door on the right at the back of a deep arch over five steps, its
 * transom and fanlight in stained glass. The front gable projects over the wall, hung with
 * grey-green fish-scale shingles, a loggia with balusters in it; the slate roof runs back behind
 * it and a tall chimney with a terracotta crown stands on the right party wall over the low
 * № 162. No ACs, no fire escape.
 */

const ITALIANATE_BRICK = [0.5, 0.2, 0.14];
const BROWNSTONE = [0.42, 0.29, 0.23];
const CORNICE_GREEN = [0.1, 0.2, 0.14];

const CARRIAGE_BRICK = [0.34, 0.2, 0.15];
const CARRIAGE_STONE = [0.6, 0.56, 0.5];
const GATE_GREEN = [0.1, 0.22, 0.15];
const IRON_SHUTTER = [0.2, 0.22, 0.22];

const QA_BRICK = [0.7, 0.35, 0.21];
const QA_TRIM = [0.58, 0.43, 0.33];
const QA_PAINT = [0.9, 0.88, 0.8];
const QA_DRESS = Object.freeze(['curtain', 'rose']);

export const CHUNK_10 = Object.freeze({
  no156: {
    number: 156,
    style: 'italianate',
    // The kitchen's mushroom extract fan near the back, over the right bay
    roof: { type: 'flat', fan: { at: 5.5, back: 1.6 } },
    depth: 13.0,
    height: 14.0,
    floors: [4.2, 3.3, 3.25, 3.25],
    grid: { type: 'even', count: 3, edge: 0.4 },
    wall: {
      ground: { tile: 'wall_brick', color: ITALIANATE_BRICK, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: ITALIANATE_BRICK, texScale: 1.1 },
      trim: BROWNSTONE,
      belts: [4.06],
      // The enamel front runs down to the sidewalk
      plinth: false,
    },
    // Wooden, on paired brackets, painted dark green
    cornice: { type: 'paired', color: CORNICE_GREEN },
    windows: {
      lintel: 'segmental',
      lights: '2/2',
      width: { max: 1.0, bay: 0.5 },
      rows: [null, { y: 4.95, h: 1.5 }, { y: 8.2, h: 1.45 }, { y: 11.35, h: 1.3 }],
      floors: { 1: { consoles: true } },
    },
    flats: [
      {
        id: 'F2',
        floor: 1,
        rooms: { 0: 'kitchen', 1: 'living', 2: 'bedroom' },
        dress: ['curtain', 'wine'],
        lit: ['living'],
      },
      {
        id: 'F3',
        floor: 2,
        rooms: { 0: 'living', 1: 'living', 2: 'bedroom' },
        dress: ['sheer', 'cream'],
        lit: ['bedroom'],
      },
      {
        id: 'F4',
        floor: 3,
        rooms: { 0: 'bedroom', 1: 'living', 2: 'kitchen' },
        dress: ['blind', 'teal'],
        lit: ['living', 'kitchen'],
      },
    ],
    // One AC: the middle flat's bedroom, over the flats' door
    acUnder: [[2, 2]],
    // № 154 next door has a fire escape on its front: this one is at the back
    egress: { side: 'rear', escapes: [[0, 1]], landings: [4.35, 7.65, 10.9] },
    partyWall: { flues: 1 },
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 2,
        y0: 0.17,
        w: 0.95,
        h: 2.3,
        transom: 'rect',
        // The old varnished wooden door, «156» on its transom
        stain: true,
        color: [0.42, 0.28, 0.17],
        intercom: true,
        stoop: { w: 1.3, steps: 1, rails: 'none' },
      },
    ],
    // The 1950s front: the lobby at its left end, the script neon over the window, the burger
    // blade over the pier
    shops: [
      {
        kind: 'diner',
        sign: 'BURGERS',
        span: [0.12, 4.55],
        script: 'neon_burgers',
        blade: { tile: 'blade_burger', r: 0.42 },
        light: [0.56, 0.4, 0.25],
        glow: [0.84, 0.6, 0.34],
      },
    ],
  },

  no158: {
    number: 158,
    style: 'carriageHouse',
    // Flat roof behind a parapet with a low coped triangle over the middle; the kiln's flue
    roof: {
      type: 'parapet',
      h: 0.75,
      profile: 'gable',
      rise: 0.85,
      gableW: 3.4,
      coping: CARRIAGE_STONE,
      flue: { at: 5.4, back: 6.0, rise: 2.4 },
    },
    depth: 10.0,
    height: 7.6,
    floors: [4.3, 3.3],
    grid: { type: 'even', count: 3, edge: 0.15 },
    wall: {
      ground: { tile: 'wall_brick', color: CARRIAGE_BRICK, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: CARRIAGE_BRICK, texScale: 1.1 },
      trim: CARRIAGE_STONE,
      // The floor line and a band under the parapet
      belts: [4.3, 7.22],
    },
    cornice: { type: 'none' },
    windows: {
      lintel: 'segmental',
      lights: '2/2',
      width: { max: 0.7, bay: 0.4 },
      rows: [
        { y: 1.15, h: 1.05 },
        { y: 5.1, h: 1.05 },
      ],
      floors: { 0: { shutters: IRON_SHUTTER } },
      // The hayloft door in the middle of the upper floor, glazed for the flat
      cells: { '1/1': { y: 4.8, w: 1.2, h: 1.8, lintel: 'flat', hayloft: { color: GATE_GREEN } } },
    },
    // The studio below and the potter's flat above are one household, reached through the gates
    flats: [
      {
        id: 'H',
        floor: 0,
        rooms: { 0: 'studio', 2: 'studio' },
        dress: ['plain', 'linen'],
        lit: ['studio'],
        via: 'shop',
      },
      {
        id: 'H',
        floor: 1,
        rooms: { 0: 'bedroom', 1: 'living', 2: 'kitchen' },
        dress: ['curtain', 'olive'],
        lit: ['living'],
        via: 'shop',
      },
    ],
    entrances: [{ kind: 'shop' }],
    shops: [
      {
        kind: 'carriage',
        sign: 'CERAMICS',
        at: 3.5,
        opening: 2.9,
        spring: 2.7,
        rise: 0.6,
        depth: 1.6,
        color: GATE_GREEN,
        open: 0.95,
        // The tiled sign over the arch, between its keystone and the floor line
        signAt: [3.5, 3.88],
        signH: 0.35,
      },
    ],
    sidewalk: { shelf: 0.42 },
  },

  no160: {
    number: 160,
    style: 'queenAnne',
    roof: {
      type: 'queenAnne',
      h: 4.2,
      overhang: 0.3,
      shingle: { tile: 'slate_fishscale', color: [0.5, 0.6, 0.52] },
      trim: QA_PAINT,
      tile: 'slate_rect',
      color: [0.22, 0.23, 0.26],
      loggia: true,
      // On the right party wall, over the one-storey № 162
      chimney: { side: 'right', back: 3.2, inset: 0.36, above: 0.5, w: 0.62, d: 1.0 },
    },
    depth: 12.0,
    height: 10.4,
    floors: [4.2, 3.2, 3.0],
    grid: { type: 'even', count: 2, edge: 0.6 },
    wall: {
      ground: { tile: 'wall_brick', color: QA_BRICK, texScale: 1.0 },
      upper: { tile: 'wall_brick', color: QA_BRICK, texScale: 1.0 },
      trim: QA_TRIM,
      // Square terracotta panels between the storeys beside the oriel
      insets: [
        { at: 3.6, y: 4.42, w: 0.36, h: 0.36 },
        { at: 4.2, y: 4.42, w: 0.36, h: 0.36 },
        { at: 4.8, y: 4.42, w: 0.36, h: 0.36 },
        { at: 3.6, y: 7.06, w: 0.36, h: 0.36 },
        { at: 4.2, y: 7.06, w: 0.36, h: 0.36 },
        { at: 4.8, y: 7.06, w: 0.36, h: 0.36 },
      ],
      insetColor: [0.82, 0.5, 0.34],
    },
    cornice: { type: 'none' },
    windows: {
      lintel: 'flat',
      lights: 'qa',
      width: { max: 0.95, bay: 0.5 },
      rows: [
        { y: 1.35, h: 1.6, w: 1.6 },
        { y: 5.0, h: 1.55 },
        { y: 8.0, h: 1.45 },
      ],
      // The living-room window: coloured border lights above, one plate below (`win_qa`)
      cells: { '0/0': { tile: 'win_qa', lights: null } },
    },
    // The round oriel on its corbel, three narrow windows a floor, a balcony on its cap
    bays: [
      {
        axis: 0,
        floors: [1, 2],
        shape: 'round',
        w: 3.2,
        depth: 1.2,
        y0: 4.4,
        y1: 10.2,
        rows: { 1: { y: 5.05, h: 1.2 }, 2: { y: 8.05, h: 1.2 } },
        win: { w: 0.6, tile: 'win_parlor', lights: null },
        balcony: { color: QA_PAINT, back: 0.36 },
      },
    ],
    // One family: the same curtains everywhere
    flats: [
      { id: 'H', floor: 0, rooms: { 0: 'parlor' }, dress: QA_DRESS, lit: ['parlor'] },
      { id: 'H', floor: 1, rooms: { 0: 'bedroom', 1: 'bedroom' }, dress: QA_DRESS, lit: [] },
      { id: 'H', floor: 2, rooms: { 0: 'study', 1: 'bedroom' }, dress: QA_DRESS, lit: ['study'] },
    ],
    entrances: [
      {
        kind: 'house',
        axis: 1,
        y0: 0.85,
        w: 0.95,
        h: 2.1,
        transom: 'rect',
        surround: 'arch',
        deep: 0.3,
        stained: 'glass_stained',
        numberOn: 'keystone',
        lamp: true,
        color: [0.3, 0.1, 0.08],
        trim: QA_TRIM,
        stoop: { w: 1.7, steps: 5, rails: 'iron', color: [0.55, 0.5, 0.45] },
      },
    ],
  },
});
