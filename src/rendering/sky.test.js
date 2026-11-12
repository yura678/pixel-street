import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Store } from '../core/Store.js';
import { degToRad } from '../core/math.js';
import { PARAM_DEFS } from '../config/params.schema.js';
import { PRESETS } from '../config/weatherPresets.js';
import { Lighting } from './Lighting.js';
import { WorldUniforms, sunDirectionOf } from './uniforms/WorldUniforms.js';
import { skyFogNode } from './tsl/sky.js';
import { SkyView } from '../world/SkyView.js';

describe('Sky', () => {
  it('points the sky’s sun where the sun light shines from, in every preset', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      const store = new Store(PARAM_DEFS);
      store.set('lighting.sunAzimuth', preset['lighting.sunAzimuth']);
      store.set('lighting.sunElevation', preset['lighting.sunElevation']);
      const lighting = new Lighting(new THREE.Scene(), store);
      const toSun = lighting.sun.position.clone().sub(lighting.sun.target.position).normalize();
      const dir = sunDirectionOf(
        degToRad(preset['lighting.sunAzimuth']),
        degToRad(preset['lighting.sunElevation']),
        new THREE.Vector3(),
      );
      expect(dir.length(), name).toBeCloseTo(1, 9);
      // Horizontal bearing the same; the light is held at least 2.5 m up, so compare XZ
      const a = Math.atan2(toSun.x, toSun.z);
      const b = Math.atan2(dir.x, dir.z);
      expect(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))), name).toBeLessThan(0.03);
      lighting.dispose();
    }
  });

  it('keeps the uniforms’ sun on the store’s angles', () => {
    const store = new Store(PARAM_DEFS);
    const u = new WorldUniforms(store);
    const expected = sunDirectionOf(
      degToRad(store.get('lighting.sunAzimuth')),
      degToRad(store.get('lighting.sunElevation')),
      new THREE.Vector3(),
    );
    expect(u.sunDirection.value.distanceTo(expected)).toBeLessThan(1e-9);
    u.setSunAngles(0, Math.PI / 2);
    expect(u.sunDirection.value.y).toBeCloseTo(1, 9);
  });

  it('builds the dome and the sky-coloured fog, the dome following the camera', () => {
    const store = new Store(PARAM_DEFS);
    const u = new WorldUniforms(store);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const sky = new SkyView(scene, u, camera);
    expect(scene.getObjectByName('SkyDome')).toBe(sky.mesh);
    camera.position.set(3, 4, 120);
    sky.update();
    expect(sky.mesh.position.toArray()).toEqual([3, 4, 120]);
    expect(skyFogNode(u).isNode).toBe(true);
    sky.dispose();
    expect(scene.getObjectByName('SkyDome')).toBeUndefined();
  });
});
