# Handoff — 2026-04-28 night (post CC-2 close)

> ## How this file works (READ FIRST when writing or updating it)
>
> **Hard cap: 2 pages, ~150 lines max.** Russell has Mito + ADHD; long handoffs don't get read. Lead with priorities, not history. Bullets over paragraphs. One-screen scan should give a fresh session everything it needs.
>
> **Where things go (don't bloat HANDOFF with content that lives elsewhere):**
> - **Priorities for next session** → THIS file (forward-looking only)
> - **What shipped this session** → `CHANGELOG.md` (newest at top, dated)
> - **What Clear can do today** → `FEATURES.md` (add a row when shipping new capability; update the headline counts)
> - **Bug stories / what broke + how we fixed** → `learnings.md` (narrative gotchas)
> - **Long-running design / project state** → `intent.md`, `PHILOSOPHY.md`, `RESEARCH.md`
> - **Where does X live? / How do I Y? / Why did we Z?** → `FAQ.md`
> - **Full feature plans** → `plans/plan-*.md`, link to them from here, don't inline them
>
> **Hygiene before saving the handoff (in this order):**
> 1. Add a CHANGELOG entry for what shipped this session (1-3 short paragraphs).
> 2. Add FEATURES rows for any new shipped capability; update headline counts.
> 3. Trim ROADMAP — anything shipped this session gets DELETED from ROADMAP (it's in CHANGELOG/FEATURES now). No strikethrough done items.
> 4. THEN write this file lean: where you are + next 5 priorities + blocked + tested-vs-assumed + resume prompt. Nothing else.

## Where you are

- **Branch:** `main`. CC-2 merged (e75816c). Doc cascade for CC-2 is on `docs/cc-2-cascade` waiting for merge.
- **Tests:** 2749 main + 24 factory + 50 routes + 57 helpers + 56 migrations runner — all green.
- **Critical-path standing:** **CC-1 closed + CC-2 closed.** The login wall now exists. The moment Russell sets `DATABASE_URL` on production, the full signup → login → dashboard flow is reachable at buildclear.dev. Every other launch-gate item still needs Russell's hands.

## Next session — priority order

1. **Deal Desk demo polish** (~1 hr). Kill `/reports` (duplicate of `/all`), kill dead Refresh/Export header buttons, fix hardcoded stat-strip counts (wire to live counts), add Draft AI summary button to detail panel. Source: `snapshots/deal-desk-product-review-04-28-2026.md`.
   - **Why for launch:** these are the gaps that would tank a Marcus demo. The deal desk is THE flagship app he'd see first.
2. **CC-3 webhook receiver** (~1 hr code, gated on Russell's Stripe live keys). Wire the production webhook route in `playground/server.js`. Test in test mode until live keys land.
   - **Why for launch:** customers can't pay until this lands AND Russell's Stripe live keys arrive.
3. **Marcus apps list endpoint** (~30 min). The dashboard's "Your apps" empty state already ships; wire `GET /api/apps` to return the customer's deployed apps from the tenants store, then unhide the app grid.
   - **Why for launch:** dashboard is currently informative-only. With the apps list, Marcus sees his real deployments + can click into any of them.
4. **CC-5 custom domain UX polish** (a session). Phase 85 scaffolding shipped (CC-5/5a/5b); the open work is end-to-end: customer enters a domain, sees verification status, gets a green check when ready. From `ROADMAP.md` Q2 2026 section.
   - **Why for launch:** Marcus's company wants `deals.acme.com`, not `acme.buildclear.dev`. Custom domains are table stakes at SaaS price points.

## Blocked on Russell (skip these, grab the next item)

- **Live email sending** — needs AgentMail or SendGrid key + Russell's "yes send real customer email." Worker is wired and ready.
- **Fly.io Trust Verified** — Russell submits, ~1-2 day review.
- **Stripe live keys** — gated on Trust Verified.
- **Anthropic org key for paid Meph sessions** — ~15 min in Russell's console.
- **Postgres provision** (Fly Postgres or Neon) — ~30 min.
- **First Marcus conversation** — Russell's conversation move.

## Tested vs. assumed

- ✅ **Tested + saw work:** the four cloud-auth URLs end-to-end against pg-mem (signup→cookie set, login→cookie set, me→user returned, logout→session revoked). The cloud-auth schema applies cleanly and accepts inserts. Login + signup pages render correctly per preview snapshot + inspect (indigo gradient buttons, white card, soft shadow). Dashboard auth-gates correctly.
- ⚠️ **Assumed worked:** the auth flow against a real Postgres (only pg-mem so far). The dashboard's authenticated render path (CSS verified, but never paint-tested with a live session because no DATABASE_URL set locally). Both will need a real-key smoke run when DATABASE_URL lands.

## Session rules (already in `~/.claude/CLAUDE.md` — one-line link)

Build priority queue from ROADMAP at session start, lead don't ask, big-picture beat on every reply, parallel-first tool calls, 10x-off time estimates, TDD red-first. Hooks at `~/.claude/hooks/` enforce most of these.

## Resume prompt (paste into fresh session)

> Read HANDOFF.md and start on item 1 (Deal Desk demo polish — see `snapshots/deal-desk-product-review-04-28-2026.md` for the exact gaps). All in one session. Apply the session rules in `~/.claude/CLAUDE.md`. Current main commit: e75816c.
