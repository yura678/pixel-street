/**
 * Adaptive quality (Stage 9 of `IMPLEMENTATION_PLAN.md`): the device tier picked at startup and
 * the governor that walks the quality ladder (`config/qualityTiers.js`) by the frame time.
 *
 * Pure logic – no three.js, no DOM – fed with frame times and a clock, so the tests drive it
 * with made-up frames. The App applies the rungs (render scale, particle counts).
 *
 * How the governor decides, four times a second:
 *  - **Down** when the median frame of the last 2 s is over budget × 1.15 (one rung, two when
 *    it is over twice the budget). The median, not the mean: a rare multi-second hitch (a
 *    chunk built, a shader compiled) would drag a mean far down.
 *  - **Up** when the frames have been comfortably fast (median ≤ budget × 0.67 – one rung up
 *    costs up to ~1.45× more) for `wait` seconds. Under vsync the frame time cannot drop below
 *    the refresh interval, so a frame pinned at the budget hides any headroom: then the governor
 *    *probes* – steps up after twice the wait, and steps back down if it was too much.
 *  - A rung that fails within 10 s of a step up doubles its wait (4 s → … → 2 min), so the
 *    governor does not see-saw between two rungs.
 *  - After every change it holds still until the App reports the GPU has finished the frames
 *    drawn before it (`resume`) and 0.3 s more: the GPU can run seconds behind the CPU, and
 *    those old frames say nothing about the new rung.
 */
import { QUALITY_LADDER, QUALITY_TIERS } from '../config/qualityTiers.js';

const CHECK_MS = 250;
const DOWN_WINDOW_MS = 2000;
const UP_WAIT_MS = 4000;
const MAX_WAIT_MS = 120_000;
const FAIL_MS = 10_000;
const SETTLE_MS = 300;
/** Frames longer than this are hitches (a hidden tab, a stalled GPU), not the steady cost. */
const HITCH_MS = 1000;
const DOWN_RATIO = 1.15;
const FAST_RATIO = 0.67;
const PINNED_RATIO = 1.05;
const MIN_SAMPLES = 8;
const CAPACITY = 1024;

/**
 * The device's quality tier from what the browser tells about it.
 * @param {object} env
 * @param {boolean} env.coarsePointer a touch-only device (phone, tablet)
 * @param {number} [env.cores] `navigator.hardwareConcurrency`
 * @param {number | null} [env.memoryGb] `navigator.deviceMemory` (Chrome only)
 * @returns {'low' | 'medium' | 'high'}
 */
export function detectTier({ coarsePointer, cores = 4, memoryGb = null }) {
  const lowMemory = memoryGb !== null && memoryGb <= 3;
  if (coarsePointer) return cores <= 4 || lowMemory ? 'low' : 'medium';
  if (cores <= 2 || lowMemory) return 'low';
  return cores <= 4 ? 'medium' : 'high';
}

/** @returns {Parameters<typeof detectTier>[0]} what this browser says about the device */
export function browserEnv() {
  const nav = globalThis.navigator;
  return {
    coarsePointer: globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
    cores: nav?.hardwareConcurrency ?? 4,
    memoryGb: nav?.deviceMemory ?? null,
  };
}

/**
 * @param {string | null | undefined} name
 * @returns {import('../config/qualityTiers.js').QualityTier}
 */
export function tierOf(name) {
  return QUALITY_TIERS[name] ?? QUALITY_TIERS.high;
}

export class QualityGovernor {
  #ladder;
  #level;
  #budget = 1000 / 60;
  /** Frame times and when they ended: a ring buffer. */
  #times = new Float64Array(CAPACITY);
  #values = new Float64Array(CAPACITY);
  #head = 0;
  #count = 0;
  #scratch = new Float64Array(CAPACITY);
  #nextCheck = 0;
  /** Waiting for `resume()` after a change. */
  #holding = false;
  /** Samples from before this time are ignored (the window restarts here). */
  #since = 0;
  /** @type {number[]} per rung: how long the frames must be fast before stepping up to it */
  #wait;
  /** @type {{ level: number, at: number } | null} the last step up */
  #lastUp = null;

  /**
   * @param {object} [options]
   * @param {readonly import('../config/qualityTiers.js').QualityRung[]} [options.ladder]
   * @param {number} [options.level=0] the first rung
   * @param {number} [options.targetFps=60]
   */
  constructor({ ladder = QUALITY_LADDER, level = 0, targetFps = 60 } = {}) {
    this.#ladder = ladder;
    this.#level = this.#clampLevel(level);
    this.#wait = ladder.map(() => UP_WAIT_MS);
    this.setTarget(targetFps);
  }

  /** Current rung index: 0 is the best. */
  get level() {
    return this.#level;
  }

  /** The current rung. */
  get rung() {
    return this.#ladder[this.#level];
  }

  get maxLevel() {
    return this.#ladder.length - 1;
  }

  /** Frame time the governor aims at, ms. */
  get budget() {
    return this.#budget;
  }

  /** True while waiting for the GPU to catch up after a change. */
  get holding() {
    return this.#holding;
  }

  /** @param {number} fps */
  setTarget(fps) {
    this.#budget = 1000 / Math.min(240, Math.max(10, fps || 60));
  }

  /**
   * Jump to a rung (switching auto quality off and on); the window restarts.
   * @param {number} level
   * @param {number} [now=0]
   */
  setLevel(level, now = 0) {
    this.#level = this.#clampLevel(level);
    this.reset(now);
  }

  /**
   * Forget the frames so far (a hidden tab, changed settings) and stop holding.
   * @param {number} now ms
   */
  reset(now) {
    this.#holding = false;
    this.#since = now;
    this.#count = 0;
    this.#nextCheck = now + CHECK_MS;
  }

  /**
   * The GPU has finished every frame drawn before the last change: start measuring again.
   * @param {number} now ms
   */
  resume(now) {
    if (!this.#holding) return;
    this.reset(now + SETTLE_MS);
  }

  /**
   * One frame's time.
   * @param {number} frameMs time since the previous frame
   * @param {number} now ms, the frame's time
   * @returns {number | null} the new rung when the governor changes it, else null
   */
  sample(frameMs, now) {
    if (this.#holding || now < this.#since) return null;
    if (frameMs > 0 && frameMs <= HITCH_MS) {
      this.#times[this.#head] = now;
      this.#values[this.#head] = frameMs;
      this.#head = (this.#head + 1) % CAPACITY;
      this.#count = Math.min(CAPACITY, this.#count + 1);
    }
    if (now < this.#nextCheck) return null;
    this.#nextCheck = now + CHECK_MS;
    return this.#decide(now);
  }

  /** @param {number} now */
  #decide(now) {
    const budget = this.#budget;
    const recent = this.#median(now - DOWN_WINDOW_MS);
    if (recent !== null && recent > budget * DOWN_RATIO && this.#level < this.maxLevel) {
      const failed = this.#lastUp;
      if (failed && failed.level === this.#level && now - failed.at < FAIL_MS) {
        this.#wait[failed.level] = Math.min(MAX_WAIT_MS, this.#wait[failed.level] * 2);
      }
      this.#lastUp = null;
      return this.#change(this.#level + (recent > budget * 2 ? 2 : 1), now);
    }

    if (this.#level === 0) return null;
    const target = this.#level - 1;
    const calm = now - this.#since;
    const wait = this.#wait[target];
    if (calm < wait) return null;
    const steady = this.#median(now - wait);
    if (steady === null) return null;
    const fast = steady <= budget * FAST_RATIO;
    const probe = steady <= budget * PINNED_RATIO && calm >= wait * 2;
    if (!fast && !probe) return null;
    this.#lastUp = { level: target, at: now };
    return this.#change(target, now);
  }

  /**
   * @param {number} level
   * @param {number} now
   */
  #change(level, now) {
    this.#level = this.#clampLevel(level);
    this.reset(now);
    this.#holding = true;
    return this.#level;
  }

  /**
   * Median of the frames since `from`, or null with too few of them.
   * @param {number} from
   */
  #median(from) {
    const start = Math.max(from, this.#since);
    let n = 0;
    for (let i = 0; i < this.#count; i++) {
      const j = (this.#head - 1 - i + CAPACITY) % CAPACITY;
      if (this.#times[j] < start) break;
      this.#scratch[n++] = this.#values[j];
    }
    if (n < MIN_SAMPLES) return null;
    const sorted = this.#scratch.subarray(0, n).sort();
    return sorted[n >> 1];
  }

  /** @param {number} level */
  #clampLevel(level) {
    return Math.min(this.#ladder.length - 1, Math.max(0, Math.round(level) || 0));
  }
}
