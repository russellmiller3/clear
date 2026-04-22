/*
 * Clear Cloud billing — CC-3b scaffold.
 *
 * Pure helpers around Stripe Checkout + webhooks. The Stripe SDK stays
 * OUT of this layer — we build the exact params object
 * `stripe.checkout.sessions.create()` expects, and we parse the
 * `checkout.session.completed` webhook into a tenant-update shape.
 *
 * The caller wires in stripe.checkout.sessions.create() in the upgrade
 * endpoint + stripe.webhooks.constructEvent() in the webhook handler.
 * That way tests don't need Stripe credentials or the SDK at all.
 *
 * Phase 85a dependency: the real price IDs (CC-3a Stripe dashboard
 * product creation) land in env vars. Until then, placeholders fail
 * loud if the upgrade flow actually fires in production.
 */

// =============================================================================
// PRICE_IDS — plan → Stripe price ID
// =============================================================================
// Read from env so Russell can flip between test-mode and live-mode IDs
// without a code change. Falls back to placeholder strings that fail
// loud (Stripe rejects a fake price ID, no hidden money-moving bug).
//
// free + enterprise: null. Free has no Stripe subscription (quota is a
// hard stop). Enterprise is contract sales — no self-serve Checkout.
export const PRICE_IDS = Object.freeze({
  free:       null,
  team:       process.env.STRIPE_PRICE_TEAM     || 'price_PLACEHOLDER_TEAM',
  business:   process.env.STRIPE_PRICE_BUSINESS || 'price_PLACEHOLDER_BUSINESS',
  enterprise: null,
});

/**
 * Safe lookup. Throws on:
 *   - unknown plans (typo guard)
 *   - free (no Stripe subscription on that tier)
 *   - enterprise (contract sales, no self-serve Checkout)
 *
 * Caller catches the throw and surfaces a "contact sales" CTA for
 * enterprise, or just refuses the upgrade for free.
 */
export function getStripePriceId(plan) {
  if (!(plan in PRICE_IDS)) {
    throw new Error(
      `cloud-billing: unknown plan "${plan}". ` +
      `Valid plans: ${Object.keys(PRICE_IDS).join(', ')}.`
    );
  }
  if (plan === 'free') {
    throw new Error(
      'cloud-billing: free plan has no Stripe price — quota is a hard stop, no subscription. ' +
      'Route free-plan users to the upgrade page, not the Checkout flow.'
    );
  }
  if (plan === 'enterprise') {
    throw new Error(
      'cloud-billing: enterprise plan has no self-serve Stripe price — route to contact-sales.'
    );
  }
  return PRICE_IDS[plan];
}

// =============================================================================
// buildCheckoutSessionParams
// =============================================================================
/**
 * Build the exact argument object for stripe.checkout.sessions.create().
 * Pure — no Stripe SDK in scope. Tests construct the object and assert
 * its shape; production code passes it straight to Stripe.
 *
 * client_reference_id carries the tenant through Stripe's opaque
 * checkout flow. It comes back on the completed webhook so we know
 * WHICH tenant to upgrade — email matching is ambiguous when the same
 * email owns multiple tenants. Metadata mirrors it for analytics +
 * double safety.
 *
 * Required fields:
 *   - plan: 'team' | 'business' (free + enterprise throw)
 *   - tenantId: number
 *   - customerEmail: string (pre-filled in the Checkout form)
 *   - successUrl: string (Stripe redirects here after payment)
 *   - cancelUrl: string (Stripe redirects here if the user bails)
 *
 * @param {object} input
 * @returns {object} params for stripe.checkout.sessions.create
 */
export function buildCheckoutSessionParams(input) {
  const { plan, tenantId, customerEmail, successUrl, cancelUrl } = input || {};
  if (!plan || !tenantId || !customerEmail || !successUrl || !cancelUrl) {
    throw new Error(
      'cloud-billing: buildCheckoutSessionParams requires plan, tenantId, ' +
      'customerEmail, successUrl, and cancelUrl.'
    );
  }
  const priceId = getStripePriceId(plan);  // may throw on free/enterprise
  return {
    mode: 'subscription',
    line_items: [
      { price: priceId, quantity: 1 },
    ],
    customer_email: customerEmail,
    // Echoed back on checkout.session.completed — primary correlation key
    client_reference_id: String(tenantId),
    // Extra metadata on the Session (and subscription + invoices that
    // inherit it). Useful in the Stripe dashboard + as a second correlation.
    metadata: {
      tenant_id: String(tenantId),
      plan,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
}

// =============================================================================
// parseCheckoutCompletedEvent
// =============================================================================
/**
 * Parse a `checkout.session.completed` Stripe webhook event and extract
 * the tenant-update shape the webhook handler needs. Returns:
 *   { ok: true, tenantId, plan, stripeCustomerId, stripeSubscriptionId, customerEmail }
 * or
 *   { ok: false, reason: string }
 *
 * ok:false covers:
 *   - wrong event type (webhook endpoint receives many types; ignore others)
 *   - payment_status !== 'paid' (session completed but payment pending)
 *   - missing client_reference_id + metadata.tenant_id (corrupt event —
 *     someone bypassed buildCheckoutSessionParams)
 *   - missing metadata.plan (we don't guess what tier they bought)
 *
 * Caller pattern:
 *   const event = stripe.webhooks.constructEvent(body, sig, secret);
 *   const parsed = parseCheckoutCompletedEvent(event);
 *   if (!parsed.ok) { log(parsed.reason); return 200; }  // ack + drop
 *   await updateTenantPlan(parsed.tenantId, parsed.plan, parsed.stripeCustomerId, parsed.stripeSubscriptionId);
 *
 * @param {object} event - Stripe-shaped webhook event
 * @returns {{ok:true, tenantId:number, plan:string, stripeCustomerId:string, stripeSubscriptionId:string, customerEmail:string}|{ok:false, reason:string}}
 */
export function parseCheckoutCompletedEvent(event) {
  if (!event || event.type !== 'checkout.session.completed') {
    return { ok: false, reason: `wrong event type: ${event?.type || '(none)'}` };
  }
  const session = event.data?.object || {};
  if (session.payment_status !== 'paid') {
    return { ok: false, reason: `payment not paid: status=${session.payment_status}` };
  }
  // Tenant ID — prefer client_reference_id, fall back to metadata.tenant_id
  const raw = session.client_reference_id || session.metadata?.tenant_id;
  if (!raw) {
    return { ok: false, reason: 'missing tenant_id — no client_reference_id or metadata.tenant_id' };
  }
  const tenantId = Number(raw);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return { ok: false, reason: `tenant_id not a positive integer: ${raw}` };
  }
  const plan = session.metadata?.plan;
  if (!plan) {
    return { ok: false, reason: 'missing metadata.plan — cannot infer subscription tier' };
  }
  return {
    ok: true,
    tenantId,
    plan,
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: session.subscription || null,
    customerEmail: session.customer_email || null,
  };
}
