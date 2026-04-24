# Plan: Decidable Core + Explicit Effect Boundaries

**Date:** 2026-04-24
**Scope:** Language-level. Split Clear into a provably-terminating pure core and explicitly-labeled effect blocks, so the compiler can statically prove "this fragment always halts" vs "this fragment talks to the world / may run forever."
**Branch:** `feature/decidable-core`
**Related:** `PHILOSOPHY.md` (determinism, 1:1 mapping), `CLAUDE.md` Meph-Failures-Are-Bug-Reports rule, `learnings.md` (infinite-loop failure mode from training sweeps).
**Status:** Design + staged migration. No behavior change in phase 0; progressive tightening through phases.

---

## Executive summary

Clear is currently Turing-complete: `repeat` is bounded, but endpoints run forever, agent loops have soft caps, and `ask claude` / HTTP / websockets can block indefinitely. Most Clear programs already live in the total fragment by accident — the templates are 90%+ CRUD, filters, aggregates, and bounded iteration. The non-total parts are concentrated in a small set of constructs (`ask claude`, `subscribe to`, `every N seconds`, `call API`, endpoint handlers).

**The proposal:** make totality a first-class property the compiler tracks per-block, add a single plain-English keyword (`effect:` / `live:` / `over time:` — pick one in Phase 1) that marks a block as non-total, and statically require that any non-total call site sits inside such a block. Pure blocks get termination guarantees; effect blocks get runtime bounds (iteration caps, timeouts, deadlines) enforced by the runtime.

**Why this matters for Meph.** A hallucinated `while there are more items` without a decrementing index → infinite loop → hung test run → wasted sweep dollars. If the compiler rejects the construct unless it's inside an explicit effect block with a bound, the infinite-loop failure class goes from "runtime hang, discovered after timeout" to "compile error, caught in ≤200ms." This is the classic "compiler accumulates quality" pattern from PHILOSOPHY.md — fix once, every future Meph session benefits forever at $0.

**What this plan is NOT:** a pure-functional-programming pivot. Clear stays imperative and plain-English. The change is that the compiler now knows *where* the impurity lives, instead of treating every block as potentially-non-total.

---

## The fix (shape)

```
BEFORE (today):
┌────────────────────────────────────────────┐
│  Clear program                             │
│  ─────────────                             │
│  define action greet:                      │
│    name is receiving's name                │
│    send back 'hello ' + name               │
│                                            │
│  endpoint /chat:                           │
│    reply is ask claude 'hi'                │  ← no bound, no label
│    send back reply                         │
│                                            │
│  Compiler can't distinguish:               │
│    greet   — provably halts                │
│    /chat   — calls external world          │
│  Both compile to the same "function."      │
└────────────────────────────────────────────┘

AFTER:
┌────────────────────────────────────────────┐
│  define action greet:                      │  ← pure, compiler proves total
│    name is receiving's name                │
│    send back 'hello ' + name               │
│                                            │
│  endpoint /chat:                           │
│    live:                                   │  ← explicit effect fence
│      reply is ask claude 'hi'              │
│      with timeout 30 seconds               │
│      send back reply                       │
│                                            │
│  validator rule:                           │
│    ask claude / call API / subscribe /     │
│    every N seconds MUST be inside `live:`  │
│    pure blocks MUST NOT contain them       │
└────────────────────────────────────────────┘
```

Keyword choice deferred to Phase 1 (see "Open questions").

---

## Success criteria

1. **Every pure Clear block provably halts.** Validator rejects unbounded recursion, unbounded `while`-style loops, and effect-shaped calls outside `live:` blocks.
2. **All 8 core templates still compile** after migration, with explicit effect boundaries marking the 5–15% of lines that are actually non-total.
3. **Meph's infinite-loop rate drops.** Measured via Factor DB: count of sweeps where a single app run exceeded the wall-clock timeout, before vs after. Target: ≥50% reduction in that failure class.
4. **Zero false positives on the happy path.** A well-formed Clear app with one effect block compiles clean without scattered annotations.
5. **Docs propagate** across all 11 surfaces (intent.md, SYNTAX.md, AI-INSTRUCTIONS.md, USER-GUIDE.md, ROADMAP.md, landing/*.html, playground/system-prompt.md, FAQ.md, RESEARCH.md, FEATURES.md, CHANGELOG.md).

---

## Phase overview

| Phase | What | Depth | Gated on |
|---|---|---|---|
| 0 | Audit + instrument | Pure research, no behavior change | — |
| 1 | Syntax design + phone-test | Pick the keyword, write 5 example programs | Phase 0 recon |
| 2 | Validator: warn-only mode | New rule fires, but only warns | Phase 1 syntax locked |
| 3 | Compiler: runtime bounds for effects | Timeouts + iter caps inside `live:` blocks | Phase 2 stable |
| 4 | Template migration | Update 8 core templates to new syntax | Phase 3 compiled clean |
| 5 | Validator: error mode | Warnings become hard errors | Phase 4 migrated |
| 6 | Docs + Meph knowledge | All 11 doc surfaces + system-prompt.md | Phase 5 shipped |
| 7 | Measurement | Run Meph eval / curriculum sweep, compare infinite-loop rate | Phase 6 docs live |

Each phase is independently shippable and independently revertable.

---

## Open questions (Phase 1 decides)

**Q1: What's the keyword?** Candidates:
- `live:` — short, evokes "runs continuously." Collides with nothing in the current synonym table (verify in Phase 1).
- `effect:` — precise but jargon. Fails the 14-year-old test per PHILOSOPHY.md.
- `over time:` — plain English, evokes duration. Two words = tokenizer work.
- `outside world:` — most English-y, but long. May redirect to `live:` as a synonym.

Recommendation going into Phase 1: `live:` as canonical, `over time:` and `outside world:` as synonyms. But phone-test 5 example programs before locking.

**Q2: Granularity — block-level or call-level?** Two options:

- **Block-level** (proposed): `live:` is a block; everything inside it can do effects.
  ```
  endpoint /chat:
    live:
      reply is ask claude 'hi'
      send back reply
  ```
- **Call-level**: every effectful call is annotated.
  ```
  endpoint /chat:
    reply is live ask claude 'hi'
    send back reply
  ```

Block-level wins on signal-to-noise: one fence per endpoint, not one per call. Also maps cleanly to Haskell's `IO` / Koka's effect rows without the jargon.

**Q3: What about endpoints themselves?** Every endpoint is inherently non-total (runs forever, serves requests). Two options:

- Endpoints are implicitly `live:` — authors only mark `live:` around truly-effectful inner calls. This matches intuition.
- Endpoints explicitly say `live:` at the top. More ceremony but more honest.

Recommendation: implicit. The endpoint keyword itself communicates "this is a server" — requiring `live:` on top of that is redundant. Inner effect calls still need `live:` fences.

**Q4: Bounded recursion — allow or forbid?** Currently Clear has no canonical recursion syntax. If we add one, is it `total recursion only` (structural recursion on shrinking data, Agda/Idris style) or `bounded recursion` (max depth annotation)?

Recommendation: **defer**. No Clear template today uses recursion. If we never add it, the language stays total-by-construction on that axis.

**Q5: What's the runtime bound for `live:` blocks?** Proposed defaults:
- `ask claude`: 30s timeout, configurable
- `call API` / `http_request`: 10s timeout, configurable
- Agent tool loops: max 20 iterations, configurable
- `every N seconds`: no change (already bounded by the interval)
- `subscribe to` / websockets: no timeout, but a max-connections cap at the server level

These are guardrails, not contracts. Authors can override with `with timeout X seconds` / `with max iterations N`.

---

## Recon findings (2026-04-24 audit)

Full audit in `a698ddf1ad13fa637` agent output. Compressed summary:

**Node types: 154 total in `parser.js`.**

**Loops:**
| Node | Status | Site |
|---|---|---|
| `REPEAT N TIMES` | ✅ Total — integer-bounded | parser.js:420-422, compiler.js:6224-6233 |
| `FOR EACH X IN Y` | ✅ Total — finite-collection bounded | parser.js:431-435, compiler.js:6235-6267 |
| `REPEAT UNTIL ... MAX N` | ✅ Total — hard iteration cap | parser.js:427-429, compiler.js:6280-6294 |
| `WHILE` | 🚨 **Accidentally non-total** — naked `while(cond)`, no cap | parser.js:437-439, compiler.js:6269-6278 |

**Effects (inherently non-total, correct by design):**
| Node | Why | Site |
|---|---|---|
| `ENDPOINT` | Server accepts requests forever | compiler.js:4027-4132 |
| `SUBSCRIBE` (websocket) | `while True` per connection | compiler.js:7302-7342 |
| `BACKGROUND` / `CRON` / `every N seconds` | `setInterval` / periodic dispatch | compiler.js:7162-7293 |
| `ASK_AI` / `ask claude` | External API, configurable timeout | compiler.js:8162-8188 |
| `HTTP_REQUEST` / `call API` | 30s default timeout + AbortController | compiler.js:6677-6725 |

**Accidentally non-total elsewhere:**
- **Unbounded recursion**: function can call itself with no depth guard. No check in `validator.js`, no depth cap in `compiler.js`. Example: `define function loop(): loop()` → stack overflow.
- **`SEND_EMAIL`**: no timeout emitted; SMTP can hang indefinitely (compiler.js:6660-6674).
- **Database mutations**: ~20 CRUD calls across templates, no query timeout.

**Agent loops are already bounded** — Anthropic API's `max_iterations` caps tool-use loops. Clear doesn't track this explicitly but gets the bound for free from the host.

**Template effect density (8 core templates):**
| Template | Lines | Effect lines | Pure % |
|---|---|---|---|
| todo-fullstack | 150 | 7 | 95% |
| crm-pro | 249 | 12 | 95% |
| blog-fullstack | 192 | 8 | 96% |
| live-chat | 91 | 7 | 92% |
| helpdesk-agent | 173 | 16 | 91% |
| booking | 176 | 8 | 95% |
| expense-tracker | 166 | 7 | 96% |
| ecom-agent | 474 | 18 | 96% |

**Average 94% pure.** Effects cluster in endpoints and agent bodies.

---

## Strategy tension (decide in Phase 1)

The audit revealed that Clear is **already mostly total**. That changes the shape of the plan. Two viable paths:

**Path A — Minimalist (MVP):**
Ship only the fixes for the 3 accidentally-non-total constructs. No new syntax.
1. Forbid naked `WHILE` (require `WHILE ... MAX N` like `REPEAT_UNTIL`), OR auto-attach a default max.
2. Add recursion depth cap (default 100, override with annotation).
3. Add default timeout to `SEND_EMAIL` + DB mutations.

**Cost:** 3 validator rules + 3 compiler changes. ~1 day of work. Zero syntax learning burden for Meph.
**Win:** ~80% of the hang-risk eliminated. No migration of 8 templates needed.

**Path B — Maximalist (full effect fences):**
Add `live:` keyword, migrate endpoints to wrap effectful inner calls, compiler tracks purity per block.

**Cost:** New syntax, 8 template migrations, system-prompt.md retraining for Meph, risk of wrong-syntax regressions.
**Win:** Static proof of totality for every non-`live:` block. Compiler optimizations become possible (aggressive inlining, CSE, re-ordering).

**Recommendation going into Phase 1:** do **Path A first**, measure. If infinite-loop rate drops enough to satisfy the success criteria, stop. Only escalate to Path B if the data says we need it. This matches Clear's philosophy of "compiler accumulates quality" — ship the cheapest fix that demonstrably helps, don't pay migration cost speculatively.

The rest of the plan below assumes **Path A** as the default track. Path B phases are marked **[B-only]** and are gated on Phase 7 measurement showing Path A wasn't enough.

---

## Risk register

| Risk | Probability | Mitigation |
|---|---|---|
| Keyword collides with existing synonym | Medium | Phase 1 greps `synonyms.js` + tokenizer before locking |
| Migration breaks templates Meph just learned | Medium | Phase 2 warn-only runs for 1+ sessions; Meph observes warnings before errors land |
| False positive: validator flags a legitimate pure call as effectful | High early, low after tuning | Whitelist built incrementally; warn-only phase catches it |
| Meph writes the keyword wrong | Medium | system-prompt.md update + 3+ examples; error message "missing `live:` fence around `ask claude`" names the exact fix |
| Doesn't actually reduce infinite-loop rate | Low-medium | Phase 7 measurement — if metric doesn't move, roll back Phase 5 (keep warn-only) and reassess |
| Scope creep into pure-functional-programming | Medium | This plan explicitly forbids: no immutability rules, no monads, no type-level purity. Only a runtime fence. |
| Landing pages / templates regress visually | Low | Template smoke-test rule (CLAUDE.md) catches this before commit |

---

## Phase 0 — Baseline + branch setup

**Goal:** capture the "before" numbers so Phase 7 can prove (or disprove) the win. No code changes.

**Branch:** `feature/decidable-core` off `main`.

**Tasks:**
1. Create `PROGRESS.md` at repo root with phase checklist (section per phase, empty checkboxes).
2. Baseline measurement — run the current curriculum/Meph eval and record:
   - % of sweep runs that timeout (wall-clock exceeded, i.e. likely infinite loop or hang)
   - Per-construct failure breakdown from Factor DB: how many `code_actions` rows have `test_pass=0` where the source contains `while` / recursion / `send email`
   - Median + p95 time-to-first-error for apps that hang
3. Inventory check — grep every template + curriculum task for `while`, recursive function calls, and `send email`. Record usage counts.
4. Stamp the recon audit results into `learnings.md` under a new "Decidability audit" entry.

**Success:** `PROGRESS.md` exists, baseline metrics are in `plans/plan-decidable-core-baseline.md`, no behavior changes shipped.

**TDD cycles:** none (measurement only).

**Commit:** `chore(decidable-core): phase 0 — baseline metrics + recon archived`

---

## Phase 1 — Syntax + semantics lock

**Goal:** decide Path A vs Path B, pick keyword names, write example programs, phone-test them.

**Tasks:**
1. **Path decision.** Re-read the Strategy Tension section with fresh eyes. Default: Path A. Escalate to Path B only if the red-team-plan skill flags Path A as insufficient.
2. **WHILE fix design** (Path A core) — **LOCKED: Option 1a (forbid naked WHILE).**
   - Canonical: `while x is less than 10, max 100 times:` (mirrors `REPEAT UNTIL ... MAX N`).
   - Rationale: an author who wrote `while cond` without a max either (a) has a decrementing condition they're confident of — in which case `max N` is cheap insurance, or (b) wrote a hang. Case (b) is what we're eliminating; case (a) is trivial to annotate. A silent default (Option 1b) hides intent and violates "No Magic Variables" (PHILOSOPHY.md).
   - Grammar change lives in `parser.js` (whileNode factory at parser.js:437-439) — must accept the `, max N times` suffix. Not a validator-only change.
3. **Recursion depth design:**
   - **Default: 1000** for all self-recursive functions. (100 was too low — realistic JSON/tree walks can hit 100 quickly; 1000 is safely below the V8 stack limit of ~10k frames.)
   - Override: `define function factorial, max depth 5000:` — single extra phrase.
   - Exceeded-depth error at runtime: `"factorial recursed 1001 levels — change 'max depth' or rewrite as a loop"`.
4. **`SEND_EMAIL` + DB + `ask claude` + `call API` timeout:**
   - Defaults: SMTP **30s** (real mail servers can take 10-15s under load; 10s was too aggressive), DB **15s** (cross-region Postgres needs headroom; 5s was too aggressive), `ask claude` **60s** (currently configurable per call but **no global default** — close that gap), `call API` keep current **30s**.
   - Override: `send email ... with timeout 10 seconds` / `ask claude ... with timeout 30 seconds`.
5. **Phone-test.** Write 5 example Clear programs exercising each new construct out loud. Confirm a curious 14-year-old could read them.
6. **Synonym collision check.** Grep `synonyms.js` for `max depth`, `max times`, `with timeout`, `max iterations`. Resolve conflicts before Phase 2. Also verify the `, max N times` comma-continuation pattern doesn't collide with existing comma-separated-args patterns in the tokenizer.
7. **[B-only] Pick `live:` keyword.** Phone-test against `over time:`, `outside world:`. Verify no synonym collisions.

**Open grammar question (answer in Phase 1 deliverable):** preposition before the max — `with max 100` vs `max 100 times` vs `max 100 iterations`. `REPEAT UNTIL ... MAX N TIMES` uses the latter; keep consistent.

**Success:** design doc at `plans/plan-decidable-core-syntax.md` locking every new keyword + error message. 3+ example programs per construct.

**TDD cycles:** none yet (design only).

**Commit:** `docs(decidable-core): phase 1 — syntax locked, 5 examples`

---

## Phase 2 — Validator: warn-only mode

**Goal:** the new rules fire as warnings, not errors. Meph (and humans) see the nag without any build breaking.

**Files to modify:**
- `parser.js` — **grammar extension** for `WHILE ... max N times` (parser.js:437-439 `whileNode` factory + tokenizer hook). Must accept both the old naked form (so Phase 2 is additive — old apps still parse) and the new bounded form. The validator then fires on the naked form.
- `validator.js` — add rules (warn severity). No existing recursion/loop checks (confirmed — `grep recursion validator.js` returns zero). Add a new "termination" section near the existing validation passes.
  - Rule W-T1: `WHILE` AST node without a `max` property → warn `"while-loop has no 'max N times' — the loop may hang if the condition stays true."`
  - Rule W-T2: function-self-reference detected (AST walk; `FUNCTION_CALL` whose name matches an enclosing `FUNCTION_DEF`) → warn `"function X calls itself. Default depth cap is 1000. Add 'max depth N' after the parameter list to override."`
  - Rule W-T3: `SEND_EMAIL` node without `withTimeout` property → warn `"email send has no timeout; SMTP can hang. Default is 30 seconds."`
  - Rule W-T4: `ASK_AI` node without `withTimeout` property → warn `"ask claude has no per-call timeout; default is 60 seconds."` (new — closes the recon-flagged gap)
- `compiler.js:6269-6278` (WHILE emission) — **unchanged in Phase 2.** Still emits naked `while`. Warning only.

**Test placement:** new tests go in `clear.test.js` under a new `describe('validator — termination')` block, sibling to the existing `describe('validator — keyword-misuse detection')` block (Session 44).

**TDD cycles:**
1. 🔴 Parser test: `parser.test` (or inline in `clear.test.js`) — `while x < 10, max 100 times: ...` parses to a WHILE node with `max: 100`.
2. 🟢 Extend `whileNode` factory at parser.js:437-439 + tokenizer hook for the `, max N times` suffix.
3. 🔄 Refactor — if the `max N times` suffix logic mirrors REPEAT_UNTIL (parser.js:427-429), extract shared helper.
4. 🔴 W-T1 validator test: `while x < 10: ...` (naked) → warning with exact string above.
5. 🟢 Add W-T1 rule in `validator.js` termination section.
6. 🔴 W-T2 test: `define function loop: loop()` → warning.
7. 🟢 Self-reference detection (AST walk, enclosing `FUNCTION_DEF` scope map).
8. 🔴 W-T3 test: `send email to 'a@b.c'...` without `with timeout` → warning.
9. 🟢 SEND_EMAIL warning rule.
10. 🔴 W-T4 test: `reply is ask claude 'hi'` without `with timeout` → warning.
11. 🟢 ASK_AI warning rule.
12. Template smoke-test (MANDATORY per CLAUDE.md): compile all 8 core templates, verify 0 errors, record warning counts. Expected warning sources: helpdesk-agent and ecom-agent (for `ask claude` without timeout), blog-fullstack (for `send email` without timeout). Zero templates use `while`.
13. 📚 Run `update-learnings` skill.

**Success:** all 8 templates compile cleanly; expected warnings appear on templates that use the flagged constructs.

**Commit:** `feat(validator): phase 2 — termination warnings (warn-only)`

---

## Phase 3 — Runtime bounds + compiler enforcement

**Goal:** `WHILE`, recursion, `SEND_EMAIL`, DB mutations get real runtime caps. Warnings still ship — no hard errors yet.

**Files to modify:**
- `compiler.js:6269-6278` (WHILE) — emit iteration counter:
  ```js
  { let _iter = 0; while (cond) { if (++_iter > MAX) throw new Error('while-loop exceeded ' + MAX + ' iterations'); ... } }
  ```
  Default `MAX = 100000` when the source has no `max N times` clause. With explicit `max N`, use N. Note this is a near-violation of the 1:1 mapping rule (PHILOSOPHY.md) — the counter lines don't trace to a Clear source line. Acceptable because `REPEAT_UNTIL` already emits counter logic via the same precedent (compiler.js:6280-6294).
- `compiler.js` function-def emission — emit depth counter for self-recursive functions. Thread a `_depth` param (default 0), bump on self-call, throw at limit. Default limit **1000**; override via `max depth N` in source.
- `compiler.js:6660-6674` (SEND_EMAIL) — wrap in `Promise.race` with timeout. Default **30s**. Override via `with timeout N seconds`.
- `compiler.js:8162-8188` (ASK_AI) — wrap in `Promise.race` with global timeout default **60s**. Existing per-call `with timeout` takes precedence.
- `compiler.js:6677-6725` (HTTP_REQUEST / call API) — **no change** (already has 30s default + AbortController per recon). Document in intent.md.
- `runtime/db.js` — wrap query calls in `Promise.race` with timeout. Default **15s**.
- `intent.md` — update WHILE, FUNCTION_DEF, SEND_EMAIL, ASK_AI rows with new default timeout / max. Also document HTTP_REQUEST's existing 30s default (currently undocumented).
- `playground/clear-compiler.min.js` — rebuild via `npx esbuild index.js --bundle --format=esm --minify --outfile=playground/clear-compiler.min.js` after compiler changes land (per CLAUDE.md).

**TDD cycles:**
1. 🔴 Runtime test: while-loop with always-true condition → throws after MAX iterations, doesn't hang test runner.
2. 🟢 Emit counter in compiler.js WHILE case.
3. 🔴 Runtime test: recursive function without base case → throws "depth exceeded" after 100.
4. 🟢 Emit `_depth` counter in FUNCTION_DEF.
5. 🔴 Runtime test: `send email` against a non-responsive SMTP host (mocked) → fails at 10s, doesn't hang.
6. 🟢 Wrap SEND_EMAIL in `Promise.race`.
7. 🔴 Runtime test: DB query against a frozen mock → fails at 5s.
8. 🟢 Wrap runtime/db.js queries in `Promise.race`.
9. Template smoke-test. Verify no behavior changes on happy-path templates (they finish before any bound kicks in).
10. 📚 Run `update-learnings`.

**Success:** a deliberately pathological app (infinite `while`, stack-overflow recursion, hung SMTP) fails *fast and legibly* instead of hanging a sweep. All 8 templates unchanged.

**Commit:** `feat(compiler): phase 3 — runtime bounds on while / recursion / email / db`

---

## Phase 4 — Template migration (Path A: minimal)

**Goal:** update any template that uses flagged constructs to use explicit caps/timeouts where the default doesn't fit the app's intent.

**Scope (from recon):** Path A's changes mostly don't require template edits — defaults are generous. The work here is:
1. Grep 8 templates for `while`, recursive functions, `send email`. Recon said 0 templates use `while` or recursion; all email sends are transactional (10s default is fine).
2. For any template where the default is wrong, add explicit `with max N` / `with timeout N seconds`.
3. Re-compile all 8 — zero new warnings, zero errors.

**TDD cycles:** one per template that needs edits (likely zero or one).

**[B-only] If Path B is active:** add `live:` fences around `ask claude`, `call API`, `subscribe to`, etc. in each template. Expect ~5-10 edits per template.

**Success:** `node -e "..."` smoke-test from CLAUDE.md → `0 errors, 0 warnings` for all 8.

**Commit:** `chore(templates): phase 4 — explicit bounds where defaults don't fit`

---

## Phase 5 — Validator: error mode

**Goal:** warnings become hard errors. This is the "load-bearing" phase.

**Files to modify:**
- `validator.js` — flip W-T1, W-T2, W-T3 severities from `warn` → `error`.
- Error messages now tell authors the exact fix, in Meph-readable form:
  - W-T1 → `"while-loop must declare a maximum: 'while X < 10, max 100 times:'"`
  - W-T2 → `"function 'name' calls itself. Add 'max depth N' after the parameter list."`
  - W-T3 → `"send email needs a timeout. Add 'with timeout 10 seconds'."`

**TDD cycles:**
1. 🔴 Test: naked `while` → compile error with the exact fix string.
2. 🟢 Flip severity, tune message.
3. 🔴 Test: recursive function with no `max depth` → error.
4. 🟢 Flip severity.
5. 🔴 Test: `send email` without timeout → error.
6. 🟢 Flip severity.
7. Template smoke-test: all 8 still compile to 0 errors (Phase 4 migration guarantees this).
8. Run Meph eval (`node playground/eval-meph.js`) — confirm Meph handles the new error messages without looping.
9. Run friction analysis: `node scripts/top-friction-errors.mjs`. The new errors should NOT dominate the top-10.
10. 📚 Run `update-learnings`.

**Success:** pathological programs fail at compile time with a copy-pasteable fix suggestion. All 8 templates still compile clean. Friction metric on the new errors is low (Meph understands them).

**Commit:** `feat(validator): phase 5 — termination rules promoted to errors`

---

## Phase 6 — Docs propagation (11 surfaces + PHILOSOPHY.md)

**Goal:** every doc surface reflects the new rule. Meph reads `system-prompt.md` fresh each session — if this isn't there, Meph keeps writing naked `while` and we keep fighting the same error.

**Checklist (copy to PROGRESS.md):**

**Spec + reference (authoritative):**
- [ ] `intent.md` — update WHILE, FUNCTION_DEF, SEND_EMAIL, ASK_AI rows. Also document HTTP_REQUEST's pre-existing 30s default (currently undocumented).
- [ ] `SYNTAX.md` — add canonical examples for `while ... max N times`, `define function ..., max depth N`, `send email ... with timeout N seconds`, `ask claude ... with timeout N seconds`.

**AI / Meph-facing (highest impact — read fresh every session):**
- [ ] `AI-INSTRUCTIONS.md` — new "Termination rules" section: `while` must declare `max N times`; recursive functions need `max depth N`; `send email` / `ask claude` / DB calls get timeouts by default, override with `with timeout N seconds`.
- [ ] **`playground/system-prompt.md`** — Meph reads this every session. Add 3-4 example programs showing the canonical bounded forms + a gotcha line: "if you see the compile error 'while-loop has no max N times', add `, max N times` to the while clause."
- [ ] `playground/ghost-meph/mcp-server/system-prompt.md` (if it exists separately) — mirror the Studio system-prompt changes so cc-agent-mode Meph stays in sync. Grep for any secondary system prompt files in `playground/ghost-meph/`.
- [ ] `playground/meph-tools.js` — no tool-definition changes, but verify no hardcoded Clear snippets in tool descriptions use the now-invalid naked-while form.

**User-facing docs:**
- [ ] `USER-GUIDE.md` — tutorial uses bounded loops as the canonical form (never introduces a naked `while` first).
- [ ] `FAQ.md` — add entries: "Why does `while` require `max`?", "How do I override the default recursion depth?", "Where do termination rules live?"
- [ ] `landing/*.html` — grep for code examples using `while` or recursive functions; update to canonical form. Landing pages lag the fastest — check `landing/business-agents.html`, `landing/index.html`, plus any `landing/*template*.html` snippets.

**Status + history:**
- [ ] `ROADMAP.md` — mark this phase complete; add follow-ups to "What's Next" (e.g. Path B if Phase 7 says yes).
- [ ] `FEATURES.md` — new row: "Termination safety — compiler rejects unbounded loops and uncapped recursion; external calls have runtime timeouts."
- [ ] `CHANGELOG.md` — session-dated entry at top describing the shipped change.
- [ ] `RESEARCH.md` — training-signal section: the new W-T1/W-T2/W-T3/W-T4 errors are a new friction class to track in Factor DB. Update the "Read This First" plain-English section if this changes what training data is useful.

**Philosophy (the load-bearing one):**
- [ ] **`PHILOSOPHY.md` — add a new design rule.** Draft:
  > **Total by default, effects by label.** Clear's pure core is provably terminating — every loop is bounded, every recursion is depth-capped, every external call has a timeout. Constructs that talk to the world (endpoints, subscribe, ask claude, call API, every N seconds) are understood by the compiler as long-lived or world-dependent, and the runtime bounds them. The 14-year-old shouldn't have to know what "total" means; they just need the compiler to refuse to emit a program that can hang. Totality is a property the compiler maintains on their behalf.

  Fit into PHILOSOPHY.md after "Deterministic compilation" — same family (predictable output). If the existing rules number is 14, this makes 15. Update the intro line if it says "the 14 design rules."

**Session wrap-up (after all of the above lands):**
- [ ] `HANDOFF.md` — rewrite for the next session: what shipped, Phase 7 results, whether Path B is queued.
- [ ] `learnings.md` — one narrative block: "what we found, what we shipped, what to remember" per the Getty bar (CLAUDE.md).
- [ ] `CLAUDE.md` — consider adding a rule if the phase surfaced repeat-trip patterns (e.g. "every new synonym needs the template smoke-test before commit" — only if violated ≥30 min this session).

**TDD cycles:** none (docs). Verification via `node scripts/check-doc-drift.cjs`.

**Commit:** `docs(decidable-core): phase 6 — 13 doc surfaces + PHILOSOPHY.md + Meph sync`

---

## Phase 7 — Measurement (budget-capped)

**Goal:** prove Path A worked, or decide to escalate to Path B. **Follows the Budget-First Workflow rule in CLAUDE.md — Session 41 burned $168 chasing metric shifts inside noise, so this phase is hard-capped.**

**Budget cap:** $10 for the full measurement. Abort if spend exceeds $10 regardless of partial results. Rationale: a 50%+ reduction in infinite-loop rate should be visible in a small A/B head-to-head, not a full sweep. If it isn't, the intervention is marginal — which is itself the answer.

**Measurement design (avoid the Session 41 trap):**

1. **Pre-run estimate.** Use `playground/supervisor/estimate-cost.mjs` to price the sweep before firing. Post median + range in chat.
2. **Prefer deterministic replay over fresh sweeps.** For past Factor DB rows where a Meph run hung or timed out, replay the transcript against the new compiler. Zero API spend. Primary signal source.
3. **A/B head-to-head on 5 curriculum tasks known to hit termination failures.** Pick tasks where the Factor DB shows historical `test_pass=0` correlated with `while`/recursion/email source patterns. Run each task twice (old compiler / new compiler), not a full 20-run sweep. ~$2-5 total.
4. **Friction ranker, post-intervention.** `node scripts/top-friction-errors.mjs --top=10` — the new W-T1/W-T2/W-T3/W-T4 errors should NOT appear. Zero API spend. If they're in the top-10, Meph can't recover from them → loop back to Phase 5 with better error strings.

**Hypothesis (falsifiable before firing):** "After Path A, the fraction of Factor DB rows with `time_to_first_error > 30s AND source contains while|recursive|send email` drops ≥50%."

**Decision rules:**
- Ship + close plan if: (a) replay shows the pathological apps now fail fast with a compile/runtime-bound error, AND (b) friction ranker shows new errors not in top-10, AND (c) curriculum A/B shows no regression on passing tasks.
- Escalate to Path B if: replay still shows hangs from agent tool loops or subscribe inner loops (path A doesn't cover those).
- Iterate on error strings (loop to Phase 5) if: new errors appear in friction-top-10 but replay shows fast failure (the fix worked but Meph can't parse the message).

**What NOT to do:** run a 3-sweep × 20-run × full curriculum measurement. That's the Session 41 pattern. 3 sweeps ≈ $60+, results will sit inside noise, and we've already learned they don't answer the question.

**Success:** measurement report at `plans/plan-decidable-core-results.md` with: dollar spent (must be ≤$10), A/B outcomes on 5 tasks, friction-ranker top-10 before/after, go/no-go recommendation for Path B.

**Commit:** `docs(decidable-core): phase 7 — measurement results + Path B decision`

---

## Pre-flight checklist

- [ ] On branch `feature/decidable-core`
- [ ] `PROGRESS.md` exists at repo root
- [ ] Baseline metrics recorded (Phase 0)
- [ ] `learnings.md` + recon findings archived
- [ ] Synonym-collision check passed (`synonyms.js` grep for `max depth`, `max times`, `with timeout`, `max iterations`)
- [ ] File:line numbers in this plan re-verified before editing (drift check — recon was 2026-04-24; implementer must re-read each cited file)
- [ ] All 8 templates compile 0-error-0-warning at HEAD
- [ ] Meph eval passes at HEAD (establishes the before-number for Phase 7)
- [ ] `ANTHROPIC_API_KEY` set if running Meph eval locally
- [ ] Budget cap posted in chat before any Phase 7 API spend ($10 per CLAUDE.md budget-first rule)

## Testing strategy

- `node clear.test.js` after every compiler/validator change
- Template smoke-test after every phase: the one-liner from CLAUDE.md
- `node playground/eval-meph.js` before Phase 5 lands (gated by `ANTHROPIC_API_KEY`)
- `node scripts/top-friction-errors.mjs` after Phase 5 → Phase 7 transition

## Success criteria (recap)

1. All 8 core templates compile 0-error-0-warning post-migration.
2. Naked `while`, uncapped recursion, and timeout-less `send email` are compile errors with copy-pasteable fixes.
3. Meph eval pass rate does not regress.
4. Infinite-loop rate in sweeps drops ≥50% (Phase 7 measurement).
5. PHILOSOPHY.md carries the new principle; all 11 doc surfaces reflect the rule.
6. Friction-errors ranker does NOT show the new errors in the top-10 (= Meph handles them cleanly).

---

## 📎 Copy-paste to continue

> Pick up the decidable-core plan at `plans/plan-decidable-core-04-24-2026.md`. Start at Phase 0 (baseline measurement). Branch is `feature/decidable-core`. Read `PHILOSOPHY.md`, `intent.md`, `CLAUDE.md`, and this plan first. Path A is the default; escalate to Path B only on Phase 7 data.


