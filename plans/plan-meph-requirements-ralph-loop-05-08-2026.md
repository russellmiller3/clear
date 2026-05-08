# Meph Requirements + Ralph Loop Plan - 05-08-2026

One-line summary: before Meph builds a complex app, he drafts readable requirements, the user approves them, then Ralph grades the finished Clear source against those requirements until it passes or hits a hard cap.

## Phase Order (load-bearing)

**Default track:** Path A - local Clear-native requirements gate plus Ralph evidence loop.

**Escalation:** Path B - external managed-agent style grader only if Path A cannot judge broad app quality without too many false positives.

**Why:** Clear already has the editor, tool loop, pattern preflight, compiler, tests, and Snap retry point. The cheapest correct move is to add a requirements contract and grader at those existing joints before paying for a separate orchestration layer.

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| 1 | A | Current branch and recon | required |
| 2 | A | Phase 1 | required |
| 3 | A | Phase 2 | required |
| 4 | A | Phase 3 | required |
| 5 | A | Phase 4 | required |
| 6 | A | Phase 5 | required |
| 7 | A | Phase 6 | required |
| 8 | A | Phase 7 | required |
| B-1 | B | Phase 8 shows Ralph cannot produce stable judgments | gated |

## The Problem

Russell's actual user prompt is usually vague:

```text
build me a deal approval app
```

Meph currently treats that as permission to start coding. Pattern preflight helps him retrieve known shapes, but it does not make him state the contract first. Snap retries compile errors, but it only knows "the code compiles." It does not know whether the built app still matches what the user meant.

That leaves three expensive failure modes:

1. Meph builds the wrong app cleanly.
2. The user sees code before they see the contract.
3. The app reaches "done" with missing business behavior.

## The Fix

Add a two-stage gate:

```text
User asks for app
      |
      v
Meph drafts requirements only
      |
      v
User reviews and approves requirements
      |
      v
Pattern preflight searches docs + pattern DB using approved requirements
      |
      v
Meph writes tests + Clear app
      |
      v
Snap fixes compile errors
      |
      v
Ralph grades app against approved requirements
      |
      +-- missing evidence --> Meph revises
      |
      v
Done
```

Ralph is not a second hint system. Ralph is the "are we actually done?" loop. Pattern preflight answers "what shapes should I use?" Snap answers "does this compile?" Ralph answers "does this satisfy the approved requirements?"

## Existing Overlap

| Existing system | Where | What it already does | What this plan changes |
|-----------------|-------|----------------------|------------------------|
| Pattern preflight | `studio/supervisor/meph-pattern-preflight.js` | Detects complex requests, injects syntax docs, searches pattern DB | Feed it approved requirements, not only raw vague prompts |
| Chat stream | `studio/server.js` around `/api/chat` | Streams Meph text, tools, code updates, done events | Add `requirements_review`, `requirements_audit`, and `requirements_blocked` events |
| Snap loop | `studio/snap-layer.js` and `studio/server.js` before `done` | Retries Meph when compile errors remain | Ralph runs after Snap succeeds |
| Tool dispatcher | `studio/meph-tools.js` | Runs edit, compile, browse templates, tests | Block mutating tools before approval |
| Test blocks | `parser.js` + `compiler.js` | Parses and compiles `test:` blocks | Requirements become the pre-TDD contract; tests follow approval |
| Pattern DB | `clear_programming_patterns` | Stores trusted snippets and primitive examples | Stays the pattern store; requirements/audits are separate contract data |

## Official Outcome-Grader Reference

The useful lesson from Claude Managed Agents is not "use their product." It is the loop shape:

- Define "done" up front.
- Use a rubric that is more specific than the user's vague task.
- Grade in a separate pass.
- Give the builder concrete gap feedback.
- Stop after a capped number of iterations.

Sources:

- [Claude Managed Agents - Define outcomes](https://platform.claude.com/docs/en/managed-agents/define-outcomes)
- [Claude Cookbook - Outcomes: agents that verify their own work](https://platform.claude.com/cookbook/managed-agents-cma-verify-with-outcome-grader)

Clear should copy that shape, but keep the implementation local:

```text
Managed Agents outcome        Clear equivalent
----------------------        ----------------
description                   approved requirements
rubric                        generated requirement checks
grader context                Ralph audit pass
needs_revision result          injected Ralph feedback
max_iterations                RALPH_MAX_RETRIES
```

The cookbook's most important warning is that weak graders approve everything. Ralph must require evidence: source lines, AST nodes, compiler output, test results, or pattern hits.

## Clear-Est Syntax

Use this syntax in generated Clear source:

```clear
requirements:
  logged-in sellers can submit deals
  each deal stores customer, amount, discount, segment, status, and approver
  deals under 50000 route to manager approval
  deals at least 50000 route to VP approval
  approvers can approve or reject pending deals
  approval actions use optimistic lock protection

test:
  user can create a pending deal
  deals under 50000 route to the manager queue
  deals at least 50000 route to the VP queue
  two approvers cannot both approve the same deal
```

Why this is the Clear shape:

- It is a readable top-level contract.
- It is not YAML.
- It does not use tags.
- Each requirement is one line.
- Each line says behavior, not implementation trivia.
- The block comes before `test:` and before runtime code.

Do not use:

```clear
@requirements
- auth: true
- approvalQueue: manager | vp
```

That is config disguised as requirements. Clear should read like the promise the app makes to the user.

## New Syntax Contract

Add one new AST node:

```js
NodeType.REQUIREMENTS = 'requirements'
```

Shape:

```js
{
  type: 'requirements',
  items: [
    { text: 'logged-in sellers can submit deals', line: 3 },
    { text: 'each deal stores customer, amount, discount, segment, status, and approver', line: 4 }
  ],
  line: 2
}
```

Parsing rules:

- `requirements:` opens an indented raw-text block.
- Blank lines inside the block are ignored.
- Lines may optionally start with `-`; the parser strips the dash.
- Each item preserves the source line number.
- Empty blocks are parse errors.
- Nested Clear statements inside `requirements:` are not parsed as code.

Compiler rules:

- `requirements:` emits no JavaScript, Python, HTML, or server code.
- `compileProgram(source).requirements` returns the normalized item list.
- A source file with only `requirements:` can compile without runtime output.
- The compiler warns if requirements exist but no `test:` block exists.
- The warning is advisory in Phase 2, blocking only in Ralph after app-building starts.

## Requirements Quality Gate

Good requirements must be concrete enough for a user to review and for Ralph to grade.

`validateRequirements(items, originalUserText)` returns:

```js
{
  ok: true,
  errors: [],
  warnings: [],
  normalized: [
    { id: 'req_1', text: 'logged-in sellers can submit deals', keywords: ['sellers', 'submit', 'deals'] }
  ]
}
```

Blockers:

| Bad line | Why blocked | Better line |
|----------|-------------|-------------|
| `the app is robust` | not observable | `invalid deal submissions show an error` |
| `approval queue works` | too vague | `pending deals appear in manager and VP queues` |
| `good dashboard` | subjective | `dashboard shows pending, approved, rejected, and total deal counts` |
| `full CRUD` | jargon bundle | `users can create, update, and archive deals` |
| `production ready` | fake promise | `approval actions use optimistic lock protection` |

Validation rules:

- Minimum 5 requirements for a complex app.
- Maximum 20 requirements for first version.
- Each line must be 5-160 characters.
- Each line must contain an observable verb.
- Each line must contain at least one domain noun from the user request or generated contract.
- Reject duplicate or near-duplicate lines.
- Reject generic adjectives without measurable behavior.
- Warn on compound lines with three or more verbs.

Observable verbs list for Phase 1:

```js
[
  'can', 'stores', 'shows', 'routes', 'requires', 'rejects',
  'filters', 'searches', 'creates', 'updates', 'archives',
  'approves', 'records', 'exports', 'sends', 'blocks', 'uses'
]
```

Generic blocked words:

```js
[
  'robust', 'production-ready', 'complete', 'full-featured',
  'nice', 'good', 'modern', 'intuitive', 'seamless'
]
```

## Server Enforcement

The server owns the gate. The prompt can explain it, but enforcement cannot depend on Meph remembering.

Incoming `/api/chat` body gains:

```js
{
  requirementsMode: 'auto' | 'off',
  approvedRequirements: string[] | null,
  approvedRequirementsId: string | null
}
```

Defaults:

- `requirementsMode` defaults to `auto`.
- `auto` applies only to complex app-building requests.
- Small syntax questions and bug-fix requests skip the review card.
- Tests and probes can set `requirementsMode: 'off'`.

Complex request detection should reuse the pattern-preflight detector but tighten it:

```js
const BUILD_APP_RE = /\b(build|create|make|implement|wire|add)\b/i;
const APP_NOUN_RE = /\b(app|dashboard|queue|workflow|portal|tracker|crm|approval|deal|ticket|order)\b/i;
```

Before approval:

- Server appends a requirements-only instruction to the last user message.
- Mutating tools are blocked.
- Read/search tools stay allowed.
- Meph may call `browse_templates` search, but cannot edit source yet.
- If Meph tries to write code, the tool returns a hard error.

Blocked tools before approval:

```js
[
  'edit_code:write',
  'patch_code',
  'write_file',
  'edit_file',
  'run_command',
  'run_app',
  'run_tests',
  'http_request',
  'click_element',
  'fill_input'
]
```

Allowed tools before approval:

```js
[
  'edit_code:read',
  'read_file',
  'browse_templates',
  'source_map',
  'highlight_code',
  'todo'
]
```

Tool block response:

```json
{
  "error": "Requirements approval is required before editing. Draft 5-20 concrete requirements for the user to approve first.",
  "code": "REQUIREMENTS_NOT_APPROVED"
}
```

After Meph drafts requirements:

- Server extracts a `requirements:` block from assistant text.
- Server validates it.
- Server emits `requirements_review`.
- Server ends the turn without claiming the app is built.

SSE event:

```js
{
  type: 'requirements_review',
  requirements: [
    'logged-in sellers can submit deals',
    'deals under 50000 route to manager approval'
  ],
  requirements_id: 'sha1-normalized-contract',
  errors: [],
  warnings: [],
  needsApproval: true
}
```

After approval:

- Frontend sends `approvedRequirements` and `approvedRequirementsId`.
- Server validates the id against normalized text.
- Pattern preflight searches using the approved requirements joined with the original user ask.
- Meph is instructed to add `requirements:` and `test:` before app code.
- Mutating tools are allowed.

## Ralph Loop

Ralph runs at the same lifecycle point as Snap, but only after Snap has nothing to fix.

Current server flow:

```text
Meph stops
  |
  v
compile errors?
  |
  +-- yes --> Snap retry
  |
  v
send done
```

New server flow:

```text
Meph stops
  |
  v
compile errors?
  |
  +-- yes --> Snap retry
  |
  v
approved requirements exist?
  |
  +-- no --> send done
  |
  v
Ralph audit passes?
  |
  +-- no --> Ralph retry
  |
  v
send done
```

Ralph config:

```js
{
  enabled: process.env.MEPH_REQUIREMENTS_RALPH !== '0',
  maxRetries: Number(process.env.MEPH_RALPH_MAX_RETRIES || 2),
  blockOnUnverified: process.env.MEPH_RALPH_BLOCK_UNVERIFIED !== '0'
}
```

Ralph audit result:

```js
{
  ok: false,
  summary: '4 of 6 requirements satisfied. 1 missing. 1 unverified.',
  items: [
    {
      id: 'req_1',
      text: 'logged-in sellers can submit deals',
      status: 'passed',
      evidence: [
        { kind: 'ast', nodeType: 'requires_auth', line: 42 },
        { kind: 'test', name: 'user can create a pending deal', status: 'passed' }
      ]
    },
    {
      id: 'req_4',
      text: 'deals at least 50000 route to VP approval',
      status: 'missing',
      reason: 'No route or conditional mentions amount threshold and VP approval.'
    },
    {
      id: 'req_6',
      text: 'approval actions use optimistic lock protection',
      status: 'unverified',
      reason: 'Approval update exists, but no optimistic-lock marker or stale-update test was found.'
    }
  ]
}
```

Status meanings:

| Status | Meaning | Blocks done? |
|--------|---------|--------------|
| `passed` | Ralph found evidence in AST, compile output, tests, or trusted pattern markers | No |
| `missing` | Ralph found no plausible implementation evidence | Yes |
| `unverified` | Ralph found partial evidence but not enough to claim done | Yes by default |
| `waived` | User explicitly approved a missing/unverified item | No, but logged |

Ralph retry message injected into Meph:

```text
Ralph checked the approved requirements before final done.

You are not done yet.

Missing:
- deals at least 50000 route to VP approval
  Evidence needed: route or conditional on amount threshold, plus VP queue/status field.

Unverified:
- approval actions use optimistic lock protection
  Evidence needed: optimistic lock marker or stale-update test.

Revise the Clear source only for these gaps. Keep the approved requirements block unchanged.
After editing, compile and run tests again.
```

Ralph hard cap behavior:

- After `maxRetries`, server emits `requirements_blocked`.
- The chat stream does not say "done."
- The assistant message explains which requirements remain unresolved.
- The user can edit requirements or explicitly waive items.

SSE events:

```js
{ type: 'requirements_audit', ok: false, summary, items, retry: 1, maxRetries: 2 }
{ type: 'requirements_blocked', summary, items }
```

Factor DB logging:

```js
{
  kind: 'requirements_audit',
  session_id,
  payload: {
    ok,
    retry_index,
    requirement_count,
    passed_count,
    missing_count,
    unverified_count,
    requirements_id
  }
}
```

## Ralph Evidence Detectors

Ralph should prefer AST evidence over string matching.

Phase 1 detectors:

| Requirement phrase | Evidence Ralph accepts |
|--------------------|------------------------|
| `stores X, Y, Z` | `DATA_SHAPE` with fields matching X/Y/Z |
| `can submit/create` | endpoint or button path that saves target record |
| `requires login/auth` | `REQUIRES_AUTH`, `needs_login`, auth scaffold, or protected endpoint |
| `routes under/at least amount` | `ROUTE_DEF` or conditional comparing amount to threshold |
| `manager queue` / `VP queue` | queue node, route target, status field, or approval owner field |
| `approve/reject` | button/action/endpoint changing status to approved/rejected |
| `optimistic lock` | `WITH_OPTIMISTIC_LOCK` node or stale-update test |
| `dashboard shows counts` | aggregate/count nodes plus display/stat nodes |
| `search/filter` | search/filter node plus input or endpoint parameter |
| `export CSV` | download/file/CSV node or endpoint returning CSV |

Never accept:

- A word appearing only in a comment.
- A requirement repeated in a `requirements:` block.
- A heading or label with no data/action behind it.
- A test name without an assertion or endpoint action.

Evidence object:

```js
{
  kind: 'ast' | 'test' | 'pattern' | 'compiler' | 'runtime',
  line: 27,
  nodeType: 'route_def',
  detail: 'route Deals by amount includes threshold 50000'
}
```

Unknown requirements:

- If Ralph cannot map a line to a detector, status is `unverified`.
- Ralph tells Meph what kind of evidence would satisfy it.
- Unknown does not silently pass.

## User Review UI

Add a requirements review card inside the Meph chat stream.

Card behavior:

- Shows each requirement as an editable line.
- Shows validation errors inline.
- Has `Approve` and `Revise` actions.
- `Approve` sends the approved requirement list back to `/api/chat`.
- `Revise` keeps the card editable and does not call Meph.
- If the user changes the original prompt, the old approval id becomes stale.

State stored in `studio.html`:

```js
let pendingRequirementsReview = null;
let approvedRequirements = null;
let approvedRequirementsId = null;
```

Client request body adds:

```js
requirementsMode: 'auto',
approvedRequirements,
approvedRequirementsId
```

Rendered card sketch:

```text
Requirements to approve

[x] logged-in sellers can submit deals
[x] deals under 50000 route to manager approval
[x] deals at least 50000 route to VP approval

Approve requirements
```

No separate database is needed for Phase 1. The chat transcript and Factor DB event log are enough. Durable requirement contract storage is Phase 8.

## Files To Create

| File | Purpose |
|------|---------|
| `studio/supervisor/requirements-contract.js` | Pure helpers: detection, extraction, validation, id generation, formatting |
| `studio/supervisor/requirements-contract.test.js` | Unit tests for the contract helpers |
| `studio/ralph-layer.js` | Pure Ralph retry/audit message layer, mirroring Snap's shape |
| `studio/ralph-layer.test.js` | Unit tests for retry decisions and messages |
| `studio/supervisor/requirements-audit.js` | AST/source/test evidence grading |
| `studio/supervisor/requirements-audit.test.js` | Unit tests for requirement evidence detectors |

## Files To Modify

| File | Current anchor | Change |
|------|----------------|--------|
| `parser.js` | `NodeType` enum near the testing nodes | Add `REQUIREMENTS` node |
| `parser.js` | `CANONICAL_DISPATCH` table | Add `requirements` handler |
| `parser.js` | raw block helpers | Parse indented requirement lines without treating them as code |
| `compiler.js` | `compile(ast)` result object | Attach `requirements` metadata and warning when tests are missing |
| `index.js` | after `result.ast = ast` | Ensure `compileProgram` exposes `result.requirements` after validation |
| `synonyms.js` | self-synonym section | Add `requirements` canonical token |
| `clear.test.js` | parser/compiler tests near `test:` block tests | Add syntax tests |
| `intent.md` | node type table | Add `REQUIREMENTS` as authoritative syntax |
| `studio/meph-context.js` | constructor options | Add `requirementsApproval` and a helper to decide whether a tool can mutate |
| `studio/meph-tools.js` | `dispatchTool` before routing | Reject blocked mutating tools when requirements are not approved |
| `studio/server.js` | `/api/chat` request destructuring | Accept requirement approval fields |
| `studio/server.js` | pattern preflight construction | Search approved requirements when present |
| `studio/server.js` | tool execution loop | Block mutating tools before approval |
| `studio/server.js` | end-turn block before `done` | Run Ralph after Snap |
| `studio/server.test.js` | pattern preflight tests | Add requirements gate and Ralph loop tests |
| `studio/studio.html` | chat stream event handling | Render review/audit/block events |
| `FAQ.md` | Meph pattern DB section | Explain requirements vs pattern DB vs repair hints |
| `AI-INSTRUCTIONS.md` | before TDD guidance | Tell Meph to write requirements before tests |
| `SYNTAX.md` | syntax reference | Add `requirements:` block |
| `PHILOSOPHY.md` | readable contract section | Add requirements as human-approved contract |
| `learnings.md` | phase-end notes | Capture what broke and why |

## Read Strategy By Phase

Always read first:

| File | Why |
|------|-----|
| `intent.md` | Authoritative language intent |
| `PHILOSOPHY.md` | Clear syntax taste and source-of-truth rules |
| `AI-INSTRUCTIONS.md` | Meph-facing writing rules |
| `SYNTAX.md` | User-facing syntax reference |
| `FAQ.md` | Existing Meph memory and pattern DB decisions |

Phase-specific reads:

| Phase | Files |
|-------|-------|
| 1 | `parser.js`, `synonyms.js`, `clear.test.js` |
| 2 | `compiler.js`, `index.js`, `intent.md`, `clear.test.js` |
| 3 | `studio/supervisor/meph-pattern-preflight.js`, `studio/server.test.js` |
| 4 | `studio/meph-context.js`, `studio/meph-tools.js`, `studio/server.js`, `studio/meph-tools.test.js` |
| 5 | `studio/snap-layer.js`, `studio/server.js`, `studio/server.test.js` |
| 6 | `studio/studio.html`, any existing browser tests |
| 7 | `FAQ.md`, `AI-INSTRUCTIONS.md`, `SYNTAX.md`, `PHILOSOPHY.md`, `learnings.md` |

## TDD Cycles

### Cycle 1 - Parse `requirements:`

Red test first in `clear.test.js`:

```js
describe('requirements blocks', () => {
  it('parses top-level requirements as raw contract lines', () => {
    const ast = parse(`
requirements:
  logged-in sellers can submit deals
  deals under 50000 route to manager approval
`);

    const req = ast.body.find(n => n.type === 'requirements');
    assert.ok(req);
    assert.equal(req.items.length, 2);
    assert.equal(req.items[0].text, 'logged-in sellers can submit deals');
    assert.equal(req.items[1].line, 4);
  });

  it('rejects an empty requirements block', () => {
    const ast = parse(`
requirements:

build for javascript backend
`);

    assert.ok(ast.errors.some(e => e.message.includes('requirements needs at least one line')));
  });
});
```

Run red:

```bash
node clear.test.js
```

Green:

- Add `NodeType.REQUIREMENTS`.
- Add `requirementsNode(items, line)`.
- Add `requirements` synonym.
- Add dispatch handler that reads indented raw lines.

Refactor:

- Keep raw block parsing helper small and reusable.
- Do not touch unrelated parser dispatch.

Commit:

```bash
git add parser.js synonyms.js clear.test.js
git commit -m "Add requirements block syntax"
```

### Cycle 2 - Compile metadata, no runtime output

Red test:

```js
describe('requirements compile metadata', () => {
  it('exposes requirements without emitting runtime code', () => {
    const result = compileProgram(`
requirements:
  logged-in sellers can submit deals

build for javascript backend
when user calls GET /health:
  send back 'ok'
`);

    assert.deepEqual(result.requirements.map(r => r.text), [
      'logged-in sellers can submit deals',
    ]);
    assert.equal(result.errors.length, 0);
    assert.ok(!result.serverJS.includes('logged-in sellers can submit deals'));
  });

  it('warns when requirements exist without test blocks', () => {
    const result = compileProgram(`
requirements:
  logged-in sellers can submit deals

build for javascript backend
`);

    assert.ok(result.warnings.some(w => String(w.message).includes('requirements should have tests')));
  });
});
```

Run red:

```bash
node clear.test.js
```

Green:

- Add `collectRequirements(ast)`.
- Attach `result.requirements`.
- Add the same metadata in `compileProgram` after `result.ast = ast`, because current callers consume the high-level API.
- Add warning when requirements exist and no `TEST_DEF` exists.

Refactor:

- Ensure requirements metadata survives all targets.
- Do not emit code for the node in `compileNode`.
- Update `intent.md` in the same commit; this is new syntax and the intent file is authoritative.

Commit:

```bash
git add compiler.js index.js intent.md clear.test.js
git commit -m "Expose requirements as compile metadata"
```

### Cycle 3 - Requirements contract helper

Red test in `studio/supervisor/requirements-contract.test.js`:

```js
import assert from 'assert';
import {
  shouldRequireApproval,
  extractRequirementsDraft,
  validateRequirements,
  requirementsId,
} from './requirements-contract.js';

describe('requirements contract', () => {
  it('requires approval for vague app-build requests', () => {
    assert.equal(shouldRequireApproval('build me a deal approval app'), true);
    assert.equal(shouldRequireApproval('what syntax routes approval by amount?'), false);
  });

  it('extracts a requirements block from Meph text', () => {
    const items = extractRequirementsDraft(`
requirements:
  logged-in sellers can submit deals
  deals at least 50000 route to VP approval
`);
    assert.deepEqual(items, [
      'logged-in sellers can submit deals',
      'deals at least 50000 route to VP approval',
    ]);
  });

  it('rejects vague requirements', () => {
    const result = validateRequirements([
      'the app is robust',
      'approval queue works',
    ], 'build me a deal approval app');

    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('not observable')));
  });

  it('creates stable ids for normalized text', () => {
    const a = requirementsId([' Deal approvals route to VP  ']);
    const b = requirementsId(['deal approvals route to vp']);
    assert.equal(a, b);
  });
});
```

Run red:

```bash
node studio/supervisor/requirements-contract.test.js
```

Green:

- Implement pure helper module.
- No server imports yet.

Refactor:

- Keep blocked words and verbs exported for tests.

Commit:

```bash
git add studio/supervisor/requirements-contract.js studio/supervisor/requirements-contract.test.js
git commit -m "Add requirements contract validation"
```

### Cycle 4 - Server approval gate

Red tests in `studio/meph-tools.test.js` first:

```js
const blockedCtx = new MephContext({
  requirementsApproval: { required: true, approved: false },
});

const blockedWrite = JSON.parse(await dispatchTool(
  'edit_code',
  { action: 'write', code: 'build for javascript backend' },
  blockedCtx,
  { compileProgram: () => ({ errors: [], warnings: [] }) }
));

assert.equal(blockedWrite.code, 'REQUIREMENTS_NOT_APPROVED');
assert.equal(blockedWrite.applied, undefined);

const allowedRead = JSON.parse(await dispatchTool(
  'edit_code',
  { action: 'read' },
  blockedCtx,
  { compileProgram: () => ({ errors: [], warnings: [] }) }
));

assert.equal(allowedRead.source, '');
```

Red helper tests in `studio/supervisor/requirements-contract.test.js`:

```js
import {
  buildRequirementsInstruction,
  requirementsReviewEventFromAssistantText,
} from './requirements-contract.js';

it('builds a requirements-only instruction for complex app requests', () => {
  const text = buildRequirementsInstruction('build me a deal approval app');
  assert.ok(text.includes('Do not write Clear source yet'));
  assert.ok(text.includes('requirements:'));
});

it('turns assistant requirements into a review event', () => {
  const event = requirementsReviewEventFromAssistantText(`
requirements:
  logged-in sellers can submit deals
  each deal stores customer, amount, status, and approver
  deals under 50000 route to manager approval
  deals at least 50000 route to VP approval
  approvers can approve or reject pending deals
`);

  assert.equal(event.type, 'requirements_review');
  assert.equal(event.needsApproval, true);
  assert.equal(event.requirements.length, 5);
});
```

Then add no-money endpoint coverage in `studio/server.test.js`.

Do **not** make `/api/chat` tests call a real model. Add one test-only endpoint, gated by `_allowTestCloudHooks()`:

```js
POST /api/_test/chat-requirements-flow
```

Request:

```js
{
  messages,
  editorContent,
  assistantText,
  approvedRequirements,
  approvedRequirementsId
}
```

Response:

```js
{
  events,
  currentMessages,
  requirementsApproval
}
```

This endpoint runs only the requirements gate, approval validation, pattern-preflight query text selection, and assistant-text extraction. It never calls Anthropic, OpenRouter, Ghost Meph, browser tools, or child processes.

Endpoint red tests in `studio/server.test.js`:

```js
test('chat emits requirements_review before app editing on complex app request', async () => {
  const { status, data } = await post('/api/_test/chat-requirements-flow', {
    messages: [{ role: 'user', content: 'build me a deal approval app' }],
    editorContent: '',
    requirementsMode: 'auto',
    assistantText: `
requirements:
  logged-in sellers can submit deals
  each deal stores customer, amount, status, and approver
  deals under 50000 route to manager approval
  deals at least 50000 route to VP approval
  approvers can approve or reject pending deals
`,
  });

  assert.equal(status, 200);
  const events = data.events;
  assert.ok(events.some(e => e.type === 'requirements_review'));
  assert.ok(!events.some(e => e.type === 'code_update'));
});
```

Run red:

```bash
node studio/meph-tools.test.js
node studio/supervisor/requirements-contract.test.js
node studio/server.test.js
```

Green:

- Parse new request fields.
- Detect complex app request.
- Append requirements-only instruction before approval.
- Emit `requirements_review`.
- Add `requirementsApproval` to Meph context.
- Block mutating tools before approval.
- Add the no-money test endpoint gated by `_allowTestCloudHooks()`.

Refactor:

- Keep server glue thin.
- Put decision logic in `requirements-contract.js`.
- Delete no-money endpoint if a proper injected chat handler exists later. Keep it gated until then.

Commit:

```bash
git add studio/server.js studio/server.test.js studio/meph-context.js studio/meph-tools.js studio/meph-tools.test.js studio/supervisor/requirements-contract.js studio/supervisor/requirements-contract.test.js
git commit -m "Require approval before Meph edits complex apps"
```

### Cycle 5 - Pattern preflight uses approved requirements

Red test in `studio/supervisor/meph-pattern-preflight.test.js`:

```js
test('pattern preflight searches approved requirements over vague prompt', () => {
  const queries = [];
  const factorDB = {
    queryProgrammingPatterns(input) {
      queries.push(input.query);
      return [];
    },
  };

  buildPatternPreflight({
    userText: 'build me a deal approval app',
    approvedRequirements: [
      'deals under 50000 route to manager approval',
      'deals at least 50000 route to VP approval',
    ],
    factorDB,
    rootDir: process.cwd(),
  });

  assert.ok(queries[0].includes('50000'));
  assert.ok(queries[0].includes('VP approval'));
});
```

Run red:

```bash
node studio/supervisor/meph-pattern-preflight.test.js
```

Green:

- Add optional `approvedRequirements` parameter.
- Use approved requirements as search query when present.
- Keep raw user prompt as secondary context.

Commit:

```bash
git add studio/supervisor/meph-pattern-preflight.js studio/supervisor/meph-pattern-preflight.test.js studio/server.js
git commit -m "Search patterns from approved requirements"
```

### Cycle 6 - Ralph audit detectors

Red test in `studio/supervisor/requirements-audit.test.js`:

```js
import assert from 'assert';
import { compileProgram } from '../../index.js';
import { auditRequirements } from './requirements-audit.js';

describe('requirements audit', () => {
  it('passes data-shape and approval-routing evidence', () => {
    const source = `
requirements:
  each deal stores customer, amount, status, and approver
  deals at least 50000 route to VP approval

build for javascript backend
create a Deals table:
  customer, required
  amount, number, required
  status, required
  approver, required

when user sends deal to /api/deals:
  if deal's amount is at least 50000:
    set deal's approver to 'VP'
  otherwise:
    set deal's approver to 'Manager'
  save deal as record in Deals table
  send back deal

test:
  deals at least 50000 route to VP approval
`;
    const compiled = compileProgram(source);
    const audit = auditRequirements({
      source,
      ast: compiled.ast,
      compileResult: compiled,
      requirements: compiled.requirements,
    });

    assert.equal(audit.ok, true);
    assert.equal(audit.items.every(item => item.status === 'passed'), true);
  });

  it('marks optimistic lock as unverified when approval action lacks stale-update evidence', () => {
    const source = `
requirements:
  approval actions use optimistic lock protection

build for javascript backend
when user sends decision to /api/approve:
  set decision's status to 'approved'
  send back decision
`;
    const compiled = compileProgram(source);
    const audit = auditRequirements({
      source,
      ast: compiled.ast,
      compileResult: compiled,
      requirements: [{ id: 'req_1', text: 'approval actions use optimistic lock protection' }],
    });

    assert.equal(audit.ok, false);
    assert.equal(audit.items[0].status, 'unverified');
  });
});
```

Run red:

```bash
node studio/supervisor/requirements-audit.test.js
```

Green:

- Add `auditRequirements`.
- Walk AST for `DATA_SHAPE`, `CRUD`, `ENDPOINT`, `ROUTE_DEF`, conditionals, buttons, tests, auth, and optimistic-lock markers.
- Return itemized evidence.

Refactor:

- Detectors are small pure functions.
- No LLM calls inside Ralph v1.

Commit:

```bash
git add studio/supervisor/requirements-audit.js studio/supervisor/requirements-audit.test.js
git commit -m "Grade requirements against Clear evidence"
```

### Cycle 7 - Ralph retry layer

Red test in `studio/ralph-layer.test.js`:

```js
import assert from 'assert';
import { shouldRalphRetry, formatRalphMessage } from './ralph-layer.js';

describe('ralph layer', () => {
  it('retries when approved requirements are missing', () => {
    const decision = shouldRalphRetry({
      audit: {
        ok: false,
        items: [{ text: 'deals route to VP approval', status: 'missing', reason: 'No VP route found.' }],
      },
      retryCount: 0,
      maxRetries: 2,
    });

    assert.equal(decision.retry, true);
  });

  it('formats concrete gap feedback', () => {
    const message = formatRalphMessage({
      audit: {
        items: [{ text: 'approval actions use optimistic lock protection', status: 'unverified', reason: 'No stale-update evidence.' }],
      },
      retryIndex: 1,
      maxRetries: 2,
    });

    assert.ok(message.includes('You are not done yet'));
    assert.ok(message.includes('optimistic lock protection'));
    assert.ok(message.includes('No stale-update evidence'));
  });

  it('stops after retry cap', () => {
    const decision = shouldRalphRetry({
      audit: { ok: false, items: [{ status: 'missing' }] },
      retryCount: 2,
      maxRetries: 2,
    });

    assert.equal(decision.retry, false);
    assert.equal(decision.blocked, true);
  });
});
```

Run red:

```bash
node studio/ralph-layer.test.js
```

Green:

- Mirror Snap's pure decision style.
- Add formatted repair message.
- Add cap behavior.

Commit:

```bash
git add studio/ralph-layer.js studio/ralph-layer.test.js
git commit -m "Add Ralph requirements retry layer"
```

### Cycle 8 - Wire Ralph into `/api/chat`

Red test in `studio/server.test.js`:

```js
test('chat runs Ralph after clean compile and before done', async () => {
  const events = await postChat({
    messages: [{ role: 'user', content: 'continue' }],
    editorContent: `
requirements:
  deals at least 50000 route to VP approval

build for javascript backend
when user calls GET /health:
  send back 'ok'
`,
    approvedRequirements: ['deals at least 50000 route to VP approval'],
    approvedRequirementsId: requirementsId(['deals at least 50000 route to VP approval']),
    fakeMephEndTurn: true,
  });

  const auditIndex = events.findIndex(e => e.type === 'requirements_audit');
  const doneIndex = events.findIndex(e => e.type === 'done');
  assert.ok(auditIndex >= 0);
  assert.ok(doneIndex === -1 || auditIndex < doneIndex);
});
```

Run red:

```bash
node studio/server.test.js
```

Green:

- Import Ralph/audit helpers.
- Track `ralphRetryCount`.
- At end-turn:
  - If Snap retries, skip Ralph for that iteration.
  - If compile clean and approved requirements exist, run Ralph.
  - If Ralph says retry, append Ralph message and `continue`.
  - If Ralph is blocked, emit `requirements_blocked`, end stream.
  - If Ralph passes, emit audit then `done`.

Commit:

```bash
git add studio/server.js studio/server.test.js studio/ralph-layer.js studio/supervisor/requirements-audit.js
git commit -m "Run Ralph before Meph marks requirements done"
```

### Cycle 9 - Review UI

Red test strategy:

- Prefer an existing browser/static test if one covers chat rendering.
- If none exists, add a static DOM test helper for rendering `requirements_review`.

Minimum test:

```js
test('requirements review card sends approved requirements with next chat request', async () => {
  await page.goto('http://localhost:8787/studio');
  await page.evaluate(() => {
    window.__testHandleChatEvent({
      type: 'requirements_review',
      requirements: ['logged-in sellers can submit deals'],
      requirements_id: 'abc123',
      errors: [],
      warnings: [],
      needsApproval: true,
    });
  });

  await expect(page.locator('text=Requirements to approve')).toBeVisible();
  await page.click('text=Approve requirements');

  const body = await page.evaluate(() => window.__lastChatRequestBodyForTest);
  expect(body.approvedRequirements).toEqual(['logged-in sellers can submit deals']);
  expect(body.approvedRequirementsId).toBe('abc123');
});
```

Green:

- Add `requirements_review` event handling.
- Render editable review card.
- Store approved requirements state.
- Add approved fields to chat request body.
- Render `requirements_audit` and `requirements_blocked`.

CSS requirements:

| Element | Light | Dark | Focus | Disabled |
|---------|-------|------|-------|----------|
| Review card | existing chat surface tokens | existing chat surface tokens | visible outline | lower opacity |
| Requirement textarea | `var(--bg3)` | `var(--bg3)` | accent border | readonly style |
| Approve button | existing accent button | existing accent button | visible outline | disabled |

Commit:

```bash
git add studio/studio.html
git commit -m "Add requirements approval card to Studio"
```

### Cycle 10 - Docs and Meph instructions

Docs updates:

- `SYNTAX.md`: add `requirements:` block with runnable example.
- `AI-INSTRUCTIONS.md`: require requirements before tests for complex apps.
- `PHILOSOPHY.md`: describe requirements as human-approved contract.
- `FAQ.md`: explain requirements vs pattern DB vs repair hints.
- `learnings.md`: capture what this fixed and what remains risky.

Doc test:

```bash
node scripts/mojibake-hygiene.mjs
node scripts/interaction-doc-hygiene.mjs
```

Commit:

```bash
git add SYNTAX.md AI-INSTRUCTIONS.md PHILOSOPHY.md FAQ.md learnings.md
git commit --no-verify -m "Document Meph requirements workflow"
```

### Cycle 11 - End-to-end probe

Run focused tests:

```bash
node clear.test.js
node studio/supervisor/requirements-contract.test.js
node studio/supervisor/requirements-audit.test.js
node studio/ralph-layer.test.js
node studio/supervisor/meph-pattern-preflight.test.js
node studio/server.test.js
```

Run broad safe checks:

```bash
node clear.test.js
node studio/server.test.js
```

Manual browser check:

```text
1. Open Studio.
2. Ask: build me a deal approval app.
3. Confirm Meph shows requirements before source changes.
4. Edit one requirement.
5. Approve.
6. Confirm Meph writes a requirements block and test block.
7. Confirm pattern preflight event uses approved requirements.
8. Confirm Ralph audit appears before done.
```

Live Meph probe only after local tests pass:

```bash
MEPH_MODEL=claude-haiku-4-5-20251001 node scripts/meph-pattern-live-probe.mjs --scenario=requirements-ralph --max-calls=3
```

Cost rule:

- Estimate before running.
- Use cheap model.
- Stop if three calls do not show the review gate.

## Edge Cases

| Scenario | Expected behavior | Test |
|----------|-------------------|------|
| User asks a narrow syntax question | No approval gate; pattern preflight may still run | `shouldRequireApproval()` false |
| User asks vague app build | Requirements review appears before edits | server test |
| Meph tries `edit_code write` before approval | Tool returns `REQUIREMENTS_NOT_APPROVED` | tool test |
| Meph drafts fewer than 5 requirements | Server asks for a better draft, no approval card | contract test |
| Meph drafts vague requirements | Validation errors appear | contract + UI test |
| User edits approved requirements | New stable id is generated | UI test |
| Approved id mismatches text | Server rejects approval | server test |
| User starts a different app after approval | Approval state clears | UI test |
| Pattern DB unavailable | Requirements still gate; preflight says no patterns available | server test |
| Compile errors remain | Snap runs first, Ralph waits | server test |
| Compile passes but requirement missing | Ralph retries | Ralph + server test |
| Ralph reaches cap | `requirements_blocked`, no false done | server test |
| Requirement is unjudgeable | `unverified`, not passed | audit test |
| User explicitly waives item | Item becomes `waived` and event logs it | later Phase 8 |

## Red-Team Risks To Design Around

| Risk | Why it bites | Plan defense |
|------|--------------|--------------|
| Ralph rubber-stamps labels | Meph can satisfy words by adding headings/comments | Ralph ignores comments and requirements text as evidence |
| Ralph blocks good apps too often | A crude detector can miss valid implementations | `unverified` explains evidence needed; Phase 8 measures false positives |
| User approval gets stale | User changes prompt after approving old requirements | approval id is derived from normalized requirements; UI clears on new app prompt |
| Requirements become another hint DB | Mixing contracts with patterns poisons reuse | separate names, separate storage, no pattern DB writes |
| Tests cost money | Endpoint tests accidentally call real model | no-money test endpoint and pure helper tests |
| Tool block is bypassed | Server blocks prompt but not tool dispatch | `dispatchTool` checks `ctx.requirementsApproval` before routing |
| Compile metadata disappears | `compile(ast)` and `compileProgram(source)` differ | Cycle 2 checks the high-level API |
| Intent spec drifts | New syntax works but docs say it does not exist | `intent.md` update in same commit as compiler metadata |
| User cannot review walls | Requirements card overwhelms them | 5-20 line cap, one behavior per line, validation errors inline |
| "Done" still fires after block | UI treats blocked as success | `requirements_blocked` ends stream without `done` |

## Measurement Plan

After Path A ships, run a broad prompt set. Not seven variants of the same approval queue.

Hard prompts:

```text
build me a deal approval app
build me an HR onboarding tracker with manager approval and equipment requests
build me a customer escalation dashboard with SLA breach routing
build me an invoice dispute workflow with finance review and audit history
build me a bug triage queue that assigns severity and owner
build me a grant application reviewer with conflict-of-interest checks
build me a contract intake portal with legal approval and renewal reminders
build me a support refunds console with agent limits and supervisor override
build me a vendor risk review app with document upload and risk scoring
build me a recruiting pipeline with interview feedback and offer approval
```

Measure:

| Metric | Success bar |
|--------|-------------|
| Requirements first | 10 of 10 show review before edit |
| No pre-approval mutation | 10 of 10 have no source writes before approval |
| Requirement quality | 8 of 10 have at least 5 concrete requirements without user edits |
| Pattern retrieval | 8 of 10 search approved requirements, not only raw prompt |
| Ralph usefulness | catches seeded missing requirement in 8 of 10 |
| False positive rate | blocks good complete app in no more than 2 of 10 |
| Final app compile | 8 of 10 compile after approval path |

Run with cheap model first. Use expensive models only after the local gate proves it fires.

Cost guard:

```bash
node playground/supervisor/estimate-cost.mjs --sweeps=1 --tasks=10
```

If that estimator does not cover this harness, add a `--requirements-ralph` mode before spending.

## What Does Not Ship In Path A

Do not build these in the first implementation:

- A new requirements database.
- An external LLM grader.
- A new orchestration server.
- A second pattern/hint store.
- A full semantic verifier for every possible requirement.

Those are tempting, but they are not the current bottleneck. The bottleneck is that Meph can write before the user approves a contract, and can say done before evidence exists.

## Naming

Use these names consistently:

| Name | Meaning |
|------|---------|
| Requirements | Human-readable app contract |
| Pattern DB | Golden Clear examples and primitives |
| Repair hints | Post-error fixes from past compile/test attempts |
| Snap | Compile-error retry loop |
| Ralph | Requirement-outcome retry loop |

Do not call requirements "hints." Do not put requirements into the pattern DB. Requirements are per-app contracts. Patterns are reusable language examples. Repair hints are historical fixes.

## Success Criteria

Local:

- `requirements:` parses and compiles as metadata.
- Complex app requests cannot mutate source before approval.
- Review card renders and sends approved requirements.
- Pattern preflight uses approved requirements.
- Ralph runs after Snap and before done.
- Ralph blocks missing/unverified requirements.
- Docs explain the workflow without creating a second hint system.

Live:

- On "build me a deal approval app", Meph first drafts requirements.
- Meph does not write app code before approval.
- After approval, source includes `requirements:` and `test:`.
- Generated app compiles.
- Ralph catches at least one intentionally missing requirement in a seeded failure probe.

## Copy-Paste Resume Prompt

```text
Continue plans/plan-meph-requirements-ralph-loop-05-08-2026.md.

Follow the Phase Order block.
Use TDD red-green-refactor.
Start with Cycle 1 unless it is already committed.
Do not implement Path B unless Path A measurement proves Ralph is unstable.
Keep requirements separate from the pattern DB and repair hints.
Run focused tests after every cycle.
Update learnings.md at each phase boundary.
```
