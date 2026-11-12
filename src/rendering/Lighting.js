/**
 * Scene lighting and high-precision diorama shadow management.
 *
 * Places the directional sun on the open cutaway side (`-X`) so storefronts, awnings,
 * sidewalk props, and the taxi receive warm directional sunlight and cast crisp soft
 * contact shadows across the paving slabs and walls.
 *
 * Shadows are cascaded (`CSMShadowNode`): three shadow maps fitted to slices of the view frustum
 * up to `SHADOW_FAR`, the nearest crisp, the farther ones wider, blending into each other, so the
 * shadows reach as far as the camera sees at any zoom instead of ending in a square round the
 * taxi. The light keeps following the camera's anchor (its direction is what the cascades use).
 */
import * as THREE from 'three';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { degToRad } from '../core/math.js';

const SHADOW_FRUSTUM_HALF = 14;
const SHADOW_MAP_SIZE = 2048;
/** How far from the camera the cascades reach (m); past it the fog has the street. */
export const SHADOW_FAR = 140;
export const SHADOW_CASCADES = 3;
const SHADOW_TEXEL_WORLD = (SHADOW_FRUSTUM_HALF * 2) / SHADOW_MAP_SIZE;

const _offset = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _target = new THREE.Vector3();

export class Lighting {
  /** @type {THREE.DirectionalLight} */
  #sun;
  /** @type {THREE.HemisphereLight} */
  #hemisphere;
  /** @type {import('../core/Store.js').Store} */
  #store;

  #sunDistance = 36;
  /** The view camera's projection the cascades were split for (`syncCascades`). */
  #cascadeFov = 0;
  #cascadeAspect = 0;
  /** @type {CSMShadowNode} */
  #csm;
  #lastTargetZ = 0;

  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/Store.js').Store} store
   */
  constructor(scene, store) {
    this.#store = store;

    // 1. Warm balanced hemisphere fill so shadowed alcoves stay rich and readable
    this.#hemisphere = new THREE.HemisphereLight(
      store.get('lighting.ambientSky') ?? '#bcd8ff',
      store.get('lighting.ambientGround') ?? '#8a7d6c',
      0.8,
    );
    scene.add(this.#hemisphere);

    // 2. Directional Sun light with high-density orthographic diorama shadow frustum
    this.#sun = new THREE.DirectionalLight(
      store.get('lighting.sunColor') ?? '#fff0cf',
      (store.get('lighting.sunIntensity') ?? 2.6) * 0.85,
    );

    this.#sun.castShadow = store.get('render.shadows') ?? true;

    const d = SHADOW_FRUSTUM_HALF;
    this.#sun.shadow.camera.left = -d;
    this.#sun.shadow.camera.right = d;
    this.#sun.shadow.camera.top = d;
    this.#sun.shadow.camera.bottom = -d;
    // Each cascade's light stands `lightMargin` beyond its slice of the view (towards the sun) and
    // copies these: `far` must reach through the deepest slice (up to `SHADOW_FAR`) and back
    this.#sun.shadow.camera.near = 0.5;
    this.#sun.shadow.camera.far = SHADOW_FAR * 2 + 80;
    this.#sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.#sun.shadow.bias = -0.00018;
    this.#sun.shadow.normalBias = 0.014;
    this.#sun.shadow.radius = 2.2;

    const csm = new CSMShadowNode(this.#sun, {
      cascades: SHADOW_CASCADES,
      maxFar: SHADOW_FAR,
      mode: 'practical',
      lightMargin: 40, // casters up to ~40 m towards the sun from what the camera sees
    });
    csm.fade = true;
    this.#sun.shadow.shadowNode = csm;
    this.#csm = csm;

    scene.add(this.#sun);
    scene.add(this.#sun.target);

    this.#bindStore();
    this.updateSunPosition(0);
  }

  get sun() {
    return this.#sun;
  }

  /** The cascaded shadow node of the sun. */
  get csm() {
    return this.#csm;
  }

  /**
   * Re-split the cascades when the view camera's field of view or aspect changed (a low camera
   * widens its field of view, `CameraRig`); the cascades are fitted to its frustum.
   * @param {THREE.PerspectiveCamera} camera
   */
  syncCascades(camera) {
    if (camera.fov === this.#cascadeFov && camera.aspect === this.#cascadeAspect) return;
    this.#cascadeFov = camera.fov;
    this.#cascadeAspect = camera.aspect;
    // Before the first render the node has no camera yet: it splits on its own then
    if (this.#csm.camera) this.#csm.updateFrustums();
  }

  get hemisphere() {
    return this.#hemisphere;
  }

  /**
   * Repositions directional light and shadow target to follow the vehicle along Z,
   * snapping the orthographic shadow frustum origin in light-view `(right, up)` space
   * to exact shadow-map texel increments (`SHADOW_TEXEL_WORLD`) to eliminate shadow swimming.
   * @param {number} targetZ
   */
  updateSunPosition(targetZ = 0) {
    this.#lastTargetZ = targetZ;
    const elevation = degToRad(this.#store.get('lighting.sunElevation') ?? 52);
    const azimuth = degToRad(this.#store.get('lighting.sunAzimuth') ?? 125);

    // Constant sun-to-target offset for the current `(elevation, azimuth)`
    const cosElev = Math.cos(elevation);
    const ox = -Math.sin(azimuth) * cosElev * this.#sunDistance - 0.5;
    const oy = Math.max(2.5, Math.sin(elevation) * this.#sunDistance) - 0.8;
    const oz = Math.cos(azimuth) * cosElev * this.#sunDistance;
    _offset.set(ox, oy, oz);

    _forward.copy(_offset).negate().normalize();
    if (Math.abs(_forward.y) > 0.999) {
      _right.set(1, 0, 0);
    } else {
      _right.crossVectors(_forward, _worldUp).normalize();
    }
    _up.crossVectors(_right, _forward).normalize();

    _target.set(2.5, 0.8, targetZ + 1.5);
    const tR = Math.round(_target.dot(_right) / SHADOW_TEXEL_WORLD) * SHADOW_TEXEL_WORLD;
    const tU = Math.round(_target.dot(_up) / SHADOW_TEXEL_WORLD) * SHADOW_TEXEL_WORLD;
    const tF = Math.round(_target.dot(_forward) / SHADOW_TEXEL_WORLD) * SHADOW_TEXEL_WORLD;

    _target.set(0, 0, 0).addScaledVector(_right, tR).addScaledVector(_up, tU).addScaledVector(_forward, tF);

    this.#sun.target.position.copy(_target);
    this.#sun.position.copy(_target).add(_offset);
    this.#sun.updateMatrixWorld();
    this.#sun.target.updateMatrixWorld();
  }

  #bindStore() {
    this.#store.subscribe('lighting.*', () => {
      this.#sun.color.set(this.#store.get('lighting.sunColor'));
      this.#sun.intensity = (this.#store.get('lighting.sunIntensity') ?? 2.6) * 0.85;

      this.#hemisphere.color.set(this.#store.get('lighting.ambientSky'));
      this.#hemisphere.groundColor.set(this.#store.get('lighting.ambientGround'));

      this.updateSunPosition(this.#lastTargetZ);
    });

    this.#store.subscribe('render.shadows', () => {
      this.#sun.castShadow = this.#store.get('render.shadows');
    });
  }

  dispose() {
    this.#csm.dispose?.();
    this.#sun.dispose?.();
  }
}
