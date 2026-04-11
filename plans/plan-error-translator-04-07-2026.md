# Plan: Runtime Error Translator + AI Debug Context (Red-Teamed)

**Branch:** `feature/error-translator`
**Date:** 2026-04-07
**Status:** Red-teamed. 7 issues found, all patched.

---

## 🎯 THE PROBLEM

When compiled Clear code throws at runtime, error messages don't map back to Clear source. An AI agent debugging this must read hundreds of lines of compiled JS, guess which Clear line produced it, figure out schema/endpoint context, and work backwards to the fix. The edit→compile→run→fix loop is slow because the AI lacks global context.

**The goal:** Runtime errors should be self-contained — an AI agent can fix the bug from the error alone, without reading any other files.

---

## 🔧 THE FIX

### Architecture: Three Inlined Systems

```
Clear source (backend.clear:45)
    │  compile
    ▼
server.js  →  _clearTry(() => db.insert(...), { line:45, file:'backend.clear', ... })
    │  runtime error
    ▼
_clearTry catches → enriches with context → endpoint catch formats
    │
    ▼
CLEAR_DEBUG=true  → { error, clear_line, clear_file, clear_source, hint, technical }
CLEAR_DEBUG=false → { error: "Something went wrong" }
```

**All runtime utilities are INLINED** — no external files, no imports. Same pattern as `_pick`, `_validate`, `_showToast`. The compiler emits `_clearTry` and `_clearError` as string templates directly in compiled output.

### Key Design Decisions (Red-Teamed)

1. **Inlined, not imported** — `_clearTry` and `_clearError` are embedded in compiled output as utility functions (same as `_pick`, `_validate`). No external `lib/` file. No bundler needed. Zero new dependencies.

2. **`_clearMap` is conditional** — only emitted when `CLEAR_DEBUG` is truthy. Production builds have zero overhead. No size bloat in production.

3. **`_sourceFile` tagged in `resolveModules()`** — before splicing imported nodes into `ast.body`, tag each with `node._sourceFile = moduleName`. JavaScript splice preserves object references, so properties survive.

4. **PII sanitization mandatory** — `_clearError` auto-redacts fields named `password`, `secret`, `token`, `key`, `credit_card`, `ssn`, `api_key` in verbose mode. Never dump raw request bodies.

5. **Frontend uses `console.error` with context** — no `_clearTry` on frontend (no `res` object). Instead, fetch `.catch()` and button handlers log structured error context to browser console. No server dependency.

6. **Python is first-class** — every phase implements both JS and Python. `_clear_try()` Python equivalent uses the same context structure. FastAPI endpoints get the same `CLEAR_DEBUG` three-level output.

7. **Performance: wrapping is zero-cost in production** — `_clearTry` only wraps when `CLEAR_DEBUG` is set. Production compilation emits bare `db.insert()` with no wrapper. Debug mode adds ~0.1ms per operation.

---

## Error Output Format

### CLEAR_DEBUG=false (production, default)
```json
{ "error": "Something went wrong" }
```

### CLEAR_DEBUG=true (development)
```json
{
  "error": "Cannot save contact — email is required",
  "clear_line": 45,
  "clear_file": "backend.clear",
  "clear_source": "new_contact = save contact_data as new Contact",
  "hint": "'email' is required in Contacts table (line 12 of backend.clear). Add an email field to the form, or remove 'required' from the table definition.",
  "technical": "db.insert('contacts') rejected: field 'email' marked required in ContactsSchema. Input keys: [name, company]. Missing: [email]."
}
```

### CLEAR_DEBUG=verbose (deep debug — NEVER in production)
```json
{
  "error": "Cannot save contact — email is required",
  "clear_line": 45,
  "clear_file": "backend.clear",
  "clear_source": "new_contact = save contact_data as new Contact",
  "hint": "'email' is required in Contacts table...",
  "technical": "db.insert('contacts') rejected...",
  "context": {
    "endpoint": "POST /api/contacts",
    "input": { "name": "Alice", "password": "[REDACTED]" },
    "schema": { "name": { "required": true }, "email": { "required": true, "unique": true } },
    "tables": ["contacts", "deals", "activities"],
    "imports": ["backend.clear", "frontend.clear"]
  }
}
```

---

## Error Categories & Hints

| Category | Pattern | Hint |
|----------|---------|------|
| Missing required field | `"X is required"` | "'{field}' is required in {table} ({file} line {line}). Add it to the form or remove `required`." |
| Unique violation | `"X must be unique"` | "A {table} with this {field} already exists. Check for duplicates before saving." |
| Auth required | `"Authentication required"` | "This endpoint needs login. Add `needs login` at {file} line {line}." |
| Role denied | `"Requires role"` | "User needs '{role}' role. Set at {file} line {line}." |
| Validation type | `"must be a"` | "Field '{field}' expects {expected}, got {actual}. Check the form or API call." |
| External API | `"API error"` | "API call failed at {file} line {line}. Check {service} API key and account." |
| AI call | `"AI request failed"` | "AI call failed. Check ANTHROPIC_API_KEY is set. Status: {status}." |
| Network timeout | `"aborted"` | "Request timed out after {timeout}s. Check if service is running." |

---

## 📁 FILES INVOLVED

### No New Files

Everything is inlined in compiler output. The compiler emits `_clearTry`, `_clearError`, and `_clearMap` as string templates.

### Modified Files

| File | Changes |
|------|---------|
| `compiler.js` | (1) Add `_clearTry` + `_clearError` to utility functions, (2) Generate `_clearMap` conditionally, (3) Wrap CRUD in `_clearTry` when debug, (4) Upgrade endpoint catch, (5) Frontend fetch error context |
| `compiler.js` (resolveModules) | Tag `_sourceFile` on imported nodes before splice |
| `clear.test.js` | 20+ new tests |
| `intent.md` | Document CLEAR_DEBUG env var |

---

## 🚨 EDGE CASES (Red-Teamed)

| Scenario | Handling |
|----------|----------|
| **PII in verbose mode** | Auto-redact: password, secret, token, key, credit_card, ssn, api_key |
| Error in imported module | `_sourceFile` tracks origin → hint references correct .clear file |
| `CLEAR_DEBUG` not set | Safe default — only `{ error: "Something went wrong" }` for 500s |
| Production perf | `_clearTry` only emitted with CLEAR_DEBUG. Zero overhead in production |
| Source map size | `_clearMap` only emitted with CLEAR_DEBUG. Zero bloat in production |
| Frontend errors | Console.error with `[clear:LINE file.clear]` context. No `_clearTry`. |
| Python backend | `_clear_try()` + `_clear_error()` Python equivalents in every phase |
| External API returns HTML | Truncate to 200 chars, hint says "API returned non-JSON response" |
| Cross-file bug (symptom in A, cause in B) | `_clearMap.endpoints` links endpoints to schemas → hint includes both files |
| Stack trace noise | `_clearTry` strips its own frames from stack |

---

## ENV VARS

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `CLEAR_DEBUG` | No | unset (off) | `true` = source lines + hints. `verbose` = + sanitized input/schema |

---

## 🔄 TDD CYCLES

### Phase 1: _clearTry + _clearError utilities (3 cycles)

**Read:** `compiler.js` lines 80-170 (existing inlined utilities like _showToast, _pick, _validate)

1. 🔴 Test: compiled server with CLEAR_DEBUG=true includes `_clearTry` utility function
   🟢 Add `_clearTry` and `_clearError` to the utility function list in compiler.js (same pattern as `_showToast`). `_clearTry(fn, ctx)` wraps fn in try/catch, enriches error with ctx. `_clearError(err, endpoint)` formats based on `process.env.CLEAR_DEBUG`.
   🔄 Verify tree-shaking: utility only emitted when `_clearTry` is used in output

2. 🔴 Test: `_clearError` produces three levels based on CLEAR_DEBUG
   🟢 Level 1 (off): `{ error: safeMsg }`. Level 2 (true): + clear_line, hint, technical. Level 3 (verbose): + sanitized context.
   🔄 Test: PII fields (`password`, `token`, `secret`) are `[REDACTED]`

3. 🔴 Test: hint generation matches error category patterns
   🟢 Pattern-match on error message: "required" → missing field hint, "unique" → duplicate hint, "Authentication" → auth hint
   🔄 Test all 8 categories from the hint table

### Phase 2: Source map + multi-file tracking (3 cycles)

**Read:** `compiler.js` lines 260-270 (resolveModules splice), lines 4340-4440 (server compilation)

4. 🔴 Test: imported nodes have `_sourceFile` property after resolveModules
   🟢 In `resolveModules()`, before splice: `importedNodes.forEach(n => { n._sourceFile = moduleName; if (n.body) tagSourceFile(n.body, moduleName); })`
   🔄 Verify with multi-file CRM SPA

5. 🔴 Test: compiled server with CLEAR_DEBUG includes `_clearMap` with tables and endpoints
   🟢 Generate `_clearMap` from AST during server compilation. Include only when CLEAR_DEBUG referenced.
   🔄 Verify `_clearMap.tables` has schema fields, `_clearMap.endpoints` has method/path/line/file

6. 🔴 Test: `_clearMap` NOT emitted when CLEAR_DEBUG not used (production default)
   🟢 Conditional generation: `if (process.env.CLEAR_DEBUG)` guard in compiled output
   🔄 Verify production build has no `_clearMap`

### Phase 3: CRUD wrapping (3 cycles)

**Read:** `compiler.js` lines 1169-1310 (compileCrud)

7. 🔴 Test: `save X as new Y` compiles with `_clearTry` when CLEAR_DEBUG env detected
   🟢 Wrap `db.insert()` in `_clearTry(() => ..., { op:'insert', table, line, file, source, schema })`
   🔄 Test: error includes clear_line, table name, missing field hint

8. 🔴 Test: `save X to Y` (update) includes ID context
   🟢 Wrap `db.update()`, include `req.params.id` in context
   🔄 Test: PUT with bad ID gets hint about record not found

9. 🔴 Test: `delete the X with this id` wraps with context
   🟢 Wrap `db.remove()` calls
   🔄 Test: DELETE missing record gets clear error

### Phase 4: Endpoint catch block + validation (2 cycles)

**Read:** `compiler.js` lines 1124-1154 (compileEndpoint)

10. 🔴 Test: endpoint catch uses `_clearError` format
    🟢 Replace current catch with: `const _debugInfo = _clearError(err, { method, path, line, file }); res.status(_debugInfo.status).json(_debugInfo.response);`
    🔄 Test CLEAR_DEBUG=true vs false output

11. 🔴 Test: validation errors have field-level hints
    🟢 Enrich `_validate` to throw with `_clearContext` when validation fails
    🔄 Test: missing required field, wrong type

### Phase 5: Frontend fetch context (2 cycles)

**Read:** `compiler.js` lines 2505-2560 (frontend fetch)

12. 🔴 Test: frontend GET errors log `[clear:LINE file.clear]` to console
    🟢 Enhance `.catch()` in fetch calls to log source line and URL context
    🔄 Test: console.error output includes clear:LINE

13. 🔴 Test: button action errors log button label and source line
    🟢 Add `// clear:LINE` to button click handlers, improve catch logging
    🔄 Verify console output

### Phase 6: External API + cross-file hints (2 cycles)

14. 🔴 Test: external API errors (Stripe/SendGrid) include service-specific hints
    🟢 SERVICE_CALL and HTTP_REQUEST errors include service name, env var name, URL
    🔄 Test: missing STRIPE_KEY → hint about env var

15. 🔴 Test: cross-file error includes both files in hint
    🟢 When schema error occurs, `_clearMap` provides table definition file + endpoint file
    🔄 Test: frontend sends wrong fields → hint references both files

### Phase 7: Docs + full integration (1 cycle)

16. 🔴 Update intent.md, AI-INSTRUCTIONS.md with CLEAR_DEBUG docs
    🟢 Document env var, error format, verbose mode warning
    🔄 Run full test suite, rebuild all 33 apps, verify no regressions

---

## 🧪 TESTING STRATEGY

**Test command:** `node clear.test.js`

**Success criteria:**
- [ ] All existing 1281 tests pass
- [ ] 16+ new tests pass
- [ ] CLEAR_DEBUG=true shows clear_line + hint + technical
- [ ] CLEAR_DEBUG=false shows only safe message (no leak)
- [ ] CLEAR_DEBUG=verbose redacts PII fields
- [ ] Multi-file apps track _sourceFile per node
- [ ] _clearMap only emitted with CLEAR_DEBUG (zero prod overhead)
- [ ] Frontend errors log clear:LINE to console
- [ ] All 33 apps compile
- [ ] AI agent can read error response and fix bug without other files

---

## 🔥 ACCEPTANCE TESTS — "Can an AI Fix This From the Error Alone?"

These are the real tests. The unit tests verify plumbing; these verify **outcomes**. Each test gives an AI agent ONLY the error JSON (no source files) and asks: can you produce a working patch?

### Test Protocol

For each test:
1. Write a `.clear` app with a **known bug** baked in
2. Compile it (`node cli/clear.js build`)
3. Run the server (`CLEAR_DEBUG=true node build/server.js`)
4. Hit the endpoint that triggers the bug
5. Capture the error JSON response
6. **Assert the error contains enough info to fix the bug:**
   - `clear_file` points to the right file
   - `clear_line` points to the right line (±2)
   - `hint` describes the fix in plain English
   - `technical` has the actual error details
7. **Apply the suggested fix to the .clear source**
8. Recompile, re-run, re-test — error gone

---

### DATABASE BUGS

**AT-1: Missing required field**
```clear
# Bug: frontend sends { name } but table requires email
create a Contacts table:
  name, required
  email, required, unique
when user calls POST /api/contacts sending data:
  needs login
  new_contact = save data as new Contact
  send back new_contact
```
- Trigger: `POST /api/contacts` with `{ "name": "Alice" }`
- Assert error contains: `clear_line` for the save line, `hint` mentions "email is required", `hint` references the table definition line
- Assert: an agent reading ONLY the error can add `validate data: email is text, required`

**AT-2: Unique constraint violation**
```clear
# Bug: inserting duplicate email
create a Contacts table:
  email, required, unique
when user calls POST /api/seed:
  create c1:
    email is 'alice@test.com'
  save c1 as new Contact
  create c2:
    email is 'alice@test.com'
  save c2 as new Contact
  send back 'ok'
```
- Trigger: `POST /api/seed`
- Assert: hint says "email must be unique — alice@test.com already exists", references the table `unique` constraint line

**AT-3: Update non-existent record**
```clear
# Bug: PUT with ID that doesn't exist
when user calls PUT /api/contacts/:id sending data:
  needs login
  save data to Contacts
  send back 'updated'
```
- Trigger: `PUT /api/contacts/999` with `{ "name": "Ghost" }`
- Assert: hint says "no Contact with id 999 found", references the save line

**AT-4: Foreign key orphan**
```clear
# Bug: line item references non-existent invoice
create an Invoices table:
  title, required
create a LineItems table:
  invoice_id, required
  description, required
when user calls POST /api/line-items sending data:
  needs login
  new_item = save data as new LineItem
  send back new_item
```
- Trigger: `POST /api/line-items` with `{ "invoice_id": "999", "description": "Widget" }`
- Assert: hint warns about orphaned foreign key (invoice_id 999 doesn't exist)

**AT-5: Type coercion — string where number expected**
```clear
create a Products table:
  name, required
  price (number), required
when user calls POST /api/products sending data:
  needs login
  new_product = save data as new Product
  send back new_product
```
- Trigger: `POST /api/products` with `{ "name": "Widget", "price": "fifty" }`
- Assert: hint says "price expects a number but got 'fifty'"

---

### BACKEND / AUTH BUGS

**AT-6: Missing auth on write endpoint**
```clear
# Bug: no auth guard on DELETE
when user calls DELETE /api/contacts/:id:
  delete the Contact with this id
  send back 'deleted'
```
- This is a **compile-time** validator error (already caught). Verify the validator error message includes the line number and suggests `needs login`.

**AT-7: Wrong role for endpoint**
```clear
when user calls DELETE /api/admin/users/:id:
  needs login
  needs role 'superadmin'
  delete the User with this id
  send back 'deleted'
```
- Trigger: DELETE with token that has `role: 'admin'` (not `superadmin`)
- Assert: hint says "needs role 'superadmin'" and references the line

**AT-8: Validation type mismatch**
```clear
when user calls POST /api/orders sending order:
  needs login
  validate order:
    amount is number, required
    email is text, required, matches email
  new_order = save order as new Order
  send back new_order
```
- Trigger: `POST /api/orders` with `{ "amount": "abc", "email": "not-an-email" }`
- Assert: error lists ALL validation failures (both amount and email), not just the first

---

### ASYNC / RACE CONDITION BUGS

**AT-9: Concurrent seed creates duplicates**
```clear
create a Tags table:
  name, required, unique
when user calls POST /api/seed:
  create t1:
    name is 'Enterprise'
  save t1 as new Tag
  send back 'ok'
```
- Trigger: Fire 5 concurrent `POST /api/seed` requests
- Assert: at least 4 return unique constraint errors with hint about the duplicate name

**AT-10: Timeout on external API**
```clear
when user calls POST /api/charge:
  needs login
  result = call api 'https://httpbin.org/delay/30':
    timeout is 2 seconds
    body is incoming
  send back result
```
- Trigger: `POST /api/charge` (will timeout after 2s)
- Assert: hint says "request timed out after 2 seconds" and suggests increasing timeout or checking service availability

---

### EXTERNAL API BUGS

**AT-11: Missing Stripe API key**
```clear
when user calls POST /api/charge:
  needs login
  charge via stripe:
    amount = 2000
    currency is 'usd'
    token is 'tok_test'
  send back 'charged'
```
- Trigger: `POST /api/charge` without STRIPE_KEY env var set
- Assert: hint says "Set STRIPE_KEY environment variable" and references the `charge via stripe` line

**AT-12: SendGrid rejects request**
```clear
when user calls POST /api/notify:
  needs login
  send email via sendgrid:
    to is 'test@example.com'
    from is 'bad-from'
    subject is 'Hello'
    body is 'World'
  send back 'sent'
```
- Trigger: `POST /api/notify` with invalid SENDGRID_KEY
- Assert: hint includes "SendGrid error", status code, and suggests checking the API key

---

### MULTI-FILE / CROSS-FILE BUGS

**AT-13: Frontend sends wrong fields for backend schema**
```clear
# main.clear
build for web and javascript backend
database is local memory
use everything from 'backend'
use everything from 'frontend'

# backend.clear — expects name AND email
create a Contacts table:
  name, required
  email, required
when user calls POST /api/contacts sending data:
  needs login
  validate data:
    name is text, required
    email is text, required, matches email
  new_contact = save data as new Contact
  send back new_contact

# frontend.clear — only sends name (missing email!)
page 'App' at '/':
  'Name' is a text input saved as a name
  button 'Save':
    send name to '/api/contacts'
```
- Trigger: Click "Save" with only name filled
- Assert: error references BOTH `backend.clear` (validation line) AND `frontend.clear` (form line), hint says "the form at frontend.clear line X only sends 'name' but backend.clear line Y requires 'email'"

**AT-14: Imported module has wrong table name**
```clear
# main.clear
build for web and javascript backend
database is local memory
use everything from 'backend'

# backend.clear — typo: 'Contact' singular but table is 'Contacts'
create a Contacts table:
  name, required
when user calls POST /api/contacts sending data:
  needs login
  new_contact = save data as new Contac
  send back new_contact
```
- Assert: compile error or runtime error references `backend.clear` line with hint about table name

---

### FRONTEND / UI BUGS

**AT-15: Chart renders with empty data**
```clear
page 'Dashboard' at '/':
  on page load get deals from '/api/deals'
  chart 'Pipeline' as bar showing deals
  display deals as table showing title, value
```
- Trigger: `GET /api/deals` returns `[]`
- Assert: console.error warns "chart 'Pipeline' has no data — deals is empty (clear:LINE)"

**AT-16: Edit mode collision between forms**
```clear
page 'App' at '/':
  on page load:
    get contacts from '/api/contacts'
    get deals from '/api/deals'
  display contacts as table showing name, email with edit
  display deals as table showing title, value with edit
```
- This is a known limitation — single `_editing_id` shared across tables. 
- Assert: when edit is clicked on one table while another is being edited, warn in console: "edit mode conflict — clear:LINE and clear:LINE both use _editing_id"

**AT-17: Stale state after failed fetch**
```clear
page 'App' at '/':
  on page load get items from '/api/items'
  button 'Refresh':
    get items from '/api/items'
  display items as table showing name
```
- Trigger: Server is down, click "Refresh"
- Assert: console.error includes `[GET /api/items]`, clear:LINE, and "Failed to load data — showing previous data"

---

### CSS / UI INHERITANCE BUGS

**AT-18: Dark sidebar text invisible on light theme**
```clear
theme 'ivory'
page 'App' at '/':
  section 'Layout' with style app_layout:
    section 'Nav' with style app_sidebar:
      heading 'Menu'
      text 'Dashboard'
    section 'Main' with style app_main:
      heading 'Content'
```
- Trigger: Compile and inspect HTML — sidebar uses `bg-base-200` but text color inherits from ivory theme's `base-content` which may be low-contrast on the sidebar background
- Assert: error/warning at compile time or runtime says "text in app_sidebar may have low contrast on ivory theme — consider adding `dark background` or switching to `theme 'midnight'`"
- This tests CSS-aware diagnostics

**AT-19: Nested style preset override**
```clear
style outer:
  padding = 32
  background is '#f0f0f0'

style inner:
  padding = 16

page 'App' at '/':
  section 'Outer' with style outer:
    section 'Inner' with style inner:
      text 'Hello'
```
- Trigger: Inner section inherits outer's background but overrides padding — is that intended?
- Assert: when `CLEAR_DEBUG=true`, compiled CSS includes comments: `/* clear:3 — style outer */` and `/* clear:7 — style inner */` so dev can trace which style rule applies

**AT-20: Chart container has zero height**
```clear
page 'App' at '/':
  section 'Layout' with style app_layout:
    section 'Nav' with style app_sidebar:
      text 'Nav'
    section 'Main' with style app_main:
      section 'Body' with style app_content:
        chart 'Revenue' as bar showing data
```
- Trigger: Chart renders inside a flex container that may collapse to zero height if data is empty
- Assert: console.warn includes "chart container has zero dimensions — check parent layout" and clear:LINE

---

### SUGGESTED FIX (replaces fix_scope)

Instead of trying to list what NOT to touch (which is just "everything else"), the error gives the AI the **minimal diff** — the smallest possible change that fixes the bug. The compiler can generate this for schema-related errors because it has full knowledge of tables, fields, and constraints.

```json
{
  "error": "email is required",
  "clear_line": 45,
  "clear_file": "backend.clear",
  "hint": "Add 'email, required' to Contacts table...",
  "suggested_fix": {
    "file": "backend.clear",
    "line": 12,
    "action": "add_line_after",
    "content": "  email, required",
    "explanation": "The Contacts table requires email but it's not defined. Add this field."
  }
}
```

The compiler can suggest fixes for:

| Error Category | Suggested Fix |
|----------------|---------------|
| Missing required field | `"add_line_after"` — add field to table definition |
| Missing auth | `"add_line_after"` — add `needs login` to endpoint |
| Type mismatch (`=` vs `is`) | `"replace_line"` — swap `status = 'active'` to `status is 'active'` |
| Wrong table name | `"replace_word"` — fix typo, e.g. `Contac` → `Contact` |
| Missing validation | `"add_block_after"` — add validate block before save |

For logic bugs, race conditions, CSS — no suggested fix, just `clear_line` + `hint`. Honest about what it knows.

**AT-21: Suggested fix produces correct diff**
- Start with CRM SPA (4 files)
- Introduce bug: remove `email, required` from Contacts table
- Error response must include `suggested_fix` with:
  - `file`: `backend.clear`
  - `line`: correct table definition line
  - `action`: `add_line_after`
  - `content`: `  email, required`
- Verify: applying the suggested fix and recompiling produces a working app

---

### WEB RESEARCH BUGS — AI Code Patterns (2025-2026 data)

Based on OWASP 2026, IEEE, and Stack Overflow research: AI-generated code has 1.7x more bugs than human code. 86% fail to defend against XSS. 60% of errors are semantic (code runs but wrong output). These tests cover the gaps.

**AT-22: XSS in generated HTML output**
```clear
# Bug: user input displayed without escaping
page 'App' at '/':
  'Name' is a text input saved as a name
  text name
```
- Trigger: Enter `<script>alert('xss')</script>` in the name field
- Assert: compiled output escapes HTML entities in `text name` display
- If NOT escaped: compile-time warning "displaying raw user input — use `show` not `text` for dynamic values, or sanitize"

**AT-23: Null/undefined access on missing API response field**
```clear
page 'App' at '/':
  on page load get user from '/api/me'
  text user's name
  text user's email
  text user's company's address
```
- Trigger: API returns `{ "name": "Alice" }` (no email, no company)
- Assert: console.error warns "user's email is undefined (clear:LINE) — API response missing 'email' field"
- Assert: `user's company's address` warns about deep null access chain

**AT-24: Off-by-one / empty array boundary**
```clear
page 'App' at '/':
  on page load get items from '/api/items'
  text items's length + ' items found'
  display items as table showing name
```
- Trigger: `/api/items` returns `[]`
- Assert: table renders gracefully with "No data" message, not a crash
- Assert: `items's length` works on empty array (returns 0, not error)

**AT-25: Silent wrong output (runs but incorrect)**
```clear
# Bug: using = (number) instead of is (string) for a string field
when user calls POST /api/contacts sending data:
  needs login
  data's status = 'active'
  new_contact = save data as new Contact
  send back new_contact
```
- This is the hardest category: the code compiles and runs, but `status = 'active'` might be interpreted as a numeric assignment rather than string. The error is semantic, not syntactic.
- Assert: compile-time lint warning when `=` is used with a string literal (suggest `is` instead)

**AT-26: Integration wiring gap (auth middleware not connected)**
```clear
# Bug: auth required on endpoint but frontend doesn't send token
when user calls DELETE /api/contacts/:id:
  needs login
  delete the Contact with this id
  send back 'deleted'

page 'App' at '/':
  button 'Delete':
    send nothing to '/api/contacts/1' as DELETE
```
- Trigger: Click Delete — gets 401 because frontend fetch doesn't include auth header
- Assert: error includes both the endpoint (needs login at line X) AND the frontend call (line Y), hint says "frontend call at line Y doesn't include auth — add auth token to the request"

---

### THE ULTIMATE TEST: Autonomous Fix Loop

**AT-27: Full autonomous debug cycle**

This is the money test. Steps:

1. Start with CRM SPA app (4 files, most complex app)
2. Introduce a bug: remove `email, required` from Contacts table in backend.clear
3. Compile and run with `CLEAR_DEBUG=true`
4. POST to `/api/contacts` with `{ "name": "Alice", "email": "alice@test.com" }`
5. The save should succeed but now email isn't validated
6. POST again with `{ "name": "Bob" }` (no email)
7. Capture the error response
8. **Feed ONLY the error JSON to an AI agent** (no access to source files)
9. Agent must produce a patch: "Add `email, required` to Contacts table at backend.clear line 12"
10. Apply patch, recompile, re-run — error gone

**Pass criteria:** The agent produces the correct fix from the error response alone, without reading any `.clear` files.

---

## Grading the Error Translator

After implementing, score each acceptance test:

| Grade | Meaning |
|-------|---------|
| **A** | Error alone is sufficient — agent fixes without reading source |
| **B** | Error + one file read needed — agent knows which file to check |
| **C** | Error gives direction but agent needs to explore — 2+ file reads |
| **F** | Error is useless — agent has to start from scratch |

**Target: A or B on all 27 tests. No F grades allowed.**

---

## 📎 RESUME PROMPT

> Read `plans/plan-error-translator-04-07-2026.md`. Runtime error translator: maps compiled JS/Python errors back to Clear source with hints + suggested_fix diffs. 7 phases, 16 TDD cycles + 27 acceptance tests (DB, auth, async, external API, multi-file, CSS, XSS, null access, off-by-one, silent semantic, suggested_fix, autonomous loop). Python is first-class. All utilities inlined (no external files). _clearTry wraps CRUD/auth when CLEAR_DEBUG set. _clearMap embeds source map conditionally. PII auto-redacted. Branch: `feature/error-translator`. Run `node clear.test.js` after each phase.
