#!/usr/bin/env node
/**
 * Geometry checks of the street without a browser (building redesign plan, «Перевірка»).
 *
 *   npm run geometry -- snapshot <name>   every chunk's geometry (street seeds 1, 7, 42;
 *                                         chunks −1…12: houses `solid`, light `pools`, the
 *                                         near sidewalk `near`, curbs, gutters and sidewalks
 *                                         `profile`) and the asphalt ribbon (`road`) into
 *                                         `.geometry/<name>/`
 *   npm run geometry -- compare <a> <b>   two snapshots attribute by attribute: which chunks
 *                                         differ and by how much (`--tol=1e-5` for floats)
 *   npm run geometry -- tris              triangles per chunk of the loop, `solid + near`
 *                                         (budget: 60k together)
 *   npm run geometry -- atlas             occupancy of the facade atlas at 64 px: where new
 *                                         tiles still fit
 *
 * A refactor must leave `compare` at SAME. A chunk's redesign changes that chunk and at most
 * the party-wall flashing of its neighbours (they meet the new roofs).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = resolve(root, '.geometry');
const [cmd, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(
  rest.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')),
);
const names = rest.filter((a) => !a.startsWith('--'));

// The atlas paints into canvases; geometry only needs its tile rectangles
globalThis.OffscreenCanvas = class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return new Proxy(
      {},
      {
        get: (t, k) => (k in t ? t[k] : () => ({ data: new Uint8ClampedArray(4) })),
        set: (t, k, v) => ((t[k] = v), true),
      },
    );
  }
};

/** The street modules, loaded after the canvas stub is in place. */
async function street() {
  const { Store } = await import('../src/core/Store.js');
  const { PARAM_DEFS } = await import('../src/config/params.schema.js');
  const { StreetLayout, TOTAL_LOOP_CHUNKS } =
    await import('../src/simulation/street/StreetLayout.js');
  const { createFacadeAtlas } = await import('../src/textures/PixelCanvas.js');
  const { BuildingFactory } = await import('../src/world/BuildingFactory.js');
  const { buildProfileChunk } = await import('../src/world/StreetProfileView.js');
  return {
    Store,
    PARAM_DEFS,
    StreetLayout,
    TOTAL_LOOP_CHUNKS,
    createFacadeAtlas,
    BuildingFactory,
    buildProfileChunk,
  };
}

/**
 * The asphalt ribbon (`RoadView`), named by mesh: snapshot "chunk"
 * `road` (it follows the taxi, so it does not depend on the street seed).
 * @param {(key: string, a: ArrayLike<number>) => void} write
 */
async function snapshotRoad(write) {
  const THREE = await import('three/webgpu');
  const { Store } = await import('../src/core/Store.js');
  const { PARAM_DEFS } = await import('../src/config/params.schema.js');
  const { WorldUniforms } = await import('../src/rendering/uniforms/WorldUniforms.js');
  const { RoadView } = await import('../src/world/RoadView.js');
  const st = new Store(PARAM_DEFS);
  const road = new RoadView(new THREE.Scene(), st, new WorldUniforms(st));
  road.group.traverse((mesh) => {
    const geo = mesh.geometry;
    if (!geo) return;
    const attrs = Object.keys(geo.attributes).sort();
    for (const attr of geo.index ? [...attrs, 'index'] : attrs) {
      write(
        `s0_croad_${mesh.name}_${attr}`,
        attr === 'index' ? geo.index.array : geo.attributes[attr].array,
      );
    }
  });
  road.dispose();
}

async function snapshot(name) {
  if (!name) throw new Error('Usage: npm run geometry -- snapshot <name>');
  const s = await street();
  const dir = resolve(store, name);
  mkdirSync(dir, { recursive: true });
  const atlas = s.createFacadeAtlas(3);
  const meta = {};
  await snapshotRoad((key, a) => {
    writeFileSync(resolve(dir, `${key}.bin`), Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    meta[key] = { type: a.constructor.name, n: a.length };
  });
  for (const seed of [1, 7, 42]) {
    const st = new s.Store(s.PARAM_DEFS);
    st.set('street.seed', seed);
    const factory = new s.BuildingFactory(atlas);
    for (let c = -1; c < 13; c++) {
      const layout = s.StreetLayout.getChunk(c, st);
      const g = factory.buildChunk(layout, st);
      for (const [part, geo] of [
        ['solid', g.solidGeometry],
        ['pools', g.lightPoolGeometry],
        ['near', g.nearGeometry],
        ['profile', s.buildProfileChunk(layout)],
      ]) {
        if (!geo) continue;
        const attrs = Object.keys(geo.attributes).sort();
        for (const attr of geo.index ? [...attrs, 'index'] : attrs) {
          const a = attr === 'index' ? geo.index.array : geo.attributes[attr].array;
          const key = `s${seed}_c${c}_${part}_${attr}`;
          writeFileSync(
            resolve(dir, `${key}.bin`),
            Buffer.from(a.buffer, a.byteOffset, a.byteLength),
          );
          meta[key] = { type: a.constructor.name, n: a.length };
        }
        geo.dispose();
      }
    }
  }
  writeFileSync(resolve(dir, 'meta.json'), JSON.stringify(meta));
  console.log(`${Object.keys(meta).length} arrays → .geometry/${name}/`);
}

const ARRAYS = { Float32Array, Uint32Array, Uint16Array };

function load(dir, key, type) {
  const buf = readFileSync(resolve(dir, `${key}.bin`));
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return new ARRAYS[type](bytes.buffer);
}

function compare(a, b) {
  if (!a || !b) throw new Error('Usage: npm run geometry -- compare <a> <b> [--tol=1e-5]');
  const tol = Number(flags.tol ?? 1e-5);
  const da = resolve(store, a);
  const db = resolve(store, b);
  const ma = JSON.parse(readFileSync(resolve(da, 'meta.json'), 'utf8'));
  const mb = JSON.parse(readFileSync(resolve(db, 'meta.json'), 'utf8'));
  /** chunk → what differs in it (any seed) */
  const byChunk = new Map();
  const note = (key, what) => {
    const [, chunk] = key.match(/_c(-?\d+|road)_/);
    const [, , part, attr] = key.split('_');
    if (!byChunk.has(chunk)) byChunk.set(chunk, new Set());
    byChunk.get(chunk).add(attr === '*' ? `${part} ${what}` : `${part}.${attr} ${what}`);
  };
  let worst = 0;
  for (const key of Object.keys(ma).sort()) {
    const A = ma[key];
    const B = mb[key];
    if (!B) {
      note(key, 'missing');
      continue;
    }
    if (A.n !== B.n || A.type !== B.type) {
      note(key.replace(/_[^_]+$/, '_*'), 'vertex / index count changed');
      continue;
    }
    const x = load(da, key, A.type);
    const y = load(db, key, B.type);
    let d = 0;
    for (let i = 0; i < x.length; i++) d = Math.max(d, Math.abs(x[i] - y[i]));
    if (A.type === 'Float32Array') worst = Math.max(worst, d);
    if (d > (A.type === 'Float32Array' ? tol : 0)) note(key, `Δ ${d.toPrecision(3)}`);
  }
  // The road (`croad`) sorts after the numbered chunks
  const order = (c) => (c === 'road' ? Infinity : Number(c));
  const chunks = [...byChunk.keys()].sort((p, q) => order(p) - order(q));
  for (const c of chunks) console.log(`chunk ${c}: ${[...byChunk.get(c)].join(', ')}`);
  console.log(
    chunks.length === 0
      ? `SAME (${Object.keys(ma).length} arrays, worst float Δ ${worst.toExponential(2)})`
      : `DIFFERENT in chunks ${chunks.join(', ')}`,
  );
}

async function tris() {
  const s = await street();
  const st = new s.Store(s.PARAM_DEFS);
  const factory = new s.BuildingFactory(s.createFacadeAtlas(3));
  const row = [];
  for (let c = 0; c < s.TOTAL_LOOP_CHUNKS; c++) {
    const g = factory.buildChunk(s.StreetLayout.getChunk(c, st), st);
    const near = g.nearGeometry ? g.nearGeometry.index.count / 3 : 0;
    row.push(
      `c${c}: ${(g.solidGeometry.index.count / 3 / 1000).toFixed(1)}k + ${(near / 1000).toFixed(1)}k`,
    );
    g.solidGeometry.dispose();
    g.lightPoolGeometry?.dispose();
    g.nearGeometry?.dispose();
  }
  console.log(row.join('  '));
}

async function atlasMap() {
  const { createFacadeAtlas } = await street();
  const atlas = createFacadeAtlas(3);
  const cells = 32; // 64 px cells of the 2048 px atlas
  const grid = Array.from({ length: cells }, () => Array(cells).fill('.'));
  const regions = [...Object.values(atlas.tiles), ...atlas.signs.values()];
  for (const [u, v, w, h] of regions) {
    const x0 = Math.floor(u * cells + 1e-6);
    const y0 = Math.floor(v * cells + 1e-6);
    const x1 = Math.ceil((u + w) * cells - 1e-6);
    const y1 = Math.ceil((v + h) * cells - 1e-6);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[y][x] = '#';
  }
  console.log('128 px cells: column 0–15 across, row 0–15 down (half rows .5); # used, . free');
  console.log('     ' + Array.from({ length: 16 }, (_, i) => String(i).padEnd(2)).join(''));
  grid.forEach((row, y) => console.log(String(y / 2).padStart(4) + ' ' + row.join('')));
}

async function overlaps() {
  const s = await street();
  const { findCoplanarOverlaps } = await import('../src/world/overlaps.js');
  const { MeshBuilder } = await import('../src/world/MeshBuilder.js');
  // Tag every triangle with the builder function that emitted it
  const tags = new WeakMap();
  let depth = 0;
  for (const m of ['quad', 'quad4', 'tri', 'triN']) {
    const fn = MeshBuilder.prototype[m];
    MeshBuilder.prototype[m] = function (...args) {
      if (depth > 0) return fn.apply(this, args);
      const before = this.indices.length / 3;
      depth++;
      try {
        fn.apply(this, args);
      } finally {
        depth--;
      }
      const frame = new Error().stack
        .split('\n')
        .slice(1)
        .find((l) => !/MeshBuilder\.js|primitives\.js|geometry\.js/.test(l));
      const tag = (frame ?? '?')
        .trim()
        .replace(/^at /, '')
        .replace(/\(.*[\\/]/, '(')
        .replace(/:\d+\)$/, ')');
      if (!tags.has(this)) tags.set(this, []);
      const list = tags.get(this);
      for (let i = before; i < this.indices.length / 3; i++) list[i] = tag;
      return this;
    };
  }
  const build = MeshBuilder.prototype.build;
  MeshBuilder.prototype.build = function () {
    const g = build.call(this);
    if (g) g.userData.tags = tags.get(this) ?? [];
    return g;
  };
  const minArea = Number(flags.min ?? 2) * 1e-4;
  const st = new s.Store(s.PARAM_DEFS);
  const atlas = s.createFacadeAtlas(3);
  const factory = new s.BuildingFactory(atlas);
  const tileName = new Map(
    [...Object.entries(atlas.tiles)].map(([k, r]) => [r.map((x) => x.toFixed(5)).join(), k]),
  );
  const nameOf = (t) => tileName.get(t.map((x) => x.toFixed(5)).join()) ?? 'sign';
  const only = flags.chunk !== undefined ? Number(flags.chunk) : null;
  let total = 0;
  for (let c = 0; c < s.TOTAL_LOOP_CHUNKS; c++) {
    if (only !== null && c !== only) continue;
    const layout = s.StreetLayout.getChunk(c, st);
    const g = factory.buildChunk(layout, st);
    for (const [part, geo] of [
      ['solid', g.solidGeometry],
      ['near', g.nearGeometry],
    ]) {
      if (!geo) continue;
      const found = findCoplanarOverlaps(geo, {
        opposite: flags.opposite !== undefined,
        minArea,
        gap: flags.gap ? Number(flags.gap) / 1000 : undefined,
        plain: [atlas.tiles.white],
      });
      total += found.length;
      for (const f of found) {
        const lot = layout.right.find(
          (l) => f.at[2] + layout.zStart >= l.zStart && f.at[2] + layout.zStart < l.zEnd,
        );
        console.log(
          `c${c} ${part} ${lot?.spec ?? lot?.type ?? '-'} at (${f.at.map((v) => v.toFixed(2)).join(', ')})` +
            ` n(${f.n.map((v) => v.toFixed(2)).join(', ')}) gap ${(f.gap * 1000).toFixed(1)} mm` +
            ` ${(f.area * 1e4).toFixed(0)} cm²  ${nameOf(f.tiles[0])} | ${nameOf(f.tiles[1])}  ${geo.userData.tags[f.tris[0]]} | ${geo.userData.tags[f.tris[1]]}`,
        );
      }
    }
    g.solidGeometry.dispose();
    g.lightPoolGeometry?.dispose();
    g.nearGeometry?.dispose();
  }
  console.log(`${total} coplanar overlaps`);
}

const commands = { snapshot, compare, tris, atlas: atlasMap, overlaps };
if (!commands[cmd]) {
  console.log('Usage: npm run geometry -- snapshot <name> | compare <a> <b> | tris | atlas');
  process.exitCode = 1;
} else {
  Promise.resolve(commands[cmd](...names)).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
