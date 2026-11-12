/**
 * No z-fighting on the street: coplanar faces that overlap and look different (`overlaps.js`),
 * and roof slopes without thickness that would vanish from below (`MeshBuilder.backFaces`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARAM_DEFS } from '../config/params.schema.js';
import { Store } from '../core/Store.js';
import { StreetLayout, TOTAL_LOOP_CHUNKS } from '../simulation/street/StreetLayout.js';
import { createFacadeAtlas } from '../textures/PixelCanvas.js';
import { BuildingFactory } from './BuildingFactory.js';
import { MeshBuilder } from './MeshBuilder.js';
import { findCoplanarOverlaps } from './overlaps.js';

let prevOffscreen;
let atlas;
beforeAll(() => {
  prevOffscreen = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return { imageSmoothingEnabled: true, fillStyle: '#000', fillRect() {} };
    }
  };
  atlas = createFacadeAtlas(3);
});
afterAll(() => {
  atlas.dispose();
  globalThis.OffscreenCanvas = prevOffscreen;
});

const RED = { tile: [0, 0, 0.1, 0.1], color: [1, 0, 0] };
const BLUE = { tile: [0.1, 0, 0.1, 0.1], color: [0, 0, 1] };

describe('coplanar overlap finder', () => {
  it('finds two different faces in one plane, not one a millimetre in front', () => {
    const b = new MeshBuilder();
    b.quad([0, 0, 0], [0, 0, 1], [0, 1, 0], RED);
    b.quad([0, 0.5, 0.5], [0, 0, 1], [0, 1, 0], BLUE);
    b.quad([-0.001, 0, 3], [0, 0, 1], [0, 1, 0], RED);
    b.quad([0, 0.5, 3.5], [0, 0, 1], [0, 1, 0], BLUE);
    const found = findCoplanarOverlaps(b.build(), { buried: false });
    expect(found.reduce((s, f) => s + f.area, 0)).toBeCloseTo(0.25, 3);
    for (const f of found) expect(f.at[2]).toBeGreaterThan(0.5);
    for (const f of found) expect(f.at[2]).toBeLessThan(1);
  });

  it('ignores faces buried inside a closed block', () => {
    const b = new MeshBuilder();
    // A plank whose front lies in the front of a block, but all of it inside the block's
    // extent: the block's own front covers it; the same plank sticking out is reported
    b.box(0.5, 0, 0, 1, 1, 1, RED);
    b.box(0.3, 0.2, 0, 0.6, 0.2, 0.4, BLUE);
    expect(findCoplanarOverlaps(b.build())).toHaveLength(1);
    const c = new MeshBuilder();
    c.box(0.5, 0, 0, 1, 1, 1, RED);
    c.box(0.6, 0.2, 0, 0.4, 0.2, 0.4, BLUE);
    expect(findCoplanarOverlaps(c.build())).toHaveLength(0);
  });

  it('every chunk of the loop is free of coplanar overlaps over 30 cm²', () => {
    const store = new Store(PARAM_DEFS);
    const factory = new BuildingFactory(atlas);
    const found = [];
    for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
      const g = factory.buildChunk(StreetLayout.getChunk(c, store), store);
      for (const geo of [g.solidGeometry, g.nearGeometry]) {
        if (!geo) continue;
        for (const f of findCoplanarOverlaps(geo, { minArea: 0.003, plain: [atlas.tiles.white] })) {
          found.push(`chunk ${c} at ${f.at.map((v) => v.toFixed(2)).join(', ')}`);
        }
      }
      g.solidGeometry.dispose();
      g.lightPoolGeometry?.dispose();
      g.nearGeometry?.dispose();
    }
    expect(found).toEqual([]);
  }, 60_000);
});

describe('surfaces without thickness', () => {
  it('backFaces copies the vertices with the normals turned and the winding reversed', () => {
    const b = new MeshBuilder();
    b.box(0, 0, 0, 1, 1, 1, RED);
    const m = b.mark();
    b.quad([0, 2, 0], [1, 0, 0], [0, 0, 1], BLUE);
    b.backFaces(m);
    expect(b.vertexCount).toBe(24 + 8);
    const n = b.normals;
    const [v0, v1] = [m.v, m.v + 4];
    for (let k = 0; k < 3; k++) expect(n[v1 * 3 + k]).toBeCloseTo(-n[v0 * 3 + k]);
    // Same corners, opposite winding
    const tri = b.indices.slice(-6, -3).map((i) => i - 4);
    expect(tri).toEqual([b.indices[36], b.indices[38], b.indices[37]]);
  });

  it('gable roofs have undersides', () => {
    const b = new MeshBuilder();
    b.gableZ(0, 2, 3, -1, 1, 1, RED, BLUE);
    // Two slopes, their undersides and the two gable ends
    expect(b.indices.length / 3).toBe(4 + 4 + 2);
  });
});
