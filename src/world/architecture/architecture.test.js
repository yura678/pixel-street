import { describe, it, expect } from 'vitest';
import { FlatPlan } from './FlatPlanner.js';
import { stairCoreAxes } from './Facade.js';

describe('Facade grid', () => {
  it('places evenly spaced wing axes around a central stair core', () => {
    const { axes, stair, bayW, zC } = stairCoreAxes(-10, 10, 0.75, 2.8, 4);
    expect(axes).toHaveLength(9);
    expect(stair).toBe(4);
    expect(axes[stair]).toBe(zC);
    expect(zC).toBe(0);
    // Symmetric about the stair, one bay apart inside each wing
    for (let i = 0; i < 4; i++) expect(axes[i]).toBeCloseTo(-axes[8 - i], 9);
    expect(axes[1] - axes[0]).toBeCloseTo(bayW, 9);
    expect(axes[0] - bayW * 0.5).toBeCloseTo(-10 + 0.75, 9);
  });
});

describe('FlatPlanner', () => {
  const rooms = { 0: 'bedroom', 1: 'living', 2: 'kitchen' };
  const plan = new FlatPlan({
    flats: [
      { id: 'A1', floor: 1, rooms, dress: ['curtain', 'plum'], lit: ['living'] },
      { id: 'A2', floor: 2, rooms, dress: ['sheer', 'cream'], lit: [] },
    ],
    stair: { axis: 3, floors: [1, 2] },
    escapes: [[0, 1]],
    acUnder: [
      [0, 1],
      [2, 2],
    ],
    flowerBoxes: [
      [1, 2],
      [2, 1],
    ],
  });

  it('resolves rooms, dressing and lighting per window', () => {
    expect(plan.cell(1, 1)).toMatchObject({ type: 'room', flat: 'A1', room: 'living' });
    expect(plan.cell(1, 1)).toMatchObject({ glazing: 'curtain', fabric: 'plum', lit: true });
    expect(plan.cell(0, 2)).toMatchObject({ glazing: 'sheer', fabric: 'cream', lit: false });
  });

  it('dresses kitchens with a linen blind and keeps stair and shop cells apart', () => {
    expect(plan.cell(2, 1)).toMatchObject({ room: 'kitchen', glazing: 'blind', fabric: 'linen' });
    expect(plan.cell(3, 1).type).toBe('stair');
    expect(plan.cell(3, 0).type).toBe('none');
    expect(plan.cell(1, 0).type).toBe('none');
  });

  it('never hangs an AC or a flower box behind a fire-escape landing', () => {
    expect(plan.underEscape(0, 1)).toBe(true);
    expect(plan.underEscape(0, 0)).toBe(false);
    expect(plan.cell(0, 1).acBelow).toBe(false);
    expect(plan.cell(1, 2).flowers).toBe(false);
    expect(plan.cell(2, 2).acBelow).toBe(true);
    expect(plan.cell(2, 1).flowers).toBe(true);
  });
});

describe('Parts showcase', () => {
  it('builds every stand with sound geometry (no NaN, no degenerate faces)', async () => {
    const prev = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = class {
      constructor(w, h) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return { imageSmoothingEnabled: true, fillStyle: '#000', fillRect() {} };
      }
    };
    const { createFacadeAtlas } = await import('../../textures/PixelCanvas.js');
    const { buildShowcaseGeometry } = await import('../PartsShowcase.js');
    const atlas = createFacadeAtlas(3);
    const g = buildShowcaseGeometry(atlas);
    expect(g.stands.length).toBeGreaterThanOrEqual(13);
    const pos = g.solidGeometry.getAttribute('position').array;
    const nrm = g.solidGeometry.getAttribute('normal').array;
    for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i])).toBe(true);
    let degenerate = 0;
    for (let i = 0; i < nrm.length; i += 3) {
      const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]);
      if (l < 0.99 || l > 1.01) degenerate++;
    }
    expect(degenerate).toBe(0);
    // Every stand put geometry inside its own span
    for (const s of g.stands) {
      let hits = 0;
      for (let i = 2; i < pos.length; i += 3) if (pos[i] >= s.z0 - 1 && pos[i] <= s.z1 + 1) hits++;
      expect(hits, s.id).toBeGreaterThan(100);
    }
    g.solidGeometry.dispose();
    g.lightPoolGeometry?.dispose();
    atlas.dispose();
    globalThis.OffscreenCanvas = prev;
  });
});
