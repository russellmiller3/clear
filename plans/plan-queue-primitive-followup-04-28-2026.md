# Queue Primitive Tier 1 — Post-Ship Follow-Up Plan

**One-line goal:** apply Russell's 2026-04-28 design review to the shipped queue primitive — close the 14-year-old test gap, eliminate silent-skip parser behavior, ship Python parity, and add the syntax synonyms a manager would actually type.

**Why this is a NEW plan, not an edit to the original:** the original plan (`plans/plan-queue-primitive-tier1-04-27-2026.md`) shipped to main. Per the "plans are historical once done" rule, the original stays as the executed record. This file captures the follow-up cycles surfaced by the 2026-04-28 red-team review.

**Branch:** `chore/queue-redteam-and-syntax-followup` already exists. Land in pieces — each phase is independently shippable.

**Source of authority:**
- The original plan + red-team chat 2026-04-28
- Russell's design feedback rules saved as memory in `feedback_clear_syntax_design_principles.md`
- `CLAUDE.md` "Build Python Alongside JS" rule (the queue primitive currently violates this)

---

## Red-Team Findings (each becomes a phase below)

| # | Severity | Finding | How it shipped wrong |
|---|----------|---------|----------------------|
| RT-1 | **Critical** | Queue Python emission is a TBD stub | `compileQueueDef` returns `# queue for X: tables emitted by Phase 2 (Python target TBD)` when `ctx.lang === 'python'`. Violates the new MANDATORY "Build Python Alongside JS" rule. Python customers get nothing. |
| RT-2 | **Critical** | Parser silently skips unknown body lines | If Marcus types `email rep when approve` (instead of `notify rep on approve`), the parser's `// Unknown body line — skip but don't error (tolerant for forward-compat)` swallows it. App builds, build is wrong, Marcus has no idea why. |
| RT-3 | **Moderate** | `notify` is too vague — `email` should be canonical | "Notify" doesn't tell you HOW. Future communication primitives need to name the mechanism: `email`, `text`, `slack`, `webhook`. The queue primitive should accept `email <role> when <action>` as canonical, with `notify ... on ...` demoted to legacy alias. |
| RT-4 | **Moderate** | Plural entity names don't depluralize | `queue for deals` produces a URL like `/api/dealss/queue` (double-S). Manager would naturally type the plural. Strip a trailing `s` if the depluralized form matches an entity table. |
| RT-5 | **Low** | `awaiting customer` is more naturally `waiting on customer` | Both should work; the canonical example should pick the form people say out loud. |
| RT-6 | **Low** | Manager-form synonyms missing | `options:` and `buttons:` are natural alternatives to `actions:` for non-coders. |
| RT-7 | **Low** | No 14-year-old / manager test in the syntax review process | The original plan had no "would a manager type this?" gate. Add a checklist hook for future primitives so this gap doesn't repeat. |

---

## Phase Order

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| F1 | A | none | required: hard-fail on unknown body lines (RT-2) |
| F2 | A | F1 | required: pluralize on the way in (RT-4) |
| F3 | A | F1 | required: `email <role> when <action>` canonical, `notify ... on ...` legacy alias (RT-3) |
| F4 | A | F1 | required: `options:` / `buttons:` synonyms (RT-6); `waiting on customer` example (RT-5) |
| F5 | A | F1-F4 | required: Python parity for queue primitive (RT-1) |
| F6 | A | F1-F5 | required: docs cascade re-run for the new canonical forms |
| F7 | A | F1-F6 | required: 8 core templates compile clean (smoke gate) |

**Default track:** Path A — additive, ship in order, every phase has a green-tests gate.

**Why this order:** F1 (hard-fail) lands first because it surfaces every silent-skip bug the rest of the phases might rely on. F2-F4 are syntax additions that ride on top of F1's stricter parser. F5 (Python) lands after the JS surface stabilizes so we don't double-port. F6/F7 are the cascade + smoke gate.

---

## Execution Rules

- **Plan quality bar:** stupidest LLM that can follow instructions executes completely.
- **Branch rule:** `chore/queue-redteam-and-syntax-followup` from main.
- **TDD cycle structure:** RED → GREEN → REFACTOR → ONE commit per phase.
- **Compiler test gate:** `node clear.test.js` green at every commit.
- **Template smoke gate:** all 8 core templates compile clean after every phase.
- **Stop condition per phase:** all that phase's cycle tests green, no regressions.

---

## Mandatory Compiler Improvements

Per project CLAUDE.md "Improve The Compiler As You Go" — every gap surfaced becomes a generic compiler rule:

| Gap exposed | Required compiler improvement | Test home |
|-------------|-------------------------------|-----------|
| Silent skip swallows typos | Parser hard-errors on unknown body lines inside any block, with "did you mean..." suggestions | F1 |
| Plural entity names produce wrong URLs | Parser depluralizes if the singular form matches a declared table | F2 |
| "notify" doesn't say how | Synonym layer maps `email <role> when <action>` to TRIGGERED_EMAIL action under the hood | F3 |
| Manager-form synonyms missing | Synonym table accepts `options:` / `buttons:` as `actions:` aliases | F4 |
| Python target lags JS | Python emission for queue mirrors JS emission; cross-target smoke test fails build if either drifts | F5 |

These are reusable rules: any future primitive benefits from F1's hard-fail + F4's synonym pattern.

---

## TDD Cycles

### Phase F1 — Hard-fail on unknown queue body lines

#### Cycle F1.1 — RED: parser errors on unknown line inside queue block

**Test command:**
```
node clear.test.js --grep "Queue primitive — parser hard-fail"
```

**Test code** (append to `clear.test.js` after the existing "Queue primitive — parser" describe block):
```javascript
describe('Queue primitive — parser hard-fail', () => {
  it('errors on unknown line inside queue block with did-you-mean hint', () => {
    const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject
  email rep when approve`;
    const ast = parse(src);
    expect(ast.errors.length).toBeGreaterThan(0);
    const err = ast.errors[0];
    expect(err.message).toContain("email rep when approve");
    expect(err.message.toLowerCase()).toContain("did you mean");
  });

  it('errors on a typo in `notify` clause', () => {
    const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject
  notif rep on approve`;
    const ast = parse(src);
    expect(ast.errors.length).toBeGreaterThan(0);
    expect(ast.errors[0].message.toLowerCase()).toContain('notif');
  });
});
```

**Expected red:** parser silently skips both lines today; `ast.errors` is empty.

**GREEN implementation:**
1. In `parser.js` `parseQueueDef`, the trailing `// Unknown body line — skip but don't error (tolerant for forward-compat)` comment + `i++` becomes an explicit error push.
2. The error message includes the offending line text and a "did you mean..." hint computed by Levenshtein distance against the known clause keywords (`reviewer`, `actions:`, `notify`, `email`, `no export`).
3. Limit suggestions to distance ≤ 3 to avoid noise.

**REFACTOR:** extract a shared `suggestClosestKeyword(input, candidates)` helper. Reusable for any block-form parser that needs friendly errors (workflow, agent, policy, etc.).

**Commit:** `TDD F1.1: queue parser hard-fails on unknown body lines with did-you-mean`

---

### Phase F2 — Pluralize on the way in

#### Cycle F2.1 — RED: `queue for deals` resolves to the same entity as `queue for deal`

**Test code:**
```javascript
describe('Queue primitive — pluralization', () => {
  it('accepts plural entity name and depluralizes if singular matches a declared table', () => {
    const src = `create a Deals table:
  customer
  status, default 'pending'
queue for deals:
  reviewer is 'CRO'
  actions: approve, reject`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const q = ast.body.find(n => n.type === NodeType.QUEUE_DEF);
    expect(q.entityName).toBe('deal');
  });

  it('keeps singular form unchanged when no plural-singular ambiguity', () => {
    const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const q = ast.body.find(n => n.type === NodeType.QUEUE_DEF);
    expect(q.entityName).toBe('deal');
  });
});
```

**Expected red:** today, `queue for deals` parses with `entityName = 'deals'` and the URL emit produces `/api/dealss/queue`.

**GREEN implementation:**
1. After parsing the entity name, check `ctx.declared.tables` (or pass declared tables into the parse call) for an exact match.
2. If `entityName.endsWith('s')` AND `entityName.slice(0, -1)` matches a declared table, set `entityName = entityName.slice(0, -1)`.
3. Otherwise leave it alone.

**REFACTOR:** extract `depluralizeIfTable(name, declaredTables)` for reuse.

**Commit:** `TDD F2.1: queue parser depluralizes entity name to match declared table`

---

### Phase F3 — `email <role> when <action>` canonical, demote `notify`

#### Cycle F3.1 — RED: parser accepts `email <role> when <action>, <action>`

**Test code:**
```javascript
describe('Queue primitive — email canonical', () => {
  it('parses email <role> when <action>, <action> as the canonical form', () => {
    const src = `create a Deals table:
  customer
  customer_email
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter
  email customer when counter
  email rep when approve, reject`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const q = ast.body.find(n => n.type === NodeType.QUEUE_DEF);
    expect(q.notifications).toEqual([
      { role: 'customer', onActions: ['counter'], mechanism: 'email' },
      { role: 'rep', onActions: ['approve', 'reject'], mechanism: 'email' },
    ]);
  });

  it('still accepts notify <role> on <action> as legacy alias', () => {
    const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject
  notify rep on approve`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const q = ast.body.find(n => n.type === NodeType.QUEUE_DEF);
    expect(q.notifications[0].role).toBe('rep');
    expect(q.notifications[0].onActions).toEqual(['approve']);
  });
});
```

**Expected red:** parser doesn't recognize `email customer when counter`.

**GREEN implementation:**
1. In `parseQueueDef`, add a recognizer for `email <role> when <action>, <action>` parallel to the existing `notify <role> on <action>` recognizer.
2. Both push to `node.notifications` with a new `mechanism` field (`'email'` vs `'notify'`). Default to `'email'` when ambiguous.
3. The compiler's notification-row insert does not need to change yet — the queue primitive's notifications still queue rows with no mechanism distinction in this phase. Phase F-future (separate plan) will route `mechanism: 'email'` rows to the WorkflowEmailQueue.

**REFACTOR:** extract a shared sub-clause parser (`parseRoleActionClause(tokens, roleVerb, actionsVerb)`) since both forms share the same shape — different verbs.

**Commit:** `TDD F3.1: email <role> when <action> canonical; notify <role> on <action> legacy alias`

---

### Phase F4 — Manager-form synonyms

#### Cycle F4.1 — RED: parser accepts `options:` and `buttons:` as `actions:`

**Test code:**
```javascript
describe('Queue primitive — manager synonyms', () => {
  it('accepts options: as a synonym for actions:', () => {
    const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  options: approve, reject`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const q = ast.body.find(n => n.type === NodeType.QUEUE_DEF);
    expect(q.actions).toEqual(['approve', 'reject']);
  });

  it('accepts buttons: as a synonym for actions:', () => {
    const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  buttons: approve, reject`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const q = ast.body.find(n => n.type === NodeType.QUEUE_DEF);
    expect(q.actions).toEqual(['approve', 'reject']);
  });

  it('accepts waiting on customer as canonical action name', () => {
    const src = `create a Deals table:
  customer
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, waiting on customer`;
    const ast = parse(src);
    expect(ast.errors).toHaveLength(0);
    const q = ast.body.find(n => n.type === NodeType.QUEUE_DEF);
    expect(q.actions).toContain('waiting on customer');
  });
});
```

**Expected red:** parser only recognizes `actions:`.

**GREEN implementation:**
1. In `parseQueueDef`, accept `actions`, `options`, or `buttons` as the leading keyword for the action list. All three produce the same AST shape.
2. Multi-word actions parse identically to before — `waiting on customer` joins to a 3-word action name.
3. The URL slug logic (already first-word-only) handles `waiting on customer` → `/waiting`.

**REFACTOR:** none — this is additive.

**Commit:** `TDD F4.1: options: / buttons: synonyms; waiting on customer canonical`

---

### Phase F5 — Python parity for queue primitive

#### Cycle F5.1 — RED: Python target emits queue tables + URL handlers

**Test code:**
```javascript
describe('Queue primitive — Python target', () => {
  it('emits Python audit table + URL handlers for queue for deal', () => {
    const src = `build for python backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    // Python file should contain the audit table + the per-action endpoints
    expect(result.python || result.serverPython).toContain('deal_decisions');
    expect(result.python || result.serverPython).toMatch(/@app\.put\(["']\/api\/deals\/\{id\}\/approve/);
    expect(result.python || result.serverPython).toMatch(/@app\.put\(["']\/api\/deals\/\{id\}\/reject/);
  });
});
```

**Expected red:** today's Python emission returns the TBD stub.

**GREEN implementation:**
1. In `compiler.js` `compileQueueDef`, replace the `if (ctx.lang === 'python') return TBD-stub` early-out with full Python emission.
2. Mirror the JS branch: audit table via Python's table helper, optional notifications table, filtered GET, per-action PUT handlers (auth-gated via FastAPI's `Depends(get_current_user)` pattern that already exists for other auth-required endpoints), CSV export.
3. Reuse `actionToTerminalStatus` and the same notify/email handling.

**REFACTOR:** if the JS and Python emissions duplicate too much logic, extract a `compileQueueDefShared(node, ctx)` that returns an intermediate spec, and let `compileQueueDefJS` / `compileQueueDefPython` render that spec.

**Commit:** `TDD F5.1: queue primitive Python parity (audit + notifications + URLs + CSV)`

#### Cycle F5.2 — GREEN verification: cross-target smoke test green

**Test command:**
```
node scripts/cross-target-smoke.mjs
```

**Success criteria:** every template × every target compiles clean and syntax-checks. No drift between JS and Python emissions for any queue-using template.

**Commit:** `TDD F5.2: cross-target smoke green for queue primitive`

---

### Phase F6 — Docs cascade re-run

#### Cycle F6.1 — RED: docs reflect the new canonical forms

**Test code:**
```javascript
it('docs cascade reflects email canonical + plural fix + waiting on customer', () => {
  const intent = readFileSync(pathJoin(REPO_ROOT, 'intent.md'), 'utf8');
  const syntax = readFileSync(pathJoin(REPO_ROOT, 'SYNTAX.md'), 'utf8');
  const ai = readFileSync(pathJoin(REPO_ROOT, 'AI-INSTRUCTIONS.md'), 'utf8');
  const sysprompt = readFileSync(pathJoin(REPO_ROOT, 'playground', 'system-prompt.md'), 'utf8');
  // Email canonical
  expect(syntax).toContain('email customer when');
  expect(ai).toContain('email <role> when <action>');
  expect(sysprompt).toContain('email customer when');
  // Plural OK
  expect(syntax.toLowerCase()).toMatch(/queue for deals?\b/);
  // waiting on customer
  expect(syntax).toContain('waiting on customer');
});
```

**Expected red:** docs still show `notify`, `awaiting customer`, only-singular forms.

**GREEN implementation:** update each doc (intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, FEATURES.md, FAQ.md, playground/system-prompt.md, landing/marcus.html, CHANGELOG.md) to use the new canonical examples. Demote the old forms to "legacy alias" notes.

**Commit:** `TDD F6.1: docs cascade re-run for email canonical + plural + waiting on customer`

---

### Phase F7 — Template smoke gate

#### Cycle F7.1 — GREEN verification: 8 core templates compile clean

**Test command:**
```
node -e "import { compileProgram } from './index.js'; import fs from 'fs'; ['todo-fullstack','crm-pro','blog-fullstack','live-chat','helpdesk-agent','booking','expense-tracker','ecom-agent'].forEach(a => { const r = compileProgram(fs.readFileSync('apps/'+a+'/main.clear','utf8')); console.log(a+': '+r.errors.length+' errors'); });"
```

**Success criteria:** 0 errors per template; the 4 migrated Marcus apps (Deal Desk + Approval Queue + Onboarding Tracker + Internal Request Queue) still compile clean after the parser becomes stricter.

**Commit:** `TDD F7.1: 8 core templates clean post-followup`

---

## Edge cases covered

| Scenario | Expected behavior | Test cycle |
|----------|-------------------|------------|
| Manager types `make a queue for deals` (with leading verb) | Parser still produces a QUEUE_DEF — accept `make a queue for X:` as a synonym for `queue for X:` | Add to F4 (extension) |
| Plural entity name with no matching singular | Leave as-is (don't depluralize aggressively) | F2.1 |
| Both `email customer when X` AND `notify customer on X` in same block | Both work; merged into the same notifications array | F3.1 |
| Action list with mixed punctuation (`approve, reject; counter`) | Hard-error with helpful suggestion (commas only) | Add to F1 (extension) |

---

## Success criteria (overall)

- All F1-F6 TDD cycles green
- `node clear.test.js` green (no regressions)
- All 8 core templates + 4 migrated Marcus apps compile clean on BOTH JS and Python targets
- All 11 doc surfaces reflect the new canonical forms
- Pre-push hook passes (no Meph-eval skip)

---

## Stop conditions (overall)

- F1 (hard-fail) breaks any of the 4 migrated Marcus apps → fix the apps' syntax in the same commit before continuing
- Python parity cycle (F5) reveals architectural gap (JS emission too JS-specific to mirror) → escalate, redesign emit to use a shared spec
- Doc cascade hook fires a missing-doc warning → land doc updates same commit

---

## What this plan deliberately does NOT cover

- Routing of `email <role> when <action>` rows into the WorkflowEmailQueue → that's the triggered-email primitive's plan, separate file
- Auto-render of action buttons in queue page → still deferred until customer evidence demands
- Multi-stage queues (Tier 2) → separate plan, gated on a second multi-stage app
- Manager-form `make a queue for deals` leading-verb synonym → flagged in edge cases, can land in a follow-up

---

## Iteration handoff

- This plan was written autonomously during Russell's red-team review (2026-04-28).
- **Russell must review and approve before execution.** The findings table at the top is the audit trail; phases F1-F7 are the proposed fix sequence.
- Recommended approach: ship F1 first as its own commit (it's the highest-value fix and may surface broken-app cleanup work), then F2-F4 in one batch, then F5 in its own batch, then F6 docs.
