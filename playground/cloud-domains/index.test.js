// =============================================================================
// CC-5 — Custom domain helpers (TDD tests)
// =============================================================================
// Pure-function scaffold for CC-5a/b. Real DNS lookups + Fly Certificate
// API come later; these helpers are the boundary layer that lets the
// domain-settings UI + verification poller run without side effects in
// tests.
//
// Run: node playground/cloud-domains/index.test.js
// =============================================================================

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

// ─── normalizeDomain — accepts messy user input, returns clean shape ────
console.log('\n🌐 normalizeDomain\n');

{
  const { normalizeDomain } = await import('./index.js');

  // Happy path — already clean
  assert(normalizeDomain('deals.acme.com') === 'deals.acme.com',
    `already-clean domain returned as-is`);

  // Case folds
  assert(normalizeDomain('DEALS.ACME.COM') === 'deals.acme.com',
    `uppercase folded to lowercase`);

  // Trim + strip protocol
  assert(normalizeDomain('  https://deals.acme.com  ') === 'deals.acme.com',
    `https:// + whitespace stripped`);
  assert(normalizeDomain('http://deals.acme.com/') === 'deals.acme.com',
    `http:// + trailing slash stripped`);

  // Strip trailing dot (DNS absolute form)
  assert(normalizeDomain('deals.acme.com.') === 'deals.acme.com',
    `trailing DNS dot stripped`);

  // Invalid shapes return null — caller shows validation error instead
  // of silently accepting junk that'll never verify
  assert(normalizeDomain('') === null, `empty string → null`);
  assert(normalizeDomain('   ') === null, `whitespace-only → null`);
  assert(normalizeDomain(null) === null, `null input → null (no throw)`);
  assert(normalizeDomain('no-tld') === null, `single-label → null (needs .tld)`);
  assert(normalizeDomain('spaces in middle.com') === null,
    `spaces inside the domain → null`);
  assert(normalizeDomain('a.b.c.d.e.f.g.h.i.j.' + 'x'.repeat(260)) === null,
    `>253 chars → null (DNS spec limit)`);

  // Idempotent — normalize(normalize(x)) === normalize(x)
  const once = normalizeDomain('HTTPS://Deals.Acme.com/');
  const twice = normalizeDomain(once);
  assert(once === twice, `idempotent (got ${once} vs ${twice})`);
}

// ─── expectedCnameFor — the DNS record the user needs to add ────────────
console.log('\n🔗 expectedCnameFor\n');

{
  const { expectedCnameFor } = await import('./index.js');

  // Default root domain comes from CLEAR_CLOUD_ROOT_DOMAIN env (see
  // HANDOFF env list) or falls back to 'buildclear.dev'
  const r1 = expectedCnameFor('approvals');
  assert(r1 === 'app-approvals.buildclear.dev' || r1 === 'approvals.buildclear.dev'
    || r1.endsWith('.buildclear.dev'),
    `returns a buildclear.dev CNAME target (got ${r1})`);

  // Explicit root domain override (staging/dev)
  const r2 = expectedCnameFor('approvals', 'stage.buildclear.dev');
  assert(r2.endsWith('.stage.buildclear.dev'),
    `root-domain override respected (got ${r2})`);

  // Slug is part of the target — ambiguity would break routing
  assert(expectedCnameFor('crm') !== expectedCnameFor('approvals'),
    `different slugs → different targets`);

  // Slug gets slug-safed (matches buildclear.dev app-slug rules —
  // lowercase, no spaces). Callers SHOULD pass clean slugs but the
  // helper is defensive.
  const r3 = expectedCnameFor('My Approvals!');
  assert(!/[^a-z0-9.-]/.test(r3),
    `bad slug chars stripped from CNAME target (got ${r3})`);

  // Empty slug throws — you can't point a domain at nothing
  let threw;
  try { expectedCnameFor(''); } catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('slug'),
    `empty slug rejected (got "${threw}")`);
}

// ─── verifyCname — pure check against pre-fetched DNS records ───────────
// Caller does the real DNS lookup (dns.resolveCname from node:dns or a
// mock in tests); this helper answers "do the records match what we
// expected?" Returns one of 'verified' | 'wrong' | 'pending' (empty
// records = not set up yet).
console.log('\n🔎 verifyCname — pure verification result\n');

{
  const { verifyCname } = await import('./index.js');

  // Exact match → verified
  assert(verifyCname(['app-approvals.buildclear.dev'], 'app-approvals.buildclear.dev') === 'verified',
    `exact match → verified`);

  // Case insensitive — DNS isn't case-sensitive
  assert(verifyCname(['APP-APPROVALS.BUILDCLEAR.DEV'], 'app-approvals.buildclear.dev') === 'verified',
    `case-insensitive match → verified`);

  // Trailing-dot tolerance (absolute DNS form)
  assert(verifyCname(['app-approvals.buildclear.dev.'], 'app-approvals.buildclear.dev') === 'verified',
    `trailing-dot match → verified`);

  // Empty records → pending (DNS propagation; not an error yet)
  assert(verifyCname([], 'app-approvals.buildclear.dev') === 'pending',
    `no records → pending (nothing configured yet)`);

  // Wrong target → wrong (actionable error for the UI)
  assert(verifyCname(['example.com'], 'app-approvals.buildclear.dev') === 'wrong',
    `wrong target → wrong`);

  // Multiple records with the expected one present → verified
  assert(verifyCname(['other.example.com', 'app-approvals.buildclear.dev'],
    'app-approvals.buildclear.dev') === 'verified',
    `expected among multiple → verified`);

  // Multiple records, none matching → wrong
  assert(verifyCname(['a.example.com', 'b.example.com'], 'app-approvals.buildclear.dev') === 'wrong',
    `none of multiple match → wrong`);

  // Null/undefined records = pending (DNS error / domain doesn't
  // resolve yet — same state as empty from the UI's perspective)
  assert(verifyCname(null, 'app-approvals.buildclear.dev') === 'pending',
    `null records → pending`);
  assert(verifyCname(undefined, 'app-approvals.buildclear.dev') === 'pending',
    `undefined records → pending`);
}

// ─── Schema drift-guard ─────────────────────────────────────────────────
// CC-5a app_domains schema must exist and carry the columns the query
// helpers below need. Runs against the SQL file directly (no real
// Postgres required at this layer).
console.log('\n📐 app_domains migration drift-guard\n');

{
  const fs = await import('fs');
  const path = await import('path');
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
  const migrationPath = path.join(here, 'migrations', '001-domains.sql');
  const exists = fs.existsSync(migrationPath);
  assert(exists, `migration file exists at ${migrationPath}`);

  if (exists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert(/CREATE TABLE\s+(IF NOT EXISTS\s+)?app_domains\b/i.test(sql),
      'migration creates app_domains table');

    // Columns the helpers below query
    for (const col of ['app_id', 'domain', 'expected_cname', 'status',
                        'verified_at', 'last_checked_at',
                        'created_at', 'updated_at']) {
      assert(new RegExp('\\b' + col + '\\b', 'i').test(sql),
        `migration declares app_domains.${col}`);
    }
    // domain must be UNIQUE — one domain can only point at one app
    assert(/domain\s+[^\n,]*UNIQUE|UNIQUE\s*\(\s*domain\s*\)/i.test(sql),
      'domain column is UNIQUE across all apps');
    // status CHECK constraint — pending|verified|failed|removed
    assert(/status[\s\S]{0,200}pending[\s\S]{0,200}verified/i.test(sql),
      'status CHECK constraint encodes pending|verified');
  }
}

// ─── loadMigration001 — file loader (mirrors tenants-db pattern) ────────
console.log('\n📂 loadMigration001\n');

{
  const { loadMigration001 } = await import('./index.js');
  const sql = loadMigration001();
  assert(typeof sql === 'string' && sql.length > 100,
    `returns SQL string (${sql.length} bytes)`);
  assert(sql.toLowerCase().includes('create table'), 'SQL contains CREATE TABLE');
}

// ─── addDomain / listDomainsForApp / listPendingDomains ─────────────────
console.log('\n🗂️  addDomain + listDomainsForApp + listPendingDomains\n');

{
  // Minimal mock db for SQL shapes these helpers emit
  function mockDomainsDb() {
    const rows = [];
    let nextId = 1;
    return {
      rows,
      async query(text, params = []) {
        const t = text.replace(/\s+/g, ' ').trim();
        if (/^INSERT INTO app_domains/i.test(t)) {
          const [app_id, domain, expected_cname] = params;
          // Simulate UNIQUE(domain) constraint
          if (rows.some(r => r.domain === domain && r.status !== 'removed')) {
            const err = new Error('duplicate key value violates unique constraint "app_domains_domain_key"');
            err.code = '23505';
            throw err;
          }
          const row = {
            id: nextId++,
            app_id, domain, expected_cname,
            status: 'pending',
            verified_at: null,
            last_checked_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          };
          rows.push(row);
          return { rows: [row] };
        }
        if (/^SELECT \* FROM app_domains WHERE app_id/i.test(t)) {
          const [app_id] = params;
          return { rows: rows.filter(r => r.app_id === app_id && r.status !== 'removed') };
        }
        if (/^SELECT \* FROM app_domains WHERE status\s*=\s*'pending'/i.test(t)) {
          return { rows: rows.filter(r => r.status === 'pending') };
        }
        throw new Error('mock unhandled: ' + t.slice(0, 80));
      },
    };
  }

  const { addDomain, listDomainsForApp, listPendingDomains } = await import('./index.js');

  const db = mockDomainsDb();

  // Happy path — add a domain
  const r1 = await addDomain(db, {
    appId: 100,
    domain: 'DEALS.ACME.COM',  // upper-case; helper normalizes
    appSlug: 'deals',
  });
  assert(r1.app_id === 100, `app_id plumbed through`);
  assert(r1.domain === 'deals.acme.com',
    `domain normalized on insert (got ${r1.domain})`);
  assert(r1.expected_cname.endsWith('buildclear.dev') || r1.expected_cname.endsWith('.dev'),
    `expected_cname set to the app-<slug>.<root> target (got ${r1.expected_cname})`);
  assert(r1.status === 'pending', `fresh row → status 'pending'`);

  // Reject invalid domain
  let threw;
  try { await addDomain(db, { appId: 100, domain: 'not-a-domain', appSlug: 'deals' }); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('domain'),
    `invalid domain rejected before DB hit (got "${threw}")`);

  // Duplicate domain — DB constraint raises 23505, helper surfaces
  // a readable error (same pattern cloud-teams.createTeam uses)
  threw = null;
  try { await addDomain(db, { appId: 200, domain: 'deals.acme.com', appSlug: 'other' }); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('already'),
    `duplicate → "already" error, not raw Postgres (got "${threw}")`);

  // listDomainsForApp — returns only that app's non-removed domains
  const listed = await listDomainsForApp(db, 100);
  assert(Array.isArray(listed) && listed.length === 1,
    `one domain for app 100 (got ${listed.length})`);
  assert(listed[0].domain === 'deals.acme.com', `correct domain returned`);

  // Other app → empty
  const other = await listDomainsForApp(db, 200);
  assert(Array.isArray(other) && other.length === 0,
    `app 200 has no domains`);

  // listPendingDomains — for CC-5b verification poller
  await addDomain(db, { appId: 300, domain: 'www.other.com', appSlug: 'other' });
  const pending = await listPendingDomains(db);
  assert(pending.length === 2,
    `both freshly-added (status=pending) domains returned (got ${pending.length})`);
  assert(pending.every(d => d.status === 'pending'),
    `all returned rows have status='pending'`);
}

// ─── verifyPendingDomains — CC-5b background poller ─────────────────────
// The cron that wakes every N minutes, reads pending app_domains rows,
// does DNS lookups, and updates status. Caller injects resolveCnameFn
// so tests mock it without real DNS; production injects
// node:dns/promises.resolveCname.
console.log('\n⏱️  verifyPendingDomains — DNS poller\n');

{
  function mockPollerDb() {
    const rows = [];
    let nextId = 1;
    const updates = [];
    return {
      rows, updates,
      async query(text, params = []) {
        const t = text.replace(/\s+/g, ' ').trim();
        if (/^INSERT INTO app_domains/i.test(t)) {
          const [app_id, domain, expected_cname] = params;
          const row = {
            id: nextId++, app_id, domain, expected_cname,
            status: 'pending', verified_at: null, last_checked_at: null,
            last_error: null,
          };
          rows.push(row);
          return { rows: [row] };
        }
        if (/^SELECT \* FROM app_domains WHERE status\s*=\s*'pending'/i.test(t)) {
          return { rows: rows.filter(r => r.status === 'pending') };
        }
        if (/^UPDATE app_domains SET status\s*=\s*'verified'/i.test(t)) {
          const [id] = params;
          const r = rows.find(x => x.id === id);
          if (r) { r.status = 'verified'; r.verified_at = new Date(); r.last_checked_at = new Date(); r.last_error = null; }
          updates.push({ id, to: 'verified' });
          return { rowCount: r ? 1 : 0 };
        }
        if (/^UPDATE app_domains SET status\s*=\s*'failed'/i.test(t)) {
          const [id, err] = params;
          const r = rows.find(x => x.id === id);
          if (r) { r.status = 'failed'; r.last_checked_at = new Date(); r.last_error = err; }
          updates.push({ id, to: 'failed', err });
          return { rowCount: r ? 1 : 0 };
        }
        if (/^UPDATE app_domains SET last_checked_at\s*=\s*NOW\(\)/i.test(t)) {
          const [id] = params;
          const r = rows.find(x => x.id === id);
          if (r) r.last_checked_at = new Date();
          updates.push({ id, to: 'still-pending' });
          return { rowCount: r ? 1 : 0 };
        }
        throw new Error('mockPollerDb unhandled: ' + t.slice(0, 100));
      },
    };
  }

  const { addDomain, verifyPendingDomains } = await import('./index.js');

  // Setup: 3 pending domains
  const db = mockPollerDb();
  await addDomain(db, { appId: 1, domain: 'a.com', appSlug: 'alpha' });
  await addDomain(db, { appId: 2, domain: 'b.com', appSlug: 'beta' });
  await addDomain(db, { appId: 3, domain: 'c.com', appSlug: 'charlie' });

  // Mock resolver:
  //   - a.com resolves to the expected CNAME → verified
  //   - b.com resolves to something else → failed (wrong)
  //   - c.com returns [] (DNS not propagated) → still pending
  const resolver = async (domain) => {
    if (domain === 'a.com') return ['app-alpha.buildclear.dev'];
    if (domain === 'b.com') return ['some-other-target.com'];
    if (domain === 'c.com') return [];
    throw new Error(`unexpected domain: ${domain}`);
  };

  const summary = await verifyPendingDomains(db, resolver);

  assert(summary.checked === 3, `checked all 3 pending rows (got ${summary.checked})`);
  assert(summary.verified === 1, `1 verified (got ${summary.verified})`);
  assert(summary.failed === 1, `1 failed (got ${summary.failed})`);
  assert(summary.stillPending === 1,
    `1 still pending (got ${summary.stillPending})`);

  // Row-level state after the run
  const a = db.rows.find(r => r.domain === 'a.com');
  const b = db.rows.find(r => r.domain === 'b.com');
  const c = db.rows.find(r => r.domain === 'c.com');
  assert(a.status === 'verified', `a.com → verified (got ${a.status})`);
  assert(a.verified_at instanceof Date, `a.com has verified_at timestamp`);
  assert(b.status === 'failed', `b.com → failed (got ${b.status})`);
  assert(b.last_error && b.last_error.toLowerCase().includes('wrong'),
    `b.com last_error names the wrong target (got "${b.last_error}")`);
  assert(c.status === 'pending', `c.com stays pending (got ${c.status})`);
  assert(c.last_checked_at instanceof Date,
    `c.com last_checked_at timestamp bumped`);

  // Resolver throws (DNS error) → row stays pending, last_checked_at bumps
  const db2 = mockPollerDb();
  await addDomain(db2, { appId: 1, domain: 'timeout.com', appSlug: 'alpha' });
  const throwingResolver = async () => { throw new Error('ETIMEDOUT'); };
  const summary2 = await verifyPendingDomains(db2, throwingResolver);
  assert(summary2.checked === 1 && summary2.stillPending === 1,
    `resolver error → row stays pending, not crashed (got ${JSON.stringify(summary2)})`);

  // Empty pending list → summary with zero counts
  const db3 = mockPollerDb();
  const summary3 = await verifyPendingDomains(db3, resolver);
  assert(summary3.checked === 0 && summary3.verified === 0,
    `no pending rows → all counts zero (got ${JSON.stringify(summary3)})`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
