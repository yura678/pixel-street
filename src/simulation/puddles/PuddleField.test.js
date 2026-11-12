import { describe, it, expect } from 'vitest';
import {
  CURB_MARGIN,
  PUDDLE_DRY_LEVEL,
  PUDDLE_FULL_LEVEL,
  PUDDLE_MIN_WET_SCALE,
  PuddleField,
  puddleScale,
} from './PuddleField.js';
import { Store } from '../../core/Store.js';
import { EventBus, Events } from '../../core/EventBus.js';
import { PARAM_DEFS } from '../../config/params.schema.js';
import { GUTTER_W, ROAD_FAR_X, ROAD_NEAR_X } from '../../config/streetProfile.js';

/** Field with one known puddle (x = 0, z = 5, radius 3) in chunk 0. */
function fieldWithOnePuddle() {
  const store = new Store(PARAM_DEFS);
  const bus = new EventBus();
  const field = new PuddleField(store, bus);
  const puddles = field.getPuddlesForChunk(0);
  puddles.length = 0;
  puddles.push({ id: 'p', chunkIndex: 0, x: 0, z: 5, radiusX: 3, radiusZ: 3, rotation: 0 });
  const enters = [];
  bus.on(Events.WHEEL_ENTER_PUDDLE, (e) => enters.push(e));
  return { field, enters };
}

describe('puddleScale', () => {
  it('is 0 when dry, 1 at full level and grows monotonically', () => {
    expect(puddleScale(0)).toBe(0);
    expect(puddleScale(PUDDLE_DRY_LEVEL)).toBe(0);
    expect(puddleScale(PUDDLE_FULL_LEVEL)).toBe(1);
    expect(puddleScale(1)).toBe(1);
    let prev = 0;
    for (let l = 0; l <= 1.0001; l += 0.05) {
      const s = puddleScale(l);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('keeps every weather preset level in range', () => {
    // Sunny 0.14 is a damp stain, Rain 0.7 is nearly full
    expect(puddleScale(0.14)).toBeLessThan(PUDDLE_MIN_WET_SCALE * 2);
    expect(puddleScale(0.7)).toBeGreaterThan(0.9);
  });
});

describe('PuddleField', () => {
  it('generates deterministic puddles for the same chunk', () => {
    const store = new Store(PARAM_DEFS);
    const bus = new EventBus();
    const field = new PuddleField(store, bus);

    const puddlesA = field.getPuddlesForChunk(3);
    const puddlesB = field.getPuddlesForChunk(3);

    expect(puddlesA).toEqual(puddlesB);
  });

  it('correctly evaluates point inside an ellipse puddle', () => {
    const store = new Store(PARAM_DEFS);
    const bus = new EventBus();
    const field = new PuddleField(store, bus);

    const puddle = {
      x: 0,
      z: 10,
      radiusX: 2.0,
      radiusZ: 1.0,
      rotation: 0,
    };

    expect(field.isPointInPuddle(0, 10, puddle)).toBe(true);
    expect(field.isPointInPuddle(1.5, 10, puddle)).toBe(true);
    expect(field.isPointInPuddle(2.5, 10, puddle)).toBe(false);
    expect(field.isPointInPuddle(0, 11.5, puddle)).toBe(false);
  });

  it('triggers WHEEL_ENTER_PUDDLE and WHEEL_EXIT_PUDDLE events', () => {
    const store = new Store(PARAM_DEFS);
    const bus = new EventBus();
    const field = new PuddleField(store, bus);

    const enters = [];
    const exits = [];
    bus.on(Events.WHEEL_ENTER_PUDDLE, (e) => enters.push(e));
    bus.on(Events.WHEEL_EXIT_PUDDLE, (e) => exits.push(e));

    // Force a known puddle in chunk 0
    const puddles = field.getPuddlesForChunk(0);
    puddles.length = 0;
    puddles.push({
      id: 'test_puddle',
      chunkIndex: 0,
      x: 0,
      z: 5,
      radiusX: 3.0,
      radiusZ: 3.0,
      rotation: 0,
    });

    // Taxi approaches and passes through puddle at Z=5
    field.checkWheelContacts(0, 0, 10);
    expect(enters).toHaveLength(0);

    // Front wheels (Z offset +1.35) enter puddle at taxiZ=4
    field.checkWheelContacts(0, 4.0, 10);
    expect(enters.length).toBeGreaterThan(0);
    expect(enters[0].puddleId).toBe('test_puddle');

    // Taxi moves far past puddle
    field.checkWheelContacts(0, 15.0, 10);
    expect(exits.length).toBeGreaterThan(0);
  });

  it('emits exactly one enter event per wheel while it stays in the puddle', () => {
    const { field, enters } = fieldWithOnePuddle();
    for (let z = 3.5; z <= 6.5; z += 0.1) field.checkWheelContacts(0, z, 8);
    const perWheel = [0, 0, 0, 0];
    for (const e of enters) perWheel[e.wheel]++;
    expect(perWheel).toEqual([1, 1, 1, 1]);
  });

  it('shrinks the wet area with the puddle level', () => {
    const { field } = fieldWithOnePuddle();
    const p = field.getPuddlesForChunk(0)[0];
    // 2.4 m from the centre: inside the full puddle, outside a half-sized one
    expect(field.isPointInPuddle(2.4, 5, p, 1)).toBe(true);
    expect(field.isPointInPuddle(2.4, 5, p, 0.5)).toBe(false);
    expect(field.isPointInPuddle(0, 5, p, 0)).toBe(false);
  });

  it('does not splash in puddles that have dried to a stain', () => {
    const { field, enters } = fieldWithOnePuddle();
    for (let z = 0; z <= 10; z += 0.5) field.checkWheelContacts(0, z, 8, PUDDLE_DRY_LEVEL + 0.01);
    expect(enters).toHaveLength(0);
    for (let z = 0; z <= 10; z += 0.5) field.checkWheelContacts(0, z, 8, 1);
    expect(enters.length).toBeGreaterThan(0);
  });

  it('keeps puddles between the curb faces and lets some fill the gutters', () => {
    // Scene X: the road (gutters included) runs from the near curb (−3.75) to the far (+2.35)
    expect(CURB_MARGIN).toBeGreaterThan(0);
    for (const size of [0.4, 1, 2]) {
      const store = new Store(PARAM_DEFS);
      store.set('water.puddleCount', 5);
      store.set('water.puddleSize', size);
      const field = new PuddleField(store, new EventBus());
      let n = 0;
      const inGutter = { near: 0, far: 0 };
      for (let c = -20; c < 40; c++) {
        for (const p of field.getPuddlesForChunk(c)) {
          expect(p.x - p.radiusX).toBeGreaterThanOrEqual(ROAD_NEAR_X + CURB_MARGIN - 1e-9);
          expect(p.x + p.radiusX).toBeLessThanOrEqual(ROAD_FAR_X - CURB_MARGIN + 1e-9);
          if (p.x - p.radiusX < ROAD_NEAR_X + GUTTER_W) inGutter.near++;
          if (p.x + p.radiusX > ROAD_FAR_X - GUTTER_W) inGutter.far++;
          n++;
        }
      }
      expect(n).toBeGreaterThan(50);
      expect(inGutter.near).toBeGreaterThan(n * 0.1);
      expect(inGutter.far).toBeGreaterThan(n * 0.1);
    }
  });

  it('turns the ellipse about +Y the way Object3D.rotation.y does', () => {
    const { field } = fieldWithOnePuddle();
    const p = { x: 1, z: 5, radiusX: 2, radiusZ: 0.4, rotation: 0.5 };
    // The local tip (0.95 rx, 0) after `makeRotationY(0.5)` lands at (x cos, −x sin)
    const r = p.radiusX * 0.95;
    const tipX = p.x + r * Math.cos(0.5);
    expect(field.isPointInPuddle(tipX, p.z - r * Math.sin(0.5), p)).toBe(true);
    // ... and not on its mirror image (the old X-mirrored simulation convention)
    expect(field.isPointInPuddle(tipX, p.z + r * Math.sin(0.5), p)).toBe(false);
  });
});
