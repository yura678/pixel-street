import { describe, it, expect } from 'vitest';
import { StreetLayout, LotType, TOTAL_LOOP_CHUNKS, LOOP_LENGTH } from './StreetLayout.js';
import { Store } from '../../core/Store.js';
import { PARAM_DEFS } from '../../config/params.schema.js';
import { CHUNK_LENGTH, STOP_CHUNK_OFFSET } from '../../config/constants.js';

describe('StreetLayout', () => {
  const store = new Store(PARAM_DEFS);

  it('generates deterministic chunk layouts', () => {
    expect(StreetLayout.getChunk(5, store)).toEqual(StreetLayout.getChunk(5, store));
  });

  it('repeats the loop every 12 chunks, shifted by its length', () => {
    const a = StreetLayout.getChunk(3, store);
    const b = StreetLayout.getChunk(3 + TOTAL_LOOP_CHUNKS, store);
    expect(b.right.map((l) => l.spec)).toEqual(a.right.map((l) => l.spec));
    expect(b.right[0].zStart - a.right[0].zStart).toBeCloseTo(LOOP_LENGTH, 9);
  });

  it('fills every chunk edge to edge with lots', () => {
    for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
      const chunk = StreetLayout.getChunk(c, store);
      expect(chunk.right[0].zStart).toBeCloseTo(chunk.zStart, 9);
      expect(chunk.right.at(-1).zEnd).toBeCloseTo(chunk.zStart + CHUNK_LENGTH, 9);
      for (const lot of chunk.right) expect(lot.width).toBeCloseTo(lot.zEnd - lot.zStart, 9);
    }
  });

  it('places a bus stop on the right side of the scheduled chunk', () => {
    const stopChunk = StreetLayout.getChunk(STOP_CHUNK_OFFSET, store);
    const rightBusStop = stopChunk.right.find((lot) => lot.type === LotType.BUS_STOP);
    expect(rightBusStop).toBeDefined();
    expect(rightBusStop.side).toBe('right');
  });

  it('gives every house lot a building spec and the alley none', () => {
    for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
      for (const lot of StreetLayout.getChunk(c, store).right) {
        if (lot.type === LotType.SHOP || lot.type === LotType.HOUSE) {
          expect(lot.spec, lot.id).toMatch(/^no1\d\d$/);
        } else if (lot.type === LotType.ALLEY) {
          expect(lot.spec, lot.id).toBeNull();
        }
      }
    }
  });

  it('closes the loop: chunk 0 and chunk 11 are each other’s neighbours across the seam', () => {
    const first = StreetLayout.getChunk(0, null);
    const last = StreetLayout.getChunk(11, null);
    const before = StreetLayout.neighbourLots(first, 0, null).prev;
    const after = StreetLayout.neighbourLots(last, last.right.length - 1, null).next;
    // № 166 stands before № 100 and № 100 after № 166, at the same seam
    expect(before.spec).toBe('no166');
    expect(before.zEnd).toBe(first.zStart);
    expect(after.spec).toBe('no100');
    expect(after.zStart).toBe(last.zEnd);
    // The next loop round (chunk 12) sees the same lots
    expect(StreetLayout.neighbourLots(StreetLayout.getChunk(12, null), 0, null).prev.spec).toBe(
      'no166',
    );
  });
});
