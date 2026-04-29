# Routing Primitive — `route X by FIELD:` (Plan, 2026-04-29)

A new top-level Clear node type that compiles down to assignment logic. Today the lead-router app uses raw `if X is Y` chains. Works for fixed mapping; breaks for round-robin, territory, workload, skill-based. After this primitive, those variants drop from 50+ lines to 5.

## Phase Order (load-bearing)

**Default track:** Path A — phases 1–6 (parser → validator → JS emit → cursor runtime → Python parity → docs). Ships the user-visible primitive end-to-end on BOTH targets with round-robin pools persisted in SQLite. Python parity is part of Path A because **CLAUDE.md "Build Python Alongside JS — No Drift Tax" rule** requires every backend feature to land on both targets in the same epic.

**Escalation:** Path B — research-tier variants gated on a real customer asking for the shape: B-1 (territory lookup against an Owners table), B-2 (workload-balance variant), B-3 (skill-based variant). Path B requires new schema (Owners table, capacity tracking) that's overkill for the wedge demo.

**Why this ordering:** ship the cheapest user-visible primitive first (round-robin + fixed mapping) on BOTH targets, prove it solves Russell's "first paying customer" lead-router custom variant, then escalate to richer routing strategies only when a customer asks. Don't pre-build Owners-table abstractions on speculation.

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| 1 — parser + node type | A | — | required |
| 2 — validator rules | A | Phase 1 | required |
| 3 — JS compiler emit | A | Phase 1, 2 | required |
| 4 — round-robin cursor runtime (JS) | A | Phase 3 | required |
| 5 — Python compiler emit + cursor runtime | A | Phase 4 | required (cross-target parity) |
| 6 — doc cascade + 3 example apps + lead-router rewrite | A | Phase 5 | required |
| B-1 — territory lookup variant | B | Phase 6 + customer ask | research-tier |
| B-2 — workload-balance variant | B | Phase 6 + customer ask | research-tier |
| B-3 — skill-based variant | B | Phase 6 + customer ask | research-tier |

## Problem

**Today (broken pattern, lead-router lines 68-73):**

```clear
when user sends lead to /api/leads:
  if lead's size is 'Enterprise':
    lead's assigned_to is 'charlie'
  if lead's size is 'Mid-market':
    lead's assigned_to is 'bob'
  if lead's size is 'SMB':
    lead's assigned_to is 'alice'
  new_lead = save lead as new Lead
```

Every customer Russell builds for diverges on routing logic. Without a primitive, every variant is 50+ lines of if-chains plus per-rep state for round-robin or workload-balance. The pattern doesn't compose: stacking territory + size + workload becomes a wall of nested conditionals that Russell rewrites from scratch each time.

**The fix:** lift the assignment pattern into a first-class node type.

## What we reuse from existing primitives

The routing primitive's closest cousin is the **queue primitive** (`queue for deal:`, shipped 2026-04-27). Both are top-level keyword block primitives that walk an indented body, dispatch each line by its leading keyword, and auto-emit backing state. Reuse audit:

| Layer | Source primitive | What we copy | Approx % reuse |
|-------|------------------|--------------|----------------|
| Parser skeleton | `parseQueueDef` (parser.js:4801) | "Walk indented body, dispatch each line by first token, fall through on unknown" loop | ~60% |
| Cursor-table dedupe | `compileQueueDef` (compiler.js:6359) | "Emit a backing table once per app, gate via `ctx._someFlagEmitted`" pattern (queue uses `ctx._workflowEmailQueueEmitted` for the email queue table — same trick for `_clear_route_cursors`) | ~80% |
| Python parity | `compileQueueDef` Python branch (F5, 2026-04-28) | Mechanical port — same SQLite table, FastAPI handler, `db.create_table` instead of JS `db.createTable` | ~70% |
| Test scaffolding | `clear.test.js` "Queue primitive — parser" / "compiler tables" / "URLs" blocks | Layout, naming, assertion patterns | direct copy |
| Doc cascade | Queue primitive's CHANGELOG entry + intent.md row + AI-INSTRUCTIONS section | Section structure + tone | direct copy |

**What we don't reuse:**
- **Agent code** (Claude calls + tools + skills) — different problem entirely; routing doesn't talk to Claude.
- **Workflow code** (multi-step orchestration with state persistence) — routing is one-shot pick, not a state machine.
- **Queue's action handlers** — queue auto-emits `PUT /api/<entity>s/:id/<action>` for each action; routing doesn't need per-rule URLs.

**Net effect:** parser writing drops to ~40% of green-field. The runtime round-robin cursor helper (~30 lines + a SQLite table) is the only fresh code that doesn't have a precedent.

## Syntax sketch + 3 example programs

**Canonical form:**

```clear
route lead by size:
  'SMB' to alice
  'Mid-market' to bob
  'Enterprise' to charlie
  default round-robin across [diana, evan, frank]
```

**Why quoted strings on the LHS:** Clear's tokenizer treats `-` as the minus operator, so `Mid-market` would tokenize as three tokens (`Mid`, `-`, `market`) — not one identifier. The match value is also a string compared against entity field data (which is always a string), so quoting it matches the existing if-chain form (`if lead's size is 'Mid-market'`). Owners on the RHS stay bare-identifier (`alice`, `bob`) because they're enum-like names without punctuation; quoting them works too if the author prefers (`'alice'` is accepted).

**What each line means:**
- `route lead by size:` — for each Lead, decide assignment based on the `size` field.
- `'SMB' to alice` — if `size` equals `'SMB'`, assign `'alice'` to `lead.assigned_to`.
- `default round-robin across [diana, evan, frank]` — if no rule matches, rotate through the pool.

### Example 1 — fixed mapping only (replaces lead-router today)

```clear
when user sends lead to /api/leads:
  validate lead:
    name is text, required
    email is text, required
    size is text

  route lead by size:
    'SMB' to alice
    'Mid-market' to bob
    'Enterprise' to charlie
    default to alice

  new_lead = save lead as new Lead
  send back new_lead with success message
```

### Example 2 — round-robin pool for the default

```clear
when user sends lead to /api/leads:
  validate lead:
    name is text, required
    size is text

  route lead by size:
    'Enterprise' to charlie
    default round-robin across [alice, bob, diana, evan]

  new_lead = save lead as new Lead
  send back new_lead with success message
```

### Example 3 — territory routing (different field, simple mapping)

```clear
when user sends lead to /api/leads:
  validate lead:
    name is text, required
    region is text

  route lead by region:
    'West' to alice
    'East' to bob
    'Central' to charlie
    default round-robin across [alice, bob, charlie]

  new_lead = save lead as new Lead
```

### Phone test (read each line out loud — does a 14-year-old understand?)

| Line | Out loud | Pass? |
|------|----------|-------|
| `route lead by size:` | "Route a lead based on its size" | ✅ unambiguous |
| `'SMB' to alice` | "If the size is SMB, give it to Alice" | ✅ |
| `default round-robin across [a, b, c]` | "Otherwise, rotate through Alice, Bob, Charlie" | ✅ "round-robin" is a sales/ops term Marcus would know; "across" reads naturally |
| `route lead by region:` | "Route the lead based on its region" | ✅ same shape |

**Verdict:** all lines pass. The one tweak: `default to alice` (single owner) and `default round-robin across [...]` (pool) are two different shapes — the parser dispatches on whether the second token after `default` is `to` (single owner) or `round` (round-robin).

## Synonym collision audit

Confirmed via `grep -n` against `synonyms.js` and a tokenizer smoke test of `default round-robin across [a, b, c]`:

| Token | Existing use | Verdict |
|-------|--------------|---------|
| `route` | Not in synonyms.js. Used as a prop value (icon name `with icon 'route'`) and as quoted strings (`'Routing rules'`) but never as a top-level dispatch keyword. | Free to claim. |
| `by` | Already canonical in synonyms.js line 66 (`by: Object.freeze(['by'])`). Used in expression context: `chart 'X' showing data by field`, `count by field`, also in `sort by field`. Statement-context `route X by FIELD:` is unambiguous because canonical dispatch happens on `tokens[0].value === 'route'` first. | Free at statement level — dispatch ordering protects us. |
| `default` | Tokenizes as `identifier` (NOT in synonyms.js). Used in `parseDataShape` for column defaults: `size, default 'SMB'`. That code path is reached only from inside a `create a Leads table:` block, never from inside a route body. Inside an indented routing block, `default` as the first token of a line is unambiguous. | Free in this context. |
| `to` | Reserved word per CLAUDE.md. Heavily used: `nav item 'X' to '/path'`, `send X to '/api/y'`, `belongs to`, `save X as new Y`. In routing context (`'SMB' to alice`), it's a binary infix between match value and owner. | Free in this position — the routing body parser owns this scope. |
| `round` | **ALREADY canonical** in synonyms.js line 120 (`round: Object.freeze(['round', 'rounded'])`). Used by image styling (`compiler.js:6177` — `if (t.canonical === 'round' || v === 'rounded') rounded = true;`) and CSS preset (`'rounded'`). Image-rounded check happens during `parseImage`, not inside route bodies — no clash. | Free in routing context. We DON'T add a new synonym; we recognize the token sequence. |
| `robin` | Not in synonyms.js. Plain identifier. | Free. |
| `across` | Not in synonyms.js. Tokenizes as `identifier`. Reads naturally with pool. | Free. |

**Tokenizer behavior for `round-robin` (verified via smoke test 2026-04-29):**

The string `default round-robin across [a, b, c]` produces these 6 tokens (plus list contents):
1. `default` (identifier)
2. `round` (keyword, canonical='round')
3. `-` (operator, minus)
4. `robin` (identifier)
5. `across` (identifier)
6. `[` (lbracket)

So the parser doesn't need a new tokenizer rule — `round-robin` is a recognized **token sequence inside the routing body parser**: when the first token of a line is `default` and the next three tokens are `round`, `-`, `robin`, treat as a round-robin default rule.

**Decision:** no tokenizer change. The routing body parser scans the token sequence directly. The hyphen stays a minus operator everywhere else, so no risk of collateral damage to image-rounded modifiers, math, or CSS presets.

## Parser changes (Phase 1)

**New node type:** `ROUTE_DEF` (matches `QUEUE_DEF`, `EMAIL_TRIGGER`, `WORKFLOW`, `AGENT` naming).

**AST shape:**
```js
{
  type: 'route_def',
  entityName: 'lead',         // singularized — `route leads by size:` works too
  field: 'size',              // the field to switch on
  rules: [
    { type: 'fixed', match: 'SMB',         owner: 'alice' },
    { type: 'fixed', match: 'Mid-market',  owner: 'bob' },
    { type: 'fixed', match: 'Enterprise',  owner: 'charlie' },
    // exactly one default — either fixed or round-robin
    { type: 'default', strategy: 'round_robin', pool: ['diana', 'evan', 'frank'] },
    // OR
    // { type: 'default', strategy: 'fixed', owner: 'alice' },
  ],
  line: 12,
}
```

**Dispatch:** `CANONICAL_DISPATCH.set('route', ctx => parseRouteDef(...))` — mirrors `queue` dispatch at parser.js:2729.

**Parser function:** `parseRouteDef(lines, startIdx, _parentIndent, errors)` — same signature as `parseQueueDef` (parser.js:4801). Walks indented body; for each line:

- If `tokens[0].value === 'default'`:
  - If next sequence is `round`, `-`, `robin`, `across`, `[`: parse `pool` as bracketed list of bare identifiers, push `{type: 'default', strategy: 'round_robin', pool: [...]}`.
  - Else if `tokens[1].value === 'to'`: parse single owner (bare identifier or quoted string), push `{type: 'default', strategy: 'fixed', owner}`.
  - Else: hard-fail with did-you-mean.
- Otherwise (a `<value> to <owner>` line):
  - First token must be `STRING` (quoted match value) — bare identifiers rejected so the canonical form is consistent.
  - Then `to` (token value, not canonical — `to` is a reserved word but not a synonym entry).
  - Then bare identifier OR `STRING` for owner.
  - Push `{type: 'fixed', match, owner}`.

**Why string-required on the LHS:** the tokenizer splits hyphenated bare identifiers (`Mid-market` → 3 tokens). Forcing the match value to be a string means `'Mid-market'`, `'Asia-Pacific'`, `'2024-Q1'` all work without parser hacks. The if-chain form already requires strings (`if lead's size is 'Mid-market'`), so there's no new rule for authors to learn.

**Hard-fail on unknown body lines** — same pattern as queue's F1 (added 2026-04-28). Unknown line → friendly error pointing at the canonical forms.

**Hard-fail conditions:**
- Missing `by` after entity name → "route needs 'by'. Example: route lead by size:"
- Missing field name → "route needs a field. Example: route lead by size:"
- Empty body → "route block needs at least one rule. Example: `'SMB' to alice`"
- Bare-identifier match value (`SMB to alice` instead of `'SMB' to alice`) → "route match values must be quoted strings: `'SMB' to alice`, not `SMB to alice`. Quotes match the if-chain form (`if lead's size is 'SMB'`)."
- Multiple `default` rules → "only one default allowed per route block"
- `round-robin across []` (empty pool) → "round-robin needs a non-empty pool: `[alice, bob, ...]`"

## Validator rules (Phase 2)

Five checks. Three are warnings (program compiles, but the author probably made a mistake). Two are hard errors (the program is provably wrong). Pattern matches the queue primitive's validator hooks.

| Rule | Severity | Trigger | Message | Why |
|------|----------|---------|---------|-----|
| `ROUTE_ENTITY_NOT_IN_SCOPE` | error | `route X by FIELD:` where `X` is not a parameter of the enclosing endpoint and not a previously-assigned variable in the same block | "Route block references '<X>' but no variable named '<X>' is in scope here. Did you mean to put this inside `when user sends <X> to /api/<X>s:`?" | Without this, the compiled JS hits `ReferenceError: X is not defined` at request time. Hard error so it never ships. |
| `ROUTE_AFTER_SAVE` | error | `route lead by FIELD:` appears AFTER `save lead as new <Table>` in the same block | "Route block runs after `save lead as new Lead` — the assignment never reaches the database. Move the route block ABOVE the save line." | Silent bug: assignment lands on the in-memory `lead` but never persists. The most common bad order. Hard error. |
| `ROUTE_FIELD_NOT_ON_ENTITY` | warning | `route lead by FIELD:` where `FIELD` doesn't appear in the `Leads` table definition | "Route field 'FIELD' isn't on the Leads table. Add it to the table or use one of: name, email, size, source, ..." | Catches typos. The most common mistake. Warning (not error) because the table might be defined elsewhere or the field might be runtime-only. |
| `ROUTE_NO_DEFAULT` | warning | route block has no `default` rule | "Route block has no default. If lead's FIELD doesn't match any rule, no owner gets assigned. Add `default round-robin across [...]` or `default to <owner>`." | Without a default, unmatched values silently leave `assigned_to` unset. |
| `ROUTE_UNREACHABLE_RULE` | warning | rule appears after `default` | "Rule ''<value>' to <owner>' appears after default. The default catches everything; this rule never fires." | Author probably reordered by accident. |

**Skip:** owner-name validation. The owners are loose strings (`alice`, `bob`) — there's no Owners table primitive yet. Future `route ... by ... using Owners` can validate against an Owners table. Out of scope for cycle 1.

**Implementation note:** the two hard-error rules require knowing the enclosing endpoint's parameters and the order of statements within it. Validator already walks the AST tree-shape; both checks fit naturally into the existing `validateBody` / endpoint-scope walker.

## JS compiler emit (Phase 3)

**ROUTE_DEF is a STATEMENT-level node, not a top-level definition.** Unlike `QUEUE_DEF` which lives at the top of the program (auto-emits tables + URL handlers + UI), `ROUTE_DEF` only ever appears inside an endpoint body. It compiles inline — no auto-emitted endpoints, no auto-emitted tables, no UI.

**Dispatch path in `compileNode`:** add a new `case NodeType.ROUTE_DEF:` block in the same dispatch table (compiler.js around line 7535 where `QUEUE_DEF` and `EMAIL_TRIGGER` cases live). Returns the JS statement block as a string at the current `pad` indentation — same shape as `case NodeType.IF_THEN:` (compiler.js:7060).

**Inside the endpoint body:** `route lead by size:` compiles to a statement block that mutates `lead.assigned_to` in place. The block is inline JS — no helper call for the fixed-mapping path, a tiny helper call for the round-robin path.

**Compiled output for Example 1 (fixed mapping only):**

```js
// clear:N — route lead by size
{
  const _v = lead.size;
  if (_v === 'SMB')              lead.assigned_to = 'alice';
  else if (_v === 'Mid-market')  lead.assigned_to = 'bob';
  else if (_v === 'Enterprise')  lead.assigned_to = 'charlie';
  else                           lead.assigned_to = 'alice';
}
```

**Compiled output for Example 2 (round-robin default):**

```js
// clear:N — route lead by size (round-robin default across [alice, bob, diana, evan])
{
  const _v = lead.size;
  if (_v === 'Enterprise') lead.assigned_to = 'charlie';
  else lead.assigned_to = await _clear_route_pick({
    routeId: 'route_lead_size_3f8a',   // content hash, stable across edits
    pool: ['alice', 'bob', 'diana', 'evan'],
  });
}
```

**Stable route id — content hash, NOT line number:**

Format: `'route_' + entity + '_' + field + '_' + shortHash(rules + pool)`, where `shortHash` is the first 4 hex chars of a SHA-256 of the canonicalized rule list + pool array. Example: `route_lead_size_3f8a`.

**Why content hash, not `'route_' + line + ...`:** if you use the line number, deleting a comment ABOVE the route block shifts the line, the cursor row's primary key changes, and the next deploy creates a fresh cursor (resetting round-robin). With a content hash, the cursor key is stable across edits as long as the route's semantics don't change. If the rules or pool DO change, a new cursor key is correct (the old pool's cursor is meaningless).

**Collision risk:** two different route blocks routing the same entity by the same field with identical rules + pool would share a cursor. That's actually the desired behavior — they're semantically the same router. If a third entity-field router happens to hash to the same 4-hex prefix (1 in 65536), bump to 6 hex chars. We start at 4; expand if a collision is ever observed.

**`_clear_route_cursors` table emit:** the compiler adds the table once per app — first time any `route ... default round-robin ...` block appears in the source. Dedupe via `ctx._clearRouteCursorsEmitted` flag (same trick queue uses for the email queue table). Table emission lives in the program's PRELUDE pass (where queue tables also emit), not inside `compileNode` — `compileNode` is invoked per-node and shouldn't emit shared infrastructure.

**Endpoint side-effect — none in cycle 1.** The route block mutates the variable in place; `save lead as new Lead` (already in scope) writes the assigned owner to the row. No magic injection. Validator rule `ROUTE_AFTER_SAVE` (Phase 2) ensures the route block precedes the save.

**The `lead` reference is the same JS object** that `save lead as new Lead` will insert. Mutating `lead.assigned_to` before the save is sufficient — no need for the route block to know about the save line. Confirmed by reading compiler.js's `save X as new T` emit (compiler.js:4795–4806): `save` reads from the in-memory `lead` object and inserts its current state.

## Round-robin cursor runtime (Phase 4)

**Where state lives:** `_clear_route_cursors` SQLite table. Per-deploy (matches the rest of Clear's local-memory model). Survives restarts.

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS _clear_route_cursors (
  route_id        TEXT PRIMARY KEY,
  last_index      INTEGER NOT NULL DEFAULT -1,
  updated_at_date TEXT NOT NULL
);
```

**Helper signature (`runtime/route-cursor.js`):**
```js
async function _clear_route_pick({ routeId, pool }) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  // Read-modify-write under SQLite's serialized writer.
  const row = db.queryFirst('SELECT last_index FROM _clear_route_cursors WHERE route_id = ?', [routeId]);
  const next = ((row?.last_index ?? -1) + 1) % pool.length;
  const now = new Date().toISOString();
  db.exec(
    'INSERT INTO _clear_route_cursors (route_id, last_index, updated_at_date) VALUES (?, ?, ?) ' +
    'ON CONFLICT (route_id) DO UPDATE SET last_index = ?, updated_at_date = ?',
    [routeId, next, now, next, now]
  );
  return pool[next];
}
```

**Concurrency model — explicitly:** Node.js is single-threaded; the JS event loop runs one tick at a time. Two HTTP requests that both reach `_clear_route_pick` can't execute the read-modify-write at the same time — JavaScript serializes them. Each await point is a yield, but `db.queryFirst` and `db.exec` are SYNCHRONOUS in better-sqlite3 (Clear's runtime), so the read + write run as a single uninterrupted block. Two near-simultaneous inserts get assigned to `pool[0]` and `pool[1]` respectively, never both to `pool[0]`.

**For multi-process deployments** (e.g. Fly.io with horizontal scaling), SQLite's WAL mode serializes writes across processes via the shared `-wal` file. The second process blocks briefly until the first commits, then reads the updated cursor. Same correctness guarantee at slightly higher latency.

**Survives restart:** the cursor row persists in the SQLite file. After a process restart, the next call to `_clear_route_pick` reads the saved `last_index` and continues from where it left off.

**Python sibling:** `runtime/route_cursor.py` — same shape, `db.execute` instead of `db.exec`, same SQLite table. Sync sqlite3 module on Python side; same single-thread serialization story per process, same WAL behavior across processes.

**Cross-target parity (PHILOSOPHY Rule 17):** the cursor table name + helper signature are identical on JS and Python. A program that compiles round-robin under either target reads from the same `_clear_route_cursors` rows.

## Python compiler emit (Phase 5)

Mechanical port of the JS branch. Same shape, FastAPI-flavored.

**Compiled output for Example 1 (fixed mapping):**

```python
# clear:N — route lead by size
_v = lead.get('size')
if _v == 'SMB':            lead['assigned_to'] = 'alice'
elif _v == 'Mid-market':   lead['assigned_to'] = 'bob'
elif _v == 'Enterprise':   lead['assigned_to'] = 'charlie'
else:                      lead['assigned_to'] = 'alice'
```

**Compiled output for Example 2 (round-robin default):**

```python
# clear:N — route lead by size (round-robin default across [alice, bob, diana, evan])
_v = lead.get('size')
if _v == 'Enterprise':
    lead['assigned_to'] = 'charlie'
else:
    lead['assigned_to'] = _clear_route_pick(
        route_id='route_lead_size_3f8a',
        pool=['alice', 'bob', 'diana', 'evan'],
    )
```

**Where it lands in compiler.js:** the existing `compileQueueDef` Python branch (compiler.js:6366) is the template. Add a Python branch in the new `compileRouteDef` function that mirrors `if (ctx.lang === 'python')` early-return. Use `db.execute` + sqlite3 module (Python side has no better-sqlite3 equivalent).

**Cursor table emit on Python:** uses `db.create_table('_clear_route_cursors', {...})` from the existing _DB stub (matches queue's Python `db.create_table` call at compiler.js:6381).

**Helper module path:** `runtime/route_cursor.py`. Mirrors `runtime/route-cursor.js` exactly — same function signature, same SQL, same return type.

## TDD cycles per phase

### Phase 1 — parser + node type
- **Cycle 1.1:** parser test — `route lead by size:` with one fixed rule (`'SMB' to alice`) produces the expected AST. Red → green via new `parseRouteDef` + `CANONICAL_DISPATCH.set('route', ...)`.
- **Cycle 1.2:** all hard-fail conditions produce the right error messages: missing `by` ("route needs 'by'..."), missing field name, empty body, multiple defaults, `round-robin across []` (empty pool), bare-identifier match value (rejected — must be string).
- **Cycle 1.3:** `default round-robin across [a, b, c]` parses into the right AST shape (token sequence: `default`, `round`, `-`, `robin`, `across`, `[`, ...).
- **Cycle 1.4:** plural input (`route leads by size:`) singularizes to the same shape (queue F2 pattern via `singularizeEntityName`).
- **Cycle 1.5:** `default to alice` (single-owner default) parses distinctly from `default round-robin across [...]` — both end up as `{type: 'default', strategy: 'fixed' | 'round_robin', ...}` AST nodes.

### Phase 2 — validator rules
- **Cycle 2.1:** `ROUTE_ENTITY_NOT_IN_SCOPE` hard error when `route foo by size:` references undefined `foo`.
- **Cycle 2.2:** `ROUTE_AFTER_SAVE` hard error when the route block appears AFTER `save lead as new Lead` in the same endpoint.
- **Cycle 2.3:** `ROUTE_FIELD_NOT_ON_ENTITY` warning when field isn't on the table.
- **Cycle 2.4:** `ROUTE_NO_DEFAULT` warning when block has no default.
- **Cycle 2.5:** `ROUTE_UNREACHABLE_RULE` warning when a rule comes after default.

### Phase 3 — JS compiler emit
- **Cycle 3.1:** Example 1 compiles to the expected if/else chain over `lead.size` with `lead.assigned_to` mutation.
- **Cycle 3.2:** Example 2 compiles to if/else + `await _clear_route_pick(...)` for the round-robin default. Stable id is a content hash of (entity + field + rules + pool), NOT a line number.
- **Cycle 3.3:** the cursor table emits exactly once per app even with multiple route blocks. (Dedupe via `ctx._clearRouteCursorsEmitted` flag.)
- **Cycle 3.4:** all 8 core templates compile clean (`node clear.test.js` on each).
- **Cycle 3.5:** all 5 Marcus apps compile clean (regression smoke).

### Phase 4 — round-robin cursor runtime (JS)
- **Cycle 4.1:** runtime helper picks `pool[0]` on first call, `pool[1]` second, wraps to `pool[0]` after `pool.length` calls.
- **Cycle 4.2:** survives restart — first helper call writes `last_index=0` to SQLite, then close + reopen the db handle, then a second call reads `last_index=0` from disk and returns `pool[1]`.
- **Cycle 4.3:** sequential calls under simulated load — fire `_clear_route_pick` 100 times in a tight loop with a 4-element pool; assert exactly 25 picks of each owner. (This replaces the impossible "concurrent calls" test — Node is single-threaded; this test instead proves the cursor advances correctly under real volume.)
- **Cycle 4.4:** empty pool returns `null` without throwing.
- **Cycle 4.5:** missing route id is treated as a fresh cursor (returns `pool[0]`, writes the row).

### Phase 5 — Python compiler emit + cursor runtime
- **Cycle 5.1:** Python emit for fixed-mapping case (Example 1 produces the right `_v = lead.get('size'); if _v == 'SMB': ...` chain).
- **Cycle 5.2:** Python emit for round-robin default — calls `_clear_route_pick(route_id=..., pool=[...])` from `runtime/route_cursor.py`.
- **Cycle 5.3:** `runtime/route_cursor.py` reads/writes the same `_clear_route_cursors` table the JS helper writes. Helper smoke test: call 4 times, assert sequential picks.
- **Cycle 5.4:** `node scripts/cross-target-smoke.mjs` passes — compile every template × every target and syntax-check each emission. (This is the Build Python Alongside JS rule's mandatory check.)

### Phase 6 — doc cascade + 3 example apps + lead-router rewrite
- **Cycle 6.1:** rewrite `apps/lead-router/main.clear` lines 68–73 to use `route lead by size:` instead of the if-chain. The existing tests (`test:` blocks at lines 200-207) still pass under `node cli/clear.js test apps/lead-router/main.clear`.
- **Cycle 6.2:** UAT smoke — all 5 Marcus apps still pass their browser walker tests (52/52 baseline). Run `node scripts/marcus-uat.mjs` (or the equivalent — confirm exact path during implementation).
- **Cycle 6.3:** doc cascade per the list below — all 11 surfaces.
- **Cycle 6.4:** consider rewriting deal-desk's routing block if it has one (optional — only if the route version is strictly more legible).

## Doc cascade list (Phase 6)

Per the project rule, all eleven surfaces:

- [ ] `intent.md` — new `ROUTE_DEF` row in the spec table. Format matches `QUEUE_DEF` row at intent.md:352. Cell template: `` | `ROUTE_DEF` | `route <entity> by <field>:` + indented body | Inline statement inside an endpoint. Compiles to an if/else chain over the entity's field, mutating `<entity>.assigned_to`. Round-robin default emits `await _clear_route_pick({routeId, pool})` against the auto-emitted `_clear_route_cursors` SQLite table. No top-level emit (no auto-tables, URLs, or UI). Validator hard-errors on undefined entity OR route block after the save line; warns on missing default or unreachable rules. | ``
- [ ] `SYNTAX.md` — section with the canonical example + round-robin variant + the 3 example programs from this plan.
- [ ] `AI-INSTRUCTIONS.md` — when to use `route X by field` vs an if-chain. Convention: prefer the primitive whenever there are 2+ branches and a fallback. Note the LHS-must-be-string rule and the round-robin token sequence.
- [ ] `USER-GUIDE.md` — tutorial with the lead-router walkthrough.
- [ ] `ROADMAP.md` — mark phase complete; add follow-up cycles for territory + workload variants if Marcus customer asks. DELETE the routing-primitive line from "What's next" since it shipped.
- [ ] `landing/*.html` — none required for cycle 1 (not user-facing marketing yet); revisit when the variant ships. Confirm by grepping `landing/` for `if lead's size` patterns and noting that they'd be a future before/after example.
- [ ] `playground/system-prompt.md` — Meph should use this when building queue/lead/triage apps. Add the canonical form + round-robin pattern + LHS-string rule.
- [ ] `FAQ.md` — "Where does the routing primitive live?" + "How does round-robin survive a restart?" + "Why must the match value be a quoted string?"
- [ ] `RESEARCH.md` — none required (no training-signal change). No-op confirmation.
- [ ] `FEATURES.md` — new row in the language reference table. Update headline counts.
- [ ] `CHANGELOG.md` — session-dated entry describing what shipped + the lead-router migration.

## Pre-flight checklist (Section 9 equivalent)

- [ ] This plan branch (`plan/routing-primitive`) merged to `main` first — implementation cuts a new branch from a clean main
- [ ] `learnings.md` exists at project root
- [ ] Cut implementation branch `feature/routing-primitive` from `main` (NOT from `plan/routing-primitive`)
- [ ] All 8 core templates compile clean before any change (baseline): `node clear.test.js` + the 8-template smoke loop in CLAUDE.md
- [ ] All 5 Marcus apps still 52/52 in browser walker (regression baseline)
- [ ] `_clear_route_cursors` table doesn't already exist (grep `compiler.js` + `runtime/`)
- [ ] No existing `route` keyword dispatch in `parser.js` (`grep "CANONICAL_DISPATCH.set('route'" parser.js` returns nothing)
- [ ] `runtime/route-cursor.js` and `runtime/route_cursor.py` paths are free
- [ ] Tokenizer smoke-test rerun on `default round-robin across [a, b, c]` — confirms the 6-token split documented in the synonym audit (run if any tokenizer changes landed since 2026-04-29)

## Resume prompt (paste into fresh session)

> Read `plans/plan-routing-primitive-2026-04-29.md`. The plan branch `plan/routing-primitive` has been merged to main. Cut `feature/routing-primitive` from a clean `main`. Start Phase 1 cycle 1.1 — parser test for `route lead by size:` with one fixed rule (`'SMB' to alice`). Apply the session rules in `~/.claude/CLAUDE.md`. Verify current main commit with `git log --oneline -1` before starting.
