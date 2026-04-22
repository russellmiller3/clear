/*
 * Per-app DB provisioning — CC-1c scaffold.
 *
 * When a new Clear app deploys under a tenant, the deploy pipeline calls
 * into this module to allocate an ISOLATED database for that app's data.
 * The returned connection string is written to apps.fly_db_conn_str
 * (see CC-1a schema) and injected into the running container so the
 * compiled app connects to its own DB, not a shared one.
 *
 * Two strategies:
 *
 *   'sqlite' — file on the tenant's Fly volume. Cheapest (zero infra
 *     besides the volume), isolated by filesystem permissions, scales
 *     to thousands of apps per tenant. Default for Free + Team tiers.
 *
 *   'postgres-schema' — a dedicated schema inside the tenant's shared
 *     Postgres. Stronger ACID, better for concurrent writers, supports
 *     cross-query analytics within the tenant. Default for Business +
 *     Enterprise. Isolation enforced via GRANT/REVOKE — each app gets
 *     a dedicated role that can only see its own schema.
 *
 * Both strategies accept a pair of slugs (tenant + app) and return
 * a structured result. The deploy pipeline treats the result as opaque:
 *   { strategy, connStr, path?, schema?, role? }
 *
 * Inputs are heavily sanitized — slugs go into file paths AND into
 * Postgres identifiers, both of which are injection surfaces. Only
 * [a-z0-9-] allowed, max 40 chars each (leaves room for prefixes +
 * separators inside Postgres's 63-char identifier limit).
 */

import { existsSync, mkdirSync, closeSync, openSync } from 'fs';
import { join, resolve, sep as pathSep } from 'path';

// Slug constraints — stricter than DNS subdomain (63 chars, mixed case,
// digits + hyphens) to keep enough headroom for Postgres identifier
// limits AND to ensure they're safe in a file path.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$|^[a-z0-9]$/;
const SLUG_MAX = 40;

/**
 * Validate a slug. Throws on invalid input — slugs go into file paths
 * AND SQL identifiers, so any invalid character is a security surface.
 */
export function validateSlug(slug, label = 'slug') {
  if (typeof slug !== 'string') {
    throw new Error(`${label} must be a string, got ${typeof slug}`);
  }
  if (slug.length === 0) {
    throw new Error(`${label} cannot be empty`);
  }
  if (slug.length > SLUG_MAX) {
    throw new Error(`${label} too long (max ${SLUG_MAX}, got ${slug.length})`);
  }
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `${label} must be lowercase [a-z0-9-], 1-${SLUG_MAX} chars, ` +
      `no leading/trailing hyphens. Got: ${JSON.stringify(slug)}`
    );
  }
}

/**
 * Provision an isolated SQLite DB file under the tenant's Fly volume.
 *
 * Layout:
 *   <volumeRoot>/tenants/<tenantSlug>/<appSlug>.sqlite
 *
 * - Creates the tenant directory if it doesn't exist (recursive, 0700)
 * - Touches the SQLite file if missing so the app can open it
 * - Validates the final path is BENEATH volumeRoot (path-traversal
 *   guard — redundant given slug validation, but cheap and explicit)
 *
 * The returned connection string uses the `sqlite://` scheme so
 * runtime/db.js can detect it and route to better-sqlite3.
 *
 * @param {object} input
 * @param {string} input.tenantSlug - validated tenant URL slug
 * @param {string} input.appSlug    - validated app slug
 * @param {string} input.volumeRoot - absolute path to the Fly volume root
 *                                    (e.g. /data on a Fly machine, or a
 *                                    temp dir in tests)
 * @returns {{strategy: 'sqlite', connStr: string, path: string}}
 */
export function provisionSqlite(input) {
  validateSlug(input.tenantSlug, 'tenantSlug');
  validateSlug(input.appSlug, 'appSlug');
  if (!input.volumeRoot || typeof input.volumeRoot !== 'string') {
    throw new Error('provisionSqlite: volumeRoot (absolute path) is required');
  }
  const volumeRoot = resolve(input.volumeRoot);
  const tenantDir = join(volumeRoot, 'tenants', input.tenantSlug);
  const dbPath = join(tenantDir, `${input.appSlug}.sqlite`);

  // Path-traversal guard — ensure the resolved path is strictly under
  // volumeRoot. The slug regex makes this unreachable in practice, but
  // defense in depth matters when the call chain spans multiple teams.
  const resolvedDb = resolve(dbPath);
  if (!resolvedDb.startsWith(volumeRoot + pathSep) && resolvedDb !== volumeRoot) {
    throw new Error(`provisionSqlite: computed path ${resolvedDb} escapes volumeRoot ${volumeRoot}`);
  }

  mkdirSync(tenantDir, { recursive: true, mode: 0o700 });
  // Touch the file so better-sqlite3 can open it — equivalent to
  // `touch` but without the shell. If it already exists, openSync
  // with 'a' is a no-op on size.
  if (!existsSync(resolvedDb)) {
    const fd = openSync(resolvedDb, 'a');
    closeSync(fd);
  }

  return {
    strategy: 'sqlite',
    connStr: `sqlite://${resolvedDb.replace(/\\/g, '/')}`,
    path: resolvedDb,
  };
}

/**
 * Generate a Postgres schema name for an app. Format:
 *   t_<tenantSlug>_<appSlug>
 * (`t_` prefix keeps schema names distinct from Postgres built-ins like
 * public/information_schema/pg_*.)
 *
 * Postgres identifier limit is 63 chars. Slug limit of 40 + 40 + 2 for
 * the "t_" + 1 for the "_" separator = 83 chars, which exceeds the
 * limit in the worst case. We detect + reject overflow rather than
 * silently truncating (truncation would cause collisions).
 */
export function schemaNameFor(tenantSlug, appSlug) {
  validateSlug(tenantSlug, 'tenantSlug');
  validateSlug(appSlug, 'appSlug');
  const name = `t_${tenantSlug}_${appSlug}`.replace(/-/g, '_');
  if (name.length > 63) {
    throw new Error(
      `schema name "${name}" exceeds Postgres 63-char identifier limit. ` +
      `Shorten tenantSlug + appSlug combined (currently ${tenantSlug.length + appSlug.length + 3} chars).`
    );
  }
  return name;
}

/**
 * Generate a Postgres role name for an app. Same composition as
 * schema name but prefixed `r_` so roles + schemas don't collide on
 * name in diagnostic tooling.
 */
export function roleNameFor(tenantSlug, appSlug) {
  validateSlug(tenantSlug, 'tenantSlug');
  validateSlug(appSlug, 'appSlug');
  const name = `r_${tenantSlug}_${appSlug}`.replace(/-/g, '_');
  if (name.length > 63) {
    throw new Error(
      `role name "${name}" exceeds Postgres 63-char identifier limit.`
    );
  }
  return name;
}

/**
 * Provision a dedicated Postgres schema + role for an app.
 *
 * Runs 4 DDL statements inside a single transaction:
 *   1. CREATE ROLE <role> WITH LOGIN PASSWORD '<random>'
 *   2. CREATE SCHEMA IF NOT EXISTS <schema> AUTHORIZATION <role>
 *   3. GRANT USAGE ON SCHEMA <schema> TO <role>
 *   4. REVOKE ALL ON SCHEMA public FROM <role> (belt + suspenders —
 *      the role shouldn't inherit public by default, but explicit
 *      revoke matches the zero-leak contract from success criteria)
 *
 * Because we're interpolating identifiers (not values) into DDL, we
 * CANNOT use parameterized queries — Postgres doesn't accept bind
 * parameters for object names. Instead we rely on strict validateSlug
 * + quote_ident semantics (double-quote the identifier after sanitizing).
 *
 * @param {object} input
 * @param {string} input.tenantSlug
 * @param {string} input.appSlug
 * @param {{query: (text: string, params?: any[]) => Promise<object>}} input.pool - pg Pool or equivalent
 * @param {string} input.hostUrl - base connection URL (postgres://host:port/db) for the returned connStr
 * @returns {Promise<{strategy: 'postgres-schema', connStr: string, schema: string, role: string}>}
 */
export async function provisionPostgresSchema(input) {
  if (!input || !input.pool || typeof input.pool.query !== 'function') {
    throw new Error('provisionPostgresSchema: pool is required (pg Pool or compatible)');
  }
  if (!input.hostUrl || typeof input.hostUrl !== 'string') {
    throw new Error('provisionPostgresSchema: hostUrl (base postgres URL) is required');
  }
  const schema = schemaNameFor(input.tenantSlug, input.appSlug);
  const role = roleNameFor(input.tenantSlug, input.appSlug);
  // Generate a high-entropy password the role logs in with. Exposed
  // only via the returned connStr — stored nowhere else on disk (the
  // deploy pipeline writes it into the tenant's secrets). Random so
  // even a DB leak doesn't let anyone impersonate the app.
  const password = randomPassword();

  // Quote identifiers — slugs are sanitized but quoting is mandatory
  // per Postgres's identifier rules, and protects us if validateSlug
  // ever loosens.
  const qSchema = `"${schema}"`;
  const qRole = `"${role}"`;
  // Password literal — double-quote single quotes to escape them.
  const pwLit = `'${password.replace(/'/g, "''")}'`;

  // Batch in a transaction so a failure mid-sequence doesn't leave
  // half-configured state (role without schema, schema without grants,
  // etc.).
  await input.pool.query('BEGIN');
  try {
    await input.pool.query(`CREATE ROLE ${qRole} WITH LOGIN PASSWORD ${pwLit}`);
    await input.pool.query(`CREATE SCHEMA IF NOT EXISTS ${qSchema} AUTHORIZATION ${qRole}`);
    await input.pool.query(`GRANT USAGE ON SCHEMA ${qSchema} TO ${qRole}`);
    await input.pool.query(`REVOKE ALL ON SCHEMA public FROM ${qRole}`);
    await input.pool.query('COMMIT');
  } catch (err) {
    try { await input.pool.query('ROLLBACK'); } catch {}
    throw err;
  }

  const connStr = buildPostgresConnStr(input.hostUrl, role, password, schema);
  return { strategy: 'postgres-schema', connStr, schema, role };
}

/**
 * Drop a per-app DB on app deletion. Rollback is conservative — we
 * DON'T cascade drop tables inside the schema, because accidental
 * deletes are catastrophic. Caller is responsible for explicit data
 * cleanup OR can pass `force: true` to cascade.
 */
export async function deprovisionPostgresSchema(input) {
  if (!input || !input.pool || typeof input.pool.query !== 'function') {
    throw new Error('deprovisionPostgresSchema: pool required');
  }
  const schema = schemaNameFor(input.tenantSlug, input.appSlug);
  const role = roleNameFor(input.tenantSlug, input.appSlug);
  const qSchema = `"${schema}"`;
  const qRole = `"${role}"`;
  const cascade = input.force ? 'CASCADE' : 'RESTRICT';
  await input.pool.query('BEGIN');
  try {
    await input.pool.query(`DROP SCHEMA IF EXISTS ${qSchema} ${cascade}`);
    await input.pool.query(`DROP ROLE IF EXISTS ${qRole}`);
    await input.pool.query('COMMIT');
  } catch (err) {
    try { await input.pool.query('ROLLBACK'); } catch {}
    throw err;
  }
}

/**
 * Compose a Postgres connection string that pins a role + search_path.
 * search_path is URL-encoded so the runtime doesn't need to parse it
 * specially — `new URL(connStr).searchParams.get('options')` returns
 * the correct `-c search_path=...` flag.
 */
export function buildPostgresConnStr(hostUrl, role, password, schema) {
  // Parse the base URL so we can swap user/password cleanly.
  let u;
  try {
    u = new URL(hostUrl);
  } catch {
    throw new Error(`buildPostgresConnStr: invalid hostUrl "${hostUrl}"`);
  }
  u.username = encodeURIComponent(role);
  u.password = encodeURIComponent(password);
  // options=-c search_path=<schema> tells the Postgres client to run a
  // SET search_path immediately after connect — pins queries to the
  // app's schema so the runtime doesn't need schema-qualified table
  // names.
  u.searchParams.set('options', `-c search_path=${schema}`);
  return u.toString();
}

/**
 * Random high-entropy password. 32 bytes base64 — 256 bits of entropy,
 * safe inside a connection string (URL-safe-ish; we URL-encode when
 * embedding). Lazy-import crypto so this module has zero import cost
 * when only used for sqlite provisioning.
 */
function randomPassword() {
  const { randomBytes } = globalThis.crypto
    ? { randomBytes: (n) => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n))) }
    : require('crypto');
  // Using 24 bytes so the base64url output is 32 chars without padding.
  return randomBytes(24).toString('base64').replace(/[+/=]/g, '').slice(0, 32);
}
