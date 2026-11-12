/**
 * Base class for every system (TaxiSystem, StreetSystem, WaterSystem, ...).
 *
 * Lifecycle: built ready in its constructor → `update(dt, frame)` every frame → `dispose()`.
 * Subclasses register cleanups with {@link System#track} (store/bus unsubscribes, GPU resources)
 * and must call `super.dispose()` if they override `dispose`.
 */

/**
 * @typedef {object} FrameInfo
 * @property {number} time     seconds since start (paused time excluded)
 * @property {number} frame    frame counter
 * @property {number} rawDt    unclamped frame delta in seconds
 */

/**
 * Anything with a `dispose()` method (three.js geometries, materials, textures, other systems)
 * or a plain cleanup function (e.g. the return value of `store.subscribe` / `bus.on`).
 * @typedef {(() => void) | { dispose: () => void }} Disposable
 */

export class System {
  /** @type {Disposable[]} */
  #disposables = [];
  #disposed = false;

  /** @param {string} name unique, used in logs and the debug API */
  constructor(name) {
    if (!name) throw new Error('System requires a name');
    this.name = name;
    /** Disabled systems are skipped by the game loop but stay initialised. */
    this.enabled = true;
  }

  /**
   * Called every frame. Must not allocate.
   * @param {number} _dt clamped delta in seconds
   * @param {FrameInfo} _frame
   */
  update(_dt, _frame) {}

  /**
   * Register something to clean up on dispose. Returns it for inline use:
   * `this.geo = this.track(new BoxGeometry())`.
   * @template {Disposable} T
   * @param {T} disposable
   * @returns {T}
   */
  track(disposable) {
    if (this.#disposed) throw new Error(`System "${this.name}" is already disposed`);
    this.#disposables.push(disposable);
    return disposable;
  }

  get disposed() {
    return this.#disposed;
  }

  /** Releases tracked resources in reverse registration order. Idempotent. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (let i = this.#disposables.length - 1; i >= 0; i--) {
      const d = this.#disposables[i];
      try {
        if (typeof d === 'function') d();
        else d.dispose();
      } catch (err) {
        console.error(`[System:${this.name}] dispose failed`, err);
      }
    }
    this.#disposables.length = 0;
  }
}
