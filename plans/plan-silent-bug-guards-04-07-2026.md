# Plan: Silent Bug Guards — Compiler-Generated Runtime Protections

**Branch:** `feature/silent-bug-guards`
**Date:** 2026-04-07
**Status:** Research-backed. Priority ranked by OWASP 2025, CWE Top 25, CodeRabbit AI code study.

---

## 🎯 THE PROBLEM

Clear apps can return HTTP 200 with silently corrupt data. In our hard-bug testing, 10 of 15 bugs produced no error. These silent bugs are the most dangerous class because nothing triggers the error translator.

**Research backing (see sources at bottom):**
- AI-generated code produces 1.75x more logic/correctness errors (CodeRabbit, 470 repos)
- Wrong status codes cause 70% of API bugs (industry data)
- Null property access is the #1 JS runtime crash globally
- OWASP A10:2025 (NEW) — "Mishandling of Exceptional Conditions" — specifically calls out "failing open" and silent data corruption
- TOCTOU race conditions are "the bug class nobody tests for" (Medium, 2025)
- Mass assignment via PATCH/PUT is a confirmed real-world exploit vector (OWASP A06)

---

## 🔧 THE FIX — 8 Guards, Priority Ranked

Ranked by frequency × impact from web research. Top 3 are HIGH (affect every CRUD app). Next 2 are MEDIUM (common patterns). Bottom 3 are LOW (nice-to-have warnings).

### Priority 1 (HIGH): Guard 2 — Type Enforcement on Insert

**Research:** #1 source of JS runtime errors. AI code 1.75x worse. Forms always send strings.
**Pattern:** Schema says `price (number)` but incoming data has `price: "fifty"`.
**Guard:** In `db.insert()`, coerce numeric strings to numbers. Reject non-numeric strings.
**Where:** `runtime/db.js` → new `enforceTypes()`, called in `insert()` after sanitize

---

### Priority 2 (HIGH): Guard 1 — Update-Not-Found → 404

**Research:** Wrong status codes cause 70% of API bugs. 200 OK masking failures is the #1 silent failure pattern.
**Pattern:** `save X to Table` when record doesn't exist returns 200.
**Guard:** `db.update()` throws 404 when count === 0 and filter has an id.
**Where:** `runtime/db.js` → `update()`, after count loop

---

### Priority 3 (HIGH): Guard 3 — FK Reference Check

**Research:** Null property access is #1 JS crash. Orphan FKs cause downstream null refs.
**Pattern:** `save data as new LineItem` where `invoice_id = 999` but Invoice 999 doesn't exist.
**Guard:** In `db.insert()`, for any `type: "fk"` field, verify referenced record exists.
**Where:** `runtime/db.js` → new `validateForeignKeys()`

---

### Priority 4 (MEDIUM): Guard 6 — Balance/Stock Subtraction Warning

**Research:** TOCTOU is a top bug class. Banking double-withdraw is the canonical example.
**Pattern:** `x's balance = x's balance - amount` with no prior guard.
**Guard:** Compile-time warning when subtracting from watchlist fields without a guard.
**Where:** `validator.js` → new `validateArithmetic()`

---

### Priority 5 (MEDIUM): Guard 8 — Frontend-Backend Field Mismatch Warning

**Research:** Clear-specific. Prevents the most confusing class of "required field" errors.
**Pattern:** Form saves to `team_name` but table column is `name`.
**Guard:** Compile-time warning with suggested fix.
**Where:** `validator.js` → extend `validateFetchURLsMatchEndpoints()`

---

### Priority 6 (LOW): Guard 4 — Capacity/Inventory Overflow Warning

**Research:** Business logic, not a vulnerability class. But came up in our testing (HB-14).
**Pattern:** Inserting into child table when parent has capacity/counter fields.
**Guard:** Compile-time warning only.
**Where:** `validator.js` → new `validateCapacity()`

---

### Priority 7 (LOW): Guard 7 — Seed Idempotency

**Research:** Dev-only concern. Not a production vulnerability.
**Pattern:** Seed endpoint called multiple times creates duplicates.
**Guard:** Compiled find-before-insert for seed endpoints with unique fields.
**Where:** `compiler.js` → `compileCrud` insert path

---

### Priority 8 (LOW): Guard 9 — Duplicate Request / Double-Submit

**Research:** TOCTOU is confirmed top bug class. "Two simultaneous requests both pass the check."
**Pattern:** Two concurrent POST requests both pass unique check, both insert.
**Guard:** Already partially covered — `db.insert()` unique validation is synchronous in Node's event loop. For true atomicity, the runtime's unique check + insert should be in the same synchronous block (no `await` between check and push). Verify this is the case.
**Where:** `runtime/db.js` → verify `insert()` is fully synchronous between check and push

---

## 📁 FILES INVOLVED

| File | Changes |
|------|---------|
| `runtime/db.js` | Guards 1, 2, 3, 9: `enforceTypes()`, `validateForeignKeys()`, update count check, verify insert atomicity |
| `compiler.js` | Guard 7: seed idempotency (find-before-insert) |
| `validator.js` | Guards 4, 6, 8: capacity warning, arithmetic warning, field mismatch warning |
| `clear.test.js` | Unit tests for all guards |
| `tests/guard-bugs/` | 8 blind-agent acceptance test apps |
| `intent.md` | Document guard behavior |

---

## 🔄 TDD CYCLES + BLIND-AGENT ACCEPTANCE TESTS

Each phase:
1. Implement the guard
2. Write unit tests (fast, `node clear.test.js`)
3. Build a subtle test app with a planted bug that the guard should catch
4. Start the server, trigger the bug, capture error JSON
5. Spawn a BLIND AGENT that gets: source file + compiled output + error + syntax docs. It does NOT know what bug was planted. It must diagnose and fix.
6. Grade: A (fixed from error alone), B (needed one file read), C (needed exploration), F (failed)

**Pass criteria: A or B on every acceptance test. No F grades.**

---

### Phase 1: Type Enforcement (Guard 2) — `runtime/db.js`

**Read:** `runtime/db.js` lines 155-176

**Unit tests:**
1. 🔴 `db.insert('products', { name: 'Widget', price: 'fifty' })` → throws "price must be a number"
   🟢 Add `enforceTypes()` in `insert()` after sanitize (line 162)
   🔄 Verify `"45.50"` coerces to `45.5`, `"0"` coerces to `0`, `null` skipped

**Acceptance test — Veterinary Clinic app:**
- App: Pet records with `weight (number), required`. Appointment booking.
- Planted bug: POST with `{"name":"Buddy","species":"dog","weight":"heavy"}` — silent success (currently saves "heavy" as weight).
- After guard: throws "weight must be a number, got 'heavy'"
- Agent gets: error JSON + source + compiled output + syntax guide. Must diagnose and fix.

---

### Phase 2: Update-Not-Found (Guard 1) — `runtime/db.js`

**Read:** `runtime/db.js` lines 178-216

**Unit tests:**
2. 🔴 `db.update('contacts', { id: 999, name: 'Ghost' })` → throws 404
   🟢 After count loop in `update()`, add `if (count === 0 && filter.id !== undefined) throw 404`
   🔄 Verify existing records update normally, bulk updates (no id) don't throw

**Acceptance test — Library System app:**
- App: Books table with checkout/return via PUT. Members table.
- Planted bug: PUT /api/books/999 with `{"status":"returned"}` — currently returns 200 "updated" even though book 999 doesn't exist.
- After guard: throws 404 "No record found with id 999"
- Agent gets: error + files. Must diagnose.

---

### Phase 3: FK Reference Check (Guard 3) — `runtime/db.js`

**Read:** `runtime/db.js` lines 155-176, compiler.js lines 1530-1545 (compileDataShape schema output)

**Unit tests:**
3. 🔴 `db.insert('line_items', { invoice_id: 999, description: 'Widget' })` → throws "invoice_id references non-existent record" when invoices table exists
   🟢 Add `validateForeignKeys()` in `insert()` after enforceTypes
   🔄 Verify insert works when FK target exists. Verify skip when target table doesn't exist.

**Acceptance test — Project Management app:**
- App: Projects table + Tasks table (project_id FK). Create task endpoint.
- Planted bug: POST /api/tasks with `{"project_id":"999","title":"Build feature"}` — currently creates orphan task.
- After guard: throws "project_id references non-existent record (id 999 not found in projects)"
- Agent gets: error + files. Must diagnose.

---

### Phase 4: Compile-Time Warnings (Guards 6, 8) — `validator.js`

**Read:** `validator.js` lines 35-48, 891-942

**Unit tests:**
4. 🔴 Source with `account's balance = account's balance - amount` emits warning about balance subtraction
   🟢 Add `validateArithmetic()` — scan ASSIGN nodes for possessive subtraction on watchlist fields
   🔄 No warning on addition. No warning when GUARD precedes the subtraction.

5. 🔴 Source with frontend sending `team_name` but table having `name` → warning with suggestion
   🟢 Extend `validateFetchURLsMatchEndpoints()` — cross-check sent fields against table schema
   🔄 No warning when fields match.

**Acceptance test — Inventory app (balance warning):**
- App: Warehouse with `stock` field. Order endpoint subtracts from stock.
- Planted bug: `product's stock = product's stock - order's quantity` with no guard — stock can go negative.
- Compile warning should fire: "subtracting from 'stock' with no guard"
- Agent gets: compile warnings + source. Must add the guard.

**Acceptance test — Employee Directory app (field mismatch):**
- App: Employees table with `name, email, department`. Frontend form saves to `emp_name, emp_email, dept`.
- Planted bug: Fields don't match — POST always fails with "name is required".
- Compile warning should fire: "frontend sends 'emp_name' but Employees table has 'name'"
- Agent gets: compile warnings + source. Must fix the field names.

---

### Phase 5: Capacity Warning + Seed Idempotency (Guards 4, 7) — `validator.js` + `compiler.js`

**Read:** `validator.js` lines 640-730, `compiler.js` lines 1228-1234, 1397-1400

**Unit tests:**
6. 🔴 Table with `capacity` + `tickets_sold` + child insert → warning about capacity
   🟢 Add `validateCapacity()` — scan for capacity/counter pairs with FK child inserts
   🔄 No warning when endpoint has GUARD node.

7. 🔴 Compiled seed endpoint with unique field emits `db.findOne` before `db.insert`
   🟢 In `compileCrud` insert path, when `ctx.isSeedEndpoint`, emit find-before-insert
   🔄 Non-seed endpoints unaffected.

**Acceptance test — Conference Registration app (capacity):**
- App: Conferences table (capacity, registered_count). Registrations table (conference_id FK).
- Planted bug: Register endpoint has no capacity check. Conference with capacity=2 and registered_count=2 accepts more.
- Compile warning should fire about capacity.
- Agent gets: warning + source. Must add the capacity check.

**Acceptance test — Demo Data Loader app (seed):**
- App: Categories table (name, unique). Seed endpoint creates 3 categories.
- Planted bug: Calling seed twice creates 6 categories (duplicates).
- After guard: second seed call skips existing records.
- Agent gets: runtime behavior + source. Must diagnose the duplication.

---

### Phase 6: Integration — Rebuild All 15 Hard-Bug Apps

8. 🔄 `node clear.test.js` — all tests pass
   🔄 Rebuild all 15 hard-bug apps:
   - HB-02: FK check catches `product_id: 999` ✓
   - HB-04,05,06,09,10,12: update-not-found catches missing records ✓
   - HB-08,13: type enforcement coerces/rejects ✓
   - HB-14: capacity warning fires ✓
   - HB-15: balance subtraction warning fires ✓
   🔄 Update `intent.md`

---

## 🧪 ACCEPTANCE TEST PROTOCOL

For each guard, the test is:

1. **Build** the test app (`node cli/clear.js build`)
2. **Start** server with `CLEAR_DEBUG=verbose`
3. **Trigger** the planted bug (specific curl command)
4. **Capture** error JSON or compile warning
5. **Spawn blind agent** with:
   - The .clear source file
   - The compiled server.js / index.html
   - The error JSON or compile warning output
   - `/home/user/clear/AI-INSTRUCTIONS.md` and `/home/user/clear/SYNTAX.md`
   - NO knowledge of what bug was planted
6. **Agent must:** diagnose the bug, explain root cause, write exact fix in Clear syntax
7. **Grade:** A/B/C/F

**8 acceptance tests total (one per guard). Target: A or B on all 8.**

---

## Research Sources

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/) — Broken Access Control #1, Mishandling Exceptional Conditions #10 (NEW)
- [CWE Top 25 2025](https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html) — XSS #1, SQLi #2, Missing Authorization #4
- [CodeRabbit: AI vs Human Code Generation](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report) — AI code 1.75x more logic errors, 2.74x more XSS
- [AI Code Bugs Survey — arXiv](https://arxiv.org/html/2512.05239v1) — 470 repos analyzed
- [Race Conditions: The Bug Class Nobody Tests For](https://medium.com/@nabilmouzouna/race-conditions-in-web-apps-the-bug-class-nobody-tests-for-1253b47c2d3b)
- [Wrong Status Codes Cause 70% of API Bugs](https://www.beyondthesemicolon.com/from-200-to-503-a-field-guide-to-clean-rest-responses/)
- [Silent Data Corruption in Production](https://testdriver.ai/articles/how-to-detect-and-handle-silent-data-corruption-bugs-in-production)
- [TOCTOU Guide — DeepStrike](https://deepstrike.io/blog/what-is-time-of-check-time-of-use-toctou)

---

## 📎 RESUME PROMPT

> Read `plans/plan-silent-bug-guards-04-07-2026.md`. Silent bug guards: 8 guards ranked by research (OWASP 2025, CWE Top 25, CodeRabbit AI study). Top 3 (HIGH): type enforcement, update-not-found, FK check — all in runtime/db.js. Medium: balance warning, field mismatch warning — validator.js. Low: capacity warning, seed idempotency, double-submit. 6 phases, 8 TDD cycles, 8 blind-agent acceptance tests. Each acceptance test: plant subtle bug → trigger → capture error → blind agent diagnoses from error + files only. Branch: `feature/silent-bug-guards`. Run `node clear.test.js` after each phase.
