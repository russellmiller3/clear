# Plan — Winner harvesting loop (the missing 30% of Clear's RLVR system)

**Status:** sketch / not locked
**Date:** 2026-04-26 (Session 47)
**Context:** the RLVR-lens scorecard in `RESEARCH.md` (Session 47 section) shows the loop that turns sweep wins into permanent teaching material is Clear's biggest training-system gap. Loser-side teaching (the friction script → error-message rewrites) compounds permanently. Winner-side teaching (the hint retriever) is ephemeral — wins help the next call, then evaporate. This plan closes that asymmetry.
**Critical-path note:** NOT on the path to first paying Marcus customer. Recommend running after launch, or in an evening when Marcus blockers are clear and Russell wants research throughput.

---

## What the loop does (one paragraph)

After each sweep, look at every task where Meph passed all tests. Pull the winning Clear source for that run. Score each win for "exemplariness" — idiomatic, terse, no dead code, minimal retries to reach green. Promote the top N as canonical worked examples in a file the system prompt already loads. Future Meph sessions read those examples fresh on every call and pattern-match off them — the same way the per-call hint retriever works today, but durable across sessions and persistent across the whole user base.

## Why this matters

- **Loss-resistant.** Every win is permanent. Today's wins evaporate when the per-call cache turns over.
- **Cumulative.** Each sweep adds to the canonical example library. After 50 sweeps, the library has dozens of high-quality whole-app examples instead of three.
- **Compounds with Marcus.** When Marcus customers ship apps, their wins (with permission, scrubbed) seed the same library. Bigger user base → smarter Meph for everyone, forever, at $0.
- **Mirrors the loser-side loop.** The friction script already teaches the system from loser data. This is the symmetric move on the winner side. After this lands, both sides of the verifier signal compound permanently.

## Phases (lightweight — 5 cycles, ~3-5 days agent time total)

### Phase 1 — Score winning rows (~half day agent time)

One-time CLI that reads every `test_pass=1` row in the Factor DB and ranks them by an "exemplariness" score. Three signals:

- **Compactness.** Lines of Clear / number of milestones reached. Lower = better.
- **First-try cleanness.** Wins that compiled green on the first or second attempt score higher than wins after 8 retries. Cheap proxy for "the path was obvious."
- **Coverage uniqueness.** Does this win exercise an archetype × feature combo no existing canonical example covers? Bonus weight.

Output: a ranked list. Sanity-check the top 20 by hand — they should look like code Russell would point at and say "yes, that's idiomatic Clear."

**Done when:** the top 20 ranked wins pass the eyeball test.

### Phase 2 — Promote top wins into a canonical-examples file (~half day, by hand)

Pick the top 5-10 from the ranked list. Hand-edit a new file (`playground/canonical-examples.md` — see open decisions below) to add a "Canonical worked examples" section. Each entry: one paragraph of context (which archetype, what the app does, what's notable), then the Clear source.

**No auto-promotion yet.** Phase 2 is human-curated to set the quality bar. Auto-promotion lives in Phase 4.

**Done when:** 5-10 examples committed to the new file, each looking better than what's already in AI-INSTRUCTIONS.md.

### Phase 3 — Measure lift before going further (~1 day, ~$10 budget)

A/B sweep: same 5 curriculum tasks × 5 trials × 2 conditions (with new canonical-examples file injected vs. control). Measure pass rate. Per the RLVR-lens analysis, this is exactly the kind of "is the intervention worth the prompt-token cost?" measurement Clear's instrumentation already supports.

**Decision rules:**
- Lift > 5 percentage points → proceed to Phase 4 (auto-promotion).
- Lift 0-5pp → keep the manually-curated file from Phase 2; skip Phase 4. The bar is too low to justify the auto-pipeline.
- Lift negative → kill the plan. Roll back the file. Document the negative result in `RESEARCH.md`.

**Done when:** A/B result documented with a clear go/no-go.

### Phase 4 — Auto-promotion (only if Phase 3 shows lift, ~2 days)

Nightly job: runs the scorer from Phase 1, picks the top-K new wins since the last run, drafts edits to the canonical-examples file, opens a pull request for human review. **Never auto-merges.** Russell or Claude reviews each promotion to keep the quality bar high.

Wired with a small budget cap so a runaway scorer can't dilute the file with mediocre wins.

**Done when:** one PR has been auto-opened, reviewed by Russell, and merged.

### Phase 5 — Held-out test set (parallel with any phase, ~half day)

Carve off 5 of the 35 curriculum tasks to be measurement-only. They never seed the hint retriever and never feed the canonical-examples file. They only grade. Prevents the whole plan from becoming a memorization exercise.

This phase is independent of Phases 1-4 — can run in parallel. **Should run before Phase 3** so the A/B measurement uses uncontaminated tasks.

**Done when:** the held-out 5 are tagged in the curriculum index and excluded from both the retriever and the example-promotion pipeline.

## Open decisions (to lock when we pick this up)

1. **Which file gets the new examples?** Two options:
   - **AI-INSTRUCTIONS.md** — Meph already reads it every session. Risk: file is already big (~1.2k lines), context-window pressure.
   - **A new file `playground/canonical-examples.md`** — referenced from the system prompt. Cleaner separation, easier to scope the budget.

   *Recommendation:* new file. Keeps AI-INSTRUCTIONS focused on conventions and lets the examples library grow under its own budget.

2. **How many examples max?** Diminishing returns and context-window pressure both kick in around 15-20.

   *Recommendation:* hard cap of 15, with a per-archetype quota (1-2 per archetype) to prevent the library skewing toward the easy tasks Meph passes most often.

3. **Auto-promotion threshold.** What "exemplariness score" trips a PR?

   *Recommendation:* top decile of any sweep's wins, not an absolute cutoff — keeps the pipeline producing PRs even as the bar rises.

4. **Where does Meph see the examples?** Always-injected into the system prompt? Or retrieved per-call when archetype matches?

   *Recommendation:* always-injected for the first 5-10 examples (small enough). If the library grows past 15, switch to retrieve-on-archetype-match like the hint pipeline does today.

## Definition of done

- 15 canonical worked examples in the chosen file, covering at least 10 of 16 archetypes
- A/B-measured pass-rate lift > 5pp on the held-out test set, OR the plan is killed in Phase 3 with the data in `RESEARCH.md` showing why
- Auto-promotion pipeline running nightly with a human-review PR (or explicitly killed in Phase 3)
- Held-out test set of 5 curriculum tasks tagged and excluded from both retriever and example-promotion pipelines

## Out of scope (separate plans)

- Distillation pipeline (research item SK-6). Different problem — needs a small model, transcript export, fine-tuning.
- Loser-contrast examples ("this almost worked but failed because X"). Worth experimenting with after this lands; keeping it out keeps Phase 3's A/B clean.
- Best-of-N sampling per task. Cheap to layer on once Phase 1 ships, but its own measurement question. Separate.
- Compiler flywheel A/B testing of emit strategies. Tracked as CF-2 in ROADMAP.

## Risks worth flagging

- **Memorization.** Without Phase 5, you can't tell whether the lift is "Meph learned the shape" vs "Meph saw this exact task." Phase 5 is non-negotiable before Phase 3 fires.
- **Dilution.** If auto-promotion runs without a quality bar, the library fills with marginal wins and the average example quality drops. Phase 4's per-archetype quota and top-decile gate are the guards.
- **Prompt-token cost.** Every example added pays per-call. The Phase 3 A/B is the only honest test of whether each example pays for itself. Don't skip it.
