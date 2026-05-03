// =============================================================================
// Runtime witness test for the prover (2026-05-03 evening, Russell's "if
// the prover says PROVED how do we know it's telling the truth" question).
//
// PURPOSE
//   The prover's "structural proof" verdict for field-referencing rules
//   says PROVED on the basis that the compiler correctly emits the runtime
//   guard. That's a trust delegation: the prover believes the compiler.
//   Nobody so far has CHECKED whether the compiler keeps that promise.
//
//   This file is the check. For each "PROVED" rule shape, we:
//     1. Compile the source via compileProgram()
//     2. Boot the compiled server in this process via require()
//     3. Send N (default 20) inputs that VIOLATE the rule's condition
//     4. Assert every single one comes back as a rejection (HTTP 403 or 400)
//        with the rule's name in the error message
//   If even one violating input slips through with success, the prover
//   was lying — the compiler didn't emit the guard correctly OR the
//   structural-proof reframe is wrong for this rule shape.
//
//   This converts "PROVED for every possible deal" from a math claim
//   into a measured claim: "we sent 20 deals that violate this rule;
//   all 20 were rejected at runtime; the rule's name appeared in every
//   rejection." A regulated-tier buyer can verify this themselves.
//
// STATUS
//   STUB — written 2026-05-03 evening as the planning skeleton. Next
//   session: wire up the actual runtime spawn + HTTP harness. The shape
//   below documents the cases that should run; each one is currently
//   skipped via `it.skip` so the suite stays green while the wiring
//   lands. Once the wiring works, flip skip → run.
// =============================================================================

import { describe, it, expect } from '../testUtils.js';

// Each case: rule that the prover says PROVED + a generator that produces
// inputs which VIOLATE the rule. The runtime witness should reject every
// generated input.
const CASES = [
  {
    name: 'discount-cap-thirty',
    src: `
when user sends deal to /api/deals:
  rule discount-cap-thirty:
    enforce that deal's discount_percent is less than 30 or 'too high'
  send back 'ok'
`,
    // Generate inputs where discount_percent >= 30 — every one should reject.
    violatingInputs: () => Array.from({ length: 20 }, (_, i) => ({
      discount_percent: 30 + i,  // 30, 31, 32, ... 49 — all violate
      list_price: 1000,
    })),
    expectRejectionContaining: 'discount-cap-thirty',
  },
  {
    name: 'price-floor-positive',
    src: `
when user sends deal to /api/deals:
  rule price-floor-positive:
    enforce that deal's list_price is greater than 0 or 'must be positive'
  send back 'ok'
`,
    // Inputs with list_price <= 0 — every one should reject.
    violatingInputs: () => Array.from({ length: 20 }, (_, i) => ({
      discount_percent: 10,
      list_price: -i,  // 0, -1, -2, ... -19 — all violate
    })),
    expectRejectionContaining: 'price-floor-positive',
  },
  {
    name: 'cross-field-comparison',
    src: `
when user sends deal to /api/deals:
  rule cross-field-comparison:
    enforce that deal's discount_percent is less than deal's list_price or 'discount cannot exceed price'
  send back 'ok'
`,
    // Inputs where discount >= price — every one should reject.
    violatingInputs: () => Array.from({ length: 20 }, (_, i) => ({
      discount_percent: 100 + i,  // larger than price
      list_price: 50,
    })),
    expectRejectionContaining: 'cross-field-comparison',
  },
];

describe('lib/prover — runtime witness (every PROVED rule actually rejects bad inputs)', () => {
  for (const c of CASES) {
    it.skip(`${c.name}: 20 violating inputs all get rejected with rule name in error`, async () => {
      // STUB. To wire up:
      //   1. compileProgram(c.src, { target: 'backend' }) → result.javascript
      //   2. Write result.javascript to a tempfile, spawn `node tempfile.js`
      //   3. Wait for the server to listen on the assigned port
      //   4. For each input in c.violatingInputs():
      //        const r = await fetch('http://localhost:PORT/api/deals', {
      //          method: 'POST',
      //          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer <test-token>' },
      //          body: JSON.stringify(input),
      //        });
      //        expect(r.status).toBeOneOf([400, 403]);
      //        const body = await r.json();
      //        expect(body.error).toContain(c.expectRejectionContaining);
      //   5. Kill the server.
      // If all 20 inputs reject AND the rule name appears in the error,
      // the prover's PROVED verdict is corroborated by runtime evidence.
      expect(true).toBe(true);
    });
  }

  it('eval design covers the trust-gap classes', () => {
    // Sanity: harness must include single-field-bound + cross-field cases.
    // These two cover the highest-risk compiler-emit shapes (single-field
    // is the bread and butter; cross-field hits the receiving-var scoping
    // path that bit us in past sessions on user/req.user collision).
    expect(CASES.some(c => c.name === 'discount-cap-thirty')).toBe(true);
    expect(CASES.some(c => c.name === 'cross-field-comparison')).toBe(true);
  });
});
