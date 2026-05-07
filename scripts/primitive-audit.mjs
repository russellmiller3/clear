#!/usr/bin/env node
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { FactorDB } from '../studio/supervisor/factor-db.js';
import { seedCoreTemplatePatterns } from '../studio/supervisor/pattern-library.js';
import { analyzePrimitiveRows, formatPrimitiveAudit } from './primitive-audit-helpers.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const noReference = args.includes('--no-reference');
const repoRoot = process.cwd();
const dbPath = join(tmpdir(), `clear-primitive-audit-${Date.now()}-${process.pid}.sqlite`);

function cleanup() {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try { unlinkSync(path); } catch {}
  }
}

try {
  const db = new FactorDB(dbPath);
  const seed = seedCoreTemplatePatterns(db, repoRoot, undefined, {
    includeReferencePrimitives: !noReference,
  });
  const appRows = db.listProgrammingPatterns();
  const primitives = db.listProgrammingPatterns({ include_primitives: true }).filter(row => row.is_primitive);
  const report = analyzePrimitiveRows({ appRows, primitives });
  report.seed = {
    canonicalTemplates: seed.seeded,
    canonicalPrimitives: seed.primitiveSeeded,
    referenceTemplates: seed.referenceTemplateCount,
    referencePrimitives: seed.referencePrimitiveSeeded,
  };

  if (asJson) console.log(JSON.stringify(report, null, 2));
  else console.log(formatPrimitiveAudit(report));
  db.close();
} finally {
  cleanup();
}
