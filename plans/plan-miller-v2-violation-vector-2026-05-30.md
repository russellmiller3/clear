# Plan — Miller v2 Violation-Vector Engine (2026-05-30)

## Goal

Represent app-completeness as a **structured violation vector** instead of a flat pass/fail list.

- **Plain English:** the app-checker stops handing back an unordered pile of "these things are
  missing." Instead it groups failures into named lanes (workflow, enforcement, role-check, audit),
  scores them so a missing approval crushes ugly spacing, and hands back a to-do list ranked
  worst-first.
- **Technical:** `constraints → ViolationVector V → priority-weighted energy E = P(V) → ranked
  repair hints`. The vector is the primary object; energy is a derived projection.

## The one novel, falsifiable claim we are testing

Many domains admit a `constraints → V → E → solve` decomposition — that part is well-trodden
(weighted MaxSAT, soft-constraint hierarchies, penalty methods, A* cost-to-go). The genuinely
new claim, and the only one Clear is uniquely positioned to test:

> **Can we automatically construct a Miller-admissible violation vector from natural-language
> requirements, and does that representation catch fake-complete apps better than flat pass/fail?**

The deal-desk fake-complete app (`discount_percent` + `status='Pending'`, no real CRO approval)
is the canonical test case. Today Ralph already blocks it; Miller v2 must additionally *explain
why* as a vector `(workflow=1, enforcement=1, role_check=1, evidence=2)` and rank the repair.

## Non-goals (explicitly OUT)

- **Physical / symbolic solver demos** (robot arm, maze, blocks-world *simulators*). They hand-build
  V, so they do not test the auto-construction claim, and they are off the launch critical path.
- **Replacing the existing detectors or the prover.** Miller is a *re-scoring layer* that CONSUMES
  the audit's per-requirement results. It never re-decides pass/fail (learnings: "don't make layers
  fight to be the authority on a verdict").
- **Changing Ralph's gate decision.** `audit.ok` stays identical. Only the OUTPUT becomes structured.

## Architecture (framework, not slice)

```
lib/miller/index.js            general, domain-agnostic engine (pure functions, zero Ralph knowledge)
  buildViolationVector(violations, families) -> { vector, families }
  projectEnergy(vector, families, opts)       -> number  (priority-preserving)
  generateRepairHints(violations, families)   -> ranked [] (worst-first)
  evaluate(violations, families, opts)        -> { vector, energy, hints }
lib/miller/index.test.js       admissibility-axiom tests + conformance tests on a toy domain

studio/supervisor/miller-ralph.js   adapter: maps each audit item -> {family, magnitude, hint}
                                    using the detector that produced it. Consumer #1 of the engine.
studio/ralph-layer.js               formatRalphMessage() shows vector + energy + ranked hints
```

The engine is the reusable core. Ralph is the first consumer. A toy-domain conformance test (a
tiny hand-built constraint set) proves the engine is domain-agnostic — cheaply, no physics sims.

## The 4 Miller-admissibility axioms (each a test)

1. **Coverage** — every family with ≥1 declared constraint appears in V (magnitude 0 if unviolated).
2. **Monotonicity** — increasing any single family's violation magnitude never decreases energy.
3. **Distinguishability** — distinct families are distinct vector dimensions; never collapsed to one total.
4. **Priority preservation** — one violation in a hard family outweighs *all* soft-family violations combined.

## Energy projection math (priority-preserving)

Positional-base weighting (the rigorous form of the prompt's `1000*approval + audit`):

```
B = maxMagnitude * familyCount + 1          // stable base, NOT derived from the specific vector
weight(tier) = B ^ tier
E = Σ_family ( magnitude_family * B ^ tier_family )
```

`B = maxMagnitude*familyCount + 1` guarantees one unit at tier t exceeds the max total of all
lower tiers, so priority preservation holds for any magnitudes ≤ maxMagnitude. This also makes
**Miller-equivalence** precise: any weights satisfying the tier-separation inequality induce the
same ordering. Runtime guards (per "Silent Bug Guards"): throw if any magnitude > maxMagnitude,
or if `B ^ maxTier` would exceed `Number.MAX_SAFE_INTEGER`. Keep tiers small (0–2 for Ralph).

## TDD cycles

1. **Engine core** (this commit): the 4 axioms + ranked-hints + `evaluate`. Red → green.
2. **Toy-domain conformance**: point the engine at a hand-built constraint set; assert axioms hold
   on a second, unrelated domain (proves general, not Ralph-shaped).
3. **Ralph adapter**: detector → family + tier map; `auditRequirements` items → engine violations.
   Test the deal-desk fake-complete app produces `(workflow, enforcement, role_check, evidence)`.
4. **Message swap**: `formatRalphMessage` renders vector + energy + worst-first hints. Gate `ok` unchanged.

## Red-team (failure modes → mitigations)

- **Layer-fight (double verdict).** Engine never sets pass/fail — it only re-scores existing items.
  Mitigation: `audit.ok` is computed exactly as today; Miller reads `items`, writes nothing back.
- **Family mapping is the new synonym swamp.** Detector→family is a small fixed table keyed on the
  detector that fired (not regex on prose). One family per detector; new detector = one new row.
- **Energy overflow / incomparable bases.** Fixed base from (maxMagnitude, familyCount), not the
  vector. Guards throw on out-of-range magnitude or unsafe `B^maxTier`.
- **Priority inversion** (soft pile outweighs one hard). Locked by the priority-preservation axiom test.
- **Unverified vs missing.** Both are violations but `missing` (hard) gets full magnitude;
  `unverified` (softer, no evidence either way) gets a smaller magnitude so it never blocks alone
  unless `blockOnUnverified` is set — preserves current Ralph behavior.

## Doc cascade (at phase end, not per commit)

`FEATURES.md` (new capability row), `FAQ.md` (where the Miller engine lives / how families map),
`RESEARCH.md` (the violation-geometry framing + the falsifiable claim + result), `CHANGELOG.md`
(session entry), `learnings.md` (any gotcha hit). `intent.md`/`SYNTAX.md` unaffected (no new
Clear syntax — this is checker internals).
