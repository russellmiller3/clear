// playground/billing.js
// Stripe integration — no SDK dep. We call Stripe's REST API via fetch
// and verify webhooks with Node's crypto. The webhook handler is dedup'd
// by event id: a replay of the same event returns 200 but doesn't create
// a second tenant or double-bill. Idempotency is the only property a
// correct webhook handler must have; everything else is convenience.

import { createHmac, timingSafeEqual } from 'crypto';
import { newTenantSlug } from './tenants.js';

const STRIPE_BASE = 'https://api.stripe.com/v1';

function stripeKey() { return process.env.STRIPE_SECRET_KEY || ''; }
function webhookSecret() { return process.env.STRIPE_WEBHOOK_SECRET || ''; }

let _fetch = globalThis.fetch;
export function setStripeFetchForTest(f) { _fetch = f; }

async function stripeCall(path, body) {
	const form = body ? new URLSearchParams(body).toString() : '';
	const res = await _fetch(`${STRIPE_BASE}${path}`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${stripeKey()}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: form,
	});
	if (!res.ok) {
		const text = await res.text();
		return { ok: false, status: res.status, error: text };
	}
	return { ok: true, data: await res.json() };
}

export async function createCheckoutSession({ priceId, successUrl, cancelUrl, customerEmail }) {
	const body = {
		'mode': 'subscription',
		'line_items[0][price]': priceId,
		'line_items[0][quantity]': '1',
		'success_url': successUrl,
		'cancel_url': cancelUrl,
	};
	if (customerEmail) body['customer_email'] = customerEmail;
	const r = await stripeCall('/checkout/sessions', body);
	if (!r.ok) return r;
	return { ok: true, url: r.data.url, id: r.data.id };
}

export function verifyStripeWebhook(rawBody, sigHeader, secret = null) {
	const useSecret = secret || webhookSecret();
	if (!useSecret) return { ok: false, reason: 'no webhook secret configured' };
	const parts = (sigHeader || '').split(',').map(p => p.trim().split('='));
	const dict = Object.fromEntries(parts);
	const t = dict.t;
	const v1 = dict.v1;
	if (!t || !v1) return { ok: false, reason: 'bad sig header' };
	const signedPayload = `${t}.${rawBody}`;
	const expected = createHmac('sha256', useSecret).update(signedPayload).digest('hex');
	if (expected.length !== v1.length) return { ok: false, reason: 'bad signature' };
	if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))) {
		return { ok: false, reason: 'bad signature' };
	}
	if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return { ok: false, reason: 'timestamp skew' };
	try {
		const event = JSON.parse(rawBody);
		return { ok: true, event };
	} catch {
		return { ok: false, reason: 'bad JSON' };
	}
}

// Convenience for tests — builds a valid signature header so callers can
// exercise the happy path without setting up a real webhook endpoint.
export function signStripeWebhookForTest(rawBody, secret, tsSeconds = Math.floor(Date.now() / 1000)) {
	const sig = createHmac('sha256', secret).update(`${tsSeconds}.${rawBody}`).digest('hex');
	return `t=${tsSeconds},v1=${sig}`;
}

export async function handleWebhookEvent(event, store, opts = {}) {
	const eventId = event.id;
	if (!eventId) return { ok: false, reason: 'missing event id' };
	if (await store.seenStripeEvent(eventId)) return { ok: true, deduped: true };

	await store.recordStripeEvent(eventId);

	switch (event.type) {
		case 'customer.subscription.created':
		case 'customer.subscription.updated': {
			const sub = event.data.object;
			const customerId = sub.customer;
			const existing = await store.getByStripeCustomer(customerId);
			const slug = existing?.slug || newTenantSlug();

			let plan = 'pro';
			const status = sub.status;
			if (status === 'canceled') plan = 'cancelled';
			else if (status === 'past_due') plan = 'past_due';

			const graceExpiresAt = plan === 'past_due'
				? new Date(Date.now() + 7 * 86400_000).toISOString()
				: null;

			await store.upsert(slug, {
				stripe_customer_id: customerId,
				plan,
				grace_expires_at: graceExpiresAt,
				ai_credit_cents: existing?.ai_credit_cents ?? 1000,
				apps_deployed: existing?.apps_deployed ?? 0,
				ai_spent_cents: existing?.ai_spent_cents ?? 0,
				created_at: existing?.created_at ?? new Date().toISOString(),
			});
			return { ok: true, slug, plan };
		}
		case 'customer.subscription.deleted': {
			const sub = event.data.object;
			const existing = await store.getByStripeCustomer(sub.customer);
			if (!existing) return { ok: true, noop: true };
			const destroyAt = new Date(Date.now() + 30 * 86400_000).toISOString();
			await store.setPlan(existing.slug, 'cancelled', destroyAt);
			return { ok: true, cancelledSlug: existing.slug, destroyAt };
		}
		default:
			return { ok: true, ignored: event.type };
	}
}

export async function reportUsage({ subscriptionItemId, quantity, idempotencyKey }) {
	const body = { quantity: String(quantity), timestamp: String(Math.floor(Date.now() / 1000)) };
	const res = await _fetch(`${STRIPE_BASE}/subscription_items/${subscriptionItemId}/usage_records`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${stripeKey()}`,
			'Content-Type': 'application/x-www-form-urlencoded',
			...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
		},
		body: new URLSearchParams(body).toString(),
	});
	if (!res.ok) return { ok: false, status: res.status };
	return { ok: true, data: await res.json() };
}
