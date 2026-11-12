/**
 * TSL World Curvature node.
 * Deforms geometry along Z to create the spherical "miniature planet" aesthetic.
 *
 * Implemented via `material.positionNode` (local vec3) by transforming local -> world -> curved -> local:
 *  - Fully compatible with `InstancedMesh`.
 *  - Automatically curved in directional light shadow passes.
 *  - Keeps world lighting, fog, and reflection normals physically consistent.
 */
import {
  Fn,
  abs,
  float,
  max,
  vec4,
  sin,
  time,
  positionLocal,
  modelWorldMatrix,
  modelWorldMatrixInverse,
} from 'three/tsl';

/**
 * Creates the curved position node for a material.
 *
 * Anchored to `uniforms.taxiPosition.z` (NOT `cameraPosition.z`!) with a 20 m rigid diorama
 * dead-zone around the vehicle so:
 *  1. DirectionalLight shadow pass and main camera pass deform geometry identically (zero shadow offset).
 *  2. Interactive camera rotation never warps or shifts the street/sidewalk.
 *  3. Foreground pavement stays rock-solid without swimming as the taxi advances.
 *
 * @param {import('../uniforms/WorldUniforms.js').WorldUniforms} uniforms
 * @param {import('three/tsl').Node} [localPosition=positionLocal] optional pre-deformed local
 *   position (e.g. wind sway) that is curved instead of the raw `positionLocal`.
 */
export const createCurvedPositionNode = (uniforms, localPosition = positionLocal) =>
  Fn(() => {
    // 1. Transform local vertex (including morphs/instancing) to world space
    const worldPos = modelWorldMatrix.mul(vec4(localPosition, 1.0)).xyz.toVar();

    // 2. Pass-invariant longitudinal distance beyond the 20 m rigid foreground diorama zone
    const rawDz = abs(worldPos.z.sub(uniforms.taxiPosition.z));
    const effDz = max(float(0.0), rawDz.sub(20.0));
    const d2 = effDz.mul(effDz);

    // 3. Drop distant horizon down ("miniature planet" curve)
    worldPos.y.subAssign(d2.mul(uniforms.curveDown));

    // 4. Lateral serpentine bend in the distance
    const bendPhase = time.mul(uniforms.bendSpeed).add(worldPos.z.mul(uniforms.bendFreq));
    worldPos.x.addAssign(d2.mul(uniforms.bendSide).mul(sin(bendPhase)));

    // 5. Transform back to local space so NodeMaterial pipeline, normals, and shadows stay intact
    return modelWorldMatrixInverse.mul(vec4(worldPos, 1.0)).xyz;
  })();

/**
 * Applies the world curvature deformer to a NodeMaterial.
 * @template {import('three').Material} T
 * @param {T} material
 * @param {import('../uniforms/WorldUniforms.js').WorldUniforms} uniforms
 * @returns {T}
 */
export function applyWorldCurve(material, uniforms) {
  material.positionNode = createCurvedPositionNode(uniforms);
  return material;
}
