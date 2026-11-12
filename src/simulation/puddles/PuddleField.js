/**
 * Puddle Placement & Wheel Collision Detection.
 *
 * Deterministically distributes puddle ellipses across road chunks, and evaluates
 * tire-surface contact to trigger splash FX and ripple events.
 */
import { CHUNK_LENGTH, WHEEL_OFFSETS } from '../../config/constants.js';
import { ROAD_FAR_X, ROAD_NEAR_X } from '../../config/streetProfile.js';
import { Rng } from '../../core/random.js';
import { Events } from '../../core/EventBus.js';

/** `weather.puddleLevel` at which puddles have dried out completely. */
export const PUDDLE_DRY_LEVEL = 0.1;
/** `weather.puddleLevel` at which puddles reach their full generated radii. */
export const PUDDLE_FULL_LEVEL = 0.8;
/** Below this scale a puddle is a damp stain: wheels no longer splash in it. */
export const PUDDLE_MIN_WET_SCALE = 0.15;
/** Gap kept between a puddle (its `radiusX`) and either curb face: water may fill the gutter. */
export const CURB_MARGIN = 0.08;
/** Share of puddles that are long, narrow pools in a gutter, against the curb. */
export const GUTTER_SHARE = 0.35;
/** Widest puddle that still keeps {@link CURB_MARGIN} to both curbs. */
const MAX_RADIUS_X = (ROAD_FAR_X - ROAD_NEAR_X) / 2 - CURB_MARGIN;

/**
 * Share of its generated radii a puddle has at a given water level: the area grows linearly
 * with the level, so the radius grows with its square root. `PuddleView` evaluates the same
 * formula in TSL, so what the wheels hit is what the camera sees.
 * @param {number} level `weather.puddleLevel` (0..1)
 * @returns {number} 0..1
 */
export function puddleScale(level) {
  const t = (level - PUDDLE_DRY_LEVEL) / (PUDDLE_FULL_LEVEL - PUDDLE_DRY_LEVEL);
  return Math.sqrt(Math.min(1, Math.max(0, t)));
}

export class PuddleField {
  /** @type {import('../../core/Store.js').Store} */
  #store;
  /** @type {import('../../core/EventBus.js').EventBus} */
  #bus;

  /** Cache of puddles by chunkIndex: Map<number, object[]> */
  #chunkPuddles = new Map();

  /** Wheel contact states, one per `WHEEL_OFFSETS` entry */
  #wheelContacts = [false, false, false, false];

  /**
   * @param {import('../../core/Store.js').Store} store
   * @param {import('../../core/EventBus.js').EventBus} bus
   */
  constructor(store, bus) {
    this.#store = store;
    this.#bus = bus;
  }

  /**
   * Deterministically get puddles for a given chunk.
   * @param {number} chunkIndex
   * @returns {object[]} array of puddle descriptors
   */
  getPuddlesForChunk(chunkIndex) {
    let puddles = this.#chunkPuddles.get(chunkIndex);
    if (puddles) return puddles;

    const seed = this.#store.get('street.seed') ?? 1;
    const maxCount = this.#store.get('water.puddleCount') ?? 2;
    const sizeMultiplier = this.#store.get('water.puddleSize') ?? 1.0;

    const rng = Rng.fork(seed, chunkIndex, 909);
    const count = rng.int(0, maxCount);

    puddles = [];
    const zStart = chunkIndex * CHUNK_LENGTH;

    for (let i = 0; i < count; i++) {
      // Water runs to the curbs: some puddles are long pools lying in a gutter
      const inGutter = rng.chance(GUTTER_SHARE);
      const farGutter = rng.chance(0.5);
      const rx = Math.min(
        (inGutter ? rng.range(0.22, 0.45) : rng.range(0.6, 1.4)) * sizeMultiplier,
        MAX_RADIUS_X,
      );
      const rz = (inGutter ? rng.range(1.2, 2.6) : rng.range(0.8, 2.0)) * sizeMultiplier;
      const x0 = ROAD_NEAR_X + CURB_MARGIN + rx;
      const x1 = ROAD_FAR_X - CURB_MARGIN - rx;

      puddles.push({
        id: `${chunkIndex}_puddle_${i}`,
        chunkIndex,
        x: inGutter ? (farGutter ? x1 : x0) : rng.range(x0, x1),
        z: rng.range(zStart + rz + 1.0, zStart + CHUNK_LENGTH - rz - 1.0),
        radiusX: rx,
        radiusZ: rz,
        rotation: inGutter ? rng.range(-0.05, 0.05) : rng.range(-0.4, 0.4),
      });
    }

    this.#chunkPuddles.set(chunkIndex, puddles);
    return puddles;
  }

  /**
   * Check whether a 2D world point (x, z) lies inside a puddle. The ellipse is turned by
   * `puddle.rotation` about +Y, as `Object3D.rotation.y` turns it in the scene.
   * @param {number} x
   * @param {number} z
   * @param {object} puddle
   * @param {number} [scale=1] share of the generated radii that holds water (see {@link puddleScale})
   */
  isPointInPuddle(x, z, puddle, scale = 1) {
    if (scale <= 0) return false;
    const dx = x - puddle.x;
    const dz = z - puddle.z;

    const cos = Math.cos(puddle.rotation);
    const sin = Math.sin(puddle.rotation);

    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;

    const rx = puddle.radiusX * scale;
    const rz = puddle.radiusZ * scale;
    return (lx / rx) ** 2 + (lz / rz) ** 2 <= 1.0;
  }

  /**
   * Update wheel-puddle collisions for the vehicle.
   * @param {number} taxiX
   * @param {number} taxiZ
   * @param {number} speed
   * @param {number} [level=1] current `weather.puddleLevel`: puddles shrink as they dry
   */
  checkWheelContacts(taxiX, taxiZ, speed, level = 1) {
    const scale = puddleScale(level);
    const wet = scale >= PUDDLE_MIN_WET_SCALE;
    const minChunk = Math.floor((taxiZ - 5) / CHUNK_LENGTH);
    const maxChunk = Math.floor((taxiZ + 5) / CHUNK_LENGTH);

    // Test each of the 4 wheels against the puddles of the adjacent chunks
    for (let i = 0; i < WHEEL_OFFSETS.length; i++) {
      const offset = WHEEL_OFFSETS[i];
      const wx = taxiX + offset[0];
      const wz = taxiZ + offset[1];

      let inPuddle = false;
      let hitPuddle = null;

      for (let c = minChunk; wet && !inPuddle && c <= maxChunk; c++) {
        const puddles = this.getPuddlesForChunk(c);
        for (let j = 0; j < puddles.length; j++) {
          if (this.isPointInPuddle(wx, wz, puddles[j], scale)) {
            inPuddle = true;
            hitPuddle = puddles[j];
            break;
          }
        }
      }

      const wasIn = this.#wheelContacts[i];

      if (inPuddle && !wasIn) {
        this.#wheelContacts[i] = true;
        this.#bus.emit(Events.WHEEL_ENTER_PUDDLE, {
          wheel: i,
          x: wx,
          z: wz,
          speed,
          puddleId: hitPuddle.id,
        });
      } else if (!inPuddle && wasIn) {
        this.#wheelContacts[i] = false;
        this.#bus.emit(Events.WHEEL_EXIT_PUDDLE, {
          wheel: i,
          x: wx,
          z: wz,
          speed,
        });
      }
    }
  }

  /**
   * Prune cached chunks that fell far behind the vehicle to free memory.
   * @param {number} currentChunkIndex
   * @param {number} [keepBehind=6]
   */
  pruneBehind(currentChunkIndex, keepBehind = 6) {
    const minKeep = currentChunkIndex - keepBehind;
    for (const chunkIndex of this.#chunkPuddles.keys()) {
      if (chunkIndex < minKeep) {
        this.#chunkPuddles.delete(chunkIndex);
      }
    }
  }
}
