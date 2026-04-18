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
| Keyword-collision variable names (`id`, `name`, `create`, `login`) | Docs table of safe alternatives (`todo_id`, `user_name`) |
| Verbose `users = get all Users; send back users` | Parser: new `send back all X` shorthand, desugared to [CRUD, RESPOND]. All 6 templates updated. |
| `can user submit` not in test verb whitelist | Parser: TEST_VERB_ALIAS map (submit/add/post/send/make → create, etc.) |
| Classifier missed `queue_workflow` on Marcus apps | archetype.js: fixed to use real node types (REQUIRES_AUTH, AUTH_SCAFFOLD) |

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
