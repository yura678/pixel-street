/**
 * MeshBuilder – fast CPU-side geometry accumulator for merged, low-draw-call meshes.
 *
 * Every vertex carries:
 *   position (vec3), normal (vec3)
 *   uv       (vec2)  – REPEAT coordinates (the shader does `fract(uv)` inside the atlas tile)
 *   color    (vec3)  – linear tint (applied where the atlas tint mask is set)
 *   aTile    (vec4)  – atlas rect [u0, v0, du, dv] (v down)
 *   aData    (vec2)  – x: per-quad seed / emitter code, y: sway weight / paint flag
 *
 * An optional affine transform (rotation + translation) is applied to everything emitted,
 * which lets builders work in convenient local frames (e.g. a "lot frame").
 */
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

const WHITE = [1, 1, 1];
const DEFAULT_TILE = [0, 0, 1 / 16, 1 / 16];
const ZERO2 = [0, 0];

export class MeshBuilder {
  positions = [];
  normals = [];
  uvs = [];
  colors = [];
  tiles = [];
  data = [];
  indices = [];

  /** @type {THREE.Matrix4 | null} */
  #matrix = null;

  /** Default tile used when an option set does not specify one. */
  defaultTile = DEFAULT_TILE;

  get vertexCount() {
    return this.positions.length / 3;
  }

  /** Current affine transform (null = identity). */
  get transform() {
    return this.#matrix;
  }

  /** @param {THREE.Matrix4 | null} m */
  setTransform(m) {
    this.#matrix = m;
    return this;
  }

  #vertex(x, y, z, nx, ny, nz, u, v, o) {
    _v.set(x, y, z);
    _n.set(nx, ny, nz);
    if (this.#matrix) {
      _v.applyMatrix4(this.#matrix);
      _n.transformDirection(this.#matrix);
    }
    const col = o.color ?? WHITE;
    const tile = o.tile ?? this.defaultTile;
    const d = o.data ?? ZERO2;
    this.positions.push(_v.x, _v.y, _v.z);
    this.normals.push(_n.x, _n.y, _n.z);
    this.uvs.push(u, v);
    this.colors.push(col[0], col[1], col[2]);
    this.tiles.push(tile[0], tile[1], tile[2], tile[3]);
    this.data.push(d[0], d[1]);
  }

  /**
   * Parallelogram quad: corners o, o+u, o+u+v, o+v. Normal = normalize(u × v).
   * @param {number[]} o origin [x,y,z]
   * @param {number[]} u edge vector (texture U)
   * @param {number[]} v edge vector (texture V, "up" in the tile)
   * @param {object} [opt] { color, tile, rep:[ru,rv], data:[a,b] }
   */
  quad(o, u, v, opt = {}) {
    _a.set(u[0], u[1], u[2]);
    _b.set(v[0], v[1], v[2]);
    _c.crossVectors(_a, _b).normalize();
    const ru = opt.rep ? opt.rep[0] : 1;
    const rv = opt.rep ? opt.rep[1] : 1;
    const ou = opt.uvOffset ? opt.uvOffset[0] : 0;
    const ov = opt.uvOffset ? opt.uvOffset[1] : 0;
    const base = this.vertexCount;
    const nx = _c.x;
    const ny = _c.y;
    const nz = _c.z;
    this.#vertex(o[0], o[1], o[2], nx, ny, nz, ou, ov, opt);
    this.#vertex(o[0] + u[0], o[1] + u[1], o[2] + u[2], nx, ny, nz, ou + ru, ov, opt);
    this.#vertex(
      o[0] + u[0] + v[0],
      o[1] + u[1] + v[1],
      o[2] + u[2] + v[2],
      nx,
      ny,
      nz,
      ou + ru,
      ov + rv,
      opt,
    );
    this.#vertex(o[0] + v[0], o[1] + v[1], o[2] + v[2], nx, ny, nz, ou, ov + rv, opt);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  /**
   * Arbitrary planar-ish quad from 4 CCW corners (p0 bottom-left, p1 bottom-right, p2 top-right, p3 top-left).
   */
  quad4(p0, p1, p2, p3, opt = {}) {
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    _b.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    _c.crossVectors(_a, _b).normalize();
    const ru = opt.rep ? opt.rep[0] : 1;
    const rv = opt.rep ? opt.rep[1] : 1;
    const base = this.vertexCount;
    this.#vertex(p0[0], p0[1], p0[2], _c.x, _c.y, _c.z, 0, 0, opt);
    this.#vertex(p1[0], p1[1], p1[2], _c.x, _c.y, _c.z, ru, 0, opt);
    this.#vertex(p2[0], p2[1], p2[2], _c.x, _c.y, _c.z, ru, rv, opt);
    this.#vertex(p3[0], p3[1], p3[2], _c.x, _c.y, _c.z, 0, rv, opt);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  /**
   * Triangle with explicit UVs and vertex normals (CCW): smooth shading across a curved surface,
   * a tree's trunk and limbs.
   */
  triN(p0, p1, p2, n0, n1, n2, uv0, uv1, uv2, opt = {}) {
    const base = this.vertexCount;
    this.#vertex(p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], uv0[0], uv0[1], opt);
    this.#vertex(p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], uv1[0], uv1[1], opt);
    this.#vertex(p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], uv2[0], uv2[1], opt);
    this.indices.push(base, base + 1, base + 2);
    return this;
  }

  /** Triangle with explicit UVs (CCW). */
  tri(p0, p1, p2, uv0, uv1, uv2, opt = {}) {
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    _c.crossVectors(_a, _b).normalize();
    const base = this.vertexCount;
    this.#vertex(p0[0], p0[1], p0[2], _c.x, _c.y, _c.z, uv0[0], uv0[1], opt);
    this.#vertex(p1[0], p1[1], p1[2], _c.x, _c.y, _c.z, uv1[0], uv1[1], opt);
    this.#vertex(p2[0], p2[1], p2[2], _c.x, _c.y, _c.z, uv2[0], uv2[1], opt);
    this.indices.push(base, base + 1, base + 2);
    return this;
  }

  /**
   * Axis-aligned box (in the current transform frame).
   * @param {number} cx centre x
   * @param {number} cy BOTTOM y
   * @param {number} cz centre z
   * @param {number} sx size x
   * @param {number} sy size y
   * @param {number} sz size z
   * @param {object} [opt] base options + `texScale` (metres per tile repeat, number or [u,v])
   *   + `faces: { px, nx, py, ny, pz, nz }` (false to skip a face, or option overrides)
   */
  box(cx, cy, cz, sx, sy, sz, opt = {}) {
    const hx = sx / 2;
    const hz = sz / 2;
    const y0 = cy;
    const faces = opt.faces ?? {};
    const ts = opt.texScale;
    const tsu = ts ? (Array.isArray(ts) ? ts[0] : ts) : 0;
    const tsv = ts ? (Array.isArray(ts) ? ts[1] : ts) : 0;
    const rep = (w, h) => (ts ? [Math.max(w / tsu, 0.0001), Math.max(h / tsv, 0.0001)] : opt.rep);

    const face = (key, o, u, v, w, h) => {
      const f = faces[key];
      if (f === false) return;
      const fo = f ? { ...opt, ...f } : opt;
      if (f && f.rep) return this.quad(o, u, v, fo);
      // A face override with its own `texScale` tiles at that scale
      const fts = f && f.texScale;
      const fr = fts
        ? [
            Math.max(w / (Array.isArray(fts) ? fts[0] : fts), 0.0001),
            Math.max(h / (Array.isArray(fts) ? fts[1] : fts), 0.0001),
          ]
        : rep(w, h);
      this.quad(o, u, v, { ...fo, rep: fr });
    };

    face('px', [cx + hx, y0, cz + hz], [0, 0, -sz], [0, sy, 0], sz, sy);
    face('nx', [cx - hx, y0, cz - hz], [0, 0, sz], [0, sy, 0], sz, sy);
    face('pz', [cx - hx, y0, cz + hz], [sx, 0, 0], [0, sy, 0], sx, sy);
    face('nz', [cx + hx, y0, cz - hz], [-sx, 0, 0], [0, sy, 0], sx, sy);
    face('py', [cx - hx, y0 + sy, cz + hz], [sx, 0, 0], [0, 0, -sz], sx, sz);
    face('ny', [cx - hx, y0, cz - hz], [sx, 0, 0], [0, 0, sz], sx, sz);
    return this;
  }

  /**
   * Arbitrary 6-faced tapered/raked hexahedron (raked vehicle pillars, mansards, sloped hoods, ramps).
   * Bottom corners `[bFL, bFR, bBR, bBL]` and top corners `[tFL, tFR, tBR, tBL]` where:
   *   FL = (xMin, y, zMax), FR = (xMax, y, zMax), BR = (xMax, y, zMin), BL = (xMin, y, zMin).
   * Guaranteed outward CCW normals on all 6 faces.
   */
  prism(bFL, bFR, bBR, bBL, tFL, tFR, tBR, tBL, opt = {}) {
    const faces = opt.faces ?? {};
    // `texScale` (metres per tile repeat) tiles each face by its own edge lengths, as `box`
    const ts = opt.texScale;
    const tsu = ts ? (Array.isArray(ts) ? ts[0] : ts) : 0;
    const tsv = ts ? (Array.isArray(ts) ? ts[1] : ts) : 0;
    const len = (a, c) => Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const emit = (key, p0, p1, p2, p3) => {
      const f = faces[key];
      if (f === false) return;
      const fo = f ? { ...opt, ...f } : opt;
      const rep =
        ts && !fo.rep
          ? [Math.max(len(p0, p1) / tsu, 0.0001), Math.max(len(p0, p3) / tsv, 0.0001)]
          : fo.rep;
      this.quad4(p0, p1, p2, p3, rep ? { ...fo, rep } : fo);
    };
    emit('pz', bFL, bFR, tFR, tFL);
    emit('px', bFR, bBR, tBR, tFR);
    emit('nz', bBR, bBL, tBL, tBR);
    emit('nx', bBL, bFL, tFL, tBL);
    emit('py', tFL, tFR, tBR, tBL);
    emit('ny', bBL, bBR, bFR, bFL);
    return this;
  }

  /**
   * Vertical cylinder / tapered frustum along the Y axis (bollards, barrels, pots, café tables).
   */
  cylinderY(cx, y0, cz, rBottom, rTop, h, segs, sideOpt = {}, capOpt = sideOpt) {
    const y1 = y0 + h;
    // `texScale` (metres per tile repeat) tiles each side face by its size; without it every
    // narrow face took a whole tile (stone balusters and columns showed squashed blocks)
    const ts = sideOpt.texScale;
    const sideRep = ts
      ? [
          Math.max(
            (2 * Math.PI * Math.max(rBottom, rTop)) / segs / (Array.isArray(ts) ? ts[0] : ts),
            0.0001,
          ),
          Math.max(h / (Array.isArray(ts) ? ts[1] : ts), 0.0001),
        ]
      : null;
    const side = sideRep && !sideOpt.rep ? { ...sideOpt, rep: sideRep } : sideOpt;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      this.quad4(
        [cx + c1 * rBottom, y0, cz + s1 * rBottom],
        [cx + c0 * rBottom, y0, cz + s0 * rBottom],
        [cx + c0 * rTop, y1, cz + s0 * rTop],
        [cx + c1 * rTop, y1, cz + s1 * rTop],
        side,
      );
      if (rTop > 0.001 && capOpt !== false) {
        this.tri(
          [cx, y1, cz],
          [cx + c1 * rTop, y1, cz + s1 * rTop],
          [cx + c0 * rTop, y1, cz + s0 * rTop],
          [0.5, 0.5],
          [0.5 + c1 * 0.48, 0.5 + s1 * 0.48],
          [0.5 + c0 * 0.48, 0.5 + s0 * 0.48],
          capOpt,
        );
      }
    }
    return this;
  }

  /**
   * Cylinder along the X axis (wheels). Caps on both sides with proper radial UVs `[0..1]`.
   */
  cylinderX(cx, cy, cz, r, w, segs, opt = {}, capOpt = opt) {
    const hw = w / 2;
    const treadRepV = opt.rep ? opt.rep[1] : 1;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const y0 = c0 * r;
      const z0 = s0 * r;
      const y1 = c1 * r;
      const z1 = s1 * r;
      // side
      this.quad4(
        [cx - hw, cy + y0, cz + z0],
        [cx - hw, cy + y1, cz + z1],
        [cx + hw, cy + y1, cz + z1],
        [cx + hw, cy + y0, cz + z0],
        { ...opt, rep: [1, treadRepV] },
      );
      if (capOpt !== false) {
        const u0 = 0.5 + s0 * 0.48;
        const v0 = 0.5 + c0 * 0.48;
        const u1 = 0.5 + s1 * 0.48;
        const v1 = 0.5 + c1 * 0.48;
        this.tri(
          [cx + hw, cy, cz],
          [cx + hw, cy + y0, cz + z0],
          [cx + hw, cy + y1, cz + z1],
          [0.5, 0.5],
          [u0, v0],
          [u1, v1],
          capOpt,
        );
        this.tri(
          [cx - hw, cy, cz],
          [cx - hw, cy + y1, cz + z1],
          [cx - hw, cy + y0, cz + z0],
          [0.5, 0.5],
          [u1, v1],
          [u0, v0],
          capOpt,
        );
      }
    }
    return this;
  }

  /** Where the next vertex and index will go (for `backFaces`). */
  mark() {
    return { v: this.vertexCount, i: this.indices.length };
  }

  /**
   * The back of everything emitted since `mark`: the same vertices with the normals turned round
   * and every triangle wound the other way. The facade material culls back faces, so a surface
   * without thickness (a roof slope, a canopy) seen from behind would vanish and let the sky
   * show through; its back is an underside like any other.
   * @param {{ v: number, i: number }} mark
   * @param {{ shade?: number }} [opt] `shade` darkens the back's vertex colour
   */
  backFaces(mark, opt = {}) {
    const vc = this.vertexCount;
    const off = vc - mark.v;
    const shade = opt.shade ?? 1;
    for (let v = mark.v; v < vc; v++) {
      this.positions.push(
        this.positions[v * 3],
        this.positions[v * 3 + 1],
        this.positions[v * 3 + 2],
      );
      this.normals.push(-this.normals[v * 3], -this.normals[v * 3 + 1], -this.normals[v * 3 + 2]);
      this.uvs.push(this.uvs[v * 2], this.uvs[v * 2 + 1]);
      this.colors.push(
        this.colors[v * 3] * shade,
        this.colors[v * 3 + 1] * shade,
        this.colors[v * 3 + 2] * shade,
      );
      for (let k = 0; k < 4; k++) this.tiles.push(this.tiles[v * 4 + k]);
      this.data.push(this.data[v * 2], this.data[v * 2 + 1]);
    }
    const end = this.indices.length;
    for (let i = mark.i; i < end; i += 3) {
      this.indices.push(
        this.indices[i] + off,
        this.indices[i + 2] + off,
        this.indices[i + 1] + off,
      );
    }
    return this;
  }

  /**
   * Gabled roof prism with the ridge along Z; the slopes have undersides (`backFaces`).
   */
  gableZ(x0, x1, y, z0, z1, h, slopeOpt, gableOpt) {
    const xm = (x0 + x1) / 2;
    const L = z1 - z0;
    const a = xm - x0;
    const slopeLen = Math.hypot(a, h);
    const sts = slopeOpt.texScale ?? 1;
    const rep = [L / sts, slopeLen / sts];
    const m = this.mark();
    this.quad([x0, y, z0], [0, 0, L], [a, h, 0], { ...slopeOpt, rep });
    this.quad([x1, y, z1], [0, 0, -L], [-a, h, 0], { ...slopeOpt, rep });
    this.backFaces(m);

    const gts = gableOpt.texScale ?? 2;
    const w = x1 - x0;
    this.tri(
      [x0, y, z1],
      [x1, y, z1],
      [xm, y + h, z1],
      [0, 0],
      [w / gts, 0],
      [w / 2 / gts, h / gts],
      gableOpt,
    );
    this.tri(
      [x1, y, z0],
      [x0, y, z0],
      [xm, y + h, z0],
      [0, 0],
      [w / gts, 0],
      [w / 2 / gts, h / gts],
      gableOpt,
    );
    return this;
  }

  /** Builds an indexed BufferGeometry (returns null when empty). */
  build() {
    if (this.positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('aTile', new THREE.Float32BufferAttribute(this.tiles, 4));
    g.setAttribute('aData', new THREE.Float32BufferAttribute(this.data, 2));
    const vc = this.vertexCount;
    g.setIndex(
      vc > 65535
        ? new THREE.Uint32BufferAttribute(this.indices, 1)
        : new THREE.Uint16BufferAttribute(this.indices, 1),
    );
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
