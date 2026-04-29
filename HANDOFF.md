# Handoff — 2026-04-29 morning (post CC-5 cycle 1)

## Where you are

- **Branch:** `main`. Last shipped: `da0de35` (CC-5 cycle 1 merged).
- **One WIP branch still pushed, unmerged:**
  - `plan/routing-primitive` (`fc972ba`) — partial draft of the routing primitive plan, ~50% written. Resume + finish there.
- **Tests:** 2749 main + 95 routes + 121 tenants + 24 factory + 56 migrations + 25 deal-desk app + 52/52 across 5 Marcus apps in browser walker — all green.
- **Critical-path standing:** full sign-up → log-in → dashboard → see-deployed-apps → attach-a-custom-domain path is reachable. CC-5b (DNS poller) + CC-5c (cert provisioner) are the cycles that turn "Verifying DNS" into "Live". CC-3 (Stripe) and the routing primitive are the remaining cloud + compiler pieces.
- **Studio Meph backend note:** Anthropic API hit its monthly spending cap (resets May 1 00:00 UTC). Studio was restarted with `MEPH_BRAIN=cc-agent` so chat routes through the local Claude Code subscription, $0 cost. Restart Studio normally on/after May 1 to go back to API direct (or keep cc-agent forever — also fine).

## Next priorities

1. **Finish routing primitive plan** (~30-60 min). `plan/routing-primitive` (`fc972ba`) is ~50% drafted. Still TODO: validator rules, JS + Python compiler emit, round-robin cursor runtime helper, TDD cycles, doc cascade list, resume prompt. Then `/red-team-plan` before any parser/compiler code. **Why for launch:** Russell's first paying job is custom variants of these apps; lead routing is where customers diverge most.
2. **Search-input-filters-table primitive** (~1-2 hr). Per the primitives audit. Every queue app needs filter-by-text once data scales beyond ~20 rows. One parser node + ~30 lines of compiled JS, then every Marcus app inherits it. **Why for launch:** apps look amateur once data scales — cheap fix that compounds.
3. **CC-5b DNS verification poller** (~30 lines + cron). Wakes every minute, finds `pending` domains, calls `node:dns resolveCname`, flips status to verified or failed. **Why for launch:** without this, the attach UX shipped today shows "Verifying DNS" forever — cycle 1's value is gated on this.
4. **CC-5c Fly cert provisioner** (small, depends on CC-5b). Once a domain verifies, request a Fly cert + write the cert id back. **Why for launch:** the customer's domain has to actually serve HTTPS, not just resolve.
5. **CC-3 Stripe webhook receiver** (~1 hr code, BLOCKED on Russell providing Stripe live keys). Wire the production webhook URL; test in Stripe test mode until live keys land. **Why for launch:** customers can't pay until this AND your live keys both land.

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
