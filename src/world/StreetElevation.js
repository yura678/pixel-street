/**
 * Street elevation (`StreetElevation`): the whole loop drawn flat, as from a far camera across
 * the road – every facade in its wall colours, its crown and roof, its openings from
 * `SpecPlanner.openingsOf`, its number and shop sign. Three rows of 80 m, so the silhouette
 * wave and the palette of neighbours can be read side by side. In front of the facades the far
 * sidewalk's street trees (trunk and crown, see-through) and street lamps at the default seed
 * and tree density (`FarSidewalkPlan`), so their rhythm can be read against the houses. Pure
 * string building (SVG), no three.js; `scripts/audit-street.js` writes it to
 * `docs/STREET_ELEVATION.svg`.
 */
import { openingsOf } from './architecture/SpecPlanner.js';
import { planFarSidewalk } from './FarSidewalkPlan.js';
import { LAMP_HEAD } from './StreetTreePlan.js';
import { hexOf } from './StreetAudit.js';

const PX = 12; // pixels per metre
const ROW_M = 80; // metres of street per row
const SKY_M = 20; // metres of height drawn
const MARGIN = 24;
const LABELS = 40;
const ROW_H = SKY_M * PX + LABELS;
const SLATE = [0.06, 0.07, 0.09];
const GLASS = '#1c232b';
const SHOPFRONT = '#33281f';

/** Darker version of a linear colour. */
const shade = (c, k) => c.map((v) => v * k);
/** Text for an SVG element. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Crown and roof of a house over its wall head `h` up to `top`, as polygons in street metres
 * (`[z, y]` points).
 */
function roofShapes(spec, z0, z1, h, top) {
  const roof = spec.roof;
  const zc = (z0 + z1) * 0.5;
  const wall = (spec.wall?.upper ?? spec.wall?.ground)?.color ?? [0.5, 0.4, 0.3];
  const trim = spec.cornice?.color ?? spec.wall?.trim ?? shade(wall, 0.8);
  const slate = roof.color ?? SLATE;
  const rect = (a, b, y0, y1) => [
    [a, y0],
    [b, y0],
    [b, y1],
    [a, y1],
  ];
  switch (roof.type) {
    case 'mansard': {
      const rh = roof.h ?? 2.6;
      return [
        {
          color: slate,
          points: [
            [z0 + 0.1, h],
            [z1 - 0.1, h],
            [z1 - 0.6, h + rh],
            [z0 + 0.6, h + rh],
          ],
        },
        { color: shade(slate, 0.8), points: rect(z0 + 0.6, z1 - 0.6, h + rh, top) },
      ];
    }
    case 'gable':
      return [{ color: slate, points: rect(z0 - 0.15, z1 + 0.15, h, top) }];
    case 'steppedGable': {
      const steps = roof.steps ?? 5;
      const half = (z1 - z0) * 0.5;
      const run = (half - 0.5) / steps;
      const rise = (top - h) / steps;
      const pts = [[z0, h]];
      for (let i = 0; i < steps; i++) {
        pts.push([z0 + i * run, h + (i + 1) * rise], [z0 + (i + 1) * run, h + (i + 1) * rise]);
      }
      for (let i = steps - 1; i >= 0; i--) {
        pts.push([z1 - (i + 1) * run, h + (i + 1) * rise], [z1 - i * run, h + (i + 1) * rise]);
      }
      pts.push([z1, h]);
      return [{ color: wall, points: pts }];
    }
    case 'neckGable': {
      const nw = (roof.neckW ?? 2) * 0.5;
      const sh = roof.shoulderH ?? 1.6;
      const ped = roof.pedH ?? 0.6;
      const pts = [[z0, h]];
      // Shoulders: quarter ellipses up to the neck
      for (let i = 1; i <= 6; i++) {
        const t = (i / 6) * Math.PI * 0.5;
        pts.push([z0 + (zc - nw - z0) * Math.sin(t), h + sh * (1 - Math.cos(t))]);
      }
      pts.push([zc - nw, top - ped], [zc, top], [zc + nw, top - ped]);
      for (let i = 6; i >= 1; i--) {
        const t = (i / 6) * Math.PI * 0.5;
        pts.push([z1 - (z1 - zc - nw) * Math.sin(t), h + sh * (1 - Math.cos(t))]);
      }
      pts.push([z1, h]);
      return [{ color: wall, points: pts }];
    }
    case 'queenAnne':
      return [
        {
          color: roof.color ?? shade(wall, 0.85),
          points: [
            [z0 - 0.2, h],
            [z1 + 0.2, h],
            [zc, top],
          ],
        },
      ];
    case 'parapet': {
      const ph = h + (roof.h ?? 0.6);
      const shapes = [{ color: wall, points: rect(z0, z1, h, ph) }];
      if (top - ph > 0.1) {
        const w = (z1 - z0) * (roof.profile === 'gable' ? 0.5 : 0.36);
        shapes.push({
          color: wall,
          points:
            roof.profile === 'gable'
              ? [
                  [zc - w, ph],
                  [zc + w, ph],
                  [zc, top],
                ]
              : rect(zc - w * 0.5, zc + w * 0.5, ph, top),
        });
      }
      shapes.push({ color: trim, points: rect(z0, z1, ph - 0.08, ph) });
      return shapes;
    }
    case 'attic':
      return [{ color: wall, points: rect(z0 + 0.15, z1 - 0.15, h, top) }];
    default:
      // Flat roof: the parapet behind the cornice
      return [{ color: shade(trim, 0.85), points: rect(z0 + 0.05, z1 - 0.05, h, top) }];
  }
}

/**
 * @param {ReturnType<import('./StreetAudit.js').auditStreet>} report
 * @returns {string} an SVG document
 */
export function streetElevationSvg(report) {
  const loop = report.entries.at(-1).z1;
  const rows = Math.ceil(loop / ROW_M);
  const width = ROW_M * PX + MARGIN * 2;
  const height = rows * ROW_H + MARGIN * 2;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="monospace">`,
    `<rect width="${width}" height="${height}" fill="#e8eef2"/>`,
  ];
  const rowOf = (z) => Math.min(rows - 1, Math.floor((z + 1e-6) / ROW_M));
  const X = (z, row) => MARGIN + (z - row * ROW_M) * PX;
  const Y = (y, row) => MARGIN + row * ROW_H + (SKY_M - y) * PX;
  const poly = (pts, row, fill) =>
    `<polygon points="${pts.map(([z, y]) => `${X(z, row).toFixed(1)},${Y(y, row).toFixed(1)}`).join(' ')}" fill="${fill}"/>`;
  const box = (z0, z1, y0, y1, row, fill) =>
    poly(
      [
        [z0, y0],
        [z1, y0],
        [z1, y1],
        [z0, y1],
      ],
      row,
      fill,
    );

  // Ground line and the 20 m chunk marks
  for (let r = 0; r < rows; r++) {
    out.push(
      `<line x1="${MARGIN}" y1="${Y(0, r)}" x2="${X((r + 1) * ROW_M, r)}" y2="${Y(0, r)}" stroke="#555" stroke-width="2"/>`,
    );
    for (let z = r * ROW_M; z <= (r + 1) * ROW_M; z += 20) {
      out.push(
        `<text x="${X(z, r)}" y="${Y(0, r) + 34}" font-size="10" fill="#888" text-anchor="middle">Z ${z}</text>`,
      );
    }
  }

  const byId = new Map(report.street.houses.map((h) => [h.id, h]));
  for (const e of report.entries) {
    const row = rowOf(e.z0);
    const mid = (e.z0 + e.z1) * 0.5;
    if (e.kind === 'open') {
      out.push(
        `<text x="${X(mid, row)}" y="${Y(0, row) - 6}" font-size="11" fill="#666" text-anchor="middle">${e.name}</text>`,
      );
      continue;
    }
    const { spec, plan, lot } = byId.get(e.id);
    const at = (z) => lot.centerZ + z;
    const z0 = at(plan.zA);
    const z1 = at(plan.zB);
    const g = [`<g id="${e.id}">`];
    for (const s of roofShapes(spec, z0, z1, plan.height, plan.top)) {
      g.push(poly(s.points, row, hexOf(s.color)));
    }
    const ground = spec.wall?.ground?.color ?? e.wall?.color ?? [0.5, 0.4, 0.3];
    const upper = e.wall?.color ?? ground;
    g.push(box(z0, z1, spec.floors[0], plan.height, row, hexOf(upper)));
    g.push(box(z0, z1, 0, spec.floors[0], row, hexOf(ground)));
    // The cornice band down to the crown's foot
    if (e.cornice !== 'none' && plan.crownBottom < plan.height) {
      const trim = spec.cornice?.color ?? spec.wall?.trim ?? shade(upper, 0.8);
      g.push(box(z0 - 0.08, z1 + 0.08, plan.crownBottom, plan.height, row, hexOf(trim)));
    }
    for (const o of openingsOf(plan)) {
      // A projecting bay is masonry with windows of its own, not one opening
      const fill = o.what.startsWith('bay')
        ? hexOf(shade(upper, 0.82))
        : o.window
          ? GLASS
          : SHOPFRONT;
      g.push(box(at(o.z0), at(o.z1), o.y0, o.y1, row, fill));
    }
    // The party wall seam up to the wall head
    g.push(
      `<line x1="${X(z1, row)}" y1="${Y(0, row)}" x2="${X(z1, row)}" y2="${Y(plan.height, row)}" stroke="#0004" stroke-width="1"/>`,
    );
    g.push(
      `<text x="${X(mid, row)}" y="${Y(0, row) + 13}" font-size="11" fill="#222" text-anchor="middle">${e.number}</text>`,
    );
    if (e.shops.length) {
      g.push(
        `<text x="${X(mid, row)}" y="${Y(0, row) + 24}" font-size="9" fill="#7a3b1e" text-anchor="middle">${esc(e.shops.join('/'))}</text>`,
      );
    }
    g.push('</g>');
    out.push(...g);
  }

  // The far sidewalk in front of the houses: street lamps, then the trees over them
  const side = planFarSidewalk({ seed: 1, density: 0.55 });
  out.push('<g id="street-lamps">');
  for (const z of side.lamps) {
    const row = rowOf(z);
    out.push(box(z - 0.06, z + 0.06, 0, LAMP_HEAD.top, row, '#2b2d31'));
    out.push(box(z - 0.18, z + 0.18, LAMP_HEAD.top - 0.3, LAMP_HEAD.top, row, '#f2c45a'));
  }
  out.push('</g>', '<g id="street-trees">');
  for (const t of side.trees) {
    const row = rowOf(t.z);
    const c = t.crown;
    out.push(box(t.z - 0.12, t.z + 0.12, 0, t.clear + 0.3, row, '#6b5a43'));
    out.push(
      `<ellipse cx="${X(c.z, row).toFixed(1)}" cy="${Y(c.y, row).toFixed(1)}" rx="${(c.rz * PX).toFixed(1)}" ry="${(c.ry * PX).toFixed(1)}" fill="#5f7d2c" fill-opacity="0.55" stroke="#3d5418" stroke-width="1"/>`,
    );
  }
  out.push('</g>');
  out.push('</svg>');
  return out.join('\n');
}
