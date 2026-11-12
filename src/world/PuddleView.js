/**
 * Puddles (`PuddleView`): the discrete water bodies of `PuddleField`, drawn as one
 * `InstancedMesh` of quads 1.5 cm above the asphalt.
 *
 *  - Each instance is a unit ellipse scaled to the puddle's radii (rotation, radii and centre
 *    come from the simulation, so a wheel splashes exactly where the water is drawn). The water
 *    line shrinks with `weather.puddleLevel` by the same `puddleScale` formula the wheels use,
 *    has a ragged contour from per-puddle noise and a damp dark rim around it.
 *  - Fake reflection (`water.reflection = 'fake'`): the view ray is mirrored about a normal
 *    perturbed by rain rings and by the wheel ripple ring buffer, then traced against
 *    a stand-in of the street — the taxi as a box, the building line at the sidewalk edge as
 *    shopfronts (glowing at dusk) with lit windows above, and the sky gradient over the roofs.
 *  - Wheel ripples: a ring buffer `uniformArray` of `MAX_RIPPLES` events
 *    `vec4(x, z, startTime, strength)` written by {@link PuddleView#addRipple}.
 */
import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  dot,
  float,
  floor,
  Fn,
  fract,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  normalize,
  positionGeometry,
  positionWorld,
  pow,
  reflect,
  smoothstep,
  sqrt,
  step,
  uniform,
  uniformArray,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { System } from '../core/System.js';
import { hexToRgb } from '../core/color.js';
import { CHUNKS_BEHIND, CHUNK_LENGTH, MAX_PUDDLES, MAX_RIPPLES } from '../config/constants.js';
import { PUDDLE_DRY_LEVEL, PUDDLE_FULL_LEVEL } from '../simulation/puddles/PuddleField.js';
import { applyWorldCurve } from '../rendering/tsl/curve.js';
import { fbm2D, hash21 } from '../rendering/tsl/noise.js';
import { eventRippleSlope, rainRippleSlope } from '../rendering/tsl/ripples.js';
import { BUILDING_LINE_X } from '../config/streetProfile.js';

/** Water surface height above the asphalt (above the tyre tracks at 8 mm). */
const PUDDLE_Y = 0.015;
/** Half size of the instance quad in unit-ellipse units: room for the ragged edge and rim. */
const QUAD_HALF = 1.4;
/** Average lot width of the reflected stand-in street. */
const LOT_W = 6.8;

export const REGATHER_KEYS = new Set(['street.seed', 'water.puddleCount', 'water.puddleSize']);

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _rgb = { r: 0, g: 0, b: 0 };

export class PuddleView extends System {
  /** @type {THREE.Scene} */
  #scene;
  /** @type {import('../core/Store.js').Store} */
  #store;
  /** @type {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} */
  #uniforms;
  /** @type {import('../simulation/puddles/PuddleField.js').PuddleField} */
  #field;

  /** @type {THREE.InstancedMesh} */
  #mesh;
  /** @type {THREE.InstancedBufferAttribute} */
  #seedAttr;

  /** @type {THREE.Vector4[]} */
  #rippleData;
  #rippleHead = 0;
  #ripples;

  #reflectionEnabled;
  #reflectionStrength;
  #rippleSpeed;
  #rippleDecay;
  #taxiColor;
  #taxiVisible = uniform(1.0);

  #cameraZ = null;
  #minChunk = null;
  #maxChunk = null;
  #dirty = true;

  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/Store.js').Store} store
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   * @param {import('../simulation/puddles/PuddleField.js').PuddleField} field
   */
  constructor(scene, store, uniforms, field) {
    super('puddles');
    this.#scene = scene;
    this.#store = store;
    this.#uniforms = uniforms;
    this.#field = field;

    this.#reflectionEnabled = uniform(0.0);
    this.#reflectionStrength = uniform(1.0);
    this.#rippleSpeed = uniform(1.6);
    this.#rippleDecay = uniform(1.4);
    this.#taxiColor = uniform(new THREE.Color(0xeba426));
    this.#syncParams();

    this.#rippleData = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -1e4, 0));
    this.#ripples = uniformArray(this.#rippleData, 'vec4');

    this.#seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUDDLES), 1);

    const geo = this.track(new THREE.PlaneGeometry(QUAD_HALF * 2, QUAD_HALF * 2, 1, 1));
    geo.rotateX(-Math.PI / 2);
    const mat = this.track(this.#createMaterial());

    this.#mesh = new THREE.InstancedMesh(geo, mat, MAX_PUDDLES);
    this.#mesh.name = 'Puddles';
    this.#mesh.count = 0;
    this.#mesh.frustumCulled = false;
    this.#mesh.receiveShadow = true;
    this.#mesh.renderOrder = 2;
    this.#scene.add(this.#mesh);
    this.track(() => {
      this.#scene.remove(this.#mesh);
      this.#mesh.dispose();
    });

    this.track(
      this.#store.subscribe('*', (keys) => {
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (REGATHER_KEYS.has(k)) this.#dirty = true;
          if (k === 'street.drawChunks') this.#minChunk = null;
          if (k.startsWith('water.') || k === 'taxi.color') this.#syncParams();
        }
      }),
    );
  }

  get mesh() {
    return this.#mesh;
  }

  /** Number of puddles currently drawn. */
  get count() {
    return this.#mesh.count;
  }

  /**
   * Keep the puddles around the camera loaded as well as around the taxi (same window as
   * `StreetView`).
   * @param {number} z
   */
  setCameraZ(z) {
    this.#cameraZ = z;
  }

  /** The taxi box only shows up in reflections while the taxi itself is drawn. */
  setTaxiVisible(visible) {
    this.#taxiVisible.value = visible ? 1.0 : 0.0;
  }

  /**
   * Start an expanding ring on the water (world X/Z of the visual scene).
   * @param {number} x
   * @param {number} z
   * @param {number} [strength=1]
   */
  addRipple(x, z, strength = 1) {
    this.#rippleData[this.#rippleHead].set(x, z, this.#uniforms.time.value, strength);
    this.#rippleHead = (this.#rippleHead + 1) % MAX_RIPPLES;
  }

  update(_dt) {
    const taxiZ = this.#uniforms.taxiPosition.value.z;
    const camZ = this.#cameraZ ?? taxiZ;
    const c1 = Math.floor(taxiZ / CHUNK_LENGTH);
    const c2 = Math.floor(camZ / CHUNK_LENGTH);
    const drawChunks = Math.max(3, this.#store.get('street.drawChunks') ?? 7);
    const minChunk = Math.min(c1, c2) - CHUNKS_BEHIND;
    const maxChunk = Math.max(c1, c2) + drawChunks;
    if (!this.#dirty && minChunk === this.#minChunk && maxChunk === this.#maxChunk) return;

    this.#dirty = false;
    this.#minChunk = minChunk;
    this.#maxChunk = maxChunk;
    this.#gather(minChunk, maxChunk);
  }

  #gather(minChunk, maxChunk) {
    const seeds = this.#seedAttr.array;
    let n = 0;
    for (let c = minChunk; c <= maxChunk; c++) {
      const puddles = this.#field.getPuddlesForChunk(c);
      for (let i = 0; i < puddles.length && n < MAX_PUDDLES; i++) {
        const p = puddles[i];
        // Same ellipse as `PuddleField.isPointInPuddle`: turned by `p.rotation` about +Y
        _pos.set(p.x, PUDDLE_Y, p.z);
        _quat.setFromAxisAngle(_yAxis, p.rotation);
        _scale.set(p.radiusX, 1, p.radiusZ);
        this.#mesh.setMatrixAt(n, _mat.compose(_pos, _quat, _scale));
        const s = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453;
        seeds[n] = s - Math.floor(s);
        n++;
      }
    }
    this.#mesh.count = n;
    this.#mesh.instanceMatrix.needsUpdate = true;
    this.#seedAttr.needsUpdate = true;
  }

  #syncParams() {
    const s = this.#store;
    this.#reflectionEnabled.value = (s.get('water.reflection') ?? 'fake') === 'fake' ? 1.0 : 0.0;
    this.#reflectionStrength.value = s.get('water.reflectionStrength') ?? 1.0;
    this.#rippleSpeed.value = s.get('water.rippleSpeed') ?? 1.6;
    this.#rippleDecay.value = s.get('water.rippleDecay') ?? 1.4;
    hexToRgb(s.get('taxi.color') ?? '#eba426', _rgb);
    this.#taxiColor.value.setRGB(_rgb.r, _rgb.g, _rgb.b);
  }

  // -------------------------------------------------------------------------
  // TSL water
  // -------------------------------------------------------------------------

  #createMaterial() {
    const u = this.#uniforms;
    const mat = new THREE.MeshStandardNodeMaterial({
      transparent: true,
      depthWrite: false,
      roughness: 0.05,
      metalness: 0.0,
    });
    applyWorldCurve(mat, u);

    const vSeed = varying(instancedBufferAttribute(this.#seedAttr, 'float'), 'vPuddleSeed');
    const vUnit = varying(positionGeometry.xz, 'vPuddleUnit');

    // 1. Water line & damp rim in unit-ellipse space
    const mask = Fn(() => {
      const d = length(vUnit);
      const level = clamp(
        u.puddleLevel.sub(PUDDLE_DRY_LEVEL).div(PUDDLE_FULL_LEVEL - PUDDLE_DRY_LEVEL),
        0.0,
        1.0,
      );
      const scale = sqrt(level);
      const ragged = fbm2D(vUnit.mul(1.7).add(vSeed.mul(37.0)));
      const contour = scale.mul(float(0.9).add(ragged.mul(0.22)));
      const water = float(1.0)
        .sub(smoothstep(contour.sub(0.07), contour, d))
        .mul(step(0.02, scale));
      const rimWidth = scale.mul(0.22).add(0.1);
      const rim = float(1.0)
        .sub(smoothstep(contour, contour.add(rimWidth), d))
        .mul(smoothstep(0.0, 0.12, scale));
      return vec2(water, rim);
    })();
    const water = mask.x;
    const rim = mask.y;

    // 2. Surface slope: rain rings (denser than on the asphalt) + wheel ripple rings
    const slope = Fn(() => {
      const wxz = positionWorld.xz;
      const rainA = rainRippleSlope(
        wxz,
        u.time,
        this.#rippleSpeed,
        this.#rippleDecay,
        u.rainIntensity,
        float(3.1),
        vec2(0.0, 0.0),
      );
      const rainB = rainRippleSlope(
        wxz,
        u.time,
        this.#rippleSpeed.mul(0.83),
        this.#rippleDecay,
        u.rainIntensity,
        float(3.1),
        vec2(0.37, 0.71),
      );
      const wheels = eventRippleSlope(
        wxz,
        this.#ripples,
        MAX_RIPPLES,
        u.time,
        this.#rippleSpeed.mul(0.55),
        this.#rippleDecay,
      );
      return rainA.add(rainB.mul(0.8)).mul(0.2).add(wheels.mul(0.3));
    })();

    // 3. Fake reflection of the street
    const reflection = Fn(() => {
      const P = positionWorld;
      const V = normalize(P.sub(cameraPosition));
      const N = normalize(vec3(slope.x.negate(), 1.0, slope.y.negate()));
      const Rr = reflect(V, N);
      const R = normalize(vec3(Rr.x, max(Rr.y, 0.004), Rr.z));

      // Overall daylight on the reflected scene (presets darken it at dusk)
      const daylight = u.ambientSky.mul(0.42).add(u.skyHorizon.mul(0.22));
      const night = u.streetLights;

      // a) Sky over the roofs
      const sky = mix(u.skyHorizon, u.skyZenith, smoothstep(0.02, 0.55, R.y));

      // b) Building line at the sidewalk edge, traced as a vertical plane
      const towardWall = smoothstep(0.02, 0.12, R.x);
      const tWall = float(BUILDING_LINE_X).sub(P.x).div(max(R.x, 0.02));
      const hit = P.add(R.mul(tWall));
      const lot = floor(hit.z.div(LOT_W));
      const lotRnd = hash21(vec2(lot, 7.0));
      const roofH = float(6.0).add(lotRnd.mul(9.5));
      const onFacade = towardWall.mul(step(hit.y, roofH));

      const brick = mix(vec3(0.42, 0.22, 0.17), vec3(0.6, 0.55, 0.46), hash21(vec2(lot, 3.0)));
      const wall = brick.mul(daylight);

      // Ground floor: dark bulkhead, shop glass glowing warm at dusk, sign band
      const bay = fract(hit.z.div(1.7));
      const mullion = step(0.08, bay).mul(step(bay, 0.92));
      const shopLit = step(hash21(vec2(floor(hit.z.div(1.7)), 11.0)), 0.8);
      const glow = vec3(1.0, 0.72, 0.4)
        .mul(float(0.16).add(night.mul(1.15)))
        .mul(shopLit);
      const glass = sky.mul(0.32).add(glow).mul(mullion);
      // Sign band: dark fascia with a sign board in the middle of the lot, lit at dusk
      const signHue = hash21(vec2(lot, 19.0));
      const signCol = mix(vec3(0.55, 0.22, 0.18), vec3(0.2, 0.45, 0.42), step(0.5, signHue));
      const signU = fract(hit.z.div(LOT_W));
      const board = step(0.25, signU).mul(step(signU, 0.75));
      const sign = mix(wall.mul(0.45), signCol.mul(float(0.12).add(night.mul(0.9))), board);
      const isGlass = step(0.55, hit.y).mul(step(hit.y, 2.9));
      const isSign = step(2.9, hit.y).mul(step(hit.y, 3.4));
      const ground = mix(mix(wall.mul(0.35), glass, isGlass), sign, isSign);

      // Upper floors: wall with a window grid, some windows lit
      const fy = fract(hit.y.sub(3.6).div(3.1));
      const fz = fract(hit.z.div(1.75));
      const isWin = step(0.18, fy).mul(step(fy, 0.72)).mul(step(0.25, fz)).mul(step(fz, 0.75));
      const cellId = vec2(floor(hit.z.div(1.75)), floor(hit.y.sub(3.6).div(3.1)));
      const winLit = step(hash21(cellId.add(vec2(5.3, 1.7))), u.windowLights);
      const winCol = mix(sky.mul(0.35), vec3(1.0, 0.78, 0.45).mul(1.1), winLit);
      const upper = mix(wall, winCol, isWin);
      const facade = mix(ground, upper, step(3.4, hit.y));

      // c) The taxi as a box (slab test): underbody, yellow body, dark glass
      const tp = u.taxiPosition;
      const bmin = vec3(tp.x.sub(0.92), 0.22, tp.z.sub(2.3));
      const bmax = vec3(tp.x.add(0.92), 1.46, tp.z.add(2.35));
      const Rs = R.add(vec3(1e-5, 1e-5, 1e-5));
      const t1 = bmin.sub(P).div(Rs);
      const t2 = bmax.sub(P).div(Rs);
      const tNear = max(max(min(t1.x, t2.x), min(t1.y, t2.y)), min(t1.z, t2.z));
      const tFar = min(min(max(t1.x, t2.x), max(t1.y, t2.y)), max(t1.z, t2.z));
      const hitTaxi = step(tNear, tFar).mul(step(0.0, tFar)).mul(this.#taxiVisible);
      const hy = P.y.add(R.y.mul(max(tNear, 0.0)));
      const body = this.#taxiColor.mul(daylight.mul(1.7));
      const cabin = mix(vec3(0.04, 0.05, 0.07), sky.mul(0.4), 0.3);
      const taxi = mix(mix(vec3(0.025, 0.025, 0.03), body, step(0.5, hy)), cabin, step(0.98, hy));

      const street = mix(mix(sky, facade, onFacade), taxi, hitTaxi);

      // Schlick-like Fresnel, a touch stronger so shallow puddles still read as mirrors
      const cosT = clamp(dot(N, V.negate()), 0.0, 1.0);
      const fresnel = float(0.04).add(pow(float(1.0).sub(cosT), 4.0).mul(0.96));
      return street.mul(fresnel);
    })();

    // Rings catch the light on their crests (visible even with reflections off)
    const crest = clamp(length(slope).mul(3.0), 0.0, 1.0);

    mat.colorNode = mix(vec3(0.035, 0.036, 0.04), vec3(0.01, 0.012, 0.016), water);
    mat.roughnessNode = mix(float(0.35), float(0.03), water);
    mat.opacityNode = max(water.mul(0.94), rim.mul(0.5));
    const emissive = reflection
      .mul(this.#reflectionEnabled.mul(this.#reflectionStrength))
      .add(u.skyHorizon.mul(0.05).mul(float(1.0).sub(this.#reflectionEnabled)))
      .add(u.ambientSky.mul(0.12).mul(crest))
      .mul(water);
    // Clamp guards the bloom against stray values from the slab test at grazing angles
    mat.emissiveNode = min(max(emissive, vec3(0.0)), vec3(8.0));
    return mat;
  }
}
