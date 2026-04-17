# Plan: One-Click Deploy (Hosted Studio → Fly.io)

**Branch:** `feature/one-click-deploy`
**Date:** 2026-04-17
**Status:** Red-teamed 2026-04-17 — line numbers verified, critical security test code inline, data contracts added, fail-closed policy specified, Stripe webhook dedup added, docker build resource caps added
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

## ⚠️ Architectural Shift Flagged

**Studio gains a persistent database for the first time.** Today `playground/server.js` is in-memory — state resets on restart, nothing survives. This plan introduces a Studio-owned Postgres database (separate from per-customer app databases) holding:

- `tenants` — one row per paying customer, source of truth for plan + quotas + AI spend
- `tenants_apps` — maps (tenant, appSlug) → Fly appName for re-deploy idempotency
- `stripe_events` — event_id dedup table, prevents double-billing on webhook replay
- `audit_log` — immutable log of every deploy, rollback, destroy, secret-set

**Why this matters:** Studio goes from stateless to stateful. Deployment adds a backup requirement. Schema migrations become a thing. A Studio DB outage now blocks all deploys + billing operations.

**Decision:** Accept the shift — billing + multi-tenant cannot work without persistence. Use Fly Postgres (same DB infrastructure as customer apps) so one vendor + one set of ops knowledge. Run daily `pg_dump` → S3 via a scheduled Fly machine. Document in `playground/README.md` and flag in `HANDOFF.md` when this ships.

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
<!-- no runtime/ai-client.js — routing happens inside the compiler-emitted _askAI helper (compiler.js:323–437) via a runtime check on process.env.CLEAR_AI_URL -->
| `lib/packaging.js` | Shared packager — called by both `cli/clear.js` and `playground/deploy.js`. Produces Dockerfile + package.json + runtime copy. Exports `packageBundle()`. |
| `lib/packaging.test.js` | Unit tests for packaging |

### Modified
| File | What changes | Why |
|------|-------------|-----|
| `cli/clear.js` | `packageCommand` (lines 867–954) becomes a thin wrapper around `packageBundle` from `lib/packaging.js`. Keep argv parsing + output; remove the 70 lines of generator code. | Reuse across CLI + Studio deploy. No duplicate Dockerfile logic. |
| `compiler.js` | In the `_askAI` helper (lines 323–437), add a runtime check: if `process.env.CLEAR_AI_URL` is set, POST to that URL with `Authorization: Bearer <CLEAR_AI_TENANT_JWT>` instead of calling `https://api.anthropic.com/v1/messages` directly. Do the same in `_askAIWithTools` and `_askAIStream`. | Route deployed apps through the proxy so we meter + rate-limit per tenant. Local dev still uses the direct path. |
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

## 🏗️ Phase 0 — Fly Capacity (hard prerequisite, do not skip)

Fly's default org quota is ~100 machines. At 25 apps × 500 customers we need 12,500. We cannot start Phase 1 until either (a) Fly raises our quota to 10k+, or (b) we architect sharding across multiple orgs from day one.

**Step 0.1 — Apply for Trust Verified Org status**
Send this email to `sales@fly.io` (cc `support@fly.io`). Subject: **Multi-tenant SaaS — Trust Verified org + machine quota request**

```
Hi Fly team,

I'm Russell Miller, building Clear (https://buildclear.dev) — a platform
where business users describe apps in plain English and we compile + deploy
them to a live URL. Customer never sees code or infrastructure; they just
click Deploy and get deals.acme.com.

Looking to run all customer deploys on Fly. Your scale-to-zero machines are
the whole reason our unit economics work: customers have 20-30 small apps
each, each used ~2h/day. On always-running platforms we lose money per
customer; on Fly we project 87% gross margin.

Three specific asks:
  1. Trust Verified Org status for multi-tenant SaaS workload
  2. Machine quota raised from default to 10,000 across 3 orgs
     (clear-apps-01, clear-apps-02, clear-apps-03)
  3. A dedicated account contact for capacity planning as we grow

Architecture:
  • Each customer's apps live in one of 3 sharded orgs (deterministic
    sha256(customerSlug) % 3 routing)
  • Firecracker VM isolation per machine (Fly default — no extra config)
  • SQLite + Fly Volumes for most apps; Fly Postgres for apps that opt in
  • One shared builder machine per org handles: Docker build → push to
    registry.fly.io → Machines API create
  • AI-enabled apps route Claude calls through a metered proxy machine
    (one per shard), so we attribute + bill usage per customer

Scale plan:
  • Q1 launch target:  ~50 customers × ~20 apps  = ~1,000 machines
  • Q2 target:         ~200 customers × 20 apps  = ~4,000 machines
  • 12-month target:   500+ customers            = 10,000+ machines

Billing model: Clear pays Fly directly. Our customers pay Clear $99/mo and
never have a Fly account.

Pattern reference: this mirrors how Supabase, Resend, and Val.town run
multi-tenant platforms on Fly. Happy to jump on a call to walk through the
isolation + capacity model in more detail.

What information do you need from us to approve Trust Verified status?

Thanks,
Russell Miller
Founder, Clear
russell@buildclear.dev
```

Turnaround: ~24 hrs. Expected outputs: higher org machine limit, Trust Verified badge on all 3 orgs, dedicated account contact email/Slack. If Fly declines or caps at an unacceptable level, Phase 0 exit criteria are NOT met — re-evaluate the whole plan before proceeding.

**Step 0.2 — Design the shard fallback now (even if Step 0.1 succeeds)**
Single-org is a single point of failure. If Fly throttles us or our org gets flagged, the whole platform stops. Shard across N orgs from day one.

Design:
```javascript
// playground/builder/shards.js
const SHARDS = [
  { index: 0, slug: 'clear-apps-01', token: process.env.FLY_API_TOKEN_01 },
  { index: 1, slug: 'clear-apps-02', token: process.env.FLY_API_TOKEN_02 },
  { index: 2, slug: 'clear-apps-03', token: process.env.FLY_API_TOKEN_03 },
];

export function shardFor(tenantSlug) {
  const h = crypto.createHash('sha256').update(tenantSlug).digest();
  const idx = h.readUInt32BE(0) % SHARDS.length;
  return SHARDS[idx];
}
```
Customer `acme` always lands on the same shard. App names stay unique because they include the customer slug. Builder calls flyctl with `FLY_API_TOKEN=<shardToken>` in env.

**Step 0.3 — Provision 3 orgs from day one**
Even if we could fit everyone in one org, start with three. Migrations later are painful; shard headers now are free.
- `clear-apps-01`, `clear-apps-02`, `clear-apps-03` — all in org group owned by Clear
- Generate org-scoped tokens for each; store as builder secrets

**Step 0.4 — Auto-failover when a shard hits quota**
If shard N returns `FLY_QUOTA_HIT`, builder retries on shard N+1 (with a capacity check first). If ALL shards are full, page ops.
```javascript
async function deployWithFailover(tenantSlug, ...args) {
  const primary = shardFor(tenantSlug);
  const order = [primary, ...SHARDS.filter(s => s.index !== primary.index)];
  for (const shard of order) {
    const result = await tryDeploy(shard, ...args);
    if (result.ok) return { ...result, shard: shard.slug };
    if (result.code !== 'FLY_QUOTA_HIT') return result;
    logger.warn('[SHARD_FULL]', { shard: shard.slug });
  }
  await notifyOps({ severity: 'P1', text: 'All Fly shards at capacity — deploys blocked' });
  return { ok: false, code: 'ALL_SHARDS_FULL' };
}
```

**Exit criteria for Phase 0:**
- [ ] Fly sales replies with confirmed higher quota (or explicit "use sharding")
- [ ] 3 Fly orgs provisioned with names, tokens stored as builder secrets
- [ ] `shards.js` design reviewed and committed to the plan
- [ ] `DEPLOY_ERRORS.ALL_SHARDS_FULL` added to the error constants

**Do not write any Phase 1 code until Phase 0 exit criteria are met.**

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
| Source needs `ANTHROPIC_API_KEY` | v1: bring-your-own, customer pastes in modal. v2 (Phase 6): auto-issue CLEAR_AI_TENANT_JWT, route via AI proxy. |
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
| Deployed app hits proxy with bad CLEAR_AI_TENANT_JWT | Proxy returns 401; app shows "AI service unavailable" |
| Proxy down | Deployed app gets 503 on `ask claude`; app falls through to error UI; log to ops |
| Anthropic API down | Proxy returns their error as-is to app; log per-tenant |
| Customer tries to bypass proxy (hardcodes their own key) | They can — it's their app source. If they use `use '@anthropic-ai/sdk'` directly, Clear doesn't meter. We'll catch this in lint (Phase 7) and warn. |

---

## 📜 Data Contracts (authoritative JSON shapes)

### Browser → Studio: `POST /api/deploy`
```jsonc
// Request
{
  "appSlug": "todos",               // string, 3-40 chars, [a-z0-9-]+, required
  "source": "build for web ...",    // string, Clear source, required
  "secrets": {                      // object, optional; present if needsSecrets non-empty
    "ANTHROPIC_API_KEY": "sk-...",
    "JWT_SECRET": null              // null = let builder auto-generate
  },
  "customDomain": "deals.acme.com"  // string, optional
}

// Response (202 — job accepted)
{
  "jobId": "job_a7b3c9d2e1f0",      // string, opaque
  "appName": "clear-acme-todos-a7b3c9", // computed, globally unique
  "url": null                        // null while building; populated by deploy-status
}

// Error (400)
{
  "code": "MISSING_SECRET",         // one of DEPLOY_ERRORS keys
  "needsSecrets": ["ANTHROPIC_API_KEY"],
  "message": "This app needs a secret called ANTHROPIC_API_KEY before it can ship."
}
```

### Studio → Builder: `POST /build`
```jsonc
// Request — multipart/form-data
// part "metadata": JSON
{
  "appName": "clear-acme-todos-a7b3c9",   // sanitized, already validated by Studio
  "tenantSlug": "acme",
  "dbBackend": "sqlite",                  // "sqlite" | "postgresql"
  "secrets": {                            // all values base64 to survive transport
    "JWT_SECRET": "aGVsbG8=",
    "CLEAR_AI_URL": "https://api.buildclear.dev/claude",
    "CLEAR_AI_TENANT_JWT": "eyJhbGc..."
  },
  "customDomain": "deals.acme.com",       // optional
  "flyToml": "app = '...'\n..."           // full config, pre-rendered by Studio
}
// part "tarball": application/x-tar binary

// Response (200)
{
  "ok": true,
  "appName": "clear-acme-todos-a7b3c9",
  "url": "https://clear-acme-todos-a7b3c9.fly.dev",
  "releaseVersion": "v7",
  "buildDurationMs": 28340
}

// Error (4xx/5xx)
{
  "ok": false,
  "code": "BUILD_FAILED",                 // PATH_ESCAPE, BUILD_FAILED, PUSH_FAILED, DEPLOY_FAILED, FLY_QUOTA_HIT, TIMEOUT, UNHEALTHY
  "stage": "build",                       // upload, extract, build, push, create, secrets, deploy, health
  "stderrTail": "..last 20 lines..",
  "durationMs": 305000
}
```

### Studio → Browser: `GET /api/deploy-status/:jobId`
```jsonc
{
  "jobId": "job_a7b3c9d2e1f0",
  "status": "building",           // uploading | building | deploying | live | failed
  "stage": "push",                // sub-stage, updated live from builder
  "progressPct": 45,              // 0-100
  "url": null,                    // string when status === "live"
  "error": null                   // { code, message, tail } when status === "failed"
}
```

### Proxy: `POST /claude`
```jsonc
// Request — same shape as Anthropic's /v1/messages, plus:
{
  "model": "claude-sonnet-4-6",
  "messages": [...],
  "max_tokens": 1024
}
// Headers: Authorization: Bearer <CLEAR_AI_TENANT_JWT>

// Response — Anthropic's response verbatim (we just forward), status 200
// OR 402 { code: "AI_QUOTA_EXCEEDED" } when over plan
// OR 503 { code: "AI_PROXY_DOWN" } when our DB unreachable
// OR 401 { code: "BAD_TENANT_JWT" } when JWT invalid/expired
```

## 🔁 Deploy State Machine (reference for Phases 5 + 6)

```
  IDLE ──[user clicks Deploy]──→ PROMPTING_SECRETS ──[submit]──→ UPLOADING
                                      │                              │
                                      │[cancel]                      │[fail]
                                      ▼                              ▼
                                    IDLE                          FAILED ◄──[build fails]── BUILDING ◄──[tarball uploaded]──
                                                                     │                         │
                                                                     │[retry]                  │
                                                                     ▼                         ▼
                                                                 PROMPTING_SECRETS         DEPLOYING
                                                                                              │
                                                                                              ▼
                                                                                         HEALTHY ──[user clicks Rollback]──→ ROLLING_BACK ──→ HEALTHY
```

| State | Visible | Hidden | User Can | User Can't |
|-------|---------|--------|----------|------------|
| IDLE | Deploy button | spinner | click Deploy | — |
| PROMPTING_SECRETS | secrets modal | progress bar | cancel, edit, submit | deploy a second time |
| UPLOADING | progress (0–20%) | secrets modal | — | click Deploy (button disabled) |
| BUILDING | progress (20–60%), stage name | — | — | deploy a second time |
| DEPLOYING | progress (60–95%), stage name | — | — | — |
| HEALTHY | live URL + Copy + History | progress | click URL, rollback, re-deploy | — |
| FAILED | stage + stderr tail + Retry | progress | retry, cancel | — |
| ROLLING_BACK | progress (0–100%) | rollback button | — | deploy a second time |

## 📢 Error Strings (copy exact)

```javascript
// playground/deploy-errors.js
export const DEPLOY_ERRORS = {
  NO_TENANT:           "Sign in before deploying — check your subscription.",
  TENANT_CANCELLED:    "Your subscription was cancelled. Re-subscribe to deploy again.",
  TENANT_PAST_DUE:     "Payment failed. Update your card to keep deploying.",
  QUOTA_EXCEEDED:      "You've used all {limit} app slots on your plan. Upgrade or delete an app.",
  TARBALL_TOO_LARGE:   "Your app bundle is over 50 MB. Remove large files and try again.",
  MISSING_SECRET:      "This app needs a secret called {name} before it can ship.",
  BUILDER_OFFLINE:     "Deploy service is down — try again in a minute. Status: status.buildclear.dev",
  BUILD_FAILED:        "Build failed at stage {stage}. Last error: {tail}",
  FLY_QUOTA_HIT:       "We hit a shard's capacity — trying another. You shouldn't see this unless all shards are full.",
  ALL_SHARDS_FULL:     "All deploy shards are at capacity. Ops has been paged; deploys resume in ~15 minutes.",
  AI_PROXY_DOWN:       "AI service temporarily unavailable. Your deploy will work; AI calls will return an error until this clears.",
  AI_QUOTA_EXCEEDED:   "Your app's Claude usage hit this month's cap. Top up credits or upgrade.",
  CERT_DNS_BAD:        "Cert not issued — DNS isn't set correctly yet. Check the records below.",
  ROLLBACK_NO_HISTORY: "No previous release to roll back to.",
};
```

## 📋 Implementation — TDD Cycles (9 phases)

### Phase 1 — Extract `packageBundle()` into `lib/packaging.js`

**Why first:** Every downstream phase calls into this. Refactor before anyone else depends on the old shape. `cli/clear.js` has zero export statements (it's a CLI entry point) — the helper must live in a new shared module.

**New file:** `lib/packaging.js` — exports `packageBundle(result, outDir, opts)`.
**Why new file (not cli/clear.js export):** cli/clear.js is a CLI entry point; importing it from Studio would pull every CLI helper (argv parsing, `output()`, `loadSource`) along with it. A dedicated module keeps boundaries clean.

🔴 **Test 1.1:** `packageBundle(result, outDir)` writes `server.js` + `index.html` + `package.json` + `Dockerfile` + `.dockerignore` + `clear-runtime/db.js` + `clear-runtime/auth.js` + `clear-runtime/rateLimit.js` to outDir, returns `{ ok: true, files, outDir, dbBackend, needsSecrets, aiCallsDetected }`.
🟢 **Code:** Port lines 882–951 of `cli/clear.js` into `lib/packaging.js`. <!-- Lines verified 2026-04-17 -->

```javascript
// lib/packaging.js — copy the logic from cli/clear.js:882–951 here
export function packageBundle(result, outDir, opts = {}) {
  const { useAIProxy = false, sourceText = '' } = opts;
  mkdirSync(outDir, { recursive: true });
  const files = [];

  // server.js
  const serverCode = result.serverJS || result.javascript;
  writeFileSync(resolve(outDir, 'server.js'), serverCode);
  files.push('server.js');

  // ... (index.html, tests, runtime copy, package.json, Dockerfile, .dockerignore — mirrors cli/clear.js:890–951)

  return {
    ok: true,
    files,
    outDir,
    dbBackend: result.dbBackend || 'sqlite',
    needsSecrets: detectNeededSecrets(result.ast, sourceText),
    aiCallsDetected: detectAICalls(result.ast),
  };
}

function detectNeededSecrets(ast, sourceText) {
  const secrets = [];
  if (sourceText.includes('requires login') || sourceText.includes('requires auth')) secrets.push('JWT_SECRET');
  // scan AST for SERVICE_CALL nodes
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (n?.type === 'SERVICE_CALL' && n.service) secrets.push(`${n.service.toUpperCase()}_KEY`);
      if (n?.body) walk(n.body);
      if (n?.pages) walk(n.pages);
    }
  };
  walk(ast?.body || []);
  return [...new Set(secrets)];
}

function detectAICalls(ast) {
  let found = false;
  const walk = (nodes) => {
    if (!Array.isArray(nodes) || found) return;
    for (const n of nodes) {
      if (n?.type === 'ASK_CLAUDE' || n?.type === 'AGENT_DEF' || n?.type === 'SCHEDULED_AGENT') { found = true; return; }
      if (n?.body) walk(n.body);
      if (n?.pages) walk(n.pages);
    }
  };
  walk(ast?.body || []);
  return found;
}
```

**cli/clear.js edit:** `packageCommand` (currently lines 867–954) becomes a thin wrapper:
```javascript
import { packageBundle } from '../lib/packaging.js';
async function packageCommand(args) {
  // ... same argv parsing + loadSource + compile (lines 867–881 unchanged) ...
  const result = compileProgram(loaded.source, { sourceMap: true, moduleResolver: makeModuleResolver(loaded.filePath) });
  if (result.errors.length > 0) { output({ ok: false, errors: result.errors }, flags); process.exit(1); }
  const outDir = flags.outDir || resolve(dirname(loaded.filePath), 'deploy');
  const res = packageBundle(result, outDir, { sourceText: loaded.source });
  output({ ok: true, files: res.files, outDir: res.outDir, message: `Packaged ${res.files.length} files to ${res.outDir}/` }, flags);
}
```

🔴 **Test 1.2:** `packageBundle` picks `runtime/db-postgres.js` as `db.js` when `result.dbBackend === 'postgresql'`
🟢 **Code:** Carried from old logic in lines 903–910.

🔴 **Test 1.3:** `needsSecrets` for source containing `requires login` returns `['JWT_SECRET']`; for source with Stripe SERVICE_CALL returns `['JWT_SECRET', 'STRIPE_KEY']` (deduped)
🟢 **Code:** `detectNeededSecrets` above.

🔴 **Test 1.4:** `aiCallsDetected === true` for source containing `ask claude` or `define agent`; false for plain CRUD app
🟢 **Code:** `detectAICalls` above.

🔴 **Test 1.5:** When `opts.useAIProxy === true`, generated `package.json` omits `@anthropic-ai/sdk` from dependencies (proxy handles it); Dockerfile adds `ENV CLEAR_AI_URL ENV CLEAR_AI_TENANT_JWT` placeholders
🟢 **Code:** Conditional around the npm deps collection. Placeholders overwritten at deploy time via Fly secrets.

**Refactor:** Move Dockerfile template strings to named constants (`DOCKERFILE_ALPINE`, `DOCKERFILE_SLIM`) at top of `lib/packaging.js`.

**Test command:** `node lib/packaging.test.js` (new) + `node clear.test.js` (existing `clear package` tests still pass).

**Commit:** `refactor(packaging): extract packageBundle into lib/packaging.js for Studio reuse`

---

### Phase 2 — Builder machine

🔴 **Test 2.1:** `builder/server.js` POST `/build` accepts multipart tarball + metadata, returns `{ jobId }`
🟢 **Code:** Minimal Express server. Require `Authorization: Bearer <BUILDER_SHARED_SECRET>`. 401 without.

🔴 **Test 2.2:** `POST /build` extracts tarball to scoped temp dir, validates no path escapes (zip-slip defense)
🟢 **Code:** Use `tar-stream` with per-entry validation: path starts without `/`, normalized path has no `..`, type is `regular` or `directory`. Anything else → 400.

🔴 **Test 2.3:** `POST /build` runs `docker build` + `docker push registry.fly.io/<appName>:<sha>` in the temp dir, with resource caps (cpu-quota 100000, memory 512m) and a 5-min timeout
🟢 **Code:**
```javascript
await execFile('docker', [
  'build',
  '--cpu-quota', '100000',           // 1 CPU max
  '--memory', '512m',                // 512MB RAM max
  '--network', 'bridge',             // no host network
  '-t', `registry.fly.io/${appName}:${sha}`,
  '.'
], { cwd: tempDir, timeout: 300_000 });
```
Capture stdout/stderr per stage. Retry `docker push` once on network 5xx; never retry `docker build` (non-deterministic failures mean a real source bug). Kill the container if timeout hits.

🔴 **Test 2.3b:** Dockerfile with a 10-minute `RUN sleep 600` is killed at the 5-min mark and returns `{ ok: false, stage: 'build', reason: 'timeout' }`
🟢 **Code:** Same as above. Timeout behavior asserted.

🔴 **Test 2.4:** `POST /build` creates the Fly app if absent (`flyctl apps create <appName> --org clear-apps`)
🟢 **Code:** Check via `flyctl apps list --json`. Create if absent.

🔴 **Test 2.5:** `POST /build` sets secrets before deploy (`flyctl secrets set KEY=VAL --app <appName> --stage`)
🟢 **Code:** `--stage` defers restart; all secrets applied before first deploy. Injects `JWT_SECRET` auto-gen, `CLEAR_AI_URL`/`CLEAR_AI_TENANT_JWT` if AI proxy enabled, customer-provided SERVICE_CALL keys.

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

🔴 **Test 2.17:** When primary shard returns `FLY_QUOTA_HIT`, builder auto-fails over to the next shard; only pages ops when ALL shards are full
🟢 **Code:** Use the `deployWithFailover` helper from Phase 0. Test scenarios:
- Primary shard has capacity → deploy lands on primary, response includes `shard: 'clear-apps-01'`
- Primary at quota, secondary has capacity → deploy lands on secondary, logs `[SHARD_FULL]` for primary
- All 3 shards at quota → returns `{ ok: false, code: 'ALL_SHARDS_FULL' }`, ops paged once (not per shard)
- Tenant's shard assignment is sticky — re-deploy of same tenant+app goes to same shard even when that shard has free capacity elsewhere
```javascript
it('fails over when primary shard is at quota', async () => {
  mockFlyctl('clear-apps-01', { ok: false, code: 'FLY_QUOTA_HIT' });
  mockFlyctl('clear-apps-02', { ok: true, url: 'https://clear-acme-todos-a7.fly.dev' });
  const res = await deployWithFailover('acme', { appName: 'clear-acme-todos-a7', ... });
  expect(res.ok).toBe(true);
  expect(res.shard).toBe('clear-apps-02');
  expect(opsNotifier.calls).toHaveLength(0);  // don't page on partial capacity
});

it('pages ops when all shards full', async () => {
  SHARDS.forEach(s => mockFlyctl(s.slug, { ok: false, code: 'FLY_QUOTA_HIT' }));
  const res = await deployWithFailover('acme', ...);
  expect(res).toEqual({ ok: false, code: 'ALL_SHARDS_FULL' });
  expect(opsNotifier.calls).toHaveLength(1);
});
```

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
🟢 **Code:** Post-response, look up rate table, increment atomically via `UPDATE tenants SET ai_spent_cents = ai_spent_cents + ? WHERE slug = ?` (idempotent on replay because we log the request_id).

🔴 **Test 3.3:** When tenant's `ai_spent_cents > ai_credit_cents + overage_allowance`, return 402 with "Upgrade or top up"
🟢 **Code:** Read-check before forwarding. Configurable overage allowance (default $20 grace).

🔴 **Test 3.3b:** When proxy's DB is unreachable (can't read tenant record), return 503 — DO NOT forward to Anthropic
🟢 **Code:** Fail closed. Reasoning: if we can't check the tenant's quota OR meter the call, forwarding means free Claude calls for whoever. Log to ops, surface "AI service temporarily unavailable" in the deployed app.
```javascript
try {
  const tenant = await db.findOne('tenants', { slug: jwt.sub });
  if (!tenant) return res.status(401).json({ error: 'unknown tenant' });
  // ... quota check, forward, meter
} catch (dbErr) {
  logger.error('[PROXY_DB_FAIL]', dbErr);
  return res.status(503).json({ error: 'AI service temporarily unavailable' });
}
```

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

🔴 **Test 4.2:** `POST /api/stripe-webhook` on `customer.subscription.created` creates tenant row + slug + issues cookie. Same `event_id` replayed returns 200 but does NOT create a duplicate tenant.
🟢 **Code:** Dedup via `stripe_events` table (`id TEXT PRIMARY KEY, received_at TIMESTAMP`). On every webhook:
```javascript
const { id: eventId } = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
const existing = await db.findOne('stripe_events', { id: eventId });
if (existing) return res.status(200).json({ ok: true, deduped: true });
await db.insert('stripe_events', { id: eventId, received_at: new Date() });
// ... proceed to handle event
```
Slug = `clear-<random-6>` (globally unique across tenants table). Cookie = signed JWT with slug + exp 24h. Use upsert on tenant row so out-of-order `subscription.updated` before `subscription.created` still settles correctly.

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

🔴 **Test 5.4:** When `aiCallsDetected`, auto-issue CLEAR_AI_TENANT_JWT (JWT with tenant slug) and pass to builder for secret-set
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
🟢 **Code:** Insert button in `playground/ide.html` AFTER line 497 (`#stop-btn`), BEFORE line 498 (`<span class="toolbar-sep"></span>`). Exact insertion: <!-- Lines verified 2026-04-17 -->
```html
<button id="deploy-btn" class="toolbar-btn primary" onclick="doDeploy()" title="Ship to a live URL" style="display:none">Deploy</button>
```
Toggle visibility in the same place `#run-btn` is toggled (grep `run-btn` for current pattern). Style with `.primary` when plan is active; add `.disabled` class when plan is `cancelled` or `past_due`.

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

🔴 **Test 7.1:** Tarball with `/etc/passwd` absolute path → builder rejects 400 `{ code: 'PATH_ESCAPE' }`
🟢 **Code:** In `playground/builder/server.js`, per-entry validation:
```javascript
function validateTarEntry(entry) {
  const p = entry.header.name;
  if (p.startsWith('/') || p.startsWith('\\')) throw { code: 'PATH_ESCAPE', path: p };
  if (p.includes('..')) throw { code: 'PATH_ESCAPE', path: p };
  if (entry.header.type !== 'file' && entry.header.type !== 'directory') throw { code: 'BAD_ENTRY_TYPE', path: p };
}
```
Test:
```javascript
// playground/builder/server.test.js
it('rejects tarball with absolute path', async () => {
  const bad = await tarFromEntries([{ name: '/etc/passwd', type: 'file', contents: 'x' }]);
  const res = await fetch(`${BUILDER}/build`, {
    method: 'POST', body: bad,
    headers: { 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/x-tar' }
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ code: 'PATH_ESCAPE' });
});
```

🔴 **Test 7.2:** Tarball with `../../../root/.ssh/id_rsa` → rejected with `PATH_ESCAPE`
🟢 **Code:** Same validator. Test mirrors 7.1 with path `../../../root/.ssh/id_rsa`.

🔴 **Test 7.3:** Tarball with a symlink entry → rejected with `BAD_ENTRY_TYPE`
🟢 **Code:** Same validator. Test uses `type: 'symlink'`.

🔴 **Test 7.4:** Builder request without Bearer secret → 401
🟢 **Code:**
```javascript
function requireBearer(req, res, next) {
  const h = req.headers.authorization || '';
  if (h !== `Bearer ${process.env.BUILDER_SHARED_SECRET}`) return res.status(401).json({ error: 'unauthorized' });
  next();
}
```
Test: fetch without header → 401. Fetch with wrong bearer → 401. Fetch with correct → 200.

🔴 **Test 7.5:** AppName injection (`todos; rm -rf /`) rejected at Studio with `INVALID_APP_NAME`
🟢 **Code:**
```javascript
// playground/sanitize.js
export function sanitizeAppName(s) {
  if (!/^[a-z0-9-]{3,63}$/.test(s)) throw { code: 'INVALID_APP_NAME', input: s };
  return s;
}
```
Test:
```javascript
it('rejects shell injection in appName', async () => {
  const res = await post('/api/deploy', {
    source: 'build for web...',
    appSlug: 'todos; rm -rf /',
  });
  expect(res.status).toBe(400);
  expect(res.data.code).toBe('INVALID_APP_NAME');
});
```
Every flyctl invocation in the builder uses `execFile(bin, args, opts)` — never `exec(string)` — so even if a bad slug slipped through Studio, it could not inject shell metacharacters.

🔴 **Test 7.6:** Cross-tenant deploy (Tenant A cookie, appName belongs to Tenant B) → 403 `CROSS_TENANT`
🟢 **Code:**
```javascript
function assertOwnership(tenantSlug, appName) {
  if (!appName.startsWith(`clear-${tenantSlug}-`)) throw { code: 'CROSS_TENANT', tenantSlug, appName };
}
```
Test:
```javascript
it('blocks cross-tenant rollback', async () => {
  // Create two tenants
  const a = await createTestTenant('a');
  const b = await createTestTenant('b');
  // A tries to rollback B's app
  const res = await fetch('/api/rollback', {
    method: 'POST',
    headers: { Cookie: a.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ appName: `clear-${b.slug}-todos-xyz`, version: '1' }),
  });
  expect(res.status).toBe(403);
  expect((await res.json()).code).toBe('CROSS_TENANT');
});
```

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

🔴 **Test 8.3:** Deploy agent app (helpdesk-agent) with CLEAR_AI_TENANT_JWT → `/api/chat` returns an agent response via proxy → `ai_spent_cents` ticked up
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
