# Plan — Text-Routing Primitives (Replace `runtime grammar` / `frame` / `on match`)

**Date:** 2026-05-14
**Branch:** `feature/text-routing-primitives`
**Scope:** Rip out `runtime grammar 'X':` / `frame Y:` / `on match:` / `effect internal|external`. Replace with normal-Clear-shaped primitives that pass the 14-year-old test.

---

## Why this exists

Russell, after walking through what `frame X:` and `on match:` actually do:

> "if 'handler' is a function, shouldn't we just call it a function? ... What makes that hard to read is `when user sends text: search for text in Commands by phrase or synonyms` — need a STRONGLY ENFORCED HOOK for you and Meph to always name variables with the function or use they relate to, not what they literally are."

And:

> "Why not create a commands table explicitly ... and THEN we can add new syntax if you want to add in explicit rows: `with rows: {function: OPEN_NOTEPAD, ...}`. So basically we define the shape of the table and also prefill it."

The current `runtime grammar 'X': frame Y:` shape fails the 14-year-old
test. "Grammar" means commas-and-tenses to most readers. "Frame" is CS
jargon. "Effect internal vs external" is a magic-driving category field.
"On match" is a one-off block-form for a thing that's just a function.

Replacement: normal tables, normal functions, three small generic
primitives. Everything reads top-to-bottom.

---

## The new shape (canonical)

```clear
# Data: a normal table with starter rows.
create a Commands table:
  function is text     # name of the function to call when this row matches
  phrase               # convention: phrase => text (no `is text` needed)
  synonyms is list

  with rows:
    {function: OPEN_NOTEPAD,    phrase: 'open notepad',    synonyms: ['launch notepad', 'fire up notepad']}
    {function: OPEN_CALCULATOR, phrase: 'open calculator', synonyms: ['open calc', 'launch calc']}
    {function: LOCK_SCREEN,     phrase: 'lock screen',     synonyms: ['lock my screen']}

# Dispatcher: a normal endpoint that uses the new search + dispatch primitives.
when user sends command:
  search for command in Commands by phrase or synonyms
  if there's a match:
    call function match's function with command
  if no match:
    send back 'I do not know that one yet'

# Functions: normal top-level callables. One per command.
define function OPEN_NOTEPAD(command):
  approval_count = count of records in OpenNotepadApprovals
  if approval_count is less than 3:
    ask user to confirm 'Open Notepad?'
    save {mode: 'manual'} as a new OpenNotepadApproval
  else:
    save {mode: 'auto'} as a new OpenNotepadApproval
    run command 'notepad.exe'
  send back 'opened'

define function OPEN_CALCULATOR(command): ...
define function LOCK_SCREEN(command): ...
```

---

## Primitives to add

### P1. `search for X in TABLE by FIELD or FIELD`

A generic text-prefix-match-over-table primitive. Returns the first
matching row or nothing. Match logic: text starts with the canonical
field value, OR text starts with any element of the synonyms-list
field (when `or FIELD` names a list column).

**Parser:** new `SEARCH_FOR` node type. Syntax:
```
search for <expr> in <Table> by <field> [or <field> [or <field>]]
```

The result binds an implicit `match` variable usable in the next
`if there's a match:` / `if no match:` block.

**Compiler emit (JS backend):**
```js
const _searchInput = String(<expr>).toLowerCase();
let match = null;
for (const _row of await db.findAll('Commands')) {
  const _phrase = String(_row.phrase || '').toLowerCase();
  if (_searchInput.startsWith(_phrase)) { match = _row; break; }
  const _synonyms = Array.isArray(_row.synonyms) ? _row.synonyms : [];
  for (const _syn of _synonyms) {
    if (_searchInput.startsWith(String(_syn).toLowerCase())) { match = _row; break; }
  }
  if (match) break;
}
```

**Python parity:** equivalent loop.

### P2. `if there's a match:` / `if no match:`

Conditional binding over the result of the most recent `search for`.
Two block-form branches, both optional but at least one required.

**Parser:** new `MATCH_CONDITIONAL` node type. Parses two sub-blocks
keyed by `there's a match` / `no match`.

**Compiler emit:**
```js
if (match) { /* match-block */ } else { /* no-match-block */ }
```

### P3. `call function NAME with ARGS`

Runtime function dispatch by string. `NAME` is an expression that
evaluates to a function name (typically `match's function` after a
`search for`).

**Parser:** new `CALL_FUNCTION` node type.

**Compiler emit:**
```js
const _fnName = <NAME>;
const _fn = _userFunctions[_fnName];
if (typeof _fn !== 'function') throw new Error('No function named ' + _fnName);
return await _fn(<args>);
```

Functions registered at module top level via the new `function NAME
receiving X:` declaration (see P4) auto-register into `_userFunctions`.

### P4. (DROPPED — Clear already has functions)

**Caught 2026-05-14 by the dry-check hook:** Clear's existing
`define function NAME(arg):` (parser.js:549, documented at
intent.md:37, SYNTAX.md:247, USER-GUIDE.md:556) is the right primitive.
No new keyword needed. The text-routing plan uses the existing syntax
everywhere it shows a function declaration.

What `define function NAME(arg):` already supports:
- multiple params: `define function add(a, b):`
- typed params: `define function add(a is number, b is number):`
- return type: `define function label(name is text) returns text:`
- recursion depth limit: `define function walk(n) max depth 1000:`

For the text-routing flow, the simple form `define function
NAME(command):` is enough. The dispatcher (P3 below) calls them by
string name.

**What P3 needs from the existing `define function` emit:** the
compiled function must be registered into a string-keyed lookup table
so `call function NAME with ARGS` can find it. Today's emit produces
`async function NAME(...) { ... }` at module scope. To enable
dispatch-by-name, we add ONE line at compile time per function-def:
`_userFunctions['NAME'] = NAME;` — a tiny extension to the existing
`define function` compiler path, not a new primitive.

### P5. `with rows:` block on `create a TABLE`

In-source row seeding. Lives at the bottom of a `create a TABLE`
declaration as a final block.

**Parser:** extend the existing `create a TABLE` parser to recognize a
trailing `with rows:` block. Each indented child line is a row literal
(`{field: value, field: value, ...}`).

**Compiler emit:** at module top-of-server, after table createTable
calls, emit one `db.insert(TABLE, ROW)` per row.

### P6. Convention-over-config field types

A name-to-type lookup in the parser. When a field is declared as just
`<name>` with no `is <type>`, the parser fills in the type from the
table. Override always available via explicit `is <type>`.

| Field name pattern | Default type |
|---|---|
| `phrase`, `name`, `first name`, `last name`, `address`, `email`, `title`, `description`, `notes`, `summary` | `text` |
| `number`, `count`, `age`, `quantity`, `phone`, `phone number`, `zip`, `zip code` | `number` |
| `price`, `cost`, `amount`, `total`, `subtotal`, `discount`, `tax`, `fee` | `number` formatted as dollars |
| `at`, `created_at`, `updated_at`, `due_at`, `started_at`, `finished_at` | `timestamp` |
| `is_active`, `is_done`, `is_archived`, `enabled`, `disabled` | `boolean` |

`list` fields stay explicit (uncommon enough that magic-mapping costs more than it saves).

---

## Rip-outs (same commit)

Remove without leaving a soft-keep:

- `runtime grammar 'X':` — `RUNTIME_GRAMMAR` node type, parser function, compiler emit, `runtime/grammar-matcher.js`, `runtime/grammar_matcher.py`
- `frame Y:` — `GRAMMAR_FRAME` node type, `parseGrammarFrame`, all clauses (`effect`, `canonical phrase`, `synonyms`, `slots`, `permission scope`, `first N runs require confirm`, `on match`)
- `GRAMMAR_MATCH_CALL` node type and emit
- `match X against 'name'` syntax
- `runtime-grammar.test.js` (25 tests covering the removed primitives)

---

## Doc cascade (same commit)

11-surface cascade per Clear's CLAUDE.md:
- `intent.md` — remove RUNTIME_GRAMMAR / GRAMMAR_FRAME / GRAMMAR_MATCH_CALL rows; add SEARCH_FOR / MATCH_CONDITIONAL / CALL_FUNCTION / FUNCTION_DEF / TABLE_WITH_ROWS rows
- `SYNTAX.md` — replace the runtime-grammar section with the text-routing section
- `AI-INSTRUCTIONS.md` — Meph reads this; update with the new shape and a worked example
- `USER-GUIDE.md` — rewrite Chapter 19c (or wherever runtime grammar lived) to the new shape
- `FAQ.md` — "How do I build a chat command app?" answer rewritten
- `FEATURES.md` — replace the runtime-grammar row with text-routing rows
- `ROADMAP.md` — mark the Lenat-in-Clear Phase 1 ripout + the new primitive phase
- `PHILOSOPHY.md` — drop the "Acknowledged §1:1 exceptions" entry for runtime grammar (no longer an exception, it's gone)
- `studio/system-prompt.md` — Meph learns the new shape
- `landing/*.html` — search for any runtime-grammar example; replace with text-routing
- `CHANGELOG.md` — session entry

---

## Lenat-Clear migration

`Lenat-clear/concepts.clear` collapses from 474 lines of nested frame
blocks to roughly:

- One `create a Concepts table` with `with rows:` (20 rows for the seed concepts)
- 20 small `function X receiving command:` blocks (one per concept's action)
- The dispatcher endpoint shared with the rest of the Lenat app

Expected new size: ~80-100 lines. Russell can teach new commands at
runtime via a normal `save {function: X, phrase: Y, synonyms: Z} as a
new Concept` row insert; the function still needs to exist in source,
which is correct (LLM-drafted concept goes through Russell's approval +
code change anyway).

---

## Test plan

1. **P1 search:** parse + match + no-match cases, JS + Python parity, with both single-field and `or`-multi-field shapes.
2. **P2 conditional:** match-only block, no-match-only block, both blocks, neither (validator error).
3. **P3 dispatch:** static name, dynamic name from a record, missing function (runtime error with clear message).
4. **P4 function:** declaration + call + nested-call + parameter passing.
5. **P5 with rows:** zero rows, one row, many rows, schema-mismatch row (validator error).
6. **P6 convention types:** every name in the table → expected default; explicit override; unknown name → no default applied.

Integration tests:
- Mini chat app (5 commands, 5 functions, dispatcher) compiles + serves + routes correctly.
- Lenat-clear migration: every Node Lenat behavioral test passes against the new shape.

---

## Phase order (load-bearing)

1. Variable-naming hook (DONE — `~/.claude/hooks/name-by-use.mjs`)
2. `function NAME receiving X:` parser + compile (P4) — simplest, lays the ground for P3
3. `call function NAME with ARGS` parser + compile (P3) — depends on P4
4. `search for X in TABLE by FIELD or FIELD` parser + compile (P1)
5. `if there's a match: / if no match:` parser + compile (P2) — depends on P1
6. `with rows:` block parser + compile (P5)
7. Convention-over-config field types (P6)
8. Rip out runtime grammar / frame / on match (parser + compiler + runtime helpers + 25 tests)
9. Migrate Lenat-clear `concepts.clear` to the new shape
10. Full 11-surface doc cascade
11. Pre-push gate (Playwright + Meph eval)

---

## Time estimate (AI-time)

| Phase | LOC | Time |
|---|---|---|
| P4 function def | ~100 | 2-3 min |
| P3 call function | ~80 | 2 min |
| P1 search | ~150 | 3-5 min |
| P2 match conditional | ~100 | 2-3 min |
| P5 with rows | ~100 | 2-3 min |
| P6 convention types | ~60 | 1-2 min |
| Rip-outs | ~500 LOC removed + 25 tests | 5-10 min |
| Lenat-clear migration | ~80 new lines, 474 removed | 5-10 min |
| Doc cascade | ~200 LOC across 11 surfaces | 10-15 min |
| Pre-push + smoke | n/a | 5 min |

**Total: 35-60 AI-minutes. Single focused session.**

---

## What this unlocks beyond Lenat

- **LLM tool dispatch** — every agent app routes incoming `{tool: 'X', args: ...}` via `call function tool with args`. No more switch chains.
- **Plugin / extension systems** — custom rules / validators / handlers live in tables; the app dispatches by name.
- **Lookup-driven apps** — CRM categories, e-commerce taxonomies, helpdesk topic routing all use search-for-X-in-table.
- **Shorter templates** — `with rows:` collapses every `on app start: save X as new Y;` boilerplate.
- **Plain reading** — every line traces 1:1 to one emit, every variable name describes its role, every keyword a 14-year-old can say out loud.
