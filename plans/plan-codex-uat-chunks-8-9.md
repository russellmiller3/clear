# Plan — Codex stash chunks #8 + #9 (UAT browser-test generator + CLI plumbing)

**One-line goal:** consume the JSON UAT contract that already lives in `lib/uat-contract.js` and emit a runnable Playwright test script that walks every page + clicks every UAT-marked control, plus the CLI plumbing to write both artifacts to disk on `clear build`.

**Branch:** `feature/codex-uat-chunks-8-9` from `main`. Land as one cohesive commit since #8 needs #9's CLI plumbing to actually run.

**Source of authority:** `plans/codex-stash-2026-04-27.patch` — the full Codex stash dump preserved on disk before `git stash drop` so the relevant hunks can be re-applied.

---

## Why this exists separately

The 2026-04-28 stash-cleanup session pulled chunks #1, #2, #3 (with #10), #4, #5, #7 (partial), and #10 from Codex's stash. Chunks #8 + #9 weren't pulled because:

- Chunk #8 (`generateBrowserUAT(contract)` in compiler.js) emits a 250-line Playwright test runner as a string template. Many regex patterns + escape characters; high probability of a transcription typo breaking compilation.
- Chunk #9 (CLI plumbing in `cli/clear.js` — `writeGeneratedUATArtifacts`, `staticTestServerCode`, `formatIssue`, `send`, `waitForHttpServer`, `skipBlockedNodeCheck`) is another ~250 lines of new functions that need careful wiring through the `clear build` command.
- Together they're ~700 lines of code with real complexity. They deserve a focused session, not a tail-end-of-marathon attempt.

The other unfinished chunk (#6 — approval-rules dedicated render path) was deliberately skipped: it's a one-off render path for a specific table label which is anti-pattern (app-specific logic in the compiler). The right fix is to make existing styling work generically, not add a custom render path. Chunk #11 (plan-lint enforcement) was skipped because it references a `scripts/plan-lint.mjs` that doesn't ship in the patch.

---

## What ships when this lands

When a Marcus app like deal-desk runs `clear build apps/deal-desk/main.clear`, the CLI now writes two artifacts alongside the compiled `server.js` + `index.html`:

1. **`uat-contract.json`** — the JSON description of every page, route, button, form, and API call that the existing `generateUATContract()` produces (already shipped). Walks the AST, emits `{pages: [...], controls: [...], schemas: [...]}`.
2. **`uat.browser.mjs`** — a runnable Playwright test script that:
   - Visits every page directly via its route + asserts the page renders + screenshots it
   - Clicks every nav-item / route-tab / button + asserts the expected page comes up
   - Drives table sort + filter on every table + asserts the sort indicator appears + filter narrows the row count
   - Clicks the first column of every detail-target table + asserts the detail panel populates
   - Asserts the persistent shell (sidebar + header) stays visible across every navigation
   - Asserts no horizontal page overflow on any route
   - Asserts no console errors on any route
   - Writes screenshots to `.clear-uat-screenshots/`

Plus a tiny static HTTP server in `cli/clear.js` that serves the compiled output for the test, and a polling helper that waits for the server to come live before kicking off the Playwright runner.

The test runner needs `playwright` as a dev dependency (not a runtime dep — the compiled app itself doesn't ship Playwright). When playwright isn't installed, the script logs a clear "run npm install" message + exits non-zero so CI catches it.

---

## Execution

### Step 1 — extract chunk #8 from the saved patch

```bash
# Pull just the compiler.js hunks for chunks #8 from the saved patch
awk '/^diff --git a\/compiler\.js/,/^diff --git/' plans/codex-stash-2026-04-27.patch \
  | awk '/^@@.*-2752,/,/^@@.*-3576/' \
  > /tmp/chunk-8.patch

# Inspect before applying — sanity-check the line numbers + helpers it adds
head -100 /tmp/chunk-8.patch
```

Lives at stash-patch lines ~6986-7350 (compiler.js area). Functions added:
- `generateBrowserUAT(contract)` — emits the Playwright test script as a string
- 10 helpers used inside the script: `assert`, `test`, `routeUrl`, `pageByRoute`, `screenshotName`, `captureRouteScreenshot`, `assertVisiblePage`, `assertNoPageOverflow`, `assertPersistentShell`

Plus a modification to existing `generateE2ETests(body)` → `generateE2ETests(body, uatContract = null)` so it can also emit the UAT-driven flow when the contract is non-null.

### Step 2 — extract chunk #9 from the saved patch

```bash
awk '/^diff --git a\/cli\/clear\.js/,/^diff --git/' plans/codex-stash-2026-04-27.patch \
  > /tmp/chunk-9.patch
head -100 /tmp/chunk-9.patch
```

Lives at stash-patch lines ~6058-6349 (cli/clear.js area). Functions added:
- `formatIssue(issue)` — pretty-prints validator issues for CLI output
- `writeGeneratedUATArtifacts(buildDir, result)` — writes uat-contract.json + uat.browser.mjs
- `staticTestServerCode()` — emits a tiny HTTP server module that serves the build dir
- `send(res, status, body, headers)` — small response helper for the static server
- `waitForHttpServer(url, timeout)` — polls until the server is live, used before kicking the test
- `skipWhenNodeSpawnIsBlocked(e)` — sandbox-tolerance helper (parallels chunk #2's pattern but for the CLI test runner)

Plus modifications to `clear build` and `clear test` to call `writeGeneratedUATArtifacts` after a successful compile.

### Step 3 — wire the UAT contract through compileProgram

The contract walker already exists in `lib/uat-contract.js` (shipped earlier). In `index.js`'s `compileProgram`, after parsing + validating, call `generateUATContract(ast.body)` and stash the result on `result.uatContract`. Then `generateE2ETests` reads it and `generateBrowserUAT` consumes it.

### Step 4 — add playwright as a dev dep

```bash
npm install --save-dev playwright
```

Run once to download the browser binaries (~100MB). Document in package.json with a `"clear:test:browser"` script that runs the generated `uat.browser.mjs`.

### Step 5 — TDD coverage

Add a regression test in `clear.test.js` under `describe('Browser UAT generator')` that:
- Compiles a small multi-page app
- Calls `generateBrowserUAT(result.uatContract)` and asserts the output contains the expected `await page.goto`, `await page.locator('[data-clear-uat-id="..."]').click`, `await page.screenshot` lines for each page + control in the contract
- Does NOT actually run Playwright (that's covered by a separate integration test or by running the generated script manually)

### Step 6 — verify on deal-desk

```bash
node cli/clear.js build apps/deal-desk/main.clear
ls apps/deal-desk/.clear-serve/uat-contract.json apps/deal-desk/.clear-serve/uat.browser.mjs
node apps/deal-desk/.clear-serve/uat.browser.mjs    # actually runs the Playwright tests
```

Expect: every sidebar route screenshots clean, no console errors, no overflow, every control click lands on its expected page.

### Step 7 — docs cascade

- intent.md: note that `compileProgram(...).uatContract` is the JSON contract + that `clear build` writes a Playwright test runner alongside it
- AI-INSTRUCTIONS.md: tell Meph the new artifacts exist; he can run them after building any app
- FEATURES.md: add a row "Browser-driven UAT tests for every compiled app"
- FAQ.md: "Where does the browser UAT generator live?" entry pointing at compiler.js + cli/clear.js + the contract walker
- CHANGELOG.md: dated entry

---

## Why these chunks weren't pulled in the 2026-04-28 stash cleanup

Honest scope call. The stash-cleanup session ran ~6 hours of focused work pulling cleaner chunks first:

- chunk #1 (validator false-positive fixes) — ~50 lines, low risk
- chunk #2 (Cloudflare sandbox tolerance) — ~20 lines, test-only
- chunk #4 (UAT id markers on buttons / nav / route-tabs) — ~10 lines, additive
- chunk #5 (sortable + filterable tables) — ~140 lines, medium risk

By the time #8 + #9 came up, a clean focused-session-with-fresh-eyes was the safer call than half-applying the Playwright generator at the tail end. The saved patch + this plan = the work survives the stash drop.

---

## Stop conditions

- Playwright doesn't install cleanly (browser binary download fails) → flag for next session, don't ship #8+#9 without working Playwright integration test.
- The generated `uat.browser.mjs` doesn't pass on deal-desk (real bug found) → fix the bug at the right layer (compiler emit, contract walker, or the test generator) before merging.
- `clear build` regresses on any of the 14 apps → roll back the CLI plumbing, ship just the compiler-side `generateBrowserUAT` if useful in isolation.

---

## What this plan deliberately does NOT cover

- Cloud-hosted UAT runs (just local Playwright for now)
- Visual regression diffing against baseline screenshots (just capture, no compare)
- AI-generated test cases beyond what the contract describes (no LLM-driven test expansion)
- Performance benchmarks (just functional assertions)

---

## Iteration handoff

- Plan written 2026-04-28 evening, after the stash-cleanup session pulled the simpler chunks.
- Stash itself was dropped after the plan was committed; the patch lives at `plans/codex-stash-2026-04-27.patch` for reference.
- Russell's call when to execute: any focused session with fresh eyes can pick this up.
