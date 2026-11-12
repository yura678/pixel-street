/**
 * Small FPS / frame-time overlay, toggled by `render.showFps`.
 * Text is refreshed 4× per second, so the meter itself costs almost nothing.
 */
import { RollingAverage } from '../core/RingBuffer.js';

const REFRESH_S = 0.25;

export class FpsMeter {
  #el;
  #avg = new RollingAverage(60);
  #acc = 0;
  #off;
  /** @type {() => string} */
  #extra;

  /**
   * @param {import('../core/Store.js').Store} store
   * @param {object} [options]
   * @param {() => string} [options.extra] extra line(s), e.g. draw calls
   */
  constructor(store, { extra = () => '' } = {}) {
    this.#extra = extra;
    this.#el = document.createElement('div');
    this.#el.className = 'fps-meter';
    this.#el.hidden = true;
    document.body.append(this.#el);
    this.#off = store.subscribe(
      'render.showFps',
      () => (this.#el.hidden = !store.get('render.showFps')),
      { immediate: true },
    );
  }

  /** @param {number} rawDt unclamped frame delta, seconds */
  sample(rawDt) {
    if (this.#el.hidden || rawDt <= 0) return;
    this.#avg.push(rawDt);
    this.#acc += rawDt;
    if (this.#acc < REFRESH_S) return;
    this.#acc = 0;
    const ms = this.#avg.mean * 1000;
    const extra = this.#extra();
    this.#el.textContent = `${Math.round(1000 / ms)} fps  ${ms.toFixed(1)} ms${extra ? `\n${extra}` : ''}`;
  }

  dispose() {
    this.#off();
    this.#el.remove();
  }
}
