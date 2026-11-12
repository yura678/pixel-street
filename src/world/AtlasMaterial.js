/**
 * Shared TSL NodeMaterials for diorama street architecture, props, and warm light pools.
 *
 * Mask channels (from `createFacadeAtlas`):
 *   R = window / display glass
 *   G = bulbs / sconces / neon / "OPEN" plaques
 *   B = vertex-colour palette tint mask (1 = multiply by vertex `color`, 0 = untinted)
 *
 * Vertex `aData` (`vec2`):
 *   For `StreetAtlasMaterial`:
 *     x in [0, 1)  -> per-bay seed for upper-floor windows (`uniforms.windowLights`)
 *     x >= 1.5     -> cozy ground-floor boutique display / sconce (warmly lit day & night!)
 *     x in [4, 5)  -> lit and scrolling up over time (the stripes of a barber's pole)
 *     x in [5, 6)  -> marquee chase bulb, `fract(x)` = its phase: every third bulb lit, running
 *     x in [6, 7)  -> shop glass lit in its vertex colour (the cold fluorescent light of a
 *                     laundromat) instead of the warm interior glow
 *     x in [7, 8)  -> the limbs of a near street tree: dithered away with its leaves by the
 *                     canopy material (unlit bark: no glass or neon in its mask)
 *     y in [0, 1]  -> wind sway weight (foliage, hedges, awning valances)
 *   For `LightPoolMaterial`:
 *     x >= 0       -> street-lamp pool scaled by `uniforms.streetLights` (`x` = wet boost)
 *     x < 0        -> cozy boutique window / sconce wash (warm ambient glow even by day!)
 *     y = 1        -> (with x < 0) a shop window's or door lamp's spill: brightest at the facade
 *                     (u = 1), and only once the windows are lit (`uniforms.windowLights`)
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  cos,
  dFdx,
  dFdy,
  dot,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  modelWorldMatrix,
  normalWorld,
  positionLocal,
  positionView,
  screenCoordinate,
  sin,
  smoothstep,
  step,
  texture,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { ATLAS_SIZE } from '../textures/PixelCanvas.js';
import { applyWorldCurve, createCurvedPositionNode } from '../rendering/tsl/curve.js';
import { bayer4x4 } from '../rendering/tsl/dither.js';

const hash21 = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));

const valueNoise2D = Fn(([p]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  const a = hash21(i);
  const b = hash21(i.add(vec2(1.0, 0.0)));
  const c = hash21(i.add(vec2(0.0, 1.0)));
  const d = hash21(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/**
 * Samples a packed mipmapped + anisotropic atlas texture with:
 *   1. Continuous pre-`fract` screen-space derivatives (`dFdx`/`dFdy` + `textureSampleGrad`)
 *      so repeating UV wraps NEVER trigger mipmap seam spikes, and
 *   2. Automatic mip-footprint edge clamping (`pad`) so trilinear/anisotropic filtering NEVER
 *      bleeds across neighbouring `128 px` cells at oblique angles or far distances.
 */
export function sampleAtlas(tex, uvCoord, tile) {
  const contUv = vec2(uvCoord.x.mul(tile.z), float(0.0).sub(uvCoord.y.mul(tile.w)));
  const gradX = dFdx(contUv).mul(1.15);
  const gradY = dFdy(contUv).mul(1.15);

  const footprint = max(
    abs(gradX.x).add(abs(gradY.x)),
    max(abs(gradX.y).add(abs(gradY.y)), float(1.0 / ATLAS_SIZE)),
  );
  const maxInset = min(tile.z, tile.w).mul(0.22);
  const pad = clamp(footprint.mul(0.78), float(0.5 / ATLAS_SIZE), maxInset);

  const localU = fract(uvCoord.x);
  const localV = float(1.0).sub(fract(uvCoord.y));
  const du = clamp(localU.mul(tile.z), pad, tile.z.sub(pad));
  const dv = clamp(localV.mul(tile.w), pad, tile.w.sub(pad));
  const atlasUv = vec2(tile.x.add(du), tile.y.add(dv));

  return texture(tex, atlasUv).grad(gradX, gradY);
}

/**
 * Screen-door transparency for the near sidewalk's crowns (`STREETSCAPE_PLAN.md`, Stage E): the
 * leaves (sway weight `aData.y` > 0.3) and the limbs among them (`aData.x` in [7, 8),
 * `StreetTrees.CANOPY_WOOD`) between the camera and the street keep only a share of their
 * pixels, picked by the ordered 4 × 4 Bayer pattern – pixel-art dithering instead of blending.
 * `uniforms.nearCanopy` is the share kept; round the taxi on screen it drops to `FOCUS_KEEP` of
 * that, so the taxi and the water round it are never hidden. A crown the camera is not behind
 * stays whole, and so do trunks, lamps and bollards. Shadows are cast whole: the shadow pass
 * runs this mask too (with the sun's orthographic camera), so the mask keeps every fragment
 * there.
 *
 * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
 * @param {ReturnType<typeof varying>} vData `aData` (y: sway weight)
 * @param {ReturnType<typeof varying>} vWorldPos world position before the curve
 */
function canopyMask(uniforms, vData, vWorldPos) {
  const FOCUS_KEEP = 0.5;
  return Fn(() => {
    // Where the fragment and the taxi lie on screen, in half screen heights
    const p11 = cameraProjectionMatrix.element(1).y;
    const taxiView = cameraViewMatrix.mul(vec4(uniforms.taxiPosition.add(vec3(0, 0.8, 0)), 1.0));
    const onScreen = (v) => v.xy.div(max(v.z.negate(), float(0.1))).mul(p11);
    const toTaxi = onScreen(positionView).sub(onScreen(taxiView)).length();
    // `nearCanopy` = 1 turns the dithering off, the focus included
    const focus = max(smoothstep(0.3, 0.85, toTaxi), step(0.999, uniforms.nearCanopy));
    const keep = uniforms.nearCanopy.mul(mix(float(FOCUS_KEEP), float(1.0), focus));
    // Only the crown – leaves and its wood – and only with the camera beyond it (looking at
    // the street through it)
    const leaf = step(0.3, vData.y);
    const wood = step(6.999, vData.x).mul(step(vData.x, 7.999));
    const crown = max(leaf, wood);
    const behind = smoothstep(-0.5, 0.5, vWorldPos.x.sub(cameraPosition.x));
    // The sun's shadow camera is orthographic (projection [3][3] = 1), the street's is not:
    // the shadow pass keeps every fragment, so the crowns cast whole shadows
    const viewCamera = float(1.0).sub(cameraProjectionMatrix.element(3).w);
    const share = mix(float(1.0), keep, crown.mul(behind).mul(viewCamera));
    return bayer4x4(screenCoordinate).lessThan(share);
  })();
}

/**
 * Creates the curved, wind-swayed, warmly-illuminated TSL material for street chunks.
 *
 * @param {ReturnType<import('../textures/PixelCanvas.js').createFacadeAtlas>} atlas
 * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
 * @param {{ canopy?: boolean }} [opts] `canopy`: the near sidewalk's material, its crowns
 *   dithered away between the camera and the street ({@link canopyMask})
 * @returns {THREE.MeshStandardNodeMaterial}
 */
export function createStreetAtlasMaterial(atlas, uniforms, opts = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.84,
    metalness: 0.05,
  });

  const aTile = attribute('aTile', 'vec4');
  const aData = attribute('aData', 'vec2');
  const aColor = attribute('color', 'vec3');

  const vTile = varying(aTile, 'vAtlasTile');
  const vData = varying(aData, 'vAtlasData');
  const vColor = varying(aColor, 'vAtlasColor');
  const vWorldPos = varying(
    modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz,
    'vAtlasWorldPos',
  );

  // Gentle wind sway for trees, potted plants, hedges & awning valances
  const swayedLocal = Fn(() => {
    const swayWeight = aData.y;
    const worldPos = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz;
    const phase = uniforms.time
      .mul(2.1)
      .add(worldPos.z.mul(0.35))
      .add(worldPos.x.mul(0.5));
    const gust = sin(phase).mul(0.65).add(sin(uniforms.time.mul(4.6).add(worldPos.z)).mul(0.25));
    const amp = swayWeight.mul(uniforms.windStrength).mul(0.065).mul(gust);

    const dx = cos(uniforms.windDirection).mul(amp);
    const dz = sin(uniforms.windDirection).mul(amp);
    const dy = amp.mul(amp).mul(-1.2);
    return positionLocal.add(vec3(dx, dy, dz));
  })();

  mat.positionNode = createCurvedPositionNode(uniforms, swayedLocal);
  if (opts.canopy) mat.maskNode = canopyMask(uniforms, vData, vWorldPos);

  // Barber-pole stripes (`aData.x` in [4, 5)) climb the tube: the tile scrolls along V
  const isScroll = step(3.5, vData.x).mul(step(vData.x, 4.5));
  const uvNode = uv().sub(vec2(0.0, uniforms.time.mul(0.45).mul(isScroll)));
  const texAlbedo = sampleAtlas(atlas.map, uvNode, vTile);
  const texMask = sampleAtlas(atlas.maskMap, uvNode, vTile);

  // Lamp bulbs (the `bulb` tile: lanterns, door and street lamps, marquee bulbs) burn only
  // with the street lights – unlit, a pale grey glass, in daylight and at golden hour; neon and
  // signs keep their daytime glow
  const bulbTile = atlas.tiles.bulb;
  const isBulb = step(
    abs(vTile.x.sub(bulbTile[0])).add(abs(vTile.y.sub(bulbTile[1]))),
    float(1e-4),
  );
  const bulbOn = smoothstep(0.02, 0.2, uniforms.streetLights);

  mat.colorNode = Fn(() => {
    const tint = mix(vec3(1.0), vColor, texMask.b);
    const unlitGlass = vec3(dot(texAlbedo.rgb, vec3(0.3, 0.5, 0.2)).mul(0.55));
    const base = mix(texAlbedo.rgb, unlitGlass, isBulb.mul(float(1.0).sub(bulbOn))).mul(tint);

    // Mask out glass (`R`) & emissive bulbs/neon (`G`) so world-space masonry patina only hits dry surfaces
    const dryKeep = clamp(texMask.r.add(texMask.g), 0.0, 1.0);

    // Band-limited dual-scale world-space mineral patina (fades out fine octave at far pixel footprints!)
    const worldFootprint = abs(dFdx(vWorldPos.z)).add(abs(dFdy(vWorldPos.z)));
    const microFade = float(1.0).sub(smoothstep(0.05, 0.22, worldFootprint));

    const coordMacro = vec2(vWorldPos.z.add(vWorldPos.x.mul(0.73)).mul(0.52), vWorldPos.y.mul(0.62));
    const coordMicro = vec2(vWorldPos.z.sub(vWorldPos.x.mul(0.41)).mul(1.85), vWorldPos.y.mul(2.05));
    const macroVar = valueNoise2D(coordMacro).sub(0.5).mul(0.1);
    const microVar = valueNoise2D(coordMicro).sub(0.5).mul(0.046).mul(microFade);
    const surfaceGrain = mix(float(1.0).add(macroVar).add(microVar), float(1.0), dryKeep);

    // Subtle ground-contact AO near sidewalk level (`y ≈ 0.15`) so walls, stoops & props feel anchored
    const plinthAo = mix(
      float(0.82).add(smoothstep(0.15, 0.85, vWorldPos.y).mul(0.18)),
      float(1.0),
      dryKeep,
    );
    const wetDarken = mix(float(1.0).sub(uniforms.wetness.mul(0.22)), float(1.0), dryKeep);
    return base.mul(surfaceGrain).mul(plinthAo).mul(wetDarken);
  })();

  mat.roughnessNode = Fn(() => {
    // Geometric Specular Anti-Aliasing: suppress 1-px GGX sun glints on sharp bevels & distant mullions
    const dndu = dFdx(normalWorld);
    const dndv = dFdy(normalWorld);
    const normalVar = dot(dndu, dndu).add(dot(dndv, dndv));
    const uvFootprint = abs(dFdx(uvNode.x)).add(abs(dFdy(uvNode.y)));
    const specAaFloor = clamp(normalVar.mul(0.55).add(uvFootprint.mul(0.32)), 0.0, 0.44);

    const glassRough = max(float(0.16), specAaFloor.add(0.12));
    const grainR = valueNoise2D(vec2(vWorldPos.z.mul(1.4), vWorldPos.y.mul(1.4))).sub(0.5).mul(0.06);
    // Cloth behind the glass (curtains/blinds) stays matte instead of picking up glass specular.
    const fabricR = smoothstep(0.62, 0.9, min(texMask.r, texMask.b));
    const baseRough = mix(
      clamp(float(0.85).add(grainR), 0.65, 0.96),
      glassRough,
      texMask.r.mul(float(1.0).sub(fabricR.mul(0.7))),
    );
    // Matte stone, brick and paint have no glint at grazing angles: the sun's highlight on the
    // edge of a bollard, a rail or a cornice seen side-on is a 1-px line that shimmers. Glass
    // keeps it (and the wet sheen below stays)
    const viewDir = cameraPosition.sub(vWorldPos).normalize();
    const grazing = float(1.0).sub(smoothstep(0.05, 0.5, abs(dot(normalWorld, viewDir))));
    const matteRough = mix(baseRough, float(1.0), grazing.mul(float(1.0).sub(texMask.r)));
    const wetRough = mix(matteRough, baseRough.mul(0.56), uniforms.wetness.mul(float(1.0).sub(texMask.r)));
    return max(wetRough, specAaFloor);
  })();

  mat.emissiveNode = Fn(() => {
    const isCozyShop = step(1.5, vData.x);

    // 1. Upper-floor residential windows (randomly lit by `uniforms.windowLights`)
    const cell = floor(uvNode);
    const h1 = fract(
      sin(cell.x.mul(127.1).add(cell.y.mul(311.7)).add(vData.x.mul(91.3))).mul(43758.5453),
    );
    const h2 = fract(
      sin(cell.x.mul(53.7).add(cell.y.mul(191.3)).add(vData.x.mul(17.9))).mul(43758.5453),
    );
    const winSwitch = mix(
      step(float(1.0).sub(uniforms.windowLights.mul(0.9)), h1),
      float(1.0),
      isCozyShop,
    );
    const glowTint = mix(vec3(1.0, 0.38, 0.1), vec3(1.0, 0.64, 0.28), h2);
    const winDrive = mix(
      float(0.34).add(uniforms.windowLights.mul(0.78)),
      float(0.42).add(uniforms.streetLights.mul(0.82)),
      isCozyShop,
    );
    // Keep the painted sash structure, glazing bars & sky glints visible through the glow
    // instead of blowing every pane out into a flat cream rectangle.
    const glassDetail = clamp(texAlbedo.rgb.mul(3.6).add(vec3(0.5, 0.38, 0.24)), 0.0, 1.3);
    // Curtains / blinds / sheers (`R` glass + `B` tint both set) are back-lit cloth: they glow
    // in their own vertex-tinted colour instead of the generic orange room glow. The threshold
    // keeps mip-blended frame edges (R≈B≈0.5) out of it.
    const fabric = smoothstep(0.62, 0.9, min(texMask.r, texMask.b));
    const fabricGlow = texAlbedo.rgb
      .mul(vColor)
      .mul(vec3(1.0, 0.86, 0.68))
      .mul(1.55)
      .add(glowTint.mul(0.06));
    const residentialGlow = mix(glowTint.mul(glassDetail), fabricGlow, fabric);
    // Shop glass lit in its own vertex colour (`aData.x` in [6, 7)): cold fluorescent light
    const isCold = step(5.999, vData.x).mul(step(vData.x, 6.999));
    const shopTint = mix(glowTint, vColor.mul(1.2), isCold);
    const shopGlow = texAlbedo.rgb.mul(shopTint).add(shopTint.mul(0.14)).mul(float(1.3));
    const glassGlow = mix(residentialGlow, shopGlow, isCozyShop);
    const floorFalloff = float(1.0).sub(smoothstep(3.2, 13.0, vWorldPos.y).mul(0.3));
    const windowGlow = glassGlow
      .mul(texMask.r)
      .mul(winSwitch)
      .mul(winDrive)
      .mul(floorFalloff);

    // 2. Bulbs, wall sconces, boutique backdrops, "OPEN" plaques & neon badges (`G` mask)
    const baseSconce = mix(float(0.28), float(0.95), isCozyShop);
    const neonDrive = baseSconce.add(uniforms.streetLights.mul(1.75));
    const neonGlow = texAlbedo.rgb
      .mul(texMask.g)
      .mul(neonDrive)
      .mul(mix(float(1.0), bulbOn, isBulb));

    // 3. Warm cabinet downlight on 3D books & wooden shelves inside boutique display cases (`aData.x >= 2.5`)
    const isCabinetLit = step(2.5, vData.x).mul(step(vData.x, 3.5));
    const cabinetGlow = texAlbedo.rgb
      .mul(vColor)
      .mul(vec3(1.0, 0.76, 0.42))
      .mul(float(0.46).add(uniforms.streetLights.mul(0.28)))
      .mul(isCabinetLit)
      .mul(mix(float(1.0), bulbOn, isBulb));

    // 4. Faint cool sky-fill + warm sun transmission on foliage so canopies stay lush
    //    and backlit in the low golden sun.
    const foliageFill = texAlbedo.rgb
      .mul(vColor)
      .mul(
        uniforms.ambientSky.mul(0.12).add(uniforms.skyHorizon.mul(0.085)).add(vec3(0.02, 0.022, 0.014)),
      )
      .mul(smoothstep(0.4, 0.8, vData.y));

    // 5. Marquee chase (`aData.x` in [5, 6)): a lit wave runs round the bulbs, two in three dim
    const isChase = step(4.5, vData.x).mul(step(vData.x, 5.999));
    const chaseOn = step(fract(uniforms.time.mul(1.8).add(fract(vData.x))), 0.34);
    const chase = mix(float(1.0), float(0.16).add(chaseOn.mul(0.84)), isChase);

    return windowGlow.add(neonGlow).add(cabinetGlow).add(foliageFill).mul(chase);
  })();

  return mat;
}

/**
 * Curved additive material for warm storefront light spills, wall-sconce cones & street-lamp pools.
 * `fog: false` ensures exponential fog never turns additive quads into bright sky rectangles.
 *
 * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
 * @returns {THREE.MeshBasicNodeMaterial}
 */
export function createLightPoolMaterial(uniforms) {
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
  const vColor = varying(aColor, 'vPoolColor');
  const vData = varying(aData, 'vPoolData');

  mat.colorNode = Fn(() => {
    // `vData.y` 1: light spilling out of a shop window or a doorway onto the sidewalk – brightest
    // at the facade (the quad's u = 1 edge), fading out towards the curb, instead of an oval
    // centred a metre out in the middle of the sidewalk
    const centred = uv().sub(0.5).mul(2.0);
    const spill = step(0.5, vData.y);
    const p = vec2(mix(centred.x, float(1.0).sub(uv().x), spill), centred.y);
    const r2 = clamp(p.x.mul(p.x).add(p.y.mul(p.y)), 0.0, 1.0);
    const falloff = float(1.0).sub(r2);
    const shape = falloff.mul(falloff);

    // `vData.x < 0` -> cozy shop/sconce pool (gently lit by day, stronger at dusk/night)
    const isCozy = step(vData.x, -0.1);
    const streetDrive = uniforms.streetLights.mul(float(1.0).add(uniforms.wetness.mul(max0(vData.x))));
    const cozyDrive = float(0.32).add(uniforms.streetLights.mul(0.75)).add(uniforms.wetness.mul(0.22));
    // Spill from a shop window or a door lamp: only once the windows are lit (the shop glass
    // switches on with `windowLights` like the flats', past ~0.16), never out of dark glass
    const lit = smoothstep(0.1, 0.3, uniforms.windowLights);
    const drive = mix(streetDrive, cozyDrive.mul(mix(float(1.0), lit, spill)), isCozy);

    return vColor.mul(shape).mul(drive);
  })();

  return mat;
}

function max0(v) {
  return clamp(v, 0.0, 4.0);
}
