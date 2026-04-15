---
name: red-team-code
description: Use when stress-testing code AFTER it has been written and compiles. Trigger when user says "/rt", "/red-team-code", "red team this code", "rt this", "review this code", or proactively after writing non-trivial code (50+ lines, new endpoints, new compiler passes, new tools). Distinct from red-team-plan which reviews markdown plans before coding. This skill reviews the actual implementation for security holes, race conditions, edge cases, broken contracts, violations of CLAUDE.md rules, and dead/duplicated code. Fixes findings directly, never asks permission.
---

# Red Team Code

**Announce:** "I'm using the red-team-code skill to stress-test [file/feature]."

## Core Philosophy

Red-team-code ATTACKS real code that already compiles. It assumes the code "works" in the happy path — its job is to find every way that's a lie. It finds holes AND fixes them. No "want me to fix this?" — just fix it.

**Golden rule: if you write "consider adding X" or "you should fix Y" without actually doing it, you failed.**

This skill is distinct from `red-team-plan`:
- `red-team-plan` reviews markdown plans BEFORE code is written
- `red-team-code` reviews code AFTER it's written and compiles

---

## Step 0: Scope Check

Before attacking, figure out what "the code" refers to:

| Situation | Action |
|-----------|--------|
| User just wrote code and invoked `/rt` | Review the last changed files (check `git diff`) |
| User pointed at a specific file or function | Review that exact target |
| User said "red team this whole feature" | Review all files touched in the current branch vs main |
| No recent code changes | Ask what to review — don't invent scope |

Skip if the diff is <30 lines of boring boilerplate. Tell the user it's too small to warrant a review.

---

## Step 1: Read Everything

1. `git diff main...HEAD` — understand what changed
2. Read every changed file in full (not just the hunks — context matters)
3. Read CLAUDE.md for project rules you'll be checking against
4. Read any test file associated with changed code
5. If new API endpoints or tools: read their callers
6. If new compiler pass: read `intent.md` and related parser/compiler sections

---

## Step 2: Attack Checklists (run every applicable one)

### 🔒 Security
- **Injection:** Every string concat into SQL, shell, HTML, or eval'd code. Use parameterization or escape.
- **XSS:** Every user input rendered into HTML without escaping. `innerHTML` with untrusted data is always wrong.
- **Command injection:** Every `execSync` / `spawn` with user-derived arguments. Whitelist, don't blacklist.
- **Path traversal:** Every file path built from user input. Must normalize + validate against allowed root.
- **Missing auth:** Every new endpoint. Does it require login when it should? Are admin routes gated?
- **Secret leakage:** Env vars, API keys, passwords echoed to logs, error messages, or client responses.
- **CSRF:** State-changing endpoints should require same-origin or token.
- **Rate limiting:** Public endpoints without rate limits invite abuse.
- **Open redirects:** `res.redirect(req.query.to)` with no validation.
- **Prototype pollution:** `Object.assign(target, JSON.parse(userInput))` without sanitization.

### ⚡ Race Conditions & Concurrency
- **Double-click / double-submit:** UI buttons that trigger state mutations. Disable on click.
- **TOCTOU:** Check-then-act patterns. `if (exists) write()` — someone else may write between.
- **Shared mutable state:** Module-level vars updated from multiple request handlers.
- **Mutex correctness:** If the code uses a mutex, is the critical section actually protected? Do errors release the lock?
- **Promise leaks:** `async` operations started but not awaited. Results land after the caller's gone.
- **Event handler cleanup:** `addEventListener` without matching `removeEventListener` on destroy.

### 🎯 Edge Cases
- **Empty collections:** `[]`, `{}`, `""`, `null`, `undefined`. Does the code handle all five?
- **Boundary values:** `0`, `-1`, `Infinity`, `NaN`, `Number.MAX_SAFE_INTEGER + 1`.
- **Huge inputs:** Text fields with 10,000+ chars. Arrays with 1M items. Files with 100MB+.
- **Unicode:** Emoji, RTL text, combining chars, zero-width joiners. Does it break display or validation?
- **Malformed input:** Not-JSON in JSON body. Wrong Content-Type. Missing required fields.
- **Network failures:** What if the upstream API returns 500? Times out? Returns a different shape?
- **Stale data:** Cached response after the source changed. Version mismatch between client + server.
- **First run vs nth run:** Does it handle an empty DB? A migration in progress?

### 🔌 Contract Breaks
- **Breaking API changes:** Did you change a response shape? Who consumes it? Check all callers.
- **Breaking function signatures:** New required arg means every caller breaks. Make it optional or update all.
- **Removed exports:** `git grep` for the old name before deleting.
- **Test coverage regressions:** Did the new code break any existing tests? Did new tests actually run?
- **Missing test for the new code:** Every new public function / endpoint needs at least one test.

### 🧹 Code Quality
- **Dead code:** Unreachable branches. Unused imports. Unused parameters. Variables written but never read.
- **Duplicated logic:** Same function body in 3 places. Extract or keep in-line consistently.
- **Orphaned comments:** Comments describing behavior that no longer matches the code.
- **TODO / FIXME / XXX:** Real ones need tickets. Stale ones need deletion.
- **Magic numbers:** `if (status === 7)` without a named constant. Name it.
- **Inconsistent naming:** `userId` in one file, `user_id` in another. Pick one per language's convention.
- **Error handling:** `try { … } catch {}` that swallows the error. Log it, rethrow it, or explain why you ignore it.

### 📜 Project Rules (CLAUDE.md)
Read the project CLAUDE.md. For EVERY rule in it, check whether the new code complies. Common Clear-specific checks:

- **14-year-old test:** Can a curious 14-year-old read the .clear source? No jargon ("async", "coroutine", "mutation")?
- **Plain-English comments in .clear:** No compiler/CS terms in `/* */` blocks
- **One operation per line:** Named intermediates, no chaining, no nesting
- **No self-assignment:** No `x is x`. Arg names must differ from field names in records.
- **Documentation rule:** New features MUST be documented in intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, ROADMAP.md, relevant landing pages, and playground/system-prompt.md.
- **No external dependencies:** Compiler must stay zero-npm. Did the change add a dep?
- **Test before declaring done:** Compiler tests passing does NOT mean the app works. Did you run `clear test` on affected apps?
- **TOC rule:** Did you add/remove/move a section in parser.js or compiler.js? Did the TOC at top of file get updated?

If the project's CLAUDE.md has rules not listed here, read them and check too. Never skip CLAUDE.md.

### 🧪 Test Quality
- **Tests that always pass:** Assertions with tautologies (`expect(true).toBe(true)`). Assertions against mocks that never fire.
- **Tests with no assertions:** The function runs without throwing but nothing is checked.
- **Flakiness:** Time-dependent tests (`setTimeout`, wall-clock). Order-dependent tests (shared state).
- **Mocked reality:** If the mock's shape differs from production shape, the test proves nothing.

---

## Step 3: Fix First, Report Second

**Every finding gets fixed immediately.** Never "recommend" a fix. Never ask permission.

Exceptions (flag as BLOCKED instead of fixing):
- Architectural redesign needed (more than 2 files of non-trivial change)
- Design decision required (e.g. "should this endpoint require auth?" when the intent isn't obvious)
- Breaking change that needs user sign-off

For everything else: make the edit.

After fixing, run the relevant test suite to verify no regression:
- Compiler changes: `node clear.test.js`
- Server changes: `node playground/server.test.js`
- App changes: `node cli/clear.js test <file>`
- If dev-server-observable: start the server and use `preview_*` tools to confirm

---

## Step 4: Attack Report (BLUF-styled)

Report back using the BLUF rules in the user's CLAUDE.md:

**TL;DR bullets:**
- What you reviewed (file + line count)
- How many issues you found + how many you fixed
- The single biggest risk still open (if any)

**Then prose sections:**
- **🔴 Critical fixed** — security / data loss / broken contract. One bullet per fix. Plain English.
- **🟡 Moderate fixed** — bugs that'd bite in production. One bullet each.
- **🟢 Minor fixed** — code quality, dead code, stale comments.
- **⚠️ Still open** — anything BLOCKED. Why it's blocked. What decision's needed.

**Last line:** an opinionated next move. Tests pass? Ship it. Tests broken? Fix that first. Still smelling bad? Name the smell + what to do.

---

## What This Skill Does NOT Do

- Doesn't review plans — that's `red-team-plan`
- Doesn't refactor for style preferences — only factual issues
- Doesn't add features the code was missing from scope — only plugs holes in what's there
- Doesn't run if there's no code to review — tells the user to write some first
