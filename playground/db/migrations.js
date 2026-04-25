// playground/db/migrations.js
//
// CC-1 Cycle 1: schema migration runner.
//
// Reads numbered SQL files from a directory (e.g. `0001_init.sql`,
// `0002_phase_c_audit.sql`, ...), checks the highest version recorded in
// `clear_cloud.schema_migrations`, applies any newer files inside a single
// `BEGIN/COMMIT` per migration, and inserts the migration row in the same
// transaction. Idempotent: a second call with the same dir is a no-op.
//
// Why hand-rolled? `package.json` already carries `bcryptjs`, `express`, and
// `better-sqlite3` — adding a dedicated migration tool (Knex, node-pg-migrate)
// for ~30 lines of code is dependency tax we don't need. This file is small
// enough to read end-to-end before trusting it in production.
//
// Plan: plans/plan-cc-1-postgres-wire-up-04-25-2026.md (cycle 1).

import fs from 'fs';
import path from 'path';

// Files in the migrations directory must match this pattern: a 4-digit
// version prefix, then an underscore, then a name, then `.sql`. The version
// is parsed as an integer for ordering — alphabetic sort would break once
// we cross 0009 → 0010.
const MIGRATION_FILE_RE = /^(\d{4})_(.+)\.sql$/;

// Bootstrap SQL — the schema itself, plus the tracking table. Runs every
// call before we look at the migrations dir, so the runner can find the
// `schema_migrations` table on the very first invocation. CREATE-IF-NOT-EXISTS
// makes it cheap to repeat.
const BOOTSTRAP_SQL = `
  CREATE SCHEMA IF NOT EXISTS clear_cloud;
  CREATE TABLE IF NOT EXISTS clear_cloud.schema_migrations (
    version int PRIMARY KEY,
    name text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`;

/**
 * Apply any pending SQL migrations from `dir`.
 *
 * @param {object} pool — a pg.Pool (or compatible). Methods used: `connect()`
 *                       returning a client with `query()` and `release()`.
 *                       In tests, pg-mem's adapter ships a Pool-equivalent.
 * @param {string} dir  — absolute path to the directory holding numbered SQL
 *                       files (e.g. `playground/db/migrations`).
 * @returns {Promise<{applied: Array<{version: number, name: string}>}>}
 */
export async function runMigrations(pool, dir) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new Error('runMigrations: first arg must be a pg.Pool-compatible object with connect()');
  }
  if (!dir || typeof dir !== 'string') {
    throw new Error('runMigrations: second arg must be the migrations directory path');
  }

  // Make sure the schema and tracking table exist before we ask for the
  // current max version. This runs OUTSIDE any per-migration transaction —
  // it's idempotent and safe to repeat.
  const bootstrapClient = await pool.connect();
  try {
    await bootstrapClient.query(BOOTSTRAP_SQL);
  } finally {
    bootstrapClient.release();
  }

  // Find the highest applied version. On a fresh DB this is 0 (no rows yet).
  let currentVersion = 0;
  {
    const c = await pool.connect();
    try {
      const r = await c.query('SELECT max(version) AS v FROM clear_cloud.schema_migrations');
      const v = r.rows[0]?.v;
      currentVersion = v == null ? 0 : Number(v);
    } finally {
      c.release();
    }
  }

  // Read the directory, parse and sort numerically.
  const candidates = [];
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      const m = MIGRATION_FILE_RE.exec(file);
      if (!m) continue;
      candidates.push({
        version: parseInt(m[1], 10),
        name: `${m[1]}_${m[2]}`,
        file: path.join(dir, file),
      });
    }
  }
  candidates.sort((a, b) => a.version - b.version);

  // Filter to those strictly greater than the current max version.
  const pending = candidates.filter(m => m.version > currentVersion);

  const applied = [];
  for (const mig of pending) {
    const sql = fs.readFileSync(mig.file, 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Run the migration's SQL inside the transaction.
      await client.query(sql);
      // Record that this version is now applied — same transaction, so a
      // mid-file failure rolls BOTH the schema change AND the tracking row.
      await client.query(
        'INSERT INTO clear_cloud.schema_migrations (version, name) VALUES ($1, $2)',
        [mig.version, mig.name]
      );
      await client.query('COMMIT');
      applied.push({ version: mig.version, name: mig.name });
    } catch (err) {
      // Roll back so the DB stays clean. Re-throw so the caller (server boot
      // or a test) sees the failure and can decide what to do — usually
      // crash loudly because a half-applied migration is unsafe to ignore.
      try { await client.query('ROLLBACK'); } catch { /* swallow secondary error */ }
      throw new Error(
        `migration ${mig.name} failed: ${err.message || err} (transaction rolled back)`
      );
    } finally {
      client.release();
    }
  }

  return { applied };
}
