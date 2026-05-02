# Rebuild plan: `rule:` keyword + named business rules + prover wiring

**Status:** unblocked. Use this if sandbox-Claude's patch can't be recovered.
**Date drafted:** 2026-05-02.
**Estimated agent work:** half a day to one full day, depending on scope cut.
**North star:** the regulated-tier pitch sentence — *"every named rule is proved against every possible input"* — needs the `rule:` keyword and per-rule prover attribution to land.

---

## What we're rebuilding

A new top-level Clear keyword, `rule`, that:

1. Reads in plain English: `rule deal-over-100k-needs-cro-signoff: ...`
2. Compiles to the same runtime check as `guard X or 'msg'` — refuses the request when violated.
3. Names the rule, so the prover, test failures, and audit logs can attribute by name.
4. Is recognized by `clear prove` and `clear test --prove` so each rule gets a per-rule verdict (`proved` / `unverifiable` / `disproved`).
5. Is documented across all Meph + user surfaces.

### Surface (what the author writes)

```
rule deal-over-100k-needs-cro-signoff:
  if deal's amount > 100000 and deal's cro_signoff is missing:
    refuse with 'Deals over $100k need CRO sign-off'
```

Also acceptable shape (sugar over `guard`):

```
rule discount-cap:
  refuse if discount > 30 with 'Discount over 30% needs VP approval'
```

### Verdict surface (what the prover output reads)

```
$ clear prove apps/deal-desk/main.clear

Business rules in this file:
  ✅ deal-over-100k-needs-cro-signoff   PROVED for every possible deal
  ✅ discount-cap                        PROVED for every possible deal
  ⚠  refund-cap                          UNVERIFIABLE — calls Stripe (effect)
  ❌ approval-window                     DISPROVED — counterexample: deal at exactly midnight

3 of 4 rules proved. 1 unverifiable (effect). 1 disproved.
```

That output IS the regulated-tier pitch surface. Marketing screenshots this.

---

## Templates already in main — copy these patterns

Two recently shipped node types follow the same shape and are the template:

### Template 1: `LIVE_BLOCK` (the `live:` keyword from Phase B-1)

Files / lines (search before editing — line numbers drift):
- **Synonyms:** `synonyms.js` — search `'live'` for the canonical-only entry.
- **Parser node-type constant:** `parser.js` — `LIVE_BLOCK: 'live_block'` near other top-level node types.
- **Parser dispatch:** `parser.js` — search `parseLiveBlock` and the dispatcher case in `parseStatement` or equivalent.
- **Parser function:** `parseLiveBlock(lines, startIdx, parentIndent, errors)` — returns `{ type: NodeType.LIVE_BLOCK, body: [...statements...], lineNumber }`.
- **Compiler emit:** `compiler.js` — search `case NodeType.LIVE_BLOCK:` — emits `// live: block — explicit effect fence` comment marker + inline body.
- **Validator:** none yet for LIVE_BLOCK (Phase B-1 was permissive); PC-3 is adding the rejection rule for effect-shaped calls outside `live:`.

### Template 2: `ROUTE_DEF` (the `route X by Y:` keyword)

Files / lines:
- **Synonyms:** `synonyms.js` — `route` entry.
- **Parser node-type constant:** `parser.js:210` — `ROUTE_DEF: 'route_def'`.
- **Parser dispatch:** `parser.js:2828` — entry point that calls `parseRouteDef`.
- **Parser function:** `parser.js:5161` — `function parseRouteDef(lines, startIdx, _parentIndent, errors)` — full implementation.
- **Compiler emit:** `compiler.js:7681` — `case NodeType.ROUTE_DEF:`.
- **Compiler prelude:** `compiler.js:13917` — adds `_clear_route_cursors` table once at module top when any route uses round-robin.
- **Validator:** `validator.js:785` — `case NodeType.ROUTE_DEF:` — three hard errors + warnings.

`ROUTE_DEF` is the closer template because it has a name (the entity-by-field signature) and a body of named cases (each `'value' to <owner>` rule). Copy its shape.

---

## AST shape for `RULE_DEF`

```
{
  type: 'rule_def',                       // NodeType.RULE_DEF
  name: 'deal-over-100k-needs-cro-signoff',  // identifier; parser dasherizes a quoted string if present
  lineNumber: 42,
  body: [ ...statement nodes... ],        // typically: [IF, REFUSE_WITH] or [REFUSE_IF]
  // The validator + prover annotate this in later passes:
  proofVerdict: undefined,                // populated by prover: 'proved' | 'unverifiable' | 'disproved' | null
  proofReason: undefined,                 // human sentence: "calls Stripe (effect)" or "counterexample: deal at midnight"
}
```

Rule names must be unique per file (validator hard-error if duplicate). Names should be kebab-case identifiers; if the author writes a quoted string (`rule 'Deals over $100k need CRO': ...`), parser dasherizes to `deals-over-100k-need-cro`.

---

## Parser implementation outline

Add to `parser.js`:

1. **NodeType constant** near `ROUTE_DEF`:
   ```js
   RULE_DEF: 'rule_def',
   ```
2. **Synonym** in `synonyms.js`: `rule: Object.freeze(['rule', 'business rule', 'policy'])` — keep the canonical word `rule`. (Russell's call on aliases — start canonical-only, add aliases when a real example shouts for them.)
3. **Dispatcher entry** in `parseStatement` (or wherever ROUTE_DEF dispatches): after detecting the `rule` token, call `parseRuleDef(...)`.
4. **`parseRuleDef(lines, startIdx, parentIndent, errors)`** — pattern:
   - Tokenize the header: `rule <name>:` — `<name>` is an identifier (a-z, 0-9, dashes) OR a quoted string that the parser dasherizes.
   - Push body lines until indent drops back to `parentIndent`.
   - Recursively parse body lines as ordinary statements (so `if`, `refuse with`, `guard`, `validate` all work inside).
   - Hard error if header has no `:` (`RULE_HEADER_NO_COLON`).
   - Hard error if body is empty (`RULE_BODY_EMPTY`).
   - Hard error if name is missing or unparseable (`RULE_NAME_REQUIRED`).
   - Hard error if name duplicates an earlier `rule` in the same file (`RULE_NAME_DUPLICATE`).
   - Return the AST node above.

---

## Compiler emission

Add to `compiler.js`:

1. **JS backend case** near `case NodeType.ROUTE_DEF:`:
   ```js
   case NodeType.RULE_DEF: {
     // Emit a labeled comment then inline the body. The body's REFUSE_WITH
     // (or guard) statements already compile to throw / 400 returns.
     const lines = [
       `${indent}// rule: ${node.name} (line ${node.lineNumber})`,
       ...compileStatements(node.body, ctx),
     ];
     return lines.join('\n');
   }
   ```
2. **Python backend case** — same shape, Python-style comment.
3. **Source-line comment** — preserve `// clear:LINE` already-emitted convention so stack traces map back.

The body compiles using the existing statement compilers (`if`, `refuse_with`, `guard`, `validate`). No new runtime semantics needed — `rule:` is a labeled wrapper that names the block.

---

## Validator hooks

Add to `validator.js`:

1. **`case NodeType.RULE_DEF:`** in `checkNode`:
   - **HARD errors:**
     - `RULE_NAME_DUPLICATE` (caught at parse time too, but defense-in-depth)
     - `RULE_BODY_EMPTY`
     - `RULE_OUTSIDE_TOP_LEVEL` — rules can't be nested inside endpoints, functions, or other rules.
   - **WARNINGS:**
     - `RULE_NO_REFUSAL_PATH` — body has no `refuse with`, `guard`, or `send back ... with status 4xx`. The rule never enforces anything.
     - `RULE_NAME_NOT_KEBAB` — name has spaces or punctuation that wasn't dasherized cleanly.
2. **Cross-rule check** — collect all `RULE_DEF` names in a single pass and add to a registry the prover can read.

---

## Prover wiring (the load-bearing piece for the pitch)

Touch `runtime/prover/` (or wherever the symbolic engine lives — check `cli/clear.js prove` for the entry point).

1. **Per-rule verdict.** When the prover walks an AST and sees `RULE_DEF`, treat the body as a separate proof obligation. Run the symbolic engine on the body alone with the same path-constraints and type-aware checks PC-7/PC-X1 already do.
2. **Verdict mapping:**
   - `proved` — symbolic engine returned no counterexample for any input.
   - `disproved` — symbolic engine found a counterexample. Emit the counterexample (e.g. "deal at exactly midnight").
   - `unverifiable` — body calls something inside a `live:` block, or the engine ran out of depth.
3. **Output.** Update `clear prove` CLI output (currently just totals) to add a per-rule section:
   ```
   Business rules in this file:
     ✅ <name>  PROVED for every possible <input-type>
     ❌ <name>  DISPROVED — counterexample: <details>
     ⚠  <name>  UNVERIFIABLE — <reason>
   ```
4. **Auto-prove integration.** PC-8 already wires `clear test` to call the prover. Extend `summarizeProofBundle` in `cli/clear.js` to render the per-rule section above the existing totals line.

---

## Test patterns

Add to `clear.test.js` under a `describe('rule keyword')` block:

1. **Parse tests:** rule with name, rule with body, rule with quoted-string name (dasherized), duplicate name (hard error), empty body (hard error), nested rule inside function (hard error).
2. **Compile tests:** rule body emits with rule name in a leading comment; refuse-with inside rule still throws/400s; guard inside rule still works.
3. **Prove tests (small fixtures):**
   - `proved` case: rule that's a pure inequality like `if amount > 100000: refuse with 'too big'` — symbolic engine should prove it.
   - `disproved` case: rule with a counterexample the engine can find.
   - `unverifiable` case: rule that calls something inside `live:`.
4. **Multi-rule file:** at least one fixture with 3+ named rules, each with a different verdict, and assert the CLI output renders all three with the right icons.

Also add at least one test that confirms `clear test --prove` (PC-8) outputs the per-rule summary.

---

## Doc cascade — every surface gets a section

In the SAME commit (or a tightly-coupled commit chain) as the parser/compiler/prover changes:

1. **`intent.md`** — add `RULE_DEF` row to the node-type table. Increment node count in the header.
2. **`SYNTAX.md`** — add a `rule` section near `guard` and `validate`. Show the canonical form, the `refuse if` sugar, the named-rule advantage, and an example with a `clear prove` verdict block.
3. **`AI-INSTRUCTIONS.md`** — add a "Business rules" section. Cover when to use `rule:` (named, provable) vs raw `guard` (one-off check inside an endpoint). Show the `do this / don't do this` form.
4. **`USER-GUIDE.md`** — add a tutorial chapter "Writing business rules." Build a deal-desk example with three named rules, run `clear prove`, show the verdicts. Make it teachable to a 14-year-old.
5. **`playground/system-prompt.md`** — Meph reads this every session. Add a section under "what you can write" that teaches the `rule:` keyword, its name, and how `clear prove` reports verdicts. Without this, Meph won't write rules even after they ship.
6. **`.claude/skills/write-clear/SKILL.md`** — same as system-prompt but for Claude (not Meph) when writing Clear.
7. **`ROADMAP.md`** — mark the rule keyword + prover attribution as shipped under the Decidable Core epic.
8. **`FAQ.md`** — three new entries:
   - "How do I write a business rule in Clear?"
   - "How do I prove a business rule holds for every input?"
   - "Why use `rule:` instead of raw `guard`?"
9. **`RESEARCH.md`** — note the per-rule prover attribution in the capability surface section. This is the regulated-tier pitch piece.
10. **`FEATURES.md`** — add a row under the language category: `rule <name>:` — provable named business rule. Canonical form + notes.
11. **`CHANGELOG.md`** — session-dated entry: what shipped, why for launch, tests passing.
12. **`learnings.md`** — only if a real bug story emerged during the rebuild. Otherwise skip.
13. **`cookbook.md`** — yes, even cookbook. Cookbook is the playbook for "what makes Clear distinctive as an AI-first repo." Add a short section in the Philosophy or Examples block: "Named, provable business rules — every CRO-facing policy can be a one-liner with a math-grade verdict next to it." This is the part Russell asked to add.

---

## Demo files (Phase B-1 already shipped a 60-proof harness — extend it)

In the prover branch the sandbox built, there were 7 demo files including a calculator self-test that confirmed Meph could write the syntax. Recreate the equivalent locally:

- `apps/deal-desk/main.clear` — convert 3-4 existing `guard` checks to named `rule:` blocks. Keep tests passing.
- `apps/lead-router/main.clear` — same.
- `examples/rule-keyword-tour.clear` — a small file with one `proved`, one `unverifiable`, and one `disproved` rule for the prover demo.
- Add the tour file to the prover's regression suite so it can't silently break.

---

## Suggested commit chain (TDD discipline)

1. `test(rule): failing parser tests for rule keyword` — red.
2. `feat(parser): RULE_DEF node type + parseRuleDef + dispatcher` — green.
3. `test(rule): failing validator tests for duplicate-name + empty-body + outside-top-level`.
4. `feat(validator): RULE_DEF hard errors + warnings`.
5. `test(rule): failing compiler tests`.
6. `feat(compiler): emit RULE_DEF for JS + Python backends with name comment`.
7. `test(rule): failing prover tests for per-rule verdicts`.
8. `feat(prover): per-rule attribution in clear prove output`.
9. `feat(cli): clear test --prove renders per-rule section (extends PC-8)`.
10. `feat(deal-desk): convert guards to named rules`.
11. `feat(lead-router): convert guards to named rules`.
12. `feat(examples): rule-keyword tour file with proved + unverifiable + disproved`.
13. `docs(rule): cascade across all 13 doc surfaces`.

13 commits. Each has one test-or-feature concern. Each compiles green before the next.

---

## Estimated wall-clock

If a worker agent runs this end to end:
- Parser + validator + compiler scaffolding: 2-3 hours.
- Prover wiring (the load-bearing pitch piece): 2-3 hours.
- CLI output + auto-prove integration: 1 hour.
- Demos + tour file: 1 hour.
- Doc cascade: 1-2 hours.

Total: half a day to one full day on a focused agent run.

---

## What NOT to do

- **Don't make `rule:` a magic separate AST type that doesn't share with `guard`/`if`/`refuse`.** It's a labeled wrapper. Body is normal statements. Reuse what works.
- **Don't add aliases yet.** Canonical word is `rule`. Add `policy` or `business rule` only when an example argues for it.
- **Don't skip the prover wiring.** The whole point is the per-rule verdict. Without it, `rule:` is just a comment with extra steps.
- **Don't pad the prover with "rule" examples that aren't real.** Every demo must compile clean and produce an honest verdict — `proved`, `unverifiable`, or `disproved`. Faking it kills the pitch.
- **Don't stop at parser+compiler.** All 13 doc surfaces. The cookbook entry Russell flagged is part of the deal.

---

## Recovery alternative (try first)

Before running this rebuild, attempt sandbox recovery once:
1. Open the cloud-Claude session that produced the work.
2. Ask it to run `git format-patch main..feature/decidable-core-prover --stdout` and paste the FULL output.
3. Save locally as `~/Desktop/rule-keyword-recovery.patch`.
4. `git checkout -b feature/rule-keyword-from-sandbox && git am ~/Desktop/rule-keyword-recovery.patch`.
5. If it applies clean, you're done. Push and move on.

If the sandbox is unreachable / hung / unresponsive, run this rebuild plan instead. Do NOT spend more than 30 minutes on recovery before pivoting — sunk cost is real but the rewrite is bounded.

---

## Why this matters for launch

The **`rule:` keyword + per-rule prover verdict** IS the regulated-tier pitch. Without it, Clear says "we have a math prover, somewhere, you can run on your file." With it, Clear says "every named business rule in your app has a verdict next to it: proved for every possible input, unverifiable, or disproved with a counterexample. Your CRO sees the list. Auditors see the list. The list is the audit trail."

That's the sentence that closes a deal in regulated industries. Lose it, and Clear is "another low-code tool with a prover bolt-on." Keep it, and Clear is "the business-rules language with mathematical guarantees."

The sandbox session built it once and lost it to a bad remote. This plan rebuilds it cleanly so it lands on the real GitHub remote, hooked into the new sandbox-detection guard so it stays there.
