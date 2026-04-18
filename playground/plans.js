// playground/plans.js
// Single source of truth for plan limits. When we add or rename plans this
// is the only file that should change — every quota check, every UI badge,
// every upgrade prompt pulls from PLANS.

export const PLANS = {
	free: {
		name: 'free',
		monthlyCents: 0,
		appsLimit: 1,
		aiCreditCents: 0,
	},
	pro: {
		name: 'pro',
		monthlyCents: 9900,
		appsLimit: 25,
		aiCreditCents: 1000, // $10/month included
	},
	team: {
		name: 'team',
		monthlyCents: 29900,
		appsLimit: 100,
		aiCreditCents: 5000,
	},
};

export function planFor(name) {
	// `past_due` is a payment status, not a plan tier — keep the customer's
	// active-plan limits during the 7-day grace window so a temporarily
	// failed card doesn't lock them out of their own apps.
	if (name === 'past_due') return PLANS.pro;
	return PLANS[name] || PLANS.free;
}
