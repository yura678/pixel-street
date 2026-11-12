/**
 * Fixed-capacity circular buffer. Pushing into a full buffer overwrites the oldest item.
 * Used for frame-time averaging (QualityGovernor) and tire-track stamps.
 * @template T
 */
export class RingBuffer {
  /** @type {(T|undefined)[]} */
  #items;
  #head = 0; // index of the oldest item
  #length = 0;

  /** @param {number} capacity */
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.#items = new Array(capacity);
  }

  get capacity() {
    return this.#items.length;
  }

  get length() {
    return this.#length;
  }

  get isFull() {
    return this.#length === this.#items.length;
  }

  /**
   * Append an item. Returns the overwritten item (or undefined if there was free space),
   * so callers can recycle evicted objects.
   * @param {T} item
   * @returns {T|undefined}
   */
  push(item) {
    const cap = this.#items.length;
    if (this.#length < cap) {
      this.#items[(this.#head + this.#length) % cap] = item;
      this.#length++;
      return undefined;
    }
    const evicted = this.#items[this.#head];
    this.#items[this.#head] = item;
    this.#head = (this.#head + 1) % cap;
    return evicted;
  }

  /**
   * Remove and return the oldest item.
   * @returns {T|undefined}
   */
  shift() {
    if (this.#length === 0) return undefined;
    const item = this.#items[this.#head];
    this.#items[this.#head] = undefined;
    this.#head = (this.#head + 1) % this.#items.length;
    this.#length--;
    return item;
  }

  /**
   * Item by age: 0 = oldest, length-1 = newest. Negative indices count from the newest (-1).
   * @param {number} i
   * @returns {T|undefined}
   */
  at(i) {
    if (i < 0) i += this.#length;
    if (i < 0 || i >= this.#length) return undefined;
    return this.#items[(this.#head + i) % this.#items.length];
  }

  /** @returns {T|undefined} */
  newest() {
    return this.at(-1);
  }

  /** @returns {T|undefined} */
  oldest() {
    return this.at(0);
  }

  /**
   * Iterate oldest → newest without allocating.
   * @param {(item: T, index: number) => void} fn
   */
  forEach(fn) {
    const cap = this.#items.length;
    for (let i = 0; i < this.#length; i++)
      fn(/** @type {T} */ (this.#items[(this.#head + i) % cap]), i);
  }

  clear() {
    this.#items.fill(undefined);
    this.#head = 0;
    this.#length = 0;
  }

  /** Oldest → newest copy (debugging / tests; allocates). */
  toArray() {
    const out = [];
    this.forEach((v) => out.push(v));
    return out;
  }
}

/**
 * Numeric ring buffer with an O(1) running mean – for moving averages of frame time.
 * Backed by a Float64Array; the sum is recomputed periodically to cancel float drift.
 */
export class RollingAverage {
  #data;
  #head = 0;
  #length = 0;
  #sum = 0;
  #pushes = 0;

  /** @param {number} capacity */
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`RollingAverage capacity must be a positive integer, got ${capacity}`);
    }
    this.#data = new Float64Array(capacity);
  }

  get length() {
    return this.#length;
  }

  get isFull() {
    return this.#length === this.#data.length;
  }

  /** @param {number} value */
  push(value) {
    const cap = this.#data.length;
    if (this.#length < cap) {
      this.#data[(this.#head + this.#length) % cap] = value;
      this.#length++;
    } else {
      this.#sum -= this.#data[this.#head];
      this.#data[this.#head] = value;
      this.#head = (this.#head + 1) % cap;
    }
    this.#sum += value;
    if (++this.#pushes >= cap * 8) this.#resum();
  }

  /** Mean of stored values (0 if empty). */
  get mean() {
    return this.#length === 0 ? 0 : this.#sum / this.#length;
  }

  clear() {
    this.#head = 0;
    this.#length = 0;
    this.#sum = 0;
    this.#pushes = 0;
  }

  #resum() {
    let s = 0;
    const cap = this.#data.length;
    for (let i = 0; i < this.#length; i++) s += this.#data[(this.#head + i) % cap];
    this.#sum = s;
    this.#pushes = 0;
  }
}
