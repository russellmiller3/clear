# Session state — provable correctness sprint (FINAL)

**Last updated:** 2026-05-01 end of overnight session
**Branch:** `feature/decidable-core-prover` (NOT merged to main)
**Status:** Two milestones shipped, all tests green, docs partially cascaded.

## Resume prompt for a fresh session

> Read `HANDOFF.md` and `SESSION-STATE.md`. We're on `feature/decidable-core-prover` with the provable-correctness moonshot first slice shipped. All tests green. Critical path is still the lead-routing plan + Stripe + DNS + cert before first Marcus customer. Provable correctness work continues post-launch (ROADMAP PC-1..PC-6).

## What shipped tonight (in order)

1. ✅ Concrete-mode prover (`lib/prover/evaluator.js` + `index.js`)
2. ✅ CLI command `clear prove <file>` with `--bundle` and `--json` flags
3. ✅ 15 concrete unit tests, all green
4. ✅ Demo file: `examples/proofs/invoice.clear` (8 proofs, all PROVED)
5. ✅ **Milestone 1 commit:** `a024e3b`
6. ✅ Tried prover on Marcus deal-desk — correctly refused (integration-test shaped, not pure-math)
7. ✅ Two more demo files: `pricing.clear` (10 proofs) + `eligibility.clear` (13 proofs)
8. ✅ Symbolic-mode prover (`lib/prover/symbolic.js`) — simplifier with canonical form
9. ✅ 15 symbolic unit tests, all green
10. ✅ Symbolic mode wired into public `prove()` — auto-falls-back when test has free variables
11. ✅ Theorem demo file: `theorems.clear` — 7 universal theorems PROVED + 1 honest UNKNOWN
12. ✅ **Milestone 2 commit:** `7a533eb`
13. ✅ Doc cascade priority surfaces: CHANGELOG, FEATURES, ROADMAP (with PC-1..PC-6 next-moves), RESEARCH, FAQ
14. ✅ HANDOFF.md rewritten for tomorrow's pickup
15. ⏳ Final docs commit (next)

## Tests passing

| Suite | Count |
|-------|-------|
| Prover concrete tests (`lib/prover/index.test.js`) | 15/15 |
| Prover symbolic tests (`lib/prover/symbolic.test.js`) | 15/15 |
| Compiler tests (`clear.test.js`) | 2533/2533 |
| **Total tonight** | **2563/2563** |

## Demonstrated proofs

| File | Concrete | Universal | Status |
|------|----------|-----------|--------|
| `examples/proofs/invoice.clear` | 8 | 0 | ✓ all PROVED |
| `examples/proofs/pricing.clear` | 10 | 0 | ✓ all PROVED |
| `examples/proofs/eligibility.clear` | 13 | 0 | ✓ all PROVED |
| `examples/proofs/theorems.clear` | 0 | 7 + 1 UNKNOWN | ✓ 7 PROVED for ANY input, 1 honest UNKNOWN |

## What's NOT in this branch (next session)

- **PC-1:** Distributivity rule in the simplifier (`x*2 === x+x`) — ~1 hr
- **PC-2:** Conditional handling in symbolic mode — ~3-4 hr
- **PC-3:** Phase B-2 effect quarantine in validator — ~1-2 hr
- **PC-4:** Marcus deal-desk proof bundle — ~2-3 hr
- **PC-5:** Full doc cascade (intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, landing/, system-prompt.md) — ~2 hr
- **PC-6:** Verified compiler (CompCert-style) — year 2

## Critical path (unchanged)

Provable correctness is research-backlog, NOT on critical path to first paying Marcus customer. That's still:
1. Lead-routing primitive plan (`plan/routing-primitive`)
2. Stripe webhook receiver (CC-3)
3. DNS verification poller (CC-5b)
4. Fly cert provisioner (CC-5c)
5. Russell pitches Marcus

## Decisions Russell needs to make

- **Merge `feature/decidable-core-prover` to main?** Recommendation: yes. Everything green, docs landed, no regressions.
- **Continue provable-correctness work or pivot back to launch path?** Recommendation: pivot to launch. PC-1..PC-6 belong post-launch.

## How to resume tomorrow (local Claude Code)

```
git checkout feature/decidable-core-prover
node clear.test.js                                  # confirm 2533/2533 green
node lib/prover/index.test.js                       # confirm 15/15 green
node lib/prover/symbolic.test.js                    # confirm 15/15 green
node cli/clear.js prove examples/proofs/theorems.clear  # see the universal theorems prove
```
