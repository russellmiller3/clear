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


