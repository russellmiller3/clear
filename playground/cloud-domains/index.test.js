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

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
