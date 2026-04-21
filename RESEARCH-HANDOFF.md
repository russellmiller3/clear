# Research Handoff — Flywheel / Ranker / Factor DB

**Last updated: 2026-04-21 (Session 41 close)**
**Status: infrastructure built, NOT proven to help Meph. Do NOT run more sweeps until Anthropic console spending cap is set.**

This document is the resume prompt for whoever picks up the Clear flywheel research — Russell in a future session, or a future Claude. Read it top-to-bottom before writing code.

---

## 1. What the research is trying to prove

**Hypothesis:** A small model (Haiku 4.5) + good retrieval + a learned reranker over past-fixes produces better code than the small model alone. Same premise as RAG + DSPy + Cursor's "@codebase" feature.

**What we measure:** Does Meph complete curriculum tasks in fewer iterations with the trained-ranker hint system vs without? Secondary: does tag-labeled honest feedback produce a better ranker than test_pass proxy?

**What "done good" looks like:** On a fixed task (e.g. `todo-crud`), Meph solves it in meaningfully fewer iterations (30%+) with the trained system than without. Measured via A/B head-to-head, not full sweeps.

---

## 2. What state the research is in

**Built and working:**
- Factor DB: 1451 rows, 521 passing, 30 honest helpful=yes + 19 honest applied=0 + 11 inferred (`playground/factor-db.sqlite`)
- 38-task curriculum covering 15/16 classifier archetypes
- Pairwise ranker trained on 452 pairs with honest labels weighted in (`playground/supervisor/reranker-pairwise.json`)
- Tag-reliability stack driving ~100% effective label rate (prompt reflex + inline reminder in hint payload + server-side inference fallback)
- Cost estimator + budget-first rule (prevents repeating Session 41's $50-in-one-night)

**NOT proven:**
- Whether the retrained ranker measurably helps Meph complete tasks faster
- Whether honest labels produce a better ranker than test_pass proxy
- Whether archetype coverage improvements translate to better hint retrieval for new archetypes

---

## 3. Read this BEFORE you run anything

**Session 41 lesson: running full sweeps to measure lift is the wrong methodology.** One sweep is ~$5-7 and the noise floor is ~15% per-sweep. The ranker lifts we expect are 10-30%. To separate lift from noise needs 20-50 sweeps per hypothesis = $100-750. Untenable.

**The methodology Session 41 used (DON'T repeat):**
- Stack multiple interventions, measure them in sequential sweeps
- Estimate cost from script header comments (they're outdated)
- Run sweeps to "see what happens"
- Measure subtle changes with full-curriculum sweeps

**The methodology to use going forward:**

| Pattern | Cost | When to use |
|---------|------|-------------|
| Deterministic replay | $0 | Prompt changes, ranker changes. Replay past transcripts against new intervention. NOT built yet — first priority. |
| A/B head-to-head on 1 task | ~$2 | "Does intervention X reduce iterations on this specific task?" 5 A/B pairs = $10, answers more than a sweep. |
| 5-task diagnostic sweep | ~$1 | Fast hypothesis check across primary archetypes. Fire several back-to-back. |
| Full 30-task sweep | ~$5-7 | Final validation AFTER patterns 1-3 already showed lift. Not day-to-day measurement. |
| Multi-sweep statistical | $100+ | Only for publishable claims, never for iteration. |

---

## 4. What to do next (priority order)

### P0: Set Anthropic console spending cap (30 seconds, Russell)

**Before touching code.** Go to console.anthropic.com/settings/limits and set a daily hard cap ($10-20 is reasonable). This is structural; it doesn't depend on anyone's discipline.

### P1: Build deterministic-replay harness (~1 day, $0 API)

The single missing piece that makes the rest of this cheap. Read stored Meph transcripts from the Factor DB (`source_before` + `patch_ops` + subsequent compile results). Feed them through the ranker WITHOUT calling the API. Compare: which past-fixes would the old ranker have bubbled up vs the new one? Tag rate on replay vs original? Etc.

Once this exists, the entire "does new ranker beat old ranker" question is answerable offline for $0 instead of $5/sweep.

**Concrete starting point:** 
```
// playground/supervisor/replay.mjs
// Read rows where hint_applied IS NOT NULL
// For each, re-run the ranker on (archetype, error_sig, source_before)
// against the candidate pool. Compare top-ranked hint under old vs new model.
// Count: did the new model surface a helpful=yes past-fix higher than the old?
```

Russell's existing `reranker-pairwise.json` is loadable from JS already (the server does it live). Copy that loader into replay.mjs.

### P2: First real A/B test (~$10, specific hypothesis)

Only AFTER P1 is in place. Pick ONE task (suggest: `todo-crud` — well-understood, reliable). Run it twice:
- **Run A:** new ranker deployed
- **Run B:** old ranker (swap in the previous `reranker-pairwise.json` from git history — commit 8eb792a or earlier)

Compare: iterations-to-green, compile errors per task, hint-serves per task. Do 5 repetitions each side. $10 total. Produces a single falsifiable answer: "new ranker reduces iterations by X% on todo-crud, p < Y."

If lift is < 20%: ranker doesn't matter much yet. Need more data OR better features OR different algorithm. Don't throw money at more sweeps.

If lift is > 20%: expand the A/B to 3-5 tasks. Still ~$30. If the lift holds, publish it in RESEARCH.md as the first-ever flywheel validation.

### P3: If P2 lift holds — honest-label retrain on 50+ yes labels

Gate: accumulate 50 honest helpful=yes labels (currently at 30). Don't run sweeps just to get there. Instead: use Clear Studio day-to-day and let organic usage fill in rows. Expect this to take 2-4 weeks of normal development use, not a paid sweep.

Then: re-run the honest-label-weighted retrain on that larger honest corpus. Gate it with another A/B against the current ranker.

### P4: Publish or kill

At P3's A/B result, the research has either shown meaningful lift (publish, build out) or not (kill the ranker layer, keep the Factor DB for other research, save the money).

---

## 5. What NOT to do (the anti-pattern list)

1. **Don't run another full sweep** until P1 and P2 have produced signal. Full sweeps are validation tools, not discovery tools.
2. **Don't stack interventions.** One hypothesis, one test, one result. If you have 3 ideas, test them sequentially with A/B's, not in one sweep.
3. **Don't trust my cost estimates from Session 41.** I was off by 3×. The recalibrated numbers are in `playground/supervisor/estimate-cost.mjs` — use those, and recalibrate when sweep invariants change.
4. **Don't treat "cache hits look good" as proof of low cost.** Cache hits are cheap at input; output tokens are always fresh; total volume still bills.
5. **Don't run sweeps to "see what happens."** State the hypothesis FIRST in writing. Then test it with the cheapest pattern that can answer it.

---

## 6. What's permanent from Session 41

Regardless of whether the research pans out, these survive:

- **Cost estimator** at `playground/supervisor/estimate-cost.mjs`
- **Budget-first rule** in project `CLAUDE.md` (Clear repo)
- **Keep-costs-posted rule** in `~/.claude/CLAUDE.md` (user-level, all projects)
- **Session 41 methodology lessons** in `RESEARCH.md`
- **Compiler `user` receiving-var shadow fix** in `compiler.js` (real silent bug, fixed)
- **Keyword-collision + auth-first validator warnings** in `validator.js`
- **`caller` as canonical magic var** (synonym in `synonyms.js`)
- **38-task curriculum covering 15/16 archetypes**
- **Tag-reliability stack** in `playground/server.js` and `playground/system-prompt.md`
- **Factor DB with 60 usable labels** (30 honest-yes + 19 honest-no + 11 inferred)

Even if the ranker never helps Meph, the DATA and INFRASTRUCTURE are reusable for whatever comes next.

---

## 7. The specific file paths you need

| Purpose | File |
|---------|------|
| Ranker bundle (deployed) | `playground/supervisor/reranker-pairwise.json` |
| Ranker trainer (Python) | `playground/supervisor/train_reranker_pairwise.py` |
| Pair data exporter | `playground/supervisor/export-training-data.js` |
| Curriculum tasks | `curriculum/tasks/*.json` (38 tasks) |
| Sweep runner | `playground/supervisor/curriculum-sweep.js` |
| Factor DB | `playground/factor-db.sqlite` |
| Archetype classifier | `playground/supervisor/archetype.js` (16 archetypes) |
| Hint retrieval + tag parsing | `playground/server.js` (`/api/chat` endpoint) |
| Meph system prompt | `playground/system-prompt.md` |
| Cost estimator | `playground/supervisor/estimate-cost.mjs` |

---

## 8. Resume prompt for next session

"Pick up the Clear flywheel research. The handoff is in `RESEARCH-HANDOFF.md`. Before doing anything that spends API money, confirm the Anthropic console spending cap is set AND run `node playground/supervisor/estimate-cost.mjs` with the planned params. The next concrete task is P1: build `playground/supervisor/replay.mjs` to enable deterministic replay of past transcripts through new rankers. Do NOT run full sweeps until after P2 shows A/B lift."
