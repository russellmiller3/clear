# Plan: PERF-1 + PERF-2 — Pagination & Server-Side Aggregations

## 🎯 THE PROBLEM

Two performance gaps that bite Marcus at scale:

1. **No default pagination.** `get all Users` compiles to `db.findAll('users')` which is `SELECT * FROM users` — no LIMIT. 50K rows → browser death. Parser already has pagination syntax (`page N, M per page`) but it's opt-in. Need a default LIMIT.

2. **Aggregations are client-side.** `sum of price in orders` compiles to `_clear_sum_field(orders, 'price')` — JS `Array.reduce` on data already in memory. When `orders` came from a `get all` call, all rows get fetched just to sum one column. Should compile to `SELECT SUM(price) FROM orders WHERE ...` when the source is a table — and Marcus's dashboards are ALL filtered aggregates ("revenue where status is paid", "count where team is support"), so filtered aggregates are required, not stretch.

## 🔧 THE FIX

### PERF-1: Default pagination

**Where the change happens:**

The compiler's `compileCrud()` function (compiler.js line 3326) handles `node.operation === 'lookup'`. When `lookupAll` is true and no `page/perPage` is set, the current code emits:
```js
const users = (await db.findAll('users')).map(_revive);
```

**The fix:** Modify `db.findAll()` in `runtime/db.js` (line 216) to accept an optional `options` parameter with `limit`. Then modify the compiler to pass `{ limit: 50 }` by default when `lookupAll && !node.noLimit && !node.page`.

**Compiled output changes from:**
```js
const users = (await db.findAll('users')).map(_revive);
```
**To:**
```js
const users = (await db.findAll('users', {}, { limit: 50 })).map(_revive);
```

**Opt-out:** Parser detects `get every User` → sets `node.noLimit = true` → compiler skips the limit param.

**Important: runtime/db.js is NOT imported by the compiler — it's a file that gets COPIED next to the compiled app.** The canonical source is `runtime/db.js`. The compiler also has an inline version in `clear-runtime/db.js`. Both must be updated. Additionally, the Supabase path in `compileCrud()` (line 3285) already has pagination support — just needs the default behavior added.

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
| `compiler.js` lines 3225-3400 | `compileCrud()` — lookup operation |
| `runtime/db.js` lines 216-222 | `findAll()` — needs limit param |
| `clear-runtime/db.js` | Copy of runtime db — also needs limit |
| `parser.js` lines 5502-5557 | `parseLookUpAssignment()` |
| `parser.js` lines 8115-8139 | `get all X` shorthand |
| `synonyms.js` | Check if `every` or `get_every` exists |

### Phase 2 — read these:
| File | Why |
|------|-----|
| `parser.js` lines 8525-8549 | Collection ops (`sum_of` etc) — where to add `from Table` detection |
| `parser.js` line 5536 | `where` condition parsing pattern (reuse) |
| `compiler.js` lines 2863-2912 | `conditionToFilter()` and `extractEqPairs()` — reuse for filtered aggregates |
| `compiler.js` lines 11680-11710 | `mapFunctionNameJS()` — current aggregate mapping |
| `runtime/db.js` | Add `aggregate()` method |

### Phase 3 — read these:
| File | Why |
|------|-----|
| `compiler.js` lines 7022-7029 | `SEARCH` node compilation — add LIMIT |

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
1. In `runtime/db.js` line 216, change `findAll(table, filter)` to `findAll(table, filter, options)`:
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
2. Copy same change to `clear-runtime/db.js`.

🔄 **Refactor:** None needed yet.

**Commit:** `feat(runtime): db.findAll accepts options.limit`

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

🟢 **Code:** In `compileCrud()` at line ~3331, modify the `lookupAll` branch:
```js
// At top of compileCrud or as a module constant:
const DEFAULT_QUERY_LIMIT = 50;

// In the JS lookup branch (line ~3326), replace the existing logic:
if (node.operation === 'lookup') {
  const where = node.condition ? `, ${conditionToFilter(node.condition, ctx)}` : '';
  const isSingleLookup = !node.lookupAll && node.condition && conditionTargetsId(node.condition);

  let lookupCode;
  if (isSingleLookup) {
    lookupCode = `${pad}const ${sanitizeName(node.variable)} = _revive(await db.findOne('${table}'${where}));`;
  } else if (node.page && node.perPage) {
    // Existing explicit pagination path — keep as-is
    const perPage = typeof node.perPage === 'number' ? node.perPage : parseInt(node.perPage, 10) || 25;
    const varName = sanitizeName(node.variable);
    const pageExpr = typeof node.page === 'number' ? node.page : sanitizeName(String(node.page));
    lookupCode = `${pad}const _all_${varName} = await db.findAll('${table}'${where});\n`;
    lookupCode += `${pad}const ${varName} = _all_${varName}.slice((${pageExpr} - 1) * ${perPage}, ${pageExpr} * ${perPage});`;
  } else if (node.noLimit) {
    // Opt-out: "get every X" / "look up every X" — no limit
    lookupCode = `${pad}const ${sanitizeName(node.variable)} = (await db.findAll('${table}'${where})).map(_revive);`;
  } else {
    // DEFAULT: LIMIT 50. When no condition, pass {} as filter so options is the 3rd arg.
    const filterArg = node.condition ? conditionToFilter(node.condition, ctx) : '{}';
    lookupCode = `${pad}const ${sanitizeName(node.variable)} = (await db.findAll('${table}', ${filterArg}, { limit: ${DEFAULT_QUERY_LIMIT} })).map(_revive);`;
  }
  // ... existing FK join stitching at line 3340-3352 stays as-is
}
```

🔄 **Refactor:** Pull `DEFAULT_QUERY_LIMIT = 50` to top of file. Document why 50 in a comment.

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
1. In parser.js, in the `get all X` shorthand (line ~8118), add detection for `every`:
```js
// After the existing "get all" check at line 8118, add a parallel branch for "get every":
if (pos < tokens.length && tokens[pos].canonical === 'get_key' &&
    pos + 1 < tokens.length && tokens[pos + 1].value === 'every' &&
    pos + 2 < tokens.length) {
  const tableName = tokens[pos + 2].value;
  const node = crudNode('lookup', name, tableName, null, line);
  node.lookupAll = true;
  node.noLimit = true;
  return { node };
}
```
2. In `parseLookUpAssignment` (line ~5507), accept `every` in addition to `all`:
```js
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
// ... later when building node:
node.lookupAll = lookupAll;
if (noLimit) node.noLimit = true;
```

🔄 **Refactor:** None — `every` is a common English word, no synonym needed.

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

🟢 **Code:** In compiler.js line 7028, the SEARCH case returns a `.filter()` expression. Append `.slice(0, 100)`:
```js
case NodeType.SEARCH: {
  const table = expr.table ? pluralizeName(expr.table) : 'unknown';
  const query = exprToCode(expr.query, ctx);
  if (ctx.lang === 'python') {
    return `[r for r in await db.find_all('${table}', {}) if ${query}.lower() in ' '.join(str(v) for v in r.values()).lower()][:100]`;
  }
  return `(await db.findAll('${table}', {})).filter(_r => Object.values(_r).some(_v => String(_v).toLowerCase().includes(String(${query}).toLowerCase()))).slice(0, ${DEFAULT_SEARCH_LIMIT})`;
}
```

🔄 **Refactor:** Add `DEFAULT_SEARCH_LIMIT = 100` constant alongside `DEFAULT_QUERY_LIMIT`.

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
1. Add to `runtime/db.js` (after `findOne` at line ~230):
```js
function aggregate(table, fn, field, filter) {
  const tableName = table.toLowerCase();
  // Whitelist function name — never trust input
  const allowedFns = { SUM: 1, AVG: 1, MIN: 1, MAX: 1, COUNT: 1 };
  if (!allowedFns[fn]) throw new Error('Unsupported aggregate function: ' + fn);
  // Sanitize field name — only alphanumeric + underscore
  if (!/^[a-z_][a-z0-9_]*$/i.test(field)) throw new Error('Invalid field name: ' + field);
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
2. Add to `module.exports` at line ~344:
```js
module.exports = {
  createTable,
  findAll,
  findOne,
  insert,
  update,
  remove,
  aggregate,  // ADD THIS
  run,
  execute,
  save,
  load,
  reset,
};
```
3. Mirror the change in `clear-runtime/db.js`.

🔄 **Refactor:** None.

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

1. Add `SQL_AGGREGATE` to `NodeType` in parser.js (find the NodeType object, add):
```js
SQL_AGGREGATE: 'sql_aggregate',
```

2. In parser.js line ~8537, modify the collection ops handler to detect `from Table`:
```js
if (collectionOps[tok.canonical]) {
  const fnName = collectionOps[tok.canonical];
  const operand = parsePrimary(tokens, pos + 1, line, maxPos);
  if (operand.error) return operand;

  // NEW: Check for "from Table" pattern -> SQL aggregate
  // Disambiguate from "get X from '/api/url'" by requiring a capitalized identifier (not a string)
  if (operand.nextPos < maxPos && tokens[operand.nextPos].value === 'from') {
    const tablePos = operand.nextPos + 1;
    if (tablePos < maxPos &&
        tokens[tablePos].type === TokenType.IDENTIFIER &&
        /^[A-Z]/.test(tokens[tablePos].value)) {
      const fieldName = operand.node.name;
      const tableName = tokens[tablePos].value;
      let nextPos = tablePos + 1;

      // Optional WHERE clause for filtered aggregates
      let condition = null;
      if (nextPos < maxPos && tokens[nextPos].canonical === 'where') {
        nextPos++; // skip 'where'
        const condExpr = parseExpression(tokens, nextPos, line);
        if (!condExpr.error) {
          condition = condExpr.node;
          nextPos = condExpr.nextPos || nextPos;
        }
      }

      return {
        node: {
          type: NodeType.SQL_AGGREGATE,
          fn: fnName, // 'sum', 'avg', 'count', 'min', 'max'
          field: fieldName,
          table: tableName,
          condition,
          line
        },
        nextPos
      };
    }
  }

  // EXISTING: "field in list" pattern - stays unchanged
  if (operand.nextPos < maxPos && tokens[operand.nextPos].canonical === 'in') {
    // ... existing code
  }
  return { node: callNode(fnName, [operand.node], line), nextPos: operand.nextPos };
}
```

3. In compiler.js `exprToCode` (find the switch statement that handles expression nodes), add case:
```js
case NodeType.SQL_AGGREGATE: {
  const table = pluralizeName(expr.table).toLowerCase();
  const fn = expr.fn.toUpperCase();
  const field = expr.field;

  // Filter from condition
  let filterArg = '{}';
  if (expr.condition) {
    // Reuse extractEqPairs to ensure only equality conditions
    const pairs = extractEqPairs(expr.condition, ctx);
    if (pairs.length === 0) {
      // Non-equality condition - emit error via fallback string
      return `(() => { throw new Error('SQL aggregates only support equality filters. Use look up all then aggregate in memory for complex filters.'); })()`;
    }
    if (ctx.lang === 'python') {
      const entries = pairs.map(([k, v]) => `"${k}": ${v}`).join(', ');
      filterArg = `{${entries}}`;
    } else {
      const entries = pairs.map(([k, v]) => `${k}: ${v}`).join(', ');
      filterArg = `{ ${entries} }`;
    }
  }

  if (ctx.lang === 'python') {
    return `await (await _get_db()).aggregate('${table}', '${fn}', '${field}', ${filterArg})`;
  }
  return `await db.aggregate('${table}', '${fn}', '${field}', ${filterArg})`;
}
```

🔄 **Refactor:** Document `NodeType.SQL_AGGREGATE` in intent.md table after this cycle passes.

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

🟢 **Code:** Already covered by Cycle 6's parser changes (the `where` parsing) and compiler changes (the `extractEqPairs` use). No additional code — Cycle 7 just verifies the filter pipeline works end-to-end.

🔄 **Refactor:** If extractEqPairs returns empty for non-equality, consider emitting a compile-time WARNING instead of a runtime error. Document for next session.

**Commit:** `test: filtered SQL aggregate end-to-end`

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
