/**
 * Wheel splashes (`Splashes`): a pool of `MAX_SPLASH_PARTICLES` camera-facing droplets.
 *
 * The pool is split into slots of {@link SPLASH_SLOT_SIZE} droplets. Spawning a splash writes
 * two `vec4` into a slot of a uniform ring buffer — position, seed, birth time, lateral
 * direction, power, carried speed and droplet count — and nothing else: every droplet derives
 * its own velocity from a hash of its index and the slot seed, and its parabolic flight is
 * evaluated in the vertex shader from the birth time. No per-frame buffer uploads at all.
 */
import * as THREE from 'three/webgpu';
import {
  float,
  instanceIndex,
  length,
  mix,
  positionGeometry,
  smoothstep,
  step,
  uint,
  uniform,
  uniformArray,
  uv,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { System } from '../core/System.js';
import { MAX_SPLASH_PARTICLES } from '../config/constants.js';
import { clamp } from '../core/math.js';
import { createCurvedPositionNode } from '../rendering/tsl/curve.js';
import { hash21 } from '../rendering/tsl/noise.js';

/** Droplets per splash. */
export const SPLASH_SLOT_SIZE = 16;
const SLOTS = Math.floor(MAX_SPLASH_PARTICLES / SPLASH_SLOT_SIZE);
const GRAVITY = 9.8;
/** Seconds a droplet lives at most (most land in the puddle earlier). */
const LIFE = 1.4;
/** Height the droplets start at: the bottom of the tyre. */
const START_Y = 0.06;

export class Splashes extends System {
  /** @type {THREE.Scene} */
  #scene;
  /** @type {import('../core/Store.js').Store} */
  #store;
  /** @type {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} */
  #uniforms;
  /** @type {THREE.Camera} */
  #camera;

  /** @type {THREE.InstancedMesh} */
  #mesh;
  /** `(x, seed, z, birthTime)` per slot. @type {THREE.Vector4[]} */
  #slotA;
  /** `(side, power, carriedSpeed, dropletCount)` per slot. @type {THREE.Vector4[]} */
  #slotB;
  #head = 0;
  #spawned = 0;

  #size = uniform(1.0);
  #camRight = uniform(new THREE.Vector3(1, 0, 0));
  #camUp = uniform(new THREE.Vector3(0, 1, 0));

  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/Store.js').Store} store
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   * @param {THREE.Camera} camera
   */
  constructor(scene, store, uniforms, camera) {
    super('splashes');
    this.#scene = scene;
    this.#store = store;
    this.#uniforms = uniforms;
    this.#camera = camera;

    this.#slotA = Array.from({ length: SLOTS }, () => new THREE.Vector4(0, 0, 0, -1e4));
    this.#slotB = Array.from({ length: SLOTS }, () => new THREE.Vector4(0, 0, 0, 0));

    const geo = this.track(new THREE.PlaneGeometry(1, 1, 1, 1));
    const mat = this.track(this.#createMaterial());
    this.#mesh = new THREE.InstancedMesh(geo, mat, SLOTS * SPLASH_SLOT_SIZE);
    this.#mesh.name = 'Splashes';
    this.#mesh.frustumCulled = false;
    this.#mesh.renderOrder = 3;
    this.#scene.add(this.#mesh);
    this.track(() => {
      this.#scene.remove(this.#mesh);
      this.#mesh.dispose();
    });

    this.#size.value = store.get('water.splashSize') ?? 1;
    this.track(
      store.subscribe('water.splashSize', () => {
        this.#size.value = store.get('water.splashSize') ?? 1;
      }),
    );
  }

  get mesh() {
    return this.#mesh;
  }

  /** Splashes spawned since start (debug / tests). */
  get spawned() {
    return this.#spawned;
  }

  /**
   * Throw a splash of droplets from a wheel.
   * @param {number} x world X of the tyre contact
   * @param {number} z world Z of the tyre contact
   * @param {number} side lateral direction the water is thrown to (−1 or +1 along world X)
   * @param {number} speed vehicle speed (m/s)
   * @param {number} [power=1] 1 for a wheel entering a puddle, less for the spray inside it
   */
  spawn(x, z, side, speed, power = 1) {
    const amount = this.#store.get('water.splashAmount') ?? 1;
    const count = Math.min(SPLASH_SLOT_SIZE, Math.round((3 + speed * 1.6) * amount * power));
    if (count <= 0) return;

    const a = this.#slotA[this.#head];
    const b = this.#slotB[this.#head];
    a.set(x, Math.random(), z, this.#uniforms.time.value);
    b.set(side, clamp(speed / 8, 0.2, 1.5) * Math.sqrt(power), speed, count);
    this.#head = (this.#head + 1) % SLOTS;
    this.#spawned++;
  }

  update(_dt) {
    const m = this.#camera.matrixWorld;
    this.#camRight.value.setFromMatrixColumn(m, 0).normalize();
    this.#camUp.value.setFromMatrixColumn(m, 1).normalize();
  }

  #createMaterial() {
    const u = this.#uniforms;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });

    const slotA = uniformArray(this.#slotA, 'vec4');
    const slotB = uniformArray(this.#slotB, 'vec4');

    const slot = instanceIndex.div(uint(SPLASH_SLOT_SIZE));
    const j = float(instanceIndex.mod(uint(SPLASH_SLOT_SIZE)));
    const a = slotA.element(slot);
    const b = slotB.element(slot);
    const age = u.time.sub(a.w);

    const r1 = hash21(vec2(j, a.y.mul(91.7)));
    const r2 = hash21(vec2(j.add(13.0), a.y.mul(53.3)));
    const r3 = hash21(vec2(j.add(29.0), a.y.mul(17.9)));
    const r4 = hash21(vec2(j.add(47.0), a.y.mul(71.1)));

    // Thrown sideways out of the wheel arch and up, partly carried along by the car
    const power = b.y;
    const vx = b.x.mul(r1.mul(1.9).add(0.45)).mul(power);
    const vy = r2.mul(2.1).add(0.8).mul(power);
    const vz = b.z.mul(r3.mul(0.55).sub(0.12)).add(r4.sub(0.5).mul(0.9).mul(power));
    const x0 = a.x.add(b.x.mul(0.08)).add(r2.sub(0.5).mul(0.1));
    const z0 = a.z.add(r1.sub(0.5).mul(0.3));
    const pos = vec3(
      x0.add(vx.mul(age)),
      float(START_Y)
        .add(vy.mul(age))
        .sub(age.mul(age).mul(GRAVITY * 0.5)),
      z0.add(vz.mul(age)),
    );

    const alive = step(0.0, age)
      .mul(step(age, LIFE))
      .mul(step(0.0, pos.y))
      .mul(step(j.add(0.5), b.w));
    const size = r4.mul(0.04).add(0.04).mul(this.#size).mul(alive);

    // Curve the droplet centre with the world, then expand the camera-facing quad
    const center = createCurvedPositionNode(u, pos);
    const corner = positionGeometry.xy.mul(size);
    mat.positionNode = center.add(this.#camRight.mul(corner.x)).add(this.#camUp.mul(corner.y));

    const vFade = varying(float(1.0).sub(smoothstep(LIFE * 0.6, LIFE, age)), 'vSplashFade');
    const round = float(1.0).sub(smoothstep(0.3, 0.5, length(uv().sub(0.5))));

    // Water picks up the sky and, at dusk, the warm street lights
    mat.colorNode = mix(u.skyHorizon, vec3(0.82, 0.88, 0.95), 0.55)
      .mul(u.ambientSky.mul(0.35).add(0.55))
      .add(vec3(1.0, 0.75, 0.45).mul(u.streetLights.mul(0.15)));
    mat.opacityNode = round.mul(vFade).mul(0.9);
    return mat;
  }
}
