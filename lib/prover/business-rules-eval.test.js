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

import { describe, it, expect } from '../testUtils.js';
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
    enforce that deal's discount_percent is less than 30 or 'too high'
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
    enforce that deal's list_price is greater than 0 or 'must be positive'
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
    enforce that user_data's name is not '' or 'name required'
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
  enforce that 1 is less than 2 or 'never fires'
`,
  },
  {
    name: 'tautology-equality',
    expectedVerdict: 'proved',
    why: 'Pure equality on constants. Always true.',
    src: `
rule tautology-equality:
  enforce that 5 is equal to 5 or 'never fires'
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
  enforce that 1 is greater than 2 or 'always wrong'
`,
  },
  {
    name: 'always-fails-equality',
    expectedVerdict: 'disproved',
    why: 'Two unequal constants compared for equality. Always false.',
    src: `
rule always-fails-equality:
  enforce that 5 is equal to 7 or 'always wrong'
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
  enforce that found is not nothing or 'no deal'
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
    enforce that deal's discount_percent is less than deal's list_price or 'discount cannot exceed price'
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
    enforce that final_price is greater than 0 or 'price must be positive'
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
    enforce that deal's discount_percent is less than 30 or 'discount too high'
    enforce that deal's list_price is greater than 0 or 'price must be positive'
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
    enforce that 1 is less than 2 or 'tautology'
    enforce that deal's discount_percent is less than 30 or 'too high'
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
    enforce that 1 is greater than 2 or 'always wrong'
    enforce that deal's discount_percent is less than 30 or 'too high'
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
    enforce that deal's amount is greater than 0 or 'amount must be positive'
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
    enforce that booking's start_date is less than booking's end_date or 'start must be before end'
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
  enforce that 100 is greater than 50 or 'cap is set above floor'
`,
  },
];

describe('lib/prover — business-rules eval', () => {
  for (const c of CASES) {
    it(`${c.name} → ${c.expectedVerdict.toUpperCase()}`, () => {
      const bundle = proveSource(c.src);
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

  it('overall summary: every case covered', () => {
    // Belt-and-suspenders count check so a future maintainer who deletes
    // a case or forgets to add an expectation gets a loud failure.
    expect(CASES.length >= 15).toBe(true);
  });
});
