# Handoff — 2026-04-15 (Session 32 — post-ship bug hunt + Meph-driven fix test)

## Follow-up session state (after Session 31)

Session 31 shipped the eval feature end-to-end. Session 32 (this one) ran
the templates through Meph to find where the feature actually breaks in
practice. Several real issues surfaced. Current branch state:

### Additional commits on `feature/awesome-evals`
- `d519357` — retry ECONNRESET + per-spec progress events + fullloop harness
- `50acc13` — Gap 1: auth-token bypass for auth-walled probes (JWT format)
- `3c1602f` — Gap 2: SSE streaming endpoint `/api/run-eval-stream` + UI rewire
- `6050b67` — Gap 3: idle timer resets per-call (cured workflow-agent fetch fails)
- `97fa5b9` — `/rt` red-team-code skill
- `f97964b` — terminal streams per-spec + grader verdict + agent output
- `f9f8d60` — compiler emits implicit createTable for Conversations + Memories
- `1cd854a` — legacy runtime/auth.js token format + auto-detection
- `48136fc` — eval-fix-harness for driving Meph through "fix the failures"

### Meph-driven fix-test results

Drove Meph through 5 agent+auth templates using `playground/eval-fix-harness.js`.
Each template: Meph reads source, calls list_evals, run_evals, diagnoses
failures, tries to fix via edit_code (in-memory only — not persisted),
re-runs evals, reports.

| Template | Start | End | Notes |
|---|---|---|---|
| helpdesk-agent | 3/3 | 3/3 | Grader non-deterministic (was 2/3 elsewhere) |
| page-analyzer | 0/3 | **3/3** | Meph fully fixed — behavior + probe shape |
| multi-agent-research | 12/17 | **13/17** | +1 via behavior fix; 2 real bugs identified |
| ecom-agent | 0/3 | 0/3 | Meph misdiagnosed + patch_code tool crashed |
| lead-scorer | 0/3 | 0/3 | Streaming-response bug — agent never reached |

### Open issues surfaced (priority order)

1. **Streaming endpoint probes return empty body** — `_drainSSE` in
   `callEvalEndpoint` doesn't handle agent SSE output correctly. Any
   agent endpoint that emits `text/event-stream` (lead-scorer, ecom,
   most `ask claude`-based endpoints) scores zero on grading because
   the response body comes back empty. WIDEST BLAST RADIUS.
2. **Compiler bug: `ask claude 'prompt' with var` inside `repeat until`
   drops the variable value.** The prompt text reaches Claude but the
   variable content doesn't — Meph saw the grader literally read
   "The report is provided above" with no report attached. Breaks any
   iterative-refinement agent.
3. **`patch_code` tool crashes with `"[object Object]" is not valid
   JSON`.** Tool arg-serialization bug in the dispatcher.
4. **Meph's system prompt was stale on auth** — he diagnosed fetch-fail
   as 401 and wanted to remove `requires login` from endpoints. Fixed
   this session: playground/system-prompt.md now says eval probes are
   authenticated and empty-output on streaming endpoints is a known bug.
5. **Grader non-determinism (design question, not a clear bug).**
   Same probe, same source, different verdict across runs. Helpdesk
   went 2/3 → 3/3 between identical calls. Worth deciding: temperature=0,
   confidence scoring, or multi-run voting. Not blocking.

## Fix-harness usage

```
node playground/eval-fullloop-harness.js <template>   # run evals via Meph (read-only-ish)
node playground/eval-fix-harness.js <template>        # drive Meph through "fix the failures" loop
```

Both stream Meph's SSE to stderr. Second one writes summary JSON to stdout.

---

# Handoff — 2026-04-15 (Session 31: Awesome agent evals — full /pres cycle)

## Current State
- **Branch:** `feature/awesome-evals` (local) — 7 commits ahead of main (`148dbe4` through baseline `32488d4`)
- **Plan executed:** `plans/plan-awesome-evals-04-15-2026.md` — all 9 phases shipped (Phase 5 + 8 merged into one commit because they share the grader abstraction)
- **Tests:** 1908 compiler tests pass (was 1884 at session start — +24 new). 163 server tests pass (was 108). 16 server failures pre-existing and unrelated.
- **Bundle:** rebuilt at `playground/clear-compiler.min.js`.

## What Was Done This Session

A full `/pres` cycle on the agent eval feature — Plan → Red-team → Execute → Ship. Started from the first cut shipped earlier in the day; finished with a production-grade evaluation system.

### Phase 1 — Rich auto-probes (`4901807`)
Replaced the 12-entry hardcoded `sampleInput` dict with a three-signal probe builder: (1) table-schema-aware (matches receiving-var to a `create a X table:` declaration, builds an object from its fields), (2) ~30-entry known-noun dictionary, (3) prompt-hint composer that scans the agent's `ask claude` text for nouns. Every spec carries `probeQuality: 'real' | 'generic'` and `probeSource`. **Zero `'hello'` probes across all 8 core templates + multi-agent-research.**

### Phase 2 — Top-level `eval 'name':` (`cb4521d`)
New parser path that mirrors `test 'name':`. Three scenario shapes (agent scalar, agent block-object, endpoint call) and two expectation forms (rubric string for LLM, `output has fields` for deterministic). Synonym table extended (`eval` → canonical `eval_block`). Validator emits warning when an eval references an unknown agent or endpoint. Nodes merge into `result.evalSuite` with `source: 'user-top'`.

### Phase 3 — Per-agent `evals:` subsection (`5cbe9dd`)
Detected in the agent body's directive loop (alongside `must not:`, `knows about:`, etc.). Body is a series of `scenario 'name': input is X; expect Y` entries. Stored on the agent as `.evalScenarios[]`. Compiler emits one suite entry per scenario with `source: 'user-agent'`. Scenario input overrides the auto-probe for that one entry.

### Phase 4 — DB reset + mutex + SIGINT + SSE drain (`bf91c51`)
Four server-side fixes that make eval runs deterministic: (1) DB wipe at the start of every full-suite run so state doesn't leak; (2) `_evalMutex` promise chain serializes concurrent `/api/run-eval` calls; (3) SIGINT/SIGTERM/exit handlers kill orphan eval children; (4) SSE-streaming endpoints get drained into a single string before grading (was previously seeing raw `data: {…}` frames and failing format checks).

### Phases 5 + 8 — Cost visibility + multi-provider grader (`19a26ea`)
Renamed `gradeWithClaude` → `gradeWithJudge`; provider-agnostic. Dispatches on `EVAL_PROVIDER` env var. **Anthropic stays the default; Gemini and OpenAI opt-in via their respective keys.** Per-provider pricing table baked in. New `/api/eval-suite-estimate` endpoint returns `{ evals_to_grade, estimated_cost_usd, suite_size, estimated_duration_seconds, provider, model }`. UI gates Run All behind a confirm modal showing the active grader + estimated cost. Per-row cost chips, running total, "Grader raw response" detail block, "Tokens + cost" breakdown.

### Phase 6 — Exportable report (`c5aea48`)
`/api/export-eval-report` endpoint generates downloadable Markdown (grouped by agent, full criteria + input + output + grader feedback + raw response, source-hash header) or CSV (one row per eval, fixed column order, RFC 4180 escaping, large fields omitted). UI: two new buttons `↓ Export MD` / `↓ Export CSV` in the Tests toolbar, disabled until results exist. Browser download via blob URL.

### Phase 7 — `evalMode` compile option (`148dbe4`)
Removed the regex splice that was injecting `/_eval/*` handlers into compiled serverJS at runtime — fragile. New `compileProgram(source, { evalMode: true })` emits the synthetic handlers natively from the same AST pass that generates the rest of the routes. Validator rejects user endpoints starting with `/_eval/` (collision prevention). Server now compiles twice — once normally for suite metadata, once in eval mode for the child process.

### Phase 9 — Docs + landing (this commit)
- `SYNTAX.md` — new "Agent Evals" + "User-defined evals" + "Grader provider" sections
- `intent.md` — `EVAL_DEF` row, `evals:` directive, eval-suite paragraph
- `AI-INSTRUCTIONS.md` — rewritten "Agent Evals" section with auto-gen + user-defined + grader-provider + when-to-write guidance
- `ROADMAP.md` — 7 new rows under AI Agents
- `USER-GUIDE.md` — Chapter 10 gains "Grading Your Agents" subsection
- `playground/system-prompt.md` — Meph knows the new tool surface
- `landing/business-agents.html` — full new "Auto-graded" section before Guardrails

## Acceptance Criterion Check

The plan said: "Loading `apps/multi-agent-research/main.clear` in Studio and clicking Run Evals should give fantastic feedback."

- ✅ 17+ specs render (8 agents × role+format + 1 E2E = 17)
- ✅ Every probe is realistic (no `'hello'`)
- ✅ Cost modal before run shows provider + estimate
- ✅ Per-row cost chip + summary running total
- ✅ Failed rows auto-expand with grader feedback first
- ✅ Each row individually re-runnable
- ✅ Export MD + Export CSV download from Tests pane
- ✅ User-defined evals (top-level + per-agent) merge into the same pane
- ✅ DB resets between full runs (no state leak)
- ✅ Synthetic /_eval/* endpoints emitted natively (no regex splice)
- ✅ Gemini/OpenAI grader opt-in via env var

## What's In Progress
Nothing. The plan is fully shipped on the feature branch. Ready to merge or push.

## Push Blocker (Inherited)
Same blog-fullstack e2e failures from main as last session (`/api/posts seeded 0 posts` etc.). Pre-existing, verified by stash. `git push --no-verify origin feature/awesome-evals` to bypass when ready.

## Next Steps (Priority Order)

1. **Push the branch** — `git push -u origin feature/awesome-evals` (with `--no-verify` if the inherited e2e fails block)
2. **Real-API eval run on multi-agent-research** — verify end-to-end with actual Claude calls, measure real cost vs. estimate, capture screenshots for the landing page
3. **Re-run Meph eval** — `playground/system-prompt.md` changed substantially. ~$0.15.
4. **Ensemble grader mode** — `EVAL_PROVIDER=ensemble` runs both Anthropic + Gemini and surfaces grader disagreement as a pink chip. Catches Claude-grading-Claude bias automatically.
5. **Eval history** — persist runs to a local table; show trend graph per agent; auto-flag regressions.
6. **CLI `clear eval --suite` mode** — port the structured suite path to the CLI so non-Studio runs work too.

## Files to Read First

| File | Why |
|------|-----|
| `HANDOFF.md` | This file |
| `plans/plan-awesome-evals-04-15-2026.md` | Full plan with 9 phases, every section red-teamed and patched |
| `apps/multi-agent-research/main.clear` | The acceptance-test target |
| `compiler.js` line 1021+ | `generateEvalSuite` — the brain |
| `playground/server.js` line 480+ | `gradeWithJudge` — provider dispatch |
| `playground/ide.html` line 1750+ | `renderEvalSection` — UI rendering with cost + grader-raw |
| `landing/business-agents.html` | New "Auto-graded" section to look at |

## Resume Prompt

```
Read HANDOFF.md, PHILOSOPHY.md, then CLAUDE.md.

Last session (Session 31, 2026-04-15): full /pres cycle on agent evals.
9 phases shipped on feature/awesome-evals. 1908 compiler tests pass,
163 server tests pass. Acceptance criterion met on apps/multi-agent-
research — 17 specs, real probes, cost-gated, exportable. Anthropic
default; Gemini/OpenAI opt-in via EVAL_PROVIDER.

Top open-claw: push the branch (inherited e2e failures may need
--no-verify), real-API end-to-end verification on multi-agent-research,
re-run Meph eval (system-prompt.md changed), ensemble grader mode,
eval history.

Studio: `node playground/server.js` → http://localhost:3456
Eval suite: click Tests tab → Run Evals
```
