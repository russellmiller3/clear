# Plan: Z3 SMT Backend for the Clear Prover

**One-liner:** Replace the Clear prover's hand-rolled symbolic decision core (~380 LOC) with a Z3 (SMT solver) backend behind the existing verdict seam — more theories, sound by construction, fewer false PROVEDs — while keeping the ~2000 LOC of value (verdict taxonomy, purity boundary, business-language, agent closure analysis) untouched and archiving the old engine for restore.

Branch: `feature/z3-prover-backend` (already cut, clean). Local only — **do NOT push to GitHub.**

## Phase Order (load-bearing)

**Default track:** Node-side Z3. The prover runs in Node (CLI `clear prove` + `studio/server.js` endpoint) and is **NOT** in the browser Studio bundle — confirmed via `scripts/build-studio-bundle.mjs` (no prover import). So `z3-solver`'s thread/SharedArrayBuffer requirement is satisfied for free; the browser cross-origin-isolation problem does not apply.

**Why this order:** the riskiest unknowns are (1) does Z3-WASM init cleanly in Node and (2) can we encode the mixed-type `+` soundness gate correctly. Both land in Phase 0–1 so failure surfaces on day one, before any wiring is built on top.

| Phase | Title | Depends on | Status |
|-------|-------|-----------|--------|
| 0 | Archive old core + add `z3-solver` + Z3 session wrapper + smoke test | — | required, HARDEST/FIRST (proves Z3 boots in Node) |
| 1 | AST→SMT-LIB translator: numeric/bool core **+ the soundness gate** | 0 | required (second-hardest: the encoding + soundness) |
| 2 | Verdict mapping behind the existing seam (eq/compare/quantifier → {passed,unknown,...}) | 1 | required |
| 3 | Wire into `proveTestSymbolic` / `proveRule`, concrete-mode-first preserved | 2 | required |
| 4 | Port remaining theories the suite exercises (strings=uninterpreted, lists/records if used); full existing prover suite green | 3 | required (regression gate) |
| 5 | New soundness + quantifier tests; docs cascade | 4 | required |
| B-1 | In-browser proving (Studio bundle) — needs COOP/COEP cross-origin isolation | Phase 5 + Russell's go | GATED, off critical path |

## Research notes

- **`z3-solver` is the official Z3 WASM npm package** ([npm](https://www.npmjs.com/package/z3-solver), [Z3 JS guide](https://microsoft.github.io/z3guide/programming/Z3%20JavaScript%20Examples/)). Init: `const { init } = await import('z3-solver'); const { Context } = await init();` then `const z3 = Context('main')`. High-level API mirrors Z3Py.
- **Threads/SharedArrayBuffer:** required by the package. **Node has it; browsers need COOP/COEP headers.** We run Node-side → non-issue. Recorded as the gated Path B risk only.
- **`init()` is async + one-time.** Wrap in a memoized singleton (`getZ3()`); never re-init per query. High-level API serializes long-running calls internally (not thread-safe to parallelize), so the prover stays sequential per process.
- **Encoding soundness ([CMU 15-414 SMT notes](https://www.cs.cmu.edu/~15414/f18/lectures/15-real-world-smt.pdf)):** "unsat = property holds" is the proof direction. To prove `rule(x)` holds ∀x, assert `¬rule(x)` and check `unsat`. Axioms/encodings over uninterpreted functions must stay *consistent* or everything proves trivially — so the mixed-type `+` MUST NOT be asserted as commutative arithmetic when operands may be strings.
- **Mixed int/string `+`:** model numeric `+` as Int/Real arithmetic; model possibly-string `+` as an **uninterpreted function** `str_concat(a,b)` (no commutativity axiom) so Z3 cannot prove `a+b = b+a` for strings. This ports Clear's existing numeric-type gate (`symbolic.js` inferParamTypes) into the encoder.
- **Counterexamples:** on `sat`, read the Z3 model to reconstruct concrete Clear values for FAILED verdicts.

## The seam (the load-bearing insight)

```
BEFORE:  AST → evaluateSymbolic() → Op(op,args) tree → simplify()+symEquals/symCompare → verdict {passed,unknown,observed,expected,check}
AFTER:   AST → evaluateSymbolic() → Op(op,args) tree → astToSmt()+Z3 check() ────────→ verdict {passed,unknown,observed,expected,check}
                                                        └ same verdict shape; everything ABOVE the seam is untouched ┘
CONCRETE MODE runs FIRST (evaluator.js); Z3 only on the symbolic fallback (free variables present).
```

Z3 replaces ONLY the boxed decision step. The verdict taxonomy, purity→UNVERIFIABLE detection, concrete mode, business-language explanations, agent closed-world closure analysis, enforcement tags, and runtime witnesses all sit ABOVE the seam and do not move.

## Keep / Replace / Archive map

**REPLACE (~380 LOC, `lib/prover/symbolic.js`)** — the only code Z3 subsumes:
- `simplifyOnce`/`simplify` fixed-point rewriter (~324–433): constant folding, identity/commutativity/associativity/distributivity, Phi-in-simplify (~335–344).
- `collectLikeTerms` (~500–524), `pullDivisionsOut` (~439–453), `expandDistribution` (~467–490), `canonicalize`/`byKey`/`symKey` (~551–587).
- `symEquals` (636 — verified 2026-06-25), `symCompare`/`boundImplies` (664 — verified 2026-06-25). <!-- both sync; become async-delegating to z3/decide.js -->.

**KEEP UNTOUCHED (~2000+ LOC)** — sits above the seam:
- Verdict taxonomy + `overallSymbolicStatus` (`index.js` ~1785–1791, 37–115, 1845–1882).
- Purity → UNVERIFIABLE (`evaluator.js` IMPURE_NODE_TYPES ~46–76; `index.js` findImpureNode ~1603–1637).
- Concrete mode (`evaluator.js` ~82–242) — runs FIRST; Z3 only on free-variable fallback.
- Business-language (`lib/proof-business-language.mjs`).
- Agent closed-world closure analysis (`index.js` proveCannotCall/proveCannotAffect/call_with_constraint) — pure graph reachability, never touches the solver.
- Enforcement tags, runtime witnesses, counterexample presentation.

**ARCHIVE — intentional backcompat (Russell explicitly instructed retaining the old engine as a restorable fallback):** copy the REPLACE functions into `lib/prover/legacy-symbolic/symbolic.js` with a header note, kept importable but unused.

**KEEP + PORT (the soundness gate):** the numeric-type inference (`symbolic.js` inferParamTypes ~245–279) and the `+`-commutativity guard (~360–381) are NOT deleted — their *logic* moves into the encoder (numeric `+` → arithmetic; possibly-string `+` → uninterpreted `str_concat`).

## Files

**New:**
| Path | Purpose |
|------|---------|
| `lib/prover/z3/session.js` | Memoized async `getZ3()` singleton wrapping `z3-solver` init; one Context per process. |
| `lib/prover/z3/ast-to-smt.js` | Translate Clear `Op(op,args)`/`Sym`/`Lit` trees → Z3 expressions; carries the numeric-type soundness gate. |
| `lib/prover/z3/decide.js` | `proveEquals`/`proveCompare`: assert ¬goal, `check()`, map sat/unsat/unknown + model → `{passed,unknown,observed,expected,check}`. |
| `lib/prover/legacy-symbolic/symbolic.js` | Archived copy of the replaced decision core. |
| `lib/prover/z3/z3.test.js` | New tests: Z3 boots; soundness gate; mixed-sort `+`; quantifier PROVED/FAILED; impure→UNVERIFIABLE. |
| `lib/prover/z3/parity.test.js` | Differential oracle: runs archived + Z3 engines over the corpus; asserts no PROVED→PARTIAL downgrades. |

**Modified:**
| Path | Change |
|------|--------|
| `lib/prover/symbolic.js` | Decision core delegates to `z3/decide.js`; keep `evaluateSymbolic` (tree builder) + the type-inference helper feeding the gate. |
| `lib/prover/index.js` | `proveTestSymbolic`/`proveRule` call the Z3-backed decider; verdict shape unchanged. |
| `package.json` | Add `z3-solver` dependency. |
| `lib/prover/symbolic.test.js` | Rewrite only cases asserting the OLD internal representation → assert observable verdicts. |

### Phased reads (read only what the phase needs)
- **Every phase:** `intent.md` (proof section), this plan.
- **Phase 0:** `package.json`, `lib/prover/symbolic.js` (top + REPLACE ranges).
- **Phase 1:** `lib/prover/symbolic.js` (evaluateSymbolic, inferParamTypes, the `+` gate).
- **Phase 2–3:** `lib/prover/index.js` (proveTestSymbolic ~1698–1766, proveRule ~1271–1522), `symbolic.test.js`.
- **Phase 4:** `lib/prover/{index,symbolic,runtime-witness,business-rules-eval}.test.js`, `examples/proofs/`.
- **Phase 5:** `intent.md`, `ROADMAP.md`, `PHILOSOPHY.md`, `FEATURES.md`.

## Phase 0 — Archive + Z3 boots in Node (HARDEST, FIRST)

Goal: prove `z3-solver` initializes and solves in Node before building anything on top.

- 🔴 **Test** (`lib/prover/z3/z3.test.js`): `getZ3()` returns a usable Context; assert `¬(2+2 = 4)` is `unsat` and `¬(x+0 = x)` over a free Int is `unsat`. Run `node lib/prover/z3/z3.test.js` → fails (no `session.js`).
- 🟢 **Code:** `npm i z3-solver`. Write `lib/prover/z3/session.js`:
  ```js
  let _z3;                                   // memoized singleton — init() is async + one-time
  export async function getZ3() {
    if (_z3) return _z3;
    const { init } = await import('z3-solver');
    const { Context } = await init();
    _z3 = Context('clear-prover');
    return _z3;
  }
  ```
- 🟢 **Archive:** copy the REPLACE functions verbatim into `lib/prover/legacy-symbolic/symbolic.js` with a header: `// ARCHIVED 2026-06-25: pre-Z3 term-rewriter decision core. Retained for restore per Russell. Not imported by the live prover.`
- 🔄 **Refactor:** none yet.
- **Green criterion:** `node lib/prover/z3/z3.test.js` passes; `npm test` (`node clear.test.js`) still fully green (nothing wired yet); archived file exists and is import-clean.
- 📚 update-learnings: capture any Z3-in-Node init gotchas (ESM dynamic import, init cost).

## Phase 1 — AST→SMT translator + the soundness gate (SECOND-HARDEST)

Goal: turn Clear's `Op/Sym/Lit` trees into Z3 expressions, with numeric-vs-string `+` correctly separated.

- 🔴 **Test** (`z3.test.js`): given a free-var type map, `astToSmt`:
  - `Lit(5)` → Z3 numeric; `Op('+', Sym('a'), Sym('b'))` with `{a:'number',b:'number'}` → arithmetic add.
  - same `+` with `{a:null,b:null}` (untyped) or string → **uninterpreted `str_concat`**, NOT arithmetic.
  - **Soundness assertion:** proving `a+b == b+a` is `unsat`/PROVED when numeric; is `sat`/NOT-proved (counterexample) when untyped/string. This is the bug fix — it must NOT come back PROVED for strings.
- 🟢 **Code** (`lib/prover/z3/ast-to-smt.js`): recursive translate. Signature `astToSmt(node, z3, env)` where `env` maps free-var name → `{z3Var, type}`. Numeric ops (`-`,`*`,`/`,`%`,`**`, and `+` when allNumeric) → Z3 arithmetic; `+` when not-allNumeric → a single declared uninterpreted `str_concat: (S,S)->S`; comparisons → Z3 `Lt/Le/Gt/Ge`; `==`/`!=` → `Eq`; `and/or/not` → Z3 bool; `Phi(c,t,e)` → `If(c,t,e)`. Reuse the existing `inferParamTypes` logic to populate `env` types (port, don't rewrite).
- 🧩 **Sort-resolution rule for `+` (P1 — no sort mixing):** resolve the operator's sort BEFORE translating, never mix sorts in one Z3 term:
  - ALL operands provably numeric (typed number OR numeric literal) → Z3 arithmetic `+`.
  - ALL operands provably string → uninterpreted `str_concat` (string sort).
  - **MIXED or AMBIGUOUS** (e.g. numeric literal `5` + untyped `a`, or one string + one number) → do NOT guess and do NOT pass mixed sorts to `str_concat`. Emit the whole `+` term as a single fresh **opaque uninterpreted constant** so goals depending on it return PARTIAL/UNVERIFIABLE, never a guessed PROVED. (An honest "can't decide" beats an unsound proof.)
  - 🔴 **Test:** `5 + a == a + 5` with `a` untyped → returns NOT PROVED (PARTIAL), and does NOT throw a Z3 sort error.
- 🔄 **Refactor:** extract the numeric-gate predicate (`allNumeric(args, env)`) so Phase-2 deciders share it.
- **Green criterion:** translation + soundness + mixed-sort tests pass; the false-PROVED string case is gone; no Z3 sort-mismatch exceptions.
- 📚 update-learnings: the int/string `+` encoding decision.

## Phase 2 — Verdict mapping behind the existing seam

Goal: produce the EXACT existing verdict shape from a Z3 result, including universals and counterexamples.

- 🔴 **Test** (`z3.test.js`): `proveEquals(left, right, env)` returns `{passed:true, unknown:false}` for `a+b == b+a` (numeric, ∀); `{passed:false, unknown:false, observed:<model>}` for a false identity like `a*2 == a+2` (counterexample `a=3`); `{passed:false, unknown:true}` when Z3 returns `unknown` (e.g. a nonlinear goal it times out on, with a short timeout set). `proveCompare` covers `>,>=,<,<=`.
- 🟢 **Code** (`lib/prover/z3/decide.js`):
  - Build solver, declare each free var as a typed Z3 const, assert the NEGATION of the goal, `solver.check()`.
  - `unsat` → goal holds ∀ → `{passed:true, unknown:false}`.
  - `sat` → `{passed:false, unknown:false}` + read `solver.model()` → reconstruct Clear values into `observed` for the counterexample.
  - `unknown` → `{passed:false, unknown:true}` (drives PARTIAL upstream). Set a per-query timeout so nonlinear/quantified goals degrade to `unknown`, never hang.
  - `check` field passes through the comparison kind ('eq'/'neq'/'gt'/'gte'/'lt'/'lte').
- 🔄 **Refactor:** one `mapResult(check, kind, model, env)` helper shared by equals/compare.
- **Green criterion:** verdict-shape tests pass; shapes are byte-identical to what `index.js` consumers read (assert the object keys, not just truthiness).
- 📚 update-learnings: model→Clear-value reconstruction + the timeout→unknown mapping.

## Phase 3 — Wire into the prover, concrete-mode-first preserved

Goal: the live prover uses Z3 for symbolic decisions; nothing above the seam changes.

- 🔴 **Test:** an existing `index.test.js` symbolic case (e.g. a named-rule tautology proof) is run through the new path and yields the SAME verdict status (PROVED/PARTIAL/FAILED/UNVERIFIABLE) as before. Add an assertion that a CONCRETE test (no free vars) still runs via `evaluator.js` and NEVER calls Z3 (spy/guard).
- 🟢 **Code:** in `lib/prover/symbolic.js`, replace the bodies of `symEquals`/`symCompare` (and remove the simplifier they depended on) with calls into `z3/decide.js`, keeping `evaluateSymbolic` (the `Op/Sym/Lit` tree builder) and the type-inference helper. In `index.js`, `proveTestSymbolic` (~1698–1766) and `proveRule` (~1271–1522) keep their structure; only the decision call underneath changes. Concrete mode (`evaluateSymbolic` is only entered on a free variable) is untouched, so it still runs first.
- ⚠️ **Async seam (P0 — the dominant risk; `prove()` is SYNC today and called sync EVERYWHERE):** `symEquals` (symbolic.js:636) and `symCompare` (symbolic.js:664) are sync; `prove(source)` (index.js) is sync. Z3's high-level API is async (`solver.check()` returns a Promise), so `prove()` MUST become `async` and the chain `prove → proveRule/proveTestSymbolic → symEquals/symCompare → decide.js` must all become async/awaited. **This was misstated earlier — the CLI and server do NOT await; they call `prove(source)` synchronously.** Update EVERY call site:
  - **Production callers (await each):** `cli/clear.js:291` (`return proverModule.prove(source)`), `cli/clear.js:451` (`const bundle = prove(loaded.source)`), `studio/server.js:616` (`const bundle = prove(source)` — the `/api/prove` handler is already an async route, just add `await`), `scripts/audit-bundle.mjs:453`, `lib/proof-business-language.mjs:337`.
  - **Test callers (~47 sites):** every `const bundle = prove(src)` in `lib/prover/index.test.js` (16) and `symbolic.test.js` (31), plus `runtime-witness.test.js` and `business-rules-eval.test.js`, becomes `const bundle = await prove(src)`. Wrap each test file's body so top-level `await` works (async IIFE or an async runner).
  - **Green-wash guard:** add `process.on('unhandledRejection', e => { console.error(e); process.exit(1); });` to each prover test file so a forgotten `await` (a Promise asserted as if sync) FAILS loudly instead of passing. Without this, an un-awaited `prove()` returns a truthy Promise and bogus assertions pass.
  - **Completeness check (run after wiring):** `grep -rn "prove(" lib cli studio scripts --include=*.js | grep -v "await prove(" | grep -v "function prove" | grep -v "\.prove =" ` must return ZERO unexpected sync call sites.
  - **husky note:** the pre-commit gate runs `node clear.test.js`; confirm it still exits non-zero on a failing async assertion after the conversion.
- 🔄 **Refactor:** delete now-dead simplifier exports from `symbolic.js` (they live only in `legacy-symbolic/`).
- **Green criterion:** the symbolic subset of `index.test.js` passes; concrete-only proofs never hit Z3; `clear prove` on a sample `.clear` file returns the same top-level status as `main`.
- 📚 update-learnings: the sync→async propagation surface.

## Phase 4 — Port remaining theories + full regression gate

Goal: every case the existing prover suite exercises passes on Z3. This is THE proof the swap is at least as strong.

- 🔴 **Test:** run `node lib/prover/index.test.js`, `node lib/prover/symbolic.test.js`, `node lib/prover/runtime-witness.test.js`, `node lib/prover/business-rules-eval.test.js`, and the `examples/proofs/` bundle. Catalogue every failure.
- 🟢 **Code:** for each failing case, extend `ast-to-smt.js` with the theory it needs: strings as an uninterpreted sort with `str_concat` (no commutativity), booleans, and — only if the suite uses them — lists→Z3 arrays/sequences and records/enums→Z3 datatypes. Do NOT add theories the suite doesn't exercise (scope discipline).
- 🟢 **Test triage rule:** a test that asserts the OLD engine's *internal representation* (canonical term order, a specific simplified string) is rewritten to assert the observable *verdict*. A test asserting a verdict stays as-is and MUST pass. Document each rewritten test in the commit.
- 🛡️ **Differential parity gate (P1 — catch capability regressions, not just soundness):** the archived `legacy-symbolic/` engine is a differential ORACLE. Write `lib/prover/z3/parity.test.js` that runs BOTH engines over the same corpus (every `.clear` in `examples/proofs/` + the rule/test snippets in the four suites) and asserts: **no verdict downgrades from PROVED → PARTIAL/UNKNOWN.** A FAILED→PROVED change is allowed only if the old PROVED was the known unsound case (string `+`); document each. Any genuine PROVED→PARTIAL downgrade must be either fixed (algebraic pre-normalization before the Z3 call, a higher per-query timeout, or a stronger Z3 tactic like `qfnra-nlsat` for nonlinear goals) or explicitly justified in the commit as acceptable. Do NOT silently accept downgrades.
- 📣 **`unknown` is never silent:** when `decide.js` maps a goal to `unknown`/PARTIAL, log the goal (rule/test name + the encoded expression) so capability regressions surface during the run instead of hiding inside a green suite.
- 🔄 **Refactor:** consolidate the theory dispatch in `ast-to-smt.js` into one typed switch; ensure `legacy-symbolic/` is referenced nowhere live EXCEPT `parity.test.js`.
- **Green criterion:** `npm test` (`node clear.test.js`) green; all four prover test files green; `examples/proofs/` bundle reproduces prior verdicts; **`parity.test.js` shows zero unjustified PROVED→PARTIAL downgrades.**
- 📚 update-learnings: which theories the suite actually needed (informs the real surface).

## Phase 5 — New soundness/quantifier tests + docs cascade

Goal: lock the bug fix and the new power; update the surfaces that describe the prover.

- 🔴/🟢 **New tests** (`z3.test.js`): (1) an asymmetric string rule (`greeting = name + "!"` vs `"!" + name`) comes back NOT PROVED — the old false-PROVED is dead; (2) a true universal arithmetic identity (`(a+b)*(a-b) == a*a - b*b`) comes back PROVED ∀; (3) a false one (`a/2 == a*2`) comes back FAILED with a counterexample; (4) an impure rule still returns UNVERIFIABLE (purity boundary intact — Z3 never invoked).
- 🟢 **Docs cascade** (Clear's mandatory surfaces, prover-relevant ones):
  - `intent.md` — proof section: note the engine is now SMT-backed (Z3), the verdict taxonomy unchanged, the soundness gate for `+`.
  - `ROADMAP.md` — mark this phase complete; update prover line.
  - `PHILOSOPHY.md` — if it describes the prover's guarantees, update to "SMT-backed, sound per theory."
  - `FEATURES.md` / `FAQ.md` — update the "how does the prover work / what can it prove" answers.
  - `CHANGELOG.md` — add the entry.
  - Skip surfaces that don't apply (no new user syntax, so SYNTAX/USER-GUIDE/AI-INSTRUCTIONS/landing/system-prompt unchanged — state this explicitly in the commit).
- **Green criterion:** all new tests pass; `npm test` green; docs reflect the SMT backend.
- 📚 update-learnings: final lessons; note the gated Path B (in-browser proving) for the future.

## Edge cases

| Scenario | Handling |
|----------|----------|
| Z3 `unknown`/timeout on nonlinear or quantified goal | Map to `{passed:false, unknown:true}` → PARTIAL. Never hang: set per-query timeout. |
| Untyped/string `+` | Uninterpreted `str_concat`, no commutativity axiom → cannot false-PROVE. |
| Mixed-sort `+` (`5 + a`, `a` untyped) | Opaque uninterpreted constant for the whole term → PARTIAL, never a guessed PROVED; never pass mixed sorts to one Z3 function (no sort-mismatch crash). |
| Goal old engine PROVED but Z3 returns `unknown` | Capability regression — caught by `parity.test.js`. Fix via pre-normalization / timeout / `qfnra-nlsat` tactic, or justify. Logged, never silent. |
| Async green-wash (forgotten `await prove()`) | `unhandledRejection` guard in each test file fails the run; completeness grep catches missing awaits. |
| Concrete test (no free vars) | Runs via `evaluator.js` only; Z3 never invoked (guarded + tested). |
| Impure node (db/ai/network) | `findImpureNode` short-circuits to UNVERIFIABLE before any Z3 call. |
| Division by zero / partial ops | Guard in the encoder; if a rule's truth depends on it, prefer PARTIAL over an unsound PROVED. |
| Z3 init failure / package missing | `getZ3()` throws a clear error; `clear prove` reports "prover engine unavailable" (error teaches). |
| Async propagation | `prove()` is now a Promise; all call sites (`cli/clear.js`, `studio/server.js`, tests) await it — covered by a test. |

## Success criteria

- [ ] `lib/prover/z3/z3.test.js` green (boot, soundness gate, quantifier PROVED/FAILED, impure→UNVERIFIABLE).
- [ ] All four existing prover test files green on the Z3 backend.
- [ ] `npm test` (`node clear.test.js`) fully green.
- [ ] The asymmetric-string false-PROVED is gone; a true universal identity is PROVED; a false one FAILs with a counterexample.
- [ ] Concrete-only proofs never invoke Z3.
- [ ] `prove()` is async; every call site awaits it (completeness grep clean); `unhandledRejection` guard in each test file; husky gate still fails on a bad async assertion.
- [ ] `parity.test.js` (archived engine as differential oracle) shows zero unjustified PROVED→PARTIAL downgrades.
- [ ] No Z3 sort-mismatch on mixed-sort `+`; such terms return PARTIAL.
- [ ] `lib/prover/legacy-symbolic/symbolic.js` exists, import-clean, referenced nowhere live.
- [ ] Docs cascade done (intent/ROADMAP/PHILOSOPHY/FEATURES/FAQ/CHANGELOG).
- [ ] husky pre-commit passes; merged to local main; **NOT pushed**.

## Resume prompt

> Continue the Z3 prover backend in `C:\Users\rmill\Desktop\programming\clear` on branch `feature/z3-prover-backend`. Read `plans/plan-z3-prover-backend-06-25-2026.md`. Execute the next unchecked phase TDD-first (red→green→refactor). Regression gate: the four `lib/prover/*.test.js` files + `node clear.test.js` must stay green. Keep everything above the verdict seam untouched; archive (don't delete) the old core; port the `+` soundness gate into the encoder. Local only — do not push.
