import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three/webgpu';
import { Store } from '../core/Store.js';
import { EventBus } from '../core/EventBus.js';
import { PARAM_DEFS } from '../config/params.schema.js';
import { WHEEL_OFFSETS, WHEEL_RADIUS } from '../config/constants.js';
import { WorldUniforms } from '../rendering/uniforms/WorldUniforms.js';
import { LotType, StreetLayout } from '../simulation/street/StreetLayout.js';
import { TaxiState, TaxiStateMachine } from '../simulation/taxi/TaxiStateMachine.js';
import {
  ATLAS_CELL,
  ATLAS_SIZE,
  createAsphaltTexture,
  createCobbleTexture,
  createFacadeAtlas,
  textWidth,
} from '../textures/PixelCanvas.js';
import { MeshBuilder } from './MeshBuilder.js';
import { BuildingFactory } from './BuildingFactory.js';
import { RIBBON_BACK, RIBBON_FRONT, RoadView } from './RoadView.js';
import { StreetProfileView } from './StreetProfileView.js';
import { StreetView, reverseTriangles } from './StreetView.js';
import { TaxiModel } from '../vehicles/TaxiModel.js';
import { TaxiView } from '../vehicles/TaxiView.js';
import { CameraRig } from '../rendering/CameraRig.js';
import { Lighting } from '../rendering/Lighting.js';

// Minimal OffscreenCanvas stub so procedural 2D canvas generators run in Node Vitest
let prevOffscreen;
beforeAll(() => {
  prevOffscreen = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class MockOffscreenCanvas {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        imageSmoothingEnabled: true,
        fillStyle: '#000',
        fillRect() {},
      };
    }
  };
});

afterAll(() => {
  globalThis.OffscreenCanvas = prevOffscreen;
});

describe('PixelCanvas & Procedural Textures', () => {
  it('computes 3x5 pixel font widths accurately', () => {
    expect(textWidth('', 2)).toBe(0);
    expect(textWidth('TAXI', 4)).toBe((4 * 4 - 1) * 4);
  });

  it('creates trilinear anti-shimmer ground textures and high-res 2048² (128px) facade atlas', () => {
    const asphalt = createAsphaltTexture(7);
    expect(asphalt.wrapS).toBe(THREE.RepeatWrapping);
    expect(asphalt.minFilter).toBe(THREE.LinearMipmapLinearFilter);

    const cobble = createCobbleTexture(11);
    expect(cobble.wrapT).toBe(THREE.RepeatWrapping);
    expect(cobble.minFilter).toBe(THREE.LinearMipmapLinearFilter);

    expect(ATLAS_SIZE).toBe(2048);
    expect(ATLAS_CELL).toBe(128);

    const atlas = createFacadeAtlas(3);
    expect(atlas.map.magFilter).toBe(THREE.LinearFilter);
    expect(atlas.map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(atlas.maskMap.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(atlas.map.anisotropy).toBe(8);
    expect(atlas.map.image.width).toBe(ATLAS_SIZE);
    expect(atlas.maskMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(atlas.tiles.wall_brick).toHaveLength(4);
    expect(atlas.tiles.quoin_stone).toHaveLength(4);
    expect(atlas.tiles.tire_tread).toHaveLength(4);
    expect(atlas.tiles.taxi_grille).toHaveLength(4);
    expect(atlas.tiles.wheel_cap).toHaveLength(4);
    expect(atlas.signs.has('RAMEN')).toBe(true);
    expect(atlas.signs.has('BUS')).toBe(true);
    for (const key of [
      'ramen_sign',
      'lantern_paper',
      'lantern_glyph',
      'plaque_118',
      'win_plain_dark',
      'win_curtain_cream',
      'win_curtain_dark',
      'win_blind_cream',
      'win_blind_dark',
      'win_sheer_cream',
      'win_sheer_dark',
      'win_six_cream',
      'win_plain_cream',
      'win_stair_cream',
      'win_stair_dark',
      'plaque_112',
      'plaque_114',
      'plaque_116',
      'shop_glass',
    ]) {
      expect(atlas.tiles[key]).toHaveLength(4);
    }

    // No two distinct atlas regions may partially overlap (identical rects are deliberate aliases).
    const rects = [...Object.values(atlas.tiles), ...atlas.signs.values()];
    const eps = 1e-9;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [au, av, aw, ah] = rects[i];
        const [bu, bv, bw, bh] = rects[j];
        const same = Math.abs(au - bu) + Math.abs(av - bv) + Math.abs(aw - bw) + Math.abs(ah - bh) < eps;
        const overlap =
          au < bu + bw - eps && bu < au + aw - eps && av < bv + bh - eps && bv < av + ah - eps;
        expect(overlap && !same).toBe(false);
      }
    }

    asphalt.dispose();
    cobble.dispose();
    atlas.dispose();
  });
});

describe('MeshBuilder, Urban Infrastructure & World Views', () => {
  it('builds valid indexed BufferGeometry including tapered prisms with outward normals', () => {
    const mb = new MeshBuilder();
    mb.box(0, 0, 0, 2, 3, 4, { texScale: 2 });
    mb.prism(
      [-1, 0, 1],
      [1, 0, 1],
      [1, 0, -1],
      [-1, 0, -1],
      [-0.7, 1.5, 0.7],
      [0.7, 1.5, 0.7],
      [0.7, 1.5, -0.7],
      [-0.7, 1.5, -0.7],
    );
    mb.gableZ(-1, 1, 3, -2, 2, 1.2, { texScale: 1 }, { texScale: 2 });
    const geo = mb.build();

    expect(geo).not.toBeNull();
    expect(geo.getAttribute('position').count).toBeGreaterThan(40);
    expect(geo.getAttribute('aTile').itemSize).toBe(4);
    expect(geo.getAttribute('aData').itemSize).toBe(2);
    geo.dispose();
  });

  it('enforces zero-gap lot abutment, prevents adjacent alleys, and parks bicycles only in front of shops', () => {
    const store = new Store(PARAM_DEFS);
    let totalBicycles = 0;
    for (let c = 0; c < 12; c++) {
      const lots = StreetLayout.getChunk(c, store).right;
      for (let i = 0; i < lots.length; i++) {
        const lot = lots[i];
        if (i > 0) {
          expect(lot.zStart).toBeCloseTo(lots[i - 1].zEnd, 5);
          const prevOpen = lots[i - 1].type === LotType.ALLEY || lots[i - 1].type === LotType.PARK;
          const curOpen = lot.type === LotType.ALLEY || lot.type === LotType.PARK;
          expect(prevOpen && curOpen).toBe(false);
        }
        if (lot.hasBicycle) {
          totalBicycles++;
          expect(lot.type).toBe(LotType.SHOP);
        }
      }
    }
    // The café № 100, the florist № 108 and the bike workshop № 128
    expect(totalBicycles).toBe(3);
  });

  it('generates procedural street chunks and streams/disposes cleanly in StreetView', () => {
    const store = new Store(PARAM_DEFS);
    const bus = new EventBus();
    const uniforms = new WorldUniforms(store);
    const scene = new THREE.Scene();
    const atlas = createFacadeAtlas(3);

    const factory = new BuildingFactory(atlas);
    const layout = StreetLayout.getChunk(3, store);
    const built = factory.buildChunk(layout, store);
    expect(built.solidGeometry).not.toBeNull();
    expect(built.lightPoolGeometry).not.toBeNull();
    expect(built.solidGeometry.getAttribute('position').count).toBeGreaterThan(4000);
    built.solidGeometry.dispose();
    built.lightPoolGeometry.dispose();

    const lighting = new Lighting(scene, store);
    lighting.updateSunPosition(10.0);
    const snapPosA = lighting.sun.position.clone();
    lighting.updateSunPosition(10.0002); // sub-texel motion must stay locked to prevent shadow swimming
    expect(lighting.sun.position.distanceTo(snapPosA)).toBeLessThan(1e-6);
    lighting.dispose();

    const road = new RoadView(scene, store, uniforms);
    const profile = new StreetProfileView(scene, store, uniforms, bus);
    const street = new StreetView(scene, store, uniforms, atlas, bus);

    expect(street.activeChunkCount).toBeGreaterThanOrEqual(10);
    const firstStopZ = street.findNextBusStopZ(0);
    expect(Number.isFinite(firstStopZ)).toBe(true);
    expect(firstStopZ).toBeGreaterThan(40);

    uniforms.update(1.0, 0.85, 0, 65, 8.0);
    road.update(0.016);
    profile.update(0.016);
    street.update(0.016);
    expect(road.group.position.z).toBe(64);
    // Curbs and sidewalks lie under the whole asphalt ribbon
    const starts = profile.group.children.map((m) => m.position.z);
    expect(Math.min(...starts)).toBeLessThanOrEqual(64 + RIBBON_BACK);
    expect(Math.max(...starts) + 20).toBeGreaterThanOrEqual(64 + RIBBON_FRONT);
    expect(profile.activeChunkCount).toBe(starts.length);

    // Every loop chunk is built once up front; driving a lap and more builds nothing new
    expect(street.buildCount).toBe(12);
    const meshOf = (idx) => street.group.getObjectByName(`StreetChunk_${idx}`)?.children[0];
    const lap0 = meshOf(3).geometry;
    for (const z of [120, 200, 280, 330]) {
      uniforms.update(1.0, 0.85, 0, z, 8.0);
      street.setCameraZ(z);
      street.update(0.016);
    }
    expect(street.buildCount).toBe(12);
    // Chunk 15 is chunk 3 a lap on: the same geometry, placed 240 m further
    expect(meshOf(15).geometry).toBe(lap0);
    expect(meshOf(15).parent.position.z).toBe(300);
    // Its trees are where the leaves need them: in the second lap's world Z
    const zs = street.trees.map((t) => t.z);
    expect(Math.min(...zs)).toBeGreaterThan(200);
    for (const t of street.trees) expect(t.crown.z).toBeCloseTo(t.z, 0);
    // Drawn detail first: the last triangle built is the first drawn, each one whole and wound
    // the same way
    const g = new THREE.BufferGeometry();
    g.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    reverseTriangles(g);
    expect([...g.index.array]).toEqual([6, 7, 8, 3, 4, 5, 0, 1, 2]);
    reverseTriangles(null);
    // A new seed rebuilds the loop once
    store.set('street.seed', 99);
    street.update(0.016);
    expect(street.buildCount).toBe(24);

    road.dispose();
    profile.dispose();
    expect(profile.activeChunkCount).toBe(0);
    street.dispose();
    atlas.dispose();
  });
});

describe('TaxiModel, TaxiView & Jerk-Free Feather Braking', () => {
  it('spins wheels forward, builds glass & interior cabin, dips nose smoothly, and activates lights', () => {
    const store = new Store(PARAM_DEFS);
    const bus = new EventBus();
    const uniforms = new WorldUniforms(store);
    const scene = new THREE.Scene();
    const atlas = createFacadeAtlas(3);

    const sim = new TaxiStateMachine(store, bus, { initialZ: 0, initialSpeed: 8.0 });
    const view = new TaxiView(scene, store, uniforms, atlas, sim);
    const model = view.model;

    expect(model).toBeInstanceOf(TaxiModel);
    expect(model.glassMesh).toBeInstanceOf(THREE.Mesh);
    expect(model.glassMesh.material.transparent).toBe(false);
    expect(model.glassMesh.material.depthWrite).toBe(true);
    expect(model.glassMesh.geometry.getAttribute('position').count).toBe(24);
    expect(model.bodyMesh.geometry.getAttribute('position').count).toBeGreaterThan(400);
    expect(model.wheels).toHaveLength(WHEEL_OFFSETS.length);

    view.update(0, { time: 0, frame: 0, rawDt: 0 });
    sim.update(0.05);
    view.update(0.05, { time: 0.05, frame: 1, rawDt: 0.05 });

    const expectedSpin = (sim.speed * 0.05) / WHEEL_RADIUS;
    expect(model.wheels[0].spinMesh.rotation.x).toBeCloseTo(expectedSpin, 2);

    // Trigger Approach braking toward a nearby bus stop
    sim.setNextBusStop(sim.z + 9.0);
    for (let i = 0; i < 8; i++) {
      sim.update(0.05);
      view.update(0.05, { time: 0.1 + i * 0.05, frame: 2 + i, rawDt: 0.05 });
    }

    expect(sim.state).toBe(TaxiState.APPROACH);
    expect(sim.pitch).toBeLessThan(0);
    expect(model.chassisPivot.rotation.x).toBeGreaterThan(0);
    expect(model.chassisPivot.rotation.x).toBeLessThan(0.05); // plush sedan pitch, never cartoonish!
    expect(model.brakeUniform.value).toBeGreaterThan(1.5);

    // Run until Stopped and verify hazard lights blink
    for (let i = 0; i < 80 && sim.state !== TaxiState.STOPPED; i++) {
      sim.update(0.05);
      view.update(0.05, { time: 0.5 + i * 0.05, frame: 10 + i, rawDt: 0.05 });
    }
    expect(sim.state).toBe(TaxiState.STOPPED);
    view.update(0.05, { time: 0.08, frame: 100, rawDt: 0.05 });
    expect(model.blinkLeftUniform.value).toBe(1.0);
    expect(model.blinkRightUniform.value).toBe(1.0);

    view.dispose();
    atlas.dispose();
  });

  it('brakes with continuous jerk-limited feather-stop profile (zero instant acceleration spikes)', () => {
    const store = new Store(PARAM_DEFS);
    const bus = new EventBus();
    const sim = new TaxiStateMachine(store, bus, { initialZ: 0, initialSpeed: 8.0 });
    sim.setNextBusStop(40.0);

    const dt = 1 / 60;
    let prevSpeed = sim.speed;
    let prevAccel = 0;
    let maxAccelStepPerFrame = 0;
    let lastMovingSpeed = sim.speed;

    for (let step = 0; step < 600 && sim.state !== TaxiState.STOPPED; step++) {
      sim.update(dt);
      const accel = (sim.speed - prevSpeed) / dt;
      const accelStep = Math.abs(accel - prevAccel);
      if (accelStep > maxAccelStepPerFrame) maxAccelStepPerFrame = accelStep;
      if (sim.speed > 0) lastMovingSpeed = sim.speed;
      prevSpeed = sim.speed;
      prevAccel = accel;
    }

    expect(sim.state).toBe(TaxiState.STOPPED);
    expect(sim.z).toBeCloseTo(40.0, 2);
    expect(sim.speed).toBe(0);
    // Old step-braking jumped > 3.4 m/s² in 1 frame; continuous S-curve changes < 0.65 m/s² per frame!
    expect(maxAccelStepPerFrame).toBeLessThan(0.65);
    expect(lastMovingSpeed).toBeLessThan(0.12);
  });

  it('updates CameraRig smoothly across front-hemisphere Isometric, Chase, and Side views', () => {
    const store = new Store(PARAM_DEFS);
    const rig = new CameraRig(store);

    rig.update(0, 0, 0.85, 0, 10);
    const isoAz = rig.azimuth;
    expect(isoAz).toBeCloseTo(-Math.PI * 0.86, 2);

    store.set('camera.mode', 'Chase');
    for (let i = 0; i < 40; i++) rig.update(0.05, i * 0.05, 0.85, 0, 10);
    expect(rig.azimuth).toBeGreaterThan(isoAz);
    expect(rig.azimuth).toBeLessThanOrEqual(-2.24);

    store.set('camera.mode', 'Side');
    for (let i = 0; i < 40; i++) rig.update(0.05, i * 0.05, 0.85, 0, 10);
    expect(rig.azimuth).toBeCloseTo(-Math.PI, 1);
    expect(rig.elevation).toBeCloseTo(
      Math.atan2(
        store.get('camera.height') - 0.85,
        store.get('camera.distance') * 1.018,
      ),
      2,
    );

    // Lowering camera height to street level tilts view upward to reveal building rooftops
    store.set('camera.height', 1.0);
    for (let i = 0; i < 60; i++) rig.update(0.05, i * 0.05, 0.85, 0, 10);
    expect(rig.elevation).toBeLessThan(0.05);
    expect(rig.camera.position.y).toBeLessThan(2.0);
    const forward = new THREE.Vector3();
    rig.camera.getWorldDirection(forward);
    expect(forward.y).toBeGreaterThan(0.12);

    rig.resetView();
    rig.dispose();
  });
});
