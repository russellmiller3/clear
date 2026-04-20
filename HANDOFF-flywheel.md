# Handoff — Flywheel Track

**Track:** Factor DB + EBM reranker + compiler-owned training data. The long-game moat nobody else architecturally can copy.
**Last updated:** 2026-04-20 (Session 39 — pick-up verification).
**Status:** live end-to-end on main. **Both Session 38 TODO items verified at start of Session 39** — see "Session 39 Verification" below. Next unlock: pairwise reranker features.

> Note: `HANDOFF.md` at root is a parallel track (Live App Editing). This file is the flywheel handoff. Both on main, non-conflicting.

---

## Current State

- **Branch:** `main` (all Session 38 work merged and pushed; latest commit `9f2e356`)
- **Factor DB:** **492 rows / 193 passing** (up from 149/57 at Session 37 end). Recovered from a worktree deletion mid-session via the training-archive JSONLs in `/tmp/`.
- **Trained reranker:** `playground/supervisor/reranker.{pkl,json}` — v6 (Stage-2 EBM on 13 Lasso-selected features). Loaded at server boot: `EBM reranker loaded: 24 features, intercept=0.368`.
- **Compiler tests:** 2090 / 0.
- **Prompt caching:** LIVE on `/api/chat`. **Measured 90% input-token cost reduction** on Haiku 4.5 (3-turn verification script, `playground/supervisor/verify-caching.js`).
- **API limit:** unblocked (Russell upgraded tier mid-session 2026-04-19).

---

## Session 38 — What Shipped

Summary table (full list in commits `7216781..9f2e356` on main):

| Category | Change | Impact |
|---|---|---|
| **Cost** | Haiku 4.5 default via `MEPH_MODEL` env var | 3× cheaper per row |
| **Cost** | Prompt caching wired on `/api/chat` — system array + 2 breakpoints | **~90% input-token reduction** (measured) |
| **Data quality** | Step-decomposition labels on all 30 curriculum tasks | 4× signal density per sweep |
| **Data quality** | Classifier `kpi` archetype + ordering fix (dashboard before queue_workflow) | Archetypes balance across 16 buckets |
| **Data quality** | Sweep grader reads Factor DB `test_pass`, no longer phrase-matches "TASK COMPLETE" | Grader went from 1/5 to 15/30 on same data |
| **Parser** | Inline record literals `{ a is 1, b: 2 }` — was documented but not implemented | **Unblocked every webhook task** (was silently abandoning) |
| **CLI** | `clear build` refuses to overwrite existing `package.json` it didn't write | Repo root no longer clobbered by Meph |
| **Server** | Iteration limit 15 → 25 | Unblocked L3-L6 "CRUD-with-auth dead zone" |
| **DB** | Migration order fix (idx_step created after ALTER, not inside SCHEMA) | Existing 100-row DBs no longer crash on upgrade |
| **Hints** | Hints now include `hints.text` prose block (not just JSON) | Meph can actually read them as text |
| **Reranker** | EBM trainer written (InterpretML) + JS-side scorer (`ebm-scorer.js`) | First trained reranker on Clear data |
| **Reranker** | 2-stage Lasso → EBM pipeline; Lasso auto-selects features | Val R² 0.302 (vanilla EBM) → 0.335 (Stage-2) → 0.390 (Lasso alone) |
| **Reranker** | EBM loaded + scoring at `/api/chat` retrieval path | Flywheel loop end-to-end closed |
| **Recovery** | Clean-worktrees hook hardened (WAL checkpoint + backup) | Session 38 incident won't recur |
| **Docs** | RESEARCH.md dedicated EBM chapter + TOC + Lasso integration | Readable in one place |
| **Ship skill** | Data-at-risk gate + Real-LLM eval gate | Can't ship AI changes without verification or data commits |

Archives created:
- `playground/supervisor/training-archive/training-session38-182passing.jsonl` (full v5 features)
- `playground/supervisor/training-archive/training-session38-v2-baseline.jsonl`

Model bundles:
- `playground/supervisor/reranker.json` (JSON shape table, JS-side inference)
- `playground/supervisor/reranker.pkl` (Python pickle, inspection/retraining)

---

## ✅ Session 39 Verification (2026-04-20)

Both Session 38 TODO items verified end-to-end. Commits `0e365d4` + `48b686b` on `feature/verify-flywheel-handoff`.

### 1. Prompt caching on a real Meph session — PROVEN

- Ran `node playground/eval-meph.js` against a live server (16 scenarios, real tool calls, test results, SSE streaming).
- **40 turns across the run. 95.4% cache hit rate.** Per-turn: 97–99% steady state. Tool outputs, streaming deltas, and test snapshots did NOT break the prefix. No silent invalidators.
- Telemetry in log: `[cache] iter N: read=17734 write=158 fresh=5 (99% hit)` throughout.
- `verify-caching.js` also confirmed 90% savings on a warm-cache 3-turn run (100% hit). Together: caching holds on both synthetic and real-session workloads.
- **Sub-bug fixed in the process:** `verify-caching.js` used `require('fs')` inside an ESM file — silently threw inside a try/catch, so the log was empty and telemetry aggregated zero. Fixed in `0e365d4`.

### 2. Hint-flow reaches Meph — WIRING PROVEN, behavior probably-silent-good

- Added observability in `server.js`: one-line `[hints] archetype=X retrieved=N reranked_by=<ebm|bm25> top_tier=T` per failed compile. Zero-cost on happy path.
- Wrote `playground/supervisor/verify-hint-flow.js` — spawns server, feeds Meph a deliberately broken `api_service` snippet, inspects the SSE reply.
- **Result:** `[hints] archetype=api_service retrieved=3 reranked_by=ebm top_tier=same_archetype_gold`. Three candidates retrieved, EBM re-ranked, tier-3 archetype-gold match (no exact error in DB yet for this specific signature).
- Meph's fix used `sending data:` + `save data to <table>` — exactly the idioms in the retrieved `api_service` references. He pattern-matched silently; did NOT verbalize tier labels or "past fix" phrasing.
- **Interpretation:** wiring works. Meph's response shape is consistent with absorbing hints. If we want louder behavioral signal for grading/debugging, strengthen the system-prompt nudge around the hints block (line 51 of `playground/system-prompt.md`) — e.g. require Meph to cite the tier label when he applies a retrieved pattern. Not urgent; Meph is already producing correct fixes.

Re-run either verification any time:
```bash
ANTHROPIC_API_KEY=... node playground/supervisor/verify-caching.js        # ~30s, ~$0.05
ANTHROPIC_API_KEY=... node playground/supervisor/verify-hint-flow.js      # ~30-60s, ~$0.05
ANTHROPIC_API_KEY=... node playground/eval-meph.js                         # ~90-180s, ~$0.10-0.30
```

---

## NEXT PICK-UP POINT — Pairwise Features for the Reranker

This is the real unlock. Current architecture has a ceiling the Session 38 work can't cross.

### The problem with today's reranker

The current EBM/Lasso predicts **"was this past row good?"** That's a regression problem mostly already solved by `ORDER BY test_score DESC` on BM25-retrieved candidates. The model adds marginal value because it's scoring ROWS, not RANKINGS.

### The real reranker question

Given Meph's CURRENT error `E_now` and a CANDIDATE past-fix `F_past`, is `F_past` likely to resolve `E_now`? That's a **pairwise ranking** problem, not per-row regression.

### What to build

**Features** (computed at retrieval time by comparing current session context to each candidate):
- `archetype_match` — current archetype == candidate archetype (bool)
- `error_sig_match` — exact error signature match (bool)
- `error_category_match` — softer match: same error category family
- `step_delta` — current step_index − candidate step_index
- `similarity_source` — BM25 or cosine similarity on source_before
- `test_score` — candidate's test_score (keep existing signal)
- `age_penalty` — recency weighting (newer fixes slightly preferred)

**Training setup:**
- Positive pairs: `(error_row, fix_row)` where the fix successfully resolved that error type (next row in same session had compile_ok=1 after applying similar patch)
- Negative pairs: `(error_row, random_other_fix_row)`
- Loss: pairwise ranking (LambdaRank-style, or logistic on `score(pos) - score(neg)`)
- Still EBM — but fitting a preference rather than a regression

**Estimated effort:** 4-6 hours of focused work. Mostly feature-engineering in `export-training-data.js` and a new trainer script `train_reranker_pairwise.py`.

**Data requirement:** works on existing 193 passing rows, but meaningful signal kicks in around 500-1000 passing rows. Current data scale is the floor, not the ceiling.

---

## Queued Work (priority-ordered)

1. **HANDOFF TODO items above** (hint-flow + caching on real session) — ~30 min, gate before building more.
2. **Pairwise reranker** — see above. The real unlock. 4-6 hours.
3. **Run more sweeps to ~1000 passing rows** — overnight, ~$20 at Haiku prices (way cheaper now with caching). Enables Stage-2 EBM to overtake Lasso. Command:
   ```bash
   ANTHROPIC_API_KEY=... node playground/supervisor/curriculum-sweep.js --workers=3 --timeout=240
   ```
   Loop until passing count ≥ 1000.
4. **Compiler Flywheel Tier 1** — runtime instrumentation. Plan filed at `plans/plan-compiler-flywheel-tier1-04-19-2026.md`. Not now; post-pairwise.
5. **Cross-domain transfer experiment** (Augment Labs Priority 4) — Saturday research bet. Detailed in `augment-labs-roadmap.md` Priority 4 and `RESEARCH.md` → "Cross-Domain Transfer (The Research Paper)."
6. **Marcus GTM** — 5 LinkedIn DMs + deal-desk landing page. Out-of-band, not this track.

---

## Key Decisions Locked This Session

- **EBM over XGBoost** — glass-box matches Clear's "no magic" philosophy. At <1000 rows, Lasso alone outperforms EBM; 2-stage pipeline captures both regimes. See RESEARCH.md § "Phase-1 scale."
- **Haiku 4.5 default** — 3× cheaper, 94% of Sonnet's capability on eval-meph. Override with `MEPH_MODEL=claude-sonnet-4-6` for complex tasks.
- **Prompt caching is MANDATORY** — promoted to a HARD RULE in `~/.claude/CLAUDE.md`. Measured 90% savings. $168/day → $25/day at real scale.
- **Cleanup hooks need WAL checkpoint + backup** — promoted to HARD RULE after this session's 343-row near-miss.
- **Hint formatting uses prose, not JSON dump** — Meph's attention is text-first; JSON buried in tool result is effectively invisible.

---

## Files to Read First (Next Session on This Track)

| File | Why |
|---|---|
| This file | Orientation |
| `RESEARCH.md` → "Read This First" + "The EBM Re-Ranker" | Current model architecture, Phase-1 findings |
| `playground/server.js` line ~2860 | Current hint retrieval + EBM scoring wiring |
| `playground/supervisor/ebm-scorer.js` | JS inference from JSON shape-table |
| `playground/supervisor/train_reranker.py` | Training pipeline with Lasso sanity check |
| `playground/supervisor/export-training-data.js` | 24-feature exporter — pairwise features go here |
| `playground/supervisor/verify-caching.js` | Reusable caching verification script |

---

## Resume Prompt

> Read `HANDOFF-flywheel.md`. Session 38 shipped the EBM reranker wired into `/api/chat` + prompt caching (90% savings) + 2-stage Lasso→EBM pipeline. Session 39 verified both TODOs end-to-end: cache hits 95.4% on a real 16-scenario Meph run (no silent invalidators), hint-flow retrieves + re-ranks + injects into Meph's tool result — Meph pattern-matches the retrieved idioms silently (no tier-label verbalization). Branch `feature/verify-flywheel-handoff` holds the fix + observability; merge when ready. Next unlock: **pairwise reranker features** — the real ceiling-breaker; details in this file's "NEXT PICK-UP POINT" section. Follow J Paul Getty Rule and Ross Perot Rule; narrate every chunk.
