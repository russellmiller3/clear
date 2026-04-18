# Clear Research Notes — RL, Self-Play, and the Training Signal

How Clear's architecture creates a self-improving AI coding system without fine-tuning access.
Updated: 2026-04-17.

---

## The Core Insight: Meph Solves the Oracle Problem

Every AI code generation system has the same problem: **who grades the output?**

Lovable, Bolt, Cursor — they all need a human to look at the result and say "yes, that's right." That's expensive, doesn't scale, and is impossible to do automatically.

Clear sidesteps this because **Meph writes the test before the code.** The test is the oracle. It's machine-readable, deterministic, and authored by the agent itself before it knows what the implementation will look like. That means:

- No human labels needed
- The agent can't game it by writing the test after the fact
- The oracle is baked into the artifact, not external to it

Cursor generates code and you validate. Clear generates, self-validates, and the validation is written *before* the generation.

---

## Meph as Actor and Critic — Reversed

Standard actor-critic in RL: actor proposes actions, critic grades them.

Meph does the same thing but with the order flipped. **Meph writes the critic (the test) first, then acts (writes the function).** The critic is frozen before the actor runs. This is stronger than standard actor-critic because:

1. The critic can't be gamed retroactively
2. The actor can't write code that passes a test it designed around its own code
3. The red→green sequence is a verifiable trace — you can confirm the ordering mechanically

The red→green sequence is the training signal:
- **Red step:** test runs, fails. Meph didn't write the function yet.
- **Green step:** function written. Test passes.

A red→green sequence with no cheating (no test rewrite between red and green) is a clean, self-supervised training example. **No human needed.**

---

## The Flywheel

```
Sessions run
    │
    ▼
Each session → labeled example
(features: error type, patch ops, assertion quality, red-step)
(label: did tests pass at the end?)
    │
    ▼
Re-ranker trains on labeled examples
(~200 sessions → first XGBoost model)
    │
    ▼
Re-ranker filters patch candidates
before sandbox eval
    │
    ▼
Fewer sandbox runs → faster sessions
→ more sessions → more examples
    │
    └──────────────────────────────┐
                                   ▼
                            Better re-ranker
```

The mechanical quality signals bootstrap this loop. They don't require ML — they're deterministic checks that score sessions immediately, before you have enough data to train anything.

---

## Mechanical Quality Signals (The Bootstrap)

ML needs labeled data. You don't have it yet.

So start with deterministic signals that produce a quality score on day 1:

**Static lint (compiler-side):**
- `expect X is not empty` — checks existence, not value. Weak.
- `expect X is true` — bare boolean, no context. Weak.
- Single assertion in an entire test block — yellow flag.

**Process lint (server-side):**
- Did `run_tests` fail at least once before it passed? (`red_step_observed`)
- If tests went green on the first call, no red step happened — skip TDD entirely.

Both produce `weak_assertion_count` and `red_step_observed`. These become:
1. Immediate quality filter (gate bad sessions before storage)
2. Features in the re-ranker model once you have enough data

Mechanical signals never go away. They become features in the learned model, not a replacement for it.

---

## The Re-Ranker: Architecture Recommendation

The re-ranker is a **bouncer** — it filters patch candidates before the expensive sandbox (compile + run + test, 5–30s each) runs them. Even 60% accuracy cuts sandbox cost significantly.

**What it's trained on:**
- Input: `(error_category, patch_op_type, node_types_touched, weak_assertion_count, red_step_observed)`
- Label: did the final `run_tests` show `ok: true`?

**Recommended sequence:**

| Phase | Model | Data needed | Why |
|-------|-------|-------------|-----|
| Now | Mechanical signals only | 0 | Deterministic, free |
| ~200 sessions | XGBoost on structured features | ~200 labeled sessions | Fast to train, interpretable, works on tabular |
| ~2k sessions | Add JS embedding | 2k+ sessions | Embed compiled JS diff (not Clear source — JS has massive training data behind it). `text-embedding-3-small` on before/after diff |
| ~5k sessions | Fine-tune on Clear | 5k+ sessions | Model learns Clear-specific patterns directly |

**Why JS embeddings, not Clear embeddings:**
Clear is a tiny corpus. JS has billions of examples in every model's training data. Embedding the compiled JS diff puts you in a rich semantic space. Clear source → JS → embed is a better path than Clear source → embed directly.

**Why structured features first:**
XGBoost on 5–10 features trains in seconds, is interpretable (you can see which features matter), and works with 200 examples. Don't jump to neural embeddings until you need them.

---

## The GA: Why Genetic, Not Beam Search

Standard beam search exploits what works and stops exploring. It finds local optima fast — good for discount calculators, bad for L7–L10 curriculum tasks that require exploration.

**Genetic algorithm adds:**
- **Recombination:** splice two successful patch sequences together. Get candidates neither parent would produce.
- **LLM-as-mutation:** rewrite one patch-op differently, validate via Jaccard similarity before running sandbox. This is the AlphaEvolve/FunSearch pattern.
- **MAP-Elites for diversity:** a behavioral grid where each cell (task_type × error_category) keeps its best-fitness resident. Prevents the GA from collapsing to one successful strategy.

Beam search finds the answer to the problem you tested. GA finds solutions that generalize.

---

## The RL Gym: What's Built vs What's Missing

Clear's deterministic compiler, structured errors, constrained action space (patch.js), and built-in test syntax make it a natural RL gym.

| Component | Status |
|-----------|--------|
| Sandbox runner | ✅ Built — isolated child process, timeout, memory limit |
| Curriculum | ✅ Built — 20 benchmarks, 10 difficulty levels |
| Structured eval API | ✅ Built — `compileProgram()` returns JSON scores/stats/warnings |
| Patch API | ✅ Built — 11 structured edit operations = constrained action space |
| Source maps | ✅ Built — runtime errors map to Clear line numbers |
| HTTP test assertions | ✅ Built — `call POST /path`, `expect response status` = reward function |
| Mechanical quality signals | 🔜 Next — static + process lint, session JSON storage |
| Session registry | 🔜 Supervisor plan phase 1 |
| Re-ranker (XGBoost) | 🔜 Needs ~200 labeled sessions first |
| Fine-tuning | ❌ No access yet — retrieval/memory bridge until then |

**Current blocker:** no fine-tuning access. The gym is ready. Can't train athletes yet. The supervisor + GA + re-ranker plan is the bridge — it uses retrieval/memory instead of fine-tuning, so it works today. Fine-tuning slots in on top when available.

---

## What This Doesn't Buy (Honest Assessment)

- **Not recursive self-improvement.** The agent improves at writing Clear programs. It doesn't improve the compiler, the language, or itself.
- **Not emergent intelligence.** Better re-ranking is faster search, not smarter search.
- **Not guaranteed quality at any sample size.** A bad agent with a weak test can still game the oracle if the test is trivially weak. That's what the mechanical signals address.
- **Not a replacement for human review.** The compiler catches structural bugs. It doesn't catch wrong business logic.

The honest pitch: **this buys faster synthesis and better eval coverage at lower cost.** That's not a small thing. It's a compounding advantage over systems that require human-in-the-loop grading. But it's not AGI.

---

## Where This Fits the Thesis

Clear's thesis is that the compiler is an alignment layer — the thing that enforces what AI output is allowed to do. The research bet is that this constraint (AI writes in a constrained language → compiler validates) makes the training signal cleaner than free-form code generation, and that cleaner training signals compound over time into meaningfully better AI coding behavior.

The constraint is the feature. Bounded action space → interpretable failures → clean reward signal → better learning.

Full thesis: see **[FAQ.md — What is Clear's big thesis?](FAQ.md#what-is-clears-big-thesis)**
Supervisor plan: see **[plans/plan-supervisor-multi-session-04-17-2026.md](plans/plan-supervisor-multi-session-04-17-2026.md)**
