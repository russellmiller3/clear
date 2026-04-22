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

// ─── computeOverage — pure overage-count helper ──────────────────────────
// Used by CC-3c rollup to compute what Stripe Usage API should see. Free
// plans: overage is always 0 (quota is a hard stop, no billing). Paid
// plans: overage = max(0, used - limit). Unlimited plans: overage = null
// (no Stripe metered line item).
console.log('\n🧮 computeOverage + computeOverageCost\n');

{
  const { computeOverage, computeOverageCost, OVERAGE_PER_CALL_USD } = await import('./index.js');

  // Under/at limit → 0 overage
  assert(computeOverage(50, 100) === 0, 'under limit → overage 0');
  assert(computeOverage(100, 100) === 0, 'at limit → overage 0 (exactly used)');

  // Over limit → the overage count
  assert(computeOverage(150, 100) === 50, 'over limit → overage = used - limit');
  assert(computeOverage(1000, 100) === 900, '10x over → overage 900');

  // Unlimited (limit=null) → null overage
  assert(computeOverage(999999, null) === null,
    'unlimited plan → overage null (no Stripe line item)');

  // Zero-use edge case
  assert(computeOverage(0, 100) === 0, 'zero use → overage 0');

  // computeOverageCost: overage * OVERAGE_PER_CALL_USD
  assert(computeOverageCost(50, 100) === 0, 'under limit → no cost');
  assert(Math.abs(computeOverageCost(150, 100) - (50 * OVERAGE_PER_CALL_USD)) < 0.001,
    `50 calls over → $${50 * OVERAGE_PER_CALL_USD} (${OVERAGE_PER_CALL_USD}/call)`);
  assert(computeOverageCost(999999, null) === 0,
    'unlimited plan → cost always 0 (no overage billing)');
}

// ─── billingSummary — aggregate what a dashboard needs in one call ──────
// Combines plan + usage into the shape a billing UI renders: plan name,
// used count, limit, remaining, percent, overage, overage cost, and the
// over-limit flag. One pure call so the dashboard doesn't need to combine
// checkQuota + computeOverage + percentCalc by hand.
console.log('\n📈 billingSummary — aggregate dashboard shape\n');

{
  const { billingSummary, OVERAGE_PER_CALL_USD } = await import('./index.js');

  // Under limit
  const s1 = billingSummary('free', 25);
  assert(s1.plan === 'free', 'plan carried through');
  assert(s1.used === 25 && s1.limit === 100 && s1.remaining === 75,
    `25/100 shape (got ${JSON.stringify(s1)})`);
  assert(s1.percent === 25, '25 of 100 → percent 25');
  assert(s1.overLimit === false, 'under limit → overLimit false');
  assert(s1.overage === 0, 'under limit → overage 0');
  assert(s1.overage_cost_usd === 0, 'under limit → cost 0');

  // Over limit (paid plan)
  const s2 = billingSummary('team', 6000);
  assert(s2.used === 6000 && s2.limit === 5000 && s2.remaining === -1000,
    '6000/5000 → remaining -1000');
  assert(s2.overage === 1000, 'overage = 1000');
  assert(Math.abs(s2.overage_cost_usd - (1000 * OVERAGE_PER_CALL_USD)) < 0.001,
    `overage cost = $${1000 * OVERAGE_PER_CALL_USD}`);
  assert(s2.overLimit === true, 'over limit → overLimit true');
  assert(s2.percent === 120, '6000/5000 → percent 120');

  // Enterprise (unlimited) — percent/remaining are null to signal "N/A"
  const s3 = billingSummary('enterprise', 999999);
  assert(s3.limit === null && s3.remaining === null,
    'enterprise → limit + remaining null');
  assert(s3.percent === null, 'enterprise → percent null (N/A)');
  assert(s3.overLimit === false, 'enterprise can never be over limit');
  assert(s3.overage === null, 'enterprise → overage null');
  assert(s3.overage_cost_usd === 0, 'enterprise → cost 0');

  // Exactly at limit → overLimit false (limit is INCLUSIVE, next call
  // is the one that'd trip)
  const s4 = billingSummary('free', 100);
  assert(s4.overLimit === false, 'exactly at limit → overLimit false');
  assert(s4.remaining === 0, 'at limit → remaining 0');
}

// ─── checkAppCountQuota — block deploys past the app cap ─────────────────
// Same shape as checkQuota but counts apps (active only) instead of agent
// calls. Fires BEFORE a deploy creates a new apps row, so the comparison
// is "will adding one push me over?" → ok=false when used >= limit.
console.log('\n🏠 checkAppCountQuota — deploy gate\n');

{
  const { checkAppCountQuota } = await import('./index.js');

  function mockAppsDb(activeCount) {
    return {
      async query(text) {
        if (/COUNT\(\*\).*FROM apps/i.test(text.replace(/\s+/g, ' '))) {
          return { rows: [{ count: String(activeCount) }] };
        }
        throw new Error('mockAppsDb unhandled query: ' + text.slice(0, 80));
      },
    };
  }

  // Under limit → ok:true, remaining = limit - used (room for more)
  const r1 = await checkAppCountQuota(mockAppsDb(2), 1, 'free');
  assert(r1.ok === true, `free plan, 2 apps → ok:true`);
  assert(r1.used === 2 && r1.limit === 3 && r1.remaining === 1,
    `shape: used=2, limit=3, remaining=1 (got ${JSON.stringify(r1)})`);

  // At limit → ok:false (next deploy would exceed the cap)
  const r2 = await checkAppCountQuota(mockAppsDb(3), 1, 'free');
  assert(r2.ok === false, `free plan, 3 apps (at cap) → ok:false`);
  assert(r2.remaining === 0, `at cap → remaining 0`);

  // Over limit (shouldn't happen, but test it) → remaining negative
  const r3 = await checkAppCountQuota(mockAppsDb(5), 1, 'free');
  assert(r3.ok === false && r3.remaining === -2,
    `over cap → remaining -2 (got ${JSON.stringify(r3)})`);

  // Team plan — 25 cap
  const r4 = await checkAppCountQuota(mockAppsDb(24), 1, 'team');
  assert(r4.ok === true && r4.remaining === 1,
    `team, 24 of 25 → ok with 1 remaining`);

  // Business plan — unlimited (apps: null)
  const r5 = await checkAppCountQuota(mockAppsDb(100), 1, 'business');
  assert(r5.ok === true && r5.limit === null && r5.remaining === null,
    `business (unlimited apps) → ok, limit+remaining null`);

  // Enterprise — also unlimited
  const r6 = await checkAppCountQuota(mockAppsDb(9999), 1, 'enterprise');
  assert(r6.ok === true && r6.limit === null,
    `enterprise → ok, unlimited apps`);

  // Unknown plan throws
  let threw;
  try { await checkAppCountQuota(mockAppsDb(0), 1, 'mystery'); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('mystery'),
    `unknown plan → throws (got "${threw}")`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
