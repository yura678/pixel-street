/**
 * Asphalt road (`RoadView`): the ribbon between the two concrete gutters of the street profile
 * (`config/streetProfile.js`, x ∈ [−3.45, +2.05], `y = 0`) with the dashed centre line, damp
 * patches, rain ripples and Fresnel reflections. It follows the taxi in `SNAP_Z` steps from
 * `RIBBON_BACK` to `RIBBON_FRONT` metres around it. Curbs, gutters and sidewalks are built
 * chunk by chunk under the same ribbon by `StreetProfileView`.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  cameraPosition,
  clamp,
  dot,
  float,
  fract,
  fwidth,
  max,
  mix,
  modelWorldMatrix,
  normalize,
  normalWorld,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { System } from '../core/System.js';
import { createAsphaltTexture } from '../textures/PixelCanvas.js';
import { applyWorldCurve } from '../rendering/tsl/curve.js';
import { fbm2D, valueNoise2D } from '../rendering/tsl/noise.js';
import { rainRippleLayer } from '../rendering/tsl/ripples.js';
import {
  CENTER_LINE_X,
  GUTTER_W,
  LANE_X,
  ROAD_FAR_X,
  ROAD_NEAR_X,
} from '../config/streetProfile.js';

/** Extent of the ribbon behind and ahead of the taxi (metres). */
export const RIBBON_BACK = -120;
export const RIBBON_FRONT = 220;
/** The ribbon jumps along with the taxi in steps of this many metres. */
export const SNAP_Z = 2.0;
const RIBBON_STEP_Z = 1.0;
/** Asphalt edges: the seams with the gutters. */
const ASPHALT_X0 = ROAD_NEAR_X + GUTTER_W;
const ASPHALT_X1 = ROAD_FAR_X - GUTTER_W;

export class RoadView extends System {
  /** @type {THREE.Scene} */
  #scene;
  /** @type {import('../core/Store.js').Store} */
  #store;
  /** @type {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} */
  #uniforms;

  /** @type {THREE.Group} */
  #group;
  /** @type {THREE.CanvasTexture} */
  #asphaltTex;

  #reflectionEnabled;
  #reflectionStrength;
  #rippleSpeed;
  #rippleDecay;

  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/Store.js').Store} store
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   */
  constructor(scene, store, uniforms) {
    super('road');
    this.#scene = scene;
    this.#store = store;
    this.#uniforms = uniforms;

    this.#reflectionEnabled = uniform((store.get('water.reflection') ?? 'fake') === 'fake' ? 1.0 : 0.0);
    this.#reflectionStrength = uniform(store.get('water.reflectionStrength') ?? 1.0);
    this.#rippleSpeed = uniform(store.get('water.rippleSpeed') ?? 1.6);
    this.#rippleDecay = uniform(store.get('water.rippleDecay') ?? 1.4);

    const seed = store.get('street.seed') ?? 1;
    this.#asphaltTex = this.track(createAsphaltTexture(seed + 7));

    this.#group = new THREE.Group();
    this.#group.name = 'RoadView';

    const roadGeo = this.track(this.#buildAsphaltGeometry());
    const roadMat = this.track(this.#createAsphaltMaterial());
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.name = 'AsphaltRoad';
    roadMesh.receiveShadow = true;
    this.#group.add(roadMesh);

    this.#scene.add(this.#group);
    this.track(() => this.#scene.remove(this.#group));

    this.#bindStore();
  }

  get group() {
    return this.#group;
  }

  update(_dt) {
    const taxiZ = this.#uniforms.taxiPosition.value.z;
    const snappedZ = Math.floor(taxiZ / SNAP_Z) * SNAP_Z;
    if (this.#group.position.z !== snappedZ) {
      this.#group.position.z = snappedZ;
    }
  }

  #bindStore() {
    this.track(
      this.#store.subscribe('water.*', () => {
        this.#reflectionEnabled.value =
          (this.#store.get('water.reflection') ?? 'fake') === 'fake' ? 1.0 : 0.0;
        this.#reflectionStrength.value = this.#store.get('water.reflectionStrength') ?? 1.0;
        this.#rippleSpeed.value = this.#store.get('water.rippleSpeed') ?? 1.6;
        this.#rippleDecay.value = this.#store.get('water.rippleDecay') ?? 1.4;
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Ribbon geometry
  // -------------------------------------------------------------------------

  /**
   * Upward-facing grid between the gutter seams, one row per `RIBBON_STEP_Z` (the world curve
   * bends along Z). The edge columns sit exactly on `ASPHALT_X0` / `ASPHALT_X1`, the X of the
   * gutter strips, so the seams have no crack.
   */
  #buildAsphaltGeometry() {
    const cols = 12;
    const rows = Math.round((RIBBON_FRONT - RIBBON_BACK) / RIBBON_STEP_Z);
    const positions = [];
    const normals = [];
    const indices = [];
    for (let iz = 0; iz <= rows; iz++) {
      const z = RIBBON_BACK + iz * RIBBON_STEP_Z;
      for (let ix = 0; ix <= cols; ix++) {
        const x = ix === cols ? ASPHALT_X1 : ASPHALT_X0 + ((ASPHALT_X1 - ASPHALT_X0) * ix) / cols;
        positions.push(x, 0, z);
        normals.push(0, 1, 0);
      }
    }
    for (let iz = 0; iz < rows; iz++) {
      for (let ix = 0; ix < cols; ix++) {
        const a = iz * (cols + 1) + ix;
        const c = a + cols + 1;
        indices.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  // -------------------------------------------------------------------------
  // TSL wet asphalt
  // -------------------------------------------------------------------------

  #createAsphaltMaterial() {
    const u = this.#uniforms;
    const mat = new THREE.MeshStandardNodeMaterial({
      roughness: 0.84,
      metalness: 0.05,
    });

    applyWorldCurve(mat, u);

    const vWorldXZ = varying(
      modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xz,
      'vRoadWorldXZ',
    );

    const evalSurface = Fn(() => {
      const wx = vWorldXZ.x;
      const wz = vWorldXZ.y;

      // Organic damp depressions biased gently toward the `+2.35` curb gutter. Standing water
      // itself is drawn by `PuddleView` (discrete puddles the wheels can hit); these patches
      // only stay darker and glossier than the rest of the asphalt.
      // (`Sunny` preset has `puddleLevel = 0.14`, so gate the patches above `0.18`)
      const n = fbm2D(vec2(wx.mul(0.38), wz.mul(0.24)));
      const gutterBias = smoothstep(ROAD_FAR_X - 1.3, ROAD_FAR_X - 0.15, wx).mul(0.14);
      const basin = n.add(gutterBias);

      const threshold = float(0.84).sub(u.puddleLevel.mul(0.46));
      const puddleMask = smoothstep(threshold, threshold.add(0.11), basin).mul(
        smoothstep(0.18, 0.45, u.puddleLevel),
      );

      const wet = clamp(u.wetness.add(puddleMask.mul(0.65)), 0.0, 1.0);
      return vec2(wet, puddleMask);
    });

    const surfaceState = evalSurface();

    mat.colorNode = Fn(() => {
      const wx = vWorldXZ.x;
      const wz = vWorldXZ.y;
      const wet = surfaceState.x;
      const puddleMask = surfaceState.y;

      // Multi-scale unwrapped RepeatWrapping sampling eliminates mipmap seam lines & grid tiling
      const texA = texture(this.#asphaltTex, vWorldXZ.mul(0.25)).rgb;
      const texB = texture(this.#asphaltTex, vec2(wz.mul(0.11), wx.mul(-0.11)).add(vec2(0.37, 0.61))).rgb;
      const texCol = mix(texA, texB, 0.35);

      // Subtle lane polish + a dark seam where the asphalt meets either concrete gutter
      const laneWear = float(1.0).sub(
        float(1.0).sub(smoothstep(0.15, 0.85, abs(wx.sub(LANE_X)))).mul(0.07),
      );
      const gutterFar = float(1.0).sub(
        float(1.0).sub(smoothstep(0.0, 0.07, float(ASPHALT_X1).sub(wx))).mul(0.2),
      );
      const gutterNear = float(1.0).sub(
        float(1.0).sub(smoothstep(0.0, 0.07, wx.sub(ASPHALT_X0))).mul(0.2),
      );
      const macro = float(0.95).add(valueNoise2D(vWorldXZ.mul(0.08)).mul(0.1));

      const baseAsphalt = texCol.mul(laneWear).mul(gutterFar).mul(gutterNear).mul(macro);

      // Single crisp weathered off-white center dashed line down `x = -0.70` (fwidth-antialiased!)
      const paintWear = float(0.86).add(valueNoise2D(vWorldXZ.mul(1.6)).mul(0.14));
      const dashPhase = fract(wz.mul(0.25));
      const dashFw = max(fwidth(wz.mul(0.25)), float(0.008));
      const dashCycle = smoothstep(0.0, dashFw, dashPhase).mul(
        float(1.0).sub(smoothstep(float(0.44).sub(dashFw), 0.44, dashPhase)),
      );
      const lineFw = max(fwidth(wx), float(0.012));
      const centerLine = float(1.0).sub(smoothstep(0.045, float(0.055).add(lineFw), abs(wx.sub(CENTER_LINE_X)))).mul(dashCycle);
      const whitePaint = vec3(0.86, 0.83, 0.77);
      const painted = mix(baseAsphalt, whitePaint, centerLine.mul(paintWear).mul(0.9));

      // Physical porous darkening when wet + darker damp patches
      const wetDark = mix(float(1.0), float(0.56), wet);
      const dampRoad = painted.mul(wetDark);

      // Warm bounce from the sunlit storefronts & peach horizon keeps the asphalt from
      // collapsing into black at this grazing golden-hour sun angle.
      const warmBounce = u.skyHorizon
        .mul(float(0.105))
        .mul(float(1.0).sub(puddleMask.mul(0.6)));

      const puddleTint = u.ambientSky.mul(0.06).add(vec3(0.018, 0.02, 0.026));
      return mix(dampRoad.add(warmBounce), puddleTint, puddleMask.mul(0.25));
    })();

    mat.roughnessNode = Fn(() => {
      const wet = surfaceState.x;
      const puddleMask = surfaceState.y;

      const wetRough = mix(float(0.86), float(0.18), wet);
      return mix(wetRough, float(0.1), puddleMask);
    })();

    mat.metalnessNode = mix(float(0.04), float(0.1), surfaceState.y);

    mat.emissiveNode = Fn(() => {
      const wet = surfaceState.x;
      const puddleMask = surfaceState.y;
      // A whisper of dry sheen keeps the street reading as polished, warm asphalt even
      // when the Golden Hour preset leaves only a light damp film on the surface.
      const waterFilm = max(wet.mul(0.65), puddleMask).add(
        float(0.18).mul(float(1.0).sub(puddleMask)),
      );

      const r1 = rainRippleLayer(vWorldXZ, u.time, this.#rippleSpeed, this.#rippleDecay, vec2(0.0, 0.0));
      const r2 = rainRippleLayer(vWorldXZ, u.time, this.#rippleSpeed, this.#rippleDecay, vec2(4.7, 8.3));
      const ripple = r1.add(r2.mul(0.75)).mul(u.rainIntensity).mul(smoothstep(0.18, 0.55, waterFilm));

      const viewDir = normalize(cameraPosition.sub(positionWorld));
      const ndotv = clamp(dot(normalWorld, viewDir), 0.0, 1.0);
      const fresnel = pow(float(1.0).sub(ndotv), 3.0);

      // Warm golden boutique reflection near the curb + ambient sky sheen
      const nearCurb = float(1.0).sub(
        smoothstep(0.0, 4.4, float(ROAD_FAR_X).sub(vWorldXZ.x)),
      );
      const shimmerZ = sin(vWorldXZ.y.mul(0.65)).mul(0.5).add(0.5);
      const warmShopRefl = vec3(1.0, 0.72, 0.36)
        .mul(float(0.3).add(u.streetLights.mul(0.8)))
        .mul(nearCurb)
        .mul(shimmerZ);

      const reflColor = u.ambientSky
        .mul(0.34)
        .add(warmShopRefl)
        .mul(fresnel.mul(0.8).add(puddleMask.mul(0.3)))
        .mul(waterFilm)
        .mul(this.#reflectionEnabled)
        .mul(this.#reflectionStrength);

      const rippleCrest = u.ambientSky.mul(0.5).add(vec3(0.2, 0.22, 0.26)).mul(ripple).mul(0.5);
      return reflColor.add(rippleCrest);
    })();

    return mat;
  }
}
