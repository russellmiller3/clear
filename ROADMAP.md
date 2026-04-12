# Clear Language — Roadmap

## Goals

**1. AI builds things fast.**
Clear is the language AI writes. Short programs, readable output, deterministic compiler.
The faster Meph's write->compile->run->fix loop, the more it ships.

**2. The language is hostile to bugs.**
Catch mistakes at compile time, not runtime. Inferred types, structured errors, source maps,
deterministic output. If the compiler accepts it, it should work. Every bug class the
compiler eliminates is a class no one wastes time debugging again.

**3. Russell builds faster with fewer bugs.**
Clear should let Russell describe what he wants and get working software. Not a toy —
real apps with auth, data, AI agents, dashboards. The bar: faster than writing JS by hand,
with fewer bugs and less cognitive load.

**Future:** Other people might benefit. If Clear is good enough for Russell and Meph, it
might be good enough for others.

---

## Surface Area Rule

Not every browser API needs a Clear keyword. The language covers the primitives that show
up in most apps. The rest — geolocation, camera, microphone, speech-to-text, text-to-speech,
push notifications, service workers, drag-and-drop — are one-line `script:` calls.

Adding a keyword for each one bloats the parser, grows the test surface quadratically
(every new node type x every context it can appear in), and violates the 1:1 mapping rule
(PHILOSOPHY.md rule 11b). The bar for a new keyword: "does Meph need this in >30% of apps?"

Per PHILOSOPHY.md rule 12b: every `script:` block in a Clear app is a signal that the
language has a gap. But not every gap is worth closing with a keyword. Some gaps are narrow
enough that `script:` is the right answer permanently.

---

## What's Next

Ordered by: what unblocks the most apps, fastest.

Scored on **Speed** (how much faster does this make building?) and **Safety** (how many
bugs does this prevent?).

---

### 1 — Auth Scaffolding

`allow signup and login` — one line scaffolds /auth/signup, /auth/login, /auth/me endpoints
with password hashing, JWT tokens, and a `needs login` frontend guard.

Every real app needs auth. Right now Meph manually writes 3+ endpoints, password hashing,
JWT signing, token storage, and a frontend guard. That's the #1 source of boilerplate and
the #1 thing that breaks — too many moving parts for something that should be one line.

```
allow signup and login

page 'Dashboard' at '/':
  needs login
  heading 'Welcome back'
```

This honors the "fixes compound" principle (PHILOSOPHY.md): fix auth once in the compiler,
every app gets correct auth forever. No more Meph reinventing bcrypt + JWT per project.

**Speed:** ★★★★★  **Safety:** ★★★★★  **Effort:** 2 days

---

### 2 — DB Relationships

`belongs to`, `has many` — declare relationships between tables. CRUD operations auto-JOIN.

Every app with 2+ tables needs this. Without it, Meph writes raw queries or makes multiple
API calls and stitches data client-side. Multi-table apps are the norm, not the exception.

```
create a Posts table:
  title
  body
  author belongs to Users

create a Comments table:
  text
  post belongs to Posts
```

Automatic: GET /api/posts returns posts with author name embedded.
Automatic: GET /api/posts/1/comments returns nested comments.
Each relationship is one line in Clear, one JOIN in compiled output. 1:1 mapping preserved.

**Speed:** ★★★★★  **Safety:** ★★★★  **Effort:** 3 days

---

### 3 — Server-side Validation (fix existing)

The VALIDATE node exists but doesn't compile to real 400 responses with field-level errors.
Fix it to emit proper validation middleware that rejects bad data before it hits the DB.

```
when user calls POST /api/users sending data:
  validate data:
    name is text, required, min 1, max 100
    email is text, required
    age is number, min 0, max 150
  save data as User
  send back data status 201
```

Compiles to: check each field, collect errors, return `{ errors: [...] }` with 400 status.
Currently compiles to incomplete checks. Invalid data is the most common runtime bug in
web apps. This is "hostile to bugs" in action — make it impossible to save garbage.

**Speed:** ★★★★  **Safety:** ★★★★★  **Effort:** 1 day

---

### 4 — Aggregate Functions (fix existing)

`sum of`, `average of`, `count of` — should return a number, not the raw array.
Currently returns the unmodified array. Silent wrong values are worse than crashes.

```
total_revenue = sum of amount in Orders
average_price = average of price in Products
user_count = count of Users
```

These are already in PHILOSOPHY.md's canonical vocabulary (rule 14). They parse but
compile wrong. Quick fix, high value — every dashboard needs aggregates.

**Speed:** ★★★  **Safety:** ★★★★★  **Effort:** 0.5 days

---

### 5 — Full Text Search ✅

`search Posts for query` compiles to case-insensitive filter across all fields.

```
when user calls GET /api/search sending params:
  results = search Posts for params's query
  send back results
```

Compiles to: `db.findAll().filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(query.toLowerCase())))`

---

### 6 — WebSocket Events ✅

`subscribe to 'channel':` + `broadcast to all message` both work. Full WebSocket
server with connection tracking, heartbeat, and cleanup.

```
subscribe to 'chat':
  broadcast to all message
```

`broadcast` compiles to `wss.clients.forEach(c => c.send(...))`.

---

### 7 — Agent Memory + Keyword Search ✅

`knows about: Products` does keyword matching across tables. `remember conversation context`
loads and saves conversation history. Memory save bug fixed — postamble injected before
return statement.

```
agent 'Assistant' receives question:
  remember conversation context
  knows about: Products, FAQs
  response = ask claude 'Help the customer' with question
  send back response
```

**Future:** Real RAG with pgvector on Supabase for semantic search over large
unstructured text.

---

### 8 — Agent Tool Use ✅

`can use: fn1, fn2` compiles to proper Anthropic tool schemas with correct parameter
names and types. Tool dispatch loop with 10-turn max, error handling.

```
agent 'Support' receives question:
  can use: lookup_user
  response = ask claude 'Help the user' with question
  send back response
```

---

### 9 — String Concat ✅

`'Hello, ' + name + '!'` works correctly in all modes (script, web, backend).
Regression tests added. Interpolation (`'Hello, {name}!'`) also works.

---

### 10 — Python Frontend Serving ✅

FastAPI serves `index.html` at root + static files via `StaticFiles` mount.
Full-stack Python apps work in the browser.

Compiles to: `FileResponse("index.html")` + `app.mount("/", StaticFiles(...))`

---

### 11 — `has many` Relationships ✅

`has many Posts` in a table field generates nested GET endpoints automatically.

```
create a Users table:
  name
  posts has many Posts

create a Posts table:
  title
  author belongs to Users
```

Generates: `GET /api/users/:id/posts` — returns all posts where author matches the user ID.

---

### 12 — Agent Argument Guardrails ✅

`block arguments matching 'pattern1', 'pattern2'` adds regex-based input filtering
that runs BEFORE tool execution. Compiled code — no prompt injection can bypass it.

```
agent 'Builder' receives task:
  can use: run_command
  block arguments matching 'rm -rf', 'drop table'
  response = ask claude 'Build' with task
  send back response
```

Compiles to: each tool function wrapped with regex guard. If arguments match,
throws `'Blocked by guardrail'` before execution.

---

## What You Can Build (as of 2026-04-11)

After items 1–10 + `has many`, Clear covers variables, functions, loops, conditionals,
web UI (pages, routing, reactive state, inputs, charts, tables, cards), full REST backends,
CRUD (in-memory/SQLite/Supabase), auth, DB relationships, AI agents (RAG, tool use,
memory, pipelines), WebSockets, scheduling, file I/O, email, PDF generation, testing,
and workflows.

### Tier 1 — No compromises, ship in an hour

These apps use only first-class Clear keywords. No `script:` needed.

**Internal tools / admin dashboards**
- User management with roles, search, CRUD
- Order tracking with charts, filters, aggregate stats
- Inventory system with categories (`has many`), low-stock alerts (scheduled job), CSV export
- Support ticket tracker with assignment, status workflow, email notifications

**AI-powered apps**
- Customer support bot with RAG over product catalog + conversation memory
- Content generator with structured JSON output, human approval gate, save to DB
- Internal Q&A agent that searches across company tables
- Multi-agent pipeline: intake → classifier → specialist → response

**Simple SaaS MVPs**
- Waitlist page + admin dashboard with count/growth chart
- Feedback collector: public form → validated → stored → admin dashboard with filters
- Booking system: available slots, user picks one, confirmation email, admin view
- Survey builder: create questions, public survey page, results with charts

**Data apps**
- CSV upload → clean → display as table/charts → export
- API aggregator: fetch from 3 external APIs, combine, display dashboard
- Scheduled report: every morning, query DB, generate PDF, email it

### Tier 2 — 90%+ Clear, minor `script:` assists

**Project management (Linear-lite)** — tasks, statuses, belongs-to-project, has-many
comments, dashboard with charts, search. `script:` for drag-and-drop kanban only.

**Blog / CMS** — posts, authors, comments, tags, auth, search, all native.
`script:` for rich text editing (markdown preview textarea).

**Chat apps** — WebSocket broadcast, conversation memory, auth, all native.
`script:` for scroll-to-bottom and typing indicators.

**E-commerce storefront** — products, reviews, categories, cart, order creation, email.
`script:` for Stripe checkout (payment APIs are inevitably complex).

**Monitoring / alerting** — scheduled health checks, store results, chart uptime,
email on status change. `script:` for Slack/PagerDuty webhook format.

### Tier 3 — Real walls, wrong tool for the job

| App type | Why it doesn't fit |
|----------|-------------------|
| **Collaborative editing** (Google Docs) | Operational transforms, cursor sync, conflict resolution — far beyond WebSocket broadcast |
| **Video / audio calling** | WebRTC, media streams, STUN/TURN servers |
| **Mobile apps** | Clear targets web only |
| **Games** | Canvas/WebGL rendering loop, physics, sprites |
| **IDE / code editor** | CodeMirror/Monaco integration, syntax highlighting, LSP |
| **Social media with feeds** | Algorithmic ranking, infinite scroll, complex caching, image pipelines |
| **Marketplace with payments** | OAuth for sellers, escrow, disputes, Stripe Connect — too many moving parts |

### Bottom line

Clear after items 1–10 is a **full-stack framework for internal tools, AI apps,
dashboards, and SaaS MVPs**. That's ~60–70% of what people actually build. The things
it can't do are niche (video, games) or enterprise-scale (collaborative editing,
marketplaces). Meph builds Tier 1 apps in minutes. The same app in Express + React
is 2000+ lines across 20 files.

---

## Not Now

Real features, but they have workarounds or don't clear the Surface Area Rule bar.

| Feature | Verdict | Reasoning |
|---------|---------|-----------|
| **OAuth / social login** | Correct deferral | `allow signup and login` covers MVP apps. OAuth is a rat's nest (passport.js, callback URLs, provider-specific quirks). Add when a specific app needs Google login. |
| **Agent guardrails** | **✅ Done** — item 12 | `can use:` whitelists tools, `block arguments matching` adds regex filter on tool inputs. Deterministic safety, compiled into code. |
| **Cookies** | Skip permanently | JWT is the right auth pattern for Clear apps. Cookies are a different paradigm with no upside here. |
| **DB transactions** | Skip for now | In-memory and SQLite handle this implicitly. Only needed for Supabase multi-table writes. Rare enough to defer. |
| **Upsert** | Skip permanently | `save` + `get first where` is 2 lines. Not worth a keyword. |
| **Soft delete** | Skip permanently | `deleted_at` field + filter. Two lines, not a keyword. |
| **Transform data** | Skip permanently | `filter` + `for each` covers it. |
| **Text in for-each** | Skip (architectural) | Loop rendering needs a rethink. `script:` works. Not a quick fix. |
| **Geolocation** | `script:` permanently | One-liner: `navigator.geolocation.getCurrentPosition(...)`. Niche browser API. |
| **Camera / microphone** | `script:` permanently | One-liner: `navigator.mediaDevices.getUserMedia(...)`. Niche. |
| **Speech to text** | `script:` permanently | `new SpeechRecognition()`. Niche. |
| **Text to speech** | `script:` permanently | `speechSynthesis.speak(...)`. Niche. |
| **Push notifications** | Skip indefinitely | Service workers, VAPID keys, server infra. Way too much plumbing for a keyword. |
| **Service worker / PWA** | Skip indefinitely | Deployment concern, not language feature. |
| **Drag and drop** | `script:` permanently | HTML5 drag events. Niche interaction pattern. |
| **Tooltip / popover** | Not a compiler concern | DaisyUI CSS classes handle this. |
| **Infinite / virtual scroll** | `script:` permanently | IntersectionObserver. Performance optimization, not language feature. |
| **Skeleton loading** | Not a compiler concern | DaisyUI `skeleton` class. CSS. |
| **Lazy load images** | Just do it | One-line compiler tweak (`loading="lazy"` on every `<img>`). So trivial it should be default behavior, not a feature. |

---

## Refactoring Backlog

Architectural improvements identified during roadmap 5-12 work. Not blocking features,
but compounding pain if left indefinitely.

### R1 — Decompose `compileAgent()` (compiler.js)

The agent compiler is a 300-line monolith with 7 feature sections (streaming, tools,
observability, conversation, memory, RAG, guardrails) that all mutate `preamble`,
`bodyCode`, and `postamble` via string manipulation and regex replacements. Each section
is a natural helper function: `applyToolUse()`, `applyMemory()`, `applyRAG()`, etc.

**Why it matters:** Every new agent feature (guardrails was the latest) requires
understanding the whole function to know where to inject code. String regex replacements
on bodyCode are fragile — they break when the target pattern changes slightly.

**Effort:** 1-2 days. **When:** Before adding more agent features.

### R2 — Deduplicate JS/Python CRUD compilation

JS and Python backend CRUD handlers have parallel logic with duplicated patterns.
A shared "CRUD spec" intermediate representation could generate both from one source.

**Why it matters:** Every CRUD feature (relationships, validation, search) has to be
implemented twice — once for JS, once for Python. Bugs in one are often missed in the other.

**Effort:** 2-3 days. **When:** When Python support becomes a priority.

### R3 — Frontend source maps (click-to-highlight for HTML)

Click-to-highlight only works for compiled JS/Python, not HTML output. Frontend pages
compile to HTML elements, not JS statements, so there are no `// clear:N` markers.

Would need a different kind of mapping: Clear line → HTML element ID or data attribute.
The compiler could emit `data-clear-line="5"` on each generated element, and the IDE
could highlight those in the preview.

**Effort:** 2-3 days. **When:** When Studio IDE polish becomes a priority.

---

## What's Next — Studio + Quality

Ordered by impact. These aren't language features — they're platform quality.

### N1 — ClearMan (built-in API tester)

The API tab already lists endpoints. Add a "Try it" button per endpoint that sends
a request and shows the response inline. POST/PUT get a JSON body editor.
Basically Postman built into Studio.

**Why:** Meph already has `http_request` tool. ClearMan is the same thing for humans.
No switching to Postman or curl — test endpoints where you write them.

**Effort:** 1-2 days

---

### N2 — Playwright Template Tests (Core 7)

56 templates exist. Most are redundant (8 landing pages, 5 dashboards, 3 CRMs,
3 todos, 4 blogs). Focus on 7 core archetypes — one per category, each
showcasing different features. Every button works, every endpoint responds,
every CRUD flow completes.

**Core 7 templates:**

| # | Template | Archetype | Features Showcased |
|---|----------|-----------|-------------------|
| 1 | `todo-fullstack` | CRUD basics | Tables, endpoints, auth, validation, pages |
| 2 | `crm-pro` | Data dashboard | Charts, filters, search, aggregates, `has many` |
| 3 | `blog-fullstack` | Content app | `belongs to`, rich display, public + admin pages |
| 4 | `live-chat` | Real-time | WebSocket, `subscribe to`, `broadcast to all`, auth |
| 5 | `helpdesk-agent` | AI agent | `ask claude`, `can use:`, `knows about:`, `remember`, guardrails, keyword search |
| 6 | `booking` | Workflow | Multi-step logic, validation, email, scheduling |
| 7 | `expense-tracker` | Personal app | CRUD, aggregates, charts, CSV export, categories |

**Per template, Playwright verifies:**
- Page loads without console errors
- CRUD happy path (create → appears in list → update → verify → delete → gone)
- Forms validate required fields
- Auth flow (signup → login → protected page loads)
- API endpoints return expected status codes (via ClearMan / fetch)
- No dummy tabs, no dead buttons, no display-only data

**Update templates first** to use all new features (search, has many, broadcast,
guardrails) before writing tests. Tests become the acceptance criteria.

Run with: `node playground/e2e.test.js`

**Effort:** 3-5 days (update 7 templates + write tests)

---

### N3 — Compiler-Generated Tests

The compiler knows the schema: tables, fields, endpoints, pages. Auto-generate
happy path tests from the AST:

```clear
# This is what the compiler would emit automatically:
test 'POST /api/todos creates a record':
  call POST /api/todos with title is 'Test'
  expect response status 201

test 'GET /api/todos returns array':
  call GET /api/todos
  expect response status 200

test 'DELETE /api/todos/:id removes record':
  call POST /api/todos with title is 'Delete me'
  id = response's id
  call DELETE /api/todos/{id}
  expect response status 200
```

Add a "Tests" tab in Studio that runs these with one click.

**Why:** No other language does this. The compiler has perfect knowledge of the app
structure. Auto-generated tests are free quality. Users get test coverage without
writing tests.

**Effort:** 2-3 days

---

### N4 — Multi-File Download

Download as a zip with proper file structure:
- `server.js` + `index.html` + `package.json` (JS full-stack)
- `server.py` + `index.html` + `requirements.txt` (Python full-stack)
- `index.html` only (web-only)

Currently downloads as a single file. Single files don't deploy.

**Effort:** 1 day

---

### N5 — GAN Loop (Claude Code + Meph)

Claude Code spins up Studio, tells Meph to build an app, screenshots it, grades
against Linear/Stripe quality bar, gives feedback, repeats until it's good.
Automated discriminator/generator loop.

**Why:** This is how Clear apps reach production quality without manual UI review.
The infrastructure exists — just needs orchestration.

**Effort:** 1 day to wire up, ongoing for each app

---

### N6 — Fix Server Test Suite

2 pre-existing failures:
1. Template count assertion (expects 40+, only 8 exist) — stale
2. Chat validation SSE JSON parse crash — blocks all tests after it

These block new test coverage from running in CI.

**Effort:** 0.5 days

---

### N7 — Batteries-Included Integrations

Standard outside packages with first-class Clear syntax. Like how `ask claude`
is the default LLM — give every common integration a keyword.

Each integration follows the same pattern:
1. One-line Clear syntax
2. Compiles to the standard package's API
3. Requires an env var for the API key
4. `script:` escape hatch for advanced usage

#### N7a — Stripe Checkout

```clear
create checkout for 'Pro Plan' at 29.99 monthly:
  success page '/thank-you'
  cancel page '/pricing'
```

Compiles to: Stripe Checkout Session creation + success/cancel redirects.
Env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`.

**Why:** The integration that makes Clear apps monetizable. A todo app is a demo.
A todo app with billing is a product.

**Effort:** 2 days

#### N7b — SendGrid Email

```clear
send email via sendgrid:
  to 'user@example.com'
  subject 'Welcome!'
  body 'Thanks for signing up.'
```

Already have SMTP email. SendGrid is the production-grade transport (higher
deliverability, templates, analytics). Env: `SENDGRID_API_KEY`.

**Effort:** 1 day

#### N7c — Supabase File Storage

```clear
upload file to 'avatars' bucket
download file from 'avatars' bucket
```

Compiles to: Supabase Storage API (upload, download, list, delete).
Env: `SUPABASE_URL`, `SUPABASE_KEY` (already used for DB).

**Effort:** 1 day

#### N7d — Supabase Auth (password + magic link)

```clear
allow login with email          # password-based (already have JWT version)
allow login with magic link     # passwordless email link
```

Uses Supabase Auth instead of our hand-rolled JWT system. Benefits: magic links,
email verification, password reset, session management. Supabase also supports
Google OAuth via the same API — can add `allow login with google` later.

Env: `SUPABASE_URL`, `SUPABASE_KEY`.

**Effort:** 2 days

---

## Speculative: RL Training Environment

Clear's deterministic compiler, structured errors, constrained action space, and built-in
test syntax make it a natural RL gym. The infrastructure is built.

**The blocker:** Without access to fine-tune or train a model, RL is academic. You can build
the gym, but if you can't train athletes in it, it's a demo.

**What's built (all serve goal #1 directly — none wasted):**
- Sandbox runner — isolated child process, timeout, memory limit, structured results
- Curriculum tasks — 20 benchmark tasks across 10 difficulty levels (63 tests)
- Structured eval API — `compileProgram()` returns JSON scores, stats, warnings
- Patch API — 11 structured edit operations = constrained action space
- Source maps — runtime errors map to Clear line numbers = rich observations
- HTTP test assertions — `call POST /path`, `expect response status` = reward function

**What would be needed:**
- Fine-tuning access to a capable model (Anthropic partnership, open-weight model, etc.)
- Reward shaping beyond pass/fail (partial credit for correct endpoints, types, etc.)
- Episode parallelism at scale (sandbox supports it, need orchestration layer)

If fine-tuning becomes accessible, Clear is uniquely positioned. Until then: prepared
position, not a product.

---

## Primitive Audit

### Complete (compiles + works)

**CORE LANGUAGE** ✅
Variables, functions (typed params, returns), loops (for-each, while, repeat),
conditionals (if/else, match/when), try/catch, break/continue, comments,
modules/imports, `script:` escape hatch.

**EXPRESSIONS** ✅
Math, comparisons, boolean logic, string interpolation, lists, records,
possessive access (`user's name`), map get/set, higher-order functions
(map/filter/apply), optional chaining (`?.`).

**WEB FRONTEND** ✅
Pages with hash routing, reactive state, text/number/choice/checkbox/textarea
inputs, buttons, sections, tabs, components, conditional UI blocks, on-change
with debounce. Display formats: table, cards, list, count, currency, percentage,
date, JSON, gallery (image grid), map (Leaflet), calendar (month grid), QR code.
Charts: line, bar, pie, area (ECharts). Toasts/alerts/notifications, show/hide
elements, loading overlays, clipboard copy, file download, video/audio players.

**BACKEND (JS + Python)** ✅
REST endpoints (GET/POST/PUT/DELETE), CRUD (in-memory/SQLite/Supabase),
JWT auth middleware, role guards, field validation, rate limiting, CORS,
request logging, webhooks, multer file uploads, external API fetch
(timeout/cache/fallback), email (nodemailer/SMTP), PDF generation, shell
command capture, server-sent events.

**DATA** ✅
Tables with types/constraints/defaults, CSV load/save, filter, group by,
count by, unique values, JSON parse/stringify, regex find/match/replace,
date/time operations.

**AI / AGENTS** ✅
Agent definitions, `ask claude` with streaming, structured JSON output
(schema enforcement), agent pipelines, parallel agents, skills, human
confirmation gates, mock AI for testing, model selection.

**WORKFLOWS** ✅
Multi-step workflows, state management, conditional steps, repeat-until,
parallel steps, auto-generated endpoints, progress tracking.

**FILE I/O** ✅
Read/write/append/exists, JSON parse/stringify, regex find/match/replace,
date/time operations, file upload (multer).

**SCHEDULING** ✅
`every N minutes`, `every day at 9am`, error handling (try/catch wrapping),
Python lifespan context manager.

**TESTING** ✅
Test blocks, HTTP assertions (`call POST /path`, `expect response`),
mock AI, sandbox runner, structured eval API.

### Partial

**REAL-TIME** ⚠️
SSE streaming ✅, background jobs ✅, wait/sleep ✅, subscribe to channel ✅.
Missing: `when client connects/disconnects`, `broadcast to all`, `send to client`.

### Gaps (prioritized — see What's Next above)

| # | Gap | Status |
|---|-----|--------|
| 1 | Auth scaffolding (`allow signup and login`) | **✅ Complete** |
| 2 | DB relationships (`belongs to`) | **✅ Complete** |
| 3 | Validation → real 400 errors | **✅ Complete** |
| 4 | Aggregates (`sum of` → number) | **✅ Complete** |
| 5 | Full text search (`search X for Y`) | **✅ Complete** |
| 6 | WebSocket `broadcast to all` | **✅ Complete** |
| 7 | Agent memory + keyword search | **✅ Complete** (memory save bug fixed) |
| 8 | Agent tool use (`can use:`) | **✅ Complete** (schema bug fixed) |
| 9 | String `+` concat | **✅ Verified working** (regression tests added) |
| 10 | Python frontend serving | **✅ Complete** (FastAPI serves HTML + static files) |
| 11 | `has many` relationships | **✅ Complete** (nested endpoints auto-generated) |
| 12 | Agent argument guardrails (`block arguments matching`) | **✅ Complete** (regex filter on tool inputs) |

---

## Stats

- **146 node types** defined in parser
- **1699 compiler tests**, 0 failures
- **9 sandbox integration tests**
- **~241 playground tests** (server, e2e, IDE, agent)
- **Zero npm dependencies** in the compiler
- **Targets:** JS (Express), Python (FastAPI), HTML (DaisyUI + Tailwind v4)
