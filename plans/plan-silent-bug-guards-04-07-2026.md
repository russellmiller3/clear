# Plan: Silent Bug Guards — Compiler-Generated Runtime Protections (Red-Teamed)

**Branch:** `feature/silent-bug-guards`
**Date:** 2026-04-07
**Status:** Red-teamed. 7 issues found, all patched.

---

## 🎯 THE PROBLEM

Clear apps can return HTTP 200 with silently corrupt data. In our hard-bug testing, 10 out of 15 bugs produced no error at all — the app accepted invalid input, destroyed data, or violated business logic while reporting success. These silent bugs are the most dangerous class because nothing triggers the error translator.

**The insight:** The compiler already knows the schema, the endpoint structure, and the data flow. It can generate runtime guards automatically — the developer writes zero guard code, but the compiled output rejects invalid operations at runtime.

---

## 🔧 THE FIX — 8 Guard Categories

The compiler injects runtime checks into compiled output. Each guard throws a descriptive error (caught by `_clearError`) instead of allowing silent corruption. All guards are **on by default** — no opt-in needed.

### Guard 1: Update-Not-Found

**Pattern:** `save X to Table` when the record doesn't exist.
**Current behavior:** `db.update()` returns 0 silently. `_clearTry` passes through the return value but nobody checks it.
**Guard:** Change `db.update()` in the runtime to throw when count === 0.

```js
// In runtime/db.js update(), after the for loop (line ~215):
if (count === 0 && filter.id !== undefined) {
  const err = new Error('No record found with id ' + filter.id);
  err.status = 404;
  throw err;
}
```

**Where:** `runtime/db.js` → `update()` function, line ~215 (after `count` loop, before `return count`)
**Why runtime, not compiler:** Putting the check in `db.update()` covers ALL update paths (compiled and direct), not just the ones the compiler generates. One fix, every app.

---

### Guard 2: Type Enforcement on Insert (merged with Guard 5)

**Pattern:** Schema says `price (number)` but incoming data has `price: "fifty"` or `price: "45.50"`.
**Current behavior:** Saved as-is, no type checking in `db.insert`.
**Guard:** In `db.insert()`, coerce and validate types from schema. Coerce numeric strings to numbers. Reject non-numeric strings.

```js
// In runtime/db.js insert(), after sanitize (line 162), before validateRequired (line 164):
function enforceTypes(record, schema) {
  if (!schema) return;
  for (const [field, config] of Object.entries(schema)) {
    if (record[field] === undefined || record[field] === null) continue;
    if (config.type === 'number') {
      const num = Number(record[field]);
      if (isNaN(num)) {
        throw new Error(field + ' must be a number, got ' + JSON.stringify(record[field]));
      }
      record[field] = num; // coerce "45.50" -> 45.5
    }
    if (config.type === 'boolean' && typeof record[field] === 'string') {
      if (record[field] === 'true') record[field] = true;
      else if (record[field] === 'false') record[field] = false;
    }
  }
}
```

**Where:** `runtime/db.js` → new `enforceTypes()` function, called in `insert()` at line 162

**Edge cases:**
- `"0"` → coerces to `0` (valid)
- `""` → coerces to `0` via `Number("")` — but field is empty, so `validateRequired` catches it first if required
- `"  "` → `NaN` → rejected
- `null`/`undefined` → skipped (handled by `validateRequired`)

---

### Guard 3: FK Reference Check

**Pattern:** `save data as new LineItem` where `data.invoice_id = 999` but Invoice 999 doesn't exist.
**Current behavior:** LineItem created with orphan FK.
**Guard:** In `db.insert()`, for any field with `type: "fk"` in the schema, verify the referenced record exists.

**KEY FINDING FROM RED TEAM:** The parser marks `invoice_id` fields as `type: "fk"` in the compiled schema, but `fk: null` (no explicit table reference). Only `invoice is Invoice` syntax sets `fk: "Invoice"`. So the runtime must derive the table from the field name: `invoice_id` → `invoices`, `user_id` → `users`.

```js
// In runtime/db.js insert(), after enforceTypes, before validateRequired:
function validateForeignKeys(record, schema) {
  if (!schema) return;
  for (const [field, config] of Object.entries(schema)) {
    if (config.type !== 'fk') continue;
    const value = record[field];
    if (value === undefined || value === null) continue; // required check handles missing
    // Derive reference table: invoice_id -> invoices, user_id -> users
    let refTable;
    if (config.ref) {
      refTable = config.ref.toLowerCase() + 's'; // explicit ref from "invoice is Invoice"
    } else if (field.endsWith('_id')) {
      refTable = field.replace(/_id$/, '') + 's'; // convention: invoice_id -> invoices
    } else {
      continue; // can't determine reference table
    }
    refTable = refTable.toLowerCase();
    if (!_tables[refTable]) continue; // referenced table not registered yet — skip
    const ref = findOne(refTable, { id: value });
    if (!ref) {
      throw new Error(field + ' references non-existent record (id ' + value + ' not found in ' + refTable + ')');
    }
  }
}
```

**Where:** `runtime/db.js` → new `validateForeignKeys()` function

**Edge cases:**
- `user_id` → `users` table doesn't exist yet → skip (no error)
- `parent_id` → `parents` table doesn't exist → skip
- Value is string `"1"` vs number `1` → coerce to match DB id type (use `matchesFilter` coercion)
- `config.ref = "Invoice"` → `invoices` (lowercase + pluralize)

---

### Guard 4: Capacity/Inventory Overflow (COMPILE-TIME WARNING ONLY)

**Pattern:** Registering for a sold-out event, ordering more than available stock.
**Current behavior:** Silent success.
**Guard:** **WARNING only, not auto-code-gen.** When the validator sees:
- Table A has fields matching capacity pattern (`capacity`, `max_*`, `limit`, `stock`)
- Table A has counter fields (`tickets_sold`, `*_count`, `used`, `sold`)
- An endpoint inserts into a child table that has a `_id` FK to Table A
- The endpoint does NOT have a guard/check statement

Emit a warning:
```
Warning: Line 25 — inserting into 'attendees' which references 'events'. The events table has
  capacity/tickets_sold fields but this endpoint has no capacity check.
  Consider adding: check event's tickets_sold is less than event's capacity, otherwise error 'Sold out'
```

**Where:** `validator.js` → new `validateCapacity()` function

**Why warning not auto-guard:** The heuristic relies on naming conventions and can't know the actual relationship semantics. Auto-generating capacity checks would produce false positives on tables where `capacity` means something different. A warning is honest — it says "this looks like it might need a check" and suggests the exact Clear syntax.

---

### Guard 6: Negative Balance / Insufficient Funds (COMPILE-TIME WARNING)

**Pattern:** `x's balance = x's balance - amount` with no prior guard.
**Current behavior:** Balance goes negative silently.
**Guard:** When the validator sees an ASSIGN node where:
- The target is a possessive access (`x's balance`, `account's stock`, etc.)
- The member name is in a watchlist: `balance`, `stock`, `inventory`, `quantity`, `credits`, `remaining`, `available`
- The expression is a subtraction (`binary_op` with `-`)

And there is NO preceding GUARD node in the same endpoint body, emit a warning:

```
Warning: Line 15 — subtracting from 'balance' with no guard. Consider:
  check from_account's balance is at least transfer's amount, otherwise error 'Insufficient funds'
```

**Where:** `validator.js` → new `validateArithmetic()` function

**AST shape (verified):**
```json
{
  "type": "assign",
  "name": "x.balance",
  "expression": {
    "type": "binary_op",
    "operator": "-",
    "left": { "type": "member_access", "member": "balance" },
    "right": { "type": "variable_ref", "name": "amount" }
  }
}
```

Detection: check `node.type === 'assign'` AND `node.name` contains `.` AND the member part after `.` is in the watchlist AND `node.expression.operator === '-'`.

---

### Guard 7: Seed Idempotency

**Pattern:** `POST /api/seed` called 5 times creates 5 copies of seeded data.
**Current behavior:** Each call inserts new records.
**Guard:** For seed endpoints (path includes `/seed`, `/setup`, or `/init`), when the compiled code has `db.insert()` calls, wrap each in a find-first check using the unique-constrained field.

```js
// Compiled output for seed endpoint insert:
const _existing = await db.findOne('tags', { name: t1.name });
if (!_existing) {
  await db.insert('tags', _pick(t1, TagsSchema));
}
```

**Where:** `compiler.js` → `compileCrud` insert path (line ~1399), conditional on `ctx.isSeedEndpoint`

**Detection:** The `isSeedEndpoint` flag is already set at line 1228 of compiler.js. Pass it through the context: `{ ...ctx, isSeedEndpoint }`.

**Edge cases:**
- Table has no unique fields → can't determine duplicate key → skip guard, emit warning: "Seed endpoint inserts into table with no unique fields — cannot auto-deduplicate"
- Multiple unique fields → use first unique field as dedup key
- `resultVar` pattern (`new_tag = save t1 as new Tag`) → assign `_existing` to `resultVar` on skip

---

### Guard 8: Frontend-Backend Field Mismatch Warning

**Pattern:** Frontend form saves to `team_name` but table column is `name`.
**Current behavior:** Silent 400 with "name is required" — the error fires but doesn't explain WHY the field is missing.
**Guard:** In the validator, when a `send X to '/api/path'` references fields, cross-check those field names against the table schema that the endpoint writes to.

Detection logic (extend existing `validateFetchURLsMatchEndpoints` at line 891):
1. From `API_CALL` nodes, collect `{ url, method, fields[] }`
2. From `ENDPOINT` nodes, find which table they write to (CRUD nodes in body)
3. From `DATA_SHAPE` nodes, get the table's field names
4. For each frontend field not in the table schema, check for close matches (Levenshtein or prefix/suffix):
   - `team_name` vs `name` → suggest "Did you mean 'name'?"
   - `email_address` vs `email` → suggest "Did you mean 'email'?"

```
Warning: Line 47 — frontend sends 'team_name' to POST /api/teams, but the Teams table has no 'team_name' field.
  Did you mean 'name'? Change to: 'Team Name' is a text input saved as a name
```

**Where:** `validator.js` → extend `validateFetchURLsMatchEndpoints()`, line ~941

---

## 📁 FILES INVOLVED

### Modified Files

| File | Changes |
|------|---------|
| `runtime/db.js` | Guards 1 (update-not-found), 2 (type enforcement), 3 (FK check): `enforceTypes()`, `validateForeignKeys()`, update count check |
| `compiler.js` | Guard 7 (seed idempotency): find-before-insert for seed endpoints |
| `validator.js` | Guards 4, 6, 8: capacity warning, arithmetic warning, field mismatch warning |
| `clear.test.js` | Tests for all 8 guards |
| `intent.md` | Document guard behavior in compiler passes section |

### No New Files

---

## 🚨 EDGE CASES

| Scenario | Handling |
|----------|----------|
| FK field `user_id` references `users` table that doesn't exist yet | Skip FK check — only check tables registered in `_tables` |
| Numeric coercion on `"0"` | Valid — coerces to `0`, not NaN |
| Numeric coercion on `""` | `Number("")` is `0` — but `validateRequired` catches empty strings first |
| Numeric coercion on `" "` | `NaN` → rejected |
| `Number(true)` → `1` | Boolean for number field: coerced to 1 (may be intentional) |
| Capacity field named `max_attendees` | Heuristic matches `max_*`, `capacity`, `limit`, `stock` |
| Seed endpoint with no unique constraints | Skip dedup, emit warning |
| Multi-table capacity (event capacity across venues) | Not handled — warning only |
| Update record that exists → count=1 | Normal — no error thrown |
| Update with no `:id` in path (bulk update) | No 404 check — `filter.id` is undefined, guard skipped |
| `_pick` strips unknown fields before FK check | FK check runs AFTER `_pick`, only schema fields checked |
| `invoice_id: "1"` (string) vs `id: 1` (number) | `matchesFilter` already coerces for comparison |

---

## 🔄 TDD CYCLES

### Phase 1: Runtime type enforcement + FK check (Guards 2, 3)

**Read:** `runtime/db.js` lines 155-176 (insert function)

1. 🔴 Test: `db.insert` with `{ price: 'fifty' }` into table with `price (number)` schema throws `"price must be a number"`
   🟢 Add `enforceTypes()` function, call it in `insert()` after line 162 (after sanitize)
   🔄 Verify `{ price: "45.50" }` is coerced to `{ price: 45.5 }` and inserted successfully
   🔄 Verify `{ price: 0 }` and `{ price: "0" }` both work

2. 🔴 Test: `db.insert` with `{ invoice_id: 999 }` when `invoices` table exists but has no record 999 → throws `"invoice_id references non-existent record"`
   🟢 Add `validateForeignKeys()` function, call it in `insert()` after enforceTypes
   🔄 Verify insert succeeds when `invoice_id: 1` and invoice 1 exists
   🔄 Verify no error when referenced table doesn't exist (skip check)

### Phase 2: Update-not-found guard (Guard 1)

**Read:** `runtime/db.js` lines 178-216 (update function)

3. 🔴 Test: `db.update('contacts', { id: 999, name: 'Ghost' })` throws 404 `"No record found with id 999"`
   🟢 After the count loop in `update()` (line ~215), add: `if (count === 0 && filter.id !== undefined) throw 404`
   🔄 Verify `db.update` with existing id returns count > 0
   🔄 Verify bulk update (no id filter) does NOT throw on 0 matches

### Phase 3: Seed idempotency (Guard 7)

**Read:** `compiler.js` lines 1228-1234 (isSeedEndpoint), lines 1397-1400 (insert path)

4. 🔴 Test: compiled seed endpoint with unique field emits `db.findOne` before `db.insert`
   🟢 In `compileCrud` insert path, when `ctx.isSeedEndpoint` is true and table has unique fields, emit find-before-insert wrapper
   🟢 Pass `isSeedEndpoint` through context in `compileEndpoint` (line ~1228)
   🔄 Verify non-seed POST endpoints do NOT get the guard
   🔄 Verify seed endpoint with no unique fields emits warning

### Phase 4: Compile-time warnings (Guards 4, 6, 8)

**Read:** `validator.js` lines 35-48 (validate entry), lines 891-942 (validateFetchURLsMatchEndpoints)

5. 🔴 Test: source with `x's balance = x's balance - amount` emits warning containing "balance" and "guard"
   🟢 Add `validateArithmetic()` to validator — scan ASSIGN nodes for possessive subtraction on watchlist fields
   🔄 Verify no warning on `x's count = x's count + 1` (addition, not subtraction)
   🔄 Verify no warning when a GUARD node precedes the subtraction in the same endpoint

6. 🔴 Test: frontend sends `team_name` but table has `name` → warning contains "team_name" and suggests "name"
   🟢 Extend `validateFetchURLsMatchEndpoints()` — after matching endpoint, cross-check sent fields against table schema
   🔄 Verify no warning when sent fields match schema fields exactly

7. 🔴 Test: table with `capacity` + `tickets_sold` + child table with `event_id` → warning about capacity check
   🟢 Add `validateCapacity()` — scan for capacity/counter field pairs with FK child inserts
   🔄 Verify no warning when endpoint body already has a GUARD node

### Phase 5: Integration + rebuild hard-bug apps

8. 🔄 Run `node clear.test.js` — all tests pass
   🔄 Rebuild all 15 hard-bug apps. Verify:
   - HB-02: FK check catches `product_id: 999`
   - HB-04,05,06,09,10,12: update-not-found catches missing records
   - HB-08,13: type enforcement coerces/rejects string amounts
   - HB-14: capacity warning fires
   - HB-15: balance subtraction warning fires
   🔄 Update `intent.md` with guard behavior documentation

---

## 🧪 TESTING STRATEGY

**Test command:** `node clear.test.js`

**Success criteria:**
- [ ] All existing 1326 tests pass (no regressions)
- [ ] `db.insert` rejects non-numeric values for `(number)` fields
- [ ] `db.insert` coerces `"45.50"` → `45.5` for number fields
- [ ] `db.insert` rejects orphan FK references when parent table exists
- [ ] `db.insert` skips FK check when parent table doesn't exist
- [ ] `db.update` throws 404 when no record matches by id
- [ ] `db.update` does NOT throw on bulk updates with 0 matches (no id filter)
- [ ] Seed endpoints don't create duplicates when table has unique fields
- [ ] Validator warns on balance/stock subtraction without guard
- [ ] Validator warns on frontend-backend field name mismatch
- [ ] Validator warns on capacity/counter tables without capacity check
- [ ] No false positives on normal operations (addition, matching fields, non-capacity tables)

---

## 📎 RESUME PROMPT

> Read `plans/plan-silent-bug-guards-04-07-2026.md`. Silent bug guards: 8 categories of compiler-generated runtime protections that turn silent 200s into actionable errors. Guards 1-3 are runtime in db.js (update-not-found, type enforcement, FK check). Guard 7 is compiled code in compiler.js (seed idempotency). Guards 4,6,8 are compile-time warnings in validator.js (capacity, balance subtraction, field mismatch). 5 phases, 8 TDD cycles. Branch: `feature/silent-bug-guards`. Run `node clear.test.js` after each phase.
