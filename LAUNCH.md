# Russell's launch checklist

The agent-side of Clear Cloud is done. The Publish button in Studio takes any
Clear app and ships it to a live URL via Cloudflare in a few seconds.

**Status as of 2026-05-01:** `buildclear.dev` is registered. The remaining
manual work is Cloudflare/Fly trust, Stripe live billing, Postgres, and an
Anthropic org key. Agent launch branches have been cut for Stripe webhook
hardening, DNS-to-certificate provisioning, Studio publish/onboarding polish,
lead-router verification, Marcus page polish, and pricing.

**These remaining items are the gating list to first paying Marcus customer.**
Once they're in your hands, you can do a real publish, record the demo,
cold-pitch, and close.

Order matters. The domain is done; the trust/platform item now unblocks live
payments and production custom domains.

---

## Agent branches ready to integrate

| Branch | What it covers |
|---|---|
| `feature/cc3-stripe-webhook-receiver` | Stripe checkout completion webhook, fail-closed production secret handling |
| `feature/cc5-domain-cert-bridge` | DNS verification poller plus Fly HTTPS certificate provisioning |
| `feature/studio-onboarding-meph-first` | New users start in Meph chat instead of source code |
| `feature/cc4-publish-progress-ux` | Publish progress rail and live URL confirmation |
| `feature/studio-first-click-instrumentation` | First-click, time-to-first-app, and bounce telemetry |
| `feature/lead-router-launch-verification` | Lead-router launch regression guard |
| `feature/gtm-marcus-deal-desk-page` | Marcus deal-desk pitch page |
| `feature/gtm-pricing-page` | Pricing page with sales CTA |

Integrate these before the final live publish rehearsal. Keep the prover
branches post-launch unless Russell explicitly flips priority.

---

## 1. Register the domain - `buildclear.dev` - DONE

**Where:** Cloudflare Registrar (or any registrar — Cloudflare is easiest because
it puts the zone in the same dashboard as the worker).

**Time:** ~10 minutes including DNS propagation.

**Why first:** every other piece needs this. The published apps live at
`<name>.buildclear.dev`, the Stripe webhooks point at it, the runbook expects
it as `CLEAR_CLOUD_ROOT_DOMAIN`.

**Cost:** ~$15/year for the .dev TLD.

**Done:** Russell registered the domain. Keep this section for DNS handoff and
future verification, but it is no longer on the manual to-do list.

---

## 2. Cloudflare — Workers for Platforms entitlement

**Where:** Cloudflare dashboard → Workers & Pages → Plans, OR contact Cloudflare
sales for the "Trust Verified" / Workers for Platforms (WFP) tier.

**Time:** could be instant if your account already has it; could be 1-3 days
if it requires sales review.

**Why:** the multi-tenant publishing model (one app per `<name>.buildclear.dev`)
needs WFP's namespace dispatcher. Standard Workers don't support the
"customer subdomain" pattern the publish flow uses.

**Cost:** WFP starts at $25/month + per-request, scales with usage.

**What you get back:**
- `CLOUDFLARE_API_TOKEN` (already exists on your account, but make sure it has
  Workers Scripts: Edit + Workers Routes: Edit + Account D1: Edit + Workers
  for Platforms: Edit permissions)
- `CLOUDFLARE_ACCOUNT_ID` (already on your account dashboard)
- A confirmed dispatch namespace name (call it `clear-tenants` or similar)

**Done when:** the Cloudflare dashboard shows "Workers for Platforms" enabled
and you can create a dispatch namespace.

**Custom-domain verification + HTTPS:** CC-5b is now a callable poller helper
that can also bridge into CC-5c. Once the server has a Postgres pool and Fly
token, schedule `pollPendingDomainVerifications({ db, flyToken })` every minute
so pending domains move to verified or failed, and verified rows request a Fly
certificate with id/status written back.

---

## 3. Stripe — live keys

**Where:** stripe.com → Dashboard → Developers → API keys → Live keys.

**Time:** ~5 minutes if your Stripe account is already verified. If not, the
business verification can take 1-3 days.

**Why:** so a paying customer can actually pay.

**What you get:**
- `STRIPE_SECRET_KEY` (sk_live_...)
- `STRIPE_PUBLISHABLE_KEY` (pk_live_...)
- `STRIPE_WEBHOOK_SECRET` (whsec_..., from the webhook setup page)

**Webhook:** point Stripe webhooks at
`https://buildclear.dev/api/stripe-webhook` for the Clear Cloud Studio server.
Subscribe at least to `checkout.session.completed`. The receiver verifies the
raw signed body and flips the tenant plan from checkout metadata.

**Done when:** you can run a `$0.50` test charge and see it land in your
Stripe dashboard, then replay a signed test webhook and see the tenant plan
move to Team or Business.

---

## 4. Postgres — managed host

**Recommendation: Neon** (neon.tech). Free tier covers the first paying
customer comfortably, paid tier starts at $19/month, native serverless
connection pooling that works well with Cloudflare Workers.

**Why:** the in-memory database that remembers which tenant owns which app
works for the first 1-3 demos but loses everything on a server restart. To
keep a real paying customer's apps alive across restarts, this needs a real
Postgres host.

**Time:** ~10 minutes to provision.

**What you get:**
- A connection string in the form
  `postgres://user:pass@ep-xxx.region.aws.neon.tech/clear?sslmode=require`
- Drop it into the env as `DATABASE_URL` or `CLEAR_TENANTS_DATABASE_URL`.

**Done when:** `psql $DATABASE_URL -c "SELECT 1"` returns `1`.

**Note:** the agent-side wiring of "save tenant info to Postgres" is at 5 of 9
cycles done (the read/write methods land in the next 4 cycles). The plan
deliberately phases the rest after first paying customer because demos work
fine with the in-memory version. So Neon can be set up in parallel — you
won't actually need it until customer #1 is paying.

---

## 5. Anthropic — organization API key

**Where:** console.anthropic.com → Settings → Organization → API Keys.

**Time:** ~2 minutes.

**Why:** customer apps that use AI assistants (like the deal-desk demo) need
an Anthropic key embedded as a publish secret. Each customer's app calls
your org's key; usage is billed to your org.

**What you get:**
- `ANTHROPIC_API_KEY` (sk-ant-...)

**Cost model:** you're paying for the inference your customer apps make. For
a 5-customer Marcus tier at $200/month each, expect ~$5-15/month in Anthropic
costs at typical usage. Net positive.

**Done when:** `curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'` returns a JSON message body.

---

## When the remaining manual items are done

Set the env vars in a fresh terminal:

```bash
export CLEAR_DEPLOY_TARGET=cloudflare
export CLEAR_CLOUD_MODE=1
export CLEAR_CLOUD_ROOT_DOMAIN=buildclear.dev
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
export STRIPE_SECRET_KEY=sk_live_...
export STRIPE_PUBLISHABLE_KEY=pk_live_...
export STRIPE_WEBHOOK_SECRET=whsec_...
export DATABASE_URL=postgres://...
export ANTHROPIC_API_KEY=sk-ant-...
```

Start Studio: `node playground/server.js` — open `http://localhost:3456`.

Walk through the publish flow following `playground/cc-4-runbook.md` — that's
the click-by-click guide for the first real publish (env vars to set, how to
seed a tenant, what the modal should show, how to confirm the URL works).

End state: `https://deal-desk.buildclear.dev` serves the deal-desk app with
working AI summaries. **That's the wedge - record the demo from there.**

---

## Your current manual checklist

- [x] Register `buildclear.dev`.
- [ ] Enable Cloudflare Workers for Platforms / trust path, or Fly Trust
  Verified if the active deploy path stays on Fly.
- [ ] Create/verify Stripe live keys and webhook secret.
- [ ] Provision Neon/Fly Postgres and save the connection string.
- [ ] Create the Clear Cloud Anthropic org API key.
- [ ] Set the env vars below and run the publish runbook.
- [ ] Record the deal-desk demo once the live URL works.
- [ ] Send 5-10 Marcus cold pitches with the recording.

---

## Time estimate (your wall clock)

| Item | Best case | If sales / verification needed |
|---|---|---|
| 1. Domain | 10 min | 10 min |
| 2. Cloudflare WFP | 10 min | 1-3 days |
| 3. Stripe live keys | 5 min | 1-3 days |
| 4. Neon Postgres | 10 min | 10 min |
| 5. Anthropic key | 2 min | 2 min |
| **Total** | **~40 min** | **3-4 days max** |

If items 2 and 3 hit sales review, do items 1, 4, 5 first — they unblock
local dev. Items 2 and 3 are only needed for the actual customer publish.
