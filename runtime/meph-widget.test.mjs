// LAE Phase C cycle 5 — widget destructive UX.
//
// File extension is .mjs because runtime/package.json pins
// {"type":"commonjs"} for the runtime files that ship into compiled apps,
// but this test imports from lib/* (ESM). Matches runtime/auth-webcrypto.test.mjs.
//
// The widget is an IIFE that runs in the browser; we can't import its
// internal functions directly. Instead we read the file as TEXT and
// assert the destructive-flow pieces are present in the source:
//
//   1. The inlined requiredConfirmation helper matches lib/destructive-confirm.js
//      so the widget and API derive the canonical phrase from identical logic.
//   2. The renderProposal destructive branch builds the typed-confirm input,
//      reason textarea, and the red "I understand — ship and destroy" button.
//   3. The button starts disabled and only enables on exact-match input + non-empty reason.
//   4. The ship POST body includes confirmation + reason fields.
//   5. The 400/503/500 error branches surface the right copy.
//   6. The .clear-meph-btn-danger CSS class exists (red bg).
//
// Why text-based: there is no JSDOM in the project and no widget test
// runner. Per the plan, "gate this cycle on syntax-check + a manual smoke"
// — but a structural assertion test is cheap and catches future regressions
// (e.g. someone renames the button or removes a branch).
//
// We ALSO unit-test the inlined requiredConfirmation by extracting it via
// a Function() eval against the matching source block. Belt and suspenders:
// if the inlined copy ever drifts from lib/destructive-confirm.js, the
// destructive ship will silently 400 every time on confirmation-mismatch,
// and Marcus will think Meph is broken. This test catches that drift at
// commit time.

import { describe, it, expect } from '../lib/testUtils.js';
import { requiredConfirmation as canonicalRequiredConfirmation } from '../lib/destructive-confirm.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetSource = readFileSync(join(__dirname, 'meph-widget.js'), 'utf8');

describe('meph-widget — destructive UX (LAE Phase C cycle 5)', () => {
	it('inlines a requiredConfirmation helper that matches lib/destructive-confirm.js', () => {
		// Pull the inlined function out of the widget source and run it in
		// isolation. If the widget's copy ever drifts from the canonical
		// helper in lib/destructive-confirm.js, the strings will diverge
		// and the API gate (which uses the canonical helper) will reject
		// owner-typed input that matches the widget's placeholder. That's a
		// silent ship-destroying bug — catch it here, not in production.
		// Walk braces from the function declaration to find its matching close.
		// A naive "first \n\t}\n" stops at the inner switch block.
		const startIdx = widgetSource.indexOf('function requiredConfirmation');
		if (startIdx < 0) throw new Error('no inlined requiredConfirmation found in meph-widget.js');
		const openIdx = widgetSource.indexOf('{', startIdx);
		let depth = 0;
		let endIdx = -1;
		for (let i = openIdx; i < widgetSource.length; i++) {
			const c = widgetSource[i];
			if (c === '{') depth++;
			else if (c === '}') {
				depth--;
				if (depth === 0) { endIdx = i + 1; break; }
			}
		}
		if (endIdx < 0) throw new Error('unbalanced braces in inlined requiredConfirmation');
		const fnSource = widgetSource.slice(startIdx, endIdx);
		const fn = new Function(
			'return (function() { ' + fnSource + ' return requiredConfirmation; })();',
		)();

		const cases = [
			{ kind: 'remove_field', table: 'Users', field: 'email' },
			{ kind: 'remove_endpoint', method: 'POST', path: '/api/items' },
			{ kind: 'remove_page', title: 'Admin' },
			{ kind: 'remove_table', table: 'Notes' },
			{ kind: 'change_type', table: 'Items', field: 'price', from: 'text', to: 'number' },
		];
		for (const change of cases) {
			const cls = { type: 'destructive', changes: [change] };
			expect(fn(cls)).toBe(canonicalRequiredConfirmation(cls));
		}
		// Null and missing-changes cases must also match.
		expect(fn(null)).toBe(canonicalRequiredConfirmation(null));
		expect(fn({})).toBe(canonicalRequiredConfirmation({}));
		expect(fn({ type: 'destructive', changes: [] })).toBe(
			canonicalRequiredConfirmation({ type: 'destructive', changes: [] }),
		);
	});

	it('declares a .clear-meph-btn-danger class with a red background', () => {
		// The destructive button MUST be visually unmistakable. A grey or
		// blue button next to "I understand — ship and destroy" is a UX
		// trap that gets owners to misclick. The class lives in the
		// injected stylesheet and signals "this button is dangerous".
		expect(/\.clear-meph-btn-danger\s*\{[^}]*background[^}]*(#dc2626|#b91c1c|#ef4444|#f87171)/i.test(widgetSource)).toBe(true);
	});

	it('declares an input id="clear-meph-confirm" for the typed phrase', () => {
		// The input id is part of the public widget contract. The audit
		// log in cycle 4 uses the placeholder phrase as the expected
		// confirmation; if the input element disappears or gets renamed,
		// destructive ships silently break. Hardcode the id.
		expect(widgetSource.includes("'clear-meph-confirm'") || widgetSource.includes('"clear-meph-confirm"')).toBe(true);
	});

	it('declares a textarea id="clear-meph-reason" for the reason', () => {
		// Same contract as the confirm input. Reason is required server-side
		// — if the textarea is missing, every destructive ship 400s.
		expect(widgetSource.includes("'clear-meph-reason'") || widgetSource.includes('"clear-meph-reason"')).toBe(true);
	});

	it('uses the exact button copy "I understand — ship and destroy"', () => {
		// Locked-in decision #3 — long copy IS the safety. A 2-word button
		// would let Marcus thumb-mash through. The em-dash matters; that's
		// the canonical glyph in the plan, not a hyphen.
		expect(widgetSource.includes('I understand — ship and destroy')).toBe(true);
	});

	it('disables the destructive button until input+reason match', () => {
		// The button must start disabled. A keyup listener on both fields
		// re-checks: input.value === requiredConfirmation(classification)
		// AND textarea.value.trim() !== ''. If either check is missing,
		// Marcus can ship by typing partial text — exactly the fat-finger
		// failure mode this whole cycle exists to prevent.
		// We assert the destructive section sets disabled=true initially
		// and wires keyup/input listeners that compare against the phrase.
		const destructiveBlock = widgetSource.match(
			/\/\/ LAE Phase C cycle 5 — destructive branch[\s\S]*?\n\s*\}\s*\n\s*return summary;/,
		);
		if (!destructiveBlock) throw new Error('no LAE Phase C cycle 5 destructive branch found');
		const block = destructiveBlock[0];
		expect(/disabled[\s\S]*?true|disabled:\s*['"]?disabled/.test(block)).toBe(true);
		expect(/keyup|addEventListener\(['"]input/.test(block)).toBe(true);
	});

	it('POST /ship body includes confirmation, reason, and classification', () => {
		// The widget must round-trip these to the API or the cycle-4 gate
		// fires every time. Search for "confirmation" and "reason" appearing
		// in the same shipDestructive function.
		const shipFn = widgetSource.match(/async function shipDestructive[\s\S]*?\n\t\}/);
		if (!shipFn) throw new Error('no shipDestructive function found');
		const body = shipFn[0];
		expect(body.includes('confirmation')).toBe(true);
		expect(body.includes('reason')).toBe(true);
		expect(body.includes('classification')).toBe(true);
		// Must POST to /ship (not /propose).
		expect(body.includes("api('ship'")).toBe(true);
	});

	it('handles 400 confirmation-mismatch by surfacing the expected phrase', () => {
		// When the API returns 400 with `expected:"DELETE field email"`,
		// the widget surfaces the expected phrase so the owner can retype.
		// Don't just say "Ship failed" — that loses the recoverable signal.
		const shipFn = widgetSource.match(/async function shipDestructive[\s\S]*?\n\t\}/);
		expect(shipFn[0].includes('expected') && /400/.test(shipFn[0])).toBe(true);
	});

	it('handles 503 audit-unavailable with a clear retry message', () => {
		// Audit-first ordering: if the audit store is down the API returns
		// 503 before applyShip runs. The widget must tell Marcus this is
		// transient ("try again in a moment") not a destructive-already-
		// happened error.
		const shipFn = widgetSource.match(/async function shipDestructive[\s\S]*?\n\t\}/);
		expect(/503/.test(shipFn[0]) && /audit/i.test(shipFn[0])).toBe(true);
	});

	it('handles 500 ship-failed AFTER pending audit row by surfacing the auditId', () => {
		// On 500 with auditId, the widget tells Marcus "the attempt is on
		// record" and offers retry. The pending audit row is evidence the
		// attempt happened — surface it so support can reconcile.
		const shipFn = widgetSource.match(/async function shipDestructive[\s\S]*?\n\t\}/);
		expect(/auditId/.test(shipFn[0])).toBe(true);
	});

	it('on 200 ok, addBot mentions the auditId from the response', () => {
		// The success copy must include the auditId so the owner has a
		// reference number for the destructive event.
		const shipFn = widgetSource.match(/async function shipDestructive[\s\S]*?\n\t\}/);
		expect(/audit[^A-Za-z]*ID|auditId/.test(shipFn[0])).toBe(true);
	});
});
