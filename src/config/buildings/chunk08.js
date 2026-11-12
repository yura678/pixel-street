/**
 * Chunk 8 (Z 160–180 m) · «Town Hall Annex, Hotel Metropole & Parisian Bistro»
 *
 * № 144 – the town hall annex, Colonial Revival (1930s): built later in the town hall's spirit,
 * its dentil cornice level with the hall's, the belt over the ground floor continuing the hall's
 * line. Warm red brick with sandstone trim; the post office on the ground floor – double doors
 * under a fanlight and a broken pediment with an urn, two steps, tall 12/12 sashes under keystone
 * lintels either side, POST OFFICE cut into the stone frieze above (a public office, not a
 * shop: no sign board), the blue mailbox at the curb and the flag on the roof over the entrance.
 * The town hall's offices above: three 8/8 sashes with dark green shutters, warm and even
 * office light, only the duty window lit in the evening. A white wooden balustrade over the
 * cornice; no cupola (the hall has one), no flats, so no fire escape and no ACs.
 *
 * № 146 – Hotel Metropole, Second Empire (1870s, after Gilsey House): plain lower storeys of
 * pale dressed stone (the ground storey rusticated, quoins above), all the show gathered in the
 * mansard – bands of dark grey and greenish slate, three dormers (the middle one larger, under a
 * segmental head), iron cresting with finials, a cornice on paired brackets. The lobby: glazed
 * double doors under the one canopy of the street, METROPOLE on its end, reaching to the curb on
 * two brass posts; tall lobby windows with warm light either side; HOTEL in neon down the left
 * edge from the 2nd to the 4th floor. The house is narrow, so the corridor runs back from the
 * front: the middle windows are its end windows – bare glass, always lit – and the fire escape
 * climbs over them, reachable from every room; at the top a ladder past the cornice to the
 * landing before the big dormer and the gooseneck up the mansard. The rooms either side, all in
 * the same curtains, lit at random. Pediments on the 2nd floor, segmental hoods above. Central
 * ventilation: no window ACs, two units on the roof. Both neighbours are lower – blank party
 * walls with flues on both sides.
 *
 * № 148 – a Parisian bistro in a cast-iron front (1872): three storeys of iron painted a warm
 * stone colour, Corinthian half-columns between the bays on every floor, wide 2/2 windows with
 * segmental tops, a small frieze at sill level and an entablature at every floor line. The
 * BISTRO between the iron columns: dark burgundy woodwork, gilt letters on the fascia and VINS
 * on the glass, the door in the middle, the glazed menu case beside it, a plain dark red awning
 * with a scalloped edge; six wicker chairs in pairs facing the street, a little marble table in
 * front of each pair, all within 0.9 m of the glass. The door to the two flats is beyond the
 * last column on the right, «148» on its transom. Red geraniums in two boxes on the 2nd floor,
 * one AC, no fire escape. A light iron cornice with small brackets and a low pediment carrying
 * the date.
 */

const WARM_BRICK = [0.58, 0.26, 0.19];
// The town hall's sandstone trim (chunk 7), so the annex reads as part of the same complex
const SANDSTONE_TRIM = [0.84, 0.8, 0.7];
const SANDSTONE_STEP = [0.62, 0.6, 0.55];
const SHUTTER_GREEN = [0.1, 0.17, 0.13];

const HOTEL_STONE = [0.8, 0.77, 0.7];
const HOTEL_STONE_DARK = [0.74, 0.71, 0.64];
const HOTEL_TRIM = [0.88, 0.85, 0.78];
const SLATE_DARK = [0.3, 0.31, 0.34];
const SLATE_GREEN = [0.36, 0.43, 0.39];
const HOTEL_DRESS = Object.freeze(['curtain', 'olive']);
/** The hotel rooms either side of the corridor, floors 2–4 and the mansard. */
const HOTEL_ROOMS = [1, 2, 3, 4].flatMap((floor) => [
  { id: `R${floor}L`, floor, rooms: { 0: 'room' }, dress: HOTEL_DRESS, lit: 'random' },
  { id: `R${floor}R`, floor, rooms: { 2: 'room' }, dress: HOTEL_DRESS, lit: 'random' },
]);

const IRON_PAINT = [0.7, 0.65, 0.56];
const IRON_TRIM = [0.75, 0.7, 0.61];
const BISTRO_WOOD = [0.3, 0.09, 0.11];
const GERANIUM = [0.86, 0.14, 0.13];
/** Half-columns of the cast-iron front: one run per storey (metres from the left corner). */
const IRON_PIERS = [0.3, 2.267, 4.233, 6.2];

export const CHUNK_08 = Object.freeze({
  no144: {
    number: 144,
    style: 'colonialRevival',
    roof: { type: 'flat', frontParapet: false, flag: { tile: 'flag_town', h: 3.2, back: 1.4 } },
    depth: 9.0,
    height: 8.8,
    floors: [4.2, 4.6],
    grid: { type: 'even', count: 3, edge: 0.25 },
    wall: {
      ground: { tile: 'wall_brick', color: WARM_BRICK, texScale: 1.1 },
      upper: { tile: 'wall_brick', color: WARM_BRICK, texScale: 1.1 },
      trim: SANDSTONE_TRIM,
      // The town hall's belt line, and the fillet over the inscribed frieze
      belts: [4.2, 5.0],
      frieze: { y0: 4.38, h: 0.62, inscription: 'inscription_post_office' },
    },
    cornice: { type: 'colonial' },
    windows: {
      lintel: 'flat',
      lights: '8/8',
      width: { max: 1.0, bay: 0.5 },
      rows: [
        { y: 0.95, h: 2.45, w: 0.95 },
        // Narrow enough for the shutters of neighbouring windows to fold back clear of each other
        { y: 5.6, h: 1.75, w: 0.8 },
      ],
      floors: {
        0: { lintel: 'keystone', lights: '12/12' },
        1: { shutters: SHUTTER_GREEN },
      },
    },
    // No flats: the post office below, the town hall's offices above
    flats: [
      {
        id: 'POST',
        floor: 0,
        rooms: { 0: 'post', 2: 'post' },
        dress: ['blind', 'cream'],
        lit: ['post'],
      },
      {
        id: 'ANNEX',
        floor: 1,
        rooms: { 0: 'office', 1: 'duty', 2: 'office' },
        dress: ['sheer', 'linen'],
        lit: ['duty'],
      },
    ],
    services: { downpipes: 'right' },
    sidewalk: { mailbox: 0.9 },
    entrances: [
      {
        kind: 'house',
        axis: 1,
        y0: 0.32,
        w: 1.3,
        h: 2.2,
        leaves: 2,
        transom: 'fan',
        surround: 'portal',
        pediment: 'broken',
        numberOn: 'entablature',
        color: [0.1, 0.16, 0.13],
        trim: SANDSTONE_TRIM,
        stoop: { w: 2.1, steps: 2, rails: 'none', color: SANDSTONE_STEP },
      },
    ],
  },

  no146: {
    number: 146,
    style: 'secondEmpire',
    roof: {
      type: 'mansard',
      h: 3.0,
      inset: 0.6,
      cap: 0.6,
      cresting: true,
      // Bands of dark grey and greenish slate (not the fish scales of № 120)
      bands: [
        { from: 0, to: 0.28, tile: 'slate_rect', color: SLATE_DARK },
        { from: 0.28, to: 0.4, tile: 'slate_rect', color: SLATE_GREEN },
        { from: 0.4, to: 0.72, tile: 'slate_rect', color: SLATE_DARK },
        { from: 0.72, to: 0.84, tile: 'slate_rect', color: SLATE_GREEN },
        { from: 0.84, to: 1, tile: 'slate_rect', color: SLATE_DARK },
      ],
      dormers: {
        axes: [0, 1, 2],
        w: 1.0,
        h: 1.85,
        sill: 0.3,
        head: 'pediment',
        lights: '1/1',
        // The middle one, before the top landing of the fire escape, larger under a segmental head
        cells: { 1: { w: 1.24, h: 2.05, head: 'segmental' } },
      },
      units: { gap: 1.7 },
    },
    depth: 12.0,
    height: 14.7,
    floors: [4.9, 3.3, 3.2, 3.3, 3.0],
    grid: { type: 'even', count: 3, edge: 0.45 },
    wall: {
      ground: { tile: 'wall_stone', color: HOTEL_STONE_DARK, texScale: 0.9 },
      upper: { tile: 'wall_stone', color: HOTEL_STONE, texScale: 1.0 },
      trim: HOTEL_TRIM,
      belts: [4.78],
      rustication: 0.45,
      quoins: { y0: 4.96, top: 13.75, corner: 0.42 },
    },
    cornice: { type: 'paired', color: [0.78, 0.75, 0.68] },
    windows: {
      lintel: 'segmental',
      lights: '1/1',
      width: { max: 1.0, bay: 0.5 },
      rows: [
        { y: 0.75, h: 2.85 },
        { y: 5.5, h: 1.8 },
        { y: 8.75, h: 1.7 },
        { y: 11.95, h: 1.35 },
      ],
      // Pediments on the 2nd floor, segmental hoods on consoles above
      floors: { 1: { lintel: 'pediment' }, 2: { consoles: true }, 3: { consoles: true } },
    },
    // The corridor runs back from the middle bay: its end windows, up to the big dormer
    corridor: { axis: 1, floors: [1, 2, 3, 4] },
    flats: [
      {
        id: 'LOBBY',
        floor: 0,
        rooms: { 0: 'lobby', 2: 'lobby' },
        dress: ['sheer', 'cream'],
        lit: ['lobby'],
      },
      ...HOTEL_ROOMS,
    ],
    // Over the corridor windows, wider than the bay so every landing reaches the rooms beside;
    // the top landing stands on the cornice before the big dormer
    egress: {
      side: 'front',
      escapes: [[1, 1]],
      halfW: 1.15,
      landings: [4.95, 8.25, 11.45, 14.75],
    },
    partyWall: { flues: 2 },
    services: { downpipes: 'right' },
    // HOTEL in neon down the left edge, from the 2nd to the 4th floor
    signs: [{ kind: 'vertical', tile: 'vsign_hotel', at: 0.3, y0: 5.4, h: 6.3, w: 0.9 }],
    entrances: [
      {
        kind: 'house',
        axis: 1,
        w: 1.6,
        h: 2.35,
        leaves: 2,
        glazed: true,
        transom: 'rect',
        color: [0.08, 0.14, 0.11],
        trim: HOTEL_TRIM,
        canopy: {
          reach: 'curb',
          w: 2.16,
          y: 3.05,
          sign: 'canopy_metropole',
          color: [0.12, 0.23, 0.17],
        },
      },
    ],
  },

  no148: {
    number: 148,
    style: 'castIron',
    roof: { type: 'flat' },
    depth: 10.0,
    height: 11.3,
    floors: [4.2, 3.6, 3.5],
    grid: { type: 'even', count: 3, edge: 0.3 },
    wall: {
      ground: { tile: 'wall_stone', color: IRON_PAINT, texScale: 1.2 },
      upper: { tile: 'wall_stone', color: IRON_PAINT, texScale: 1.2 },
      trim: IRON_TRIM,
      // An entablature at every floor line, a small frieze under the sills of each storey
      belts: [4.05, 4.45, 7.62, 7.95],
      pilasters: [
        // Ground floor: the iron storefront spans two bays, the last column before the flats' door
        { at: [0.3, 4.233, 6.2], y0: 0, y1: 4.05, w: 0.26, round: true, capital: 'corinthian' },
        { at: IRON_PIERS, y0: 4.63, y1: 7.62, w: 0.24, round: true, capital: 'corinthian' },
        { at: IRON_PIERS, y0: 8.13, y1: 10.8, w: 0.24, round: true, capital: 'corinthian' },
      ],
    },
    cornice: { type: 'castIron', color: [0.68, 0.63, 0.55], date: 1872 },
    windows: {
      lintel: 'segmental',
      lights: '2/2',
      width: { max: 1.4, bay: 0.72 },
      rows: [null, { y: 4.85, h: 2.0 }, { y: 8.35, h: 1.85 }],
      floors: { 1: { blooms: GERANIUM } },
    },
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
        rooms: { 0: 'bedroom', 1: 'living', 2: 'living' },
        dress: ['sheer', 'linen'],
        lit: ['bedroom'],
      },
    ],
    acUnder: [[0, 2]],
    entrances: [
      { kind: 'shop' },
      {
        kind: 'stair',
        axis: 2,
        w: 0.95,
        h: 2.45,
        transom: 'rect',
        color: [0.2, 0.08, 0.09],
      },
    ],
    shops: [
      {
        kind: 'storefront',
        sign: 'BISTRO',
        axes: [0, 1],
        inset: [0.18, 0.18],
        door: 'center',
        paint: BISTRO_WOOD,
        awning: [0.42, 0.06, 0.07],
        awningTile: 'white',
        scallop: true,
        glassSign: 'VINS',
        menu: { at: 1.55 },
        // Pairs of chairs (their middles, metres from the left corner) clear of both doors
        terrace: { pairs: [0.92, 3.3, 4.18] },
      },
    ],
  },
});
