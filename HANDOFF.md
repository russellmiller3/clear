# Handoff — 2026-04-14 (Session 30: Multi-agent orchestration — docs, bug fix, evals button)

## Current State
- **Branch:** main, commit `a65f0a6` is **local only — push blocked** (see Push Blocker below)
- **Previous session:** Session 29 made streaming the default, added rich text editor, multi-page routing, honest test labels (commit `552ae29`).
- **This session:** audited multi-agent infrastructure (exists substantially), fixed one real bug exposed by streaming-default, added one new demo app, wired agent evals to a dedicated button, updated all 6 core docs + Meph's system prompt.
- **Tests:** 1861 compiler tests pass (up from 1852 — added 9 new tests for multi-agent orchestration).

## Push Blocker (Action Needed)
The pre-push e2e test (`playground/e2e.test.js`) reports 6 blog-fullstack failures — `GET /api/posts returns array`, `seeded 0 posts`, etc. These are **pre-existing on main**, verified by stashing this session's changes and re-running: failures persist. Most likely an environmental issue with the e2e runner (bcryptjs dep resolution in the sandbox it spins up) rather than a compiled-output bug — `node cli/clear.js test apps/blog-fullstack/main.clear` alone passes 21/21.

Options for Russell:
1. `git push --no-verify origin main` — land this commit, fix the e2e test later.
2. Investigate the `/api/fetch` proxy helper in `playground/e2e.test.js` line 64 and fix the seed race / dep resolution.
3. Leave local, push next session.

I did not bypass the hook without explicit permission (CLAUDE.md rule).

## What Was Done This Session

### 1. Bug fix — agent-to-agent calls broken under streaming-default
Session 29 made text agents stream by default. Side effect: when a non-streaming agent (coordinator, scheduled, tool-using) `call`ed a streaming specialist, it received the async generator object, not the resolved string. Silent bug — no error, just `[object AsyncGenerator]` stored everywhere the coordinator tried to use the answer.

Fix: `compileToJSBackend` now post-processes non-generator agent function bodies and wraps every `await agent_streaming(args)` call with an inline generator-drain IIFE. The coordinator sees the concatenated text as a plain string. Generator agents (`async function*`) are left alone — they chain streams via `yield*` naturally.

### 2. Audit — multi-agent already exists
Parser/compiler support for all these is already there; only docs and one bug blocked users from using them:
- `AGENT` definitions, `RUN_AGENT` calls (coordinator pattern works inside endpoints AND inside other agents)
- `PARALLEL_AGENTS` (`do these at the same time:`)
- `PIPELINE` + `RUN_PIPELINE` (two syntax forms: bare agent name, or `step with 'Agent'`)
- `SKILL` (`uses skills:` directive)
- `FOR_EACH` + `RUN_AGENT` + list accumulator (dynamic fan-out)
- Scheduled agents, all directives (`can use`, `knows about`, `remember`, `track`, `must not`, `block arguments matching`)

### 3. Demo app — `apps/multi-agent-research/main.clear`
New reference app. Showcases all 4 orchestration patterns in one file:
- Sequential chain (`Research Topic` coordinator delegates to `Research All` → `ask claude` synthesizer)
- Parallel fan-out (`Grade Answer` runs `Fact Checker` + `Sentiment Rater` at once)
- Dynamic fan-out (`Research All` loops over a runtime list, calls `Researcher` per item, accumulates into a list)
- Skill bundle (`Report Style` instructions merged into the coordinator)

Compiles 0/0. Auto-tests pass 6/6.

### 4. Studio IDE — "Run Evals" button
Agent evals are separate from unit tests because they can be slower (graded evals hit real AI). Now surfaced with their own button.

- `/api/run-evals` endpoint: compiles source, extracts `result.evals.schema` (auto-generated Clear test blocks with mocked AI), appends to source, runs via `clear test`. Deterministic.
- Button "★ Run Evals" next to "▶ Run Tests" in the Tests tab toolbar.
- `renderEvalSection()` renders pass/fail lines; "no agents found" state shown when source has no agent definitions.
- Graded evals (real AI scorecard) still CLI-only (`clear eval --graded`) — not in Studio yet, API key + running server required.

### 5. New tests (9 total)
- `Multi-agent: dynamic fan-out via for-each + call` — 5 tests verifying the loop pattern compiles, specialist is a generator, coordinator isn't, for..of iterates, generator-drain IIFE wraps streaming calls, endpoint await is plain.
- `Multi-agent: coordinator delegates to specialists` — 3 tests verifying both specialists are generators, coordinator drains both, call order preserved.
- Updated `Pipeline agent calls Screener then Scorer` to reflect new drain-wrap behavior for streaming callees.

### 6. Docs synced across 6 files
| File | Change |
|------|--------|
| `SYNTAX.md` | Added "Multi-Agent Orchestration" section — 4 patterns with worked examples. Fixed pipeline body syntax doc (both bare-name and `step with` forms). |
| `AI-INSTRUCTIONS.md` | Added orchestration decision table (when to use chain vs parallel vs loop vs pipeline) + "Agent Evals Are Separate From Tests" guidance |
| `USER-GUIDE.md` | Chapter 10 gained "Multi-Agent: Coordinator and Specialists" subsection |
| `intent.md` | Updated PIPELINE row with step syntax + new paragraph on 4 orchestration patterns + streaming-drain behavior |
| `ROADMAP.md` | New rows: dynamic fan-out, Run Evals button, coordinator stream-drain |
| `playground/system-prompt.md` | Meph now knows the 4 patterns + evals button location |

## What's In Progress
Nothing. Working tree clean modulo auto-regenerated `apps/todo-fullstack/clear-runtime/db.js`.

## Key Decisions Made
- **Coordinator drains, doesn't yield.** When a non-streaming caller hits a streaming agent via `call`, wrap with IIFE collector. Generators chain naturally via `yield*`; ordinary functions can't await a generator to get its value. This bug was silent for an entire session before today.
- **Evals behind a second button, not auto-run.** Tests verify code correctness; evals verify agent behavior. Different cadence, different speed, different failure meaning. Conflating them makes both worse.
- **Pipeline body supports both bare-name and `step with 'Agent'`.** Tokenizer accepts both; docs now say so. Named form is clearer for pipelines with > 3 steps.
- **Demo app goes under `apps/multi-agent-research/`.** Core 7 templates are locked for regression coverage; this is a new reference app, not a core template promotion.

## Known Issues / Bugs
- `reply` synonym collides with `respond` keyword — inherited from Session 29, not fixed.
- Console warning `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` on Windows when spawning compiled apps. Non-blocking, test output valid.
- 16 playground server tests fail (context meter, source map) — **pre-existing**, verified by stashing today's changes. Unrelated to this session.

## Next Steps (Priority Order)

1. **Re-run Meph eval** — `playground/system-prompt.md` touched. `node playground/eval-meph.js`, ~$0.15.
2. **Surface graded evals in Studio** — schema evals are in today. LLM-graded is still CLI-only. Biggest value-add for evals: add a "Run Graded Evals" button that spins up the compiled app, hits it with test inputs, grades the responses via Claude.
3. **Typed agent return values** — `agent X receives msg returning: sentiment, score (number)` would let the compiler type-check what coordinators do with call results. Today any downstream usage is free-form.
4. **Pipeline input/output type inference** — right now the first step's input and the last step's output aren't type-checked against the declared `with text:` variable.
5. **`reply`/`respond` synonym fix** from Session 29's open list.

## Files to Read First

| File | Why |
|------|-----|
| `HANDOFF.md` | This file |
| `PHILOSOPHY.md` | Unchanged — the 14 rules are still the bar |
| `CLAUDE.md` | Project rules |
| `apps/multi-agent-research/main.clear` | Reference for every orchestration pattern in one place |
| `SYNTAX.md` | New Multi-Agent Orchestration section |

## Resume Prompt

```
Read HANDOFF.md, PHILOSOPHY.md, then CLAUDE.md.

Last session (Session 30, 2026-04-14): audited multi-agent infrastructure
(all primitives already existed), fixed one real streaming-default bug
where coordinator agents received async generators instead of strings,
added a new "apps/multi-agent-research" demo exercising all 4
orchestration patterns, wired a "Run Evals" button in Studio next to
Run Tests, synced 6 docs + Meph's system prompt.

1861 compiler tests pass. Bundle rebuilt. Demo compiles 0/0, auto-tests 6/6.

Top open-claw: re-run Meph eval (system-prompt.md changed), add graded
evals to Studio IDE (currently CLI-only), add typed agent returns,
add pipeline input/output type inference, fix `reply`/`respond` collision.

Studio: `node playground/server.js` → http://localhost:3456
Meph eval: `node playground/eval-meph.js` (needs ANTHROPIC_API_KEY)
```
