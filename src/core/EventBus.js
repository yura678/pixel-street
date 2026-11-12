/**
 * Domain event bus. Event names are fixed constants so typos fail loudly in dev.
 *
 * Listener arrays are copy-on-write: `on`/`off` allocate a new array, `emit` allocates nothing
 * and is safe even if a listener subscribes/unsubscribes while the event is being dispatched.
 */

/** Payload shapes are documented next to each name. */
export const Events = Object.freeze({
  /** { from: string, to: string } */
  TAXI_STATE: 'taxi:state',
  /** { wheel: number, x: number, z: number, speed: number } */
  WHEEL_ENTER_PUDDLE: 'wheel:enterPuddle',
  /** { wheel: number, x: number, z: number, speed: number } */
  WHEEL_EXIT_PUDDLE: 'wheel:exitPuddle',
  /** { seed: number } */
  STREET_REGENERATE: 'street:regenerate',
  /** { tier: 'low'|'medium'|'high', level: number, label: string, reason: string } – the
   *  quality governor's rung changed (reason: 'start', 'governor', 'manual') */
  QUALITY_CHANGED: 'quality:changed',
  /** { from: string, to: string } – a weather preset transition started */
  WEATHER_PRESET: 'weather:preset',
  /** { intensity: number } – a lightning flash */
  LIGHTNING: 'weather:lightning',
  /** { id: string } – a Forge action button (see `act()` in params.schema.js) */
  FORGE_ACTION: 'forge:action',
});

const KNOWN = new Set(Object.values(Events));

/** @typedef {(payload: any) => void} Listener */

export class EventBus {
  /** @type {Map<string, Listener[]>} */
  #listeners = new Map();
  #strict;
  #onError;

  /**
   * @param {object} [options]
   * @param {boolean} [options.strict=true] throw on event names not listed in {@link Events}
   * @param {(err: unknown, type: string) => void} [options.onError] a throwing listener is
   *   reported here and does not stop other listeners
   */
  constructor({
    strict = true,
    onError = (err, type) => console.error(`[EventBus] ${type}`, err),
  } = {}) {
    this.#strict = strict;
    this.#onError = onError;
  }

  /**
   * @param {string} type
   * @param {Listener} fn
   * @returns {() => void} unsubscribe
   */
  on(type, fn) {
    this.#check(type);
    const list = this.#listeners.get(type);
    this.#listeners.set(type, list ? [...list, fn] : [fn]);
    return () => this.off(type, fn);
  }

  /**
   * Listen for a single emission.
   * @param {string} type
   * @param {Listener} fn
   */
  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  /**
   * @param {string} type
   * @param {Listener} fn
   */
  off(type, fn) {
    const list = this.#listeners.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i === -1) return;
    if (list.length === 1) this.#listeners.delete(type);
    else
      this.#listeners.set(
        type,
        list.filter((_, j) => j !== i),
      );
  }

  /**
   * Dispatch synchronously. Hot-path safe: no allocations.
   * @param {string} type
   * @param {any} [payload]
   */
  emit(type, payload) {
    const list = this.#listeners.get(type);
    if (!list) {
      if (this.#strict && !KNOWN.has(type)) this.#check(type);
      return;
    }
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (err) {
        this.#onError(err, type);
      }
    }
  }

  /** @param {string} type */
  listenerCount(type) {
    return this.#listeners.get(type)?.length ?? 0;
  }

  /** Remove all listeners (of one type, or everything). */
  clear(type) {
    if (type === undefined) this.#listeners.clear();
    else this.#listeners.delete(type);
  }

  #check(type) {
    if (this.#strict && !KNOWN.has(type)) {
      throw new Error(`[EventBus] unknown event "${type}". Add it to Events in core/EventBus.js`);
    }
  }
}
