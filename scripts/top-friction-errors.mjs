#!/usr/bin/env node
// top-friction-errors — mine Factor DB for compile errors that cost the most
// Meph-minutes. "Friction" = occurrence count × average minutes until the next
// compile_ok=1 in the same session (or a large penalty if the session never
// recovers).
//
// Output is the prioritized list of error MESSAGES to rewrite for maximum
// lift on Meph's live pass rate. This is Russell's "use Factor DB errors to
// improve the compiler" follow-up from the Session 44 evening big-picture
// discussion — turn the flywheel's accumulated waste heat into a concrete
// action list: "here are the 10 error messages to rewrite first."
//
// Zero API cost. Pure read over the local SQLite.
//
// Usage:
//   node scripts/top-friction-errors.mjs                  # default: top 20
//   node scripts/top-friction-errors.mjs --top=10          # limit results
//   node scripts/top-friction-errors.mjs --min-count=3     # filter rare errors
//   node scripts/top-friction-errors.mjs --since=7d        # last 7 days only
//   node scripts/top-friction-errors.mjs --json            # machine-readable
//
// Design notes:
//   - "Error message" = the portion of patch_summary after "Compile with N error(s): ".
//     Truncated at 120 chars for grouping (longer tails often vary on
//     identifier names that don't affect the class of error).
//   - Session recovery = the next row in the same session_id with compile_ok=1.
//     If the session NEVER recovers, we charge a PENALTY_MS (30 min) to make
//     "Meph gave up" visibly costly in the friction score.
//   - Friction = count × mean_recovery_minutes. Errors that fire often AND
//     take long to recover bubble to the top.

import { FactorDB } from '../playground/supervisor/factor-db.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTOR_DB_PATH = join(__dirname, '..', 'playground', 'factor-db.sqlite');

const DEFAULT_TOP = 20;
const DEFAULT_MIN_COUNT = 2;
// A session that hits an error and then never writes a compile_ok=1 row is
// effectively "Meph gave up and wasted the whole session on this error."
// Charge 30 Meph-minutes per unrecovered occurrence so the friction score
// reflects the real cost, not the visible-recovery-time cost.
const UNRECOVERED_PENALTY_MS = 30 * 60 * 1000;
// Cap message length for grouping so minor identifier variance doesn't split
// the same semantic error into 10 buckets.
const MESSAGE_GROUP_LENGTH = 120;

function parseArgs(argv) {
  const out = { top: DEFAULT_TOP, minCount: DEFAULT_MIN_COUNT, since: null, json: false };
  for (const arg of argv) {
    if (arg.startsWith('--top=')) out.top = parseInt(arg.split('=')[1]) || DEFAULT_TOP;
    else if (arg.startsWith('--min-count=')) out.minCount = parseInt(arg.split('=')[1]) || DEFAULT_MIN_COUNT;
    else if (arg.startsWith('--since=')) out.since = arg.split('=')[1];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/top-friction-errors.mjs [--top=N] [--min-count=N] [--since=7d] [--json]');
      process.exit(0);
    }
  }
  return out;
}

function parseSince(s) {
  if (!s) return 0;
  const m = /^(\d+)([dhm])$/.exec(s);
  if (!m) return 0;
  const n = parseInt(m[1]);
  const unit = m[2];
  const ms = unit === 'd' ? 86400e3 : unit === 'h' ? 3600e3 : 60e3;
  return Date.now() - n * ms;
}

/**
 * Extract the error-message portion of a patch_summary string. Format is
 * "Compile with N error(s): <message>". If the prefix isn't present, returns
 * the whole string (defensive against schema drift).
 */
export function extractErrorMessage(patchSummary) {
  if (typeof patchSummary !== 'string' || patchSummary.length === 0) return null;
  const match = /^Compile with \d+ error\(s\):\s*/.exec(patchSummary);
  if (match) return patchSummary.slice(match[0].length).trim();
  return patchSummary.trim();
}

/**
 * Given a raw error message, return a normalized grouping key. Strips
 * things that differ per-compile but don't affect the error class:
 *   - line numbers ("on line 16" → "on line N")
 *   - quoted identifiers ('foo', `foo`, "foo") → 'X'
 * Then truncates to MESSAGE_GROUP_LENGTH.
 */
export function normalizeErrorForGrouping(msg) {
  if (!msg) return '';
  let s = msg
    .replace(/\bon line \d+\b/gi, 'on line N')
    .replace(/\bline \d+\b/gi, 'line N')
    .replace(/['"`][^'"`\n]{0,40}['"`]/g, "'X'");
  if (s.length > MESSAGE_GROUP_LENGTH) s = s.slice(0, MESSAGE_GROUP_LENGTH) + '...';
  return s;
}

/**
 * For a list of failing-row events (sorted by session_id then created_at),
 * compute each row's Meph-minutes-to-next-compile_ok within the same session.
 * Returns [{row, recoveryMs|null}, ...] — null means the session never recovered.
 *
 * Pure given the list of rows.
 */
export function computeRecoveryTimes(allRows) {
  // Group by session
  const bySession = new Map();
  for (const r of allRows) {
    if (!bySession.has(r.session_id)) bySession.set(r.session_id, []);
    bySession.get(r.session_id).push(r);
  }

  const out = [];
  for (const [sid, rows] of bySession) {
    rows.sort((a, b) => a.created_at - b.created_at);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.compile_ok) continue; // only score failing rows
      // Find next compile_ok=1 in same session after this row
      let recoveryMs = null;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].compile_ok === 1) {
          recoveryMs = rows[j].created_at - r.created_at;
          break;
        }
      }
      out.push({ row: r, recoveryMs });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceMs = parseSince(args.since);

  const db = new FactorDB(FACTOR_DB_PATH);
  try {
    const stats = db.stats();

    // Pull all rows within the window. Need both failing and passing rows so
    // we can compute per-session recovery.
    const rows = db._db.prepare(
      `SELECT id, session_id, archetype, compile_ok, patch_summary, created_at, source_before, error_sig
       FROM code_actions
       WHERE created_at >= ?
       ORDER BY session_id, created_at ASC`
    ).all(sinceMs);

    const withRecovery = computeRecoveryTimes(rows);
    const failingCount = withRecovery.length;

    // Group by normalized message
    const groups = new Map();
    for (const { row, recoveryMs } of withRecovery) {
      const raw = extractErrorMessage(row.patch_summary);
      if (!raw) continue;
      const key = normalizeErrorForGrouping(raw);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          sampleRaw: raw,
          count: 0,
          recoveredCount: 0,
          unrecoveredCount: 0,
          totalRecoveryMs: 0,
          archetypes: new Map(),
          sampleSourceBefore: row.source_before || null,
          sampleRowIds: [],
        });
      }
      const g = groups.get(key);
      g.count += 1;
      if (recoveryMs !== null) {
        g.recoveredCount += 1;
        g.totalRecoveryMs += recoveryMs;
      } else {
        g.unrecoveredCount += 1;
        g.totalRecoveryMs += UNRECOVERED_PENALTY_MS;
      }
      g.archetypes.set(row.archetype || 'unknown', (g.archetypes.get(row.archetype || 'unknown') || 0) + 1);
      if (g.sampleRowIds.length < 3) g.sampleRowIds.push(row.id);
      if (!g.sampleSourceBefore && row.source_before) g.sampleSourceBefore = row.source_before;
    }

    // Score each group: count × mean_recovery_minutes
    const scored = [];
    for (const g of groups.values()) {
      if (g.count < args.minCount) continue;
      const meanRecoveryMs = g.totalRecoveryMs / g.count;
      const meanRecoveryMin = meanRecoveryMs / 60000;
      const frictionScore = g.count * meanRecoveryMin;
      scored.push({ ...g, meanRecoveryMin, frictionScore });
    }
    scored.sort((a, b) => b.frictionScore - a.frictionScore);
    const top = scored.slice(0, args.top);

    if (args.json) {
      console.log(JSON.stringify({
        stats: {
          totalRowsInWindow: rows.length,
          failingRowsInWindow: failingCount,
          uniqueErrorGroups: groups.size,
          topReturned: top.length,
        },
        top: top.map(g => ({
          message: g.sampleRaw,
          normalizedKey: g.key,
          count: g.count,
          recoveredCount: g.recoveredCount,
          unrecoveredCount: g.unrecoveredCount,
          meanRecoveryMinutes: +g.meanRecoveryMin.toFixed(1),
          frictionScore: +g.frictionScore.toFixed(1),
          archetypes: Object.fromEntries(g.archetypes),
          sampleRowIds: g.sampleRowIds,
        })),
      }, null, 2));
      return;
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Top-Friction Compile Errors');
    console.log(`  Factor DB: ${stats.total} total rows, ${stats.passing} passing`);
    console.log(`  Window: ${args.since ? 'last ' + args.since : 'all history'}`);
    console.log(`  Rows in window: ${rows.length} (${failingCount} failing)`);
    console.log(`  Unique error groups: ${groups.size}`);
    console.log(`  Min count filter: ${args.minCount}`);
    console.log(`  Showing top ${top.length} by friction score`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    for (let i = 0; i < top.length; i++) {
      const g = top[i];
      const archList = [...g.archetypes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([a, n]) => `${a}×${n}`)
        .join(', ');
      const recoveryLabel = g.unrecoveredCount > 0
        ? `${g.meanRecoveryMin.toFixed(1)}min avg (${g.recoveredCount}/${g.count} recovered, ${g.unrecoveredCount} gave up)`
        : `${g.meanRecoveryMin.toFixed(1)}min avg`;
      console.log(`#${String(i + 1).padStart(2)}  friction=${g.frictionScore.toFixed(1).padStart(6)}  n=${String(g.count).padStart(3)}  ${recoveryLabel}`);
      console.log(`     archetype: ${archList}`);
      console.log(`     "${g.sampleRaw.slice(0, 200)}${g.sampleRaw.length > 200 ? '...' : ''}"`);
      console.log(`     row ids: ${g.sampleRowIds.join(', ')}`);
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  How to read: friction = count × mean_recovery_minutes. Higher = more Meph-minutes');
    console.log('  burned on that error. Rewrite the top errors first for biggest pass-rate lift.');
    console.log('  Unrecovered occurrences count as 30-min recovery (Meph gave up).');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } finally {
    db.close();
  }
}

// Run when invoked directly (not when imported for testing)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('top-friction-errors.mjs')) {
  main().catch(e => {
    console.error('Script failed:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
