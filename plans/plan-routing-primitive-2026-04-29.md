# Routing Primitive — `route X by FIELD:` (Plan, 2026-04-29)

A new top-level Clear node type that compiles down to assignment logic. Today the lead-router app uses raw `if X is Y` chains. Works for fixed mapping; breaks for round-robin, territory, workload, skill-based. After this primitive, those variants drop from 50+ lines to 5.

## Phase Order (load-bearing)

**Default track:** Path A — phases 1–5 (parser → validator → JS emit → cursor runtime → docs). Ships the user-visible primitive end-to-end on the JS backend with round-robin pools persisted in SQLite.

**Escalation:** Path B — phases B-1 (Python parity), B-2 (territory lookup against an Owners table), B-3 (workload-balance variant). Path B is gated on Path A landing AND a customer asking for the variant. **Build Python Alongside JS rule** says B-1 is technically required at parity-time, not later — so B-1 is required, B-2 + B-3 are research-tier.

**Why this ordering:** ship the cheapest user-visible primitive first (round-robin + fixed mapping), prove it solves Russell's "first paying customer" lead-router custom variant, then escalate. Territory + workload + skill-based add real value but require new schema (Owners table, capacity tracking) that's overkill for the wedge demo.

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| 1 — parser + node type | A | — | required |
| 2 — validator rules | A | Phase 1 | required |
| 3 — JS compiler emit | A | Phase 1, 2 | required |
| 4 — round-robin cursor runtime | A | Phase 3 | required |
| 5 — doc cascade + 3 example apps | A | Phase 4 | required |
| B-1 — Python compiler emit | B | Phase 5 | required (cross-target parity rule) |
| B-2 — territory lookup variant | B | Phase 5 + customer ask | research-tier |
| B-3 — workload-balance variant | B | Phase 5 + customer ask | research-tier |

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
  SMB to alice
  Mid-market to bob
  Enterprise to charlie
  default round-robin across [diana, evan, frank]
```

**What each line means:**
- `route lead by size:` — for each Lead, decide assignment based on the `size` field.
- `SMB to alice` — if `size` equals `'SMB'`, assign to `'alice'`.
- `default round-robin across [diana, evan, frank]` — if no rule matches, rotate through the pool.

### Example 1 — fixed mapping only (replaces lead-router today)

```clear
when user sends lead to /api/leads:
  validate lead:
    name is text, required
    email is text, required
    size is text

  route lead by size:
    SMB to alice
    Mid-market to bob
    Enterprise to charlie
    default to alice

  new_lead = save lead as new Lead
  send back new_lead with success message
```

### Example 2 — round-robin pool for the default

```clex
when user sends lead to /api/leads:
  validate lead:
    name is text, required
    size is text

  route lead by size:
    Enterprise to charlie
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
    West to alice
    East to bob
    Central to charlie
    default round-robin across [alice, bob, charlie]

  new_lead = save lead as new Lead
```

### Phone test (read each line out loud — does a 14-year-old understand?)

| Line | Out loud | Pass? |
|------|----------|-------|
| `route lead by size:` | "Route a lead based on its size" | ✅ unambiguous |
| `SMB to alice` | "If the size is SMB, give it to Alice" | ✅ |
| `default round-robin across [a, b, c]` | "Otherwise, rotate through Alice, Bob, Charlie" | ✅ "round-robin" is a sales/ops term Marcus would know; "across" reads naturally |
| `route lead by region:` | "Route the lead based on its region" | ✅ same shape |

**Verdict:** all lines pass. The one tweak: `default to alice` (single owner) and `default round-robin across [...]` (pool) are two different shapes — the parser dispatches on whether the next token after `default` is a single bare name or `round-robin`.

## Synonym collision audit

Confirmed via `grep -n` against `synonyms.js`:

| Token | Existing use | Verdict |
|-------|--------------|---------|
| `route` | Not in synonyms.js. Used as a prop value (`with route 'X'`) but never as a top-level dispatch keyword. | Free to claim. |
| `by` | Used in expression context: `chart 'X' showing data by field`, `count by field`. Statement-context `route X by FIELD:` is unambiguous because parser dispatch happens on token[0]=`route` first. | Free at statement level. |
| `default` | Used as a struct field default: `quantity (number), default 0`. Inside an indented routing block, `default` as the first token of a line is unambiguous. | Free in this context. |
| `to` | Heavily used: `nav item 'X' to '/path'`, `send X to '/api/y'`, `belongs to`. In routing context (`SMB to alice`), it's a binary infix between value and owner. The parser already handles `to` infix in many positions; we'd add one more. | Free in this position. |
| `round-robin` | Not in synonyms.js. New token. | Add to tokenizer's multi-word phrase list (alongside `round_robin` synonym? — keep `round-robin` canonical, optional `round robin` as synonym). |
| `across` | Not in synonyms.js. Reads naturally with pool: `round-robin across [a, b, c]`. | New token, no collision. |

**Multi-word phrase parser check:** `round-robin` needs the tokenizer to either (a) treat `round-robin` as a single token (hyphen-aware), or (b) match `round` followed by `-` followed by `robin`. Existing tokenizer rules: hyphens inside identifiers are allowed in some contexts (e.g. `app-slug` URL prop values) but not as a general identifier rule. **Decision:** treat `round-robin` as a special-cased multi-word keyword, recognized by the routing parser's body loop only. Avoids tokenizer churn. Phase 1 cycle 1 confirms the token sequence inspection works.

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
- If `tokens[0]` is `default`: parse a default rule.
- Otherwise: try to match `<value> to <owner>` (single owner) or `<value> round-robin across [<pool>]` (rare per-value pool).

**Hard-fail on unknown body lines** — same pattern as queue's F1 (added 2026-04-28). Unknown line → friendly error pointing at the canonical forms.

**Hard-fail conditions:**
- Missing `by` after entity name → "route needs 'by'. Example: route lead by size:"
- Missing field name → "route needs a field. Example: route lead by size:"
- Empty body → "route block needs at least one rule. Example: SMB to alice"
- Multiple `default` rules → "only one default allowed per route block"
- `round-robin across []` (empty pool) → "round-robin needs a non-empty pool: [alice, bob, ...]"

## Validator rules (Phase 2)

Three checks, all warnings (not errors — the program still compiles). Pattern matches the queue primitive's validator hooks.

| Rule | Trigger | Message | Why |
|------|---------|---------|-----|
| `ROUTE_FIELD_NOT_ON_ENTITY` | `route lead by FIELD:` where `FIELD` doesn't appear in the `Leads` table definition | "Route field 'FIELD' isn't on the Leads table. Add it to the table or use one of: name, email, size, source, ..." | Catches typos. The most common mistake. |
| `ROUTE_NO_DEFAULT` | route block has no `default` rule | "Route block has no default. If lead's FIELD doesn't match any rule, no owner gets assigned. Add `default round-robin across [...]` or `default to <owner>`." | Without a default, unmatched values silently leave `assigned_to` unset. |
| `ROUTE_UNREACHABLE_RULE` | rule appears after `default` | "Rule '<value> to <owner>' appears after default. The default catches everything; this rule never fires." | Author probably reordered by accident. |

**Skip:** owner-name validation. The owners are loose strings (`alice`, `bob`) — there's no Owners table primitive yet. Future `route ... by ... using Owners` can validate against an Owners table. Out of scope for cycle 1.

## JS compiler emit (Phase 3)

**Statement-level form:** `route lead by size:` inside an endpoint compiles to a statement block that mutates `lead.assigned_to`. The block is inline JS — no helper call for the fixed-mapping path, a tiny helper call for the round-robin path.

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
    routeId: 'route_42_lead_by_size',  // stable id from line + entity + field
    pool: ['alice', 'bob', 'diana', 'evan'],
  });
}
```

**Stable route id** = `'route_' + line + '_' + entity + '_by_' + field` — same shape as `stableUatId` (used by the UAT contract). Stable across rebuilds so the cursor table doesn't lose state on recompile.

**`_clear_route_cursors` table emit:** the compiler adds the table once per app — first time any `route ... default round-robin ...` block appears in the source. Dedupe via `ctx._clearRouteCursorsEmitted` flag (same trick queue uses for the email queue table).

**Endpoint side-effect — none in cycle 1.** The route block mutates the variable in place; `save lead as new Lead` (already in scope) writes the assigned owner to the row. No magic injection.

## Python compiler emit (Phase B-1, parity-required)

Mechanical port of the JS branch. Same shape:

```python
# clear:N — route lead by size
_v = lead.get('size')
if _v == 'SMB':            lead['assigned_to'] = 'alice'
elif _v == 'Mid-market':   lead['assigned_to'] = 'bob'
elif _v == 'Enterprise':   lead['assigned_to'] = 'charlie'
else:                      lead['assigned_to'] = 'alice'
```

**Round-robin default:** Python helper `_clear_route_pick(route_id, pool)` lives in the same runtime module that ships the JS one. Same SQLite cursor table.

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
  // Atomic read-modify-write: increment cursor, pick pool[(cursor) % pool.length].
  const row = db.queryFirst('SELECT last_index FROM _clear_route_cursors WHERE route_id = ?', [routeId]);
  const next = ((row?.last_index ?? -1) + 1) % pool.length;
  db.exec('INSERT INTO _clear_route_cursors (route_id, last_index, updated_at_date) VALUES (?, ?, ?) ON CONFLICT (route_id) DO UPDATE SET last_index = ?, updated_at_date = ?',
    [routeId, next, new Date().toISOString(), next, new Date().toISOString()]);
  return pool[next];
}
```

**Concurrency:** SQLite WAL mode (already on in Clear's runtime) serializes the write. Two simultaneous lead inserts can't both pick `pool[0]` — the second one sees the updated cursor.

**Python sibling:** `runtime/route_cursor.py` — same shape, `db.execute` instead of `db.exec`, same SQLite table.

**Cross-target parity (PHILOSOPHY Rule 17):** the cursor table name + helper signature are identical on JS and Python. A program that compiles round-robin under either target reads from the same `_clear_route_cursors` rows.

## TDD cycles per phase

### Phase 1 — parser + node type
- **Cycle 1.1:** parser test — `route lead by size:` with one fixed rule produces the expected AST. Red → green via new `parseRouteDef` + `CANONICAL_DISPATCH.set('route', ...)`.
- **Cycle 1.2:** all hard-fail conditions (missing `by`, empty body, multiple defaults, etc.) produce the right error messages.
- **Cycle 1.3:** `default round-robin across [a, b, c]` parses into the right AST shape.
- **Cycle 1.4:** plural input (`route leads by size:`) singularizes to the same shape (queue F2 pattern).

### Phase 2 — validator rules
- **Cycle 2.1:** `ROUTE_FIELD_NOT_ON_ENTITY` warning fires when field isn't on the table.
- **Cycle 2.2:** `ROUTE_NO_DEFAULT` warning fires when block has no default.
- **Cycle 2.3:** `ROUTE_UNREACHABLE_RULE` warning fires when a rule comes after default.

### Phase 3 — JS compiler emit
- **Cycle 3.1:** Example 1 compiles to the expected if/else chain.
- **Cycle 3.2:** Example 2 compiles to if/else + `await _clear_route_pick(...)` for the round-robin default.
- **Cycle 3.3:** the cursor table emits exactly once per app even with multiple route blocks.
- **Cycle 3.4:** all 8 core templates + 5 Marcus apps still compile clean (no regressions).

### Phase 4 — round-robin cursor runtime
- **Cycle 4.1:** runtime helper picks `pool[0]` on first call, `pool[1]` second, wraps to `pool[0]` after `pool.length`.
- **Cycle 4.2:** survives restart — two helper calls with a process restart between them produce sequential picks.
- **Cycle 4.3:** concurrent calls don't collide (two near-simultaneous picks return different owners).

### Phase 5 — doc cascade + 3 example apps
- Update lead-router to use the new primitive (the demo app for the wedge).
- Update the deal-desk and approval-queue apps with `route` blocks where they make sense (optional — only if the variant is more legible than the existing if-chain).
- Doc cascade per the list below.

### Phase B-1 — Python parity
- **Cycle B-1.1:** Python emit for fixed-mapping case.
- **Cycle B-1.2:** Python emit for round-robin default.
- **Cycle B-1.3:** `runtime/route_cursor.py` matches the JS helper's behavior on a Python smoke test.

## Doc cascade list (Phase 5)

Per the project rule, all eleven surfaces:

- [ ] `intent.md` — new `ROUTE_DEF` row in the spec table.
- [ ] `SYNTAX.md` — section with the canonical example + round-robin variant.
- [ ] `AI-INSTRUCTIONS.md` — when to use `route X by field` vs an if-chain. Convention: prefer the primitive whenever there are 2+ branches and a fallback.
- [ ] `USER-GUIDE.md` — tutorial with the lead-router walkthrough.
- [ ] `ROADMAP.md` — mark phase complete; add follow-up cycles for territory + workload variants if Marcus customer asks.
- [ ] `landing/*.html` — none required for cycle 1 (not user-facing marketing yet); revisit when the variant ships.
- [ ] `playground/system-prompt.md` — Meph should use this when building queue/lead/triage apps.
- [ ] `FAQ.md` — "Where does the routing primitive live?" + "How does round-robin survive a restart?"
- [ ] `RESEARCH.md` — none required (no training-signal change).
- [ ] `FEATURES.md` — new row in the language reference table.
- [ ] `CHANGELOG.md` — session-dated entry.

## Pre-flight checklist (Section 9 equivalent)

- [ ] `learnings.md` exists at project root
- [ ] Branch named `feature/routing-primitive`
- [ ] All 8 core templates compile clean before any change (baseline)
- [ ] `_clear_route_cursors` table doesn't already exist (grep `compiler.js` + `runtime/`)
- [ ] No existing `route` keyword dispatch in `synonyms.js` or `parser.js` (re-verify)

## Resume prompt (paste into fresh session)

> Read `plans/plan-routing-primitive-2026-04-29.md`. Cut `feature/routing-primitive` from `main`. Start Phase 1 cycle 1.1 — parser test for `route lead by size:` with one fixed rule. Apply the session rules in `~/.claude/CLAUDE.md`. Current main commit: `b8e7d92`.
