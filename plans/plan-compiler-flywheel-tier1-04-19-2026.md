# Plan — Compiler Flywheel, Tier 1: Runtime Instrumentation

**Date:** 2026-04-19 (Session 38)
**Branch:** `feature/rl`
**Status:** Proposal — do not execute until Meph EBM reranker is trained and wired

## Context / why this plan exists

The Factor DB + EBM reranker we're building this session makes **Meph** write better Clear over time. But it never measures whether the **JS/Python/HTML the compiler emits for each Clear line is optimal.** Every emit function in `compiler.js` is hand-written — reasonable, not proven best.

This plan sets up the **first layer** of a second, parallel flywheel: a compiler-level flywheel that learns which emit strategies produce the best-running apps. Tier 1 is just instrumentation — no optimization yet, no A/B, no reranker. Just collecting data.

Tiers 2-4 are in `ROADMAP.md` under "Compiler Flywheel — second-order moat."

## Goal of Tier 1

After this ships, every compiled Clear app running in Studio's sandbox (or deployed to Fly) emits runtime events to a shared endpoint. The Factor DB gains new runtime-outcome columns per compile row. We can now answer questions like:

- Which Clear patterns produce the slowest queries?
- Which compilation choices crash most under edge cases?
- Does the `get all X where Y` pattern (list filter) perform better on SQLite vs Postgres?
- Are there specific `error_sig` values whose compiled error-path JS always fails?

## What ships

### 1. Runtime-beacon client (compiled into every Clear app)

A tiny JS snippet (~30 lines) that the compiler emits automatically in every generated `server.js`:

```js
// Auto-emitted by Clear compiler. Beacons runtime events back to the Flywheel.
// No PII. Just: compile_row_id, event_type, duration_ms, error_sig (if any).
const _CLEAR_FLYWHEEL_URL = process.env.CLEAR_FLYWHEEL_URL; // optional, silent no-op if unset
const _CLEAR_COMPILE_ROW_ID = process.env.CLEAR_COMPILE_ROW_ID; // set at deploy time
function _clearBeacon(event) {
  if (!_CLEAR_FLYWHEEL_URL || !_CLEAR_COMPILE_ROW_ID) return;
  try {
    fetch(_CLEAR_FLYWHEEL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compile_row_id: _CLEAR_COMPILE_ROW_ID, ...event }),
      signal: AbortSignal.timeout(500), // never block a real request
    }).catch(() => {}); // silent on failure
  } catch {}
}
```

Events emitted:
- `endpoint_latency` — per-endpoint p50/p95 every 1 minute
- `endpoint_error` — when an endpoint throws
- `query_duration` — when a DB query exceeds 100ms
- `memory_peak` — sampled every 30s

### 2. Beacon-receiver endpoint

Add to `playground/server.js`:

```
POST /api/flywheel/beacon
  body: { compile_row_id, event_type, ... }
  stores: append a row to code_actions_runtime table (new) keyed to compile_row_id
  rate-limited: 100 events/second per compile_row_id (drop excess silently)
```

### 3. Factor DB schema — new table `code_actions_runtime`

```sql
CREATE TABLE code_actions_runtime (
  id              INTEGER PRIMARY KEY,
  compile_row_id  INTEGER REFERENCES code_actions(id),
  event_type      TEXT,
  endpoint        TEXT,
  duration_ms     REAL,
  error_sig       TEXT,
  memory_mb       REAL,
  received_at     INTEGER
);
CREATE INDEX idx_runtime_compile ON code_actions_runtime(compile_row_id);
CREATE INDEX idx_runtime_type    ON code_actions_runtime(event_type, received_at);
```

Separate table, not new columns on `code_actions` — one compile produces many runtime events.

### 4. Compile-row-id propagation

At build time, the CLI needs to:
1. Read the most recent `code_actions.id` for this session (or pass one explicitly)
2. Emit it as `process.env.CLEAR_COMPILE_ROW_ID` into the generated `server.js`
3. Also emit `process.env.CLEAR_FLYWHEEL_URL` from an env or config

Defaults: if either env is unset, the beacon silently no-ops. Zero overhead in production if the user opts out.

### 5. Opt-out

Every compiled app logs "Anonymous runtime telemetry enabled. Disable with CLEAR_FLYWHEEL_URL=off." Honor-system opt-out.

## What we measure after 2 weeks

After 2 weeks of data collection (assuming ~100 Meph sessions + ~20 deployed Marcus apps):

1. Per Clear node-type: distribution of endpoint latencies. Outliers = compiler optimization targets.
2. Per `error_sig`: frequency of runtime occurrence vs compile-time detection. High runtime / low compile-time = compiler missed a validation.
3. Per archetype: crash rate. High-crash archetypes need better default patterns.

## What Tier 1 does NOT do

- No A/B variants yet. Compiler still emits one choice per pattern.
- No automatic optimization. Humans read the data and decide.
- No reranker yet. That's Tier 3.

## Ordering vs Session 38 work

**Do this AFTER:**
- Meph EBM reranker is trained and wired (current work)
- At least 20 Marcus prospects using the system (so there's real usage data, not just curriculum sweeps)

**Estimated shape:**
- Instrumentation emitter in compiler.js: 1 edit
- Beacon endpoint in playground/server.js: 1 edit
- Factor DB schema migration: 1 edit (extend `factor-db.js` with ALTER-style pattern, same as step-decomp migration)
- CLI compile-row-id propagation: 1 edit to `cli/clear.js`
- Tests: 4-5 new test cases in `clear.test.js` + `playground/server.test.js`
- Docs: update `RESEARCH.md` with "Compiler Flywheel" section

## Risk / unknowns

- **Beacon volume under Marcus load.** 100 req/s rate limit per compile_row may be too strict. Solve later with sampling.
- **Privacy.** Even "no PII" beacons can leak info if endpoints encode user IDs in paths. Decide policy before deploying.
- **Opt-out enforcement.** Honor-system now. If anyone pushes back, make it opt-in.

## Success criteria

- Tier 1 is "successful" if after 30 days of live data, we can identify at least 3 compiler emit patterns whose runtime characteristics justify writing a second variant for Tier 2 testing.

## Related

- `ROADMAP.md` → "Compiler Flywheel — second-order moat"
- `RESEARCH.md` → "The Flywheel" (needs a new section for compiler-level flywheel)
- `augment-labs-roadmap.md` → Priority 2 (EBM) aligns with the reranker this eventually feeds
