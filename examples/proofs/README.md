# Provable correctness — demo bundle

Every file in this directory has its math proved against its tests. Not "tested with five examples." Proved.

Every AI coding tool generates code. None of them tell you whether the generated code matches the spec. **Clear does.** Run `clear prove <file>` on any of these and it walks the source directly, checks every assertion, and either:
- gives you a **PROVED** verdict (the math holds for the inputs given), or
- gives you a **PROVED for any input** verdict (the math holds for every possible input — a real mathematical theorem), or
- gives you an honest **UNKNOWN** (the prover can't decide; better than a false claim), or
- gives you a **FAILED** with a counterexample (your spec and your code disagree).

## What's in here

| File | What it proves | Why it matters |
|---|---|---|
| `invoice.clear` | tax math, late fees, overdue checks (8 proofs) | Software wrongly accusing customers of being overdue is exactly the bug class behind the Robodebt and Horizon scandals |
| `pricing.clear` | discounts, tips, bulk pricing, loyalty tiers (10 proofs) | The smallest math errors in pricing software cost customers — and refunds — at scale |
| `eligibility.clear` | voting, age limits, loan qualification (13 proofs) | Yes/no decisions on a person's life. Wrong rule in code = wrong rule in reality |
| `theorems.clear` | universal mathematical theorems (12 proofs for ANY input) | Demonstrates symbolic mode — claims that hold for all possible inputs, not just specific examples |
| `deal-desk-math.clear` | approval thresholds, commission math, quote totals (15 proofs) | Marcus's deal-desk app math, audited at the source level — the regulated-tier sales surface |

## Run them

```
clear prove examples/proofs/invoice.clear
clear prove examples/proofs/pricing.clear
clear prove examples/proofs/eligibility.clear
clear prove examples/proofs/theorems.clear
clear prove examples/proofs/deal-desk-math.clear
```

Each one writes a one-page proof bundle to your terminal. Add `--bundle` to also write a `.proof.json` sidecar next to the source file — that's the artifact you hand to your auditor.

## What the prover does NOT touch

The prover walks the Clear source. It does not run the compiled JavaScript or Python. That means:

- **What's proved:** the Clear source matches its spec.
- **What isn't proved:** the compiler translates that source faithfully, or that the runtime executes the translation faithfully.

That's the standard industry trust boundary. AWS Cedar, SPARK/Ada (defense and avionics), Dafny, and TLA+ all stop at the same line. Verifying the compiler too is a year-2 move.

The dual-target architecture (every Clear app compiles to BOTH JavaScript and Python from the same source) is a structural belt-and-suspenders nobody else has. If both compiled outputs pass the same tests, that's strong empirical evidence the compiler isn't introducing bugs.

## What the prover refuses to verify

Anything that touches the world: the database, the network, AI calls, email, time, randomness, or UI side-effects. These get an UNVERIFIABLE verdict. The prover is conservative — it would rather refuse to claim a proof than make a false one.

This is by design. Provable correctness covers the **business-logic layer** of an app — the math that determines outcomes. The integration layer (API calls, database writes, AI responses) is tested separately by Clear's existing test suite, which runs the compiled output end-to-end.

## Known soundness boundary (be honest about it)

The simplifier currently treats `+` as commutative even when its operands are untyped free variables. This is correct when both operands are numbers, but **wrong if either operand is a string** (string concatenation is NOT commutative — `'a' + 'b'` is `'ab'`, not `'ba'`).

In practice this is a narrow gap because:
- Clear's idiomatic string-building uses interpolation (`'Hello, {name}!'`), not `+`.
- Real business logic in `examples/proofs/` is arithmetic, not string-shaped.
- The prover refuses anything that touches data sources where strings typically come from (database reads, AI calls, HTTP).

But it IS a real gap. If you write a function whose `+` could mean string concat and you write a symbolic test claiming commutativity, the prover will (incorrectly) say PROVED. The proper fix is type-aware simplification, which would respect Clear's typed parameters (`define function add(a is number, b is number)`). Tracked as future work.

**For pure numeric business logic — every demo file in this directory — the proofs are sound.**

## How to add a new proof

```clear
# Define your pure function
define function my_function(a, b):
  return a * b

# Write a test — this becomes your proof obligation
test 'my function is commutative':
  expect my_function(a, b) is my_function(b, a)
```

Run `clear prove your_file.clear` and the prover does the rest. If `a` and `b` are bound elsewhere in the test (like `result = my_function(3, 4)`), the prover proves the specific case. If they're free variables, the prover automatically promotes them to "for any input" placeholders and tries to prove the claim universally.
