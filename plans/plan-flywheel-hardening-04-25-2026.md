# Plan — Flywheel Hardening (pre-work for the shell upgrade)

**Date:** 2026-04-25
**Owner:** this session (or next)
**Companion files:**
- `plans/flywheel-overview-04-25-2026.md` — the 3-streams + 2-loops picture
- `plans/plan-compiler-flywheel-tier1-04-19-2026.md` — the existing CF-1 stub this plan completes
- `RESEARCH.md` → "Compiler Flywheel" section
- `landing/marcus-app-target.html` + the future shell upgrade plan

---

## Why this lands BEFORE the shell upgrade

The shell upgrade is 5-7 sessions of new compiler work — adding ~10 new pieces of syntax (nav rails, stat cards, right rail, etc). That work will produce thousands of compile attempts from Meph, hundreds of new error messages we'll write, and lots of runtime data from the upgraded apps.

Without this hardening, that data is invisible. With it, every phase of the shell upgrade lands in the ledger — measurable, attributable, compounding.

The work is small (1 session). The leverage is large (every future session compounds harder).

---

## The 3 jobs

### Job A — Pipe runtime beacons into the main ledger
**What it does:** Compiled apps already send tiny "beacons" home with page-load timing and endpoint errors (shipped today as CF-1). The beacons land in a flat log file (`playground/flywheel-beacons.jsonl`) that nobody queries. This job moves the data into the same ledger as everything else, so the trainer + ranker + friction script can all see it.

**Concretely:**
1. Add a new table to the ledger: `code_actions_runtime` with columns `(ts, app_id, route, status, latency_ms, error_text, source_hash)`.
2. Add an ingestion path: every time a beacon arrives at the receiver, it both appends to the JSONL (current behavior) AND inserts a row in the new table.
3. Add a backfill script that reads the existing JSONL into the table for any pre-existing data.
4. Add an index on `(app_id, route, ts)` so the friction script can scan errors fast.

**Acceptance:**
- A beacon sent during a test run shows up in the new table within seconds.
- The friction script (existing) can be extended in 5 lines to read this table for "endpoints that error a lot in production."
- The JSONL file is preserved as a backup — not deleted.

**Tests:** 3-5 unit tests covering the table schema, the ingestion, and the backfill.

**Files touched:** `playground/factor-db.js` (new table + helpers), `playground/server.js` (the receiver — already has the JSONL append logic, add the DB insert next to it), one new file `scripts/backfill-runtime-beacons.mjs`.

**Sizing:** 0.5 session.

---

### Job C — Auto-capture compiler-edit changes
**What it does:** When Russell or Claude rewrites a compile error message in `compiler.js` or `validator.js`, the change lands in code but the FACT of the change is invisible to the flywheel. This job adds a small detector that runs after every commit: it greps the diff for changed error messages and writes a row to the ledger tagged `compiler_error_change` with before-text and after-text.

**Concretely:**
1. Add a Git post-commit hook (or a CI step that fires on push) that runs a script: `scripts/log-compiler-edits.mjs`.
2. The script reads `git diff HEAD~1 HEAD -- compiler.js validator.js` and parses out changed error-message strings (look for any string literal in a `validator.error()` or `_clearError()` call that differs between before and after).
3. For each changed message, drop a row in the ledger tagged `compiler_error_change` with `(commit_sha, file_path, line_number, before_text, after_text)`.
4. The friction script can then JOIN: rows where Meph hit the OLD message vs rows where Meph hit the NEW message. We get a measurable "did the rewrite reduce friction?" signal.

**Acceptance:**
- Make a small test edit to one error message in `compiler.js`, commit, run the script, see a new row in the ledger with the before/after.
- The friction script can read these rows and report "errors that were rewritten in the last 7 days, with friction-count delta."

**Tests:** 3 unit tests covering the diff parser + DB insert.

**Files touched:** `scripts/log-compiler-edits.mjs` (new), `.husky/post-commit` (existing or new — append the script call), `playground/factor-db.js` (new helper for inserting compiler-edit rows).

**Sizing:** 0.5 session.

---

### Job D — Run a baseline curriculum sweep
**What it does:** Capture the BEFORE state of compile-error friction so we can prove the shell upgrade reduced it. Without this, we ship the shell upgrade and have no data to point at.

**Concretely:**
1. Run `node playground/supervisor/curriculum-sweep.js --tasks=30` against the current compiler (the post-bug-fix, post-design-tokens compiler at commit `0a10f63`).
2. Save the friction snapshot: `node scripts/top-friction-errors.mjs --top=20 > snapshots/friction-baseline-04-25-2026.txt`.
3. Save the sweep summary: pass-rate per archetype, total cost, total wall-clock.

**Cost estimate:**
- 30 tasks × ~$0.10-0.30 per task on Haiku 4.5 = $3-9 total
- 30 tasks at 25-iteration cap × 3 workers ≈ 30 minutes wall-clock
- Project rule says: post the median + range BEFORE firing. **Median estimate: $5, range $3-9, ~30 min.**

**Acceptance:**
- A `snapshots/friction-baseline-04-25-2026.txt` file with the top-20 most-painful error messages and their costs.
- A `snapshots/sweep-baseline-04-25-2026.json` file with pass-rates per archetype.
- Both files committed to the repo.

**Tests:** Not a code job — this is an instrumented run. The test is "the snapshot files exist and contain expected fields."

**Sizing:** ~30 min wall-clock, $5 median. Sequential (can't be parallelized — it's one sweep).

---

## Job B (deferred — separate epic)

**Why deferred:** Job B was "ship the hint-toggle A/B harness and run a 40-trial paired test on the re-ranker." The session-44 question was "does the ranker actually help Meph's live pass rate?" That's important but expensive ($30-100 in API) and requires a session of its own. It does not block the shell upgrade. **Defer to a dedicated session after the shell upgrade lands.**

---

## Order within the session

Jobs A and C are pure code, no API spend. Run them first, in parallel where possible:

1. **Read** `playground/factor-db.js` + `playground/server.js` (the receiver) to understand the existing schema.
2. **Job A code** + tests (~30-40 min agent time).
3. **Job C code** + tests (~30-40 min agent time).
4. **Verify both** — commit. Tests green. New tables + scripts visible.
5. **Job D — ASK RUSSELL** before running the sweep (per the budget-first rule). State median + range. On approval, fire it.
6. **Commit the snapshots** with a brief CHANGELOG entry.

---

## Acceptance for the whole hardening session

- [ ] `code_actions_runtime` table exists in the ledger
- [ ] Beacons flowing into both the JSONL (legacy) and the table (new)
- [ ] `scripts/log-compiler-edits.mjs` exists and was tested on a fake edit
- [ ] The Git hook fires on commit
- [ ] `snapshots/friction-baseline-04-25-2026.txt` + `snapshots/sweep-baseline-04-25-2026.json` exist and are committed
- [ ] All compiler tests still 2586/0
- [ ] CHANGELOG entry for the session
- [ ] HANDOFF updated to point to the shell upgrade as the next session's work

---

## What this unlocks

After this session lands:

- The shell upgrade can ship knowing every phase's data is captured
- The friction script can rank errors using BOTH compile-time AND runtime data
- The compiler-edit auto-log lets us measure "did rewriting this error help?" deterministically
- The baseline sweep is the BEFORE picture; after the shell upgrade ships, we re-sweep and the diff is the win

---

## Resume prompt (in case session pauses partway)

> Read `plans/plan-flywheel-hardening-04-25-2026.md`. Current state: jobs
> A and C are code-only; job D is a $5 sweep that needs Russell's go.
> Check `git log` to see which jobs have already landed; pick up from
> where the last commit ended.
