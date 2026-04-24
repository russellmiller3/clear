# Clear Language — Roadmap

## Vision

1. **AI builds things fast.** Clear is the language AI writes. Short programs, deterministic compiler. The faster the write->compile->run->fix loop, the more it ships.
2. **Hostile to bugs.** Catch mistakes at compile time. If the compiler accepts it, it should work.
3. **Russell builds faster.** Describe what you want, get working software. Real apps with auth, data, AI agents, dashboards.

---

## North Star: Clear Cloud (P0 — Q2 2026)

**Decision (locked 2026-04-21):** Clear is a **Marcus product**, not a Dave tool. The primary interface is a web IDE with a **Publish** button; the terminal + Docker + vendor-choice path is an opt-in escape hatch, not the main pitch.

**Where it runs:** build on top of the already-shipped Phase-85 Fly infrastructure (shared builder, AI proxy, tenant layer, 72 passing tests). Cloudflare Workers + D1 auto-routing lands as v2, *after* Marcus is paying on Fly. Don't rebuild the hosting layer before shipping the product.

**What Marcus experiences (the whole pitch in one flow):**

```
open buildclear.dev → log in → write or ask Meph to build
  → hit "Publish" → app is live at approvals.buildclear.dev in 3 seconds
  → edit → save → live instantly (Live App Editing)
  → custom domain = one text field
```

No terminal. No Dockerfile. No vendor name. One Stripe invoice.

**The five missing pieces to ship Clear Cloud (on top of Phase 85):**

| # | Missing piece | Scope | Blocks |
|---|---|---|---|
| **CC-1** | Multi-tenant hosting — subdomain routing + per-app DB provisioning + isolation | 2–3 weeks | Everything else |
| **CC-2** | Auth for `buildclear.dev` itself — accounts, sessions, team membership | 1 week | Marcus can't log in |
| **CC-3** | Stripe billing — subscriptions + usage metering + quota enforcement | 1–2 weeks | Revenue |
| **CC-4** | "Publish" button in Studio wired to Clear Cloud (not local compile) | 3 days (after CC-1) | Terminal-free pitch |
| **CC-5** | Custom domain flow — DNS routing + SSL provisioning + verification UX | 1 week (builds on Phase 89) | Polished user-facing flow |

**Total on top of Phase 85: ~6–8 weeks.** Before any of this works end-to-end: **Phase 85a** (register buildclear.dev, Fly Trust Verified quota, Stripe signup, Anthropic org key, Postgres for tenants DB). That's the single biggest unblocker — deploy passes tests today but has nowhere to deploy to.

**Companion tracks ship in parallel, not after:**
- **Builder Mode (GTM-6)** — Marcus-first Studio layout: Meph chat drives, preview is the hero, code goes behind a toggle, branded Publish button top-right. ~4 weeks. Ships with CC-4 because the Publish button is Builder Mode's centerpiece — without the layout shift, CC-4 lands in a UI that still says "this is for Dave."
- **Live App Editing (LAE-*)** — the flagship differentiator nobody else has. Q2/Q3.
- **Go-To-Market** — hero Marcus app (deal-desk), landing page, first 5 real Marcuses on LinkedIn. Q2.

**Full strategy + competitive positioning vs Retool / Lovable / Bubble** is in the `Clear Cloud — Marcus-first hosted platform strategy` and `Why Clear Cloud beats Retool and Lovable at deploy specifically` sections below. **Session-by-session history** is in `CHANGELOG.md`. **Feature reference (what Clear can do today)** is in `FEATURES.md`.

---

## What's Next

**Priority order (revised 2026-04-21).** The product north star is: **paying Marcus customers on Clear Cloud.** Everything below ladders up to that, or it's research. Sections are grouped by priority tier — within a tier they can run in parallel.

| Tier | Track | What this is | Sections |
|---|---|---|---|
| **P0 — Ship Clear Cloud to Marcus (Q2 2026)** | Clear Cloud hosted platform | The product Marcus presses "Publish" in. Build on top of existing Phase-85 Fly infrastructure. | `Clear Cloud — Marcus-first hosted platform strategy`, `One-click deploy follow-ups (Phase 85 shipped)`, `Why Clear Cloud beats Retool and Lovable` |
| **P0 — Ship Clear Cloud to Marcus (Q2 2026)** | Go-to-market & first users | The pitch, the landing page, the first 5 real Marcuses finding Clear. | `Go-To-Market & Positioning`, `Repo Readthrough Priorities` |
| **P0 — Ship Clear Cloud to Marcus (Q2 2026)** | Builder Mode (Marcus-first Studio) | Flip Studio hierarchy: chat drives, preview is hero, code is a toggle. Branded Publish button, click-to-edit, "what are you building?" gallery. Promoted P1 → P0 on 2026-04-21 to ship alongside CC-4. ~4 weeks. | `Builder Mode — Marcus-first Studio layout` (GTM-6 detail) |
| **P1 — Flagship differentiator (Q2/Q3 2026)** | Live App Editing | The single feature no competitor has. Ships in parallel with CC-1 through CC-5. | `Live App Editing (Flagship)` |
| **P2 — Platform optimization (Q3 2026)** | Auto-hosting v2 + flywheel | Cloudflare auto-routing for compatible apps; Meph reranker training on Factor DB. | `Auto-hosting by app type (v2)`, `Flywheel / Training Signal`, `Compiler Flywheel — Tier 1 only` |
| **P3 — Maintenance & quality** | Language + performance + tests | Keep the compiler honest and fast as surface expands. | `Language Completeness`, `Performance`, `Platform Quality`, `Mechanical Test Quality Signals`, `Next Up (Session 34 Next Steps)` |
| **P4 — Long-term research** | Compiler Flywheel CF-2/3/4, SK-*, OL-*, moonshots | Published research, novel capability, delight features. Not on the Marcus critical path. | `Compiler Flywheel Tiers 2-4`, `Research Priority Order`, `Solo Karpathy Moonshot`, `Other Laptop-Scale Research Bets`, `Private Moonshots` |

**Rule of thumb for session prioritization:** if you're working on something tagged P2 or lower while P0 items are incomplete, ask yourself whether this session is actually moving Marcus closer. If not, stop and pick a P0 task. Research is valuable — it's just not urgent.

### Session 46 follow-ups (Decidable Core shipped)

Decidable Core Phase 2+3 shipped on `feature/decidable-core`: every `while` is auto-capped, recursive functions get a depth counter, `send email` gets a 30s timeout default, `ask claude` / `call api` retry transient failures. PHILOSOPHY Rules 17 + 18 added. `scripts/cross-target-smoke.mjs` now gates cross-target emission (32/32 parse clean). Incremental pickups:

1. **Parser support for `max depth N` on `define function`.** Today the runtime uses the default 1000 unless the author rewrites as a loop. Adding the parser suffix (similar to `while … max N times`) makes the override declarable. ~30 lines in parser.js + tests.
2. **Port TEST_INTENT + test-harness to Python target.** The Python emitter currently stubs all intent-based tests with `pytest.skip`. Full port needs: (a) the 7 TEST_INTENT cases (create/view/search/delete/require_login/ask_agent/shows) emitting `httpx.AsyncClient` calls instead of JS `fetch` (~140 lines, mirrors JS generator at compiler.js:7146); (b) a Python test-harness layer mirroring `compileToTests` (BASE url from env, JWT token fixture via `PyJWT`, AUTH_HEADERS dict, `_expectStatus`/`_expectSuccess`/`_expectBodyHas` helpers, unique-counter fixtures for `_uniqueEmail`/`_uniqueText`). The harness is the bigger piece — ~300 lines. Multi-session scope; fine to leave stubbed until a Python-target user surfaces.
3. **Phase 7 measurement.** Replay past Factor DB failing transcripts through the new compiler, A/B on 5 curriculum tasks. Budget-capped at $10 per the CLAUDE.md Session-41 rule. Confirms the termination bounds help (or doesn't — in which case we park and move on).
4. **Extend `cross-target-smoke.mjs` into a pre-push hook.** Currently runs manually. 5 min to wire into `.husky/pre-push` alongside `node clear.test.js`.

### Repo Readthrough Priorities (2026-04-19)

These came out of a full readthrough of the repo/docs stack. They are not new feature ideas; they are leverage points that protect the thesis.

| # | Item | Status | Impact |
|---|------|--------|--------|
| RR-1 | **Kill doc drift on the canonical surfaces.** Add one cheap consistency pass that checks shared metrics/examples across `README.md`, `FAQ.md`, `ROADMAP.md`, `PHILOSOPHY.md`, and startup docs so test counts, canonical syntax, and product claims don't silently diverge. | Next | Protects the "docs are source of truth" promise |
| RR-2 | **Retire or redesign the last 1:1-mapping violations.** `CHECKOUT`, `OAUTH_CONFIG`, `USAGE_LIMIT`, and any other syntax that still hides too much generated behavior should move toward explicit source forms or be demoted until they do. | Next | Protects Clear's most important philosophical moat |
| RR-3 | **Bias roadmap energy toward the Marcus wedge, Meph reliability, and live editing.** New syntax should mostly earn its keep by removing `script:` from Marcus-class apps or by fixing repeated Meph failure clusters, not by broadening surface area for its own sake. | Next | Keeps the company/story/product pointed at the strongest wedge |

### One-click deploy follow-ups (Phase 85 shipped)
1. **Phase 85a — Provision the real stack.** Register buildclear.dev, apply for Fly Trust Verified status with 10k-machine quota, sign up for Stripe, generate Anthropic org key, wire Postgres for the tenants DB, and run `deploy-builder.sh` + `deploy-proxy.sh` once. Until this is done Deploy works end-to-end in tests but has nowhere to deploy to.
2. **Phase 86 — Per-tenant usage dashboard.** The plan badge is a teaser; a full breakdown page (spend by day, top apps by AI spend, upgrade CTA) turns the badge into a billing conversion surface.
3. **Phase 87 — Meph-driven deploy.** Meph gains a `deploy_app` tool so "ship it" from chat does the right thing: prompts for secrets, picks a domain, calls `/api/deploy`, streams progress into the chat bubble.
4. **Phase 88 — Deploy history drawer.** Rollback API exists; surface it in the UI as a per-app drawer with version + diff preview.
5. **Phase 89 — Multi-region + custom-domain polish.** Region picker at deploy time, cert-status polling, one-click DNS record copy. Everything is `iad`-only today.

### Clear Cloud — Marcus-first hosted platform strategy (2026-04-21)

**The positioning decision, recorded in one place so it stops drifting.**

Every session drifts toward building a Dave tool — a CLI, a Dockerfile, a compile-to-JS export. That was the Phase-85 shortcut. The *product* is Marcus pressing a button. Dave's path exists as an escape hatch, not the main pitch. Session 35 locked Marcus; this section locks the deploy *experience* that follows from that.

**Two mental models, picked once:**

| Dimension | Dave tool (Terraform/YAML) | Marcus product (Bubble-shaped) |
|---|---|---|
| Primary interface | Terminal (`clear deploy`) | Studio button ("Publish") |
| Who picks the vendor | User does | Compiler does, automatically |
| Who owns the Dockerfile | User sees and edits | Hidden, never surfaced |
| Who pays for hosting | User's Cloudflare/Fly/AWS bill | Single Clear Cloud subscription |
| Escape hatch | *Is* the product | Exists, not advertised |

**We build Marcus.** Reasons: (1) 10x bigger market than devs, (2) Clear's plain-English bet is wasted on Dave, (3) the Factor DB flywheel needs hosted data to compound, (4) Vercel/Stripe/Retool all started technical and expanded down — going up-market from Dave to Marcus is a proven path, going down-market from Marcus to Dave is not.

**What Marcus experiences:**

```
Studio → writes/asks Meph → hits "Publish"
  → app is live at approvals.buildclear.dev in 3 seconds
  → "Add custom domain" = one text field
  → Edit → Save → live instantly (Live App Editing)
```

No terminal. No vendor name. No Dockerfile. One Stripe invoice.

**The five missing pieces (on top of Phase 85):**

| # | Missing piece | What it unlocks | Rough scope |
|---|---|---|---|
| CC-1 | **Multi-tenant hosting infrastructure** — subdomain routing, per-app database provisioning, isolation boundaries. Phase 85a provisions the stack; this makes it actually route traffic per tenant. | `approvals.buildclear.dev` and `crm.buildclear.dev` are different apps with different databases on the same cluster. | 2–3 weeks |
| CC-2 | **Auth for `buildclear.dev` itself** — user accounts, sessions, team membership. Not the auth inside a Clear app; the auth Marcus uses to log into Clear Cloud and see his 12 apps. | Marcus has a dashboard. His apps are private to his account. Teammates can be invited. | 1 week |
| CC-3 | **Billing (Stripe) — subscriptions, usage metering, quota enforcement.** The Session-35 pricing model (Free / $99 Team / $499 Business / Enterprise) turned into actual invoices. | Real money flows. Free tier hits quota and prompts upgrade. | 1–2 weeks |
| CC-4 | **"Publish" button in Studio wired to Clear Cloud.** Today the Deploy button exists but points at the test builder; wire it to the production Phase-85a stack once CC-1 is live. | Marcus never types `clear deploy`. The terminal command demotes to "power user" page. | 3 days (after CC-1) |
| CC-5 | **Custom domain flow** — DNS routing + SSL provisioning + verification UX. Phase 89 is the tactical version; CC-5 is the polished user-facing flow. | Marcus types `approvals.acme.com`, copies one DNS record, clicks verify, done. | 1 week (builds on Phase 89) |

**Total: roughly 6–8 weeks of platform engineering on top of Phase 85's existing foundation.**

### Auto-hosting by app type (v2, post-Clear-Cloud)

**Yes — the compiler still picks hosting automatically, but as a v2 layered on top of Clear Cloud.** Phase 85 ships all apps to Fly (one target, simplest mental model). Once that works, v2 is: the compiler reads the `.clear` file and routes to the cheapest/fastest viable backend. Marcus never sees any of it.

| App shape | What the compiler detects | Where it gets deployed |
|---|---|---|
| Static pages only | No `endpoint`, no `table`, no backend logic | Cloudflare Pages (free, global CDN) |
| Web CRUD (most business apps) | `table` + `endpoint` + `page`, no `subscribe to` | Cloudflare Workers + D1 (SQLite-native, free tier deep) |
| AI agent with memory | `ask claude` + `remember conversation` | Workers + D1 + **AI Gateway** (caching + rate limits + cost safety for free) |
| Real-time / WebSockets | `subscribe to` / `broadcast to all` | Workers + Durable Objects |
| Long-lived agent workflows | Multi-step workflows, sleeps, retries | Workers Workflows (Cloudflare's Temporal-equivalent — shipped 2025) |
| Python ETL / scheduled batch | `compile target: python` + `schedule` | Modal (only real-Python serverless that runs pandas/polars) |
| Native binaries required (OCR, FFmpeg, Playwright, ODBC) | Compiler detects service-calls or skills that need `apt install` | Fly (current Phase 85 default) — only tier that supports Docker |

**Why this ordering matters:** most Marcus apps are "Web CRUD" or "AI agent" shaped. Those run 3–10× cheaper on Cloudflare than Fly. Keeping Fly as the universal default (current Phase 85) means Clear subsidizes compute Marcus doesn't need. Auto-routing flips that — small apps cost Clear pennies on Cloudflare's free tier, big/complex apps pay for themselves on Fly.

**Build order for v2 (after CC-1 through CC-5 ship):**

1. **Cloudflare Workers + D1 adapter** — emit Workers-compatible JS, swap SQLite driver for D1 driver at compile time. ~2 weeks.
2. **App-shape classifier in compiler** — deterministic inspection of the AST: "does this app have a `subscribe to`? does it import native binaries? does it have a `schedule`?". Routes to one of the tiers above. ~1 week.
3. **AI Gateway integration** — when compiling an agent app, inject Cloudflare's AI Gateway URL in front of every `ask claude`. Cost caching + rate limiting + observability for free. ~3 days.
4. **Modal adapter for Python-ETL apps** — `clear deploy` sees `compile target: python` + `schedule` → emits Modal decorators, calls `modal deploy`. ~1 week.
5. **Durable Objects adapter** — real-time apps get a DO wrapper. ~1 week.
6. **Workers Workflows for long-lived agents** — the agent workflow lands in a Workflow function with durable step-wise execution. ~1 week.

Total v2 work: ~6 weeks. Ships after Clear Cloud (CC-1 through CC-5) is stable.

### Why Clear Cloud beats Retool and Lovable at deploy specifically

Retool and Lovable both have "Publish" buttons. Both ship to a URL in seconds. But both have shapes that Clear can beat on structural grounds, not just UX polish:

| Dimension | Retool | Lovable | **Clear Cloud** |
|---|---|---|---|
| Source of truth | Proprietary visual config (JSON blob in their DB) | Generated React/Next.js in GitHub | **Plain-English `.clear` file** |
| Can you leave? | Self-host option ($$$, complex) or trapped | `git clone`, deploy to Netlify/Vercel | **`clear export` → portable Docker, runs anywhere** |
| Reads like English? | No (visual blocks) | No (React/TypeScript) | **Yes — the whole point** |
| AI edits the app safely? | Retool AI exists, but can't edit structure, only inside components | Lovable prompts edit React — works but output is opaque | **Meph edits Clear source directly; 1:1 compile makes diffs reviewable** |
| Live edit running prod app? | No — rebuild/redeploy cycle | No — regenerate/redeploy cycle | **Yes (Live App Editing — flagship LAE-*)** |
| Multi-tenant hosted? | Yes | Yes | Yes (Phase 85 + Clear Cloud) |
| Custom domain | One-click (paid) | One-click (Pro $25/mo) | One-click (Team $99/mo) |
| Agent-first | AI bolted onto visual platform | AI generates code | **AI is native primitive (`ask claude`, `has tools:`)** |
| Cost safety on AI? | Manual | None — you pay whatever users trigger | **AI Gateway (rate limits + cost caps + caching, free)** — v2 |

**The structural differentiators, stated plainly:**

1. **Portability without penalty.** Retool traps you in their visual editor. Lovable's React is portable but no human reviews it. Clear is portable AND readable — Marcus's CFO can read his own deal-desk app and understand it. That's a trust moat neither competitor has.

2. **Live editing a running prod app.** LAE-* (flagship) reshapes live apps with data/session preservation. Retool and Lovable both require a rebuild-redeploy cycle. This is the single biggest product differentiator Clear has once it ships.

3. **AI cost safety baked in.** Retool and Lovable let a runaway agent burn $500 overnight on your card. Clear's v2 wraps every `ask claude` in Cloudflare AI Gateway automatically — rate limits, spend caps, caching. Marcus never wakes up to a surprise bill.

4. **Agents are first-class, not bolted on.** Retool AI is a copilot inside the builder. Lovable generates React. Clear has `ask claude`, `has tools:`, `remember conversation`, `knows about:` as language primitives that compile deterministically. Building an agent app in Clear is ~20 lines; in Retool it's a stitched-together workflow; in Lovable it's React + vendor SDK.

**The one place Retool/Lovable currently beat Clear:** time from signup to first working app. Retool has 10,000 templates and a years-matured visual editor. Lovable has a mature chat-to-app loop. Clear has Studio + Meph + Core 8 templates. That gap closes with: more templates, better Meph onboarding (GTM-5), Builder mode (GTM-6). All on the near-term roadmap.

### Go-To-Market & Positioning (locked Session 35)

**Long-term anchor: Marcus.** Technical-adjacent RevOps person at 100–500 person B2B SaaS companies. Builds Zapier zaps, knows enough SQL to be dangerous, has a backlog of 15 internal tools nobody is going to build. Already comfortable in a code-adjacent UI.

**Why Marcus over Sara (non-technical ops):**
- 10x LTV ($50K → $200K/year by year 3 vs $5K → $20K)
- Higher stickiness — builds 30 apps, switching = recoding everything
- Real expansion path — one team → company-wide standard → enterprise contract
- Loud evangelist — RevOps community is tight (SaaStr Ops Stars, RevOps Co-op)
- Tolerates rough edges, gives feedback, builds with us
- Sara needs us perfect on day one — death by perfection

**Historical analog:** Vercel (devs first, no-code via v0 from a position of strength). Stripe (devs first, no-code 5 years later). Bubble (broad/no-code first → stuck at ~$30M ARR after 12 years). Pattern: every successful "expand to non-technical" play started technical. None went the other way successfully.

**Sara is downstream of Marcus.** Once we have 1000 paying Marcuses, we have the revenue, templates, community, brand, and polish to bring Sara in via Builder mode. Reverse doesn't work. Build Sara's templates as demo assets, but spend $0 marketing on her until 2027.

**Hero use case for Marcus landing page:** deal-desk approval queue. Reps submit discount requests, anything over 20% routes to CRO, agent drafts the approval summary. Universal RevOps pain, AI-shaped middle step.

**Pricing model: Vercel pattern (portable code, sticky platform).**
- Free: 1 user, 1 hosted app, 1K agent calls/mo, .clear export
- Team $99/mo: 25 apps, 50K agent calls, custom domain, 10 seats
- Business $499/mo: unlimited apps, SSO, audit logs, dedicated support
- Enterprise (custom): on-prem, dedicated CSM, $20K–100K ACV
- Three revenue levers stacking: per-seat × app count × agent usage. Target NDR 3x year over year.

**Studio readiness (revised 2026-04-21):** Marcus is comfortable *enough* in Studio today (3-panel IDE feels like Retool) to get work done — but the current layout still communicates "this is a developer tool." Current default = CodeMirror editor dominant, preview second, chat sidebar. That visual hierarchy tells Marcus he's trespassing in engineering's office. Builder Mode flips it: Meph chat is the driver, preview is the hero, code is a toggle. Promoted to P0 to ship alongside CC-4 (the Publish button is Builder Mode's centerpiece). Full six-change spec in the `Builder Mode` section below. Sara-blocking is now a secondary effect — primary motivation is making Studio feel built *for* Marcus, not tolerated by him.

| Priority | Item | Notes |
|----------|------|-------|
| GTM-1 | Build `apps/deal-desk/main.clear` | Hero use case for Marcus landing page. Discount approval workflow + agent. Target ~150 lines. |
| GTM-2 | Build `landing/marcus.html` | GAN against the ASCII mock locked this session. Headline: "That backlog of internal tools nobody's going to build? Ship the first one this Friday." |
| GTM-3 | Sketch `landing/pricing.html` | Free / Team $99 / Business $499 / Enterprise. Concrete agent quotas, app limits, seat counts. |
| GTM-4 | Find 5 real Marcuses on LinkedIn | DM, show Studio, watch what breaks. Fastest validation lever. |
| GTM-5 | Studio onboarding fix | New users land in Meph chat with "What do you want to build?" — not in the editor. Cuts bounce rate without building Builder mode. |
| GTM-6 | **Builder Mode (Studio Marcus-first layout)** | Flip Studio's hierarchy: Meph chat becomes the driver, preview is the hero (60% of screen), code goes behind a "Show Source" toggle (defaults ON first 3 sessions, auto-hides after). Branded Publish button top-right. Click-to-edit on preview elements. "What are you building?" tile gallery replaces the dropdown. Full detail in the `Builder Mode` section below. **Promoted P1 → P0 this session (2026-04-21)** — ships alongside CC-4 because the Publish button is Builder Mode's centerpiece. ~4 weeks. **v0.1 shipped 2026-04-21** (BM-1/BM-2/BM-3-minimal/BM-5 + feature flag, 31/31 tests) on branch `feature/builder-mode-v01`. |
| GTM-7 | Instrument Studio | First-click tracking, time-to-first-app, where signups bounce. Data drives Builder mode priorities. |

### Builder Mode — Marcus-first Studio layout (GTM-6 detail, 2026-04-21)

**The vibe shift in one sentence:** Clear Studio today says "here's a code editor (with a preview and a chat bolted on)." Builder Mode says "here's your app (talk to Meph to change it; view the source when you want)." Same primitives, different hierarchy.

**Why this ships alongside CC-4, not later:** the Publish button is Builder Mode's centerpiece. When CC-4 wires Studio's Publish to the Clear Cloud hosting stack, that button deserves to be branded, loud, and top-right — not buried in a menu. Without Builder Mode's layout shift, CC-4 lands in a UI that still communicates "this is for Dave," and the Marcus pitch leaks.

**The six changes:**

| # | Change | What it does | Scope |
|---|---|---|---|
| BM-1 | **Meph chat becomes the primary driver, not the sidebar.** Chat lives bottom-center or left, 35–40% of screen. Opens with "What do you want to build today, or which app do you want to change?" — not an empty editor. | Marcus's first instinct should be "type what I want," not "find the right file." | CSS grid shift + empty-state prompt. ~3 days. |
| BM-2 | **Preview is the hero, not the middle panel.** 60% of screen. Full-fidelity. When Meph ships, preview visibly updates — that's the dopamine. | Today preview feels like a side-effect of compilation; make it the subject. | Layout rework. ~3 days. |
| BM-3 | **Code goes behind a "Show Source" toggle. Defaults ON for first 3 sessions.** After 3 successful ships, auto-collapse. Source becomes the "prove-to-CFO" feature, not the daily interface. | Readable-source moat only works if Marcus sees source at least once. Then it fades out of the way. | localStorage counter + toggle. ~2 days. |
| BM-4 | **Click-to-edit on the preview.** Click any button/field/element → Meph chat opens with "Change this [button]?" pre-filled. | Bridges the 90% of Marcuses who can describe but not type code. Closes the gap between "I can see what's wrong" and "I know how to fix it." | Preview-iframe postMessage + Meph chat prefill. ~1 week. |
| BM-5 | **Publish button is branded, top-right, loud.** Not a menu item. First-time walkthrough: "Publish creates approvals.marcus.buildclear.dev — your teammates can use it in 30 seconds." | "Run" says "this is a dev app"; "Publish" says "this is real, you're shipping to real users." | UX copy + styling + first-time walkthrough. ~1 day. Wires to CC-4. |
| BM-6 | **"What are you building?" gallery replaces the template dropdown.** Tiles with screenshots, not 43 names. 5 Marcus apps on top, 38 demos in a "See more" drawer. | First impression = "this is built for me," not "this is a generic tool." | New empty-state component + screenshots of Marcus apps. ~3 days. |

**Plus: a status bar.** Users / agent spend / last ship — always visible at bottom. The trust/transparency chip Marcus will glance at all day. ~3 days.

**ASCII mock of the target layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Clear Studio   │ approvals-crm.clear         [⎘ Source] [⚡ Publish] │
├─────────────────────────────────────────────────────────────────┤
│                                           │                      │
│                                           │  💬 Meph             │
│          [ Live preview of the            │                      │
│            approvals app, 60%             │  > Add a region      │
│            of the screen ]                │    field, options    │
│                                           │    NA / EMEA / APAC  │
│   Click any element to ask Meph about it  │                      │
│                                           │  Meph: I'll add      │
│                                           │    'region' to       │
│                                           │    Approvals. Ship?  │
│                                           │                      │
│                                           │  [Ship it]  [Cancel] │
│                                           │  > _                 │
├───────────────────────────────────────────┴──────────────────────┤
│ 12 users · 3 active · $0.03 agent spend today · last ship 4m ago │
└─────────────────────────────────────────────────────────────────┘
```

With `⎘ Source` toggled ON, a third pane slides in from the right showing the `.clear` file — highlighted on whatever Meph just changed. Dev-mode escape hatch: `cmd+.` restores the current 3-panel layout for Russell / power users.

**What to keep (don't throw the baby out):**

- Compile-in-browser speed — that's the magic ingredient.
- Meph's existing tool set (edit_code, run_tests, compile, http_request, etc.).
- Source maps (click preview → jumps to source line) — still useful when source pane is open.
- Light/dark/nova themes. Ivory should be the Marcus default — warmer, less terminal-ish.
- 3-panel mode as an opt-in power layout via `cmd+.` or settings. Dave/Russell keep what they love; Marcus gets what he needs.

**Build order (BM-1 first, sequenced for visible progress each week):**

1. **BM-1 + BM-2 together** (1 week) — layout shift. Biggest visual change, ships as a feature flag `?studio-mode=builder`.
2. **BM-5** (1 day) — Publish button branding. Trivial, huge first-impression win. Wires to CC-4 dry when CC-4 lands.
3. **BM-6** (3 days) — "What are you building?" tile gallery. Replaces dropdown on empty state.
4. **BM-3** (2 days) — Show Source toggle + first-3-sessions logic.
5. **Status bar** (3 days) — users / spend / last ship chip.
6. **BM-4** (1 week) — click-to-edit bridge. Highest-leverage but most tricky — preview postMessage + Meph chat prefill + element inspection.
7. **Feature flag flip** (1 day) — Builder Mode becomes default for new users; `cmd+.` reveals 3-panel.

Total ~4 weeks of focused work. Ships alongside CC-4 (the Publish button is the visible Marcus-facing proof of everything CC-1/2/3 built underneath).

**The meta-insight:** Marcus's vibe isn't "I want a simpler tool." It's "I want a tool that believes in me." Current Studio's layout says *you're an engineer who uses AI as a helper*. Builder Mode says *you're a business operator, Meph is your pair, the source is proof that it's real*.

### Live App Editing (Flagship — "Change your app while it's running")

**The promise to Marcus:** *"Your app evolves with your business by talking to it. Nothing breaks."*

Today, the moment Marcus's approval app ships to his five employees, it's frozen — adding a field means opening Studio, editing source, recompiling, redeploying, and hoping nobody loses in-flight work. Live App Editing collapses that loop: Marcus chats with Meph about his running prod app, Meph proposes a change with a preview, Marcus approves, and the change ships to his team live with data and sessions intact. This is the single feature that separates Clear from every other internal-tool builder: Retool, Superblocks, Zite, and Lovable all force a rebuild-and-redeploy cycle, and none of them can safely reshape a running app because their source isn't human-readable. Ours is. The compiler owns the whole stack — source, schema, endpoints, UI — so it can reason about every change holistically, the way Rails/Django cannot.

**User story (Marcus, day 34 of using Clear):**

> Marcus's deal-desk approval app has been running for a month. His CRO walks over and says "we need a 'region' field on every approval so we can route EMEA separately." Marcus opens his live app in the browser — not Studio, not an IDE — clicks the little 🔧 badge in the corner, and types into Meph: *"add a region field to approvals, required, options are NA / EMEA / APAC, default NA."* Meph reads the running app, reports back: *"This is an additive change. I'll add 'region' to the Approvals table with default 'NA' for 12 existing rows, add a dropdown to the submission form, and a column to the admin view. Ship it?"* Marcus clicks Ship. The change goes live in 4 seconds. Jenna, who was mid-way through submitting an approval, sees the new field appear empty in her form — her amount and notes are still there. Nothing broke. Marcus tells the CRO "done" before the CRO has finished his coffee.

**Why only Marcus:** This feature is role-gated — only the app owner (and explicitly-granted admins) can push live modifications. Employees can't fork their own versions. The app is singular; the *evolution* is conversational. Per-user forks are explicitly out of scope (see "Not Building" below) because they destroy the shared ontology that justified building a shared app in the first place.

**Requirements:**

| # | Requirement | Why it matters |
|---|-------------|----------------|
| LAE-1 | **Owner-only authorization.** Live edits require the authenticated owner (or admin role) of the app. Non-owners see the app normally, with no edit UI. | Prevents chaos, prevents audit-log disasters, prevents employees quietly reshaping the workflow they're supposed to follow. |
| LAE-2 | **In-browser edit surface.** A floating Meph chat widget on the running app (not Studio, not a separate tool). Marcus opens his app at `approvals.buildclear.dev` and edits it in place. | The whole point is "talk to your running app." Forcing Marcus back to Studio breaks the promise. |
| LAE-3 | **Change classifier with hide-by-default semantics.** Every proposed diff is classified: `additive` (add field/page/endpoint — ships instantly); `reversible` (**remove = hide**, rename = expand+copy+hide, relabel, reorder — data never physically leaves the database, one-click un-hide); `destructive` (only the explicit "permanently delete" command or unavoidable type coercion — requires second-tier confirmation, a mandatory `reason` string, and an audit entry; **NO data snapshot** for the compliance case, since keeping a copy defeats the purpose of erasure). Soft-hide is the default for "remove" because non-engineers think of deletion like a desktop trash can, not an incinerator. Destructive delete means actually gone — if Marcus wanted recoverable, hide was the right path. | Safety comes from making the default reversible. When the user reaches for destructive, the seat-belt is the confirm flow + audit trail, not a hidden copy. A snapshot would create false assurance and break GDPR/CCPA/HIPAA erasure obligations. |
| LAE-4 | **Live-reload contract — preserve in-flight work.** When a change ships, connected browser sessions get the new version without losing unsaved form state, filled-in inputs, scroll position, or open modals. New fields appear empty; existing user input survives. | If Jenna loses her half-filled approval because Marcus added a field, the feature is dead on arrival. |
| LAE-5 | **Schema-change migration planner.** Type changes (`text → number`, `string → dropdown`, nullable → required) trigger a migration preview: "12 rows don't parse — coerce / default / reject?" Marcus picks; migration runs transactionally. | Data corruption is the #1 risk. No schema change ships without Marcus seeing what happens to existing rows. |
| LAE-6 | **Snapshot + 1-sentence rollback.** Every live edit creates a named checkpoint (source + schema + data snapshot). "Meph, undo the last change" or "Meph, go back to this morning" restores source, schema, and data in one command. | This is the safety net that makes Marcus edit bravely. Without it, every change feels terrifying. |
| LAE-7 | **Diff preview before ship.** Before applying, Meph shows the source diff (human-readable `.clear` changes) and the effective-change summary ("adds 1 field, 1 dropdown, 1 column, migrates 12 rows"). | Marcus's trust compounds when he can see what's about to happen. |
| LAE-8 | **Change log (audit trail).** Every live edit is recorded: who, what (diff + summary), when, who approved, rollback availability. Viewable per-app in Studio. | Compliance. When Marcus's CFO asks "why did the approval limit change on March 3rd," the answer is one query away. |
| LAE-9 | **Concurrent-edit guard.** If two admins try to edit live at the same time, the second one gets blocked or queued — never silently overwritten. | Split-brain is worse than slow. |
| LAE-10 | **Dry-run mode.** Marcus can preview a change against a staging copy of the app without shipping to employees. "Try this change for 10 minutes on a private URL, then decide." | Lets Marcus validate complex changes without risking a revert. |

**Out of scope (explicit non-goals):**
- Per-user forks of the app (different employees seeing fundamentally different apps).
- Per-user schema changes (Jenna can't add her own field that only she sees).
- Employee-initiated requests ("Jenna asks Meph to add a field, Marcus approves" is a future feature, not MVP).
- Preferences/sort/filter/theme/saved-views — those are normal product polish, not Live Editing.

**Phasing:**

| Phase | Scope | Rough effort | Status |
|-------|-------|--------------|--------|
| Phase A | LAE-1, LAE-2, LAE-3 (additive changes only), LAE-7 — Marcus adds fields/pages/endpoints live, with preview. | ~1 week | **Done 2026-04-18** (67 tests, 10/10 real-Meph eval) |
| Phase B | LAE-4 (live-reload contract), LAE-6 (snapshot + rollback), LAE-3 for reversible changes (hide, rename, relabel, reorder) | ~1 week | **Done 2026-04-18** (44 tests, 11/11 real-Meph eval) |
| Phase C | LAE-5 (schema migration planner), LAE-3 for destructive changes (explicit permanent-delete + unavoidable type coercion). **No data snapshot on destructive delete** — audit trail replaces it as the accountability surface (see design note below). | ~1.5 weeks | Not started |
| Phase D | LAE-8 (audit log), LAE-9 (concurrent guard), LAE-10 (dry-run) | ~1 week | Not started |

**Design note — why destructive delete has NO data snapshot (Phase C):**

The safety model inverts between tiers.
- **Reversible (Phase B, hide/rename):** snapshot the data because the whole point is "change your mind is free." Data doesn't move; undo is a markup toggle.
- **Destructive (Phase C, permanently delete):** do NOT snapshot the data. If a regulator audits Marcus over a GDPR erasure request and finds the data sitting in a snapshot he controls, the deletion claim is invalid. A snapshot creates false assurance for Marcus and legal exposure for the app owner.

What replaces the snapshot as the accountability mechanism: a **mandatory audit log entry** captured at destruction time, containing:
- when (timestamp, UTC)
- who (email + role at time of action)
- what (table + column + row count affected)
- references (every endpoint/page/agent that referenced the column)
- reason (free-text string the user MUST provide — e.g., "GDPR erasure ticket #412")
- confirmation method (must be "typed DELETE + click Confirm" — never one-click)

Auditors inspect the trail, not the data. That's what compliance actually wants.

Implementation corollary: every Phase C surface (permanent delete command, schema migration planner when the chosen path is lossy) requires the `reason` field before it'll ship. Meph refuses to proceed without one.

**Still needed to finish the Live App Editing flagship:**
- ~~Compiler change: emit widget script + `/__meph__/*` proxy in compiled apps.~~ **Done 2026-04-18** — any compiled Clear app with `allow signup and login` now auto-includes the edit widget and proxies `/__meph__/api/*` to `STUDIO_PORT` (with a clean 503 when the env var is absent in production). 7 tests in `lib/widget-injection.test.js`.
- Browser Playwright e2e covering owner→widget→ship/hide/undo on the three templates.
- Security: Studio's `liveEditAuth` middleware currently parses JWTs without HMAC verify — fine for the single-owner spike, must use `runtime/auth.js`'s `verifyToken` before any multi-user demo.

**Success metric:** Marcus ships 3+ live edits to his prod app in his first week without a single rollback-due-to-breakage. That's the bar.

**Positioning (don't generic-pitch "live editing" — every competitor claims that):**

> **"Never lose a user's form data when you change the app."**

The technical backing is **additive-by-default with expand-and-contract migrations**: new column before old one drops, dual-write during transitions, old schema still readable until every consumer moves over. Airtable-grade safety with Lovable-grade conversational interface — a combination nobody ships today.

**Competitive snapshot (researched Session 38):**

| Competitor | Live edit? | Schema safety | Session preservation | Rollback | Primary complaint |
|---|---|---|---|---|---|
| **Lovable** | No (publish = new snapshot) | Destructive; no preview | No | Third-party only | "Changes not reaching prod" after 2.0; 1.x→2.x regression |
| **Bolt.new** | No (every deploy live) | None; rewrites whole files | No | Git only | GitHub issue #9016 "Files Glitching as they are being rewritten"; 1.4/5 Trustpilot |
| **Retool** | **Partial** — Release Manager: draft vs. published | Manual schema migrations between envs | Not guaranteed | ✅ millisecond DB record swap | Developer-gated; non-devs can't push changes; "app reverting on its own" threads |
| **Superblocks / Clark** | No — Clark modifies source, not running instance | Enterprise governance gates; no live DDL | No | Git-based | AI edits source, not live apps |
| **Zite** | Partial (post-publish edits) | No public doc | No public evidence | No public evidence | Slow iteration on prompts |
| **v0** | No — explicit *"Cannot edit a published generation"* | N/A (frontend only) | Client reload kicks users off | Vercel deployment history | Can't edit after publish |
| **Budibase / Appsmith / ToolJet** | No (staging→prod via git) | Manual, connector-dependent | Not addressed | Git tags | Developer-gated |
| **Airtable / Notion** | ✅ Additive only | Additive-by-construction (API forbids table/column creation) | ✅ Yes | Revision history | (This is the prior art — replicate their safety model) |

**Verdict:** Real gap, defensible. The "chat-to-modify-live-app-without-breaking-users" slot is unowned. Primary risk: Retool bolts a real AI agent onto Release Manager. Window is roughly 12-18 months to plant the flag.

**Source quotes for landing page:**
- Bolt.new: *"rewrites the entire file, breaks your UI/UX structure, and still fails to fix the original problem"* (YeasiTech; GitHub #9016)
- Vibe-coding incidents: *"wiped production databases while explicitly instructed not to"* — 7 documented cases in 2025-2026 (Autonoma)
- Lovable 2.0: *"none of my changes are getting pushed to prod even after updating"* (Trustpilot)
- v0: *"Cannot edit a published generation"* (Vercel community)

### Ghost Meph — research-velocity unlock (2026-04-21, P2 research #1)

**The insight:** Every curriculum sweep, flywheel training run, and A/B reranker test that uses real Meph bills against `ANTHROPIC_API_KEY`. Session 41 burned $168 in one day on sweeps. If `/api/chat` can route to a non-Anthropic-org brain for research runs, sweeps become ~free and research velocity goes up 10×.

**Why this works for RL flywheel data specifically:** most of the Factor DB's value is in deterministic signals — compile outcomes, parser errors, archetype classification, patch success/failure. These are the same regardless of which model writes the source. A weaker model writing broken Clear triggers the exact same validator errors real Meph does. That means ~90% of the training signal transfers from a Ghost-Meph brain to real Meph. Only the "which hints THIS model found useful" label doesn't transfer cleanly — reserve real Meph for periodic calibration runs, use Ghost Meph for bulk data.

**Architecture — provider-agnostic brain:**

```
MEPH_BRAIN=cc-agent          # Claude Code sub-agents (MVP default)
MEPH_BRAIN=openrouter:qwen   # Scale — truly $0, overnight bulk
MEPH_BRAIN=ollama:qwen3      # Fully local / air-gapped
MEPH_BRAIN=anthropic-haiku   # Calibration on bounded dev key
```

One pluggable interface in `playground/server.js`. Call sites never know which brain answered. Swap is a config change, not a code change.

**Backend comparison:**

| Backend | Cost | Quality | Latency | Use case |
|---|---|---|---|---|
| CC sub-agents | $0 on Anthropic org, counts CC quota | Highest (Claude family, same as real Meph) | Sub-second | MVP + iterative research |
| OpenRouter Qwen Free | $0 truly | Respectable, more drift from Clear conventions | 11.5s TTFT | Overnight bulk sweeps |
| Ollama local | $0 + compute | Depends on model | Slow on consumer HW | Air-gapped demos, total privacy |
| Haiku via dev key | Bounded $ | Production-match | Sub-second | Calibration runs (every 100 apps, confirm Ghost data matches real) |

**Research-data implications:**

- **Bulk curriculum data + compile/archetype signal** → Ghost Meph gives 90%+ of what you need, free.
- **Honest-label quality data** ("did THIS model find the hint useful?") → still needs real Meph occasionally. Run calibration batches with Haiku backend once per 100 Ghost-Meph apps.
- **Cross-model transfer research** → Qwen backend produces a second data distribution. If reranker hints trained on Ghost-Meph-Claude data still help Ghost-Meph-Qwen, transfer claim becomes publishable.

**Build order (separate PRES cycle, not tonight):**

| # | Item | Scope |
|---|---|---|
| GM-1 | **Stub `/api/chat`.** Env-gate: `if (process.env.MEPH_BRAIN) routeToStub(body); else hitAnthropic(body);`. Preserve full tool-use protocol (tool_use blocks match Anthropic's JSON shape). | 2 days |
| GM-2 | **CC sub-agent backend.** IPC to a Claude Code agent process. Protocol: prompt in, tool calls out, iterate. | 2 days |
| GM-3 | **OpenRouter backend.** HTTP calls to `qwen/qwen3.6-plus-preview:free`. Handle preview-tier quirks (rate limits, disappearing models). | 1 day |
| GM-4 | **Ollama backend.** HTTP to `localhost:11434/api/chat`. Config for model name. | 1 day |
| GM-5 | **Calibration harness.** `curriculum-sweep.js --calibrate` runs N tasks on Ghost + same N on real Haiku, compares Factor DB row distributions, flags drift. | 2 days |
| GM-6 | **Switch default research sweep to Ghost.** `curriculum-sweep.js --workers=3` uses `MEPH_BRAIN=cc-agent` by default. Explicit `--real` flag required to hit production Anthropic. | 1 day |

Total ~9 days. Highest-ROI research-velocity investment on the roadmap.

**Privacy posture:** curriculum tasks are synthetic ("build an approval queue") — safe to send to any backend. Ghost Meph must NEVER be used for real customer apps in production; it's a research-only tool.

**Call it out explicitly:** this doesn't replace real Meph — it supplements. Real Meph still ships to Marcuses. Ghost Meph just lets research move 10× faster without Russell's API bill being the constraint.

### Flywheel / Training Signal (Session 38 in-flight)

The RL thesis moves forward in small, measurable steps. Each item below compounds the ones below it — do them in order.

| # | Item | Status | Impact |
|---|------|--------|--------|
| RL-1 | **Meph runs on Haiku 4.5 by default.** `MEPH_MODEL` env var overrides to Sonnet for A/B. 15/16 vs 16/16 on eval-meph; within 6% of Sonnet capability at 3x cheaper per row. | ✅ Done (Session 38) | ~$2k saved per 10k-row sweep |
| RL-2 | **Step-decomposition labeling.** Every compile row now tagged with which task milestone Meph has hit (`step_id`, `step_index`, `step_name`). Sweep prints per-step rollup: attempts, compiles, tests passed per step. Seeded on 2 tasks (todo-crud, webhook-stripe). | ✅ Done (Session 38) | 4x signal density per sweep |
| RL-3 | **Classifier fuzzy-match fixes.** Dashboards with 1 chart misroute to "dashboard" (should route to KPI). Webhooks on `/hook` paths route wrong. Small regex additions in `archetype.js`. | Next (30 min) | Unlocks balanced archetype distribution |
| RL-4 | **Seed steps on the other 28 curriculum tasks.** 2 tasks seeded; the rest still fall into the unlabeled bucket in stepStats. | Next (1 hr) | Step-decomposition coverage from 7% → 100% |
| RL-5 | **Sharpen the 5 archetype task descriptions.** Explicit archetype signals so Meph doesn't guess wrong on webhook/batch/sync/ETL/dashboard shapes. | Next (30 min) | Prevents classifier poisoning the DB |
| RL-6 | **First full re-sweep with Haiku + steps + fixes.** Overnight run populating the Factor DB with step-labeled, cheap, well-routed rows. First training-ready dataset. | After RL-3/4/5 | Unlocks EBM training at 200 rows |
| RL-7 | **Honest-label tag reliability + inference fallback.** Meph emits `HINT_APPLIED: yes\|no, tier=X, helpful=Y` after hint-served compiles — but tag rate was ~45% because task-focused agentic loops skip the meta-observation. (a) Tightened the system-prompt as a reflex rule. (b) Added server-side inference: when no tag AND a later compile in the same turn had fewer errors → log `applied=1, helpful='inferred'` (distinct value, doesn't pollute honest set). | ✅ Done (Session 40) | Should double-ish the effective label rate from sweeps; full validation after next 3 sweeps |
| RL-8 | **Retrain ranker on honest-helpful labels.** Once `hint_helpful='yes'` count crosses ~50 (currently 10), filter training data to those rows and train a secondary pairwise ranker. Honest labels are a stronger signal than the proxy `test_pass` — ranker picks hints Meph himself rated useful. | Next (blocked on data volume) | Quality-filter over the test-score signal |
| RL-9 | **`caller` as canonical magic var + compiler shadow fix.** Renamed the authenticated-user magic var from the multi-word `current user` to the single-word `caller` (legacy forms still work as synonyms). Fixed a compiler bug where bare `user` in backend mode ignored local shadowing and always emitted `req.user`, even when the endpoint declared a `user` receiving var — `send back user` was returning the caller instead of the body. Users-table endpoints can now use `user` as their receiving var without the previous `signup`/`profile`/`account` workaround. | ✅ Done (Session 40) | Uniform entity-name rule; silent data-leak class of bug closed |

### Compiler Flywheel — second-order moat (Session 38 idea, Phase 2)

**The insight:** Today's flywheel makes *Meph* write better Clear over time. But we never measure whether the *JS/Python/HTML the compiler emits* is optimal. Every emit function is hand-written by Russell/Claude — "reasonable" but not proven best. A second flywheel, running at the compiler layer, can let production data pick the emit strategy that actually performs.

**Four tiers by ROI:**

| # | Tier | Cost | Unlock |
|---|------|------|--------|
| CF-1 | **Runtime instrumentation.** Compiled apps emit latency / error / memory beacons to a shared endpoint. Factor DB gains runtime-outcome columns per compile row. | 1 day | We finally *know* which compilation choices produce slow or crashy JS. Data-driven compiler bug-reports instead of gut-feel. |
| CF-2 | **Candidate emitters + deterministic A/B.** For the top 10 emit patterns, define 2–3 JS/Py variants. Feature-flag which variant is emitted per app (deterministic at compile time, not runtime — preserves "same input = same output" rule within a build). After N apps run each variant, production data picks the winner. | 1 week | Quantitative answer to "which JS pattern is best for `get all X where Y`?" instead of whoever wrote the emitter first. |
| CF-3 | **Compiler-strategy reranker.** EBM trained on (archetype, app shape, runtime outcome) → which emit variant should I pick? Same glass-box model as the Meph reranker, one layer deeper. | 2 weeks (after Meph reranker trained) | Per-pattern emit strategy auto-selects based on context. Compiler gets smarter per app. |
| CF-4 | **GA-evolved compiler (research).** Mutate emit functions themselves. Fitness = curriculum pass rate + runtime perf. RESEARCH.md already has a GA for candidate Clear programs — this is the same idea one abstraction up: evolve the compiler. | 2+ months (research, not product) | The compiler becomes a learned artifact, not a hand-coded one. This is the moat nobody else architecturally can copy — a compiler that improves from usage. |

**Error-message flywheel (bonus, easy):** Track which compile error messages correlate with STUCK sessions. Auto-flag "bad error messages" for rewrite. Already half-built via the existing Factor DB.

**Why ship CF-1 soon, not CF-2-4:**
- The Meph-level flywheel is not yet validated. Don't add a second flywheel before the first is proven.
- Compiler quality is *not* the current bottleneck — Session 38's webhook bug proved the bottleneck is Meph writing broken Clear (parser gaps, wrong syntax), not the generated JS being suboptimal.
- BUT: CF-1 is 20 lines of instrumentation that starts collecting data now. Cheap optionality. Data collection compounds before you decide to act.

**Not-now but write it down:** CF-4 is a publishable research direction. If Augment Labs track becomes primary, this is where that work lives.

### Language Completeness

Clear's job is: Russell tells an LLM what to build, the LLM writes Clear, it compiles to working software. If the LLM needs a feature to build what Russell asked for, Clear needs it.

| Priority | Feature | Syntax | Status |
|----------|---------|--------|--------|
| P1 | Error throwing | `send error 'message'` / `throw error` / `fail with` / `raise error` | **Done** |
| P2 | Finally block | `try:` ... `finally:` / `always do:` / `after everything:` | **Done** |
| P3 | First-class functions | `map_list(items, double)` — pass fn refs as args | **Done** (works natively) |
| P4 | Decorators / middleware | `before each endpoint:` | Skipped — built-in middleware covers use cases |
| ✅ P5 | `clear serve` ESM fix | ~~CLI serve crashes with `require is not defined`~~ **DONE (Session 37):** `clear build` now writes `package.json` containing `{"type":"commonjs"}` alongside the generated `server.js`. Node walks up from `server.js`, finds this sibling, and treats the file as CommonJS — shielding it from any parent project's `"type": "module"` setting. Tested in ESM project: ESM error gone. |

### Performance (Session 35 — real gaps found via competitive research)

Every internal tool builder has performance problems at scale. Retool chokes because everything runs in the browser. Lovable/Bolt choke because AI-generated code has no optimization guarantees. Clear's architecture is better (server-side CRUD, vanilla JS frontend, no framework overhead) but has real gaps:

| Priority | Gap | Current Behavior | Fix | Impact |
|----------|-----|-------------------|-----|--------|
| ✅ PERF-1 | **No pagination** | ~~`get all Users` → no LIMIT.~~ **DONE (Session 37):** `get all` emits `LIMIT 50` by default. Opt-out with `get every`. Supabase path gets `.limit(50)` too. | — | Every list endpoint is now safe by default. |
| ✅ PERF-2 | **Aggregations are client-side** | ~~All aggregates fetch then reduce.~~ **DONE (Session 37):** `sum of price from Orders` compiles to `db.aggregate('orders', 'SUM', 'price', {})` → `SELECT SUM(price) FROM orders`. Filtered aggregates supported: `sum of price from Orders where status is 'paid'` → `{ status: 'paid' }` filter. `in variable` kept as in-memory path for backward compat. | — | Dashboards now single-query instead of full-table-scan-then-reduce. |
| ✅ PERF-3 | **Search returns all matches** | ~~No LIMIT on search.~~ **DONE (Session 37):** `search X for q` appends `.slice(0, 100)` to the filter expression. | — | Prevents runaway result sets. Future: push to SQL LIKE for real server-side LIMIT. |
| ✅ PERF-4 | **No virtual scrolling** | ~~`display X as table` renders every row into the DOM.~~ **DONE (Session 37):** `display X as table` now compiles to a call to `_clear_render_table(...)`. Below 100 rows, it renders everything (DOM handles it fine). At 100+ rows, it uses fixed-height virtualization: 40px rows, 560px scrollable container, 5-row buffer. Only visible rows + buffer hit the DOM — a 500-row table shows ~24 `<tr>` elements; a 50,000-row table shows the same ~24. Scroll handler bound once per element, repainted on scroll and on reactive re-render. Browser-verified on 500 rows. | — | Table view is now bounded regardless of dataset size. |
| ✅ PERF-5 | **Explicit page N, M per page still fetched all rows** | ~~Compiler emitted `findAll()` then client-side `.slice()`.~~ **DONE (Session 37):** `page N, M per page` now compiles to `db.findAll('items', {}, { limit: N, offset: (page-1)*N })` → SQL `LIMIT N OFFSET M`. Works for literal page numbers (offset precomputed at compile time) and runtime variables (offset expression). Supabase path already used `.range()` server-side — no change needed there. | — | Explicit pagination is now truly server-side. |

**What's already fine:**
- CRUD ops (save/delete/update) → server-side SQL. Single-row ops. Fast.
- Auth/security → server-side Express middleware. No browser cost.
- Agent calls → server-side API calls. No browser cost.
- Compiled output → vanilla JS + HTML. No React/Vue framework overhead.
- Charts → ECharts. Client-side but handles reasonable datasets well.

### Platform Quality

| Priority | Feature | Notes |
|----------|---------|-------|
| P6 | Studio Test button | **Done.** Tests tab in preview pane. Run App Tests + Run Compiler Tests buttons. Meph `run_tests` tool. Structured pass/fail with error details. |
| P7 | ClearMan (API tester) | "Try it" button per endpoint in API tab. Postman built into Studio. |
| P8 | Compiler-generated tests | **Done.** Auto-generated E2E tests with English names, CRUD flow tests, agent smoke tests. |
| P9 | Multi-file download | Zip: `server.js` + `index.html` + `package.json`. Single files don't deploy. |
| P10 | `clear test` runner fix | User-written `test` blocks aren't picked up by `clear test` CLI (R5 in refactoring backlog). |

### Mechanical Test Quality Signals (Session 36b — shipped)

Three pieces shipped on `feature/test-quality-signals`. Moved out of the
active roadmap because all three are done; full session entry in
`CHANGELOG.md` and design rationale in `RESEARCH.md`.

### Private Moonshots — if the goal is delight, ambition, and "this should not exist"

These are the features that make Clear feel like a private cathedral project instead of a sane startup roadmap.

| # | Item | Status | Why it's fun |
|---|------|--------|--------------|
| PM-1 | **Time-travel app editing.** Every ship becomes a named snapshot with source diff, data diff, screenshot diff, and "why this changed" note from Meph. One-click scrub through app history like a video editor. | Idea | Turns software development into a visible narrative instead of invisible file churn |
| PM-2 | **Compiler strategy arena.** Let multiple emit strategies compete per pattern (`table render`, `CRUD handler`, `auth middleware`, `chat UI`) and keep score from runtime behavior, evals, and visual diffing. | Idea | Makes the compiler feel alive and self-optimizing |
| PM-3 | **App MRI / X-ray mode.** Click anything in a running app and see the Clear line, generated JS, DB fields, tests, recent failures, and Meph's last relevant edits for that surface. | Idea | The most on-brand expression of "readable software" in the whole repo |
| PM-4 | **Production replay lab.** Capture real sessions, then replay them deterministically against older and newer compiler/app versions to see what changed, what broke, and what got faster. | Idea | Gives you a toy-box for debugging, evals, and compiler evolution all at once |
| PM-5 | **Semantic migrations with negotiation.** For destructive schema changes, Clear doesn't just error — it opens an interactive planner: keep, coerce, split, rename, archive, or ask Meph to propose the safest path. | Idea | Feels like database evolution grew a brain |
| PM-6 | **Multi-agent build theater.** Several Meph variants build or critique the same app from different perspectives (readability, security, speed, design), then a supervisor merges the best parts with a visible reasoning trace. | Idea | Maximalist, theatrical, and perfect for a private software lab |
| PM-7 | **Generated tests for everything visible.** Not just endpoints and forms — every button, state transition, empty state, chart, permission boundary, and recovery path gets generated probes and explanation text. | Idea | Pushes the "compiler tests everything" thesis to its ludicrous endpoint |
| PM-8 | **Living architecture reports.** Every app gets a gorgeous browsable dossier: entity graph, endpoint graph, page graph, permission graph, agent graph, and failure hotspots, regenerated on every compile. | Idea | Makes Clear apps feel like inspectable machines, not blobs of code |

### Research Priority Order (revised 2026-04-19)

Previously SK-1 (cross-domain transfer) was treated as the single flagship. It is not the most ambitious laptop-feasible question Clear can answer. Full rationale and candidate comparison in **`RESEARCH.md` → "Flagship Research Candidates — Ranking the Most Ambitious Laptop-Feasible Questions"**.

**Revised sequencing:**

1. **SK-3 — Constrained-language scaling laws.** Does a small LLM writing Clear match a big LLM writing Python on the same spec? If yes, constraints beat scale for bounded problem classes — a Bitter Lesson counterexample. Infrastructure mostly live; a weekend's runs produce a paper or a clean null.
2. **SK-2 — Provably minimal agent-iterated programs.** Does GA+reranker iteration converge on the provably-minimum Clear program for a spec? Verified by exhaustive enumeration over the 11-op patch space. FunSearch / AlphaEvolve never claim minimality; Clear's closed grammar makes it uniquely tractable.
3. **SK-1 — Cross-domain transfer (original flagship).** The entry below. Still valuable; stronger as paper #3 because you can frame it as "minima from domain A transfer to domain B" rather than just "F1 improves."
4. **SK-4 — Emergent-algorithm detection.** "Move 37" for programs — did the GA discover an algorithm genuinely not in the training corpus? Highest intellectual ceiling, hardest to score. Do last once Clear is an established research platform.

**Parking lot** (not first-flagship): decidable Clear (PhD-scale), compression-as-signal (good methodological paper), cross-target transfer (good warm-up paper). All catalogued in RESEARCH.md.

**Why this ordering, not the reverse:** scheduling convenience would put transfer first (infrastructure is most complete). Research strategy puts scaling laws first so each paper makes the next one stronger — "constraints matter" → "constraints find optima" → "optima transfer." Rising arc, not flat sequence.

**Updated 2026-04-23 evening — three new threads added (SK-5/6/7/8):**

Session 44's A/B result (hints lift CRUD pass rate by +30pp) validated the core flywheel claim on one archetype. That opens three research threads that weren't on the list before:

- **SK-5 — Self-play synthetic task generation.** May actually be the biggest. Takes the flywheel from "improves per session filed by users" to "improves monotonically while you sleep." AlphaGo-literal pattern. Likely precedes SK-3 in priority if the A/B scales to 5+ archetypes.
- **SK-6 — Tiny model distilled on Clear.** Possibly the biggest COMMERCIAL result. Uses Clear's small grammar + free oracle to make a 7B local model competitive with frontier on Marcus-shaped apps. $500-5000 first experiment.
- **SK-7 — Test-time compute scaling on clean oracle.** One-afternoon experiment, ~$20. Publishes a scaling law nobody else can cleanly measure.
- **SK-8 — Safety-by-construction paper.** Different audience; runs in parallel. No experiment cost — it's a framing paper on an artifact that already exists.

**New priority hypothesis (to confirm after next A/B):** scale the A/B to 5 archetypes (confirm flywheel generalizes) → decide whether SK-5 or SK-6 is the first paper. SK-7 is cheap enough to run anytime. SK-8 writes when any of them lands.

### Solo Karpathy Moonshot

If the goal is "one obsessed person, some LLM API calls, a ThinkPad, and a result that makes serious ML people raise an eyebrow," the strongest bet is a cross-domain program-evolution lab.

| # | Item | Status | Why this is the one |
|---|------|--------|---------------------|
| SK-1 | **Cross-domain program evolution lab.** Run GA-style Clear program evolution on one domain, train an interpretable EBM reranker on structural features of the winning programs, then show that the reranker improves generation-1 results on a different domain. Wrap the whole thing in a replayable "evolution notebook" with variants, scores, learned rules, and transfer charts. | Target (#3 in revised priority order — see above) | Research-grade claim, CPU-friendly, tightly aligned with Clear's core thesis, and impressive precisely because it does not require giant-model fine-tuning or large infra |
| SK-2 | **Provably minimal agent-iterated programs.** Given a spec, does GA+reranker iteration converge on the provably-minimum Clear program — the one no shorter program can satisfy? Verified by exhaustive enumeration over the 11-op patch space. Full rationale in RESEARCH.md. | Target (#2 in revised priority order) | FunSearch / AlphaEvolve never claim minimality; Clear's closed grammar makes exhaustive enumeration tractable up to ~10-line programs |
| SK-3 | **Constrained-language scaling laws.** Does a small LLM writing Clear match a big LLM writing Python on the same spec? Fixed specs × {Haiku, Sonnet, Opus} × {Clear, Python}. If the Clear column flattens while Python slopes up, constraints beat scale for bounded problem classes. | Target (#1 in revised priority order — do first) | Bitter Lesson counterexample. Anthropic-relevant. Infrastructure mostly live. Weekend of runs produces paper or null. |
| SK-4 | **Emergent-algorithm detection.** Did the GA discover an algorithm genuinely not in the training corpus? Clear's readable 1:1 compile output makes novelty auditable in a way FunSearch's cryptic Python output does not. | Target (#4 in revised priority order) | Highest intellectual ceiling of any candidate; hardest to score cleanly. Operationalizing "novel" is the whole game. |
| SK-5 | **Self-play synthetic task generation (AlphaGo move for code).** A meta-Meph writes app specs; Meph attempts each; tests grade pass/fail; passed specs become new curriculum, failed specs feed ranker + compiler-GAN loops. Unlimited training data without humans. Session 44 evening A/B showed hint-lift on CRUD; scaling the data input side with self-play multiplies it. | **Added 2026-04-23 evening** | THE AlphaGo-shaped move. Their oracle was "did I win?"; ours is "did tests pass?". Both cheap, both automatic. Turns the flywheel from "improves per filed session" to "improves while you sleep." Likely bigger than SK-3 if it works — unlocks monotonicity-with-corpus-size experiments at a scale hand-curation can't reach. |
| SK-6 | **Tiny-model distillation (domain-specific LM beats frontier on Clear).** Fine-tune an open 7B model (Llama 3.2, Qwen 2.5) on 10K distilled Meph-writes-Clear traces; use the flywheel's test-outcome signal for RL; measure pass rate vs Claude on held-out tasks. First experiment: ~$500-5000 compute. | **Added 2026-04-23 evening** | Clear's small grammar (119 node types) + deterministic compiler + tests-as-oracle = the rare domain where small-specialized can beat big-general. Bitter Lesson counter-example. If it works: local inference, zero API cost, browser-side Meph, "your code never leaves your machine" enterprise story. Paper claim: "DSL + test-oracle enables small-model code gen without RLHF." |
| SK-7 | **Test-time compute scaling on a clean oracle (o1/R1 direction).** Best-of-N Meph attempts per turn, tests grade, measure the pass-rate curve as N grows (1, 3, 5, 10, 20). Publish the scaling law. | **Added 2026-04-23 evening** | o1 and DeepSeek-R1 showed inference-time compute matters, but their quality signals are noisy (human preference / LLM-as-judge). We have deterministic tests. First clean scaling-law measurement in real-world code. ~$20, one afternoon. Result is a cited reference point. |
| SK-8 | **Safety-by-construction paper.** Frame Clear's "compiler generates all security tests + forbids unsafe patterns by construction" as the first structural (not behavioral) safety guarantee for AI-written code. Paper claim: a DSL + deterministic compiler is sufficient to eliminate classes of vulnerabilities that prompt-tuning alone cannot reach. | **Added 2026-04-23 evening** | Alignment-researcher audience + enterprise security audience. Different funding pool from ML-performance papers. Enterprise customers (banks/legal/healthcare) will eventually need this; we have the artifact that proves the claim. |

### Agent Self-Heal (ASH) — unwrap the tool surface Meph uses

Prompted by Browser Use's "Bitter Lesson of Agent Harnesses" (2026-04) — don't wrap what the LLM already knows. Meph's MCP surface (28 tools) currently disables Claude's built-in Bash/Read/Write via `--tools ""` for Factor DB instrumentation cleanliness. Trade-off may be wrong: Meph has no escape hatch when the 28 tools don't cover his need, and can't propose/edit his own surface. Claude-on-this-repo got the self-heal flywheel tonight (propose-new-hooks + propose-new-tools + meta-learnings-updater); Meph doesn't have the equivalent. Three items, ranked by leverage:

| # | Item | Status | Why |
|---|------|--------|-----|
| ASH-1 | **Bash-re-enable A/B on 5-task sweep.** Run curriculum-sweep with `--tools "Bash,Read,Edit,Write"` re-enabled side-by-side against current `--tools ""` config. Hypothesis: pass rate goes UP because Meph self-heals gaps the 28 MCP tools have. Cost: some instrumentation loss on investigation-level bash calls (not code-writing actions, which still flow through edit_code + compile). **Added 2026-04-24.** | Queued next session | Cheapest test of the thesis. \$0 via cc-agent. Answers "does Meph need the escape hatch?" empirically instead of by argument. |
| ASH-2 | **`meph_propose_tool(name, sketch)` \u2014 Meph writes candidate tool to `.claude/meph-tool-proposals/` for Russell to review weekly.** Same pattern as our new `propose-new-hooks` hook, applied to Meph's surface. When Meph hits "tool doesn't exist for X," he proposes one instead of just stopping. Russell approves → Meph's surface grows. | Queued next session | Unlocks the "agent edits own harness" loop for Meph. Without this, Meph's tool set is frozen between Russell's manual additions. |
| ASH-3 | **Principle-5 audit of meph-tools.js \u2014 which tools wrap things the LLM already knows?** Specifically: run_command, http_request, read_file. These are candidates for deletion if ASH-1 succeeds. Keep tools that carry genuine domain logic: compile (Factor DB + hints + classifier), run_tests (test parsing), edit_code (source mutation with validation). Delete wrappers that the re-enabled Bash/Read/Write already cover. | Queued after ASH-1 | Fewer tools = less surface for drift between MCP + server.js + test expectations. Cleans up the Cross-Path Tool Side-Effects rule's target surface. |

**ASH collectively tests Meta-learnings.md Principle #5** ("Don't wrap what the LLM already knows") on Meph's tool surface. If ASH-1 wins, the entire MCP tool layer may get leaner; if ASH-1 null, we keep the instrumentation-heavy wrapper approach and have data to cite.

### Other Laptop-Scale Research Bets

If SK-1 is the flagship claim, these are the other compact bets that could still produce a real result on one machine.

| # | Item | Status | Why it might matter |
|---|------|--------|---------------------|
| OL-1 | **Search-space compression benchmark.** Compare Clear vs Python on the same program-search tasks: valid-candidate rate, mutation survival rate, convergence speed, and token cost. | Idea | Quantifies the core claim that constrained readable languages make search dramatically easier |
| OL-2 | **Readable-source debugging benchmark.** Paired bug-fix tasks in Clear vs JS/Python: measure fix rate, latency, retries, and cost for the same model under the same harness. | Idea | Strong practical claim: readable 1:1 source improves automated debugging, not just aesthetics |
| OL-3 | **Error-message learning loop (a.k.a. compiler-as-adversary GAN).** Mine Factor DB for the compile errors that cost the most Meph-minutes, rewrite the worst ones, measure downstream pass-rate lift. `scripts/top-friction-errors.mjs` produces the prioritized list automatically. **Session 44 evening analysis:** 7 of the top-10 errors are one class — the "you used X but X hasn't been created" message mis-firing on reserved words and Clear-specific keywords. Rewriting that single error-generator with keyword-aware branching ships 7 fixes in one commit. **Executing now.** | **In progress** | Small, falsifiable, on-theme: better explanations as capability amplification. Compiler fixes are permanent + global vs ranker help which is session-scoped. |
| OL-4 | **Task-curriculum teacher.** Instead of only learning over programs, learn which next task or archetype best improves the reranker fastest. | Idea | Meta-learning over training order, still feasible with the existing supervisor/factor DB setup |
| OL-5 | **Counterexample co-evolution.** Evolve small adversarial test generators against Clear programs, then measure whether programs hardened against them transfer better to unseen edge cases. | Idea | More exciting than static evals and still laptop-friendly if the domains stay small |

---

## Competitive Landscape (Session 35 — sourced from G2, Capterra, Reddit, product pages)

### Direct Competitors

**Retool** — $450M+ raised, incumbent. Developer-only (needs JS + SQL). $10-50/seat/mo. Large apps "extremely cumbersome to maintain, nearly impossible to test." 2023 breach exposed 27 cloud customers. Our edge: no developer needed, readable source, auto-generated tests, compile-time security.

**Superblocks** — $60M raised, enterprise-focused. $49/creator/mo. G2 reviewers call lack of automated testing "a deal breaker." Has "Clark" AI agent (won 2025 AI Breakthrough Award) but generates black-box output. Our edge: readable source, deterministic compilation, built-in tests.

**Zite** — Closest competitor. 100K+ teams. AI-native, prompt-to-app. Aggressive pricing: $0/15/55/mo with unlimited users on all plans including free. SOC 2 Type II, SSO, Salesforce integration, built-in database with spreadsheet UI, custom domains. Acknowledged weaknesses: smaller template library, not for consumer/mobile apps. **Key gap vs Clear:** AI-generated black box (can't read what it built), no agent primitives, no compile-time guarantees, no deterministic output, "modify with follow-up prompts" = re-prompt AI and hope (same Lovable/Bolt problem). **Key gap vs Zite:** they have hosting, compliance, integrations, marketplace, 100K users. We have zero. All platform stuff, all buildable — but they're ahead.

**Lovable** — AI app generator. Gets you "70% of the way there." Users report "unable to diagnose problems hidden deep within code they couldn't read." Credits burn on AI mistakes. "Simple requests would fail and break unrelated parts." Our edge: readable source, deterministic compiler, no credit roulette.

**Bolt.new** — AI app generator. "Rewrites the entire file, breaks your UI, and still fails to fix the original problem." Users spend "$1,000+ on tokens just debugging." Context degrades past 15-20 components. Our edge: edit one line, only that line changes. No token burn.

### Developer-only tools (different category — Marcus can't use these)

**Appsmith** — Open source, self-hosted. G2 4.7/5. "Not for non-technical people. Period." Needs SQL + JS. Performance degrades with large datasets. Free self-hosted.

**Budibase** — Open source. G2 4.5/5. "Open source bait and switch" — licensing changes angered community. Automations are fragile ("publishing a new one can break all existing automations"). Permissions are screen-level only.

**ToolJet** — Open source. 25K GitHub stars. Best visual design quality in head-to-head comparisons. $19/builder/mo. Community maturity and stability scored lower than Appsmith.

### Simple/portal tools (different category — too limited for Marcus)

**Softr** — Best for non-technical users IF data lives in Airtable. Pricing pivot destroyed trust (user limit dropped from 2,500 to 500 with no price reduction). Customization ceiling is low. Airtable-bound.

**Noloco** — Airtable/Sheets integration. Imposed 50,000 row limit mid-flight with no warning. Reliability degrades at scale. Small team, variable support quality.

### New AI-native entrants (watch list)

**AgentUI** — Claims non-technical teams built enterprise-grade apps. 500+ teams. No independent reviews yet.

**Bricks.sh** — 1.6M EUR pre-seed (Jan 2026). One-click admin panels from your API/database. Too early to evaluate.

### Clear's unique position (backed by competitive data)

Every tool on this list either requires a developer (Retool, Appsmith, Budibase, ToolJet) OR generates black-box output the user can't read or modify precisely (Lovable, Bolt, Zite). Nobody gives you:
1. **Readable source code** a non-technical person can understand
2. **Deterministic compilation** (same input = same output, always)
3. **Built-in AI agent primitives** with guardrails
4. **Compile-time security guarantees** (27 bug classes eliminated)
5. **Auto-generated tests** from the source
6. **Portable output** (cancel and keep your compiled JS)

That combination is unique. The gap to close is platform: hosting, compliance, integrations, marketplace, users.

---

## Future (Not Committed)

| Feature | Syntax | Notes |
|---------|--------|-------|
| Stripe Checkout | `create checkout for 'Pro Plan' at 29.99 monthly:` | Subscriptions + hosted pages. Extends existing `charge via stripe:` |
| Supabase File Storage | `upload file to 'avatars' bucket` | Supabase Storage API |
| Supabase Auth | `allow login with magic link` / `with google` | Replace hand-rolled JWT |
| GAN Loop | Claude Code + Meph automated quality loop | Infrastructure exists, needs orchestration |
| Real RAG (pgvector) | Semantic search over unstructured text | Current `knows about:` is keyword-only |
| Ensemble grader mode | `EVAL_PROVIDER=ensemble` | Run Anthropic + Gemini, surface grader disagreement as a pink chip. Catches Claude-grading-Claude bias automatically. Eval-tooling, not Marcus-shaped — moved here from "Next Up" 2026-04-21. |
| Eval history per template | persisted score trends + regression auto-flag | Local table of runs + score deltas. Auto-flag drop > 2 points vs last run. Eval-tooling. |
| CLI `clear eval --suite` mode | port Studio eval path to CLI | Unblocks scheduled regression runs outside the browser. CI/research-tooling, not Marcus-path. |
| Probe-validate sweep against nested shapes | sweep every `validate incoming:` with nested objects / list constraints | Session 34 probe fix was tested against flat rules only. Test infrastructure hardening. |

---

## The Big Thesis

→ See **[FAQ.md — What is Clear's big thesis?](FAQ.md#what-is-clears-big-thesis)** for the full thesis, fundraising sequence, and company name rationale.

**One-liner:** Clear is the language AI writes when the output has to be safe.

## RL Training Environment (Speculative)

→ See **[FAQ.md — What is the RL training environment?](FAQ.md#what-is-the-rl-training-environment)** for the full status table.

| Built | Status |
|-------|--------|
| Sandbox runner | Isolated child process, timeout, memory limit |
| Curriculum tasks | 20 benchmarks across 10 difficulty levels (63 tests) |
| Structured eval API | `compileProgram()` returns JSON scores, stats, warnings |
| Patch API | 11 structured edit operations = constrained action space |
| Source maps | Runtime errors map to Clear line numbers |
| HTTP test assertions | `call POST /path`, `expect response status` = reward function |

**Blocker:** No fine-tuning access. The gym is ready but can't train athletes in it yet.

---

## Refactoring Backlog

| ID | What | When |
|----|------|------|
| R1 | Decompose `compileAgent()` — 300-line monolith, 7 feature sections mutating strings via regex. Extract helpers: `applyToolUse()`, `applyMemory()`, `applyRAG()`, etc. | Before adding more agent features |
| R2 | Deduplicate JS/Python CRUD — parallel logic, bugs in one missed in other. Shared intermediate representation. | When Python support becomes priority |
| R3 | Frontend source maps | **Done.** `data-clear-line="N"` on every HTML element. |
| R4 | Skill instruction raw text — tokenizer destroys parentheses and punctuation in skill `instructions:` blocks. Parser should store `.raw` line text instead of reconstructing from tokens. Partially fixed (now uses `.raw` when available) but tokenizer still eats some formatting. | Before shipping store-ops demo |
| R5 | `clear test` runner doesn't include user-written `test` blocks — only compiler-generated e2e tests. User tests compile into `serverJS` but the `.clear-test-runner.cjs` skips them. Needs unified test extraction. | Before shipping store-ops demo |
| R6 | All `[^)]*` regex patterns in `compileAgent()` are fragile — break when prompts contain literal parentheses. Two instances fixed (tool-use injection, agent-log wrapping) but more may exist. The real fix is R1 (decompose compileAgent into helpers that don't use regex string surgery). | Part of R1 |
| R7 | **`needs login` frontend guard is broken.** Pages with `needs login` compile to blank white pages — the JWT check hides everything but doesn't show a login form or redirect to `/login`. Should either generate an auto-login page or redirect. This is a **serious user-facing bug** — any app using `needs login` on a page shows nothing. | ASAP |
| R8 | **`for each` loop body in HTML doesn't render child content.** A loop like `for each msg in messages: section with style card: text msg's role` compiles to `+ msg +` (whole object as string) instead of expanding the child template. Workaround: use `display X as cards showing field1, field2`. | Before demo polish |
| R9 | **Decide on stale SQLite WIP in `apps/todo-fullstack/clear-runtime/db.js`.** Pending migration sitting unstaged in working tree since Session 32. Decide: ship, stash, or revert. (Moved from "Next Up" 2026-04-21.) | Whenever todo-fullstack is touched next |

---

## Not Building

| Feature | Reason |
|---------|--------|
| OAuth / social login | `allow signup and login` covers MVPs. OAuth is a rat's nest. |
| Cookies | JWT is the right auth pattern for Clear apps. |
| Upsert | `save` + `get first where` is 2 lines. |
| Soft delete | `deleted_at` field + filter. Not worth a keyword. |
| Geolocation | One-liner `script:` call. Niche browser API. |
| Camera / microphone | One-liner `script:` call. Niche. |
| Speech to text | One-liner `script:` call. Niche. |
| Text to speech | One-liner `script:` call. Niche. |
| Push notifications | Service workers + VAPID keys. Too much plumbing. |
| Drag and drop | HTML5 events via `script:`. Niche. |
| Infinite scroll | IntersectionObserver via `script:`. Performance concern, not language feature. |
| Per-user app forks | Every employee seeing a fundamentally different version of the app destroys the shared ontology that justified building a shared app. Audit/compliance nightmare. Save for 2028 if the social dynamics flip. See Live App Editing for the right answer: owner-initiated changes that ship to everyone. |

---

## What You Can Build

### Tier 1 — Ship in an hour, no `script:` needed

| Category | Examples |
|----------|---------|
| Admin dashboards | CRUD, roles, search, charts, aggregate stats |
| AI agents | RAG, tool use, memory, pipelines, guardrails, structured output |
| SaaS MVPs | Auth, validation, email, scheduling, webhooks |
| Data apps | CSV import, filter, chart, export |
| Chat apps | `display as chat` with markdown, typing dots, scroll, input absorption |

### Tier 2 — 90%+ Clear, minor `script:` for edge cases

| App | What needs `script:` |
|-----|---------------------|
| Project management | Drag-and-drop kanban |
| Blog / CMS | Rich text editing |
| Chat apps | ~~Scroll-to-bottom, typing indicators~~ **Moved to Tier 1** — `display as chat` now includes scroll, typing dots, markdown rendering, input absorption |
| E-commerce | Stripe checkout flow |
| Monitoring | Slack/PagerDuty webhook format |

### Tier 3 — Wrong tool

| App | Why |
|-----|-----|
| Collaborative editing | Operational transforms, conflict resolution |
| Video / audio calls | WebRTC, media streams, STUN/TURN |
| Mobile apps | Clear targets web only |
| Games | Canvas/WebGL, physics, sprites |
| Social media feeds | Algorithmic ranking, infinite scroll, image pipelines |

---

## Compiler Guarantees — Bug Classes Eliminated at Compile Time

Every app compiled from Clear ships with these protections. Fix a pattern once, every app gets the fix on recompile.

### Security (compile errors — can't ship these bugs)

| Bug Class | How It's Prevented | Validator/Compiler |
|-----------|-------------------|-------------------|
| SQL injection | All CRUD uses parameterized queries, always | `compiler.js` — `db.insert()`, `db.query()` with param binding |
| Auth bypass | DELETE/PUT without `requires login` = compile ERROR | `validateSecurity()` — line 742 |
| Mass assignment | `_pick()` strips unknown fields from request body | `compiler.js` — generated `_pick()` helper |
| CSRF | Data-mutating endpoints without auth = error | `validateOWASP()` — line 1262 |
| Path traversal | File ops with variable paths = warning | `validateOWASP()` — line 1221 |
| PII in errors | Passwords/tokens/keys auto-redacted from error responses | `_clearError()` — `redact()` function |
| Sensitive field exposure | Schema has `password`/`secret`/`api_key` = warning | `validateSecurity()` — line 857 |
| Brute force | Login/signup without rate limiting = warning | `validateSecurity()` — line 836 |
| Overly permissive CORS | CORS enabled + no auth on endpoints = warning | `validateSecurity()` — line 876 |

### Correctness (compile errors or warnings — caught before runtime)

| Bug Class | How It's Prevented | Validator |
|-----------|-------------------|-----------|
| Undefined variables | Forward reference check with typo suggestions | `validateForwardReferences()` — line 122 |
| Type mismatches in math | String used in arithmetic = error | `validateInferredTypes()` — line 1597 |
| Frontend-backend URL mismatch | Fetching `/api/user` when endpoint is `/api/users` = warning | `validateFetchURLsMatchEndpoints()` — line 993 |
| Missing responses | Endpoint without `send back` = warning | `validateEndpointResponses()` — line 964 |
| Schema-frontend field mismatch | Sending `username` to table with `user_name` = warning | `validateFieldMismatch()` — line 1125 |
| Duplicate endpoints | Same method+path declared twice = warning | `validateDuplicateEndpoints()` — line 894 |
| Undefined function/agent calls | Calling undefined agent or pipeline = error | `validateCallTargets()` — line 1401 |
| Type errors in function calls | Literal arg doesn't match typed param = error | `validateTypedCallArgs()` — line 1506 |
| Member access on primitives | `score's name` where score is a number = warning | `validateMemberAccessTypes()` — line 1454 |
| Agent tool mismatches | Agent references undefined function as tool = error | `validateAgentTools()` — line 1307 |

### Business Logic (warnings — common mistakes caught)

| Bug Class | How It's Prevented | Validator |
|-----------|-------------------|-----------|
| Negative balance/stock | Subtracting without guard = warning | `validateArithmetic()` — line 1055 |
| Overbooking | Inserting without capacity check = warning | `validateCapacity()` — line 1083 |
| Deep property chains | 4+ levels of possessive access = warning | `validateChainDepth()` — line 1715 |
| Complex expressions | 3+ operators in one expression = warning | `validateExprComplexity()` — line 1761 |
| Invalid classification | Classify with < 2 categories = error | `validateClassify()` — line 1808 |

### Generated Code Protections (always in compiled output)

| Protection | What It Does |
|-----------|-------------|
| Input validation | `_validate()` checks required fields, types, min/max/pattern on every POST/PUT |
| Mass assignment filter | `_pick()` only allows schema-defined fields through |
| PII redaction | `_clearError()` strips sensitive fields from all error responses |
| Source maps | `_clearLineMap` maps runtime errors back to Clear line numbers |
| XSS escaping | `_esc()` escapes user input in all display/template contexts |

### Not Yet Prevented (known gaps)

| Bug Class | Status | Notes |
|-----------|--------|-------|
| Race conditions | Not prevented | Two users updating same record simultaneously |
| Null reference chains | Partial | Optional chaining exists but not enforced |
| Infinite loops / runaway agents | Not prevented | No static termination analysis |
| Cross-tenant data leakage | Not prevented | Row-level security not auto-enforced |
| Type safety on external returns | Not prevented | `ask ai` returns untyped string |
| Sensitive data in logs | Partial | `_clearError()` redacts, but `log every request` logs full bodies |
| Promise rejection handling | Not prevented | Async without error handler swallows errors |

### Type System Assessment

**Current state:** Limited inference (literals + function params). Catches type mismatches in arithmetic and function calls.

**What a full type system would add:**
- Return type mismatches (function returns string, caller expects number)
- Array element type consistency
- Agent/API response shape validation
- Optional/nullable type tracking

**Recommendation:** Not needed yet for enterprise internal tools market. The 27 security/correctness guarantees matter more than type safety for CRUD apps. Revisit when targeting engineering teams who compare to TypeScript.

---

## Stats

| Metric | Value |
|--------|-------|
| Node types | 126 |
| Compiler tests | 1850 (0 failures) |
| Sandbox tests | 9 |
| E2E tests | 80 (core 8 templates, CRUD, curriculum) |
| Playground tests | ~127 (server, IDE, agent) |
| npm dependencies | 0 (compiler is pure JS) |
| Targets | JS (Express), Python (FastAPI), HTML (DaisyUI v5 + Tailwind v4) |
