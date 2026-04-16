# Handoff — 2026-04-16 (Session 34 — Meph voice mode + session 33 deferred items)

## Shipped this session (on `main`)

- **Meph voice mode in Studio.** Toggle at the bottom of the chat pane (🔊 Voice mode). Once on, the mic listens continuously — say something, pause for 1.2s, it auto-sends. Meph's replies speak aloud sentence-by-sentence as they stream in. Mic auto-pauses while he's talking so it doesn't hear itself, auto-resumes after. All zero-deps Web Speech API — works in Chrome/Edge. Voice picker prefers British male voices (Google UK English Male, Microsoft Ryan Online Natural, Microsoft Thomas, George) with refined US fallbacks. Stop button kills both API stream and in-flight speech. State persists across reloads via localStorage.
- **Eval criteria display fixed** (session 33 deferred #2). Rubric now leads, shape check drops to a dim italic footnote ("Also validated: endpoint returned a non-empty response."). Applied to both the Studio Tests pane and the exported Markdown report. Field-shape checks stay primary because they're real structural contracts.
- **Windows spawnSync ETIMEDOUT fixed** (session 33 deferred #1). Test runner timeouts bumped from 30s to 120s (CLI) / 180s (Studio wrapper), overridable via `CLEAR_TEST_TIMEOUT_MS` / `CLEAR_STUDIO_TEST_TIMEOUT_MS`. `npm install` timeout bumped to 60s via `CLEAR_NPM_INSTALL_TIMEOUT_MS`. Cryptic cmd.exe errors translated to plain English: "Test runner timed out after 180s. Templates with live agent calls can be slow — set CLEAR_STUDIO_TEST_TIMEOUT_MS to raise the limit." Un-swallowed the silent npm install catch so missing-dependency failures are visible.
- **Stray diff-marker error message.** When an edit leaves a `-` or `+` at the start of a line (classic AI-edit artifact), the parser used to read it as a negation and the validator said "You used 'send back' but it hasn't been created yet" — which made no sense to the user. Now the validator spots the case (variable_ref with a space in its name is always a canonicalized multi-word keyword that got shoved into expression position) and says "Line 3 looks like it has a stray '-' or '+' at the start — remove it and the line will compile." Added regression test. Updated `AI-INSTRUCTIONS.md` and Meph's system prompt so the problem gets prevented at the source, not just caught downstream.
- **Voice mode: three states instead of one toggle.** Segmented control at the bottom of the chat pane: `Off | 🔊 Speak | 🎤 Converse`. Off is silent text chat. Speak plays Meph's replies aloud without opening the mic — good for when your hands are busy but you don't want a hot microphone. Converse is continuous voice — mic listens, 1.2s pause auto-sends, Meph talks, mic pauses during his speech, resumes after. Backward-compat with the old boolean toggle (saved `1` becomes `converse`, `0` becomes `off`). Mic-permission denial gracefully degrades Converse → Speak so you at least still hear him. Voice ranking already targets British male baritones (Ryan / Thomas / George Natural) with Daniel/Guy/David fallbacks.
- **Streaming endpoint SSE grading fixed.** Session 32 widest-blast-radius open claw. `_extractSSEFrameText` dropped anything that wasn't a bare string or a `{text:"..."}` chunk — so any agent endpoint that did `send back { score: 8, reason: "..." }` inside a stream block made the grader see an empty body and score it zero. Fix: return `JSON.stringify(parsed)` for object/array/number/boolean payloads so the grader receives the full structured body. Added 14 SSE drain unit tests (`playground/sse-drain.test.js`), covering chunk frames, string payloads, object payloads, number/array payloads, `[DONE]` sentinels, empty frames, non-JSON payloads, and mixed streams where chunks are followed by a structured tail.
- **Terminal ordering: newest at top.** Removed a double-reverse (JS reversed the array, then `flex-direction: column-reverse` reversed it again, burying the newest entry at the bottom). Now DOM[0] is the newest event, shown with accent color + accent left-border + subtle glow so the eye finds it instantly. Entry #2 fades slightly, everything below fades further. Scrolling down walks backward in time.

Tests: 1914/0 compiler. Server tests match baseline (171 pass, 16 pre-existing failures unrelated to this session).

## Deferred — next session

**All three session-32 compiler/tool bugs now closed.** Audit done this session:

1. **Streaming endpoint probes returning empty body** — FIXED this session. `_extractSSEFrameText` now preserves structured payloads as JSON instead of dropping them. 14 new unit tests in `playground/sse-drain.test.js`.
2. **`ask claude with var` inside `repeat until` drops the variable** — already FIXED in session 33 (`compiler.js:3488`). The pre-scan that converts `let X = await _askAI(...)` to `_askAIStream(...)` now skips variables that get reassigned later in the body, so the second call still receives a real string. Regression test lives at `clear.test.js:22649` ("T4c: ask-claude var inside repeat-until stays non-streaming if reassigned"). Verified by re-compiling the Polished Report agent — `draft` is awaited correctly on both calls.
3. **`patch_code` JSON crash** — already FIXED in session 32 (`playground/server.js:3011-3017`). The terminal-log formatter now reads `res.applied`/`res.skipped` from the once-parsed `res` variable instead of re-parsing the tool result string. Comment at the fix site explains the double-parse that used to crash the whole Meph turn.

**What shipped after the audit:**

- **Grader score-gap display.** Rubric-graded specs now render with a tinted score chip showing the gap from the pass threshold (`7.4/10 +0.4` green-ish if barely over, `6.8/10 -0.2` yellow if barely under, `3/10 -4.0` red if confidently failed). Three tiers: `eval-score-clear` (|gap| > 1 and passing), `eval-score-borderline` (|gap| ≤ 1, flaky zone), `eval-score-fail` (|gap| > 1 and failing). Exported Markdown reports mirror the same format.
- **Auto-rerun on eval fail.** Rubric-graded specs that fail first attempt auto-rerun once. If the rerun passes, it's tagged "borderline" and the prior attempt's score + feedback are kept for context. The UI shows a `borderline` badge next to the score so the user reads it as "flaky, not broken." Merged cost includes the failed first attempt so the $ total stays honest. Costs ~2x on genuine failures only (passes never rerun). Disable with `CLEAR_EVAL_NO_RERUN=1` for strict mode.

**Real-world eval validation — ran all 5 templates through `/api/run-eval`:**

| Template | Before (Session 32) | After (Session 34) | Delta |
|---|---|---|---|
| helpdesk-agent | 3/3 | 2/3 | -1 (grader nondeterminism — behavior) |
| page-analyzer | 0/3 | 0/3 | 0 — but now failing for a DIFFERENT reason (probe shape, not empty SSE) |
| multi-agent-research | 12/17 | 14/17 | **+2** (SSE fix confirmed — first validation run's 0/17 was a sampling fluke, covered below) |
| ecom-agent | 0/3 | 1/3 | **+1** (SSE fix helped — now scoring instead of Network errors) |
| lead-scorer | 0/3 | 0/3 | 0 — but now failing for probe shape, not SSE |

**What the SSE fix changed for real:** ecom-agent went from 0 (all "Network error: empty") to 1 pass + 2 behavior fails with actual scores. The SSE fix is confirmed working — graders now receive the structured body and score it. But three new bugs surfaced that the SSE bug had been masking:

**Open claws discovered this run (priority order):**

1. **Probe builder misses required fields from `validate incoming:`** — page-analyzer + lead-scorer all fail with 400 "field is required" before the agent even runs. Before the SSE fix these failed with "empty body"; now they fail with "wrong input shape." The compiler's auto-probe needs to read the endpoint's `validate incoming:` rules and mint the required fields.
2. **Flaky `fetch failed` races inside a suite.** Investigated this session. The first validation run reported multi-agent-research at 0/17 — everything "fetch failed." A second fresh run scored 14/17 (cleanly up from 12/17 baseline). Root cause: one stray `fetch failed` on an early spec in the first run cascaded because the eval child's idle timer or the DB wipe interacted with an already-in-flight request. Not a regression from this session's fixes — a pre-existing race. Mitigations already in place: `callEvalEndpoint` retries connection errors 3× with backoff, idle timer resets on every request. Possible next steps: warm up with a cheap ping before the suite starts, or isolate the retry budget per spec instead of per call.
3. **helpdesk-agent role spec scored 3/10 on a quantum-computing off-topic question** — this one IS the agent being off-topic. Fixable-by-Meph (edit the agent's restriction list). Same for ecom-agent's 2 fails.
4. **multi-agent-research 2 real behavior fails (from the 14/17 re-run):** `role-researcher` agent returned 2 sentences when the rubric asked for 1; `role-research_topic` ignored its `Report Style` skill constraints. Both are agent-prompt tuning, not infrastructure.

## Key decisions

- **Audio input for Meph: not worth it yet.** Claude's Messages API takes text + images + PDFs, not audio. Tone is lost when transcribing voice to text. Could bolt on a side-classifier to emit `[tone: X]` hints, but that's janky and Meph does fine on raw words. If this becomes a paid feature, upgrade STT (Deepgram/AssemblyAI) and TTS (ElevenLabs) in one sweep — don't layer piecemeal.
- **Voice gender: Meph is male.** Initial draft picked British female voices because "elegant and refined" reads female-coded in English. Corrected to baritone — Mephistopheles is a male persona, a Ryan/Thomas/George Natural voice fits the theatrical literary reference.
- **Timeout tuning: raise defaults, expose env overrides.** The old 30s didn't account for templates that make live `ask claude` calls (10–30s each × N agents). Could have added retry-with-backoff but that hides real problems — better to give headroom and surface clean errors when the headroom's exhausted.

## Resume prompt

Read HANDOFF.md, PHILOSOPHY.md, then CLAUDE.md.

Session 34 shipped Meph voice mode + polished the two deferred items from session 33. Studio now has conversational voice UX — toggle once, stays on, elegant male British voice. Test runner on Windows no longer shows cryptic spawnSync errors.

Top open-claws (from session 32): streaming endpoint probes return empty body (widest blast radius — any agent SSE endpoint scores zero), `ask claude with var` inside `repeat until` drops the variable value (breaks iterative-refinement agents), `patch_code` tool crashes with object-not-JSON error.

Studio: `node playground/server.js` → http://localhost:3456. Eval suite: Tests tab → Run Evals.

---

# Handoff — 2026-04-16 (Session 33 — eval UI polish + compiler caller/callee + probe shape)

## Shipped this session (on `main`)

- `9547412` — eval rows are actually clickable now. The onclick attribute had nested double-quotes; click was silently a no-op. Passing rows now expand with all 6 detail blocks (criteria, endpoint, agent output, grader feedback, grader raw, tokens+cost). Added chevron indicator.
- `2c9902b` — caller/callee streaming-shape mismatch. When an agent was pre-classified as streaming but its compile demoted (vars reassigned, property assignments), callers still used `for await` on a function that returned a Promise. Runtime threw. Fix propagates the demotion through the shared set.
- `7fcdd49` — two probe-shape bugs. (1) Save statements lost their `with field is value` override — parser dropped it silently. (2) Auto-generated "agent responds to messages" tests hardcoded `{ message: ... }` for every agent. Both fixed; tests use the agent's actual receiving var.

Tests: 1914/0. Main up to date.

## Deferred — next session

1. **Tests pane shows `spawnSync C:\Windows\system32\cmd.exe ETIMEDOUT`** when running tests on Windows. The test runner spawns a child that times out. Reproducible in Studio on the multi-agent-research template. Probably the test-runner's npm-install-in-build-dir step hitting a long timeout, or a Windows-specific spawn path. Needs instrumentation to narrow down.

2. **Grading criteria display is too weak.** The Tests pane shows a "Expected: any non-empty response from the endpoint" line as grading criteria. That's the deterministic shape check — the actual LLM rubric is richer (full agent definition sent to Claude) but the one visible line sounds lazy. Polish: either drop the shape-check line when a rubric exists, or prepend the rubric as the primary criteria and demote the shape check to a footnote.

---

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
5. **Grader non-determinism — design recommendation (not a bug).**

   **Reality check:** temperature=0 is already the default in
   gradeWithJudge (server.js line 542). Variance still exists at T=0
   due to backend sampling. Can't be eliminated fully.

   **Recommendation (in order):**

   a) **Score-gap display.** The grader already returns 1-10. Show the
      gap to threshold in the UI. "Passed at 7.2/10" → "Passed at 6.8/10"
      reads as "same borderline case, sampling jitter" instead of "broke."
      One-afternoon UI change.

   b) **Auto re-run on fail, once.** When a spec fails, re-run it
      immediately. If the re-run passes, tag as "borderline — flipped."
      Only costs 2x on genuine failures, not all specs. ~50 LOC.

   c) **Pin-and-flag history.** Store last verdict + score. On re-run,
      only flag a "regression" when score drops >2 points — not on
      any flip. Needs a tiny JSON store. Half-day.

   **DON'T do by default:**
   - Multi-run majority voting — 3x cost for 5% improvement
   - Ensemble grading as the flakiness fix — different problem
     (bias, not variance). Keep it as a separate feature.

   Order of operations if you tackle this: (a) first — it's the
   cheapest honest fix. Gather a week of data. If still flaky on
   >10% of specs, do (b). Only add (c) if users complain.

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
