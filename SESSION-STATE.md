# Session state — provable correctness sprint

**Last updated:** 2026-05-01 evening
**Branch:** `feature/decidable-core-prover`
**Goal:** Build a working math proof checker for Clear's pure subset. Tonight = as far as possible.

## Resume prompt for a fresh session

> Read `SESSION-STATE.md` and continue from where it left off. We're building a proof checker for Clear's pure subset. Branch is `feature/decidable-core-prover`. Pick up at the next pending todo.

## Why this matters

Russell picked **provable correctness** as the moonshot — the only AI coding tool whose output comes with a math proof against its tests. Every other AI coding tool fights over the startup market; this opens regulated industries (banks, hospitals, defense) where AI-generated code is currently locked out. Real budgets, no competitors, structural moat (Clear's grammar is small enough to verify; JS/Python aren't).

Decidable Core is an in-flight epic — `live:` is described in docs but **not actually shipped on main yet**. Tonight builds the prover; the `live:` parser work and the doc cascade come tomorrow.

## Current todos

1. ✅ Find existing live:/decidable-core code — confirmed `live:` not yet on main
2. ✅ Map Clear's pure subset
3. ✅ Design tiny in-house prover (no deps)
4. 🔄 Build the prover evaluator (concrete walker)
5. ⏳ Wire prover to read existing test blocks
6. ⏳ Produce proof-bundle output (JSON + human summary)
7. ⏳ Write unit tests for the prover
8. ⏳ Add `clear prove` CLI command
9. ⏳ End-to-end demo
10. ⏳ Commit incrementally
11. ⏳ Tomorrow handoff

## Architecture

```
lib/prover/
  index.js          — public API: prove(ast, source) → ProofBundle
  evaluator.js      — concrete-value walker (literals, binary/unary, calls, conditionals)
  test-extractor.js — pull EXPECT / UNIT_ASSERT nodes from TEST_DEF
  bundle.js         — format result as JSON + human-readable
  index.test.js     — unit tests
cli/clear.js
  + new `prove` command
```

## AST shape (confirmed by parsing a real example)

- `function_def`: `{ type, name, params:[{name,type}], body, line }`
- `assign`: `{ type, name, expression, line }`
- `respond`: `{ type, expression, status, line }` — used for `send back X`
- `binary_op`: `{ type, operator, left, right, line }`
- `variable_ref`: `{ type, name, line }`
- `literal_number/string/boolean`: `{ type, value, line }`
- `test_def`: `{ type, name, body, line }`
- `unit_assert`: `{ type, left, check, right, line, rawLeft }` — for `expect X is Y`

## Surprises / pitfalls so far

1. **`live:` not on main.** Docs claim Phase B-1 shipped — actually on a feature branch that didn't merge. Doesn't block tonight; the prover refuses to verify impure ops by detection, not by parser fence.
2. **Param parsing quirk:** `taking a and b` parses as 3 params `[a, and, b]` because `and` is treated as a name. Not blocking but worth noting — proof tests need to use a syntax that produces clean args.
3. **`expect add with a 3 and b 4 is 7`** parses as `unit_assert` with `left = variable_ref(add)` and the args mashed into `rawLeft` as a string — NOT a structured CALL with args. Need a different test syntax for proofs, or reparse rawLeft.
4. **No new npm deps.** The compiler's zero-dep rule. Prover must be pure JS.

## Decisions made

- **No external SMT solver tonight.** Build a tiny in-house prover. Z3 (or similar) is the year-2 upgrade.
- **Concrete-value proof first.** Walk the AST with concrete inputs from the test, check assertion. Symbolic generality (∀ inputs) is phase 2.
- **Bypass the compiler.** Prover walks the AST directly — never goes through compiled JS. Rules out compiler bugs on the proof path.
- **Detect impurity by node-type allowlist.** Pure: literals, binary/unary ops, variable refs, calls to user functions, conditionals, assigns. Anything else → UNVERIFIABLE with a reason.

## Commits made so far

- (none yet)

## Open questions for Russell

- For test syntax that needs structured args (so the prover can extract args without reparsing rawLeft strings), which form do you prefer?
  - **A:** `expect add with a 3 and b 4 is 7` (current — but rawLeft is a string)
  - **B:** `result = add with a 3 and b 4 \n expect result is 7` (uses ASSIGN + CALL)
  - **C:** New syntax just for proofs (more work)

  I'm going with B for tonight unless you say otherwise — it produces clean structured AST and matches existing patterns.

## How to resume tomorrow (local Claude Code)

```
git checkout feature/decidable-core-prover
git pull
node clear.test.js   # confirm baseline green
# then read SESSION-STATE.md, pick up next pending todo
```
