# Meph Optimization — Empirical Plan

**Status:** drafted 2026-05-06. Not yet executed.

## The question

Is the current Meph setup — lean system prompt + cheat sheet + tool-based access to SYNTAX/AI-INSTRUCTIONS/USER-GUIDE + retrieval pipeline — actually optimal? Or would Meph write better Clear faster if we shifted material between layers?

This is empirical, not philosophical. We have the harness; we should measure.

## The three configs to test

Run the existing `studio/eval-meph.js` harness against three configurations on the same 16 scenarios. Use the same model + iteration cap + everything else.

### Config A — Current (baseline)
- System prompt: ~1300 lines including cheat sheet, security primitives, role guidance
- SYNTAX/AI-INSTRUCTIONS/USER-GUIDE accessible via `read_file` tool
- Shape-search retrieval fires on demand from Meph
- meph-memory.md read at session start

### Config B — Everything in prompt
- System prompt: SYNTAX.md + AI-INSTRUCTIONS.md + USER-GUIDE.md concatenated (~7000 lines)
- No `read_file` tool needed (all reference is already in context)
- Same retrieval pipeline still fires
- Trade: max prompt-cache savings; max attention-dilution risk

### Config C — Lean prompt + aggressive retrieval
- System prompt: persona + 12-rule cheat sheet ONLY (~150 lines)
- All reference docs accessible via `read_file`
- Shape-search retrieval fires PROACTIVELY before any code-write — every turn that touches Clear source pulls 2 canonical examples matching the task's archetype, injects them into the turn
- Trade: lowest input-token cost per turn; depends on retrieval quality

## Metrics

For each config × scenario, capture:

| Metric | What it tells us |
|---|---|
| Pass rate (compiles + tests green) | Quality |
| Total tokens per scenario (input + output) | Cost |
| Wall-clock time per scenario | UX |
| Turns to green | Efficiency |
| Tool-call distribution (read_file vs compile vs run_tests) | Where Meph spends attention |
| Error-recovery rate (compile fail → green within N turns) | Resilience |

**Sample size:** 16 scenarios × 3 configs × 3 trials each = 144 runs. At ~$0.20 per run, total cost ~$30.

**Statistical bar:** for any pairwise A/B/C comparison, claim a winner only if 95% CI on pass-rate excludes overlap AND cost difference is ≥30%. Otherwise honest "tie."

## Hypothesis

Config C beats both A and B on the joint pass-rate + cost frontier. Reasoning:
- Config B dilutes attention with 7000 lines of reference; specific-recall benchmarks show this hurts at scale.
- Config A's reactive retrieval (Meph asks for docs after a compile error) burns turns on round-trips Config C avoids.
- Config C's proactive shape-search injects the right canonical example BEFORE Meph writes — fewer first-shot errors.

## Execution plan

1. **Branch + setup** (~30 min)
   - `feature/meph-optimization-eval`
   - Copy current system-prompt.md → `studio/system-prompt-A.md` (baseline)
   - Build B by concatenating system-prompt + SYNTAX + AI-INSTRUCTIONS + USER-GUIDE → `studio/system-prompt-B.md`
   - Build C by extracting persona + cheat-sheet sections → `studio/system-prompt-C.md`
   - Add proactive shape-search call to `/api/chat` flow when config = C
   - Add a `MEPH_CONFIG=A|B|C` env var that picks which prompt + which retrieval mode

2. **Run** (~3 hours, ~$30)
   - 16 scenarios × 3 configs × 3 trials each
   - Capture all metrics to `meph-optimization-results.csv`
   - Save full transcripts for spot-check

3. **Analyze** (~1 hour)
   - Compute per-config pass-rate ± 95% CI
   - Compute cost-per-pass and cost-per-task
   - Box plot of turns-to-green per config
   - Tool-call frequency table

4. **Ship the winner** (~30 min)
   - Adopt the winning config as the default
   - Document the result in CHANGELOG with the eval numbers
   - Park the losing configs as `studio/system-prompt-archive/` for future re-runs

## Risk + escape hatches

- **If all three configs are statistically tied:** the gap is in retrieval quality, not prompt structure. Pivot to a focused retrieval-quality eval — same harness, vary the shape-search ranker.
- **If Config B wins on pass-rate but loses on cost:** that's the long-context vs prompt-cache trade. Worth a side experiment with a smaller prompt-cache breakpoint.
- **If Config C wins:** there's a follow-up question — can we make retrieval EVEN MORE aggressive (3 examples? keyword-augmented shape search?). Iterate.

## Why NOT to do this right now

- Critical-path ranking. The first-paying-Marcus journey doesn't need Meph at peak — it needs Marcus to see a working pitch and a deployed app. Meph optimization is a force multiplier on flywheel economics, not a gate to revenue.
- Cost. ~$30 of API spend for the eval runs. Worth it once we have spare API budget; not worth borrowing from a finite Anthropic credit pool while CC-3/CC-5b/Stripe live keys are still pending.
- Empirical work has compounding cost. Once you have the harness running, you keep iterating. That's productive but not on the critical path.

## When to do it

After Marcus signs and there's revenue funding the API budget, OR if Meph quality regresses noticeably on a specific archetype and we need the eval to triage.

Until then, this plan stays parked. The advantage of writing it now: when we ARE ready to run, the design is settled and we can execute in 5 hours instead of debating for a week.
