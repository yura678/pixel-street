/**
 * Falling leaves (`Leaves`), simulated on the GPU: one WebGPU compute pass a frame (TSL,
 * `Fn().compute()`), the CPU only sets a few uniforms.
 *
 * Every leaf lives in three storage buffers (`instancedArray`): position and size, velocity and
 * age, orientation and state. Its life (`LeafState`, rules in `simulation/leaves/leafRules.js`):
 *  - ATTACHED: grown in a crown, out of sight in the foliage, it lets go;
 *  - AIRBORNE: gravity, air drag toward the wind (gusts from noise), a pendulum flutter and spin;
 *    the taxi's wake throws it up, aside and along after the car;
 *  - RESTING: flat on the road or a sidewalk. The wake and strong gusts lift it again, but a wet
 *    leaf sticks – the wetter the street, the harder. After a while (`leaves.fallRate`) it withers;
 *  - FADING: it shrinks away where it lies and grows again in one of the crowns over the window.
 * Without crowns in the window (no trees) a withered leaf grows back on the ground somewhere else.
 *
 * The leaves live in a window of street around the camera's anchor; a leaf leaving it on one end
 * comes back at the other (positions wrap), so the window moves on without gaps, and the leaves
 * fade in and out over the last metres of both ends.
 *
 * Drawn as one `InstancedMesh` of quads: a pixel-art leaf (an 8 × 8 grid) in the leaves' colours,
 * lit like the street (Lambert, shadows received), darker when wet.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  cameraViewMatrix,
  clamp,
  cos,
  float,
  floor,
  fract,
  instanceIndex,
  instancedArray,
  int,
  length,
  max,
  min,
  mix,
  normalize,
  positionGeometry,
  pow,
  rotate,
  select,
  sign,
  sin,
  smoothstep,
  sqrt,
  step,
  uniform,
  uniformArray,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { System } from '../core/System.js';
import { MAX_LEAVES } from '../config/constants.js';
import { CURB_H, ROAD_FAR_X, ROAD_NEAR_X } from '../config/streetProfile.js';
import {
  LEAF_BEDS,
  LEAF_EDGE_FADE,
  LEAF_WINDOW_LENGTH,
  LEAF_X_RANGE,
  LeafState,
  MAX_CROWNS,
  crownsInWindow,
  leafLife,
  leafWindowAt,
} from '../simulation/leaves/leafRules.js';
import { createCurvedPositionNode } from '../rendering/tsl/curve.js';
import { hash21, valueNoise2D } from '../rendering/tsl/noise.js';

const S = LeafState;
const PI2 = Math.PI * 2;
/** Leaves lie this high over the ground (plus up to as much again, so they never z-fight). */
const LIE_LIFT = 0.006;
/** Free fall acceleration of a leaf (m/s²) at `leaves.gravity` = 1, before the air's drag. */
const LEAF_GRAVITY = 2.4;
/** Air drag (1/s): pulls a leaf's velocity toward the wind; fall speed ≈ gravity / drag. */
const DRAG = 2.2;
/** Wind (m/s) per unit of `weather.windStrength`. */
const WIND_SPEED = 1.8;
/** Seconds to wither away, and to grow again. */
const FADE_TIME = 1.2;
const GROW_TIME = 1.0;
/** Leaves never fly higher than this. */
const CEILING = 12;

export class Leaves extends System {
  /** @type {import('three/webgpu').WebGPURenderer} */
  #renderer;
  /** @type {import('../core/Store.js').Store} */
  #store;
  /** @type {THREE.InstancedMesh} */
  #mesh;

  #pos = instancedArray(MAX_LEAVES, 'vec4');
  #vel = instancedArray(MAX_LEAVES, 'vec4');
  #rot = instancedArray(MAX_LEAVES, 'vec4');

  #dt = uniform(0.0);
  #seed = uniform(0.0);
  #windowStart = uniform(-LEAF_WINDOW_LENGTH * 0.5);
  #life = uniform(-1.0);
  #gravity = uniform(1.0);
  #windResponse = uniform(1.0);
  #gusts = uniform(0.5);
  #wakeStrength = uniform(1.0);
  #wakeRadius = uniform(4.5);
  #size = uniform(0.2);
  #colorA = uniform(new THREE.Color('#d9822b'));
  #colorB = uniform(new THREE.Color('#b8c23a'));

  /** Crowns: `(x, y, z, ry)` and `(rx, rz, 0, 0)`. */
  #crownA = Array.from({ length: MAX_CROWNS }, () => new THREE.Vector4());
  #crownB = Array.from({ length: MAX_CROWNS }, () => new THREE.Vector4());
  #crownCount = uniform(0);
  #crownKey = '';

  /** @type {import('three/webgpu').ComputeNode} */
  #init;
  /** @type {import('three/webgpu').ComputeNode} */
  #step;
  #initialised = false;
  #frame = 0;
  /** Share of `leaves.count` drawn (quality governor) and the most drawn (quality tier). */
  #scale = 1;
  #cap = MAX_LEAVES;

  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/Store.js').Store} store
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   * @param {import('three/webgpu').WebGPURenderer} renderer
   */
  constructor(scene, store, uniforms, renderer) {
    super('leaves');
    this.#renderer = renderer;
    this.#store = store;

    this.#init = this.#createInit();
    this.#step = this.#createStep(uniforms);

    const geo = this.track(new THREE.PlaneGeometry(1, 1, 1, 1));
    const mat = this.track(this.#createMaterial(uniforms));
    this.#mesh = new THREE.InstancedMesh(geo, mat, MAX_LEAVES);
    this.#mesh.name = 'Leaves';
    this.#mesh.frustumCulled = false;
    this.#mesh.receiveShadow = true;
    scene.add(this.#mesh);
    this.track(() => {
      scene.remove(this.#mesh);
      this.#mesh.dispose();
      this.#init.dispose?.();
      this.#step.dispose?.();
    });

    this.#readStore();
    this.track(store.subscribe('leaves.*', () => this.#readStore()));
    this.track(store.subscribe('weather.gusts', () => this.#readStore()));
  }

  get mesh() {
    return this.#mesh;
  }

  /** Leaves drawn and simulated. */
  get count() {
    return this.#mesh.visible ? this.#mesh.count : 0;
  }

  /**
   * Draw at most `cap` leaves (the device's tier), and `scale` of `leaves.count` (the quality
   * governor). The simulation keeps running for all of them, so leaves come back where they were.
   * @param {{ scale?: number, cap?: number }} budget
   */
  setBudget({ scale = this.#scale, cap = this.#cap }) {
    this.#scale = Math.min(1, Math.max(0, scale));
    this.#cap = Math.min(MAX_LEAVES, Math.max(0, Math.round(cap)));
    this.#applyCount();
  }

  #applyCount() {
    const wanted = Math.round(this.#store.get('leaves.count') ?? 1000);
    this.#mesh.count = Math.max(0, Math.round(Math.min(this.#cap, wanted) * this.#scale));
  }

  /** Crowns the leaves grow in now. */
  get crownCount() {
    return this.#crownCount.value;
  }

  /**
   * Debug / review: read the leaves back from the GPU.
   * @returns {Promise<{ states: number[], airborne: Array<{ x: number, y: number, z: number }>,
   *   resting: Array<{ x: number, y: number, z: number }> }>} how many leaves are in each
   *   `LeafState`, and where the airborne and resting ones are
   */
  async stats() {
    const n = this.#mesh.count;
    const pos = new Float32Array(await this.#renderer.getArrayBufferAsync(this.#pos.value));
    const rot = new Float32Array(await this.#renderer.getArrayBufferAsync(this.#rot.value));
    const states = [0, 0, 0, 0];
    const airborne = [];
    const resting = [];
    for (let i = 0; i < n; i++) {
      const s = Math.round(rot[i * 4 + 3]);
      states[s]++;
      const p = { x: pos[i * 4], y: pos[i * 4 + 1], z: pos[i * 4 + 2] };
      if (s === S.AIRBORNE) airborne.push(p);
      else if (s === S.RESTING) resting.push(p);
    }
    return { states, airborne, resting };
  }

  /**
   * Centre the window of street the leaves live in on the camera's anchor, and give the leaves
   * the crowns over it.
   * @param {number} z camera anchor Z
   * @param {ReadonlyArray<{ crown: object }>} trees street trees of the streamed chunks
   */
  setWindow(z, trees) {
    const { start, end } = leafWindowAt(z);
    this.#windowStart.value = start;
    const crowns = crownsInWindow(trees, start, end);
    const key = crowns.map((c) => c.z.toFixed(2)).join(',');
    if (key === this.#crownKey) return;
    this.#crownKey = key;
    crowns.forEach((c, i) => {
      this.#crownA[i].set(c.x, c.y, c.z, c.ry);
      this.#crownB[i].set(c.rx, c.rz, 0, 0);
    });
    this.#crownCount.value = crowns.length;
  }

  /** @param {number} dt */
  update(dt) {
    const count = this.#mesh.count;
    this.#mesh.visible = count > 0;
    if (count === 0) return;
    this.#dt.value = Math.min(dt, 1 / 20);
    this.#frame = (this.#frame + 1) % 997;
    this.#seed.value = (this.#frame * 0.618034) % 1;
    if (!this.#initialised) {
      this.#renderer.compute(this.#init);
      this.#initialised = true;
    }
    this.#renderer.compute(this.#step);
  }

  #readStore() {
    const s = this.#store;
    this.#applyCount();
    const life = leafLife(s.get('leaves.fallRate') ?? 0.35);
    this.#life.value = Number.isFinite(life) ? life : -1;
    this.#gravity.value = s.get('leaves.gravity') ?? 1.1;
    this.#windResponse.value = s.get('leaves.windResponse') ?? 1;
    this.#gusts.value = s.get('weather.gusts') ?? 0.5;
    this.#wakeStrength.value = s.get('leaves.wakeStrength') ?? 1;
    this.#wakeRadius.value = s.get('leaves.wakeRadius') ?? 4.5;
    this.#size.value = s.get('leaves.size') ?? 0.2;
    this.#colorA.value.set(s.get('leaves.colorA') ?? '#d9822b');
    this.#colorB.value.set(s.get('leaves.colorB') ?? '#b8c23a');
  }

  // ---------------------------------------------------------------------------------------------
  // GPU programs
  // ---------------------------------------------------------------------------------------------

  /**
   * A random spot on the ground of the window (`r1`–`r3` in [0, 1)): `r1` picks the bed as the
   * beds share the leaves out, `r2` the place across it, `r3` along the window.
   */
  #groundSpot(r1, r2, r3) {
    let x = float(LEAF_BEDS[0].x[0]);
    let lo = 0;
    for (const bed of LEAF_BEDS) {
      x = select(r1.greaterThanEqual(lo), mix(float(bed.x[0]), float(bed.x[1]), r2), x);
      lo += bed.share;
    }
    const z = this.#windowStart.add(r3.mul(LEAF_WINDOW_LENGTH));
    return vec3(x, groundY(x), z);
  }

  #createInit() {
    return Fn(() => {
      const i = float(instanceIndex);
      const r = (k) => hash21(vec2(i.mul(0.0137).add(k), 3.7));
      const spot = this.#groundSpot(r(1.1), r(2.3), r(3.9));
      const lift = r(4.7).add(1.0).mul(LIE_LIFT);
      this.#pos.element(instanceIndex).assign(vec4(spot.add(vec3(0.0, lift, 0.0)), 1.0));
      // Lain a while already, less than the shortest life (0.6 ×): they wither at different times
      const age = max(this.#life, 0.0).mul(r(5.3).mul(0.6));
      this.#vel.element(instanceIndex).assign(vec4(0.0, 0.0, 0.0, age));
      this.#rot
        .element(instanceIndex)
        .assign(vec4(r(6.1).mul(PI2), 0.0, r(7.9).mul(PI2), S.RESTING));
    })().compute(MAX_LEAVES);
  }

  /**
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} u
   */
  #createStep(u) {
    const crownA = uniformArray(this.#crownA, 'vec4');
    const crownB = uniformArray(this.#crownB, 'vec4');

    return Fn(() => {
      const P = this.#pos.element(instanceIndex);
      const V = this.#vel.element(instanceIndex);
      const R = this.#rot.element(instanceIndex);

      const p = P.xyz.toVar();
      const grow = P.w.toVar();
      const v = V.xyz.toVar();
      const age = V.w.toVar();
      const yaw = R.x.toVar();
      const tilt = R.y.toVar();
      const phase = R.z;
      const state = R.w.toVar();

      const dt = this.#dt;
      const i = float(instanceIndex);
      const own = (k) => hash21(vec2(i.mul(0.0137).add(k), 5.1));
      const rnd = (k) => hash21(vec2(i.mul(0.0137).add(k), this.#seed.mul(97.0).add(11.0)));
      const is = (s) => abs(state.sub(s)).lessThan(0.5);

      age.addAssign(dt);

      // The taxi's wake: strongest just behind the car, reaching further back than ahead
      const taxi = u.taxiPosition;
      const radius = this.#wakeRadius;
      const d = p.sub(vec3(taxi.x, 0.0, taxi.z.sub(1.0)));
      const reach = select(d.z.lessThan(0.0), radius.mul(1.4), radius.mul(0.45));
      const q = clamp(
        float(1.0).sub(length(vec2(d.x.div(radius.mul(0.5)), d.z.div(reach)))),
        0.0,
        1.0,
      );
      const low = clamp(float(1.0).sub(p.y.div(2.5)), 0.0, 1.0);
      const pace = clamp(u.taxiSpeed.div(9.0), 0.0, 1.6);
      const wake = q.mul(q).mul(low).mul(pace).mul(this.#wakeStrength);
      const aside = select(d.x.lessThan(0.0), float(-1.0), float(1.0));

      // Wind with gusts sweeping along the street
      const gustNoise = valueNoise2D(vec2(u.time.mul(0.35), p.z.mul(0.05).add(p.x.mul(0.03))));
      const gust = clamp(gustNoise.mul(2.0).sub(1.0).mul(this.#gusts).mul(0.9).add(1.0), 0.0, 2.2);
      const windDir = vec3(cos(u.windDirection), 0.0, sin(u.windDirection));
      const windVel = windDir.mul(u.windStrength.mul(this.#windResponse).mul(WIND_SPEED).mul(gust));
      const wet = u.wetness;

      If(is(S.AIRBORNE), () => {
        const flutterRate = own(1.3).mul(1.4).add(2.2);
        const flutter = sin(u.time.mul(flutterRate).add(phase));
        const heavy = wet.mul(0.8).add(1.0);
        const accel = windVel
          .sub(v)
          .mul(DRAG)
          .add(vec3(0.0, this.#gravity.mul(-LEAF_GRAVITY).mul(heavy), 0.0))
          .add(vec3(cos(yaw), 0.0, sin(yaw)).mul(flutter.mul(2.4)))
          .add(vec3(aside.mul(1.2), 2.4, 1.0).mul(wake.mul(4.0)));
        v.addAssign(accel.mul(dt));
        p.addAssign(v.mul(dt));
        const spin = own(2.9).sub(0.5).mul(5.0);
        yaw.addAssign(spin.mul(dt));
        tilt.assign(min(1.0, tilt.add(dt.mul(3.0))));

        If(p.y.greaterThan(CEILING), () => {
          v.y.assign(min(v.y, 0.0));
        });

        const floor0 = groundY(p.x);
        If(p.y.lessThanEqual(floor0.add(LIE_LIFT)), () => {
          p.y.assign(floor0.add(own(4.7).add(1.0).mul(LIE_LIFT)));
          v.assign(vec3(0.0));
          tilt.assign(0.0);
          age.assign(0.0);
          state.assign(S.RESTING);
        });
      })
        .ElseIf(is(S.RESTING), () => {
          // A gust strong enough, now and then, or the wake: up it goes. Wet leaves stick.
          const stick = wet.mul(5.0).add(1.0);
          const strongWind = u.windStrength.mul(this.#windResponse).mul(gust);
          const windLift = step(wet.mul(2.0).add(1.6), strongWind).mul(step(rnd(3.3), dt.mul(0.6)));
          If(wake.greaterThan(stick.mul(0.1)), () => {
            v.assign(
              vec3(
                aside.mul(rnd(5.5).mul(0.8).add(0.4)).mul(wake.mul(2.5)),
                rnd(6.6).mul(1.0).add(1.2).add(wake.mul(2.0)),
                u.taxiSpeed.mul(0.12).mul(wake),
              ),
            );
            state.assign(S.AIRBORNE);
          }).ElseIf(windLift.greaterThan(0.5), () => {
            v.assign(windVel.mul(0.5).add(vec3(0.0, rnd(7.7).mul(0.8).add(0.8), 0.0)));
            state.assign(S.AIRBORNE);
          });
          grow.assign(min(1.0, grow.add(dt.div(GROW_TIME))));
          const lifespan = this.#life.mul(own(8.8).mul(0.8).add(0.6));
          If(this.#life.greaterThan(0.0).and(age.greaterThan(lifespan)), () => {
            state.assign(S.FADING);
          });
        })
        .ElseIf(is(S.FADING), () => {
          grow.subAssign(dt.div(FADE_TIME));
          If(grow.lessThanEqual(0.0), () => {
            grow.assign(0.0);
            age.assign(0.0);
            v.assign(vec3(0.0));
            tilt.assign(0.0);
            If(this.#crownCount.greaterThan(0), () => {
              // Grow again in a crown: low in the foliage, inside the ellipsoid
              const k = int(
                floor(
                  rnd(9.1)
                    .mul(float(this.#crownCount))
                    .min(MAX_CROWNS - 1),
                ),
              );
              const a = crownA.element(k);
              const b = crownB.element(k);
              const t = mix(float(0.35), float(0.8), rnd(10.3));
              const ang = rnd(11.7).mul(PI2);
              const rr = sqrt(rnd(12.9))
                .mul(sqrt(float(1.0).sub(t.mul(t))))
                .mul(0.85);
              p.assign(
                vec3(
                  a.x.add(cos(ang).mul(rr).mul(b.x)),
                  a.y.sub(t.mul(a.w)),
                  a.z.add(sin(ang).mul(rr).mul(b.y)),
                ),
              );
              state.assign(S.ATTACHED);
            }).Else(() => {
              const spot = this.#groundSpot(rnd(13.1), rnd(14.3), rnd(15.7));
              p.assign(spot.add(vec3(0.0, own(4.7).add(1.0).mul(LIE_LIFT), 0.0)));
              state.assign(S.RESTING);
            });
          });
        })
        .ElseIf(is(S.ATTACHED), () => {
          grow.assign(min(1.0, grow.add(dt.div(GROW_TIME))));
          If(
            grow.greaterThanEqual(1.0).and(age.greaterThan(own(16.1).mul(2.0).add(GROW_TIME))),
            () => {
              v.assign(vec3(0.0, -0.3, 0.0));
              state.assign(S.AIRBORNE);
            },
          );
        });

      // Between the building lines…
      If(p.x.lessThan(LEAF_X_RANGE[0]), () => {
        p.x.assign(LEAF_X_RANGE[0]);
        v.x.assign(abs(v.x).mul(0.3));
      });
      If(p.x.greaterThan(LEAF_X_RANGE[1]), () => {
        p.x.assign(LEAF_X_RANGE[1]);
        v.x.assign(abs(v.x).mul(-0.3));
      });
      // …and in the window: out at one end, back in at the other
      const start = this.#windowStart;
      p.z.assign(start.add(fract(p.z.sub(start).div(LEAF_WINDOW_LENGTH)).mul(LEAF_WINDOW_LENGTH)));

      P.assign(vec4(p, grow));
      V.assign(vec4(v, age));
      R.assign(vec4(yaw, tilt, phase, state));
    })().compute(MAX_LEAVES);
  }

  /**
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} u
   */
  #createMaterial(u) {
    const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide });
    mat.alphaTest = 0.5;

    const P = this.#pos.toAttribute();
    const R = this.#rot.toAttribute();
    const i = float(instanceIndex);
    const h1 = hash21(vec2(i.mul(0.0137).add(21.3), 1.9));
    const h2 = hash21(vec2(i.mul(0.0137).add(33.1), 2.7));
    const h3 = hash21(vec2(i.mul(0.0137).add(47.9), 4.3));

    // Size: own variety × grown × faded in at the window's ends
    const start = this.#windowStart;
    const into = P.z.sub(start);
    const edges = smoothstep(0.0, LEAF_EDGE_FADE, into).mul(
      smoothstep(0.0, LEAF_EDGE_FADE, float(LEAF_WINDOW_LENGTH).sub(into)),
    );
    const size = this.#size.mul(h1.mul(0.5).add(0.75)).mul(P.w).mul(edges);

    // Lying flat (the quad in the leaf's XZ plane), tipped to and fro while it flutters
    const rate = hash21(vec2(i.mul(0.0137).add(1.3), 5.1))
      .mul(1.4)
      .add(2.2);
    const swing = u.time.mul(rate).add(R.z);
    const euler = vec3(sin(swing).mul(1.1), R.x, cos(swing.mul(0.8)).mul(0.55)).mul(
      vec3(R.y, 1.0, R.y),
    );
    const corner = vec3(positionGeometry.x.mul(0.62), 0.0, positionGeometry.y).mul(size);
    const offset = rotate(corner, euler);
    const normal = rotate(vec3(0.0, 1.0, 0.0), euler);
    mat.positionNode = createCurvedPositionNode(u, P.xyz).add(offset);

    // Light it from its side facing up (a thin leaf glows through either way)
    const vNormal = varying(normal, 'vLeafNormal');
    const up = normalize(vNormal.mul(sign(vNormal.y).add(0.001)).add(vec3(0.0, 0.35, 0.0)));
    mat.normalNode = normalize(cameraViewMatrix.mul(vec4(up, 0.0)).xyz);

    // An 8 × 8 pixel leaf: stalk at the bottom, an almond blade, a darker midrib
    const cell = floor(uv().mul(8.0)).add(0.5).div(8.0);
    const across = abs(cell.x.sub(0.5));
    const along = cell.y;
    const blade = clamp(along.sub(0.12).div(0.88), 0.0, 1.0);
    const halfWidth = pow(sin(blade.mul(Math.PI)), 0.75).mul(0.46);
    const inBlade = step(across, halfWidth).mul(step(0.12, along));
    const stalk = step(across, 0.07).mul(step(along, 0.2));
    mat.opacityNode = max(inBlade, stalk);

    const base = mix(this.#colorA, this.#colorB, h1).mul(h2.mul(0.3).add(0.7));
    const brown = mix(base, vec3(0.3, 0.17, 0.08), 0.55);
    const leaf = select(h3.lessThan(0.3), brown, base);
    const rib = select(across.lessThan(0.07), float(0.78), float(1.0));
    mat.colorNode = leaf.mul(rib).mul(float(1.0).sub(u.wetness.mul(0.3)));
    return mat;
  }
}

/**
 * Height of the ground under X (`leafRules.groundHeightAt`) as a TSL node.
 * @param {import('three/tsl').Node} x
 */
function groundY(x) {
  const onRoad = step(ROAD_NEAR_X, x).mul(step(x, ROAD_FAR_X));
  return mix(float(CURB_H), float(0.0), onRoad);
}
