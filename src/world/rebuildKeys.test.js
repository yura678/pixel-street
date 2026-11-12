import { describe, it, expect } from 'vitest';
import { PARAM_DEFS } from '../config/params.schema.js';
import { REGEN_KEYS as STREET_KEYS } from './StreetView.js';
import { REGEN_KEYS as PROFILE_KEYS } from './StreetProfileView.js';
import { REGATHER_KEYS as PUDDLE_KEYS } from './PuddleView.js';

/**
 * Forge writes `rebuild` parameters only when a slider is released: a parameter that makes the
 * street, its profile or the puddles rebuild must carry the mark, or every step of a drag would
 * rebuild them.
 */
describe('parameters that rebuild geometry', () => {
  it('are marked `rebuild` in the schema', () => {
    const keys = new Set([...STREET_KEYS, ...PROFILE_KEYS, ...PUDDLE_KEYS, 'street.drawChunks']);
    for (const key of keys) {
      expect(PARAM_DEFS[key], key).toBeDefined();
      expect(PARAM_DEFS[key].rebuild, key).toBe(true);
    }
  });
});
