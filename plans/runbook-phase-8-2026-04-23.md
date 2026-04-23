# Phase 8 Runbook — Cloudflare WFP First Real Deploy

**Prereqs:** Phases 1–7 shipped (they are — main at `b0c12de`, 2399 tests green, 112/112 CF drift-guards).

**This runbook has two parts:**
1. **Setup (§1) — Russell's paperwork.** ~2 hours, one-time. Get Cloudflare + DNS + tokens ready.
2. **HITL smoke (§2) — Russell at the keyboard.** ~1 hour. Walk through real deploys and check each one.

Every step either PASSES (check the box) or produces a concrete bug. If a step fails, the steps after it usually stay runnable on a separate slug — the runbook is designed to minimize cascade blocking.

---

## §1 — Setup (paperwork, ~2 hours)

### 1.1 — Cloudflare account + paid plan

- [ ] Sign up / log in at [cloudflare.com](https://cloudflare.com)
- [ ] Dashboard → **Workers & Pages** → **Plans** → upgrade to **Paid ($5/mo)**
- [ ] Still in Workers & Pages → **Platforms** → **Create Namespace**
  - Name: `clear-apps` (or anything; we'll put the value in `CLOUDFLARE_DISPATCH_NAMESPACE` below)
  - Note the **$25/mo Workers for Platforms base fee** kicks in here

**Sanity check:** Dashboard → Workers & Pages → Platforms. Namespace `clear-apps` is listed with "0 scripts."

### 1.2 — API token

Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Custom token**.

Scopes (all **Edit** unless noted):
- [ ] Zone · Workers Routes
- [ ] Account · Workers Scripts
- [ ] Account · D1
- [ ] Account · Workers KV Storage
- [ ] Account · Workers R2 Storage
- [ ] Account · Workers Pipelines (future-proof, harmless)
- [ ] Account · Account Settings · **Read**

Zone resources: include the `buildclear.dev` zone. Account resources: include your account.

**Save the token.** You won't be able to see it again. Paste it somewhere secure first — you'll put it in `CLOUDFLARE_API_TOKEN` env var.

### 1.3 — DNS: move `buildclear.dev` to Cloudflare

- [ ] Cloudflare dash → Add a Site → `buildclear.dev` → Free plan (DNS is free, Workers is what you pay for)
- [ ] Cloudflare gives you 2 nameservers (e.g. `nina.ns.cloudflare.com`, `carl.ns.cloudflare.com`)
- [ ] Go to your registrar (wherever you bought `buildclear.dev`) → update nameservers to Cloudflare's two
- [ ] Wait for propagation (can take 5 min to 24 hrs; check with `dig ns buildclear.dev`)

**Sanity check:** `dig ns buildclear.dev` shows Cloudflare's nameservers. Cloudflare dash for `buildclear.dev` shows **Active**.

### 1.4 — Dispatch Worker (the one-time thing)

The dispatch Worker routes `*.buildclear.dev` requests to the right script inside your WFP namespace. You deploy this ONCE, manually, via wrangler.

```js
// dispatch-worker/src/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Extract the slug: foo.buildclear.dev → "foo"
    const host = url.hostname;
    const match = host.match(/^([a-z0-9-]+)\.buildclear\.dev$/);
    if (!match) return new Response('Not found', { status: 404 });
    const slug = match[1];

    try {
      const worker = env.DISPATCHER.get(slug);
      return await worker.fetch(request);
    } catch (err) {
      if (err.message.includes('not found')) {
        return new Response(`No app at ${host}`, { status: 404 });
      }
      throw err;
    }
  }
};
```

```toml
# dispatch-worker/wrangler.toml
name = "clear-dispatch"
main = "src/index.js"
compatibility_date = "2025-04-01"

[[dispatch_namespaces]]
binding = "DISPATCHER"
namespace = "clear-apps"  # match what you named it in step 1.1

[[routes]]
pattern = "*.buildclear.dev/*"
zone_name = "buildclear.dev"
```

Steps:
- [ ] Create `dispatch-worker/` dir anywhere on your machine (NOT inside the Clear repo — it's a separate Worker you own)
- [ ] Paste the two files above
- [ ] `cd dispatch-worker && npx wrangler deploy`
- [ ] First run will prompt you to log in (`wrangler login` → browser auth)

**Sanity check:** `curl https://foo.buildclear.dev` returns `"No app at foo.buildclear.dev"` with status 404 (because no tenant has deployed `foo` yet). The dispatch Worker is alive.

### 1.5 — Studio env vars

On your Studio host (for local dev, your shell; for production, the Studio's env config):

```bash
export CLOUDFLARE_ACCOUNT_ID=<32-char hex — find at dash.cloudflare.com, right sidebar>
export CLOUDFLARE_API_TOKEN=<from step 1.2>
export CLOUDFLARE_DISPATCH_NAMESPACE=clear-apps
export CLEAR_CLOUD_ROOT_DOMAIN=buildclear.dev
export CLEAR_DEPLOY_TARGET=cloudflare   # flips /api/deploy to the new path
```

Add these to `.env.example` too so the next person knows what's needed.

### 1.6 — The gate check

Before any deploy, verify the API credentials work:

```bash
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/dispatch/namespaces/$CLOUDFLARE_DISPATCH_NAMESPACE" \
  | python3 -m json.tool
```

Expect:
```json
{
  "success": true,
  "result": {
    "namespace_name": "clear-apps",
    "script_count": 0,
    ...
  }
}
```

If any of these fail, STOP — §2 won't work:
- [ ] HTTP 200 (not 401, 403, 404)
- [ ] `"success": true`
- [ ] `namespace_name` matches what you set
- [ ] `curl https://foo.buildclear.dev` still returns the dispatch Worker's 404 (Worker is up)

**If 401/403:** token scopes wrong — redo step 1.2.
**If 404:** namespace name mismatch — check `CLOUDFLARE_DISPATCH_NAMESPACE`.
**If dispatch Worker curl fails:** step 1.4 didn't land — redo it.

✅ Setup complete. Move to §2.

---

## §2 — HITL smoke (~1 hour)

Each step either passes or produces a bug. If a step hits something broken, file a concrete issue and continue with the next step on a different slug — most steps are independent.

### 2.1 — Studio boots with CF env set

```bash
node playground/server.js
```

- [ ] No errors at boot
- [ ] Server listens on port 3456 (default)
- [ ] `node playground/server.test.js` runs green (pre-existing sanity)

### 2.2 — Seed a test tenant

Studio needs a tenant record + cookie before you can deploy. For smoke testing:

```bash
curl -X POST http://localhost:3456/api/_test/seed-tenant \
  -H "Content-Type: application/json" \
  -d '{"slug":"smoke","plan":"pro"}' \
  -c /tmp/smoke-cookies.txt
```

- [ ] Returns `{ "ok": true, "slug": "smoke" }`
- [ ] Cookie `clear_tenant=...` saved to `/tmp/smoke-cookies.txt`

(Only works when `NODE_ENV=test` or `CLEAR_ALLOW_SEED=1`. Flip one for smoke then unset.)

### 2.3 — Deploy hello-world

In the Studio UI (http://localhost:3456):
- [ ] Paste this into the editor:
  ```clear
  build for javascript backend

  when user requests data from /api/hello:
    send back 'hi from cloudflare'
  ```
- [ ] Compile — no errors
- [ ] Click **Deploy** → pick slug `smoke-hello` → submit
- [ ] Modal shows "deploying…" then "live"
- [ ] URL returned: `https://smoke-hello.buildclear.dev`

**If the modal spins forever:** open DevTools → Network → find the `/api/deploy` request. Look at the response. Most likely causes: CF token expired, quota hit, compile error on the source, or `CLEAR_DEPLOY_TARGET` not set.

### 2.4 — Curl the live URL

```bash
curl https://smoke-hello.buildclear.dev/api/hello
```

- [ ] Returns 200
- [ ] Body is `{"message":"hi from cloudflare"}` or similar
- [ ] CF dashboard → Workers & Pages → Platforms → `clear-apps` → shows 1 script named `smoke-hello`

### 2.5 — Deploy a CRUD app (tests D1)

- [ ] Paste `apps/todo-fullstack/main.clear` into Studio
- [ ] Compile clean
- [ ] Deploy as `smoke-todo`
- [ ] URL returned: `https://smoke-todo.buildclear.dev`
- [ ] Open the URL in a browser — UI renders
- [ ] Create a todo via the UI → it appears in the list
- [ ] Delete a todo → it disappears
- [ ] CF dashboard → D1 → shows a database named `smoke-smoke-todo` (tenant-prefixed per Phase 7 cycle 7.2)
- [ ] D1 console query: `SELECT * FROM todos` shows the row you just created

### 2.6 — Deploy an agent app (tests `ask claude` via Workers fetch)

- [ ] Paste `apps/helpdesk-agent/main.clear`
- [ ] Compile clean
- [ ] Deploy as `smoke-helpdesk`
- [ ] URL returned
- [ ] Open URL → ask the agent a question
- [ ] Response appears (goes via `_askAI_workers` → Anthropic API — if `ANTHROPIC_PROXY_URL` set in secrets, routes through the proxy; else direct)

**If response errors:** check the Worker's logs in CF dashboard. Likely: `ANTHROPIC_API_KEY` secret wasn't set for the Worker (Studio should've auto-set it during deploy — if not, manually set via CF dashboard Workers → script → Settings → Variables).

### 2.7 — Deploy a workflow app (tests `runs durably` → Cloudflare Workflows)

Pick any template with `runs durably` OR write a tiny one:

```clear
build for javascript backend

workflow 'Smoke' with state:
  runs durably
  state has:
    started_at, required
  step 'greet' with 'Hello Agent'
  step 'log' with 'Logger Agent'

agent 'Hello Agent': say 'hi'
agent 'Logger Agent': say 'done'

when user requests data from /api/kickoff:
  set id to run workflow 'Smoke' with { started_at: 'now' }
  send back { id: id }
```

- [ ] Compile clean
- [ ] Deploy as `smoke-workflow`
- [ ] `curl -X POST https://smoke-workflow.buildclear.dev/api/kickoff`
- [ ] Returns a workflow ID
- [ ] CF dashboard → Workflows → shows the workflow running
- [ ] After ~10-30s, the workflow shows "complete"

### 2.8 — Rollback

- [ ] Make a small change to the todo-fullstack source (e.g. change the page title)
- [ ] Deploy as `smoke-todo` again (same slug)
- [ ] Confirm URL shows the new version
- [ ] Hit the Studio's Rollback button / endpoint → `POST /api/rollback`
- [ ] Refresh the URL → old version is back

### 2.9 — Custom domain (optional, only if you have a test domain handy)

- [ ] POST `/api/custom-domain` with `{ "appSlug": "smoke-hello", "hostname": "hello.example.com" }`
- [ ] Response: `{ "ok": true, "instructions": "... add a CNAME ..." }`
- [ ] Skip if you don't have a test domain — default `<slug>.buildclear.dev` URL is what matters

### 2.10 — Orphan check

```bash
node scripts/reconcile-wfp.js
```

- [ ] Runs without error
- [ ] Reports on orphans: scripts in CF but not in tenants-db, D1s in CF but not linked to any app
- [ ] After a clean smoke, report should show only `smoke-*` scripts (or whatever slugs you used) and matching D1s. Zero orphans.

---

## §3 — If anything broke

Each smoke step that fails maps to a specific area of code:

| Step | If it fails, look at |
|---|---|
| 2.3 (hello deploy) | `playground/wfp-api.js:uploadScript` (multipart form), `playground/deploy-cloudflare.js` (orchestration), CF namespace permissions |
| 2.5 (todo / D1) | `playground/wfp-api.js:provisionD1`, `playground/wfp-api.js:applyMigrations`, tenant-prefixed name collision |
| 2.6 (agent / fetch) | `_askAI_workers` emit in `compiler.js`, secrets set on deploy, CF Worker logs |
| 2.7 (workflow) | `src/workflows/<slug>.js` emit + `[[workflows]]` binding in wrangler.toml + `src/agents.js` shared module |
| 2.8 (rollback) | `playground/wfp-api.js:rollbackToVersion`, WFP versions API |
| 2.9 (domain) | `playground/wfp-api.js:attachDomain` |
| 2.10 (reconcile) | `scripts/reconcile-wfp.js` |

## §4 — When to flip the default

Once §2.3–§2.7 all pass:
- [ ] Change Studio's default: in `playground/deploy.js`, `CLEAR_DEPLOY_TARGET` default flips from `'fly'` → `'cloudflare'`
- [ ] Delete `cli/clear.js deployCommand` (Railway CLI path — v1-only, plan §Out of Scope)
- [ ] Archive but don't nuke `playground/deploy.js`'s Fly builder path (keep as a reference; delete in the next cleanup pass)

## §5 — Capture learnings

After the smoke completes, write a session note to `learnings.md` covering anything surprising:
- Any step that needed a fix
- Cloudflare API quirks we didn't anticipate
- Timing/cost observations (how long did each deploy take? what's the CF cost for a 30-minute smoke?)
- Differences between the plan's mocked behavior and real CF behavior

Russell's goal: Phase 8 runs cleanly the FIRST time it's attempted, not the third.
