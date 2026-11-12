/**
 * Low-level geometry helpers shared by every architectural part.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import * as THREE from 'three/webgpu';

/**
 * Emits a tapered 3D cylindrical branch / frame tube between two arbitrary 3D points.
 */
export function tube(b, x0, y0, z0, x1, y1, z1, r0, r1, segs, opt) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const tx = dx / len;
  const ty = dy / len;
  const tz = dz / len;

  let ax;
  let ay;
  let az;
  if (Math.abs(ty) > 0.9) {
    ax = 0;
    ay = tz;
    az = -ty;
  } else {
    ax = -tz;
    ay = 0;
    az = tx;
  }
  const aLen = Math.hypot(ax, ay, az) || 1;
  ax /= aLen;
  ay /= aLen;
  az /= aLen;

  const bx = ay * tz - az * ty;
  const by = az * tx - ax * tz;
  const bz = ax * ty - ay * tx;

  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    const n0x = ax * c0 + bx * s0;
    const n0y = ay * c0 + by * s0;
    const n0z = az * c0 + bz * s0;
    const n1x = ax * c1 + bx * s1;
    const n1y = ay * c1 + by * s1;
    const n1z = az * c1 + bz * s1;

    b.quad4(
      [x0 + n1x * r0, y0 + n1y * r0, z0 + n1z * r0],
      [x0 + n0x * r0, y0 + n0y * r0, z0 + n0z * r0],
      [x1 + n0x * r1, y1 + n0y * r1, z1 + n0z * r1],
      [x1 + n1x * r1, y1 + n1y * r1, z1 + n1z * r1],
      opt,
    );
  }
}

// ---------------------------------------------------------------------------
// Facade-plane helpers. The facade plane is ZY (Z along the street, Y up) and faces −X.
// ---------------------------------------------------------------------------

const _m = new THREE.Matrix4();

/**
 * Runs `fn` with `local` composed onto the builder's current transform – parts built in a
 * rotated frame (the faces of a canted bay, a dormer) – and restores the transform after.
 */
export function withFrame(b, local, fn) {
  const prev = b.transform;
  b.setTransform(prev ? _m.copy(prev).multiply(local).clone() : local);
  try {
    fn();
  } finally {
    b.setTransform(prev);
  }
}

/** Triangle whose winding is fixed so its normal points along `n` ([x, y, z]). */
export function orientedTri(b, p0, p1, p2, uv0, uv1, uv2, n, opt) {
  const ax = p1[0] - p0[0];
  const ay = p1[1] - p0[1];
  const az = p1[2] - p0[2];
  const bx = p2[0] - p0[0];
  const by = p2[1] - p0[1];
  const bz = p2[2] - p0[2];
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) b.tri(p0, p2, p1, uv0, uv2, uv1, opt);
  else b.tri(p0, p1, p2, uv0, uv1, uv2, opt);
}

/**
 * Quad (4 corners in order around the edge) whose normal points along `n`. U runs along
 * p0→p1, V along p0→p3 (U is mirrored when the winding has to be reversed).
 */
export function orientedQuad(b, p0, p1, p2, p3, n, opt) {
  const ax = p1[0] - p0[0];
  const ay = p1[1] - p0[1];
  const az = p1[2] - p0[2];
  const bx = p3[0] - p0[0];
  const by = p3[1] - p0[1];
  const bz = p3[2] - p0[2];
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  // Flipping as (p1, p0, p3, p2) reverses the winding but keeps U along p0–p1 and V along
  // p0–p3 (U mirrored), so `rep` still matches the edges it was computed for.
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) b.quad4(p1, p0, p3, p2, opt);
  else b.quad4(p0, p1, p2, p3, opt);
}

/** `n + 1` points of an arc in the facade plane: `[z, y]` from angle `a0` to `a1` (radians). */
export function arcZY(zc, yc, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([zc + Math.cos(a) * r, yc + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Convex polygon in the facade plane (`[z, y]` points) extruded from `x0` back to `x1`:
 * the street face (−X), the back face and the edge strips. `texScale` maps the tile in metres.
 * Pediments, volutes, gable fronts, arch spandrels.
 */
export function extrudeZY(b, x0, x1, pts, opt, frontOpt = opt) {
  const ts = opt.texScale ?? 1;
  const fts = frontOpt.texScale ?? ts;
  let zMin = Infinity;
  let yMin = Infinity;
  let zc = 0;
  let yc = 0;
  for (const [z, y] of pts) {
    zMin = Math.min(zMin, z);
    yMin = Math.min(yMin, y);
    zc += z / pts.length;
    yc += y / pts.length;
  }
  const uvF = (z, y) => [(z - zMin) / fts, (y - yMin) / fts];
  const c = [zc, yc];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const d = pts[(i + 1) % pts.length];
    orientedTri(
      b,
      [x0, c[1], c[0]],
      [x0, a[1], a[0]],
      [x0, d[1], d[0]],
      uvF(...c),
      uvF(...a),
      uvF(...d),
      [-1, 0, 0],
      frontOpt,
    );
    orientedTri(
      b,
      [x1, c[1], c[0]],
      [x1, a[1], a[0]],
      [x1, d[1], d[0]],
      uvF(...c),
      uvF(...a),
      uvF(...d),
      [1, 0, 0],
      opt,
    );
    // Edge strip, facing away from the centroid
    const ez = d[0] - a[0];
    const ey = d[1] - a[1];
    let nz = ey;
    let ny = -ez;
    if (nz * (a[0] - zc) + ny * (a[1] - yc) < 0) {
      nz = -nz;
      ny = -ny;
    }
    const len = Math.hypot(ez, ey);
    orientedQuad(
      b,
      [x0, a[1], a[0]],
      [x0, d[1], d[0]],
      [x1, d[1], d[0]],
      [x1, a[1], a[0]],
      [0, ny, nz],
      {
        ...opt,
        rep: [Math.max(len / ts, 0.0001), Math.max(Math.abs(x1 - x0) / ts, 0.0001)],
      },
    );
  }
}

/**
 * Arch ring in the facade plane – voussoirs from radius `r0` (intrados) to `r1` (extrados),
 * from angle `a0` to `a1`, standing out from `x0` back to `x1`: street face, extrados and the
 * soffit. `keystone` enlarges the middle voussoir.
 */
export function archRing(b, x0, x1, zc, yc, r0, r1, a0, a1, n, opt, keystone = false) {
  const ts = opt.texScale ?? 0.9;
  for (let i = 0; i < n; i++) {
    const ta = a0 + ((a1 - a0) * i) / n;
    const tb = a0 + ((a1 - a0) * (i + 1)) / n;
    const mid = keystone && i === n >> 1;
    const ro = mid ? r1 + (r1 - r0) * 0.45 : r1;
    const xf = mid ? x0 - 0.03 : x0;
    const P = (r, a, x) => [x, yc + Math.sin(a) * r, zc + Math.cos(a) * r];
    const seg = Math.abs(tb - ta) * r1;
    const o = { ...opt, rep: [Math.max(seg / ts, 0.0001), Math.max((ro - r0) / ts, 0.0001)] };
    orientedQuad(b, P(r0, ta, xf), P(r0, tb, xf), P(ro, tb, xf), P(ro, ta, xf), [-1, 0, 0], o);
    const am = (ta + tb) * 0.5;
    orientedQuad(
      b,
      P(ro, ta, xf),
      P(ro, tb, xf),
      P(ro, tb, x1),
      P(ro, ta, x1),
      [0, Math.sin(am), Math.cos(am)],
      o,
    );
    orientedQuad(
      b,
      P(r0, ta, xf),
      P(r0, tb, xf),
      P(r0, tb, x1),
      P(r0, ta, x1),
      [0, -Math.sin(am), -Math.cos(am)],
      o,
    );
  }
}

/**
 * Convex polygon in plan (`[x, z]` points) extruded vertically from `y0` to `y1`: slabs,
 * bay caps and corbels following a canted or round plan.
 */
export function extrudeXZ(b, y0, y1, pts, opt) {
  const ts = opt.texScale ?? 1;
  let xc = 0;
  let zc = 0;
  for (const [x, z] of pts) {
    xc += x / pts.length;
    zc += z / pts.length;
  }
  const uv = (x, z) => [x / ts, z / ts];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const d = pts[(i + 1) % pts.length];
    orientedTri(
      b,
      [xc, y1, zc],
      [a[0], y1, a[1]],
      [d[0], y1, d[1]],
      uv(xc, zc),
      uv(...a),
      uv(...d),
      [0, 1, 0],
      opt,
    );
    orientedTri(
      b,
      [xc, y0, zc],
      [a[0], y0, a[1]],
      [d[0], y0, d[1]],
      uv(xc, zc),
      uv(...a),
      uv(...d),
      [0, -1, 0],
      opt,
    );
    let nx = d[1] - a[1];
    let nz = -(d[0] - a[0]);
    if (nx * (a[0] - xc) + nz * (a[1] - zc) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const len = Math.hypot(d[0] - a[0], d[1] - a[1]);
    orientedQuad(
      b,
      [a[0], y0, a[1]],
      [d[0], y0, d[1]],
      [d[0], y1, d[1]],
      [a[0], y1, a[1]],
      [nx, 0, nz],
      {
        ...opt,
        rep: [Math.max(len / ts, 0.0001), Math.max((y1 - y0) / ts, 0.0001)],
      },
    );
  }
}
