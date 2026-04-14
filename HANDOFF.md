# Handoff — 2026-04-14 (Shipped: Studio Bridge + Friendly Tests + Unified Terminal)

## Current State
- **Branch:** main (everything merged, 50+ unpushed commits about to go)
- **Tests:** 1850 compiler tests, 0 failures. 108 server tests passing (16 pre-existing UI failures unrelated).
- **Working tree:** clean after this commit

## What Was Done This Session (9 commits)

### Studio Bridge — shared browser session (the big one)
Meph and the user now share the SAME iframe. When the user clicks in the preview, Meph sees it. When Meph clicks, the user sees it happen live. Bridge is a ~90-line postMessage script the compiler injects into every built HTML page, gated on `?clear-bridge=1` or `<meta name="clear-bridge">` (srcdoc safe).

- User clicks → `[user]` events fed into a ring buffer (last 200) via `/api/meph-actions`
- Meph commands (click/fill/inspect/read-dom/read-storage) flow through SSE → iframe → postMessage reply → `_bridgePending` registry resolves server-side Promise
- `click_element`, `fill_input`, `inspect_element`, `read_storage` refactored off Playwright onto the bridge
- New tools: `read_actions`, `read_dom`

### Friendly test failures with click-to-source
Every test failure is now plain English, names the exact call, and carries `[clear:N]` so the Studio UI can jump to source. Compiler emits `_expectStatus` / `_expectBodyHas` / `_expectSuccess` / `_expectFailure` / `_expectBodyContains` / `_expectBodyLength` / `_expectBodyTruthy` / `_expectErrorContains` helpers. Each code explained in 14-year-old English:

- 200/201/204/400/401/403/404/409/422/429/5xx all get unique hints
- `POST /api/notes returned 404. 404 means "there is no endpoint at that URL." Either the path is wrong, or you forgot to write \`when user calls POST /api/notes:\`.`

### "Fix with Meph" button
Every failing test row renders a button that bundles `{testName, error, sourceLine, 6 surrounding lines of code}` into a fix prompt and auto-submits to Meph. He already has `edit_code` + `run_tests`, so the loop closes: fail → click → edit → re-test.

### Meph sees user's Run Tests
Chat POST body now includes a `testResults` snapshot. Server's new `buildSystemWithContext()` appends a "Latest Test Run" section to Meph's system prompt with the failures inline. Meph stops re-running tests just to see them.

### Unified terminal timeline
The terminal pane is now the single honest log. Five sources interleaved chronologically:
- `[stdout]` / `[stderr]` — running app
- `[user]` — bridge clicks/inputs
- `[browser error]` / `[browser warn]` — iframe console
- `[meph]` — every tool call Meph makes

When a bug happens, scroll the terminal up — that IS the repro. `read_terminal` tool description + system prompt updated so Meph reaches for it first on "fix this" requests.

### Windows libuv shutdown fix
Two competing SIGTERM handlers (one closing Playwright async, one synchronous `process.exit`) caused `UV_HANDLE_CLOSING` assertions on Ctrl-C. Consolidated into a single `shutdown()` that awaits `closeBrowser()` before exit.

## What This Unlocks

The complete "fix this bug" loop with zero user narration:

1. User clicks around in preview → `[user]` events in terminal
2. Something breaks → `[browser error]` or `[stderr]` in terminal
3. User types "fix this" to Meph
4. Meph `read_terminal` → full repro
5. Meph `read_actions` / `read_dom` → structured state
6. Meph edits the .clear file
7. Meph sees user's latest test run in his context
8. Meph runs tests once to confirm the fix

This is the feedback loop RPA vendors charge $4k/mo for — except faster, explainable, and version-controlled.

## Next Steps

1. **Deploy todo-fullstack to Railway** — still not done end-to-end
2. **Record 60-second Loom demo** — use the bridge + fix-with-Meph loop as the demo
3. **Find 3 pilot companies** — FinServ/insurance via Axial network
4. **Fix `_lastCall.path` quirk** — user-test HTTP calls record path as `/` instead of the real path (breaks error messages slightly)
5. **Merge `frontendErrors` array** into terminal-only (array is now redundant with the mirrored lines)
6. **Intent tests (TEST_INTENT) status asserts** — auto-generated tests in `generateE2ETests()` still use raw `assert(r.status === N, ...)`. Route them through `_expectStatus` too.

## Resume Prompt

```
Read HANDOFF.md then PHILOSOPHY.md then CLAUDE.md.

Shipped Studio Bridge (shared iframe between Meph + user), plain-English
test failures with click-to-source + Fix with Meph button, unified
terminal timeline (5 sources interleaved), Meph sees user-triggered test
runs. "Fix this bug" loop closes end-to-end with zero narration.

1850 compiler tests green. Next: ship end-to-end Railway demo.
```
