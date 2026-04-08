# Plan: CRUD Table Action Buttons (`with delete` / `with edit`)

**Branch:** `claude/review-handoff-bT9dt` (already exists, has stashed WIP)
**Date:** 2026-04-06

---

## 0. Before Starting

1. Drop stash: `git stash drop stash@{0}`
2. The committed code (from `97bc93f`) has auto-inference logic in `compiler.js` that decides whether to show buttons based on endpoint existence. This must be changed to use `disp.actions` from the parser instead.
3. The parser (`parser.js:3475-3532`) has NO changes yet — `parseDisplay` does not parse `with delete/edit`.

**Current state of committed auto-inference code that must be changed:**
- `compiler.js:2877-2903` — endpoint scan + `_editing_id` state init (keep scan, change `_editing_id` gating)
- `compiler.js:3024-3031` — table render checks `deleteEndpoints[resourceKey]` directly (change to `disp.actions`)
- `compiler.js:3104` — `updateEndpoints` unconditionally passed in btnCtx (gate on edit actions)
- `compiler.js:3115-3163` — event delegation checks endpoints directly (gate on `disp.actions`)
- `compiler.js:2170-2188` — auto-upsert in API_CALL (keep, but only fires when `ctx.updateEndpoints` is truthy)

---

## 1. What We're Building

**User writes:**
```
display contacts as table showing name, email with delete
display contacts as table showing name, email with edit
display contacts as table showing name, email with delete and edit
```

**What happens:**
- `with delete` — Delete button on each row. Compiler wires it to the matching `DELETE /api/contacts/:id` endpoint.
- `with edit` — Edit button on each row. Clicking populates the form inputs. Save button auto-upserts (POST for new, PUT for existing).
- `with delete and edit` — Both buttons.

**What does NOT happen:**
- No buttons appear unless the user explicitly writes `with delete` or `with edit`.
- If user writes `with delete` but has no DELETE endpoint, validator warns: "Table has 'with delete' but no DELETE endpoint found for contacts. Add: `when user calls DELETE /api/contacts/:id`"

### Key Design Decision

The previous attempt auto-inferred buttons from endpoints. That's wrong because:
- A DELETE endpoint might be admin-only
- The user might want a confirmation modal before showing delete
- Auto-inference is magic — violates Clear's "explicit over terse" rule

The right level of magic: **user says what they want, compiler handles the wiring.**

---

## 2. Data Flow

```
# Parse time:
# "display contacts as table showing name, email with delete"
#   -> displayNode with actions: ['delete']
#
# Compile time:
# 1. Scan endpoints -> deleteEndpoints['contacts'] = '/api/contacts/'
# 2. Scan GET calls -> getRefreshUrls['contacts'] = { url: '/api/contacts', varName: 'contacts' }
# 3. Table render in _recompute() checks disp.actions (NOT endpoints)
#    -> if 'delete' in actions AND deleteEndpoints has match: render delete button
#    -> if 'delete' in actions but NO deleteEndpoints match: button still renders
#       but click handler is a no-op (validator already warned at compile time)
# 4. Event delegation on table element
#    -> click [data-delete-id] -> DELETE fetch -> re-GET -> _recompute()
#    -> click [data-edit-id] -> populate form state -> set _editing_id
# 5. Button POST auto-upserts when _editing_id is set
#    -> PUT instead of POST -> clear _editing_id
```

---

## 3. Synonym Collision Analysis

| Token | Canonical | Type | Risk |
|-------|-----------|------|------|
| `with` | `with` | keyword | Safe — `parseDisplay` is its own path, `with` after `showing` is unambiguous. `hasDisplayModifiers()` requires `as` or `called` to even enter this parser. |
| `delete` | `remove` | keyword | Must check `canonical === 'remove'` (not raw value) since tokenizer maps delete→remove |
| `edit` | (none) | identifier | No collision — not a synonym for anything |

The `showing` clause currently eats all remaining tokens. Must add a stop condition: break when token canonical is `with`.

---

## 4. Edge Cases

| Scenario | Handling |
|----------|----------|
| `with delete` but no DELETE endpoint | Validator warning (not error). Button renders but event handler skips fetch if no URL found. |
| `with edit` but no PUT/PATCH endpoint | Validator warning. Edit button populates form, but Save stays as POST (no upsert). |
| `with delete` on non-table display | Parsed and stored in `node.actions` but ignored — compiler only processes actions for `format === 'table'`. |
| Table rows have no `id` field | Delete/edit `data-*-id` will be `undefined`. Browser server auto-generates IDs so this works in practice. |
| Multiple tables with same resource | Each gets its own event delegation listener scoped to its table element ID. |
| `delete` tokenizes as canonical `remove` | Parser checks `canonical === 'remove'`, not raw value `delete`. |
| `with edit` but no form inputs on page | Edit populates `_state` but no inputs reflect it. Not a compiler bug — validator could warn later (not in this plan). |
| `showing` clause without `with` | No change — existing behavior preserved. `with` parsing block only enters if `tokens[pos].canonical === 'with'`. |
| `display X as table with delete` (no `showing`) | `showing` loop doesn't run. `pos` falls through to `with` parsing. Must work. Add test. |
| `data-edit-row` with special characters | `_esc()` escapes `&`, `<`, `>`, `"` — safe for HTML attributes. Verified in `compiler.js:57`. |
| No GET call matching resource | `refreshInfo` is null. After delete, only `_recompute()` fires (no re-fetch). Table still shows stale data until next manual refresh. Acceptable — the validator already ensures the user has GET wired up in practice. |
| Auto-upsert fires for wrong button | Only fires when `ctx.updateEndpoints` is truthy AND POST URL matches `/api/{resource}`. `updateEndpoints` is only passed in btnCtx when a display has `edit` in actions. |

---

## 5. TDD Cycles

### Phase 1: Parser — `with delete/edit` on display tables

**Read first:** `parser.js:3475-3533` (parseDisplay), `synonyms.js` (verify `delete`→`remove`)

**Tests to add** (append to `clear.test.js` before `run()`):

```javascript
describe('Table action buttons - parsing', () => {
  it('parses "with delete" on display table', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email with delete");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.columns).toEqual(['name', 'email']);
    expect(disp.actions).toEqual(['delete']);
  });

  it('parses "with edit" on display table', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email with edit");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.actions).toEqual(['edit']);
  });

  it('parses "with delete and edit" on display table', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email with delete and edit");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.actions).toEqual(['delete', 'edit']);
  });

  it('no actions when "with" is absent', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.actions).toBe(undefined);
  });

  it('parses "with delete" without showing clause', () => {
    const ast = parse("page 'App':\n  display contacts as table with delete");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.columns).toBe(null);
    expect(disp.actions).toEqual(['delete']);
  });

  it('columns do not include with/delete/edit tokens', () => {
    const ast = parse("page 'App':\n  display contacts as table showing name, email with delete and edit");
    expect(ast.errors).toHaveLength(0);
    const disp = ast.body[0].body[0];
    expect(disp.columns).toEqual(['name', 'email']);
    expect(disp.columns).not.toContain('with');
    expect(disp.columns).not.toContain('delete');
    expect(disp.columns).not.toContain('edit');
  });
});
```

**Parser change** in `parser.js:3515-3532` (inside `parseDisplay`, after the `called` block):

The `showing` loop at line 3520 currently eats all remaining tokens. Add a break before consuming `with`:

```javascript
// In the showing while loop, add this as the first line inside:
if (tokens[pos].canonical === 'with') break;
```

Then after the showing block (after line 3528), add:

```javascript
// Optional: with delete / with edit / with delete and edit
let actions = null;
if (pos < tokens.length && tokens[pos].canonical === 'with') {
  pos++;
  actions = [];
  while (pos < tokens.length) {
    const canon = tokens[pos].canonical;
    if (canon === 'remove') {
      actions.push('delete');
    } else if (tokens[pos].value.toLowerCase() === 'edit') {
      actions.push('edit');
    }
    pos++;
    if (pos < tokens.length && (tokens[pos].value === ',' || tokens[pos].value === 'and')) pos++;
  }
}
```

And update the node construction (line 3530-3532):

```javascript
const node = displayNode(expr.node, format, label, line);
if (columns) node.columns = columns;
if (actions && actions.length > 0) node.actions = actions;
return { node };
```

**Update `intent.md` line 96:**
Change:
```
| `DISPLAY` | `display x as dollars called 'Label'` | `<output>` element |
```
To:
```
| `DISPLAY` | `display x as dollars called 'Label'` / `display x as table showing a, b with delete` | `<output>` or `<table>` with action buttons |
```

**Commit:** `Parse 'with delete/edit' on display tables`

---

### Phase 2: Compiler — explicit action buttons in table rendering

**Read first:** `compiler.js:2877-2903` (endpoint scan), `compiler.js:3018-3066` (table rendering), `compiler.js:3095-3163` (button + event delegation), `compiler.js:2170-2188` (auto-upsert)

**Tests to add:**

```javascript
describe('Table action buttons - compilation', () => {
  it('renders delete buttons when "with delete" and DELETE endpoint exist', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
  email, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls DELETE /api/contacts/:id:
  delete the Contact with this id
  send back 'deleted' with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name, email with delete`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('data-delete-id');
    expect(result.javascript).toContain("method: 'DELETE'");
  });

  it('does NOT render delete buttons without "with delete"', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
  email, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls DELETE /api/contacts/:id:
  delete the Contact with this id
  send back 'deleted' with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name, email`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).not.toContain('data-delete-id');
  });

  it('renders edit buttons when "with edit" and PUT endpoint exist', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
  email, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls PUT /api/contacts/:id sending contact_data:
  save contact_data to Contacts
  send back contact_data with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  'Name' is a text input saved as a name
  display contacts as table showing name, email with edit`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).toContain('data-edit-id');
    expect(result.javascript).toContain('_editing_id');
  });

  it('auto-upserts POST to PUT when _editing_id is set', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
  email, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls POST /api/contacts sending contact_data:
  new_contact = save contact_data as new Contact
  send back new_contact with success message
when user calls PUT /api/contacts/:id sending contact_data:
  save contact_data to Contacts
  send back contact_data with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  'Name' is a text input saved as a name
  'Email' is a text input saved as an email
  button 'Save':
    send name and email to '/api/contacts'
    get contacts from '/api/contacts'
  display contacts as table showing name, email with edit`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    // Should have the if/else upsert logic
    expect(result.javascript).toContain('_state._editing_id');
    expect(result.javascript).toContain("method: 'PUT'");
  });

  it('does NOT add _editing_id to state without "with edit"', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls PUT /api/contacts/:id sending contact_data:
  save contact_data to Contacts
  send back contact_data with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name`;
    const result = compileProgram(src);
    expect(result.errors).toHaveLength(0);
    expect(result.javascript).not.toContain('_editing_id');
  });
});
```

**Compiler changes:**

1. **`compiler.js:2900-2903`** — Change `_editing_id` gating. Currently:
   ```javascript
   if (Object.keys(updateEndpoints).length > 0) {
     stateDefaults['_editing_id'] = 'null';
   }
   ```
   Change to:
   ```javascript
   const hasEditAction = displayNodes.some(d => d.actions && d.actions.includes('edit'));
   if (hasEditAction) {
     stateDefaults['_editing_id'] = 'null';
   }
   ```

2. **`compiler.js:3024-3031`** — Change table rendering. Currently checks `deleteEndpoints[resourceKey]` and `updateEndpoints[resourceKey]` directly. Change to:
   ```javascript
   const actions = disp.actions || [];
   const hasDelete = actions.includes('delete');
   const hasUpdate = actions.includes('edit');
   const hasActions = hasDelete || hasUpdate;
   const deleteUrl = hasDelete ? deleteEndpoints[resourceKey] : null;
   const updateInfo = hasUpdate ? updateEndpoints[resourceKey] : null;
   ```

3. **`compiler.js:3104`** — Change btnCtx. Currently: `updateEndpoints` always passed. Change to:
   ```javascript
   const btnCtx = { lang: 'js', indent: 1, declared: btnDeclared, stateVars: stateVarNames, mode: 'web', updateEndpoints: hasEditAction ? updateEndpoints : undefined };
   ```
   (Note: `hasEditAction` is defined in step 1 above and is accessible here since both are in the same function scope.)

4. **`compiler.js:3115-3124`** — Change event delegation gating. Currently checks endpoints directly. Change to:
   ```javascript
   const actions = disp.actions || [];
   if (actions.length === 0) continue;
   const deleteUrl = actions.includes('delete') ? deleteEndpoints[resourceKey] : null;
   const updateInfo = actions.includes('edit') ? updateEndpoints[resourceKey] : null;
   if (!deleteUrl && !updateInfo) continue;
   ```

**Commit:** `Wire delete/edit buttons to endpoints (explicit opt-in)`

---

### Phase 3: Validator — missing endpoint warnings

**Read first:** `validator.js:725-745` (validateDuplicateEndpoints for the walk pattern)

**Tests to add:**

```javascript
describe('Table action buttons - validation', () => {
  it('warns when "with delete" but no DELETE endpoint', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name with delete`;
    const result = compileProgram(src);
    expect(result.warnings.some(w => w.includes('no DELETE endpoint'))).toBe(true);
  });

  it('warns when "with edit" but no PUT/PATCH endpoint', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name with edit`;
    const result = compileProgram(src);
    expect(result.warnings.some(w => w.includes('no PUT or PATCH endpoint'))).toBe(true);
  });

  it('no warning when endpoints match actions', () => {
    const src = `build for web and javascript backend
database is local memory
create a Contacts table:
  name, required
when user calls GET /api/contacts:
  all_contacts = get all Contacts
  send back all_contacts
when user calls DELETE /api/contacts/:id:
  delete the Contact with this id
  send back 'deleted' with success message
page 'App' at '/':
  on page load get contacts from '/api/contacts'
  display contacts as table showing name with delete`;
    const result = compileProgram(src);
    expect(result.warnings.filter(w => w.includes('DELETE endpoint'))).toHaveLength(0);
  });
});
```

**Validator change** — add `validateDisplayActions` after `validateDuplicateEndpoints` in `validator.js`:

```javascript
// Add to validate() function (line ~45):
validateDisplayActions(ast.body, warnings);

// Add after validateDuplicateEndpoints (after line 744):
function validateDisplayActions(body, warnings) {
  // Collect all endpoints (walk entire tree — endpoints can be at top level or in pages)
  const endpoints = new Map();
  function collectEndpoints(nodes) {
    for (const node of nodes) {
      if (node.type === NodeType.ENDPOINT && node.path) {
        const match = node.path.match(/\/api\/(\w+)\/:id/);
        if (match) {
          endpoints.set(`${node.method} ${match[1].toLowerCase()}`, node.line);
        }
      }
      if (node.body) collectEndpoints(node.body);
    }
  }
  collectEndpoints(body);

  // Check display nodes with actions (walk entire tree)
  function checkDisplays(nodes) {
    for (const node of nodes) {
      if (node.type === NodeType.DISPLAY && node.actions) {
        const varName = node.expression && node.expression.name ? node.expression.name.toLowerCase() : '';
        for (const action of node.actions) {
          if (action === 'delete' && !endpoints.has(`DELETE ${varName}`)) {
            warnings.push(
              `Line ${node.line}: Table has "with delete" but no DELETE endpoint found for ${varName}. ` +
              `Add: when user calls DELETE /api/${varName}/:id`
            );
          }
          if (action === 'edit' && !endpoints.has(`PUT ${varName}`) && !endpoints.has(`PATCH ${varName}`)) {
            warnings.push(
              `Line ${node.line}: Table has "with edit" but no PUT or PATCH endpoint found for ${varName}. ` +
              `Add: when user calls PUT /api/${varName}/:id`
            );
          }
        }
      }
      if (node.body) checkDisplays(node.body);
    }
  }
  checkDisplays(body);
}
```

**Note:** Unlike `validateDuplicateEndpoints` which only walks into `PAGE` and `SECTION`, this validator uses `node.body` to walk the full tree. This is important because display nodes can be nested inside pages/sections, and endpoints are typically at top level.

**Commit:** `Validate display table actions match available endpoints`

---

### Phase 4: Update examples + docs

1. **Contact Manager example** (`playground/index.html:355`): Change:
   ```
   display contacts as table showing name, email, company, status
   ```
   To:
   ```
   display contacts as table showing name, email, company, status with delete
   ```

2. **Run full test suite:** `node clear.test.js` — expect 1005 + 13 new = 1018+ passing.

3. **Run update-learnings skill.**

**Commit:** `Update examples and docs for with delete/edit syntax`

---

## 6. Success Criteria

- [ ] `display X as table showing a, b with delete` parses `actions: ['delete']`
- [ ] `display X as table with delete` (no showing) parses correctly
- [ ] `columns` never includes `with`/`delete`/`edit` tokens
- [ ] Delete button appears in table rows only when user writes `with delete`
- [ ] Delete button does NOT appear when only endpoint exists (no auto-inference)
- [ ] Delete click → DELETE fetch → refresh table
- [ ] Edit button appears only when user writes `with edit`
- [ ] Edit click → populates form → Save does PUT instead of POST
- [ ] `_editing_id` only in state when display has `with edit`
- [ ] Validator warns on `with delete` without DELETE endpoint
- [ ] Validator warns on `with edit` without PUT/PATCH endpoint
- [ ] No warning when endpoints match actions
- [ ] All 1005+ original tests still pass
- [ ] Contact Manager example updated with `with delete`

---

## 7. Resume Prompt

> Read `plans/plan-crud-table-actions-04-06-2026.md`. Drop stash@{0}. The committed code has auto-inference in compiler.js — change table rendering and event delegation to check `disp.actions` instead of endpoint existence. Follow the 4-phase TDD plan. Phase 1: parser (add `with delete/edit` parsing). Phase 2: compiler (gate on `disp.actions`). Phase 3: validator (warn on missing endpoints). Phase 4: examples + docs. Run `node clear.test.js` after each phase. All test code is copy-paste ready in the plan.
