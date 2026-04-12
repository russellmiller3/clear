# Clear Language — Roadmap

## Vision

1. **AI builds things fast.** Clear is the language AI writes. Short programs, deterministic compiler. The faster the write->compile->run->fix loop, the more it ships.
2. **Hostile to bugs.** Catch mistakes at compile time. If the compiler accepts it, it should work.
3. **Russell builds faster.** Describe what you want, get working software. Real apps with auth, data, AI agents, dashboards.

---

## What's Built

124 node types. 1730 compiler tests. Zero npm dependencies in the compiler.
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
| Tool use | `can use: fn1, fn2` | Anthropic tool_use API |
| Skills | `skill 'Name':` + `can:` + `instructions:` | Reusable tool bundles |
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
| Run agent | `result = call 'Name' with data` | |
| Run pipeline | `result = call pipeline 'Name' with data` | |

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
| Test block | `test 'name':` + body | |
| Expect | `expect result is 42` | Equality assertion |
| HTTP test call | `call POST /api/users with name is 'Alice'` | |
| Expect response | `expect response status 201` | Also `expect response body has id` |
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

## What's Next

Ordered by impact. Builds toward the **agent harness** vision: Clear as Rails for AI agents.

### P1 — Intent Classification (new syntax)

```clear
intent = classify message as 'order status', 'return', 'general question'
match intent:
  when 'order status':
    response = ask claude 'Look up their order' with message
  when 'return':
    response = ask claude 'Process the return' with message
  otherwise:
    response = ask claude 'Help the customer' with message
```

New `CLASSIFY` node. Compiles to a lightweight Claude Haiku call that picks from a fixed list. Enables agents to route based on intent instead of processing everything linearly.

**Why:** Every real agent needs intent routing. Without it, agents are one-trick ponies.

### P2 — Send Email with Inline Recipient

```clear
send email to order's customer_email:
  subject is 'Your order has shipped'
  body is 'Track it at {tracking_url}'
```

Extends existing `SEND_EMAIL` node. Currently only supports bare `send email:` config block. This adds `to <expr>:` after `email` for cleaner syntax when the recipient is dynamic.

**Why:** Every transactional app sends email. The current config-block syntax is clunky for dynamic recipients.

### P3 — Scheduled Agent Time-of-Day

```clear
agent 'Daily Reporter' runs every 1 day at '9:00 AM':
  orders = get all Orders
  report = ask claude 'Summarize today' with orders
  send email to env('OPS_TEAM'):
    subject is 'Daily Report'
    body is report
```

Extends existing scheduled agent parser. Currently supports `runs every N unit`. Adds `at 'time'` for cron-style scheduling. Compiles to `node-cron` instead of `setInterval`.

**Why:** "Every 24 hours" and "every day at 9am" are different requirements. Business agents need clock-time scheduling.

### P4 — Convenience Syntax

| Feature | Syntax | Compiles To |
|---------|--------|-------------|
| `find all` synonym | `find all Orders where status is 'active'` | Same as `look up all Orders where ...` |
| `today` literal | `find all Orders where created_at is today` | `where created_at >= startOfToday()` |
| Multi-context `ask ai` | `ask ai 'prompt' with X, Y, Z` | `_askAI(prompt, {X, Y, Z})` |
| Expect failure | `expect calling fn(x) to fail with 'msg'` | try/catch assertion |

### P5 — ClearMan (Built-in API Tester)

"Try it" button per endpoint in the API tab. POST/PUT get a JSON body editor. Postman built into Studio.

### P6 — Compiler-Generated Tests

Auto-generate happy-path tests from the AST. The compiler knows every table, field, and endpoint. Free test coverage.

### P7 — Multi-File Download

Download as zip: `server.js` + `index.html` + `package.json`. Currently single-file. Single files don't deploy.

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

### Tier 2 — 90%+ Clear, minor `script:` for edge cases

| App | What needs `script:` |
|-----|---------------------|
| Project management | Drag-and-drop kanban |
| Blog / CMS | Rich text editing |
| Chat apps | Scroll-to-bottom, typing indicators |
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

## Stats

| Metric | Value |
|--------|-------|
| Node types | 124 |
| Compiler tests | 1730 (0 failures) |
| Sandbox tests | 9 |
| E2E tests | 80 (core 7 templates, CRUD, curriculum) |
| Playground tests | ~127 (server, IDE, agent) |
| npm dependencies | 0 (compiler is pure JS) |
| Targets | JS (Express), Python (FastAPI), HTML (DaisyUI v5 + Tailwind v4) |
