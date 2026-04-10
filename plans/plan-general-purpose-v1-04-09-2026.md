# Plan: General-Purpose Features v1
**Date:** 2026-04-09
**Branch:** `feature/general-purpose-v1`
**Log tag:** `[GP-V1]`

Three features that expand Clear from "CRUD + web" to "general-purpose":

1. **Streaming file iterators** — `for each line in stream file 'data.csv':` — lazy line-by-line processing
2. **Conditional rendering** — `section 'Name' visible if condition:` — hide/show UI sections based on reactive state
3. **State machines** — `status goes through: draft → submitted → approved` inside DATA_SHAPE — enforce valid transitions at the DB layer

---

## Section 0: Before Starting

- Branch: `feature/general-purpose-v1` ✅ (already created)
- Test baseline: `node clear.test.js` → confirm 1489 passing before any change

---

## Section 1: Existing Code — Phased Reading

### Always read first (every phase):
| File | Why |
|------|-----|
| `intent.md` | Authoritative node type list — update it as part of each phase |
| `learnings.md` TOC | Catch known gotchas before touching parser/compiler |

### Phase 1 (Streaming) — read these:
| File | Why |
|------|-----|
| `tokenizer.js` | Verify `→` handling and understand char-by-char scan loop |
| `parser.js` ~line 3157 | `parseForEachLoop` — detect `stream file`/`stream chunks` BEFORE calling parseExpression |
| `parser.js` ~line 1155 | `stream` dispatch in parseBlock — confirms collision is at block level, not inside FOR_EACH |
| `compiler.js` ~line 3105 | `FOR_EACH` compile case — extend with `isStreamFile`/`isStreamChunks` |
| `synonyms.js` | `stream` canonical is `stream` — no new synonym needed, detection is token-sequence |

### Phase 2 (Conditional Rendering) — read these:
| File | Why |
|------|-----|
| `parser.js` ~line 3381 | `parseSection` — existing modifier detection logic; add `visible if` BEFORE modifier join |
| `compiler.js` ~line 4827 | `findConditionals` in `compileToReactiveJS` — extend to scan SECTION nodes with condition |
| `compiler.js` ~line 5796 | `buildHTML` section walk — add conditional wrapper for SECTION.condition |

### Phase 3 (State Machines) — read these:
| File | Why |
|------|-----|
| `tokenizer.js` | Add `→` handling (char U+2192, single char in JS strings) |
| `parser.js` ~line 3894 | `parseDataShape` field loop — add `goes through` detection |
| `compiler.js` ~line 6382 | `compileToPythonBackend` — Python `_DB` class is inlined, add `set_transitions()` here |
| `runtime/db.js` ~line 235 | `db.update()` — add transition check |

---

## Section 2: What We're Building

### Feature 1: Streaming File Iterators

**Before** (loads entire file into memory):
```clear
contents = read file 'big.csv'
lines = split(contents, '\n')
for each line in lines:
  show line
```

**After** (lazy, constant memory):
```clear
for each line in stream file 'big.csv':
  show line
```

**Chunked arrays:**
```clear
for each chunk in stream items in chunks of 100:
  process chunk
```

**Decisions:**
- Detection happens in `parseForEachLoop` by checking token sequence BEFORE `parseExpression`
- `tokens[pos].canonical === 'stream'` → branch into stream-specific parsing
- `stream file 'path'` → iterable becomes `{ type: 'stream_file', path: 'data.csv' }` (plain object, not in NodeType enum — expression nodes are duck-typed)
- `stream X in chunks of N` → iterable becomes `{ type: 'stream_chunks', source: varExpr, size: N }`
- `for each` → `for_each` dispatcher at parseBlock level dispatches `for_each` canonical, NOT `stream`. No collision with STREAM node (SSE) at ~line 1155 — that dispatches on `stream` as the FIRST token of a line. Inside `parseForEachLoop`, we're already past the `for each` token, so no conflict.
- JS: `for await (const line of _streamLines('path'))` — async generator via readline
- Python: `for line in open('path'):` — already lazy
- `stream file` in web context → compiler error
- **`iterEnd` scan**: existing code strips trailing `list` keyword. For `stream file`, skip `iterEnd` scan entirely — detect `stream` first and parse manually.

### Feature 2: Conditional Rendering (Frontend)

**New syntax** — inline on existing sections:
```clear
section 'Admin Panel' visible if user_role is 'admin':
  heading 'Admin Panel'
  button 'Delete All':
    ...
```

**Mechanism:**
- `visible if <condition>` detected in `parseSection` by scanning raw tokens (NOT the joined `modText` string), BEFORE the existing modifier matching
- Check: `tokens[pos].value === 'visible'` (after `with style X` parsing), then `tokens[pos+1]` canonical is `if_cond`
- Remaining tokens after `if` → passed to `parseExpression`
- SECTION node gets `condition` field (expr node)
- `buildHTML`: when `node.condition` is set, wrap section div in `<div id="sect_cond_N" class="clear-conditional" style="display:none">` using a **separate counter** `sectionCondCounter` (independent of `condCounter` used for IF_THEN blocks)
- `compileToReactiveJS` `findConditionals`: extend to also scan SECTION nodes with `condition`, using same `sectionCondCounter` sequence, emit `sect_cond_N` IDs in `_recompute()`

**IMPORTANT: Two separate counters, two separate ID prefixes:**
- IF_THEN blocks: `cond_N` (existing, unchanged)
- SECTION conditions: `sect_cond_N` (new)
Both must use the same sequential counting logic independently.

### Feature 3: State Machines

**New syntax inside DATA_SHAPE:**
```clear
create an Orders table:
  customer_id, required
  total (number), required
  status, default 'draft'
  status goes through: draft → submitted → approved → shipped
```

**Arrow character:** `→` is U+2192. The tokenizer scans char-by-char. Add detection in the character scanning loop: if char is `→`, emit a token with `type: TokenType.ARROW, value: '→'`.

**What it does:**
- Validates that `status` field transitions are legal at update time
- Runtime `db.update()` checks: current status → requested status allowed?
- Illegal transition → throws `{ status: 400, message: "Invalid status transition: draft → shipped", allowed: ["submitted"] }`

**Python:** Python `_DB` class is inlined in `compileToPythonBackend`. Add `set_transitions(self, table, transitions)` method to `_DB` class and call `db.set_transitions('orders', {...})` after `db.create_table()` calls. Modify `_DB.update()` to check transitions before writing.

---

## Section 3: Data Flow

### Streaming Iterator
```
Source: for each line in stream file 'data.csv':
          ↓
parseForEachLoop: detect tokens[pos].canonical === 'stream' && tokens[pos+1].value === 'file'
  → skip parseExpression, manually build iterable: { type: 'stream_file', path: 'data.csv' }
          ↓
FOR_EACH node { variable: 'line', iterable: { type: 'stream_file', path: 'data.csv' }, body }
          ↓
Compiler (JS backend): for await (const line of _streamLines('data.csv')) { ... }
  + _streamLines async generator emitted once at top of server.js
Compiler (Python backend): for line in open('data.csv'):
Compiler (web): ERROR — "stream file only works in backend"
```

### Conditional Rendering
```
Source: section 'Admin Panel' visible if user_role is 'admin':
          ↓
parseSection: after 'with style X' check, scan raw tokens for visible+if sequence
  → parseExpression on remaining tokens → condition expr node
  → SECTION node { title: 'Admin Panel', condition: BINARY_OP(user_role === 'admin'), body }
          ↓
buildHTML: SECTION walk
  if (node.condition):
    parts.push(`<div id="sect_cond_${sectionCondCounter++}" class="clear-conditional" style="display:none">`)
    ... existing section HTML ...
    parts.push(`</div>`)
          ↓
compileToReactiveJS findConditionals:
  also scans for SECTION with condition
  sectionCondIdx tracks same counter sequence as buildHTML
  _recompute():
    { const _el = document.getElementById('sect_cond_0');
      if (_el) _el.style.display = (state.user_role === 'admin') ? '' : 'none'; }
```

### State Machine
```
Source (in DATA_SHAPE body): status goes through: draft → submitted → approved → shipped
          ↓
parseDataShape field loop: detect fieldTokens[1].value === 'goes' && fieldTokens[2].value === 'through'
  → collect ARROW-separated state names
  → push to node.stateMachines: [{ field: 'status', transitions: { draft: ['submitted'], submitted: ['approved'], approved: ['shipped'] } }]
          ↓
Compiler JS: after db.createTable('orders', schema):
  const _transitions_orders = { 'draft': ['submitted'], 'submitted': ['approved'], 'approved': ['shipped'] };
  db.setTransitions('orders', _transitions_orders);
          ↓
runtime/db.js db.update(): before writing, if _transitions[table][current[field]]:
  check allowed = _transitions[table][current[field]]
  if (!allowed.includes(next[field])) throw { status: 400, message: `Invalid status transition: ${current} → ${next}`, allowed }
          ↓
Python: _DB class gets set_transitions() + update() check (same logic, inlined)
```

---

## Section 4: Integration Points

| Producer | Consumer | Data Format |
|----------|----------|-------------|
| `parseForEachLoop` (modified) | FOR_EACH compiler case | `node.iterable.type === 'stream_file'` or `'stream_chunks'` (duck-typed plain object) |
| `parseSection` (modified) | `buildHTML` + `compileToReactiveJS` | `node.condition` (expr node, or undefined) |
| `parseDataShape` (modified) | `compileDataShape` | `node.stateMachines = [{ field, transitions: {state: [allowed...]} }]` |
| `compileDataShape` | JS server scaffold | `const _transitions_X` + `db.setTransitions()` call at module level |
| `compileDataShape` | Python `_DB` inline class | `db.set_transitions('table', {...})` call after `db.create_table()` |
| `runtime/db.js` | JS update() | `_transitionMaps` module-level Map, checked in update() |

---

## Section 5: Edge Cases

| Scenario | How We Handle It |
|----------|-----------------|
| `stream file` in web/reactive context | Compiler error: "stream file only works in backend — files aren't accessible in the browser" |
| `stream file` path doesn't exist | Runtime error — same as `read file`. Not a compile-time concern. |
| `stream X in chunks of N` where N is 0 | Parser error: "chunks of N needs a number greater than 0" |
| `stream X in chunks of N` where N is not a number literal | Parser error: "chunks of N needs a number. Example: stream items in chunks of 100" |
| `visible if` on section with no body | Existing error fires: "section is empty" |
| `visible if` condition references undeclared var | Not a compile error — `_recompute` evaluates to undefined (falsy), section stays hidden. Consistent with existing conditional behavior. |
| `visible if` with compound condition (`and`/`or`) | Works — `parseExpression` handles compound conditions already |
| `→` in non-state-machine context | Parser ignores ARROW tokens outside DATA_SHAPE field loop — no regression |
| State machine on field that isn't declared | Validator error: "`status goes through:` but no 'status' field found above it in the same table" — check fields array after parsing |
| State machine — initial INSERT (no current status) | Skip transition check on insert — only enforce on update |
| State machine — updating to same status | Allow — `current === next` bypasses the transition check (idempotent) |
| Multiple `goes through` for same field | Validator error: "Only one state machine per field. Found two for 'status'." |
| State machine with single state | Parser error: "goes through needs at least two states separated by →" |
| `for each X in stream file` — `iterEnd` strips trailing `list` | Detection happens BEFORE `iterEnd` scan — short-circuit, no list stripping for stream iterables |

---

## Section 6: ENV VARS

None required.

---

## Section 7: Files to Create

None — all changes extend existing files.

---

## Section 8: Files to Modify

### `tokenizer.js`
**Phase 3 only.** Add `→` (U+2192) detection in the character scanning loop.

Where to add: find the section that handles operators/special chars. Add before or after the `'` single-quote handling:
```js
// ARROW token (U+2192 →) — used in state machine: status goes through: draft → submitted
if (source[i] === '→') {
  tokens.push({ type: TokenType.ARROW, value: '→', line: lineNum });
  i++;
  continue;
}
```
Also add `ARROW: 'arrow'` to the `TokenType` enum.

### `parser.js`
**Phase 1 — Streaming — in `parseForEachLoop`:**

Add BEFORE the `iterEnd` scan and `parseExpression` call (around line 3178):
```js
// Detect stream file / stream chunks BEFORE parseExpression
if (pos < tokens.length && tokens[pos].canonical === 'stream') {
  const streamPos = pos + 1;
  // stream file 'path'
  if (streamPos < tokens.length && tokens[streamPos].value === 'file') {
    const pathPos = streamPos + 1;
    if (pathPos >= tokens.length || tokens[pathPos].type !== TokenType.STRING) {
      errors.push({ line, message: 'stream file needs a path in quotes. Example: for each line in stream file \'data.csv\':' });
      return { node: null, endIdx: startIdx + 1 };
    }
    const path = tokens[pathPos].value;
    const iterable = { type: 'stream_file', path };
    const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
    if (body.length === 0) errors.push({ line, message: 'The for-each loop is empty — add code inside to run on each line.' });
    return { node: forEachNode(variable, iterable, body, line), endIdx };
  }
  // stream X in chunks of N
  if (streamPos < tokens.length && tokens[streamPos].type === TokenType.IDENTIFIER) {
    const sourceVar = tokens[streamPos].value;
    // expect "in chunks of N"
    const inPos = streamPos + 1;
    if (inPos + 3 < tokens.length &&
        tokens[inPos].canonical === 'in' &&
        tokens[inPos + 1].value === 'chunks' &&
        tokens[inPos + 2].value === 'of') {
      const sizeToken = tokens[inPos + 3];
      if (sizeToken.type !== TokenType.NUMBER || sizeToken.value <= 0) {
        errors.push({ line, message: 'stream chunks needs a positive number. Example: for each chunk in stream items in chunks of 100:' });
        return { node: null, endIdx: startIdx + 1 };
      }
      const iterable = { type: 'stream_chunks', source: { type: 'variable_ref', name: sourceVar }, size: sizeToken.value };
      const { body, endIdx } = parseBlock(lines, startIdx + 1, blockIndent, errors);
      if (body.length === 0) errors.push({ line, message: 'The for-each loop is empty — add code inside to run on each chunk.' });
      return { node: forEachNode(variable, iterable, body, line), endIdx };
    }
  }
  errors.push({ line, message: 'stream needs either "file \'path\'" or "varName in chunks of N". Examples:\n  for each line in stream file \'data.csv\':\n  for each chunk in stream items in chunks of 100:' });
  return { node: null, endIdx: startIdx + 1 };
}
```

**Phase 2 — Conditional Rendering — in `parseSection`:**

Add BEFORE the `modText` join (around line 3413), after `with style X` parsing:
```js
// Check for "visible if <condition>" — scan raw tokens, NOT the joined string
// (tokens[pos] may be 'visible', 'if' canonical is 'if_cond')
let sectionCondition = null;
if (pos < tokens.length && tokens[pos].value === 'visible') {
  const ifPos = pos + 1;
  if (ifPos < tokens.length && (tokens[ifPos].canonical === 'if_cond' || tokens[ifPos].value === 'if')) {
    // Parse condition from remaining tokens
    const condExpr = parseExpression(tokens, ifPos + 1, line);
    if (condExpr.error) {
      errors.push({ line, message: `The "visible if" condition couldn't be parsed: ${condExpr.error}` });
    } else {
      sectionCondition = condExpr.node;
    }
    pos = tokens.length; // consume all remaining tokens
  }
}
```
Then after building the node: `if (sectionCondition) node.condition = sectionCondition;`

**Phase 3 — State Machines — in `parseDataShape` field loop:**

Add at top of the field-parsing loop, BEFORE existing field name extraction (around line 3962):
```js
// State machine: "status goes through: draft → submitted → approved"
// Tokens: [IDENTIFIER(status), IDENTIFIER(goes), IDENTIFIER(through), COLON?, ARROW?, ...]
if (fieldTokens.length >= 3 &&
    fieldTokens[1].value === 'goes' &&
    fieldTokens[2].value === 'through') {
  const field = fieldTokens[0].value;
  const states = [];
  for (let s = 3; s < fieldTokens.length; s++) {
    if (fieldTokens[s].type === TokenType.ARROW || fieldTokens[s].value === '→') continue;
    if (fieldTokens[s].type === TokenType.COLON) continue;
    if (fieldTokens[s].type === TokenType.IDENTIFIER || fieldTokens[s].type === TokenType.KEYWORD) {
      states.push(fieldTokens[s].value);
    }
  }
  if (states.length < 2) {
    errors.push({ line: fieldLine, message: `"${field} goes through:" needs at least two states. Example: status goes through: draft → submitted → approved` });
  } else {
    // Convert states array to transitions map: { draft: ['submitted'], submitted: ['approved'], ... }
    const transitions = {};
    for (let s = 0; s < states.length - 1; s++) {
      transitions[states[s]] = [states[s + 1]];
    }
    if (!node.stateMachines) node.stateMachines = [];
    node.stateMachines.push({ field, transitions });
  }
  j++;
  continue;
}
```

Update parser TOC to add: `STATE MACHINE PARSING ............. inside parseDataShape`

### `compiler.js`
**Phase 1 — Streaming — in FOR_EACH case (~line 3105):**

Add BEFORE existing `const isAsync = ...` check:
```js
// Streaming file iterator
if (node.iterable && node.iterable.type === 'stream_file') {
  // Error if in web context
  if (ctx.mode === 'web' || ctx.lang === 'html') {
    return `${pad}// ERROR: stream file is backend-only`;
    // (validator should catch this first — see validator.js)
  }
  const varName = sanitizeName(node.variable);
  const path = JSON.stringify(node.iterable.path);
  const bodyCode = compileBody(node.body, ctx, { declared: new Set(ctx.declared) });
  if (ctx.lang === 'python') {
    return `${pad}for ${varName} in open(${path}):\n${pad}    ${varName} = ${varName}.rstrip('\\n')\n${bodyCode}`;
  }
  needsStreamLines = true; // flag to emit _streamLines utility
  return `${pad}for await (const ${varName} of _streamLines(${path})) {\n${bodyCode}\n${pad}}`;
}

// Streaming chunks iterator
if (node.iterable && node.iterable.type === 'stream_chunks') {
  const varName = sanitizeName(node.variable);
  const source = exprToCode(node.iterable.source, ctx);
  const size = node.iterable.size;
  const bodyCode = compileBody(node.body, ctx, { declared: new Set(ctx.declared) });
  if (ctx.lang === 'python') {
    return `${pad}for i in range(0, len(${source}), ${size}):\n${pad}    ${varName} = ${source}[i:i+${size}]\n${bodyCode}`;
  }
  needsStreamChunks = true; // flag to emit _streamChunks utility
  return `${pad}for (const ${varName} of _streamChunks(${source}, ${size})) {\n${bodyCode}\n${pad}}`;
}
```

Add to UTILITY_FUNCTIONS array:
```js
{ name: '_streamLines', code: `async function* _streamLines(path) { const { createReadStream } = await import('fs'); const { createInterface } = await import('readline'); const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity }); for await (const line of rl) yield line; }`, deps: [] },
{ name: '_streamChunks', code: `function* _streamChunks(arr, size) { for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size); }`, deps: [] },
```

NOTE: `needsStreamLines`/`needsStreamChunks` flags — the simplest approach is to always include these utilities if any FOR_EACH node exists with stream iterable, using the existing tree-shaking pattern in UTILITY_FUNCTIONS. Actually, just add them unconditionally to the backend scaffold since they're tiny.

**Phase 2 — Conditional Rendering — in `buildHTML` walk:**

In the SECTION case of the `walk()` function (find where section HTML is emitted), add a wrapper:
```js
// Check for conditional section BEFORE emitting section HTML
if (node.condition) {
  const condId = `sect_cond_${sectionCondCounter++}`;
  parts.push(`    <div id="${condId}" class="clear-conditional" style="display:none">`);
  // ... existing section HTML emission ...
  parts.push(`    </div>`);
} else {
  // ... existing section HTML emission ...
}
```

Declare `let sectionCondCounter = 0;` alongside `let condCounter = 0;` (around line 5819).

In `compileToReactiveJS` `findConditionals`:
```js
// Also scan SECTION nodes with conditions
let sectionCondIdx = 0;
function findSectionConditionals(nodes) {
  for (const node of nodes) {
    if (node.type === NodeType.SECTION && node.condition) {
      const condExpr = exprToCode(node.condition, { ...reactiveCtx, stateVars: stateVarNames });
      const condId = `sect_cond_${sectionCondIdx++}`;
      lines.push(`  { const _el = document.getElementById('${condId}'); if (_el) _el.style.display = (${condExpr}) ? '' : 'none'; }`);
    }
    if (node.type === NodeType.PAGE || node.type === NodeType.SECTION) {
      findSectionConditionals(node.body);
    }
  }
}
findSectionConditionals(body);
```

**CRITICAL**: Call `findSectionConditionals(body)` AFTER the existing `findConditionals(body)` call — the ID counters are independent so order doesn't matter, but the `_recompute()` generation must include both.

**Phase 3 — State Machines — in `compileDataShape`:**

After the existing `db.createTable(...)` emit (find in compiler.js where DATA_SHAPE compiles):
```js
if (node.stateMachines && node.stateMachines.length > 0) {
  const tableLower = node.name.toLowerCase();
  for (const sm of node.stateMachines) {
    const transMap = JSON.stringify(sm.transitions);
    if (ctx.lang === 'python') {
      lines.push(`_transitions_${tableLower} = ${transMap.replace(/"/g, "'")}`);
      lines.push(`db.set_transitions('${tableLower}', _transitions_${tableLower})`);
    } else {
      lines.push(`const _transitions_${tableLower} = ${transMap};`);
      lines.push(`db.setTransitions('${tableLower}', _transitions_${tableLower});`);
    }
  }
}
```

These lines must be emitted at MODULE LEVEL (same scope as `db.createTable()`), not inside a route handler.

Update compiler TOC.

### `runtime/db.js`
**Phase 3 only.**

Add module-level map after existing `const _tables = {};`:
```js
const _transitionMaps = {}; // table → { field → { fromState → [allowedToStates] } }
```

Add `setTransitions` function alongside `insert`, `update`, etc.:
```js
function setTransitions(table, transitionsByField) {
  _transitionMaps[table.toLowerCase()] = transitionsByField;
}
```

Modify `update()` — add BEFORE the `for (const record of records)` loop:
```js
// State machine transition check
const tmap = _transitionMaps[tableName];
if (tmap) {
  for (const [field, allowedTransitions] of Object.entries(tmap)) {
    if (updateData[field] !== undefined) {
      // Find current value
      const current = records.find(r => matchesFilter(r, filter));
      if (current && current[field] !== updateData[field]) {
        const allowed = allowedTransitions[current[field]];
        if (!allowed || !allowed.includes(updateData[field])) {
          const err = new Error(`Invalid status transition: ${current[field]} → ${updateData[field]}`);
          err.status = 400;
          err.allowed = allowed || [];
          throw err;
        }
      }
    }
  }
}
```

Export `setTransitions` alongside existing exports.

### `compileToPythonBackend` — Python `_DB` class
**Phase 3 only.** Add to the inline `_DB` class (around line 6400):

```python
def set_transitions(self, table, transitions):
    if table not in self._tables:
        self.create_table(table)
    self._tables[table]['_transitions'] = transitions

def update(self, table, record):
    self.create_table(table)
    transitions = self._tables[table].get('_transitions', {})
    for field, allowed_map in transitions.items():
        if field in record:
            current = self.query_one(table, {'id': record.get('id')})
            if current and current.get(field) != record[field]:
                allowed = allowed_map.get(current[field], [])
                if record[field] not in allowed:
                    raise Exception(f"Invalid status transition: {current[field]} → {record[field]}. Allowed: {allowed}")
    for r in self._tables[table]['records']:
        if r.get('id') == record.get('id'):
            r.update(record)
            return 1
    return 0
```

### `intent.md`
Add to the spec at the end of each phase. Update:
- Expression nodes: `STREAM_FILE` / `STREAM_CHUNKS` iterable types (duck-typed, not NodeType enum)
- SECTION node: optional `condition` field
- DATA_SHAPE node: optional `stateMachines: [{ field, transitions }]` field
- New syntax forms in the node tables

---

## Section 9: Pre-Flight Checklist

- [ ] `node clear.test.js` passes at 1489 before starting
- [ ] Grep `tokenizer.js` for existing `→` handling: `grep -n "→\|U+2192\|arrow" tokenizer.js`
- [ ] Verify `stream` at line 1155 of parser.js dispatches on LINE-FIRST tokens only (confirmed: it does)
- [ ] Confirm `if_cond` canonical for `if` keyword: `grep -n "if_cond\|'if'" synonyms.js`
- [ ] Confirm `visible` is not an existing synonym: `grep -n "visible" synonyms.js`
- [ ] Confirm `goes` and `through` are not existing synonyms: `grep -n "'goes'\|'through'" synonyms.js`

---

## Section 10: TDD Cycles

### Phase 1: Streaming File Iterators

**Cycle 1.1 — Parser detects `stream file`**
🔴 Test (add to `describe('Control Flow', ...)` or new `describe('Streaming Iterators', ...)` block):
```js
it('parses for each line in stream file', () => {
  const ast = parse("for each line in stream file 'data.csv':\n  show line");
  const node = ast.body[0];
  expect(node.type).toBe(NodeType.FOR_EACH);
  expect(node.iterable).toBeTruthy();
  expect(node.iterable.type).toBe('stream_file');
  expect(node.iterable.path).toBe('data.csv');
  expect(node.variable).toBe('line');
});
```
🟢 Add stream detection block in `parseForEachLoop` BEFORE the `iterEnd` scan (exact code in Section 8).
🔄 Verify existing FOR_EACH tests still pass: `for each item in items list` unchanged.

**Cycle 1.2 — Compiler emits `for await` + `_streamLines`**
🔴 Test:
```js
it('compiles stream file to readline async generator', () => {
  const result = compileProgram("build for javascript backend\nfor each line in stream file 'data.csv':\n  show line");
  expect(result.serverJS).toContain('for await');
  expect(result.serverJS).toContain('_streamLines');
  expect(result.serverJS).toContain("_streamLines('data.csv')");
});
```
🟢 Add `stream_file` iterable handling in FOR_EACH compiler case. Add `_streamLines` to UTILITY_FUNCTIONS.
🔄 Ensure existing FOR_EACH JS compilation unchanged.

**Cycle 1.3 — Python emits `open()` loop**
🔴 Test:
```js
it('compiles stream file to open() in python', () => {
  const result = compileProgram("build for python backend\nfor each line in stream file 'data.csv':\n  show line");
  expect(result.python).toContain("for line in open('data.csv')");
});
```
🟢 Add Python branch in FOR_EACH stream_file case.

**Cycle 1.4 — Error in web context**
🔴 Test:
```js
it('errors when stream file used in web context', () => {
  const result = compileProgram("build for web\nfor each line in stream file 'data.csv':\n  show line");
  const hasError = result.errors.length > 0 || (result.html && result.html.includes('ERROR'));
  expect(hasError).toBe(true);
});
```
🟢 Add context check: if `ctx.mode === 'web'`, return error comment (validator handles the user-facing message).

**Cycle 1.5 — Chunks variant**
🔴 Test:
```js
it('parses stream chunks', () => {
  const ast = parse("for each chunk in stream items in chunks of 100:\n  show chunk");
  const node = ast.body[0];
  expect(node.type).toBe(NodeType.FOR_EACH);
  expect(node.iterable.type).toBe('stream_chunks');
  expect(node.iterable.size).toBe(100);
});

it('compiles stream chunks to generator', () => {
  const result = compileProgram("build for javascript backend\nfor each chunk in stream items in chunks of 100:\n  show chunk");
  expect(result.serverJS).toContain('_streamChunks');
  expect(result.serverJS).toContain('100');
});
```
🟢 Add `stream_chunks` parsing + `_streamChunks` utility.

**Run:** `node clear.test.js` — all 1489 + 5 new tests green.
📚 Run `update-learnings` skill: capture any tokenizer/parser lessons.

---

### Phase 2: Conditional Rendering

**Cycle 2.1 — Parser attaches condition to SECTION**
🔴 Test:
```js
it('parses section visible if condition', () => {
  const ast = parse("page 'App' at '/':\n  section 'Admin' visible if user_role is 'admin':\n    heading 'Admin Panel'");
  const page = ast.body[0];
  expect(page.type).toBe(NodeType.PAGE);
  const section = page.body[0];
  expect(section.type).toBe(NodeType.SECTION);
  expect(section.condition).toBeTruthy();
  expect(section.condition.type).toBe('binary_op');
});
```
🟢 Extend `parseSection` — detect `visible` + `if` token sequence BEFORE modifier join (exact code in Section 8).
🔄 Verify all existing SECTION tests still pass (no `visible if` in them, so no regression expected).

**Cycle 2.2 — buildHTML wraps conditional section**
🔴 Test:
```js
it('wraps conditional section in hidden div', () => {
  const result = compileProgram("build for web\npage 'App' at '/':\n  section 'Admin' visible if user_role is 'admin':\n    heading 'Admin Panel'");
  expect(result.html).toContain('class="clear-conditional"');
  expect(result.html).toContain('style="display:none"');
  expect(result.html).toContain('sect_cond_');
  expect(result.html).toContain('Admin Panel');
});
```
🟢 Add `sectionCondCounter` and conditional wrapper in `buildHTML` SECTION walk (exact pattern in Section 8).

**Cycle 2.3 — `_recompute` toggles visibility**
🔴 Test:
```js
it('generates recompute toggle for conditional section', () => {
  const result = compileProgram("build for web\n'Role' as text input saves to user_role\nsection 'Admin' visible if user_role is 'admin':\n  heading 'Admin Panel'");
  expect(result.html).toContain('_recompute');
  expect(result.html).toContain("style.display");
  expect(result.html).toContain("'admin'");
  expect(result.html).toContain('sect_cond_0');
});
```
🟢 Add `findSectionConditionals` call in `compileToReactiveJS` (exact code in Section 8). Counter must match buildHTML.

**Run:** `node clear.test.js` — all prior + 3 new tests green.
📚 Run `update-learnings` skill.

---

### Phase 3: State Machines

**Cycle 3.1 — Tokenizer handles `→`**
🔴 Test:
```js
it('tokenizes → as ARROW token', () => {
  const tokens = tokenizeLine('draft → submitted', 1);
  const arrow = tokens.find(t => t.type === TokenType.ARROW);
  expect(arrow).toBeTruthy();
  expect(arrow.value).toBe('→');
});
```
🟢 Add `ARROW: 'arrow'` to `TokenType` enum. Add `→` char detection in tokenizer character scan loop.
🔄 Run all tokenizer tests — `→` appears nowhere in existing source, so no regression.

**Cycle 3.2 — Parser detects `goes through` in DATA_SHAPE**
🔴 Test:
```js
it('parses state machine in data shape', () => {
  const ast = parse("create an Orders table:\n  status, default 'draft'\n  status goes through: draft → submitted → approved");
  const shape = ast.body[0];
  expect(shape.type).toBe(NodeType.DATA_SHAPE);
  expect(shape.stateMachines).toBeDefined();
  expect(shape.stateMachines.length).toBe(1);
  expect(shape.stateMachines[0].field).toBe('status');
  expect(shape.stateMachines[0].transitions).toEqual({
    draft: ['submitted'],
    submitted: ['approved']
  });
});
```
🟢 Add `goes through` detection in `parseDataShape` field loop BEFORE existing field name extraction (exact code in Section 8).
🔄 Verify existing DATA_SHAPE tests (compound unique, RLS policies) unchanged.

**Cycle 3.3 — Compiler emits transition map (JS)**
🔴 Test:
```js
it('emits JS transition map for state machine', () => {
  const result = compileProgram("build for javascript backend\ncreate an Orders table:\n  status, default 'draft'\n  status goes through: draft → submitted → approved");
  expect(result.serverJS).toContain('_transitions_orders');
  expect(result.serverJS).toContain("'draft': ['submitted']");
  expect(result.serverJS).toContain("setTransitions('orders'");
});
```
🟢 Add state machine emission in `compileDataShape` JS path.

**Cycle 3.4 — Runtime enforces transitions**
🔴 Test (add to clear.test.js, import db directly):
```js
it('runtime rejects invalid state transition', async () => {
  // Import db directly to test runtime behavior
  const { db } = await import('./runtime/db.js');
  // Clear state
  db._tables = {};
  db.setTransitions('orders', { draft: ['submitted'], submitted: ['approved'] });
  db.insert('orders', { id: 1, status: 'draft' });

  let caught = null;
  try {
    db.update('orders', { id: 1, status: 'approved' }); // skip submitted — illegal
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeTruthy();
  expect(caught.message).toContain('Invalid status transition');
  expect(caught.message).toContain('draft → approved');
  expect(caught.allowed).toEqual(['submitted']);
});

it('runtime allows valid state transition', () => {
  db._tables = {};
  db.setTransitions('orders', { draft: ['submitted'], submitted: ['approved'] });
  db.insert('orders', { id: 1, status: 'draft' });
  expect(() => db.update('orders', { id: 1, status: 'submitted' })).not.toThrow();
});

it('runtime allows idempotent same-state update', () => {
  db._tables = {};
  db.setTransitions('orders', { draft: ['submitted'] });
  db.insert('orders', { id: 1, status: 'draft' });
  expect(() => db.update('orders', { id: 1, status: 'draft' })).not.toThrow();
});
```
🟢 Add `_transitionMaps` + `setTransitions()` + update guard in `runtime/db.js` (exact code in Section 8). Export `setTransitions`.
🔄 Verify existing `db.update()` behavior unchanged when no transition map registered.

**Cycle 3.5 — Validator: field doesn't exist**
🔴 Test:
```js
it('errors when state machine references undeclared field', () => {
  const result = compileProgram("build for javascript backend\ncreate an Orders table:\n  total (number)\n  status goes through: draft → approved");
  // status field not declared above goes-through line
  // validator should catch this
  const hasError = result.errors.some(e => e.message.toLowerCase().includes('status'));
  expect(hasError).toBe(true);
});
```
🟢 Add validator check in `validator.js`: for each DATA_SHAPE with `stateMachines`, verify each `field` appears in `node.fields` array. Error: "`status goes through:` but 'status' isn't declared as a field. Add it above the goes-through line."

**Cycle 3.6 — Python emits transition dict**
🔴 Test:
```js
it('emits python transition dict and set_transitions call', () => {
  const result = compileProgram("build for python backend\ncreate an Orders table:\n  status, default 'draft'\n  status goes through: draft → submitted → approved");
  expect(result.python).toContain('_transitions_orders');
  expect(result.python).toContain("'draft': ['submitted']");
  expect(result.python).toContain('db.set_transitions');
  expect(result.python).toContain('set_transitions(self');
});
```
🟢 Add `set_transitions()` method to Python `_DB` class and add to `update()`. Emit `db.set_transitions()` call in Python compiler after `db.create_table()`.

**Run:** `node clear.test.js` — all prior + 6 new tests green.
📚 Run `update-learnings` skill.

---

## Section 11: Logging Tags

- `[GP-V1:STREAM]` — streaming iterator issues
- `[GP-V1:COND]` — conditional rendering issues
- `[GP-V1:SM]` — state machine issues

---

## Section 12: Test Run Order

1. `node clear.test.js` after every cycle — must stay green
2. Add tests to `clear.test.js` in new describe blocks:
   - `describe('Streaming Iterators', ...)`
   - `describe('Conditional Section Rendering', ...)`
   - `describe('State Machines', ...)`
3. Final count target: 1489 + ~14 new = ~1503 tests

---

## Section 13: Success Criteria

- [ ] `for each line in stream file 'data.csv':` compiles to `readline`-based async generator in JS
- [ ] Same syntax compiles to `open()` iterator in Python
- [ ] Error produced when `stream file` used in web context
- [ ] `for each chunk in stream items in chunks of 100:` compiles to `_streamChunks` generator
- [ ] `section 'Name' visible if condition:` wraps section in `display:none` div
- [ ] Reactive `_recompute()` toggles `sect_cond_N` visibility on state change
- [ ] `visible if` uses separate ID counter from IF_THEN `cond_N` — no existing conditional rendering broken
- [ ] `→` tokenizes as ARROW token
- [ ] `status goes through: draft → submitted → approved` parsed into `stateMachines` on DATA_SHAPE node
- [ ] Transition map emitted as `_transitions_X` const in JS, dict in Python
- [ ] `db.setTransitions()` / `db.set_transitions()` called at module level
- [ ] Runtime rejects illegal transitions with `{ status: 400, message, allowed }` error
- [ ] Idempotent same-status update allowed
- [ ] Validator errors when `goes through` field not declared above it
- [ ] All 1489 existing tests still pass

---

## Resume Prompt

```
Branch: feature/general-purpose-v1
Plan: plans/plan-general-purpose-v1-04-09-2026.md

Execute phases in order. Run `node clear.test.js` after every TDD cycle.

PHASE 1 — Streaming iterators:
1. In parser.js `parseForEachLoop` (line ~3178), add stream detection BEFORE iterEnd scan.
   Check tokens[pos].canonical === 'stream'. Branch into stream_file or stream_chunks parsing.
2. In compiler.js FOR_EACH case (line ~3105), handle node.iterable.type === 'stream_file'
   and 'stream_chunks'. JS: for await + _streamLines/_streamChunks. Python: open()/slice.
3. Add _streamLines and _streamChunks to UTILITY_FUNCTIONS.
4. Add web-context error.

PHASE 2 — Conditional rendering:
1. In parser.js parseSection (line ~3413), before modText join, scan raw tokens for
   tokens[pos].value === 'visible' && next token is 'if'. Call parseExpression on rest.
   Attach result as node.condition.
2. In compiler.js buildHTML SECTION walk, if node.condition, wrap in
   <div id="sect_cond_N" ...> using separate sectionCondCounter (not condCounter).
3. In compileToReactiveJS, add findSectionConditionals() that walks SECTION nodes
   with condition, emits _recompute() toggles with matching sect_cond_N IDs.

PHASE 3 — State machines:
1. In tokenizer.js, add ARROW token type and → char detection.
2. In parser.js parseDataShape field loop, detect "[field] goes through:" pattern.
   Parse → separated states into transitions map. Push to node.stateMachines.
3. In compiler.js compileDataShape, emit _transitions_X const + db.setTransitions()
   at module level (same scope as db.createTable).
4. In runtime/db.js, add _transitionMaps, setTransitions(), and transition check
   in update() before the record-writing loop. Export setTransitions.
5. In compileToPythonBackend _DB class, add set_transitions() method and update()
   transition check.
6. In validator.js, add check: DATA_SHAPE with stateMachines — each field must
   appear in node.fields array.

Update parser.js and compiler.js TOCs. Update intent.md.
```
