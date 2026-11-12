/**
 * Single source of truth for every tweakable parameter.
 * From this schema we derive: defaults, Forge controls (type, range, step, options),
 * and validation of imported JSON / presets.
 */
import { PRESETS, PRESET_NAMES } from './weatherPresets.js';

const num = (key, label, def, min, max, step = 0.01) => ({
  key,
  label,
  type: 'number',
  default: def,
  min,
  max,
  step,
});
const bool = (key, label, def) => ({ key, label, type: 'boolean', default: def });
const sel = (key, label, def, options) => ({ key, label, type: 'select', default: def, options });
const col = (key, label, def) => ({ key, label, type: 'color', default: def });
const act = (id, label) => ({ type: 'action', id, label });
/**
 * Changing it rebuilds geometry (street chunks, puddles) or render targets: Forge applies it
 * when the slider is released or the colour picker closed, not on every step of a drag.
 */
const rebuild = (def) => ({ ...def, rebuild: true });
// A parameter nothing reads yet is marked `{ ...def, pending: 'Stage N' }`: Forge shows it
// disabled, with the stage that will wire it up (none at the moment).

const golden = PRESETS['Golden Hour'];

/** Folder layout shown in Forge. `open` – initially expanded on desktop. */
export const PARAM_FOLDERS = Object.freeze([
  {
    name: 'Weather',
    open: true,
    items: [
      sel('weather.preset', 'Preset', 'Golden Hour', PRESET_NAMES),
      num('weather.transitionTime', 'Transition (s)', 6, 0.5, 30, 0.5),
      num('weather.dryTime', 'Dry-out time (s)', 70, 5, 300, 5),
      num('weather.rain', 'Rain intensity', golden['weather.rain'], 0, 1),
      num('weather.wetness', 'Road wetness', golden['weather.wetness'], 0, 1),
      num('weather.puddleLevel', 'Puddle level', golden['weather.puddleLevel'], 0, 1),
      num('weather.fog', 'Fog density', golden['weather.fog'], 0, 0.06, 0.001),
      num('weather.cloud', 'Cloud cover', golden['weather.cloud'], 0, 1),
      num('weather.windStrength', 'Wind strength', golden['weather.windStrength'], 0, 2.5),
      num('weather.windDir', 'Wind direction (deg)', 80, 0, 360, 1),
      num('weather.gusts', 'Gusts', 0.5, 0, 1),
      bool('weather.lightning', 'Lightning', golden['weather.lightning']),
      bool('weather.autoCycle', 'Auto weather cycle', false),
      num('weather.cycleInterval', 'Cycle interval (s)', 45, 10, 300, 5),
    ],
  },
  {
    name: 'Lighting',
    items: [
      num(
        'lighting.sunElevation',
        'Sun elevation (deg)',
        golden['lighting.sunElevation'],
        -10,
        85,
        0.5,
      ),
      num('lighting.sunAzimuth', 'Sun azimuth (deg)', golden['lighting.sunAzimuth'], 0, 360, 1),
      col('lighting.sunColor', 'Sun color', golden['lighting.sunColor']),
      num('lighting.sunIntensity', 'Sun intensity', golden['lighting.sunIntensity'], 0, 6),
      col('lighting.ambientSky', 'Ambient sky', golden['lighting.ambientSky']),
      col('lighting.ambientGround', 'Ambient ground', golden['lighting.ambientGround']),
      col('lighting.zenith', 'Sky zenith', golden['lighting.zenith']),
      col('lighting.horizon', 'Sky horizon / fog', golden['lighting.horizon']),
      num('lighting.exposure', 'Exposure', golden['lighting.exposure'], 0.4, 1.8),
      num('lighting.streetLights', 'Street lights', golden['lighting.streetLights'], 0, 1),
      num('lighting.windowLights', 'Lit windows', golden['lighting.windowLights'], 0, 1),
      sel('lighting.headlights', 'Headlights', 'auto', ['auto', 'on', 'off']),
    ],
  },
  {
    name: 'Taxi',
    items: [
      num('taxi.cruiseSpeed', 'Cruise speed (m/s)', 8, 1, 22, 0.5),
      num('taxi.acceleration', 'Acceleration', 2.6, 0.5, 8, 0.1),
      num('taxi.braking', 'Braking', 3.4, 0.8, 9, 0.1),
      col('taxi.color', 'Body color', '#eba426'),
      bool('taxi.stopAtBusStops', 'Stop at bus stops', true),
      num('taxi.stopWait', 'Stop wait (s)', 4, 0.5, 20, 0.5),
      num('taxi.stopWaitJitter', 'Wait variation (s)', 1, 0, 5, 0.1),
      rebuild(num('taxi.busStopInterval', 'Bus stop interval (m)', 180, 60, 600, 20)),
      num('taxi.bounce', 'Suspension bounce', 1, 0, 2.5),
      bool('taxi.hazardLights', 'Hazards when stopped', true),
      bool('taxi.roofSign', 'Roof sign', true),
    ],
  },
  {
    name: 'Street',
    items: [
      rebuild(num('street.seed', 'Seed', 1, 0, 9999, 1)),
      act('randomSeed', 'Random seed'),
      rebuild(num('street.treeDensity', 'Tree density', 0.55, 0, 1)),
      num('street.nearCanopy', 'Near crowns opacity', 0.45, 0, 1),
      rebuild(num('street.saturation', 'Palette saturation', 1.03, 0, 1.6)),
      rebuild(num('street.drawChunks', 'Draw distance (chunks)', 7, 3, 10, 1)),
    ],
  },
  {
    name: 'World Curve',
    items: [
      num('curve.down', 'Horizon drop', 0.0016, 0, 0.006, 0.0001),
      num('curve.bend', 'Side bend', 0.0006, -0.003, 0.003, 0.0001),
      num('curve.freq', 'Bend frequency', 0.022, 0, 0.12, 0.001),
      num('curve.speed', 'Bend speed', 0.0, 0, 2, 0.01),
    ],
  },
  {
    name: 'Water',
    items: [
      rebuild(num('water.puddleCount', 'Puddles per chunk', 3, 0, 5, 1)),
      rebuild(num('water.puddleSize', 'Puddle size', 1, 0.4, 2, 0.05)),
      sel('water.reflection', 'Reflections', 'fake', ['off', 'fake']),
      num('water.reflectionStrength', 'Reflection strength', 1, 0, 2),
      num('water.rippleSpeed', 'Ripple speed', 1.6, 0.4, 4),
      num('water.rippleDecay', 'Ripple decay', 1.4, 0.3, 4),
      num('water.splashAmount', 'Splash amount', 1, 0, 2),
      num('water.splashSize', 'Splash size', 1, 0.4, 2.5),
      num('water.trackOpacity', 'Tire track opacity', 0.55, 0, 1),
      num('water.trackFade', 'Track fade time (s)', 18, 2, 90, 1),
    ],
  },
  {
    name: 'Leaves',
    items: [
      num('leaves.count', 'Count', 1000, 0, 2500, 50),
      num('leaves.size', 'Size', 0.2, 0.06, 0.4),
      rebuild(col('leaves.colorA', 'Color A', '#d9822b')),
      rebuild(col('leaves.colorB', 'Color B', '#b8c23a')),
      num('leaves.gravity', 'Gravity', 1.1, 0.2, 4),
      num('leaves.windResponse', 'Wind response', 1, 0, 3),
      num('leaves.wakeStrength', 'Taxi wake strength', 1, 0, 3),
      num('leaves.wakeRadius', 'Taxi wake radius', 4.5, 1, 10, 0.1),
      num('leaves.fallRate', 'Fall from trees', 0.35, 0, 1),
    ],
  },
  {
    name: 'Camera',
    items: [
      sel('camera.mode', 'Mode', 'Isometric', ['Isometric', 'Chase', 'Side', 'Orbit']),
      num('camera.distance', 'Distance', 19, 6, 40, 0.5),
      num('camera.height', 'Height', 3.2, 1, 28, 0.25),
      num('camera.fov', 'FOV', 26, 12, 70, 1),
      num('camera.smoothing', 'Follow smoothing', 5.5, 0.5, 12, 0.1),
      num('camera.sway', 'Idle sway', 0.04, 0, 1),
    ],
  },
  {
    name: 'Pixel & Render',
    items: [
      rebuild(num('render.pixelSize', 'Pixel size', 1, 1, 10, 1)),
      num('render.paletteLevels', 'Palette levels', 64, 3, 64, 1),
      bool('render.dither', 'Dithering', false),
      num('render.ditherStrength', 'Dither strength', 0.25, 0, 1.5),
      num('render.saturation', 'Saturation', 1.1, 0, 2),
      bool('render.shadows', 'Shadows', true),
      bool('render.autoQuality', 'Auto quality', true),
      num('render.targetFps', 'Target FPS', 60, 20, 120, 5),
      bool('render.showFps', 'Show FPS', false),
    ],
  },
  {
    name: 'Presets',
    items: [
      act('savePreset', 'Save preset'),
      act('loadPreset', 'Load preset'),
      act('deletePreset', 'Delete preset'),
      act('exportJson', 'Export JSON'),
      act('importJson', 'Import JSON'),
      act('randomize', 'Randomize world'),
      act('resetAll', 'Reset to defaults'),
      act('screenshot', 'Screenshot (PNG)'),
    ],
  },
]);

/** Flat map key → definition (actions excluded). */
export const PARAM_DEFS = Object.freeze(
  Object.fromEntries(
    PARAM_FOLDERS.flatMap((f) => f.items.filter((i) => i.type !== 'action').map((i) => [i.key, i])),
  ),
);

/** @returns {Record<string, any>} fresh object with all defaults */
export function createDefaults() {
  return Object.fromEntries(Object.entries(PARAM_DEFS).map(([k, d]) => [k, d.default]));
}
