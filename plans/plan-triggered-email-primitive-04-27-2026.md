# Triggered Email Primitive — When-status-changes Send + Durable Queue

**One-line goal:** add `when X's status changes to Y: send email to ...:` block to Clear so any state transition can fire a queued (durable, non-real-send-in-tests) email — the second of three primitives unlocking Marcus's 5 apps from the queue primitive.

**Branch:** `feature/triggered-email-primitive`. Land AFTER the queue primitive (`feature/queue-primitive-tier1`) merges to main — they integrate (the queue's `notify` clauses ultimately compile to triggered emails).

**Source of authority:** `snapshots/marcus-market-evidence-04-27-2026.md` (research, including AgentMail vs SendGrid evidence) + `snapshots/marcus-primitives-decomposition-04-27-2026.md` (primitive ordering). Read both before executing.

---

## Phase Order (load-bearing)

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| 1 | A | Queue primitive landed on main | required: parser handles `when X's status changes to Y:` block |
| 2 | A | Phase 1 | required: parser handles nested `send email to ...:` action with subject + body + provider |
| 3 | A | Phase 2 | required: compiler emits `WorkflowEmailQueue` table when any when-trigger exists |
| 4 | A | Phase 3 | required: compiler injects queue-insert at the end of any URL handler that updates `<entity>.status` to the trigger value |
| 5 | A | Phases 1-4 | required: validator catches malformed when-triggers + missing recipient fields |
| 6 | A | Phases 1-5 | required: docs cascade across 11 surfaces |
| 7 | A | Phases 1-6 | required: all 8 core templates still compile clean (no regressions) |
| B-1 | B | Phase 7 green + Russell explicitly approves real email | DEFERRED: live AgentMail / SendGrid worker (real sends, retry, reply webhooks) |

**Default track:** Path A — durable queue + auto-insert from triggers, NO real sends. Tests + preview + dev all queue-only.

**Escalation track:** B-1 (deferred) — live email delivery worker. Gated on Russell explicitly enabling via `enable live email delivery via agentmail` directive AND an env-var-backed API key.

**Why this order:** parser → compiler → URL-handler integration → docs. Real sends are the LAST thing — Russell has explicit "no real email in tests" rule and the queue is itself useful (Marcus can SEE that emails would have been sent, even before they actually go out).

---

## Execution Rules

- **Plan quality bar:** stupidest LLM that can follow instructions executes completely. Every cycle: exact test command, exact test code, exact expected red, exact GREEN steps.
- **REVIEW FREEZE:** Russell reviews + explicitly approves before execution. This plan was written autonomously during Russell's AFK /loop (2026-04-27).
- **Branch rule:** create `feature/triggered-email-primitive` from `main` only AFTER `feature/queue-primitive-tier1` has merged. Do NOT branch off the queue branch.
- **Edit code in main conversation; no invisible-agent code edits.**
- **TDD cycle structure:** RED test (run, see fail for the right reason) → GREEN (smallest change passes) → REFACTOR → ONE commit per cycle.
- **Compiler test gate:** `node clear.test.js` green at every commit.
- **Template smoke gate:** all 8 core templates compile clean after every Phase boundary.
- **NO REAL SENDS:** in Phases 1-7, the compiler MUST NOT emit any code path that calls AgentMail / SendGrid / Resend / Postmark / Mailgun real APIs. Test assertion: `expect(result.serverJS).not.toContain('api.agentmail.to')`. Same for sendgrid.com, resend.com, etc.
- **Stop condition per phase:** all that phase's cycles green, no regressions, no real-send code path leaked.

---

## Mandatory Compiler Improvements

Per project CLAUDE.md "Improve The Compiler As You Go":

| Failure exposed | Required compiler improvement | Test home |
|-----------------|-------------------------------|-----------|
| When-trigger declared but never fires | Compiler verifies a URL handler exists that updates `<entity>.status` to the trigger value; warns if not | Cycle 5.1 |
| Email body references undefined variable | Validator catches at compile time, not at runtime | Cycle 5.2 |
| Provider name typo (e.g. `agentmial`) | Validator hard-errors with list of valid providers | Cycle 5.3 |
| Recipient field missing from entity | Compiler warns AND emits queue row with blank recipient_email (degraded, not crashing) | Cycle 4.3 |
| Real provider API call leaks into compiled output | Compiler tests assert NO real-provider URLs in serverJS unless `enable live email delivery via X` directive present | Cycle 3.4 + B-1 gate |

No triggered-email-only hacks. Each compiler change is a reusable rule for any future "fire something on state change" primitive (e.g. webhooks, in-app notifications).

---

## Verified Line Anchors

Verified 2026-04-27 against current files. Inline file:line list (lint-friendly format):

- `parser.js:1871` — existing email parsing area (reference for SEND_EMAIL parser pattern)
- `parser.js:127` — NodeType freeze block (add new `WHEN_STATUS_CHANGES` and `TRIGGERED_EMAIL_QUEUE` entries)
- `compiler.js:7844` — direct email compile path (mirror pattern)
- `compiler.js:7919` — provider SendGrid service-call compile (mirror pattern, but ROUTE TO QUEUE not real send)
- `compiler.js:7694` — ENDPOINT case dispatch (the URL handlers we inject queue-inserts INTO)
- `validator.js:183` — email timeout warning anchor (mirror for new triggered-email warnings)
- `intent.md:240` — email intent docs (add "Triggered Workflow Email" subsection)
- `clear.test.js:9812` — existing parser email tests (add new `Triggered email — parser` describe block AFTER)
- `clear.test.js:17827` — existing SendGrid compiler test (add new `Triggered email — compiler` describe block AFTER)

If any anchor has drifted by execution time, re-verify with `Grep` BEFORE the cycle that uses it.

---

## Data Contracts

### What `when deal's status changes to 'awaiting': send email ...` generates

Given Clear source:

```clear
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter

when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'We countered your offer'
    body is 'Sarah from our team has prepared a counter offer for you. Please review and respond.'
    provider is 'agentmail'
    track replies as deal activity
```

The compiler emits:

**1. Auto-generated table** (created once per app, regardless of how many when-triggers exist):

`WorkflowEmailQueue`:
```javascript
{
  id: <auto>,
  entity_type: 'deal',          // which kind of record triggered this
  entity_id: '1',                // FK to the parent record
  recipient_email: 'customer@acme.com',  // resolved from deal.customer_email at queue-insert time
  subject: 'We countered your offer',
  body: 'Sarah from our team...',
  provider: 'agentmail',         // or 'sendgrid' / 'resend' / 'postmark' / 'mailgun'
  reply_tracking: 'deal activity', // optional, comes from `track replies as ...`
  queue_status: 'pending',       // pending | sent | failed | replied
  attempts: 0,
  last_error: null,
  queued_at: <timestamp>,
  sent_at: null,
  replied_at: null,
}
```

**2. Auto-injected queue-insert** at the end of any URL handler that runs `<entity>.status = '<trigger value>'`. The compiler scans URL handlers for status assignments and injects the email-queue insert AFTER the DB write but BEFORE the response.

**3. Auto-rendered "Email Log" view** on any page that hosts the queue's filtered table — same pattern as the queue primitive's Decision History table.

**4. Auto-generated tests** that assert: when the trigger value is set on the entity, a row appears in `WorkflowEmailQueue` with the right recipient, subject, and provider. NO assertions about real sending — that's B-1.

---

## UI and Visual Contract

This primitive has visible UI (the Email Log view); per project CLAUDE.md, plans that touch UI need a visual contract.

| Element | Required behavior | Visual guard |
|---------|-------------------|--------------|
| Email Log table | Auto-renders below the queue's filtered table on any page that hosts a queue. Columns: recipient, subject, provider, status (pill: pending/sent/failed/replied), queued-at time-ago. | Browser screenshot shows email log populated after one queue action that triggers an email. |
| Status pill | `pending` = ghost gray, `sent` = primary blue, `failed` = danger red, `replied` = success green. | Screenshot shows correct color per status. |
| Empty state | "No emails queued yet." (NOT "undefined" or blank) | Screenshot of fresh app shows the empty state literal. |
| Provider column | Shows provider name lowercase ('agentmail' / 'sendgrid'). | Screenshot or DOM inspect confirms. |

**Visual stop condition:** if the Email Log shows "[object Object]" in any column, or the status pill is the wrong color, or the empty state shows nothing/undefined — stop and patch the compiler before proceeding.

---

## Docs Cascade

Per project CLAUDE.md (11-surface rule), this primitive lands new node types and so requires the FULL cascade:

| File | Change |
|------|--------|
| `intent.md` | Add `WHEN_STATUS_CHANGES` and `TRIGGERED_EMAIL_QUEUE` rows in node-type table; add "Triggered Workflow Email" subsection after the existing email docs (~line 240+) |
| `SYNTAX.md` | Add canonical `when X's status changes to Y: send email to ...:` example with all sub-clauses (subject, body, provider, track replies as) |
| `AI-INSTRUCTIONS.md` | Add "Use `when X status changes to Y` for email triggers (preferred over hand-rolled URL handlers that send email)" guidance + when NOT to use (one-off transactional email — keep using `send email:` directly) |
| `USER-GUIDE.md` | Add tutorial section: "Adding email notifications to your queue" |
| `FEATURES.md` | Add capability row under "Build full apps by writing English" — "Triggered emails on state change with durable queue + provider abstraction" |
| `CHANGELOG.md` | Session-dated entry: "Triggered email primitive — when-status-changes triggers + durable queue, provider-neutral, no real sends in tests" |
| `FAQ.md` | Add "How does the triggered email queue work?" + "When do real emails actually get sent?" + "Why doesn't `enable live email delivery via X` work in tests?" entries |
| `playground/system-prompt.md` | Teach Meph: when an app needs notifications on state change, prefer `when X's status changes to Y:` over hand-rolled approaches |
| `ROADMAP.md` | Mark triggered email Tier 1 shipped; flag B-1 (live email delivery worker) as deferred-pending-Russell-approval |
| `landing/marcus.html` | Update if any code snippets reference email-sending — use the new primitive form |
| `RESEARCH.md` | No changes (triggered email doesn't affect training-signal architecture) |

Update all in the SAME commit as the feature lands. The doc-cascade hook will inject reminders if any are missing.

---

## TDD Cycles

### Phase 1 — Parser handles `when X's status changes to Y:` block

#### Cycle 1.1 — RED: parser recognizes when-status-changes block + creates a WHEN_STATUS_CHANGES node

**Test command:**
```powershell
node clear.test.js --grep "Triggered email — parser"
```

**Test code** (add to `clear.test.js` after the existing email parser tests, ~line 9900):
```javascript
describe('Triggered email — parser', () => {
  it('parses when X status changes to Y block with send email action', () => {
    const src = `create a Deals table:
  customer
  customer_email
  status, default 'pending'
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'We countered your offer'
    body is 'Sarah prepared a counter offer for you.'`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const trigger = ast.body.find(n => n.type === NodeType.WHEN_STATUS_CHANGES);
    expect(trigger).toBeTruthy();
    expect(trigger.entityName).toBe('deal');
    expect(trigger.statusValue).toBe('awaiting');
    expect(trigger.actions).toHaveLength(1);
    expect(trigger.actions[0].type).toBe(NodeType.TRIGGERED_SEND_EMAIL);
    expect(trigger.actions[0].recipientExpr).toBe("deal's customer_email");
    expect(trigger.actions[0].subject).toBe('We countered your offer');
    expect(trigger.actions[0].body).toBe('Sarah prepared a counter offer for you.');
  });
});
```

**Expected red:** `NodeType.WHEN_STATUS_CHANGES` is undefined → first `expect(trigger).toBeTruthy()` fails.

**GREEN implementation:**
1. Add `WHEN_STATUS_CHANGES: 'when_status_changes'` and `TRIGGERED_SEND_EMAIL: 'triggered_send_email'` to NodeType freeze in `parser.js:127-200`.
2. Register `CANONICAL_DISPATCH.set('when', parseWhenStatusChanges)` — but careful: `when` is already a synonym for endpoint declarations (`when user sends X to Y`). Disambiguate by token sequence: `when <ident>'s status changes to <quoted>:` triggers this parser; `when user sends/calls/etc.` continues to existing endpoint parser.
3. Implement `parseWhenStatusChanges(ctx)` mirroring `parseQueueDef` from the queue primitive plan.
4. Inside the body, recognize `send email to <expr>:` as a TRIGGERED_SEND_EMAIL action with subject + body sub-fields.

**REFACTOR:** if disambiguation logic between `when user sends ...` and `when X's status changes ...` is messy, extract a helper `isStatusChangeTrigger(tokens, pos)`.

**Commit:** `TDD cycle 1.1: parse when X status changes to Y block`

#### Cycle 1.2 — RED: parser handles provider + track replies as sub-clauses

**Test code:**
```javascript
it('parses provider and track replies as clauses', () => {
  const src = `create a Deals table:
  customer
  customer_email
  status, default 'pending'
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'We countered your offer'
    body is 'Counter offer details.'
    provider is 'agentmail'
    track replies as deal activity`;
  const ast = parse(src);
  expect(ast.errors).toHaveLength(0);
  const trigger = ast.body.find(n => n.type === NodeType.WHEN_STATUS_CHANGES);
  expect(trigger.actions[0].provider).toBe('agentmail');
  expect(trigger.actions[0].replyTracking).toBe('deal activity');
});
```

**Expected red:** `provider` and `replyTracking` fields undefined.

**GREEN:** extend the `send email` sub-block parser to recognize `provider is 'X'` and `track replies as <text>` lines.

**Commit:** `TDD cycle 1.2: parse provider and track replies clauses`

#### Cycle 1.3 — RED: parser rejects malformed when-status-changes blocks

**Test code:**
```javascript
it('rejects when block referencing unknown entity', () => {
  const src = `when fakeentity's status changes to 'X':
  send email to fakeentity's email:
    subject is 'test'
    body is 'test'`;
  const ast = parse(src);
  expect(ast.errors.length).toBeGreaterThan(0);
  expect(ast.errors[0].message).toContain("no table");
  expect(ast.errors[0].message).toContain("fakeentity");
});

it('rejects send email block missing required subject', () => {
  const src = `create a Deals table:
  customer_email
  status
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    body is 'no subject!'`;
  const ast = parse(src);
  expect(ast.errors.length).toBeGreaterThan(0);
  expect(ast.errors[0].message).toContain('subject');
});
```

**Expected red:** parser silently accepts malformed input.

**GREEN:** validate inside `parseWhenStatusChanges` — entity must reference a declared table; subject + body + recipient are required.

**Commit:** `TDD cycle 1.3: reject malformed when-status-changes blocks with helpful errors`

---

### Phase 2 — Parser nested send email sub-block (covered by 1.1+1.2)

This phase is empty — the nested `send email` parsing is bundled into Phase 1 cycles. Renumbered cycles below stay sequential.

---

### Phase 3 — Compiler emits WorkflowEmailQueue table

#### Cycle 3.1 — RED: compiler emits the WorkflowEmailQueue table when any when-trigger exists

**Test code:**
```javascript
describe('Triggered email — compiler tables', () => {
  it('emits WorkflowEmailQueue table when when-trigger exists', () => {
    const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
  customer_email
  status, default 'pending'
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'Counter'
    body is 'Counter offer'`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.serverJS).toContain('workflow_email_queue');
    expect(result.serverJS).toContain('entity_type');
    expect(result.serverJS).toContain('entity_id');
    expect(result.serverJS).toContain('recipient_email');
    expect(result.serverJS).toContain('subject');
    expect(result.serverJS).toContain('body');
    expect(result.serverJS).toContain('provider');
    expect(result.serverJS).toContain('queue_status');
  });

  it('does NOT emit WorkflowEmailQueue when no when-triggers exist', () => {
    const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'`;
    const result = compileProgram(src);
    expect(result.serverJS).not.toContain('workflow_email_queue');
  });
});
```

**Expected red:** table missing OR present even without triggers.

**GREEN:**
1. Add `case NodeType.WHEN_STATUS_CHANGES:` near `compiler.js:7694` (sibling of ENDPOINT case).
2. The case calls a new `compileWhenStatusChanges` helper that emits the WorkflowEmailQueue table on FIRST encounter (use a `ctx.emittedTables` set to prevent duplicates).
3. The table emission reuses the existing CREATE TABLE helpers — do not duplicate.

**Commit:** `TDD cycle 3.1: compile WorkflowEmailQueue table when triggers present`

#### Cycle 3.2 — RED: compiled output contains NO real provider API URLs

**Test code:**
```javascript
it('does NOT contain real provider API calls (no live sends in default build)', () => {
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer_email
  status, default 'pending'
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'Counter'
    body is 'Counter'
    provider is 'agentmail'`;
  const result = compileProgram(src);
  expect(result.errors).toHaveLength(0);
  expect(result.serverJS).not.toContain('api.agentmail.to');
  expect(result.serverJS).not.toContain('api.sendgrid.com');
  expect(result.serverJS).not.toContain('api.resend.com');
  expect(result.serverJS).not.toContain('api.postmarkapp.com');
  expect(result.serverJS).not.toContain('api.mailgun.net');
  expect(result.serverJS).not.toContain('AGENTMAIL_API_KEY');
  expect(result.serverJS).not.toContain('SENDGRID_KEY');
});
```

**Expected red:** if any cycle accidentally adds real-API code, this fails.

**GREEN:** ensure the compileWhenStatusChanges path ONLY inserts into the local queue table, never reaches out to a real provider. This test is a regression guard for Phases 4-7.

**Commit:** `TDD cycle 3.2: assert no real-provider API calls in default build`

---

### Phase 4 — Compiler injects queue-insert into status-changing URL handlers

#### Cycle 4.1 — RED: queue-insert appears at end of any URL handler that updates entity.status to trigger value

**Test code:**
```javascript
describe('Triggered email — compiler URL handler integration', () => {
  it('injects queue-insert into URL handler that updates deal.status to awaiting', () => {
    const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
  customer_email
  status, default 'pending'
when user updates deal at /api/deals/:id/counter:
  deal's status is 'awaiting'
  save deal to Deals
  send back deal with success message
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'Counter'
    body is 'Counter offer'`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    // The PUT handler should now contain the queue-insert
    expect(result.serverJS).toContain("app.put('/api/deals/:id/counter'");
    expect(result.serverJS).toContain('workflow_email_queue');
    expect(result.serverJS).toContain("'Counter'");  // subject
    expect(result.serverJS).toContain("'pending'");  // queue_status default
  });
});
```

**Expected red:** queue-insert missing.

**GREEN:**
1. After parsing, scan all URL handlers (ENDPOINT and UPDATE_ENDPOINT nodes) for status assignments to the trigger value.
2. For each match, append a queue-insert statement to that handler's body BEFORE the response.
3. Resolve recipient expressions (`deal's customer_email`) at queue-insert time using the entity instance variable already in scope.

**REFACTOR:** extract the "scan handlers for status assignments" pass as `findStatusChangeHandlers(ast, entityName, statusValue)` for reuse.

**Commit:** `TDD cycle 4.1: inject queue-insert into status-changing URL handlers`

#### Cycle 4.2 — RED: same trigger fires for ALL handlers that change status to that value (not just the first)

**Test code:**
```javascript
it('injects queue-insert into multiple handlers if multiple change status to same value', () => {
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer_email
  status, default 'pending'
when user updates deal at /api/deals/:id/counter:
  deal's status is 'awaiting'
  save deal to Deals
when user updates deal at /api/deals/:id/awaiting:
  deal's status is 'awaiting'
  save deal to Deals
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'Awaiting'
    body is 'Now awaiting'`;
  const result = compileProgram(src);
  expect(result.errors).toHaveLength(0);
  // BOTH PUT handlers should have the queue-insert
  const counterIdx = result.serverJS.indexOf("/counter'");
  const awaitingIdx = result.serverJS.indexOf("/awaiting'");
  expect(counterIdx).toBeGreaterThan(-1);
  expect(awaitingIdx).toBeGreaterThan(-1);
  // Count occurrences of the queue insert pattern
  const matches = result.serverJS.match(/workflow_email_queue/g) || [];
  expect(matches.length).toBeGreaterThanOrEqual(3); // 1 CREATE TABLE + 2 INSERTs
});
```

**Expected red:** only one handler gets the insert.

**GREEN:** loop the inject pass over all matching handlers, not just the first.

**Commit:** `TDD cycle 4.2: inject queue-insert into all handlers matching trigger`

#### Cycle 4.3 — RED: missing recipient field warns but doesn't break the build

**Test code:**
```javascript
it('warns when recipient field is missing on entity but still emits queue insert', () => {
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
when user updates deal at /api/deals/:id/counter:
  deal's status is 'awaiting'
  save deal to Deals
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'Counter'
    body is 'Counter'`;
  const result = compileProgram(src);
  expect(result.errors).toHaveLength(0);  // warn, not error
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(result.warnings[0].message).toContain('customer_email');
  expect(result.warnings[0].message).toContain('Deals');
  // Queue insert still happens (degraded — recipient_email will be null at runtime)
  expect(result.serverJS).toContain('workflow_email_queue');
});
```

**Expected red:** either silent (no warning) or hard error (breaks the build).

**GREEN:** in the recipient-resolution path, check that the referenced field exists on the entity table; if not, push a warning but still emit the insert with a null/empty recipient.

**Commit:** `TDD cycle 4.3: warn on missing recipient field, do not break build`

---

### Phase 5 — Validator catches malformed declarations

#### Cycle 5.1 — RED: validator warns when when-trigger has no matching status-change handler

**Test code:**
```javascript
describe('Triggered email — validator', () => {
  it('warns when when-trigger has no URL handler that sets the trigger value', () => {
    const src = `build for javascript backend
database is local memory
create a Deals table:
  customer_email
  status, default 'pending'
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'Counter'
    body is 'Counter'`;
    const result = compileProgram(src);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain('never fires');
    expect(result.warnings[0].message).toContain('awaiting');
  });
});
```

**Expected red:** silent — no warning even though the trigger can never fire.

**GREEN:** add validator pass that scans for WHEN_STATUS_CHANGES nodes and confirms there's at least one URL handler that assigns the trigger value to the entity's status.

**Commit:** `TDD cycle 5.1: warn on never-firing when-triggers`

#### Cycle 5.2 — RED: validator catches body referencing undefined variable

**Test code:**
```javascript
it('warns when email body references undefined variable', () => {
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer_email
  status, default 'pending'
when user updates deal at /api/deals/:id/counter:
  deal's status is 'awaiting'
  save deal to Deals
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'Counter'
    body is 'Hello {nonexistent_var}'`;
  const result = compileProgram(src);
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(result.warnings.some(w => w.message.includes('nonexistent_var'))).toBe(true);
});
```

**Expected red:** silent — undefined-var slips to runtime.

**GREEN:** scan body string for `{var}` interpolation references; check each against entity fields + scope vars.

**Commit:** `TDD cycle 5.2: warn on body interpolation referencing unknown variables`

#### Cycle 5.3 — RED: validator hard-errors on bad provider name

**Test code:**
```javascript
it('hard-errors on unknown provider name', () => {
  const src = `build for javascript backend
database is local memory
create a Deals table:
  customer_email
  status, default 'pending'
when user updates deal at /api/deals/:id/counter:
  deal's status is 'awaiting'
when deal's status changes to 'awaiting':
  send email to deal's customer_email:
    subject is 'Counter'
    body is 'Counter'
    provider is 'agentmial'`;
  const result = compileProgram(src);
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors[0].message).toContain('agentmial');
  expect(result.errors[0].message).toContain('valid providers');
  expect(result.errors[0].message).toContain('agentmail');  // suggest the closest valid name
});
```

**Expected red:** silent — bad provider name gets through.

**GREEN:** add provider-name allow-list (`['agentmail', 'sendgrid', 'resend', 'postmark', 'mailgun']`); error with helpful "did you mean X?" suggestion.

**Commit:** `TDD cycle 5.3: hard-error on unknown provider name with suggestion`

---

### Phase 6 — Docs cascade

#### Cycle 6.1 — RED: docs mention triggered email across all required surfaces

**Test code:**
```javascript
it('documents triggered email across all 11 cascade surfaces', () => {
  const intent = readFileSync(pathJoin(REPO_ROOT, 'intent.md'), 'utf8');
  const syntax = readFileSync(pathJoin(REPO_ROOT, 'SYNTAX.md'), 'utf8');
  const ai = readFileSync(pathJoin(REPO_ROOT, 'AI-INSTRUCTIONS.md'), 'utf8');
  const guide = readFileSync(pathJoin(REPO_ROOT, 'USER-GUIDE.md'), 'utf8');
  const features = readFileSync(pathJoin(REPO_ROOT, 'FEATURES.md'), 'utf8');
  const faq = readFileSync(pathJoin(REPO_ROOT, 'FAQ.md'), 'utf8');
  const sysprompt = readFileSync(pathJoin(REPO_ROOT, 'playground', 'system-prompt.md'), 'utf8');
  expect(intent).toContain('WHEN_STATUS_CHANGES');
  expect(intent).toContain('Triggered Workflow Email');
  expect(syntax).toContain("when deal's status changes to");
  expect(ai).toContain('when X status changes to');
  expect(guide).toContain("when deal's status changes to");
  expect(features).toContain('Triggered emails');
  expect(faq).toContain('triggered email queue');
  expect(sysprompt).toContain("when X's status changes to");
});
```

**Expected red:** docs not yet updated.

**GREEN:** update each doc per the cascade table above. Same commit as Cycle 6.1.

**Commit:** `TDD cycle 6.1: docs cascade for triggered email primitive`

---

### Phase 7 — Template smoke test

#### Cycle 7.1 — GREEN verification: all 8 core templates compile clean

**Test command:**
```powershell
node -e "import { compileProgram } from './index.js'; import fs from 'fs'; ['todo-fullstack','crm-pro','blog-fullstack','live-chat','helpdesk-agent','booking','expense-tracker','ecom-agent'].forEach(a => { const r = compileProgram(fs.readFileSync('apps/'+a+'/main.clear','utf8')); console.log(a+': '+r.errors.length+' errors, '+r.warnings.length+' warnings'); });"
```

**Success criteria:** 0 errors per template, no NEW warnings beyond what existed before this primitive landed.

**Commit:** `TDD cycle 7.1: verify 8 core templates compile clean post-triggered-email`

---

### Phase B-1 — DEFERRED — Live email delivery worker

Do NOT start this phase unless Russell explicitly:
1. Asks for live email delivery
2. Provides AgentMail and/or SendGrid env-var-backed API keys
3. Confirms readiness to handle real customer email outbound

When unblocked, B-1 cycles will:
- **Body + subject template substitution at queue-insert time** (REAL GAP, surfaced 2026-04-28 evening). Today the compiler emits the body as a literal string — every customer gets identical text, no mention of which deal, no customer name, no discount amount. The Phase 5.2 validator catches `{nonexistent_field}` typos but the runtime substitution doesn't exist. Fix: when emitting the queue-insert, swap any `{field}` reference in `node.body` and `node.subject` for a runtime expression that reads the field off the entity record. Pattern: `body: "Hi " + (_record && _record.customer != null ? _record.customer : '') + ", we countered at " + (_record && _record.discount_percent != null ? _record.discount_percent : '') + "%"` — or use a small `_clear_interpolate(template, record)` runtime helper for cleaner emit. Without this, live sends would be useless ("Sarah from our team has prepared a counter offer for you" with no name, no deal, no number). Coupled to live delivery because: if you're not actually sending, the static text is fine; if you are sending, real personalization is non-negotiable.
- Add `enable live email delivery via agentmail` directive (parser + validator)
- Background worker that polls `WorkflowEmailQueue` for pending rows + sends real emails via the declared provider
- Provider adapter modules for AgentMail (default), SendGrid (fallback), Resend (modern alt), Postmark, Mailgun
- Idempotency on provider event IDs
- Reply webhook handler that updates queue rows (status: replied, replied_at)
- Signed callback verification before any reply event mutates parent entity state
- Retry logic with exponential backoff
- Failed-send observability (queue rows with status=failed, last_error populated, attempts incremented)

B-1 success criteria:
- No API keys in source, tests, screenshots, logs, or committed files
- Live worker retries safely
- Provider event IDs are idempotent
- Signed callbacks are mandatory before reply state mutations
- Default builds (no `enable live email delivery via X` directive) STILL emit no real-API code paths

---

## Edge cases covered

| Scenario | Expected behavior | Test cycle |
|----------|-------------------|------------|
| Same trigger fires from 3 different URL handlers | All 3 get the queue-insert | Cycle 4.2 |
| Two when-triggers on same entity for different status values | Both compile cleanly, both fire on their respective transitions | (extend 4.1 test) |
| Recipient field missing | Warn, queue with blank recipient | Cycle 4.3 |
| Body interpolates a deleted entity field | Warn at compile time | Cycle 5.2 |
| Provider name typo | Hard error with suggestion | Cycle 5.3 |
| Trigger value never set by any handler | Warn ("never fires") | Cycle 5.1 |
| `enable live email delivery via X` directive present BUT API key env var missing | Hard error at compile time (B-1 phase only) | B-1 |
| Existing `send email:` syntax (non-triggered direct) | Continues to work unchanged | Add to existing email tests at clear.test.js:9812 |
| Existing `send email via sendgrid:` SERVICE_CALL | Continues to work unchanged | Verified by clear.test.js:17827 staying green |

---

## Success criteria (overall)

- All 13 TDD cycle tests green
- `node clear.test.js` green (no regressions)
- All 8 core templates compile clean
- All 11 doc surfaces updated
- NO real-provider API calls in compiled output (Phase 7 regression test)
- Pre-push hook passes

---

## Stop conditions (overall)

- Any phase's test cycle fails after 3 GREEN attempts → escalate
- Template smoke regression → fix before next phase
- Doc cascade hook warns → land doc updates same commit
- Real-provider API leak detected → ROLLBACK and audit before continuing
- Disambiguation between `when user sends ...` and `when X's status changes ...` becomes brittle → revisit syntax design before continuing

---

## What this plan deliberately does NOT cover

- Real email sending (B-1 phase, deferred)
- Reply webhook integration (B-1)
- Multi-provider fallback (B-1)
- Email templates / shared content blocks (post-Tier-1)
- Email open/click tracking (post-Tier-1, requires real sends)
- Marketing-email features (segmentation, A/B test) — not the use case

---

## Iteration handoff

- Plan written autonomously during Russell's AFK /loop directive (2026-04-27).
- **Russell must review and approve before execution.** REVIEW FREEZE clause is real.
- This plan can land AFTER `feature/queue-primitive-tier1` merges to main.
- Next /loop iteration writes the **CSV export primitive plan** at `plans/plan-csv-export-primitive-04-27-2026.md` — the third and last primitive before all 5 Marcus apps can be migrated to use the full primitive set.
