// =============================================================================
// CC-3d — Quota enforcement (TDD tests)
// =============================================================================
// Pure-function helpers for "can this tenant make another agent call?"
// Composes with the AI proxy (Phase 85) before it calls Anthropic. Over-quota
// response: caller returns 402 with upgrade URL; proxy never forwards the call.
//
// Tests use a minimal mock db that returns canned count-of-usage-rows results.
// No real Postgres required at this layer.
//
// Run: node playground/cloud-quota/index.test.js
// =============================================================================

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

function mockDb(callCount) {
  return {
    async query(text, params = []) {
      // The only query checkQuota fires — COUNT(*) over the current
      // billing period. Callers can substitute real SQL by passing a
      // pg.Pool; the shape needs to match.
      if (/COUNT\(\*\).*FROM usage_rows/i.test(text.replace(/\s+/g, ' '))) {
        return { rows: [{ count: String(callCount) }] };
      }
      throw new Error('mockDb unhandled query: ' + text.slice(0, 80));
    },
  };
}

// ─── PLAN_QUOTAS — from landing/pricing.html ───────────────────────────
console.log('\n📊 PLAN_QUOTAS + getPlanQuotas\n');

{
  const { PLAN_QUOTAS, getPlanQuotas } = await import('./index.js');

  // Exposed constant must carry the four tenant-tier limits from the
  // pricing page. Any change to the page MUST update this constant or
  // checkQuota will disagree with the marketing claim.
  assert(typeof PLAN_QUOTAS === 'object' && PLAN_QUOTAS !== null,
    'PLAN_QUOTAS is exported as an object');
  assert(PLAN_QUOTAS.free?.agent_calls === 100,
    `free plan = 100 agent calls (got ${PLAN_QUOTAS.free?.agent_calls})`);
  assert(PLAN_QUOTAS.team?.agent_calls === 5000,
    `team plan = 5000 agent calls (got ${PLAN_QUOTAS.team?.agent_calls})`);
  assert(PLAN_QUOTAS.business?.agent_calls === 50000,
    `business plan = 50000 agent calls (got ${PLAN_QUOTAS.business?.agent_calls})`);
  assert(PLAN_QUOTAS.enterprise?.agent_calls === null,
    `enterprise plan = unlimited (null) (got ${PLAN_QUOTAS.enterprise?.agent_calls})`);

  // Apps + seats too — the dashboard shows these, billing enforces them
  // too (deploy blocks when over app cap on free).
  assert(PLAN_QUOTAS.free?.apps === 3, 'free plan apps cap = 3');
  assert(PLAN_QUOTAS.team?.apps === 25, 'team plan apps cap = 25');
  assert(PLAN_QUOTAS.business?.apps === null, 'business plan apps = unlimited');

  assert(PLAN_QUOTAS.free?.seats === 1, 'free plan seats = 1');
  assert(PLAN_QUOTAS.team?.seats === 10, 'team plan seats = 10');
  assert(PLAN_QUOTAS.business?.seats === 50, 'business plan seats = 50');
  assert(PLAN_QUOTAS.enterprise?.seats === null, 'enterprise seats = unlimited');

  // getPlanQuotas(plan) — safe lookup, throws on unknown plan
  const free = getPlanQuotas('free');
  assert(free.agent_calls === 100, 'getPlanQuotas("free") returns free limits');

  let threw;
  try { getPlanQuotas('platinum'); } catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('platinum'),
    `getPlanQuotas rejects unknown plan with message naming it (got "${threw}")`);
}

// ─── checkQuota — the hot-path "can I make another call?" check ────────
console.log('\n🛑 checkQuota — hot-path gate before each agent call\n');

{
  const { checkQuota } = await import('./index.js');

  // Under limit: ok=true, remaining > 0
  const r1 = await checkQuota(mockDb(50), 1, 'free');
  assert(r1.ok === true, `under limit → ok:true (got ${JSON.stringify(r1)})`);
  assert(r1.used === 50 && r1.limit === 100 && r1.remaining === 50,
    `under limit → used:50, limit:100, remaining:50 (got ${JSON.stringify(r1)})`);

  // Exactly at limit: ok=false (the NEXT call is the one that'd exceed)
  const r2 = await checkQuota(mockDb(100), 1, 'free');
  assert(r2.ok === false, `at-limit → ok:false (got ${JSON.stringify(r2)})`);
  assert(r2.remaining === 0, `at-limit → remaining:0 (got ${r2.remaining})`);

  // Over limit: ok=false, remaining negative (surface overage count)
  const r3 = await checkQuota(mockDb(150), 1, 'free');
  assert(r3.ok === false, `over-limit → ok:false (got ${JSON.stringify(r3)})`);
  assert(r3.remaining === -50,
    `over-limit → remaining:-50 to surface overage count (got ${r3.remaining})`);

  // Enterprise (unlimited): always ok, remaining=null
  const r4 = await checkQuota(mockDb(999999), 1, 'enterprise');
  assert(r4.ok === true, `enterprise → always ok (got ${JSON.stringify(r4)})`);
  assert(r4.remaining === null && r4.limit === null,
    `enterprise → remaining + limit both null (got ${JSON.stringify(r4)})`);

  // Unknown plan throws with a useful message
  let threw;
  try { await checkQuota(mockDb(0), 1, 'mystery'); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('mystery'),
    `unknown plan → throws naming it (got "${threw}")`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
