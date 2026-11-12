/**
 * Weather effects system: the rain and the falling leaves.
 *
 * Bridges the camera and the streamed street with the effects: the rain's box follows the view
 * (between the camera and the point it looks at), the leaves' window of street follows the
 * camera's anchor, and the leaves grow in the crowns of the street trees the chunks were built
 * with. Both effects read the weather (rain intensity, wind, wetness) and the taxi from the
 * shared uniforms.
 */
import { System } from '../core/System.js';
import { Rain } from '../fx/Rain.js';
import { Leaves } from '../fx/Leaves.js';

/** The rain box stands this share of the way from the camera's anchor toward the camera. */
const RAIN_TOWARD_CAMERA = 0.4;
const NO_TREES = Object.freeze([]);

export class FxSystem extends System {
  /** @type {Rain} */
  rain;
  /** @type {Leaves} */
  leaves;

  #camera;
  #cameraRig;
  #streetView;

  /**
   * @param {object} deps
   * @param {import('three/webgpu').Scene} deps.scene
   * @param {import('../core/Store.js').Store} deps.store
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} deps.uniforms
   * @param {import('three/webgpu').WebGPURenderer} deps.renderer
   * @param {import('../rendering/CameraRig.js').CameraRig} deps.cameraRig
   * @param {import('../world/StreetView.js').StreetView} deps.streetView
   * @param {number} [deps.leafCap] most leaves drawn (the device's quality tier)
   */
  constructor({ scene, store, uniforms, renderer, cameraRig, streetView, leafCap }) {
    super('fx');
    this.#cameraRig = cameraRig;
    this.#camera = cameraRig.camera;
    this.#streetView = streetView;

    this.rain = this.track(new Rain(scene, uniforms));
    this.leaves = this.track(new Leaves(scene, store, uniforms, renderer));
    if (leafCap !== undefined) this.leaves.setBudget({ cap: leafCap });
  }

  /**
   * Draw this share of the rain drops and leaves (the quality governor's rung).
   * @param {number} scale [0, 1]
   */
  setParticleScale(scale) {
    this.rain.setScale(scale);
    this.leaves.setBudget({ scale });
  }

  /**
   * @param {number} dt
   * @param {import('../core/System.js').FrameInfo} frame
   */
  update(dt, frame) {
    const rig = this.#cameraRig;
    const cam = this.#camera.position;
    const anchorX = rig.anchorX;
    const anchorZ = rig.anchorZ;
    this.rain.setCenter(
      anchorX + (cam.x - anchorX) * RAIN_TOWARD_CAMERA,
      anchorZ + (cam.z - anchorZ) * RAIN_TOWARD_CAMERA,
    );
    this.rain.update(dt, frame);

    // No leaves from the trees while the street is hidden (`?debug=parts`)
    const trees = this.#streetView.group.visible ? this.#streetView.trees : NO_TREES;
    this.leaves.setWindow(anchorZ, trees);
    this.leaves.update(dt, frame);
  }
}
