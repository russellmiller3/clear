// Export Factor DB rows as training data for XGBoost / future re-ranker.
//
// Produces JSONL: one training example per Meph trajectory attempt.
// Features are structured (tabular), ready for XGBoost directly.
// Label: test_score (the thing we want to predict).
//
// Usage:
//   node playground/supervisor/export-training-data.js              # writes to stdout
//   node playground/supervisor/export-training-data.js --out=t.jsonl # writes to file
//   node playground/supervisor/export-training-data.js --stats      # just print summary
//
// Feature space (~15 columns, matches RESEARCH.md spec):
//   archetype           (categorical, 15 values)
//   num_errors          (int, from error count in patch_summary)
//   compile_ok          (bool)
//   source_length       (int, lines in source_before)
//   has_auth_keyword    (bool, source mentions `requires login`)
//   has_agent_keyword   (bool, source mentions `agent` or `ask claude`)
//   has_crud_keyword    (bool, source mentions `save` or `get all`)
//   patch_op_count      (int, length of patch_ops array)
//   session_attempt     (int, 1..N — which attempt in this session)
//   (more can be added as the DB grows)
//
// Label: test_score (0.0–1.0)

import { FactorDB } from './factor-db.js';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'factor-db.sqlite');

function featurize(row, sessionAttemptIdx) {
  const source = row.source_before || '';
  const lineCount = source ? source.split('\n').length : 0;
  const summary = row.patch_summary || '';
  // Parse "Compile with N error(s):" if present
  const errMatch = summary.match(/Compile with (\d+) error/);
  const numErrors = errMatch ? parseInt(errMatch[1], 10) : (row.compile_ok ? 0 : 1);

  let patchOps = [];
  try { patchOps = JSON.parse(row.patch_ops || '[]'); } catch {}

  return {
    // features
    archetype: row.archetype || 'null',
    num_errors: numErrors,
    compile_ok: row.compile_ok,
    source_length: lineCount,
    has_auth_keyword: /requires\s+login|allow\s+signup/i.test(source) ? 1 : 0,
    has_agent_keyword: /\bagent\b|ask\s+claude/i.test(source) ? 1 : 0,
    has_crud_keyword: /\bsave\b|get\s+all|look\s+up/i.test(source) ? 1 : 0,
    patch_op_count: Array.isArray(patchOps) ? patchOps.length : 0,
    session_attempt: sessionAttemptIdx,
    // metadata (not for training, for debugging/joining)
    _id: row.id,
    _session_id: row.session_id,
    _error_sig: row.error_sig,
    // label
    test_score: row.test_score,
    test_pass: row.test_pass,
  };
}

export function exportTrainingData({ dbPath = DB_PATH } = {}) {
  const db = new FactorDB(dbPath);
  try {
    const rows = db._db.prepare('SELECT * FROM code_actions ORDER BY session_id, created_at ASC').all();
    const sessionCounters = {};
    const examples = rows.map(row => {
      const idx = (sessionCounters[row.session_id] || 0) + 1;
      sessionCounters[row.session_id] = idx;
      return featurize(row, idx);
    });
    return examples;
  } finally {
    db.close();
  }
}

export function summarize(examples) {
  const total = examples.length;
  const byArchetype = {};
  let passCount = 0;
  let compileCount = 0;
  for (const ex of examples) {
    byArchetype[ex.archetype] = (byArchetype[ex.archetype] || 0) + 1;
    if (ex.compile_ok) compileCount++;
    if (ex.test_pass) passCount++;
  }
  return {
    total,
    compile_ok: compileCount,
    test_pass: passCount,
    compile_rate: total > 0 ? compileCount / total : 0,
    pass_rate: total > 0 ? passCount / total : 0,
    byArchetype,
    readiness: {
      xgboost_threshold: 200,
      rows_until_ready: Math.max(0, 200 - passCount),
      percent_ready: Math.min(100, Math.round((passCount / 200) * 100)),
    },
  };
}

// CLI entry
const _thisFile = fileURLToPath(import.meta.url);
const _entryFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (pathToFileURL(_thisFile).href === _entryFile) {
  const argv = process.argv.slice(2);
  const outArg = argv.find(a => a.startsWith('--out='));
  const statsOnly = argv.includes('--stats');

  const examples = exportTrainingData();

  if (statsOnly) {
    const summary = summarize(examples);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  const jsonl = examples.map(e => JSON.stringify(e)).join('\n');

  if (outArg) {
    const outPath = outArg.split('=')[1];
    writeFileSync(outPath, jsonl);
    const summary = summarize(examples);
    console.error(`Wrote ${examples.length} examples to ${outPath}`);
    console.error(`  compile_ok: ${summary.compile_ok} (${(summary.compile_rate * 100).toFixed(1)}%)`);
    console.error(`  test_pass:  ${summary.test_pass} (${(summary.pass_rate * 100).toFixed(1)}%)`);
    console.error(`  XGBoost training: ${summary.readiness.rows_until_ready} passing rows to go (${summary.readiness.percent_ready}% ready)`);
  } else {
    process.stdout.write(jsonl);
  }
}
