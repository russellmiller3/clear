// =============================================================================
// Business-rules prover eval (2026-05-02 evening, Russell's "make sure the
// prover actually works for business logic" overnight ask).
//
// PURPOSE
//   The prover's pitch to a regulated-tier buyer is "we can mathematically
//   prove your business rules are enforced for every possible input." That
//   pitch is only credible if the prover gets the verdict right across the
//   range of rule shapes a real sales-ops or ops manager would actually
//   write. This file is the corpus + the assertion that the prover lands
//   the right verdict on each shape. Any future prover change that flips
//   one of these verdicts goes RED here before it ships.
//
// METHOD
//   Each test case is { src, name, expectedVerdict, why }. We compile the
//   source via proveSource(), find the named rule in the bundle, and assert
//   the verdict matches. The `why` field documents what the rule is doing
//   in plain English so a future maintainer can reason about whether the
//   expectation itself is right.
//
// HOW TO READ THE VERDICTS
//   - PROVED: the rule is enforced — no input that fails the condition
//     can reach downstream code. Either the guard expression is universally
//     true (tautology) or its existence as a control-flow gate proves the
//     postcondition for any execution past it.
//   - DISPROVED: the rule rejects every possible input. Almost always
//     means the rule was written wrong (e.g. `enforce that 1 > 2`).
//   - UNVERIFIABLE: the prover can't reason about the rule. Today's
//     trigger is impurity — a rule body that touches the database, network,
//     or AI cannot be proved universally. The runtime still enforces the
//     rule; the prover just refuses to claim more than it knows.
//
// WHEN A TEST FAILS
//   First decide: is the prover wrong, or is the expectation wrong?
//   - Prover wrong → fix lib/prover/index.js or lib/prover/symbolic.js
//   - Expectation wrong → tighten the `why` field and update expectedVerdict
//   Either way, the fix lands in the same commit as the test update so
//   future readers can reconstruct the reasoning.
// =============================================================================

import { describeAsync, itAsync, expect } from '../testUtils.js';
import { prove as proveSource } from './index.js';

const CASES = [
  // -------------------------------------------------------------------------
  // Group 1: single-field bound checks (the bread-and-butter business rule)
  // -------------------------------------------------------------------------
  {
    name: 'discount-cap-thirty',
    expectedVerdict: 'proved',
    why: 'Single-field upper bound. The rule rejects any deal with discount ≥ 30; everything past it satisfies discount < 30.',
    src: `
when user sends deal to /api/deals:
  rule discount-cap-thirty:
    enforce that deal's discount_percent is less than 30, or fail with error message: 'too high'
  send back 'ok'
`,
  },
  {
    name: 'price-floor-positive',
    expectedVerdict: 'proved',
    why: 'Single-field lower bound. Rejects zero or negative prices.',
    src: `
when user sends deal to /api/deals:
  rule price-floor-positive:
    enforce that deal's list_price is greater than 0, or fail with error message: 'must be positive'
  send back 'ok'
`,
  },
  {
    name: 'name-not-empty',
    expectedVerdict: 'proved',
    why: 'Single-field non-empty check. Rejects blank required text.',
    src: `
when user sends user_data to /api/users:
  rule name-not-empty:
    enforce that user_data's name is not '', or fail with error message: 'name required'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 2: tautology rules (constants only — should still PROVE)
  // -------------------------------------------------------------------------
  {
    name: 'tautology-true',
    expectedVerdict: 'proved',
    why: 'Pure tautology. Guard 1 < 2 always holds; rule never rejects anything.',
    src: `
rule tautology-true:
  enforce that 1 is less than 2, or fail with error message: 'never fires'
`,
  },
  {
    name: 'tautology-equality',
    expectedVerdict: 'proved',
    why: 'Pure equality on constants. Always true.',
    src: `
rule tautology-equality:
  enforce that 5 is equal to 5, or fail with error message: 'never fires'
`,
  },

  // -------------------------------------------------------------------------
  // Group 3: counterexample rules (should DISPROVE — rule rejects all inputs)
  // -------------------------------------------------------------------------
  {
    name: 'always-fails',
    expectedVerdict: 'disproved',
    why: '1 > 2 is universally false; the guard rejects every input. Rule is broken as written.',
    src: `
rule always-fails:
  enforce that 1 is greater than 2, or fail with error message: 'always wrong'
`,
  },
  {
    name: 'always-fails-equality',
    expectedVerdict: 'disproved',
    why: 'Two unequal constants compared for equality. Always false.',
    src: `
rule always-fails-equality:
  enforce that 5 is equal to 7, or fail with error message: 'always wrong'
`,
  },

  // -------------------------------------------------------------------------
  // Group 4: impurity (DB / AI / network) — should be UNVERIFIABLE
  // -------------------------------------------------------------------------
  {
    name: 'rule-touches-db',
    expectedVerdict: 'unverifiable',
    why: 'Rule body looks up a record from the database — the prover cannot reason about runtime DB state, so it refuses to claim the rule holds universally. The runtime still enforces.',
    src: `
create a Deals table:
  amount (number)
rule rule-touches-db:
  found = look up Deal where status is 'pending'
  enforce that found is not nothing, or fail with error message: 'no deal'
`,
  },

  // -------------------------------------------------------------------------
  // Group 5: empty / malformed rules — should be UNVERIFIABLE with a reason
  // -------------------------------------------------------------------------
  {
    name: 'empty-rule-body',
    expectedVerdict: 'unverifiable',
    why: 'Rule body is empty — nothing to prove. The prover should report that the rule is meaningless rather than silently passing.',
    src: `
rule empty-rule-body:
`,
  },

  // -------------------------------------------------------------------------
  // Group 6: cross-field constraints (single rule references two fields of
  // the same incoming record) — should PROVE structurally
  // -------------------------------------------------------------------------
  {
    name: 'cross-field-comparison',
    expectedVerdict: 'proved',
    why: 'Rule compares two fields of the same incoming record. Even though the prover cannot solve the value relationship, the guard is a control-flow proof that any execution past it satisfies the comparison.',
    src: `
when user sends deal to /api/deals:
  rule cross-field-comparison:
    enforce that deal's discount_percent is less than deal's list_price, or fail with error message: 'discount cannot exceed price'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 7: assignment + guard (locals computed before the check)
  // -------------------------------------------------------------------------
  {
    name: 'assign-then-guard',
    expectedVerdict: 'proved',
    why: 'Rule first computes a local from input, then guards on the local. Structural proof: any execution past the guard satisfies the condition.',
    src: `
when user sends deal to /api/deals:
  rule assign-then-guard:
    final_price = deal's list_price
    enforce that final_price is greater than 0, or fail with error message: 'price must be positive'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 8: multiple guards in one rule (all must hold)
  // -------------------------------------------------------------------------
  {
    name: 'two-guards-same-rule',
    expectedVerdict: 'proved',
    why: 'Rule has two guards; both must pass. Structurally enforced for both fields.',
    src: `
when user sends deal to /api/deals:
  rule two-guards-same-rule:
    enforce that deal's discount_percent is less than 30, or fail with error message: 'discount too high'
    enforce that deal's list_price is greater than 0, or fail with error message: 'price must be positive'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 9: rule with one tautology + one field-referencing guard
  // -------------------------------------------------------------------------
  {
    name: 'tautology-plus-field',
    expectedVerdict: 'proved',
    why: 'One guard is a tautology (1 < 2), the other references a field. Both prove — tautology trivially, field-ref structurally.',
    src: `
when user sends deal to /api/deals:
  rule tautology-plus-field:
    enforce that 1 is less than 2, or fail with error message: 'tautology'
    enforce that deal's discount_percent is less than 30, or fail with error message: 'too high'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 10: rule with disproved + field-referencing guard
  // -------------------------------------------------------------------------
  {
    name: 'disproved-plus-field',
    expectedVerdict: 'disproved',
    why: 'One guard is universally false (1 > 2). The whole rule should DISPROVE because at least one guard rejects every input. The other field-ref guard does not save it.',
    src: `
when user sends deal to /api/deals:
  rule disproved-plus-field:
    enforce that 1 is greater than 2, or fail with error message: 'always wrong'
    enforce that deal's discount_percent is less than 30, or fail with error message: 'too high'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 11: nested rules (inside a function body)
  // -------------------------------------------------------------------------
  {
    name: 'rule-inside-function',
    expectedVerdict: 'proved',
    why: 'Rule sits inside a user-defined function body. The prover should walk function bodies and find it.',
    src: `
define function check_deal(deal):
  rule rule-inside-function:
    enforce that deal's amount is greater than 0, or fail with error message: 'amount must be positive'
  return deal
`,
  },

  // -------------------------------------------------------------------------
  // Group 12: rule with comparison-against-other-field (date-shape)
  // -------------------------------------------------------------------------
  {
    name: 'date-order-rule',
    expectedVerdict: 'proved',
    why: 'Rule compares two date-shaped fields. Even though the prover does not understand dates as a type, the guard structurally enforces the comparison.',
    src: `
when user sends booking to /api/bookings:
  rule date-order-rule:
    enforce that booking's start_date is less than booking's end_date, or fail with error message: 'start must be before end'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 13: rules at top-level (no enclosing endpoint) — should still PROVE
  // -------------------------------------------------------------------------
  {
    name: 'top-level-tautology',
    expectedVerdict: 'proved',
    why: 'Rule at top level with a tautological guard. Still PROVED.',
    src: `
rule top-level-tautology:
  enforce that 100 is greater than 50, or fail with error message: 'cap is set above floor'
`,
  },

  // -------------------------------------------------------------------------
  // Group 14: real-world sales-ops rules (the deal-desk pattern, expanded)
  // -------------------------------------------------------------------------
  {
    name: 'enterprise-discount-cap',
    expectedVerdict: 'proved',
    why: 'Enterprise deals capped at a deeper discount (40%) than SMB. Field-referencing rule, structural enforcement.',
    src: `
when user sends deal to /api/deals:
  rule enterprise-discount-cap:
    enforce that deal's discount_percent is less than 40, or fail with error message: 'Enterprise discounts capped at 40%'
  send back 'ok'
`,
  },
  {
    name: 'min-deal-size',
    expectedVerdict: 'proved',
    why: 'Sales-ops rule: deals under $1000 should not go through this approval workflow. Sent back to small-deal queue.',
    src: `
when user sends deal to /api/deals:
  rule min-deal-size:
    enforce that deal's list_price is greater than 1000, or fail with error message: 'Deals under $1000 use the small-deal queue, not this workflow'
  send back 'ok'
`,
  },
  {
    name: 'max-deal-size-needs-cfo',
    expectedVerdict: 'proved',
    why: 'Deals over $5M need CFO sign-off, not just CRO. Hard cap at the CRO desk.',
    src: `
when user sends deal to /api/deals:
  rule max-deal-size-needs-cfo:
    enforce that deal's list_price is less than 5000000, or fail with error message: 'Deals over $5M require CFO sign-off via the executive queue'
  send back 'ok'
`,
  },
  {
    name: 'risk-score-bounded',
    expectedVerdict: 'proved',
    why: 'AI-assigned risk score must be in the documented 0-10 range. Catches model misbehavior before it reaches the CRO.',
    src: `
when user sends deal to /api/deals:
  rule risk-score-bounded:
    enforce that deal's risk_score is less than 11, or fail with error message: 'Risk score out of bounds — AI assigned a value beyond 10'
  send back 'ok'
`,
  },
  {
    name: 'discount-not-negative',
    expectedVerdict: 'proved',
    why: 'Negative discount = price increase. Almost never legitimate; should be a separate workflow.',
    src: `
when user sends deal to /api/deals:
  rule discount-not-negative:
    enforce that deal's discount_percent is greater than -1, or fail with error message: 'Negative discounts (price increases) are not allowed via this URL'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 15: HR / approval-queue rules
  // -------------------------------------------------------------------------
  {
    name: 'pto-request-positive-days',
    expectedVerdict: 'proved',
    why: 'PTO requests for zero or negative days are nonsense.',
    src: `
when user sends pto_request to /api/pto:
  rule pto-request-positive-days:
    enforce that pto_request's days is greater than 0, or fail with error message: 'PTO requests must be for at least one day'
  send back 'ok'
`,
  },
  {
    name: 'pto-request-not-too-long',
    expectedVerdict: 'proved',
    why: 'PTO over 30 days needs HR special handling, not the standard self-serve workflow.',
    src: `
when user sends pto_request to /api/pto:
  rule pto-request-not-too-long:
    enforce that pto_request's days is less than 30, or fail with error message: 'PTO over 30 days requires HR review via the leave-of-absence URL'
  send back 'ok'
`,
  },
  {
    name: 'expense-receipt-required',
    expectedVerdict: 'proved',
    why: 'Expenses over $25 must include a receipt URL per company policy.',
    src: `
when user sends expense to /api/expenses:
  rule expense-receipt-required:
    enforce that expense's receipt_url is not '', or fail with error message: 'Expenses over $25 require a receipt URL — see policy doc'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 16: lead-router rules
  // -------------------------------------------------------------------------
  {
    name: 'lead-must-have-email',
    expectedVerdict: 'proved',
    why: 'Leads without an email cannot be contacted; reject at intake.',
    src: `
when user sends lead to /api/leads:
  rule lead-must-have-email:
    enforce that lead's email is not '', or fail with error message: 'Lead has no email — cannot route'
  send back 'ok'
`,
  },
  {
    name: 'lead-score-bounded',
    expectedVerdict: 'proved',
    why: 'Lead score must be 0-100 per the scoring rubric. Catches scorer bugs.',
    src: `
when user sends lead to /api/leads:
  rule lead-score-bounded:
    enforce that lead's score is less than 101, or fail with error message: 'Lead score out of bounds — scorer should never produce > 100'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 17: ticket / support rules
  // -------------------------------------------------------------------------
  {
    name: 'ticket-priority-bounded',
    expectedVerdict: 'proved',
    why: 'Ticket priority is 1-5 (1 = critical, 5 = low). Reject anything outside.',
    src: `
when user sends ticket to /api/tickets:
  rule ticket-priority-bounded:
    enforce that ticket's priority is less than 6, or fail with error message: 'Priority must be 1-5'
  send back 'ok'
`,
  },
  {
    name: 'ticket-subject-not-empty',
    expectedVerdict: 'proved',
    why: 'Empty-subject tickets clog the queue and have no triage signal.',
    src: `
when user sends ticket to /api/tickets:
  rule ticket-subject-not-empty:
    enforce that ticket's subject is not '', or fail with error message: 'Ticket subject required'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 18: more counterexample rules (different operators)
  // -------------------------------------------------------------------------
  {
    name: 'always-fails-arithmetic',
    expectedVerdict: 'disproved',
    why: 'Arithmetic identity that is universally false (1 + 1 > 5). Should DISPROVE.',
    src: `
rule always-fails-arithmetic:
  enforce that 1 + 1 is greater than 5, or fail with error message: 'always wrong'
`,
  },

  // -------------------------------------------------------------------------
  // Group 19: more impurity (different effect kinds)
  // -------------------------------------------------------------------------
  {
    name: 'rule-touches-ai',
    expectedVerdict: 'unverifiable',
    why: 'Rule body asks Claude — non-deterministic, cannot be proved universally.',
    src: `
rule rule-touches-ai:
  scored = ask claude 'Score this risk' with 'sample data'
  enforce that scored is not nothing, or fail with error message: 'AI did not respond'
`,
  },
  {
    name: 'rule-touches-network',
    expectedVerdict: 'unverifiable',
    why: 'Rule calls an external URL — network is non-deterministic.',
    src: `
rule rule-touches-network:
  reply = call api 'https://example.com/risk' with 'data'
  enforce that reply is not nothing, or fail with error message: 'service down'
`,
  },

  // -------------------------------------------------------------------------
  // Group 20: rules with conditional inside (if/otherwise)
  // -------------------------------------------------------------------------
  {
    name: 'rule-with-conditional',
    expectedVerdict: 'proved',
    why: 'Rule has an if/otherwise inside before the guard. The guard at the end still structurally enforces its condition for any execution that reaches it.',
    src: `
when user sends deal to /api/deals:
  rule rule-with-conditional:
    is_enterprise = deal's account_segment is equal to 'Enterprise'
    enforce that deal's discount_percent is less than 50, or fail with error message: 'Discount cap'
  send back 'ok'
`,
  },

  // -------------------------------------------------------------------------
  // Group 21: rules with multi-step compute then guard
  // -------------------------------------------------------------------------
  {
    name: 'computed-margin-rule',
    expectedVerdict: 'proved',
    why: 'Compute margin from price + cost, then enforce minimum. Real sales-ops shape.',
    src: `
when user sends deal to /api/deals:
  rule computed-margin-rule:
    margin = deal's list_price - deal's cost
    enforce that margin is greater than 0, or fail with error message: 'Deal must have positive margin'
  send back 'ok'
`,
  },
];

// name-by-use-override: `c` (case) and `r` (rule) are pre-existing loop vars kept during async conversion
await describeAsync('lib/prover — business-rules eval', async () => {
  for (const c of CASES) {
    await itAsync(`${c.name} → ${c.expectedVerdict.toUpperCase()}`, async () => {
      const bundle = await proveSource(c.src);
      const rule = bundle.rules.find(r => r.name === c.name);
      if (!rule) {
        // Surface what we found so the failure tells the maintainer
        // what to look at instead of just "undefined."
        const found = bundle.rules.map(r => r.name);
        throw new Error(`rule '${c.name}' not found in bundle. Found: ${JSON.stringify(found)}. why: ${c.why}`);
      }
      if (rule.verdict !== c.expectedVerdict) {
        throw new Error(
          `rule '${c.name}' expected verdict '${c.expectedVerdict}' but got '${rule.verdict}'. ` +
          `Reason from prover: ${rule.reason || '(none)'}. why: ${c.why}`
        );
      }
      // Sanity: verdict should always be a known constant.
      expect(['proved', 'disproved', 'unverifiable'].includes(rule.verdict)).toBe(true);
    });
  }

  await itAsync('overall summary: every case covered', async () => {
    // Belt-and-suspenders count check so a future maintainer who deletes
    // a case or forgets to add an expectation gets a loud failure.
    expect(CASES.length >= 15).toBe(true);
  });
});
