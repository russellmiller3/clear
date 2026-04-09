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
