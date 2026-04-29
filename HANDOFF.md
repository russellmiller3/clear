# Handoff — 2026-04-29 late morning (post sweep diagnostic Pieces 1-3, GTM-2 polish, cleanup)

## Where you are

- **Local branch:** `feature/cc-5b-dns-poller` — 5 commits ahead of `main` on origin, all pushed today. NOT yet merged to main.
- **No WIP plan branches.** `plan/routing-primitive` and `feature/routing-primitive` were both already merged into main yesterday (HANDOFF was stale on this; verified `git merge-base --is-ancestor 2026-04-29`). Safe to delete the local refs whenever.
- **Tests:** 2773 compiler + 24 ab-hint pure helpers + 7 detectInfraFailure cases — all green. Compiler tests bumped from 2749 → 2773 with today's sweep work.
- **Critical-path standing:** full sign-up → log-in → dashboard → see-deployed-apps → attach-a-custom-domain path is reachable. CC-5b (DNS poller) shipped yesterday. CC-5c (cert provisioner) + CC-3 (Stripe) still gated on Russell's external keys.
- **Studio Meph backend note:** Anthropic API hit its monthly spending cap (resets May 1 00:00 UTC). Today's sweep diagnostic ran via `MEPH_BRAIN=cc-agent` with $0 API direct cost. The 04-29 morning sweep file `playground/sessions/ab-hint-sweep-2026-04-29T15-24-55.json` is GARBAGE DATA — 30 of 40 trials silently fast-failed because cc-agent died after the first 10 counter+hint_on trials and returned 200 OK + empty SSE for everything after. The 3 pieces shipped today guarantee future sweeps can't ship that way again.

## Next priorities

1. **A/B hint sweep Piece 4 — cc-agent backend fix.** A diagnostic sweep was kicked off in this session (`bx0ofh7h9`, `--tasks=counter --trials=10 --workers=1 --strict`). When it completes (~10-15 min), the JSON at `playground/sessions/ab-hint-sweep-<latest>.json` will have a `cc-agent-backend-error (Nms): <real claude error>` in any failed trial's `error` field — Pieces 1-3 today made this surface explicitly instead of being thrown away. Ship Piece 4 against the actual error message: rate-limit detector + inter-trial backoff, OR subprocess-restart logic, OR shorter timeout, depending on what cc-agent says it died from. **Why for launch:** until the backend is reliable enough to run a 40-trial sweep, RESEARCH.md's "Meph gets smarter as data grows" claim has no live production number.
2. **CC-5c Fly cert provisioner** (~30 lines, gated on a Fly API token). When a domain flips from `pending` to `verified` (CC-5b is now doing that on a 1-min tick), call Fly's `/v1/apps/:app/certificates` API to request an HTTPS cert, write the returned cert id back to the row. **Why for launch:** customer's domain has to actually serve HTTPS, not just resolve. CC-5b made `verified` real; CC-5c makes `verified` useful.
3. **CC-3 Stripe webhook receiver** (~1 hr code, BLOCKED on Russell providing Stripe live keys). Wire the production webhook URL; test in Stripe test mode until live keys land. **Why for launch:** customers can't pay until this AND your live keys both land.

## Already done (do not rebuild)

### Today's commits on `feature/cc-5b-dns-poller` (2026-04-29 late morning)

- ✅ **Cast/Clear directory cleanup** — cast push `ca11750`, clear push `e9d6790`. Deleted `cast/clear/` (192 files, 54k lines of v1 Clear) + `cast/HANDOFF.md` from cast repo. Archived HANDOFF + ROADMAP + intent + PHILOSOPHY snapshots to `clear/archive/2026-04-05-clear-v1-*.md` with notation. Cast push went to `claude/handoff-tasks-YGByV` branch (cast's current branch).
- ✅ **A/B hint sweep diagnostic Piece 1** (`62ac833`) — added `detectInfraFailure` pure helper + patched `driveTaskOnWorker` to count code_actions rows in trial window and surface zero-activity sub-5s trials as `error: 'no-meph-activity (Nms, 0 rows): <stream preview>'`. 7 TDD-style tests.
- ✅ **A/B hint sweep diagnostic Piece 2** (`96fdd83`) — `summarizeAbResults` excludes infra failures from passes/trials/passRate (lift = null when either side has 0 genuine trials). `runCondition` early-aborts a bucket on 2 consecutive `no-meph-activity` errors (caps wasted trials at 2 instead of 30). `formatSummaryTable` adds `infra` column. 6 new tests + updated existing summarizer test data.
- ✅ **A/B hint sweep diagnostic Piece 3** (`97fa51d`) — `driveTaskOnWorker` scans the SSE stream for the `[cc-agent tool-mode error: ...]` pattern that `cc-agent.js:270-276` swallows on `runClaudeCliStreamJson` rejections. Surfaces as `error: 'cc-agent-backend-error (Nms): <real claude error>'`. `isInfraFailure` + `runCondition` early-abort updated to match both patterns. 1 new test.
- ✅ **GTM-2 marcus.html broken Live demo section** (`d058257`) — replaced TODO placeholder + dead `deals.demo.buildclear.dev` URL with inline HTML/CSS mock of the CRO approver view (Sara Chen's queue, agent recommendation to counter at 25%, approve/reject UI, audit log). Pairs with hero's submitter view. README updated.
- ✅ **Demo recording prep fact-check** (`e41a0fd`) — added pre-recording table to `plans/demo-script-deal-desk-04-25-2026.md` verifying claims against current `apps/deal-desk/main.clear`. All major claims hold; 3 minor seed/script drifts flagged.

### Yesterday and prior (do not rebuild)

- ✅ **CC-5b DNS verification poller** — shipped 2026-04-29 morning (commit on this same branch). `playground/cloud-domains/index.js` has `pollOnce`, `resolveDomainCname`, `startDomainPoller`, `bootstrapDomainPoller`. 4 TDD cycles, 33 new tests.
- ✅ **Routing primitive** — Phases 1-6 shipped 2026-04-29 afternoon (`5e8b17c` on main). Lead-router uses `route lead by size` instead of if-chain. 8-surface doc cascade complete.
- ✅ **Search-input-filters-table primitive** — already shipped via Codex chunk #5 on 2026-04-26. Every `display X as table` auto-emits a toolbar search input.

## Blocked on Russell (skip these, grab the next item)

- **Live email sending** — needs AgentMail or SendGrid key + your "yes send real customer email." Worker is wired and ready.
- **Fly.io Trust Verified** — submit form, ~1-2 day Fly review.
- **Stripe live keys** — gated on Trust Verified.
- **Anthropic API cap** — auto-resets May 1 OR raise the cap in `console.anthropic.com/settings/limits`.
- **Postgres provision** (Fly Postgres or Neon) — ~30 min.
- **First Marcus conversation.**

## Tested vs. assumed

- ✅ **Tested + saw work:** all 5 Marcus apps drive green through real Playwright (52/52); login/signup/dashboard pages render correctly under preview tools; CC-5 cycle 1 cross-tenant isolation is locked in by tests; deal desk demo polish snapshot-verified; Meph local-backend round-trip verified ("hey").
- ⚠️ **Assumed worked:** the dashboard's authed render path with real apps in the grid (CSS verified, but never paint-tested with a live session because no DATABASE_URL set locally); CC-5's domain attach flow against real Postgres (only pg-mem so far); the routing primitive parser shape (only sketched in the plan). All three need real-key smoke runs when DATABASE_URL + Postgres land.

## Session rules

Build priority queue from ROADMAP/RESEARCH/HANDOFF at session start, lead don't ask, big-picture beat on every reply, parallel-first tool calls, 10x-off time estimates, TDD red-first, **doc cascade at PHASE-end (not commit-end).** Hooks at `~/.claude/hooks/` enforce most of these — including the new stop-tell guard (catches "TL;DR" / "next session" / "let me write a plan, end here" framing).

## Resume prompt (paste into fresh session)

> Read HANDOFF.md and start on item 1 — finish the routing primitive plan on `plan/routing-primitive`. Apply the session rules in `~/.claude/CLAUDE.md`. Current main commit: `da0de35`.
