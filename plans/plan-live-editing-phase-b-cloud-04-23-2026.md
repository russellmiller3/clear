# Plan — Live App Editing, Phase B (Cloud Shipping)

**Date:** 2026-04-23
**Branch:** `feature/live-editing-phase-b-cloud`
**Scope:** LAE widget ships additive edits to **cloud-deployed** apps (Cloudflare Workers for Platforms), not just locally-running ones.
**Effort:** one long session — ~5 TDD cycles on tenants-db + 4 on ship orchestration + 3 on rollback UX.
**Success:** Marcus opens a Cloudflare-deployed app, types "add a priority field" in the widget, clicks Ship, sees the field live on `https://<slug>.buildclear.dev` within 2-3 seconds. Clicks Undo; field is gone.

---

## 🎯 Problem

Phase A shipped local editing: widget → propose → classifier (additive-only) → write `main.clear` → respawn Node child → reload. **It only works when the app is running on Russell's laptop.** The moment Marcus deploys to Cloudflare, the widget's ship path has nothing to talk to — no local child process, no file on disk, nothing to recompile.

The fix isn't a new pipeline. All the Cloudflare incremental-update primitives exist (`uploadScript` is upsert, `listVersions` + `rollbackToVersion` work, `deploy-cloudflare.js` orchestrates multi-step deploys with rollback ladders). What's missing is: **Phase B extends `lib/ship.js` to detect "this app is cloud-deployed" and route to the incremental update path instead of the local respawn path.** Three new knobs, zero new infrastructure.

## 🧭 Why this is the differentiator

Lovable, Bolt, v0: owner types a change in chat, waits ~30 seconds for a full redeploy, gets a new URL (their preview system). Every edit is a fresh deployment. Marcus can't just "tweak a word on the live site" — he's always working in preview mode.

Clear + LAE Phase B: widget on the live URL, owner speaks, classifier verifies additive, incremental upload, **same URL**, ~2 seconds. The widget is the differentiator. Nobody else lets the owner edit the live production site directly, additive-only, with classifier-enforced safety.

## 📦 What's in scope

| In | Out |
|----|-----|
| LAE widget ship detects cloud-deployed apps via tenants-db lookup | Full Deploy-modal rewrite (separate plan) |
| Widget ship → `deploySource({ mode: 'update' })` when cloud-deployed | Destructive changes over cloud (Phase C) |
| tenants-db `versions[]` extended with `via: 'widget'` tag | Multi-tenant permissions on widget ship |
| Widget Undo button → `rollbackToVersion` for cloud apps | Dry-run preview URLs |
| Migration-safety auto-confirm for classifier-verified additive changes | Pagination past 20 versions in UI |
| Full TDD against mocked Cloudflare API | Live-CF smoke (waits on Phase 8 HITL paperwork) |

**Not in scope (absorbed or deferred):**
- We're **not** executing `plans/plan-one-click-updates-04-23-2026.md` standalone. Phase 1 (tenants-db versions) is absorbed here because LAE needs it. Phase 2's deploy-dispatcher mode switch is absorbed. Phases 3-7 of that plan (migration gate UX, Studio Deploy-modal version list, docs) stay out — the Deploy modal is Marcus's manual flow, not the widget's path.
- Phase B's local-only snapshot + rollback infrastructure (landed April 18 in `lib/snapshot.js` + `lib/ship.js` for Node children) stays untouched for local apps. Cloud apps get the CF version-native path; local stays local.

## 🔌 Primitives to reuse

| File | What it gives us | What's needed |
|------|------------------|---------------|
| `playground/wfp-api.js` | `uploadScript` (upsert), `listVersions`, `rollbackToVersion` | Nothing — already complete |
| `playground/deploy-cloudflare.js` | `deploySource`, `DeployLockManager` | Extend with `mode: 'deploy' | 'update'` (Phase 2 below) |
| `playground/tenants.js` | `markAppDeployed`, `InMemoryTenantStore`, `canDeploy` | Add `versions[]`, `getAppRecord`, `recordVersion` (Phase 1) |
| `lib/ship.js` | Local-child respawn + snapshot-before-write | Branch on "is cloud-deployed?" and route to CF update (Phase 3) |
| `lib/change-classifier.js` | AST diff → `{type: 'additive' \| 'reversible' \| 'destructive'}` | Nothing — already verifies safety; feeds migration-auto-confirm |
| `runtime/meph-widget.js` | Badge + panel + Ship + Undo buttons | Undo button dispatches to new `/rollback` endpoint for cloud apps (Phase 5) |

## 🎭 Design decisions (locked-in)

**D1. Detection of cloud-deployment state.** `lib/ship.js` calls `store.getAppRecord(tenantSlug, appSlug)` via DI before routing. `null` → local path (Phase A respawn). Non-null → cloud path (Phase B incremental update). Zero ambiguity: the store is the source of truth, not file-system heuristics.

**D2. Migration-safety gate for widget ships.** Classifier guarantees additive-only: new field, new endpoint, new page. Adding a field means adding a column, which is a SQLite schema change, which would normally trip the migration-confirm-required gate. **Decision: the widget auto-confirms migrations when the classifier has returned `additive`.** The classifier IS the safety — no second prompt needed. `deploySource` accepts `confirmMigration: true` when called from the widget path. If the classifier ever returns `reversible` (rename) or `destructive` (remove), the widget short-circuits before calling `deploySource` (already the case in Phase A).

**D3. Rollback semantics.** Cloud rollback = `rollbackToVersion` on Cloudflare (reuses existing primitive). Adds a new version record to `tenants-db versions[]` tagged `note: 'widget-undo-v<N>'`. The previous classifier snapshot + Apr-18's local-snapshot machinery isn't touched — local apps keep using file-based snapshot, cloud apps use CF version rollback.

**D4. One-click "ship to cloud" from widget == one-click "update existing deployment".** We do NOT make the widget provision D1 or attach domain — those only happen on first `/api/deploy`. Widget ship assumes the app is already deployed; fails cleanly with `{code: 'APP_NOT_DEPLOYED'}` if the lookup misses. Marcus has to hit Deploy once before the widget's Ship does cloud pushes. No surprise provisioning from a chat prompt.

**D5. `via: 'widget'` tag on versions.** Every `recordVersion` call from the widget path includes `via: 'widget'` in the metadata. Enables post-hoc analysis ("how many live edits landed this week?") without forking the version-history schema. Deploy-modal ships keep whatever tag they emit today (default: `via: 'deploy'`).

---

## Phase 1 — Tenants-db version history (absorbed from one-click-updates Phase 1)

**Scope:** `playground/tenants.js` extensions. All pure schema/data work, no Cloudflare calls. Mockable.

**Cycles (same as the one-click-updates plan's Phase 1, so the sister plan can still be executed later without re-doing this work):**

- **1.0** — `getAppRecord(tenantSlug, appSlug)` reader. Red: reading unknown app → `null`; reading after `markAppDeployed` → the stored row. Green: `async getAppRecord` that consults `this.cfDeploys` via a `_appKey(slug, appSlug)` helper. Refactor: extract the key builder. Commit.
- **1.1** — `recordVersion({ tenantSlug, appSlug, versionId, uploadedAt, sourceHash, migrationsHash, note, via })` appends to `versions[]`. Reject with `{ok:false, code:'APP_NOT_FOUND'}` if the row is missing. Commit.
- **1.2** — `getAppRecord` returns `versions` sorted newest-first. Shallow-copy so callers can't mutate storage. Commit.
- **1.3** — `versions[]` caps at 20 entries. Trim oldest on insert. `MAX_VERSIONS_PER_APP = 20` constant with comment. Commit.
- **1.4** — `markAppDeployed` seeds `versions[]` with the initial deploy's version and stores `secretKeys: string[]` (key names, **never** values). Commit.
- **1.5** — `updateSecretKeys({tenantSlug, appSlug, newKeys})` appends new keys, deduped. Returns `{ok:false, code:'APP_NOT_FOUND'}` if row missing. Commit.

**Phase 1 gate:** `node playground/tenants.test.js` all green; `node clear.test.js` still 2399/0; deploy flow unchanged (the fields are new but nothing reads them yet).

---

## Phase 2 — deploy-cloudflare.js: `mode: 'deploy' | 'update'` (absorbed from one-click-updates Phase 2)

**Scope:** `playground/deploy-cloudflare.js` extension. `deploySource({ ..., mode })` routes to either `_deployInitial` (current behavior, unchanged) or `_deployUpdate` (new). Tests reuse the `deploy-cloudflare.test.js` mock-CF pattern.

- **2.1** — `deploySource` accepts `mode: 'deploy' | 'update'` + `lastRecord`. `update` skips `provisionD1`, `applyMigrations`, `attachDomain`. Refactor into private `_deployInitial()` + `_deployUpdate()`. Commit.
- **2.2** — `_captureVersionId({api, scriptName})` helper. Fast path: return `result.id` from uploadScript response if present. Fallback: `listVersions` + newest by `created_on`. Returns `null` on brand-new-script indexing race (caller tolerates `null`). Commit.
- **2.3** — `_deployUpdate` calls `_captureVersionId` after successful `uploadScript`; returns `{ ok:true, versionId, mode:'update' }`. `[update] versionId-missing` warning when null. Commit.
- **2.4** — `_deployUpdate` calls `store.recordVersion` instead of `markAppDeployed`. Computes `sourceHash = sha256(source)`, `migrationsHash = sha256(migrationsBundle)`. Extract `_hashSource`/`_hashMigrations`. Commit.
- **2.5** — `_deployUpdate` filters `secrets` to keys NOT in `lastRecord.secretKeys`. Empty filtered object → skip `setSecrets` entirely. Commit.
- **2.6** — DeployLockManager already covers `(tenantSlug, appSlug)` key — add a coverage test confirming `mode:'update'` two-click scenario returns `conflict:true` on the second call. Commit.

**Phase 2 gate:** `node playground/deploy-cloudflare.test.js` all green; existing `mode:'deploy'` behavior unchanged (default stays initial path when `mode` unset).

---

## Phase 3 — Widget ship routes to cloud-update path (4 cycles, new — this is the LAE-specific glue)

**Scope:** `lib/ship.js` + `lib/edit-api.js` wiring. The Phase A `applyShip` writes `main.clear` to disk + respawns Node. In Phase B, if the app has a `tenants-db` record, that respawn is replaced by a cloud update call.

- **3.1** — `applyShip` accepts an optional `store` DI arg + `{ tenantSlug, appSlug }`. Red: when `store` + slugs are absent, behavior is unchanged (Phase A local respawn). When `store` + slugs supplied and `getAppRecord` returns `null`, still local respawn. When non-null → delegates to new `_shipToCloud` helper. Commit.
- **3.2** — `_shipToCloud({ newSource, store, tenantSlug, appSlug, deployApi })` builds the compiled bundle via `compileProgram({ target: 'cloudflare' })`, calls `deploySource({ mode: 'update', source: newSource, tenantSlug, appSlug, lastRecord, confirmMigration: true })`. Returns `{ ok, versionId, url, elapsedMs }`. The `confirmMigration: true` is the D2 auto-confirm — classifier's additive verdict IS the migration safety. Commit.
- **3.3** — `_shipToCloud` tags the recorded version with `via: 'widget'` by passing it through `deploySource` → `recordVersion`. (One-line extension to `_deployUpdate`'s recordVersion call; may need a tiny Phase 2.5b supplement cycle. Keep it in this commit if trivial.) Commit.
- **3.4** — `createEditApi` wires `/__meph__/api/ship` to pass `store + tenantSlug + appSlug` into `applyShip`. Red: POST `/__meph__/api/ship` when the target app is cloud-deployed → response includes `{mode:'update', versionId, url:'https://<slug>.buildclear.dev'}`. POST for a non-deployed app → `{mode:'local'}` (unchanged). Commit.

**Phase 3 gate:** `node playground/ghost-meph.test.js` all green; `node lib/ship.test.js` extended + green; 0 regressions in compiler suite.

---

## Phase 4 — Widget Undo → cloud rollback (3 cycles)

**Scope:** `lib/edit-api.js` + `runtime/meph-widget.js`. The Apr-18 Undo works on local snapshot. Phase B gives cloud apps a second path.

- **4.1** — `createEditApi` mounts `/__meph__/api/cloud-rollback` that accepts `{ tenantSlug, appSlug, targetVersionId }`, calls `api.rollbackToVersion({scriptName, versionId: targetVersionId})`, records the new "rollback" version via `store.recordVersion({..., note: 'widget-undo-v<N>', via: 'widget'})`. Returns `{ok, newVersionId}`. Commit.
- **4.2** — Red: widget Undo button sends `POST /__meph__/api/cloud-rollback` with the second-most-recent `versionId` from `/api/deploy-history`. Green: `runtime/meph-widget.js` Undo handler detects "app is cloud-deployed" (from the initial widget-mount response), chooses the cloud-rollback endpoint instead of local-snapshot endpoint. Commit.
- **4.3** — Error-path: rollback target version no longer exists on CF → `{ok:false, code:'VERSION_GONE'}` — widget refreshes the version list, shows a "version expired" toast. Doesn't crash the widget. Commit.

**Phase 4 gate:** `node lib/edit-api.test.js` extended + green; widget script syntax-checks; no UI regressions.

---

## Phase 5 — Docs + final smoke (2 cycles)

**Scope:** sync every doc surface touched by the CLAUDE.md Documentation Rule.

- **5.1** — Update: `intent.md` (if any new node type; likely none — this is plumbing), `SYNTAX.md` (no new syntax), `AI-INSTRUCTIONS.md` (add "widget ships cloud-update automatically when app is CF-deployed"), `USER-GUIDE.md` (new "Live edit a deployed app" section), `ROADMAP.md` (mark LAE Phase B Cloud complete), `FEATURES.md` (add row), `CHANGELOG.md` (session-dated entry), `FAQ.md` ("How does widget Ship know to push to Cloudflare?"), `RESEARCH.md` (not applicable — not a research/ranker change), `playground/system-prompt.md` (Meph doesn't need a widget-mode update — widget uses a separate restricted prompt). Commit.
- **5.2** — Live-CF smoke runbook entry: `runbooks/lae-cloud-smoke-2026-04-23.md`. Steps Marcus (or Russell) runs once the Phase 8 Cloudflare paperwork is done: (a) deploy todo-fullstack via Studio Deploy modal; (b) open the live URL; (c) log in as `owner@example.com`; (d) click widget badge; (e) ask "add a priority field 1-3"; (f) click Ship; (g) expect the field to appear on reload within 3s; (h) click Undo; (i) expect the field to disappear. Commit.

**Phase 5 gate:** docs pass grep + eyeball review; runbook reads complete.

---

## Phase 6 — Ship (1 cycle)

- **6.1** — Merge `feature/live-editing-phase-b-cloud` to main. Push. Update `HANDOFF.md` with the post-Phase-B state + the Phase-8-HITL smoke as the remaining step.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Widget ships to a slug that was deleted out-of-band from the CF dash | `uploadScript` returns 404 → fall through to the Phase A local path with a "cloud version not found, shipping locally" warning. Marcus re-runs Deploy when ready. |
| Classifier returns `additive` but a migration would actually break in-flight requests (rare race during the upload window) | Cloudflare Worker version swap is atomic at the edge — the new code either IS live or ISN'T. D1 column adds are backward-compatible by construction (SQLite lets NULL flow through). The 2-second window is safe for pure adds. |
| Two browsers with the same owner session both widget-Ship at once | `DeployLockManager` already handles — second request gets 409 with `existingJobId`. Widget surfaces "another edit in progress, try again in 10s". |
| User's token expires mid-session while the widget is open | `liveEditAuth` (just hardened in Track 2 with real HMAC verify) returns 401 — widget re-prompts for login without data loss. |
| Cloudflare API rate limit hit by a motivated owner spamming Ship | Per-tenant throttle at 10 widget-ships/min in `/__meph__/api/ship`. Return `{code:'RATE_LIMITED', retryAfterMs}`. |

---

## Success criteria

- [ ] Todo app: owner deploys to CF, opens live URL, adds `priority` field via widget, field renders on reload, wall-clock ≤ 3s from Ship click.
- [ ] CRM: owner adds `/api/archive` endpoint via widget on live CF deployment, endpoint 200s within 3s.
- [ ] Blog: owner adds `/stats` page via widget on live CF deployment, page renders.
- [ ] Widget Undo on a CF-deployed app: previous version lives again within 2s.
- [ ] Non-owner on any CF-deployed app: no widget, `/__meph__/*` returns 401.
- [ ] `node clear.test.js` + `node playground/ghost-meph.test.js` + `node playground/meph-tools.test.js` + the tenants/deploy/ship tests all green.
- [ ] Every commit ships with tests first (red → green → refactor), as per CLAUDE.md TDD rule.
- [ ] Phase 5 runbook committed so Russell can execute Phase 8 smoke without re-reading this plan.

---

## Phasing rough cut

| Chunk | Deliverable | When |
|-------|-------------|------|
| Phase 1 | Tenants-db versions | session 1 |
| Phase 2 | Deploy mode switch | session 1 |
| Phase 3 | Widget ship routes cloud | session 1 |
| Phase 4 | Widget Undo rollback | session 1-2 |
| Phase 5 | Docs + runbook | session 2 |
| Phase 6 | Ship | session 2 |

One long session per the 10x time-calibration rule; "Phase 1-3 is a week" really means "one evening." Phases 4-5 are mechanical follow-ups. The final live smoke waits on Russell's Phase 8 Cloudflare paperwork.

---

## Open questions

1. **Widget-shipped versions count toward the deploy quota?** No — quota is deploys (D1-provisioning events), widget Ship is an update. Matches the one-click-updates plan's D-decision.
2. **Does the widget need to tell Marcus "I just shipped to production"?** Yes — a small toast with the live URL + version number. Matches the one-click-updates rollback UX.
3. **Snapshot parity — should cloud widget ships ALSO take a local snapshot?** Not in Phase B. Cloud rollback uses CF's native version store; local snapshot layer is orthogonal. Revisit if Marcus wants "show me the Clear source at v3" — that's a read over the version history, not a separate snapshot.

---

## Definition of done

Marcus opens a Cloudflare-deployed todo app, types "add a priority field 1 to 3" in the floating widget, clicks Ship, and within 3 seconds sees the new field rendered on the live site. He clicks Undo; the field disappears within 3 seconds. The whole flow runs on `https://<slug>.buildclear.dev` — not a preview URL, not a new deployment. He can do this three times in a row without any deployment click.
