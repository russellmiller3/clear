# Handoff — 2026-04-28 night

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

- **Branch:** `main`. All work pushed to GitHub.
- **Last commit:** `8cb7731` — handoff refresh.
- **Tests:** 2749+ passing, 0 failing. **Working tree:** clean (only `.claude/settings.local.json` + `playground/factor-db.sqlite` dirty, both ignored).
- **Critical-path standing:** **CC-1 fully closed** — entire customer-tenant store ships durably to Postgres the moment Russell sets `DATABASE_URL`. Every other launch-gate item still needs Russell's hands (Fly Trust Verified, Stripe live keys, Anthropic org key, Postgres provision, first Marcus conversation).

## Next session — priority order

1. **CC-2 finish — wire the auth URLs** (~1-2 hrs). Auth helper functions already built in `playground/cloud-auth/index.js`. Open: 4 URL handlers in `playground/server.js` (signup, login, me, logout) + cookie handling + cloud-auth migrations integrated into `tenant-store-factory.js`. Test with pg-mem.
   - **Why for launch:** customers need to log into buildclear.dev. Auth is plumbed; it just isn't reachable.
2. **CC-2 dashboard UI** (~1-2 hrs, after the URLs). Build a logged-in `dashboard.html` that lists the customer's apps. Calls the URLs from item 1.
   - **Why for launch:** Marcus opens buildclear.dev, logs in, sees his apps. Without the page, the auth has nowhere to land.
3. **Deal Desk demo polish** (~1 hr). Kill `/reports` (duplicate of `/all`), kill dead Refresh/Export header buttons, fix hardcoded stat-strip counts (wire to live counts), add Draft AI summary button to detail panel. From the product review at `snapshots/deal-desk-product-review-04-28-2026.md`.
   - **Why for launch:** these are the gaps that would tank a Marcus demo.
4. **CC-3 webhook receiver** (~1 hr code, gated on Russell's Stripe live keys). Wire the production webhook route in `playground/server.js`. Test in test mode until live keys land.

## Blocked on Russell (skip these, grab the next item)

- **Live email sending** — needs AgentMail or SendGrid key + Russell's "yes send real customer email." Worker is wired and ready.
- **Fly.io Trust Verified** — Russell submits, ~1-2 day review.
- **Stripe live keys** — gated on Trust Verified.
- **Anthropic org key for paid Meph sessions** — ~15 min in Russell's console.
- **Postgres provision** (Fly Postgres or Neon) — ~30 min.
- **First Marcus conversation** — Russell's conversation move.

## Tested vs. assumed

- ✅ **Tested + saw work:** all tenant store methods (cycles 1-9) pass against pg-mem; 19/19 factory tests; 161/161 Postgres tests; 111/111 in-memory tests; 2749+ main suite. Email template substitution tests verify the helper appears in compiled output.
- ⚠️ **Assumed worked:** the email delivery worker against a real AgentMail account (no key set, never actually sent a real email). The Postgres tenant store against a real Postgres (only pg-mem). Both will need a real-key smoke run when those land.

## Session rules (already in `~/.claude/CLAUDE.md` — one-line link)

Build priority queue from ROADMAP at session start, lead don't ask, big-picture beat on every reply, parallel-first tool calls, 10x-off time estimates, TDD red-first. Hooks at `~/.claude/hooks/` enforce most of these.

## Resume prompt (paste into fresh session)

> Read HANDOFF.md and start on item 1 (CC-2 — wire the 4 auth URLs). All in one session. Apply the session rules in `~/.claude/CLAUDE.md`. Current main commit: `8cb7731`.

---

## Quick map of where session content went (per the new handoff hygiene rule)

This session shipped 9 commits + workflow hooks. Per the new hygiene rule, the **CHANGELOG.md** has the dated session entries, **FEATURES.md** has the new capability rows, and ROADMAP shed the strikethrough done items. None of that lives in this handoff anymore — it lives where it belongs.
