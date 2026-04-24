# Clear Language — What's Built

Capability reference for the Clear compiler. The authoritative node-type spec is `intent.md`; this file is the human-readable "what can I do with Clear today?" list. Moved out of ROADMAP.md on 2026-04-21 so the roadmap can focus on what's *next*, not what's already shipped.

**Headline numbers:** 124 node types. 2097 compiler tests. Zero npm dependencies in the compiler.
**Targets:** JS (Express), Python (FastAPI), HTML (DaisyUI v5 + Tailwind v4).

---

## Core Language

| Feature | Syntax | Notes |
|---------|--------|-------|
| Variables | `x = 5` / `name is 'Alice'` | `=` for numbers, `is` for strings/booleans |
| Functions | `define function greet(name):` | Typed params (`is number`), typed returns |
| For-each loop | `for each item in items:` | Also `for each key, value in map:` |
| While loop (auto-bounded) | `while count is less than 10:` / `while cond, max N times:` | Default cap 100000 iterations; overflow throws a legible error (PHILOSOPHY Rule 18) |
| Recursive function (depth-capped) | `define function walk(n): ... walk(n - 1) ...` | Default depth 1000; exceed → `"X recursed more than N levels"` throw |
| Send email with timeout | `send email to 'x@y.c': subject 'hi' body 'hi' with timeout 60 seconds` | Default 30s; applies on JS (Promise.race) + Python (smtplib timeout) |
| AI calls auto-retry | `reply is ask claude 'hi'` | Retries 429/5xx/network transients with 1s/2s/4s exponential backoff across Node/CF/browser/Python |
| Repeat loop | `repeat 5 times:` | |
| If / else | `if x is 5:` ... `otherwise:` | Also inline: `if x is 5 then show 'yes'` |
| Match / when | `match x:` + `when 'a':` + `otherwise:` | Pattern matching |
| Try / catch | `try:` + `if error:` | Typed handlers: `if error 'not found':` (404) |
| Break / continue | `stop` / `skip` | |
| Comments | `# text` | |
| Modules | `use 'helpers'` | Namespaced, selective, or inline-all |
| Script escape | `script:` + raw JS | For anything Clear doesn't cover |
| Transactions | `as one operation:` | BEGIN/COMMIT/ROLLBACK |

## Expressions

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

## Web Frontend

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

## Backend (JS + Python)

| Feature | Syntax | Notes |
|---------|--------|-------|
| GET endpoint | `when user calls GET /api/users:` | |
| POST endpoint | `when user sends signup to /api/users:` | Receiving var = singular entity name; `sending`/`receiving` legacy forms still parse |
| PUT endpoint | `when user updates profile at /api/users/:id:` | URL params auto-bound |
| DELETE endpoint | `when user deletes user at /api/users/:id:` | |
| Send response | `send back signup` / `send back signup with success message` | Status 200/201 |
| Auth scaffold | `allow signup and login` | JWT + bcrypt, 3 endpoints |
| Requires login | `requires login` | JWT middleware check |
| Requires role | `requires role 'admin'` | Role-based access |
| Define role | `define role 'editor':` + permissions | Custom RBAC |
| Guard | `guard stock > 0 or 'Out of stock'` | Conditional 400 |
| Validate | `validate <entity>:` + field rules | Per-field 400 errors |
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

## Database & CRUD

| Feature | Syntax | Notes |
|---------|--------|-------|
| Database backend | `database is local memory` / `supabase` / `PostgreSQL` / `SQLite` | |
| Create table | `create a Users table:` + fields | Types, constraints, defaults |
| Save (insert) | `save signup as new User` | Var name = incoming entity |
| Look up one | `look up User where id is 5` | |
| Look up all | `look up all Users` / `get all Users` | Optional `where` clause |
| Delete | `delete the User with this id` | |
| Update | `save profile to Users` | Var name = incoming entity |
| Belongs to | `author belongs to Users` | Foreign key. `get all Posts` auto-stitches the referenced record on read (JS + Python). |
| Background jobs | `background 'name': runs every 1 hour` | Compiles to `setInterval`; cleaned up on SIGTERM + SIGINT via `_scheduledCancellers` registry. |
| Scheduled cron | `every 5 minutes:` / `every day at 9am:` | Interval or HH:MM recurrence; both wired into shutdown-safe cancellation. |
| File upload (client) | `upload doc to '/api/upload'` | FormData + fetch POST. |
| File upload (server) | auto-wired on POST endpoints that match client upload URLs | `_upload.any()` multer middleware with memoryStorage + 10MB default. |
| Auth-capability gate | silence `requires login` on mutation endpoints for auth-less toy apps | Compiler detects whether the app has `allow signup and login` OR a `Users` table with a `password` field. Auth-capable apps still get hard errors; auth-less apps get one advisory warning listing every public mutation. |
| Has many | `Users has many Posts` | Auto-generates nested GET endpoint |
| Search | `search Posts for query` | Case-insensitive full-text |
| Aggregates | `sum of amount in Orders` | Also `avg of`, `count of`, `min of`, `max of` |
| Connect to DB | `connect to database:` + config | PostgreSQL pool |
| Raw SQL | `query 'SELECT * FROM users' with params` | |

## Service Integrations (SERVICE_CALL)

| Service | Syntax | Env Vars |
|---------|--------|----------|
| Stripe | `charge via stripe:` + amount, currency, token | `STRIPE_KEY` |
| SendGrid | `send email via sendgrid:` + to, from, subject, body | `SENDGRID_KEY` |
| Twilio | `send sms via twilio:` + to, body | `TWILIO_SID`, `TWILIO_TOKEN` |

All compile to direct REST `fetch()` calls. No SDK required.

## Data Operations

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

## AI Agents

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

## Workflows

| Feature | Syntax | Notes |
|---------|--------|-------|
| Workflow definition | `workflow 'Name' with state:` | Multi-step process |
| State shape | `state has:` + field definitions | Typed state |
| Step | `step 'Name' with 'Agent'` | Delegates to agent |
| Step with save | `step 'Name' with 'Agent' saves to state's field` | |
| Conditional step | `if state's field is value:` + steps | |
| Repeat until | `repeat until condition, max N times:` + steps | |
| Parallel steps | `at the same time:` + steps | |
| Durable execution | `runs durably` (canonical) / `runs on temporal` (legacy) | Temporal SDK on Node, Cloudflare Workflows on `--target cloudflare` |
| Progress tracking | `track workflow progress` | State history |
| Checkpoint | `save progress to Table` | DB persistence |
| Run workflow | `result = run workflow 'Name' with data` | |

## Scheduling

| Feature | Syntax | Compiles To |
|---------|--------|-------------|
| Interval | `every 5 minutes:` + block | `setInterval` |
| Daily schedule | `every day at 9am:` + block | Cron-style scheduler |
| Scheduled agent | `agent 'Name' runs every 1 hour:` | `setInterval` in agent |
| Background job | `background 'cleanup':` + `runs every 1 hour` | `setInterval` |

## Testing

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

## Policies (App-Level Guards)

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

## Studio IDE

| Feature | Notes |
|---------|-------|
| Three-panel layout | CodeMirror editor + preview/terminal + Claude agent chat |
| 43 template apps | Dropdown selector |
| Light/dark theme | Toggle |
| Save to Desktop | Download .clear file |
| Compile + run + test | All from browser |
| Source maps | Click preview element -> jumps to Clear source line |
| AI assistant (Meph) | Builds, compiles, fixes apps via tool use |
| Builder Mode (v0.3) | `?studio-mode=builder` URL param | Marcus-first layout — preview hero (60vh), chat driver (40vh), editor hidden by default with toolbar Source toggle, branded Publish button. v0.2 added a Marcus-first tile gallery on empty preview (5 featured apps + "See more"). v0.3 added a 3-ship counter (source pane defaults visible for first 3 successful Publishes, hidden after) + click-to-edit (clicking an iframe element prefills the chat input with `Change the "<text>" button/link — `). |
| First-visit onboarding | localStorage `clear-onboarding-seen` | Studio shows a one-time welcome card prepended to the chat on first load + auto-focuses chat input. Per-mode copy. Dismissed on first keystroke or × click. |
| Ghost Meph (chat backend dispatch) | `MEPH_BRAIN` env var | Routes /api/chat to local backends instead of Anthropic. Backends: `cc-agent` (spawns local `claude` CLI; text-only MVP, tool support pending), `ollama:<model>` (local Ollama daemon at `OLLAMA_HOST`), `openrouter` / `openrouter:qwen` (OpenRouter API, requires `OPENROUTER_API_KEY`). All return Anthropic-shaped SSE so /api/chat is unchanged. See `playground/ghost-meph/` and `plans/plan-ghost-meph-cc-agent-tool-use-04-21-2026.md`. |
