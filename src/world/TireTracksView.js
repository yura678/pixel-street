/**
 * Wet tyre tracks (`TireTracksView`): a ring buffer of `MAX_TRACK_STAMPS` quads on the asphalt.
 *
 * Every stamp is one instance with `vec4(x, z, yaw, spawnTime)` and the tyre's wetness at that
 * moment. The vertex shader places and orients the quad and collapses it once it has faded, so
 * the CPU only writes the few new stamps of each frame (partial buffer updates):
 *
 *   opacity = trackOpacity · wetness · (1 − age / fadeTime)²
 *
 * Downpour washes tracks out faster (fade time × 0.4 as rain intensity goes 0.5 → 1).
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  clamp,
  cos,
  float,
  fract,
  instancedBufferAttribute,
  mix,
  positionGeometry,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  varying,
  vec3,
} from 'three/tsl';
import { System } from '../core/System.js';
import { MAX_TRACK_STAMPS } from '../config/constants.js';
import { createCurvedPositionNode } from '../rendering/tsl/curve.js';

/** Distance between two stamps of one tyre (the quad is exactly this long: no overlaps). */
export const TRACK_STEP = 0.25;
const TRACK_WIDTH = 0.19;
/** Height above the asphalt (puddles sit above, at 1.5 cm). */
const TRACK_Y = 0.008;

export class TireTracksView extends System {
  /** @type {THREE.Scene} */
  #scene;
  /** @type {import('../core/Store.js').Store} */
  #store;
  /** @type {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} */
  #uniforms;

  /** @type {THREE.InstancedMesh} */
  #mesh;
  /** @type {THREE.InstancedBufferAttribute} */
  #stampAttr;
  /** @type {THREE.InstancedBufferAttribute} */
  #wetAttr;

  #head = 0;
  #pendingStart = 0;
  #pendingCount = 0;
  #written = 0;

  #opacity = uniform(0.55);
  #fadeTime = uniform(18);

  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/Store.js').Store} store
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   */
  constructor(scene, store, uniforms) {
    super('tireTracks');
    this.#scene = scene;
    this.#store = store;
    this.#uniforms = uniforms;

    const stamps = new Float32Array(MAX_TRACK_STAMPS * 4);
    // Unused slots are born long ago: collapsed until written
    for (let i = 0; i < MAX_TRACK_STAMPS; i++) stamps[i * 4 + 3] = -1e6;
    this.#stampAttr = new THREE.InstancedBufferAttribute(stamps, 4);
    this.#stampAttr.setUsage(THREE.DynamicDrawUsage);
    this.#wetAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACK_STAMPS), 1);
    this.#wetAttr.setUsage(THREE.DynamicDrawUsage);

    const geo = this.track(new THREE.PlaneGeometry(TRACK_WIDTH, TRACK_STEP, 1, 1));
    geo.rotateX(-Math.PI / 2);
    const mat = this.track(this.#createMaterial());

    this.#mesh = new THREE.InstancedMesh(geo, mat, MAX_TRACK_STAMPS);
    this.#mesh.name = 'TireTracks';
    this.#mesh.frustumCulled = false;
    this.#mesh.receiveShadow = true;
    this.#mesh.renderOrder = 1;
    this.#scene.add(this.#mesh);
    this.track(() => {
      this.#scene.remove(this.#mesh);
      this.#mesh.dispose();
    });

    this.#syncParams();
    this.track(this.#store.subscribe('water.*', () => this.#syncParams()));
  }

  get mesh() {
    return this.#mesh;
  }

  /** Stamps written since start (debug / tests). */
  get written() {
    return this.#written;
  }

  /**
   * Drop one stamp centred at (x, z), oriented along `yaw` (atan2(dirX, dirZ)).
   * @param {number} x
   * @param {number} z
   * @param {number} yaw
   * @param {number} wetness 0..1
   */
  addStamp(x, z, yaw, wetness) {
    const i = this.#head;
    const s = this.#stampAttr.array;
    s[i * 4] = x;
    s[i * 4 + 1] = z;
    s[i * 4 + 2] = yaw;
    s[i * 4 + 3] = this.#uniforms.time.value;
    this.#wetAttr.array[i] = wetness;

    if (this.#pendingCount === 0) this.#pendingStart = i;
    this.#pendingCount = Math.min(MAX_TRACK_STAMPS, this.#pendingCount + 1);
    this.#head = (i + 1) % MAX_TRACK_STAMPS;
    this.#written++;
  }

  /** Upload the stamps written this frame (one or two ranges of the ring). */
  update(_dt) {
    const count = this.#pendingCount;
    if (count === 0) return;
    const start = this.#pendingStart;
    const first = Math.min(count, MAX_TRACK_STAMPS - start);
    this.#stampAttr.addUpdateRange(start * 4, first * 4);
    this.#wetAttr.addUpdateRange(start, first);
    if (first < count) {
      this.#stampAttr.addUpdateRange(0, (count - first) * 4);
      this.#wetAttr.addUpdateRange(0, count - first);
    }
    this.#stampAttr.needsUpdate = true;
    this.#wetAttr.needsUpdate = true;
    this.#pendingCount = 0;
  }

  #syncParams() {
    this.#opacity.value = this.#store.get('water.trackOpacity') ?? 0.55;
    this.#fadeTime.value = this.#store.get('water.trackFade') ?? 18;
  }

  #createMaterial() {
    const u = this.#uniforms;
    const mat = new THREE.MeshStandardNodeMaterial({
      transparent: true,
      depthWrite: false,
      roughness: 0.2,
      metalness: 0.0,
    });

    const stamp = instancedBufferAttribute(this.#stampAttr, 'vec4');
    const wet = instancedBufferAttribute(this.#wetAttr, 'float');

    const age = u.time.sub(stamp.w);
    const fade = this.#fadeTime.mul(
      mix(float(1.0), float(0.4), smoothstep(0.5, 1.0, u.rainIntensity)),
    );
    const alive = step(0.0, age).mul(step(age, fade));

    // Rotate the quad (x across, z along) by the stamp yaw and drop it at the stamp centre;
    // a faded stamp collapses to a point and rasterises nothing.
    const c = cos(stamp.z);
    const s = sin(stamp.z);
    const lx = positionGeometry.x.mul(alive);
    const lz = positionGeometry.z.mul(alive);
    const world = vec3(
      stamp.x.add(lx.mul(c)).add(lz.mul(s)),
      TRACK_Y,
      stamp.y.sub(lx.mul(s)).add(lz.mul(c)),
    );
    mat.positionNode = createCurvedPositionNode(u, world);

    const life = clamp(float(1.0).sub(age.div(fade)), 0.0, 1.0);
    const vAlpha = varying(this.#opacity.mul(wet).mul(life).mul(life), 'vTrackAlpha');

    // Soft tyre edges and a pixel chevron tread (4 bars per stamp)
    const across = uv().x;
    const along = uv().y;
    const edge = smoothstep(0.0, 0.22, across).mul(smoothstep(1.0, 0.78, across));
    const chevron = fract(along.mul(4.0).add(abs(across.sub(0.5)).mul(1.4)));
    const tread = mix(float(1.0), float(0.75), step(0.55, chevron));

    mat.colorNode = vec3(0.018, 0.019, 0.022);
    mat.opacityNode = vAlpha.mul(edge).mul(tread);
    return mat;
  }
}
