# Clear Research Notes — RL, Self-Play, and the Training Signal

How Clear's architecture creates a self-improving AI coding system without fine-tuning access.
Updated: 2026-04-18.

---

## The Core Insight: Meph Solves the Oracle Problem

Every AI code generation system has the same problem: **who grades the output?**

Lovable, Bolt, Cursor — they all need a human to look at the result and say "yes, that's right." That's expensive, doesn't scale, and is impossible to do automatically.

Clear sidesteps this because **Meph writes the test before the code.** The test is the oracle. It's machine-readable, deterministic, and authored by the agent itself before it knows what the implementation will look like. That means:

- No human labels needed
- The agent can't game it by writing the test after the fact
- The oracle is baked into the artifact, not external to it

Cursor generates code and you validate. Clear generates, self-validates, and the validation is written *before* the generation.

---

## TDD as Reversed GAN

Standard GAN (Generative Adversarial Network): generator produces, discriminator grades. Generator improves by learning to fool the discriminator. Discriminator improves by learning to catch the generator. Adversarial loop.

TDD inverts this — and more importantly, **freezes the discriminator before the generator runs.**

```
Standard GAN:
  Generator → output → Discriminator → grade → Generator improves
  (discriminator and generator evolve together, discriminator can drift)

TDD / Meph:
  Discriminator (test) written first → FROZEN
  Generator (code) runs against frozen discriminator
  Red = fail, Green = pass
  No retroactive discriminator changes allowed
```

This is stronger than standard GAN for code because:
1. **No mode collapse.** The discriminator (test) is written for a specific behavior. The generator can't collapse to a trivial solution that "looks" right without being right.
2. **The discriminator can't be gamed.** In a standard GAN, a clever generator finds holes in the discriminator. In TDD, the discriminator is frozen and authored before the generator knows the solution.
3. **The training signal is clean.** Red→green is binary and deterministic. No probability distribution, no gradient estimation, no "sort of close."

**The analogy isn't perfect.** In a real GAN, both networks train simultaneously. In TDD, the "discriminator" (test) doesn't update — it's fixed. That means Meph's discriminator doesn't get harder over time the way a real GAN discriminator would. The curriculum (L1→L10) fills that role: harder tasks = harder discriminators.

---

## Meph as Actor and Critic — Reversed

Standard actor-critic in RL: actor proposes actions, critic grades them.

Meph does the same thing but with the order flipped. **Meph writes the critic (the test) first, then acts (writes the function).** The critic is frozen before the actor runs. This is stronger than standard actor-critic because:

1. The critic can't be gamed retroactively
2. The actor can't write code that passes a test it designed around its own code
3. The red→green sequence is a verifiable trace — you can confirm the ordering mechanically

The red→green sequence is the training signal:
- **Red step:** test runs, fails. Meph didn't write the function yet.
- **Green step:** function written. Test passes.

A red→green sequence with no cheating (no test rewrite between red and green) is a clean, self-supervised training example. **No human needed.**

---

## GAN as a UI Development Process

We use GAN thinking directly when building UI — not just as a metaphor.

The setup:

```
Static HTML mock  →  Discriminator (frozen visual target)
Compiler output   →  Generator (what the compiler produces)
```

The loop:
1. Build a static HTML/CSS mock with DaisyUI — no compiler, pure visual target
2. Screenshot the running compiler output
3. Grade section by section (header, cards, sidebar, etc.)
4. Find the worst-looking section
5. Fix it in the compiler. Run tests (0 regressions).
6. Go to 1.

Iterate until visual parity. The mock is the discriminator. The compiler is the generator. The discriminator doesn't move — you're always trying to close the gap between compiler output and the static target.

**Why this works:**
- The mock is fast to build (pure HTML, no compilation)
- The mock can be pixel-perfect — no compiler constraints
- The compiler fix is always one targeted change (one "worst section" per round)
- The test suite catches regressions — you can't make the sidebar better by breaking the header

**The anti-pattern:** editing the compiler output HTML directly to "make it look better." That's like training the discriminator instead of the generator. The discriminator must stay frozen. Fix the generator (compiler) until it matches.

This is documented in CLAUDE.md as the "GAN Design Method" and "GAN Page Loop." The theoretical framing is here.

---

## The Flywheel

```
Sessions run
    │
    ▼
Each session → labeled example
(features: error type, patch ops, assertion quality, red-step)
(label: did tests pass at the end?)
    │
    ▼
Re-ranker trains on labeled examples
(~200 sessions → first XGBoost model)
    │
    ▼
Re-ranker filters patch candidates
before sandbox eval
    │
    ▼
Fewer sandbox runs → faster sessions
→ more sessions → more examples
    │
    └──────────────────────────────┐
                                   ▼
                            Better re-ranker
```

The mechanical quality signals bootstrap this loop. They don't require ML — they're deterministic checks that score sessions immediately, before you have enough data to train anything.

---

## Mechanical Quality Signals (The Bootstrap)

ML needs labeled data. You don't have it yet.

So start with deterministic signals that produce a quality score on day 1:

**Static lint (compiler-side):**
- `expect X is not empty` — checks existence, not value. Weak.
- `expect X is true` — bare boolean, no context. Weak.
- Single assertion in an entire test block — yellow flag.

**Process lint (server-side):**
- Did `run_tests` fail at least once before it passed? (`red_step_observed`)
- If tests went green on the first call, no red step happened — skip TDD entirely.

Both produce `weak_assertion_count` and `red_step_observed`. These become:
1. Immediate quality filter (gate bad sessions before storage)
2. Features in the re-ranker model once you have enough data

Mechanical signals never go away. They become features in the learned model, not a replacement for it.

---

## The Re-Ranker: Architecture Recommendation

The re-ranker is a **bouncer** — it filters patch candidates before the expensive sandbox (compile + run + test, 5–30s each) runs them. Even 60% accuracy cuts sandbox cost significantly.

**What it's trained on:**
- Input: `(error_category, patch_op_type, node_types_touched, weak_assertion_count, red_step_observed)`
- Label: did the final `run_tests` show `ok: true`?

**Recommended sequence:**

| Phase | Model | Data needed | Why |
|-------|-------|-------------|-----|
| Now | Mechanical signals only | 0 | Deterministic, free |
| ~200 sessions | XGBoost on structured features | ~200 labeled sessions | Fast to train, interpretable, works on tabular |
| ~2k sessions | Add JS embedding | 2k+ sessions | Embed compiled JS diff (not Clear source — JS has massive training data behind it). `text-embedding-3-small` on before/after diff |
| ~5k sessions | Fine-tune on Clear | 5k+ sessions | Model learns Clear-specific patterns directly |

**Why JS embeddings, not Clear embeddings:**
Clear is a tiny corpus. JS has billions of examples in every model's training data. Embedding the compiled JS diff puts you in a rich semantic space. Clear source → JS → embed is a better path than Clear source → embed directly.

**Why structured features first — and why the model stays small:**

The input space here is genuinely tiny. `task_type` has ~15 values. Error categories have ~30-50 distinct patterns. `patch_op_type` has 11 values (from patch.js). That's a structured tabular problem, not a language understanding problem.

What the re-ranker is actually doing: **a lookup table with uncertainty.** "Given error pattern X on task type Y, which of these 5 past fixes has the best track record?" A decision tree captures this cleanly. XGBoost on 5-10 features trains in seconds, runs in microseconds, and is interpretable — you can see which features matter.

A 22M-parameter cross-encoder (e.g. ms-marco-MiniLM) is trained on millions of web search queries to understand free-form natural language. That's not the problem here. Using it would be like using a sledgehammer to push a thumbtack. It would train more slowly, require more data, and give you less insight into what's actually driving predictions.

**The upgrade path only triggers if XGBoost plateaus** — i.e., you have 2k+ sessions and accuracy on the validation curriculum isn't improving. At that point, JS embeddings on the compiled diff add signal. But you may never need them. The feature space might be fully captured by structured inputs alone.

### Global context: how the re-ranker thinks like an engineer

A real engineer hitting a validation error doesn't just see the error — they know this is a multi-tenant CRM with auth and Postgres, which completely changes the right fix. A bare `error_sig` misses all of that.

The re-ranker captures global context by extracting **structured app-level features** from the parser output, once per session. These become additional XGBoost inputs alongside the local error features.

**Global context features (per app, re-computed on each compile):**

| Feature | Type | Source |
|---------|------|--------|
| `archetype` | categorical (8 values) | Nearest match of: todo, crm, blog, chat, agent, booking, expense, ecom |
| `num_tables` | bucketed (1, 2-3, 4-6, 7+) | Count of `TABLE_DEF` nodes |
| `num_endpoints` | bucketed | Count of `ENDPOINT` nodes |
| `num_pages` | bucketed | Count of `PAGE_DEF` nodes |
| `has_auth` | boolean | Parser detects auth blocks |
| `has_agent` | boolean | `AGENT_DEF` or `ASK_AI` nodes present |
| `has_scheduler` | boolean | `CRON` nodes present |
| `has_websocket` | boolean | `SUBSCRIBE` / `BROADCAST` nodes |
| `has_upload` | boolean | File upload endpoints |
| `runtime` | categorical | SQLite / Postgres (from `build for` directive) |
| `multi_tenant` | boolean | `belongs to user` appears on any table |

**Local context features (per compile cycle):**

| Feature | Type |
|---------|------|
| `error_category` | categorical — ~30-50 values (validation, missing_endpoint, type_error, auth_failure, etc.) |
| `patch_op_type` | categorical — 11 values from patch.js |
| `file_location` | categorical — database / backend / frontend section |
| `table_involved` | categorical — which table the error relates to |

**Retrieval query with global context:**
```
SELECT * FROM code_actions
WHERE archetype = 'crm'                  ← only look at CRM-shaped apps
  AND error_category = 'validation'      ← same error category
  AND has_auth = 1                       ← same auth posture
ORDER BY test_score DESC
LIMIT 50
```

That's engineer-like. "In CRM-shaped apps with auth, when a validation error hits, what fixes worked?" — not "what fixed this error string in any app ever."

**Why this still works with XGBoost:**

The total feature count is ~20, not thousands. Each feature is low-cardinality (booleans, small categoricals). XGBoost handles this natively, captures feature interactions (e.g. "has_auth=true AND error=validation → prefer middleware patches"), and stays interpretable — you can literally print feature importance and understand what the model learned.

**When global context doesn't help:**

Some errors are purely syntactic (missing quote, unbalanced brace). Global features add noise for those. The re-ranker learns to ignore them — XGBoost naturally down-weights features that don't correlate with outcomes for specific error types. No hand-tuning needed.

---

## The GA: Why Genetic, Not Beam Search

Standard beam search exploits what works and stops exploring. It finds local optima fast — good for discount calculators, bad for L7–L10 curriculum tasks that require exploration.

**Genetic algorithm adds:**
- **Recombination:** splice two successful patch sequences together. Get candidates neither parent would produce.
- **LLM-as-mutation:** rewrite one patch-op differently, validate via Jaccard similarity before running sandbox. This is the AlphaEvolve/FunSearch pattern.
- **MAP-Elites for diversity:** a behavioral grid where each cell (task_type × error_category) keeps its best-fitness resident. Prevents the GA from collapsing to one successful strategy.

Beam search finds the answer to the problem you tested. GA finds solutions that generalize.

---

## The RL Gym: What's Built

Clear's deterministic compiler, structured errors, constrained action space, and built-in test syntax make it a natural RL gym. Everything below is working code, not planned.

### 1. Constrained Action Space — `patch.js`

11 structured edit operations. An episode is a sequence of these ops applied to a Clear skeleton:

| Op | What it does |
|----|-------------|
| `add_endpoint` | Append a new API route block |
| `add_field` | Add a field to a table definition |
| `remove_field` | Remove a field from a table |
| `add_test` | Append a test block |
| `fix_line` | Replace a specific line |
| `insert_line` | Insert a line at a position |
| `remove_line` | Delete a specific line |
| `add_validation` | Add validation rules to an endpoint |
| `add_table` | Add a new data table |
| `add_agent` | Add an agent definition |

Result shape: `{ source, applied, skipped, errors }`. Failed ops are non-fatal — they're skipped and logged. The episode continues.

**Why this matters for RL:** free-form text generation has an infinite action space. Patch ops constrain it to ~11 types × bounded parameters. Easier to learn, easier to evaluate, failures are interpretable.

---

### 2. Curriculum — `curriculum/`

20 benchmark tasks across 10 difficulty levels. Each task is a JSON file with:
- `id`, `level`, `title`, `description`
- `skeleton` — a partial Clear program the agent must complete
- `tests[]` — HTTP assertions that grade the result

```
L1: Hello World, Greeting (static endpoints)
L2: Echo, Calculator (input → output)
L3: Counter, Key-Value Store (state)
L4: Todo CRUD, Bookmark Manager (full CRUD)
L5: Auth Todo, User Profiles (authentication)
L6: Blog Search, Contact Book (search + relations)
L7: Rate-Limited API, Validated Forms (middleware)
L8: Multi-Tenant, RBAC API (authorization)
L9: Agent Summary, Agent Categorizer (LLM agents)
L10: Full SaaS, Dashboard API (full apps, auth + relations + agents)
```

The L10 skeleton is already ~20 lines. The agent must complete it to ~100 lines that pass 8–12 HTTP assertions. That's the hardest training signal in the curriculum.

---

### 3. Sandbox Runner — `playground/server.js`

Isolated child process that compiles and runs Clear programs. The eval infrastructure:

- `ensureEvalChild(serverJS)` — spawns a child Node server on port 4999. Reuses if already running the same code. Kills and respawns on template switch.
- `killEvalChildAndWait()` — graceful shutdown with 2s SIGKILL fallback + 200ms grace period (Windows holds ports briefly after exit). Prevents port conflicts on rapid respawn.
- `EVAL_IDLE_MS = 300_000` — child killed after 5 min idle. Chosen to exceed the longest eval suite.
- Process exits (SIGINT, SIGTERM, `exit`) cleanly kill the child.

The child runs the compiled JS, exposes REST endpoints, and the test runner hits those endpoints. All in-process — no Docker, no VMs. Fast enough for RL loops.

---

### 4. Structured Eval API — `compileProgram()`

`index.js` — the compiler entry point returns a fully structured result:

```js
{
  errors: [],           // compile errors with line numbers
  warnings: [],         // lint warnings (security, quality)
  javascript: "...",    // compiled server JS
  browserServer: "...", // compiled browser JS
  tests: "...",         // compiled test suite (Playwright or HTTP)
  ast: [...],           // full AST for inspection
  dbBackend: "sqlite",  // detected database target
  stats: {
    nodeCount: 47,
    tableCount: 2,
    endpointCount: 8,
    // ...
  }
}
```

Errors are machine-readable: `{ message, line, col, code }`. The agent can read `errors[0].line` and issue a `fix_line` patch op directly. No parsing required.

---

### 5. Source Maps — compiler

Runtime errors map back to Clear line numbers. A JS `TypeError` on line 312 of compiled output traces to Clear line 7. The compiler embeds this mapping in comments in the generated JS:

```js
// [Clear line 7] send back user
res.json(user);
```

The sandbox runner reads these markers from stack traces. The agent sees "Clear line 7" not "server.js:312".

---

### 6. Built-in Test Syntax (self-supervised reward signal)

The `test` block compiles to real assertions:

```
test 'discount math':
  result = apply_discount(100, 0.10)
  expect result is 10
```

Compiles to `_unitAssert(result, 'eq', 10, 7, 'result')` with rich error messages. Full operator set: `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `empty`, `not_empty`.

For backend apps, the `call` block hits live HTTP endpoints:

```
call GET /api/todos
expect response status is 200
expect response has todos
```

These are the reward functions. `ok: true` = pass, `ok: false` + error message = fail. The agent gets structured feedback, not just exit codes.

---

### 7. Meph Tool Eval — `playground/eval-meph.js`

16 scenarios covering every Meph tool. Drives a live Meph session over the `/api/chat` SSE endpoint. Each scenario:
1. Sends a prompt designed to trigger a specific tool
2. Parses the SSE stream for tool calls
3. Grades: did Meph call the expected tool? Did it self-report success?

**Tools covered:** `edit_code` (read + write), `compile`, `run_app`, `http_request`, `read_terminal`, `run_tests`, `read_file`, `browse_templates`, `source_map`, `highlight_code`, `todo`, `read_actions`, `read_dom`, `screenshot_output`, `stop_app`

Cost ~$0.10–0.30 per run, ~90–180s. Catches schema mismatches, hallucinated tool names, broken dispatch, malformed JSON outputs.

---

### 8. Full-Loop Eval — `playground/eval-fullloop-suite.js`

3 complex apps built end-to-end by Meph from a one-line prompt. Meph must: write the Clear code, compile, run, test, fix errors, pass all assertions. Scored automatically. ~3 min, ~$0.50–1.00 per run.

---

### 9. TDD Loop Integration Test — `playground/test-tdd-loop.js`

Drives a live Meph session with: "build apply_discount using TDD." Asserts:
1. `edit_code` called before first `run_tests` (wrote test first)
2. First `run_tests` failed (red step observed)
3. Final `run_tests` passed (green step)
4. Total tool call sequence is well-ordered

Passes 5/5 assertions. This is the mechanical verification that Meph's TDD mandate actually holds at runtime — not just in theory.

---

### 10. Security Lint — `clear lint`

27 security + quality checks embedded in the compiler. Examples:
- SQL injection via raw string interpolation
- Auth endpoints with no password hashing
- Public endpoints that expose admin data
- Missing input validation on user-facing routes

Output: `warnings[]` in `compileProgram()` result. Same infrastructure that'll carry the weak assertion lint (next piece).

---

### What's Missing

| Component | Status |
|-----------|--------|
| Mechanical quality signals | 🔜 Next — static + process lint, session JSON storage |
| Session registry | 🔜 Supervisor plan phase 1 |
| Re-ranker (XGBoost) | 🔜 Needs ~200 labeled sessions first |
| Supervisor loop | 🔜 Supervisor plan phase 2–3 |
| GA candidate generation | 🔜 Supervisor plan phase 4 |
| Fine-tuning | ❌ No access yet — retrieval/memory bridge until then |

**Current blocker:** no fine-tuning access. The gym is complete. Can't train athletes yet. The supervisor + GA + re-ranker plan is the bridge — retrieval/memory instead of gradient descent. Fine-tuning slots in on top when available.

---

## What This Doesn't Buy (Honest Assessment)

- **Not recursive self-improvement.** The agent improves at writing Clear programs. It doesn't improve the compiler, the language, or itself.
- **Not emergent intelligence.** Better re-ranking is faster search, not smarter search.
- **Not guaranteed quality at any sample size.** A bad agent with a weak test can still game the oracle if the test is trivially weak. That's what the mechanical signals address.
- **Not a replacement for human review.** The compiler catches structural bugs. It doesn't catch wrong business logic.

The honest pitch: **this buys faster synthesis and better eval coverage at lower cost.** That's not a small thing. It's a compounding advantage over systems that require human-in-the-loop grading. But it's not AGI.

---

## Where This Fits the Thesis

Clear's thesis is that the compiler is an alignment layer — the thing that enforces what AI output is allowed to do. The research bet is that this constraint (AI writes in a constrained language → compiler validates) makes the training signal cleaner than free-form code generation, and that cleaner training signals compound over time into meaningfully better AI coding behavior.

The constraint is the feature. Bounded action space → interpretable failures → clean reward signal → better learning.

Full thesis: see **[FAQ.md — What is Clear's big thesis?](FAQ.md#what-is-clears-big-thesis)**
Supervisor plan: see **[plans/plan-supervisor-multi-session-04-17-2026.md](plans/plan-supervisor-multi-session-04-17-2026.md)**
