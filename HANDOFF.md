# Handoff -- 2026-04-12

## Current State
- **Branch:** `main` (merged from `feature/roadmap-1-4`)
- **Tests:** 1699 compiler (all passing), 0 failures

## What Was Done This Session

### Roadmap Items 1-4 Implemented

1. **Auth scaffolding** — `allow signup and login` one-liner that scaffolds `/auth/signup`, `/auth/login`, `/auth/me` endpoints with bcrypt password hashing, JWT tokens, and JWT middleware. Works for both JS (Express) and Python (FastAPI) backends. Uses `bcryptjs` + `jsonwebtoken` (JS) or `passlib` + `PyJWT` (Python). Auto-generates in-memory `_users` table. Existing `needs login` frontend guard still works.

2. **DB relationships** — `belongs to Users` in table declarations. Parses as FK field, compiles to `REFERENCES users(id)` in SQL. CRUD lookups auto-stitch related records via post-query `findOne` calls. `has many` deferred — syntactic sugar, FK on child table already expresses the relationship.

3. **Validation fix** — `_validate()` utility rewritten to collect ALL errors as `[{ field, message }]` array instead of returning first error as string. `compileValidate` emits `_vErrs` (plural) and `{ errors: _vErrs }` response. Python path also collects into `_errors` list before raising once.

4. **Aggregate fix** — `sum of amount in orders` now correctly compiles to `_clear_sum_field(orders, "amount")`. Parser's collection ops handler detects `in` token after operand, creates `callNode('_sum_field', [list, fieldString])`. New utilities: `_clear_sum_field`, `_clear_avg_field`, `_clear_max_field`, `_clear_min_field`. Flat array path (`sum of prices`) unchanged.

### Also Fixed
- Non-reactive web JS now tree-shakes utility functions (was missing, utilities were referenced but never defined)
- `_sum_field` etc. added to validator BUILTINS set

## Key Decisions
- **`has many` deferred** — No clear compilation target. The FK on the child table already expresses the relationship. Auto-JOIN from parent works without it.
- **Auth uses in-memory `_users` array** — No DB dependency for auth. Works with any storage backend. Production apps can swap to DB-backed storage.
- **Validation returns array, not string** — Breaking change from `{ error: string }` to `{ errors: array }`. No backward compat shim — no users yet.
- **FK stitching overwrites field** — `author` field (integer ID) gets replaced with the full related object after lookup. Simpler than maintaining both `author` and `author_id`.

## Known Issues
- `has many` not implemented — only `belongs to` works
- Auth scaffold uses in-memory storage — resets on restart
- FK stitching does N+1 queries (one per FK field per row) — fine for small datasets, will need optimization for large tables
- Python backend doesn't do FK stitching yet (only SQL REFERENCES)

## Files Changed
| File | What |
|------|------|
| `parser.js` | AUTH_SCAFFOLD node type, `belongs to` in field modifiers, `in` detection in collection ops |
| `compiler.js` | `_field` utility functions, `_validate` rewrite, `compileAuthScaffold` (JS+Python), schema tracking + FK stitching in CRUD, non-reactive JS tree-shaking |
| `synonyms.js` | `auth_scaffold` synonym, version bump to 0.16.0 |
| `validator.js` | `_sum_field` etc. added to BUILTINS |
| `clear.test.js` | 24 new tests (7 aggregate + 4 validation + 8 auth + 5 relationships) |
| `ROADMAP.md` | Items 1-4 marked complete, stats updated |
| `SYNTAX.md` | New sections: auth scaffolding, DB relationships, field extraction, validation errors |
| `CLAUDE.md` | Test count updated to 1699 |

## Resume Prompt

> Continue work on the Clear language compiler. Last session implemented roadmap items 1-4: auth scaffolding, DB relationships, validation improvements, and aggregate field extraction. Next priorities from ROADMAP.md: full text search (#5), WebSocket lifecycle events (#6), agent memory/RAG (#7), agent tool use (#8). Read ROADMAP.md for details.
