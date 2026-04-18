# Plan: PERF-1 + PERF-2 — Pagination & Server-Side Aggregations

## 🎯 THE PROBLEM

Two performance gaps that bite Marcus at scale:

1. **No default pagination.** `get all Users` compiles to `db.findAll('users')` which is `SELECT * FROM users` — no LIMIT. 50K rows → browser death. Parser already has pagination syntax (`page N, M per page`) but it's opt-in. Need a default LIMIT.

2. **Aggregations are client-side.** `sum of price in orders` compiles to `_clear_sum_field(orders, 'price')` — JS `Array.reduce` on data already in memory. When `orders` came from a `get all` call, all rows get fetched just to sum one column. Should compile to `SELECT SUM(price) FROM orders WHERE ...` when the source is a table — and Marcus's dashboards are ALL filtered aggregates ("revenue where status is paid", "count where team is support"), so filtered aggregates are required, not stretch.

## 🔧 THE FIX

### PERF-1: Default pagination

**Where the change happens:**

The compiler's `compileCrud()` function (compiler.js **line 3248**) handles `node.operation === 'lookup'`. The JS default (non-Supabase) branch is at **line 3349**, and the `findAll` emit is at **line 3354**. When `lookupAll` is true and no `page/perPage` is set, the current code emits:
```js
const users = (await db.findAll('users')).map(_revive);
```

**The fix:** Modify `db.findAll()` in `runtime/db.js` (line 216) to accept an optional `options` parameter with `limit`. Then modify the compiler to pass `{ limit: 50 }` by default when `lookupAll && !node.noLimit && !node.page`.

<!-- Line numbers verified 2026-04-17 against current compiler.js and runtime/db.js -->

**Tokenizer gotcha:** `from`, `of`, and `in` all canonicalize to `in` (synonyms.js line 57: `in: ['in', 'of', 'from']`). When the parser needs to distinguish `sum of price from Orders` vs `sum of price in orders`, it MUST check `tokens[pos].value === 'from'` (raw value), NOT `tokens[pos].canonical === 'from'` (which never matches).

**Compiled output changes from:**
```js
const users = (await db.findAll('users')).map(_revive);
```
**To:**
```js
const users = (await db.findAll('users', {}, { limit: 50 })).map(_revive);
```

**Opt-out:** Parser detects `get every User` → sets `node.noLimit = true` → compiler skips the limit param.

**Important: runtime/db.js is NOT imported by the compiler — it's COPIED into each compiled app at build time.** The CLI at `cli/clear.js` line 907-909 copies `runtime/db.js` → `<app>/clear-runtime/db.js` (for SQLite) or `runtime/db-postgres.js` → `<app>/clear-runtime/db.js` (for Postgres). **There is no `clear-runtime/db.js` in the source tree.**

Files to update (both must stay API-compatible):
- `runtime/db.js` (SQLite, line 216 for findAll)
- `runtime/db-postgres.js` (Postgres, line 227 for findAll — ASYNC variant)

Additionally, the Supabase lookup path in `compileCrud()` (line 3308) already has `.range()` pagination (line 3319). Add `.limit(50)` when no explicit page set.

**Supabase aggregate scope:** Supabase doesn't have a simple `.aggregate()` method — it needs RPCs or postgres views. **Skip Supabase aggregate for this plan.** For `sum of price from Orders` under Supabase backend, emit a compile warning and fall through to the JS in-memory path (fetch-then-reduce). Document this as a known limitation.

### PERF-2: Server-side SQL aggregations (with filters — required)

**Current path:** Parser sees `sum of price in orders` → emits `CALL(_sum_field, [orders, 'price'])` → compiler emits `_clear_sum_field(orders, 'price')`. This is always client-side JS.

**New syntax:** `sum of price from Orders` (note: `from Table` instead of `in variable`) → emits a new `SQL_AGGREGATE` expression node → compiler emits `await db.aggregate('orders', 'SUM', 'price')`.

**Why `from` vs `in`:** `in` = "this variable I already have in memory." `from` = "go query this table." Same pattern as `get all Users` vs working with a `users` variable. The parser distinguishes by checking if the token after `from` matches a known data shape name (capitalized identifier), not a string URL — that disambiguates from `get X from '/api/url'`.

**Filtered aggregates (required, not stretch):** `sum of price from Orders where status is 'paid'` must work. The parser already has `where` condition support in `parseLookUpAssignment` (line 5536) — reuse the same `parseExpression` pattern. The compiler's existing `conditionToFilter()` helper (compiler.js line 2863) already turns a condition AST into a filter object like `{ status: 'paid' }`. Pass that filter as the 4th arg to `db.aggregate(table, fn, field, filter)`. Marcus's dashboards are ALL filtered aggregates — "total revenue where status is 'paid'", "avg response time where priority is 'high'", "count of tickets where team is 'support'". Unfiltered aggregates are nearly useless without this.

**Runtime change:** Add `db.aggregate(table, fn, field, filter?)` to `runtime/db.js` that runs `SELECT SUM(col) FROM table WHERE ...` with parameterized filter.

## 📁 FILES INVOLVED

### Always read first (every phase):
| File | Why |
|------|-----|
| `intent.md` | Authoritative spec |

### Phase 1 — read these:
| File | Why |
|------|-----|
| `compiler.js` lines 3248-3377 | `compileCrud()` — lookup operation (JS branch at 3349) |
| `runtime/db.js` lines 216-222 | `findAll()` — needs limit param (SQLite) |
| `runtime/db-postgres.js` lines 227-233 | `findAll()` — Postgres variant, ASYNC |
| `parser.js` lines 5574-5627 | `parseLookUpAssignment()` — adds noLimit for `every` |
| `parser.js` lines 8186-8209 | `get all X` shorthand — adds noLimit for `every` |
| `synonyms.js` line 412 | `every` already registered: `every: ['every']` — no tokenizer change needed |

### Phase 2 — read these:
| File | Why |
|------|-----|
| `parser.js` lines 8596-8619 | `collectionOps` (`sum_of`, `avg_of`, `count_of`, `max_of`, `min_of`) — add `from Table` branch |
| `parser.js` line 5606 | `where` condition parsing pattern (reuse in Phase 2 for filtered aggregates) |
| `compiler.js` lines 2886-2938 | `conditionToFilter()` and `extractEqPairs()` — reuse for SQL filter object |
| `compiler.js` lines 11739-11770 | `mapFunctionNameJS()` — current aggregate function mapping (`_sum_field` → `_clear_sum_field`) |
| `runtime/db.js` module.exports line 344 | Add `aggregate` here |
| `runtime/db-postgres.js` module.exports line 387 | Add `aggregate` here (async variant) |

### Phase 3 — read these:
| File | Why |
|------|-----|
| `compiler.js` lines 7067-7074 | `SEARCH` node compilation — append `.slice(0, 100)` |

### Phase 3 — template audit (these use `get all`, verify behavior):
| Template | `get all` calls | Risk |
|----------|----------------|------|
| `todo-fullstack` | 2 | Low — seed data, ≤50 |
| `crm-pro` | 4 (Companies, Contacts, Deals×2) | **Medium — change to `get every` for list views** |
| `blog-fullstack` | 3 (Authors, Categories, Posts) | **Medium — Posts list needs `every`** |
| `live-chat` | 1 (Messages) | **Medium — chat history needs `every` or pagination** |
| `helpdesk-agent` | 2 (Products, Tickets) | Low — seeds, ≤50 |
| `booking` | 2 (Rooms, Bookings) | Low — seed |
| `expense-tracker` | 2 (Expenses×2) | **Medium — change to `every`** |
| `ecom-agent` | 8+ (Orders, Products, Returns, Messages) | **High — many callsites, audit each** |

## 🚨 EDGE CASES

| Scenario | How we handle it |
|----------|-----------------|
| Existing apps rely on `get all` returning everything | Breaking change. `get all` now returns 50 max. Templates must be audited — any that need all rows get `get every`. CLAUDE.md says no backward compatibility, so this is fine. |
| `get all Users where status is 'active'` (with condition) | Still gets LIMIT 50. The condition filters server-side, LIMIT applies after. |
| `sum of price in orders_var` (in-memory variable) | **Stays client-side.** `in` = JS path. Only `from Table` = SQL path. Zero breaking change. |
| `sum of price from Orders where status is 'paid'` | **Required, supported in Phase 2.** Filter pulled via `conditionToFilter()`. Compiles to `db.aggregate('orders', 'SUM', 'price', { status: 'paid' })`. |
| `count of tickets from Tickets where team is 'support'` | Same path as sum — count uses `COUNT(*)` not `COUNT(field)`, but Phase 2 cycle 6 covers count specifically. |
| `from` token collision with API fetch (`get X from '/api/url'`) | Disambiguated by what follows `from`: a STRING token = URL fetch, a capitalized identifier = SQL aggregate table. |
| `sum of price from orders` (lowercase `orders` — not a table name) | Parser only treats it as SQL aggregate if the identifier starts with a capital letter (matches data shape naming convention). Otherwise falls through to existing `in variable` path or errors out. |
| `sum of price from Orders where amount > 100` (non-equality) | `conditionToFilter()` falls back to `(r) => r.amount > 100` for complex conditions. For SQL aggregates this won't work — we MUST use `extractEqPairs()` only. If the condition has non-equality, emit a compile error: "SQL aggregates only support equality filters. Use `look up all` then aggregate in memory for complex filters." |
| Supabase path | Already has `.range()` pagination. Add default limit there too — `.limit(50)` when no explicit page set. Add aggregate via Supabase RPC or `.select('field.sum()')`. |
| Python path | `db.query()` already returns all. Add LIMIT to the SQL string. Add `aggregate()` method to Python runtime too. |
| FK join stitching (lines 3340-3352) | Runs AFTER the limit — so joins only happen on the 50 returned rows, not all rows. This is correct and efficient. |
| Frontend `on page load get X from '/api/url'` | This is an API call. The ENDPOINT now returns 50 rows by default. Frontend gets 50. Correct. |
| `search Products for query` | Returns all matches with no limit. Add `.slice(0, 100)` to the filter expression (SEARCH compiles to `findAll().filter()`, so SQL LIMIT wouldn't help). |
| `db.findAll` called with 2 args today | All existing compiled code passes `(table)` or `(table, filter)`. New 3rd arg `options` is optional — no breaking change to existing compiled output. |
| Template `helpdesk-agent` has `products = get all Products` | 5 seed products — LIMIT 50 is fine, returns all 5. No change needed. |
| Template `crm-pro` may have large datasets | Audit needed. If it has `get all Contacts`, that's the one that would break at scale. |
| SQL injection in aggregate field name | Field name comes from parser tokens, not user input. But still — sanitize: only allow `/^[a-z_][a-z0-9_]*$/i` for field names in `db.aggregate()`. Reject otherwise. |
| Aggregate of nonexistent table | `db.aggregate('nonexistent', 'SUM', 'x')` would throw a SQL error. Wrap in try/catch in runtime, return 0 with a console.warn — same defensive pattern as `_clear_sum_field` returning 0 for non-arrays. |
| `count of X from Orders` where X is not a field | `COUNT(field)` is valid SQL but counts non-null values. For total row count, prefer `COUNT(*)`. Cycle 6 handles this: count maps to `COUNT(*)`, ignoring the field name. |

## 📋 IMPLEMENTATION — TDD Cycles

### Phase 1: PERF-1 — Default pagination on `get all`

**Read first:** compiler.js (compileCrud lines 3225-3400), runtime/db.js (findAll line 216), parser.js (lines 5502-5557 and 8115-8139)

---

🔴 **Cycle 1: `db.findAll` accepts a limit option**

```js
// clear.test.js — add to existing db runtime tests or create new section
describe('Runtime - db.findAll with limit', () => {
  it('returns all rows when no limit specified', () => {
    // This tests backward compat — existing findAll(table, filter) still works
    const result = compileProgram(`
build for javascript backend
database is local memory
create a Users table:
  name, required
when user calls GET /api/users:
  users = get every User
  send back users
`);
    expect(result.errors.length).toBe(0);
    // "get every" should NOT have a limit
    expect(result.javascript).toContain("db.findAll('users')");
    expect(result.javascript).not.toContain('limit');
  });
});
```

🟢 **Code:**

1. In `runtime/db.js` **line 216-222** (SQLite), change `findAll(table, filter)` to `findAll(table, filter, options)`:
```js
function findAll(table, filter, options) {
  const tableName = table.toLowerCase();
  const schema = _schemas[tableName] || {};
  const w = buildWhere(filter);
  let sql = 'SELECT * FROM ' + tableName + ' ' + w.clause;
  if (options && options.limit) {
    sql += ' LIMIT ' + parseInt(options.limit, 10);
  }
  const rows = _db.prepare(sql).all(w.params);
  return rows.map(function(r) { return coerceRecord(r, schema); });
}
```

2. In `runtime/db-postgres.js` **line 227-233** (Postgres, ASYNC), mirror the change:
```js
async function findAll(table, filter, options) {
  var tableName = table.toLowerCase();
  await ensureTable(tableName);
  var w = buildWhere(filter);
  var sql = 'SELECT * FROM ' + tableName + ' ' + w.clause;
  if (options && options.limit) {
    sql += ' LIMIT ' + parseInt(options.limit, 10);
  }
  var res = await getPool().query(sql, w.params);
  return res.rows;
}
```

**NOT CHANGING:** signature for existing 1-arg and 2-arg callers still works (options is optional) — every compiled app in `apps/` continues to compile and run.

🔄 **Refactor:** Extract the `parseInt(options.limit, 10)` sanitization into `function parseLimit(n) { const v = parseInt(n, 10); return (v > 0 && v < 10000) ? v : 50; }` at top of each file, and reuse. Protects against NaN, negative, huge values.

**Commit:** `feat(runtime): db.findAll accepts options.limit (both backends)`

---

🔴 **Cycle 2: `get all Users` compiles with default LIMIT 50**

```js
describe('PERF-1 - Default pagination', () => {
  it('get all Users compiles with LIMIT 50', () => {
    const result = compileProgram(`
build for javascript backend
database is local memory
create a Users table:
  name, required
when user calls GET /api/users:
  users = get all Users
  send back users
`);
    expect(result.errors.length).toBe(0);
    expect(result.javascript).toContain("db.findAll('users', {}, { limit: 50 })");
  });

  it('look up all Users also compiles with LIMIT 50', () => {
    const result = compileProgram(`
build for javascript backend
database is local memory
create a Users table:
  name, required
when user calls GET /api/users:
  users = look up all Users
  send back users
`);
    expect(result.errors.length).toBe(0);
    expect(result.javascript).toContain("{ limit: 50 }");
  });

  it('get all Users where status is "active" still gets LIMIT 50', () => {
    const result = compileProgram(`
build for javascript backend
database is local memory
create a Users table:
  name, required
  status
when user calls GET /api/users:
  active = look up all Users where status is 'active'
  send back active
`);
    expect(result.errors.length).toBe(0);
    expect(result.javascript).toContain("{ limit: 50 }");
    expect(result.javascript).toContain("status");
  });
});
```

🟢 **Code:**

**Step 1** — Add module-level constant near the top of `compiler.js` (right after the `const NodeType = {...}` block ends, approx line 400):
```js
// Default row cap for `get all` / `look up all`. Use `get every X` to opt out.
// Why 50: large enough for typical list views, small enough that no browser dies.
const DEFAULT_QUERY_LIMIT = 50;
```

**Step 2** — In `compileCrud()` **line 3349-3354** (JS default backend, non-Supabase), the current block looks like:
```js
if (node.operation === 'lookup') {
  const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
  const isSingleLookup = !node.lookupAll && node.condition && conditionTargetsId(node.condition);
  let lookupCode = isSingleLookup
    ? `${pad}const ${sanitizeName(node.variable)} = _revive(await db.findOne('${table}'${where}));`
    : `${pad}const ${sanitizeName(node.variable)} = (await db.findAll('${table}'${where})).map(_revive);`;
  // Pagination: slice the result array
  if (node.page && node.perPage && !isSingleLookup) {
    ...
  }
```

Replace the `let lookupCode = isSingleLookup ? ... : ...` ternary with an explicit 4-branch if/else. Keep everything else in the block unchanged (`where` variable, the page/perPage block, the FK join stitching):
```js
  // NEW: explicit branching for limit opt-out vs default
  let lookupCode;
  if (isSingleLookup) {
    lookupCode = `${pad}const ${sanitizeName(node.variable)} = _revive(await db.findOne('${table}'${where}));`;
  } else if (node.noLimit) {
    // Opt-out: "get every X" / "look up every X" — no limit
    lookupCode = `${pad}const ${sanitizeName(node.variable)} = (await db.findAll('${table}'${where})).map(_revive);`;
  } else {
    // DEFAULT: LIMIT 50. Build explicit 3-arg call. When no condition, pass {} as filter.
    const filterArg = node.condition ? conditionToFilter(node.condition, ctx) : '{}';
    lookupCode = `${pad}const ${sanitizeName(node.variable)} = (await db.findAll('${table}', ${filterArg}, { limit: ${DEFAULT_QUERY_LIMIT} })).map(_revive);`;
  }
```

**NOT CHANGING:**
- The `page && perPage` block at line 3356-3362 (explicit pagination path). It already overrides `lookupCode` below, so our default still gets overridden when explicit pagination is set.
- The FK join stitching at line 3363-3375 — it appends to `lookupCode` regardless.

**Step 3** — Mirror the default LIMIT in the Supabase path at **line 3308-3324**. After the `.range()` block and before `if (isSingle) query += '.single()';`:
```js
  // Default LIMIT for Supabase path too (no explicit pagination)
  if (!isSingle && !node.page && !node.noLimit) {
    query += `.limit(${DEFAULT_QUERY_LIMIT})`;
  }
```

Wait — `.limit()` must come BEFORE `.range()` if range is set. Refactor: only add `.limit()` when there's NO `node.page`. Since Supabase `.range()` already caps, skip `.limit()` if page is set. The order should be: `.select('*')` → `.eq(...)` → either `.range()` (explicit) or `.limit(50)` (default) → `.single()` (if single). Confirmed fine.

🔄 **Refactor:** Move `DEFAULT_QUERY_LIMIT` to the top of compiler.js alongside other compile-time constants. Add a one-line comment explaining why 50 was chosen.

**Commit:** `feat(compiler): default LIMIT 50 on get all / look up all`

---

🔴 **Cycle 3: `get every User` compiles WITHOUT limit (opt-out)**

```js
it('get every User compiles without limit', () => {
  const result = compileProgram(`
build for javascript backend
database is local memory
create a Users table:
  name, required
when user calls GET /api/users:
  users = get every User
  send back users
`);
  expect(result.errors.length).toBe(0);
  expect(result.javascript).toContain("db.findAll('users')");
  expect(result.javascript).not.toContain('limit');
});

it('look up every User also has no limit', () => {
  const result = compileProgram(`
build for javascript backend
database is local memory
create a Users table:
  name, required
when user calls GET /api/users:
  users = look up every User
  send back users
`);
  expect(result.errors.length).toBe(0);
  expect(result.javascript).not.toContain('limit');
});
```

🟢 **Code:**

**Verification before editing:** `synonyms.js` line 412 already has `every: Object.freeze(['every'])`. Tokenizer emits `{ value: 'every', canonical: 'every', type: 'keyword' }`. No tokenizer changes needed. Verified via `node --input-type=module -e "import('./tokenizer.js').then(m => console.log(m.tokenize('get every User')[0].tokens))"`.

**Step 1** — In parser.js, modify the `get all X` shorthand at **line 8186-8209**. Change the condition to accept both `all` and `every`:
```js
// Shorthand: "get all Todos" / "get every Todo" -> CRUD lookup all
if (pos < tokens.length && tokens[pos].canonical === 'get_key' &&
    pos + 1 < tokens.length &&
    (tokens[pos + 1].value === 'all' || tokens[pos + 1].value === 'every') &&
    pos + 2 < tokens.length) {
  const isEvery = tokens[pos + 1].value === 'every';
  const tableName = tokens[pos + 2].value;
  const node = crudNode('lookup', name, tableName, null, line);
  node.lookupAll = true;
  if (isEvery) node.noLimit = true;
  // Optional pagination: "page N, M per page" (keep existing block 8195-8207)
  let pPos = pos + 3;
  if (pPos < tokens.length && tokens[pPos].value === 'page') {
    pPos++;
    if (pPos < tokens.length) {
      node.page = tokens[pPos].type === TokenType.NUMBER ? tokens[pPos].value : tokens[pPos].value;
      pPos++;
      if (pPos < tokens.length && tokens[pPos].value === ',') pPos++;
      if (pPos < tokens.length && tokens[pPos].type === TokenType.NUMBER) {
        node.perPage = tokens[pPos].value;
      }
    }
  }
  return { node };
}
```

**Step 2** — In `parseLookUpAssignment` at **line 5574-5581**, extend the `all` check to accept `every`:
```js
function parseLookUpAssignment(name, tokens, pos, line) {
  pos++; // skip "look up"
  let lookupAll = false;
  let noLimit = false;
  if (pos < tokens.length && typeof tokens[pos].value === 'string') {
    const valLower = tokens[pos].value.toLowerCase();
    if (valLower === 'all') {
      lookupAll = true;
      pos++;
    } else if (valLower === 'every') {
      lookupAll = true;
      noLimit = true;
      pos++;
    }
  }
  // ... rest of function unchanged (line 5582 onward: error check, records_in,
  //     target parsing, where condition, pagination)
  // At line 5612-5613, after `const node = crudNode(...)`:
  const node = crudNode('lookup', name, target, condition, line);
  node.lookupAll = lookupAll;
  if (noLimit) node.noLimit = true;
  // ... rest of function
}
```

**NOT CHANGING:** the `records_in` branch, `where` clause parsing, optional pagination handling — all stay exactly as they are (lines 5586-5625).

🔄 **Refactor:** Since the `value === 'every'` check happens in two places now (parser line 5581 area + line 8186 area), and might appear again (e.g. if we add `find every` alias), extract a helper at top of parser.js: `function isAllOrEvery(tok) { const v = tok && typeof tok.value === 'string' ? tok.value.toLowerCase() : ''; return v === 'all' ? { all: true, every: false } : v === 'every' ? { all: true, every: true } : null; }`. Use at both callsites.

**Commit:** `feat(parser): get every / look up every opts out of default limit`

---

🔴 **Cycle 4: Search has `.slice(0, 100)`**

```js
describe('PERF-1 - Search limit', () => {
  it('search compiles with .slice(0, 100)', () => {
    const result = compileProgram(`
build for javascript backend
database is local memory
create a Products table:
  name, required
  description
when user calls GET /api/search:
  results = search Products for incoming's q
  send back results
`);
    expect(result.errors.length).toBe(0);
    expect(result.javascript).toContain('.slice(0, 100)');
  });
});
```

🟢 **Code:**

**Step 1** — Add alongside `DEFAULT_QUERY_LIMIT`:
```js
const DEFAULT_SEARCH_LIMIT = 100;
```

**Step 2** — In compiler.js **line 7067-7074**, the SEARCH case currently is:
```js
case NodeType.SEARCH: {
  const table = expr.table ? pluralizeName(expr.table) : 'unknown';
  const query = exprToCode(expr.query, ctx);
  if (ctx.lang === 'python') {
    return `[r for r in await db.find_all('${table}', {}) if ${query}.lower() in ' '.join(str(v) for v in r.values()).lower()]`;
  }
  return `(await db.findAll('${table}', {})).filter(_r => Object.values(_r).some(_v => String(_v).toLowerCase().includes(String(${query}).toLowerCase())))`;
}
```

Append `.slice(0, 100)` on JS and `[:100]` on Python:
```js
case NodeType.SEARCH: {
  const table = expr.table ? pluralizeName(expr.table) : 'unknown';
  const query = exprToCode(expr.query, ctx);
  if (ctx.lang === 'python') {
    return `[r for r in await db.find_all('${table}', {}) if ${query}.lower() in ' '.join(str(v) for v in r.values()).lower()][:${DEFAULT_SEARCH_LIMIT}]`;
  }
  return `(await db.findAll('${table}', {})).filter(_r => Object.values(_r).some(_v => String(_v).toLowerCase().includes(String(${query}).toLowerCase()))).slice(0, ${DEFAULT_SEARCH_LIMIT})`;
}
```

**NOT CHANGING:** the surrounding cases (FILTER at 7056, LOAD_CSV at 7076).

**Optimization note (future):** Currently still fetches ALL rows then filters. A future phase could push search to SQL `LIKE '%query%'`, which would benefit from a `LIMIT 100` in SQL. Not in scope here — the fetch-all-then-filter pattern needs a bigger refactor. The `.slice(0, 100)` at least protects the returned payload even if memory is briefly spiked.

🔄 **Refactor:** Add `DEFAULT_SEARCH_LIMIT = 100` constant alongside `DEFAULT_QUERY_LIMIT` at top of compiler.js. Document the "fetch-all-then-slice is suboptimal" caveat inline.

**Commit:** `feat(compiler): default LIMIT 100 on search results`

---

📚 **End of Phase 1:** Run `update-learnings` skill. Commit pagination changes. Run all 8 templates to verify 0 new errors.

---

### Phase 2: PERF-2 — SQL aggregations with `from Table` (filtered)

**Read first:** parser.js (lines 8525-8549, collection ops), parser.js line 5536 (`where` parsing), compiler.js (lines 2863-2912, conditionToFilter/extractEqPairs), runtime/db.js

---

🔴 **Cycle 5: `db.aggregate` runtime method works**

```js
describe('Runtime - db.aggregate', () => {
  it('SUM returns sum of field across all rows', () => {
    // This is a runtime test — exercises db.aggregate directly via a compiled program
    const result = compileProgram(`
build for javascript backend
database is local memory
create an Orders table:
  product, required
  price (number)
when user calls POST /api/seed:
  create o1:
    product is 'A'
    price = 10
  save o1 as new Order
  create o2:
    product is 'B'
    price = 20
  save o2 as new Order
  send back 'seeded'
when user calls GET /api/total:
  total = sum of price from Orders
  send back total
`);
    expect(result.errors.length).toBe(0);
    expect(result.javascript).toContain("db.aggregate('orders', 'SUM', 'price')");
  });
});
```

🟢 **Code:**

**Step 1** — Add to `runtime/db.js` after `findOne` (**line 230**, before the comment banner at 232):
```js
function aggregate(table, fn, field, filter) {
  const tableName = table.toLowerCase();
  // Whitelist function name — never trust input
  const allowedFns = { SUM: 1, AVG: 1, MIN: 1, MAX: 1, COUNT: 1 };
  if (!allowedFns[fn]) throw new Error('Unsupported aggregate function: ' + fn);
  // Sanitize field name — only alphanumeric + underscore (skip check for COUNT)
  if (fn !== 'COUNT' && !/^[a-z_][a-z0-9_]*$/i.test(field)) {
    throw new Error('Invalid field name: ' + field);
  }
  const w = buildWhere(filter);
  // COUNT uses *, others use the column
  const col = fn === 'COUNT' ? '*' : field;
  const sql = 'SELECT ' + fn + '(' + col + ') as result FROM ' + tableName + ' ' + w.clause;
  try {
    const row = _db.prepare(sql).get(w.params);
    return row ? (row.result || 0) : 0;
  } catch (e) {
    console.warn('[clear] db.aggregate failed:', e.message);
    return 0;
  }
}
```

**Step 2** — Add `aggregate,` to `module.exports` at **line 344-356**:
```js
module.exports = {
  createTable,
  findAll,
  findOne,
  insert,
  update,
  remove,
  aggregate,  // ADD THIS between remove and run
  run,
  execute,
  save,
  load,
  reset,
};
```

**Step 3** — Mirror in `runtime/db-postgres.js` after `findOne` (line 241). Note ASYNC and pg placeholder syntax (`$1`, `$2` not `?`):
```js
async function aggregate(table, fn, field, filter) {
  var tableName = table.toLowerCase();
  await ensureTable(tableName);
  var allowedFns = { SUM: 1, AVG: 1, MIN: 1, MAX: 1, COUNT: 1 };
  if (!allowedFns[fn]) throw new Error('Unsupported aggregate function: ' + fn);
  if (fn !== 'COUNT' && !/^[a-z_][a-z0-9_]*$/i.test(field)) {
    throw new Error('Invalid field name: ' + field);
  }
  var w = buildWhere(filter);
  var col = fn === 'COUNT' ? '*' : field;
  var sql = 'SELECT ' + fn + '(' + col + ') as result FROM ' + tableName + ' ' + w.clause;
  try {
    var res = await getPool().query(sql, w.params);
    return res.rows[0] ? (res.rows[0].result || 0) : 0;
  } catch (e) {
    console.warn('[clear] db.aggregate failed:', e.message);
    return 0;
  }
}
```

Add `aggregate: aggregate,` to the exports at **line 387-399** between `remove:` and `run:`.

**NOT CHANGING:** other runtime functions, the schema registry, the buildWhere helper, any validation logic.

🔄 **Refactor:** Extract the fn + field validation into a shared `function validateAggregateArgs(fn, field) {...}` helper at the top of each file. Both backends now share the same validation logic.

**Commit:** `feat(runtime): db.aggregate(table, fn, field, filter?)`

---

🔴 **Cycle 6: `sum of price from Orders` compiles to SQL aggregate (no filter)**

```js
describe('PERF-2 - SQL aggregations', () => {
  it('sum of field from Table compiles to db.aggregate', () => {
    const result = compileProgram(`
build for javascript backend
database is local memory
create an Orders table:
  product, required
  price (number)
when user calls GET /api/stats:
  total = sum of price from Orders
  send back total
`);
    expect(result.errors.length).toBe(0);
    expect(result.javascript).toContain("await db.aggregate('orders', 'SUM', 'price')");
  });

  it('avg of score from Reviews compiles to db.aggregate', () => {
    const result = compileProgram(`
build for javascript backend
database is local memory
create a Reviews table:
  score (number)
when user calls GET /api/stats:
  average = avg of score from Reviews
  send back average
`);
    expect(result.errors.length).toBe(0);
    expect(result.javascript).toContain("db.aggregate('reviews', 'AVG', 'score')");
  });

  it('count of tickets from Tickets uses COUNT(*)', () => {
    const result = compileProgram(`
build for javascript backend
database is local memory
create a Tickets table:
  subject, required
when user calls GET /api/stats:
  total = count of tickets from Tickets
  send back total
`);
    expect(result.errors.length).toBe(0);
    expect(result.javascript).toContain("db.aggregate('tickets', 'COUNT'");
  });

  it('sum of price in orders_var stays client-side (backward compat)', () => {
    const result = compileProgram(`
build for javascript backend
database is local memory
create an Orders table:
  price (number)
when user calls GET /api/stats:
  orders = get every Order
  total = sum of price in orders
  send back total
`);
    expect(result.errors.length).toBe(0);
    expect(result.javascript).toContain('_clear_sum_field(orders');
    expect(result.javascript).not.toContain('db.aggregate');
  });
});
```

🟢 **Code:**

**CRITICAL TOKEN GOTCHA:** `from` canonicalizes to `in` (synonyms.js line 57: `in: ['in', 'of', 'from']`). Parser MUST check `tokens[pos].value === 'from'` NOT `tokens[pos].canonical === 'from'` (which is always false). Use `rawValue` for extra safety.

**Step 1** — Add `SQL_AGGREGATE` to `NodeType` in parser.js. Search for `SEARCH: 'search'` at line 360 and add the new entry nearby:
```js
SEARCH: 'search',
SQL_AGGREGATE: 'sql_aggregate',  // ADD THIS
```

**Step 2** — In parser.js **lines 8596-8619**, extend the `collectionOps` handler. Add a new branch BEFORE the existing `in` check:
```js
const collectionOps = {
  sum_of: 'sum', avg_of: 'avg', count_of: 'count',
  max_of: 'max', min_of: 'min',
  first_of: '_first', last_of: '_last', rest_of: '_rest',
};
if (collectionOps[tok.canonical]) {
  const fnName = collectionOps[tok.canonical];
  const operand = parsePrimary(tokens, pos + 1, line, maxPos);
  if (operand.error) return operand;

  // NEW: "sum of field from Table" -> SQL_AGGREGATE. Must be checked BEFORE
  // the "in variable" branch because `from` tokenizes to canonical=`in`.
  // Gating conditions:
  //   (a) the aggregate fn is sum/avg/count/max/min (not first/last/rest)
  //   (b) next token's raw value is 'from' (NOT 'of' or 'in')
  //   (c) token after is a capitalized identifier (data shape naming convention)
  const sqlFns = { sum: 1, avg: 1, count: 1, max: 1, min: 1 };
  if (sqlFns[fnName] &&
      operand.nextPos < maxPos &&
      tokens[operand.nextPos].rawValue === 'from') {
    const tablePos = operand.nextPos + 1;
    if (tablePos < maxPos &&
        tokens[tablePos].type === TokenType.IDENTIFIER &&
        /^[A-Z]/.test(tokens[tablePos].value)) {
      const fieldName = operand.node.name;
      const tableName = tokens[tablePos].value;
      let nextPos = tablePos + 1;

      // Optional WHERE for filtered aggregates
      let condition = null;
      if (nextPos < maxPos && tokens[nextPos].canonical === 'where') {
        nextPos++;
        const condExpr = parseExpression(tokens, nextPos, line);
        if (!condExpr.error) {
          condition = condExpr.node;
          if (typeof condExpr.nextPos === 'number') nextPos = condExpr.nextPos;
          else nextPos = maxPos;
        }
      }

      return {
        node: {
          type: NodeType.SQL_AGGREGATE,
          fn: fnName,
          field: fieldName,
          table: tableName,
          condition,
          line
        },
        nextPos
      };
    }
  }

  // EXISTING: "field in list" pattern — unchanged (line 8607)
  if (operand.nextPos < maxPos && tokens[operand.nextPos].canonical === 'in') {
    const fieldName = operand.node.name;
    const listPos = operand.nextPos + 1;
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

**NOT CHANGING:** `first_of`, `last_of`, `rest_of` behaviors. The lowercase-identifier case (e.g. `sum of price from orders_var`) still hits the existing `in` branch since it fails the `/^[A-Z]/` check.

**Step 3** — In compiler.js `exprToCode` switch, add a case near SEARCH (line ~7067). Handles JS default, Python fallback, and Supabase fallback:
```js
case NodeType.SQL_AGGREGATE: {
  const table = pluralizeName(expr.table).toLowerCase();
  const fn = expr.fn.toUpperCase();
  const field = expr.field;

  // Build filter object from optional where-condition. extractEqPairs returns
  // [] for non-equality conditions (like > or <) — emit a runtime error string.
  let filterArg = '{}';
  if (expr.condition) {
    const pairs = extractEqPairs(expr.condition, ctx);
    if (pairs.length === 0) {
      return `(() => { throw new Error('SQL aggregates only support equality filters. Use look up all then aggregate in memory for complex filters like > or <.'); })()`;
    }
    if (ctx.lang === 'python') {
      const entries = pairs.map(([k, v]) => `"${k}": ${v}`).join(', ');
      filterArg = `{${entries}}`;
    } else {
      const entries = pairs.map(([k, v]) => `${k}: ${v}`).join(', ');
      filterArg = `{ ${entries} }`;
    }
  }

  // Supabase: no aggregate API — fallback to client-side reduce
  if (ctx.dbBackend && ctx.dbBackend.includes('supabase')) {
    if (fn === 'COUNT') {
      return `(((await supabase.from('${table}').select('*')).data) || []).length`;
    }
    const fnMap = { SUM: '_clear_sum_field', AVG: '_clear_avg_field', MIN: '_clear_min_field', MAX: '_clear_max_field' };
    const jsFn = fnMap[fn] || '_clear_sum_field';
    return `${jsFn}(((await supabase.from('${table}').select('*')).data) || [], '${field}')`;
  }

  // Python: no db.aggregate — fallback to fetch-then-reduce
  if (ctx.lang === 'python') {
    if (fn === 'COUNT') {
      return `len(await db.query('${table}', ${filterArg}))`;
    }
    const op = fn === 'SUM' ? 'sum' : fn === 'MIN' ? 'min' : fn === 'MAX' ? 'max' : 'sum';
    if (fn === 'AVG') {
      return `(lambda _r: sum(_r)/len(_r) if _r else 0)([r['${field}'] or 0 for r in await db.query('${table}', ${filterArg})])`;
    }
    return `${op}([r['${field}'] or 0 for r in await db.query('${table}', ${filterArg})])`;
  }

  // JS default (SQLite/Postgres): delegate to db.aggregate
  return `await db.aggregate('${table}', '${fn}', '${field}', ${filterArg})`;
}
```

**NOT CHANGING:** other switch cases. `_clear_min_field` and `_clear_max_field` must exist in the runtime helpers — grep `_clear_min_field` and add to the helpers block at compiler.js line ~139 if missing (they likely don't exist yet). For this plan's JS-default path they're not needed; ONLY the Supabase fallback calls them — if not present, skip Supabase MIN/MAX for now (leave as `// TODO` comment).

🔄 **Refactor:** After Cycle 7 passes, extract the filterArg-building block into a helper `function conditionToSqlFilterArg(condition, ctx)` next to `extractEqPairs` at compiler.js line ~2938. Returns `{ arg: '{}', valid: true }` or `{ arg: null, valid: false, reason: '...' }` — cleaner error semantics than the magic-string throw.

**Commit:** `feat(compiler): SQL aggregate via "from Table" syntax`

---

🔴 **Cycle 7: Filtered aggregate — `sum of price from Orders where status is 'paid'`**

```js
it('filtered aggregate: sum of price from Orders where status is paid', () => {
  const result = compileProgram(`
build for javascript backend
database is local memory
create an Orders table:
  product, required
  price (number)
  status, default 'pending'
when user calls GET /api/stats:
  paid_total = sum of price from Orders where status is 'paid'
  send back paid_total
`);
  expect(result.errors.length).toBe(0);
  expect(result.javascript).toContain("db.aggregate('orders', 'SUM', 'price', { status: 'paid' })");
});

it('filtered aggregate with AND: avg score where team is support and priority is high', () => {
  const result = compileProgram(`
build for javascript backend
database is local memory
create a Tickets table:
  team, required
  priority
  score (number)
when user calls GET /api/stats:
  hot_avg = avg of score from Tickets where team is 'support' and priority is 'high'
  send back hot_avg
`);
  expect(result.errors.length).toBe(0);
  expect(result.javascript).toMatch(/db\.aggregate\('tickets', 'AVG', 'score', \{ team: 'support', priority: 'high' \}\)/);
});

it('filtered aggregate with non-equality emits clear error at runtime', () => {
  const result = compileProgram(`
build for javascript backend
database is local memory
create an Orders table:
  price (number)
when user calls GET /api/stats:
  big = sum of price from Orders where price is greater than 100
  send back big
`);
  // Compiles but throws at runtime — equality only
  expect(result.errors.length).toBe(0);
  expect(result.javascript).toContain('SQL aggregates only support equality filters');
});
```

🟢 **Code:** No NEW production code — Cycle 6's parser + compiler changes already handle the filter. This cycle verifies end-to-end.

**But** — run these tests and check for bugs in the extractEqPairs path. If tests fail, the likely issues are:
- Parser consumed `where` but `condExpr.nextPos` is wrong → aggregate node swallows too much or too little.
- Compiler's `extractEqPairs` returned `[]` for equality conditions → check whether `where status is 'paid'` parses as BINARY_OP with operator `==` (should be `==`, verify via `console.log(expr.condition)` temp log).
- Filter object has wrong quoting for strings → `{ status: "'paid'" }` would be double-quoted.

If fixes needed, add them here.

🔄 **Refactor:** Now that filtered aggregates work, extract the filterArg-building to `conditionToSqlFilterArg(condition, ctx)` helper near `extractEqPairs` at compiler.js line ~2938. Returns `{ arg, valid, reason }`. Replace the inline block in the SQL_AGGREGATE case with a call to this helper — single point of future extension for range/IN filters.

**Commit:** `feat(aggregate): filtered SQL aggregate via where clause`

---

📚 **End of Phase 2:** Run `update-learnings`. Update intent.md with `SQL_AGGREGATE` row.

---

### Phase 3: Template smoke test + audit

Run all 8 core templates. Verify 0 new errors. Audit each for `get all` usage:

```bash
node -e "import { compileProgram } from './index.js'; import fs from 'fs'; ['todo-fullstack','crm-pro','blog-fullstack','live-chat','helpdesk-agent','booking','expense-tracker','ecom-agent'].forEach(a => { const r = compileProgram(fs.readFileSync('apps/'+a+'/main.clear','utf8')); console.log(a+': '+r.errors.length+' errors, '+r.warnings.length+' warnings'); });"
```

Then grep templates for `get all` and `look up all` to find places that might need to become `get every`:
```bash
grep -rn "get all\|look up all" apps/*/main.clear
```

For each match: does the app legitimately need ALL rows (e.g. seed data of 5 items)? If yes, leave it (LIMIT 50 is fine). If it's a list that could grow past 50 (contacts, leads, tickets), either:
- Change to `get every X` to keep old behavior, OR
- Leave as-is and add real pagination via `page N, M per page`

### Phase 4: Documentation

Update:
- **`intent.md`** — add `SQL_AGGREGATE` node type row, document default LIMIT 50 behavior on `lookup` operation, document `get every` opt-out, document `from Table where ... ` aggregate syntax
- **`SYNTAX.md`** — add `get every X` syntax with example, add `sum of field from Table where ...` syntax with example
- **`AI-INSTRUCTIONS.md`** — note default pagination behavior (`get all` returns 50, use `get every` for unlimited), note SQL aggregates use `from Table`, in-memory uses `in variable`
- **`USER-GUIDE.md`** — add tutorial section showing both pagination forms and SQL aggregate
- **`ROADMAP.md`** — mark PERF-1, PERF-2, and PERF-3 (search limit) as **Done**
- **`landing/marcus.html`** if any examples there used `get all` — update them

**Final step:** Run `update-learnings` skill to capture lessons.

## 🧪 TESTING

- **Command:** `node clear.test.js`
- **Success criteria:**
  - [ ] All existing 1914+ tests still pass
  - [ ] New pagination tests pass (cycles 1-4)
  - [ ] New SQL aggregate tests pass (cycles 5-7)
  - [ ] All 8 core templates compile with 0 errors
  - [ ] `get all` produces LIMIT 50 in output
  - [ ] `get every` produces no LIMIT in output
  - [ ] `sum of price from Orders` produces `db.aggregate()` in output
  - [ ] `sum of price from Orders where status is 'paid'` produces filtered `db.aggregate()` with `{ status: 'paid' }`
  - [ ] `sum of price in orders` still produces `_clear_sum_field()` (backward compat)
  - [ ] `search X for query` produces `.slice(0, 100)` in output
  - [ ] Non-equality filtered aggregate emits clear runtime error

## 📎 COPY-PASTE TO CONTINUE

> Implement `plans/plan-perf-pagination-aggregation-04-16-2026.md`. Start with Phase 1 Cycle 1 (db.findAll limit option). Branch: `feature/perf-pagination`. Read compiler.js compileCrud() lines 3225-3400 and runtime/db.js lines 216-222 first. TDD: write failing test, make it pass, refactor.
