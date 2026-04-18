// playground/billing.test.js
// Covers Stripe webhook signature verify, dedup, plan transitions, and
// metered usage reporting. Uses setStripeFetchForTest to stub the REST
// layer — no real Stripe calls in unit tests.

import { describe, it, expect, testAsync } from '../lib/testUtils.js';
import {
	createCheckoutSession, verifyStripeWebhook, signStripeWebhookForTest,
	handleWebhookEvent, setStripeFetchForTest, reportUsage,
} from './billing.js';
import { InMemoryTenantStore, canDeploy, overQuota, newTenantSlug } from './tenants.js';
import { PLANS, planFor } from './plans.js';

describe('newTenantSlug', () => {
	it('produces clear-XXXXXX', () => {
		const s = newTenantSlug();
		expect(s).toMatch(/^clear-[a-f0-9]{6}$/);
	});
	it('is unique across calls', () => {
		const set = new Set();
		for (let i = 0; i < 50; i++) set.add(newTenantSlug());
		expect(set.size).toBe(50);
	});
});

describe('plans + canDeploy', () => {
	it('pro plan has 25 app limit and $10 AI credit', () => {
		const p = planFor('pro');
		expect(p.appsLimit).toBe(25);
		expect(p.aiCreditCents).toBe(1000);
	});
	it('overQuota fires at plan limit', () => {
		expect(overQuota({ plan: 'pro', apps_deployed: 25 })).toBe(true);
		expect(overQuota({ plan: 'pro', apps_deployed: 24 })).toBe(false);
	});
	it('canDeploy rejects cancelled plan', () => {
		const r = canDeploy({ plan: 'cancelled' });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain('cancelled');
	});
	it('canDeploy allows past_due within grace window', () => {
		const future = new Date(Date.now() + 86400_000).toISOString();
		const r = canDeploy({ plan: 'past_due', apps_deployed: 1, grace_expires_at: future });
		expect(r.ok).toBe(true);
	});
	it('canDeploy rejects past_due after grace', () => {
		const past = new Date(Date.now() - 86400_000).toISOString();
		const r = canDeploy({ plan: 'past_due', apps_deployed: 1, grace_expires_at: past });
		expect(r.ok).toBe(false);
	});
});

describe('verifyStripeWebhook', () => {
	it('accepts a valid signature + timestamp', () => {
		const body = JSON.stringify({ id: 'evt_x', type: 'ping' });
		const sig = signStripeWebhookForTest(body, 'whsec_test');
		const r = verifyStripeWebhook(body, sig, 'whsec_test');
		expect(r.ok).toBe(true);
		expect(r.event.id).toBe('evt_x');
	});
	it('rejects a bad signature', () => {
		const body = JSON.stringify({ id: 'evt_x' });
		const sig = signStripeWebhookForTest(body, 'whsec_test');
		const r = verifyStripeWebhook(body, sig, 'whsec_different');
		expect(r.ok).toBe(false);
	});
	it('rejects stale timestamps (>5 min old)', () => {
		const body = JSON.stringify({ id: 'evt_x' });
		const stale = Math.floor(Date.now() / 1000) - 600;
		const sig = signStripeWebhookForTest(body, 'whsec_test', stale);
		const r = verifyStripeWebhook(body, sig, 'whsec_test');
		expect(r.ok).toBe(false);
		expect(r.reason).toContain('skew');
	});
});

testAsync('handleWebhookEvent — subscription.created creates tenant (test 4.2)', async () => {
	const store = new InMemoryTenantStore();
	const event = {
		id: 'evt_create_1',
		type: 'customer.subscription.created',
		data: { object: { customer: 'cus_abc', status: 'active' } },
	};
	const r = await handleWebhookEvent(event, store);
	expect(r.ok).toBe(true);
	const t = await store.getByStripeCustomer('cus_abc');
	expect(t).not.toBe(null);
	expect(t.plan).toBe('pro');
});

testAsync('handleWebhookEvent — replayed event does NOT create duplicate (test 4.2)', async () => {
	const store = new InMemoryTenantStore();
	const event = {
		id: 'evt_dup_1',
		type: 'customer.subscription.created',
		data: { object: { customer: 'cus_abc', status: 'active' } },
	};
	await handleWebhookEvent(event, store);
	const r2 = await handleWebhookEvent(event, store);
	expect(r2.deduped).toBe(true);
	expect(store.tenants.size).toBe(1);
});

testAsync('handleWebhookEvent — subscription.deleted schedules 30-day destroy (test 4.3)', async () => {
	const store = new InMemoryTenantStore();
	await handleWebhookEvent({
		id: 'evt_c',
		type: 'customer.subscription.created',
		data: { object: { customer: 'cus_abc', status: 'active' } },
	}, store);
	const r = await handleWebhookEvent({
		id: 'evt_d',
		type: 'customer.subscription.deleted',
		data: { object: { customer: 'cus_abc' } },
	}, store);
	expect(r.ok).toBe(true);
	expect(r.cancelledSlug).toBeDefined();
	const t = await store.getByStripeCustomer('cus_abc');
	expect(t.plan).toBe('cancelled');
	expect(t.grace_expires_at).toBeDefined();
});

testAsync('handleWebhookEvent — subscription.updated past_due sets 7-day grace (test 4.4)', async () => {
	const store = new InMemoryTenantStore();
	await handleWebhookEvent({
		id: 'evt_pd1',
		type: 'customer.subscription.created',
		data: { object: { customer: 'cus_x', status: 'active' } },
	}, store);
	await handleWebhookEvent({
		id: 'evt_pd2',
		type: 'customer.subscription.updated',
		data: { object: { customer: 'cus_x', status: 'past_due' } },
	}, store);
	const t = await store.getByStripeCustomer('cus_x');
	expect(t.plan).toBe('past_due');
	const graceDelta = new Date(t.grace_expires_at).getTime() - Date.now();
	expect(graceDelta).toBeGreaterThan(6 * 86400_000);
	expect(graceDelta).toBeLessThan(8 * 86400_000);
});

testAsync('createCheckoutSession — returns session URL (test 4.1)', async () => {
	setStripeFetchForTest(async (url, opts) => ({
		ok: true, status: 200,
		json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1' }),
		text: async () => '',
	}));
	const r = await createCheckoutSession({
		priceId: 'price_pro_99',
		successUrl: 'http://localhost:3456/success',
		cancelUrl: 'http://localhost:3456/cancel',
		customerEmail: 'russell@clear.dev',
	});
	expect(r.ok).toBe(true);
	expect(r.url).toContain('checkout.stripe.com');
	expect(r.id).toBe('cs_test_1');
});

testAsync('reportUsage — POSTs to subscription_items/.../usage_records (test 4.7)', async () => {
	let captured = null;
	setStripeFetchForTest(async (url, opts) => {
		captured = { url, opts };
		return { ok: true, status: 200, json: async () => ({ id: 'mbur_x', quantity: 42 }), text: async () => '' };
	});
	const r = await reportUsage({ subscriptionItemId: 'si_abc', quantity: 42, idempotencyKey: 'day-2026-04-17' });
	expect(r.ok).toBe(true);
	expect(captured.url).toContain('/subscription_items/si_abc/usage_records');
	expect(captured.opts.headers['Idempotency-Key']).toBe('day-2026-04-17');
});
