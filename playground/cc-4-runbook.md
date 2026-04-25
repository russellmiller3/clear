# Publish Runbook — first time you ship against a real Cloudflare account

This is the one-page checklist for Russell (or any future operator) to confirm
that Studio's **Publish** button actually serves a Clear app at
`https://<name>.buildclear.dev` via Cloudflare Workers + D1 + the multi-tenant
binding.

Run this AFTER Phase 85a paperwork is done (domain registered, Cloudflare API
token + account ID in hand, root domain attached, Trust Verified or Workers
for Platforms entitlement granted).

---

## 1. Set the operator env vars

Open a fresh terminal in the Clear repo. Set these before starting Studio.

```bash
# Where Publish ships to. The body of the request also says cloudflare,
# but this env stays as the safety belt + admin override.
export CLEAR_DEPLOY_TARGET=cloudflare

# The dev-mode router only mounts when this is set (it's safe in production
# too because Cloudflare's edge handles real *.buildclear.dev traffic
# directly, but Studio still uses the variable for its multi-tenant lookup).
export CLEAR_CLOUD_MODE=1

# The root your customer apps land on. Each app gets <name>.buildclear.dev.
export CLEAR_CLOUD_ROOT_DOMAIN=buildclear.dev

# Cloudflare credentials.
export CLOUDFLARE_API_TOKEN=...      # from the Cloudflare dashboard
export CLOUDFLARE_ACCOUNT_ID=...     # from the same dashboard

# Anthropic key so deal-desk's AI agent can run after deploy.
export ANTHROPIC_API_KEY=...
```

Sanity-check before starting: `echo $CLEAR_CLOUD_ROOT_DOMAIN` should print
`buildclear.dev`.

---

## 2. Start Studio

```bash
node playground/server.js
```

Open `http://localhost:3456`. You should see Studio's editor + chat panel.

---

## 3. Log in as a tenant

Studio gates Publish behind the customer's tenant cookie. For the first run,
seed a tenant via the test endpoint (this is gated to dev-mode by NODE_ENV
plus the explicit `CLEAR_ALLOW_SEED=1` opt-in):

```bash
export CLEAR_ALLOW_SEED=1   # one-time, dev-only
curl -X POST http://localhost:3456/api/_test/seed-tenant \
  -H 'Content-Type: application/json' \
  -d '{"slug":"clear-acme","plan":"pro"}' \
  -c /tmp/clear-cookie.txt
```

Refresh the Studio tab. The Publish button should now be visible (it's hidden
until the tenant cookie is present and shows an active plan).

---

## 4. Load the deal-desk app

In Studio's template picker, choose **Deal Desk** (or open
`apps/deal-desk/main.clear` directly). Click **Compile**. Confirm the status
turns green ("OK — N lines compiled").

---

## 5. Click Publish

The "Publish to Clear Cloud" window opens with:

- App name: prefilled with a short random slug (rename to `deal-desk` for the
  first run so the URL is recognizable)
- Theme: Ivory pre-selected
- Custom domain: leave blank (defaults to `<name>.buildclear.dev`)

Click **Ship it**. Within 3–5 seconds the window swaps to a live URL:

```
Live: https://deal-desk.buildclear.dev   [Copy]
```

---

## 6. Verify the URL works

Click the link. The deal-desk login page should render. Log in with the
seeded credentials (the deal-desk source has a default admin you can grep
out of `apps/deal-desk/main.clear`). Navigate to `/cro`. The queue loads
empty because D1 is fresh.

POST a fake deal via the public API (the deal-desk source has the endpoint
shape):

```bash
curl -X POST https://deal-desk.buildclear.dev/api/deals \
  -H 'Content-Type: application/json' \
  -d '{"customer":"Acme","value":12000,"stage":"review"}'
```

Refresh the queue. The new row should appear. Click **draft AI summary** on
the row — the AI agent runs (because the Publish flow seeded the
`ANTHROPIC_API_KEY` secret into the deployed bundle). Approve. The status
flips to "approved." Done.

---

## 7. Confirm the multi-tenant binding

From the Studio host, hit the dev-only lookup endpoint:

```bash
curl http://localhost:3456/api/_test/lookup-subdomain/deal-desk
```

You should get back JSON describing the binding:
`{"tenantSlug":"clear-acme","appSlug":"deal-desk","scriptName":"deal-desk","hostname":"deal-desk.buildclear.dev",...}`.

This proves Studio's tenant database knows where the app lives, which is what
makes the multi-tenant routing work for everyone after you.

---

## If something fails

| Symptom | Likely cause | Where to look |
|---|---|---|
| Window shows "Nothing to publish — compile first" | Source not loaded into the editor | Click Compile first; status must read OK |
| Publish button hidden | No tenant cookie OR plan is "cancelled" | Re-run the seed-tenant curl from step 3 |
| 401 on Publish | Tenant cookie expired | Re-run the seed-tenant curl |
| 402 on Publish | Plan over quota | Bump the plan in the seed-tenant call (e.g. `"plan":"team"`) |
| 503 on Publish | Cloudflare credentials wrong | Re-check `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` |
| Live URL link returns 404 | Cloudflare DNS not pointed at the worker | Confirm root domain is attached to the Cloudflare zone |
| Live URL returns "missing api_key" on the AI button | Secret didn't get seeded into the bundle | Hit `/api/_test/inject-wfp-api` to reset the fake, then re-publish |

For deeper failures, the Publish window itself will show the failed stage
("Failed at stage: provisionD1 — quota exceeded") with the last 20 lines of
stderr — copy that into the bug report.

---

## What this proves when it works end-to-end

Russell can hand a prospect a live `https://demo.buildclear.dev` URL within
10 seconds of clicking Publish. That is the wedge to first paying customer.
