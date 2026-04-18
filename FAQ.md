# Clear FAQ

How the system works, where things live, and why we made key decisions.
Search this before grepping. If the answer isn't here, add it after you find it.

**For RL, self-play, re-ranker architecture, and the oracle problem — see [RESEARCH.md](RESEARCH.md).**

---

## Table of Contents

**Where is X?**
- [Where does the Studio server run?](#where-does-the-studio-server-run)
- [What ports does everything use?](#what-ports-does-everything-use)
- [Where does a compiled app run?](#where-does-a-compiled-app-run)
- [What is BUILD_DIR?](#what-is-build_dir)
- [Where does a Meph session start and end?](#where-does-a-meph-session-start-and-end)
- [Where is the tool call log?](#where-is-the-tool-call-log)
- [Where are Meph's tools defined?](#where-are-mephs-tools-defined)
- [Where does Meph's system prompt live?](#where-does-mephs-system-prompt-live)
- [Where does the compiler pipeline start?](#where-does-the-compiler-pipeline-start)
- [What does compileProgram() return?](#what-does-compileprogram-return)
- [Where does test quality get measured?](#where-does-test-quality-get-measured)
- [Where is session data stored?](#where-is-session-data-stored)
- [Where does the re-ranker get its training signal?](#where-does-the-re-ranker-get-its-training-signal)
- [Where does weak assertion lint run?](#where-does-weak-assertion-lint-run)
- [Where does the red-step check run?](#where-does-the-red-step-check-run)
- [Where does the sandbox runner live?](#where-does-the-sandbox-runner-live)
- [Where is patch.js and what does it do?](#where-is-patchjs-and-what-does-it-do)
- [Where is the curriculum?](#where-is-the-curriculum)
- [Where does the playground bundle come from?](#where-does-the-playground-bundle-come-from)
- [Where does the supervisor plan live?](#where-does-the-supervisor-plan-live)

**How do I do X?**
- [How do I add a new node type?](#how-do-i-add-a-new-node-type)
- [How do I add a new synonym?](#how-do-i-add-a-new-synonym)
- [How do I add a new Meph tool?](#how-do-i-add-a-new-meph-tool)
- [How do I run the tests?](#how-do-i-run-the-tests)
- [How do I rebuild the playground bundle?](#how-do-i-rebuild-the-playground-bundle)
- [How do auth tokens work in compiled apps?](#how-do-auth-tokens-work-in-compiled-apps)
- [How does the database layer work?](#how-does-the-database-layer-work)
- [How does WebSocket/broadcast work?](#how-does-websocketbroadcast-work)
- [How does the eval system work?](#how-does-the-eval-system-work)

**Why did we do X?**
- [Why does send back compile to return inside define function?](#why-does-send-back-compile-to-return-inside-define-function)
- [Why do user-defined functions shadow built-in aliases?](#why-do-user-defined-functions-shadow-built-in-aliases)
- [Why write the test before the function?](#why-write-the-test-before-the-function)
- [Why mechanical signals before ML for test quality?](#why-mechanical-signals-before-ml-for-test-quality)
- [Why a re-ranker before the sandbox, not after?](#why-a-re-ranker-before-the-sandbox-not-after)
- [Why is the supervisor plan GA-based?](#why-is-the-supervisor-plan-ga-based)
- [Why is there a minified bundle for the playground?](#why-is-there-a-minified-bundle-for-the-playground)

**What is X?**
- [What is Clear's big thesis?](#what-is-clears-big-thesis)
- [What is the RL training environment?](#what-is-the-rl-training-environment)
- [What is the difference between index.html and ide.html?](#what-is-the-difference-between-indexhtml-and-idehtml)
- [What are the known broken things?](#what-are-the-known-broken-things)

---

## Where is X?

### Where does the Studio server run?

```
node playground/server.js
```

Opens at `http://localhost:3456`. The port is set at the bottom of `playground/server.js`:
```js
const PORT = process.env.PORT || 3456;
app.listen(PORT, ...);
```

---

### What ports does everything use?

| Port | What |
|------|------|
| 3456 | Clear Studio (the IDE you use) |
| 3459 | Studio spun up by the e2e test suite |
| 4000+ | User's compiled app (increments each run, starts at 4000) |
| 4999 | Eval child process (sandbox for running evals) |

---

### Where does a compiled app run?

`playground/server.js` spawns a child Node process from `BUILD_DIR`. The port starts at 4000 and increments on each `/api/run` call. The running port is stored in the module-level `runningPort` variable.

When you click Run App in Studio, the server writes `server.js` to `BUILD_DIR`, installs npm deps if needed, spawns the child, waits for it to log `running on port`, and returns `{ port }` to the IDE.

---

### What is BUILD_DIR?

`playground/.playground-build/` — the directory where compiled apps are written before running.

Every `/api/run` call writes `server.js` + `package.json` + `clear-runtime/` symlink to this directory, then spawns Node from it. The directory is reused across runs (old files cleaned first). Don't edit anything in here — it gets overwritten.

---

### Where does a Meph session start and end?

`playground/server.js` — the `/api/chat` POST handler, starting around line 2124.

One request = one session. The handler receives `{ messages, editorContent, apiKey }`, streams SSE events back, and ends with `{ type: 'done' }`.

`currentSource` and `currentErrors` are scoped to the request handler — they track editor state across tool calls within that single session.

---

### Where is the tool call log?

Also in the `/api/chat` handler in `playground/server.js`.

`toolResults` is an array built during the session. Each tool call appends to it. The server emits `tool_start` and `tool_done` SSE events to bracket each call — `tool_start` fires **twice** per call (once bare, once with a summary). Use a boolean `_inTool` flag to dedup, not an ID.

At session end, `toolResults` is sent with the `done` event.

---

### Where are Meph's tools defined?

`playground/server.js` — the `TOOLS` array, starting around line 1772. Each tool has:
- `name` — what Meph calls
- `description` — what Meph reads to decide when to use it
- `input_schema` — validated before execution

Tool execution is in `executeTool(name, input)`. Validation is in `validateToolInput(name, input)`. New tools need entries in all three places.

---

### Where does Meph's system prompt live?

`playground/system-prompt.md` — loaded fresh on every `/api/chat` request. Edit it and changes take effect immediately, no server restart needed.

After any change, run `node playground/eval-meph.js` to verify the 16 tool scenarios still pass.

---

### Where does the compiler pipeline start?

`index.js` — `compileProgram(source, options)` is the public entry point.

Pipeline: `tokenizer.js` → `parser.js` → `validator.js` → `compiler.js`

The tokenizer uses longest-match greedy synonym resolution. The parser builds an AST of `NodeType` nodes, each with `.type` and `.line`. The validator checks for semantic errors without generating code. The compiler walks the AST and emits JS/Python/HTML.

Context object `{ lang, indent, declared, stateVars, mode, insideFunction, insideAgent, streamMode }` threads through compilation.

---

### What does compileProgram() return?

```js
{
  errors: [],          // compile errors — empty means success
  warnings: [],        // lint warnings
  javascript: '...',   // Express server JS (backend target)
  browserServer: '...', // compiled HTML+JS for browser (frontend target)
  tests: '...',        // generated test runner code
  ast: {...},          // the parsed AST
  dbBackend: 'local memory' | 'sqlite' | 'postgres',
  stats: {
    ok: true,
    endpoints: 1,
    tables: 0,
    pages: 0,
    functions: 0,
    agents: 0,
    workflows: 0,
    npm_packages: 0,
    has_auth: false,
    has_database: false,
    lines: 3,
    warnings: { total: 0 }
  }
}
```

`javascript` is the full Express server. `browserServer` is the compiled HTML+JS for web-target apps. Check `errors.length === 0` before using either.

---

### Where does test quality get measured?

Two places, two different signals:

**Weak assertion lint (static)** — `compiler.js`, inside the `UNIT_ASSERT` compile case. Checks assertion patterns at compile time. Weak patterns: `is not empty`, `is not nothing`, `is true` (bare). Pushes to `r.warnings[]`. Not shown to Meph or the user — internal signal only.

**Red-step check (process)** — `playground/server.js`, end of `/api/chat` handler. Scans the tool call log: did `run_tests` ever return `ok: false` before the first `ok: true`? If not, Meph skipped the red step.

---

### Where is session data stored?

**Short term (built):** `playground/sessions/[session-id].json` — one file per session, written at end of `/api/chat`. Readable via `GET /api/session-quality` (dev-only, not in Studio UI).

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

Medium term: add embedding of the compiled JS diff (not raw Clear — JS has massive training data behind it). Use `text-embedding-3-small` on the before/after diff.

Long term: fine-tune on Clear specifically once you have 5k+ sessions.

---

### Where does weak assertion lint run?

`compiler.js` — in `generateE2ETests()`, before the test body is compiled. Weak patterns detected on the AST:
- `check === 'not_empty'` → existence-only check, doesn't verify actual value → `code: 'weak_assertion'`
- `check === 'eq'` AND `right.type === 'literal_boolean'` AND `right.value === true` → bare boolean → `code: 'weak_assertion'`
- `unitAsserts.length === 1` in a test block → `code: 'single_assertion'`

Output: `r.warnings[]` with `{ line, severity: 'quality', code, message }`. Not shown to Meph or user.

---

### Where does the red-step check run?

`playground/server.js`, end of `/api/chat` handler:

```js
const testCalls = toolResults.filter(t => t.name === 'run_tests');
const redStepObserved = testCalls.some(t => t.result?.ok === false || t.result?.error);
```

This mirrors the assertion logic in `playground/test-tdd-loop.js` — the integration test for the full TDD loop.

---

### Where does the sandbox runner live?

`playground/server.js` — the eval child process infrastructure:
- `ensureEvalChild()` — spawns child server on port 4999
- `killEvalChildAndWait()` — graceful shutdown with 2s SIGKILL fallback + 200ms grace (Windows holds ports briefly after exit)
- `EVAL_IDLE_MS = 300_000` — idle timeout (must exceed longest eval suite)

`playground/test-tdd-loop.js` — integration test that drives a live Meph session end-to-end and asserts the TDD sequence happened.

---

### Where is patch.js and what does it do?

`patch.js` at repo root. It's the program diff/patch API — 11 structured edit operations that let an AI agent modify a Clear program without rewriting it from scratch.

Operations: `add_endpoint`, `add_field`, `remove_field`, `add_test`, `fix_line`, `insert_line`, `remove_line`, `add_validation`, `add_table`, `add_agent`, `add_table`.

This is the **constrained action space** for RL training. Instead of free-form text generation, the agent picks from 11 typed operations. That constraint makes the action space tractable and makes outputs more reliable.

```js
import { patch } from './patch.js';
const result = patch(source, [
  { op: 'add_endpoint', method: 'GET', path: '/api/health', body: "send back 'OK'" },
  { op: 'fix_line', line: 7, replacement: "  send back user" },
]);
// result.source = new Clear source with patches applied
```

---

### Where is the curriculum?

`curriculum/` at repo root. 20 benchmark tasks across 10 difficulty levels (L1–L10). Used for RL training and eval.

Each task is a `.clear` skeleton with a goal. The RL agent must complete it. The test suite (`clear test`) grades success. Curriculum tasks are also compiled in the e2e test suite — all 20 must compile clean.

---

### Where does the playground bundle come from?

`playground/clear-compiler.min.js` — a minified ESM bundle of the compiler, built with esbuild:

```
npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js
```

Run this after any change to `index.js`, `compiler.js`, `parser.js`, `tokenizer.js`, `validator.js`, or `synonyms.js`. The bundle is what the browser loads in the playground — it's the closed-source distribution of the compiler.

---

### Where does the supervisor plan live?

`plans/plan-supervisor-multi-session-04-17-2026.md`

Covers: session registry, supervisor loop, task distribution, merge step, shared memory, observability, GA-based candidate generation, re-ranker, mechanical quality signals. Red-teamed. Not yet implemented.

Branch when ready: `feature/supervisor-multi-session`

---

## How do I do X?

### How do I add a new node type?

Five steps. Don't skip any.

1. **Add to NodeType enum** — `parser.js`, the `NodeType = Object.freeze({...})` block around line 126. Add `MY_NODE: 'my_node'`.

2. **Parse it** — `parser.js`, in the appropriate `parseLine()` dispatch. Detect the keyword sequence, build `{ type: NodeType.MY_NODE, ...fields, line: ctx.line }`, push to `ctx.body`.

3. **Compile it** — `compiler.js`, in `compileNode()`. Add `case NodeType.MY_NODE:` and return the compiled string.

4. **Update both TOCs** — `parser.js` and `compiler.js` each have a TABLE OF CONTENTS at the top. Update them. Non-negotiable.

5. **Document it** — all 7 surfaces: `intent.md`, `SYNTAX.md`, `AI-INSTRUCTIONS.md`, `USER-GUIDE.md`, `ROADMAP.md`, `landing/*.html` (if user-facing), `playground/system-prompt.md` (if Meph should use it). If it's not in the docs, it doesn't exist.

Then run `node clear.test.js` + template smoke test (8 core templates, 0 errors).

---

### How do I add a new synonym?

`synonyms.js` — the `SYNONYM_TABLE` object. Map the new word/phrase to its canonical form.

For multi-word synonyms: add to `MULTI_WORD_SYNONYMS` array in addition to `SYNONYM_TABLE`.

Then **bump `SYNONYM_VERSION`** at the bottom of `synonyms.js`. This invalidates any cached tokenization. Format: semver string `'0.28.0'` → `'0.29.0'`.

Then check for collisions — grep `synonyms.js` for words that could ambiguously parse in different contexts. The collision risks are documented in `CLAUDE.md` and `learnings.md`.

Run the template smoke test after any synonym change — new synonyms can break existing apps in non-obvious ways.

---

### How do I add a new Meph tool?

Three places in `playground/server.js`:

1. **`TOOLS` array** (~line 1772) — add the tool definition with `name`, `description`, `input_schema`. The description is what Meph reads to decide when to use the tool. Make it specific.

2. **`validateToolInput(name, input)`** — add a case that validates the input shape. Return an error string if invalid, `null` if ok.

3. **`executeTool(name, input)`** — add a case that runs the tool and returns a result string.

Then run `node playground/eval-meph.js` to verify Meph can discover and use the new tool. The eval drives 16 scenarios — add a new scenario for your tool if it doesn't fit an existing one.

---

### How do I run the tests?

```bash
node clear.test.js              # 1939 compiler unit tests — run this always
node sandbox.test.js            # integration tests (spawns real servers)
node playground/server.test.js  # Studio server API (85 tests)
node playground/e2e.test.js     # template compile + endpoint + curriculum (77 tests)
node playground/ide.test.js     # Playwright IDE UI (needs server running)
node playground/eval-meph.js    # Meph tool eval, 16 scenarios (~90s, ~$0.10–0.30)
```

Pre-commit hook: `node clear.test.js`
Pre-push hook: `node clear.test.js` + `node playground/e2e.test.js` + Meph eval (if `ANTHROPIC_API_KEY` set)

To skip Meph eval for one push: `SKIP_MEPH_EVAL=1 git push`

**Push from the main repo checkout, not a worktree.** The Playwright e2e test fails in worktrees because of environment differences.

---

### How do I rebuild the playground bundle?

```
npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js
```

Do this after any change to the compiler pipeline files. The bundle is checked into git and is what users get in the browser playground.

---

### How do auth tokens work in compiled apps?

Clear's `allow signup and login` compiles to a full auth scaffold:

- `POST /auth/signup` — bcrypt hashes password, creates user, returns JWT
- `POST /auth/login` — verifies password, returns JWT
- `GET /auth/me` — returns current user from JWT

JWT secret comes from `process.env.JWT_SECRET`. Defaults to `'clear-test-secret'` in the test runner. Use a real secret in production.

Endpoints with `requires login` get JWT middleware injected. The middleware validates the token and sets `req.user`. Endpoints with `requires role X` additionally check `req.user.role`.

Two JWT formats exist in the wild (legacy vs modern templates) — the eval runner detects which one by regex-matching the emitted `serverJS`. See learnings.md → Session 32.

---

### How does the database layer work?

`runtime/db.js` — the database abstraction. Three backends:

| Backend | When | How |
|---------|------|-----|
| `local memory` | Default, no database declared | In-memory JS object, resets on restart |
| `sqlite` | `use sqlite` in Clear source | SQLite file at `.clear-db.sqlite` |
| `postgres` | `use postgres` in Clear source | Connects via `DATABASE_URL` env var |

The compiled app imports `db.js` via a symlink in `BUILD_DIR/clear-runtime/`. The runtime creates tables on first use (`db.createTable(name, schema)`). CRUD operations: `db.insert`, `db.findAll`, `db.findOne`, `db.update`, `db.delete`.

Constraints (`required`, `unique`, `email`) are enforced at the runtime layer, not the DB layer — the compiled server validates before calling `db.insert`.

---

### How does WebSocket/broadcast work?

`subscribe to X` in Clear compiles to a WebSocket endpoint. `broadcast to all` pushes to all connected clients.

The compiled server uses `ws` package. The WebSocket server shares the same HTTP server as Express. Client JS is auto-injected into the compiled HTML — it connects to the same host/port and listens for messages.

Channel names are strings. `broadcast to all watching X` sends only to clients subscribed to channel `X`.

---

### How does the eval system work?

The eval system grades Meph's app-building quality without a human.

1. **Compile** the Clear source with `generateEvalEndpoints` option — injects `/_eval/<agent>` HTTP endpoints for every agent in the app.
2. **Spawn** an eval child process on port 4999 (`ensureEvalChild()`).
3. **Run probes** — HTTP requests to `/_eval/<agent>` with synthetic inputs.
4. **Grade** — compare response shape/content against specs. Format evals are deterministic. Role/E2E evals use Claude as judge when `ANTHROPIC_API_KEY` is set.
5. **Report** — markdown or CSV output with pass/fail per scenario.

The eval child is killed between template runs (`killEvalChildAndWait()`). Idle timeout is 300s. See learnings.md → Session 34 for the bugs that were fixed here.

---

## Why did we do X?

### Why does send back compile to return inside define function?

`send back` is Clear's one keyword for "give a value back." Inside an HTTP endpoint, that means `res.json()`. Inside a `define function` block, it means a plain `return`.

The compiler uses `ctx.insideFunction: true` (set by the `FUNCTION_DEF` compile case) to route `compileRespond()` to the right path. Without it, every user-defined function silently emitted HTTP response code and crashed at runtime when called from a test block.

The fix is two lines. The bug was silent for months because nobody tested the function→test-block call chain end-to-end.

---

### Why do user-defined functions shadow built-in aliases?

If you name a function `sum`, Clear's synonym table maps `sum` to `_clear_sum` (the built-in array-sum helper). Your function was silently rerouted.

Fix: `_findUserFunctions()` pre-scans the AST for all `FUNCTION_DEF` nodes at compile time, building a Set of user-defined names. In `exprToCode()` CALL resolution, user-defined names are checked first — before `mapFunctionNameJS()`. User always wins.

This mirrors lexical scoping: inner scope shadows outer. Applies to any built-in alias (`sum`, `max`, `min`, etc.).

---

### Why write the test before the function?

**Practical:** forces you to state what "done" looks like before writing code. The test is a frozen spec — you can't game it by writing code first.

**Research:** the test becomes a machine-readable oracle. The agent authors its own success criterion before knowing the implementation. Self-supervised training signal — no human labels needed. Full explanation: **[RESEARCH.md — The Core Insight](RESEARCH.md#the-core-insight-meph-solves-the-oracle-problem)**

---

### Why mechanical signals before ML for test quality?

ML needs labeled data. You don't have it yet. Mechanical signals (weak assertion patterns, red-step check) are deterministic — they produce a quality score immediately and become features in the learned model later. Full explanation: **[RESEARCH.md — Mechanical Quality Signals](RESEARCH.md#mechanical-quality-signals-the-bootstrap)**

---

### Why a re-ranker before the sandbox, not after?

The sandbox costs 5–30s per candidate. The re-ranker filters before the sandbox runs — even 60% accuracy cuts cost significantly. Full architecture: **[RESEARCH.md — The Re-Ranker](RESEARCH.md#the-re-ranker-architecture-recommendation)**

---

### Why is the supervisor plan GA-based?

Beam search exploits, stops exploring. GA adds recombination + LLM-as-mutation (AlphaEvolve/FunSearch pattern) + MAP-Elites diversity grid. Full explanation: **[RESEARCH.md — The GA](RESEARCH.md#the-ga-why-genetic-not-beam-search)**

---

### Why is there a minified bundle for the playground?

The compiler is closed source. The playground runs in the browser and needs the compiler. The bundle (`playground/clear-compiler.min.js`) is the compiler obfuscated for distribution — users can't easily read the source. The repo itself stays private. The bundle is rebuilt after compiler changes and committed.

---

## What is X?

### What is Clear's big thesis?

Clear is an alignment layer for AI-generated software — not just an app builder.

Every other AI code generator (Lovable, Bolt, Cursor, Devin) answers "how do you know the AI shipped safe code?" with: **hope.** Clear answers it with: **the compiler won't let it.**

**The one-liner:** Clear is the language AI writes when the output has to be safe.

**Company:** Crystallized (company) / Clear (language) / Clear Studio (product)

**Fundraising sequence:**
- $3M seed: "We built a compiler that prevents AI from shipping unsafe code. Here are 200 companies using it for internal tools."
- $40M Series A: "500 companies run apps compiled by Clear. We want to generalize this to all AI-generated code."

Full thesis + hard takeoff scenario + research arc: **[RESEARCH.md](RESEARCH.md)**

---

### What is the RL training environment?

Clear's deterministic compiler, structured errors, constrained action space (patch.js), and built-in test syntax make it a natural RL gym.

| Component | Status |
|-----------|--------|
| Sandbox runner | Built — isolated child process, timeout, memory limit |
| Curriculum | Built — 20 benchmarks, 10 difficulty levels, 63 tests |
| Structured eval API | Built — `compileProgram()` returns JSON scores/stats/warnings |
| Patch API | Built — 11 structured edit operations = constrained action space |
| Source maps | Built — runtime errors map to Clear line numbers |
| HTTP test assertions | Built — `call POST /path`, `expect response status` = reward function |

**Current blocker:** No fine-tuning access. The gym is ready but can't train athletes yet.

Full RL architecture, re-ranker design, and what this doesn't buy: **[RESEARCH.md](RESEARCH.md)**

---

### What is the difference between index.html and ide.html?

`playground/index.html` — the old static playground. Loads the compiler bundle (`clear-compiler.min.js`) in the browser. No server required. Compiler-only — no Meph, no running apps, no file system access. Useful for quick syntax experiments.

`playground/ide.html` — the full Clear Studio IDE. Requires the server (`node playground/server.js`). Three-panel layout: CodeMirror editor + preview/terminal + Meph chat. Can compile, run, test, eval, and access the file system. This is what users actually use.

When someone says "Studio," they mean ide.html + server.js together.

---

### What are the known broken things?

| Issue | Workaround |
|-------|-----------|
| `needs login` on a page compiles to blank white page — JWT check hides everything but doesn't show login form or redirect | Don't use `needs login` on pages yet; use endpoint auth instead |
| `for each` loop body in HTML doesn't render child content — outputs whole object as string instead of expanding template | Use `display X as cards showing field1, field2` instead |
| `ui's Card()` in web target crashes `buildHTML` | Don't use namespaced component calls in web target |
| Browser server may 404 on some routes | Untested in real browser — verify if you hit this |
