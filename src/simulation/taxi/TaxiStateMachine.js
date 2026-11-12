/**
 * Taxi State Machine & Smooth S-Curve Motion Simulation.
 *
 * States:
 *   Cruise     -> cruising along lane (X = LANE_X) at cruiseSpeed with smooth throttle taper.
 *   Approach   -> slowing down to bus stop (pulling towards STOP_X) along an analytic C²
 *                 chauffeur "feather-stop" speed profile `vRef(d)`: brake pressure ramps in
 *                 smoothly via `damp` and eases off toward zero over the final 1.8 m, with
 *                 closed-loop velocity feedback so the cab never stalls early or overshoots.
 *   Stopped    -> stationary at stop line for `stopWait ± jitter` seconds, hazard lights active.
 *   Departing  -> S-curve throttle ramp away from bus stop and smooth merge back to cruising lane.
 */
import { LANE_X, STOP_X } from '../../config/streetProfile.js';
import { clamp, damp } from '../../core/math.js';
import { Events } from '../../core/EventBus.js';
import { stoppingDistance } from './kinematics.js';

export const TaxiState = Object.freeze({
  CRUISE: 'Cruise',
  APPROACH: 'Approach',
  STOPPED: 'Stopped',
  DEPARTING: 'Departing',
});

const FEATHER_DIST = 1.4;
const FEATHER_EXP = 0.16; // `v(d) ∝ d^(0.5 + 0.16) = d^0.66` near stop -> `a(d) ∝ d^0.32 -> 0`!

export class TaxiStateMachine {
  /** @type {import('../../core/Store.js').Store} */
  #store;
  /** @type {import('../../core/EventBus.js').EventBus} */
  #bus;

  state = TaxiState.CRUISE;
  x = LANE_X;
  z = 0;
  speed = 0;
  pitch = 0; // Suspension tilt: positive tilts up (acceleration), negative dips down (braking)

  #nextStopZ = Infinity;
  #waitTimer = 0;
  #currentWaitDuration = 4;
  #currentAccel = 0;
  #approachDecel = 3.2;

  /**
   * @param {import('../../core/Store.js').Store} store
   * @param {import('../../core/EventBus.js').EventBus} bus
   * @param {object} [options]
   * @param {number} [options.initialZ=0]
   * @param {number} [options.initialSpeed=0]
   */
  constructor(store, bus, { initialZ = 0, initialSpeed = 0 } = {}) {
    this.#store = store;
    this.#bus = bus;
    this.z = initialZ;
    this.speed = initialSpeed;
  }

  /**
   * Set upcoming bus stop position ahead of the taxi.
   * @param {number} stopZ
   */
  setNextBusStop(stopZ) {
    this.#nextStopZ = stopZ;
  }

  get nextBusStop() {
    return this.#nextStopZ;
  }

  /** Instantaneous longitudinal acceleration (`m/s²`), continuous across all states. */
  get acceleration() {
    return this.#currentAccel;
  }

  /**
   * Advance simulation by dt seconds.
   * @param {number} dt delta time in seconds
   */
  update(dt) {
    if (dt <= 0) return;

    const cruiseSpeed = this.#store.get('taxi.cruiseSpeed') ?? 8.0;
    const acceleration = this.#store.get('taxi.acceleration') ?? 2.6;
    const braking = this.#store.get('taxi.braking') ?? 3.4;
    const stopAtBusStops = this.#store.get('taxi.stopAtBusStops') ?? true;
    const bounce = this.#store.get('taxi.bounce') ?? 1.0;

    let targetX = LANE_X;
    let desiredAccel = 0;
    let accelRamp = 9.0;

    switch (this.state) {
      case TaxiState.CRUISE: {
        targetX = LANE_X;

        const speedDiff = cruiseSpeed - this.speed;
        if (speedDiff > 0.005) {
          const taper = clamp(speedDiff / 0.85, 0.12, 1.0);
          desiredAccel = acceleration * taper;
        } else if (speedDiff < -0.005) {
          const taper = clamp(-speedDiff / 1.1, 0.1, 1.0);
          desiredAccel = -braking * 0.5 * taper;
        } else {
          this.speed = cruiseSpeed;
          desiredAccel = 0;
        }

        // Begin smooth chauffeur approach ~35% earlier than hard-stop distance
        if (stopAtBusStops && Number.isFinite(this.#nextStopZ)) {
          const distToStop = this.#nextStopZ - this.z;
          const stopDist = stoppingDistance(this.speed, braking);
          if (distToStop > 0 && distToStop <= Math.max(stopDist * 1.35, 2.5)) {
            const req = (this.speed * this.speed) / (2 * Math.max(distToStop, 0.25));
            this.#approachDecel = clamp(Math.max(braking * 0.9, req * 1.18), 1.6, braking * 1.5);
            this.#transitionTo(TaxiState.APPROACH);
          }
        }
        break;
      }

      case TaxiState.APPROACH: {
        targetX = STOP_X;

        if (!stopAtBusStops) {
          this.#transitionTo(TaxiState.CRUISE);
          break;
        }

        const dist = this.#nextStopZ - this.z;
        if (dist <= 0.0001) {
          this.speed = 0;
          this.z = this.#nextStopZ;
          desiredAccel = 0;
          this.#currentAccel = 0;
          this.#initStopTimer();
          this.#transitionTo(TaxiState.STOPPED);
          break;
        }

        // Analytic feather-stop curve `vRef(d) = sqrt(2 A d) * (d / (d + df))^q`
        // + exact chain-rule time derivative `dvRef/dt = -(dvRef/dd) * v` + feedback `kv * (vRef - v)`.
        const A = this.#approachDecel;
        const denom = dist + FEATHER_DIST;
        const ratio = dist / denom;
        const feather = Math.pow(ratio, FEATHER_EXP);
        const featherSpeed = Math.sqrt(2 * A * dist) * feather;
        const creepFloor = Math.sqrt(0.36 * dist);
        const useCreep = creepFloor >= featherSpeed;
        const vRef = useCreep ? creepFloor : featherSpeed;
        const dvRef_dd = useCreep
          ? 0.18 / Math.max(creepFloor, 1e-5)
          : (featherSpeed * (0.5 * dist + (0.5 + FEATHER_EXP) * FEATHER_DIST)) / (dist * denom);
        const aFeedforward = -dvRef_dd * this.speed;

        desiredAccel = clamp(aFeedforward + 4.5 * (vRef - this.speed), -braking * 1.55, 1.15);
        accelRamp = 7.5;
        break;
      }

      case TaxiState.STOPPED: {
        targetX = STOP_X;
        this.speed = 0;
        desiredAccel = 0;
        accelRamp = 9.5;
        this.#waitTimer += dt;

        if (this.#waitTimer >= this.#currentWaitDuration) {
          this.#transitionTo(TaxiState.DEPARTING);
        }
        break;
      }

      case TaxiState.DEPARTING: {
        targetX = LANE_X;
        const rem = cruiseSpeed - this.speed;
        if (rem <= 0.03) {
          this.speed = cruiseSpeed;
          desiredAccel = 0;
          this.#transitionTo(TaxiState.CRUISE);
        } else {
          const taper = clamp(rem / 0.95, 0.15, 1.0);
          desiredAccel = acceleration * taper;
          accelRamp = 6.5;
        }
        break;
      }
    }

    // Jerk-limited continuous acceleration integration
    this.#currentAccel = damp(this.#currentAccel, desiredAccel, accelRamp, dt);

    if (this.state === TaxiState.STOPPED) {
      this.speed = 0;
    } else {
      const prevSpeed = this.speed;
      let nextSpeed = Math.max(0, prevSpeed + this.#currentAccel * dt);
      const remDist = this.#nextStopZ - this.z;

      if (
        this.state === TaxiState.CRUISE &&
        Math.abs(cruiseSpeed - nextSpeed) < 0.008 &&
        Math.abs(desiredAccel) < 0.25
      ) {
        nextSpeed = cruiseSpeed;
      }

      const avgSpeed = 0.5 * (prevSpeed + nextSpeed);
      const stepZ = avgSpeed * dt;

      if (this.state === TaxiState.APPROACH) {
        if (stepZ >= remDist || (remDist - stepZ <= 0.0001 && nextSpeed <= 0.006)) {
          this.z = this.#nextStopZ;
          this.speed = 0;
          this.#currentAccel = 0;
          this.#initStopTimer();
          this.#transitionTo(TaxiState.STOPPED);
        } else {
          this.speed = nextSpeed;
          this.z += stepZ;
        }
      } else {
        this.speed = nextSpeed;
        this.z += stepZ;
      }
    }

    // Smooth lateral chauffeur lane-change / curb pull-in
    this.x = damp(this.x, targetX, 2.9, dt);

    // Smooth suspension pitch driven by continuous `#currentAccel`
    const targetPitch = this.#currentAccel * 0.014 * bounce;
    this.pitch = damp(this.pitch, targetPitch, 8.5, dt);
  }

  #initStopTimer() {
    const wait = this.#store.get('taxi.stopWait') ?? 4.0;
    const jitter = this.#store.get('taxi.stopWaitJitter') ?? 1.0;
    const delta = (Math.random() * 2 - 1) * jitter;
    this.#currentWaitDuration = Math.max(0.5, wait + delta);
    this.#waitTimer = 0;
  }

  #transitionTo(nextState) {
    if (this.state === nextState) return;
    const from = this.state;
    this.state = nextState;
    this.#bus.emit(Events.TAXI_STATE, { from, to: nextState });
  }
}
