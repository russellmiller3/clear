# Handoff — 2026-04-14 (Session 28: Closed the "fix this bug" loop end-to-end)

## Current State
- **Branch:** main (everything pushed to origin)
- **Last commit:** `a0265ce` feat(skill): /bigpicture narrates session arc — different from /handoff
- **Working tree:** dirty but harmless — `.claude/settings.local.json` (local prefs) and `apps/todo-fullstack/clear-runtime/db.js` (auto-regenerated runtime file)
- **Tests:** 1850 compiler ✅, 77/77 e2e ✅ (3 consecutive runs — flake fixed), 16-scenario Meph eval ✅, full-loop suite passes 14-15/16

## What Was Done This Session (28 commits, ALL pushed)

Massive session. Three structural shifts plus ~10 bug fixes plus new infrastructure. Top of the stack:

- **Studio Bridge** — postMessage glue that gives Meph + user the SAME iframe. User clicks land in `[user]` log, Meph clicks happen in front of user. ~90 lines compiler-injected, gated on `?clear-bridge=1` or `<meta name="clear-bridge">`.
- **Friendly test failures** — every status code (200/201/204/400/401/403/404/409/422/429/5xx) gets a plain-English explanation with a `[clear:N]` source-line tag. IDE renders failures as clickable + adds a "Fix with Meph" button that bundles error+line+context into a chat message.
- **Unified terminal** — `[stdout]` / `[stderr]` / `[user]` / `[browser error]` / `[meph]` interleaved chronologically. One log to read for the whole repro.
- **Schema enforcement (3 layers)** — runtime tool-input validator, system-prompt rule about JSON outputs, client-side `JSON.parse` lint on every `` ```json `` fence with red warning badge.
- **Meph tool eval** — `playground/eval-meph.js`, 16 scenarios + Meph self-report, runs in ~90s for ~$0.10–0.30. Wired into `.husky/pre-push` (gated on `ANTHROPIC_API_KEY`, skips cleanly if no key).
- **E2e flake eliminated** — 71/77 → 77/77 reliably. Root cause was state contamination across templates sharing BUILD_DIR; now wipes ALL persistence files (.db, .db-wal, .db-shm, .db-journal, .json) between runs and awaits child exit before reusing.
- **Compiler bug fixes** — `incoming` binding for search endpoints (was emitting `incoming?.q` with no binding), user-test HTTP path tokenizer (was collapsing `/api/todos` to `/`), Windows libuv shutdown assertion.
- **3 landing pages refreshed** — added "we made the AI not-blind" sections to `business-apps.html` and `business-agents.html`; created `for-business.html` (services pitch for buyers who hire Russell, $15k/$35k/$3k-mo pricing).
- **Two new skills** — `/eval-meph` (when to invoke the agent regression net) and `/bigpicture` aka `/bp` (end-of-session narrative for the human, distinct from /handoff).

## What's In Progress
**Nothing actively in-flight.** Working tree is clean modulo two auto-regenerated/local files. No half-built features, no commented-out code, no TODOs in commits.

## Key Decisions Made

- **The product differentiator is "we made the AI not-blind."** Cursor / Lovable / v0 all make the human a narrator. Clear Studio's bridge + terminal + friendly errors mean Meph reads the room himself — "fix it" becomes a real command. This is now front-and-center on both dev landing pages and is the closing pitch for the services landing.
- **Eval-meph runs in pre-push, full-loop suite stays manual.** Per-tool eval is cheap enough ($0.10) and fast enough (90s) for every push that has a key. Full-loop (3 apps from scratch, ~3min, ~$0.50–1.00) is too variable for automated gating — run manually after big architectural changes.
- **State isolation > port isolation for e2e fix.** Initial hypothesis was timing/port races. Real cause was leftover persistence files (`clear-data.json` was the smoking gun) corrupting next template's seed/queries. Fix is wiping all 5 persistence file variants between runs + awaiting child exit.
- **`/bigpicture` ≠ `/handoff`.** Bigpicture is for Russell now (60-second story, theme groupings, why-it-matters, open-claw). Handoff is for next session (file paths, resume prompt, in-progress state). Both should be invoked at session end.
- **Validator default-rejects unknown tool names.** When Meph hallucinated `run_file` and `write_file` (neither exists), the validator's `default: null` was silently allowing them. Now defaults to teaching error with the full valid-tool list.
- **Idle watchdog over wall-clock timeout.** Meph turns can legitimately stream for 90s+ on complex builds. Old `AbortSignal.timeout(60000)` killed entire streams mid-progress. New watchdog: 60s for first byte, then reset on every chunk, abort only after 90s of silence.

## Known Issues / Bugs
- **Full-loop suite passes 14-15/16 reliably** — one scenario sometimes fails because Meph chooses a valid alternate tool path (e.g. uses `patch_code` instead of `edit_code` after iterating). Grader noise, not a real bug. Loosen the grader if it bothers you.
- **`.husky/pre-push` runs eval in ~90s** — slows pushes when key is set. `SKIP_MEPH_EVAL=1 git push` to bypass for one push. Live with it; the regression net is worth the time.
- **The auto-regenerated `apps/todo-fullstack/clear-runtime/db.js`** appears as dirty after every run. Harmless but noise in `git status`. Could add to `.gitignore` or rebuild the runtime copy logic.

## Next Steps (Priority Order)

1. **Deploy todo-fullstack to Railway with a real URL** — the demo asset for pilot outreach. Pipeline exists (`clear deploy`), just hasn't been exercised end-to-end with a live URL.
2. **Record a 60-second Loom** showing the bridge + Fix-with-Meph loop. Use the kudos board (already in eval suite) or a fresh inventory tracker. Script: click → bug → "fix it" → green tests. Send to 3 FinServ pilots from Axial network.
3. **Find 3 pilot companies** for the $4k/mo RPA-replacement pitch. Axial network for FinServ/insurance/logistics. The two dev landing pages target the developer; `for-business.html` targets the buyer.
4. **Update `for-business.html` placeholder fields** before sharing — `russell@clear-apps.dev` and `cal.com/russellmiller` are placeholders. Real domain decision still open: `clear-apps.dev` vs `magenagents.dev`.
5. **Run `eval-fullloop-suite.js` weekly on a schedule** — consider GitHub Actions cron. Catches deeper integration regressions the per-tool eval misses.

## Files to Read First

| File | Why |
|------|-----|
| `HANDOFF.md` | This file |
| `PHILOSOPHY.md` | Design rules — internalize before touching code |
| `CLAUDE.md` | Project rules; updated this session with new "Meph Tool Eval" mandatory section + bigpicture pointer |
| `.claude/skills/eval-meph/SKILL.md` | When to run the agent regression net |
| `.claude/skills/bigpicture/SKILL.md` | When to step back and narrate |
| `learnings.md` | Session 27 entry has bridge+friendly-errors lessons; Session 28 (today) needs adding next time |
| `playground/server.js` lines 982–1045 | The new `validateToolInput` — schema enforcement layer |
| `playground/eval-meph.js` | The eval scenarios + grading shape |

## Resume Prompt

```
Read HANDOFF.md, PHILOSOPHY.md, then CLAUDE.md.

Last session (Session 28, 2026-04-14) closed the "fix this bug" loop
end-to-end: Studio Bridge (shared iframe), unified terminal (5 sources
interleaved), plain-English test failures with click-to-source +
Fix-with-Meph button, schema enforcement at 3 layers, agent regression
net wired into pre-push. Plus 28 commits of fixes + new /eval-meph and
/bigpicture skills.

77/77 e2e reliably. 1850 compiler tests. Meph eval green.

Top open-claw: deploy todo-fullstack to Railway end-to-end with a
live URL, record a 60-second Loom of the bridge + Fix-with-Meph loop,
contact 3 FinServ pilots from the Axial network.

Studio: `node playground/server.js` → http://localhost:3456
Meph eval: `node playground/eval-meph.js` (needs ANTHROPIC_API_KEY)
Bigpicture this session: invoke `/bp` after meaningful chunks of work.
```
