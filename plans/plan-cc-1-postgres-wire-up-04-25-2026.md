# Plan — CC-1 finish: Wire `PostgresTenantStore` to a real Postgres

**Date:** 2026-04-25
**Branch suggestion:** `feature/cc-1-postgres-wire-up`
**Scope:** Replace the 17 `NOT_IMPLEMENTED` throws on `PostgresTenantStore` (shipped 2026-04-25 morning, commit `0f7b510`) with real `pg.Pool`-backed SQL. Schema migrations, connection pooling, transactions, isolation between tenants. Pass the same `tenants.test.js` battery the in-memory store passes — same surface, same return shapes, same error codes.
**Effort:** 9 cycles of ~30-60 min each (~6-8 hours total once Phase 85a Postgres URL is in hand).
**Reads through:** `playground/tenants.js`, `playground/tenants.test.js`, `playground/server.js` (lines 95-105), `playground/cloud-routing/index.js`, `playground/billing.js`, `playground/deploy-cloudflare.js` (`recordVersion`/`updateSecretKeys`/`markAppDeployed` call sites), `plans/plan-lae-phase-c-04-25-2026.md` (cycle 3 — extends `appendAuditEntry` schema and adds `markAuditEntry`).

> Sequencing note: this plan ships **after the first paying customer** per ROADMAP item #6. `InMemoryTenantStore` is fine for the first 1-3 demos — durability matters when real money lands. Russell's external Phase 85a paperwork (provision the Postgres instance) is the only hard prereq; once a `DATABASE_URL` is available, this plan executes top-to-bottom in one focused day.

---

## What we found in the audit

1. **Stub surface is exhaustive.** `PostgresTenantStore` (commit `0f7b510`) declares all 17 public methods that exist on `InMemoryTenantStore`: `create`, `upsert`, `get`, `getByStripeCustomer`, `incrementAppsDeployed`, `setPlan`, `recordApp`, `appNameFor`, `markAppDeployed`, `getAppRecord`, `recordVersion`, `updateSecretKeys`, `lookupAppBySubdomain`, `loadKnownApps`, `seenStripeEvent`, `recordStripeEvent`, `getAuditLog`, `appendAuditEntry`. Every one throws `{code: 'NOT_IMPLEMENTED', message: includes the future SQL}`. Counting: 18 methods total once you include `appendAuditEntry`/`getAuditLog`. The contract test (`tenants.test.js:364-381`) iterates `Object.getOwnPropertyNames(InMemoryTenantStore.prototype)` and asserts symmetry — anything we add to the in-memory store going forward must land here too.

2. **Constructor already accepts a `pool`.** `new PostgresTenantStore({ pool })` — Russell's stub has the right wiring shape. We pass a `pg.Pool` (or compatible test double) and store it on `this._pool`.

3. **The in-memory store has subtle behaviors we must replicate.**
   - `getAppRecord` returns versions sorted **newest-first** (descending `uploadedAt`) — but the underlying storage stays insertion-order (`recordVersion` appends, then sorts only when over-cap). Postgres can store in insertion order and `ORDER BY uploaded_at DESC` on read; same observable behavior.
   - `recordVersion` enforces `MAX_VERSIONS_PER_APP = 20` by sorting ascending and dropping the oldest after each append. Postgres equivalent: append, then `DELETE WHERE id NOT IN (SELECT id FROM app_versions WHERE ... ORDER BY uploaded_at DESC LIMIT 20)` — or partition the cap into the SQL itself with a window function.
   - `updateSecretKeys` is a **deduping append** — existing keys keep their position, new keys append. Trivial in JS (`Set` + array). In Postgres: store as `text[]`, use `array_cat` + a deduping CTE, or store as a separate `app_secret_keys` table with `UNIQUE (tenant_slug, app_slug, key_name)`. Recommend the latter — easier to audit who set what when.
   - `lookupAppBySubdomain` does a case-insensitive scan over the leading hostname label. SQL: `WHERE lower(split_part(hostname, '.', 1)) = lower($1)`. Index on `lower(split_part(hostname, '.', 1))` (functional index) — O(log N) lookup, which matters once tenants exceed a few hundred.
   - `appendAuditEntry` returns `{ok:false, code:'APP_NOT_FOUND'}` for unknown apps (mirroring `recordVersion`). Postgres: `INSERT … FROM apps WHERE …` and check `rowcount` — return `APP_NOT_FOUND` if zero.
   - `getAuditLog` returns shallow copies — so callers can mutate without leaking back to storage. SQL rows are inherently disconnected; this is automatic.

4. **Phase C extends the audit row schema** (read `plans/plan-lae-phase-c-04-25-2026.md` cycle 3 carefully):
   - Adds fields: `auditId`, `kind`, `before`, `after`, `reason`, `ip`, `userAgent`, `status` (`'pending' | 'shipped' | 'ship-failed'`), `versionId`, `error`.
   - Adds method: `markAuditEntry({ auditId, status, versionId?, error? })` — in-place update.
   - Adds cap: `MAX_AUDIT_PER_APP = 200` trim on append (NOT on mark — never lose a pending row mid-flight).
   - Returns `{ok:true, auditId}` from `appendAuditEntry` (vs. the bare `{ok:true}` it returns today).
   - Default `status: 'shipped'` for non-destructive callers; destructive callers pass `'pending'` explicitly.
   The Postgres schema must support these columns from day one even if the in-memory store hasn't been extended yet at the moment CC-1 runs — we don't want a Phase C migration on top of a fresh-out-of-the-gate DB. **The schema this plan builds is the Phase-C-ready shape.** If Phase C ships first, even better; if not, columns sit empty until then.

5. **Ship-path callers already accept a swappable store.** `playground/deploy-cloudflare.js` takes `store` as a dependency, calls `store.markAppDeployed`, `store.recordVersion`, `store.updateSecretKeys`. `playground/cloud-routing/index.js` takes `store` and calls `store.lookupAppBySubdomain`. `playground/billing.js`'s `handleWebhookEvent(event, store, opts)` takes `store` and calls `store.getByStripeCustomer`, `store.create`, `store.recordStripeEvent`, etc. **Every call site is already store-agnostic.** The cutover is a single line in `playground/server.js`:
   ```js
   const _cloudTenantStore = new InMemoryTenantStore();           // before
   const _cloudTenantStore = await makeTenantStore(process.env);  // after
   ```
   Where `makeTenantStore` returns `InMemoryTenantStore` when `DATABASE_URL` is unset, `PostgresTenantStore` when set. **Zero call-site churn.**

6. **`pg` is the first runtime npm dep in the cloud-tenants layer.** `package.json` today: `bcryptjs`, `better-sqlite3` (already a real dep — better-sqlite3 is a native module), `express`. `better-sqlite3` already broke the zero-dep ethos for the runtime layer; `pg` follows the same precedent and is even more battle-tested than better-sqlite3. **Recommend: `pg` over `postgres.js`.** `pg` has 20× the npm downloads, mature `pg-pool`, well-documented edge cases, and more StackOverflow surface for late-night debugging. `postgres.js` is smaller and faster but its `Sql\`...\`` template-tag style would force every SQL site in this plan to be re-invented. We'd lose the parameterized-query syntax the stubs already document (`$1, $2, $3`).

7. **No migration tooling exists.** No `migrations/`, no `node-pg-migrate`, no Knex. Recommend: hand-rolled numbered SQL files under `db/migrations/` (`0001_init.sql`, `0002_phase_c_audit.sql`, …). The runner is ~30 lines of code that reads `schema_migrations` table to find the highest applied version, then applies any newer files in numeric order inside a transaction. Zero new dep.

8. **Tests need a real Postgres or a local pg-mem-style fake.** `pg-mem` is an in-process Postgres simulator (no Docker). It speaks the `pg` wire protocol well enough to handle the ~80% of SQL features this plan uses (CRUD, transactions, indexes, `jsonb`, `text[]`, `WHERE … RETURNING *`, `ON CONFLICT`). It does NOT support: window functions in some edge cases, `split_part` (we'll see). Recommend: **use `pg-mem` as a dev-mode test default** with an env-var escape hatch (`POSTGRES_URL=postgresql://localhost/clear_test` to point at a real Postgres for integration runs). Cycle 1 below tests the contract test against a real Postgres connection on Russell's box once Phase 85a lands.

9. **No existing connection pool config.** Recommend pool defaults: `max: 10`, `idleTimeoutMillis: 30_000`, `connectionTimeoutMillis: 5_000`, `statement_timeout: 10_000` (per-statement guard), `application_name: 'clear-cloud-tenants'` (so `pg_stat_activity` is greppable). For first paying customer scale, 10 connections is wildly more than enough; tune later from real metrics.

---

## Schema spec

All tables live in the `clear_cloud` schema. All ID columns use `bigint generated always as identity` — never expose to clients, internal-only.

### `clear_cloud.tenants`
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `slug` | `text` | UNIQUE, NOT NULL — the `clear-<6hex>` slug; never customer-chosen |
| `stripe_customer_id` | `text` | UNIQUE (nullable until paid) |
| `plan` | `text` | NOT NULL DEFAULT `'pro'` |
| `apps_deployed` | `int` | NOT NULL DEFAULT 0 |
| `ai_spent_cents` | `int` | NOT NULL DEFAULT 0 |
| `ai_credit_cents` | `int` | NOT NULL DEFAULT 0 |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |
| `grace_expires_at` | `timestamptz` | nullable |

Indexes: `UNIQUE(slug)`, `UNIQUE(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL` (partial — null repeats allowed during signup).

### `clear_cloud.apps`
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `tenant_slug` | `text` | NOT NULL, FK → `tenants(slug)` ON DELETE RESTRICT |
| `app_slug` | `text` | NOT NULL |
| `app_name` | `text` | NOT NULL — the script name on CF |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

Indexes: `UNIQUE(tenant_slug, app_slug)`. The `recordApp` upsert keys on this composite.

### `clear_cloud.cf_deploys`
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `tenant_slug` | `text` | NOT NULL |
| `app_slug` | `text` | NOT NULL |
| `script_name` | `text` | NOT NULL — CF script name |
| `d1_database_id` | `text` | nullable |
| `hostname` | `text` | nullable |
| `deployed_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

Indexes: `UNIQUE(tenant_slug, app_slug)`, `INDEX cf_deploys_subdomain_idx ON cf_deploys (lower(split_part(hostname, '.', 1)))` — backs `lookupAppBySubdomain`.

### `clear_cloud.app_versions`
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `tenant_slug` | `text` | NOT NULL |
| `app_slug` | `text` | NOT NULL |
| `version_id` | `text` | nullable (CF can return null on first listVersions) |
| `uploaded_at` | `timestamptz` | NOT NULL |
| `source_hash` | `text` | nullable |
| `migrations_hash` | `text` | nullable |
| `note` | `text` | nullable |
| `via` | `text` | nullable — `'widget'`, `'widget-destructive'`, `'cli'`, etc. |

Indexes: `INDEX app_versions_lookup_idx ON app_versions (tenant_slug, app_slug, uploaded_at DESC)` — backs the `getAppRecord` newest-first read. FK `(tenant_slug, app_slug)` → `cf_deploys` ON DELETE CASCADE so deleting an app cleans its versions.

### `clear_cloud.app_secret_keys`
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity |
| `tenant_slug` | `text` | NOT NULL |
| `app_slug` | `text` | NOT NULL |
| `key_name` | `text` | NOT NULL — **NAME ONLY, never value** |
| `set_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

Indexes: `UNIQUE(tenant_slug, app_slug, key_name)` — gives us `ON CONFLICT DO NOTHING` for the dedupe semantics. **Audit lens:** by storing as a separate row we get a free "when was this secret key first set" trail — the in-memory store throws that information away. Future operational debugging will thank us.

### `clear_cloud.app_audit_log`
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK, identity — also serves as `auditId` returned to callers |
| `tenant_slug` | `text` | NOT NULL |
| `app_slug` | `text` | NOT NULL |
| `ts` | `timestamptz` | NOT NULL DEFAULT `now()` |
| `actor` | `text` | NOT NULL DEFAULT `'unknown'` |
| `action` | `text` | NOT NULL DEFAULT `'unknown'` |
| `verdict` | `text` | nullable |
| `source_hash_before` | `text` | nullable |
| `source_hash_after` | `text` | nullable |
| `note` | `text` | nullable |
| `kind` | `text` | nullable — Phase C: `'remove_field'`, `'drop_endpoint'`, `'change_type'`, etc. |
| `before` | `text` | nullable — Phase C: tiny diff hunk (NOT full source) |
| `after` | `text` | nullable — Phase C: tiny diff hunk |
| `reason` | `text` | nullable — Phase C: human-typed reason for destructive ship |
| `ip` | `inet` | nullable — Phase C |
| `user_agent` | `text` | nullable — Phase C |
| `status` | `text` | NOT NULL DEFAULT `'shipped'` — `'pending' | 'shipped' | 'ship-failed'` |
| `version_id` | `text` | nullable — Phase C: filled by `markAuditEntry` after ship |
| `error` | `text` | nullable — Phase C: filled by `markAuditEntry` on `ship-failed` |

Indexes: `INDEX app_audit_log_lookup_idx ON app_audit_log (tenant_slug, app_slug, ts DESC)` — backs `getAuditLog` newest-first. NO FK on `(tenant_slug, app_slug)` — the audit log must outlive the app it describes (legal compliance: even after deleting an app, the audit row remains).

### `clear_cloud.stripe_events`
| Column | Type | Notes |
|---|---|---|
| `event_id` | `text` | PRIMARY KEY |
| `received_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

Single-column primary key serves the dedupe. `recordStripeEvent` is `INSERT … ON CONFLICT (event_id) DO NOTHING` — idempotent webhook replay.

### `clear_cloud.schema_migrations`
| Column | Type | Notes |
|---|---|---|
| `version` | `int` | PRIMARY KEY |
| `name` | `text` | NOT NULL |
| `applied_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

Drives the cycle 1 migration runner.

---

## Connection management

**Pool config (recommended starting point):**

```js
new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'clear-cloud-tenants',
  statement_timeout: 10_000,
  query_timeout: 12_000,
})
```

**Lifecycle:** the pool is created once at process start, before `mountCloudRouting`. It exposes `await store.close()` for clean shutdown (Studio's signal handlers should call it). Each request that hits a `Postgres*` method borrows a client via `await pool.connect()` and releases it in `finally`. Long-lived clients are NEVER held across awaits to non-pg work.

**Transactions:** any method that does more than one statement runs inside a transaction:
- `markAppDeployed` — INSERTs into `cf_deploys` AND seeds an initial row into `app_versions` AND seeds rows into `app_secret_keys`. One transaction. Either all three happen or none does.
- `recordVersion` — INSERTs into `app_versions` AND deletes oldest if over `MAX_VERSIONS_PER_APP`. One transaction.
- `updateSecretKeys` — multiple `INSERT … ON CONFLICT DO NOTHING` rows. One transaction.

**Retry:** transient errors — `40001 serialization_failure`, `40P01 deadlock_detected`, network blips — get one automatic retry with 50ms backoff. Anything else propagates. Permanent errors (constraint violations, type mismatches) never retry. Implementation lives in a small `withRetry(fn)` helper inside the store, NOT a generic dep.

**Isolation between tenants:** every method that reads or writes per-tenant data takes `tenant_slug` as the first or second positional arg in the WHERE clause. There is no cross-tenant query in the surface — `loadKnownApps` is the only method that scans across tenants (it's the reconcile job, by design). We do NOT add row-level security in this plan — that's a Phase 86 hardening pass. For now: every SQL site has `WHERE tenant_slug = $1` and a code-review-time grep for `WHERE tenant_slug` keeps it honest.

---

## Migration strategy: cutover from in-memory to Postgres

**Recommendation: dual-write, read-once, then atomic flip.** Here's why.

**Option A — fresh start (Postgres-only).** Deploy the new code with `DATABASE_URL` set; old in-memory state is gone. For our first paying customer's first few apps, this is fine — there's almost nothing to migrate. **But:** if the customer has already deployed 2-3 apps before CC-1 ships, those apps' `cfDeploys` rows are in process memory. Restart with Postgres → those apps still serve traffic from Cloudflare (CF is the source of truth there) but Studio's `lookupAppBySubdomain` returns null because the Postgres `cf_deploys` table is empty. **Subdomain routing breaks for existing apps until manual re-`markAppDeployed` happens.** Bad for first-customer trust.

**Option B — dual-write, single-read.** Keep the in-memory store alive in parallel. Every write goes to BOTH. Reads come from Postgres (or, while Postgres is empty, fall through to in-memory). Once Postgres is fully populated (a one-shot `seed-from-memory.js` script run by Russell that copies the live in-memory state into Postgres via the public store API), flip a single env var (`TENANT_STORE_PRIMARY=postgres`) and the in-memory side becomes write-only mirror. After 24 hours of mirror-only with no discrepancy, drop the in-memory store entirely. **Recommend this option.**

**Option C — atomic flip.** Snapshot in-memory to Postgres in a single deploy, swap stores, no dual-write. Simpler than B, but if the snapshot script has a bug, the customer's apps go cold. **Reject** for first-customer phase; revisit for later cutovers.

**The plan below assumes Option B.** Cycle 9 is the cutover — after cycles 1-8 have built every method, cycle 9 introduces a `DualWriteTenantStore` wrapper that takes both stores and writes to both, reads from Postgres-then-falls-back-to-in-memory. Russell flips the env var when comfortable.

---

## TDD cycles

Every cycle's red test exercises one method against a `pg-mem` instance (default) or a real Postgres URL (when `POSTGRES_TEST_URL` is set). Pattern in each test file:

```js
import { newDb } from 'pg-mem';
const db = newDb();
const { Pool } = db.adapters.createPg();
const pool = new Pool();
await runMigrations(pool);
const store = new PostgresTenantStore({ pool });
```

Every cycle MUST also pass the existing in-memory contract test — adding methods is fine, removing or renaming is not.

### Cycle 1 — Migration runner + `0001_init.sql`

**Red test (`playground/db/migrations.test.js`, new):**
```
runMigrations(pool) on a fresh DB:
  - creates schema_migrations table
  - applies 0001_init.sql (creates tenants, apps, cf_deploys, app_versions,
    app_secret_keys, app_audit_log, stripe_events with indexes from spec above)
  - inserts {version:1, name:'init'} into schema_migrations
  - second call is a no-op (returns {applied:[]})

runMigrations(pool) on a partially-migrated DB:
  - applies only versions strictly greater than max(schema_migrations.version)

runMigrations(pool) when 0001_init.sql throws midway:
  - no rows in schema_migrations (transaction rolled back)
```

**Green:** create `playground/db/migrations.js` exporting `runMigrations(pool, dir = './migrations')`. Reads the directory, sorts files numerically by leading 4-digit prefix, queries `SELECT max(version) FROM schema_migrations` (or `0` if table doesn't exist yet), applies each newer file inside `BEGIN/COMMIT`, inserts the version row in the same transaction. Create `playground/db/migrations/0001_init.sql` with all 7 tables + indexes from the spec above. Bootstrap: the `schema_migrations` table itself is created by an idempotent `CREATE TABLE IF NOT EXISTS` block at the top of `migrations.js`.

**Files touched:** `playground/db/migrations.js` (new), `playground/db/migrations.test.js` (new), `playground/db/migrations/0001_init.sql` (new).
**Depends on:** nothing.

### Cycle 2 — Tenant CRUD: `create`, `upsert`, `get`, `getByStripeCustomer`

**Red test (`playground/tenants-postgres.test.js`, new):**
```
create({slug, stripeCustomerId:'cus_x', plan:'pro'}) returns a row matching the
  in-memory shape: {slug, stripe_customer_id, plan, apps_deployed:0, ai_spent_cents:0,
  ai_credit_cents:<from planFor>, created_at:<iso>, grace_expires_at:null}.
get(slug) returns the same row; get('nonexistent') returns null.
getByStripeCustomer('cus_x') returns the row; getByStripeCustomer('cus_missing') null.
upsert(slug, {plan:'enterprise'}) updates the existing row; upsert on unknown slug
  creates a new row (mirrors in-memory shallow-merge semantics).
upsert handles concurrent calls without losing fields (transactional UPDATE … WHERE slug).
```

**Green:** implement the four methods in `playground/tenants.js` `PostgresTenantStore`. SQL templates already documented in the stubs are the starting point — the only delta is the `RETURNING *` row maps to the in-memory shape (snake_case end-to-end, skip the camelize step).

**Files touched:** `playground/tenants.js` (`PostgresTenantStore`), `playground/tenants-postgres.test.js` (new).
**Depends on:** Cycle 1.

### Cycle 3 — Tenant mutations: `incrementAppsDeployed`, `setPlan`, `seenStripeEvent`, `recordStripeEvent`

**Red test:** all four small SQL methods. `incrementAppsDeployed` is `UPDATE tenants SET apps_deployed = apps_deployed + 1 WHERE slug = $1 RETURNING *` — atomic, no read-modify-write race. `setPlan` is `UPDATE tenants SET plan = $2, grace_expires_at = $3 WHERE slug = $1 RETURNING *`. `seenStripeEvent` is `SELECT 1 FROM stripe_events WHERE event_id = $1`. `recordStripeEvent` is `INSERT INTO stripe_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING`.

**Files touched:** `playground/tenants.js`, `playground/tenants-postgres.test.js`.
**Depends on:** Cycle 2.

### Cycle 4 — App registration: `recordApp`, `appNameFor`, `markAppDeployed` (without versions+secrets)

**Red test:**
```
recordApp(slug, 'todo', 'clear-abc-todo') returns 'clear-abc-todo'; appNameFor
  returns the same. recordApp called twice with a different appName upserts.
markAppDeployed({tenantSlug, appSlug, scriptName, d1_database_id, hostname}) returns
  {ok:true}. Subsequent getAppRecord returns scriptName, d1_database_id, hostname,
  deployedAt as iso string, versions:[], secretKeys:[].
markAppDeployed dual-writes appsByTenant equivalent (i.e. appNameFor returns the
  scriptName for the tenant/app key).
markAppDeployed twice on the same (tenantSlug, appSlug) is an UPSERT.
```

**Green:** `recordApp` is `INSERT INTO apps … ON CONFLICT (tenant_slug, app_slug) DO UPDATE SET app_name = $3 RETURNING app_name`. `appNameFor` is a simple SELECT. `markAppDeployed` runs a transaction: UPSERT into `cf_deploys`, then UPSERT into `apps` (mirroring the dual-write at line 108).

**Files touched:** `playground/tenants.js`, `playground/tenants-postgres.test.js`.
**Depends on:** Cycle 1.

### Cycle 5 — Versions: seed in `markAppDeployed`, `recordVersion`, `getAppRecord` newest-first, cap at 20

**Green:** `recordVersion` runs a transaction: (a) INSERT into `app_versions`; (b) `DELETE FROM app_versions WHERE id IN (SELECT id FROM app_versions WHERE tenant_slug = $1 AND app_slug = $2 ORDER BY uploaded_at ASC OFFSET 20)`. The `markAppDeployed` transaction extends to also seed `app_versions` when `versionId` is non-null. `getAppRecord` becomes:

```sql
SELECT cd.*, 
  COALESCE(json_agg(av ORDER BY av.uploaded_at DESC) FILTER (WHERE av.id IS NOT NULL), '[]') AS versions,
  COALESCE(array_agg(ask.key_name ORDER BY ask.set_at) FILTER (WHERE ask.id IS NOT NULL), '{}') AS secret_keys
FROM cf_deploys cd
LEFT JOIN app_versions av ON av.tenant_slug = cd.tenant_slug AND av.app_slug = cd.app_slug
LEFT JOIN app_secret_keys ask ON ask.tenant_slug = cd.tenant_slug AND ask.app_slug = cd.app_slug
WHERE cd.tenant_slug = $1 AND cd.app_slug = $2
GROUP BY cd.id;
```

Map columns: `versions` is already an array, `secret_keys` becomes `secretKeys`, `deployed_at` becomes `deployedAt` (iso string). On unknown app: `null`.

**Files touched:** `playground/tenants.js`, `playground/tenants-postgres.test.js`.
**Depends on:** Cycle 4.

### Cycle 6 — Secret keys: seed in `markAppDeployed`, `updateSecretKeys` dedupe-append

**Green:** `updateSecretKeys` first verifies the app exists; returns `APP_NOT_FOUND` if not. Otherwise transaction-wraps a series of `INSERT INTO app_secret_keys … ON CONFLICT (tenant_slug, app_slug, key_name) DO NOTHING` — one per new key.

**Files touched:** `playground/tenants.js`, `playground/tenants-postgres.test.js`.
**Depends on:** Cycle 5.

### Cycle 7 — Subdomain routing + reconcile: `lookupAppBySubdomain`, `loadKnownApps`

**Green:** `lookupAppBySubdomain` is the cycle 5 mega-query plus `WHERE lower(split_part(hostname, '.', 1)) = lower($1)`. The `cf_deploys_subdomain_idx` (functional index on the same expression) makes this O(log N). `loadKnownApps` is `SELECT script_name, d1_database_id FROM cf_deploys` — collect non-null values into JS `Set`s.

**Files touched:** `playground/tenants.js`, `playground/tenants-postgres.test.js`.
**Depends on:** Cycle 5.

### Cycle 8 — Audit log: `getAuditLog`, `appendAuditEntry` (with Phase C schema), `markAuditEntry`

**Green:** `appendAuditEntry`:
```sql
INSERT INTO app_audit_log (tenant_slug, app_slug, actor, action, verdict,
  source_hash_before, source_hash_after, note, kind, before, after, reason,
  ip, user_agent, status, version_id)
SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       COALESCE($15, 'shipped'), $16
WHERE EXISTS (SELECT 1 FROM cf_deploys WHERE tenant_slug = $1 AND app_slug = $2)
RETURNING id;
```
If `RETURNING id` is empty → `APP_NOT_FOUND`. Then trim if over `MAX_AUDIT_PER_APP=200`. Both inside one transaction. Return `{ok:true, auditId: row.id.toString()}`.

`markAuditEntry`:
```sql
UPDATE app_audit_log
SET status = COALESCE($2, status),
    version_id = COALESCE($3, version_id),
    error = COALESCE($4, error)
WHERE id = $1
RETURNING id;
```

**Phase C alignment note:** if Phase C cycle 3 has shipped before this cycle, the in-memory store will already return `{ok:true, auditId}`. If not, the in-memory store still returns the bare `{ok:true}` and the contract test will diverge. Solve by **also extending the in-memory store in this cycle** (or piggyback on Phase C cycle 3's work).

**Files touched:** `playground/tenants.js`, `playground/tenants-postgres.test.js`.
**Depends on:** Cycle 1, Cycle 5.

### Cycle 9 — Cutover: `makeTenantStore` factory + dual-write wrapper + `playground/server.js` flip

**Green:** create `playground/tenant-store-factory.js` with `makeTenantStore(env, deps)` returning the right store based on `DATABASE_URL` and `TENANT_STORE_PRIMARY`. Create `DualWriteTenantStore` class — same surface, holds `{primary, mirror}`. Every method runs primary, captures result, runs mirror (try/catch + log on failure), returns primary's result. Reads try primary first, fall back to mirror on null/empty.

Update `playground/server.js` to await `makeTenantStore(process.env)`.

Document the cutover sequence:
1. Deploy with `DATABASE_URL` set, `TENANT_STORE_PRIMARY=in-memory`. In-memory remains primary, Postgres is silent. Watch logs for any Postgres errors.
2. Run a one-shot `node playground/seed-from-memory.js` script (~50 lines, written when needed).
3. Flip `TENANT_STORE_PRIMARY=dual-write` and redeploy.
4. After confidence: flip to `TENANT_STORE_PRIMARY=postgres`. In-memory becomes write-only mirror.
5. After 24h with no drift: drop the mirror entirely.

**Files touched:** `playground/tenant-store-factory.js` (new), `playground/tenants-cutover.test.js` (new), `playground/server.js` (single-line swap), `playground/tenants.js` (`DualWriteTenantStore` class).
**Depends on:** Cycles 1-8.

---

## Sequencing & gates

| Cycle | Depends on | Parallel-safe? |
|---|---|---|
| 1 — Migration runner + `0001_init.sql` | — | First |
| 2 — Tenant CRUD | 1 | After 1 |
| 3 — Tenant mutations + Stripe events | 2 | After 2 |
| 4 — App registration | 1 | Parallel with 2-3 |
| 5 — Versions + getAppRecord | 4 | After 4 |
| 6 — Secret keys | 5 | After 5 |
| 7 — Subdomain + reconcile | 5 | After 5 (parallel with 6) |
| 8 — Audit log | 1 + 5 | Parallel with 6-7 |
| 9 — Cutover wrapper + server.js flip | 1-8 | Last (integration) |

**Phase 9 gate:** all 4 of `playground/db/migrations.test.js`, `playground/tenants.test.js`, `playground/tenants-postgres.test.js`, `playground/tenants-cutover.test.js` green. Studio boots both with and without `DATABASE_URL` set. `mountCloudRouting` works against both store backends.

---

## Open decisions for Russell

1. **Hosted Postgres provider.** Recommend **Neon** for first paying customer:
   - Serverless, scale-to-zero — $0/mo when no traffic, ~$19/mo at low scale.
   - Connection-pool friendly (built-in PgBouncer endpoint).
   - Migration off Neon to RDS later is a `pg_dump | psql` away.
   - **Reject:** Supabase (more product surface than we need), AWS RDS (overkill, $50/mo minimum), self-hosted (paperwork tax — not worth it pre-revenue).

2. **Migration cutover strategy.** Recommend **Option B (dual-write).** See "Migration strategy" section above. Reject Option A (cold cutover risks first customer's app routing) and Option C (single-snapshot is brittle).

3. **Connection pool library.** Recommend **`pg.Pool`** (canonical, 20× the npm downloads of `postgres.js`, parameterized-query syntax matches the stub). Reject `postgres.js` (template-tag style would force rewriting every documented stub site).

4. **Schema migrations tooling.** Recommend **hand-rolled numbered SQL files** (`db/migrations/0001_init.sql`, etc.) with a ~30-line runner. Zero new deps.

5. **`pg` is the FIRST runtime npm dep in the cloud-tenants layer.** Confirm: is adding `pg` (with its 1 transitive dep, `pg-pool`) acceptable? Recommend yes — `better-sqlite3` already broke the zero-dep ethos.

6. **`pg-mem` for tests.** Same dep tradeoff as `playwright`. Recommend yes — keeps unit tests fast and Docker-free.

7. **Should `createEditApi` get its store from the same factory?** Confirm: **yes, all store consumers come from `makeTenantStore()`.** One pool, one source of truth.

---

## Risks

| Risk | Mitigation |
|---|---|
| `pg-mem` doesn't support `split_part` or `lower(expr)` functional indexes | Cycle 7 falls back to real Postgres via `POSTGRES_TEST_URL`. Production unaffected. |
| Connection pool exhausts under low concurrency | Code review checklist: every `pool.connect()` is in a `try/finally` that releases. `pg.Pool`'s default warning timeout catches leaks. |
| First Postgres outage takes Studio down | `mountCloudRouting` already returns `false` on init failure — Studio still boots in single-tenant mode. |
| `markAppDeployed` upsert clobbers an existing app's versions[] | The cycle 4-5 transaction does NOT touch `app_versions` on UPSERT — only inserts a seed when there is no existing row. Test this explicitly. |
| `appendAuditEntry` returning `{ok:true, auditId}` diverges from in-memory which returns bare `{ok:true}` today | Cycle 8 ships the schema change to BOTH stores in lock-step; or piggybacks on Phase C cycle 3 if it ships first. |
| Race: two webhook deliveries of the same Stripe event | `recordStripeEvent` is `INSERT … ON CONFLICT DO NOTHING` — at most one row. |
| Schema migration `0001_init.sql` runs against an already-populated Postgres | Add `IF NOT EXISTS` to every CREATE; failure mode degrades to "indexes maybe not created" — hand-craft a one-time `CREATE INDEX IF NOT EXISTS` block. |
| `loadKnownApps` returns Sets with millions of rows when the platform scales | Out of scope for this plan. The reconcile job runs once per hour and CF rate-limits. If size becomes a problem, switch to a streaming cursor. |
| `pg-mem`'s `json_agg` ordering inside `LEFT JOIN` GROUP BY differs from real Postgres | Cycle 5 explicitly tests order on real Postgres. If divergence found, switch to a subquery: `(SELECT json_agg(av ORDER BY uploaded_at DESC) FROM app_versions av WHERE …)`. |
| `auditId` returned as JS bigint is broken across JSON.stringify | Cycle 8 stringifies on return. Test asserts `typeof auditId === 'string'`. |

---

## Definition of done

Russell sets `DATABASE_URL` in his Studio's env (Phase 85a's Neon URL) and restarts. Studio boots, prints `[cloud] CC-1 multi-tenant routing active (CLEAR_CLOUD_MODE=1)` AND `[db] migrations applied: 1` (or `[db] migrations applied: 0` on a re-run). The first paying customer's tenant row, app rows, deploy rows, secret-key rows, audit-log rows all live in Postgres. Killing the Studio process and restarting it is no longer destructive — every customer artifact is intact. The `lookupAppBySubdomain` middleware finds the customer's app subdomain by querying Postgres (cycle 7's functional index keeps it sub-millisecond at low row counts). A `pg_dump` snapshot is a one-line backup. Russell can roll back to in-memory by unsetting `DATABASE_URL` and restarting — the Postgres instance is preserved untouched.

The contract test still passes — every method on `InMemoryTenantStore` is also on `PostgresTenantStore`. The 75 in-memory tests still pass. The new `tenants-postgres.test.js` adds ~50 tests covering every Postgres method, all green against `pg-mem` AND against a real Postgres URL. `node clear.test.js` regression count: unchanged.

When the first customer adds their second app, Russell sees a row appear in `cf_deploys` within a second of CF acking the deploy. When they ship a destructive change (Phase C, post-this-plan), the audit row is written `pending` BEFORE the ship runs and marked `shipped` after — exactly the audit-first ordering Phase C's cycle 4 demands. When their D1 column drop runs and fails, the `pending` row is marked `ship-failed` with the error message. The audit log is the receipt, durably stored, queryable for years.

---

## Critical files for implementation

- `playground/tenants.js` (where `PostgresTenantStore` lives)
- `playground/tenants.test.js` (the contract test)
- `playground/db/migrations.js` (new — cycle 1's runner) and `playground/db/migrations/0001_init.sql` (new — the schema)
- `playground/tenant-store-factory.js` (new — cycle 9's `makeTenantStore` and `DualWriteTenantStore`)
- `playground/server.js` (single-line cutover)
