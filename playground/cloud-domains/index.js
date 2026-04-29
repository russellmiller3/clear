/*
 * Clear Cloud custom-domain helpers — CC-5 scaffold.
 *
 * Pure-function boundary layer for the custom-domain flow:
 *   - normalizeDomain: accept messy user input, return DNS-clean string or null
 *   - expectedCnameFor: compute the CNAME target a user needs to add
 *   - verifyCname: decide verified / wrong / pending from PRE-FETCHED records
 *
 * Real DNS lookups (node:dns resolveCname) and the Fly Certificate API
 * integration live in higher layers. These helpers run in tests without
 * side effects — caller passes the records they got back from DNS and
 * we answer yes/no/still-propagating.
 *
 * Post-Phase-85a follow-up:
 *   - DNS poller (CC-5b): cron job that calls resolveCname + verifyCname
 *     per pending app, updates app_domains.status
 *   - SSL provision (CC-5c): Fly Certificate API call once verify=true
 *   - Router update (CC-5d): teach the Fly proxy to accept the custom
 *     domain for the app
 */

// =============================================================================
// Constants
// =============================================================================
const DEFAULT_ROOT_DOMAIN = process.env.CLEAR_CLOUD_ROOT_DOMAIN || 'buildclear.dev';
const MAX_DOMAIN_LEN = 253;  // DNS spec — full-qualified name cap

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { resolveCname as _defaultResolveCname } from 'node:dns/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_001_PATH = join(__dirname, 'migrations', '001-domains.sql');

/**
 * Load the CC-5a schema SQL as a string. Mirrors the pattern tenants-db
 * + cloud-auth + cloud-teams use (all CC modules expose their migration
 * file via loadMigration001 so the deploy pipeline can concat them in
 * order without hardcoding paths).
 */
export function loadMigration001() {
  return readFileSync(MIGRATION_001_PATH, 'utf8');
}

// =============================================================================
// normalizeDomain
// =============================================================================
/**
 * Turn user-typed input into a clean domain string, or null if it can't
 * be made valid. No exceptions — callers render the null as a validation
 * error in the UI. Accepts:
 *   - surrounding whitespace
 *   - http://, https:// prefixes
 *   - trailing slashes
 *   - trailing DNS dot ('deals.acme.com.')
 *   - mixed case
 *
 * Rejects (returns null):
 *   - empty or whitespace-only input
 *   - single-label names ('foo' with no TLD)
 *   - spaces inside the domain
 *   - overlong (>253 chars)
 *   - non-string input
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeDomain(raw) {
  if (typeof raw !== 'string') return null;
  let d = raw.trim();
  if (d.length === 0) return null;

  // Strip protocol prefix (http:// or https://) case-insensitive
  d = d.replace(/^https?:\/\//i, '');
  // Strip anything after first /
  const slash = d.indexOf('/');
  if (slash !== -1) d = d.slice(0, slash);
  // Strip trailing DNS absolute-form dot
  if (d.endsWith('.')) d = d.slice(0, -1);
  // Lowercase — DNS isn't case-sensitive
  d = d.toLowerCase();

  if (d.length === 0 || d.length > MAX_DOMAIN_LEN) return null;
  // Spaces inside the domain → invalid
  if (/\s/.test(d)) return null;
  // Require at least one dot (TLD) — single-label names can't be
  // public custom domains
  if (!d.includes('.')) return null;
  // Each label must be valid DNS (alphanumeric + hyphens, not starting
  // or ending with hyphen, max 63 chars). One consolidated regex:
  const labelRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  for (const label of d.split('.')) {
    if (!labelRe.test(label)) return null;
  }
  return d;
}

// =============================================================================
// expectedCnameFor
// =============================================================================
/**
 * Compute the CNAME target the user should add to their DNS for a given
 * app slug. Format: `app-<slug>.<root>` where root defaults to
 * buildclear.dev (override via CLEAR_CLOUD_ROOT_DOMAIN env or the second
 * arg, used in staging/dev).
 *
 * Slug gets slug-safed defensively (callers SHOULD pass clean slugs but
 * this helper never emits an illegal DNS label). Empty slug throws —
 * pointing a domain at nothing is a programmer error, not user input.
 *
 * @param {string} slug
 * @param {string} [rootDomain] - override default root
 * @returns {string}
 */
export function expectedCnameFor(slug, rootDomain) {
  const root = rootDomain || DEFAULT_ROOT_DOMAIN;
  const cleanSlug = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')  // non-DNS chars → hyphen
    .replace(/^-+|-+$/g, '');      // strip leading/trailing hyphens
  if (!cleanSlug) {
    throw new Error('cloud-domains: expectedCnameFor needs a non-empty slug.');
  }
  return `app-${cleanSlug}.${root}`;
}

// =============================================================================
// verifyCname
// =============================================================================
/**
 * Decide whether a domain's pre-fetched CNAME records verify against the
 * target we expected. Pure function — caller does the DNS lookup.
 *
 * Returns one of:
 *   - 'verified' — expected target appears in records (case/dot insensitive)
 *   - 'wrong'    — records exist but none match (user pointed somewhere else)
 *   - 'pending'  — no records yet (DNS hasn't propagated or not configured)
 *
 * 'pending' vs 'wrong' matters for the UI — 'pending' means keep waiting
 * (show spinner), 'wrong' means show an actionable error ("Your CNAME
 * points at X; we expected Y — fix your DNS and try again").
 *
 * @param {Array<string>|null|undefined} records - CNAME records from DNS (or null on lookup error)
 * @param {string} expected - the CNAME target expectedCnameFor returned
 * @returns {'verified'|'wrong'|'pending'}
 */
export function verifyCname(records, expected) {
  if (!records || !Array.isArray(records) || records.length === 0) {
    return 'pending';
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/\.$/, '');
  const target = norm(expected);
  for (const r of records) {
    if (norm(r) === target) return 'verified';
  }
  return 'wrong';
}

// =============================================================================
// STORAGE HELPERS — app_domains CRUD
// =============================================================================

/**
 * Add a custom domain to an app. Normalizes + validates the domain via
 * normalizeDomain, computes the expected_cname via expectedCnameFor,
 * writes a new `pending` row. Surfaces a readable error on invalid input
 * OR a duplicate domain.
 *
 * @param {object} db - pg Pool or compatible { query(text, params) }
 * @param {object} input - { appId, domain, appSlug, rootDomain? }
 * @returns {Promise<object>} inserted row
 */
export async function addDomain(db, input) {
  const appId = Number(input?.appId);
  if (!Number.isInteger(appId) || appId <= 0) {
    throw new Error('addDomain requires a positive-integer appId.');
  }
  const domain = normalizeDomain(input?.domain);
  if (!domain) {
    throw new Error(
      `Invalid domain: ${JSON.stringify(input?.domain)}. ` +
      `Must be a DNS-valid hostname like deals.acme.com.`
    );
  }
  const expectedCname = expectedCnameFor(input?.appSlug, input?.rootDomain);
  try {
    const { rows } = await db.query(
      `INSERT INTO app_domains (app_id, domain, expected_cname)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [appId, domain, expectedCname]
    );
    return rows[0];
  } catch (err) {
    // 23505 = unique_violation (Postgres error code for UNIQUE constraint)
    if (err?.code === '23505') {
      throw new Error(
        `Domain ${domain} is already attached to another app.`
      );
    }
    throw err;
  }
}

/**
 * Non-removed custom domains for a given app. Dashboard read.
 *
 * @param {object} db
 * @param {number} appId
 * @returns {Promise<Array>}
 */
export async function listDomainsForApp(db, appId) {
  const { rows } = await db.query(
    `SELECT * FROM app_domains WHERE app_id = $1 AND status != 'removed'
     ORDER BY created_at DESC`,
    [appId]
  );
  return rows;
}

/**
 * All pending-verification rows. CC-5b poller reads this every minute
 * (or as a SELECT FOR UPDATE SKIP LOCKED worker) and does resolveCname
 * + verifyCname + status update per row.
 *
 * @param {object} db
 * @returns {Promise<Array>}
 */
export async function listPendingDomains(db) {
  const { rows } = await db.query(
    `SELECT * FROM app_domains WHERE status = 'pending'
     ORDER BY last_checked_at NULLS FIRST, created_at ASC`
  );
  return rows;
}

// =============================================================================
// resolveDomainCname — production DNS resolver (CC-5b)
// =============================================================================
/**
 * Production-side DNS resolver. Wraps node:dns/promises.resolveCname so
 * pollOnce gets a stable contract:
 *
 *   - Array<string> of CNAME records on success (passthrough).
 *   - null when the domain isn't in DNS yet (ENOTFOUND) or has no CNAME
 *     records (ENODATA). Both are "still propagating" from the customer's
 *     point of view, not errors — pollOnce treats them as still-pending.
 *   - Throws on other errors (ESERVFAIL, ETIMEOUT, network down, etc.)
 *     so pollOnce's per-row try/catch captures the message into last_error.
 *     Surfacing real errors lets the dashboard say "DNS server timed out
 *     — we'll retry" instead of pretending nothing happened.
 *
 * The second argument is a dependency-injection seam for tests so the
 * wrapper logic verifies without hitting real DNS. Production callers
 * pass domain only.
 *
 * @param {string} domain
 * @param {(domain: string) => Promise<string[]>} [resolveCnameFn]
 * @returns {Promise<string[]|null>}
 */
export async function resolveDomainCname(domain, resolveCnameFn = _defaultResolveCname) {
  try {
    const records = await resolveCnameFn(domain);
    return records;
  } catch (err) {
    if (err && (err.code === 'ENOTFOUND' || err.code === 'ENODATA')) {
      return null;
    }
    throw err;
  }
}

// =============================================================================
// pollOnce — single DNS verification cycle (CC-5b)
// =============================================================================
/**
 * Read every pending domain, resolve its CNAME records via the injected
 * resolver, decide verified | wrong | still-pending against expected_cname,
 * and update the row. Returns a counts summary so the cron tick can log
 * how much work it did.
 *
 * Resolver contract:
 *   - Returns Array<string> of CNAME records on success.
 *   - Returns null when DNS not configured yet (treated as still-pending).
 *   - Throws on unexpected errors (DNS server down, network blip, etc.).
 *     Per-row try/catch keeps one bad lookup from killing the whole cycle.
 *
 * Idempotency: only rows with status='pending' get checked. Verified or
 * failed rows are left alone, so verified_at doesn't drift on re-checks.
 * Re-verification of a verified row would happen via a separate manual
 * trigger (e.g. customer rotates DNS).
 *
 * @param {object} db - pg Pool or compatible { query(text, params) }
 * @param {(domain: string) => Promise<string[]|null>} dnsResolver
 * @returns {Promise<{checked: number, verified: number, wrong: number, stillPending: number}>}
 */
export async function pollOnce(db, dnsResolver) {
  const pending = await listPendingDomains(db);
  const counts = { checked: 0, verified: 0, wrong: 0, stillPending: 0 };
  for (const row of pending) {
    counts.checked++;
    const now = new Date();
    let records = null;
    let resolverError = null;
    try {
      records = await dnsResolver(row.domain);
    } catch (err) {
      resolverError = (err && err.message) ? err.message : String(err);
    }
    if (resolverError) {
      // Resolver threw — keep the row pending but record the message so
      // the dashboard can show "still trying — last error was X" instead
      // of pretending nothing went wrong.
      await db.query(
        `UPDATE app_domains SET status = $1, last_checked_at = $2, last_error = $3 WHERE id = $4`,
        ['pending', now, String(resolverError).slice(0, 500), row.id]
      );
      counts.stillPending++;
      continue;
    }
    const verdict = verifyCname(records, row.expected_cname);
    if (verdict === 'verified') {
      await db.query(
        `UPDATE app_domains SET status = $1, verified_at = $2, last_checked_at = $3, last_error = $4 WHERE id = $5`,
        ['verified', now, now, null, row.id]
      );
      counts.verified++;
    } else if (verdict === 'wrong') {
      const got = (records || []).join(', ') || '(none)';
      const msg = `Your CNAME points at ${got}; we expected ${row.expected_cname}.`;
      await db.query(
        `UPDATE app_domains SET status = $1, last_checked_at = $2, last_error = $3 WHERE id = $4`,
        ['failed', now, msg.slice(0, 500), row.id]
      );
      counts.wrong++;
    } else {
      // verdict === 'pending' — DNS not propagated yet. Update last_checked_at
      // so the dashboard shows the poller actually ran; clear any stale error
      // from a previous transient resolver failure.
      await db.query(
        `UPDATE app_domains SET status = $1, last_checked_at = $2, last_error = $3 WHERE id = $4`,
        ['pending', now, null, row.id]
      );
      counts.stillPending++;
    }
  }
  return counts;
}

// =============================================================================
// startDomainPoller — interval scheduler (CC-5b)
// =============================================================================
/**
 * Production glue that drives pollOnce on a tick. Returns a handle the
 * server can use to stop the loop on shutdown.
 *
 * Why this is its own function (vs. a one-liner setInterval call):
 *   - Wraps each tick in try/catch so a single failed cycle (db blip,
 *     network hiccup) doesn't crash the host process via unhandledRejection.
 *   - tickNow() lets callers force a cycle on demand (CLI tools, manual
 *     "verify now" buttons, integration tests) without waiting for the
 *     next tick.
 *   - Timer hooks are injectable so tests can drive the tick logic
 *     without real setTimeout latency.
 *
 * @param {object} options
 * @param {object} options.db - pg Pool or compatible
 * @param {function} [options.dnsResolver] - defaults to resolveDomainCname
 * @param {number}   [options.intervalMs=60000] - tick spacing; default 1 min
 * @param {boolean}  [options.autoStart=true] - register the setInterval immediately
 * @param {function} [options.setIntervalFn=globalThis.setInterval]
 * @param {function} [options.clearIntervalFn=globalThis.clearInterval]
 * @param {function} [options.onError=console.error] - called with errors from
 *                   pollOnce that escape its per-row try/catch (e.g. db down)
 * @returns {{ stop: () => void, tickNow: () => Promise<object> }}
 */
export function startDomainPoller(options) {
  const {
    db,
    dnsResolver = resolveDomainCname,
    intervalMs = 60_000,
    autoStart = true,
    setIntervalFn = globalThis.setInterval,
    clearIntervalFn = globalThis.clearInterval,
    onError = (err) => console.error('[domain-poller]', err && err.message ? err.message : err),
  } = options || {};

  if (!db || typeof db.query !== 'function') {
    throw new Error('startDomainPoller: options.db with .query() is required.');
  }

  let intervalToken = null;

  async function tickNow() {
    try {
      return await pollOnce(db, dnsResolver);
    } catch (err) {
      onError(err);
      return { checked: 0, verified: 0, wrong: 0, stillPending: 0, error: err };
    }
  }

  function stop() {
    if (intervalToken !== null) {
      clearIntervalFn(intervalToken);
      intervalToken = null;
    }
  }

  if (autoStart) {
    // Async wrapper so awaiting the registered callback in a test (or
    // any caller that wants to drive the tick synchronously) actually
    // awaits the underlying work. tickNow already swallows its own errors
    // via onError, so this is fire-and-forget-safe in production.
    intervalToken = setIntervalFn(async () => { await tickNow(); }, intervalMs);
  }

  return { stop, tickNow };
}

// =============================================================================
// bootstrapDomainPoller — server-startup gate (CC-5b)
// =============================================================================
/**
 * Thin helper that Studio's bootstrap calls. Decides whether to start
 * the poller based on whether a real Postgres pool is available. Without
 * DATABASE_URL there's no app_domains table to poll — skip cleanly with
 * a human-readable reason for the startup log.
 *
 * @param {object} opts
 * @param {object|null} opts.pool - pg Pool from makeTenantStore, or null
 * @param {number} [opts.intervalMs] - forwarded to startDomainPoller
 * @param {function} [opts.startFn=startDomainPoller] - DI seam for tests
 * @returns {{ started: boolean, handle: object|null, reason: string|null }}
 */
export function bootstrapDomainPoller(opts = {}) {
  const { pool, startFn = startDomainPoller, ...rest } = opts;
  if (!pool) {
    return {
      started: false,
      handle: null,
      reason: 'no DATABASE_URL pool — domain verification skipped (in-memory mode)',
    };
  }
  const handle = startFn({ db: pool, ...rest });
  return { started: true, handle, reason: null };
}
