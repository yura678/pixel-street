/**
 * Rain (`Rain`): slanted streaks falling through a box around the view, and the tiny crowns of
 * water they throw up where they hit the street.
 *
 * Nothing is uploaded per frame. Every drop takes its place in the box, its speed and its phase
 * from a hash of its index; the vertex shader lets it fall (`fract(phase + time / fallTime)`),
 * blows it along with the wind and wraps it into the box, which follows the view (the box is
 * fixed in the world: a moving camera does not drag the rain along). A drop that reaches the
 * road or a sidewalk turns, for {@link SPLASH_TIME}, into a crown of pixel droplets there.
 *
 * How many drops fall is the weather's rain intensity: Rain (0.5) ≈ 1500, Downpour (1) ≈ 5000
 * ({@link dropsFor}).
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  cameraPosition,
  cos,
  cross,
  float,
  floor,
  fract,
  instanceIndex,
  length,
  max,
  min,
  mix,
  normalize,
  positionGeometry,
  select,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { System } from '../core/System.js';
import { MAX_RAIN_DROPS } from '../config/constants.js';
import {
  BUILDING_LINE_X,
  CURB_H,
  NEAR_BUILDING_LINE_X,
  ROAD_FAR_X,
  ROAD_NEAR_X,
} from '../config/streetProfile.js';
import { clamp } from '../core/math.js';
import { createCurvedPositionNode } from '../rendering/tsl/curve.js';
import { hash21 } from '../rendering/tsl/noise.js';
import { FLASH_COLOR } from '../rendering/tsl/sky.js';

/** The box the rain falls through (metres): across the street, up, along it. */
export const RAIN_BOX = Object.freeze({ x: 32, z: 44 });
/** Drops start this high over the street… */
export const RAIN_TOP = 15;
/** …and fall on below the ground this far, out of sight, before they start again. */
const RAIN_BOTTOM = -1.2;
/** Seconds a crown of droplets stays where a drop hit the street. */
export const SPLASH_TIME = 0.14;
/** Wind (m/s) per unit of `weather.windStrength`. */
const WIND_SPEED = 2.4;
/** Drops at rain intensity 1 (Downpour). */
const FULL_RAIN = 5000;

/**
 * How many drops fall at rain intensity `rain` (0–1).
 * @param {number} rain
 */
export function dropsFor(rain) {
  if (!(rain > 0.005)) return 0;
  return Math.min(MAX_RAIN_DROPS, Math.round(FULL_RAIN * Math.pow(clamp(rain, 0, 1), 1.75)));
}

export class Rain extends System {
  /** @type {THREE.InstancedMesh} */
  #mesh;
  /** @type {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} */
  #uniforms;
  /** Centre of the box (world X and Z). */
  #center = uniform(new THREE.Vector2(0, 0));
  /** Share of the drops drawn (quality governor). */
  #scale = 1;

  /**
   * @param {THREE.Scene} scene
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   */
  constructor(scene, uniforms) {
    super('rain');
    this.#uniforms = uniforms;

    const geo = this.track(new THREE.PlaneGeometry(1, 1, 1, 1));
    const mat = this.track(this.#createMaterial());
    this.#mesh = new THREE.InstancedMesh(geo, mat, MAX_RAIN_DROPS);
    this.#mesh.name = 'Rain';
    this.#mesh.frustumCulled = false;
    this.#mesh.renderOrder = 4;
    this.#mesh.count = 0;
    this.#mesh.visible = false;
    scene.add(this.#mesh);
    this.track(() => {
      scene.remove(this.#mesh);
      this.#mesh.dispose();
    });
  }

  get mesh() {
    return this.#mesh;
  }

  /** Drops falling now. */
  get count() {
    return this.#mesh.visible ? this.#mesh.count : 0;
  }

  /**
   * Centre the box (it is fixed in the world; the drops wrap round its edges).
   * @param {number} x
   * @param {number} z
   */
  setCenter(x, z) {
    this.#center.value.set(x, z);
  }

  /**
   * Draw only this share of the drops (each drop's place comes from its index, so the first n
   * are as evenly spread as all of them).
   * @param {number} scale [0, 1]
   */
  setScale(scale) {
    this.#scale = Math.min(1, Math.max(0, scale));
  }

  update(_dt) {
    const n = Math.round(dropsFor(this.#uniforms.rainIntensity.value) * this.#scale);
    this.#mesh.count = n;
    this.#mesh.visible = n > 0;
  }

  #createMaterial() {
    const u = this.#uniforms;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });

    const i = float(instanceIndex);
    const h1 = hash21(vec2(i, 3.1));
    const h2 = hash21(vec2(i, 17.7));
    const h3 = hash21(vec2(i, 41.3));
    const h4 = hash21(vec2(i, 77.9));

    // Fall: speed, the cycle over the box height, where in it the drop is now
    const speed = h3.mul(2.5).add(8.0);
    const height = RAIN_TOP - RAIN_BOTTOM;
    const cycle = float(height).div(speed);
    const phase = fract(h2.add(u.time.div(cycle)));
    const fallen = phase.mul(cycle);
    const y = float(RAIN_TOP).sub(fallen.mul(speed));

    // Blown along by the wind while it falls, wrapped into the box round its centre
    const wind = vec2(cos(u.windDirection), sin(u.windDirection)).mul(
      u.windStrength.mul(WIND_SPEED),
    );
    const c = this.#center;
    const box = vec2(RAIN_BOX.x, RAIN_BOX.z);
    const wrapInBox = (p) => fract(p.sub(c).div(box).add(0.5)).sub(0.5).mul(box).add(c);
    const base = vec2(h1, h4).mul(box);
    const xzNow = wrapInBox(base.add(wind.mul(fallen)));

    // Where it lands: the road at 0, the sidewalks at the curb's height, no further than the
    // building lines
    const onRoad = step(ROAD_NEAR_X, xzNow.x).mul(step(xzNow.x, ROAD_FAR_X));
    const ground = mix(float(CURB_H), float(0.0), onRoad);
    const onStreet = step(NEAR_BUILDING_LINE_X, xzNow.x).mul(step(xzNow.x, BUILDING_LINE_X));
    const landT = float(RAIN_TOP).sub(ground).div(speed);
    const since = fallen.sub(landT);
    const landed = step(0.0, since);
    const splashing = landed.mul(step(since, SPLASH_TIME)).mul(onStreet);
    const xz = select(landed.greaterThan(0.5), wrapInBox(base.add(wind.mul(landT))), xzNow);

    // A streak while falling: a thin quad along the drop's velocity, turned to the camera
    const vel = vec3(wind.x, speed.negate(), wind.y);
    const axis = normalize(vel);
    const fallCenter = vec3(xz.x, y, xz.y);
    const toCam = normalize(cameraPosition.sub(fallCenter));
    const side = normalize(cross(axis, toCam));
    const streakLen = u.rainIntensity.mul(0.22).add(0.26).mul(h1.mul(0.4).add(0.8));
    const corner = positionGeometry.xy;
    const streak = side.mul(corner.x.mul(0.016)).add(axis.mul(corner.y.mul(streakLen)));

    // A crown of droplets on the ground: a small upright quad facing the camera
    const t = since.div(SPLASH_TIME);
    const size = t.mul(0.05).add(0.07);
    const flatRight = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    const crownCenter = vec3(xz.x, ground.add(size.mul(0.3)), xz.y);
    const crown = flatRight
      .mul(corner.x.mul(size))
      .add(vec3(0.0, corner.y.mul(size.mul(0.6)), 0.0));

    // Hidden once landed (below the ground) unless splashing
    const falling = float(1.0).sub(landed);
    const shown = max(falling, splashing);
    const center = mix(fallCenter, crownCenter, splashing);
    const offset = mix(streak, crown, splashing).mul(shown);
    mat.positionNode = createCurvedPositionNode(u, center).add(offset);

    const vSplash = varying(splashing, 'vRainSplash');
    const vT = varying(min(t, 1.0), 'vRainT');

    // Streak: bright head (leading, at uv.y = 1), fading tail. Crown: a ring of droplets spreading
    // out, drawn on a coarse grid of pixels.
    const st = uv();
    const streakAlpha = mix(float(0.15), float(1.0), st.y).mul(
      float(1.0).sub(smoothstep(0.25, 0.5, abs(st.x.sub(0.5)))),
    );
    const cell = floor(st.mul(vec2(9.0, 5.0)))
      .add(0.5)
      .div(vec2(9.0, 5.0));
    const ring = length(cell.sub(vec2(0.5, 0.0)).mul(vec2(1.0, 1.7)));
    const radius = mix(float(0.2), float(0.48), vT);
    const crownAlpha = float(1.0)
      .sub(step(0.11, abs(ring.sub(radius))))
      .mul(float(1.0).sub(vT));
    const alpha = mix(streakAlpha, crownAlpha, step(0.5, vSplash));

    // Water catches the sky and, at dusk, the warm street lights
    mat.colorNode = mix(u.skyHorizon, vec3(0.8, 0.86, 0.94), 0.55)
      .mul(u.ambientSky.mul(0.35).add(0.55))
      .add(vec3(1.0, 0.78, 0.5).mul(u.streetLights.mul(0.16)))
      .add(vec3(...FLASH_COLOR).mul(u.lightning.mul(0.6)));
    mat.opacityNode = alpha.mul(u.rainIntensity.mul(0.16).add(0.38));
    return mat;
  }
}
