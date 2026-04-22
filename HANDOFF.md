# Handoff — Next Claude: continue Queue E (Ghost Meph tool-use) and start Queue F

**Your mandate (unchanged from previous session):** Russell wants to wake up to a pile of merged branches. Ship code in priority order. Don't stop and ask. Don't burn time on retrospective summaries — write a fresh HANDOFF only when you hit a hard blocker, finish Queue F, or finish Queue E end-to-end.

---

## Budget rules (still in effect)

- **Russell is on a $200/mo Anthropic unlimited plan for Claude Code.** No per-session cost tracking needed — use the API freely via Claude Code itself.
- **The one hard constraint: DO NOT call Meph's `/api/chat` endpoint with the production key until cc-agent has tool-use support.** That endpoint uses Russell's separate `ANTHROPIC_API_KEY` which is not on the unlimited plan and is how he lost $168 in one day during Session 41.
- **Specifically blocked until cc-agent tool-use lands (see Queue E below):**
  - `node playground/eval-meph.js`
  - `node playground/eval-fullloop-suite.js`
  - `node playground/supervisor/curriculum-sweep.js`
  - Any Studio `/api/chat` call WITHOUT `MEPH_BRAIN=cc-agent` set (and with cc-agent unable to dispatch tools yet, that means real Meph workflows still hit Anthropic — we have routing but not tool execution)
  - Pre-push hook's auto Meph eval → keep using `SKIP_MEPH_EVAL=1 git push` on every push
- **Any Clear app you build with `ask claude`** → wrap in `mock claude responding:` test blocks so `clear test` doesn't fire real LLM calls.
- **The restriction lifts after cc-agent tool-use lands** (planned in `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md`, ~5 days estimated). Then the unlimited plan covers research sweeps + Meph evals through Claude Code sub-agents.

## Engineering rules (unchanged)

- Every feature ships on `feature/<name>` or `fix/<name>` — NEVER commit to main directly.
- **Verify the branch before committing.** `git branch --show-current` after `git checkout -b`. Earlier this session the GTM-1 commit somehow landed on main directly even though I'd just `checkout -b`'d a feature branch — root cause unclear, possible background hook. Verifying explicitly costs nothing.
- Merge to main with `--no-ff`. Delete feature branch after.
- Doc-only commits (`.md` only): `git commit --no-verify` + `SKIP_MEPH_EVAL=1 git push --no-verify` (HARD RULE — doc commits skip hooks).
- Code commits: let pre-commit run (compiler tests, ~10s). For pre-push, the e2e suite has 7 pre-existing `todo-fullstack` failures (seed/CRUD/search) unrelated to anything we're shipping — `git push --no-verify` is the documented escape hatch and was used on every push this session.
- Edit big docs in small pieces with narration — Russell will read your commits as a story.
- Test before declaring done. Run the actual tests, verify user-visible outcome.
- BLUF summaries at each ship point: plain English + bigger picture + opinionated next move.
- Ross Perot rule: never stop to ask permission. Make it, document reasoning in the commit, move on.
- Plain-English comments in `.clear` files (no CS/compiler jargon).
- Always re-read `AI-INSTRUCTIONS.md` + `SYNTAX.md` before writing any `.clear` file.

## Context files to read at session start (in this order)

1. `HANDOFF.md` (this file) — your mandate
2. `ROADMAP.md` → "North Star: Clear Cloud (P0 — Q2 2026)" + "What's Next" priority table
3. `plans/plan-clear-cloud-master-04-21-2026.md` — architecture context, REQUIRED before any Queue G work
4. `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` — the meaty next implementation
5. `plans/plan-ghost-meph-openrouter-ollama-04-21-2026.md` — GM-3/4 design
6. `PHILOSOPHY.md` — 14 design rules
7. `CLAUDE.md` (project) + `~/.claude/CLAUDE.md` (global) — rules & constraints
8. `FAQ.md` — search-first doc for the codebase
9. `FEATURES.md` — what Clear can do today
10. `CHANGELOG.md` top entries — most recent ship history (likely needs an entry for this session's ship pile)
11. `learnings.md` — scan TOC before debugging anything compiler-adjacent
12. `docs/doc-drift-findings.md` — open design questions left from RR-1
13. `docs/one-to-one-mapping-audit.md` — open follow-ups left from RR-2

---

## What shipped 2026-04-21 session (don't duplicate)

22 commits to main, 11 merge commits. Test counts: 2108 compiler / 33 builder-mode / 40 ghost-meph / 7 pre-existing todo-fullstack e2e failures unchanged.

### Queue B — P0 GTM (4/5 shipped; GTM-4 still blocked on Russell)

| Item | Branch | Commit | One-liner |
|---|---|---|---|
| GTM-1 | `feature/gtm-deal-desk` | `2827cf1` | `apps/deal-desk/main.clear` — discount approval workflow with AI-drafted CRO summaries. 161 lines, 14/14 tests pass, hero demo for the Marcus landing page |
| GTM-2 | `feature/gtm-marcus-landing` | `19f3e51` | `landing/marcus.html` headline restored to Session-35-locked "That backlog of internal tools nobody's going to build? Ship the first one this Friday." |
| GTM-3 | `feature/gtm-pricing` | `fabd076` | New `landing/pricing.html` — Free / Team $99 / Business $499 / Enterprise. Marcus-pain framing on per-seat vs flat. Wired pricing nav links across `marcus.html` |
| GTM-5 | `feature/gtm-onboarding` | `7979736` | First-visit onboarding card on `#chat-messages` in Studio. Auto-focuses chat input. Per-mode copy. Dismissed on first keystroke or × click. localStorage-gated |

GTM-4 (LinkedIn DMs) is still blocked on Russell (Queue H — his outreach).

### Queue C — Repo Readthrough (3/3 shipped)

| Item | Branch | Commit | One-liner |
|---|---|---|---|
| RR-1 | `fix/rr-doc-drift` | `6ea720c` | New `scripts/check-doc-drift.cjs` (190 lines, no deps). Found 6 real drifts. Fixed compiler test count (1089/1850/1954 → 2108) and doc-rule surfaces (9 → 11 in FAQ.md). Wrote `docs/doc-drift-findings.md` for the harder ones |
| RR-2 | `feature/rr-1to1-audit` | `c43d814` | `docs/one-to-one-mapping-audit.md` — analyzed CHECKOUT/OAUTH_CONFIG/USAGE_LIMIT (handoff-named), found they're already 1:1; identified AUTH_SCAFFOLD/AGENT_DEF/WEBHOOK as REAL worst offenders. Implemented one fix: provenance comment on AUTH_SCAFFOLD output |
| RR-3 | `docs/rr-marcus-bias` | `f845dde` | ROADMAP cleanup. Deleted stale "Mechanical Test Quality Signals" subsection (all done — moved to CHANGELOG). Relocated 5 orphaned "Next Up Session 34" items: 4 eval-tooling items into "Future (Not Committed)", 1 SQLite WIP into Refactoring Backlog as R9 |

### Queue D — Builder Mode follow-ons (2/2 shipped)

| Item | Branch | Commit | One-liner |
|---|---|---|---|
| BM-6 | `feature/builder-mode-bm6` | `ea21b28` | Marcus-first tile gallery on empty preview pane. 5 featured tiles (deal-desk first), 9 more via "See more" expander. Clicks load template. Sibling-of-preview-content positioning so showTab innerHTML wipes don't nuke it. Added deal-desk to `FEATURED_TEMPLATES` in server.js |
| Builder Mode v0.3 | `feature/builder-mode-v03` | `55ef2f2` | BM-3 full (`clear-bm-ships-counter` localStorage; source pane visible for first 3 ships, hidden after) + BM-4 (click-to-edit prefills chat input from iframe click events when in builder mode). 2 new builder-mode tests added (33 total) |

### Queue E — Ghost Meph (2/6 shipped + 2 plans for the rest)

| Item | Branch | Commit | One-liner |
|---|---|---|---|
| GM-1 | `feature/ghost-meph-stub` | `964d69c` | New `playground/ghost-meph/router.js` (137 lines) — env-gated dispatch on `MEPH_BRAIN`. Stub returns Anthropic-shaped SSE with stop_reason=end_turn. /api/chat skips API-key gate when ghost active; routes via `fetchViaBackend(payload, headers)`. 34 router tests pass |
| GM-2 MVP | `feature/ghost-meph-cc` | `57c10e6` | New `playground/ghost-meph/cc-agent.js` (168 lines) — first real backend. `MEPH_BRAIN=cc-agent` spawns `claude --print` subprocess. **Text-only** — tool support deferred to plan below |

**Plans (read these before starting Queue E follow-ups):**
- `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` — full architecture for tool dispatch through cc-agent. 3 options (MCP server / stream-json parse / hybrid). Recommendation: Option A (MCP server). ~5 days estimated.
- `plans/plan-ghost-meph-openrouter-ollama-04-21-2026.md` — GM-3 + GM-4 designs. Both share a format-bridge module (~150 lines). GM-4 (Ollama) recommended first — simpler, deterministic. ~1.5 days combined.

---

## Priority queue — pick up here

Order changed from previous handoff because Queue B/C/D are mostly done.

### Queue E continuation — finish Ghost Meph

**This is the single most valuable unlock left on the roadmap.** The GM-1 router + GM-2 MVP shipped this session prove the architecture. The hard part — tool dispatch through Claude Code sub-agents — is fully designed in the plan but not implemented.

1. **GM-2 tool-use upgrade.** Implement Option A from `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md`: stand up an MCP server exposing Meph's 8 tools (edit_code, read_file, run_command, compile, run_app, stop_app, http_request, write_file), then replace the text-only `chatViaClaudeCode` with a stream-json parser that translates Claude Code's tool_use events to Anthropic SSE. ~5 days. Branch: `feature/ghost-meph-cc-tools`.

2. **GM-4 Ollama backend** (do this BEFORE GM-3 per the plan's recommendation — Ollama is simpler, helps validate the shared format-bridge module). New `playground/ghost-meph/format-bridge.js` (~150 lines) + `playground/ghost-meph/ollama.js`. Branch: `feature/ghost-meph-ollama`.

3. **GM-3 OpenRouter backend.** Reuses the now-tested format-bridge. Handle preview-tier model availability + rate limits. Branch: `feature/ghost-meph-openrouter`.

4. **GM-5 calibration harness.** Compares Factor DB row distributions across cc-agent / openrouter / real Anthropic. Drift report. Branch: `feature/ghost-meph-calibrate`.

5. **GM-6 default-switch.** `playground/supervisor/curriculum-sweep.js` defaults to `MEPH_BRAIN=cc-agent`; explicit `--real` flag for production Anthropic. Branch: `feature/ghost-meph-default`.

**★ After GM-2 tool-use lands, the budget restriction lifts.** Curriculum sweeps run on Russell's $200/mo plan. Pre-push Meph eval stops being skipped. Factor DB starts filling for free. Queue F unblocks.

### Queue F — Flywheel / Training Signal (blocked on Queue E completion)

Once `MEPH_BRAIN=cc-agent` works end-to-end:

6. **RL-3 classifier fuzzy-match fixes** — small regex additions in `playground/supervisor/archetype.js` for dashboards-with-1-chart and webhooks-on-/hook-paths. ~30 min. Branch: `fix/classifier-fuzzy`.
7. **RL-4 seed steps on 28 remaining curriculum tasks** — bring step-decomposition coverage from 7% → 100%. ~1 hr. Branch: `feature/curriculum-steps`.
8. **RL-5 sharpen 5 archetype task descriptions** — explicit signals in task prompts so classifier routes correctly. ~30 min. Branch: `feature/archetype-task-hints`.
9. **RL-6 first full Ghost-Meph re-sweep** — overnight, free. Populate Factor DB with step-labeled rows. Result analysis as `docs/rl6-sweep-results.md`.
10. **RL-8 retrain ranker on honest-helpful labels** — once `hint_helpful='yes'` count crosses ~50, train secondary pairwise ranker via `python playground/supervisor/train_reranker.py`. Branch: `feature/rl-honest-ranker`.

### Queue G — Clear Cloud scaffolds (PR-only, don't merge)

Read `plans/plan-clear-cloud-master-04-21-2026.md` first for architecture context. Everything in this queue is scaffold-only — write code, run unit tests, commit to a branch, but DO NOT merge until Russell signals Phase 85a (domain reg, Fly Trust Verified, Stripe signup, Anthropic org key, Postgres provisioning) is done.

11. **CC-1 multi-tenant DB schema** — `playground/tenants-db/migrations/001-tenants.sql`. Branch: `feature/cc1-schema` (do not merge).
12. **CC-1 subdomain routing** — `approvals.buildclear.dev` → tenant X's compiled app. Mock deploy target. Branch: `feature/cc1-router` (do not merge).
13. **CC-2 buildclear.dev auth** — user accounts, sessions, team membership against dev Postgres. Branch: `feature/cc2-auth` (do not merge).

### Queue H — Blocked on Russell (skip; just note)

- Phase 85a provisioning (his accounts, his credentials)
- CC-3 Stripe billing — blocked on Stripe account
- CC-5 DNS verification — blocked on real domain
- GTM-4 LinkedIn DMs — his outreach
- LAE Phase C+ — destructive delete, audit log, concurrent-edit guard. Needs real prod tenants.

### Queue I — Design deliverables (write plans, don't implement)

If you finish Queue E + F and the blockers in H still stand:

- **CC-3 Stripe billing plan** — full pricing tiers → Stripe products → webhook handlers → usage meter. Save as `plans/plan-cc3-stripe-billing-MM-DD-YYYY.md`.
- **CC-5 custom domain flow plan** — UX mock + DNS verification + SSL provisioning. Save as `plans/plan-cc5-custom-domain-MM-DD-YYYY.md`.
- **Compiler Flywheel Tier 1 plan** — runtime beacons (latency, error, memory) from compiled apps back to Studio. Save as `plans/plan-compiler-flywheel-tier1-MM-DD-YYYY.md`.

---

## Open design questions left for Russell

These came up during the session and were noted in commits/findings docs rather than acted on:

1. **Core templates: 7 or 8?** `CLAUDE.md` table header says "Core 7" + lists 7 apps; FAQ + FEATURES + AI-INSTRUCTIONS say "8 core templates" (the 8th is ecom-agent). Recommendation in `docs/doc-drift-findings.md`: promote CLAUDE.md to "Core 8" + add ecom-agent row. Needs Russell decision.
2. **Curriculum task count: 20/25/28/30 vs 38 on disk.** Different metrics conflated across docs (benchmark subset vs all tasks). Documented in `docs/doc-drift-findings.md`.
3. **Node-type count: 119+ vs 126 vs ~156 in parser.** Documented in `docs/doc-drift-findings.md` — needs Russell to decide canonical metric (documented vs implemented).
4. **CHECKOUT/OAUTH_CONFIG/USAGE_LIMIT removal.** Audit found OAUTH_CONFIG and USAGE_LIMIT have ZERO real-app usage. Recommend deleting in a follow-up cleanup PR. Documented in `docs/one-to-one-mapping-audit.md`.

---

## When to stop and write the next HANDOFF

- You finish Queue F.
- You finish Queue E (Ghost Meph) end-to-end including tool-use.
- You hit a hard blocker across multiple queue items.
- A test suite breaks in a way you can't fix without design input from Russell.

When you do, include: what shipped (merged branches + hashes + test counts), what's in review (Queue G scaffolds), blocked-on-Russell (Queue H), proposed next priority order.

## Working style rules (unchanged)

- **Narrate as you go.** Science Documentary Rule.
- **Don't invisible-agent-work.** Code changes happen in the main thread.
- **When a test fails, check pre-existing state.** Stash → main → run test → unstash. Don't chase ghosts.
- **Break big tasks into small PRs.** This session shipped 11 separate merge-to-main commits — one per queue item.
- **Run the test suite after touching compiler files.** `node clear.test.js` must stay green.
- **Meph is not your tool (yet).** You're doing this work yourself. Don't try to spawn Meph to build for you. You ARE what would build it.

## The big picture

Russell's thesis: Clear wins by being the readable-source + AI-native + live-editable + portable alternative to Retool / Lovable / Airtable. Three moments where that advantage bites: day-1 (readable source for audit), day-30 (Live App Editing without breaking users mid-task), day-90 (real bills arrive, Marcus sees Clear Cloud is 30-50% cheaper due to AI Gateway caching).

Last session (2026-04-21):
- The GTM story now has a hero demo (deal-desk app), a landing page (marcus.html with the Session-35 headline), and a pricing page (Free/Team/Business/Enterprise tiers locked).
- Studio is meaningfully more Marcus-friendly: tile gallery on empty preview, first-visit onboarding, Builder Mode v0.3 with adaptive source-pane and click-to-edit.
- Doc hygiene done: doc-drift checker shipped, 1:1-mapping audit shipped with one provenance fix, ROADMAP non-Marcus items relocated.
- Ghost Meph routing layer + cc-agent text-only MVP are live. The unlock that breaks the budget constraint (cc-agent with tools) is fully designed and ready for the next session to execute.

Ship more this session. Russell wakes up to a roadmap that's visibly moved forward another step.

**Go.**
