/**
 * Street audit (`StreetAudit`): the whole 240 m loop as the taxi drives it.
 *
 * Every house is planned exactly as `BuildingFactory` plans it (`SpecPlanner.planBuilding` with
 * its neighbours' heights and roof lines), and the audit checks the street-level rules of the
 * redesign plan – the ones between houses and along the loop, which no single house breaks on
 * its own:
 *   - every house lot carries a spec (the factory refuses to build one without),
 *   - house numbers are even and rise by two from № 100 at Z 0; only a house spanning two lots
 *     skips numbers (№ 114 takes 112–116), shop signs never repeat,
 *   - two neighbours never share both roof type and cornice (they would read as one roof),
 *   - no three houses in a row stand to the same height (the silhouette is a wave),
 *   - neighbouring walls differ in colour, so the palette never runs together.
 * The rules of a single house (flats, entrances, ACs, fire escapes, openings) live in
 * `architecture/buildings.rules.test.js`, which takes its plans from `planStreet` here.
 *
 * Pure data, no three.js: `scripts/audit-street.js` writes the report and the street elevation
 * (`StreetElevation.js`).
 */
import { getBuildingSpec } from '../config/buildings/index.js';
import { LotType, StreetLayout, TOTAL_LOOP_CHUNKS } from '../simulation/street/StreetLayout.js';
import { lotRoofLine, lotTop, planBuilding } from './architecture/SpecPlanner.js';

/** Thresholds of the street rules. */
export const STREET_RULES = Object.freeze({
  /** Three neighbours whose tops lie within this read as one height. */
  sameHeight: 0.5,
  /**
   * Neighbouring walls of one material closer than this in OKLab read as one wall; walls of
   * different materials (brick courses beside ashlar) part at a smaller distance.
   */
  wallContrast: 0.05,
  wallContrastOtherTile: 0.03,
  /**
   * Neighbours whose close walls were reviewed and kept (reported as `info`): the hotel's pale
   * ashlar beside the bistro's cast iron painted as stone – the mansard and the arched windows
   * part them (decided 11.11.2026).
   */
  acceptedWalls: Object.freeze(['no146|no148']),
  /** The first house of the loop. */
  firstNumber: 100,
});

const HOUSE_TYPES = new Set([LotType.SHOP, LotType.HOUSE]);

/**
 * Every right-hand lot of the loop in driving order (Z 0 → 240) and every house on them,
 * planned as the factory plans it. `prev` / `next` are the lots either side of the house (for a
 * house spanning two lots, `next` stands after the second), across the loop's seam too.
 * @param {import('../core/Store.js').Store | null} [store]
 */
export function planStreet(store = null) {
  const lots = [];
  for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) lots.push(...StreetLayout.getChunk(c, store).right);
  const at = (i) => lots[((i % lots.length) + lots.length) % lots.length];

  const houses = [];
  lots.forEach((lot, i) => {
    const spec = getBuildingSpec(lot.spec);
    if (!spec) return;
    const spans = spec.extendsInto === 'next';
    const prev = at(i - 1);
    const next = at(spans ? i + 2 : i + 1);
    // The factory's neighbours: none on the right of a house spanning two lots
    const after = spans ? null : next;
    const plan = planBuilding(spec, lot, at(i + 1), {
      prevTop: lotTop(prev),
      nextTop: lotTop(after),
      prevRoof: lotRoofLine(prev),
      nextRoof: lotRoofLine(after),
    });
    const z0 = lot.zStart;
    const z1 = spans ? at(i + 1).zEnd : lot.zEnd;
    houses.push({
      id: lot.spec,
      lot,
      lots: spans ? [lot, at(i + 1)] : [lot],
      spec,
      plan,
      prev,
      next,
      z0,
      z1,
    });
  });
  return { lots, houses };
}

/** Linear sRGB → OKLab (Björn Ottosson). */
function oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance between two linear colours (OKLab, 0 = same, ~1 = black to white). */
export function colorDistance(a, b) {
  const p = oklab(a);
  const q = oklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The wall colour of a house as seen from the street: its upper storeys. */
export function wallOf(spec) {
  const w = spec.wall?.upper ?? spec.wall?.ground;
  return w ? { tile: w.tile, color: w.color } : null;
}

/** Linear colour → `#rrggbb` (sRGB). */
export function hexOf(c) {
  const enc = (v) => {
    const x = Math.min(1, Math.max(0, v));
    const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(s * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${c.map(enc).join('')}`;
}

/** One row of the report for a house. */
function houseEntry(h) {
  const { spec, plan } = h;
  const escapes = { front: 0, rear: 0, flank: 0 };
  for (const e of plan.escapes) escapes[e.side] = (escapes[e.side] ?? 0) + 1;
  const acs =
    plan.windows.filter((w) => w.kind === 'room' && w.cell.acBelow).length +
    plan.flanks.reduce((n, f) => n + f.windows.filter((w) => w.cell.acBelow).length, 0);
  return {
    kind: 'house',
    id: h.id,
    lotIds: h.lots.map((l) => l.id),
    type: h.lot.type,
    z0: h.z0,
    z1: h.z1,
    width: h.z1 - h.z0,
    number: spec.number,
    style: spec.style,
    floors: spec.floors.length,
    height: plan.height,
    top: plan.top,
    setback: plan.facadeX,
    roof: spec.roof.type,
    cornice: spec.cornice?.type ?? 'none',
    wall: wallOf(spec),
    shops: (spec.shops ?? []).map((s) => s.sign).filter(Boolean),
    flats: plan.dwellings,
    acs,
    escapes,
    partyWalls: plan.partyWalls.map((p) => (p.side < 0 ? 'left' : 'right')),
    flanks: plan.flanks.map((f) => (f.side < 0 ? 'left' : 'right')),
  };
}

const OPEN_NAMES = {
  [LotType.ALLEY]: 'service alley',
  [LotType.PARK]: 'pocket square',
  [LotType.BUS_STOP]: 'bus stop',
};

/**
 * Audits the loop.
 * @param {import('../core/Store.js').Store | null} [store]
 * @returns {{ entries: object[], findings: object[], summary: object, street: ReturnType<typeof planStreet> }}
 */
export function auditStreet(store = null) {
  const street = planStreet(store);
  const findings = [];
  const add = (severity, code, at, message) => findings.push({ severity, code, at, message });

  // The loop as a row of entries: houses and the open lots between them
  const byLot = new Map();
  for (const h of street.houses) for (const l of h.lots) byLot.set(l.id, h);
  const entries = [];
  for (const lot of street.lots) {
    const h = byLot.get(lot.id);
    if (h) {
      if (h.lot === lot) entries.push(houseEntry(h));
      continue;
    }
    if (HOUSE_TYPES.has(lot.type)) {
      add('error', 'no-spec', lot.id, `${lot.type} lot without a building spec`);
    }
    entries.push({
      kind: 'open',
      id: lot.id,
      lotIds: [lot.id],
      type: lot.type,
      name: OPEN_NAMES[lot.type] ?? lot.type,
      z0: lot.zStart,
      z1: lot.zEnd,
      width: lot.width,
    });
  }
  const houses = entries.filter((e) => e.kind === 'house');

  // Numbers: even, rising by two from № 100; a house spanning two lots skips the numbers between
  if (houses[0]?.number !== STREET_RULES.firstNumber) {
    add('error', 'first-number', houses[0]?.id, `the loop starts at № ${houses[0]?.number}`);
  }
  houses.forEach((e, i) => {
    if (e.number % 2 !== 0) add('error', 'odd-number', e.id, `№ ${e.number} is odd`);
    if (i === 0) return;
    const before = houses[i - 1];
    const step = e.number - before.number;
    const spans = (x) => x.lotIds.length > 1;
    if (step <= 0) {
      add('error', 'number-order', e.id, `№ ${e.number} follows № ${before.number}`);
    } else if (step > 2 && !spans(e) && !spans(before)) {
      add(
        'error',
        'number-gap',
        e.id,
        `numbers skipped between № ${before.number} and № ${e.number}`,
      );
    }
  });

  // Shop signs: one of each on the loop
  const signs = new Map();
  for (const e of houses) {
    for (const s of e.shops) {
      if (signs.has(s)) add('error', 'sign-repeat', e.id, `${s} again (first at ${signs.get(s)})`);
      else signs.set(s, e.id);
    }
  }

  // Neighbours side by side (an open lot between two houses parts them), across the seam too
  const pairs = [];
  entries.forEach((e, i) => {
    const n = entries[(i + 1) % entries.length];
    if (e.kind === 'house' && n.kind === 'house') pairs.push([e, n]);
  });
  const contrast = [];
  for (const [a, b] of pairs) {
    if (a.roof === b.roof && a.cornice === b.cornice) {
      add(
        'warn',
        'same-roof',
        b.id,
        `same ${a.roof} roof and ${a.cornice} cornice as № ${a.number}`,
      );
    }
    if (a.wall && b.wall) {
      const d = colorDistance(a.wall.color, b.wall.color);
      const sameTile = a.wall.tile === b.wall.tile;
      contrast.push({ a: a.id, b: b.id, distance: d, sameTile });
      const min = sameTile ? STREET_RULES.wallContrast : STREET_RULES.wallContrastOtherTile;
      if (d < min) {
        const accepted = STREET_RULES.acceptedWalls.includes(`${a.id}|${b.id}`);
        const note = `${b.wall.tile} within ${d.toFixed(3)} of № ${a.number}`;
        add(accepted ? 'info' : 'warn', 'same-wall', b.id, accepted ? `${note} (accepted)` : note);
      }
    }
  }

  // The silhouette: no run of three neighbours to one height
  entries.forEach((e, i) => {
    const run = [e, entries[(i + 1) % entries.length], entries[(i + 2) % entries.length]];
    if (run.some((x) => x.kind !== 'house')) return;
    const tops = run.map((x) => x.top);
    if (Math.max(...tops) - Math.min(...tops) < STREET_RULES.sameHeight) {
      add(
        'warn',
        'flat-silhouette',
        run[1].id,
        `№ ${run.map((x) => x.number).join(', ')} all stand to ${tops[1].toFixed(1)} m`,
      );
    }
  });

  const count = (s) => findings.filter((f) => f.severity === s).length;
  const tallest = houses.reduce((m, e) => (e.top > m.top ? e : m), houses[0]);
  const lowest = houses.reduce((m, e) => (e.top < m.top ? e : m), houses[0]);
  const summary = {
    lots: street.lots.length,
    houses: houses.length,
    shops: signs.size,
    openLots: entries.length - houses.length,
    flats: houses.reduce((n, e) => n + e.flats, 0),
    acs: houses.reduce((n, e) => n + e.acs, 0),
    frontEscapes: houses.reduce((n, e) => n + e.escapes.front + e.escapes.flank, 0),
    tallest: tallest && { id: tallest.id, number: tallest.number, top: tallest.top },
    lowest: lowest && { id: lowest.id, number: lowest.number, top: lowest.top },
    minWallContrast: Math.min(...contrast.map((c) => c.distance)),
    errors: count('error'),
    warnings: count('warn'),
    accepted: count('info'),
  };
  return { entries, findings, contrast, summary, street };
}

const fmt = (x, d = 2) => Number(x).toFixed(d);

/** Markdown report: the loop, the silhouette, the palette side by side and the findings. */
export function formatAuditReport(report) {
  const { summary: s } = report;
  const lines = [
    '# Pixel Street — street audit (generated by `npm run audit`)',
    '',
    `Lots: **${s.lots}** · houses: **${s.houses}** · shops: **${s.shops}** · open lots: **${s.openLots}** · ` +
      `dwellings: **${s.flats}** · ACs: **${s.acs}** · fire escapes on show: **${s.frontEscapes}**`,
    '',
    `Tallest № ${s.tallest.number} (${fmt(s.tallest.top, 1)} m) · lowest № ${s.lowest.number} ` +
      `(${fmt(s.lowest.top, 1)} m) · smallest wall contrast between neighbours: ${fmt(s.minWallContrast, 3)}`,
    '',
    `Errors: **${s.errors}** · warnings: **${s.warnings}** · accepted: **${s.accepted}**`,
    '',
    '## The loop',
    '',
    '| Z, m | № | Style | Storeys | Wall / top, m | Roof · cornice | Wall | Shop | Flats | AC | Escape | Party walls |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const e of report.entries) {
    const z = `${fmt(e.z0, 1)}–${fmt(e.z1, 1)}`;
    if (e.kind === 'open') {
      lines.push(`| ${z} | — | ${e.name} | | | | | | | | | |`);
      continue;
    }
    const esc = Object.entries(e.escapes)
      .filter(([, n]) => n > 0)
      .map(([side]) => side)
      .join(', ');
    const walls = [...e.partyWalls, ...e.flanks.map((f) => `${f} flank`)].join(', ');
    lines.push(
      `| ${z} | ${e.number} | ${e.style} | ${e.floors} | ${fmt(e.height, 1)} / ${fmt(e.top, 1)} | ` +
        `${e.roof} · ${e.cornice} | ${e.wall ? `${e.wall.tile} ${hexOf(e.wall.color)}` : '—'} | ` +
        `${e.shops.join(', ') || '—'} | ${e.flats} | ${e.acs} | ${esc || '—'} | ${walls || '—'} |`,
    );
  }

  lines.push('', '## Silhouette (top of each house, 1 █ = 1 m)', '', '```');
  for (const e of report.entries) {
    const label = e.kind === 'house' ? `№ ${e.number}` : `  ${e.name}`;
    const bar = e.kind === 'house' ? `${'█'.repeat(Math.round(e.top))} ${fmt(e.top, 1)}` : '';
    lines.push(`${label.padEnd(16)} ${bar}`);
  }
  lines.push('```', '', '## Walls side by side (OKLab distance)', '');
  lines.push('| Pair | Distance | Same tile |', '|---|---|---|');
  for (const c of report.contrast) {
    lines.push(`| ${c.a} · ${c.b} | ${fmt(c.distance, 3)} | ${c.sameTile ? 'yes' : 'no'} |`);
  }

  lines.push('', '## Findings', '');
  if (report.findings.length === 0) lines.push('None.');
  for (const f of report.findings)
    lines.push(`- **${f.severity}** \`${f.code}\` ${f.at}: ${f.message}`);
  return lines.join('\n');
}
