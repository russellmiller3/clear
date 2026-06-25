# Legacy symbolic decision engine (archived 2026-06-25)

`symbolic.js` here is a **verbatim snapshot** of `lib/prover/symbolic.js` as it stood
just before the prover's symbolic decision core was replaced by a Z3 (SMT solver)
backend (`lib/prover/z3/`).

**Why it's kept:** intentional retention at Russell's instruction — so the original
hand-rolled term-rewriter (fixed-point simplifier + `symEquals`/`symCompare` deciders)
can be restored if ever needed.

**Status:** not imported by the live prover. The one live consumer is
`lib/prover/z3/parity.test.js`, which runs this archived engine as a differential
oracle to prove the Z3 backend never downgrades a verdict (PROVED → PARTIAL).

To restore: copy this file back over `lib/prover/symbolic.js` and revert the
`lib/prover/z3/` wiring.
