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

### 5 — Full Text Search

`search Posts for query` should compile to LIKE '%query%' (in-memory/SQLite) or full-text
search (Supabase). Currently does exact match only — useless for real search.

```
when user calls GET /api/search sending params:
  results = search Posts for params's query
  send back results
```

**Speed:** ★★★  **Safety:** ★★★  **Effort:** 1 day

---

### 6 — WebSocket Events ✅ (mostly)

`subscribe to 'channel':` compiles to a full WebSocket server with native `ws` module,
connection tracking, heartbeat/ping-pong, and automatic cleanup on close. Works for both
JS (Express) and Python (FastAPI).

```
subscribe to 'chat':
  log message
```

**Remaining gap:** `broadcast to all message` inside a handler doesn't parse as a
statement — the validator flags `broadcast` as an undefined variable. The WebSocket
infrastructure is there, just needs `broadcast` wired up as a statement type.

The roadmap's proposed `when client connects/disconnects` syntax is a different approach
than `subscribe to`. Both work. `subscribe to` is simpler and already shipped.

**Speed:** ★★★★  **Safety:** ★★★  **Effort:** ✅ Done (broadcast fix: 0.5 days)

---

### 7 — Agent Memory + Keyword Search ⚠️ (memory save bug)

`knows about: Products` does keyword matching — splits the query into words, scans all
records, scores by word overlap, injects top 5 into the prompt. Not RAG (no vectors),
but works for structured tables with <10k rows.

`remember conversation context` has a bug: the compiled code does `return response;`
BEFORE the conversation history save. The save line is dead code — memory loads but
never persists. One-line fix in compiler.js (move return after save).

```
agent 'Assistant' receives question:
  remember conversation context
  knows about: Products, FAQs
  response = ask claude 'Help the customer' with question
  send back response
```

**Future:** Real RAG with pgvector on Supabase for semantic search over large
unstructured text. Keyword matching is correct for structured tables, wrong for
"find documents similar to X" queries.

**Speed:** ★★★★  **Safety:** ★★★  **Effort:** Bug fix: 10 min

---

### 8 — Agent Tool Use ⚠️ (schema generation bug)

The `_askAIWithTools()` runtime function is correct — proper Anthropic tool_use loop
with multi-turn, tool dispatch, error handling, 10-turn max. But the compiler generates
broken tool schemas: function parameters serialize as `[object Object]` instead of
proper JSON schema properties. Claude would get a malformed tool definition.

```
define function lookup_user(email):
  set user to get first User where email is email
  return user

agent 'Support' receives question:
  can use: lookup_user
  response = ask claude 'Help the user' with question
  send back response
```

**Speed:** ★★★★  **Safety:** ★★★  **Effort:** Bug fix: 30 min

---

### 9 — String Concat Bug Fix

`message = 'Hello, ' + name + '!'` drops the variable value in some contexts.
Interpolation (`'Hello, {name}!'`) works fine, but `+` concatenation sometimes produces
`undefined`. Basic correctness — silent data loss.

**Speed:** ★★★  **Safety:** ★★★★★  **Effort:** 0.5 days

---

### 10 — Python Frontend Serving

Python backends don't serve static files. The compiled HTML exists but FastAPI has no
route for `/` or static assets. Full-stack Python apps are broken in the browser.

**Speed:** ★★★  **Safety:** ★★★  **Effort:** 0.5 days

---

### 11 — `has many` Relationships

`belongs to` shipped in item 2, but `has many` was deferred. Without it, you can say
"this comment belongs to a post" but you can't say "a post has many comments" and get
automatic nested endpoints (GET /api/posts/1/comments). That's the natural pair.

```
create a Posts table:
  title
  body
  author belongs to Users

create a Comments table:
  text
  post belongs to Posts

create a Users table:
  name
  email
  posts has many Posts
```

**Speed:** ★★★★  **Safety:** ★★★  **Effort:** 1 day

---

### 12 — Agent Argument Guardrails

`can use:` already whitelists which tools an agent can call (deterministic, code-level).
But there's no constraint on tool **arguments**. If an agent can call `run_command`, it
can pass `rm -rf /` and nothing stops it except the system prompt.

`block arguments matching` would add regex-based input filtering that runs BEFORE tool
execution. No amount of prompt injection bypasses compiled code.

```
agent 'Builder' receives task:
  can use: run_command, read_file, create_file
  block arguments matching 'merge.*main', 'push.*force', 'rm -rf', 'drop table'
  response = ask claude 'Build this feature' with task
  send back response
```

Compiles to: `if (_args.match(/merge.*main|push.*force|rm -rf|drop table/i)) throw new Error('Blocked by guardrail');` before every tool dispatch.

This is a real differentiator. Most agent frameworks do guardrails via prompt. Clear
could do them via compiled code — deterministic, auditable, unbypassable.

**Speed:** ★★★  **Safety:** ★★★★★  **Effort:** 1 day

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
| **Agent guardrails** | **Reconsider** — see item 11 | `can use:` is already a deterministic tool whitelist. Adding `block arguments matching` (regex on tool inputs) would make agents genuinely secure, not just prompt-constrained. Worth doing. |
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
| 5 | Full text search | Exact match only |
| 6 | WebSocket `broadcast` | `subscribe to` works, `broadcast` needs statement parsing |
| 7 | Agent memory + keyword search | ⚠️ Memory save is dead code (return before save) |
| 8 | Agent tool use (`can use:`) | ⚠️ Tool schema serializes as `[object Object]` |
| 9 | String `+` concat bug | Parsed, drops values |
| 10 | Python frontend serving | No static routes |
| 11 | `has many` relationships | Not started — `belongs to` done, `has many` deferred |
| 12 | Agent argument guardrails | Not started — tool whitelist exists, argument regex doesn't |

---

## Stats

- **146 node types** defined in parser
- **1699 compiler tests**, 0 failures
- **9 sandbox integration tests**
- **~241 playground tests** (server, e2e, IDE, agent)
- **Zero npm dependencies** in the compiler
- **Targets:** JS (Express), Python (FastAPI), HTML (DaisyUI + Tailwind v4)
