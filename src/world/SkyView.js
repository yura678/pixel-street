/**
 * Procedural pixel-art sky dome (Stage 6 of `IMPLEMENTATION_PLAN.md`).
 *
 *  - The clear sky: the horizon → zenith gradient with the sun's glow (`rendering/tsl/sky.js`,
 *    shared with the fog, so the far street fades into the very sky behind it).
 *  - A pixel sun: a disc drawn on a coarse grid of "sun pixels" around the sun's direction, with
 *    a ring of halo pixels, bright enough to bloom; the clouds hide it.
 *  - Clouds: a drifting cloud deck (value-noise fbm on a plane over the street, moving with the
 *    wind). Their edges are crisp and their shading comes in three flat tones – sunlit tops, the
 *    mid tone and the shaded side away from the sun – coloured by the weather: white with blue
 *    shadows on a sunny day, warm tops and violet undersides at dusk, heavy greys in a downpour.
 *  - At dusk, thin orange and pink streaks low over the horizon.
 *  - A lightning flash lights the clouds from within.
 *
 * The dome follows the camera and lies on the far plane (its clip depth is pinned there), drawn
 * after every opaque mesh with the depth test on: only the pixels where the sky shows run its
 * cloud shader. (Drawn first without the depth test, it shaded the whole screen – ~11 ms a
 * frame on an integrated GPU at 1600 × 900 – and everything was drawn over it.)
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraProjectionMatrix,
  clamp,
  cos,
  cross,
  dot,
  float,
  floor,
  length,
  max,
  mix,
  modelViewMatrix,
  normalize,
  positionLocal,
  pow,
  sin,
  smoothstep,
  step,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { valueNoise2D } from '../rendering/tsl/noise.js';
import {
  FLASH_COLOR,
  clearSky,
  duskOf,
  horizonHaze,
  sunThroughClouds,
} from '../rendering/tsl/sky.js';

const SKY_RADIUS = 195;

/** Angular radius of the sun's disc (radians): stylised, ~5 × the real sun. */
export const SUN_RADIUS = 0.026;
/** Sun pixels across the disc's radius. */
export const SUN_PIXELS = 6;

/** Three octaves of value noise in [0, 1]. */
const fbm3 = Fn(([p]) => {
  const n1 = valueNoise2D(p);
  const n2 = valueNoise2D(p.mul(2.07).add(vec2(13.7, 8.3)));
  const n3 = valueNoise2D(p.mul(4.31).add(vec2(41.2, 27.9)));
  return n1.mul(0.56).add(n2.mul(0.29)).add(n3.mul(0.15));
});

export class SkyView {
  /** @type {THREE.Mesh} */
  #mesh;

  /**
   * @param {THREE.Scene} scene
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(scene, uniforms, camera) {
    this.camera = camera;

    const mat = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    // On the far plane (depth = w → 1 after the divide): behind everything, whatever the radius
    const clip = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionLocal, 1.0));
    mat.vertexNode = vec4(clip.xy, clip.w.mul(0.99999), clip.w);
    mat.colorNode = skyDomeColor(uniforms, varying(normalize(positionLocal), 'vSkyDirection'));

    this.#mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 20), mat);
    this.#mesh.name = 'SkyDome';
    this.#mesh.frustumCulled = false;
    this.#mesh.renderOrder = 1000;
    this.#mesh.position.copy(camera.position);
    scene.add(this.#mesh);
  }

  get mesh() {
    return this.#mesh;
  }

  /** Keep the infinite dome centred on the orbiting camera. */
  update() {
    this.#mesh.position.copy(this.camera.position);
  }

  dispose() {
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
    this.#mesh.removeFromParent();
  }
}

/**
 * The dome's colour toward `vDir` (the dome's local position, normalised).
 * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} u
 * @param {import('three/tsl').Node} vDir
 */
function skyDomeColor(u, vDir) {
  return Fn(() => {
    const dir = normalize(vDir);
    const h = clamp(dir.y, 0.0, 1.0);
    const dusk = duskOf(u);
    const cover = u.cloudCover;
    const sunDir = u.sunDirection;
    const sunDot = clamp(dot(dir, sunDir), 0.0, 1.0);
    const flash = u.lightning;

    const clear = clearSky(u, dir).add(vec3(...FLASH_COLOR).mul(flash.mul(0.3)));

    // 1. Dusk streaks: thin bands low over the horizon, sheared so they run along it
    const around = normalize(dir.xz.add(vec2(1e-4, 0.0)));
    const streakNoise = valueNoise2D(around.mul(2.6).add(vec2(h.mul(46.0), h.mul(29.0))));
    const band = smoothstep(0.012, 0.04, h).mul(float(1.0).sub(smoothstep(0.1, 0.2, h)));
    const streaks = smoothstep(0.6, 0.64, streakNoise)
      .mul(band)
      .mul(dusk)
      .mul(float(1.0).sub(cover.mul(0.6)));
    const streakColor = mix(vec3(0.96, 0.52, 0.62), vec3(1.0, 0.68, 0.38), pow(sunDot, 2.0)).mul(
      1.15,
    );
    const withStreaks = mix(clear, streakColor, streaks.mul(0.85));

    // 2. The pixel sun: its disc and a ring of halo pixels on a coarse grid around the sun
    const right = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0)).add(vec3(0.0, 0.0, 1e-4)));
    const up = cross(right, sunDir);
    const local = vec2(dot(dir, right), dot(dir, up)).div(SUN_RADIUS);
    const cell = floor(local.mul(SUN_PIXELS)).add(0.5).div(SUN_PIXELS);
    const r = length(cell);
    const facing = step(0.0, dot(dir, sunDir));
    const disc = step(r, 1.0).mul(facing);
    const halo = step(r, 1.5).sub(disc).mul(facing);
    const sunLight = mix(u.sunColor, u.sunColor.mul(vec3(1.0, 0.72, 0.52)), dusk.mul(0.35));
    // The disc golden and only moderately bright, so its colour survives the tone mapping on
    // the pale sky round it; the halo pixels a warmer, dimmer ring
    const sunDisc = mix(sunLight, vec3(1.0, 0.84, 0.42), 0.45).mul(1.6);
    const sunHalo = mix(sunLight, vec3(1.0, 0.62, 0.3), 0.4).mul(1.1);

    // 3. The cloud deck, projected on a plane over the street and drifting with the wind
    const wind = vec2(cos(u.windDirection), sin(u.windDirection));
    const drift = wind.mul(u.time.mul(0.0026).add(0.4).mul(u.windStrength.add(0.35)));
    const plane = dir.xz
      .div(max(dir.y.add(0.16), 0.12))
      .mul(2.4)
      .add(drift);
    const density = fbm3(plane);
    const edge = float(0.63).sub(cover.mul(0.3));
    const mask = smoothstep(edge, edge.add(0.035), density).mul(smoothstep(-0.02, 0.08, dir.y));

    // Lit side faces the sun: the cloud thins toward it. Three flat tones, pixel-art style.
    const toSun = normalize(sunDir.xz.add(vec2(1e-4, 0.0)));
    const ahead = fbm3(plane.add(toSun.mul(0.18)));
    const thick = smoothstep(edge, edge.add(0.3), density);
    const lit = clamp(density.sub(ahead).mul(6.0).add(thick.mul(0.55)).add(0.2), 0.0, 1.0);
    const tone = floor(lit.mul(2.99)).div(2.0);

    const topDay = vec3(1.0, 0.98, 0.95);
    const topDusk = u.sunColor.mul(0.9).add(vec3(0.12, 0.1, 0.12));
    // An overcast deck is lit from everywhere at once: its tones draw together, grey
    const overcast = smoothstep(0.55, 1.0, cover);
    const tops = mix(
      mix(topDay, topDusk, dusk.mul(0.7)),
      u.skyHorizon.mul(1.05),
      overcast.mul(0.8),
    );
    const shadeDay = mix(u.skyZenith, u.skyHorizon, 0.6);
    const shadeDusk = vec3(0.52, 0.44, 0.62);
    const shade = mix(shadeDay, shadeDusk, dusk.mul(0.6)).mul(float(0.95).sub(overcast.mul(0.2)));
    // Heavy cores of an overcast deck are darker still
    const core = smoothstep(edge.add(0.12), edge.add(0.4), density).mul(overcast).mul(0.25);
    const shaded = shade.mul(float(1.0).sub(core));

    const cloudBase = mix(shaded, tops, tone.mul(float(1.0).sub(overcast.mul(0.55))));
    // Silver lining by the sun, the flash from within
    const lining = pow(sunDot, 24.0).mul(0.55).mul(sunThroughClouds(u));
    const cloudColor = mix(cloudBase, sunLight.mul(1.3), lining).add(
      vec3(...FLASH_COLOR).mul(flash.mul(tone.mul(0.5).add(0.45))),
    );
    const cloudAlpha = mask.mul(cover.mul(0.12).add(0.86));

    // 4. Compose: sky, sun behind the clouds, clouds, haze on the horizon
    const sunShown = float(1.0).sub(mask.mul(0.95));
    const withHalo = mix(withStreaks, sunHalo, halo.mul(sunShown).mul(0.45));
    const withSun = mix(withHalo, sunDisc, disc.mul(sunShown));
    const cloudy = mix(withSun, cloudColor, cloudAlpha);
    const hazeAmount = pow(float(1.0).sub(h), 9.0).mul(0.18);
    return mix(cloudy, horizonHaze(u, dir), hazeAmount);
  })();
}
