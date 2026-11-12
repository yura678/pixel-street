/**
 * Deterministic randomness: the same seed always produces the same street.
 * All integer math is done in uint32 via Math.imul, so results are identical across engines.
 */

/**
 * mulberry32 PRNG – tiny, fast, good enough for procedural content.
 * @param {number} seed
 * @returns {() => number} float in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** murmur3 fmix32 finaliser – full avalanche of a uint32. */
function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Hash any number of integers into a uint32. Order matters: hash(1, 2) !== hash(2, 1).
 * Typical use: `hash(chunkIndex, seed)` → per-chunk seed, independent of generation order.
 * Negative and fractional inputs are allowed (truncated to int32).
 * @param {...number} values
 * @returns {number} uint32
 */
export function hash(...values) {
  let h = 0x9e3779b9;
  for (let i = 0; i < values.length; i++) {
    let k = Math.imul(values[i] | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  return fmix32(h ^ values.length);
}

/** Seeded RNG with convenience helpers. */
export class Rng {
  #next;

  /** @param {number} seed */
  constructor(seed) {
    this.#next = mulberry32(seed);
  }

  /** Derive an RNG for a sub-stream (e.g. a chunk) without consuming this one's sequence. */
  static fork(seed, ...keys) {
    return new Rng(hash(seed, ...keys));
  }

  /** @returns {number} float in [0, 1) */
  next() {
    return this.#next();
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + (max - min) * this.#next();
  }

  /** Integer in [min, max] (both inclusive). */
  int(min, max) {
    return min + Math.floor(this.#next() * (max - min + 1));
  }

  /** @param {number} p probability 0..1 */
  chance(p) {
    return this.#next() < p;
  }

  /** -1 or 1. */
  sign() {
    return this.#next() < 0.5 ? -1 : 1;
  }

  /**
   * @template T
   * @param {readonly T[]} arr
   * @returns {T}
   */
  pick(arr) {
    return arr[Math.floor(this.#next() * arr.length)];
  }

  /**
   * Index chosen proportionally to non-negative weights. Returns -1 if all weights are 0.
   * @param {readonly number[]} weights
   */
  weightedIndex(weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += Math.max(0, weights[i]);
    if (total <= 0) return -1;
    let r = this.#next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    // Float rounding fallback: last item with a positive weight.
    for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
    return -1;
  }

  /**
   * In-place Fisher–Yates shuffle.
   * @template T
   * @param {T[]} arr
   */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.#next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}
