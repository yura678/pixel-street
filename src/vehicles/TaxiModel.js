/**
 * Procedural 3D Hero Vintage City Taxi Model (`TaxiModel`).
 *
 * Sculpted Checker-inspired vintage cab featuring:
 *  - True 8-segment circular polygonal wheel arches with 3D fender flares, liners & mudflaps
 *  - Exact raked & tumblehome-tapered A, B, and C pillars (`MeshBuilder.prism`) with zero protruding blocks
 *  - Contoured sloped hood with central crease & chrome spear + sloped trunk deck with shut-lines
 *  - Detailed 3D interior cabin (seats, headrests, dashboard, steering wheel & glowing taximeter)
 *    viewed through semi-transparent Fresnel-tinted automotive glass (`glassMesh`)
 *  - Quad round chrome-bezelled halogen headlamps, egg-crate radiator grille, wraparound chrome
 *    bumpers with rubber-faced overriders, fog lamps & tri-chamber tail/brake/turn/reverse clusters
 *  - Windshield wipers, single chrome wing mirrors on stalks, rain gutters, door handles,
 *    full-length checkerboard beltline, chrome roof rack under "TAXI" medallion sign, and
 *    24-segment treaded tires with radial chrome dog-dish hubcaps.
 *
 * All materials are deformed by `applyWorldCurve` so cab, glass, wheels, shadow, and projected
 * beams hug the world seamlessly.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  attribute,
  cameraPosition,
  clamp,
  dFdx,
  dFdy,
  dot,
  float,
  max,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  pow,
  smoothstep,
  step,
  uniform,
  uv,
  varying,
  vec3,
} from 'three/tsl';
import { WHEEL_OFFSETS, WHEEL_RADIUS, WHEEL_WIDTH } from '../config/constants.js';
import { applyWorldCurve } from '../rendering/tsl/curve.js';
import { sampleAtlas } from '../world/AtlasMaterial.js';
import { MeshBuilder } from '../world/MeshBuilder.js';

// Emitter codes stored in `aData.x`
const EMIT_NONE = 0.0;
const EMIT_HEADLIGHT = 1.0;
const EMIT_BRAKE = 2.0;
const EMIT_BLINK_L = 3.0;
const EMIT_BLINK_R = 4.0;
const EMIT_ROOF_SIGN = 5.0;
const EMIT_METER = 6.0;

// Surface material flags stored in `aData.y`
const MAT_STANDARD = 0.0;
const MAT_PAINT = 1.0;
const MAT_CHROME = 2.0;

const WHITE = [1, 1, 1];
const CHROME = [0.82, 0.85, 0.89];
const DARK_TRIM = [0.09, 0.1, 0.12];
const CABIN_DARK = [0.06, 0.065, 0.08];
const RUBBER = [0.08, 0.085, 0.1];
const WHEEL_WELL = [0.04, 0.045, 0.055];
const HEADLIGHT_OFF = [0.9, 0.92, 0.96];
const FOG_AMBER_OFF = [0.76, 0.56, 0.16];
const TAIL_RED_OFF = [0.46, 0.06, 0.06];
const AMBER_OFF = [0.58, 0.3, 0.05];
const REVERSE_LENS = [0.82, 0.84, 0.88];

/** Emits a Z-aligned cylinder (round headlamp bezel & lens) with verified outward CCW normals. */
function addCylinderZ(b, cx, cy, z0, z1, r, segs, sideOpt, frontCapOpt = null) {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    b.quad4([x0, y0, z1], [x0, y0, z0], [x1, y1, z0], [x1, y1, z1], sideOpt);
    if (frontCapOpt) {
      b.tri([cx, cy, z1], [x0, y0, z1], [x1, y1, z1], [0.5, 0.5], [0, 0], [1, 1], frontCapOpt);
    }
  }
}

export class TaxiModel {
  /** @type {THREE.Group} */
  root;
  /** @type {THREE.Group} */
  chassisPivot;
  /** @type {THREE.Mesh} */
  bodyMesh;
  /** @type {THREE.Mesh} */
  glassMesh;
  /** @type {THREE.Mesh} */
  roofSignMesh;
  /** @type {THREE.Mesh} */
  roadLightsMesh;
  /** @type {THREE.Mesh} */
  lensConesMesh;
  /** @type {THREE.Mesh} */
  contactShadowMesh;

  /**
   * Four wheel assemblies matching `WHEEL_OFFSETS` order: `[FL, FR, RL, RR]`.
   * @type {Array<{ steerPivot: THREE.Group, spinMesh: THREE.Mesh, isFront: boolean }>}
   */
  wheels = [];

  // Live TSL uniforms controlled by `TaxiView`
  bodyColorUniform;
  headlightUniform;
  brakeUniform;
  blinkLeftUniform;
  blinkRightUniform;
  roofGlowUniform;

  /** @type {Array<{ dispose: () => void }>} */
  #disposables = [];

  /**
   * @param {ReturnType<import('../textures/PixelCanvas.js').createFacadeAtlas>} atlas
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   * @param {string} [initialHex='#f2b728']
   */
  constructor(atlas, uniforms, initialHex = '#eba426') {
    const initCol = new THREE.Color(initialHex);
    this.bodyColorUniform = uniform(vec3(initCol.r, initCol.g, initCol.b));
    this.headlightUniform = uniform(0.0);
    this.brakeUniform = uniform(0.0);
    this.blinkLeftUniform = uniform(0.0);
    this.blinkRightUniform = uniform(0.0);
    this.roofGlowUniform = uniform(1.1);

    this.root = new THREE.Group();
    this.root.name = 'TaxiRoot';

    this.chassisPivot = new THREE.Group();
    this.chassisPivot.name = 'TaxiChassisPivot';
    this.chassisPivot.position.set(0, WHEEL_RADIUS, 0);
    this.root.add(this.chassisPivot);

    // 1. Unified opaque TSL taxi material (paint, chrome, rubber, emblems & emitters)
    const taxiMat = this.#track(this.#createTaxiMaterial(atlas, uniforms));

    // 2. Sculpted chassis body, curved wheel arches, 3D cabin interior, pillars, bumpers & lamps
    const bodyGeo = this.#track(this.#buildChassisGeometry(atlas));
    this.bodyMesh = new THREE.Mesh(bodyGeo, taxiMat);
    this.bodyMesh.name = 'TaxiBody';
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.chassisPivot.add(this.bodyMesh);

    // 3. Flush opaque dark-tinted automotive window glass (`transparent: false` hides interior 100%)
    const glassMat = this.#track(this.#createWindowGlassMaterial(uniforms));
    const glassGeo = this.#track(this.#buildWindowGlassGeometry());
    this.glassMesh = new THREE.Mesh(glassGeo, glassMat);
    this.glassMesh.name = 'TaxiGlass';
    this.glassMesh.castShadow = false;
    this.glassMesh.receiveShadow = true;
    this.chassisPivot.add(this.glassMesh);

    // 4. Toggleable illuminated roof "TAXI" medallion lightbox + chrome roof rack
    const signGeo = this.#track(this.#buildRoofSignGeometry(atlas));
    this.roofSignMesh = new THREE.Mesh(signGeo, taxiMat);
    this.roofSignMesh.name = 'TaxiRoofSign';
    this.roofSignMesh.castShadow = true;
    this.chassisPivot.add(this.roofSignMesh);

    // 5. Four 24-segment steerable / spinning wheels with radial hubcaps
    const wheelGeo = this.#track(this.#buildWheelGeometry(atlas));
    for (let i = 0; i < WHEEL_OFFSETS.length; i++) {
      const [wx, wz] = WHEEL_OFFSETS[i];
      const isFront = wz > 0;

      const steerPivot = new THREE.Group();
      steerPivot.position.set(wx, WHEEL_RADIUS, wz);

      const spinMesh = new THREE.Mesh(wheelGeo, taxiMat);
      spinMesh.castShadow = true;
      spinMesh.receiveShadow = true;
      steerPivot.add(spinMesh);

      this.root.add(steerPivot);
      this.wheels.push({ steerPivot, spinMesh, isFront });
    }

    // 6. Projected road headlight beams & rear wet-road brake glow
    const beamMat = this.#track(this.#createBeamMaterial(uniforms));
    const roadLightsGeo = this.#track(this.#buildRoadLightsGeometry());
    this.roadLightsMesh = new THREE.Mesh(roadLightsGeo, beamMat);
    this.roadLightsMesh.name = 'TaxiRoadLights';
    this.roadLightsMesh.renderOrder = 3;
    this.root.add(this.roadLightsMesh);

    const conesGeo = this.#track(this.#buildHeadlampConesGeometry());
    this.lensConesMesh = new THREE.Mesh(conesGeo, beamMat);
    this.lensConesMesh.name = 'TaxiLensCones';
    this.lensConesMesh.renderOrder = 3;
    this.chassisPivot.add(this.lensConesMesh);

    // 7. Soft underbody ambient-occlusion drop shadow
    const shadowMat = this.#track(this.#createShadowMaterial(uniforms));
    const shadowGeo = this.#track(this.#buildShadowGeometry());
    this.contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadowMesh.name = 'TaxiContactShadow';
    this.contactShadowMesh.renderOrder = 1;
    this.root.add(this.contactShadowMesh);
  }

  /**
   * Updates the painted body colour from an sRGB hex string (`#rrggbb`).
   * @param {string} hex
   */
  setBodyColor(hex) {
    const c = _tmpColor.set(hex);
    this.bodyColorUniform.value.set(c.r, c.g, c.b);
  }

  dispose() {
    for (let i = this.#disposables.length - 1; i >= 0; i--) {
      this.#disposables[i].dispose();
    }
    this.#disposables.length = 0;
  }

  #track(resource) {
    this.#disposables.push(resource);
    return resource;
  }

  // -------------------------------------------------------------------------
  // Shared Cabin Greenhouse Dimensions (used by both `bodyMesh` & `glassMesh`)
  // -------------------------------------------------------------------------

  static #CABIN = Object.freeze({
    hw0: 0.835, // half-width at beltline (`cabW0 = 1.67`)
    hw1: 0.705, // half-width at roofline (`cabW1 = 1.41`, sleek sedan tumblehome)
    y0: 0.44, // beltline Y
    y1: 0.925, // sleek classic sedan roofline Y
    zWf0: 0.86, // windshield cowl base Z
    zWf1: 0.43, // front roof header Z
    zBp0: -0.07, // B-pillar base Z
    zBp1: -0.1, // B-pillar top Z
    zWr0: -1.04, // rear backlight base Z
    zWr1: -0.68, // rear roof header Z
  });

  // -------------------------------------------------------------------------
  // Procedural Hero Taxi Chassis Geometry (`chassisPivot` at y = WHEEL_RADIUS = 0.34)
  // -------------------------------------------------------------------------

  #buildChassisGeometry(atlas) {
    const b = new MeshBuilder();
    const T = atlas.tiles;
    b.defaultTile = T.white;

    const paint = { tile: T.white, color: WHITE, data: [EMIT_NONE, MAT_PAINT] };
    const paintShade = { tile: T.white, color: [0.9, 0.86, 0.8], data: [EMIT_NONE, MAT_PAINT] };
    const trim = { tile: T.metal, color: DARK_TRIM, data: [EMIT_NONE, MAT_STANDARD] };
    const chrome = { tile: T.white, color: CHROME, data: [EMIT_NONE, MAT_CHROME] };
    const rubber = { tile: T.white, color: RUBBER, data: [EMIT_NONE, MAT_STANDARD] };

    const W = 1.8; // full fender width (`x ∈ [-0.90, +0.90]`)
    const hW = W * 0.5;
    const yBot = -0.11; // 0.23 m ground clearance above asphalt
    const yBelt = 0.44;
    const zFront = 2.04;
    const zRear = -2.02;

    // 1. Inner Structural Chassis Tub (`x ∈ [-0.66, +0.66]`, zero overlap with outer flanks!)
    const xInner = 0.66;
    b.box(0, yBot, 0.01, xInner * 2, yBelt - yBot - 0.004, zFront - zRear - 0.04, {
      ...paint,
      faces: { px: false, nx: false },
    });

    // 2. Sculpted Outer Flanks with True 8-Segment Circular Wheel Arches!
    //    Arch top (`-0.045 + 0.372 + 0.025 = 0.352`) stays cleanly below the `y = 0.362` checker moulding!
    const rArch = 0.372;
    const archCy = -0.045;
    const archSegs = 8;

    for (const sx of [-1, 1]) {
      const xMin = sx > 0 ? xInner : -hW;
      const xMax = sx > 0 ? hW : -xInner;
      const xLipMin = sx > 0 ? hW - 0.012 : -hW - 0.022;
      const xLipMax = sx > 0 ? hW + 0.022 : -hW + 0.012;

      const solidRuns = [
        [zRear, -1.25 - rArch],
        [-1.25 + rArch, 1.35 - rArch],
        [1.35 + rArch, zFront],
      ];
      for (const [z0, z1] of solidRuns) {
        b.box((xMin + xMax) * 0.5, yBot, (z0 + z1) * 0.5, xMax - xMin, yBelt - yBot, z1 - z0, paint);
      }

      // Sculpted rocker-panel chrome & rubber sill moulding under the doors
      const sillZ0 = -1.25 + rArch + 0.02;
      const sillZ1 = 1.35 - rArch - 0.02;
      b.box(sx * (hW + 0.01), yBot + 0.02, (sillZ0 + sillZ1) * 0.5, 0.024, 0.052, sillZ1 - sillZ0, trim);
      b.box(sx * (hW + 0.013), yBot + 0.074, (sillZ0 + sillZ1) * 0.5, 0.02, 0.022, sillZ1 - sillZ0, chrome);

      // Emit the 8-segment curved polygonal wheel arch & flared fender lip for rear (-1.25) & front (+1.35)
      for (const wz of [-1.25, 1.35]) {
        for (let k = 0; k < archSegs; k++) {
          const a0 = (k / archSegs) * Math.PI;
          const a1 = ((k + 1) / archSegs) * Math.PI;
          const za = wz + Math.cos(a0) * rArch;
          const zb = wz + Math.cos(a1) * rArch;
          const ya = Math.max(yBot, archCy + Math.sin(a0) * (rArch - 0.012));
          const yb = Math.max(yBot, archCy + Math.sin(a1) * (rArch - 0.012));

          // Spandrel wedge above circular arch up to beltline
          b.prism(
            [xMin, ya, za],
            [xMax, ya, za],
            [xMax, yb, zb],
            [xMin, yb, zb],
            [xMin, yBelt, za],
            [xMax, yBelt, za],
            [xMax, yBelt, zb],
            [xMin, yBelt, zb],
            paint,
          );

          // 3D Curved Fender Flare following the exact circle cleanly below `y = 0.352`
          const flareThick = 0.026;
          b.prism(
            // (its soffit 3 mm under the arch's, which it would otherwise share)
            [xLipMin, ya - 0.003, za],
            [xLipMax, ya - 0.003, za],
            [xLipMax, yb - 0.003, zb],
            [xLipMin, yb - 0.003, zb],
            [xLipMin, ya + flareThick, za],
            [xLipMax, ya + flareThick, za],
            [xLipMax, yb + flareThick, zb],
            [xLipMin, yb + flareThick, zb],
            paintShade,
          );

          // Curved dark inner mudguard drum sealing the wheel housing
          const yInA = archCy + Math.sin(a0) * (rArch - 0.022);
          const yInB = archCy + Math.sin(a1) * (rArch - 0.022);
          if (sx > 0) {
            b.quad4([xInner, yInA, za], [xMax, yInA, za], [xMax, yInB, zb], [xInner, yInB, zb], {
              tile: T.white,
              color: WHEEL_WELL,
            });
          } else {
            b.quad4([xMin, yInA, za], [xInner, yInA, za], [xInner, yInB, zb], [xMin, yInB, zb], {
              tile: T.white,
              color: WHEEL_WELL,
            });
          }
        }

        // Dark vertical inner wheel-well backing plate + rubber mudflap behind tire
        b.box(sx * (xInner + 0.012), -0.06, wz, 0.026, rArch + 0.02, rArch * 1.88, {
          tile: T.white,
          color: WHEEL_WELL,
        });
        b.box(sx * (hW - 0.11), yBot - 0.045, wz - rArch - 0.02, 0.2, 0.13, 0.024, rubber);
      }
    }

    // 3. Contoured Sloped Hood (+Z) with Slope-Aligned Power-Dome & Chrome Spear (zero Z-fighting!)
    const C = TaxiModel.#CABIN;
    const hoodYFront = yBelt + 0.026;
    const hoodYCowl = yBelt + 0.068;
    b.prism(
      [-hW + 0.025, yBelt, zFront],
      [hW - 0.025, yBelt, zFront],
      [hW - 0.015, yBelt, C.zWf0],
      [-hW + 0.015, yBelt, C.zWf0],
      [-hW + 0.065, hoodYFront, zFront - 0.03],
      [hW - 0.065, hoodYFront, zFront - 0.03],
      [C.hw0, hoodYCowl, C.zWf0],
      [-C.hw0, hoodYCowl, C.zWf0],
      paint,
    );
    // Raised central hood power-dome + slope-matched chrome spear riding cleanly above the dome!
    const domeZ0 = zFront - 0.08;
    const domeZ1 = C.zWf0 + 0.05;
    const domeY0 = hoodYFront + 0.022;
    const domeY1 = hoodYCowl + 0.018;
    b.prism(
      [-0.31, hoodYFront - 0.004, domeZ0],
      [0.31, hoodYFront - 0.004, domeZ0],
      [0.37, hoodYCowl - 0.004, domeZ1],
      [-0.37, hoodYCowl - 0.004, domeZ1],
      [-0.27, domeY0, domeZ0 - 0.01],
      [0.27, domeY0, domeZ0 - 0.01],
      [0.33, domeY1, domeZ1],
      [-0.33, domeY1, domeZ1],
      paint,
    );
    b.prism(
      [-0.014, domeY0 - 0.002, domeZ0 - 0.02],
      [0.014, domeY0 - 0.002, domeZ0 - 0.02],
      [0.014, domeY1 - 0.002, domeZ1 + 0.02],
      [-0.014, domeY1 - 0.002, domeZ1 + 0.02],
      [-0.01, domeY0 + 0.014, domeZ0 - 0.02],
      [0.01, domeY0 + 0.014, domeZ0 - 0.02],
      [0.01, domeY1 + 0.014, domeZ1 + 0.02],
      [-0.01, domeY1 + 0.014, domeZ1 + 0.02],
      chrome,
    );
    // Twin black windshield wipers parked cleanly along the cowl
    for (const wx of [-0.32, 0.22]) {
      b.box(wx, hoodYCowl + 0.006, C.zWf0 + 0.022, 0.38, 0.016, 0.022, trim);
    }

    // 4. Gently Sloped Rear Trunk Deck (-Z) with Chrome Lip Moulding (zero box-through-slope slicing!)
    const trunkYCowl = yBelt + 0.056;
    const trunkYRear = yBelt + 0.02;
    b.prism(
      [-C.hw0, yBelt, C.zWr0],
      [C.hw0, yBelt, C.zWr0],
      [hW - 0.025, yBelt, zRear],
      [-hW + 0.025, yBelt, zRear],
      [-C.hw0 + 0.02, trunkYCowl, C.zWr0],
      [C.hw0 - 0.02, trunkYCowl, C.zWr0],
      [hW - 0.065, trunkYRear, zRear + 0.025],
      [-hW + 0.065, trunkYRear, zRear + 0.025],
      paint,
    );
    // Crisp chrome trunk-lip handle bar along the rear trailing edge
    b.box(0, trunkYRear + 0.002, zRear + 0.028, 0.68, 0.018, 0.026, chrome);

    // 5. Raised 3D NYC Checkerboard Upper Beltline Moulding (`y ∈ [0.362, 0.432]` — 100% ABOVE wheel arches!)
    const chkZ0 = -1.84;
    const chkZ1 = 1.86;
    const chkLen = chkZ1 - chkZ0;
    const chkMidZ = (chkZ0 + chkZ1) * 0.5;
    const chkY = 0.362;
    const chkH = 0.07;
    b.box(hW + 0.007, chkY, chkMidZ, 0.014, chkH, chkLen, {
      tile: T.metal,
      color: DARK_TRIM,
      faces: {
        nx: false,
        px: { tile: T.checker, color: WHITE, rep: [10, 0.5] },
      },
    });
    b.box(-hW - 0.007, chkY, chkMidZ, 0.014, chkH, chkLen, {
      tile: T.metal,
      color: DARK_TRIM,
      faces: {
        px: false,
        nx: { tile: T.checker, color: WHITE, rep: [10, 0.5] },
      },
    });

    for (const sx of [-1, 1]) {
      // Crisp vertical door shut-lines terminating cleanly BELOW the checkerboard moulding (`y <= 0.354`)
      for (const dz of [0.8, -0.07, -0.82]) {
        b.box(sx * (hW + 0.004), 0.05, dz, 0.008, 0.304, 0.012, trim);
      }
      // Sculpted chrome pull door handles + dark recess cups
      for (const hz of [0.14, -0.58]) {
        b.box(sx * (hW + 0.006), 0.25, hz, 0.012, 0.036, 0.13, trim);
        b.box(sx * (hW + 0.018), 0.258, hz, 0.022, 0.022, 0.15, chrome);
      }
      // Side marker lamps on the fenders: amber at the front (blinking with the turn signal),
      // red at the back (with the tail lights), and the fuel filler flap on the left rear wing
      b.box(sx * (hW + 0.004), 0.17, 1.86, 0.012, 0.05, 0.12, {
        tile: T.white,
        color: AMBER_OFF,
        data: [sx > 0 ? EMIT_BLINK_L : EMIT_BLINK_R, MAT_STANDARD],
      });
      b.box(sx * (hW + 0.004), 0.17, -1.86, 0.012, 0.05, 0.12, {
        tile: T.white,
        color: TAIL_RED_OFF,
        data: [EMIT_BRAKE, MAT_STANDARD],
      });
      if (sx > 0) b.box(hW + 0.003, 0.24, -1.6, 0.008, 0.09, 0.09, paintShade);
      // Single vintage chrome wing mirror on angled stalk
      b.box(sx * (C.hw0 + 0.035), yBelt + 0.055, 0.64, 0.07, 0.02, 0.026, chrome);
      b.box(sx * (C.hw0 + 0.085), yBelt + 0.04, 0.62, 0.105, 0.08, 0.05, {
        ...chrome,
        faces: { nz: { tile: T.glass_panel, color: WHITE, rep: [1, 1] } },
      });
    }

    // 6. Sealed Monolithic Dark Greenhouse Core (`8 mm` inside flush glass & pillars — 0% hollow interior!)
    const coreInset = 0.01;
    b.prism(
      [-(C.hw0 - coreInset), C.y0, C.zWf0 - coreInset],
      [C.hw0 - coreInset, C.y0, C.zWf0 - coreInset],
      [C.hw0 - coreInset, C.y0, C.zWr0 + coreInset],
      [-(C.hw0 - coreInset), C.y0, C.zWr0 + coreInset],
      [-(C.hw1 - coreInset), C.y1 - 0.03, C.zWf1 - coreInset],
      [C.hw1 - coreInset, C.y1 - 0.03, C.zWf1 - coreInset],
      [C.hw1 - coreInset, C.y1 - 0.03, C.zWr1 + coreInset],
      [-(C.hw1 - coreInset), C.y1 - 0.03, C.zWr1 + coreInset],
      { tile: T.white, color: CABIN_DARK, faces: { ny: false } },
    );

    // 7. Flush Raked Cabin Roof, Chrome Window-Sill Moulding & A, B, C Pillars (`prism` — alles рівно!)
    const pW = 0.062;
    // Crowned painted roof panel + chrome rain-drip gutters along both roof edges
    b.prism(
      [-C.hw1 - 0.004, C.y1 - 0.032, C.zWf1 + 0.008],
      [C.hw1 + 0.004, C.y1 - 0.032, C.zWf1 + 0.008],
      [C.hw1 + 0.004, C.y1 - 0.032, C.zWr1 - 0.008],
      [-C.hw1 - 0.004, C.y1 - 0.032, C.zWr1 - 0.008],
      [-C.hw1 + 0.045, C.y1 + 0.028, C.zWf1 - 0.04],
      [C.hw1 - 0.045, C.y1 + 0.028, C.zWf1 - 0.04],
      [C.hw1 - 0.045, C.y1 + 0.028, C.zWr1 + 0.04],
      [-C.hw1 + 0.045, C.y1 + 0.028, C.zWr1 + 0.04],
      paint,
    );

    for (const sx of [-1, 1]) {
      // Chrome roof drip rail & continuous chrome beltline window-sill trim
      b.box(sx * (C.hw1 + 0.008), C.y1 - 0.035, (C.zWf1 + C.zWr1) * 0.5, 0.018, 0.02, C.zWf1 - C.zWr1 + 0.03, chrome);
      b.box(sx * (C.hw0 + 0.005), C.y0 + 0.002, (C.zWf0 + C.zWr0) * 0.5, 0.016, 0.018, C.zWf0 - C.zWr0, chrome);

      const x0Out = sx * (C.hw0 + 0.003);
      const x0In = sx * (C.hw0 - pW);
      const x1Out = sx * (C.hw1 + 0.003);
      const x1In = sx * (C.hw1 - pW);
      const bMin0 = Math.min(x0In, x0Out);
      const bMax0 = Math.max(x0In, x0Out);
      const tMin1 = Math.min(x1In, x1Out);
      const tMax1 = Math.max(x1In, x1Out);

      // Raked A-pillar (`zWf0 -> zWf1`)
      b.prism(
        [bMin0, C.y0, C.zWf0 + 0.006],
        [bMax0, C.y0, C.zWf0 + 0.006],
        [bMax0, C.y0, C.zWf0 - 0.068],
        [bMin0, C.y0, C.zWf0 - 0.068],
        [tMin1, C.y1 - 0.03, C.zWf1 + 0.006],
        [tMax1, C.y1 - 0.03, C.zWf1 + 0.006],
        [tMax1, C.y1 - 0.03, C.zWf1 - 0.064],
        [tMin1, C.y1 - 0.03, C.zWf1 - 0.064],
        paint,
      );

      // Tapered B-pillar (`zBp0 -> zBp1`) flush with side windows in satin black
      b.prism(
        [bMin0, C.y0, C.zBp0 + 0.038],
        [bMax0, C.y0, C.zBp0 + 0.038],
        [bMax0, C.y0, C.zBp0 - 0.038],
        [bMin0, C.y0, C.zBp0 - 0.038],
        [tMin1, C.y1 - 0.03, C.zBp1 + 0.034],
        [tMax1, C.y1 - 0.03, C.zBp1 + 0.034],
        [tMax1, C.y1 - 0.03, C.zBp1 - 0.034],
        [tMin1, C.y1 - 0.03, C.zBp1 - 0.034],
        trim,
      );

      // Raked C-pillar sail panel (`zWr0 -> zWr1`)
      b.prism(
        [bMin0, C.y0, C.zWr0 + 0.14],
        [bMax0, C.y0, C.zWr0 + 0.14],
        [bMax0, C.y0, C.zWr0 - 0.006],
        [bMin0, C.y0, C.zWr0 - 0.006],
        [tMin1, C.y1 - 0.03, C.zWr1 + 0.11],
        [tMax1, C.y1 - 0.03, C.zWr1 + 0.11],
        [tMax1, C.y1 - 0.03, C.zWr1 - 0.006],
        [tMin1, C.y1 - 0.03, C.zWr1 - 0.006],
        paint,
      );
    }

    // 8. Front Ensemble: Egg-Crate Chrome Grille, Quad Round Chrome-Bezelled Headlamps & Bumper (+Z)
    //    Recessed radiator grille (`T.taxi_grille`) + sculpted chrome surround
    b.box(0, 0.07, zFront + 0.005, 0.84, 0.25, 0.05, chrome);
    b.box(0, 0.09, zFront + 0.018, 0.78, 0.21, 0.04, {
      tile: T.metal,
      color: DARK_TRIM,
      faces: { pz: { tile: T.taxi_grille, color: WHITE, rep: [1, 1] } },
    });

    // Quad round vintage headlamps in chrome bezels + corner wraparound amber turn signals!
    for (const sx of [-1, 1]) {
      // Housing pod
      b.box(sx * 0.62, 0.11, zFront - 0.005, 0.36, 0.18, 0.05, trim);
      // Outer main beam (`r = 0.078`) + inner high beam (`r = 0.064`)
      addCylinderZ(b, sx * 0.69, 0.2, zFront + 0.01, zFront + 0.055, 0.078, 12, chrome, {
        tile: T.white,
        color: HEADLIGHT_OFF,
        data: [EMIT_HEADLIGHT, MAT_STANDARD],
      });
      addCylinderZ(b, sx * 0.52, 0.2, zFront + 0.01, zFront + 0.05, 0.064, 12, chrome, {
        tile: T.white,
        color: HEADLIGHT_OFF,
        data: [EMIT_HEADLIGHT, MAT_STANDARD],
      });

      // Corner wraparound amber blinker (`EMIT_BLINK_L` on `+X`, `EMIT_BLINK_R` on `-X`)
      const blinkCode = sx > 0 ? EMIT_BLINK_L : EMIT_BLINK_R;
      // 7 mm proud of the fender and clear of the headlamp pod: its faces shared both planes
      b.box(sx * 0.857, 0.11, zFront - 0.025, 0.1, 0.17, 0.09, {
        tile: T.white,
        color: AMBER_OFF,
        data: [blinkCode, MAT_STANDARD],
      });
    }

    // Wraparound heavy chrome front bumper + corner returns + overriders + amber fog lamps + front plate!
    b.box(0, -0.1, zFront + 0.08, W + 0.08, 0.14, 0.11, chrome);
    for (const sx of [-1, 1]) {
      b.box(sx * (hW + 0.015), -0.1, zFront - 0.03, 0.06, 0.14, 0.22, chrome);
      // Chrome & rubber bumperette overriders
      b.box(sx * 0.48, -0.13, zFront + 0.125, 0.095, 0.21, 0.065, chrome);
      b.box(sx * 0.48, -0.11, zFront + 0.155, 0.075, 0.17, 0.025, rubber);
      // Vintage amber fog lights mounted atop bumper!
      addCylinderZ(b, sx * 0.33, 0.055, zFront + 0.06, zFront + 0.11, 0.048, 10, chrome, {
        tile: T.white,
        color: FOG_AMBER_OFF,
        data: [EMIT_HEADLIGHT, MAT_STANDARD],
      });
    }
    b.box(0, -0.09, zFront + 0.142, 0.38, 0.127, 0.02, {
      tile: T.metal,
      color: DARK_TRIM,
      faces: { pz: { tile: T.plate, color: WHITE, rep: [1, 1] } },
    });

    // 9. Rear Ensemble: Tri-Chamber Chrome-Framed Tail Clusters, Plate Hood, Bumper & Twin Exhaust (-Z)
    //    Recessed dark rear panel + chrome trim bar
    b.box(0, 0.09, zRear - 0.005, W - 0.12, 0.2, 0.03, trim);
    b.box(0, 0.28, zRear - 0.015, W - 0.1, 0.025, 0.035, chrome);

    // Rear licence plate ("CAB-7") + chrome plate light brow
    b.box(0, 0.11, zRear - 0.025, 0.4, 0.15, 0.03, {
      tile: T.metal,
      color: DARK_TRIM,
      faces: { nz: { tile: T.plate, color: WHITE, rep: [1, 1] } },
    });
    b.box(0, 0.255, zRear - 0.035, 0.26, 0.025, 0.045, chrome);

    // Tri-chamber chrome-bezelled tail-light clusters:
    //   Outer: crimson stop/tail (`EMIT_BRAKE`)
    //   Middle: amber turn/hazard (`EMIT_BLINK_L / R`)
    //   Inner: crisp white reverse lens
    for (const sx of [-1, 1]) {
      const blinkCode = sx > 0 ? EMIT_BLINK_L : EMIT_BLINK_R;
      b.box(sx * 0.58, 0.1, zRear - 0.02, 0.58, 0.16, 0.035, chrome);
      b.box(sx * 0.65, 0.115, zRear - 0.032, 0.24, 0.13, 0.03, {
        tile: T.white,
        color: TAIL_RED_OFF,
        data: [EMIT_BRAKE, MAT_STANDARD],
      });
      b.box(sx * 0.822, 0.115, zRear - 0.032, 0.1, 0.13, 0.03, {
        tile: T.white,
        color: AMBER_OFF,
        data: [blinkCode, MAT_STANDARD],
      });
      b.box(sx * 0.45, 0.115, zRear - 0.032, 0.12, 0.13, 0.03, {
        tile: T.white,
        color: REVERSE_LENS,
        data: [EMIT_NONE, MAT_STANDARD],
      });
    }

    // Whip radio antenna on the right rear wing
    b.cylinderY(-hW + 0.12, yBelt, -1.55, 0.012, 0.012, 0.03, 6, chrome);
    b.cylinderY(-hW + 0.12, yBelt + 0.03, -1.55, 0.005, 0.003, 0.72, 4, chrome);

    // Wraparound heavy chrome rear bumper + overriders + twin chrome exhaust tips
    b.box(0, -0.1, zRear - 0.075, W + 0.08, 0.14, 0.11, chrome);
    for (const sx of [-1, 1]) {
      b.box(sx * (hW + 0.015), -0.1, zRear + 0.035, 0.06, 0.14, 0.22, chrome);
      b.box(sx * 0.48, -0.13, zRear - 0.12, 0.095, 0.21, 0.065, chrome);
      b.box(sx * 0.48, -0.11, zRear - 0.15, 0.075, 0.17, 0.025, rubber);
    }
    for (const ex of [-0.58, -0.45]) {
      addCylinderZ(b, ex, -0.155, zRear - 0.16, zRear + 0.05, 0.034, 8, chrome, rubber);
    }

    return b.build();
  }

  /**
   * Builds the 6 flush opaque automotive window panes (`windshield`, `rear backlight`, and
   * `4 side door windows`) interpolated along the exact raked A/B/C pillar planes (`все рівно`).
   */
  #buildWindowGlassGeometry() {
    const b = new MeshBuilder();
    const C = TaxiModel.#CABIN;
    const pW = 0.062;
    const spanY = C.y1 - 0.03 - C.y0;
    const lerp = (a, bVal, t) => a + (bVal - a) * t;

    // 1. Flush raked front windshield (`+Z/+Y` outward normal)
    const tBotF = 0.028 / spanY;
    const yBotF = C.y0 + 0.028;
    const yTopG = C.y1 - 0.031;
    const wBotF = lerp(C.hw0, C.hw1, tBotF) - pW + 0.002;
    const wTopF = C.hw1 - pW + 0.002;
    const zBotF = lerp(C.zWf0, C.zWf1, tBotF) + 0.002;
    const zTopF = C.zWf1 + 0.002;
    b.quad4(
      [-wBotF, yBotF, zBotF],
      [wBotF, yBotF, zBotF],
      [wTopF, yTopG, zTopF],
      [-wTopF, yTopG, zTopF],
    );

    // 2. Flush raked rear backlight (`-Z/+Y` outward normal)
    const tBotR = 0.018 / spanY;
    const yBotR = C.y0 + 0.018;
    const wBotR = lerp(C.hw0, C.hw1, tBotR) - pW + 0.002;
    const wTopR = C.hw1 - pW + 0.002;
    const zBotR = lerp(C.zWr0, C.zWr1, tBotR) - 0.002;
    const zTopR = C.zWr1 - 0.002;
    b.quad4(
      [wBotR, yBotR, zBotR],
      [-wBotR, yBotR, zBotR],
      [-wTopR, yTopG, zTopR],
      [wTopR, yTopG, zTopR],
    );

    // 3. Flush Left (`+X`) & Right (`-X`) front & rear door glass panes
    const tBotS = 0.02 / spanY;
    const yBotS = C.y0 + 0.02;
    const xBotS = lerp(C.hw0, C.hw1, tBotS) + 0.001;
    const xTopS = C.hw1 + 0.001;

    const zFrontDoorA0 = lerp(C.zWf0 - 0.068, C.zWf1 - 0.064, tBotS);
    const zFrontDoorA1 = C.zWf1 - 0.064;
    const zFrontDoorB0 = lerp(C.zBp0 + 0.038, C.zBp1 + 0.034, tBotS);
    const zFrontDoorB1 = C.zBp1 + 0.034;

    const zRearDoorB0 = lerp(C.zBp0 - 0.038, C.zBp1 - 0.034, tBotS);
    const zRearDoorB1 = C.zBp1 - 0.034;
    const zRearDoorC0 = lerp(C.zWr0 + 0.14, C.zWr1 + 0.11, tBotS);
    const zRearDoorC1 = C.zWr1 + 0.11;

    // Left side (`+X` outward normal)
    b.quad4(
      [xBotS, yBotS, zFrontDoorA0],
      [xBotS, yBotS, zFrontDoorB0],
      [xTopS, yTopG, zFrontDoorB1],
      [xTopS, yTopG, zFrontDoorA1],
    );
    b.quad4(
      [xBotS, yBotS, zRearDoorB0],
      [xBotS, yBotS, zRearDoorC0],
      [xTopS, yTopG, zRearDoorC1],
      [xTopS, yTopG, zRearDoorB1],
    );
    // Right side (`-X` outward normal)
    b.quad4(
      [-xBotS, yBotS, zFrontDoorB0],
      [-xBotS, yBotS, zFrontDoorA0],
      [-xTopS, yTopG, zFrontDoorA1],
      [-xTopS, yTopG, zFrontDoorB1],
    );
    b.quad4(
      [-xBotS, yBotS, zRearDoorC0],
      [-xBotS, yBotS, zRearDoorB0],
      [-xTopS, yTopG, zRearDoorB1],
      [-xTopS, yTopG, zRearDoorC1],
    );

    return b.build();
  }

  #buildRoofSignGeometry(atlas) {
    const b = new MeshBuilder();
    const T = atlas.tiles;
    b.defaultTile = T.white;
    const chrome = { tile: T.white, color: CHROME, data: [EMIT_NONE, MAT_CHROME] };
    const trim = { tile: T.metal, color: DARK_TRIM, data: [EMIT_NONE, MAT_STANDARD] };

    const yBase = TaxiModel.#CABIN.y1 + 0.025; // sits flush atop the crowned roof (`0.950`)
    // Sleek contoured satin-black & chrome mounting plinth (no protruding side bars)
    b.box(0, yBase - 0.006, 0.08, 0.62, 0.026, 0.26, trim);
    b.box(0, yBase + 0.016, 0.08, 0.58, 0.012, 0.23, chrome);

    const signFace = {
      tile: T.taxi_sign,
      color: WHITE,
      rep: [1, 1],
      data: [EMIT_ROOF_SIGN, MAT_STANDARD],
    };
    b.prism(
      [-0.27, yBase + 0.026, 0.185],
      [0.27, yBase + 0.026, 0.185],
      [0.27, yBase + 0.026, -0.025],
      [-0.27, yBase + 0.026, -0.025],
      [-0.235, yBase + 0.175, 0.16],
      [0.235, yBase + 0.175, 0.16],
      [0.235, yBase + 0.175, 0.0],
      [-0.235, yBase + 0.175, 0.0],
      {
        tile: T.bulb,
        color: [1.0, 0.9, 0.52],
        data: [EMIT_ROOF_SIGN, MAT_STANDARD],
        faces: {
          pz: signFace,
          nz: signFace,
        },
      },
    );
    return b.build();
  }

  #buildWheelGeometry(atlas) {
    const b = new MeshBuilder();
    const T = atlas.tiles;
    b.defaultTile = T.white;

    const r = WHEEL_RADIUS;
    const w = WHEEL_WIDTH;

    // 24-segment treaded rubber tire (`T.tire_tread`) + radial `T.wheel_cap` chrome dog-dish hubcap!
    b.cylinderX(
      0,
      0,
      0,
      r,
      w,
      24,
      { tile: T.tire_tread, color: WHITE, rep: [1, 1] },
      { tile: T.wheel_cap, color: WHITE },
    );

    // 3D raised domed chrome dog-dish centre cap + twin lug bar so wheel rotation reads crisply!
    b.cylinderX(
      0,
      0,
      0,
      r * 0.38,
      w + 0.034,
      12,
      { tile: T.white, color: CHROME, data: [EMIT_NONE, MAT_CHROME] },
      { tile: T.white, color: CHROME, data: [EMIT_NONE, MAT_CHROME] },
    );
    // Five dark wheel nuts round the cap (they show the wheel turning) and a body-coloured
    // ring of the steel rim between the cap and the tyre's white wall
    const nut = { tile: T.white, color: DARK_TRIM, data: [EMIT_NONE, MAT_STANDARD] };
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      b.box(0, Math.cos(a) * r * 0.22 - 0.014, Math.sin(a) * r * 0.22, w + 0.05, 0.028, 0.028, nut);
    }
    b.cylinderX(
      0,
      0,
      0,
      r * 0.56,
      w + 0.014,
      16,
      { tile: T.white, color: WHITE, data: [EMIT_NONE, MAT_PAINT] },
      { tile: T.white, color: WHITE, data: [EMIT_NONE, MAT_PAINT] },
    );

    return b.build();
  }

  #buildRoadLightsGeometry() {
    const b = new MeshBuilder();
    const y = 0.022;

    for (const sx of [-1, 1]) {
      const xNear = sx * 0.6;
      const xFar = sx * 1.18;
      b.quad4(
        [xNear - 0.42, y, 2.08],
        [xNear + 0.42, y, 2.08],
        [xFar + 1.55, y, 11.8],
        [xFar - 1.55, y, 11.8],
        { color: [1.0, 0.92, 0.68], data: [1.0, 0.0] },
      );
    }

    b.quad([-1.48, y - 0.003, -1.98], [2.96, 0, 0], [0, 0, -2.8], {
      color: [1.0, 0.1, 0.06],
      data: [2.0, 0.0],
    });

    return b.build();
  }

  #buildHeadlampConesGeometry() {
    const b = new MeshBuilder();
    for (const sx of [-1, 1]) {
      const cx = sx * 0.62;
      const cy = 0.2;
      b.quad4(
        [cx - 0.18, cy, 2.1],
        [cx + 0.18, cy, 2.1],
        [cx + 0.7, cy - 0.28, 4.35],
        [cx - 0.7, cy - 0.28, 4.35],
        { color: [0.55, 0.5, 0.36], data: [1.0, 1.0] },
      );
    }
    return b.build();
  }

  #buildShadowGeometry() {
    const b = new MeshBuilder();
    b.quad([-1.08, 0.012, 2.3], [2.16, 0, 0], [0, 0, -4.6], {
      color: [0, 0, 0],
    });
    return b.build();
  }

  // -------------------------------------------------------------------------
  // TSL Materials
  // -------------------------------------------------------------------------

  #createTaxiMaterial(atlas, uniforms) {
    const mat = new THREE.MeshStandardNodeMaterial({
      roughness: 0.42,
      metalness: 0.14,
    });

    applyWorldCurve(mat, uniforms);

    const aTile = attribute('aTile', 'vec4');
    const aData = attribute('aData', 'vec2');
    const aColor = attribute('color', 'vec3');

    const vTile = varying(aTile, 'vTaxiTile');
    const vData = varying(aData, 'vTaxiData');
    const vColor = varying(aColor, 'vTaxiColor');

    const uvNode = uv();
    const texAlbedo = sampleAtlas(atlas.map, uvNode, vTile);
    const texMask = sampleAtlas(atlas.maskMap, uvNode, vTile);

    const isPaint = smoothstep(0.5, 1.5, vData.y).mul(float(1.0).sub(smoothstep(1.5, 2.5, vData.y)));
    const isChrome = smoothstep(1.5, 2.5, vData.y);

    mat.colorNode = Fn(() => {
      const baseTint = mix(vec3(1.0), vColor, texMask.b);
      const paintTint = vColor.mul(this.bodyColorUniform);
      const finalTint = mix(baseTint, paintTint, isPaint);
      return texAlbedo.rgb.mul(finalTint);
    })();

    mat.roughnessNode = Fn(() => {
      const dndu = dFdx(normalWorld);
      const dndv = dFdy(normalWorld);
      const normalVar = dot(dndu, dndu).add(dot(dndv, dndv));
      const specAa = clamp(normalVar.mul(0.55), 0.0, 0.38);

      const stdRough = float(0.64);
      const paintRough = mix(float(0.24), float(0.14), uniforms.wetness);
      const chromeRough = float(0.16);
      const baseRough = mix(mix(stdRough, paintRough, isPaint), chromeRough, isChrome);
      return max(baseRough, specAa);
    })();

    mat.metalnessNode = Fn(() => {
      return mix(mix(float(0.08), float(0.14), isPaint), float(0.84), isChrome);
    })();

    mat.emissiveNode = Fn(() => {
      const code = vData.x;

      const mHead = bandMask(code, EMIT_HEADLIGHT);
      const mBrake = bandMask(code, EMIT_BRAKE);
      const mBlinkL = bandMask(code, EMIT_BLINK_L);
      const mBlinkR = bandMask(code, EMIT_BLINK_R);
      const mRoof = bandMask(code, EMIT_ROOF_SIGN);
      const mMeter = bandMask(code, EMIT_METER);

      const headCol = vec3(1.0, 0.95, 0.78).mul(this.headlightUniform).mul(3.8).mul(mHead);
      const brakeCol = vec3(1.0, 0.08, 0.05).mul(this.brakeUniform).mul(mBrake);
      const blinkCol = vec3(1.0, 0.55, 0.04)
        .mul(mBlinkL.mul(this.blinkLeftUniform).add(mBlinkR.mul(this.blinkRightUniform)))
        .mul(3.5);
      const roofCol = texAlbedo.rgb.mul(texMask.g).mul(this.roofGlowUniform).mul(mRoof);
      const meterCol = vec3(0.32, 0.95, 0.62).mul(0.85).mul(mMeter);

      // Subtle sky reflection sheen on chrome bumpers & bezels
      const chromeSheen = uniforms.ambientSky.mul(0.16).mul(isChrome);

      return headCol.add(brakeCol).add(blinkCol).add(roofCol).add(meterCol).add(chromeSheen);
    })();

    return mat;
  }

  /**
   * 100% Opaque (`transparent: false, depthWrite: true`) flush tinted automotive window glass
   * with satin-black weatherstrip gasket borders, deep sapphire-slate tint, smooth Fresnel sky
   * reflection, diagonal showroom glass sheen, and Geometric Specular AA (0% interior visible!).
   */
  #createWindowGlassMaterial(uniforms) {
    const mat = new THREE.MeshStandardNodeMaterial({
      transparent: false,
      depthWrite: true,
      roughness: 0.12,
      metalness: 0.18,
    });

    applyWorldCurve(mat, uniforms);

    const uvCoord = uv();
    const edgeDist = smoothstep(0.0, 0.045, uvCoord.x)
      .mul(smoothstep(0.0, 0.045, float(1.0).sub(uvCoord.x)))
      .mul(smoothstep(0.0, 0.055, uvCoord.y))
      .mul(smoothstep(0.0, 0.055, float(1.0).sub(uvCoord.y)));

    const evalFresnel = Fn(() => {
      const viewDir = normalize(cameraPosition.sub(positionWorld));
      const ndotv = clamp(dot(normalWorld, viewDir), 0.0, 1.0);
      return pow(float(1.0).sub(ndotv), 2.1);
    });

    const fresnel = evalFresnel();

    mat.colorNode = Fn(() => {
      const rubberGasket = vec3(0.055, 0.06, 0.072);
      // Deep dark automotive privacy tint with subtle top sun-band gradient
      const deepTint = mix(vec3(0.065, 0.095, 0.135), vec3(0.038, 0.058, 0.088), uvCoord.y);
      const skyRefl = uniforms.ambientSky.mul(0.38).add(vec3(0.15, 0.2, 0.27));
      // Soft diagonal studio reflection band across each flush pane
      const diagCoord = uvCoord.x.mul(0.82).add(uvCoord.y.mul(0.58));
      const diagBand = smoothstep(0.46, 0.62, diagCoord)
        .mul(float(1.0).sub(smoothstep(0.68, 0.86, diagCoord)))
        .mul(0.22);
      const glassRgb = mix(deepTint, skyRefl, clamp(fresnel.mul(0.72).add(diagBand), 0.0, 0.85));
      return mix(rubberGasket, glassRgb, edgeDist);
    })();

    mat.roughnessNode = Fn(() => {
      const dndu = dFdx(normalWorld);
      const dndv = dFdy(normalWorld);
      const specAa = clamp(dot(dndu, dndu).add(dot(dndv, dndv)).mul(0.55), 0.0, 0.4);
      const paneRough = mix(float(0.62), float(0.11), edgeDist);
      return max(paneRough, specAa);
    })();

    mat.emissiveNode = uniforms.ambientSky.mul(0.14).mul(fresnel.add(0.18)).mul(edgeDist);

    return mat;
  }

  #createBeamMaterial(uniforms) {
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    applyWorldCurve(mat, uniforms);

    const aColor = attribute('color', 'vec3');
    const aData = attribute('aData', 'vec2');
    const vColor = varying(aColor, 'vBeamColor');
    const vData = varying(aData, 'vBeamData');

    mat.colorNode = Fn(() => {
      const uvCoord = uv();
      const lat = float(1.0).sub(
        clamp(uvCoord.x.sub(0.5).mul(2.0).mul(uvCoord.x.sub(0.5).mul(2.0)), 0.0, 1.0),
      );
      const longi = smoothstep(0.0, 0.12, uvCoord.y).mul(
        float(1.0).sub(smoothstep(0.18, 1.0, uvCoord.y)),
      );
      const shape = lat.mul(lat).mul(longi);

      const isHead = step(vData.x, 1.5);
      const drive = mix(this.brakeUniform.mul(0.16), this.headlightUniform.mul(0.42), isHead);
      const wetBoost = float(1.0).add(uniforms.wetness.mul(0.65));

      return vColor.mul(shape).mul(drive).mul(wetBoost);
    })();

    return mat;
  }

  #createShadowMaterial(uniforms) {
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
    });

    applyWorldCurve(mat, uniforms);

    mat.colorNode = vec3(0.01, 0.01, 0.018);
    mat.opacityNode = Fn(() => {
      const p = uv().sub(0.5).mul(2.0);
      const d = p.x.mul(p.x).mul(p.x.mul(p.x)).add(p.y.mul(p.y).mul(p.y.mul(p.y)));
      return float(1.0).sub(clamp(d, 0.0, 1.0)).mul(0.7);
    })();

    return mat;
  }
}

const _tmpColor = new THREE.Color();

/** Returns 1.0 when `code ≈ target` (within ±0.4), else 0.0. */
function bandMask(code, target) {
  return smoothstep(target - 0.45, target - 0.15, code).mul(
    float(1.0).sub(smoothstep(target + 0.15, target + 0.45, code)),
  );
}
