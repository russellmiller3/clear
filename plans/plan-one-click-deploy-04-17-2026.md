# Plan: One-Click Deploy (Hosted Studio → Fly.io)

**Branch:** `feature/one-click-deploy`
**Date:** 2026-04-17
**Scope:** Extra-large — new infrastructure (builder + AI proxy), billing, multi-tenancy, Studio endpoints, UI, docs
**Supersedes:** `plans/plan-fly-deploy-04-16-2026.md` (deleted — assumed direct Machines API build, impossible from Vercel)

---

## 🎯 The Problem

Marcus builds a deal-desk app in Studio. Clicks Run. It works on our server at a private port. Then what? He screenshots it. He DMs his team. He says "imagine this live." That's not a product — it's a demo.

A Deploy button that produces a public URL in 15 seconds is the difference between Clear as a toy and Clear as the thing his team opens every morning. And that button has to work for Marcus (browser only), bill him $99/mo, scale across hundreds of Marcuses sharing one Fly org, not leak one customer's AI usage onto another's bill, let him put the live URL on his own domain, and recover from his first bad deploy.

## 🔧 The Fix — Builder Machine + AI Proxy + Tenant System

A Vercel function can't build Docker images (no daemon, 10–60s timeout, no persistent fs). Fly's API can't build them either — it wants pre-built images at registry URLs. The gap between the two gets filled by a small always-on Fly machine that **we** own and operate — a builder that accepts Clear source over HTTP, builds the image, pushes to registry, and tells Fly Machines API to run it.

Alongside the builder, one more always-on Fly machine — the **AI proxy** — forwards every `ask claude` call from deployed apps to Anthropic, using a Clear-owned key, metering per customer.

```
Marcus's browser         Studio (Vercel)              Builder (Fly)               Fly Machines API        Marcus's deployed app          AI Proxy (Fly)         Anthropic
────────────────         ───────────────              ──────────────              ────────────────        ─────────────────────          ──────────────         ─────────
[Deploy] button ─POST→   /api/deploy
                         auth → tenantSlug
                         packageBundle(source)
                         POST tarball + metadata ───→ /build
                                                      untar (path-safe)
                                                      docker build
                                                      push → registry.fly.io
                                                      flyctl secrets set
                                                      flyctl deploy ────────────→ create app + machine
                                                                                  return URL
                         ←─ { url, appName, jobId } ─ return result
         ←── URL ────────
         "Live at deals-acme-a7b3c9.fly.dev"                                                              <── user traffic
                                                                                                              → ask claude   ──POST──→    /claude
                                                                                                                                          meter usage
                                                                                                                                          forward  ──→         api.anthropic.com
                                                                                                              ← response   ←───────        ←── reply
```

### Why this works
- **Vercel function stays thin** — one POST out, one result back. Fits the 10s limit via SSE streaming.
- **Builder lives inside Fly's network** — no WireGuard juggling, direct docker + flyctl calls.
- **AI proxy metered per tenant** — one Anthropic key, attributed usage, overage billing via Stripe.
- **Scale-to-zero for deployed apps** — every generated `fly.toml` has `auto_stop_machines='stop'` + `min_machines_running=0`. This is the 87% margin.
- **Single shared builder + proxy** — both machines serial-ish and fast, one of each handles every customer. Costs ~$10/mo total.

### Tenancy model
Clear owns the Fly org `clear-apps`. Every customer-deployed app lives there, tagged with `customer=<tenantSlug>` in machine metadata. Marcus never sees Fly. We pay Fly, we charge Marcus $99/mo via Stripe. The builder holds an org-scoped `FLY_API_TOKEN` — compromised token = blast radius is our org only, not our Fly account. Customer source is sandboxed inside Docker build context — never runs raw on the builder.

Per-app isolation is Fly's default: each machine is its own Firecracker VM, private IPv6, no shared filesystem. Two customers' apps can't see each other without going through the public internet.

---

## 📁 Files Involved

### New
| File | Purpose |
|------|---------|
| `playground/builder/Dockerfile` | Builder image: Node 20 + docker CLI + flyctl |
| `playground/builder/server.js` | Builder HTTP service — `POST /build`, `POST /cert`, `POST /rollback`, `GET /releases/:app`, `GET /health` |
| `playground/builder/fly.toml` | Builder's own Fly config (single always-on machine in `iad`) |
| `playground/builder/deploy-builder.sh` | Bootstrap script to provision the builder once |
| `playground/builder/README.md` | How to provision + rotate the builder |
| `playground/ai-proxy/Dockerfile` | AI proxy image: Node 20 + Anthropic SDK |
| `playground/ai-proxy/server.js` | Proxy service — `POST /claude`, `GET /usage/:tenant`, `GET /health` |
| `playground/ai-proxy/fly.toml` | Proxy's own Fly config (single always-on, auto-scales to 3 on load) |
| `playground/ai-proxy/deploy-proxy.sh` | Bootstrap script for the proxy |
| `playground/deploy.js` | Studio-side: packageBundle + POST to builder + URL return |
| `playground/deploy.test.js` | Unit tests for packaging + mock builder calls |
| `playground/tenants.js` | Tenant model: create, lookup, plan limits, usage |
| `playground/tenants.test.js` | Tenant tests |
| `playground/billing.js` | Stripe Checkout + webhook handlers + metering |
| `playground/billing.test.js` | Billing tests (Stripe test mode) |
| `runtime/ai-client.js` | Replaces direct Anthropic calls in compiled apps — talks to proxy via `CLEAR_AI_URL` + `CLEAR_AI_TOKEN` |

### Modified
| File | What changes | Why |
|------|-------------|-----|
| `cli/clear.js` | Extract `packageCommand` body into exportable `packageBundle(result, outDir, opts)` | Reuse across CLI + Studio deploy. No duplicate Dockerfile logic. |
| `compiler.js` | Emit `ai-client.js` calls instead of direct `@anthropic-ai/sdk` when `process.env.CLEAR_AI_URL` is set | Route deployed apps through the proxy |
| `playground/server.js` | Add `/api/deploy`, `/api/deploy-status/:jobId`, `/api/custom-domain`, `/api/deploy-history/:app`, `/api/rollback`, `/api/stripe-webhook`, `/api/checkout-session`, `/api/tenant` | Studio's deploy + billing surface |
| `playground/ide.html` | Deploy button + progress modal + secrets prompt + custom-domain dialog + deploy-history drawer + plan/usage badge | UI |
| `playground/server.test.js` | Cover all new endpoints with mocked builder + mocked Stripe | Coverage |
| `intent.md` | Record "hosted deploy" + "AI proxy routing" as Studio capabilities (not language features) | Doc rule |
| `SYNTAX.md` | New "Deploying your app" section with secrets, custom domain, rollback | Doc rule |
| `AI-INSTRUCTIONS.md` | Guidance on apps Meph builds being deploy-ready; AI-call routing explained | Doc rule |
| `USER-GUIDE.md` | Chapter: "Ship it — one-click deploy + billing + custom domain + rollback" | Doc rule |
| `ROADMAP.md` | Phase 85 complete, add open follow-ups | Doc rule |
| `playground/system-prompt.md` | Meph learns the `deploy_app` tool | Doc rule |
| `landing/marcus.html` | Deploy proof moment: screen recording "15s from idea to live URL" + pricing card | Doc rule |
| `CLAUDE.md` CLI section | Add `clear deploy --target=fly` line | Doc rule |

### Deleted
- `plans/plan-fly-deploy-04-16-2026.md` — already deleted this session (architecturally broken)

---

## 🔒 Prerequisites (one-time, before Phase 1)

1. Register `buildclear.dev` (or equivalent). Used as the Fly org slug + proxy hostname.
2. Sign up for Fly.io with a company email. Create org `clear-apps`.
3. Generate org-scoped API token: `flyctl auth token --org clear-apps`. Store as `FLY_API_TOKEN` in builder + proxy secrets only. Rotate every 90 days.
4. Sign up for Stripe. Generate publishable + secret keys. Set up $99/mo Pro plan product with metered-usage add-on for AI overages.
5. Generate Anthropic org API key. Store only in AI proxy Fly secret — never in Studio or builder.
6. Set env vars:
   - **Vercel (Studio):** `BUILDER_URL`, `BUILDER_SHARED_SECRET`, `PROXY_URL`, `PROXY_SHARED_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `TENANT_JWT_SECRET`, `DATABASE_URL` (Studio's own Postgres for tenant records)
   - **Builder (Fly):** `FLY_API_TOKEN`, `BUILDER_SHARED_SECRET`
   - **Proxy (Fly):** `ANTHROPIC_API_KEY`, `PROXY_SHARED_SECRET`, `TENANT_JWT_SECRET`, `DATABASE_URL`
7. Bootstrap Studio's tenant DB: `CREATE TABLE tenants (slug TEXT PRIMARY KEY, stripe_customer_id TEXT, plan TEXT, ai_credit_cents INTEGER, ai_spent_cents INTEGER, apps_deployed INTEGER, created_at TIMESTAMP)`.

---

## 🚨 Edge Cases

| Scenario | Handling |
|----------|----------|
| **Deploy** | |
| App name collision across customers | Scope as `clear-<tenantSlug>-<appSlug>-<rand6>` — globally unique across all Fly |
| Same customer re-deploys same app | First deploy persists app name in `tenants_apps` table; re-use on subsequent deploys (customer+appSlug → appName) |
| Build fails (bad source, missing dep) | Builder returns `{ ok: false, stage, stderr }`. Studio surfaces stage + last 20 lines. |
| Builder offline | Studio returns 503 "Deploy service down — try again in a minute." Status page at `status.buildclear.dev`. |
| Tarball > 50 MB | Reject at Studio before uploading |
| Malicious tarball (zip-slip, absolute paths, symlinks) | Builder validates every entry path before extract (normalize, reject `..`, absolute, non-regular files) |
| Concurrent deploys from same customer | Serialize via customer-scoped mutex on builder |
| Global builder overload | Global max 4 concurrent builds; queue beyond with 15s polling |
| Long build (>5 min) | Return 202 + jobId; Studio polls `/deploy-status/:jobId` |
| App crashes on startup | Builder waits for Fly `started` state; returns 502 if never healthy; destroys bad machine |
| App startup crash-looping forever | Builder gives up after 3 retries, marks deploy failed, preserves previous release |
| **Secrets** | |
| Source needs `ANTHROPIC_API_KEY` | v1: bring-your-own, customer pastes in modal. v2 (Phase 6): auto-issue CLEAR_AI_TOKEN, route via AI proxy. |
| Source needs `JWT_SECRET` | Auto-generate random 32-byte hex, set as Fly secret |
| Source uses SERVICE_CALL (Stripe/Twilio/etc.) | Pre-deploy scan detects needs; Studio prompts for each key before submit |
| Customer rotates a secret | Studio endpoint `/api/secrets` → `flyctl secrets set --stage` → next deploy picks up |
| **Multi-tenant** | |
| Two customers both want app name `todos` | `clear-acme-todos-ab12` vs `clear-globex-todos-cd34` — collision impossible |
| Tenant A scans / attacks Tenant B's app | Fly default isolation: separate Firecracker VMs, private IPv6, no shared fs. Public HTTPS only. |
| Compromised tenantSlug (cookie theft) | TENANT_JWT includes issued-at + max-age 24h; re-auth via Stripe session |
| Tenant exceeds app quota | Pro = 25 apps; deploy endpoint returns 402 + upgrade link |
| **Billing** | |
| New signup | Stripe Checkout → webhook creates tenant row + issues slug + sets `plan='pro'`, `ai_credit_cents=500` |
| Subscription cancelled | Webhook sets `plan='cancelled'`; deploys blocked; existing apps run until period end; then destroyed |
| Subscription past-due | Webhook sets `plan='past_due'`; deploys blocked with "update payment" link; apps keep running for 7-day grace |
| AI overage | Proxy tracks `ai_spent_cents`; when > `ai_credit_cents`, returns 402 to deployed app + emails customer; Stripe metered billing records overage for next invoice |
| Refund / dispute | Manual; document in ops runbook |
| **Custom domain** | |
| Customer adds `deals.acme.com` | `/api/custom-domain` → builder runs `flyctl certs create <domain> --app <appName>` → returns required DNS records; Studio shows them; polls until cert issued (usually <60s) |
| DNS mis-set | Cert pending > 10 min → Studio shows "check DNS records" with Fly's exact guidance |
| Domain already claimed by another Fly app | Builder returns clear error; Studio surfaces |
| Cert renewal failure | Fly auto-renews; failures surface via Slack webhook to ops; customer sees warning in Studio |
| **Rollback** | |
| Customer wants to revert | `/api/deploy-history/:app` returns last 10 releases; `/api/rollback` calls `flyctl releases rollback <version>` |
| Rollback target has incompatible DB schema | Clear warning in UI: "Rollback will not revert schema migrations." For v1 this is a footnote; future: auto-snapshot DB before deploy. |
| Rollback while a newer deploy is running | Serialize on the same per-customer mutex as deploy |
| **Data** | |
| SQLite app redeploys | Auto-create Fly volume on first deploy, mount at `/data`; persists across deploys + rollbacks |
| Postgres app | Customer sets `database is PostgreSQL` → builder runs `flyctl postgres create --name clear-<tenant>-db` (first time) + `flyctl postgres attach` (every deploy) |
| Customer wants to download their data | Out of scope v1 — document "contact support"; Phase 90 later |
| Customer deletes account | Webhook schedules `flyctl apps destroy` + `flyctl postgres destroy` after 30-day grace; refund any prepaid time |
| **Runtime** | |
| Deployed app hits proxy with bad CLEAR_AI_TOKEN | Proxy returns 401; app shows "AI service unavailable" |
| Proxy down | Deployed app gets 503 on `ask claude`; app falls through to error UI; log to ops |
| Anthropic API down | Proxy returns their error as-is to app; log per-tenant |
| Customer tries to bypass proxy (hardcodes their own key) | They can — it's their app source. If they use `use '@anthropic-ai/sdk'` directly, Clear doesn't meter. We'll catch this in lint (Phase 7) and warn. |

---

## 📋 Implementation — TDD Cycles (9 phases)

### Phase 1 — Refactor `packageCommand` → `packageBundle()` helper

**Why first:** Every downstream phase calls into this. Refactor before anyone else depends on the old shape.

🔴 **Test 1.1:** `packageBundle(result, outDir)` writes server.js + index.html + package.json + Dockerfile + .dockerignore to outDir
🟢 **Code:** Extract lines 882–951 of `cli/clear.js` into new exported function. `packageCommand` becomes a thin wrapper calling `packageBundle`.

🔴 **Test 1.2:** `packageBundle` picks `db-postgres.js` when `result.dbBackend === 'postgresql'`
🟢 **Code:** Already in extracted logic; add assertion.

🔴 **Test 1.3:** `packageBundle` returns `{ files, outDir, dbBackend, needsSecrets: string[], aiCallsDetected: boolean }`
🟢 **Code:** `needsSecrets` scans AST for `requires login` (JWT_SECRET) + `SERVICE_CALL` nodes (per-service keys). `aiCallsDetected` for any `ASK_CLAUDE` or scheduled agent.

🔴 **Test 1.4:** When `opts.useAIProxy === true`, the generated Dockerfile sets `CLEAR_AI_URL` + `CLEAR_AI_TOKEN` env; package.json drops `@anthropic-ai/sdk` dep (not needed on the app side)
🟢 **Code:** Conditional in generator. Runtime uses `runtime/ai-client.js` instead.

**Refactor:** Move Dockerfile template strings to a named constant at top of `cli/clear.js`. De-magic the conditional.

**Test command:** `node clear.test.js` — existing `clear package` tests stay green.

**Commit:** `refactor(cli): extract packageBundle() for reuse by Studio deploy`

---

### Phase 2 — Builder machine

🔴 **Test 2.1:** `builder/server.js` POST `/build` accepts multipart tarball + metadata, returns `{ jobId }`
🟢 **Code:** Minimal Express server. Require `Authorization: Bearer <BUILDER_SHARED_SECRET>`. 401 without.

🔴 **Test 2.2:** `POST /build` extracts tarball to scoped temp dir, validates no path escapes (zip-slip defense)
🟢 **Code:** Use `tar-stream` with per-entry validation: path starts without `/`, normalized path has no `..`, type is `regular` or `directory`. Anything else → 400.

🔴 **Test 2.3:** `POST /build` runs `docker build` + `docker push registry.fly.io/<appName>:<sha>` in the temp dir
🟢 **Code:** `execFile('docker', [...])` with 5min timeout. Capture stdout/stderr per stage. Retry push once on network errors.

🔴 **Test 2.4:** `POST /build` creates the Fly app if absent (`flyctl apps create <appName> --org clear-apps`)
🟢 **Code:** Check via `flyctl apps list --json`. Create if absent.

🔴 **Test 2.5:** `POST /build` sets secrets before deploy (`flyctl secrets set KEY=VAL --app <appName> --stage`)
🟢 **Code:** `--stage` defers restart; all secrets applied before first deploy. Injects `JWT_SECRET` auto-gen, `CLEAR_AI_URL`/`CLEAR_AI_TOKEN` if AI proxy enabled, customer-provided SERVICE_CALL keys.

🔴 **Test 2.6:** `POST /build` writes fly.toml with `auto_stop_machines='stop'` + `min_machines_running=0` + `[mounts]` if SQLite
🟢 **Code:** Template string with placeholders. Test asserts exact keys present. Region default `iad`, override via metadata.

🔴 **Test 2.7:** `POST /build` creates a 1GB Fly volume `clear_data` on first deploy for SQLite apps; skips if exists
🟢 **Code:** `flyctl volumes list --app <appName> --json`, create if absent.

🔴 **Test 2.8:** `POST /build` attaches Postgres if source says `database is PostgreSQL` + no DATABASE_URL already set
🟢 **Code:** `flyctl postgres create --name clear-<tenant>-db --region iad --vm-size shared-cpu-1x --volume-size 1` (first time) + `flyctl postgres attach --app <appName> clear-<tenant>-db`.

🔴 **Test 2.9:** `POST /build` invokes `flyctl deploy --image registry.fly.io/<appName>:<sha>` and returns the live URL
🟢 **Code:** Parse `flyctl deploy` stdout for hostname. Fall back to `<appName>.fly.dev`.

🔴 **Test 2.10:** Deploy waits for Fly `started` state; returns 502 if never healthy; destroys bad machine
🟢 **Code:** Poll `flyctl machine list --app <appName> --json` for `state==started`. 3 retries with exponential backoff. On give-up: `flyctl machine destroy --force`, preserve previous release.

🔴 **Test 2.11:** `GET /health` returns `{ ok, version, dockerReachable, flyctlReachable }`
🟢 **Code:** `docker info` + `flyctl version` sanity checks.

🔴 **Test 2.12:** `POST /build` honors per-customer mutex — two concurrent deploys for same customer serialize; global cap of 4 concurrent across customers
🟢 **Code:** In-memory `Map<customerKey, Promise>` chain + semaphore at 4. Queue slot above cap.

🔴 **Test 2.13:** `POST /cert` issues a Fly cert for a custom domain (`flyctl certs create <domain> --app <appName>`), returns required DNS records
🟢 **Code:** Parse Fly's output for A/AAAA/CNAME records. Return structured.

🔴 **Test 2.14:** `POST /rollback` rolls an app back to a prior release
🟢 **Code:** `flyctl releases rollback <version> --app <appName> --yes`. Return new live URL.

🔴 **Test 2.15:** `GET /releases/:app` returns last 10 releases with version + created_at + status
🟢 **Code:** `flyctl releases --app <appName> --json`.

🔴 **Test 2.16:** `POST /destroy` tears down an app + volume + Postgres (idempotent, used for cancellation cleanup)
🟢 **Code:** `flyctl apps destroy --yes` + `flyctl postgres destroy --yes` if present. Log to ops.

**Refactor:** Extract each flyctl invocation into named functions (`createApp`, `setSecrets`, `createVolume`, `deployApp`, `issueCert`, `rollbackApp`, `listReleases`, `destroyApp`). Each returns `{ ok, stderr?, stdout? }` — no exceptions leak to caller. All go through a single `runFlyctl(args, opts)` helper that enforces 5-min timeout + audit log line.

**Test command:** `node playground/builder/server.test.js` (new file). Mock `execFile` for unit tests; integration test spins a real docker-in-docker container locally.

**Deploy-the-builder once:**
```bash
cd playground/builder
flyctl launch --no-deploy --copy-config --name clear-deploy-builder --org clear-apps
flyctl secrets set FLY_API_TOKEN=<org-token> BUILDER_SHARED_SECRET=<random-32-byte>
flyctl deploy
```

**Commit:** `feat(builder): build/push/deploy + certs + rollback + destroy endpoints`

---

### Phase 3 — AI proxy machine

🔴 **Test 3.1:** `POST /claude` accepts `{ messages, model, tenantToken }`, validates JWT, forwards to Anthropic, returns response
🟢 **Code:** JWT verified with `TENANT_JWT_SECRET`. Forward via `@anthropic-ai/sdk`. Stream response back via SSE.

🔴 **Test 3.2:** `POST /claude` meters usage: increments `ai_spent_cents` in tenants DB per request (input + output tokens × per-model rate)
🟢 **Code:** Post-response, look up rate table, increment atomically.

🔴 **Test 3.3:** When tenant's `ai_spent_cents > ai_credit_cents + overage_allowance`, return 402 with "Upgrade or top up"
🟢 **Code:** Read-check before forwarding. Configurable overage allowance (default $20 grace).

🔴 **Test 3.4:** `GET /usage/:tenant` returns current spend + credit + per-day breakdown (last 30 days)
🟢 **Code:** Aggregate from a `ai_calls` table logged per request.

🔴 **Test 3.5:** `GET /health` returns proxy status
🟢 **Code:** Ping Anthropic with a cheap request; verify DB reachable.

🔴 **Test 3.6:** Proxy rate-limits per tenant (default: 60 requests/min)
🟢 **Code:** Sliding-window counter in-memory; Redis upgrade later if needed.

**Refactor:** Extract rate-table + pricing into `pricing.js`. JWT verification into `auth.js`. Usage logging into `usage.js`.

**Test command:** `node playground/ai-proxy/server.test.js` (new file).

**Deploy-the-proxy once:**
```bash
cd playground/ai-proxy
flyctl launch --no-deploy --copy-config --name clear-ai-proxy --org clear-apps
flyctl secrets set ANTHROPIC_API_KEY=<key> TENANT_JWT_SECRET=<secret> DATABASE_URL=<pg-url> PROXY_SHARED_SECRET=<secret>
flyctl deploy
```

**Commit:** `feat(ai-proxy): metered Claude proxy with per-tenant quota`

---

### Phase 4 — Tenant + billing

🔴 **Test 4.1:** `POST /api/checkout-session` creates Stripe Checkout for $99/mo Pro subscription, returns session URL
🟢 **Code:** Stripe SDK, success URL back to Studio with session_id.

🔴 **Test 4.2:** `POST /api/stripe-webhook` on `customer.subscription.created` creates tenant row + slug + issues cookie
🟢 **Code:** Slug = `clear-<random-6>` (globally unique). Cookie = signed JWT with slug + exp 24h.

🔴 **Test 4.3:** Webhook on `subscription.deleted` sets `plan='cancelled'`, blocks deploys, schedules 30-day destroy
🟢 **Code:** Immediate flag, scheduled destroy via a cron-like table.

🔴 **Test 4.4:** Webhook on `subscription.updated` (past_due) blocks deploys, keeps apps running 7 days
🟢 **Code:** Flag `plan='past_due'` with grace_expires_at.

🔴 **Test 4.5:** `GET /api/tenant` returns current plan, apps deployed, ai_spent_cents, ai_credit_cents
🟢 **Code:** Read from tenants DB; Studio UI renders badge.

🔴 **Test 4.6:** Deploy endpoint rejects with 402 when tenant quota exceeded
🟢 **Code:** Pre-check `apps_deployed < plan_limit`. Return structured error.

🔴 **Test 4.7:** Stripe metered billing records AI overage (units = dollars of overage)
🟢 **Code:** `stripe.subscriptionItems.createUsageRecord` — report daily from a cron.

**Refactor:** Webhook verification into middleware. Plan limits into a single `plans.js` table.

**Test command:** `node playground/billing.test.js` — Stripe test mode, mock webhook signatures.

**Commit:** `feat(billing): Stripe Checkout + webhook + metered overage + tenant quotas`

---

### Phase 5 — Studio `/api/deploy` + related endpoints

🔴 **Test 5.1:** `POST /api/deploy` with `{ source, appSlug, secrets?, domain? }` returns `{ jobId, appName }`
🟢 **Code:** Tenant-authed (cookie). Call `packageBundle` in-memory, tar, POST to builder with shared-secret.

🔴 **Test 5.2:** `POST /api/deploy` fails clearly when no tenant cookie, FLY_API_TOKEN missing, or tarball > 50MB
🟢 **Code:** Three distinct error codes: 401, 503, 413.

🔴 **Test 5.3:** `POST /api/deploy` with source needing secrets returns 400 + `{ needsSecrets: [...] }` unless provided
🟢 **Code:** `packageBundle.needsSecrets` drives validation.

🔴 **Test 5.4:** When `aiCallsDetected`, auto-issue CLEAR_AI_TOKEN (JWT with tenant slug) and pass to builder for secret-set
🟢 **Code:** Sign with `TENANT_JWT_SECRET`, 90-day expiry, include tenant slug.

🔴 **Test 5.5:** `GET /api/deploy-status/:jobId` returns `{ status, url?, error?, stage }`
🟢 **Code:** In-memory job map keyed by jobId; polls builder, caches result.

🔴 **Test 5.6:** `POST /api/custom-domain` with `{ appName, domain }` calls builder `/cert`, returns DNS records
🟢 **Code:** Pass-through.

🔴 **Test 5.7:** `GET /api/deploy-history/:app` returns last 10 releases
🟢 **Code:** Proxy to builder `/releases/:app`.

🔴 **Test 5.8:** `POST /api/rollback` with `{ appName, version }` calls builder `/rollback`
🟢 **Code:** Pass-through, tenant ownership check first.

🔴 **Test 5.9:** `POST /api/secrets` updates Fly app secrets (calls builder)
🟢 **Code:** For rotation without re-deploy.

**Refactor:** Extract HTTP-to-builder wrapper into `playground/deploy.js` with retries (3x on transient 5xx). Extract tenant ownership check into middleware.

**Test command:** `node playground/server.test.js` — mock builder + mock Stripe.

**Commit:** `feat(studio): /api/deploy + custom-domain + rollback + history + secrets`

---

### Phase 6 — Studio UI

🔴 **Test 6.1:** Deploy button appears in toolbar when `compileStatus === 'ok' && tenant.plan !== 'cancelled'`
🟢 **Code:** Toggle visibility per pattern as `#run-btn`.

🔴 **Test 6.2:** Clicking Deploy opens modal listing required secrets with inputs + optional custom domain field
🟢 **Code:** Reuse existing modal component styles.

🔴 **Test 6.3:** Submitting the modal calls `/api/deploy` and polls `/api/deploy-status/:jobId` every 2s
🟢 **Code:** SSE preferred over poll; fall through on unsupported. Progress bar shows stages (building → pushing → deploying → healthy).

🔴 **Test 6.4:** On success, modal shows live URL + "Copy", also shows custom domain instructions if set
🟢 **Code:** Persist `deployedUrl` in localStorage keyed by source hash. Re-deploy dialog shows "Last deployed: <url>".

🔴 **Test 6.5:** On failure, modal shows stage + stderr tail (last 20 lines) with "Retry" button
🟢 **Code:** No auto-retry — user chooses. Link to status.buildclear.dev if stage == "builder_offline".

🔴 **Test 6.6:** Deploy History drawer lists past releases; each row has "Rollback" button with confirm
🟢 **Code:** `GET /api/deploy-history/:app`. Rollback = `POST /api/rollback`, then refresh drawer.

🔴 **Test 6.7:** Custom Domain dialog shows DNS records with copy buttons, polls cert status until issued
🟢 **Code:** Fly cert status endpoint; poll every 10s for up to 10 min.

🔴 **Test 6.8:** Plan/usage badge in toolbar shows `<apps>/25 • $<ai_spent>/$<ai_credit>`; clicking opens billing page
🟢 **Code:** Fetches `/api/tenant` every 30s. Red when over quota.

🔴 **Test 6.9:** First-time-visitor sees Stripe Checkout gate before Studio loads
🟢 **Code:** If no tenant cookie, redirect to `/signup` which creates checkout session.

**Refactor:** Move deploy UI logic into `deployDialog.js` (or inline section) with a clean state machine: `idle → prompting → uploading → building → deploying → live|failed`.

**Test command:** `node playground/ide.test.js` (Playwright). Stub `/api/deploy` to exercise UI flows.

**GAN check:** Mock the modal HTML first, screenshot, then build the compiler/UI to match. Don't wing the layout.

**Commit:** `feat(ui): Deploy + custom domain + rollback + billing gate`

---

### Phase 7 — Security hardening + multi-tenancy audit

🔴 **Test 7.1:** Tarball with `/etc/passwd` absolute path → builder rejects 400
🟢 **Code:** Already in Phase 2, add explicit red-team test here.

🔴 **Test 7.2:** Tarball with `../../../root/.ssh/id_rsa` → rejected
🟢 **Code:** Same.

🔴 **Test 7.3:** Tarball with symlink → rejected
🟢 **Code:** Same.

🔴 **Test 7.4:** Builder without Bearer secret → 401
🟢 **Code:** Already in Phase 2, add explicit test.

🔴 **Test 7.5:** AppName injection attempt (`; rm -rf /`) → Studio sanitizer rejects at `/api/deploy`
🟢 **Code:** Regex `^[a-z0-9-]{3,63}$`. Never splice raw into shell — use `execFile` not `exec`.

🔴 **Test 7.6:** Cross-tenant deploy attempt (Tenant A's cookie, Tenant B's appName) → 403
🟢 **Code:** Ownership check: `appName` must start with `clear-<cookie.tenantSlug>-`.

🔴 **Test 7.7:** AI proxy with expired JWT → 401
🟢 **Code:** Standard JWT expiry check.

🔴 **Test 7.8:** AI proxy with JWT from another tenant → meters on correct tenant, not claimed tenant
🟢 **Code:** JWT claim `sub` authoritatively identifies tenant.

🔴 **Test 7.9:** Source with direct `use '@anthropic-ai/sdk'` → lint warns "bypasses metering; your usage won't count toward plan credits and your own API key will be billed"
🟢 **Code:** Add to `cli/clear.js lint` + Studio lint.

🔴 **Test 7.10:** Audit log entries generated for every deploy, rollback, destroy, secret-set
🟢 **Code:** `audit_log` table in Studio DB. Immutable.

**Refactor:** Move all sanitizers to `playground/sanitize.js`. Single import for appName, tenantSlug, domain validation.

**Test command:** `node playground/security.test.js` (new file).

**Commit:** `security: multi-tenant audit, sanitization, lint warnings`

---

### Phase 8 — End-to-end integration test

🔴 **Test 8.1:** Full flow: Stripe test Checkout → tenant created → deploy todo-fullstack → URL serves 200 → rollback to previous (none exists, expect 400) → destroy
🟢 **Code:** New `playground/deploy-integration.test.js`. Skipped by default, runs with `CLEAR_INTEGRATION_DEPLOY=1`. Real money: ~$0.05 Fly + $0 Stripe test mode.

🔴 **Test 8.2:** Re-deploy same app, assert same URL, assert SQLite data persists
🟢 **Code:** Seed one todo before re-deploy, fetch after, assert present.

🔴 **Test 8.3:** Deploy agent app (helpdesk-agent) with CLEAR_AI_TOKEN → `/api/chat` returns an agent response via proxy → `ai_spent_cents` ticked up
🟢 **Code:** Real ask-claude call via proxy. Cost ~$0.02 + prove metering works.

🔴 **Test 8.4:** Add custom domain `test-<rand>.example.buildclear.dev` (pre-configured wildcard) → cert issues → URL serves 200 on custom domain
🟢 **Code:** Wildcard cert pre-configured; test just adds + verifies.

🔴 **Test 8.5:** Two rapid deploys → second waits on mutex; no race condition
🟢 **Code:** Fire both in parallel, assert ordering.

🔴 **Test 8.6:** Teardown removes app, volume, Postgres, cert
🟢 **Code:** `flyctl apps destroy` + `flyctl postgres destroy` + `flyctl certs delete` in test afterEach.

**Test command:** `CLEAR_INTEGRATION_DEPLOY=1 node playground/deploy-integration.test.js`
**Budget:** abort if a single test exceeds $0.25 of Fly compute.

**Commit:** `test: e2e integration covering deploy, rollback, custom domain, ai proxy`

---

### Phase 9 — Documentation (MANDATORY per CLAUDE.md)

| Surface | Update |
|---------|--------|
| `intent.md` | New "Studio Capabilities" section: Deploy, Custom Domain, Rollback, AI Proxy. These are *not* language features — no new node types. |
| `SYNTAX.md` | New "Deploying" section. Shows Deploy flow end-to-end with screenshots. Notes AI proxy routing is automatic. |
| `AI-INSTRUCTIONS.md` | Meph guidance: apps should not use raw `@anthropic-ai/sdk`; use `ask claude` so the compiler routes via proxy automatically. No hot loops that block scale-to-zero. |
| `USER-GUIDE.md` | New chapter: "Ship it — from 'Run' to 'Live'". Covers Deploy button, secrets prompt, custom domain, rollback, billing, AI credits. |
| `ROADMAP.md` | Mark "Phase 85: One-click deploy" complete. Next moves: self-serve domain, deploy rollback UI polish, per-tenant usage dashboard, Meph-driven deploy from chat. |
| `landing/marcus.html` | Deploy proof moment: screen recording "15 seconds from idea to live URL" + pricing card |
| `playground/system-prompt.md` | Meph learns the `deploy_app` tool — inputs: none (reads current source), outputs: live URL + any needed secrets |
| `CLAUDE.md` | Add `clear deploy` line in CLI block, note Studio Deploy button is canonical |
| `PHILOSOPHY.md` | Add principle #17: "Deployable by default — every Clear app is one click from a public URL, no devops required" |

**Test command:** Grep `landing/` for old syntax; confirm 0 stale examples.

**Commit:** `docs: full surface update for one-click deploy`

---

## 🧪 Testing Strategy

- **Unit:** every phase has its own test file, all mocked
- **Integration:** Phase 8 hits real Fly + Stripe test mode; gated behind env var; costs ~$0.25 per full run
- **Smoke:** all 8 core templates must deploy cleanly. Any failure = compiler regression, not deploy regression.
- **Security:** explicit tarball-escape, injection, cross-tenant, JWT expiry tests in Phase 7
- **Cost:** integration run budget cap — abort if any single step exceeds $0.25

---

## ✅ Success Criteria

- [ ] Marcus clicks Deploy, gets a live URL in ≤30s for a fresh app
- [ ] Re-deploy completes in ≤15s (cached layers + existing app)
- [ ] Deployed apps scale to zero after 5 min idle; wake in ≤3s on first request
- [ ] Secret prompt appears when needed, never when not
- [ ] Custom domain adds in ≤60s after DNS is correct
- [ ] Rollback completes in ≤15s and restores previous version
- [ ] Stripe signup → tenant created → first deploy works in one session
- [ ] AI proxy meters per-tenant correctly; overage triggers 402 + email
- [ ] Two tenants deploying in parallel never see each other's state
- [ ] Every one of the 8 core templates deploys successfully
- [ ] Builder stays healthy 7 days under synthetic load (1 deploy/hr)
- [ ] Proxy stays healthy 7 days under synthetic load (100 AI calls/hr)
- [ ] Monthly Fly bill for builder + proxy + 25 simulated Marcus apps stays under $25
- [ ] All 9 doc surfaces updated
- [ ] Security audit: tarball escape, injection, cross-tenant, JWT all fail correctly

---

## 📎 Copy-Paste to Continue

> Implement `plans/plan-one-click-deploy-04-17-2026.md`. Phases in order — each phase's tests must pass before starting the next. Use TDD: red test first, green minimal code, refactor. Integration phase (Phase 8) needs `CLEAR_INTEGRATION_DEPLOY=1` and ~$0.25 of Fly spend. Docs (Phase 9) is mandatory per CLAUDE.md — do not merge without all 9 surfaces updated. Run `update-learnings` at the end of each phase.

---

## 🚧 Deferred (explicitly out-of-scope for Phase 85)

1. **Per-tenant usage dashboard.** Studio shows the badge; a real breakdown page is Phase 86.
2. **Self-serve data export.** Download SQLite / dump Postgres on demand. Phase 90.
3. **Multi-region deploys.** Every app is `iad` for v1. Phase 91.
4. **Deploy rollback UI polish.** Basic rollback works; richer diff view of what changed is Phase 92.
5. **Meph-driven deploy from chat.** Meph knows the tool exists; full conversational deploy (Meph prompts for secrets, picks domain, etc.) is Phase 93.
