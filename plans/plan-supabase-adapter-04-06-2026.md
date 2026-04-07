# Plan: Supabase Adapter (`database is supabase`)

**Branch:** `claude/review-handoff-bT9dt`
**Date:** 2026-04-06

---

## 0. Before Starting

The current database architecture uses a `db.*` abstraction (findAll, findOne, insert, update, remove). All CRUD nodes compile to these calls regardless of backend. For Supabase, we need to change the CRUD compilation itself to emit Supabase client SDK calls.

**Key decision: compile directly to Supabase SDK, don't wrap in a db.* shim.**

Why: Supabase's SDK is already clean (`supabase.from('table').select()`). Wrapping it in another abstraction adds complexity and hides Supabase-specific features (RLS, realtime, storage). The compiled code should look like what a developer would write by hand.

---

## 1. What We're Building

**User writes:**
```clear
build for web and javascript backend
database is supabase

create a Contacts table:
  name, required
  email, required, unique
  status, default 'new'

when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts

when user calls POST /api/contacts sending contact_data:
  new_contact = save contact_data as new Contact
  send back new_contact with success message

when user calls PUT /api/contacts/:id sending update_data:
  requires auth
  save update_data to Contacts
  send back 'updated'

when user calls DELETE /api/contacts/:id:
  requires auth
  delete the Contact with this id
  send back 'deleted' with success message
```

**Compiler outputs (JS backend):**
```javascript
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Data shape: Contacts (table must exist in Supabase dashboard)
const ContactsSchema = { name: { type: "text", required: true }, ... };

app.get('/api/contacts', async (req, res) => {
  try {
    const { data: all_contacts, error } = await supabase.from('contacts').select('*');
    if (error) throw error;
    res.json(all_contacts);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const contact_data = req.body;
    const { data: new_contact, error } = await supabase.from('contacts').insert(contact_data).select().single();
    if (error) throw error;
    res.status(201).json({ ...new_contact, message: 'Success' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/contacts/:id', async (req, res) => {
  try {
    const update_data = req.body;
    const { error } = await supabase.from('contacts').update(update_data).eq('id', req.params.id);
    if (error) throw error;
    res.json('updated');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('contacts').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
```

**CRUD mapping (local memory → Supabase):**

| Operation | Local Memory | Supabase |
|-----------|-------------|----------|
| Find all | `db.findAll('contacts')` | `supabase.from('contacts').select('*')` |
| Find one by id | `db.findOne('contacts', { id })` | `supabase.from('contacts').select('*').eq('id', id).single()` |
| Find with filter | `db.findAll('contacts', { status: 'new' })` | `supabase.from('contacts').select('*').eq('status', 'new')` |
| Insert | `db.insert('contacts', data)` | `supabase.from('contacts').insert(data).select().single()` |
| Update by id | `db.update('contacts', data)` | `supabase.from('contacts').update(data).eq('id', id)` |
| Delete by id | `db.remove('contacts', { id })` | `supabase.from('contacts').delete().eq('id', id)` |
| Create table | `db.createTable('contacts', schema)` | Comment: `// Table must exist in Supabase dashboard` |

**All Supabase calls return `{ data, error }`.** The compiled code must destructure and check `if (error) throw error`.

---

## 2. Data Flow

```
# Parse time (no change):
# "database is supabase" -> { type: DATABASE_DECL, backend: "supabase", connection: null }
#
# Compile time:
# 1. compileToJSBackend() scans body for DATABASE_DECL, sets dbBackend on ctx
# 2. When dbBackend === 'supabase':
#    - Skip require('./clear-runtime/db')
#    - Emit createClient import + init
# 3. DATABASE_DECL node compiles to comment (client already emitted in scaffold)
# 4. DATA_SHAPE emits schema constant + comment (no db.createTable)
# 5. CRUD nodes check ctx.dbBackend:
#    - "supabase" -> supabase.from().select/insert/update/delete with .eq() chains
#    - default -> db.findAll/insert/update/remove (existing behavior unchanged)
```

---

## 3. Env Vars

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |

---

## 4. Edge Cases

| Scenario | Handling |
|----------|----------|
| `database is supabase` without env vars | Runtime error: Supabase client fails to init |
| Table doesn't exist in Supabase | Supabase returns error, thrown + caught by endpoint try/catch |
| `required` / `unique` constraint | Supabase enforces via table constraints, not compiled JS |
| `auto` timestamp | Supabase handles via column default |
| Filter with `id` | `.eq('id', value)` |
| Multiple AND conditions | Chains multiple `.eq()` calls |
| `lookupAll: false` with id filter | `.select('*').eq('id', id).single()` |
| Browser server (playground) | Unchanged — always uses in-memory db |
| Local memory compilation | Unchanged — no regressions (ctx.dbBackend is undefined/null) |
| `_pick()` for insert | Keep using `_pick()` — strips extra fields (like _editing_id) from state before insert |

---

## 5. TDD Cycles

### Phase 1: Backend scaffold + DATABASE_DECL for Supabase

**Read first:** `compiler.js:3938-3960` (compileToJSBackend imports), `compiler.js:1756-1780` (DATABASE_DECL case)

**Tests:**
```javascript
describe('Supabase adapter - parsing and scaffold', () => {
  it('parses database is supabase', () => {
    const ast = parse("database is supabase");
    expect(ast.errors).toHaveLength(0);
    expect(ast.body[0].type).toBe(NodeType.DATABASE_DECL);
    expect(ast.body[0].backend).toBe('supabase');
  });

  it('emits createClient import for supabase backend', () => {
    const src = `build for javascript backend\ndatabase is supabase\ncreate a Contacts table:\n  name, required\nwhen user calls GET /api/contacts:\n  all_contacts = get all Contacts\n  send back all_contacts`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('createClient');
    expect(result.javascript).toContain('SUPABASE_URL');
    expect(result.javascript).toContain('SUPABASE_ANON_KEY');
  });

  it('does not require db runtime for supabase', () => {
    const src = `build for javascript backend\ndatabase is supabase\ncreate a Contacts table:\n  name, required\nwhen user calls GET /api/contacts:\n  all_contacts = get all Contacts\n  send back all_contacts`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).not.toContain("require('./clear-runtime/db')");
  });
});
```

**Changes:**

1. **`compileToJSBackend()` at line 3938** — Detect supabase backend before emitting imports:
   ```javascript
   // After line 3947 (usesRateLimit detection), add:
   const dbBackend = body.find(n => n.type === NodeType.DATABASE_DECL)?.backend || 'local memory';
   const isSupabase = dbBackend.includes('supabase');
   ```

2. **Line 3952** — Conditionally require db or supabase:
   ```javascript
   // Change from:
   lines.push("const db = require('./clear-runtime/db');");
   // To:
   if (isSupabase) {
     lines.push("const { createClient } = require('@supabase/supabase-js');");
     lines.push("const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);");
   } else {
     lines.push("const db = require('./clear-runtime/db');");
   }
   ```

3. **Pass `dbBackend` through context** — In the ctx object used for compiling nodes inside `compileToJSBackend`, add `dbBackend`:
   ```javascript
   // Find where ctx is constructed inside compileToJSBackend (after the import section)
   // Add dbBackend to it:
   const ctx = { lang: 'js', indent: 0, declared, stateVars: null, mode: 'backend', schemaNames, dbBackend };
   ```

4. **DATABASE_DECL compilation** at `compiler.js:1756-1780` — Add supabase branch:
   ```javascript
   // After the postgres check (line 1778), add before the fallback:
   if (b.includes('supabase')) {
     return `${pad}// Database: Supabase (client initialized at top of file)`;
   }
   ```

**Commit:** `Supabase backend scaffold: createClient import, skip db runtime`

---

### Phase 2: CRUD compilation for Supabase

**Read first:** `compiler.js:1121-1165` (compileCrud), `compiler.js:1280-1317` (compileDataShape), `compiler.js:885-945` (conditionToFilter, conditionTargetsId)

**Tests:**
```javascript
describe('Supabase adapter - CRUD compilation', () => {
  it('compiles get all to supabase.from().select()', () => {
    const src = `build for javascript backend\ndatabase is supabase\ncreate a Contacts table:\n  name, required\nwhen user calls GET /api/contacts:\n  all_contacts = get all Contacts\n  send back all_contacts`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("supabase.from('contacts').select('*')");
  });

  it('compiles find one by id to .eq().single()', () => {
    const src = `build for javascript backend\ndatabase is supabase\ncreate a Contacts table:\n  name, required\nwhen user calls GET /api/contacts/:id:\n  define contact as: look up records in Contacts table where id is incoming's id\n  send back contact`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain(".eq('id'");
    expect(result.javascript).toContain('.single()');
  });

  it('compiles save as insert to supabase', () => {
    const src = `build for javascript backend\ndatabase is supabase\ncreate a Contacts table:\n  name, required\nwhen user calls POST /api/contacts sending contact_data:\n  new_contact = save contact_data as new Contact\n  send back new_contact with success message`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("supabase.from('contacts').insert");
    expect(result.javascript).toContain('.select().single()');
  });

  it('compiles update to supabase', () => {
    const src = `build for javascript backend\ndatabase is supabase\ncreate a Contacts table:\n  name, required\nwhen user calls PUT /api/contacts/:id sending update_data:\n  requires auth\n  save update_data to Contacts\n  send back 'updated'`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("supabase.from('contacts').update");
  });

  it('compiles delete to supabase', () => {
    const src = `build for javascript backend\ndatabase is supabase\ncreate a Contacts table:\n  name, required\nwhen user calls DELETE /api/contacts/:id:\n  requires auth\n  delete the Contact with this id\n  send back 'deleted' with success message`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain("supabase.from('contacts').delete()");
    expect(result.javascript).toContain(".eq('id'");
  });

  it('compiles data shape as comment for supabase (no db.createTable)', () => {
    const src = `build for javascript backend\ndatabase is supabase\ncreate a Contacts table:\n  name, required`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('must exist in Supabase');
    expect(result.javascript).not.toContain('db.createTable');
  });

  it('does not affect local memory compilation', () => {
    const src = `build for javascript backend\ndatabase is local memory\ncreate a Contacts table:\n  name, required\nwhen user calls GET /api/contacts:\n  all_contacts = get all Contacts\n  send back all_contacts`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('db.findAll');
    expect(result.javascript).not.toContain('supabase');
  });
});
```

**Changes:**

1. **`compileCrud()` at line 1121** — Add Supabase branch BEFORE the existing JS code (after the Python block at line 1139):
   ```javascript
   // After line 1139 (end of Python block), add:
   if (ctx.dbBackend && ctx.dbBackend.includes('supabase')) {
     if (node.operation === 'lookup') {
       const varName = sanitizeName(node.variable);
       const isSingle = !node.lookupAll && node.condition && conditionTargetsId(node.condition);
       let query = `supabase.from('${table}').select('*')`;
       // Add filter conditions as .eq() chains
       if (node.condition) {
         const pairs = extractEqPairs(node.condition, ctx);
         for (const [k, v] of pairs) query += `.eq('${k}', ${v})`;
       }
       if (isSingle) query += '.single()';
       return `${pad}const { data: ${varName}, error: _err } = await ${query};\n${pad}if (_err) throw _err;`;
     }
     if (node.operation === 'save') {
       const varCode = sanitizeName(node.variable);
       const names = ctx.schemaNames || new Set();
       let schemaName;
       if (names.has(node.target)) schemaName = node.target + 'Schema';
       else if (names.has(node.target + 's')) schemaName = node.target + 's' + 'Schema';
       else if (names.has(node.target.replace(/s$/, ''))) schemaName = node.target.replace(/s$/, '') + 'Schema';
       else schemaName = node.target + 'Schema';
       if (node.resultVar) {
         return `${pad}const { data: ${sanitizeName(node.resultVar)}, error: _err } = await supabase.from('${table}').insert(_pick(${varCode}, ${schemaName})).select().single();\n${pad}if (_err) throw _err;`;
       }
       return `${pad}const { error: _err } = await supabase.from('${table}').update(${varCode}).eq('id', ${varCode}.id);\n${pad}if (_err) throw _err;`;
     }
     if (node.operation === 'remove') {
       let query = `supabase.from('${table}').delete()`;
       if (node.condition) {
         const pairs = extractEqPairs(node.condition, ctx);
         for (const [k, v] of pairs) query += `.eq('${k}', ${v})`;
       }
       return `${pad}const { error: _err } = await ${query};\n${pad}if (_err) throw _err;`;
     }
   }
   ```

2. **Add `extractEqPairs()` helper** near `conditionToFilter` (around line 885):
   ```javascript
   // Extracts equality pairs from a condition for Supabase .eq() chaining
   function extractEqPairs(condExpr, ctx) {
     const pairs = [];
     if (condExpr.operator === '==' || condExpr.operator === '===') {
       const key = extractFilterKey(condExpr.left);
       const val = exprToCode(condExpr.right, ctx);
       if (key) pairs.push([key, val]);
     } else if (condExpr.operator === '&&') {
       pairs.push(...extractEqPairs(condExpr.left, ctx));
       pairs.push(...extractEqPairs(condExpr.right, ctx));
     }
     return pairs;
   }
   ```

3. **`compileDataShape()` at line 1313** — Skip `db.createTable` for Supabase:
   ```javascript
   // Change line 1313-1314 from:
   if (ctx.mode === 'backend') {
     result += `\n${pad}db.createTable('${tableName}', ${node.name}Schema);`;
   }
   // To:
   if (ctx.mode === 'backend' && !(ctx.dbBackend && ctx.dbBackend.includes('supabase'))) {
     result += `\n${pad}db.createTable('${tableName}', ${node.name}Schema);`;
   } else if (ctx.mode === 'backend' && ctx.dbBackend && ctx.dbBackend.includes('supabase')) {
     result += `\n${pad}// Table '${tableName}' must exist in Supabase dashboard`;
   }
   ```

**Commit:** `Compile CRUD operations to Supabase SDK calls`

---

### Phase 3: Update docs + intent.md

- Update `intent.md` DATABASE_DECL table: add `| DATABASE_DECL | database is supabase | @supabase/supabase-js client |`
- Update `SYNTAX.md` database section: add supabase example
- Update playground guide: add supabase in build targets section
- Update `AI-INSTRUCTIONS.md`: add guidance on supabase vs local memory

**Commit:** `Document supabase adapter in intent, syntax, and style guide`

---

## 6. Success Criteria

- [ ] `database is supabase` parses with backend "supabase"
- [ ] Emits `createClient` require with env vars
- [ ] Does NOT emit `require('./clear-runtime/db')` for supabase
- [ ] CRUD compiles to `supabase.from().select/insert/update/delete` with `.eq()` filters
- [ ] All Supabase calls destructure `{ data, error }` and check error
- [ ] Data shapes emit as schema + comment (no `db.createTable`)
- [ ] Local memory compilation unchanged (no regressions)
- [ ] Browser server unchanged (always in-memory)
- [ ] All 1031+ existing tests pass
- [ ] 10+ new tests for supabase-specific behavior

---

## 7. Resume Prompt

> Read `plans/plan-supabase-adapter-04-06-2026.md`. Implement the 3-phase TDD plan. Phase 1: backend scaffold (createClient, skip db runtime, pass dbBackend through ctx). Phase 2: CRUD compilation (add extractEqPairs helper, supabase branch in compileCrud, skip db.createTable in compileDataShape). Phase 3: docs. The key change is `compileCrud()` — add a supabase branch before the existing JS code that emits `supabase.from().select/insert/update/delete` with `.eq()` filter chains. Run `node clear.test.js` after each phase.
