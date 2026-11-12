/**
 * Weather presets. Choosing a preset writes these values into the parameter store, so every
 * slider in the Forge panel stays a live, editable override.
 */

export const PRESET_NAMES = Object.freeze([
  'Golden Hour',
  'Sunny',
  'Rain',
  'Downpour',
  'Sunset Evening',
]);

export const PRESETS = Object.freeze({
  'Golden Hour': {
    'weather.rain': 0,
    'weather.wetness': 0.14,
    'weather.puddleLevel': 0.22,
    'weather.fog': 0.008,
    'weather.cloud': 0.46,
    'weather.windStrength': 0.24,
    'weather.lightning': false,
    'lighting.sunElevation': 7,
    'lighting.sunAzimuth': 142,
    'lighting.sunColor': '#ffc07c',
    'lighting.sunIntensity': 4.25,
    'lighting.ambientSky': '#9fb0d8',
    'lighting.ambientGround': '#7a5c4a',
    'lighting.zenith': '#4e6fb2',
    'lighting.horizon': '#ffb38f',
    'lighting.exposure': 1.15,
    'lighting.streetLights': 0,
    'lighting.windowLights': 0.05,
  },
  Sunny: {
    'weather.rain': 0,
    'weather.wetness': 0.04,
    'weather.puddleLevel': 0.14,
    'weather.fog': 0.0055,
    'weather.cloud': 0.18,
    'weather.windStrength': 0.35,
    'weather.lightning': false,
    'lighting.sunElevation': 52,
    'lighting.sunAzimuth': 125,
    'lighting.sunColor': '#fff0cf',
    'lighting.sunIntensity': 2.6,
    'lighting.ambientSky': '#bcd8ff',
    'lighting.ambientGround': '#8a7d6c',
    'lighting.zenith': '#3f86dd',
    'lighting.horizon': '#bfe2ff',
    'lighting.exposure': 1.0,
    'lighting.streetLights': 0,
    'lighting.windowLights': 0.05,
  },
  Rain: {
    'weather.rain': 0.5,
    'weather.wetness': 0.8,
    'weather.puddleLevel': 0.7,
    'weather.fog': 0.016,
    'weather.cloud': 0.85,
    'weather.windStrength': 0.7,
    'weather.lightning': false,
    'lighting.sunElevation': 30,
    'lighting.sunAzimuth': 125,
    'lighting.sunColor': '#c6d2e0',
    'lighting.sunIntensity': 1.0,
    'lighting.ambientSky': '#93a3b8',
    'lighting.ambientGround': '#555a62',
    'lighting.zenith': '#5c6a7c',
    'lighting.horizon': '#929eac',
    'lighting.exposure': 0.98,
    'lighting.streetLights': 0.35,
    'lighting.windowLights': 0.25,
  },
  Downpour: {
    'weather.rain': 1,
    'weather.wetness': 1,
    'weather.puddleLevel': 1,
    'weather.fog': 0.03,
    'weather.cloud': 1,
    'weather.windStrength': 1.3,
    'weather.lightning': true,
    'lighting.sunElevation': 18,
    'lighting.sunAzimuth': 125,
    'lighting.sunColor': '#8e99a8',
    'lighting.sunIntensity': 0.55,
    'lighting.ambientSky': '#6b7889',
    'lighting.ambientGround': '#3a3d44',
    'lighting.zenith': '#343c49',
    'lighting.horizon': '#5e6876',
    'lighting.exposure': 0.95,
    'lighting.streetLights': 0.9,
    'lighting.windowLights': 0.5,
  },
  'Sunset Evening': {
    'weather.rain': 0,
    'weather.wetness': 0.35,
    'weather.puddleLevel': 0.5,
    'weather.fog': 0.011,
    'weather.cloud': 0.4,
    'weather.windStrength': 0.3,
    'weather.lightning': false,
    'lighting.sunElevation': 3.5,
    'lighting.sunAzimuth': 70,
    'lighting.sunColor': '#ff8a3d',
    'lighting.sunIntensity': 2.3,
    'lighting.ambientSky': '#c58fb0',
    'lighting.ambientGround': '#5e4650',
    'lighting.zenith': '#3b2a66',
    'lighting.horizon': '#ff9457',
    'lighting.exposure': 1.05,
    'lighting.streetLights': 1,
    'lighting.windowLights': 0.75,
  },
});

/**
 * Resolve a loose user string ("rain", "sunset") to a preset name.
 * @param {string} text
 * @returns {string|null}
 */
export function resolvePresetName(text) {
  const t = String(text ?? '')
    .toLowerCase()
    .trim();
  if (!t) return null;
  return PRESET_NAMES.find((n) => n.toLowerCase().startsWith(t)) ?? null;
}

/**
 * The preset after `name` in the auto weather cycle (the order of {@link PRESET_NAMES}, wrapping
 * round); the first preset for an unknown name.
 * @param {string} name
 */
export function nextPresetName(name) {
  return PRESET_NAMES[(PRESET_NAMES.indexOf(name) + 1) % PRESET_NAMES.length];
}
