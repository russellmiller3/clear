# Clear Language -- Intent Specification

> Authoritative map of the Clear compiler's node types, build targets,
> syntax forms, and compilation rules. If it's not here, it doesn't exist.
> Update this file when adding new syntax, node types, or compiler cases.

## Build Targets

| Target | Directive | Output Files |
|--------|-----------|-------------|
| Web (reactive frontend) | `build for web` | `index.html` + `runtime.js` |
| JS backend | `build for javascript backend` | `server.js` (Express) |
| Python backend | `build for python backend` | `server.py` (FastAPI) |
| Full-stack (web + JS) | `build for web and javascript backend` | All three |
| Full-stack (web + Python) | `build for web and python backend` | `index.html` + `server.py` |

## Compiler Passes

1. **Tokenize** (`tokenizer.js`): Source text -> token stream. Longest-match synonym resolution via `synonyms.js`.
2. **Parse** (`parser.js`): Token stream -> AST. `parseBlock()` recursively handles indentation.
3. **Validate** (`validator.js`): AST -> errors. Forward references, types, config checks.
4. **Compile** (`compiler.js`): AST -> output code. `compileNode()` + `exprToCode()` with context object.

Context object: `{ lang, indent, declared, stateVars, mode, filterItemPrefix, streamMode }`

## Node Types (96 total)

### Core Language

| Node Type | Syntax | Compiles To |
|-----------|--------|-------------|
| `THEME` | `theme 'midnight'` / `theme 'ivory'` / `theme 'nova'` | Sets `data-theme` on `<html>` |
| `ASSIGN` | `x = 5` / `name is 'Alice'` / `define x as: expr` | `const x = 5` / `x = 5` |
| `SHOW` | `show x` / `display x as dollars` | `console.log(x)` / `print(x)` |
| `IF_THEN` | `if x is 5 then show 'yes'` / `if x is 5:` block | `if (x === 5) { ... }` |
| `FUNCTION_DEF` | `double(x) = x * 2` / `define function greet(name):` | `function double(x) { return x * 2; }` |
| `RETURN` | `return value` | `return value;` |
| `REPEAT` | `repeat 5 times:` | `for (let _i = 0; _i < 5; _i++) { ... }` |
| `FOR_EACH` | `for each item in items list:` | `for (const item of items) { ... }` |
| `WHILE` | `while count is less than 10:` | `while (count < 10) { ... }` |
| `BREAK` | `stop` / `break` | `break;` |
| `CONTINUE` | `skip` / `continue` | `continue;` |
| `COMMENT` | `# text` | `// text` / `# text` |
| `TRY_HANDLE` | `try:` + `if there's an error:` | `try { ... } catch (e) { ... }` |
| `USE` | `use 'helpers'` / `use double from 'helpers'` / `use everything from 'helpers'` / `use 'lib' from './lib.js'` | Module import (namespaced, selective, inline-all, or external JS) |
| `SCRIPT` | `script:` + indented block | Raw JS escape hatch (emitted as-is) |
| `STORE` | `store settings` / `store settings as 'prefs'` | Save to localStorage (JSON) |
| `RESTORE` | `restore settings` / `restore settings as 'prefs'` | Load from localStorage (JSON) |

### Scheduled Agents

Agents can run on a timer instead of receiving input:

```
agent 'Daily Report' runs every 1 day:
  set leads to get all Leads where status is 'new'
  send back leads
```

Schedule units: `second`, `minute`, `hour`, `day`. Compiles to `setInterval`.
| `MATCH` | `match x:` + `when 'a':` + `otherwise:` | `switch` / `if-else chain` |
| `MATCH_WHEN` | `when 'value':` (inside match) | `case 'value':` |

### Expression Nodes

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `LITERAL_NUMBER` | `42`, `3.14` | |
| `LITERAL_STRING` | `'hello'` | Single or double quotes |
| `LITERAL_BOOLEAN` | `true`, `false` | |
| `LITERAL_NOTHING` | `nothing` | `null` / `None` |
| `LITERAL_LIST` | `['a', 'b']` | |
| `LITERAL_RECORD` | `create person:` + fields | Object literal |
| `VARIABLE_REF` | `name` | |
| `MEMBER_ACCESS` | `person's name` | Possessive or dot |
| `BINARY_OP` | `+`, `-`, `*`, `/`, `%`, `^`, comparisons, `and`, `or` | |
| `UNARY_OP` | `not x` | |
| `CALL` | `greet('Alice')` | |
| `MAP_GET` | `get key from scope` | Dynamic key access |
| `MAP_SET` | `set key in scope to value` | Dynamic key write |

### List Operations

| Node Type | Syntax | Compiles To |
|-----------|--------|-------------|
| `LIST_PUSH` | `add item to items` | `.push(item)` / `.append(item)` |
| `LIST_REMOVE` | `remove item from items` | `.filter(x => x !== item)` |
| `LIST_SORT` | `sort items by field` / `sort items by field descending` | `.sort()` |

### Web Frontend (Phase 4-7)

| Node Type | Syntax | HTML Output |
|-----------|--------|-------------|
| `PAGE` | `page 'Title' at '/route':` | `<title>` + hash router |
| `ASK_FOR` | `'Label' is a text input that saves to var` | `<input>` with label |
| `DISPLAY` | `display x as dollars called 'Label'` / `display x as table showing a, b with delete` | `<output>` or `<table>` with action buttons |
| `CHART` | `chart 'Title' as line showing data` / `chart 'Status' as pie showing data by field` | ECharts `<div>` with auto-configured option |
| `BUTTON` | `button 'Click':` + body | `<button>` + event handler |
| `SECTION` | `section 'Name' with style card:` | `<div>` with CSS class |
| `CONTENT` | `heading 'X'` / `text 'X'` / `bold text 'X'` / `divider` | `<h1>` / `<p>` / `<hr>` |
| `STYLE_DEF` | `style card:` + properties | CSS class definition |
| `ON_PAGE_LOAD` | `on page load:` + body | Runs after DOM ready |
| `NAVIGATE` | `go to '/path'` | `location.hash = '/path'` |
| `COMPONENT_DEF` | `define component Card receiving content:` | Reusable HTML function |
| `COMPONENT_USE` | `show Card(arg)` / `show Card:` + content | Component invocation |

### Backend (Phase 5-6)

| Node Type | Syntax | Express / FastAPI |
|-----------|--------|-------------------|
| `ENDPOINT` | `when user calls GET /api/path:` | `app.get('/api/path', ...)` |
| `RESPOND` | `send back data` / `send back data status 201` | `res.json(data)` |
| `REQUIRES_AUTH` | `this endpoint requires auth` | JWT middleware check |
| `REQUIRES_ROLE` | `this endpoint requires role 'admin'` | Role check middleware |
| `GUARD` | `guard stock > 0 or 'Out of stock'` | Conditional 400 response |
| `LOG_REQUESTS` | `log every request` | Request logging middleware |
| `ALLOW_CORS` | `allow cross-origin requests` | CORS headers |

### Data (Phase 9)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `DATA_SHAPE` | `create a Users table:` + fields | Table schema with constraints |
| `CRUD` | `save X as User` / `look up all records in Users table` / `remove from Users where ...` | In-memory DB or SQL |

Field modifiers: `required`, `unique`, `default VALUE`, `auto` (timestamp), `(number)` type hint, FK by capitalized name.

### Validation (Phase 16)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `VALIDATE` | `validate post_data:` + field rules | Per-field 400 checks |
| `FIELD_RULE` | `name is text, required, min 1, max 100` | Inside validate block |
| `RESPONDS_WITH` | `responds with:` + field types | Response schema doc |
| `RATE_LIMIT` | `rate limit 10 per minute` | Request throttling |

### Webhooks & Auth (Phase 17)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `WEBHOOK` | `webhook '/stripe/events' signed with env('SECRET'):` | HMAC verification |
| `OAUTH_CONFIG` | `oauth 'github':` + config | OAuth2 redirect flow |

### Billing (Phase 18)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `CHECKOUT` | `checkout 'Pro Plan':` + price, mode, URLs | Stripe session |
| `USAGE_LIMIT` | `limit 'api_calls':` + tier rules | Usage tracking |

### Files & External (Phase 19)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `ACCEPT_FILE` | `accept file:` + max size, allowed types | Multer / UploadFile |
| `EXTERNAL_FETCH` | `data from 'url':` + timeout, cache, fallback | AbortController / httpx |

### Real-time (Phase 20)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `STREAM` | `stream:` + `send back 'event'` | SSE |
| `BACKGROUND` | `background 'name':` + `runs every 1 hour` | setInterval / asyncio |
| `SUBSCRIBE` | `subscribe to 'channel':` | WebSocket |
| `MIGRATION` | `update database:` + ALTER TABLE ops | SQL migration |
| `WAIT` | `wait 500ms` | setTimeout / sleep |

### File I/O & Primitives (Phase 21)

| Node Type | Syntax | JS | Python |
|-----------|--------|----|----|
| `FILE_OP` (read) | `read file 'path'` | `fs.readFileSync` | `open().read()` |
| `FILE_OP` (write) | `write file 'path' with data` | `fs.writeFileSync` | `open("w")` |
| `FILE_OP` (append) | `append to file 'path' with data` | `fs.appendFileSync` | `open("a")` |
| `FILE_OP` (exists) | `file exists 'path'` | `fs.existsSync` | `os.path.exists` |
| `JSON_PARSE` | `parse json text` | `JSON.parse` | `json.loads` |
| `JSON_STRINGIFY` | `to json data` | `JSON.stringify` | `json.dumps` |
| `REGEX_FIND` | `find pattern '[0-9]+' in text` | `RegExp.match` | `re.findall` |
| `REGEX_MATCH` | `matches pattern '^[a-z]+$' in text` | `RegExp.test` | `re.search` |
| `REGEX_REPLACE` | `replace pattern '\s+' in text with ' '` | `String.replace` | `re.sub` |
| `CURRENT_TIME` | `current time` | `new Date()` | `datetime.now()` |
| `FORMAT_DATE` | `format date now as 'YYYY-MM-DD'` | Custom formatter | `strftime` |
| `DAYS_BETWEEN` | `days between start and end` | `Math.abs(diff/86400000)` | `abs(.days)` |

### Data Operations (Phase 22)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `LOAD_CSV` | `load csv 'path'` | Parse CSV into array of objects |
| `SAVE_CSV` | `save csv 'path' with data` | Write objects to CSV |
| `FILTER` | `filter list where field op value` | Array.filter / comprehension |
| `GROUP_BY` | `group by field in list` | Group into object of arrays |
| `COUNT_BY` | `count by field in list` | Count per group |
| `UNIQUE_VALUES` | `unique values of field in list` | Distinct values |

### Adapters (Phases 23-27)

| Node Type | Syntax | JS | Python |
|-----------|--------|----|----|
| `CONNECT_DB` | `connect to database:` + config | `pg.Pool` | `asyncpg` |
| `RAW_QUERY` | `query 'SQL' with params` | `pool.query` | `pool.fetch` |
| `CONFIGURE_EMAIL` | `configure email:` + config | `nodemailer` | `smtplib` |
| `SEND_EMAIL` | `send email:` + to/subject/body | `sendMail` | `send_message` |
| `FETCH_PAGE` | `fetch page 'url'` | `axios.get` | `requests.get` |
| `FIND_ELEMENTS` | `find all/first 'selector' in html` | `cheerio` | `beautifulsoup` |
| `CREATE_PDF` | `create pdf 'path':` + content elements | `pdfkit` | `reportlab` |
| `TRAIN_MODEL` | `train model on data predicting target` | REST to Python | `sklearn` |
| `PREDICT` | `predict with model using features` | REST to Python | `model.predict` |

### Advanced (Phase 28)

| Node Type | Syntax | JS | Python |
|-----------|--------|----|----|
| `TEXT_BLOCK` | `msg is text block:` + indented lines | Template literal | f-string triple-quote |
| `DO_ALL` | `results = do all:` + tasks | `Promise.all` | `asyncio.gather` |

### Agent Primitives

| Node Type | Canonical Syntax | Terse Alias | JS |
|-----------|-----------------|-------------|-----|
| `AGENT` | `agent 'Name' receiving data:` + body | (same) | `async function agent_name(data) { ... }` |
| `ASK_AI` | `set answer to ask ai 'prompt' with context` | `answer = ask ai 'prompt' with context` | `await _askAI("prompt", context)` |
| `ASK_AI` (structured) | `set result to ask ai 'prompt' with context returning:` + fields | (same) | `await _askAI("prompt", context, schema)` |
| `RUN_AGENT` | `set result to call 'Name' with data` | `result = call 'Name' with data` | `await agent_name(data)` |
| `GUARD` | `check X is not missing, otherwise error 'msg'` | `guard X is not nothing or 'msg'` | `throw new Error("msg")` (in agent) / `res.status(403)` (in endpoint) |

`missing` is a synonym for `nothing` (null). Both work everywhere.

**Structured AI output:** Add `returning:` after the `ask ai` call with an indented block of fields.
Each field is `name` (defaults to text) or `name (type)` where type is `text`, `number`, `boolean`, or `list`.
The runtime appends a JSON schema instruction to the prompt and parses the AI's JSON response into an object.
```
set result to ask ai 'Analyze this' with data returning:
  score (number)
  reasoning
  qualified (boolean)
# result.score, result.reasoning, result.qualified are now accessible
```

Env: `CLEAR_AI_KEY` -- Anthropic API key for `ask ai` calls (BYOK).
Optional: `CLEAR_AI_ENDPOINT` -- custom endpoint (defaults to Anthropic API).

### Syntax v2 Shorthands

| Syntax | Equivalent | Notes |
|--------|-----------|-------|
| `all_todos = get all Todos` | `look up all records in Todos table` | CRUD shorthand |
| `new_todo = save X as new Todo` | `save X as Todo` | "new" is optional clarity |
| `send back X with success message` | `send back X status 201` | Wraps with `message` field |
| `delete the Todo with this id` | `remove from Todos where id is incoming's id` | URL param auto-bound |
| `get todos from '/api/url'` | `get from '/api/url'` (into magic response) | Named state target |
| `sending post_data` | `receiving post_data` | User perspective canonical |
| `saved as a todo` | `saves to todo` | With optional article |
| `display X showing col1, col2` | `display X as table` | Column whitelist |
| `send X as a new Y to URL` | `send X to URL` | Decorative clause ignored |
| `'Hello, {name}!'` | `'Hello, ' + name + '!'` | String interpolation |

### Database Declaration

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `DATABASE_DECL` | `database is local memory` | Comment only (default) |
| `DATABASE_DECL` | `database is supabase` | @supabase/supabase-js client (SUPABASE_URL + SUPABASE_ANON_KEY) |
| `DATABASE_DECL` | `database is PostgreSQL at env('URL')` | pg.Pool / asyncpg |
| `DATABASE_DECL` | `database is SQLite at 'file.db'` | sqlite3 connection |

### Interactive Layout Patterns

| Node Type | Syntax | HTML Output |
|-----------|--------|-------------|
| `TAB` | `tab 'Name':` (inside tabs section) | DaisyUI tab panel |
| `PANEL_ACTION` | `toggle the Help panel` | Visibility toggle JS |
| `PANEL_ACTION` | `open the Confirm modal` | `dialog.showModal()` |
| `PANEL_ACTION` | `close modal` | `dialog.close()` |

Section modifiers (inline):
| Modifier | What it produces |
|----------|-----------------|
| `as tabs` | Tab bar + switchable panels |
| `as modal` | `<dialog>` with backdrop |
| `slides in from right` | Fixed panel, hidden by default |
| `collapsible` | Clickable header toggles content |
| `starts closed` | Content hidden by default |

### Inline Layout Modifiers

| Modifier | CSS |
|----------|-----|
| `two column layout` | `display: grid; grid-template-columns: 1fr 1fr` |
| `three column layout` | 3-column grid |
| `full height` | `height: 100vh` |
| `scrollable` | `overflow-y: auto` |
| `fills remaining space` | `flex: 1` |
| `sticky at top` | `position: sticky; top: 0; z-index: 10` |
| `side by side` | `display: flex; flex-direction: row` |
| `stacked` | `display: flex; flex-direction: column` |
| `dark background` | Dark bg + light text |
| `Npx wide` | `width: Npx; flex-shrink: 0` |
| `with shadow` | Box shadow |
| `padded` | `padding: 1.5rem` |
| `centered` | `max-width: 800px; margin: auto` |

### Built-in Style Presets (DaisyUI)

Presets are defined in `BUILTIN_PRESET_CLASSES` in compiler.js. Referenced via `with style name:`.
User can override by defining `style name:` in their file. Presets emit DaisyUI/Tailwind classes
directly -- no custom CSS generated. See `design-system.md` and `ai-build-instructions.md` for
the full token system.

**Landing page presets:**

| Preset | DaisyUI/Tailwind Classes |
|--------|------------------------|
| `page_hero` | `bg-neutral text-neutral-content py-20 px-4 text-center` |
| `page_section` | `py-16 px-4 bg-base-100` |
| `page_section_dark` | `py-16 px-4 bg-neutral text-neutral-content` |
| `page_card` | `card bg-base-200 border border-base-300/50 rounded-2xl p-8` |
| `hero` | Same as `page_hero` |
| `section_light` | Same as `page_section` |
| `section_dark` | Same as `page_section_dark` |
| `card` | `card bg-base-200 border border-base-300/50 rounded-xl p-6` |

**App/dashboard presets:**

| Preset | DaisyUI/Tailwind Classes |
|--------|------------------------|
| `app_layout` | `h-screen flex bg-base-100` (flex container for sidebar + main) |
| `app_sidebar` | `menu p-4 w-60 min-h-full bg-base-200 border-r border-base-300/50 text-sm` |
| `app_main` | `flex flex-col flex-1 min-w-0` (column wrapper for header + content) |
| `app_content` | `flex-1 p-6 bg-base-100 overflow-y-auto` |
| `app_header` | `navbar bg-base-200 border-b border-base-300/50 px-4 h-14 sticky top-0 z-30` |
| `app_card` | `card bg-base-200 border border-base-300/50 rounded-xl p-5` |

App presets skip the max-width inner wrapper (unlike landing page presets) since they
participate in flex layout. When app presets are detected, the outer `<main>` gets no
constraining class and `<body>` uses `bg-base-100`.

### Design System

- **Stack:** HTML + vanilla JS + Tailwind CSS v4 (CDN) + DaisyUI v5
- **Default theme:** `data-theme="ivory"` -- light enterprise, clean, trustworthy
- **Available themes:** `midnight` (dark SaaS), `ivory` (light enterprise), `nova` (AI/creative)
- **Full spec:** `design-system.md` (color tokens, typography, spacing, shadows, animation)
- **AI instructions:** `ai-build-instructions.md` (component patterns, hard rules, CDN imports)
- **Component output:** headings use `text-3xl font-bold tracking-tight`, text uses `text-base text-base-content/80 leading-relaxed`, buttons use `btn btn-primary`, inputs use `input input-bordered bg-base-200`, tables use `table table-sm` with rounded border containers, code blocks use `bg-neutral text-neutral-content rounded-xl`

## Synonym Table (synonyms.js)

Canonical names map to arrays of aliases. The tokenizer does longest-match greedy resolution.

**Collision risks documented:**
- `count by` collides with `increase count by 1` -- uses token sequence detection, not synonym
- `send email` collides with `send email to '/api'` -- parser detects block form vs API call
- `find all` / `find first` -- parsed by token sequence, not synonym (avoids collision with `find pattern`)
- `toggle` is a synonym for `checkbox` -- parser guards `toggle the X panel` vs bare `toggle`
- `delete` is a synonym for `remove` -- `delete the X with this id` detected before list remove
- `get` maps to `get_key` (map access) -- `get all X` and `get X from URL` detected before map get
- `sending` is a synonym for `receiving` -- both work, `sending` is canonical

## Reserved Keywords

Single-word: `a`, `an`, `the`, `in`, `on`, `to`, `by`, `as`, `at`

Multi-word keywords that can shadow variable names: `page` (page declaration), `heading`/`subheading`/`text` (content elements), `button`, `section`, `style`, `divider`

## Validation Rules

1. **Forward references**: Variables must be defined before use (except in functions)
2. **Type checking**: Arithmetic on non-numbers, string ops on non-strings
3. **Config validation**: `env('KEY')` requires the key to exist in clear.config
4. **BUILTINS whitelist**: Internal functions (`_map_prop`, `_first`, etc.) must be in validator BUILTINS set

## File Structure

| File | Purpose | Lines |
|------|---------|-------|
| `tokenizer.js` | Lexer with synonym resolution | ~200 |
| `synonyms.js` | Canonical -> alias mappings | ~370 |
| `parser.js` | Recursive descent parser | ~4500 |
| `compiler.js` | Code generation (5 paths) | ~2500 |
| `validator.js` | AST validation (3 passes) | ~200 |
| `clear.test.js` | 1089 tests | ~11500 |
| `cli/clear.js` | CLI for AI agents: build, check, info, fix, lint, serve | ~500 |
| `runtime/db.js` | In-memory DB with JSON persistence | ~300 |
| `runtime/auth.js` | JWT auth + middleware | ~120 |
| `runtime/rateLimit.js` | Request rate limiting | ~50 |

## Apps (Stress Tests)

| App | Lines | What It Proves |
|-----|-------|---------------|
| `todo-api` | 37 | CRUD, validation, auth |
| `blog-api` | 60 | Auth guards, RBAC, email validation |
| `url-shortener` | 34 | Rate limiting, unique constraints |
| `ecommerce-api` | 96 | Stripe checkout, webhooks, inventory |
| `saas-billing` | 66 | Subscription tiers, usage limits |
| `webhook-relay` | 62 | Multi-provider webhooks, background jobs |
| `chat-backend` | 57 | WebSocket, heartbeat, connection management |
| `job-queue` | 52 | Background jobs, CRUD with RBAC |
| `live-dashboard` | 46 | SSE streaming, metric aggregation |
| `cast-api` | 106 | Cast's own API in Clear |
| `landing-page` | 57 | Multi-page routing, forms, styles |
| `full-saas` | 134 | Frontend + backend + billing + auth |
| `cast-evaluator` | 604 | Recursive tree-walking interpreter |
| `clear-landing` | 185 | Clear's own landing page in Clear |
| `project-manager` | 175 | 6 tables, deep FK chains, full-stack, 36/36 E2E |
| `invoice-engine` | 175 | Backend-only: status machine, business logic, 27/27 E2E |
