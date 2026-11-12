/**
 * Means of egress: the black-iron fire escape with drop ladder and gooseneck.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { WHITE } from './palette.js';
import { tube } from './primitives.js';

/**
 * Exterior black-iron fire escape: open-grate landings at each upper floor spanning the
 * served windows (`halfWidth` either side of `centerZ`), baluster railings, wall brackets
 * with diagonal struts, and parallel stair flights that rise toward +Z from the left end
 * of one landing to the right end of the next. The lowest landing carries a stowed
 * counterweighted drop ladder instead of a stair to the ground; with `_roofY` (parapet
 * top) and `deckY` (roof deck) a gooseneck ladder leads from the top landing onto the roof.
 *
 * `opts.topLadder`: the top landing stands on the cornice (before mansard dormers), so a
 * straight ladder at the outer edge climbs to it instead of a stair flight through the cornice;
 * `opts.stayX` is where the gooseneck's stay meets the wall (a mansard slope stands back);
 * `opts.drop: 'left'` hangs the drop ladder at the left end of the lowest landing.
 */
export function buildFireEscape(
  atlas,
  b,
  facadeX,
  centerZ,
  floorYLevels,
  _roofY,
  halfWidth = 1.12,
  deckY = null,
  opts = {},
) {
  const T = atlas.tiles;
  const iron = { tile: T.balcony_iron, color: WHITE };
  const grate = { tile: T.grate, color: [0.16, 0.17, 0.19] };
  const hw = halfWidth;
  const depth = 0.9;
  const outerX = facadeX - depth;
  const railH = 0.92;
  const bar = 0.028;
  const railBar = (x, y, z, sx, sy, sz) => b.box(x, y, z, sx, sy, sz, iron);
  const flightLen = Math.min(1.9, hw * 2 - 0.5);

  for (let i = 0; i < floorYLevels.length; i++) {
    const y = floorYLevels[i];

    // Open-grate landing with a channel edge
    b.box(facadeX - depth * 0.5, y, centerZ, depth, 0.045, hw * 2, grate);
    railBar(outerX + 0.02, y - 0.04, centerZ, 0.05, 0.09, hw * 2 + 0.02);

    // Front railing: top rail, mid rail, kick rail and balusters
    railBar(outerX, y + railH, centerZ, 0.05, 0.05, hw * 2 + 0.04);
    railBar(outerX, y + railH * 0.5, centerZ, 0.03, 0.03, hw * 2);
    railBar(outerX, y + 0.1, centerZ, 0.035, 0.035, hw * 2);
    for (let z = -hw + 0.1; z <= hw - 0.08; z += 0.13) {
      railBar(outerX, y + 0.105, centerZ + z, bar, railH - 0.06, bar);
    }
    // End railings back to the wall
    for (const zEnd of [-1, 1]) {
      const railZ = centerZ + zEnd * hw;
      // A few millimetres off the front rails they butt into: no shared soffits
      railBar(facadeX - depth * 0.5, y + railH + 0.004, railZ, depth, 0.04, 0.045);
      railBar(facadeX - depth * 0.5, y + 0.103, railZ, depth, 0.03, 0.035);
      for (let x = -depth + 0.12; x <= -0.06; x += 0.13) {
        railBar(facadeX + x, y + 0.105, railZ, bar, railH - 0.06, bar);
      }
    }

    // Wall brackets with diagonal struts under the landing
    for (const zOff of [-hw + 0.3, hw - 0.3]) {
      railBar(facadeX - depth * 0.5, y - 0.11, centerZ + zOff, depth, 0.055, 0.05);
      tube(
        b,
        facadeX - 0.04,
        y - 0.6,
        centerZ + zOff,
        outerX + 0.06,
        y - 0.07,
        centerZ + zOff,
        0.032,
        0.028,
        5,
        iron,
      );
    }

    if (i > 0 && opts.topLadder && i === floorYLevels.length - 1) {
      // Straight ladder at the outer edge from the landing below, clear of the cornice
      const y0 = floorYLevels[i - 1] + 0.05;
      const lz = centerZ + hw - 0.42;
      const lx = outerX + 0.12;
      for (const dz of [-0.2, 0.2]) railBar(lx, y0, lz + dz, 0.035, y + railH - y0, 0.035);
      for (let ry = y0 + 0.3; ry < y - 0.05; ry += 0.3) railBar(lx, ry, lz, 0.025, 0.025, 0.4);
    } else if (i > 0) {
      // Stair flight from the left end of the landing below up to the right end of this one
      const y0 = floorYLevels[i - 1] + 0.05;
      const y1 = y - 0.08;
      const z0 = centerZ + hw - 0.25 - flightLen;
      const z1 = centerZ + hw - 0.25;
      const steps = 10;
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        b.box(facadeX - 0.52, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 0.6, 0.035, 0.22, grate);
      }
      for (const sx of [-0.82, -0.22]) {
        tube(b, facadeX + sx, y0, z0, facadeX + sx, y1 + 0.06, z1, 0.03, 0.03, 5, iron);
      }
      tube(b, facadeX - 0.84, y0 + 0.86, z0, facadeX - 0.84, y1 + 0.86, z1, 0.022, 0.022, 5, iron);
      for (const t of [0.15, 0.5, 0.85]) {
        railBar(facadeX - 0.84, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 0.022, 0.86, 0.022);
      }
    }
  }

  // Gooseneck ladder at the free (left) end of the top landing: up the face, over the
  // parapet and down onto the roof deck, where its feet rest on plates; a stay ties the
  // rails back to the cornice.
  if (_roofY) {
    const top = floorYLevels[floorYLevels.length - 1];
    const gz = centerZ - hw + 0.34;
    const gx = outerX + 0.14;
    const peak = _roofY + 0.85;
    const inX = facadeX + 0.75;
    const deck = deckY ?? _roofY - 0.34;
    for (const dz of [-0.2, 0.2]) {
      railBar(gx, top + 0.05, gz + dz, 0.035, peak - top, 0.035);
      railBar((gx + inX) * 0.5, peak, gz + dz, inX - gx + 0.035, 0.035, 0.035);
      railBar(inX, deck, gz + dz, 0.035, peak - deck + 0.035, 0.035);
      railBar(inX, deck, gz + dz, 0.14, 0.025, 0.1);
      if (opts.stayX === undefined) {
        railBar((gx + facadeX - 0.3) * 0.5, _roofY - 1.2, gz + dz, facadeX - 0.3 - gx, 0.03, 0.03);
      } else {
        const sx = facadeX + opts.stayX;
        railBar((gx + sx) * 0.5, _roofY - 1.2, gz + dz, sx - gx, 0.03, 0.03);
      }
    }
    for (let ry = top + 0.35; ry < peak - 0.15; ry += 0.3) railBar(gx, ry, gz, 0.025, 0.025, 0.4);
    for (let ry = deck + 0.3; ry < peak - 0.15; ry += 0.3) railBar(inX, ry, gz, 0.025, 0.025, 0.4);
  }

  // Stowed drop ladder hanging under the lowest landing – at its right end, or at the left one
  // (`opts.drop: 'left'`) to come down over the flats' door rather than a shop sign
  const ly = floorYLevels[0];
  const lz = opts.drop === 'left' ? centerZ - hw + 0.42 : centerZ + hw - 0.42;
  const lx = outerX + 0.12;
  for (const dz of [-0.2, 0.2]) {
    railBar(lx, ly - 1.45, lz + dz, 0.035, 1.55, 0.035);
  }
  for (let ry = ly - 1.35; ry < ly; ry += 0.28) {
    railBar(lx, ry, lz, 0.025, 0.025, 0.4);
  }
}
