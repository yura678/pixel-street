/**
 * Street row factory (`BuildingFactory`).
 *
 * Builds the `+X` cutaway street row (`chunkLayout.right` placed along `x = BUILDING_LINE_X`,
 * facing `-X` toward the camera) into merged per-chunk `BufferGeometry` buffers:
 *   1. `solidGeometry`     – every house from its `BuildingSpec` (`src/config/buildings/`,
 *                            planned by `architecture/SpecPlanner.js`, assembled from the shared
 *                            parts in `architecture/`), the alley, the pocket square, the bus
 *                            stops, the sidewalk furniture, the street trees (`StreetTreePlan`,
 *                            `architecture/StreetTrees.js`) and the road details.
 *   2. `lightPoolGeometry` – warm light spilling from windows, lanterns and street lamps.
 *   3. `nearGeometry`      – the near sidewalk (`NearSidewalkPlan`): lamps, bins, bollards, the
 *                            hydrant and the street trees between the camera and the street
 *                            (drawn with the dithered canopy material, `AtlasMaterial`).
 * and as data the chunk's `trees` of both sides (their crowns: where the falling leaves come
 * from) and its `furniture`. Both sidewalks are built by one builder from their plans
 * (`FarSidewalkPlan`, `NearSidewalkPlan`), on the lines of `SidewalkFurniture`.
 */
import * as THREE from 'three/webgpu';
import { LOT_DEPTH } from '../config/constants.js';
import { LEAF_COLORS } from '../config/palettes.js';
import { clamp } from '../core/math.js';
import { Rng } from '../core/random.js';
import { LotType, StreetLayout } from '../simulation/street/StreetLayout.js';
import { MeshBuilder } from './MeshBuilder.js';
import { getBuildingSpec } from '../config/buildings/index.js';
import { buildServiceAlley } from './architecture/Alley.js';
import { buildBusStopKit } from './architecture/Civic.js';
import { buildPocketSquare } from './architecture/Square.js';
import { assembleBuilding } from './architecture/Assembler.js';
import {
  buildBoxHedge,
  buildFlowerBed,
  buildFloweringShrub,
  buildRoundTree,
} from './architecture/Greenery.js';
import { lotRoofLine, lotTop, planBuilding } from './architecture/SpecPlanner.js';
import { buildStreetTree, buildTreePit } from './architecture/StreetTrees.js';
import { tube } from './architecture/primitives.js';
import {
  BRASS_TRIM,
  CHARCOAL_IRON,
  STONE_CORNICE,
  STONE_PLINTH,
  STONE_STEP,
  WHITE,
} from './architecture/palette.js';
import { BUILDING_LINE_X, CURB_H, ROAD_FAR_X } from '../config/streetProfile.js';
import { GRATE_L, GRATE_W, MANHOLE_R, placeRoadFixtures } from './StreetProfileView.js';
import { FURNITURE, curbX } from './SidewalkFurniture.js';
import { farSidewalkOfChunk } from './FarSidewalkPlan.js';
import { nearSidewalkOfChunk } from './NearSidewalkPlan.js';

const SIDEWALK_W = BUILDING_LINE_X - ROAD_FAR_X; // 5.27 m -> curb is at x_local = -5.27

const _color = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };
const _mat = new THREE.Matrix4();

function linearColor(hex, hueShift = 0, satScale = 1, lightOffset = 0) {
  _color.set(hex);
  if (hueShift !== 0 || satScale !== 1 || lightOffset !== 0) {
    _color.getHSL(_hsl);
    const h = (((_hsl.h + hueShift) % 1) + 1) % 1;
    const s = clamp(_hsl.s * satScale, 0, 1);
    const l = clamp(_hsl.l + lightOffset, 0.04, 0.95);
    _color.setHSL(h, s, l);
  }
  return [_color.r, _color.g, _color.b];
}

export class BuildingFactory {
  /** @type {ReturnType<import('../textures/PixelCanvas.js').createFacadeAtlas>} */
  #atlas;

  /**
   * @param {ReturnType<import('../textures/PixelCanvas.js').createFacadeAtlas>} atlas
   */
  constructor(atlas) {
    this.#atlas = atlas;
  }

  /**
   * Builds merged solid and additive light-pool geometries for one cutaway chunk.
   *
   * @param {{ chunkIndex: number, zStart: number, zEnd: number, right: object[] }} chunkLayout
   * @param {import('../core/Store.js').Store} store
   * @param {{ treeGeometry?: boolean }} [opts] `treeGeometry: false` plans the trees (the
   *   sidewalk still makes room for them) but leaves them out of the geometry – for the checks
   *   that their crowns touch nothing else
   * @returns {{ solidGeometry: THREE.BufferGeometry, lightPoolGeometry: THREE.BufferGeometry,
   *   nearGeometry: THREE.BufferGeometry | null, trees: object[],
   *   furniture: Array<{ kind: string, side: 1 | -1, x: number, z: number }> }} `trees` from
   *   the sidewalk plans and `furniture` (bollards, lamps, bins, hydrants, bicycles and their
   *   racks) as built: world X and Z, Y up from the sidewalk
   */
  buildChunk(chunkLayout, store, opts = {}) {
    const solid = new MeshBuilder();
    const pools = new MeshBuilder();
    solid.defaultTile = this.#atlas.tiles.white;

    const seed = store.get('street.seed') ?? 1;
    const satScale = store.get('street.saturation') ?? 0.95;
    const leafHexA = store.get('leaves.colorA') ?? LEAF_COLORS[0];
    const leafHexB = store.get('leaves.colorB') ?? LEAF_COLORS[1];
    const treeDensity = store.get('street.treeDensity') ?? 0.55;
    const styleCtx = {
      satScale,
      leafHexA,
      leafHexB,
      chunkIndex: chunkLayout.chunkIndex,
    };

    const lots = chunkLayout.right;
    const plan = { seed, density: treeDensity };
    const farSide = farSidewalkOfChunk(chunkLayout.chunkIndex, plan);
    const nearSide = nearSidewalkOfChunk(chunkLayout.chunkIndex, plan);
    const furniture = [];

    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      const { prev: prevLot, next: nextLot } = StreetLayout.neighbourLots(chunkLayout, i, store);
      const rng = Rng.fork(seed, chunkLayout.chunkIndex, i, 709);
      const localZ = lot.centerZ - chunkLayout.zStart;

      _mat.makeTranslation(BUILDING_LINE_X, CURB_H, localZ);
      solid.setTransform(_mat);
      pools.setTransform(_mat);

      const doorZones = this.#buildLot(solid, pools, lot, prevLot, nextLot, rng, styleCtx);
      if (lot.hasBicycle) {
        // The lot's street lamp (lot-local), as the plan placed it
        const lz = farSide.lamps.find((z) => z >= lot.zStart && z < lot.zEnd);
        const lamp = lz === undefined ? null : { z: lz - lot.centerZ };
        this.#buildBicycleParking(solid, lot, lamp, doorZones, rng, furniture);
      }
    }

    // The far sidewalk's furniture and street trees
    const withTrees = opts.treeGeometry !== false;
    this.#buildSidewalk(solid, pools, 1, farSide, chunkLayout.zStart, withTrees, furniture);

    const chunkRng = Rng.fork(seed, chunkLayout.chunkIndex, 991);
    _mat.makeTranslation(BUILDING_LINE_X, CURB_H, 10.0);
    solid.setTransform(_mat);
    const fixtureRng = Rng.fork(seed, chunkLayout.chunkIndex, 993);
    const fixtures = placeRoadFixtures(lots, chunkLayout.zStart, fixtureRng);
    this.#buildRoadAndGutterDetails(solid, fixtures, chunkLayout.zStart, chunkRng, styleCtx);

    // The near sidewalk (−X), its own geometry (its crowns are dithered)
    const near = new MeshBuilder();
    near.defaultTile = this.#atlas.tiles.white;
    this.#buildSidewalk(near, pools, -1, nearSide, chunkLayout.zStart, withTrees, furniture);

    solid.setTransform(null);
    pools.setTransform(null);

    return {
      solidGeometry: solid.build(),
      lightPoolGeometry: pools.build(),
      nearGeometry: near.build(),
      trees: [...farSide.trees, ...nearSide.trees],
      furniture,
    };
  }

  /**
   * One sidewalk of a chunk from its plan (`FarSidewalkPlan` / `NearSidewalkPlan`), in the chunk
   * frame (world X, the sidewalk at y = 0): bollards, lamps with their pools of light, litter
   * bins and hydrants on their lines behind the curb (`SidewalkFurniture.FURNITURE`), the street
   * trees in their pits. The same pieces on both sides, mirrored (`side` +1 far, −1 near); the
   * near side's trees between the camera and the street carry the canopy code for dithering.
   * Each piece is recorded in `out` as built.
   */
  #buildSidewalk(b, pools, side, plan, zStart, withTrees, out) {
    _mat.makeTranslation(0, CURB_H, -zStart);
    b.setTransform(_mat);
    pools.setTransform(_mat);
    const at = (kind) => curbX(side, FURNITURE[kind]);
    const record = (kind, z) => out.push({ kind, side, x: at(kind), z });
    for (const z of plan.bollards) {
      this.#buildBollard(b, at('bollard'), z);
      record('bollard', z);
    }
    for (const z of plan.lamps) {
      this.#buildStreetLamp(b, pools, at('lamp'), z, side, curbX(side, 0));
      record('lamp', z);
    }
    for (const z of plan.bins) {
      this.#buildTrashBin(b, at('bin'), z, side);
      record('bin', z);
    }
    for (const z of plan.hydrants) {
      this.#buildFireHydrant(b, at('hydrant'), z, side);
      record('hydrant', z);
    }
    if (withTrees) {
      for (const tree of plan.trees) {
        buildTreePit(this.#atlas, b, tree);
        buildStreetTree(this.#atlas, b, tree, { canopy: side < 0 });
      }
    }
    b.setTransform(null);
    pools.setTransform(null);
  }

  /**
   * Dispatches lot construction and returns an array of `[zMin, zMax]` entrance keep-out zones
   * (in lot-local Z) so sidewalk furniture never blocks doors or stoops.
   */
  #buildLot(b, pools, lot, prevLot, nextLot, rng, styleCtx) {
    const spec = getBuildingSpec(lot.spec);
    if (spec) {
      const zones = this.#buildFromSpec(b, pools, lot, prevLot, nextLot, rng, styleCtx, spec);
      if (lot.type === LotType.BUS_STOP) {
        // A spec house on a bus stop lot (the town hall): the stop stands at the curb in front
        const T = this.#atlas.tiles;
        zones.push(
          ...buildBusStopKit(this.#atlas, b, pools, {
            w: lot.width,
            curbX: -SIDEWALK_W,
            shelter: [-lot.width * 0.5 + 0.25, -lot.width * 0.5 + 2.25],
            flagZ: lot.width * 0.5 - 0.6,
            noticeZ: -lot.width * 0.5 + 0.32,
            poster: T[`poster_${rng.int(0, 2)}`],
            busSign: this.#atlas.signs.get('BUS') ?? T.taxi_sign,
          }),
        );
      }
      return zones;
    }

    switch (lot.type) {
      case LotType.ALLEY:
        this.#buildAlley(b, pools, lot, prevLot, nextLot);
        return [[-lot.width * 0.5, lot.width * 0.5]];
      case LotType.PARK: {
        // Park lots without a house spec are pocket squares, as deep as the shallower of the
        // houses whose flanks line them
        const depths = [prevLot, nextLot].map((l) => getBuildingSpec(l?.spec)?.depth ?? LOT_DEPTH);
        buildPocketSquare(this.#atlas, b, pools, rng, { w: lot.width, depth: Math.min(...depths) });
        return [];
      }
      case LotType.BUS_STOP:
        // The stop in front of № 114's garden: the house spanning into this lot builds itself
        if (lot.backdrop === 'park') return this.#buildParkBusStop(b, lot);
        break;
      default:
        break;
    }
    // Every house on the street is described by a spec; a lot without one is a layout error
    throw new Error(`Lot ${lot.id} (${lot.type}) has no building spec`);
  }

  /**
   * A parked bicycle at its rack in the furnishing strip of a lot that asks for one
   * (`hasBicycle`), clear of the lot's door zones and of its street lamp. Recorded in `out`
   * (world Z) with its rack.
   */
  #buildBicycleParking(b, lot, lamp, doorZones, rng, out) {
    const isBlockedZ = (z, pad) => doorZones.some(([a, c]) => z >= a - pad && z <= c + pad);
    const candidates = [0.24, -0.34, 0.72, -0.78, 0.0];
    let bikeZ = 0.0;
    for (let i = 0; i < candidates.length; i++) {
      const cz = candidates[i];
      if (
        Math.abs(cz) <= lot.width * 0.36 &&
        !isBlockedZ(cz, 0.78) &&
        (!lamp || Math.abs(cz - lamp.z) > 1.15)
      ) {
        bikeZ = cz;
        break;
      }
    }
    const bikeX = -SIDEWALK_W + FURNITURE.bike;
    const rackX = -SIDEWALK_W + FURNITURE.rack;
    this.#buildBikeRack(b, rackX, bikeZ);
    this.#buildBicycle(b, bikeX, bikeZ, lot.bicycleVariant ?? 0, rng);
    out.push({ kind: 'rack', side: 1, x: curbX(1, FURNITURE.rack), z: lot.centerZ + bikeZ });
    out.push({ kind: 'bike', side: 1, x: curbX(1, FURNITURE.bike), z: lot.centerZ + bikeZ });
  }

  // =========================================================================
  // 3. Purposeful Cobblestone Alleyway, Pocket Park & Bus Stop Shelter
  // =========================================================================

  /**
   * The service alley – paving, the courtyard wall with its gate, bins and festoon lights –
   * from `architecture/Alley.js`, as deep as the houses either side (their flank facades face
   * it). The dropped curb at its mouth belongs to the street profile (`StreetProfileView`).
   */
  #buildAlley(b, pools, lot, prevLot, nextLot) {
    const w = lot.width;
    const depth = Math.max(
      getBuildingSpec(prevLot?.spec)?.depth ?? 0,
      getBuildingSpec(nextLot?.spec)?.depth ?? 0,
    );
    buildServiceAlley(this.#atlas, b, pools, { w, depth: depth || LOT_DEPTH });
  }

  /**
   * A house described by a `BuildingSpec` (`src/config/buildings/`): planned by `SpecPlanner`,
   * assembled from the shared parts in `architecture/`.
   * Returns the entrance keep-out zones for the sidewalk furniture.
   */
  #buildFromSpec(b, pools, lot, prevLot, nextLot, rng, styleCtx, spec) {
    if (spec.builder) throw new Error(`Unknown bespoke builder "${spec.builder}"`);
    // The neighbour on the right of a house spanning two lots stands after the second one
    const after = spec.extendsInto === 'next' ? null : nextLot;
    const plan = planBuilding(spec, lot, nextLot, {
      prevTop: lotTop(prevLot),
      nextTop: lotTop(after),
      prevRoof: lotRoofLine(prevLot),
      nextRoof: lotRoofLine(after),
    });
    const zones = assembleBuilding(this.#atlas, b, pools, plan, rng, {
      site: (site, p) => this.#buildSite(b, pools, site, p, rng, styleCtx),
    });
    return plan.facadeX < 1 ? zones : [];
  }

  /**
   * Fills the setback in front of a spec house. `gardenAndTerrace` (№ 114): a communal garden
   * left of the entrance path, the paved path to the stoop, the shop's terrace right of it.
   */
  #buildSite(b, pools, site, plan, rng, styleCtx) {
    if (site.kind !== 'gardenAndTerrace') throw new Error(`Unknown site kind "${site.kind}"`);
    const shop = plan.shops[0];
    // The path's hedges stop short of the stoop at the door
    const stoop = plan.entrances.find((e) => e.stoop)?.stoop;
    const stoopReach = stoop ? (stoop.landing ?? 0.6) + (stoop.steps - 1) * (stoop.run ?? 0.28) : 0.9;
    this.#buildParkGarden(b, pools, plan.facadeX, rng, styleCtx, {
      stoopReach,
      z0: plan.zA,
      z1: plan.zC - site.pathHalfW,
      gateZ: plan.zC,
      gateW: site.gateW,
      terraceZ0: plan.zC + site.pathHalfW,
      terraceZ1: plan.zB,
      shopZ0: shop.z0,
      shopZ1: shop.z1,
    });
  }

  /**
   * Front of the apartment house: a communal garden (left of the entrance path) behind a
   * brick-and-iron railing, the paved entrance path from the gate to the stoop between low
   * box hedges, and the bakery's paved terrace (right) open to the sidewalk.
   */
  #buildParkGarden(b, pools, facadeX, rng, styleCtx, o) {
    const T = this.#atlas.tiles;
    const baseY = 0.22;
    const g0 = o.gateZ - o.gateW * 0.5;
    const plinth = (z0, z1, top) =>
      b.box((facadeX + 0.15) * 0.5, 0, (z0 + z1) * 0.5, facadeX - 0.15, baseY, z1 - z0 - 0.02, {
        tile: T.wall_stone,
        color: STONE_STEP,
        texScale: 0.9,
        faces: { ny: false, py: top },
      });

    // Ground: lawn, entrance path, terrace paving
    plinth(o.z0, o.z1, {
      tile: T.grass,
      color: WHITE,
      rep: [Math.round(facadeX / 1.6), Math.max(3, Math.round((o.z1 - o.z0) / 1.6))],
    });
    plinth(o.z1, o.terraceZ0, { tile: T.cobble, color: [0.71, 0.66, 0.56], rep: [Math.round(facadeX / 0.9), 2] });
    plinth(o.terraceZ0, o.terraceZ1, {
      tile: T.cobble,
      color: [0.66, 0.6, 0.52],
      rep: [Math.round(facadeX / 0.9), Math.round((o.terraceZ1 - o.terraceZ0) / 0.9)],
    });
    // Step down from the path and terrace to the sidewalk
    b.box(-0.1, 0, (g0 + o.terraceZ1) * 0.5, 0.3, 0.11, o.terraceZ1 - g0 - 0.04, {
      tile: T.wall_stone,
      color: STONE_CORNICE,
      texScale: 0.9,
    });

    // Railing with brick piers along the garden; gate piers at the path
    this.#buildParkFence(b, o.z0 + 0.02, g0 - 0.2, rng);
    this.#buildParkGate(b, o.gateZ, o.gateW);
    for (const pz of [o.z0 + 0.2, o.z0 + 3.1, o.z0 + 6.0]) this.#buildFencePier(b, pz);

    // Low box hedges along both sides of the entrance path, up to the foot of the stoop
    const hedgeEnd = facadeX - o.stoopReach - 0.12;
    for (const ez of [o.z1 + 0.16, o.terraceZ0 - 0.16]) {
      buildBoxHedge(this.#atlas, b, (0.9 + hedgeEnd) * 0.5, baseY, ez, hedgeEnd - 0.9, 0.42, 0.26, rng);
    }

    // Garden planting: hydrangea border, flower bed under the ground-floor windows, shrubs
    for (let z = o.z0 + 0.5; z <= g0 - 0.55; z += 0.7) {
      const big = rng.chance(0.5);
      buildFloweringShrub(this.#atlas, b, 0.68, baseY, z, big ? 0.48 : 0.4, big ? 0.88 : 0.72, 0.4, rng);
    }
    buildFlowerBed(this.#atlas, b, facadeX - 0.4, baseY, o.z0 + 0.3, o.z1 - 0.3, rng);
    for (const [sx, sz, r, hgt] of [
      [4.8, o.z0 + 0.8, 0.55, 1.05],
      [1.7, o.z0 + 2.1, 0.45, 0.85],
      [4.7, o.z0 + 6.6, 0.5, 0.95],
      [3.6, o.z1 - 0.7, 0.42, 0.8],
    ]) {
      buildFloweringShrub(this.#atlas, b, sx, baseY, sz, r, hgt, r * 0.92, rng);
    }
    buildRoundTree(this.#atlas, b, 3.0, o.z0 + 3.45, rng, baseY, 1.62);
    buildRoundTree(this.#atlas, b, 2.2, o.z0 + 7.0, rng, baseY, 1.3, { blossom: true });
    this.#buildParkBench(b, 4.15, o.z0 + 5.0, 1.75, baseY);
    this.#buildBirdhouse(b, 1.75, baseY, o.z0 + 8.2);
    this.#buildGardenLamp(b, pools, 0.62, g0 - 0.45);
    this.#buildTrashBin(b, -0.32, g0 - 1.1);

    // Bakery terrace: three café tables, planter boxes at the front corners, menu board
    const tz0 = Math.max(o.terraceZ0, o.shopZ0) + 0.8;
    const tz1 = o.terraceZ1 - 0.9;
    for (let i = 0; i < 3; i++) {
      const z = tz0 + ((tz1 - tz0) * i) / 2;
      this.#buildCafeSet(b, i % 2 ? 3.1 : 2.2, z, baseY);
    }
    for (const pz of [o.terraceZ0 + 0.45, o.terraceZ1 - 0.45]) {
      b.box(0.55, baseY, pz, 0.6, 0.42, 0.6, { tile: T.wood, color: [0.36, 0.25, 0.16], texScale: 0.5 });
      buildBoxHedge(this.#atlas, b, 0.55, baseY + 0.42, pz, 0.55, 0.38, 0.5, rng);
    }
    this.#buildChalkboardSign(b, -0.55, o.terraceZ0 + 1.4);
  }

  /** Café table (cast-iron pedestal, marble top, a cup) with two bistro chairs. */
  #buildCafeSet(b, cx, cz, baseY) {
    const T = this.#atlas.tiles;
    const iron = { tile: T.metal, color: CHARCOAL_IRON };
    const seat = { tile: T.wood, color: [0.55, 0.36, 0.2], texScale: 0.4 };
    b.cylinderY(cx, baseY, cz, 0.2, 0.08, 0.05, 8, iron);
    b.cylinderY(cx, baseY + 0.05, cz, 0.03, 0.03, 0.66, 6, iron);
    b.cylinderY(cx, baseY + 0.71, cz, 0.3, 0.3, 0.035, 12, iron, { tile: T.white, color: [0.92, 0.9, 0.86] });
    b.cylinderY(cx + 0.06, baseY + 0.745, cz - 0.05, 0.04, 0.045, 0.06, 6, { tile: T.white, color: [0.96, 0.95, 0.92] });
    for (const s of [-1, 1]) {
      const z = cz + s * 0.56;
      for (const [lx, lz] of [
        [-0.15, -0.15],
        [0.15, -0.15],
        [-0.15, 0.15],
        [0.15, 0.15],
      ]) {
        b.box(cx + lx, baseY, z + lz, 0.025, 0.44, 0.025, iron);
      }
      b.box(cx, baseY + 0.44, z, 0.38, 0.04, 0.38, seat);
      b.box(cx, baseY + 0.48, z + s * 0.17, 0.36, 0.38, 0.03, seat);
    }
  }

  /**
   * Street-edge iron fence: low pale stone curb carrying thin open pickets with
   * slender intermediate posts. Brick piers are reserved for the gate so the
   * railing reads as the light wrought-iron line in the reference, not a wall.
   */
  #buildParkFence(b, z0, z1, _rng) {
    if (z1 - z0 < 0.4) return;
    const T = this.#atlas.tiles;
    const iron = { tile: T.balcony_iron, color: WHITE };
    const len = z1 - z0;
    const cz = (z0 + z1) * 0.5;

    // Low stone curb + coping (the curb and rails stop inside the piers at the ends)
    b.box(0.21, 0, cz, 0.26, 0.16, len - 0.006, {
      tile: T.wall_stone,
      color: STONE_PLINTH,
      texScale: 1.2,
    });
    b.box(0.21, 0.16, cz, 0.3, 0.045, len + 0.01, {
      tile: T.wall_stone,
      color: STONE_CORNICE,
    });

    // Bottom / top rails and open pickets
    b.box(0.21, 0.225, cz, 0.035, 0.035, len - 0.006, iron);
    b.box(0.21, 0.86, cz, 0.045, 0.045, len - 0.006, iron);
    const pickets = Math.max(4, Math.round(len / 0.145));
    for (let i = 0; i <= pickets; i++) {
      const z = z0 + (len * i) / pickets;
      b.box(0.21, 0.543, z, 0.02, 0.635, 0.02, iron);
    }
  }

  /** Square red-brick fence pier with a flat pale-stone cap. */
  #buildFencePier(b, z, height = 1.0) {
    const T = this.#atlas.tiles;
    b.box(0.21, 0, z, 0.36, height, 0.36, {
      tile: T.wall_brick,
      color: [0.58, 0.3, 0.2],
      texScale: 1.2,
    });
    b.box(0.21, height, z, 0.46, 0.055, 0.46, {
      tile: T.wall_stone,
      color: STONE_CORNICE,
    });
    b.box(0.21, height + 0.055, z, 0.34, 0.045, 0.34, {
      tile: T.wall_stone,
      color: STONE_CORNICE,
    });
  }

  /** Paired brick gate piers with stone caps and a low open iron gate. */
  #buildParkGate(b, gateZ, gateW) {
    const T = this.#atlas.tiles;
    const iron = { tile: T.balcony_iron, color: WHITE };
    const brick = { tile: T.wall_brick, color: [0.58, 0.3, 0.2], texScale: 1.2 };
    const z0 = gateZ - gateW * 0.5;
    const z1 = gateZ + gateW * 0.5;

    for (const pz of [z0, z1]) {
      b.box(0.21, 0, pz, 0.4, 1.18, 0.4, brick);
      b.box(0.21, 1.18, pz, 0.52, 0.08, 0.52, {
        tile: T.wall_stone,
        color: STONE_CORNICE,
      });
      b.box(0.21, 1.26, pz, 0.4, 0.06, 0.4, {
        tile: T.wall_stone,
        color: STONE_CORNICE,
      });
      b.cylinderY(0.21, 1.32, pz, 0.15, 0.1, 0.07, 8, {
        tile: T.wall_stone,
        color: STONE_CORNICE,
      });
    }

    // Closed twin iron gate leaves between the piers.
    b.box(0.21, 0.34, gateZ, 0.03, 0.04, gateW - 0.42, iron);
    b.box(0.21, 0.68, gateZ, 0.03, 0.03, gateW - 0.42, iron);
    b.box(0.21, 1.0, gateZ, 0.035, 0.05, gateW - 0.42, iron);
    const bars = Math.max(5, Math.round((gateW - 0.42) / 0.13));
    for (let i = 0; i <= bars; i++) {
      const z = z0 + 0.21 + ((gateW - 0.42) * i) / bars;
      b.box(0.21, 0.67, z, 0.028, 0.66, 0.028, iron);
    }
  }

  /** Little timber birdhouse on a post, with a pitched roof and a round entrance hole. */
  #buildBirdhouse(b, cx, baseY, cz) {
    const T = this.#atlas.tiles;
    const wood = { tile: T.wood, color: [0.5, 0.33, 0.2] };
    b.box(cx, baseY, cz, 0.07, 1.25, 0.07, wood);
    b.box(cx, baseY + 1.25, cz, 0.26, 0.28, 0.3, wood);
    b.gableZ(
      cx - 0.19,
      cx + 0.19,
      baseY + 1.53,
      cz - 0.21,
      cz + 0.21,
      0.17,
      { tile: T.roof_tiles, color: [0.42, 0.24, 0.18], texScale: 0.4 },
      { tile: T.wood, color: [0.5, 0.33, 0.2], texScale: 0.4 },
    );
    b.cylinderX(cx - 0.135, baseY + 1.42, cz, 0.045, 0.012, 8, {
      tile: T.white,
      color: [0.08, 0.07, 0.06],
    });
    b.box(cx - 0.17, baseY + 1.32, cz, 0.08, 0.02, 0.02, wood);
  }

  /** Low timber park bench with slatted back, armrests and cast-iron end frames. */
  #buildParkBench(b, cx, cz, lengthZ, baseY = 0) {
    const T = this.#atlas.tiles;
    const wood = [0.58, 0.37, 0.2];
    const iron = { tile: T.balcony_iron, color: WHITE };
    const seatY = baseY + 0.43;

    // Seat boards run the full length of the bench.
    for (const sx of [-0.15, 0, 0.15]) {
      b.box(cx + sx, seatY, cz, 0.13, 0.045, lengthZ, {
        tile: T.wood,
        color: wood,
        texScale: 0.9,
      });
    }

    // Slatted back on the house side, so the bench faces the street.
    for (let i = 0; i < 3; i++) {
      b.box(cx + 0.27, seatY + 0.11 + i * 0.14, cz, 0.045, 0.085, lengthZ - 0.05, {
        tile: T.wood,
        color: wood,
        texScale: 0.9,
      });
    }
    b.box(cx + 0.3, seatY + 0.47, cz, 0.06, 0.05, lengthZ, {
      tile: T.wood,
      color: wood,
      texScale: 0.9,
    });

    // Cast-iron end frames: legs, seat rails, back posts and armrests.
    const legSpan = lengthZ * 0.5 - 0.13;
    for (const sz of [-1, 1]) {
      const lz = cz + sz * legSpan;
      b.box(cx - 0.19, baseY + 0.19, lz, 0.05, 0.4, 0.05, iron);
      b.box(cx + 0.17, baseY + 0.19, lz, 0.05, 0.4, 0.05, iron);
      b.box(cx, baseY + 0.4, lz, 0.46, 0.045, 0.05, iron);
      b.box(cx + 0.3, baseY + 0.62, lz, 0.05, 0.52, 0.05, iron);
      b.box(cx + 0.02, baseY + 0.6, lz, 0.58, 0.04, 0.045, iron);
    }
  }

  /** Classic park lamp: cast-iron post, glazed lantern head and warm ground pool. */
  #buildGardenLamp(b, pools, cx, cz) {
    const T = this.#atlas.tiles;
    const iron = { tile: T.balcony_iron, color: WHITE };
    b.cylinderY(cx, 0.22, cz, 0.15, 0.11, 0.22, 8, iron);
    b.cylinderY(cx, 0.42, cz, 0.05, 0.038, 2.0, 8, iron);
    // Square lantern cage with a pyramidal cap and a warm glowing core.
    b.box(cx, 2.42, cz, 0.36, 0.05, 0.36, iron);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.box(cx + sx * 0.12, 2.56, cz + sz * 0.12, 0.035, 0.24, 0.035, iron);
      }
    }
    b.box(cx, 2.56, cz, 0.2, 0.22, 0.2, {
      tile: T.bulb,
      color: WHITE,
      data: [2.5, 0],
    });
    b.box(cx, 2.69, cz, 0.28, 0.05, 0.28, iron);
    b.cylinderY(cx, 2.72, cz, 0.18, 0.02, 0.13, 8, iron);
    b.cylinderY(cx, 2.85, cz, 0.018, 0.012, 0.08, 6, iron);
    pools.quad([cx - 1.1, 0.232, cz - 1.1], [2.2, 0, 0], [0, 0, 2.2], {
      color: [0.8, 0.55, 0.22],
      data: [-1.0, 0],
    });
  }

  /**
   * Bus Stop #1 in front of № 114. The apartment house, its garden and the bakery terrace
   * behind this lot are built from the house's spec (it spans both lots); this lot only adds
   * the curbside furniture: the BUS flag pole, the yellow bus-bay stripe and a litter bin.
   */
  #buildParkBusStop(b, lot) {
    const T = this.#atlas.tiles;
    const w = lot.width; // 7.2 m
    const poleX = -SIDEWALK_W + 0.38;
    const signZ = 0.6;
    b.cylinderY(poleX, -0.02, signZ, 0.038, 0.032, 2.85, 8, { tile: T.metal, color: CHARCOAL_IRON });
    const busSignTile = this.#atlas.signs.get('BUS') ?? T.taxi_sign;
    b.box(poleX, 2.48, signZ, 0.06, 0.26, 0.64, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: {
        nx: { tile: busSignTile, color: WHITE, rep: [1, 1], data: [2.5, 0] },
        px: { tile: busSignTile, color: WHITE, rep: [1, 1], data: [2.5, 0] },
      },
    });
    b.quad([-SIDEWALK_W + 0.02, 0.018, signZ], [0.2, 0, 0], [0, 0, -4.2], {
      tile: T.white,
      color: [0.88, 0.65, 0.18],
    });
    this.#buildTrashBin(b, -SIDEWALK_W + 0.42, w * 0.5 - 0.55);
    return [[-w * 0.45, w * 0.45]];
  }

  /** Wooden A-frame sidewalk chalkboard menu sign (`T.chalkboard`). */
  #buildChalkboardSign(b, cx, cz) {
    const T = this.#atlas.tiles;
    const h = 0.74;
    const w = 0.48;
    const spread = 0.18;
    b.prism(
      [cx - spread, -0.02, cz + w * 0.5],
      [cx + spread, -0.02, cz + w * 0.5],
      [cx + spread, -0.02, cz - w * 0.5],
      [cx - spread, -0.02, cz - w * 0.5],
      [cx - 0.03, h, cz + w * 0.5],
      [cx + 0.03, h, cz + w * 0.5],
      [cx + 0.03, h, cz - w * 0.5],
      [cx - 0.03, h, cz - w * 0.5],
      {
        tile: T.wood,
        color: WHITE,
        faces: {
          ny: false,
          nx: { tile: T.chalkboard, color: WHITE, rep: [1, 1] },
          px: { tile: T.chalkboard, color: WHITE, rep: [1, 1] },
        },
      },
    );
  }

  /**
   * Classic cast-iron curbside Fire Hydrant (red body, silver dome & side hose nozzles); the
   * pumper nozzle faces the road (`side` +1 far sidewalk, −1 near).
   */
  #buildFireHydrant(b, cx, cz, side = 1) {
    const T = this.#atlas.tiles;
    const red = { tile: T.metal, color: [0.68, 0.16, 0.15] };
    const cap = { tile: T.metal, color: [0.76, 0.78, 0.82] };
    b.cylinderY(cx, -0.02, cz, 0.13, 0.12, 0.1, 8, { tile: T.metal, color: CHARCOAL_IRON });
    b.cylinderY(cx, 0.08, cz, 0.1, 0.095, 0.44, 8, red);
    b.cylinderY(cx, 0.52, cz, 0.115, 0.06, 0.14, 8, cap);
    // Side hose nozzle caps
    b.box(cx, 0.34, cz, 0.08, 0.08, 0.29, cap);
    b.box(cx - side * 0.08, 0.33, cz, 0.12, 0.1, 0.1, cap);
  }

  /**
   * Slatted cast-iron & timber city litter bin with domed rain hood; its pedal faces away from
   * the road (`side` +1 far sidewalk, −1 near).
   */
  #buildTrashBin(b, cx, cz, side = 1) {
    const T = this.#atlas.tiles;
    b.cylinderY(cx, -0.02, cz, 0.18, 0.2, 0.58, 8, {
      tile: T.wood,
      color: [0.34, 0.42, 0.36],
    });
    b.cylinderY(cx, 0.54, cz, 0.21, 0.21, 0.06, 8, { tile: T.metal, color: CHARCOAL_IRON });
    b.cylinderY(cx, 0.68, cz, 0.2, 0.08, 0.1, 8, { tile: T.metal, color: CHARCOAL_IRON });
    b.box(cx + side * 0.15, 0.58, cz, 0.05, 0.12, 0.08, { tile: T.metal, color: CHARCOAL_IRON });
  }

  /** Cast-iron curbside bollard with embedded base collar & domed cap. */
  #buildBollard(b, cx, cz) {
    const T = this.#atlas.tiles;
    const iron = { tile: T.metal, color: CHARCOAL_IRON };
    b.cylinderY(cx, -0.02, cz, 0.092, 0.084, 0.11, 8, iron);
    b.cylinderY(cx, 0.09, cz, 0.068, 0.064, 0.65, 8, iron);
    b.cylinderY(cx, 0.74, cz, 0.074, 0.036, 0.06, 8, {
      tile: T.metal,
      color: [0.24, 0.26, 0.3],
    });
  }

  /**
   * Manhole cover in a lane and a storm-drain grate in each gutter (where they sit:
   * `placeRoadFixtures`), scattered leaves. Drawn in the chunk frame: building line at x = 0,
   * sidewalk level at y = 0, chunk middle at z = 0.
   */
  #buildRoadAndGutterDetails(b, fixtures, chunkZStart, rng, styleCtx) {
    const T = this.#atlas.tiles;
    const yRoad = -CURB_H + 0.014;
    const toX = (x) => x - BUILDING_LINE_X;
    const toZ = (z) => z - chunkZStart - 10.0;
    const { grates, manhole } = fixtures;

    if (manhole) {
      // A square patch of newer, lighter asphalt round the frame, where the road was cut to
      // set it: square, so the cover never reads as a round puddle
      const patch = MANHOLE_R + 0.22;
      b.box(toX(manhole.x), yRoad - 0.006, toZ(manhole.z), patch * 2, 0.012, patch * 2, {
        tile: T.white,
        color: [0.36, 0.36, 0.37],
      });
      b.cylinderY(
        toX(manhole.x),
        yRoad,
        toZ(manhole.z),
        MANHOLE_R,
        MANHOLE_R,
        0.016,
        14,
        { tile: T.metal, color: [0.3, 0.3, 0.31] },
        { tile: T.manhole, color: WHITE },
      );
    }

    // Grates lie in the concrete gutters, 6 mm above them (tracks 8 mm, water 15 mm)
    for (const g of grates) {
      const x0 = toX(g.x) - GRATE_W * 0.5;
      b.quad([x0, -CURB_H + 0.006, toZ(g.z) + GRATE_L * 0.5], [GRATE_W, 0, 0], [0, 0, -GRATE_L], {
        tile: T.grate,
        color: WHITE,
        rep: [1, 2],
      });
    }

    const leafColA = linearColor(styleCtx.leafHexA, 0, 0.95);
    const leafColB = linearColor(styleCtx.leafHexB, 0, 0.95);
    for (let i = 0; i < 12; i++) {
      const onSidewalk = rng.chance(0.4);
      const lx = onSidewalk
        ? rng.range(-SIDEWALK_W + 0.25, -0.25)
        : rng.range(-SIDEWALK_W - 2.4, -SIDEWALK_W - 0.12);
      const ly = onSidewalk ? 0.018 : yRoad + 0.006;
      const lz = rng.range(-9.4, 9.4);
      const isPaper = rng.chance(0.14);
      const sz = isPaper ? rng.range(0.11, 0.16) : rng.range(0.08, 0.13);
      const ang = rng.range(0, Math.PI * 2);
      const ux = Math.cos(ang) * sz;
      const uz = Math.sin(ang) * sz;
      const vx = -Math.sin(ang) * sz * 0.72;
      const vz = Math.cos(ang) * sz * 0.72;

      b.quad([lx, ly, lz], [ux, 0, uz], [-vx, 0, -vz], {
        tile: T.white,
        color: isPaper ? [0.82, 0.78, 0.68] : rng.chance(0.5) ? leafColA : leafColB,
      });
    }
  }

  // =========================================================================
  // 5. Bicycles
  // =========================================================================

  /**
   * Cast-iron inverted-U sidewalk bicycle parking hoop anchored with round base flanges.
   */
  #buildBikeRack(b, cx, cz) {
    const T = this.#atlas.tiles;
    const iron = { tile: T.metal, color: CHARCOAL_IRON };
    const halfSpan = 0.34;
    const legH = 0.62;
    const rTube = 0.021;

    for (const sz of [-1, 1]) {
      const pz = cz + sz * halfSpan;
      b.cylinderY(cx, -0.005, pz, 0.052, 0.048, 0.022, 8, iron);
      b.cylinderY(cx, 0.015, pz, rTube, rTube, legH, 8, iron);
    }
    // Smooth arched top hoop + mid security crossbar
    const archSegs = 8;
    for (let i = 0; i < archSegs; i++) {
      const a0 = (i / archSegs) * Math.PI;
      const a1 = ((i + 1) / archSegs) * Math.PI;
      tube(
        b,
        cx,
        legH + Math.sin(a0) * 0.14,
        cz - Math.cos(a0) * halfSpan,
        cx,
        legH + Math.sin(a1) * 0.14,
        cz - Math.cos(a1) * halfSpan,
        rTube,
        rTube,
        7,
        iron,
      );
    }
    tube(b, cx, 0.38, cz - halfSpan, cx, 0.38, cz + halfSpan, 0.014, 0.014, 6, iron);
  }

  /**
   * High-Detail Miniature European City Bicycle (`media_1794002957188_4ab2788b.mp4` & `00:07`):
   *   - 24-segment gumwall tyres + polished double-wall alloy rims + flanged hubs + 12 crossed spokes/wheel
   *   - Sculpted sheet-metal front AND rear arched fenders on chrome wire V-stays + ruby rear reflector
   *   - Right-hand (`-X` camera-facing) alloy chainring, rear cog, roller chain, chainguard, cranks & pedals
   *   - Lugged diamond (`variant = 0`) or twin-tube step-through (`variant = 1`) frame, fork crown & bottle dynamo
   *   - Quill stem, North-Road handlebars, brake levers, brass bell, bullet headlamp, sprung leather saddle,
   *     chrome rear carrier rack & strapped wicker/canvas parcel basket
   */
  #buildBicycle(b, cx, cz, variant = 0, _rng = null) {
    const T = this.#atlas.tiles;
    const dir = 1; // Parked facing +Z with traffic so right-hand drive (`-X`) faces the camera
    const rW = 0.325;
    const wy = rW;
    const zFront = cz + dir * 0.54;
    const zRear = cz - dir * 0.54;

    const framePaint =
      variant === 0
        ? { tile: T.metal, color: [0.82, 0.17, 0.12] } // Classic vermilion roadster (Café/Bakery)
        : { tile: T.metal, color: [0.72, 0.16, 0.18] }; // Deep heritage carmine step-through (Bookshop/Florist)
    const chrome = { tile: T.metal, color: [0.86, 0.89, 0.93] };
    const darkSteel = { tile: T.metal, color: [0.18, 0.2, 0.23] };
    const tireOpt = { tile: T.white, color: [0.09, 0.1, 0.12] };
    const gumwallOpt = { tile: T.white, color: [0.8, 0.72, 0.56] };
    const leatherOpt = { tile: T.wood, color: [0.42, 0.23, 0.12] };
    const strapOpt = { tile: T.white, color: [0.24, 0.13, 0.07] };
    const wickerOpt = { tile: T.wood, color: [0.84, 0.67, 0.42] };
    const brassOpt = { tile: T.white, color: BRASS_TRIM };

    // 1. High-resolution 24-segment gumwall tyres, polished alloy rims, flanged hubs & 12 crossed spokes
    const rOuter = rW;
    const rGum = rW - 0.025;
    const rRim = rW - 0.044;
    const hwTire = 0.02;
    const hwRim = 0.016;
    for (const wz of [zFront, zRear]) {
      const segs = 24;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0);
        const s0 = Math.sin(a0);
        const c1 = Math.cos(a1);
        const s1 = Math.sin(a1);

        const y0o = wy + c0 * rOuter;
        const z0o = wz + s0 * rOuter;
        const y1o = wy + c1 * rOuter;
        const z1o = wz + s1 * rOuter;

        const y0g = wy + c0 * rGum;
        const z0g = wz + s0 * rGum;
        const y1g = wy + c1 * rGum;
        const z1g = wz + s1 * rGum;

        const y0i = wy + c0 * rRim;
        const z0i = wz + s0 * rRim;
        const y1i = wy + c1 * rRim;
        const z1i = wz + s1 * rRim;

        // Vulcanized black outer tread + black tread shoulder
        b.quad4([cx - hwTire, y0o, z0o], [cx - hwTire, y1o, z1o], [cx + hwTire, y1o, z1o], [cx + hwTire, y0o, z0o], tireOpt);
        b.quad4([cx - hwTire, y0g, z0g], [cx - hwTire, y1g, z1g], [cx - hwTire, y1o, z1o], [cx - hwTire, y0o, z0o], tireOpt);
        b.quad4([cx + hwTire, y0o, z0o], [cx + hwTire, y1o, z1o], [cx + hwTire, y1g, z1g], [cx + hwTire, y0g, z0g], tireOpt);

        // Cream gumwall + polished silver alloy rim braking track + inner rim bed
        b.quad4([cx - hwRim, y0i, z0i], [cx - hwRim, y1i, z1i], [cx - hwTire, y1g, z1g], [cx - hwTire, y0g, z0g], i % 2 === 0 ? gumwallOpt : chrome);
        b.quad4([cx + hwTire, y0g, z0g], [cx + hwTire, y1g, z1g], [cx + hwRim, y1i, z1i], [cx + hwRim, y0i, z0i], i % 2 === 0 ? gumwallOpt : chrome);
        b.quad4([cx + hwRim, y0i, z0i], [cx + hwRim, y1i, z1i], [cx - hwRim, y1i, z1i], [cx - hwRim, y0i, z0i], chrome);
      }

      // Machined hub shell, left/right spoke flanges, axle nuts & brass Presta valve stem
      b.cylinderX(cx, wy, wz, 0.022, 0.068, 8, chrome);
      b.cylinderX(cx - 0.022, wy, wz, 0.035, 0.006, 8, chrome);
      b.cylinderX(cx + 0.022, wy, wz, 0.035, 0.006, 8, chrome);
      b.cylinderX(cx, wy, wz, 0.011, 0.092, 6, darkSteel);
      tube(b, cx, wy - rRim, wz, cx, wy - rRim + 0.026, wz, 0.0035, 0.003, 4, brassOpt);

      // 12 tangent-crossed chrome wire spokes (6 per hub flange)
      const spokes = 12;
      for (let s = 0; s < spokes; s++) {
        const flangeX = s % 2 === 0 ? cx - 0.022 : cx + 0.022;
        const aHub = (s / spokes) * Math.PI * 2 + 0.15;
        const crossOffset = s % 4 < 2 ? 0.44 : -0.44;
        const aRim = aHub + crossOffset;
        tube(
          b,
          flangeX,
          wy + Math.cos(aHub) * 0.031,
          wz + Math.sin(aHub) * 0.031,
          cx,
          wy + Math.cos(aRim) * rRim,
          wz + Math.sin(aRim) * rRim,
          0.0032,
          0.0028,
          4,
          chrome,
        );
      }
    }

    // 2. Sculpted arched sheet-metal fenders over BOTH rear and front wheels + chrome wire V-stays
    const buildFender = (wz, aStart, aEnd, segCount, signZ) => {
      const rIn = rW + 0.015;
      const rOut = rW + 0.024;
      const hwF = 0.026;
      for (let i = 0; i < segCount; i++) {
        const a0 = aStart + (i / segCount) * (aEnd - aStart);
        const a1 = aStart + ((i + 1) / segCount) * (aEnd - aStart);
        const y0i = wy + Math.sin(a0) * rIn;
        const z0i = wz + signZ * Math.cos(a0) * rIn;
        const y1i = wy + Math.sin(a1) * rIn;
        const z1i = wz + signZ * Math.cos(a1) * rIn;
        const y0o = wy + Math.sin(a0) * rOut;
        const z0o = wz + signZ * Math.cos(a0) * rOut;
        const y1o = wy + Math.sin(a1) * rOut;
        const z1o = wz + signZ * Math.cos(a1) * rOut;

        b.quad4([cx - hwF, y0o, z0o], [cx - hwF, y1o, z1o], [cx + hwF, y1o, z1o], [cx + hwF, y0o, z0o], framePaint);
        b.quad4([cx + hwF, y0i, z0i], [cx + hwF, y1i, z1i], [cx - hwF, y1i, z1i], [cx - hwF, y0i, z0i], darkSteel);
        b.quad4([cx - hwF, y0i, z0i], [cx - hwF, y1i, z1i], [cx - hwF, y1o, z1o], [cx - hwF, y0o, z0o], framePaint);
        b.quad4([cx + hwF, y0o, z0o], [cx + hwF, y1o, z1o], [cx + hwF, y1i, z1i], [cx + hwF, y0i, z0i], framePaint);
      }
      // Twin chrome wire fender V-stays anchored to wheel hub axle
      for (const frac of [0.18, 0.56]) {
        const af = aStart + frac * (aEnd - aStart);
        const fy = wy + Math.sin(af) * rIn;
        const fz = wz + signZ * Math.cos(af) * rIn;
        for (const sx of [-1, 1]) {
          tube(b, cx + sx * 0.034, wy, wz, cx + sx * hwF, fy, fz, 0.0034, 0.003, 4, chrome);
        }
      }
    };

    buildFender(zRear, -0.22, 2.26, 12, -dir);
    buildFender(zFront, 0.34, 2.18, 10, -dir);

    // Ruby-red rear fender reflector jewel in chrome bezel
    const refAngle = 0.22;
    const refY = wy + Math.sin(refAngle) * (rW + 0.028);
    const refZ = zRear - dir * Math.cos(refAngle) * (rW + 0.028);
    b.box(cx, refY - 0.014, refZ - dir * 0.008, 0.028, 0.032, 0.016, chrome);
    b.box(cx, refY - 0.01, refZ - dir * 0.015, 0.022, 0.024, 0.008, {
      tile: T.bulb,
      color: [0.95, 0.14, 0.14],
      data: [1.5, 0],
    });

    // 3. Lugged tubular frame, fork crown, bottle dynamo & kickstand
    const bbY = 0.285;
    const bbZ = cz - dir * 0.06;
    const seatY = 0.675;
    const seatZ = cz - dir * 0.23;
    const headBotY = 0.54;
    const headBotZ = cz + dir * 0.35;
    const headTopY = 0.71;
    const headTopZ = cz + dir * 0.3;

    // Seat tube & head tube + polished chrome headset cups
    tube(b, cx, bbY, bbZ, cx, seatY, seatZ, 0.016, 0.015, 6, framePaint);
    tube(b, cx, headBotY, headBotZ, cx, headTopY, headTopZ, 0.018, 0.018, 6, framePaint);
    tube(b, cx, headBotY - 0.012, headBotZ + dir * 0.004, cx, headBotY + 0.014, headBotZ - dir * 0.004, 0.022, 0.022, 6, chrome);
    tube(b, cx, headTopY - 0.014, headTopZ + dir * 0.004, cx, headTopY + 0.014, headTopZ - dir * 0.004, 0.022, 0.022, 6, chrome);

    if (variant === 0) {
      // Classic horizontal-top-tube diamond roadster frame
      tube(b, cx, seatY - 0.035, seatZ + dir * 0.01, cx, headTopY - 0.025, headTopZ, 0.015, 0.015, 6, framePaint);
      tube(b, cx, bbY + 0.01, bbZ, cx, headBotY + 0.02, headBotZ, 0.017, 0.016, 6, framePaint);
    } else {
      // Elegant European twin-tube step-through city frame
      const midSeatY = bbY + (seatY - bbY) * 0.42;
      const midSeatZ = bbZ + (seatZ - bbZ) * 0.42;
      tube(b, cx, midSeatY, midSeatZ, cx, headTopY - 0.04, headTopZ, 0.015, 0.015, 6, framePaint);
      tube(b, cx, bbY + 0.01, bbZ, cx, headBotY + 0.02, headBotZ, 0.017, 0.016, 6, framePaint);
    }

    // Twin tapered chainstays, seatstays + sculpted fork crown & twin front fork blades
    b.box(cx, headBotY - 0.024, headBotZ + dir * 0.01, 0.074, 0.026, 0.036, chrome);
    for (const sx of [-0.032, 0.032]) {
      tube(b, cx + sx * 0.45, bbY, bbZ, cx + sx, wy, zRear, 0.012, 0.009, 5, framePaint);
      tube(b, cx + sx * 0.35, seatY - 0.045, seatZ, cx + sx, wy, zRear, 0.011, 0.0085, 5, framePaint);
      tube(b, cx + sx * 0.85, headBotY - 0.02, headBotZ + dir * 0.01, cx + sx, wy, zFront, 0.014, 0.01, 6, framePaint);
    }
    // Bottle dynamo mounted on camera-facing fork blade
    tube(
      b,
      cx - 0.042,
      wy + 0.16,
      zFront - dir * 0.09,
      cx - 0.042,
      wy + 0.22,
      zFront - dir * 0.12,
      0.016,
      0.013,
      6,
      chrome,
    );

    // Left-side chrome kickstand resting cleanly on stone sidewalk
    tube(b, cx + 0.015, bbY - 0.01, bbZ - dir * 0.02, cx + 0.12, 0.0, bbZ - dir * 0.08, 0.009, 0.007, 5, chrome);

    // 4. Complete Right-Hand (`-X` camera-facing) Drivetrain: BB shell, alloy chainring, rear cog, chain, chainguard, cranks & pedals
    b.cylinderX(cx, bbY, bbZ, 0.024, 0.068, 8, framePaint);
    const driveX = cx - 0.036;
    b.cylinderX(driveX, bbY, bbZ, 0.078, 0.008, 14, chrome);
    b.cylinderX(driveX - 0.002, bbY, bbZ, 0.052, 0.01, 10, darkSteel);
    b.cylinderX(driveX + 0.004, wy, zRear, 0.034, 0.008, 10, chrome);

    // Upper & lower roller chain runs + painted vintage upper chainguard
    tube(b, driveX, bbY + 0.072, bbZ, driveX + 0.004, wy + 0.031, zRear, 0.0055, 0.0055, 4, darkSteel);
    tube(b, driveX, bbY - 0.072, bbZ, driveX + 0.004, wy - 0.031, zRear, 0.0055, 0.0055, 4, darkSteel);
    tube(b, driveX - 0.006, bbY + 0.084, bbZ + dir * 0.03, driveX - 0.002, wy + 0.044, zRear + dir * 0.08, 0.016, 0.012, 5, framePaint);

    // Opposing chrome crank arms (`180°`) + flat rubber-block platform pedals with amber reflectors
    const crankAngle = 0.58;
    const crankLen = 0.148;
    for (const [sideSign, ang] of [
      [-1, crankAngle],
      [1, crankAngle + Math.PI],
    ]) {
      const cX0 = cx + sideSign * 0.044;
      const pY = bbY + Math.sin(ang) * crankLen;
      const pZ = bbZ + Math.cos(ang) * crankLen;
      tube(b, cX0, bbY, bbZ, cX0 + sideSign * 0.008, pY, pZ, 0.011, 0.009, 5, chrome);
      const pedX = cX0 + sideSign * 0.052;
      tube(b, cX0 + sideSign * 0.008, pY, pZ, pedX, pY, pZ, 0.006, 0.006, 4, chrome);
      b.box(pedX, pY - 0.01, pZ, 0.072, 0.02, 0.052, tireOpt);
      b.box(pedX, pY - 0.005, pZ + 0.025, 0.048, 0.01, 0.006, brassOpt);
      b.box(pedX, pY - 0.005, pZ - 0.025, 0.048, 0.01, 0.006, brassOpt);
    }

    // 5. Chrome quill stem, swept-back North-Road handlebars, brake levers, brass bell & vintage headlamp
    const stemTopY = headTopY + 0.145;
    const stemTopZ = headTopZ - dir * 0.015;
    tube(b, cx, headTopY, headTopZ, cx, stemTopY, stemTopZ, 0.013, 0.012, 6, chrome);
    tube(b, cx, stemTopY, stemTopZ, cx, stemTopY + 0.005, stemTopZ + dir * 0.042, 0.014, 0.013, 6, chrome);
    const barZ = stemTopZ + dir * 0.04;
    const barY = stemTopY + 0.005;
    for (const side of [-1, 1]) {
      const shoulderX = cx + side * 0.11;
      const elbowX = cx + side * 0.205;
      const elbowZ = barZ + dir * 0.015;
      const gripX = cx + side * 0.235;
      const gripZ = barZ - dir * 0.145;
      tube(b, cx, barY, barZ, shoulderX, barY + 0.012, barZ, 0.011, 0.011, 5, chrome);
      tube(b, shoulderX, barY + 0.012, barZ, elbowX, barY + 0.015, elbowZ, 0.011, 0.01, 5, chrome);
      tube(b, elbowX, barY + 0.015, elbowZ, gripX, barY - 0.005, gripZ, 0.0135, 0.014, 6, leatherOpt);
      // Alloy hand-brake lever blade angled forward/outward under each grip
      tube(
        b,
        elbowX + side * 0.01,
        barY + 0.004,
        elbowZ - dir * 0.02,
        gripX + side * 0.018,
        barY - 0.026,
        gripZ + dir * 0.02,
        0.0045,
        0.0032,
        4,
        chrome,
      );
    }
    // Polished brass dome bell on handlebar
    b.cylinderY(cx - 0.085, barY + 0.014, barZ, 0.02, 0.018, 0.018, 8, brassOpt);

    // Curved chrome lamp bracket + bullet headlamp with glowing warm lens
    tube(b, cx, headTopY - 0.01, headTopZ, cx, headTopY - 0.03, headBotZ + dir * 0.085, 0.006, 0.005, 4, chrome);
    b.cylinderX(cx, headTopY - 0.03, headBotZ + dir * 0.095, 0.028, 0.046, 8, chrome);
    b.box(cx, headTopY - 0.052, headBotZ + dir * 0.118, 0.044, 0.044, 0.016, {
      tile: T.bulb,
      color: WHITE,
      data: [1.5, 0],
    });

    // 6. Chrome seatpost, twin rear coil springs & 3-part sculpted honey-leather saddle
    const saddleY = seatY + 0.085;
    tube(b, cx, seatY, seatZ, cx, saddleY, seatZ, 0.0125, 0.012, 6, chrome);
    for (const sx of [-0.038, 0.038]) {
      b.cylinderY(cx + sx, saddleY - 0.032, seatZ - dir * 0.055, 0.014, 0.014, 0.036, 6, chrome);
    }
    b.box(cx, saddleY, seatZ - dir * 0.055, 0.155, 0.042, 0.115, leatherOpt);
    b.box(cx, saddleY + 0.004, seatZ + dir * 0.045, 0.068, 0.036, 0.115, leatherOpt);

    // 7. Tubular chrome rear carrier rack + strapped wicker/canvas parcel basket (`media_1794002957188_4ab2788b.mp4`)
    const rackY = wy + rW + 0.055;
    const rackZ0 = seatZ - dir * 0.08;
    const rackZ1 = zRear - dir * 0.14;
    const rackMidZ = (rackZ0 + rackZ1) * 0.5;
    const rackLen = Math.abs(rackZ0 - rackZ1);
    for (const sx of [-0.068, 0.068]) {
      tube(b, cx + sx, rackY, rackZ0, cx + sx, rackY, rackZ1, 0.0065, 0.0065, 5, chrome);
      tube(b, cx + sx * 0.4, seatY - 0.03, seatZ, cx + sx, rackY, rackZ0, 0.0055, 0.0055, 4, chrome);
      tube(b, cx + sx * 0.55, wy, zRear, cx + sx, rackY, rackZ1 + dir * 0.04, 0.006, 0.0055, 5, chrome);
    }
    tube(b, cx - 0.068, rackY, rackZ1, cx + 0.068, rackY, rackZ1, 0.0065, 0.0065, 5, chrome);

    // Woven wicker/tan parcel box + fitted lid + twin dark-leather buckled straps
    const boxW = 0.195;
    const boxH = 0.145;
    const boxL = Math.max(0.22, rackLen * 0.88);
    b.box(cx, rackY + 0.006, rackMidZ, boxW, boxH - 0.03, boxL, wickerOpt);
    b.box(cx, rackY + boxH - 0.026, rackMidZ, boxW + 0.014, 0.034, boxL + 0.014, wickerOpt);
    for (const sz of [-0.065, 0.065]) {
      b.box(cx, rackY + 0.003, rackMidZ + sz, boxW + 0.022, boxH + 0.012, 0.02, strapOpt);
      b.box(cx - boxW * 0.5 - 0.01, rackY + boxH * 0.52, rackMidZ + sz, 0.01, 0.024, 0.028, brassOpt);
    }
  }

  /**
   * Heritage street lamp: the arm reaches over the gutter (`side` +1 far sidewalk, −1 near),
   * its pool of light split at the curb face `curbX` between the road and the sidewalk.
   */
  #buildStreetLamp(b, pools, cx, cz, side = 1, curbX = -SIDEWALK_W) {
    const T = this.#atlas.tiles;
    const poleH = 3.9;
    const armReach = -0.58 * side;
    const bulbX = cx + armReach;
    const iron = { tile: T.metal, color: CHARCOAL_IRON };

    b.cylinderY(cx, -0.02, cz, 0.13, 0.09, 0.48, 8, iron);
    b.cylinderY(cx, 0.46, cz, 0.055, 0.045, poleH - 0.46, 8, iron);
    b.box(cx + armReach * 0.5, poleH - 0.05, cz, Math.abs(armReach) + 0.1, 0.06, 0.06, iron);
    b.cylinderY(bulbX, poleH - 0.16, cz, 0.18, 0.05, 0.11, 8, iron);
    b.box(bulbX, poleH - 0.28, cz, 0.16, 0.12, 0.16, { tile: T.bulb, color: WHITE });

    const R = 3.0;
    const x0 = bulbX - R;
    const x1 = bulbX + R;
    const xSplit = curbX;
    const span = R * 2;
    const tSplit = clamp((xSplit - x0) / span, 0.05, 0.95);
    const warmPool = [0.85, 0.58, 0.24];
    // On the road the pool is brighter when wet; on the slabs a little dimmer
    const road = { y: -CURB_H + 0.024, color: warmPool, data: [0.8, 0.3] };
    const walk = { y: 0.022, color: warmPool.map((c) => c * 0.76), data: [0.4, 0.3] };
    const [lo, hi] = side > 0 ? [road, walk] : [walk, road];

    pools.quad([x0, lo.y, cz + R], [xSplit - x0, 0, 0], [0, 0, -span], {
      color: lo.color,
      uvOffset: [0, 0],
      rep: [tSplit, 1],
      data: lo.data,
    });
    pools.quad([xSplit, hi.y, cz + R], [x1 - xSplit, 0, 0], [0, 0, -span], {
      color: hi.color,
      uvOffset: [tSplit, 0],
      rep: [1 - tSplit, 1],
      data: hi.data,
    });
  }
}
