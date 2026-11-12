/**
 * SpecPlanner – resolves a `BuildingSpec` on its lot into a concrete plan. Pure data, no
 * three.js: the `Assembler` builds geometry from the plan, and the street rules
 * (`buildings.rules.test.js`) check the very same plan without rendering.
 *
 * Lot-local frame: facade faces −X at `x = setback`, Z runs along the street with the lot
 * centre at 0, Y is up from the sidewalk.
 */
import { getBuildingSpec } from '../../config/buildings/index.js';
import { LotType } from '../../simulation/street/StreetLayout.js';
import { stairCoreAxes } from './Facade.js';
import { FlatPlan } from './FlatPlanner.js';

/** A flat roof's rear parapet + coping rises this far above the cornice line. */
const FLAT_ROOF_TOP = 0.68;
/** Entrances further back than this do not block the sidewalk. */
const SIDEWALK_REACH = 1.0;
/** A belt course is this tall (`Facade.buildBeltCourse`). */
const BELT_H = 0.18;

/** Height of a belt course given as a number or as `{ y, gaps }`. */
export function beltY(belt) {
  return typeof belt === 'number' ? belt : belt.y;
}

/**
 * Runs of a belt course between `zA` and `zB`: the whole front, or broken where `gaps` (metres
 * from the left corner) let something rise through it – an entrance portal, a stair core.
 * @returns {Array<{ y0: number, y1: number, z0: number, z1: number }>}
 */
function beltRuns(belt, zA, zB) {
  const y0 = beltY(belt);
  const gaps = (belt.gaps ?? []).map(([a, c]) => [zA + a, zA + c]).sort((p, q) => p[0] - q[0]);
  const runs = [];
  let z = zA;
  for (const [g0, g1] of gaps) {
    if (g0 > z) runs.push({ y0, y1: y0 + BELT_H, z0: z, z1: g0 });
    z = Math.max(z, g1);
  }
  if (zB > z) runs.push({ y0, y1: y0 + BELT_H, z0: z, z1: zB });
  return runs;
}
/** How far each crown reaches down the facade from the cornice line. */
const CROWN_DEPTH = Object.freeze({
  bracket: 0.95,
  simple: 0.5,
  neoGrec: 0.95,
  balustrade: 0.65,
  corbelTable: 0.75,
  castIron: 0.55,
  tenement: 1.32,
  italianate: 1.24,
  colonial: 0.5,
  paired: 0.95,
});
/** The roof behind a stepped gable rises this share of the gable (`Gables.buildSteppedGable`). */
const STEPPED_ROOF_PITCH = 0.86;
/** Coping on the top tread of a stepped gable. */
const STEPPED_COPING = 0.08;
/** The gooseneck of a fire escape lands this far in from the wall it climbs. */
const GOOSENECK_IN = 0.75;
/** A neighbour this much lower leaves the party wall exposed. */
const PARTY_WALL_STEP = 0.5;
/**
 * Entrance lobby of a 1950s front (`Storefront.buildDinerFront`), cut into the ground storey at
 * the door's end: the enamel pier before it, its width at the door, the radius of the rounded
 * glass on its far side, its depth and the window head (its ceiling).
 */
const DINER = Object.freeze({ pier: 0.42, lobby: 1.2, curve: 0.5, depth: 1.0, head: 2.95 });
/** A carriage arch's voussoirs and imposts reach this far past the opening (`Carriage.js`). */
const CARRIAGE_RING = 0.36;
/**
 * Door of a small shopfront (`Storefront.buildStorefront`): one leaf or a pair, the gap to the
 * lobby's side glass and the lobby's depth when the door is recessed.
 */
export const SHOP_DOOR = Object.freeze({ single: 0.95, double: 1.5, side: 0.06, lobby: 0.55 });
/** A café's service hatch opens this deep into the ground storey (`Storefront.buildStorefront`). */
export const HATCH_DEPTH = 0.32;

/**
 * Window axes of the facade.
 * @returns {{ axes: number[], stair: number, bayW: number, zC: number }}
 */
function resolveGrid(grid, zA, zB) {
  if (grid.type === 'stairCore') {
    return stairCoreAxes(zA, zB, grid.edge, grid.stairW, grid.perWing);
  }
  if (grid.type === 'even') {
    const bayW = (zB - zA - grid.edge * 2) / grid.count;
    const axes = [];
    for (let i = 0; i < grid.count; i++) axes.push(zA + grid.edge + (i + 0.5) * bayW);
    return { axes, stair: -1, bayW, zC: (zA + zB) * 0.5 };
  }
  throw new Error(`Unknown facade grid type "${grid.type}"`);
}

/** The `FlatPlan` of a spec (stair windows need the resolved stair axis). */
export function flatPlanOf(spec, stairAxis = -1) {
  return new FlatPlan({
    flats: spec.flats.filter((f) => f.rooms),
    stair:
      spec.stairWindows && stairAxis >= 0 ? { axis: stairAxis, floors: spec.stairWindows } : null,
    corridor: spec.corridor ?? null,
    // Only escapes on the street front run past windows (rear ones are on the back wall)
    escapes: spec.egress?.side === 'front' ? spec.egress.escapes : [],
    acUnder: spec.acUnder ?? [],
    flowerBoxes: spec.flowerBoxes ?? [],
  });
}

/** Number of dwellings: flat entries sharing an `id` are one dwelling over several floors. */
export function dwellingsOf(spec) {
  return new Set(spec.flats.map((f) => f.id)).size;
}

/** Raised centre of a `stepped` taxpayer parapet and the coping on top (`Roofs.buildParapet`). */
const PARAPET_STEP = 0.45;
const PARAPET_COPING = 0.08;
/** Top tier of an Art Deco (`deco`) parapet over the parapet line. */
const DECO_RISE = 0.7;
/** The cornice under a neck gable's pediment (`Gables.buildNeckGable`). */
const NECK_CORNICE = 0.1;

/** Highest solid point of a spec house (parapet coping, mansard roof, ridge). */
function topOf(spec) {
  if (spec.roofTop !== undefined) return spec.roofTop;
  const roof = spec.roof;
  if (roof.type === 'flat') return spec.height + FLAT_ROOF_TOP;
  if (roof.type === 'mansard') return spec.height + (roof.h ?? 2.6) + (roof.cap ?? 0.5);
  if (roof.type === 'gable') return spec.height + roof.h;
  if (roof.type === 'steppedGable') return spec.height + roof.h + STEPPED_COPING;
  // Attic storey with its coping and balustrade (the cupola stands back, it is not a wall)
  if (roof.type === 'attic')
    return spec.height + roof.h + (roof.balustrade === false ? 0.08 : 0.71);
  if (roof.type === 'parapet') {
    // A `gable` profile raises a low triangle over the middle, its rake coping on top
    const raised =
      roof.profile === 'stepped'
        ? PARAPET_STEP
        : roof.profile === 'gable'
          ? (roof.rise ?? 0.8) + 0.07
          : roof.profile === 'deco'
            ? DECO_RISE
            : 0;
    return spec.height + roof.h + raised + PARAPET_COPING;
  }
  // Queen Anne: the apex of the front gable
  if (roof.type === 'queenAnne') return spec.height + roof.h;
  // Neck gable: the neck, the cornice of its pediment and the pediment (`Gables.buildNeckGable`)
  if (roof.type === 'neckGable') {
    return spec.height + roof.shoulderH + roof.neckH + NECK_CORNICE + (roof.pedH ?? 0.6);
  }
  return spec.height;
}

/**
 * Height a neighbour lot stands to – its party wall rises above anything lower. Open lots
 * (alley, park, a bus stop with a backdrop) stand to 0. Every other lot carries a house spec.
 * @returns {number | null} null when there is no lot
 */
export function lotTop(lot) {
  if (!lot) return null;
  const spec = getBuildingSpec(lot.spec);
  if (spec) return topOf(spec);
  if (lot.type === LotType.ALLEY || lot.type === LotType.PARK) return 0;
  if (lot.type === LotType.BUS_STOP && lot.backdrop) return 0;
  throw new Error(`Lot ${lot.id} (${lot.type}) has no building spec`);
}

/**
 * Where a lower neighbour's roof meets the party wall, when that is not simply its top: the
 * slopes of a side-gabled roof (`{ x0, x1, eave, ridge }`, eaves overhang the walls) or the deck
 * line behind a taxpayer's front parapet (`{ y }`). Null: the flashing runs at `lotTop`.
 */
export function lotRoofLine(lot) {
  const spec = getBuildingSpec(lot?.spec);
  if (!spec || spec.builder) return null;
  const x = spec.setback ?? 0;
  if (spec.roof.type === 'gable') {
    return { x0: x - 0.2, x1: x + spec.depth + 0.2, eave: spec.height, ridge: topOf(spec) };
  }
  if (spec.roof.type === 'parapet') return { y: spec.height + FLAT_ROOF_TOP };
  // A front-gabled roof runs back from the street: it meets the party wall at its eave
  if (['steppedGable', 'queenAnne', 'neckGable'].includes(spec.roof.type)) {
    return { y: spec.height };
  }
  return null;
}

/** Rise of the roof behind a stepped gable (ridge running back from the street). */
function gableRoofH(roof) {
  return roof.roofH ?? roof.h * STEPPED_ROOF_PITCH;
}

/**
 * Where the gooseneck of a fire escape climbing a wall of `width` comes down: onto the flat
 * roof deck behind the parapet, or over the eave and gutter onto the slope of a front-gabled
 * roof, `GOOSENECK_IN` from the eave. `roofY` is what it reaches over (its hump rises 0.85 m
 * above that, `Egress.buildFireEscape`).
 */
function escapeTop(spec, width) {
  const h = spec.height;
  const roof = spec.roof;
  if (roof.type === 'steppedGable') {
    const half = (width - 0.1) * 0.5;
    const deckY = h + ((GOOSENECK_IN - 0.05) / half) * gableRoofH(roof);
    return { roofY: h + 0.1, deckY };
  }
  if (roof.type === 'mansard') {
    // The top landing stands on the cornice before the dormers: a ladder climbs to it past the
    // cornice, and the gooseneck rises up the mansard slope, over its curb onto the upper roof,
    // its stay tied back to the slate
    const mh = roof.h ?? 2.6;
    const inset = roof.inset ?? 0.45;
    const cap = roof.cap ?? 0.5;
    // Over the curb moulding (its hump then clears the cresting too)
    const roofY = h + mh + 0.1;
    const run = spec.depth * 0.5 - inset;
    const deckY = h + mh + (cap * (GOOSENECK_IN - inset)) / run + 0.005;
    const stayX = inset * ((roofY - 1.2 - h) / mh) - 0.03;
    return { roofY, deckY, stayX, topLadder: true };
  }
  return { roofY: h + 0.54, deckY: h + 0.2 };
}

/**
 * @param {import('../../config/buildings/index.js').BuildingSpec} spec
 * @param {{ width: number, centerZ: number }} lot
 * @param {{ zEnd: number } | null} [nextLot] needed when the house `extendsInto` the next lot
 * @param {{ prevTop?: number | null, nextTop?: number | null, prevRoof?: object | null,
 *   nextRoof?: object | null }} [neighbours] heights the neighbours stand to (`lotTop`) – a lower
 *   one exposes a party wall – and where their roofs meet it (`lotRoofLine`)
 */
export function planBuilding(spec, lot, nextLot = null, neighbours = null) {
  const facadeX = spec.setback ?? 0;
  const zA = -lot.width * 0.5;
  const zB = spec.extendsInto === 'next' && nextLot ? nextLot.zEnd - lot.centerZ : lot.width * 0.5;
  const width = zB - zA;
  const h = spec.height;
  const top = topOf(spec);

  const plan = {
    spec,
    number: spec.number,
    style: spec.style,
    bespoke: Boolean(spec.builder),
    facadeX,
    depth: spec.depth,
    zA,
    zB,
    zC: (zA + zB) * 0.5,
    width,
    height: h,
    top,
    crownBottom: h - (CROWN_DEPTH[spec.cornice?.type] ?? 0),
    floors: spec.floors.length,
    dwellings: dwellingsOf(spec),
    axes: [],
    stairAxis: -1,
    bayW: 0,
    flatPlan: flatPlanOf(spec),
    windows: [],
    dormers: [],
    escapes: [],
    downpipes: [],
    ducts: [],
    entrances: [],
    shops: [],
    areaways: [],
    belts: [],
    partyWalls: [],
    flanks: [],
    bays: [],
    recesses: [],
    doorZones: [],
    gableRoofH: spec.roof.type === 'steppedGable' ? gableRoofH(spec.roof) : 0,
  };
  if (plan.bespoke) return plan;

  // Facade grid and who lives behind every window
  const grid = resolveGrid(spec.grid, zA, zB);
  plan.axes = grid.axes;
  plan.stairAxis = grid.stair;
  plan.bayW = grid.bayW;
  plan.zC = grid.zC;
  const flats = flatPlanOf(spec, grid.stair);
  plan.flatPlan = flats;
  /** Metres from the left corner → lot-local Z. */
  const fromLeft = (m) => zA + m;

  // Windows, axis by axis and floor by floor (this is also the build order). Floors without
  // a window row – a mansard storey – are lit by dormers instead.
  const win = spec.windows;
  const rows = win.rows;
  const winW = Math.min(win.width.max, grid.bayW * win.width.bay);
  // Projecting bays take the place of the windows of their axis on their floors: each of their
  // rows of windows lights the room on that floor
  // A bay may span several axes (`axes`: a Neo-Grec canted bay over two) or stand `at` metres
  // from the left corner; its rooms are those of its first axis
  const inBay = new Set();
  for (const bay of spec.bays ?? []) {
    const axes = bay.axes ?? [bay.axis];
    for (const ax of axes) for (const f of bay.floors) inBay.add(`${ax}/${f}`);
    const mid = axes.reduce((sum, ax) => sum + grid.axes[ax], 0) / axes.length;
    plan.bays.push({
      ...bay,
      axis: axes[0],
      z: bay.at !== undefined ? fromLeft(bay.at) : mid,
      rows: bay.floors.map((f) => ({ floor: f, ...bay.rows[f], cell: flats.cell(axes[0], f) })),
    });
  }
  for (let ax = 0; ax < grid.axes.length; ax++) {
    const z = grid.axes[ax];
    for (let f = 0; f < spec.floors.length; f++) {
      if (!rows[f] || inBay.has(`${ax}/${f}`)) continue;
      const cell = flats.cell(ax, f);
      // Options of the floor, then of this one window (`cells['axis/floor']`), which may also
      // size and place it on its own (`y`, `w`, `h`: a carriage house's hayloft door)
      const one = win.cells?.[`${ax}/${f}`];
      // `at` (metres from the left corner) moves it off its axis: one wide window for two bays
      const { y: oneY, w: oneW, h: oneH, at: oneAt, ...oneOpts } = one ?? {};
      const opts = one ? { ...win.floors?.[f], ...oneOpts } : win.floors?.[f];
      if (cell.type === 'stair') {
        // Stair windows on the landings may keep one head of their own (`stair.lintel`) instead
        // of following the hierarchy of the floors they straddle
        const st = win.stair;
        plan.windows.push({
          kind: 'stair',
          ax,
          floor: f,
          z,
          y: rows[f].y + st.lift,
          w: winW * st.width,
          h: st.h,
          tint: st.tint,
          opts: st.lintel ? { ...opts, lintel: st.lintel } : opts,
        });
      } else if (cell.type === 'corridor') {
        // End window of a corridor: the same opening as the rooms beside it, bare and lit
        plan.windows.push({
          kind: 'corridor',
          ax,
          floor: f,
          z,
          y: rows[f].y,
          w: rows[f].w ?? winW,
          h: rows[f].h,
          opts,
        });
      } else if (cell.type === 'room') {
        // A row may pair its windows – two lights per axis either side of a colonnette, `pair`
        // off the axis (Romanesque); an AC or a flower box goes under the first of them only
        const pair = rows[f].pair;
        const zs = pair ? [z - pair, z + pair] : [z];
        zs.forEach((wz, i) => {
          plan.windows.push({
            kind: 'room',
            ax,
            floor: f,
            z: oneAt !== undefined ? fromLeft(oneAt) : wz,
            y: oneY ?? rows[f].y,
            // A row may have narrower windows of its own (basement, frieze windows)
            w: oneW ?? rows[f].w ?? winW,
            h: oneH ?? rows[f].h,
            cell: i === 0 ? cell : { ...cell, acBelow: false, flowers: false },
            opts,
          });
        });
      }
    }
  }

  // Dormers light the top storey (mansard or attic); the room behind is the one on their axis,
  // `at` (metres from the left corner) places them off the axes
  if (spec.roof.dormers) {
    const f = spec.floors.length - 1;
    const d = spec.roof.dormers;
    d.axes.forEach((ax, i) => {
      const z = d.at ? fromLeft(d.at[i]) : grid.axes[ax];
      plan.dormers.push({ ax, floor: f, z, cell: flats.cell(ax, f) });
    });
  }

  // Fire escapes: landings span the served axes; the gooseneck lands on the flat roof deck
  for (const [a, c] of spec.egress?.escapes ?? []) {
    plan.escapes.push({
      side: spec.egress.side,
      axes: [a, c],
      z: (grid.axes[a] + grid.axes[c]) * 0.5,
      // A landing may run wider than its bays (`egress.halfW`), clear of the windows beside
      halfW: spec.egress.halfW ?? (grid.axes[c] - grid.axes[a]) * 0.5 + grid.bayW * 0.5 - 0.06,
      landings: spec.egress.landings,
      // The end the drop ladder hangs at (`left`: over the flats' door)
      drop: spec.egress.drop,
      ...escapeTop(spec, width),
    });
  }

  const pipes = spec.services?.downpipes;
  if (pipes === 'corners' || pipes === 'left')
    plan.downpipes.push({ z: zA + 0.48, topY: h - 0.55 });
  if (pipes === 'corners' || pipes === 'right')
    plan.downpipes.push({ z: zB - 0.48, topY: h - 0.55 });
  // Ducts up the front (a laundromat's dryers) end above the roof's highest point
  for (const d of spec.services?.ducts ?? []) {
    plan.ducts.push({ z: fromLeft(d.at), y0: d.y0, y1: top + 0.5 });
  }

  for (const e of spec.entrances) {
    if (e.kind === 'shop') continue; // the shop door belongs to its shopfront
    const ax = e.axis === 'stair' ? grid.stair : e.axis;
    const z = e.at !== undefined ? fromLeft(e.at) : grid.axes[ax];
    plan.entrances.push({ ...e, z, numberTile: `plaque_${spec.number}` });
  }

  // Shopfronts: whole bays (left edge of the first axis to right edge of the last) or a span
  // in metres from the left corner
  for (const s of spec.shops ?? []) {
    let z0;
    let z1;
    let axes = [];
    if (s.kind === 'carriage') {
      // A carriage arch `opening` wide centred `at` metres from the left corner, cut into the
      // ground storey up to its springing; the shop's span runs over its voussoirs
      const cz = fromLeft(s.at);
      const half = s.opening * 0.5;
      const recess = { z0: cz - half, z1: cz + half, h: s.spring, depth: s.depth ?? 1.6 };
      plan.recesses.push(recess);
      plan.shops.push({
        ...s,
        cz,
        recess,
        z0: cz - half - CARRIAGE_RING,
        z1: cz + half + CARRIAGE_RING,
        axes,
      });
      continue;
    }
    if (s.span) {
      z0 = fromLeft(s.span[0]);
      z1 = fromLeft(s.span[1]);
    } else {
      const [a0, a1] = s.axes;
      const [i0, i1] = s.inset ?? [0, 0];
      z0 = grid.axes[a0] - grid.bayW * 0.5 + i0;
      z1 = grid.axes[a1] + grid.bayW * 0.5 - i1;
      axes = grid.axes.slice(a0, a1 + 1);
    }
    if (s.kind === 'storefront' && s.hatch) {
      // The service hatch in the last run of glass needs room behind it: the wall is cut back
      // behind that whole run, hidden by its glass except at the hatch
      const dw = s.doors === 2 ? SHOP_DOOR.double : SHOP_DOOR.single;
      const door = s.door ?? 'left';
      const dz =
        door === 'center' ? (z0 + z1) * 0.5 : door === 'right' ? z1 - 0.2 - dw * 0.5 - 0.06 : 0;
      const g0 =
        door === 'center' ? dz + dw * 0.5 + 0.06 : z0 + 0.2 + (door === 'left' ? dw + 0.12 : 0);
      const g1 = door === 'right' ? dz - dw * 0.5 - 0.06 : z1 - 0.2;
      const glassTop = spec.floors[0] - 0.15 - 0.78 - (s.shutterBox ? 0.36 : 0.06);
      plan.recesses.push({ z0: g0 + 0.03, z1: g1 - 0.03, h: glassTop - 0.02, depth: HATCH_DEPTH });
    }
    if (s.kind === 'storefront' && s.cut) {
      // A recessed shop door whose lobby is cut into the ground storey, a little wider than the
      // lobby's side glass, its ceiling just above the lobby's head (`Storefront.buildStorefront`)
      const dw = s.doors === 2 ? SHOP_DOOR.double : SHOP_DOOR.single;
      const half = dw * 0.5 + SHOP_DOOR.side;
      const dz =
        s.door === 'center'
          ? (z0 + z1) * 0.5
          : s.door === 'right'
            ? z1 - 0.2 - half
            : z0 + 0.2 + half;
      const glassTop = spec.floors[0] - 0.15 - 0.78 - (s.shutterBox ? 0.36 : 0.06);
      const recess = {
        z0: dz - half - 0.01,
        z1: dz + half + 0.01,
        h: glassTop - 0.02,
        depth: SHOP_DOOR.lobby,
      };
      plan.recesses.push(recess);
      plan.shops.push({ ...s, z0, z1, axes, recess });
      continue;
    }
    if (s.kind === 'diner') {
      // The entrance lobby at the left end, behind the enamel pier, cut into the ground storey
      const recess = {
        z0: z0 + DINER.pier,
        z1: z0 + DINER.pier + DINER.lobby + DINER.curve,
        h: DINER.head,
        depth: DINER.depth,
      };
      plan.recesses.push(recess);
      plan.shops.push({ ...s, z0, z1, axes, recess, curve: DINER.curve });
      continue;
    }
    plan.shops.push({ ...s, z0, z1, axes });
  }

  for (const a of spec.areaways ?? []) {
    plan.areaways.push({
      z0: fromLeft(a.span[0]),
      z1: fromLeft(a.span[1]),
      depth: a.depth ?? 1.0,
      bins: (a.bins ?? []).map(fromLeft),
      binX: a.binX,
      hedge: a.hedge,
    });
  }

  plan.belts = (spec.wall?.belts ?? []).flatMap((belt) => beltRuns(belt, zA, zB));

  // Flank facades over an open lot (`flanks.left` / `flanks.right`): openings stand in columns
  // `at` metres back from the street corner, `sill` above the floor level; the rooms behind
  // belong to the end flat of each floor. Positions along the flank are flank-local Z
  // (`Flanks.flankFrame`).
  const floorY = [0];
  for (const fh of spec.floors) floorY.push(floorY[floorY.length - 1] + fh);
  for (const [name, f] of Object.entries(spec.flanks ?? {})) {
    const side = name === 'left' ? -1 : 1;
    const endAxis = side < 0 ? 0 : grid.axes.length - 1;
    const along = (a) => (side > 0 ? a : spec.depth - a);
    const ac = new Set((f.acUnder ?? []).map(([a, fl]) => `${a},${fl}`));
    const flowers = new Set((f.flowerBoxes ?? []).map(([a, fl]) => `${a},${fl}`));
    const flank = {
      side,
      z: side < 0 ? zA : zB,
      windows: [],
      escapes: [],
      doors: [],
      lamps: [],
      meters: [],
      downpipes: [],
      parapet: Boolean(f.parapet),
      flues: f.flues ?? 0,
      // The front's ground-storey facing and cornice turn the corner this far onto the flank,
      // with the belt courses too when `belts` (a corner house's second front)
      wrap: f.wrap ?? 0,
      belts: f.belts ? (spec.wall?.belts ?? []).map(beltY) : [],
      cornerZ: along(0),
      ironBalcony: null,
    };
    for (const col of f.windows ?? []) {
      // Everything else on the column dresses its windows (`lights`, `guard`, `tile`, `glass`…)
      const { at: _at, floors: _floors, w: _w, h: _h, sill: _sill, room: _room, ...dress } = col;
      for (const fl of col.floors) {
        flank.windows.push({
          at: col.at,
          floor: fl,
          z: along(col.at),
          y: floorY[fl] + col.sill,
          w: col.w,
          h: col.h,
          cell: {
            ...flats.flankCell(fl, endAxis, col.room, { acBelow: ac.has(`${col.at},${fl}`) }),
            flowers: flowers.has(`${col.at},${fl}`),
          },
          opts: { lintel: 'flat', ...dress },
        });
      }
    }
    if (f.ironBalcony) {
      // A French balcony on the flank (its span metres back from the street corner)
      const ib = f.ironBalcony;
      const [z0, z1] = ib.span.map(along).sort((a, c) => a - c);
      flank.ironBalcony = { ...ib, z0, z1, consoles: ib.consoles?.map(along) };
    }
    if (f.escape) {
      const e = {
        side: 'flank',
        flank: side,
        at: f.escape.at,
        z: along(f.escape.at),
        halfW: f.escape.halfW,
        landings: spec.egress.landings,
        // The gooseneck climbs the flank: the roof rises across the front's width from it
        ...escapeTop(spec, width),
      };
      flank.escapes.push(e);
      plan.escapes.push(e);
    }
    for (const d of f.doors ?? []) flank.doors.push({ ...d, z: along(d.at) });
    for (const l of f.lamps ?? []) flank.lamps.push({ ...l, z: along(l.at) });
    for (const m of f.meters ?? []) flank.meters.push({ ...m, z: along(m.at) });
    const pipeTop = h - (spec.roof.type === 'flat' ? 0.55 : 0.15);
    for (const a of f.downpipes ?? []) flank.downpipes.push({ at: a, z: along(a), topY: pipeTop });
    plan.flanks.push(flank);
  }

  // Party walls: a house on the sidewalk line shows a blank flank with a parapet wherever the
  // neighbour stands lower (set-back houses have their own flanks, e.g. № 114); a flank facade
  // over an open lot takes its place
  if (facadeX < SIDEWALK_REACH && neighbours) {
    const sides = [
      [-1, zA, neighbours.prevTop, neighbours.prevRoof],
      [1, zB, neighbours.nextTop, neighbours.nextRoof],
    ];
    for (const [side, z, below, roofLine] of sides) {
      if (below === null || below === undefined || top - below < PARTY_WALL_STEP) continue;
      if (plan.flanks.some((f) => f.side === side)) continue;
      // A neighbour standing above the own wall (only an attic or a mansard rises over it)
      // meets the parapet at the roof deck: level with this house's own
      const line = roofLine ?? (below > h ? { y: Math.min(below, h + 0.2) } : null);
      plan.partyWalls.push({ side, z, below, roofLine: line });
    }
  }

  if (facadeX < SIDEWALK_REACH) {
    for (const e of plan.entrances) {
      const half = Math.max((e.w ?? 1.0) * 0.5 + 0.45, (e.stoop?.w ?? 0) * 0.5 + 0.2);
      plan.doorZones.push([e.z - half, e.z + half]);
    }
  }
  return plan;
}

/**
 * Facade openings of a plan as rectangles in the facade plane (`z0..z1` × `y0..y1`): window
 * reveals, entrance doors and shopfronts. Used by the overlap rules.
 */
export function openingsOf(plan) {
  const out = [];
  for (const w of plan.windows) {
    const lintel = w.opts?.lintel ?? plan.spec.windows.lintel;
    const curved = lintel === 'arch' ? w.w * 0.5 : lintel === 'segmental' ? w.w * 0.16 : 0;
    out.push({
      what: `${w.kind} window ${w.ax}/${w.floor}`,
      window: true,
      z0: w.z - w.w * 0.5 - 0.06,
      z1: w.z + w.w * 0.5 + 0.06,
      y0: w.y - 0.07,
      y1: w.y + w.h + curved + 0.07,
    });
  }
  for (const e of plan.entrances) {
    // Doorway: leaves (+ side lights), transom or fanlight above
    const ow = (e.w ?? 1.0) + (e.sidelights ? 0.64 : 0);
    const y0 = e.y0 ?? 0;
    const spring = y0 + (e.h ?? 2.2) + (e.transom === 'rect' ? 0.38 : 0) + 0.07;
    const fan = e.transom === 'fan' || e.surround === 'arch' || e.surround === 'aedicule';
    out.push({
      what: `${e.kind} door`,
      z0: e.z - ow * 0.5 - 0.06,
      z1: e.z + ow * 0.5 + 0.06,
      y0: Math.max(0, y0 - 0.02),
      y1: fan ? spring + ow * 0.5 + 0.03 : spring,
    });
  }
  for (const s of plan.shops) {
    // A shopfront runs up to its fascia under the belt over the ground storey; an arched one
    // to the crown of its voussoirs
    const topY =
      s.kind === 'arch'
        ? s.spring + (s.z1 - s.z0) * 0.5 - (s.jamb ?? 0.32) + 0.4
        : s.kind === 'carriage'
          ? s.spring + s.rise + CARRIAGE_RING + 0.05
          : plan.spec.floors[0] - 0.15;
    out.push({ what: `${s.kind} shopfront`, z0: s.z0, z1: s.z1, y0: 0, y1: topY });
  }
  // A projecting bay, from the foot of its corbel (or the ground) to the top of its cap
  for (const bay of plan.bays) {
    out.push({
      what: `bay ${bay.axis}`,
      z0: bay.z - bay.w * 0.5,
      z1: bay.z + bay.w * 0.5,
      y0: bay.y0 > 0.01 ? bay.y0 - 0.6 : 0,
      y1: bay.y1 + 0.2,
    });
  }
  return out;
}
