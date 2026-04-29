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
