// playground/tenant-store-factory.js
//
// CC-1 cycle 9 — store factory + cutover wrapper. Picks the right
// PostgresTenantStore / InMemoryTenantStore / DualWriteTenantStore based
// on env vars so the production cutover from in-memory to Postgres is a
// runtime config change, not a code change.
//
// Cutover sequence (documented in plans/plan-cc-1-postgres-wire-up-04-25-2026.md
// — Cycle 9):
//
//   1. Deploy with DATABASE_URL set + TENANT_STORE_PRIMARY=in-memory
//      → InMemoryTenantStore is primary; Postgres connection is verified
//      at startup but not written to. Watch logs for any pg connect errors.
//
//   2. Run a one-shot `node playground/seed-from-memory.js` to copy live
//      in-memory state into Postgres via the public store API. (Tiny
//      script, written when needed.)
//
//   3. Flip TENANT_STORE_PRIMARY=dual-write and redeploy.
//      → DualWriteTenantStore writes to both stores. Reads come from
//      Postgres first; in-memory is the silent mirror.
//
//   4. After confidence (24h+ no drift): flip TENANT_STORE_PRIMARY=postgres.
//      → PostgresTenantStore is primary; in-memory becomes write-only mirror.
//
//   5. After more confidence: drop the mirror entirely (just unset the env
//      vars or delete the dual-write code — same factory still works).
//
// Without DATABASE_URL the factory always returns InMemoryTenantStore so
// dev / tests stay zero-config.

import { InMemoryTenantStore, PostgresTenantStore, DualWriteTenantStore } from './tenants.js';
import { runMigrations } from './db/migrations.js';

const MIGRATIONS_DIR = new URL('./db/migrations/', import.meta.url).pathname;

/**
 * Build a tenant store from env vars. Three modes:
 *
 *   - DATABASE_URL unset                  → InMemoryTenantStore (default)
 *   - DATABASE_URL set, primary=postgres  → PostgresTenantStore (prod)
 *   - DATABASE_URL set, primary=dual-write → DualWriteTenantStore wrapping both
 *   - DATABASE_URL set, primary=in-memory → InMemoryTenantStore (Postgres
 *     connection still verified for cutover dry-run)
 *
 * @param {object} env       — process.env or compatible
 * @param {object} [deps]    — test seam: { Pool, makeMigrationsRunner }
 * @returns {Promise<{ store, mode, pool }>}
 */
export async function makeTenantStore(env = process.env, deps = {}) {
  const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL;
  const primaryEnv = (env.TENANT_STORE_PRIMARY || '').toLowerCase();

  if (!databaseUrl) {
    return { store: new InMemoryTenantStore(), mode: 'in-memory', pool: null };
  }

  // pg is an optional dep — only require when we actually have a URL.
  let Pool;
  try {
    if (deps.Pool) {
      Pool = deps.Pool;
    } else {
      const pg = await import('pg');
      Pool = pg.Pool || pg.default?.Pool;
    }
  } catch (err) {
    throw new Error(
      `tenant-store-factory: DATABASE_URL is set but the 'pg' package isn't installed. ` +
      `Run 'npm install pg' or unset DATABASE_URL to fall back to in-memory. (${err.message})`
    );
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: Number(env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: Number(env.PG_IDLE_TIMEOUT_MS) || 30_000,
    connectionTimeoutMillis: Number(env.PG_CONNECTION_TIMEOUT_MS) || 5_000,
    application_name: 'clear-cloud-tenants',
    statement_timeout: Number(env.PG_STATEMENT_TIMEOUT_MS) || 10_000,
  });

  // Apply pending migrations on first boot. Idempotent — re-applies are no-ops.
  const migrationsDir = deps.migrationsDir || MIGRATIONS_DIR;
  await runMigrations(pool, migrationsDir);

  const inMem = new InMemoryTenantStore();
  const pg = new PostgresTenantStore({ pool });

  // Default cutover mode when DATABASE_URL is set: postgres-primary.
  // Dev/early-cutover passes TENANT_STORE_PRIMARY=in-memory or =dual-write
  // to opt into the safer modes.
  const mode = primaryEnv === 'in-memory' ? 'in-memory'
    : primaryEnv === 'dual-write' ? 'dual-write'
    : 'postgres';

  if (mode === 'in-memory') {
    return { store: inMem, mode, pool };
  }
  if (mode === 'dual-write') {
    return { store: new DualWriteTenantStore({ primary: pg, mirror: inMem }), mode, pool };
  }
  return { store: pg, mode, pool };
}

/**
 * Close the store's resources. Call from shutdown hooks. Safe to call
 * even if the store has no resources to close.
 */
export async function closeTenantStore(handle) {
  if (!handle) return;
  if (handle.pool && typeof handle.pool.end === 'function') {
    try { await handle.pool.end(); } catch { /* swallow */ }
  }
}
