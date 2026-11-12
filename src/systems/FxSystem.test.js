import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { Store } from '../core/Store.js';
import { PARAM_DEFS } from '../config/params.schema.js';
import { MAX_LEAVES, MAX_RAIN_DROPS } from '../config/constants.js';
import { WorldUniforms } from '../rendering/uniforms/WorldUniforms.js';
import { crownsInWindow, leafWindowAt } from '../simulation/leaves/leafRules.js';
import { farSidewalkOfChunk } from '../world/FarSidewalkPlan.js';
import { nearSidewalkOfChunk } from '../world/NearSidewalkPlan.js';
import { FxSystem } from './FxSystem.js';
import { dropsFor } from '../fx/Rain.js';

/** Street trees of chunks 0–5, as the streamed chunks hand them over. */
function streetTrees() {
  const plan = { seed: 1, density: 0.55 };
  const trees = [];
  for (let c = 0; c < 6; c++) {
    trees.push(...farSidewalkOfChunk(c, plan).trees, ...nearSidewalkOfChunk(c, plan).trees);
  }
  return trees;
}

function makeFx(extra = {}) {
  const store = new Store(PARAM_DEFS);
  const uniforms = new WorldUniforms(store);
  const scene = new THREE.Scene();
  const renderer = { compute: vi.fn(), getArrayBufferAsync: vi.fn() };
  const cameraRig = {
    camera: { position: new THREE.Vector3(-14, 6, 40) },
    anchorX: 1.75,
    anchorZ: 50,
  };
  const streetView = { group: { visible: true }, trees: streetTrees() };
  const fx = new FxSystem({ scene, store, uniforms, renderer, cameraRig, streetView, ...extra });
  return { fx, store, uniforms, scene, renderer, cameraRig, streetView };
}

const frame = { time: 0, frame: 0, rawDt: 1 / 60 };

describe('Rain', () => {
  it('lets Rain fall with about 1500 drops and a Downpour with about 5000', () => {
    expect(dropsFor(0)).toBe(0);
    expect(dropsFor(0.001)).toBe(0);
    expect(dropsFor(0.5)).toBeGreaterThan(1300);
    expect(dropsFor(0.5)).toBeLessThan(1700);
    expect(dropsFor(1)).toBe(5000);
    expect(dropsFor(3)).toBeLessThanOrEqual(MAX_RAIN_DROPS);
    for (let r = 0.05; r < 1; r += 0.05)
      expect(dropsFor(r + 0.05)).toBeGreaterThanOrEqual(dropsFor(r));
  });

  it('draws as many drops as the weather rains, none on a dry day', () => {
    const { fx, uniforms } = makeFx();
    uniforms.rainIntensity.value = 0;
    fx.update(1 / 60, frame);
    expect(fx.rain.count).toBe(0);
    expect(fx.rain.mesh.visible).toBe(false);

    uniforms.rainIntensity.value = 1;
    fx.update(1 / 60, frame);
    expect(fx.rain.count).toBe(5000);
    expect(fx.rain.mesh.visible).toBe(true);
    fx.dispose();
  });
});

describe('Leaves', () => {
  it('starts the leaves once, then runs one compute pass a frame', () => {
    const { fx, renderer } = makeFx();
    fx.update(1 / 60, frame);
    expect(renderer.compute).toHaveBeenCalledTimes(2); // init + step
    fx.update(1 / 60, frame);
    fx.update(1 / 60, frame);
    expect(renderer.compute).toHaveBeenCalledTimes(4);
    expect(fx.leaves.count).toBe(1000);
    fx.dispose();
  });

  it('follows leaves.count, and computes nothing without leaves', () => {
    const { fx, store, renderer } = makeFx();
    store.set('leaves.count', 2500);
    expect(fx.leaves.count).toBe(Math.min(2500, MAX_LEAVES));
    store.set('leaves.count', 0);
    fx.update(1 / 60, frame);
    expect(fx.leaves.count).toBe(0);
    expect(fx.leaves.mesh.visible).toBe(false);
    expect(renderer.compute).not.toHaveBeenCalled();
    fx.dispose();
  });

  it('grows the leaves in the crowns over their window, none while the street is hidden', () => {
    const { fx, cameraRig, streetView } = makeFx();
    fx.update(1 / 60, frame);
    const { start, end } = leafWindowAt(cameraRig.anchorZ);
    const expected = crownsInWindow(streetView.trees, start, end).length;
    expect(expected).toBeGreaterThan(4);
    expect(fx.leaves.crownCount).toBe(expected);

    streetView.group.visible = false;
    fx.update(1 / 60, frame);
    expect(fx.leaves.crownCount).toBe(0);
    fx.dispose();
  });

  it('removes its meshes from the scene on dispose', () => {
    const { fx, scene } = makeFx();
    expect(scene.getObjectByName('Rain')).toBeTruthy();
    expect(scene.getObjectByName('Leaves')).toBeTruthy();
    fx.dispose();
    expect(scene.getObjectByName('Rain')).toBeUndefined();
    expect(scene.getObjectByName('Leaves')).toBeUndefined();
  });
});

describe('quality budget', () => {
  it('draws the governor’s share of the drops and leaves, within the tier’s cap', () => {
    const { fx, store, uniforms } = makeFx({ leafCap: 400 });
    uniforms.rainIntensity.value = 1;
    fx.update(1 / 60, frame);
    expect(fx.rain.count).toBe(5000);
    expect(fx.leaves.count).toBe(400); // leaves.count 1000, capped by the tier

    fx.setParticleScale(0.5);
    fx.update(1 / 60, frame);
    expect(fx.rain.count).toBe(2500);
    expect(fx.leaves.count).toBe(200);

    store.set('leaves.count', 300); // under the cap: the scale still applies
    expect(fx.leaves.count).toBe(150);
    fx.setParticleScale(1);
    expect(fx.leaves.count).toBe(300);
    fx.dispose();
  });
});
