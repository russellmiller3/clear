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
