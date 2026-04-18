// playground/ai-proxy/pricing.js
// Per-model Claude pricing in cents per 1M tokens. Input and output are
// separate because output is typically 4–5x the cost. Updated quarterly;
// sourced from https://www.anthropic.com/pricing. If a model isn't here
// we fall back to Opus rates (the most expensive) — we'd rather over-meter
// than hand out free inference. See Phase 3 test 3.2.

export const RATES = {
	'claude-opus-4-7':       { inCents: 1500, outCents: 7500 },
	'claude-sonnet-4-6':     { inCents: 300,  outCents: 1500 },
	'claude-haiku-4-5-20251001': { inCents: 80, outCents: 400 },
	'claude-haiku-4-5':      { inCents: 80,   outCents: 400 },
};

const FALLBACK = RATES['claude-opus-4-7'];

export function priceFor(model, inputTokens, outputTokens) {
	const rate = RATES[model] || FALLBACK;
	const inCents = (inputTokens * rate.inCents) / 1_000_000;
	const outCents = (outputTokens * rate.outCents) / 1_000_000;
	return Math.ceil(inCents + outCents);
}
