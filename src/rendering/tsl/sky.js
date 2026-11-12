/**
 * Colour of the sky, shared by the dome (`SkyView`) and the fog (`skyFogNode`): whatever stands
 * far away dissolves into exactly the sky behind it.
 *
 * Everything is driven by the weather uniforms (`WorldUniforms`): the zenith and horizon colours,
 * the sun's colour and direction, the cloud cover and the lightning flash. How deep into dusk
 * the sun is ({@link duskOf}) comes from the sun's height, so presets need no extra parameter.
 */
import {
  cameraPosition,
  clamp,
  densityFogFactor,
  dot,
  float,
  fog,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  vec3,
} from 'three/tsl';

/** Cold-white of a lightning flash. */
export const FLASH_COLOR = Object.freeze([0.75, 0.82, 1.0]);

/**
 * How far into dusk the sun is: 0 by day (sun above ~20°), 1 as it sets (below ~2°).
 * @param {import('../uniforms/WorldUniforms.js').WorldUniforms} u
 */
export const duskOf = (u) => float(1.0).sub(smoothstep(0.03, 0.34, u.sunDirection.y));

/**
 * How much the sun's glow comes through the clouds: full under a clear sky, a little under
 * a heavy overcast.
 * @param {import('../uniforms/WorldUniforms.js').WorldUniforms} u
 */
export const sunThroughClouds = (u) => float(1.0).sub(u.cloudCover.mul(u.cloudCover).mul(0.75));

/**
 * The clear sky (no clouds) toward the unit direction `dir`: the horizon → zenith gradient, a
 * rose band low over the horizon at dusk, and the warm glow around the sun.
 * @param {import('../uniforms/WorldUniforms.js').WorldUniforms} u
 * @param {import('three/tsl').Node} dir unit view direction (world space)
 */
export function clearSky(u, dir) {
  const h = clamp(dir.y, 0.0, 1.0);
  const dusk = duskOf(u);

  // Gradient: horizon colour, at dusk a rose band over it, then the zenith colour
  const rose = mix(u.skyHorizon, vec3(0.84, 0.61, 0.7), dusk.mul(0.4));
  const lower = mix(u.skyHorizon, rose, smoothstep(0.0, 0.12, h));
  const sky = mix(lower, u.skyZenith, smoothstep(0.08, 0.38, h));

  // Glow pooled around the sun, tinted with its light
  const sunDot = clamp(dot(dir, u.sunDirection), 0.0, 1.0);
  const glow = pow(sunDot, 4.0).mul(0.12).add(pow(sunDot, 20.0).mul(0.14)).mul(sunThroughClouds(u));
  const glowColor = mix(u.skyHorizon, u.sunColor, 0.35).mul(1.14);
  return mix(sky, glowColor, glow);
}

/**
 * The haze on the horizon toward `dir`: the clear sky at the horizon's height, brightened by
 * a lightning flash. It is what the far end of the street fades into.
 * @param {import('../uniforms/WorldUniforms.js').WorldUniforms} u
 * @param {import('three/tsl').Node} dir unit view direction (world space)
 */
export function horizonHaze(u, dir) {
  const flat = normalize(vec3(dir.x, clamp(dir.y, 0.0, 0.04), dir.z));
  return clearSky(u, flat).add(vec3(...FLASH_COLOR).mul(u.lightning.mul(0.22)));
}

/**
 * The air between the camera and a far house is lit by the whole sky, not only by the bright
 * horizon behind the house: the fog takes this share of the zenith's colour…
 */
export const FOG_ZENITH = 0.3;
/** …and is a little darker than the haze on the horizon. */
export const FOG_SHADE = 0.82;

/**
 * Exponential-squared fog (`weather.fog`) the colour of the horizon haze behind each fragment
 * (with the sun's glow toward the sun), tinted by the zenith, for `scene.fogNode`.
 * @param {import('../uniforms/WorldUniforms.js').WorldUniforms} u
 */
export function skyFogNode(u) {
  const viewDir = normalize(positionWorld.sub(cameraPosition));
  const color = mix(horizonHaze(u, viewDir), u.skyZenith, FOG_ZENITH).mul(FOG_SHADE);
  return fog(color, densityFogFactor(max(u.fogDensity, 0.0)));
}
