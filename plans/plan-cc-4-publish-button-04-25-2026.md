# Plan — CC-4: Publish button → Clear Cloud (multi-tenant subdomain flow)

**Date:** 2026-04-25
**Branch suggestion:** `feature/cc-4-publish-clear-cloud`
**Scope:** Wire Studio's existing Deploy/Publish button to ship to `*.buildclear.dev` via Cloudflare Workers for Platforms + multi-tenant subdomain binding. Additive — Fly path stays intact and selectable. Smoke target: Russell publishes `apps/deal-desk/main.clear` and gets a working `https://deal-desk.buildclear.dev`-shaped URL within 3-5 seconds.
**Effort:** 7 cycles of ~30-45 min each.
**Reads through:** `playground/ide.html` (`#deploy-btn` line 596, `doDeploy()` line 3177, `_applyTheme` line 3170), `playground/deploy.js` (`wireDeploy` line 214, `/api/deploy` handler line 241, target dispatch line 261), `playground/deploy-cloudflare.js` (`deploySource` line 205, `_defaultHostname` line 174), `playground/tenants.js` (`InMemoryTenantStore.markAppDeployed` line 86, `lookupAppBySubdomain` line 195), `playground/cloud-routing/index.js`, `playground/server.js` (lines 95-105 cloud routing wire, lines 180-210 LAE Phase B cloud-update precedent), `playground/subdomain-router/index.js` (`resolveAppTarget` line 96).

---

## What we found in the audit

1. **The Cloudflare deploy path is end-to-end wired but gated behind `CLEAR_DEPLOY_TARGET=cloudflare`.** `playground/deploy.js` line 261 dispatches to `deploySourceCloudflare` when the env is set; otherwise it falls through to the Fly builder. Both paths share the same UI response shape (`{ ok, jobId, url }`) so the front-end already works against either backend. **There is no UI affordance to pick which one** — it's an implicit env switch.

2. **`deploySource` already produces the multi-tenant URL.** The `_defaultHostname` helper (line 174) returns `${appSlug}.${rootDomain}` (e.g. `deal-desk.buildclear.dev`). The function pipeline (`provisionD1` → `applyMigrations` → `uploadScript` → `setSecrets` → `attachDomain` → `markAppDeployed`) populates `cfDeploys` so `lookupAppBySubdomain('deal-desk')` returns the row. Hostname collision is per-tenant only today (slug uniqueness lives in `cfDeploys` keyed by `tenantSlug/appSlug`).

3. **`mountCloudRouting` (CC-1, server.js:101-105) is the dev-mode subdomain router.** When `CLEAR_CLOUD_MODE=1` is set, the subdomain router middleware mounts BEFORE static + chat routes and proxies `<sub>.<root>` requests to the resolved app's `flyAppName`-derived internal URL. Production CF traffic never hits this middleware (DNS goes straight to CF's edge), but it IS the local-smoke story: spin Studio up with both envs set and the deploy URL is reachable on the same box. This is what CC-4's smoke verification rides on.

4. **The CC-1 router resolves to a Fly internal URL, not a Cloudflare URL.** `subdomain-router/index.js:122-128` builds `${scheme}://${flyAppName}.internal:${port}`. It checks `row.fly_app_name` and 502s if absent (line 119). For Cloudflare-deployed apps, `cfDeploys` has `scriptName`, not `fly_app_name` — **the existing router will 502 on a CF-deployed subdomain.** Cycle 5 below adds the CF target arm.

5. **Studio's existing modal already collects everything CC-4 needs.** `doDeploy()` (line 3177) opens a modal with: app slug input (line 3205), 5 curated themes (line 3187), optional custom domain (line 3209), optional secrets (line 3210). It POSTs to `/api/deploy` with `{ source, appSlug, secrets, domain }` (line 3242). On `ok: true` it shows the live URL (line 3271). **No new modal work is needed for the happy path** — only a target picker and a "what's `buildclear.dev`?" hint.

6. **`getDeployDeps()` already exposes the shared store + WfpApi to the LAE widget** (deploy.js:204-211). The `applyShip` closure in server.js:184-209 uses it to push incremental updates. CC-4's first-deploy path goes through `/api/deploy`, not `applyShip`, but the same plumbing works — the widget cloud-ship path is the precedent for "given tenantSlug + appSlug + cloudContext, route to CF."

7. **`InMemoryTenantStore.markAppDeployed` is the binding step.** It writes the row that `lookupAppBySubdomain` later reads. **The smoke test for CC-4 is: after `/api/deploy` returns 200, `store.lookupAppBySubdomain(appSlug)` returns a non-null row whose `hostname` matches the URL the API returned.** That's the multi-tenant binding — the existing tests cover it for the deploy orchestrator but NOT for the `/api/deploy` HTTP endpoint round-trip.

8. **`PostgresTenantStore` is a method-by-method `NOT_IMPLEMENTED` stub** (tenants.js:290-317). CC-4 is explicitly scoped against `InMemoryTenantStore` — production Postgres backing is CC-1's finish, separate plan, after first paying customer.

9. **Test runners shipped as `node <file>.js`, not vitest.** `playground/deploy-cloudflare.test.js` uses the inline `describe/it/expect` from `lib/testUtils.js`. `playground/deploy.test.js` boots a real Express app with `wireDeploy` + a fake builder + an injected fake WfpApi via `_setWfpApiForTest`. `playground/ide.test.js` is Playwright, spawns the server on port 3458, drives `chromium`. CC-4 follows all three patterns.

10. **`apps/deal-desk/main.clear` exists** (170 lines, GTM-1 complete 2026-04-25). It uses `database is local memory` (line 29) which compiles to D1 on the cloudflare target — exactly the multi-table + endpoints + AI shape that exercises the full deploy pipeline. **This is the smoke target. When Russell's local Studio publishes it and `curl https://deal-desk.buildclear.dev/api/deals/pending` returns `[]`, CC-4 is done.**

11. **Blocker check (negative):** all primitives shipped. The compile-target, the orchestrator, the lock manager, the rollback ladder, the lookup function, the audit log, the `getDeployDeps` shared store — every load-bearing piece is in `main` as of 2026-04-25. CC-4 is wiring + UX + a target-picker + a CF-aware arm in the dev subdomain router. No new infrastructure code, no new schema, no external dependencies.

---

## Cycles

### Cycle 1 — `/api/deploy` request-level target switch (parameterize CLEAR_DEPLOY_TARGET via body)

**Test (red, extend `playground/deploy.test.js`):**

```
With CLEAR_DEPLOY_TARGET unset, POST /api/deploy {target:'cloudflare', source, appSlug:'hello'}
  + a valid tenant cookie + an injected fake WfpApi via _setWfpApiForTest
  → status 200, body.ok===true, body.url==='https://hello.buildclear.dev',
    fake.calls includes 'uploadScript' and 'attachDomain'.
With CLEAR_DEPLOY_TARGET unset, POST /api/deploy {target:'fly', source, appSlug:'hello'}
  → still routes through the Fly mock builder path, body.jobId === 'job-xyz'.
With CLEAR_DEPLOY_TARGET='cloudflare' (env), POST /api/deploy WITHOUT body.target
  → still routes through CF (env wins as default).
With CLEAR_DEPLOY_TARGET='cloudflare', POST /api/deploy {target:'fly'}
  → body.target overrides, routes through Fly.
With body.target='clear-cloud' (alias) → routes through cloudflare.
With body.target='nonsense' → 400 {error:/unknown deploy target/i}.
```

**Green (minimum):** add a `pickDeployTarget(reqBody, env)` pure helper near the top of `deploy.js`. Returns `'cloudflare' | 'fly'`. Logic: if `reqBody.target` is set and recognized (`'cloudflare'`, `'clear-cloud'`, `'fly'`, `'fly.io'`), it wins. Else fall back to `deployTarget()` (the existing env reader). If `reqBody.target` is set but unrecognized, throw a `ValidationError`-shaped object the route turns into 400. In `/api/deploy`'s handler (line 241), replace the `if (deployTarget() === 'cloudflare')` with `if (pickDeployTarget(req.body, process.env) === 'cloudflare')`. Same change for `/api/deploy-status/:jobId` (line 325) — use the body's `target` if present, else env. (Status polling is GET so it reads from a `target=...` query string — small but symmetrical.)

**Why the switch lives on the request, not the env, in CC-4:** Russell wants both paths coexisting. The env is process-global; the request is per-Publish. UI lets the user pick; admin lets ops pin a default with the env. Belt-and-suspenders.

**Files touched:** `playground/deploy.js`, `playground/deploy.test.js`.
**Depends on:** none. Pure refactor + new test.

---

### Cycle 2 — Tenant binding written for in-memory CF deploys (smoke gate)

**Test (red, extend `playground/deploy.test.js`):**

```
Setup: CLEAR_DEPLOY_TARGET='cloudflare', _resetLockManagerForTest, _resetJobsForTest,
  _setWfpApiForTest(fake), seed tenant 'clear-acme', POST /api/deploy with
  body {source: DEAL_DESK_MIN, appSlug:'deal-desk', target:'cloudflare'} and the cookie.
After the response returns 200:
  store.lookupAppBySubdomain('deal-desk') !== null
  store.lookupAppBySubdomain('deal-desk').tenantSlug === 'clear-acme'
  store.lookupAppBySubdomain('deal-desk').appSlug === 'deal-desk'
  store.lookupAppBySubdomain('deal-desk').scriptName === 'deal-desk'
  store.lookupAppBySubdomain('deal-desk').hostname === 'deal-desk.buildclear.dev'
  store.lookupAppBySubdomain('deal-desk').d1_database_id !== null  // since deal-desk has tables
With body.target='cloudflare' AND body.appSlug='Deal Desk!' (invalid)
  → 400 with sanitize error code, NOTHING written to lookupAppBySubdomain.
With CLEAR_DEPLOY_TARGET='fly' default, POST /api/deploy {source, appSlug:'flyapp'} (legacy path)
  → store.lookupAppBySubdomain('flyapp') === null  (Fly path doesn't seed the CF subdomain index — by design)
```

**Green (minimum):** This is the load-bearing assertion that CC-4's whole user-experience claim ("multi-tenant subdomain flow") actually works. The orchestrator in `deploy-cloudflare.js` already calls `store.markAppDeployed(...)` (line 343), which already populates `cfDeploys` and is what `lookupAppBySubdomain` scans (line 195). **No new code on the happy path** — the test verifies the binding is real and forces us to break the happy path if a future refactor decouples them. Add ONE small thing: if `markAppDeployed` succeeds, log `[cc-4] bound ${tenantSlug}/${appSlug} → ${hostname}` so the smoke runbook has a one-line tail to grep. The 400-input arm of the test catches any future regression where sanitize is short-circuited and a malformed slug pollutes `cfDeploys`.

**Files touched:** `playground/deploy.js` (one log line + one `if (deployTarget() === 'cloudflare') { ... }` → `if (pickDeployTarget(...) === 'cloudflare')` carry-over from cycle 1; defensive — confirms the post-deploy `await store.incrementAppsDeployed(tenant.slug)` runs in the binding-rich CF arm).
**Depends on:** Cycle 1.

---

### Cycle 3 — Subdomain router CF-target arm (dev-mode local smoke)

**Test (red, in `playground/subdomain-router/index.test.js`, extend):**

```
resolveAppTarget('deal-desk.buildclear.dev', lookupFn) where lookupFn returns
  {tenantSlug, appSlug, scriptName:'deal-desk', d1_database_id:'d1-fake', hostname:'deal-desk.buildclear.dev'}
  (no fly_app_name — CF row shape) →
  { ok:true, target:{ subdomain:'deal-desk', backend:'cloudflare', scriptName:'deal-desk',
                       hostname:'deal-desk.buildclear.dev' } }.
resolveAppTarget on a Fly-shaped row (has fly_app_name) → unchanged from today
  (target.url === 'http://<flyApp>.internal:8080', backend:'fly').
resolveAppTarget on a CF-shaped row when env CLEAR_CLOUD_CF_PROXY=1
  → target.url === 'https://deal-desk.buildclear.dev' (the public CF edge URL).
resolveAppTarget on a CF-shaped row WITHOUT CLEAR_CLOUD_CF_PROXY
  → { ok:false, status:502, reason:/cloudflare-deployed app — set CLEAR_CLOUD_CF_PROXY=1/i }
```

**Green:** in `subdomain-router/index.js:resolveAppTarget`, after the `if (!row.fly_app_name)` 502 check (line 119), add a CF-target arm BEFORE that 502:

- If `row.scriptName` is set AND `row.hostname` is set (CF row shape), return `{ ok:true, target:{ subdomain, backend:'cloudflare', scriptName: row.scriptName, hostname: row.hostname, url: process.env.CLEAR_CLOUD_CF_PROXY === '1' ? `https://${row.hostname}` : null } }`. If the env isn't set, return the 502 with the clear message above (don't silently route through CF — the dev expectation is "local Studio binds the URL but doesn't proxy unless explicitly opted-in," because in production CF DNS does the routing, no Studio in front).
- The existing Fly arm (`if (!row.fly_app_name) ... return 502`) stays after this — fall-through means "neither CF nor Fly fields populated → genuinely orphan row."

In `createRouterMiddleware` (line 233), add a branch: if `resolution.target.backend === 'cloudflare'` AND `resolution.target.url` is set, call `proxyToTarget` with the public CF URL (existing path). If `target.url === null`, return 502 with the helpful message (already covered by the resolveAppTarget arm — middleware just surfaces it).

**Why this is the dev-mode arm.** In production, `*.buildclear.dev` DNS points at Cloudflare. Studio doesn't proxy. In dev, Russell wants to verify on his laptop that the Publish flow + binding work — so he runs Studio with `CLEAR_CLOUD_MODE=1` AND `CLEAR_CLOUD_CF_PROXY=1` AND `/etc/hosts` points `deal-desk.buildclear.dev` at `127.0.0.1`. Studio's subdomain router proxies to the real CF URL. The 502 fail-closed path is so a future production deployment doesn't accidentally make Studio a hot-reverse-proxy bottleneck — explicit env opt-in only.

**Files touched:** `playground/subdomain-router/index.js`, `playground/subdomain-router/index.test.js`.
**Depends on:** Cycle 2 (the row shape it resolves against).

---

### Cycle 4 — Studio modal: target picker + Clear Cloud as default

**Test (red, extend `playground/ide.test.js` Playwright suite):**

```
After loading Studio, clicking #deploy-btn opens the modal with:
  a #deploy-target-radio-group containing two radios:
    [x] Clear Cloud (buildclear.dev)   — checked by default
    [ ] Fly.io
  When 'Clear Cloud' is selected, #deploy-domain placeholder reads
    'deals.acme.com (optional — defaults to <slug>.buildclear.dev)'.
  When 'Fly.io' is selected, the placeholder updates to 'deals.acme.com (optional)'.
Clicking 'Ship it' with 'Clear Cloud' selected POSTs body.target === 'cloudflare'.
Clicking 'Ship it' with 'Fly.io' selected POSTs body.target === 'fly'.
After a successful Clear Cloud deploy, the live URL link reads exactly
  https://<slug>.buildclear.dev (no .fly.dev fallback).
```

**Green:** in `playground/ide.html`'s `doDeploy()` modal HTML (line 3201), insert a new `<div id="deploy-target-radio-group">` block above the `<label>App name</label>`:

```html
<label>Where to ship</label>
<div id="deploy-target-radio-group" style="display:flex;gap:12px;margin-bottom:12px">
  <label><input type="radio" name="deploy-target" value="cloudflare" checked>
    Clear Cloud <span class="hint">(buildclear.dev)</span></label>
  <label><input type="radio" name="deploy-target" value="fly">
    Fly.io</label>
</div>
```

In the submit handler, read `document.querySelector('input[name="deploy-target"]:checked').value` into `pickedTarget` and include `target: pickedTarget` in the `/api/deploy` POST body. Update the URL-render branch (line 3271) to compose the URL from `s.result?.url` directly (already correct) — but on the CF target, validate the URL begins with `https://` and ends with `${rootDomain}` so a stale Fly-shaped result on the CF target surfaces as "deploy returned wrong URL — check status" rather than a silent footgun. (The CF orchestrator already returns the correct URL; this is a belt-check.)

In the placeholder-swap behavior, attach a single `change` listener on the radio group that updates `#deploy-domain.placeholder`. Pure DOM, no fetch.

**Default = Clear Cloud** is the locked-in choice (per open decisions surfaced for Russell — see end). Open decisions also list "auto-pick + hide Fly" as an alternative; if Russell picks that, swap the radios for a hidden input. Default-checked + visible Fly is the safer default during transition because the eval/test infra still uses Fly today.

**Files touched:** `playground/ide.html`, `playground/ide.test.js`.
**Depends on:** Cycle 1 (the body.target the radio drives is parsed there).

---

### Cycle 5 — End-to-end smoke test: deal-desk through `/api/deploy` (Clear Cloud target)

**Test (red, in `playground/server.test.js`):**

```
Setup: CLEAR_DEPLOY_TARGET unset, CLEAR_CLOUD_ROOT_DOMAIN='buildclear.dev'.
The server.test.js boot path already starts a real server on 3457.
Add a new test block:
  Seed a tenant via POST /api/_test/seed-tenant {slug:'clear-acme', plan:'pro'}.
  Inject a fake WfpApi (need a small new endpoint POST /api/_test/inject-wfp-api
    that calls _setWfpApiForTest behind the same NODE_ENV/CLEAR_ALLOW_SEED gate
    the seed-tenant endpoint already has — see deploy.js line 232).
  Read apps/deal-desk/main.clear from disk.
  POST /api/deploy with {source: dealDeskSrc, appSlug:'deal-desk', target:'cloudflare'}.
  Expect status 200, body.ok===true, body.url==='https://deal-desk.buildclear.dev'.
  GET /api/deploy-status/${jobId}?target=cloudflare → status:'ok',
    result.url === 'https://deal-desk.buildclear.dev'.
Then verify the binding is queryable:
  Add a small admin endpoint GET /api/_test/lookup-subdomain/:sub (test-gated,
    returns store.lookupAppBySubdomain(sub) JSON). GET /api/_test/lookup-subdomain/deal-desk
    → 200 {tenantSlug:'clear-acme', appSlug:'deal-desk', scriptName:'deal-desk',
           hostname:'deal-desk.buildclear.dev'}.
```

**Green:** wire two test-only endpoints in `deploy.js`'s `wireDeploy`:

- `POST /api/_test/inject-wfp-api` (gated identically to seed-tenant: `if (process.env.NODE_ENV !== 'test' && !process.env.CLEAR_ALLOW_SEED) return 404`). Body: `{calls:'reset'}` resets to a built-in default fake; otherwise no-op. (We don't accept arbitrary fake bodies over the wire — too risky. Instead the fake is hard-coded inside this endpoint, mirroring `makeFakeWfpApiForDeployTest` in deploy.test.js.)

- `GET /api/_test/lookup-subdomain/:sub` — same gate. Calls `store.lookupAppBySubdomain(req.params.sub)` and returns the JSON.

The smoke test in server.test.js then exercises the full HTTP pipeline against the real running server. **This is the load-bearing test that proves the multi-tenant subdomain binding works end-to-end through `/api/deploy`** — earlier cycles test pieces (orchestrator, modal, store) but cycle 5 is the wire-everything-up gate.

**Files touched:** `playground/deploy.js` (two test-only endpoints), `playground/server.test.js`.
**Depends on:** Cycles 1, 2.

---

### Cycle 6 — Slug uniqueness gate + collision UX

**Test (red, extend `playground/deploy.test.js`):**

```
Two tenants T1 ('clear-acme') and T2 ('clear-globex') both ship appSlug 'deals' to CF.
T1 ships first, returns 200 with url 'https://deals.buildclear.dev'.
T2 ships second with same appSlug → 409 {error:/slug taken/i, hint:/another tenant owns deals.buildclear.dev/i, suggestedSlug:/deals-(globex|[a-z0-9]{4})/i}.
T2 retries with the suggestedSlug → 200, url is the suggested one.
Same-tenant re-deploy of an existing slug (T1 → T1, same appSlug):
  on first deploy → mode:'deploy' status 200.
  on second deploy → routed through the Phase B 'mode:update' path
    (lastRecord present), versionId added to versions[]. NOT a 409.
```

**Green:** add a pre-flight check in `/api/deploy`'s CF arm BEFORE calling `deploySourceCloudflare`:

```js
// CC-4 — global slug uniqueness for *.buildclear.dev. Multi-tenant scope
// means the hostname is the namespace; two tenants can't both own
// 'deals.buildclear.dev'. Per-tenant uniqueness already lives in cfDeploys
// keyed by tenantSlug/appSlug — this check is the cross-tenant version.
const collision = await store.lookupAppBySubdomain(appSlug);
if (collision && collision.tenantSlug !== tenant.slug) {
  return res.status(409).json({
    ok: false,
    error: 'slug taken',
    hint: `Another tenant owns ${appSlug}.${cloudflareRootDomain()}. Pick a different name.`,
    suggestedSlug: `${appSlug}-${tenant.slug.replace(/^clear-/,'').slice(0,6)}`,
  });
}
```

The same-tenant-redeploy case is already handled by `getAppRecord` returning a row → orchestrator goes mode:'deploy' or mode:'update' depending on how the call was made. CC-4 doesn't change that. **Left for Russell to decide (see Open Decisions): is the suggested-slug shape `<slug>-<tenant>` or `<slug>-<random>`? The test fixture allows either via the regex.**

**Files touched:** `playground/deploy.js`, `playground/deploy.test.js`.
**Depends on:** Cycle 2 (the binding lookup it queries).

---

### Cycle 7 — Custom-domain pass-through + Definition-of-Done smoke runbook

**Test (red, extend `playground/deploy.test.js` AND `playground/ide.test.js`):**

```
deploy.test.js — POST /api/deploy {target:'cloudflare', source, appSlug:'deal-desk',
  domain:'deals.acme.com'} → fake.calls includes
  { op:'attachDomain', hostname:'deals.acme.com' }
  AND body.url === 'https://deals.acme.com' (custom domain wins over default).
With invalid domain 'not-a-domain' → 400 sanitizeDomain error code,
  NO attachDomain call, NO markAppDeployed call.
With domain attach failing on CF (fake returns {ok:false, code:'DOMAIN_TAKEN'})
  → degraded:true response, url === 'https://deal-desk.buildclear.dev' (default fallback),
  store.lookupAppBySubdomain('deal-desk') still returns the row (markAppDeployed
  fires with hostname=defaultHostname when domain attach fails — existing behavior,
  this test locks it in).

ide.test.js — In the Studio modal, type 'deals.acme.com' into #deploy-domain,
  click Ship it. After 200, the rendered URL link href === 'https://deals.acme.com'.
  After failure with degraded:true, the rendered HTML includes
  /custom domain attach failed.*default.*deal-desk\.buildclear\.dev/.
```

**Green:** the domain field is already plumbed through `deploySourceCloudflare`'s `customDomain` arg (line 211). The test gap is: the existing CF deploy-test in deploy.test.js only exercises the default-hostname path. Cycle 7 closes the gap. The only code change is in the modal-render side (ide.html line 3286, the `if (domain) { fetch('/api/custom-domain', ...) }` block) — that's a SECOND fetch hitting a SEPARATE endpoint after the deploy returns. **This is wrong on the CF target** — `/api/custom-domain` re-attaches by `appName`, but CF already attached during the deploy itself. The post-deploy `/api/custom-domain` fetch is only meaningful on the Fly target. Branch on `pickedTarget`: skip the post-deploy custom-domain call when CF was used; the orchestrator already handled it.

The Definition-of-Done runbook lives in this cycle's commit message + as a comment block in `playground/cc-4-runbook.md` (a one-page markdown checklist Russell follows to verify): start Studio with `CLEAR_DEPLOY_TARGET=cloudflare CLEAR_CLOUD_MODE=1 CLOUD_FLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...`, open `localhost:3456`, log in, paste deal-desk source, click Publish, see `https://deal-desk.buildclear.dev` link, `curl https://deal-desk.buildclear.dev/api/deals/pending` returns `[]`. **No new code path** — the runbook just documents the existing one for non-Russell future readers.

**Files touched:** `playground/ide.html` (one-line target check before the post-deploy custom-domain fetch), `playground/deploy.test.js`, `playground/ide.test.js`, `playground/cc-4-runbook.md` (new — runbook only, not a code path).
**Depends on:** Cycles 4, 5.

---

## Sequencing & gates

| Cycle | Depends on | Parallel-safe? |
|-------|------------|----------------|
| 1 — `pickDeployTarget` switch | — | Yes (pure refactor + new tests) |
| 2 — Subdomain binding written + verified | 1 | After 1 |
| 3 — Router CF-target arm (dev mode) | 2 | After 2 |
| 4 — Studio modal target picker | 1 | After 1 (parallel with 2-3) |
| 5 — `/api/deploy` end-to-end smoke | 1, 2 | After 2 |
| 6 — Cross-tenant slug collision | 2 | After 2 (parallel with 3-5) |
| 7 — Custom-domain pass-through + runbook | 4, 5 | After 4-5 |

**CC-4 gate:** all of `node playground/deploy.test.js`, `node playground/deploy-cloudflare.test.js`, `node playground/server.test.js`, `node playground/ide.test.js`, `node playground/cloud-routing/index.test.js`, `node playground/subdomain-router/index.test.js`, `node lib/edit-api.test.js` green. `node clear.test.js` regression count unchanged. Manual: Russell runs the cycle 7 runbook against his real CF account (Phase 85a artifacts in place) and confirms `deal-desk.buildclear.dev` serves the deal-desk app within 5 seconds of clicking Publish.

---

## Open decisions for Russell

1. **Modal target picker visible vs auto-pick Clear Cloud and hide Fly.** Plan defaults to **visible radio, Clear Cloud checked**. Switching to "auto-pick + hide" is a 5-line diff in cycle 4 — change the `<div>` to `<input type="hidden" value="cloudflare">`. Recommendation: **keep visible during the first 5 paying-customer onboardings** so we can collect data on whether anyone clicks Fly before deleting the option. Once nobody picks Fly for 30 days, delete it.

2. **App slug uniqueness scope: per-tenant or globally unique?** Plan **defaults to globally unique** because the hostname namespace IS global (`deals.buildclear.dev` can only point one place). Cycle 6 enforces this with a 409. Alternative: prefix every hostname with the tenant slug (`acme-deals.buildclear.dev`) — preserves per-tenant scope but uglifies URLs. **Recommendation: stay globally unique**; it's how Stripe, Vercel, and Heroku do it; the 409 + suggested-slug UX is the standard escape hatch.

3. **Cloudflare deploy succeeds but tenants-db `markAppDeployed` fails — rollback or leave the bundle orphaned?** Today the orchestrator (deploy-cloudflare.js:354-361) returns a `stage:'record'` partial-success response — the app IS live on CF, the binding row failed. **Reconcile is the cleanup path** (deploy-cloudflare.js comment line 359 says "reconcile job will sync"). For CC-4 with `InMemoryTenantStore`, "reconcile" is moot because the store is process-local; a Studio restart loses the binding entirely and the orphan re-binds on next Publish to the same slug. **Recommendation: keep current behavior, surface the partial-success in the UI** ("App is live but binding lookup may be slow — refresh in 30s"). Phase 85a's Postgres + reconcile job is the durable answer; CC-4's in-memory window is acceptable risk pre-first-customer.

4. **Custom-domain UX: expose the existing `app_domains`-style flow now, or defer?** Plan **exposes the optional `domain` field in the modal** (already exists in line 3209, no UI work needed) and routes it through CF's `attachDomain` (cycle 7). **The CC-5 work that ships DNS verification UX, certificate provisioning polling, and the domain-status dashboard is OUT OF SCOPE.** What CC-4 does: take a domain string, hand it to CF, surface the result. If attach fails (CF returns 409 DOMAIN_TAKEN), the deploy returns degraded:true with the default URL. **Recommendation: ship cycle 7 as written; CC-5 polish is a follow-up after first customer.**

---

## Risks

| Risk | Mitigation |
|------|-----------|
| First Publish to a real CF account hits an unrecognized error code in `attachDomain` (e.g. account-level 1101 quota) | Cycle 7 runbook surfaces the raw `domainError.code` so Russell can grep CF docs. orchestrator's `degraded:true` response means the URL still works on the default hostname — no destructive failure. |
| Slug collision UX confuses non-technical owners | Cycle 6's 409 includes a `suggestedSlug` so the modal can offer "Use `deals-acme` instead?" with one click. Cycle 4's modal renders this on 409 (small extension to the existing error-render branch in line 3262). |
| `lookupAppBySubdomain` is O(N) over `cfDeploys` | Acceptable for in-memory + first 1-3 customers (N < 10 apps). PostgresTenantStore's SQL uses an index on hostname (tenants.js:311) — production scale is already designed-for. |
| `CLEAR_CLOUD_CF_PROXY=1` accidentally enabled in production turns Studio into a hot reverse-proxy bottleneck | Cycle 3's helpful 502 message + the `=== '1'` strict check (no truthy coercion) is the gate. Production deploy docs say "do not set CLEAR_CLOUD_CF_PROXY in any environment outside `localhost`-bound dev." The runbook in cycle 7 enforces this. |
| Test-only endpoints (`_test/inject-wfp-api`, `_test/lookup-subdomain`) leak into production | Both gated by `NODE_ENV !== 'test' && !process.env.CLEAR_ALLOW_SEED` 404 — same gate the existing `_test/seed-tenant` uses. Production env never sets either. |
| Russell's first Publish hits a fresh `clear-acme` tenant whose Stripe row doesn't exist | The `requireTenant` middleware (deploy.js:223) 401s when no cookie. Russell logs in via the dev `/api/_test/seed-tenant` endpoint or the real `/login` (CC-2 scaffolding shipped). Out of scope for CC-4 to fix; runbook calls it out as a prerequisite. |
| The deal-desk app's `database is local memory` directive emits SQLite migrations CF rejects | Already fielded — `compileProgram(source, {target:'cloudflare'})` translates this to the D1 dialect (verified by deploy-cloudflare.test.js's TODO_SRC). If a deal-desk-specific SQL fragment surfaces, the orchestrator's `stage:'migrations'` arm logs it for Russell's debug. |

---

## Definition of done

Russell starts Studio locally with the cycle 7 runbook env (`CLEAR_DEPLOY_TARGET=cloudflare`, real `CLOUDFLARE_API_TOKEN`, real `CLOUDFLARE_ACCOUNT_ID`, real `CLEAR_CLOUD_ROOT_DOMAIN=buildclear.dev`). He logs in (existing CC-2 scaffolding), opens `apps/deal-desk/main.clear` in Studio, clicks **Publish**. The modal opens with **Clear Cloud (buildclear.dev)** pre-selected, app slug pre-filled `deal-desk`, theme `ivory`, custom domain blank. He clicks **Ship it**. Within 3-5 seconds the modal swaps to a live URL: `https://deal-desk.buildclear.dev`. He clicks the link; the deal-desk login page renders. He logs in as the seeded CRO, navigates to `/cro`, the queue loads (empty, because fresh D1). He POSTs a deal via the public API (`curl ... /api/deals -d '...'`), refreshes the queue, sees the row. He clicks "draft AI summary" — the AI agent fires (the `setSecrets` step gave the bundle the `CLEAR_AI_URL` and tenant JWT) — gets back a paragraph. He approves. The status flips. **All of this serves from `https://deal-desk.buildclear.dev` via Cloudflare Workers + D1, with the multi-tenant binding the CC-1 work shipped 2026-04-25 doing the routing.**

The Fly path still works — picking the **Fly.io** radio at deploy time still returns a `*.fly.dev` URL via the legacy builder, because both backends were preserved per the additive constraint.

---

## Critical files for implementation

- `playground/deploy.js`
- `playground/ide.html`
- `playground/subdomain-router/index.js`
- `playground/deploy.test.js`
- `playground/server.test.js`
