/**
 * Coplanar overlaps (z-fighting) in a merged geometry: two triangles in (almost) the same
 * plane that cover the same area but look different flicker as the camera moves. Pure math on
 * the attribute arrays, so tests and `npm run geometry -- overlaps` share it.
 */

/** Planes closer than this are one plane for the depth buffer at street distances (a 24-bit depth
 * buffer with the near plane at 2.5 m resolves ~1 mm out to 200 m). */
export const OVERLAP_GAP = 0.0006;
/** Overlaps smaller than this (m²) are invisible slivers along shared edges. */
export const OVERLAP_MIN_AREA = 2e-4;

/** Below this (m²) two patches of one material in one plane read the same. */
const PATTERN_AREA = 0.005;

const COS_PARALLEL = Math.cos((1.5 * Math.PI) / 180);

/**
 * @param {{ attributes: Record<string, { array: ArrayLike<number> }>, index: { array: ArrayLike<number> } | null }} geo
 * @param {{ opposite?: boolean, gap?: number, minArea?: number, plain?: number[][],
 *   groundY?: number }} [o]
 *   `opposite`: also report faces that touch back to back (harmless for closed solids, so off
 *   by default); `plain`: tiles of one flat colour (the texture position there does not matter);
 *   `groundY`: downward faces below this height rest on the sidewalk
 * @returns {Array<{ at: number[], n: number[], gap: number, area: number, tiles: number[][], tris: number[] }>}
 */
export function findCoplanarOverlaps(geo, o = {}) {
  const gapTol = o.gap ?? OVERLAP_GAP;
  const minArea = o.minArea ?? OVERLAP_MIN_AREA;
  const P = geo.attributes.position.array;
  const UV = geo.attributes.uv.array;
  const C = geo.attributes.color.array;
  const T = geo.attributes.aTile.array;
  const D = geo.attributes.aData?.array;
  const I = geo.index ? geo.index.array : Array.from({ length: P.length / 3 }, (_, i) => i);
  const n = I.length / 3;
  const N = new Float64Array(n * 3);
  const Dd = new Float64Array(n);
  /** @type {Map<string, number[]>} */
  const buckets = new Map();
  const key = (nx, ny, nz, d) =>
    `${Math.round(nx * 40)},${Math.round(ny * 40)},${Math.round(nz * 40)},${Math.floor(d / 0.01)}`;
  const canon = (i) => {
    const nx = N[i * 3];
    const ny = N[i * 3 + 1];
    const nz = N[i * 3 + 2];
    const flip = Math.abs(nx) > 1e-6 ? nx < 0 : Math.abs(ny) > 1e-6 ? ny < 0 : nz < 0;
    return flip ? [-nx, -ny, -nz, -Dd[i], -1] : [nx, ny, nz, Dd[i], 1];
  };
  for (let t = 0; t < n; t++) {
    const a = I[t * 3] * 3;
    const b = I[t * 3 + 1] * 3;
    const c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a];
    const uy = P[b + 1] - P[a + 1];
    const uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a];
    const vy = P[c + 1] - P[a + 1];
    const vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) {
      Dd[t] = NaN;
      continue;
    }
    nx /= len;
    ny /= len;
    nz /= len;
    N[t * 3] = nx;
    N[t * 3 + 1] = ny;
    N[t * 3 + 2] = nz;
    Dd[t] = nx * P[a] + ny * P[a + 1] + nz * P[a + 2];
    const [cx, cy, cz, cd] = canon(t);
    const k = key(cx, cy, cz, cd);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(t);
  }

  const vert = (t, j) => {
    const v = I[t * 3 + j] * 3;
    return [P[v], P[v + 1], P[v + 2]];
  };
  const out = [];
  const seen = new Set();
  for (const [k, list] of buckets) {
    const [kx, ky, kz, kd] = k.split(',').map(Number);
    const cands = [];
    for (const dd of [-1, 0, 1]) {
      const other = buckets.get(`${kx},${ky},${kz},${kd + dd}`);
      if (other) cands.push(...other);
    }
    for (const t1 of list) {
      const c1 = canon(t1);
      for (const t2 of cands) {
        if (t2 <= t1) continue;
        const c2 = canon(t2);
        const dot = c1[0] * c2[0] + c1[1] * c2[1] + c1[2] * c2[2];
        if (dot < COS_PARALLEL) continue;
        const gap = Math.abs(c1[3] - c2[3]);
        if (gap > gapTol) continue;
        const same = c1[4] === c2[4];
        if (!same && !o.opposite) continue;
        const pairKey = t1 * n + t2;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const hit = overlapArea(
          c1,
          [vert(t1, 0), vert(t1, 1), vert(t1, 2)],
          [vert(t2, 0), vert(t2, 1), vert(t2, 2)],
        );
        if (hit.area < minArea) continue;
        if (looksSame(t1, t2, hit.centroid, hit.area)) continue;
        const nrm = [c1[0] * c1[4], c1[1] * c1[4], c1[2] * c1[4]];
        // Soffits standing on the ground (the sidewalk is another mesh) are never seen
        if (nrm[1] < -0.99 && hit.centroid[1] < (o.groundY ?? 0.16)) continue;
        const samples = [hit.centroid, ...hit.pts.map((q) => lerp3(q, hit.centroid, 0.25))];
        if (o.buried !== false && samples.every((q) => buried(q, nrm))) continue;
        out.push({
          at: hit.centroid,
          n: [N[t1 * 3], N[t1 * 3 + 1], N[t1 * 3 + 2]],
          gap,
          area: hit.area,
          same,
          tiles: [tileOf(t1), tileOf(t2)],
          tris: [t1, t2],
        });
      }
    }
  }
  return merge(out);

  /**
   * The overlap lies inside a closed solid (a cornice block run into the wall mass, a slab under
   * a parapet): along most rays leaving the surface the faces crossed from behind outnumber
   * those crossed from the front (winding number of the union of closed solids).
   */
  function buried(p, nrm) {
    const helper = Math.abs(nrm[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const e1 = norm(cross(helper, nrm));
    const e2 = cross(nrm, e1);
    const dirs = [nrm];
    for (const [a, b] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      dirs.push(norm([0, 1, 2].map((k) => nrm[k] + 0.6 * (a * e1[k] + b * e2[k]))));
    }
    const o = [0, 1, 2].map((k) => p[k] + nrm[k] * 0.004);
    let inside = 0;
    for (const d of dirs) if (winding(o, d) > 0) inside++;
    return inside >= 4;
  }

  function winding(o, d) {
    let w = 0;
    for (let t = 0; t < n; t++) {
      if (Number.isNaN(Dd[t])) continue;
      const a = vert(t, 0);
      const e1 = sub(vert(t, 1), a);
      const e2 = sub(vert(t, 2), a);
      const pv = cross(d, e2);
      const det = dot3(e1, pv);
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const tv = sub(o, a);
      const u = dot3(tv, pv) * inv;
      if (u < 0 || u > 1) continue;
      const qv = cross(tv, e1);
      const v = dot3(d, qv) * inv;
      if (v < 0 || u + v > 1) continue;
      const dist = dot3(e2, qv) * inv;
      if (dist > 1e-5)
        w += N[t * 3] * d[0] + N[t * 3 + 1] * d[1] + N[t * 3 + 2] * d[2] > 0 ? 1 : -1;
    }
    return w;
  }

  function tileOf(t) {
    const v = I[t * 3] * 4;
    return [T[v], T[v + 1], T[v + 2], T[v + 3]];
  }

  /**
   * Same tile, colour, emitter code and texture position at the overlap: no flicker. On a
   * patch smaller than `PATTERN_AREA` the texture position does not matter either (a few
   * texels of the same material on a bar or a moulding).
   */
  function looksSame(t1, t2, p, area) {
    const v1 = I[t1 * 3];
    const v2 = I[t2 * 3];
    for (let j = 0; j < 4; j++) if (Math.abs(T[v1 * 4 + j] - T[v2 * 4 + j]) > 1e-6) return false;
    for (let j = 0; j < 3; j++) if (Math.abs(C[v1 * 3 + j] - C[v2 * 3 + j]) > 1e-3) return false;
    if (D && Math.abs(D[v1 * 2] - D[v2 * 2]) > 1e-6) return false;
    if (area < PATTERN_AREA) return true;
    if (o.plain?.some((r) => r.every((x, j) => Math.abs(x - T[v1 * 4 + j]) < 1e-6))) return true;
    const u1 = uvAt(t1, p);
    const u2 = uvAt(t2, p);
    const fr = (x) => x - Math.floor(x);
    const du = Math.abs(fr(u1[0]) - fr(u2[0]));
    const dv = Math.abs(fr(u1[1]) - fr(u2[1]));
    return Math.min(du, 1 - du) < 0.02 && Math.min(dv, 1 - dv) < 0.02;
  }

  function uvAt(t, p) {
    const [a, b, c] = [vert(t, 0), vert(t, 1), vert(t, 2)];
    const v0 = sub(b, a);
    const v1 = sub(c, a);
    const v2 = sub(p, a);
    const d00 = dot3(v0, v0);
    const d01 = dot3(v0, v1);
    const d11 = dot3(v1, v1);
    const d20 = dot3(v2, v0);
    const d21 = dot3(v2, v1);
    const den = d00 * d11 - d01 * d01 || 1;
    const w1 = (d11 * d20 - d01 * d21) / den;
    const w2 = (d00 * d21 - d01 * d20) / den;
    const w0 = 1 - w1 - w2;
    const ia = I[t * 3] * 2;
    const ib = I[t * 3 + 1] * 2;
    const ic = I[t * 3 + 2] * 2;
    return [
      w0 * UV[ia] + w1 * UV[ib] + w2 * UV[ic],
      w0 * UV[ia + 1] + w1 * UV[ib + 1] + w2 * UV[ic + 1],
    ];
  }
}

const lerp3 = (a, b, t) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Area and centroid of the intersection of two (nearly) coplanar triangles. */
function overlapArea(plane, A, B) {
  const nrm = [plane[0], plane[1], plane[2]];
  const helper = Math.abs(nrm[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm(cross(helper, nrm));
  const e2 = cross(nrm, e1);
  const to2 = (p) => [dot3(p, e1), dot3(p, e2)];
  let poly = A.map(to2);
  const b = B.map(to2);
  if (signedArea(poly) < 0) poly.reverse();
  if (signedArea(b) < 0) b.reverse();
  for (let i = 0; i < 3 && poly.length; i++) poly = clip(poly, b[i], b[(i + 1) % 3]);
  if (poly.length < 3) return { area: 0, centroid: [0, 0, 0], pts: [] };
  const area = Math.abs(signedArea(poly));
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  cx /= poly.length;
  cy /= poly.length;
  const d = dot3(A[0], nrm);
  const to3 = (x, y) => [0, 1, 2].map((k) => x * e1[k] + y * e2[k] + d * nrm[k]);
  return { area, centroid: to3(cx, cy), pts: poly.map((q) => to3(q[0], q[1])) };
}

function clip(poly, a, b) {
  const out = [];
  const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

const signedArea = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    s += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return s / 2;
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Pairs of the same two surfaces (quads are two triangles) reported once, areas summed. */
function merge(list) {
  const groups = new Map();
  for (const f of list) {
    const k = [
      ...f.n.map((v) => Math.round(v * 20)),
      ...f.at.map((v) => Math.round(v * 2)),
      f.tiles
        .map((t) => t.join())
        .sort()
        .join('|'),
    ].join();
    const g = groups.get(k);
    if (g) {
      g.area += f.area;
    } else groups.set(k, { ...f });
  }
  return [...groups.values()].sort((a, b) => a.at[2] - b.at[2]);
}
