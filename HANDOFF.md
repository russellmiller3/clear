# Handoff — 2026-04-29 (post Marcus apps list + UAT runner)

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

- **Branch:** `main`. Marcus apps list shipped (27a6bf2). UAT runner across all 5 Marcus apps shipped (28590c7). Subtitle interpolation + NaN guard shipped (e146efc). Deal Desk polish + CC-2 close shipped earlier in the day.
- **Tests:** 2749 main + 24 factory + 72 routes + 57 helpers + 121 tenant store + 56 migrations + 25 deal-desk app tests — all green. Plus 52/52 across all 5 Marcus apps in the browser walker.
- **Critical-path standing:** **The full happy path is reachable.** Sign up → log in → dashboard shows deployed apps → click into any. Every step works. CC-3 (Stripe webhook) is the only remaining cloud piece, gated on Russell's Stripe live keys.

## Next session — priority order

1. **CC-5 custom domain UX polish** (a session). Phase 85 scaffolding shipped (CC-5/5a/5b); the open work is end-to-end: customer enters a domain, sees verification status, gets a green check when ready. From `ROADMAP.md` Q2 2026 section.
   - **Why for launch:** Marcus's company wants `deals.acme.com`, not `acme.buildclear.dev`. Custom domains are table stakes at SaaS price points.
2. **Routing primitive design** (a session — write-plan first). The primitives audit flagged this as the #1 compiler gap. Today the lead-router uses raw `if X is Y` chains, breaks for round-robin / territory / workload-balance / skill-based. Recommended: `route X by field` with rules + round-robin fallback. Use `/write-plan` to design before charging at parser/compiler edits.
   - **Why for launch:** Russell's first paying job is building custom variants of these apps. Lead routing is where customers diverge most — without this primitive each variant is 50+ lines of if-chains; with it, 5 lines.
3. **Search-input-filters-table primitive** (~1-2 hr). Per the primitives audit. Every queue app needs filter-by-text once data scales beyond ~20 rows; today Russell would hand-roll the filter input every variant.
   - **Why for launch:** apps look amateur the moment data scales. One parser node + ~30 lines of compiled JS pays for itself across every Marcus app.
4. **CC-3 Stripe webhook receiver** (~1 hr code, BLOCKED on Russell providing Stripe live keys). Wire the production webhook route. Test in Stripe test mode until live keys land.
   - **Why for launch:** customers can't pay until this AND Russell's Stripe live keys both land.

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

> Read HANDOFF.md and start on item 1 (CC-5 custom-domain UX polish). The whole signup → dashboard happy path is reachable now — the next push is making domain attachment feel finished. Apply the session rules in `~/.claude/CLAUDE.md`. Current main commit: 27a6bf2.
