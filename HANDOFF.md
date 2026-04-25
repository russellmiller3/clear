# Handoff — 2026-04-25 (overnight session — Russell asleep)

## Status right now

Russell signed off after a doc cleanup + merge + branch consolidation session. Tree is on `main`, pushed to `origin/main`, fast-forwardable. He authorized me (Claude) to keep working autonomously through a queued sequence of bug fixes + Marcus GTM build-outs.

---

## What just shipped this session

- **ROADMAP rewrite** — 846 → 275 lines, instructions on top, forward-looking only. Anti-regression rules baked in (no "DONE" tags inline, audit at 400 lines, end-of-session checklist).
- **Capability content moved** to `FEATURES.md` (Cloudflare target, LSP, VSCode ext, Compiler API, cookies, on-scroll, upsert, transactions, namespaced components, LAE widget, etc).
- **Competitive content moved** to `FAQ.md` ("Why does Clear Cloud beat Retool and Lovable?" + competitive landscape Q).
- **CHANGELOG backfill entry** for done items previously inline in ROADMAP (PERF-1-5, Language Completeness, RL-1/2/7/9, Phase 85).
- **Python TEST_INTENT port committed** — Session 46 follow-up #2. ~200 lines in compiler.js. Async httpx + pytest emission.
- **competition.md rewritten** — structural-moat framing over day-1 UX, "Lovable wins month 1, Clear wins year 2."
- **Merged `feat/dave-first-gtm`** — D-1..D-5 Dave-first wedge: namespaced component fix + Compiler API + clear-lsp + VSCode extension + `landing/for-developers.html` + `landing/dave.clear`. Tagged in ROADMAP as "Strategic pivot under review (PENDING RUSSELL DECISION)" — both Dave-first and Marcus-first threads stay alive.
- **Pushed `local main → origin/main`** (fast-forward, no force).
- **Deleted 38 stale remote branches**; salvaged 1 (`salvage/2026-04-07-bug-categories-landing` — preserves "45 bug categories eliminated" landing page copy); kept `snapshot/origin-main-2026-04-25` as safety net.
- **FEATURES.md exec summary added** — plain-English scan-in-30-seconds list of what Clear can do today, with maintenance rule.
- **This HANDOFF.md rewritten** as current-only with maintenance rule (below).

---

## ⚠️ Known broken — fix FIRST

**`playground/e2e.test.js:327` — `TypeError: todos2.data?.find is not a function`**

Pre-push hook caught this during the cleanup push. Compiler tests still 2509 green; this is e2e-level. Almost certainly a `{data: [...]}` envelope vs bare `[...]` mismatch. Probably caused by the merge of `feat/dave-first-gtm` or my Python TEST_INTENT port.

**Until this is fixed, every code commit will be blocked by the pre-push hook.** First task in the overnight sequence.

---

## Overnight sequence (in order)

Russell authorized "keep going" autonomously. All TDD-able, all $0 API spend. Sequence revised away from landing-page polish toward substantive engineering.

1. **Fix e2e regression** — diagnose `todos2.data?.find` at `e2e.test.js:327`. Probably envelope shape change. ~30 min.
2. **R7: `needs login` page guard** — currently emits blank white page. Fix to redirect to `/login` or generate auto-login page. Half-day TDD. Listed in `FAQ.md → "Known broken things"`.
3. **R8: `for each` HTML loop body** — currently emits `+ msg +` (whole object). Fix to expand child template per iteration. Half-day TDD. Also listed in `FAQ.md → "Known broken things"`.
4. **GTM-1: build `apps/deal-desk/main.clear`** — hero discount-approval workflow with agent draft. ~150 lines. The asset every Marcus landing page points at. Uses R7 (auth pages) and R8 (approval lists) as integration test for the morning's bug fixes.
5. **CF-1: runtime instrumentation in compiled apps** — emit latency / error / memory beacons from compiled apps to a shared endpoint. ~20 lines of compiler emission + a tiny POST receiver. Once this lands, every compiled app starts feeding the Factor DB with runtime outcome data — the Compiler Flywheel can't start until this is in. ROADMAP P2.
6. **R10: retire 1:1-mapping violations (`CHECKOUT`, `OAUTH_CONFIG`, `USAGE_LIMIT`)** — these generate routes, functions, and imports the user never wrote, violating PHILOSOPHY rule #1 (the most important moat). Move toward explicit source forms or demote until they comply. Real refactor; protects the moat. ROADMAP refactoring backlog R10.
7. **Builder Mode status bar** — chip at bottom of Studio: "12 users · 3 active · $0.03 agent spend today · last ship 4m ago." Always visible. ROADMAP P1 (Builder Mode polish).
8. **R5: `clear test` runner picks up user-written `test` blocks** — currently only runs auto-generated e2e tests. Listed in ROADMAP refactoring backlog R5.

---

## After the sequence — what's next priority

If I get through 1-8 above, pull from ROADMAP P0/P1 in this order:

1. **R10 — retire CHECKOUT/OAUTH_CONFIG/USAGE_LIMIT 1:1-mapping violations.** PHILOSOPHY rule #1 protection. Refactoring backlog R10.
2. **CC-1 prep — multi-tenant routing skeleton.** 2-3 weeks total scope, but the file-layout + first-test scaffolding is a clean overnight start.
3. **GTM-5 — Studio onboarding tweak.** New users land in Meph chat with "What do you want to build?" instead of empty editor. ~2 days; opening shot is a small UI change.
4. **CF-1 — runtime instrumentation in compiled apps.** Latency/error/memory beacons to a shared endpoint. ~1 day, 20 lines of instrumentation that starts collecting data immediately.

**DO NOT do overnight without explicit authorization:**
- Anything that spends **Anthropic API budget** (Session 41 burned $168 in one day; don't repeat). This includes any sweep / eval / curriculum run with the default `MEPH_BRAIN` (production Anthropic).
- Force pushes, branch deletions on `main` or `snapshot/*`.
- Strategic pivots — the Dave-first vs Marcus-first decision in ROADMAP is *Russell's* call, don't enact silently.

**Authorized $0 work that's bonus value if you finish the queue early:**
- **Ghost Meph sweeps via cc-agent are explicitly fine** — set `MEPH_BRAIN=cc-agent` (Claude Code sub-agents, free on org quota). Sweeps via cc-agent don't touch Anthropic billing. Each Factor DB row produced compounds the flywheel.
- A Ghost sweep on the curriculum (`MEPH_BRAIN=cc-agent node playground/supervisor/curriculum-sweep.js --workers=3`) while you're working on other things is a great use of overnight compute.
- *Note:* Russell is not using Ollama or OpenRouter/Qwen yet. Don't suggest those backends — only cc-agent. He'll tell you when that changes.

---

## Maintenance rule for HANDOFF.md (READ BEFORE ADDING TO THIS FILE)

**HANDOFF is the current-state file.** It answers "what's true *right now* and what should the next session do?" Anything older than the most recent session belongs in another file. Do not let this file accumulate.

**Routing for old content (do this BEFORE adding new):**

| If the entry is about... | Move it to |
|---|---|
| What shipped in a past session (>1 session ago) | `CHANGELOG.md` (newest at top, dated entry) |
| A capability the compiler now supports | `FEATURES.md` (relevant table row) |
| An architecture decision / why-we-built-it-this-way | `FAQ.md` → "Why did we X?" question |
| A design rule / 14-year-old-test / 1:1 mapping | `PHILOSOPHY.md` |
| A node-type spec change | `intent.md` + `SYNTAX.md` |
| A bug story / what broke + how we fixed | `learnings.md` |
| A forward-looking priority | `ROADMAP.md` |

**At the start of every session, audit this file:**
- Does any section describe work that's now in CHANGELOG? → cut it.
- Does any "next priority" section describe work already done? → cut it.
- Is the "Status right now" section still actually right now? → if no, rewrite.

**HANDOFF should never grow past ~150 lines.** If it crosses that, you're hoarding history. The whole point of this file is "scan in 60 seconds, know where I am, know what to do next." If you can't, the file is failing.

**At the end of every session:** rewrite the "Status right now" + "What just shipped" + "Next priority" sections. Move past content out per the routing table above. The next session's first action is reading this file — make sure it's still valid pickup material.
