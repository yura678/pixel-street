/**
 * Tire Wetness Tracker.
 *
 * When a wheel plunges into a puddle, its surface wetness jumps to 1.0.
 * As the tire rolls along dry asphalt, wetness dries out linearly with distance traveled.
 */
import { Events } from '../../core/EventBus.js';

export class TireWetness {
  /** Wetness levels for [FR, FL, RR, RL] in [0, 1] */
  #wetness = [0, 0, 0, 0];
  #unsub;

  /**
   * @param {import('../../core/EventBus.js').EventBus} bus
   * @param {object} [options]
   * @param {number} [options.dryDistance=25] distance in metres required to dry a wet tire
   */
  constructor(bus, { dryDistance = 25 } = {}) {
    this.dryDistance = dryDistance;

    this.#unsub = bus.on(Events.WHEEL_ENTER_PUDDLE, ({ wheel }) => {
      if (wheel >= 0 && wheel < 4) {
        this.#wetness[wheel] = 1.0;
      }
    });
  }

  /**
   * @param {number} wheelIndex 0..3
   * @returns {number} wetness level 0..1
   */
  getWetness(wheelIndex) {
    return this.#wetness[wheelIndex] ?? 0;
  }

  /**
   * Advance drying simulation based on speed and road wetness.
   * @param {number} dt delta time (seconds)
   * @param {number} speed current speed (m/s)
   * @param {number} roadWetness ambient asphalt wetness (0..1)
   */
  update(dt, speed, roadWetness = 0) {
    if (dt <= 0) return;

    const distance = Math.abs(speed) * dt;
    const fade = distance / this.dryDistance;

    for (let i = 0; i < 4; i++) {
      // Dry out with distance, but never dry below the ambient road wetness
      this.#wetness[i] = Math.max(roadWetness, this.#wetness[i] - fade);
    }
  }

  dispose() {
    this.#unsub?.();
  }
}
