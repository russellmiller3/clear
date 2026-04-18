# Clear Internals FAQ

How the system works, where things live, and why we made key decisions.
Two sections: **Where is X?** (lookup) and **Why did we do X?** (decisions).

---

## Table of Contents

**Where is X?**
- [Where does a Meph session start and end?](#where-does-a-meph-session-start-and-end)
- [Where is the tool call log?](#where-is-the-tool-call-log)
- [Where does test quality get measured?](#where-does-test-quality-get-measured)
- [Where is session data stored?](#where-is-session-data-stored)
- [Where does the re-ranker get its training signal?](#where-does-the-re-ranker-get-its-training-signal)
- [Where does weak assertion lint run?](#where-does-weak-assertion-lint-run)
- [Where does the red-step check run?](#where-does-the-red-step-check-run)
- [Where does the compiler pipeline start?](#where-does-the-compiler-pipeline-start)
- [Where does Meph's system prompt live?](#where-does-mephs-system-prompt-live)
- [Where are Meph's tools defined?](#where-are-mephs-tools-defined)
- [Where does the sandbox runner live?](#where-does-the-sandbox-runner-live)
- [Where does the supervisor plan live?](#where-does-the-supervisor-plan-live)

**Why did we do X?**
- [Why does send back compile to return inside define function?](#why-does-send-back-compile-to-return-inside-define-function)
- [Why do user-defined functions shadow built-in aliases?](#why-do-user-defined-functions-shadow-built-in-aliases)
- [Why write the test before the function?](#why-write-the-test-before-the-function)
- [Why mechanical signals before ML for test quality?](#why-mechanical-signals-before-ml-for-test-quality)
- [Why a re-ranker before the sandbox, not after?](#why-a-re-ranker-before-the-sandbox-not-after)
- [Why is the supervisor plan GA-based?](#why-is-the-supervisor-plan-ga-based)

---

## Where is X?

### Where does a Meph session start and end?

`playground/server.js` — the `/api/chat` POST handler, starting around line 2124.

One request = one session. The handler receives `{ messages, editorContent, apiKey }`, streams SSE events back, and ends with `{ type: 'done' }`.

`currentSource` and `currentErrors` are scoped to the request handler — they track editor state across tool calls within that single session.

---

### Where is the tool call log?

Also in the `/api/chat` handler in `playground/server.js`.

`toolResults` is an array built up during the session. Each tool call appends to it. The server emits `tool_start` and `tool_done` SSE events to bracket each tool call — `tool_start` fires twice per call (once bare, once with a summary). Use a boolean `_inTool` flag to dedup, not an ID.

At session end, `toolResults` is sent with the `done` event.

---

### Where does test quality get measured?

Two places, two different signals:

**Weak assertion lint (static)** — `compiler.js`, inside the `UNIT_ASSERT` compile case. Checks the assertion pattern at compile time. Weak patterns: `is not empty`, `is not nothing`, `is true` (bare). Pushes to `r.warnings[]`. Not shown to Meph or end user — internal signal only.

**Red-step check (process)** — `playground/server.js`, end of `/api/chat` handler. Scans the tool call log: did `run_tests` ever return `ok: false` before the first `ok: true`? If not, flag it — Meph skipped the red step.

---

### Where is session data stored?

**Short term (not yet built):** `playground/sessions/[session-id].json` — one file per session, written at end of `/api/chat`.

**Medium term (supervisor plan, Phase 1):** `playground/sessions.db` — SQLite. Sessions table schema:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  task TEXT,
  status TEXT,         -- 'running' | 'done' | 'failed'
  started_at INTEGER,
  ended_at INTEGER,
  tool_calls TEXT,     -- JSON array
  test_results TEXT,   -- JSON array
  weak_assertion_count INTEGER,
  red_step_observed    BOOLEAN,
  final_source TEXT
);
```

---

### Where does the re-ranker get its training signal?

From the sessions table. Each completed session is one training example:

- **Features:** `error_category` (compile/test/runtime), `patch_op_type`, `node_types_touched`, `weak_assertion_count`, `red_step_observed`
- **Label:** did the final `run_tests` show `ok: true`?

Short term: structured features only, no embeddings. XGBoost or similar. Works with ~200 examples.

Medium term: add embedding of the compiled JS diff (not raw Clear — JS has massive training data behind existing models). Use `text-embedding-3-small` on the before/after diff.

Long term: once you have 5k+ sessions, fine-tune on Clear specifically.

---

### Where does weak assertion lint run?

`compiler.js` — in the `UNIT_ASSERT` compile case. The compiler already parses `expect X is Y` into `UNIT_ASSERT` nodes with `left`, `check`, and `right` fields.

Weak patterns to flag:
- `check === 'neq'` AND `right` is `nothing` or `empty` → weak
- `check === 'eq'` AND `right` is `true` (bare, no context) → weak
- Single assertion in entire test block → yellow flag

Output goes into `r.warnings[]`. Same infrastructure as existing lint warnings from `clear lint`.

---

### Where does the red-step check run?

`playground/server.js`, at the end of the `/api/chat` handler — after the `done` event is assembled but before the response closes.

Logic:
```js
const testCalls = toolResults.filter(t => t.name === 'run_tests');
const redStepObserved = testCalls.some(t => t.result?.ok === false || t.result?.error);
```

This mirrors the assertion logic in `playground/test-tdd-loop.js`, which is the integration test for the full TDD loop.

---

### Where does the compiler pipeline start?

`index.js` — `compileProgram(source)` is the public entry point.

Pipeline: `tokenizer.js` → `parser.js` → `validator.js` → `compiler.js`

Each stage returns a structured object. The compiler's `compileNode()` and `exprToCode()` handle all node types. Context object `{ lang, indent, declared, stateVars, mode, insideFunction, insideAgent }` threads through compilation.

Key flag: `insideFunction: true` must be passed to `compileBody` inside `FUNCTION_DEF` so `send back` compiles to `return` instead of `res.json`.

---

### Where does Meph's system prompt live?

`playground/system-prompt.md` — loaded fresh on every `/api/chat` request. Edit this file to change Meph's behavior. Changes take effect immediately without restarting the server.

After any change to this file, run `node playground/eval-meph.js` to verify the 16 tool scenarios still pass.

---

### Where are Meph's tools defined?

`playground/server.js` — the `TOOLS` array, starting around line 1772. Each tool has:
- `name` — what Meph calls
- `description` — what Meph reads to decide when to use it
- `input_schema` — validated before execution

Tool execution is in `executeTool(name, input)` in the same file. New tools need an entry in both places. Validator is `validateToolInput(name, input)`.

---

### Where does the sandbox runner live?

`playground/server.js` — the eval child process infrastructure. Key functions:
- `ensureEvalChild()` — spawns a child server on port 4999 if not running
- `killEvalChildAndWait()` — graceful shutdown with 2s SIGKILL fallback + 200ms grace (Windows holds ports briefly after process exit)
- `EVAL_IDLE_MS` — idle timeout, set to 300s (must exceed longest eval suite)

Integration tests: `playground/test-tdd-loop.js` — drives a live Meph session end-to-end and asserts the TDD sequence happened correctly.

---

### Where does the supervisor plan live?

`plans/plan-supervisor-multi-session-04-17-2026.md`

Covers: session registry, supervisor loop, task distribution, merge step, shared memory, observability, GA-based candidate generation, re-ranker, and mechanical quality signals. Red-teamed. Not yet implemented.

Branch when ready: `feature/supervisor-multi-session`

---

## Why did we do X?

### Why does send back compile to return inside define function?

`send back` is Clear's one keyword for "give a value back." Inside an HTTP endpoint, that means `res.json()`. Inside a `define function` block, it means a plain `return`.

The compiler uses `ctx.insideFunction: true` (set by the `FUNCTION_DEF` compile case) to route `compileRespond()` to the right path. Without it, every function silently emitted HTTP response code and crashed at runtime when called from a test block.

The fix is two lines. The bug was silent for months because nobody tested the function→test-block call chain end-to-end.

---

### Why do user-defined functions shadow built-in aliases?

If you name a function `sum`, Clear's synonym table maps `sum` to `_clear_sum` (the built-in array-sum helper). Your function was silently rerouted.

Fix: `_findUserFunctions()` pre-scans the AST for all `FUNCTION_DEF` nodes at compile time, building a Set of user-defined names. In `exprToCode()` CALL resolution, user-defined names are checked first — before `mapFunctionNameJS()`. User always wins.

This mirrors how lexical scoping works: inner scope shadows outer. Applies to any built-in alias collision (`sum`, `max`, `min`, etc.).

---

### Why write the test before the function?

Two reasons.

**Practical:** it forces you to state what "done" looks like before writing code. The test is a frozen spec. You can't game it by writing code first and then writing a test that passes your code — the test was written before the code existed.

**Research:** the test becomes a machine-readable oracle. In the supervisor/GA loop, the fitness function for each candidate is "does it pass the tests Meph wrote first?" No human judgment needed. The agent authors its own success criterion.

This is what makes Clear's approach different from other coding agents. Cursor generates and you validate. Clear generates, self-validates, and the validation is written before the generation.

---

### Why mechanical signals before ML for test quality?

ML needs labeled training data. You don't have it yet.

Mechanical signals (weak assertion patterns, red-step check) are deterministic — no training required. They produce a quality score immediately.

As sessions accumulate, each scored session becomes a labeled training example: (features, quality_score) → (sandbox_outcome). Once you have ~200 examples, you can train a re-ranker. The mechanical signals bootstrap the ML signal.

The mechanical signals never go away — they become features in the learned model rather than the whole model.

---

### Why a re-ranker before the sandbox, not after?

The sandbox (compile + run + test) is expensive — 5–30 seconds per candidate, real compute cost.

The GA generates N candidates. Without filtering, you run all N. With a re-ranker, you run only the top K that the re-ranker predicts will pass.

The re-ranker is cheap (milliseconds, no subprocess). It predicts: "given this error type and this patch type, how likely is success?" Even a weak re-ranker that's right 60% of the time cuts sandbox cost significantly.

The re-ranker is trained on past (error, patch, outcome) triples from the sessions table. Every sandbox run, win or lose, is a new training example.

---

### Why is the supervisor plan GA-based?

Standard beam search over patch sequences hits a wall: it exploits what works and stops exploring. You get local optima fast.

A genetic algorithm adds recombination — splice two successful patch sequences together to get a candidate neither parent would have produced alone. Plus LLM-as-mutation (AlphaEvolve/FunSearch pattern): the LLM rewrites one patch-op differently, validated by Jaccard similarity before sandbox eval.

MAP-Elites preserves diversity: a behavioral grid where each cell (task_type × error_category) keeps its best-fitness resident. Convergence is detected when >80% of cells are stable for 3 generations.

This matters because the long tail of hard tasks (L7–L10 in the curriculum) requires exploration, not just exploitation. Beam search finds discount calculators. GA finds the edge cases.
