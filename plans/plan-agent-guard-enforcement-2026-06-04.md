# Plan — Agent security-guard enforcement (outgoing allowlist + sensitive-field filter)

**Date:** 2026-06-04
**Branch:** `feature/agent-guard-enforcement`
**North star:** first paying Marcus customer — the regulated-tier pitch sells *provable* AI-assistant safety.

## The problem (traced 2026-06-04)

Two agent security guards parse and validate but **enforce nothing on either output target**:

- `outgoing_allowlist` — parsed in `parser.js:1206` (carries `hosts`), validated in `validator.js:350`.
- `can_return_sensitive` — parsed in `parser.js:1202`.
- Both hit the shared dispatch case at `compiler.js:9059-9069`, which returns `null` for **both** JS and Python. No consumer exists in `runtime/` or `lib/`.

So an app author writes "this assistant may only call api.stripe.com" or "this assistant must never return the SSN field," it compiles clean, and the running app ignores the rule. For a pitch built on provable safety, a guard that silently no-ops is the worst possible failure — it reads as enforced and isn't.

The Python-parity audit flags these as "HIGH Python gaps," which is a **mis-categorization** (they're both-target-unenforced, not Python-only). Fixing that label is part of this work.

## Scope

Wire real enforcement into the agent compile/emit path on **both** JS and Python (No Drift Tax rule):

- `outgoing_allowlist` → the agent's outbound calls (tool calls, `ask claude`, `call API`, `send email`) are checked against the allowed host list; a call to a non-listed host fails closed with a clear error.
- `can_return_sensitive` → the agent's response omits fields marked sensitive unless the guard explicitly permits them.

Out of scope: changing the parse/validate surface (already correct); any non-agent code path.

## Cycle 0 — investigate the agent emit path (READ before any code)

Before writing tests, map exactly where to inject each guard. Open and trace:

- `compiler.js` — the `AGENT` node handler (`compileAgent` / the AGENT case) on **both** the JS backend path and the Python backend path. Find where the agent body's outbound calls are emitted and where the agent's return value is assembled.
- `runtime/` — any agent helper (the `ask claude` / tool-dispatch runtime). Confirm whether enforcement belongs in emitted code or a shared runtime helper (prefer a runtime helper called from both targets, per "extract the side-effect into a helper").
- How `can_return_sensitive` knows which fields are sensitive — is there a field-level `sensitive` marker, or does the guard name the fields? (Open question — resolve before cycle 3.)

Output of cycle 0: a one-paragraph note in this plan naming the exact injection points + the sensitive-field source of truth.

## TDD cycles (red → green → refactor; one commit each)

1. **outgoing_allowlist (JS).** Red: compile an agent with an allowlist; assert the emitted agent rejects an outbound call to a non-listed host (fails closed) and permits a listed one. Green: emit the host check (ideally via a runtime helper).
2. **outgoing_allowlist (Python).** Mirror cycle 1 on the Python target. Same runtime-helper shape (`runtime/<name>.py`).
3. **can_return_sensitive (JS).** Red: compile an agent over a table with a sensitive field; assert the response omits it unless the guard permits. Green: emit the filter.
4. **can_return_sensitive (Python).** Mirror cycle 3.
5. **Fix the parity-audit mis-label.** Update `scripts/python-parity-audit.mjs` so shared null-return markers are categorized as both-target state, not "Python gaps." Re-run; confirm `outgoing_allowlist` + `can_return_sensitive` no longer show as HIGH Python gaps.

## Verification (per cycle + at the end)

- Per cycle: the focused new test + a compile sanity check.
- End of phase: `node clear.test.js` (full), `node scripts/cross-target-smoke.mjs`, and the 8-core-template smoke (0 errors).
- Docs cascade: `intent.md` (the two NodeType rows gain real semantics), `SYNTAX.md`, `AI-INSTRUCTIONS.md`, `FEATURES.md`, `CHANGELOG.md`, `learnings.md`. Update `studio/system-prompt.md` if Meph should know the guards now enforce.

## Before coding (project rule)

Run `/red-team-plan` on this plan first — agent security enforcement is exactly the "async + new semantics" shape that breaks. Then write the cycle-1 failing test.

## Open questions to resolve in cycle 0

1. Sensitive-field source of truth for `can_return_sensitive` (field marker vs guard-named fields).
2. Which outbound primitives the allowlist must cover (just HTTP/tool calls, or also `send email` / `ask claude`'s own endpoint?).
3. Fail-closed vs fail-loud: a blocked outbound call should throw a clear, auditable error (not silently drop) — confirm against the audit-trail requirement.
