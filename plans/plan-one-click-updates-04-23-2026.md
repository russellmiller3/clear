# Plan — One-Click Updates for Deployed Cloudflare Apps (2026-04-23)

## ⚡ Status refresh — 2026-04-25 (after CC-1 + CC-4 + LAE Phase B/C)

**Roughly half of this plan is already shipped.** Other epics absorbed pieces:

| Phase | Status | Where it landed |
|---|---|---|
| Phase 1 — tenants-db schema (versions[], getAppRecord, recordVersion, updateSecretKeys, secretKeys, MAX_VERSIONS_PER_APP cap) | ✅ DONE | LAE Phase B work + CC-1 cycle 5 (Postgres). All 6 cycles green in `playground/tenants.js` + `playground/tenants-postgres.js`. |
| Phase 2 — deploy-cloudflare.js incremental update mode (mode switch, _deployUpdate, _captureVersionId, partial secrets) | ✅ DONE | LAE Phase B. All 6 cycles in `playground/deploy-cloudflare.js`. |
| Phase 3 — migration safety gate (migrationsDiffer, migration-confirm-required response) | ❌ NOT DONE | 4 cycles ahead. Touches `deploy-cloudflare.js`. |
| Phase 4 — `/api/deploy` handler branching + new endpoints (isRedeploy detection, /api/app-info, /api/deploy-history CF path, confirmMigration propagation) | ❌ NOT DONE | 5 cycles ahead. Touches `playground/deploy.js`. |
| Phase 5 — Studio modal "Update" vs "Deploy" UX (fetchAppInfo, no-changes state, diff preview, migration warning, post-update version badge) | ❌ NOT DONE | 5 cycles ahead. Touches `playground/ide.html`. |
| Phase 6 — version history + one-click rollback UX | ❌ NOT DONE | 4 cycles ahead. Touches `playground/ide.html`. |
| Phase 7 — docs across the 11 surfaces | ❌ NOT DONE | 1 doc cycle. |

**Remaining: ~18 cycles total.** Work left is roughly 2/3 backend (Phases 3+4)
and 1/3 Studio UX (Phases 5+6). Today's execution order: Phase 3 + Phase 4 in
parallel as background agents (different files), then Phases 5+6 in
conversation once the new endpoints exist for the modal to call.

## 🎯 Problem statement

Today, the only way for Marcus to "update" a deployed app is to re-run the full deploy — which means provisioning a new D1 database, applying migrations, attaching a domain, setting secrets, and writing a brand-new tenant record. That's 10-20s of work for a 3-character typo fix.

Lovable updates deployed apps in seconds by uploading only the new bundle and leaving every other resource untouched. Clear's architecture can match that — we just haven't wired it yet. The primitives are in place (`uploadScript` is upsert, `listVersions`/`rollbackToVersion` exist, Cloudflare Workers are versioned natively) — what's missing is:

1. The dispatcher that says "this tenant already has this app — take the incremental path."
2. A tenants-db schema that stores version history per app.
3. A Studio Deploy-modal that shows "Update" (not "Deploy") when a prior deployment exists.
4. A rollback UX that uses the existing `rollbackToVersion` primitive.
5. A migration-safety gate that warns if the new source's schema diff needs a D1 migration (you can't safely auto-migrate during a live update — D1 has no atomic schema swap).

## 🔧 The fix

```
  Before (today):                      After (this plan):

  Marcus edits code                    Marcus edits code
       │                                    │
       ▼                                    ▼
  Clicks Deploy                        Clicks Deploy
       │                                    │
       ▼                                    ▼
  /api/deploy                          /api/deploy
       │                                    │
       ▼                                    ▼ detects "already deployed"
  provisionD1 ────────┐                branch: isRedeploy ?
  applyMigrations     │                   │                │
  uploadScript        │                   ▼                ▼
  setSecrets          │   = ~12s     full path      incremental path
  attachDomain        │               (same as      — uploadScript only
  markAppDeployed ────┘               today)        — append version to tenants-db
                                                    — no D1, no domain, no secrets
                                                                    = ~2s
```

**Why this works:**
- Cloudflare's Worker upload API (`/scripts/<name>`) is upsert — POST a new bundle to an existing name and you just get a new version, not a conflict. `uploadScript` in `wfp-api.js` already does this.
- Every Cloudflare script gets automatic `versionId` — we just need to capture + store it in tenants-db to enable rollback.
- D1 database binding is a SCRIPT-level metadata, not a per-version thing. Re-uploading the script with the same binding set keeps the same DB alive.
- Domain attachment is permanent until explicitly detached. Re-uploading the script doesn't touch domain routing.
- Secrets are set via a separate API. If the new source needs a secret that wasn't in the previous deploy, we re-run `setSecrets` — otherwise skip.

## 🎭 The migration-safety gate (why it needs a prompt, not silent auto-apply)

D1 is SQLite. SQLite has no atomic schema migration. If we auto-apply the new schema mid-update, there's a window where the schema has changed but the new code isn't serving yet — any in-flight request hits the old code against the new schema and errors.

Worse: if the migration is destructive (drops a column, renames a table), and the update fails downstream, the old code can't go back to reading the old schema because the column is gone.

**Decision:** Any update whose compiled `migrations/` folder differs from the last-deployed version requires explicit user confirmation ("Yes, apply the schema change — I understand this may break in-flight requests for ~2 seconds"). For now, we don't auto-rollback schema changes; if the user wants to back out, they manually re-apply the old migration SQL. We surface this as a future followup.

**Scope for this plan:** detect schema change, warn the user, block the Update button until they confirm. Auto-apply is out of scope.

## 📦 Where this fits

- **Parent plan:** `plans/plan-clear-cloud-wfp-04-23-2026.md` (Phases 1-8). This is the sibling follow-up — the deploy pipeline exists and is green; updates are the next natural extension.
- **NOT entangled with:** Tonight's A/B + transcript research work (tracked in `RESEARCH.md` Session 44). Different code paths, different test files, different goals.
- **Depends on:** Phase 8 HITL prereqs landing (Russell's ~2hr Cloudflare paperwork). This plan's code can be fully TDD'd against mocks; the live-smoke step waits for Phase 8.

## 📁 Phased reading strategy (for the executing agent)

### Always read first (every phase):
| File | Why |
|------|-----|
| `intent.md` | Authoritative spec — check before any new syntax/node |
| `CLAUDE.md` | Project rules (doc gate, TDD, branching) |
| `plans/plan-clear-cloud-wfp-04-23-2026.md` | Parent architecture (Phase 7 orchestration) |

### Phase 1 — tenants-db schema:
| `playground/tenants.js` | `markAppDeployed`, `loadKnownApps`, `InMemoryTenantStore` |
| `playground/tenants.test.js` | existing coverage pattern |

### Phase 2 — deploy dispatcher branching:
| `playground/deploy-cloudflare.js` | `deploySource`, `DeployLockManager`, `_rollback` |
| `playground/deploy-cloudflare.test.js` | mocking patterns for CF path |
| `playground/wfp-api.js` | `uploadScript`, `listVersions`, `rollbackToVersion` |

### Phase 3 — migration-safety gate:
| `lib/packaging-cloudflare.js` | `migrations/` bundle assembly |
| `compiler.js` (CRUD emit for CF target) | migration SQL generation |

### Phase 4 — /api/deploy handler branching:
| `playground/deploy.js` | `wireDeploy`, `/api/deploy`, `/api/rollback`, `/api/deploy-history` |
| `playground/deploy.test.js` | existing deploy handler tests |

### Phase 5 — Studio Deploy-modal UX:
| `playground/ide.html` | `doDeploy`, `deploy-modal`, Deploy button lines 596 + 3138 |

### Phase 6 — rollback + version history UX:
| `playground/ide.html` | Deploy modal expansion — rollback list |

### Phase 7 — docs:
| All 9 surfaces from `CLAUDE.md` §Documentation Rule |

---

## Section 0 — Before starting

- **Branch:** `feature/one-click-updates`
- **Logger tag:** `[update]` for any new console.log in the incremental path; `[rollback]` for rollback-specific
- **PROGRESS.md seed:** "Phase N of 7 — <name>. Tests: X/Y. Last commit: <hash>."

---

## Section 1 — What already exists (primitives to reuse)

**`playground/wfp-api.js` (SMALL WRAPPER EXTENSION NEEDED — see Phase 2):**
- `uploadScript({ scriptName, bundle, bindings, compatibilityDate })` — line 163. Cloudflare PUT is upsert; posting to an existing script name just creates a new version. **Current return shape: `{ ok, status, result }` — does NOT expose `versionId` directly.** Cloudflare's PUT response usually contains `result.id` or `result.etag` which maps to the version id, but this is version-family-dependent. Strategy: always call `listVersions` immediately after `uploadScript` to get the new version id. One extra round-trip, but guaranteed correct.
- `listVersions({ scriptName })` — line 309. Returns `{ ok, versions: [...] }` where each version is whatever CF returns (raw `body.result` shape — keys include `id`, `created_on`, `metadata`, but DO NOT assume; handle defensively).
- `rollbackToVersion({ scriptName, versionId })` — line 315. Uses `/deployments` endpoint with `{ strategy: 'percentage', versions: [{ version_id, percentage: 100 }] }`. Instant promotion.

**`playground/deploy-cloudflare.js` (NEEDS BRANCHING):**
- `deploySource({ source, tenantSlug, appSlug, secrets, ..., api, store })` — currently always provisions from scratch. Phase 2 adds an `isRedeploy` code path.
- `DeployLockManager` — already prevents double-click duplicates. Reuse unchanged.
- `_rollback` helper — currently only for initial-deploy failure recovery. Not used by the incremental path (rollback on incremental failure is just "ignore the new version; previous version stays live").

**`playground/deploy.js` (NEEDS EXTENSION):**
- `POST /api/deploy` at line 221 — currently single dispatch. Phase 4 adds the `isRedeploy` detection before dispatch.
- `POST /api/rollback` at line 351 — exists with CF script-versions API wiring per comment at line 358. Phase 6 extends the UI to use it.
- `GET /api/deploy-history/:app` at line 339 — currently Fly-only (`postToBuilder`). Phase 6 adds the CF path using `listVersions`.

**`playground/tenants.js` (NEEDS SCHEMA EXTENSION):**
- `markAppDeployed({ tenantSlug, appSlug, scriptName, d1_database_id, hostname })` — stores the app record but NOT version history. Phase 1 extends to accept `versionId` + appends to a `versions[]` array.
- `loadKnownApps()` — returns flat list; will return the same shape + new fields.

---

## Section 2 — Data flow (before + after)

### Before (full re-deploy every time)
```
Marcus clicks Deploy
  → POST /api/deploy { source, appSlug }
  → deploy.js dispatcher
  → deploySourceCloudflare (full)
      → DeployLockManager acquire
      → compileProgram
      → provisionD1              ◄ always
      → applyMigrations          ◄ always
      → setSecrets               ◄ always
      → uploadScript             ◄ always
      → attachDomain             ◄ always (no-op if already attached)
      → store.markAppDeployed    ◄ overwrites record
      → DeployLockManager release
  → 200 OK { url, jobId }
  Wall clock: ~10-15s
```

### After (incremental update when already deployed)
```
Marcus clicks Deploy
  → POST /api/deploy { source, appSlug, secrets? }
  → deploy.js dispatcher
  → store.getAppRecord(tenantSlug, appSlug)
  → isRedeploy = !!appRecord
  → if isRedeploy:
      → deploySourceCloudflare({ ..., mode: 'update' })
          → DeployLockManager acquire
          → compileProgram
          → IF migrationsDiffer(appRecord.lastMigrations, compiled.migrations):
              return { ok: false, stage: 'migration-confirm-required',
                       diff: <human-readable diff> }
          → IF secrets object has new keys not in appRecord.secretKeys:
              → setSecrets (only the new ones)
          → uploadScript (same scriptName — CF creates new version)
          → store.recordVersion({ tenantSlug, appSlug, versionId, uploadedAt, sourceHash })
          → DeployLockManager release
          → 200 OK { url, jobId, versionId, mode: 'update' }
          Wall clock: ~2-3s
    else:
      → full-provision path (unchanged)
```

### Rollback flow
```
Marcus opens "Version history" (new UI in Deploy modal)
  → GET /api/deploy-history/<appSlug>
      → store.getAppRecord → { versions: [{id, uploadedAt, sourceHash}] }
      → returns versions (newest first)
Marcus clicks "Rollback to v3"
  → POST /api/rollback { appName, version }
      → api.rollbackToVersion({ scriptName: appName, versionId: version })
      → store.recordVersion({ ..., versionId: version,
                              uploadedAt: now, note: 'rollback-from-vN' })
Wall clock: ~1-2s
```

---

## Section 3 — Key design decisions

### D1. versions[] array vs separate `app_versions` collection?

**Decision:** Array inside the app record, capped at last 20 versions. Older versions still exist on Cloudflare's side (they keep versions until explicitly deleted) — we just don't offer UI rollback past 20 in Studio. Simpler schema, fits in a single in-memory object, easy to serialize to disk when tenant store gets persisted. If we ever need >20 versions in UI, we can paginate by calling `api.listVersions` directly.

### D2. What gets skipped in the incremental path?

| Operation | Full deploy | Incremental update | Why |
|-----------|-------------|--------------------|------|
| compile | ✅ run | ✅ run | always need fresh bundle |
| provisionD1 | ✅ run | ❌ skip | D1 DB already exists; binding is permanent |
| applyMigrations | ✅ run | ⚠️ gate | if migrations differ → warn + require confirmation |
| setSecrets | ✅ all | ⚠️ new only | only set keys not already in `appRecord.secretKeys` |
| uploadScript | ✅ run | ✅ run | this IS the update |
| attachDomain | ✅ run | ❌ skip | domain already bound to script name |
| store.record | ✅ markAppDeployed | ✅ recordVersion | append to versions[] instead of overwrite |

### D3. sourceHash for diff detection?

Store sha256 of the canonicalized Clear source with each version. UI compares `hash(current editor content)` vs `appRecord.versions[0].sourceHash` — if equal, the button says "No changes to deploy" and is disabled. Prevents no-op updates that burn a Cloudflare version slot for nothing.

### D4. Migration diff — how precise?

Compare compiled `migrations/*.sql` files byte-by-byte. If any migration file content differs OR the set of filenames differs, flag as "migration required." Don't try to parse the SQL — that's a future project. A false positive (two identical-semantics migrations written differently) just means one extra confirmation click for Marcus. Safe default.

### D5. Where does `isRedeploy` detection happen?

In `deploy.js` (the handler), BEFORE calling `deploySourceCloudflare`. Rationale: keeps `deploy-cloudflare.js` a pure orchestration module (no decision logic), and the handler already has access to `store`. Pass `mode: 'deploy' | 'update'` explicitly to the orchestration function.

### D6. Rollback tombstones?

Current rollback spec says "Marcus picks v3, we upload v3 again as a new 'rollback version.'" That creates a linear history (v1, v2, v3, v4-new, v5-rollback-to-v3) rather than branching. Simpler to reason about. Cloudflare bills the same way regardless. Store adds `note: 'rollback-from-v<N>'` to the new version's metadata.

---

## Section 4 — Edge cases

| Scenario | Handling |
|----------|----------|
| Update called but app never deployed | Fall through to full-provision path. Button label still says "Deploy" because UI fetches state. |
| Update called, source unchanged (same hash) | UI button disabled with tooltip "No changes since last deploy." Handler returns 400 `{ code: 'NO_CHANGES' }` if bypassed. |
| Update called with new secret keys in body | Set those keys via `setSecrets`, leave existing keys alone. Secret values are write-only (we can't diff values, only key presence). |
| Update called, compiled migrations differ | Return `{ ok: false, stage: 'migration-confirm-required', migrationDiff: [<file, added/removed/changed>] }`. UI shows modal with diff + "Apply migration + update" button that re-POSTs with `confirmMigration: true`. |
| User confirms migration, new migration fails | Current state: schema is half-applied. Return `{ ok: false, stage: 'migrations', error }` + DON'T upload the new script. Old script keeps serving. Marcus sees the error; manual recovery is manual D1 console work. Phase 7 docs: add a runbook entry. |
| User confirms migration, migration OK, uploadScript fails | New migration applied, new code NOT live. Old code runs against new schema — may error. Rare because uploadScript almost never fails if migration passed (same Cloudflare creds). Return `{ ok: false, stage: 'upload-after-migration' }`. No auto-rollback of schema — Marcus must re-POST with old source + migration-confirm. |
| uploadScript returns no versionId (very old CF response) | Fallback: call `listVersions` immediately after, use newest. Log `[update]` warning. |
| listVersions pagination (CF caps at 50/page) | Cap our UI to the first page (50 versions). 99.9% of tenants won't hit this. |
| Rollback to version that no longer exists on CF (deleted, retention policy) | Return `{ ok: false, stage: 'rollback', code: 'VERSION_GONE' }`. UI refreshes version list on error. |
| Two parallel Update clicks | `DeployLockManager` already handles this — second click gets 409 with the pending jobId. |
| Tenant over quota | `canDeploy(tenant)` gates both Deploy and Update paths identically. Updates count toward the quota only because of `incrementAppsDeployed` — but the counter is deploy-COUNT, not deploy-CAPACITY. **Decision:** Don't increment on updates, only on first deploys. |
| Deleted from CF out-of-band (Russell opens dash, removes script) | Next Update returns 404 from uploadScript. Fall through to full-provision path automatically. Log `[update]` warning, reclassify as fresh deploy. |
| tenants-db file corruption (in-memory only today) | Phase 1 adds no persistence; when the in-memory store is replaced with a real DB (future), version history survives restarts. For now, restart = lost version history (but scripts on CF persist, so reconcile-wfp.js can rebuild). |
| App slug sanitized differently across versions | Slug is per-tenant deterministic; no drift possible unless Marcus renames, which is a new app anyway. Out of scope. |
| Very large bundle (>10MB) | `uploadScript` already handles — same code path as initial deploy. |
| Script has a Durable Object namespace | DO migrations are declared in wrangler.toml `[[migrations]]` — if DO bindings change between versions, that's a schema change analogous to D1 and we flag it. Phase 3: extend migration diff to include wrangler.toml if it differs. |

---

## Section 5 — Integration points

| Producer | Consumer | Format |
|----------|----------|--------|
| `/api/deploy` request | `deploy.js` handler | `{ source, appSlug, secrets?, domain?, confirmMigration?: true }` |
| `deploy.js` handler | `deploy-cloudflare.js` | `{ mode: 'deploy' \| 'update', lastRecord? }` passed via opts |
| `deploy-cloudflare.js` | `wfp-api.uploadScript` | `{ scriptName, bundle, bindings }` (bindings always present, same as deploy) |
| `deploy-cloudflare.js` | `tenants.recordVersion` | `{ tenantSlug, appSlug, versionId, uploadedAt, sourceHash, migrationsHash }` |
| `/api/deploy-history/:app` → UI | `{ versions: [{id, uploadedAt, sourceHash, note?}] }` sorted newest first |
| `/api/rollback` | `wfp-api.rollbackToVersion` | `{ scriptName, versionId }` |
| `/api/rollback` success | `tenants.recordVersion` | appends rollback entry with `note: 'rollback-from-vN'` |
| Studio Deploy modal | `/api/app-info/:appSlug` (NEW) | `{ deployed: true, lastVersion: {...}, versions: [...], currentSourceHash }` |
| Deploy button state | source editor content hash vs `appInfo.lastVersion.sourceHash` | disabled if equal; "Update" if deployed + changes; "Deploy" if not deployed |

---

## Section 6 — Environment variables

**None new.** This plan reuses existing Cloudflare credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DISPATCH_NAMESPACE`, `CLEAR_CLOUD_ROOT_DOMAIN`, `CLEAR_DEPLOY_TARGET`) established by Phase 7.

---

## Phase 1 — Tenants-db schema: version history + getAppRecord (6 TDD cycles)

Extend `InMemoryTenantStore` with a `getAppRecord` reader (the plan originally assumed it existed — it doesn't) and per-app version tracking. Pure schema/data work, no Cloudflare calls. All mockable.

### Cycle 1.0 — `getAppRecord(tenantSlug, appSlug)` reader

**(Inserted by red-team — this method didn't exist and plan assumes it does throughout. Must land first.)**

| Step | Action |
|------|--------|
| 🔴 | Test in `playground/tenants.test.js`: after `markAppDeployed({...})`, `getAppRecord(slug, appSlug)` returns the stored row (scriptName, d1_database_id, hostname, deployedAt). Unknown `(slug, appSlug)` returns `null`. |
| 🟢 | Add `async getAppRecord(tenantSlug, appSlug)` to `InMemoryTenantStore`. Reads `this.cfDeploys.get('${tenantSlug}/${appSlug}')`. Returns the row or null. |
| 🔄 | Extract the key-building into a private `_appKey(slug, appSlug)` helper; use in both `markAppDeployed` + `getAppRecord`. |
| ✅ | Commit: `feat(tenants): getAppRecord reader for per-app state lookups` |

### Cycle 1.1 — `recordVersion` appends to versions[]

| Step | Action |
|------|--------|
| 🔴 | Test: `markAppDeployed({tenantSlug,appSlug,scriptName,hostname})` then `recordVersion({ tenantSlug, appSlug, versionId, uploadedAt, sourceHash })` — `getAppRecord(...)` returns `versions` as an array with exactly 1 entry matching the recordVersion input. |
| 🟢 | Add `async recordVersion({ tenantSlug, appSlug, versionId, uploadedAt, sourceHash, migrationsHash, note })` to `InMemoryTenantStore`. Reads the existing row via `_appKey`. If no row exists, RETURN `{ok:false, code:'APP_NOT_FOUND'}` (can't version an unknown app — forces the happy path of markAppDeployed-first, recordVersion-second). Otherwise push to `row.versions = row.versions || []`. |
| 🔄 | — |
| ✅ | Commit: `feat(tenants): recordVersion appends to per-app versions[]` |

### Cycle 1.2 — `getAppRecord` returns versions sorted newest-first

| Step | Action |
|------|--------|
| 🔴 | Test: insert 3 versions with timestamps 100, 300, 200. `getAppRecord(...)` returns `versions` in order `[300, 200, 100]`. |
| 🟢 | In `getAppRecord`, return a shallow copy where `versions` is sorted descending by `uploadedAt`. Original storage stays insertion-order. |
| 🔄 | — |
| ✅ | Commit: `feat(tenants): getAppRecord sorts versions newest-first` |

### Cycle 1.3 — versions[] caps at 20 entries

| Step | Action |
|------|--------|
| 🔴 | Test: insert 25 versions. `getAppRecord` returns exactly 20 (newest 20, oldest 5 dropped). |
| 🟢 | In `recordVersion`, after append, if `versions.length > 20`, trim from the oldest end. |
| 🔄 | Extract `MAX_VERSIONS_PER_APP = 20` as a module-level const with comment explaining the UI cap (full history still lives on Cloudflare's side). |
| ✅ | Commit: `feat(tenants): cap versions[] at 20 (UI pagination bound)` |

### Cycle 1.4 — `markAppDeployed` seeds versions[] with initial version + secretKeys

| Step | Action |
|------|--------|
| 🔴 | Test: `markAppDeployed({ ..., versionId:'abc', sourceHash:'h1', migrationsHash:'m1', secretKeys:['API_KEY'] })` then `getAppRecord` returns `{versions: [{versionId:'abc', sourceHash:'h1', migrationsHash:'m1', uploadedAt:<iso>}], secretKeys:['API_KEY']}`. |
| 🟢 | Extend `markAppDeployed` signature to accept `versionId`, `sourceHash`, `migrationsHash`, `secretKeys` (all optional for backward compat). When `versionId` present, push `{versionId, uploadedAt: new Date().toISOString(), sourceHash, migrationsHash}` as the seed `versions` entry. Store `secretKeys` (array of strings, NEVER secret values) on the row. |
| 🔄 | Update deploy-cloudflare.js line 260 call site to pass `versionId: null, sourceHash: null, migrationsHash: null, secretKeys: Object.keys(secrets || {})` — actual versionId comes in Phase 2. |
| ✅ | Commit: `feat(tenants): markAppDeployed tracks secretKeys + seeds versions[]` |

### Cycle 1.5 — `updateSecretKeys` appends new keys to the row

| Step | Action |
|------|--------|
| 🔴 | Test: after `markAppDeployed({..., secretKeys:['API_KEY']})`, call `updateSecretKeys({tenantSlug, appSlug, newKeys:['DB_URL']})` → `getAppRecord` returns `secretKeys: ['API_KEY','DB_URL']`. Duplicate keys are deduped. |
| 🟢 | Add `async updateSecretKeys({tenantSlug, appSlug, newKeys})` that merges `newKeys` into `row.secretKeys` (preserving order, deduping). If row doesn't exist, return `{ok:false, code:'APP_NOT_FOUND'}`. |
| 🔄 | — |
| 📚 | `update-learnings` — capture: storing secret KEY NAMES (not values) is enough for "skip if already set" logic; never store secret values in tenants-db. |
| ✅ | Commit: `feat(tenants): updateSecretKeys appends new keys without duplication` |

**Phase 1 gate:** `node playground/tenants.test.js` all green; `node clear.test.js` still 2399/0; no changes to deploy flow yet.

---

## Phase 2 — deploy-cloudflare.js: incremental update mode (6 TDD cycles)

Add the `mode: 'deploy' | 'update'` branching to `deploySource`. Tests use the existing mock-CF-API pattern from `deploy-cloudflare.test.js`.

### Cycle 2.1 — `deploySource` accepts and routes on `mode`

| Step | Action |
|------|--------|
| 🔴 | Test: call `deploySource({ ..., mode: 'update', lastRecord: {...} })` — mock `api.uploadScript` and assert `provisionD1` + `applyMigrations` + `attachDomain` are NOT called. |
| 🟢 | In `deploySource`, after compile, check `mode === 'update'`. If so, skip provision/migrations/domain branches. Leave uploadScript + markAppDeployed-equivalent in both paths. |
| 🔄 | Extract the full-provision branch into `_deployInitial()` and the incremental into `_deployUpdate()`, both private. `deploySource` becomes a switch. |
| ✅ | Commit: `feat(deploy-cf): deploySource routes on mode: deploy vs update` |

### Cycle 2.2 — `_captureVersionId` helper — always-after-upload

| Step | Action |
|------|--------|
| 🔴 | Test: mock `api.uploadScript` to return `{ ok:true, status:200, result:{} }` (the wrapper's actual shape — no versionId directly). Mock `api.listVersions` to return `{ ok:true, versions:[{id:'v-new-456', created_on:'2026-04-23T20:00:00Z'}, {id:'v-old-001', ...}] }`. Call `_captureVersionId({api, scriptName})`. Returns `'v-new-456'` (the newest by created_on). |
| 🟢 | Add `async function _captureVersionId({api, scriptName})` in deploy-cloudflare.js. First try the fast path: if the most recent uploadScript return has a `result.id` field, use it. Otherwise call `api.listVersions({scriptName})`, sort by `created_on` descending, return `versions[0].id`. Return `null` if listVersions returns empty (brand-new script, CF hasn't indexed yet — rare race). |
| 🔄 | — |
| ✅ | Commit: `feat(deploy-cf): _captureVersionId helper — always-works version resolver` |

### Cycle 2.3 — update mode captures versionId via `_captureVersionId` after uploadScript

| Step | Action |
|------|--------|
| 🔴 | Test: `deploySource({mode:'update', lastRecord:{...}})`. Mock uploadScript succeeds, listVersions returns fresh version. Assert result includes `{ ok:true, versionId:'v-new-456' }`. |
| 🟢 | In `_deployUpdate`, immediately after `api.uploadScript(...)`, `const versionId = await _captureVersionId({api, scriptName})`. If `versionId === null`, log `[update] versionId-missing` warning but proceed with `versionId: null` (recordVersion will tolerate null and UI will refetch). |
| 🔄 | — |
| ✅ | Commit: `feat(deploy-cf): update mode returns fresh versionId via _captureVersionId` |

### Cycle 2.4 — update mode calls store.recordVersion instead of markAppDeployed

| Step | Action |
|------|--------|
| 🔴 | Test with a fake store: `mode: 'update'` → `store.recordVersion` called with `{tenantSlug, appSlug, versionId, uploadedAt, sourceHash, migrationsHash}`. `store.markAppDeployed` NOT called. |
| 🟢 | In `_deployUpdate`, after successful uploadScript, compute `sourceHash = sha256(source)` and `migrationsHash = sha256(migrationsBundle)`, call `store.recordVersion(...)`. |
| 🔄 | Extract `_hashSource` and `_hashMigrations` helpers in deploy-cloudflare.js. Use `crypto.createHash('sha256')`. |
| ✅ | Commit: `feat(deploy-cf): update mode appends version via store.recordVersion` |

### Cycle 2.5 — update mode: partial secrets update (only new keys)

| Step | Action |
|------|--------|
| 🔴 | Test: `lastRecord.secretKeys = ['API_KEY']`. Call `deploySource({ mode:'update', secrets: { API_KEY: 'x', DB_URL: 'y' }, lastRecord })`. Assert `api.setSecrets` called with ONLY `{ DB_URL: 'y' }`. |
| 🟢 | In `_deployUpdate`, before calling setSecrets, filter the secrets object to keys not in `lastRecord.secretKeys || []`. If the filtered object is empty, skip setSecrets entirely. |
| 🔄 | — |
| ✅ | Commit: `feat(deploy-cf): update mode sets only NEW secrets, skips existing` |

### Cycle 2.6 — update mode: DeployLockManager works for updates too

| Step | Action |
|------|--------|
| 🔴 | Test: two concurrent `deploySource({ mode:'update', ... })` calls with same `(tenantSlug, appSlug)` — second returns `{ ok: false, conflict: true, existingJobId }`. |
| 🟢 | Verify existing DeployLockManager key includes `(tenantSlug, appSlug)`; no code change expected, just test coverage. |
| 🔄 | — |
| 📚 | `update-learnings` — capture: extending orchestration with a mode switch is safer than an if-chain; extracting `_deployInitial` + `_deployUpdate` makes the paths explicit. |
| ✅ | Commit: `test(deploy-cf): confirm DeployLockManager covers update mode` |

**Phase 2 gate:** `node playground/deploy-cloudflare.test.js` all green; 38-task sweep still reproducible (unchanged code paths when `mode` is unset).

---

## Phase 3 — Migration-safety gate (4 TDD cycles)

Block an update that would change D1 schema without explicit user confirmation.

### Cycle 3.1 — `migrationsDiffer(oldBundle, newBundle)` pure helper

| Step | Action |
|------|--------|
| 🔴 | Add test in `playground/deploy-cloudflare.test.js`: `migrationsDiffer({ 'migrations/001-init.sql': 'CREATE TABLE a' }, { 'migrations/001-init.sql': 'CREATE TABLE a' })` → `false`. Same test with different content → `true`. Test with added file, removed file, renamed file — all `true`. |
| 🟢 | Add `export function migrationsDiffer(oldBundle, newBundle)` to deploy-cloudflare.js. Compare set of filenames starting with `migrations/`; if sets differ → true. If same set, compare content byte-by-byte → true on any mismatch. |
| 🔄 | — |
| ✅ | Commit: `feat(deploy-cf): migrationsDiffer — byte-precise schema-change detector` |

### Cycle 3.2 — `deploySource({ mode: 'update' })` returns migration-confirm-required when differs

| Step | Action |
|------|--------|
| 🔴 | Test: `lastRecord.migrationsHash = hash('OLD SQL')`. New compile produces `migrations/001-init.sql = 'NEW SQL'`. `deploySource({ mode:'update', ..., lastRecord })` returns `{ ok: false, stage: 'migration-confirm-required', migrationDiff: [{file:'migrations/001-init.sql', kind:'changed'}] }`. Does NOT call uploadScript. |
| 🟢 | In `_deployUpdate`, after compile, call `migrationsDiffer(lastRecord.lastMigrations, newBundle)`. If true AND `opts.confirmMigration !== true` → return the error response with a diff description. |
| 🔄 | Extract `_describeMigrationDiff(oldBundle, newBundle)` that returns the array of `{file, kind: 'added'|'removed'|'changed'}`. |
| ✅ | Commit: `feat(deploy-cf): update mode blocks on migration-confirm-required` |

### Cycle 3.3 — `confirmMigration: true` unblocks and applies migrations in update mode

| Step | Action |
|------|--------|
| 🔴 | Test: same setup as 3.2 but `deploySource({ mode:'update', confirmMigration: true, ... })` — assert `api.applyMigrations` called with the new SQL, then `api.uploadScript` called, then `store.recordVersion` called. |
| 🟢 | In `_deployUpdate`, if `opts.confirmMigration === true`, call `applyMigrations` before `uploadScript`. If applyMigrations fails → return `{ ok: false, stage: 'migrations' }` and DON'T upload. |
| 🔄 | — |
| ✅ | Commit: `feat(deploy-cf): confirmMigration applies schema change then uploads` |

### Cycle 3.4 — wrangler.toml migration diff (Durable Objects, workflows)

| Step | Action |
|------|--------|
| 🔴 | Test: `oldBundle['wrangler.toml'] = 'X'`, `newBundle['wrangler.toml'] = 'Y'` with different DO bindings. `migrationsDiffer` returns `true`. |
| 🟢 | Extend `migrationsDiffer` to also compare `wrangler.toml` byte-by-byte. Rename internal var to `schemaishFiles` to cover both D1 SQL and wrangler config. |
| 🔄 | Add a comment explaining that DO namespace rebinding is schema-change territory. |
| 📚 | `update-learnings` — capture: "schema change" in a Cloudflare context spans SQL migrations AND wrangler.toml binding changes. Both require explicit confirmation. |
| ✅ | Commit: `feat(deploy-cf): migrationsDiffer also covers wrangler.toml changes` |

**Phase 3 gate:** `node playground/deploy-cloudflare.test.js` all green.

---

## Phase 4 — `/api/deploy` handler branching + new endpoints (5 TDD cycles)

Wire the new logic through the HTTP layer. Tests use supertest-style pattern from `deploy.test.js`.

### Cycle 4.1 — `isRedeploy` detection before dispatch

| Step | Action |
|------|--------|
| 🔴 | In `playground/deploy.test.js`, seed store with an app record. Call `POST /api/deploy { source, appSlug }`. Assert the mocked `deploySourceCloudflare` is called with `mode: 'update'` + `lastRecord` populated. Seed with no record → called with `mode: 'deploy'` (or undefined, default). |
| 🟢 | In `deploy.js` `/api/deploy` handler, before calling `deploySourceCloudflare`, call `await store.getAppRecord(tenant.slug, appSlug)`. If present → `mode = 'update'`, pass `lastRecord = <record>`. |
| 🔄 | — |
| ✅ | Commit: `feat(api): /api/deploy detects already-deployed and routes to update mode` |

### Cycle 4.2 — `confirmMigration` flag propagates from HTTP body to orchestration

| Step | Action |
|------|--------|
| 🔴 | Test: `POST /api/deploy { source, appSlug, confirmMigration: true }` → `deploySourceCloudflare` called with `confirmMigration: true` in opts. |
| 🟢 | Thread `confirmMigration` through the handler into the deploy function call. |
| 🔄 | — |
| ✅ | Commit: `feat(api): /api/deploy propagates confirmMigration flag` |

### Cycle 4.3 — Migration-confirm-required response surfaces cleanly as 409

| Step | Action |
|------|--------|
| 🔴 | Test: mock `deploySourceCloudflare` to return `{ ok:false, stage:'migration-confirm-required', migrationDiff: [...] }`. `POST /api/deploy` → response 409 with body `{ ok:false, code:'MIGRATION_REQUIRED', migrationDiff: [...] }`. |
| 🟢 | In handler, check `r.stage === 'migration-confirm-required'` → `return res.status(409).json({ ok:false, code:'MIGRATION_REQUIRED', migrationDiff: r.migrationDiff })`. |
| 🔄 | — |
| ✅ | Commit: `feat(api): migration-confirm-required surfaces as 409 MIGRATION_REQUIRED` |

### Cycle 4.4 — `GET /api/app-info/:appSlug` — new endpoint for the UI

| Step | Action |
|------|--------|
| 🔴 | Test: seed store with an app + 3 versions. `GET /api/app-info/myapp` returns `{ ok:true, deployed:true, lastVersion: {...}, versions: [...], hostname, scriptName }`. Unknown slug → `{ ok:true, deployed:false }` (200 not 404 — consistent UI path). |
| 🟢 | Add `app.get('/api/app-info/:appSlug', ...)` in deploy.js. Require tenant. Sanitize slug. Load record from store. Return the JSON. |
| 🔄 | Extract `_appInfoResponse(record)` helper in deploy.js — shapes the response consistently for future callers. |
| ✅ | Commit: `feat(api): /api/app-info surfaces deployed-state for the UI` |

### Cycle 4.5 — `GET /api/deploy-history/:app` — CF path using listVersions

| Step | Action |
|------|--------|
| 🔴 | Test: `CLEAR_DEPLOY_TARGET=cloudflare`, mock `api.listVersions` to return `{ versions: [{id, created_on, metadata: {uploadedAt, sourceHash}}, ...] }`. `GET /api/deploy-history/myapp` returns the list. |
| 🟢 | In `/api/deploy-history/:app` handler, when `deployTarget() === 'cloudflare'`, call `api.listVersions({ scriptName: appName })` and shape the response. Fallback to tenants-db `versions[]` if listVersions fails — degraded mode. |
| 🔄 | — |
| 📚 | `update-learnings` — capture: having a fallback from CF-side history to our-side history gives resilience when CF is briefly unreachable. |
| ✅ | Commit: `feat(api): deploy-history CF path via listVersions + store fallback` |

**Phase 4 gate:** `node playground/deploy.test.js` all green. Pre-push hook (compiler + e2e) passes.

---

## Phase 5 — Studio Deploy-modal UX: "Update" state detection (5 TDD cycles)

Extend `playground/ide.html` Deploy modal to show "Update" vs "Deploy" based on app-info fetch.

### Cycle 5.1 — `fetchAppInfo(appSlug)` helper in ide.html

| Step | Action |
|------|--------|
| 🔴 | Add `playground/ide.test.js` (Playwright) test: set source with `app 'myapp'`, open Deploy modal. Mock `/api/app-info/myapp` to return `{ deployed: true, lastVersion: {...}, hostname: 'myapp.buildclear.dev' }`. Assert modal shows "Update myapp.buildclear.dev" heading, "Last deployed 2 min ago" subheading, button text "Update". |
| 🟢 | In `doDeploy()`, before rendering modal body, `fetch('/api/app-info/' + appSlug)`. Conditionally render "Update" branch vs "Deploy" branch based on `deployed` flag. |
| 🔄 | Extract `renderDeployedState(info)` and `renderFreshDeployState()` as separate HTML-string builders. |
| ✅ | Commit: `feat(studio): Deploy modal detects deployed state + renders Update UX` |

### Cycle 5.2 — "No changes to deploy" state when source hash matches

| Step | Action |
|------|--------|
| 🔴 | Test: fetch returns `{ deployed:true, lastVersion: { sourceHash: <hash of current editor content> } }`. Modal button disabled, shows "No changes since last deploy." |
| 🟢 | On modal open, compute `sha256(editorContent)` client-side using `crypto.subtle`. Compare to `info.lastVersion.sourceHash`. If equal, disable button + show message. |
| 🔄 | Extract `async hashSource(text)` helper. |
| ✅ | Commit: `feat(studio): Update button disabled when source hash matches live version` |

### Cycle 5.3 — Diff-preview: "N lines changed" indicator

| Step | Action |
|------|--------|
| 🔴 | Test: fetch returns `{ deployed:true, lastVersion: { source: '...' } }` with 10-line source, editor has 12 lines (2 added). Modal shows "+2 / -0 lines" indicator. |
| 🟢 | `/api/app-info` extends its response to include the stored `lastSource` from the most recent version (or fetch from CF on demand if we don't store full source — decision below). Client computes a naive line-diff. |
| 🔄 | Decision: DO store last-deployed source in tenants-db versions[] so the UI can diff without round-tripping to CF. Adds ~10KB per version in memory, fine. |
| ✅ | Commit: `feat(studio): diff-preview indicator in Update modal` |

### Cycle 5.4 — Migration-change warning UX

| Step | Action |
|------|--------|
| 🔴 | Test: POST /api/deploy returns 409 MIGRATION_REQUIRED with migrationDiff. Modal switches to "Schema change detected" view showing the diff + a "Apply migration + update" confirm button. Clicking re-POSTs with `confirmMigration: true`. |
| 🟢 | Add a response handler in `doDeployConfirm()` for 409. Render the diff list. Add confirm button that re-calls the API with `confirmMigration: true`. |
| 🔄 | Extract `renderMigrationWarning(diff)` HTML builder. |
| ✅ | Commit: `feat(studio): migration-change warning modal with explicit confirm` |

### Cycle 5.5 — Post-update success UX (version + rollback link)

| Step | Action |
|------|--------|
| 🔴 | Test: successful update returns `{ ok:true, versionId, mode:'update', url }`. Modal shows "Updated to version v-abc-123" + link "View version history" (opens Phase 6 panel). |
| 🟢 | Update success renderer to branch on `mode`. If update, show version badge + "View version history" link. If deploy, show existing success UI. |
| 🔄 | — |
| 📚 | `update-learnings` — capture: client-side hashing via crypto.subtle is available in all modern browsers; good match for deterministic change detection. |
| ✅ | Commit: `feat(studio): post-update success UX with version + history link` |

**Phase 5 gate:** `node playground/ide.test.js` all green. Manual smoke: open Studio, deploy hello-world (mock CF), edit code, reopen deploy modal, verify Update UX appears.

---

## Phase 6 — Version history + one-click rollback UX (4 TDD cycles)

Surface the versions list and the rollback primitive in Studio.

### Cycle 6.1 — Deploy modal expands to show version history panel

| Step | Action |
|------|--------|
| 🔴 | Test: click "View version history" link in Update modal → panel expands showing last 5 versions with `uploadedAt` timestamps + `note` if present. |
| 🟢 | Add `renderVersionHistory(versions)` HTML builder. Panel toggles via a `[data-expanded]` attr. Renders each version as a row: `v<id-short>  2 min ago  [Rollback]`. |
| 🔄 | — |
| ✅ | Commit: `feat(studio): version history panel in Deploy modal` |

### Cycle 6.2 — Rollback button calls `/api/rollback` and records new version

| Step | Action |
|------|--------|
| 🔴 | Test: click "Rollback" on version v-old-3 → POST /api/rollback { appName, version: 'v-old-3' }. Mock api.rollbackToVersion succeeds. Store receives a new `recordVersion` call with `note: 'rollback-from-v-old-3'`. UI refreshes history and shows "Rolled back to v-old-3 (new version v-rb-001)". |
| 🟢 | Wire the rollback button to `async function doRollback(version)`. On success, refetch `/api/app-info` and re-render the modal. On `/api/rollback` handler side (already exists): after successful `api.rollbackToVersion`, call `store.recordVersion({ ..., note: 'rollback-from-' + version })`. |
| 🔄 | — |
| ✅ | Commit: `feat(studio): one-click rollback with tombstone version record` |

### Cycle 6.3 — "Rollback to this" disabled for the currently-live version

| Step | Action |
|------|--------|
| 🔴 | Test: newest version is v-latest. Its row has "Current" label, no rollback button. Older versions have active rollback buttons. |
| 🟢 | In `renderVersionHistory`, first (newest) entry gets a "Current" badge, not a button. |
| 🔄 | — |
| ✅ | Commit: `feat(studio): current version has label, not rollback button` |

### Cycle 6.4 — Rollback failure surface (VERSION_GONE etc)

| Step | Action |
|------|--------|
| 🔴 | Test: `/api/rollback` returns 404 `{ code: 'VERSION_GONE' }`. UI shows "This version no longer exists on Cloudflare — the history has been refreshed." Refetches app-info, re-renders. |
| 🟢 | Error handling in `doRollback`: on non-ok, map codes to human messages. Always refetch on any error. |
| 🔄 | — |
| 📚 | `update-learnings` — capture: defensive UI that refetches state on error catches out-of-band changes (someone deletes a version in the CF dashboard). |
| ✅ | Commit: `feat(studio): rollback-failure UX with state refresh` |

**Phase 6 gate:** `node playground/ide.test.js` all green.

---

## Phase 7 — Docs surfaces + ship (MANDATORY per CLAUDE.md)

Wrap the feature with the nine documentation touchpoints required for any new user-facing capability.

### Cycle 7.1 — Documentation gate checklist

- [ ] `intent.md` — add one-line note about update vs deploy under the Cloudflare target section (if that section exists).
- [ ] `SYNTAX.md` — no new syntax, but add a note in the Cloudflare deploy section that re-deploys are automatic incremental updates when the app is already live.
- [ ] `AI-INSTRUCTIONS.md` — add: "If Marcus has already deployed, editing code + hitting Deploy is an incremental update — no schema change unless tables change."
- [ ] `USER-GUIDE.md` — add a "One-click updates" tutorial section walking through: edit → Update button → version history → rollback.
- [ ] `ROADMAP.md` — mark this phase complete. Update "What's Next" section.
- [ ] `landing/business-agents.html` + `landing/one-click-deploy.html` (if exists) — mention updates-in-seconds as a first-class capability.
- [ ] `playground/system-prompt.md` — add: "When the user asks you to 'update' a deployed app, they want incremental redeploy. The Update button in Studio handles this; don't try to manually re-provision."
- [ ] `FAQ.md` — add: "Where is the incremental update logic? → `playground/deploy-cloudflare.js:_deployUpdate`", "How do I rollback a Cloudflare app? → Studio Deploy modal → Version history → Rollback", "Why do migrations require confirmation? → SQLite has no atomic schema swap; see `plan-one-click-updates`."
- [ ] `RESEARCH.md` — no training-signal change; skip unless the flywheel adds deploy-outcome signal later.
- [ ] `playground/clear-compiler.min.js` — not touched; compiler unchanged; no rebuild needed.
- [ ] `CHANGELOG.md` — add entry for this session.
- [ ] `FEATURES.md` — add row "One-click updates — edit deployed app, hit Update, live in ~2s. Rollback via version history."

### Cycle 7.2 — Final integration test against real CF (manual, requires Phase 8 prereqs)

| Step | Action |
|------|--------|
| Manual | With `CLEAR_DEPLOY_TARGET=cloudflare` and Russell's CF creds set: (1) deploy hello-world, (2) note URL responds, (3) edit the message, (4) click Update in Studio, (5) assert response time <3s, (6) curl the URL — new message shows, (7) open version history, (8) click Rollback on the first version, (9) curl — old message back. |
| — | Document the flow in `plans/runbook-phase-8-2026-04-23.md` as a new §9 if it's not there. |

### Cycle 7.3 — Ship

| Step | Action |
|------|--------|
| 🧪 | Run full test suite: `node clear.test.js`, `node playground/server.test.js`, `node playground/e2e.test.js`, `node playground/ide.test.js`, `node playground/agent.test.js`, `node playground/supervisor/curriculum-sweep.test.js`. All green. |
| 🧪 | Re-run 38-task sweep with the current branch — pass rate should match main (~71% projected). If it drops, the feature introduced a regression somewhere in the sweep path. |
| 📝 | Update HANDOFF.md with a new "What shipped this session" block. |
| 🔖 | Commit the docs as a single squashable `docs(one-click-updates): update all 11 surfaces`. |
| 🎁 | Invoke the `ship` skill to merge to main + push. |

---

## Section 8 — Success criteria

- [ ] Clicking Deploy on an already-deployed app shows "Update" + last-deployed-at.
- [ ] Source-unchanged case disables the Update button with a clear explanation.
- [ ] Update path takes <3s wall clock when tests pass (local mock: <500ms).
- [ ] Migration-change case blocks the update + shows diff + explicit confirm button.
- [ ] Version history panel shows last 20 versions.
- [ ] Rollback to a prior version is one click, <2s wall clock, refreshes history.
- [ ] All tests green across all five test suites.
- [ ] Full 38-task sweep post-merge pass rate same as pre-merge baseline.
- [ ] Docs updated in all 11 surfaces.
- [ ] Works end-to-end against real Cloudflare (Phase 8 prereqs gating this).

---

## Section 9 — Known follow-ups (OUT OF SCOPE for this plan)

1. **Auto-rollback of schema changes on failure.** Today: if migration applies but uploadScript fails, schema is half-applied with no recovery. Future: save a rollback-migration SQL alongside the forward one, auto-apply on failure. Hard because SQLite doesn't trivially reverse a DROP COLUMN.
2. **Branched version history.** Today: rolling back creates a new forward entry. Future: tree view showing rollback branches. Probably never needed by Marcus.
3. **Persistent tenants-db.** Today: in-memory. Lost on restart. Future: back with SQLite or Postgres when we have >1 tenant. `reconcile-wfp.js` can rebuild from CF side.
4. **Update scheduling.** Today: updates go live immediately. Future: "stage + promote" model for tenants that want a canary. Wait for a customer to ask.
5. **Per-version source storage limit.** Storing full source per version in tenants-db caps at 20 × ~10KB = 200KB per app. At 10k tenants × 10 apps = 20GB memory. Not a problem near-term; revisit before it is.

---

## 📎 Copy-paste resume prompt

> Read `plans/plan-one-click-updates-04-23-2026.md`. Begin Phase 1 (tenants-db version schema). Create branch `feature/one-click-updates`. TDD red-first for every cycle. Commit after each cycle. Test gate between phases. Push at the end of each phase. Do NOT entangle with tonight's research work (A/B + transcripts — separate track). After Phase 7 docs cycle, invoke `ship` skill.
