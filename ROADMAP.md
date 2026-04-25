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

## Vision

1. **AI builds things fast.** Clear is the language AI writes. Short programs, deterministic compiler. The faster the write→compile→run→fix loop, the more it ships.
2. **Hostile to bugs.** Catch mistakes at compile time. If the compiler accepts it, it should work.
3. **Russell builds faster.** Describe what you want, get working software. Real apps with auth, data, AI agents, dashboards.

**North Star (Q2 2026):** paying Marcus customers on Clear Cloud. Everything below ladders up to that, or it's research.

---

## Immediate Priorities (next concrete moves)

Ranked. Top of list = next session's pick.

| # | Task | Scope | Why it ladders to Marcus |
|---|------|-------|---|
| 1 | **R7 — Fix `needs login` page guard.** Pages with `needs login` compile to blank white pages (JWT check hides everything, no login form, no redirect). Generate a login page or redirect to `/login`. | half-day, TDD-able, $0 API | Any Marcus app with auth on a page is broken right now. Blocks every demo. |
| 2 | **R8 — Fix `for each` loop body in HTML.** `for each msg in messages: section: text msg's role` emits `+ msg +` (whole object as string) instead of expanding the child template. | half-day, TDD-able, $0 API | Loops over data are core Marcus territory (chat lists, approval queues, anything iterating). |
| 3 | **GTM-1 — Build `apps/deal-desk/main.clear`.** Hero use case: discount approval workflow with agent draft. ~150 lines. | 1 session | The asset every landing-page dollar points at. No demo without this. |
| 4 | **Phase 85a — Provision the real cloud stack.** Register `buildclear.dev`, apply for Fly Trust Verified status with 10k-machine quota, Stripe live keys, Anthropic org key, Postgres for tenants DB. | external paperwork (Russell-blocking) | Deploy works in tests but has nowhere to deploy to until this lands. |
| 5 | **CC-1 — Multi-tenant routing.** Wire the CC-2/3/5 scaffolding (already shipped: `listAppsForUser`, `assertCanAccessApp`, `app_domains`, `cloud-billing`, `cloud-quota`, `cloud-domains`, DNS poller, Stripe rollup) into a live subdomain router. `approvals.buildclear.dev` and `crm.buildclear.dev` route to different Workers with different D1 DBs. | 2-3 weeks | The missing piece. Without it the scaffolding doesn't ship traffic. |
| 6 | **GTM-2 — Build `landing/marcus.html`.** GAN against the ASCII mock locked Session 35. Headline: "That backlog of internal tools nobody's going to build? Ship the first one this Friday." | 1 session | Pitch surface for first 5 Marcuses (item 7). |
| 7 | **GTM-4 — Find 5 real Marcuses on LinkedIn.** DM, show Studio, watch what breaks. | ongoing | Fastest validation lever; data drives Builder Mode polish + bug priority. |
| 8 | **CC-4 — Wire Studio Publish to live Clear Cloud.** Currently points at the test builder; needs to point at production CC-1 stack once that lands. | 3 days, after CC-1 | Closes the "no terminal" pitch. |

---

## P0 — Ship Marcus on Clear Cloud (Q2 2026)

The product Marcus presses "Publish" in. Building on top of already-shipped Phase-85 Fly infrastructure (shared builder, AI proxy, tenant layer, 72 passing tests) and the CC-2/3/5 scaffolding shipped Sessions 41-43.

**The five missing pieces (only CC-1 and CC-4 are still genuinely open — CC-2/3/5 internals shipped):**

| # | Piece | Status | Scope |
|---|---|---|---|
| **CC-1** | Multi-tenant routing — subdomain → Worker + D1 DB binding | **Open — biggest blocker** | 2-3 weeks |
| CC-2 | Auth for `buildclear.dev` (accounts, sessions, teams) | Scaffolding shipped (CC-2b/c/d). Open: stitching into a logged-in dashboard UI. | ~1 week to wire up |
| CC-3 | Stripe billing — subscriptions + usage metering + quota | Scaffolding shipped (CC-3b/c/d). Open: live Stripe keys + webhook receiver in production. | ~1 week to wire up |
| **CC-4** | "Publish" button wired to Clear Cloud (not test builder) | **Open — depends on CC-1** | 3 days |
| CC-5 | Custom domain flow — DNS routing + SSL + verify UX | Scaffolding shipped (CC-5/5a/5b). Open: end-to-end UX polish. | ~1 week to wire up |

**Phase 85a — external prerequisites (single biggest unblocker):** register buildclear.dev, Fly Trust Verified application (10k machines), Stripe live keys, Anthropic org key, Postgres provision for tenants DB, run `deploy-builder.sh` + `deploy-proxy.sh` once.

**What Marcus experiences:** open `buildclear.dev` → log in → write or ask Meph → hit Publish → app live at `approvals.buildclear.dev` in 3 seconds → edit → save → live instantly (LAE) → custom domain = one text field. No terminal. No Dockerfile. No vendor name. One Stripe invoice.

**Mental model:** Marcus product (Bubble-shaped), not Dave tool (Terraform/YAML). Compiler picks the vendor automatically. Dockerfile hidden. Single Clear Cloud subscription. Escape hatch (`clear export` → Docker) exists but is not advertised.

---

## P0 — Marcus GTM (Q2 2026)

| # | Item | Status | Scope |
|---|---|---|---|
| GTM-1 | `apps/deal-desk/main.clear` — hero discount-approval workflow + agent draft, ~150 lines | Open | 1 session |
| GTM-2 | `landing/marcus.html` — GAN against ASCII mock, "ship the first one this Friday" headline | Open | 1 session |
| GTM-3 | `landing/pricing.html` — Free / Team $99 / Business $499 / Enterprise | Open | 1 session |
| GTM-4 | Find 5 real Marcuses on LinkedIn, DM, show Studio, watch what breaks | Ongoing | Continuous |
| GTM-5 | Studio onboarding — new users land in Meph chat with "What do you want to build?" not in editor | Open | 2 days |
| GTM-7 | Studio instrumentation — first-click tracking, time-to-first-app, where signups bounce | Open | 3 days |

**Pitch + pricing locked Session 35** (Marcus over Sara, Vercel pattern, $99/$499/$Enterprise tiers). Full positioning + competitive analysis: `FAQ.md` → "Why does Clear Cloud beat Retool and Lovable?".

---

## P0 — Critical bugs blocking real Clear apps

| # | Bug | Symptom | Fix |
|---|---|---|---|
| R7 | `needs login` on a page → blank white page | JWT check hides everything but doesn't show login form or redirect | Generate auto-login page OR redirect to `/login` |
| R8 | `for each` in HTML doesn't expand child template | Emits whole object as string (`+ msg +`) instead of rendering loop body | Compiler walks loop body, emits per-iteration HTML |

Both are TDD-able, half-day each, $0 API. Sitting in `FAQ.md → "What are the known broken things?"` until fixed.

---

## P1 — Live App Editing (flagship completion)

Phase A (additive edits) + Phase B (reversible: hide/rename/relabel/reorder) shipped — see `FEATURES.md` → "Live App Editing". What remains:

| Phase | Items | Status | Effort |
|-------|-------|--------|--------|
| **Phase C** | LAE-5 schema migration planner; LAE-3 destructive changes (explicit permanent-delete + unavoidable type coercion). **No data snapshot on destructive delete** — audit trail replaces it as the accountability surface (GDPR/CCPA/HIPAA erasure compliance). | Not started | ~1.5 weeks |
| **Phase D** | LAE-8 audit log per app; LAE-9 concurrent-edit guard (block/queue, never silent overwrite); LAE-10 dry-run mode (private staging URL for 10-min preview before shipping to employees) | Not started | ~1 week |

**Still needed before any multi-user demo:**
- Browser Playwright e2e covering owner→widget→ship/hide/undo on the three templates
- Studio's `liveEditAuth` middleware currently parses JWTs without HMAC verify; must use `runtime/auth.js`'s `verifyToken` before multi-user

**Success metric:** Marcus ships 3+ live edits to his prod app in his first week without a single rollback-due-to-breakage. Positioning: *"Never lose a user's form data when you change the app."*

Competitive snapshot in `FAQ.md` → "Why does Clear Cloud beat Retool and Lovable?".

---

## P1 — Builder Mode polish

Builder Mode v0.3 shipped (BM-1/2/3/4/5/6 — see `FEATURES.md` → Studio IDE row). What remains:

| Item | What | Effort |
|------|------|--------|
| Status bar | Users / agent spend / last ship chip — always visible at bottom | 3 days |
| Default flip | Builder Mode becomes default for new users; `cmd+.` reveals 3-panel | 1 day, after status bar lands |

---

## P2 — Compiler Flywheel (second-order moat)

Tracks whether the JS/Python/HTML the compiler emits is actually optimal. Today's Meph-flywheel makes Meph write better Clear; this layer makes the *output of compilation* improve from production data.

| # | Tier | Status | Scope | Unlock |
|---|------|--------|-------|--------|
| CF-1 | **Runtime instrumentation** — compiled apps emit latency / error / memory beacons to a shared endpoint | Open (Factor DB tracks compile-time, not runtime) | 1 day | Data-driven compiler bug-reports |
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
| GM-6 | Default research sweeps to Ghost — `curriculum-sweep.js --workers=3` uses `MEPH_BRAIN=cc-agent` by default; explicit `--real` required to hit production Anthropic | 1 day |

Privacy: curriculum tasks are synthetic. Ghost Meph must NEVER touch real customer apps.

---

## P2 — Refactoring backlog

| ID | What | When |
|----|------|------|
| R1 | Decompose `compileAgent()` — 300-line monolith mutating strings via regex. Extract `applyToolUse()`, `applyMemory()`, `applyRAG()`. | Before adding more agent features |
| R2 | Deduplicate JS/Python CRUD — parallel logic, bugs in one missed in other. Shared IR. | When Python target becomes priority |
| R4 | Skill instruction raw text — tokenizer destroys parentheses in skill `instructions:` blocks. Parser should store `.raw` line text. Partially fixed; tokenizer still eats some formatting. | Before shipping store-ops demo |
| R5 | `clear test` runner doesn't pick up user-written `test` blocks — only compiler-generated e2e tests. | Before shipping store-ops demo |
| R6 | Fragile `[^)]*` regex patterns in `compileAgent()` break on literal parentheses. Real fix is R1. | Part of R1 |
| R9 | Stale SQLite WIP in `apps/todo-fullstack/clear-runtime/db.js` — pending migration unstaged since Session 32. Decide: ship, stash, or revert. | Whenever todo-fullstack is touched next |
| R10 | **Retire 1:1-mapping violations.** `CHECKOUT`, `OAUTH_CONFIG`, `USAGE_LIMIT` generate routes, functions, and imports the user never wrote — the compiler is doing magic the user can't trace. Move toward explicit source forms or demote until they comply. Protects PHILOSOPHY rule #1 (the most important moat). | Before adding more SERVICE_CALL-style sugar |

---

## P2 — Session 46 follow-up

| # | Item | Scope |
|---|---|---|
| 1 | Port TEST_INTENT + test-harness to Python target. ~140 lines for the 7 TEST_INTENT cases (httpx.AsyncClient instead of fetch) + ~300 lines for Python test-harness layer (BASE url from env, JWT fixture via PyJWT, AUTH_HEADERS, `_expectStatus`/`_expectSuccess`/`_expectBodyHas` helpers, unique-counter fixtures). Multi-session scope; fine to leave stubbed until a Python-target user surfaces. | ~440 lines |

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
