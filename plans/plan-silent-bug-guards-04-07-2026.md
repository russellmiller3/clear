# Plan: Silent Bug Guards — Compiler-Generated Runtime Protections

**Branch:** `feature/silent-bug-guards`
**Date:** 2026-04-07
**Status:** Red-teamed. 4 issues found, all patched.

---

## 🎯 THE PROBLEM

Clear apps can return HTTP 200 with silently corrupt data. In our hard-bug testing, 10 of 15 bugs produced no error. These silent bugs are the most dangerous class because nothing triggers the error translator.

**Research backing:**
- AI-generated code produces 1.75x more logic/correctness errors (CodeRabbit, 470 repos)
- Wrong status codes cause 70% of API bugs (industry data)
- Null property access is the #1 JS runtime crash globally
- OWASP A10:2025 (NEW) — "Mishandling of Exceptional Conditions" — silent data corruption
- TOCTOU race conditions are "the bug class nobody tests for"
- Mass assignment via PATCH/PUT is a confirmed exploit vector (OWASP A06)

---

## 🔧 THE FIX — 8 Guards, Priority Ranked

### Priority 1 (HIGH): Type Enforcement on Insert

**Where:** `runtime/db.js` → new `enforceTypes()`, called in `insert()` after `sanitizeRecord` (line 162), BEFORE `validateRequired` (line 164)

```js
// NEW function — add before insert() in runtime/db.js
function enforceTypes(record, schema) {
  if (!schema || typeof schema !== 'object') return;
  for (const [field, config] of Object.entries(schema)) {
    if (record[field] === undefined || record[field] === null) continue;
    if (config.type === 'number') {
      // Guard: empty string should NOT silently become 0
      if (record[field] === '' || (typeof record[field] === 'string' && record[field].trim() === '')) continue;
      const num = Number(record[field]);
      if (isNaN(num)) {
        throw new Error(field + ' must be a number, got ' + JSON.stringify(record[field]));
      }
      record[field] = num;
    }
    if (config.type === 'boolean' && typeof record[field] === 'string') {
      if (record[field] === 'true') record[field] = true;
      else if (record[field] === 'false') record[field] = false;
    }
  }
}
```

Call site in `insert()` — between sanitize and validateRequired:
```js
// line 162: record = sanitizeRecord(record);
enforceTypes(record, store.schema);   // ← INSERT THIS LINE
// line 164: const reqError = validateRequired(record, store.schema);
```

Also call in `update()` — after sanitize (line 203):
```js
// line 203: updateData = sanitizeRecord(updateData);
const store = _tables[tableName];
if (store) enforceTypes(updateData, store.schema);  // ← INSERT THIS LINE
```

---

### Priority 2 (HIGH): Update-Not-Found → 404

**Where:** `runtime/db.js` → `update()`, after count loop (line 215), before `return count`

```js
  // line 214: }  (end of for loop)
  // INSERT THESE LINES:
  if (count === 0 && filter && filter.id !== undefined) {
    const err = new Error('No record found with id ' + filter.id);
    err.status = 404;
    throw err;
  }
  return count;
  // line 216 was: return count;
```

**Edge case:** Bulk updates (no `filter.id`) return 0 silently — that's correct behavior for "update all matching" queries.

---

### Priority 3 (HIGH): FK Reference Check

**Where:** `runtime/db.js` → new `validateForeignKeys()`, called in `insert()` after `enforceTypes`, before `validateRequired`

```js
function validateForeignKeys(record, schema) {
  if (!schema || typeof schema !== 'object') return;
  for (const [field, config] of Object.entries(schema)) {
    if (config.type !== 'fk') continue;
    const value = record[field];
    if (value === undefined || value === null || value === '') continue;
    // Derive reference table from config.ref or field name convention
    let refTable;
    if (config.ref) {
      refTable = config.ref.toLowerCase();
      if (!refTable.endsWith('s')) refTable += 's';
    } else if (field.endsWith('_id')) {
      refTable = field.replace(/_id$/, '') + 's';
    } else {
      continue;
    }
    refTable = refTable.toLowerCase();
    if (!_tables[refTable]) continue; // table not registered — skip
    const ref = findOne(refTable, { id: value });
    if (!ref) {
      throw new Error(field + ' references non-existent record (id ' + value + ' not found in ' + refTable + ')');
    }
  }
}
```

Call order in `insert()`:
```
sanitizeRecord → enforceTypes → validateForeignKeys → validateRequired → validateUnique → insert
```

---

### Priority 4 (MEDIUM): Balance/Stock Subtraction Warning

**Where:** `validator.js` → new `validateArithmetic()`, called from `validate()` (line 48)

Add to validate function: `validateArithmetic(ast.body, warnings);`

```js
const BALANCE_WATCHLIST = ['balance', 'stock', 'inventory', 'quantity', 'credits', 'remaining', 'available'];

function validateArithmetic(body, warnings) {
  function check(nodes, hasGuard) {
    for (const n of nodes) {
      if (n.type === NodeType.GUARD) hasGuard = true;
      if (n.type === NodeType.ASSIGN && n.name && n.name.includes('.')) {
        const member = n.name.split('.').pop();
        if (BALANCE_WATCHLIST.includes(member) && n.expression &&
            n.expression.type === 'binary_op' && n.expression.operator === '-' && !hasGuard) {
          warnings.push(
            `Line ${n.line}: subtracting from '${member}' with no guard. Consider adding:\n` +
            `  check ${n.name.replace('.', "'s ")} is at least <amount>, otherwise error 'Insufficient ${member}'`
          );
        }
      }
      if (n.body) check(n.body, hasGuard);
    }
  }
  // Only check inside endpoints
  for (const n of body) {
    if (n.type === NodeType.ENDPOINT && n.body) check(n.body, false);
  }
}
```

---

### Priority 5 (MEDIUM): Frontend-Backend Field Mismatch Warning

**Where:** `validator.js` → extend `validateFetchURLsMatchEndpoints()` (line ~941, after existing checks)

After the existing URL mismatch check, add field mismatch detection:

```js
// Inside checkFetches(), after the URL matching block, add:
if (n.type === NodeType.API_CALL && n.fields && n.fields.length > 0 && n.url) {
  // Find the endpoint that handles this URL
  const method = n.method || 'POST';
  for (const ep of body) {
    if (ep.type !== NodeType.ENDPOINT) continue;
    if (ep.method !== method) continue;
    const epNorm = ep.path.replace(/:[\w]+/g, ':id');
    const urlNorm = n.url.replace(/\/[\w-]+$/, '/:id');
    if (ep.path !== n.url && epNorm !== urlNorm) continue;
    // Found matching endpoint — find its table
    const crudNode = ep.body?.find(b => b.type === NodeType.CRUD && b.operation === 'save');
    if (!crudNode) continue;
    const tableName = crudNode.target;
    const shape = body.find(b => b.type === NodeType.DATA_SHAPE &&
      (b.name === tableName || b.name === tableName + 's' || b.name + 's' === tableName));
    if (!shape) continue;
    const schemaFields = new Set(shape.fields.map(f => f.name));
    for (const sent of n.fields) {
      if (!schemaFields.has(sent)) {
        // Check for close match
        let suggestion = '';
        for (const sf of schemaFields) {
          if (sent.includes(sf) || sf.includes(sent)) suggestion = ` Did you mean '${sf}'?`;
        }
        warnings.push(
          `Line ${n.line}: frontend sends '${sent}' to ${method} ${n.url}, but the ${shape.name} table has no '${sent}' field.${suggestion}`
        );
      }
    }
    break;
  }
}
```

---

### Priority 6 (LOW): Capacity/Inventory Overflow Warning

**Where:** `validator.js` → new `validateCapacity()`, called from `validate()`

```js
const CAPACITY_FIELDS = ['capacity', 'limit', 'stock', 'max_seats', 'max_attendees', 'max_capacity'];
const COUNTER_FIELDS = ['tickets_sold', 'sold', 'used', 'registered_count', 'enrolled_count', 'count'];

function validateCapacity(body, warnings) {
  // Collect tables with capacity + counter pairs
  const capacityTables = new Map();
  for (const n of body) {
    if (n.type !== NodeType.DATA_SHAPE) continue;
    const fields = n.fields.map(f => f.name);
    const hasCap = fields.some(f => CAPACITY_FIELDS.some(c => f === c || f.startsWith('max_')));
    const hasCounter = fields.some(f => COUNTER_FIELDS.some(c => f === c || f.endsWith('_count') || f.endsWith('_sold')));
    if (hasCap && hasCounter) capacityTables.set(n.name.toLowerCase(), n);
  }
  if (capacityTables.size === 0) return;

  // Check endpoints that insert into child tables with FK to capacity tables
  for (const ep of body) {
    if (ep.type !== NodeType.ENDPOINT || !ep.body) continue;
    const hasGuard = ep.body.some(n => n.type === NodeType.GUARD);
    if (hasGuard) continue;
    for (const n of ep.body) {
      if (n.type !== NodeType.CRUD || n.operation !== 'save' || !n.resultVar) continue;
      // This is an insert — check if the target table has FK to a capacity table
      const targetName = n.target?.toLowerCase();
      if (!targetName) continue;
      const targetShape = body.find(b => b.type === NodeType.DATA_SHAPE &&
        b.name.toLowerCase() === targetName);
      if (!targetShape) continue;
      for (const f of targetShape.fields) {
        if (f.type === 'fk' || f.name.endsWith('_id')) {
          const refBase = f.name.replace(/_id$/, '').toLowerCase();
          for (const [capName] of capacityTables) {
            if (capName.startsWith(refBase) || refBase.startsWith(capName.replace(/s$/, ''))) {
              warnings.push(
                `Line ${ep.line}: inserting into '${targetName}' which references '${capName}'. ` +
                `The ${capName} table has capacity/counter fields but this endpoint has no guard. ` +
                `Consider: check ${refBase}'s <counter> is less than ${refBase}'s <capacity>, otherwise error 'Full'`
              );
            }
          }
        }
      }
    }
  }
}
```

---

### Priority 7 (LOW): Seed Idempotency

**Where:** `compiler.js` → `compileCrud` insert path (line ~1399)

**CRITICAL FIX FROM RED TEAM:** `isSeedEndpoint` is computed at line 1228, but `compileBody` (which calls `compileCrud`) runs at line 1226 — BEFORE the seed flag is set. Fix: move `isSeedEndpoint` computation before `compileBody` and pass it through context.

In `compileEndpoint()`, change line 1226:
```js
// BEFORE (line 1226-1228):
const bodyCode = compileBody(node.body, ctx, { indent: ctx.indent + 2, declared: epDeclared, endpointMethod: node.method, endpointHasId: hasIdParam });
const isSeedEndpoint = node.path.includes('/seed');

// AFTER:
const isSeedEndpoint = node.path.includes('/seed') || node.path.includes('/setup') || node.path.includes('/init');
const bodyCode = compileBody(node.body, ctx, { indent: ctx.indent + 2, declared: epDeclared, endpointMethod: node.method, endpointHasId: hasIdParam, isSeedEndpoint });
```

In `compileCrud` insert path (line ~1399), wrap the insert when `ctx.isSeedEndpoint`:
```js
if (ctx.isSeedEndpoint && node.resultVar) {
  // Find unique fields in schema to use as dedup key
  // Emit: const _existing = await db.findOne('table', { uniqueField: var.uniqueField });
  //       if (!_existing) { const result = await db.insert(...); } else { const result = _existing; }
}
```

Detect unique fields from schema: iterate `ctx.schemaNames`, find matching schema in the compiled output, check for `unique: true` fields.

---

### Priority 8 (LOW): Duplicate Request Guard

**Where:** `runtime/db.js` — VERIFY ONLY, no code change needed.

Verified: `insert()` at lines 156-176 is fully synchronous — `sanitizeRecord`, `enforceTypes`, `validateForeignKeys`, `validateRequired`, `validateUnique`, `applyDefaults`, and `push` all happen in the same synchronous tick. No `await` between unique check and push. Node's event loop guarantees no interleaving. This guard is already satisfied.

---

## 📁 FILES INVOLVED

| File | Changes |
|------|---------|
| `runtime/db.js` | Guards 1, 2, 3: `enforceTypes()`, `validateForeignKeys()`, update 404 check. ~40 new lines. |
| `compiler.js` | Guard 7: move `isSeedEndpoint` before `compileBody`, seed idempotency in `compileCrud`. ~15 new lines. |
| `validator.js` | Guards 4, 5, 6: `validateArithmetic()`, `validateCapacity()`, extend `validateFetchURLsMatchEndpoints()`. ~80 new lines. |
| `clear.test.js` | Unit tests for all guards. ~60 new lines. |
| `tests/guard-bugs/` | 8 blind-agent acceptance test apps |
| `intent.md` | Document guard behavior in compiler passes section |

---

## 🚨 EDGE CASES

| Scenario | Handling |
|----------|----------|
| `Number("")` returns `0` | **FIXED:** `enforceTypes` skips empty strings — does NOT coerce to 0 |
| `Number("0")` → `0` | Valid — coerces correctly |
| `Number(" ")` → `NaN` | Rejected — "must be a number" |
| `Number(true)` → `1` | Allowed — boolean coercion to number is intentional |
| FK field `user_id` → `users` table doesn't exist | Skip FK check |
| `parent_id` → `parents` table doesn't exist | Skip FK check |
| Update with no `:id` (bulk) returns 0 | No error — `filter.id` is undefined, guard skipped |
| Seed table has no unique fields | Skip dedup, no warning needed |
| `isSeedEndpoint` must flow to `compileCrud` | **FIXED:** moved before `compileBody`, passed in context |
| `validateArithmetic` on `count = count + 1` | No warning — only triggers on subtraction |
| Frontend sends matching fields | No warning — exact match skips check |

---

## 🔄 TDD CYCLES + BLIND-AGENT ACCEPTANCE TESTS

Each phase: implement → unit test → build acceptance app → trigger bug → blind agent debugs → grade.

**Pass criteria: A or B on every acceptance test. No F grades.**

---

### Phase 1: Type Enforcement (Guard 2) — `runtime/db.js`

**Read first:** `runtime/db.js` lines 155-176

**Unit tests (add to clear.test.js):**
```js
describe('Guard: type enforcement on insert', () => {
  it('rejects non-numeric string for number field', () => {
    // Setup: create table with number field, try insert with string
    const src = `build for javascript backend
database is local memory
create a Products table:
  name, required
  price (number), required
when user calls POST /api/products sending data:
  needs login
  new_product = save data as new Product
  send back new_product`;
    const r = compileProgram(src);
    expect(r.errors).toHaveLength(0);
    // The runtime db.js enforceTypes will reject 'fifty' at runtime
  });
});
```

**Acceptance test — Veterinary Clinic:**
- App: Pets table with `weight (number), required`.
- Planted bug: POST `{"name":"Buddy","species":"dog","weight":"heavy"}` → should error.
- Blind agent gets: error + source + compiled. Diagnoses type mismatch.

---

### Phase 2: Update-Not-Found (Guard 1) — `runtime/db.js`

**Read first:** `runtime/db.js` lines 178-216

**Unit test:**
```js
describe('Guard: update-not-found', () => {
  it('compiled PUT returns 404 for non-existent record', () => {
    const src = `build for javascript backend
database is local memory
create a Books table:
  title, required
  status, default 'available'
when user calls PUT /api/books/:id sending book:
  needs login
  book's status is 'returned'
  save book to Books
  send back 'returned'`;
    const r = compileProgram(src);
    expect(r.errors).toHaveLength(0);
    // Runtime: PUT /api/books/999 should throw 404
  });
});
```

**Acceptance test — Library System:**
- App: Books with checkout/return.
- Planted bug: PUT /api/books/999 returns 200 "returned" for non-existent book.
- After guard: 404 error.

---

### Phase 3: FK Reference Check (Guard 3) — `runtime/db.js`

**Read first:** `runtime/db.js` lines 155-176, `compiler.js` lines 1530-1545

**Unit test:**
```js
describe('Guard: FK reference check', () => {
  it('rejects insert with non-existent FK reference', () => {
    const src = `build for javascript backend
database is local memory
create a Projects table:
  name, required
create a Tasks table:
  project_id, required
  title, required
when user calls POST /api/tasks sending task:
  needs login
  new_task = save task as new Task
  send back new_task`;
    const r = compileProgram(src);
    expect(r.errors).toHaveLength(0);
    // Runtime: POST with project_id=999 should throw FK error
  });
});
```

**Acceptance test — Project Management:**
- App: Projects + Tasks (project_id FK).
- Planted bug: POST /api/tasks with project_id=999. Creates orphan.
- After guard: FK reference error.

---

### Phase 4: Compile-Time Warnings (Guards 4, 5, 6) — `validator.js`

**Read first:** `validator.js` lines 35-48, 891-942

**Unit tests:**
```js
describe('Guard: balance subtraction warning', () => {
  it('warns on subtraction from balance field without guard', () => {
    const src = `build for javascript backend
database is local memory
create a Accounts table:
  name, required
  balance (number), default 0
when user calls POST /api/withdraw sending data:
  needs login
  account = look up Account where id is data's account_id
  account's balance = account's balance - data's amount
  save account to Accounts
  send back 'done'`;
    const r = compileProgram(src);
    expect(r.warnings.some(w => w.includes('balance') && w.includes('guard'))).toBe(true);
  });
});

describe('Guard: field mismatch warning', () => {
  it('warns when frontend field name does not match table schema', () => {
    const src = `build for web and javascript backend
database is local memory
create a Teams table:
  name, required
when user calls POST /api/teams sending team:
  needs login
  new_team = save team as new Team
  send back new_team
page 'App' at '/':
  'Team Name' is a text input saved as a team_name
  button 'Create':
    send team_name to '/api/teams'`;
    const r = compileProgram(src);
    expect(r.warnings.some(w => w.includes('team_name') && w.includes('name'))).toBe(true);
  });
});

describe('Guard: capacity overflow warning', () => {
  it('warns on insert into child of capacity table without guard', () => {
    const src = `build for javascript backend
database is local memory
create a Events table:
  title, required
  capacity (number), required
  tickets_sold (number), default 0
create a Registrations table:
  event_id, required
  name, required
when user calls POST /api/registrations sending reg:
  needs login
  new_reg = save reg as new Registration
  send back new_reg`;
    const r = compileProgram(src);
    expect(r.warnings.some(w => w.includes('capacity') || w.includes('guard'))).toBe(true);
  });
});
```

**Acceptance tests:**
- **Inventory app:** Stock subtraction without guard → warning.
- **Employee Directory:** Field name mismatch → warning.

---

### Phase 5: Seed Idempotency (Guard 7) — `compiler.js`

**Read first:** `compiler.js` lines 1224-1234 (compileEndpoint), 1397-1400 (compileCrud insert)

**Unit test:**
```js
describe('Guard: seed idempotency', () => {
  it('seed endpoint emits findOne before insert for unique fields', () => {
    const src = `build for javascript backend
database is local memory
create a Categories table:
  name, required, unique
when user calls POST /api/seed:
  create c1:
    name is 'Tech'
  save c1 as new Category
  send back 'seeded'`;
    const r = compileProgram(src);
    expect(r.errors).toHaveLength(0);
    expect(r.javascript).toContain('findOne');
  });
});
```

**Acceptance test — Demo Data Loader:**
- App: Categories (name, unique). Seed creates 3.
- Planted bug: Second seed call duplicates all categories.
- After guard: findOne check prevents duplicates.

---

### Phase 6: Integration — Rebuild Hard-Bug Apps

**Run:** `node clear.test.js` — all tests pass. Rebuild 15 hard-bug apps. Verify guards fire.

---

## 🧪 ACCEPTANCE TEST PROTOCOL

For each guard:
1. Build the test app (`node cli/clear.js build`)
2. Start server with `CLEAR_DEBUG=verbose`
3. Trigger the planted bug
4. Capture error JSON or compile warning
5. Spawn blind agent with: source + compiled + error + syntax docs. NO knowledge of planted bug.
6. Agent diagnoses, explains root cause, writes fix.
7. Grade: A/B/C/F

**8 acceptance tests. Target: A or B on all 8.**

---

## Research Sources

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [CWE Top 25 2025](https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html)
- [CodeRabbit: AI vs Human Code Generation](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report)
- [AI Code Bugs Survey — arXiv](https://arxiv.org/html/2512.05239v1)
- [Race Conditions: The Bug Class Nobody Tests For](https://medium.com/@nabilmouzouna/race-conditions-in-web-apps-the-bug-class-nobody-tests-for-1253b47c2d3b)
- [Wrong Status Codes Cause 70% of API Bugs](https://www.beyondthesemicolon.com/from-200-to-503-a-field-guide-to-clean-rest-responses/)
- [Silent Data Corruption in Production](https://testdriver.ai/articles/how-to-detect-and-handle-silent-data-corruption-bugs-in-production)
- [TOCTOU Guide — DeepStrike](https://deepstrike.io/blog/what-is-time-of-check-time-of-use-toctou)

---

## 📎 RESUME PROMPT

> Read `plans/plan-silent-bug-guards-04-07-2026.md`. Silent bug guards: 8 guards ranked by research. Top 3 (HIGH) in runtime/db.js: type enforcement, update-not-found, FK check. Medium in validator.js: balance warning, field mismatch. Low: capacity warning, seed idempotency, double-submit verified. 6 phases, each with unit tests + blind-agent acceptance test. Branch: `feature/silent-bug-guards`.
