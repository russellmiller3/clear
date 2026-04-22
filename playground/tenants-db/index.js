/*
 * Tenants DB — Node client module.
 *
 * CC-1a scaffold. Wraps `pg` with typed helpers for the 4 tables the
 * schema defines. The subdomain router (CC-1b) will call
 * `lookupAppBySubdomain()`; the deploy orchestrator (CC-1c) will call
 * `insertDeploy()` + `markDeployCompleted()`; the AI proxy (Phase 85)
 * will call `insertUsageRow()` per request.
 *
 * Connection:
 *   - DATABASE_URL env var (pg connection string). If unset, helpers
 *     throw with a clear message. This module does NOT auto-connect to
 *     localhost — we don't want test runs to silently hit a local DB.
 *   - getPool() is lazy — Postgres connection opens on first use.
 *
 * Schema application:
 *   Apply migrations/001-tenants.sql manually via psql until we wire
 *   this into the deploy pipeline. The migration file is idempotent
 *   (CREATE TABLE IF NOT EXISTS everywhere).
 *
 * This module pulls `pg` via dynamic import so the tenants-db directory
 * stays a zero-setup scaffold today. Once Phase 85a lands and Russell
 * chooses the Postgres host (Fly Postgres / Neon / Supabase), `npm
 * install pg` in the playground dir and this module starts working.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_001_PATH = join(__dirname, 'migrations', '001-tenants.sql');

let _pool = null;

/**
 * Lazy-initialize the pg Pool. Throws with a clear message if DATABASE_URL
 * is missing or pg isn't installed.
 *
 * @param {object} options
 * @param {string} [options.databaseUrl] - override DATABASE_URL env
 * @returns {Promise<object>} pg.Pool instance
 */
export async function getPool(options = {}) {
  if (_pool) return _pool;
  const url = options.databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'tenants-db: DATABASE_URL not set. Point at your dev Postgres ' +
      '(e.g. postgres://localhost/clear_tenants) before calling any ' +
      'helper. In production this is provisioned via Phase 85a.'
    );
  }
  let pg;
  try {
    pg = await import('pg');
  } catch (err) {
    throw new Error(
      'tenants-db: `pg` package not installed. Run `npm install pg` in ' +
      'the playground dir to use this module. (We keep pg out of the ' +
      'repo root so the compiler stays zero-dep.)'
    );
  }
  const Pool = pg.Pool || pg.default?.Pool;
  _pool = new Pool({ connectionString: url });
  return _pool;
}

/** Test hook — reset the cached pool so tests can swap connection strings. */
export async function _resetPool() {
  if (_pool) {
    try { await _pool.end(); } catch {}
  }
  _pool = null;
}

/**
 * Load the 001-tenants.sql migration file verbatim. Useful for tests
 * that want to apply the schema against a fresh test DB before running
 * assertions.
 */
export function loadMigration001() {
  return readFileSync(MIGRATION_001_PATH, 'utf8');
}

/**
 * Apply the migration against the pool. Idempotent — the SQL uses
 * CREATE ... IF NOT EXISTS everywhere.
 */
export async function applyMigration001() {
  const pool = await getPool();
  const sql = loadMigration001();
  await pool.query(sql);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new tenant. Returns the full inserted row.
 * @param {object} input - { slug, name, plan?, email? }
 */
export async function createTenant(input) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `INSERT INTO tenants (slug, name, plan, email)
     VALUES ($1, $2, COALESCE($3, 'free'), $4)
     RETURNING *`,
    [input.slug, input.name, input.plan || null, input.email || null]
  );
  return rows[0];
}

/**
 * Look up a tenant by slug. Returns row or null.
 */
export async function getTenantBySlug(slug) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT * FROM tenants WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// App CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a new app under a tenant.
 * @param {object} input - { tenant_id, slug, subdomain, fly_app_name, fly_db_conn_str? }
 */
export async function createApp(input) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `INSERT INTO apps (tenant_id, slug, subdomain, fly_app_name, fly_db_conn_str)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.tenant_id, input.slug, input.subdomain, input.fly_app_name, input.fly_db_conn_str || null]
  );
  return rows[0];
}

/**
 * Subdomain → app lookup. This is THE hot path for CC-1b — the
 * subdomain router calls this on every *.buildclear.dev request. The
 * idx_apps_subdomain index keeps it O(log n).
 * Returns row or null.
 */
export async function lookupAppBySubdomain(subdomain) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT a.*, t.slug AS tenant_slug, t.plan AS tenant_plan, t.status AS tenant_status
     FROM apps a
     JOIN tenants t ON t.id = a.tenant_id
     WHERE a.subdomain = $1
       AND a.status = 'active'
       AND t.status = 'active'
     LIMIT 1`,
    [subdomain]
  );
  return rows[0] || null;
}

/**
 * List apps for a tenant (admin dashboards).
 */
export async function listAppsForTenant(tenant_id) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT * FROM apps WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenant_id]
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deploy lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new deploy record (status starts as 'pending'). Returns the
 * id the deploy orchestrator should pass to subsequent status updates.
 */
export async function insertDeploy(input) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `INSERT INTO deploys (app_id, version, image, status, initiated_by)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING *`,
    [input.app_id, input.version, input.image, input.initiated_by || null]
  );
  return rows[0];
}

/**
 * Update deploy status. Terminal statuses ('deployed', 'failed',
 * 'rolled_back') also stamp completed_at. A successful deploy
 * additionally updates apps.current_deploy_id so the router knows
 * which image is live.
 */
export async function updateDeployStatus(deploy_id, status, error = null) {
  const pool = await getPool();
  const terminal = ['deployed', 'failed', 'rolled_back'].includes(status);
  const { rows } = await pool.query(
    `UPDATE deploys
     SET status = $2,
         error = $3,
         completed_at = CASE WHEN $4::boolean THEN NOW() ELSE completed_at END
     WHERE id = $1
     RETURNING *`,
    [deploy_id, status, error, terminal]
  );
  const deploy = rows[0];
  if (deploy && status === 'deployed') {
    await pool.query(
      `UPDATE apps SET current_deploy_id = $1 WHERE id = $2`,
      [deploy.id, deploy.app_id]
    );
  }
  return deploy;
}

/**
 * Latest successful deploy for an app — what the router proxies to.
 */
export async function getCurrentDeploy(app_id) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT d.*
     FROM deploys d
     WHERE d.app_id = $1 AND d.status = 'deployed'
     ORDER BY d.started_at DESC
     LIMIT 1`,
    [app_id]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage tracking (AI proxy writes these)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert one usage row per `ask claude` call the proxy handles.
 * High-volume — the proxy should batch these if throughput justifies it,
 * but for MVP, one INSERT per call is fine.
 */
export async function insertUsageRow(input) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `INSERT INTO usage_rows
       (app_id, model, tokens_in, tokens_out, cache_read_tokens, cost_usd, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, ts`,
    [
      input.app_id,
      input.model,
      input.tokens_in || 0,
      input.tokens_out || 0,
      input.cache_read_tokens || 0,
      input.cost_usd || 0,
      input.request_id || null,
    ]
  );
  return rows[0];
}

/**
 * Sum usage for an app over a time window. Backing query for billing
 * dashboards + quota checks. The idx_usage_rows_app_id_ts index makes
 * this O(log n + k) where k = rows in the window.
 */
export async function sumUsageForApp(app_id, since, until = new Date()) {
  const pool = await getPool();
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(tokens_in), 0)         AS tokens_in,
       COALESCE(SUM(tokens_out), 0)        AS tokens_out,
       COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
       COALESCE(SUM(cost_usd), 0)          AS cost_usd,
       COUNT(*)                             AS request_count
     FROM usage_rows
     WHERE app_id = $1 AND ts >= $2 AND ts <= $3`,
    [app_id, since, until]
  );
  return rows[0];
}
