// playground/stripe-webhook-receiver.js
// Production Stripe webhook boundary. It must be mounted before express.json()
// so Stripe signatures verify against the exact bytes Stripe signed.

import express from 'express';
import { verifyStripeWebhook, handleWebhookEvent } from './billing.js';

function isProductionEnv(env = process.env) {
	return env.NODE_ENV === 'production' || env.CLEAR_CLOUD_ENV === 'production';
}

export function mountStripeWebhookReceiver(app, opts = {}) {
	if (!app) throw new Error('mountStripeWebhookReceiver: app is required');
	const store = opts.store;
	if (!store) throw new Error('mountStripeWebhookReceiver: store is required');
	const verify = opts.verify || verifyStripeWebhook;
	const route = opts.route || '/api/stripe-webhook';
	const secret = opts.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? '';
	const production = opts.isProduction ?? isProductionEnv(opts.env || process.env);

	app.post(route, express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
		if (production && !secret) {
			return res.status(503).json({ ok: false, error: 'Stripe webhook secret not configured' });
		}
		const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
		const sig = req.headers['stripe-signature'];
		const verified = verify(rawBody, sig, secret || null);
		if (!verified.ok) return res.status(400).json({ ok: false, error: verified.reason });

		try {
			const result = await handleWebhookEvent(verified.event, store);
			return res.status(result.ok ? 200 : 400).json(result);
		} catch (err) {
			console.error('[stripe-webhook] failed:', err.message || err);
			return res.status(500).json({ ok: false, error: 'Stripe webhook processing failed' });
		}
	});

	return { mounted: true, route };
}
