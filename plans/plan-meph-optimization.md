# Meph Optimization — Empirical Plan

**Status:** drafted 2026-05-06, red-teamed 2026-05-06. Not yet executed. Red-team fixes the harness/metric mismatch, sample size, cost estimate, and several unspecified knobs.

## The question

Is the current Meph setup — lean system prompt + cheat sheet + tool-based access to SYNTAX/AI-INSTRUCTIONS/USER-GUIDE + retrieval pipeline — actually optimal? Or would Meph write better Clear faster if we shifted material between layers?

This is empirical, not philosophical. We have the harness; we should measure.

## Critical setup — PIN BEFORE RUNNING

These were ambiguous in the v1 draft and materially change cost and validity.

- **Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`). Meph's current production model. Don't mix Sonnet and Haiku across configs — attention behavior on a 150k-token prompt differs sharply between them and would invalidate the comparison.
- **Harness — pick one path before running:**
  - **PATH 1 (recommended): extend `studio/eval-fullloop.js` to a 16-scenario suite.** The v1 metrics (compiles + tests green, turns to green, error-recovery rate) require MULTI-turn build cycles. Today `eval-fullloop.js` is one scenario (kudos board). Add 15 more scenarios mirroring the kudos shape across different archetypes (CRUD, agent, real-time, dashboard, workflow). ~3 hours of harness work; produces the metrics the plan claims.
  - **PATH 2 (fast fallback): use `studio/eval-meph.js` as-is.** 16 single-turn tool-call scenarios already exist. Drop the multi-turn metrics (turns to green, error-recovery rate). Replace with single-turn metrics: tool-call accuracy, self-report quality, output token count. ~0 harness work; weaker signal on actual app-build quality.
  - **DON'T mix:** the v1 draft pointed at `eval-meph.js` AND demanded multi-turn metrics. That's the core methodology bug.
- **Iteration cap per scenario:** 25 turns (current Meph cc-agent default). Over-cap kills cost predictability.
- **Trials per (config, scenario):** **5**, not 3. With 16 binary-outcome scenarios, n=3 produces overlapping 95% CIs even for 30%+ effects — almost any result reads as "tie." n=5 is the floor for the stated bar.

## The three configs to test

Run the chosen harness against three configurations on the same 16 scenarios. Use the same model + iteration cap + scenario set + tool surface for all three.

### Config A — Current (baseline)
- **System prompt file:** `studio/system-prompt-A.md` = exact copy of `studio/system-prompt.md` (today: 1555 lines, ~22k tokens).
- **Reference docs:** SYNTAX/AI-INSTRUCTIONS/USER-GUIDE accessible via `read_file` tool (current behavior).
- **Retrieval:** shape-search fires on demand from Meph (current behavior).
- **meph-memory.md** read at session start (current behavior).
- **Trade:** balanced — moderate prompt size, reactive retrieval, full reference reachable.

### Config B — Everything in prompt
- **System prompt file:** `studio/system-prompt-B.md` = `system-prompt.md` + `SYNTAX.md` + `AI-INSTRUCTIONS.md` + `USER-GUIDE.md` concatenated with section headers. ~13,100 lines, ~150k tokens.
- **Reference docs:** still reachable via `read_file` (Meph may not need it but the tool stays available — removing it would change tool surface, confounding the comparison).
- **Retrieval:** same shape-search as Config A (don't disable — keep tool surface identical).
- **Trade:** max prompt-cache savings if cache hits; max attention-dilution risk; massive per-turn input cost on cache miss.

### Config C — Lean prompt + aggressive retrieval
- **System prompt file:** `studio/system-prompt-C.md` = persona + 12-rule cheat sheet + tool descriptions only. ~150 lines, ~3k tokens.
- **Reference docs:** reachable via `read_file` (fallback if retrieval misses).
- **Retrieval — proactive trigger:** shape-search fires automatically BEFORE the model emits any `edit_code` (action=write|patch) or `compile` tool call. Hook point: in `/api/chat` server.js, intercept tool_use blocks before forwarding to client; if name in {`edit_code`, `compile`}, run shape-search on the current source's archetype, append the 2 top examples as a synthetic `tool_result` turn before the next model call. Wire under `if (process.env.MEPH_CONFIG === 'C')` guard so Configs A/B are untouched.
- **Trade:** lowest per-turn input cost; quality depends on retrieval ranker quality; risks injecting irrelevant examples that mislead Meph.

## Metrics

For each (config × scenario × trial), capture:

| Metric | What it tells us | PATH 1 only? |
|---|---|---|
| Pass rate (compiles + tests green) | Quality | PATH 1 (multi-turn build) |
| Tool-call accuracy (called expected tool) | PATH 2 quality proxy | PATH 2 |
| Self-report quality (Meph flagged issue?) | PATH 2 quality proxy | PATH 2 |
| Total input tokens per scenario | Cost | both |
| Total output tokens per scenario | Cost | both |
| Cache-hit token count | Cost (real billable input) | both |
| Wall-clock time per scenario | UX | both |
| Turns to green | Efficiency | PATH 1 |
| Tool-call distribution (read_file vs compile vs run_tests) | Where Meph spends attention | both |
| Error-recovery rate (compile fail → green within N turns) | Resilience | PATH 1 |

**Sample size:** 16 scenarios × 3 configs × **5 trials** = **240 runs**. n=3 was the v1 number; that's underpowered for the stated CI bar.

**Revised cost estimate** — depends on harness path AND prompt cache behavior:

- **PATH 1 (multi-turn, ~10 turns/scenario, Sonnet 4.6):**
  - Config A: 80 runs × ~$0.40 = **~$32** (22k-token prompt, mostly cached)
  - Config B: 80 runs × ~$2.50 = **~$200** (150k-token prompt; cache helps within trial, fresh per scenario)
  - Config C: 80 runs × ~$0.20 = **~$16** (3k prompt + retrieval injections)
  - **PATH 1 total: ~$250**
- **PATH 2 (single-turn, Sonnet 4.6):**
  - Config A: 80 runs × ~$0.07 = **~$6**
  - Config B: 80 runs × ~$0.45 = **~$36**
  - Config C: 80 runs × ~$0.04 = **~$3**
  - **PATH 2 total: ~$45**

The v1 estimate of $30 assumed ~$0.20/run flat — that's the EVAL-MEPH single-turn cost from the harness header comment, applied to a scenario count it doesn't actually run. Real PATH 1 is ~8× that; real PATH 2 is ~1.5×. Re-estimate against actual rates with `node studio/supervisor/estimate-cost.mjs` if it accepts these knobs.

**Statistical bar:** for any pairwise A/B/C comparison, claim a winner only if EITHER (a) pass-rate gap ≥10pp with non-overlapping 90% CI on Wilson-score interval (n=80 per config gives this enough power for a 10pp effect), OR (b) cost-per-pass gap ≥30% with the loser's pass-rate within 5pp of the winner. Otherwise honest "tie." The v1's 95% CI bar at n=48 was almost certainly going to produce ties — n=80 + 90% CI is the minimum that detects realistic effect sizes.

## Bias controls — REQUIRED, not optional

- **Run interleaving.** Pre-generate a shuffled order of all 240 (config, scenario, trial) tuples with a pinned random seed (commit the seed in the results file). Don't run all-A then all-B then all-C — time-of-day API performance variance would mascarade as a config effect.
- **Cache control.** Anthropic prompt cache TTL is 5 minutes. With interleaved order, no config holds a sustained cache advantage. Confirm by logging `cache_read_input_tokens` per turn — if any config systematically reads more cached tokens than others, cost numbers are biased.
- **Pre-registered analysis.** Write the analysis script (`studio/eval-meph-optimization-analyze.mjs`) BEFORE running. Pin the seed, the metrics, and the comparison logic. No post-hoc bar adjustments.
- **Identical scenario inputs.** All three configs see the same `editorContent`, same `personality`, same starting state. Only the system prompt and retrieval mode differ.

## Hypothesis

Config C beats both A and B on the joint pass-rate + cost frontier. Reasoning:
- Config B dilutes attention with 7000 lines of reference; specific-recall benchmarks show this hurts at scale.
- Config A's reactive retrieval (Meph asks for docs after a compile error) burns turns on round-trips Config C avoids.
- Config C's proactive shape-search injects the right canonical example BEFORE Meph writes — fewer first-shot errors.

## Execution plan

1. **Branch + setup** (~1.5 hours)
   - `feature/meph-optimization-eval`.
   - **Build the three prompt files:**
     - `studio/system-prompt-A.md` = `cp studio/system-prompt.md` (line-for-line copy of baseline). Note: Config A's reference docs are ALREADY reachable via `read_file` tool — no further setup.
     - `studio/system-prompt-B.md` = concatenated build with section headers separating each source: `cat studio/system-prompt.md SYNTAX.md AI-INSTRUCTIONS.md USER-GUIDE.md > studio/system-prompt-B.md`. Verify ~150k tokens after concatenation.
     - `studio/system-prompt-C.md` = manual extract: persona block + 12-rule cheat sheet + tool descriptions only. Target ~3k tokens. Cross-check against current `system-prompt.md` to make sure no critical safety/refusal language is dropped.
   - **Wire MEPH_CONFIG.** In `studio/server.js` near line 2468 (current `readFileSync` for system-prompt.md):
     ```js
     const cfg = process.env.MEPH_CONFIG || '';
     const promptFile = cfg === 'A' ? 'system-prompt-A.md'
                      : cfg === 'B' ? 'system-prompt-B.md'
                      : cfg === 'C' ? 'system-prompt-C.md'
                      : 'system-prompt.md';  // default = current behavior
     const systemPrompt = readFileSync(join(__dirname, promptFile), 'utf8');
     ```
   - **Wire proactive retrieval for Config C.** In `/api/chat` tool-use forwarding loop, after a model turn that emits `edit_code` (write|patch) or `compile`, BEFORE the next model call: if `process.env.MEPH_CONFIG === 'C'`, call shape-search on the current source's archetype, prepend top-2 examples as a synthetic `tool_result` content block. Test path: send a known archetype, confirm the synthetic block appears in the next request's messages array.
   - **Pick harness path** (PATH 1 or PATH 2 from "Critical setup"). If PATH 1: extend `studio/eval-fullloop.js` to support a 16-scenario list — copy `studio/eval-scenarios.js` shape and write 15 multi-turn build prompts spanning the same archetypes (todo, crm, blog, chat, agent, booking, expense, ecom + 8 more variations).
   - **Write the analysis script** (`studio/eval-meph-optimization-analyze.mjs`) BEFORE running. Pin random seed in results file.

2. **Calibration run — single config, single trial** (~15 min, ~$5)
   - Pick Config A (baseline) and run 1 trial × 16 scenarios. Confirm:
     - The harness wiring works end-to-end.
     - Per-scenario cost matches the estimate ±50%.
     - The metrics CSV captures every required field.
   - **If actual cost is >50% above estimate, STOP. Recalibrate before running the full sweep.** This step is the budget circuit-breaker — better to lose $5 to discover the estimate is wrong than $250.

3. **Full run** (~6-8 hours wall-clock, ~$250 PATH 1 / ~$45 PATH 2)
   - Generate the shuffled (config, scenario, trial) order with the pinned seed.
   - Loop through all 240 runs (interleaved). Capture all metrics + full transcript per run.
   - Append-only CSV with one row per (config, scenario, trial). Save transcripts to `studio/eval-results/transcripts/<config>-<scenario>-<trial>.json`.
   - **Hard daily-spend cap**: stop the run if cumulative API spend exceeds $300. Resume next day if needed.

4. **Analyze** (~1 hour)
   - Run the pre-registered analysis script.
   - Compute per-config pass-rate, Wilson-score 90% CI, cost-per-pass, cost-per-attempt.
   - Pairwise comparisons against the bar in "Statistical bar."
   - Tool-call frequency table per config.
   - Box plot of turns-to-green per config (PATH 1 only).

5. **Ship the winner** (~30 min)
   - If a winner exists per the bar: rename winning config's prompt to `studio/system-prompt.md`. Update `studio/server.js` to drop the MEPH_CONFIG branching (or keep it gated behind a feature flag for re-running).
   - Document numbers in `CHANGELOG.md` with the actual pass rates, costs, CIs.
   - Move losing configs to `studio/system-prompt-archive/` for future re-runs.
   - **If no winner per the bar: don't ship anything.** Document the tie in CHANGELOG with the numbers and the implication ("tested 3 configs, no statistically detectable difference at the bar set in plan-meph-optimization.md"). The plan stays parked.

## Risk + escape hatches

- **If all three configs are statistically tied:** the gap is in retrieval quality, not prompt structure. Pivot to a focused retrieval-quality eval — same harness, vary the shape-search ranker.
- **If Config B wins on pass-rate but loses on cost:** that's the long-context vs prompt-cache trade. Worth a side experiment with a smaller prompt-cache breakpoint.
- **If Config C wins:** there's a follow-up question — can we make retrieval EVEN MORE aggressive (3 examples? keyword-augmented shape search?). Iterate.

## Why NOT to do this right now

- **Critical-path ranking.** The first-paying-Marcus journey doesn't need Meph at peak — it needs Marcus to see a working pitch and a deployed app. Meph optimization is a force multiplier on flywheel economics, not a gate to revenue.
- **Cost (revised).** PATH 1 (multi-turn build) is **~$250**, PATH 2 (single-turn) is **~$45**. The v1 plan's $30 estimate was 1.5–8× low. PATH 1 is meaningful API spend on a non-critical-path investigation.
- **Empirical work has compounding cost.** Once you have the harness running, you keep iterating. That's productive but not on the critical path. PATH 1 also requires building a 16-scenario multi-turn suite — that's a real engineering investment that doesn't unlock until Meph optimization itself becomes the bottleneck.
- **Strawman risk on Config B.** Naive concatenation of 13k lines is the WORST case for "everything in prompt." A real production version would order strategically (most-relevant-first), strip USER-GUIDE prose, etc. So Config B losing doesn't prove "everything in prompt" is wrong — only that the naive form is. Be honest about this in the writeup.

## When to do it

After Marcus signs and there's revenue funding the API budget, OR if Meph quality regresses noticeably on a specific archetype and we need the eval to triage.

Until then, this plan stays parked. The advantage of writing it now AND red-teaming it now: when we ARE ready to run, the design is settled. Execute in ~10 hours total (PATH 1) or ~6 hours (PATH 2) instead of debating for a week.
