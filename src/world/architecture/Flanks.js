/**
 * Flank facades: the side walls of a house that face an open lot (the alley, a square) and are
 * built with the same facade parts as the street front. `flankFrame` turns a flank into the
 * parts' own frame, so a window, a fire escape or a door is built there exactly as on the
 * front.
 */
import * as THREE from 'three/webgpu';
import { withFrame } from './primitives.js';

/**
 * Frame of a flank in the lot frame: local −X is the flank's outward normal with local x = 0 on
 * its face, Y stays up and local Z runs along the flank to the viewer's right – from the street
 * corner back on the right flank (`side` 1, local z = metres back), from the back corner to the
 * street on the left one (`side` −1, local z = depth − metres back).
 *
 * @param {{ facadeX: number, depth: number, zA: number, zB: number }} plan
 * @param {-1 | 1} side
 */
export function flankFrame(plan, side) {
  const m = new THREE.Matrix4().makeRotationY(side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
  if (side > 0) m.setPosition(plan.facadeX, 0, plan.zB);
  else m.setPosition(plan.facadeX + plan.depth, 0, plan.zA);
  return m;
}

/** Runs `fn` with the flank frame on both the solid and the light-pool builder. */
export function inFlank(b, pools, frame, fn) {
  withFrame(b, frame, () => withFrame(pools, frame, fn));
}
