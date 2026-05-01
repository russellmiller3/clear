#!/usr/bin/env node
// score-winning-runs — rank every test_pass=1 row in the Factor DB by an
// "exemplariness" score and write the ranked list to a snapshot file.
//
// This is Phase 1 of the winner-harvest plan (see plans/plan-winner-harvest-04-26-2026.md).
// The Factor DB accumulates wins permanently, but today no downstream system
// reads them — passing rows only feed the per-call hint retriever, which
// evaporates between sessions. This scorer turns the heap of wins into an
// ordered to-do list: "here are the top N apps that look exemplary; promote
// the cleanest ones into a canonical-examples library Meph reads every session."
//
// Score signals (combined as a weighted sum):
//
//   - Compactness — milestones_reached / lines_of_clear
//     Wins that did the most with the fewest lines rank higher.
//
//   - First-try cleanness — 1 / (failed_attempts_in_session_before_pass + 1)
//     A win that compiled green on the first attempt scores 1.0; a win after
//     N failures scores 1/(N+1). Cheap proxy for "the path to success was
//     obvious" — the kind of code we want in canonical examples.
//
//   - Uniqueness bonus — +0.5 if this row is the first to cover its
//     (archetype × first-feature) combo. Stops the top-N from being dominated
//     by repeated wins of the easiest archetype.
//
// Zero API cost. Pure read over the local SQLite file. Safe to run while
// sweeps are in flight — readonly DB handle, WAL gives us a consistent snapshot.
//
// Usage:
//   node scripts/score-winning-runs.mjs
//   node scripts/score-winning-runs.mjs --top=50
//   node scripts/score-winning-runs.mjs --out=snapshots/custom.txt
//   node scripts/score-winning-runs.mjs --json   (machine-readable)

import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, '..', 'playground', 'factor-db.sqlite');
const DEFAULT_OUT = join(__dirname, '..', 'snapshots', 'winner-rankings-04-26-2026.txt');

// ---------- Pure scoring helpers (exported for unit tests) ----------

/**
 * Count lines of Clear source. Counts every non-empty line (including
 * comments) — Clear comments are part of the source the reader sees, so
 * we don't strip them. Trailing newlines don't count.
 *
 * @param {string} source
 * @returns {number}
 */
export function countLines(source) {
  if (!source || typeof source !== 'string') return 0;
  return source.split('\n').filter((l) => l.trim().length > 0).length;
}

/**
 * Extract the "first feature" tag from a Clear source string. Coarse signal
 * used for the uniqueness bonus — we want a stable string per row so that
 * "first row to introduce feature X in archetype Y" gets the boost.
 *
 * Strategy: walk lines, skip comments and the build directive, return the
 * first directive that names a database table, an endpoint, an agent, or a
 * page. Falls back to the first non-comment, non-build line.
 *
 * @param {string} source
 * @returns {string}  feature tag (lowercased, trimmed, max 80 chars)
 */
export function firstFeature(source) {
  if (!source || typeof source !== 'string') return '';
  const lines = source.split('\n');
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;        // header comment
    if (trimmed.startsWith('/*')) continue;       // block comment open
    if (trimmed.startsWith('*')) continue;        // block comment continuation
    if (trimmed.startsWith('//')) continue;       // line comment
    if (/^build\s+for\b/i.test(trimmed)) continue; // build directive
    // Look for the meaningful Clear node-types we care about.
    if (/^create\s+a\s+\w+\s+table\b/i.test(trimmed)) {
      return trimmed.toLowerCase().slice(0, 80);
    }
    if (/^calls?\s+(GET|POST|PUT|DELETE|PATCH)\b/i.test(trimmed)) {
      return trimmed.toLowerCase().slice(0, 80);
    }
    if (/^create\s+an?\s+agent\b/i.test(trimmed)) {
      return trimmed.toLowerCase().slice(0, 80);
    }
    if (/^create\s+a\s+page\b/i.test(trimmed)) {
      return trimmed.toLowerCase().slice(0, 80);
    }
    if (/^when\s+/i.test(trimmed)) {
      return trimmed.toLowerCase().slice(0, 80);
    }
    return trimmed.toLowerCase().slice(0, 80);
  }
  return '';
}

/**
 * Compute the exemplariness score for a single winning row. Weighted sum of
 * the three signals; higher is better. Returns components alongside the
 * total so the snapshot file can show why each row ranked where it did.
 *
 * Compactness weight = 1.0; first-try weight = 1.0; uniqueness bonus = 0.5.
 * These weights are intentionally simple — Phase 3's A/B sweep will tell us
 * whether the ordering picks good examples; if not, the weights are the
 * obvious knob to turn.
 *
 * @param {object} row
 * @param {number} row.lines        — lines of Clear source for the win
 * @param {number} row.milestones   — number of distinct steps marked passing
 *                                    in the same session as this row
 * @param {number} row.attempts     — total compile-or-test rows in the session
 *                                    BEFORE this passing row landed
 * @param {boolean} row.unique      — true if this row is first to cover its
 *                                    archetype-x-feature combo
 * @returns {{ score: number, compactness: number, cleanness: number, bonus: number }}
 */
export function computeScore({ lines, milestones, attempts, unique } = {}) {
  // Compactness — milestones per line. Cap milestones at 1 minimum so a row
  // with no step decomposition still contributes something (tasks that pre-date
  // the steps[] field are still legitimate wins).
  const milestonesEff = Math.max(1, milestones || 0);
  const linesEff = Math.max(1, lines || 0);
  const compactness = milestonesEff / linesEff;

  // First-try cleanness — inverse of the failed attempts that preceded the win.
  // Defensive: clamp attempts at zero (can't be negative).
  const attemptsEff = Math.max(0, attempts || 0);
  const cleanness = 1 / (attemptsEff + 1);

  // Uniqueness bonus — flat +0.5 if the (archetype, first-feature) combo
  // hasn't already been claimed by a higher-ranked row.
  const bonus = unique ? 0.5 : 0;

  const score = compactness + cleanness + bonus;
  return { score, compactness, cleanness, bonus };
}

/**
 * Apply the uniqueness pass to a list of pre-scored rows. Sort by base score
 * (compactness + cleanness) descending, then walk the list and grant the
 * +0.5 unique bonus to the FIRST row in each (archetype, first-feature)
 * bucket. Re-sort by final score and return.
 *
 * Pure function — no DB access. Exposed for testing.
 *
 * @param {Array<{archetype: string, first_feature: string, lines: number, milestones: number, attempts: number, [key:string]:any}>} rows
 * @returns {Array<object>}  same rows, with score/compactness/cleanness/bonus/unique fields added, sorted by score desc
 */
export function rankRows(rows) {
  // Pass 1: compute score with unique=false so we can rank by base score.
  const withBase = rows.map((r) => {
    const { score, compactness, cleanness } = computeScore({
      lines: r.lines,
      milestones: r.milestones,
      attempts: r.attempts,
      unique: false,
    });
    return { ...r, score_base: score, compactness, cleanness };
  });
  // Sort by base score desc — earliest in the sorted list wins the bucket.
  withBase.sort((a, b) => b.score_base - a.score_base);

  // Pass 2: walk in order, mark first row in each bucket as unique.
  const seen = new Set();
  const ranked = withBase.map((r) => {
    const key = `${r.archetype || ''}::${r.first_feature || ''}`;
    const unique = !seen.has(key);
    if (unique) seen.add(key);
    const { score, bonus } = computeScore({
      lines: r.lines,
      milestones: r.milestones,
      attempts: r.attempts,
      unique,
    });
    return { ...r, unique, bonus, score };
  });

  // Final sort by total score (which now includes the bonus).
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

// ---------- DB-backed pipeline (skipped by unit tests) ----------

/**
 * Load every test_pass=1 row that has substantive source code, plus the
 * derived fields the scorer needs: lines, milestones, attempts.
 *
 * Filters out rows with source_before shorter than 50 chars — those predate
 * the source_before column being routinely populated and can't be promoted
 * into a canonical example file because there's nothing to copy. Mirrors the
 * filter in factor-db.js querySuggestions.
 *
 * @param {Database} db
 * @returns {Array<object>}
 */
export function loadWinningRows(db) {
  const rows = db
    .prepare(
      `SELECT id, session_id, task_type, archetype, source_before, created_at, step_index
       FROM code_actions
       WHERE test_pass = 1
         AND source_before IS NOT NULL
         AND LENGTH(source_before) > 50
       ORDER BY created_at ASC`
    )
    .all();

  // Pre-fetch session-level stats once so we don't re-query for every row.
  // Session attempts before pass = count of rows in the session with created_at < this row.
  // Session milestones reached = COUNT(DISTINCT step_index) WHERE test_pass=1 in the session.
  const sessionStmt = db.prepare(
    `SELECT COUNT(*) AS failed_before
     FROM code_actions
     WHERE session_id = ? AND created_at < ? AND test_pass = 0`
  );
  const milestoneStmt = db.prepare(
    `SELECT COUNT(DISTINCT step_index) AS milestones
     FROM code_actions
     WHERE session_id = ? AND test_pass = 1 AND step_index IS NOT NULL`
  );

  return rows.map((r) => {
    const { failed_before } = sessionStmt.get(r.session_id, r.created_at) || { failed_before: 0 };
    const { milestones } = milestoneStmt.get(r.session_id) || { milestones: 0 };
    return {
      id: r.id,
      session_id: r.session_id,
      task_id: r.task_type || '',
      archetype: r.archetype || '',
      lines: countLines(r.source_before),
      milestones: milestones || 0,
      attempts: failed_before || 0,
      first_feature: firstFeature(r.source_before),
      created_at: r.created_at,
    };
  });
}

/**
 * Render the ranked list as a flat text snapshot. One row per line, columns
 * separated by " | " for trivial grep-ability.
 *
 * Format:
 *   score | task_id | archetype | lines | attempts | first_feature
 *
 * @param {Array<object>} ranked
 * @returns {string}
 */
export function renderSnapshot(ranked) {
  const header = [
    '# Winner Rankings — generated by scripts/score-winning-runs.mjs',
    `# Generated: ${new Date().toISOString()}`,
    `# Rows: ${ranked.length}`,
    '#',
    '# Columns: score | id | task_id | archetype | lines | attempts | milestones | features-touched',
    '',
  ].join('\n');
  const lines = ranked.map((r) => {
    const score = r.score.toFixed(4);
    const lines = String(r.lines).padStart(4);
    const attempts = String(r.attempts).padStart(3);
    const milestones = String(r.milestones).padStart(2);
    return [
      score,
      r.id,
      r.task_id || '-',
      r.archetype || '-',
      lines,
      attempts,
      milestones,
      r.first_feature || '-',
    ].join(' | ');
  });
  return header + lines.join('\n') + '\n';
}

// ---------- CLI ----------

function parseArgs(argv) {
  const args = { top: null, out: DEFAULT_OUT, json: false, db: DEFAULT_DB_PATH };
  for (const a of argv) {
    if (a.startsWith('--top=')) args.top = parseInt(a.slice(6), 10);
    else if (a.startsWith('--out=')) args.out = a.slice(6);
    else if (a.startsWith('--db=')) args.db = a.slice(5);
    else if (a === '--json') args.json = true;
  }
  return args;
}

const _thisFile = fileURLToPath(import.meta.url);
let _entryFile = '';
try { _entryFile = process.argv[1] || ''; } catch {}
const _isMain = _thisFile === _entryFile || _entryFile.endsWith('score-winning-runs.mjs');

if (_isMain) {
  const args = parseArgs(process.argv.slice(2));

  let db;
  try {
    db = new Database(args.db, { readonly: true });
  } catch (err) {
    console.error(`Failed to open Factor DB at ${args.db}: ${err.message}`);
    process.exit(1);
  }

  const rows = loadWinningRows(db);
  db.close();

  if (rows.length === 0) {
    console.error('No passing rows with substantive source found. Nothing to rank.');
    process.exit(1);
  }

  const ranked = rankRows(rows);
  const sliced = args.top ? ranked.slice(0, args.top) : ranked;

  if (args.json) {
    console.log(JSON.stringify(sliced, null, 2));
  } else {
    const snapshot = renderSnapshot(sliced);
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, snapshot, 'utf8');
    console.log(`Ranked ${rows.length} winning rows. Wrote top ${sliced.length} to ${args.out}.`);
    console.log(`Top 5:`);
    for (const r of sliced.slice(0, 5)) {
      console.log(
        `  ${r.score.toFixed(4)} | id=${r.id} | ${r.archetype || '-'} | ${r.lines}L | ${r.attempts}fail | ${r.first_feature?.slice(0, 50) || '-'}`
      );
    }
  }
}
