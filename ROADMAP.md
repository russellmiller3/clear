# Clear Language — Roadmap

## Vision

1. **AI builds things fast.** Clear is the language AI writes. Short programs, deterministic compiler. The faster the write->compile->run->fix loop, the more it ships.
2. **Hostile to bugs.** Catch mistakes at compile time. If the compiler accepts it, it should work.
3. **Russell builds faster.** Describe what you want, get working software. Real apps with auth, data, AI agents, dashboards.

---

## What's Built

126 node types. 1850 compiler tests. Zero npm dependencies in the compiler.
Targets: JS (Express), Python (FastAPI), HTML (DaisyUI v5 + Tailwind v4).

### Core Language

| Feature | Syntax | Notes |
|---------|--------|-------|
| Variables | `x = 5` / `name is 'Alice'` | `=` for numbers, `is` for strings/booleans |
| Functions | `define function greet(name):` | Typed params (`is number`), typed returns |
| For-each loop | `for each item in items:` | Also `for each key, value in map:` |
| While loop | `while count is less than 10:` | |
| Repeat loop | `repeat 5 times:` | |
| If / else | `if x is 5:` ... `otherwise:` | Also inline: `if x is 5 then show 'yes'` |
| Match / when | `match x:` + `when 'a':` + `otherwise:` | Pattern matching |
| Try / catch | `try:` + `if error:` | Typed handlers: `if error 'not found':` (404) |
| Break / continue | `stop` / `skip` | |
| Comments | `# text` | |
| Modules | `use 'helpers'` | Namespaced, selective, or inline-all |
| Script escape | `script:` + raw JS | For anything Clear doesn't cover |
| Transactions | `as one operation:` | BEGIN/COMMIT/ROLLBACK |

### Expressions

| Feature | Syntax | Notes |
|---------|--------|-------|
| Math | `+` `-` `*` `/` `%` `^` | |
| Comparisons | `is greater than`, `is at least`, etc. | Also `is`, `is not` |
| Boolean logic | `and`, `or`, `not` | |
| String interpolation | `'Hello, {name}!'` | Any expression inside `{}` |
| String concat | `'Hello, ' + name` | |
| Lists | `['a', 'b', 'c']` | Add, remove, sort, length |
| Records | `create person:` + indented fields | |
| Possessive access | `user's name` | Also dot: `user.name` |
| Map operations | `get key from scope` / `set key in scope to value` | Also `exists in`, `keys of`, `values of` |
| Higher-order | `apply fn to each in list` / `filter list using fn` | |
| Optional chaining | `user?.name` | Auto-generated for possessive access |

### Web Frontend

| Feature | Syntax | Notes |
|---------|--------|-------|
| Pages | `page 'Dashboard' at '/admin':` | Hash routing, auto-slug from title |
| Reactive state | Variables auto-update UI | |
| Text input | `'Name' is a text input saved as name` | |
| Number input | `'Price' is a number input saved as price` | |
| Dropdown | `'Role' is a dropdown input saved as role` | With options list |
| Checkbox | `'Active' is a checkbox input saved as active` | |
| Textarea | `'Bio' is a textarea input saved as bio` | |
| File input | `'Upload' is a file input saved as doc` | |
| Buttons | `button 'Save':` + action block | |
| Sections | `section 'Results':` | With style presets |
| Tabs | `tab 'Settings':` | Auto-grouped |
| Components | `define component Card receiving content:` | Reusable, parameterized |
| Conditional UI | `if logged_in:` + content block | |
| On change | `when search changes:` | Also debounced: `after 250ms` |
| On page load | `on page load get todos from '/api/todos'` | Inline or block form |
| Navigate | `go to '/dashboard'` | |

| Display Format | Syntax | Output |
|----------------|--------|--------|
| Table | `display X as table showing col1, col2` | HTML table |
| Cards | `display X as cards showing name, description` | Card grid |
| List | `display X as list` | Bullet list |
| Currency | `display X as dollars` | `$1,234.56` |
| Percentage | `display X as percent` | `45%` |
| Date | `display X as date` | Formatted date |
| JSON | `display X as json` | Pretty-printed |
| Gallery | `display X as gallery` | Image grid |
| Map | `display X as map` | Leaflet map |
| Calendar | `display X as calendar` | Month grid |
| QR code | `display X as qr` | QR code image |
| Count | `display X as count` | Number badge |

| Chart Type | Syntax | Engine |
|------------|--------|--------|
| Line | `line chart 'Revenue' showing data` | ECharts |
| Bar | `bar chart 'Sales' showing data` | ECharts |
| Pie | `pie chart 'Breakdown' showing data` | ECharts |
| Area | `area chart 'Trend' showing data` | ECharts |

| UI Action | Syntax | Notes |
|-----------|--------|-------|
| Toast | `show toast 'Saved!'` | Also `show alert`, `show notification` |
| Show/hide | `hide the sidebar` | Toggle element visibility |
| Loading | `show loading` / `hide loading` | Overlay spinner |
| Clipboard | `copy X to clipboard` | |
| Download | `download X as 'report.csv'` | |
| Refresh | `refresh` | Page reload |
| Video | `video from 'url'` | HTML5 player |
| Audio | `audio from 'url'` | HTML5 player |

### Backend (JS + Python)

| Feature | Syntax | Notes |
|---------|--------|-------|
| GET endpoint | `when user calls GET /api/users:` | |
| POST endpoint | `when user calls POST /api/users sending data:` | `sending` = `receiving` |
| PUT endpoint | `when user calls PUT /api/users:id sending data:` | URL params auto-bound |
| DELETE endpoint | `when user calls DELETE /api/users:id:` | |
| Send response | `send back data` / `send back data with success message` | Status 200/201 |
| Auth scaffold | `allow signup and login` | JWT + bcrypt, 3 endpoints |
| Requires login | `requires login` | JWT middleware check |
| Requires role | `requires role 'admin'` | Role-based access |
| Define role | `define role 'editor':` + permissions | Custom RBAC |
| Guard | `guard stock > 0 or 'Out of stock'` | Conditional 400 |
| Validate | `validate data:` + field rules | Per-field 400 errors |
| Rate limit | `rate limit 10 per minute` | Request throttling |
| CORS | `allow cross-origin requests` | |
| Log requests | `log every request` | |
| Webhooks | `webhook '/stripe' signed with env('SECRET'):` | HMAC verification |
| File uploads | `accept file:` + max size, allowed types | Multer |
| External fetch | `data from 'url':` + timeout, cache, fallback | |
| HTTP requests | `send to 'url':` + method, headers, body | GET/POST/PUT/DELETE |
| Email (SMTP) | `send email:` + to, subject, body | Nodemailer |
| Email config | `configure email:` + service, user, password | |
| PDF generation | `create pdf 'report.pdf':` + content | pdfkit / reportlab |
| Shell commands | `run command 'git pull'` | Also capture: `result = run command '...'` |
| SSE streaming | `stream:` + `send back 'event'` | Server-sent events |
| Deploy | `deploy to vercel` / `deploy to netlify` | Deployment directive |

### Database & CRUD

| Feature | Syntax | Notes |
|---------|--------|-------|
| Database backend | `database is local memory` / `supabase` / `PostgreSQL` / `SQLite` | |
| Create table | `create a Users table:` + fields | Types, constraints, defaults |
| Save (insert) | `save data as new User` | |
| Look up one | `look up User where id is 5` | |
| Look up all | `look up all Users` / `get all Users` | Optional `where` clause |
| Delete | `delete the User with this id` | |
| Update | `save data to Users` | |
| Belongs to | `author belongs to Users` | Foreign key |
| Has many | `Users has many Posts` | Auto-generates nested GET endpoint |
| Search | `search Posts for query` | Case-insensitive full-text |
| Aggregates | `sum of amount in Orders` | Also `avg of`, `count of`, `min of`, `max of` |
| Connect to DB | `connect to database:` + config | PostgreSQL pool |
| Raw SQL | `query 'SELECT * FROM users' with params` | |

### Service Integrations (SERVICE_CALL)

| Service | Syntax | Env Vars |
|---------|--------|----------|
| Stripe | `charge via stripe:` + amount, currency, token | `STRIPE_KEY` |
| SendGrid | `send email via sendgrid:` + to, from, subject, body | `SENDGRID_KEY` |
| Twilio | `send sms via twilio:` + to, body | `TWILIO_SID`, `TWILIO_TOKEN` |

All compile to direct REST `fetch()` calls. No SDK required.

### Data Operations

| Feature | Syntax | Notes |
|---------|--------|-------|
| Load CSV | `load csv 'data.csv'` | Parse into array of objects |
| Save CSV | `save csv 'export.csv' with data` | Write objects to CSV |
| Filter | `filter list where field op value` | Array.filter |
| Group by | `group by field in list` | Object of arrays |
| Count by | `count by field in list` | Count per group |
| Unique values | `unique values of field in list` | Distinct values |
| JSON parse | `parse json text` | |
| JSON stringify | `to json data` | |
| Regex find | `find pattern '[0-9]+' in text` | Extract matches |
| Regex match | `matches pattern '^[a-z]+$' in text` | Boolean test |
| Regex replace | `replace pattern '\s+' in text with ' '` | Substitute |
| Current time | `current time` / `current date` | |
| Format date | `format date now as 'YYYY-MM-DD'` | |
| Days between | `days between start and end` | |

### AI Agents

| Feature | Syntax | Notes |
|---------|--------|-------|
| Agent definition | `agent 'Name' receives data:` | Async function |
| Ask Claude | `response = ask claude 'prompt' with context` | Also `ask ai` |
| Structured output | `ask claude 'prompt' with X returning JSON text:` + fields | Schema enforcement |
| Tool use | `has tools: fn1, fn2` | Anthropic tool_use API |
| Skills | `skill 'Name':` + `has tool(s):` + `instructions:` | Reusable tool bundles |
| Uses skills | `uses skills: 'Lookup', 'Email'` | Merge into agent |
| Pipelines | `pipeline 'Name' with var:` + agent steps | Sequential chain |
| Parallel agents | `do these at the same time:` + calls | Promise.all |
| Conversation memory | `remember conversation context` | DB-backed history |
| User memory | `remember user's preferences` | Per-user long-term |
| RAG | `knows about: Products, FAQs` | Keyword search before prompting |
| Guardrails | `block arguments matching 'drop\|truncate'` | Regex filter on tool inputs |
| Policies | `must not:` + rules | Compile-time guardrails |
| Observability | `track agent decisions` | Logs _askAI calls with timing |
| Human approval | `ask user to confirm 'message'` | Approval workflow |
| Mock AI | `mock claude responding:` + fields | Test infrastructure |
| Model selection | `ask claude 'prompt' with X using 'model'` | |
| Streaming | Auto-streams by default in endpoints | Opt out: `do not stream` |
| Scheduled agents | `agent 'Name' runs every 1 hour:` | setInterval |
| Run agent | `result = call 'Name' with data` | Works inside endpoints AND inside other agents (coordinator pattern) |
| Run pipeline | `result = call pipeline 'Name' with data` | |
| Dynamic fan-out | `for each x in list: r = call 'A' with x; add r to results` | Loop over runtime-sized list, accumulate |
| Agent evals button | Studio IDE "Run Evals" next to "Run Tests" | Cost-gated modal before run; per-row cost chips; running total. Each row individually re-runnable. |
| Auto-generated eval suite | Per-agent role + format + per-endpoint E2E | Built from receiving-var name + table schema + prompt noun-hints; no `'hello'` probes on core templates |
| User-defined evals | `eval 'name':` top-level + `evals:` agent subsection | Two syntaxes; both produce specs in `result.evalSuite`; merge with auto-generated rows in the same Tests pane |
| Export eval report | Markdown + CSV download from Tests pane | Grouped by agent, full criteria + input + output + grader feedback; CSV one-row-per-eval for spreadsheets / regression diffing |
| Multi-provider grader | `EVAL_PROVIDER` env var | Anthropic (default), Google Gemini, OpenAI. Breaks Claude-grading-Claude when set to google/openai. Per-provider pricing baked in. |
| Eval child orchestration | Dedicated port 4999, 60s keepalive, mutex serialization, SIGINT cleanup, DB wipe per full run | Run-All + per-row Run never race; Ctrl-C doesn't orphan; deterministic fresh-state runs |
| Synthetic agent endpoints | `compileProgram(source, { evalMode: true })` emits `/_eval/agent_<name>` natively | Internal agents become individually graddable without polluting the production app. Validator rejects user routes that collide with /_eval/* prefix. |
| Coordinator drains streams | `call 'StreamingAgent'` from a non-streaming caller | Compiler wraps with generator-drain IIFE — coordinator sees the final string, not an async iterator |

### Workflows

| Feature | Syntax | Notes |
|---------|--------|-------|
| Workflow definition | `workflow 'Name' with state:` | Multi-step process |
| State shape | `state has:` + field definitions | Typed state |
| Step | `step 'Name' with 'Agent'` | Delegates to agent |
| Step with save | `step 'Name' with 'Agent' saves to state's field` | |
| Conditional step | `if state's field is value:` + steps | |
| Repeat until | `repeat until condition, max N times:` + steps | |
| Parallel steps | `at the same time:` + steps | |
| Durable execution | `runs on temporal` | Temporal.io |
| Progress tracking | `track workflow progress` | State history |
| Checkpoint | `save progress to Table` | DB persistence |
| Run workflow | `result = run workflow 'Name' with data` | |

### Scheduling

| Feature | Syntax | Compiles To |
|---------|--------|-------------|
| Interval | `every 5 minutes:` + block | `setInterval` |
| Daily schedule | `every day at 9am:` + block | Cron-style scheduler |
| Scheduled agent | `agent 'Name' runs every 1 hour:` | `setInterval` in agent |
| Background job | `background 'cleanup':` + `runs every 1 hour` | `setInterval` |

### Testing

| Feature | Syntax | Notes |
|---------|--------|-------|
| Test block | `test 'name':` + body | Named test |
| Nameless test | `test:` + body | First body line becomes the test name — zero redundancy |
| Expect | `expect result is 42` | Equality assertion |
| HTTP test call | `call POST /api/users with name is 'Alice'` | |
| Expect response | `expect response status 201` | Also `expect response body has id` |
| Intent-based test | `can user create a todo with title is 'Buy milk'` | English-readable, auto-discovers endpoints |
| Auth intent test | `does deleting a todo require login` | Asserts 401 without auth |
| Agent intent test | `can user ask agent 'Support' with message is 'hello'` | Agent smoke test |
| Semantic expects | `expect it succeeds` / `fails` / `requires login` / `is rejected` | Status code assertions |
| Mock AI | `mock claude responding:` + fields | Override `_askAI` |

### Policies (App-Level Guards)

30+ built-in rules:

| Rule | What it does |
|------|-------------|
| `block schema changes` | Prevents ALTER TABLE |
| `block deletes without filter` | No bulk deletes |
| `protect tables: Users` | Whitelist-only access |
| `block prompt injection` | Input sanitization |
| `require role 'admin'` | Global role gate |
| `no mass emails` | Block multi-recipient sends |
| `block file types: '.env'` | Reject dangerous uploads |
| `code freeze active` | Block all writes |

### Studio IDE

| Feature | Notes |
|---------|-------|
| Three-panel layout | CodeMirror editor + preview/terminal + Claude agent chat |
| 43 template apps | Dropdown selector |
| Light/dark theme | Toggle |
| Save to Desktop | Download .clear file |
| Compile + run + test | All from browser |
| Source maps | Click preview element -> jumps to Clear source line |
| AI assistant (Meph) | Builds, compiles, fixes apps via tool use |

---

## Recently Completed

| Feature | Syntax | Status |
|---------|--------|--------|
| Intent classification | `classify X as 'a', 'b', 'c'` | Done — Claude Haiku call |
| Extended RAG | `knows about: 'https://url'`, `'file.pdf'`, `'doc.docx'` | Done — URLs + files + tables |
| Send email inline | `send email to X:` + subject/body block | Done |
| Scheduled at time | `runs every 1 day at '9:00 AM'` | Done — node-cron |
| `find all` synonym | `find all Orders where status is 'active'` | Done |
| `today` literal | `where created_at is today` | Done |
| Multi-context ask ai | `ask ai 'prompt' with X, Y, Z` | Done |
| Store-ops GAN target | 230-line e-commerce agent demo | Done — compiles + runs |
| Error throwing | `send error 'message'` / `throw error` / `fail with` / `raise error` | Done — P1 |
| Finally blocks | `try:` ... `finally:` / `always do:` / `after everything:` | Done — P2 |
| First-class functions | Pass function refs as arguments | Done — P3, works natively |
| Async function await | User-defined async fns auto-get `await` at call sites | Done — pre-scan + transitive |
| Postgres adapter | `database is PostgreSQL` → `pg.Pool` runtime adapter | Done — `runtime/db-postgres.js`, same API as SQLite |
| Railway deploy | `clear deploy app.clear` → package + `railway up` | Done — auto-detects db backend, correct deps |
| Studio Test Runner | Tests tab in IDE with Run App/Compiler buttons | Done — `/api/run-tests`, Meph `run_tests` tool |
| Intent-based tests | `can user create/view/delete`, `does X require login`, `expect it succeeds` | Done — `TEST_INTENT` + extended `EXPECT_RESPONSE` |
| English test names | Auto-generated tests use readable names ("Creating a todo succeeds") | Done — `generateE2ETests` rewrite |
| CRUD flow tests | "User can create a todo and see it in the list" | Done — auto-generated from table + endpoint AST |
| `dbBackend` field | `compileProgram()` exposes `result.dbBackend` | Done — used by CLI deploy/package |
| Nameless test blocks | `test:` + body (first line = name) | Done — zero-redundancy test syntax |
| Auto-test on Run | Tests auto-run when Run clicked, switch to Tests tab on failure | Done — Studio IDE integration |
| Test runner rewrite | `clear test` starts server, installs deps, shares JWT | Done — replaces legacy test extraction |
| Studio Bridge | Shared iframe between user + Meph via postMessage | Done — `?clear-bridge=1` / `<meta name="clear-bridge">` gate, compiler-injected |
| Bridge tools | `read_actions`, `read_dom` + `click/fill/inspect/read_storage` via bridge | Done — replaces separate Playwright page |
| Friendly test failures | Plain-English errors with hints for 200/201/204/400/401/403/404/409/422/429/5xx | Done — `_expectStatus`/`_expectBodyHas`/etc helpers |
| Click-to-source on failures | `[clear:N]` tag in error → IDE jumps editor to line | Done — `parseTestOutput` extracts `sourceLine` |
| Fix with Meph button | Failure row → submit `{name, error, sourceLine, snippet}` to Meph | Done — auto-prompts in chat |
| Meph sees user test runs | IDE snapshots `testResults` into chat body | Done — `buildSystemWithContext` appends to system prompt |
| Unified terminal timeline | `[stdout]`/`[stderr]`/`[user]`/`[browser]`/`[meph]` interleaved | Done — single `terminalBuffer`, mirrored from all sources |
| Fix Windows libuv shutdown | Single SIGTERM handler awaits browser close before exit | Done — eliminates `UV_HANDLE_CLOSING` assertion |
| Meph tool eval | 16-scenario script + Meph self-report per tool | Done — `playground/eval-meph.js`, 15/15 verified |
| `incoming` scanner walks wrapper nodes | SEARCH/FILTER `.query` field now triggers binding | Done — `incoming?.q` in compiled output now has matching `const incoming = req.query` |
| User-test HTTP path tokenizer fix | `/api/todos` no longer collapses to `/` in `_lastCall` | Done — friendly errors show real path |
| E2E auth helper | JWT signed via node crypto + pinned `JWT_SECRET` on child spawn | Done — 77/77 pass with `requires login` POSTs |
| `highlight_code` tool case | Was missing from executeTool switch | Done — found by Meph eval self-report |
| Rich text editor input | `'Body' is a text editor saved as body` | Done — Quill via CDN, toolbar, live `_state` binding |
| Multi-page Express routing | `page 'X' at '/new':` emits `app.get('/new', ...)` | Done — previously only `/` was served so direct URLs 404'd |
| Client-side pathname router | Reads `location.pathname`, falls back to hash, intercepts `<a>` clicks for SPA nav | Done — was hash-only, broke every multi-page app on refresh |
| Studio route selector | Dropdown above preview listing every `page 'X' at '/route'` | Done — includes back/forward/refresh, full-stack apps use real http iframe (not srcdoc) |
| Layout nesting warning | `page_hero`/`page_section` inside `app_layout` → compiler warning | Done — silent clipping trap now caught |
| Honest test labels | `UI: ...` vs `Endpoint: ...` based on real UI detection | Done — walks AST for `API_CALL` POSTs in pages, renames flow tests accordingly |
| Unwired-endpoint warning | POST endpoint with validation but no UI button wired → warning | Done — emitted with the endpoint's line number |
| `send X as a new post to URL` parser fix | Greedy `post to` synonym was eating resource word, dropping entire send line | Done — respond handler accepts `post_to`/`put_to`/`get_from`/`delete_from` as URL connectors |
| Express 5 `sendFile` root option | `res.sendFile(absolutePath)` 404'd on non-root URLs under send module | Done — switched to `{ root: __dirname }` form |
| Streaming is the default | `ask claude 'X' with Y` inside POST endpoint auto-streams; `get X from URL with Y` on frontend auto-reads SSE | Done — no `stream` keyword needed anywhere |
| Streaming opt-out | `without streaming` → single `res.json({ text })` response | Done — matching frontend auto-detects, uses plain POST + JSON |
| `_askAIStream` prompt bugfix | Parser used non-existent `NodeType.STRING_LITERAL`, compiler silently emitted `/* ERROR */` in every streaming endpoint | Done — fixed both code paths, `LITERAL_STRING` is correct |
| Compile badge in Studio | `NwordsClear → NwordsJS · Nx · Nms` toolbar chip + auto-tests badge | Done — visible proof of compiler leverage |

---

## What's Next

Ordered by impact. Two tracks: **language completeness** and **platform quality**.

### Language Completeness

Clear's job is: Russell tells an LLM what to build, the LLM writes Clear, it compiles to working software. If the LLM needs a feature to build what Russell asked for, Clear needs it.

| Priority | Feature | Syntax | Status |
|----------|---------|--------|--------|
| P1 | Error throwing | `send error 'message'` / `throw error` / `fail with` / `raise error` | **Done** |
| P2 | Finally block | `try:` ... `finally:` / `always do:` / `after everything:` | **Done** |
| P3 | First-class functions | `map_list(items, double)` — pass fn refs as args | **Done** (works natively) |
| P4 | Decorators / middleware | `before each endpoint:` | Skipped — built-in middleware covers use cases |
| P5 | `clear serve` ESM fix | `clear serve app.clear` | CLI serve crashes with `require is not defined` because project uses `"type": "module"`. Must output `.cjs` or use `createRequire`. |

### Platform Quality

| Priority | Feature | Notes |
|----------|---------|-------|
| P6 | Studio Test button | **Done.** Tests tab in preview pane. Run App Tests + Run Compiler Tests buttons. Meph `run_tests` tool. Structured pass/fail with error details. |
| P7 | ClearMan (API tester) | "Try it" button per endpoint in API tab. Postman built into Studio. |
| P8 | Compiler-generated tests | **Done.** Auto-generated E2E tests with English names, CRUD flow tests, agent smoke tests. |
| P9 | Multi-file download | Zip: `server.js` + `index.html` + `package.json`. Single files don't deploy. |
| P10 | `clear test` runner fix | User-written `test` blocks aren't picked up by `clear test` CLI (R5 in refactoring backlog). |

---

## Future (Not Committed)

| Feature | Syntax | Notes |
|---------|--------|-------|
| Stripe Checkout | `create checkout for 'Pro Plan' at 29.99 monthly:` | Subscriptions + hosted pages. Extends existing `charge via stripe:` |
| Supabase File Storage | `upload file to 'avatars' bucket` | Supabase Storage API |
| Supabase Auth | `allow login with magic link` / `with google` | Replace hand-rolled JWT |
| GAN Loop | Claude Code + Meph automated quality loop | Infrastructure exists, needs orchestration |
| Real RAG (pgvector) | Semantic search over unstructured text | Current `knows about:` is keyword-only |

---

## RL Training Environment (Speculative)

Clear's deterministic compiler, structured errors, constrained action space, and built-in test syntax make it a natural RL gym.

| Built | Status |
|-------|--------|
| Sandbox runner | Isolated child process, timeout, memory limit |
| Curriculum tasks | 20 benchmarks across 10 difficulty levels (63 tests) |
| Structured eval API | `compileProgram()` returns JSON scores, stats, warnings |
| Patch API | 11 structured edit operations = constrained action space |
| Source maps | Runtime errors map to Clear line numbers |
| HTTP test assertions | `call POST /path`, `expect response status` = reward function |

**Blocker:** No fine-tuning access. The gym is ready but can't train athletes in it yet.

---

## Refactoring Backlog

| ID | What | When |
|----|------|------|
| R1 | Decompose `compileAgent()` — 300-line monolith, 7 feature sections mutating strings via regex. Extract helpers: `applyToolUse()`, `applyMemory()`, `applyRAG()`, etc. | Before adding more agent features |
| R2 | Deduplicate JS/Python CRUD — parallel logic, bugs in one missed in other. Shared intermediate representation. | When Python support becomes priority |
| R3 | Frontend source maps | **Done.** `data-clear-line="N"` on every HTML element. |
| R4 | Skill instruction raw text — tokenizer destroys parentheses and punctuation in skill `instructions:` blocks. Parser should store `.raw` line text instead of reconstructing from tokens. Partially fixed (now uses `.raw` when available) but tokenizer still eats some formatting. | Before shipping store-ops demo |
| R5 | `clear test` runner doesn't include user-written `test` blocks — only compiler-generated e2e tests. User tests compile into `serverJS` but the `.clear-test-runner.cjs` skips them. Needs unified test extraction. | Before shipping store-ops demo |
| R6 | All `[^)]*` regex patterns in `compileAgent()` are fragile — break when prompts contain literal parentheses. Two instances fixed (tool-use injection, agent-log wrapping) but more may exist. The real fix is R1 (decompose compileAgent into helpers that don't use regex string surgery). | Part of R1 |
| R7 | **`needs login` frontend guard is broken.** Pages with `needs login` compile to blank white pages — the JWT check hides everything but doesn't show a login form or redirect to `/login`. Should either generate an auto-login page or redirect. This is a **serious user-facing bug** — any app using `needs login` on a page shows nothing. | ASAP |
| R8 | **`for each` loop body in HTML doesn't render child content.** A loop like `for each msg in messages: section with style card: text msg's role` compiles to `+ msg +` (whole object as string) instead of expanding the child template. Workaround: use `display X as cards showing field1, field2`. | Before demo polish |

---

## Not Building

| Feature | Reason |
|---------|--------|
| OAuth / social login | `allow signup and login` covers MVPs. OAuth is a rat's nest. |
| Cookies | JWT is the right auth pattern for Clear apps. |
| Upsert | `save` + `get first where` is 2 lines. |
| Soft delete | `deleted_at` field + filter. Not worth a keyword. |
| Geolocation | One-liner `script:` call. Niche browser API. |
| Camera / microphone | One-liner `script:` call. Niche. |
| Speech to text | One-liner `script:` call. Niche. |
| Text to speech | One-liner `script:` call. Niche. |
| Push notifications | Service workers + VAPID keys. Too much plumbing. |
| Drag and drop | HTML5 events via `script:`. Niche. |
| Infinite scroll | IntersectionObserver via `script:`. Performance concern, not language feature. |

---

## What You Can Build

### Tier 1 — Ship in an hour, no `script:` needed

| Category | Examples |
|----------|---------|
| Admin dashboards | CRUD, roles, search, charts, aggregate stats |
| AI agents | RAG, tool use, memory, pipelines, guardrails, structured output |
| SaaS MVPs | Auth, validation, email, scheduling, webhooks |
| Data apps | CSV import, filter, chart, export |
| Chat apps | `display as chat` with markdown, typing dots, scroll, input absorption |

### Tier 2 — 90%+ Clear, minor `script:` for edge cases

| App | What needs `script:` |
|-----|---------------------|
| Project management | Drag-and-drop kanban |
| Blog / CMS | Rich text editing |
| Chat apps | ~~Scroll-to-bottom, typing indicators~~ **Moved to Tier 1** — `display as chat` now includes scroll, typing dots, markdown rendering, input absorption |
| E-commerce | Stripe checkout flow |
| Monitoring | Slack/PagerDuty webhook format |

### Tier 3 — Wrong tool

| App | Why |
|-----|-----|
| Collaborative editing | Operational transforms, conflict resolution |
| Video / audio calls | WebRTC, media streams, STUN/TURN |
| Mobile apps | Clear targets web only |
| Games | Canvas/WebGL, physics, sprites |
| Social media feeds | Algorithmic ranking, infinite scroll, image pipelines |

---

## Compiler Guarantees — Bug Classes Eliminated at Compile Time

Every app compiled from Clear ships with these protections. Fix a pattern once, every app gets the fix on recompile.

### Security (compile errors — can't ship these bugs)

| Bug Class | How It's Prevented | Validator/Compiler |
|-----------|-------------------|-------------------|
| SQL injection | All CRUD uses parameterized queries, always | `compiler.js` — `db.insert()`, `db.query()` with param binding |
| Auth bypass | DELETE/PUT without `requires login` = compile ERROR | `validateSecurity()` — line 742 |
| Mass assignment | `_pick()` strips unknown fields from request body | `compiler.js` — generated `_pick()` helper |
| CSRF | Data-mutating endpoints without auth = error | `validateOWASP()` — line 1262 |
| Path traversal | File ops with variable paths = warning | `validateOWASP()` — line 1221 |
| PII in errors | Passwords/tokens/keys auto-redacted from error responses | `_clearError()` — `redact()` function |
| Sensitive field exposure | Schema has `password`/`secret`/`api_key` = warning | `validateSecurity()` — line 857 |
| Brute force | Login/signup without rate limiting = warning | `validateSecurity()` — line 836 |
| Overly permissive CORS | CORS enabled + no auth on endpoints = warning | `validateSecurity()` — line 876 |

### Correctness (compile errors or warnings — caught before runtime)

| Bug Class | How It's Prevented | Validator |
|-----------|-------------------|-----------|
| Undefined variables | Forward reference check with typo suggestions | `validateForwardReferences()` — line 122 |
| Type mismatches in math | String used in arithmetic = error | `validateInferredTypes()` — line 1597 |
| Frontend-backend URL mismatch | Fetching `/api/user` when endpoint is `/api/users` = warning | `validateFetchURLsMatchEndpoints()` — line 993 |
| Missing responses | Endpoint without `send back` = warning | `validateEndpointResponses()` — line 964 |
| Schema-frontend field mismatch | Sending `username` to table with `user_name` = warning | `validateFieldMismatch()` — line 1125 |
| Duplicate endpoints | Same method+path declared twice = warning | `validateDuplicateEndpoints()` — line 894 |
| Undefined function/agent calls | Calling undefined agent or pipeline = error | `validateCallTargets()` — line 1401 |
| Type errors in function calls | Literal arg doesn't match typed param = error | `validateTypedCallArgs()` — line 1506 |
| Member access on primitives | `score's name` where score is a number = warning | `validateMemberAccessTypes()` — line 1454 |
| Agent tool mismatches | Agent references undefined function as tool = error | `validateAgentTools()` — line 1307 |

### Business Logic (warnings — common mistakes caught)

| Bug Class | How It's Prevented | Validator |
|-----------|-------------------|-----------|
| Negative balance/stock | Subtracting without guard = warning | `validateArithmetic()` — line 1055 |
| Overbooking | Inserting without capacity check = warning | `validateCapacity()` — line 1083 |
| Deep property chains | 4+ levels of possessive access = warning | `validateChainDepth()` — line 1715 |
| Complex expressions | 3+ operators in one expression = warning | `validateExprComplexity()` — line 1761 |
| Invalid classification | Classify with < 2 categories = error | `validateClassify()` — line 1808 |

### Generated Code Protections (always in compiled output)

| Protection | What It Does |
|-----------|-------------|
| Input validation | `_validate()` checks required fields, types, min/max/pattern on every POST/PUT |
| Mass assignment filter | `_pick()` only allows schema-defined fields through |
| PII redaction | `_clearError()` strips sensitive fields from all error responses |
| Source maps | `_clearLineMap` maps runtime errors back to Clear line numbers |
| XSS escaping | `_esc()` escapes user input in all display/template contexts |

### Not Yet Prevented (known gaps)

| Bug Class | Status | Notes |
|-----------|--------|-------|
| Race conditions | Not prevented | Two users updating same record simultaneously |
| Null reference chains | Partial | Optional chaining exists but not enforced |
| Infinite loops / runaway agents | Not prevented | No static termination analysis |
| Cross-tenant data leakage | Not prevented | Row-level security not auto-enforced |
| Type safety on external returns | Not prevented | `ask ai` returns untyped string |
| Sensitive data in logs | Partial | `_clearError()` redacts, but `log every request` logs full bodies |
| Promise rejection handling | Not prevented | Async without error handler swallows errors |

### Type System Assessment

**Current state:** Limited inference (literals + function params). Catches type mismatches in arithmetic and function calls.

**What a full type system would add:**
- Return type mismatches (function returns string, caller expects number)
- Array element type consistency
- Agent/API response shape validation
- Optional/nullable type tracking

**Recommendation:** Not needed yet for enterprise internal tools market. The 27 security/correctness guarantees matter more than type safety for CRUD apps. Revisit when targeting engineering teams who compare to TypeScript.

---

## Stats

| Metric | Value |
|--------|-------|
| Node types | 126 |
| Compiler tests | 1850 (0 failures) |
| Sandbox tests | 9 |
| E2E tests | 80 (core 7 templates, CRUD, curriculum) |
| Playground tests | ~127 (server, IDE, agent) |
| npm dependencies | 0 (compiler is pure JS) |
| Targets | JS (Express), Python (FastAPI), HTML (DaisyUI v5 + Tailwind v4) |
