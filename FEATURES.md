# Clear Language — What's Built

Capability reference for the Clear compiler. The authoritative node-type spec is `intent.md`; this file is the human-readable "what can I do with Clear today?" list. Moved out of ROADMAP.md on 2026-04-21 so the roadmap can focus on what's *next*, not what's already shipped.

**Headline numbers:** 124 node types. ~2500 compiler tests. Zero npm dependencies in the compiler.
**Targets:** JS (Express), Python (FastAPI), HTML (DaisyUI v5 + Tailwind v4), Cloudflare Workers (D1 + Workflows + Cron Triggers).

---

## Exec summary — what Clear can do today, in plain English

Scan this in 30 seconds. If you remember Clear can do something but can't remember the syntax, this list points you at the section below.

**Build full apps by writing English**
- Write a working web app — frontend + backend + database — in one `.clear` file.
- Add login + signup in one line; get JWT auth + bcrypt + role-based access for free.
- Make pages with forms, tables, charts, dashboards — reactive, no React/Vue/build step.
- Save, look up, search, paginate, aggregate — all CRUD compiles to safe parameterized SQL.
- Validation, rate limiting, CORS, file uploads, signed cookies — one-liners.
- App shell (`app_layout`, `app_sidebar`, `app_main`, `app_header` presets) compiles to a polished slate-on-ivory chrome — semantic `<aside>`/`<main>`/`<header>`, 240px rail, 56px sticky header, brand/breadcrumb/action slots ready to wire.

**Talk to Claude inside your code**
- Ask Claude for an answer in one line; auto-retries on rate limits, no plumbing.
- Give an agent tools (call your own functions), memory (cross-session), and a knowledge base (RAG over your tables, files, or URLs).
- Stream responses by default; opt-out with one phrase.
- Multi-step workflows with conditional branches and parallel steps.
- Schedule agents to run every hour, every day at 9am, etc.

**Test by writing English**
- Auto-generated tests from your source — every endpoint, every page, every agent gets probed.
- Write your own tests in plain English (`can user create a todo`).
- Run evals on agents from Studio — cost-gated modal, per-row chips, real-time streaming.

**Run anywhere**
- Same Clear file → Node + Express, or Python + FastAPI, or Cloudflare Workers + D1.
- Cloudflare target gets cron triggers, Workflows for durable agents, Web Crypto auth automatically.
- Deploy to Fly with one click from Studio; rollback to any prior version.
- After the first deploy, every Publish click is an incremental update — new bundle live in ~2s, schema changes ask before reshaping the database, rollback to any of the last 20 versions is one click.

**Edit your live app while users are using it (LAE)**
- Open your deployed app in the browser → 🔧 widget → "add a region field" → ship in 4 seconds.
- Existing users keep their unsaved form data; new fields appear empty.
- Owner-only; non-owners see no edit surface.
- Phase A (additive) + Phase B (reversible — hide, rename, reorder, with cloud rollback) shipped.

**Studio IDE + Meph the AI builder**
- Three-panel: editor + preview + Meph chat. Meph writes Clear, compiles, runs, tests, fixes errors.
- Builder Mode (`?studio-mode=builder`) — preview hero (60vh), chat-first, click-to-edit, branded Publish button.
- 43 template apps in dropdown; first-visit onboarding card; route selector + multi-page nav.
- Ghost Meph: route /api/chat to local Claude Code, Ollama, or OpenRouter for $0 research sweeps.

**Developer tooling (Dave-first wedge)**
- VSCode + Cursor extension with autocomplete + live diagnostics.
- Zero-dep `clear-lsp` Language Server (stdio JSON-RPC).
- Compiler-as-API on Cloudflare Workers (`POST /compile` returns JSON).
- Namespaced module imports: `use 'ui'` then `show ui's Card('Revenue')`.

**Hostile to bugs by construction**
- 30+ bug classes blocked at compile time: SQL injection, auth bypass, mass assignment, missing rate limits, sensitive-field exposure, undefined variables, type mismatches, frontend-backend URL drift, etc.
- Every CRUD = parameterized; every error response = PII-redacted; every `display X` = XSS-escaped.
- Termination bounds: every `while` capped at 100 iterations, every recursive function capped at 1000 depth, every `send email` 30s timeout, every `ask claude` retries on transients.
- Compiles deterministically: same input → byte-for-byte identical output, every time.

### Maintenance rule for this exec summary

**When you ship a new substantive capability, add ONE plain-English line here.** Group it under whichever heading fits, or add a new heading if it's a genuinely new category. Test for inclusion: "would Russell scan this list and feel a 30-second hell-yes about Clear?" If yes, add. If no — it's a syntax variant or alias, just add a row to the table below, not the exec summary.

**Plain English means:**
- 14-year-old test — no jargon ("HMAC", "JWT", "bcrypt", "Promise.race"), no node-type names, no function names.
- Say what it DOES, not what it's CALLED. Not "`set signed cookie 'name' to value`" — say "Tamper-proof cookies in one line."
- Hide the syntax. The rows below carry the exact form. The exec summary is for "yes Clear does X."
- Keep each line under ~20 words.

**When in doubt, write it both ways and pick the one a stranger would understand.**

---

## Core Language

| Feature | Syntax | Notes |
|---------|--------|-------|
| Variables | `x = 5` / `name is 'Alice'` | `=` for numbers, `is` for strings/booleans |
| Functions | `define function greet(name):` | Typed params (`is number`), typed returns |
| For-each loop | `for each item in items:` | Also `for each key, value in map:` |
| While loop (auto-bounded) | `while count is less than 10:` / `while cond, max N times:` | Default cap 100 iterations (tight — fail fast on hallucinated hangs); overflow throws a legible error (PHILOSOPHY Rule 18) |
| Recursive function (depth-capped) | `define function walk(n): ... walk(n - 1) ...` / `define function walk(n) max depth 50:` | Default depth 1000; override with `max depth N`; exceed → `"X recursed more than N levels"` throw |
| Send email with timeout | `send email to 'x@y.c': subject 'hi' body 'hi' with timeout 60 seconds` | Default 30s; applies on JS (Promise.race) + Python (smtplib timeout) |
| AI calls auto-retry | `reply is ask claude 'hi'` | Retries 429/5xx/network transients with 1s/2s/4s exponential backoff across Node/CF/browser/Python |
| Repeat loop | `repeat 5 times:` | |
| If / else | `if x is 5:` ... `otherwise:` | Also inline: `if x is 5 then show 'yes'` |
| Match / when | `match x:` + `when 'a':` + `otherwise:` | Pattern matching |
| Try / catch | `try:` + `if error:` | Typed handlers: `if error 'not found':` (404) |
| Live block (effect fence) | `live:` + indented body | Explicit label for code that talks to the world (`ask claude`, `call API`, `subscribe to`, timers). Permissive in Phase B-1 (2026-04-25); Phase B-2 will require effect-shaped calls to sit inside `live:`. See PHILOSOPHY Rule 18. |
| Break / continue | `stop` / `skip` | |
| Comments | `# text` | |
| Modules | `use 'helpers'` | Namespaced, selective, or inline-all |
| Script escape | `script:` + raw JS | For anything Clear doesn't cover |
| Transactions | `as one operation:` / `atomically:` / `transaction:` / `begin:` | BEGIN/COMMIT/ROLLBACK |

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
| Field projection | `pick name, email from user` | Returns subset of fields; works on records and lists |

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
| On scroll (throttled) | `on scroll every 100ms:` / `on scroll every 1 second:` | Leading-edge throttle; load-more-near-bottom pattern |
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
| Bar | `bar chart 'Sales' showing data` / `display Sales as bar chart` | ECharts |
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
| File uploads | `accept file:` + max size, allowed types | Multer auto-wired on POST endpoints whose URL matches a client `upload X to '/api/...'` call |
| Cookies (plain) | `set cookie 'name' to value [for N days/hours/minutes]` / `cookie = get cookie 'name'` / `clear cookie 'name'` | Secure-by-default (`sameSite: 'lax'`, `secure` when `NODE_ENV=production`); maxAge from `for N days` |
| Cookies (signed) | `set signed cookie 'name' to value` / `get signed cookie 'name'` | HMAC via `cookie-parser(secret)`; requires `COOKIE_SECRET` env (warns loudly if unset, generates ephemeral fallback) |
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
| Upsert | `upsert user to Users by email` | Match-or-insert on a field; preserves id on hit, returns canonical record either way (JS + Python parity) |
| Tables — three lead forms | `create a Users table:` \| `table Users:` \| `create data shape User:` | All three parse identically. Shorthand `table X:` added in session 45. |
| Field declarations — two forms | `price, number, required` (comma) \| `name is text, required` (is) | Both compile to the same schema entry. |
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

## Live App Editing (LAE — Phase A + B shipped)

Conversational edits to a running, deployed Clear app. Owner authenticates, opens the app, types a change in the floating Meph widget, sees a diff preview, ships. Phases A + B cover additive (add field/page/endpoint) and reversible (hide, rename, relabel, reorder) edits with data + session preservation. Phase C (destructive) and Phase D (audit log + concurrent guard + dry-run) are still on the roadmap.

| Feature | What it does |
|---------|--------------|
| In-browser edit widget | Floating 🔧 badge on the running app — auto-injected on apps with `allow signup and login`. Opens Meph chat at `/__meph__/api/*` (proxied to `STUDIO_PORT`; clean 503 when env var absent in production). |
| Owner-only authorization | `liveEditAuth` middleware checks JWT + owner role before allowing edits. |
| Change classifier | Every diff classified `additive` / `reversible` / `destructive`. Additive ships instantly; reversible needs one-click confirm; destructive requires typed confirmation + reason string + audit entry (Phase C — not yet built). |
| Cloud rollback | `/__meph__/api/cloud-rollback` — point cloud-deployed apps back to a prior version. Studio Ship + Undo route to cloud paths when on a deployed app. |
| Versions table | `versions[]` + `secretKeys` per app (`tenants-db`) — Phase B prereq for incremental updates without losing in-flight work. Capped at 20 entries per app in tenants-db (older versions stay queryable on Cloudflare's side via `listVersions`). |
| Cloudflare incremental update | Deploy mode `update` patches a deployed Worker without rebundling — re-uploads bundle only, skips D1 reprovision + domain reattach + full secrets push. Wall clock ~2s vs ~12s for fresh deploy. |
| Schema-change confirm gate | `migrationsDiffer()` byte-compares both `migrations/*.sql` and `wrangler.toml` between live + new bundles. Differences pause the update and return `409 MIGRATION_REQUIRED` with a per-file diff. Re-POST with `confirmMigration: true` applies the migration before uploading the new code. |
| One-click rollback (Studio) | Version history panel inside the Publish window lists the last 20 versions with timestamps; Rollback button calls `/api/rollback`, records a tombstone version with `note: 'rollback-from-vN'`. Currently-live version shows "Current" label, no button. |

## Developer Tooling (Dave-first wedge — shipped 2026-04-24)

The "language your coding agent writes without retries" surface. Editor integration + remote Compiler API. See `ROADMAP.md` → "Strategic pivot under review (2026-04-24) — Dave-first wedge" for status; this section documents what's built.

| Component | Where | What it does |
|-----------|-------|--------------|
| **Compiler API** (`compiler-api/worker.js`) | Cloudflare Worker | POST `/compile` wraps `compileProgram()`. Accepts single source or multi-file via `modules` dict. Structured-JSON telemetry per request. 1MB source cap. Permissive CORS for browser/IDE callers. Deploy with `wrangler deploy` after pasting Cloudflare account into `wrangler.toml`. 12 passing tests. |
| **`clear-lsp`** (`clear-lsp/server.mjs`) | Zero-dep stdio LSP | JSON-RPC framing (single, multi, split-chunk). Diagnostics via the Compiler API (debounced 400ms). Local scan for keyword + component + function + page completions. 13 passing tests. |
| **VSCode + Cursor extension** (`vscode-extension/`) | Thin LSP wrapper | TextMate grammar, language config, `clear.compilerApi` + `clear.debounceMs` user settings. F5-launch in VSCode for development. 16 structural tests against manifest + grammar + config. |
| **Namespaced component calls** | `compiler.js` | `use 'ui'` + `show ui's Card('Revenue')` works end-to-end. Bare (`Card(x)`) and namespaced (`ui's Card(x)`) calls share a single `getComponentCall()` predicate across `compileNode` SHOW-in-page, `needsReactive`, reactive JS emit, and `buildHTML`. Reactive JS emits `namespace.Card(args)` when namespaced. |
| **`landing/for-developers.html`** | Static | Dave-targeted landing page. "The language your coding agent writes without retries", side-by-side TS+Cursor vs Clear, 4-metric comparison row, 3-step install (CLI + extension + scaffold). |
| **`landing/dave.clear`** | Self-hosted | Proof-of-concept one-file landing page written in Clear itself. Compiles to a static HTML/JS/CSS bundle. Shows the language can build its own marketing surface. |

**Verification gates Russell still owes** before D-6 (HN launch): `wrangler deploy` for the Compiler API, F5-test the VSCode extension locally, `npm publish` for clear-lsp + clear-cli + the extension, eyeball `landing/for-developers.html` + Lighthouse pass.

---

## Compile Targets

| Target | How to select | What ships | Notes |
|--------|---------------|------------|-------|
| **JavaScript (Node + Express)** | default | `server.js` + `index.html` + `package.json` | Local memory / SQLite / PostgreSQL / Supabase backends |
| **Python (FastAPI)** | `compile target: python` or CLI flag | `server.py` + `requirements.txt` | Mirrors JS feature surface; TEST_INTENT still stubs as `pytest.skip` |
| **HTML scaffold** | implicit (every app) | `index.html` + DaisyUI v5 + Tailwind v4 + Lucide icons | Auto-generated ASCII architecture diagram at top of compiled file |
| **Cloudflare Workers** | `compile target: cloudflare` | Workers bundle + `wrangler.toml` (pinned compat date + flags) + D1 migrations | All 8 core templates compile clean; auth uses webcrypto; streaming via ReadableStream; tool-use Workers-safe; agents emit to shared `src/agents.js` for cross-module calls |

**Cloudflare-specific capabilities (auto-selected when target is `cloudflare`):**

| Feature | Compiles To | Notes |
|---------|-------------|-------|
| Database (any CRUD) | D1 prepare/bind/run | `runtime/db-d1.mjs` matches `runtime/db.js` interface; UPDATE requires id with instructive error |
| Where clauses | D1 parameterized binds | SQL injection-safe by construction |
| Auth (`allow signup and login`) | webcrypto hashPassword + constant-time verifyPassword | Replaces bcrypt for Workers compatibility |
| AI calls (`ask claude`) | `_askAI_workers` (fetch-only) | Streaming via ReadableStream; tool-use loop unchanged from Node |
| `runs durably` | Cloudflare Workflows | Vendor-neutral canonical; Node target uses Temporal |
| `every X` / `every day at 9am:` | Cloudflare Cron Triggers (cron expressions in `wrangler.toml`) | Duration phrases auto-convert |
| `knows about: <Table>` | Lazy-load from D1 at request time | Compile-time inline for text/PDF/DOCX (size-gated, warns on oversized) |
| `knows about: '<URL>'` | Lazy-fetch on first request | Per-Worker cache |

---

## Compiler Guarantees — Bug Classes Eliminated at Compile Time

Every app compiled from Clear ships with these protections. Fix a pattern once, every app gets the fix on recompile.

### Security (compile errors — can't ship these bugs)

| Bug Class | How It's Prevented | Validator/Compiler |
|-----------|-------------------|-------------------|
| SQL injection | All CRUD uses parameterized queries, always | `compiler.js` — `db.insert()`, `db.query()` with param binding |
| Auth bypass | DELETE/PUT without `requires login` = compile ERROR | `validateSecurity()` |
| Mass assignment | `_pick()` strips unknown fields from request body | `compiler.js` — generated `_pick()` helper |
| CSRF | Data-mutating endpoints without auth = error | `validateOWASP()` |
| Path traversal | File ops with variable paths = warning | `validateOWASP()` |
| PII in errors | Passwords/tokens/keys auto-redacted from error responses | `_clearError()` — `redact()` function |
| Sensitive field exposure | Schema has `password`/`secret`/`api_key` = warning | `validateSecurity()` |
| Brute force | Login/signup without rate limiting = warning | `validateSecurity()` |
| Overly permissive CORS | CORS enabled + no auth on endpoints = warning | `validateSecurity()` |

### Correctness (compile errors or warnings — caught before runtime)

| Bug Class | How It's Prevented | Validator |
|-----------|-------------------|-----------|
| Undefined variables | Forward reference check with typo suggestions | `validateForwardReferences()` |
| Type mismatches in math | String used in arithmetic = error | `validateInferredTypes()` |
| Frontend-backend URL mismatch | Fetching `/api/user` when endpoint is `/api/users` = warning | `validateFetchURLsMatchEndpoints()` |
| Missing responses | Endpoint without `send back` = warning | `validateEndpointResponses()` |
| Schema-frontend field mismatch | Sending `username` to table with `user_name` = warning | `validateFieldMismatch()` |
| Duplicate endpoints | Same method+path declared twice = warning | `validateDuplicateEndpoints()` |
| Undefined function/agent calls | Calling undefined agent or pipeline = error | `validateCallTargets()` |
| Type errors in function calls | Literal arg doesn't match typed param = error | `validateTypedCallArgs()` |
| Member access on primitives | `score's name` where score is a number = warning | `validateMemberAccessTypes()` |
| Agent tool mismatches | Agent references undefined function as tool = error | `validateAgentTools()` |

### Business Logic (warnings — common mistakes caught)

| Bug Class | How It's Prevented | Validator |
|-----------|-------------------|-----------|
| Negative balance/stock | Subtracting without guard = warning | `validateArithmetic()` |
| Overbooking | Inserting without capacity check = warning | `validateCapacity()` |
| Deep property chains | 4+ levels of possessive access = warning | `validateChainDepth()` |
| Complex expressions | 3+ operators in one expression = warning | `validateExprComplexity()` |
| Invalid classification | Classify with < 2 categories = error | `validateClassify()` |

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
| Cross-tenant data leakage | Not prevented | Row-level security not auto-enforced |
| Type safety on external returns | Not prevented | `ask ai` returns untyped string |
| Sensitive data in logs | Partial | `_clearError()` redacts, but `log every request` logs full bodies |
| Promise rejection handling | Not prevented | Async without error handler swallows errors |

### Type System Assessment

**Current state:** Limited inference (literals + function params). Catches type mismatches in arithmetic and function calls.

**Recommendation:** Not needed yet for enterprise internal tools market. The 27 security/correctness guarantees matter more than type safety for CRUD apps. Revisit when targeting engineering teams who compare to TypeScript.

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
| E-commerce | Stripe checkout flow |
| Monitoring | Slack/PagerDuty webhook format |

### Tier 3 — Wrong tool for the job

| App | Why |
|-----|-----|
| Collaborative editing | Operational transforms, conflict resolution |
| Video / audio calls | WebRTC, media streams, STUN/TURN |
| Mobile apps | Clear targets web only |
| Games | Canvas/WebGL, physics, sprites |
| Social media feeds | Algorithmic ranking, infinite scroll, image pipelines |

---

## Not Building (and Why)

These are deliberate non-goals. Each has been considered and rejected.

| Feature | Reason |
|---------|--------|
| OAuth / social login | `allow signup and login` covers MVPs. OAuth is a rat's nest. |
| Soft delete | `deleted_at` field + filter. Not worth a keyword. |
| Geolocation | One-liner `script:` call. Niche browser API. |
| Camera / microphone | One-liner `script:` call. Niche. |
| Speech to text / text to speech | One-liner `script:` call. Niche. |
| Push notifications | Service workers + VAPID keys. Too much plumbing. |
| Drag and drop | HTML5 events via `script:`. Niche. |
| Infinite scroll | IntersectionObserver via `script:`. Performance concern, not language feature. |
| Per-user app forks | Every employee seeing a fundamentally different version of the app destroys the shared ontology. Audit/compliance nightmare. See Live App Editing in ROADMAP for the right answer (owner-initiated changes that ship to everyone). |
