# Handoff — 2026-04-21 (ROADMAP reorg + Clear Cloud north-star decision)

## Current state

- **Branch being shipped:** `docs/roadmap-reorg` (created + merged + pushed this session)
- **Tests:** no compiler code changed — doc-only ship, no test run needed
- **Product status:** Phase 85 (one-click deploy to Fly) shipped in Session 37 but blocked on real-world provisioning (buildclear.dev domain, Fly Trust Verified quota, Stripe signup, Anthropic org key). Deploy button works end-to-end in tests but has nowhere to deploy to until Phase 85a lands.

## What shipped this session

Three things, all documentation.

### 1. ROADMAP.md split + Clear Cloud north-star decision

The roadmap ballooned to 1054 lines. Unreadable. Split into three files:

- **`ROADMAP.md` (707 lines, was 1054):** Forward-looking only. Opens with a new top-level section called "North Star: Clear Cloud (P0 — Q2 2026)" that locks the Marcus-first product decision, then a priority table (P0/P1/P2/P3/P4), then individual tracks in physical-order priority.
- **`FEATURES.md` (new, 280 lines):** Capability reference — "what can Clear do today?" Every feature row: syntax + notes. Replaces the "What's Built" section that used to live in ROADMAP.
- **`CHANGELOG.md` (new, 109 lines):** Session-by-session history of what shipped. Newest at top. Replaces the "Recently Completed" section that used to live in ROADMAP.

### 2. Clear Cloud product-positioning lock

**The decision:** Clear is a **Marcus product**, not a Dave tool.

- Primary interface is the Studio **Publish** button, not a terminal `clear deploy`.
- Compiler auto-picks hosting by app type (v2, post-launch): static → Cloudflare Pages, web CRUD → Cloudflare Workers + D1, agents → Workers + AI Gateway, Python ETL → Modal, native binaries → Fly Docker. Marcus never sees a vendor name.
- Phase 85 (Fly) stays as the default shipping target. Don't rebuild on Cloudflare before Clear Cloud is paying.
- Five missing pieces to ship Clear Cloud on top of existing Phase-85 infrastructure: **CC-1** multi-tenant hosting, **CC-2** buildclear.dev auth, **CC-3** Stripe billing, **CC-4** Publish button wired to Clear Cloud, **CC-5** custom domain flow. Total ~6–8 weeks of platform engineering.
- **Before any CC-* lands:** Phase 85a needs to provision the real stack (domain registration, Fly Trust Verified, Stripe, Anthropic org key, Postgres for tenants DB). That's the single biggest unblocker. Today the deploy button works in tests but has nowhere to deploy to.

### 3. Competitive positioning vs Retool / Lovable / Bubble (written down in ROADMAP)

Three structural differentiators, in Marcus-talk:

1. **"You can read your own app."** Retool is visual blocks; Lovable is generated React. Clear is plain English. Marcus's CFO and compliance team can review source directly.
2. **"You can change the app while it's running."** Retool and Lovable force rebuild-redeploy; users mid-task lose work. Clear's Live App Editing (shipped Session 39) reshapes live apps with data/sessions intact. No competitor has this.
3. **"You're never trapped."** `clear export` produces a portable Dockerfile. Retool self-hosting is expensive; Lovable's React is portable but unmaintainable. Clear is leave-anytime in a way competitors aren't.

Plus: agents are language primitives (`ask claude`, `has tools:`, `remember conversation`), not AI bolted onto a visual builder.

### 4. FAQ.md + CLAUDE.md pointer updates

- FAQ gained three "Where is X?" entries: feature list, changelog, Clear Cloud product decision.
- The "5. Document it — all 7 surfaces" entry in FAQ was stale; updated to 9 surfaces (added FAQ.md + RESEARCH.md that had been added to CLAUDE.md but not FAQ).
- Project CLAUDE.md Documentation Rule updated from 9 surfaces to **11 surfaces**: added FEATURES.md (row for every new feature) and CHANGELOG.md (session-dated entry for every ship).

## Key decisions locked this session

1. **Marcus, not Dave.** Clear Cloud is a hosted product with a Publish button. CLI is opt-in escape hatch, not the pitch.
2. **Fly, not Cloudflare — for now.** Phase 85 infrastructure stays. Cloudflare auto-routing is v2 after Clear Cloud ships.
3. **Roadmap is forward-looking only.** Feature reference lives in FEATURES.md. History lives in CHANGELOG.md. ROADMAP is "what's next."
4. **11 documentation surfaces, not 9.** Every new feature must land in FEATURES.md (capability) + CHANGELOG.md (history) alongside the existing 9.

## What's next (priority order)

**P0 — Ship Clear Cloud to Marcus (Q2 2026):**

1. **Phase 85a — provision the real stack.** Register `buildclear.dev`, Fly Trust Verified sales-email, Stripe signup, Anthropic org key, Postgres for tenants DB, run `deploy-builder.sh` + `deploy-proxy.sh` once. **This is the single biggest unblocker — the product can't ship until this happens.**
2. **CC-1 multi-tenant hosting** — subdomain routing, per-app D1 provisioning, isolation. 2–3 weeks.
3. **CC-2 buildclear.dev auth** — user accounts, sessions, team membership. 1 week.
4. **CC-4 Publish button wired to Clear Cloud** — replace terminal `clear deploy` as the default path. 3 days after CC-1.
5. **GTM-1 deal-desk hero app** — build `apps/deal-desk/main.clear` as the Marcus landing-page showcase. ~150 lines.
6. **GTM-2 Marcus landing page** — `landing/marcus.html`. Headline locked.

**P1 — Flagship differentiator (parallel with P0):**

- **Live App Editing Phase C+** — already shipped Phase A + B in Session 39. Next is multi-tenant-safe edits, undo across sessions, production-mode proxy disabled cleanly.

**P2 — Platform optimization (Q3 2026):**

- Auto-hosting by app type v2 (Cloudflare Workers + D1 + AI Gateway + Modal routing).
- Flywheel re-ranker training once 200+ passing rows accumulated.

## Resume prompt for next session

> We're shipping Clear Cloud on the existing Phase-85 Fly infrastructure. The single biggest blocker is Phase 85a — we need to actually register buildclear.dev, apply for Fly Trust Verified quota, sign up for Stripe, generate an Anthropic org key, and wire Postgres for the tenants DB. Start there. After that, CC-1 (multi-tenant hosting + D1-per-app) is the next piece of engineering. Read `ROADMAP.md` top section "North Star: Clear Cloud" for the full decision context and `Clear Cloud — Marcus-first hosted platform strategy` for the detailed plan.

## Files changed (doc-only)

- `ROADMAP.md` — reorganized, North Star section added at top, research/moonshots demoted below P3 maintenance, What's Built and Recently Completed stripped out
- `FEATURES.md` — new file (capability reference)
- `CHANGELOG.md` — new file (session-by-session history)
- `FAQ.md` — added 3 pointers; updated stale "7 surfaces" → 9
- `CLAUDE.md` — updated Documentation Rule from 9 → 11 surfaces
- `HANDOFF.md` — this file
