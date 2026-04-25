# Handoff — 2026-04-25 (end-of-day, session 46)

## Status right now

`main` clean, all pushed (last commit `08096f8`). Compiler tests 2525/0. Tenant tests 75/0. New cycle-1 migration tests 56/0. New Postgres CRUD tests 46/0. New Phase C destructive-propose tests 3/0. Total session: ~12 commits across the day.

**3 agents still running in the background** when you're reading this. They'll have notified me by the time you're back; I'll review + commit each. They are:
- Postgres metadata: 4 more small methods (counter bumps, plan changes, Stripe webhook dedup) — cycle 3 of 9
- Publish button: the smoke test that proves the multi-tenant routing wires up when a Cloudflare deploy lands — cycle 2 of 7
- Destructive-ship safety: wiring the propose-tool into the dispatcher so the widget can call it — cycle 2 of 7

When you're back: scroll up in chat to see how those 3 finished. If green, they'll be committed. If broken, I'll have stopped and waited for you.

---

## The big picture (what changed today)

**Strategic pivot LOCKED 2026-04-25: Marcus first.** The Dave-first thread is alive as a parallel/expansion track but is NOT the wedge. Reasoning + my honest take live in the new ROADMAP critical-path section + the new philosophy rules.

**What "Marcus first" means concretely:** the path to first paying customer is 5 items, in order:
1. CC-4 — Publish button wired to Clear Cloud (`*.buildclear.dev`) — **cycle 1 of 7 done**, cycle 2 in flight
2. GTM-2 — `landing/marcus.html` polish + Deal Desk demo — **landed today** (CTAs wired)
3. Demo recording — script written today (`plans/demo-script-deal-desk-04-25-2026.md`); you record voice
4. You sell — cold-pitch 5-10 sales-ops people on LinkedIn with the recording
5. Phase 85a paperwork — register `buildclear.dev`, Fly Trust, Stripe live keys, Postgres host (Russell-only, async)

CC-1 finish (Postgres metadata DB) is item #6, phased AFTER first customer.

---

## What landed today (highlights)

**New automation that fires every prompt** (so the discipline doesn't slip):
- `parallel-thinking.mjs` hook — five top-level beats now: plain English, parallel-first, narrate everything, critical-path navigation, finish-epics-minimize-WIP, be-gentle. The hook fires before every response and lands in my context.
- `doc-cascade.mjs` hook — fires when I touch parser/synonyms/compiler; reminds me to update the 11 doc surfaces.
- `scripts/doc-drift.mjs` — pre-push detector for new node types or synonyms missing from docs.

**New philosophy rules** (in `PHILOSOPHY.md`):
- Rule 19: English tooling beats code tooling (humans AND AI) — the lifecycle insight
- Rule 20: Pragmatic dependencies (minimal but not religious)
- Rule 21: Syntax states what it does (no guessing) — `database is local memory` is the canonical anti-pattern

**New global rules** (`~/.claude/CLAUDE.md`):
- Critical-Path Navigator — every substantive reply orients you on epic + step + why-it-matters
- Finish Epics — Minimize WIP — Minimize Sprawl — default to advancing in-progress over starting new
- Be Gentle — Russell Has Mito + ADHD — take the lead, soften framing, don't make him defend his calls

**Code that shipped:**
- CC-1 cycle 1 — the small program that sets up Clear Cloud's metadata tables (migration runner + Phase-C-ready schema + 56 tests using a hand-rolled fake database)
- CC-1 cycle 2 — find/save/lookup tenant operations against real Postgres SQL (4 methods + 46 tests, pg-mem works for plain CRUD)
- CC-4 cycle 1 — per-request switch for which cloud the Publish button ships to (modal can now pass `target` in the body; alias map handles `clear-cloud`/`fly.io`; unknown returns 400)
- LAE Phase C cycle 1 — the safety check that flags risky field-removals (pure-function propose-tool + extracted shared helpers between Phase B and Phase C)
- Backlog cleanup — `requests.md` open items dropped from 58 to 3

**Plans written today** (in `plans/`):
- `plan-cc-4-publish-button-04-25-2026.md` — 7 cycles, locked, executing
- `plan-cc-1-postgres-wire-up-04-25-2026.md` — 9 cycles, locked, executing
- `plan-lae-phase-c-04-25-2026.md` — 7 cycles, locked, executing (decisions you locked: DELETE phrase, 200-row cap, "I understand — ship and destroy" button, audit-first ordering)
- `plan-charts-t2-8-04-25-2026.md` — 6 cycles, locked, NOT started yet
- `demo-script-deal-desk-04-25-2026.md` — 30-min walkthrough script + LinkedIn teaser cut

**Cookbook renamed** from `meta-learnings.md` → `cookbook.md`. Old name described where it came from; new name describes what it's for. All references updated. New "Hooks: Complete Inventory" hand-curated section explains all 7 hooks.

---

## In-flight epics (3 still mid-flight)

| Epic | Cycles done / total | Next cycle |
|---|---|---|
| CC-1 (Postgres metadata DB) | **4 / 9** (11 of 17 methods working) | Cycle 5: versions table + getAppRecord with the JOIN that fans out into versions and secret keys |
| CC-4 (Publish to Clear Cloud) | **3 / 7** | Cycle 4: Studio modal gets a "where to ship" picker (Clear Cloud vs Fly) |
| LAE Phase C (destructive ships) | **3 / 7** | Cycle 4: the destructive-ship endpoint that uses the audit log + typed-confirmation gate |
| Charts T2#8 (donut/scatter/gauge/sparkline) | 0 / 6 | Cycle 1 — NOT started, plan locked, ready when you say |

**WIP discipline:** 3 in-flight epics. At the cap. Don't start new fronts until at least one finishes (CC-4 has 4 cycles left to ship, LAE Phase C has 4 left, CC-1 has 5 left).

**Throughput today:** 14 commits across the day. CC-1 jumped from 0 → 11 of 17 methods working. CC-4 went from "plan only" → 3 cycles done with the dev-mode router proxying CF apps. LAE Phase C went from "plan only" → destructive propose-tool wired into the dispatcher with the safety steering, plus the audit log extensions ready for the typed-confirmation gate to write into.

---

## Open decisions waiting on you

1. **Database syntax change.** You picked IMPLICIT (target picks the driver). Not implemented yet — this is a canonical-syntax change touching parser + synonyms + 8 templates + landing pages + every doc. Multi-hour agent work. Not on the critical path to first customer (Marcus apps run fine on `database is local memory`'s current behavior). Defer until after launch OR fire as a dedicated agent next session.

2. **`pg` is the first runtime npm dep in the cloud-tenants layer.** Already added (you implicitly accepted by greenlighting CC-1 cycle 1). Flagging for transparency — `package.json` now has `pg` and `pg-mem`.

3. **Critical-path #5 — Phase 85a paperwork.** Russell-only async track: register `buildclear.dev`, Fly Trust Verified, Stripe live keys, Anthropic org key, Postgres host (Neon recommended). Not blocking the agent work above, but blocking the actual demo URL Marcus would visit.

---

## ⚠️ Known issue (carried from earlier handoff)

**Ghost cc-agent sweeps still produce zero Factor DB rows.** Carried over from earlier today's handoff. The MCP description fix unblocked Meph from skipping tools but the compile tool's database write isn't firing in cc-agent mode. ~30 min to diagnose. Hypothesis: the lazy database opener is failing silently. Investigation surface still in `playground/ghost-meph/mcp-server/tools.js` lines 131 + 158 and `playground/meph-tools.js:992`.

Not on the critical path to first customer — the flywheel compounds Meph quality, which helps the demo recording look better but doesn't block the deploy mechanic.

---

## DO NOT do without explicit authorization

- Production Anthropic API budget runs (sweeps, Meph evals at scale)
- Force pushes, branch deletions on `main` or `snapshot/*`
- Reverting any of the 3 new philosophy rules or the global rules I added today (those came from explicit asks)

---

## Maintenance rule

Cap ~150 lines. Rewrite "Status right now" + "What landed today" + "In-flight epics" + "Open decisions" each session. Detailed per-cycle history goes to `CHANGELOG.md`.
