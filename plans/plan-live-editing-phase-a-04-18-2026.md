# Plan — Live App Editing, Phase A

**Date:** 2026-04-18
**Branch:** `feature/live-editing-phase-a`
**Scope:** LAE-1, LAE-2, LAE-3 (additive changes only), LAE-7
**Effort:** ~1 week
**Success:** Marcus opens a running todo/crm/blog app, types "add a field called X", sees a diff, clicks ship, field appears after reload. No developer involved. No other code touched.

---

## Goal

Prove the core loop: **owner talks to running app, ships additive changes live, nothing breaks.**

Phase A deliberately leaves the harder safety problems (state preservation, rollback, destructive-change migrations) for later phases. We ship the narrowest thing that is already differentiated: *nobody else lets an owner edit a running app via chat with classifier-enforced additive-only safety.*

## Out of scope (deferred to later phases)

| Deferred | Phase |
|---|---|
| State preservation on reload (Jenna's half-filled form) | B |
| Snapshot + one-sentence rollback | B |
| Dry-run preview URLs | B |
| Reversible changes: hide a field, rename (expand+copy+hide), reorder, relabel | B |
| Destructive changes: permanent delete, breaking type changes | C |
| Schema migration planner for unavoidable type coercions | C |
| Change log / audit trail | D |
| Concurrent edit guard | D |

In Phase A the classifier refuses to ship anything but additive. If Meph proposes a rename or removal, the widget tells the user "that's Phase B/C, not available yet."

---

## What "remove" means in Clear (semantic lock-in for all phases)

This is the design decision that makes the later phases safe. Writing it down now so Phase A is built on the right foundation and Phase B/C don't require redesigning the classifier.

**Default "remove" = hide, not delete.** When a user says "remove the notes field," Clear marks the field `hidden: true` in the schema. UI renderers skip it, forms stop requiring it, API responses stop returning it. **The column stays in the database.** Data is preserved. One-click "put it back" is free because the data never went anywhere.

**Default "rename" = expand + copy + hide.** "Rename notes to reason" becomes mechanically:
1. Add new field `reason` (additive, safe)
2. Copy every existing row's `notes` value into `reason`
3. Hide `notes`
4. Update any form/page referencing `notes` to reference `reason`

Rollback is the reverse: un-hide `notes`, hide `reason`. Nothing is ever dropped. Classified as **reversible**, not destructive.

**Permanent delete is a separate, gated command.** Only two use cases justify it:
1. Compliance — GDPR or data-retention rule requires physical erasure
2. Name reuse — user hid `notes`, now wants a new field called `notes` with a different type

For these, the widget shows a **second-tier confirmation** ("Permanently delete `notes` — this cannot be undone. Type DELETE to confirm.") Takes a table snapshot via Phase B's snapshot machinery, logs who+when+why in the audit trail, then drops the column. Classified as **destructive**.

**Why this matters for the 14-year-old test.** "I removed the field, but if I change my mind the data is still there." That matches how a non-engineer thinks about deletion — like the trash can on their desktop. The expand-and-contract machinery is underneath, but they never see it. It's why they can move fast without fear.

**Phase A implication.** Phase A doesn't ship remove or rename. But it ships the AST with a `hidden` property on fields from day one, so Phase B's "hide" is a literal one-line AST change, not a schema overhaul. The classifier checks for `hidden` transitions even though Phase A never produces them.

---

## What we're building

### 1. Owner role
- Reuse the existing `role` primitive. A user with `role: 'owner'` is the owner.
- No new parser keyword. Just a documented convention: apps mark one user as `role: 'owner'` via the auth table.
- **Why reuse:** every second spent on a new keyword is a second not spent on the widget. We can upgrade to a dedicated `owner is 'email'` keyword in Phase B if the UX demands it.

### 2. Meph widget served by the app itself
- The compiler emits a conditional `<script src="/__meph__/widget.js">` tag in the app's HTML.
- The script only loads if the current session's role is `owner`. Non-owners never see the widget; the tag is a no-op for them.
- Widget = floating badge (bottom-right) + collapsible dark chat panel. Same vibe as the landing page mock.

### 3. Restricted tool palette for widget-mode Meph
Three tools only, all additive-by-construction:
- `propose_add_field(table, field_name, field_type, options?)` — emits `a <name>` line inside the table block, or `a <name> from 'a', 'b'` for dropdowns.
- `propose_add_endpoint(path, method, description)` — emits a `when user sends to /path:` block at the appropriate section.
- `propose_add_page(path, title, description)` — emits a `page '/path' titled '…':` block.

**No** `edit_code` / `write_file` / `run_command`. This is the hard safety guarantee: Meph literally cannot delete or rewrite code in widget mode. The tool palette is the guard.

### 4. Change classifier
- Input: AST(before) + AST(after)
- Output: `{ type: 'additive' | 'reversible' | 'destructive', changes: [...], effect_summary: '…' }`
- Rules (final Phase A–C taxonomy, written down now so we don't redesign later):
  - **additive** — adds a field, page, or endpoint. Nothing existing is altered. *Always safe.*
  - **reversible** — hides a field, renames a field (expand-then-hide), relabels a UI element, reorders columns. Data is preserved; the change can be undone with one click because nothing was ever actually deleted.
  - **destructive** — permanently deletes a field or table, or changes a type in a way that can't cleanly coerce existing rows. Only triggered by an explicit "permanently delete" command. Requires snapshot + confirmation + audit.
- Phase A ships additive only. If Meph proposes reversible or destructive, the widget returns "This requires Phase B/C — not yet available." Meph's system prompt forbids proposing non-additive in widget mode.

### 5. Diff preview UI in the widget
- Before shipping: show source diff (added lines highlighted) + effect summary ("adds 1 field, 1 dropdown, 1 column, backfills 12 rows with default").
- Two buttons: **Ship it** (indigo primary) and **Cancel**.
- Dry-run is deferred to Phase B.

### 6. Ship action
1. Write new `.clear` source to `main.clear` on the app server's filesystem.
2. Trigger recompile.
3. If compile succeeds: gracefully stop the old running server child, spawn a new one with the new compiled output, wait for readiness probe, return success.
4. If compile fails: keep old server running, return error to widget with message.
5. Connected clients receive a reload signal via SSE and reconnect.

Known limitation: clients lose in-flight form state on reload. Documented explicitly in Phase A. Phase B fixes this.

---

## Architecture sketch

```
Running app server (Node process)
├── /*                    — normal app routes
├── /__meph__/widget.js   — widget bundle, served only if session.role === 'owner'
├── /__meph__/api/propose — { prompt } → Meph call with restricted toolset → { diff, summary, classification }
├── /__meph__/api/ship    — { diff } → writeFile main.clear → recompile → respawn → { ok, elapsed_ms }
└── /__meph__/api/cancel  — clear pending proposal state
```

The Meph chat endpoint under `/__meph__/api/propose` is a thin wrapper around the existing Meph infrastructure in `playground/server.js`, but:
- Uses a different system prompt (widget-mode, not Studio-mode).
- Exposes only the three `propose_*` tools.
- Runs the classifier before returning — rejects anything that isn't additive.

---

## TDD cycles (in order)

1. **Classifier — additive detection.** Given `AST(before)` + `AST(after)` where `after` adds a new field to a table, returns `{type: 'additive', changes: [{kind: 'add_field', table: 'Todos', name: 'priority'}]}`. Write failing test, implement, green. Add cases: new endpoint, new page, new field with default.

2. **Classifier — reversible + destructive detection.** Rename field → `reversible`. Remove field → `destructive`. Change type → `destructive`. Required-without-default added → `destructive` (because it breaks existing rows).

3. **Owner middleware.** Request to `/__meph__/*` without owner session → 403. With owner session → 200. Unit test on the middleware in isolation.

4. **Tool: `propose_add_field`.** Given `(table='Todos', name='priority', type='number', options=['1','2','3'])`, returns new source string with `a priority from 1, 2, 3` inserted inside the `Todos` table block. Verify AST diff of before-and-after is purely additive.

5. **Tool: `propose_add_endpoint`.** Given `(path='/api/archive', method='POST', description='archive a todo by id')`, returns new source with an endpoint block appended. Additive per classifier.

6. **Tool: `propose_add_page`.** Given `(path='/stats', title='Stats', description='show count of todos by status')`, returns new source with a page block. Additive per classifier.

7. **`/propose` endpoint integration.** POST `{prompt: "add priority field"}` → the endpoint calls Meph with restricted tools → Meph picks `propose_add_field` → classifier confirms additive → endpoint returns `{diff, summary, classification}`. Integration test with Meph mock; real-Meph test added at end.

8. **`/ship` endpoint.** POST `{diff}` → writes file → recompiles → respawns server → returns `{ok: true, elapsed_ms}`. Test with fake compile + fake spawn harness. Recompile-failure path: returns `{ok: false, error}` and old server keeps running.

9. **Widget render.** Compile a test app with `role: 'owner'`. Owner session → badge + widget markup present in HTML. Non-owner session → both absent.

10. **End-to-end: todo app.** Start running todo app. Log in as owner. Open widget. Type "add a priority field, 1 to 3." Confirm diff shows added line. Click Ship. Assert: (a) `main.clear` now contains `a priority`, (b) server restarted within 2s, (c) the todo form on reload shows the new input. Playwright.

11. **End-to-end: crm + blog templates.** Same flow, different templates. Add endpoint to crm, add page to blog. Both ship without manual intervention.

12. **Safety — classifier refuses non-additive.** Owner types "remove the priority field." Meph is instructed to refuse; classifier would reject anyway. Assert widget shows the right error, no file written.

Each cycle: red → green → refactor. No batching.

---

## Key files touched

### New files
- `runtime/meph-widget.js` — widget bundle (floating badge + chat panel + SSE reload listener). Single file, vanilla JS.
- `runtime/edit-tools.js` — the three `propose_*` tools.
- `runtime/change-classifier.js` — AST-diff classifier.
- `runtime/edit-api.js` — the four `/__meph__` endpoint handlers, mountable on any compiled app server.

### Modified
- `parser.js` — no change if we reuse `role`; add `role: 'owner'` as a first-class documented value.
- `compiler.js` — emit `<script src="/__meph__/widget.js">` conditionally in HTML; mount `edit-api` handlers on the generated Node server when the app declares `allow signup and login`.
- `playground/system-prompt.md` — Meph needs a widget-mode variant. Tight instructions: "You have three tools. You propose, you never ship. You never offer to remove or rename."
- `playground/server.js` — expose a widget-mode Meph invocation path. Most logic reused.
- `apps/todo-fullstack/main.clear`, `apps/crm-pro/main.clear`, `apps/blog-fullstack/main.clear` — declare `role: 'owner'` on one user for e2e tests.

---

## Success criteria

- [ ] Todo app: owner adds `priority` field via widget, ships it, field renders on reload.
- [ ] CRM: owner adds `/api/archive` endpoint, ships, endpoint responds 200.
- [ ] Blog: owner adds `/stats` page, ships, page renders.
- [ ] Non-owner on any of the three templates: no widget visible, `/__meph__/*` returns 403.
- [ ] Classifier refuses to ship a rename ("This requires Phase B").
- [ ] Classifier refuses to ship a removal ("This requires Phase C").
- [ ] `node clear.test.js` + `node playground/server.test.js` both green.
- [ ] New file `playground/live-editing.test.js` covers cycles 1–12.
- [ ] Manual run-through: I can ship 3 additive changes in a row to a running app without restarting anything myself.

---

## Open questions

1. **Hot-swap vs process restart on ship?** Restart is simpler (~500–800ms, breaks WebSocket connections, form state lost). Hot-swap requires the runtime to be able to replace route handlers without restart — complex but needed for Phase B anyway. **Decision for Phase A: restart.** Document state loss as known limitation. Phase B introduces hot-swap.

2. **Where does widget-mode Meph get the current source?** Two options: (a) read `main.clear` from disk on each request, or (b) cache in memory and invalidate on ship. **Decision: disk read.** Simpler, zero cache-staleness bugs, and a .clear file is tiny.

3. **How does the compiled app know where its own `main.clear` is?** The compiler emits the source path into the generated server. The running server knows its own file.

4. **One owner or a list?** Phase A: one owner email on the User record, checked via `role === 'owner'`. Phase B can add admin role support.

5. **What happens if `main.clear` fails to compile after Meph's change?** Never hit production — classifier already ran against the ASTs, which means we compiled once before writing. Remaining risk is a race. Mitigate: `/ship` compiles again after write, rolls back the file on failure.

---

## Risks

| Risk | Mitigation |
|---|---|
| Meph proposes "additive" change that breaks existing rows (required field, no default) | Classifier rejects required-without-default as destructive. Meph instructed to include defaults. |
| Recompile succeeds but new server fails to start | Health probe on new child before killing old. If new doesn't bind port in 3s, keep old, return error to widget. |
| Owner session forgery | Reuses existing `login` JWT — no new auth surface. Same attack surface as the rest of the app. |
| Classifier has a bug and misclassifies destructive as additive | Phase A tool palette is already additive-only (Meph can't call `remove_field`). Even if the classifier is wrong, the tools can't delete. Two layers of safety. |
| Client reconnect loop after ship | Server sends a single `reload` SSE event; client reloads once; reloaded page has new version → no further reload signal. Debounced. |

---

## Phasing within Phase A (day-by-day rough cut)

| Day | Deliverable |
|---|---|
| Mon | Classifier + owner middleware (cycles 1–3). |
| Tue | Three `propose_*` tools (cycles 4–6). |
| Wed | `/propose` + `/ship` endpoints, widget skeleton served (cycles 7–9). |
| Thu | End-to-end on todo app (cycle 10). |
| Fri | End-to-end on crm + blog, safety refusal tests (cycles 11–12). Red-team pass. Merge. |

If classifier eats more than a day, push e2e coverage of crm/blog to Phase B. Don't sacrifice TDD pace to hit Friday — pace matters, we have time.

---

## Definition of done

Marcus (the user) opens the running todo template, clicks "Edit this app," types a sentence, clicks Ship, and sees the change live within 3 seconds of clicking. He can do this three times in a row without any rollback-due-to-breakage. Non-owners see no edit surface at all.
