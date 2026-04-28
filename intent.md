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

## Node Types (171 total)

### Core Language

| Node Type | Syntax | Compiles To |
|-----------|--------|-------------|
| `THEME` | `theme 'midnight'` / `theme 'ivory'` / `theme 'nova'` | Sets `data-theme` on `<html>` |
| `ASSIGN` | `x = 5` / `name is 'Alice'` / `define x as: expr` | `const x = 5` / `x = 5` |
| `SHOW` | `show x` / `display x as dollars` | `console.log(x)` / `print(x)` |
| `IF_THEN` | `if x is 5 then show 'yes'` / `if x is 5:` block | `if (x === 5) { ... }` |
| `FUNCTION_DEF` | `define function greet(name):` / `define function add(a is number, b is number) returns number:` | `function greet(name) { ... }` — typed params emit JSDoc `@param`/`@returns`. Self-recursive functions are auto-wrapped in a depth counter (default 1000; override via `max depth N`). |
| `RETURN` | `return value` | `return value;` |
| `REPEAT` | `repeat 5 times:` | `for (let _i = 0; _i < 5; _i++) { ... }` |
| `FOR_EACH` | `for each item in items:` / `for each key, value in map:` | `for (const item of items)` / `for (const [key, value] of Object.entries(map))` |
| `MAP_KEYS` | `keys of map` (expression) | `Object.keys(map)` |
| `MAP_VALUES` | `values of map` (expression) | `Object.values(map)` |
| `MAP_EXISTS` | `'key' exists in map` (expression) | `Object.prototype.hasOwnProperty.call(map, 'key')` |
| `MAP_APPLY` | `apply fn to each in list` (expression) | `list.map(fn)` |
| `FILTER_APPLY` | `filter list using fn` (expression) | `list.filter(fn)` |
| `WHILE` | `while count is less than 10, max 50 times:` (default cap 100 if `, max N times` omitted — tight so hangs fail fast) | `{ let _iter=0; while (count < 10) { if (++_iter > 50) throw ...; } }` |
| `REPEAT_UNTIL` | `repeat until score is greater than 8, max 3 times:` | `for (let _i = 0; _i < 3; _i++) { ... if (score > 8) break; }` |
| `BREAK` | `stop` / `break` | `break;` |
| `CONTINUE` | `skip` / `continue` | `continue;` |
| `COMMENT` | `# text` | `// text` / `# text` |
| `TRY_HANDLE` | `try:` + `if error:` / `if error 'not found':` + optional `finally:` / `always do:` | `try { ... } catch (_err) { ... } finally { ... }` — typed handlers emit status checks; multiple handlers chain as `if/else if/else`; finally always runs |
| `LIVE_BLOCK` | `live:` + indented body — explicit effect fence (Path B Phase 1, 2026-04-25). Body holds calls that talk to the world (`ask claude`, `call API`, `subscribe to`, timers). Phase B-1 is permissive: any statement is allowed inside. Phase B-2 will reject effect-shaped calls outside `live:`. See PHILOSOPHY.md Rule 18. | Body emits inline with a `// live: block — explicit effect fence` comment marker. No runtime semantics yet — fence is signal for the validator and the human reader. |
| `THROW` | `send error 'message'` / `throw error` / `fail with` / `raise error` | `throw new Error('message')` (JS) / `raise Exception('message')` (Python) — custom errors from any context |
| `LITERAL_STRING` (interpolated) | `'Hello, {name}!'` | `` `Hello, ${name}!` `` (JS) / `f"Hello, {name}!"` (Python) |
| `USE` | `use 'helpers'` / `use double from 'helpers'` / `use everything from 'helpers'` / `use 'lib' from './lib.js'` | Module import (namespaced, selective, inline-all, or external JS) |
| `SCRIPT` | `script:` + indented block | Raw JS escape hatch (emitted as-is) |
| `STORE` | `store settings` / `store settings as 'prefs'` | Save to localStorage (JSON) |
| `RESTORE` | `restore settings` / `restore settings as 'prefs'` | Load from localStorage (JSON) |
| `TOAST` | `show toast 'message'` / `show alert 'message'` | Toast notification UI |
| `TRANSACTION` | `transaction:` + block | Atomic database operations (begin/commit/rollback) |
| `RETRY` | `retry 3 times:` + block | Retry loop with catch |
| `TIMEOUT` | `with timeout 5 seconds:` + block | `Promise.race` with timeout |
| `RACE` | `first to finish:` + block | `Promise.race` |
| `REFRESH` | `refresh` / `reload` | `window.location.reload()` |

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
| `PLACEHOLDER` | `TBD` (statement OR expression) | Lean Lesson 1 — drop anywhere a value or block can go. Compiles green. Runtime emits `throw new Error("placeholder hit at line N — fill it in or remove it")` (or `raise Exception(...)` in Python). Test harness catches that exact message and reports SKIPPED, not FAILED. `result.placeholders` lists every TBD line. |
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
| `PAGE` | `page 'Title' at '/route':` | `<title>` + pathname router (reads `location.pathname`, falls back to hash, intercepts same-origin `<a>` clicks for SPA nav). Each declared route also gets an `app.get('/route', res.sendFile('index.html', { root: __dirname }))` handler so direct URLs / refresh work. |
| `ASK_FOR` | `'Label' is a text input that saves to var` — also supports: `text area`, `text editor` (Quill WYSIWYG via CDN, toolbar + live `_state` binding), `number input`, `dropdown with ['a','b']`, `checkbox`, `file input` | `<input>` / `<textarea>` / `<div data-clear-rich-text>` / `<select>` |
| `DISPLAY` | `display x as dollars called 'Label'` / `display x as table showing a, b with delete` / `display x as chat showing role, content` | `<output>` or `<table>` with action buttons, or chat bubble component |
| `CHART` | `chart 'Title' as line showing data` / `chart 'Status' as pie showing data by field` | ECharts `<div>` with auto-configured option |
| `STAT_STRIP` | `stat strip:` + stat cards | Responsive KPI card row |
| `STAT_CARD` | `stat card 'Pending Count':` + `value EXPR`, optional `delta 'TEXT'`, `sparkline [1, 2, 3]`, `icon 'inbox'` | Polished KPI card with label, value, delta, optional sparkline and Lucide icon |
| `DETAIL_PANEL` | `detail panel for selected_deal:` + indented content + optional `actions:` | 340px right rail populated from the selected table row; body can contain normal Clear UI primitives, with sticky action buttons at bottom |
| `BUTTON` | `button 'Click':` + body | `<button>` + event handler |
| `SECTION` | `section 'Name' with style card:` | `<div>` with CSS class |
| `CONTENT` | `heading 'X'` / `text 'X'` / `bold text 'X'` / `divider` | `<h1>` / `<p>` / `<hr>` |
| `STYLE_DEF` | `style card:` + properties | CSS class definition |
| `ON_PAGE_LOAD` | `on page load:` + body | Runs after DOM ready |
| `NAVIGATE` | `go to '/path'` | `location.hash = '/path'` |
| `COMPONENT_DEF` | `define component Card receiving content:` | Reusable HTML function |
| `COMPONENT_USE` | `show Card(arg)` / `show Card:` + content | Component invocation |
| `HIDE_ELEMENT` | `hide X` | Toggle element visibility |
| `CLIPBOARD_COPY` | `copy X to clipboard` | Clipboard API |
| `DOWNLOAD_FILE` | `download X as 'filename'` | Trigger file download |
| `LOADING_ACTION` | `show loading` / `hide loading` | Loading indicator |
| `ON_CHANGE` | `when X changes:` + block | Reactive input handler |

### Backend (Phase 5-6)

| Node Type | Syntax | Express / FastAPI |
|-----------|--------|-------------------|
| `ENDPOINT` | `when user requests data from /api/todos:` (GET), `when user sends todo to /api/todos:` (POST — receiving var is singular entity name), `when user updates todo at /api/todos/:id:` (PUT), `when user deletes todo at /api/todos/:id:` (DELETE) | `app.get('/api/todos', ...)` / `app.post(...)` / `app.put(...)` / `app.delete(...)`. Old syntax `when user calls METHOD /path:` still works as synonym. |
| `RESPOND` | `send back content` / `send back content status 201` | `res.json(data)` |
| `REQUIRES_AUTH` | `this endpoint requires auth` | JWT middleware check |
| `REQUIRES_ROLE` | `this endpoint requires role 'admin'` | Role check middleware |
| `GUARD` | `guard stock > 0 or 'Out of stock'` | Conditional 400 response |
| `LOG_REQUESTS` | `log every request` | Request logging middleware |
| `ALLOW_CORS` | `allow cross-origin requests` | CORS headers |
| `DEPLOY` | `deploy to vercel` / `deploy to netlify` | Deployment directive |
| `DEFINE_ROLE` | `define role 'editor':` + permissions | Role definition for RBAC |
| `RUN_COMMAND` | `run command 'shell cmd'` | `child_process.exec` / `subprocess.run` |

### Data (Phase 9)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `DATA_SHAPE` | `create a Users table:` \| `table Users:` \| `create data shape User:` + fields | Table schema with constraints. All three lead forms parse identically. Field declarations accept both `price, number` and `name is text`. |
| `CRUD` | `save X as User` / `look up all records in Users table` / `remove from Users where ...` | In-memory DB or SQL. **`look up all` / `get all` caps results at 50 by default.** Use `look up every` / `get every` to return all rows. |
| `SQL_AGGREGATE` | `sum of price from Orders` / `avg of score from Reviews where team is 'support'` | Server-side aggregation: compiles to `db.aggregate(table, fn, field, filter)` → `SELECT FN(col) FROM ... WHERE ...`. Distinguished from `sum of X in variable` (client-side JS reduce) by capitalized table name after `from`. Only supports equality filters (`is X`, `is 'Y' and Z is W`) — non-equality like `>` emits a runtime error. |

Field modifiers: `required`, `unique`, `default VALUE`, `auto` (timestamp), `hidden`, `renamed to NEW_NAME`, `(number)` type hint, FK by capitalized name.

**`hidden` and `renamed to` (Phase B Live App Editing)** — `a notes, hidden` keeps the column in the database but strips it from API responses and UI renderers; `db.findAll` / `findOne` filter hidden fields by default (opt-in `{ includeHidden: true }` for admin/backend code). `a notes, hidden, renamed to reason` marks an old field hidden and records the new name — paired with a separately-declared `reason` field, this is how renames preserve data via expand + copy + hide. Both modifiers are classified as `reversible` by the change classifier — un-hiding is a one-line source edit.

**`owner is 'email'` (top-level declaration, Phase A Live App Editing)** — pins which email address signs up as `role: 'owner'` instead of the default `role: 'user'`. Only the owner sees the in-browser Meph edit widget; every other user sees the app normally. Emits `const _OWNER_EMAIL = '…';` at the top of the compiled server and conditionally sets role on signup. Without this declaration, `allow signup and login` produces apps where no user can ever reach the widget — the safe default when the Clear author hasn't decided who owns the app. Parser node: `OWNER_DECL`.

### Validation (Phase 16)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `VALIDATE` | `validate article:` + field rules | Per-field 400 checks |
| `FIELD_RULE` | `name is text, required, min 1, max 100` | Inside validate block |
| `RESPONDS_WITH` | `responds with:` + field types | Response schema doc |
| `RATE_LIMIT` | `rate limit 10 per minute` | Request throttling |

### Webhooks & Auth (Phase 17)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `WEBHOOK` | `webhook '/stripe/events' signed with env('SECRET'):` | HMAC verification |

(`OAUTH_CONFIG` removed 2026-04-21 — zero app usage. Use a record literal instead, or the `allow signup and login` JWT scaffold.)

### Billing (Phase 18)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `CHECKOUT` | `checkout 'Pro Plan':` + price, mode, URLs | **Deprecated** (2026-04-25) — emits a JS const that no Clear code can reach. Validator suggests `create pro_plan_checkout: ...` (a real Clear binding). Still parses for back-compat. |

(`USAGE_LIMIT` removed 2026-04-21 — zero app usage. Use a record literal for tier definitions instead.)

### Files & External (Phase 19)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `ACCEPT_FILE` | `accept file:` + max size, allowed types | Multer / UploadFile |
| `EXTERNAL_FETCH` | `data from 'url':` + timeout, cache, fallback | AbortController / httpx |
| `UPLOAD_TO` | `upload file to 's3-bucket'` | File upload to cloud storage |
| `LOGIN_ACTION` | `login with 'google'` | Social login redirect flow |

### Real-time (Phase 20)

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `STREAM` | `stream:` + `send back 'event'` | SSE |
| `STREAM_AI` | `stream ask claude 'prompt' with context` | SSE streaming of AI response, token-by-token |
| `BACKGROUND` | `background 'name':` + `runs every 1 hour` | setInterval / asyncio |
| `CRON` | `every day at '9:00 AM':` + block | node-cron scheduled execution |
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
| `SEND_EMAIL` | `send email:` + to/subject/body (optional `with timeout N seconds`, default 30s) | `Promise.race(sendMail, setTimeout(reject))` | `smtplib.SMTP_SSL(..., timeout=30)` |
| `FETCH_PAGE` | `fetch page 'url'` | `axios.get` | `requests.get` |
| `FIND_ELEMENTS` | `find all/first 'selector' in html` | `cheerio` | `beautifulsoup` |
| `CREATE_PDF` | `create pdf 'path':` + content elements | `pdfkit` | `reportlab` |
| `TRAIN_MODEL` | `train model on data predicting target` | REST to Python | `sklearn` |
| `PREDICT` | `predict with model using features` | REST to Python | `model.predict` |

### Service Integrations (Phase 45)

| Node Type | Syntax | JS |
|-----------|--------|-----|
| `HTTP_REQUEST` | `send to 'url':` + method/headers/body config | `fetch()` with options |
| `SERVICE_CALL` (stripe) | `charge via stripe:` + amount/currency/token | `fetch('https://api.stripe.com/v1/charges', ...)` |
| `SERVICE_CALL` (sendgrid) | `send email via sendgrid:` + to/from/subject/body | `fetch('https://api.sendgrid.com/v3/mail/send', ...)` |
| `SERVICE_CALL` (twilio) | `send sms via twilio:` + to/body | `fetch('https://api.twilio.com/...', ...)` |

Service calls use direct REST API calls via `fetch()`, not SDK imports. Auth via env vars: `STRIPE_KEY`, `SENDGRID_KEY`, `TWILIO_SID`/`TWILIO_TOKEN`.

### Advanced (Phase 28)

| Node Type | Syntax | JS | Python |
|-----------|--------|----|----|
| `TEXT_BLOCK` | `msg is text block:` + indented lines | Template literal | f-string triple-quote |
| `DO_ALL` | `results = do all:` + tasks | `Promise.all` | `asyncio.gather` |

### Agent Primitives

| Node Type | Canonical Syntax | Terse Alias | JS |
|-----------|-----------------|-------------|-----|
| `AGENT` | `agent 'Name' receives data:` + body | (same) | `async function agent_name(data) { ... }` |
| `ASK_AI` | `set answer to ask ai 'prompt' with context` | `answer = ask ai 'prompt' with context` | `await _askAI("prompt", context)` |
| `ASK_AI` (structured) | `set result to ask ai 'prompt' with context returning JSON text:` + fields | (same) | `await _askAI("prompt", context, schema)` |
| `RUN_AGENT` | `set result to call 'Name' with data` | `result = call 'Name' with data` | `await agent_name(data)` |
| `GUARD` | `check X is not missing, otherwise error 'msg'` | `guard X is not nothing or 'msg'` | `throw new Error("msg")` (in agent) / `res.status(403)` (in endpoint) |
| `PARALLEL_AGENTS` | `do these at the same time:` + assignments | (same) | `const [a, b] = await Promise.all([...])` |
| `PIPELINE` | `pipeline 'Name' with var:` + steps (`'Agent'` or `stepname with 'Agent'`) | (same) | `async function pipeline_name(var) { ... }` |
| `RUN_PIPELINE` | `result = call pipeline 'Name' with data` | (same) | `await pipeline_name(data)` |
| `SKILL` | `skill 'Name':` + `has tool(s):` + `instructions:` | (same) | Compile-time merge into agent |
| `HUMAN_CONFIRM` | `ask user to confirm 'message'` | (same) | Approvals table insert + 202 response |
| `MOCK_AI` | `mock claude responding:` + fields (in test) | (same) | `_askAI` override with mock |
| `EVAL_DEF` | `eval 'name':` + `given 'Agent' receives X` / `call POST '/path' with X` + `expect '<rubric>'` / `expect output has fields` | (same) | Merged into `result.evalSuite` with `source: 'user-top'`. Runner POSTs the input and grades via Claude (or Gemini/OpenAI if `EVAL_PROVIDER` set). |
| `CLASSIFY` | `intent = classify X as 'a', 'b', 'c'` | (same) | `await _classifyIntent(X, ['a','b','c'])` — Claude Haiku |
| `ASK_AI` (multi-context) | `ask ai 'prompt' with X, Y, Z` | (same) | `await _askAI(prompt, JSON.stringify({X, Y, Z}))` |

Agent directives (metadata on AGENT node, not separate nodes):

| Directive | What it does |
|-----------|-------------|
| `has tools: fn1, fn2` | Tool use — maps functions to Anthropic tool_use API |
| `uses skills: 'Skill1', 'Skill2'` | Merges skill tools + instructions into agent |
| `must not:` + policies | Compile-time guardrails + runtime limits |
| `remember conversation context` | DB-backed multi-turn conversation history |
| `remember user's preferences` | Per-user long-term memory |
| `track agent decisions` | Observability — logs _askAI calls with timing |
| `knows about: Table1, Table2` | RAG — keyword search over DB tables before prompting |
| `knows about: 'https://url'` | RAG — fetch page text at startup, keyword search |
| `knows about: 'file.pdf'` | RAG — read PDF/DOCX/TXT/MD at startup, keyword search |
| `evals:` + `scenario 'name': input is X; expect Y` | User-defined per-agent eval scenarios. Compiler attaches as `agent.evalScenarios[]`; merged into `result.evalSuite` with `source: 'user-agent'`. Scenario input overrides the auto-probe for that entry. |

**Agent eval suite.** Every agent gets two evals (role + format) generated automatically from its source definition; every POST endpoint that calls an agent gets an E2E eval. Internal agents are reachable via synthetic `/_eval/agent_<name>` handlers emitted only when `compileProgram(source, { evalMode: true })` is set — Studio compiles in eval mode for the dedicated eval child, production builds compile without. Probes are built from receiving-var name + matching table schema + prompt noun-hints (priority order). LLM-graded role/E2E evals dispatch to Anthropic (default), Google Gemini, or OpenAI based on `EVAL_PROVIDER`. `result.evalSuite` is the structured spec list; `/api/run-eval` runs all or one; `/api/export-eval-report` generates downloadable markdown or CSV. User-defined evals via top-level `eval 'name':` blocks (EVAL_DEF) and per-agent `evals:` subsections.

**Multi-agent orchestration.** Five patterns compose the primitives above:
1. **Sequential chain** — nest `RUN_AGENT` calls inside an `AGENT` body, each step consumes the prior.
2. **Parallel fan-out** — `PARALLEL_AGENTS` (`do these at the same time:`). Known arity, all concurrent (`Promise.all`).
3. **Dynamic fan-out** — `FOR_EACH` with `RUN_AGENT` inside + `LIST_PUSH` accumulator. Runtime-sized list, serial per item.
4. **Pipeline** — `PIPELINE` + `RUN_PIPELINE`. Named reusable linear chain, same value threads through each step.
5. **Iterative refinement** — `REPEAT_UNTIL` (`repeat until X, max N times:`). Body runs, condition is checked at end-of-iteration, breaks early when true. Hard cap prevents plateau-loops. Canonical for agent self-refinement (draft → critic → revise).

Text agents stream by default (`async function*`). When a non-streaming caller
uses `RUN_AGENT` against a streaming callee, the compiler wraps the call with
an inline generator-drain IIFE so the caller receives the concatenated string,
not the async iterator. Callers that themselves stream can chain streams directly.

### App-Level Policies (Enact Guards)

| Node Type | Syntax | Compiles To |
|-----------|--------|-------------|
| `POLICY` | `policy:` + indented rules | Runtime guard middleware wrapping db operations |

30+ built-in policy rules: `block schema changes`, `block deletes without filter`, `protect tables: X`, `block prompt injection`, `require role 'admin'`, `no mass emails`, `block file types: '.env'`, `code freeze active`, `block push to main`, etc.

### Workflow Primitives (Phases 85-90)

| Node Type | Syntax | Compiles To |
|-----------|--------|-------------|
| `WORKFLOW` | `workflow 'Name' with state:` + directives + steps | `async function workflow_name(state) { ... }` |
| `RUN_WORKFLOW` | `result = run workflow 'Name' with data` | `await workflow_name(data)` |

Workflow directives (metadata on WORKFLOW node):

| Directive | What it does |
|-----------|-------------|
| `state has:` + fields | Define workflow state shape with types and defaults |
| `runs durably` (canonical) / `runs on temporal` (legacy) | Durable workflow — emits Temporal SDK on Node target, Cloudflare Workflows on `--target cloudflare` |
| `save progress to TableName table` | DB checkpoint at each step |
| `track workflow progress` | State history array logged after each step |

Workflow step types (inside workflow body):

| Step | Syntax | Compiles To |
|------|--------|-------------|
| Step | `step 'Name' with 'Agent'` | `_state = await agent_name(_state)` |
| Step with save | `step 'Name' with 'Agent' saves to state's field` | `_state.field = await agent_name(_state)` |
| Conditional | `if state's field is value:` + steps | `if (_state.field == value) { ... }` |
| Repeat | `repeat until condition, max N times:` + steps | `for (_iter < N) { if (cond) break; ... }` |
| Parallel | `at the same time:` + steps | `Promise.all([...])` |

### Approval Queue Primitives (Phase 91)

| Node Type | Syntax | Compiles To |
|-----------|--------|-------------|
| `QUEUE_DEF` | `queue for <entity>:` + indented body | Auto-generated audit table, optional notification queue table, filtered GET handler, per-action PUT handlers (auth-gated), CSV export URL (`GET /api/<entity>/export.csv`). Suppress CSV with `no export` clause inside the body. |
| `EMAIL_TRIGGER` | `email <role> when <entity>'s status changes to <value>:` + indented body (`subject is`, `body is`, `provider is`, `track replies as`) | Top-level block. Auto-emits the shared `workflow_email_queue` table once per app. Queue auto-PUT handlers whose terminal status matches the trigger value also inject an email-queue row (Phase 4.1). Real provider sends deferred behind `enable live email delivery via X` directive. |

Queue body clauses:

| Clause | What it does |
|--------|-------------|
| `reviewer is 'Role'` | Stamps `decided_by` on every audit row |
| `actions: a, b, c` | Each action becomes a `PUT /api/<entity>s/:id/<action>` handler |
| `notify <role> on <action>, <action>` | Inserts a row into the notifications queue for those actions |

**Given:** a `Deals` table with a `status` field and the block:
```
queue for deal:
  reviewer is 'CRO'
  actions: approve, reject, counter, awaiting customer
  notify customer on counter, awaiting customer
  notify rep on approve, reject
```

**The compiler emits:**
- A `deal_decisions` audit table — `deal_id`, `decision`, `decided_by`, `decided_at`, `decision_note`.
- A `deal_notifications` outbound queue table — `deal_id`, `recipient_role`, `recipient_email`, `notification_type`, `queue_status`, `queued_at`. Skipped when no `notify` clauses.
- `GET /api/deals/queue` — filtered by `status = 'pending'` (the default open status).
- `GET /api/deal-decisions` — full audit history.
- `GET /api/deal-notifications` — notification log.
- `PUT /api/deals/:id/<action>` for each action — slugifies multi-word actions (`awaiting customer` → `/awaiting`). Each handler: requires login, updates `Deals.status` to the action's terminal value, inserts an audit row, inserts notification rows for any matching `notify` clause, returns the updated record.

**Status-transition map:** `approve` → `'approved'`, `reject` → `'rejected'`, `counter` → `'awaiting'`, `awaiting customer` → `'awaiting'`. Custom action names use the action name itself as the status.

**Recipient-email convention:** `notify customer on ...` resolves recipient_email by reading `<entity>.customer_email`. If the entity has no `<role>_email` field, the validator warns; the row is still queued with a blank email.

UI auto-render (Phase 4 of the queue plan) is deferred: app authors hand-add buttons that call the auto-generated PUT URLs. Backend, audit, notifications, and tests are fully generated.

### Testing (Phases 46b, 84)

| Node Type | Syntax | Compiles To |
|-----------|--------|-------------|
| `TEST_DEF` | `test 'name':` + body | Named test function in E2E test file |
| `TEST_DEF` | `test:` + body | Nameless test — first body line becomes test name |
| `UNIT_ASSERT` | `expect x is 5` | Value-level assertion — `_unitAssert(x, 'eq', 5, line, 'x')` |
| `UNIT_ASSERT` | `expect x is not 5` | Not-equal assertion |
| `UNIT_ASSERT` | `expect x is greater than 5` | Greater-than assertion |
| `UNIT_ASSERT` | `expect x is less than 5` | Less-than assertion |
| `UNIT_ASSERT` | `expect x is at least 5` | Greater-than-or-equal assertion |
| `UNIT_ASSERT` | `expect x is at most 5` | Less-than-or-equal assertion |
| `UNIT_ASSERT` | `expect x is empty` | Empty/null/zero-length check |
| `UNIT_ASSERT` | `expect x is not empty` | Non-empty check |
| `EXPECT` | `expect expr` (bare truthy) | Generic truthy assertion — use UNIT_ASSERT forms above instead |
| `HTTP_TEST_CALL` | `call POST /api/users with name is 'Alice'` | `fetch()` call with JSON body |
| `EXPECT_RESPONSE` | `expect response status is 201` | Status code assertion |
| `EXPECT_RESPONSE` | `expect response body has id` | Field existence check |
| `EXPECT_RESPONSE` | `expect response contains 'success'` | Body text search |
| `EXPECT_RESPONSE` | `expect it succeeds` | Assert 2xx status |
| `EXPECT_RESPONSE` | `expect it fails` | Assert non-2xx status |
| `EXPECT_RESPONSE` | `expect it requires login` | Assert 401 |
| `EXPECT_RESPONSE` | `expect it is rejected` | Assert 400 |
| `EXPECT_RESPONSE` | `expect it is not found` | Assert 404 |
| `EXPECT_RESPONSE` | `expect response has field` | Field exists in response body |
| `EXPECT_RESPONSE` | `expect variable has 'text'` | Variable contains substring |
| `MOCK_AI` | `mock claude responding:` + fields | `_askAI` override with mock |
| `TEST_INTENT` | `can user create a todo with title: 'Buy milk'` | HTTP POST + success assertion |
| `TEST_INTENT` | `can user view all todos` | HTTP GET + success assertion |
| `TEST_INTENT` | `can user delete a todo` | HTTP DELETE + success assertion |
| `TEST_INTENT` | `can user create a todo without a title` | HTTP POST without field + expects rejection |
| `TEST_INTENT` | `deleting a todo should require login` | HTTP DELETE without auth + 401 assertion |
| `TEST_INTENT` | `does the todos list show 'Buy groceries'` | GET + body contains assertion |
| `TEST_INTENT` | `can user ask agent 'Support' with message: 'hello'` | POST to agent endpoint + success assertion |

`TEST_INTENT` compiles to HTTP calls based on intent: `create` → POST, `view` → GET, `delete` → DELETE, `update` → PUT. The compiler auto-discovers endpoints and tables from the AST. `without a field` sets `expectFailure: true`. `X should require login` compiles to an unauthenticated request asserting 401.

Auto-generated tests use English names: "Creating a new todo succeeds" (not "POST /api/todos returns 201"), "Deleting a todo requires login" (not "DELETE /api/todos/:id without auth returns 401"), "User can create a todo and see it in the list" (CRUD flow), "The Helpdesk agent responds to messages" (agent smoke test).

`missing` is a synonym for `nothing` (null). Both work everywhere.

**Structured AI output:** Add `returning JSON text:` after the `ask ai` call with an indented block of fields.
Each field is `name` (defaults to text) or `name (type)` where type is `text`, `number`, `boolean`, or `list`.
The runtime appends a JSON schema instruction to the prompt and parses the AI's JSON response into an object.
`returning:` (without `JSON text`) also works for brevity.
```
set result to ask ai 'Analyze this' with data returning JSON text:
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
| `all_todos = get all Todos` | `look up all records in Todos table` | CRUD shorthand. **Default LIMIT 50** — use `get every Todo` for no limit. |
| `every_todo = get every Todo` | `look up every Todo` (no LIMIT) | Explicit opt-out of default 50-row cap |
| `total = sum of price from Orders` | `db.aggregate('orders', 'SUM', 'price', {})` | Server-side SQL aggregate (capitalized table name) |
| `paid = sum of price from Orders where status is 'paid'` | `db.aggregate('orders', 'SUM', 'price', { status: 'paid' })` | Filtered aggregate — equality only |
| `new_todo = save X as new Todo` | `save X as Todo` | "new" is optional clarity |
| `send back X with success message` | `send back X status 201` | Wraps with `message` field |
| `delete the Todo with this id` | `remove from Todos where id is incoming's id` | URL param auto-bound |
| `send back all Todos` | `x = get all Todos; send back x` | Inline retrieval shorthand (parser desugars to [CRUD, RESPOND]) |
| `send back the User with this id` | `x = look up User with this id; send back x` | Inline single-record lookup |
| `send back all Users where active is true` | `x = get all Users where active is true; send back x` | Inline filtered list |
| `this id` (in expression position) | `incoming?.id` | URL path param access, works anywhere in expressions |
| `this user_id` | `incoming?.user_id` | Same pattern for any named URL param |
| `get todos from '/api/url'` | `get from '/api/url'` (into magic response) | Named state target |
| `sending article` | `receiving article` | User perspective canonical |
| `saved as a todo` | `saves to todo` | With optional article |
| `display X showing col1, col2` | `display X as table` | Column whitelist |
| `display X as chat showing role, content` | Chat bubble UI | Full chat component: header, messages, typing indicator, scroll-to-bottom, textarea + Send button. Uses `_chatRender`, `_chatMd`, `_chatSend`/`_chatSendStream`, `_chatClear`. DaisyUI `.clear-chat-*` classes. Absorbs following text input + Send button into built-in UI. `showing` maps fields to role/content (defaults: `role, content`). Reactive: `_recompute()` calls `_chatRender()`. Auto-detects streaming agents: if POST endpoint calls a streaming agent, uses `_chatSendStream` (SSE token streaming) instead of `_chatSend`. |
| `send X as a new Y to URL` | `send X to URL` | Decorative clause ignored |
| `'Hello, {name}!'` | `'Hello, ' + name + '!'` | String interpolation |

### Database Declaration

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `DATABASE_DECL` | `database is local memory` | Comment only (default) |
| `DATABASE_DECL` | `database is supabase` | @supabase/supabase-js client (SUPABASE_URL + SUPABASE_ANON_KEY) |
| `DATABASE_DECL` | `database is PostgreSQL` / `database is PostgreSQL at env('URL')` | `runtime/db-postgres.js` — same API as SQLite, lazy table creation, uses `DATABASE_URL` env var |
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

**App/dashboard presets** (Phase 1-3 shell upgrade — 04-25-2026, modeled on
`landing/marcus-app-target.html`):

| Preset | HTML tag | Classes + inline style |
|--------|----------|------------------------|
| `app_layout` | `<div>` | `flex min-h-screen` (full-screen flex shell — page owns scroll) |
| `app_sidebar` | `<aside>` | `hairline-r flex-shrink-0 flex flex-col scroll-y` + `style="width:240px;background:var(--clear-bg-rail);"` |
| `app_main` | `<main>` | `flex-1 min-w-0 flex flex-col` |
| `app_header` | `<header>` | `hairline-b sticky top-0 z-30 flex items-center gap-4 px-5` + `style="height:56px;background:var(--clear-bg-canvas);"` (3 slots: brand / breadcrumb / actions, exposed via `data-clear-slot=`) |
| `app_content` | `<div>` | `flex-1 overflow-y-auto bg-base-200/50 p-6 space-y-6` |
| `app_card` | `<div>` | `bg-base-100 rounded-xl border border-base-300/40 shadow-sm p-5` |

**Sidebar navigation nodes** (Phase 2 shell upgrade):

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `NAV_SECTION` | `nav section 'Approvals':` | Labeled group inside `app_sidebar` |
| `NAV_ITEM` | `nav item 'Pending' to '/cro' with count pending_count with icon 'inbox'` | Linked sidebar row; optional count and Lucide icon; route-based active state |

**Page content chrome nodes** (Phase 3-4 shell upgrade):

| Node Type | Syntax | Notes |
|-----------|--------|-------|
| `PAGE_HEADER` | `page header 'CRO Review':` + `subtitle '5 deals waiting'` + `actions:` | Main content title row; optional subtitle and right-aligned button actions |
| `TAB_STRIP` | `tab strip:` + `tab 'Pending' to '/cro'` | Routed content tabs with underline active state |
| `ROUTE_TAB` | `tab 'Pending' to '/cro'` | One tab row inside a `tab strip`; optional `active tab is 'Pending'` hint |
| `STAT_STRIP` | `stat strip:` | Responsive KPI row inside `app_content` |
| `STAT_CARD` | `stat card 'Pending Count':` + `value pending_count`, optional `delta '+1.8 pts vs last week'`, `sparkline [3, 4, 6, 5, 8]`, `icon 'inbox'` | Dashboard stat card with value, trend copy, mini sparkline, and Lucide icon |

The shell tags use semantic HTML5 elements (`aside`, `main`, `header`) instead
of generic divs — better accessibility and matches the polished slate-on-ivory
mock chrome. CSS custom properties (`--clear-bg-rail`, `--clear-bg-canvas`,
`--clear-line`) come from the design tokens block in `compiler.js`'s
`CSS_RESET`. App presets skip the max-width inner wrapper (unlike landing page
presets) since they participate in flex layout.

`app_header` body content is auto-sorted into three slots when emitted:
- `heading` children → `data-clear-slot="brand"` (left)
- text/non-heading content → `data-clear-slot="breadcrumb"` (middle)
- `button` children → `data-clear-slot="actions"` (right, ml-auto)

Phase 6-7 of the shell upgrade plan add `detail panel`, Marcus app port, etc. —
see `plans/plan-full-shell-upgrade-04-25-2026.md`.

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
| `clear.test.js` | 2097 tests | ~11500 |
| `cli/clear.js` | CLI for AI agents: build, check, info, fix, lint, serve, test, deploy | ~600 |
| `runtime/db.js` | In-memory DB with JSON persistence | ~300 |
| `runtime/db-postgres.js` | Postgres adapter (same API as SQLite, lazy table creation) | ~200 |
| `runtime/auth.js` | JWT auth + middleware | ~120 |
| `runtime/rateLimit.js` | Request rate limiting | ~50 |

## Studio Capabilities (not language features)

These are Studio (`playground/server.js`) features, not Clear language primitives. They don't add node types — they add runtime behavior around already-compiled apps.

| Capability | Where | What it does |
|------------|-------|--------------|
| **Hosted deploy** | `playground/deploy.js`, `playground/builder/` | `POST /api/deploy` packages the current source, tars it, POSTs to a shared builder machine that runs `docker build` → `docker push registry.fly.io` → `flyctl deploy` and returns a live URL. Customer never sees Fly. |
| **One-click updates** (Cloudflare) | `playground/deploy-cloudflare.js:_deployUpdate`, `playground/deploy.js:/api/deploy` | When `/api/deploy` sees the app is already deployed, it routes through the incremental `mode: 'update'` path — re-uploads the Worker bundle only (no D1 reprovision, no domain reattach, no full secret push), records the new `versionId` against the tenant's `versions[]`, and returns in ~2s instead of ~12s. Schema changes (D1 SQL or `wrangler.toml`) are gated by `migrationsDiffer()` + a 409 `MIGRATION_REQUIRED` confirm round-trip. Per-app history capped at 20 entries; older versions stay on Cloudflare's side. |
| **AI proxy routing** | `playground/ai-proxy/` | Every `ask claude` in a deployed app routes through a metered proxy that holds the only Anthropic key. Usage attributed to the tenant, billed via Stripe metered add-on. |
| **Tenant + billing** | `playground/tenants.js`, `playground/billing.js` | One row per paying customer. Plan limits come from `plans.js`. Stripe Checkout creates tenants; webhook updates plan. Dedup'd by event_id so webhook replays don't double-bill. |
| **Multi-tenant isolation** | `playground/sanitize.js` | Every app name starts with `clear-<tenantSlug>-`. Rollback, history, cert endpoints assert ownership before calling the builder. Per-app Firecracker VM isolation is Fly's default. |

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
