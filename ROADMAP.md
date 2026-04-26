# Clear Language — Roadmap

## How to use this file (READ BEFORE EDITING)

**The bright line: ROADMAP is forward-looking ONLY.** If a row describes something already shipped, it does NOT belong here. If you're tempted to add a "DONE (Session N)" tag inline — stop, that's the regression that turned this file into 846 lines of accumulated rubble. Done work belongs in `CHANGELOG.md` (history) and `FEATURES.md` (capability surface).

### Where everything lives

| Type of content | File | Example |
|---|---|---|
| **Forward-looking work** (priorities, "what's next") | `ROADMAP.md` ← this file | "GTM-1 build deal-desk hero app" |
| **What Clear can do today** (capability surface) | `FEATURES.md` | "Cookies (signed): `set signed cookie 'name' to value`" |
| **Session-by-session history** (what shipped, dated) | `CHANGELOG.md` | "## 2026-04-24 — Decidable Core: Total by default" |
| **Where does X live? / How do I Y? / Why did we Z?** | `FAQ.md` | "Where does the Live App Editing widget live?" |
| **Foundational design rules** (1:1 mapping, 14-year-old test) | `PHILOSOPHY.md` | "Rule 18: Total by default, effects by label" |
| **Authoritative node-type spec** | `intent.md` | "POST_ENDPOINT row in spec table" |
| **How LLMs should write Clear** (conventions, gotchas) | `AI-INSTRUCTIONS.md` | "No self-assignment: `x is x`" |
| **RL flywheel / re-ranker / training-signal architecture** | `RESEARCH.md` | "EBM re-ranker design" |
| **Company / fundraising / hard-takeoff story** | `VISION.md` + `FAQ.md` (big-thesis section) | "alignment layer for AI-generated software" |
| **Decided non-goals** (won't be built) | `FEATURES.md` → "Not Building (and Why)" | "OAuth — too much rat's nest, JWT covers MVPs" |
| **Long-form bug stories / what broke + how we fixed** | `learnings.md` | Narrative, not imperative |

### End-of-session checklist (before every commit)

Run this in your head:

1. **Did I ship a feature?** → Add a row to `FEATURES.md` in the relevant section. Delete the corresponding ROADMAP row if there was one.
2. **Did I close a backlog item from ROADMAP?** → Delete the row here. If meaningful, add to CHANGELOG with session date.
3. **Is there a session story to tell?** (multiple commits, a coherent arc, a learning) → Add a CHANGELOG entry, newest at top.
4. **Did I learn something a future session will ask?** ("where does X live", "how do I Y", "why did we Z") → Add to FAQ.md.
5. **Did I introduce or remove a foundational design rule?** → Update PHILOSOPHY.md. Rare — only fundamental principles, not session-level conventions.
6. **Did I add a node type or change canonical syntax?** → Update intent.md and SYNTAX.md (full Documentation Rule in CLAUDE.md lists all 11 surfaces).
7. **Did I find a bug I'm not fixing this session?** → Add to ROADMAP "Critical bugs" section AND to FAQ.md → "Known broken things".

### Anti-patterns that signal regression

If you see any of these in ROADMAP, the file is starting to rot. Move the content out:

- **"DONE (Session N)" tags inline** → that text belongs in CHANGELOG. If a row is done, delete it.
- **Multi-paragraph narrative explanation** → belongs in FAQ.md or RESEARCH.md, not here.
- **"What's been built" lists** → that's `FEATURES.md`'s entire job.
- **Competitor analysis / market positioning** → FAQ.md → "Why" questions.
- **Architecture / "where does X live" explanations** → FAQ.md → "Where" questions.
- **Status fields like "Done", "Shipped", "✅"** → if you need a status field, the row probably belongs in CHANGELOG instead.

### When the file gets long

If ROADMAP creeps past ~400 lines, stop and audit. Ask of every section: "is this future work, or is it describing reality?" If reality, move it out. The file is a punch list, not a wiki — short and scannable beats comprehensive every time.

---

## Critical path to first paying customer (2026-04-26 — read this FIRST)

The product is meaningfully ready. The gating items are Russell's, not the compiler's.

| # | Item | Owner | Status | Unblocks |
|---|------|-------|--------|----------|
| 1 | Push `feature/overnight-04-25-2026` to remote (76+ commits) | Russell | Local only | Everything below |
| 2 | Register `buildclear.dev` domain | Russell | Not done | #4, #5 |
| 3 | Fly.io Trust Verified app | Russell | Not done | #4 |
| 4 | Stripe live keys | Russell | Gated on #2 + #3 | First paying customer |
| 5 | Anthropic org key for paid Meph sessions | Russell | Not done | First customer |
| 6 | Postgres provision (managed Fly or Neon) | Russell | Not done | First customer |
| 7 | First Marcus conversation — real backlog of internal tools, willing to try | Russell | Not done | First paying customer |
| 8 | Watch them build their first one — fix what bites | Russell + Claude | After #7 | Compounding flywheel |

**Not on the critical path** (depth/polish, valuable but not gating):

- `give claude X with prompt: 'Y'` canonical syntax — Phase 1 done, Phases 2–7 pending. See `plans/plan-give-claude-canonical-form-04-26-2026.md`.
- `live:` keyword revert + Path A defaults (while-cap, recursion-cap, email/DB timeouts) from `plans/plan-decidable-core-04-24-2026.md`.
- Apply the sweep-diagnosis patch (`snapshots/sweep-diagnosis-04-26-2026.md`) — surfaces silent fast-fails in future sweeps.
- Curate `playground/canonical-examples.md` (initial draft from winner-harvest waiting for human pass).
- Lean Lesson 1 Phase 1.5 — the $10 measurement A/B sweep.

**Honest call:** items #2–#6 are about $30–50 + 2–3 hours of Russell's time. Item #7 is a conversation, not a code move. Item #1 is 30 seconds. Everything else compounds quality but does not unblock the first customer.

---

## Strategic pivot under review (2026-04-24) — Dave-first wedge

> **Status: PENDING RUSSELL DECISION.** The Marcus-first North Star (locked 2026-04-21) is being reassessed, not deleted. Until Russell commits to the pivot or rejects it, both threads stay alive in this file. The Marcus priorities below remain as written — do NOT silently demote them.

### The Big Picture (the case for Dave-first)

AI coding is roughly half of all frontier-model inference today, growing fastest of any category. Every coding agent — Cursor, Copilot, Claude Code, Devin — burns the majority of its tokens on **retry loops**: write code, run, hit error, re-read context, fix, repeat. Clear's bet: a language designed for agents (deterministic compile, plain-English source, rich compile-time error messages, zero framework churn) cuts those loops 5-10×. Per-feature inference cost drops by an order of magnitude. Jevons paradox says total inference still goes up because 20× more apps get built — but per-app cost collapses, and whoever owns the language agents prefer captures the wave.

**Why Dave-first now, Marcus-second:**
- Devs already use agents, already pay for coding tools, already find new languages on HN/X/GitHub. CAC ≈ 0.
- "The language your coding agent writes without retries" is **category creation**. Marcus positioning ("no-code for business") is category entry against Bubble/Lovable/Retool — harder fight, higher support cost.
- Marcus stays alive as the **viral proof** ("watch a non-dev build a full-stack app") — shown below the fold, not as the hero.

**Why Compiler API not bundled compiler:**
- Obfuscated/minified local compiler = reverse-engineerable in an afternoon. Not real IP protection.
- API keeps `compileProgram()` on servers Russell controls. Side effects worth more than IP: **usage telemetry** (which syntax, errors, features), **per-user gating** (free/paid tiers, kill switch), **instant patches** (fix a compiler bug, every user has it next compile).
- Devs are conditioned to network calls in the agent loop; an extra 100ms is invisible.

**Audit ground truth (2026-04-24):** Architecture supports multi-file + components today (`use 'module'`, `define component X receiving Y:` — proven in `apps/crm-spa/`). Studio IDE does NOT — single-file only. That's why the wedge is **editor integration** (LSP + VSCode/Cursor extension), not Studio multi-file.

### What's left on the Dave-first thread

D-1 through D-5 shipped 2026-04-24 (compiler fix + Compiler API + clear-lsp + VSCode extension + `landing/for-developers.html`). See `CHANGELOG.md` for shipped detail and `FEATURES.md` for capability surface.

| # | Item | Scope | Status |
|---|------|-------|--------|
| **D-6** | Public launch: HN Show HN + X thread + 1 podcast with measurable receipt ("5 devs installed in 48h") | Russell-only | Open — gated on D-1..D-5 verification (below) |

**Local verification gates Russell still owes (blocks D-6):**
1. `cd compiler-api && wrangler deploy` — deploy the worker (needs his Cloudflare account in `wrangler.toml`)
2. `cd vscode-extension && npm install && code --extensionDevelopmentPath=$PWD` — F5 to verify highlighting + autocomplete in real VSCode
3. `npm publish` clear-lsp + clear-cli + the extension to their respective registries
4. Open `landing/for-developers.html` in a browser; eyeball the visual; run a Lighthouse pass

### Open decision points for Russell

1. **Commit to Dave-first ordering, or keep Marcus-first locked?** If commit: demote CC-1..CC-5 to P1 below; rewrite Vision to lead with Dave wedge; reorder Immediate Priorities. If reject: delete this entire pivot section, keep Marcus-first as-is.
2. **Compiler API hosting:** Cloudflare Workers (recommended — edge latency, $0 cold start) vs Fly (already have infra from Phase 85)?
3. **LSP open-source or closed?** The LSP *client* logic is commodity; the value is in the API it calls. Recommend: open-source the extension, keep the API proprietary.
4. **Free tier for Compiler API rate limit?** Recommend: 1000 compiles/day free, unlimited on paid ($9/mo solo, $29/team).

---

## Vision

1. **AI builds things fast.** Clear is the language AI writes. Short programs, deterministic compiler. The faster the write→compile→run→fix loop, the more it ships.
2. **Hostile to bugs.** Catch mistakes at compile time. If the compiler accepts it, it should work.
3. **Russell builds faster.** Describe what you want, get working software. Real apps with auth, data, AI agents, dashboards.

**North Star (Q2 2026):** paying Marcus customers on Clear Cloud. Everything below ladders up to that, or it's research.

---

## Immediate Priorities — Critical Path to First Paying Customer

**Strategic decision locked 2026-04-25: Marcus first.** Dave-first remains a parallel track (D-1..D-5 shipped, D-6 HN launch on hold) but is NOT the wedge. Reasoning: today's session shipped 400 lines of CLI tooling (hooks + drift detector) — none of which Clear could have written, and all of which is Dave's daily bread. Clear's home turf is web-apps with login + DB + UI + AI agents — Marcus's daily bread. Marcus has a budget line for "save me 6 weeks of engineering"; Dave's employer paid for Cursor already. See `RESEARCH.md` and `FAQ.md` for the longer reasoning.

Definition of launch: **first paying customer.** Not "we shipped a thing." Not "HN front page." A real human paying $200-2K/mo for an internal app.

| # | Task | Owner | Days | Why it's next |
|---|------|-------|------|---|
| ~~1~~ | ~~**CC-4 — Publish button → Clear Cloud.**~~ **DONE 2026-04-25** — Studio Publish window now ships to Cloudflare end-to-end, plus the one-click-updates plan (Phases 1-6) landed on top: incremental update mode (~2s vs ~12s), version history panel, one-click rollback, byte-precise schema-change detector with 409 `MIGRATION_REQUIRED` confirmation gate. Touches `playground/deploy-cloudflare.js`, `playground/deploy.js`, `playground/tenants.js` + Postgres mirror, `playground/ide.html`. Demo path is unblocked. |
| 2 | **GTM-2 — `landing/marcus.html` polish + deal-desk demo embed.** Page exists (46KB). Tighten headline ("ship the first one this Friday"), embed deal-desk live preview, add "see it live" CTA pointing at item 1's Publish URL. | agent (parallel with #1) | 1 | Pitch surface. Lands when item 1 ships so the demo CTA isn't dead. |
| 3 | **Demo recording.** Walkthrough of building deal-desk in 30 minutes from scratch on a hosted URL. Russell records voice-over; agent prepares the script + reference app + recording outline. | agent + Russell | 0.5 | What you DM with. Lossless evidence the workflow works. |
| 4 | **Russell sells.** Cold pitch 5-10 sales-ops people on LinkedIn with the recording from #3. Goal: 1 paying customer at $200-500/mo. | Russell | 0.5 | The actual launch event. Everything above is setup. |
| 5 | **Phase 85a — provision the real cloud stack** (parallel async track). Register `buildclear.dev`, Fly Trust Verified application (10k machines), Stripe live keys, Anthropic org key, Postgres provision for tenants DB. | Russell (external paperwork) | external | Async — runs in background. Items 1-4 ship against the existing test infra; item 6 needs this. |
| 6 | **CC-1 finish — wire PostgresTenantStore to real Postgres** (after first customer). The interface stub shipped today (2026-04-25); production wire-up uses the SQL each method already documents. | agent | 1-2 | Durability for paying customers. Phased AFTER first sale because in-memory is fine for the first 1-3 demos. |

**Total agent work to demo-ready: 2-3 days. Total agent + Russell work to first customer: ~1 week.**

Items 1 + 2 run **in parallel** — different files (CC-4 touches `playground/server.js` + `playground/ide.html` + deploy code; GTM-2 touches `landing/marcus.html`). Item 3 starts after both land. Item 4 starts after Russell records the voice-over.

**Parallel track (Dave):** keep `landing/for-developers.html`, `clear-lsp`, the VSCode extension, and the Compiler API. Don't bet on D-6 (HN launch) until Marcus revenue lands. After first Marcus customer, evaluate whether to push Dave-first as expansion or keep it as a parallel hobby track.

**Other open work that doesn't block launch:**
- LAE Phase C (destructive ships) — plan locked 2026-04-25, 7-cycle TDD. Compounds the "edit live app" pitch but isn't on the critical path.
- LAE Phase D — LAE-9 concurrent-edit guard, LAE-10 dry-run mode. Phase D's audit log write path shipped today.
- Builder Mode default flip (1 day, ships Builder Mode as the new-user default).
- Charts T2#8 — donut/scatter/gauge/sparkline (6-cycle plan locked).

---

## P0 — Ship Marcus on Clear Cloud (Q2 2026)

The product Marcus presses "Publish" in. Building on top of already-shipped Phase-85 Fly infrastructure (shared builder, AI proxy, tenant layer, 72 passing tests) and the CC-2/3/5 scaffolding shipped Sessions 41-43.

**The five missing pieces (only CC-1 and CC-4 are still genuinely open — CC-2/3/5 internals shipped):**

| # | Piece | Status | Scope |
|---|---|---|---|
| **CC-1** | Multi-tenant routing — subdomain → Worker + D1 DB binding | **Open — biggest blocker** | 2-3 weeks |
| CC-2 | Auth for `buildclear.dev` (accounts, sessions, teams) | Scaffolding shipped (CC-2b/c/d). Open: stitching into a logged-in dashboard UI. | ~1 week to wire up |
| CC-3 | Stripe billing — subscriptions + usage metering + quota | Scaffolding shipped (CC-3b/c/d). Open: live Stripe keys + webhook receiver in production. | ~1 week to wire up |
| ~~**CC-4**~~ | ~~"Publish" button wired to Clear Cloud (not test builder)~~ | **DONE 2026-04-25** — Publish window ships to Cloudflare, one-click updates (Phases 1-6) layered on top: incremental update path (~2s), version history, rollback, schema-change confirm gate. See `CHANGELOG.md` 2026-04-25. | — |
| CC-5 | Custom domain flow — DNS routing + SSL + verify UX | Scaffolding shipped (CC-5/5a/5b). Open: end-to-end UX polish. | ~1 week to wire up |

**Phase 85a — external prerequisites (single biggest unblocker):** register buildclear.dev, Fly Trust Verified application (10k machines), Stripe live keys, Anthropic org key, Postgres provision for tenants DB, run `deploy-builder.sh` + `deploy-proxy.sh` once.

**What Marcus experiences:** open `buildclear.dev` → log in → write or ask Meph → hit Publish → app live at `approvals.buildclear.dev` in 3 seconds → edit → save → live instantly (LAE) → custom domain = one text field. No terminal. No Dockerfile. No vendor name. One Stripe invoice.

**Mental model:** Marcus product (Bubble-shaped), not Dave tool (Terraform/YAML). Compiler picks the vendor automatically. Dockerfile hidden. Single Clear Cloud subscription. Escape hatch (`clear export` → Docker) exists but is not advertised.

---

## P0 — Marcus GTM (Q2 2026)

| # | Item | Status | Scope |
|---|---|---|---|
| ~~GTM-1~~ | ~~`apps/deal-desk/main.clear`~~ | **DONE 2026-04-25** — 170 lines, 13/13 tests pass, login-gated `/cro` queue, AI draft endpoint wired (CRO button is the obvious next move) |
| GTM-2 | `landing/marcus.html` — GAN against ASCII mock, "ship the first one this Friday" headline | Open | 1 session |
| GTM-3 | `landing/pricing.html` — Free / Team $99 / Business $499 / Enterprise | Open | 1 session |
| GTM-4 | Find 5 real Marcuses on LinkedIn, DM, show Studio, watch what breaks | Ongoing | Continuous |
| GTM-5 | Studio onboarding — new users land in Meph chat with "What do you want to build?" not in editor | Open | 2 days |
| GTM-7 | Studio instrumentation — first-click tracking, time-to-first-app, where signups bounce | Open | 3 days |

**Pitch + pricing locked Session 35** (Marcus over Sara, Vercel pattern, $99/$499/$Enterprise tiers). Full positioning + competitive analysis: `FAQ.md` → "Why does Clear Cloud beat Retool and Lovable?".

---

## P0 — Critical bugs blocking real Clear apps

| # | Bug | Symptom | Status |
|---|---|---|---|
| ~~R7~~ | ~~`needs login` on a page → blank white page~~ | ~~JWT check hides everything but doesn't show login form or redirect~~ | **DONE 2026-04-25** — page-level guard now route-gated; emits `if (location.pathname === '/cro' && !token) location.href='/login'`. No more top-level `return;` SyntaxError. 4 TDD tests in clear.test.js → "R7: needs login". |
| ~~R8~~ | ~~`for each` in HTML doesn't expand child template~~ | ~~Emits whole object as string (`+ msg +`) instead of rendering loop body~~ | **DONE 2026-04-25** — reactive renderer now recurses into `section`/`page` containers; empty fallback is a clean `''` instead of stringifying the row. 2 TDD tests in clear.test.js → "R8: for-each body expands". |

Both shipped overnight 2026-04-25 along with the deal-desk app (GTM-1) that exercises both fixes end-to-end.

---

## P1 — Live App Editing (flagship completion)

Phase A (additive edits) + Phase B (reversible: hide/rename/relabel/reorder) shipped — see `FEATURES.md` → "Live App Editing". What remains:

| Phase | Items | Status | Effort |
|-------|-------|--------|--------|
| **Phase C** | LAE-5 schema migration planner; LAE-3 destructive changes (explicit permanent-delete + unavoidable type coercion). **No data snapshot on destructive delete** — audit trail replaces it as the accountability surface (GDPR/CCPA/HIPAA erasure compliance). | Not started | ~1.5 weeks |
| **Phase D** | ~~LAE-8 audit log per app~~ **DONE 2026-04-25** (write path on `InMemoryTenantStore`: `appendAuditEntry` + `getAuditLog`, append-only, schema `{ts, actor, action, verdict, sourceHashBefore, sourceHashAfter, note}`; Phase C extends with status + markAuditEntry); LAE-9 concurrent-edit guard (block/queue, never silent overwrite); LAE-10 dry-run mode (private staging URL for 10-min preview before shipping to employees) | LAE-8 done; LAE-9/10 not started | ~3 days remaining |

**Still needed before any multi-user demo:**
- Browser Playwright e2e covering owner→widget→ship/hide/undo on the three templates
- Studio's `liveEditAuth` middleware currently parses JWTs without HMAC verify; must use `runtime/auth.js`'s `verifyToken` before multi-user

**Success metric:** Marcus ships 3+ live edits to his prod app in his first week without a single rollback-due-to-breakage. Positioning: *"Never lose a user's form data when you change the app."*

Competitive snapshot in `FAQ.md` → "Why does Clear Cloud beat Retool and Lovable?".

---

## P1 — Builder Mode polish

Builder Mode v0.3 shipped (BM-1/2/3/4/5/6 — see `FEATURES.md` → Studio IDE row). What remains:

| Item | What | Status |
|------|------|--------|
| ~~Status bar~~ | ~~Users / agent spend / last ship chip — always visible at bottom~~ | **DONE 2026-04-25** — three live chips polled every 5s: compiles ok/total, app ▶/idle, last ship Xm ago. Backed by `_builderState` + `GET /api/builder-status`. |
| ~~Default flip~~ | ~~Builder Mode becomes default for new users; `cmd+.` reveals 3-panel~~ | **DONE 2026-04-25** — `STUDIO_MODE_DEFAULT = 'builder'` in `playground/ide.html` `detectStudioMode()`. Existing users with a saved `studio-mode-pref` (builder OR classic) keep what they had; only fresh users (no preference) get the new default. `?studio-mode=classic` opts back. Tests in `playground/builder-mode.test.js` cover: fresh user → builder, classic-pref preserved, builder-pref preserved, unknown URL value falls back to builder. |

---

## P2 — Compiler Flywheel (second-order moat)

Tracks whether the JS/Python/HTML the compiler emits is actually optimal. Today's Meph-flywheel makes Meph write better Clear; this layer makes the *output of compilation* improve from production data.

| # | Tier | Status | Scope | Unlock |
|---|------|--------|-------|--------|
| ~~CF-1~~ | ~~**Runtime instrumentation** — compiled apps emit latency / error / memory beacons to a shared endpoint~~ | **DONE 2026-04-25** — `_clearBeacon` helper + endpoint_latency + endpoint_error events emitted in every compileToJSBackend. Receiver at `POST /api/flywheel/beacon` writes to `playground/flywheel-beacons.jsonl`. Silent no-op unless `CLEAR_FLYWHEEL_URL` + `CLEAR_COMPILE_ROW_ID` set. **Flywheel begins collecting the moment the env points anywhere.** Next: migrate JSONL into Factor DB `code_actions_runtime` table (plan in `plans/plan-compiler-flywheel-tier1-04-19-2026.md`). | 1 day | Data-driven compiler bug-reports |
| CF-2 | **Candidate emitters + deterministic A/B** — top 10 emit patterns get 2-3 variants, deterministic at compile time, production picks winner | Open | 1 week | Quantitative answer to "best JS pattern for X" |
| CF-3 | **Compiler-strategy reranker** — EBM trained on (archetype, app shape, runtime outcome) → emit variant | Open (after Meph reranker trained) | 2 weeks | Per-pattern emit auto-selects |
| CF-4 | **GA-evolved compiler** (research) — mutate emit functions, fitness = curriculum pass rate + runtime perf | Open | 2+ months | The compiler becomes a learned artifact |

CF-1 is the cheap optionality bet: 20 lines of instrumentation that starts collecting data now. CF-2/3/4 wait until the Meph-level flywheel is validated.

**Error-message flywheel:** Track which compile errors correlate with STUCK sessions; auto-flag for rewrite. Half-built via existing Factor DB + `scripts/top-friction-errors.mjs`. See CLAUDE.md → "Compiler error fixes are data-driven".

---

## P2 — Ghost Meph last mile

cc-agent / ollama / openrouter backends shipped (see `FEATURES.md`). What remains for full $0-research-velocity unlock:

| # | Item | Scope |
|---|---|---|
| GM-5 | Calibration harness — `curriculum-sweep.js --calibrate` runs N tasks on Ghost + same N on real Haiku, compares Factor DB row distributions, flags drift | 2 days |
| ~~GM-6~~ | ~~Default research sweeps to Ghost~~ **DONE 2026-04-25** — `validateSweepPreconditions(env, opts)` defaults to cc-agent; `--real` opts back into production Anthropic. Banner announces the default at sweep start. The "forgot --ghost and burned $50" failure mode is gone. | DONE |

Privacy: curriculum tasks are synthetic. Ghost Meph must NEVER touch real customer apps.

---

## P2 — Refactoring backlog

| ID | What | When |
|----|------|------|
| R1 | Decompose `compileAgent()` — 300-line monolith mutating strings via regex. Extract `applyToolUse()`, `applyMemory()`, `applyRAG()`. | Before adding more agent features |
| R2 | Deduplicate JS/Python CRUD — parallel logic, bugs in one missed in other. Shared IR. | When Python target becomes priority |
| R4 | Skill instruction raw text — tokenizer destroys parentheses in skill `instructions:` blocks. Parser should store `.raw` line text. Partially fixed; tokenizer still eats some formatting. | Before shipping store-ops demo |
| ~~R5~~ | ~~`clear test` runner doesn't pick up user-written `test` blocks~~ — **DONE** (verified 2026-04-25). User blocks land in result.tests alongside auto-generated CRUD tests. Regression coverage in clear.test.js → "R5: user-written test: blocks land in result.tests". | — |
| R6 | Fragile `[^)]*` regex patterns in `compileAgent()` break on literal parentheses. Real fix is R1. | Part of R1 |
| R9 | Stale SQLite WIP in `apps/todo-fullstack/clear-runtime/db.js` — pending migration unstaged since Session 32. Decide: ship, stash, or revert. | Whenever todo-fullstack is touched next |
| R10 | **Retire 1:1-mapping violations.** `CHECKOUT`, `OAUTH_CONFIG`, `USAGE_LIMIT` generate routes, functions, and imports the user never wrote — the compiler is doing magic the user can't trace. Move toward explicit source forms or demote until they comply. Protects PHILOSOPHY rule #1 (the most important moat). | Before adding more SERVICE_CALL-style sugar |

---

## P2 — Session 46 follow-up

| # | Item | Scope |
|---|---|---|
| 1 | Port TEST_INTENT + test-harness to Python target. ~140 lines for the 7 TEST_INTENT cases (httpx.AsyncClient instead of fetch) + ~300 lines for Python test-harness layer (BASE url from env, JWT fixture via PyJWT, AUTH_HEADERS, `_expectStatus`/`_expectSuccess`/`_expectBodyHas` helpers, unique-counter fixtures). Multi-session scope; fine to leave stubbed until a Python-target user surfaces. | ~440 lines |
| 2 | **Dave-mode v0.1 — Russell-utility scope.** Add a "build a CLI tool" target plus the minimum primitives (read from input pipe, write to output pipe, exit with a code, take command-line args, separate output and error streams) so Russell's own hooks/scripts/build-tools can be written in Clear instead of JS. **Scope is dogfood-for-self only — not the full Dave-mode for actual Dave customers** (no polyglot, no library interop, no ecosystem work). Pays for itself in maintainability of personal tooling: every time Russell comes back to a hook in 3 months with low energy, plain-English beats JS re-parse. **Phasing: post-Marcus-#1.** Pre-customer this is a sequencing mistake. | ~2 weeks |
| 3 | **Dave-mode v1.0 — lifecycle pitch (reading, maintaining, OWASP, spelunking, AI agents working on existing code).** Sharpened thesis from Session 46: writing is the smallest slice of code's lifetime cost. Reading + maintaining + auditing + extending dominates for any codebase older than 3 months. Plain-English Clear cuts the read-cost 30-50%, which compounds across every PR, every bug fix, every onboarding, every security audit. Pitch line: *"your team's TCO on AI-written code drops in half because reviewing a Clear PR is reading English."* This applies to Marcus's apps too — when his deal-desk has run 6 months and a bug surfaces, Clear lets the junior eng fix in 5 min vs 2 hrs of TypeScript spelunking. Full Dave-mode v1.0 needs polyglot (TS coexistence), library wrappers, and ecosystem work — multi-month, post-Marcus-revenue. The lifecycle angle is what makes it a real wedge instead of a marginal "Cursor without retries" pitch. | multi-month, post-Marcus-revenue |

---

## P3 — Research portfolio (laptop-feasible)

**Sequencing rationale** (full detail in `RESEARCH.md` → "Flagship Research Candidates"): scaling-laws first → minimality second → transfer third → emergent-algorithm last. Each paper makes the next stronger ("constraints matter" → "constraints find optima" → "optima transfer").

### Solo-Karpathy moonshots

| # | Item | Why |
|---|------|---|
| SK-1 | Cross-domain program evolution lab — train EBM reranker on domain A, show transfer to domain B | Research-grade claim, CPU-friendly, aligned with Clear's thesis |
| SK-2 | Provably minimal agent-iterated programs — does GA+reranker converge on the minimum Clear program? Verified via exhaustive enumeration over 11-op patch space | FunSearch / AlphaEvolve never claim minimality; Clear's closed grammar makes it tractable |
| SK-3 | Constrained-language scaling laws — small LLM writing Clear vs big LLM writing Python on same spec | Bitter Lesson counterexample; weekend of runs |
| SK-4 | Emergent-algorithm detection — "Move 37" for programs; readable 1:1 output makes novelty auditable | Highest intellectual ceiling, hardest to score |
| SK-5 | Self-play synthetic task generation (AlphaGo move for code) — meta-Meph writes specs, Meph attempts, tests grade, passed specs become curriculum | Likely biggest if A/B scales to 5+ archetypes |
| SK-6 | Tiny-model distillation — fine-tune open 7B on 10K Meph traces, RL on test-outcome signal, beat Claude on Clear | Possibly biggest commercial result; local inference, $0 API |
| SK-7 | Test-time compute scaling on clean oracle (o1/R1 direction) — best-of-N Meph attempts, measure pass-rate curve | $20, one afternoon; cited reference point |
| SK-8 | Safety-by-construction paper — DSL + deterministic compiler eliminates classes of vulnerabilities prompt-tuning cannot | Different audience (alignment + enterprise security); writes when any of the others lands |

### Other laptop-scale bets

| # | Item | Status |
|---|---|---|
| OL-1 | Search-space compression benchmark (Clear vs Python on same program-search tasks) | Idea |
| OL-2 | Readable-source debugging benchmark (paired bug-fix in Clear vs JS/Python) | Idea |
| OL-3 | Error-message learning loop — mine Factor DB for highest-cost errors, rewrite, measure pass-rate lift. `scripts/top-friction-errors.mjs` produces ranked list automatically. | In progress (Session 44 evening) |
| OL-4 | Task-curriculum teacher — learn which next archetype trains the reranker fastest | Idea |
| OL-5 | Counterexample co-evolution — evolve adversarial test generators, harden programs against them | Idea |

### Agent Self-Heal (ASH-1 done)

ASH-1 sweep already complete — Browser Use's "Bitter Lesson of Agent Harnesses" *falsified* on our stack. What remains:

| # | Item | Why |
|---|---|---|
| ASH-2 | `meph_propose_tool(name, sketch)` — Meph writes candidate tool to `.claude/meph-tool-proposals/` for weekly review | Unlocks "agent edits own harness" loop for Meph |
| ASH-3 | Principle-5 audit of `meph-tools.js` — which tools wrap things the LLM already knows? Candidates for deletion: `run_command`, `http_request`, `read_file`. Keep tools with domain logic: `compile`, `run_tests`, `edit_code`. | Fewer tools = less surface for drift |

### Eval-tooling backlog (not Marcus-path; runs in parallel)

| Item | Notes |
|------|-------|
| Ensemble grader mode | `EVAL_PROVIDER=ensemble` runs Anthropic + Gemini, surfaces grader disagreement as pink chip — catches Claude-grading-Claude bias |
| Eval history per template | Persisted score trends + auto-flag drop > 2 points vs last run |
| CLI `clear eval --suite` mode | Unblocks scheduled regression runs outside browser |
| Probe-validate sweep against nested shapes | Sweep every `validate incoming:` with nested objects / list constraints |

---

## P4 — Private moonshots ("if the goal is delight")

Features that make Clear feel like a private cathedral project. None on the Marcus critical path.

| # | Item |
|---|---|
| PM-1 | Time-travel app editing — every ship becomes a named snapshot with diff/screenshot/why-note from Meph; one-click scrub |
| PM-2 | Compiler strategy arena — multiple emit strategies compete per pattern, score from runtime + evals + visual diffing |
| PM-3 | App MRI / X-ray mode — click anything in a running app, see the Clear line + generated JS + DB fields + tests + recent failures |
| PM-4 | Production replay lab — capture real sessions, replay deterministically against older/newer compiler versions |
| PM-5 | Semantic migrations with negotiation — destructive schema change opens an interactive planner (keep, coerce, split, rename, archive) |
| PM-6 | Multi-agent build theater — several Meph variants build/critique the same app from different perspectives, supervisor merges |
| PM-7 | Generated tests for everything visible — every button, state transition, empty state, chart, permission boundary, recovery path |
| PM-8 | Living architecture reports — gorgeous browsable dossier per app: entity graph + endpoint graph + page graph + permission graph + agent graph + failure hotspots |

---

## Future ideas (not committed)

| Feature | Syntax | Notes |
|---------|--------|-------|
| Stripe Checkout | `create checkout for 'Pro Plan' at 29.99 monthly:` | Subscriptions + hosted pages; extends `charge via stripe:` |
| Supabase File Storage | `upload file to 'avatars' bucket` | Supabase Storage API |
| Supabase Auth | `allow login with magic link` / `with google` | Replaces hand-rolled JWT |
| Real RAG (pgvector) | Semantic search over unstructured text | Current `knows about:` is keyword-only |
| GAN Loop | Claude Code + Meph automated quality loop | Infrastructure exists, needs orchestration |

---

## Stats (for headlines / quick reference)

Up-to-date numbers live in `FEATURES.md`. Roadmap-relevant deltas:

| Metric | Where to look |
|--------|---------------|
| Node types | `FEATURES.md` headline |
| Compiler tests | `FEATURES.md` headline |
| Targets supported | `FEATURES.md` → Compile Targets |
| Bug classes eliminated at compile time | `FEATURES.md` → Compiler Guarantees |

---

## Big thesis & RL training environment

Both moved to `FAQ.md` to keep the roadmap tight:
- **`FAQ.md` → "What is Clear's big thesis?"** — alignment-layer-for-AI-generated-software, fundraising sequence, hard-takeoff scenario.
- **`FAQ.md` → "What is the RL training environment?"** — sandbox runner, curriculum, structured eval API, patch API, current blocker (no fine-tuning access).

Full RL design: `RESEARCH.md`.
