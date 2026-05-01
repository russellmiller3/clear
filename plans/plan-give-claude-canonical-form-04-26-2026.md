# Plan — `give claude` canonical form for AI calls

**Date:** 2026-04-26
**Status:** locked, ready to execute
**Branch (recommended):** `feature/give-claude-canonical`
**Replaces:** `ask claude 'prompt' with data` — the API-shaped two-arg form that has dominated SYNTAX.md and Meph's prompt for 6+ months.

The current canonical form for AI calls is API-shaped, not English-shaped. `response = ask claude 'You are a helpful assistant' with message` reads like an SDK call, not a sentence. Russell flagged this 2026-04-26: "is there a better way to say this? what are you trying to say."

The new canonical form: `give claude <data> with prompt: '<instructions>'` — verb-led, data-first, prompt-as-noun, one thought per line, no temp variables when the result is used once.

---

## Phase Order (load-bearing)

**Default track:** Path A — phases 1-7 ship the new form alongside the old one (additive, no migration cost on day 1) and migrate every existing example + template to the new form in the same commit cycle.

**Escalation:** Path B — phase 8 deprecates the old form with a compile warning. Phase 9 removes the old form entirely. Gated on Phase 7 completion (all existing apps + docs migrated, no compile errors).

**Why this ordering:** the additive Phase 1 means we can ship and test the new form on real apps without breaking any of the 14+ existing examples or 8 core templates. Once the new form is proven, we deprecate the old form (Phase 8) so any new apps using the old form get a warning. After a soak period, Phase 9 removes the old form for good. This matches the "compiler accumulates quality" pattern — fix once, every future app gets the new shape, old apps migrate at compile time.

| Phase | Path | Depends on | Status |
|-------|------|------------|--------|
| 1 — Tokenizer + synonyms (`give`, `prompt:`, `as`) | A | — | required |
| 2 — Parser case for `give claude <data> with prompt: '<X>'` | A | Phase 1 | required |
| 3 — Compiler emit (maps to existing `_askAI` runtime) | A | Phase 2 | required |
| 4 — Validator: `claude's reply` possessive access | A | Phase 3 | required |
| 5 — Multi-line prompt via indent-continuation | A | Phase 2 | required |
| 6 — Doc cascade across 11 surfaces | A | Phase 5 | required |
| 7 — Template sweep across every app in `apps/` | A | Phase 5 | required |
| 8 — Compile warning on old `ask claude '...' with <X>` form | B | Phase 7 (clean migration) | gated |
| 9 — Remove old form from parser | B | Phase 8 + soak period (1-2 sessions of real use) | gated |

---

## The fix — canonical examples Meph and humans should see

**Simple chat reply (most common):**

```clear
when user sends message to /api/chat:
  give claude message with prompt: 'be concise and helpful'
  send back claude's reply
```

Two lines. No temp variable. `give claude` is the verb. `message` is the data. `with prompt:` introduces the instruction string. `claude's reply` is the result, accessible via possessive on the `claude` pseudo-actor.

**Long prompt — wraps to indented continuation, still one expression:**

```clear
when user sends message to /api/chat:
  give claude message with prompt:
    'You are a deal-desk assistant.
    Reply only in JSON.
    Never invent customer names.'
  send back claude's reply
```

**Result reused — name it explicitly with `as`:**

```clear
when user sends message to /api/chat:
  give claude message with prompt: 'be concise' as answer
  save answer as new ChatLog
  send back answer
```

The `as <name>` clause names the result and earns its place by being referenced twice.

**Different verbs in the prompt — verb is in the instruction string, not the call:**

```clear
give claude article with prompt: 'summarize in one sentence'
display claude's reply

give claude lead_data with prompt: 'rate enterprise potential 1-10'
score is claude's reply

give claude document with prompt: 'extract every email address as JSON list'
emails is claude's reply
```

The call shape is identical regardless of task. Only the prompt string changes. No special syntax for "summarize" vs "rate" vs "extract" — the prompt does the work.

**No prompt — bare AI call:**

```clear
give claude message
send back claude's reply
```

Same shape, no `with prompt:` clause. The default is "respond helpfully to this input." Useful for chat where instructions are implicit.

---

## Why each token earns its place

- **`give`** — what WE (the program) are doing. Hands data to Claude. `ask` is reserved for what the user does to the app (`when user sends message...`). No verb collision.
- **`claude`** — pseudo-actor. Possessive access (`claude's reply`) is the canonical result reference. Same pattern as `caller's id` for the logged-in user.
- **`<data>`** — first argument, no quotes, no `with`. The thing being handed over.
- **`with prompt:`** — `prompt` is a noun phrase ("the prompt is X"). The colon is canonical (matches `validate post_data:`, `try:`, etc.) but the parser will accept `with prompt 'X'` without colon as a courtesy.
- **`'<string>'`** — the instruction. Required to be a string literal or a string variable.
- **`as <name>`** — optional, names the result. Without `as`, the result is `claude's reply`.

---

## What this kills

| Anti-pattern | Why it's gone |
|--------------|---------------|
| `response = ask claude 'You are a helpful assistant' with message` | Dummy variable + filler instruction + API-shape. Replaced by `give claude message with prompt: '...'`. |
| `answer = ask claude question` (one-arg form) | Ambiguous — is `question` the prompt or the data? Parser deprecated. |
| `reply is ask claude to answer message with prompt 'X'` | Tortured prose, four mental concepts in one line. Banned by the new "One Thought Per Line" PHILOSOPHY rule. |
| Inventing temp variable names just to bridge the call to `send back` | The result is `claude's reply` — no name needed unless reused. |

---

## Files involved

### New / heavily modified

| File | Change |
|------|--------|
| `synonyms.js` | Add `give` + `prompt:` + `as` to the synonym table. Bump `SYNONYM_VERSION`. |
| `parser.js` | New parse function `parseGiveClaude` for `give claude <data> [with prompt[:] '<X>'] [as <name>]`. New `GIVE_CLAUDE` node type in the freeze block. |
| `compiler.js` | New `case NodeType.GIVE_CLAUDE` mapping to the existing `_askAI` runtime helper. Same retry/timeout/streaming behavior as the old form — just a new front door. |
| `validator.js` | Allow `claude's reply` as a defined identifier inside any block that contains a `GIVE_CLAUDE` statement. Walk-up scope: most-recent `GIVE_CLAUDE` shadows earlier ones. |
| `clear.test.js` | 12+ new tests covering: simple form, multi-line prompt, `as <name>` rebinding, `claude's reply` access, no-prompt form, scope shadowing, error case for missing data, error case for `claude's reply` outside any `give claude` scope, three template-style end-to-end tests. |
| `PHILOSOPHY.md` | New rule: `## One Thought Per Line — No Expression Chaining`. Bans the `reply is ask claude to answer message with prompt 'X'` pattern. References the `give claude` form as the canonical alternative. |

### Doc cascade — every surface that has an `ask claude` example

| Surface | Action |
|---------|--------|
| `intent.md` | New `GIVE_CLAUDE` row in the spec. Mark `ASK_AI` (old form) as deprecated. Update node-type count. |
| `SYNTAX.md` | New "AI Calls" section using the canonical form. Replace ALL 14+ `ask claude` examples with `give claude` equivalents. Live Blocks section examples (line 342) get the new form. |
| `AI-INSTRUCTIONS.md` | New "AI Calls" subsection with canonical patterns. Update Common Mistakes table to flag the old form as deprecated. Update the cheat sheet bullets at the top. |
| `USER-GUIDE.md` | Replace every chapter that uses `ask claude` (chat agents, RAG, eval scoring) with the new form. |
| `playground/system-prompt.md` | Replace all 8+ Meph-facing examples. This is the highest-leverage surface — Meph reads it every session. |
| `FEATURES.md` | Update the "Talk to Claude inside your code" exec-summary line. Update the Core Language table row. |
| `CHANGELOG.md` | Session-dated entry describing the new canonical form + deprecation of the old. |
| `ROADMAP.md` | Mark the give-claude phase complete. |
| `RESEARCH.md` | Note in the flywheel section that the canonical-syntax change rolled through the canonical-examples library and Meph's system prompt. |
| `FAQ.md` | New entry "How do I call Claude from Clear?" pointing at the canonical form. Update any old answer that referenced `ask claude '...' with <X>`. |
| `landing/*.html` | Grep for `ask claude` in landing pages — any code snippet on the marketing pages must use the new form. The deal-desk demo and helpdesk pitches probably show AI calls. |

### Template sweep — every app in `apps/`

Every `.clear` file in `apps/` that uses `ask claude` (the helpdesk-agent, ecom-agent, anything chat-shaped, anything with eval scoring, anything with RAG retrieval) must be migrated to the new form in the same commit cycle.

**Process:**
1. `grep -rn 'ask claude' apps/` to enumerate all hits
2. Migrate each `.clear` file to use `give claude <data> with prompt: '<X>'`
3. Run the 8-template smoke test after each migration: `node -e "..."`
4. Confirm `clear test <file>` still passes for any app that has a test suite

**Expected count:** at least the helpdesk-agent + ecom-agent + any chat-style demo apps. Possibly more — the grep will tell us.

---

## Phases — TDD cycles in detail

### Phase 1 — Tokenizer + synonyms

**Cycle 1.1.** Add `give` to `synonyms.js` as a top-level keyword. Add `prompt` (with optional trailing `:`). Add `as` if not already there. Bump `SYNONYM_VERSION` from `0.33.0` to `0.34.0`. Update the version assertion test in `clear.test.js`.

**Test (RED):** `expect(SYNONYM_VERSION).toBe('0.34.0')` — fail until bumped.
**Test (RED):** `expect(tokenize('give claude X')).toContainKeyword('give')` — fail until `give` is recognized.

**Done when:** synonym table accepts `give`, `prompt`, `as`. Tokenizer produces the right token stream for `give claude data with prompt: 'foo'`. No regression on existing synonyms.

### Phase 2 — Parser

**Cycle 2.1.** Add `parseGiveClaude` to `parser.js`. Recognize the shape: `give claude <expr> [with prompt[:] '<string>' | <variable>] [as <identifier>]`. Produce a `GIVE_CLAUDE` AST node with fields `data`, `prompt` (optional), `resultName` (optional, default `claude_reply`).

**Test (RED):** parse `give claude message with prompt: 'be concise'` → AST has GIVE_CLAUDE node with `data='message'`, `prompt='be concise'`.
**Test (RED):** parse `give claude article with prompt: 'summarize' as summary` → `resultName='summary'`.
**Test (RED):** parse `give claude message` (no prompt) → `prompt=null`, valid.
**Test (RED):** parse error: `give claude` (no data) → "give claude needs a data argument".

**Done when:** parser handles all shape variations (with/without prompt, with/without `as`, with/without colon after prompt) and produces the right AST. Bad shapes give specific error messages.

### Phase 3 — Compiler emit

**Cycle 3.1.** Add `case NodeType.GIVE_CLAUDE` to `_compileNodeInner` and `compileNodeBackend`. Map to the existing `_askAI` runtime helper. Pass `data` as the user-message payload, `prompt` as the system instructions. Bind result to `claude_reply` (or the name from `as <X>`).

**Test (RED):** compile `give claude message with prompt: 'be concise'` → JS contains `_askAI(...)` call with `system: 'be concise'`, `messages: [{role: 'user', content: message}]`.
**Test (RED):** compile `give claude message` (no prompt) → `system` arg is undefined or empty default.
**Test (RED):** compile `give claude X with prompt: 'Y' as answer` → result variable is `answer`, not `claude_reply`.
**Test (RED):** Python backend parity — same shape compiles to Python correctly.

**Done when:** compiled JS + Python both call into the existing AI runtime with the right arguments. Streaming behavior matches the old form when `give claude` appears at statement level inside a POST endpoint.

### Phase 4 — Validator: `claude's reply` access

**Cycle 4.1.** In `validator.js`, when walking a scope that contains a `GIVE_CLAUDE` node, register `claude_reply` (or the `as <name>`) as a defined variable for any subsequent statement in that scope.

**Test (RED):** validate program `give claude X\nsend back claude's reply` → no errors.
**Test (RED):** validate program `send back claude's reply` (no preceding `give claude`) → error "claude's reply isn't defined yet — add a `give claude X with prompt: ...` line first."
**Test (RED):** validate scope shadowing — two `give claude` calls in sequence → second `claude's reply` refers to second call's result.

**Done when:** `claude's reply` is a defined name inside any block that has a preceding `give claude` statement, and undefined elsewhere with a clear error.

### Phase 5 — Multi-line prompt continuation

**Cycle 5.1.** Parser recognizes a multi-line string literal after `with prompt:` when the next line is indented. Treat the indented block as a single string until indent goes back.

**Test (RED):** parse a `give claude` with a 3-line prompt → prompt field contains all 3 lines joined with `\n`.
**Test (RED):** parse a `give claude` where the prompt is followed by another statement at the same outer indent → prompt is just the first line, no leak.

**Done when:** multi-line prompts work, and the parser correctly identifies where the prompt ends and the next statement begins.

### Phase 6 — Doc cascade

**Cycle 6.1.** `intent.md` — add GIVE_CLAUDE row, mark ASK_AI as deprecated, bump node-type count.
**Cycle 6.2.** `SYNTAX.md` — new "AI Calls" section, migrate all 14+ existing examples.
**Cycle 6.3.** `AI-INSTRUCTIONS.md` — new subsection + Common Mistakes update + cheat-sheet bullets refresh.
**Cycle 6.4.** `USER-GUIDE.md` — every chapter using `ask claude` migrates.
**Cycle 6.5.** `playground/system-prompt.md` — Meph's prompt gets the new canonical form (highest leverage).
**Cycle 6.6.** `FEATURES.md` + `CHANGELOG.md` + `ROADMAP.md` + `RESEARCH.md` + `FAQ.md` — surface-level updates.
**Cycle 6.7.** `landing/*.html` — grep for `ask claude` in landing, migrate every snippet.

**Done when:** the pre-push doc-drift detector (`scripts/doc-drift.mjs`) reports zero drift on the new keyword. Grep `ask claude` in repo returns zero hits in user-facing docs (only in deprecation-warning code + CHANGELOG history).

### Phase 7 — Template sweep

**Cycle 7.1.** `grep -rn 'ask claude' apps/` enumerate hits.
**Cycle 7.2.** Migrate each `.clear` file to the new form. Run the 8-template smoke test after each migration. Run `clear test <file>` for any app with embedded tests.

**Done when:** every app in `apps/` uses `give claude`. All 8 core templates compile clean. All embedded tests still pass.

### Phase 8 — Compile warning on old form (gated on Phase 7)

**Cycle 8.1.** When the parser sees `ask claude '<string>' with <X>`, emit a warning: `"'ask claude' with this shape is deprecated. Use 'give claude <data> with prompt: '<instructions>'' instead."`

**Done when:** old-form usage in any `.clear` file produces a warning. New-form usage produces no warning.

### Phase 9 — Remove old form (gated on soak)

**Cycle 9.1.** After 1-2 sessions of real use confirm no app still uses the old form, remove the old-form parser case. The deprecation warning is replaced by a hard error: "old `ask claude` form removed in v0.35. Use `give claude X with prompt: 'Y'` instead."

**Done when:** old form no longer parses. Any remaining old-form usage in any new app fails at compile.

---

## Testing strategy

- **Compiler unit tests:** all in `clear.test.js` under `describe('AI calls — give claude canonical form')`. Cover every shape, every error, every backend.
- **Template smoke:** `node -e "import { compileProgram } from './index.js'; ..."` after every phase that touches the compiler.
- **Embedded test runs:** `node cli/clear.js test <each migrated app>` to confirm runtime behavior didn't change.
- **Real-LLM eval:** run `node playground/eval-meph.js` after Phase 6.5 (Meph prompt update) to confirm Meph picks up the new form correctly. Required by CLAUDE.md "Real-LLM Eval Before Declaring AI Feature Done" rule.
- **Doc-drift detector:** `node scripts/doc-drift.mjs` after Phase 6 to confirm no surface drift.

---

## Resume prompt for an executor

> Read `plans/plan-give-claude-canonical-form-04-26-2026.md` end-to-end before starting. The "Phase Order (load-bearing)" block at the top names the default track (Path A, phases 1-7 ship the new form + migrate everything; Path B is gated deprecation/removal in phases 8-9). Execute Path A in order. After each phase, run `node clear.test.js` and the 8-template smoke. Don't skip Phase 6 (doc cascade) or Phase 7 (template sweep) — those are why we're shipping a canonical-syntax change at all. Don't start Phase 8 until 7 is fully clean. Russell will sign off on Phase 9 after a soak.

---

## Open questions (raise before starting if any)

1. Should `prompt:` (with colon) be the only canonical form, or accept both `prompt:` and bare `prompt`? Russell's call: canonical with colon, parser accepts both.
2. Should `claude` be the only pseudo-actor, or should we also support other names (`gpt`, `gemini`)? **Recommendation:** `claude` only for now. Multi-model selection happens via the existing `using 'claude-haiku-4-5-20251001'` clause, not via a different verb.
3. Should the old form's deprecation warning include an auto-fix hint? **Recommendation:** yes. The warning should produce the exact `give claude <data> with prompt: '<X>'` line that replaces it. Cheap to compute, makes migration trivial.

---

## What this unlocks

- **Cleaner Meph output.** Meph picks up the new form from `system-prompt.md` and emits it in every new app he writes. Lower compile-error rate (the old form's prompt-vs-data ambiguity is a real source of confusion).
- **Lower friction for non-coder reviewers.** Russell scans a chat app's source and reads `give claude message with prompt: 'be concise'` as a sentence. He doesn't have to translate API ceremony in his head.
- **Foundation for future English-shaped patterns.** Once `give claude X with prompt: 'Y'` is the established shape, similar forms can land for other primitives — `give browser url with action: 'extract pricing'`, `give worker job with deadline: '5 minutes'`, etc. The `give <actor> <data> with <named-clause>: '<X>'` pattern is reusable.

---

## What this does NOT change

- The underlying AI runtime — same retry, timeout, streaming, prompt-caching behavior. Just a new front door.
- The compiled output — the same JS/Python emits, just from a different parse path.
- Cost or performance — zero runtime difference.
- Any other Clear feature — purely additive at the language surface.
