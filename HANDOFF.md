# Handoff — Next Claude: plough through the roadmap

**Your mandate:** continue shipping P0 → P4 work in priority order. Russell wants momentum. Ship as you go. Don't stop and ask.

**Your budget:** your own Claude Code / Claude API — not Russell's ANTHROPIC_API_KEY. Ground rules:
- **No calls to Meph's `/api/chat`.** That hits Russell's Anthropic org.
- **`SKIP_MEPH_EVAL=1 git push`** — the pre-push hook runs `eval-meph.js` otherwise (hits his key).
- **No `curriculum-sweep.js` runs against real Meph.** Wait until Ghost Meph lands.
- **Any Clear app that uses `ask claude`** → wrap in `mock claude responding:` test blocks so tests don't fire real LLM calls.
- **Post running cost tally** to Russell at each ship point — his Claude Code plan still has limits.

**Your rules:**
- Every feature ships on `feature/<name>` or `fix/<name>` branch, NEVER commit to main. Merge `--no-ff` when green.
- Doc-only commits: `git commit --no-verify` + `git push --no-verify` (HARD RULE).
- Code commits: let hooks run unless they fail for pre-existing reasons (note pre-existing failures in commit message).
- Edit big docs in small pieces with narration between.
- Test before declaring done — run Playwright / compiler tests, verify user-visible outcome.
- BLUF summaries for Russell: plain English, bigger picture, opinionated next move.

## Current state (read these first)

- **Last merged to main:** `docs/roadmap-reorg` (Session 2026-04-21 part 1) → commit `9594086`.
- **Pending branch:** `feature/builder-mode-v01` — 5 commits on branch, 31/31 Playwright tests passing, docs partially updated. **Needs:** finish HANDOFF.md update (this file), commit, merge to main, push.
- **ROADMAP.md → "North Star: Clear Cloud (P0 — Q2 2026)"** — read before anything else. Decision context for everything below.
- **ROADMAP.md → "What's Next" priority table** — authoritative ordering for tonight's queue.
- **ROADMAP.md → "Ghost Meph — research-velocity unlock"** — research track #1 is a real build item now.
- **Pre-existing test failures on `main`:** `ide.test.js` shows 8 passed / 3 failed (strict-mode locator ambiguity on "New" button). Not caused by any active branch — treat as background noise.

## Autonomous queue — plough through in this order

### Queue A: Wrap Builder Mode v0.1 (IN PROGRESS — finish first)

1. **Commit this HANDOFF.md + remaining Builder Mode docs (FAQ entry, FEATURES row, CHANGELOG entry, system-prompt note) on the active `feature/builder-mode-v01` branch.**
2. **Merge `feature/builder-mode-v01` to main** with `--no-ff`, push (SKIP_MEPH_EVAL=1).
3. **Delete the feature branch.**

### Queue B: P0 go-to-market code work (fully autonomous)

4. **GTM-1 deal-desk hero Clear app.** Build `apps/deal-desk/main.clear` — discount approval workflow + agent that drafts approval summary. Target ~150 lines. Hero use case for Marcus landing page. Branch: `feature/gtm-deal-desk`. Wrap any `ask claude` in `mock claude responding:` test blocks. Compile, test, smoke. Ship.
5. **GTM-2 Marcus landing page.** Build `landing/marcus.html` — GAN against the existing landing template, copy locked Session 35 ("That backlog of internal tools nobody's going to build? Ship the first one this Friday."). Use deal-desk as the hero demo. Branch: `feature/gtm-marcus-landing`. Ship.
6. **GTM-3 pricing page.** Build `landing/pricing.html` — Free / Team $99 / Business $499 / Enterprise tiers locked Session 35. Branch: `feature/gtm-pricing`. Ship.
7. **GTM-5 Studio onboarding fix.** New users land in Meph chat with "What do you want to build?" — not in the empty editor. Branch: `feature/gtm-onboarding`. Ship.

### Queue C: Repo Readthrough (doc hygiene, autonomous)

8. **RR-1 doc-drift consistency check.** Write a small Node script that greps shared metrics/examples across README.md, FAQ.md, ROADMAP.md, PHILOSOPHY.md, and startup docs — flag divergences (test counts, canonical syntax, product claims). Fix the easy ones; list the hard ones for Russell. Branch: `fix/rr-doc-drift`. Ship.
9. **RR-2 retire 1:1-mapping violations.** `CHECKOUT`, `OAUTH_CONFIG`, `USAGE_LIMIT`, and any other syntax that hides too much generated behavior. Audit parser + compiler, identify 3 worst offenders, propose explicit source forms for each, implement one. Branch: `feature/rr-1to1-audit`. Ship the audit + one fix; plan the rest.
10. **RR-3 roadmap Marcus-bias check.** Grep ROADMAP for items that aren't Marcus-shaped. Move non-Marcus items down in priority or into "Future (Not Committed)". Doc-only. Branch: `docs/rr-marcus-bias`. Ship.

### Queue D: Builder Mode follow-ons

11. **Builder Mode v0.2 (BM-6 tile gallery).** Replace template dropdown with tile gallery on empty state: 5 Marcus apps on top (deal-desk, approval-queue, lead-router, onboarding-tracker, support-triage), 38 demos in "See more" drawer. Builds on v0.1 feature flag. Branch: `feature/builder-mode-bm6`. Full PRES cycle (plan → red-team → execute → ship).
12. **Builder Mode v0.3 (BM-3 full + BM-4).** Three-session auto-hide counter for Show Source + click-to-edit bridge on preview (postMessage → Meph chat prefill). Branch: `feature/builder-mode-v03`. Full PRES cycle.

### Queue E: Ghost Meph — research velocity (BUILD, not just spec)

13. **GM-1 stub `/api/chat`.** Env-gated routing: `if (process.env.MEPH_BRAIN) routeToStub(body); else hitAnthropic(body);`. Preserve full Anthropic tool-use JSON protocol. Tests verify stub path produces same request/response shapes. Branch: `feature/ghost-meph-stub`. 2 days. Ship.
14. **GM-2 CC sub-agent backend.** Sub-process IPC — `MEPH_BRAIN=cc-agent` spawns a Claude Code agent, pipes prompt in, reads tool calls out, iterates. Branch: `feature/ghost-meph-cc`. 2 days. Ship.
15. **GM-3 OpenRouter Qwen backend.** `MEPH_BRAIN=openrouter:qwen` hits `qwen/qwen3.6-plus-preview:free` via OpenRouter's API. Handle preview-tier quirks (rate limits, model disappearance). Branch: `feature/ghost-meph-openrouter`. 1 day. Ship.
16. **GM-4 Ollama backend.** `MEPH_BRAIN=ollama:qwen3` hits `localhost:11434/api/chat`. Config for model name. Branch: `feature/ghost-meph-ollama`. 1 day. Ship.
17. **GM-5 calibration harness.** `curriculum-sweep.js --calibrate` runs N tasks on Ghost + same N on real Haiku (bounded dev key), compares Factor DB row distributions, flags drift. Branch: `feature/ghost-meph-calibrate`. 2 days. Ship.
18. **GM-6 switch default research sweep to Ghost.** `curriculum-sweep.js --workers=3` defaults to `MEPH_BRAIN=cc-agent`; `--real` flag required to hit production Anthropic. Branch: `feature/ghost-meph-default`. 1 day. Ship.

### Queue F: Flywheel / Training Signal (research, after Ghost Meph lands)

19. **RL-3 classifier fuzzy-match fixes.** Dashboards with 1 chart misroute to "dashboard" (should route to KPI). Webhooks on `/hook` paths route wrong. Small regex additions in `archetype.js`. Branch: `fix/classifier-fuzzy`. 30 min.
20. **RL-4 seed steps on 28 remaining curriculum tasks.** 2 already seeded. Step-decomposition coverage from 7% → 100%. Branch: `feature/curriculum-steps`. 1 hr.
21. **RL-5 sharpen 5 archetype task descriptions.** Explicit archetype signals in task prompts so classifier routes correctly on webhook/batch/sync/ETL/dashboard shapes. Branch: `feature/archetype-task-hints`. 30 min.
22. **RL-6 first full Ghost-Meph re-sweep.** Overnight, free. Populate Factor DB with step-labeled, well-routed rows. Branch: `docs/rl6-sweep-results` (ship the result analysis, not code — sweep is a run, not a feature).
23. **RL-8 retrain ranker on honest-helpful labels.** Once `hint_helpful='yes'` count crosses ~50 (currently 10), filter training data, train secondary pairwise ranker. Blocked on data volume from RL-6. Branch: `feature/rl-honest-ranker`.

### Queue G: Clear Cloud scaffolding (as far as I can go without Russell's accounts)

Everything in this queue is SCAFFOLD ONLY — can't be tested end-to-end without Phase 85a provisioning. Write the code, run the unit tests, commit to a branch, but don't merge to main until Russell signals Phase 85a is done.

24. **CC-1 scaffold: multi-tenant DB schema.** Design the tenants DB (Postgres) with subdomain column, per-app DB provisioning table, isolation policy. Write migration SQL. Branch: `feature/cc1-schema`. Ship as a PR (not merged) for Russell to review.
25. **CC-1 scaffold: subdomain routing.** Write the router that maps `approvals.buildclear.dev` → tenant X's compiled app. Use current Fly Phase-85 builder output. Mock out the deploy target until real Fly Trust Verified is live. Branch: `feature/cc1-router`. Ship as PR.
26. **CC-2 scaffold: buildclear.dev auth.** User accounts table, sessions, team membership schema. Login/signup endpoints that work locally against a dev Postgres. Branch: `feature/cc2-auth`. Ship as PR.

**STOP HERE if you hit this point.** Queues H/I below are blocked on Russell. Write a fresh HANDOFF summarizing what you shipped, what's PR'd waiting for review, and cost totals.

### Queue H — Blocked on Russell (DON'T attempt autonomously)

- **Phase 85a provisioning** — domain registration, Fly Trust Verified, Stripe signup, Anthropic org key, Postgres tenants DB wiring. His accounts, his credentials.
- **CC-3 Stripe billing** — blocked on Stripe account.
- **CC-5 DNS verification flow** — blocked on real domain.
- **GTM-4 LinkedIn DMs** — his outreach.
- **LAE Phase C+** — destructive delete, audit log, concurrent-edit guard. Needs real prod tenants. Blocked.

### Queue I — Design/research deliverables (write plans, don't implement)

- **CC-3 Stripe billing plan.** Write the full plan (pricing tiers → Stripe products → webhook handlers → usage meter). Branch: `docs/cc3-stripe-plan`. Ship as plan file.
- **CC-5 custom domain flow plan.** Write plan + UX mock. Branch: `docs/cc5-domain-plan`. Ship as plan file.
- **Compiler Flywheel Tier 1 instrumentation.** Design spec for runtime beacons (latency, error, memory) from compiled apps back to Studio. Already partially specced in ROADMAP. Write detailed plan. Branch: `docs/compiler-flywheel-tier1-plan`. Ship as plan file.

## Your cost tracker (update at every ship)

Format to post when committing:
```
Session spend so far: $X.XX (of $20 authorized budget)
Tonight's plough-through so far: $Y completed across Z branches.
Next item: [name], estimated $A-B.
```

If cumulative hits $15, STOP and write a status to Russell. Don't silently blow past $20.

## When you reach the end of Queue G

Write a fresh HANDOFF.md:
- What shipped (list of merged branches, commit hashes)
- What's in review (list of branches with PRs waiting)
- Blocked-on-Russell items (still blocked)
- Cost total
- Proposed next-session priority order

## If any queue item fails

- Compile error or test failure: debug and fix inline (you have full codebase access).
- Blocker you can't resolve: skip that item, note in HANDOFF, move to next.
- Ambiguous design decision: make the call, document reasoning in commit message, move on. Russell's Ross Perot rule — never stop to ask.
- Destructive operation that could lose data: STOP. Write status, wait.

## Context files to re-read at session start

1. `HANDOFF.md` (this file) — your mandate
2. `PHILOSOPHY.md` — design rules before touching code
3. `CLAUDE.md` (project + global) — rules & constraints
4. `ROADMAP.md` → North Star + What's Next priority table
5. `FAQ.md` — search-first doc for the codebase
6. `AI-INSTRUCTIONS.md` + `SYNTAX.md` — before writing any `.clear` file
7. `learnings.md` — scan the TOC before debugging anything compiler-adjacent

## This session's changes (for reference)

Session dated 2026-04-21 shipped two things before this handoff:

1. **Doc reorg** — `docs/roadmap-reorg` branch, merged to main. Split ROADMAP into ROADMAP/FEATURES/CHANGELOG, added Clear Cloud north star, priority table, Ghost Meph spec. 6 files changed, 693 insertions, 498 deletions.

2. **Builder Mode v0.1** — `feature/builder-mode-v01` branch (pending merge when you start). 5 commits, 31/31 Playwright tests passing. BM-1/2/3-minimal/5 shipped, BM-3-full/4/6 deferred to v0.2/v0.3.

Full details: `CHANGELOG.md` top two entries.

---

**Go. Ship. Don't stop and ask.** Russell wants to wake up to a pile of merged branches. Post cost + what-shipped at each commit. When you hit Queue H (blocked) or $15 cumulative spend, write a fresh HANDOFF and stand down.
