# Handoff — Next Claude: plough through the roadmap autonomously

**Your mandate:** Russell started a fresh session. He wants to wake up to a pile of merged branches. Ship code in priority order. Don't stop and ask. Don't burn time on retrospective summaries — write new HANDOFF only when you hit a hard blocker or finish Queue F.

---

## Budget rules

- **Russell is on a $200/mo Anthropic unlimited plan for Claude Code.** No per-session cost tracking needed — use the API freely.
- **The one hard constraint: DO NOT call Meph's `/api/chat` endpoint until Ghost Meph is built.** That endpoint uses his separate `ANTHROPIC_API_KEY` which is not on the unlimited plan and is how he lost $168 in one day during Session 41.
- **Specifically blocked until Ghost Meph lands:**
  - `node playground/eval-meph.js` (Meph scenario eval)
  - `node playground/eval-fullloop-suite.js` (full app-build eval)
  - `node playground/supervisor/curriculum-sweep.js` (curriculum driver)
  - Any Studio `/api/chat` invocation
  - Pre-push hook's auto Meph eval → use `SKIP_MEPH_EVAL=1 git push` on every push
- **Any Clear app you build with `ask claude`** → wrap in `mock claude responding:` test blocks so `clear test` doesn't fire real LLM calls.
- **After you ship GM-1 through GM-6 (Queue E below) and `MEPH_BRAIN=cc-agent` works,** the restriction lifts — research sweeps and Meph evals can run through Claude Code sub-agents on Russell's unlimited plan. At that point, start filling Factor DB.

## Engineering rules

- Every feature ships on `feature/<name>` or `fix/<name>` — NEVER commit to main directly.
- Merge to main with `--no-ff`. Delete feature branch after.
- Doc-only commits (`.md` only): `git commit --no-verify` + `SKIP_MEPH_EVAL=1 git push --no-verify` (HARD RULE — doc commits skip hooks).
- Code commits: let hooks run. If they fail for pre-existing reasons, note in commit message and skip that specific check with --no-verify, but not both.
- Edit big docs in small pieces with narration — Russell will read your commits as a story.
- Test before declaring done. Run the actual tests, verify user-visible outcome. Compiler tests passing ≠ app works.
- BLUF summaries at each ship point: plain English + bigger picture + opinionated next move.
- Ross Perot rule: never stop to ask permission. Ambiguous call? Make it, document reasoning in the commit, move on.
- Plain-English comments in `.clear` files (no CS/compiler jargon). Written for a curious 14-year-old.
- Always re-read `AI-INSTRUCTIONS.md` + `SYNTAX.md` before writing any `.clear` file.

## Context files to read at session start (in this order)

1. `HANDOFF.md` (this file) — your mandate
2. `ROADMAP.md` → "North Star: Clear Cloud (P0 — Q2 2026)" — product decision
3. `ROADMAP.md` → "What's Next" priority table + "Ghost Meph" section
4. `PHILOSOPHY.md` — 14 design rules
5. `CLAUDE.md` (project) + `~/.claude/CLAUDE.md` (global) — rules & constraints
6. `FAQ.md` — search-first doc for the codebase
7. `FEATURES.md` — what Clear can do today
8. `CHANGELOG.md` top two entries — most recent ship history
9. `learnings.md` — scan TOC before debugging anything compiler-adjacent

---

## What's already done (so you don't duplicate)

**Session 2026-04-21 shipped to main:**

### 1. Doc reorg (`docs/roadmap-reorg`, merged `9594086`)
- Split ROADMAP.md into ROADMAP (707 lines, forward-looking) + FEATURES.md (new, capability reference) + CHANGELOG.md (new, session history).
- Added "North Star: Clear Cloud (P0 — Q2 2026)" section at top of ROADMAP locking Marcus-first product decision.
- Priority table (P0/P1/P2/P3/P4) added to "What's Next" with physical section order matching priority.
- Research and moonshot sections demoted below P3 maintenance.
- FAQ updated with 3 new "Where is X?" pointers + corrected "9 surfaces" (was stale "7").
- CLAUDE.md Documentation Rule updated to 11 surfaces (added FEATURES.md + CHANGELOG.md).

### 2. Builder Mode v0.1 (`feature/builder-mode-v01`, merged `bb99808`)
- Feature-flagged Studio layout flip via `?studio-mode=builder`. Classic 3-panel remains default.
- **BM-1 chat-as-driver** — chat drops to bottom 40vh with "What do you want to build today, or which app to change?" placeholder.
- **BM-2 preview-as-hero** — preview rises to top 60vh, full-width (`order: 0` flips DOM order).
- **BM-3-minimal Source toggle** — editor hidden by default, toolbar `Show Source ◀ / Hide Source ▶` button overlays as right-side rail (400px, z-index 20).
- **BM-5 Publish button** — `#deploy-btn` renamed + restyled in builder mode (accent background, bold, hover lift, focus glow).
- 31/31 Playwright tests passing in new `playground/builder-mode.test.js`.
- localStorage persistence (wrapped in try/catch), case-insensitive URL param, handles resizer inline-style carryover.
- Plan + red-team report: `plans/plan-builder-mode-v0.1-04-21-2026.md`.

### 3. Ghost Meph research spec (ROADMAP P2 #1)
- Added to ROADMAP as the top research-velocity priority.
- Full architecture: provider-agnostic brain via `MEPH_BRAIN` env var.
- Backends: CC sub-agents (MVP default), OpenRouter Qwen (scale), Ollama (local), Haiku dev key (calibration).
- 6 build items (GM-1 through GM-6) — estimated ~9 days of engineering.
- Not built yet — that's Queue E below.

**Known pre-existing test failures:** `playground/ide.test.js` shows 8 passed / 3 failed on main (strict-mode locator ambiguity on "New" button — toolbar's New and chat-header's New both match `button:has-text("New")`). Not caused by any recent work. Treat as background noise. Fix it if a Builder Mode item touches the area; don't prioritize otherwise.

---

## Priority queue — ship in this order

Each queue item is a separate branch, separate ship. Branch names are suggestions; adapt if you need.

### Queue B: P0 go-to-market code work

4. **GTM-1 deal-desk hero Clear app.** Build `apps/deal-desk/main.clear` — deal-desk approval workflow + AI agent that drafts approval summaries. Rep submits discount > 20% → routes to CRO → agent drafts approval summary → CRO approves/rejects. Target ~150 lines. Reference `apps/approval-queue/main.clear` for style. Wrap `ask claude` in `mock claude responding:` test blocks. Compile clean (`node cli/clear.js build`). Pass `clear test`. Syntax-check compiled JS (`node --check`). Branch: `feature/gtm-deal-desk`. Ship.

5. **GTM-2 Marcus landing page.** Build `landing/marcus.html` — GAN against existing landing pages for visual consistency. Headline locked Session 35: *"That backlog of internal tools nobody's going to build? Ship the first one this Friday."* Use deal-desk (GTM-1) as the hero demo. No emoji (see CLAUDE.md rule). Use Lucide icons (SVG). Pre-built Tailwind CSS, not CDN script (same as other landing pages). Branch: `feature/gtm-marcus-landing`. Ship.

6. **GTM-3 pricing page.** Build `landing/pricing.html` — Free / Team $99 / Business $499 / Enterprise tiers locked Session 35. Concrete agent quotas, app limits, seat counts per tier. Branch: `feature/gtm-pricing`. Ship.

7. **GTM-5 Studio onboarding fix.** New users land in Meph chat with "What do you want to build?" — not the empty editor. Detect first-visit via localStorage, show a one-time prompt. Works in both classic and Builder Mode. Branch: `feature/gtm-onboarding`. Ship.

### Queue C: Repo Readthrough (doc hygiene)

8. **RR-1 doc-drift consistency check.** Write a small Node script `scripts/check-doc-drift.cjs` that greps shared metrics/examples across `README.md`, `FAQ.md`, `ROADMAP.md`, `PHILOSOPHY.md`, and startup docs — flag divergences (test counts, canonical syntax, product claims). Fix the easy ones; list the hard ones in a `docs/doc-drift-findings.md` for Russell to review. Branch: `fix/rr-doc-drift`. Ship.

9. **RR-2 retire 1:1-mapping violations.** `CHECKOUT`, `OAUTH_CONFIG`, `USAGE_LIMIT`, and any other syntax that hides too much generated behavior. Audit parser + compiler, identify the 3 worst offenders, propose explicit source forms for each, implement one. Branch: `feature/rr-1to1-audit`. Ship the audit doc + one fix; plan the rest.

10. **RR-3 roadmap Marcus-bias check.** Grep ROADMAP for items that aren't Marcus-shaped. Move non-Marcus items down in priority or into "Future (Not Committed)". Doc-only. Branch: `docs/rr-marcus-bias`. Ship.

### Queue D: Builder Mode follow-ons

11. **Builder Mode v0.2 — BM-6 tile gallery.** Replace template dropdown with tile gallery on empty state: 5 Marcus apps on top (deal-desk, approval-queue, lead-router, onboarding-tracker, support-triage), remaining ~38 in "See more" drawer. Tiles show screenshots + one-line descriptions. Builds on v0.1 feature flag — only visible when `body.builder-mode`. Run full PRES cycle (plan → red-team → execute → ship). Branch: `feature/builder-mode-bm6`.

12. **Builder Mode v0.3 — BM-3 full + BM-4.** Three-session auto-hide counter for "Show Source" (localStorage counter, auto-hide after 3 successful ships) + click-to-edit bridge on preview (postMessage from preview iframe → Meph chat prefill "Change this [element]?"). Full PRES cycle. Branch: `feature/builder-mode-v03`.

### Queue E: Ghost Meph — research velocity unlock (high leverage)

**This is the single most valuable unlock on the roadmap.** After GM-1/2 land, research sweeps stop burning API budget and flywheel training data collection can scale 10×.

13. **GM-1 stub `/api/chat`.** In `playground/server.js`, env-gate the Anthropic call: `if (process.env.MEPH_BRAIN) routeToStub(body); else hitAnthropic(body);`. Preserve full tool-use JSON protocol (tool_use blocks match Anthropic's shape). Add unit tests verifying stub path produces same request/response envelope. Branch: `feature/ghost-meph-stub`. Ship.

14. **GM-2 CC sub-agent backend.** `MEPH_BRAIN=cc-agent` spawns a Claude Code sub-agent via subprocess IPC — prompt in, tool calls out, iterate. System prompt comes from `playground/system-prompt.md`. Tools map to the same set Meph uses (edit_code, read_file, run_command, compile, run_app, stop_app, http_request, write_file). This is the MVP backend. Branch: `feature/ghost-meph-cc`. Ship.

15. **GM-3 OpenRouter Qwen backend.** `MEPH_BRAIN=openrouter:qwen` hits `qwen/qwen3.6-plus-preview:free` via OpenRouter's HTTP API. Handle preview-tier quirks (rate limits, model disappearance). Branch: `feature/ghost-meph-openrouter`. Ship.

16. **GM-4 Ollama backend.** `MEPH_BRAIN=ollama:qwen3` hits `localhost:11434/api/chat`. Config for model name via `OLLAMA_MODEL` env var. Document install instructions in FAQ. Branch: `feature/ghost-meph-ollama`. Ship.

17. **GM-5 calibration harness.** `node playground/supervisor/curriculum-sweep.js --calibrate` runs N tasks on Ghost Meph + same N on real Haiku (bounded dev key), compares Factor DB row distributions, emits a drift report. Branch: `feature/ghost-meph-calibrate`. Ship.

18. **GM-6 switch default research sweep to Ghost.** `curriculum-sweep.js --workers=3` defaults to `MEPH_BRAIN=cc-agent`; explicit `--real` flag required to hit production Anthropic. Branch: `feature/ghost-meph-default`. Ship.

**★ Important: After GM-1 and GM-2 land, your constraint changes.** You can now invoke Meph-style workflows through Claude Code (your own subscription, which is Russell's $200/mo unlimited). Curriculum sweeps can run. Eval-meph can run via `MEPH_BRAIN=cc-agent node playground/eval-meph.js`. The pre-push hook can stop being skipped. Factor DB starts filling for free.

### Queue F: Flywheel / Training Signal (unlocked AFTER Ghost Meph)

These items are blocked on Ghost Meph landing. Once MEPH_BRAIN=cc-agent works, execute in order.

19. **RL-3 classifier fuzzy-match fixes.** Dashboards with 1 chart misroute to "dashboard" (should be KPI). Webhooks on `/hook` paths route wrong. Small regex additions in `playground/supervisor/archetype.js`. Branch: `fix/classifier-fuzzy`. ~30 min.

20. **RL-4 seed steps on 28 remaining curriculum tasks.** 2 already seeded (todo-crud, webhook-stripe). Step-decomposition coverage from 7% → 100%. Branch: `feature/curriculum-steps`. ~1 hr.

21. **RL-5 sharpen 5 archetype task descriptions.** Explicit archetype signals in task prompts so classifier routes correctly on webhook/batch/sync/ETL/dashboard shapes. Branch: `feature/archetype-task-hints`. ~30 min.

22. **RL-6 first full Ghost-Meph re-sweep.** Overnight, free. Populate Factor DB with step-labeled, well-routed rows. Ship the result analysis as `docs/rl6-sweep-results.md` — counts, archetypes, error distributions, patches that transferred.

23. **RL-8 retrain ranker on honest-helpful labels.** Once `hint_helpful='yes'` count crosses ~50 (currently 10), filter training data, train secondary pairwise ranker via `python playground/supervisor/train_reranker.py`. Branch: `feature/rl-honest-ranker`.

### Queue G: Clear Cloud scaffolds (PR-only, don't merge)

Everything in this queue is scaffold ONLY. Can't be tested end-to-end without Russell completing Phase 85a provisioning (domain reg, Fly Trust Verified, Stripe signup, Anthropic org key). Write the code, run unit tests, commit to a branch, but **do NOT merge to main** until Russell signals Phase 85a is done. Leave as open branches (or local branches) for him to review.

24. **CC-1 scaffold: multi-tenant DB schema.** Design the tenants DB (Postgres) with subdomain column, per-app DB provisioning table, isolation policy. Write migration SQL in `playground/tenants-db/migrations/001-tenants.sql`. Unit tests against a local dev Postgres. Branch: `feature/cc1-schema` (do not merge).

25. **CC-1 scaffold: subdomain routing.** Write the router that maps `approvals.buildclear.dev` → tenant X's compiled app. Use current Fly Phase-85 builder output. Mock the deploy target until real Fly Trust Verified is live. Branch: `feature/cc1-router` (do not merge).

26. **CC-2 scaffold: buildclear.dev auth.** User accounts table, sessions, team membership schema. Login/signup endpoints that work locally against dev Postgres. Branch: `feature/cc2-auth` (do not merge).

### Queue H — Blocked on Russell (skip; just note these)

- **Phase 85a provisioning** — domain registration, Fly Trust Verified, Stripe signup, Anthropic org key, Postgres tenants DB wiring. His accounts, his credentials.
- **CC-3 Stripe billing** — blocked on Stripe account.
- **CC-5 DNS verification flow** — blocked on real domain.
- **GTM-4 LinkedIn DMs** — his outreach.
- **LAE Phase C+** — destructive delete, audit log, concurrent-edit guard. Needs real prod tenants.

### Queue I: Design deliverables (write plans, don't implement)

If you finish Queues B through F and the blockers in H still stand, write out detailed plans for:

- **CC-3 Stripe billing plan** — full pricing tiers → Stripe products → webhook handlers → usage meter. Save as `plans/plan-cc3-stripe-billing-MM-DD-YYYY.md`.
- **CC-5 custom domain flow plan** — UX mock + DNS verification + SSL provisioning. Save as `plans/plan-cc5-custom-domain-MM-DD-YYYY.md`.
- **Compiler Flywheel Tier 1 plan** — runtime beacons (latency, error, memory) from compiled apps back to Studio. Partially specced in ROADMAP. Detail it out. Save as `plans/plan-compiler-flywheel-tier1-MM-DD-YYYY.md`.

---

## When to stop and write a fresh HANDOFF

- You finish Queue F (or run out of items within Queue F).
- You hit a hard blocker across multiple queue items.
- A test suite breaks in a way you can't fix without design input from Russell.
- You finish Queue E (Ghost Meph), so the next session starts with the research track unlocked.

In any of these cases, write a fresh `HANDOFF.md`:
- What shipped (list of merged branches, commit hashes, test counts)
- What's in review (branches pending merge — typically Queue G scaffolds)
- Blocked-on-Russell items (Queue H — still blocked)
- Proposed next-session priority order

## Working style rules

- **Narrate as you go.** Science Documentary Rule — explain significance, not just what you're editing. Each commit message should tell a story a non-engineer could read.
- **Don't invisible-agent-work.** Code changes and doc updates that ship happen in your main conversation thread where Russell can skim commits later. Sub-agents are fine for parallel research/exploration; ship code yourself.
- **When a test fails, check pre-existing state.** Always confirm whether the failure is caused by your work or was already there (stash → checkout main → run test → unstash). Don't chase ghosts.
- **Break big tasks into small PRS.** Builder Mode v0.1 was 7 phases × separate commit. Do the same for Queue E items — GM-1 + tests + commit, GM-2 + tests + commit, etc.
- **Run the test suite after touching compiler files.** `node clear.test.js` must stay green. If it wasn't green before you started, note the pre-existing count in your commit.
- **Meph is not your tool (yet).** You're doing this work yourself. Don't try to spawn Meph to build the deal-desk for you. You ARE what would build it.

## The big picture

Russell's thesis: Clear wins by being the readable-source + AI-native + live-editable + portable alternative to Retool / Lovable / Airtable. Three moments where that advantage bites: day-1 (readable source for audit), day-30 (Live App Editing without breaking users mid-task), day-90 (real bills arrive, Marcus sees Clear Cloud is 30-50% cheaper due to AI Gateway caching).

Everything in the priority queue above is either:
- Making that thesis more visible (GTM code: deal-desk app, landing page, pricing page)
- Making the Studio feel built for Marcus, not tolerated by him (Builder Mode v0.2/v0.3)
- Unlocking research velocity so the reranker actually ships and makes Meph better over time (Ghost Meph, Flywheel RL)
- Preparing the hosting platform that Russell's Phase 85a provisioning will fill in (CC scaffolds)

Ship a lot tonight. Russell wakes up tomorrow to a roadmap that's visibly moved forward. That's the goal.

**Go.**
