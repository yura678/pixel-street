import { describe, it, expect } from 'vitest';
import { getBuildingSpec } from '../config/buildings/index.js';
import { LOOP_LENGTH } from '../simulation/street/StreetLayout.js';
import {
  STREET_RULES,
  auditStreet,
  colorDistance,
  formatAuditReport,
  hexOf,
  planStreet,
} from './StreetAudit.js';
import { planFarSidewalk } from './FarSidewalkPlan.js';
import { streetElevationSvg } from './StreetElevation.js';

const report = auditStreet(null);
const houses = report.entries.filter((e) => e.kind === 'house');

describe('StreetAudit — the 240 m loop', () => {
  it('covers the loop edge to edge in driving order', () => {
    expect(report.entries[0].z0).toBe(0);
    expect(report.entries.at(-1).z1).toBeCloseTo(LOOP_LENGTH, 9);
    for (let i = 1; i < report.entries.length; i++) {
      expect(report.entries[i].z0).toBeCloseTo(report.entries[i - 1].z1, 9);
    }
    expect(report.summary.houses).toBe(houses.length);
    expect(houses.length).toBeGreaterThanOrEqual(30);
  });

  it('plans every house as the factory does: № 114 spans the bus stop lot before № 118', () => {
    const { houses: planned } = planStreet(null);
    const no114 = planned.find((h) => h.id === 'no114');
    expect(no114.lots).toHaveLength(2);
    expect(no114.next.spec).toBe('no118');
    // The loop closes: № 166 stands before № 100
    expect(planned[0].prev.spec).toBe('no166');
    expect(planned.at(-1).next.spec).toBe('no100');
  });

  it('finds no errors: numbers, signs and specs are all in order', () => {
    const errors = report.findings.filter((f) => f.severity === 'error');
    expect(errors.map((f) => `${f.at}: ${f.code} — ${f.message}`)).toEqual([]);
    expect(report.summary.errors).toBe(0);
  });

  it('keeps the silhouette a wave and neighbouring roofs apart', () => {
    const codes = report.findings.map((f) => f.code);
    expect(codes).not.toContain('same-roof');
    expect(codes).not.toContain('flat-silhouette');
    // Storeys rise and fall: from one-storey taxpayers to five-storey tenements and the hotel
    const floors = houses.map((e) => e.floors);
    expect(Math.min(...floors)).toBe(1);
    expect(Math.max(...floors)).toBe(5);
  });

  it('measures every pair of neighbouring walls; close ones are reviewed or flagged', () => {
    expect(report.contrast.length).toBeGreaterThanOrEqual(houses.length - 3);
    for (const c of report.contrast) expect(c.distance).toBeGreaterThan(0);
    expect(report.summary.minWallContrast).toBeGreaterThan(STREET_RULES.wallContrastOtherTile);
    // № 146 | № 148 were reviewed and kept: reported, but not as a warning
    const pair = report.findings.find((f) => f.code === 'same-wall' && f.at === 'no148');
    expect(pair?.severity).toBe('info');
    expect(report.summary.warnings).toBe(0);
  });

  it('reports the same shop signs as the specs', () => {
    const signs = houses.flatMap((e) => e.shops);
    const fromSpecs = houses.flatMap((e) =>
      (getBuildingSpec(e.id).shops ?? []).map((s) => s.sign).filter(Boolean),
    );
    expect(signs).toEqual(fromSpecs);
    expect(report.summary.shops).toBe(new Set(signs).size);
  });

  it('writes a markdown report and an elevation with every house', () => {
    const md = formatAuditReport(report);
    expect(md).toContain('# Pixel Street — street audit');
    expect(md).toContain('Errors: **0**');
    for (const e of houses) expect(md).toContain(`| ${e.number} |`);
    const svg = streetElevationSvg(report);
    expect(svg.startsWith('<svg')).toBe(true);
    for (const e of houses) expect(svg).toContain(`<g id="${e.id}">`);
    expect(svg).not.toContain('NaN');
    // The far sidewalk's trees and lamps in front of the houses: one crown per tree
    const side = planFarSidewalk({ seed: 1, density: 0.55 });
    const trees = svg.slice(svg.indexOf('<g id="street-trees">'));
    expect(trees.match(/<ellipse /g)).toHaveLength(side.trees.length);
    expect(svg).toContain('<g id="street-lamps">');
  });
});

describe('Colour helpers', () => {
  it('measure perceptual distance and encode sRGB', () => {
    expect(colorDistance([0.5, 0.4, 0.3], [0.5, 0.4, 0.3])).toBe(0);
    expect(colorDistance([0, 0, 0], [1, 1, 1])).toBeCloseTo(1, 2);
    expect(hexOf([1, 1, 1])).toBe('#ffffff');
    expect(hexOf([0, 0, 0])).toBe('#000000');
    // Linear 0.2159 is sRGB 128/255
    expect(hexOf([0.2159, 0.2159, 0.2159])).toBe('#808080');
  });
});
