/**
 * Planting: leaf cards and faceted leaf blobs, garden trees, flowering shrubs,
 * clipped box hedges and flower beds.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import {
  LEAF_DARK_OLIVE,
  LEAF_MID_OLIVE,
  LEAF_SAGE_GREEN,
  LEAF_SUN_TIP,
  GOLDEN_ANGLE,
} from './palette.js';
import { tube } from './primitives.js';

/**
 * Low clipped boxwood edging: a faceted rounded block with a few leaf cards. `alongZ` runs it
 * along Z instead (`lengthX` its length, `depthZ` its depth across).
 */
export function buildBoxHedge(
  atlas,
  b,
  cx,
  baseY,
  cz,
  lengthX,
  height,
  depthZ,
  rng,
  alongZ = false,
) {
  const n = Math.max(1, Math.round(lengthX / 0.55));
  const seg = lengthX / n;
  for (let i = 0; i < n; i++) {
    addLeafBlob(
      atlas,
      b,
      alongZ ? cx : cx - lengthX * 0.5 + (i + 0.5) * seg,
      baseY + height * 0.5,
      alongZ ? cz - lengthX * 0.5 + (i + 0.5) * seg : cz,
      alongZ ? depthZ * 0.6 : seg * 0.62,
      height * 0.55,
      alongZ ? seg * 0.62 : depthZ * 0.6,
      rng,
      {
        top: [0.24, 0.4, 0.13],
        mid: [0.16, 0.3, 0.09],
        low: [0.09, 0.19, 0.05],
        leaf: [LEAF_SAGE_GREEN, LEAF_MID_OLIVE, LEAF_DARK_OLIVE],
      },
      0.3 + i * 0.07,
      0.12,
      1,
      4,
    );
  }
}

/**
 * Low-poly broadleaf garden tree in the style of the reference: a short forked trunk and
 * a billowing crown built from faceted leaf blobs (sunlit yellow-green tops, deep olive
 * undersides) dressed with large overlapping leaf cards that break up the silhouette.
 * `blossom` swaps in a smaller ornamental tree with pale pink/white flower clusters.
 */
export function buildRoundTree(atlas, b, cx, cz, rng, baseY, scaleMul = 1.0, opts = {}) {
  const T = atlas.tiles;
  const s = rng.range(0.94, 1.06) * scaleMul;
  const seed = rng.next();
  const barkOpt = { tile: T.bark, color: [0.42, 0.34, 0.27] };
  const blossom = !!opts.blossom;

  const trunkH = (blossom ? 1.5 : 1.7) * s;
  b.cylinderY(cx, baseY, cz, 0.17 * s, 0.11 * s, trunkH, 8, barkOpt);
  // Flared root collar
  b.cylinderY(cx, baseY, cz, 0.27 * s, 0.17 * s, 0.18 * s, 8, barkOpt);

  // Crown lobes: [dx, dy, dz, radius] in crown units
  const layout = blossom
    ? [
        [0, 0.35, 0, 0.78],
        [-0.62, 0.05, 0.25, 0.6],
        [0.6, 0.1, -0.2, 0.58],
        [0.1, -0.05, 0.62, 0.55],
        [-0.15, 0.0, -0.6, 0.55],
        [0.05, 0.8, 0.05, 0.5],
      ]
    : [
        [0, 0.55, 0, 1.0],
        [-1.05, 0.15, 0.2, 0.86],
        [1.0, 0.05, -0.15, 0.82],
        [-0.45, 0.2, 0.95, 0.8],
        [0.55, 0.25, 0.85, 0.78],
        [-0.35, 0.05, -0.95, 0.8],
        [0.6, 0.1, -0.85, 0.76],
        [-0.2, 1.1, 0.15, 0.72],
        [0.45, 0.95, -0.25, 0.66],
        [-1.3, -0.45, -0.3, 0.55],
        [1.25, -0.4, 0.45, 0.52],
      ];
  const crownY = baseY + trunkH + (blossom ? 0.55 : 0.75) * s;
  const unit = (blossom ? 0.95 : 1.12) * s;

  const palette = blossom
    ? {
        top: [0.99, 0.93, 0.94],
        mid: [0.96, 0.79, 0.85],
        low: [0.72, 0.56, 0.6],
        leaf: [LEAF_SAGE_GREEN, LEAF_MID_OLIVE],
      }
    : {
        top: [0.5, 0.66, 0.24],
        mid: [0.3, 0.48, 0.15],
        low: [0.13, 0.27, 0.08],
        leaf: [LEAF_SUN_TIP, LEAF_SAGE_GREEN, LEAF_MID_OLIVE, LEAF_DARK_OLIVE],
      };

  for (let i = 0; i < layout.length; i++) {
    const [ox, oy, oz, r] = layout[i];
    const lx = cx + ox * unit;
    const ly = crownY + oy * unit;
    const lz = cz + oz * unit;
    const rr = r * unit;
    // Limb from the trunk fork to each lobe
    tube(
      b,
      cx + ox * 0.06 * s,
      baseY + trunkH * 0.82,
      cz + oz * 0.06 * s,
      lx * 0.7 + cx * 0.3,
      ly - rr * 0.45,
      lz * 0.7 + cz * 0.3,
      // (each limb a hair thicker than the last: two limbs leaving the fork side by side would
      // otherwise share the planes of their faces)
      0.085 * s * (1 + i * 0.04),
      0.04 * s,
      5,
      barkOpt,
    );
    addLeafBlob(atlas, b, lx, ly, lz, rr, rr * 0.82, rr, rng, palette, seed + i * 0.071, 0.5);
    if (blossom) {
      // Flower clusters studding the upper half of each lobe
      for (let k = 0; k < 7; k++) {
        const a = rng.range(0, Math.PI * 2);
        const up = rng.range(0.1, 0.85);
        const hr = Math.sqrt(1 - up * up);
        addLeafBlob(
          atlas,
          b,
          lx + Math.cos(a) * hr * rr * 0.92,
          ly + up * rr * 0.8,
          lz + Math.sin(a) * hr * rr * 0.92,
          0.13 * s,
          0.11 * s,
          0.13 * s,
          rng,
          {
            top: rng.chance(0.5) ? [0.98, 0.95, 0.94] : [0.97, 0.78, 0.84],
            mid: [0.92, 0.72, 0.78],
            low: [0.75, 0.55, 0.6],
          },
          seed,
          0.45,
          0,
        );
      }
    }
  }
}

/**
 * Faceted foliage blob: a jittered once-subdivided icosahedron (80 flat-shaded faces)
 * coloured by facing (sunlit top → shaded underside), plus `leafCount` broad leaf cards
 * lying shingle-like on its surface. `detail` 0 skips subdivision (20 faces, for blooms).
 * `cardSpan`: how far down from the top the cards reach (2 = the whole ball, 1 = the upper half
 * only – no cards hanging under a crown).
 */
export function addLeafBlob(
  atlas,
  b,
  cx,
  cy,
  cz,
  rx,
  ry,
  rz,
  rng,
  palette,
  seed,
  sway,
  detail = 1,
  leafCount,
  cardSpan = 1.55,
) {
  const T = atlas.tiles;
  const t = (1 + Math.sqrt(5)) / 2;
  // prettier-ignore
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  // prettier-ignore
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  if (detail > 0) {
    const cache = new Map();
    const mid = (a, c) => {
      const key = a < c ? `${a}_${c}` : `${c}_${a}`;
      let idx = cache.get(key);
      if (idx === undefined) {
        const va = verts[a];
        const vc = verts[c];
        const m = [va[0] + vc[0], va[1] + vc[1], va[2] + vc[2]];
        const l = Math.hypot(m[0], m[1], m[2]);
        idx = verts.length;
        verts.push([m[0] / l, m[1] / l, m[2] / l]);
        cache.set(key, idx);
      }
      return idx;
    };
    const next = [];
    for (const [a, c, e] of faces) {
      const ab = mid(a, c);
      const bc = mid(c, e);
      const ca = mid(e, a);
      next.push([a, ab, ca], [c, bc, ab], [e, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  // Shared-vertex radial jitter keeps the blob watertight but lumpy.
  const pos = verts.map((v) => {
    const k = 0.84 + rng.next() * 0.3;
    const sag = v[1] < -0.2 ? 0.82 : 1.0; // flatter underside
    return [cx + v[0] * rx * k, cy + v[1] * ry * k * sag, cz + v[2] * rz * k];
  });

  const uvA = [0.12, 0.1];
  const uvB = [0.88, 0.1];
  const uvC = [0.5, 0.92];
  for (const [a, c, e] of faces) {
    const pa = pos[a];
    const pc = pos[c];
    const pe = pos[e];
    // Facing from the unjittered sphere direction of the face centre
    const ny = (verts[a][1] + verts[c][1] + verts[e][1]) / 3;
    const nx = (verts[a][0] + verts[c][0] + verts[e][0]) / 3;
    const light = ny * 0.8 - nx * 0.25 + (rng.next() - 0.5) * 0.25;
    const base = light > 0.32 ? palette.top : light > -0.2 ? palette.mid : palette.low;
    const jitter = 0.9 + rng.next() * 0.18;
    const col = [base[0] * jitter, base[1] * jitter, base[2] * jitter];
    b.tri(pa, pc, pe, uvA, uvB, uvC, { tile: T.leaves, color: col, data: [seed, sway] });
  }

  // Broad leaf cards shingled over the surface, pointing outward-and-down.
  const n = leafCount ?? (detail > 0 && palette.leaf ? Math.round(14 + rx * 22) : 0);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const vy = 1 - u * cardSpan; // bias to the upper/side shell
    const hr = Math.sqrt(Math.max(0, 1 - Math.min(1, vy * vy)));
    const a = seed * 6.283 + i * GOLDEN_ANGLE;
    const nx = Math.cos(a) * hr;
    const nz = Math.sin(a) * hr;
    const ny = Math.max(-0.6, vy);
    const px = cx + nx * rx * 0.96;
    const py = cy + ny * ry * 0.96;
    const pz = cz + nz * rz * 0.96;
    // Tangent pointing down the surface, tipped outward
    const dx = nx * ny * 0.75 + nx * 0.55;
    const dy = (ny * ny - 1) * 0.75 + ny * 0.55;
    const dz = nz * ny * 0.75 + nz * 0.55;
    const sun = ny * 0.8 - nx * 0.25;
    const pal = palette.leaf;
    const col =
      sun > 0.45 ? pal[0] : sun > 0.0 ? pal[Math.min(1, pal.length - 1)] : pal[pal.length - 1];
    const len = rng.range(0.26, 0.38) * Math.min(1.25, 0.7 + rx * 0.35);
    addLeafBlade(
      atlas,
      b,
      px,
      py,
      pz,
      dx,
      dy,
      dz,
      len,
      len * rng.range(0.72, 0.9),
      0.03,
      rng.range(-0.5, 0.5),
      col,
      seed + (i % 17) * 0.031,
      sway + 0.1,
    );
  }
}

/**
 * Garden shrub in the reference's soft low-poly style: an irregular mound of 3–4
 * overlapping faceted leaf masses (each a slightly different green) dressed with broad
 * leaf cards, crowned with round hydrangea mop-heads of a single colour family per bush
 * (white, blush, rose or lilac-blue) – as a real hydrangea flowers.
 */
export function buildFloweringShrub(atlas, b, x, y, z, rx, ry, rz, rng) {
  const seed = rng.next();
  const greens = [
    { top: [0.3, 0.48, 0.17], mid: [0.19, 0.35, 0.1], low: [0.09, 0.2, 0.05] },
    { top: [0.26, 0.45, 0.2], mid: [0.16, 0.32, 0.12], low: [0.08, 0.18, 0.06] },
    { top: [0.34, 0.5, 0.16], mid: [0.22, 0.37, 0.1], low: [0.11, 0.22, 0.05] },
  ];
  const leaf = [LEAF_SAGE_GREEN, LEAF_MID_OLIVE, LEAF_DARK_OLIVE];

  const parts = [];
  const masses = rng.chance(0.5) ? 4 : 3;
  for (let i = 0; i < masses; i++) {
    const a = seed * 6.283 + i * 2.17;
    const off = i === 0 ? 0 : 0.45;
    const sc = i === 0 ? 1 : rng.range(0.6, 0.8);
    const prx = rx * sc * 0.8;
    const pry = ry * sc * 0.62;
    const prz = rz * sc * 0.8;
    const px = x + Math.cos(a) * rx * off;
    const pz = z + Math.sin(a) * rz * off;
    const py = y + pry * 0.82;
    parts.push([px, py, pz, prx, pry, prz]);
    addLeafBlob(
      atlas,
      b,
      px,
      py,
      pz,
      prx,
      pry,
      prz,
      rng,
      { ...greens[(i + Math.floor(seed * 3)) % greens.length], leaf },
      seed + i * 0.13,
      0.3,
      1,
      Math.round(5 + prx * 12),
    );
  }

  const families = [
    [0.97, 0.96, 0.92],
    [0.98, 0.83, 0.87],
    [0.93, 0.6, 0.71],
    [0.72, 0.76, 0.96],
  ];
  const base = families[Math.floor(seed * 97) % families.length];
  const heads = Math.round(4 + rx * 13);
  for (let i = 0; i < heads; i++) {
    const [px, py, pz, prx, pry, prz] = parts[i % parts.length];
    const a = seed * 4.1 + i * GOLDEN_ANGLE;
    const up = rng.range(0.3, 0.92);
    const hr = Math.sqrt(1 - up * up);
    const r = rng.range(0.1, 0.14) * Math.min(1.2, 0.75 + rx * 0.5);
    const v = rng.range(0.92, 1.04);
    const col = base.map((cc) => Math.min(1, cc * v));
    addLeafBlob(
      atlas,
      b,
      px + Math.cos(a) * hr * prx * 0.98,
      py + up * pry * 0.98,
      pz + Math.sin(a) * hr * prz * 0.98,
      r,
      r * 0.82,
      r,
      rng,
      { top: col, mid: col.map((cc) => cc * 0.88), low: col.map((cc) => cc * 0.72) },
      seed,
      0.3,
      0,
    );
  }
}

/**
 * Low flower bed: a row of small leafy cushions (faceted, slightly flattened) each
 * carrying a few bright blooms – a soft border instead of loose stems.
 */
export function buildFlowerBed(atlas, b, x, y, z0, z1, rng) {
  if (z1 - z0 < 0.3) return;
  const n = Math.max(2, Math.round((z1 - z0) / 0.42));
  const blooms = [
    [0.97, 0.94, 0.9],
    [0.95, 0.56, 0.66],
    [0.98, 0.76, 0.34],
    [0.86, 0.66, 0.92],
  ];
  const greens = { top: [0.28, 0.46, 0.15], mid: [0.18, 0.34, 0.1], low: [0.09, 0.2, 0.05] };
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / n + rng.range(-0.06, 0.06);
    const r = rng.range(0.17, 0.23);
    const cx = x + rng.range(-0.06, 0.06);
    const seed = rng.next();
    addLeafBlob(atlas, b, cx, y + r * 0.42, z, r, r * 0.55, r * 0.9, rng, greens, seed, 0.25, 0);
    const col = blooms[(i + Math.floor(seed * 4)) % blooms.length];
    for (let k = 0; k < 3; k++) {
      const a = seed * 6.28 + k * 2.1;
      const fr = rng.range(0.045, 0.06);
      addLeafBlob(
        atlas,
        b,
        cx + Math.cos(a) * r * 0.5,
        y + r * 0.72,
        z + Math.sin(a) * r * 0.5,
        fr,
        fr * 0.8,
        fr,
        rng,
        { top: col, mid: col.map((c) => c * 0.88), low: col.map((c) => c * 0.75) },
        seed,
        0.25,
        0,
      );
    }
  }
}

/**
 * Emits a two-sided 3D sculpted almond/lanceolate botanical leaf blade with a raised central
 * midrib ridge (`+U` upper surface, `-U` shaded underside) and `T.leaves` chevron venation.
 */
export function addLeafBlade(
  atlas,
  b,
  ox,
  oy,
  oz,
  dx,
  dy,
  dz,
  len,
  width,
  droop,
  roll,
  color,
  seed = 0.5,
  sway = 0.6,
) {
  const T = atlas.tiles;
  const dLen = Math.hypot(dx, dy, dz) || 1;
  const fx = dx / dLen;
  const fy = dy / dLen;
  const fz = dz / dLen;

  // Right-handed orthonormal basis `(R, U, F)` where `R = normalize(F × RefUp)` and `U = R × F`
  let rx;
  let ry;
  let rz;
  if (Math.abs(fy) > 0.92) {
    // RefUp = [1, 0, 0] -> F × [1, 0, 0] = [0, fz, -fy]
    rx = 0;
    ry = fz;
    rz = -fy;
  } else {
    // RefUp = [0, 1, 0] -> F × [0, 1, 0] = [-fz, 0, fx]
    rx = -fz;
    ry = 0;
    rz = fx;
  }
  const rLen = Math.hypot(rx, ry, rz) || 1;
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;

  // U0 = R0 × F
  const ux0 = ry * fz - rz * fy;
  const uy0 = rz * fx - rx * fz;
  const uz0 = rx * fy - ry * fx;

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const rvx = rx * cr + ux0 * sr;
  const rvy = ry * cr + uy0 * sr;
  const rvz = rz * cr + uz0 * sr;
  const uvx = -rx * sr + ux0 * cr;
  const uvy = -ry * sr + uy0 * cr;
  const uvz = -rz * sr + uz0 * cr;

  const hw = width * 0.5;
  const midFrac = 0.44;
  const wingCamber = width * 0.13;

  const p0 = [ox, oy, oz];
  const pTip = [
    ox + fx * len - uvx * droop,
    oy + fy * len - uvy * droop - droop * 0.35,
    oz + fz * len - uvz * droop,
  ];
  const midX = ox + fx * (len * midFrac) - uvx * wingCamber;
  const midY = oy + fy * (len * midFrac) - uvy * wingCamber;
  const midZ = oz + fz * (len * midFrac) - uvz * wingCamber;

  const pR = [midX + rvx * hw, midY + rvy * hw, midZ + rvz * hw];
  const pL = [midX - rvx * hw, midY - rvy * hw, midZ - rvz * hw];

  const topOpt = { tile: T.leaves, color, data: [seed, sway] };
  const underOpt = {
    tile: T.leaves,
    color: [color[0] * 0.72, color[1] * 0.74, color[2] * 0.68],
    data: [seed, sway],
  };

  const uvBase = [0.5, 0.05];
  const uvTip = [0.5, 0.95];
  const uvR = [0.92, 0.45];
  const uvL = [0.08, 0.45];

  // Upper sunlit face (`+U` normal with subtle convex midrib ridge)
  b.tri(p0, pR, pTip, uvBase, uvR, uvTip, topOpt);
  b.tri(p0, pTip, pL, uvBase, uvTip, uvL, topOpt);

  // Shaded botanical underside (`-U` normal so low-elevation views never cull backfaces)
  b.tri(p0, pTip, pR, uvBase, uvTip, uvR, underOpt);
  b.tri(p0, pL, pTip, uvBase, uvL, uvTip, underOpt);
}

/**
 * Tall green bamboo in a glazed ceramic pot, standing on the sidewalk against the wall (a ramen
 * bar's corner).
 */
export function buildBambooPlanter(atlas, b, x, z) {
  const T = atlas.tiles;
  b.cylinderY(x, 0, z, 0.22, 0.18, 0.52, 10, { tile: T.terracotta, color: [0.24, 0.38, 0.35] });
  // Tall culms
  for (const [ox, oz] of [
    [0, 0],
    [-0.08, 0.06],
    [0.08, -0.05],
    [-0.06, -0.07],
  ]) {
    b.cylinderY(x + ox, 0.48, z + oz, 0.022, 0.018, 1.85, 6, {
      tile: T.white,
      color: [0.45, 0.62, 0.28],
    });
  }
  // Foliage: a compact inner cushion and small tufts of leaf blades
  const seed = 0.31 + Math.abs(z) * 0.07;
  b.box(x, 1.62, z, 0.3, 0.48, 0.3, { tile: T.leaves, color: LEAF_DARK_OLIVE, data: [seed, 0.2] });
  for (let i = 0; i < 5; i++) {
    const py = 1.5 + i * 0.26;
    for (let j = 0; j < 7; j++) {
      const ang = j * GOLDEN_ANGLE + i * 0.73;
      const r = 0.1 + (i % 2) * 0.05;
      addLeafBlade(
        atlas,
        b,
        x + Math.cos(ang) * r,
        py + (j % 3) * 0.045,
        z + Math.sin(ang) * r,
        Math.cos(ang) * 0.85,
        0.42,
        Math.sin(ang) * 0.85,
        0.3,
        0.07,
        0.032,
        j % 2 === 0 ? 0.42 : -0.42,
        j % 3 === 0 ? LEAF_SAGE_GREEN : LEAF_MID_OLIVE,
        seed + i * 0.11 + j * 0.05,
        0.35,
      );
    }
  }
}
