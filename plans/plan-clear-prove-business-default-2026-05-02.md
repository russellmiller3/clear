# Plan: make `clear prove` default to business-friendly output

**Status:** ready when the rule-keyword rebuild lands. Small, ~2 hour agent task.
**Date:** 2026-05-02.
**Trigger:** the rule keyword rebuild pushes a feature branch ready to merge. Apply this plan AFTER that merge.

---

## Why

The translator at `scripts/proof-business-language.mjs` already turns verdicts into sentences a CRO can read. Today it's a separate command — authors run `clear prove` AND have to remember to pipe through the translator. That extra step kills the pitch.

After the rule keyword lands, the prover output is the load-bearing surface for the regulated-tier sale. Default behavior should be the readable version. Math-journal output stays available behind a flag for the prover engineers who want it.

## Surface change

**Before (today):**
```
$ clear prove apps/deal-desk/main.clear

discount_cap: PROVED for any: amount
deal_size_check: UNVERIFIABLE — symbolic engine: stripe call (effect)
...
```

**After:**
```
$ clear prove apps/deal-desk/main.clear

We proved 3 of 5 named rules in this app, for every possible deal.

  ✅ discount-cap                        PROVED for every possible deal
  ✅ deal-over-100k-needs-cro-signoff    PROVED for every possible deal
  ✅ approval-window                     PROVED for every possible deal
  ⚠  refund-cap                          Talks to Stripe — not provable, tests still cover it
  ❌ deal-size-check                     Counterexample: deal at exactly $0
```

**Math mode (opt-in for engineers):**
```
$ clear prove apps/deal-desk/main.clear --math
[old terse format]
```

## Implementation outline

1. **Test first.** New tests in `clear.test.js` under `describe('clear prove default formatting')`:
   - Default output contains the headline ("We proved N of M rules...") in plain English.
   - Default output uses CRO sentences ("PROVED for every possible deal", "Talks to Stripe — not provable").
   - `--math` flag falls back to today's formatBundle output.
   - `--json` is unchanged (machine-readable bundle, no formatting layer).
   - The translator script's `translateBundle()` is invoked from `proveCommand`.

2. **Wire the translator.** In `cli/clear.js` `proveCommand`:
   - Import `translateBundle` from `scripts/proof-business-language.mjs` (move it to `lib/` if needed, but the script already exports the function).
   - Replace the default output path (the `console.log(formatBundle(bundle))` branch) with the translator's output.
   - Keep `formatBundle` available behind `--math`.

3. **No backend changes.** Translator already takes the prover bundle and produces lines + headline. Just compose.

4. **Update the auto-prove summary in `clear test`.** PC-8 added a one-line proof summary at the bottom of `clear test`. After the rule keyword lands, that line should also use the translator's headline format ("3 of 4 rules proved, 1 unverifiable") instead of "Proofs: 3 proved, 1 unknown".

5. **Doc cascade:**
   - `cli/clear.js` help text — describe `--math` flag and the default human format.
   - `FAQ.md` — update the "How does `clear test` show proof status?" entry.
   - `FEATURES.md` — update the auto-prove row to mention the human-friendly default.
   - `CHANGELOG.md` — session-dated entry.

## Why this is the right next step

The rule keyword rebuild produces NAMED rules with PER-RULE verdicts. The translator turns each verdict into a CRO sentence. Composing them is the actual pitch surface — without composition, the rule keyword still emits math-journal output that doesn't sell.

Two pieces already shipped (translator + auto-prove). Rule keyword is in flight. This plan glues the three together so the result is a one-command pitch surface a CRO can read.

## What NOT to do

- **Don't change the JSON output.** Machine consumers (Studio, sweep tooling, evaluators) need the structured bundle. The translator only changes what a human sees on stdout.
- **Don't make `--math` the default.** Math mode is for prover engineers. Default is the customer-facing surface.
- **Don't skip the `clear test` integration.** PC-8 made auto-prove visible in every test session — that surface needs the human format too, otherwise the new rule keyword shows up half-readable and half-mathy.

## Trigger to start

When the rule-keyword rebuild agent reports its branch ready (branch `feature/rule-keyword-rebuild`), the parent session merges it to main, then kicks this plan as a follow-up. ~2 hours of agent work.

## Files this plan touches

- `cli/clear.js` (proveCommand, summarizeProofBundle for `clear test`)
- `clear.test.js` (new describe block)
- `scripts/proof-business-language.mjs` — possibly move to `lib/proof-business-language.mjs` for cleaner import
- `cli/clear.js` help text
- `FAQ.md`, `FEATURES.md`, `CHANGELOG.md`

No conflict with the rule keyword rebuild — that agent owns parser/compiler/validator/prover/demos. This plan only touches the formatter at the CLI edge.
