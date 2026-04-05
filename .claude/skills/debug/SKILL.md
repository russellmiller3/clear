---
name: debug
description: >
  Systematic bug debugging methodology using Template A (Quick Fix), Template B (Investigation),
  or Template C (Deep Dive). Always creates a branch, enforces budget gates ($1/$2/$2.50/$3),
  uses CLI-first testing, generates ranked hypotheses before touching code, and writes failing
  tests before fixes. Use this skill whenever the user reports a bug, error, or broken behavior --
  including phrases like "debug this", "there's a bug", "fix this bug", "something is broken",
  "it's not working", "help me debug", or when they paste an error message or stack trace.
  Also trigger when the user describes unexpected behavior even without using the word "bug".
---

# Debug Skill

You are working systematically to fix a bug. Follow this protocol exactly -- it exists because
undisciplined debugging burns budget and breaks things further.

**Before starting:** Read `learnings.md` TOC and scan for sections relevant to the subsystem
you're debugging. Past gotchas will save you from repeating mistakes.

---

## Step 0: Choose Your Template

Before anything else, classify the bug:

```
Is the cause obvious from the error/logs?
+-- YES --> Template A: Quick Fix  (<$1, single file)
+-- NO  --> How complex?
    +-- 1-2 files, single system --> Template B: Investigation  (<$3)
    +-- Multi-system, race condition, performance, or cost already >$2 --> Template C: Deep Dive
```

**Tell the user which template you're using and why.**

---

## Critical Rules (Apply to ALL Templates)

### 1. Always Work on a Branch

```bash
git checkout -b fix/descriptive-bug-name
```

Never debug on `main`. If something goes wrong, rollback = `git branch -D fix/name`.

### 2. Budget Gates -- Hard Stops

| Cost Reached | Required Action |
|---|---|
| **$1.00** | Checkpoint: Have you reproduced the bug in CLI/test? If NO --> stop, ask user for more info |
| **$2.00** | Checkpoint: Do you have a confirmed root cause with evidence? If NO --> stop, create hypothesis doc |
| **$2.50** | Commit whatever working progress exists. Create RESTART doc if not fixed |
| **$3.00** | HARD STOP. Commit progress. Write handoff. Update user. |

At any gate: if a working fix exists --> commit immediately. Don't wait.

### 3. Test-First (TDD for Bugs)

```
RED      --> Write test that FAILS (reproduces bug)
GREEN    --> Minimal fix to make test PASS
REFACTOR --> Remove debug logs, clean up
VERIFY   --> Full test suite passes
BROWSER  --> Ask user to confirm UI (only if needed)
```

**Never fix before you can reproduce. A passing test is proof you fixed it.**

### 4. CLI-First Testing Hierarchy

| Priority | Method | When |
|---|---|---|
| 1st | CLI eval | `node cli/cast-test.js eval --code "..."` -- parser, evaluator, solver bugs |
| 2nd | Unit tests | `npm test` (plain Node) or `npm run test:stores` (needs $lib) |
| 3rd | CLI API commands | `node cli/cast-test.js ml/chat/predict ...` -- API endpoint bugs |
| 4th | Playwright | `npm run test:ui` -- UI/visual bugs |
| 5th | Ask user | Manual browser test -- fix confirmed, need final UX check |

**Never ask the user to open a browser before an automated test passes.**

**IMPORTANT:** Always try `node cli/cast-test.js eval --code "..."` first before
browser-based debugging. Most parser/evaluator bugs can be reproduced without
the dev server or a browser.

---

## Template A: Quick Fix (Obvious Bugs, <$1)

For typos, missing imports, obvious null refs, clear error messages.

### A.1 -- Reproduce via CLI

For parser/evaluator bugs:
```bash
node cli/cast-test.js eval --code "the code that triggers the bug"
```

For API bugs (dev server must be running):
```bash
node cli/cast-test.js ml --data test-churn.csv --target churn
node cli/cast-test.js chat --message "trigger the bug"
```

Confirm you can see the error in terminal output before proceeding.

### A.2 -- Write a Failing Test

```javascript
// In the relevant test file (e.g. src/lib/parser.test.js)
import { describe, it, expect, run } from './testUtils.js';

describe('Bug: [description]', () => {
  it('reproduces the issue', () => {
    const result = functionWithBug(input);
    expect(result).toBe(expectedValue);  // Must FAIL first
  });
});

run();
```

Run it and verify it fails with the same error:
- Plain Node files: `node src/lib/parser.test.js`
- Files using `$lib/`: `npx vite-node src/lib/stores/myStore.test.js`

### A.3 -- Apply ONE Fix

Make the smallest possible change. One line ideally.

### A.4 -- Verify

```bash
# 1. Your specific test now passes
node src/lib/parser.test.js

# 2. Full unit suite still passes
npm test

# 3. Store tests still pass (if relevant)
npm run test:stores
```

### A.5 -- Commit

```bash
git add -A
git commit -m "fix: [description]

Root cause: [what was wrong]
Fix: [what you changed]
Test: [which test file covers this]"
```

---

## Template B: Investigation (Unknown Root Cause, <$3)

For bugs where the cause isn't obvious. Need to diagnose before fixing.

### B.0 -- Generate Hypotheses FIRST (Required)

Before adding any logs or reading any code, write this table:

| # | Theory | Likelihood | Test Method |
|---|---|---|---|
| 1 | [Most likely cause] | High | [How to confirm] |
| 2 | [Second theory] | Medium | [How to confirm] |
| 3 | [Edge case] | Low | [How to confirm] |

**Select hypothesis #1. State why. If wrong, fall back to #2.**

Share your hypothesis with the user before fixing:
> "I believe the issue is [X] based on [evidence]. I'll test by [method]. Agree?"

### B.1 -- Add Targeted Logs to Validate #1

```javascript
// Add console.log at key points in the suspect function
function suspectFunction(input) {
  console.log('[DEBUG] suspectFunction called with', JSON.stringify(input));
  const result = transform(input);
  console.log('[DEBUG] suspectFunction result', JSON.stringify(result));
  return result;
}
```

Then reproduce:
```bash
node cli/cast-test.js eval --code "trigger the bug"
# or for API routes (check terminal where dev server is running):
node cli/cast-test.js ml --data test-churn.csv --target churn
```

**$2 gate:** If cost >$2 with no confirmed root cause --> STOP. Create hypothesis doc, ask user.

### B.2 -- Write Reproduction Test (After Confirming Root Cause)

```javascript
import { describe, it, expect, run } from './testUtils.js';

describe('Bug: [description]', () => {
  it('reproduces the issue', () => {
    const result = buggyFunction(inputThatFails);
    expect(result).toBe(correctValue);  // FAILS before fix
  });
});

run();
```

### B.3 -- Apply Targeted Fix

ONE change based on confirmed diagnosis only. No shotgun changes.

```javascript
// WRONG: Change 5 things hoping one works
// RIGHT: Fix the exact root cause identified by logs
if (value === null) {   // Root cause confirmed: null not handled
  value = defaultValue;
}
```

### B.4 -- Verify Loop

```
Test fails --> Fix applied --> Test passes --> Remove debug logs --> Full suite passes --> Browser (if UI)
```

Verify each step before moving to the next.

### B.5 -- Commit + Document

```bash
git commit -m "fix: [description]

Root cause: [detailed explanation]
Evidence: [what logs/tests confirmed]
Fix: [what changed and why]
Prevention: [how to avoid in future]"
```

If this was a tricky bug, update `learnings.md` with the gotcha under the relevant topic section.

---

## Template C: Deep Dive (Complex/Multi-System)

Use when:
- Bug spans API + frontend + state management
- Race condition or timing-dependent ("works sometimes")
- Performance problem
- Cost already >$2 and still not fixed

**Steps:**
1. Create `PROGRESS-DEBUG-[BUG].md` to track state (see template below)
2. Use systematic elimination -- test one hypothesis per $0.50
3. Commit progress every $1 of cost
4. HARD STOP at $3 -- write handoff doc

### Progress Doc Template

```markdown
# Debug: [Bug Name]

**Branch:** fix/bug-name
**Cost so far:** $X.XX / $3.00

## Symptom
[What the user sees]

## Hypotheses (Ranked)
1. [Most likely] -- Evidence: [X]
2. [Second] -- Evidence: [Y]

## Investigation Log
- $0.50 -- [What you tried, what you found]
- $1.00 -- [Next step, result]

## Status
- [ ] Root cause confirmed
- [ ] Reproduction test written
- [ ] Fix implemented
- [ ] Fix verified

## Next Steps
1. [Specific action]
2. [Fallback if #1 fails]
```

### Race Condition Strategy
- Add timestamps to all debug logs: `console.log(\`[DEBUG ${Date.now()}] ...\`)`
- Look for async functions missing `await`, effects firing multiple times, stores updating without debounce
- Test in isolation: can you reproduce with a single-file unit test? If yes, it's not truly a race.

### Multi-System Strategy
- Isolate: which layer is wrong? (parser --> evaluator --> store --> component --> API)
- Test each layer independently using CLI tools before assuming cross-layer interaction
- Use `node cli/cast-test.js eval --code "..."` for parser/evaluator, then `node cli/cast-test.js ml/chat` for API

---

## Cast-Specific Debugging Commands

### Parser / Evaluator / Solver
```bash
# Test any Cast expression without a browser
node cli/cast-test.js eval --code "price = 100\nqty = 50\nrevenue = price * qty"

# Parse to AST (check if the parser sees the syntax correctly)
node cli/cast-test.js parse --code "rate = 8% +/- 2%"

# With overrides (test different inputs)
node cli/cast-test.js eval --file models/my-model.cast --overrides '{"price": 200}'
```

### API Endpoints (dev server must be running)
```bash
# ML pipeline
node cli/cast-test.js ml --data test-churn.csv --target churn

# Chat
CAST_AUTH_TOKEN=xxx node cli/cast-test.js chat --message "test query"

# Generate
CAST_AUTH_TOKEN=xxx node cli/cast-test.js generate --prompt "test prompt"

# E2E smoke test (ml --> predict --> export --> log)
node cli/cast-test.js e2e
```

### Test Suites
```bash
# Unit tests (plain Node -- parser, evaluator, helpers)
npm test

# Store tests (need $lib alias -- uses vite-node)
npm run test:stores

# AI chat evals (offline, no API calls)
npx vite-node src/routes/api/chat/chat.evals.test.js

# UI tests (Playwright)
npm run test:ui

# Everything
npm run test:all
```

---

## Common Bug Patterns (Quick Reference)

**Parser rejects valid syntax:**
--> Check `src/lib/parser.js` -- new keywords must go BEFORE continuation logic (see learnings.md)
--> Test: `node cli/cast-test.js parse --code "the failing syntax"`

**Evaluator returns wrong value:**
--> Check `src/lib/evaluator.js` -- trace the AST node type handling
--> Test: `node cli/cast-test.js eval --code "the failing expression"`

**Store not updating / wrong state:**
--> Check reactive deps -- Svelte 5 `$derived` vs `$derived.by`, `$effect` infinite loops
--> Test: `npx vite-node src/lib/stores/theStore.test.js`
--> Trigger on status changes, not data changes (see learnings.md)

**Mysterious UI State** (shows wrong value despite correct data):
--> Check reactive deps, Svelte runes vs stores, duplicate component instances
--> `$derived` for computed state, never cache what Svelte can derive

**Race Condition** (works sometimes, fails other times):
--> Add timestamps to logs, look for async without await, check effects firing multiple times
--> Svelte 5 `$effect` can loop -- check for circular reactive dependencies

**API route returns error:**
--> Test with CLI first: `node cli/cast-test.js [command]`
--> Check auth: does this route need `CAST_AUTH_TOKEN`?
--> Check if ML service needs to be running (port 8000)

**AI generates wrong Cast code:**
--> Check `src/lib/castSyntaxReference.js` -- is the syntax documented in `AI_SYSTEM_PROMPT`?
--> Run evals: `npx vite-node src/routes/api/chat/chat.evals.test.js`
--> Test specific scenario: `node cli/cast-test.js chat-eval --scenario scenario-name`

**Null Reference** ("Cannot read property X of null"):
--> Trace backwards where value should be set, check async timing, add optional chaining
--> Common in store --> component pipeline when async data hasn't loaded yet

**Import / Build errors:**
--> `$lib/` imports only work in SvelteKit context (vite-node or dev server)
--> Plain Node tests must import with relative paths
--> Check if file uses `.svelte.js` extension (runes-enabled)

---

## Stop Signals

**Keep going (green):**
- Root cause identified with evidence
- Reproduction test written and failing
- Under budget, making $0.50 increments of progress

**Reassess (yellow):**
- Cost >$1 with no reproduction yet
- Cost >$2 with no confirmed root cause
- On your third different approach
- Adding logs everywhere without a hypothesis

**STOP (red):**
- Cost = $2.50 without a working fix --> commit progress, create restart doc
- Cost = $3.00 --> hard stop regardless
- Fourth attempt at same fix
- Bug requires architecture change --> escalate to user

---

## Post-Fix: Explain What You Found (Plain English First)

After finding and fixing a bug, **always explain in chat** before showing any code:

1. **Symptom** -- what the user saw ("the chart line was flat and never changed")
2. **Root cause** -- in plain English, no function names yet ("the AI used `t` as shorthand but the data column is actually called `time`, so the solver treated `t` as a number to fit instead of the input data")
3. **Fix** -- one sentence ("we now tell the AI the exact column names in its prompt")

Only AFTER that plain-English summary, mention file names or technical details if relevant.
The user is a product manager who knows some coding concepts but isn't deep in the codebase.
Lead with "what happened" not "which function had a bug."

## Post-Fix: Tell the User if They Need to Restart

After every fix, **always tell the user whether they need to restart the dev server:**

- **Restart required** if you changed: server routes (`src/routes/api/`), server hooks (`hooks.server.js`), env vars, or any file imported only on the server side (e.g. `prompts.js`, solver modules used by API routes)
- **No restart needed** (HMR handles it) if you changed: `.svelte` components, client-side stores, CSS, client-only JS

Say it plainly: "Restart your dev server for this to take effect" or "HMR should pick this up, no restart needed."

## Post-Fix: Update Learnings

If the bug was non-obvious or revealed a platform gotcha, update `learnings.md`:
- Merge the lesson into the relevant existing topic section
- If no section fits, add a new one and update the TOC
- Keep it scannable -- future you should find this gotcha in one place

## Done Criteria

A bug is **truly fixed** when:
1. Reproduction test exists and PASSES
2. Full test suite still passes (`npm run test:all` or at minimum `npm test`)
3. No errors in terminal for the scenario
4. User confirmed UI works (if applicable)
5. Committed to branch, merged to main
6. Branch deleted
7. Tricky bugs documented in `learnings.md`
