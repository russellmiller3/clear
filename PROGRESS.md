# Supervisor Multi-Session — Progress

Branch: `feature/supervisor-multi-session`
Plan: `plans/plan-supervisor-multi-session-04-17-2026.md` (historical)

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Session Registry (SQLite, WAL) | ✅ Complete |
| 2 | Worker Spawner (child processes) | ✅ Complete |
| 3 | Supervisor Loop (poll + state machine + SSE) | ✅ Complete |
| 4 | Task Distribution (assignTask wire) | ✅ Verified via curriculum-sweep |
| 5 | Factor DB (schema + archetype + cold start + live logging) | ✅ Complete |
| 6 | Merge Step | ⬜ Deferred until needed |
| 7 | Observability (Studio panel) | ⬜ Pending |

## What's Live (Session 37)

**Every Meph session in Studio now trains the Factor DB:**
- `compile` tool → row inserted with `{archetype, error_sig, compile_ok, source_before, patch_summary}`
- `run_tests` tool → latest row updated with `{test_pass, test_score}`
- `http_request` tool returning 2xx → latest row marked `test_pass=1` (weaker signal than run_tests but real)

**Archetype classifier (15 categories):**
Deterministic rules over parser output. All 13 templates classify correctly.
Marcus 5: `queue_workflow` × 3 + `routing_engine` + `agent_workflow`. Rest distribute
across `crud_app`, `content_app`, `realtime_app`, `booking_app`, `agent_workflow`.

**Curriculum library: 25 tasks L1-L10.**
Includes the 5 Marcus-shape tasks (approval-queue, lead-router, onboarding-tracker,
internal-request-queue, support-triage) so sweeps produce realistic training data.

**HITL fixes applied retrospectively (Session 37 — per CLAUDE.md rule):**

| Root cause | Fix location |
|-----------|--------------|
| Meph didn't know `requires login` on mutations was mandatory | System prompt + AI-INSTRUCTIONS: new Auth Rule section with examples; compiler error now shows corrected body |
| Meph reached for `find` as retrieval verb | validator.js: INTENT_HINTS map → "use `look up X with this id` or `get all X`" |
| Bare `id` confused with `if` typo | AI-INSTRUCTIONS + system prompt: use `this id` for URL params |
| `this id` only worked in specific forms (delete/update with) | parser.js: `this X` now parses as `incoming?.X` in any expression position |
| Keyword-collision variable names (`id`, `name`, `create`, `login`) | Docs table of safe alternatives + intent hints for login/this/password |
| Verbose `users = get all Users; send back users` | Parser: new `send back all X` shorthand, desugared to [CRUD, RESPOND]. All 6 templates updated. |
| `can user submit` not in test verb whitelist | Parser: TEST_VERB_ALIAS map (submit/add/post/send/make → create, etc.) |
| Classifier missed `queue_workflow` on Marcus apps | archetype.js: fixed to use real node types (REQUIRES_AUTH, AUTH_SCAFFOLD) |
| Meph reached for AI verbs (generate/summarize/classify/extract/analyze/translate/rewrite/predict) | validator.js INTENT_HINTS: each now points at `ask claude 'prompt' with X` canonical form |
| Factor DB rows had empty source_before when Meph compiled without prior edit_code | server.js: hook falls back to currentSource when _sourceBeforeEdit is empty |
| Sweeps burned 10 min before discovering API was rate-limited | curriculum-sweep.js + eval-replicated.js: pre-flight API check, fail in 2s with clear message |
| Russell couldn't see API status without running a sweep | server.js + ide.html: /api/flywheel-stats reports apiHealth; Flywheel tab shows red/green banner |

## Test Summary

| Suite | Count | Status |
|-------|-------|--------|
| Compiler (clear.test.js) | 1954 | ✅ all passing |
| Supervisor modules | 40+ | ✅ all passing |
| Server (playground/server.test.js) | 173 pass / 16 pre-existing fail | No new failures |
| All 13 templates compile | 13/13 | ✅ clean |

## Factor DB State

- 71 total rows, 26 passing
- Archetype distribution: queue_workflow × 4 (Marcus 3 + crm-pro), routing_engine × 1, agent_workflow × 3, crud_app × 2, content_app × 1, realtime_app × 1, booking_app × 1, general × 25 (skeletons)
- Threshold: 200 passing rows for XGBoost training
- Trajectory: ~6 passing rows per sweep → ~30 more sweeps needed → hours of wall clock, ~$15

## What's Next

1. **Suggestion injection into Meph** — the final loop closure. On compile error, query Factor DB, inject top-3 past fixes. Without this, the DB just accumulates; with it, Meph gets smarter every session.
2. **Studio Supervisor panel** — SSE status already works; wire a UI tab.
3. **Keep cranking sweeps** — each Marcus-focused sweep generates ~20 rows in queue_workflow / routing_engine / agent_workflow archetypes (the ones that matter for target users).

---

# Decidable Core — Progress (Session 2026-04-24)

**Plan:** `plans/plan-decidable-core-04-24-2026.md`
**Branch:** `feature/decidable-core`
**Path A** = minimalist (3 validator rules + 3 runtime bounds). Path B = full effect fences, gated on Phase 7 measurement.

## Phase 0 — Baseline + branch setup
- [x] Create branch `feature/decidable-core`
- [x] `PROGRESS.md` section created
- [ ] Template inventory grep
- [ ] Curriculum inventory grep
- [ ] Stamp recon audit into `learnings.md`
- [ ] Baseline Meph eval run (BUDGET-GATED — pending approval)
- [ ] Baseline metrics → `plans/plan-decidable-core-baseline.md`
- [ ] Commit: `chore(decidable-core): phase 0 — baseline metrics + recon archived`

## Phase 1 — Syntax + semantics lock
- [ ] Phone-test 5 example programs
- [ ] `synonyms.js` grep for `max depth`, `max times`, `with timeout`, `max iterations`
- [ ] Design doc → `plans/plan-decidable-core-syntax.md`

## Phase 2 — Validator: warn-only mode
- [ ] Parser: extend `whileNode` to accept `, max N times` suffix
- [ ] Validator W-T1..W-T4 (warn severity)
- [ ] Tests under new `describe('validator — termination')`
- [ ] 8 template smoke-test

## Phase 3 — Runtime bounds + compiler enforcement
- [ ] compiler.js: WHILE counter, FUNCTION_DEF depth, SEND_EMAIL / ASK_AI timeout wrappers
- [ ] runtime/db.js: query timeout
- [ ] `playground/clear-compiler.min.js` rebuild
- [ ] Pathological-app runtime tests

## Phase 4 — Template migration (Path A)
- [ ] Grep templates for constructs needing explicit bounds
- [ ] 8 template smoke-test: 0 errors, 0 warnings

## Phase 5 — Validator: error mode
- [ ] Flip W-T1..W-T4 severities warn → error
- [ ] Meph eval + friction ranker checks

## Phase 6 — Docs propagation (13 surfaces + PHILOSOPHY.md)
- [ ] intent.md / SYNTAX.md / AI-INSTRUCTIONS.md / USER-GUIDE.md
- [ ] playground/system-prompt.md + ghost-meph MCP sync
- [ ] ROADMAP.md / FEATURES.md / CHANGELOG.md / RESEARCH.md
- [ ] landing/*.html
- [ ] FAQ.md
- [ ] **PHILOSOPHY.md — new rule "Total by default, effects by label"**
- [ ] HANDOFF.md + learnings.md wrap-up

## Phase 7 — Measurement (budget-capped $10)
- [ ] Cost estimate posted in chat
- [ ] Replay past failing transcripts (free)
- [ ] A/B on 5 curriculum tasks (~$2-5)
- [ ] Friction ranker post-intervention
- [ ] Results → `plans/plan-decidable-core-results.md`
- [ ] Go/no-go for Path B

## Phase B-1 — `live:` keyword foundation (2026-04-25, overnight worker)
- [x] `LIVE_BLOCK` node type registered in `parser.js`
- [x] `live` synonym entry in `synonyms.js`; `SYNONYM_VERSION` bumped to 0.33.0
- [x] `parseLiveBlock` mirrors `parseTryHandle` shape; empty block = parse error with fix-it hint
- [x] Dispatch wired in `CANONICAL_DISPATCH` so `live:` parses at any block position
- [x] Compiler emits body inline with `// live: block — explicit effect fence` comment marker (JS + Python)
- [x] Validator treats `LIVE_BLOCK` as a fence (not a scope) — variables defined inside are visible outside
- [x] 11 tests in `clear.test.js` under `describe('decidable core — live: block (Path B Phase 1)')`. All green.
- [x] Test count: 2586 → 2597 (+11, no regressions)
- [x] All 8 core templates compile clean (0 errors) — same warning count as baseline
- [x] Doc cascade: intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, FEATURES.md, CHANGELOG.md, playground/system-prompt.md
- [x] `playground/clear-compiler.min.js` rebuilt (44ms, 676KB)
- [ ] **Phase B-2 (next chunk):** validator rule that REJECTS effect-shaped calls (`ask claude`, `call API`, `subscribe to`, `every N seconds`) outside `live:` blocks. Today permissive; this is the chunk that delivers the totality guarantee.

**Branch:** `worktree-agent-adda3f14a9c26700c` (overnight worker, off `feature/overnight-04-25-2026`).
