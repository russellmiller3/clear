# CSV Export Primitive — Auto-Download for Queue Pages

**One-line goal:** every queue page automatically gets a "Download as spreadsheet" button + a CSV download URL — Marcus's GTM list explicitly calls out "Export if they currently use spreadsheets" as MVP.

**Branch:** `feature/csv-export-primitive`. Land AFTER the queue primitive merges to main. Can land in parallel with or before the triggered email primitive — they don't depend on each other.

**Source of authority:** `snapshots/marcus-market-evidence-04-27-2026.md` + `snapshots/marcus-primitives-decomposition-04-27-2026.md` + the explicit MVP list in [GTM.md "What to build for the first customer"](../GTM.md).

**Scope honesty:** this is a small primitive. ~5 cycles. Worth its own plan because it touches compiler-emitted UI + URL handlers, but the implementation is small.

---

## Phase Order (load-bearing)

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| 1 | A | Queue primitive landed on main | required: compiler auto-emits a `GET /api/<entity>/export.csv` URL for every queue |
| 2 | A | Phase 1 | required: compiler auto-renders a "Download" button in the queue page header |
| 3 | A | Phases 1-2 | required: parser supports `no export` opt-out clause inside `queue for X:` block |
| 4 | A | Phases 1-3 | required: docs cascade (lighter — no new top-level keyword, just a queue-primitive extension) |
| 5 | A | Phases 1-4 | required: 8 core templates still compile clean |

**Default track:** Path A — auto-include CSV export on every queue with `no export` opt-out. Default-on because the GTM doc lists it as MVP.

**Why this order:** the URL handler is independent (Phase 1). The button auto-render reads the URL handler exists (Phase 2). The opt-out parser-side clause is last (Phase 3) since it tweaks the default rather than adding new behavior.

---

## Execution Rules

- **Plan quality bar:** stupidest LLM that can follow instructions executes completely.
- **REVIEW FREEZE:** Russell reviews + explicitly approves before execution. Plan written autonomously during /loop AFK (2026-04-27).
- **Branch rule:** `feature/csv-export-primitive` from `main` AFTER `feature/queue-primitive-tier1` lands.
- **Edit code in main conversation.**
- **TDD cycle:** RED → GREEN → REFACTOR → ONE commit per cycle.
- **Compiler test gate:** `node clear.test.js` green at every commit.
- **Template smoke gate:** all 8 core templates compile clean after every Phase boundary.
- **Stop condition per phase:** all that phase's cycles green, no regressions.

---

## Mandatory Compiler Improvements

Per project CLAUDE.md "Improve The Compiler As You Go":

| Failure exposed | Required compiler improvement | Test home |
|-----------------|-------------------------------|-----------|
| CSV row contains literal `[object Object]` for nested fields | Compiler serializes nested objects as JSON-string-in-cell, not toString | Cycle 1.2 |
| CSV cells with commas / quotes / newlines break parsing | Compiler emits proper RFC 4180 escaping (wrap in quotes, double internal quotes) | Cycle 1.3 |
| Sensitive fields (passwords, tokens) leak into CSV | Compiler omits any field marked sensitive (existing PII-redaction list) | Cycle 1.4 |

These are universal CSV-correctness rules — useful any time Clear emits CSV in any future feature.

---

## Verified Line Anchors

Inline file:line list (lint-friendly):

- `parser.js:127` — NodeType freeze block (no new node types needed; CSV export is parsed as a clause inside QUEUE_DEF)
- `compiler.js:7694` — ENDPOINT case dispatch (where the auto-generated `/export.csv` URL handler lands)
- `compiler.js:7844` — reference for compiler emitting URL responses
- `clear.test.js:21730` — existing Workflow tests (CSV export tests land near new Queue primitive tests)

If any anchor has drifted by execution time, re-verify with `Grep` BEFORE the cycle that uses it.

---

## Data Contracts

### What the CSV download URL returns

For `queue for deal:` with no `no export` opt-out, the compiler emits:

```
GET /api/deals/export.csv
```

Response:
- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename="deals-export-YYYY-MM-DD.csv"`
- Body: comma-separated rows
  - Row 1: column headers (entity field names, human-readable)
  - Rows 2+: one row per record in the queue's entity table
  - All cells properly escaped per RFC 4180
  - Sensitive fields (password, token, api_key, secret, etc.) OMITTED
  - Status filter applied: by default, ALL records (not just pending) so the user can analyze the full pipeline

Optional query string: `?status=pending` filters to one status. Useful for reports.

### What the auto-rendered Download button does

In the queue page header (or wherever the primary `display <entity> as table` is rendered), a button labeled "Download CSV" appears in the header actions row. Click → fetches the CSV URL → triggers browser download.

---

## UI and Visual Contract

| Element | Required behavior | Visual guard |
|---------|-------------------|--------------|
| Download button | Appears in the page header actions area, right-aligned, ghost-style (low visual weight) — not the primary action | Browser screenshot shows button in header |
| Button label | "Download CSV" (literal text — no truncation, no abbreviation) | Inspect text content |
| File name | `<entity>s-export-YYYY-MM-DD.csv` (e.g. `deals-export-2026-04-27.csv`) | Inspect Content-Disposition header |
| No export apps | Apps that declare `no export` in their queue have NO button rendered | Compile a test fixture, screenshot, confirm absent |

**Visual stop condition:** if Download button overlaps the page title, takes primary visual weight, or appears on apps with `no export` — stop and patch.

---

## Docs Cascade

Lighter than other primitives because no new top-level keyword. Updates needed:

| File | Change |
|------|--------|
| `intent.md` | Add note in QUEUE_DEF row: "Auto-includes CSV export URL + download button. Suppress with `no export`." |
| `SYNTAX.md` | Add `no export` clause to queue example |
| `AI-INSTRUCTIONS.md` | Add tip: "Every queue page gets a CSV download by default — Marcus moves FROM spreadsheets, but spreadsheets stay in his workflow for reporting + handoffs" |
| `USER-GUIDE.md` | Brief example showing the auto-download |
| `FEATURES.md` | Add row: "CSV export auto-included on every approval queue" |
| `CHANGELOG.md` | Session entry: "CSV export primitive — every queue page auto-renders a Download button + URL with proper RFC 4180 escaping" |
| `FAQ.md` | Add "How do I turn off the CSV export button?" entry (answer: `no export` clause) |
| `playground/system-prompt.md` | Brief note that queues come with CSV export; don't hand-roll one |
| `ROADMAP.md` | Mark CSV export shipped |
| `landing/marcus.html` | No update needed (no syntax change in featured snippets) |
| `RESEARCH.md` | No changes |

---

## TDD Cycles

### Phase 1 — Auto-emit /export.csv URL handler

#### Cycle 1.1 — RED: compiler emits GET /api/<entity>/export.csv when a queue is declared

**Test command:**
```powershell
node clear.test.js --grep "CSV export — compiler"
```

**Test code** (add to `clear.test.js` near the new Queue primitive tests):
```javascript
describe('CSV export — compiler', () => {
  it('auto-emits GET /api/deals/export.csv when queue for deal: declared', () => {
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
    expect(result.serverJS).toContain("app.get('/api/deals/export.csv'");
    expect(result.serverJS).toContain('text/csv');
    expect(result.serverJS).toContain('attachment; filename');
  });

  it('does NOT emit /export.csv if no queue declared', () => {
    const src = `build for javascript backend
database is local memory
create a Deals table:
  customer`;
    const result = compileProgram(src);
    expect(result.serverJS).not.toContain('/export.csv');
  });
});
```

**Expected red:** URL handler missing.

**GREEN implementation:**
1. In the compileQueueDef helper (added by the queue primitive plan), append a CSV URL handler emission step.
2. Helper `compileCsvExportHandler(entityName, fields, ctx)` emits the URL handler block.
3. The handler reads all rows from `<entity>s` table, formats as CSV per RFC 4180, returns with proper Content-Type + Content-Disposition headers.

**Commit:** `TDD cycle 1.1: auto-emit CSV export URL handler for queues`

#### Cycle 1.2 — RED: nested objects serialize as JSON, not [object Object]

**Test code:**
```javascript
it('serializes nested object fields as JSON string in CSV cell', () => {
  // Test against compiled output behavior — spin up server, hit URL, parse response
  // Use existing test harness pattern from clear.test.js for in-process URL tests
  // ... (full test body using request(app) pattern)
  // Key assertion: CSV cell for a nested object field reads `"{""key"":""value""}"`,
  // NOT `[object Object]`
});
```

**Expected red:** literal `[object Object]` appears in CSV.

**GREEN implementation:** in the row-serialization step, detect non-primitive cell values and `JSON.stringify` them (the result is then RFC 4180 escaped by the next step).

**Commit:** `TDD cycle 1.2: serialize nested objects as JSON in CSV cells`

#### Cycle 1.3 — RED: cells with commas / quotes / newlines properly escape per RFC 4180

**Test code:**
```javascript
it('escapes commas, quotes, and newlines per RFC 4180', () => {
  // Seed entity rows with values like: 'Acme, Inc.', 'He said "hi"', 'line1\nline2'
  // Hit /export.csv
  // Assert: comma values wrapped in quotes
  // Assert: internal quotes doubled
  // Assert: newlines preserved inside quoted cells
});
```

**Expected red:** values break the CSV (extra columns, broken rows).

**GREEN implementation:** add a `csvEscape(cell)` helper: wrap in quotes if cell contains `,`, `"`, or `\n`; double any internal `"`.

**REFACTOR:** extract `csvEscape` so any future Clear feature that emits CSV reuses it.

**Commit:** `TDD cycle 1.3: RFC 4180 escaping for commas, quotes, newlines`

#### Cycle 1.4 — RED: sensitive fields are omitted from CSV

**Test code:**
```javascript
it('omits sensitive fields (password, token, api_key, secret) from CSV', () => {
  const src = `build for javascript backend
database is local memory
create a Users table:
  email
  password
  api_token
  display_name
queue for user:
  reviewer is 'admin'
  actions: ban, unban`;
  const result = compileProgram(src);
  expect(result.serverJS).not.toContain('password');  // not in the SELECT list
  expect(result.serverJS).not.toContain('api_token');
  expect(result.serverJS).toContain('email');         // safe field included
  expect(result.serverJS).toContain('display_name');
});
```

**Expected red:** sensitive fields appear in the CSV column list.

**GREEN implementation:** consult the existing PII-redaction list in compiler/validator (whichever is canonical); omit any field whose name matches the pattern `password|token|api_key|secret|bcrypt|hash`.

**Commit:** `TDD cycle 1.4: omit sensitive fields from CSV export`

---

### Phase 2 — Auto-render Download button in queue page header

#### Cycle 2.1 — RED: queue page renders Download button in header actions

**Test code:**
```javascript
describe('CSV export — UI', () => {
  it('renders Download CSV button in queue page header', () => {
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
    expect(result.html).toContain('>Download CSV</button>');
    expect(result.javascript).toContain("'/api/deals/export.csv'");
    expect(result.javascript).toContain('attachment');  // download trigger logic
  });
});
```

**Expected red:** button missing.

**GREEN implementation:** in the queue-page UI generation, append a Download button to the page header actions row. Click handler navigates to or triggers download of `/api/<entity>/export.csv`.

**Commit:** `TDD cycle 2.1: auto-render CSV download button in queue header`

---

### Phase 3 — `no export` opt-out clause

#### Cycle 3.1 — RED: parser handles `no export` clause inside queue block

**Test code:**
```javascript
describe('CSV export — opt-out', () => {
  it('parses no export clause and suppresses URL + button', () => {
    const src = `build for web and javascript backend
database is local memory
create a Deals table:
  customer
  status, default 'pending'
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject
  no export`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.serverJS).not.toContain('/export.csv');
    expect(result.html).not.toContain('>Download CSV</button>');
  });
});
```

**Expected red:** clause unrecognized OR ignored.

**GREEN implementation:**
1. In the queue parser, recognize `no export` as a flag on the QUEUE_DEF node.
2. In the queue compiler, skip both the URL handler emission AND the button render when the flag is set.

**Commit:** `TDD cycle 3.1: parse and honor no export opt-out`

---

### Phase 4 — Docs cascade

#### Cycle 4.1 — RED: docs mention CSV export across required surfaces

**Test code:**
```javascript
it('documents CSV export across required surfaces', () => {
  const intent = readFileSync(pathJoin(REPO_ROOT, 'intent.md'), 'utf8');
  const syntax = readFileSync(pathJoin(REPO_ROOT, 'SYNTAX.md'), 'utf8');
  const ai = readFileSync(pathJoin(REPO_ROOT, 'AI-INSTRUCTIONS.md'), 'utf8');
  const features = readFileSync(pathJoin(REPO_ROOT, 'FEATURES.md'), 'utf8');
  const faq = readFileSync(pathJoin(REPO_ROOT, 'FAQ.md'), 'utf8');
  expect(intent).toContain('CSV export');
  expect(syntax).toContain('no export');
  expect(ai).toContain('CSV download');
  expect(features).toContain('CSV export');
  expect(faq).toContain('turn off the CSV');
});
```

**Expected red:** docs not yet updated.

**GREEN implementation:** update each doc per the cascade table above. Same commit.

**Commit:** `TDD cycle 4.1: docs cascade for CSV export`

---

### Phase 5 — Template smoke

#### Cycle 5.1 — GREEN verification: all 8 core templates compile clean

**Test command:**
```powershell
node -e "import { compileProgram } from './index.js'; import fs from 'fs'; ['todo-fullstack','crm-pro','blog-fullstack','live-chat','helpdesk-agent','booking','expense-tracker','ecom-agent'].forEach(a => { const r = compileProgram(fs.readFileSync('apps/'+a+'/main.clear','utf8')); console.log(a+': '+r.errors.length+' errors, '+r.warnings.length+' warnings'); });"
```

**Success criteria:** 0 errors per template; no NEW warnings beyond pre-CSV-export baseline.

**Commit:** `TDD cycle 5.1: verify 8 core templates clean post-CSV-export`

---

## Edge cases covered

| Scenario | Expected behavior | Test cycle |
|----------|-------------------|------------|
| Empty entity table | CSV with header row only, no data rows | Add to Cycle 1.1 |
| Field with multi-line text | Properly escaped, single CSV row preserved | Cycle 1.3 |
| Field name conflicts with reserved CSV character | Treated as regular cell, escaped if needed | Cycle 1.3 |
| User defines a `Sensitive` table with no sensitive fields | Standard CSV with all fields | Cycle 1.4 |
| User wants to export non-queue table | DEFERRED — not in scope. CSV export only auto-included on queue entities. | (not covered) |
| Apps with multiple queues | Each queue gets its own /export.csv URL with the right entity name | (extend Cycle 1.1) |

---

## Success criteria (overall)

- All 7 TDD cycles green
- `node clear.test.js` green (no regressions)
- All 8 core templates compile clean
- All required doc surfaces updated
- Pre-push hook passes

---

## Stop conditions (overall)

- Any cycle fails after 3 GREEN attempts → escalate
- Template smoke regression → fix before next phase
- CSV output fails RFC 4180 round-trip parsing in a real spreadsheet tool → fix escaping logic before continuing
- Sensitive field leak detected → ROLLBACK and audit before continuing

---

## What this plan deliberately does NOT cover

- CSV export for non-queue tables (separate plan if needed)
- Excel-flavored XLSX export (separate plan; CSV is the universal first cut)
- Custom column selection / filtering for export (post-Tier-1 — for now, exports ALL safe fields)
- Date-formatted columns / locale-specific formatting (post-Tier-1)
- Async export for huge tables (post-Tier-1; if Marcus has 50K+ rows we revisit)

---

## Iteration handoff

- Plan written autonomously during Russell's AFK /loop directive (2026-04-27).
- **Russell must review and approve before execution.** REVIEW FREEZE clause is real.
- This plan can land AFTER `feature/queue-primitive-tier1` merges to main. Doesn't depend on the triggered-email primitive — those two can land in either order or in parallel.
- Next /loop iteration: ALL three primitive plans are written. Either (a) wait for Russell to review + approve before executing, or (b) start a meta-task like updating ROADMAP / writing a session HANDOFF / consolidating the three plan files into a single execution checklist for Russell to glance at.
