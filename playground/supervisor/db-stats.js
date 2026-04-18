// Factor DB stats reporter.
// Usage: node playground/supervisor/db-stats.js

import { FactorDB } from './factor-db.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'factor-db.sqlite');

const db = new FactorDB(DB_PATH);
const stats = db.stats();

console.log(`\n=== Factor DB Stats ===`);
console.log(`  Total rows:   ${stats.total}`);
console.log(`  Passing rows: ${stats.passing}  (compile_ok=1 AND test_pass=1)`);
console.log(`  Re-ranker threshold: 200 passing rows. ${Math.max(0, 200 - stats.passing)} to go.`);

const byArch = db._db.prepare(`
  SELECT archetype,
    COUNT(*) AS total,
    SUM(compile_ok) AS compiles_ok,
    SUM(test_pass) AS tests_pass,
    ROUND(AVG(test_score) * 100) AS avg_score_pct
  FROM code_actions
  WHERE archetype IS NOT NULL
  GROUP BY archetype
  ORDER BY total DESC
`).all();

console.log(`\n=== By Archetype ===`);
console.log(`  ${'archetype'.padEnd(20)} ${'total'.padStart(6)} ${'compile'.padStart(8)} ${'pass'.padStart(6)} ${'avg%'.padStart(6)}`);
console.log(`  ${'-'.repeat(20)} ${'------'.padStart(6)} ${'--------'.padStart(8)} ${'------'.padStart(6)} ${'------'.padStart(6)}`);
for (const row of byArch) {
  console.log(`  ${(row.archetype || 'null').padEnd(20)} ${String(row.total).padStart(6)} ${String(row.compiles_ok).padStart(8)} ${String(row.tests_pass).padStart(6)} ${String(row.avg_score_pct || 0).padStart(6)}`);
}

const bySession = db._db.prepare(`
  SELECT session_id, COUNT(*) AS n, SUM(compile_ok) AS ok, SUM(test_pass) AS pass
  FROM code_actions
  GROUP BY session_id
  ORDER BY n DESC
  LIMIT 10
`).all();

console.log(`\n=== Top 10 Sessions ===`);
for (const row of bySession) {
  const sid = (row.session_id || '').length > 30 ? row.session_id.slice(0, 27) + '...' : row.session_id;
  console.log(`  ${sid.padEnd(32)} ${String(row.n).padStart(4)} rows (${row.ok} compile, ${row.pass} pass)`);
}

const recent = db._db.prepare(`
  SELECT datetime(created_at / 1000, 'unixepoch') AS ts, archetype, compile_ok, test_pass, patch_summary
  FROM code_actions
  ORDER BY created_at DESC
  LIMIT 10
`).all();

console.log(`\n=== Last 10 Rows ===`);
for (const r of recent) {
  const flag = r.compile_ok === 1 && r.test_pass === 1 ? '✅'
    : r.compile_ok === 1 ? '🔵'
      : '❌';
  console.log(`  ${flag} ${r.ts} [${r.archetype || 'null'}] ${(r.patch_summary || '').slice(0, 70)}`);
}

db.close();
console.log();
