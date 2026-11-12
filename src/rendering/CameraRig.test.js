import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Store } from '../core/Store.js';
import { PARAM_DEFS } from '../config/params.schema.js';
import { CAMERA_LIMITS, CameraRig, NEAR_EDGE_X, azimuthSpanFor, maxZoomFor } from './CameraRig.js';

// The ground that always exists round the taxi: the near apron ends at x = −24, the far one at
// +26 (behind the houses), the chunks reach 5 behind and 7 ahead (`StreetView`)
const GROUND = { zBack: -95, zFront: 135 };
const TAXI_Z = 500;
const ASPECTS = { phone: 9 / 19.5, desktop: 16 / 9, ultrawide: 21 / 9 };

/** Where each ray through a 5 × 5 grid of the frame first meets the (curved) ground. */
function groundHits(cam, curveDown) {
  const groundY = (z) => 0.15 - curveDown * Math.max(0, Math.abs(z - TAXI_Z) - 20) ** 2;
  const hits = [];
  for (const nx of [-1, -0.5, 0, 0.5, 1]) {
    for (const ny of [-1, -0.5, 0, 0.5, 1]) {
      const d = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
      for (let t = 0.25; t < 300; t += 0.25) {
        const p = cam.position.clone().addScaledVector(d, t);
        if (p.y <= groundY(p.z)) {
          hits.push({ x: p.x, z: p.z - TAXI_Z });
          break;
        }
      }
    }
  }
  return hits;
}

function viewFrom(store, view, aspect) {
  const rig = new CameraRig(store, null);
  rig.camera.aspect = aspect;
  rig.camera.updateProjectionMatrix();
  rig.setView(view);
  rig.update(0, 0, 0.55, 0, TAXI_Z);
  rig.camera.updateMatrixWorld();
  return rig;
}

describe('CameraRig limits (the viewer never sees where the world ends)', () => {
  const store = new Store(PARAM_DEFS);
  const L = CAMERA_LIMITS;
  const azs = [L.minAzimuth, -Math.PI * 1.2, -Math.PI, -Math.PI * 0.8, L.maxAzimuth];
  const els = [L.minElevation, 0.2, 0.45, 0.6, 0.8, 1.0, L.maxElevation];

  it('holds the azimuth, the elevation and the zoom to the viewer limits', () => {
    const rig = viewFrom(store, { az: -0.5, el: 2, zoom: 10 }, 16 / 9);
    expect(rig.azimuth).toBeCloseTo(L.maxAzimuth, 6);
    expect(rig.elevation).toBeCloseTo(L.maxElevation, 6);
    expect(rig.zoom).toBeLessThanOrEqual(L.maxZoom);
    expect(rig.followTaxi).toBe(true);
    rig.dispose();
  });

  it('swings less to the side the lower and the wider the frame', () => {
    const deg = Math.PI / 180;
    expect(azimuthSpanFor(L.maxElevation, 16 / 9, 26)).toBeCloseTo(60 * deg, 6);
    // Low, the frame's edge stays short of looking straight along the near side
    expect(azimuthSpanFor(L.minElevation, 16 / 9, 26)).toBeLessThan(55 * deg);
    expect(azimuthSpanFor(L.minElevation, 21 / 9, 26)).toBeLessThan(
      azimuthSpanFor(L.minElevation, 16 / 9, 26),
    );
    for (const el of [0.01, 0.2, 0.4, 0.6, 0.9]) {
      expect(azimuthSpanFor(el + 0.1, 16 / 9, 26)).toBeGreaterThanOrEqual(
        azimuthSpanFor(el, 16 / 9, 26),
      );
    }
  });

  it('zooms out less the more the camera faces the near side and the lower it sits', () => {
    expect(maxZoomFor(-Math.PI, 0.01, 21.5, 1.75)).toBeLessThan(
      maxZoomFor(-Math.PI, 0.8, 21.5, 1.75),
    );
    expect(maxZoomFor(-Math.PI, 0.3, 21.5, 1.75)).toBeLessThan(
      maxZoomFor(L.maxAzimuth, 0.3, 21.5, 1.75),
    );
  });

  for (const [name, aspect] of Object.entries(ASPECTS)) {
    it(`shows no edge of the world from any extreme view (${name})`, () => {
      const curve = store.get('curve.down');
      for (const az of azs) {
        for (const el of els) {
          for (const zoom of [L.minZoom, 1, 99]) {
            const rig = viewFrom(store, { az, el, zoom }, aspect);
            const at = `az ${az.toFixed(2)} el ${el} zoom ${zoom}`;
            const cam = rig.camera.position;
            expect(cam.x, `camera behind the near edge: ${at}`).toBeGreaterThan(NEAR_EDGE_X);
            expect(cam.y, `camera under the sidewalk: ${at}`).toBeGreaterThan(0.5);
            for (const h of groundHits(rig.camera, curve)) {
              expect(h.x, `ground past the near edge: ${at}`).toBeGreaterThan(NEAR_EDGE_X);
              expect(h.z, `street end behind: ${at}`).toBeGreaterThan(GROUND.zBack);
              expect(h.z, `street end ahead: ${at}`).toBeLessThan(GROUND.zFront);
            }
            rig.dispose();
          }
        }
      }
    });
  }
});
