# Sweep Diagnosis — 2026-04-26

Diagnosis of curriculum-sweep run that produced misleading summary counts.

## The reported numbers vs what actually happened

The user-reported summary in the prompt:

```
Wall clock: 91.7s
Tasks run: 38
Completed: 0
Stuck: 0
Timed out: 0
Factor DB: 1817 → 1817 rows (+0)
Passing rows: 714 → 714 (+0)
```

The actual run captured in `/tmp/sweep-output.txt` (last modified 2026-04-26):

```
Wall clock: 1595.5s
Tasks run: 38
Completed: 6
Stuck: 0
Timed out: 20
Factor DB: 1817 → 1817 rows (+0)
Passing rows: 714 → 714 (+0)
```

So the 91.7s / 0 / 0 / 0 numbers in the prompt **do not match the saved output**. Most likely the user was citing a different run (a dry run? an aborted run? a hung CLI invocation that printed nothing?) and the most recent file on disk is the 1595s / 6-completed run.

Either way, **the math problem the user spotted is real** for the saved run and would also be real for the 91s run.

## Math: the missing bucket

For the saved run:

- Tasks run: 38
- Completed (`r.ok`): 6
- Stuck (`r.stuck`): 0
- Timed out (`r.timedOut`): 20
- **Sum of printed buckets: 26**
- **Missing: 12**

Counting the ❌ glyphs in the per-task log: **exactly 12 lines** marked `❌`. These are tasks that were neither `ok` nor `stuck` nor `timedOut` — the fourth invisible bucket.

Where they come from in the code (`playground/supervisor/curriculum-sweep.js`):

- `driveTaskOnWorker` returns `{ ok: false, stuck: false, timedOut: false, error: err.message }` on lines 217–219 when the fetch throws a non-AbortError. That's HTTP errors, ECONNREFUSED, network failures, anything where the SSE stream never completes successfully.
- `gradeAbortedRun` (line 235) returns `{ ok: false, timedOut: true, dbPassed: false }` when there's no factorDB AND we hit AbortError. With factorDB present, it returns `{ ok: dbPassed, timedOut: !dbPassed, dbPassed }` — never `false/false/false`.
- `computeTaskOutcome` (line 270) only sets `ok: true | false`. If outcome is `ok: false`, the surrounding code in `driveTaskOnWorker` returns `{ ok: outcome.ok, stuck, timedOut: false, ... }` — and `stuck` came from string-matching `STUCK:` in Meph's stream which most fast-fails never produce.

So the fourth invisible bucket is **"task completed (or errored) without saying TASK COMPLETE, without saying STUCK:, without timing out, and without producing a test_pass=1 Factor DB row"**. The summary doesn't print it.

## Root cause hypothesis (ranked)

**1. (Most likely — confirms 9 of 12 ❌ cases) Worker process death cascading.**
Looking at the per-task timestamps in the output, the last 9 tasks in the bucket order each fail in 5-7 seconds:

```
[❌] L6 company-directory — 5.8s     (worker-1, after 7 timeouts)
[❌] L6 batch-prune — 5.5s           (worker-3)
[❌] L7 admin-panel — 5.4s           (worker-2)
[❌] L8 rbac-api — 5.4s              (worker-1)
[❌] L9 agent-summary — 6.6s         (worker-2)
[❌] L8 multi-tenant — 6.7s          (worker-3)
[❌] L10 full-saas — 7.3s            (worker-1)
[❌] L9 agent-categorizer — 6.2s     (worker-3)
[❌] L10 dashboard-api — 6.3s        (worker-2)
```

These are tasks at the END of each worker's bucket. After multiple 180s timeouts where the abort fired but the worker (claude.exe + child processes) likely got into a bad state, the next task's `fetch()` to `/api/chat` either rejects fast (ECONNRESET) or returns a non-OK response. `if (!response.ok) throw new Error('HTTP ' + status)` falls through to the catch's non-AbortError branch → `{ ok: false, stuck: false, timedOut: false, error }`. The `❌` shows the error glyph but the summary doesn't count it.

**2. (Likely — 3 of 12 ❌ cases) Real Meph completions that failed honestly.**
`user-profiles — 65.2s`, `kpi-sales — 176.5s`, `etl-api-ingest — 149.2s` — these are tasks where Meph ran for a real duration, the SSE stream completed, but Meph never said TASK COMPLETE and there's no test_pass=1 row in the time window. Honest fail. These ALSO don't get counted in any bucket.

**3. (Unlikely but possible) The summary was from a different run entirely.**
The 91.7s number could be from a dry-run, a `--workers=3` run that aborted at the preflight banner, a stale terminal scrollback. The saved file shows 1595s. But Russell's prompt math holds true for either run — the same fourth bucket is missing.

## Why Factor DB shows +0 rows

Even with 6 ✅ wins, **0 new Factor DB rows landed**. That's the bigger problem and it's a separate bug from the missing bucket:

The CLAUDE.md note (Cross-Path Tool Side-Effects rule, dated 2026-04-22) says cc-agent mode dispatches tool calls through the MCP server, NOT through `/api/chat`'s post-tool-call closure block. Side-effects in server.js's loop are invisible.

The 6 wins came from `said TC` flag in the SSE stream — but with **0 new Factor DB rows**, the test_pass writes from `http_request` aren't landing either. The MCP context wiring in `playground/ghost-meph/mcp-server/tools.js` may still not be writing to factorDB for cc-agent runs, OR it's writing to a different DB file, OR the `factorDB` ctx prop is stubbed. This needs a follow-up investigation but is OUT OF SCOPE for this diagnosis run.

## Minimal patch — print the missing bucket

```diff
--- a/playground/supervisor/curriculum-sweep.js
+++ b/playground/supervisor/curriculum-sweep.js
@@ -436,11 +436,17 @@ export async function runSweep({
     console.log(`\n=== Sweep Summary ===`);
     console.log(`  Wall clock: ${(elapsedTotal / 1000).toFixed(1)}s`);
     console.log(`  Tasks run: ${flatResults.length}`);
     console.log(`  Completed: ${flatResults.filter(r => r.ok).length}`);
     console.log(`  Stuck: ${flatResults.filter(r => r.stuck).length}`);
     console.log(`  Timed out: ${flatResults.filter(r => r.timedOut).length}`);
+    const failed = flatResults.filter(r => !r.ok && !r.stuck && !r.timedOut);
+    console.log(`  Failed: ${failed.length}`);
+    if (failed.length > 0) {
+      const errSample = failed.filter(r => r.error).slice(0, 3).map(r => `${r.task}: ${r.error}`);
+      if (errSample.length > 0) console.log(`    sample errors: ${errSample.join(' | ')}`);
+    }
     console.log(`  Factor DB: ${startStats.total} → ${endStats.total} rows (+${endStats.total - startStats.total})`);
     console.log(`  Passing rows: ${startStats.passing} → ${endStats.passing} (+${endStats.passing - startStats.passing})`);
```

That's it. Six new lines. Covers the missing bucket and surfaces sample error messages for diagnosis next time.

## Recommendation

**This is a real bug in the harness — apply the patch.** Two reasons:

1. **The missing bucket exists in normal sweep behavior**, not just in pathological runs. Any task where Meph completes the stream without saying TASK COMPLETE and without writing a test_pass=1 row → silently dropped from the summary. Even on a healthy sweep this would mislead the operator.

2. **The fast-fail cascade is a real environmental issue worth seeing.** When a worker crashes and the next 3 tasks fast-fail with HTTP errors, the operator needs to know that — currently it looks like "the sweep just finished early." Adding the Failed bucket plus sample errors makes that obvious.

Whether the +0 Factor DB rows is a related bug or separate is a follow-up. The CLAUDE.md rule "Cross-Path Tool Side-Effects Belong IN The Tool" was added on 2026-04-22 specifically because http_request side-effects weren't writing through the MCP path. It's possible the fix is incomplete — every successful run still produced 0 Factor DB rows, which would mean http_request's test_pass=1 write is still living somewhere cc-agent mode never executes.

The Failed-bucket patch is one-time, low-risk, will not change behavior for existing tooling that consumes the summary text. Worth applying.

## Worktree info

- Worktree path: `C:\Users\rmill\Desktop\programming\clear\.claude\worktrees\agent-a8deb1e23d785a96d`
- Branch: `worktree-agent-a8deb1e23d785a96d`
- Commit: TBD (this file's commit)
- Read-only diagnosis — no code changes applied.
