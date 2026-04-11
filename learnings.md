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
| [Session 19b: Display as Cards](#session-19b-display-as-cards-2026-04-10) | `author` field must match before `name`/`title` in heuristics, `ui.tag = 'cards'` is third option, smart field detection by column name |
| [Session 19c: Component Stress Test](#session-19c-component-stress-test-2026-04-10) | Component names collide with content types, reserved name validator in `parseComponentDef()`, 8 edge case patterns all passing |
| [Session 20: GP Language Features](#session-20-general-purpose-language-features-2026-04-10) | `of`→`in` canonical, `using`→`with`, `returns`→`responds_with`, `exists in` is compound token `key_exists`, `parsePrimary` has no errors array, `run()` exits immediately, params are `{name,type}` objects, TRY_HANDLE uses `handlers` array, typed handler body indent math, Edit tool fails on large files with template literals |
| [Session 21: RL Foundation + Source Maps + Page Slugs](#session-21-rl-foundation--source-maps--page-slugs-2026-04-11) | npm require double-quotes bug, backend `// clear:N` always-on for source maps, `_clearLineMap` injected as line 2 (shift off-by-one), `pageNode` always sets route now (single-page apps safe because `hasRouting = pages.length > 1`), sandbox symlinkSync needs `'junction'` type on Windows |
| [Session 22: Compiler Requests + RL Infrastructure](#session-22-compiler-requests--rl-infrastructure-2026-04-11) | Optional chaining `?.` only for user-written possessive access (not compiler-generated `req.body`), `error.message` needs hard `.` (exception to `?.` rule), keyword guard must whitelist content-type words (`text`, `heading` etc.), `_pick` JSON.stringify for nested objects, `_revive` JSON.parse on retrieval, user-written TEST_DEF bodies go through `generateE2ETests` not `compileNode`, cron tokenizer splits `2:30pm` into multi-token sequence, patch API body indentation must always add 2-space prefix (not skip if already indented), `run command` capture mode via ASSIGN special-case (not exprToCode) |
| [Session 20: Compiler Bug Fixes + SVG Rendering](#session-20-compiler-bug-fixes--svg-rendering-2026-04-11) | Tree-shaker callback blind spot, conditional DOM needs reactive path, `text` guard too strict, SHOW needs DOM targets, bare SVG streaming |

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
