/**
 * Central owner of shared TSL uniform nodes.
 *
 * Shaders read these uniforms directly. When Store parameters change (via Forge,
 * presets, or animations), WorldUniforms updates the uniform values without triggering
 * shader recompilation.
 */
import { uniform, vec3 } from 'three/tsl';
import { hexToRgb } from '../../core/color.js';
import { degToRad } from '../../core/math.js';

/**
 * Unit vector toward the sun, the same convention as the sun light (`Lighting`): azimuth 0 looks
 * down +Z, 90° down −X (the open, camera side of the street).
 * @template {{ set: (x: number, y: number, z: number) => unknown }} T
 * @param {number} azimuthRad
 * @param {number} elevationRad
 * @param {T} out
 * @returns {T}
 */
export function sunDirectionOf(azimuthRad, elevationRad, out) {
  const cosEl = Math.cos(elevationRad);
  out.set(-Math.sin(azimuthRad) * cosEl, Math.sin(elevationRad), Math.cos(azimuthRad) * cosEl);
  return out;
}

export class WorldUniforms {
  /**
   * @param {import('../../core/Store.js').Store} store
   */
  constructor(store) {
    // --- World Curvature ---
    this.curveDown = uniform(store.get('curve.down') ?? 0.0016);
    this.bendSide = uniform(store.get('curve.bend') ?? 0.0006);
    this.bendFreq = uniform(store.get('curve.freq') ?? 0.03);
    this.bendSpeed = uniform(store.get('curve.speed') ?? 0.25);

    // --- Weather ---
    this.wetness = uniform(store.get('weather.wetness') ?? 0.04);
    this.rainIntensity = uniform(store.get('weather.rain') ?? 0.0);
    this.puddleLevel = uniform(store.get('weather.puddleLevel') ?? 0.14);
    this.fogDensity = uniform(store.get('weather.fog') ?? 0.0055);
    this.windStrength = uniform(store.get('weather.windStrength') ?? 0.35);
    this.windDirection = uniform(degToRad(store.get('weather.windDir') ?? 80));

    // --- Lighting ---
    this.exposure = uniform(store.get('lighting.exposure') ?? 1.0);
    this.streetLights = uniform(store.get('lighting.streetLights') ?? 0.0);
    this.windowLights = uniform(store.get('lighting.windowLights') ?? 0.05);
    this.sunIntensity = uniform(store.get('lighting.sunIntensity') ?? 2.6);

    const skyRgb = hexToRgb(store.get('lighting.ambientSky') ?? '#bcd8ff');
    const groundRgb = hexToRgb(store.get('lighting.ambientGround') ?? '#8a7d6c');
    this.ambientSky = uniform(vec3(skyRgb.r, skyRgb.g, skyRgb.b));
    this.ambientGround = uniform(vec3(groundRgb.r, groundRgb.g, groundRgb.b));

    const zenithRgb = hexToRgb(store.get('lighting.zenith') ?? '#3f86dd');
    const horizonRgb = hexToRgb(store.get('lighting.horizon') ?? '#bfe2ff');
    this.skyZenith = uniform(vec3(zenithRgb.r, zenithRgb.g, zenithRgb.b));
    this.skyHorizon = uniform(vec3(horizonRgb.r, horizonRgb.g, horizonRgb.b));
    this.cloudCover = uniform(store.get('weather.cloud') ?? 0.18);

    const sunRgb = hexToRgb(store.get('lighting.sunColor') ?? '#fff0cf');
    this.sunColor = uniform(vec3(sunRgb.r, sunRgb.g, sunRgb.b));
    /** Unit vector toward the sun (world space), see {@link sunDirectionOf}. */
    this.sunDirection = uniform(vec3(0, 1, 0));
    this.setSunAngles(
      degToRad(store.get('lighting.sunAzimuth') ?? 125),
      degToRad(store.get('lighting.sunElevation') ?? 52),
    );
    /** Lightning flash, 0 (none) … 2 (the brightest strike). */
    this.lightning = uniform(0.0);

    // --- Render / Post-processing ---
    this.pixelSize = uniform(store.get('render.pixelSize') ?? 1.0);
    this.paletteLevels = uniform(store.get('render.paletteLevels') ?? 14.0);
    this.ditherEnabled = uniform(store.get('render.dither') ? 1.0 : 0.0);
    this.ditherStrength = uniform(store.get('render.ditherStrength') ?? 0.8);
    this.saturation = uniform(store.get('render.saturation') ?? 1.1);

    // --- Street ---
    /** Share of the near crowns' pixels drawn between the camera and the street. */
    this.nearCanopy = uniform(store.get('street.nearCanopy') ?? 0.45);

    // --- Dynamic Simulation Uniforms ---
    this.taxiPosition = uniform(vec3(0, 0, 0));
    this.taxiSpeed = uniform(0.0);
    this.time = uniform(0.0);

    // Listen to store updates
    this.#bindStore(store);
  }

  /**
   * Sync uniforms with Store changes.
   * @param {import('../../core/Store.js').Store} store
   */
  #bindStore(store) {
    const tempRgb = { r: 0, g: 0, b: 0 };

    store.subscribe('*', (keys) => {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        switch (key) {
          // Curve
          case 'curve.down':
            this.curveDown.value = store.get(key);
            break;
          case 'curve.bend':
            this.bendSide.value = store.get(key);
            break;
          case 'curve.freq':
            this.bendFreq.value = store.get(key);
            break;
          case 'curve.speed':
            this.bendSpeed.value = store.get(key);
            break;

          // Weather
          case 'weather.wetness':
            this.wetness.value = store.get(key);
            break;
          case 'weather.rain':
            this.rainIntensity.value = store.get(key);
            break;
          case 'weather.puddleLevel':
            this.puddleLevel.value = store.get(key);
            break;
          case 'weather.fog':
            this.fogDensity.value = store.get(key);
            break;
          case 'weather.windStrength':
            this.windStrength.value = store.get(key);
            break;
          case 'weather.windDir':
            this.windDirection.value = degToRad(store.get(key));
            break;
          case 'weather.cloud':
            this.cloudCover.value = store.get(key);
            break;

          // Lighting
          case 'lighting.exposure':
            this.exposure.value = store.get(key);
            break;
          case 'lighting.streetLights':
            this.streetLights.value = store.get(key);
            break;
          case 'lighting.windowLights':
            this.windowLights.value = store.get(key);
            break;
          case 'lighting.sunIntensity':
            this.sunIntensity.value = store.get(key);
            break;
          case 'lighting.ambientSky': {
            hexToRgb(store.get(key), tempRgb);
            this.ambientSky.value.set(tempRgb.r, tempRgb.g, tempRgb.b);
            break;
          }
          case 'lighting.ambientGround': {
            hexToRgb(store.get(key), tempRgb);
            this.ambientGround.value.set(tempRgb.r, tempRgb.g, tempRgb.b);
            break;
          }
          case 'lighting.zenith': {
            hexToRgb(store.get(key), tempRgb);
            this.skyZenith.value.set(tempRgb.r, tempRgb.g, tempRgb.b);
            break;
          }
          case 'lighting.horizon': {
            hexToRgb(store.get(key), tempRgb);
            this.skyHorizon.value.set(tempRgb.r, tempRgb.g, tempRgb.b);
            break;
          }
          case 'lighting.sunColor': {
            hexToRgb(store.get(key), tempRgb);
            this.sunColor.value.set(tempRgb.r, tempRgb.g, tempRgb.b);
            break;
          }

          // Render / Post-processing
          case 'render.pixelSize':
            this.pixelSize.value = store.get(key);
            break;
          case 'render.paletteLevels':
            this.paletteLevels.value = store.get(key);
            break;
          case 'render.dither':
            this.ditherEnabled.value = store.get(key) ? 1.0 : 0.0;
            break;
          case 'render.ditherStrength':
            this.ditherStrength.value = store.get(key);
            break;
          case 'render.saturation':
            this.saturation.value = store.get(key);
            break;

          // Street
          case 'street.nearCanopy':
            this.nearCanopy.value = store.get(key);
            break;
        }
      }
    });
  }

  /**
   * Point {@link sunDirection} at the sun.
   * @param {number} azimuthRad `lighting.sunAzimuth` in radians
   * @param {number} elevationRad `lighting.sunElevation` in radians
   */
  setSunAngles(azimuthRad, elevationRad) {
    sunDirectionOf(azimuthRad, elevationRad, this.sunDirection.value);
  }

  /**
   * Update time and dynamic simulation uniforms every frame.
   * @param {number} timeSec
   * @param {number} [taxiX=0]
   * @param {number} [taxiY=0]
   * @param {number} [taxiZ=0]
   * @param {number} [taxiSpeed=0]
   */
  update(timeSec, taxiX = 0, taxiY = 0, taxiZ = 0, taxiSpeed = 0) {
    this.time.value = timeSec;
    this.taxiPosition.value.set(taxiX, taxiY, taxiZ);
    this.taxiSpeed.value = taxiSpeed;
  }
}
