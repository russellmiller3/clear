# Queue Primitive (Tier 1) — Approval Queue Language Feature

**One-line goal:** add `queue for X:` to Clear so a 10-line declaration generates the queue page + action buttons + audit table + notifications + URL handlers + standard tests, eliminating the 90% structural duplication across the 5 Marcus apps.

**Branch:** `feature/queue-primitive-tier1`. Create fresh; do NOT continue on `deal-desk-uat` (that branch's pipeline work becomes the first MIGRATION TARGET in Phase 8 once the primitive lands).

**Source of authority:** `snapshots/marcus-market-evidence-04-27-2026.md` (research) + `snapshots/marcus-primitives-decomposition-04-27-2026.md` (decomposition). Read both before executing.

---

## Phase Order (load-bearing)

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| 1 | A | none | required: parser + AST node `QUEUE_DEF` for `queue for X:` block |
| 2 | A | Phase 1 | required: compiler emits auto-generated `<Entity>Decisions` + `<Entity>Notifications` tables |
| 3 | A | Phase 2 | required: compiler emits auto-generated URL handlers (filtered GET + decision PUTs) |
| 4 | A | Phase 3 | required: compiler emits auto-generated UI elements (action buttons + history tables) |
| 5 | A | Phase 1 | required: validator catches malformed queue declarations |
| 6 | A | Phases 1-5 | required: docs cascade across 11 surfaces |
| 7 | A | Phases 1-6 | required: all 8 core templates still compile clean (no regressions) |
| 8 | A | Phases 1-7 | required: migrate Deal Desk app to use the new primitive |

**Default track:** Path A — single-stage queue only (one reviewer, one actions list, sequential decisions).

**Escalation track:** B (deferred) — multi-stage queues (`stage 'X' with reviewer 'Y'` sub-blocks) gated on a SECOND workflow app being built (likely expense tracker).

**Why this order:** parser before compiler before UI before docs. Each phase has a green-tests gate. Phase 8 (migrate Deal Desk) is the proof-of-value — if Deal Desk shrinks from ~170 lines to ~60 AND keeps all functionality, the primitive earns its keep.

---

## Execution Rules

- **Plan quality bar:** the stupidest LLM that can follow instructions must execute this completely. Every cycle has exact test command, exact test code, exact expected red, exact GREEN steps, exact success evidence.
- **REVIEW FREEZE:** do not execute this plan until Russell reviews it and explicitly says proceed. Russell is currently AFK on a /loop directive — this plan is being WRITTEN autonomously; EXECUTION still requires his approval.
- **Branch rule:** `feature/queue-primitive-tier1` from `main`. NOT from `deal-desk-uat` — that branch becomes a downstream consumer in Phase 8.
- **Edit code in main conversation; no invisible-agent code edits.** Background agents are fine for read-only research already done in `snapshots/marcus-market-evidence-04-27-2026.md`.
- **Each TDD cycle:** RED test first (run, see fail for the right reason) → GREEN implementation (smallest change that passes) → REFACTOR (clean up, tests stay green) → ONE commit per cycle.
- **Compiler test gate:** `node clear.test.js` runs green at every commit.
- **Template smoke gate:** ALL 8 core templates compile clean after every Phase boundary (Deal Desk, Approval Queue, Lead Router, Onboarding Tracker, Internal Request Queue + Todo, CRM Pro, Blog, Live Chat, Helpdesk Agent, Booking, Expense Tracker, Ecom Agent).
- **Pre-push hook:** runs Meph eval — DO NOT skip with `SKIP_MEPH_EVAL=1` for this work; the primitive is in Meph's write path so eval matters.
- **Stop condition per phase:** all that phase's cycles green, no regressions in `clear.test.js`, no compiler-error or compiler-warning regressions in any of the 8 core templates.

---

## Mandatory Compiler Improvements

Per project CLAUDE.md "Improve The Compiler As You Go" — every app failure must become a generic compiler rule. The cycles below bake these in:

| Failure exposed | Required compiler improvement | Test home |
|-----------------|-------------------------------|-----------|
| Action buttons render but do nothing | Generated tests must hit each `/api/<entity>/:id/<action>` URL and assert decision row exists | Cycle 4.3 |
| Generated history tables show stale data | Generated tests must reload after action and assert history table grew by 1 | Cycle 4.4 |
| Status transitions silently fail | Generated tests must check `<entity>.status` value before AND after each action | Cycle 3.3 |
| Notifications missing recipient_email | Validator warns when `notify` clause references a role with no email field on the entity | Cycle 5.2 |
| Queue declared without actions | Validator hard-errors with helpful message ("queue 'X' needs actions: list — example: actions: approve, reject") | Cycle 5.1 |
| Auto-generated tables collide with user-defined ones | Compiler errors when user defines a `<Entity>Decisions` table AND declares `queue for <entity>:` | Cycle 2.3 |

No queue-primitive-only hacks. Each compiler change is a reusable rule weaker LLMs benefit from on every future app.

---

## Verified Line Anchors

Verified 2026-04-27 against current files (cross-referenced earlier in this session). Inline file:line list (lint-friendly format):

- `parser.js:127` — NodeType freeze block start
- `parser.js:195` — WORKFLOW node type sibling location for new QUEUE_DEF entry
- `parser.js:2702` — CANONICAL_DISPATCH registration site for `queue` keyword
- `parser.js:4083` — workflow parser pattern reference (mirror for queue parser)
- `parser.js:4501` — workflow parser end-of-block reference
- `compiler.js:7694` — ENDPOINT case dispatch site for new QUEUE_DEF case
- `compiler.js:7844` — direct email compile path reference
- `validator.js:183` — existing email-warning anchor for new notify-recipient warning
- `intent.md:322` — Workflow Primitives section; new "Approval Queue Primitives" section appends after
- `clear.test.js:21730` — existing Workflow state tests; new Queue primitive describe appends after
- `clear.test.js:27114` — Deal Desk UAT block where Phase 8 migration tests land

Same anchors in table form:

| File | Anchor | Line | Why it matters |
|------|--------|------|----------------|
| `parser.js` | `export const NodeType = Object.freeze({` | 127 | Add new `QUEUE_DEF` node type entry here |
| `parser.js` | `WORKFLOW: 'workflow'` | 195 | Sibling location; QUEUE_DEF goes near here |
| `parser.js` | `CANONICAL_DISPATCH.set('workflow', ...)` | 2702 | Add `CANONICAL_DISPATCH.set('queue', ...)` here |
| `parser.js` | Workflow parser block start | 4083 | Pattern reference for how to parse a sub-block primitive |
| `parser.js` | Workflow parser end (line `errors.push... empty workflow`) | 4501 | End of pattern reference |
| `compiler.js` | `case NodeType.ENDPOINT:` | 7694 | Add `case NodeType.QUEUE_DEF:` near here in dispatch |
| `compiler.js` | direct email compile path | 7844 | Reference for "compile to multiple things" pattern |
| `validator.js` | email timeout warning anchor | 183 | Reference for where validator-rules with helpful messages live |
| `intent.md` | Workflow Primitives section | 322 | Add "Approval Queue Primitives" section after this |
| `clear.test.js` | existing Workflow state tests | 21730 | Add `Queue primitive — parser` describe block AFTER the existing Workflow tests (don't intermix) |
| `clear.test.js` | Deal Desk UAT block | 27114 | Phase 8 migration tests go here |

If any anchor has drifted by the time execution starts, re-verify with `Grep` BEFORE the cycle that uses it.

---

## Data Contracts

### What `queue for deal:` generates

Given Clear source:

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer
  notify customer on counter, awaiting customer
  notify rep on approve, reject
```

The compiler emits:

**1. Auto-generated tables**

`DealDecisions`:
```javascript
{
  deal_id: '1',          // foreign key to parent entity (deal)
  decision: 'approved',  // one of the actions
  decided_by: 'CRO',     // from `reviewer`
  decided_at: <timestamp>,
  decision_note: '',     // optional, comes from action button modal
}
```

`DealNotifications`:
```javascript
{
  deal_id: '1',
  recipient_role: 'customer',  // from `notify customer on ...`
  recipient_email: <string>,   // resolved from deal.customer_email at queue time
  notification_type: 'counter offer',  // matches action name
  queue_status: 'pending',     // pending | sent | failed
  queued_at: <timestamp>,
}
```

**2. Auto-generated URL handlers**

- `GET /api/deals/queue` — all deals where `status` is in the queue's open set (e.g. 'pending')
- `PUT /api/deals/:id/approve` — sets `status = 'approved'`, inserts DealDecision, inserts notification rows for `notify rep on approve`
- `PUT /api/deals/:id/reject` — same shape, different action
- `PUT /api/deals/:id/counter` — same shape
- `PUT /api/deals/:id/awaiting` — same shape (action name slugified: `awaiting customer` → `/awaiting`)
- `GET /api/deal-decisions` — full decision history
- `GET /api/deal-notifications` — notification log

**3. Auto-generated UI elements**

- Status filter sidebar entries (Pending / Approved / Rejected / Awaiting customer)
- Action buttons in any `display deals as table ... with actions:` block (auto-bound to PUT URLs)
- Action buttons in `detail panel for selected_deal` (auto-bound)
- A "Decision History" table block displayed below the queue, fed by `/api/deal-decisions`
- A "Notification Log" table block, fed by `/api/deal-notifications`

**4. Auto-generated tests**

- `clear test` includes generated tests covering: each action transitions status correctly, each action records a decision row, each action queues notification rows where declared.

---

## UI and Visual Contract

This primitive touches UI; per project CLAUDE.md, plans that touch UI/browser/routes/buttons/tables need a visual contract.

| Element | Required behavior | Visual guard |
|---------|-------------------|--------------|
| Action buttons | Use existing `clear-btn` styles (primary/ghost/danger). Approve = primary; Reject = danger; everything else = ghost. | Browser screenshot on `/cro` confirms styling matches existing Deal Desk approval rail. |
| Status filter sidebar | Each open status (e.g. Pending, Awaiting customer) gets a `nav item` with live count. Closed statuses (Approved, Rejected) also get nav items, lower in the sidebar. | Screenshot shows sidebar with all 4 status filters + their counts. |
| Decision history table | Sortable by `decided_at` desc by default. Shows entity reference, decision, decided_by, time-ago label. | Screenshot shows history populated after one approve action. |
| Notification log table | Same sortable defaults. Shows recipient, type, queue_status, time-ago. | Screenshot shows notification row appears immediately after action. |
| Status transitions in detail panel | When a deal is acted upon, detail panel updates to show new status WITHOUT requiring page refresh. | Browser-driven test asserts new status visible after click. |
| Empty states | Empty queue says `No items waiting for review.` Empty history says `No decisions yet.` Empty notification log says `No notifications queued yet.` | Screenshot shows empty state for fresh app, not "undefined" or blank. |

**Visual stop condition:** if any screenshot shows clipped tables, missing action buttons, dead buttons (click does nothing visible), or empty-state text reading "undefined" or "[object Object]", stop and patch the compiler before proceeding.

---

## Docs Cascade

Per project CLAUDE.md (11-surface rule), this primitive lands a brand-new node type and so requires the FULL cascade:

| File | Change |
|------|--------|
| `intent.md` | Add `QUEUE_DEF` row in node-type table; add "Approval Queue Primitives" section after the existing Workflow Primitives section (~line 322) |
| `SYNTAX.md` | Add canonical `queue for X:` example with all sub-clauses (reviewer, actions, notify) |
| `AI-INSTRUCTIONS.md` | Add "Use queue for X: when an entity needs human approval before status changes" guidance + when NOT to use (single-record approve/reject without audit needs) |
| `USER-GUIDE.md` | Add tutorial section: "Building a deal desk in 10 lines" using the new primitive |
| `FEATURES.md` | Add capability row under "Build full apps by writing English" — "Approval queues with audit + notifications in one block" |
| `CHANGELOG.md` | Session-dated entry: "Queue primitive Tier 1 — single-stage approval flows generate audit + notifications + UI from one block" |
| `FAQ.md` | Add "Where does the queue primitive live?" + "How do I add a new approval action?" + "Why is `queue` separate from `workflow`?" entries |
| `playground/system-prompt.md` | Teach Meph: when an app needs approval, prefer `queue for X:` over hand-rolled CRUD endpoints |
| `ROADMAP.md` | Mark queue primitive Tier 1 shipped; flag Tier 2 (multi-stage) as deferred-pending-evidence |
| `landing/marcus.html` | Update the code snippet showing what Clear looks like — use the new primitive form |
| `RESEARCH.md` | No changes needed (queue primitive doesn't affect training-signal architecture) |

Update all of these in the SAME commit as the feature lands per project CLAUDE.md "doc cascade" rule. Hook `.claude/hooks/doc-cascade.mjs` will inject reminders if I forget.

---

## TDD Cycles

### Phase 1 — Parser + AST node

#### Cycle 1.1 — RED: parser recognizes `queue for X:` and creates a QUEUE_DEF node

**Test command (PowerShell, Windows):**
```powershell
node clear.test.js --grep "Queue primitive — parser"
```

**Test code** (add to `clear.test.js` AFTER line ~22050, after the existing Workflow parallel branches tests, in a new describe block):
```javascript
describe('Queue primitive — parser', () => {
  it('parses queue for deal: with reviewer + actions', () => {
    const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const q = ast.body.find(n => n.type === NodeType.QUEUE_DEF);
    expect(q).toBeTruthy();
    expect(q.entityName).toBe('deal');
    expect(q.reviewer).toBe('CRO');
    expect(q.actions).toEqual(['approve', 'reject', 'counter']);
  });
});
```

**Expected red:** `NodeType.QUEUE_DEF` is undefined → test fails on the first `expect(q).toBeTruthy()` because no node was created.

**GREEN implementation:**
1. Add `QUEUE_DEF: 'queue_def'` to NodeType freeze in `parser.js:127-200` (sibling-to-WORKFLOW area, ~line 196).
2. Register `CANONICAL_DISPATCH.set('queue', parseQueueDef)` in `parser.js` at ~line 2703 (right after the workflow registration).
3. Implement `parseQueueDef(ctx)`:
   - Skip token `queue`
   - Expect token `for`, then bare entity name (lowercase noun, e.g. `deal`)
   - Expect `:`
   - Parse indented body — extract `reviewer is 'X'` and `actions: a, b, c`
   - Return `{ type: NodeType.QUEUE_DEF, entityName, reviewer, actions, line }`
4. Pattern reference: `parseWorkflow` at `parser.js:4083+`. Mirror its indent-aware sub-block parsing.

**REFACTOR:** extract any shared "parse identifier list after colon" helper if it makes the code cleaner. Don't over-engineer.

**Commit:**
```
TDD cycle 1.1: parse queue for X: with reviewer + actions
```

#### Cycle 1.2 — RED: parser handles `notify <role> on <action>, <action>` clauses

**Test code** (append to the same describe block):
```javascript
it('parses notify clauses', () => {
  const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer
  notify customer on counter, awaiting customer
  notify rep on approve, reject`;
  const ast = parse(src);
  expect(ast.errors).toHaveLength(0);
  const q = ast.body.find(n => n.type === NodeType.QUEUE_DEF);
  expect(q.notifications).toEqual([
    { role: 'customer', onActions: ['counter', 'awaiting customer'] },
    { role: 'rep', onActions: ['approve', 'reject'] },
  ]);
});
```

**Expected red:** `q.notifications` is undefined.

**GREEN:** extend parser body loop to recognize `notify <role> on <comma-list>`. Slugify multi-word actions (`awaiting customer`) to single tokens for URL routing in later phases.

**REFACTOR:** extract a `parseNotifyClause(line)` helper.

**Commit:** `TDD cycle 1.2: parse notify clauses in queue blocks`

#### Cycle 1.3 — RED: parser rejects malformed queue blocks with helpful errors

**Test code:**
```javascript
it('rejects queue with no entity name', () => {
  const src = `queue for:
  reviewer is 'CRO'
  actions: approve`;
  const ast = parse(src);
  expect(ast.errors.length).toBeGreaterThan(0);
  expect(ast.errors[0].message).toContain("queue needs an entity name");
});

it('rejects queue with no actions', () => {
  const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'`;
  const ast = parse(src);
  expect(ast.errors.length).toBeGreaterThan(0);
  expect(ast.errors[0].message).toContain("queue 'deal' needs actions:");
});
```

**Expected red:** parser silently accepts the malformed input; `ast.errors` is empty.

**GREEN:** add validation inside `parseQueueDef`. Error messages must match the project's helpful-error style (suggest the fix, don't just say "syntax error").

**Commit:** `TDD cycle 1.3: reject malformed queue blocks with helpful errors`

---

### Phase 2 — Compiler emits auto-generated tables

#### Cycle 2.1 — RED: compiler emits the `<Entity>Decisions` table

**Test code:**
```javascript
describe('Queue primitive — compiler tables', () => {
  it('emits a DealDecisions table for queue for deal:', () => {
    const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.serverJS).toContain('CREATE TABLE');
    expect(result.serverJS).toContain('deal_decisions');
    expect(result.serverJS).toContain('deal_id');
    expect(result.serverJS).toContain('decision');
    expect(result.serverJS).toContain('decided_by');
    expect(result.serverJS).toContain('decided_at');
  });
});
```

**Expected red:** compiler doesn't know about QUEUE_DEF; `result.serverJS` does not contain `deal_decisions`.

**GREEN:**
1. Add `case NodeType.QUEUE_DEF:` in `compiler.js` near line 7694 (the ENDPOINT case).
2. The case calls a new `compileQueueDef(node, ctx)` helper.
3. Inside `compileQueueDef`: emit a CREATE TABLE statement for `<entityName>_decisions` with the standard fields above. Reuse the existing table-emission helpers in compiler.js — do not duplicate.

**REFACTOR:** if the existing table-emission helper isn't easy to reuse, extract the shared bits.

**Commit:** `TDD cycle 2.1: compile QUEUE_DEF to <entity>_decisions table`

#### Cycle 2.2 — RED: compiler emits the `<Entity>Notifications` table when notify clauses exist

**Test code:**
```javascript
it('emits a DealNotifications table when notify clauses present', () => {
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
  customer_email
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter
  notify customer on counter`;
  const result = compileProgram(src);
  expect(result.errors).toHaveLength(0);
  expect(result.serverJS).toContain('deal_notifications');
  expect(result.serverJS).toContain('recipient_role');
  expect(result.serverJS).toContain('recipient_email');
  expect(result.serverJS).toContain('queue_status');
});

it('does NOT emit a notifications table when no notify clauses', () => {
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject`;
  const result = compileProgram(src);
  expect(result.errors).toHaveLength(0);
  expect(result.serverJS).not.toContain('deal_notifications');
});
```

**Expected red:** notifications table missing.

**GREEN:** in `compileQueueDef`, conditionally emit the notifications table when `node.notifications.length > 0`.

**Commit:** `TDD cycle 2.2: compile notifications table when notify clauses present`

#### Cycle 2.3 — RED: compiler errors if user defines a colliding table

**Test code:**
```javascript
it('errors when user defines a DealDecisions table AND a queue for deal:', () => {
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
create a DealDecisions table:
  manual_field
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject`;
  const result = compileProgram(src);
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors[0].message).toContain("auto-generates");
  expect(result.errors[0].message).toContain("DealDecisions");
});
```

**Expected red:** silent collision — compiler defines the table twice.

**GREEN:** in `compileQueueDef`, before emitting the auto-generated table, check `ctx.declared.tables` for a collision. If found, push a helpful error.

**Commit:** `TDD cycle 2.3: detect collision between auto and user-defined audit tables`

---

### Phase 3 — Compiler emits auto-generated URL handlers

#### Cycle 3.1 — RED: compiler emits `GET /api/<entity>s/queue`

**Test code:**
```javascript
describe('Queue primitive — compiler URLs', () => {
  it('emits GET /api/deals/queue handler', () => {
    const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.serverJS).toContain("app.get('/api/deals/queue'");
    expect(result.serverJS).toMatch(/where\s+status\s*=\s*['"]pending['"]/);
  });
});
```

**Expected red:** URL handler missing.

**GREEN:** in `compileQueueDef`, emit a GET handler that filters the entity table by `status = 'pending'` (the default open status).

**Commit:** `TDD cycle 3.1: compile queue filtered GET handler`

#### Cycle 3.2 — RED: compiler emits a PUT handler for each action

**Test code:**
```javascript
it('emits PUT /api/deals/:id/<action> for each declared action', () => {
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer`;
  const result = compileProgram(src);
  expect(result.errors).toHaveLength(0);
  expect(result.serverJS).toContain("app.put('/api/deals/:id/approve'");
  expect(result.serverJS).toContain("app.put('/api/deals/:id/reject'");
  expect(result.serverJS).toContain("app.put('/api/deals/:id/counter'");
  expect(result.serverJS).toContain("app.put('/api/deals/:id/awaiting'");
  // multi-word action slugifies first word
});
```

**Expected red:** PUT handlers missing.

**GREEN:** loop over `node.actions`, slugify each, emit a PUT handler. Each handler:
1. Updates `Deals.status` to the action terminal status (approve→approved, reject→rejected, counter→awaiting, awaiting customer→awaiting)
2. Inserts a row into `DealDecisions`
3. Inserts notification rows for each `notify` clause matching that action
4. Returns the updated deal

**REFACTOR:** extract action→status mapping into a helper.

**Commit:** `TDD cycle 3.2: compile per-action PUT handlers`

#### Cycle 3.3 — RED: PUT handler updates status visibly + records decision

**Test code (integration-style, exercises the compiled output):**
```javascript
it('PUT /api/deals/:id/approve updates status AND records decision row', async () => {
  // Compile + spin up an in-process express server
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject`;
  const result = compileProgram(src);
  // Reusing the existing test harness pattern from clear.test.js for in-process server tests
  const { app } = await spinUpFromSource(result);
  // Seed a deal
  const created = await request(app).post('/api/deals').send({ customer: 'Acme' });
  const dealId = created.body.id;
  // Approve it
  const resp = await request(app).put(`/api/deals/${dealId}/approve`).send({});
  expect(resp.status).toBe(200);
  expect(resp.body.status).toBe('approved');
  // Decision row exists
  const decisions = await request(app).get('/api/deal-decisions');
  expect(decisions.body.some(r => r.deal_id === dealId && r.decision === 'approve')).toBe(true);
});
```

**Expected red:** status not updating OR decision not recorded.

**GREEN:** wire the PUT handler properly. Use the existing `_db.update` and `_db.insert` helpers from runtime/db.js.

**Commit:** `TDD cycle 3.3: PUT handler updates status and records decision row`

---

### Phase 4 — Compiler emits auto-generated UI elements

#### Cycle 4.1 — RED: action buttons appear in `display deals as table`

**Test code:**
```javascript
describe('Queue primitive — compiler UI', () => {
  it('adds action buttons to display deals as table', () => {
    const src = `build for web and javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject

page 'CRO' at '/cro':
  on page load:
    get pending from '/api/deals/queue'
  display pending as table showing customer, status`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('>Approve</button>');
    expect(result.html).toContain('>Reject</button>');
    expect(result.javascript).toContain("'/api/deals/' + row.id + '/approve'");
    expect(result.javascript).toContain("'/api/deals/' + row.id + '/reject'");
  });
});
```

**Expected red:** buttons missing.

**GREEN:** in the table-rendering compile path, when the displayed entity has a queue, append a per-row actions cell with one button per action. Each button fires a fetch to the matching PUT URL.

**Commit:** `TDD cycle 4.1: auto-add action buttons to queue tables`

#### Cycle 4.2 — RED: history table appears below the queue page

**Test code:**
```javascript
it('renders DecisionHistory table block on the queue page', () => {
  const src = `build for web and javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject

page 'CRO' at '/cro':
  on page load:
    get pending from '/api/deals/queue'
  display pending as table showing customer`;
  const result = compileProgram(src);
  expect(result.errors).toHaveLength(0);
  expect(result.html).toContain('Decision History');
  expect(result.javascript).toContain("'/api/deal-decisions'");
});
```

**Expected red:** no history table rendered.

**GREEN:** detect when the page hosts the queue's filtered table; append a Decision History section block below it with auto-fetch.

**Commit:** `TDD cycle 4.2: auto-render decision history on queue pages`

#### Cycle 4.3 — RED: generated tests cover action button → PUT → decision row

**Test code:**
```javascript
it('generates app-level tests that exercise each action', () => {
  const src = `build for web and javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject`;
  const result = compileProgram(src);
  expect(result.errors).toHaveLength(0);
  expect(result.tests).toContain('Approving a deal records a decision');
  expect(result.tests).toContain("'/api/deals/' + target.id + '/approve'");
  expect(result.tests).toContain("'/api/deal-decisions'");
  expect(result.tests).toContain('Decision row should exist for the clicked deal');
});
```

**Expected red:** generated tests missing.

**GREEN:** extend the test generator to emit per-action tests when a queue is declared. Each test: seed a row, hit the PUT URL, assert decision row exists.

**Commit:** `TDD cycle 4.3: generate per-action test cases`

#### Cycle 4.4 — RED: history table reloads after action

**Test code (browser-style, in `playground/ide.test.js` or equivalent UAT runner):**
```javascript
it('history table grows by 1 after an action click', async () => {
  // Compile + serve + drive browser
  // Before: history table has N rows
  // Click Approve on first pending deal
  // After: history table has N+1 rows
  // (Real implementation uses Playwright via the existing `playground/ide.test.js` pattern)
});
```

**Expected red:** history table doesn't update without manual reload.

**GREEN:** action button click handler should trigger a refetch of the history-table source URL after the PUT resolves.

**Commit:** `TDD cycle 4.4: history table refreshes after action`

---

### Phase 5 — Validator catches malformed declarations

Already covered by Cycles 1.3 and 2.3 at parser/compiler level. Phase 5 adds RUNTIME validation:

#### Cycle 5.1 — RED: validator flags missing `notify` recipient field

**Test code:**
```javascript
describe('Queue primitive — validator', () => {
  it('warns when notify clause references a role with no email field on entity', () => {
    const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject
  notify customer on approve`;
    const result = compileProgram(src);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain('customer_email');
    expect(result.warnings[0].message).toContain('Deals');
  });
});
```

**Expected red:** silent — no warning when entity has no field for the notification recipient's email.

**GREEN:** in `validator.js` near line 183 (existing email-related warnings), add a check: when a queue declares `notify <role> on ...`, verify the parent entity has a `<role>_email` field. If not, warn.

**Commit:** `TDD cycle 5.1: warn when notify recipient has no email field`

---

### Phase 6 — Docs cascade

#### Cycle 6.1 — RED: docs mention the queue primitive across all required surfaces

**Test code:**
```javascript
it('documents queue primitive across all 11 cascade surfaces', () => {
  const intent = readFileSync(pathJoin(REPO_ROOT, 'intent.md'), 'utf8');
  const syntax = readFileSync(pathJoin(REPO_ROOT, 'SYNTAX.md'), 'utf8');
  const ai = readFileSync(pathJoin(REPO_ROOT, 'AI-INSTRUCTIONS.md'), 'utf8');
  const guide = readFileSync(pathJoin(REPO_ROOT, 'USER-GUIDE.md'), 'utf8');
  const features = readFileSync(pathJoin(REPO_ROOT, 'FEATURES.md'), 'utf8');
  const faq = readFileSync(pathJoin(REPO_ROOT, 'FAQ.md'), 'utf8');
  const sysprompt = readFileSync(pathJoin(REPO_ROOT, 'playground', 'system-prompt.md'), 'utf8');
  expect(intent).toContain('QUEUE_DEF');
  expect(intent).toContain('Approval Queue Primitives');
  expect(syntax).toContain('queue for');
  expect(ai).toContain('queue for');
  expect(guide).toContain('queue for');
  expect(features).toContain('Approval queues');
  expect(faq).toContain('queue primitive');
  expect(sysprompt).toContain('queue for');
});
```

**Expected red:** docs not yet updated.

**GREEN:** update each doc per the cascade table above. Same commit as Cycle 6.1.

**Commit:** `TDD cycle 6.1: docs cascade for queue primitive`

---

### Phase 7 — Template smoke test

#### Cycle 7.1 — GREEN verification: all 8 core templates compile clean

**Test command:**
```powershell
node -e "import { compileProgram } from './index.js'; import fs from 'fs'; ['todo-fullstack','crm-pro','blog-fullstack','live-chat','helpdesk-agent','booking','expense-tracker','ecom-agent'].forEach(a => { const r = compileProgram(fs.readFileSync('apps/'+a+'/main.clear','utf8')); console.log(a+': '+r.errors.length+' errors, '+r.warnings.length+' warnings'); });"
```

**Success criteria:** 0 errors per template (warnings are OK; CSRF + similar pre-existing warnings tolerated). NO regressions vs the same command run BEFORE Phase 1.

**Commit:** `TDD cycle 7.1: verify 8 core templates still compile clean post-queue-primitive`

---

### Phase 8 — Migrate Deal Desk

#### Cycle 8.1 — RED: Deal Desk uses `queue for deal:` and shrinks

**Test code:**
```javascript
it('Deal Desk uses the queue primitive', () => {
  const src = readFileSync(pathJoin(REPO_ROOT, 'apps', 'deal-desk', 'main.clear'), 'utf8');
  expect(src).toContain('queue for deal:');
  // The hand-rolled approval URLs should be GONE — replaced by primitive-generated ones
  expect(src).not.toMatch(/when user updates deal at \/api\/deals\/:id\/(approve|reject|counter|awaiting)/);
  // Deal Desk should now be substantially shorter
  const lineCount = src.split('\n').length;
  expect(lineCount).toBeLessThan(120); // was 172+ pre-migration
});
```

**Expected red:** Deal Desk still uses hand-rolled URLs.

**GREEN:** rewrite `apps/deal-desk/main.clear` to use `queue for deal:` instead of the hand-rolled approval URL declarations. Keep all visible behavior (status filters, history, notifications). Existing Deal Desk UAT tests in `clear.test.js:27114+` MUST stay green.

**REFACTOR:** look for any other repeated machinery that the primitive could subsume but didn't (e.g. status filter sidebar entries — should auto-generate).

**Commit:** `TDD cycle 8.1: migrate Deal Desk to queue primitive`

---

## Edge cases covered

| Scenario | Expected behavior | Test cycle |
|----------|-------------------|------------|
| Two queues on same entity | Hard error: each entity has at most one queue | Add to Cycle 5 (validator) |
| Action name with spaces (e.g. `awaiting customer`) | URL slug uses first word; display label keeps full phrase | Cycle 3.2 |
| Entity has no `status` field | Compiler auto-adds `status` field with `default 'pending'` | Cycle 2.1 (extend test) |
| Notify recipient field is missing | Warning, not error — degraded behavior (no email sent, queue row still created with blank recipient_email) | Cycle 5.1 |
| User overrides a generated URL with their own | User's URL wins; primitive's URL is suppressed | Cycle 3 (extend tests) |
| User has existing `display deals as table` with custom action buttons | User's buttons coexist with auto-added queue actions; no duplication if names match | Cycle 4.1 (extend tests) |

---

## Success criteria (overall)

- All 17 TDD cycle tests green
- `node clear.test.js` green (no regressions in the existing 2635+ tests)
- All 8 core templates compile clean (0 errors)
- Deal Desk migrated and `apps/deal-desk/main.clear` is under 120 lines (down from 172+) with same visible behavior
- All 11 doc surfaces updated
- Pre-push hook passes (compiler + e2e + meph eval green)

---

## Stop conditions (overall)

- Any phase's test cycle fails after 3 GREEN attempts → escalate (revisit design before continuing)
- Template smoke test surfaces a regression → fix before proceeding to next phase
- Doc cascade hook fires a missing-doc warning → land the doc update in the same commit
- Deal Desk migration breaks any of its UAT tests → roll back the migration, fix the primitive, retry

---

## What this plan deliberately does NOT cover

- Multi-stage queues (Tier 2) — separate plan, gated on a second workflow app being built
- Trello-style board view — DEFER per evidence in `snapshots/marcus-market-evidence-04-27-2026.md`
- Settings page for runtime renaming/threshold-edit — DEFER per same evidence
- Email actually sending — separate plan for triggered email primitive (`plans/plan-triggered-email-04-27-2026.md`, to write next iteration)
- Connector platform integration — DEFER until an agent app needs it

---

## Iteration handoff

- This plan was written autonomously during Russell's AFK /loop directive (2026-04-27).
- **Russell must review and approve before execution.** The REVIEW FREEZE clause in Execution Rules is real.
- Next /loop iteration will write the **triggered email primitive plan** at `plans/plan-triggered-email-04-27-2026.md`.
