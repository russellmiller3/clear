// LAE Phase C cycle 4 — typed-confirmation phrase generator.
//
// requiredConfirmation(classification) → string. The widget renders this as
// the placeholder; the API checks the owner's typed input against it. Same
// helper on both sides means the contract can never drift — if the widget
// shows "DELETE field email", the API insists on the same exact bytes.
//
// Phrases are intentionally plain English (verb DELETE, not DROP) — owners
// are not database engineers. See plan locked-in decision #1.
import { describe, it, expect } from './testUtils.js';
import { requiredConfirmation } from './destructive-confirm.js';

describe('destructive-confirm — requiredConfirmation', () => {
	it('returns DELETE field <name> for a remove_field change', () => {
		const classification = {
			type: 'destructive',
			changes: [{ kind: 'remove_field', table: 'Users', field: 'email' }],
		};
		expect(requiredConfirmation(classification)).toBe('DELETE field email');
	});

	it('returns DELETE endpoint <method> <path> for a remove_endpoint change', () => {
		const classification = {
			type: 'destructive',
			changes: [{ kind: 'remove_endpoint', method: 'POST', path: '/api/items' }],
		};
		expect(requiredConfirmation(classification)).toBe('DELETE endpoint POST /api/items');
	});

	it('returns DELETE page "<title>" for a remove_page change', () => {
		const classification = {
			type: 'destructive',
			changes: [{ kind: 'remove_page', title: 'Admin Dashboard' }],
		};
		expect(requiredConfirmation(classification)).toBe('DELETE page "Admin Dashboard"');
	});

	it('returns COERCE <table>.<field> from <X> to <Y> for a change_type', () => {
		const classification = {
			type: 'destructive',
			changes: [
				{ kind: 'change_type', table: 'Items', field: 'price', from: 'text', to: 'number' },
			],
		};
		expect(requiredConfirmation(classification)).toBe('COERCE Items.price from text to number');
	});

	it('returns DELETE table <name> for a remove_table change', () => {
		const classification = {
			type: 'destructive',
			changes: [{ kind: 'remove_table', table: 'Notes' }],
		};
		expect(requiredConfirmation(classification)).toBe('DELETE table Notes');
	});

	it('uses the FIRST destructive change when multiple are present', () => {
		// Defensive: cycle 4 today only ever has a single change in the
		// destructive branch (proposeRemoveField rejects anything else), but
		// the helper has to make a deterministic choice if a future tool
		// returns multi-change. Picking [0] matches the diff display order.
		const classification = {
			type: 'destructive',
			changes: [
				{ kind: 'remove_field', table: 'Users', field: 'email' },
				{ kind: 'remove_field', table: 'Users', field: 'phone' },
			],
		};
		expect(requiredConfirmation(classification)).toBe('DELETE field email');
	});

	it('returns null when classification has no destructive changes', () => {
		// Defensive: caller (the API + widget) should never pass an additive
		// classification here, but null is the safe out — caller treats it as
		// "no confirmation phrase needed" and skips the gate.
		const classification = { type: 'additive', changes: [] };
		expect(requiredConfirmation(classification)).toBe(null);
	});

	it('returns null when classification is null or missing changes', () => {
		expect(requiredConfirmation(null)).toBe(null);
		expect(requiredConfirmation({})).toBe(null);
		expect(requiredConfirmation({ type: 'destructive' })).toBe(null);
	});

	it('returns null when the first destructive change has an unknown kind', () => {
		// Future-proofing: if a new destructive kind lands without a phrase
		// pattern here, we refuse rather than guess. The API will then 400
		// with confirmation-required, which is the right safety stance.
		const classification = {
			type: 'destructive',
			changes: [{ kind: 'mystery_destruction', table: 'X', field: 'y' }],
		};
		expect(requiredConfirmation(classification)).toBe(null);
	});
});
