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
