#!/usr/bin/env node
/**
 * Street audit (`npm run audit`): writes `docs/STREET_AUDIT_GENERATED.md` (the loop, the
 * silhouette, the walls side by side, the findings) and `docs/STREET_ELEVATION.svg` (the whole
 * loop drawn flat, as from a far camera) from the live street plans. Pure Node, no WebGPU.
 * Exits with code 1 when the audit finds errors.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditStreet, formatAuditReport } from '../src/world/StreetAudit.js';
import { streetElevationSvg } from '../src/world/StreetElevation.js';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
mkdirSync(docs, { recursive: true });

const report = auditStreet(null);
writeFileSync(resolve(docs, 'STREET_AUDIT_GENERATED.md'), formatAuditReport(report) + '\n', 'utf8');
writeFileSync(resolve(docs, 'STREET_ELEVATION.svg'), streetElevationSvg(report) + '\n', 'utf8');

const { summary: s } = report;
console.log(
  `Audited ${s.lots} lots: ${s.houses} houses, ${s.shops} shops, ${s.openLots} open lots – ` +
    `${s.errors} errors, ${s.warnings} warnings, ${s.accepted} accepted.`,
);
for (const f of report.findings) console.log(`  ${f.severity} ${f.code} ${f.at}: ${f.message}`);
console.log(`Wrote docs/STREET_AUDIT_GENERATED.md and docs/STREET_ELEVATION.svg`);
if (s.errors > 0) process.exitCode = 1;
