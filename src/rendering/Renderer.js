/**
 * WebGPU renderer wrapper supporting both crisp high-DPI miniature rendering (`pixelSize = 1`)
 * and retro low-res pixel-art scaling (`pixelSize = 2..10`).
 */
import * as THREE from 'three/webgpu';

export class Renderer {
  /** @type {THREE.WebGPURenderer} */
  #renderer;
  /** @type {import('../core/Store.js').Store} */
  #store;
  #canvas;
  #onResize;
  /** Cap on the device pixel ratio (quality tier). */
  #maxDpr;
  /** Share of the device pixel ratio the frame is drawn at (quality governor). */
  #renderScale = 1;

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../core/Store.js').Store} store
   * @param {object} [options]
   * @param {number} [options.maxDpr=2] cap on the device pixel ratio
   */
  constructor(canvas, store, { maxDpr = 2 } = {}) {
    this.#canvas = canvas;
    this.#store = store;
    this.#maxDpr = maxDpr;

    this.#renderer = new THREE.WebGPURenderer({
      canvas,
      // The scene is multisampled in its own pass (`PixelPipeline`); the canvas only receives
      // the full-screen post-processing quad, so its MSAA buys nothing and cost ~4.6 ms a frame
      // (integrated Intel UHD, 1600 × 900)
      antialias: false,
      alpha: false,
      forceWebGL: false,
      powerPreference: 'high-performance',
    });

    // Color management & soft miniature diorama shadows
    this.#renderer.toneMapping = THREE.NeutralToneMapping;
    this.#renderer.toneMappingExposure = store.get('lighting.exposure') ?? 1.0;
    this.#renderer.shadowMap.enabled = store.get('render.shadows') ?? true;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.#bindStore();
    this.updateSize();

    this.#onResize = () => this.updateSize();
    window.addEventListener('resize', this.#onResize);
  }

  get webgpuRenderer() {
    return this.#renderer;
  }

  get domElement() {
    return this.#canvas;
  }

  /**
   * Asynchronous WebGPU device initialization. Must be awaited before rendering.
   */
  async init() {
    await this.#renderer.init();
  }

  /** Share of the device pixel ratio the frame is drawn at. */
  get renderScale() {
    return this.#renderScale;
  }

  /**
   * Draw the frame at `scale` of the device pixel ratio; the browser stretches the canvas back
   * to the window (smoothly). The quality governor's main lever: on a pixel-bound GPU the frame
   * time falls with the pixel count. No effect in pixel-art mode (`pixelSize >= 2`), which is
   * low-resolution already.
   * @param {number} scale (0, 1]
   */
  setRenderScale(scale) {
    const s = Math.min(1, Math.max(0.25, scale));
    if (s === this.#renderScale) return;
    this.#renderScale = s;
    this.updateSize();
  }

  /**
   * Updates rendering buffer resolution according to `render.pixelSize`.
   * `pixelSize === 1` renders at native crisp DPI (capped by the quality tier, at most 2×) times
   * the governor's render scale; `pixelSize >= 2` switches to pixelated nearest-neighbour retro
   * scaling.
   */
  updateSize() {
    const pixelSize = Math.max(1, this.#store.get('render.pixelSize') ?? 1);
    const nativeDpr = Math.min(window.devicePixelRatio || 1, this.#maxDpr);
    const dpr = pixelSize <= 1 ? nativeDpr * this.#renderScale : 1 / pixelSize;

    this.#canvas.style.imageRendering = pixelSize <= 1 ? 'auto' : 'pixelated';
    this.#renderer.setPixelRatio(dpr);
    this.#renderer.setSize(window.innerWidth, window.innerHeight, true);
  }

  #bindStore() {
    this.#store.subscribe('render.pixelSize', () => this.updateSize());
    this.#store.subscribe('render.shadows', () => {
      this.#renderer.shadowMap.enabled = this.#store.get('render.shadows');
    });
    this.#store.subscribe('lighting.exposure', () => {
      this.#renderer.toneMappingExposure = this.#store.get('lighting.exposure');
    });
  }

  /**
   * Render scene directly (if post-processing is bypassed).
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  render(scene, camera) {
    this.#renderer.render(scene, camera);
  }

  /**
   * Free GPU resources and event listeners.
   */
  dispose() {
    window.removeEventListener('resize', this.#onResize);
    this.#renderer.dispose();
  }
}
