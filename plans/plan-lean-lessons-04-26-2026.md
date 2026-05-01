# Plan — Lean lessons for Clear (TBD placeholders + shape-search + open-capability visibility)

**Status:** sketch / not locked
**Date:** 2026-04-26 (Session 47)
**Context:** the Lean theorem prover and Clear share a deterministic-grader shape — both have a checker that says "this works" or "this doesn't" with no fuzzy middle. Three of Lean's most-used patterns map straight onto Clear and would each pay back in measured lift on Meph's pass rate. This plan groups all three so they can be sequenced together, share infrastructure, and be measured against each other in one A/B campaign.

The three lessons:
1. **`TBD` placeholders** (Lean's `sorry`) — let Meph mark a piece "to be filled in" and keep iterating on the structure
2. **Shape-search for canonical examples** (Lean's `library_search` / premise selection) — find past wins by program shape, not by error text
3. **Show open capabilities to Meph** (Lean's goal display) — make "what's still missing" visible to him as he writes, instead of forcing him to infer it from test output

**Critical-path note:** NOT on the path to first paying Marcus customer. Recommend running after launch, sequenced one at a time so the A/B for each is clean.

**Suggested order:** Lesson 1 → Lesson 3 → Lesson 2. Cheapest-to-implement first; each one builds infrastructure the next can reuse (Lesson 1 introduces "open holes" tracking, Lesson 3 surfaces them, Lesson 2 retrieves examples that match the open holes).

---

## Lesson 1 — `TBD` placeholders (Lean's "sorry")

### What it does

Add a single keyword — `TBD` — that Meph (or a human) can drop anywhere a value, expression, or block belongs. The compiler accepts it, marks it on the resulting program, and runs everything else. If a test exercises a placeholder, it skips with a "this is a stub" message. If running code reaches a placeholder, it logs and stops gracefully. Meph can iterate on the broken part without rewriting the whole program. Permanent placeholders that linger for many sessions get flagged.

### Why this matters

- **Cuts the rewrite tax.** Today, when one part breaks, Meph often rewrites the whole program. With placeholders, he keeps the structure and works on the hole.
- **Cleaner partial-progress signal.** A program with three `TBD` markers is worth more than one that won't compile at all — both for grading and for the example library.
- **Lets the canonical-examples library include skeletons.** A worked example for "queue with auth" can have the auth part as `TBD` so it's reusable across apps that bring their own auth.
- **Mirrors how Russell actually works with Meph.** When Russell says "leave the auth for now, focus on the queue," there's no syntax for that today. Meph either does both or neither.

### Phases (5 cycles, ~3 days agent time)

**Phase 1.1 — Accept `TBD` in the grammar (~half day).** Keyword locked: `TBD`. Universally understood business English ("to be determined"), short, reads cleanly out loud, matches how Marcus already writes notes. Grammar accepts `TBD` anywhere an expression OR a block can go. Single keyword, no parameters, no colon required. **Done when:** parser accepts `TBD` in expression position and as a block; one grammar test passes.

**Phase 1.2 — Compiler emits a tagged stub (~half day).** When the compiler hits `TBD`, it emits code that throws a clear "this is a stub" error at that spot, AND records the placeholder location on the result so the test runner, the canonical-examples library, and Lesson 3 (open-capability visibility) can find them. A program with placeholders compiles green at the structural level — NOT a compile error. **Done when:** a program with one `TBD` compiles, runs, and throws a clean stub-error message when the spot is hit.

**Phase 1.3 — Tests treat placeholders gracefully (~half day).** When a test reaches a placeholder, it doesn't fail — it skips with a "this test exercises a stub, skipped" message. Skip count is reported separately from pass / fail. The grader counts skipped-due-to-stub tests differently from failing tests: structure is right, piece isn't filled in yet. **Done when:** a placeholder-bearing program reports "X passed, Y failed, Z skipped due to stub" cleanly.

**Phase 1.4 — Teach Meph to use placeholders (~half day).** Update the system prompt with the new keyword + a worked example. Add a canonical example showing a deliberately partial program. The example should make obvious *when* to use `TBD` — "leave this part for next iteration" — not "use `TBD` to dodge hard parts." **Done when:** Meph in a clean session, given an ambiguous spec, drops a `TBD` for the ambiguous part and asks for clarification rather than guessing.

**Phase 1.5 — Measure lift (~1 day, ~$10 budget).** A/B sweep: 5 curriculum tasks × 5 trials × 2 conditions (placeholder keyword + system prompt update vs. control). Measure: time-to-green, rewrite count per session, final program quality (any leftover `TBD`s in "shipped" code?).

**Decision rules for Lesson 1:**
- Time-to-green OR rewrite-count drops by > 20% AND no leftover-placeholder regression → ship.
- Mixed results → keep the keyword as a tool but don't push it in the system prompt.
- Negative or no signal → kill, remove the keyword from the grammar to avoid sprawl.

### Open decisions (Lesson 1)

1. ~~**Which keyword?**~~ **LOCKED 2026-04-26 by Russell:** `TBD`.
2. **Where can placeholders appear?** Recommendation: anywhere an expression or block can go — maximum flexibility, minimum special cases.
3. **What happens when running code reaches one?** Recommendation: throw a clear error like "this part hasn't been filled in yet" — same shape as Clear's other runtime errors.
4. **Does it count as a compile warning?** Recommendation: yes, low-severity. Catches placeholders that lingered into a "shipped" build.
5. **Does it appear in the training database?** Recommendation: yes. A program with 2 `TBD`s that passes 8/10 tests is meaningfully different from a program that passes 8/10 tests with no `TBD`s.

---

## Lesson 2 — Shape-search for canonical examples (Lean's premise selection)

### What it does

Today, when Meph hits a compile error, the system pulls 3 past winning examples that hit the same error in the same archetype. That's text-match retrieval. Lean does something stronger: given a partial proof, it searches the whole library for lemmas whose *shape* matches what's needed, even if no error has fired yet.

The Clear version: given Meph's current partial program (after any compile, error or not), search the canonical-examples library for the closest 3 winners by program shape — same archetype, similar table layout, similar URL structure. Inject them into the next call. Catches problems before the wall, not after.

### Why this matters

- **Pre-emptive teaching.** Today's hint pipeline only fires on errors. Half the bad code never errors — it compiles and runs but doesn't match the spec. Shape-search reaches Meph before that happens.
- **Pairs with the harvest plan.** The bigger the canonical-examples library grows (winner-harvest plan), the more leverage shape-search gets. Each example added to the library is automatically useful here.
- **Pairs with `TBD`.** Shape-search retrieves examples with placeholder-shaped holes; Meph fills the holes in his own program from the matching example.

### Phases (4 cycles, ~2 days agent time)

**Phase 2.1 — Define "program shape" (~half day).** Pick a small set of features that capture the shape of a Clear program: archetype, number of tables, table-name resemblance, number of URLs, URL-path resemblance, has-auth, has-AI-assistant, etc. Most of these features already exist in the Factor DB row format from the harvest plan. **Done when:** a function that takes a Clear program and returns a feature vector lands; unit tests cover 5 archetype variants.

**Phase 2.2 — Build the shape index (~half day).** Pre-compute the feature vector for every canonical example in the library. Store alongside the example. Cheap nearest-neighbor over feature vectors at retrieval time. **Done when:** given any Clear program, the system returns the top-3 closest examples in under 50ms.

**Phase 2.3 — Inject shape-matched examples into the system prompt (~half day).** When Meph compiles ANY program (error or not), inject the top-3 shape-matched examples into the next call's context. Cap at 3 to control prompt-token cost. Don't replace the existing error-hint pipeline — layer on top. **Done when:** a clean Meph session shows shape-matched examples in his retrieved context after his first compile.

**Phase 2.4 — Measure lift (~1 day, ~$10 budget).** A/B sweep: 5 curriculum tasks × 5 trials × 2 conditions (shape-search injection on vs. off). Measure: time-to-green, hint-relevance score (Meph self-reports whether the injected examples helped), prompt-token cost delta.

**Decision rules for Lesson 2:**
- Time-to-green drops by > 10% AND prompt-cost increase < 30% → ship.
- Mixed results → keep shape-search as a tool but only fire when error-hint pipeline returns nothing.
- Negative → kill.

### Open decisions (Lesson 2)

1. **How many examples to inject?** Recommendation: 3 (matches existing error-hint cap).
2. **When to fire?** Every compile, or only on first compile of a session? Recommendation: every compile, because Meph's program shape changes as he writes.
3. **Does it replace the error-hint pipeline?** Recommendation: layer on top. Both run; both return up to 3; deduplicate; inject combined top-5.
4. **What features count for shape?** See Phase 2.1 — start with the 5-7 cheapest, add more if Phase 4 shows weak signal.

---

## Lesson 3 — Show open capabilities to Meph (Lean's goal display)

### What it does

Lean shows a proof writer, at every step, exactly what's left to prove — a structured to-do list of unmet goals. Clear today: Meph has to read test output, infer which capabilities passed and which didn't, and decide where to focus. Slow and error-prone.

The upgrade: surface the capability list directly in Meph's tool result on every compile + run. "5 of 7 capabilities passing. Still open: (1) the queue endpoint returns the right shape on empty input, (2) the auth check redirects when the token is expired." Meph reads the structured list instead of parsing test output.

### Why this matters

- **Removes a layer of guessing.** Meph stops re-deriving "what's still missing" from raw test output every cycle.
- **Cheaper than placeholders.** Pure surface change, no new grammar, no compiler changes — just better test-result formatting.
- **Multiplies the value of step-decomposition.** Step-decomposition (Session 38) already attaches capability tags to test runs. This is the surface that makes those tags visible to Meph instead of just to the database.

### Phases (3 cycles, ~1.5 days agent time)

**Phase 3.1 — Add a "capability status" block to the test result (~half day).** When the test runner finishes, it returns the existing pass/fail counts AND a structured list: `[{capability: "queue.create works", status: "pass"}, {capability: "auth.expired redirects", status: "fail", hint: "test 4 returned 200 expected 302"}]`. Plain English in the capability field, plain English in the hint. **Done when:** running the test for one curriculum task returns the structured list with at least 3 capabilities tagged correctly.

**Phase 3.2 — Format the capability list in Meph's tool result (~half day).** When Meph calls the test tool, the response shows the capability block in a compact, readable format at the top — before raw test output. Open capabilities first, passing capabilities folded below. **Done when:** Meph sees a one-paragraph summary of open capabilities at the top of every test result.

**Phase 3.3 — Measure lift (~half day, ~$10 budget).** A/B sweep: 5 curriculum tasks × 5 trials × 2 conditions (capability block on vs. off). Measure: time-to-green, number of failed compiles between capability-revealing runs, "wasted work" (Meph editing code unrelated to any open capability).

**Decision rules for Lesson 3:**
- Time-to-green drops by > 10% OR wasted-work drops by > 20% → ship.
- No signal → ship anyway if cost is < 50 prompt tokens per call (the surface change is cheap and Meph-readability matters in its own right).
- Negative → revisit the format; don't kill yet.

### Open decisions (Lesson 3)

1. **How verbose are capability descriptions?** Recommendation: one short sentence each, matching how Clear errors are written.
2. **Show passing capabilities too, or only open ones?** Recommendation: open ones at top, passing folded below in a "5 passing" line that expands on request.
3. **Tie this to `TBD`?** Recommendation: yes — a `TBD` marker counts as an open capability of its own. Lessons 1 and 3 share infrastructure here.

---

## Cross-lesson notes

- **All three share infrastructure with the winner-harvest plan.** The canonical-examples library that the harvest plan builds is the input for Lesson 2; the capability tags from step-decomposition feed Lesson 3; the placeholder-tracking from Lesson 1 feeds Lesson 3's open-capability list.
- **Suggested order: 1 → 3 → 2.** Lesson 1 introduces the placeholder concept; Lesson 3 surfaces all open holes (placeholders + missing capabilities) cleanly; Lesson 2 retrieves examples that match the open shape.
- **Total measurement budget: ~$30** across three independent A/B sweeps. Each is independently kill-able.
- **Don't sequence them all in one session.** Each lesson is a clean A/B; running them simultaneously confounds the signal. One per session, results documented in `RESEARCH.md` between each.

## Definition of done (whole plan)

- All three lessons either shipped (with A/B data showing lift) or explicitly killed with the data documented
- The canonical-examples library, the test-result format, and the grammar each end the plan in a clearly better state than they started — or unchanged with the data showing why
- `RESEARCH.md` has a "Lean lessons measured" section summarizing what worked, what didn't, what the lift numbers were

## Out of scope (separate plans)

- **Auto-fill workflow for `TBD`** — the AI iterating specifically on placeholders. Separate plan if Lesson 1 shows lift.
- **Typed placeholders** — `TBD` annotated with "this should be a number." Lean does this; Clear could too. Separate plan; cheap to add later.
- **Best-of-N attempts at filling each placeholder.** RLVR-style sampling per hole. Separate plan, cheap to layer once `TBD` ships.
- **Mathlib-style canonical library at scale.** The winner-harvest plan handles the seed; growing it past 100 examples needs its own scaling plan.
- **Distillation** — research item SK-6, separate plan.

## Risks worth flagging

- **Language sprawl.** Lean's lesson #6: narrow grammar is a feature. ONE placeholder keyword, ONE shape-search hook, ONE capability format — not families. Each pays rent only if its A/B shows lift; otherwise rip it out.
- **Meph leans on `TBD` to dodge hard parts.** A program full of `TBD`s that "passes" because everything was skipped is a fake win. Phase 1.5's "leftover-placeholder regression" check guards against this.
- **Prompt-token bloat.** Three new things going into Meph's context window. Each lesson's A/B includes a cost-delta gate; if any one breaks the cost budget without paying for it in lift, kill it.
- **Confounded measurement.** Running Lesson 1's A/B while Lesson 2 is half-built will make both look like noise. Sequence them — finish one, document, start the next.
- **Verifier gaming.** A canonical-examples library full of placeholder-heavy skeletons could make the average example quality look bad. Mitigation: the harvest scorer already penalizes wins that skip many tests; tune the skip-penalty weight before Lesson 1 ships.
