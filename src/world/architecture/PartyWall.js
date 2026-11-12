/**
 * Exposed party wall of a house that stands taller than its neighbour. The flank face itself is
 * the house's own mass; this adds what makes it read as a real party wall: the parapet with its
 * coping running back along the flank, the flashing line where the neighbour's roof meets it,
 * and chimney flues standing on the wall.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { CHIMNEY_BRICK, STONE_CORNICE } from './palette.js';
import { orientedQuad, orientedTri } from './primitives.js';

/**
 * @param {object} o `{ x, depth, z, side: -1 (left flank) | 1 (right flank), below: neighbour's
 *   roof height, roofLine: where the neighbour's roof meets the wall (`SpecPlanner.lotRoofLine`:
 *   `{ y }` or gable slopes `{ x0, x1, eave, ridge }`; default: along `below`), top: own roof
 *   line, wall: MeshBuilder options, coping, flues = 0,
 *   mansard: { h, inset, cap } – the firewall then rises along the mansard profile,
 *   gable: true – the own gable end is the wall (no parapet, the chimneys come with the roof),
 *   front – the parapet starts this far behind the front (a neck gable's shoulders cover it),
 *   ghost: true – a faded painted advertisement on the exposed brick,
 *   scar: true – the trace of an older, steeper roof of a gabled neighbour (`buildRoofScar`) }`
 */
export function buildPartyWall(atlas, b, o) {
  const T = atlas.tiles;
  const { x, depth, z, side, below, top } = o;
  // The parapet stands on the wall, its face `PROUD` outside the flank plane: the roof slab, cornice,
  // attic and mansard ends of the house stop in that plane and would flicker against it
  const zi = z - side * (0.12 - PROUD);
  const coping = { tile: T.wall_stone, color: o.coping ?? STONE_CORNICE, texScale: 0.9 };
  // Flues stand on the parapet – or on the coping of a mansard's firewall
  let flueY = top + 0.5;
  if (o.mansard) {
    // Firewall: the party wall carried up past the mansard ends, stepped back like its profile
    const { h: mh, inset } = o.mansard;
    const yTop = top + mh + (o.mansard.cap ?? 0.5) + 0.25;
    flueY = yTop + 0.07;
    const z0 = zi - 0.12;
    const z1 = zi + 0.12;
    b.prism(
      [x, top, z1],
      [x + depth, top, z1],
      [x + depth, top, z0],
      [x, top, z0],
      [x + inset * 0.6, yTop, z1],
      [x + depth - inset * 0.6, yTop, z1],
      [x + depth - inset * 0.6, yTop, z0],
      [x + inset * 0.6, yTop, z0],
      { ...o.wall, faces: { ny: false } },
    );
    b.box(x + depth * 0.5, yTop, zi, depth - inset * 1.2 + 0.06, 0.07, 0.34, coping);
  } else if (!o.gable) {
    // The parapet may start behind the front (`front`: behind the shoulders of a neck gable)
    const f0 = o.front ?? 0;
    const run = depth - f0;
    // It stops just short of the facade and of the rear parapet's back face (the roof membrane,
    // an attic or a cornice end there); the coping rides a little higher than a crown or
    // attic coping meeting it at the front
    b.box(x + f0 + run * 0.5, top, zi, run - PROUD * 2, 0.5, 0.24, {
      ...o.wall,
      faces: { ny: false },
    });
    b.box(x + f0 + run * 0.5, top + 0.5, zi, run + 0.04, 0.075, 0.34, coping);
  }
  if (o.ghost && top - below > 1.2) {
    // Faded wall advertisement on the brick between the neighbour's roof and the cornice line
    const gh = Math.min(top - below - 0.6, (depth - 1.0) / 3);
    const gw = gh * 3;
    const gy = below + (top - below - gh) * 0.5;
    const gx = x + (depth - gw) * 0.5;
    const gz = z + side * 0.008;
    orientedQuad(
      b,
      [gx, gy, gz],
      [gx + gw, gy, gz],
      [gx + gw, gy + gh, gz],
      [gx, gy + gh, gz],
      [0, 0, side],
      {
        tile: T.ghost_sign,
        color: o.wall.color,
        rep: [1, 1],
      },
    );
  }
  // Flashing: a dark lead strip stepped into the brick at the neighbour's roof line – level, or
  // up one slope of a gabled neighbour and down the other. None over an open lot (`below` 0):
  // there the wall is a flank facade with a parapet.
  const flash = { tile: T.white, color: [0.2, 0.21, 0.23] };
  const zf = z + side * 0.006;
  const line = o.roofLine;
  let pts =
    below > 0
      ? [
          [x, line?.y ?? below],
          [x + depth, line?.y ?? below],
        ]
      : [];
  if (line?.ridge !== undefined) {
    const xm = (line.x0 + line.x1) * 0.5;
    const yAt = (px) =>
      line.ridge - ((line.ridge - line.eave) * Math.abs(px - xm)) / ((line.x1 - line.x0) * 0.5);
    const xs = [x, xm, Math.min(x + depth, line.x1)].filter((px) => px >= x && px <= x + depth);
    pts = xs.map((px) => [px, yAt(px)]);
  }
  if (o.scar && line?.ridge !== undefined && pts.length === 3) {
    buildRoofScar(T, b, o, pts, zf - side * 0.003, line);
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const [xa, ya] = pts[i];
    const [xb, yb] = pts[i + 1];
    if (xb - xa < 1e-3) continue;
    orientedQuad(
      b,
      [xa, ya, zf],
      [xb, yb, zf],
      [xb, yb + 0.07, zf],
      [xa, ya + 0.07, zf],
      [0, 0, side],
      {
        ...flash,
        rep: [(xb - xa) / 0.5, 1],
      },
    );
  }
  for (let i = 0; i < (o.gable ? 0 : (o.flues ?? 0)); i++) {
    const fx = x + depth * ((i + 1) / ((o.flues ?? 0) + 1));
    const brick = { tile: T.wall_brick, color: CHIMNEY_BRICK, texScale: 0.8 };
    // The flue stands a little into the coping: their soffits would share a plane
    b.box(fx, flueY - 0.01, zi, 0.6, 0.76, 0.42, brick);
    b.box(fx, o.mansard ? flueY + 0.75 : top + 1.25, zi, 0.7, 0.08, 0.5, brick);
  }
}

/** The parapet's face stands this far outside the flank plane of the house. */
const PROUD = 0.004;

/** The old roof stood this much higher at its ridge than the gabled neighbour's roof today. */
const SCAR_RISE = 1.7;

/**
 * Trace of an older, steeper roof of the gabled neighbour on the party wall above its present
 * one: the brick it once covered, cleaner than the weathered wall round it (laid in its own
 * courses), and the recessed chase that held its flashing, a dark strip along the old slopes.
 * `pts` are the present roof line `[eave, ridge, eave]` across the wall, `zf` the face plane.
 */
function buildRoofScar(T, b, o, pts, zf, line) {
  const { side } = o;
  const xm = (line.x0 + line.x1) * 0.5;
  const halfRun = (line.x1 - line.x0) * 0.5;
  const oldRidge = line.ridge + SCAR_RISE;
  const yOld = (px) => oldRidge - ((oldRidge - line.eave) * Math.abs(px - xm)) / halfRun;
  const ts = o.wall.texScale ?? 1.1;
  const patch = {
    tile: o.wall.tile,
    color: (o.wall.color ?? [1, 1, 1]).map((c) => Math.min(1, c * 1.12)),
  };
  const chase = { tile: T.white, color: (o.wall.color ?? [1, 1, 1]).map((c) => c * 0.42) };
  const n = [0, 0, side];
  const uv = (px, py) => [px / ts, py / ts];
  // Between the present slopes and the old ones, one convex piece per slope
  for (const [a, m] of [
    [pts[0], pts[1]],
    [pts[2], pts[1]],
  ]) {
    const [xa, ya] = a;
    const [xb, yb] = m;
    const qa = [xa, yOld(xa)];
    const qb = [xb, yOld(xb)];
    for (const [p, q, r] of [
      [[xa, ya], [xb, yb], qb],
      [[xa, ya], qb, qa],
    ]) {
      orientedTri(
        b,
        [p[0], p[1], zf],
        [q[0], q[1], zf],
        [r[0], r[1], zf],
        uv(...p),
        uv(...q),
        uv(...r),
        n,
        patch,
      );
    }
    // The chase along the old slope
    orientedQuad(
      b,
      [qa[0], qa[1] - 0.05, zf + side * 0.001],
      [qb[0], qb[1] - 0.05, zf + side * 0.001],
      [qb[0], qb[1] + 0.06, zf + side * 0.001],
      [qa[0], qa[1] + 0.06, zf + side * 0.001],
      n,
      { ...chase, rep: [Math.max(Math.abs(qb[0] - qa[0]) / 0.5, 0.0001), 1] },
    );
  }
}
