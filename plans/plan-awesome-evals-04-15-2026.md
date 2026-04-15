# Plan: Make Agent Evals Awesome

**Date:** 2026-04-15
**Scope:** Large (9 phases, 7 files plus docs + landing + tests)
**Branch:** `feature/awesome-evals`
**Logger tag:** `[EVALS]`

## Acceptance Criterion (the one that matters)

Load `apps/multi-agent-research/main.clear` in Studio, click Run Evals:

- 17+ rows render. Each has a realistic probe — **no row shows input `'hello'`**.
- Cost modal before run: "This run calls Claude N times (~$X). Continue?"
- After run: every agent has a role + format grade; summary shows actual total cost; each row's detail panel shows input/output/criteria/tokens/cost/grader-raw.
- Add a top-level `eval 'Report synthesizes findings': given Polished Report receives 'X'; expect 'Final text should mention X'` to the source — it appears in the Tests pane, runs identically to auto-generated ones.
- Click "Export Report" → markdown file downloads. Open it — it's a human-readable grouped-by-agent document with all details.
- Re-run individual evals cheaply from the eval keepalive child (60s).
- DB state does not leak between runs.

If ANY of these fails on final verification, the plan is not done.

## What's Already Built (Do Not Rewrite)

This session already shipped the first cut. See HANDOFF.md and commits `0e440f7`, `f5d7e37`. Concretely:

- `compiler.js` exports `generateEvalSuite(body)`, `generateEvalEndpoints(body)`. Suite has `kind: 'e2e' | 'role' | 'format'` plus metadata per entry.
- `playground/server.js` has `compileForEval`, `runEvalSuite`, `ensureEvalChild` (keepalive on port 4999), `runOneEval`, `gradeWithClaude`, `checkFormat`. HTTP: `/api/eval-suite`, `/api/run-eval`.
- `playground/ide.html` has `renderEvalSection` with per-row `Run` buttons, auto-expand failed rows, "why it failed" first.
- Meph tools: `list_evals`, `run_evals`, `run_eval`.
- 17 clear.test.js tests + 17 server.test.js tests covering suite shape, rubric construction, endpoint generation, probe shape.

This plan **extends** that work. Phases that touch already-shipped code list exactly the function being modified, not the whole file.

---

## Section 1 — Existing Code (per-phase reads)

**Always read first (every phase):**
| File | Why |
|------|-----|
| `intent.md` | Authoritative node-type spec |
| `HANDOFF.md` | What just shipped |
| `PHILOSOPHY.md` | 14-year-old test, one op per line |
| `CLAUDE.md` | Project rules (docs rule, plain-english comments rule, etc.) |

**Phase 1 (probes) — read:**
| File | Why |
|------|-----|
| `compiler.js` line 1021 `function generateEvalSuite(body)` | The function being rewritten (probe builder) |
| `compiler.js` line 1277 `export function generateEvalEndpoints(body)` | Stays unchanged; confirm signature |
| `apps/multi-agent-research/main.clear` | Real target to test probe quality against |
| `apps/helpdesk-agent/main.clear` | Second target — agent with tools + tables |
| `apps/hiring-agent/main.clear` | Third target — agent with `receives candidate` |

**Receiving-var coverage requirement for the probe dictionary** — every receiving variable that appears in `apps/multi-agent-research/main.clear` MUST have a non-generic probe entry, or the acceptance criterion ("no row shows input 'hello'") fails on day one:

| Agent | Receiving var | Required probe shape |
|-------|---------------|---------------------|
| Researcher | `question` | a concrete open question string (≥ 20 chars) |
| Fact Checker | `claim` | a factual claim string |
| Sentiment Rater | `claim` | same as above (reused) |
| Quality Critic | `draft` | a paragraph-length draft string |
| Grade Answer | `claim` | (reused) |
| Research All | `questions` | a list of 1–3 open questions |
| Polished Report | `findings` | **a list of 2–3 finding strings** — NEW dict entry |
| Research Topic | `topic` | a topic string |

Phase 1 test-suite MUST include a smoke assertion that loads `apps/multi-agent-research/main.clear`, compiles it, and for every spec in `result.evalSuite` asserts `JSON.stringify(spec.input).length > 6` (rules out `'hello'`).

**Phase 2 (top-level `eval` block) — read:**
| File | Why |
|------|-----|
| `parser.js` line 5466 `function parseTestDef` | Template for the new parse path — copy its shape |
| `parser.js` line 227 `TEST_DEF: 'test_def'` (NodeType enum) | Where to add `EVAL_DEF: 'eval_def'` |
| `parser.js` line 1367 `['test', (ctx) => { const parsed = parseTestDef ... }]` (CANONICAL_DISPATCH) | Where to register `'eval'` the same way |
| `parser.js` line 5499 `parseExpect` | Existing `expect <expr>` parser; reuse for rubric form |
| `synonyms.js` line 230 `can: Object.freeze([...])` area | Where to add `eval: ['eval']` and any multi-word entries. Bump `SYNONYM_VERSION` to 0.28.0 |
| `compiler.js` line 1021 `generateEvalSuite` (just-rewritten) | Where user evals merge into the suite |

**Syntax spec — top-level `eval` block.** Canonical form:

```clear
# LLM-graded scenario (role/e2e-style)
eval 'Topic produces a structured report':
  given 'Research Topic' receives 'quantum computing'
  expect 'Response is a multi-paragraph report that mentions quantum computing'

# Deterministic scenario (format-check-style)
eval 'Classifier output shape':
  given 'Classifier' receives 'Billing question about my invoice'
  expect output has category, confidence

# Cross-agent (pipeline) — call an endpoint directly
eval 'End-to-end research flow':
  call POST '/api/research' with topic is 'quantum computing'
  expect output has report

# Compound input (use object form)
eval 'Complex input':
  given 'Screener' receives:
    name is 'Jane Doe'
    resume is 'Senior engineer with 8 years of backend experience'
  expect 'Screener passes the candidate and returns their record unchanged'
```

Parser rules:
- `given` introduces an AGENT scenario → posts to the agent's endpoint path (real or synthetic)
- `call` introduces an ENDPOINT scenario → posts to the literal endpoint path in the source
- Expectation can be EITHER a STRING (→ LLM-graded rubric) OR `output has field1, field2[...]` (→ deterministic)
- Input after `receives`/`with` can be a STRING, NUMBER, LIST, or a block of `X is Y` lines (compound object). The parser uses the same expression parser as everywhere else in Clear.
- Keyword is `output`, not `response` — matches `send back` semantics and avoids introducing a new implicit variable.

**Phase 3 (per-agent `evals:` subsection) — read:**
| File | Why |
|------|-----|
| `parser.js` agent body directive parse loop — search for `'remember' && ... 'conversation' && ... 'context'` (currently around line 3377–3379) | Where other agent directives are detected; add `evals:` alongside |
| Same parser changes as Phase 2 | `NodeType.EVAL_DEF` already exists by then |

**Syntax spec — per-agent `evals:` subsection.** Placed inside an agent body like any other directive (`must not:`, `knows about:`, etc.):

```clear
agent 'Screener' receives candidate:
  check candidate's resume is not missing, otherwise error 'Resume required'
  send back candidate

  evals:
    scenario 'passes a real candidate':
      input is:
        name is 'Jane Doe'
        resume is 'Senior engineer, 8 years backend'
      expect 'Screener returns the candidate unchanged with resume preserved'

    scenario 'rejects a missing resume':
      input is:
        name is 'John'
      expect output has error
```

Parser rules:
- `evals:` is detected after the agent's executable body (not before — standard directive order doesn't matter, but convention places evals last)
- Each `scenario 'name':` parses a child block with `input is ...` + `expect ...` (same rules as top-level evals)
- Scenarios attach to the owning agent as `.evalScenarios` array
- Compiler's `generateEvalSuite` pulls each agent's `.evalScenarios` and emits one suite entry per scenario with `kind: 'scenario'`, `source: 'user-agent'`, `agentName: <owning agent>`
- When a scenario provides `input`, the probe builder is bypassed for that scenario

**Phase 4 (DB reset) — read:**
| File | Why |
|------|-----|
| `playground/server.js` line 433 `async function ensureEvalChild` | Where files get wiped on spawn |
| `playground/server.js` line 606 `async function runEvalSuite` | Where per-run wipe gets added |
| `runtime/db.js` | Check for module-level in-memory state that survives child respawn (if any, we need to handle) |

**Concurrency contract.** `runEvalSuite` must serialize with a promise mutex (`_evalMutex`) so a Run All and a Run-One-Eval call can't race the DB-wipe. Implementation: module-level `let _evalMutex = Promise.resolve()`; each call chains via `_evalMutex = _evalMutex.then(() => …)` and awaits its own ticket. Blocks zero other Studio traffic; only serializes eval runs.

**Process cleanup.** Register `process.on('SIGINT', killEvalChild)` and `process.on('exit', killEvalChild)` so orphan eval children don't linger if Studio is Ctrl-C'd. Current code only cleans on idle timeout.

**Phase 5 (cost) — read:**
| File | Why |
|------|-----|
| `playground/server.js` line 478 `async function gradeWithClaude` | Where to capture usage |
| `playground/server.js` line 547 `async function runOneEval` | Where to propagate cost up |
| `playground/server.js` line 606 `async function runEvalSuite` | Where to sum totals |
| `playground/ide.html` `function renderEvalSection` | Where to render cost |
| `playground/ide.html` `async function runEvals` | Where to gate on estimate modal |

**Pricing constant (top of server.js, documented and single-sourced):**

```js
// Claude API pricing for the eval grader model (sonnet-4). Update if the
// default changes or the user sets EVAL_MODEL. Source: anthropic.com/pricing
// as of 2026-04.
const CLAUDE_PRICING_USD_PER_1K_TOKENS = {
  input: 0.003,
  output: 0.015,
};
```

**Estimate math.** Typical grader call on a demo eval: ~400 input tokens, ~100 output tokens. `0.0027 USD per graded eval`. Estimator returns:
```js
{
  evals_to_grade: <count of role + e2e specs>,   // format evals don't grade
  suite_size: <total specs>,
  estimated_cost_usd: evals_to_grade * 0.0027,
  estimated_duration_seconds: evals_to_grade * 2 + 3,  // cold start + ~2s per grade
}
```
The modal text must say **~** in front of the cost (it's an estimate), and warn "actual cost shown after run."

**Per-eval cost capture.** Parse Claude's response `data.usage` object. Convert to USD. Attach to result as `result.usage = { inTok, outTok, costUSD }`. If grader is skipped (no key, format-only, etc.), `result.usage` is `null`.

**Running total.** `runEvalSuite` sums non-null `result.usage.costUSD`. Returns `total_cost_usd`, `total_input_tokens`, `total_output_tokens`. UI renders `Total: $0.027 · 3,200 tok` in the summary line.

**Phase 6 (export) — read:**
| File | Why |
|------|-----|
| `playground/server.js` | Add `/api/export-eval-report` |
| `playground/ide.html` | Add Export dropdown next to Run Evals |

**Phase 7 (evalMode compile option) — read:**
| File | Why |
|------|-----|
| `compiler.js` line 878 `export function compile(ast, options = {})` | Where `evalMode` flag threads in |
| `compiler.js` `function compileToJSBackend` | Where endpoints are emitted; inject native. Find the route-declaration emit block and append synthetic routes there when `evalMode` is on. |
| `playground/server.js` line 422 `function injectEvalEndpoints` + line 433 `ensureEvalChild` | Regex-splice is deleted here |
| `index.js` `compileProgram` | Needs to pass `options.evalMode` through to `compile()` |

**Regression guard — Phase 7 MUST prove it doesn't break the normal build path.** Specific tests:
1. Compile `apps/multi-agent-research/main.clear` WITHOUT `evalMode` → assert compiled serverJS does NOT contain the string `/_eval/agent_`
2. Compile the same file WITH `evalMode: true` → assert it DOES contain handlers for every agent (8 expected: Researcher, Fact Checker, Sentiment Rater, Quality Critic, Grade Answer, Research All, Polished Report, Research Topic)
3. Compile all 8 core templates WITHOUT `evalMode` → all 0 errors + no `/_eval/` in output (regression gate for the 7 non-agent templates)
4. Compile the multi-agent demo WITH `evalMode` and boot it — verify all 8 `/_eval/agent_*` routes 200 when probed with `{ input: 'test' }` (needs stubbed `_askAI` or `ANTHROPIC_API_KEY`)

**Collision check.** If a user's source declares an endpoint path literally starting with `/_eval/`, compiler must emit a validator error before Phase 7 lands (otherwise user routes clobber synthetic ones). Add this check to `validator.js` unconditionally — not gated on `evalMode`.

**Phase 8 (grader stability) — read:**
| File | Why |
|------|-----|
| `playground/server.js` §`gradeWithClaude` | Add temperature:0 and raw-response capture |
| `playground/ide.html` §eval detail panel | Show grader raw output |

**Phase 9 (docs + landing) — read:**
| File | Why |
|------|-----|
| `SYNTAX.md` | Add `eval 'name':` + `evals:` subsection |
| `AI-INSTRUCTIONS.md` | Add "Writing Evals" section |
| `USER-GUIDE.md` | Chapter 10 extension |
| `intent.md` | Add `EVAL_DEF` row + probe/cost note |
| `ROADMAP.md` | Mark eval phase complete |
| `playground/system-prompt.md` | Extend Meph's eval section |
| `landing/business-agents.html` | Add eval preview block |

---

## Section 2 — What We're Building

Nine surgical phases. Each starts with failing tests, ships minimal code, commits.

```
BEFORE                                    AFTER
Run Evals                                 Run Evals ─┬─ Cost estimate modal
  └─ 17 rows, all probe 'hello'             │        │  "Grade 9 evals, ~$0.15"
     no cost shown                          │        │
     Claude grading Claude                  │        ├─ Probes built from
     DB state leaks                         │        │  receiving var + schema
     Regex-spliced endpoints                │        │  + ask-claude hints
     No user-defined evals                  │        │
     No export                              │        ├─ Per-eval tokens +
                                            │        │  cost in detail panel
                                            │        │
                                            │        ├─ Summary: running $
                                            │        │
                                            │        ├─ User evals
                                            │        │  • eval 'name': (top-level)
                                            │        │  • evals: (per-agent)
                                            │        │  both in Tests pane
                                            │        │
                                            │        ├─ DB wiped per run
                                            │        │
                                            │        ├─ Endpoints native
                                            │        │  (compileProgram option)
                                            │        │
                                            │        ├─ Grader temp=0, raw
                                            │        │  response surfaced
                                            │        │
                                            └────────┴─ Export ▾ (MD, CSV)
```

### Key decisions

| Decision | Rationale |
|----------|-----------|
| Probe builder is rule-based, not LLM | Determinism + zero added cost. Good probes are a style/lookup problem, not a reasoning problem. |
| User evals use TWO syntaxes | Top-level `eval` block for cross-agent / E2E scenarios; `evals:` subsection scoped inside an agent for per-agent scenarios. Russell confirmed. |
| `evalMode: true` as compile option | Removes regex-splice fragility. Synthetic endpoints emitted natively by compiler. |
| Cost estimate before run is GATED (modal) | Prevents surprise bills. `run_eval` (single) doesn't gate (trivial cost). |
| Export formats: Markdown + CSV | Russell confirmed both. MD = human audit, CSV = spreadsheet/CI diff. |
| DB wipe = kill-and-respawn the eval child on Run All | Simplest way to guarantee fresh state. The 60s keepalive still works for per-row re-runs, just resets on next Run All. |
| Grader temperature=0 | Stability across re-runs of unchanged code. Noise is wasted token spend. |

---

## Section 3 — Data Flow

```
User clicks "Run Evals"
         │
         ▼
  POST /api/eval-suite-estimate ─── compiler: generateEvalSuite
         │                                     │
         ▼                              count role+e2e specs
  { evals_to_grade: 9,
    estimated_cost_usd: 0.15,
    suite_size: 17 }
         │
         ▼
  UI: Confirm modal ── user clicks Continue ──────┐
                                                  │
                                                  ▼
                                      POST /api/run-eval (no id = all)
                                                  │
                                                  ▼
                                      killEvalChild → wipe DB files
                                                  │
                                                  ▼
                                      compileProgram(src, {evalMode:true})
                                          emits serverJS WITH /_eval/* natively
                                                  │
                                                  ▼
                                      spawn child on :4999, probe ready
                                                  │
                                                  ▼
                      for each spec in suite:
                          POST spec.endpointPath with spec.input
                          ┌─────────────────────┐
                          │ format: deterministic│
                          │ role/e2e: gradeWithClaude
                          │   temperature: 0
                          │   capture raw response
                          │   capture usage.cost
                          └─────────────────────┘
                                                  │
                                                  ▼
                        { suite, results[{id,status,feedback,
                                          graderRaw?, input, output,
                                          usage:{inTok,outTok,costUSD}}],
                          passed, failed, skipped, duration,
                          total_cost_usd }
                                                  │
                                                  ▼
                                     UI renders per-spec row with:
                                     • kind badge, label, status, Run btn
                                     • cost chip (e.g. "$0.02")
                                     • click → details: criteria / input /
                                       output / grader raw / tokens / cost
                                     • failed rows auto-expand, why-first
```

---

## Section 4 — Integration Points

| Producer | Consumer | Contract |
|----------|----------|----------|
| `compiler.js` `generateEvalSuite(body, {userEvals})` | `result.evalSuite` | Array of `{id, kind, label, agentName?, endpointPath?, synthetic, input, rubric?, expected, source?}` — `source: 'auto' \| 'user-top' \| 'user-agent'` added in Phase 2+ |
| `compiler.js` `compile(ast, {evalMode})` | `result.serverJS` | When `evalMode`, emits `/_eval/agent_*` handlers natively. No more `evalEndpointsJS` string. |
| `server.js` `gradeWithClaude(rubric, input, output, {temperature})` | caller | Returns `{pass, score, feedback, graderRaw, usage: {inTok, outTok, costUSD}}` |
| `server.js` `/api/eval-suite-estimate` | UI modal | `{evals_to_grade, estimated_cost_usd, suite_size}` |
| `server.js` `/api/export-eval-report?format=md\|csv` | Browser download | `Content-Disposition: attachment; filename=eval-report-<hash>.<ext>` |
| `parser.js` `NodeType.EVAL_DEF` | `compiler.js` | `{type:'eval_def', name:string, scope:'top'\|'agent', agentName?:string, input:Expr, rubric?:string, deterministicExpected?:object}` |

---

## Section 5 — Edge Cases

| Scenario | Handling |
|----------|----------|
| Source has no agents | `evalSuite: []` ; UI shows empty state with guidance |
| Agent has no ask-claude call | `role` eval still generated; rubric falls back to "response is non-empty and relevant" |
| Receiving var is unknown AND no schema hints | Probe falls back to `'hello'` BUT UI renders a warning chip "probe is generic — consider adding an `evals:` block" |
| User eval has no rubric (only deterministic) | Skipped by grader; format check runs; no API cost |
| Grader returns malformed JSON | `{pass:false, feedback:'grader returned non-JSON', graderRaw}` — raw preserved for debugging |
| API key missing | All role/e2e evals status=skip with reason "ANTHROPIC_API_KEY not set" ; format evals still run |
| Eval child crashes mid-run | `runOneEval` returns fail with `feedback: "Eval server crashed"` ; next call respawns |
| DB reset mid-run (racing Run buttons) | Serialize: `runEvalSuite` holds a mutex; concurrent calls queue |
| Export called before any run | Button disabled until results exist |
| User eval references undefined agent | Compile-time error via validator: `Eval references unknown agent 'X'` |
| User eval syntax error | Same error system as `test 'name':` — friendly message with example |
| `scenario 'name':` inside `evals:` subsection with no input | Compiler error with example |
| Estimate modal dismissed | No run starts; UI returns to pre-run state |
| Running `run_eval` (single) with id that doesn't exist | Already handled: 200 + `ok:false, error: Unknown eval id` |
| User adds an eval while previous run's child is alive | Next Run All respawns child (source-hash change triggers rebuild) |
| **Real endpoint returns SSE (streaming)** | `runOneEval` detects `content-type: text/event-stream` and drains the stream to a concatenated string before grading. Format-check on SSE sees `{ text: "..." }` per chunk; after drain, treat as plain string output. |
| **Endpoint requires auth (has `requires login`)** | Eval runner sends `Authorization: Bearer <JWT_SECRET-signed dev token>` — same token Studio's e2e test harness uses. When auth is required and no Clear auth system is in source, runner logs a warning and proceeds unauthenticated. |
| **Endpoint returns non-JSON non-SSE (HTML, binary)** | Runner captures raw text, status=fail, feedback="Endpoint returned non-JSON response" |
| **Source has an endpoint literally matching `/_eval/...`** | Validator error at compile time: "Endpoint path `/_eval/...` collides with eval-mode synthetic routes. Rename to avoid `/_eval/` prefix." |
| **User edits source mid-run** | `runEvalSuite` is holding the mutex; the edit lands, but the current run completes with the old serverJS. Next Run rebuilds from new source. |
| **Studio SIGINT with eval child alive** | `process.on('SIGINT', killEvalChild)` + `process.on('exit', killEvalChild)` — no orphan children on Ctrl-C |
| **Compound object input without required fields on the agent** | Agent's `check X is not missing, otherwise error` fires; runner sees 500; surfaces as fail with body |
| **Streaming agent behind tool-use guardrail** | Tool-using agents are NON-streaming by design (see compiler.js ~line 2840). Runner handles them via plain await path; no special case needed. |
| **Agent calls another agent that's streaming from inside a non-streaming caller** | Already fixed in Session 30 (`compileToJSBackend` wraps streaming RUN_AGENT calls with IIFE collector). Eval runner sees finished string, not async iterator. |
| **Eval child port 4999 already bound** | Bind failure propagates; `ensureEvalChild` rejects with "Port 4999 in use — kill the process or restart Studio". UI surfaces the error in the summary row. |

---

## Section 6 — ENV VARS

None new. Existing `ANTHROPIC_API_KEY` drives grading; `EVAL_MODEL` already present (default `claude-sonnet-4-20250514`). Adding optional `EVAL_TEMPERATURE` (default `0`) for users who want to dial variance up.

---

## Section 7 — Files to Create

No new files. All work is additive to existing files. The one exception is the markdown/CSV export — those are runtime-generated strings, not files on disk.

(If exec finds tests need a helper module for probe-dictionary data, that goes in `lib/probeDictionary.js`. Decision made during Phase 1.)

---

## Section 8 — Files to Modify

Using drift-safe markers.

| File | Anchor | Change |
|------|--------|--------|
| `compiler.js` | `function generateEvalSuite(body)` (after ~line 1990) | Replace `sampleInput` with `buildProbe(agent, tables, prompts)`; attach `probeQuality: 'real' \| 'generic'` |
| `compiler.js` | `export function compile(ast, options = {})` (around line 878) | Add `evalMode` option threading; under backend target, emit `/_eval/*` handlers natively |
| `compiler.js` | `generateEvalSuite` body | Accept `userEvals` list, merge into returned suite with `source: 'user-top' \| 'user-agent'` |
| `parser.js` | NodeType enum (~line 139) | Add `EVAL_DEF: 'eval_def'` |
| `parser.js` | Top-level dispatch (search for `'test'` registrant) | Register `'eval'` as analogous top-level block |
| `parser.js` | Agent body directive loop (search for `knows about`) | Detect `evals:` subsection; parse indented `scenario 'name':` children |
| `parser.js` | New helper `parseEvalBlock(lines, startIdx, ...)` near `parseTest` | Parses body: `given X receives Y:` or `call <endpoint> with Y:` then `expect <rubric or shape>` |
| `synonyms.js` | Table near `can` | Add `eval` as canonical; plus multi-word `given`, `scenario`, `expect response has` as needed. Bump `SYNONYM_VERSION` to 0.28.0 |
| `validator.js` | Reference-check pass | Warn if a user eval references an unknown agent/endpoint |
| `playground/server.js` | line 530 `async function callEvalEndpoint` | Detect streaming responses via `content-type: text/event-stream`; when streaming, read `response.body` chunks, parse `data: {...}\n\n` lines, concatenate `text` fields into a single string, return `{status, data: <concatenated-string>, streamed: true}`. JSON endpoints unchanged. |
| `playground/server.js` | line 478 `async function gradeWithClaude` | Add `temperature: 0`; capture `graderRaw`; compute `usage.costUSD` from `data.usage` (inTok × $0.003/1K + outTok × $0.015/1K for sonnet-4) |
| `playground/server.js` | `runEvalSuite` | (a) On `id == null` (full run): kill+respawn child to wipe DB. (b) Sum `results[].usage.costUSD` → `total_cost_usd` |
| `playground/server.js` | Below `/api/run-eval` | Add `app.post('/api/eval-suite-estimate', …)`: returns `{evals_to_grade, suite_size, estimated_cost_usd, estimated_duration_seconds}` |
| `playground/server.js` | Below estimate endpoint | Add `app.post('/api/export-eval-report', …)` that accepts `{source, format: 'md' \| 'csv', results, suite, meta: {timestamp, totalCostUsd}}` and returns file with `Content-Type: text/markdown` or `text/csv` + `Content-Disposition: attachment; filename=eval-report-<source-hash>-<timestamp>.<ext>`. The handler recomputes the source hash to detect staleness — if `results` was produced against a different hash, the export includes a `⚠ Source changed since this run` banner at top. |

**CSV export column spec (explicit order, comma-separated, double-quoted strings, newline rows):**

```
id,kind,agent_name,status,score,pass,duration_ms,cost_usd,input_tokens,output_tokens,endpoint_path,synthetic,feedback,source
role-researcher,role,Researcher,pass,8,true,1240,0.0027,412,98,/_eval/agent_researcher,true,"Clear answer on topic",auto
...
```

Feedback field: newlines escaped as `\n`, double-quotes escaped as `""`.
Large fields (full input, full output, grader raw) are omitted from CSV to keep rows scannable — they live in the markdown report.

**Markdown export template (exact structure, generated from `results`):**

```markdown
# Eval Report — <app name from first `page 'X'` block or filename>

- Run at: <timestamp ISO>
- Source hash: <first 8 chars>
- Total cost: $<total_cost_usd>  (<total_input_tokens> input / <total_output_tokens> output tokens)
- Duration: <duration>s
- Summary: <passed> pass, <failed> fail, <skipped> skip (out of <suite_size>)

## <Agent name>

### <kind badge> — <label>

**Status:** <pass/fail/skip> <score if any>
**Cost:** $<cost_usd> (<inTok>/<outTok> tokens)

**Criteria:**
<rubric or expected-shape>

**Input:**
```json
<pretty-printed input>
```

**Output:**
```json
<pretty-printed output, truncated to 4000 chars with … marker if longer>
```

**Grader feedback:**
<feedback>

**Grader raw response:**
```
<graderRaw if any>
```

---
```
| `playground/server.js` | `ensureEvalChild` + `injectEvalEndpoints` | After Phase 7: DELETE `injectEvalEndpoints`; use `compileProgram(source, {evalMode:true}).serverJS` directly |
| `playground/ide.html` | `runEvals` client fn | Pre-fetch `/api/eval-suite-estimate`; show modal; only POST `/api/run-eval` on confirm |
| `playground/ide.html` | `renderEvalSection` | Add cost chip per row; add running total in header; add "Export ▾" button |
| `playground/ide.html` | Detail panel block assembly | Add `Grader raw response` block (verbatim preformatted), `Tokens + cost` block |
| `playground/ide.html` | New `exportEvalReport(format)` fn | POST to `/api/export-eval-report`, receive blob, trigger browser download |

---

## Section 9 — Pre-Flight Checklist

- [ ] `learnings.md` exists at project root (create from template if missing)
- [ ] On `feature/awesome-evals` branch
- [ ] Full compiler test suite passes at start: `node clear.test.js` → 1884+ green
- [ ] Server test suite baseline recorded (16 pre-existing fails are inherited, not new)
- [ ] Bundle rebuilt before merging: `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js`
- [ ] ANTHROPIC_API_KEY set in dev env for graded-path verification (graded path is gate-able via skip if unset)

### Test matrix

| Scenario | Local (Studio) | Script (node) |
|----------|---------------|---------------|
| Probe quality on multi-agent-research | ✓ visual check rows | ✓ clear.test.js asserts probe field presence |
| Top-level `eval 'name':` syntax | ✓ shows in pane | ✓ clear.test.js parses + compiles |
| `evals:` subsection | ✓ shows in pane under agent | ✓ clear.test.js parses + compiles |
| DB reset between Run All | ✓ run twice, second = first | ✓ server.test.js spawns child twice |
| Cost modal → confirm → run | ✓ manually | ✓ server.test.js /api/eval-suite-estimate |
| Export MD + CSV | ✓ download + open | ✓ server.test.js endpoint returns correct content-type + disposition |
| `evalMode` native emit | N/A | ✓ clear.test.js inspects compiled output |
| Grader temp=0 + raw capture | ✓ detail panel | ✓ server.test.js sees graderRaw field |

---

## Section 10 — TDD Cycles

**Convention:** each cycle = 🔴 failing test → 🟢 minimal code → 🔄 refactor → commit.

### PHASE 1 — Rich auto-probes

| # | Action | Command |
|---|--------|---------|
| 1.1 | 🔴 Add test: `Researcher` probe includes realistic `question` text (>10 chars, not 'hello') | `node clear.test.js --grep probe` |
| 1.2 | 🟢 Extend probe dict; add `buildProbeFromReceivingVar` | — |
| 1.3 | 🔴 Add test: `Screener` probe matches `Candidates` table schema fields when table exists in source | same |
| 1.4 | 🟢 Table-aware probe builder (walks `CREATE_TABLE` nodes in source for receiving var plural → schema) | — |
| 1.5 | 🔴 Add test: probes built from prompt hints — if `ask claude '...company...'`, probe has `company` field | same |
| 1.6 | 🟢 Scan ask-claude prompts for noun hints; merge into probe | — |
| 1.7 | 🔴 Add test: `probeQuality` field is `'real'` for known var, `'generic'` for unknown fallback | same |
| 1.8 | 🟢 Attach `probeQuality` to spec; generic only when all hints miss | — |
| 1.9 | 🔴 Smoke: compile every template; assert no probe is bare `'hello'` except for agent with no-signal receiving var | same |
| 1.10 | 🟢 Fill probe-dict gaps surfaced by smoke | — |
| 1.11 | 📚 Run update-learnings: Probe quality lessons | — |
| 1.12 | ✅ Commit: `feat(evals): rich auto-probes — receiving var + table schema + prompt hints` | — |

### PHASE 2 — Top-level `eval 'name':` block

| # | Action | Command |
|---|--------|---------|
| 2.1 | 🔴 Test: parser emits `NodeType.EVAL_DEF` for `eval 'name':` source with `given` + `expect` | `node clear.test.js --grep 'eval block'` |
| 2.2 | 🟢 Add `EVAL_DEF` to NodeType; write `parseEvalBlock`; register top-level `'eval'` keyword + synonym | — |
| 2.3 | 🔴 Test: user eval merges into `result.evalSuite` with `source: 'user-top'` | same |
| 2.4 | 🟢 `generateEvalSuite` accepts `userEvals` list; spreads in | — |
| 2.5 | 🔴 Test: user eval with `call POST /api/x with ...` + `expect output has field` compiles to format-style check (deterministic path) | same |
| 2.6 | 🟢 Compile path translates user eval body into runnable spec | — |
| 2.7 | 🔴 Test: validator warns on reference to unknown agent | same |
| 2.8 | 🟢 `validator.js` reference-check | — |
| 2.9 | 🔴 Test: `eval 'foo':` with no body errors with helpful message | same |
| 2.10 | 🟢 Error with example in parser | — |
| 2.11 | 📚 Run update-learnings | — |
| 2.12 | ✅ Commit: `feat(evals): top-level eval 'name': block syntax` | — |

### PHASE 3 — Per-agent `evals:` subsection

| # | Action | Command |
|---|--------|---------|
| 3.1 | 🔴 Test: `agent X: ... evals: scenario 'y': input is Z; expect Q` parses; attaches to agent node | `node clear.test.js --grep 'evals subsection'` |
| 3.2 | 🟢 Detect `evals:` directive in agent body parser; parse `scenario` children | — |
| 3.3 | 🔴 Test: agent's `evals:` scenarios appear in `result.evalSuite` with `source: 'user-agent'`, `agentName` set | same |
| 3.4 | 🟢 `generateEvalSuite` pulls from each agent's `.evalScenarios` | — |
| 3.5 | 🔴 Test: scenario input overrides auto-probe for that agent | same |
| 3.6 | 🟢 Probe builder gives way when scenario provides input | — |
| 3.7 | 📚 Run update-learnings | — |
| 3.8 | ✅ Commit: `feat(evals): per-agent evals: subsection with scenarios` | — |

### PHASE 4 — DB reset between eval runs + concurrency + SSE handling

| # | Action | Command |
|---|--------|---------|
| 4.1 | 🔴 Test: after `/api/run-eval` (full), any clear-data.db* files are wiped and re-created | `node playground/server.test.js --grep 'db reset'` |
| 4.2 | 🟢 `runEvalSuite` on full run: force child kill; `ensureEvalChild` is fresh | — |
| 4.3 | 🔴 Test: single-eval run (with `id`) does NOT reset DB (fast re-run semantics) | same |
| 4.4 | 🟢 Reset path gated on `!id` | — |
| 4.5 | 🔴 Test: two concurrent `/api/run-eval` calls (full + single) serialize — neither crashes, both return valid results | `node playground/server.test.js --grep 'eval mutex'` |
| 4.6 | 🟢 Add `_evalMutex` promise chain around `runEvalSuite` body | — |
| 4.7 | 🔴 Test: SIGINT/exit handler kills the eval child (process.on registered, killEvalChild invoked) | `node playground/server.test.js --grep 'eval cleanup'` — uses a stubbed event emitter to assert the handler exists |
| 4.8 | 🟢 Register `process.on('SIGINT', killEvalChild)` + `process.on('exit', killEvalChild)` near the other process handlers | — |
| 4.9 | 🔴 Test: `callEvalEndpoint` given an SSE response drains the stream and returns a concatenated string in `data` | `node playground/server.test.js --grep 'sse drain'` — uses a stub endpoint that writes `data: {"text":"hello "}\n\ndata: {"text":"world"}\n\n` |
| 4.10 | 🟢 Detect `content-type: text/event-stream` in callEvalEndpoint; read body, parse `data:` lines, concatenate `text` fields | — |
| 4.11 | 🔴 Test: `runOneEval` using a streaming endpoint passes format check on `non-empty` (no longer spuriously fails) | same |
| 4.12 | 🟢 Confirm format-check logic works on the drained string (should Just Work after 4.10) | — |
| 4.13 | 📚 Run update-learnings | — |
| 4.14 | ✅ Commit: `feat(evals): wipe DB between full runs + mutex + SIGINT cleanup + SSE drain` | — |

### PHASE 5 — Cost visibility

| # | Action | Command |
|---|--------|---------|
| 5.1 | 🔴 Test: `/api/eval-suite-estimate` returns `{evals_to_grade, estimated_cost_usd, suite_size}` | `node playground/server.test.js --grep estimate` |
| 5.2 | 🟢 Endpoint implementation: count role+e2e specs × typical tokens × price | — |
| 5.3 | 🔴 Test: `gradeWithClaude` result includes `usage: {inTok, outTok, costUSD}` | `node clear.test.js --grep 'grader usage'` (stubbed fetch) |
| 5.4 | 🟢 Parse `data.usage` from Claude response; compute cost | — |
| 5.5 | 🔴 Test: `runEvalSuite` result includes `total_cost_usd` (sum across results) | server.test |
| 5.6 | 🟢 Sum in runner | — |
| 5.7 | 🖥️ Client: add estimate-gate modal; abort run if user dismisses | manual |
| 5.8 | 🖥️ Client: render per-row cost chip + header running total | manual |
| 5.9 | 📚 Run update-learnings | — |
| 5.10 | ✅ Commit: `feat(evals): cost estimate + per-eval tokens/cost + running total` | — |

### PHASE 6 — Exportable report

| # | Action | Command |
|---|--------|---------|
| 6.1 | 🔴 Test: `/api/export-eval-report` with `format=md` returns text/markdown + Content-Disposition | `node playground/server.test.js --grep export` |
| 6.2 | 🟢 Markdown generator (groups by agent; includes rubric, input, output, status, feedback, cost, timestamp, source-hash) | — |
| 6.3 | 🔴 Test: `format=csv` returns text/csv with one row per eval | same |
| 6.4 | 🟢 CSV generator | — |
| 6.5 | 🔴 Test: export before any run returns 4xx with `{error: 'no results to export'}` | same |
| 6.6 | 🟢 Guard | — |
| 6.7 | 🖥️ Client: Export ▾ dropdown; triggers browser download | manual |
| 6.8 | 📚 Run update-learnings | — |
| 6.9 | ✅ Commit: `feat(evals): export suite as markdown + csv` | — |

### PHASE 7 — `evalMode` compile option (delete regex splice)

| # | Action | Command |
|---|--------|---------|
| 7.1 | 🔴 Test: `compile(ast, {evalMode:true})` emits serverJS that CONTAINS `app.post('/_eval/agent_*')` handlers without any regex-splice | `node clear.test.js --grep 'evalMode native'` |
| 7.2 | 🟢 Thread `evalMode` through `compile` → `compileToJSBackend`; emit handlers at end of routes section | — |
| 7.3 | 🔴 Test: without `evalMode`, no `/_eval/*` handlers present (regression guard, named template: `apps/multi-agent-research/main.clear` compiled WITHOUT flag has zero `/_eval/` occurrences) | same |
| 7.4 | 🟢 Confirm guard passes (should need no code if flag threading is correct) | — |
| 7.5 | 🔴 Test: validator error when source declares an endpoint starting with `/_eval/` | `node clear.test.js --grep '_eval collision'` |
| 7.6 | 🟢 Add reserved-prefix check to `validator.js` validateEndpoints pass | — |
| 7.7 | 🟢 Server: delete `injectEvalEndpoints` (line 422); `ensureEvalChild` calls `compileProgram(source, {evalMode:true})` directly; no more `evalEndpointsJS` field | — |
| 7.8 | 🔴 Test: run the full multi-agent-research eval suite end-to-end through the new path and assert every `/_eval/agent_*` route resolves to the correct agent function | server.test |
| 7.9 | 🔴 Test: all 8 core templates compile WITHOUT `evalMode` produce 0 errors and zero `/_eval/` in serverJS (smoke matrix) | `node clear.test.js --grep 'core templates evalMode off'` |
| 7.10 | 🧹 Cleanup: remove `result.evalEndpointsJS` field from compiler exports | — |
| 7.11 | 📚 Run update-learnings | — |
| 7.12 | ✅ Commit: `refactor(evals): synthetic endpoints emitted natively via evalMode; remove regex splice; validator prevents /_eval/ collision` |

### PHASE 8 — Grader improvements + Gemini support

**Why Gemini:** Red-team flagged "Claude grading Claude" as a structural concern — the grader shares training lineage with the agents being graded, introducing sympathetic failure modes. Supporting Gemini (and OpenAI by extension) as an alternate grader gives users a genuinely independent signal. Anthropic stays the default so the zero-config path works with the key Studio already uses.

**New env vars:**
- `EVAL_PROVIDER` — `'anthropic'` (default), `'google'` / `'gemini'`, `'openai'`. If unset, uses Anthropic.
- `GOOGLE_API_KEY` — Gemini API key when `EVAL_PROVIDER=google`.
- `OPENAI_API_KEY` — OpenAI API key when `EVAL_PROVIDER=openai`.
- `EVAL_MODEL` — provider-specific model id. Defaults: `claude-sonnet-4-20250514` / `gemini-1.5-pro` / `gpt-4o-mini`.
- `EVAL_TEMPERATURE` — stays 0 by default across all providers.

**Per-provider pricing (USD per 1K tokens):**

```js
const PROVIDER_PRICING = {
  anthropic: { input: 0.003, output: 0.015 },   // claude-sonnet-4
  google:    { input: 0.00125, output: 0.005 }, // gemini-1.5-pro
  openai:    { input: 0.00015, output: 0.0006 }, // gpt-4o-mini
};
```

Cost estimates + per-eval costs compute against the active provider's pricing.

**Rename `gradeWithClaude` → `gradeWithJudge`**. Provider-agnostic. Dispatches on `EVAL_PROVIDER`. Each provider handler:
- Builds the grader prompt (same text for all three — prompt portability is the point)
- Hits the provider's API endpoint
- Parses the `{pass, score, feedback}` JSON from the response
- Returns `{pass, score, feedback, graderRaw, usage: {inTok, outTok, costUSD, provider, model}}`

**Graceful fallback:** if `EVAL_PROVIDER=google` but `GOOGLE_API_KEY` missing, return `{skipped: true, reason: "GOOGLE_API_KEY not set — set it or switch EVAL_PROVIDER back to anthropic"}`.

| # | Action | Command |
|---|--------|---------|
| 8.1 | 🔴 Test: `gradeWithJudge` sends `temperature: 0` in request body (Anthropic provider) | stubbed fetch in server.test |
| 8.2 | 🟢 Rename `gradeWithClaude` → `gradeWithJudge`; add `temperature: parseFloat(process.env.EVAL_TEMPERATURE ?? '0')` to all provider calls | — |
| 8.3 | 🔴 Test: `graderRaw` present in result (full text, before JSON extract) | same |
| 8.4 | 🟢 Capture raw before parse; include in return | — |
| 8.5 | 🔴 Test: `EVAL_PROVIDER=google` routes to Gemini endpoint (stubbed fetch); `/v1beta/models/gemini-1.5-pro:generateContent?key=...` | same |
| 8.6 | 🟢 Add Gemini provider: endpoint + request body format (`contents: [{parts:[{text}]}]`) + response parsing (`candidates[0].content.parts[0].text`) + usage accounting (`usageMetadata.promptTokenCount`/`candidatesTokenCount`) | — |
| 8.7 | 🔴 Test: missing `GOOGLE_API_KEY` when `EVAL_PROVIDER=google` → `skipped:true` with reason mentioning the env var | same |
| 8.8 | 🟢 Per-provider key check at top of `gradeWithJudge` | — |
| 8.9 | 🔴 Test: `EVAL_PROVIDER=openai` routes to OpenAI endpoint; usage math matches pricing table | same |
| 8.10 | 🟢 Add OpenAI provider (chat completions API; response at `choices[0].message.content`; `usage.prompt_tokens`/`completion_tokens`) | — |
| 8.11 | 🔴 Test: per-provider pricing yields correct `costUSD` (stubbed response with known token counts for each provider) | same |
| 8.12 | 🟢 `PROVIDER_PRICING` map; compute cost based on `EVAL_PROVIDER` | — |
| 8.13 | 🖥️ Client: add "Grader raw response" detail block; verbatim `<pre>`. Show `provider` + `model` in the header so user knows what graded | manual |
| 8.14 | 🖥️ Client: if `EVAL_PROVIDER` is set server-side, surface it in the estimate modal ("Grader: Gemini 1.5 Pro") so user knows before paying | manual |
| 8.15 | 📄 Docs: AI-INSTRUCTIONS.md "Writing Evals" section documents `EVAL_PROVIDER` options + cost implications + when to use each. Landing page adds "Swap graders to break the Claude-grading-Claude loop" as a bullet in the agent eval section. | — |
| 8.16 | 📚 Run update-learnings (grader bias note + multi-provider gotchas) | — |
| 8.17 | ✅ Commit: `feat(evals): grader temp=0 + raw response + multi-provider (Anthropic/Gemini/OpenAI)` |

**Risks specific to Gemini:**
- Safety filters can refuse outputs → parsed as `{pass:false, feedback:'Gemini refused with safety reason X', graderRaw:<full safety-block response>}`. Test coverage for this path.
- Free tier rate limits are tighter (5 RPM for Gemini Pro) → eval runs on free tier will throttle; surface a warning if 429 returns.
- Response JSON may not be valid on first try; both `candidates[0].finishReason === 'STOP'` check and JSON extract fallback preserved.

### PHASE 9 — Docs + tests + landing

| # | Action | Command |
|---|--------|---------|
| 9.1 | 📄 `SYNTAX.md` — add `eval 'name':` + `evals:` subsection under AI Agents | — |
| 9.2 | 📄 `AI-INSTRUCTIONS.md` — "Writing Evals" section with examples; mention cost gating + export + probe overrides | — |
| 9.3 | 📄 `USER-GUIDE.md` — Chapter 10 subsection "Grading Your Agents" with walkthrough | — |
| 9.4 | 📄 `intent.md` — `EVAL_DEF` row; probe + cost notes | — |
| 9.5 | 📄 `ROADMAP.md` — "Agent eval suite" row marked Complete | — |
| 9.6 | 📄 `playground/system-prompt.md` — Meph's tool section gets richer: how to read eval suite, when to run singles, cost awareness | — |
| 9.7 | 📄 `landing/business-agents.html` — insert a new `<section>` BEFORE the guard-card grid (search for `Tool validation`). Section content: headline "Every agent auto-graded. No test writing." + 3 bullets in the same card style already used on the page (a) "Every agent gets a role + format eval from its source definition", (b) "Claude grades against your own prompts + skills + guardrails", (c) "Export to markdown or CSV for audit, CI, or regression tracking over time." Include a code-block preview of 2 eval rows rendered. Preserve all existing sections below. | — |
| 9.8 | 🖥️ Smoke: verify `apps/multi-agent-research` runs all acceptance bullets end-to-end | manual walk |
| 9.9 | 🔨 Rebuild bundle | `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js` |
| 9.10 | 🧪 Full green: `node clear.test.js` + `node playground/server.test.js` (ignore inherited 16 fails) | — |
| 9.11 | 📚 Run update-learnings (final pass across all phases) | — |
| 9.12 | ✅ Commit: `docs(evals): full feature docs + landing update + bundle rebuild` |

---

## Section 11 — Logging tags

All new logs use `[EVALS]` prefix. Examples:
- `[EVALS] estimate: 9 gradeable specs, ~$0.15`
- `[EVALS] probe: built from schema for <agent>`
- `[EVALS] grader: score=7 pass=true cost=$0.018`
- `[EVALS] db reset before full run`

---

## Section 12 — Test Run Order

1. `node clear.test.js` — every phase, after every cycle (fast, ~3s)
2. `node playground/server.test.js` — Phases 4/5/6/7 (medium, ~8s, flaky on 16 pre-existing)
3. Manual Studio walkthrough — Phase 9 only (the acceptance test is here)

---

## Section 13 — Browser Checklist (Phase 9 only)

Studio at `node playground/server.js`, load `apps/multi-agent-research/main.clear`:
- [ ] Tests tab > Run Evals opens estimate modal with correct count + dollar amount
- [ ] Confirm → 17 rows populate (auto + any user-defined)
- [ ] Each row has kind badge, status, Run button, cost chip (after grading)
- [ ] Failed rows auto-expand, "Why it failed" first in detail
- [ ] Click a passing row — see rubric, input, output, grader raw, tokens, cost
- [ ] Add `eval 'Topic turns into report': given Research Topic receives 'quantum computing'; expect 'response includes a structured report about quantum computing'` at top of source
- [ ] Re-run — new row appears with source=user-top
- [ ] Add `evals:` subsection inside Researcher with `scenario 'Short question handled':`
- [ ] Re-run — new row appears with source=user-agent, under Researcher's rows
- [ ] Summary row shows running cost total after run
- [ ] Export ▾ → Markdown — file downloads, opens cleanly, groups by agent
- [ ] Export ▾ → CSV — opens in spreadsheet with rows matching suite
- [ ] Run single eval via Run button on row — cheap (no DB reset), fast
- [ ] DB reset on next Run All (verify by checking Reports table row count)

---

## Section 14 — Success Criteria

Same as "Acceptance Criterion" at the top. Plus:
- 1884 + ~40 new tests passing
- Zero new server.test.js regressions beyond the 16 inherited
- Documentation gate: all 6 doc files updated with new syntax
- Landing page updated
- Bundle rebuilt
- `multi-agent-research` demo produces a real, useful eval report

---

## Section 15 — Exported Tool Surfaces (matches existing Meph list)

No new Meph tools needed. Existing `list_evals`, `run_evals`, `run_eval` cover user-defined evals too (they're in `result.evalSuite` just like auto-gen). Update descriptions in Phase 9.9 to mention user-defined support.

---

## Section 16 — Risk Register

| Risk | Mitigation |
|------|------------|
| Probe builder over-engineered | Rule: <100 lines of probe code total. If bigger, simplify. |
| User eval syntax debated | Russell already answered — both syntaxes. Don't relitigate. |
| Cost tokens wrong — Anthropic pricing drifts | Constant at top of server.js; doc how to update; test assertion on known usage math |
| Grader temperature=0 makes it too deterministic / too strict | Expose via `EVAL_TEMPERATURE` env var with sensible default |
| Export format changes bite consumers | Markdown format is documented; CSV header row explicit |
| Studio server test flakiness masks regressions | Run targeted `--grep` per phase; full run only at end |
| **Probe dict drift** — new apps introduce receiving var names not in dict | Phase 1's smoke test compiles all 8 core templates + multi-agent-research; any `'hello'` fallback on a common var (question, topic, lead, candidate, message, ticket, text, claim, item, draft, findings, questions, items) = test fail. Dict must be kept current. |
| **Grader bias** (Claude grading Claude) | Expose `EVAL_MODEL` env var so users can swap to a different model. Document the bias risk in AI-INSTRUCTIONS.md eval section. Flag in the markdown report footer. |
| **Eval run cost surprise** | Modal estimate gate before Run All. Per-eval cost chips on every row. Running total in summary. `run_eval` single-eval path is not gated (trivial cost). |
| **Phase 7 regression — real apps break** | Phase 7.9 compiles all 8 core templates WITHOUT evalMode and asserts zero /_eval/ leakage. Cannot merge Phase 7 without this passing. |
| **SSE endpoints fail format check spuriously** | Phase 4.9–4.12 adds SSE-drain to `callEvalEndpoint`. Without this fix, Polished Report's role eval (if exposed via streaming endpoint) would fail every run. |
| **Orphan eval children on Studio crash** | `process.on('SIGINT', killEvalChild)` + `process.on('exit', killEvalChild)` in Phase 4.7–4.8 |
| **Compound input parsing edge cases** | Parser reuses existing `create X: field is Y` block semantics. If Clear can parse `create record: name is 'X'`, it can parse `input is: name is 'X'`. Test coverage: Phase 2.5 + Phase 3.3 explicitly exercise compound inputs. |
| **`eval` keyword collides with user identifiers** | `eval` is already rare-ish in Clear source (we have 0 occurrences in 8 core templates). Tokenizer disambiguates by the `'...'` string following. Validator catches edge cases. |

---

## Section 17 — Copy-Paste to Continue (Resume Prompt)

```
Read HANDOFF.md, PHILOSOPHY.md, CLAUDE.md.

Executing plan-awesome-evals-04-15-2026.md. Branch feature/awesome-evals.

Session 30 shipped a first cut of agent evals (structured suite, synthetic
endpoints, UI, Meph tools). This plan extends: rich probes, user-defined
evals (two syntaxes), DB reset, cost visibility (modal + per-row), export
(md + csv), compile-option evalMode (no more regex splice), grader
temperature=0 with raw surfaced, full docs.

Acceptance: run evals on apps/multi-agent-research — fantastic feedback
end-to-end. Manual checklist is in the plan.

Test before each commit. Gate on green. Don't ship a phase with failing
tests.
```
