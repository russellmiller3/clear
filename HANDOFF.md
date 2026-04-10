# Clear Language — Session Handoff

_Last updated: 2026-04-09 | Branch shipped: feature/sqlite-persistence_

---

## What Was Done This Session

### Phase 47b: SQLite Persistence
Replaced the in-memory + JSON-backup database with a real SQLite file (`clear-data.db`).

**Why it matters:** Apps were losing data on restart if killed mid-write (non-atomic JSON). Now every write is immediately durable. WAL mode handles concurrent requests cleanly.

**Files changed:**
- `runtime/db.js` — full rewrite using `better-sqlite3`. Same public API.
- `runtime/package.json` — new: declares `{"type":"commonjs"}` so Node doesn't treat CJS files as ESM
- `clear-runtime/db.js` + `clear-runtime/package.json` — synced copies
- `package.json` — added `better-sqlite3 ^12.8.0`
- `compiler.js` — updated test-runner comment
- `cli/clear.js` — `clear package` now includes `better-sqlite3` in generated `package.json` + updated `.dockerignore`
- `.gitignore` — added `clear-data.db` + WAL sidecar files

### ship-plan Skill
Created a new skill that chains `write-plan` → `red-team-plan` → `execute-plan` in one shot:
- Committed to `main` at: `skills/ship-plan/SKILL.md`
- Also written to AppData for live Claude use

### Security Fix
`.env` was accidentally committed to git (API key exposed). Fixed immediately:
- Removed `.env` from the commit via amend
- Added `.env` to `.gitignore`
- **API key in `.env` should be rotated** (was committed briefly, only locally)

---

## Key Decisions

- **better-sqlite3 over node:sqlite** — user requested it explicitly. Also more stable than Node 22's experimental built-in.
- **Same API surface** — compiled server.js didn't need to change at all. `require('./clear-runtime/db')` still works.
- **WAL mode by default** — correct for Express servers. DELETE journal mode would serialize all requests.
- **Schema evolution via ALTER TABLE** — instead of dropping/recreating, which would lose data.
- **`runtime/package.json` with `{"type":"commonjs"}`** — the cleanest fix for the ESM/CJS conflict. Scoped per directory.

---

## Known Issues / Watch Out For

- **`feature/component-composition-phase52`** branch had SQLite commit accidentally applied to it during this session. Was cleaned up with `git reset --hard`. That branch now sits at main tip — it has no unique commits. If continuing component composition work, re-apply that work from `plans/plan-component-composition-phase52-04-09-2026.md`.
- **API key rotation** — `ANTHROPIC_API_KEY` was briefly committed to git (local only, not pushed). Rotate at console.anthropic.com.
- **Playground server.test.js** — accumulates data in `clear-data.db` across test runs. Unique-constraint failures possible. Delete `clear-data.db` before a clean test run.

---

## What's Next (Priority Order)

1. **Playground smoke test** — verify `clear-data.db` creates and persists across restarts in the live playground
2. **Phase 52: Component composition** — branch exists, plan at `plans/plan-component-composition-phase52-04-09-2026.md`
3. **Phase 48: Deployment polish** — `clear package` Dockerfile + fly.io / Railway one-command deploy
4. **General purpose language v1** — plan at `plans/plan-general-purpose-v1-04-09-2026.md`

---

## Resume Prompt

```
Branch: main (feature/sqlite-persistence merged)
Last session: Phase 47b SQLite persistence shipped.

runtime/db.js now uses better-sqlite3 — same API, durable storage.
clear-data.db replaces clear-data.json.
1489 tests passing.

ACTION NEEDED: Rotate the API key in .env (committed briefly to git, local only).

Continue with: Phase 52 component composition OR Phase 48 deployment polish.
```
