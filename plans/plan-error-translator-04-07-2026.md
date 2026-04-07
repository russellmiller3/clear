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

6. **Python deferred** — Phase 1-7 are JS only. Python `_clear_try()` is documented as future work in intent.md.

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
| Python backend | Deferred. JS-only in this plan. Documented as future work. |
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

## 📎 RESUME PROMPT

> Read `plans/plan-error-translator-04-07-2026.md`. Runtime error translator: maps compiled JS errors back to Clear source with hints. 7 phases, 16 cycles. All utilities inlined (no external files). _clearTry wraps CRUD/auth when CLEAR_DEBUG set. _clearMap embeds source map conditionally. PII auto-redacted. Python deferred. Branch: `feature/error-translator`. Run `node clear.test.js` after each phase.
