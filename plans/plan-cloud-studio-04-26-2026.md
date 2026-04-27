# Plan - Cloud Studio

**Date:** 2026-04-26
**Status:** after-launch plan, ready for red-team before execution
**Recommended branch when executing:** `feature/cloud-studio`
**Scope:** A customer opens `studio.buildclear.dev` in a browser and uses Clear Studio without installing anything.
**Not on current critical path:** first paying Marcus customer can use a deployed app before Cloud Studio exists.

---

## Phase Order (load-bearing)

**Default track:** do not start Cloud Studio until the first Marcus production app is live, paid, and useful. Marcus-first revenue wins now. Cloud Studio is the expansion path after that proof point.

**Execution order:** phases 0-8 must ship in order. Boundary audit before hosted shell prevents accidental internet exposure. Hosted Studio before auth is a toy. Auth before sandboxing is dangerous. Metering before hosted Meph or Publish is mandatory because those are the first phases that can burn real money.

**Escalation rule:** if any phase reveals the local Studio assumes one global user, one global app, one global child process, or one global database, stop and split that assumption into an explicit tenant-scoped interface before continuing.

| Phase | Name | Depends on | Required outcome |
|---|---|---|---|
| 0 | Cloud Studio readiness + boundary audit | first Marcus app live, paid, and useful | hosted assumptions, data boundaries, dependencies, and spend gates are written down before anything goes online |
| 1 | Hosted Studio shell | Phase 0 | `studio.buildclear.dev` loads a locked-down Studio shell behind health checks for real Phase 1 dependencies only |
| 2 | Customer accounts and workspaces | Phase 1 | every request has a tenant, user, role, and plan |
| 3 | Tenant-scoped project storage | Phase 2 | projects, source, sessions, and version history stop living in browser/local files only |
| 4 | Per-customer preview sandboxes | Phase 3 | two customers can run apps at once without sharing ports, files, env, DBs, or logs |
| 5 | Quota, metering, and hard spend caps | Phase 4 | every expensive action has a server-side plan check and hard stop before hosted AI or Publish exists |
| 6 | Hosted Meph | Phase 5 | Meph works in the browser using Clear-owned hosted AI, metered per tenant |
| 7 | Publish from Cloud Studio | Phase 6 | hosted preview can become a live Clear Cloud app after plan checks pass |
| 8 | Billing, ops, security, and beta hardening | Phase 7 | paid upgrades, abuse controls, support, backups, and rollback are safe enough for post-Marcus onboarding |

**Path B, explicitly later:** enterprise SSO, customer-hosted private Studio, regional isolation, BYO model keys, and on-prem deployments. Do not pull these into v1.

---

## The thesis

Cloud Studio is not "put the local server on the internet." That would leak state the first time two customers click Run.

Cloud Studio is Clear Cloud's builder surface. It turns today's local Studio into a tenant-aware product where each customer has:

- a login
- a workspace
- a project list
- isolated app previews
- a metered Meph session
- a Publish path to Clear Cloud
- a billing plan that controls expensive actions

The sharp opinion: build one shared Studio service at `studio.buildclear.dev`, not one Studio deployment per customer. Isolation belongs in workspace data and preview sandboxes. Per-customer Studio deployments are operational sprawl before there is proof they are needed.

---

## Locked decisions

### D1 - Reuse Clear Cloud, do not invent a second platform

Cloud Studio rides the same tenant, app, usage, deploy, and billing concepts as Clear Cloud.

Primary reuse targets:

| Surface | Current home | Cloud Studio role |
|---|---|---|
| Studio UI | `playground/ide.html` | browser product loaded from `studio.buildclear.dev` |
| Studio server | `playground/server.js` | hosted API surface, split as needed during execution |
| Tenant store | `playground/tenants.js` plus Postgres-backed layer | source of truth for accounts, teams, apps, plan, quotas |
| Billing | `playground/billing.js`, `playground/plans.js` | Stripe checkout, webhooks, quota transitions |
| Publish | `/api/deploy`, deploy builder, AI proxy | turn a hosted project into a live app |
| Meph tools | `playground/meph-tools.js` | shared tool implementations for hosted AI sessions |
| Local-AI path | `playground/ghost-meph/*` | dev/sweep path, not hosted-customer default |

### D2 - One Studio service, many preview sandboxes

`studio.buildclear.dev` is a shared control plane. App previews are separate sandboxes.

Never let hosted Studio use a single global running app, build directory, port counter, SQLite file, terminal buffer, or session log. Each preview gets a `preview_id` tied to `{tenant_id, project_id, user_id, session_id}`.

### D3 - Hosted Meph uses Clear-owned AI first

Hosted customers do not get Russell's local Claude CLI, Ollama, or OpenRouter path in v1.

Default hosted path:

```
Browser chat
  -> Studio /api/chat
  -> tenant quota check
  -> hosted AI gateway / proxy
  -> Anthropic org key
  -> metered usage row
  -> response stream back to browser
```

The local-AI path stays valuable for development, sweeps, and cost-controlled internal work. It should remain env-gated and unavailable to normal hosted customers.

### D4 - Free tier is a try-before-pay product, not free production hosting

Free should prove the magic without creating unbounded cost.

Free gets hosted Studio, templates, limited Meph, and temporary previews. Paid unlocks production Publish, team usage, higher quotas, durable preview history, and custom domains.

### D5 - The preview sandbox is disposable; the project source is durable

A preview can die at any time. The `.clear` source, chat transcript, compile history, eval output, and publish versions are durable tenant data.

This keeps cleanup aggressive without risking customer work.

### D6 - One customer data and privacy boundary

If a value came from a customer workspace or helps reconstruct customer behavior, treat it as customer data unless it is explicitly sanitized and approved for shared learning.

Customer data includes:

- `.clear` source and generated app metadata
- chat history and Meph messages
- structured tool calls and tool results
- screenshots, browser traces, preview recordings, and visual diffs
- preview logs, deploy logs, audit logs, and support notes
- uploaded files and derived text from uploads
- secrets, API keys, OAuth tokens, cookies, and environment variables
- billing state, invoices, subscription status, usage rows, and quota history
- learning-loop opt-in state and any per-workspace data-sharing policy

Rules:

- Raw customer data stays inside the workspace boundary by default.
- Secrets are encrypted, never sent to Meph unless explicitly needed, and never written to shared logs.
- Screenshots and logs are treated as customer data because they can contain source, records, tokens, or customer names.
- Billing state is customer data, but billing events can feed aggregate revenue reporting after workspace identifiers are removed.
- The global learning loop may use sanitized compile/error metadata by default.
- The global learning loop may not use source excerpts, chat text, screenshots, tool outputs, uploaded content, or logs unless the workspace has explicitly opted in.
- Support access requires an owner grant, a reason, an expiry, and an audit event.
- Export and deletion flows must cover source, chat, tool calls, screenshots, logs, secrets metadata, billing references, and learning opt-in state.

---

## Phase 0 - Cloud Studio readiness + boundary audit

**Goal:** prove Cloud Studio has a real product boundary before exposing any hosted Studio surface.

This phase is intentionally boring. It keeps the first hosted deploy from becoming a public version of Russell's laptop.

### Work

1. Inventory every local-only assumption in Studio.
   - One global user.
   - One global app.
   - One global child process.
   - One global port counter.
   - One global build directory.
   - One global SQLite file.
   - One global terminal buffer.
   - One global session log.
   - Any direct read/write of repo files for customer projects.

2. Write the hosted dependency map.
   - Phase 1 real dependencies: Studio process, static asset serving, config, TLS/domain.
   - Phase 2 adds auth/session store.
   - Phase 3 adds tenant project storage.
   - Phase 4 adds preview manager and sandbox runtime.
   - Phase 5 adds quota store, usage writer, hard spend config, and Stripe test-mode wiring if used.
   - Phase 6 adds hosted AI gateway and Anthropic org key.
   - Phase 7 adds deploy pipeline and production app records.

3. Define the customer data boundary once.
   - Use D6 as the source of truth.
   - Name the storage owner for source, chat, tool calls, screenshots, logs, secrets, billing state, and learning-loop opt-in.
   - Decide which surfaces are raw tenant data and which are sanitized global metadata.
   - Do not let later phases invent their own privacy rule.

4. Define the pre-spend gate contract.
   - Every AI call, preview allocation, upload, publish, domain action, and deploy must pass a server-side plan check before work starts.
   - Every spending path must write a usage row or fail closed.
   - Every monthly dollar cap must have a hard stop independent of the UI.
   - Stripe can be stubbed in closed beta, but the plan check cannot be stubbed.

5. Produce a go/no-go checklist.
   - If an assumption is global, Phase 1 may load a read-only shell only.
   - If customer data classification is unclear, do not store it.
   - If spend caps are unclear, do not enable hosted Meph or Publish.
   - If a dependency is not real in a phase, do not add it to that phase's health checks.

### Acceptance

- A written audit names every global Studio assumption that must be split before customer use.
- D6 is accepted as the single privacy boundary for execution.
- The dependency map says exactly which phase owns each health-check dependency.
- The pre-spend gate contract is ready before hosted Meph or Publish work begins.
- Phase 1 can be executed without accidentally implying auth, preview, AI, project storage, or billing are live.

## Phase 1 - Hosted Studio shell

**Goal:** `studio.buildclear.dev` loads the existing Studio UI from hosted infrastructure with health checks, production config, and no customer data yet.

### Work

1. Create a production deploy target for Studio itself.
   - Host the Studio server on Fly first.
   - Use `studio.buildclear.dev` as the canonical hostname.
   - Keep `buildclear.dev` for marketing/dashboard if needed.

2. Split config into explicit modes.
   - `local-dev`: current localhost behavior.
   - `hosted-studio`: cloud server, no local filesystem assumptions for customer state.
   - `test`: isolated test port and test store.

3. Add a hosted health surface.
   - `/healthz` returns process status, build id, hosted mode, asset version, and current dependency set.
   - `/readyz` returns true only when the Phase 1 shell can serve assets and reject unsafe actions.
   - Do not check tenant DB, AI gateway, preview manager, Stripe, or deploy services in Phase 1 because they are not real Phase 1 dependencies.
   - Later phases must extend the same health surface when they add real dependencies.

4. Serve `ide.html` in hosted mode without exposing dev-only actions.
   - Hide or disable raw filesystem load/save.
   - Hide any local-only path picker.
   - Keep Builder Mode as the default first screen.

5. Put the hosted shell behind Cloudflare/Fly TLS.
   - No customer auth yet, but do not expose write actions.
   - Read-only landing or login gate is acceptable for the Phase 1 smoke.

### Implementation notes

- Start in `playground/server.js` because it already owns Studio's API.
- Expect to extract hosted config helpers instead of threading env checks through every handler.
- Do not touch compiler behavior in this phase.

### Acceptance

- Opening `https://studio.buildclear.dev` returns the Studio shell.
- The shell does not let an anonymous user run, chat, publish, inspect local files, or see another user's project.
- Health checks are machine-readable, suitable for Fly, and do not fail because future-phase services are absent.

---

## Phase 2 - Customer accounts and workspaces

**Goal:** every Studio request is attached to a user, tenant/team, role, and plan.

### Work

1. Add account auth for Cloud Studio.
   - Email/password signup and login.
   - Secure session cookie.
   - Logout.
   - Password reset can wait until beta hardening if needed, but account recovery must be planned.

2. Add team/workspace membership.
   - One user can belong to multiple workspaces later.
   - MVP can create one workspace automatically at signup.
   - Roles: owner, admin, member.

3. Gate Studio routes.
   - Anonymous users can see login/signup only.
   - Owners manage billing and workspace settings.
   - Admins can create projects and publish.
   - Members can build and run previews unless plan says otherwise.

4. Attach tenant context to all expensive or stateful operations.
   - compile
   - run preview
   - chat with Meph
   - eval
   - publish
   - rollback
   - billing portal

5. Add CSRF protection for browser state-changing routes.

6. Extend health checks for real Phase 2 dependencies.
   - Add auth/session store readiness.
   - Add tenant membership store readiness.
   - Do not add project storage, preview, AI, billing, or deploy checks yet.

### Implementation notes

- Reuse Clear's existing tenant and billing concepts instead of adding a parallel auth database.
- Auth for Studio is separate from auth inside generated customer apps.
- Generated app login protects Marcus's end users. Studio login protects Marcus's builders.

### Acceptance

- User signs up, lands in their own workspace, and sees no other workspace data.
- Logged-out requests to state-changing Studio routes fail.
- Role checks block billing and dangerous actions for non-owners.

---

## Phase 3 - Tenant-scoped project storage

**Goal:** hosted customers can create, edit, leave, return, and recover projects without relying on local browser state or Russell's laptop filesystem.

### Work

1. Add durable project records.
   - `projects`: tenant, owner, name, slug, created/updated timestamps.
   - `project_versions`: source text, source hash, author, reason, created timestamp.
   - `studio_sessions`: active chat/build session metadata.

2. Store `.clear` source server-side.
   - MVP can store source text in Postgres.
   - Object storage can wait until projects become large.
   - Every successful save creates a version row.

3. Move chat transcripts into tenant-scoped storage.
   - Keep enough detail for replay and support.
   - Redact secrets and customer data where possible.
   - Store tool calls as structured rows, not only text blobs.
   - Apply D6 to chat text, tool inputs, tool outputs, screenshots, preview logs, and support notes.
   - Store the workspace learning-loop opt-in state next to the workspace, not inside a chat transcript.

4. Preserve export.
   - Customer can download/export the `.clear` source and deployment bundle.
   - Portability is part of Clear's promise.

5. Add project list and open-project flow.
   - New project from template.
   - Duplicate project.
   - Archive project.
   - Restore archived project.

6. Extend health checks for real Phase 3 dependencies.
   - Add tenant project storage readiness.
   - Add version storage readiness.
   - Do not add preview, AI, billing, or deploy checks yet.

### Implementation notes

- Local Studio can keep using local files.
- Hosted Studio must not read or write repo files for customer projects.
- The source-of-truth remains `.clear` source, not generated output.

### Acceptance

- Refreshing the browser does not lose source, chat history, or project state.
- Two users in different workspaces can create projects with the same slug without collision.
- Export returns the current `.clear` source and enough metadata to rebuild elsewhere.

---

## Phase 4 - Per-customer preview sandboxes

**Goal:** customers can click Run App in hosted Studio and get isolated previews that cannot collide.

### Work

1. Replace global preview state with a preview manager.
   - Input: tenant, project, user, source, requested action.
   - Output: preview id, preview URL, status, logs, app metadata.

2. Allocate one sandbox per active preview.
   - Use a unique build directory.
   - Use a unique port or internal service route.
   - Use a unique database.
   - Use unique secrets.
   - Use a strict lifetime.

3. Route iframe previews through Studio.
   - Browser iframe loads a URL tied to `preview_id`.
   - Studio proxy validates tenant access before forwarding.
   - Direct preview URLs expire or require signed access.

4. Isolate runtime data.
   - SQLite file per preview for MVP.
   - Postgres schema/database per preview if the app declares Postgres.
   - No shared uploads directory.
   - No shared `process.env` beyond explicitly allowed runtime config.

5. Add resource limits.
   - CPU limit per preview.
   - Memory limit per preview.
   - Process count limit per preview.
   - File descriptor limit per preview.
   - Disk quota per preview.
   - Wall-clock startup timeout.
   - Idle shutdown timeout.
   - Max stdout/stderr log size.

6. Add network egress controls.
   - Default deny outbound network from preview code.
   - Allowlist only the services needed for declared integrations.
   - Block access to Fly metadata, cloud metadata, private network ranges, local host services, and internal Studio APIs.
   - Rate-limit allowed outbound calls.
   - Log destination host, status, and byte count without logging secrets or request bodies.

7. Add upload controls.
   - Per-file size cap.
   - Per-preview and per-workspace storage cap.
   - MIME sniffing instead of trusting file extensions.
   - Block executable uploads by default.
   - Store uploads in a preview-scoped location.
   - Delete preview uploads during preview cleanup unless explicitly promoted to production.

8. Add abuse controls.
   - Per-user and per-workspace run rate limits.
   - Per-IP throttles for anonymous or pre-auth surfaces.
   - Kill runaway previews automatically.
   - Refuse nested server spawning and background daemons.
   - Refuse preview start when quota checks fail.
   - Keep an abuse event trail without storing raw customer data unnecessarily.

9. Add cleanup.
   - Idle preview shutdown.
   - Hard max lifetime.
   - Disk quota.
   - Log retention cap.
   - Cleanup must never delete durable project source.

10. Add concurrency control.
   - Free: one active preview per workspace.
   - Paid Team: multiple active previews.
   - Same project cannot have two write-publishing preview operations racing.

11. Extend health checks for real Phase 4 dependencies.
   - Add preview manager readiness.
   - Add sandbox runtime readiness.
   - Add cleanup worker liveness.
   - Do not add AI, Stripe, or deploy checks yet.

### Implementation notes

- This is the highest-risk phase.
- Today Studio's run path assumes one current child process and one current port.
- That assumption is fine locally and wrong in the cloud.
- Extract the preview lifecycle before adding more hosted features.

### Acceptance

- Customer A and Customer B can both run apps at the same time.
- Their preview ports, files, databases, logs, and env vars are distinct.
- Killing one preview does not affect the other.
- A preview cannot read another preview's data through app code, tool calls, logs, or uploads.
- A runaway preview hits CPU, memory, process, disk, network, upload, or lifetime limits before it can harm Studio.
- Network egress is denied unless explicitly allowed for a declared integration.

---

## Phase 5 - Quota, metering, and hard spend caps

**Goal:** every expensive action is plan-aware before hosted Meph or Publish can spend money.

This phase moves cost control before the expensive features. Do not ship hosted Meph first and promise to add caps later.

### Opinionated tier boundaries

| Capability | Free | Team | Business | Enterprise |
|---|---:|---:|---:|---:|
| Studio users | 1 | 5 included | 25 included | custom |
| Projects | 3 | unlimited reasonable use | unlimited | custom |
| Active preview sandboxes | 1 | 3 | 10 | custom |
| Monthly Meph messages | 50 | 2,000 | 10,000 | custom |
| Monthly hosted AI spend | hard $ cap | higher hard $ cap | negotiated hard $ cap | custom |
| Preview CPU/memory budget | small | medium | larger | custom |
| Upload/storage budget | small | medium | larger | custom |
| Production publishes | temporary/demo only | included | included | included |
| Custom domains | no | one per app | yes | yes |
| Team invites | no | yes | yes | yes |
| Audit logs | no | basic | full | full plus export |
| SSO | no | no | later | yes, Path B |
| BYO model key | no | no | later | yes, Path B |

### Work

1. Build one server-side plan service.
   - The plan badge is not decorative.
   - Each route checks the same plan service.
   - Missing plan means deny, not allow.
   - Closed beta may assign plans manually, but the enforcement path must be real.

2. Meter every spendable action.
   - AI input tokens, output tokens, cache reads, cache writes, and dollars.
   - Preview CPU seconds, memory tier, lifetime, and active sandbox count.
   - Upload bytes, storage bytes, and retained log bytes.
   - Publish builds, deploys, custom domains, and rollback operations.
   - Network egress host and byte count.
   - Seats, projects, and workspace membership.

3. Add hard caps.
   - Per-workspace monthly AI dollar cap.
   - Per-workspace preview runtime cap.
   - Per-workspace active preview cap.
   - Per-workspace upload/storage cap.
   - Per-workspace publish/deploy cap.
   - Per-IP abuse cap for signup and preview creation.
   - Global emergency kill switch for hosted AI.
   - Per-workspace emergency disable for previews, uploads, AI, and Publish.

4. Enforce quotas before work starts.
   - Chat quota before any AI request starts.
   - Preview quota before sandbox allocation.
   - Upload quota before accepting bytes.
   - Publish quota before build/deploy begins.
   - Storage quota before saving new project versions.
   - Egress quota before allowing outbound preview calls.
   - Direct API calls must hit the same checks as UI actions.

5. Wire billing early enough for the checks to mean something.
   - Stripe test-mode checkout for Free to Team upgrade.
   - Billing portal.
   - Webhook-driven subscription state.
   - Grace period for failed payments.
   - Manual admin override for closed beta.

6. Make limits legible.
   - Show remaining Meph messages and AI budget.
   - Show active preview count.
   - Show upload/storage usage.
   - Show upgrade action where blocked.
   - Never make the user guess why a button failed.

7. Add internal cost reporting.
   - Per tenant.
   - Per workspace.
   - Per project.
   - Per model.
   - Per preview.
   - Per day and month.

8. Extend health checks for real Phase 5 dependencies.
   - Add quota store readiness.
   - Add usage writer readiness.
   - Add hard spend cap config presence.
   - Add Stripe test-mode readiness only if Stripe is wired in this phase.
   - Do not add AI gateway or deploy checks yet.

### Acceptance

- A Free user hits a Meph limit and sees upgrade, not failure.
- A Team user pays through Stripe test mode and immediately gets higher limits.
- A canceled or past-due account moves to grace, then restricted mode.
- Quota checks cannot be bypassed by direct API calls.
- Hosted Meph cannot start unless the AI spend cap is present and enforceable.
- Publish cannot start unless plan and deploy quotas pass before build work begins.

---

## Phase 6 - Hosted Meph

**Goal:** Meph works for hosted customers through Clear-owned hosted AI, with tenant-scoped tools and metered usage.

### Work

1. Put a hosted AI gateway in front of all customer Meph calls.
   - Use Clear's Anthropic org key.
   - Use prompt caching by default.
   - Use the Phase 5 plan service before any request starts.
   - Meter input, output, cache read, cache write, and dollars through the Phase 5 usage writer.
   - Fail closed if usage writing is unavailable.

2. Make Meph tool execution tenant-scoped.
   - Compile tool reads the tenant project's current source.
   - Edit tool writes a tenant project version.
   - Run/test tools operate only against that tenant's preview sandbox.
   - HTTP request and DB inspection target only the active preview.
   - Screenshot/browser tools target only the active preview.

3. Translate the local-AI path.
   - Keep `MEPH_BRAIN=cc-agent`, Ollama, and OpenRouter as local/dev/sweep backends.
   - In hosted mode, ignore customer attempts to set local backends.
   - Do not spawn the Claude CLI in hosted customer sessions.
   - Do not connect hosted customers to Russell's local subscription.

4. Preserve the Factor DB flywheel without leaking customer data.
   - Store raw customer transcripts only under tenant-scoped access.
   - Feed sanitized compile/error metadata into the global learning path.
   - Require explicit policy before using customer source excerpts as global examples.
   - Default raw customer artifacts to not shared.
   - Require per-workspace opt-in before raw source, chat, screenshots, tool outputs, uploads, or logs enter the learning loop.

5. Honor the pre-spend gates.
   - Per-turn max tokens come from Phase 5 plan policy.
   - Per-month AI dollar budgets come from Phase 5 hard caps.
   - Per-minute rate limits come from Phase 5 abuse controls.
   - Tool call caps come from Phase 5 plan policy.
   - Hard stop when quota is exhausted.

6. Extend health checks for real Phase 6 dependencies.
   - Add hosted AI gateway readiness.
   - Add Anthropic org-key presence without exposing the key.
   - Add AI usage writer readiness through the Phase 5 check.
   - Do not add deploy checks yet.

### Implementation notes

- Shared tool logic belongs in `playground/meph-tools.js`.
- Do not recreate the server-side side-effect bug where one caller path logs usage and another does not.
- Any usage or learning side effect belongs inside the shared tool or shared gateway path.

### Acceptance

- Hosted Meph can build, compile, run, test, and edit a project in one browser session.
- Usage is visible on the tenant's account.
- A quota-exhausted tenant gets a clean upgrade prompt, not a server error.
- Local-AI backends still work locally, but are not exposed to hosted users.

---

## Phase 7 - Publish from Cloud Studio

**Goal:** a hosted preview can become a live Clear Cloud app without leaving the browser.

### Work

1. Wire hosted project records to Clear Cloud app records.
   - Project can have zero or one primary deployed app for MVP.
   - Later, allow environments: preview, staging, production.

2. Reuse the existing deploy pipeline.
   - First publish provisions the app.
   - Later publish updates the same app.
   - Version history is written back to the tenant project.

3. Add production deploy permissions.
   - Owners and admins can publish.
   - Members can request publish or publish only if workspace setting allows it.

4. Connect preview state to publish state.
   - Publish uses the current saved source, not unsaved editor text.
   - UI warns if preview is newer than saved source.
   - UI blocks publish if compile/test state is stale.

5. Preserve rollback.
   - Rollback from Studio version history.
   - Rollback creates a new visible history entry.
   - Rollback does not mutate preview sandbox data.

6. Extend health checks for real Phase 7 dependencies.
   - Add deploy pipeline readiness.
   - Add production app record store readiness.
   - Add domain/deploy provider readiness if Publish uses it directly.

### Acceptance

- Customer signs in, opens a project, runs preview, clicks Publish, gets a live `*.buildclear.dev` URL.
- Second publish updates the existing app and preserves the URL.
- Rollback works from hosted Studio.
- Free-tier publish limits are enforced before expensive deploy work starts.

---

## Phase 8 - Billing, ops, security, and beta hardening

**Goal:** Cloud Studio is safe enough for after-launch customers who are not sitting next to Russell.

### Work

1. Add audit logs.
   - Login.
   - Project create/archive/restore.
   - Source version created.
   - Meph edit applied.
   - Preview started/stopped.
   - Publish/update/rollback.
   - Billing plan changed.

2. Add observability.
   - Request logs with tenant id, not raw customer data.
   - Preview lifecycle events.
   - AI usage and failure rates.
   - Sandbox cleanup metrics.
   - Deploy success/failure rates.

3. Add abuse protection.
   - Signup throttles.
   - Per-IP and per-tenant rate limits.
   - Bot protection for public signup.
   - Preview CPU/memory/process limits.
   - Upload size limits.

4. Add support tools.
   - Owner can grant temporary support access.
   - Support access is logged.
   - No silent staff access to customer source.

5. Add backup and restore.
   - Tenant DB backups.
   - Project source restore.
   - Billing data reconcile path.
   - Preview data is not backed up unless promoted to production.

6. Harden billing for beta.
   - Stripe webhook replay is idempotent.
   - Subscription state reconciles against Stripe.
   - Manual beta overrides expire.
   - Restricted mode is tested for canceled, past-due, and over-cap workspaces.

### Acceptance

- Support can diagnose a failed publish without seeing secrets.
- A stuck preview is killed automatically.
- A runaway customer cannot burn unlimited AI or compute.
- Beta onboarding has a rollback plan for source, billing state, and deployed apps.

---

## Test strategy for execution

No tests are needed to create this plan file. When the plan is executed, each phase needs tests because this touches auth, billing, isolation, AI spend, and customer data.

Minimum execution gates:

| Phase | Required checks |
|---|---|
| 0 | readiness checklist review, dependency map review, privacy boundary review, pre-spend contract review |
| 1 | hosted shell health check, future dependency absence, anonymous write-route denial |
| 2 | signup/login/logout, role checks, CSRF failures, auth health extension |
| 3 | project save/reopen/version/export, customer data export/delete, project storage health extension |
| 4 | two-tenant concurrent preview isolation, CPU/memory/process limits, network deny, upload caps, cleanup worker |
| 5 | Stripe test-mode checkout, webhook replay idempotency, usage writer fail-closed, quota enforcement, hard spend caps |
| 6 | hosted Meph build loop, quota-exhausted path, local-AI not exposed, AI health extension |
| 7 | publish/update/rollback from hosted project, plan checks before deploy work, deploy health extension |
| 8 | audit log coverage, support access audit, billing reconcile, rate-limit behavior |

Full ship gate:

- `node clear.test.js`
- Studio server tests
- billing tests
- quota and hard-cap tests
- tenant store tests
- preview sandbox isolation tests
- customer data/privacy boundary tests
- hosted Meph eval with spending estimate posted first
- browser smoke against `studio.buildclear.dev`

---

## Data model sketch

This is not final SQL. It names the objects workers should expect to create or extend.

| Table | Purpose |
|---|---|
| `users` | login identity |
| `workspaces` | tenant/team boundary |
| `workspace_members` | user roles inside a workspace |
| `projects` | Studio project metadata |
| `project_versions` | durable `.clear` source history |
| `studio_sessions` | Meph/build session metadata |
| `studio_tool_calls` | structured tool call log |
| `preview_sandboxes` | active and historical preview lifecycle |
| `workspace_privacy_settings` | learning-loop opt-in and data-sharing policy |
| `secret_refs` | encrypted secret metadata, not raw secret logs |
| `upload_objects` | preview or production upload metadata |
| `usage_rows` | AI, preview, publish, storage usage |
| `audit_events` | security and support trail |
| `billing_customers` | Stripe customer/subscription mapping |

Rules:

- Every row except `users` must carry `workspace_id` or derive it through a strict foreign key.
- No route should accept `workspace_id` from the browser without verifying membership.
- No preview sandbox should be addressable by an unscoped integer id.
- Use opaque ids in URLs.
- Data covered by D6 must have an export/delete story or an explicit retention exception.
- Raw secrets are never stored in logs, tool rows, screenshots, or learning rows.

---

## Meph hosted translation detail

### Local today

Local Studio can use:

- direct Anthropic API calls from the Studio server
- `MEPH_BRAIN=cc-agent` through the Claude CLI
- Ollama
- OpenRouter
- MCP tool server for local/sweep tool use
- local SQLite Factor DB
- local child app preview

### Hosted v1

Hosted Studio should use:

- Clear-owned Anthropic org key
- hosted AI gateway/proxy
- tenant usage rows
- tenant-scoped tool context
- preview sandbox id instead of local child process globals
- sanitized learning events for the shared flywheel

### Explicit no

Hosted v1 should not:

- spawn a local Claude CLI for customers
- depend on Russell's machine
- let customers set `MEPH_BRAIN`
- let one tenant's errors become another tenant's raw prompt context
- let tool calls operate outside the active preview sandbox

---

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Local globals leak into hosted mode | two customers collide or see shared state | Phase 4 blocks on removing global preview assumptions |
| AI spend runs away | hosted Meph can burn real dollars fast | Phase 5 quotas before calls, hard monthly caps |
| Billing checks live only in UI | direct API calls bypass plan limits | enforce in server route and shared service |
| Preview sandboxes become mini production apps | cleanup and cost spiral | CPU, memory, process, network, upload, and TTL limits |
| Factor DB leaks customer source | breaks trust early | D6 boundary, sanitized global learning rows, explicit learning opt-in for raw excerpts |
| Screenshots or logs leak customer data | support/debug artifacts can contain source, records, or secrets | treat them as customer data under D6 |
| Auth inside generated apps confused with Studio auth | wrong security model | keep Studio auth and app auth explicitly separate |
| Free tier attracts abuse | cloud compute is exposed | strict quotas, signup throttle, no free production hosting |

---

## Out of scope for Cloud Studio v1

- SSO/SAML.
- Per-customer private Studio deployments.
- On-prem Studio.
- Bring-your-own Anthropic/OpenAI key.
- Multi-region data residency.
- Real-time collaborative editing.
- Marketplace templates.
- Public project sharing.
- Production app observability beyond what Clear Cloud already needs.

---

## Resume prompt for executor

> Read `plans/plan-cloud-studio-04-26-2026.md` end-to-end before executing. The Phase Order block is load-bearing: do not start Cloud Studio until the first Marcus production app is live, paid, and useful. Execute phases 0-8 in order. The critical path is readiness + boundary audit -> hosted shell -> auth/workspaces -> durable project storage -> preview sandbox isolation -> quota/metering/hard spend caps -> hosted Meph -> Publish -> beta hardening. Do not expose local-AI backends to hosted customers. Do not enable hosted Meph or Publish before Phase 5 gates pass. Do not let preview state use global child process, port, build directory, DB, env, terminal buffer, logs, uploads, or network egress. Red-team this plan before coding.

---

## Definition of done

A new customer can open `studio.buildclear.dev`, sign up, create a project from a template, ask Meph to change it, run an isolated preview, publish it to a live Clear Cloud URL, hit a free-tier limit, upgrade through Stripe, and keep building without installing anything.

Two customers can do that at the same time without sharing source, preview data, ports, files, logs, uploads, network access, AI usage, billing state, learning-loop settings, or deployed apps.
