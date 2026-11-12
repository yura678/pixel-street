/**
 * Water system: puddles + ripples + splashes + tyre tracks.
 *
 * Bridges the simulation (`PuddleField` wheel contacts, `TireWetness`) with the water views:
 *  - a wheel entering a puddle throws a splash and starts a ripple ring;
 *  - while a wheel rolls through the water it keeps spraying every {@link SPRAY_STEP} metres;
 *  - the rear tyres stamp a wet track every `TRACK_STEP` metres, as wet as the tyre is.
 *
 * Wheel positions are taken from the taxi's visual root (yaw included). Distances
 * come from how far each wheel actually moved, so a paused or teleported taxi neither sprays
 * nor smears a track across the street.
 */
import { System } from '../core/System.js';
import { Events } from '../core/EventBus.js';
import { WHEEL_OFFSETS } from '../config/constants.js';
import { clamp } from '../core/math.js';
import { PuddleView } from '../world/PuddleView.js';
import { TRACK_STEP, TireTracksView } from '../world/TireTracksView.js';
import { Splashes } from '../fx/Splashes.js';

/** Metres between two sprays of a wheel rolling through a puddle. */
export const SPRAY_STEP = 0.7;
/** A wheel that moved further than this in one frame was teleported: restart its track. */
const MAX_FRAME_MOVE = 2.0;
/** Tyres drier than this leave no visible track. */
const MIN_TRACK_WETNESS = 0.06;
/** Simulation indices of the rear wheels (see `WHEEL_OFFSETS`). */
const REAR_WHEELS = Object.freeze([2, 3]);

export class WaterSystem extends System {
  /** @type {PuddleView} */
  puddles;
  /** @type {TireTracksView} */
  tracks;
  /** @type {Splashes} */
  splashes;

  #taxi;
  #taxiRoot;
  #tireWetness;

  /** Current visual X/Z of every wheel. */
  #wheelX = new Float64Array(4);
  #wheelZ = new Float64Array(4);
  #prevX = new Float64Array(4);
  #prevZ = new Float64Array(4);
  #hasPrev = false;

  #inPuddle = [false, false, false, false];
  #sprayDist = new Float64Array(4);

  /** Last track point of each rear wheel. */
  #trackX = new Float64Array(2);
  #trackZ = new Float64Array(2);
  #trackValid = [false, false];

  /**
   * @param {object} deps
   * @param {import('three/webgpu').Scene} deps.scene
   * @param {import('../core/Store.js').Store} deps.store
   * @param {import('../core/EventBus.js').EventBus} deps.bus
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} deps.uniforms
   * @param {import('three/webgpu').Camera} deps.camera
   * @param {import('../simulation/puddles/PuddleField.js').PuddleField} deps.puddleField
   * @param {import('../simulation/tracks/TireWetness.js').TireWetness} deps.tireWetness
   * @param {import('../simulation/taxi/TaxiStateMachine.js').TaxiStateMachine} deps.taxi
   * @param {import('three/webgpu').Object3D} deps.taxiRoot visual root of the taxi model
   */
  constructor({ scene, store, bus, uniforms, camera, puddleField, tireWetness, taxi, taxiRoot }) {
    super('water');
    this.#taxi = taxi;
    this.#taxiRoot = taxiRoot;
    this.#tireWetness = tireWetness;

    this.puddles = this.track(new PuddleView(scene, store, uniforms, puddleField));
    this.tracks = this.track(new TireTracksView(scene, store, uniforms));
    this.splashes = this.track(new Splashes(scene, store, uniforms, camera));

    this.track(
      bus.on(Events.WHEEL_ENTER_PUDDLE, ({ wheel, x, z, speed }) => {
        this.#inPuddle[wheel] = true;
        this.#sprayDist[wheel] = 0;
        this.#splash(wheel, x, z, speed, 1);
      }),
    );
    this.track(
      bus.on(Events.WHEEL_EXIT_PUDDLE, ({ wheel }) => {
        this.#inPuddle[wheel] = false;
      }),
    );
  }

  /** @param {number} z camera anchor Z (keeps the puddles around the camera loaded) */
  setCameraZ(z) {
    this.puddles.setCameraZ(z);
  }

  /**
   * @param {number} dt
   * @param {import('../core/System.js').FrameInfo} frame
   */
  update(dt, frame) {
    this.#locateWheels();
    const speed = this.#taxi.speed;

    for (let i = 0; i < 4; i++) {
      const moved = this.#hasPrev
        ? Math.hypot(this.#wheelX[i] - this.#prevX[i], this.#wheelZ[i] - this.#prevZ[i])
        : 0;
      if (moved > MAX_FRAME_MOVE) continue;
      if (!this.#inPuddle[i] || speed < 0.4) continue;
      this.#sprayDist[i] += moved;
      while (this.#sprayDist[i] >= SPRAY_STEP) {
        this.#sprayDist[i] -= SPRAY_STEP;
        this.#splash(i, this.#wheelX[i], this.#wheelZ[i], speed, 0.4);
      }
    }

    for (let k = 0; k < REAR_WHEELS.length; k++) {
      const i = REAR_WHEELS[k];
      this.#stampTrack(k, this.#wheelX[i], this.#wheelZ[i], this.#tireWetness.getWetness(i));
    }

    this.puddles.setTaxiVisible(this.#taxiRoot.visible);
    this.puddles.update(dt, frame);
    this.tracks.update(dt, frame);
    this.splashes.update(dt, frame);
  }

  #locateWheels() {
    this.#prevX.set(this.#wheelX);
    this.#prevZ.set(this.#wheelZ);

    const root = this.#taxiRoot;
    const px = root.position.x;
    const pz = root.position.z;
    const cos = Math.cos(root.rotation.y);
    const sin = Math.sin(root.rotation.y);
    for (let i = 0; i < 4; i++) {
      const [ox, oz] = WHEEL_OFFSETS[i];
      this.#wheelX[i] = px + ox * cos + oz * sin;
      this.#wheelZ[i] = pz - ox * sin + oz * cos;
    }
    if (!this.#hasPrev) {
      this.#prevX.set(this.#wheelX);
      this.#prevZ.set(this.#wheelZ);
      this.#hasPrev = true;
    }
  }

  /**
   * Advance the track of rear wheel `k` to (x, z), dropping stamps exactly `TRACK_STEP` apart.
   * @param {number} k
   * @param {number} x
   * @param {number} z
   * @param {number} wetness
   */
  #stampTrack(k, x, z, wetness) {
    let lx = this.#trackX[k];
    let lz = this.#trackZ[k];
    const dx = x - lx;
    const dz = z - lz;
    let d = Math.hypot(dx, dz);
    if (!this.#trackValid[k] || d > MAX_FRAME_MOVE) {
      this.#trackX[k] = x;
      this.#trackZ[k] = z;
      this.#trackValid[k] = true;
      return;
    }
    if (d < TRACK_STEP) return;

    const ux = dx / d;
    const uz = dz / d;
    const yaw = Math.atan2(ux, uz);
    while (d >= TRACK_STEP) {
      if (wetness > MIN_TRACK_WETNESS) {
        this.tracks.addStamp(lx + ux * TRACK_STEP * 0.5, lz + uz * TRACK_STEP * 0.5, yaw, wetness);
      }
      lx += ux * TRACK_STEP;
      lz += uz * TRACK_STEP;
      d -= TRACK_STEP;
    }
    this.#trackX[k] = lx;
    this.#trackZ[k] = lz;
  }

  /**
   * @param {number} wheel index into `WHEEL_OFFSETS`
   * @param {number} x
   * @param {number} z
   * @param {number} speed
   * @param {number} power
   */
  #splash(wheel, x, z, speed, power) {
    // Spray flies out on the wheel's own side of the taxi
    const side = WHEEL_OFFSETS[wheel][0] > 0 ? 1 : -1;
    if (speed >= 0.3) this.splashes.spawn(x, z, side, speed, power);
    this.puddles.addRipple(x, z, clamp(0.35 + speed * 0.08, 0.3, 1.1) * Math.sqrt(power));
  }
}
