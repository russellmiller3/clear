# Plan: prove (or prevent) race conditions in Clear apps

**Status:** ready to start. Three phases, each shippable independently.
**Date:** 2026-05-02.
**North star:** A CRO running `clear prove apps/deal-desk/main.clear` sees a sentence like *"We proved no two concurrent approvals can both succeed on the same deal"* — and the prover means it.

---

## Why this matters

Today the prover walks one thread of execution at a time. It can prove "for any input X, this rule produces output Y." It cannot prove "for any pair of concurrent requests A and B, the system reaches a sane final state."

That gap matters because the most common production bugs in CRUD apps aren't math errors — they're concurrency races:
- Two CROs approve the same deal simultaneously; both checks pass; the audit log shows two approvals; the customer gets billed twice.
- A Stripe webhook flips a tenant to "paid" while the user clicks Cancel; final tenant state depends on which write lands second.
- Two requests both read `inventory.count = 1`, both decrement, both save `count = 0`; we sold one item to two customers.

These are the bugs auditors care about. *"We tested it under load"* is not the same sentence as *"we proved no concurrent schedule produces a duplicate approval."* The second sentence sells.

---

## Three phases — ship each independently

### Phase 1: Static detection of read-modify-write patterns (~3-4 hours, agent)

Cheapest, highest leverage. Most practical races in CRUD apps are read-modify-write — read a record, modify a field, save it back without checking nothing changed in between. The validator can catch these at compile time without any runtime cost.

**What ships:**
- Validator rule `READ_MODIFY_WRITE_NO_LOCK`: if an endpoint reads a record into a variable, modifies the variable, and saves it back, AND no `with optimistic lock` modifier is present, emit a warning.
- A new modifier `safe to retry` that authors apply to endpoints to declare "this is idempotent, races are fine" — silences the warning for that endpoint.
- A new modifier `with optimistic lock` that opts INTO version-check semantics (Phase 2 wires the runtime; Phase 1 just declares intent).
- Detection examples (validator tests):
  - `look up Deal where id is x` → `change deal's status` → `save changes to Deals` — flagged.
  - `look up Counter where id is 1` → `set counter's count to counter's count + 1` → `save` — flagged.
  - `save data as new <Table>` (insert-only) — NOT flagged (no read-modify-write).
  - `requires login` + `delete deal at /api/deals/:id` — NOT flagged (delete-only).

**Why this alone is enough for the regulated-tier pitch:**
"We catch every place in your code where two concurrent requests could overwrite each other. The compiler refuses to ship until you either declare the race is fine (`safe to retry`) or opt into automatic version checks (`with optimistic lock`)."

### Phase 2: Runtime optimistic locking via auto-versioned records (~4-6 hours, agent)

Wire the runtime so `with optimistic lock` actually does something.

**What ships:**
- Every table gets an auto-managed `_version` column (incrementing INTEGER, default 0).
- `look up X where id is y` reads `_version` into the variable too.
- `save changes to X` (under `with optimistic lock`) emits an UPDATE with `WHERE id = ? AND _version = ?` and `SET _version = _version + 1`.
- If the row count returned by the UPDATE is 0 (someone else moved the version), the endpoint returns 409 Conflict with a body the client can use to retry.
- Audit row ordering: `with optimistic lock` also enforces audit-row-first ordering — write the audit entry, then perform the action, then mark the audit entry "completed." If the action fails, the audit entry stays "pending" and the row reads as a failed attempt instead of a vanished action.

**The CRO sentence this unlocks:**
"Two simultaneous approvals on the same deal: one wins, one returns 409 Conflict. Both attempts are in the audit log. No deal is ever double-approved."

### Phase 3: Concurrency test runner (~3 hours, agent)

A `clear test --concurrency N <file>` command that fires N parallel requests at every test endpoint and asserts the final state is one of the linearizable orderings.

**What ships:**
- New flag `--concurrency N` on `clear test`.
- For every test that posts/puts to a state-changing endpoint, the runner fires N copies in parallel.
- Asserts: every successful request has a distinct audit row; the final record's version equals the number of successful requests; total successful requests + total 409 Conflicts = N.
- Reports per-endpoint: "10 concurrent approvals: 1 succeeded, 9 returned 409 Conflict, audit log has 10 entries (1 completed, 9 pending). PASS."

**Demo target:** `apps/deal-desk/main.clear` — convert the approval endpoint to `with optimistic lock`, run `clear test --concurrency 10`, show the report.

---

## Surface change — what `clear prove` says after all three phases

```
$ clear prove apps/deal-desk/main.clear

We proved 4 of 4 named rules in this app, for every possible deal.

  OK  discount-cap-thirty                 PROVED for every possible deal
  OK  deal-over-100k-needs-cro-signoff    PROVED for every possible deal
  OK  approval-window                     PROVED for every possible deal
  OK  audit-row-before-ship                PROVED — every approval writes the audit row first

Concurrent-safety verdicts (5 endpoints):
  OK  POST /api/deals/:id/approve         WITH OPTIMISTIC LOCK — no double-approval possible
  OK  POST /api/deals/:id/reject          WITH OPTIMISTIC LOCK — no race
  OK  POST /api/deals                     INSERT-ONLY — no race possible
  WARN POST /api/deals/:id/comment        READ-MODIFY-WRITE without lock — concurrent comments may overwrite
  OK  POST /api/billing/webhook           SAFE TO RETRY (idempotent by Stripe event id)

5 endpoints concurrency-checked. 4 safe. 1 warning (1 line to fix: add `with optimistic lock`).
```

That report is the audit-trail surface for the regulated-tier pitch.

---

## Templates already in main — the patterns to copy

- **Validator hard errors and warnings:** `validator.js` already has `ROUTE_DEF` (line 785) and `RULE_DEF` (just shipped). Same shape — collect findings during a pass, emit warnings/errors with codes like `READ_MODIFY_WRITE_NO_LOCK`.
- **Endpoint modifiers:** `requires login` is the existing template. `with optimistic lock` and `safe to retry` follow the same parser pattern — keyword tokens recognized in the endpoint header parser.
- **Runtime helpers:** `runtime/db.js` and `runtime/db.py` already have `save changes to X` — extend those helpers with the `with optimistic lock` variant. Both targets in the same change per the cross-target parity rule.
- **Test runner:** `cli/clear.js testCommand` is where `--concurrency N` would land. The existing test runner already drives endpoints with HTTP — extend it with parallel firing.

---

## Suggested commit chain (TDD discipline)

**Phase 1 (3-4 hrs):**
1. `test(concurrency): failing validator tests for READ_MODIFY_WRITE_NO_LOCK`
2. `feat(validator): detect read-modify-write patterns + safe-to-retry / with-optimistic-lock modifiers`
3. `feat(parser): recognize 'safe to retry' and 'with optimistic lock' endpoint modifiers`
4. `docs(concurrency): cascade Phase 1 across SYNTAX, FAQ, FEATURES, CHANGELOG, learnings, system-prompt, write-clear`

**Phase 2 (4-6 hrs):**
5. `test(concurrency): failing tests for auto-versioned records under optimistic lock`
6. `feat(compiler): emit _version column + version-check UPDATE under with-optimistic-lock`
7. `feat(runtime): db.js + db.py optimistic-lock save returns 409 on version mismatch`
8. `feat(runtime): audit-row-first ordering for with-optimistic-lock endpoints`
9. `docs(concurrency): cascade Phase 2`

**Phase 3 (3 hrs):**
10. `test(concurrency): failing tests for clear test --concurrency N`
11. `feat(cli): clear test --concurrency N drives parallel requests + linearizability assertions`
12. `feat(deal-desk): convert approve endpoint to with-optimistic-lock + add concurrency test`
13. `docs(concurrency): cascade Phase 3 + final demo screenshot in landing/marcus.html`

13 commits across three phases. Each phase ships independently; you can stop at Phase 1 and have a real product if Phases 2-3 slip.

---

## Demo target

`apps/deal-desk/main.clear` — the regulated-tier pitch app. After all three phases:
- 3 named rules with PROVED verdicts (already shipped).
- 5 endpoints with concurrency verdicts (after Phase 1).
- Optimistic locking on approve/reject/state-changing endpoints (after Phase 2).
- A `clear test --concurrency 10` run that proves no double-approval (after Phase 3).

The screenshot of `clear prove apps/deal-desk/main.clear` after all three phases IS the regulated-tier landing page hero.

---

## Why for launch

Marcus is selling deal-desk to CROs at mid-market companies. CROs read auditor reports. Auditors care about race conditions because that's where insurance claims happen — "two approvals, one customer billed twice" is a real-money disaster. Every other low-code platform punts on this. Clear with this plan + the rule keyword + the prover is the only stack that says "we proved no concurrent schedule double-approves a deal."

That sentence is the close.

---

## What NOT to do

- **Don't go full TLA+.** Model checking with explicit interleavings is a year of work and overkill for CRUD apps. The combination of static read-modify-write detection + runtime optimistic locking covers >95% of practical races with <5% of the complexity.
- **Don't make optimistic locking the default.** Some apps genuinely don't need it (insert-only logs, idempotent webhooks). Make it opt-in via `with optimistic lock`. The validator warns if a read-modify-write endpoint is missing it.
- **Don't ship Phase 3 before Phase 2.** Concurrency tests against unprotected endpoints will pass sometimes by luck and fail sometimes — flaky tests poison the regression suite. Phase 2 makes Phase 3 deterministic.
- **Don't claim we "prove no race conditions" in Phase 1 alone.** Phase 1 is detection, not prevention. The honest sentence after Phase 1 is "we flag every place a race can happen." The proof sentence comes after Phase 2.

---

## Estimated wall-clock

- Phase 1: 3-4 hours (validator + parser + docs)
- Phase 2: 4-6 hours (compiler emit + runtime + tests + docs)
- Phase 3: 3 hours (CLI runner + deal-desk demo + docs)
- Total: 10-13 hours of agent work spread across 1-3 sessions.

Each phase is independently shippable, so a single agent run can land Phase 1 alone if needed.
