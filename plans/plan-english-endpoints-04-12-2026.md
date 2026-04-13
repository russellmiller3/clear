# Plan: Plain English Endpoint Syntax

**Date:** 2026-04-12
**Branch:** `feature/english-endpoints`
**Status:** Red-teamed and patched (1 P0, 5 P1/P2 resolved)

## Problem

Endpoint syntax uses HTTP jargon that fails the 14-year-old test:
```clear
when user calls GET /api/todos:
when user calls POST /api/todos sending data:
when user calls PUT /api/todos/:id sending data:
when user calls DELETE /api/todos/:id:
```

"Calls GET" means nothing in English. GET, POST, PUT, DELETE are implementation details.

## New Syntax

```clear
when user requests data from /api/todos:
when user sends new_post to /api/todos:
when user updates post at /api/todos/:id:
when user deletes post at /api/todos/:id:
```

Four verbs, four prepositions, zero jargon:
- **requests...from** → GET (data flows FROM server)
- **sends...to** → POST (data flows TO server)
- **updates...at** → PUT (data modified AT location)
- **deletes...at** → DELETE (data removed AT location)

Old syntax stays as silent synonyms — nothing breaks.

## Detection Patterns

| Pattern | Method | Variable | Path |
|---------|--------|----------|------|
| `requests data from PATH` | GET | none | PATH |
| `sends VAR to PATH` | POST | VAR | PATH |
| `updates VAR at PATH` | PUT | VAR | PATH |
| `deletes VAR at PATH` | DELETE | VAR (ignored) | PATH |

For DELETE, the word between "deletes" and "at" is descriptive flavor text (e.g., "post", "todo") — not a receiving variable. DELETE requests don't have bodies.

## Implementation

### Phase 1: Parser Changes (TDD)
**Files:** `parser.js`, `synonyms.js`, `clear.test.js`

#### Step 1: Add synonyms

In `synonyms.js`, add new multi-word synonyms that map to `when_user_calls`:
```js
'when user requests': 'when_user_calls',
'when user sends': 'when_user_calls',
'when user updates': 'when_user_calls',
'when user deletes': 'when_user_calls',
```

These cause the tokenizer to produce the same dispatch token as `when user calls`, so `parseEndpoint()` gets called.

Bump `SYNONYM_VERSION`.

#### Step 2: Modify parseEndpoint()

Currently (line 6180-6235), `parseEndpoint()`:
1. Reads raw source line
2. Extracts method from first word after keyword
3. Extracts path
4. Looks for `sending/receiving VAR` suffix

New logic: after the keyword token, check if the raw line matches the new patterns:

```
Pattern 1: "requests data from PATH"
  → method = GET, path = PATH, receivingVar = null

Pattern 2: "sends VAR to PATH"
  → method = POST, path = PATH, receivingVar = VAR

Pattern 3: "updates VAR at PATH"
  → method = PUT, path = PATH, receivingVar = VAR

Pattern 4: "deletes WORD at PATH"
  → method = DELETE, path = PATH, receivingVar = null
```

#### Red-Team Fixes Applied

| Issue | Fix |
|-------|-----|
| P0: parseEndpoint() checks method token BEFORE raw-line regex — new patterns never reached | Restructure: check raw line for new verb patterns FIRST, return early. Old method-token logic becomes the fallback. |
| P1: "data from" collides with `data_from` synonym in tokenizer | Use raw line parsing (not tokens) for new patterns. The raw line is unaffected by tokenizer synonym resolution. |
| P2: Path regex captures trailing colon | Add `.replace(/:$/, '')` to captured path |
| P1: "when user delete" (without s) won't match 3-word synonym, "delete" consumed as `remove` | Only register "when user deletes" (with s). Document that the verb must be conjugated. |

Detection approach: **Raw line regex BEFORE any token inspection.** The function must check the raw source line for the new patterns and return early, bypassing the existing method-token logic entirely.

```js
// At the TOP of parseEndpoint(), before any token inspection:
const rawLine = this.source.split('\n')[line - 1].trim().replace(/:$/, '');

// New English verb patterns — check these FIRST
const getMatch = rawLine.match(/^when user requests data from\s+(\/\S+)/i);
if (getMatch) {
  return endpointNode('GET', getMatch[1].replace(/:$/, ''), null, body);
}
const postMatch = rawLine.match(/^when user sends\s+(\w+)\s+to\s+(\/\S+)/i);
if (postMatch) {
  return endpointNode('POST', postMatch[2].replace(/:$/, ''), postMatch[1], body);
}
const putMatch = rawLine.match(/^when user updates\s+(\w+)\s+at\s+(\/\S+)/i);
if (putMatch) {
  return endpointNode('PUT', putMatch[2].replace(/:$/, ''), putMatch[1], body);
}
const delMatch = rawLine.match(/^when user deletes\s+\w+\s+at\s+(\/\S+)/i);
if (delMatch) {
  return endpointNode('DELETE', delMatch[1].replace(/:$/, ''), null, body);
}

// FALLBACK: existing GET/POST/PUT/DELETE method-token parsing
// (unchanged — handles old syntax)
```

This bypasses the token-based method check entirely for the new patterns.

#### Step 3: Update error messages

Update the hints at lines 2692-2695 and 6187 to show the new canonical syntax:
```
"The endpoint needs a verb — use 'requests data from', 'sends X to', 'updates X at', or 'deletes X at'..."
```

**Tests:**
```
T1: "when user requests data from /api/todos:" parses as GET /api/todos
T2: "when user sends new_post to /api/todos:" parses as POST /api/todos with receivingVar=new_post
T3: "when user updates post at /api/todos/:id:" parses as PUT /api/todos/:id with receivingVar=post
T4: "when user deletes post at /api/todos/:id:" parses as DELETE /api/todos/:id (no receivingVar)
T5: old syntax "when user calls GET /api/todos:" still works (no regression)
T6: old syntax "when user calls POST /api/todos sending d:" still works
T7: full app with new syntax compiles with 0 errors
T8: new syntax endpoints produce correct compiled server.js
```

**Gate:** `node clear.test.js` passes

### Phase 2: Update Templates and Examples
**Files:** All .clear files in `apps/`, `templates/`, docs

Update the canonical examples in docs and templates to use the new syntax. The old syntax stays working but docs should show the new way.

Key files to update:
- `PHILOSOPHY.md` — canonical vocabulary table
- `AI-INSTRUCTIONS.md` — endpoint examples
- `SYNTAX.md` — endpoint reference
- `USER-GUIDE.md` — all endpoint examples in tutorials
- `intent.md` — ENDPOINT node spec
- `.claude/skills/write-clear/SKILL.md` — Meph's endpoint patterns
- Template .clear files (core 7 + others)

**Gate:** All docs show new syntax as canonical, old syntax mentioned as "also works"

### Phase 3: Update Compiler Error Messages
**Files:** `compiler.js`, `parser.js`

Any error message that references `when user calls GET/POST/PUT/DELETE` should be updated to show the new syntax.

**Gate:** `node clear.test.js` passes

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Synonym collision with existing "sends" | Medium | "sends" alone is a synonym for `respond`. "when user sends" is 3 words — longest-match greedy should pick it up first. Test this. |
| "deletes" collides with `delete` (CRUD synonym for `remove`) | Medium | "when user deletes" is 3 words — won't match single-word "delete" synonym. Test. |
| "requests" collides with `log every request` | Low | "when user requests" is 3 words, "request" is 1 word. No collision. |
| "updates" collides with database migration `update database:` | Medium | "when user updates" is 3 words. "update" alone is for migrations. Test. |
| Raw line parsing misses colon at end | Low | Strip trailing colon before regex match |
| Path with query params or complex routes | Low | Regex `\/\S+` captures everything after the preposition until whitespace |
