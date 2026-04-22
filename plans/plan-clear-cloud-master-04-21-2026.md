# Plan: Clear Cloud — master hosted-platform plan

**Date:** 2026-04-21
**Scope:** The product. Turning Clear from "open-source compiler + Studio you run locally" into "buildclear.dev where Marcus presses Publish."
**Related:** `ROADMAP.md` → "North Star: Clear Cloud (P0 — Q2 2026)" and "Clear Cloud — Marcus-first hosted platform strategy"
**Status:** Master plan. Each sub-item (CC-1 through CC-5) gets its own detailed plan when that item starts execution.

---

## Executive summary

Phase 85 shipped the deploy plumbing (shared builder, metered AI proxy, tenant/billing layer, cross-tenant isolation — 72 tests passing). It's 80% of the hosting engine. Phase 85a (Russell's paperwork — domain, Fly Trust Verified, Stripe, Anthropic org key) lights it up. Then CC-1 through CC-5 turn it into a product Marcus can sign up for, build in, and pay for.

**What this plan is:** the unified view of how the 5 CC sub-items fit together, what's already done via Phase 85, what's blocked on 85a, and what order to build in.

**What this plan is NOT:** the detailed implementation plan for any single sub-item. Each sub-item gets its own `plans/plan-cc<N>-<feature>-MM-DD-YYYY.md` when it starts execution. This master plan points at those.

---

## Architecture (target state)

```
Marcus opens buildclear.dev
        │
        ▼
┌───────────────────────────────────────────────┐
│  Clear Cloud (Fly, Phase-85 infrastructure)   │
│                                                │
│  ┌─────────────┐   ┌──────────────────────┐  │
│  │ Studio UI   │   │ Tenant router        │  │
│  │ (Builder    │   │ buildclear.dev/...   │  │
│  │  Mode v0.1) │   │ <slug>.buildclear.dev│  │
│  └──────┬──────┘   └──────────┬───────────┘  │
│         │                      │              │
│         ▼                      ▼              │
│  ┌─────────────────────────────────────────┐  │
│  │ /api/deploy (Phase 85)                  │  │
│  │ Builder: compiles .clear → Docker image │  │
│  │ Proxy: meters ANTHROPIC_API calls       │  │
│  │ Tenants DB: usage, quota, billing state │  │
│  └─────────────────────────────────────────┘  │
│                                                │
│  ┌─────────────────────────────────────────┐  │
│  │ Per-tenant Fly apps                     │  │
│  │ <tenant-slug>-<app-slug>.fly.dev        │  │
│  │ Custom domain: deals.acme.com           │  │
│  │ Each app: isolated SQLite/Postgres,     │  │
│  │ its own JWT secret, its own env         │  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
        │
        ▼
  Marcus's employees hit the deployed app
```

**Key architectural decisions (locked):**
- **Fly is the default hosting target** until Clear Cloud has paying Marcuses. Cloudflare Workers + D1 auto-routing is v2 (tracked in `ROADMAP.md` → "Auto-hosting by app type").
- **One Fly app per Clear app.** Multi-tenancy lives at the tenant-dashboard level (buildclear.dev), not inside the deployed apps. Each deployed app is isolated with its own DB, auth, and secrets.
- **Studio is THE primary interface.** Terminal + CLI + `clear deploy` are escape hatches for power users, not the pitch.
- **Builder Mode is the Publish-button-first UX.** Builder Mode v0.1 already shipped (`bb99808`) — chat-driver, preview-hero, Publish button branded. Builder Mode and CC-4 are two sides of the same coin.

---

## What Phase 85 already shipped (reuse, don't rebuild)

Session 37 (2026-03-ish, merged long ago). **72 tests passing.** Current state:

| Component | What it does | File(s) |
|---|---|---|
| Builder service | Compiles `.clear` → Docker image. Pushes to registry. | `playground/server.js`, `deploy-builder.sh` (infrastructure script, runs on a Fly machine) |
| AI proxy | Intermediates all `ask claude` calls from deployed apps. Meters per-tenant spend. Rate-limits. Enforces quotas. | `playground/ai-proxy/*`, `deploy-proxy.sh` |
| Tenant DB (schema) | Tracks tenants, apps, deploys, usage. Postgres. | `playground/tenants-db/*` |
| Deploy API | `/api/deploy` endpoint in Studio's server. Orchestrates build → push → spin up Fly app. | `playground/server.js`, `playground/deploy.test.js` |
| Plan badge | Free / Team / Business / Enterprise visual indicator in Studio toolbar. | `playground/ide.html` (`#plan-badge`) |
| Cross-tenant isolation | Deployed apps can't see each other's data or secrets. | Verified in `playground/deploy.test.js` |

**What Phase 85 does NOT include (why CC-1 through CC-5 exist):**
- No real `buildclear.dev` domain. Everything runs on `*.fly.dev` test URLs.
- No real Fly Trust Verified account with 10k-machine quota.
- No real Stripe integration — billing state is tracked but no charges happen.
- No user-facing auth on `buildclear.dev` itself. Studio has no concept of "log in to YOUR account."
- No custom domain flow end-to-end (DNS verification, SSL provisioning UX).
- Subdomain routing (`approvals.buildclear.dev`) is not wired.

---

## Phase 85a — the unblocker (Russell's paperwork)

**All of CC-1 through CC-5 are blocked until Phase 85a completes.** This is Russell's work — no Claude can do it.

Checklist:

- [ ] Register `buildclear.dev` domain (Namecheap, Cloudflare Registrar, etc.)
- [ ] Point `buildclear.dev` DNS to Fly (CNAME or A record depending on setup)
- [ ] Apply for Fly Trust Verified status (email `sales@fly.io`, explain use case, request 10k-machine quota)
- [ ] Sign up for Stripe (business account, verify identity, enable payments)
- [ ] Generate production `ANTHROPIC_API_KEY` for the AI proxy (separate from Russell's personal key — this is the Clear Cloud org key that meters ALL tenant spend)
- [ ] Provision production Postgres for the tenants DB (Fly Postgres, Neon, or Supabase — decision point below)
- [ ] Run `deploy-builder.sh` once to spin up the builder service on Fly
- [ ] Run `deploy-proxy.sh` once to spin up the AI proxy service on Fly
- [ ] Smoke test: deploy one app end-to-end via `/api/deploy`, verify it's live at `*.fly.dev`

**Tenant DB hosting decision (Russell's call):**
- **Fly Postgres** — simplest, colocated with app, cheap. Recommended if no other Postgres skill in stack.
- **Neon** — serverless, scales to zero, great free tier. Recommended if you want decoupled DB.
- **Supabase** — Postgres + auth combo, might overlap with CC-2. Recommended if you want one vendor for CC-2 auth + tenants DB.

**Estimated time for Phase 85a:** 2–4 hours of Russell's time (most of it waiting on Fly's Trust Verified approval).

---

## CC-1 — Multi-tenant hosting

**Goal:** `approvals.buildclear.dev` resolves to Marcus's approval app, with its own isolated database, separate from `crm.buildclear.dev` which resolves to Marcus's CRM app.

### Sub-tasks

| # | Task | Scope | Autonomous? |
|---|---|---|---|
| CC-1a | **Tenants DB schema** — tables for `tenants`, `apps` (tenant_id, slug, subdomain, fly_app_name, fly_db_conn_str), `deploys` (app_id, version, image, status), `usage_rows` (app_id, ts, tokens_in, tokens_out, cost_usd). SQL migrations in `playground/tenants-db/migrations/`. | 1 day | ✅ Scaffold doable (test against dev Postgres) |
| CC-1b | **Subdomain router** — HTTP middleware on the Fly platform that extracts the subdomain from `Host:` header, looks up the tenant app, proxies the request to the correct Fly app's internal URL. | 2–3 days | ✅ Code doable; tested end-to-end requires 85a |
| CC-1c | **Per-app DB provisioning** — when a new app deploys, allocate an isolated DB (SQLite file in the tenant's Fly volume, or a schema-per-app in tenant Postgres). Connection string returned to the deploy pipeline. | 1–2 days | ✅ Code doable; volumes require 85a |
| CC-1d | **Isolation tests** — deploy two apps, verify one cannot read the other's data even through `query` raw-SQL node. | 1 day | ✅ Scaffold tests against local Fly machines |

### Dependencies
- Phase 85a done (for end-to-end test)
- Nothing else — CC-1 is the foundation everything else builds on.

### Success criteria
- `<slug>.buildclear.dev` routes correctly.
- Two tenants' apps can coexist on the same infrastructure with zero data leakage.
- Deploy flow creates a new DB for each new app.

### Next Claude: when executing CC-1
Create `plans/plan-cc1-multitenant-MM-DD-YYYY.md`, red-team it, execute in phases. Branch: `feature/cc1-multitenant`.

---

## CC-2 — buildclear.dev account auth

**Goal:** Marcus signs up at `buildclear.dev/signup`, logs in, sees his dashboard with his 3 apps. Teammates can be invited.

### Sub-tasks

| # | Task | Scope | Autonomous? |
|---|---|---|---|
| CC-2a | **Accounts + sessions** — `users` table (email, pw hash, name), `sessions` table, signup/login endpoints in `playground/server.js`. Bcrypt, JWT, same pattern as Clear's built-in `allow signup and login` syntax. | 2 days | ✅ |
| CC-2b | **Team membership** — `teams` + `team_members` tables. Marcus can invite teammates to his account. Permissions: owner / admin / member. Owner-only actions: billing, team settings, dangerous app deletes. | 2 days | ✅ |
| CC-2c | **Account dashboard** — `buildclear.dev/dashboard` shows Marcus's apps, usage, team. `buildclear.dev/dashboard/team` for invites. Built as a Clear app (meta!) or as a custom React/HTML page — decision in the sub-plan. | 3 days | ✅ |
| CC-2d | **Wire apps to accounts** — every `apps` row has an `owner_user_id` (or `team_id`). Only the owner's team can deploy / edit / view usage for a given app. | 1 day | ✅ |

### Dependencies
- CC-1 done (needs the `apps` / `tenants` tables to hang ownership off of)
- Phase 85a done (for buildclear.dev domain)

### Success criteria
- Signup → dashboard → deploy app → see it in dashboard.
- Invite teammate → teammate can see the app; can deploy but not delete.
- Logged-out user hitting `/dashboard` redirects to `/login`.

### Integration note
Auth INSIDE deployed apps (Marcus's employees logging into the approval queue) is SEPARATE from auth on `buildclear.dev`. Each deployed app has its own auth via Clear's `allow signup and login` syntax — that's already shipped.

### Next Claude: when executing CC-2
Create `plans/plan-cc2-auth-MM-DD-YYYY.md`. Branch: `feature/cc2-auth`.

---

## CC-3 — Stripe billing

**Goal:** Marcus signs up on the Free tier, hits his agent-call limit, sees an upgrade prompt, clicks Upgrade, enters card, becomes a Team subscriber at $99/mo. His Stripe invoice arrives monthly.

### Sub-tasks

| # | Task | Scope | Autonomous? |
|---|---|---|---|
| CC-3a | **Stripe products + prices** — create Free / Team / Business / Enterprise in Stripe dashboard, map to internal plan IDs. | 1 hour (Russell in Stripe dashboard) | ⚠️ Needs Stripe account (85a) |
| CC-3b | **Checkout flow** — `buildclear.dev/upgrade` creates a Stripe Checkout Session, redirects user, handles `checkout.session.completed` webhook to mark tenant as Team/Business. | 2 days | ⚠️ Needs Stripe account for end-to-end |
| CC-3c | **Usage metering** — extend Phase 85's AI proxy to write usage rows. Cron job rolls them up daily into per-tenant billing totals. Webhook to Stripe Usage API for metered billing overages. | 3 days | ✅ Code doable against Stripe test mode |
| CC-3d | **Quota enforcement** — before every agent call, check remaining monthly quota. If over, return 402 with upgrade URL. Handle gracefully in Studio UI (inline prompt). | 1–2 days | ✅ |
| CC-3e | **Billing portal** — link out to Stripe Customer Portal from Clear Cloud dashboard for subscription management. Zero-code on our end. | 2 hours | ⚠️ Needs Stripe |
| CC-3f | **Plan-aware Publish button** — `deploy-btn` already has a plan badge. Wire it to block deploys when over quota on Free, with upsell. | 1 day | ✅ |

### Dependencies
- CC-2 done (needs `users` + `teams` for Stripe customer mapping)
- Phase 85a — specifically the Stripe signup

### Success criteria
- Marcus signs up → on Free plan → hits agent-call limit → sees upgrade → pays → upgraded to Team → no more limit.
- Monthly Stripe invoice arrives on time with correct usage.
- Quota enforcement can't be bypassed by any deploy flow.

### Next Claude: when executing CC-3
Create `plans/plan-cc3-stripe-billing-MM-DD-YYYY.md`. Branch: `feature/cc3-stripe`. Note: most of CC-3c/d/f is doable against Stripe test mode — scaffold now, wire to production when 85a's Stripe account is live.

---

## CC-4 — Publish wired to Clear Cloud

**Status: mostly already done via Phase 85 + Builder Mode BM-5.** This item is primarily about polish and proper UX flow, not net-new engineering.

### Sub-tasks

| # | Task | Scope | Autonomous? |
|---|---|---|---|
| CC-4a | **First-click walkthrough** — first time a user clicks Publish, show a one-time overlay: "Publish creates `<slug>.buildclear.dev` — your teammates can use it in 30 seconds. Log in to continue." Handles logged-out case by routing through CC-2 auth. | 1 day | ✅ (needs CC-2 live) |
| CC-4b | **Deploy progress UI** — expand the existing `#deploy-modal` (in `playground/ide.html`) to show streaming progress: compiling → packaging → uploading → provisioning DB → live. | 1 day | ✅ |
| CC-4c | **"Your app is live" confirmation** — full modal with copy-link, open-in-new-tab, share-with-team buttons. Replaces current text-only confirmation. | 1 day | ✅ |
| CC-4d | **Publish-vs-update detection** — if this is the 1st deploy, say "Publish." If it's a redeploy, say "Update" with a diff summary. | 0.5 day | ✅ |

### Dependencies
- CC-1 done (for real subdomain routing)
- CC-2 done (for logged-in deploys)

### Success criteria
- Marcus clicks Publish → sees progress streaming → gets live URL in under 30 seconds.
- Second click on already-deployed app says Update, shows diff, preserves URL.

### Next Claude: when executing CC-4
Create `plans/plan-cc4-publish-flow-MM-DD-YYYY.md`. Branch: `feature/cc4-publish-flow`.

---

## CC-5 — Custom domain flow

**Goal:** Marcus pastes `deals.acme.com` in his app settings, copies one DNS record, clicks Verify, waits 2 minutes, domain is live with SSL.

### Sub-tasks

| # | Task | Scope | Autonomous? |
|---|---|---|---|
| CC-5a | **Domain settings UI** — `buildclear.dev/dashboard/apps/<slug>/settings` has a "Custom domain" field. User enters domain, UI shows the DNS record to copy (CNAME `app-<slug>.buildclear.dev` or similar). | 1 day | ✅ |
| CC-5b | **DNS verification poller** — background job polls the entered domain's DNS every minute, checks for the expected CNAME. Updates status in UI (pending / verified / failed). | 1 day | ✅ |
| CC-5c | **SSL provisioning** — once DNS verified, call Fly's Certificate API to provision an SSL cert for the custom domain. Poll for ready. | 1 day | ⚠️ Needs Fly production account |
| CC-5d | **Traffic routing update** — when cert is ready, update Fly's router to accept the custom domain for the app. Traffic flows through. | 1 day | ⚠️ Needs Fly production |
| CC-5e | **Unverify / remove flow** — user can remove a custom domain, which de-provisions cert and routing. | 0.5 day | ✅ |

### Dependencies
- CC-1 done (tenant router needs to accept custom domains, not just `*.buildclear.dev`)
- Phase 85a done (Fly production account for cert provisioning)

### Success criteria
- End-to-end: enter domain → copy record → verify in <5 min → HTTPS live.
- Remove domain → cert gone, routing updated.

### Next Claude: when executing CC-5
Create `plans/plan-cc5-custom-domain-MM-DD-YYYY.md`. Branch: `feature/cc5-custom-domain`.

---

## Build order (the right dependency graph)

```
                    Phase 85a (Russell)
                           │
          ┌────────────────┼───────────────┐
          │                │               │
         CC-1            CC-2           (CC-3a, e: Russell-only)
    (multi-tenant)     (auth)
          │                │
          │                │
          ├────► CC-4 (Publish flow) ◄────┤
          │                │               │
          │                │               │
          │                ▼               │
          │              CC-3 (Stripe) ─── ┤
          │                │               │
          ▼                ▼               │
         CC-5 (custom domain) ─────────────┘
```

**Practical order for the next Claude:**

1. **Queue G scaffolds** (CC-1 schema, CC-1 router, CC-2 auth) — do these now, DON'T merge to main until 85a is done. Open as PRs (or keep as local branches) for Russell to review.
2. When Russell signals Phase 85a is done → review and merge the scaffolds.
3. Then execute CC-3, CC-4, CC-5 in roughly parallel (CC-3 and CC-5 don't deeply block each other once CC-1/2 are live).

---

## Phase 85a unblocked? What changes immediately

When Russell signals "Phase 85a is done," the next Claude can:

1. Merge the Queue G scaffolds (CC-1a, CC-1b, CC-2a, CC-2b) to main after re-testing against real infrastructure.
2. Unblock CC-1c (per-app DB provisioning) — needs real Fly volumes.
3. Unblock CC-1d (isolation tests) — needs real Fly machines.
4. Unblock CC-3 full end-to-end (Stripe live mode).
5. Unblock CC-5c/d (Fly Certificate API).
6. Mark Builder Mode v0.1 → v1.0 (the Publish button now actually ships apps).

Until then: scaffold against dev Postgres + local Fly machines + Stripe test mode.

---

## Integration with existing systems

### Where Clear Cloud touches the compiler
- **Nowhere deeply.** Clear Cloud is a hosting layer. The compiler emits Docker images as it does today (via `deploy-builder.sh`). No compiler changes for CC-1 through CC-5.
- **Possible future:** when Cloudflare Workers + D1 auto-routing lands (v2, post-Clear-Cloud), the compiler will need to emit Workers-compatible JS and swap the SQLite driver for D1. That's ROADMAP "Auto-hosting by app type", NOT part of this plan.

### Where Clear Cloud touches Studio
- **CC-4** wires Studio's Publish button through to the production deploy pipeline.
- **GTM-5** (Studio onboarding fix, separate queue item) may interact — first-run users land in Meph chat, then CC-4's first-deploy walkthrough kicks in when they click Publish.
- **Builder Mode** is orthogonal — it's just a layout. But Builder Mode's Publish button IS what CC-4 wires.

### Where Clear Cloud touches Meph
- **AI proxy (Phase 85)** meters per-tenant agent calls. Every `ask claude` in a deployed app goes through the proxy, which charges the tenant's usage counter.
- **Ghost Meph** is orthogonal — it's a research feature for Studio, not a tenant-runtime feature.

---

## Test strategy

| Level | What we test | How |
|---|---|---|
| Unit | Individual Node modules (subdomain parser, tenant lookup, quota checker) | `node playground/tenants-db/*.test.js` (new files per sub-item) |
| Integration | Deploy flow end-to-end against local Fly machines | Extend `playground/deploy.test.js` |
| E2E | Full user journey: signup → build → publish → custom domain | New `playground/clear-cloud-e2e.test.js` (Playwright or similar) |
| Load | Multi-tenant isolation under concurrent deploys | Manual for MVP; revisit when scale matters |

**Gate for ship:** every merge must keep `node clear.test.js` green AND the relevant `playground/*.test.js` green. Phase 85's `deploy.test.js` must NEVER regress.

---

## Success criteria (the whole Clear Cloud product)

- Marcus can go from zero-account to live app in under 5 minutes.
- A teammate he invites can build a second app that's isolated from the first.
- Agent-call quota enforces correctly on Free tier.
- Upgrading to Team via Stripe unblocks quota.
- Custom domain works end-to-end with HTTPS.
- `clear export` (existing CLI) produces a portable Dockerfile — Marcus is never trapped.
- 95%+ test coverage on every sub-item (Phase 85 set the bar).

---

## Mapping to ROADMAP queue positions

From `HANDOFF.md`:

| CC item | Queue | Status |
|---|---|---|
| CC-1a (schema) | G, #24 | Autonomous scaffold. Merge after 85a. |
| CC-1b (router) | G, #25 | Autonomous scaffold. Merge after 85a. |
| CC-1c/d | G → H | Blocked on 85a for real testing. |
| CC-2a/b/c/d | G, #26 | Autonomous scaffold. Merge after 85a. |
| CC-3a/e | H | Russell-only (Stripe account + Stripe dashboard). |
| CC-3b/c/d/f | I | Autonomous code against Stripe test mode; plan in `plans/plan-cc3-stripe-billing-MM-DD-YYYY.md`. |
| CC-4a/b/c/d | Unblocks after CC-1/2 merge | Plan when starting. |
| CC-5a/b/e | I | Autonomous; plan in `plans/plan-cc5-custom-domain-MM-DD-YYYY.md`. |
| CC-5c/d | H | Blocked on Fly production account. |

---

## Out of scope (explicitly NOT in Clear Cloud v1)

- **On-premise / self-hosted Clear Cloud** — Enterprise customers may want this. Queue for later. `clear export` is the interim answer.
- **Multi-region deployments** — everything is `iad` (US-East) today. Fly can do multi-region; revisit when a customer needs it.
- **Team SSO / SAML** — Enterprise tier feature. Out of scope for Team / Business MVP.
- **Audit logs for `buildclear.dev` itself** — separate from app-level audit logs (LAE-8). Postpone.
- **Custom domains on the `buildclear.dev` Studio itself** — e.g. `studio.acme.com` pointing at a private Clear Cloud instance. Queue this under Enterprise.
- **Cross-region replication of tenants DB** — single-region Postgres for MVP. Revisit at scale.

---

## Resume prompt for next Claude

> Executing Clear Cloud sub-item CC-<N> from `plans/plan-clear-cloud-master-04-21-2026.md`. Read the master plan + the relevant sub-section first. Check Phase 85a status (ask Russell if not clear) before running anything that needs real Fly / Stripe / buildclear.dev. Create a detailed sub-plan `plans/plan-cc<N>-<feature>-MM-DD-YYYY.md`, red-team it via the red-team-plan skill, then execute phase-by-phase. Queue G items stay as open branches (not merged to main) until 85a is done. Queue F items (Flywheel RL) are unlocked once Ghost Meph GM-1/2 land — separate track. Tests: `node clear.test.js` + `playground/deploy.test.js` must stay green.
