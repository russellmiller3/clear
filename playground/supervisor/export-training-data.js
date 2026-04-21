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
//   archetype           (categorical, 16 values incl. kpi)
//   error_category      (categorical, short string — "validation" / "syntax" / etc, parsed from patch_summary)
//   step_index          (int, 0-N, which milestone Meph has hit; -1 if task has no steps)
//   step_name           (categorical, human-readable milestone name)
//   num_errors          (int, from error count in patch_summary)
//   compile_ok          (bool)
//   source_length       (int, lines in source_before)
//   has_auth_keyword    (bool, source mentions `requires login`)
//   has_agent_keyword   (bool, source mentions `agent` or `ask claude`)
//   has_crud_keyword    (bool, source mentions `save` or `get all`)
//   has_webhook_keyword (bool, source has /webhook/ or /hook/ path)
//   has_schedule_keyword (bool, source has `every day at`)
//   has_chart_keyword   (bool, source has `chart '...' as`)
//   patch_op_count      (int, length of patch_ops array)
//   session_attempt     (int, 1..N — which attempt in this session)
//
// Label: test_score (0.0–1.0)

import { FactorDB } from './factor-db.js';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parse } from '../../parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'factor-db.sqlite');

// Count AST nodes of each type in a parsed body (recursive). This is the
// structural signal EBM needs to discriminate "CRUD app with 5 endpoints"
// from "webhook with 1 endpoint" — beyond the crude keyword-match features.
function astCounts(body, acc = {}) {
  if (!Array.isArray(body)) return acc;
  for (const n of body) {
    if (!n || typeof n !== 'object') continue;
    acc[n.type] = (acc[n.type] || 0) + 1;
    if (Array.isArray(n.body)) astCounts(n.body, acc);
    if (Array.isArray(n.thenBranch)) astCounts(n.thenBranch, acc);
    if (Array.isArray(n.otherwiseBranch)) astCounts(n.otherwiseBranch, acc);
  }
  return acc;
}

// Parse source safely — never let parser errors kill the export pipeline
function safeParse(source) {
  if (!source) return { body: [], errors: [] };
  try { return parse(source); }
  catch { return { body: [], errors: [] }; }
}

// Extract the most informative error-token from the compiler's patch_summary.
// Summaries look like: "Compile with 3 error(s): Line 14: Clear doesn't
// understand '{' in this position..." — we pull the quoted bad-token.
function extractErrorToken(summary) {
  if (!summary) return 'none';
  const quoted = summary.match(/["'`]([^"'`]{1,30})["'`]/);
  if (quoted) return quoted[1].slice(0, 30);
  // Fall back to the first word after "doesn't understand"
  const m = summary.match(/doesn'?t understand ([^\s,.]+)/i);
  if (m) return m[1].slice(0, 30);
  return 'unknown';
}

// Parse a rough error category from the compiler's first error message in
// patch_summary. We bucket into ~8 coarse categories for EBM training, more
// useful than leaving it unlabeled.
function classifyError(summary) {
  if (!summary) return 'none';
  const s = summary.toLowerCase();
  if (s.startsWith('clean compile')) return 'none';
  if (/hasn'?t been (created|defined)|not defined/.test(s)) return 'undefined_var';
  if (/doesn'?t understand|expected|unexpected|syntax/.test(s)) return 'syntax';
  if (/table|column|field/.test(s)) return 'schema';
  if (/auth|login|permission/.test(s)) return 'auth';
  if (/validate|required|missing/.test(s)) return 'validation';
  if (/endpoint|route|path/.test(s)) return 'routing';
  if (/chart|display|page/.test(s)) return 'ui';
  return 'other';
}

function featurize(row, sessionAttemptIdx, prevRow) {
  const source = row.source_before || '';
  const lineCount = source ? source.split('\n').length : 0;
  const summary = row.patch_summary || '';
  // Parse "Compile with N error(s):" if present
  const errMatch = summary.match(/Compile with (\d+) error/);
  const numErrors = errMatch ? parseInt(errMatch[1], 10) : (row.compile_ok ? 0 : 1);

  let patchOps = [];
  try { patchOps = JSON.parse(row.patch_ops || '[]'); } catch {}

  // AST-based features — parse the source and count node types.
  // This replaces the crude keyword-match features with real structural signal.
  const parsed = safeParse(source);
  const counts = astCounts(parsed.body || []);

  const numEndpoints = counts.endpoint || 0;
  const numPages = counts.page || 0;
  const numTables = counts.data_shape || 0;
  const numAgents = (counts.agent || 0) + (counts.run_agent || 0) + (counts.ask_ai || 0);
  const numCharts = counts.chart || 0;
  const numCrons = counts.cron || 0;
  const numValidates = counts.validate_block || 0;
  const numAuthRequires = (counts.requires_auth || 0) + (counts.requires_role || 0) +
                         (counts.auth_scaffold || 0);
  const numAggregates = counts.sql_aggregate || 0;
  const numBranches = counts.if_then || 0;
  const numCruds = counts.crud || 0;

  // Source complexity: max endpoint body length, avg line length
  const lines = source.split('\n');
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  const avgLineLength = nonEmptyLines.length > 0
    ? Math.round(nonEmptyLines.reduce((a, l) => a + l.length, 0) / nonEmptyLines.length)
    : 0;

  // Session trajectory: context from the immediately-prior compile in this session
  const prevCompileOk = prevRow ? (prevRow.compile_ok ? 1 : 0) : -1;
  const prevErrorSig = prevRow ? (prevRow.error_sig || 'none') : 'first';
  const errorIsNovel = prevRow ? (row.error_sig !== prevRow.error_sig ? 1 : 0) : 1;
  const stepAdvanced = (prevRow && typeof prevRow.step_index === 'number' && typeof row.step_index === 'number')
    ? (row.step_index > prevRow.step_index ? 1 : row.step_index < prevRow.step_index ? -1 : 0)
    : 0;

  // Error token: the specific keyword/symbol the compiler flagged
  const errorToken = extractErrorToken(summary);

  // test_score_bucket was REMOVED — it was derived from the label, causing
  // obvious data leakage. If we want per-test granularity it needs to come
  // from a separate source (like the test results JSON), not from test_score.

  return {
    // === Core categoricals ===
    // NOTE: error_token and prev_error_sig are high-cardinality (hash-like).
    // At 200-500 rows they overfit; re-enable at 1000+ rows.
    archetype: row.archetype || 'unknown',
    error_category: classifyError(summary),
    step_index: row.step_index !== null && row.step_index !== undefined ? row.step_index : -1,
    step_name: row.step_name || 'none',

    // === AST structural counts (REAL structural signal, not keyword match) ===
    num_endpoints: numEndpoints,
    num_pages: numPages,
    num_tables: numTables,
    num_agents: numAgents,
    num_charts: numCharts,
    num_crons: numCrons,
    num_validates: numValidates,
    num_auth_requires: numAuthRequires,
    num_aggregates: numAggregates,
    num_branches: numBranches,
    num_cruds: numCruds,

    // === Error / compile context ===
    num_errors: numErrors,
    compile_ok: row.compile_ok ? 1 : 0,
    source_length: lineCount,
    avg_line_length: avgLineLength,

    // === Session trajectory ===
    session_attempt: sessionAttemptIdx,
    prev_compile_ok: prevCompileOk,
    error_is_novel: errorIsNovel,
    step_advanced: stepAdvanced,

    // === Patch metadata ===
    patch_op_count: Array.isArray(patchOps) ? patchOps.length : 0,

    // === Metadata (not for training, for debugging/joining) ===
    _id: row.id,
    _session_id: row.session_id,
    _error_sig: row.error_sig,

    // === Labels ===
    test_score: row.test_score,
    test_pass: row.test_pass,
  };
}

export function exportTrainingData({ dbPath = DB_PATH } = {}) {
  const db = new FactorDB(dbPath);
  try {
    const rows = db._db.prepare('SELECT * FROM code_actions ORDER BY session_id, created_at ASC').all();
    const sessionCounters = {};
    const prevRowBySession = {}; // track immediately-previous row per session for trajectory features
    const examples = rows.map(row => {
      const idx = (sessionCounters[row.session_id] || 0) + 1;
      sessionCounters[row.session_id] = idx;
      const prev = prevRowBySession[row.session_id];
      prevRowBySession[row.session_id] = row;
      return featurize(row, idx, prev);
    });
    return examples;
  } finally {
    db.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Pairwise feature export.
//
// Pointwise regression on test_score has a ceiling — it can't distinguish
// "this fix is good in general" from "this fix is good for MEPH'S CURRENT
// ERROR". Pairwise ranking fixes that: for each (error_row E, fix_row F)
// pair, compute features that COMPARE E to F, then train to prefer pairs
// where F actually resolved E over pairs where F is an unrelated fix.
//
// Positive pair: (E=compile_ok=0, F=next compile_ok=1 in same session).
//   The session tells us F resolved E — it's the ground truth.
// Negative pair: (E=same error, F=random passing row from a different session).
//   F has no known relationship to E — the model learns that non-matching
//   archetype / error-category / source-shape is a weak signal.
//
// Features are intentionally small (6) to match our data scale (~200 passing
// rows). More features = overfitting. Grow them as the DB grows.
// ═══════════════════════════════════════════════════════════════════════════

// Simple token-set Jaccard for source similarity. Keyword overlap is a cheap
// proxy for structural similarity — two webhook sources share "webhook",
// "payload", "signature"; two CRUD sources share "save", "find all".
function jaccard(a, b) {
  if (!a || !b) return 0;
  const tokA = new Set(a.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 1));
  const tokB = new Set(b.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 1));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let inter = 0;
  for (const t of tokA) if (tokB.has(t)) inter++;
  const union = tokA.size + tokB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// For a fix row F, look up the error it was known to resolve — the row
// immediately BEFORE F in the same session. This lets us ask "does F fix
// the kind of error E is having?"
function targetErrorCategory(fixRow, sessionRows) {
  const idx = sessionRows.findIndex(r => r.id === fixRow.id);
  if (idx <= 0) return 'none';
  return classifyError(sessionRows[idx - 1].patch_summary || '');
}

export function featurizePair(errorRow, fixRow, fixSessionRows, label) {
  const errorCategory = classifyError(errorRow.patch_summary || '');
  const fixTarget = targetErrorCategory(fixRow, fixSessionRows);
  return {
    // === Pairwise comparison features ===
    archetype_match: errorRow.archetype === fixRow.archetype ? 1 : 0,
    error_sig_exact: errorRow.error_sig && errorRow.error_sig === fixRow.error_sig ? 1 : 0,
    error_category_match: errorCategory !== 'none' && errorCategory === fixTarget ? 1 : 0,
    source_jaccard: Number(jaccard(errorRow.source_before || '', fixRow.source_before || '').toFixed(4)),
    step_delta: Math.abs(
      (typeof errorRow.step_index === 'number' ? errorRow.step_index : 0) -
      (typeof fixRow.step_index === 'number' ? fixRow.step_index : 0)
    ),
    fix_test_score: fixRow.test_score || 0,

    // === Label ===
    label,

    // === Metadata (not for training) ===
    _error_id: errorRow.id,
    _fix_id: fixRow.id,
    _error_sig: errorRow.error_sig || null,
    _error_category: errorCategory,
    _fix_target_category: fixTarget,
  };
}

export function exportPairwiseData({ dbPath = DB_PATH, negativesPerPositive = 3, seed = 42 } = {}) {
  const db = new FactorDB(dbPath);
  try {
    const rows = db._db.prepare('SELECT * FROM code_actions ORDER BY session_id, created_at ASC').all();

    // Group rows by session so we can walk each session's trajectory.
    const bySession = {};
    for (const row of rows) {
      if (!bySession[row.session_id]) bySession[row.session_id] = [];
      bySession[row.session_id].push(row);
    }

    // Pool of passing rows with real source — used for negative sampling.
    const passingPool = rows.filter(r =>
      r.compile_ok === 1 && r.test_pass === 1 &&
      r.source_before && r.source_before.length > 50
    );

    // Deterministic PRNG (LCG) so exports are reproducible across runs
    let rngState = seed;
    const rand = () => {
      rngState = (rngState * 1664525 + 1013904223) % 4294967296;
      return rngState / 4294967296;
    };

    const pairs = [];
    for (const [sid, sessRows] of Object.entries(bySession)) {
      for (let i = 0; i < sessRows.length; i++) {
        const errorRow = sessRows[i];
        if (errorRow.compile_ok !== 0) continue;

        // Find the next compile_ok=1 row in this session with real source
        const fixRow = sessRows.slice(i + 1).find(x =>
          x.compile_ok === 1 && x.source_before && x.source_before.length > 50
        );
        if (!fixRow) continue;

        // Positive pair
        pairs.push(featurizePair(errorRow, fixRow, sessRows, 1));

        // K negatives from a different session
        for (let n = 0; n < negativesPerPositive; n++) {
          let neg = null;
          for (let attempts = 0; attempts < 10; attempts++) {
            const pick = passingPool[Math.floor(rand() * passingPool.length)];
            if (pick && pick.session_id !== sid) { neg = pick; break; }
          }
          if (!neg) continue;
          const negSessionRows = bySession[neg.session_id] || [neg];
          pairs.push(featurizePair(errorRow, neg, negSessionRows, 0));
        }
      }
    }

    return pairs;
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
  const pairwise = argv.includes('--pairwise');
  const negArg = argv.find(a => a.startsWith('--negatives='));
  const negatives = negArg ? parseInt(negArg.split('=')[1], 10) : 3;

  // Pairwise export: different output shape (label 0/1), different stats
  if (pairwise) {
    const pairs = exportPairwiseData({ negativesPerPositive: negatives });
    const positives = pairs.filter(p => p.label === 1).length;
    const negatives_n = pairs.filter(p => p.label === 0).length;
    const archMatch = pairs.filter(p => p.archetype_match === 1).length;
    const errCatMatch = pairs.filter(p => p.error_category_match === 1).length;

    if (statsOnly) {
      console.log(JSON.stringify({
        pairs: pairs.length, positives, negatives: negatives_n,
        archetype_match_pct: pairs.length ? (archMatch / pairs.length * 100).toFixed(1) + '%' : '0%',
        error_category_match_pct: pairs.length ? (errCatMatch / pairs.length * 100).toFixed(1) + '%' : '0%',
      }, null, 2));
      process.exit(0);
    }
    const jsonl = pairs.map(p => JSON.stringify(p)).join('\n');
    if (outArg) {
      const outPath = outArg.split('=')[1];
      writeFileSync(outPath, jsonl);
      console.error(`Wrote ${pairs.length} pairs (${positives} pos, ${negatives_n} neg) to ${outPath}`);
    } else {
      process.stdout.write(jsonl);
    }
    process.exit(0);
  }

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
