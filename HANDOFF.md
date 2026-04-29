# Handoff — 2026-04-29 morning (post CC-5 cycle 1)

## Where you are

- **Branch:** `main`. Last shipped: `da0de35` (CC-5 cycle 1 merged).
- **One WIP branch still pushed, unmerged:**
  - `plan/routing-primitive` (`fc972ba`) — partial draft of the routing primitive plan, ~50% written. Resume + finish there.
- **Tests:** 2749 main + 95 routes + 121 tenants + 24 factory + 56 migrations + 25 deal-desk app + 52/52 across 5 Marcus apps in browser walker — all green.
- **Critical-path standing:** full sign-up → log-in → dashboard → see-deployed-apps → attach-a-custom-domain path is reachable. CC-5b (DNS poller) + CC-5c (cert provisioner) are the cycles that turn "Verifying DNS" into "Live". CC-3 (Stripe) and the routing primitive are the remaining cloud + compiler pieces.
- **Studio Meph backend note:** Anthropic API hit its monthly spending cap (resets May 1 00:00 UTC). Studio was restarted with `MEPH_BRAIN=cc-agent` so chat routes through the local Claude Code subscription, $0 cost. Restart Studio normally on/after May 1 to go back to API direct (or keep cc-agent forever — also fine).

## Next priorities

1. **CC-5c Fly cert provisioner** (~30 lines, gated on a Fly API token). When a domain flips from `pending` to `verified` (CC-5b is now doing that on a 1-min tick), call Fly's `/v1/apps/:app/certificates` API to request an HTTPS cert, write the returned cert id back to the row. **Why for launch:** customer's domain has to actually serve HTTPS, not just resolve. CC-5b made `verified` real; CC-5c makes `verified` useful.
2. **CC-3 Stripe webhook receiver** (~1 hr code, BLOCKED on Russell providing Stripe live keys). Wire the production webhook URL; test in Stripe test mode until live keys land. **Why for launch:** customers can't pay until this AND your live keys both land.
3. **A/B hint sweep — RUNNING in background as of 2026-04-29 evening** (~70 min wall clock, $0 via cc-agent). 40 paired trials × 2 tasks (counter, todo-crud) measure the hint retriever's lift on Meph's live pass rate — closes RESEARCH.md's "offline val_auc 0.96 but live effect unmeasured" gap. Output lands in `playground/sessions/ab-hint-sweep-*.json`. **Why for launch:** the load-bearing claim "Meph gets smarter as the data grows" needs a real production number, not a lab number.

## Already done (do not rebuild)

- ✅ **CC-5b DNS verification poller** — shipped 2026-04-29 evening. `playground/cloud-domains/index.js` has `pollOnce`, `resolveDomainCname`, `startDomainPoller`, `bootstrapDomainPoller`. 4 TDD cycles, 33 new tests. Wired into Studio bootstrap on a 1-min tick (gated on `DATABASE_URL`). Tests: 97/97 green in cloud-domains test file.
- ✅ **Routing primitive** — Phases 1-6 shipped 2026-04-29 afternoon (`5e8b17c`). Lead-router uses `route lead by size` instead of if-chain. 8-surface doc cascade complete. Tests: 2773/0.
- ✅ **Search-input-filters-table primitive** — already shipped via Codex chunk #5 on 2026-04-26. Every `display X as table` auto-emits a toolbar search input. Verified 2026-04-29 by compiling deal-desk; HTML contains `<input class="clear-table-filter">`. Listed in FEATURES.md:150.

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
