# Handoff — 2026-04-17 (Session 37 — One-Click Deploy)

## Current State
- **Branch:** `feature/one-click-deploy` (about to merge into main)
- **Working tree:** 8 modified + 12 new files, all tests green

## What Was Done This Session

Built Phase 85 — one-click deploy end-to-end. Studio now has a Deploy button that compiles + packages + ships an app to a live Fly URL, through a shared builder machine and a metered AI proxy, with Stripe-backed tenant billing and multi-tenant isolation.

91 new tests pass across 6 test files. 1939 compiler tests unaffected. Deploy button + plan badge verified live in Studio via preview eval.

### New files

- **`lib/packaging.js`** — shared packager used by both `clear package` CLI and Studio deploy. Detects needed secrets (JWT, Stripe/Twilio/SendGrid) and AI calls. 16 tests.
- **`playground/builder/`** — always-on Fly machine that accepts tarballs, runs `docker build` → `docker push` → `flyctl deploy`. Zip-slip-safe tar extractor, per-customer mutex, shard failover across three Fly orgs. 19 tests.
- **`playground/ai-proxy/`** — metered Claude forwarder. Fail-closed if DB unreachable (no free inference). Per-tenant rate limit, usage metering, JWT-verified tenant identity. 15 tests.
- **`playground/plans.js`** — single source of truth for plan tiers (free / pro / team).
- **`playground/tenants.js`** — tenant model with in-memory store.
- **`playground/billing.js`** — Stripe Checkout + webhook handler + metered usage. Webhook dedup'd by event id so replays don't double-bill. 16 tests.
- **`playground/deploy.js`** — Studio-side plumbing. Packages + tars + POSTs to builder. Wires `/api/deploy`, `/api/deploy-status/:jobId`, `/api/custom-domain`, `/api/rollback`, `/api/deploy-history/:app`, `/api/tenant`, `/api/checkout-session`, `/api/stripe-webhook`. 8 tests.
- **`playground/sanitize.js`** — app-name / slug / domain validators + `assertOwnership`. 17 tests.

### Modified files

- **`cli/clear.js`** — `packageCommand` is now a thin wrapper around `packageBundle`.
- **`playground/server.js`** — imports `wireDeploy` and calls it to mount all deploy endpoints.
- **`playground/ide.html`** — Deploy button in toolbar, plan badge `apps/25 • $spent/$credit`, deploy modal with secrets prompts, progress polling, custom domain copy.
- **`intent.md`** — added "Studio Capabilities" section describing hosted deploy + AI proxy + tenant/billing + multi-tenant isolation as non-language features.
- **`SYNTAX.md`** — added "Deploying your app" section with the end-to-end flow.
- **`AI-INSTRUCTIONS.md`** — "Deploy-ready apps (Phase 85)" rules: don't paste Anthropic keys, use lowercase alphanumeric names, expected auto-secret flow.
- **`USER-GUIDE.md`** — Chapter 20.5 "Ship It — One-Click Deploy" with the full walk-through.
- **`ROADMAP.md`** — Phase 85 marked complete, added follow-ups (85a–89) under What's Next.
- **`.claude/launch.json`** — added `CLEAR_ALLOW_SEED=1` env to the playground config so test-tenant seeding works in preview.

## What's Next (priority order)

### 1. Phase 85a — provision the real stack (blocks every real deploy)

The code is done. The infrastructure isn't. Before a single customer can click Deploy and get a URL, Russell needs to:

1. Register `buildclear.dev` (or pick another domain).
2. Email `sales@fly.io` the Trust Verified request in `plans/plan-one-click-deploy-04-17-2026.md` Phase 0. Ask for 10k machine quota across `clear-apps-01/02/03`.
3. Generate Fly org-scoped tokens: `flyctl auth token --org clear-apps-01` × 3. Store as Vercel env.
4. Sign up for Stripe. Create a $99/mo Pro product + metered usage add-on. Save keys.
5. Generate an Anthropic org API key. Only the AI proxy ever sees this.
6. Provision a Postgres database for Studio's tenants table (Fly Postgres is fine).
7. Run `./playground/builder/deploy-builder.sh` once.
8. Run `./playground/ai-proxy/deploy-proxy.sh` once.
9. Set `BUILDER_URL`, `BUILDER_SHARED_SECRET`, `PROXY_URL`, `PROXY_SHARED_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TENANT_JWT_SECRET`, `DATABASE_URL` in Vercel.

### 2. Phase 86 — Per-tenant usage dashboard
The plan badge is a teaser. A full billing surface (spend by day, top apps by AI spend, upgrade CTA) is the conversion moment for free → pro.

### 3. Phase 87 — Meph-driven deploy
Meph gains a `deploy_app` tool. "Ship it" from chat prompts for secrets, picks a domain, calls `/api/deploy`, streams progress into the chat bubble.

### 4. Phase 88 — Deploy history drawer UI
Rollback API exists. Needs a drawer in Studio with version list + diff preview.

### 5. Phase 89 — Multi-region + custom-domain polish
Region picker at deploy time. Cert-status polling. One-click DNS record copy.

## Key Decisions Made

- **Builder and proxy are Clear-owned Fly machines, not customer resources.** Customers never see Fly, never need a Fly account. Clear pays Fly, bills customers through Stripe.
- **Fail-closed on the AI proxy.** If the tenants DB is unreachable, return 503 — don't forward to Anthropic. One leaky proxy would cost more than an hour of downtime.
- **Shard tenants across three orgs from day one.** Fly's default org quota is ~100 machines; we'd hit it at ~4 Marcus-sized customers. Design sharding into v1, not v2.
- **In-memory tenant store for now.** Tests run without Postgres. Production swaps the store interface for a Postgres-backed one in Phase 85a.
- **Past_due is a payment status, not a plan tier.** Keeps pro-level limits during the 7-day grace window so a temporarily failed card doesn't lock the customer out of their own apps.

## Resume Prompt

"We just shipped Phase 85 (one-click deploy) to main. Code is done end-to-end — 91 new tests pass, Deploy button verified live. Infrastructure is NOT done: Fly sales email, Stripe signup, Anthropic org key, domain registration all need Russell to do them. Options: (1) Phase 85a provisioning (if Russell is ready to set up the accounts), (2) Phase 86 usage dashboard, (3) Phase 87 Meph deploy tool. Tell me which one."
