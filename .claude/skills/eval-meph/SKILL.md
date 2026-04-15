---
name: eval-meph
description: Run the Meph tool eval as a regression net. Trigger when changes touch playground/server.js (especially TOOLS array, executeTool, validateToolInput, /api/chat handler), playground/system-prompt.md, or any tool definition. Also trigger when the user says "eval meph", "test meph", "run the meph eval", or asks to verify Meph's tool layer. Proactively suggest running this BEFORE shipping any change to Meph's surface — the pre-push hook will catch it but local feedback is cheaper.
allowed-tools: Bash, Read
---

# Meph Tool Eval — Agent Regression Net

## What it does

Drives Meph through 16 scenarios — one per tool — through the live `/api/chat`
handler (same path the Studio UI uses). For each scenario:
1. Sends a prompt designed to trigger ONE specific tool
2. Asks Meph to self-report in the same response whether the tool worked
3. Grades pass/fail on tool-call-fired AND Meph-says-it-worked

The self-report is the key signal: Meph is the only one who sees the actual
tool RESPONSE. Server logs confirm the tool fired; Meph confirms it returned
useful data (not "Unknown tool", not garbage, not empty).

## When to invoke

**ALWAYS run before shipping changes to:**
- `playground/server.js`
  - The `TOOLS` array (tool definitions, descriptions, input_schemas)
  - The `executeTool` switch (handler logic)
  - `validateToolInput` (runtime schema validator)
  - `/api/chat` handler (SSE stream, retry, timeout, watchdog)
  - Any tool result / SSE event shape
- `playground/system-prompt.md` (Meph's instructions)
- New tool added or existing tool removed

**Suggest proactively when the user describes a session that touched any of those files.**

**SKIP** for changes that don't affect Meph's tool surface:
- Pure compiler changes (`compiler.js`, `parser.js`, `synonyms.js`)
- Doc-only changes (`*.md` outside system-prompt.md)
- Landing pages, IDE-only HTML/CSS that doesn't change chat behavior
- Test-only changes

## How to run

```bash
node playground/eval-meph.js
```

What happens:
1. If `SKIP_MEPH_EVAL=1` → exits 0 immediately
2. If no `ANTHROPIC_API_KEY` → exits 0 with a skip message (so contributors without keys aren't blocked)
3. If no playground server reachable at `PLAYGROUND_URL` (default `http://localhost:3456`) → spawns one for the duration of the eval
4. Runs 16 scenarios, each ~5–15s
5. Prints per-scenario result + Meph's self-report + a final tally
6. Exits 0 if all pass, 1 if any fail

**Cost:** ~$0.10–0.30 per run (Sonnet, ~270k tokens total).
**Time:** ~90–180s (varies with Anthropic API latency).

## How to read the output

Each scenario prints something like:
```
[ 1/16] edit_code (write)        ✅ tools=[edit_code, edit_code]  (5.0s)
      meph says: "The `edit_code` tool worked correctly — it returned applied:true..."
```

- ✅ green = expected tool was called AND grader passed
- ❌ red = grader failed (didn't call expected tool, or self-report is missing)
- ⚠️ yellow = tool was called but Meph flagged an issue in his self-report

A bottom section called "⚠️  Meph-reported issues" lists any tools Meph
explicitly said were broken. **Those are your real bugs.** Read each, find
the executeTool case or schema entry that's wrong, fix it, rerun.

## Common failure modes and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `"Unknown tool: X"` in Meph's self-report | Meph hallucinated tool name OR validator's default rejected a real tool | Add the tool to `validateToolInput`'s known set, or fix Meph's prompt |
| `"requires a 'foo' string"` validator error | Validator field name doesn't match Anthropic schema | Align the field names — schema is the source of truth |
| `"[object Object]" is not valid JSON` API error | A tool returned a bare object instead of a string from `executeTool` | The `safeContent` coercion at tool_result construction should catch new ones |
| Scenario passes locally but fails in pre-push | API key not propagated, or server stored a stale key | Check `process.env.ANTHROPIC_API_KEY` is exported in the shell that runs `git push` |
| Many scenarios fail with "n/a" first-token time | Anthropic API outage or rate limit | Wait 5 minutes, rerun |
| One specific scenario fails after Meph took a different path | Grader-strictness false positive | Re-read the run output. If Meph clearly did the right thing, loosen the grader |

## Sister eval: full-loop suite

`node playground/eval-fullloop-suite.js` is heavier — Meph builds 3 complex
apps from scratch end-to-end. ~3 minutes, ~$0.50–1.00 per run. **Not in
pre-push** (too slow + variable). Run manually after big architectural changes
to Meph or when adding new app patterns. Catches deeper integration issues
that single-tool scenarios miss.

## Pre-push integration

`.husky/pre-push` runs `node playground/eval-meph.js` after the compiler and
e2e tests when `ANTHROPIC_API_KEY` is set. To bypass for one push:

```bash
SKIP_MEPH_EVAL=1 git push
```

Bypass is for emergencies (network issues, API down). Don't bypass to skip a
real failure.

## Why this exists

Compiler tests catch compiler regressions. E2e tests catch template
regressions. Neither catches "I broke a Meph tool." A real regression I
introduced this session: changed the validator to require `path` instead of
`filename` — every legitimate `read_file` call started getting rejected.
Compiler tests passed. E2e passed. Meph eval would have caught it in 90s.
That's the gap this fills.
