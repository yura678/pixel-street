/**
 * Building specifications – every house on the street described as data.
 *
 * `StreetLayout` puts a spec id on a lot (`lot.spec = 'no114'`), `SpecPlanner` resolves the
 * spec on that lot into a concrete plan (axes, windows, flats, fire escapes, shopfronts, door
 * zones) and `Assembler` builds the plan from the shared architectural parts. The same plan
 * feeds `buildings.rules.test.js`, so the street rules are checked without rendering.
 *
 * One file per chunk (`chunkNN.js`), in the order the taxi drives.
 * Colours are linear RGB triplets; tiles are facade-atlas tile names.
 *
 * @typedef {{ tile: string, color: number[], texScale?: number }} Material
 *
 * @typedef {object} FlatSpec
 * @property {string} id                 e.g. `L2` (left wing, 2nd floor)
 * @property {number} floor              0 = ground floor
 * @property {Record<number, string>} [rooms]  axis index → room (`kitchen`, `living`, `bedroom`)
 * @property {[string, string]} [dress]  living-room window dressing `[type, fabric]`
 * @property {string[] | 'random'} [lit] rooms lit from golden hour on (`random`: hotel rooms)
 * @property {'shop'} [via]              reached through the shop below (owner's flat above
 *                                       their own shop), not from the street
 *
 * @typedef {object} FlankSpec           a side facade over the alley, a square or the front
 *                                       garden of a set-back neighbour; `at` is metres back
 *                                       from the street corner
 * @property {Array<{ at: number, floors: number[], w: number, h: number, sill: number,
 *   room: string, lintel?: string, lights?: string, guard?: boolean }>} [windows]  columns of
 *   openings; the room belongs to the flat at that end of the floor; any other window option
 *   (`tile`, `glass`…) dresses them as on the front
 * @property {{ span: [number, number], y: number, depth?: number, consoles?: number[] }}
 *   [ironBalcony]                       a French cast-iron balcony on the flank
 * @property {boolean} [belts]           the front's belt courses turn the corner along `wrap`
 *                                       too, and the crown and belts close the corner (a corner
 *                                       house's second front)
 * @property {{ at: number, halfW: number }} [escape]  fire escape (`egress.side: 'flank'`)
 * @property {Array<[number, number]>} [acUnder]   `[at, floor]` split-AC positions
 * @property {Array<[number, number]>} [flowerBoxes]  `[at, floor]` flower-box positions
 * @property {number} [wrap]             the front's ground facing and cornice turn the corner
 *                                       this far onto the flank
 * @property {object[]} [doors]          `{ at, …buildDoorway options }` (back doors)
 * @property {Array<{ kind: 'dish'|'lantern', at: number, y: number }>} [lamps]
 * @property {Array<{ at: number, y: number }>} [meters]
 * @property {number[]} [downpipes]
 * @property {boolean} [parapet]         a flat roof's parapet returns along the flank
 * @property {number} [flues]
 *
 * @typedef {object} BuildingSpec
 * @property {number} number             house number: even, 100 at Z 0 rising along the loop
 * @property {string} style              architectural type (neighbours differ in style or roof)
 * @property {string} [builder]          bespoke geometry builder; the fields below then only
 *                                       describe the house for the rules, not its geometry
 * @property {{ type: string }} roof     `flat` (`frontParapet`), `mansard` (`h, inset, cap, bands,
 *                                       cresting, units: { gap }` – ventilation units on top),
 *                                       `gable` (side-gabled: `h, tile, color, flue`),
 *                                       `parapet` (no cornice: `h, profile, date, frieze, kit`;
 *                                       `profile: 'gable'` – a low coped triangle `rise` high,
 *                                       `gableW` wide over the middle, `deco` – an Art Deco
 *                                       crown stepped up twice with three flutes),
 *                                       `steppedGable` (Dutch front gable, roof running back:
 *                                       `h, steps, tile, color, window, anchors: '1893'`),
 *                                       `neckGable` (Dutch neck gable: `neckW, shoulderH, neckH,
 *                                       pedH, tile, color, window`; the roof behind hides
 *                                       behind the shoulders),
 *                                       `queenAnne` (projecting front gable `h` high, `overhang`,
 *                                       `shingle: { tile, color }`, `trim`, `loggia`, the roof
 *                                       `tile, color` running back; `chimney: { side, back,
 *                                       inset, above, w, d }` on a party wall); with
 *                                       `dormers: { axes, at?, w, h, head, lights, cells:
 *                                       { [axis]: { w, h, head } } }`; `flag: { tile, h, back }`
 *                                       stands a flagpole on a flat roof; on a flat deck `fan:
 *                                       { at, back }` – a kitchen's mushroom extract fan, `flue:
 *                                       { at, back, rise }` – a kiln's steel flue, `bulkhead:
 *                                       { w, d, h }` – the stair carried up in a brick hut
 *                                       instead of a scuttle, `tank: { at, back, legs, r, h }`
 *                                       – a wooden water tank on a steel stand
 * @property {number} [setback=0]        facade distance behind the sidewalk line (m)
 * @property {number} depth              building depth (m)
 * @property {'next'} [extendsInto]      the house also covers the following lot
 * @property {number} height             top of the facade wall / cornice line (m)
 * @property {number} [roofTop]          highest solid point (parapet, ridge) – for party walls
 * @property {number[]} floors           storey heights, bottom → top
 * @property {object} [grid]             window axes: `{ type: 'stairCore', edge, stairW,
 *                                       perWing }` or `{ type: 'even', count, edge }`
 * @property {object} [wall]             `{ ground, upper: Material, trim, belts: Array<number |
 *                                       { y, gaps: [[from, to]…] }> – broken where a portal or a
 *                                       stair core rises through (metres from the left corner),
 *                                       cornerBoards: { w, y0, top } – a frame house's painted
 *                                       corner boards,
 *                                       quoins: { y0, top, corner, stairCore }, rustication,
 *                                       plinth: false, diamonds: { spots: [[at, y]…], size,
 *                                       color }, pilasters: { at, y0, y1, w, paired, capital,
 *                                       round } (or a list, one run per storey), frieze:
 *                                       { y0, h, inscription }, insets: [{ at, y, w, h }] –
 *                                       terracotta let into the brick, insetColor, groundH – the
 *                                       ground material runs up this high (past the ground storey) }`
 * @property {{ type: string, color?: number[], bays?: number, date?: number,
 *   sunburst?: boolean, brackets?: 'stepped'|'small' }} [cornice]  `none` for a parapet-crowned
 *                                       shop (or a gable front); `corbelTable` with a `date` gets a
 *                                       low dated gable, `tenement` a `sunburst` or the `date` in
 *                                       its middle panel (odd `bays`); `neoGrec` with `brackets: 'stepped'` – a rowhouse's
 *                                       narrow stepped brackets; `bracket` with `brackets: 'small'`
 *                                       – a close row of small ones
 * @property {object} [windows]          `{ lintel, lights, voussoirs (brick arch colour), tile,
 *                                       trimTile ('wood_paint': board casings of a frame house,
 *                                       `lintel: 'casing'`), width: { max, bay }, rows: [{ y, h, w?, pair? }] –
 *                                       `pair`: two lights per axis that far off it, floors:
 *                                       { [floor]: window options }, cells: { 'axis/floor':
 *                                       window options + its own `y, w, h`, `at` (metres from
 *                                       the left corner, off its axis); `hayloft: { color }` – a
 *                                       carriage house's hayloft door instead }, stair: { lift,
 *                                       width, h, tint, lintel – one head for all of them } }`
 * @property {{ span: [number, number], y: number, depth?: number, consoles?: number[] }}
 *   [ironBalcony]                       a French cast-iron balcony on a stone slab across several
 *                                       windows (metres from the left corner; `y` the slab's top)
 * @property {Array<{ axis?: number, axes?: number[], at?: number, floors: number[],
 *   shape: 'box'|'canted'|'round', w: number, depth: number, y0: number, y1: number,
 *   rows: Record<number, { y: number, h: number, win?: object }>, win?: object,
 *   balcony?: { color?: number[], back?: number, iron?: boolean, h?: number } }>} [bays]
 *                                       projecting bays (an oriel when `y0` is above the ground)
 *                                       in place of the windows of their axis – or `axes` – on
 *                                       their floors; `at` (metres from the left corner) places
 *                                       one off the axes; a row may dress its windows on its own
 *                                       (`win`); `iron` – a wrought-iron railing round the cap
 * @property {FlatSpec[]} flats
 * @property {number[]} [stairWindows]   floors with a half-landing window in the stair axis
 * @property {{ axis: number, floors: number[] }} [corridor]  end windows of a corridor running
 *                                       back from the front (a hotel): bare glass, always lit
 * @property {Array<[number, number]>} [acUnder]      `[axis, floor]` split-AC positions
 * @property {Array<[number, number]>} [flowerBoxes]  `[axis, floor]` flower-box positions
 * @property {{ side: 'front'|'rear'|'flank', escapes?: Array<[number, number]>, halfW?: number,
 *   landings: number[], drop?: 'left' }} [egress]  fire escapes as `[firstAxis, lastAxis]`; a
 *                                       `flank` one is placed by its flank (`flanks.*.escape`);
 *                                       `drop: 'left'` hangs the drop ladder at the left end
 * @property {{ flues?: number, ghost?: 'left'|'right', scar?: 'left'|'right' }} [partyWall]
 *                                       exposed party walls: flues, a faded advertisement, the
 *                                       trace of a gabled neighbour's older roof
 * @property {Record<'left'|'right', FlankSpec>} [flanks]  side facades over an open lot
 * @property {{ downpipes?: 'corners'|'left'|'right', ducts?: Array<{ at: number, y0: number }>
 *   }} [services]                       ducts: a laundromat's dryer duct up the front
 * @property {Array<{ span: [number, number], depth?: number, bins?: number[], binX?: number,
 *   hedge?: { h: number } }>} [areaways]  railed areaways before a basement (metres from the left
 *                                       corner); trash cans at `bins`, `binX` out from the wall; a
 *                                       box hedge along the railing
 * @property {{ tree?: number, mailbox?: number, shelf?: number, bamboo?: number }} [sidewalk]
 *                                       street tree in front, a mailbox at the curb, a potter's
 *                                       shelf of wares or a potted bamboo against the wall:
 *                                       metres from the left corner
 * @property {Array<{ kind: string, axis?: number|'stair', at?: number }>} entrances
 *   `house`, `stair` (the door to the flats), `shop`; `surround: 'aedicule'` – a Renaissance
 *   Revival portal (the arch between pilasters under an entablature, `numberOn: 'keystone'`,
 *   `lanterns` on its pilasters); a stoop's `base` raises its foot onto a front yard; `canopy:
 *   { reach, w, y, sign, color }` – a hotel's marquee from the door to the curb (`reach: 'curb'`:
 *   out to the curb, however wide the sidewalk); `numberOn:
 *   'panel'` (a terracotta tablet, `tablet_NNN`) or `'door'` (brass numerals, `numerals_NNN`);
 *   `deep` stands an arched surround out from the wall, `stained` (a tile) glazes the transom
 *   and fanlight in stained glass; a stoop's `newel: 'angular'` – heavy grooved stone newels;
 *   `surround: 'portico'` – a Greek Revival portico of two Doric columns on the stoop's landing
 *   (`porticoDepth`), the number in its frieze (`numberOn: 'entablature'`), a lantern under it
 * @property {Array<{ kind: string, sign?: string, axes?: [number, number], span?: [number,
 *   number], inset?: [number, number] }>} [shops]   a second front of the same shop has no sign;
 *   a café adds `terrace: { pairs }` and `menu: { at }`; `kind: 'arch'` is a Romanesque front
 *   under one wide arch (`span` the jambs' outer edges, `spring`); a storefront may hang a neon
 *   picture in its glass (`neonTile`); `kind: 'diner'` – a 1950s enamel-and-chrome front with
 *   its entrance lobby at the left end (`script`: the neon tile over the window, `blade`,
 *   `light`); `kind: 'carriage'` – a carriage arch `opening` wide centred `at` (`spring`,
 *   `rise`, `depth` of the opening, `open` – how far the left gate stands open, `signAt: [at,
 *   y]` – the tiled sign on the wall); a storefront's recessed door may have its lobby `cut`
 *   into the wall mass, `doors: 2` hangs a pair; a 1930s front: `frame: 'metal'`,
 *   `bulkheadColor` (granite), `glassDoor`, `sort: { y }` (a printer's type sort over the
 *   door); a druggist's `mortar: { y }`; `awningArms` – a folding awning's arms; a café's
 *   `bench` and service `hatch`, a news kiosk's `racks` under a narrow awning (`awningReach`);
 *   a bookshop's `cart` of books, a florist's `flowerStand` (`standPaint`) of buckets of cut
 *   flowers; `transomPanes` – small lights in the transom; a bakery's `sidelights` by the door
 *   and `signLamps` over the fascia, `deck` – the front stands on a raised terrace; `kind:
 *   'ramen'` – a Japanese front (`signTile`, `door: { at, color }`, `lanterns`: metres from the
 *   left corner)
 * @property {Array<{ kind: 'vertical'|'clock', tile?: string, at: number, y?: number,
 *   y0?: number, h?: number, w?: number, dusk?: boolean }>} [signs]  signs of the house itself:
 *                                       a vertical neon (`dusk`: lit with the street lamps),
 *                                       a clockmaker's bracket clock (`y` its centre)
 * @property {{ kind: string }} [site]    what fills the setback (front garden, terrace…)
 */
import { CHUNK_00 } from './chunk00.js';
import { CHUNK_01 } from './chunk01.js';
import { CHUNK_02 } from './chunk02.js';
import { CHUNK_03 } from './chunk03.js';
import { CHUNK_04 } from './chunk04.js';
import { CHUNK_05 } from './chunk05.js';
import { CHUNK_06 } from './chunk06.js';
import { CHUNK_07 } from './chunk07.js';
import { CHUNK_08 } from './chunk08.js';
import { CHUNK_09 } from './chunk09.js';
import { CHUNK_10 } from './chunk10.js';
import { CHUNK_11 } from './chunk11.js';

/** @type {Readonly<Record<string, BuildingSpec>>} */
export const BUILDINGS = Object.freeze({
  ...CHUNK_00,
  ...CHUNK_01,
  ...CHUNK_02,
  ...CHUNK_03,
  ...CHUNK_04,
  ...CHUNK_05,
  ...CHUNK_06,
  ...CHUNK_07,
  ...CHUNK_08,
  ...CHUNK_09,
  ...CHUNK_10,
  ...CHUNK_11,
});

/**
 * @param {string | null | undefined} id
 * @returns {BuildingSpec | null}
 */
export function getBuildingSpec(id) {
  return (id && BUILDINGS[id]) || null;
}
