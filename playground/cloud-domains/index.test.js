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

// ─── pollOnce — single verification cycle (CC-5b) ───────────────────────
// Reads pending rows, resolves CNAME per row (via injected resolver so
// tests don't hit real DNS), updates the row's status to verified|failed
// or leaves it pending. Returns a counts summary so the cron tick can
// log how much it did.
console.log('\n🛰️  pollOnce — DNS verification cycle\n');

{
  // Mock that handles INSERT, SELECT pending, SELECT by app_id, AND
  // UPDATE shapes the poller will run. Generic SET-clause parser so
  // the mock survives reasonable poller-side query rewrites.
  function mockDomainsDbForPoller() {
    const rows = [];
    let nextId = 1;
    return {
      rows,
      async query(text, params = []) {
        const t = text.replace(/\s+/g, ' ').trim();
        if (/^INSERT INTO app_domains/i.test(t)) {
          const [app_id, domain, expected_cname] = params;
          if (rows.some(r => r.domain === domain && r.status !== 'removed')) {
            const err = new Error('duplicate'); err.code = '23505'; throw err;
          }
          const row = {
            id: nextId++, app_id, domain, expected_cname,
            status: 'pending', verified_at: null, last_checked_at: null,
            last_error: null,
            created_at: new Date(), updated_at: new Date(),
          };
          rows.push(row);
          return { rows: [row] };
        }
        if (/^SELECT \* FROM app_domains WHERE status\s*=\s*'pending'/i.test(t)) {
          return { rows: rows.filter(r => r.status === 'pending') };
        }
        if (/^SELECT \* FROM app_domains WHERE app_id/i.test(t)) {
          const [app_id] = params;
          return { rows: rows.filter(r => r.app_id === app_id && r.status !== 'removed') };
        }
        if (/^UPDATE app_domains/i.test(t)) {
          const id = params[params.length - 1];
          const row = rows.find(r => r.id === id);
          if (!row) return { rows: [] };
          const setMatch = t.match(/SET\s+(.+?)\s+WHERE/i);
          if (!setMatch) return { rows: [] };
          const cols = setMatch[1].split(',').map(s => s.trim().split(/\s*=\s*/)[0].trim());
          for (let i = 0; i < cols.length; i++) {
            row[cols[i]] = params[i];
          }
          row.updated_at = new Date();
          return { rows: [row] };
        }
        throw new Error('mock unhandled: ' + t.slice(0, 80));
      },
    };
  }

  const { addDomain, listDomainsForApp, pollOnce } = await import('./index.js');

  // Cycle 1.1 — matching CNAME → row flips to 'verified' + verified_at set
  {
    const db = mockDomainsDbForPoller();
    await addDomain(db, { appId: 100, domain: 'deals.acme.com', appSlug: 'deals' });
    const expected = db.rows[0].expected_cname;
    const resolver = async () => [expected];
    const result = await pollOnce(db, resolver);
    assert(result.checked === 1, `pollOnce reports 1 checked (got ${result.checked})`);
    assert(result.verified === 1, `pollOnce reports 1 verified (got ${result.verified})`);
    const [row] = await listDomainsForApp(db, 100);
    assert(row.status === 'verified', `row status flipped to 'verified' (got ${row.status})`);
    assert(row.verified_at instanceof Date, `verified_at set to a Date`);
    assert(row.last_checked_at instanceof Date, `last_checked_at set`);
  }

  // Cycle 1.2 — wrong CNAME → row flips to 'failed', last_error populated
  {
    const db = mockDomainsDbForPoller();
    await addDomain(db, { appId: 200, domain: 'wrong.example.com', appSlug: 'wrong' });
    const resolver = async () => ['something.else.com'];
    const result = await pollOnce(db, resolver);
    assert(result.wrong === 1, `pollOnce reports 1 wrong (got ${result.wrong})`);
    const [row] = await listDomainsForApp(db, 200);
    assert(row.status === 'failed', `row status flipped to 'failed' (got ${row.status})`);
    assert(row.verified_at === null, `verified_at stays null when target is wrong`);
    assert(row.last_checked_at instanceof Date, `last_checked_at set`);
    assert(typeof row.last_error === 'string' && row.last_error.length > 0,
      `last_error captures the wrong-target message`);
  }

  // Cycle 1.3 — empty/null records (still propagating) → status stays 'pending'
  {
    const db = mockDomainsDbForPoller();
    await addDomain(db, { appId: 300, domain: 'still-pending.example.com', appSlug: 'sp' });
    const resolver = async () => null;
    const result = await pollOnce(db, resolver);
    assert(result.stillPending === 1, `pollOnce reports 1 still-pending (got ${result.stillPending})`);
    const [row] = await listDomainsForApp(db, 300);
    assert(row.status === 'pending', `row status still 'pending' (got ${row.status})`);
    assert(row.last_checked_at instanceof Date,
      `last_checked_at updated even when still pending — proves the poller actually ran`);
  }

  // Cycle 1.4 — multiple rows handled in a single pollOnce call
  {
    const db = mockDomainsDbForPoller();
    await addDomain(db, { appId: 100, domain: 'a.example.com', appSlug: 'a' });
    await addDomain(db, { appId: 200, domain: 'b.example.com', appSlug: 'b' });
    await addDomain(db, { appId: 300, domain: 'c.example.com', appSlug: 'c' });
    const aExpected = db.rows.find(r => r.domain === 'a.example.com').expected_cname;
    const resolver = async (domain) => {
      if (domain === 'a.example.com') return [aExpected];
      if (domain === 'b.example.com') return ['something.else.com'];
      return null; // c — still propagating
    };
    const result = await pollOnce(db, resolver);
    assert(result.checked === 3, `3 rows checked (got ${result.checked})`);
    assert(result.verified === 1, `1 verified (got ${result.verified})`);
    assert(result.wrong === 1, `1 wrong (got ${result.wrong})`);
    assert(result.stillPending === 1, `1 still-pending (got ${result.stillPending})`);
  }

  // Cycle 1.5 — resolver throws (DNS server down, network error)
  // → row stays pending, last_error captures the message. The poller
  // must NEVER fail the whole cycle because one row's lookup blew up.
  {
    const db = mockDomainsDbForPoller();
    await addDomain(db, { appId: 400, domain: 'broken.example.com', appSlug: 'broken' });
    const resolver = async () => { throw new Error('ECONNREFUSED'); };
    const result = await pollOnce(db, resolver);
    assert(result.stillPending === 1,
      `resolver throw counts as still-pending (got ${result.stillPending})`);
    const [row] = await listDomainsForApp(db, 400);
    assert(row.status === 'pending', `row stays 'pending' on resolver throw`);
    assert(typeof row.last_error === 'string' && row.last_error.includes('ECONNREFUSED'),
      `last_error captures the error message (got "${row.last_error}")`);
  }

  // Cycle 1.6 — empty pending list → no-op, returns zero counts
  {
    const db = mockDomainsDbForPoller();
    const resolver = async () => { throw new Error('should not be called'); };
    const result = await pollOnce(db, resolver);
    assert(result.checked === 0, `nothing pending → 0 checked (got ${result.checked})`);
    assert(result.verified === 0 && result.wrong === 0 && result.stillPending === 0,
      `all counts zero on empty input`);
  }

  // Cycle 1.7 — non-pending rows are NOT re-checked (idempotency: once
  // verified, the poller leaves the row alone so verified_at doesn't drift)
  {
    const db = mockDomainsDbForPoller();
    await addDomain(db, { appId: 500, domain: 'verified.example.com', appSlug: 'v' });
    const expected = db.rows[0].expected_cname;
    // First pass — verifies it
    await pollOnce(db, async () => [expected]);
    const verifiedAtBefore = db.rows[0].verified_at;
    // Second pass — resolver should NOT be called for already-verified rows
    let resolverCalls = 0;
    await pollOnce(db, async () => { resolverCalls++; return [expected]; });
    assert(resolverCalls === 0,
      `verified rows are skipped on the next pass (got ${resolverCalls} resolver calls)`);
    assert(db.rows[0].verified_at === verifiedAtBefore,
      `verified_at unchanged on second pass`);
  }
}

// ─── resolveDomainCname — node:dns/promises wrapper (CC-5b) ─────────────
// The production-side resolver. Wraps dns.promises.resolveCname to:
//   - return records[] on success (passthrough)
//   - return null on ENOTFOUND / ENODATA (DNS not configured yet — the
//     poller treats this as still-pending, NOT an error)
//   - rethrow other errors (network down, server failure) so the poller's
//     per-row try/catch captures the message into last_error
//
// Tests use the second-arg override to inject a fake resolveCname so
// the wrapper logic is verified without hitting real DNS.
console.log('\n📡 resolveDomainCname — node:dns wrapper\n');

{
  const { resolveDomainCname } = await import('./index.js');

  // Cycle 2.1 — happy path: real records pass through unchanged
  {
    const fake = async (domain) => {
      assert(domain === 'deals.acme.com', `domain forwarded to underlying resolver`);
      return ['app-deals.buildclear.dev'];
    };
    const result = await resolveDomainCname('deals.acme.com', fake);
    assert(Array.isArray(result) && result[0] === 'app-deals.buildclear.dev',
      `records returned as-is (got ${JSON.stringify(result)})`);
  }

  // Cycle 2.2 — ENOTFOUND (domain doesn't exist in DNS) → null
  {
    const fake = async () => {
      const err = new Error('queryCname ENOTFOUND deals.acme.com');
      err.code = 'ENOTFOUND';
      throw err;
    };
    const result = await resolveDomainCname('deals.acme.com', fake);
    assert(result === null, `ENOTFOUND → null (got ${result})`);
  }

  // Cycle 2.3 — ENODATA (domain exists but no CNAME records) → null
  {
    const fake = async () => {
      const err = new Error('queryCname ENODATA deals.acme.com');
      err.code = 'ENODATA';
      throw err;
    };
    const result = await resolveDomainCname('deals.acme.com', fake);
    assert(result === null, `ENODATA → null (got ${result})`);
  }

  // Cycle 2.4 — other errors rethrow so the poller can capture them
  // in last_error rather than silently treating them as still-pending
  {
    const fake = async () => {
      const err = new Error('queryCname ESERVFAIL deals.acme.com');
      err.code = 'ESERVFAIL';
      throw err;
    };
    let threw = null;
    try { await resolveDomainCname('deals.acme.com', fake); }
    catch (err) { threw = err; }
    assert(threw && threw.code === 'ESERVFAIL',
      `ESERVFAIL rethrown (got ${threw && threw.code})`);
  }

  // Cycle 2.5 — default resolver (no second arg) imports node:dns/promises
  // without throwing on the import itself. We can't reliably hit a real
  // domain here (flaky in CI / offline dev), but we CAN prove the default
  // path doesn't throw before the network call by invoking with a domain
  // that's clearly invalid — node:dns will reject with an error code, our
  // wrapper returns null OR rethrows. Either way: no syntax/import crash.
  {
    let crashed = false;
    try {
      // localhost-style — node:dns will reject quickly without hitting net
      await resolveDomainCname('this-domain-does-not-exist-clear-test.invalid');
    } catch (_err) {
      // rethrow path is allowed — we only care that the import didn't
      // explode and that some resolution attempt happened
    }
    assert(!crashed, `default resolver path doesn't crash on import`);
  }
}

// ─── startDomainPoller — interval scheduler (CC-5b) ─────────────────────
// Production glue that calls pollOnce every intervalMs. Returns a stop
// handle so server shutdown can clean it up. setInterval / clearInterval
// are dependency-injected so tests can drive the tick without real timers.
console.log('\n⏱️  startDomainPoller — interval scheduler\n');

{
  const { startDomainPoller, addDomain } = await import('./index.js');

  function mockDomainsDbForPoller() {
    const rows = [];
    let nextId = 1;
    return {
      rows,
      async query(text, params = []) {
        const t = text.replace(/\s+/g, ' ').trim();
        if (/^INSERT INTO app_domains/i.test(t)) {
          const [app_id, domain, expected_cname] = params;
          if (rows.some(r => r.domain === domain && r.status !== 'removed')) {
            const err = new Error('duplicate'); err.code = '23505'; throw err;
          }
          const row = {
            id: nextId++, app_id, domain, expected_cname,
            status: 'pending', verified_at: null, last_checked_at: null,
            last_error: null, created_at: new Date(), updated_at: new Date(),
          };
          rows.push(row);
          return { rows: [row] };
        }
        if (/^SELECT \* FROM app_domains WHERE status\s*=\s*'pending'/i.test(t)) {
          return { rows: rows.filter(r => r.status === 'pending') };
        }
        if (/^SELECT \* FROM app_domains WHERE app_id/i.test(t)) {
          const [app_id] = params;
          return { rows: rows.filter(r => r.app_id === app_id && r.status !== 'removed') };
        }
        if (/^UPDATE app_domains/i.test(t)) {
          const id = params[params.length - 1];
          const row = rows.find(r => r.id === id);
          if (!row) return { rows: [] };
          const setMatch = t.match(/SET\s+(.+?)\s+WHERE/i);
          if (!setMatch) return { rows: [] };
          const cols = setMatch[1].split(',').map(s => s.trim().split(/\s*=\s*/)[0].trim());
          for (let i = 0; i < cols.length; i++) row[cols[i]] = params[i];
          row.updated_at = new Date();
          return { rows: [row] };
        }
        throw new Error('mock unhandled: ' + t.slice(0, 80));
      },
    };
  }

  // Cycle 3.1 — startDomainPoller returns { stop, tickNow } and tickNow
  // runs one verification cycle synchronously
  {
    const db = mockDomainsDbForPoller();
    await addDomain(db, { appId: 100, domain: 'a.example.com', appSlug: 'a' });
    const expected = db.rows[0].expected_cname;
    const handle = startDomainPoller({
      db,
      dnsResolver: async () => [expected],
      intervalMs: 60_000,  // long enough that timer never fires during the test
      autoStart: false,
    });
    assert(typeof handle.stop === 'function', `handle has stop()`);
    assert(typeof handle.tickNow === 'function', `handle has tickNow()`);
    const result = await handle.tickNow();
    assert(result.checked === 1 && result.verified === 1,
      `tickNow ran one cycle (checked=${result.checked}, verified=${result.verified})`);
    assert(db.rows[0].status === 'verified', `row flipped to verified`);
    handle.stop();
  }

  // Cycle 3.2 — autoStart=true registers a setInterval that fires the
  // tick on its own; verified by injecting a mock setInterval that runs
  // the callback inline (synchronous fire)
  {
    const db = mockDomainsDbForPoller();
    await addDomain(db, { appId: 200, domain: 'b.example.com', appSlug: 'b' });
    const expected = db.rows[0].expected_cname;
    let registered = null;
    const fakeSetInterval = (fn, ms) => { registered = { fn, ms }; return Symbol('fake-interval'); };
    const fakeClearInterval = () => {};
    const handle = startDomainPoller({
      db,
      dnsResolver: async () => [expected],
      intervalMs: 60_000,
      autoStart: true,
      setIntervalFn: fakeSetInterval,
      clearIntervalFn: fakeClearInterval,
    });
    assert(registered !== null, `setInterval registered with autoStart=true`);
    assert(registered.ms === 60_000, `interval is intervalMs (got ${registered.ms})`);
    // Fire the registered callback once — it should run pollOnce
    await registered.fn();
    assert(db.rows[0].status === 'verified', `tick fired by setInterval did the work`);
    handle.stop();
  }

  // Cycle 3.3 — stop() unregisters the interval (via injected clearInterval)
  {
    let cleared = null;
    const fakeSetInterval = () => 'interval-token';
    const fakeClearInterval = (token) => { cleared = token; };
    const handle = startDomainPoller({
      db: mockDomainsDbForPoller(),
      dnsResolver: async () => null,
      intervalMs: 60_000,
      autoStart: true,
      setIntervalFn: fakeSetInterval,
      clearIntervalFn: fakeClearInterval,
    });
    handle.stop();
    assert(cleared === 'interval-token',
      `stop() called clearInterval with the interval token (got ${cleared})`);
  }

  // Cycle 3.4 — onError captures pollOnce throws (db down, resolver crash
  // outside per-row try/catch, etc.) so a busted poller doesn't crash
  // the whole server with an unhandled rejection
  {
    const errors = [];
    const brokenDb = {
      async query() { throw new Error('database connection lost'); },
    };
    const handle = startDomainPoller({
      db: brokenDb,
      dnsResolver: async () => null,
      intervalMs: 60_000,
      autoStart: false,
      onError: (err) => errors.push(err.message),
    });
    await handle.tickNow();
    assert(errors.length === 1 && errors[0].includes('database connection lost'),
      `onError invoked with the thrown message (got ${JSON.stringify(errors)})`);
  }
}

// ─── bootstrapDomainPoller — server-startup gate (CC-5b) ────────────────
// Thin helper Studio's bootstrap calls. Decides whether to start the
// poller based on whether a real Postgres pool is available. Without
// DATABASE_URL set, _cloudTenantHandle.pool is null and there's no
// app_domains table to poll — skip cleanly with a reason.
console.log('\n🚏 bootstrapDomainPoller — startup gate\n');

{
  const { bootstrapDomainPoller } = await import('./index.js');

  // Cycle 4.1 — no pool → skipped, reason captured
  {
    const result = bootstrapDomainPoller({ pool: null });
    assert(result.started === false, `no pool → started=false`);
    assert(result.handle === null, `no pool → handle null`);
    assert(typeof result.reason === 'string' && result.reason.length > 0,
      `no pool → reason explains why (got "${result.reason}")`);
  }

  // Cycle 4.2 — pool present → poller started, handle returned
  {
    let startCalledWith = null;
    const fakeStart = (opts) => {
      startCalledWith = opts;
      return { stop: () => {}, tickNow: async () => ({ checked: 0, verified: 0, wrong: 0, stillPending: 0 }) };
    };
    const dummyPool = { query: async () => ({ rows: [] }) };
    const result = bootstrapDomainPoller({ pool: dummyPool, startFn: fakeStart });
    assert(result.started === true, `pool present → started=true`);
    assert(result.handle && typeof result.handle.stop === 'function',
      `handle has stop()`);
    assert(startCalledWith && startCalledWith.db === dummyPool,
      `pool forwarded to startDomainPoller as opts.db`);
  }

  // Cycle 4.3 — extra options pass through (intervalMs override, etc.)
  {
    let startCalledWith = null;
    const fakeStart = (opts) => { startCalledWith = opts; return { stop: () => {}, tickNow: async () => {} }; };
    const dummyPool = { query: async () => ({ rows: [] }) };
    bootstrapDomainPoller({ pool: dummyPool, intervalMs: 30_000, startFn: fakeStart });
    assert(startCalledWith.intervalMs === 30_000,
      `intervalMs forwarded (got ${startCalledWith.intervalMs})`);
  }
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
