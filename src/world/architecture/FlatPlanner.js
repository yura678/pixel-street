/**
 * FlatPlanner – who lives behind every window. Pure data, no three.js.
 *
 * A facade is a grid of axes × floors. Each flat owns a row of cells on one floor and every
 * cell of a flat is a room (kitchen, living room, bedroom…). For each cell the plan resolves
 * whether there is a window at all (shops and the entrance have their own fronts), which room
 * it lights, how the window is dressed (sheer, curtain, blind or stair glass), whether the
 * room is lit at golden hour, and its extras: a flower box or a split-AC condenser under the
 * sill – both suppressed where a fire escape landing covers the window.
 */

/** Kitchens always get a linen roller blind, whatever the flat's curtains are. */
const KITCHEN_DRESS = Object.freeze(['blind', 'linen']);

/**
 * @typedef {object} FlatSpec
 * @property {string} id         e.g. `L2` (left wing, 2nd floor)
 * @property {number} floor      0 = ground floor
 * @property {Record<number, string>} rooms  axis index → room (`kitchen`, `living`, `bedroom`…)
 * @property {[string, string]} dress  window dressing `[type, fabric]` of the living rooms
 * @property {string[] | 'random'} lit  rooms lit from golden hour on; `random` leaves every
 *   window to chance (hotel rooms)
 */

/**
 * @typedef {{ type: 'none' }
 *   | { type: 'stair' }
 *   | { type: 'corridor' }
 *   | { type: 'room', flat: string, room: string, glazing: string, fabric: string,
 *       lit: boolean | null, flowers: boolean, acBelow: boolean }} Cell
 */

export class FlatPlan {
  /** @type {Map<string, { flat: FlatSpec, room: string }>} */
  #cells = new Map();
  /** @type {Set<string>} */
  #stair;
  /** @type {Set<string>} */
  #corridor;
  /** @type {Set<string>} */
  #ac;
  /** @type {Set<string>} */
  #flowers;

  /**
   * @param {object} o
   * @param {FlatSpec[]} o.flats
   * @param {{ axis: number, floors: number[] }} [o.stair] stair-core windows
   * @param {{ axis: number, floors: number[] }} [o.corridor] end windows of a corridor running
   *   back from the facade (a hotel): bare glass, always lit
   * @param {Array<[number, number]>} [o.escapes] fire escapes as `[firstAxis, lastAxis]`;
   *   their landings cover these axes on every upper floor
   * @param {Array<[number, number]>} [o.acUnder] `[axis, floor]` of windows with a split AC
   * @param {Array<[number, number]>} [o.flowerBoxes] `[axis, floor]` of windows with a flower box
   */
  constructor({
    flats,
    stair = null,
    corridor = null,
    escapes = [],
    acUnder = [],
    flowerBoxes = [],
  }) {
    this.flats = flats;
    this.escapes = escapes;
    for (const flat of flats) {
      for (const [ax, room] of Object.entries(flat.rooms)) {
        this.#cells.set(`${ax},${flat.floor}`, { flat, room });
      }
    }
    this.#stair = new Set(stair ? stair.floors.map((f) => `${stair.axis},${f}`) : []);
    this.#corridor = new Set(corridor ? corridor.floors.map((f) => `${corridor.axis},${f}`) : []);
    this.#ac = new Set(acUnder.map(([a, f]) => `${a},${f}`));
    this.#flowers = new Set(flowerBoxes.map(([a, f]) => `${a},${f}`));
  }

  /** True when a fire-escape landing runs in front of this window. */
  underEscape(ax, floor) {
    return floor > 0 && this.escapes.some(([a, c]) => ax >= a && ax <= c);
  }

  /**
   * A room lit from a flank window. It belongs to the flat at that end of the floor – the one
   * whose front room is on `endAxis` – and is dressed like its rooms (kitchens and bathrooms
   * take the linen blind). With no flat on that floor (a shop) the window is plain and unlit.
   *
   * @param {number} floor
   * @param {number} endAxis front axis at the flank's end of the facade
   * @param {string} room
   * @param {{ acBelow?: boolean }} [extras]
   * @returns {Cell}
   */
  flankCell(floor, endAxis, room, { acBelow = false } = {}) {
    const end = this.#cells.get(`${endAxis},${floor}`);
    if (!end) {
      return {
        type: 'room',
        flat: null,
        room,
        glazing: 'plain',
        fabric: 'linen',
        lit: false,
        flowers: false,
        acBelow: false,
      };
    }
    const flat = end.flat;
    const dress = room === 'kitchen' || room === 'bath' ? KITCHEN_DRESS : flat.dress;
    return {
      type: 'room',
      flat: flat.id,
      room,
      glazing: dress[0],
      fabric: dress[1],
      lit: litOf(flat, room),
      flowers: false,
      acBelow,
    };
  }

  /**
   * @param {number} ax
   * @param {number} floor
   * @returns {Cell}
   */
  cell(ax, floor) {
    const key = `${ax},${floor}`;
    if (this.#stair.has(key)) return { type: 'stair' };
    if (this.#corridor.has(key)) return { type: 'corridor' };
    const c = this.#cells.get(key);
    if (!c) return { type: 'none' };
    const dress = c.room === 'kitchen' ? KITCHEN_DRESS : c.flat.dress;
    const free = !this.underEscape(ax, floor);
    return {
      type: 'room',
      flat: c.flat.id,
      room: c.room,
      glazing: dress[0],
      fabric: dress[1],
      lit: litOf(c.flat, c.room),
      flowers: free && this.#flowers.has(key),
      acBelow: free && this.#ac.has(key),
    };
  }
}

/** Whether a room is lit from golden hour on; null leaves it to chance (`lit: 'random'`). */
function litOf(flat, room) {
  return flat.lit === 'random' ? null : flat.lit.includes(room);
}
