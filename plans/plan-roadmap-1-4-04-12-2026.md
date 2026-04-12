# Plan: Roadmap Items 1-4 — Auth, Relationships, Validation, Aggregates

**Branch:** `feature/roadmap-1-4`
**Date:** 2026-04-12
**Scope:** Large (4 features, parser + compiler + tests, ~500 lines)

---

## 🎯 THE PROBLEM

Clear can't build real multi-user apps because it's missing four foundational pieces:

1. **Auth scaffolding** — Every app needs signup/login. Right now Meph manually writes 3+ endpoints with bcrypt, JWT, token storage. That's the #1 source of boilerplate and the #1 thing that breaks.

2. **DB relationships** — Every app with 2+ tables needs JOINs. Without `belongs to`/`has many`, Meph makes multiple API calls and stitches data client-side. Fragile and slow.

3. **Validation** — `_validate()` returns the FIRST error as a string, not ALL errors as a structured array. Real forms need field-level error display.

4. **Aggregates** — `sum of amount in Orders` parses but compiles to `_clear_sum(amount)` which tries to sum a single variable, not extract a field from an array. `sum of` / `average of` / `count of` with `field in list` are broken.

---

## 🔧 THE FIX

Four independent features, each self-contained. Execute in this order because auth needs validation, and relationships need CRUD changes that are simpler after validation is fixed.

```
Phase 1: Aggregates (fix)     — smallest, no dependencies
Phase 2: Validation (fix)     — changes _validate utility
Phase 3: Auth scaffolding     — new syntax, uses validation
Phase 4: DB Relationships     — new syntax, changes CRUD
```

### Phase 1: Aggregates — Fix `field in list` Pattern

**Current:** `sum of amount in orders` tokenizes to `sum_of`, `amount`, `in`, `orders`. The parser's collection ops handler (parser.js line 7518) calls `parsePrimary(tokens, pos + 1, ...)` which consumes only `amount` and returns. The `in orders` tokens are left unconsumed. Result: `callNode('sum', [amount_ref])` → `_clear_sum(amount)` — wrong.

**Key insight:** `in` is NOT a binary operator (not in the PRECEDENCE table at parser.js line 7633+), so `parseExprPrec` would also stop at it. The fix goes inside the collection ops handler, not in expression parsing.

**Fix:** In the collection ops handler (parser.js line 7518), after parsing the operand, check if `operand.nextPos < maxPos && tokens[operand.nextPos].canonical === 'in'`. If so, consume `in` + next token as list name. Create `callNode('_sum_field', [listNode, literalString(fieldName)])`. In the compiler, add `_clear_sum_field(arr, field)` utility.

```
sum of amount in orders
       ^^^^^^    ^^^^^^
       field     list
       
→ _clear_sum_field(orders, 'amount')
→ orders.reduce((a, item) => a + Number(item.amount || 0), 0)
```

Note: the field becomes a STRING argument (not a variable ref), since it's a property name to extract.

For `count of Users` (no field, no `in`), `count_of` maps to `_clear_len` via `mapFunctionNameJS`. Already works.

For `sum of totals` (flat array, no `in`), falls through to existing `_clear_sum(totals)`. Unchanged.

### Phase 2: Validation — Collect All Errors

**Current:** `_validate()` (compiler.js line 183) returns on first error: `return r.field + ' is required'` — a string. `compileValidate()` (line 2927) emits `const _vErr = _validate(...)` and `res.status(400).json({ error: _vErr })`.

**Fix:** Change `_validate()` to push errors into array, return `null` if empty, array if not. Update `compileValidate()` to emit:
```js
const _vErrs = _validate(req.body, [rules]);
if (_vErrs) return res.status(400).json({ errors: _vErrs });
```

Each error is `{ field: 'name', message: 'is required' }`.

**Existing test impact:** 3 tests check for `_validate(req.body` (unchanged), `400` (unchanged), and `"required":true` (unchanged — that's in the rules array, not the error output). No tests check for `_vErr` or `{ error: _vErr }` specifically. Safe to rename.

Python path: change from raising HTTPException on first failure to collecting all errors into a list and raising once with full list.

### Phase 3: Auth Scaffolding

**New syntax:** `allow signup and login`

**CRITICAL FINDING:** `needs login` already exists! It's a synonym in synonyms.js (line 386): `needs_login: ['needs login', 'need login', 'requires login']` that maps to `REQUIRES_AUTH` via CANONICAL_DISPATCH (parser.js line 830). So the frontend guard is **already implemented.** The plan does NOT need a new NEEDS_LOGIN node type.

What's missing: the backend auth endpoints. `allow signup and login` should scaffold `/auth/signup`, `/auth/login`, `/auth/me` endpoints with bcrypt + JWT, AND auto-generate a Users table if one isn't declared.

**Parser:** One new node type `AUTH_SCAFFOLD`. Add a new multi-word synonym:
```js
auth_scaffold: Object.freeze(['allow signup and login', 'allow login and signup']),
```
Add to CANONICAL_DISPATCH:
```js
['auth_scaffold', (ctx) => { ctx.body.push({ type: NodeType.AUTH_SCAFFOLD, line: ctx.line }); return ctx.i + 1; }],
```
(This follows the exact same pattern as `allow_cors`.)

**Compiler emits (JS):**
1. `require('bcryptjs')` and `require('jsonwebtoken')` at top (add to `usesAuth` detection at line ~7572)
2. `const _JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');`
3. JWT middleware: `app.use((req, res, next) => { ... })` that extracts token and sets `req.user`
4. `POST /auth/signup` — validate email+password, bcrypt hash, save to `_users` table, return JWT
5. `POST /auth/login` — find user by email, bcrypt compare, return JWT
6. `GET /auth/me` — return `req.user` (minus password hash)
7. Auto-generate `_users` table with: email (unique), password_hash, role (default 'user'), created_at

**Compiler emits (Python):**
Same endpoints with `passlib[bcrypt]` and `PyJWT`. JWT middleware as FastAPI dependency.

**Built-in login page:** NOT in this phase. Defer to a future phase. The roadmap syntax is `allow signup and login` + `needs login` on pages — both work independently. Auto-generating a login page is a nice-to-have that adds complexity.

### Phase 4: DB Relationships

**New syntax in table declarations:**
```
create a Posts table:
  title
  body
  author belongs to Users

create a Comments table:
  text
  post belongs to Posts
```

**Parser:** In `parseDataShape()` (parser.js line 4546+), during field modifier parsing, detect `belongs to TableName` pattern. The field parsing loop starts at line 4604. After the existing modifiers (`required`, `unique`, `auto`, `default`), add:
```
else if (mod === 'belongs' && fPos + 1 < fieldTokens.length && fieldTokens[fPos + 1].value === 'to') {
  fPos += 2; // skip 'belongs to'
  if (fPos < fieldTokens.length) {
    fk = fieldTokens[fPos].value;
    fieldType = 'fk';
    fPos++;
  }
}
```
This reuses the existing `fk` field mechanism (line 4574-4576 already handles FK via capitalized name detection). The `belongs to` syntax is more explicit than the implicit "author is User" pattern.

**`has many` is deferred.** It's syntactic sugar — the inverse relationship is already expressed by the FK on the child table. Auto-JOIN can work from the FK alone. Adding `has many` parsing without a clear compilation target adds complexity for no immediate value.

**Compiler changes:**
1. `compileDataShape()` — Already handles `f.fk` at line 2944: `if (f.fk) col += ' REFERENCES ${f.fk.toLowerCase()}s(id)'`. This works with the new `belongs to` parsing because it sets the same `fk` field.
2. `compileCrud()` — For `lookup` operations (line 1862+), when the AST has relationship metadata, emit post-query stitching:
```js
// After db.query('posts'):
for (const _item of posts) {
  if (_item.author_id) _item.author = db.query_one('users', { id: _item.author_id });
}
```
The FK field name in the DB is `{fieldName}_id` (e.g., `author` → `author_id`).

3. **Schema tracking:** The compiler needs to know which fields are FKs when compiling CRUD. Currently, `compileCrud` doesn't have access to the schema. Solution: during the pre-scan phase (compiler.js line ~693, where `compileToBackendJS` scans endpoints), also build a `schemaMap` from DATA_SHAPE nodes that maps table names to their fields+relationships. Pass this in the context object.

---

## 📁 FILES INVOLVED

### Modified files

| File | What changes |
|------|-------------|
| `parser.js` | Phase 1: collection ops `in` detection (~7518). Phase 3: AUTH_SCAFFOLD node type + CANONICAL_DISPATCH. Phase 4: `belongs to` in field parsing (~4604) |
| `compiler.js` | Phase 1: `_clear_sum_field` etc utilities (~130) + RUNTIME_JS (~8824) + mapFunctionName (~8904). Phase 2: `_validate` rewrite (~183) + compileValidate (~2917). Phase 3: `compileAuthScaffold()` + auto-detection (~7572). Phase 4: schema tracking + CRUD JOIN stitching (~1862) |
| `synonyms.js` | Phase 3: `auth_scaffold` synonym. Phase 4: no changes needed (no new synonym — `belongs` and `to` are regular words parsed in context) |
| `clear.test.js` | Tests for all 4 features |
| `intent.md` | Phase 5: document AUTH_SCAFFOLD node type |

---

## 🚨 EDGE CASES

| Scenario | How we handle it |
|----------|-----------------|
| `sum of items` (flat array, no field) | No `in` token after operand → falls through to existing `_clear_sum(items)` |
| `sum of amount in empty_list` | `_clear_sum_field([], 'amount')` → returns 0 |
| `count of Users` (no field) | Already works via `_clear_len` mapping — no change |
| `average of score in empty_list` | `_clear_avg_field([], 'score')` → returns 0 |
| `sum of amount in orders` where orders is not an array | Guard: `if (!Array.isArray(arr)) return 0` |
| `sum of amount in orders` where some items lack `amount` | `Number(item[field] || 0)` coerces missing to 0 |
| Validation with 0 rules | `_validate(body, [])` → returns null (no errors) |
| Validation with non-object body | Guard: if body is null/undefined, return `[{ field: '_body', message: 'Request body is required' }]` |
| Multiple validation errors | All collected: `[{ field: 'name', message: '...' }, { field: 'email', message: '...' }]` |
| `allow signup and login` with existing Users table | Auth scaffold detects existing `_users` table in AST, skips table creation |
| `allow signup and login` without pages | Generates API endpoints only — no frontend code |
| `allow signup and login` on Python backend | Emits FastAPI endpoints with passlib + PyJWT |
| Duplicate signup (same email) | `_users` table has `email UNIQUE` — DB throws duplicate error, caught by `_clearTry` |
| `belongs to Users` where Users table isn't declared yet | FK reference still emitted — SQL handles forward references. Validator could warn. |
| `belongs to` with in-memory DB | Post-query stitching: separate `db.query_one()` call per FK |
| `belongs to` with Supabase | Supabase query: `.select('*, author:users(id, name)')` |
| Field named `belongs` (collision) | Only triggers if followed by `to` + capitalized name. `belongs, required` parses as field name `belongs` with modifier `required`. |

---

## 📋 IMPLEMENTATION PHASES

### Existing Code — Phased Reading Strategy

**Always read first (every phase):**
| File | Why |
|------|-----|
| `intent.md` | Authoritative spec |
| `learnings.md` TOC | Avoid known pitfalls |

**Phase 1 — read these:**
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | 7512-7523 | Collection ops handler — where to add `in` check |
| `compiler.js` | 130-140 | UTILITY_FUNCTIONS array — where to add field variants |
| `compiler.js` | 4935-4942 | exprToCode CALL handling — how callNode compiles |
| `compiler.js` | 8824-8835 | RUNTIME_JS — where to add reactive field utilities |
| `compiler.js` | 8904-8925 | mapFunctionNameJS — where to map _sum_field etc |
| `compiler.js` | 8950-8970 | mapFunctionNamePython — same for Python |

**Phase 2 — read these:**
| File | Lines | Why |
|------|-------|-----|
| `compiler.js` | 183-202 | `_validate` utility function — rewrite target |
| `compiler.js` | 2874-2928 | `compileValidate` function — update call site |

**Phase 3 — read these:**
| File | Lines | Why |
|------|-------|-----|
| `synonyms.js` | 285 | Near `allow_cors` — add `auth_scaffold` nearby |
| `parser.js` | 826 | `allow_cors` in CANONICAL_DISPATCH — add `auth_scaffold` nearby |
| `parser.js` | 195-260 | NodeType enum — add AUTH_SCAFFOLD |
| `compiler.js` | 3674-3684 | Existing REQUIRES_AUTH compilation — understand JWT pattern |
| `compiler.js` | 7572-7600 | Backend feature auto-detection — add auth imports |
| `compiler.js` | 1690-1700 | BACKEND_ONLY_NODES — add AUTH_SCAFFOLD |

**Phase 4 — read these:**
| File | Lines | Why |
|------|-------|-----|
| `parser.js` | 4546-4626 | Field parsing in parseDataShape — add `belongs to` |
| `compiler.js` | 2930-2960 | compileDataShape — verify FK handling |
| `compiler.js` | 1862-1990 | compileCrud lookup — add JOIN stitching |
| `compiler.js` | 690-710 | Pre-scan in compileToBackendJS — build schemaMap |

---

### Phase 1: Aggregates Fix

**🔴 Write failing tests first:**

```javascript
describe('Aggregate field extraction', () => {
  it('sum of field in list compiles to _clear_sum_field', () => {
    const r = compileProgram("total = sum of amount in orders\nshow total");
    expect(r.javascript).toContain('_clear_sum_field(orders');
    expect(r.javascript).toContain("'amount'");
  });

  it('average of field in list compiles to _clear_avg_field', () => {
    const r = compileProgram("avg_price = average of price in products\nshow avg_price");
    expect(r.javascript).toContain('_clear_avg_field(products');
    expect(r.javascript).toContain("'price'");
  });

  it('max of field in list compiles to _clear_max_field', () => {
    const r = compileProgram("highest = max of score in results\nshow highest");
    expect(r.javascript).toContain('_clear_max_field(results');
    expect(r.javascript).toContain("'score'");
  });

  it('min of field in list compiles to _clear_min_field', () => {
    const r = compileProgram("lowest = min of score in results\nshow lowest");
    expect(r.javascript).toContain('_clear_min_field(results');
    expect(r.javascript).toContain("'score'");
  });

  it('sum of flat array (no in) still uses _clear_sum', () => {
    const r = compileProgram("total = sum of amounts\nshow total");
    expect(r.javascript).toContain('_clear_sum(amounts)');
    expect(r.javascript).not.toContain('_clear_sum_field');
  });

  it('count of list (no field) still uses _clear_len', () => {
    const r = compileProgram("n = count of users\nshow n");
    expect(r.javascript).toContain('_clear_len(users)');
  });

  it('sum_field utility returns correct value', () => {
    const r = compileProgram("total = sum of amount in orders\nshow total");
    expect(r.javascript).toContain('function _clear_sum_field');
    expect(r.javascript).toContain('.reduce(');
  });
});
```

**🟢 Implement:**

1. **Parser** (parser.js ~7518): After `parsePrimary` returns for the operand, check for `in`:
```javascript
if (collectionOps[tok.canonical]) {
    const fnName = collectionOps[tok.canonical];
    const operand = parsePrimary(tokens, pos + 1, line, maxPos);
    if (operand.error) return operand;
    // Check for "field in list" pattern
    if (operand.nextPos < maxPos && tokens[operand.nextPos].canonical === 'in') {
      const fieldName = operand.node.name; // the field is a variable ref — extract its name
      const listPos = operand.nextPos + 1; // skip 'in'
      if (listPos < maxPos) {
        const listOperand = parsePrimary(tokens, listPos, line, maxPos);
        if (!listOperand.error) {
          const fieldFnName = fnName === 'count' ? 'count' : '_' + fnName + '_field';
          return { node: callNode(fieldFnName, [listOperand.node, literalString(fieldName, line)], line), nextPos: listOperand.nextPos };
        }
      }
    }
    return { node: callNode(fnName, [operand.node], line), nextPos: operand.nextPos };
}
```

2. **Compiler** — Add to UTILITY_FUNCTIONS (after `_clear_avg`, ~line 133):
```javascript
{ name: '_clear_sum_field', code: 'function _clear_sum_field(arr, f) { if (!Array.isArray(arr)) return 0; return arr.reduce(function(a, item) { return a + Number(item[f] || 0); }, 0); }', deps: [] },
{ name: '_clear_avg_field', code: 'function _clear_avg_field(arr, f) { if (!Array.isArray(arr) || !arr.length) return 0; return _clear_sum_field(arr, f) / arr.length; }', deps: ['_clear_sum_field'] },
{ name: '_clear_max_field', code: 'function _clear_max_field(arr, f) { if (!Array.isArray(arr) || !arr.length) return 0; return Math.max(...arr.map(function(item) { return Number(item[f] || 0); })); }', deps: [] },
{ name: '_clear_min_field', code: 'function _clear_min_field(arr, f) { if (!Array.isArray(arr) || !arr.length) return 0; return Math.min(...arr.map(function(item) { return Number(item[f] || 0); })); }', deps: [] },
```

3. **Compiler** — Add to RUNTIME_JS (after `_clear_avg`, ~line 8831):
```javascript
function _clear_sum_field(arr, f) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce(function(a, item) { return a + Number(item[f] || 0); }, 0);
}
function _clear_avg_field(arr, f) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return _clear_sum_field(arr, f) / arr.length;
}
function _clear_max_field(arr, f) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return Math.max.apply(null, arr.map(function(item) { return Number(item[f] || 0); }));
}
function _clear_min_field(arr, f) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return Math.min.apply(null, arr.map(function(item) { return Number(item[f] || 0); }));
}
```

4. **Compiler** — Add to mapFunctionNameJS (~line 8904):
```javascript
_sum_field: '_clear_sum_field',
_avg_field: '_clear_avg_field',
_max_field: '_clear_max_field',
_min_field: '_clear_min_field',
```

5. **Compiler** — Add to mapFunctionNamePython (~line 8950):
```javascript
_sum_field: '_clear_sum_field',
_avg_field: '_clear_avg_field',
_max_field: '_clear_max_field',
_min_field: '_clear_min_field',
```

And add Python runtime equivalents in the Python backend preamble.

**Gate:** `node clear.test.js` passes

---

### Phase 2: Validation Fix

**🔴 Write failing tests first:**

```javascript
describe('Validation collects all errors', () => {
  it('emits _vErrs (plural) variable name', () => {
    const r = compileProgram("target: backend\non POST '/users':\n  validate incoming:\n    name is text, required\n    email is text, required\n  send back 'ok'");
    expect(r.javascript).toContain('_vErrs');
  });

  it('returns errors array not single string', () => {
    const r = compileProgram("target: backend\non POST '/users':\n  validate incoming:\n    name is text, required\n  send back 'ok'");
    expect(r.javascript).toContain('{ errors: _vErrs }');
  });

  it('_validate utility collects multiple errors', () => {
    const r = compileProgram("target: backend\non POST '/users':\n  validate incoming:\n    name is text, required\n    age is number\n  send back 'ok'");
    // The _validate function should push to array, not return early
    expect(r.javascript).toContain('_errs.push(');
    expect(r.javascript).toContain('_errs.length');
  });

  it('Python validation collects all errors before raising', () => {
    const r = compileProgram("target: python backend\non POST '/users':\n  validate incoming:\n    name is text, required\n    email is text, required\n  send back 'ok'");
    expect(r.python).toContain('_errors');
    expect(r.python).toContain('append');
  });
});
```

**🟢 Implement:**

1. **Rewrite `_validate` utility** (compiler.js ~line 183):
```javascript
{ name: '_validate', code: `function _validate(body, rules) {
  if (body == null || typeof body !== 'object') return [{ field: '_body', message: 'Request body is required' }];
  const _errs = [];
  for (const r of rules) {
    let v = body[r.field];
    if (r.required && (v == null || v === '')) { _errs.push({ field: r.field, message: r.field + ' is required' }); continue; }
    if (v == null) continue;
    if (r.type === 'number' && typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) { body[r.field] = Number(v); v = body[r.field]; }
    if (r.type === 'number' && typeof v !== 'number') { _errs.push({ field: r.field, message: r.field + ' must be a number' }); continue; }
    if (r.type === 'boolean' && typeof v !== 'boolean') { _errs.push({ field: r.field, message: r.field + ' must be true or false' }); continue; }
    if (r.min != null && r.type === 'text' && String(v).length < r.min) _errs.push({ field: r.field, message: r.field + ' must be at least ' + r.min + (r.min === 1 ? ' character' : ' characters') });
    if (r.max != null && r.type === 'text' && String(v).length > r.max) _errs.push({ field: r.field, message: r.field + ' must be at most ' + r.max + (r.max === 1 ? ' character' : ' characters') });
    if (r.min != null && r.type !== 'text' && v < r.min) _errs.push({ field: r.field, message: r.field + ' must be at least ' + r.min });
    if (r.max != null && r.type !== 'text' && v > r.max) _errs.push({ field: r.field, message: r.field + ' must be at most ' + r.max });
    if (r.matches === 'email' && !/^[^@]+@[^@]+\\.[^@]+$/.test(v)) _errs.push({ field: r.field, message: r.field + ' must be a valid email' });
    if (r.matches === 'time' && !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(v)) _errs.push({ field: r.field, message: r.field + ' must be a valid time (HH:MM)' });
    if (r.matches === 'phone' && !/^[\\+]?[\\d\\s\\-\\.\\(\\)]{7,15}$/.test(v)) _errs.push({ field: r.field, message: r.field + ' must be a valid phone number' });
    if (r.matches === 'url' && !/^https?:\\/\\/.+/.test(v)) _errs.push({ field: r.field, message: r.field + ' must be a valid URL' });
    if (r.oneOf && !r.oneOf.includes(v)) _errs.push({ field: r.field, message: r.field + ' must be one of: ' + r.oneOf.join(', ') });
  }
  return _errs.length ? _errs : null;
}`, deps: [] },
```

2. **Update `compileValidate` call site** (compiler.js ~line 2927):
Change from:
```javascript
return `${pad}const _vErr = _validate(req.body, ...); if (_vErr) return res.status(400).json({ error: _vErr });`;
```
To:
```javascript
return `${pad}const _vErrs = _validate(${bodyVar}, [${rules.join(', ')}]);\n${pad}if (_vErrs) return res.status(400).json({ errors: _vErrs });`;
```
Note: `bodyVar` should be `req.body` for JS, but check if the validate node has a named variable (e.g., `validate user_data:` → use `user_data` not `req.body`). Check the node's `variable` field.

3. **Python path** (compiler.js ~line 2876-2914): Change from individual `raise HTTPException` per field to collecting into `_errors = []`, appending each error, then raising once:
```python
_errors = []
if incoming.get("name") is None:
    _errors.append({"field": "name", "message": "name is required"})
# ... more checks ...
if _errors:
    raise HTTPException(status_code=400, detail=_errors)
```

**Gate:** `node clear.test.js` passes

---

### Phase 3: Auth Scaffolding

**🔴 Write failing tests first:**

```javascript
describe('Auth scaffolding', () => {
  it('parses allow signup and login as AUTH_SCAFFOLD', () => {
    const r = compileProgram("target: backend\nallow signup and login\non GET '/test':\n  send back 'ok'");
    expect(r.errors).toHaveLength(0);
    expect(r.javascript).toContain('/auth/signup');
  });

  it('emits POST /auth/signup with bcrypt', () => {
    const r = compileProgram("target: backend\nallow signup and login\non GET '/test':\n  send back 'ok'");
    expect(r.javascript).toContain('/auth/signup');
    expect(r.javascript).toContain('bcrypt');
    expect(r.javascript).toContain('hash');
  });

  it('emits POST /auth/login with JWT', () => {
    const r = compileProgram("target: backend\nallow signup and login\non GET '/test':\n  send back 'ok'");
    expect(r.javascript).toContain('/auth/login');
    expect(r.javascript).toContain('jwt.sign');
  });

  it('emits GET /auth/me', () => {
    const r = compileProgram("target: backend\nallow signup and login\non GET '/test':\n  send back 'ok'");
    expect(r.javascript).toContain('/auth/me');
    expect(r.javascript).toContain('req.user');
  });

  it('emits JWT middleware', () => {
    const r = compileProgram("target: backend\nallow signup and login\non GET '/test':\n  send back 'ok'");
    expect(r.javascript).toContain('JWT_SECRET');
    expect(r.javascript).toContain('Bearer');
  });

  it('requires bcryptjs and jsonwebtoken', () => {
    const r = compileProgram("target: backend\nallow signup and login\non GET '/test':\n  send back 'ok'");
    expect(r.javascript).toContain("require('bcryptjs')");
    expect(r.javascript).toContain("require('jsonwebtoken')");
  });

  it('Python emits auth endpoints with passlib', () => {
    const r = compileProgram("target: python backend\nallow signup and login\non GET '/test':\n  send back 'ok'");
    expect(r.python).toContain('/auth/signup');
    expect(r.python).toContain('passlib');
  });

  it('needs login still works (existing REQUIRES_AUTH)', () => {
    const r = compileProgram("build for web and javascript backend\nallow signup and login\npage 'Home':\n  needs login\n  heading 'Welcome'");
    expect(r.html).toContain("localStorage.getItem('token')");
  });
});
```

**🟢 Implement:**

1. **synonyms.js** — Add after `allow_cors` (~line 285):
```javascript
auth_scaffold: Object.freeze(['allow signup and login', 'allow login and signup']),
```
Bump `SYNONYM_VERSION`.

2. **parser.js** — Add to NodeType enum (~line 260):
```javascript
AUTH_SCAFFOLD: 'auth_scaffold',
```

3. **parser.js** — Add to CANONICAL_DISPATCH (~line 826, near `allow_cors`):
```javascript
['auth_scaffold', (ctx) => { ctx.body.push({ type: NodeType.AUTH_SCAFFOLD, line: ctx.line }); return ctx.i + 1; }],
```

4. **compiler.js** — Add AUTH_SCAFFOLD to BACKEND_ONLY_NODES (~line 1692)

5. **compiler.js** — Add new case in `compileNode` for AUTH_SCAFFOLD:
```javascript
case NodeType.AUTH_SCAFFOLD:
  return compileAuthScaffold(node, ctx, pad);
```

6. **compiler.js** — New `compileAuthScaffold()` function that emits the full auth setup. This is the biggest piece — approximately 60-80 lines of compiled output for JS, 50-60 for Python.

7. **compiler.js** — Update `usesAuth` detection (~line 7572) to also check for `AUTH_SCAFFOLD`:
```javascript
const usesAuth = body.some(n =>
  n.type === NodeType.AUTH_SCAFFOLD ||
  (n.type === NodeType.ENDPOINT && n.body &&
  n.body.some(b => b.type === NodeType.REQUIRES_AUTH || b.type === NodeType.REQUIRES_ROLE))
);
```

**Gate:** `node clear.test.js` passes

---

### Phase 4: DB Relationships

**🔴 Write failing tests first:**

```javascript
describe('DB relationships', () => {
  it('parses belongs to as FK', () => {
    const r = compileProgram("target: backend\ncreate a Posts table:\n  title\n  author belongs to Users\non GET '/test':\n  send back 'ok'");
    expect(r.javascript).toContain('REFERENCES');
    expect(r.javascript).toContain('users');
  });

  it('belongs to sets field type to fk', () => {
    const r = compileProgram("target: backend\ncreate a Posts table:\n  title\n  author belongs to Users\non GET '/test':\n  send back 'ok'");
    // FK field should have author_id in the SQL
    expect(r.javascript).toContain('author');
  });

  it('GET all with belongs_to emits join stitching', () => {
    const r = compileProgram(`target: backend
create a Users table:
  name
create a Posts table:
  title
  author belongs to Users
when user calls GET /api/posts:
  all_posts = get all Posts
  send back all_posts`);
    expect(r.javascript).toContain('query_one');
    expect(r.javascript).toContain('author');
  });

  it('Python belongs to emits REFERENCES', () => {
    const r = compileProgram("target: python backend\ncreate a Posts table:\n  title\n  author belongs to Users\non GET '/test':\n  send back 'ok'");
    expect(r.python).toContain('REFERENCES');
  });

  it('belongs to field collision — field named belongs without to', () => {
    const r = compileProgram("target: backend\ncreate a Items table:\n  belongs, required\non GET '/test':\n  send back 'ok'");
    expect(r.errors).toHaveLength(0);
    // Should parse as regular field, not relationship
    expect(r.javascript).not.toContain('REFERENCES');
  });
});
```

**🟢 Implement:**

1. **Parser** (parser.js ~line 4604-4626, inside field modifier `while` loop): Add `belongs to` detection:
```javascript
else if (mod === 'belongs' && fPos + 1 < fieldTokens.length &&
         typeof fieldTokens[fPos + 1].value === 'string' && fieldTokens[fPos + 1].value.toLowerCase() === 'to') {
  fPos += 2; // skip 'belongs to'
  if (fPos < fieldTokens.length) {
    fk = fieldTokens[fPos].value;
    fieldType = 'fk';
    explicitType = true;
    fPos++;
  }
}
```
Place this BEFORE the final `else { fPos++; }` at line 4624.

2. **Compiler — Schema tracking** (compiler.js ~line 693): In the pre-scan loop, build a schema map:
```javascript
const schemaMap = {};
for (const node of body) {
  if (node.type === NodeType.DATA_SHAPE) {
    schemaMap[node.name.toLowerCase()] = {
      fields: node.fields,
      fkFields: node.fields.filter(f => f.fk)
    };
  }
}
ctx.schemaMap = schemaMap;
```

3. **Compiler — CRUD join stitching** (compiler.js ~line 1940-1970, inside `compileCrud` for JS `lookup` operations): After the main `db.query()` call, if the schema has FK fields, emit stitching:
```javascript
if (ctx.schemaMap) {
  const tableName = node.table || node.name;
  const schema = ctx.schemaMap[tableName.toLowerCase()];
  if (schema && schema.fkFields.length > 0) {
    for (const fkField of schema.fkFields) {
      const fkTable = pluralizeName(fkField.fk).toLowerCase();
      const fkName = sanitizeName(fkField.name);
      code += `\n${pad}for (const _item of ${varName}) { if (_item.${fkName}_id) _item.${fkName} = db.query_one('${fkTable}', { id: _item.${fkName}_id }); }`;
    }
  }
}
```

**Gate:** `node clear.test.js` passes

---

### Phase 5: Cleanup + Ship

1. Update `intent.md` with new node type: AUTH_SCAFFOLD
2. Update `SYNTAX.md` with new syntax examples for `allow signup and login`, `belongs to`, aggregate `field in list`
3. Update `ROADMAP.md` — mark items 1-4 as complete in the Gaps table
4. Run full test suite: `node clear.test.js`
5. Rebuild playground bundle: `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js`
6. Commit, merge to main, push

**📚 Run update-learnings skill: capture lessons from all phases into `learnings.md`.**

---

## 🧪 TESTING STRATEGY

**Test command:** `node clear.test.js`

**Success criteria:**
- [ ] All existing 1675 tests still pass
- [ ] Phase 1: 7 new aggregate tests pass
- [ ] Phase 2: 4 new validation tests pass
- [ ] Phase 3: 8 new auth tests pass
- [ ] Phase 4: 5 new relationship tests pass
- [ ] Total test count: 1700+

---

## 📎 RESUME PROMPT

> Continue implementing plan `plans/plan-roadmap-1-4-04-12-2026.md`. Branch is `feature/roadmap-1-4`. The plan covers 4 features in 4 phases: aggregates fix, validation fix, auth scaffolding, DB relationships. Check which phases are done by looking at the test file for new test blocks, then pick up at the next incomplete phase.
