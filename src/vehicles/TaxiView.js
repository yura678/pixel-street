/**
 * Taxi Visual Controller (`TaxiView`).
 *
 * Bridges the `TaxiStateMachine` simulation with the 3D `TaxiModel` in cutaway diorama space:
 *  - World placement `(sim.x, 0, sim.z)`: the simulation runs in scene X (`streetProfile.js`)
 *  - Wheel rotation (`v / WHEEL_RADIUS`) & front-axle steering angle
 *  - Plush, nearly critically-damped ($\zeta \approx 0.92$) luxury-sedan suspension reaction
 *    (subtle weight transfer on braking/launch without spring oscillation), lateral body roll,
 *    road micro-bumps, and soft engine idle purr
 *  - Automatic / manual headlights + projected road beams
 *  - Crimson stop-signals on braking / bus-stop wait + wet-asphalt red glow
 *  - Turn indicators (pulling in / merging out) & 4-way hazard blinkers when stopped
 */
import { System } from '../core/System.js';
import { clamp, damp } from '../core/math.js';
import { WHEEL_RADIUS } from '../config/constants.js';
import { TaxiState } from '../simulation/taxi/TaxiStateMachine.js';
import { TaxiModel } from './TaxiModel.js';

const TAU = Math.PI * 2;

export class TaxiView extends System {
  /** @type {import('three').Scene} */
  #scene;
  /** @type {import('../core/Store.js').Store} */
  #store;
  /** @type {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} */
  #uniforms;
  /** @type {import('../simulation/taxi/TaxiStateMachine.js').TaxiStateMachine} */
  #sim;
  /** @type {TaxiModel} */
  #model;

  #wheelAngle = 0;
  #steerAngle = 0;
  #yaw = 0;
  #roll = 0;
  #suspPitch = 0;
  #suspPitchVel = 0;
  #headlightLevel = 0;
  #brakeLevel = 0;

  #prevX = 0;
  #prevSpeed = 0;
  #initialized = false;

  /**
   * @param {import('three').Scene} scene
   * @param {import('../core/Store.js').Store} store
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   * @param {ReturnType<import('../textures/PixelCanvas.js').createFacadeAtlas>} atlas
   * @param {import('../simulation/taxi/TaxiStateMachine.js').TaxiStateMachine} taxiSim
   */
  constructor(scene, store, uniforms, atlas, taxiSim) {
    super('taxiView');
    this.#scene = scene;
    this.#store = store;
    this.#uniforms = uniforms;
    this.#sim = taxiSim;

    const initialColor = store.get('taxi.color') ?? '#f2b728';
    this.#model = this.track(new TaxiModel(atlas, uniforms, initialColor));
    this.#model.roofSignMesh.visible = store.get('taxi.roofSign') ?? true;

    this.#scene.add(this.#model.root);
    this.track(() => this.#scene.remove(this.#model.root));

    this.#bindStore();
    this.#syncImmediate();
  }

  get model() {
    return this.#model;
  }

  get root() {
    return this.#model.root;
  }

  /**
   * Updates 3D transforms, suspension physics, wheels, and vehicle lights.
   * @param {number} dt
   * @param {import('../core/System.js').FrameInfo} frame
   */
  update(dt, frame) {
    const sim = this.#sim;
    const model = this.#model;
    const time = frame?.time ?? 0;

    if (!this.#initialized || dt <= 0) {
      this.#syncImmediate();
      this.#updateLights(0.016, time, 0);
      return;
    }

    const bounce = this.#store.get('taxi.bounce') ?? 1.0;
    const x = sim.x;

    // 1. World position & lateral steering kinematics
    const vx = (x - this.#prevX) / dt;
    const accel = (sim.speed - this.#prevSpeed) / dt;
    this.#prevX = x;
    this.#prevSpeed = sim.speed;

    model.root.position.set(x, 0, sim.z);

    // Smooth chauffeur heading yaw when pulling into `+X` curb or merging out
    const targetYaw =
      sim.speed > 0.08 ? clamp(Math.atan2(vx, Math.max(sim.speed, 2.2)), -0.18, 0.18) : 0;
    this.#yaw = damp(this.#yaw, targetYaw, 5.8, dt);
    model.root.rotation.y = this.#yaw;

    // 2. Wheel spin & front-axle steering
    this.#wheelAngle = (this.#wheelAngle + (sim.speed * dt) / WHEEL_RADIUS) % TAU;
    const targetSteer = clamp(vx * 0.26, -0.32, 0.32);
    this.#steerAngle = damp(this.#steerAngle, targetSteer, 9.0, dt);

    const wheels = model.wheels;
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      w.spinMesh.rotation.x = this.#wheelAngle;
      if (w.isFront) {
        w.steerPivot.rotation.y = this.#steerAngle;
      }
    }

    // 3. Nearly critically-damped ($\zeta \approx 0.92$) luxury-sedan suspension reaction
    const targetRotX = clamp(-sim.pitch * 0.72, -0.032, 0.042);
    const stiffness = 38.0;
    const damping = 11.4;
    const subDt = Math.min(dt, 0.033);
    const springAcc = (targetRotX - this.#suspPitch) * stiffness - this.#suspPitchVel * damping;
    this.#suspPitchVel += springAcc * subDt;
    this.#suspPitch += this.#suspPitchVel * subDt;

    const targetRoll = clamp(-vx * 0.026 * bounce, -0.045, 0.045);
    this.#roll = damp(this.#roll, targetRoll, 6.5, dt);

    const speedFactor = clamp(sim.speed / 8.0, 0, 1);
    const idleVib = Math.sin(time * 32.0) * 0.0014 * bounce;
    const roadBump =
      (Math.sin(sim.z * 2.7) * 0.0024 + Math.sin(sim.z * 6.9) * 0.001) * speedFactor * bounce;
    const diveSquatY = -Math.abs(this.#suspPitch) * 0.12;

    model.chassisPivot.position.y = WHEEL_RADIUS + diveSquatY + idleVib + roadBump;
    model.chassisPivot.rotation.x = this.#suspPitch;
    model.chassisPivot.rotation.z = this.#roll;

    // 4. Headlights, stop-signals, turn blinkers & roof sign glow
    this.#updateLights(dt, time, accel);
  }

  #syncImmediate() {
    const x = this.#sim.x;
    this.#prevX = x;
    this.#prevSpeed = this.#sim.speed;
    this.#model.root.position.set(x, 0, this.#sim.z);
    this.#initialized = true;
  }

  #updateLights(dt, time, accel) {
    const sim = this.#sim;
    const model = this.#model;

    const hlMode = this.#store.get('lighting.headlights') ?? 'auto';
    let targetHl = 0.0;
    if (hlMode === 'on') {
      targetHl = 1.0;
    } else if (hlMode === 'auto') {
      const sunElev = this.#store.get('lighting.sunElevation') ?? 52;
      const streetLights = this.#uniforms.streetLights.value;
      const rain = this.#uniforms.rainIntensity.value;
      if (streetLights > 0.2 || sunElev < 18 || rain > 0.28) {
        targetHl = 1.0;
      }
    }
    this.#headlightLevel = damp(this.#headlightLevel, targetHl, 6.0, dt);
    model.headlightUniform.value = this.#headlightLevel;

    const isBraking =
      sim.state === TaxiState.APPROACH || sim.state === TaxiState.STOPPED || accel < -0.25;
    const targetBrake = isBraking ? 4.4 : this.#headlightLevel * 0.52;
    this.#brakeLevel = damp(this.#brakeLevel, targetBrake, 12.0, dt);
    model.brakeUniform.value = this.#brakeLevel;

    const pulse = Math.sin(time * Math.PI * 3.6) > 0 ? 1.0 : 0.0;
    const hazardsOn =
      sim.state === TaxiState.STOPPED && (this.#store.get('taxi.hazardLights') ?? true);

    let blinkL = 0.0;
    let blinkR = 0.0;
    if (hazardsOn) {
      blinkL = pulse;
      blinkR = pulse;
    } else if (sim.state === TaxiState.APPROACH) {
      blinkL = pulse;
    } else if (sim.state === TaxiState.DEPARTING) {
      blinkR = pulse;
    }
    model.blinkLeftUniform.value = blinkL;
    model.blinkRightUniform.value = blinkR;

    model.roofGlowUniform.value = 0.78 + this.#uniforms.streetLights.value * 1.45;

    const anyRoadLight = this.#headlightLevel > 0.01 || this.#brakeLevel > 0.05;
    model.roadLightsMesh.visible = anyRoadLight;
    model.lensConesMesh.visible = this.#headlightLevel > 0.01;
  }

  #bindStore() {
    this.track(
      this.#store.subscribe('taxi.color', () => {
        const hex = this.#store.get('taxi.color');
        if (hex) this.#model.setBodyColor(hex);
      }),
    );

    this.track(
      this.#store.subscribe('taxi.roofSign', () => {
        this.#model.roofSignMesh.visible = Boolean(this.#store.get('taxi.roofSign'));
      }),
    );
  }
}
