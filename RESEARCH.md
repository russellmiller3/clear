# Clear Research Notes — RL, Self-Play, and the Training Signal

How Clear's architecture creates a self-improving AI coding system without fine-tuning access.
Updated: 2026-04-18 (Session 37: flywheel live, Factor DB wired).

---

## Read This First — Plain English Version

**What's the point of all this?** To make Meph get better at building apps over time, without needing access to re-train Claude itself.

**How it works in one paragraph.** Every time Meph compiles code in Studio, a row gets written to a database — what he was building, what error he hit (if any), whether it compiled, whether the tests passed. When he hits a compile error in a future session, the system looks at past rows where someone hit the same error and fixed it successfully, and hands Meph 3 working examples. He pattern-matches off them and tries again. Over months of usage, the database fills up with labeled examples. Eventually it trains a small ranking model (XGBoost, not a language model) that picks the best examples more intelligently than keyword match.

**What's actually live right now:**
- A live dashboard in Studio ("Flywheel" tab) showing the database growing
- 107 training rows accumulated so far, 38 of them passing end-to-end
- Every Meph compile auto-logs
- Every compile error auto-retrieves 3 past working examples and hands them to Meph
- A classifier that tags each app by shape (queue workflow, CRUD app, AI agent, etc.) so retrieval can filter by app type
- 5 new template apps (approval queue, lead router, onboarding tracker, support triage, internal request queue) that match what Marcus's team actually builds

**What this buys you.** Meph makes the same mistake once, then never again — the fix is stored and returned to future sessions automatically. You don't manually teach him. The more people use Clear, the smarter Meph gets for everyone.

**What this doesn't buy you.** Claude itself doesn't change. The LLM is the same. What improves is the information Meph has in his context window before he writes code. Fine-tuning would be a bigger win, but we don't have access — this is the best version of "training" available without it.

**The bottleneck:** we need ~200 rows where tests passed before we can train the ranker (currently 38). Every Meph session adds a few. Every curriculum sweep (automated test against practice tasks) adds ~8 passing rows. We're roughly 20 sweeps away.

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

This is the compounding loop that makes Clear's Meph smarter over time — without changing the underlying language model.

```
                    ┌─────────────────────────────────────┐
                    │           MEPH SESSION              │
                    │   (Claude + system prompt)          │
                    │                                     │
   ┌─── suggestions │   ┌───────────────────────┐         │
   │    injected    │   │  user describes app   │         │
   │    as context  │   │          │            │         │
   │                │   │          ▼            │         │
   │                │   │  Meph writes Clear    │         │
   │                │   │          │            │         │
   │                │   │          ▼            │         │
   │                │   │  COMPILE ── error ────┼─────────┼──┐
   │                │   │          │            │         │  │
   │                │   │          ▼            │         │  │
   │                │   │  RUN_TESTS            │         │  │
   │                │   │          │            │         │  │
   │                │   └──────────┼────────────┘         │  │
   │                │              ▼                      │  │
   │                └──────────────┼──────────────────────┘  │
   │                               │                         │
   │                               ▼                         ▼
   │                    ┌──────────────────────────────────────┐
   │                    │         FACTOR DB (SQLite)           │
   │                    │                                      │
   │                    │  Every compile → one row:            │
   │                    │    • archetype (queue_workflow,      │
   │                    │      crud_app, api_service, ...)     │
   │                    │    • error_sig (hash of error msg)   │
   │                    │    • patch_ops (what Meph did)       │
   │                    │    • compile_ok                      │
   │                    │    • test_pass / test_score          │
   │                    │    • source_before (context)         │
   │                    └──────────────┬───────────────────────┘
   │                                   │
   │                                   │ accumulates rows
   │                                   ▼
   │                    ┌──────────────────────────────────────┐
   │                    │     XGBOOST RE-RANKER TRAINING       │
   │                    │                                      │
   │                    │  ~20 structured features:            │
   │                    │    global context (archetype,        │
   │                    │      has_auth, multi_tenant, ...)    │
   │                    │    local context (error_category,    │
   │                    │      patch_op_type, file_location)   │
   │                    │    quality (weak_assertion_count,    │
   │                    │      red_step_observed)              │
   │                    │                                      │
   │                    │  Retrains every ~1000 new rows       │
   │                    │  (~seconds on CPU)                   │
   │                    └──────────────┬───────────────────────┘
   │                                   │
   │                                   │ predictions
   │                                   ▼
   │                    ┌──────────────────────────────────────┐
   │                    │       RETRIEVAL AT QUERY TIME        │
   │                    │                                      │
   │                    │  On next compile error:              │
   │                    │    1. compute (archetype,error_sig)  │
   │                    │    2. query Factor DB top-50 similar │
   │                    │    3. re-ranker scores all 50        │
   │                    │    4. return top-3 as plain text     │
   │                    └──────────────┬───────────────────────┘
   │                                   │
   └───────────────────────────────────┘

      COMPOUND EFFECT:
      Better hints → fewer error cycles → faster sessions
      → more sessions per unit time → more training data
      → better hints → ... (flywheel spins faster)
```

**Three phases:**

| Phase | Trigger | Behavior |
|-------|---------|----------|
| **Cold start** | Day 1 — 0 rows | BM25 retrieval only (token overlap on archetype + error_sig). Suggestions are generic but non-random. |
| **Organic** | 200+ passing rows | XGBoost re-ranker trained. Suggestions are quality-ranked by success rate. |
| **Tuned** | 2k+ rows | Re-ranker retrains weekly. Drift detection on curriculum validation set. |

**Important:** the model being trained is NOT Claude. It's a 22M-weight decision-tree ensemble (XGBoost) that ranks retrieved examples. Claude/Meph stays exactly the same. The hints Meph receives get better; Meph's ability to follow hints was always there.

The mechanical quality signals bootstrap this loop. They produce deterministic quality scores on day 1 — before any ML is trained. See the next section.

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
| `archetype` | categorical (~15 values) | See archetype table below |
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

**Archetype taxonomy (~15 values, covers Marcus's 5 + core 8 + backend-only patterns):**

The archetype classifier maps any Clear app to its nearest shape-of-work. These aren't the template names — they're the *behavioral patterns* the parser can detect. Multiple templates can share an archetype (both `helpdesk-agent` and `support-triage` are `agent_workflow`).

| Archetype | Shape of Work | Example Apps | Detection Signal |
|-----------|---------------|--------------|------------------|
| `queue_workflow` | State machine with approval/routing | Approval Queue, Internal Request Queue, Onboarding Tracker | Tables with `status` field + multiple state transitions + notification blocks |
| `routing_engine` | Rules-driven classification + assignment | Lead Router, Support Triage | Conditional assignment logic + multi-owner routing |
| `agent_workflow` | AI-assisted classification or generation | Helpdesk, Support Triage, summarizer | `AGENT_DEF` / `ASK_AI` + downstream actions |
| `dashboard` | Read-heavy data viz with charts/filters | CRM Pro, analytics views | Multiple `CHART` nodes + aggregations + filter UI |
| `crud_app` | Standard create/read/update/delete | Todo, expense, bookmark, contact book | CRUD endpoints on 1-3 tables, minimal logic |
| `content_app` | Public + admin pages, rich display | Blog, landing pages, docs sites | `belongs_to` relationships + public routes + admin routes |
| `realtime_app` | Live updates via websocket | Live chat, presence, notifications | `SUBSCRIBE` / `BROADCAST` nodes |
| `booking_app` | Scheduling / reservation | Booking, appointment, resource scheduling | Time-slot logic + availability checks |
| `ecommerce` | Catalog + cart + checkout | ecom-agent, storefront | `order` / `cart` / `payment` table patterns |
| **`api_service`** | **Backend-only REST API, no UI** | Rate-limited API, validated forms, data API | Endpoints only, no `PAGE_DEF` nodes |
| **`etl_pipeline`** | **Scheduled data transformation** | Nightly sync, report generation | `CRON` + external data source + write pattern |
| **`webhook_handler`** | **Receives external events, processes** | Stripe webhook, GitHub handler, Slack bot | Single endpoint + signature verification + downstream actions |
| **`batch_job`** | **Scheduled background work, no UI** | Cleanup, aggregation, reminders | `CRON` + no user-facing endpoints |
| **`data_sync`** | **Syncs between two systems** | CRM ↔ email, Postgres ↔ S3 | Two `SERVICE_CALL` / adapter patterns + reconciliation |
| `general` | Catch-all when nothing dominates | Early-stage scratch apps | Falls through when no pattern scores above threshold |

**How archetype is detected:**

Not from template name — from structural signal. Lives at [`playground/supervisor/archetype.js`](playground/supervisor/archetype.js). A decision-tree rule chain over parser output:

1. `num_pages == 0` AND `has_cron` → `etl_pipeline` / `data_sync` / `batch_job` (differentiated by external adapter count)
2. `num_pages == 0` AND single endpoint with signature or webhook path → `webhook_handler`
3. `num_pages == 0` with endpoints → `api_service`
4. `has_websocket` (SUBSCRIBE / BROADCAST nodes) → `realtime_app`
5. `has_agent` (AGENT / RUN_AGENT / ASK_AI nodes) → `agent_workflow`
6. `has_status_field` + `has_auth` + `has_routing_logic` → `routing_engine`
7. `has_status_field` + `has_auth` → `queue_workflow`
8. `num_charts >= 2` → `dashboard`
9. Tables match ecommerce pattern (`order`, `cart`, `payment`, `product`, `invoice`) → `ecommerce`
10. Fields match booking pattern (`slot`, `appointment`, `start_time`, `booking`) → `booking_app`
11. `has_belongs_to` (fieldType=`fk`) AND `num_pages >= 2` → `content_app`
12. `num_tables >= 1` + `num_endpoints >= 2` + `num_pages >= 1` → `crud_app`
13. No signal dominates → `general`

This classifier is deterministic, runs in milliseconds, and is interpretable — you can log "detected `queue_workflow` because tables have a `status` field and the app has auth policies." When the classifier is wrong, you add a rule. No ML needed.

**Stored as:** a column on `code_actions` in the Factor DB. Backfilled at row-insert time by calling `classifyArchetype(parse(source))`. Indexed for fast `WHERE archetype = ?` filtering.

**Validation:** all 8 core templates classify to the correct archetype (see `playground/supervisor/archetype.test.js`).

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
WHERE archetype = 'queue_workflow'       ← only look at Marcus-style approval apps
  AND error_category = 'validation'      ← same error category
  AND has_auth = 1                       ← same auth posture
ORDER BY test_score DESC
LIMIT 50
```

That's engineer-like. "In approval-queue apps with auth, when a validation error hits, what fixes worked?" — not "what fixed this error string in any app ever."

Another example — a webhook handler hitting a signature error:
```
SELECT * FROM code_actions
WHERE archetype = 'webhook_handler'
  AND error_category = 'signature_mismatch'
ORDER BY test_score DESC
LIMIT 50
```

Webhook bugs look very different from CRUD bugs. Keeping archetypes separate prevents noisy retrieval.

**Why this still works with XGBoost:**

The total feature count is ~20, not thousands. Each feature is low-cardinality (booleans, small categoricals). XGBoost handles this natively, captures feature interactions (e.g. "has_auth=true AND error=validation → prefer middleware patches"), and stays interpretable — you can literally print feature importance and understand what the model learned.

**When global context doesn't help:**

Some errors are purely syntactic (missing quote, unbalanced brace). Global features add noise for those. The re-ranker learns to ignore them — XGBoost naturally down-weights features that don't correlate with outcomes for specific error types. No hand-tuning needed.

---

## Factor DB — Implementation Status

The Factor DB is the persistent store that makes the flywheel run. It's **live as of Session 37**.

**Location:** `playground/factor-db.sqlite` — SQLite with WAL mode.

**Schema (condensed):**

```sql
CREATE TABLE code_actions (
  id              INTEGER PRIMARY KEY,
  session_id      TEXT NOT NULL,
  archetype       TEXT,              -- classified from parser output
  task_type       TEXT,              -- e.g. 'compile_cycle'
  error_sig       TEXT,              -- hash of error messages
  file_state_hash TEXT,              -- hash of source_before
  source_before   TEXT,              -- up to 5000 chars
  patch_ops       TEXT,              -- JSON array (empty until patch.js usage grows)
  patch_summary   TEXT,              -- human-readable
  compile_ok      INTEGER,           -- 1 = clean compile
  test_pass       INTEGER,           -- 1 = all tests passed
  test_score      REAL,              -- fraction of passing tests
  embedding       BLOB,              -- reserved for Phase 2 (JS diff embeddings)
  created_at      INTEGER
);

-- Plus: ga_runs, ga_candidates, reranker_feedback tables
-- Indexes: archetype, task_type, error_sig, (test_pass, test_score DESC)
```

**Write path (wired, automatic):**

Every `/api/chat` Meph session now writes rows:

1. `edit_code` / `patch_code` tool → updates `_sourceBeforeEdit` snapshot
2. `compile` tool → classifier runs, row inserted with `{archetype, error_sig, compile_ok, source_before}`, `_lastFactorRowId` stored
3. `run_tests` tool → `_lastFactorRowId` row updated with `{test_pass, test_score}`

Non-fatal: if the DB fails to open at server boot, sessions continue without logging.

**Read path (for retrieval — not yet wired to Meph's context):**

```js
import { FactorDB } from './supervisor/factor-db.js';
const db = new FactorDB('./playground/factor-db.sqlite');

// Find top-5 past fixes for the same archetype + error category
const hints = db.querySimilar({
  archetype: 'queue_workflow',
  error_sig: 'abc123',
  topK: 5,
});
```

**Archetype classifier:** `playground/supervisor/archetype.js` — 15 categories, deterministic rules over parser output, runs in milliseconds, all 8 core templates classify correctly.

**Current state:**
- 28 rows seeded by cold start (8 template gold + 20 curriculum skeletons)
- Rows accumulate automatically from every Studio Meph session
- BM25 retrieval active
- XGBoost training: not yet built (unlocks at 200 passing rows)
- Suggestion injection into Meph's context: not yet built

---

## How to Get the Flywheel Going

Concrete actions, ordered by what happens when.

### Already done (Session 37)

- Factor DB schema live with 28 seed rows
- Archetype classifier wired
- `/api/chat` writes rows on every compile + test
- Cold-start harness available: `node playground/supervisor/cold-start.js`

### Accelerate data accumulation (next)

The flywheel is now passively collecting data from real Meph sessions. To actively accelerate:

1. **Run the 5 Marcus apps through Meph in Studio.** Each build = 10-30 rows. Five apps = 50-150 rows, plus real archetype coverage for `queue_workflow`, `routing_engine`, `agent_workflow`. This is also how you stress-test the system prompt and find gaps.

2. **Curriculum sweep harness (build next).** ~50 lines: for each of the 20 curriculum tasks, start a worker, give it the task, collect rows. Can run 3 tasks in parallel via supervisor. Each sweep: ~300-500 rows. Three sweeps → re-ranker threshold.

3. **Eval parallelization.** Run `eval-meph.js` scenarios across N workers. Every push accumulates evaluation trajectories too.

### Train the re-ranker (when ready)

At 200+ passing rows:

1. Export training data: `SELECT ... FROM code_actions WHERE test_pass IS NOT NULL`
2. Feature engineering: extract global + local features (already defined in `archetype.js` + structural features)
3. Train XGBoost: `xgboost-node` or Python `xgboost` — ~10 seconds on CPU for 1000 rows
4. Export ONNX: portable model that runs anywhere

### Wire suggestions into Meph (last step)

In `/api/chat`, after a compile error:

```js
const hints = factorDB.querySimilar({
  archetype: _safeArchetype(currentSource),
  error_sig: _sha1(result.errors.map(e => e.message).join('\n')),
  topK: 3,
});
// Inject as text into next Meph turn:
// "Based on 847 similar past situations, these approaches worked: ..."
```

This is the final loop closure. Until this step, the DB is gathering data without influencing Meph's behavior. After this step, every session improves every future session.

**Bar for declaring the flywheel "live":** a new session where Meph hits an error, receives an injected hint, applies a patch based on it, and passes tests. Log that event. Celebrate.

---

## Multi-Session Supervisor — When and Where to Use It

The supervisor architecture (`playground/supervisor.js` + `supervisor/*`) spawns N worker servers on sequential ports and coordinates them via HTTP. It's built. But the value is internal, not user-facing. Ranked by leverage:

### 1. Eval suite parallelization (HIGH leverage — BUILT)

`playground/eval-parallel.js` runs 16 Meph scenarios across N workers with contiguous slicing (preserves editor-state dependencies within each slice). Typical: 3 workers → ~30s vs ~90s sequential.

```
node playground/eval-parallel.js --workers=3
```

Shared scenario definitions live in `playground/eval-scenarios.js`, imported by both the sequential `eval-meph.js` and the parallel version. Swap in pre-push hook when ready.

### 2. Curriculum sweep for Factor DB acceleration (HIGH leverage — BUILT)

`playground/supervisor/curriculum-sweep.js` drives all 20 curriculum tasks (`curriculum/tasks/*.json`, L1–L10) through N parallel workers. Each task → 5–30 compile cycles → 5–30 Factor DB rows via the `/api/chat` hook.

```
node playground/supervisor/curriculum-sweep.js --workers=3
node playground/supervisor/curriculum-sweep.js --tasks=hello-world,echo --workers=2
node playground/supervisor/curriculum-sweep.js --dry-run
```

Budget: ~$0.20–1.00 per full sweep. Three sweeps (60 task attempts) → ~1200 rows → past the XGBoost training threshold.

**This is the fastest path to a live re-ranker.** Organic session traffic (Russell + a few users) won't hit 200 passing rows for months. Curriculum sweeps get there in hours.

### 3. Compiler adversarial testing (MEDIUM leverage — ad hoc)

Point 5 workers at deliberately weird prompts simultaneously:
- "Build a todo app that uses every synonym for every keyword"
- "Build an app with 50 tables, all with `belongs_to`"
- "Build an RBAC-heavy app with no auth"

Each worker is an independent Meph instance — different Claude sampling, different exploration paths. Novel Clear programs surface compiler edge cases you'd never write unit tests for. This is self-play bug hunting: the 1947-test compiler suite covers known patterns; the workers find the unknown ones.

**This is how Clear's reliability ladder keeps climbing.** Every regression caught here is a Marcus incident prevented.

### 4. Design variant generation (LOW leverage — requires theme system first)

Once `design like 'linear'` ships as a Clear directive, the "show me 3 options" flow becomes: 3 workers build the same app spec with different themes. User picks one in the UI. This is the only direct user-facing use for multi-session — and it's not for Marcus. It's for Sara-tier users who care about design variety.

Don't build this until the theme system exists and a real user asks for it.

### What multi-session is NOT for

- **"Faster Marcus app build."** Solo Meph builds one app at a time; Russell watches one build at a time. Running 3 parallel Mephs on 3 apps produces 3 apps at the same pace as sequential — you can't watch or judge 3 simultaneously.
- **"Collective intelligence."** Workers are independent Claude sessions. No shared hidden state. Three heads are not better than one on a single task — they're three parallel attempts at the same task, not a collaborative build.
- **"Building apps for users."** Multi-session is infrastructure for Clear's development speed. Users see single-session Meph.

### Summary

| Use | When | Leverage | Built? |
|-----|------|----------|--------|
| Eval parallelization | Every CI run | High | ✅ `playground/eval-parallel.js` |
| Curriculum sweep | Weekly, or to accelerate flywheel | High | ✅ `playground/supervisor/curriculum-sweep.js` |
| Adversarial testing | Before major ships | Medium | ⬜ — prompts need to be written |
| Design variants | After theme system | Low | ⬜ and blocked on theme system |

Both high-leverage harnesses shipped Session 37. Two remaining items are lower priority — adversarial testing is valuable but not time-critical; design variants blocked on theme infrastructure.

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
