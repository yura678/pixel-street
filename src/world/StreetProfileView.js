/**
 * Street profile (`StreetProfileView`): both curbs, gutters and sidewalks, built chunk by chunk
 * from `config/streetProfile.js` by one generator — the near side is the same profile mirrored
 * (`side = −1`). The asphalt between the gutters stays a ribbon in `RoadView`.
 *
 *  - Curb: granite blocks `CURB_BLOCK` long — a vertical face to the gutter, a chamfer on the
 *    road edge, a top level with the slabs. Both ends of every block are bevelled by
 *    `CURB_JOINT`, so neighbours meet in a V joint; they share the inset joint section, which
 *    keeps the run watertight (also across chunks).
 *  - Dropped curb at an alley mouth: the same block, its face `DROPPED_CURB_H` high and its top
 *    a ramp up to the slabs; the first and last blocks of the mouth ramp along the street.
 *  - Gutter: a concrete strip `GUTTER_W` wide, flush with the asphalt, running under the curb.
 *  - Slabs to the building line and the foundation apron behind it, on both sides (the near
 *    side's building line `NEAR_BUILDING_LINE_X` has no houses: the apron is all there is).
 *
 * Surfaces (`aSurface`): 0 curb, 1 slabs, 2 foundation apron, 3 gutter. Chunks stream with the
 * asphalt ribbon around the taxi.
 *
 * Also here: where the street fixtures sit — gutter grates on lot boundaries and manholes in
 * the lanes ({@link placeRoadFixtures}, built by `BuildingFactory` from the facade atlas).
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  clamp,
  dot,
  float,
  fract,
  fwidth,
  max,
  min,
  mix,
  modelWorldMatrix,
  normalize,
  normalWorld,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  step,
  texture,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { System } from '../core/System.js';
import { Events } from '../core/EventBus.js';
import { CHUNK_LENGTH } from '../config/constants.js';
import {
  BUILDING_LINE_X,
  CENTER_LINE_X,
  CURB_BLOCK,
  CURB_CHAMFER,
  CURB_H,
  CURB_JOINT,
  CURB_W,
  DROPPED_CURB_H,
  GUTTER_W,
  NEAR_BUILDING_LINE_X,
  ROAD_FAR_X,
  ROAD_NEAR_X,
} from '../config/streetProfile.js';
import { LotType, StreetLayout, TOTAL_LOOP_CHUNKS } from '../simulation/street/StreetLayout.js';
import { createCobbleTexture } from '../textures/PixelCanvas.js';
import { applyWorldCurve } from '../rendering/tsl/curve.js';
import { valueNoise2D } from '../rendering/tsl/noise.js';
import { RIBBON_BACK, RIBBON_FRONT, SNAP_Z } from './RoadView.js';

export const Surface = Object.freeze({ CURB: 0, SLAB: 1, LOT: 2, GUTTER: 3 });

/** The gutter runs this far under the curb: the V joints never open onto a hole. */
const GUTTER_UNDER_CURB = 0.04;
/** Far ends of the foundation aprons behind both building lines. */
const NEAR_APRON_END_X = -24.0;
const LOT_APRON_END_X = 26.0;
/** Vertex spacing of the flat strips along the street (the world curve bends along Z). */
const STEP_Z = 1.0;
/** An alley mouth keeps this far from the ends of its lot; shorter mouths stay full height. */
const MOUTH_MARGIN = 0.4;
const MIN_MOUTH_BLOCKS = 3;

/** Manhole cover radius, and the free asphalt it keeps to paint and gutters. */
export const MANHOLE_R = 0.46;
/** Gutter grate: two square atlas tiles along the street. */
export const GRATE_W = 0.26;
export const GRATE_L = 0.52;

export const REGEN_KEYS = new Set(['street.seed', 'taxi.busStopInterval']);

/**
 * Curb front height along the street for one chunk: full everywhere but at alley mouths.
 * A mouth is the run of whole blocks inside the lot (`MOUTH_MARGIN` from its ends): its first
 * and last blocks ramp down and up, the blocks between stay dropped.
 * @param {{ right: object[] }} layout
 * @returns {(z: number) => number} world Z → front height above the gutter
 */
export function curbHeightProfile(layout) {
  const mouths = [];
  for (const lot of layout.right) {
    if (lot.type !== LotType.ALLEY) continue;
    const k0 = Math.ceil((lot.zStart + MOUTH_MARGIN) / CURB_BLOCK);
    const k1 = Math.floor((lot.zEnd - MOUTH_MARGIN) / CURB_BLOCK);
    if (k1 - k0 >= MIN_MOUTH_BLOCKS) mouths.push([k0 * CURB_BLOCK, k1 * CURB_BLOCK]);
  }
  return (z) => {
    for (const [z0, z1] of mouths) {
      if (z <= z0 || z >= z1) continue;
      const t = Math.min(z - z0, z1 - z, CURB_BLOCK) / CURB_BLOCK;
      return t >= 1 ? DROPPED_CURB_H : CURB_H + (DROPPED_CURB_H - CURB_H) * t;
    }
    return CURB_H;
  };
}

/**
 * Curb cross-section in `(d, y)`: `d` from the road edge into the curb. `hf` is the height of
 * the face; the top runs from the chamfer back to the slabs at `CURB_H` (level for a full
 * curb, a ramp for a dropped one). `inset` gives the section at a block end (the bottom of
 * the V joint): face and chamfer pulled in by `CURB_JOINT`, the top tapering to the slabs.
 * @param {number} hf
 * @param {boolean} inset
 * @returns {number[][]} four points: face foot, chamfer foot, chamfer top, back of the top
 */
export function curbSection(hf, inset) {
  const c = Math.min(CURB_CHAMFER, hf * 0.5);
  const e = inset ? CURB_JOINT : 0;
  return [
    [e, 0],
    [e, hf - c],
    [c + e, hf - e],
    [CURB_W, CURB_H],
  ];
}

/** Geometry accumulator: flat-shaded quads and Z-ribbons with a surface id. */
class ProfileBuilder {
  positions = [];
  normals = [];
  surfaces = [];
  indices = [];

  /**
   * A quad (corners in order round it), its normal turned to point along `hint`.
   * @param {number[][]} p four `[x, y, z]`
   * @param {number[]} hint any direction on the outer side of the face
   * @param {number} surface
   * @param {number} [lean] lean the shading normal this far toward straight up (0…1): a narrow
   *   bevel then shades like the top beside it instead of a razor-thin bright line that
   *   shimmers under a low sun
   */
  quad(p, hint, surface, lean = 0) {
    let [a, b, c, d] = p;
    // Normal from the diagonals: robust for the slightly warped quads of a ramp
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const v = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-12) return;
    n = n.map((x) => x / len);
    if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
      [b, d] = [d, b];
      n = n.map((x) => -x);
    }
    if (lean > 0) {
      n = [n[0] * (1 - lean), n[1] * (1 - lean) + lean, n[2] * (1 - lean)];
      const l = Math.hypot(n[0], n[1], n[2]);
      n = n.map((x) => x / l);
    }
    const base = this.positions.length / 3;
    for (const q of [a, b, c, d]) {
      this.positions.push(q[0], q[1], q[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.surfaces.push(surface);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * Level strip `x0 < x1` at height `y` along `z ∈ [0, length]`, facing up.
   * @param {number} x0
   * @param {number} x1
   * @param {number} y
   * @param {number} length
   * @param {number} surface
   */
  strip(x0, x1, y, length, surface) {
    const base = this.positions.length / 3;
    const n = Math.round(length / STEP_Z);
    for (let i = 0; i <= n; i++) {
      const z = (i * length) / n;
      this.positions.push(x0, y, z, x1, y, z);
      this.normals.push(0, 1, 0, 0, 1, 0);
      this.surfaces.push(surface, surface);
    }
    for (let i = 0; i < n; i++) {
      const r = base + i * 2;
      this.indices.push(r, r + 2, r + 1, r + 1, r + 2, r + 3);
    }
  }

  /**
   * One curb block between world `z0` and `z0 + CURB_BLOCK`, drawn at `z − zOrigin`.
   * @param {number} edgeX road edge (curb face)
   * @param {1 | -1} side +1 far (curb toward +X), −1 near
   * @param {number} z0
   * @param {number} zOrigin
   * @param {(z: number) => number} heightAt
   */
  curbBlock(edgeX, side, z0, zOrigin, heightAt) {
    const z1 = z0 + CURB_BLOCK;
    const zs = [z0, z0 + CURB_JOINT, z1 - CURB_JOINT, z1];
    const sections = zs.map((z, i) => {
      const inset = i === 0 || i === 3;
      return curbSection(heightAt(z), inset).map(([d, y]) => [edgeX + side * d, y, z - zOrigin]);
    });
    // A point inside the block: every face's outer side points away from it
    const inner = [edgeX + side * CURB_W * 0.6, 0.02, (z0 + z1) * 0.5 - zOrigin];
    for (let j = 0; j < 3; j++) {
      const s0 = sections[j];
      const s1 = sections[j + 1];
      for (let k = 0; k < 3; k++) {
        const p = [s0[k], s0[k + 1], s1[k + 1], s1[k]];
        const hint = [0, 1, 2].map(
          (a) => (p[0][a] + p[1][a] + p[2][a] + p[3][a]) * 0.25 - inner[a],
        );
        // k = 1 is the chamfer: shaded nearly like the top
        this.quad(p, hint, Surface.CURB, k === 1 ? 0.75 : 0);
      }
    }
  }

  toGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute('aSurface', new THREE.Float32BufferAttribute(this.surfaces, 1));
    geo.setIndex(this.indices);
    geo.computeBoundingSphere();
    return geo;
  }
}

/**
 * The profile of one chunk in chunk-local Z (`0 … CHUNK_LENGTH`; place it at `zStart`).
 * @param {{ zStart: number, right: object[] }} layout
 * @returns {THREE.BufferGeometry}
 */
export function buildProfileChunk(layout) {
  const b = new ProfileBuilder();
  const L = CHUNK_LENGTH;
  const z0 = layout.zStart;
  const farHeight = curbHeightProfile(layout);
  const fullHeight = () => CURB_H;

  // Far side (+X): gutter, curb, slabs, the apron under the lots
  b.strip(ROAD_FAR_X - GUTTER_W, ROAD_FAR_X + GUTTER_UNDER_CURB, 0, L, Surface.GUTTER);
  b.strip(ROAD_FAR_X + CURB_W, BUILDING_LINE_X, CURB_H, L, Surface.SLAB);
  b.strip(BUILDING_LINE_X, LOT_APRON_END_X, CURB_H - 0.004, L, Surface.LOT);

  // Near side (−X): the same profile mirrored, the apron behind its building line
  b.strip(ROAD_NEAR_X - GUTTER_UNDER_CURB, ROAD_NEAR_X + GUTTER_W, 0, L, Surface.GUTTER);
  b.strip(NEAR_BUILDING_LINE_X, ROAD_NEAR_X - CURB_W, CURB_H, L, Surface.SLAB);
  b.strip(NEAR_APRON_END_X, NEAR_BUILDING_LINE_X, CURB_H - 0.004, L, Surface.LOT);

  for (let z = z0; z < z0 + L - 1e-6; z += CURB_BLOCK) {
    b.curbBlock(ROAD_FAR_X, 1, z, z0, farHeight);
    b.curbBlock(ROAD_NEAR_X, -1, z, z0, fullHeight);
  }
  return b.toGeometry();
}

/** The sewer main runs under the middle of the near lane, between its wheel paths. */
export const SEWER_X = (ROAD_NEAR_X + GUTTER_W + CENTER_LINE_X) * 0.5;
/** Manholes on the sewer main: one every this many chunks of the loop (40 m). */
export const MANHOLE_EVERY = 2;

/**
 * Where the street fixtures of one chunk sit (world coordinates):
 *  - a gutter grate in each gutter on a lot boundary (far: the second lot, near: the third
 *    lot or the chunk start), centred in the gutter;
 *  - a manhole on the sewer main (`SEWER_X`, the middle of the near lane – out of the wheel
 *    paths and out of the taxi's lane) every `MANHOLE_EVERY` chunks of the loop, near the
 *    middle of the chunk: a straight run of sewer gets one at a steady interval, not a lid
 *    thrown anywhere across the road.
 * @param {object[]} lots `chunkLayout.right`
 * @param {number} zStart
 * @param {import('../core/random.js').Rng} rng
 * @returns {{ grates: { x: number, z: number }[], manhole: { x: number, z: number } | null }}
 */
export function placeRoadFixtures(lots, zStart, rng) {
  const n = TOTAL_LOOP_CHUNKS;
  const loopChunk = ((Math.round(zStart / CHUNK_LENGTH) % n) + n) % n;
  const jitter = rng.range(-3, 3);
  const manhole =
    loopChunk % MANHOLE_EVERY === 0
      ? { x: SEWER_X, z: zStart + CHUNK_LENGTH * 0.5 + jitter }
      : null;
  const farLot = lots[1] ?? lots[0];
  const nearLot = lots[2] ?? lots[0];
  const grates = [
    { x: ROAD_FAR_X - GUTTER_W * 0.5, z: farLot.zStart },
    { x: ROAD_NEAR_X + GUTTER_W * 0.5, z: nearLot.zStart },
  ];
  return { grates, manhole };
}

export class StreetProfileView extends System {
  /** @type {THREE.Scene} */
  #scene;
  /** @type {import('../core/Store.js').Store} */
  #store;
  /** @type {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} */
  #uniforms;
  /** @type {THREE.Group} */
  #group;
  /** @type {THREE.CanvasTexture} */
  #cobbleTex;
  /** @type {THREE.MeshStandardNodeMaterial} */
  #material;
  /** @type {Map<number, THREE.Mesh>} */
  #chunks = new Map();
  #dirty = false;

  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/Store.js').Store} store
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   * @param {import('../core/EventBus.js').EventBus} [bus]
   */
  constructor(scene, store, uniforms, bus = null) {
    super('streetProfile');
    this.#scene = scene;
    this.#store = store;
    this.#uniforms = uniforms;

    const seed = store.get('street.seed') ?? 1;
    this.#cobbleTex = this.track(createCobbleTexture(seed + 11));
    this.#material = this.track(this.#createMaterial());

    this.#group = new THREE.Group();
    this.#group.name = 'StreetProfileView';
    this.#scene.add(this.#group);
    this.track(() => {
      this.#clear();
      this.#scene.remove(this.#group);
    });

    this.track(
      store.subscribe('*', (keys) => {
        if (keys.some((k) => REGEN_KEYS.has(k))) this.#dirty = true;
      }),
    );
    if (bus) this.track(bus.on(Events.STREET_REGENERATE, () => (this.#dirty = true)));

    this.update(0);
  }

  get group() {
    return this.#group;
  }

  get activeChunkCount() {
    return this.#chunks.size;
  }

  update(_dt) {
    if (this.#dirty) {
      this.#dirty = false;
      this.#clear();
    }
    // The chunks under the asphalt ribbon of `RoadView` (it follows the taxi in `SNAP_Z` steps)
    const snapped = Math.floor(this.#uniforms.taxiPosition.value.z / SNAP_Z) * SNAP_Z;
    const lo = Math.floor((snapped + RIBBON_BACK) / CHUNK_LENGTH);
    const hi = Math.ceil((snapped + RIBBON_FRONT) / CHUNK_LENGTH) - 1;

    for (const [idx, mesh] of this.#chunks) {
      if (idx >= lo && idx <= hi) continue;
      this.#group.remove(mesh);
      mesh.geometry.dispose();
      this.#chunks.delete(idx);
    }
    for (let idx = lo; idx <= hi; idx++) {
      if (this.#chunks.has(idx)) continue;
      const layout = StreetLayout.getChunk(idx, this.#store);
      const mesh = new THREE.Mesh(buildProfileChunk(layout), this.#material);
      mesh.name = `StreetProfile_${idx}`;
      mesh.position.z = layout.zStart;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.#group.add(mesh);
      this.#chunks.set(idx, mesh);
    }
  }

  #clear() {
    for (const mesh of this.#chunks.values()) {
      this.#group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.#chunks.clear();
  }

  // -------------------------------------------------------------------------
  // TSL stone: curb blocks, slabs, foundation apron, concrete gutter
  // -------------------------------------------------------------------------

  #createMaterial() {
    const u = this.#uniforms;
    const mat = new THREE.MeshStandardNodeMaterial({
      roughness: 0.84,
      metalness: 0.03,
    });

    applyWorldCurve(mat, u);

    const aSurface = attribute('aSurface', 'float');
    const vSurface = varying(aSurface, 'vSidewalkSurface');
    const vWorldPos = varying(
      modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz,
      'vSidewalkWorldPos',
    );

    const isCurb = float(1.0).sub(step(0.5, vSurface));
    const isSlab = step(0.5, vSurface).mul(float(1.0).sub(step(1.5, vSurface)));
    const isLot = step(1.5, vSurface).mul(float(1.0).sub(step(2.5, vSurface)));
    const isGutter = step(2.5, vSurface);

    // Water runs along the gutters: they stay wet a little longer than the slabs
    const gutterWet = clamp(u.wetness.add(u.puddleLevel.mul(0.25)), 0.0, 1.0);

    mat.colorNode = Fn(() => {
      const wx = vWorldPos.x;
      const wz = vWorldPos.z;
      const far = step(CENTER_LINE_X, wx);

      // 1. Staggered stone paving slabs (2 m × 2 m tile, unwrapped RepeatWrapping)
      const slabUv = vec2(wx.sub(ROAD_FAR_X), wz).mul(0.5);
      const slabTex = texture(this.#cobbleTex, slabUv).rgb;

      // Contact AO along the storefront wall (and the near sidewalk's edge) and both curbs
      const lineDist = min(
        abs(float(BUILDING_LINE_X).sub(wx)),
        abs(float(NEAR_BUILDING_LINE_X).sub(wx)),
      );
      const wallAo = float(0.75).add(smoothstep(0.0, 0.55, lineDist).mul(0.25));
      const farCurbDist = abs(wx.sub(ROAD_FAR_X + CURB_W));
      const nearCurbDist = abs(wx.sub(ROAD_NEAR_X - CURB_W));
      const curbSeamAo = float(0.86).add(
        smoothstep(0.0, 0.3, mix(nearCurbDist, farCurbDist, far)).mul(0.14),
      );
      const slabCol = slabTex.mul(wallAo).mul(curbSeamAo);

      // 2. Granite curb blocks: the V joints are geometry; an antialiased line keeps the
      //    rhythm where the bevels shrink below a pixel
      const zFrac = fract(wz.div(CURB_BLOCK));
      const jFw = max(fwidth(wz), float(0.01));
      const distJoint = max(float(0.0), abs(zFrac.sub(0.5)).sub(float(0.5 - 0.012)));
      const joint = smoothstep(0.0, jFw.add(0.01), distJoint).mul(0.2);
      const curbNoise = valueNoise2D(vec2(wx.mul(6.0), wz.mul(2.0))).mul(0.05);
      const riserShade = smoothstep(0.0, CURB_H, vWorldPos.y).mul(0.22).add(0.78);
      const curbCol = vec3(0.43, 0.415, 0.385).sub(joint).add(curbNoise).mul(riserShade);

      // 3. Foundation bed beneath buildings
      const lotCol = vec3(0.24, 0.23, 0.22);

      // 4. Concrete gutter: lighter than the asphalt, a seam where it meets the asphalt,
      //    contraction joints every 2 m, the curb's shadow along its foot
      const seamX = mix(float(ROAD_NEAR_X + GUTTER_W), float(ROAD_FAR_X - GUTTER_W), far);
      const curbFoot = abs(wx.sub(mix(float(ROAD_NEAR_X), float(ROAD_FAR_X), far)));
      const xFw = max(fwidth(wx), float(0.004));
      const seam = float(1.0).sub(smoothstep(0.008, xFw.add(0.016), abs(wx.sub(seamX))));
      const cutPhase = fract(wz.mul(0.5));
      const cutDist = min(cutPhase, float(1.0).sub(cutPhase)).mul(2.0); // metres to the joint
      const cut = float(1.0).sub(smoothstep(0.006, jFw.add(0.012), cutDist));
      const grain = valueNoise2D(vec2(wx.mul(9.0), wz.mul(3.0))).mul(0.06);
      const footAo = float(0.8).add(smoothstep(0.0, 0.12, curbFoot).mul(0.2));
      const gutterCol = vec3(0.4, 0.39, 0.37)
        .add(grain)
        .mul(footAo)
        .mul(float(1.0).sub(max(seam, cut.mul(0.6)).mul(0.35)));

      const dryCol = curbCol
        .mul(isCurb)
        .add(slabCol.mul(isSlab))
        .add(lotCol.mul(isLot))
        .add(gutterCol.mul(isGutter));
      const wetDark = mix(float(1.0), float(0.58), u.wetness);
      const gutterDark = mix(float(1.0), float(0.5), gutterWet);
      return dryCol.mul(mix(wetDark, gutterDark, isGutter));
    })();

    // Dry stone has no glint at grazing angles: looking up the street into a low sun, the curb
    // edges and slab joints would otherwise sparkle (the wet sheen stays)
    mat.roughnessNode = Fn(() => {
      const viewDir = normalize(cameraPosition.sub(positionWorld));
      const grazing = float(1.0).sub(smoothstep(0.05, 0.5, abs(dot(normalWorld, viewDir))));
      const dry = mix(float(0.85), float(1.0), grazing);
      return mix(
        mix(dry, float(0.25), u.wetness),
        mix(float(0.8), float(0.16), gutterWet),
        isGutter,
      );
    })();

    // A wet gutter catches the sky at grazing angles, like the asphalt next to it
    mat.emissiveNode = Fn(() => {
      const viewDir = normalize(cameraPosition.sub(positionWorld));
      const fresnel = pow(float(1.0).sub(clamp(dot(normalWorld, viewDir), 0.0, 1.0)), 3.0);
      return u.ambientSky
        .mul(0.3)
        .mul(fresnel)
        .mul(gutterWet)
        .mul(isGutter)
        .mul(min(u.wetness.mul(4.0), 1.0));
    })();

    return mat;
  }
}
