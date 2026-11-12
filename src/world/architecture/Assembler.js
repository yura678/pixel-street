/**
 * Assembler – builds a house from its resolved plan (`SpecPlanner.planBuilding`) out of the
 * shared architectural parts. The build order is fixed (masses → wall dressing → crown →
 * roof → windows → fire escapes → services → entrances → shopfronts → signs → areaways →
 * party walls → flank facades → street furniture → site), so a spec always draws the same
 * random numbers and yields the same house.
 */
import * as THREE from 'three/webgpu';
import { BUILDING_LINE_X, FURNITURE, ROAD_FAR_X } from '../../config/streetProfile.js';
import { buildIronBalcony } from './Balconies.js';
import { buildBay } from './Bays.js';
import { buildEntranceCanopy } from './Canopy.js';
import { buildCarriageArch, buildHayloftDoor, buildPotteryShelf } from './Carriage.js';
import {
  buildAttic,
  buildCivicBalcony,
  buildClockCupola,
  buildInscribedFrieze,
  buildPedestalLantern,
  buildRoofFlag,
} from './Civic.js';
import { buildCornice } from './Cornices.js';
import { buildDoorway } from './Doors.js';
import { buildFireEscape } from './Egress.js';
import {
  buildBeltCourse,
  buildFacadeMass,
  buildPierDiamonds,
  buildPilasters,
  buildQuoins,
  buildTerracottaInsets,
} from './Facade.js';
import { flankFrame, inFlank } from './Flanks.js';
import { buildNeckGable, buildQueenAnneGable, buildSteppedGable } from './Gables.js';
import { buildBambooPlanter } from './Greenery.js';
import { buildRamenFront } from './Machiya.js';
import { FABRICS, WHITE } from './palette.js';
import { buildPartyWall } from './PartyWall.js';
import { withFrame } from './primitives.js';
import {
  buildExhaustFan,
  buildFancyChimney,
  buildFlatRoof,
  buildGableRoof,
  buildKilnFlue,
  buildMansard,
  buildParapet,
  buildWaterTank,
} from './Roofs.js';
import {
  buildBracketClock,
  buildBracketLantern,
  buildDishLamp,
  buildDownpipe,
  buildDryerDuct,
  buildMailbox,
  buildMeterBox,
  buildRooftopUnits,
} from './Services.js';
import { buildAreaway, buildStoop } from './Stoops.js';
import {
  buildArchedShopfront,
  buildBanner,
  buildDinerFront,
  buildStorefront,
  buildVerticalSign,
  buildWorkshopFront,
} from './Storefront.js';
import { buildCafeTerrace, buildMenuCase } from './Terrace.js';
import { buildSashWindow } from './Windows.js';

/** Street furniture at the curb (a mailbox) stands 0.55 m behind the curb face. */
const CURB_FURNITURE_X = ROAD_FAR_X - BUILDING_LINE_X + FURNITURE.mailbox;
/** A canopy reaching the curb (`canopy.reach: 'curb'`) ends its posts this far behind its face. */
const CANOPY_CURB_GAP = 0.3;

/** Terracotta let into the brick, unless the spec gives a colour of its own. */
const TERRACOTTA = Object.freeze([0.78, 0.46, 0.32]);

/**
 * On a corner house's flank (`flanks.*.belts`) the crown and the belt courses reach back round
 * the corner as far as the front's run past the wall – its projection less its overrun past
 * the end and 3 mm, so the flank's end caps hide behind the front's faces instead of z-fighting
 * with them (`Cornices.buildCornice`: the dentil cornice projects 0.24 m and overruns 0.02 m;
 * `Facade.buildBeltCourse`: a belt projects 0.14 m).
 */
const CROWN_RETURN = Object.freeze({ simple: 0.217 });
const BELT_RETURN = 0.137;

/** Runs `fn` with both builders raised `dy` (a stoop or a shopfront on a raised yard). */
function raised(b, pools, dy, fn) {
  if (!dy) {
    fn();
    return;
  }
  const m = new THREE.Matrix4().makeTranslation(0, dy, 0);
  withFrame(b, m, () => withFrame(pools, m, fn));
}

/** Spec material (`{ tile: 'wall_brick', … }`) → MeshBuilder options. */
function material(T, m) {
  return { tile: T[m.tile], color: m.color, texScale: m.texScale };
}

/** Window options for a flat's room: its dressing and extras from the flat plan. */
function roomWindow(cell) {
  return {
    glazing: cell.glazing,
    fabric: FABRICS[cell.fabric],
    lit: cell.lit,
    flowers: cell.flowers,
    acBelow: cell.acBelow,
  };
}

/** The end window of a corridor (a hotel): bare glass, the corridor always lit. */
const CORRIDOR_WINDOW = Object.freeze({ glazing: 'plain', lit: true });

/**
 * @param {object} atlas facade atlas
 * @param {import('../MeshBuilder.js').MeshBuilder} b solid geometry
 * @param {import('../MeshBuilder.js').MeshBuilder} pools additive light pools
 * @param {ReturnType<import('./SpecPlanner.js').planBuilding>} plan
 * @param {import('../../core/random.js').Rng} rng
 * @param {{ site?: (site: object, plan: object) => void }} [hooks] builders that live outside
 *   the shared parts (gardens and terraces in the setback)
 * @returns {Array<[number, number]>} Z spans of doors and stoops to keep clear on the sidewalk
 */
export function assembleBuilding(atlas, b, pools, plan, rng, hooks = {}) {
  const T = atlas.tiles;
  const spec = plan.spec;
  const wall = spec.wall;
  const x = plan.facadeX;
  const { zA, zB, zC, width: W, height: h } = plan;
  const zones = [];

  // 1. Masses: ground storey, upper block, plinth
  buildFacadeMass(atlas, b, {
    x,
    depth: plan.depth,
    cz: zC,
    w: W,
    h,
    // The ground material may run up past the ground storey (`groundH`: a Romanesque house's
    // rock-faced basement and parlor floor)
    groundH: wall.groundH ?? spec.floors[0],
    ground: material(T, wall.ground),
    upper: material(T, wall.upper),
    plinth: wall.plinth,
    // Openings cut into the ground storey: a recessed shop entrance, a carriage arch
    recesses: plan.recesses,
  });

  // 2. Wall dressing: belt courses (broken where a portal or a stair core rises through them),
  //    rusticated quoins, banded rustication of the ground storey, a frame house's corner boards
  for (const belt of plan.belts) {
    const bw = belt.z1 - belt.z0;
    buildBeltCourse(atlas, b, x, belt.y0, (belt.z0 + belt.z1) * 0.5, bw, wall.trim);
  }
  if (wall.quoins) {
    const q = wall.quoins;
    const strips = [
      [zA + q.corner * 0.5, q.corner],
      [zB - q.corner * 0.5, q.corner],
    ];
    if (q.stairCore && spec.grid.type === 'stairCore') {
      const half = spec.grid.stairW * 0.5;
      strips.push(
        [zC - half + q.stairCore * 0.5, q.stairCore],
        [zC + half - q.stairCore * 0.5, q.stairCore],
      );
    }
    buildQuoins(atlas, b, x, q.y0, q.top - q.y0, strips, wall.trim);
  }
  if (wall.rustication) {
    // Channelled joints every course across the ground storey
    const groove = { tile: T.white, color: wall.ground.color.map((c) => c * 0.55) };
    for (let y = wall.rustication; y < spec.floors[0] - 0.15; y += wall.rustication) {
      b.quad([x - 0.003, y, zA], [0, 0, W], [0, 0.035, 0], groove);
    }
  }
  if (wall.cornerBoards) {
    // Painted boards closing both corners of the clapboard, from the foundation to the frieze;
    // each wraps the corner, so it shows on the flank too
    const cb = wall.cornerBoards;
    const paint = { tile: T.wood_paint, color: wall.trim, texScale: 0.6 };
    const y0 = cb.y0 ?? 0.5;
    const y1 = cb.top ?? h - 0.9;
    for (const [z0, z1] of [
      [zA - 0.02, zA + cb.w],
      [zB - cb.w, zB + 0.02],
    ]) {
      b.box(x + cb.w * 0.5 - 0.04, y0, (z0 + z1) * 0.5, cb.w + 0.04, y1 - y0, z1 - z0, paint);
    }
  }
  if (wall.diamonds) {
    // Diamonds of darker brick in the piers (spots: metres from the left corner, height)
    const d = wall.diamonds;
    buildPierDiamonds(
      atlas,
      b,
      x,
      d.spots.map(([at, y]) => [zA + at, y]),
      d.size ?? 0.2,
      d.color,
      wall.upper.color,
    );
  }
  // Flat pilasters between the bays (metres from the left corner), single or paired – or
  // engaged half-columns (`round`); a list gives every storey its own run
  for (const p of wall.pilasters ? [wall.pilasters].flat() : []) {
    buildPilasters(atlas, b, {
      x,
      zs: p.at.map((at) => zA + at),
      y0: p.y0,
      y1: p.y1,
      w: p.w,
      paired: p.paired,
      capital: p.capital,
      round: p.round,
      color: p.color ?? wall.trim,
    });
  }
  if (wall.insets) {
    // Terracotta panels and bands let into the brick (metres from the left corner)
    buildTerracottaInsets(
      atlas,
      b,
      x,
      wall.insets.map((r) => [zA + r.at, r.y, r.w, r.h]),
      wall.insetColor ?? TERRACOTTA,
    );
  }
  if (wall.frieze) {
    // A stone frieze across the front, the inscription carved in it (the annex's POST OFFICE)
    const fz = wall.frieze;
    buildInscribedFrieze(atlas, b, {
      x,
      cz: zC,
      w: W,
      y0: fz.y0,
      h: fz.h,
      stone: { tile: T.wall_stone, color: fz.color ?? wall.trim, texScale: 0.9 },
      inscription: fz.inscription ? T[fz.inscription] : null,
    });
  }

  // 3. Crown and roof
  const seg = {
    wallStyle: wall.upper.tile.replace(/^wall_/, ''),
    wallTile: T[wall.upper.tile],
    color: wall.upper.color,
    texScale: wall.upper.texScale,
    cornice: spec.cornice.type,
    corniceCol: spec.cornice.color,
    corniceBays: spec.cornice.bays,
    corniceBrackets: spec.cornice.brackets,
    corniceAxes: plan.axes,
    date: spec.cornice.date ? T[`date_${spec.cornice.date}`] : null,
    sunburst: spec.cornice.sunburst,
    frontParapet: spec.roof.type === 'parapet' ? false : spec.roof.frontParapet,
    roofKit: spec.roof.kit,
    bulkhead: spec.roof.bulkhead,
  };
  buildCornice(atlas, b, x, h, zC, W, seg, T[wall.upper.tile]);
  const roof = spec.roof;
  // Dormers, each on its axis; `cells` gives one of them a size or head of its own (the larger
  // middle dormer of the hotel, lighting the corridor)
  const dormers = (d) =>
    plan.dormers.map((dm) => {
      const one = d.cells?.[dm.ax] ?? {};
      const dress =
        dm.cell.type === 'room'
          ? roomWindow(dm.cell)
          : dm.cell.type === 'corridor'
            ? CORRIDOR_WINDOW
            : {};
      return {
        z: dm.z,
        w: one.w ?? d.w,
        h: one.h ?? d.h,
        sill: one.sill ?? d.sill,
        head: one.head ?? d.head,
        trim: wall.trim,
        win: { lights: one.lights ?? d.lights, ...dress },
      };
    });
  if (roof.type === 'attic') {
    // Civic crown: flat roof behind an attic storey (inscription, balustrade, urns) and the
    // clock and bell cupola standing back over the middle
    buildFlatRoof(atlas, b, x, plan.depth, h, zC, W, { ...seg, frontParapet: false }, zC, rng);
    buildAttic(atlas, b, {
      x,
      cz: zC,
      w: W,
      y0: h,
      h: roof.h,
      stone: material(T, wall.upper),
      coping: wall.trim,
      inscription: roof.inscription ? T[roof.inscription] : null,
      balustrade: roof.balustrade,
    });
    if (roof.cupola) {
      buildClockCupola(atlas, b, {
        x: x + roof.cupola.back,
        z: zC,
        y0: h + 0.2,
        w: roof.cupola.w,
        h: roof.cupola.h,
      });
    }
  } else if (roof.type === 'flat' || roof.type === 'parapet') {
    const stairZ = plan.stairAxis >= 0 ? plan.axes[plan.stairAxis] : zC;
    buildFlatRoof(atlas, b, x, plan.depth, h, zC, W, seg, stairZ, rng);
    if (roof.type === 'parapet') {
      // A taxpayer's crown: the front wall carried up as a parapet, a dated panel in the middle
      // (its face a hair proud of the roof deck's edge)
      buildParapet(atlas, b, {
        x: x - 0.004,
        cz: zC,
        w: W,
        y0: h,
        h: roof.h,
        profile: roof.profile,
        wall: material(T, wall.upper),
        coping: roof.coping ?? wall.trim,
        date: roof.date ? T[`date_${roof.date}`] : null,
        frieze: roof.frieze,
        rise: roof.rise,
        gableW: roof.gableW,
      });
    }
  } else if (roof.type === 'queenAnne') {
    // Queen Anne: the front gable projecting over the wall, hung with fish-scale shingles, a
    // loggia in it, the roof behind running back; a tall chimney on one party wall
    buildQueenAnneGable(atlas, b, rng, {
      x,
      cz: zC,
      w: W,
      y0: h,
      h: roof.h,
      depth: plan.depth,
      overhang: roof.overhang,
      shingle: {
        tile: T[roof.shingle.tile ?? 'slate_fishscale'],
        color: roof.shingle.color,
        texScale: 0.45,
      },
      trim: roof.trim,
      roof: { tile: T[roof.tile ?? 'slate_rect'], color: roof.color, texScale: 0.5 },
      loggia: roof.loggia,
      wall: material(T, wall.upper),
    });
    if (roof.chimney) {
      const c = roof.chimney;
      buildFancyChimney(atlas, b, {
        x: x + c.back,
        z: c.side === 'left' ? zA + c.inset : zB - c.inset,
        y0: h - 0.2,
        top: h + roof.h + c.above,
        w: c.w,
        d: c.d,
        crown: c.crown,
      });
    }
  } else if (roof.type === 'gable') {
    // Side-gabled roof, the eave to the street; chimneys stand on both party walls
    buildGableRoof(atlas, b, rng, {
      x,
      depth: plan.depth,
      cz: zC,
      w: W,
      y0: h,
      h: roof.h,
      roof: { tile: T[roof.tile ?? 'slate_rect'], color: roof.color, texScale: 0.5 },
      wall: material(T, wall.upper),
      dormers: roof.dormers ? dormers(roof.dormers) : [],
      chimneys: roof.chimneys === false ? [] : [zA + 0.35, zB - 0.35],
      flue: roof.flue ? { z: zA + roof.flue.at } : null,
    });
  } else if (roof.type === 'mansard') {
    const d = roof.dormers;
    buildMansard(atlas, b, rng, {
      x,
      depth: plan.depth,
      cz: zC,
      w: W,
      y0: h,
      h: roof.h,
      inset: roof.inset,
      cap: roof.cap,
      wallColor: wall.upper.color,
      curbColor: wall.trim,
      bands: roof.bands?.map((band) => ({ ...band, tile: T[band.tile] })),
      cresting: roof.cresting,
      dormers: dormers(d),
    });
  } else if (roof.type === 'steppedGable') {
    // Dutch front: the facade carried up in steps, the roof behind it running back
    buildSteppedGable(atlas, b, rng, {
      x,
      cz: zC,
      w: W,
      y0: h,
      h: roof.h,
      depth: plan.depth,
      steps: roof.steps,
      wall: material(T, wall.upper),
      trim: wall.trim,
      roof: { tile: T[roof.tile ?? 'slate_rect'], color: roof.color, texScale: 0.5 },
      roofH: plan.gableRoofH,
      window: roof.window && { ...roof.window, trim: wall.trim, lit: false },
      anchors: roof.anchors,
      hoist: roof.hoist,
    });
  } else if (roof.type === 'neckGable') {
    // Dutch neck gable: one bay of wall carried up between sandstone shoulders under a small
    // pediment, the hoist beam over its window, the roof behind running back
    buildNeckGable(atlas, b, rng, {
      x,
      cz: zC,
      w: W,
      y0: h,
      depth: plan.depth,
      neckW: roof.neckW,
      neckH: roof.neckH,
      shoulderH: roof.shoulderH,
      pedH: roof.pedH,
      wall: material(T, wall.upper),
      trim: wall.trim,
      roof: { tile: T[roof.tile ?? 'slate_rect'], color: roof.color, texScale: 0.5 },
      window: roof.window && { ...roof.window, trim: wall.trim, lit: false },
      hoist: roof.hoist,
    });
  } else {
    throw new Error(`Roof type "${roof.type}" is not in the parts library yet`);
  }
  // Roof furniture: a flagpole on the deck behind the parapet; the ventilation units of a
  // centrally ventilated building on the ridge of a mansard's upper roof
  if (roof.flag) {
    buildRoofFlag(atlas, b, {
      x: x + (roof.flag.back ?? 1.2),
      z: zC + (roof.flag.at ?? 0),
      y0: h + 0.2,
      h: roof.flag.h,
      flag: T[roof.flag.tile],
      dir: roof.flag.dir,
    });
  }
  if (roof.units && roof.type === 'mansard') {
    const top = h + (roof.h ?? 2.6) + (roof.cap ?? 0.5);
    buildRooftopUnits(atlas, b, x + plan.depth * 0.5, zC, top, roof.units.gap);
  }
  // On a flat deck: a kitchen's mushroom extract fan near the back, a kiln's steel flue, the
  // wooden water tank on its stand (metres from the left corner, back from the facade)
  if (roof.type === 'flat' || roof.type === 'parapet') {
    if (roof.tank) {
      const t = roof.tank;
      buildWaterTank(atlas, b, { ...t, x: x + t.back, z: zA + t.at, y0: h + 0.2 });
    }
    if (roof.fan) {
      buildExhaustFan(atlas, b, x + plan.depth - (roof.fan.back ?? 1.2), zA + roof.fan.at, h + 0.2);
    }
    if (roof.flue) {
      const f = roof.flue;
      buildKilnFlue(
        atlas,
        b,
        x + (f.back ?? plan.depth * 0.6),
        zA + f.at,
        h + 0.2,
        h + 0.2 + f.rise,
      );
    }
  }

  // 4. Windows
  const base = {
    lintel: spec.windows.lintel,
    lights: spec.windows.lights,
    voussoirs: spec.windows.voussoirs,
    tile: spec.windows.tile,
    trimTile: spec.windows.trimTile,
    trim: wall.trim,
  };
  for (const w of plan.windows) {
    if (w.kind === 'stair') {
      buildSashWindow(atlas, b, x, w.z, w.y, w.w, w.h, rng, {
        ...base,
        ...w.opts,
        glazing: 'stair',
        fabric: w.tint,
        lit: true,
      });
      continue;
    }
    if (w.kind === 'corridor') {
      buildSashWindow(atlas, b, x, w.z, w.y, w.w, w.h, rng, {
        ...base,
        ...w.opts,
        ...CORRIDOR_WINDOW,
      });
      continue;
    }
    if (w.opts?.hayloft) {
      // A carriage house's hayloft door, now glazed for the flat behind it
      buildHayloftDoor(atlas, b, rng, {
        x,
        z: w.z,
        y: w.y,
        w: w.w,
        h: w.h,
        color: w.opts.hayloft.color,
        trim: wall.trim,
        ...roomWindow(w.cell),
      });
      continue;
    }
    buildSashWindow(atlas, b, x, w.z, w.y, w.w, w.h, rng, {
      ...base,
      ...w.opts,
      ...roomWindow(w.cell),
    });
  }
  // Projecting bays: every row of windows dressed for the room on its floor; a balcony on top
  for (const bay of plan.bays) {
    buildBay(atlas, b, rng, {
      shape: bay.shape,
      x,
      z: bay.z,
      w: bay.w,
      depth: bay.depth,
      y0: bay.y0,
      y1: bay.y1,
      wall: material(T, wall.upper),
      trim: wall.trim,
      // A row may dress its windows on its own (basement glass behind a grille)
      rows: bay.rows.map((r) => ({ y: r.y, h: r.h, win: { ...roomWindow(r.cell), ...r.win } })),
      win: { ...base, ...bay.win },
      balcony: bay.balcony,
    });
  }
  if (spec.balcony) {
    // A stone balcony with flags before one window (the council chamber's)
    const bc = spec.balcony;
    buildCivicBalcony(atlas, b, {
      x,
      z: plan.axes[bc.axis],
      y: bc.y,
      w: bc.w,
      flag: bc.flag ? T[bc.flag] : null,
      color: wall.trim,
    });
  }
  if (spec.ironBalcony) {
    // A French cast-iron balcony across several windows (metres from the left corner)
    const ib = spec.ironBalcony;
    buildIronBalcony(atlas, b, {
      x,
      z0: zA + ib.span[0],
      z1: zA + ib.span[1],
      y: ib.y,
      depth: ib.depth,
      consoles: ib.consoles?.map((at) => zA + at),
      stone: wall.trim,
    });
  }

  // 5. Fire escapes on the street front (rear ones are out of sight), downpipes
  for (const e of plan.escapes) {
    if (e.side !== 'front') continue;
    buildFireEscape(atlas, b, x, e.z, e.landings, e.roofY, e.halfW, e.deckY, {
      topLadder: e.topLadder,
      stayX: e.stayX,
      drop: e.drop,
    });
  }
  for (const d of plan.downpipes) buildDownpipe(atlas, b, x, d.z, d.topY);
  for (const d of plan.ducts) buildDryerDuct(atlas, b, x, d.z, d.y0, d.y1);

  // 6. Entrances (with their stoops) and shopfronts
  for (const e of plan.entrances) {
    if (e.kind !== 'house' && e.kind !== 'stair') {
      throw new Error(`Entrance kind "${e.kind}" is not in the parts library yet`);
    }
    if (e.stoop) {
      // A stoop rises from the sidewalk, or from a raised front yard (`base`: its paved path)
      const base = e.stoop.base ?? 0;
      let reach = 0;
      raised(b, pools, base, () => {
        reach = buildStoop(atlas, b, { ...e.stoop, x, z: e.z, toY: (e.y0 ?? 0) - base });
      });
      zones.push([e.z - e.stoop.w * 0.5 - 0.2, e.z + e.stoop.w * 0.5 + 0.2, reach]);
      if (e.stoop.lanterns) {
        // Lanterns on stone pedestals either side of the steps
        for (const s of [-1, 1]) {
          buildPedestalLantern(
            atlas,
            b,
            pools,
            x - reach * 0.5,
            e.z + s * (e.stoop.w * 0.5 + 0.38),
          );
        }
      }
    }
    zones.push(
      buildDoorway(atlas, b, pools, {
        ...e,
        x,
        number: e.number === false ? null : spec.number,
      }),
    );
    if (e.canopy) {
      // A hotel's marquee from the door out to the curb
      zones.push(
        buildEntranceCanopy(atlas, b, pools, {
          ...e.canopy,
          // Out to the curb, however wide the sidewalk
          reach:
            e.canopy.reach === 'curb'
              ? x - (ROAD_FAR_X - BUILDING_LINE_X) - CANOPY_CURB_GAP
              : e.canopy.reach,
          x,
          z: e.z,
          sign: e.canopy.sign ? T[e.canopy.sign] : null,
        }),
      );
    }
  }
  for (const s of plan.shops) {
    const blade = s.blade && { ...s.blade, tile: T[s.blade.tile] };
    const top = spec.floors[0] - 0.15;
    if (s.kind === 'storefront') {
      // On a raised terrace (`deck`: № 114's bakery) the front stands on the paving
      const deck = s.deck ?? 0;
      let door = null;
      raised(b, pools, deck, () => {
        door = buildStorefront(atlas, b, pools, rng, {
          ...s,
          x,
          top: top - deck,
          blade,
          wallColor: wall.ground.color,
        });
      });
      if (door) zones.push(door);
      if (s.banner) {
        buildBanner(atlas, b, { ...s.banner, x, z: zA + s.banner.at, tile: T[s.banner.tile] });
      }
      // A café's terrace in the strip before its glass, the menu case by its door
      if (s.terrace) {
        buildCafeTerrace(atlas, b, {
          x,
          pairs: s.terrace.pairs.map((at) => zA + at),
          weave: s.terrace.weave,
        });
      }
      if (s.menu) buildMenuCase(atlas, b, { x: x - 0.35, z: zA + s.menu.at, frame: s.paint });
    } else if (s.kind === 'workshop') {
      zones.push(buildWorkshopFront(atlas, b, pools, rng, { ...s, x, top, blade }));
    } else if (s.kind === 'arch') {
      // A Romanesque front under one wide arch in the stone of the ground storey's trim
      zones.push(buildArchedShopfront(atlas, b, pools, rng, { ...s, x, stone: wall.trim }));
    } else if (s.kind === 'ramen') {
      // A Japanese front in the ground storey of a frame house: koshi, hisashi, noren, lanterns
      zones.push(
        buildRamenFront(atlas, b, pools, rng, {
          ...s,
          x,
          top,
          number: spec.number,
          door: { ...s.door, at: zA + s.door.at },
          lanterns: s.lanterns.map((at) => zA + at),
        }),
      );
    } else if (s.kind === 'diner') {
      // A 1950s enamel-and-chrome front with its recessed entrance lobby
      zones.push(buildDinerFront(atlas, b, pools, rng, { ...s, x, top, blade }));
    } else if (s.kind === 'carriage') {
      // A carriage arch and its gates; the shop's sign in glazed tiles set in the wall beside it
      zones.push(
        buildCarriageArch(atlas, b, pools, rng, {
          ...s,
          x,
          span: s.opening,
          trim: wall.trim,
          number: spec.number,
        }),
      );
      const sign = s.sign && atlas.signs.get(s.sign);
      if (sign && s.signAt) {
        const [at, sy] = s.signAt;
        const sh = s.signH ?? 0.4;
        b.box(x - 0.02, sy - 0.05, zA + at, 0.04, sh + 0.1, sh * 3 + 0.1, {
          tile: T.terracotta,
          color: [0.7, 0.42, 0.3],
          texScale: 0.4,
        });
        b.quad([x - 0.042, sy, zA + at - sh * 1.5], [0, 0, sh * 3], [0, sh, 0], {
          tile: sign,
          color: WHITE,
        });
      }
    } else throw new Error(`Shopfront kind "${s.kind}" is not in the parts library yet`);
  }
  // Signs of the house itself: a hotel's vertical neon, a clockmaker's bracket clock
  for (const sg of spec.signs ?? []) {
    if (sg.kind === 'vertical') {
      buildVerticalSign(atlas, b, { ...sg, x, z: zA + sg.at, tile: T[sg.tile] });
    } else if (sg.kind === 'clock') {
      buildBracketClock(atlas, b, { ...sg, x, z: zA + sg.at });
    } else throw new Error(`Sign kind "${sg.kind}" is not in the parts library yet`);
  }
  for (const a of plan.areaways) {
    buildAreaway(atlas, b, {
      x,
      z0: a.z0,
      z1: a.z1,
      depth: a.depth,
      bins: a.bins,
      binX: a.binX,
      hedge: a.hedge,
      rng,
    });
  }

  // 7. Exposed party walls over lower neighbours
  for (const pw of plan.partyWalls) {
    buildPartyWall(atlas, b, {
      x,
      depth: plan.depth,
      z: pw.z,
      side: pw.side,
      below: pw.below,
      roofLine: pw.roofLine,
      top: h,
      wall: material(T, wall.upper),
      coping: wall.trim,
      mansard:
        roof.type === 'mansard'
          ? { h: roof.h ?? 2.6, inset: roof.inset ?? 0.45, cap: roof.cap }
          : null,
      // The gable end itself is the wall over the neighbour (its triangle comes with the roof);
      // a Queen Anne roof runs back from the front gable, its eaves over the party walls
      gable: roof.type === 'gable' || roof.type === 'queenAnne',
      // A neck gable's shoulders reach the corners: the parapet starts behind them
      front: roof.type === 'neckGable' ? 0.3 : undefined,
      ghost: spec.partyWall?.ghost === (pw.side < 0 ? 'left' : 'right'),
      scar: spec.partyWall?.scar === (pw.side < 0 ? 'left' : 'right'),
      flues: spec.partyWall?.flues ?? 0,
    });
  }

  // 8. Flank facades over an open lot, built with the front's parts in the flank's own frame:
  //    windows, the fire escape, doors, lamps, meters, downpipes; a flat roof's parapet returns
  //    along the flank
  for (const f of plan.flanks) {
    inFlank(b, pools, flankFrame(plan, f.side), () => {
      if (f.wrap > 0) {
        // The front's ground-storey facing and cornice turn the corner `wrap` metres onto the
        // flank; past that the flank is plain wall material down to the ground
        const dir = f.side > 0 ? 1 : -1;
        const wz = f.cornerZ + dir * f.wrap * 0.5;
        const rest = plan.depth - f.wrap;
        if (rest > 0.01) {
          b.box(-0.006, 0, f.cornerZ + dir * (f.wrap + rest * 0.5), 0.012, spec.floors[0], rest, {
            ...material(T, wall.upper),
            faces: { ny: false, px: false },
          });
        }
        if (wall.rustication) {
          const groove = { tile: T.white, color: wall.ground.color.map((c) => c * 0.55) };
          for (let y = wall.rustication; y < spec.floors[0] - 0.15; y += wall.rustication) {
            b.quad([-0.003, y, wz - f.wrap * 0.5], [0, 0, f.wrap], [0, 0.035, 0], groove);
          }
        }
        // A corner house's second front (`belts`): its belt courses turn the corner too, and the
        // crown and the belts reach back round the corner to the front's projection, closing it
        const ext = f.belts.length ? (CROWN_RETURN[spec.cornice.type] ?? 0) : 0;
        const cw = f.wrap + ext;
        const cwz = f.cornerZ + dir * (f.wrap - ext) * 0.5;
        // 3 mm higher than the front's crown: the two cross at the corner, and their mouldings
        // would otherwise share every soffit and top there
        buildCornice(
          atlas,
          b,
          0,
          h + 0.003,
          cwz,
          cw,
          { ...seg, corniceAxes: [] },
          T[wall.upper.tile],
        );
        for (const y of f.belts) {
          const bz = f.cornerZ + dir * (f.wrap - BELT_RETURN) * 0.5;
          buildBeltCourse(atlas, b, 0, y + 0.003, bz, f.wrap + BELT_RETURN, wall.trim);
        }
      }
      if (f.ironBalcony) {
        const ib = f.ironBalcony;
        buildIronBalcony(atlas, b, {
          x: 0,
          z0: ib.z0,
          z1: ib.z1,
          y: ib.y,
          depth: ib.depth,
          consoles: ib.consoles,
          stone: wall.trim,
        });
      }
      for (const w of f.windows) {
        buildSashWindow(atlas, b, 0, w.z, w.y, w.w, w.h, rng, {
          trim: wall.trim,
          ...w.opts,
          ...roomWindow(w.cell),
        });
      }
      for (const e of f.escapes) {
        buildFireEscape(atlas, b, 0, e.z, e.landings, e.roofY, e.halfW, e.deckY);
      }
      for (const d of f.doors) buildDoorway(atlas, b, pools, { ...d, x: 0, number: null });
      for (const l of f.lamps) {
        if (l.kind === 'dish') buildDishLamp(atlas, b, pools, 0, l.z, l.y);
        else if (l.kind === 'lantern') buildBracketLantern(atlas, b, pools, 0, l.z, l.y);
        else throw new Error(`Lamp kind "${l.kind}" is not in the parts library yet`);
      }
      for (const m of f.meters) buildMeterBox(atlas, b, 0, m.z, m.y);
      for (const p of f.downpipes) buildDownpipe(atlas, b, 0, p.z, p.topY);
    });
    if (f.parapet) {
      buildPartyWall(atlas, b, {
        x,
        depth: plan.depth,
        z: f.z,
        side: f.side,
        below: 0,
        roofLine: null,
        top: h,
        wall: material(T, wall.upper),
        coping: wall.trim,
        mansard: null,
        gable: false,
        ghost: false,
        flues: f.flues,
      });
    }
  }

  // 9. Street furniture of the house (a post office's mailbox at the curb) and whatever fills
  //    the setback in front of it
  if (spec.sidewalk?.mailbox !== undefined) {
    const mz = zA + spec.sidewalk.mailbox;
    buildMailbox(atlas, b, CURB_FURNITURE_X, mz);
    zones.push([mz - 0.4, mz + 0.4]);
  }
  if (spec.sidewalk?.bamboo !== undefined) {
    // A potted bamboo against the wall at a ramen bar's corner
    const bz = zA + spec.sidewalk.bamboo;
    buildBambooPlanter(atlas, b, x - 0.4, bz);
    zones.push([bz - 0.35, bz + 0.35]);
  }
  if (spec.sidewalk?.shelf !== undefined) {
    // A potter's shelf of wares against the wall
    const sz = zA + spec.sidewalk.shelf;
    buildPotteryShelf(atlas, b, { x, z: sz });
    zones.push([sz - 0.8, sz + 0.8]);
  }
  if (spec.site) hooks.site?.(spec.site, plan);
  return zones.map(([z0, z1]) => [z0, z1]);
}
