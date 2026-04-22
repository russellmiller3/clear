// =============================================================================
// CC-3b — Stripe Checkout scaffold (TDD tests)
// =============================================================================
// Pure-function helpers for the upgrade flow: build the Checkout Session
// params shape Stripe expects, and parse the checkout.session.completed
// webhook event to extract the tenant update instructions.
//
// The Stripe SDK itself stays OUT of this layer — we build plain objects
// the caller can pass to stripe.checkout.sessions.create(...) and
// stripe.webhooks.constructEvent(...) respectively. Keeps tests pure.
//
// Run: node playground/cloud-billing/index.test.js
// =============================================================================

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

// ─── PRICE_IDS — plan → Stripe price ID mapping ─────────────────────────
console.log('\n💳 PRICE_IDS + getStripePriceId\n');

{
  const { PRICE_IDS, getStripePriceId } = await import('./index.js');

  // Exposed as a frozen const so runtime code can't accidentally mutate.
  // Free tier has no price ID (no Stripe subscription for the free plan).
  assert(typeof PRICE_IDS === 'object' && PRICE_IDS !== null,
    'PRICE_IDS exported as an object');
  assert(PRICE_IDS.free === null,
    `free plan → null price ID (got ${JSON.stringify(PRICE_IDS.free)})`);
  // Paid tiers have real price IDs — set from env (CC-3a Stripe dashboard)
  // or the documented placeholders that fail loud in production.
  assert(typeof PRICE_IDS.team === 'string' && PRICE_IDS.team.length > 0,
    `team plan has a string price ID (got ${PRICE_IDS.team})`);
  assert(typeof PRICE_IDS.business === 'string' && PRICE_IDS.business.length > 0,
    `business plan has a string price ID (got ${PRICE_IDS.business})`);
  assert(PRICE_IDS.enterprise === null,
    `enterprise → null (contract-sales only, no self-serve Stripe)`);

  // getStripePriceId — safe lookup, throws on unknown plan, throws on
  // plan tiers with no price (free/enterprise)
  assert(getStripePriceId('team') === PRICE_IDS.team,
    'getStripePriceId("team") returns team price ID');

  let threw;
  try { getStripePriceId('platinum'); } catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('platinum'),
    `unknown plan throws with message naming it (got "${threw}")`);

  threw = null;
  try { getStripePriceId('free'); } catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('free'),
    `free plan throws — no Stripe subscription on the free tier (got "${threw}")`);

  threw = null;
  try { getStripePriceId('enterprise'); } catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('enterprise'),
    `enterprise throws — contract-sales only (got "${threw}")`);
}

// ─── buildCheckoutSessionParams — the exact shape Stripe wants ──────────
console.log('\n🧱 buildCheckoutSessionParams\n');

{
  const { buildCheckoutSessionParams } = await import('./index.js');

  const params = buildCheckoutSessionParams({
    plan: 'team',
    tenantId: 42,
    customerEmail: 'marcus@acme.com',
    successUrl: 'https://buildclear.dev/upgrade/success',
    cancelUrl: 'https://buildclear.dev/pricing',
  });

  // Shape matches stripe.checkout.sessions.create contract
  assert(params.mode === 'subscription', `mode='subscription' (got ${params.mode})`);
  assert(Array.isArray(params.line_items) && params.line_items.length === 1,
    `one line_item for the plan (got ${JSON.stringify(params.line_items)})`);
  assert(params.line_items[0].quantity === 1,
    'line_items[0].quantity = 1');
  assert(typeof params.line_items[0].price === 'string' && params.line_items[0].price.length > 0,
    `line_items[0].price is the Stripe price ID string`);
  assert(params.customer_email === 'marcus@acme.com',
    'customer_email plumbed through');
  assert(params.success_url === 'https://buildclear.dev/upgrade/success',
    'success_url plumbed through');
  assert(params.cancel_url === 'https://buildclear.dev/pricing',
    'cancel_url plumbed through');

  // client_reference_id carries the tenant — Stripe echoes it back on
  // the completed webhook so we know WHICH tenant to upgrade. No
  // ambiguity if the email matches multiple tenant rows.
  assert(params.client_reference_id === '42',
    `client_reference_id = tenantId (got ${params.client_reference_id})`);
  // Metadata mirrors client_reference_id for analytics + double safety
  assert(params.metadata?.tenant_id === '42',
    'metadata.tenant_id set too (second source for correlation)');
  assert(params.metadata?.plan === 'team',
    'metadata.plan set so webhook knows the target tier');

  // Rejects missing required fields
  let threw;
  try { buildCheckoutSessionParams({}); } catch (err) { threw = err.message; }
  assert(threw, `empty input throws (got "${threw}")`);

  threw = null;
  try { buildCheckoutSessionParams({ plan: 'free', tenantId: 1, customerEmail: 'a@b.c', successUrl: 'x', cancelUrl: 'y' }); }
  catch (err) { threw = err.message; }
  assert(threw && threw.toLowerCase().includes('free'),
    `free plan → throws at build-time, not the Stripe call (got "${threw}")`);
}

// ─── parseCheckoutCompletedEvent — Stripe webhook → tenant update ───────
console.log('\n🪝 parseCheckoutCompletedEvent\n');

{
  const { parseCheckoutCompletedEvent } = await import('./index.js');

  // Happy path — real-ish Stripe event shape (trimmed)
  const event = {
    id: 'evt_1ABC',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        mode: 'subscription',
        customer: 'cus_ACME',
        subscription: 'sub_DEF',
        customer_email: 'marcus@acme.com',
        client_reference_id: '42',
        metadata: { tenant_id: '42', plan: 'team' },
        payment_status: 'paid',
      },
    },
  };
  const r = parseCheckoutCompletedEvent(event);
  assert(r.ok === true, `happy-path → ok:true (got ${JSON.stringify(r)})`);
  assert(r.tenantId === 42, `tenantId = 42 (got ${r.tenantId})`);
  assert(r.plan === 'team', `plan = team (got ${r.plan})`);
  assert(r.stripeCustomerId === 'cus_ACME', `stripeCustomerId extracted`);
  assert(r.stripeSubscriptionId === 'sub_DEF', `stripeSubscriptionId extracted`);
  assert(r.customerEmail === 'marcus@acme.com', `customer_email carried`);

  // Wrong event type → ok:false so caller can ignore unrelated webhooks
  const r2 = parseCheckoutCompletedEvent({ type: 'invoice.paid', data: {} });
  assert(r2.ok === false, `non-checkout event → ok:false`);
  assert(r2.reason?.toLowerCase().includes('type'),
    `reason names the type mismatch (got "${r2.reason}")`);

  // Missing tenant_id → ok:false with descriptive reason (data-integrity
  // issue — someone bypassed buildCheckoutSessionParams). payment_status
  // set so we hit the tenant_id check, not the payment-pending branch.
  const r3 = parseCheckoutCompletedEvent({
    type: 'checkout.session.completed',
    data: { object: { payment_status: 'paid', metadata: {}, client_reference_id: null } },
  });
  assert(r3.ok === false, `no tenant_id → ok:false`);
  assert(r3.reason?.toLowerCase().includes('tenant'),
    `reason names missing tenant_id (got "${r3.reason}")`);

  // Unpaid session → ok:false (pending — don't upgrade yet)
  const r4 = parseCheckoutCompletedEvent({
    ...event,
    data: { object: { ...event.data.object, payment_status: 'unpaid' } },
  });
  assert(r4.ok === false, `unpaid → ok:false`);
  assert(r4.reason?.toLowerCase().includes('paid'),
    `reason names unpaid status (got "${r4.reason}")`);

  // Missing plan metadata → ok:false (we don't guess what they bought)
  const r5 = parseCheckoutCompletedEvent({
    type: 'checkout.session.completed',
    data: { object: { metadata: { tenant_id: '5' }, payment_status: 'paid' } },
  });
  assert(r5.ok === false && r5.reason?.toLowerCase().includes('plan'),
    `no plan metadata → ok:false with reason (got "${r5.reason}")`);
}

// ─── PRICES_TO_PLAN — reverse lookup for subscription webhooks ──────────
// checkout.session.completed carries metadata.plan we set at build time.
// subscription.updated / .deleted DON'T carry our metadata on the
// top-level subscription object — we have to map the Stripe price ID
// back to our plan name. This reverse map is the inverse of PRICE_IDS.
console.log('\n🔁 PRICES_TO_PLAN + planForPriceId\n');

{
  const { PRICES_TO_PLAN, PRICE_IDS, planForPriceId } = await import('./index.js');

  // Shape — object keyed by Stripe price string
  assert(typeof PRICES_TO_PLAN === 'object' && PRICES_TO_PLAN !== null,
    'PRICES_TO_PLAN exported as an object');

  // Round-trip consistency — PRICE_IDS.team must map to 'team', etc.
  for (const plan of ['team', 'business']) {
    const priceId = PRICE_IDS[plan];
    assert(PRICES_TO_PLAN[priceId] === plan,
      `PRICES_TO_PLAN[${priceId}] === '${plan}' (round-trip of PRICE_IDS)`);
  }

  // Free + enterprise have null price IDs → NOT in PRICES_TO_PLAN
  assert(!(null in PRICES_TO_PLAN) && PRICES_TO_PLAN[null] === undefined,
    `null key not in PRICES_TO_PLAN (free/enterprise excluded)`);

  // planForPriceId — safe lookup, null on unknown
  assert(planForPriceId(PRICE_IDS.team) === 'team',
    `planForPriceId reverses correctly`);
  assert(planForPriceId('price_unknown_xyz') === null,
    `unknown price id → null (not throw; unknown subscriptions are common on staging)`);
  assert(planForPriceId(null) === null, `null → null`);
  assert(planForPriceId(undefined) === null, `undefined → null`);
}

// ─── parseSubscriptionUpdatedEvent — plan changes ────────────────────────
// customer.subscription.updated fires on ANY subscription change —
// plan change, quantity change, trial end, pause/resume. We only care
// about the active price_id, which dictates the current plan tier.
console.log('\n🔄 parseSubscriptionUpdatedEvent\n');

{
  const { parseSubscriptionUpdatedEvent, PRICE_IDS } = await import('./index.js');

  // Happy path — active subscription with metadata.tenant_id
  const event = {
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_DEF',
        customer: 'cus_ACME',
        status: 'active',
        metadata: { tenant_id: '42' },
        items: {
          data: [
            { price: { id: PRICE_IDS.business } },
          ],
        },
      },
    },
  };
  const r = parseSubscriptionUpdatedEvent(event);
  assert(r.ok === true, `happy path → ok:true (got ${JSON.stringify(r)})`);
  assert(r.tenantId === 42, `tenantId extracted (got ${r.tenantId})`);
  assert(r.plan === 'business', `plan derived from price_id (got ${r.plan})`);
  assert(r.stripeSubscriptionId === 'sub_DEF', `subscription id extracted`);
  assert(r.stripeCustomerId === 'cus_ACME', `customer id extracted`);
  assert(r.status === 'active', `status passed through`);

  // Wrong event type
  const r2 = parseSubscriptionUpdatedEvent({ type: 'invoice.paid' });
  assert(r2.ok === false && r2.reason?.toLowerCase().includes('type'),
    `wrong type → ok:false (got "${r2.reason}")`);

  // Missing metadata.tenant_id
  const r3 = parseSubscriptionUpdatedEvent({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_x', metadata: {}, items: { data: [{ price: { id: PRICE_IDS.team } }] }, status: 'active' } },
  });
  assert(r3.ok === false && r3.reason?.toLowerCase().includes('tenant'),
    `no tenant_id → ok:false (got "${r3.reason}")`);

  // Missing items (malformed event)
  const r4 = parseSubscriptionUpdatedEvent({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_x', metadata: { tenant_id: '1' }, status: 'active' } },
  });
  assert(r4.ok === false && r4.reason?.toLowerCase().includes('price'),
    `no items/price → ok:false with reason (got "${r4.reason}")`);

  // Unknown price ID → plan=null, ok:false (operator investigates)
  const r5 = parseSubscriptionUpdatedEvent({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_x', metadata: { tenant_id: '1' }, status: 'active',
      items: { data: [{ price: { id: 'price_not_ours' } }] } } },
  });
  assert(r5.ok === false && r5.reason?.toLowerCase().includes('plan'),
    `unknown price → ok:false (got "${r5.reason}")`);

  // Non-active status (cancelled, past_due, paused) passes through —
  // caller decides what to do. ok:true because the event is well-formed.
  const r6 = parseSubscriptionUpdatedEvent({
    ...event,
    data: { object: { ...event.data.object, status: 'past_due' } },
  });
  assert(r6.ok === true && r6.status === 'past_due',
    `non-active status passed through as ok (caller decides); got status=${r6.status}`);
}

// ─── parseSubscriptionDeletedEvent — cancellation downgrade ─────────────
// customer.subscription.deleted fires when a subscription is cancelled.
// We downgrade the tenant to 'free'. No plan lookup needed — the
// post-cancellation plan is always 'free'.
console.log('\n🗑️  parseSubscriptionDeletedEvent\n');

{
  const { parseSubscriptionDeletedEvent } = await import('./index.js');

  // Happy path
  const event = {
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: 'sub_GONE',
        customer: 'cus_ACME',
        metadata: { tenant_id: '42' },
      },
    },
  };
  const r = parseSubscriptionDeletedEvent(event);
  assert(r.ok === true, `happy path → ok:true`);
  assert(r.tenantId === 42, `tenantId extracted`);
  assert(r.plan === 'free', `cancelled subscription → plan='free' (downgrade target)`);
  assert(r.stripeSubscriptionId === 'sub_GONE', `subscription id passed through`);
  assert(r.stripeCustomerId === 'cus_ACME', `customer id passed through`);

  // Wrong event type
  const r2 = parseSubscriptionDeletedEvent({ type: 'customer.subscription.updated' });
  assert(r2.ok === false, `wrong type → ok:false`);

  // Missing tenant_id
  const r3 = parseSubscriptionDeletedEvent({
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_x', metadata: {} } },
  });
  assert(r3.ok === false && r3.reason?.toLowerCase().includes('tenant'),
    `no tenant_id → ok:false (got "${r3.reason}")`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
