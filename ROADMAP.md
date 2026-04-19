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
| Live Tests pane streaming | `/api/run-eval-stream` SSE endpoint + EventSource-style UI rewire | Rows flip pending → running → pass/fail as each spec resolves; no 60-90s blank stare |
| Terminal trace per spec | Every run (Meph, UI, direct POST) logs `[eval] N/T ✓ id pass $0.0008 — feedback` | Failures include the agent's actual output (truncated to 240 chars) so "why" is visible without opening Tests |
| Auth-walled endpoint probes | Eval runner mints signed test-user tokens matching whichever auth scheme the compiled child uses (inline jsonwebtoken JWT or runtime/auth.js 2-part HMAC) | 7 of 8 core templates have `requires login`; all now probe-able |
| Implicit schema tables | Compiler auto-creates `Conversations` / `Memories` tables when any agent declares `remember conversation context` or `remember user's preferences` | Was silently failing with "no such table" before the eval auth fix surfaced it |
| `repeat until` variable scoping | Vars reassigned inside a `repeat until` stay as awaited strings — only single-assignment vars stream | Iterative-refinement agents (draft → improve → grade) now pass real content between calls |

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
| Unit assertions | `expect x is 5`, `expect x is greater than N`, `expect x is empty` | Value-level assertions — 8 check forms, friendly error messages, no HTTP needed |

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
| **Live App Editing — Phase A** (LAE-1, LAE-2, LAE-3 additive, LAE-7) | Studio `/__meph__/widget.js` + `/propose` + `/ship` endpoints; owner-gated Meph widget; 3 additive tools (field/endpoint/page); AST-diff classifier with additive/reversible/destructive taxonomy | Done — 67 tests + 10/10 real-Meph eval |
| **Live App Editing — Phase B** (LAE-3 reversible, LAE-4, LAE-6) | `, hidden` and `, renamed to X` field modifiers; `db.findAll`/`findOne` strip hidden by default; snapshot + rollback primitives; ship auto-snapshots; `/__meph__/api/rollback` + `/snapshots`; widget Undo button; sessionStorage form-state preservation across reload | Done — 44 more tests + 11/11 real-Meph eval |
| **Live App Editing — compiler integration** | Widget script + `/__meph__/*` proxy auto-injected into every compiled Clear app that declares `allow signup and login`. `STUDIO_PORT` env var wires the child's proxy to Studio; clean 503 in production. Studio copies `runtime/meph-widget.js` into `clear-runtime/` on every `/api/run`. | Done — 7 tests, landing page rewritten in Marcus's voice |
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
| Meph voice mode | 🔊 toggle in chat pane — continuous mic + spoken replies in refined British male voice | Done — zero-deps Web Speech API, auto-pause during speech, sentence-buffered TTS, persistent across reloads |
| Eval criteria clarity | Rubric leads; "non-empty response" check demoted to dim italic footnote | Done — applied to Studio Tests pane + exported Markdown reports |
| Test runner timeouts | 30s → 120s CLI / 180s Studio; override via `CLEAR_TEST_TIMEOUT_MS`, `CLEAR_STUDIO_TEST_TIMEOUT_MS`, `CLEAR_NPM_INSTALL_TIMEOUT_MS` | Done — cryptic Windows `spawnSync cmd.exe ETIMEDOUT` translated to plain-English guidance |
| Stray diff-marker detection | Leading `-` / `+` on a source line → plain-English error naming the real cause instead of "undefined variable 'send back'" | Done — validator catches the multi-word-keyword-as-identifier case; AI-INSTRUCTIONS + Meph system prompt updated so edits don't leave diff artifacts |
| Voice mode tri-state | Off / 🔊 Speak / 🎤 Converse segmented control in chat pane | Done — Speak = TTS only (no mic), Converse = TTS + continuous STT; mic-denial falls back to Speak |
| SSE grading for structured payloads | Agent endpoints that stream `send back { score, reason }` now land in the grader with full JSON body | Done — session 32 widest-blast-radius bug; 14 unit tests in `playground/sse-drain.test.js` |
| Terminal newest-first ordering | Newest event at top, accent-highlighted; older entries fade | Done — removed the double-reverse that was burying new entries at the bottom |
| Eval score-gap display | Rubric scores render with tinted chip showing gap from threshold (+0.2 / -0.4) — green when clear, yellow when borderline, red when clearly failing | Done — flakiness reads as borderline case, not regression. Same format in exported MD reports. |
| Auto-rerun on eval fail | Failed rubric-graded specs auto-rerun once; pass on retry = flagged "borderline" with prior-attempt score exposed | Done — catches T=0 sampling jitter at ~2x cost on genuine failures only. Override with `CLEAR_EVAL_NO_RERUN=1`. |
| Probe honors `validate incoming:` | e2e/role/format probes now merge the endpoint's required fields into the body so probes don't 400 before the agent runs | Done — new `buildEndpointBody()` helper. Unblocked page-analyzer + lead-scorer end-to-end. |
| Concrete sample values | Field-level sample generator emits `"Acme Corp"` / `"quantum computing"` / `"alice@example.com"` instead of `"sample X"` | Done — generic strings made Claude-backed agents refuse ("I need more context"). Real values ground the grader + agent. |
| Eval child shutdown race | `killEvalChildAndWait()` awaits exit + 200ms OS socket grace before respawn | Done — sync kill was racing the next spawn on port 4999, surfacing as cascading "fetch failed." |
| Extended eval idle timer | `EVAL_IDLE_MS` 60s → 300s | Done — multi-agent suites run 3+ min; child was being reaped mid-run when grader bursts spanned 60s between probe hits. |
| **Agent+auth template evals all pass** | page-analyzer, lead-scorer, helpdesk-agent, ecom-agent, multi-agent-research | **29/29** specs pass end-to-end (was 15/29 at session 32 baseline). Real-API validation of the whole eval stack. |
| **Phase 85 — One-click deploy (Studio → Fly)** | Session 37 | Deploy button in Studio ships compiled apps to a live URL in seconds. Shared builder + metered AI proxy + tenant/billing layer + cross-tenant isolation. 72 passing tests across packaging, builder, proxy, billing, deploy, security. External prerequisites (Fly sales email, Stripe signup, domain registration, Anthropic org key) still required before first real deploy. |

### Session 37 — Supervisor + Factor DB + Marcus apps + HITL compiler fixes

| Feature | Syntax / Where | Status |
|---------|----------------|--------|
| **Factor DB** | `playground/factor-db.sqlite` — every Meph compile writes a row: {archetype, error_sig, compile_ok, test_pass, source_before, patch_summary} | Done — SQLite, WAL, indexed. 139 rows / 49 passing. |
| **Archetype classifier** | `playground/supervisor/archetype.js` — 15 shape-of-work categories | Done — queue_workflow/routing_engine/agent_workflow/dashboard/crud_app/content_app/realtime_app/booking_app/ecommerce/api_service/etl_pipeline/webhook_handler/batch_job/data_sync/general. All 13 templates classify correctly. |
| **Flywheel loop closure** | `/api/chat` compile error → `_factorDB.querySuggestions()` → injects 3 tier-ranked past examples as `hints` in tool result | Done — v2 layered: exact error + archetype / exact error / archetype gold |
| **Studio Flywheel tab** | Live dashboard: total rows, passing rows, progress to 200-row threshold, archetype table, recent activity, API health banner | Done — polls `/api/flywheel-stats` every 3s |
| **Studio Supervisor tab** | Run-sweep control (workers/tasks/timeout), live progress (per-task ✅/❌), session browser with click-to-expand trajectory drill-down | Done — 4 new endpoints (`/api/supervisor/sessions`, `/session/:id`, `/start-sweep`, `/sweep-progress`) |
| **Session Registry** | `playground/supervisor/registry.js` — SQLite-backed session tracking (state, port, task, pass_rate) | Done — WAL mode, 4 tests |
| **Worker Spawner** | `playground/supervisor/spawner.js` — spawns `node playground/server.js --port=X --session-id=Y` child processes | Done — port availability check, killAll |
| **Supervisor Loop** | `playground/supervisor/loop.js` — polls workers, detects TASK COMPLETE / STUCK, SSE status stream | Done — state machine + SSE |
| **Curriculum sweep harness** | `node playground/supervisor/curriculum-sweep.js --workers=3` — drives 25 curriculum tasks through N parallel workers | Done — pre-flight API check, fail fast on rate limit |
| **Eval replicated** | `node playground/eval-replicated.js --trials=3` — runs full 16-scenario suite on N workers, reports flake rate per scenario | Done — same infra as curriculum-sweep |
| **Training data exporter** | `node playground/supervisor/export-training-data.js --stats` or `--out=t.jsonl` — JSONL with 15 structured features per row | Done — ready for EBM once 200 passing rows accumulate |
| **EBM trainer stub** | `python playground/supervisor/train_reranker.py t.jsonl` — refuses below 200 passing, else trains + exports ONNX | Done — skeleton ready, dormant until threshold |
| **5 Marcus apps** | `approval-queue`, `lead-router`, `onboarding-tracker`, `support-triage`, `internal-request-queue` — business-ops templates in Studio dropdown | Done — top of dropdown, matching L7-L9 curriculum tasks |
| **`send back all X` shorthand** | `send back all Users` / `send back the User with this id` / `send back all Users where active is true` — inline retrieval, no named intermediate | Done — parser desugars to `[CRUD, RESPOND]`, 6 templates updated |
| **`this X` standalone expression** | `workspace_id = this id` / `items = get all Items where owner is this user_id` — URL param access anywhere | Done — parses to `incoming?.X` |
| **Test verb aliases** | `can user submit`, `add`, `post`, `send`, `make` → canonical `create`. Plus `see/read/get/list` → `view`, `remove` → `delete`, `edit/change/modify` → `update` | Done — `TEST_VERB_ALIAS` map in parser |
| **Intent hints (validator)** | `find`, `fetch`, `search`, `query`, `lookup`, `select`, `retrieve`, `filter`, `list`, `create`, `insert`, `add`, `remove`, `destroy`, `update`, `id`, `login`, `password`, `this`, `generate`, `summarize`, `classify`, `extract`, `translate`, `rewrite`, `analyze`, `predict` — all get curated hints pointing at canonical form | Done — `INTENT_HINTS` map in `validator.js`, replaces nonsensical Levenshtein suggestions |
| **Auth guard error UX** | Missing `requires login` on POST/PUT/DELETE shows full corrected endpoint example, not just one-line fix | Done — `validator.js` error message |
| **Classifier auth detection fix** | archetype.js was checking non-existent `REQUIRES_LOGIN` node type; now checks `REQUIRES_AUTH`, `REQUIRES_ROLE`, `AUTH_SCAFFOLD` | Done — Marcus apps now correctly tagged `queue_workflow` |
| **http_request 2xx = passing signal** | `/api/chat` http_request tool 2xx response now marks the latest Factor DB row as `test_pass=1` with 0.9 score | Done — curriculum sweeps that verify via HTTP now produce passing rows |
| **Pre-flight API check** | Sweep harnesses probe API with 5-token request before spawning workers; fail in 2s on rate limit instead of burning 10 min | Done — `curriculum-sweep.js` + `eval-replicated.js` |
| **Flywheel API health banner** | `/api/flywheel-stats` reports `apiHealth` (ok/no_key/error), Flywheel tab shows red/green banner with actual error text | Done — cached 5 min to avoid quota waste |
| **Cold-start seeder** | `node playground/supervisor/cold-start.js` — seeds DB with 13 gold templates (all 8 core + 5 Marcus) + 25 curriculum skeleton attempts | Done — idempotent, BM25 retrieval works immediately |
| **HITL Rule (CLAUDE.md)** | "Meph Failures Are Bug Reports on the System" — when Meph fails, fix compiler/docs/system prompt, merge-as-you-go. Matrix of symptom → root cause layer | Done — codified as mandatory rule + in memory |
| **Documentation Rule 9 surfaces** | Added FAQ.md + RESEARCH.md to the rule (was 7, now 9). Both skills (ship + write-plan) updated | Done — no new feature ships without updating all 9 |
| **Measured lift** | Sweep 6 (all HITL fixes active) vs Sweep 4: **+75% task completions (4→7)**, 30% faster wall clock, +38% more passing rows | Done — HITL rule proved itself empirically |

---

## What's Next

Ordered by impact. Three tracks: **go-to-market**, **language completeness**, and **platform quality**.

### Flywheel / Training Signal (Session 38 in-flight)

The RL thesis moves forward in small, measurable steps. Each item below compounds the ones below it — do them in order.

| # | Item | Status | Impact |
|---|------|--------|--------|
| RL-1 | **Meph runs on Haiku 4.5 by default.** `MEPH_MODEL` env var overrides to Sonnet for A/B. 15/16 vs 16/16 on eval-meph; within 6% of Sonnet capability at 3x cheaper per row. | ✅ Done (Session 38) | ~$2k saved per 10k-row sweep |
| RL-2 | **Step-decomposition labeling.** Every compile row now tagged with which task milestone Meph has hit (`step_id`, `step_index`, `step_name`). Sweep prints per-step rollup: attempts, compiles, tests passed per step. Seeded on 2 tasks (todo-crud, webhook-stripe). | ✅ Done (Session 38) | 4x signal density per sweep |
| RL-3 | **Classifier fuzzy-match fixes.** Dashboards with 1 chart misroute to "dashboard" (should route to KPI). Webhooks on `/hook` paths route wrong. Small regex additions in `archetype.js`. | Next (30 min) | Unlocks balanced archetype distribution |
| RL-4 | **Seed steps on the other 28 curriculum tasks.** 2 tasks seeded; the rest still fall into the unlabeled bucket in stepStats. | Next (1 hr) | Step-decomposition coverage from 7% → 100% |
| RL-5 | **Sharpen the 5 archetype task descriptions.** Explicit archetype signals so Meph doesn't guess wrong on webhook/batch/sync/ETL/dashboard shapes. | Next (30 min) | Prevents classifier poisoning the DB |
| RL-6 | **First full re-sweep with Haiku + steps + fixes.** Overnight run populating the Factor DB with step-labeled, cheap, well-routed rows. First training-ready dataset. | After RL-3/4/5 | Unlocks EBM training at 200 rows |

### Compiler Flywheel — second-order moat (Session 38 idea, Phase 2)

**The insight:** Today's flywheel makes *Meph* write better Clear over time. But we never measure whether the *JS/Python/HTML the compiler emits* is optimal. Every emit function is hand-written by Russell/Claude — "reasonable" but not proven best. A second flywheel, running at the compiler layer, can let production data pick the emit strategy that actually performs.

**Four tiers by ROI:**

| # | Tier | Cost | Unlock |
|---|------|------|--------|
| CF-1 | **Runtime instrumentation.** Compiled apps emit latency / error / memory beacons to a shared endpoint. Factor DB gains runtime-outcome columns per compile row. | 1 day | We finally *know* which compilation choices produce slow or crashy JS. Data-driven compiler bug-reports instead of gut-feel. |
| CF-2 | **Candidate emitters + deterministic A/B.** For the top 10 emit patterns, define 2–3 JS/Py variants. Feature-flag which variant is emitted per app (deterministic at compile time, not runtime — preserves "same input = same output" rule within a build). After N apps run each variant, production data picks the winner. | 1 week | Quantitative answer to "which JS pattern is best for `get all X where Y`?" instead of whoever wrote the emitter first. |
| CF-3 | **Compiler-strategy reranker.** EBM trained on (archetype, app shape, runtime outcome) → which emit variant should I pick? Same glass-box model as the Meph reranker, one layer deeper. | 2 weeks (after Meph reranker trained) | Per-pattern emit strategy auto-selects based on context. Compiler gets smarter per app. |
| CF-4 | **GA-evolved compiler (research).** Mutate emit functions themselves. Fitness = curriculum pass rate + runtime perf. RESEARCH.md already has a GA for candidate Clear programs — this is the same idea one abstraction up: evolve the compiler. | 2+ months (research, not product) | The compiler becomes a learned artifact, not a hand-coded one. This is the moat nobody else architecturally can copy — a compiler that improves from usage. |

**Error-message flywheel (bonus, easy):** Track which compile error messages correlate with STUCK sessions. Auto-flag "bad error messages" for rewrite. Already half-built via the existing Factor DB.

**Why ship CF-1 soon, not CF-2-4:**
- The Meph-level flywheel is not yet validated. Don't add a second flywheel before the first is proven.
- Compiler quality is *not* the current bottleneck — Session 38's webhook bug proved the bottleneck is Meph writing broken Clear (parser gaps, wrong syntax), not the generated JS being suboptimal.
- BUT: CF-1 is 20 lines of instrumentation that starts collecting data now. Cheap optionality. Data collection compounds before you decide to act.

**Not-now but write it down:** CF-4 is a publishable research direction. If Augment Labs track becomes primary, this is where that work lives.

### One-click deploy follow-ups (Phase 85 shipped)
1. **Phase 85a — Provision the real stack.** Register buildclear.dev, apply for Fly Trust Verified status with 10k-machine quota, sign up for Stripe, generate Anthropic org key, wire Postgres for the tenants DB, and run `deploy-builder.sh` + `deploy-proxy.sh` once. Until this is done Deploy works end-to-end in tests but has nowhere to deploy to.
2. **Phase 86 — Per-tenant usage dashboard.** The plan badge is a teaser; a full breakdown page (spend by day, top apps by AI spend, upgrade CTA) turns the badge into a billing conversion surface.
3. **Phase 87 — Meph-driven deploy.** Meph gains a `deploy_app` tool so "ship it" from chat does the right thing: prompts for secrets, picks a domain, calls `/api/deploy`, streams progress into the chat bubble.
4. **Phase 88 — Deploy history drawer.** Rollback API exists; surface it in the UI as a per-app drawer with version + diff preview.
5. **Phase 89 — Multi-region + custom-domain polish.** Region picker at deploy time, cert-status polling, one-click DNS record copy. Everything is `iad`-only today.

### Go-To-Market & Positioning (locked Session 35)

**Long-term anchor: Marcus.** Technical-adjacent RevOps person at 100–500 person B2B SaaS companies. Builds Zapier zaps, knows enough SQL to be dangerous, has a backlog of 15 internal tools nobody is going to build. Already comfortable in a code-adjacent UI.

**Why Marcus over Sara (non-technical ops):**
- 10x LTV ($50K → $200K/year by year 3 vs $5K → $20K)
- Higher stickiness — builds 30 apps, switching = recoding everything
- Real expansion path — one team → company-wide standard → enterprise contract
- Loud evangelist — RevOps community is tight (SaaStr Ops Stars, RevOps Co-op)
- Tolerates rough edges, gives feedback, builds with us
- Sara needs us perfect on day one — death by perfection

**Historical analog:** Vercel (devs first, no-code via v0 from a position of strength). Stripe (devs first, no-code 5 years later). Bubble (broad/no-code first → stuck at ~$30M ARR after 12 years). Pattern: every successful "expand to non-technical" play started technical. None went the other way successfully.

**Sara is downstream of Marcus.** Once we have 1000 paying Marcuses, we have the revenue, templates, community, brand, and polish to bring Sara in via Builder mode. Reverse doesn't work. Build Sara's templates as demo assets, but spend $0 marketing on her until 2027.

**Hero use case for Marcus landing page:** deal-desk approval queue. Reps submit discount requests, anything over 20% routes to CRO, agent drafts the approval summary. Universal RevOps pain, AI-shaped middle step.

**Pricing model: Vercel pattern (portable code, sticky platform).**
- Free: 1 user, 1 hosted app, 1K agent calls/mo, .clear export
- Team $99/mo: 25 apps, 50K agent calls, custom domain, 10 seats
- Business $499/mo: unlimited apps, SSO, audit logs, dedicated support
- Enterprise (custom): on-prem, dedicated CSM, $20K–100K ACV
- Three revenue levers stacking: per-seat × app count × agent usage. Target NDR 3x year over year.

**Studio readiness:** Marcus is comfortable in Studio today (3-panel IDE feels like Retool). Sara is NOT. Builder mode (chat + preview only, "Show code" toggle for trust) is a P1 for ~2026 Q3, blocking the Sara expansion.

| Priority | Item | Notes |
|----------|------|-------|
| GTM-1 | Build `apps/deal-desk/main.clear` | Hero use case for Marcus landing page. Discount approval workflow + agent. Target ~150 lines. |
| GTM-2 | Build `landing/marcus.html` | GAN against the ASCII mock locked this session. Headline: "That backlog of internal tools nobody's going to build? Ship the first one this Friday." |
| GTM-3 | Sketch `landing/pricing.html` | Free / Team $99 / Business $499 / Enterprise. Concrete agent quotas, app limits, seat counts. |
| GTM-4 | Find 5 real Marcuses on LinkedIn | DM, show Studio, watch what breaks. Fastest validation lever. |
| GTM-5 | Studio onboarding fix | New users land in Meph chat with "What do you want to build?" — not in the editor. Cuts bounce rate without building Builder mode. |
| GTM-6 | Builder mode (Studio simple-UI) | Chat + preview only. "Show code" toggle. P1 for ~Q3 2026. Blocks Sara expansion. |
| GTM-7 | Instrument Studio | First-click tracking, time-to-first-app, where signups bounce. Data drives Builder mode priorities. |

### Live App Editing (Flagship — "Change your app while it's running")

**The promise to Marcus:** *"Your app evolves with your business by talking to it. Nothing breaks."*

Today, the moment Marcus's approval app ships to his five employees, it's frozen — adding a field means opening Studio, editing source, recompiling, redeploying, and hoping nobody loses in-flight work. Live App Editing collapses that loop: Marcus chats with Meph about his running prod app, Meph proposes a change with a preview, Marcus approves, and the change ships to his team live with data and sessions intact. This is the single feature that separates Clear from every other internal-tool builder: Retool, Superblocks, Zite, and Lovable all force a rebuild-and-redeploy cycle, and none of them can safely reshape a running app because their source isn't human-readable. Ours is. The compiler owns the whole stack — source, schema, endpoints, UI — so it can reason about every change holistically, the way Rails/Django cannot.

**User story (Marcus, day 34 of using Clear):**

> Marcus's deal-desk approval app has been running for a month. His CRO walks over and says "we need a 'region' field on every approval so we can route EMEA separately." Marcus opens his live app in the browser — not Studio, not an IDE — clicks the little 🔧 badge in the corner, and types into Meph: *"add a region field to approvals, required, options are NA / EMEA / APAC, default NA."* Meph reads the running app, reports back: *"This is an additive change. I'll add 'region' to the Approvals table with default 'NA' for 12 existing rows, add a dropdown to the submission form, and a column to the admin view. Ship it?"* Marcus clicks Ship. The change goes live in 4 seconds. Jenna, who was mid-way through submitting an approval, sees the new field appear empty in her form — her amount and notes are still there. Nothing broke. Marcus tells the CRO "done" before the CRO has finished his coffee.

**Why only Marcus:** This feature is role-gated — only the app owner (and explicitly-granted admins) can push live modifications. Employees can't fork their own versions. The app is singular; the *evolution* is conversational. Per-user forks are explicitly out of scope (see "Not Building" below) because they destroy the shared ontology that justified building a shared app in the first place.

**Requirements:**

| # | Requirement | Why it matters |
|---|-------------|----------------|
| LAE-1 | **Owner-only authorization.** Live edits require the authenticated owner (or admin role) of the app. Non-owners see the app normally, with no edit UI. | Prevents chaos, prevents audit-log disasters, prevents employees quietly reshaping the workflow they're supposed to follow. |
| LAE-2 | **In-browser edit surface.** A floating Meph chat widget on the running app (not Studio, not a separate tool). Marcus opens his app at `approvals.buildclear.dev` and edits it in place. | The whole point is "talk to your running app." Forcing Marcus back to Studio breaks the promise. |
| LAE-3 | **Change classifier with hide-by-default semantics.** Every proposed diff is classified: `additive` (add field/page/endpoint — ships instantly); `reversible` (**remove = hide**, rename = expand+copy+hide, relabel, reorder — data never physically leaves the database, one-click un-hide); `destructive` (only the explicit "permanently delete" command or unavoidable type coercion — requires second-tier confirmation, a mandatory `reason` string, and an audit entry; **NO data snapshot** for the compliance case, since keeping a copy defeats the purpose of erasure). Soft-hide is the default for "remove" because non-engineers think of deletion like a desktop trash can, not an incinerator. Destructive delete means actually gone — if Marcus wanted recoverable, hide was the right path. | Safety comes from making the default reversible. When the user reaches for destructive, the seat-belt is the confirm flow + audit trail, not a hidden copy. A snapshot would create false assurance and break GDPR/CCPA/HIPAA erasure obligations. |
| LAE-4 | **Live-reload contract — preserve in-flight work.** When a change ships, connected browser sessions get the new version without losing unsaved form state, filled-in inputs, scroll position, or open modals. New fields appear empty; existing user input survives. | If Jenna loses her half-filled approval because Marcus added a field, the feature is dead on arrival. |
| LAE-5 | **Schema-change migration planner.** Type changes (`text → number`, `string → dropdown`, nullable → required) trigger a migration preview: "12 rows don't parse — coerce / default / reject?" Marcus picks; migration runs transactionally. | Data corruption is the #1 risk. No schema change ships without Marcus seeing what happens to existing rows. |
| LAE-6 | **Snapshot + 1-sentence rollback.** Every live edit creates a named checkpoint (source + schema + data snapshot). "Meph, undo the last change" or "Meph, go back to this morning" restores source, schema, and data in one command. | This is the safety net that makes Marcus edit bravely. Without it, every change feels terrifying. |
| LAE-7 | **Diff preview before ship.** Before applying, Meph shows the source diff (human-readable `.clear` changes) and the effective-change summary ("adds 1 field, 1 dropdown, 1 column, migrates 12 rows"). | Marcus's trust compounds when he can see what's about to happen. |
| LAE-8 | **Change log (audit trail).** Every live edit is recorded: who, what (diff + summary), when, who approved, rollback availability. Viewable per-app in Studio. | Compliance. When Marcus's CFO asks "why did the approval limit change on March 3rd," the answer is one query away. |
| LAE-9 | **Concurrent-edit guard.** If two admins try to edit live at the same time, the second one gets blocked or queued — never silently overwritten. | Split-brain is worse than slow. |
| LAE-10 | **Dry-run mode.** Marcus can preview a change against a staging copy of the app without shipping to employees. "Try this change for 10 minutes on a private URL, then decide." | Lets Marcus validate complex changes without risking a revert. |

**Out of scope (explicit non-goals):**
- Per-user forks of the app (different employees seeing fundamentally different apps).
- Per-user schema changes (Jenna can't add her own field that only she sees).
- Employee-initiated requests ("Jenna asks Meph to add a field, Marcus approves" is a future feature, not MVP).
- Preferences/sort/filter/theme/saved-views — those are normal product polish, not Live Editing.

**Phasing:**

| Phase | Scope | Rough effort | Status |
|-------|-------|--------------|--------|
| Phase A | LAE-1, LAE-2, LAE-3 (additive changes only), LAE-7 — Marcus adds fields/pages/endpoints live, with preview. | ~1 week | **Done 2026-04-18** (67 tests, 10/10 real-Meph eval) |
| Phase B | LAE-4 (live-reload contract), LAE-6 (snapshot + rollback), LAE-3 for reversible changes (hide, rename, relabel, reorder) | ~1 week | **Done 2026-04-18** (44 tests, 11/11 real-Meph eval) |
| Phase C | LAE-5 (schema migration planner), LAE-3 for destructive changes (explicit permanent-delete + unavoidable type coercion). **No data snapshot on destructive delete** — audit trail replaces it as the accountability surface (see design note below). | ~1.5 weeks | Not started |
| Phase D | LAE-8 (audit log), LAE-9 (concurrent guard), LAE-10 (dry-run) | ~1 week | Not started |

**Design note — why destructive delete has NO data snapshot (Phase C):**

The safety model inverts between tiers.
- **Reversible (Phase B, hide/rename):** snapshot the data because the whole point is "change your mind is free." Data doesn't move; undo is a markup toggle.
- **Destructive (Phase C, permanently delete):** do NOT snapshot the data. If a regulator audits Marcus over a GDPR erasure request and finds the data sitting in a snapshot he controls, the deletion claim is invalid. A snapshot creates false assurance for Marcus and legal exposure for the app owner.

What replaces the snapshot as the accountability mechanism: a **mandatory audit log entry** captured at destruction time, containing:
- when (timestamp, UTC)
- who (email + role at time of action)
- what (table + column + row count affected)
- references (every endpoint/page/agent that referenced the column)
- reason (free-text string the user MUST provide — e.g., "GDPR erasure ticket #412")
- confirmation method (must be "typed DELETE + click Confirm" — never one-click)

Auditors inspect the trail, not the data. That's what compliance actually wants.

Implementation corollary: every Phase C surface (permanent delete command, schema migration planner when the chosen path is lossy) requires the `reason` field before it'll ship. Meph refuses to proceed without one.

**Still needed to finish the Live App Editing flagship:**
- ~~Compiler change: emit widget script + `/__meph__/*` proxy in compiled apps.~~ **Done 2026-04-18** — any compiled Clear app with `allow signup and login` now auto-includes the edit widget and proxies `/__meph__/api/*` to `STUDIO_PORT` (with a clean 503 when the env var is absent in production). 7 tests in `lib/widget-injection.test.js`.
- Browser Playwright e2e covering owner→widget→ship/hide/undo on the three templates.
- Security: Studio's `liveEditAuth` middleware currently parses JWTs without HMAC verify — fine for the single-owner spike, must use `runtime/auth.js`'s `verifyToken` before any multi-user demo.

**Success metric:** Marcus ships 3+ live edits to his prod app in his first week without a single rollback-due-to-breakage. That's the bar.

**Positioning (don't generic-pitch "live editing" — every competitor claims that):**

> **"Never lose a user's form data when you change the app."**

The technical backing is **additive-by-default with expand-and-contract migrations**: new column before old one drops, dual-write during transitions, old schema still readable until every consumer moves over. Airtable-grade safety with Lovable-grade conversational interface — a combination nobody ships today.

**Competitive snapshot (researched Session 38):**

| Competitor | Live edit? | Schema safety | Session preservation | Rollback | Primary complaint |
|---|---|---|---|---|---|
| **Lovable** | No (publish = new snapshot) | Destructive; no preview | No | Third-party only | "Changes not reaching prod" after 2.0; 1.x→2.x regression |
| **Bolt.new** | No (every deploy live) | None; rewrites whole files | No | Git only | GitHub issue #9016 "Files Glitching as they are being rewritten"; 1.4/5 Trustpilot |
| **Retool** | **Partial** — Release Manager: draft vs. published | Manual schema migrations between envs | Not guaranteed | ✅ millisecond DB record swap | Developer-gated; non-devs can't push changes; "app reverting on its own" threads |
| **Superblocks / Clark** | No — Clark modifies source, not running instance | Enterprise governance gates; no live DDL | No | Git-based | AI edits source, not live apps |
| **Zite** | Partial (post-publish edits) | No public doc | No public evidence | No public evidence | Slow iteration on prompts |
| **v0** | No — explicit *"Cannot edit a published generation"* | N/A (frontend only) | Client reload kicks users off | Vercel deployment history | Can't edit after publish |
| **Budibase / Appsmith / ToolJet** | No (staging→prod via git) | Manual, connector-dependent | Not addressed | Git tags | Developer-gated |
| **Airtable / Notion** | ✅ Additive only | Additive-by-construction (API forbids table/column creation) | ✅ Yes | Revision history | (This is the prior art — replicate their safety model) |

**Verdict:** Real gap, defensible. The "chat-to-modify-live-app-without-breaking-users" slot is unowned. Primary risk: Retool bolts a real AI agent onto Release Manager. Window is roughly 12-18 months to plant the flag.

**Source quotes for landing page:**
- Bolt.new: *"rewrites the entire file, breaks your UI/UX structure, and still fails to fix the original problem"* (YeasiTech; GitHub #9016)
- Vibe-coding incidents: *"wiped production databases while explicitly instructed not to"* — 7 documented cases in 2025-2026 (Autonoma)
- Lovable 2.0: *"none of my changes are getting pushed to prod even after updating"* (Trustpilot)
- v0: *"Cannot edit a published generation"* (Vercel community)

### Language Completeness

Clear's job is: Russell tells an LLM what to build, the LLM writes Clear, it compiles to working software. If the LLM needs a feature to build what Russell asked for, Clear needs it.

| Priority | Feature | Syntax | Status |
|----------|---------|--------|--------|
| P1 | Error throwing | `send error 'message'` / `throw error` / `fail with` / `raise error` | **Done** |
| P2 | Finally block | `try:` ... `finally:` / `always do:` / `after everything:` | **Done** |
| P3 | First-class functions | `map_list(items, double)` — pass fn refs as args | **Done** (works natively) |
| P4 | Decorators / middleware | `before each endpoint:` | Skipped — built-in middleware covers use cases |
| ✅ P5 | `clear serve` ESM fix | ~~CLI serve crashes with `require is not defined`~~ **DONE (Session 37):** `clear build` now writes `package.json` containing `{"type":"commonjs"}` alongside the generated `server.js`. Node walks up from `server.js`, finds this sibling, and treats the file as CommonJS — shielding it from any parent project's `"type": "module"` setting. Tested in ESM project: ESM error gone. |

### Performance (Session 35 — real gaps found via competitive research)

Every internal tool builder has performance problems at scale. Retool chokes because everything runs in the browser. Lovable/Bolt choke because AI-generated code has no optimization guarantees. Clear's architecture is better (server-side CRUD, vanilla JS frontend, no framework overhead) but has real gaps:

| Priority | Gap | Current Behavior | Fix | Impact |
|----------|-----|-------------------|-----|--------|
| ✅ PERF-1 | **No pagination** | ~~`get all Users` → no LIMIT.~~ **DONE (Session 37):** `get all` emits `LIMIT 50` by default. Opt-out with `get every`. Supabase path gets `.limit(50)` too. | — | Every list endpoint is now safe by default. |
| ✅ PERF-2 | **Aggregations are client-side** | ~~All aggregates fetch then reduce.~~ **DONE (Session 37):** `sum of price from Orders` compiles to `db.aggregate('orders', 'SUM', 'price', {})` → `SELECT SUM(price) FROM orders`. Filtered aggregates supported: `sum of price from Orders where status is 'paid'` → `{ status: 'paid' }` filter. `in variable` kept as in-memory path for backward compat. | — | Dashboards now single-query instead of full-table-scan-then-reduce. |
| ✅ PERF-3 | **Search returns all matches** | ~~No LIMIT on search.~~ **DONE (Session 37):** `search X for q` appends `.slice(0, 100)` to the filter expression. | — | Prevents runaway result sets. Future: push to SQL LIKE for real server-side LIMIT. |
| ✅ PERF-4 | **No virtual scrolling** | ~~`display X as table` renders every row into the DOM.~~ **DONE (Session 37):** `display X as table` now compiles to a call to `_clear_render_table(...)`. Below 100 rows, it renders everything (DOM handles it fine). At 100+ rows, it uses fixed-height virtualization: 40px rows, 560px scrollable container, 5-row buffer. Only visible rows + buffer hit the DOM — a 500-row table shows ~24 `<tr>` elements; a 50,000-row table shows the same ~24. Scroll handler bound once per element, repainted on scroll and on reactive re-render. Browser-verified on 500 rows. | — | Table view is now bounded regardless of dataset size. |
| ✅ PERF-5 | **Explicit page N, M per page still fetched all rows** | ~~Compiler emitted `findAll()` then client-side `.slice()`.~~ **DONE (Session 37):** `page N, M per page` now compiles to `db.findAll('items', {}, { limit: N, offset: (page-1)*N })` → SQL `LIMIT N OFFSET M`. Works for literal page numbers (offset precomputed at compile time) and runtime variables (offset expression). Supabase path already used `.range()` server-side — no change needed there. | — | Explicit pagination is now truly server-side. |

**What's already fine:**
- CRUD ops (save/delete/update) → server-side SQL. Single-row ops. Fast.
- Auth/security → server-side Express middleware. No browser cost.
- Agent calls → server-side API calls. No browser cost.
- Compiled output → vanilla JS + HTML. No React/Vue framework overhead.
- Charts → ECharts. Client-side but handles reasonable datasets well.

### Platform Quality

| Priority | Feature | Notes |
|----------|---------|-------|
| P6 | Studio Test button | **Done.** Tests tab in preview pane. Run App Tests + Run Compiler Tests buttons. Meph `run_tests` tool. Structured pass/fail with error details. |
| P7 | ClearMan (API tester) | "Try it" button per endpoint in API tab. Postman built into Studio. |
| P8 | Compiler-generated tests | **Done.** Auto-generated E2E tests with English names, CRUD flow tests, agent smoke tests. |
| P9 | Multi-file download | Zip: `server.js` + `index.html` + `package.json`. Single files don't deploy. |
| P10 | `clear test` runner fix | User-written `test` blocks aren't picked up by `clear test` CLI (R5 in refactoring backlog). |

### Mechanical Test Quality Signals (Session 36b — Complete)

Three pieces shipped on `feature/test-quality-signals`:

| # | Piece | Status | Location |
|---|-------|--------|----------|
| 1 | Static lint on weak assertions | ✅ Done | `compiler.js` — `generateE2ETests()`, `qualityWarnings[]` |
| 2 | Process lint: red-step tracking | ✅ Done | `playground/server.js` — `sessionTestCalls[]` per `/api/chat` |
| 3 | Session JSON storage | ✅ Done | `playground/sessions/[id].json`, `GET /api/session-quality` |

These are the mechanical bootstrap for the re-ranker. See `RESEARCH.md` for full flywheel design.

**Next:** Supervisor multi-session plan — `feature/supervisor-multi-session`. See `plans/plan-supervisor-multi-session-04-17-2026.md`.

### Next Up (Session 34 Next Steps)

Ordered by impact.

| Priority | Feature | Notes |
|----------|---------|-------|
| N1 | **Ensemble grader mode** | `EVAL_PROVIDER=ensemble` runs Anthropic + Gemini and surfaces grader disagreement as a pink chip. Catches Claude-grading-Claude bias automatically. On session 32's list, still unbuilt. |
| N2 | **Eval history** | Persist runs + score trends per template to a local table. Auto-flag regressions (score drop > 2 points vs last run). Half-day of work. |
| N3 | **CLI `clear eval --suite` mode** | Port the structured eval path from Studio to the CLI so CI can run evals outside the browser. Unblocks scheduled regression runs. |
| N4 | **Probe-validate sweep against nested shapes** | Session 34's probe fix was tested against flat `validate` rules (url, company, email). Validate blocks with nested objects / list constraints haven't been exercised. Sweep every `validate incoming:` in apps/ to confirm. |
| N5 | **Review SQLite WIP in `apps/todo-fullstack/clear-runtime/db.js`** | Pending migration sitting unstaged in working tree since session 32 or earlier. Decide: ship, stash, or revert. |

---

## Competitive Landscape (Session 35 — sourced from G2, Capterra, Reddit, product pages)

### Direct Competitors

**Retool** — $450M+ raised, incumbent. Developer-only (needs JS + SQL). $10-50/seat/mo. Large apps "extremely cumbersome to maintain, nearly impossible to test." 2023 breach exposed 27 cloud customers. Our edge: no developer needed, readable source, auto-generated tests, compile-time security.

**Superblocks** — $60M raised, enterprise-focused. $49/creator/mo. G2 reviewers call lack of automated testing "a deal breaker." Has "Clark" AI agent (won 2025 AI Breakthrough Award) but generates black-box output. Our edge: readable source, deterministic compilation, built-in tests.

**Zite** — Closest competitor. 100K+ teams. AI-native, prompt-to-app. Aggressive pricing: $0/15/55/mo with unlimited users on all plans including free. SOC 2 Type II, SSO, Salesforce integration, built-in database with spreadsheet UI, custom domains. Acknowledged weaknesses: smaller template library, not for consumer/mobile apps. **Key gap vs Clear:** AI-generated black box (can't read what it built), no agent primitives, no compile-time guarantees, no deterministic output, "modify with follow-up prompts" = re-prompt AI and hope (same Lovable/Bolt problem). **Key gap vs Zite:** they have hosting, compliance, integrations, marketplace, 100K users. We have zero. All platform stuff, all buildable — but they're ahead.

**Lovable** — AI app generator. Gets you "70% of the way there." Users report "unable to diagnose problems hidden deep within code they couldn't read." Credits burn on AI mistakes. "Simple requests would fail and break unrelated parts." Our edge: readable source, deterministic compiler, no credit roulette.

**Bolt.new** — AI app generator. "Rewrites the entire file, breaks your UI, and still fails to fix the original problem." Users spend "$1,000+ on tokens just debugging." Context degrades past 15-20 components. Our edge: edit one line, only that line changes. No token burn.

### Developer-only tools (different category — Marcus can't use these)

**Appsmith** — Open source, self-hosted. G2 4.7/5. "Not for non-technical people. Period." Needs SQL + JS. Performance degrades with large datasets. Free self-hosted.

**Budibase** — Open source. G2 4.5/5. "Open source bait and switch" — licensing changes angered community. Automations are fragile ("publishing a new one can break all existing automations"). Permissions are screen-level only.

**ToolJet** — Open source. 25K GitHub stars. Best visual design quality in head-to-head comparisons. $19/builder/mo. Community maturity and stability scored lower than Appsmith.

### Simple/portal tools (different category — too limited for Marcus)

**Softr** — Best for non-technical users IF data lives in Airtable. Pricing pivot destroyed trust (user limit dropped from 2,500 to 500 with no price reduction). Customization ceiling is low. Airtable-bound.

**Noloco** — Airtable/Sheets integration. Imposed 50,000 row limit mid-flight with no warning. Reliability degrades at scale. Small team, variable support quality.

### New AI-native entrants (watch list)

**AgentUI** — Claims non-technical teams built enterprise-grade apps. 500+ teams. No independent reviews yet.

**Bricks.sh** — 1.6M EUR pre-seed (Jan 2026). One-click admin panels from your API/database. Too early to evaluate.

### Clear's unique position (backed by competitive data)

Every tool on this list either requires a developer (Retool, Appsmith, Budibase, ToolJet) OR generates black-box output the user can't read or modify precisely (Lovable, Bolt, Zite). Nobody gives you:
1. **Readable source code** a non-technical person can understand
2. **Deterministic compilation** (same input = same output, always)
3. **Built-in AI agent primitives** with guardrails
4. **Compile-time security guarantees** (27 bug classes eliminated)
5. **Auto-generated tests** from the source
6. **Portable output** (cancel and keep your compiled JS)

That combination is unique. The gap to close is platform: hosting, compliance, integrations, marketplace, users.

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

## The Big Thesis

→ See **[FAQ.md — What is Clear's big thesis?](FAQ.md#what-is-clears-big-thesis)** for the full thesis, fundraising sequence, and company name rationale.

**One-liner:** Clear is the language AI writes when the output has to be safe.

## RL Training Environment (Speculative)

→ See **[FAQ.md — What is the RL training environment?](FAQ.md#what-is-the-rl-training-environment)** for the full status table.

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
| Per-user app forks | Every employee seeing a fundamentally different version of the app destroys the shared ontology that justified building a shared app. Audit/compliance nightmare. Save for 2028 if the social dynamics flip. See Live App Editing for the right answer: owner-initiated changes that ship to everyone. |

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
