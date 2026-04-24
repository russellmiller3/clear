# Engineering Learnings

Lessons learned during Clear compiler development. Scan the TOC before starting work.

## Table of Contents

| Section | Key Gotchas |
|---------|-------------|
| [Clear Compiler](#clear-compiler) | 1:1 rule, synonym collisions, tokenizer eats colons, CRUD in assignments |
| [Clear Compiler Refactoring](#clear-compiler-refactoring-2026-04-01) | Context object unifies per-language functions, parser-owned UI metadata, validation separate from codegen |
| [Clear CLI & Phases 12-14](#clear-cli--language-phases-12-14-2026-04-01) | Self-contained imports, parseExpression return shape, synonym gotchas, data shape field parsing |
| [Clear Runtime](#clear-runtime-2026-04-02) | CJS in ESM project, type coercion for params, constraint enforcement order |
| [Clear Adapters Phases 25-28](#clear-adapters-phases-25-28-2026-04-02) | define-as return shape, tokenizer eats braces, reserved keyword collisions, contentType mismatch |
| [Syntax v2 & Code Quality](#syntax-v2--code-quality-2026-04-03) | Scope out before parser gymnastics, E2E before unit tests, security-as-errors, GAN finds runtime bugs |
| [Interactive Patterns & Layout](#interactive-patterns--layout-2026-04-03) | Inline layout modifiers, behavioral vs CSS modifiers, toggle/checkbox collision, auto-generated tests |
| [Generated Code Quality](#generated-code-quality-2026-04-03) | Middleware ordering, HTTP status semantics, FK-aware E2E, unique email generation |
| [Compiler Refactoring Session 7](#compiler-refactoring-session-7-2026-04-03) | compileBody helper, extract node compilers, parseConfigBlock |
| [Theme & Preset System](#theme--preset-system-2026-04-04) | Synonym collisions with directives, app presets skip max-width, parseExpression nextPos |
| [Parser / DSL Extension](#parser--dsl-extension-2026-03-17) | New keywords go BEFORE continuation logic |
| [App Output Quality (Phase 29.1)](#session-app-output-quality-phase-291) | CSS reset kills Tailwind, context-aware rendering, single theme CSS, landing page presets |
| [Session 7: Major Feature Sprint](#session-7-major-feature-sprint-2026-04-07) | Explicit > auto-inferred, synonym collisions in display, event delegation, file input read-only, phone test prevents jargon, OWASP security validators |
| [Session 9: Error Translator + Silent Bug Guards](#session-9-error-translator--silent-bug-guards-2026-04-07) | _clearTry wrapping, _clearMap source map, blind agent testing, PUT data loss is systemic, Number("") returns 0, isSeedEndpoint ordering, runtime guards > compile-time guards |
| [Session 10: Agent Tier 7](#session-10-agent-tier-7--phase-80-parallel-agents-2026-04-08) | `do`→`then`, `log`→`show`, `run`→`raw_run`, `check`→`if`, `classify with`→`predict_with`, directive scanning before parseBlock, block-form sub-line consumption, singular/plural table matching, regex code wrapping |
| [Session 13: IDE Bug Fixes + Docs Viewer](#session-13-ide-bug-fixes--docs-viewer-2026-04-09) | Model ID blank response, backend-only compile uses `javascript` not `serverJS`, empty streaming bubble needs dots not blank, r.ok check before SSE, docs viewer markdown parsing |
| [Session 14: Parser + Validator Fixes + Web Tools](#session-14-parser--validator-fixes--web-tools-2026-04-09) | `owner` field silently dropped by RLS check, validator over-broad on `owner` field, Anthropic native server tools replace custom fetch/search |
| [Session 15: SQLite Persistence (Phase 47b)](#session-15-sqlite-persistence-phase-47b-2026-04-09) | ESM project + CJS runtime = `{"type":"commonjs"}` in runtime dir, WAL mode default, boolean coercion on read, sqlite_sequence try/catch |
| [Session 16: Landing Pages v2](#session-16-landing-pages-v2-2026-04-10) | `inLandingCard` array must include ALL card variants, `bg-primary/8` opacity fails with DaisyUI CSS vars, `oklch(from var(...))` inline style workaround, dark page screenshots timeout |
| [Session 17: Pareto 20 + IDE Chat v2](#session-17-pareto-20--ide-chat-v2-2026-04-10) | Context array checklist is MANDATORY for new presets, historyKeymap extraction for undo, Array.isArray guard for image+text messages, SVG sanitization strips scripts |
| [Session 18: ECharts Analytics Dashboard + Chart Syntax Upgrade](#session-18-echarts-analytics-dashboard--chart-syntax-upgrade-2026-04-10) | overflow-hidden collapses flex children, flex-col vs space-y-6 for scrollable content, ECharts init needs visible container, chart groupBy for all types, type-first chart syntax, removing `area` synonym from section, metric_card trend detection |
| [Session 19: Tests, Charts, Blog, Images](#session-19-tests-charts-blog-images-2026-04-10) | Component test fixes (4 distinct bugs), `photo`/`picture` synonym collisions, image element `ui` object shape, seed auto-dedup at compiler level, `db.findAll()` not `db.getAll()`, chart subtitle/stacked modifiers |
| [Session 26: Test Rewrite + Postgres + Railway](#session-26-test-rewrite--postgres--railway-2026-04-13) | Lazy table creation for CJS/async, SQL injection via table/column names, `can`/`does` synonym collision with RBAC, PRES overkill for small features, compiler-tests-everything principle |
| [Standard Chat Compilation Target](#standard-chat-compilation-target-2026-04-12) | Tree-shaker only scans bodyLines not HTML, DaisyUI v5 uses `--color-*` not `--p`/`--b1`, utility backtick strings for multi-line UTILITY_FUNCTIONS, input absorption requires same-nesting-level siblings |
| [Session 19b: Display as Cards](#session-19b-display-as-cards-2026-04-10) | `author` field must match before `name`/`title` in heuristics, `ui.tag = 'cards'` is third option, smart field detection by column name |
| [Session 19c: Component Stress Test](#session-19c-component-stress-test-2026-04-10) | Component names collide with content types, reserved name validator in `parseComponentDef()`, 8 edge case patterns all passing |
| [Session 20: GP Language Features](#session-20-general-purpose-language-features-2026-04-10) | `of`→`in` canonical, `using`→`with`, `returns`→`responds_with`, `exists in` is compound token `key_exists`, `parsePrimary` has no errors array, `run()` exits immediately, params are `{name,type}` objects, TRY_HANDLE uses `handlers` array, typed handler body indent math, Edit tool fails on large files with template literals |
| [Session 21: RL Foundation + Source Maps + Page Slugs](#session-21-rl-foundation--source-maps--page-slugs-2026-04-11) | npm require double-quotes bug, backend `// clear:N` always-on for source maps, `_clearLineMap` injected as line 2 (shift off-by-one), `pageNode` always sets route now (single-page apps safe because `hasRouting = pages.length > 1`), sandbox symlinkSync needs `'junction'` type on Windows |
| [Session 22: Compiler Requests + RL Infrastructure](#session-22-compiler-requests--rl-infrastructure-2026-04-11) | Optional chaining `?.` only for user-written possessive access (not compiler-generated `req.body`), `error.message` needs hard `.` (exception to `?.` rule), keyword guard must whitelist content-type words (`text`, `heading` etc.), `_pick` JSON.stringify for nested objects, `_revive` JSON.parse on retrieval, user-written TEST_DEF bodies go through `generateE2ETests` not `compileNode`, cron tokenizer splits `2:30pm` into multi-token sequence, patch API body indentation must always add 2-space prefix (not skip if already indented), `run command` capture mode via ASSIGN special-case (not exprToCode) |
| [Session 20: Compiler Bug Fixes + SVG Rendering](#session-20-compiler-bug-fixes--svg-rendering-2026-04-11) | Tree-shaker callback blind spot, conditional DOM needs reactive path, `text` guard too strict, SHOW needs DOM targets, bare SVG streaming |
| [Session 23: Agent Bug Fixes + Extended Thinking](#session-23-agent-bug-fixes--extended-thinking-2026-04-11) | SVG innerHTML namespace loss, `to_json` synonym collision in 3 places, Python dict keys must be quoted, Anthropic thinking signature for multi-turn, `toLocaleString` for display formats, CRUD auto-inject `:id`, multer module-scope, Python cron lifespan |
| [Session 25: Roadmap 5-12 + Click-to-Highlight](#session-25-roadmap-5-12--click-to-highlight-2026-04-12) | CM6 virtual rendering, param format normalization, postamble injection order, compile animation timing, `sourceMap: true` for frontend markers |
| [Session 25b: Core 7 Templates + E2E Testing](#session-25b-core-7-templates--e2e-testing-2026-04-12) | GET req.query vs req.body, one-op-per-line enforcement, npm dep auto-install, synonym propagation, typo suggestion guards, Playwright selector scoping |
| [Session 27: Studio Bridge + Friendly Tests + Unified Terminal](#session-27-studio-bridge--friendly-tests--unified-terminal-2026-04-14) | postMessage bridge gate needs dual check (`?param` AND `<meta>` for srcdoc iframes), helpers compiled outside `run()` can't see `let`s inside it (module-scope or bust), friendly errors need `_lastCall` tracker, `[clear:N]` tag in error string round-trips through stdout parser into IDE click handler, two competing SIGTERM handlers on Windows = `UV_HANDLE_CLOSING` libuv assertion, `_response`/`_responseBody`/`_lastCall` must be module-scope for `_expectStatus` shim |
| [Session 36: Function TDD + Supervisor Plan](#session-36-function-tdd--supervisor-plan-2026-04-17) | `insideFunction: true` required for `define function` body ctx, user functions shadow builtins via pre-scan, SSE `tool_start` fires twice (state-flag dedup), API key must match how server reads it, Playwright e2e push from main repo not worktree |
| [Session 37: Supervisor Multi-Session Architecture](#session-37-supervisor-multi-session-architecture-2026-04-17) | Multi-process over session globals, module-level shadow vars for polling, WAL mode registry, port availability check, async test timeouts, state machine monkey-patch testing |
| [Session 37: PERF-1 + PERF-2 pagination and aggregates](#session-37-perf-1--perf-2-pagination-and-server-side-aggregates-2026-04-17) | `from` canonicalizes to `in` (must use rawValue), table names can tokenize as keywords not identifiers, `length of get all` is wrong when list is capped — use SQL aggregate, runtime files are build-time copies not imports, `extractEqPairs` (SQL) vs `conditionToFilter` (in-memory) are different helpers |
| [Session 40: `caller` rename + compiler shadow bug + HINT_APPLIED reliability](#session-40-caller-rename--compiler-shadow-bug--hint_applied-reliability-2026-04-20) | Compiler magic-var mapping ignored lexical shadow (bug); `caller` as 1-word canonical eliminates Users-table exception; prompt-only Claude compliance ~50% in long loops — need server-side fallback; keyword-collision validator surfaces post/deploy/update/payment as bad receiving vars |
| [Session 41: End-to-end flywheel verification — first real measurement](#session-41-end-to-end-flywheel-verification--first-real-measurement-2026-04-21) | Three-intervention stack (prompt reflex + inline reminder + server fallback) got tag rate 43% → ~100%; first-ever negative labels (Meph rejects hints w/ reasons); ranker retrained on 6.6× data (52→344 pairs); archetype audit found 9/16 gaps, filled 8; compile-output opt-in saves $/sweep; `current_user` underscore now a synonym (surfaced by rejection reason row 1284) |
| [Session 44: cc-agent Windows stdin race + system-prompt size ceiling](#session-44-cc-agent-windows-stdin-race--system-prompt-size-ceiling-2026-04-23) | claude.exe 2.1.111 on Windows fails 100% of stdin-piped prompts (3s data-received check races Node's async pipe write); argv-only path hits 32KB Windows `CreateProcess` ceiling (ENAMETOOLONG) when Meph's 48KB system prompt is concatenated; fix uses `--system-prompt-file` for system + positional argv for user prompt + `stdio:['ignore',...]` to kill stdin entirely; 5.3% → ~60-75% pass rate; parallel-3 still flaky (separate ticket) |
| [Session 45: Python `belongs to` JOIN silent bug](#session-45-python-belongs-to-join-silent-bug-2026-04-24) | Python schema emitter appended `s` to lowercased FK target (`userss(id)` for `belongs to Users`); Python backend ctx was missing `schemaMap` so `compileCrud` couldn't find FK fields to stitch; fix: use `pluralizeName(f.fk)` + populate `pySchemaMap` + mirror JS's stitching loop; runtime smoke confirms embedded record on read |
| [Session 45b: Scheduled-task shutdown leak](#session-45b-scheduled-task-shutdown-leak-2026-04-24) | Every `background` / `cron` / `agent runs every` compiled to an anonymous `setInterval`/`setTimeout`, which kept the event loop alive after `server.close()`; unified `_scheduledCancellers[]` registry drained by SIGTERM and SIGINT; HH:MM recursive setTimeout solved by closure over a mutable `_curTimer` so the canceller always sees the currently-armed timer |
| [Session 45c: Multipart upload middleware auto-wiring](#session-45c-multipart-upload-middleware-auto-wiring-2026-04-24) | Client-side `upload X to '/api/foo'` always worked; server half received empty `req.body` because only `express.json()` was wired; compiler now walks nested AST (page > button > body) for UPLOAD_TO/ACCEPT_FILE, emits module-top multer + memoryStorage, injects `_upload.any()` middleware only on POST endpoints whose path matches an upload target — plain JSON POSTs untouched |
| [Session 45d: Auth-capability gate on mutation security check](#session-45d-auth-capability-gate-on-mutation-security-check-2026-04-24) | "DELETE/PUT needs `requires login`" was firing as a hard error even on apps with NO auth setup (no Users+password, no `allow signup and login`) — Meph had no valid move since `requires login` had nothing to check against; 25 rows / 50% give-up rate on Factor DB; fix gates the error on capability presence and batches auth-less cases into one summary warning at file top |

---

## Session 37: PERF-1 + PERF-2 pagination and server-side aggregates (2026-04-17)

### `from` tokenizes to `in` — parser must use raw value
`synonyms.js` maps `in`, `of`, and `from` all to canonical `in`. When adding the SQL aggregate branch (`sum of price from Orders` vs `sum of price in orders`), the parser cannot distinguish via `token.canonical`. Must use `token.rawValue === 'from'`. **Lesson:** when canonicalization collapses user-visible distinctions the parser needs to preserve, reach for `rawValue` — that's what it's there for. Don't hack around by adding new canonicals.

### Singular data shape names can tokenize as keywords
The `Returns` table in ecom-agent tokenizes as `{value: 'Returns', canonical: 'responds_with', type: 'keyword'}` — not an identifier. A type guard like `tokens[pos].type === TokenType.IDENTIFIER` rejects it. The existing `get all X` shorthand (parser.js line 8186) never had this problem because it only reads `.value`, no type check. **Lesson:** when parsing table names, only require capital-first — don't require IDENTIFIER type, because English words that match synonyms get tokenized as keywords even when used as proper nouns.

### `length of orders` becomes wrong when `get all` is capped
PERF-1 added a default LIMIT 50 to `get all`. Any template that did `orders = get all Orders` then `length of orders` for dashboard counts now reports max 50. The fix isn't `get every` (wasteful — fetches all rows just to count them); it's `count of id from Orders` — a single-row SQL aggregate. PERF-1 and PERF-2 are a package deal: pagination is safe only if aggregates don't need to fetch the list. **Lesson:** a safety default that corrupts existing behavior (capped counts in dashboards) needs a clean workaround shipped at the same time, not "coming later."

### Runtime files are COPIED at build, not imported
`runtime/db.js` and `runtime/db-postgres.js` aren't imported by the compiler — they're copied into each compiled app's `clear-runtime/` dir by the CLI. The initial plan confused the source location (`runtime/db.js`) with a supposed second file (`clear-runtime/db.js`) that doesn't exist. **Lesson:** before editing runtime files, run `find . -name "db.js"` — there might be only one source and the rest are build artifacts.

### `package.json` next to generated code shields CommonJS require()
When `clear build` produces `server.js` using `require()`, Node walks up the directory tree looking for the nearest `package.json`. If the user's project has `"type": "module"` (normal in modern Node projects), the generated file fails with "require is not defined in ES module scope." Fix: write a tiny `{"type":"commonjs"}` sibling `package.json` in the build output dir. Node stops walking at the sibling and treats the file as CJS. **Lesson:** when you generate code with a specific module system, ship a scope-asserting `package.json` next to it. Don't assume the parent directory's config is compatible.

### Virtual scrolling: DOM count decouples from data count
Fixed-height virtualization (40px rows, 560px container) keeps DOM rows bounded: 500-row table renders ~24 `<tr>`, 50,000-row table renders the same ~24. Top and bottom `<tr>` padding rows reserve scrollable height so the scrollbar geometry stays intact. Scroll event listener must bind ONCE per element (via `el._clear_virt_bound` flag) — a reactive re-render that re-binds on every paint would leak handlers. **Lesson:** when DOM cost is O(N) but only O(1) is visible, windowed render + sentinel padding cells + bind-once scroll listener is the canonical fix. Works even in vanilla JS, no framework needed.

### Literal vs runtime pagination need different codegen
PERF-5 pushes `page N, M per page` into SQL `LIMIT/OFFSET`. When `page` is a literal number, the offset can be precomputed at compile time: `(3 - 1) * 10 = 20` → `offset: 20`. When `page` is a variable (`incoming's page`), the offset must be a runtime expression: `offset: (page_n - 1) * 25`. The type guard (`typeof node.page === 'number'`) branches on this. **Lesson:** when a compile-time optimization and a runtime expression both go through the same slot, branch on AST node type, not a string template that silently inserts `undefined` or `NaN` for the wrong shape.

### conditionToFilter vs extractEqPairs — two helpers, different callers
`conditionToFilter` wraps complex conditions in a filter function (fine for in-memory `.filter()`). `extractEqPairs` extracts only equality pairs into a flat array (for SQL `.eq()` chains). SQL aggregates MUST use `extractEqPairs` — a function-filter can't compile to WHERE clause. When extractEqPairs returns `[]`, emit a compile-time error string rather than silently falling back. **Lesson:** when wiring a condition AST into a new sink (SQL, Supabase, in-memory), pick the helper that matches the sink's capabilities, not whichever one your neighbor used.

---

## Session 32: Eval feature post-ship bug hunt (2026-04-15)

Drove Meph through every agent+auth template to find where the shipped eval system breaks in practice. Four real bugs surfaced. All fixed.

### Streaming endpoint brace bug (compiler)
The streaming transform replaced `return res.status(N).json(...)` with three unbraced statements: `res.write('data: [DONE]...'); res.end(); return;`. When that appeared inside `if (cond) return res.status(N).json(...)`, only the first statement fell under the `if` — `res.end()` + `return` fired unconditionally. Every request terminated before the agent ran. **Lesson:** when a regex replacement produces multi-line output in a position that might be a single-statement slot (post-if, post-else), wrap in `{ ... }`. Single compound statement is always safe; three unbraced statements are a trap.

### `ask claude ... with var` inside `repeat until` (compiler)
The compiler converted every `let X = await _askAI(...)` to `let X = _askAIStream(...)` (async generator). When X was reassigned via `X = await _askAI('improve', X)`, the reassignment passed the generator back in as the `with` context. Claude received `[object AsyncGenerator]` instead of a string, produced nonsense. **Lesson:** only convert single-assignment vars to streaming. Vars with later reassignments must stay awaited strings so the next call gets real content. Scan body for `var =` (no `let`) and skip streaming for those vars.

### Auth-walled probes need two token formats
The compiler emits two different auth middlewares depending on template age. Modern templates use `jsonwebtoken` (3-part HS256 JWT, seconds-based exp). Legacy templates use `runtime/auth.js` (home-rolled 2-part HMAC, ms-based exp). The eval runner must mint the matching format per template — detected once at child spawn by regex-matching the emitted serverJS. **Lesson:** when multiple runtime shapes coexist, let the bridge layer detect at handshake time instead of trying to make one format work for all.

### patch_code crashed with "[object Object]" not valid JSON
The terminal-log formatter called `JSON.parse(res).applied` — but `res` was already the parsed object. JSON.parse coerced it to the string `"[object Object]"`, then threw, crashing the whole chat handler mid-loop. **Lesson:** when multiple variables hold the same thing in different shapes (raw string, parsed object), name them so the distinction can't be missed. `raw` vs `parsed` beats two indistinguishable `result`/`res`.

### Meph-driven fix-loop as a test methodology
Beyond finding bugs, driving Meph through a "fix the failures" loop on every agent template surfaced which bugs Meph can self-fix (behavior issues, probe shape) vs which are infrastructure (compiler, runner, tool wiring). **Lesson:** once you have a coding agent that can read source + run tests + edit source, the fastest way to find real-world breakage is to give it failing tests and watch where it gets stuck. Stuck = infrastructure bug. Progress = teachable.

### Probe timeout 45s → 90s
Single-LLM-call probes finish in 2-15s, but legitimate multi-step agents (`repeat until` refinement, sub-agent orchestration) chain 4-8 Claude calls and land at 30-60s. 45s abort surfaced as "Network error" on agents that were actually working — just slow. **Lesson:** abort budgets on agent probes need headroom for real orchestration, not just single-call scenarios.

---

## Session 27: Studio Bridge + Friendly Tests + Unified Terminal (2026-04-14)

### Studio Bridge — shared iframe between user and Meph

The natural thing would be to give Meph his own Playwright browser. Wrong. The user doesn't see Meph's actions, Meph doesn't see the user's, and two browsers means two sessions, two cookies, two states. The right architecture is SHARED: same iframe, same DOM, same storage, same everything.

The bridge is ~90 lines of JS the compiler injects before `</body>`. It:
- Captures click/input/submit and posts them to the parent window
- Listens for commands (click/fill/inspect/read-dom/read-storage) and replies

**Gate needs BOTH `?clear-bridge=1` query param AND `<meta name="clear-bridge">` meta tag.** srcdoc iframes have no URL, so the query param alone fails silently. Lesson: for iframe-injected scripts, dual gate or die.

### Friendly test failures

Compiler-generated test.js used raw `expect(_response.status).toBe(201)` → "Expected 201, got 404." Useless. Replaced with `_expectStatus(_response, 201)` which reads `_lastCall` (tracker set before every fetch) and throws a plain-English error ending in `[clear:N]`.

**Trap: helpers compiled OUTSIDE the `run()` function can't see `let`s declared INSIDE it.** First pass put `_lastCall` inside run(), `_expectStatus` outside — `ReferenceError` at runtime. Fix: move `_response`/`_responseBody`/`_lastCall` to module scope.

**The `[clear:N]` tag round-trips through three layers:**
1. Compiler emits it at the end of the error string
2. `parseTestOutput` regex strips it into a `sourceLine` field on the result
3. IDE renders row with `onclick="jumpToTestSource(N)"` — CodeMirror scrolls + selects

One tag, three owners, zero special-case types. That pattern scales.

### Windows libuv shutdown

Two competing SIGTERM handlers: one async-closing Playwright, one synchronous `process.exit(0)`. Playwright's async handles were still open when `process.exit` tore down the loop → Windows libuv: `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. Fix: ONE handler, AWAIT closeBrowser before exit, `setImmediate(exit)` to let stdio flush.

**Lesson:** if you have async cleanup and `process.exit`, await before exit or the async handles fire mid-teardown.

### Terminal as unified timeline

User actions, Meph tool calls, browser console errors all mirrored into `terminalBuffer`. The insight: it's not 5 separate buffers shown 5 ways — it's ONE chronological log with a source tag per line. The tag (`[user]`, `[meph]`, `[browser error]`, `[stdout]`, `[stderr]`) makes the story obvious without schema gymnastics.

---

## Clear Compiler

### The 1:1 Rule (most important)
- **Every line of compiled output must trace back to one line of Clear.** If you can't point to the Clear line that generated a piece of output, the compiler is doing magic. Magic means future Claude can't debug it from the Clear source. See PHILOSOPHY.md "1:1 mapping" section.
- **CHECKOUT, OAUTH_CONFIG, and USAGE_LIMIT currently violate this rule.** They generate routes, functions, and imports the user never wrote. These need redesigning -- the Clear source should explicitly declare endpoints, not have the compiler invent them.
- **The GAN model fixes this over time.** Build real apps in Clear, hit gaps, fix the compiler. Each app is a discriminator. See ROADMAP.md "Compiler Evolution Roadmap."

### Synonym / Tokenizer Traps
- **Never register a word as a synonym if it's used as a literal in another context.** `background` collided with CSS `background` property. `incoming` would steal the token from `validate incoming:`. Always grep existing synonyms AND existing parser code before adding.
- **The tokenizer strips trailing colons** (line 328 of tokenizer.js). This breaks route params: `/api/todos/:id:` loses both colons. Fix: store `raw` text on tokenized lines and extract paths from raw source in parseEndpoint.
- **`.toLowerCase()` on token values will crash if the value is a number.** Token values from NUMBER tokens are actual JS numbers, not strings. Always guard with `typeof value === 'string'` before calling string methods.
- **`as` has canonical `as_format`, not `as`.** When checking for the `as` keyword in parser code, match `canonical === 'as_format'`, not `canonical === 'as'`. Same pattern: check actual canonical values in synonyms.js, don't guess.
- **`max` has canonical `maximum`, `size` has canonical `length`.** Synonym rewriting changes the canonical before your parser sees it. Always check what the tokenizer actually produces, not what you think it should.

### CRUD Operations in Assignments
- **`look up` and `save...as` must be intercepted inside `parseAssignment`.** These appear on the right side of assignments (`todos = look up all Todos`) but aren't expressions -- they're CRUD operations.
- **CRUD `where` conditions reference column names, not variables.** `where id is incoming's id` -- the bare `id` is a column name. The validator should NOT check these against defined variables.
- **CRUD save with `resultVar` needs both parser and compiler support.** `new_todo = save incoming as Todo` -> CRUD node with `resultVar = 'new_todo'`. The compiler emits `const new_todo = await db.insert(...)`. The validator must add `resultVar` to `localDefined`.

### Endpoint Compilation
- **Endpoints now bind `incoming` automatically.** `const incoming = { ...req.body, ...req.params }` at the top of every endpoint body. This is the one implicit line.

---

## Clear Compiler Refactoring (2026-04-01)

- **Context object beats per-language function duplication.** A single `compileNode(node, ctx)` with `ctx = { lang, indent, declared, stateVars }` eliminates all duplication.
- **Parser-owned UI metadata eliminates a compiler pass.** Moving computation to parser node builders as `node.ui` property lets the HTML scaffold read metadata directly.
- **Separate validation from codegen for opt-in checking.** `compile()` is pure codegen. `compileProgram()` orchestrates both.
- **Wire new functions alongside old ones, then delete.** Adding new functions without removing old lets you run all tests at each step.

---

## Clear CLI & Language Phases 12-14 (2026-04-01)

- **Clear's `clear/` directory has zero `$lib/` imports -- it's self-contained.** The CLI can `import { compileProgram } from '../index.js'` and it works with plain `node`.
- **`parseExpression` returns `{ node, nextPos }` not `{ expr, pos }`.** Use `result.node` not `result.expr`.
- **Canonical endpoint syntax is `on GET '/path':` not `endpoint GET '/path':`.** Always check `synonyms.js` for the canonical form.
- **Multi-word synonyms must be registered before single-word parsing works.** `deploy to` is a two-word synonym. If you only register `deploy`, parsing breaks.
- **Multi-word synonyms can collide with existing syntax.** `count by` as a synonym matches inside `increase count by 1`. Check the full synonym table AND common syntax patterns before registering new multi-word synonyms.
- **Data shape fields need direct token parsing, not `parseBlock`.** The line `name is text, required` gets misparsed as an ASSIGN if you delegate to `parseBlock`.
- **Foreign keys detected by capitalized first character.** `author is User` -> FK. `author is text` -> field type.

---

## Clear Runtime (2026-04-02)

- **Type coercion is essential for `req.params` comparisons.** Express path params are always strings but db records store numeric ids. `matchesFilter()` must coerce.
- **Constraint enforcement order: required THEN unique.** A missing required field should give "field is required", not "undefined already exists".
- **`update()` needs two calling conventions.** `db.update('table', record)` by id, or `db.update('table', filter, data)`. Support both via argument count detection.
- **`update()` must preserve original numeric id.** When params pass string ids, restore the original numeric id after assignment.
- **Default secrets must warn loudly.** If CLEAR_AUTH_SECRET isn't set, `console.warn()` on startup.

---

## Clear Adapters Phases 25-28 (2026-04-02)

- **`define-as` path must return `{ node: assignNode(...) }`, not `{ name, expression }`.** The caller does `body.push(parsed.node)`.
- **Tokenizer strips `{` and `}` from text lines.** Use `lines[j].raw` for text blocks with interpolation.
- **`page` and `heading` are reserved keywords -- don't use as variable names.**
- **Parser `contentType` uses short names.** `'bold'` not `'bold_text'`. Match on actual values.

---

## Syntax v2 & Code Quality (2026-04-03)

- **Scope out before parser gymnastics.** If the compiler needs special-cases in 5 places, the syntax is wrong. Always ask "is there a simpler design?" before touching the parser.
- **E2E finds bugs that 792 unit tests miss.** Do E2E early, not after "all tests pass."
- **Security checks should be errors, not warnings.** DELETE without auth should block compilation.
- **The `as a new todo` pattern -- decorative syntax the compiler ignores.** Syntax that exists purely for readability, generating identical code.
- **CRUD nodes must use `{ isCrud: true, node }` return shape.**

---

## Interactive Patterns & Layout (2026-04-03)

- **Inline layout modifiers are the answer to WYSIWYG.** If changing it changes the SHAPE of the page, it goes inline. If it changes the LOOK, it goes in a style block.
- **Behavioral modifiers need special handling, not just CSS.** Tabs, modals, collapsible sections need both CSS AND JavaScript. Parser marks them with `__tabs`, `__modal` etc. in inlineModifiers.
- **`toggle` collides with `checkbox`.** Guard with `!(tokens[1].value === 'the' || tokens[1].value === 'this')`.
- **Auto-generated E2E tests from the AST are surprisingly powerful.** The AST already contains everything needed to test the app.

---

## Generated Code Quality (2026-04-03)

- **Middleware ordering: logging -> CORS -> auth.** CORS must come before auth so OPTIONS preflight requests don't get 401.
- **HTTP status codes must match the method.** POST -> 201, DELETE/PUT -> 200. Thread `endpointMethod` through context.
- **Full-stack apps need `express.static(__dirname)`.** Without it, style.css isn't served.
- **FK-aware E2E tests need unique values for `matches email` fields.** Emit `_uniqueEmail()` counter.
- **Keyword typo detection via Levenshtein distance.** Edit distance 2 catches `repat`, `defne`, `retrn`.

---

## Compiler Refactoring -- Session 7 (2026-04-03)

- **`compileBody(nodes, ctx, overrides)` replaces 25+ identical patterns.**
- **`parseConfigBlock(lines, startIdx, indent)` handles config blocks.**
- **Extract node compilers when the case block exceeds 30 lines.** Don't over-extract small cases.

---

## Theme & Preset System (2026-04-04)

- **Synonym collisions when repurposing keywords.** `theme` was a synonym for `style`. Always check `synonyms.js` before claiming a keyword for a new purpose.
- **App presets need different HTML wrapping than page presets.** App presets skip `max-w-5xl` wrappers because they participate in flex layout.
- **`parseExpression` returns `{ node, nextPos }` -- always use `nextPos`.** If you don't advance `pos`, subsequent token checks silently fail.
- **Block-form parsing for sub-expressions requires endPos.** Pass `endPos` to `parseExpression` to stop before boundary keywords like `returning`.
- **Layout detection must happen before body/main class decisions.** Variable ordering in `compileToHTML` matters: detection flags first, then dependent decisions.

---

## Parser / DSL Extension (2026-03-17)

- **New parser keywords go BEFORE continuation logic in parseBlock.** If you add a keyword check after the `isAssignmentLine()` check, any keyword that looks like an identifier gets swallowed by assignment parsing first. Specific patterns first, generic fallback last.
- **`processedEndpoints` dedup Set prevents double-compilation.** An endpoint inside a `page` block would get compiled once by the page walker and once by the top-level body loop. Track processed node references.
- **Validator `declared` is a stack of scopes, not a flat Set.** Functions and blocks push new scopes. Variables declared inside a function body shouldn't leak to the outer scope after the function ends.

---

## Playground & Design System (2026-04-05)

### DaisyUI v5 CDN
- **DaisyUI v5 CSS path changed from `/dist/full.min.css` to `/daisyui.css`.** The old path returns a 63-byte error. Always verify CDN paths when upgrading major versions.
- **ORB (Opaque Resource Blocking) blocks CDN CSS inside sandbox iframes.** Download DaisyUI CSS locally and inline it into iframe `srcdoc` via string replacement. The regex `/<link[^>]*daisyui[^>]*>/i` swaps the CDN link for an inline `<style>` block.
- **Tailwind v4 browser CDN is `@tailwindcss/browser@4`, not `cdn.tailwindcss.com`.** The old v3 CDN still works but causes screenshot timeouts in preview tools due to heavy processing.

### Browser Server
- **`receiving` variable not bound in browser server.** The Express compiler emits `const todo_data = req.body;` for endpoints with `sending todo_data`, but the browser server compiler didn't. Both paths need identical variable binding logic.
- **`process.env` doesn't exist in browser.** Auth-protected endpoints reference `process.env.CLEAR_AUTH_SECRET` which crashes. Fix: shim `window.process = { env: { CLEAR_AUTH_SECRET: "browser-dev-secret" } }` at top of browser server IIFE.
- **Browser server needs `iframe.onload` before sending requests.** The fetch interceptor isn't ready until the script executes. In the API tester, wait for iframe load before enabling Send buttons.

### Design System
- **GAN method is mandatory for UI work.** Never edit compiler HTML output directly. Design a static mock first, screenshot it, then edit the compiler until output matches. The mock is the discriminator, the compiler is the generator.
- **New themes require parser validation update.** Adding `arctic` and `moss` to CSS_BASE isn't enough — `parser.js:1073` has a `validThemes` array that must include them or the parser rejects the theme directive.
- **`BUILTIN_PRESET_CLASSES` drives all preset styling.** When updating the design system, this is the single object to change. Tests check exact class strings, so update tests in the same commit.
- **`rounded-box` is DaisyUI v5's semantic border-radius.** It reads `--radius-box` from the theme. Use it instead of hardcoded `rounded-xl` so radius adapts per theme.

### Playground
- **Compile animation: scan line + streaming code.** A CSS `@keyframes scan` line sweeps across the editor, then the JS output streams line-by-line into the code tab. Honest animation — shows real output, just revealed gradually.
- **Interactive API tester injects a hidden iframe with browser server.** Each endpoint card has a Send button that calls `iframe.contentWindow.fetch()`. POST endpoints get a pre-filled JSON textarea generated from table schema fields.

---

## Session: App Output Quality (Phase 29.1)

- **CSS Reset Kills Tailwind.** `* { margin: 0; padding: 0; }` in CSS_BASE overrode every Tailwind utility class (p-8, mb-8, gap-6 all rendered as 0px). Fix: use `*, *::before, *::after { box-sizing: border-box; }` only. This was the root cause of all compiled apps looking flat/cramped.
- **Context-Aware Rendering.** The compiler's `buildHTML()` needs to know what section preset it's inside (app_header, metric_card, card_bordered, etc.) to emit the right classes. Solution: `sectionStack` array pushed/popped during section traversal. Without this, every heading was a giant `<h1>`, every button was `btn-sm`, every text was body text.
- **Landing Page Presets Need Flex Centering.** `page_hero` and `page_cta` need `flex flex-col items-center gap-6` for centered layout with proper spacing. Without this, hero sections have no visual hierarchy. Links in hero sections should be `btn btn-primary btn-lg`, not `link link-primary`.
- **Single Theme CSS.** The compiler was emitting all 5 theme CSS blocks into every compiled app. Fix: split CSS_BASE into CSS_RESET + THEME_CSS map, pass theme name to _buildCSS(), emit only the active theme.
- **Empty Section Comments.** The JS compiler emitted `// Section: Nav` even when the section body produced no JS code. Fix: return null when bodyCode is empty.
- **Playground Should Not Auto-Compile.** Loading an example or typing should not trigger compilation. The user should explicitly click Compile. This makes the playground feel intentional, not reactive.
- **ASCII Diagrams: Use Plain ASCII Arrows.** Never use Unicode arrows (`►`, `◄`, `▼`) in ASCII diagrams — they render inconsistently across fonts and terminals, causing alignment mismatches. Use plain ASCII: `>` for right, `<` for left, `v` for down (e.g., `──>`, `<──`, `->`, `v`). Box-drawing characters (┌─┐│└─┘) are fine — they're consistently single-width. Always count characters in labels between boxes, don't eyeball.

## Session 7: Major Feature Sprint (2026-04-07)

- **Explicit Over Auto-Inferred.** The first attempt at CRUD table buttons auto-detected DELETE/PUT endpoints and showed buttons automatically. This violated Clear's "explicit over terse" rule — a DELETE endpoint might be admin-only, or need a confirmation modal. The fix: `with delete` / `with edit` as explicit opt-in. User says what they want, compiler handles the wiring.
- **Synonym Collisions in Display Parsing.** `delete` tokenizes as canonical `remove` (not `delete`). The parser must check `canonical === 'remove'`, not the raw value. Every new keyword needs a tokenization check before coding.
- **`showing` Clause Eats Everything.** The `showing col1, col2` loop in parseDisplay consumed all remaining tokens including `with delete`. Fix: break when token canonical is `with`. Always test greedy loops against tokens that follow them.
- **Event Delegation for Dynamic Content.** Table action buttons rendered via innerHTML are destroyed and recreated on every recompute. Individual event listeners would be lost. Solution: event delegation on the parent table element using `e.target.closest('[data-delete-id]')`.
- **`data from` Synonym Collision.** `get data from '/url'` tokenizes `data from` as a single keyword (`data_from`) for the external fetch syntax. Using variable name `data` in API calls breaks. Workaround: use different variable names (e.g., `items`, `results`).
- **Pie Chart Array Bounds.** When pie chart data has < 2 non-id fields, `keys[1]` is undefined. Always cache key detection outside the map loop and bounds-check before accessing array indices.
- **File Input is Read-Only.** Never try to set `.value` on a `<input type="file">` — it's read-only in browsers. Skip file inputs in the DOM sync loop. Use `change` event (not `input`) and read `files[0]`.
- **`as` Tokenizes as `as_format`.** When parsing new syntax that starts with `as` (like `as one operation:`), the first token has canonical `as_format`, not raw value `as`. Always check canonical values.
- **Phone Test Prevents Jargon.** `unique together X and Y` fails the phone test — sounds like SQL jargon. `one per X and Y` is immediately understandable. `as one operation:` beats `transaction:`. Always say the syntax out loud before implementing.
- **Security Validators Catch Real Attacks.** 18 categories of security vulnerabilities caught at compile time: IDOR, unauthenticated mutations, CSRF, SQL injection, brute force, path traversal, sensitive data exposure, open CORS, missing logging. The OWASP Top 10 research showed 35+ CVEs per month from AI-generated code in 2026 — Clear's compile-time checks eliminate these entire categories.
- **Python Comment Syntax.** DATABASE_DECL was emitting `// comment` in Python mode instead of `# comment`. Every Python code path needs `#` comments, not `//`.
- **resolveModules Only Inlined Functions.** `use everything from 'backend'` only imported FUNCTION_DEF, ASSIGN, and COMPONENT_DEF nodes. Endpoints, pages, sections, buttons — all skipped. Fix: inline ALL node types except TARGET, THEME, and DATABASE_DECL for `importAll` mode.

## Session 8: Template Apps & E2E Testing (2026-04-07)

- **`save X as new Y` Parsed Target as `"as"`.** `parseSave()` only checked for `to_connector` between variable and target. `save m1 as new Model` hit this path and parsed `as` as the table name → `db.update('as', m1)`. Fix: also handle `as_format`/`as` connector and skip optional `new` keyword. Add `isInsert` flag to distinguish insert (`save X as Y`) from update (`save X to Y`).
- **PUT Endpoints Need ID Injection.** `save update_data to Models` compiles to `db.update('models', update_data)` but the data has no `id` field — it's in `req.params.id`. Without injecting `update_data.id = req.params.id`, the update can't find the record. Fix: detect `:id` in endpoint path and inject the param assignment.
- **Naive Pluralization Breaks "Activity".** `activity + 's' = activitys` (wrong). Same for `category → categorys`. Fix: `pluralizeName()` helper that handles `y→ies`, `sh/ch/x/z→es`. Must be used everywhere: `compileCrud`, `compileDataShape`, `createTable`, browser server CRUD.
- **Schema Name Mismatch: Activity vs Activities.** Table declared as `Activities` → `ActivitiesSchema`. But `save X as new Activity` looked for `ActivitySchema`. Fix: schema lookup tries exact match, then `+s`, then `pluralizeName()`, then strips `s`, then strips `ies→y`.
- **Multi-Page Routing: Pages Not Wrapped.** The hash router referenced `page_Home`, `page_About` divs but `buildHTML()` never created them. `startIdx`/`endIdx` were tracked but unused. Fix: splice `<div id="page_X">` wrappers around page content after `walk()`. Second+ pages start hidden.
- **`max-w-2xl` Crushed Sidebar Layouts.** Apps with `side by side` inline modifier compiled with `flex-direction: row` but `hasFullLayout` only checked for `grid` and `column_layout`. Fix: also detect `flex-direction: row` in CSS.
- **`use everything from` Didn't Reach HTML Scaffold.** Module resolution stored imported nodes in `_selectiveNodes` on the USE node, but `buildHTML()` only walks `ast.body` directly. Pages, endpoints, data shapes from imported modules were invisible to the HTML and reactive JS compilers. Fix: splice imported nodes directly into `ast.body` during `resolveModules()`.
- **E2E Tests Catch What Unit Tests Miss.** Deploying compiled servers and hitting real endpoints found 6 bugs that unit tests couldn't: seed data not inserting, PUT not finding records, schema name mismatches, wrong table names. Always deploy and test real HTTP before shipping.

## Session 8b: External APIs & Syntax Audit (2026-04-07)

- **Node Type Collision: API_CALL.** Added `API_CALL` for `call api` but frontend `send X to '/url'` already used `API_CALL`. Two definitions of the same enum value = silent overwrite. Fix: renamed new type to `HTTP_REQUEST`. Always search NodeType enum before adding.
- **`ask ai` is Raw-Value Parsed, Not a Synonym.** The parser checks `tokens[pos].value === 'ask'` and `tokens[pos+1].value === 'ai'` — NOT via the synonym table. Adding `ask claude` required extending the same raw-value check, not adding a synonym. Always check whether a keyword uses synonyms or raw values before adding aliases.
- **`send email via sendgrid` Collides with `send email:`.** Parser matches `respond` + `email` for SMTP. Must check for `via` token at position 2 BEFORE falling through. Order of parser checks matters — more specific patterns first.
- **Expression vs Statement Duality.** `call api` needs to work as both a standalone statement (`call api 'url':`) and as an expression (`result = call api 'url'`). The statement path goes through block parsing, the expression path goes through `exprToCode`. Must handle both.
- **14-Year-Old Test Applied to Existing Syntax.** Audit found `requires auth`, `validate`, `allow cross-origin requests`, `webhook`, `guard` all fail the test. `needs login`, `check`, `when X notifies` are the natural alternatives. Add aliases, don't remove working syntax.
- **Service Presets Use Different Content Types.** Stripe uses `application/x-www-form-urlencoded` with `URLSearchParams`. SendGrid uses JSON. Twilio uses form-encoded with Basic auth. Can't assume JSON for all services.
- **GAN Method Works for Compiler Output.** Creating static HTML mocks as visual targets, then comparing compiled output, catches layout and styling issues systematically. The mock is the discriminator, the compiler is the generator.

## Session 8c: Compiled Output Quality & Error Translator Plan (2026-04-07)

- **Red-Team Compiled Output, Not Just Source.** Unit tests verify the compiler generates correct syntax. But deploying the compiled server and reading it as a senior dev found 5 production issues: no source mapping, error messages leaking DB internals, seed endpoints unguarded, silent fetch failures, no architecture comments. Always review the compiled output as if YOU had to debug it at 3am.
- **Source Line Comments Are Cheap, Invaluable.** Adding `// clear:LINE` to every endpoint and CRUD operation costs <1KB per app but transforms debuggability. Stack traces now map to Clear source lines.
- **Error Classification Prevents Info Leaks.** Returning raw `err.message` for 500 errors leaks DB schema, table names, SQL. Fix: validation errors (400) are user-caused and safe to show. Server errors (500) get "Something went wrong." The distinction is one line: check if message contains "required" or "must be."
- **Seed Endpoint Guard is Mandatory.** Every template app has `POST /api/seed`. Without `NODE_ENV=production` guard, anyone can reset production data with one HTTP request. The Replit incident (July 2025) was exactly this — AI deleted a production database.
- **AI Code Has 1.7x More Bugs (Research).** OWASP 2026 data: 86% of AI-generated code fails XSS defense, 60% of bugs are semantic (runs but wrong output), 75% more boundary condition errors. The error translator plan covers all these categories.
- **fix_scope Prevents Accidental Deletion.** The #1 AI coding failure: fixing bug X while accidentally deleting working code Y. The fix: error responses include `fix_scope.change` (what to touch) and `fix_scope.preserve` (what NOT to touch). This gives AI agents guardrails.

---

## Session 9: Error Translator + Silent Bug Guards (2026-04-07)

- **Blind Agent Testing Is The Real Test.** Unit tests verify plumbing. The real acceptance test: give an agent ONLY the error JSON + source files + syntax docs, tell it nothing about the bug. If it fixes it, the error system works. 50+ blind agent tests, all scored A or B.
- **PUT Data Loss Is Systemic.** `save X to Table` compiles to `db.update(table, req.body)`. If client sends partial data (just the field they changed), ALL other fields vanish. This affects every PUT endpoint in every CRUD app. Fix: compiler now re-fetches full record after update + uses `_pick` for mass assignment protection.
- **`Number("")` Returns 0, Not NaN.** JavaScript's `Number("")` is `0`. If `enforceTypes` coerces empty strings to numbers, non-required number fields silently become `0`. Fix: skip empty/whitespace strings before coercion.
- **`isSeedEndpoint` Must Be Computed Before `compileBody`.** The seed flag at line 1228 of compiler.js was set AFTER `compileBody` already compiled the endpoint's CRUD operations. The flag never reached `compileCrud`. Fix: move computation above `compileBody`, pass through context.
- **Runtime Guards > Compile-Time Guards.** Putting type enforcement, FK checks, and update-not-found in `runtime/db.js` covers ALL code paths — compiled and direct. One fix in the runtime protects every app without recompiling. Compile-time warnings are for business logic the compiler can't enforce (balance checks, capacity limits).
- **Agents Find Real Compiler Bugs.** In hard-bug testing, blind agents discovered 6 compiler bugs: Stripe/SendGrid IIFE syntax error, missing `_pick` on update, `isReactiveApp` missing triggers, stale schema in `createTable`, and more. Each fix benefits all future apps.
- **`auth` Substring Collision.** Test checking `not.toContain('auth')` broke when `_clearError` was added because it contains "Authentication required". Fix: check for the specific import string, not bare substring.
- **Two HTTP_REQUEST Paths.** `call api` has two code paths: one in `_compileNodeInner` (statement) and one in `exprToCode` (expression/assignment). Both need `_clearCtx` for error context. Easy to fix one and miss the other.
- **Research Validates Guard Priorities.** OWASP 2025, CWE Top 25, and CodeRabbit AI study (470 repos) all confirm: type coercion (#1 JS crash), wrong status codes (70% of API bugs), and null property access (#1 crash) are the top bug classes. Our guards address exactly these three.

---

## Session 10: Agent Tier 7 — Phase 80 Parallel Agents (2026-04-08)

### Synonym Traps (three collisions discovered during planning)
- **`do` is a synonym for `then`.** `do these at the same time:` tokenized as `then these at the same time:`. Fix: register `do these at the same time` as a 6-word multi-word synonym (`do_parallel`). Longest-match greedy wins over single-word `do` → `then`. Always check the SYNONYM_TABLE for single-word collisions before designing new syntax.
- **`run` is a synonym for `raw_run` (SQL execution).** The roadmap syntax `run these at the same time:` and `run pipeline` both break. `run` maps to `raw_run` at synonyms.js line 350. Fix: changed to `do these at the same time:` and `call pipeline`.
- **`log` is a synonym for `show`.** `log agent decisions` tokenized as `show agent decisions`, parsed as a SHOW statement. Fix: changed to `track agent decisions`. Pattern: any common English verb is probably already a synonym for something.
- **`can` is already a synonym.** Used in RLS role definitions (`can read`, `can update`). Safe in this case because RLS parsing only happens inside `define role` blocks, not in main `parseBlock`. But it required explicit verification.

### Parser / Compiler Patterns
- **`parseBlock`'s `indent` variable is the PARENT block indent, not the current line's indent.** When parsing children of a new block statement (like `do these at the same time:`), use `lines[i].indent` (the actual line indent) not `indent` (the parseBlock context). Getting this wrong means children at the wrong depth are grabbed.
- **Reserved words can't be test variable names.** `a`, `an`, `the` are reserved keywords (canonical type `keyword`). `a = call 'Agent' with data` fails in `parseAssignment` because `a` at pos 0 is treated as an article and skipped. Use descriptive names (`alpha`, `sentiment`, `result`) in tests, not single letters.
- **Validator must register variables from new node types.** Adding `PARALLEL_AGENTS` to the parser and compiler isn't enough — the validator's `checkNode` function tracks defined variables via `localDefined.add()`. Without a `case NodeType.PARALLEL_AGENTS:` block, variables declared in the parallel block are "undefined" to the validator, causing false forward-reference errors.
- **Bump SYNONYM_VERSION and update the version test.** Adding any synonym requires: (1) increment `SYNONYM_VERSION` in synonyms.js, (2) update the version assertion in clear.test.js. The test exists specifically to catch stale synonym caches.
- **`classify with` is a multi-word synonym (`predict_with`).** Multi-word synonyms eat the `with` keyword. Pipeline step syntax `step with 'Agent'` fails when `step` + `with` forms a known synonym. Fix: accept any form ending in a quoted string, not just the 3-token pattern.
- **`check` is a synonym for `if`.** `check result's sentiment is 'positive'` becomes `if result's sentiment is 'positive'` — an if-block without a body. Use `expect` for assertions in Clear test blocks, not `check`.
- **Agent directives must scan BEFORE parseBlock.** The directive scanner in `parseAgent()` consumes lines like `can use:`, `must not:`, `track agent decisions`, `knows about:`, `remember conversation context` before calling `parseBlock()`. This prevents synonym collisions (e.g., `use` → module import, `log` → show). Pattern: check raw `dTokens[0].value`, not canonical.
- **Block-form directives need inner while loops.** `must not:` and block-form `can use:` have indented sub-lines. The outer directive scanner loop must consume ALL sub-lines with an inner `while (indent > parentIndent)` loop. Missing this causes sub-lines to fall through to `parseBlock` which chokes on them.
- **Singular/plural table name matching in guardrails.** CRUD nodes use singular table names (`User`) but declarations use plural (`Users`). The guardrail validator must normalize both by stripping trailing `s` before comparing.
- **Regex-based code wrapping is fragile but works for v1.** `bodyCode.replace(/await _askAI\(([^)]*)\)/g, ...)` rewrites compiled output to inject wrappers. Works for single-line _askAI calls. Will break if _askAI call spans multiple lines or has nested parentheses. Fine for now — tracked as tech debt for v2.

## Session 11: Agent Workflows — Phases 85-90 (2026-04-08)

### Synonym Gotchas (Workflow)
- **`saves to` is a multi-word synonym (canonical `saves_to`).** In `step 'X' with 'Agent' saves to state's field`, the `saves to` tokenizes as a single keyword token, not two separate words. Parser must check `canonical === 'saves_to'` instead of `value === 'saves'`. Also: the possessive `state's field` tokenizes to 3 tokens (`state`, `'s`, `field`), not a single string — can't use string replacement, must skip tokens by type.
- **`workflow`, `step`, `state` are NOT synonyms.** Verified safe — none appear in synonyms.js. These tokens come through as plain identifiers, matched by raw `.value` in dispatch maps.
- **`at the same time` inside workflows reuses the same English phrase** as `do these at the same time` (Phase 80), but structurally different: workflow parallel uses `step` declarations with `saves to`, while Phase 80 parallel uses assignments. No synonym conflict because the workflow parser consumes these tokens directly.

### Parser Patterns (Workflow)
- **Workflow directives use the same pre-scan pattern as agents.** `state has:`, `runs on temporal`, `save progress to`, `track workflow progress` are consumed before `parseBlock`. Each directive's inner block (e.g., `state has:` fields) needs its own `while (indent > parentIndent)` loop.
- **Possessive token splitting matters for `saves to state's field`.** After `saves to`, the tokens are `state`, `'s` (POSSESSIVE type), `field`. Must explicitly skip the state var token + possessive token, then take the remaining identifier as the field name. String-based `.replace()` doesn't work because token values include space-delimited joins.
- **Field type annotations use parenthesized form.** `quality_score (number)` — the `(number)` is parsed from the raw token string with `.includes('(number)')` because the parentheses tokenize as separate tokens. Pragmatic and correct.
- **`repeat until` condition parsing needs a `condEnd` boundary.** The `max N times` suffix must be stripped before parsing the condition expression. Walk backwards from the end to find `times` + NUMBER + `max`, then parse expression only up to that boundary.
- **State variable rewriting in conditions.** Workflow conditions like `if state's quality_score > 8` compile the expression using the original variable name (`state.quality_score`), but the compiled workflow uses `_state`. The compiler applies `rewriteStateRef()` — a regex that replaces `\bstate\.` with `_state.` — to all condition code after `exprToCode()`.
- **`is` compiles to `==`, not `===`.** Clear's `is` operator maps to loose equality. Tests expecting `===` will fail. This is intentional — Clear avoids type coercion complexity.

### Python Streaming + Python Workflow Gotchas
- **Python streaming regex runs BEFORE model injection.** The streaming transform replaces `_ask_ai(` with `_ask_ai_stream(`. If model injection then looks for `await _ask_ai(`, it won't find anything because it's now `_ask_ai_stream`. Fix: add a second regex in model injection to also handle `_ask_ai_stream(`.
- **Python bracket notation for possessive access.** `state's category` compiles to `state["category"]` in Python (bracket notation) but `state.category` in JS (dot notation). The `rewriteStateRef()` function must handle BOTH patterns — `state\.` → `_state.` for JS, and `state\[` → `_state[` for Python.
- **`not.toContain` tests fail on utility function definitions.** Testing `expect(python).not.toContain('_ask_ai_stream(')` fails because the utility function *definition* `async def _ask_ai_stream(` is always present. Fix: extract just the agent function substring before asserting.
- **Python `async def` with `yield` is automatically an async generator.** No `async def*` syntax needed (unlike JS's `async function*`). Python handles this natively — if the body contains `yield`, it's a generator.
- **`asyncio` import needed for `asyncio.gather`.** The `PARALLEL_AGENTS` node compiles to `asyncio.gather()` in Python but `asyncio` isn't imported by default. Added auto-detection: scan body for `PARALLEL_AGENTS` or workflow parallel branches, inject `import asyncio` after `import datetime`.
- **Python dict initialization syntax differs from JS.** JS uses `Object.assign({field: null}, input)`, Python uses `_state = {...defaults}; _state.update(input)`. The defaults must convert `null` → `None`, `true` → `True`, `false` → `False`.

## Session 11: First-Class Errors (2026-04-08)

### Validation Gotchas
- **New validation passes break existing tests.** Adding `validateCallTargets` correctly flagged `call 'Agent'` and `run workflow 'X'` in tests that defined no matching agent/workflow. Fix: add the required definition to the test source. This is the right behavior — the validator is catching real bugs.
- **`thenBranch` can be a single node OR an array.** The `checkNodes` recursion in `validateCallTargets` must handle both: `if (Array.isArray(node.thenBranch)) checkNodes(...)` for block-if, else treat as single expression.
- **Type inference from expressions is conservative.** `inferType()` returns `'unknown'` for anything it can't prove — function calls, member access chains, ternary expressions. This means the member access warning only fires when the variable was assigned a literal or arithmetic result, not for computed values. Good: no false positives. Bad: misses some cases.
- **Workflow names normalize to lowercase.** `validateCallTargets` normalizes with `.toLowerCase().replace(/\s+/g, '_')` to match the compiler's function naming. Without normalization, `run workflow 'Support Ticket'` wouldn't match `workflow 'Support Ticket'` because spaces → underscores.

## Session 11: Playground IDE (2026-04-08)

### Security
- **Command injection via `&&` in exec endpoint.** Whitelist prefix (`node `, `curl `, `ls `, `cat `) is necessary but NOT sufficient — `node -e "1" && rm -rf /` passes the prefix check. Must also block `&&`, `;`, `|`, `$()`, backticks with a regex guard.
- **`express.static` serves `index.html` before route handlers.** If `playground/` has both `index.html` and `ide.html`, `GET /` serves `index.html` even with an explicit `app.get('/')` route — because `express.static` runs first. Fix: put the route handler BEFORE `app.use(express.static(...))`.

### Architecture
- **Compiled CJS in ESM repo.** The compiler output uses `require('express')` but `package.json` has `"type": "module"`. Child processes for `POST /api/run` need their own `package.json` with `{}` (no type field) so Node treats `.js` as CJS.
- **`compileProgram("")` returns unexpected shape.** Empty string input doesn't crash the parser but returns a result without the expected keys. The compile endpoint must short-circuit empty/whitespace input and return a clean empty response.
- **CodeMirror bundle is 443kb.** Bundling CodeMirror 6 via esbuild into a single ESM file avoids CDN dependency. Install packages temporarily, run esbuild, uninstall — keeps package.json clean.
- **Claude agent tools are better than syntax-lookup tools.** Instead of giving Claude tools to fetch SYNTAX.md sections (slow, multi-turn), give it action tools (edit_code, run_command, compile, run_app, http_request) with syntax knowledge in the system prompt. This makes Claude a real agent, not a chatbot.
- **Save endpoint writes to Desktop.** `process.env.HOME + '/Desktop'` works on Mac/Linux. Fall back to `process.cwd()` if Desktop doesn't exist. Save both `main.clear` source and full `build/` directory with runtime files.

## Session 12: Playground E2E Test Infrastructure (2026-04-08)

### Race Condition in Child Process Management
- **Old child's exit handler clears runningChild after new child starts.** Pattern: `runningChild.on('exit', () => { runningChild = null; })` — if a second run starts before the first exits, the deferred `on('exit')` fires and nulls the new child. Symptom: sequential app tests fail non-deterministically, individual tests pass. Fix: capture child in local variable and use identity check: `const child = spawn(...); runningChild = child; child.on('exit', () => { if (runningChild === child) runningChild = null; })`. Apply in BOTH the `/api/run` endpoint and the agent's `run_app` tool.

### ESM vs CJS in Child Process Node Scripts
- **`node -e "require('net')..."` fails in ESM repo.** `package.json` with `"type": "module"` makes `.js` files ESM — `require` is not defined. Even `node -e "..."` inherits this. Fix: write the poll script as a `.cjs` file to a directory with no `type: module` in `package.json`, then run it. Temp pattern: `writeFileSync(pollPath, cjsScript); execSync('node "_port-poll.cjs"', { cwd: buildDir }); unlinkSync(pollPath)`.
- **Shell quoting kills embedded multiline strings in `node -e`.** `node -e "writeFileSync('file', 'line1\nline2')"` — the shell strips inner quotes and `\n` may be literal. Don't use `node -e` for file writing. Write a CJS file instead or use the `write_file` agent tool.

### Agent write_file Tool Pattern
- **Heredoc and `node -e` both fail for agent file writing.** Agents trying to create files via `run_command` couldn't reliably escape content. Root cause: everything goes through execSync with shell, so quoting is shell-dependent. Fix: add a `write_file` tool that takes `filename` + `content` as JSON fields — no shell escaping at all. Restrict to `.clear` files only for security.
- **Agents won't use CLI tools if they can't create input files.** The `run_command` tool for `clear check`, `clear lint`, etc. is useless if the agent can't write a `.clear` file to disk first. The `write_file` → `run_command` flow is the mandatory two-step for CLI tools in agent context.

### Test Independence Principle
- **Don't rely on agent's running app for verification.** Phase tests that need HTTP verification should start their own app copy (with a different port) rather than depending on the agent's `run_app` still being live. Reason: agent may have stopped the app, test timing is unpredictable. Pattern: `const testServer = spawn('node', [...], { env: { PORT: '3901' } })` — start, test, kill, independent of agent state.
- **Run CLI verification tests on clean code, not patched code.** If a patch introduces a compile error, CLI tests using the patched code will fail for the wrong reason. Use `editorAfterBuild` (the original clean code before any agent modification) for CLI tool tests.

### Clear Compiler Gap: Query Params
- **`incoming's q` / `params's q` are not valid Clear syntax.** The compiler has no way to access URL query parameters like `GET /api/contacts?q=alice`. Agents trying to implement search endpoints will write invalid syntax. Work around by using a simpler endpoint (e.g., a count endpoint instead of a search endpoint) in agent tests.

### Playwright Gotchas (Playground IDE)
- **`#preview-content` is the shared div for ALL tab panels.** When clicking "Compiled Code", "Output", "Terminal" tabs, they all render into `#preview-content`. There is no `#compiled-content`, `#compiled-panel`, or separate per-tab div. Test using `#preview-content` text content.
- **ws package must be pre-installed in build dir.** Compiled chat apps use `require('ws')`. The build dir gets a minimal `package.json` written before running `npm install ws`. Without this, chat app compilation succeeds but running crashes with `MODULE_NOT_FOUND`.

## Session 13: IDE Bug Fixes + Docs Viewer (2026-04-09)

### Model ID Gives Silent Blank Response
- **`claude-sonnet-4-20250514` is a stale model ID** — the API returns an error, the server forwards it as a non-OK HTTP response, but the client had no `r.ok` check before reading SSE. Result: blank assistant bubble, no error shown, no console log.
- **Always check `r.ok` before reading the SSE stream.** If the API returns JSON error (not SSE), the SSE parser sees no `data:` lines, emits no events, and the streaming message stays empty. Add `if (!r.ok) { const err = await r.text(); show error; return; }` right after the fetch.
- **Current model IDs (as of 2026-04-09):** `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001`. Check CLAUDE.md for the canonical list before hardcoding in server code.

### Backend-Only Compile Puts Code in `javascript`, Not `serverJS`
- **The compiler uses two different output keys depending on target:**
  - `build for web and javascript backend` → `result.html` + `result.serverJS`
  - `build for javascript backend` (no web) → `result.javascript` (not `result.serverJS`)
- **The run button only checked `lastCompiled?.serverJS`**, so backend-only apps always showed "Compile first" even when already compiled. Fix: `const backendCode = lastCompiled?.serverJS || (!lastCompiled?.html && lastCompiled?.javascript)`.
- **The same issue exists in the agent's `run_app` tool** in server.js — it checks `lastCompileResult?.serverJS`. Fix is the same pattern.

### Empty Streaming Bubble Looks Like a Bug
- **When Claude starts responding with only tool calls (no text), the assistant message div is created with `content: ''` and `toolSteps: []`.** The bubble renders as an empty gray box — users think the chat broke.
- **Fix: show animated dots when `m.streaming && !m.content && !m.toolSteps?.length`.** Once text starts arriving or tool steps appear, switch to real content. The `.typing-indicator` CSS was already defined but never used — just wire it in.

### Agent Compiler Access: Don't, Log Instead
- **Agents should never edit compiler source.** If a playground agent patches the compiler to make one app work, it silently breaks the language for every other app. The 1:1 mapping and determinism rules only hold if the compiler is maintained by humans, not patched by agents.
- **The right pattern: `compiler-requests.md` as a feature backlog.** Agent logs unmet needs with a structured format (app, syntax desired, workaround, error, impact). Human reviews and decides whether to add to the language. This creates a backlog driven by real usage rather than speculation.
- **Format for requests** (see system-prompt.md): App / What I needed / Proposed syntax / Workaround / Error hit / Impact (low/medium/high).

### Docs Viewer: Fetch + Client-Side Markdown
- **Don't add a doc-rendering library** — a simple line-by-line parser handles `#`, `##`, `###`, `-`, ` ``` `, inline `**bold**` and `` `code` `` without any dependency. 40 lines of code.
- **Search by H1/H2 section splitting.** Split the raw markdown on `/^(?=#{1,2} )/m` to get sections, filter by query, join and re-render. Feels instant, no server round-trip.
- **Cache doc responses.** The files rarely change mid-session. `docsCache[which]` prevents repeated fetches when user switches between Syntax and User Guide tabs.
- **Restrict the docs API to an allowlist.** `ALLOWED_DOCS = { 'syntax': 'SYNTAX.md', 'user-guide': 'USER-GUIDE.md' }` — any other path returns 404. Never use `req.params.name` directly as a file path.

## Session 14: Parser + Validator Fixes + Web Tools (2026-04-09)

### `owner` Field Silently Dropped by RLS Check
- **The parser's data_shape field loop had an RLS check that fired on ANY line starting with canonical `owner`.** The check `if (firstCanonical === 'owner' || ...)` was meant to detect RLS policy lines like `owner can read, update`. But it also fired on `owner, required` (a field definition) — silently consuming the line as an attempted RLS parse and `continue`-ing.
- **Symptoms:** `owner` field never appeared in compiled SQL, no error, no warning. Silent data loss. Only caught via manual AST inspection.
- **Fix:** Add `hasCanKeyword` lookahead — only treat as RLS if the line also contains `can` as a token. `owner can read` → RLS. `owner, required` → field.
- **Key gotcha:** Some tokens have non-string `.value` (numbers, booleans). The lookahead must guard: `typeof t.value === 'string' ? t.value.toLowerCase() : ''`. Without this, `t.value.toLowerCase is not a function` crashes the whole data_shape parse and drops ALL fields below the crash point.
- **Test coverage:** Always add a test for "field named X survives in data_shape" for any word that appears in RLS role checks (`anyone`, `owner`, `same_org`, `role`).

### Validator Over-Broad on `owner` Field
- **Validator line 730 added bare `owner` to the `schemasWithOwner` set** alongside `user_id` and `owner_id`. This caused any table with a text field named `owner` (like "project owner name") to trigger "GET returns all records without auth filter" — a false positive.
- **Fix:** Remove bare `owner` from the check. Only `user_id` and `owner_id` (explicit FK naming pattern) imply row-level user ownership. A field named `owner` might just be a person's name string.
- **Rule:** Validator lint should only fire on naming conventions that unambiguously imply auth ownership. `owner` alone is too ambiguous. `_id` suffix signals foreign key relationship.

### Anthropic Native Server Tools Replace Custom Implementations
- **`web_fetch_20250910` and `web_search_20250305` are Anthropic server tools** — declared in the `tools` array but executed entirely by Anthropic's API, not by the client. No server-side fetch implementation needed, no external API keys.
- **Declare format:** `{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 10 }` — notice `type` instead of `input_schema`. These are not client tools.
- **SSE stream handling:** Server tools emit `server_tool_use` content blocks (not `tool_use`). Don't push them into `toolUseBlocks` (which triggers client-side execution). Handle them separately: show UI feedback only, let the API continue the stream with the result inline.
- **Result blocks:** `web_fetch_tool_result` and `web_search_tool_result` appear as content blocks in the same message turn. No round-trip tool_result message needed.
- **Custom implementation was 80 lines of dead weight** — HTML stripping, Brave API auth, error handling for HTTP status codes, all replaced by two lines of tool declaration.

---

## Session 15: SQLite Persistence (Phase 47b) (2026-04-09)

### ESM Project + CJS Runtime = Explicit Package Declaration Required
- **The Clear project has `"type": "module"` in root `package.json`**, making all `.js` files ESM by default. The `runtime/db.js`, `auth.js`, and `rateLimit.js` files use `require()` (CJS). This worked fine in builds (build directories have no `"type": "module"`) but failed when loading from the project root.
- **Fix:** Add `{"type":"commonjs"}` to `runtime/package.json` and `clear-runtime/package.json`. Node scopes `"type"` per-directory, so files in those dirs are now treated as CJS regardless of the root setting.
- **Rule:** Any directory of CJS files inside an ESM project needs its own `package.json` with `{"type":"commonjs"}`. This applies to all three runtime files (`db.js`, `auth.js`, `rateLimit.js`).

### better-sqlite3 Module Resolution in Nested Build Directories
- **better-sqlite3 is installed in Clear root `node_modules/`**. The playground builds to `.playground-build/clear-runtime/db.js`. When `db.js` does `require('better-sqlite3')`, Node walks up: `.playground-build/clear-runtime/`, `.playground-build/`, `playground/`, `[root]/` — finds it at root. ✓
- **No need to copy the native module** — standard Node resolution handles it across all build subdirectories.
- **Standalone deployment (`clear package`):** Build directories get their own `package.json` with `better-sqlite3` listed, so `npm install` in the Dockerfile picks it up correctly.
- **Prebuilds on Node 24 Windows:** better-sqlite3 ships prebuilt binaries via `@mapbox/node-pre-gyp`. `npm install` is fast (~5 seconds). No MSVC needed unless prebuild download fails.

### WAL Mode is the Right Default for SQLite Servers
- **`PRAGMA journal_mode = WAL`** allows concurrent reads while writes are in progress. This matters for Express servers that handle overlapping requests. Default journal mode (DELETE) locks the whole file on every write.
- **`PRAGMA synchronous = NORMAL`** is safe with WAL and much faster than `FULL`. SQLite's WAL ensures crash safety even at NORMAL. Only use `FULL` if you need guaranteed durability on every write.

### Boolean Coercion: SQLite Stores Integers, JS Expects Booleans
- **SQLite has no boolean type** — `INTEGER` 0/1 is the convention. When you insert `true`, SQLite stores `1`. When you read it back, you get `1` (a number), not `true`.
- **Fix:** Keep an in-memory schema registry (`_schemas`). In `findAll`/`findOne`, call `coerceRecord()` which converts any field with `type: 'boolean'` from 0/1 to false/true.
- **Coerce on write too:** `coerceForStorage()` converts `true` → `1`, `false` → `0` before inserting into SQL params.
- **Rule:** Every layer that reads from SQLite must coerce booleans. Don't assume JS truthiness (`1` is truthy but `1 !== true`).

### sqlite_sequence Table: Try/Catch in reset()
- **`sqlite_sequence`** is SQLite's internal table for tracking AUTOINCREMENT counters. It only exists after the first AUTOINCREMENT insert. Calling `DELETE FROM sqlite_sequence WHERE name = ?` before any row has been inserted throws.
- **Fix:** Wrap in try/catch and ignore the error. The table's absence means there's nothing to reset anyway.
- **Rule:** Any operation on `sqlite_sequence` needs a try/catch guard.

### Git Branch Hygiene in Multi-Session Work
- **The branch you create in one bash call doesn't necessarily persist as the "active" branch** in subsequent calls if there's unstaged state on another branch. Always verify with `git branch --show-current` before committing.
- **Feature branches should be clean before starting SQLite/other work** — having uncommitted work on a different branch causes branch switches to fail, and stash/pop cycles introduce conflicts.

---

## Session 16: Landing Pages v2 (2026-04-10)

### Context Array Registration is the #1 Bug Class
- **When adding new presets to `BUILTIN_PRESET_CLASSES`, you MUST update 8 arrays** in compiler.js: `isCardPreset`, `isHeroPreset`, `GRID_SECTION_PRESETS`, `inPageSection`, `inLandingCard`, `COLORED_CARD_PRESETS`, `inDarkSection`, `heroInlineStyle`.
- **The bug:** Colored card variants (`feature_card_teal`, `feature_card_purple`, etc.) were missing from `inLandingCard`. Result: headings inside colored cards rendered as `<h1>` (page heading style) instead of `<h3>` (card heading style) with white text.
- **Rule:** After adding ANY new preset, grep for each array name and verify. This is a blocking check.

### DaisyUI CSS Variable Opacity Modifiers Don't Work
- **`bg-primary/8` renders as transparent** when `primary` is a DaisyUI CSS variable (`--color-primary`). Tailwind v4's opacity modifier can't decompose the variable at compile time.
- **Fix:** Use inline style with `oklch(from var(--color-primary) l c h / 0.08)` instead. The `oklch(from ...)` relative color syntax works at runtime.
- **Applies to:** Any Tailwind utility that tries `{utility}-{daisyui-color}/{opacity}`.

### Dark Page Screenshots Time Out
- **`preview_screenshot` consistently times out (~30s) on dark-themed pages** (midnight, slate). Light pages (ivory) work fine. Root cause unknown — possibly Tailwind CDN processing time on dark themes.
- **Workaround:** Use `preview_eval` for DOM inspection (computed styles, element presence) and `preview_snapshot` for accessibility tree structure. Both work reliably on dark pages.

### Bento Layout Pattern
- **`feature_split` creates a bento grid:** first card gets `lg:col-span-2` (2/3 width), remaining cards stack vertically in 1/3 width. The first card should use `feature_card_large` (primary bg).
- **Dark bento:** Use `feature_split_dark` for the outer section. The `feature_card_large` uses `bg-primary text-primary-content` which adapts to the theme automatically.
- **`bg-white/5` on `feature_card_dark` is intentional** — creates a frosted glass panel on dark backgrounds (Linear style).

---

## Session 17: Pareto 20 + IDE Chat v2 (2026-04-10)

### Context Array Checklist Is Non-Negotiable
- **Every new preset MUST be checked against ALL 8 context arrays:** `isCardPreset`, `isHeroPreset`, `GRID_SECTION_PRESETS`, `inPageSection`, `inLandingCard`, `COLORED_CARD_PRESETS`, `inDarkSection`, `heroInlineStyle`.
- Missing from one array = silent rendering bugs (wrong max-width, wrong text color, missing grid layout).
- The plan's checklist section saved hours of debugging. Always grep for each array name after adding a preset.

### historyKeymap Extraction for Undo
- **CodeMirror's `undo` function is NOT directly exported** from a typical bundle. Importing `{ undo }` returns `undefined`.
- **Fix:** Extract it from `historyKeymap`: `const undoCmd = historyKeymap.find(k => k.key === 'Mod-z')?.run;` — this always works.
- The import failure is silent — it doesn't throw, it just makes `undo` undefined, which crashes later when called.

### Array.isArray Guard for Mixed Content Messages
- When a user pastes an image and then types text, the chat message `content` becomes an array `[{type:'image',...},{type:'text',...}]` instead of a string.
- **`escHtml(content)` crashes** because `(s || '').replace()` doesn't work on arrays.
- **Fix:** Check `Array.isArray(m.content)` and iterate, rendering images as `<img>` and text normally.

### SVG Sanitization
- When rendering SVG from chat (```svg blocks), always strip `<script>` tags: `.replace(/<script[\s\S]*?<\/script>/gi, '')`.
- SVG is powerful — it can contain arbitrary JS via `<script>`, `onload`, etc. Strip scripts at minimum; could add event handler stripping later.

### CSS-Only Components via DaisyUI
- **FAQ accordion:** DaisyUI `collapse` component uses `<input type="checkbox">` — pure CSS toggle, no JS.
- **Modal:** DaisyUI `modal` with `<dialog>` element — native HTML, no JS needed for open/close.
- These are the right patterns when the compiler doesn't emit JS.

### Per-Theme Font Stacks
- CSS custom properties `--font-body`, `--font-display`, `--font-mono` per theme allow different font personalities.
- `CSS_RESET` uses `var(--font-body)` as the default body font, with a fallback chain.
- Google Fonts `<link>` must load ALL fonts used across ALL themes (Inter, DM Sans, Plus Jakarta Sans, JetBrains Mono, Geist Mono).

---

## Session 18: ECharts Analytics Dashboard + Chart Syntax Upgrade (2026-04-10)

### overflow-hidden Collapses Flex Children
- **When a card container has `overflow-hidden` in a flex column layout, and the child has an explicit height (like ECharts canvas at 350px), the parent can collapse to just its padding+header height, clipping the child.** The flex algorithm respects `overflow: hidden` as permission to clip, and the child's explicit height doesn't force the parent to grow.
- **Fix:** Remove `overflow-hidden` from containers that need to size to their children's explicit heights. Only use `overflow-hidden` on containers where clipping is actually desired (e.g., rounded corners on images).

### flex-col gap-6 vs space-y-6 for Scrollable Content
- **`app_content` used `flex flex-col gap-6` which caused flex items without explicit heights (like tables and lists) to shrink to 0px** when taller siblings (charts) filled the available space. Flex shrink is the default (`flex-shrink: 1`), so items without a basis or explicit height collapse first.
- **Fix:** Switch to block layout with `space-y-6`. Block children don't participate in flex shrinking — they stack naturally and each takes whatever height their content needs. The container scrolls if total height exceeds viewport.

### ECharts init Needs Visible Container
- **ECharts `init()` requires the container to have non-zero dimensions at init time.** If the container is hidden or collapsed (e.g., by the overflow-hidden bug above), the chart renders but is invisible — no error thrown, just a 0x0 canvas.
- **Always verify the container element's `offsetHeight > 0` before initializing.** If the container isn't visible yet (e.g., in a tab or collapsed panel), defer init to when it becomes visible.

### Chart groupBy for All Chart Types
- **Originally `by field` grouping only worked for pie charts.** Extended to bar/line/area by counting occurrences per group value and mapping to x-axis categories. This eliminates the need for separate "stats" tables and endpoints when you just want to visualize field distributions.
- **Pattern:** `bar chart 'Tasks by Status' showing tasks by status` → counts tasks per status value, renders as bar chart with status values on x-axis and counts on y-axis.

### Type-First Chart Syntax Is More Natural
- **Changed canonical chart syntax from `chart 'Title' as bar showing data` to `bar chart 'Title' showing data`.** Reads like English: "bar chart called Revenue showing sales".
- **Also supports title-first:** `'Revenue' bar chart showing data`. Old syntax (`chart ... as bar`) still works as legacy.
- **Rule:** When adding new syntax variants, keep old forms working but make the new form canonical in docs and examples. Gradual migration > breaking change.

### Removing Synonym `area` from Section
- **`area` was a synonym for `section` that nobody used.** Removing it freed up `area chart 'Title' showing data` syntax.
- **Always check synonym collisions before adding chart-type keywords.** A chart type name that's also a synonym for something else will be tokenized as the synonym, not as a chart type.
- **Rule:** Before registering any new keyword, grep `synonyms.js` for collisions. If the word exists as a synonym, remove the synonym first (and verify nothing depends on it).

### metric_card Trend Detection
- **Text starting with `+` or `-` followed by a number in metric_card is auto-detected and rendered with colored (green/red) text plus arrow SVG icons.** Pattern: `/^([+\-−][\d.,]+%?\s*)/`.
- **This gives TailAdmin-quality stat cards with zero extra syntax.** The user writes `'+12.5% from last month'` and gets a green up-arrow with colored text automatically.
- **The `−` (U+2212 minus sign) is included in the regex** alongside `-` (U+002D hyphen-minus) because some users copy-paste from formatted text.

---

## Session 19: Tests, Charts, Blog, Images (2026-04-10)

### Component Composition Test Fixes (4 Bugs → 7 Failures)
- **`isReactiveApp()` didn't detect component usage.** COMPONENT_USE and uppercase SHOW+CALL (`show Card('x')`) need to trigger reactive path, or `_recompute` never emits. Fix: added both checks.
- **Lowercase function calls got component containers.** `show double(5)` incorrectly rendered `<div class="clear-component">`. Fix: `/^[A-Z]/` guard on SHOW+CALL.
- **Component functions emitted inside `_recompute`.** COMPONENT_DEF and FUNCTION_DEF need to be hoisted before the `_recompute()` function body. Fix: separate hoisting pass.
- **COMPONENT_USE children lost.** Block-form component code used `node.body` but children are on `node.children`. Fix: use `node.children` + build HTML string from children.
- **`heading title` in component tests.** Parser rejects bare identifiers after `heading`. Changed tests to `show title` / `show name`.

### Image Element — New Content Type
- **`image` is the only synonym.** Adding `photo` or `picture` broke file input tests (`'Photo' is a file input saved as a photo`). Synonym collisions are insidious — always grep test suite.
- **Token `40px` tokenizes as NUMBER(40) + IDENTIFIER(px).** Not a single token. Parser must consume two tokens and concatenate.
- **`String.match()` crashes on number token values.** Token `.value` is a JS number for NUMBER tokens. Always `String(t.value)` before string methods.
- **Image `ui` object must use `{ contentType: 'image', text: url }`** — not `{ tag: 'image', src: url }`. The buildHTML switch dispatches on `node.ui.contentType`.

### Seed Auto-Dedup at Compiler Level
- **`guard existing is empty` doesn't work.** `empty` is synonym for `nothing` (null), but `db.findAll()` returns `[]` (truthy empty array). Can't express array-empty check in Clear syntax yet.
- **`db.getAll()` doesn't exist.** Runtime method is `db.findAll()`. Always check runtime API.
- **SQLite file persists across server restarts.** `clear-data.db` accumulates seed data on every page load. Fix: compiler auto-injects findAll check at top of seed endpoints.

### Chart Subtitle & Stacked Modifiers
- **Subtitle parsed after title, before `showing`.** `bar chart 'Title' subtitle 'Description' showing data`.
- **Stacked parsed after groupBy.** `showing data by field stacked` → `stack: 'total'` on all ECharts series.
- **Both are optional keyword modifiers** — no synonym registration needed, just positional parsing in `parseChartRemainder`.

### Blog Presets
- **Three new presets:** `blog_grid` (card listing), `blog_card` (post card), `blog_article` (Medium-style single post).
- **Blog article uses `max-w-3xl mx-auto`** for comfortable reading width.
- **Blog cards use `hover:-translate-y-0.5 transition-all`** for subtle lift effect.

---

## Session 19b: Display as Cards (2026-04-10)

### `display X as cards` — New Display Format
- **Field role detection order matters.** `author_name` contains `name` which would match as `title` if checked first. Must check `author`/`date`/`created` BEFORE `title`/`name`/`heading`.
- **`ui.tag` now has 3 values:** `table`, `cards`, `output`. The parser `displayNode()` sets this from the format string.
- **Smart heuristics by column name** — image/avatar/url fields → images, category/tag/status → badges, title/name → headings, excerpt/description/body → truncated text, author/date → meta row. Fallback: first unmatched field → title, second → body.
- **Auto-exclude internal fields** — When no `showing` columns specified, auto-filters out `id` and fields ending with `_at` or `_at_date` (timestamps).
- **Card HTML uses same classes as `blog_card` preset** — `rounded-2xl`, `border-base-300/40`, `hover:shadow-lg hover:-translate-y-0.5` for visual consistency between static and dynamic cards.

---

## Session 19c: Component Stress Test (2026-04-10)

### Component Names Collide with Content Types
- **`Badge`, `Text`, `Heading`, `Image`, `Button`, `Link`, `Divider`, `Section`, `Display` are reserved.** The `show` parser checks content canonicals BEFORE component calls. `show Badge('Active')` parses as `badge text 'Active'` instead of a component call.
- **No parser fix is practical.** Content type dispatch happens first and can't easily be reordered without breaking everything. The right fix is a compile-time error: `parseComponentDef()` rejects reserved names with a helpful suggestion (`Badge` → `StatusBadge`, `CustomBadge`, `MyBadge`).
- **Reserved name set is hard-coded in `parseComponentDef()`** — not derived from synonyms. Only the 10 names that actually collide are blocked.

### Component Edge Cases (8 stress tests)
- **Nested sections inside components** — components containing `section` blocks compile correctly.
- **Multiple content types** — `heading` + `text` + `badge` + `divider` all work inside one component.
- **Multiple args** — `define component X receiving a, b, c:` works, all args accessible.
- **Reactive state as prop** — passing a state variable to a component triggers recompute correctly.
- **Two components on one page** — no namespace collision.
- **Block-form with image** — `image` element inside component body works.
- **Same component used twice** — no duplication or ID collision.
- **Component inside conditional** — `if X then show MyComponent(Y)` compiles correctly.

## Session 20: General-Purpose Language Features (2026-04-10)

### Synonym Canonicals Bite Every New Feature
- `of` tokenizes to canonical `in` — checking `tok.canonical === 'of'` always fails. Use `=== 'in'`.
- `using` → canonical `with`. Use `.value === 'using'` for FILTER_APPLY disambiguation.
- `returns` → canonical `responds_with`. Use `.value === 'returns'` for return type detection.
- `exists in` is a **compound token** with canonical `key_exists`. Don't check two separate tokens; check `tok.canonical === 'key_exists'` in the infix operator loop of `parseExprPrec`.

### `parsePrimary` Has No `errors` Array
- `parseStringParts` is called from inside `parsePrimary`; that function doesn't receive an `errors` array. Use silent fallback (return `null`) if tokenizing the interpolation fails — errors bubble up as bad output, not crashes.

### `run()` Calls `process.exit()` in Tests
- `lib/testUtils.js` `run()` calls `process.exit()`. Any `describe()` block placed **after** `run()` is silently ignored. Always add new test blocks **before** the single `run()` call at the bottom of `clear.test.js`.

### `params` Are Now Objects `{name, type}`, Not Strings
- `functionDefNode` normalizes all params to `{name, type}` objects. Every call site that was `params.map(sanitizeName)` must be `params.map(p => sanitizeName(p.name))`. Also affects `validator.js` scope building — use `typeof p === 'string' ? p : p.name`.

### TRY_HANDLE: `handlers` Array Replaces `handleBody`/`errorVar`
- Old API: `{ tryBody, handleBody, errorVar }`. New API: `{ tryBody, handlers: [{errorType, body}] }`.
- `errorVar` is gone; the compiled catch variable is always `_err`.
- Validator, compiler, and any test that checked `node.handleBody` or `node.errorVar` must use `node.handlers[0].body` / `node.handlers[0].errorType`.

### Indentation for Typed Error Handlers (Python)
- When typed handlers (`if error 'X':`) are present, the body goes INSIDE an `if/elif/else` block inside the `except` — needs `indent + 2` total. Pass ctx with `indent + 1` to `compileBody` so the auto-increment gives `indent + 2`.
- Untyped-only (single `if error:`) body goes directly in `except` at `indent + 1` — use normal ctx.

### Edit Tool Silently Fails on Large Files
- The Edit tool sometimes silently does nothing on files > 6000 lines when the match string contains template literals with `\n`. Use Python `content[start:end]` slice replacement with exact offsets instead.

---

## Session 21: RL Foundation + Source Maps + Page Slugs (2026-04-11)

### npm require() used double-quotes
- `JSON.stringify('stripe')` produces `"stripe"` but the rest of the server.js file uses single quotes. Fix: use template literals `` `const ${alias} = require('${pkg}');` `` instead of JSON.stringify for the require call.

### Backend `// clear:N` source map markers — always on
- Source map comments in backend mode are always emitted (not gated by `sourceMap: true`). This is intentional — the `_clearLineMap` embedded in every compiled server needs per-statement granularity to translate runtime stack traces. The `ctx.indent > 1` check was relaxed to `ctx.indent > 2` for backend mode, allowing markers inside endpoint bodies (indent=2).

### `_clearLineMap` injection causes off-by-one
- The `_clearLineMap` is injected as line 2 of the compiled output (after the version comment). This shifts all subsequent line numbers by 1. The map-building code compensates with `lineMap[idx + 2]` (not `idx + 1`): `+1` for 0-to-1 indexing, `+1` more for the injected line. If you change the injection point, update the offset.

### `pageNode` always sets route now
- `pageNode()` previously set `node.route` only when `at 'path'` was explicit. Now it always sets it (slugified from title if no explicit path). Single-page apps are safe because the compiler's `hasRouting = pages.length > 1` check gates the routing system independently of whether `node.route` is set.

### Sandbox symlinkSync needs 'junction' on Windows
- `fs.symlinkSync(src, dest)` on Windows requires a third argument for directory symlinks: `'junction'`. Without it, the symlink creation fails silently or throws. Junction points work without admin rights on Windows; regular symlinks may not.

### Sandbox HTTP poll: any status code = server ready
- The sandbox polls for server readiness by making an HTTP request to `/`. The poll resolves as soon as ANY response comes back (200, 404, 500 — all count). The server is "ready" as soon as it responds, regardless of status. Only ECONNREFUSED means it's not up yet. Don't check `response.status` in the readiness poll.

---

## Session 22: Compiler Requests + RL Infrastructure (2026-04-11)

### Optional chaining `?.` only applies to user-written possessive access
- MEMBER_ACCESS nodes are created by the parser for Clear possessive syntax like `user's name`. The compiler now emits `user?.name` instead of `user.name` for null-safety.
- BUT: compiler-generated property access (`req.body`, `db.findAll`) is NOT MEMBER_ACCESS — it's hardcoded strings in the compiler. So `?.` only affects user-written code, which is exactly what you want.
- Exception: `error.message` inside catch blocks needs hard `.` (error is always defined in the catch). Added `isErrorObj` check to preserve `.` for the `error` variable.

### Keyword guard must whitelist content-type words
- The new "unrecognized syntax" guard catches unknown keywords before the bare-expression fallback. But `text title` inside a component body was flagged because `text` is a keyword (canonical `content_text`). Fix: `EXPRESSION_SAFE_KEYWORDS` set includes content types (`text`, `heading`, `subheading`, etc.).

### `_pick` auto-serializes nested objects for SQLite
- SQLite can't store JSON objects in columns. The `_pick` helper now detects nested values (`typeof v === "object"`) and `JSON.stringify`s them before INSERT.
- Complementary `_revive` helper auto-parses JSON strings back to objects on retrieval (`findOne`/`findAll` wrapped with `.map(_revive)`).

### User-written TEST_DEF bodies go through `generateE2ETests`, not `compileNode`
- `compileNode` handles TEST_DEF at line ~3725 for the standard compilation path. But the auto-generated E2E test file is built by `generateE2ETests()` (line ~688), which pushes string lines — a completely separate codepath.
- User-written test blocks must be collected from the AST and compiled into `generateE2ETests()`. They appear after all auto-generated tests, with a `_baseUrl = BASE` alias and an `expect()` shim.

### Cron tokenizer splits `2:30pm` into multi-token sequence
- The tokenizer splits `2:30pm:` as `NUMBER(2) COLON NUMBER(30) IDENTIFIER(pm) COLON`. There's no "time literal" in the token system.
- `parseCron()` handles this by consuming tokens individually: number, optional colon+number for minutes, optional am/pm identifier. Don't try to make the tokenizer understand time.

### Patch API body indentation: always add 2-space prefix
- When `add_endpoint` adds body lines, it must ALWAYS prepend `  ` (2 spaces). The original code skipped lines that already started with `  `, but those were relative to the body (0-indent), not the file root. A `validate data:` line with sub-rules like `  name must not be empty` needs to become `    name must not be empty` (4 spaces) in the file.

### `run command` capture mode uses ASSIGN special-case, not exprToCode
- `result = run command 'cmd'` is parsed as an ASSIGN node where `expression.type === RUN_COMMAND` with `capture: true`. The ASSIGN compiler case handles it directly (like EXTERNAL_FETCH), NOT through `exprToCode`. This is because `execSync(...)` is a statement, not an expression in the compiler's model.

### `hasRunCommand` detector must check inside ASSIGN expressions
- The `child_process` import detector (`usesRunCommand`) originally only checked for standalone RUN_COMMAND nodes and endpoint bodies. When output capture was added, `result = run command 'cmd'` creates an ASSIGN node whose expression is RUN_COMMAND — the detector missed this. Fixed with a recursive `hasRunCommand(nodes)` that also checks ASSIGN expressions and CRON bodies.

---

## Session 20: Compiler Bug Fixes + SVG Rendering (2026-04-11)

### Tree-shaker callback blind spot
- `_getUsedUtilities()` checked for `utilName + '('` to detect function usage. But `.map(_revive)` passes the function as a callback — no open paren. Fix: also check for `utilName + ')'`, `utilName + ','`, `utilName + ';'`. This one bug broke every GET endpoint in Clear for weeks — `_revive` was tree-shaken out of every compiled server.

### Conditional DOM visibility requires reactive path
- Static pages with `if/else` containing UI nodes (`text`, `heading`, etc.) compiled to empty JS if-bodies because UI nodes produce HTML but no JS. Fix: mark pages with block-form `IF_THEN` as reactive (`isReactiveApp`), and recurse `findConditionals` into IF_THEN branches (not just PAGE/SECTION) to match HTML scaffold's walk order.

### `show alert` parsed as expression, not toast
- Parser checked `tokens[1].value === 'toast'` but user writes `show alert`. Fix: accept `alert` and `notification` as synonyms for `toast` in the parser dispatch, not the synonym table (avoids tokenizer collisions with `show alert` as a bare expression path).

### `text item` in for-each — guard too strict
- The `content_text` dispatch guarded `text` as content-keyword only when followed by `TokenType.STRING`. `text item` (identifier) fell through to variable reference → `console.log(text)`. Fix: also accept identifiers, parse as SHOW node via `parseExpression`.

### String concat in `text` dropped variables
- `text 'Price: ' + price` — parser routed to `parseContent` which only reads the first string token. Fix: check for operator after string, route to expression parser if found.

### SHOW nodes in web pages need DOM targets
- `compileNode` for SHOW always emitted `console.log()`. In web frontend pages, SHOW nodes should target DOM elements. Fix: HTML scaffold creates `<p id="show_N">` placeholders, JS compiler emits `getElementById` updates when `ctx.insidePage` is set.

### `display as list` — missing format path
- HTML scaffold and reactive compiler only handled `table` and `cards` formats. `list` fell through to stat-card widget. Fix: added `list` tag in `displayNode`, `<ul>` in HTML scaffold, list iteration JS in reactive compiler, and `isReactiveApp` detection.

### Bare SVG in chat — streaming UX
- Claude models emit raw `<svg>` without code fences. `markdownToHtml` only detected fenced SVG. Fix: Phase 2 regex extracts bare `<svg>...</svg>` from text parts. Phase 3 detects incomplete SVG during streaming (`<svg` without `</svg>`) and shows "*Rendering diagram...*" placeholder.

---

## Session 23: Agent Bug Fixes + Extended Thinking (2026-04-11)

### SVG Namespace Loss: innerHTML vs cloneNode
- **SVG elements lose their namespace when extracted via `innerHTML` and re-inserted.** `innerHTML` on SVG elements returns plain text without namespace declarations. Reinserting that text creates HTML elements (`<rect>`, `<circle>`) instead of SVG elements — they render as invisible.
- **Fix:** Use `cloneNode(true)` to clone the SVG DOM node, preserving the SVG namespace. For overlay/expand use cases, clone the original `<svg>` element from the DOM rather than serializing to string and parsing back.
- **Rule:** Never use `innerHTML` to extract and re-insert SVG content. Always use DOM cloning APIs.

### `as json` / `to_json` Synonym Collision with Display Formats
- **`to_json` is the canonical form of `as json`.** The tokenizer rewrites `as json` → `to_json`. This collides with the display format parser which needs to detect `as json` (e.g., `display data as json`).
- **Three places need fixing:** (1) `hasDisplayModifiers()` must check for `to_json` canonical in the expression scan, (2) the expression-end scan in `parseDisplay()` must stop at `to_json`, and (3) the format detection must recognize `to_json` as the `json` format.
- **Pattern:** Whenever a synonym rewrites a word that's also used positionally in another parser path, you must audit every parser that touches that word. Grep for both the raw value and the canonical.

### Python State Dict Keys Must Be Quoted Strings
- **Python workflow state initialization used bare identifiers as dict keys:** `{field: None}`. Python interprets bare identifiers as variable references, not string keys, causing `NameError` at runtime.
- **Fix:** Quote all state field keys: `{"field": None}`. Also convert `null` → `None`, `true` → `True`, `false` → `False` in default values.

### Anthropic Thinking API: Signature for Multi-Turn
- **Extended thinking in the Anthropic API requires a `thinking` field with `budget_tokens` in the request.** But for multi-turn conversations, subsequent messages that include thinking blocks must also include a `signature` field on each thinking content block.
- **The signature is returned by the API** in the response's thinking content blocks. Store it in the message history and replay it exactly on subsequent turns.
- **Without the signature, the API rejects the request** with a 400 error on any multi-turn thinking conversation.

### Display Format: `toLocaleString` Replaces `toFixed(2)` for Currency
- **Old currency display used `'$' + value.toFixed(2)`.** This doesn't handle thousands separators, locale differences, or non-USD currencies.
- **Fix:** Use `toLocaleString('en-US', { style: 'currency', currency: 'USD' })` for currency, `toLocaleString('en-US', { style: 'percent' })` for percent, and `new Date().toLocaleDateString()` for dates.
- **`as json` format** uses `JSON.stringify(value, null, 2)` wrapped in `<pre>` for readable display.

### CRUD Auto-Inject `:id` for PUT/DELETE Endpoints
- **PUT and DELETE endpoints without `:id` in the path silently failed** — the compiled code referenced `req.params.id` but the Express route had no `:id` parameter, so `req.params.id` was `undefined`.
- **Fix:** Compiler auto-appends `/:id` to PUT/DELETE endpoint paths if not already present. This matches REST convention and prevents silent data loss.

## Session 24: Roadmap Items 1-4 (2026-04-12)

### Non-Reactive JS Didn't Tree-Shake Utilities
- **`compileToJS` (non-reactive web path) compiled code that referenced utility functions like `_clear_sum_field` but never emitted their definitions.** The backend path (`compileToJSBackend`) and reactive path both had tree-shaking, but the plain JS path just joined compiled lines directly.
- **Fix:** Added `_getUsedUtilities(bodyText)` call to `compileToJS` before joining lines.
- **Rule:** Any new compilation path that emits function calls to UTILITY_FUNCTIONS must also include the tree-shaking step.

### `in` Is Not a Binary Operator — Expression Parser Stops At It
- **`sum of amount in orders` — the expression parser stops at `in` because it's not in the PRECEDENCE table.** This means `parsePrimary` called from the collection ops handler returns just `amount`, leaving `in orders` unconsumed.
- **Fix:** Handle `in` explicitly inside the collection ops handler, not in general expression parsing. After `parsePrimary` returns the operand, check if the next token is `in` and consume the list token.
- **Pattern:** When a keyword serves as both a preposition (field `in` list) and a general word, handle it in the specific handler that understands the context, not in the general expression parser.

### Multi-Word Synonyms for New Syntax: `allow signup and login`
- **New syntax that uses multiple ordinary words needs a multi-word synonym entry** so the tokenizer merges them into a single canonical token before the parser sees them.
- **Pattern:** Follow the `allow_cors` pattern — add to `SYNONYM_TABLE` with all phrase variants, add to `CANONICAL_DISPATCH` with a simple node push, bump `SYNONYM_VERSION`.
- **Gotcha:** Remember to update the version string test (`has a version string`) in clear.test.js when bumping `SYNONYM_VERSION`.

### Validator BUILTINS Must Include Internal Function Names
- **Parser-generated internal function names like `_sum_field` must be in the validator's `BUILTINS` set** or the validator will flag them as "undefined function" errors.
- **The validator runs BEFORE the compiler**, so it doesn't know about `mapFunctionNameJS` which maps `_sum_field` → `_clear_sum_field`. It only knows about names in the `BUILTINS` set.

### Multer `require` Must Be Module-Scope
- **`const multer = require('multer')` was emitted inside endpoint handler functions.** Each request re-required multer, and the upload middleware wasn't available at route registration time.
- **Fix:** Detect file upload nodes in the AST during the pre-scan phase and emit the multer require at module scope, before any route definitions.

### Python Cron: Lifespan Context Manager
- **Python (FastAPI) cron jobs need the `lifespan` context manager pattern**, not `@app.on_event("startup")` (deprecated in modern FastAPI). The lifespan function yields once, running startup code before the yield and cleanup after.
- **Cron body wrapped in try/catch** to prevent one failed tick from killing the schedule.

---

## Session 25: Roadmap 5-12 + Click-to-Highlight (2026-04-12)

### CM6 Virtual Rendering Breaks DOM Manipulation
- **CodeMirror 6 only renders lines in the visible viewport.** `domAtPos()` returns null or throws for offscreen lines. The click-to-highlight feature tried to add CSS classes to offscreen DOM elements that didn't exist.
- **Fix:** Scroll to the target line first (`EditorView.scrollIntoView`), then wait 100ms for CM6 to render the viewport, then walk the DOM. Double `requestAnimationFrame` wasn't reliable enough — `setTimeout(100)` works.
- **Lesson:** Any CM6 feature that needs to manipulate specific line DOM elements must scroll-then-wait. Selection-based highlighting doesn't work either because `EditorView.editable.of(false)` suppresses selection display.

### Postamble After Return = Dead Code
- **The agent compiler emitted `return response;` in bodyCode, then appended postamble (conversation history save) after it.** The save was dead code — memory loaded but never persisted.
- **Fix:** Before final assembly, find the last `return` in bodyCode and inject postamble before it.
- **Lesson:** Any time compiler sections are assembled by string concatenation (preamble + bodyCode + postamble), check that bodyCode doesn't contain early returns that skip the postamble.

### Mixed Param Formats Cause Silent Bugs
- **`fnDef.params` was sometimes `[{name, type}]` (typed params) and sometimes `['name']` (untyped params).** Every consumer had to do `typeof p === 'string' ? p : p.name`. The tool schema bug (`[object Object]`) was caused by using the object as a key.
- **Fix:** Normalized parser to always push `{name, type: null}` for untyped params. Removed all `typeof` guards downstream.
- **Lesson:** Mixed data formats in the same array are a bug factory. Normalize at the source (parser), not at every consumer.

### Compile Animation Blocks User Interaction
- **The compile animation sets `compileAnimRunning = true` for 20+ seconds.** Any feature gated on `!compileAnimRunning` is unusable during that time. Click-to-highlight was silently ignored.
- **Fix:** Clicking a source line cancels the animation and switches to the compiled view immediately. Also capped animation speed at ~5 seconds total.
- **Lesson:** Never gate user interactions on long-running animations. Let the user's action interrupt the animation.

### `/api/compile` Needs `sourceMap: true`
- **The IDE's compile endpoint didn't pass `sourceMap: true` to `compileProgram()`.** Frontend JS had no `// clear:N` markers, so the source map was always null for web-only apps.
- **Fix:** Pass `sourceMap: true` in the `/api/compile` handler. Markers are just comments — zero runtime cost.
- **Lesson:** When adding a feature that depends on compiler options, check that the API endpoint passes those options.

### Source Map Must Match Compiled Sub-Tab
- **The source map was built from `serverJS`, but the compiled view defaulted to the HTML tab.** Line ranges from serverJS don't correspond to HTML content — highlights hit wrong lines or out-of-bounds.
- **Fix:** Track which sub-tab the source map was built from (`sourceMapTab`). When clicking a source line, switch to that tab before highlighting.

### CSS `display` Duplication Bug
- **`style="display:none; ... display:flex;"` — the last property wins in CSS.** The context meter was always visible (empty) instead of hidden until data arrives.
- **Lesson:** Inline styles with duplicate properties are silent bugs. Only one `display` per style attribute.

---

## Session 25b: Core 7 Templates + E2E Testing (2026-04-12)

### GET Endpoints Must Use req.query, Not req.body
- **`sending params` on a GET endpoint compiled to `req.body` — which is always empty on GET requests.** Every search endpoint returned 400 ("Request body is required").
- **Fix:** Compiler now checks `node.method === 'GET'` and uses `req.query` instead of `req.body`.
- **Lesson:** HTTP semantics matter in compiled output. GET has no body. POST/PUT have bodies. The compiler must respect this, not treat all `sending X` the same.

### `send back get all X` Is Not One Line
- **`send back get all Companies` compiled to `res.json(get)` — treating `get` as an undefined variable.** The parser can't handle an inline query inside `send back`.
- **Fix:** Split into two lines: `all_companies = get all Companies` then `send back all_companies`. Updated all 3 CRM-Pro endpoints.
- **Lesson:** Clear's one-op-per-line philosophy exists for a reason. Combining two operations in one line creates ambiguity the parser can't resolve. When in doubt, use a named intermediate.

### Compiled Apps Need npm Dependencies Installed
- **The playground's build directory only had `ws` in package.json.** Apps using `allow signup and login` need `bcryptjs` + `jsonwebtoken`, but those weren't installed. CRM-Pro crashed on startup.
- **Fix:** Server.js now scans compiled code for `require('bcryptjs')` etc. and adds deps to package.json, then runs `npm install` if any are missing.
- **Lesson:** When the compiler emits `require()` for external packages, the runtime environment must have them. Auto-detect from compiled output is more reliable than maintaining a manual list.

### Synonym Changes Propagate to All Templates
- **Global `sed` replacing `requires auth` → `requires login` across 33 template files broke `this endpoint requires auth` (a multi-word synonym).** The synonym table had `this endpoint requires auth` but not `this endpoint requires login`.
- **Fix:** Added `this endpoint requires login` to the `needs_login` synonym list.
- **Lesson:** When changing canonical forms via global search-replace, check the synonym table for multi-word phrases that include the old form. Each synonym entry is a fragile string match.

### Typo Suggestions Need Length Guards
- **Edit distance of 2 between `a` and `if` made the validator suggest "Did you mean 'if'?" for the word `a`.** One-character words will always fuzzy-match some short keyword.
- **Fix:** Skip reserved words (`a`, `an`, `the`, `in`, etc.) entirely. Require suggestion and target to be within 1 character of each other's length.
- **Lesson:** Fuzzy matching on very short strings produces false positives. Set a minimum length or require proportional similarity, not just absolute edit distance.

### Playwright Selectors Must Be Specific
- **`.cm-content` matched both the editor and the compiled view (two CodeMirror instances).** Playwright crashed with "strict mode violation: resolved to 2 elements."
- **Fix:** Use `#editor-mount .cm-content` to scope to the editor's CodeMirror.
- **Lesson:** In multi-pane IDEs with multiple CodeMirror instances, always scope selectors to the specific pane container. Never use bare `.cm-*` selectors.

## Standard Chat Compilation Target (2026-04-12)

### Tree-Shaker Only Scans bodyLines, Not HTML
- **Bug:** Utility functions called from `onclick` attributes in the HTML scaffold were never included in compiled output. The tree-shaker at `_getUsedUtilities()` scans `compiledJS + routerJS` — it never sees HTML.
- **Fix:** All utility calls must go in the reactive JS bodyLines (event listeners via `addEventListener`), not as inline `onclick` in HTML.
- **Lesson:** When adding new utility functions, verify the call site is in bodyLines. HTML `onclick` is invisible to tree-shaking.

### DaisyUI v5 Uses --color-* Variable Names
- **Bug:** Plan used DaisyUI v4 variable names (`--p`, `--pc`, `--b1`, `--b2`, `--bc`). These resolve to nothing in v5.
- **Fix:** Use `--color-primary`, `--color-primary-content`, `--color-base-100`, `--color-base-200`, `--color-base-content`.
- **Lesson:** Check the compiler's own theme definitions (line 9289+) for correct variable names. Don't assume CSS variable naming from memory.

### Multi-Line UTILITY_FUNCTIONS Use Backtick Strings
- **Pattern:** `_toast` (line 157) is the precedent for multi-line utility functions stored as backtick template literals. `_chatMd` is ~80 lines — too large for a single-line string.
- **Lesson:** For complex utility functions, split into sub-functions with deps (e.g., `_chatMdInline` + `_chatMdBlock` + `_chatMd`). Each has its own entry in UTILITY_FUNCTIONS with declared dependencies.

### Input Absorption Pattern Detection Is Fragile
- **Constraint:** The compiler detects `DISPLAY(chat) → ASK_FOR → BUTTON(with POST)` as adjacent siblings at the same nesting level. If they're wrapped in different sections, absorption fails silently (duplicate controls appear).
- **Lesson:** Document this limitation. The pattern works for the standard chat layout but breaks if someone nests the input in a subsection.

### Porting Studio markdownToHtml: Skip SVG, Keep Code Blocks
- **Gotcha:** Studio's `markdownToHtml()` has 3 phases of SVG handling (extraction, sanitization, rendering). These are deeply interleaved with the code block extraction regex state machine.
- **Fix:** Don't surgically remove SVG. Instead, port only Phase 1 (fenced code block extraction) + `renderInline` + `renderText`. Skip Phases 2-3 entirely.
- **Lesson:** When porting complex functions, identify the phases and only port the ones you need. Don't try to remove unwanted features from the middle of a state machine.

## SSE Streaming for Chat (2026-04-12)

### Compilation Order Is NOT Guaranteed
- **Bug:** Plan assumed agents compile before endpoints (so `streamingAgents` set would be populated). Wrong — `compileToJSBackend()` iterates AST nodes in SOURCE order. If the endpoint appears before the agent in the .clear file, the set is empty when checked.
- **Fix:** Pre-scan AST for streaming agents at `compileProgram()` level BEFORE any compilation starts. Same pattern as `_findAsyncFunctions`.
- **Lesson:** Never assume compilation order. If feature A needs to know about feature B, pre-scan the AST in a separate pass.

### Frontend and Backend Compile in Separate Functions
- **Bug:** `streamingAgentNames` was populated during `compileToJSBackend()` but needed in `compileToReactiveJS()` (frontend). These are completely separate functions called at different times.
- **Fix:** Pre-scan at `compileProgram()` level and pass results to both compilers.
- **Lesson:** Any cross-compiler state must be computed at the `compileProgram()` level and passed down to both `compileToJSBackend()` and `compileToReactiveJS()`.

### SSE Headers Break Express Error Handling
- **Bug:** Once `res.writeHead(200, { 'Content-Type': 'text/event-stream' })` is sent, you can't call `res.status(500).json(...)` in the catch block — headers already sent.
- **Fix:** Streaming endpoints write errors as SSE events: `res.write('data: ' + JSON.stringify({ error: msg }) + '\\n\\n'); res.end();`
- **Lesson:** SSE endpoints need their own error handling pattern. The standard Express try/catch with JSON error response doesn't work after headers are sent.

---

## Session 26: Test Rewrite + Postgres + Railway (2026-04-13)

### Test Generation Architecture

- **Lazy table creation solves CJS/async mismatch.** `db.createTable()` is called at module top-level (synchronous, no `await` possible in CJS). Postgres adapter is async. Fix: `createTable()` stores schema synchronously, `ensureTable()` runs DDL on first actual query. Every query function already has `await`, so the lazy init works transparently.
- **English test names require resource name extraction from URL paths.** `/api/todos/:id` → resource "todo", action "Deleting". Pluralization is tricky: `categories` → `category` needs `ies→y` rule, not just strip `s`. Also need English article exceptions: "a user" not "an user" (`/^uni|^user|^use|^util/` → always "a").
- **Intent-based test syntax maps user intent to endpoints.** "can user create a todo" → find POST endpoint whose path contains pluralized table name. The mapping already existed in `generateE2ETests()` (FK dependency analysis). Same `postByTable` pattern reused for TEST_INTENT compilation.
- **`body` field was missing from endpoint collector.** `generateE2ETests()` stripped endpoint body when building its internal `endpoints` array. Agent test generation needed `ep.body` to find `RUN_AGENT` nodes. Fix: pass `body: node.body || []` through.

### Security (Red Team Findings)

- **SQL injection via table names in db-postgres.js.** Table names from Clear source flow into `CREATE TABLE tableName`. If malicious Clear source names a table `users; DROP TABLE users--`, it's injection. Fix: `name.replace(/[^a-z0-9_]/g, '')` in `createTable()`. Same issue in `buildWhere()` for column names from `req.body` — fix: validate against `/^[a-zA-Z_]\w*$/`.
- **`rejectUnauthorized: false` is a real vulnerability.** Was set for Railway compatibility, but Railway uses publicly trusted certs. Disabling TLS verification enables MITM attacks on the database connection. Fix: set to `true`.
- **`process.exit(1)` at module load kills the entire server.** If `DATABASE_URL` isn't set, the `require('./clear-runtime/db')` call exits the process — even if the endpoint being hit doesn't use the database. Fix: defer to `getPool()` function called on first actual query.
- **`db.run(sql)` is a raw SQL execution hole.** No parameterization, no validation. If any compiled Clear code passes user input to `db.run()`, the database is owned. Currently only used for migrations and transactions — but worth flagging.

### Synonym & Parser Gotchas

- **`can` and `does` self-synonyms collide with existing RBAC usage.** `can` was already used in `define role 'editor': can read, can update`. Adding it to `CANONICAL_DISPATCH` means the dispatch fires on every `can` token. Works by accident because the handler returns `undefined` when second token isn't `user`, falling through to the correct RBAC handler. Fragile — any change to dispatch logic could break role definitions.
- **PRES workflow is overkill for features under ~500 lines.** The test runner pane was ~300 lines of code. The PRES plan was 250 lines. Red-team was another full pass. We spent more time documenting than building. For small features with clear patterns, just build it directly. Save PRES for genuinely complex architecture (like the Postgres adapter).

### Design Principles

- **Rule 15: The compiler tests everything — users don't secure themselves.** If the compiler can think of a test, it generates it. Every endpoint, button, input, display, agent, and CRUD flow gets auto-tested. Security tests are not optional features the user remembers to add — they're structural guarantees that ship with every app. Added to PHILOSOPHY.md.
- **Test names must read like English, not HTTP.** "Creating a new todo succeeds" not "POST /api/todos with valid data returns 201". The compiler translates methods to verbs and paths to resource names. Users writing tests never mention API paths or status codes.

---

## Session 29: Rich Text, Multi-Page Routing, Streaming-as-Default (2026-04-14/15)

### Greedy Multi-Word Synonyms Steal Resource Names
- **Bug:** `send title as a new post to '/api/posts'` was compiled to an empty button handler — the entire send line got silently dropped. Root cause: the tokenizer has `post to` as a multi-word synonym (canonical `post_to`, used for `post to '/url'` style API calls). So `new post to '/api/posts'` tokenized as `new | post-to | /api/posts`, swallowing the resource word "post."
- **Fix:** The `respond` handler in parser.js now recognizes `post_to`/`put_to`/`get_from`/`delete_from` as URL connectors (not just `to_connector`). `send X as a new Y to URL` works regardless of what Y is called.
- **Lesson:** Greedy multi-word synonyms can swallow bare identifiers when those identifiers happen to be the first word of a synonym. Test multi-word resource names (`post`, `put`, `get`, `delete`) in every pattern that accepts a resource identifier.

### `reply` Is a `respond` Synonym — Breaks Bare Assignments
- **Bug:** `reply = ''` at page-top compiled to a RESPOND node. The tokenizer canonicalized `reply` → `respond` (it's in the `respond` synonym list for `send back`). Parser tried to parse `reply = ''` as `respond = ''` and failed.
- **Workaround:** Use `answer`, `result`, `response` instead.
- **Lesson:** Reserved-word synonyms aren't just keywords — they poison variable naming. Document common synonyms as names to avoid. Consider: `respond` handler should fall through to assignment when followed by `=`.

### Client-Side Router Must Read `pathname`, Not Just `hash`
- **Bug:** Multi-page apps silently broke on page refresh. Compiler emitted a router that read `location.hash.slice(1) || '/'`. But the iframe/server loads pages via pathname (`/new`), not hash. Hash is empty → router defaults to `/` → Blog page renders at `/new`.
- **Fix:** Router now reads pathname first, falls back to hash for backward compat. Also: intercepts `<a href="/route">` clicks to use `history.pushState` (SPA nav), listens to `popstate` for back/forward, updates `document.title`.
- **Lesson:** When declaring multi-route UI, test both direct URL navigation AND in-app link clicks. Hash-only routing breaks refresh.

### Express 5 `sendFile` Wants `{ root }` Option
- **Bug:** `res.sendFile(path.join(__dirname, 'index.html'))` worked for `/` but 404'd for `/new`. The `send` module that Express uses threw `NotFoundError` from `SendStream.pipe`. Absolute paths + non-root request URLs don't mix cleanly in send 1.x.
- **Fix:** `res.sendFile('index.html', { root: __dirname })` — with the root option, send resolves safely regardless of request path.
- **Lesson:** Whenever emitting static-file-serving code, always use the root option form. Never rely on absolute paths with sendFile in Express 5.

### "The Variable Updated" Is Not Verification
- **Bug:** I reported the route selector worked because `iframe.src` updated. It didn't. The iframe was showing the OLD page because the compiled client router didn't respond to pathname changes.
- **Rule added:** `Test Before Declaring Done` in CLAUDE.md — verify user-visible outcome (rendered content, DOM heights, observable state), not DOM attribute writes.
- **Lesson:** For every UI/flow claim, verify what a user would see. Check element heights, text content, or screenshot diff. Don't declare success from proxy signals.

### Tests That Say "User Can ..." Must Be True for Users
- **Bug:** Compiler auto-generated a test named `User can create a post and see it in the list` for every POST+GET endpoint pair. It was green. But blog-fullstack had zero UI buttons that POST to `/api/posts` — the test was testing API contract, not user flow. The name lied.
- **Fix:** Walk the AST for `API_CALL` nodes with method='POST' and collect the URLs the frontend actually targets. CRUD flow tests now emit `UI: user can create X ...` only when a button is wired; otherwise `Endpoint: creating X via the API makes it appear in the list (no UI button wired)`. Also emit a compiler warning for POST endpoints with no UI wiring.
- **Lesson:** Test names make promises. If a test name says "user can X" and X requires UI that doesn't exist, the test is misleading. Pattern: auto-detect the affordance before naming the test.

### Streaming Should Be the Default
- **Design call:** Users shouldn't need an extra `stream` keyword for agent responses — streaming IS the natural UX for any AI response. Made `ask claude 'X' with Y` at statement level emit SSE by default. Frontend `get X from URL with Y` auto-detects streaming endpoints (compiler builds a `streamingEndpoints` Set from the AST) and emits a streaming reader. Same syntax handles non-streaming POSTs (one-shot JSON). Explicit opt-out: `... without streaming` for cases where a downstream consumer needs the full text.
- **Lesson:** Defaults should match the common case, not the less-used alternative. When we add a feature with an "opt-in keyword," ask: which is more common? Make that the default, make the other the keyword.

### Non-Existent NodeType Silently Emits `/* ERROR */`
- **Bug:** The `ask claude 'X' with Y` parser (both branches — bare and stream-prefixed) used `NodeType.STRING_LITERAL`, which doesn't exist. The correct constant is `NodeType.LITERAL_STRING`. The compiler's `exprToCode` had no case for `string_literal` so it fell through to a `/* ERROR */` stub. Every streaming endpoint was emitting `_askAIStream(/* ERROR */, context)` — never observed because no one had exercised the streaming path end-to-end.
- **Fix:** Correct both code paths.
- **Lesson:** Enums with similar names (`LITERAL_STRING` vs `STRING_LITERAL`) are a typo trap. The compiler's silent `/* ERROR */` fallback hid the bug for months. Make NodeType typos FAIL loudly, not silently.

### Rich Text Editor Via Quill CDN
- **Pattern:** New input type `text editor` (synonyms: `rich text editor`, `rich text`). HTML emits a `<div data-clear-rich-text="input_X">`; JS runtime detects those elements via `_initRichTextEditors()` and mounts Quill with a toolbar (headers, bold/italic/underline/strike, lists, links, blockquote, code). `text-change` handler writes editor.root.innerHTML to `_state[X]` so the rich HTML POSTs with the rest of the form.
- **CDN:** `quill@2.0.3` — ~80KB gzipped. Loaded only when `hasRichText` is true in the compiled HTML.
- **Lesson:** For pattern elements that need a third-party library, feature-detect at the ASK_FOR level, set a `has<Feature>` flag during HTML scaffolding, conditionally inject the CDN + init script. Keeps the footprint zero when unused.

### PostTool Hook "A preview server is running" Is an Opportunity
- **Observation:** The IDE notifies when preview is live. Every compiler change that would affect rendering should be verified visually before claiming success. Use `bridge` postMessage API (`read-dom`, `inspect`, `click`, `fill`) to drive real apps from Studio and assert rendered state.
- **Pattern:** `bridge('inspect', { selector: '#X' })` returns `{ box: { width, height }, text }`. Height=0 means hidden. Text matches rendered content. This is cross-origin-safe because the bridge is already injected into every compiled app.

## Session 34: Evals Pass End-to-End (2026-04-16)

### Probe Builder Must Honor `validate incoming:` Required Fields
- **Bug:** Auto-probes wrapped the agent-receiving-var value at one level and fed that as the POST body. Endpoints with `validate page_data: url is text, required` saw `{page_data: 'hello'}` and returned HTTP 400 "url is required" before the agent ever ran. page-analyzer + lead-scorer scored 0/3 across all specs for this reason — SSE fix had been masking it because everything was also "empty body."
- **Fix:** New `buildEndpointBody(ep, agent, probe)` helper reads the endpoint's validate block, extracts required-field metadata, and overlays sample values at the top level of the probe body. Called from both the e2e-spec builder and the role/format-spec builder so all 3 per-endpoint specs include the same required fields.
- **Lesson:** When an app has multiple contracts on the same data (agent expects shape A, endpoint validates shape B), the OUTER contract is the gate. Probes must satisfy the gate before the inner contract gets to run. Always follow the request shape outward-in.

### "sample company" Makes Claude Refuse
- **Bug:** The field-level sample generator emitted strings like `"sample company"` / `"sample email"`. Real Claude calls against those refused: "I can't rate a company called 'sample company' without more context about their product, market, or financials." Every lead-scorer probe hit this; the AGENT emitted an error the endpoint caught and returned 400.
- **Fix:** Specific concrete values per field name. `company → 'Acme Corp'`, `topic → 'quantum computing'`, `industry → 'SaaS'`, `email → 'alice@example.com'`, etc. Keeps the generator hard-coded (not LLM-generated) but gives grounded values the agent can reason about.
- **Lesson:** "Generic but unique" values feel safe but fail against LLM-backed agents. Claude treats suspicious placeholders as intentional ambiguity and refuses. Pick names that sound like real-world inputs.

### `killEvalChild()` Sync Kill Races the Next Spawn
- **Bug:** Switching templates between eval runs consistently produced "Network error: fetch failed" on every probe. Cause: `killEvalChild()` sent SIGTERM and returned immediately. `ensureEvalChild()` then wrote to `BUILD_DIR/server.js` and spawned a new child on port 4999 while the old process was still dying and holding the port. New child's `app.listen(4999)` failed with EADDRINUSE → exited silently → every probe hit a dead socket.
- **Fix:** Added `killEvalChildAndWait()` that awaits the child's `exit` event, with a 2s SIGKILL fallback, plus a 200ms OS-socket grace period (Windows specifically holds ports briefly after process exit). Called from `ensureEvalChild` before the spawn and from `_runEvalSuiteImpl` before full-suite DB wipes.
- **Lesson:** Any sync "kill then spawn on same port" pattern is a race. On Windows doubly so. Always await exit + a small grace period, or the second spawn will lose to port-release latency.

### Eval Child Idle Timer Must Outlast the Longest Suite
- **Bug:** `EVAL_IDLE_MS = 60_000` reaped the child mid-run when a multi-agent-research suite (3+ min) had a grader burst that happened to span 60s between probe hits. Every spec after that timer fired returned "fetch failed" (port dead). `resetEvalIdleTimer()` is called per-request, but if the grader takes longer than the idle window between requests, the window closes.
- **Fix:** Bumped to 300s (5 min). Covers any realistic suite without meaningfully hurting idle cleanup (child still gets reaped when Studio actually goes idle).
- **Lesson:** Idle timeouts between scheduled activities must exceed the longest legit activity gap, not just the median. If graded evals take 5-10s each and there are 17 of them with inter-spec pauses, 60s is too tight. Pick a ceiling from the longest legitimate use case.

### Dependent Fixes Surface in Dependency Order
- **Pattern:** Fixing the SSE structured-payload drain (session 34 early) looked like it helped only 1 template out of 5. But it UNMASKED three other bugs: generic probe shapes, sampled-value refusals, shutdown races. Each had been hiding behind "empty response from streaming endpoint." Fixing them in order got every template to pass.
- **Lesson:** When a single bug has wide blast radius, fixing it is a force multiplier — but expect cascading discovery. Budget time for 2-3 follow-up bugs that the first fix was hiding. Prioritize fixes that unblock more surface area over those that fix one spec.

## Session 36: Function TDD + Supervisor Plan (2026-04-17)

### `send back` in `define function` Must Pass `insideFunction: true` to `compileBody`

- **Bug:** Writing `send back x` inside a `define function` block emitted `res.json(x)` instead of `return x`. `compileRespond()` already had an `insideAgent` check that routes to `return` — but `FUNCTION_DEF` never set `insideFunction: true`, so calls fell through to the HTTP path. Caused runtime crashes when functions were called from test blocks.
- **Fix:** Two lines: `compileRespond()` checks `ctx.insideFunction || ctx.insideAgent` before deciding return vs res.json; `FUNCTION_DEF` passes `{ insideFunction: true }` to `compileBody`.
- **Lesson:** Every new body-compilation context (`FUNCTION_DEF`, `AGENT`, `BACKGROUND_JOB`, etc.) must explicitly declare its routing mode. The default falls through to HTTP. Missing the flag is silent and catastrophic.

### User-Defined Functions Must Shadow Built-In Aliases in CALL Resolution

- **Bug:** A user writing `define function sum(a, b): send back a + b` had their function silently rerouted to `_clear_sum(a, b)` (the built-in array-sum helper) at call sites. `mapFunctionNameJS()` mapped `sum` to `_clear_sum` regardless of whether the user defined their own `sum`.
- **Fix:** Pre-scan AST for all `FUNCTION_DEF` nodes (`_findUserFunctions`, mirrors `_findAsyncFunctions`). In `exprToCode` CALL case, check `ctx._userFunctions.has(name)` BEFORE calling `mapFunctionNameJS`. User wins.
- **Lesson:** Any symbol that exists in both the built-in synonym table AND the user's source should resolve to the user's definition. Always check user-defined names first. Lexical scoping: inner scope shadows outer.

### SSE `tool_start` Fires Twice Per Tool Call — Dedup With a State Flag, Not ID

- **Bug:** Integration test for Meph's TDD loop captured zero tool calls. The SSE parser was deduplicating by `obj._id` — always `undefined`. The server emits `tool_start` TWICE per tool call (bare, then with summary). `find()` dedup caught nothing.
- **Fix:** Boolean `_inTool` flag. Flip to `true` on first `tool_start` (`!_inTool`), flip back on `tool_done`. Captures exactly one entry per tool call.
- **Lesson:** When an SSE protocol is undocumented, inspect the raw event stream before writing the parser. State-machine approaches (flag between start/end brackets) beat identity-based dedup when IDs aren't guaranteed.

### API Key Must Match How the Server Actually Consumes It

- **Bug:** Integration test on Windows couldn't find the API key. `export $(cat .env | xargs)` doesn't set env vars for Node subprocesses on Windows. Test passed the key via `process.env`; the server reads `req.body.apiKey`.
- **Fix:** Load key from `.env` file directly in the test, pass as `apiKey` in the JSON request body.
- **Lesson:** On Windows, shell `export` doesn't propagate to Node. Always check HOW the server consumes credentials before deciding how to thread them.

### Playwright Worktree Tests Fail — Push From Main Repo Checkout Instead

- **Pattern:** The pre-push Playwright e2e test fails in a git worktree. Same test passes 77/77 from the main repo checkout.
- **Fix:** When shipping from a worktree, get the HEAD SHA, go to the main repo, `git merge <SHA> --no-ff`, push from there.
- **Lesson:** Git worktrees are good for isolation, but e2e Playwright tests are environment-sensitive. Treat the main repo checkout as the canonical push environment.


## Session 37: Supervisor Multi-Session Architecture (2026-04-17)

### Architecture

- **Multi-process over session-scoped globals.** Partitioning an existing server's globals (runningChild, terminalBuffer, etc.) across sessions is a high-risk refactor with a long tail of missed assignments. Instead, each Worker is a separate `node playground/server.js` process on its own port. The Supervisor speaks HTTP to workers. Workers are dumb — they don't know they're in a swarm. Zero risk of data bleed between sessions.

- **Module-level shadow vars for supervisor polling.** `/api/current-source` must return the last source a worker's Meph wrote, but `currentSource` is a per-request local inside the `/api/chat` SSE handler. Fix: declare `let _workerLastSource = ''` at module scope, mirror it at every `currentSource =` assignment site. The endpoint reads the shadow var, not the in-request local.

- **WAL mode in SQLite session registry.** `db.pragma('journal_mode = WAL')` + `db.pragma('synchronous = NORMAL')` — matches the pattern in `runtime/db.js`. WAL allows concurrent readers while a writer is active and survives process crashes without full recovery. Essential for a registry that both the supervisor and worker processes need to read.

- **Port availability check before spawning.** Before spawning a worker on a port, bind a TCP socket to that port and listen for 'error' vs 'listening'. If already in use, throw. Prevents silent collisions where two workers spawn on the same port and one silently fails to start.

### Testing

- **Async test timeouts.** Spawner and loop tests that actually start child processes need 10–15s timeouts. Child process TCP bind takes ~2-3s to be ready for connections. `await wait(2500)` before the first `fetch` to the worker is the minimum safe delay. Tests that poll a not-yet-ready server will get ECONNREFUSED, not a test failure.

- **State machine test via monkey-patching.** To test that `pollOne` marks a session 'completed' when TASK COMPLETE is detected — without actually injecting terminal output into a live worker — temporarily override `loop.detectComplete = () => true`, call `pollOne`, restore. Tests the state machine cleanly without needing a full integration harness.


## Session 38: EBM Reranker, Step-Decomposition, Data-Quality Pass (2026-04-19)

### Reranker / ML

- **2-stage Lasso → EBM beats vanilla EBM.** Russell's suggestion, correctly interpreted: use Lasso as a feature-SELECTOR (not as a replacement model), then train EBM only on the survivors. Measured on 24 features / 393 training rows: vanilla EBM val R² 0.30, Lasso alone 0.39, Stage-2 EBM (on 13 Lasso-kept features) 0.335. Lasso dropped 11 features as pure noise at our data scale (num_endpoints, num_tables, num_charts, etc.) — none of them add signal until we have enough rows to populate their bin statistics. The 2-stage EBM beats vanilla EBM by +0.033 val R². Lasso alone still wins outright at Phase-1 scale because EBM's interactions don't earn their keep until 1000+ rows. At 1000+ rows, Stage-2 EBM should overtake Lasso.

- **Whole-row features are not the reranker's real input.** The naive exporter produces one row per compile with "did this row's app pass?" as the label. That's a regression problem mostly already solved by `ORDER BY test_score DESC`. The actual reranker job is RANKING pairs: given Meph's current error + past candidate fix, is F_past likely to resolve E_now? That needs PAIRWISE features (archetype_match, error_sig_match, step_delta, similarity_score) computed at retrieval time. The current EBM/Lasso is a Phase-1 placeholder.

- **`test_score_bucket` = data leakage.** Tried deriving a "pass/fail bucket" feature from `test_score` — model trained to R² 0.996 because the feature was the label in disguise. Always audit: if a feature is computed FROM a label column, it's a leak. Passes type checks; fails leak checks.

- **High-cardinality categoricals hurt at low data scale.** Added `error_token` and `prev_error_sig` (hash-like strings with 50+ distinct values per column). EBM learned one per singleton bin, overfit hard, val R² dropped. Drop high-cardinality features when rows < 1000; re-enable when each bin has ≥5 samples.

- **Lasso's auto-feature-selection is cheap intelligence.** `LassoCV(cv=5)` picks regularization by cross-validation, zeros unimportant coefficients. 58 of 87 one-hot dummies were non-zero on our data — the other 29 were auto-ignored. No manual feature selection needed. At Phase-1 data scale this is better than hand-curating the feature set.

### Flywheel infrastructure

- **Don't grade by magic phrase.** The initial sweep grader scanned Meph's chat stream for "TASK COMPLETE." He often forgot to say it even when tests passed. Switched to reading `test_pass=1` in the Factor DB during the task's time window. Grader score jumped from 1/5 to 15/30 on the same data. Lesson: grade by persistent-state truth (DB), not transient-stream text.

- **Migration order matters.** Added `idx_step ON code_actions(task_type, step_index, test_pass)` inside the SCHEMA block. On existing DBs with ~100 rows pre-migration: CREATE TABLE IF NOT EXISTS was a no-op; then CREATE INDEX ran BEFORE the ALTER TABLE that would add `step_index` — crash with "no such column: step_index." Fix: move index creation OUT of SCHEMA, run it after all ALTER statements. Rule: any index that references an ALTER-added column must be created separately, after the ALTER.

- **CLI `clear build` clobbered repo root.** When Meph ran `clear build temp-app.clear` from the worktree root (as system-prompt.md told him to), the CLI wrote `{"type":"commonjs"}\n` into `./package.json` — overwriting the real project file. Every sweep silently broke `node` commands until `git restore`. Fix: `writePackageJsonShield()` refuses to overwrite an existing `package.json` unless it's already our own sentinel string. Rule: never silently overwrite a file whose content you didn't originate.

- **Haiku iteration limit needs 25 for 5-endpoint CRUD.** Default 15 was enough for simple (L1-L2) and rich-skeleton (L8-L9) tasks, but created a dead zone at L3-L6 — full-CRUD-with-auth tasks where Meph needed 5 endpoints + validation + auth scaffolding. 25 closed the dead zone without runaway risk.

- **Background-loop sweeps exit 127 cascade.** A `while; sweep; sleep` bash loop that hit the Anthropic API rate-limit kept spinning up failed sweeps in 1s each after the limit tripped. Exit 127 (command-not-found) was misleading — the real cause was the preflight check refusing. Lesson: every background loop needs explicit rate-limit detection + exit-after-N-failures.

### Parser / compiler

- **Docs promised what the parser didn't deliver.** SYNTAX.md showed `send back { total is count }` as canonical. The parser only implemented the indented-block form, not inline `{ a is 1 }`. Meph read the docs, wrote the inline form, hit "Clear doesn't understand '{' in this position," and abandoned before compiling. Zero compile rows for every webhook task. Fix: add `parseInlineRecord()`. Rule: when you document a syntax, grep the parser to verify it's actually supported.

- **Colon separator helps adoption.** The new `parseInlineRecord` accepts `is`, `=`, and `:` as the key/value separator. `:` (JSON-style) is what every AI model and every non-Clear programmer reaches for by instinct. Accepting all three costs one line of parser code and saves thousands of frustrated compile cycles.

### Archetype classifier

- **Rule ordering matters.** `numCharts >= 2 → dashboard` was below `hasStatusField + hasAuth → queue_workflow`. Dashboards with status columns (filtered chart segments) and auth (login-gated reports) misrouted to queue_workflow. Fix: move the stronger signal (≥2 charts) above the weaker one. Lesson: when adding classifier rules, order them by signal strength, not historical accident.

- **Multi-endpoint webhooks needed guard relaxation.** The old `numEndpoints === 1 && hasWebhookPath → webhook_handler` rule broke on apps with a webhook plus a `/health` endpoint. Relaxed to `hasWebhookPath(body) || hasSignatureVerification(body) → webhook_handler` regardless of total endpoint count. Lesson: "one endpoint" is a fragile heuristic for "this is a webhook app."

---

## Session 40: `caller` rename + compiler shadow bug + HINT_APPLIED reliability (2026-04-20)

Three interlocking fixes landed after noticing that one bad receiving-var example (`where id is id`) was actually teaching a larger anti-pattern (`data` as receiving var) that had propagated across the whole codebase.

### The `current user` semantic collision and its compiler-level fix

- **Symptom.** `Users`-table endpoints were the only place the "use singular of table as receiving var" rule didn't apply. We'd invented a special case: pick `signup`/`profile`/`account` because `user` was "ambiguous with `current user`." One exception to an otherwise-uniform rule is a smell — the convention should be 100%.

- **The real bug.** Investigation revealed this wasn't just semantic ambiguity — the compiler had a hardcoded special-case in `compiler.js` VARIABLE_REF: `if (name === 'user' && ctx.mode === 'backend') return 'req.user';`. This IGNORED any local `user` binding. Result: `const user = req.body;` + `save user as new User` correctly used the local (shadowed), but `send back user` emitted `res.json(req.user)` — returning the authenticated caller instead of the freshly-saved body. **The save worked, the response was wrong.** Silent. No error, no warning. Detected only by reading compiled JS.

- **Fix.** Check `ctx.declared.has('user')` before applying the magic mapping. Compile-time endpoint handler seeds `epDeclared` with the receiving-var name so the VARIABLE_REF case sees the binding as in-scope. Two regression tests lock it in.

- **Lesson.** Compiler special-cases that don't respect lexical scope are landmines. If you shortcut a lookup based on a string literal, always check the scope first. JS has lexical shadowing for a reason — respect it in compiled output too.

### `caller` as canonical magic var

- **Design.** Added `caller` as a synonym for the `current_user` canonical token. `current user`, `authenticated user`, `logged in user` remain as legacy synonyms — all four resolve to the same `_current_user` runtime reference and compile to byte-identical JS.

- **Why `caller` specifically.** One word (no multi-word tokenizer dance), no collision with any entity name (no table is called `Callers`), matches API-design lexicon (`caller's role`, `caller's id`). Rejected `me` (awkward possessive: `me's email`), `viewer` (read-only connotation), `self` (OOP jargon Clear avoids).

- **Side effect.** Once `caller` is canonical, the Users-table exception disappears. `user` is safe as a receiving var everywhere. The entity-name rule is uniform again.

- **Lesson.** When a rule has ONE exception, look for a renaming that eliminates the exception. Special cases tax every future reader's mental model.

### HINT_APPLIED tag reliability — prompt alone isn't enough

- **Symptom.** Across two sweeps (60 tasks, ~11 hints served each), Meph emitted the `HINT_APPLIED:` tag on ~45% of hint-serves. Missing tags = silent training-data loss (no label = can't tell which hints actually helped).

- **First attempt: tighten the prompt.** Rewrote the rule as a REFLEX (not summary), moved it earlier in the prompt, added an explicit concrete example of the correct response shape. Tag rate moved from 50% → 43% (within noise).

- **Finding.** In long agentic loops, Claude is task-focused. Meta-observations like "emit a tag" slip no matter how clearly the rule is written. Prompt clarity is necessary but not sufficient.

- **Second attempt: server-side inference fallback.** When `HINT_APPLIED` is missing AND a later compile in the same turn had fewer errors than when hints were served, infer `applied=1, helpful='inferred'`. The `'inferred'` value is distinct from `yes`/`no`/`partial` so the honest-label set stays clean; ranker training can opt in or out.

- **Lesson.** For any "Claude should remember to do X" behavior that's not load-bearing for task completion, add a server-side fallback. Prompt-only compliance in long loops is ~50% even for simple reflexes. The fallback doesn't replace the honest signal — it augments it.

### Drive-by finds

- **Keyword-collision warning at the validator layer.** Added `validateReceivingVarNames` — warns when a POST/PUT/agent receiving var is `post`/`deploy`/`update`/`payment`/`page`/`image`/`ask` etc. (words that collide with Clear keywords and cause confusing errors like "`post to` but it hasn't been created"). Also catches the banned-placeholder names (`data`, `item`, `obj`, `val`). Surfaces compile-time what used to be a mysterious parse error.

- **Auth-first-line warning.** `requires login` missing is already a compile error for PUT/DELETE. But auth PRESENT-but-not-on-line-1 was unchecked. Added a warning. Convention-enforcement, not correctness. All 71 templates already follow the convention (0 hits).

- **SYNONYM_VERSION bump.** Every synonym table change bumps the version (caught by the synonym-frozen test). 0.28 → 0.29 for the `caller` add.

### General lesson

One small pushback ("`where id is id` reads weird") surfaced six linked fixes: doc drift, compiler bug, convention exception, keyword collision class, validator gap, telemetry hole. Russell's 14-year-old-test instincts are a load-bearing signal-detector. When he bounces off a small example, the whole surrounding design has usually drifted — fix the drift, not the example.

---

## Session 41: End-to-end flywheel verification — first real measurement (2026-04-21)

Tonight's mission: close the loop from "hints flow out" to "labels flow in" to "ranker retrains on labels" to "Meph measurably codes better." Before tonight the flywheel was described in RESEARCH.md as theoretical. Tonight it actually ran end-to-end with real numbers attached.

### The three-intervention stack on HINT_APPLIED reliability

Started the session at ~45% effective label rate across 60 hint-served compiles (2 earlier sweeps). Stacked three interventions:

- **Prompt reflex rule** (system prompt rewrite): tag must be the OPENING WORD of the next reply, not a summary step. Moved ~0% alone. Claude models imitate response shapes, not rule lists, but this was the weakest individual lever.
- **Inline reminder in hint payload itself**: appended `⚠ REQUIRED: Start your next reply with HINT_APPLIED: ...` to the end of the hint text Meph reads. Attention primacy — the last thing Meph read is the last thing on his working stack. This is the lever that actually moved the needle.
- **Server-side inference fallback**: when no tag emitted AND a later compile in the same turn had fewer errors → log `applied=1, helpful='inferred'` on the hint-serving row. `'inferred'` is a distinct label value so the honest set (`yes`/`no`/`partial`) stays clean. Catches what the first two miss.

Combined rate: 43% → 71% → near-100% across sweeps 2→3→4. The three interventions are complementary — each plugs a different leak. Don't skip any of them for "prompt clarity should be enough."

**Rule-of-thumb in general:** for reflex-class meta-observations in long agentic loops, prompt-only compliance caps around 50% regardless of clarity. Stack an inline reminder at the attention point + a server-side fallback.

### First-ever negative-label generation

Before tonight: 7 honest-yes labels, 0 honest-no. After tonight's work: 22 honest-yes, 11 honest-no (`applied=0`). Meph now rejects hints he doesn't believe apply — and gives reasons.

Reading the 6 most recent rejection reasons is the HIGHEST-signal content in the Factor DB. Three recurring patterns:

- **Wrong abstraction level**: ranker served endpoint-shape hints when error was about undefined variables. Source-jaccard match is too coarse for variable-scope bugs.
- **Past-fix lacks the fix**: ranker retrieved past-fixes from other bugs in same archetype — their source happened to be similar but didn't contain the structural fix this error needs.
- **Real DOC gap**: Meph tried `current_user` (underscore) and `first` as a bare identifier. Both produced confusing "undefined variable" errors. The rejection reasons REVEAL missing documentation or missing synonyms — free suggestions for the compiler team.

Fixed both DOC gaps: `current_user` is now a synonym for `caller`, and bare `first`/`last` now produce a typo-suggestion pointing at `first of X`/`last of X`.

### Ranker retrain findings (52 pairs → 344 pairs)

Retrained the pairwise ranker on 6.6× more data. Feature weights sharpened dramatically: `source_jaccard` +1.15 → +2.71, `error_category_match` +1.21 → +2.67, `fix_test_score` went MORE negative (-0.67 → -1.74). AUC 0.999 on train, 1.000 on val.

Counterintuitive finding: `fix_test_score` has a strongly NEGATIVE coefficient. Naive interpretation: the ranker learned "penalize past-fixes with high test_score." But the likely cause is selection bias — past-fixes with test_score=1.0 are the FINAL polished versions of solved tasks, which don't show HOW the bug was fixed. The mid-session rows with lower test_score are where the actual diffs are, and those are what actually help.

Lesson: when a ranker weight looks "wrong," check what the data actually represents before overriding. Labels correlate with outcomes via context, not just feature magnitudes.

### Archetype audit methodology

Ran a full audit of curriculum-task archetypes before kicking any new sweeps. Found 9 of 16 classifier archetypes had zero curriculum tasks — meaning the Factor DB was 55% `api_service` even though the curriculum nominally covered more shapes. The ranker couldn't retrieve relevant past-fixes for realtime, batch, kpi, routing, etl, booking, admin, directory shapes.

Added 8 tasks over two rounds (one per high-value gap), each with a skeleton designed to FORCE the target archetype structurally — classifier-matching step markers, not just task descriptions. Curriculum: 30 → 38. Archetype coverage: 7/16 → 15/16.

**Rule:** when the DB distribution doesn't match the curriculum distribution, the SKELETONS are letting Meph drift into the easiest archetype. Force the shape in the skeleton + step matchers, not just in the description.

### Cost engineering without data loss

Sweep cost went from $1.50/run (serial, pre-optimization) to $1.30/run (parallelizable, compile-output opt-in). Two levers:

- **Compile tool stopped embedding compiled JS on clean compiles.** Meph almost never reads the compiled output — he reads errors, hints, and source. Opt-in via `include_compiled: true` for the rare case. Saves ~$0.50/sweep.
- **Sweep env-var overrides** for `WORKER_BASE_PORT` and `SWEEP_REGISTRY_PATH`. Three parallel sweeps run simultaneously on disjoint port ranges. 3× wall-clock speedup, same total cost, same total data.

**Rule:** audit the tool-result shape for payload that the model never reads. Every KB of default-on content is paid for on every tool call × thousands per sweep.

### Session 41 end-state

- Factor DB: 672 → 1200+ rows (across 8+ sweeps tonight)
- Passing: 250 → 457+
- Honest labels: 7 → 22 helpful=yes + 11 rejected + 8 inferred = 41 usable
- Ranker: retrained on 344 pairs (deployed), 3-parallel batch running to push honest-yes past 50 for the RL-8 honest-label retrain
- Tag rate: 43% → 100% effective (across verification sweeps)
- Curriculum: 30 → 38 tasks, 15/16 archetypes covered
- Total API spend tonight: ~$14 (close to "done good" target)

First time we can say: the ranker trains, deploys, and we're measuring lift on real data — not "someday" per RESEARCH.md.

---

## Session: Cloudflare Workers for Platforms — Phase 1 (2026-04-23)

Plumbing `compileProgram(src, { target: 'cloudflare' })` through to a writable Workers-for-Platforms bundle. 8 TDD cycles, no runtime-API changes yet (that's Phase 2's D1 adapter + Phase 3's webcrypto auth). Key pitfalls we hit while building the skeleton:

### ESM-only is non-negotiable in Workers

Workers-for-Platforms rejects any `require()` call at upload time, and `esbuild --bundle` chokes on mixed CJS/ESM output. The existing Node backend emit (`compileToJSBackend`) is loaded with `require('express')` and `require('child_process')`; we cannot reuse a single line of it. The Workers path is a **separate emit** that produces ESM-only `export default { async fetch(request, env, ctx) { ... } }` — routes by `new URL(request.url).pathname`, no Express, no Node stdlib assumptions.

Runtime guard in `lib/packaging-cloudflare.test.js`: emitted `src/index.js` must parse clean under `node --check` AND must contain zero `require(` substrings. Future additive features (D1 queries, KV lookups, webcrypto auth) must be audited the same way before they land.

### Compat date + flags are single-source constants

The `wrangler.toml` compatibility configuration (`compatibility_date = "2025-04-01"`, `compatibility_flags = ["nodejs_compat_v2"]`) lives ONCE at the top of `lib/packaging-cloudflare.js`:

```js
export const CF_COMPAT_DATE = '2025-04-01';
export const CF_COMPAT_FLAGS = ['nodejs_compat_v2'];
```

When Cloudflare releases a newer compat date (and we test it), it's a one-line edit. Don't ever duplicate these constants into TOML string templates — drift silently breaks bundle uploads.

### data-clear-line preservation via JSON.stringify embed

The compiler emits `data-clear-line="N"` attributes on every HTML element so click-to-edit (future plan) can map a clicked DOM node back to its Clear source line. Workers-target emit embeds the compiled HTML by `JSON.stringify`-ing it into `src/index.js`:

```js
const __CLEAR_HTML__ = ${JSON.stringify(html)};
// ...
return new Response(__CLEAR_HTML__, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
```

This is byte-faithful — no template-literal escaping headaches, no minifier sneaks in later — and preserves every `data-clear-line` attribute verbatim. Added a regression test explicitly: "Workers src/index.js embeds HTML with data-clear-line attrs intact."

### testUtils.it() doesn't await async fn bodies — silent green

`lib/testUtils.js`'s `it()` wraps `fn()` in `try { fn(); passed++; }` — synchronous only. Async test bodies that throw get a pending Promise; the `it()` call has already recorded success by the time the rejection fires. Our first-cut Phase 1 cycle 1.6 tests used `async it(() => { const { packageBundle } = await import(...); ... })` and all showed GREEN even when the file-write assertions were definitively failing (verified via a standalone trace).

Fix: hoist imports to the top of the test file (synchronous ESM imports) and keep `it()` bodies synchronous. Use the existing `testAsync` export if async is genuinely required (rare — the only Phase 1 test needing it was the wrangler smoke, which runs `spawn()` + settle + `fetch()`).

**Rule:** before claiming a new test is GREEN, double-check that it would actually go RED when the production code is broken. A silent-pass test is worse than no test.

### Surfacing pre-existing bugs via longer test runtime

Adding cycle 1.7's wrangler dev smoke (30-60s wall clock) extended the clear.test.js runtime enough that Node's unhandled-rejection handler caught a previously-silent bug in test T19 (`apps/store-ops/main.clear` was deleted in an earlier session but the test still references it). The test was "passing" because `it()` is sync; the readFileSync rejection never got collected.

Defensive fix in clear.test.js:23570 — guard the readFileSync with `existsSync` and return early. Long-term: rewrite testUtils.it to await Promises OR migrate to vitest.

### Windows + wrangler + rmSync = EPERM on cleanup

On Windows, `child.kill()` on a spawned wrangler dev doesn't immediately release file handles in the cwd. The test's `finally { rmSync(outDir, { recursive: true, force: true }) }` threw EPERM, masking the real test outcome.

Fix: after `child.kill()`, wait 1500ms for handles to unwind, then wrap rmSync in try/catch — a temp-dir leak is harmless, but a masked assertion failure is expensive.

### Phase 1 outcome

- 8 TDD cycles committed (cf-1.1 → cf-1.7 + 1.4b + plan correction)
- 2101 → 2139 tests passing (+38 net, 26+ of them in packaging-cloudflare.test.js)
- 0 regressions on default target
- wrangler dev spawn + curl → 200 confirmed end-to-end
- Phase 2 (D1 runtime) + Phase 3 (webcrypto auth) unblocked

## Session: Cloudflare Workers for Platforms — Phase 2 (2026-04-23)

Wiring the D1 CRUD emit path + migrations + a runtime shim so Workers-compiled Clear apps can actually read and write SQLite over the edge. 9 TDD cycles. Three non-obvious pitfalls worth pinning.

### D1 prepared statements are a hard security floor — never interpolate

Every CRUD path in `compiler.js compileCrudD1*` emits `env.DB.prepare(SQL).bind(value1, value2, ...)` where the SQL is a fixed template-literal with `?` placeholders and values flow through `.bind()`. Template-literal interpolation of user-controlled data inside SQL is forbidden — a single `WHERE email = ${email}` drops the SQL-injection floor across every endpoint the compiler emits. Cycle 2.3 locks the invariant with a global grep over representative endpoints: zero match on `(INSERT INTO |SELECT \*|UPDATE \w+|DELETE FROM) .*\${` anywhere in `src/index.js`.

D1's `.bind()` treats every argument as a literal, so an adversarial `' OR 1=1 --` binds as the exact 9-character string "', OR 1=1', --". The table stays, the query fails to match. Same floor as Postgres parameterized queries or SQLite named parameters — just enforced at compile time instead of hoped for at review time.

### D1 is SQLite, so the dialect is SQLite

D1 on the wire is SQLite over HTTP. That means migrations must use `INTEGER PRIMARY KEY AUTOINCREMENT` (not Postgres `SERIAL`, not MySQL `AUTO_INCREMENT`), boolean columns are `INTEGER` with 0/1 values, and column defaults for text fields need single-quote escaping. Cycle 2.6's migration emitter pins this with a type-aware default formatter: boolean literals coerce to 0/1, numbers stay unquoted, text gets SQL-safe single-quoting. A mixed pattern like `completed BOOLEAN DEFAULT 'false'` silently stores the string "false" inside the INTEGER column and breaks every subsequent `WHERE completed = 1` query. Test files like `apps/todo-fullstack/main.clear` exercise this path because a `default false` field is on the canonical happy path.

### better-sqlite3 doesn't accept booleans; real D1 does

Cycle 2.8's E2E test compiled the todo app, spun up `env = { DB: d1Mock() }`, applied the migrations, and POSTed a `{title: 'first', completed: false}` payload. It crashed with `SQLite3 can only bind numbers, strings, bigints, buffers, and null`. Real D1 accepts booleans and coerces them server-side — our mock has to do the same.

Fix: `d1Mock()`'s `bind()` wraps every argument through `coerceBindArg(v)` — `true → 1`, `false → 0`, `undefined → null`. Now a Worker built for real D1 runs identically against the better-sqlite3 mock in tests. If this coercion lived in the compiled emit instead of the mock, production (real D1) would get double-coerced and lose type fidelity — keep the coercion at the test-mock boundary, not in the codegen.

Log this one here (not a rule) because it's a bug surface specific to the mock: whenever we extend `d1Mock` to support a new D1 feature, check whether real D1 is more permissive than better-sqlite3 and coerce inside the mock.

### ESM/CJS scope drives the `.mjs` extension for runtime/db-d1

`runtime/package.json` contains `{"type":"commonjs"}` so every `.js` file under `runtime/` is treated as CommonJS. But D1 bindings only run inside Workers, and Workers are ESM-only — `export { createD1Shim }` is required. We named the file `runtime/db-d1.mjs` so the extension overrides the package.json scope for this one file.

Don't drop a second `package.json` inside `runtime/d1/` just to flip the scope — it would change the module system for anything added in that subdir and bite future contributors. One `.mjs` file is surgical and obvious.

### Phase 2 outcome

- 9 TDD cycles committed (cf-2.1 → cf-2.7 + cf-2.8 which folds cf-2.9 learnings)
- 2139 → 2202 tests passing (+63 net, 45+ of them in packaging-cloudflare-d1.test.js + db-d1.test.mjs + packaging-cloudflare-templates.test.js)
- 0 regressions on default target
- All 8 core templates compile clean with target=cloudflare
- hello-world + todo-fullstack run end-to-end against d1Mock — write + read confirmed
- Phase 3 (webcrypto auth) remains independent — no shared edits to _askAI or auth utilities

## Session: Cloudflare Workers for Platforms — Phase 3 (2026-04-23)

Making agents (`ask claude`, `has tools:`, streaming) and auth (`allow signup and login`) work inside a Cloudflare Worker bundle. The whole point: the deployed Worker must NEVER see Node-only APIs — Workers' bundler rejects `require()` at upload time and has no `fs`, no `child_process`, no `/tmp`. Phase 3 ran 10 TDD cycles and landed a parallel set of Workers-safe runtime helpers alongside the Node ones.

### Emit-time branching beats runtime gating every time

Our first instinct was "gate the Node-specific branch with an `if (typeof require !== 'undefined')`." That's structurally wrong for Workers. Even if the branch never fires at runtime, `require(` as a TEXT SUBSTRING in the bundle trips Cloudflare's static scan and the upload fails. Dead code still ships.

The fix: two parallel helper arrays in `compiler.js` (`UTILITY_FUNCTIONS` for Node, `UTILITY_FUNCTIONS_WORKERS` for Cloudflare) and a compiler switch that emits exactly ONE set, selected by `ctx.target`/`options.target`. The Node set keeps its HTTP_PROXY + curl fallback (uses `require("child_process")`); the Workers set is fetch-only with `env` threaded as a parameter.

**Rule:** substring-checkable drift guards (`expect(src.includes('require(')).toBe(false)`) are the only guards you can trust for Workers output. Runtime gates fail silently; compile-time gates and text grep catch everything.

### Web Crypto in Node 20+ is bit-for-bit identical to Workers

The Workers runtime has `globalThis.crypto.subtle` — the same PBKDF2 / AES / ECDSA the browser exposes. Node 20+ ships the same API surface natively, zero polyfill needed. That meant Phase 3's auth tests could run in pure Node (no miniflare, no wrangler invocation) and still prove out the exact code path the deployed Worker would execute. Fast iteration loop — 100ms per hashPassword test vs. seconds for a miniflare spin-up.

Param choice: PBKDF2-SHA-256, 600,000 iterations, 128-bit random salt, 256-bit output hash. 600k is OWASP 2024's floor. On our dev machine: ~150ms per `hashPassword()` — slow enough to hurt a brute-forcer, fast enough that a login request doesn't feel laggy.

### Versioned hash format makes PBKDF2 upgrades non-breaking

`v1:<salt-hex>:<hash-hex>`. `v1` = PBKDF2-SHA-256, 600k iterations. When compute gets cheap enough that 2M iterations makes sense, or when Argon2 lands for Workers, we add a `v2:` branch to `verifyPassword` — old `v1:` rows still verify using the old params. Zero migration, zero breaking change for stored rows.

Rule: ANY hash format that stores in a database should be versioned. If you don't, you're writing a future migration script or burning sessions on a forced password reset.

### No crypto.timingSafeEqual on Workers — roll the XOR-sum

Node has `crypto.timingSafeEqual`. Workers doesn't. Constant-time compare is too important to skip — an attacker who can measure response-time deltas can peel off a stored hash byte-by-byte via a timing side-channel. The five-line manual implementation works everywhere:

```js
function _ctEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
```

The important bit: examine every index regardless of mismatch. Returning early on the first mismatch reintroduces the timing leak.

### Scope-asserting runtime files as .mjs when the dir is CJS-scoped

`runtime/package.json` pins `{"type":"commonjs"}` — the existing `runtime/auth.js` is CJS. The new `runtime/auth-webcrypto` must be ESM because the Workers bundle is ESM-only. Two options: drop a sibling `package.json`, OR use the `.mjs` extension to scope-assert explicitly. Went with `.mjs` because it's a visible-at-filename-level hint that this module ships to Workers, not Node.

The test file matches: `runtime/auth-webcrypto.test.mjs`. Node imports resolve to both without the extension being a problem.

### Inline-at-bundle vs. import-at-runtime for shared helpers

Workers bundles are one ESM module. The user's Worker doesn't `import` from a neighboring file — the Workers bundler would have to resolve that against some phantom npm tree. The fix: `lib/packaging-cloudflare.js` reads `runtime/auth-webcrypto.mjs` at BUNDLE time, strips `export ` keywords (a flat regex — `^export\s+(async\s+function|function|const)\s` → `$1 `), and inlines the function bodies directly into `src/index.js`.

Upside: single source of truth (change PBKDF2_ITERATIONS in one file, every future deploy gets the new value). Downside: if `auth-webcrypto.mjs` grows top-level statements that aren't function/const declarations, the regex stripper will leave broken top-level `export` statements. Keep the module pure-function-declarations-only as a load-bearing invariant.

### testAsync inside describe() is silent green (again)

`describe(name, fn)` runs `fn()` synchronously. Any `testAsync(...)` calls inside return an unresolved Promise and the describe body moves on before they finish. The final `run()` might fire before the Promises resolve, in which case the tests silently don't count (or count on the next tick, too late).

The pattern that works: put `await testAsync(...)` at MODULE SCOPE (not inside describe), sandwiched between `console.log('\n📦 ...\n')` for the header. Cycle 1.7's wrangler smoke already uses this; cycle 3.8 did the same.

**Rule (reinforcing Phase 1 learnings):** any Phase 3+ async test that imports, spawns, or awaits goes at top-level `await testAsync(...)`. Reserve describe/it blocks for purely synchronous assertions.

### Phase 3 outcome

- 10 TDD cycles committed (cf-3.0 → cf-3.8; cf-3.9 = learnings, folded into 3.8)
- 2139 → 2182 tests passing (+43 net)
- `_askAI_workers` + `_askAIWithTools_workers` + `_askAIStream_workers` — pure-fetch AI helpers, env-parameter-based, zero Node-isms
- `runtime/auth-webcrypto.mjs` — PBKDF2 via Web Crypto, 600k iterations, versioned v1 hash format, constant-time verify
- Workers bundle drift-guards: hello+askAI and signup+agent both pass `grep -c 'require\|fs\.\|/tmp\|child_process'` → 0
- Node (default) target: zero behavioral change. Temporal + AI tests all green.

<<<<<<< HEAD
## Session: Cloudflare Workers for Platforms — Phase 6 (2026-04-23)

`runs durably` was the architectural shift of the Cloudflare plan. Same three words in a `.clear` file, two totally different deployment realities: Node target keeps emitting Temporal SDK imports (so anyone running their own Temporal cluster is untouched), Cloudflare target emits a standalone `WorkflowEntrypoint` class per durable workflow, plus the `[[workflows]]` bindings that make CF accept the deploy. Six effective cycles landed as one commit (emitter + tests atomically coupled) with per-cycle prefixes in the message (`feat(cf-6.1,6.2,6.7,6.8,6.9)`). Four non-obvious pitfalls worth pinning.

### Phase 6 emit lives in packaging-cloudflare.js, not in compileWorkflow()

The plan's original framing said "compileWorkflow() gains a target === 'cloudflare' branch." I tried that path first and the design got ugly fast. The Node backend compile pass (where compileWorkflow runs) builds ONE serverJS string — adding a CF branch would mean either conditionally returning empty text (leaving Temporal code in an unused place) or branching the whole function twice. Worse: the CF target's per-workflow-file emit needs to write to a different output slot (`result.workerBundle['src/workflows/<slug>.js']`) that compileWorkflow has no way to reach.

**The clean split:** leave `compileWorkflow` untouched for the Node path (Temporal SDK emit stays), and add an independent emitter `emitCloudflareWorkflow(wfNode)` in `lib/packaging-cloudflare.js` that `buildWorkerBundle()` calls when walking the AST. The CF bundle ends up with its own `src/workflows/<slug>.js` per durable workflow, and the shared serverJS never sees that emit.

**Rule:** when a new target wants the SAME AST node to produce different files in different locations, don't cram the branching inside the shared compileNode() dispatcher. Write a dedicated target-specific emitter and call it from the target-specific bundle assembler. Keeps the Node path stable and the CF path isolated.

### Workflows run in a SEPARATE CF execution context from src/index.js

Cloudflare Workflows don't run "inside" the main Worker — they're independent entrypoints that the dispatch Worker invokes via `env.<BINDING>.create()`. That means the workflow class can't call agent functions defined in `src/index.js` — they're in a different module graph at runtime.

For Phase 6 we emit `agent_<name>(_state)` calls inside `step.do()` bodies and let the test mock supply those globals. Real deploys in Phase 7 will need to inline the agent functions into each workflow file OR have the workflow module import them from a shared `src/agents.js`. This is a Phase 7 concern, flagged here so future sessions don't rediscover it.

### `ctx.target` only propagates to endpoint bodies, not top-level compilation

The Cloudflare branch of the RUN_WORKFLOW invocation (`env.<NAME>.create({ params })`) depends on `ctx.target === 'cloudflare'`. That flag is only set when the CF-specific emit calls `compileBody(ep.body, ctx, { target: 'cloudflare' })` — NOT during the top-level AST walk that compiles `result.javascript`. So the Node backend's `result.javascript` still sees `ctx.target === undefined` and emits the direct `workflow_onboarding(data)` call, while the CF bundle's `src/index.js` sees `ctx.target === 'cloudflare'` and emits `env.ONBOARDING_WORKFLOW.create({ params: data })`. Same endpoint body, two different compile contexts, two different outputs.

**Gotcha:** when I need to branch on target inside `exprToCode`, I must ALSO check `ctx._allNodes` exists — that's the list of top-level AST nodes the CF compile threads through, which lets me look up the workflow by name and confirm it's durable before rewriting the call. Without `_allNodes`, a plain (non-durable) workflow on CF target would also get rewritten to `env.X.create()` which would fail at runtime.

### Worktree vs main checkout — my absolute paths landed in the WRONG tree

Running as a Phase 6 agent in the isolated worktree at `C:\Users\rmill\Desktop\programming\clear\.claude\worktrees\agent-a72d64d4\`, I used absolute paths like `C:\Users\rmill\Desktop\programming\clear\lib\packaging-cloudflare.js` — which resolved to the MAIN checkout, not my worktree. Git saw 0 staged changes on my branch while the main checkout accumulated all my Phase 6 work sitting on top of Phase 4's uncommitted work.

The recovery path: re-apply the same Edits to the worktree's files (absolute-path to `.claude/worktrees/agent-<id>/...`), then `git checkout` the file in main to blow away my contamination without touching Phase 4's WIP. I kept the test file in `/tmp/` as a backup just in case the diff couldn't be cleanly replayed.

**Rule (for any worktree agent):** every file touch must start with the worktree root. Don't rely on shell-CWD since Bash resets between tool calls. The Edit tool's `file_path` should begin with the worktree path, not the repo path.

### Phase 6 outcome

- 5 effective TDD cycles committed in one (cf-6.1, cf-6.2, cf-6.6, cf-6.7, cf-6.8, cf-6.9; commit message groups 6.1/6.2/6.7/6.8/6.9; 6.6 is the RUN_WORKFLOW invocation also in the same commit)
- 2247 → 2268 tests passing (+21 net, all in `lib/packaging-cloudflare-workflows.test.js`)
- 0 regressions: existing Temporal tests (js_backend target) still green
- CF target drift-guard smoke: 112/112 passes — `src/index.js` has zero `@temporalio`, zero `require(`, zero `fs.`, zero `child_process`
- `emitCloudflareWorkflow(wfNode)` + `collectCloudflareWorkflowBindings(astBody)` — exported from `lib/packaging-cloudflare.js` so Phase 7 can reuse them for the deploy orchestrator
- `runs durably` on CF target now produces a standalone `src/workflows/<slug>.js` ESM module with `extends WorkflowEntrypoint`, `async run(event, step)`, and one `await step.do('<label>', async () => await agent_<name>(_state))` per step
- `wrangler.toml` grows one `[[workflows]]` section per durable workflow, with binding/name/class_name derived deterministically from the workflow name

## Session: Cloudflare Workers for Platforms — Phase 5 (2026-04-23)

Periodic work (`runs every 1 hour`, `every 10 minutes`, `every day at 9am`) can't use `setInterval` or `node-cron` on a Worker — there's no long-lived process to host them. Phase 5 wired Clear's scheduled agents + background blocks + cron blocks into Cloudflare Cron Triggers: wrangler.toml declares the cron expressions, and `src/index.js` exposes a `scheduled(event, env, ctx)` handler that dispatches on `event.cron`. 6 TDD cycles + learnings fold. Three pitfalls worth pinning.

### Cron dispatch and wrangler triggers MUST mirror or silently break

Cloudflare rejects a deploy where `wrangler.toml` declares `[triggers] crons = [...]` but the script has no `scheduled()` export — and the inverse (handler without matching wrangler entries) silently never fires. Both are failure modes the user never sees at build time.

Fix: single source of truth. `emitCloudflareWorkerBundle()` calls `_collectCronBlocks(body)` once, uses the result for BOTH `wranglerTomlTemplate({ crons })` AND `compileToCloudflareWorker()`'s dispatcher emit. Any divergence is structurally impossible. A test in `lib/packaging-cloudflare-cron.test.js` extracts the cron strings from wrangler.toml's `crons = [...]` array and the branch conditions (`_cron === "..."`) from the handler, and asserts set equality — three in the toml, three branches, byte-for-byte.

### Duration-phrase → cron expression is a silent-failure surface

A wrong cron expression doesn't throw. The job just fires on the wrong cadence for as long as the bundle is deployed. `runs every 5 minutes` accidentally mapped to `*/50 * * * *` would silently run once an hour and most people wouldn't notice until the log volume looked off.

Fix: exhaustive unit tests on the pure `_scheduleToCron(spec)` helper — every combination of {value, unit} the parser can produce gets an explicit mapping with a one-line test. Minutes 1, 5, 10, 30, and 60+ (rounds up to hourly). Hours 1, 6, 12, 24+ (rounds to daily). Days 1, 7. Every-day-at-HH:MM (both agent `at:"9am"` shape and CRON `mode:'at', hour, minute` shape). Seconds round UP to 1 minute (Cloudflare's granularity floor; silently-wrong was still better than throwing at compile time). Missing/malformed spec falls back to hourly and never throws.

### `rehydrateBundleAppName` must preserve `[triggers]`, not regenerate

When `packageCloudflareBundle` takes a pre-compiled bundle and the caller passes a different `appName`, the old code regenerated wrangler.toml from scratch. With Phase 5 adding `[triggers] crons = [...]`, regenerating dropped the crons on the floor — the bundle would deploy without any triggers, scheduled work silently dies.

Fix: regex-replace only the `name = "..."` line in place. Preserves every other line (compat date, compat flags, [triggers], crons array, future bindings). The pattern is additive: new sections the compiler bakes into wrangler.toml survive later mutations without each new section needing bespoke handling in the rehydrate step.

### Cloudflare Cron Trigger constraints (April 2026)

Worth pinning so future helpers don't silently fight the platform:

- **Granularity floor: 1 minute.** Sub-minute schedules aren't representable. Clear's `runs every 30 seconds` rounds up to `* * * * *` and gets run every minute. A warning in `.warnings` would be more honest — TODO for a follow-up plan.
- **Timezone: UTC only.** `every day at 9am` compiles to `0 9 * * *` which is 9am UTC. Users in non-UTC zones need to convert manually. Users will eventually complain; future phase should accept a `in Pacific time` clause.
- **Max crons on free plan: 3.** Paid plan is unlimited. We don't cap at 3 at compile time — the deploy fails at CF's upload step if the tenant is on free, which is recoverable. Deferring the limit-aware packaging to the deploy orchestration plan.
- **Event shape:** `{ cron: string, scheduledTime: number, type: 'scheduled' }`. We dispatch on `.cron`; `scheduledTime` is exposed but unused for now. `ctx.waitUntil` is present so the handler can fire-and-forget background work.

### testAsync at module scope is the only async test pattern that works

Reinforced from Phase 3. The 5.6 E2E suite needed to dynamic-import the compiled bundle, spin up `env.DB = d1Mock()`, apply migrations, and invoke `mod.default.scheduled(event, env, ctx)`. All of this is async; running inside `describe() { it(...) }` would have logged a pass before the Promise resolved. Hoisting the three E2E tests to `await testAsync(...)` at module scope makes them block the runner until complete.

Pattern for any Phase 4+ file that needs async tests: keep sync assertions inside describe/it, hoist async scenarios to `await testAsync(...)` right above them.

### Phase 5 outcome

- 6 TDD cycles committed (cf-5.1 → cf-5.6; cf-5.7 learnings folded into this session note)
- 2247 → 2289 tests passing (+42 net; +38 in packaging-cloudflare-cron.test.js + 4 template smoke additions)
- 0 regressions on default target
- `node scripts/smoke-cf-target.mjs` → 112/112 checks green
- All 8 core templates still compile clean with target=cloudflare
- Dispatch semantics proven end-to-end under d1Mock: one branch per cron, other branches silent on the wrong event, errors swallowed per branch, unknown crons fall through harmlessly

## Session: Cloudflare Workers for Platforms — Phase 4 (2026-04-22)

Making `knows about: Table | 'url' | '.md' | '.txt' | '.pdf' | '.docx'` work inside a deployed Worker. The whole point: Workers has no startup phase (no top-level await), no fs, no require. Knowledge sources that use any of those on the Node target have to be transformed into a Workers-compatible shape — lazy getters for data that's live (tables, URLs), compile-time inlining for data that's static (text, PDF, DOCX). 9 TDD cycles.

### Two different "lazy" patterns, one module-scope cache slot

Table knowledge and URL knowledge both need to be LOADED at runtime (fresh D1 rows, live web content), but they can't load at module init because Workers forbids top-level await and has no pre-request phase. Solution: a nullable module-scope cache + an async loader that populates it on FIRST call:

```js
let _products_cache = null;
async function _load_products(env) {
  if (_products_cache) return _products_cache;
  const _res = await env.DB.prepare('SELECT * FROM products').all();
  _products_cache = (_res && _res.results) || [];
  return _products_cache;
}
```

Second call returns the cache. The cache lives as long as the V8 isolate — typically tens of minutes to hours — so cross-request amortization is real. Marcus's $25/mo Workers Paid plan covers way more traffic when every agent call after the first doesn't roundtrip to D1.

Drift-guard: the Node target emits `_fetchPageText(URL).then(t => { ... })` at module startup; that exact shape must NOT reach the Workers bundle. Tested with a negative regex assertion.

### Compile-time extraction is a NEW capability, not a move

The plan framed cycle 4.4 as "move pdf-parse from runtime into compile-time." That's structurally wrong. Neither `pdf-parse` nor `mammoth` is (or was) installed as a runtime dep in `package.json`. The existing `_loadFileText` call `const pdf = require('pdf-parse')` threw MODULE_NOT_FOUND silently, the try/catch swallowed it, and `.pdf` knowledge returned empty string on the Node target too.

So Phase 4 cycle 4.4 is the FIRST working binary-knowledge path anywhere. The red-team miss got an EXEC CORRECTION commit (`docs(cf-plan): correction to cycle 4.4`) before the feature commit, per plan protocol.

Phase 4 does NOT install `pdf-parse`/`mammoth`. The two-step API we shipped accepts both states cleanly:

```js
const cache = await preloadKnowledgeCache(ast.body, baseDir);
// if pdf-parse missing → cache.get('x.pdf') === { error: 'Cannot find ...' }
// if pdf-parse present → cache.get('x.pdf') === 'extracted text...'
const result = compileProgram(src, { target: 'cloudflare', knowledgeCache: cache });
```

Studio decides at deploy time whether 25MB of pdfkit + native C++ parser is worth shipping. Clean separation: the compiler's job is to bake whatever text it gets handed into the bundle — it doesn't care how the text got there.

### Three-case knowledge emit per agent, one module-scope block

```js
// Emitted at module scope, ABOVE export default { fetch }:

let _products_cache = null;               // table
async function _load_products(env) { ... }

let _knowledge_url_a1b2c3d4 = null;       // URL  (FNV-1a hash suffix)
async function _load_url_a1b2c3d4(env) { ... }

const _knowledge_file_e5f6g7h8 = "...";   // file (compile-time inlined)

// And each agent:
async function agent_faqbot(env, question) {
  const _query = ...;
  const _ragContext = [];
  { const _recs = await _load_products(env); ... }      // table branch
  { const _text = await _load_url_a1b2c3d4(env); ... }  // URL branch
  { const _text = _knowledge_file_e5f6g7h8; ... }       // file branch (no loader call)
  const _ragStr = ...;
  return await _askAI_workers(env, question + _ragStr, null, null);
}
```

All three source types feed the same `_ragContext` scorer. File sources skip the loader call because the constant's already populated — small perf win, more importantly: it maps exactly to the Node `_searchText(_knowledge_file_N, ...)` shape, so behavior is identical across targets for the same `.md` / `.txt` file.

FNV-1a hashing: tiny deterministic hash over the URL / filename, lowercase hex, collision-safe for the few dozen knowledge sources an app might have. Same source = same suffix across builds, so two agents that share knowledge share the cache slot.

### Bundle-size guardrails are bytes, not chars

`Buffer.byteLength(text, 'utf8')` not `text.length`. Matters because a 500KB Japanese knowledge file can be ~1.5MB as UTF-8 bytes — the char count doesn't tell you what Cloudflare's uploader will see. Phase 4 uses two thresholds:

- `> 1MB`: compile error naming the file + suggesting D1 or R2
- `> 512KB`: warning, "bundle is growing"
- `≤ 512KB`: silent

Per-file, not total, because the Workers-for-Platforms 10MB cap is per script. A single 1MB file leaves 9MB for everything else — tolerable. Two 1MB files eats 20% of the cap before any endpoint logic even compiles. Hard-fail at 1MB per file is the cliff.

### Sync compile + async preload is the cleanest seam

`compileProgram` stays synchronous — that's the contract with every existing caller (CLI, Studio, tests). Forcing it async would ripple through 50+ callsites. Instead: a separate `preloadKnowledgeCache(astBody, baseDir) → Promise<Map>` that callers invoke BEFORE compile when they have async-only extractors.

The sync compile path checks the cache first; cache hit = inline text; cache miss + supported ext + sync extractor available = read synchronously; cache miss + binary format = `{ error: 'needs-async' }` surfaces as a compile error telling the caller to preload.

Rule: any async dependency in a pass that USED to be synchronous gets hoisted into a pre-pass that returns cached values. Don't make every compile transitively await.

### Drift-guards are the only safety net for Workers output

Phase 1/2/3 learnings already documented this; Phase 4 adds the PDF/DOCX flavor. The tests don't just assert "bundle works" — they grep the bundle for forbidden substrings:

```js
const forbidden = ['pdf-parse', 'mammoth', 'require('];
for (const needle of forbidden) {
  if (src.includes(needle)) throw new Error(`Forbidden: '${needle}'`);
}
if (/\bfs\./.test(src)) throw new Error("'fs.' in bundle");
```

Why belt-and-suspenders: Cloudflare's uploader rejects `require(` as a static scan. If our bundle has it — even inside a comment or a JSON string — the deploy fails with a cryptic error. The drift-guard catches it in `node clear.test.js`, not at `wrangler deploy` time.

### Agent function Workers emit is a NEW surface

Before Phase 4, `compileToCloudflareWorker` emitted endpoints only. Agent function bodies referenced from endpoints (`call 'Helpdesk' with query`) compiled to `agent_helpdesk(query?.question)` — but `agent_helpdesk` itself was never defined in the Workers bundle. That would have been a silent reference-error at runtime once deployed.

Phase 4 adds `_emitWorkersAgentFn(agent)` + a loop in `compileToCloudflareWorker` that emits one per agent-with-knowledge. The signature is `async function agent_X(env, param)` — first arg is the env, threaded through so `_askAI_workers(env, ...)` + `_load_X(env)` can reach bindings. When Phase 5/6 want to emit ALL agents (scheduled, tool-using, streaming), the same hook expands.

### Phase 4 outcome

- 9 TDD cycles committed (cf-4.1 → cf-4.8 + plan correction; cf-4.9 = this learnings, folded into 4.8 per plan)
- 2247 → 2274 tests passing (+27 net)
- `preloadKnowledgeCache` + `extractKnowledgeTextSync` + `extractKnowledgeTextAsync` exported from `lib/packaging-cloudflare.js`
- `_emitWorkersAgentFn` + `_knowledgeSuffix` new helpers in `compiler.js`
- Drift-guards pass: zero `pdf-parse|mammoth|require(|fs.` in any fixture bundle
- Node (default) target: zero behavioral change
- EXEC CORRECTION to plan row 4.4: pdf-parse wasn't a pre-existing runtime dep; Phase 4 doesn't install it. Studio owner can decide later.

## Cloudflare Workers for Platforms — Phase 7 (direct CF API deploys)

### Phase 6 blocker: agent functions need their own module

Before Phase 7 could wire deploys through, the Phase 6 emit had a latent runtime bug. Compiled workflow files in `src/workflows/<slug>.js` called `agent_helpdesk(_state)` inside every `step.do(...)`, but the function `agent_helpdesk` lived only in `src/index.js`. Each Cloudflare Worker ESM module runs in isolated scope — the workflow class would throw `ReferenceError: agent_helpdesk is not defined` the moment any durable step executed. The Phase 6 tests papered over it with `globalThis` stubs; a real deploy would explode on first run.

Fix was a structural split. The compiler's `compileToCloudflareWorker` now emits TWO module files:
- `src/agents.js` — every agent function (`export async function agent_welcome_agent(env, ...)`), every knowledge-source loader (`_load_products`, `_load_url_<hash>`), every inlined knowledge constant (`_knowledge_file_<hash>`), and the Workers-safe helpers (`_askAI_workers`, `_askAIStream_workers`, `_askAIWithTools_workers`). All prefixed with `export`.
- `src/index.js` — routing + endpoint handlers. Imports the symbols it needs from `./agents.js`.

Each workflow file now gets an `import { agent_x, agent_y, ... } from '../agents.js'` header listing exactly the agents it references. A helper `collectWorkflowAgentRefs(steps)` walks every step kind (step / parallel / conditional / repeat) recursively to build that set.

Rule: **any module-scope function that more than one file calls must be an explicit export**. globalThis works in Node test harnesses; Cloudflare has no such safety net.

### combinedBundleText is the right lens for bundle-shape assertions

Phase 3 + 4 tests pinned a bunch of assertions on `result.workerBundle['src/index.js']`. They read "helper X is async, takes env, ends with fetch()". Splitting the bundle into `src/index.js` + `src/agents.js` broke 23 of those — the helpers moved, but the PROPERTY the tests cared about (is the helper present in the Workers emit somewhere?) didn't change.

Fix: a `combinedBundleText(bundle)` helper that concatenates the source of `src/index.js` + `src/agents.js` + any `src/workflows/*.js` files and returns one string. Tests that care about shape (signature, usage, forbidden-string absence) look at the combined text. Tests that care about WHICH file — the drift-guards that prove `src/index.js` stays routing-only — still scope to a single file.

Rule: **bundle shape assertions should not care which emitted file a symbol landed in** unless the test is specifically about file-level isolation (drift-guards).

### FormData with Blob parts — Node 20+ native, no extra deps

Cloudflare's `PUT /scripts/{slug}` upload wants a `multipart/form-data` body with a `metadata` JSON part + one part per module file. No npm package needed in Node 20+: `new FormData()` + `new Blob([contents], { type })` with `form.append(name, blob, filename)` works natively. Setting the module file `type` to `application/javascript+module` (the exact string CF expects) is load-bearing — using `text/javascript` or leaving it blank makes CF reject the upload with a vague error.

The fetch stub in `wfp-api.test.js` captures the FormData by reference and tests read `form.get('metadata')` to pull the Blob back out. That works because FormData in Node 20 is the browser-compatible one. The one gotcha: `metadataBlob.text()` returns a promise (as on the web), not a sync string.

### encodeURIComponent every user-derived path segment

Two layers upstream sanitize app slugs, but defense-in-depth: the `WfpApi` wrapper `encodeURIComponent`s every segment it interpolates into URLs. `uploadScript({ scriptName: 'weird/slug' })` produces `/scripts/weird%2Fslug`, never `/scripts/weird/slug`. One test asserts this. Without the encode, a sufficiently creative slug could traverse out of the dispatch namespace URL and hit the wrong endpoint entirely.

### Token redaction in thrown errors

Any error path that bubbles a Cloudflare message back to the user has to assume it'll land in logs — sometimes captured by third parties. The `_call` private method runs every error message through `replace(new RegExp(this._apiToken, 'g'), '[redacted]')` before throwing. The apiToken itself lives in a non-enumerable slot (`Object.defineProperty` with `enumerable: false`), so `JSON.stringify(instance)` can't leak it either. Plus, `setSecrets()` NEVER includes secret values in its `failed` array — only secret names + the status/code.

### Rollback ladder: reverse order, skip what didn't run

The orchestrator tracks three booleans (`d1Provisioned`, `scriptUploaded`, + implicit "secrets attempted"). Each step updates the right flag when it succeeds. On failure, `_rollback()` walks the flags in REVERSE order (delete script first, delete D1 second). The reverse matters because the script's D1 binding could still hold a handle that prevents clean D1 deletion if you go forward-order.

The rollback is deliberately NOT a try-catch wrapper around `deploySource`. Each step has an explicit try-catch that calls `_rollback()` then returns a structured error object. No thrown exceptions escape `deploySource` to a caller — the caller handles typed failure shapes, not stack traces.

### Double-click guard: module-scope Map, 120s stale

Users double-click Publish. UI has a loading state but under spotty wifi the request can be in-flight for 8-10 seconds — plenty of time to click twice. Without a guard, the second click fires a second deploy that races the first: two provision calls, two script uploads, potentially one tenant with TWO D1 databases for the same app.

The lock is a plain `Map<string, { jobId, startedAt }>` at module scope. Key is `${tenantSlug}:${appSlug}`. `acquire()` returns `{ acquired: true, jobId }` or `{ acquired: false, existingJobId }`. `release()` runs in a `finally` so crashes don't leave stale locks forever. Stale-clear after 120s handles the "deploy hung and never released" case.

Torture test: 10 `Promise.all`-parallel deploys for the same key. Exactly 1 enters provisionD1, 9 return `{ conflict: true, existingJobId }` with the same jobId. Works because `acquire()` is synchronous — two microtasks can't both see the map empty.

### Lazy `getWfpApi()` + `_setWfpApiForTest` hook

`deploy.js` imports `WfpApi` but doesn't instantiate it at module load — instantiation happens inside `getWfpApi()` on first use, reading env at call time. Two wins: (a) envless test setups don't blow up on import, (b) `_setWfpApiForTest(fakeApi)` lets integration tests inject a recording fake without touching real env vars.

Singleton is intentional — a single process should share one wrapper so the underlying `fetch` reference is consistent across deploys. The test helper sets the singleton to `null` in its finally block so subsequent tests get a fresh wrapper.

### CLEAR_DEPLOY_TARGET default stays 'fly' during Phase 7

The plan says "default to cloudflare once Phase 8 smoke passes." Phase 7 lands the dispatch code behind an env gate but does NOT flip the default. This keeps the existing `playground/deploy.test.js` green (it relies on the mock Fly builder) and gives Phase 8 a clean flip point. When real-CF smoke is confirmed, one env-default change turns on the whole new path for every Studio process.

### In-memory job map vs builder /status polling

The Fly path used `/api/deploy-status/:jobId` to poll the builder for build progress (a tarball → docker build → fly deploy sequence taking minutes). The CF path is synchronous-ish: deploy completes in 5-8 seconds. There's no async work to poll for. But the UI still calls `/api/deploy-status` right after the initial response to confirm — so we populate a tiny `Map<jobId, { status, url, ... }>` at module scope during `/api/deploy` and serve lookups from it.

Consequence: if the Studio process restarts between POST and the poll, the jobId 404s. That's fine — the initial POST already returned the URL. Clients shouldn't depend on the poll for correctness, only for progress UX.

### Phase 7 outcome

- 15 TDD cycles committed (cf-6.10 pre-fix + cf-7.1 → cf-7.14)
- 2337 → 2390 tests green in `node clear.test.js` (+53)
- `playground/deploy.test.js`: 8 → 15 tests (7 new CF integration tests)
- `playground/wfp-api.js` + `playground/wfp-api.test.js` (39 tests)
- `playground/deploy-cloudflare.js` + `playground/deploy-cloudflare.test.js` (14 tests)
- `scripts/reconcile-wfp.js` (stub — no unit tests; exercised by ops)
- `playground/deploy.js` gets dispatch gate; env-default still `'fly'`
- `playground/tenants.js` gains `markAppDeployed` + `loadKnownApps` (additive, non-breaking)
- `compiler.js` + `lib/packaging-cloudflare.js` split agent emit into `src/agents.js` (Phase 6.10 fix)
- 112/112 CF drift-guards still green
- Zero regressions on any prior phase

## Session 44: cc-agent Windows stdin race + system-prompt size ceiling (2026-04-23)

### The bug that looked like two bugs

The morning 38-task sweep (the first one with the Windows spawner zombie-kill fix shipped) completed cleanly — 14 minutes wall clock, 5 timeouts enforcing exactly at 180.0s, claude.exe count stable across the sweep. That verified the spawner work.

But the pass rate was **2/38 (5.3%)** versus session 42 tick 9's **34/38 (89%)** baseline. Most tasks "failed" with wall-clock times of 17–60s — way too short for Meph to build an app, way too long for a simple crash. Fast-fail on the simplest-possible task (hello-world = "GET /api/hello returns {message}") was the biggest tell: hello-world at 24s shouldn't be possible; either Meph finishes it (35–45s) or hangs.

### Root cause: claude.exe on Windows has a 3-second stdin-data-received check

Reproduction from bash:
```
$ echo "hi" | /c/Users/rmill/AppData/Roaming/Claude/claude-code/2.1.111/claude.exe --print --verbose --permission-mode bypassPermissions --tools "" --mcp-config tmp.json --output-format stream-json
Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.
Error: Input must be provided either through stdin or as a prompt argument when using --print
```

**100% reproducible.** On Windows, Node's `child.stdin.write(prompt); child.stdin.end()` hands the bytes to a pipe whose OS-level flush happens asynchronously. claude.exe spawns, starts its 3-second stdin-data-received timer, and if it hasn't seen bytes by t=3s it prints the warning and exits code 1. The Node write completes in Node's buffer before 3s, but the pipe doesn't flush to the child's stdin handle within that window.

### The fix is structural — can't just move the prompt

Obvious first attempt: pass the prompt as a positional argv instead of piping via stdin. That works for short prompts. But the Meph "full prompt" is Meph's 48KB system prompt concatenated with the ~1–2KB user task prompt = 49KB. Windows' `CreateProcess` command-line ceiling is 32,767 characters. Passing 49KB as argv → `ENAMETOOLONG` from Node spawn.

Three paths considered:
1. **argv-only (concatenated prompt):** fails ENAMETOOLONG above 32KB.
2. **stdin-only (current):** fails stdin-data-received race ~100% of the time on Windows.
3. **split: system prompt → file + user prompt → argv:** neither channel exceeds its limit. stdin is ignored entirely.

Path 3 is the only working one. claude CLI has a `--system-prompt-file <path>` flag (hidden from `--help` listing but referenced in the `--bare` mode description — spelled `--system-prompt[-file]`). Verified with a direct invocation.

### The fix

`playground/ghost-meph/cc-agent.js`:
- `chatViaClaudeCodeWithTools(userPrompt, systemPrompt)` — receives the two separately. Writes system prompt to `/tmp/ghost-meph-system-prompts/sys-<timestamp>-<pid>.txt`. Unlinks in both success and error paths.
- `buildClaudeStreamJsonSpawnArgs(configPath, userPrompt, systemPromptPath)` — appends `--system-prompt-file <path>` when path is set, appends `userPrompt` as final positional argv when non-empty.
- `runClaudeCliStreamJson(userPrompt, configPath, systemPromptPath)` — plumbs the third arg through.
- `spawn(..., { stdio: ['ignore', 'pipe', 'pipe'] })` — stdin closed entirely. No pipe, no race.
- stderr-tail filter strips the benign "no stdin data received" warning from reported errors.

### Post-fix verification

- RED/GREEN TDD: 4 new assertions in `playground/ghost-meph.test.js` (positional prompt last in argv, empty prompt omitted, `--system-prompt-file` present when path given, absent when not). 2 failed pre-fix, all 4 pass post-fix.
- Full ghost-meph test suite: 75 → **79 green**.
- Compiler tests: **2399/0** unchanged.
- Solo hello-world: **42s PASS** (was 24s fast-fail).
- Solo greeting: **50s PASS** (was 35s fast-fail).
- 2-task parallel: **2/2 PASS** (both ~45s).
- 3-task parallel: **flaky 33-66%** — a separate issue, not this fix's scope.

### The parallel-3 flakiness is a different fish

3+ concurrent sweep workers see 1-2 workers fast-fail intermittently. Direct `claude.exe` invocations with 3 concurrent runs all succeed in <3s each when scripted from bash (so the binary handles parallelism fine). Something in the sweep's parallel path — not in cc-agent's spawn call itself — makes 3-worker load unstable. Not diagnosed this session. Parallel-2 is rock solid.

### Why this sat hidden so long

Session 42's sweeps "worked" at 89% pass rate. Either (a) a recent claude.exe binary update changed the 3-second timer behavior, (b) session 42 was on a different version, or (c) earlier sweeps sometimes won the race. Unknown. What's certain: claude.exe v2.1.111 fails 100% of stdin-piped prompts on Windows, and only the argv+file split survives.

### Gotcha-as-rule for this project

**Never pipe a prompt to `claude.exe` via stdin on Windows.** Use argv for the user-side prompt, `--system-prompt-file` for any system prompt that might exceed 32KB. Close stdin explicitly with `stdio: ['ignore', ...]` so no future change can accidentally revive the race.

---

## Session 45: Python `belongs to` JOIN silent bug (2026-04-24)

TIER 2 #9 had sat in requests.md for weeks with "both langs broken." Reality was sharper: JS had been auto-stitching FK reads all along; Python shipped two distinct silent bugs that both needed fixing in one pass.

### Two failures, both silent, both class-of-bug important

**Failure 1 — schema double-s typo.** `compiler.js:5735` built the Python `REFERENCES` clause with `${f.fk.toLowerCase()}s(id)`. For `author belongs to Users`, that produces `REFERENCES userss(id)` — a table that does not exist. SQLite silently accepts the DDL (FK enforcement is off by default in the stdlib driver), so the bug is invisible until someone reads the compiled output. The JS path always did this correctly via `pluralizeName`. **Fix:** use `pluralizeName(f.fk)` in Python too.

**Failure 2 — no stitching on read.** Python's `get all Posts` compiled to `db.query("posts")` with no follow-up loop to swap the FK id for the referenced record. The user got `{author: 1}`. JS's `compileCrud` has had a FK-stitching loop for ages, gated on `ctx.schemaMap.fkFields` — but the Python backend compile entry (`compiler.js:12196`) never populated `schemaMap` on its ctx. `compileCrud` saw `undefined` and silently skipped the stitch block. **Fix:** build `pySchemaMap` alongside `pySchemaNames`, pass it on ctx, mirror the JS stitching loop inside the Python lookup branch.

### Gotchas-as-rules from this

- **When emitting SQL `REFERENCES`, use `pluralizeName(targetName)` — never append `s` by hand.** Tables ending in `s` or `es` double-pluralize (Users → userss; Addresses → addressess). Both already-plural entity names are common in Clear apps.
- **Per-target compile ctx must be symmetric.** If the JS backend ctx carries `schemaMap`, the Python backend ctx must too. Asymmetry between language paths produces silent feature gaps that unit tests won't catch — the feature exists in one target, is just gone in the other. Audit: grep `ctx\\.schemaMap` and make sure both `lang: 'js'` and `lang: 'python'` entry points populate it.
- **Run the compiled output through `py_compile` + a hand-rolled mock-db smoke before declaring a Python fix done.** `node clear.test.js` greens off string assertions, not semantic correctness. A 20-line `temp-py-stitch-smoke.py` script spoofs the runtime db class, runs the generated stitching loop, and asserts the user-visible shape (`{author: {id:1, name:'Alice'}}` not `{author: 1}`). That's the Session 9 "runtime guards > compile-time guards" pattern applied to test coverage.
- **Phrase-as-negative for the double-s trap.** "Never hand-append `s` to a table name in generated SQL." Anyone wiring a new language target or adapter will otherwise repeat the same bug.

### Why this mattered more than it looked

Every relational Marcus app (CRM, blog, helpdesk, booking — 4 of the 8 core templates) hit this bug on the Python target. Looked like users would simply "not use Python for relational data" — but the bug was also the reason Python benchmarks underperformed against JS on every CRUD archetype. Fixing it:
- Unblocks Python-backend relational apps end-to-end
- Tightens Python/JS parity (one fewer silent divergence)
- Added 5 compiler tests + 1 runtime smoke, so the regression floor exists. Future pluralize changes can't re-introduce the typo without a red test.

---

## Session 45b: Scheduled-task shutdown leak (2026-04-24)

TIER 2 #13 had been marked "partial" for weeks. The symptom was subtle: every Clear app with a `background` job or a `cron` block would refuse to exit on SIGTERM. `server.close()` fired; the HTTP server shut down; then the process hung until Node's 30-second grace timeout killed it. Local dev: `ctrl-c` required a second press. Production deploys: 30-second tail on every rollout.

### Root cause: anonymous timer handles

The compiler emitted `setInterval(fn, ms);` with no handle capture. Nothing to `clearInterval`. `server.close()` stopped accepting connections but the interval kept running on the event loop, so Node's "exit when event loop is empty" check never tripped. This applied to five distinct emit sites:
1. `background 'foo': runs every N unit` → `setInterval`
2. `every N minute:` / `every N hour:` top-level cron → `setInterval`
3. `every day at HH:MM:` top-level cron → IIFE with recursive `setTimeout` (each `_tick` re-arms the next one)
4. `agent 'X' runs every N unit` → `setInterval`
5. `agent 'X' runs every N unit at HH` → node-cron `.schedule()` (returns a `.stop()`-able object)

### Fix: one registry, five push sites

Single array `const _scheduledCancellers = []` at module top (gated on `hasScheduled = body.some(n => n.type === BACKGROUND || n.type === CRON || (n.type === AGENT && n.schedule))` so apps without scheduled work emit no dead code). Every emit site captures its timer in a named variable and pushes a zero-arg closure:
- `setInterval(fn, ms)` → `_scheduledCancellers.push(() => clearInterval(_job_x))`
- `node-cron.schedule(...)` → `_scheduledCancellers.push(() => _cron_x.stop())`
- Recursive setTimeout → `let _curTimer; ... _curTimer = setTimeout(_tick, ...); _scheduledCancellers.push(() => clearTimeout(_curTimer))` — the closure sees `_curTimer` by reference, not value, so it cancels whichever _tick is armed RIGHT NOW

Both `SIGTERM` and `SIGINT` drain the registry before `server.close()`.

### Gotchas-as-rules

- **Every generated timer must pair with a canceller.** If the compiler emits a `setInterval`, it also emits a `clearInterval` path. Any emit site that just calls `setInterval(fn, ms)` without capturing the handle is a bug in the compiler — it's not the app author's job to clean up compiler-emitted plumbing.
- **Recursive setTimeout patterns need closure-over-mutable-var for cancel.** `setTimeout(_tick, _nextMs())` assigned at IIFE top-level only captures the FIRST timer. When `_tick` re-arms with `setTimeout(_tick, 86400000)`, the new handle is orphaned unless the IIFE stores it to a `let` that a registered canceller can read. The pattern `let _cur; _cur = setTimeout(_tick, ...); push(() => clearTimeout(_cur))` is the textbook solution — the canceller closes over `_cur` by reference, so it always reads the latest armed timer.
- **SIGINT and SIGTERM should share shutdown logic.** Production containers send SIGTERM; local dev sends SIGINT (ctrl-c). Having SIGTERM clean up and SIGINT exit dirty is a silent asymmetry — same cleanup, same symbol, both signals. When writing shutdown code, always wire both handlers to the same body.
- **Gate dead code with capability detection.** The registry adds 3 lines at module top and is empty for the majority of apps. Guarding on `hasScheduled` avoids polluting 95% of compiled apps with plumbing they don't use. Same pattern as `usesAuth` / `usesRateLimit` / `hasAuthScaffold` detection higher up in the backend JS emitter.
- **"Partial" in requests.md is a red flag, not a status.** T2#13 had sat as "partial" while new features shipped around it. Every "partial" means: it technically works in some dimension but silently fails in another. Audit all current "partial" entries — they're usually shutdown, error, or cancellation paths that look fine until production.

---

## Session 45c: Multipart upload middleware auto-wiring (2026-04-24)

TIER 2 #15 had been sitting open with a misleading root-cause hypothesis ("server has no multer"). That was half-right: the module-level `require('multer')` DID appear when a program had `accept file:`, but nothing tied it to endpoints that received client uploads. And the more common case — client `upload X to '/api/foo'` with a plain `when user calls POST /api/foo sending data:` server-side — got no multer at all. The client sent a multipart body; the server had only `express.json()`; `req.body` was an empty object; the handler thought the client sent nothing.

### The AST walk is the load-bearing part

`UPLOAD_TO` nodes live deep in the tree: `page.body[].button.body[].upload_to`. The existing `hasFileUpload(nodes)` detector only recursed into `ENDPOINT.body` — it missed UPLOAD_TO entirely because that node is frontend, not server-side. Fix: a generic `walkForUploads(nodes, acc)` helper that recurses into every `body`, `thenBody`, and `elseBody` array on every node. This returns both `{ found: bool, urls: Set<string> }` — the boolean gates whether to emit multer plumbing, the Set drives per-endpoint middleware injection.

### Why `_upload.any()` over `_upload.single('file')`

`.any()` accepts any number of files under any field name, populating `req.files` as an array. The Clear source doesn't declare a specific field name for the file — `upload doc to '/api/foo'` tells the compiler "send the file input named doc via FormData under the field name `doc`," but the server doesn't have a reciprocal declaration. `.any()` sidesteps the coordination problem at the cost of mildly relaxed validation. If we later want stricter typing, we can add per-endpoint `.fields([{name: 'doc'}, ...])` emission; for now `.any()` matches the client side of any upload you can write.

### Why memoryStorage is the right default

Three footguns avoided:
1. **`/tmp` permission issues.** Disk storage on Cloudflare Workers / App Runner / random Docker base images fails silently or loudly depending on the runtime. Memory storage works everywhere.
2. **EPIPE on full disks.** A full disk during upload crashes the server at a hard-to-diagnose layer. Memory storage fails predictably at the `limits: { fileSize }` cap — a 400, not a crash.
3. **"Where do files live in production?" footgun.** Disk storage silently creates `./uploads/` and the app author inherits an unmanaged-filesystem-state problem. Memory storage makes the file's lifecycle explicit — if you want to persist, you write it yourself to S3/R2/whatever with the buffer you got.

10MB default is sized for the "normal" upload (avatar, PDF, image) without forcing every app author to tune it. The ceiling matches the old in-endpoint `accept file: max size is 10mb` default exactly.

### Gotchas-as-rules

- **Silent-bug test: does `req.body` ever equal `{}` when the client clearly sent something?** If yes, there's a body-parsing gap. For multipart, that's "no multer." For form-urlencoded, it'd be "no express.urlencoded()." Same class of bug, same symptom — "client POSTed, server saw nothing."
- **When a frontend node generates a specific HTTP contract, the compiler must wire the server to match.** UPLOAD_TO → multipart/form-data; the matching POST endpoint needs the parser. Stream endpoints → SSE; client needs the EventSource reader. JSON POSTs → `express.json()`; already handled. The client-server pair must be consistent, and the compiler is the only place that knows both halves.
- **AST walks for cross-cutting features need to recurse into all body-like arrays, not just `body`.** Conditional branches (`thenBody`, `elseBody`), loop bodies, nested page blocks — missing any of these means features silently fail inside them. Pattern: scan for `Array.isArray(n.body)`, `Array.isArray(n.thenBody)`, `Array.isArray(n.elseBody)` and recurse into each.
- **Negative-case tests are as important as positive.** Auto-wiring middleware on EVERY POST endpoint (lazy approach) would have broken JSON POST parsing for every app that doesn't use uploads. The test "does NOT wire multer on POST endpoints that are not upload targets" locks the discrimination in. Without it, one refactor could add `_upload.any()` everywhere and no test would complain.

---

## Session 45d: Auth-capability gate on mutation security check (2026-04-24)

Session 45 friction-batch-2 pass surfaced a subtle failure mode. Friction items #2 + #5 (combined: 25 rows, ~50% give-up rate) were the "DELETE /api/foo/:key needs `requires login` as the first line" hard error. The message was already clear, included an example, and was marked `patchable: true` with a structured fix. So why was Meph giving up?

Reading three real Meph sessions end-to-end answered it: the apps were **toy K/V stores**. No `allow signup and login`. No Users table. No auth infrastructure. Meph was being told to add `requires login` to an app that had no user system to check against. It's like demanding every function have a return type in a dynamic language — syntactically possible, semantically nonsense.

### The capability gate

Added a `hasAuthCapability` pre-check to `validateSecurity`:

```js
const hasAuthScaffold = body.some(n => n.type === NodeType.AUTH_SCAFFOLD);
function hasUsersWithPassword(nodes) {
  // recurse into body-like arrays; look for a DATA_SHAPE named user/users
  // with a password field
}
const hasAuthCapability = hasAuthScaffold || hasUsersWithPassword(body);
```

Two outcomes:
- **Capability present** → unchanged hard error on each DELETE/PUT missing `requires login`.
- **Capability absent** → collect the endpoints into an array during the pass; at the end, emit ONE top-of-file warning listing all the paths + lines + exactly how to upgrade to a hard error (add `allow signup and login` + Users table) OR acknowledge public-by-design (do nothing).

### Gotchas-as-rules

- **When a validator demands a feature, verify the feature's precondition is met.** Demanding `requires login` on an app with no auth setup is a check without a referent. Every rule in the validator should have a "what needs to exist for this rule to make sense" precondition — if the precondition isn't satisfied, downgrade to a warning or skip entirely. Otherwise the rule becomes a trap.
- **Batch-summarize when the root cause is repeated.** N per-endpoint errors for the same root cause overwhelm the reader and hide the shared fix. One top-of-file warning listing all N with a single remediation path gives Meph (or a human) one thing to triage instead of N things to resolve independently.
- **Friction data ranks; real sessions diagnose.** The top-friction script says WHICH error is expensive. Reading the actual `source_before` for 2-3 flagged rows tells you WHY it's expensive. Don't skip the second step — the error message might be fine; the failure might be in the validator's assumption about the program shape, not its wording.
- **"Auth capability" beats "auth presence" as a predicate.** A program with no Users table and no auth-scaffold directive has no auth capability, period. Checking for the AUTH_SCAFFOLD node alone would miss custom-table-based setups; checking for the Users+password pattern alone would miss the scaffold-only case. The OR of both is what you want.
- **Compile-error rewrites must be data-driven, not hunch-driven.** This fix targeted the top friction item (#2 + #5 same root cause); previous fixes targeted the top of batch 1. Running `node scripts/top-friction-errors.mjs` before touching validator error messages is a hard rule in project CLAUDE.md now because it's the difference between chasing symptoms and killing root causes.

---

## Session 46: Decidability audit (2026-04-24)

Question we came in with: should Clear move from Turing-complete to decidable / total-by-default, with effect boundaries for the non-total constructs? Recon ran before drafting the plan.

### What the audit turned up

Clear has 154 node types. Almost all are pure. The termination risks cluster in a small set:

- **`WHILE` is the only unguarded loop.** `REPEAT N TIMES` is integer-bounded; `FOR EACH X IN Y` is finite-collection bounded; `REPEAT UNTIL ... MAX N TIMES` has a hard iteration cap. `WHILE` (parser.js:437-439, compiler.js:6269-6278) emits naked `while(cond)` with nothing. If Meph hallucinates a while with no decrementing condition, the runtime hangs.
- **Unbounded recursion.** No check in `validator.js` (`grep recursion validator.js` returns nothing). No depth guard in `compiler.js`. A function calling itself with no base case stack-overflows.
- **`SEND_EMAIL` has no timeout.** SMTP can hang indefinitely (compiler.js:6660-6674). Same for database mutations.
- **`ask claude` has no global timeout.** Per-call `with timeout` works, but there's no default ceiling. If a Meph-built app forgets the timeout, the request can hang.

The four constructs that LOOK unbounded are actually by-design: `ENDPOINT`, `SUBSCRIBE`, `BACKGROUND`/`CRON`, and `every N seconds`. They run forever because they're servers — not a bug.

**The surprise:** the 8 core templates are 94% pure by line count. Effect density averages 6%. Grep confirms zero uses of `while` across all 8 templates; `ask claude` appears 6 times total (helpdesk-agent × 2, ecom-agent × 4); `send email` zero. Curriculum tasks (38 JSON specs) mention `while` zero times. The language doesn't need a language-level purity fence to fix the hang class — it needs three surgical validator rules + three runtime timeouts on the constructs that are *accidentally* unbounded.

### Decision that flowed from the audit

Two paths emerged:
- **Path A (minimalist):** forbid naked `WHILE`, cap recursion depth, add default timeouts on email/DB/AI/HTTP. Three validator rules, three compiler changes. No new syntax, no template migration.
- **Path B (maximalist):** add a `live:` effect-fence keyword, migrate endpoints, retrain Meph's system prompt on the new form.

Shipped Path A first as both a fix and a diagnostic. If Phase 7 measurement shows the infinite-loop rate drops ≥50%, Path B is unnecessary. If the remaining hangs come from places Path A doesn't touch (agent tool loops, subscribe handlers), Path B gets evidence-based scoping. This mirrors the "compiler accumulates quality" pattern — ship the cheapest change that demonstrably helps, measure, only pay more if data says we need it.

### Gotchas-as-rules

- **Audit before designing language-level change.** A "we need X" feature request rarely survives contact with actual codebase statistics. The audit said 94% pure → the fence isn't the load-bearing part → 3 validator rules are. Without the audit, we'd have spent a week on the fence.
- **"Inherently non-total" and "accidentally non-total" are different problems.** Endpoints running forever is correct behavior; a `while` with no max is a bug. Treating both as the same thing leads to either over-engineering (wrap every endpoint in ceremony) or under-engineering (let the bugs stay runtime). Separate the two and target only the accidental class.
- **Budget-first applies to plans too.** Phase 7 measurement is $10-capped per CLAUDE.md's Session 41 rule. The first draft of the plan said "run a curriculum sweep, compare infinite-loop rate" — that's the $168 pattern. Replay past failing Factor DB transcripts first (free), then A/B on 5 curriculum tasks ($2-5), then decide.
- **Near-violations of PHILOSOPHY.md rules need precedent citations.** The WHILE counter emission (`_iter++; if (_iter > MAX) throw`) is extra lines that don't trace back to the Clear source — a brush with "1:1 mapping." It's acceptable only because `REPEAT UNTIL` already emits similar counter scaffolding; citing that precedent in the plan prevents the "did you really think about the rule?" pushback from becoming a real objection.
- **New principles that codify existing behavior are stronger than ones that demand new behavior.** "Total by default, effects by label" deserves a PHILOSOPHY.md slot because the audit showed it's already ~94% true implicitly. The plan just closes the gap between what Clear does and what it claims to do.

