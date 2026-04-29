# Clear Language — Changelog

Session-by-session history of what shipped. Moved out of ROADMAP.md on 2026-04-21 so the roadmap can focus on what's *next*. Capability reference (what features exist today) lives in `FEATURES.md`. Node-type spec lives in `intent.md`.

Newest entries at the top.

---

## 2026-04-29 (evening) — CC-5b DNS verification poller closes the "Verifying DNS" loop

The piece between "customer types `deals.acme.com` and sees a Verifying DNS pill" and "the pill never updates because nothing's looking up DNS." Studio's bootstrap now starts a 1-minute tick that resolves pending domains and flips them to `verified` or `failed`. Without this, the attach UX shipped earlier on 2026-04-29 was a UI for a dead end.

**What shipped (4 TDD cycles, all on `feature/cc-5b-dns-poller`):**
- **F1.1 `pollOnce(db, dnsResolver)`** — runs one verification cycle. Reads pending `app_domains` rows, classifies each via the existing `verifyCname` helper, updates `status` / `verified_at` / `last_checked_at` / `last_error`. Per-row try/catch so one bad lookup never kills the whole cycle. Idempotent — verified rows are skipped on the next pass so `verified_at` doesn't drift. 11 new tests.
- **F1.2 `resolveDomainCname(domain)`** — production wrapper around `node:dns/promises.resolveCname`. Returns records on success, `null` on `ENOTFOUND` / `ENODATA` (DNS not propagated — still-pending semantic), rethrows other errors so the poller's per-row catch captures them in `last_error`. Second arg is a dependency-injection seam for tests. 5 new tests.
- **F1.3 `startDomainPoller(options)`** — interval scheduler. Returns `{ stop, tickNow }` so server shutdown can clean up and ops can force a cycle. `setIntervalFn` / `clearIntervalFn` are injectable for testability without real-timer latency. Async wrapper around the registered tick callback so awaiting it actually awaits the underlying work (caught in cycle 3.2 — first impl was fire-and-forget). 9 new tests.
- **F1.4 `bootstrapDomainPoller({ pool })` + Studio wire-up** — startup gate next to the cloud-auth bootstrap. Skips cleanly in in-memory mode (no `DATABASE_URL`); starts the 1-minute tick when a real Postgres pool is present. Logs which path it took so the startup line shows whether DNS verification is alive. 3 new tests.

**Why for launch:** CC-5 cycle 1 (the attach UX) shipped earlier 2026-04-29 but had no engine — every customer who pointed a domain saw "Verifying DNS" forever. This closes that loop. Combined with CC-5c (Fly cert provisioner, the remaining follow-up), the customer's domain goes from "I added a CNAME" → "verified" → "serving HTTPS" without anyone touching a Fly dashboard.

**Tests:** 97/97 green in `playground/cloud-domains/index.test.js` (33 new across 4 TDD cycles). 81 → 90 → 97 staircase across cycles. Compiler test suite stays green; this lives entirely in `playground/cloud-domains/`.

**Where it lives:** `playground/cloud-domains/index.js` (additions: `pollOnce`, `resolveDomainCname`, `startDomainPoller`, `bootstrapDomainPoller`) + a 6-line wire-up in `playground/server.js`. The pure helpers from cycle 1 (`normalizeDomain`, `expectedCnameFor`, `verifyCname`, `addDomain`, `listDomainsForApp`, `listPendingDomains`) are unchanged.

**Caught in flight:** the priority queue inherited a stale entry telling Claude to rebuild the search-input filter primitive (already shipped via Codex chunk #5 on 2026-04-26). The before-rebuild hook flagged it; HANDOFF was updated so future sessions don't fall into the same trap. CC-5b moved up to top priority because its building blocks (`normalizeDomain`, `expectedCnameFor`, `verifyCname`, `listPendingDomains`) had been sitting wired-but-unused since cycle 1.

---

## 2026-04-29 (afternoon) — Routing primitive: `route X by FIELD:` replaces if-chains

The piece between "Marcus customer wants a custom routing variant" and "Russell rewrites 50 lines of nested if-chains by hand for every variant." The new primitive lifts the assignment pattern into a first-class language construct. Every Marcus app that decides who-gets-the-lead based on size / region / territory / round-robin now collapses from 50+ lines to 5.

**What shipped (Phases 1-6 of the plan, end-to-end):**
- New `ROUTE_DEF` node type and `parseRouteDef` parser path. Recognizes `route <entity> by <field>:` followed by indented body of `'value' to <owner>` rules and at most one `default to <owner>` or `default round-robin across [<pool>]` rule. Match values must be quoted strings (the tokenizer splits hyphens like `Mid-market` into 3 tokens).
- Five validator rules: two HARD ERRORS (`ROUTE_ENTITY_NOT_IN_SCOPE` and `ROUTE_AFTER_SAVE` — the second catches the silent-bug class where the route block runs after the save and the assignment never persists); three WARNINGS (`ROUTE_FIELD_NOT_ON_ENTITY`, `ROUTE_NO_DEFAULT`, `ROUTE_UNREACHABLE_RULE`).
- JS compiler emit: fixed-mapping rules become a clean if/else chain over `<entity>.<field>`, mutating `<entity>.assigned_to`. Round-robin defaults call `await _clear_route_pick({routeId, pool})` against a shared `_clear_route_cursors` SQLite table emitted once per app.
- Python compiler emit: same shape, FastAPI/dict-style (`if _v == 'SMB': lead['assigned_to'] = 'alice'`).
- Cursor runtime helper inlined at module top — reads the cursor row, increments `(last_index + 1) % pool.length`, writes back, returns `pool[next]`. Empty pool returns null. Survives restarts via SQLite WAL persistence.
- **Stable route id is a content hash, not a line number.** `route_<entity>_<field>_<4-hex-djb2>` of the canonicalized rules + pool. Adding a comment above a route block doesn't reset the cursor — only changing the rules or pool does (which is the correct invalidation).
- `apps/lead-router/main.clear` rewritten — 5 lines of if-chain → 5 lines of `route lead by size:`. All 13 embedded tests still pass.

**Why for launch:** Russell's first paying Marcus customer will want a custom variant of one of the 5 Marcus apps. Lead routing is where customer requirements diverge most. Without this primitive, every variant means rewriting 50+ lines of nested if-chains AND maintaining round-robin cursor state by hand. With it, the variant is a 5-line declarative block — the kind of change Russell can ship in 30 minutes during a customer call.

**Tests:** 2773 passing, 0 failing. 17 new tests across parser, validator, and JS compiler emit cycles. 8 core templates + lead-router all compile clean.

**Open work for follow-up cycles (NOT in this commit):**
- 5 Marcus apps UAT regression smoke (browser walker)
- Doc cascade across remaining surfaces (intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, FEATURES.md, ROADMAP.md, FAQ.md, playground/system-prompt.md)
- Phase B research-tier variants (territory-with-Owners-table, workload-balanced, skill-based) — gated on a real customer asking

## 2026-04-29 (morning) — CC-5 cycle 1: custom domain attach + dashboard panel

The piece between Marcus deploying an app and Marcus pointing `deals.acme.com` at it. The customer types a domain in the dashboard's per-app panel, sees a "Verifying DNS" pill, gets a copy-pasteable CNAME hint. Soft-delete via the same panel. Cross-tenant attack returns 404 (locked in by tests).

**What shipped:**
- New `app_domains` table keyed by `(tenant_slug, app_slug, domain)` with a `pending / verified / failed / removed` state machine. Migration applies cleanly under pg-mem (no PL/pgSQL trigger).
- Three URL handlers on `playground/cloud-auth/routes.js`: POST (attach), GET (list), DELETE (soft-delete). All gate on session cookie + verify the app belongs to the authed user's tenant before any DB op.
- Per-app card on the dashboard now has a Custom domains section: status pill (Verifying DNS / Live / DNS error), CNAME hint for pending, last-error message for failed, Remove button per row. HTML escaping on every customer-controlled string.
- 23 new routes integration tests including the cross-tenant-attack-returns-404 isolation test. Total in `routes.test.js` now 95/95 passing.

**Why for launch:** Marcus's company wants `deals.acme.com`, not `acme.buildclear.dev`. Custom domains are table stakes at SaaS pricing — the moment Marcus's CFO sees the marketing brand on the URL, the platform reads as a product instead of a demo.

**Open work for cycles 2+ (NOT in this commit):**
- DNS verification poller (CC-5b) — wakes every minute, finds pending rows, calls `node:dns resolveCname`, flips to verified or failed.
- Fly cert provisioner (CC-5c) — issues SSL once a domain verifies.

## 2026-04-29 (later) — Marcus apps list: dashboard shows the customer's deployed apps

The piece between Marcus signing up and Marcus actually seeing his deployments. Picked the simplest of the three user→tenant mapping options sketched earlier — each customer = one tenant, auto-created at signup.

**The chain that lights up:**
- Sign up at buildclear.dev → user row created → a tenant row gets auto-created with a `clear-<6hex>` slug → the slug gets written back onto the user.
- Log in → cookie set as before.
- Hit the dashboard → it asks "what apps belong to my tenant?" → the new URL returns the list → the page renders one card per app with a link to the live URL.

**Cross-tenant isolation is load-bearing.** Two customers sign up, one deploys an app, the other's app list returns `[]`. That's the property that makes this safe to ship and the test that locks it in.

**What the dashboard renders:** for each deployed app it shows the app slug, the hostname, the latest version label, the deploy date, and an "Open" link. Empty state still shows when the tenant has zero deploys (no apps yet — go build one).

**Degraded modes covered:** signup without a tenant store still succeeds (tenant_slug stays null); the apps URL returns 503 when DATABASE_URL isn't set; the dashboard's auth gate bounces unauth'd users to the login page. None of these surface broken text to a customer.

121/121 tenant store tests + 72/72 routes tests + 57/57 auth helpers + 24/24 factory tests, all green. 9 new tests for listAppsByTenant + 22 new tests for the apps URL and tenant auto-create.

The "first paying Marcus customer" path is now: register account → log in → land on dashboard → see deployed apps → click into one → continue. Every step works.

## 2026-04-29 — Browser UAT runner: every Marcus app passes a real Playwright walk-through

**The 5 Marcus-targeted apps each ship with an auto-generated Playwright test that actually runs.** Wired the existing browser-UAT generator (cherry-picked from a Codex stash earlier this week) into `clear build` so every app gets a `browser-uat.mjs` file alongside its server.js. New runner script `scripts/run-marcus-uat.mjs` builds each Marcus app, spins up its server on a dedicated port, runs the walker, kills the server, and reports per-app pass/fail.

**Result:** 52 of 52 walker assertions pass across all 5 Marcus apps (Deal Desk 24/24, Approval Queue 5/5, Lead Router 6/6, Onboarding Tracker 8/8, Internal Request Queue 9/9). The walker drives every page, every nav click, every route tab, every table sort+filter, every detail-panel drilldown — and screenshots each route to `.clear-uat-screenshots/`.

**Compiler bugs the walker surfaced (and fixed in the same phase):**

3. **Tree-shake walked dependencies one level deep instead of transitively.** The deal-desk app threw `_clear_table_rows_for_view is not defined` on every page load because `_clear_bind_table` pulled in `_clear_apply_table_view` (its direct dep) but stopped there — `_clear_apply_table_view`'s own dep on `_clear_table_rows_for_view` was silently dropped. Now the resolver loops until no new helper is added.

4. **`save X as new T` discarded the inserted row.** Onboarding-tracker's seed had `customer_id is c1's id` after `save c1 as new Customer` — but the compiler emitted `await db.insert(...)` without capturing the return into `c1`, so `c1.id` stayed undefined and every subsequent FK insert failed with "customer_id is required". Now the variable is reassigned to whatever the insert returns.

**UAT-contract fixes (also surfaced by the walker):**

- The contract collected raw `{var}` placeholders in expected page text. The walker asserted "{pending_count} deals waiting on you." appeared on screen, but the runtime substitutes `{pending_count}` to a real number — the assertion always failed. Now placeholders get stripped at contract-build time, so the walker only checks the stable surrounding text.
- The contract used the page-title declaration as the page's required body text. But onboarding-tracker's title is "Onboarding Tracker" while the body reads "Customer Success" / "Customer Onboarding" — title is `<title>` metadata, not body. Now the contract prefers the first body-visible heading and falls back to title only when the body has nothing.

**Runner ergonomics:**

- Wipes per-app `clear-data.db` before each run so the seed always re-fires (idempotent seeds skip inserts when a row already exists, silently masking newly-added seed entries).
- Outputs `snapshots/marcus-uat-failures-<date>.md` with the full stdout/stderr of any failing app — debug without retracing.

This closes the loop on "make sure all 5 Marcus apps work." Russell can now build custom variants for paying customers and have a runnable acceptance test suite the moment compile succeeds.

## 2026-04-28 (late night) — Two compiler fixes + Marcus apps validation + primitive audit

**Compiler fixes that ship across every Clear app:**

1. **Page header subtitle now does `{var}` interpolation.** Previously the subtitle baked literal `{pending_count}` into the page because its compile path only handled bold/italic. Now subtitles use the same data-clear-tpl pattern that text/small-text already use, so the runtime resubstitutes on every state change. "0 deals waiting on you." now shows the real count instead of `{pending_count}`.

2. **Format helpers (`as dollars`, `as percent`, `as date`, `as json`, `as count`) guard for null/undefined.** Previously an unset value rendered as "$NaN", "NaN%", "Invalid Date", "null", or "undefined". Now each emits an empty string when the source is null/undefined — the layout shape stays right but no broken text leaks to the user. Caught when the deal-desk's empty detail panel showed `$NaN` and `NaN%` before a row was selected.

Both bugs visible in the deal-desk demo snapshot. Both fixes tracked the same pattern: a runtime helper had the right guard, but the inline-emitted code path didn't. Now they match.

**Marcus apps validation (background research):** The 5 apps Clear has today — Deal Desk, Approval Queue, Internal Request Queue, Onboarding Tracker, Lead Router — match the market evidence on what RevOps customers actually build. Strong agreement on Approval Queue + Internal Request Queue + Onboarding Tracker (covered by 4-of-4 competing platforms). Deal Desk is thesis-grade (Russell's domain expertise replaces the missing market signal). Lead Router is the weakest by market signal but cheap to keep. After Marcus #1 conversation, consider rebranding Approval Queue → "Invoice Approval Queue" if his pain is finance — same primitive, much stronger evidence (Qonto, Fintecture, Plaid).

**Primitive audit (background research):** All 6 Marcus apps compile clean today (0 errors). Russell can build custom variants now. The biggest gap is **lead routing** — today the lead-router app uses raw `if X is Y` chains. Works for fixed mapping but breaks for round-robin, territory, workload-balance, skill-based routing. Top 3 primitives to add next:
1. `route X by field` with rules + round-robin fallback (the explicit ask)
2. `search input filters table` UI primitive (every queue app needs filter-by-text)
3. Activity log / comments-on-record primitive (every approval app variant wants a timeline)

**Rule update:** CLAUDE.md gets a new sub-rule under Documentation Rule — the 11-surface doc cascade runs at PHASE-end, not commit-end. A phase ships as one cascade even if it lands across several commits. Saves the energy of writing five overlapping CHANGELOG entries that all describe the same thing.

## 2026-04-28 (night) — Deal Desk demo polish: kill 5 fake pages + Draft AI summary button + live stat counts

The deal-desk Marcus would see at a demo had 5 pages backed by hand-coded seed data — Reps, Accounts, Approval Rules, Integrations, Settings. Each one looked real. None of them worked. The Integrations page was the most dangerous — it claimed "Salesforce / Slack / DocuSign — Connected" with zero of those actually connected. Marcus would lose trust the moment he poked at any of them.

**What got pulled out (per `snapshots/deal-desk-product-review-04-28-2026.md`):**
- 5 page declarations (`/reps`, `/accounts`, `/rules`, `/integrations`, `/settings`)
- 4 backing tables (Reps, Accounts, ApprovalRules, Integrations)
- 4 endpoints feeding them
- Their seed-data sections (4 reps + 4 accounts + 3 rules + 3 integrations)
- 5 nav items in the inline sidebar pointing at the killed routes
- The dead `DealDeskSidebar` component (never referenced)

**What got polished:**
- Dead Refresh + Export header buttons gone (no body, did nothing)
- Stat strip wired to live counts: pending, approved today, awaiting customer, total deals — sourced from the 4 filter URLs the page already fetches
- Sidebar nav counts (Pending / Approved / Rejected / Awaiting / All) now use those same live counts instead of hardcoded numbers
- Draft AI summary button added to the detail panel as the FIRST action, wired to the existing `/api/deals/draft` URL

**Why for launch:** when Marcus opens this app, every visible affordance now does something real. The 12 features that remain tell a complete story; the 5 that were placeholders are gone. "This app does ONE thing and does it well" is a better pitch than "this app does 17 things and 5 of them are placeholders."

25/25 deal-desk app tests green; 2749/2749 main compiler tests green; 0 errors across 8 templates + deal-desk.

**Two pre-existing issues NOT addressed** (queued for follow-up): (1) page subtitle shows literal `{pending_count}` instead of the number — template substitution doesn't fire in subtitle text yet; (2) empty detail panel renders `$NaN` / `undefined` for unselected rows — format helpers need a guard for missing values.

## 2026-04-28 (night) — CC-2 closed: cloud-auth URLs + login/signup/dashboard pages

Customers can now log into buildclear.dev. The auth helpers from CC-1 cycle 9 (signupUser, loginUser, validateSession, revokeSession) finally have the four URL handlers they need, plus three customer-facing HTML pages that drive the full flow end-to-end.

**Why for launch:** Marcus opens buildclear.dev → /signup.html → creates an account → lands on /dashboard.html. Without this, the auth was plumbed but unreachable — code without a door. Now the door exists, and the moment Russell sets DATABASE_URL the whole flow works in production.

**What shipped:**
- `playground/db/migrations/0002_users_sessions.sql` — applies alongside CC-1's init migration when DATABASE_URL is set. Stripped the PL/pgSQL trigger vs the cloud-auth/migrations master because pg-mem doesn't speak plpgsql.
- `playground/cloud-auth/routes.js` — the four URL handlers (signup/login/me/logout). httpOnly + SameSite=Lax + Secure cookies, 30-day Max-Age, inline cookie parser (no cookie-parser dep). Stub mode when pool is null so Studio dev keeps working without DATABASE_URL.
- `playground/{login,signup,dashboard}.html` — clean Inter-font, indigo-gradient buttons matching the existing design system. Lucide icons (no emoji per the no-emoji-on-landing rule). Dashboard auth-gates on /api/auth/me and bounces unauth'd users to /login.
- IPv4-mapped IPv6 prefix gets stripped on the client-IP capture (pg-mem rejects `::ffff:127.0.0.1`).

50 new routes integration tests + 5 new factory tests prove the cloud-auth schema applies under pg-mem and the full signup → cookie-set → me-returns-user → logout-revokes-session loop works. 2749 main tests still green.

## 2026-04-28 (late evening) — Triggered email Phase B-1 part 2: `email delivery using <provider>` directive + worker scaffold

New top-level directive flips real email sending on without changing any other line of source:

```clear
email delivery using agentmail
```

When present, the compiler emits a small background worker that polls `workflow_email_queue` every 30 seconds, sends pending rows via the named provider's HTTP API, and marks each row sent or failed. Without the directive, no worker emits — default builds stay inert (the Phase 3.2 regression guard still holds, asserting no real-provider URL leaks into the compiled output).

**Why for launch:** the moment Russell sets the `AGENTMAIL_API_KEY` env var on the production server, real customer emails start flowing. No compiler change, no app change. Until then, the worker logs a clear "API key not set — cannot send" once and silently waits for it. Misconfigured deploys never silently succeed (the worker fails loud).

**Provider support:**
- `agentmail` — full HTTP POST adapter (default).
- `sendgrid`, `resend`, `postmark`, `mailgun` — recognized by the parser + validator but the worker marks rows `failed` with a clear "adapter not implemented yet" message. Picking a non-AgentMail provider today documents intent without sending.

5 new tests under `Triggered email — delivery directive (Phase B-1 part 2)`. 2740 → 2745 passing, 0 failing.

## 2026-04-28 (late evening) — Triggered email Phase B-1 part 1: template substitution at queue-insert

Every queued email used to get the same literal subject + body. Now `{customer}`, `{amount}`, `{customer_email}` and any other `{field}` reference in the Clear source resolves at queue-insert time against the entity record. Each row in `workflow_email_queue` carries the per-customer text that's actually intended.

**Why this matters:** without per-record substitution, live sending (Phase B-1 part 2) would be useless — every customer gets "Sarah from our team has prepared a counter offer for you" with no name, no deal, no amount. Validator Cycle 5.2 already catches `{ident}` references that don't match an entity field at compile time (so typos surface early). Now the runtime resolves the legitimate ones.

**How it lands:** new utility helper `_clear_interpolate(template, record)` ships with any compiled output that needs it (auto-included via the existing tree-shake pass). Both queue-insert injection sites — the queue's auto-PUT handlers in `compileQueueDef` and the user-defined endpoint inject in `compileEndpoint` — now wrap subject + body with the helper. Missing fields render as empty string, never the literal "undefined".

3 new tests under `Triggered email — template substitution (Phase B-1)` (2737 → 2740 passing, 0 failing).

Phase B-1 part 2 (the `email delivery using <provider>` directive, real sending worker, provider adapters, reply webhook) is gated on Russell providing AgentMail/SendGrid keys + explicit go to send real customer email.

## 2026-04-28 (evening) — Queue primitive F2 + F4 — plural input + action keyword synonyms + waiting on customer canonical

Two follow-ups from Russell's 2026-04-28 red-team review of the queue primitive plan, both backwards-compatible.

**F2 — plural entity input singularizes (commit 38781e5).** Authors who type `queue for deals:` used to get a different audit table + URL than authors who typed `queue for deal:` (deals_decisions vs deal_decisions, /api/deals-decisions vs /api/deal-decisions). The parser now singularizes the entityName in both `parseQueueDef` and `parseEmailTrigger` so plural input produces canonical singular output. Handles the cases Marcus's 5 apps need: regular `-s` plural (deals → deal), `-ies` plural (activities → activity), `-(s|x|z|sh|ch)es` plural (boxes → box, churches → church). Preserves `-ss` endings (address, business, status stay as-is) so they don't get truncated wrong. Five new tests in `Queue primitive — F2 plural input singularizes`.

**F4 — `options:` / `buttons:` synonyms + `waiting on customer` canonical (commit 5d72d94).** Managers don't always type `actions:` — they often type `options:` (matches the menu metaphor) or `buttons:` (matches the UI). All three keywords now resolve to the same parsed shape. Same goes for the action label `waiting on customer`, which reads more naturally than legacy `awaiting customer` and maps to the same terminal status `'awaiting'`. URL slug: `/api/deals/:id/waiting`. The compiler's `actionToTerminalStatus` and the validator's `validateEmailTriggers` reachability map both add a `waiting → awaiting` mapping next to the existing `awaiting → awaiting` and `counter → awaiting` rules. Five new tests in `Queue primitive — F4 action keyword synonyms + waiting on customer canonical`.

Tests: 2727 → 2737 passing (+10), 0 failing. Smoke-checks all 14 apps (8 core + 6 Marcus) compile clean.

**Still pending — F5 (Python parity).** The Python branch of `compileQueueDef` still returns a `# queue for X: tables emitted by Phase 2 (Python target TBD)` stub. None of the 14 apps target Python, so this isn't blocking, but it violates the new "Build Python Alongside JS" rule and should land before any Python-targeted Marcus app gets written. ~150 lines of mechanical port from the JS branch.

---

## 2026-04-28 (evening) — Codex stash cleanup — chunks #1, #2, #4, #5 cherry-picked + stash dropped

Russell's question at the end of the email-epic session: "did we cherry-pick everything useful out of Codex stash?" Audit said no — chunk #10 (shell router) + parts of #7 (chart polish) + the JSON UAT contract had landed earlier, but six other useful chunks were still sitting in `stash@{0}`. This session pulled four of them into focused commits, preserved the patch + a follow-up plan for the remaining two, then dropped the stash.

What landed:

- **Chunk #1 (validator false-positive fixes)** — `validateFieldNames` now treats fields the user already assigned to the variable before saving as already-validated (no more spurious "missing validate rule" warnings on common patterns like `record.status is 'pending'` then `save record to Things`). `validateExprComplexity` skips the noise check on CRUD lookup conditions — filter expressions like `where status is 'pending' and demo_key is X` are declarative not logic and were tripping the threshold.
- **Chunk #2 (Cloudflare packaging sandbox tolerance)** — all three CF packaging test files (`packaging-cloudflare-cron`, `packaging-cloudflare-workflows`, `packaging-cloudflare`) now skip the `node --check` smoke when the sandbox blocks Node child processes (EPERM). The skip logs visibly. Test stability fix only; no production code change.
- **Chunk #4 (UAT id markers on buttons + nav + route tabs)** — every compiled button, nav item, and route tab now carries `data-clear-uat-id` (stable line-based identifier like `button_550_Counter`) and `data-clear-control-kind` (`button` / `nav-item` / `route-tab`). Pairs with the JSON UAT contract that already shipped — chunk #8's browser-test generator (deferred, plan committed) will use these markers to find every clickable thing reliably without depending on text content or fragile CSS selectors. Verified end-to-end on deal-desk: 11 nav-item markers, 8 button markers, 3 route-tab markers.
- **Chunk #5 (sortable + filterable tables)** — every table now gets a search box in its toolbar plus working sort on every column header. Before this, the click handler set sort attributes but never re-rendered (sort was a noop) and filter didn't exist. Three new runtime helpers (`_clear_table_rows_for_view`, `_clear_apply_table_view`, `_clear_table_header`) + updates to `_clear_render_table`, `_clear_cell`, `_clear_table_init`, the table HTML emit, and the reactive table emit. Sort handles numeric, currency-prefixed, percent-suffixed, and text columns; filter is case-insensitive substring across all fields.

What's deferred (preserved for next session):

- **Chunks #8 + #9 (UAT browser-test generator + CLI plumbing)** — ~700 lines of Playwright test generator + CLI artifact-writing. Too risky to land cleanly at the tail of a marathon session. Saved the full Codex stash patch to `plans/codex-stash-2026-04-27.patch` + wrote a focused execution plan at `plans/plan-codex-uat-chunks-8-9.md` so the work survives the stash drop. Russell's call when to execute.

What's skipped on purpose:

- **Chunk #6 (approval-rules dedicated render path)** — anti-pattern (app-specific render branch in the compiler for one particular table label). Better to make existing styling work generically than add a one-off path.
- **Chunk #11 (plan-lint enforcement + skill machine-gates)** — references a `scripts/plan-lint.mjs` that doesn't ship in the patch.

`stash@{0}` was dropped after this commit. The full patch + per-chunk audit + the follow-up plan for #8/#9 live in `plans/`.

Test count: 2737 passing, 0 failing. All 14 templates / Marcus apps compile clean.

---

## 2026-04-28 (follow-up) — Triggered email primitive Cycles 4.1-extension, 4.2, 4.3, 5.2 close the silent-failure surface

Earlier in the day Phase 1 + 3 + 4.1 (queue auto-PUT only) + 5.1 + 5.3 shipped. The triggered email primitive worked when an app used the queue primitive — but if an app hand-wrote its endpoints, or skipped the queue entirely, the trigger sat dead. Same problem for the validator: it warned "never fires" on apps whose only status-changing handler was hand-written.

This session closes those gaps and adds two compile-time silent-bug guards.

- **Cycle 4.1-extension + 4.2 (compiler + validator) — `feat(email-trigger): user-defined endpoints also queue emails`** — `compileEndpoint` now scans the endpoint body for `<entity>.status = <literal>` assignments. If a top-level `email_trigger` matches the entity + value, splice a `db.insert('workflow_email_queue', {...})` into the compiled bodyCode BEFORE the response statement (after-response would be unreachable dead code). Validator's never-fires reachability map now includes user-written endpoint bodies, not just queue actions. Two regression tests: single user-defined endpoint produces exactly one insert; two user-defined endpoints both assigning the same trigger value produce exactly two inserts (catches "scan once and stop" mistakes).

- **Cycle 4.3 (validator) — `feat(email-trigger): warn when entity has no recipient_email field`** — every `email_trigger` resolves the recipient at runtime via the `<role>_email` field-on-entity convention. If the entity table never declares that field, the queue row lands with empty recipient_email and the email never sends. Validator now scans email_triggers + entity table fields, warns at compile time naming the table + missing field. Compile still succeeds (warn, not error); the queue insert still emits — failure is observable in the queue, not silent at send time.

- **Cycle 5.2 (validator) — `feat(email-trigger): warn on {ident} body interpolation refs`** — body and subject often want to interpolate entity fields (`{customer}`, `{amount}`). Until interpolation lands as a runtime feature, any `{ident}` ships as literal text in the customer's inbox. Validator now scans `node.body` + `node.subject` for `{ident}` patterns and warns when the ident doesn't match an entity field. Once interpolation lands, the same warning shape catches typos.

Tests: 2720 → 2727 passing (+7), 0 failing. Three commits (193f829, 2cfb6a4, b4835b3) + one demo commit (1b02e55) on the deal-desk app exercising the new top-level `email customer when deal's status changes to 'awaiting':` block alongside the queue's `counter` action. Merged to main as 9e5e4bc.

---

## 2026-04-28 — Triggered email primitive — top-level `email <role> when <entity>'s status changes to <value>:` block + queue-action integration

The second of three primitives unlocking Marcus's 5 workflow apps. F3 (above) made `email <role> when <action>` canonical INSIDE queue blocks; this section puts the same atom at the TOP LEVEL so any URL handler that lands the entity's status on a trigger value queues an email automatically.

Concretely, for Marcus's deal desk, this single Clear block:

    queue for deal:
      reviewer is 'CRO'
      actions: approve, reject, counter

    email customer when deal's status changes to 'awaiting':
      subject is 'We countered your offer'
      body is 'Sarah from our team has prepared a counter offer for you.'
      provider is 'agentmail'
      track replies as deal activity

…now compiles to: a queue's PUT /api/deals/:id/counter handler that records the decision audit row AND inserts a customer-bound row in workflow_email_queue (subject, body, provider, queue_status='pending', recipient resolved via the entity's `customer_email` field).

What landed across 4 commits on `feature/triggered-email-primitive`:
- **F3 (494fa1f)** — `email <role> when <action>` canonical inside queue blocks; `notify <role> on <action>` kept as legacy alias. Both forms push `{role, onActions, mechanism}` to the notifications array so future passes can route email rows to the workflow email queue while leaving notify rows generic. Apps migrated: deal-desk + onboarding-tracker. Doc cascade: SYNTAX, AI-INSTRUCTIONS, system-prompt.
- **Phase 1 parser (dfc9da7)** — new `EMAIL_TRIGGER` NodeType + `parseEmailTrigger` mirroring parseQueueDef shape. Recognizes `email <role> when <entity>'s status changes to <value>:` + body fields (`subject is`, `body is`, `provider is`, `track replies as`). Validates entity references a declared table (singular/plural match). Hard-fails on unknown body lines (F1 pattern). 5 TDD tests cover happy path, sub-clauses, undeclared entity, missing subject, unknown body line.
- **Phase 3 compiler table emit (8a6b8a6)** — `compileEmailTrigger` emits the shared `workflow_email_queue` table once per app (deduped via `ctx._workflowEmailQueueEmitted` flag — multiple triggers share the table). 3 TDD tests including a regression guard that asserts NO real provider URLs (api.agentmail.to, api.sendgrid.com, etc.) appear in compiled output. Live email delivery stays deferred behind an explicit `enable live email delivery via X` directive (Phase B-1, not started).
- **Phase 4.1 queue-action integration (fe80249)** — compileQueueDef's per-action PUT handler reads `ctx._astBody`, finds matching `EMAIL_TRIGGER` nodes (entityName + triggerValue match the action's terminalStatus), and emits a `db.insert('workflow_email_queue', {...})` after the audit + notify inserts. Recipient resolution uses the `<role>_email` field-on-entity convention. 2 TDD tests cover the positive case (counter → awaiting injects) and the negative case (approve → approved does not inject).

Test count: 2716 passing (up 14 from start of email epic), 0 failing. All 14 templates / Marcus apps compile clean.

What's deferred (not in this commit):
- Phase 4.2-4.3 — user-written endpoint handlers like `when user updates deal at /api/deals/:id/counter:` with a manual `deal's status is 'awaiting'` line. Different injection path (scanning ENDPOINT body for POSSESSIVE_ASSIGN). Adds when first customer evidence demands.
- Phase 5 — validator (never-firing trigger warning, undefined body var warning, bad provider name hard-error).
- Phase B-1 — live email delivery worker via real provider APIs. Gated behind explicit `enable live email delivery via X` directive AND env-var-backed API keys.

---

## 2026-04-28 — `email <role> when <action>` is the canonical queue notification clause (F3)

The queue primitive's notification clause now reads `email customer when counter, awaiting customer` instead of `notify customer on counter, awaiting customer`. The verb names HOW the recipient gets reached (email, vs vague "notify"); the connector reads naturally (when, vs the slightly-off "on"). This is Russell's design feedback from the 2026-04-28 red-team — verbs that name HOW > vague verbs.

The legacy `notify <role> on <action>` form still parses for backwards compatibility — a deliberate alias, not a deprecation. Both forms now push to the same `notifications` array; each row carries a new `mechanism` field (`'email'` vs `'notify'`) so future compiler passes can route email rows to the workflow email queue while leaving notify rows generic.

Future communication primitives will follow the same pattern — `slack <role> when ...`, `text <role> when ...`, `webhook <role> when ...` — each verb naming the channel.

Updated together: parser (`parseQueueDef` in `parser.js`), 4 new TDD tests in clear.test.js's `Queue primitive — email canonical (F3)` block, the existing `notify clauses` test now asserts the `mechanism: 'notify'` field, the F1 hard-fail test swaps its old "unknown clause" example from `email rep when approve` (now valid) to `slack rep when approve` (still unknown). Docs cascade across SYNTAX.md, AI-INSTRUCTIONS.md, playground/system-prompt.md. Two app sources migrated to the canonical form: `apps/deal-desk/main.clear` and `apps/onboarding-tracker/main.clear`. Test count: 2706 passing, 0 failing. All 14 templates / Marcus apps compile clean.

This unblocks the larger triggered-email primitive (next epic) — both surfaces share the canonical `email <role> when <trigger>` shape, so the new top-level `email <role> when <entity> status changes to <value>:` block will parse using the same atom.

---

## 2026-04-28 — Shell-page router (chunk #10) + chart polish (chunk #7) cherry-picked

The compiler now emits a smarter router for multi-page apps that have an `app_layout`. The first page that wraps its body in `app_layout` becomes THE **shell page** — its sidebar, header, and chrome stay mounted across every route. When the user clicks `/approved`, the router parks the shell's default content and unparks `page_Approved_today` into the shell's content slot, then kicks `_recompute()` so the newly-visible table re-binds to data already fetched on initial page load. Sidebar persists, tables hydrate, page mount lifecycle is implicit.

What this fixes in plain English: before today, a multi-page app like Deal Desk would lose its sidebar (or duplicate it) when you clicked from `/` to `/approved`, and the approved-deals table would render empty even though the data had loaded — because the table was built while its page was hidden and never re-bound when it became visible. Now the sidebar stays, the table fills in, you don't think about routing at all.

What you write to opt in: declare `app_layout` once on your shell page (typically `/`); other pages contain just their content. The compiler does the rest. Apps without `app_layout` get the original simple show/hide router (no behavior change there).

New compiled-output attributes (Meph + downstream tools should know about these):
- `data-clear-shell-root="true"` on the shell page's `app_layout` div
- `data-clear-shell-outlet="true"` on the shell page's `app_content` div
- `data-clear-routed-content="<pageId>"` on the shell's default content wrapper AND on every non-shell page's outer div
- `data-clear-page-id`, `data-clear-page-route`, `data-clear-page-title` on every page wrapper (single-page apps now get the marker too, so generated browser tests can prove the page rendered)

Plus chart polish from the same stash (chunk #7):
- Charts in routed pages now check `_chartEl.offsetParent !== null` before initializing — so ECharts doesn't try to render into a 0-width canvas while the page is hidden, then never recover
- `_chart.resize()` after init fixes the post-route-swap case where the chart was built hidden then revealed
- New `clear-chart-card` + `clear-chart-canvas` classes; pie config gets a legend, formatter, and scale-on-hover animation

5 new TDD tests cover shell-outlet emit, routed-content markers, page wrapper attributes, helper functions, and the `_recompute()` after route swap. 2 prior tests updated for the new emit format (single-page apps now get the marker; page wrappers carry data-attrs between id and style). 2702 passing, 0 failing. All 8 core templates + 6 Marcus apps compile clean.

Deal Desk's `apps/deal-desk/main.clear` was simplified in the same commit — non-shell pages dropped their inline `app_layout > sidebar > main > content` shells (left over from a workaround for the components-drop-children bug fixed earlier today). With chunk #10 landed, those shells were duplicating the sidebar. Now non-shell pages contain just their page header + content sections.

**Carve-out for the next session.** Deal Desk's local SQLite (`apps/deal-desk/clear-data.db`) is still seeded with rows from the old schema (`status='pending_cro'` instead of `'pending'`/`'approved'`/etc.), and a Windows file lock blocked deleting it from this session. After the lock clears (or the file is renamed manually), reset the DB and re-seed via the on-page-load — every page should then show real rows, not just `/all` and `/reports`.

---

## 2026-04-28 — Queue parser hard-fails on unknown body lines (F1)

The queue primitive's parser used to silently skip body lines it didn't recognize. Type `email rep when approve` instead of `notify rep on approve` and the parser shrugged — app builds, app is wrong, no error. That's the failure mode of the 14-year-old test in production.

Fixed: every unrecognized clause inside a `queue for X:` block now emits an explicit error with a "did you mean..." hint computed by edit-distance:

```
queue 'deal': don't know what to do with 'email rep when approve' on line 5.
Did you mean 'notify'? Valid clauses inside a queue block: `reviewer is 'X'`,
`actions: a, b, c`, `notify <role> on <action>, <action>`, `no export`.
```

The 4 migrated Marcus apps (Deal Desk, Approval Queue, Onboarding Tracker, Internal Request Queue) all still compile clean — they only use known clauses, so the stricter parser doesn't bite them.

Plan: `plans/plan-queue-primitive-followup-04-28-2026.md` Phase F1.

---

## 2026-04-27 (overnight, 3rd ship) — CSV export auto-included on every queue

Every `queue for X:` block now auto-emits `GET /api/<entity>/export.csv` — a plain CSV download of every row in the entity's table, with proper RFC 4180 escaping (commas, quotes, and newlines wrapped + doubled correctly) and sensitive fields (password / token / api_key / secret / hash) automatically omitted. Marcus moves FROM spreadsheets, but spreadsheets stay in his workflow for reporting and handoffs — explicit MVP item from the GTM list.

Suppress with `no export` inside the queue body when an entity should never expose data via CSV (e.g. compliance-restricted user tables).

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject
  no export                    # turns off the auto-emitted CSV URL
```

**What landed:**
- Parser: `no export` clause on QUEUE_DEF nodes (sets `node.noExport = true`).
- Compiler: extends `compileQueueDef` with a CSV URL emit step. Per-entity helpers `_clearCsvEscape_<entity>` and `_csvSensitive_<entity>` handle RFC 4180 escaping + sensitive-field filtering.
- 6 new TDD tests (URL emit, no-emit when no queue, RFC 4180 helper presence, sensitive field omission, no-export parser, no-export compiler suppression).
- All 8 core templates compile clean; 2690 of 2690 compiler tests passing.

**Deferred (Phase 2 of the plan, follow-up):**
- Auto-rendered "Download CSV" button in the queue page header. App authors can hand-add a button that calls the URL for now.
- Status filter query string (`?status=pending`).

Plan: `plans/plan-csv-export-primitive-04-27-2026.md`.

---

## 2026-04-27 (overnight) — Snap layer + UAT contract foundation

Two infrastructure landings that compound across every Marcus session.

**Snap layer.** When the AI assistant indicates it's done with a chat turn but the source still has compile errors, a synthetic "fix these N errors" follow-up gets injected automatically and the assistant re-rolls. Up to 3 retries (override `SNAP_MAX_RETRIES`; disable with `SNAP_LAYER_OFF=1`). The user only sees converged output — no half-broken intermediate state. This is the cheap version of grammar-constrained generation: same UX outcome (the assistant appears to never ship broken Clear), 5% of the implementation cost, no model swap. Lives in `playground/snap-layer.js` (pure decision + message-format functions, 18 unit tests) wired into `/api/chat` at the end-of-turn detection point. Telemetry hook is optional-chained — when Factor-DB `logEvent` lands, snap-retry data flows automatically.

**UAT contract.** `compileProgram(source).uatContract` now returns a JSON description of every page, route, button, and API call in the program — the discriminator that test generators walk to know what to assert. Cherry-picked from a 2026-04-27 Codex stash (lives in `lib/uat-contract.js`, 21 unit tests, 8 of 8 core templates produce populated contracts). The deeper browser-test generator that consumes this contract (Playwright runner, screenshot diffing, route assertions) is a follow-up — this commit lands the JSON layer first so future generators have a stable contract to ride on. Known limitation: the queue primitive synthesizes URL handlers at compile time without putting `ENDPOINT` nodes in the AST body, so `hasBackendTarget` reads false on queue-only apps; the contract walker will learn `QUEUE_DEF` in a follow-up.

**New project rule.** "Build Python Alongside JS — No Drift Tax" — any change to the JS backend output requires the Python equivalent in the same commit, plus a cross-target smoke run before merge. Documented in CLAUDE.md as MANDATORY. PHILOSOPHY.md Rule 17 (cross-target parity) is the design principle; this rule is the workflow enforcement.

**Verification:** all 2684 compiler tests still green. 18 new snap-layer unit tests + 21 new UAT-contract unit tests in playground/lib. All 8 core templates compile clean (0 errors) and produce populated contracts.

---

## 2026-04-27 — Queue Primitive (Tier 1): approval flows in one block

`queue for deal:` is now a first-class language primitive. One declaration replaces ~150 lines of hand-rolled JavaScript per Marcus app: audit table, outbound notification queue, filtered queue view, and login-gated URLs for every action — all generated by the compiler.

**What you write:**

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer
  notify customer on counter, awaiting customer
  notify rep on approve, reject
```

**What you get:**

- A `deal_decisions` audit table — `deal_id, decision, decided_by, decided_at, decision_note`.
- A `deal_notifications` outbound queue table — `recipient_role, recipient_email, notification_type, queue_status, queued_at`.
- `GET /api/deals/queue` — filtered by `status = 'pending'`.
- `GET /api/deal-decisions`, `GET /api/deal-notifications` — full history views.
- `PUT /api/deals/:id/<action>` per action — requires login, updates the deal's status to the action's terminal value (`approve` → `approved`, `reject` → `rejected`, `counter` → `awaiting`), inserts an audit row, queues notifications for matching `notify` roles, returns the updated record. Multi-word actions slugify (`awaiting customer` → `/awaiting`).

**What landed:**

- Parser: new `QUEUE_DEF` AST node with reviewer, actions, and notify clauses; helpful errors for `queue for:` (missing entity name) and `queue for deal:` with no `actions:` (suggests the fix).
- Compiler: auto-emitted decisions table, optional notifications table, filtered GET, per-action PUT handlers, auth-gated.
- Validator: warns when a `notify <role>` clause references a role with no `<role>_email` field on the entity (degraded behavior — row is queued with blank email).
- 4 of 5 Marcus apps migrated: Deal Desk, Approval Queue, Onboarding Tracker, Internal Request Queue. Deal Desk shrinks from 172 lines to 121 — same visible behavior plus auth, audit, notifications it didn't have before.
- Lead Router stays hand-rolled — automated routing is a different shape; will get its own primitive (`routing rules for X:`) when a second routing app exists to validate against.

**Test count:** 2671 → 2684 (+13 from the queue primitive cycles). All 8 core templates compile clean.

**Deferred (deliberate, follow-up evidence required):**

- Phase 4 — UI auto-render of action buttons + history table block. App authors hand-add buttons that call the auto-generated PUT URLs.
- Cycle 2.3 — collision detection between user-defined `<Entity>Decisions` table and the auto-generated one. Validator-level safety; will land before the first customer trips it.
- Tier 2 — multi-stage queues (`stage 'X' with reviewer 'Y'` sub-blocks). Gated on a second workflow app being built (likely expense tracker).

Plan: `plans/plan-queue-primitive-tier1-04-27-2026.md`.

---

## 2026-04-26 - Sweep integrity: local wins now feed the flywheel

Local-AI sweeps now separate harness failure from Meph failure. Endpoint wins on the cc-agent/MCP path write through to Factor DB, dead workers are marked as `worker-died`, and `--per-level-stats` exposes which curriculum levels are timing out.

**What shipped:**

- MCP `http_request` verification creates the missing compile row when Meph relies on `edit_code` auto-compile, then marks the successful endpoint check as `test_pass=1`.
- Curriculum sweeps stop sending tasks to a worker after ECONNRESET-style death and mark remaining assigned tasks as skipped `worker-died`.
- Sweep summaries can print level-by-level pass, timeout, stuck, worker-death, failed, and skipped counts.
- Regression tests cover the local-AI Factor DB write-through and dead-worker bucket behavior.

---

## 2026-04-26 - Shell Upgrade Phase 6 docs/curriculum prep: right detail panel

Phase 6 now has its teaching surface before the compiler merge finishes. The canonical form is `detail panel for selected_deal:` with normal content lines and a sticky `actions:` bar for Reject / Counter / Approve.

**What changed:**

- Doc cascade entries added for intent, syntax, AI instructions, user guide, FAQ, features, roadmap, research, and Meph prompt.
- New `deal-with-detail-panel` curriculum task teaches selected-row right rails.
- Roadmap wording stays honest: Phase 6 is the active shell primitive; Phase 7 follows after the Phase 6 compiler/doc/curriculum/eval merge.

Plan: `plans/plan-full-shell-upgrade-04-25-2026.md` Phase 6.

---

## 2026-04-26 - Shell Upgrade Phase 4: stat cards and sparklines

Dashboard KPI rows can now use first-class stat cards instead of hand-built card grids. `stat strip:` wraps the row. `stat card 'Pending Count':` accepts `value`, optional `delta`, optional `sparkline`, and optional `icon`.

**What shipped:**

- New stat-card doc cascade across intent, syntax, AI instructions, user guide, FAQ, features, roadmap, research, and Meph prompt.
- New `kpi-dashboard` curriculum task teaches the exact shell primitive.
- Phase 4 is marked landed; Phase 6 detail panel is the next shell primitive.
- Accounting updated to 168 node types and 2629 compiler tests.

Plan: `plans/plan-full-shell-upgrade-04-25-2026.md` Phase 4.

---

## 2026-04-26 - Shell Upgrade Phase 3: page headers and routed tabs

Main content areas can now use a first-class workbench header and routed tabs. `page header 'CRO Review':` creates the title row with optional `subtitle` and `actions:`. `tab strip:` creates underline-style route tabs with active state from the current path.

**What shipped:**

- New parser support for `page header`, `subtitle`, `actions:`, `tab strip`, `active tab is`, and routed tab rows.
- HTML output now emits stable `data-page-header`, `data-page-header-actions`, `data-tab-strip`, and `data-route-tab` markers.
- Runtime active-state sync follows `location.pathname`, hash changes, and browser history changes.
- Meph/docs/curriculum surfaces now teach the page header + tab strip shape for queue/workbench pages.
- 5 new compiler tests and 1 new chrome smoke check. 2616 -> 2621 passing.

Plan: `plans/plan-full-shell-upgrade-04-25-2026.md` Phase 3.

---

## 2026-04-26 — Shell Upgrade Phase 2: sidebar nav becomes real navigation

The left rail can now be authored directly in Clear instead of faking navigation with styled text. `nav section 'Approvals':` creates a labeled sidebar group. `nav item 'Pending' to '/cro' with count pending_count with icon 'inbox'` creates a linked row with an optional badge, optional Lucide icon, and route-based active state.

**What shipped:**

- New parser support for `nav section` and `nav item`.
- Sidebar output now emits real link rows with `data-nav-item`, `data-nav-path`, counts, icons, and active classes.
- Runtime active-state sync follows `location.pathname`, click changes, hash changes, and browser history changes.
- Meph/docs/curriculum surfaces now teach the explicit nav syntax instead of plain text/link sidebar rows.
- 2 new compiler tests. 2614 → 2616 passing.

Plan: `plans/plan-full-shell-upgrade-04-25-2026.md` Phase 2.

---

## 2026-04-26 — Shell Phase 5: data tables get the polished slate-on-ivory shape

`display X as table` now compiles to a hand-designed-looking table from the same one-line Clear input. Status fields render as `clear-pill-{value}` colored badges. Name / customer / email columns prepend an avatar circle with initials. Numeric money columns are right-aligned with `tabular-nums`. Headers carry `data-sortable` and click-to-toggle `is-sorted`. Rows toggle `is-selected` on click. New `with actions:` block lists labeled action buttons (`'Approve' is primary` / `'Reject' is danger`) rendered as hover-revealed icons in a new rightmost column. Backwards compat: legacy `with delete and edit` shorthand still works. Cell type detection lives in a single runtime helper so future column types are one helper-edit. Click + sort wiring is idempotent. 10 new tests; +10 to `clear.test.js` total. All 8 core templates compile clean.

---

## 2026-04-26 — Lean Lesson 2: shape-search retrieval for canonical examples

Russell asleep. Lean Lesson 2 from `plans/plan-lean-lessons-04-26-2026.md` shipped behind the existing text-match hint pipeline as an additive layer.

**What changed.** Every Meph compile now retrieves canonical worked examples by program SHAPE — archetype + node-type histogram (endpoints, tables, agents, pages, cron, charts, validate, guard, service calls, api calls, websockets) + presence flags (auth, db, charts, agents, realtime, cron, external services) + leading-feature path. Jaccard similarity over a sparse-binary token set; same-archetype gets a +1.0 gate bonus so a real api_service match always out-ranks a cross-archetype match that happens to share keywords.

**Why an additive layer.** Text-match (`querySuggestions`) only fires on compile errors. Half the bad code never errors — it compiles and runs but doesn't match the spec. Shape-search reaches Meph BEFORE the wall, on every compile, by showing him canonical examples that look structurally like what he's writing. Both layers run; combined hint cap stays at 5; the off-arm via `CLEAR_HINT_DISABLE=1` skips both for clean A/B.

**New surfaces.**
- `playground/supervisor/program-shape.js` — `computeShape()`, `shapeTokens()`, `jaccard()`, `shapeSimilarity()` over a parsed Clear program.
- `scripts/match-shape.mjs` — CLI driver and importable `loadCanonicalExamples()` + `matchShape()`. Reads `playground/canonical-examples.md` once per process, caches signatures on the example record so subsequent compiles are microseconds.
- `scripts/match-shape.test.mjs` — 17 tests: feature-vector correctness, Jaccard math, archetype gate, identity match, archetype-match-beats-keyword-match.
- Wired into `playground/meph-tools.js` `compileTool` right after the text-match block. Fires on every compile (success or failure). Output goes into `result.hints.shape_text` + `result.hints.shape_count` + `result.hints.shape_top_archetype` so the observability log can see shape signal independently from text-match.

**Test bump.** `scripts/match-shape.test.mjs` 17/17 new. All 8 core templates compile clean.

---

## 2026-04-26 — Lean Lesson 3: open-capability visibility for Meph

Overnight worker session (Russell asleep). Single focused commit, no API spend, no push.

**Lean Lesson 3 shipped — open-capability surface.** Lean's prover always shows the writer "what's left to prove." Clear today made Meph re-derive that himself from raw test output every cycle. New module `playground/supervisor/open-capabilities.js` collects three sources of "still open" work — TBD placeholders (from Lesson 1's `result.placeholders`), failing tests (from the most recent `clear test` snapshot), and unresolved compile errors (text-matched against the curated INTENT_HINTS canonical-fix table) — into one structured report that gets injected into Meph's per-turn system context BEFORE he writes code. Stays under 200 chars when nothing is open, under 1KB when fully populated. Lives in a separate volatile prompt block so it doesn't invalidate the stable-prefix cache.

**Tests:** 18 unit tests in `playground/supervisor/open-capabilities.test.js` covering the empty case, each of the three sources in isolation, the summary heuristic (errors > failing tests > placeholders priority), and the all-three-at-once integration. All 8 core templates compile clean. Server boots clean.

**Wired into:** `playground/server.js` `buildSystemWithContext` — new optional params `editorSource` and `lastCompileResult`, with belt-and-suspenders try/catch so a malformed compile result never blocks a chat turn.

**Doc cascade:** FEATURES.md (one row), RESEARCH.md (paragraph under flywheel), `playground/system-prompt.md` (tells Meph what the new block means).

---

## 2026-04-26 — Lean Lesson 1: TBD placeholders ship (compiler + test runner + Meph guidance)

Russell asleep, autonomous overnight worker. Lean Lesson 1 phases 1.1–1.4 landed in a single sequence of TDD commits. Phase 1.5 (the $10 measurement A/B sweep) is queued for Russell when he wakes — pure compiler + docs work today, no API spend.

**The pitch.** Lean's `sorry` is the "to be determined" mark in proof assistants — drop it anywhere a proof step belongs and the rest of the file still type-checks. Clear gets the same primitive in plain English: `TBD`. Drop it anywhere a value or a step belongs, the program compiles green, runtime throws "placeholder hit at line N" if execution reaches it, and `clear test` catches that exact error and reports SKIPPED instead of FAILED. Lets Meph (or Russell) leave one piece unfinished and keep iterating on the rest instead of rewriting the whole program.

**Phase 1.1 — grammar.** `tbd` registered in `synonyms.js` (canonical lowercase, source-form `TBD` flows through case-insensitive lookup), `SYNONYM_VERSION` 0.32.0 → 0.33.0. New `PLACEHOLDER` node type in `parser.js`. Statement dispatch entry in `CANONICAL_DISPATCH` so a bare `TBD` line parses cleanly. Expression-position handling in `parsePrimary` so any expression can be a placeholder. Three TDD tests: TBD in expression position, TBD as a standalone statement, TBD inside a function body.

**Phase 1.2 — compiler stub.** `_compileNodeInner` PLACEHOLDER case (statement form) emits `throw new Error("placeholder hit at line N — fill it in or remove it")`. `exprToCode` PLACEHOLDER case (expression form) emits a self-throwing IIFE so any READ of the placeholder explodes with the same message. Both JS and Python backends covered. `compileProgram` walks the AST and exposes `result.placeholders` as `[{ line: N }]` sorted by line. Three TDD tests.

**Phase 1.3 — test runner skip path.** Generated test harness now declares `let passed = 0, failed = 0, skipped = 0`. The `test()` helper's catch block inspects the thrown error: if `err.message` starts with the exact `"placeholder hit at line"` prefix the compiler emits, count as SKIPPED + log "SKIP:". Otherwise count as FAILED + log "FAIL:". Results line reads `X passed, Y failed, Z skipped due to stub`. Skipped tests do NOT trigger a non-zero exit code — partial programs can still ship CI without their own placeholders blocking. Three TDD tests.

**Phase 1.4 — doc cascade + Meph guidance.** Updated `intent.md` (PLACEHOLDER row in expression nodes table), `SYNTAX.md` (canonical TBD section), `AI-INSTRUCTIONS.md` (TBD conventions section), `USER-GUIDE.md` (worked example in Chapter 17 Testing showing skip output), `FEATURES.md` (one row in Core Language table), and `playground/system-prompt.md` (Meph guidance). All documents emphasize: use TBD when the spec is genuinely open, do NOT use it to dodge hard parts, do NOT ship placeholders into production code, skipped tests are not coverage.

**Test bump:** `clear.test.js` +9 from this work (TBD coverage). All 8 core templates compile clean throughout, `placeholders=0` on every template (no false positives on real apps).

**What ships next:** Phase 1.5 measurement when Russell wakes. A/B sweep, 5 curriculum tasks × 5 trials × 2 conditions. ~$10 budget. Decision rules in `plans/plan-lean-lessons-04-26-2026.md`.

---

## 2026-04-25 — Shell Upgrade Phase 1: `app_*` presets get the slate-on-ivory polish

The shell that wraps every app — sidebar + header + main — got the visual overhaul the Marcus-target mock has been calling for. Same Clear source (`section 'Sidebar' with style app_sidebar:` etc.), upgraded compiled output: semantic HTML5 tags, 240px rail, 56px sticky header with brand/breadcrumb/action data slots, slate-on-ivory token palette aligned with `landing/marcus-app-target.html`.

**What shipped:**

- `app_layout` now emits `<div class="flex min-h-screen">` (page owns the scroll, not the layout — was `h-screen overflow-hidden`).
- `app_sidebar` now emits `<aside>` with 240px width, hairline-r border, vertical scroll, slate background tokens.
- `app_main` now emits `<main class="flex-1 min-w-0 flex flex-col">`.
- `app_header` now emits `<header>` at 56px sticky with `data-brand-slot` / `data-breadcrumb-slot` / `data-action-slot` attributes that later phases will use to wire selection state.
- 5 new tests in `clear.test.js`. 2589 → 2594 passing. All 8 core templates compile clean (0 errors).

**Doc cascade:** `intent.md`, `SYNTAX.md`, `AI-INSTRUCTIONS.md` updated with the new emit shapes; `FEATURES.md` and `playground/system-prompt.md` updated this commit. The rest of the cascade (USER-GUIDE.md tutorial, FAQ "where the shell lives", landing page parity) pending since the chunk is small and the visual story is what users care about — chrome stops looking generic and starts looking like a product.

Plan: `plans/plan-full-shell-upgrade-04-25-2026.md` Phase 1.

---

## 2026-04-25 — Decidable Core Path B Phase 1: `live:` keyword lands

Decidable Core started in late April with the minimalist Path A — surgical validator rules + runtime caps that already rejected naked `while` and uncapped recursion (Phase 7 closed 2026-04-24, $0 spent). Path B is the bigger move: a real keyword that names the effect boundary explicitly, so the compiler can prove the rest of the program is total.

Phase B-1 is the foundation: the `live:` keyword exists, parses, and emits. Body holds calls that talk to the world (`ask claude`, `call API`, `subscribe to`, timers). Today it's permissive — anything is allowed inside, code outside isn't restricted — but the fence is now visible to readers and to the compiler. Phase B-2 (separate chunk) adds the validator rule that *requires* effect-shaped calls to sit inside a `live:` fence; once that lands, pure blocks become provably total.

**What shipped:**

- New `LIVE_BLOCK` node type in `parser.js` with a parse function that mirrors `parseTryHandle` (block opener + indented body, empty-body parse error with a fix-it hint).
- `live` keyword registered in `synonyms.js` (single-word, no synonyms — canonical form is `live:`). `SYNONYM_VERSION` bumped to `0.33.0`.
- Compiler case in `compiler.js` emits the body inline with a `// live: block — explicit effect fence` comment marker so the fence is visible in the JS/Python output too.
- Validator handles `LIVE_BLOCK` as a fence, not a scope: variables defined inside leak out to the enclosing scope (consistent with how `try:` treats forward-referenced bindings inside its body).
- 11 new tests in `clear.test.js` under `describe('decidable core — live: block (Path B Phase 1)')`. Cover: parse at top-level / inside endpoint / inside agent, body content propagation, no-op compile, comment marker emit, empty-body parse error, JS-validity check, Python parity, and a "no `live:` block in source = zero regression" guard.
- 2586 → 2597 tests passing (no regressions). All 8 core templates compile clean (0 errors).

**Doc cascade:** `intent.md` (new node-type row), `SYNTAX.md` (new "Live Blocks" section under Error Handling), `AI-INSTRUCTIONS.md` (new subsection under Termination Rules — Meph reads this), `USER-GUIDE.md` (Chapter 14 Effect Fence subsection), `FEATURES.md` (new row in Core Language), `playground/system-prompt.md` (Meph guidance).

**Why this chunk shape.** The `live:` keyword had to land before any validator rule could require effect calls to sit inside one. Splitting Phase B-1 (keyword + parse + emit, permissive) from Phase B-2 (validator rejection of effects outside `live:`) means: zero template migration this commit, zero risk of breaking apps Meph just learned, and the keyword is ready to be tightened in a separate small chunk.

Plan: `plans/plan-decidable-core-04-24-2026.md` Phase B-1.

---

## 2026-04-25 — One-click updates land + Cloudflare Publish wedge complete

The Publish window in Studio is now a real product. Marcus opens the deal-desk app, clicks Publish, and sees a live `*.buildclear.dev` URL. Two minutes later he edits a heading, clicks Publish again, and the new bundle is live in about two seconds — no new database, no domain reattach, no full secret push. That's the wedge: the demo path that turns "I built it locally" into "it's on the internet" with no Docker, no Fly, no terminal.

Two epics finished today, plus a destructive-edit safety story for LAE, plus the app-shell preset upgrade kicked off overnight.

**App shell preset upgrade (overnight phase 1, this commit).** `app_header` now auto-splits children into brand / breadcrumb / action slots, each wrapped in its own div with `data-slot="..."` attributes — heading nodes go to brand, button nodes get right-aligned in action via `ml-auto`, everything else lands in breadcrumb. Combined with the polished slate-on-ivory PRESET_STYLES table (h-screen flex container, w-64 shrink-0 sidebar, sticky-top z-20 header, scrollable main), every dashboard built with `app_*` presets now ships a real product shell instead of stacked divs. 5 regression tests lock the shape in. All 8 core templates: 0 errors. Total tests: 2587.

**One-click updates — Phases 1-6 (this session, this commit cascades the docs).** Plan: `plans/plan-one-click-updates-04-23-2026.md`. Six phases, ~22 TDD cycles, every one green:

- **Phase 1 — tenants schema for version history.** `getAppRecord`, `recordVersion`, `updateSecretKeys`, `markAppDeployed` extended with `versionId`/`sourceHash`/`migrationsHash`/`secretKeys`. Per-app `versions[]` capped at 20 entries (older versions stay queryable on Cloudflare's side via `listVersions`). Lands on both `playground/tenants.js` (in-memory) and the `playground/tenants-postgres.js` mirror (CC-1 cycle 5).
- **Phase 2 — `_deployUpdate` incremental path.** `deploySource` now routes on `mode: 'deploy' | 'update'`. The update path skips `provisionD1`, `attachDomain`, and the full `setSecrets` push (only NEW keys not in `lastRecord.secretKeys` get sent), captures the fresh `versionId` via `_captureVersionId` round-trip to `listVersions`, and calls `recordVersion` instead of `markAppDeployed`. Wall clock ~2s vs ~12s.
- **Phase 3 — schema-change confirm gate.** `migrationsDiffer(oldBundle, newBundle)` byte-compares every `migrations/*.sql` plus `wrangler.toml`. Differences return `{ ok: false, stage: 'migration-confirm-required', migrationDiff: [...] }` from the orchestrator. Re-call with `confirmMigration: true` applies the migration first, then uploads. SQLite has no atomic schema swap, so silently auto-applying mid-update would break in-flight requests; the explicit confirm is the safe default.
- **Phase 4 — `/api/deploy` handler routing + new endpoints.** Handler reads `store.getAppRecord` before dispatching, sets `mode: 'update'` if a record exists, propagates `confirmMigration` flag, surfaces `migration-confirm-required` as `409 MIGRATION_REQUIRED`. New `GET /api/app-info/:appSlug` returns `{ deployed, lastVersion, versions, hostname, scriptName }` so the UI knows which mode to render before the user clicks. New `GET /api/deploy-history/:app` Cloudflare path uses `listVersions` with a tenants-db fallback if Cloudflare is briefly unreachable.
- **Phase 5 — Studio Publish window swaps to "Update" mode.** Modal calls `/api/app-info` on open; if deployed, swaps the heading to "Update *deal-desk.buildclear.dev*", shows last-deployed-at, disables the button when source hash matches the live version ("No changes since last deploy"), shows the schema-change diff + "Apply migration + update" button on `409 MIGRATION_REQUIRED`, and renders a version-aware success message ("Updated to version v-abc-123").
- **Phase 6 — Version history panel + one-click rollback.** `View version history` link inside the Update modal expands a panel listing the last 20 versions. Currently-live version has a "Current" label, all others have a Rollback button. Clicking Rollback calls `POST /api/rollback`, which uses Cloudflare's `/deployments` endpoint via `wfp-api.rollbackToVersion` to flip the live URL (~1-2s wall clock), then writes a tombstone `recordVersion` entry with `note: 'rollback-from-vN'` so the timeline reads chronologically. `VERSION_GONE` errors trigger an automatic refetch + re-render so out-of-band Cloudflare-dashboard deletes don't strand the UI.

**CC-4 wedge complete.** With Phases 1-6 of one-click updates landing on top of the earlier CC-4 cycles 1-7, the Publish path is end-to-end: first deploy provisions everything, every subsequent deploy is the fast update path, and rollback to any of the last 20 versions is one click. ROADMAP item #1 (CC-4) struck through. Demo path is unblocked.

**LAE Phase C — destructive ship safety.** Cycles 4-5 landed today: the destructive ship endpoint requires a typed-confirmation phrase ("I understand — ship and destroy") and audit-first ordering (audit row written `pending` BEFORE the ship attempt; marked `shipped` or `ship-failed` AFTER; ship is REFUSED if the audit append fails). The destructive-edit widget UX wraps the same gate. Compounds the "edit live app" pitch with the GDPR/CCPA/HIPAA accountability surface destructive deletes need.

**Phase 85a operator checklist.** New `LAUNCH.md` at repo root — Russell's five gating items to first paying Marcus customer: register `buildclear.dev`, Fly Trust Verified app, Stripe live keys, Anthropic org key, Postgres provision. Items 1 and 2 unblock items 3-5. Cost ~$15/yr for the .dev TLD plus ~2 hrs of Russell's time.

**Test bump:** No new compiler tests (Phases 1-6 are runtime + Studio + tests in their own suites). `playground/tenants.test.js`, `playground/deploy-cloudflare.test.js`, `playground/deploy.test.js`, `playground/ide.test.js` all green throughout. Eight core templates compile clean. No production-Anthropic API spend on this thread.

---

## 2026-04-25 — Mid-day session: LAE Phase D write path, Ghost defaults to free, MCP descriptions fixed

Same-day session continued from the overnight run. Five small ships, all green, $0 production-Anthropic API spend.

**Flywheel description fix.** MCP tool descriptions for `run_tests`, `list_evals`, `run_evals`, `run_eval`, `db_inspect` lied — they said "Not yet available in MCP mode" while the dispatcher and MCP context were fully wired. Meph in cc-agent mode read those descriptions and skipped the tools, so overnight Ghost sweeps produced zero Factor DB rows. Descriptions now reflect reality. Drift guard added in `mcp-server.test.js` so the next desync surfaces in CI.

**GM-6 — sweep defaults to cc-agent.** `validateSweepPreconditions(env, opts)` now takes `opts.real`. Default behavior: route through cc-agent (no API spend). Pass `--real` to opt back into production Anthropic. Banner announces the default at sweep start. The "I forgot to add `--ghost` and burned $50" failure mode is gone.

**CC-1 stub — `PostgresTenantStore` interface.** Mirrors `InMemoryTenantStore`'s 17-method public surface. Every method throws `NOT_IMPLEMENTED` with the SQL the production version will run, so the future Phase 85a wire-up has a 1:1 shopping list. Contract test verifies surface parity.

**LAE-8 — audit log per app (write path).** `appendAuditEntry()` + `getAuditLog()` on `InMemoryTenantStore`. Append-only, no cap at this layer (Phase C cycle 3 adds the 200-entry cap + status field + `markAuditEntry`). Audit row schema: `{ts, actor, action, verdict, sourceHashBefore, sourceHashAfter, note}`. The accountability surface that destructive ships will write into. 4 new TDD tests. **Phase C plan extended same day** (`plans/plan-lae-phase-c-04-25-2026.md`) and locked in: `DELETE` confirmation verb, 200-row cap, "I understand — ship and destroy" button copy, audit-first ordering (write `pending` row → ship → mark `shipped`/`ship-failed`; refuse the ship if audit append fails).

**Cookies T2#42 marked DONE.** Investigation revealed the JS path is fully shipped: `set cookie` / `get cookie` / `clear cookie` / `set signed cookie` / `get signed cookie` parse + compile, `cookie-parser` auto-wires when any cookie node exists, secure-by-default flags. `requests.md` and the JS/Python feature matrix updated. `AI-INSTRUCTIONS.md` and `SYNTAX.md` got explicit cookie sections so Meph knows the syntax. Python path remains the only open piece (filed as Python-target follow-up).

**Two new plan files.** `plans/plan-lae-phase-c-04-25-2026.md` (7-cycle TDD plan for destructive ships + migration planner, decisions locked in) and `plans/plan-charts-t2-8-04-25-2026.md` (6-cycle plan for donut/scatter/gauge/sparkline — bar/line/pie/area already work).

**Test bump:** `clear.test.js` 2525 unchanged (no compiler changes today). Tenant tests 71 → 75. MCP tests 161 / 0. e2e suite 75 / 75 green throughout.

---

## 2026-04-25 — Overnight: 2 compiler bugs squashed, deal-desk shipped, Compiler Flywheel goes live

Russell asleep. Authorized autonomous run through a queued sequence of bug fixes plus Marcus GTM build-outs. All TDD, $0 API spend (no production-Anthropic sweeps fired). Seven new commits on `main`, all green.

**R7 — `needs login` page guard.** The page-level guard emitted `if (...) { window.location.href='/login'; return; }` at the top of the `<script>` block. `return;` outside a function is a `SyntaxError` that killed the entire script — the SPA router never ran and protected pages rendered as whatever static HTML was at load (commonly blank). Fix: pass the page route through `compileNode` context (`pageCtx.pageRoute`) and emit a route-gated guard with no bare `return;`. Three TDD tests added.

**R8 — `for each` loop body whole-object emit.** The reactive renderer for `for each X in Y:` only handled `CONTENT` and `SHOW` children at the top level. Anything else — most commonly a `SECTION` wrapping the per-row template — was silently dropped, leaving an empty bodyParts array. The fallback then emitted `'<div>' + msg + '</div>'`, which renders as `[object Object]` in the running app. Fix: refactored into `emitChild()` that recurses into `SECTION` and `PAGE` containers; replaced the raw-object fallback with empty string. Two TDD tests.

**Page-route propagation through reactive emit.** Side-fix landed with GTM-1: `flatten()` now tags every leaf node with `_pageRoute` so the reactive emit pass knows what page each node came from. Without this, a `needs login` inside `/cro` compiled with the route from the first declared page (usually `/`). One TDD test in the R7 block locks it in.

**GTM-1 — `apps/deal-desk/main.clear` ships (~170 lines).** The hero asset every Marcus landing page points at: a sales rep submits a discount request, deals over 20% land in a CRO queue gated by login, and the CRO clicks "draft AI summary" to get a one-paragraph approval recommendation with a risk score. Exercises both R7 (`/cro` page guard) and R8 (pending-deals card list). 13/13 app tests pass.

**CF-1 — Compiler Flywheel runtime instrumentation.** Every JS-backend server now emits a `_clearBeacon` helper plus per-request `endpoint_latency` and `endpoint_error` events. Silent no-op unless `CLEAR_FLYWHEEL_URL` and `CLEAR_COMPILE_ROW_ID` are set, so apps deployed without the flywheel pay nothing. Receiver lives at `POST /api/flywheel/beacon` in `playground/server.js` with a per-`compile_row_id` 100-events/sec rate limit; events append to `playground/flywheel-beacons.jsonl` (gitignored). Future session migrates into the Factor DB `code_actions_runtime` table per `plans/plan-compiler-flywheel-tier1-04-19-2026.md`. Five TDD tests. **The Compiler Flywheel begins collecting data the first time `CLEAR_FLYWHEEL_URL` points anywhere.**

**R10 — `checkout` keyword soft-deprecated.** The `checkout 'X':` block emits a JS const named `CHECKOUT_X` that no Clear code can reach — there's no way to write `send back checkout_pro_plan's price` from Clear because that identifier is invented at emit time, not bound to a Clear symbol. Sibling keywords `oauth` and `limit` were removed in 2026-04-21 for the same shape. Validator now emits a deprecation warning steering authors to `create pro_plan_checkout: ...` (a real Clear binding). Three sample apps (`full-saas`, `saas-billing`, `ecommerce-api`) migrated; two of them had ALSO been broken by the prior `limit` removal and now compile clean. Two TDD tests.

**Builder Mode status bar.** Three new chips at the right end of Studio's status bar, polled every 5s: "X/Y ok" (successful/total compiles this session), "▶ :PORT" or "⏹ idle" (whether a compiled app is running), "last ship Xm ago" (cached 30s, reads `git log -1 --format=%ct`). Server-side `_builderState` counters; new `GET /api/builder-status` endpoint.

**R5 — `clear test` runner picks up user `test:` blocks.** ROADMAP entry was stale; verified end-to-end on the deal-desk app. Three regression tests added so future edits can't silently re-break it. ROADMAP struck through with the verification date.

**Test bump:** `clear.test.js` 2509 → 2525. e2e suite 75/75 green throughout. Eight core templates compile clean throughout. No production-Anthropic API spend.

---

## 2026-04-24 — Dave-first wedge: D-1..D-5 shipped (under-review pivot)

Strategic pivot under review (see `ROADMAP.md` → "Strategic pivot under review"): a Dave-first wedge to ship in parallel with Marcus-first work, betting that "the language your coding agent writes without retries" is category creation with CAC ≈ 0 because devs already use agents.

**D-1: Namespaced component calls (`show ns's Card()`) now work.** Fixed the "`ui's Card()` crashes buildHTML" known issue. Unblocks the multi-file module story the rest of D-* depends on. New helper `getComponentCall(expr)` in `compiler.js` detects both bare (`Card(x)`) and namespaced (`ui's Card(x)`) component calls from a single predicate. Four call sites that each did their own shape-check now use the helper. Reactive JS emits `namespace.Card(args)` when the call is namespaced. 3 new regression cycles in `clear.test.js`; all 8 core templates compile clean.

**D-2: Compiler-as-API service on Cloudflare Workers.** `compiler-api/worker.js` + `wrangler.toml` + 12 passing tests. POST /compile wraps `compileProgram()`, supports multi-file via `modules` dict, structured-JSON telemetry, 1MB source cap, permissive CORS. Proprietary compiler stays on servers Russell controls; usage telemetry, per-user gating, instant patches all become possible. Russell deploys with `wrangler deploy` after pasting his Cloudflare account into wrangler.toml.

**D-3: `clear-lsp` zero-dep Language Server.** `clear-lsp/` — stdio JSON-RPC, calls Compiler API for diagnostics (debounced 400ms), local scan for keyword + component + function + page completions. 13 passing tests covering completions, prefix extraction, JSON-RPC framing (single, multi, split-chunk).

**D-4: VSCode + Cursor extension.** `vscode-extension/` thin LSP wrapper. TextMate grammar, language config, manifest with user settings (`clear.compilerApi`, `clear.debounceMs`). 16 structural tests against manifest + grammar + language config. Russell verifies locally with F5 in VSCode (the only manual gate in the chain).

**D-5: `landing/for-developers.html`.** New page (NOT a hero rewrite — Marcus homepage stays as-is). Hero "The language your coding agent writes without retries", side-by-side TS+Cursor vs Clear, 4-metric comparison row, 3-step install (CLI + extension + scaffold), Marcus footer note linking back. Nav link added to `marcus.html`.

**Plus:** `landing/dave.clear` — proof-of-concept one-file landing page written in Clear itself. Shows the language can build its own marketing surface.

**What's still open before D-6 (HN launch):** Russell-only verification gates — `wrangler deploy`, F5-test the VSCode extension, `npm publish` for clear-lsp + clear-cli + the extension, eyeball `landing/for-developers.html`. After those: D-6 unblocked.

**The pivot is under review, not committed.** Marcus-first priorities (CC-1, CC-4, GTM-1 through GTM-7) stay on the roadmap until Russell decides whether Dave-first is the new wedge or just a parallel track.

---

## 2026-04-24 — ROADMAP consolidation backfill

Items that lived inline in `ROADMAP.md` as "DONE" tags. Consolidated here when ROADMAP got rewritten on 2026-04-24 to focus on what's *next*. No new code shipped — this is a paper trail entry so the historical record is complete. Capability surfaces are documented in `FEATURES.md`.

**Performance pass (Session 37)**
- **PERF-1: Pagination by default.** `get all Users` emits `LIMIT 50`. Opt-out with `get every`. Supabase path also gets `.limit(50)`. Every list endpoint is safe by default.
- **PERF-2: Server-side aggregates.** `sum of price from Orders` compiles to `db.aggregate('orders', 'SUM', 'price', {})` → `SELECT SUM(price) FROM orders`. Filtered aggregates: `sum of price from Orders where status is 'paid'` passes the filter to SQL. Dashboards single-query instead of full-table-scan-then-reduce.
- **PERF-3: Search result limits.** `search X for q` slices to 100 matches. Prevents runaway result sets.
- **PERF-4: Virtual scrolling on tables.** `display X as table` calls `_clear_render_table(...)`. Below 100 rows: full render. 100+: fixed-height virtualization (40px rows, 560px container, 5-row buffer). 50,000-row table shows ~24 `<tr>` elements. Browser-verified on 500 rows.
- **PERF-5: Server-side pagination.** `page N, M per page` compiles to `db.findAll('items', {}, { limit: N, offset: (page-1)*N })` → SQL `LIMIT N OFFSET M`. Works for literal page numbers and runtime variables. Supabase already used `.range()` server-side.

**Language completeness (Session 37)**
- **P1: Error throwing.** `send error 'message'` / `throw error` / `fail with` / `raise error`.
- **P2: Finally block.** `try:` ... `finally:` / `always do:` / `after everything:`.
- **P3: First-class functions.** `map_list(items, double)` — pass fn refs as args. Worked natively, confirmed.
- **P5: `clear serve` ESM fix.** `clear build` writes a `package.json` containing `{"type":"commonjs"}` next to the generated `server.js`. Node walks up from `server.js`, finds the sibling, and treats the file as CommonJS — shielded from any parent project's `"type": "module"` setting.

**RL flywheel (Session 38 → 40)**
- **RL-1: Meph runs on Haiku 4.5 by default.** `MEPH_MODEL` env overrides to Sonnet for A/B. 15/16 vs 16/16 on eval-meph; within 6% capability at 3× cheaper. ~$2k saved per 10k-row sweep.
- **RL-2: Step-decomposition labeling.** Every compile row tagged with task milestone (`step_id`, `step_index`, `step_name`). Sweep prints per-step rollup.
- **RL-7: Honest-label tag reliability + inference fallback.** Tightened the system prompt; added server-side inference (no tag + later compile in same turn had fewer errors → log `applied=1, helpful='inferred'`, distinct value so it doesn't pollute honest set). Roughly doubles effective label rate.
- **RL-9: `caller` as canonical magic var + compiler shadow fix.** Renamed authenticated-user var from `current user` → `caller` (legacy synonyms still work). Fixed a compiler bug where bare `user` in backend mode ignored local shadowing and always emitted `req.user` — `send back user` was returning the caller instead of the body. Users-table endpoints can now use `user` as their receiving var.

**Phase 85 — One-click deploy (Session 37)** — already documented at session-level above; mentioned here for cross-reference. Studio → Fly deploy with shared builder + metered AI proxy + tenant/billing layer + cross-tenant isolation. 72 passing tests. External prerequisites (Fly Trust Verified quota, Stripe signup, Anthropic org key, Postgres for tenants DB) still required before first real deploy lands at `buildclear.dev`.

---

## 2026-04-24 — Decidable Core (Session 46): Total by default

Major language-safety pass. Every construct that could previously hang silently now has a bound, and the bound applies on every compile target (Node, Cloudflare Workers, browser, Python) per the new PHILOSOPHY Rule 17.

**Runtime bounds**
- `while cond:` auto-caps at 100 iterations (tight — fail-fast on hallucinated hangs; real usage rarely exceeds it). Override with `while cond, max N times:`. Exceeding the cap throws a legible error, not a hang. Works on JS and Python targets.
- Self-recursive functions auto-wrap in a depth counter (default 1000). JS uses `fnName._depth`, Python uses `getattr(fn, '_depth', 0)`. Non-recursive functions are unaffected (no counter emitted).
- `send email` gets a 30-second default timeout (Promise.race on JS, `smtplib.SMTP_SSL(..., timeout=30)` on Python). Override with `with timeout N seconds/minutes` (parseConfigBlock now recognizes this form).
- `ask claude` / `call api` runtime helpers retry on 429/5xx/network transient errors with 1s/2s/4s/8s exponential backoff. Applied across all 10 emission sites (Node, Cloudflare Workers, browser-proxy, Python `_ask_ai` + `_ask_ai_with_tools`).

**Validator warnings (W-T1/W-T2/W-T3)**
- W-T1: naked `while` → "will stop after 100 iterations. Add 'max N times' if you need more (pagination, state machines)."
- W-T2: function calls itself → "Default depth cap is 1000. Add 'max depth N' to override."
- W-T3: `send email` without `with timeout` → "will use the default 30s cap."
- All three silence themselves when the author declares the bound explicitly.

**Cross-target infrastructure**
- `scripts/cross-target-smoke.mjs`: compiles all 8 core templates × 4 targets, syntax-checks every emission in ~10s. First run surfaced 3 pre-existing Python-target bugs (agent-tools preamble was JS syntax, TEST_DEF emitted JS fetch calls, FUNCTION_DEF didn't auto-detect async when body had `await`) — all three fixed in the same branch.
- New PHILOSOPHY Rule 17 ("Safety Properties Are Cross-Target") + Rule 18 ("Total by default, effects by label") codify the principles driving this work.
- New RESEARCH.md section on cross-target emission verification as a $0 deterministic eval (gate, not training signal).

**Tests**
- 14 new cases in `clear.test.js` under `describe('Termination bounds (Session 46 — Total by default)')` and `describe('AI helpers — exponential-backoff retry')`. Lock in the emission shape + warning firing/silence paths.

**Findings along the way**
- Factor DB check (1,599 Meph rows) showed `while` / `send email` / recursion have NEVER appeared in Meph output. The safety pass is preventive, not reactive — justified by the "compiler-as-capital-investment" framing: compute is cheap, foot-guns eliminated now compound across every future program forever.

---

## 2026-04-24 — Cookie maxAge shorthand `for N days/hours/minutes` (T2 #42 continuation)

Tiny fix for a tiny bug. The original cookies parser had a `for N days` scan hooked up but checked `tokens[k].canonical === 'for'` — which never fires because `for` canonicalizes to `for_target` in the synonym table. Result: `set cookie 'session' to token for 7 days` parsed but dropped the TTL silently.

Fix: check both canonical `for_target` and raw lowercased value `for` (belt-and-suspenders against future synonym changes).

```clear
set cookie 'session' to token for 7 days         # maxAge: 604800000
set cookie 'remember_me' to flag for 30 days     # maxAge: 2592000000
set cookie 'flash' to msg for 30 minutes         # maxAge: 1800000
```

Also works for signed cookies: `set signed cookie 'session' to token for 7 days`.

2 new tests: days conversion + hours/minutes unit conversion. 2486 → 2488 green, 8 templates clean.

---

## 2026-04-24 — Signed cookies (T2 #42 continuation)

`set signed cookie 'name' to value` + `get signed cookie 'name'` — HMAC-signed cookies via `cookie-parser(secret)`. Only wired when the program actually uses signed cookies (no dead code on plain-cookie-only apps).

- Parser: extended the `set cookie` path to detect `set signed cookie 'name' to value` and set `signed: true` on the COOKIE_SET node. Similarly for `get signed cookie 'name'` in parsePrimary.
- Compiler: `res.cookie(name, value, { ..., signed: true })` for set; `req.signedCookies[name]` for read; module-top emits `const _COOKIE_SECRET = process.env.COOKIE_SECRET` + a runtime `console.warn` if the env var is unset so deployers don't ship apps with an ephemeral fallback secret. `app.use(cookieParser(_cookieSecretResolved))` replaces the plain `cookieParser()` call when signed cookies exist.

Secret policy: require `COOKIE_SECRET` env var at deploy time; runtime warns loudly if unset and generates an ephemeral per-process fallback. Deliberate choice: fail loud rather than fail silent. Reading a signed cookie with the wrong secret returns `false` (cookie-parser's standard behavior), which lets `if X is nothing:` guards flow correctly.

```clear
when user calls POST /api/login receiving creds:
  set signed cookie 'session' to creds's token
  send back 'ok'

when user calls GET /api/me:
  token = get signed cookie 'session'
  if token is nothing:
    send back 'not logged in' with status 401
  send back token
```

3 new tests: signed emit + cookieParser(secret) wiring, signedCookies read, runtime secret-missing warning. 2483 → 2486 green, 8 templates clean.

---

## 2026-04-24 — Python upsert parity + `clear cookie 'name'` follow-ups

Two small follow-ups on last session's features.

**Python `upsert X to Y by <field>`** — mirrors the JS emit. `db.query_one` by match field, `db.update(table, var)` on hit (preserving id via `var["id"] = _existing["id"]`), `db.save(table, var)` on miss. Source variable mutated via `.update()` so `send back X` returns the canonical record either way. Closes the Python half of T2 #47.

**`clear cookie 'name'`** — emits `res.clearCookie(name, { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })` with the same posture as set, so browsers agree the cleared cookie is the one earlier set. Also triggers cookie-parser auto-import for apps that only clear (e.g. a logout endpoint). Python: TODO comment.

Tests added: 3 new (1 Python upsert + 2 clear-cookie). 2480 → 2483 green, 8 templates clean.

---

## 2026-04-24 — Scroll handler with throttle: `on scroll every 100ms:` (TIER 2 #33)

First-class scroll event handler. Optional `every N ms` / `every N seconds` suffix adds leading-edge throttle:

```clear
on scroll every 100ms:
  load_more_if_near_bottom()

on scroll:         # no throttle
  track_position()
```

Parser: new `on_scroll` canonical with synonyms `on page scroll`, `on page scrolls`, `when page scrolls`, `when user scrolls`. Handler reads optional `every N (ms|seconds)` suffix into `throttleMs`.

Compiler (reactive-web): `window.addEventListener('scroll', fn, { passive: true })` + inline leading-edge throttle via `lastFire` timestamp. `isReactiveApp` now treats ON_SCROLL as a trigger so the reactive pipeline fires even when the page has only a scroll handler.

4 new tests + regression floor on passive:true perf flag. SYNONYM_VERSION bumped 0.31.0 → 0.32.0. 2476 → 2480 green, zero regressions, 8 templates clean.

Closes TIER 2 #33.

---

## 2026-04-24 — Transaction synonyms: `atomically:` / `transaction:` / `begin transaction:` (TIER 2 #48)

Canonical `as one operation:` was the only transaction form that parsed. Three natural English alternatives that Meph (and humans) reach for added as synonyms — all route to the same `NodeType.TRANSACTION` node, identical semantics:

```clear
atomically:
  subtract amount from sender's balance
  add amount to receiver's balance

transaction:
  ...

begin transaction:
  ...

as one operation:    # canonical — still works
  ...
```

Parser: three new keyword handlers (`atomically`, `transaction`, `begin` + next-token check for `transaction`). Compiler untouched — same TRANSACTION emit covers all four forms.

4 new tests + regression floor on canonical. 2472 → 2476 green, zero regressions, 8 templates clean.

Closes TIER 2 #48.

---

## 2026-04-24 — Upsert: `upsert X to Y by <field>` (TIER 2 #47)

Genuinely missing syntax. The canonical workaround was `look up X where email is Y's email` → `if X is nothing: save Y as new Y else save Y to Y`. Ugly and easy to get wrong.

New: `upsert profile to Users by email` — one statement. Parser: new `upsert` keyword handler builds a CRUD node with `operation='upsert'` + `matchField='email'`. Compiler: emits findOne by match field → if exists, update preserving id + re-fetch; else insert with `_pick` mass-assignment protection. Either path uses `_clearTry` for consistent error wrapping.

```clear
when user calls POST /api/users receiving profile:
  upsert profile to Users by email
  send back profile
```

The source variable gets updated via `Object.assign` so `send back X` returns the canonical record either way — callers don't need to branch on insert-vs-update.

4 new tests: findOne emission, update-branch id preservation + re-fetch, insert-branch mass-assign protection, non-email match field. 2468 → 2472 green, zero regressions, 8 templates clean.

Closes TIER 2 #47. Follow-ups: Cloudflare D1 upsert path, Python backend parallel emit, `save X to Y or update by email` alias.

---

## 2026-04-24 — Field projection: `pick a, b from X` (TIER 2 #44)

Missing syntax — requests.md asked for `transform X to include only a, b`. Shipped a cleaner expression form: `pick a, b, c from X` returns a new record (or list of records) with only those fields.

Polymorphic at runtime: `Array.isArray(X)` branches to `.map(r => ({ a: r.a, b: r.b }))` for lists or `{ a: X.a, b: X.b }` for single objects — callers don't need to know the shape. Python backend emits the dict-comprehension equivalent.

Usage:
```clear
slim_items = pick id, name, price from all_items   # list → list of slim records
safe_user  = pick id, name, email from user        # record → slim record (mask password)
```

Parser: new PICK node-type + parsePrimary branch that reads field names until `from`, accepts comma + `and` separators. Compiler: both JS and Python backends.

4 new tests: list projection strips unwanted fields, single-object projection, `and`-separator, Python dict-comp output. 2464 → 2468 green, zero regressions, 8 templates clean.

Closes TIER 2 #44.

---

## 2026-04-24 — Cookies — `set cookie` / `get cookie` on JS backend (TIER 2 #42)

Cookies were genuinely missing. `req.cookies` was always undefined because `cookie-parser` wasn't wired; `res.cookie` was unreachable from Clear source. Auth-via-cookie flows had to use raw `script:` escapes.

**Fix (JS backend):** two new node types, `COOKIE_SET` and `COOKIE_GET`. Canonical syntax:

```clear
set cookie 'session' to token
maybe_session = get cookie 'session'
```

Parser: `set cookie 'name' to value` routes in the `set` keyword handler; `get cookie 'name'` is a parsePrimary extension that runs before the `get_key ... from` dynamic-map path so it doesn't get eaten. Compiler: `res.cookie('name', String(value), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })` + `req.cookies['name']` reads. `cookie-parser` middleware auto-imported + installed ONLY when cookies are used — no dead code on apps that don't touch them.

**Secure-by-default:** httpOnly blocks JS-readable session cookies (mitigates XSS session theft). sameSite='lax' blocks cross-site POST (mitigates CSRF). secure is gated on NODE_ENV so local HTTP dev still works. Not signed by default — keep it simple; can add `set signed cookie 'name' to value` later.

**Python backend:** emits a TODO comment, not an error. Full Python parity needs Response dependency-injection in the endpoint signature — tracked as follow-up.

5 new tests: middleware auto-import, res.cookie emission with all security defaults, req.cookies read, no-dead-code negative case, variable-value support. 2459 → 2464 green, zero regressions, all 8 core templates compile clean.

Closes TIER 2 #42 for the JS path.

---

## 2026-04-24 — `display X as bar chart` shorthand (TIER 2 #8)

Meph kept writing `display sales as bar chart` expecting it to render a chart — natural English for "show this as a bar chart." The parser accepted the line (it looked like `display X as <format>` with format=bar), but the compiler had no `bar` display format, so nothing was emitted. No ECharts CDN, no chart DOM, no `echarts.init` call. Worst kind of silent drop — chart-less dashboards with zero compile errors.

**Fix:** parseDisplay now detects `as <type> chart` at the `as_format` position and rewrites to a CHART node identical to what the canonical `bar chart 'Title' showing X` produces. Supports bar/line/pie/area. Title defaults to the capitalized variable name (`sales` → `"Sales"`). Unknown chart types (`as neon chart`) emit a helpful error listing valid types instead of silently falling through.

6 new tests in `` `display X as bar chart` shorthand parses as CHART ``:
- Bar, line, pie, area all emit ECharts CDN + chart DOM
- `show X as line chart` (show synonym) works too
- Canonical `bar chart 'Title' showing data` unchanged (regression floor)
- Unknown chart type errors instead of silently dropping
- `as json` / `as dollars` / `as date` / `as percent` still route to DISPLAY (not captured by the shorthand)

2453 → 2459 tests green, zero regressions, all 8 core templates compile clean. Closes TIER 2 #8.

Per Russell's directive: "if errors meph does should be features, edit the compiler too." The shorthand is the feature; the silent-drop was the bug.

---

## 2026-04-24 — `table X:` shorthand + ASH-1 tool-allowlist config

Two things in one commit because they surfaced from the same Meph session triage.

**Language feature — `table X:` shorthand.** Meph kept writing `table Sales:` (no `create a` prefix) expecting it to parse as a table declaration, because `table` is already listed as a synonym for `data_shape` in synonyms.js. It didn't work — the parser only wired `create a X table:` into `parseDataShape`, and the bare `table X:` lead fell through to assignment parsing. Which then errored on fields like `amount is number` because `number` wasn't defined. Russell's call: this isn't a misuse, it's a missing language feature — fix the compiler.

Added a `data_shape` keyword handler in parser.js that routes `table X:` to `parseDataShape`. Both field forms (`price, number` and `price is number`) already worked inside the block; they just never got reached because the block wasn't recognized. Now `table Users:` + `amount is number` + `name, text, required` all compile clean. Five new compiler tests lock the shorthand in as a first-class form alongside the canonical `create a Users table:` and the long form `create data shape User:`.

Docs updated: SYNTAX.md new "Table shorthand" section listing all three equivalent forms + both field forms. AI-INSTRUCTIONS.md "Data Tables" section expanded with the three-forms block + two-field-forms block.

**ASH-1 infrastructure — `GHOST_MEPH_CC_ALLOWED_TOOLS` env var.** Prep for the Agent Self-Heal A/B sweep queued in HANDOFF.md. `buildClaudeStreamJsonSpawnArgs` now takes an optional `allowedTools` param and also reads `GHOST_MEPH_CC_ALLOWED_TOOLS` from env, so the sweep runner can flip between `""` (MCP-only baseline) and `"Bash,Read,Edit,Write"` (ASH-1 treatment) without patching the cc-agent spawn code. Default stays `""` so existing behavior and Factor DB instrumentation are unchanged. 3 new tests cover param-wins-over-env, env-overrides-default, and default-stays-empty.

2448 → 2453 tests green, zero regressions, all 8 core templates compile clean.

---

## 2026-04-24 — Friction batch 2b: type-keyword INTENT_HINTS (items #6 + #7)

Factor DB friction ranking items #6 (`text`) and #7 (`number`) were both the "You used X but it hasn't been created yet" error firing on type keywords. Root cause from reading real sessions: Meph writes `amount is number` inside a table block thinking `is` is a type annotation, but Clear reads `is` as assignment — so `number` gets treated as an undefined variable. Same pattern for `text`, `boolean`, `timestamp`.

**Fix:** four new entries in `validator.js` INTENT_HINTS. Each tells Meph the canonical comma-form field declaration AND when relevant the value-usage alternative:

- `number` → `amount, number, required` (comma form); assignments use literals like `amount = 5`
- `text` → `title, text, required` (comma form); values use quoted strings like `title is 'Welcome'`
- `boolean` → `active, boolean` (comma form); values use `true` / `false` literals
- `timestamp` → `created_at, timestamp` (comma form); auto-fills on insert

5 new tests in `INTENT_HINTS — type keywords used as if they were values` — each type hint validates its message content PLUS a regression test that the canonical comma form still compiles clean. 2443 → 2448 tests green, zero regressions, all 8 core templates compile clean.

Friction-driven like batch 1 and 2: picked the next-highest-cost errors from the ranker, didn't invent new syntax. Each entry is a ~1-line hint that ships globally forever at \$0.

---

## 2026-04-24 — Regression net on compile-tool-source-on-error (TIER 2 #12)

Audit of T2#12 (compile tool returns no source on error) found the fix was already in place at `playground/meph-tools.js:1234` — `const wantCompiled = r.errors.length > 0 || input.include_compiled === true`. Meph gets `javascript` / `serverJS` / `html` / `python` (truncated to 4-8KB each) auto-embedded whenever errors exist, plus a `note` field explaining why.

But there was no REGRESSION TEST locking that contract in. The existing suite tested `include_compiled=true` on a clean compile, but not the "errors → auto-include" auto-behavior. One refactor aimed at token-cost reduction could have silently stripped the auto-embed and Meph would have gone blind on errors again.

Added two assertions to `playground/meph-tools.test.js`:
- Failing compile (undefined variable) → compile result MUST include `javascript` or `serverJS` in the returned JSON
- The `note` field MUST mention "errors" when auto-embed fired

Moves T2#12 from "open" to "done" with the regression floor in place. Nothing else shipped — the compiler and tool weren't touched.

---

## 2026-04-24 — Friction batch 2: auth-capability gate on mutation security check

Session 45 friction data showed the "DELETE/PUT needs `requires login`" security error accounted for 25 rows and ~50% give-up rate (items #2 and #5 on the ranked list). Root cause surfaced from reading real Meph sessions: the apps were toy K/V stores with NO auth set up at all — no Users table, no `allow signup and login`. The validator was demanding `requires login`, which needs a user system to check against, in programs that had none. Meph had no valid move.

**Fix:** auth-capability gate. The mutation-needs-auth check now branches on whether the program has auth capability (`allow signup and login` declaration OR a Users table with a password field):

- **Auth capability present** → unchanged hard error on each DELETE/PUT missing `requires login`. The check still catches real auth bugs.
- **No auth capability** → per-endpoint errors are batched into ONE advisory warning at the top of the file, naming every public mutation endpoint by path and line, and telling Meph exactly how to upgrade to a hard error (add `allow signup and login`) or acknowledge the public-by-design case.

Before the fix, an auth-less 3-endpoint toy K/V store emitted 3 hard errors Meph couldn't resolve. After: 0 errors, 1 advisory warning listing all three — program compiles clean.

5 new tests in `Security - auth-capability gating on mutation endpoints`: auth-less compiles clean, auth-scaffolded still errors (regression floor), Users+password still errors (capability via table), multi-endpoint summary warning, warning names every path + points to the fix. 2438 → 2443 tests green, zero regressions, all 8 core templates compile clean.

This is a friction-driven fix: the Factor DB's top-5 script ranked it #2 and #5 combined. One rewrite shipped globally forever at \$0.

---

## 2026-04-24 — Multipart file upload server middleware (TIER 2 #15)

The client half of file upload already worked: `upload X to '/api/foo'` emitted `FormData` + `fetch` POST. The server half didn't. Any endpoint that received the multipart request saw `req.body = {}` because only `express.json()` was wired — `multipart/form-data` went unparsed, the handler got nothing, the file vanished silently.

**Fix:** auto-detect uploads anywhere in the AST (`UPLOAD_TO` or `ACCEPT_FILE` nodes, including deep-nested cases like `page > button > body > upload_to`). If any upload exists:
- `const multer = require('multer')` + `const _upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } })` emitted at module top
- Upload target URLs collected into a `uploadUrls` Set, passed through ctx
- POST endpoints whose path appears in `uploadUrls` get `_upload.any()` injected as middleware: `app.post('/api/upload', _upload.any(), async (req, res) => {...})`
- Endpoints not matched stay clean — plain JSON POSTs are untouched, so `express.json()` parsing keeps working

Memory storage (not disk) is the default: files arrive as `req.files[i].buffer` — avoids `/tmp` permission issues, EPIPE on full disks, and the "where do files live in production?" footgun. Callers needing disk storage can override.

6 new compiler tests: import presence, shared `_upload` instance, middleware wiring on matching POST, **negative case** (non-upload POST endpoints stay clean), **no dead code** (no multer import when no uploads exist), and body-guard preservation (the `typeof req.body !== 'object'` check stays — multer populates `req.body = {}` for multipart-only requests, so the guard never false-positives).

2432 → 2438 tests green, zero regressions, all 8 core templates compile clean, emitted JS syntax-checks. Closes TIER 2 #15.

---

## 2026-04-24 — Scheduled-task cancellation (TIER 2 #13)

Every Clear app with `background`, top-level `cron`, or `agent ... runs every` shipped with anonymous timer handles. SIGTERM closed the HTTP server but `setInterval`/`setTimeout` loops kept running — which meant the Node process refused to exit, production deploys waited for the 30s grace-period kill, and local `ctrl-c` required a second press.

**Fix:** unified `_scheduledCancellers = []` registry at module top (emitted only when the program actually has scheduled work — no dead code otherwise). Every emit site captures its timer in a named variable and pushes a zero-arg cancel closure:

| Pattern | Handle | Canceller |
|---------|--------|-----------|
| `background ... runs every X` | `setInterval` | `() => clearInterval(_job_X)` |
| `every X minutes:` (top-level cron) | `setInterval` | `() => clearInterval(_cron_int_X_min)` |
| `every day at 9am:` (HH:MM cron) | recursive `setTimeout` (re-armed on each `_tick`) | `() => clearTimeout(_curTimer)` — closes over a mutable var, so it always cancels whichever timer is armed right now |
| `agent ... runs every X` | `setInterval` | `() => clearInterval(_interval_fnName)` |
| `agent ... runs every X at Y` | `node-cron` | `() => _cron_fnName.stop()` |

Both `SIGTERM` and `SIGINT` now drain the registry before `server.close()`. SIGINT parity means ctrl-c in local dev exits on the first press.

7 new compiler tests assert: registry declaration, canceller push, SIGTERM/SIGINT drainage, negative case (no registry when no scheduled work), and closure semantics for the HH:MM recursive-setTimeout case. 2432 tests total green, zero regressions, all 8 core templates compile clean. Closes TIER 2 #13.

---

## 2026-04-24 — Python `belongs to` JOIN emission fixed (TIER 2 #9)

Silent bug shipped in a single session: Python apps with `belongs to` FK fields compiled to code that returned disconnected rows at runtime. Two distinct failures, both fixed, both covered by new tests.

**1. Schema typo: `REFERENCES userss(id)`.** The Python schema emitter naively appended `s` to the lowercased FK target — `Users` → `users` + `s` = `userss`. The referenced table never existed, so SQLite silently ignored the FK constraint. JS did this correctly via `pluralizeName` all along. Fix: use `pluralizeName(f.fk)` in the Python path too (compiler.js:5735).

**2. No FK stitching on read.** Python's `get all Posts` compiled to `db.query("posts")` and stopped. No loop to swap the FK id for the referenced record. The user got `{author: 1}` when they expected `{author: {id: 1, name: "Alice"}}`. The JS path has had this loop forever via `ctx.schemaMap.fkFields`, but the Python backend ctx never received `schemaMap` at all. Fix: populate `pySchemaMap` alongside `pySchemaNames` in the Python compile entry (compiler.js:12196), then mirror the JS stitching loop in the Python lookup branch (compiler.js:4200).

**User-visible outcome proven with runtime smoke** (temp-py-stitch-smoke.py):
```python
# Before: {'title': 'hello world', 'author': 1, 'id': 1}
# After:  {'title': 'hello world', 'author': {'name': 'Alice', 'id': 1}, 'id': 1}
```

5 new tests added to clear.test.js covering: `REFERENCES` pluralization correctness (double-s regression floor + -es plural + singular-needs-pluralize), Python stitching loop emission, and negative-case (no FK → no loop). 2426 compiler tests green, all 8 core templates compile clean, zero regressions.

Landed in a single commit on `fix/belongs-to-python-joins`. Closes TIER 2 #9.

---

## 2026-04-23 evening — Session 44 three-track push (research A/B + LAE hardening + LAE Phase B scaffolding)

9 commits on `feature/research-ab-tooling` (pushed to origin; merge to main pending Phase B 3.3+3.4+4-6). Three simultaneous tracks in one long session: close the hint-effect measurement gap, production-harden Live App Editing Phase A, and build 60% of the cloud-shipping path for Phase B.

### Track 1 — research A/B: hints measurably lift CRUD pass rate

First empirical proof the re-ranker is load-bearing. 40-trial paired sweep (counter L3 + todo-crud L4, 10 trials per condition per task, cc-agent on the Claude subscription, $0). Result:

| Task | hint_on | hint_off | Lift | avg_on | avg_off |
|------|---------|----------|------|--------|---------|
| counter (L3) | 8/10 (80%) | 8/10 (80%) | +0.0 pp | 157s | 157s |
| todo-crud (L4) | **10/10 (100%)** | 7/10 (70%) | **+30 pp** | **83s** | 115s |

CRUD shows +30 percentage points AND ~28% faster avg trial time. Single-endpoint counter shows flat — hints only earn their keep on error-rich archetypes. Full writeup with methodology, mechanism, and follow-up experiments in `RESEARCH.md` Session 44 evening section.

Supporting infrastructure shipped for the A/B:
- **Per-session NDJSON transcript persistence** — every cc-agent turn appends its raw claude stream-json to `playground/sessions/<session-id>.ndjson` with a turn-marker envelope. Replaces the GHOST_MEPH_CC_DEBUG tmpdir overwrite. Unlocks deterministic replay of any trial against alternate ranker/prompt/hint configurations at $0. (`8c53be1`)
- **CLEAR_HINT_DISABLE=1 env flag** — short-circuits the entire Factor DB retrieval block in meph-tools.js compile tool. Keeps the hint-off A/B arm at zero DB-query cost so measurement is hint *effect*, not hint *compute overhead*. (`8c53be1`)
- **AB sweep runner** — `playground/supervisor/ab-hint-sweep.js` with pure `expandTrials` + `summarizeAbResults` + `formatSummaryTable` helpers (17 test assertions). Spawns workers with the right env, interleaves trials, writes an audit-trail JSON artifact. (`6b6691b`)

### Track 2 — LAE Phase A production hardening

Closed the April-18 Security TODO that let anyone forge an `{"role":"owner"}` JWT and pass the live-edit owner gate. `liveEditAuth` in `playground/server.js` now runs every Bearer token through `verifyLegacyEvalAuthToken` — constant-time HMAC-SHA256 comparison via `crypto.timingSafeEqual`, expiry enforcement, rejection for every malformed shape (null, empty, 1-part, 3-part, non-string, signed-non-JSON-payload). 13 new assertions lock the contract.

Also dropped `owner is 'owner@example.com'` into todo-fullstack, crm-pro, blog-fullstack. Before this, the compiler emitted the widget tag but no template declared an owner, so the widget was never actually visible in any demo. Now Marcus can open a template, log in as owner, see the widget immediately. (`39f2f0e`)

### Track 3 — LAE Phase B cloud shipping scaffolding

Wrote the lean Phase B plan at `plans/plan-live-editing-phase-b-cloud-04-23-2026.md` (187 lines, 6 phases, 16 cycles) cherry-picking cloud mechanics from the one-click-updates plan. Executed Phases 1-3:

- **Phase 1 — tenants-db versions** (`a0b45ea`). `InMemoryTenantStore` grew `getAppRecord`, `recordVersion`, `updateSecretKeys` + `markAppDeployed` extended to seed `versions[]` with `secretKeys: string[]`. MAX_VERSIONS_PER_APP=20 with oldest-trim on insert. Security invariant: stores key NAMES only, never values. 40 new assertions across cycles 1.0-1.5.
- **Phase 2 — deploy-cloudflare mode:update** (`b34ebfb`). `deploySource({mode:'update'})` routes to a new `_deployUpdate` helper that skips provisionD1/applyMigrations/attachDomain (permanent setup from first deploy), runs a filtered setSecrets (only keys not already in lastRecord.secretKeys), uploads the new script, resolves the versionId via `_captureVersionId` (fast-path uses uploadScript response; slow-path calls listVersions + newest-by-created_on), appends to versions via `recordVersion`. 10 new assertions including via-tag forwarding and DeployLockManager coverage.
- **Phase 3 partial — applyShip cloud routing** (`9bd91f5`). `lib/ship.js` detects cloud-deployed apps via `io.getCloudRecord` + `io.shipToCloud` hooks; when both present AND getCloudRecord returns non-null, short-circuits local write/compile/spawn and delegates to shipToCloud. Safe defaults: any missing hook falls through to existing local path. 5 new assertions + regression floor.

Studio-side wiring (Phase 3 cycles 3.3-3.4: thread `tenantSlug + appSlug + store + deployApi` through applyShip closure) and widget Undo UX (Phase 4) deferred to next session.

### Numbers (mid-session)

2399 → 2408 compiler tests (Phase 3 lib/ship.test.js additions). 75 new test assertions across eval-auth, tenants, deploy-cloudflare update-mode, ab-sweep helpers, ship cloud routing. 0 regressions.

### Later-in-session work (A/B completed, friction-fix + Phase B completion)

After the background A/B finished (40 trials, 85.6 min wall-clock, result: todo-crud +30pp pass-rate lift with hints on, counter flat 80%/80%), executed four additional commits that close the "push Phase B to completion" loop:

- **`0f75a0f` RESEARCH.md Session 44 writeup** — full methodology + mechanism + three follow-up experiments (5-task expansion, tier attribution via replay, L5-L7 harder-archetype sweep).
- **`878bcf9` ROADMAP + friction tool** — SK-5/6/7/8 new research threads (self-play synthetic tasks, tiny model distillation, test-time compute scaling, safety-by-construction paper); updated OL-3 "error-message learning loop" from Idea to In-progress. Shipped `scripts/top-friction-errors.mjs` — mines Factor DB for top-friction compile errors by Meph-minutes-burned. First run surfaced the key finding below.
- **`08866da` friction-score fix — top 4 errors rewritten in one commit**. Factor DB analysis showed 7 of the top-10 highest-friction errors were the SAME "you used X but X hasn't been created yet" message mis-firing on reserved words and Clear-specific keywords. One validator rewrite fixes 4 of them at once: reserved structural words (`the`, `of`, `in`, etc.) now get a specific "reserved structural word" message; `body`, `remember`, `calls` now redirect to their canonical forms via INTENT_HINTS. Compiler tests 2408 → 2413.
- **`f1120d5` Phase B cycles 3.3 + 3.4 — cloud ship wiring end-to-end**. `lib/edit-api.js` threads `{tenantSlug, appSlug}` from POST body through as cloudContext; `playground/deploy.js` exports `getDeployDeps()` so sibling modules share the singleton store + WfpApi; Studio's applyShip closure now routes widget-Ship to `deploySourceCloudflare({mode:'update', via:'widget'})` when the app is cloud-deployed. Compiler tests 2413 → 2415.
- **`dfb007e` Phase B Phase 4 cycle 4.1 — cloud rollback endpoint + Studio wiring**. New `/__meph__/api/cloud-rollback` route + `applyCloudRollback` closure that calls `rollbackToVersion` on Cloudflare and records a `widget-undo-to-<hash>` version so history stays linear. Error codes: CLOUD_NOT_CONFIGURED / NOT_DEPLOYED / VERSION_GONE / ROLLBACK_FAILED. Compiler tests 2415 → 2421.
- **`f171c24` Phase B cycle 4.2 — widget JS cloud routing**. `runtime/meph-widget.js` reads a `<meta name="clear-cloud">` tag at load; when present, Ship forwards slugs (cloud path), Undo calls cloud-rollback instead of snapshot-restore, VERSION_GONE surfaces a specific error message. Progressive — missing tag is safe-default local (Phase A unchanged). Widget syntax-checks clean; compiler meta-tag emission is cycle 4.2b for next session.

### Session-wide numbers (final)

- **15 commits** on `feature/research-ab-tooling` (pushed to origin, ready for main merge)
- **Compiler tests: 2399 → 2421** (+22)
- **Helper suite:** 40 new tenants assertions, 10 new deploy-cf update-mode assertions, 5 new ship cloud-routing assertions, 13 new eval-auth assertions, 17 new ab-sweep helpers assertions, 8 new cloud-rollback assertions, 11 new transcript-persistence assertions, 5 new hint-disable assertions, 5 new keyword-misuse assertions. **~125 net new assertions across the evening.** 0 regressions.
- **Shipped: \$0 in API spend.** A/B ran on the Claude subscription via cc-agent.
- **A/B result:** todo-crud +30pp pass-rate lift (100% vs 70%), avg trial time −28% (83s vs 115s). First empirical proof the re-ranker's hints lift live pass rate. counter L3 flat at 80% as expected (no error-rich surface).
- **Flywheel progress:** Factor DB 1686 → 1722 rows (+36), 634 → 667 passing (+33).
- **Friction-fix impact projection:** 4 of top-10 errors replaced with targeted messages. If those four classes were burning ~860 Meph-minutes (sum of friction scores = 300+211+181+91 for remember, or ~783 for the four we fixed), expected Meph-minutes saved per future sweep is proportional. Compiler accumulates quality literally.

---

## 2026-04-22 — GM-2 refactor finish + cc-agent tool mode + meph-helpers extraction

13 commits on `feature/gm-2-tool-use-rest` (not merged to main yet — Russell reviews first). The "Ghost Meph cc-agent with tools" architecture lands in three layers: every Meph tool lives in one module behind one dispatcher, the MCP server exposes them all to Claude Code, and cc-agent.js can spawn Claude Code with MCP configured to translate stream-json events back into Anthropic SSE for /api/chat. Opt-in via `GHOST_MEPH_CC_TOOLS=1` until Russell validates the stream-json format against his real `claude` CLI.

### GM-2 refactor — every tool ported, executeTool extracted (9 commits)

Started the session at 21/27 tools ported. Finished with 28/28 plus the full `executeTool` switch extraction.

- **screenshot_output** — Playwright page + running-port through MephContext callbacks (`getPage`, `getRunningPort`). Deleted the dead `__ASYNC_SCREENSHOT__` marker and the loop's inline screenshot special-case. Commit `69a075c`.
- **run_app** — subprocess spawn + port allocation + build-output materialization. MephContext grows `getRunningChild` / `setRunningChild` / `allocatePort` lifecycle callbacks. Commit `4b3dc26`.
- **run_tests** — stdout parsing via injected `parseTestOutput`. MephContext grows `apiKey` field. Commit `c0556a3`.
- **run_evals + run_eval** — tiny wrappers around `runEvalSuite`. Per-spec progress events fan out through `ctx.send`. Commit `44af696`.
- **http_request** — fetch + timeout + response parsing. Deleted the loop's special-casing for http_request AND screenshot_output; both flow through `executeTool` like every other tool. Commit `92abef3`.
- **compile** — the 480-line beast. MephContext grows 6 fields (factorDB, sessionId, sessionSteps, pairwiseBundle, ebmBundle, hintState). The 8 reranker/classifier helpers come in through a third-arg bundle. Commit `b86a02f`.
- **executeTool extraction** — the 330-line inline switch in `/api/chat` becomes an 80-line wrapper that builds one fat MephContext, hands to `dispatchTool` from meph-tools.js, and mirrors back mutated state. Commit `b49243a`.

MephContext grew to ~30 fields. Every one has at least one consumer — lazy-growth discipline held. Tests: 254/254 meph-tools (+75 new), 2097/2097 compiler.

### MCP server wiring — all 28 tools exposed (commit `8981306`)

Before this session, the MCP server had 2 tool entries (one real, one stub). After: 28 tool definitions auto-generated from a declarative array, each with a handler that routes through `dispatchTool`. Module-level state (currentSource, currentErrors, lastCompileResult, mephTodos, hintState) mirrors what `/api/chat` tracks. Claude Code can now drive a multi-turn build-compile-test loop through the MCP protocol the same way Studio does.

MCP server tests: 102/102 (+72 new; was 30 at session start). Phase 5 integration covers edit_code write→read round-trip (verifies module state), meph_compile runs real compileProgram against stored source, schema errors surface as `isError=true`, and `meph_http_request` fails clean with "No app running" when no child is up.

### cc-agent tool mode — MCP + stream-json (commit `33d4eea`)

New module `playground/ghost-meph/cc-agent-stream-json.js` translates Claude Code's `--output-format stream-json` events into Anthropic SSE. The tricky bit: `stop_reason` must be `end_turn` (not `tool_use`) because Claude Code already ran the tools internally via MCP — the outer /api/chat loop would re-run them if we signaled tool_use.

Event table:
- `system/init` → `message_start`
- `assistant.content[].text` → `content_block_start(text)` + `content_block_delta(text_delta)` + `content_block_stop`
- `assistant.content[].tool_use` → `content_block_start(tool_use)` + `content_block_delta(input_json_delta)` + `content_block_stop`
- `user.content[].tool_result` → SKIPPED (tool already ran; emitting would cause /api/chat to re-run)
- `result` → `message_delta(stop_reason=end_turn)` + `message_stop`

cc-agent.js changes: added `chatViaClaudeCodeWithTools()` path, `writeMcpConfigOrNull()` for tmp config gen, `runClaudeCliStreamJson()` that spawns claude with the new flags. Gated by `GHOST_MEPH_CC_TOOLS=1` — text-mode MVP stays default until Russell's real claude CLI validates the format.

Tests: 46/46 new stream-json parser tests (fixture-driven; add a failing fixture → fix the parser → land), 66/66 ghost-meph (+7 Phase 10 covering MCP config generation, env-gate routing, graceful fallback on missing CLI for both text + tool modes).

### meph-helpers extraction (commit `268dd5c`)

`parseTestOutput` + `compileForEval` moved from `server.js` closures into new `playground/meph-helpers.js`. These are pure functions both `/api/chat` and the MCP server need. Server.js re-exports parseTestOutput so the existing test import keeps working. MCP server's `meph_list_evals` and `meph_run_tests` handlers now route to real implementations instead of throwing "helper is not a function".

Tests: 20/20 new meph-helpers tests (parseTestOutput pass/fail/mixed/`[clear:N]`-tag/legacy-dash-dash + compileForEval empty/whitespace/errors/happy-path/throws).

### User rule add (global CLAUDE.md)

New **Periodic Progress Checkpoints** rule — narrate "X of Y done, moving to Z" at chunk boundaries. Different cadence from the per-action Science Documentary Rule; this one is the META status that keeps Russell oriented across a long session without him having to ask "where are we?".

### Why this matters

The $200/mo Claude Code subscription is one hop from being Meph's execution backend. Before this session: two reimplementations of 28 tool handlers would have been needed. After: one codebase (meph-tools.js), two consumers (/api/chat + MCP server), one translation layer (cc-agent-stream-json). The cost break — `$168/day → $0/day` on Meph evals + curriculum sweeps — is what makes re-ranker hint experiments and step-seed curriculum tractable.

### Known gaps (next session)

1. **State sharing.** MCP server's module-level currentSource is isolated from Studio's /api/chat closure. Mid-turn edits via `meph_edit_code` don't show up in Studio's editor. Fix: HTTP bridge from MCP server to a new Studio endpoint `/api/meph-live-state`.
2. **runEvalSuite extraction.** Still tied to Studio's `evalChild` subprocess lifecycle. Harder than parseTestOutput/compileForEval — the child needs port allocation + auth bootstrap. Unblocks `meph_run_evals` / `meph_run_eval` in MCP mode.
3. **Real-claude validation.** Parser assumptions about stream-json shape are based on published Claude Code docs; the format isn't a documented stable interface. Fixture-driven tests in `cc-agent-stream-json.test.js` are the iteration surface.

---

## Autonomous session rollup (2026-04-21 evening) — Queues B + C + D + half of E

Russell kicked off an autonomous "plough-through" session before going to sleep. Mandate from `HANDOFF.md`: ship Queue B → C → D → E → F in priority order, branch per feature, no per-session cost tracking under his $200/mo Anthropic unlimited plan, but DO NOT call the production `/api/chat` endpoint until Ghost Meph cc-agent has tool-use support. Result: 26 commits, 13 merge commits, 4 queues meaningfully advanced. Test counts: 2108 compiler / 33 builder-mode / 59 ghost-meph pass; 7 pre-existing todo-fullstack e2e failures unchanged.

### Queue B — P0 GTM (4/5 shipped; GTM-4 LinkedIn DMs blocked on Russell)

- **GTM-1 deal-desk hero app** — `apps/deal-desk/main.clear` (161 lines, 14/14 tests). Discount approval workflow: rep submits a discount, ≤20% auto-approves, >20% routes to CRO queue. AI-drafted approval summaries shipped in seed data + a separate `/api/deals/draft` endpoint that calls a `draft_approval()` function with structured output. Hero demo for the Marcus landing page. Branch `feature/gtm-deal-desk`, merged `2827cf1`.
- **GTM-2 Marcus landing headline restored** — `landing/marcus.html` reverted to Session-35-locked headline: *"That backlog of internal tools nobody's going to build? Ship the first one this Friday."* Was drifting to a punchier-but-vaguer iteration. Branch `feature/gtm-marcus-landing`, merged `19f3e51`.
- **GTM-3 pricing page** — new `landing/pricing.html` (~430 lines). Free / Team $99 / Business $499 / Enterprise tiers locked Session 35. Per-tier quotas (apps, seats, agent calls, storage, custom domains, SSO), full compare table, "why no per-seat" Marcus-pain narrative, 8 FAQs. Wired pricing nav links across `marcus.html`. Branch `feature/gtm-pricing`, merged `fabd076`.
- **GTM-5 Studio first-visit onboarding** — `playground/ide.html` adds an inline welcome card prepended to `#chat-messages` on first load, gated by `localStorage['clear-onboarding-seen']`. Auto-focuses chat input. Per-mode copy (different examples for builder vs classic). Dismissed on first keystroke or × click. 50 lines, no new deps. Branch `feature/gtm-onboarding`, merged `7979736`.

### Queue C — Repo Readthrough (3/3 shipped)

- **RR-1 doc-drift checker** — new `scripts/check-doc-drift.cjs` (~190 lines, no deps). Scans 16 canonical docs for shared metrics that drift across sessions (compiler test count, node-type count, template count, curriculum tasks, Marcus apps, doc-rule surfaces). First run found 6 drifts; fixed unambiguous ones (compiler count 1089/1850/1954 → 2108; doc-rule surfaces 9 → 11 in FAQ). Wrote `docs/doc-drift-findings.md` for the harder ones (Core 7 vs 8, curriculum count metric ambiguity, node-type count). Branch `fix/rr-doc-drift`, merged `6ea720c`.
- **RR-2 1:1-mapping audit** — new `docs/one-to-one-mapping-audit.md`. Walked the parser+compiler looking for keywords that emit many lines of compiled JS/Python. The handoff-named CHECKOUT/OAUTH_CONFIG/USAGE_LIMIT turned out to already be 1:1 (config-only emits with header comments). Real worst offenders identified: AUTH_SCAFFOLD (~70 lines emitted from `allow signup and login`), AGENT_DEF (~80–150 lines), WEBHOOK (~25–40 lines). Implemented one fix: provenance comment block on AUTH_SCAFFOLD output that names the source line and lists every endpoint+middleware emitted. Branch `feature/rr-1to1-audit`, merged `c43d814`.
- **RR-3 ROADMAP Marcus-bias trim** — deleted stale "Mechanical Test Quality Signals" subsection (all done — moved to CHANGELOG). Relocated 5 orphaned "Next Up Session 34" items: 4 eval-tooling items into "Future (Not Committed)", 1 SQLite WIP into Refactoring Backlog as R9. Net 24 deletions, 9 insertions. Branch `docs/rr-marcus-bias`, merged `f845dde`.

### Queue D — Builder Mode follow-ons (2/2 shipped)

- **BM-6 tile gallery (Builder Mode v0.2)** — `playground/ide.html` adds a Marcus-first tile gallery on the empty preview pane in builder mode. 5 featured tiles (deal-desk first), "See more" expander for the remaining 9. Click loads template via existing `/api/template/<name>` flow. Sibling-of-preview-content positioning with `position: absolute` so `showTab()` innerHTML wipes don't nuke it. Added `deal-desk` to `FEATURED_TEMPLATES` in server.js. Branch `feature/builder-mode-bm6`, merged `ea21b28`.
- **Builder Mode v0.3 — BM-3 full + BM-4** — BM-3 full: localStorage `clear-bm-ships-counter`. First 3 successful Publishes the source pane defaults visible (onboarding); ship #3+ source defaults hidden. Counter increments inside `doDeploy()`'s success branch. BM-4: when in builder mode, every iframe click event ALSO prefills the chat input with `Change the "<text>" button/link — ` (cursor at end). Skips if user already typed something. 2 new builder-mode tests (33 total). Branch `feature/builder-mode-v03`, merged `55ef2f2`.

### Queue E — Ghost Meph (4/6 shipped + plans for the rest)

The architecture that lets `/api/chat` route through local backends instead of paying Anthropic per call. Four real backends now wired; tool-use support is the remaining unlock.

- **GM-1 env-gated /api/chat router** — new `playground/ghost-meph/router.js` (~150 lines). `MEPH_BRAIN` env var dispatches to backend; absent = real Anthropic (no behavior change). Stub returns Anthropic-shaped SSE with `stop_reason='end_turn'` so /api/chat tool loop doesn't spin. /api/chat skips the API-key 400 when ghost is active. 34 tests. Branch `feature/ghost-meph-stub`, merged `964d69c`.
- **GM-2 cc-agent text-only MVP** — new `playground/ghost-meph/cc-agent.js` (~170 lines). `MEPH_BRAIN=cc-agent` spawns `claude --print` subprocess, pipes the latest user message via stdin, wraps captured stdout as Anthropic SSE. System prompt loaded from `playground/system-prompt.md`. Failure modes (missing CLI, timeout, non-zero exit) surfaced as Anthropic-shaped error streams. 6 more tests. **Tool support deferred** — see `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` for the ~5-day MCP-server implementation. Branch `feature/ghost-meph-cc`, merged `57c10e6`.
- **GM-4 Ollama backend + shared format-bridge** — new `playground/ghost-meph/format-bridge.js` (~145 lines): Anthropic ↔ OpenAI translation (string + array content, system field both forms, tool_use blocks dropped for text-only MVP). `accumulateOpenAIText()` + `wrapOpenAIStreamAsAnthropicSSE()` helpers. New `playground/ghost-meph/ollama.js` (~80 lines): `MEPH_BRAIN=ollama:<model>` routes to Ollama's OpenAI-compatible endpoint at `OLLAMA_HOST` (default `http://localhost:11434`). ECONNREFUSED / TimeoutError / HTTP-error all become Anthropic-shaped error streams with Marcus-readable hints. 14 tests. Branch `feature/ghost-meph-ollama`, merged `d25ecdc`.
- **GM-3 OpenRouter backend** — new `playground/ghost-meph/openrouter.js` (~110 lines). `MEPH_BRAIN=openrouter` (or `openrouter:qwen`) routes to OpenRouter's `/v1/chat/completions` endpoint. Default model `qwen/qwen3.6-plus-preview:free`; override with `OPENROUTER_MODEL`. Requires `OPENROUTER_API_KEY`. Handles missing-key, 429 rate limits (no auto-retry — surfaces clearly), 404/400 preview-tier-disappears, timeout. Includes `HTTP-Referer` + `X-Title` attribution headers. Reuses format-bridge from GM-4 — only ~110 lines of new code. 5 more tests. Branch `feature/ghost-meph-openrouter`, merged `f416bcb`.

**Plans for the remaining Queue E items (read before implementing):**
- `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md` — full architecture for tool dispatch through cc-agent. 3 options (MCP server / stream-json parse / hybrid). Recommendation: Option A (MCP server). ~5 days estimated.
- `plans/plan-ghost-meph-openrouter-ollama-04-21-2026.md` — GM-3 + GM-4 designs (now both shipped) + GM-5 calibration harness + GM-6 default-switch follow-ups.

**Fresh `HANDOFF.md`** — rewrites the previous handoff with this session's ship pile, the budget rules (still in effect — restriction lifts after cc-agent gets tool support), priority queue (GM-2 tool-use → GM-5 → GM-6 → Queue F), open design questions for Russell, and the explicit branch-verification rule (after `git checkout -b`, run `git branch --show-current` — earlier this session GTM-1 somehow committed straight to main even though I'd just branched). Branch `docs/handoff-next-session`, merged `0a77df0`.

---

## Builder Mode v0.1 — Marcus-first Studio layout (2026-04-21)

Feature-flagged Studio layout flip via `?studio-mode=builder` URL param. Four changes:

- **BM-1 chat-as-driver** — chat pane drops to bottom 40vh in builder mode, full-width. Placeholder updated to "What do you want to build today, or which app to change?"
- **BM-2 preview-as-hero** — preview pane rises to top 60vh, full-width. `order: 0` flips DOM order (chat is earlier in markup).
- **BM-3-minimal Source toggle** — editor hidden by default; toolbar `Show Source ◀ / Hide Source ▶` button overlays editor as right-side rail (`position: absolute`, `z-index: 20`, `width: min(400px, 85vw)`). Full 3-session auto-hide logic deferred.
- **BM-5 Publish button** — `#deploy-btn` renamed to "Publish" and gains `.publish-btn` class in builder mode. Accent-filled background, bolder type, hover lift, focus glow. Same handler, same `/api/deploy` endpoint.

Classic 3-panel layout remains default. Preference persists in localStorage. Private-browsing safe (localStorage wrapped in try/catch).

Tests: `playground/builder-mode.test.js` (new, 31 assertions, all passing). `playground/ide.test.js` and `playground/deploy.test.js` regressions clean.

Deferred to later PRES cycles: BM-3 full (3-session auto-hide counter), BM-4 click-to-edit on preview, BM-6 "what are you building?" tile gallery, status bar, `cmd+.` revert shortcut.

Plan: `plans/plan-builder-mode-v0.1-04-21-2026.md`. Full spec: `ROADMAP.md` → "Builder Mode — Marcus-first Studio layout".

---

## Recently Completed

| Feature | Syntax | Status |
|---------|--------|--------|
| **Live App Editing — Phase A** (LAE-1, LAE-2, LAE-3 additive, LAE-7) | Studio `/__meph__/widget.js` + `/propose` + `/ship` endpoints; owner-gated Meph widget; 3 additive tools (field/endpoint/page); AST-diff classifier with additive/reversible/destructive taxonomy | Done — 67 tests + 10/10 real-Meph eval |
| **Live App Editing — Phase B** (LAE-3 reversible, LAE-4, LAE-6) | `, hidden` and `, renamed to X` field modifiers; `db.findAll`/`findOne` strip hidden by default; snapshot + rollback primitives; ship auto-snapshots; `/__meph__/api/rollback` + `/snapshots`; widget Undo button; sessionStorage form-state preservation across reload | Done — 44 more tests + 11/11 real-Meph eval |
| **Live App Editing — compiler integration** | Widget script + `/__meph__/*` proxy auto-injected into every compiled Clear app that declares `allow signup and login`. `STUDIO_PORT` env var wires the child's proxy to Studio; clean 503 in production. Studio copies `runtime/meph-widget.js` into `clear-runtime/` on every `/api/run`. | Done — 7 tests, landing page rewritten in Marcus's voice |
| Intent classification | `classify X as 'a', 'b', 'c'` | Done — Claude Haiku call |
| Extended RAG | `knows about: 'https://url'`, `'file.pdf'`, `'doc.docx'` | Done — URLs + files + tables |
| Send email inline | `send email to X:` + subject/body block | Done |
| Scheduled at time | `runs every 1 day at '9:00 AM'` | Done — node-cron |
| `find all` synonym | `find all Orders where status is 'active'` | Done |
| `today` literal | `where created_at is today` | Done |
| Multi-context ask ai | `ask ai 'prompt' with X, Y, Z` | Done |
| Store-ops GAN target | 230-line e-commerce agent demo | Done — compiles + runs |
| Error throwing | `send error 'message'` / `throw error` / `fail with` / `raise error` | Done — P1 |
| Finally blocks | `try:` ... `finally:` / `always do:` / `after everything:` | Done — P2 |
| First-class functions | Pass function refs as arguments | Done — P3, works natively |
| Async function await | User-defined async fns auto-get `await` at call sites | Done — pre-scan + transitive |
| Postgres adapter | `database is PostgreSQL` → `pg.Pool` runtime adapter | Done — `runtime/db-postgres.js`, same API as SQLite |
| Railway deploy | `clear deploy app.clear` → package + `railway up` | Done — auto-detects db backend, correct deps |
| Studio Test Runner | Tests tab in IDE with Run App/Compiler buttons | Done — `/api/run-tests`, Meph `run_tests` tool |
| Intent-based tests | `can user create/view/delete`, `does X require login`, `expect it succeeds` | Done — `TEST_INTENT` + extended `EXPECT_RESPONSE` |
| English test names | Auto-generated tests use readable names ("Creating a todo succeeds") | Done — `generateE2ETests` rewrite |
| CRUD flow tests | "User can create a todo and see it in the list" | Done — auto-generated from table + endpoint AST |
| `dbBackend` field | `compileProgram()` exposes `result.dbBackend` | Done — used by CLI deploy/package |
| Nameless test blocks | `test:` + body (first line = name) | Done — zero-redundancy test syntax |
| Auto-test on Run | Tests auto-run when Run clicked, switch to Tests tab on failure | Done — Studio IDE integration |
| Test runner rewrite | `clear test` starts server, installs deps, shares JWT | Done — replaces legacy test extraction |
| Studio Bridge | Shared iframe between user + Meph via postMessage | Done — `?clear-bridge=1` / `<meta name="clear-bridge">` gate, compiler-injected |
| Bridge tools | `read_actions`, `read_dom` + `click/fill/inspect/read_storage` via bridge | Done — replaces separate Playwright page |
| Friendly test failures | Plain-English errors with hints for 200/201/204/400/401/403/404/409/422/429/5xx | Done — `_expectStatus`/`_expectBodyHas`/etc helpers |
| Click-to-source on failures | `[clear:N]` tag in error → IDE jumps editor to line | Done — `parseTestOutput` extracts `sourceLine` |
| Fix with Meph button | Failure row → submit `{name, error, sourceLine, snippet}` to Meph | Done — auto-prompts in chat |
| Meph sees user test runs | IDE snapshots `testResults` into chat body | Done — `buildSystemWithContext` appends to system prompt |
| Unified terminal timeline | `[stdout]`/`[stderr]`/`[user]`/`[browser]`/`[meph]` interleaved | Done — single `terminalBuffer`, mirrored from all sources |
| Fix Windows libuv shutdown | Single SIGTERM handler awaits browser close before exit | Done — eliminates `UV_HANDLE_CLOSING` assertion |
| Meph tool eval | 16-scenario script + Meph self-report per tool | Done — `playground/eval-meph.js`, 15/15 verified |
| `incoming` scanner walks wrapper nodes | SEARCH/FILTER `.query` field now triggers binding | Done — `incoming?.q` in compiled output now has matching `const incoming = req.query` |
| User-test HTTP path tokenizer fix | `/api/todos` no longer collapses to `/` in `_lastCall` | Done — friendly errors show real path |
| E2E auth helper | JWT signed via node crypto + pinned `JWT_SECRET` on child spawn | Done — 77/77 pass with `requires login` POSTs |
| `highlight_code` tool case | Was missing from executeTool switch | Done — found by Meph eval self-report |
| Rich text editor input | `'Body' is a text editor saved as body` | Done — Quill via CDN, toolbar, live `_state` binding |
| Multi-page Express routing | `page 'X' at '/new':` emits `app.get('/new', ...)` | Done — previously only `/` was served so direct URLs 404'd |
| Client-side pathname router | Reads `location.pathname`, falls back to hash, intercepts `<a>` clicks for SPA nav | Done — was hash-only, broke every multi-page app on refresh |
| Studio route selector | Dropdown above preview listing every `page 'X' at '/route'` | Done — includes back/forward/refresh, full-stack apps use real http iframe (not srcdoc) |
| Layout nesting warning | `page_hero`/`page_section` inside `app_layout` → compiler warning | Done — silent clipping trap now caught |
| Honest test labels | `UI: ...` vs `Endpoint: ...` based on real UI detection | Done — walks AST for `API_CALL` POSTs in pages, renames flow tests accordingly |
| Unwired-endpoint warning | POST endpoint with validation but no UI button wired → warning | Done — emitted with the endpoint's line number |
| `send X as a new post to URL` parser fix | Greedy `post to` synonym was eating resource word, dropping entire send line | Done — respond handler accepts `post_to`/`put_to`/`get_from`/`delete_from` as URL connectors |
| Express 5 `sendFile` root option | `res.sendFile(absolutePath)` 404'd on non-root URLs under send module | Done — switched to `{ root: __dirname }` form |
| Streaming is the default | `ask claude 'X' with Y` inside POST endpoint auto-streams; `get X from URL with Y` on frontend auto-reads SSE | Done — no `stream` keyword needed anywhere |
| Streaming opt-out | `without streaming` → single `res.json({ text })` response | Done — matching frontend auto-detects, uses plain POST + JSON |
| `_askAIStream` prompt bugfix | Parser used non-existent `NodeType.STRING_LITERAL`, compiler silently emitted `/* ERROR */` in every streaming endpoint | Done — fixed both code paths, `LITERAL_STRING` is correct |
| Compile badge in Studio | `NwordsClear → NwordsJS · Nx · Nms` toolbar chip + auto-tests badge | Done — visible proof of compiler leverage |
| Meph voice mode | 🔊 toggle in chat pane — continuous mic + spoken replies in refined British male voice | Done — zero-deps Web Speech API, auto-pause during speech, sentence-buffered TTS, persistent across reloads |
| Eval criteria clarity | Rubric leads; "non-empty response" check demoted to dim italic footnote | Done — applied to Studio Tests pane + exported Markdown reports |
| Test runner timeouts | 30s → 120s CLI / 180s Studio; override via `CLEAR_TEST_TIMEOUT_MS`, `CLEAR_STUDIO_TEST_TIMEOUT_MS`, `CLEAR_NPM_INSTALL_TIMEOUT_MS` | Done — cryptic Windows `spawnSync cmd.exe ETIMEDOUT` translated to plain-English guidance |
| Stray diff-marker detection | Leading `-` / `+` on a source line → plain-English error naming the real cause instead of "undefined variable 'send back'" | Done — validator catches the multi-word-keyword-as-identifier case; AI-INSTRUCTIONS + Meph system prompt updated so edits don't leave diff artifacts |
| Voice mode tri-state | Off / 🔊 Speak / 🎤 Converse segmented control in chat pane | Done — Speak = TTS only (no mic), Converse = TTS + continuous STT; mic-denial falls back to Speak |
| SSE grading for structured payloads | Agent endpoints that stream `send back { score, reason }` now land in the grader with full JSON body | Done — session 32 widest-blast-radius bug; 14 unit tests in `playground/sse-drain.test.js` |
| Terminal newest-first ordering | Newest event at top, accent-highlighted; older entries fade | Done — removed the double-reverse that was burying new entries at the bottom |
| Eval score-gap display | Rubric scores render with tinted chip showing gap from threshold (+0.2 / -0.4) — green when clear, yellow when borderline, red when clearly failing | Done — flakiness reads as borderline case, not regression. Same format in exported MD reports. |
| Auto-rerun on eval fail | Failed rubric-graded specs auto-rerun once; pass on retry = flagged "borderline" with prior-attempt score exposed | Done — catches T=0 sampling jitter at ~2x cost on genuine failures only. Override with `CLEAR_EVAL_NO_RERUN=1`. |
| Probe honors `validate incoming:` | e2e/role/format probes now merge the endpoint's required fields into the body so probes don't 400 before the agent runs | Done — new `buildEndpointBody()` helper. Unblocked page-analyzer + lead-scorer end-to-end. |
| Concrete sample values | Field-level sample generator emits `"Acme Corp"` / `"quantum computing"` / `"alice@example.com"` instead of `"sample X"` | Done — generic strings made Claude-backed agents refuse ("I need more context"). Real values ground the grader + agent. |
| Eval child shutdown race | `killEvalChildAndWait()` awaits exit + 200ms OS socket grace before respawn | Done — sync kill was racing the next spawn on port 4999, surfacing as cascading "fetch failed." |
| Extended eval idle timer | `EVAL_IDLE_MS` 60s → 300s | Done — multi-agent suites run 3+ min; child was being reaped mid-run when grader bursts spanned 60s between probe hits. |
| **Agent+auth template evals all pass** | page-analyzer, lead-scorer, helpdesk-agent, ecom-agent, multi-agent-research | **29/29** specs pass end-to-end (was 15/29 at session 32 baseline). Real-API validation of the whole eval stack. |
| **Phase 85 — One-click deploy (Studio → Fly)** | Session 37 | Deploy button in Studio ships compiled apps to a live URL in seconds. Shared builder + metered AI proxy + tenant/billing layer + cross-tenant isolation. 72 passing tests across packaging, builder, proxy, billing, deploy, security. External prerequisites (Fly sales email, Stripe signup, domain registration, Anthropic org key) still required before first real deploy. |

## Session 37 — Supervisor + Factor DB + Marcus apps + HITL compiler fixes

| Feature | Syntax / Where | Status |
|---------|----------------|--------|
| **Factor DB** | `playground/factor-db.sqlite` — every Meph compile writes a row: {archetype, error_sig, compile_ok, test_pass, source_before, patch_summary} | Done — SQLite, WAL, indexed. 139 rows / 49 passing. |
| **Archetype classifier** | `playground/supervisor/archetype.js` — 15 shape-of-work categories | Done — queue_workflow/routing_engine/agent_workflow/dashboard/crud_app/content_app/realtime_app/booking_app/ecommerce/api_service/etl_pipeline/webhook_handler/batch_job/data_sync/general. All 13 templates classify correctly. |
| **Flywheel loop closure** | `/api/chat` compile error → `_factorDB.querySuggestions()` → injects 3 tier-ranked past examples as `hints` in tool result | Done — v2 layered: exact error + archetype / exact error / archetype gold |
| **Studio Flywheel tab** | Live dashboard: total rows, passing rows, progress to 200-row threshold, archetype table, recent activity, API health banner | Done — polls `/api/flywheel-stats` every 3s |
| **Studio Supervisor tab** | Run-sweep control (workers/tasks/timeout), live progress (per-task ✅/❌), session browser with click-to-expand trajectory drill-down | Done — 4 new endpoints (`/api/supervisor/sessions`, `/session/:id`, `/start-sweep`, `/sweep-progress`) |
| **Session Registry** | `playground/supervisor/registry.js` — SQLite-backed session tracking (state, port, task, pass_rate) | Done — WAL mode, 4 tests |
| **Worker Spawner** | `playground/supervisor/spawner.js` — spawns `node playground/server.js --port=X --session-id=Y` child processes | Done — port availability check, killAll |
| **Supervisor Loop** | `playground/supervisor/loop.js` — polls workers, detects TASK COMPLETE / STUCK, SSE status stream | Done — state machine + SSE |
| **Curriculum sweep harness** | `node playground/supervisor/curriculum-sweep.js --workers=3` — drives 25 curriculum tasks through N parallel workers | Done — pre-flight API check, fail fast on rate limit |
| **Eval replicated** | `node playground/eval-replicated.js --trials=3` — runs full 16-scenario suite on N workers, reports flake rate per scenario | Done — same infra as curriculum-sweep |
| **Training data exporter** | `node playground/supervisor/export-training-data.js --stats` or `--out=t.jsonl` — JSONL with 15 structured features per row | Done — ready for EBM once 200 passing rows accumulate |
| **EBM trainer stub** | `python playground/supervisor/train_reranker.py t.jsonl` — refuses below 200 passing, else trains + exports ONNX | Done — skeleton ready, dormant until threshold |
| **5 Marcus apps** | `approval-queue`, `lead-router`, `onboarding-tracker`, `support-triage`, `internal-request-queue` — business-ops templates in Studio dropdown | Done — top of dropdown, matching L7-L9 curriculum tasks |
| **`send back all X` shorthand** | `send back all Users` / `send back the User with this id` / `send back all Users where active is true` — inline retrieval, no named intermediate | Done — parser desugars to `[CRUD, RESPOND]`, 6 templates updated |
| **`this X` standalone expression** | `workspace_id = this id` / `items = get all Items where owner is this user_id` — URL param access anywhere | Done — parses to `incoming?.X` |
| **Test verb aliases** | `can user submit`, `add`, `post`, `send`, `make` → canonical `create`. Plus `see/read/get/list` → `view`, `remove` → `delete`, `edit/change/modify` → `update` | Done — `TEST_VERB_ALIAS` map in parser |
| **Intent hints (validator)** | `find`, `fetch`, `search`, `query`, `lookup`, `select`, `retrieve`, `filter`, `list`, `create`, `insert`, `add`, `remove`, `destroy`, `update`, `id`, `login`, `password`, `this`, `generate`, `summarize`, `classify`, `extract`, `translate`, `rewrite`, `analyze`, `predict` — all get curated hints pointing at canonical form | Done — `INTENT_HINTS` map in `validator.js`, replaces nonsensical Levenshtein suggestions |
| **Auth guard error UX** | Missing `requires login` on POST/PUT/DELETE shows full corrected endpoint example, not just one-line fix | Done — `validator.js` error message |
| **Classifier auth detection fix** | archetype.js was checking non-existent `REQUIRES_LOGIN` node type; now checks `REQUIRES_AUTH`, `REQUIRES_ROLE`, `AUTH_SCAFFOLD` | Done — Marcus apps now correctly tagged `queue_workflow` |
| **http_request 2xx = passing signal** | `/api/chat` http_request tool 2xx response now marks the latest Factor DB row as `test_pass=1` with 0.9 score | Done — curriculum sweeps that verify via HTTP now produce passing rows |
| **Pre-flight API check** | Sweep harnesses probe API with 5-token request before spawning workers; fail in 2s on rate limit instead of burning 10 min | Done — `curriculum-sweep.js` + `eval-replicated.js` |
| **Flywheel API health banner** | `/api/flywheel-stats` reports `apiHealth` (ok/no_key/error), Flywheel tab shows red/green banner with actual error text | Done — cached 5 min to avoid quota waste |
| **Cold-start seeder** | `node playground/supervisor/cold-start.js` — seeds DB with 13 gold templates (all 8 core + 5 Marcus) + 25 curriculum skeleton attempts | Done — idempotent, BM25 retrieval works immediately |
| **HITL Rule (CLAUDE.md)** | "Meph Failures Are Bug Reports on the System" — when Meph fails, fix compiler/docs/system prompt, merge-as-you-go. Matrix of symptom → root cause layer | Done — codified as mandatory rule + in memory |
| **Documentation Rule 9 surfaces** | Added FAQ.md + RESEARCH.md to the rule (was 7, now 9). Both skills (ship + write-plan) updated | Done — no new feature ships without updating all 9 |
| **Measured lift** | Sweep 6 (all HITL fixes active) vs Sweep 4: **+75% task completions (4→7)**, 30% faster wall clock, +38% more passing rows | Done — HITL rule proved itself empirically |
