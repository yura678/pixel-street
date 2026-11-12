/**
 * Frame loop: clamps dt, keeps a pausable clock and updates systems in registration order.
 * Framework-agnostic (no three.js) so it can be unit-tested; App wires `tick` into
 * `renderer.setAnimationLoop`.
 *
 * Update order is the order of `add()` calls – App registers them as:
 * weather → taxi → street → water → fx → camera → (render).
 */

/** @typedef {import('../core/System.js').System} System */
/** @typedef {import('../core/System.js').FrameInfo & { dt: number }} LoopFrameInfo */

export class GameLoop {
  /** @type {System[]} */
  #systems = [];
  #maxDt;
  #render;
  #onFrame;
  #last = -1;
  /** Reused every frame – never reallocated. @type {LoopFrameInfo} */
  #frame = { time: 0, frame: 0, rawDt: 0, dt: 0 };

  /**
   * @param {object} options
   * @param {(dt: number, frame: LoopFrameInfo) => void} options.render called after all systems
   * @param {(rawDt: number, frame: LoopFrameInfo) => void} [options.onFrame] stats hook (FPS meter)
   * @param {number} [options.maxDt=1/20] dt clamp: a long hitch must not teleport the taxi
   */
  constructor({ render, onFrame, maxDt = 1 / 20 }) {
    this.#render = render;
    this.#onFrame = onFrame;
    this.#maxDt = maxDt;
    this.tick = this.tick.bind(this);
  }

  /** @param {System} system */
  add(system) {
    if (this.#systems.includes(system)) return system;
    this.#systems.push(system);
    return system;
  }

  /** @param {System} system */
  remove(system) {
    const i = this.#systems.indexOf(system);
    if (i !== -1) this.#systems.splice(i, 1);
  }

  get systems() {
    return /** @type {readonly System[]} */ (this.#systems);
  }

  get frame() {
    return /** @type {Readonly<LoopFrameInfo>} */ (this.#frame);
  }

  /**
   * Forget the previous timestamp, so the next tick has dt = 0 (call after a pause /
   * background tab, otherwise the first frame would see a multi-second delta).
   */
  resetClock() {
    this.#last = -1;
  }

  /** @param {number} nowMs high-resolution timestamp in milliseconds */
  tick(nowMs) {
    const f = this.#frame;
    const rawDt = this.#last < 0 ? 0 : Math.max(0, (nowMs - this.#last) / 1000);
    this.#last = nowMs;
    const dt = rawDt > this.#maxDt ? this.#maxDt : rawDt;

    f.rawDt = rawDt;
    f.dt = dt;
    f.time += dt;
    f.frame++;

    const systems = this.#systems;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      if (!s.enabled) continue;
      try {
        s.update(dt, f);
      } catch (err) {
        // Disable the broken system instead of flooding the console 60×/s.
        s.enabled = false;
        console.error(`[GameLoop] system "${s.name}" threw and was disabled`, err);
      }
    }
    this.#render(dt, f);
    this.#onFrame?.(rawDt, f);
  }
}
