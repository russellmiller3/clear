# Russell's launch checklist

The agent-side of Clear Cloud is done. The Publish button in Studio takes any
Clear app and ships it to a live URL via Cloudflare in a few seconds.

**These five items are the gating list to first paying Marcus customer.** Once
they're in your hands, you can do a real publish, record the demo, cold-pitch,
and close.

Order matters — items 1 and 2 unblock items 3-5.

---

## 1. Register the domain — `buildclear.dev`

**Where:** Cloudflare Registrar (or any registrar — Cloudflare is easiest because
it puts the zone in the same dashboard as the worker).

**Time:** ~10 minutes including DNS propagation.

**Why first:** every other piece needs this. The published apps live at
`<name>.buildclear.dev`, the Stripe webhooks point at it, the runbook expects
it as `CLEAR_CLOUD_ROOT_DOMAIN`.

**Cost:** ~$15/year for the .dev TLD.

**Done when:** `dig buildclear.dev NS` returns Cloudflare nameservers.

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
`https://api.buildclear.dev/stripe/webhook` (or wherever your billing endpoint
will live). For first customer, the test-mode endpoint is fine; real billing
gets wired up when there's a real subscription to charge.

**Done when:** you can run a `$0.50` test charge and see it land in your
Stripe dashboard.

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

## When all five are done

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
working AI summaries. **That's the wedge — record the demo from there.**

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
