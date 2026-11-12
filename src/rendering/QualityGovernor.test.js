import { describe, it, expect } from 'vitest';
import { QualityGovernor, detectTier, tierOf } from './QualityGovernor.js';
import { QUALITY_LADDER, QUALITY_TIERS, TIER_NAMES } from '../config/qualityTiers.js';

/**
 * A made-up GPU: the frame time of each rung (ms), optionally pinned to a vsync interval. The
 * GPU "finishes" old frames right away, so `resume` follows each change.
 */
function simulate(gov, costOf, seconds, { vsync = 0, start = 0 } = {}) {
  let now = start;
  const changes = [];
  const end = start + seconds * 1000;
  while (now < end) {
    let ms = costOf(gov.level, now);
    if (vsync) ms = Math.ceil(ms / vsync - 1e-9) * vsync;
    now += ms;
    const level = gov.sample(ms, now);
    if (level !== null) {
      changes.push({ at: Math.round(now), level });
      gov.resume(now);
    }
  }
  return { now, changes };
}

/** Frame times of the ladder measured on an Intel UHD at 1600×900 (Stage 9). */
const UHD = [55.6, 46, 31.6, 23.9, 16.6];

describe('quality tiers', () => {
  it('detects the device class', () => {
    expect(detectTier({ coarsePointer: true, cores: 4 })).toBe('low');
    expect(detectTier({ coarsePointer: true, cores: 8, memoryGb: 2 })).toBe('low');
    expect(detectTier({ coarsePointer: true, cores: 8, memoryGb: 8 })).toBe('medium');
    expect(detectTier({ coarsePointer: false, cores: 2 })).toBe('low');
    expect(detectTier({ coarsePointer: false, cores: 4 })).toBe('medium');
    expect(detectTier({ coarsePointer: false, cores: 12, memoryGb: null })).toBe('high');
  });

  it('every tier is complete and starts on the ladder', () => {
    expect(Object.keys(QUALITY_TIERS).sort()).toEqual([...TIER_NAMES].sort());
    for (const name of TIER_NAMES) {
      const t = QUALITY_TIERS[name];
      expect([0, 4]).toContain(t.msaa);
      expect(t.startLevel).toBeGreaterThanOrEqual(0);
      expect(t.startLevel).toBeLessThan(QUALITY_LADDER.length);
      expect(t.maxDpr).toBeGreaterThanOrEqual(1);
    }
    expect(tierOf('nonsense')).toBe(QUALITY_TIERS.high);
  });

  it('the ladder only ever gets cheaper', () => {
    for (let i = 1; i < QUALITY_LADDER.length; i++) {
      expect(QUALITY_LADDER[i].renderScale).toBeLessThanOrEqual(QUALITY_LADDER[i - 1].renderScale);
      expect(QUALITY_LADDER[i].particles).toBeLessThanOrEqual(QUALITY_LADDER[i - 1].particles);
    }
    expect(QUALITY_LADDER[0]).toMatchObject({ renderScale: 1, particles: 1 });
  });
});

describe('QualityGovernor', () => {
  it('stays put when the frames fit the budget', () => {
    const gov = new QualityGovernor();
    const { changes } = simulate(gov, () => 9, 60);
    expect(changes).toEqual([]);
    expect(gov.level).toBe(0);
  });

  it('walks a slow GPU down to the rung that keeps 60 FPS, quickly', () => {
    const gov = new QualityGovernor();
    const { changes } = simulate(gov, (l) => UHD[l], 30);
    expect(gov.level).toBe(4); // 16.6 ms
    // Over twice the budget: two rungs at once (55.6 → 31.6 ms), then one at a time
    expect(changes.slice(0, 3).map((c) => c.level)).toEqual([2, 3, 4]);
    expect(changes[2].at).toBeLessThan(8000);
    // 16.6 ms just fits, which looks the same as frames pinned by vsync: now and then it
    // probes the rung above, and each failed probe doubles the wait before the next
    const probes = changes.slice(3).filter((c) => c.level === 3);
    expect(probes.length).toBeLessThanOrEqual(2);
  });

  it('aims at the target frame rate', () => {
    const gov = new QualityGovernor({ targetFps: 30 });
    simulate(gov, (l) => UHD[l], 30);
    expect(gov.level).toBe(2); // 31.6 ms ≤ 33.3 × 1.15
  });

  it('ignores hitches: a rare long frame does not step down', () => {
    const gov = new QualityGovernor();
    // 10 ms frames, and every 2 s one 900 ms frame (a chunk built, a shader compiled)
    const { changes } = simulate(gov, (_l, now) => (now % 2000 < 10 ? 900 : 10), 30);
    expect(changes).toEqual([]);
  });

  it('steps back up when the scene gets cheaper', () => {
    const gov = new QualityGovernor();
    let heavy = true;
    const cost = (l) => (heavy ? UHD[l] : UHD[l] / 4);
    const t = simulate(gov, cost, 20);
    expect(gov.level).toBe(4);
    heavy = false;
    simulate(gov, cost, 60, { start: t.now });
    expect(gov.level).toBe(0);
  });

  it('under vsync probes upwards and backs off from a rung that fails', () => {
    // 60 Hz display; rung 3 fits (11 ms → shown as 16.7), rung 2 does not (19 ms → 33.3)
    const gov = new QualityGovernor({ level: 3 });
    const cost = (l) => [40, 30, 19, 11, 8][l];
    const { changes } = simulate(gov, cost, 300, { vsync: 1000 / 60 });
    const ups = changes.filter((c, i) => c.level < (i ? changes[i - 1].level : 3));
    // It tries rung 2 now and then, fails each time, and each failure doubles the wait
    expect(ups.length).toBeGreaterThanOrEqual(3);
    expect(ups.length).toBeLessThanOrEqual(7);
    const gaps = ups.slice(1).map((u, i) => u.at - ups[i].at);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    expect(gov.level).toBe(3);
  });

  it('holds still after a change until the GPU has caught up', () => {
    const gov = new QualityGovernor();
    let now = 0;
    let changed = null;
    while (changed === null && now < 10_000) {
      now += 50;
      changed = gov.sample(50, now);
    }
    expect(changed).toBe(2);
    expect(gov.holding).toBe(true);
    // Seconds of old, slow frames still coming out of the GPU queue: ignored
    for (let i = 0; i < 100; i++) expect(gov.sample(50, (now += 50))).toBe(null);
    expect(gov.level).toBe(2);
    gov.resume(now);
    expect(gov.holding).toBe(false);
  });

  it('can be set to a rung and retargeted', () => {
    const gov = new QualityGovernor({ level: 9 });
    expect(gov.level).toBe(gov.maxLevel);
    gov.setLevel(-3);
    expect(gov.level).toBe(0);
    expect(gov.rung).toBe(QUALITY_LADDER[0]);
    gov.setTarget(30);
    expect(gov.budget).toBeCloseTo(33.33, 1);
  });
});
