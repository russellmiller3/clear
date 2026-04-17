# Plan: Supervisor + Multi-Session Architecture

**Date:** 2026-04-17
**Branch:** `feature/supervisor-multi-session`
**Status:** Plan only — no implementation yet
**Logger tag:** `[SUPERVISOR]`

---

## What This Is (Plain English)

Right now Studio is a single room: one Meph, one running app, one conversation at a time. This plan makes it a building: a Supervisor Meph on the ground floor, N Worker Meph sessions on upper floors, each working in parallel on their own sandbox, and a lift (session registry + event bus) that lets the Supervisor watch, redirect, and harvest the best results.

**What this buys:**
- Parallel exploration of solution paths (Worker A tries one approach, Worker B tries another, Supervisor picks the winner)
- Better eval coverage (N workers can run N independent eval suites simultaneously)
- Faster task completion for decomposable work (split a 5-endpoint API across 3 workers)
- A structured record of which code actions work in which contexts (Factor DB)

**What this does NOT buy:**
- Recursive self-improvement — the re-ranker improves action selection, not the generator LLM
- Emergent intelligence — workers are independent Claude sessions, no shared hidden state
- Autonomous capability growth — the system gets better at *choosing among proposed actions*, not at proposing better actions than a solo Meph would

---

## Section 0: Before Starting

```
Branch:   feature/supervisor-multi-session
Tag:      [SUPERVISOR]
Ports:    3456 = Supervisor IDE (existing Studio)
          3457-34(56+N) = Worker IDE servers (one per worker session)
          4001-4100 = Running app ports per worker (each worker cycles its own range)
          4999 = Eval child per session (session-scoped, not global)
```

Create `PROGRESS.md` at repo root to track which phases are done.

---

## Section 1: Existing Code (read by phase — do NOT read all at once)

### Always read first (every phase):
| File | Why |
|------|-----|
| `intent.md` | Authoritative spec — check before adding any new node types |
| `learnings.md` TOC | Known traps — scan before touching compiler |

### Phase 1 (Session Registry):
| File | Why |
|------|-----|
| `playground/server.js` lines 157–230 | Global state: `runningChild`, `runningPort`, `evalChild`, `terminalBuffer` — everything that must be partitioned |
| `playground/server.js` lines 1476–1590 | `/api/run` — how child processes are spawned today |
| `playground/server.js` lines 1656–1680 | `/api/app-status` — what exists for status queries |

### Phase 2 (Supervisor Server — spawn/manage workers):
| File | Why |
|------|-----|
| `playground/server.js` lines 1–50 | Server bootstrap — how to fork new instances |
| `cli/clear.js` lines 1–60 | CLI entry point — understand `--port` arg handling |

### Phase 3 (Supervisor Loop — observe + act):
| File | Why |
|------|-----|
| `playground/server.js` lines 241–305 | Terminal buffer structure — what the supervisor will poll |
| `playground/system-prompt.md` | Supervisor Meph's starting instructions — will be extended |
| `playground/server.js` `/api/run-tests` | Test result schema the supervisor reads |

### Phase 4 (Task Distribution):
| File | Why |
|------|-----|
| `playground/system-prompt.md` | Tool list — what supervisor tools look like today |
| `playground/server.js` `/api/chat` ~line 2124 | Chat endpoint — how to programmatically start a Worker Meph session |

### Phase 5 (Factor DB + Re-ranker):
| File | Why |
|------|-----|
| `patch.js` | Patch API — the action space the Factor DB records |
| `curriculum/` directory listing | Cold-start data — what's available |
| `runtime/db.js` | SQLite patterns — how we already use better-sqlite3 |

### Phase 6 (Merge Step):
| File | Why |
|------|-----|
| `patch.js` | Patch ops — how to replay a worker's actions onto a base |
| `index.js` `compileProgram` | Compiler entry — how to validate merged output |

### Phase 7 (Observability):
| File | Why |
|------|-----|
| `playground/ide.html` | Existing terminal pane, test pane, chat pane — where to add supervisor panel |

---

## Section 2: What We're Building

### ASCII: Before

```
User ──→ Studio (port 3456)
              │
              ├─ Meph (single Claude session)
              ├─ runningChild (one app process)
              └─ terminalBuffer (single ring buffer)
```

### ASCII: After (MVP — N=3 workers)

```
User ──→ Supervisor Studio (port 3456)
              │
              ├─ Supervisor Meph (Claude session #0)
              │     │ observes via HTTP polling
              │     │ assigns tasks via /api/chat
              │     │ reads factor DB for action suggestions
              │     └─ merges best output into main worktree
              │
              ├─ Session Registry (SQLite sessions.db)
              │
              ├─ Worker #1 (port 3457)
              │     ├─ Worker Meph (Claude session #1)
              │     ├─ runningChild (own app process)
              │     └─ terminalBuffer (own ring buffer)
              │
              ├─ Worker #2 (port 3458)
              │     ├─ Worker Meph (Claude session #2)
              │     ├─ runningChild (own app process)
              │     └─ terminalBuffer (own ring buffer)
              │
              ├─ Worker #3 (port 3459)
              │     └─ ... same
              │
              └─ Factor DB (SQLite factor-db.sqlite)
                    ├─ code_actions (logged trajectories)
                    └─ embeddings (bi-encoder vectors for fast retrieval)
```

### Key Architecture Decision: Multi-server, not session-scoped globals

**Option rejected:** Adding `sessionId` to all existing global variables in one server.
**Why:** Risky refactor of a production server that already works. Every endpoint must be updated. One missed partition = data bleed between sessions.

**Option chosen:** Each Worker is a separate `node playground/server.js` process on a different port. Zero changes to worker servers. Supervisor is a thin orchestration layer that speaks HTTP to workers.

Workers are dumb — they don't know they're in a swarm. They just run. The Supervisor knows everything.

---

## Section 3: Data Flow

### Supervisor boot sequence:
```
1. supervisor start (node playground/supervisor.js --workers=3)
2. Read sessions.db → find stale sessions, kill their ports
3. Spawn N worker servers (node playground/server.js --port=345X --session-id=workerX)
4. Write session records (id, port, state=idle)
5. Open Supervisor Studio in browser (port 3456)
6. User assigns tasks via Supervisor chat panel
```

### Per-task flow:
```
User types task → Supervisor Meph
  → Supervisor decomposes (or passes as-is for MVP)
  → POST worker_port/api/chat { messages: [{role:'user', content: subtask}] }
  → Worker Meph runs autonomously (write code, compile, test, iterate)
  → Supervisor polls every 10s:
      GET worker_port/api/terminal-log → read [supervisor] tagged lines
      GET worker_port/api/app-status   → is it running?
      POST worker_port/api/run-tests   → get test results
  → Worker reaches terminal state (all tests pass OR stalled >5min OR N retries failed)
  → Supervisor reads best output via GET worker_port/api/current-source
  → Supervisor merges into main worktree
  → Logs trajectory to Factor DB
```

### Factor DB write flow:
```
Every (compile + test) sequence on any worker:
  context = {task_type, error_sig, file_state_hash}
  action  = {patch_ops}   ← from patch.js
  outcome = {compile_ok, test_pass, test_score}
  → INSERT INTO code_actions (context..., action..., outcome...)
  → IF embedding_model loaded: embed context, store vector
```

### Re-ranker query flow (full version, not MVP):
```
Worker hits compile error
  context = extract_context(error_message, task_type, source_hash)
  candidates = bi_encoder.query(context, top_k=50)   ← fast first pass
  ranked    = cross_encoder.rerank(context, candidates, top_k=3)   ← slow but accurate
  Meph receives ranked suggestions: "Past successful fixes for this pattern:"
  Meph selects or adapts top-1
  Outcome logged back to factor_db
```

### Genetic Algorithm loop (full version — replaces "Meph retries with same strategy"):
```
Task assigned to GA-mode worker
  GENERATION 0 (seed):
    LLM generates POP_SIZE candidates at varied temperatures (0.3, 0.6, 0.9)
    + top-K Factor DB retrievals seeded as additional candidates
    All candidates evaluated in parallel: one sandbox per candidate
    Fitness = { test_score, compile_ok, warnings_count, source_length }
    Pareto-rank candidates → Pareto front = generation 0 elite set

  EACH GENERATION (1..max):
    Select parents from elite set (tournament selection, k=3)

    CROSSOVER (prob GA_CROSSOVER_RATE per offspring):
      parent_a.patch_ops[:split] + parent_b.patch_ops[split:]
      Validate: no duplicate endpoint paths, no conflicting table names
      If invalid → repair: drop conflicting ops, or fall back to mutation

    MUTATION (prob GA_MUTATION_RATE per offspring):
      Pick one patch-op from parent, ask LLM to rewrite it differently
      (LLM-as-mutation-operator: AlphaEvolve / FunSearch pattern)

    DIVERSITY CHECK (before eval):
      Jaccard similarity on patch-op types vs existing population
      If similarity > GA_DIVERSITY_THRESHOLD → discard, generate new offspring

    EVALUATE offspring in parallel sandboxes (same as generation 0)
    RE-RANKER FILTER: if re-ranker loaded, score all offspring first;
      skip full sandbox eval for bottom-quartile candidates (cheap filter)

    UPDATE population:
      Merge offspring into population, keep Pareto-non-dominated set
      MAP-Elites grid update: behavioral niche = (task_type, error_category)
        → each cell keeps its best-fitness resident; new candidates evict only
        when they strictly dominate the current cell occupant

    BASELINE INJECTION (every 5 generations):
      Add 1 fresh LLM-generated candidate at temperature=1.0 (no Factor DB seed)
      Prevents closed-loop drift: re-ranker trains on GA outputs but GA must
      also explore directions the re-ranker hasn't seen yet

    TERMINATION CHECK:
      • all_tests_pass=1 on any candidate → SOLUTION FOUND, stop
      • best_score unchanged for 3 generations → fitness plateau, stop
      • total elapsed > GA_COMPUTE_BUDGET_MS → BUDGET EXHAUSTED, stop
      • generation >= GA_MAX_GENERATIONS → stop

  FINAL: best Pareto-front candidate promoted to supervisor
  Full trajectory logged to Factor DB (all candidates, all generations)
  Re-ranker training set grows with this run's outcomes
```

---

## Section 4: Integration Points

| Producer | Consumer | Data Format | Mechanism |
|----------|----------|-------------|-----------|
| Worker server | Supervisor loop | `{lines: string[], frontendErrors: []}` | HTTP GET `/api/terminal-log` |
| Worker Meph | Supervisor | `{passed, failed, results:[]}` | HTTP POST `/api/run-tests` |
| Supervisor | Worker Meph | First chat message with task | HTTP POST `/api/chat` (SSE) |
| Sandbox runner | Factor DB | `{context, action, outcome}` | Direct SQLite INSERT in post-test hook |
| Factor DB | Meph context | Top-K suggested patches, plain English | Injected into Meph system prompt or tool result |
| Supervisor loop | Observability pane | `{sessions: [SessionRecord]}` | SSE from `/api/supervisor/status` |
| Git worktrees | Merge step | `.clear` source files | `git diff`, `patch.js` apply |
| GA seed pool | GeneticOptimizer | Top-K past patch-op sequences with `test_pass=1` | Factor DB BM25/vector query at generation 0 |
| GA offspring | Sandbox runner | patch-op sequence → evaluated `{compile_ok, test_score}` | N parallel `runTestProcess` calls (one per candidate) |
| Re-ranker | GA offspring filter | Predicted test_score per candidate (scalar) | In-process cross-encoder, no HTTP |
| GeneticOptimizer | Factor DB | One `ga_candidates` row per evaluated candidate | Direct SQLite INSERT after each sandbox eval |
| GA Pareto front | Supervisor loop | Best candidate source + fitness | `GeneticOptimizer.getBest()` in-process call |

---

## Section 5: Edge Cases

| Scenario | How we handle it |
|----------|-----------------|
| Worker crashes mid-task | Supervisor detects no heartbeat (app-status 404), marks session `crashed`, reassigns task to new worker or logs partial trajectory |
| Two workers produce conflicting code (same endpoint, different impl) | Supervisor picks the one with higher test_score. If tied, pick the one with fewer lines (simpler wins). Never auto-merge conflicting endpoint signatures — flag to user |
| Worker base diverged from main worktree | Merge is only safe for **semantic patch ops** (`add_endpoint`, `add_field`, `add_table`, `add_agent`, `add_validation`). Positional ops (`fix_line`, `insert_line`, `remove_line`) embed line numbers from the worker's starting source — if main has since changed, those line numbers are stale and the patch corrupts the output. Rule: if worker trajectory contains positional ops, block auto-merge and flag to user. If supervisor intends to support auto-merge, it must track the worker's base commit and refuse to merge if main has advanced beyond it. |
| Worker Meph loops (same error repeated >3 times) | Supervisor detects repeated error_sig in terminal log. Injects "stuck" signal into worker chat: "You've hit this error 3 times. Try a different approach." If still stuck after 2 more attempts, kill and reassign |
| Port collision across workers | Session registry is source of truth for port allocation. Before spawning any worker, supervisor checks registry + tries to bind socket. Uses exponential backoff starting at 3457 |
| Factor DB grows unbounded | Prune entries older than 90 days or when db > 500MB. Keep 100% of entries with `outcome_test_pass=1` (gold data). Prune failed entries first |
| Re-ranker suggests a patch that breaks compilation | Outcome logged as `compile_ok=0` → down-weights that pattern automatically. No rollback needed — patch is just a suggestion, Meph still validates |
| Worker API key exhausted / rate limited | Supervisor detects 429 from `/api/chat`. Backs off that worker for 60s. Continues other workers |
| Supervisor itself crashes | Sessions persisted in SQLite — supervisor restarts, reads registry, re-attaches to live worker processes (workers don't stop when supervisor restarts) |
| **GA: Premature convergence** | All candidates reach the same local optimum (same test_score, no improvement). Detected when Pareto-front diversity drops: if all candidates in the front have Jaccard similarity >0.8 on patch-op types, force-inject `GA_NOVELTY_INJECTION_COUNT` (default 3) random-seed candidates drawn at temperature=1.0. If MAP-Elites grid has <25% cells occupied, convergence is confirmed — inject and widen temperature range. |
| **GA: Crossover produces invalid Clear syntax** | Splicing two patch-op sequences may create semantic conflicts: endpoint path duplicated, table defined twice, validation block referencing a non-existent field. Repair operator runs *before* sandbox eval: (1) deduplicate endpoint paths (keep first), (2) deduplicate table names (keep first), (3) drop validation ops whose target field was removed by a later op. If repair still fails compile, discard offspring and log `origin='crossover_discarded'`. |
| **GA: Closed-loop re-ranker drift** | Re-ranker trains on Factor DB rows that were generated by GA runs that used the re-ranker as a filter → selection bias grows each training round. Mitigation: keep a fixed 10% random-baseline holdout in each generation (origin='baseline', not scored by re-ranker before eval). Monitor `precision@1` on curriculum validation set. If it drops across two consecutive training rounds, suspend re-ranker filter for one GA run to let unfiltered data in. |
| **GA: Compute explosion (N × M × K sandboxes)** | POP_SIZE=10, MAX_GEN=20 = 200 sandbox runs per task × multiple workers. At 5s per run this is 1000s per worker per task. Mitigation: (1) compile-only pre-filter — reject non-compiling candidates before running tests (compile is ~0.1s, test is ~5s), (2) progressive deepening — gen 0–2 run only first 2 test blocks, gen 3+ run full suite, (3) honor `GA_COMPUTE_BUDGET_MS` hard stop. |
| **GA: Multi-objective fitness conflict** | Pareto-optimal set may contain one candidate with 100% tests + 200 lines and another with 80% tests + 50 lines. Supervisor can't auto-pick. Resolution: default to highest `test_score` (correctness first). If tied, prefer shorter source. Flag to user when top-2 Pareto candidates differ by >10% on any secondary objective — let user decide. |
| **GA: LLM mutation returns semantically identical op** | Mutation asks LLM to rewrite one patch-op differently but LLM may return nearly the same op. Detect via Jaccard similarity on token set of `patch_summary`. If >0.9 similarity to parent op, retry mutation once. If still too similar, fall back to crossover for that offspring slot. |

---

## Section 6: ENV VARS

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `SUPERVISOR_WORKERS` | Optional | `2` | Number of worker sessions to spawn |
| `SUPERVISOR_POLL_INTERVAL_MS` | Optional | `10000` | How often supervisor polls workers |
| `SUPERVISOR_PORT` | Optional | `3456` | Supervisor IDE port |
| `WORKER_BASE_PORT` | Optional | `3457` | First worker port (increments per worker) |
| `FACTOR_DB_PATH` | Optional | `playground/factor-db.sqlite` | Path to Factor DB |
| `FACTOR_DB_MAX_BYTES` | Optional | `536870912` (500MB) | Prune threshold |
| `RERANKER_MODEL_PATH` | Optional | `null` | Path to trained cross-encoder model. If null, falls back to BM25 retrieval |
| `RERANKER_EMBED_MODEL` | Optional | `all-MiniLM-L6-v2` | Bi-encoder model for fast first-pass (runs locally via onnxruntime-node) |
| `COLD_START_CURRICULUM` | Optional | `curriculum/` | Directory of curriculum tasks for bootstrapping Factor DB |
| `ANTHROPIC_API_KEY` | Required | — | For Supervisor + all Worker Meph sessions |
| `GA_ENABLED` | Optional | `false` | Opt-in. If false, workers use single-trajectory Meph (current behavior). Set to `true` to activate GA loop per task. |
| `GA_POPULATION_SIZE` | Optional | `10` | Candidates per generation. Each needs a sandbox. Don't exceed `SUPERVISOR_WORKERS × 2`. |
| `GA_MAX_GENERATIONS` | Optional | `20` | Hard cap on generations before declaring budget exhausted. |
| `GA_MUTATION_RATE` | Optional | `0.3` | Fraction of new offspring produced via LLM mutation (vs crossover). |
| `GA_CROSSOVER_RATE` | Optional | `0.5` | Fraction via crossover. `1 - GA_MUTATION_RATE - GA_CROSSOVER_RATE` = fraction seeded fresh from LLM. |
| `GA_DIVERSITY_THRESHOLD` | Optional | `0.3` | Min Jaccard distance (patch-op type sets) between any two population members. Below this → one is discarded. |
| `GA_COMPUTE_BUDGET_MS` | Optional | `300000` | Hard wall (5 min default) — GA terminates regardless of generation count. |
| `GA_NOVELTY_INJECTION_COUNT` | Optional | `3` | Forced-random candidates injected when convergence detected (Pareto-front Jaccard >0.8). |
| `GA_BASELINE_INJECTION_EVERY` | Optional | `5` | Inject one unfiltered (no re-ranker) baseline candidate every N generations to prevent drift. |

---

## Section 7: Files to Create

### `playground/supervisor.js` — Supervisor server (new)

```javascript
// Entry point for the supervisor process.
// Spawns N worker servers, manages session registry,
// serves the supervisor UI on SUPERVISOR_PORT.
// Does NOT modify playground/server.js.

import { SessionRegistry } from './supervisor/registry.js';
import { SupervisorLoop } from './supervisor/loop.js';
import { WorkerSpawner } from './supervisor/spawner.js';
import express from 'express';

const app = express();
const registry = new SessionRegistry('playground/sessions.db');
const spawner = new WorkerSpawner(registry);
const loop = new SupervisorLoop(registry);

// REST API for supervisor panel in IDE
app.get('/api/supervisor/status', loop.statusSSE);       // SSE: live session states
app.post('/api/supervisor/assign', loop.assignTask);     // assign task to a worker
app.post('/api/supervisor/kill', loop.killSession);      // kill a worker session
app.post('/api/supervisor/merge', loop.mergeSession);    // merge winner's output
app.get('/api/supervisor/factor-db/suggest', ...);      // query Factor DB for suggestions

// Boot
const N = parseInt(process.env.SUPERVISOR_WORKERS || '2');
await spawner.spawnAll(N);
loop.start(parseInt(process.env.SUPERVISOR_POLL_INTERVAL_MS || '10000'));
app.listen(process.env.SUPERVISOR_PORT || 3456);
```

### `playground/supervisor/registry.js` — Session Registry

**Schema (SQLite):**

```sql
-- Session lifecycle record
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,          -- 'worker-1', 'worker-2', ...
  task        TEXT,                       -- current assigned task (plain English)
  state       TEXT NOT NULL              -- idle | running | completed | failed | stalled | crashed
              DEFAULT 'idle',
  port        INTEGER NOT NULL,           -- worker IDE server port
  pid         INTEGER,                    -- worker server OS process id
  worktree    TEXT,                       -- git worktree path (null until assigned)
  source      TEXT,                       -- last .clear source output (snapshot)
  test_pass   INTEGER DEFAULT 0,          -- 1 if last run passed all tests
  test_score  REAL DEFAULT 0.0,           -- fraction of tests passing (0.0–1.0)
  test_summary TEXT,                      -- JSON: {passed, failed, total, errors:[]}
  error_sig   TEXT,                       -- hash of last compile/runtime error
  stall_count INTEGER DEFAULT 0,          -- times supervisor detected no progress
  assigned_at INTEGER,                    -- unix ms
  completed_at INTEGER,
  updated_at  INTEGER NOT NULL
);

-- Supervisor action log (what supervisor did and why)
CREATE TABLE supervisor_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  action      TEXT NOT NULL,             -- 'assign' | 'kill' | 'nudge' | 'merge' | 'promote'
  reason      TEXT,                       -- plain English explanation
  payload     TEXT,                       -- JSON: extra data for the action
  ts          INTEGER NOT NULL
);
```

### `playground/supervisor/loop.js` — Supervisor observation + action loop

Core poll cycle pseudocode:
```
every POLL_INTERVAL:
  for each session in registry where state IN ('running'):
    term = GET session.port/api/terminal-log
    tests = POST session.port/api/run-tests { source: session.source }
    
    detect_stall(session, term)    ← no new [meph] lines since last poll?
    detect_stuck(session, term)    ← same error_sig 3+ times?
    detect_complete(session, tests) ← all tests pass?
    
    update_registry(session, tests, term)
    log_to_factor_db(session)     ← every poll cycle captures a trajectory point

  emit SSE to supervisor UI: current registry snapshot
```

**Supervisor actions:**
- `assign(session_id, task)` — POST task to worker `/api/chat` as first message. Sets state=running.
- `nudge(session_id, hint)` — POST hint to worker `/api/chat` as a follow-up. Used when stuck detected.
- `kill(session_id)` — POST worker `/api/stop`, kill worker OS process, set state=crashed.
- `promote(session_id)` — copy worker's source to supervisor context as the candidate for merge.
- `merge(session_id)` — apply worker's patch sequence to main worktree via `patch.js`. Validate with compiler.

### `playground/supervisor/factor-db.js` — Factor DB + Re-ranker

**Schema (SQLite):**

```sql
-- Core action log: one row per (compile + test) cycle
CREATE TABLE code_actions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       TEXT NOT NULL,             -- which worker session
  task_type        TEXT,                       -- 'add_endpoint' | 'fix_validation' | 'add_table' | 'fix_error' | 'refactor'
  error_sig        TEXT,                       -- SHA1(error_message + '\x00' + file_state_hash) — null-byte delimiter prevents "AX"+"BC" = "A"+"XBC" collision
  file_state_hash  TEXT,                       -- SHA1(source_before_patch) — identifies the starting state
  source_before    TEXT,                       -- full .clear source before this action
  patch_ops        TEXT NOT NULL,              -- JSON: array of patch.js operations [{op, ...}]
  patch_summary    TEXT,                       -- human-readable description of what the patch does
  compile_ok       INTEGER NOT NULL DEFAULT 0, -- 1 = compiled cleanly
  test_pass        INTEGER NOT NULL DEFAULT 0, -- 1 = all tests passed
  test_score       REAL NOT NULL DEFAULT 0.0,  -- fraction of tests passing
  score_delta      REAL DEFAULT 0.0,           -- improvement vs previous attempt on same task
  embedding        BLOB,                       -- 128-dim float32 vector (bi-encoder of context features)
  created_at       INTEGER NOT NULL
);

-- Retrieval index: precomputed for fast first-pass
CREATE INDEX idx_task_type    ON code_actions(task_type);
CREATE INDEX idx_error_sig    ON code_actions(error_sig);
CREATE INDEX idx_test_pass    ON code_actions(test_pass, test_score DESC);
CREATE INDEX idx_created_at   ON code_actions(created_at);

-- Re-ranker training log: records when a suggestion was used and what happened
CREATE TABLE reranker_feedback (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id       INTEGER REFERENCES code_actions(id),
  was_used        INTEGER DEFAULT 0,           -- 1 = Meph actually applied this suggestion
  outcome_score   REAL,                         -- test_score after applying
  ts              INTEGER NOT NULL
);

-- GA run: one row per genetic optimization run (one task in GA mode)
CREATE TABLE ga_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL,
  task            TEXT,
  generation      INTEGER DEFAULT 0,            -- current generation number
  best_score      REAL DEFAULT 0.0,
  population_size INTEGER NOT NULL,
  status          TEXT DEFAULT 'running',       -- running | solution_found | converged | budget_exhausted
  clear_version   TEXT,                         -- synonyms.js SYNONYM_VERSION at run time (for drift tracking)
  created_at      INTEGER NOT NULL,
  completed_at    INTEGER
);

-- GA candidates: one row per evaluated (generation, candidate) pair
CREATE TABLE ga_candidates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES ga_runs(id),
  generation      INTEGER NOT NULL,
  parent_ids      TEXT,                         -- JSON: [id, id] for crossover, [id] for mutation, null for seed
  origin          TEXT NOT NULL,                -- 'seed' | 'crossover' | 'mutation' | 'baseline' | 'crossover_discarded'
  patch_ops       TEXT NOT NULL,                -- JSON: array of patch.js ops
  patch_summary   TEXT,                         -- human-readable: what this candidate does
  source          TEXT,                         -- .clear source after applying patch_ops
  compile_ok      INTEGER DEFAULT 0,
  test_score      REAL DEFAULT 0.0,             -- fraction of tests passing
  test_pass       INTEGER DEFAULT 0,            -- 1 if all tests pass
  warnings_count  INTEGER DEFAULT 0,
  source_length   INTEGER DEFAULT 0,            -- char count of .clear source
  novelty_score   REAL DEFAULT 0.0,             -- Jaccard distance to nearest neighbor in population
  reranker_score  REAL DEFAULT 0.0,             -- predicted test_score from cross-encoder (0 if not available)
  pareto_rank     INTEGER DEFAULT 0,            -- 0 = Pareto front, 1 = dominated by 1, etc.
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_ga_run_id      ON ga_candidates(run_id, generation);
CREATE INDEX idx_ga_pareto      ON ga_candidates(run_id, pareto_rank, test_score DESC);
CREATE INDEX idx_ga_status      ON ga_runs(status, created_at);
```

**What counts as a "code action" (the unit of the Factor DB):**

A code action is a **patch-op sequence bounded by one compile+test run.** Specifically:
- The sequence of patch.js operations Meph applied between the previous compile attempt and the current one
- Bounded on the left by "the source state before Meph started editing"
- Bounded on the right by "the compile+test outcome"
- A single edit-compile-test cycle = one row, even if Meph made multiple patch ops inside it

Why this granularity? Finer (individual patch ops) loses context — a single `fix_line` is meaningless without knowing what error it fixed. Coarser (whole task) loses precision — a 10-step task has no retrievable sub-patterns. Edit-compile-test cycles are the natural unit of Clear development.

**Cold start — bootstrapping before the re-ranker is useful:**

Step 1: Run the 63-task curriculum under sandbox runner. Log every compile+test cycle to `code_actions`.
Step 2: Generate synthetic variations: for each curriculum task, permute field names, swap error messages, shuffle endpoint signatures. Target: 500–1000 rows before first re-ranker training run.
Step 3: Use BM25 retrieval (token overlap on `task_type + error_sig`) as fallback until `len(code_actions WHERE test_pass=1) > 200`. Below that threshold, the signal is too sparse for a useful re-ranker.

**Retrieval pipeline (full version):**

```
1. Fast first-pass (bi-encoder)
   - Embed context: task_type + error_sig + first 200 chars of source_before
   - FAISS nearest-neighbor (or sqlite-vec for zero-dependency option)
   - Returns top-50 action_ids by vector similarity

2. Re-ranking (cross-encoder)
   - Input: [(context_features, action_i) for i in top-50]
   - Output: predicted test_score for each candidate
   - Returns top-3 by predicted score
   
3. Presentation to Meph
   - "Based on 847 similar past situations, these approaches have the highest success rate:"
   - Show top-3 patch_summary strings (human-readable)
   - Meph can apply top-1 directly or generate K diverse candidates and re-rank again
```

**Training pipeline (re-ranker):**

The re-ranker is a small cross-encoder: input = concatenated (context_features, patch_summary) as text, output = scalar score (predicted test_score). Architecture: fine-tuned `ms-marco-MiniLM-L-6-v2` or similar 22M-param model. Fits comfortably on a laptop CPU.

Training data source: `code_actions` rows where `test_pass IS NOT NULL`. Label: `test_score`. Negative examples: rows where `compile_ok=0` or `test_score < 0.5`.

Training cadence: retrain every 1000 new `code_actions` rows, or weekly. Takes ~10 minutes on CPU for 10K rows. No GPU required. Model stored as ONNX for cross-platform inference.

Drift mitigation: when Clear language syntax changes (new keywords, deprecated forms), the error signatures shift. Track drift by monitoring `precision@1` on a held-out validation set from the curriculum. If precision@1 drops below 0.4, re-run cold start on updated curriculum before retraining.

**Role in the Meph loop (concrete sequence):**

```
1. Worker Meph compiles → gets error
2. factor-db.js extracts: task_type, error_sig = SHA1(error_message + file_hash)
3. factor-db.js queries: top-3 ranked suggestions via bi-encoder + cross-encoder
4. Suggestions injected into Meph's next turn as a system note:
   "--- Factor DB suggestions (3 similar past fixes, ranked by success rate) ---
   [1] task_type=fix_validation, success_rate=87%: Add `name must not be empty` validate block before save
   [2] task_type=fix_validation, success_rate=71%: Move validate block above the save line
   [3] task_type=add_endpoint, success_rate=63%: Check endpoint path matches exactly
   ---"
5. Meph proposes K=3 candidate patches (diversity prompt: "Give me 3 different approaches")
6. Re-ranker scores all K candidates against context
7. Meph executes top-ranked candidate
8. Outcome (compile_ok, test_score) logged back to code_actions
9. reranker_feedback row inserted: was_used=1, outcome_score=test_score
```

**What memory still does (the two layers are complementary):**

The Factor DB handles **structured action selection**: which patch ops fix which error patterns. It is high-frequency, low-level, quantitative.

The `meph-memory.md` memory system handles **strategic/meta knowledge**: user preferences ("Russell prefers midnight theme"), architectural decisions ("this app uses SQLite not Postgres"), known compiler quirks ("_revive bug means GET crashes — use workaround X"), feature gaps filed to requests.md. This is low-frequency, high-level, qualitative.

Neither system alone is sufficient:
- Factor DB without memory: Meph picks the right patch but ignores that Russell prefers a specific coding style.
- Memory without Factor DB: Meph knows the architecture but makes the same validation mistake on every new endpoint.

**Weak spots — plan around these explicitly:**

1. **Candidate diversity bottleneck.** Addressed by the genetic algorithm — see Section 7c (`genetic.js`). GA replaces the diversity-prompt workaround with a principled diversity mechanism (MAP-Elites grid, novelty scoring, forced baseline injection).

2. **Action granularity mismatch.** Some fixes are one-liners (fix_line), others are 10-operation refactors. The Factor DB treats both as single rows. A 10-op refactor that partially succeeds has ambiguous reward signal. Mitigation: normalize score_delta (improvement per patch op, not total improvement), flag rows with len(patch_ops) > 5 for manual review.

3. **Re-ranker drift with language evolution.** As Clear adds new syntax, old training data's error signatures become stale. A "syntax error on line 5" from 3 months ago may refer to a deprecated keyword. Mitigation: version-tag all code_actions rows with Clear's `SYNONYM_VERSION` from synonyms.js. Filter out rows from old versions during retrieval when version gap > 2.

4. **Feedback sparsity.** re-ranker_feedback.was_used=1 only when Meph actually applies the suggestion. In practice, Meph may ignore suggestions and write its own fix. Low coverage = slow re-ranker improvement. Mitigation: implicit feedback — log outcome for any action whose patch_summary has >60% token overlap with a returned suggestion, even if Meph didn't explicitly accept.

---

### `playground/supervisor/genetic.js` — GeneticOptimizer (new)

The genetic algorithm lives entirely in this module. It is called by the supervisor loop when `GA_ENABLED=true` and a task is assigned. Workers in GA mode are driven by `GeneticOptimizer`, not by autonomous Meph sessions — the LLM is called as a mutation/generation operator, not as an agent.

**Class interface:**

```javascript
export class GeneticOptimizer {
  constructor({ factorDB, reranker, sandboxRunner, taskContext }) {}

  // Run full GA loop. Returns best candidate when terminated.
  async optimize(task, baseSource) {
    // returns: { source, patchOps, testScore, testPass, generation, terminationReason }
  }

  // Exposed for tests
  crossover(parentA, parentB)   // → patchOps array
  mutate(candidate)             // → patchOps array (LLM call)
  computeFitness(result)        // → { testScore, compileOk, warnings, sourceLength }
  paretoRank(population)        // → population with pareto_rank filled
  noveltyScore(candidate, pop)  // → float (Jaccard distance to nearest neighbor)
  detectConvergence(paretoFront)// → boolean
}
```

**Crossover implementation note:**

Clear's patch API makes crossover clean: patch ops are atomic and boundary-safe. Split point is chosen uniformly at random between op indices (not within an op). Conflict check after splice:
1. Collect all endpoint paths in merged ops. If any path appears in both halves with conflicting methods → drop one.
2. Collect all table names. If defined twice → keep first definition, drop duplicate.
3. Run `compileProgram` on the resulting source to verify. If compile errors remain after repair → `origin='crossover_discarded'`, skip sandbox.

**Pareto-front fitness dimensions:**

| Dimension | Direction | Weight (for display only — Pareto doesn't use weights) |
|-----------|-----------|------|
| `test_score` | maximize | primary |
| `compile_ok` | maximize | primary |
| `-warnings_count` | maximize (fewer = better) | secondary |
| `-source_length` | maximize (shorter = better) | tiebreaker |

Pareto dominance: A dominates B iff A is ≥ B on ALL dimensions and strictly > on at least one.

**MAP-Elites behavioral grid:**

Each cell = `(task_type, primary_error_category)` where `primary_error_category` is the first error keyword in the compile/test output (e.g., "missing endpoint", "validation failed", "undefined table").
- Grid is `ga_candidates` rows grouped by `(task_type, error_category)`
- Each group keeps the single highest `test_score` resident
- New candidates evict only if they strictly dominate the current cell occupant
- Convergence check: if >80% of cells have been stable for 3 generations, run novelty injection

**Sandbox parallelism:**

`GeneticOptimizer` uses `Promise.all(population.map(c => sandboxRunner.eval(c.source)))`. The sandbox runner is already designed for parallel child processes. GA with `POP_SIZE=10` runs 10 simultaneous compile+test processes. This saturates available CPU but finishes in the time of a single sequential run. Set `POP_SIZE <= CPU_CORES` for best throughput.

---

## Section 8: Files to Modify

### `playground/server.js`

**New endpoints to add** (don't touch any existing endpoint):

`currentSource` and `currentErrors` are local variables inside the `/api/chat` SSE handler (scoped per-request, line ~2144). The new `GET /api/current-source` endpoint lives at module level and cannot reference them directly — that would `ReferenceError`. The fix: add module-level shadow variables that get updated whenever the in-chat variables change.

**Step 1 — add near `storedApiKey` declaration (line ~1452, after the `let storedApiKey = ...` line):**

```javascript
// Shadow vars for supervisor polling — updated inside /api/chat whenever source changes
let _workerLastSource = '';
let _workerLastErrors = [];
```

**Step 2 — inside `/api/chat` handler, find every assignment to `currentSource` or `currentErrors` and mirror it. There are three sites (confirmed at lines 2294, 2298, 2315, 2586–2588):**

```javascript
// After: currentSource = input.code;      (line ~2294)
_workerLastSource = currentSource;

// After: currentErrors = r.errors;        (lines ~2298 and ~2315)
_workerLastErrors = currentErrors;

// After: currentSource = result.source;   (line ~2588)
_workerLastSource = currentSource;
```

**Step 3 — add new endpoints at line ~3180 (AFTER the `/api/chat` handler ends, before `app.listen`):**

```javascript
// Expose current source for supervisor polling.
// Uses module-level shadow vars, not the per-request locals inside /api/chat.
app.get('/api/current-source', (req, res) => {
  res.json({ source: _workerLastSource, errors: _workerLastErrors });
});

// Supervisor heartbeat: lightweight status without running tests
app.get('/api/worker-heartbeat', (req, res) => {
  res.json({
    sessionId: process.env.SESSION_ID || 'default',
    appRunning: !!runningChild,
    appPort: runningPort,
    lastMephAction: terminalBuffer.filter(l => l.includes('[meph]')).slice(-1)[0] || null,
    ts: Date.now()
  });
});
```

**CLI arg handling** (line ~10, in server startup):

```javascript
// Add: read --port and --session-id from argv for worker mode
const argv = process.argv.slice(2);
const portArg = argv.find(a => a.startsWith('--port='));
const sessionArg = argv.find(a => a.startsWith('--session-id='));
if (portArg) process.env.PORT = portArg.split('=')[1];
if (sessionArg) process.env.SESSION_ID = sessionArg.split('=')[1];
```

> **Do NOT modify `termLog`.** Session identification is implicit in the multi-process design — each worker has its own `terminalBuffer` and the supervisor calls separate endpoints on separate ports. Adding a `[sessionId]` prefix to every terminal line would pollute normal single-session Studio use (where `SESSION_ID` is unset and lines would all get `[default]` prefix). The prefix is noise; the port is the identifier.

### `playground/system-prompt.md`

Add supervisor-awareness section for Worker Meph (injected only when `SESSION_ID` is set):

```markdown
## Worker Mode

You are running as Worker {SESSION_ID} in a supervised swarm. A Supervisor Meph
is watching your progress via your terminal log and test results.

**Your only job:** Complete the task you were given. Write code, compile, test, fix.
Report progress in your todo list — the supervisor reads it.

When you finish (all tests pass), say "TASK COMPLETE" explicitly at the end of
your response so the supervisor can detect completion in the terminal log.

When you are stuck (same error 3+ times), say "STUCK: [error description]" so the
supervisor can send a hint or reassign.

Do not wait for user confirmation. Do not ask questions. Work autonomously.
```

Add Supervisor Meph section for the supervisor instance:

```markdown
## Supervisor Mode

You are the Supervisor Meph. You manage N Worker sessions. You do not write code
directly — you assign tasks, observe progress, and merge results.

**Your tools include `assign_worker`, `kill_worker`, `merge_worker`, `nudge_worker`,
and `query_factor_db`.** These are available in Supervisor Studio alongside your
normal tools.

When a worker completes (says "TASK COMPLETE"), promote its output for review.
When a worker is stuck (says "STUCK:"), inject a hint via `nudge_worker`. After
2 hints with no progress, `kill_worker` and reassign.

When multiple workers complete, compare test_score. Promote the highest scorer
for merge. Flag conflicts to the user.
```

### `playground/ide.html`

Add "Supervisor" tab to the right panel (alongside Tests, Evals, Terminal). The Supervisor panel shows:
- Session table: id, task (truncated), state badge, test_score bar
- Live SSE feed from `/api/supervisor/status`
- Action buttons: Assign Task, Kill, Merge
- Factor DB panel: query box + top-3 suggestions for current error

---

## Section 9: Pre-Flight Checklist

- [ ] `node playground/server.js --port=3457 --session-id=worker-1` spawns cleanly on port 3457
- [ ] Two worker instances don't share state (terminalBuffer, runningChild, runningPort)
- [ ] `GET /api/worker-heartbeat` returns session-tagged response from each worker
- [ ] `GET /api/terminal-log` on worker returns only that worker's logs (not supervisor's)
- [ ] Session registry survives supervisor restart (SQLite persists)
- [ ] Factor DB inserts on every compile+test cycle (validate via `SELECT COUNT(*) FROM code_actions`)
- [ ] Cold start: running curriculum against worker produces >200 rows in factor_db
- [ ] `learnings.md` exists at project root
- [ ] No existing endpoints broken (run `node playground/server.test.js`)
- [ ] `node playground/server.js` (solo mode) and `node playground/supervisor.js` are never run simultaneously on port 3456 — document this in `CLAUDE.md`
- [ ] `_workerLastSource` / `_workerLastErrors` module-level vars are present in server.js (grep for them)
- [ ] `GET /api/current-source` returns correct source after a Meph `edit_code` + `compile` cycle (manual smoke test: start worker, have Meph write a one-line app, then `curl localhost:3457/api/current-source`)

---

## Section 10: TDD Cycles

### Phase 1 — Session Registry (2 cycles)

**Read first:** `playground/server.js` lines 157–230, `runtime/db.js`

| Step | Action | Test |
|------|--------|------|
| 🔴 | Write `registry.test.js` (copy-paste ready — see below) | `node playground/supervisor/registry.test.js` |
| 🟢 | Implement `SessionRegistry` class with SQLite backend using the schema in Section 7 | All registry tests pass |
| 🔴 | Write persistence test (copy-paste ready — see below) | |
| 🟢 | Add WAL mode: `db.pragma('journal_mode = WAL')` + `db.pragma('synchronous = NORMAL')` — matches pattern in `runtime/db.js` | Persistence test passes |
| 🔄 | Extract schema SQL into `playground/supervisor/schema.sql`, import via `readFileSync` in registry.js | |
| 📚 | Update `learnings.md`: SQLite session registry pattern, WAL mode notes | |

**`playground/supervisor/registry.test.js` (copy-paste ready):**

```javascript
import { describe, it, expect } from '../../lib/testUtils.js';
import { SessionRegistry } from './registry.js';
import { unlinkSync, existsSync } from 'fs';

const TEST_DB = '/tmp/registry-test.db';
function cleanup() { try { unlinkSync(TEST_DB); } catch {} }

describe('SessionRegistry', () => {
  it('creates a session and reads it back', () => {
    cleanup();
    const reg = new SessionRegistry(TEST_DB);
    reg.create({ id: 'worker-1', port: 3457, state: 'idle' });
    const s = reg.get('worker-1');
    expect(s).toBeTruthy();
    expect(s.port).toEqual(3457);
    expect(s.state).toEqual('idle');
    reg.close();
    cleanup();
  });

  it('updates session state', () => {
    cleanup();
    const reg = new SessionRegistry(TEST_DB);
    reg.create({ id: 'worker-1', port: 3457, state: 'idle' });
    reg.update('worker-1', { state: 'running', task: 'build a blog' });
    const s = reg.get('worker-1');
    expect(s.state).toEqual('running');
    expect(s.task).toEqual('build a blog');
    reg.close();
    cleanup();
  });

  it('lists only active sessions', () => {
    cleanup();
    const reg = new SessionRegistry(TEST_DB);
    reg.create({ id: 'worker-1', port: 3457, state: 'running' });
    reg.create({ id: 'worker-2', port: 3458, state: 'idle' });
    reg.create({ id: 'worker-3', port: 3459, state: 'completed' });
    const active = reg.listActive(); // state IN ('idle', 'running')
    expect(active.length).toEqual(2);
    reg.close();
    cleanup();
  });

  it('registry survives close and reopen (WAL durability)', () => {
    cleanup();
    const reg1 = new SessionRegistry(TEST_DB);
    reg1.create({ id: 'worker-1', port: 3457, state: 'running', task: 'important task' });
    reg1.close();
    // Simulate process restart
    const reg2 = new SessionRegistry(TEST_DB);
    const s = reg2.get('worker-1');
    expect(s).toBeTruthy();
    expect(s.task).toEqual('important task');
    reg2.close();
    cleanup();
  });
});
```

**Commit:** `feat(supervisor): session registry with SQLite persistence`

---

### Phase 2 — Worker Spawner (2 cycles)

**Read first:** `playground/server.js` lines 1–50, `cli/clear.js` lines 1–60

| Step | Action | Test |
|------|--------|------|
| 🔴 | Write test: spawn worker on port 3457, hit `/api/worker-heartbeat`, get 200 | `node playground/supervisor/spawner.test.js` |
| 🟢 | Implement `WorkerSpawner.spawn(port, sessionId)` — uses `child_process.spawn('node', ['playground/server.js', ...])` | Spawner test passes |
| 🔴 | Write test: spawn 3 workers, verify each has different port, kill all cleanly | |
| 🟢 | Implement `WorkerSpawner.spawnAll(N)`, `WorkerSpawner.killAll()` | Multi-worker test passes |
| 🔄 | Extract port allocation logic into `PortAllocator` class | |
| 📚 | Update `learnings.md`: worker spawn lifecycle, port collision avoidance | |

**Commit:** `feat(supervisor): worker spawner with port allocation`

---

### Phase 3 — Supervisor Loop (3 cycles)

**Read first:** `playground/server.js` lines 241–305 (terminal buffer), `/api/run-tests` endpoint

| Step | Action | Test |
|------|--------|------|
| 🔴 | Write test: mock worker at port 3457, supervisor polls it, reads terminal log correctly | `node playground/supervisor/loop.test.js` |
| 🟢 | Implement `SupervisorLoop.pollOne(sessionId)` — fetches heartbeat, terminal log, test results | Poll test passes |
| 🔴 | Write test: worker says "STUCK:", supervisor sets state=stalled in registry | |
| 🟢 | Implement state detection: TASK_COMPLETE → completed, STUCK → stalled, N retries → stalled | State machine tests pass |
| 🔴 | Write test: supervisor SSE endpoint streams registry snapshot every N seconds | |
| 🟢 | Implement `/api/supervisor/status` SSE | SSE test passes |
| 🔄 | Extract `detectStall`, `detectComplete`, `detectStuck` into pure functions | |
| 📚 | Update `learnings.md`: supervisor polling pattern, SSE from Express | |

**Commit:** `feat(supervisor): polling loop + state machine + SSE status`

---

### Phase 4 — Task Distribution (2 cycles)

**Read first:** `playground/system-prompt.md`, `/api/chat` endpoint ~line 2124

| Step | Action | Test |
|------|--------|------|
| 🔴 | Write test: `assign_task(session_id, task)` POSTs task to worker's `/api/chat`, worker acknowledges | `node playground/supervisor/distribution.test.js` (uses mock worker chat) |
| 🟢 | Implement `SupervisorLoop.assignTask(sessionId, task)` | Assignment test passes |
| 🔴 | Write test: task decomposition stub — supervisor splits "build a blog app with auth" into 3 subtasks | |
| 🟢 | MVP: pass task through unchanged. Add decomposition hook (calls `/api/chat` on SUPERVISOR itself with decompose prompt) | Decomposition test passes |
| 🔄 | Move decompose prompt to `system-prompt.md` supervisor section | |
| 📚 | Update `learnings.md`: task decomposition limits (LLM reliability, round-trip cost) | |

**Commit:** `feat(supervisor): task distribution with decomposition hook`

---

### Phase 5 — Factor DB + Re-ranker (5 cycles)

**Read first:** `patch.js` (action space), `curriculum/` listing, `runtime/db.js`

| Step | Action | Test |
|------|--------|------|
| ⚙️ | **Before Phase 5:** add `"onnxruntime-node": "^1.18.0"` to `package.json` and run `npm install`. On Windows this requires MSVC build tools (or use `--ignore-scripts` and skip native ops until embedding cycle). Download `all-MiniLM-L6-v2` ONNX model: `node scripts/download-model.js` (create this script). Add `playground/models/` to `.gitignore`. | Verify `ls playground/models/all-MiniLM-L6-v2/` shows model files |
| 🔴 | Write test: `factor_db.log(context, action, outcome)` inserts correctly, `factor_db.count()` returns 1 | `node playground/supervisor/factor-db.test.js` |
| 🟢 | Implement `FactorDB` class with SQLite backend, schema from Section 7 | Log test passes |
| 🔴 | Write test: post-test hook calls `factor_db.log` after every `/api/run-tests` call on workers | |
| 🟢 | Add factor_db log call to Supervisor loop's `pollOne` after test results received | Hook test passes |
| 🔴 | Write cold-start test: run 3 curriculum tasks through worker, verify >10 rows in factor_db | Requires live worker — integration test |
| 🟢 | Implement cold-start script: `node playground/supervisor/cold-start.js` runs N curriculum tasks against worker, logs all | Cold-start test passes |
| 🔴 | Write retrieval test: `factor_db.query(context)` returns top-K rows ranked by test_score (BM25 for now) | |
| 🟢 | Implement BM25 retrieval (token overlap on task_type + error keywords, pure JS, zero deps) | Retrieval test passes |
| 🔴 | Write embedding test: `factor_db.embed(context)` returns 128-dim float32 array via onnxruntime-node | |
| 🟢 | Add bi-encoder embedding (onnxruntime-node + all-MiniLM-L6-v2 ONNX model, download once to `playground/models/`) | Embedding test passes |
| 🔄 | Add `RERANKER_MODEL_PATH` fallback: if no model, use BM25; if model, use cross-encoder | |
| 📚 | Update `learnings.md`: Factor DB granularity decisions, BM25 vs embedding tradeoffs, drift monitoring | |

**Commit:** `feat(factor-db): core schema + logging + BM25 retrieval + bi-encoder`

---

### Phase 5c — Genetic Algorithm (4 cycles)

**Read first:** `patch.js` (crossover depends on op structure), `playground/supervisor/factor-db.js` (seed pool query), Section 7c `genetic.js` spec above

| Step | Action | Test |
|------|--------|------|
| 🔴 | Write test: `crossover(parentA, parentB)` produces a valid patch-op array with no duplicate endpoint paths | `node playground/supervisor/genetic.test.js` |
| 🟢 | Implement `crossover`: random split point on op index, merge, run conflict-repair (dedup endpoints + tables) | Crossover test passes |
| 🔴 | Write test: `mutate(candidate)` calls LLM (mock) and returns different patch-ops from parent | |
| 🟢 | Implement `mutate`: pick one op, call `/api/chat` with mutation prompt, parse response into patch-op | Mutation test passes (mock LLM) |
| 🔴 | Write test: `paretoRank([...])` correctly assigns rank 0 to non-dominated candidates and rank 1+ to dominated ones. Test case: A=(score=1.0, warnings=0) dominates B=(score=0.9, warnings=5). C=(score=0.8, warnings=0) is non-dominated vs B. | |
| 🟢 | Implement `paretoRank`: O(n²) dominance check for small populations (n ≤ 50), returns population with `.pareto_rank` filled | Pareto test passes |
| 🔴 | Write integration test: `GeneticOptimizer.optimize('add a users table', baseSource)` with mock LLM + real sandbox. Runs 2 generations, Factor DB has `ga_candidates` rows, `getBest()` returns candidate with highest `test_score`. | Integration test — requires live sandbox |
| 🟢 | Wire `GeneticOptimizer` into supervisor loop: when `GA_ENABLED=true` and task assigned, use `optimizer.optimize()` instead of `assignTask()` | Integration test passes |
| 🔄 | Extract novelty scoring into pure function `noveltyScore(candidate, population)`. Extract MAP-Elites grid into `MapElitesGrid` class. | |
| 📚 | Update `learnings.md`: GA termination edge cases, crossover repair operator behavior, sandbox parallelism limits on Windows (child_process.spawn concurrency ceiling) | |

**Copy-paste test for `crossover` (first 🔴 cycle):**

```javascript
import { describe, it, expect } from '../../lib/testUtils.js';
import { GeneticOptimizer } from './genetic.js';

// Minimal mock — just needs crossover method, no LLM/DB required
const opt = new GeneticOptimizer({ factorDB: null, reranker: null, sandboxRunner: null, taskContext: {} });

describe('GeneticOptimizer.crossover', () => {
  it('produces a merged op array with correct length', () => {
    const a = [{ op: 'add_table', name: 'User' }, { op: 'add_endpoint', method: 'GET', path: '/api/users' }];
    const b = [{ op: 'add_field', table: 'User', field: 'email' }, { op: 'add_validation', endpoint: '/api/users' }];
    const child = opt.crossover(a, b);
    expect(Array.isArray(child)).toBeTruthy();
    expect(child.length).toEqual(a.length); // same length as parents (split + rejoin)
  });

  it('repair: removes duplicate endpoint paths', () => {
    const a = [{ op: 'add_endpoint', method: 'GET', path: '/api/items' }];
    const b = [{ op: 'add_endpoint', method: 'POST', path: '/api/items' }, { op: 'add_field', table: 'Item', field: 'name' }];
    const child = opt.crossover(a, b);
    const paths = child.filter(o => o.op === 'add_endpoint').map(o => o.path);
    // Both have /api/items — repair should keep only one
    expect(paths.filter(p => p === '/api/items').length).toEqual(1);
  });
});
```

**Commit:** `feat(ga): genetic optimizer — crossover, mutation, pareto ranking`

---

### Phase 6 — Integration / Merge Step (3 cycles)

**Read first:** `patch.js`, `index.js` `compileProgram`

| Step | Action | Test |
|------|--------|------|
| 🔴 | Write test: `merge(winner_source, base_source)` — worker produces new endpoint, merge into base that has different table. Compile succeeds | `node playground/supervisor/merge.test.js` |
| 🟢 | Implement `merge(winner, base)`: diff winner vs its starting source → extract patch ops → apply to base → compile to validate | Merge test passes |
| 🔴 | Write test: two workers both add endpoint at same path — merger detects conflict, returns `{ conflict: true, details: '...' }` | |
| 🟢 | Implement conflict detection: same endpoint path in both patches → conflict | Conflict test passes |
| 🔴 | Write test: `/api/supervisor/merge` endpoint calls `merge()`, returns compiled+validated output | |
| 🟢 | Wire merge endpoint to `SupervisorLoop.mergeSession()` | Merge endpoint test passes |
| 🔄 | Extract `detectConflict` as pure function with clear types | |
| 📚 | Update `learnings.md`: merge limitations (endpoint conflicts, table conflicts), when to escalate to user | |

**Commit:** `feat(supervisor): merge step with conflict detection`

---

### Phase 7 — Observability Dashboard (2 cycles)

**Read first:** `playground/ide.html` structure, existing test pane implementation

| Step | Action | Test |
|------|--------|------|
| 🔴 | Write E2E test: load Supervisor Studio, see "Supervisor" tab in right panel, session table shows N rows | `node playground/ide.test.js` (extend existing) |
| 🟢 | Add Supervisor tab to `playground/ide.html`: session table, SSE connection to `/api/supervisor/status`, Assign/Kill/Merge buttons | E2E test passes |
| 🔴 | Write test: Factor DB panel shows top-3 suggestions when error is present in current editor | |
| 🟢 | Add Factor DB panel to Supervisor tab: input = current compile errors, output = top-3 suggestions with success rates | Factor DB panel test passes |
| 🔄 | Style consistency check: supervisor panel matches existing midnight/ivory/nova themes | |
| 📚 | Update `learnings.md`: SSE in browser (EventSource), session table rendering patterns | |

**Commit:** `feat(supervisor): observability dashboard in Studio`

---

### Phase 8 — Documentation (final, mandatory)

| Surface | Update |
|---------|--------|
| `ROADMAP.md` | Mark "Supervisor + Multi-Session" as in-progress, add to What's Next |
| `playground/system-prompt.md` | ✅ Updated in Phase 4 |
| `USER-GUIDE.md` | Add "Running a Supervised Swarm" chapter: how to start supervisor, assign tasks, read results |
| `AI-INSTRUCTIONS.md` | Add note: when writing Clear apps that will be run in a swarm, mark test blocks clearly |
| `CLAUDE.md` | Add supervisor CLI command to CLI section: `node playground/supervisor.js --workers=N` |

**Documentation checklist:**
- [ ] `ROADMAP.md` updated (feature status + next moves)
- [ ] `playground/system-prompt.md` updated (supervisor + worker modes)
- [ ] `USER-GUIDE.md` updated (tutorial: running a swarm)
- [ ] `AI-INSTRUCTIONS.md` updated (swarm-aware app patterns)
- [ ] `CLAUDE.md` updated (new CLI command)
- [ ] `playground/server.test.js` updated (new `/api/worker-heartbeat`, `/api/current-source`)

**Commit:** `docs(supervisor): all surfaces updated for multi-session architecture`

---

## Section 11: What "Success" Looks Like (Acceptance Criteria)

**MVP (2–3 weeks, Phases 1–4 + cold-start only):**
- `node playground/supervisor.js --workers=2` starts two worker IDEs
- User gives supervisor Meph a task: "build a todo app with auth"
- Supervisor assigns subtasks to each worker
- Workers run independently, supervisor panel shows live status
- When one worker finishes first (all tests pass), supervisor merges output
- Factor DB has >50 rows logged from the session

**Full (Phases 5–7, additional 2–4 weeks):**
- Factor DB has >500 rows from curriculum cold-start
- BM25 retrieval offers suggestions to stuck workers
- Bi-encoder + cross-encoder pipeline live (re-ranker not yet trained — that needs 1000+ rows)
- Merge step handles non-conflicting cases automatically
- Supervisor dashboard shows session table + factor DB suggestions in Studio

**Re-ranker training (Phase after full, weeks 6–8):**
- 1000+ factor_db rows logged
- Cold-start curriculum run on all 63 tasks (synthetic variations generated)
- First re-ranker training run completes on laptop CPU in <15 min
- precision@1 > 0.5 on curriculum validation set

**Genetic Algorithm (Phase 5c, parallel with phases 5–6, weeks 4–6):**
- `crossover` and `mutate` operators pass unit tests with mock LLM
- `paretoRank` correctly scores a 10-candidate population
- `GeneticOptimizer.optimize` completes a 3-generation run on the `todo-fullstack` curriculum task — `ga_runs` and `ga_candidates` rows populated in factor_db
- Convergence detection fires correctly: if all gen-0 seeds have same test_score (mock), optimizer injects novelty candidates
- Closed-loop drift sentinel works: every 5th generation includes at least 1 `origin='baseline'` candidate

**GA + Re-ranker composed loop (weeks 7–9):**
- GA seed pool queries Factor DB (BM25) and injects top-3 past high-score patch sequences as gen-0 candidates
- Re-ranker scores GA offspring before sandbox eval — bottom-quartile candidates filtered out, saving ~25% compute on benchmark tasks
- `ga_runs` table shows `termination_reason='solution_found'` for ≥50% of curriculum tasks when `GA_MAX_GENERATIONS=10`
- No Pareto-front collapse (novelty injection fires when needed): measure with `SELECT COUNT(DISTINCT pareto_rank) FROM ga_candidates WHERE run_id=X` — should be ≥3 at end of a 10-generation run

---

## Section 12: Open Questions (decide before Phase 1)

1. **SQLite vs JSON for session registry?** SQLite is right for full version. JSON file is fine for MVP and avoids a `better-sqlite3` install in supervisor context (though it's already a runtime dep). **Recommendation: SQLite from day 1** — the schema is small and migration pain of JSON→SQLite mid-project is worse than installing a dep you already have.

2. **One Anthropic key or N?** N workers + 1 supervisor = N+1 concurrent API sessions against the same key. Anthropic rate limits are per-key. For N=3 this is fine (4 concurrent sessions, well within limits). For N>10, consider separate keys or request-level queuing in supervisor. **MVP: single key, supervisor queues chat requests if rate limited.**

3. **Where does the cross-encoder model live?** `playground/models/cross-encoder.onnx` checked into git is ~90MB. Too large for the repo. **Recommendation: download script + .gitignore the model binary.** Store a `models/README.md` with download instructions and SHA256 checksum.

4. **Does the supervisor read the Factor DB during task assignment?** It could front-load suggestions before even assigning the task. **MVP: no — Factor DB is read only when workers are stuck. Reduces complexity of the assignment flow.**

5. **Re-ranker training infrastructure?** Python (standard ML tooling) or JS (onnxruntime-node fine-tuning, limited)? **Recommendation: Python script for training (`scripts/train_reranker.py`), ONNX export, JS for inference only.** Keeps the compiler zero-dep in Node while enabling real ML tooling for training.

6. **How does Supervisor Meph's own chat work?** supervisor.js is shown as a separate Express server on port 3456. But the `/api/chat` handler in server.js is ~1000 lines — the Supervisor IDE needs that entire handler to give Supervisor Meph its tools. Three options:

   - **Option A (recommended): supervisor.js spawns a regular `server.js --port=3456 --session-id=supervisor` for its own IDE, then adds supervisor management endpoints (`/api/supervisor/*`) to THAT server via a conditional module.** supervisor.js itself is a headless orchestration daemon. The user opens port 3456 for Supervisor Meph chat + swarm dashboard. Workers on 3457+. Zero duplication of `/api/chat`.

   - **Option B:** supervisor.js is a standalone HTTP server with its own `/api/chat`. Requires duplicating ~1000 lines of chat handler logic. Maintenance nightmare. Not recommended.

   - **Option C:** Supervisor has no Meph chat at all — it's a pure management dashboard. Supervisor Meph doesn't exist; the user manually assigns tasks via UI. Simpler to implement but loses the "Supervisor Meph" concept entirely. Only viable if task assignment is always manual.

   **Decision required before Phase 2.** Option A is the right call: use Option A. Concretely: in Phase 2, `WorkerSpawner.spawn()` accepts an optional `isSupervisor=false` flag. When `isSupervisor=true`, the spawned server.js loads `playground/supervisor/api.js` which mounts the `/api/supervisor/*` endpoints onto the existing express app.

---

## Learnings Hooks

Add to `learnings.md` after each phase completes:
- Phase 1: session registry gotchas (WAL mode, process.env leakage across workers)
- Phase 2: port collision race conditions (two spawners, same port range)
- Phase 3: SSE from Express (keep-alive headers, client reconnect handling)
- Phase 4: task decomposition reliability (LLM may produce unbalanced subtasks)
- Phase 5: Factor DB entry quality (granularity choices, spurious error signatures)
- Phase 6: merge limitations (what patch.js can and cannot express)
- Phase 7: browser EventSource API limits (max 6 concurrent SSE connections per origin)
