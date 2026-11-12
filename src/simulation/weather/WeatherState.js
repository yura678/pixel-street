/**
 * Weather State Interpolation & Atmospheric Simulation.
 *
 * Smoothly transitions continuous atmospheric variables (rain, fog, wind, sun angle, sky colors)
 * between preset targets, modeling asymmetric road dry-out times and lightning flashes.
 */
import { damp, dampAngle, degToRad } from '../../core/math.js';
import { lerpHex } from '../../core/color.js';
import { Events } from '../../core/EventBus.js';
import { nextPresetName } from '../../config/weatherPresets.js';

export class WeatherState {
  /** @type {import('../../core/Store.js').Store} */
  #store;
  /** @type {import('../../core/EventBus.js').EventBus} */
  #bus;

  // Current interpolated values
  rain = 0;
  wetness = 0.04;
  puddleLevel = 0.14;
  fog = 0.0055;
  cloud = 0.18;
  windStrength = 0.35;
  windDir = 80;

  sunElevation = 52;
  sunAzimuth = 125;
  sunIntensity = 2.6;
  exposure = 1.0;
  streetLights = 0;
  windowLights = 0.05;

  sunColor = '#fff0cf';
  ambientSky = '#bcd8ff';
  ambientGround = '#8a7d6c';
  zenith = '#3f86dd';
  horizon = '#bfe2ff';

  #lightningTimer = 6.0;

  /** Seconds the current preset has been on while the auto cycle runs. */
  #cycleTime = 0;
  /** @type {string | null} the preset the cycle timer counts for */
  #cyclePreset = null;

  /**
   * @param {import('../../core/Store.js').Store} store
   * @param {import('../../core/EventBus.js').EventBus} bus
   */
  constructor(store, bus) {
    this.#store = store;
    this.#bus = bus;
    this.snapToStore();
  }

  /**
   * Immediately snap all variables to store values (skipping interpolation).
   */
  snapToStore() {
    this.rain = this.#store.get('weather.rain') ?? 0;
    this.wetness = this.#store.get('weather.wetness') ?? 0.04;
    this.puddleLevel = this.#store.get('weather.puddleLevel') ?? 0.14;
    this.fog = this.#store.get('weather.fog') ?? 0.0055;
    this.cloud = this.#store.get('weather.cloud') ?? 0.18;
    this.windStrength = this.#store.get('weather.windStrength') ?? 0.35;
    this.windDir = this.#store.get('weather.windDir') ?? 80;

    this.sunElevation = this.#store.get('lighting.sunElevation') ?? 52;
    this.sunAzimuth = this.#store.get('lighting.sunAzimuth') ?? 125;
    this.sunIntensity = this.#store.get('lighting.sunIntensity') ?? 2.6;
    this.exposure = this.#store.get('lighting.exposure') ?? 1.0;
    this.streetLights = this.#store.get('lighting.streetLights') ?? 0;
    this.windowLights = this.#store.get('lighting.windowLights') ?? 0.05;

    this.sunColor = this.#store.get('lighting.sunColor') ?? '#fff0cf';
    this.ambientSky = this.#store.get('lighting.ambientSky') ?? '#bcd8ff';
    this.ambientGround = this.#store.get('lighting.ambientGround') ?? '#8a7d6c';
    this.zenith = this.#store.get('lighting.zenith') ?? '#3f86dd';
    this.horizon = this.#store.get('lighting.horizon') ?? '#bfe2ff';
  }

  /**
   * Advance continuous weather smoothing by dt.
   * @param {number} dt delta time in seconds
   */
  update(dt) {
    if (dt <= 0) return;

    const transitionTime = Math.max(0.5, this.#store.get('weather.transitionTime') ?? 6.0);
    const dryTime = Math.max(5.0, this.#store.get('weather.dryTime') ?? 70.0);

    // Exponential smoothing rate: lambda = 3 / T (closes ~95% in T seconds)
    const lambda = 3.0 / transitionTime;
    const dryLambda = 3.0 / dryTime;

    // Atmospheric scalars
    const targetRain = this.#store.get('weather.rain') ?? 0;
    const targetWetness = this.#store.get('weather.wetness') ?? 0;
    const targetPuddle = this.#store.get('weather.puddleLevel') ?? 0;

    this.rain = damp(this.rain, targetRain, lambda, dt);

    // Wetness and puddles dry out slower if targets are lower than current
    const wetLambda = targetWetness < this.wetness ? dryLambda : lambda;
    this.wetness = damp(this.wetness, targetWetness, wetLambda, dt);

    const puddleLambda = targetPuddle < this.puddleLevel ? dryLambda : lambda;
    this.puddleLevel = damp(this.puddleLevel, targetPuddle, puddleLambda, dt);

    this.fog = damp(this.fog, this.#store.get('weather.fog') ?? 0, lambda, dt);
    this.cloud = damp(this.cloud, this.#store.get('weather.cloud') ?? 0, lambda, dt);
    this.windStrength = damp(
      this.windStrength,
      this.#store.get('weather.windStrength') ?? 0,
      lambda,
      dt,
    );
    this.windDir = damp(this.windDir, this.#store.get('weather.windDir') ?? 80, lambda, dt);

    // Sun angles & exposure
    this.sunElevation = damp(
      this.sunElevation,
      this.#store.get('lighting.sunElevation') ?? 52,
      lambda,
      dt,
    );
    this.sunAzimuth =
      dampAngle(
        degToRad(this.sunAzimuth),
        degToRad(this.#store.get('lighting.sunAzimuth') ?? 125),
        lambda,
        dt,
      ) *
      (180 / Math.PI);

    this.sunIntensity = damp(
      this.sunIntensity,
      this.#store.get('lighting.sunIntensity') ?? 2.6,
      lambda,
      dt,
    );
    this.exposure = damp(this.exposure, this.#store.get('lighting.exposure') ?? 1.0, lambda, dt);
    this.streetLights = damp(
      this.streetLights,
      this.#store.get('lighting.streetLights') ?? 0,
      lambda,
      dt,
    );
    this.windowLights = damp(
      this.windowLights,
      this.#store.get('lighting.windowLights') ?? 0,
      lambda,
      dt,
    );

    // Colors: lerp factor = 1 - exp(-lambda * dt)
    const colorT = 1.0 - Math.exp(-lambda * dt);
    this.sunColor = lerpHex(
      this.sunColor,
      this.#store.get('lighting.sunColor') ?? '#fff0cf',
      colorT,
    );
    this.ambientSky = lerpHex(
      this.ambientSky,
      this.#store.get('lighting.ambientSky') ?? '#bcd8ff',
      colorT,
    );
    this.ambientGround = lerpHex(
      this.ambientGround,
      this.#store.get('lighting.ambientGround') ?? '#8a7d6c',
      colorT,
    );
    this.zenith = lerpHex(this.zenith, this.#store.get('lighting.zenith') ?? '#3f86dd', colorT);
    this.horizon = lerpHex(this.horizon, this.#store.get('lighting.horizon') ?? '#bfe2ff', colorT);

    // Lightning flashes during thunderstorms
    if (this.#store.get('weather.lightning')) {
      this.#lightningTimer -= dt;
      if (this.#lightningTimer <= 0) {
        this.#bus.emit(Events.LIGHTNING, { intensity: 1.0 });
        this.#lightningTimer = 6.0 + Math.random() * 9.0; // Next flash in 6-15s
      }
    }

    this.#advanceCycle(dt);
  }

  /**
   * Auto weather cycle (`weather.autoCycle`): every `weather.cycleInterval` seconds the next
   * preset is chosen, which starts the usual smooth transition. Choosing a preset by hand starts
   * the interval again.
   * @param {number} dt
   */
  #advanceCycle(dt) {
    const preset = this.#store.get('weather.preset');
    const on = this.#store.get('weather.autoCycle');
    if (!on || preset !== this.#cyclePreset) {
      this.#cyclePreset = preset;
      this.#cycleTime = 0;
    }
    if (!on) return;
    this.#cycleTime += dt;
    if (this.#cycleTime < this.#store.get('weather.cycleInterval')) return;
    this.#cyclePreset = nextPresetName(preset);
    this.#cycleTime = 0;
    this.#store.set('weather.preset', this.#cyclePreset, 'cycle');
  }
}
